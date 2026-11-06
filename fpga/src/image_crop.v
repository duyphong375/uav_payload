`timescale 1ns/1ps
// Crop ROI: cắt vùng [CROP_X, CROP_X+CROP_W) × [CROP_Y, CROP_Y+CROP_H)
module image_crop #(
    parameter integer IN_W  = 640,
    parameter integer IN_H  = 480,
    parameter integer CROP_X = 160,
    parameter integer CROP_Y = 80,
    parameter integer CROP_W = 320,
    parameter integer CROP_H = 320
) (
    input  wire        clk, rst_n,
    input  wire [15:0] in_pixel,
    input  wire        in_valid,
    input  wire        frame_start,
    output reg  [15:0] out_pixel,
    output reg         out_valid,
    output reg         out_frame_start
);
    reg [9:0] x, y;
    reg       first_pixel;
    
    wire in_crop = (x >= CROP_X) && (x < CROP_X + CROP_W) &&
                   (y >= CROP_Y) && (y < CROP_Y + CROP_H);
    
    always @(posedge clk or negedge rst_n) begin
        if (!rst_n) begin
            x <= 0; y <= 0; out_valid <= 0; out_pixel <= 0;
            out_frame_start <= 0; first_pixel <= 0;
        end else begin
            out_valid <= 0;
            out_frame_start <= 0;
            
            if (frame_start) begin
                x <= 0; y <= 0;
                first_pixel <= 1;
            end else if (in_valid) begin
                if (in_crop) begin
                    out_pixel <= in_pixel;
                    out_valid <= 1;
                    if (first_pixel) begin
                        out_frame_start <= 1;
                        first_pixel <= 0;
                    end
                end
                
                if (x == IN_W - 1) begin
                    x <= 0;
                    if (y == IN_H - 1) y <= 0;
                    else y <= y + 1;
                end else x <= x + 1;
            end
        end
    end
endmodule