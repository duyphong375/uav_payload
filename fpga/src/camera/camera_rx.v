// -----------------------------------------------------------------------------
// Module: camera_rx.v
// Author: Vững (assistant)
// Date:   2026-10-15
// Desc:   DVP receiver cho OV2640 (8-bit DVP) — camera da chot 31/10/2026 (B-4)
// - Ghép 2 byte liên tiếp thành 1 pixel RGB565 (first byte = high byte)
// - Bỏ SKIP_FRAMES đầu để camera ổn định exposure
// - Xử lý VSYNC rising edge để phát hiện frame start
// - HREF falling edge reset byte pairing cho dòng mới
// - Tất cả xử lý trong domain pclk (pixel clock)
// -----------------------------------------------------------------------------
`timescale 1ns/1ps
module camera_rx #(
    parameter integer SKIP_FRAMES = 10   // số frame bỏ qua (mặc định 10)
)(
    input  wire        pclk,            // pixel clock từ camera (domain chính của module)
    input  wire        rst_n,           // active-low reset
    input  wire        vsync,           // frame sync (active high)
    input  wire        href,            // line valid (active high)
    input  wire [7:0]  data_in,         // 8-bit DVP data
    output reg  [15:0] pixel_data,      // RGB565 pixel (high_byte << 8 | low_byte)
    output reg         pixel_valid,     // 1 pclk pulse khi pixel_data valid
    output reg         frame_start,     // 1 pclk pulse khi frame mới (được chấp nhận) bắt đầu
    output reg         frame_valid      // 1 khi frame đang valid (sau khi đã bỏ SKIP_FRAMES)
);

    // internal registers for edge detection & byte assembly
    reg prev_vsync;
    reg prev_href;

    // frame skipping counter
    reg [31:0] frames_seen;
    reg skipping; // 1 = đang bỏ frame

    // byte assembly: latch high byte and flag
    reg [7:0] high_byte;
    reg       have_high;

    // edge detections (combinational)
    wire vsync_rising  = (~prev_vsync) & vsync;
    wire href_falling  = prev_href & (~href);

    // sequential logic on pclk
    always @(posedge pclk or negedge rst_n) begin
        if (!rst_n) begin
            prev_vsync   <= 1'b0;
            prev_href    <= 1'b0;
            frames_seen  <= 32'd0;
            skipping     <= (SKIP_FRAMES > 0) ? 1'b1 : 1'b0;
            have_high    <= 1'b0;
            high_byte    <= 8'h00;
            pixel_data   <= 16'h0000;
            pixel_valid  <= 1'b0;
            frame_start  <= 1'b0;
            frame_valid  <= 1'b0;
        end else begin
            // default clear single-cycle pulses
            pixel_valid <= 1'b0;
            frame_start <= 1'b0;

            // sample previous signals for edge detection
            prev_vsync <= vsync;
            prev_href  <= href;

            // VSYNC rising: a new frame begins (in camera domain)
            if (vsync_rising) begin
                // increment number of frames seen
                frames_seen <= frames_seen + 1;

                // If we are skipping and have now passed SKIP_FRAMES, enable frame_valid
                if (skipping) begin
                    if ((frames_seen + 1) > SKIP_FRAMES) begin
                        skipping <= 1'b0;
                        frame_valid <= 1'b1;
                        frame_start <= 1'b1; // mark accepted frame start
                    end else begin
                        // still skipping: keep frame_valid low
                        frame_valid <= 1'b0;
                        frame_start <= 1'b0;
                    end
                end else begin
                    // already past skipping -> accept this frame
                    frame_valid <= 1'b1;
                    frame_start <= 1'b1;
                end

                // reset line byte assembly at frame start
                have_high <= 1'b0;
            end else begin
                // not VSYNC rising: maintain frame_valid while vsync active and not skipping
                if (!skipping && vsync) begin
                    frame_valid <= 1'b1;
                end else begin
                    // when vsync low or still skipping, frame_valid = 0
                    if (!vsync) frame_valid <= 1'b0;
                end
            end

            // HREF falling: reset byte pairing at end of line
            if (href_falling) begin
                have_high <= 1'b0;
            end

            // When HREF high: consume bytes
            if (href) begin
                if (!have_high) begin
                    // latch high byte
                    high_byte <= data_in;
                    have_high <= 1'b1;
                end else begin
                    // have_high == 1 => this is low byte -> produce pixel
                    pixel_data <= {high_byte, data_in};
                    pixel_valid <= 1'b1;
                    have_high <= 1'b0;
                end
            end else begin
                // when href low, do nothing; have_high remains until href_falling clears it
            end

            // When VSYNC low (outside frame) ensure frame_valid low
            if (!vsync) frame_valid <= 1'b0;
        end
    end

endmodule