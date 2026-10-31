`timescale 1ns/1ps

module conv_engine_dynamic
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

    output reg [15:0] weight_addr,
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

    localparam [2:0]
        ST_IDLE      = 3'd0,
        ST_WAIT_WIN  = 3'd1,
        ST_FETCH_MEM = 3'd2,
        ST_MAC       = 3'd3,
        ST_DONE      = 3'd4;

    reg [2:0] state;

    reg [15:0] ox;
    reg [15:0] oy;
    reg [31:0] acc;
    reg [31:0] addr_tmp;

    reg [31:0] bias_val;
    reg [31:0] mult_val;
    reg [31:0] weight_val;

    reg [16:0] next_ox;
    reg [16:0] next_oy;

    integer i;

    function automatic [7:0] clamp_q;
        input signed [31:0] x;
        begin
            if (x > 127) clamp_q = 8'd127;
            else if (x < -128) clamp_q = 8'd128;
            else clamp_q = x[7:0];
        end
    endfunction

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
            acc <= 32'd0;
            bias_val <= 32'd0;
            mult_val <= 32'd0;
            weight_val <= 32'd0;
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
                        state <= ST_WAIT_WIN;
                    end
                end

                ST_WAIT_WIN: begin
                    win_ready <= 1'b1;
                    if (win_valid) begin
                        acc <= 32'd0;

                        bias_req <= 1'b1;
                        bias_addr <= ox;

                        mult_req <= 1'b1;
                        mult_addr <= oy;

                        weight_req <= 1'b1;
                        weight_addr <= (oy * IMG_W) + ox;

                        state <= ST_FETCH_MEM;
                    end
                end

                ST_FETCH_MEM: begin
                    bias_req <= 1'b0;
                    mult_req <= 1'b0;
                    weight_req <= 1'b0;

                    if (bias_rvalid) bias_val <= bias_rdata;
                    if (mult_rvalid) mult_val <= mult_rdata;
                    if (weight_rvalid) weight_val <= weight_rdata;

                    if (bias_rvalid && mult_rvalid && weight_rvalid) begin
                        state <= ST_MAC;
                    end
                end

                ST_MAC: begin
                    acc <= 32'd0;

                    for (i = 0; i < WIN_WORDS; i = i + 1) begin
                        acc <= acc + $signed(win_data[(i*Q_BITS)+:Q_BITS]) *
                                     $signed(weight_val[7:0]) *
                                     $signed(mult_val[7:0]);
                    end

                    addr_tmp = ((oy * IMG_W) + ox);

                    out_valid <= 1'b1;
                    out_x <= ox;
                    out_y <= oy;
                    out_c <= 16'd0;
                    out_q <= clamp_q(acc + bias_val);
                    out_addr <= addr_tmp[16:0];

                    state <= ST_DONE;
                end

                ST_DONE: begin
                    done <= 1'b1;

                    next_ox = {1'b0, ox} + {1'b0, p_stride};
                    next_oy = {1'b0, oy} + {1'b0, p_stride};

                    if (next_ox < IMG_W) begin
                        ox <= next_ox[15:0];
                    end
                    else begin
                        ox <= 16'd0;
                        if (next_oy < IMG_H) begin
                            oy <= next_oy[15:0];
                        end
                        else begin
                            oy <= 16'd0;
                            busy <= 1'b0;
                            state <= ST_IDLE;
                        end
                    end

                    if (busy)
                        state <= ST_WAIT_WIN;
                end

                default: begin
                    state <= ST_IDLE;
                end
            endcase
        end
    end
endmodule