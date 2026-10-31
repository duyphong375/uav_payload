`timescale 1ns/1ps

module tb_kvc_top_demo;

    // ------------------------------------------------------------
    // Clock / reset
    // ------------------------------------------------------------
    reg clk_27m;
    reg rst_n;

    // ------------------------------------------------------------
    // Camera
    // ------------------------------------------------------------
    reg cam_pclk;
    reg cam_vsync;
    reg cam_href;
    reg [7:0] cam_data;
    wire cam_xclk;

    // ------------------------------------------------------------
    // UART
    // ------------------------------------------------------------
    wire uart_tx;
    wire data_ready;
    reg  mcu_ack;

    // ------------------------------------------------------------
    // Debug
    // ------------------------------------------------------------
    wire led_camera_ok;
    wire led_cnn_done;
    wire led_uart_busy;

    // ------------------------------------------------------------
    // Simulated PLL
    // ------------------------------------------------------------
    reg clk_100m;
    initial begin
        clk_100m = 1'b0;
        forever #5 clk_100m = ~clk_100m; // 100MHz
    end

    // ------------------------------------------------------------
    // Simulated camera clock (PCLK)
    // ------------------------------------------------------------
    initial begin
        cam_pclk = 1'b0;
        forever #20 cam_pclk = ~cam_pclk; // 25MHz
    end

    // ------------------------------------------------------------
    // DUT top
    // ------------------------------------------------------------
    kvc_top_demo dut (
        .clk_27m(clk_27m),
        .rst_n(rst_n),

        .cam_pclk(cam_pclk),
        .cam_vsync(cam_vsync),
        .cam_href(cam_href),
        .cam_data(cam_data),

        .cam_xclk(cam_xclk),

        .ov2640_sda(),
        .ov2640_scl(),

        .spi_cs(),
        .spi_sclk(),
        .spi_mosi(),
        .spi_miso(1'b0),

        .uart_tx(uart_tx),
        .data_ready(data_ready),
        .mcu_ack(mcu_ack),

        .led_camera_ok(led_camera_ok),
        .led_cnn_done(led_cnn_done),
        .led_uart_busy(led_uart_busy)
    );

    // ------------------------------------------------------------
    // Camera frame generation
    // ------------------------------------------------------------
    integer x, y;
    task automatic send_camera_frame;
        begin
            cam_vsync = 1'b1;
            cam_href  = 1'b0;
            cam_data  = 16'd0;

            repeat (2) @(posedge cam_pclk);

            for (y = 0; y < 480; y = y + 1) begin
                cam_href = 1'b1;
                for (x = 0; x < 640; x = x + 1) begin
                    // RGB565 pattern: 2 bytes per pixel (High then Low)
                    cam_data = {3'b0, 5'd((x % 32))};
                    @(posedge cam_pclk);
                    cam_data = {2'b0, 6'd((y % 64))};
                    @(posedge cam_pclk);
                end
                cam_href = 1'b0;
                @(posedge cam_pclk);
            end

            cam_vsync = 1'b0;
            repeat (20) @(posedge cam_pclk);
        end
    endtask

    // ------------------------------------------------------------
    // Monitoring
    // ------------------------------------------------------------
    integer frame_counter;
    always @(posedge clk_100m) begin
        if (led_camera_ok)
            frame_counter = frame_counter + 1;
    end

    initial begin
        rst_n = 1'b0;
        clk_27m = 1'b0;
        cam_vsync = 1'b0;
        cam_href = 1'b0;
        cam_data = 16'd0;

        frame_counter = 0;

        repeat (10) @(posedge clk_100m);
        rst_n = 1'b1;

        // Kick off camera frame
        send_camera_frame();

        // allow pipeline run
        repeat (200000) @(posedge clk_100m);

        if (led_camera_ok)
            $display("PASS: camera pipeline progressed");
        else
            $display("WARN: camera pipeline status not observed");

        $finish;
    end

endmodule