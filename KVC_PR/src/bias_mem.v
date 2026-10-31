`timescale 1ns/1ps

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
            mem[i] = 32'd0;
        end

        // ví dụ: bias cho các output channel
        mem[0] = 32'd1;
        mem[1] = 32'd2;
        mem[2] = 32'd3;
        mem[3] = 32'd4;
    end

    always @(posedge clk or negedge rst_n) begin
        if (!rst_n) begin
            rdata <= {DATA_W{1'b0}};
            rvalid <= 1'b0;
        end
        else begin
            rvalid <= 1'b0;
            if (req) begin
                rdata <= mem[addr];
                rvalid <= 1'b1;
            end
        end
    end
endmodule