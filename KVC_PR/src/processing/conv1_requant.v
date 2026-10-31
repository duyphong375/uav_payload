`timescale 1ns/1ps

module conv1_requant #(
    parameter integer ACC_W = 32,
    parameter integer F = 30
)(  input wire [4:0] channel_idx,
    input  wire signed [ACC_W-1:0] acc_in,
    input  wire signed [31:0]      multiplier, // NHẬN TỪ NGOÀI VÀO
    input  wire signed [7:0]       zero_point_out, // Zero-point đầu ra
    output reg  [7:0]              y_out
);

    reg signed [63:0] product;
    reg signed [63:0] shifted;
    reg signed [63:0] quantized;

    always @(*) begin
        product = $signed(acc_in) * $signed(multiplier);

        // Round to nearest, ties away from zero.
        if (product >= 0) begin
            shifted = (product + (64'sd1 <<< (F-1))) >>> F;
        end else begin
            shifted = -(((-product) + (64'sd1 <<< (F-1))) >>> F);
        end
        
        // Cộng zero-point đầu ra (có thể âm hoặc dương)
        quantized = shifted + $signed(zero_point_out);

        // Clamp
        if (quantized < 0)
            y_out = 8'd0;
        else if (quantized > 255)
            y_out = 8'd255;
        else
            y_out = quantized[7:0];
    end

endmodule