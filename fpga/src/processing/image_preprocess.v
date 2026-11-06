// -----------------------------------------------------------------------------
// Module: image_preprocess.v
// Author: Vững (assistant)
// Date:   2026-10-15
// Desc:   Letterbox / resize (nearest-neighbor, integer scale) từ INPUT -> OUTPUT
//         - Streaming interface but implementation uses full-frame buffer: capture whole
//           input frame then produce full output frame (padding + scaling).
//         - Supports integer upscaling (scale_s = OUTPUT_W / INPUT_W when both dims match).
//         - If non-integer scale required on hardware, replace with Gowin Scaler Lite IP
//           or implement streaming bilinear with external frame RAM.
// Notes:
//  - This implementation is intended for correctness & testing. On real FPGA with large
//    input sizes (e.g., 320x240), storing full frame on internal BSRAM may not fit.
//    Use external memory or line-based scaler for resource-constrained designs.
//  - [SỬA] Verilog-2001: KHÔNG khai báo biến trong always block.
// -----------------------------------------------------------------------------
`timescale 1ns/1ps
module image_preprocess #(
    parameter integer INPUT_W  = 320,
    parameter integer INPUT_H  = 240,
    parameter integer OUTPUT_W = 640,
    parameter integer OUTPUT_H = 640,
    parameter integer PADDING_COLOR = 8'd114   // single-channel pad color 0..255
) (
    input  wire        clk,              // system clock (100MHz)
    input  wire        rst_n,
    input  wire [15:0] pixel_in,         // RGB565 input
    input  wire        pixel_valid_in,
    input  wire        frame_start_in,   // pulse at frame start
    output reg  [15:0] pixel_out,
    output reg         pixel_valid_out,
    output reg         frame_start_out
);

    // Derived constants
    // Check integer scale possibility
    localparam integer SCALE_W_NUM = OUTPUT_W / INPUT_W;
    localparam integer SCALE_H_NUM = OUTPUT_H / INPUT_H;
    // Only support integer uniform scale (SCALE_W_NUM == SCALE_H_NUM and >=1)
    localparam integer SCALE_OK = ( (OUTPUT_W % INPUT_W)==0 && (OUTPUT_H % INPUT_H)==0 && (SCALE_W_NUM==SCALE_H_NUM) ) ? 1 : 0;
    localparam integer SCALE_S = (SCALE_OK) ? SCALE_W_NUM : 1;

    // scaled image size
    localparam integer SCALED_W = INPUT_W * SCALE_S;
    localparam integer SCALED_H = INPUT_H * SCALE_S;

    // padding sizes (center)
    localparam integer PAD_X = (OUTPUT_W > SCALED_W) ? ((OUTPUT_W - SCALED_W) / 2) : 0;
    localparam integer PAD_Y = (OUTPUT_H > SCALED_H) ? ((OUTPUT_H - SCALED_H) / 2) : 0;

    // Frame buffer to store input frame: depth = INPUT_W * INPUT_H
    // WARNING: Large sizes use much memory. For test/simulation this is fine.
    // On real hardware consider external RAM or streaming scaler IP.
    localparam integer FRAME_PIXELS = INPUT_W * INPUT_H;
    reg [15:0] frame_mem [0:FRAME_PIXELS-1];

    // internal capture pointers & flags
    reg [31:0] capture_idx; // 0..FRAME_PIXELS-1
    reg capturing;
    reg processing;

    // output generation pointers
    reg [31:0] out_x;
    reg [31:0] out_y;

    // compute pad and scaled sizes as regs (for clarity)
/*    integer i;
    initial begin
        // nothing to init here besides memory contents optionally
        for (i = 0; i < FRAME_PIXELS; i = i + 1) frame_mem[i] = 16'h0000;
    end
*/
    // [SỬA] Khai báo các biến tạm RA NGOÀI always block (Verilog-2001)
    reg [15:0] outpix;
    reg        in_image_region;
    reg [31:0] sx, sy;
    reg [31:0] src_idx;
    reg [4:0]  r5;
    reg [5:0]  g6;
    reg [4:0]  b5;

    // Pixel capture: capture entire input frame when frame_start_in asserted
    // Expect that pixel_valid_in will provide exactly INPUT_W*INPUT_H pixels for the frame
    always @(posedge clk or negedge rst_n) begin
        if (!rst_n) begin
            capture_idx <= 32'd0;
            capturing <= 1'b0;
            processing <= 1'b0;
            pixel_valid_out <= 1'b0;
            pixel_out <= 16'h0000;
            frame_start_out <= 1'b0;
            out_x <= 32'd0;
            out_y <= 32'd0;
        end else begin
            // default
            pixel_valid_out <= 1'b0;
            frame_start_out <= 1'b0;

            if (!capturing && !processing) begin
                // Idle state: wait for frame_start_in pulse
                if (frame_start_in) begin
                    capturing <= 1'b1;
                    capture_idx <= 32'd0;
                end
            end

            // Capture incoming pixels to frame_mem
            if (capturing) begin
                if (pixel_valid_in) begin
                    if (capture_idx < FRAME_PIXELS) begin
                        frame_mem[capture_idx] <= pixel_in;
                        capture_idx <= capture_idx + 1;
                    end
                    // if we've captured the whole frame, end capture and begin processing
                    if (capture_idx == FRAME_PIXELS - 1) begin
                        capturing <= 1'b0;
                        processing <= 1'b1;
                        // initialize output pointers
                        out_x <= 32'd0;
                        out_y <= 32'd0;
                        // issue frame_start_out on first output pixel when produced
                    end
                end
            end else if (processing) begin
                // Generate output frame pixel by pixel (raster order)
                // For each out_y in 0..OUTPUT_H-1 and out_x in 0..OUTPUT_W-1:
                //   if in padding region -> output padding color expanded to RGB565
                //   else -> compute src_x = floor((out_x - PAD_X)/SCALE_S), src_y similar
                // Note: SCALE_S assumed positive integer (1 or >1)
                // [SỬA] Không khai báo reg trong block — dùng biến ngoài

                // Determine if current output coord lies within image area
                if ((out_x >= PAD_X) && (out_x < PAD_X + SCALED_W) && (out_y >= PAD_Y) && (out_y < PAD_Y + SCALED_H))
                    in_image_region = 1'b1;
                else
                    in_image_region = 1'b0;

                if (!in_image_region) begin
                    // padding pixel: use PADDING_COLOR for R,G,B -> convert to RGB565 approx
                    // PADDING_COLOR is 8-bit gray; replicate to 5/6/5 bits accordingly
                    // Convert 8-bit gray to RGB565: R[4:0] = gray[7:3], G[5:0] = gray[7:2], B[4:0] = gray[7:3]
                    r5 = PADDING_COLOR[7:3];
                    g6 = PADDING_COLOR[7:2];
                    b5 = PADDING_COLOR[7:3];
                    outpix = {r5, g6, b5};
                end else begin
                    // map to source pixel (nearest neighbor given integer scale)
                    sx = (out_x - PAD_X) / SCALE_S;
                    sy = (out_y - PAD_Y) / SCALE_S;
                    src_idx = sy * INPUT_W + sx;
                    outpix = frame_mem[src_idx];
                end

                // Output pixel
                pixel_out <= outpix;
                pixel_valid_out <= 1'b1;
                // pulse frame_start_out for first output pixel of frame
                if ((out_x == 0) && (out_y == 0)) frame_start_out <= 1'b1;

                // advance output coordinates
                if (out_x == (OUTPUT_W - 1)) begin
                    out_x <= 32'd0;
                    if (out_y == (OUTPUT_H - 1)) begin
                        // finished output frame
                        processing <= 1'b0;
                    end else begin
                        out_y <= out_y + 1;
                    end
                end else begin
                    out_x <= out_x + 1;
                end
            end
        end
    end

    // End module
endmodule