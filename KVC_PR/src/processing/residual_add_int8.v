`timescale 1ns/1ps
// Saturating residual Add for two signed INT8 tensors with IDENTICAL quantization
// scale and zero point. Requantize operands first if their scales differ.
module residual_add_int8 (
    input  wire [7:0] a,
    input  wire [7:0] b,
    output reg  [7:0] y
);
    reg signed [8:0] sum;
    always @* begin
        sum = $signed(a) + $signed(b);
        if (sum > 127) y = 8'h7f;
        else if (sum < -128) y = 8'h80;
        else y = sum[7:0];
    end
endmodule
