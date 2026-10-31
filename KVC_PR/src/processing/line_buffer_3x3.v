`timescale 1ns/1ps
// Streaming 3x3 window generator for one feature-map channel, raster order.
// No backpressure: each in_valid pulse consumes one pixel. FRAME_START resets counters.
// Valid is asserted starting with the third row and third column; top-left padding is
// intentionally not generated here and must be handled by the caller if SAME padding is needed.
module line_buffer_3x3 #(
    parameter integer FRAME_W = 160,
    parameter integer FRAME_H = 160,
    parameter integer DATA_W = 8,
    parameter integer XW = (FRAME_W<=1)?1:$clog2(FRAME_W),
    parameter integer YW = (FRAME_H<=1)?1:$clog2(FRAME_H)
) (
    input wire clk, rst_n,
    input wire frame_start,
    input wire in_valid,
    input wire [DATA_W-1:0] in_data,
    output reg window_valid,
    output reg [DATA_W-1:0] w00,w01,w02,
    output reg [DATA_W-1:0] w10,w11,w12,
    output reg [DATA_W-1:0] w20,w21,w22
);
    reg [DATA_W-1:0] row1 [0:FRAME_W-1];
    reg [DATA_W-1:0] row2 [0:FRAME_W-1];
    reg [XW-1:0] x_count;
    reg [YW-1:0] y_count;
    reg [DATA_W-1:0] top_mid, top_right;
    reg [DATA_W-1:0] mid_mid, mid_right;
    reg [DATA_W-1:0] bot_mid, bot_right;
    wire [DATA_W-1:0] top_at_x = row2[x_count];
    wire [DATA_W-1:0] mid_at_x = row1[x_count];
    always @(posedge clk or negedge rst_n) begin
        if (!rst_n) begin
            x_count <= 0; y_count <= 0; window_valid <= 0;
            w00<=0; w01<=0; w02<=0; w10<=0; w11<=0; w12<=0; w20<=0; w21<=0; w22<=0;
            top_mid<=0; top_right<=0; mid_mid<=0; mid_right<=0; bot_mid<=0; bot_right<=0;
        end else if (frame_start) begin
            x_count <= 0; y_count <= 0; window_valid <= 0;
            w00<=0; w01<=0; w02<=0; w10<=0; w11<=0; w12<=0; w20<=0; w21<=0; w22<=0;
            top_mid<=0; top_right<=0; mid_mid<=0; mid_right<=0; bot_mid<=0; bot_right<=0;
        end else begin
            window_valid <= 1'b0;
            if (in_valid) begin
                row2[x_count] <= mid_at_x;
                row1[x_count] <= in_data;

                w00 <= top_mid;   w01 <= top_right; w02 <= top_at_x;
                w10 <= mid_mid;   w11 <= mid_right; w12 <= mid_at_x;
                w20 <= bot_mid;   w21 <= bot_right; w22 <= in_data;
                top_mid <= top_right; top_right <= top_at_x;
                mid_mid <= mid_right; mid_right <= mid_at_x;
                bot_mid <= bot_right; bot_right <= in_data;

                if ((x_count >= 2) && (y_count >= 2)) window_valid <= 1'b1;
                if (x_count == FRAME_W-1) begin
                    x_count <= 0;
                    if (y_count == FRAME_H-1) y_count <= 0;
                    else y_count <= y_count + 1'b1;
                    top_mid<=0; top_right<=0; mid_mid<=0; mid_right<=0; bot_mid<=0; bot_right<=0;
                end else x_count <= x_count + 1'b1;
            end
        end
    end
endmodule
