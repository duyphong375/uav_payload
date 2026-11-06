// -----------------------------------------------------------------------------
// tb_kvc_top_blob.v — Integration test: blob THAT tu pixel -> IF-01 -> UART
//
// MUC DICH
//   Chung minh duong BBOX_SOURCE = 1 di tron ven: byte DVP -> camera_rx ->
//   kvc_blob_detect (domain cam_pclk) -> CDC -> bbox_packetizer -> uart_tx,
//   va khung IF-01 nhan duoc o dau thu UART doc lap co so bbox dung bang so
//   blob trong khung hinh.
//
//   Day la bang chung SIMULATED (chua phai HARDWARE-VERIFIED): khong co
//   capture tu bo that.
//
// NOI DUNG
//   - Frame 1, 2 bi SKIP_FRAMES -> khong gui gi
//   - Frame 3 co blob cam 60x40 tai (100,60) -> khung N=1, x=130, y=80,
//     w=60, h=40, class=2, conf>0
//   - Frame 4 khong co blob -> khung N=0 (van gui de MCU biet camera song)
//   - R7: DUT dat DIAG_MODE = 1 cung BBOX_SOURCE = 1. Vi `mock_first_bbox`
//     luon 0 o che do nay, X cua bbox phai giu nguyen 130 (KHONG bi thay bang
//     vsync_cnt). TB cung kiem truc tiep `dut.mock_first_bbox === 0`.
//
// Exit code: $fatal(1,...) khi fail.
// -----------------------------------------------------------------------------
`timescale 1ns/1ps

module tb_kvc_top_blob;

    localparam real    CLK_T   = 10.0;              // 100 MHz (sim_stubs: rPLL = passthrough)
    localparam real    PCLK_T  = 20.0;              // 50 MHz camera
    localparam integer BAUD    = 38_400;
    localparam integer BIT_CYC = 100_000_000 / BAUD;
    localparam real    BIT_T   = BIT_CYC * CLK_T;   // ns
    localparam integer MAX_N   = 12;
    localparam integer HDR_LEN = 8;
    localparam integer BBOX_LEN = 8;
    localparam integer CRC_LEN = 2;

    // Kich thuoc khung gui vao camera (nho hon VGA cho nhanh mo phong —
    // camera_rx va kvc_blob_detect khong phu thuoc kich thuoc).
    localparam integer W = 320;
    localparam integer H = 240;

    // Blob cam 60x40 tai goc (100,60)
    localparam integer BLOB_X0 = 100;
    localparam integer BLOB_Y0 = 60;
    localparam integer BLOB_W  = 60;
    localparam integer BLOB_H  = 40;

    localparam [15:0] C_ORANGE = {5'd31, 6'd30, 5'd2};
    localparam [15:0] C_WATER  = {5'd7,  6'd37, 5'd22};

    reg clk_27m = 1'b0;
    reg cam_pclk = 1'b0;
    reg rst_n = 1'b0;

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

    always #(CLK_T/2)  clk_27m = ~clk_27m;
    always #(PCLK_T/2) cam_pclk = ~cam_pclk;

    // DIAG_MODE = 1 co y dat cung BBOX_SOURCE = 1 de kiem R7 (khong duoc ghi
    // de X cua blob that).
    kvc_top_demo #(
        .BBOX_SOURCE (1),
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
    // Bo thu UART doc lap 8N1 @38.400 + parser IF-01
    // ------------------------------------------------------------------
    integer rx_bytes = 0, rx_fe = 0;
    reg [7:0] fbuf [0:(HDR_LEN + MAX_N*BBOX_LEN + CRC_LEN - 1)];
    integer fidx = 0, frame_ok = 0, crc_err = 0;

    integer rec_n   [0:7];
    integer rec_x   [0:7];
    integer rec_y   [0:7];
    integer rec_w   [0:7];
    integer rec_h   [0:7];
    integer rec_cls [0:7];
    integer rec_conf[0:7];
    integer n_rec = 0;

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
                            if (n_rec < 8) begin
                                rec_n[n_rec] = fbuf[3];
                                if (fbuf[3] > 0) begin
                                    rec_x[n_rec]    = {fbuf[9],  fbuf[8]};
                                    rec_y[n_rec]    = {fbuf[11], fbuf[10]};
                                    rec_w[n_rec]    = fbuf[12];
                                    rec_h[n_rec]    = fbuf[13];
                                    rec_cls[n_rec]  = fbuf[14];
                                    rec_conf[n_rec] = fbuf[15];
                                end else begin
                                    rec_x[n_rec] = -1; rec_y[n_rec] = -1;
                                    rec_w[n_rec] = -1; rec_h[n_rec] = -1;
                                    rec_cls[n_rec] = -1; rec_conf[n_rec] = -1;
                                end
                                n_rec = n_rec + 1;
                            end
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
    // Kich thich camera (DVP 8-bit)
    // ------------------------------------------------------------------
    function automatic is_fg;
        input integer xx, yy;
        begin
            is_fg = (xx >= BLOB_X0) && (xx < BLOB_X0 + BLOB_W) &&
                    (yy >= BLOB_Y0) && (yy < BLOB_Y0 + BLOB_H);
        end
    endfunction

    task automatic vsync_pulse;
        begin
            @(negedge cam_pclk);
            cam_vsync = 1'b1;
            repeat (8) @(negedge cam_pclk);
            cam_vsync = 1'b0;
            @(negedge cam_pclk);
        end
    endtask

    task automatic frame_body;
        input integer use_blob;
        integer xx, yy;
        reg [15:0] p;
        begin
            for (yy = 0; yy < H; yy = yy + 1) begin
                @(negedge cam_pclk);
                cam_href = 1'b1;
                for (xx = 0; xx < W; xx = xx + 1) begin
                    p = (use_blob != 0 && is_fg(xx, yy)) ? C_ORANGE : C_WATER;
                    cam_data = p[15:8];          // byte cao truoc (camera_rx)
                    @(negedge cam_pclk);
                    cam_data = p[7:0];
                    @(negedge cam_pclk);
                end
                cam_href = 1'b0;
                @(negedge cam_pclk);
            end
        end
    endtask

    integer guard;

    initial begin
        $display("=== tb_kvc_top_blob (blob that -> IF-01) ===");

        rst_n = 1'b0;
        repeat (50) @(posedge clk_27m);
        rst_n = 1'b1;
        repeat (20) @(posedge cam_pclk);

        // --------------------------------------------------------------
        // Frame 1, 2: bi SKIP_FRAMES cua camera_rx -> khong gui gi
        // --------------------------------------------------------------
        $display("--- Frame 1,2: camera skip ---");
        vsync_pulse();
        vsync_pulse();

        // --------------------------------------------------------------
        // Frame 3: co blob -> duoc chap nhan, tich luy
        // --------------------------------------------------------------
        $display("--- Frame 3: blob cam 60x40 tai (100,60) ---");
        vsync_pulse();
        frame_body(1);

        // --------------------------------------------------------------
        // Frame 4: vsync latches frame 3 -> packet N=1
        //          body rong (khong blob)
        // --------------------------------------------------------------
        $display("--- Frame 4: latches frame 3, body rong ---");
        vsync_pulse();
        frame_body(0);

        // Cho packet N=1 gui xong (26 byte @38400 = 6,77 ms) truoc khi co
        // start tiep theo, neu khong bbox_packetizer se bo start (chi nhan
        // o S_IDLE).
        #(8_000_000);

        // --------------------------------------------------------------
        // Frame 5: vsync latches frame 4 -> packet N=0
        // --------------------------------------------------------------
        $display("--- Frame 5: latches frame 4 (rong) ---");
        vsync_pulse();

        // Doi du 2 khung
        guard = 0;
        while (frame_ok < 2 && guard < 40_000_000) begin
            @(posedge clk_27m);
            guard = guard + 1;
        end

        $display("  INFO: frame_ok=%0d, crc_err=%0d, framing_err=%0d, byte=%0d",
                 frame_ok, crc_err, rx_fe, rx_bytes);

        // 1. Phai co dung 2 khung hop le
        if (frame_ok < 2) begin
            $display("FAIL: chi %0d khung hop le (can 2)", frame_ok);
            fail_cnt = fail_cnt + 1;
        end else begin
            $display("  PASS nhan 2 khung IF-01 hop le");
            pass_cnt = pass_cnt + 1;
        end

        // 2. Framing / CRC sach
        if (rx_fe != 0 || crc_err != 0) begin
            $display("FAIL: framing_err=%0d crc_err=%0d (phai 0)", rx_fe, crc_err);
            fail_cnt = fail_cnt + 1;
        end else begin
            $display("  PASS framing 0 loi, CRC 0 loi");
            pass_cnt = pass_cnt + 1;
        end

        // 3. Khung 1: N=1 va so lieu dung bang blob da bom
        if (n_rec < 1 || rec_n[0] != 1) begin
            $display("FAIL: khung dau N=%0d (ky vong 1)", (n_rec < 1) ? -1 : rec_n[0]);
            fail_cnt = fail_cnt + 1;
        end else begin
            $display("  khung 1: N=1 x=%0d y=%0d w=%0d h=%0d class=%0d conf=%0d",
                     rec_x[0], rec_y[0], rec_w[0], rec_h[0], rec_cls[0], rec_conf[0]);
            if (rec_x[0] != 130 || rec_y[0] != 80 ||
                rec_w[0] != 60  || rec_h[0] != 40) begin
                $display("FAIL: hop bao sai (ky vong x=130 y=80 w=60 h=40)");
                fail_cnt = fail_cnt + 1;
            end else begin
                $display("  PASS hop bao khop blob da bom");
                pass_cnt = pass_cnt + 1;
            end
            if (rec_cls[0] != 2) begin
                $display("FAIL: class=%0d (ky vong 2 = lifebuoy)", rec_cls[0]);
                fail_cnt = fail_cnt + 1;
            end else begin
                $display("  PASS class = 2 (lifebuoy)");
                pass_cnt = pass_cnt + 1;
            end
            if (rec_conf[0] <= 0) begin
                $display("FAIL: conf=%0d (ky vong > 0)", rec_conf[0]);
                fail_cnt = fail_cnt + 1;
            end else begin
                $display("  PASS conf = %0d", rec_conf[0]);
                pass_cnt = pass_cnt + 1;
            end
        end

        // 4. R7: X cua blob KHONG bi DIAG_MODE ghi de
        //    Neu bi ghi de, x se la vsync_cnt (nho, ~5) chu khong phai 130.
        if (n_rec >= 1 && rec_x[0] == 130) begin
            $display("  PASS R7: DIAG_MODE=1 khong ghi de X cua blob that");
            pass_cnt = pass_cnt + 1;
        end else begin
            $display("FAIL: R7 — X cua blob bi ghi de (x=%0d)",
                     (n_rec >= 1) ? rec_x[0] : -1);
            fail_cnt = fail_cnt + 1;
        end
        if (dut.mock_first_bbox !== 1'b0) begin
            $display("FAIL: mock_first_bbox = %b khi BBOX_SOURCE=1 (phai 0)",
                     dut.mock_first_bbox);
            fail_cnt = fail_cnt + 1;
        end else begin
            $display("  PASS mock_first_bbox = 0 o che do blob");
            pass_cnt = pass_cnt + 1;
        end

        // 5. Khung 2: N=0 (frame rong van phai gui khung)
        if (n_rec < 2 || rec_n[1] != 0) begin
            $display("FAIL: khung thu 2 N=%0d (ky vong 0)", (n_rec < 2) ? -1 : rec_n[1]);
            fail_cnt = fail_cnt + 1;
        end else begin
            $display("  PASS khung rong N=0 duoc gui (camera con song)");
            pass_cnt = pass_cnt + 1;
        end

        $display("");
        $display("=== SUMMARY: PASS=%0d FAIL=%0d, frames=%0d ===", pass_cnt, fail_cnt, frame_ok);
        if (fail_cnt != 0) $fatal(1, "tb_kvc_top_blob FAILED");
        $display("PASS: tb_kvc_top_blob completed");
        $finish;
    end

    initial begin
        #(200_000_000);
        $display("WATCHDOG timeout");
        $fatal(1, "tb_kvc_top_blob timeout");
    end

endmodule
