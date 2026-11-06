`timescale 1ns/1ps
// Generic serial INT8 convolution engine for NCHW tensors.
// Memory read ports may be synchronous (one-cycle). Weights are OIHW flattened.
// Quantization is supplied per output channel through multiplier/shift inputs.
// This engine does NOT contain model-specific weights or quantization constants.
module conv_engine #(
    parameter integer IN_W = 160,
    parameter integer IN_H = 160,
    parameter integer IN_C = 32,
    parameter integer OUT_W = 160,
    parameter integer OUT_H = 160,
    parameter integer OUT_C = 32,
    parameter integer K_SIZE = 1,
    parameter integer STRIDE = 1,
    parameter integer GROUPS = 1,
    parameter integer PAD = 0,
    parameter integer ACC_W = 32,
    parameter integer INPUT_IS_SIGNED = 1,
    parameter integer INPUT_ZERO_POINT = 0,
    parameter integer OUTPUT_IS_SIGNED = 1,
    parameter integer OUTPUT_ZERO_POINT = 0,
    parameter integer ROUND_TIES_EVEN = 0,
    parameter integer INPUT_ADDR_W = 24,
    parameter integer WEIGHT_ADDR_W = 24,
    parameter integer BIAS_ADDR_W = 10,
    parameter integer QUANT_ADDR_W = 10,
    parameter integer OUTPUT_ADDR_W = 24
) (
    input  wire                         clk,
    input  wire                         rst_n,
    input  wire                         start,

    output wire [INPUT_ADDR_W-1:0]      input_addr,
    input  wire [7:0]                   input_data,

    output wire [WEIGHT_ADDR_W-1:0]     weight_addr,
    input  wire signed [7:0]            weight_data,

    output wire [BIAS_ADDR_W-1:0]       bias_addr,
    input  wire signed [31:0]           bias_data,

    output wire [QUANT_ADDR_W-1:0]      quant_addr,
    input  wire signed [31:0]           quant_multiplier,
    input  wire [5:0]                   quant_shift,

    output reg                          output_we,
    output reg [OUTPUT_ADDR_W-1:0]      output_addr,
    output reg [7:0]                    output_data,
    output reg                          busy,
    output reg                          done
);
    localparam integer XW  = (OUT_W <= 1) ? 1 : $clog2(OUT_W);
    localparam integer YW  = (OUT_H <= 1) ? 1 : $clog2(OUT_H);
    localparam integer CW  = (OUT_C <= 1) ? 1 : $clog2(OUT_C);
    localparam integer IC_PER_GROUP = IN_C / GROUPS;
    localparam integer OC_PER_GROUP = OUT_C / GROUPS;
    localparam integer ICW = (IC_PER_GROUP <= 1) ? 1 : $clog2(IC_PER_GROUP);
    localparam integer KW  = (K_SIZE <= 1) ? 1 : $clog2(K_SIZE);

    localparam [3:0] ST_IDLE=4'd0, ST_BIAS_REQ=4'd1, ST_BIAS_WAIT=4'd2,
                     ST_READ_REQ=4'd3, ST_READ_WAIT=4'd4, ST_ACCUM=4'd5,
                     ST_REQUANT=4'd6, ST_ADVANCE=4'd7;

    reg [3:0] state;
    reg [XW-1:0] ox;
    reg [YW-1:0] oy;
    reg [CW-1:0] oc;
    reg [ICW-1:0] ic;
    reg [KW-1:0] kx, ky;
    reg signed [ACC_W-1:0] acc;

    wire signed [31:0] ix_calc;
    wire signed [31:0] iy_calc;
    wire inside_input;
    wire [63:0] input_addr_calc;
    wire [63:0] weight_addr_calc;
    wire [63:0] output_addr_calc;
    wire [31:0] input_channel_calc;
    reg signed [8:0] x_centered;
    wire signed [16:0] product;
    wire signed [16:0] x_mul_ext;
    wire signed [16:0] w_mul_ext;
    wire signed [ACC_W-1:0] product_ext;

    assign ix_calc = ($signed({1'b0, ox}) * STRIDE) + $signed({1'b0, kx}) - PAD;
    assign iy_calc = ($signed({1'b0, oy}) * STRIDE) + $signed({1'b0, ky}) - PAD;
    assign inside_input = (ix_calc >= 0) && (ix_calc < IN_W) &&
                          (iy_calc >= 0) && (iy_calc < IN_H);

    // NCHW input and output; OIHW weights.
    assign input_channel_calc = ((oc / OC_PER_GROUP) * IC_PER_GROUP) + ic;
    assign input_addr_calc = (((input_channel_calc * IN_H) + iy_calc) * IN_W) + ix_calc;
    // Grouped/depthwise OIHW: weight IC dimension is IN_C/GROUPS.
    assign weight_addr_calc = ((((oc * IC_PER_GROUP) + ic) * K_SIZE + ky) * K_SIZE) + kx;
    assign output_addr_calc = (((oc * OUT_H) + oy) * OUT_W) + ox;
    assign input_addr  = inside_input ? input_addr_calc[INPUT_ADDR_W-1:0] : {INPUT_ADDR_W{1'b0}};
    assign weight_addr = weight_addr_calc[WEIGHT_ADDR_W-1:0];
    assign bias_addr   = oc;
    assign quant_addr  = oc;

    always @* begin
        if (!inside_input) begin
            x_centered = 9'sd0; // Real zero at a padded location.
        end else if (INPUT_IS_SIGNED != 0) begin
            x_centered = $signed(input_data) - INPUT_ZERO_POINT;
        end else begin
            x_centered = $signed({1'b0, input_data}) - INPUT_ZERO_POINT;
        end
    end

    assign x_mul_ext = {{8{x_centered[8]}}, x_centered};
    assign w_mul_ext = {{9{weight_data[7]}}, weight_data};
    // The mathematical product is within signed 17-bit range for the configured input types.
    assign product = x_mul_ext * w_mul_ext;
    assign product_ext = {{(ACC_W-17){product[16]}}, product};

    // Symmetric round-to-nearest, ties away from zero, then add output zero point.
    function [7:0] requantize;
        input signed [31:0] acc_value;
        input signed [31:0] multiplier_value;
        input [5:0] shift_value;
        reg signed [63:0] p;
        reg [63:0] mag;
        reg [63:0] qmag;
        reg signed [63:0] q;
        reg signed [63:0] q_with_zp;
        reg [63:0] round_add;
        reg [63:0] remainder;
        begin
            p = $signed({{32{acc_value[31]}},acc_value}) * $signed({{32{multiplier_value[31]}},multiplier_value});
            if (shift_value == 0) begin
                q = p;
            end else begin
                mag = (p < 0) ? -p : p;
                round_add = 64'd1 << (shift_value - 1'b1);
                if (ROUND_TIES_EVEN != 0) begin
                    qmag = mag >> shift_value;
                    remainder = mag & ((64'd1 << shift_value) - 1'b1);
                    if ((remainder > round_add) || ((remainder == round_add) && qmag[0]))
                        qmag = qmag + 1'b1;
                end else begin
                    qmag = (mag + round_add) >> shift_value;
                end
                q = (p < 0) ? -$signed(qmag) : $signed(qmag);
            end
            q_with_zp = q + OUTPUT_ZERO_POINT;
            if (OUTPUT_IS_SIGNED != 0) begin
                if (q_with_zp > 127) requantize = 8'h7f;
                else if (q_with_zp < -128) requantize = 8'h80;
                else requantize = q_with_zp[7:0];
            end else begin
                if (q_with_zp > 255) requantize = 8'hff;
                else if (q_with_zp < 0) requantize = 8'h00;
                else requantize = q_with_zp[7:0];
            end
        end
    endfunction

    always @(posedge clk or negedge rst_n) begin
        if (!rst_n) begin
            state       <= ST_IDLE;
            ox          <= 0;
            oy          <= 0;
            oc          <= 0;
            ic          <= 0;
            kx          <= 0;
            ky          <= 0;
            acc         <= 0;
            output_we   <= 1'b0;
            output_addr <= 0;
            output_data <= 0;
            busy        <= 1'b0;
            done        <= 1'b0;
        end else begin
            output_we <= 1'b0;
            done      <= 1'b0;
            case (state)
                ST_IDLE: begin
                    if (start && !busy) begin
                        ox <= 0; oy <= 0; oc <= 0;
                        ic <= 0; kx <= 0; ky <= 0;
                        busy <= 1'b1;
                        state <= ST_BIAS_REQ;
                    end
                end
                ST_BIAS_REQ: begin
                    // Bias and per-channel quant ROMs sample their addresses here.
                    state <= ST_BIAS_WAIT;
                end
                ST_BIAS_WAIT: begin
                    acc <= bias_data;
                    ic <= 0; kx <= 0; ky <= 0;
                    state <= ST_READ_REQ;
                end
                ST_READ_REQ: state <= ST_READ_WAIT;
                ST_READ_WAIT: state <= ST_ACCUM;
                ST_ACCUM: begin
                    acc <= acc + product_ext;
                    if ((ic == IC_PER_GROUP-1) && (ky == K_SIZE-1) && (kx == K_SIZE-1)) begin
                        state <= ST_REQUANT;
                    end else begin
                        if (kx < K_SIZE-1) begin
                            kx <= kx + 1'b1;
                        end else begin
                            kx <= 0;
                            if (ky < K_SIZE-1) begin
                                ky <= ky + 1'b1;
                            end else begin
                                ky <= 0;
                                ic <= ic + 1'b1;
                            end
                        end
                        state <= ST_READ_REQ;
                    end
                end
                ST_REQUANT: begin
                    // acc already includes the final product from the prior ST_ACCUM edge.
                    output_data <= requantize(acc, quant_multiplier, quant_shift);
                    output_addr <= output_addr_calc[OUTPUT_ADDR_W-1:0];
                    output_we <= 1'b1;
                    state <= ST_ADVANCE;
                end
                ST_ADVANCE: begin
                    if (ox < OUT_W-1) begin
                        ox <= ox + 1'b1;
                        state <= ST_BIAS_REQ;
                    end else begin
                        ox <= 0;
                        if (oy < OUT_H-1) begin
                            oy <= oy + 1'b1;
                            state <= ST_BIAS_REQ;
                        end else begin
                            oy <= 0;
                            if (oc < OUT_C-1) begin
                                oc <= oc + 1'b1;
                                state <= ST_BIAS_REQ;
                            end else begin
                                busy <= 1'b0;
                                done <= 1'b1;
                                state <= ST_IDLE;
                            end
                        end
                    end
                end
                default: begin
                    state <= ST_IDLE;
                    busy <= 1'b0;
                end
            endcase
        end
    end
endmodule
