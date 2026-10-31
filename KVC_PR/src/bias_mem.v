`timescale 1ns/1ps

// bias_mem — bang bias INT32 cho requantization.
//
// Noi dung mac dinh la du lieu MAU (mem[i]=0).
// PHAI sinh lai tu bias.hex that truoc khi nap flash (xem P4).
//
// Truoc day file nay nap mem[0..3] = 1,2,3,4 — gia tri gia, khong phai
// bias cua model nao. Da xoa de tranh hieu nham la "co du lieu".

module bias_mem
#(
    parameter integer DEPTH = 256,
    parameter integer DATA_W = 32
)
(
    input  wire clk,
    input  wire rst_n,

    input  wire                req,
    input  wire [15:0]         addr,
    output reg [DATA_W-1:0]   rdata,
    output reg                rvalid
);

    reg [DATA_W-1:0] mem [0:DEPTH-1];

    integer i;
    initial begin
        for (i = 0; i < DEPTH; i = i + 1) begin
            mem[i] = {DATA_W{1'b0}};
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
