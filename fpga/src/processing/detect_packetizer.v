`timescale 1ns/1ps
// Converts already-decoded YOLO candidate (CX,CY,W,H,class0,class1) into XYXY + best class.
// This is only the post-decoder packetizer: DFL softmax, box decode and tensor storage are external.
// Coordinates use  fixed-point with COORD_FRAC_BITS fractional bits.
module detect_packetizer #(
    parameter integer COORD_W=16,
    parameter integer IMAGE_W=640,
    parameter integer IMAGE_H=640,
    parameter integer COORD_FRAC_BITS=0,
    parameter integer SCORE_THRESH=32
) (
    input wire clk, rst_n,
    input wire in_valid,
    output wire in_ready,
    input wire [COORD_W-1:0] in_cx, in_cy, in_w, in_h,
    input wire [7:0] in_class0_score, in_class1_score,
    input wire in_last,
    output reg out_valid,
    input wire out_ready,
    output reg [COORD_W-1:0] out_x1, out_y1, out_x2, out_y2,
    output reg [7:0] out_score,
    output reg out_class,
    output reg out_last
);
    localparam [63:0] MAX_X = (64'd1 * IMAGE_W) << COORD_FRAC_BITS;
    localparam [63:0] MAX_Y = (64'd1 * IMAGE_H) << COORD_FRAC_BITS;
    wire [7:0] best_score = (in_class0_score >= in_class1_score) ? in_class0_score : in_class1_score;
    wire best_class = (in_class0_score >= in_class1_score) ? 1'b0 : 1'b1;
    wire signed [COORD_W:0] half_w = $signed({1'b0,in_w}) >>> 1;
    wire signed [COORD_W:0] half_h = $signed({1'b0,in_h}) >>> 1;
    wire signed [COORD_W+1:0] left_calc = $signed({1'b0,in_cx}) - half_w;
    wire signed [COORD_W+1:0] top_calc = $signed({1'b0,in_cy}) - half_h;
    wire signed [COORD_W+1:0] right_calc = $signed({1'b0,in_cx}) + half_w;
    wire signed [COORD_W+1:0] bottom_calc = $signed({1'b0,in_cy}) + half_h;
    wire [COORD_W-1:0] clip_x1 = (left_calc < 0) ? {COORD_W{1'b0}} : left_calc[COORD_W-1:0];
    wire [COORD_W-1:0] clip_y1 = (top_calc < 0) ? {COORD_W{1'b0}} : top_calc[COORD_W-1:0];
    wire [COORD_W-1:0] clip_x2 = (right_calc > MAX_X) ? MAX_X[COORD_W-1:0] : right_calc[COORD_W-1:0];
    wire [COORD_W-1:0] clip_y2 = (bottom_calc > MAX_Y) ? MAX_Y[COORD_W-1:0] : bottom_calc[COORD_W-1:0];
    assign in_ready = !out_valid || out_ready;
    always @(posedge clk or negedge rst_n) begin
        if (!rst_n) begin
            out_valid<=0;out_x1<=0;out_y1<=0;out_x2<=0;out_y2<=0;out_score<=0;out_class<=0;out_last<=0;
        end else if (in_ready) begin
            if (in_valid && (best_score >= SCORE_THRESH)) begin
                out_valid<=1;out_x1<=clip_x1;out_y1<=clip_y1;out_x2<=clip_x2;out_y2<=clip_y2;
                out_score<=best_score;out_class<=best_class;out_last<=in_last;
            end else begin
                out_valid<=0;out_last<=0;
            end
        end
    end
endmodule
