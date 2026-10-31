`timescale 1ns/1ps
// Quantized activation operator.
// MODE=0: ReLU for signed INT8; MODE=1: SiLU from a calibrated 256-entry LUT;
// MODE=2: identity. SiLU LUT address is the raw input byte (00..FF).
module activation_int8 #(
    parameter integer MODE = 0,
    parameter LUT_FILE = "silu_lut.hex"
) (
    input  wire [7:0] x_in,
    output reg  [7:0] y_out
);
    reg [7:0] silu_lut [0:255];
    integer i;
    initial begin
        for (i=0; i<256; i=i+1) silu_lut[i] = 8'h00;
        if (MODE == 1) $readmemh(LUT_FILE, silu_lut);
    end
    always @* begin
        case (MODE)
            0: y_out = $signed(x_in) < 0 ? 8'h00 : x_in;
            1: y_out = silu_lut[x_in];
            default: y_out = x_in;
        endcase
    end
endmodule
