// -----------------------------------------------------------------------------
// tb_vsync_impact.v — Calibrate: VSYNC frequency -> measured FPS
//
// MUC DICH
//   Tren bo 01/11/2026, capture cho FPS = 100.4 (interval trung binh 9.9555 ms)
//   trong khi ba lan truoc do (bang khoi tao camera cu) cho dung 100.0
//   (interval 10.0000 ms, shortfall 0). Chenh lech 70 ms tren 15.67 s.
//
//   Cau hoi: 100.4 FPS tuong ung voi VSYNC bao nhieu Hz?
//   Neu 30 Hz cho ~105 FPS thi 100.4 KHONG the la 30 Hz.
//
// PHUONG PHAP
//   Bom xung VSYNC tong hop vao kvc_top_demo voi tan so biet truoc, do FPS.
//   Lap bang anh xa VSYNC -> FPS, roi nguoc lai tu FPS quan sat duoc.
//
//   sim_stubs.v cho rPLL di thang nen clk_100m = clk_27m = 100 MHz,
//   1 cycle = 10 ns.
//
// TAI SAO KHONG RESET DUT GIUA CAC CA:
//   Reset lai DUT doi hoi reset ca SCCB FSM (POR 20 ms) va mock counter,
//   lam sim chay rat lau. Thay vao do chi TAT VSYNC giua cac cua so do va
//   do tren cua so rieng, dung hieu so frame.
//
// Exit code: khong dung $fatal vi day la TB CALIBRATION, in bang ra de doc.
// -----------------------------------------------------------------------------
`timescale 1ns/1ps

module tb_vsync_impact;

    localparam real    CLK_T   = 10.0;      // 100 MHz
    localparam integer WIN_CYC = 10_000_000; // 100 ms moi cua so
    localparam integer WARM_CYC =  500_000;  // 5 ms

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

    always #(CLK_T/2) clk_27m = ~clk_27m;

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

    integer done_cnt = 0;
    always @(posedge clk_27m)
        if (rst_n && dut.pack_packet_done) done_cnt <= done_cnt + 1;

    // ------------------------------------------------------------------
    // Generator VSYNC chay trong background, dieu khien boi g_period_ns.
    // Nguyen tac: khi g_period_ns <= 0 thi giu VSYNC = 0 va chi ngu.
    // ------------------------------------------------------------------
    real g_period_ns = 0.0;

    initial begin : vsync_gen
        real half;
        forever begin
            if (g_period_ns <= 0.0) begin
                cam_vsync = 1'b0;
                #100_000;
            end else begin
                half      = g_period_ns / 2.0;
                cam_vsync = 1'b0;
                #(half);
                cam_vsync = 1'b1;
                #(200_000.0);
                cam_vsync = 1'b0;
                #(half - 200_000.0);
            end
        end
    end

    // ------------------------------------------------------------------
    // Mot ca do: dat tan so, do frame trong WIN_CYC
    // ------------------------------------------------------------------
    integer n_before, n_after, n_frame;
    real    fps;

    task automatic measure;
        input real    freq_hz;
        input [8*20-1:0] label;
        begin
            if (freq_hz <= 0.0) begin
                g_period_ns = 0.0;
                cam_vsync   = 1'b0;
            end else begin
                g_period_ns = 1.0e9 / freq_hz;
            end

            repeat (WARM_CYC) @(posedge clk_27m);

            n_before = done_cnt;
            repeat (WIN_CYC) @(posedge clk_27m);
            n_after  = done_cnt;

            n_frame = n_after - n_before;
            fps     = n_frame * 100_000_000.0 / WIN_CYC;

            $display("  %0s freq=%6.1f Hz -> %3d frame/100ms = %6.2f FPS",
                     label, freq_hz, n_frame, fps);
        end
    endtask

    initial begin
        $display("=== tb_vsync_impact: anh xa VSYNC -> FPS ===");
        $display("  100 MHz, cua so 100 ms, khong reset giua cac ca");
        $display("");

        rst_n = 1'b0;
        repeat (50) @(posedge clk_27m);
        rst_n = 1'b1;
        repeat (WARM_CYC) @(posedge clk_27m);

        measure(0.0,   "khong VSYNC");
        measure(5.0,   "5 Hz       ");
        measure(15.0,  "15 Hz      ");
        measure(30.0,  "30 Hz      ");
        measure(60.0,  "60 Hz      ");
        measure(200.0, "200 Hz     ");

        $display("");
        $display("=== Done ===");
        $finish;
    end

    // Watchdog: khong duoc treo qua 200 ms sim
    initial begin
        #(200_000_000);
        $display("WATCHDOG: sim treo qua 200 ms, dung.");
        $finish;
    end

endmodule
