`timescale 1ns/1ps

module weight_prefetcher
#(
    parameter integer FLASH_BASE_OFFSET = 32'h0020_0000, // bỏ qua vùng bitstream
    parameter integer WORD_WIDTH        = 32
)
(
    input  wire clk,
    input  wire rst_n,

    input  wire start,
    input  wire [31:0] offset_reg,       // offset dùng để trỏ đúng vùng weight trên flash
    input  wire [31:0] total_words,

    output reg        spi_req,
    output reg [31:0] spi_addr,
    input  wire [31:0] spi_rdata,
    input  wire        spi_rvalid,

    output reg [31:0] weight_word,
    output reg        weight_valid,
    output reg        done
);

    localparam [2:0]
        ST_IDLE  = 3'd0,
        ST_READ  = 3'd1,
        ST_WAIT  = 3'd2,
        ST_DONE  = 3'd3;

    reg [2:0] state;
    reg [31:0] word_count;
    reg [31:0] base_addr;

    // Fix lỗi cũ: không được để spi_addr = 0.
    // Luôn tính địa chỉ dựa trên base offset của vùng Weight trong Flash.
    wire [31:0] effective_addr = base_addr + (word_count << 2);

    always @(posedge clk or negedge rst_n) begin
        if (!rst_n) begin
            state <= ST_IDLE;
            spi_req <= 1'b0;
            spi_addr <= 32'd0;
            weight_word <= 32'd0;
            weight_valid <= 1'b0;
            done <= 1'b0;
            word_count <= 32'd0;
            base_addr <= FLASH_BASE_OFFSET;
        end
        else begin
            spi_req <= 1'b0;
            weight_valid <= 1'b0;
            done <= 1'b0;

            case (state)

                ST_IDLE: begin
                    if (start) begin
                        base_addr <= FLASH_BASE_OFFSET + offset_reg;
                        word_count <= 32'd0;
                        spi_addr <= FLASH_BASE_OFFSET + offset_reg;
                        spi_req <= 1'b1;
                        state <= ST_READ;
                    end
                end

                ST_READ: begin
                    spi_req <= 1'b1;
                    spi_addr <= effective_addr;

                    if (spi_rvalid) begin
                        weight_word <= spi_rdata;
                        weight_valid <= 1'b1;
                        word_count <= word_count + 32'd1;

                        if (word_count + 1 >= total_words) begin
                            state <= ST_DONE;
                        end
                        else begin
                            state <= ST_WAIT;
                        end
                    end
                end

                ST_WAIT: begin
                    spi_req <= 1'b0;
                    spi_addr <= effective_addr;
                    state <= ST_READ;
                end

                ST_DONE: begin
                    done <= 1'b1;
                    weight_valid <= 1'b0;
                    state <= ST_IDLE;
                end

                default: begin
                    state <= ST_IDLE;
                end
            endcase
        end
    end
endmodule