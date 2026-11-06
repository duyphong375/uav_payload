// -----------------------------------------------------------------------------
// tb_kvc_top_demo_rate.v — Do NHIP FRAME that cua duong mock (P1 datapath)
//
// Muc dich: thay the con so suy doan trong BRINGUP_CHECKLIST bang so do duoc.
// Doi tuong: kvc_top_demo voi BBOX_SOURCE=0 (mock_bbox -> bbox_packetizer ->
//            uart_tx @38.400). Day la dung duong se nap len bo o G2.
//
// CACH DO TAN SO:
//   sim_stubs.v cho rPLL di thang (CLKOUT = CLKIN), nen clk_100m = clk_27m.
//   Vi vay TB drive clk_27m chu ky 10 ns -> clk_100m dung 100 MHz nhu thiet ke.
//   Nho vay so cycle do duoc quy doi truc tiep ra ms that.
//
// Gia tri ky vong (tinh tu RTL, kiem bang TB nay):
//   - 1 frame N=2 = 8 header + 16 bbox + 2 CRC = 26 byte
//   - 8N1 = 10 bit/byte, BAUD_DIV = 100 MHz / 38.400 = 2604 cycle/bit
//   - 26 * 10 * 2604 = 677.040 cycle = 6,7704 ms cho 1 packet
//   - MOCK_DIV = 500.000 cycle = 5 ms -> trigger den khi packetizer con ban
//     se bi bo (bbox_packetizer chi nhan 'start' o S_IDLE)
//   => chu ky packet on dinh = 2 * 500.000 = 1.000.000 cycle = 10 ms
//   => ~100 frame/s
//
// Exit code: $fatal(1,...) khi sai.
// -----------------------------------------------------------------------------
`timescale 1ns/1ps

module tb_kvc_top_demo_rate;

    localparam real CLK_T   = 10.0;          // 10 ns -> 100 MHz
    localparam integer TRIG = 500_000;       // MOCK_DIV trong kvc_top_demo
    localparam integer PKT_CYC_EXPECT = 677_040;

    reg clk_27m = 1'b0;
    reg rst_n   = 1'b0;

    reg        cam_pclk  = 1'b0;
    reg        cam_vsync = 1'b0;
    reg        cam_href  = 1'b0;
    reg  [7:0] cam_data  = 8'd0;
    wire       cam_xclk;
    wire       ov2640_sda;
    wire       ov2640_scl;
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
        .DIAG_MODE   (0)
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
    // Do: khoang cach giua hai packet_done lien tiep (cycle clk_100m)
    // ------------------------------------------------------------------
    integer cyc            = 0;
    integer last_done_cyc  = -1;
    integer n_done         = 0;
    integer period_min     = 32'h7FFFFFFF;
    integer period_max     = 0;
    integer period_sum     = 0;
    integer period_cnt     = 0;

    // Do do rong 1 packet: tu 'start' duoc nhan den packet_done
    integer start_cyc      = -1;
    integer pkt_width      = -1;

    always @(posedge clk_27m) begin
        if (!rst_n) begin
            cyc <= 0;
        end else begin
            cyc <= cyc + 1;

            if (dut.u_bbox_pkt.state == 4'd0 && dut.bbox_last_src)
                start_cyc <= cyc;

            if (dut.pack_packet_done) begin
                n_done <= n_done + 1;
                if (start_cyc >= 0 && pkt_width < 0)
                    pkt_width <= cyc - start_cyc;
                if (last_done_cyc >= 0) begin
                    if ((cyc - last_done_cyc) < period_min) period_min <= cyc - last_done_cyc;
                    if ((cyc - last_done_cyc) > period_max) period_max <= cyc - last_done_cyc;
                    period_sum <= period_sum + (cyc - last_done_cyc);
                    period_cnt <= period_cnt + 1;
                end
                last_done_cyc <= cyc;
            end
        end
    end

    integer guard;

    initial begin
        $display("=== tb_kvc_top_demo_rate (do nhip frame duong mock) ===");

        rst_n = 1'b0;
        repeat (50) @(posedge clk_27m);
        rst_n = 1'b1;

        // Cho it nhat 4 packet_done de co >= 3 khoang cach on dinh
        guard = 0;
        while (n_done < 4 && guard < 30_000_000) begin
            @(posedge clk_27m);
            guard = guard + 1;
        end

        if (n_done < 4) begin
            $display("FAIL: chi %0d packet_done trong %0d cycle", n_done, guard);
            fail_cnt = fail_cnt + 1;
        end else begin
            $display("  INFO: %0d packet_done, do rong 1 packet = %0d cycle (%.3f ms)",
                     n_done, pkt_width, pkt_width * 0.00001);
            $display("  INFO: chu ky packet min=%0d max=%0d tb=%0d cycle",
                     period_min, period_max, period_sum / period_cnt);
            $display("  INFO: FPS do duoc = %.1f frame/s",
                     100_000_000.0 / (period_sum / period_cnt));

            // 1. Do rong 1 packet phai ~ 26 byte * 10 bit * 2604 = 677.040 cycle
            if (pkt_width < PKT_CYC_EXPECT - 20_000 ||
                pkt_width > PKT_CYC_EXPECT + 20_000) begin
                $display("FAIL: do rong packet %0d cycle, ky vong ~%0d (26B @38400)",
                         pkt_width, PKT_CYC_EXPECT);
                fail_cnt = fail_cnt + 1;
            end else begin
                $display("  PASS do rong packet khop 26 byte @38.400 (%0d cycle)", pkt_width);
                pass_cnt = pass_cnt + 1;
            end

            // 2. Chu ky packet on dinh phai ~ 1.000.000 cycle (10 ms, ~100 FPS),
            //    KHONG phai 500.000 (5 ms / 200 FPS) va KHONG phai 677.040
            //    (back-to-back / 147 FPS).
            if (period_sum / period_cnt < 900_000 || period_sum / period_cnt > 1_100_000) begin
                $display("FAIL: chu ky packet tb %0d cycle, ky vong ~1.000.000 (10 ms)",
                         period_sum / period_cnt);
                fail_cnt = fail_cnt + 1;
            end else begin
                $display("  PASS chu ky packet ~10 ms => ~100 FPS (khong phai 200)");
                pass_cnt = pass_cnt + 1;
            end

            // 3. Khong duoc co khoang cach < 500.000 cycle: chung to trigger
            //    chong len packet dang gui (mat frame that).
            if (period_min < TRIG) begin
                $display("FAIL: co khoang cach %0d < MOCK_DIV %0d (trigger chong packet)",
                         period_min, TRIG);
                fail_cnt = fail_cnt + 1;
            end else begin
                $display("  PASS khong co trigger chong packet (min=%0d >= %0d)",
                         period_min, TRIG);
                pass_cnt = pass_cnt + 1;
            end

            // 4. led_uart_busy: UART ban lien tuc nen LED gan nhu sang lien tuc
            //    (day la ly do KHONG duoc dung LED lam thuoc do FPS).
            $display("  INFO: led_uart_busy hien tai = %b (1 = tat do LED active-LOW)",
                     led_uart_busy);
        end

        $display("=== SUMMARY: PASS=%0d FAIL=%0d, packet_done=%0d ===",
                 pass_cnt, fail_cnt, n_done);
        if (fail_cnt != 0) $fatal(1, "tb_kvc_top_demo_rate FAILED");
        $display("PASS: tb_kvc_top_demo_rate completed");
        $finish;
    end

endmodule
