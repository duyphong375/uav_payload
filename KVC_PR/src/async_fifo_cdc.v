`timescale 1ns/1ps

module async_fifo_cdc
#(
    parameter integer DEPTH_BITS = 8,     // FIFO depth = 2^DEPTH_BITS
    parameter integer DATA_WIDTH = 32
)
(
    input  wire wr_clk,
    input  wire rd_clk,
    input  wire rst_n,

    input  wire                     wr_en,
    input  wire [DATA_WIDTH-1:0]    wr_data,
    output reg                      full,
    output reg                      overflow,

    input  wire                     rd_en,
    output reg [DATA_WIDTH-1:0]     rd_data,
    output reg                      empty,
    output reg                      underflow
);

    localparam integer DEPTH = 1 << DEPTH_BITS;
    localparam integer PTR_W  = DEPTH_BITS + 1;

    reg [PTR_W-1:0] wr_ptr_bin;
    reg [PTR_W-1:0] wr_ptr_gray;
    reg [PTR_W-1:0] rd_ptr_bin;
    reg [PTR_W-1:0] rd_ptr_gray;

    reg [PTR_W-1:0] wr_ptr_gray_sync;
    reg [PTR_W-1:0] rd_ptr_gray_sync;

    reg [DATA_WIDTH-1:0] mem [0:DEPTH-1];

    function [PTR_W-1:0] bin2gray;
        input [PTR_W-1:0] b;
        begin
            bin2gray = b ^ (b >> 1);
        end
    endfunction

    function [PTR_W-1:0] gray2bin;
        input [PTR_W-1:0] g;
        reg [PTR_W-1:0] b;
        integer i;
        begin
            b = g;
            for (i = 0; i < PTR_W; i = i + 1) begin
                b = b ^ (b >> 1);
            end
            gray2bin = b;
        end
    endfunction

    // --------------------------------------------------------------------
    // Write side
    // --------------------------------------------------------------------
    always @(posedge wr_clk or negedge rst_n) begin
        if (!rst_n) begin
            wr_ptr_bin <= {PTR_W{1'b0}};
            wr_ptr_gray <= {PTR_W{1'b0}};
            overflow <= 1'b0;
        end
        else begin
            overflow <= 1'b0;

            if (wr_en && !full) begin
                mem[wr_ptr_bin[DEPTH_BITS-1:0]] <= wr_data;
                wr_ptr_bin <= wr_ptr_bin + 1'b1;
            end
            else if (wr_en && full) begin
                overflow <= 1'b1;
            end

            wr_ptr_gray <= bin2gray(wr_ptr_bin);
        end
    end

    // --------------------------------------------------------------------
    // Read side
    // --------------------------------------------------------------------
    always @(posedge rd_clk or negedge rst_n) begin
        if (!rst_n) begin
            rd_ptr_bin <= {PTR_W{1'b0}};
            rd_ptr_gray <= {PTR_W{1'b0}};
            rd_data <= {DATA_WIDTH{1'b0}};
            underflow <= 1'b0;
        end
        else begin
            underflow <= 1'b0;

            if (rd_en && !empty) begin
                rd_data <= mem[rd_ptr_bin[DEPTH_BITS-1:0]];
                rd_ptr_bin <= rd_ptr_bin + 1'b1;
            end
            else if (rd_en && empty) begin
                underflow <= 1'b1;
            end

            rd_ptr_gray <= bin2gray(rd_ptr_bin);
        end
    end

    // --------------------------------------------------------------------
    // Pointer synchronization
    // --------------------------------------------------------------------
    always @(posedge rd_clk or negedge rst_n) begin
        if (!rst_n) begin
            wr_ptr_gray_sync <= {PTR_W{1'b0}};
        end
        else begin
            wr_ptr_gray_sync <= wr_ptr_gray;
        end
    end

    always @(posedge wr_clk or negedge rst_n) begin
        if (!rst_n) begin
            rd_ptr_gray_sync <= {PTR_W{1'b0}};
        end
        else begin
            rd_ptr_gray_sync <= rd_ptr_gray;
        end
    end

    // --------------------------------------------------------------------
    // Empty / full detection
    // --------------------------------------------------------------------
    always @(*) begin
        empty = (wr_ptr_gray == rd_ptr_gray_sync);
        full  = (wr_ptr_gray_sync[PTR_W-1] != rd_ptr_gray[PTR_W-1]) &&
                (wr_ptr_gray_sync[PTR_W-2:0] == rd_ptr_gray[PTR_W-2:0]);
    end
endmodule