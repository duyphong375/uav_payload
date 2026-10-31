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

    // (cac reg wr_ptr_gray_sync / rd_ptr_gray_sync cu da duoc thay bang
    //  chuoi 2-FF wr_gray_meta/wr_gray_sync_r va rd_gray_meta/rd_gray_sync_r)

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
    // wr_ptr_next_bin: gia tri bin KE TIEP, dung de cap nhat gray cung nhip
    // (truoc day wr_ptr_gray <= bin2gray(wr_ptr_bin) dung gia tri CU, lech 1)
    wire [PTR_W-1:0] wr_ptr_next_bin = wr_ptr_bin + ((wr_en && !full) ? 1'b1 : 1'b0);
    wire [PTR_W-1:0] rd_ptr_next_bin = rd_ptr_bin + ((rd_en && !empty) ? 1'b1 : 1'b0);

    always @(posedge wr_clk or negedge rst_n) begin
        if (!rst_n) begin
            wr_ptr_bin  <= {PTR_W{1'b0}};
            wr_ptr_gray <= {PTR_W{1'b0}};
            overflow    <= 1'b0;
        end
        else begin
            overflow <= 1'b0;

            if (wr_en && !full) begin
                mem[wr_ptr_bin[DEPTH_BITS-1:0]] <= wr_data;
                wr_ptr_bin  <= wr_ptr_next_bin;
                wr_ptr_gray <= bin2gray(wr_ptr_next_bin);
            end
            else if (wr_en && full) begin
                overflow <= 1'b1;
            end
        end
    end

    // --------------------------------------------------------------------
    // Read side
    // --------------------------------------------------------------------
    always @(posedge rd_clk or negedge rst_n) begin
        if (!rst_n) begin
            rd_ptr_bin  <= {PTR_W{1'b0}};
            rd_ptr_gray <= {PTR_W{1'b0}};
            rd_data     <= {DATA_WIDTH{1'b0}};
            underflow   <= 1'b0;
        end
        else begin
            underflow <= 1'b0;

            if (rd_en && !empty) begin
                rd_data     <= mem[rd_ptr_bin[DEPTH_BITS-1:0]];
                rd_ptr_bin  <= rd_ptr_next_bin;
                rd_ptr_gray <= bin2gray(rd_ptr_next_bin);
            end
            else if (rd_en && empty) begin
                underflow <= 1'b1;
            end
        end
    end

    // --------------------------------------------------------------------
    // Pointer synchronization — 2 flip-flop per miền (chuẩn CDC Gray)
    // --------------------------------------------------------------------
    // wr_ptr_gray -> rd_clk (2 FF)
    reg [PTR_W-1:0] wr_gray_meta, wr_gray_sync_r;
    always @(posedge rd_clk or negedge rst_n) begin
        if (!rst_n) begin
            wr_gray_meta   <= {PTR_W{1'b0}};
            wr_gray_sync_r <= {PTR_W{1'b0}};
        end
        else begin
            wr_gray_meta   <= wr_ptr_gray;
            wr_gray_sync_r <= wr_gray_meta;
        end
    end

    // rd_ptr_gray -> wr_clk (2 FF)
    reg [PTR_W-1:0] rd_gray_meta, rd_gray_sync_r;
    always @(posedge wr_clk or negedge rst_n) begin
        if (!rst_n) begin
            rd_gray_meta   <= {PTR_W{1'b0}};
            rd_gray_sync_r <= {PTR_W{1'b0}};
        end
        else begin
            rd_gray_meta   <= rd_ptr_gray;
            rd_gray_sync_r <= rd_gray_meta;
        end
    end

    // Ten cu duoc giu de khong pha vo noi dung ben ngoai module
    wire [PTR_W-1:0] wr_ptr_gray_sync_w = wr_gray_sync_r;  // da dong bo sang rd_clk
    wire [PTR_W-1:0] rd_ptr_gray_sync_w = rd_gray_sync_r;  // da dong bo sang wr_clk

    // --------------------------------------------------------------------
    // Empty / full detection
    //   empty (mien doc):  rd_ptr_gray == wr_ptr_gray DA DONG BO
    //   full  (mien ghi):  wr_ptr_gray == rd_ptr_gray DA DONG BO (bit MSB dao)
    // --------------------------------------------------------------------
    always @(*) begin
        empty = (rd_ptr_gray == wr_ptr_gray_sync_w);
        full  = (wr_ptr_gray[PTR_W-1]     != rd_ptr_gray_sync_w[PTR_W-1]) &&
                (wr_ptr_gray[PTR_W-2:0]   == rd_ptr_gray_sync_w[PTR_W-2:0]);
    end
endmodule