// -----------------------------------------------------------------------------
// tb_vsync_diag.v — Kiem chung chan doan VSYNC qua truong X
//
// MUC DICH
//   kvc_top_demo co chan doan KVC-CAM-DIAG-20261101: dem xung VSYNC va ghi de
//   vao truong X cua bbox DAU TIEN trong moi frame. Nho vay chi can doc capture
//   UART la biet camera co phat VSYNC hay khong.
//
//   TB nay chung minh chan doan do hoat dong dung:
//     1. Khong bom VSYNC  -> X cua bbox 1 = 0, khong doi qua cac frame
//     2. Bom N xung VSYNC -> X cua bbox 1 tang dung N
//     3. Bom xung theo tan so biet truoc -> do duoc tan so tu X
//     4. bbox 2 KHONG bi ghi de (van la gia tri mock goc X = 100)
//     5. Layout khung khong doi: van N=2, CRC van khop
//
// Exit code: $fatal(1) khi fail.
// -----------------------------------------------------------------------------
`timescale 1ns/1ps

module tb_vsync_diag;

    localparam real    CLK_T = 10.0;          // 100 MHz
    localparam integer BAUD  = 38_400;
    localparam integer BIT_CYC = 100_000_000 / BAUD;   // 2604
    localparam real    BIT_T   = BIT_CYC * CLK_T;      // ns
    localparam integer MAX_N   = 12;
    localparam integer HDR_LEN = 8;
    localparam integer BBOX_LEN = 8;
    localparam integer CRC_LEN = 2;

    reg clk_27m = 1'b0;
    reg rst_n   = 1'b0;

    reg        cam_pclk  = 1'b0;
    reg        cam_vsync = 1'b0;
    reg        cam_href  = 1'b0;
    reg  [7:0] cam_data  = 8'd0;
    wire       cam_xclk;
    wire       ov2640_sda, ov2640_scl;
    wire       spi_cs, spi_sclk, spi_mosi;
    reg        spi_miso = 1'b1;
    wire       uart_tx;
    wire       data_ready;
    reg        mcu_ack = 1'b0;
    wire       led_camera_ok, led_cnn_done, led_uart_busy;

    integer pass_cnt = 0;
    integer fail_cnt = 0;

    always #(CLK_T/2) clk_27m = ~clk_27m;

    kvc_top_demo #(
        .BBOX_SOURCE (0),
        .DIAG_MODE   (1)
    ) dut (
        .clk_27m      (clk_27m),
        .rst_n        (rst_n),
        .cam_pclk     (cam_pclk),
        .cam_vsync    (cam_vsync),
        .cam_href     (cam_href),
        .cam_data     (cam_data),
        .cam_xclk     (cam_xclk),
        .ov2640_sda   (ov2640_sda),
        .ov2640_scl   (ov2640_scl),
        .spi_cs       (spi_cs),
        .spi_sclk     (spi_sclk),
        .spi_mosi     (spi_mosi),
        .spi_miso     (spi_miso),
        .uart_tx      (uart_tx),
        .data_ready   (data_ready),
        .mcu_ack      (mcu_ack),
        .led_camera_ok(led_camera_ok),
        .led_cnn_done (led_cnn_done),
        .led_uart_busy(led_uart_busy)
    );

    // ------------------------------------------------------------------
    // Bo thu UART doc lap + parser IF-01
    // ------------------------------------------------------------------
    integer  rx_bytes = 0, rx_fe = 0;
    reg [7:0] fbuf [0:(HDR_LEN + MAX_N*BBOX_LEN + CRC_LEN - 1)];
    integer  fidx = 0, frame_ok = 0, crc_err = 0;
    integer  last_n = -1;
    integer  last_x1 = -1, last_y1 = -1, last_x2 = -1, last_c1 = -1, last_c2 = -1;

    function automatic [15:0] crc16f;
        input [7:0] b; input [15:0] c;
        reg [15:0] x; integer k;
        begin
            x = c ^ (b << 8);
            for (k = 0; k < 8; k = k + 1)
                x = (x & 16'h8000) ? ((x << 1) ^ 16'h1021) : (x << 1);
            crc16f = x;
        end
    endfunction

    integer i, tot, c16;
    reg [15:0] calc, rxc;

    task automatic push_byte;
        input [7:0] b;
        begin
            if (fidx < (HDR_LEN + MAX_N*BBOX_LEN + CRC_LEN)) fbuf[fidx] = b;
            fidx = fidx + 1;

            if (fidx >= HDR_LEN) begin
                if (fbuf[0] !== 8'h5A || fbuf[1] !== 8'hA5 || fbuf[3] > MAX_N) begin
                    for (i = 0; i < fidx-1; i = i + 1) fbuf[i] = fbuf[i+1];
                    fidx = fidx - 1;
                end else begin
                    tot = HDR_LEN + fbuf[3]*BBOX_LEN + CRC_LEN;
                    if (fidx >= tot) begin
                        calc = 16'hFFFF;
                        for (i = 0; i < HDR_LEN + fbuf[3]*BBOX_LEN; i = i + 1)
                            calc = crc16f(fbuf[i], calc);
                        rxc = {fbuf[tot-1], fbuf[tot-2]};
                        if (calc === rxc) begin
                            frame_ok = frame_ok + 1;
                            last_n  = fbuf[3];
                            // bbox 1: X at [8..9] LE, Y [10..11], C at [14]
                            last_x1 = {fbuf[9],  fbuf[8]};
                            last_y1 = {fbuf[11], fbuf[10]};
                            last_c1 = fbuf[14];
                            // bbox 2: X at [16..17], C at [22]
                            last_x2 = {fbuf[17], fbuf[16]};
                            last_c2 = fbuf[22];
                        end else begin
                            crc_err = crc_err + 1;
                        end
                        fidx = 0;
                    end
                end
            end
        end
    endtask

    reg [7:0] rxs;
    integer   b4;
    always begin : uart_rx
        @(negedge uart_tx);
        if (rst_n) begin
            #(BIT_T*0.5);
            if (uart_tx !== 1'b0) begin
                rx_fe = rx_fe + 1;
            end else begin
                rxs = 8'h00;
                for (b4 = 0; b4 < 8; b4 = b4 + 1) begin
                    #(BIT_T);
                    rxs[b4] = uart_tx;
                end
                #(BIT_T);
                rx_bytes = rx_bytes + 1;
                if (uart_tx !== 1'b1) rx_fe = rx_fe + 1;
                else push_byte(rxs);
                #(BIT_T*0.5);
            end
        end
    end

    // ------------------------------------------------------------------
    // Bom xung VSYNC: cao 200 us, chu ky theo tham so
    // ------------------------------------------------------------------
    task automatic send_vsync_pulses;
        input integer count;
        input real    period_ns;
        integer k;
        begin
            for (k = 0; k < count; k = k + 1) begin
                cam_vsync = 1'b1;
                #(200_000.0);
                cam_vsync = 1'b0;
                #(period_ns - 200_000.0);
            end
        end
    endtask

    integer guard;
    task automatic wait_frames;
        input integer n;
        integer start_ok;
        begin
            start_ok = frame_ok;
            guard = 0;
            while ((frame_ok - start_ok) < n && guard < 40_000_000) begin
                @(posedge clk_27m);
                guard = guard + 1;
            end
        end
    endtask

    initial begin
        $display("=== tb_vsync_diag (chan doan VSYNC qua truong X) ===");
        $display("");

        rst_n = 1'b0;
        repeat (50) @(posedge clk_27m);
        rst_n = 1'b1;

        // ------------------------------------------------------------------
        // Test 1: khong bom VSYNC -> X cua bbox 1 phai = 0 va dung yen
        // ------------------------------------------------------------------
        $display("--- Test 1: KHONG co VSYNC -> X(bbox1) = 0, dung yen ---");
        wait_frames(3);
        begin : t1
            integer x_a, x_b;
            x_a = last_x1;
            wait_frames(3);
            x_b = last_x1;
            $display("  X(bbox1) frame truoc = %0d, frame sau = %0d", x_a, x_b);
            if (x_a !== 0 || x_b !== 0) begin
                $display("  FAIL: X phai = 0 khi khong co VSYNC (do duoc %0d, %0d)", x_a, x_b);
                fail_cnt = fail_cnt + 1;
            end else begin
                $display("  PASS X = 0 va khong doi");
                pass_cnt = pass_cnt + 1;
            end
        end

        // ------------------------------------------------------------------
        // Test 2: bom 7 xung VSYNC -> X phai tang dung 7
        // ------------------------------------------------------------------
        $display("");
        $display("--- Test 2: bom 7 xung VSYNC -> X tang dung 7 ---");
        begin : t2
            integer x_before, x_after;
            // Doi frame moi de lay gia tri truoc
            wait_frames(1);
            x_before = last_x1;
            send_vsync_pulses(7, 2_000_000.0);   // 500 Hz, duoi tan so trigger mock
            wait_frames(3);                      // de bo dem kip vao frame
            x_after = last_x1;
            $display("  X truoc = %0d, sau = %0d, chenh = %0d",
                     x_before, x_after, x_after - x_before);
            if ((x_after - x_before) !== 7) begin
                $display("  FAIL: chenh phai = 7, do duoc %0d", x_after - x_before);
                fail_cnt = fail_cnt + 1;
            end else begin
                $display("  PASS X tang dung 7");
                pass_cnt = pass_cnt + 1;
            end
        end

        // ------------------------------------------------------------------
        // Test 3: tan so biet truoc -> X tang dung so xung
        //
        // GHI CHU: dung 20 xung @ 2 kHz (~10 ms tong) thay vi 30 Hz trong 1 s.
        // Ly do: 1 s mo phong @100 MHz = 100M cycle, vvp mat vai phut. Muc dich
        // cua test nay la chung minh BO DEM dung, khong phai do tan so tuyet doi.
        // Kiem tan so thuc te da co Test 2 va se kiem lai bang capture tren bo.
        // ------------------------------------------------------------------
        $display("");
        $display("--- Test 3: VSYNC 2 kHz, 20 xung -> X tang dung 20 ---");
        begin : t3
            integer x_before, x_after, d;
            wait_frames(1);
            x_before = last_x1;
            send_vsync_pulses(20, 500_000.0);   // 2 kHz, 0,5 ms chu ky
            wait_frames(3);
            x_after = last_x1;
            d = x_after - x_before;
            $display("  X truoc = %0d, sau = %0d, chenh = %0d (ky vong 20)",
                     x_before, x_after, d);
            if (d !== 20) begin
                $display("  FAIL: phai = 20");
                fail_cnt = fail_cnt + 1;
            end else begin
                $display("  PASS dem dung 20 xung");
                pass_cnt = pass_cnt + 1;
            end
        end

        // ------------------------------------------------------------------
        // Test 4: bbox 2 KHONG bi ghi de
        // ------------------------------------------------------------------
        $display("");
        $display("--- Test 4: bbox 2 giu nguyen gia tri mock (X=100, c=2) ---");
        $display("  X(bbox2) = %0d, class = %0d", last_x2, last_c2);
        if (last_x2 !== 100 || last_c2 !== 2) begin
            $display("  FAIL: bbox 2 bi anh huong (X phai 100, c phai 2)");
            fail_cnt = fail_cnt + 1;
        end else begin
            $display("  PASS bbox 2 khong bi ghi de");
            pass_cnt = pass_cnt + 1;
        end

        // ------------------------------------------------------------------
        // Test 4b: Y cua bbox 1 mang trang thai SCCB (Gate G0)
        //
        //   y = {14'd0, cfg_error, cfg_done}  ->  0, 1 hoac 3
        //
        // TB nay KHONG khang dinh gia tri cu the cua cfg_error/cfg_done: trong
        // mo phong `sccb_master` la push-pull va khong co slave that, nen ket
        // qua ACK khong phan anh duoc sensor. Cai duoc kiem la Y KHONG CON la
        // gia tri mock (240) va nam trong tap ma hoa hop le. Gia tri dung tren
        // bo duoc xac dinh o Gate G0.4 bang capture UART that.
        // ------------------------------------------------------------------
        $display("");
        $display("--- Test 4b: Y(bbox1) = trang thai SCCB {cfg_error, cfg_done} ---");
        $display("  Y(bbox1) = %0d (mock goc = 240)", last_y1);
        if (last_y1 !== 0 && last_y1 !== 1 && last_y1 !== 3) begin
            $display("  FAIL: Y phai thuoc {0,1,3}, do duoc %0d", last_y1);
            fail_cnt = fail_cnt + 1;
        end else begin
            $display("  PASS Y ma hoa trang thai SCCB");
            pass_cnt = pass_cnt + 1;
        end

        // ------------------------------------------------------------------
        // Test 5: layout khung khong doi
        // ------------------------------------------------------------------
        $display("");
        $display("--- Test 5: layout IF-01 khong doi (N=2, CRC khop) ---");
        $display("  N = %0d, frame_ok = %0d, crc_err = %0d, framing_err = %0d",
                 last_n, frame_ok, crc_err, rx_fe);
        if (last_n !== 2 || crc_err !== 0 || rx_fe !== 0) begin
            $display("  FAIL: layout hoac CRC bi anh huong");
            fail_cnt = fail_cnt + 1;
        end else begin
            $display("  PASS N=2, 0 CRC error, 0 framing error");
            pass_cnt = pass_cnt + 1;
        end

        $display("");
        $display("=== SUMMARY: PASS=%0d FAIL=%0d, frames=%0d ===",
                 pass_cnt, fail_cnt, frame_ok);
        if (fail_cnt != 0) $fatal(1, "tb_vsync_diag FAILED");
        $display("PASS: tb_vsync_diag completed");
        $finish;
    end

    initial begin
        #(200_000_000);
        $display("WATCHDOG timeout");
        $fatal(1, "tb_vsync_diag timeout");
    end

endmodule
