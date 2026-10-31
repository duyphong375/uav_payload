`timescale 1ns/1ps

// mult_mem — bang multiplier + shift cho requantization.
//
// Dinh dang moi entry (DATA_W = 40 bit):
//   [39:32] shift   : so bit dich phai (0..63)
//   [31:0]  mult_q  : multiplier Q31 (signed)
//
// Truoc day chi 32 bit (chi mult), khong co shift -> engine phai hard-code.
// Nay tach ro de sinh tu quant.hex.
//
// Noi dung mac dinh la du lieu MAU (mem[i]=1, shift=31) de mo phong chay duoc.
// PHAI sinh lai tu quant.hex that truoc khi nap flash (xem P4).

module mult_mem
#(
    parameter integer DEPTH = 256,
    parameter integer DATA_W = 40
)
(
    input  wire clk,
    input  wire rst_n,

    input  wire                req,
    input  wire [15:0]         addr,
    output reg [DATA_W-1:0]    rdata,
    output reg                 rvalid
);

    reg [DATA_W-1:0] mem [0:DEPTH-1];

    integer i;
    initial begin
        for (i = 0; i < DEPTH; i = i + 1) begin
            // shift = 31, mult = 1 (Q31 don vi) -> out = (acc*1)>>31
            mem[i] = {8'd31, 32'sd1};
        end
    end

    always @(posedge clk or negedge rst_n) begin
        if (!rst_n) begin
            rdata  <= {DATA_W{1'b0}};
            rvalid <= 1'b0;
        end
        else begin
            rvalid <= 1'b0;
            if (req) begin
                rdata  <= mem[addr];
                rvalid <= 1'b1;
            end
        end
    end
endmodule
