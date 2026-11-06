`timescale 1ns/1ps

module weight_mem
#(
    parameter integer DEPTH = 4096,
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

    // Không khởi tạo toàn bộ RAM bằng for-loop lớn trong synthesis.
    // Để mặc định = 0 hoặc khởi tạo vài địa chỉ nhỏ nếu cần.
    initial begin
        mem[0] = 32'd1;
        mem[1] = 32'd1;
        mem[2] = 32'd1;
        mem[3] = 32'd1;
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