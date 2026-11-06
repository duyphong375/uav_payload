`timescale 1ns/1ps

module line_buffer_3x3
#(
    parameter integer MAX_W  = 640,
    parameter integer DATA_W = 8,
    parameter integer ADDR_W = 10
)
(
    input  wire clk,
    input  wire rst_n,

    input  wire               wr_en,
    input  wire [ADDR_W-1:0]  wr_x,
    input  wire [DATA_W-1:0]  wr_data,

    input  wire [ADDR_W-1:0]  rd_x,
    input  wire [ADDR_W-1:0]  rd_y,

    output reg [DATA_W-1:0] win_00, win_01, win_02,
    output reg [DATA_W-1:0] win_10, win_11, win_12,
    output reg [DATA_W-1:0] win_20, win_21, win_22
);

    reg [DATA_W-1:0] line0 [0:MAX_W-1];
    reg [DATA_W-1:0] line1 [0:MAX_W-1];
    reg [DATA_W-1:0] line2 [0:MAX_W-1];

    reg [DATA_W-1:0] p00, p01, p02;
    reg [DATA_W-1:0] p10, p11, p12;
    reg [DATA_W-1:0] p20, p21, p22;

    function automatic [ADDR_W:0] inc_addr;
        input [ADDR_W-1:0] x;
        reg [ADDR_W:0] tmp;
        begin
            tmp = {1'b0, x} + 1'b1;
            inc_addr = tmp;
        end
    endfunction

    function automatic [ADDR_W:0] dec_addr;
        input [ADDR_W-1:0] x;
        reg [ADDR_W:0] tmp;
        begin
            if (x == 0)
                tmp = {1'b0, MAX_W - 1};
            else
                tmp = {1'b0, x} - 1'b1;
            dec_addr = tmp;
        end
    endfunction

    wire [ADDR_W:0] x_l_tmp = dec_addr(rd_x);
    wire [ADDR_W:0] x_r_tmp = inc_addr(rd_x);

    wire [ADDR_W-1:0] x_l = x_l_tmp[ADDR_W-1:0];
    wire [ADDR_W-1:0] x_c = rd_x;
    wire [ADDR_W-1:0] x_r = x_r_tmp[ADDR_W-1:0];

    always @(posedge clk or negedge rst_n) begin
        if (!rst_n) begin
            win_00 <= {DATA_W{1'b0}}; win_01 <= {DATA_W{1'b0}}; win_02 <= {DATA_W{1'b0}};
            win_10 <= {DATA_W{1'b0}}; win_11 <= {DATA_W{1'b0}}; win_12 <= {DATA_W{1'b0}};
            win_20 <= {DATA_W{1'b0}}; win_21 <= {DATA_W{1'b0}}; win_22 <= {DATA_W{1'b0}};
        end
        else begin
            if (wr_en) begin
                line0[wr_x] <= line1[wr_x];
                line1[wr_x] <= line2[wr_x];
                line2[wr_x] <= wr_data;
            end

            p00 <= line0[x_l];
            p01 <= line0[x_c];
            p02 <= line0[x_r];

            p10 <= line1[x_l];
            p11 <= line1[x_c];
            p12 <= line1[x_r];

            p20 <= line2[x_l];
            p21 <= line2[x_c];
            p22 <= line2[x_r];

            win_00 <= p00; win_01 <= p01; win_02 <= p02;
            win_10 <= p10; win_11 <= p11; win_12 <= p12;
            win_20 <= p20; win_21 <= p21; win_22 <= p22;
        end
    end
endmodule