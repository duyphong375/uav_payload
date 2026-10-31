// -----------------------------------------------------------------------------
// Testbench: tb_image_preprocess.v
// Author: Vững (assistant)
// Date:   2026-10-15
// Desc:   Testbench cho image_preprocess.v
// Tests:
// 1) 4x4 -> 8x8 scaled (SCALE_S=2) check padding/color and dimensions
// 2) 8x6 -> 8x8 (simulate 640x480 -> 640x640 style; here scaled widths equal so pad top/bottom)
// 3) 8x8 -> 8x8 (no padding)
// 4) Reset during capture/process clears state
// Uses small sizes to speed sim; uses DUT parametrized accordingly.
// Dumps VCD: tb_image_preprocess.vcd
// -----------------------------------------------------------------------------
`timescale 1ns/1ps
module tb_image_preprocess;

    reg clk;
    reg rst_n;

    // For test 1 (4x4->8x8) instantiate DUT with parameters overridden
    // We'll create one DUT instance at a time in the sequence of tests
    // Helper tasks to run each test

    // clock 100MHz -> 10 ns period
    initial begin
        clk = 0;
        forever #5 clk = ~clk;
    end

    // Helper: send frame with size W x H to DUT: produce pixel_valid_in pulses and frame_start_in pulse
    task send_frame;
        input integer IN_W;
        input integer IN_H;
        output reg [15:0] pixel_data_array [0:65535]; // not used; only send stream
        input integer baseval; // starting color value low byte for pattern
        // but tasks with array parameters are complex; we'll implement simpler version: generate pattern inline using globals
    endtask

    // We'll implement per-test bespoke flows for clarity.

    // Common variables
    integer i, j;
    reg [15:0] vin_pixel;
    reg vin_valid;
    reg frame_start_in;

    // connection signals to DUT (we will re-instantiate DUT in each test with different parameters)
    wire [15:0] pixel_out;
    wire pixel_valid_out;
    wire frame_start_out;

    initial begin
        $dumpfile("tb_image_preprocess.vcd");
        $dumpvars(0, tb_image_preprocess);

        // init
        rst_n = 1'b0;
        vin_valid = 1'b0;
        frame_start_in = 1'b0;
        vin_pixel = 16'h0000;
        #100;
        @(posedge clk); rst_n = 1'b1;
        @(posedge clk);

        // ---------------------------------------------------------------------
        // Test 1: 4x4 -> 8x8 (SCALE_S=2) check padding correctness and output size
        // We'll instantiate a DUT with INPUT_W=4, INPUT_H=4, OUTPUT_W=8, OUTPUT_H=8
        // Input pattern: incremental bytes in high/low byte combined to 16-bit values
        // -----------------------------------------------------------------------------
        $display("Test1: 4x4 -> 8x8 scaling (nearest neighbor) + padding check");

        // instantiate DUT local block
        reg [15:0] dut_pixel_out;
        reg dut_pixel_valid_out;
        reg dut_frame_start_out;
        // To instantiate module inside procedural block we use generate-like approach:
        // Instead, instantiate a named instance beforehand with parameters; simpler: use static instance configured for 4x4->8x8
        // Create static instance now:

        // signals connecting to DUT1
        reg dpin_valid;
        reg [15:0] dpin_pixel;
        reg dpin_frame_start;
        wire [15:0] dpout_pixel;
        wire dpout_valid;
        wire dpout_frame_start;

        image_preprocess #(
            .INPUT_W(4),
            .INPUT_H(4),
            .OUTPUT_W(8),
            .OUTPUT_H(8),
            .PADDING_COLOR(8'd114)
        ) dut1 (
            .clk(clk),
            .rst_n(rst_n),
            .pixel_in(dpin_pixel),
            .pixel_valid_in(dpin_valid),
            .frame_start_in(dpin_frame_start),
            .pixel_out(dpout_pixel),
            .pixel_valid_out(dpout_valid),
            .frame_start_out(dpout_frame_start)
        );

        // Prepare input frame (4x4) with known pattern: pixel value = {8'hAA, 8'hBB} style
        // We'll feed 16 pixels sequentially; base colors increment
        integer base;
        base = 8'h10;
        dpin_valid = 1'b0;
        dpin_frame_start = 1'b0;
        @(posedge clk);

        // send frame_start pulse
        dpin_frame_start = 1'b1; @(posedge clk); dpin_frame_start = 1'b0;

        // send 4x4 pixels (row-major)
        for (j = 0; j < 4; j = j + 1) begin
            for (i = 0; i < 4; i = i + 1) begin
                // create pixel: replicate base into RGB565 via simple mapping for test: store base as both bytes
                dpin_pixel = {base[7:0], (base+1)[7:0]};
                base = (base + 2) & 8'hFF;
                dpin_valid = 1'b1;
                @(posedge clk);
                dpin_valid = 1'b0;
                @(posedge clk);
            end
        end

        // wait for DUT to start outputting; capture output into array
        reg [15:0] out_pixels [0:127];
        integer out_idx;
        out_idx = 0;
        repeat (200) @(posedge clk); // allow processing to proceed
        // sample outputs for some cycles
        for (i = 0; i < 200; i = i + 1) begin
            @(posedge clk);
            if (dpout_valid) begin
                out_pixels[out_idx] = dpout_pixel;
                out_idx = out_idx + 1;
            end
        end

        // Determine expected output size: 8x8 = 64 pixels
        if (out_idx < 64) begin
            $display("Test1 FAIL: expected at least 64 output pixels but got %0d", out_idx);
        end else begin
            $display("Test1: captured %0d output pixels", out_idx);
            // Check padding: since 4x4 scaled by 2 = 8x8 so no padding; but still verify values map correctly
            // For nearest-neighbor scale=2, output pixel at (x,y) maps to src = (x/2,y/2)
            integer bad;
            bad = 0;
            integer ox, oy;
            for (oy = 0; oy < 8; oy = oy + 1) begin
                for (ox = 0; ox < 8; ox = ox + 1) begin
                    integer srcx = ox / 2;
                    integer srcy = oy / 2;
                    integer src_idx = srcy * 4 + srcx;
                    // expected pixel corresponds to input sequence: compute same as we generated
                    // reconstruct input pixels sequence
                    integer seq_base;
                    seq_base = 8'h10 + src_idx*2;
                    reg [15:0] expected;
                    expected = {seq_base[7:0], (seq_base+1)[7:0]};
                    reg [15:0] got;
                    got = out_pixels[oy*8 + ox];
                    if (got !== expected) begin
                        bad = bad + 1;
                        $display("  MISMATCH at out(%0d,%0d): got 0x%04h expected 0x%04h", ox, oy, got, expected);
                    end
                end
            end
            if (bad == 0) $display("Test1 PASS: all pixels match expected nearest-neighbor scaling");
            else $display("Test1 FAIL: %0d mismatches", bad);
        end

        // ---------------------------------------------------------------------
        // Test 2: 8x6 -> 8x8 (simulate 640x480 -> 640x640 behavior)
        //   - Here OUTPUT_W=8 OUTPUT_H=8, INPUT_W=8 INPUT_H=6 => scale_s = 1 (both divide), SCALED_W=8, SCALED_H=6
        //   - pad_y = (8-6)/2 = 1 row top and bottom
        // ---------------------------------------------------------------------
        $display("Test2: 8x6 -> 8x8 padding top/bottom check");
        // Instantiate DUT2 for this test
        reg dp2_valid;
        reg [15:0] dp2_pixel;
        reg dp2_fs;
        wire [15:0] dp2_outpix;
        wire dp2_outvalid;
        wire dp2_fs_out;

        image_preprocess #(
            .INPUT_W(8),
            .INPUT_H(6),
            .OUTPUT_W(8),
            .OUTPUT_H(8),
            .PADDING_COLOR(8'd114)
        ) dut2 (
            .clk(clk),
            .rst_n(rst_n),
            .pixel_in(dp2_pixel),
            .pixel_valid_in(dp2_valid),
            .frame_start_in(dp2_fs),
            .pixel_out(dp2_outpix),
            .pixel_valid_out(dp2_outvalid),
            .frame_start_out(dp2_fs_out)
        );

        // send a small 8x6 image with uniform color value 0xF800 (red)
        dp2_valid = 1'b0; dp2_fs = 1'b0;
        @(posedge clk);
        dp2_fs = 1'b1; @(posedge clk); dp2_fs = 1'b0;
        for (j = 0; j < 6; j = j + 1) begin
            for (i = 0; i < 8; i = i + 1) begin
                dp2_pixel = 16'hF800; dp2_valid = 1'b1; @(posedge clk); dp2_valid = 1'b0; @(posedge clk);
            end
        end

        // capture outputs
        reg [15:0] out2 [0:127];
        integer idx2;
        idx2 = 0;
        // sample outputs for a while
        for (i = 0; i < 200; i = i + 1) begin
            @(posedge clk);
            if (dp2_outvalid) begin
                out2[idx2] = dp2_outpix;
                idx2 = idx2 + 1;
            end
        end
        // Expected: first row (0) padding color -> converted to RGB565 from gray 114
        reg [15:0] padpix;
        padpix = {PADDING16(8'd114)[15:11], PADDING16(8'd114)[10:5], PADDING16(8'd114)[4:0]}; // helper macro not available
        // Simpler: recompute mapping as in module: r5 = 114[7:3], g6 = 114[7:2], b5 = 114[7:3]
        reg [4:0] r5; reg [5:0] g6; reg [4:0] b5;
        r5 = 8'd114 >> 3;
        g6 = 8'd114 >> 2;
        b5 = 8'd114 >> 3;
        padpix = {r5, g6, b5};

        // Check top row (first 8 outputs) are padpix
        integer top_bad;
        top_bad = 0;
        for (i = 0; i < 8; i = i + 1) begin
            if (out2[i] !== padpix) top_bad = top_bad + 1;
        end
        // Check middle 6 rows contain red pixels, and bottom row padpix
        integer mid_bad;
        mid_bad = 0;
        // middle rows start at out2[8..8+6*8-1]
        for (i = 8; i < 8 + 6*8; i = i + 1) begin
            if (out2[i] !== 16'hF800) mid_bad = mid_bad + 1;
        end
        integer bot_bad;
        bot_bad = 0;
        for (i = 8 + 6*8; i < 8 + 6*8 + 8; i = i + 1) begin
            if (out2[i] !== padpix) bot_bad = bot_bad + 1;
        end
        if (top_bad == 0 && mid_bad == 0 && bot_bad == 0) $display("Test2 PASS: padding and image region correct");
        else $display("Test2 FAIL: top_bad=%0d mid_bad=%0d bot_bad=%0d", top_bad, mid_bad, bot_bad);

        // ---------------------------------------------------------------------
        // Test 3: 8x8 -> 8x8 (no padding, scale=1)
        // ---------------------------------------------------------------------
        $display("Test3: 8x8 -> 8x8 no padding");
        // reuse dut2 instance? instantiate new dut3
        reg dp3_v; reg [15:0] dp3_pix; reg dp3_fs;
        wire [15:0] dp3_out; wire dp3_vout; wire dp3_fsout;
        image_preprocess #(
            .INPUT_W(8),
            .INPUT_H(8),
            .OUTPUT_W(8),
            .OUTPUT_H(8),
            .PADDING_COLOR(8'd114)
        ) dut3 (
            .clk(clk), .rst_n(rst_n),
            .pixel_in(dp3_pix), .pixel_valid_in(dp3_v), .frame_start_in(dp3_fs),
            .pixel_out(dp3_out), .pixel_valid_out(dp3_vout), .frame_start_out(dp3_fsout)
        );

        // generate 8x8 checkerboard of two colors (0x07E0 green and 0x001F blue)
        dp3_v = 1'b0; dp3_fs = 1'b0;
        @(posedge clk);
        dp3_fs = 1'b1; @(posedge clk); dp3_fs = 1'b0;
        for (j = 0; j < 8; j = j + 1) begin
            for (i = 0; i < 8; i = i + 1) begin
                if (((i + j) % 2) == 0) dp3_pix = 16'h07E0; else dp3_pix = 16'h001F;
                dp3_v = 1'b1; @(posedge clk); dp3_v = 1'b0; @(posedge clk);
            end
        end

        // capture outputs
        reg [15:0] out3 [0:127];
        integer idx3; idx3 = 0;
        for (i = 0; i < 300; i = i + 1) begin
            @(posedge clk);
            if (dp3_vout) begin
                out3[idx3] = dp3_out;
                idx3 = idx3 + 1;
            end
        end
        // check idx3 == 64 and match pattern
        integer mismatch3; mismatch3 = 0;
        if (idx3 != 64) $display("Test3 FAIL: expected 64 outputs but got %0d", idx3);
        else begin
            for (j = 0; j < 8; j = j + 1) begin
                for (i = 0; i < 8; i = i + 1) begin
                    reg [15:0] expect3;
                    if (((i + j) % 2) == 0) expect3 = 16'h07E0; else expect3 = 16'h001F;
                    if (out3[j*8 + i] !== expect3) begin
                        mismatch3 = mismatch3 + 1;
                    end
                end
            end
            if (mismatch3 == 0) $display("Test3 PASS: output equals input (no padding, no scaling)");
            else $display("Test3 FAIL: %0d mismatches", mismatch3);
        end

        // ---------------------------------------------------------------------
        // Test 4: Reset between capture and processing
        // ---------------------------------------------------------------------
        $display("Test4: Reset during capture/process clears state");
        // instantiate small DUT for this test (4x4->8x8 reuse dut1)
        // Reset while sending frame
        // Start fresh: reset system
        @(posedge clk); rst_n = 1'b0; #20; rst_n = 1'b1; @(posedge clk);

        // Start frame and immediately reset before finishing capture
        dpin_frame_start = 1'b1; @(posedge clk); dpin_frame_start = 1'b0;
        // send one pixel then reset
        dpin_pixel = 16'h1234; dpin_valid = 1'b1; @(posedge clk); dpin_valid = 1'b0;
        // now reset
        @(posedge clk); rst_n = 1'b0; @(posedge clk); rst_n = 1'b1;
        // allow cycles
        wait_cycles(20);
        // Now verify DUT is idle and not producing pixel outputs (dpout_valid shouldn't be asserted)
        reg seen_out;
        seen_out = 0;
        for (i = 0; i < 50; i = i + 1) begin
            @(posedge clk);
            if (dpout_valid) seen_out = 1;
        end
        if (seen_out == 0) $display("Test4 PASS: reset prevented output after aborted capture");
        else $display("Test4 FAIL: outputs observed after reset");

        $display("All image_preprocess tests finished.");
        #200;
        $finish;
    end

    // small helper: wait N posedges
    task wait_cycles(input integer n);
        integer idx;
        begin
            for (idx = 0; idx < n; idx = idx + 1) @(posedge clk);
        end
    endtask

endmodule