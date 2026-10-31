`timescale 1ns/1ps
// Convolution + requantization + optional activation wrapper.
// BatchNorm must already be folded into Conv weights/bias in the exported model.
module conv_bn_act #(
    parameter integer IN_W=160, IN_H=160, IN_C=32,
    parameter integer OUT_W=160, OUT_H=160, OUT_C=32,
    parameter integer K_SIZE=1, STRIDE=1, GROUPS=1, PAD=0,
    parameter integer ACC_W=32,
    parameter integer INPUT_IS_SIGNED=1, INPUT_ZERO_POINT=0,
    parameter integer OUTPUT_IS_SIGNED=1, OUTPUT_ZERO_POINT=0, ROUND_TIES_EVEN=0,
    parameter integer ACT_MODE=0,
    parameter LUT_FILE="silu_lut.hex",
    parameter integer INPUT_ADDR_W=24, WEIGHT_ADDR_W=24,
    parameter integer BIAS_ADDR_W=10, QUANT_ADDR_W=10, OUTPUT_ADDR_W=24
) (
    input wire clk, rst_n, start,
    output wire [INPUT_ADDR_W-1:0] input_addr,
    input wire [7:0] input_data,
    output wire [WEIGHT_ADDR_W-1:0] weight_addr,
    input wire signed [7:0] weight_data,
    output wire [BIAS_ADDR_W-1:0] bias_addr,
    input wire signed [31:0] bias_data,
    output wire [QUANT_ADDR_W-1:0] quant_addr,
    input wire signed [31:0] quant_multiplier,
    input wire [5:0] quant_shift,
    output wire output_we,
    output wire [OUTPUT_ADDR_W-1:0] output_addr,
    output wire [7:0] output_data,
    output wire busy, done
);
    wire [7:0] conv_data;
    conv_engine #(
        .IN_W(IN_W), .IN_H(IN_H), .IN_C(IN_C),
        .OUT_W(OUT_W), .OUT_H(OUT_H), .OUT_C(OUT_C),
        .K_SIZE(K_SIZE), .STRIDE(STRIDE), .GROUPS(GROUPS), .PAD(PAD), .ACC_W(ACC_W),
        .INPUT_IS_SIGNED(INPUT_IS_SIGNED), .INPUT_ZERO_POINT(INPUT_ZERO_POINT),
        .OUTPUT_IS_SIGNED(OUTPUT_IS_SIGNED), .OUTPUT_ZERO_POINT(OUTPUT_ZERO_POINT), .ROUND_TIES_EVEN(ROUND_TIES_EVEN),
        .INPUT_ADDR_W(INPUT_ADDR_W), .WEIGHT_ADDR_W(WEIGHT_ADDR_W),
        .BIAS_ADDR_W(BIAS_ADDR_W), .QUANT_ADDR_W(QUANT_ADDR_W), .OUTPUT_ADDR_W(OUTPUT_ADDR_W)
    ) u_conv_engine (
        .clk(clk), .rst_n(rst_n), .start(start),
        .input_addr(input_addr), .input_data(input_data),
        .weight_addr(weight_addr), .weight_data(weight_data),
        .bias_addr(bias_addr), .bias_data(bias_data),
        .quant_addr(quant_addr), .quant_multiplier(quant_multiplier), .quant_shift(quant_shift),
        .output_we(output_we), .output_addr(output_addr), .output_data(conv_data),
        .busy(busy), .done(done)
    );
    activation_int8 #(.MODE(ACT_MODE), .LUT_FILE(LUT_FILE)) u_activation (
        .x_in(conv_data), .y_out(output_data)
    );
endmodule
