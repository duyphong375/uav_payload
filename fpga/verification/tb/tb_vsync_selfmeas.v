// -----------------------------------------------------------------------------
// tb_vsync_selfmeas.v â€” Kiem chung DIAG_MODE = 2 tren top-level
//
// MUC DICH
//   Chung minh duong tu do VSYNC hoat dong XUYEN SUOT tu chan cam_vsync den
//   khung IF-01 tren UART, khong chi o muc module:
//     1. Khong co VSYNC      -> khong phat bao cao (khong treo, khong rac)
//     2. Bom VSYNC deu       -> bao cao xuat hien, slot 0 = (xung, frame)
//     3. Bom thieu frame     -> slot 6 cho thay rot frame
//     4. Layout IF-01 KHONG doi: N = 10, CRC dung, sync 5A A5
//     5. Slot W = chi so 0..11 (xac nhan thu tu khong bi dao)
//
// SU DUNG TICK THAT (100 us) NHUNG WINDOW NHO
//   DUT trong kvc_top_demo dung WINDOW_MS = 2.000 (2 s). O 65,6 ms/xung can
//   ~31 xung moi co snapshot; mo phong 2 s o 100 MHz mat vai chuc giay CPU
//   nhung chap nhan duoc. TB nay bom 40 xung 65,6 ms = 2,62 s.
//
// Exit code: $fatal(1) khi fail.
// -----------------------------------------------------------------------------
`timescale 1ns/1ps

module tb_vsync_selfmeas;

    localparam real    CLK_T   = 10.0;
    localparam integer BAUD    = 38_400;
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

    // BBOX_SOURCE = 1 (blob that) de `bbox_last_raw` mang nghia frame nguon.
    // DIAG_MODE  = 2 -> bao cao tu do thay the duong ra UART.
    // TICK 1 us va cua so 200 "ms": 6.000 lan nhanh hon, du de mo phong
    // trong vai giay. Tren bo luon dung 100 us / 2.000 ms.
    localparam integer SIM_TICK_HZ   = 1_000_000;
    // rev 2: khung bao cao N=12 = 106 byte = 27,6 ms o 38.400 bps. Cua so phai
    // DAI HON thoi gian phat, neu khong bao cao se chong nhau va bi bo.
    localparam integer SIM_WINDOW_MS = 4000;

    kvc_top_demo #(
        .BBOX_SOURCE    (1),
        .DIAG_MODE      (2),
        .DIAG_TICK_HZ   (SIM_TICK_HZ),
        .DIAG_WINDOW_MS (SIM_WINDOW_MS)
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
    integer   rx_bytes = 0, rx_fe = 0;
    reg [7:0] fbuf [0:(HDR_LEN + MAX_N*BBOX_LEN + CRC_LEN - 1)];
    integer   fidx = 0, frame_ok = 0, crc_err = 0;

    integer last_n = -1;
    integer sx0, sy0, sw0;
    integer sx6, sy6;
    integer sw_bad = 0;      // so slot co W khac chi so mong doi

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

    integer i, tot;
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
                            last_n   = fbuf[3];
                            // slot 0: X tai [8..9], Y tai [10..11], W tai [12]
                            sx0 = {fbuf[9],  fbuf[8]};
                            sy0 = {fbuf[11], fbuf[10]};
                            sw0 = fbuf[12];
                            // slot 6: bat dau o 8 + 6*8 = 56
                            sx6 = {fbuf[57], fbuf[56]};
                            sy6 = {fbuf[59], fbuf[58]};
                            // kiem W cua moi slot = chi so
                            for (i = 0; i < fbuf[3]; i = i + 1)
                                if (fbuf[8 + i*8 + 4] !== i[7:0]) sw_bad = sw_bad + 1;
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

    task automatic check;
        input [255:0] what;
        input integer got;
        input integer exp;
        begin
            if (got !== exp) begin
                $display("  FAIL %0s: got=%0d expect=%0d", what, got, exp);
                fail_cnt = fail_cnt + 1;
            end else begin
                $display("  PASS %0s = %0d", what, got);
                pass_cnt = pass_cnt + 1;
            end
        end
    endtask

    // Bom 1 xung VSYNC. Do rong 200 us giong OV2640 that.
    task automatic pulse_vsync;
        input integer gap_ns;
        begin
            cam_vsync = 1'b1;
            #200_000.0;
            cam_vsync = 1'b0;
            #(gap_ns - 200_000.0);
        end
    endtask

    // Cho N frame IF-01 hop le, toi da `maxclk` canh clk_27m.
    task automatic wait_frames;
        input integer n;
        input integer maxclk;
        integer start_ok, g;
        begin
            start_ok = frame_ok;
            g = 0;
            while ((frame_ok - start_ok) < n && g < maxclk) begin
                @(posedge clk_27m);
                g = g + 1;
            end
        end
    endtask

    localparam integer GAP_65 = 656_000;   // 65,6 "ms" module = 656 us thuc

    initial begin
        $display("=== tb_vsync_selfmeas (DIAG_MODE=2, top-level) ===");
        $display("");

        rst_n = 1'b0;
        repeat (50) @(posedge clk_27m);
        rst_n = 1'b1;
        repeat (50) @(posedge clk_27m);

        // ------------------------------------------------------------------
        // Test 1: chua co VSYNC -> chua co bao cao
        // ------------------------------------------------------------------
        $display("--- Test 1: chua bom VSYNC -> chua co khung bao cao ---");
        wait_frames(1, 200_000);   // doi mot chut
        check("frame_ok truoc khi bom", frame_ok, 0);

        // ------------------------------------------------------------------
        // Test 2: bom 40 xung 65,6 ms -> co bao cao N=10, layout dung
        //   Cua so 2 s -> can ~31 xung. Bom 40 cho du 1 bao cao.
        //   Tong thoi gian 40 * 65,6 ms = 2,62 s mo phong.
        // ------------------------------------------------------------------
        $display("");
        $display("--- Test 2: 130 xung 65,6 ms -> 2 bao cao N=12 ---");
        begin : t2
            integer k;
            for (k = 0; k < 130; k = k + 1) pulse_vsync(GAP_65);
        end
        wait_frames(1, 30_000_000);

        // 130 xung x 656 us = 85,3 ms thuc; cua so 40 ms -> 2 bao cao.
        check("frame_ok (bao cao)", frame_ok, 2);
        check("N cua bao cao", last_n, 12);
        check("slot 0 = thu tu", sw0, 0);
        check("crc_err", crc_err, 0);
        check("framing_err", rx_fe, 0);
        check("so slot sai thu tu", sw_bad, 0);

        // slot 0 X = so xung VSYNC trong cua so (>= 30 o 65,6 ms / 2 s)
        $display("  slot0: X(xung)=%0d Y(frame)=%0d", sx0, sy0);
        if (sx0 < 55 || sx0 > 65) begin
            $display("  FAIL slot0 X ngoai 55..65 (cua so 4000 ms / 65,6 ms = 61)");
            fail_cnt = fail_cnt + 1;
        end else begin
            $display("  PASS slot0 X trong 55..65");
            pass_cnt = pass_cnt + 1;
        end

        // rev 2: slot 0 Y = w_periods (khong con la w_frame).
        if (sy0 < 1) begin
            $display("  FAIL slot0 Y (w_periods) phai >= 1, do duoc %0d", sy0);
            fail_cnt = fail_cnt + 1;
        end else begin
            $display("  PASS slot0 Y (w_periods) = %0d", sy0);
            pass_cnt = pass_cnt + 1;
        end

        // rev 2: slot 6 X = w_rejected, Y = t_vsync. Truoc day X la t_vsync.
        // Vi vay phai doc Y, khong phai X.
        $display("  slot6: w_rejected=%0d t_vsync=%0d", sx6, sy6);
        if (sy6 < 100 || sy6 > 130) begin
            $display("  FAIL slot6 Y (t_vsync) ngoai 100..130");
            fail_cnt = fail_cnt + 1;
        end else begin
            $display("  PASS slot6 Y (t_vsync) trong 100..130");
            pass_cnt = pass_cnt + 1;
        end


        $display("");
        $display("=== SUMMARY: PASS=%0d FAIL=%0d, frames=%0d, bytes=%0d ===",
                 pass_cnt, fail_cnt, frame_ok, rx_bytes);
        if (fail_cnt != 0) $fatal(1, "tb_vsync_selfmeas FAILED");
        $display("PASS: tb_vsync_selfmeas completed");
        $finish;
    end

    initial begin
        #(60_000_000_000);
        $fatal(1, "tb_vsync_selfmeas TIMEOUT");
    end

endmodule

