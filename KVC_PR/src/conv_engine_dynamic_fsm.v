`timescale 1ns/1ps

module conv_engine_dynamic_fsm
#(
    parameter integer KERNEL = 3,
    parameter integer IN_C   = 3,
    parameter integer OUT_C  = 32,
    parameter integer IMG_W  = 160,
    parameter integer IMG_H  = 160,
    parameter integer Q_BITS = 8
)
(
    input  wire clk,
    input  wire rst_n,
    input  wire start,

    input  wire [15:0] p_stride,
    input  wire [15:0] p_pad,
    input  wire [23:0] p_weight_base,
    input  wire [23:0] p_bias_base,
    input  wire [23:0] p_quant_base,

    input  wire win_valid,
    output reg  win_ready,
    input  wire [(KERNEL*KERNEL*IN_C*Q_BITS)-1:0] win_data,

    output reg [15:0] bias_addr,
    input  wire [31:0] bias_rdata,
    input  wire        bias_rvalid,
    output reg        bias_req,

    output reg [15:0] mult_addr,
    input  wire [31:0] mult_rdata,
    input  wire        mult_rvalid,
    output reg        mult_req,

    output reg [23:0] weight_addr,
    input  wire [31:0] weight_rdata,
    input  wire        weight_rvalid,
    output reg        weight_req,

    output reg        out_valid,
    output reg [15:0] out_x,
    output reg [15:0] out_y,
    output reg [15:0] out_c,
    output reg [7:0]  out_q,
    output reg [16:0] out_addr,

    output reg busy,
    output reg done
);

    localparam integer WIN_WORDS = KERNEL * KERNEL * IN_C;

    localparam [3:0]
        ST_IDLE      = 4'd0,
        ST_WAIT_WIN  = 4'd1,
        ST_PREP      = 4'd2,
        ST_MAC       = 4'd3,
        ST_EMIT      = 4'd4,
        ST_NEXT_OC   = 4'd5;

    reg [3:0] state;

    reg [15:0] ox;
    reg [15:0] oy;
    reg [15:0] oc;
    reg [15:0] kx;
    reg [15:0] ky;
    reg [15:0] ic;

    reg signed [31:0] sum_acc;
    reg signed [31:0] bias_val;
    reg signed [31:0] mult_val;
    reg signed [31:0] weight_val;

    reg [31:0] addr_tmp32;
    reg [31:0] weight_addr32;

    reg [7:0] win_vec [0:26];
    integer k;

    function automatic [7:0] clamp_q;
        input signed [31:0] v;
        begin
            if (v > 127) clamp_q = 8'd127;
            else if (v < -128) clamp_q = 8'd128;
            else clamp_q = v[7:0];
        end
    endfunction

    always @(*) begin
        for (k = 0; k < 27; k = k + 1) begin
            win_vec[k] = win_data[(k * 8) +: 8];
        end
    end

    always @(posedge clk or negedge rst_n) begin
        if (!rst_n) begin
            state <= ST_IDLE;
            win_ready <= 1'b1;
            bias_req <= 1'b0;
            mult_req <= 1'b0;
            weight_req <= 1'b0;

            bias_addr <= 16'd0;
            mult_addr <= 16'd0;
            weight_addr <= 16'd0;

            out_valid <= 1'b0;
            out_x <= 16'd0;
            out_y <= 16'd0;
            out_c <= 16'd0;
            out_q <= 8'd0;
            out_addr <= 17'd0;

            busy <= 1'b0;
            done <= 1'b0;

            ox <= 16'd0;
            oy <= 16'd0;
            oc <= 16'd0;
            kx <= 16'd0;
            ky <= 16'd0;
            ic <= 16'd0;

            sum_acc <= 32'sd0;
            bias_val <= 32'sd0;
            mult_val <= 32'sd0;
            weight_val <= 32'sd0;
        end
        else begin
            out_valid <= 1'b0;
            done <= 1'b0;

            case (state)
                ST_IDLE: begin
                    win_ready <= 1'b1;
                    if (start) begin
                        busy <= 1'b1;
                        ox <= 16'd0;
                        oy <= 16'd0;
                        oc <= 16'd0;
                        kx <= 16'd0;
                        ky <= 16'd0;
                        ic <= 16'd0;
                        sum_acc <= 32'sd0;
                        state <= ST_WAIT_WIN;
                    end
                end

                ST_WAIT_WIN: begin
                    win_ready <= 1'b1;
                    if (win_valid) begin
                        sum_acc <= 32'sd0;
                        kx <= 16'd0;
                        ky <= 16'd0;
                        ic <= 16'd0;
                        state <= ST_PREP;
                    end
                end

                ST_PREP: begin
                    weight_addr32 = p_weight_base + ((oc * IN_C * KERNEL * KERNEL) +
                                   (ic * KERNEL * KERNEL) +
                                   (ky * KERNEL) + kx);

                    weight_addr <= weight_addr32[15:0];
                    bias_addr <= oc;
                    mult_addr <= oc;

                    weight_req <= 1'b1;
                    bias_req <= 1'b1;
                    mult_req <= 1'b1;

                    state <= ST_MAC;
                end

                ST_MAC: begin
                    weight_req <= 1'b0;
                    bias_req <= 1'b0;
                    mult_req <= 1'b0;

                    if (weight_rvalid) weight_val <= $signed(weight_rdata);
                    if (bias_rvalid) bias_val <= $signed(bias_rdata);
                    if (mult_rvalid) mult_val <= $signed(mult_rdata);

                    if (weight_rvalid && bias_rvalid && mult_rvalid) begin
                        sum_acc <= sum_acc +
                            ($signed(win_vec[(ic * 9) + (ky * 3) + kx]) *
                             $signed(weight_val[7:0]));

                        if (kx == KERNEL - 1) begin
                            kx <= 16'd0;
                            if (ky == KERNEL - 1) begin
                                ky <= 16'd0;
                                if (ic == IN_C - 1) begin
                                    ic <= 16'd0;
                                    state <= ST_EMIT;
                                end
                                else begin
                                    ic <= ic + 16'd1;
                                    state <= ST_PREP;
                                end
                            end
                            else begin
                                ky <= ky + 16'd1;
                                state <= ST_PREP;
                            end
                        end
                        else begin
                            kx <= kx + 16'd1;
                            state <= ST_PREP;
                        end
                    end
                end

                ST_EMIT: begin
                    addr_tmp32 = ((oy * IMG_W) + ox);

                    out_valid <= 1'b1;
                    out_x <= ox;
                    out_y <= oy;
                    out_c <= oc;
                    out_q <= clamp_q((sum_acc * mult_val) + bias_val);
                    out_addr <= addr_tmp32[16:0];
                    done <= 1'b1;

                    if (oc == OUT_C - 1) begin
                        oc <= 16'd0;
                        if (ox + p_stride < IMG_W) begin
                            ox <= ox + p_stride;
                        end
                        else begin
                            ox <= 16'd0;
                            if (oy + p_stride < IMG_H) begin
                                oy <= oy + p_stride;
                            end
                            else begin
                                oy <= 16'd0;
                                busy <= 1'b0;
                                state <= ST_IDLE;
                            end
                        end
                    end
                    else begin
                        oc <= oc + 16'd1;
                        sum_acc <= 32'sd0;
                        state <= ST_PREP;
                    end
                end

                default: begin
                    state <= ST_IDLE;
                end
            endcase
        end
    end
endmodule