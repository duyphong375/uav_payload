`timescale 1ns/1ps
module activation_dynamic (
    input wire [7:0] x_in, input wire [1:0] act_mode, output reg [7:0] y_out
);
    reg [7:0] silu_lut [0:255];
    initial begin $readmemh("silu_lut.hex", silu_lut); end
    always @(*) begin
        case (act_mode)
            2'd0: y_out = (x_in[7]) ? 8'h00 : x_in;
            2'd1: y_out = silu_lut[x_in];
            default: y_out = x_in;
        endcase
    end
endmodule
