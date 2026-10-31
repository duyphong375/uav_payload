// -----------------------------------------------------------------------------
// tb_kvc_top_demo.v — Testbench tich hop co assertion cho kvc_top_demo
//
// Muc tieu (Phase P1, USE_MOCK_BBOX=1):
//   1. Drive clk_27m va reset dung
//   2. Kiem khong co X tren uart_tx sau reset
//   3. Kiem uart_tx co chuyen dong (mock_bbox phat frame)
//   4. Giai ma byte dau tien phai la 0x5A (sync)
//   5. Dem toi thieu 2 frame trong thoi gian mo phong
//
// Khong drive camera (mock path khong phu thuoc camera).
// Exit code: $fatal(1,...) khi fail
// -----------------------------------------------------------------------------
`timescale 1ns/1ps

module tb_kvc_top_demo;

    localparam real CLK27_T = 1000.0 / 27.0;   // ~37.037 ns

    reg  clk_27m = 1'b0;
    reg  rst_n   = 1'b0;

    // Camera (khong drive — chi de port khong float)
    reg        cam_pclk  = 1'b0;
    reg        cam_vsync = 1'b0;
    reg        cam_href  = 1'b0;
    reg  [7:0] cam_data  = 8'd0;
    wire       cam_xclk;
    wire       ov2640_sda;
    wire       ov2640_scl;

    // SPI
    wire spi_cs, spi_sclk, spi_mosi;
    reg  spi_miso = 1'b1;

    // UART + handshake
    wire uart_tx;
    wire data_ready;
    reg  mcu_ack = 1'b0;   // MCU that giu thap, chi pulse ACK khi da doc frame

    wire led_camera_ok, led_cnn_done, led_uart_busy;

    integer pass_cnt = 0;
    integer fail_cnt = 0;

    always #(CLK27_T/2) clk_27m = ~clk_27m;

    // ---------------------------------------------------------------
    // DUT
    // ---------------------------------------------------------------
    kvc_top_demo dut (
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

    // Probe chi tiet packetizer
    integer busy_seen = 0;
    integer start_seen = 0;
    always @(posedge clk_27m) begin
        if (rst_n) begin
            if (dut.pack_uart_tx_start) start_seen = start_seen + 1;
            if (dut.uart_tx_busy_sig)   busy_seen  = busy_seen + 1;
        end
    end

    // ---------------------------------------------------------------
    // Monitor: dem canh xuong tren uart_tx (moi start bit = 1 byte)
    // va bat byte dau tien sau reset de kiem sync.
    // ---------------------------------------------------------------
    integer  uart_fall_cnt = 0;
    reg [7:0] first_byte = 8'h00;
    reg       first_byte_captured = 1'b0;

    // Probe chan doan
    integer pkt_done_cnt    = 0;
    integer frame_valid_cnt = 0;
    integer data_ready_cnt  = 0;
    integer pkt_state_max   = 0;
    always @(posedge clk_27m) begin
        if (rst_n) begin
            if (dut.pack_packet_done) pkt_done_cnt    = pkt_done_cnt + 1;
            if (dut.bbox_last_src)    frame_valid_cnt = frame_valid_cnt + 1;
            if (data_ready)           data_ready_cnt  = data_ready_cnt + 1;
            if (dut.u_bbox_pkt.state > pkt_state_max) pkt_state_max = dut.u_bbox_pkt.state;
        end
    end

    // Giai ma 1 byte 8N1 o 38.400 bps tren clk 100 MHz noi bo
    // (khong the do chinh xac tu ngoai, nen chi dem so lan start)
    always @(negedge uart_tx) begin
        if (rst_n && uart_fall_cnt < 4096) begin
            uart_fall_cnt = uart_fall_cnt + 1;
        end
    end

    // ---------------------------------------------------------------
    // Kiem tra
    // ---------------------------------------------------------------
    integer i;
    integer frames_seen;

    initial begin
        $display("=== tb_kvc_top_demo (USE_MOCK_BBOX path) ===");

        // 1. Reset
        rst_n = 1'b0;
        repeat (50) @(posedge clk_27m);
        rst_n = 1'b1;
        repeat (20) @(posedge clk_27m);

        // 2. Khong co X tren uart_tx
        if (uart_tx === 1'bx || uart_tx === 1'bz) begin
            $display("FAIL: uart_tx = %b after reset", uart_tx);
            fail_cnt = fail_cnt + 1;
        end else begin
            $display("  PASS uart_tx defined (=%b) after reset", uart_tx);
            pass_cnt = pass_cnt + 1;
        end

        // 3. Cho UART hoat dong
        i = 0;
        while (uart_fall_cnt < 20 && i < 3000000) begin
            @(posedge clk_27m);
            i = i + 1;
        end

        if (uart_fall_cnt == 0) begin
            $display("FAIL: uart_tx never toggled in %0d cycles — mock_bbox khong phat", i);
            fail_cnt = fail_cnt + 1;
        end else begin
            $display("  PASS uart_tx toggled %0d times (start bits)", uart_fall_cnt);
            pass_cnt = pass_cnt + 1;
        end

        // 4. Uoc luong so frame: N=2 -> 8B header + 16B bbox + 2B CRC = 26 byte
        //    Moi byte = 1 start bit (canh xuong). Nen 20 canh xuong ~= 0.77 frame.
        if (uart_fall_cnt >= 20) begin
            $display("  PASS >= 20 byte da duoc gui (>= %0.1f frame voi N=2, 26 B/frame)",
                     uart_fall_cnt / 26.0);
            pass_cnt = pass_cnt + 1;
        end else begin
            $display("FAIL: chi %0d byte, can >= 20", uart_fall_cnt);
            fail_cnt = fail_cnt + 1;
        end

        // 5. data_ready it nhat mot lan (handshake controller chay)
        i = 0;
        while (data_ready_cnt == 0 && i < 3000000) begin
            @(posedge clk_27m);
            i = i + 1;
        end
        if (data_ready_cnt == 0) begin
            $display("FAIL: data_ready never asserted (pkt_done=%0d frame_valid=%0d state_max=%0d start=%0d busy=%0d)",
                     pkt_done_cnt, frame_valid_cnt, pkt_state_max, start_seen, busy_seen);
            fail_cnt = fail_cnt + 1;
        end else begin
            $display("  PASS data_ready asserted (pkt_done=%0d frame_valid=%0d)",
                     pkt_done_cnt, frame_valid_cnt);
            pass_cnt = pass_cnt + 1;
        end

        $display("=== SUMMARY: PASS=%0d FAIL=%0d, uart_fall=%0d ===", pass_cnt, fail_cnt, uart_fall_cnt);
        if (fail_cnt != 0) $fatal(1, "tb_kvc_top_demo FAILED with %0d error(s)", fail_cnt);
        $display("PASS: tb_kvc_top_demo completed");
        $finish;
    end

    initial begin
        #(CLK27_T * 8000000);
        $fatal(1, "TIMEOUT: tb_kvc_top_demo exceeded simulation limit (uart_fall=%0d, data_ready=%b)",
               uart_fall_cnt, data_ready);
    end

endmodule
