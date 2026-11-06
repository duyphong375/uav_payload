// -----------------------------------------------------------------------------
// Testbench: tb_kvc_top.v
// Author: Vững (assistant)
// Date:   2026-10-15
// Desc:   Testbench cho kvc_top (mock and real modes).
// - Uses fast fake UART inside top (USE_FAKE_UART=1)
// - Tests:
//    1) MOCK mode: pulse mock_trigger -> packetizer -> fake UART -> verify bytes
//    2) REAL mode: feed simple camera frame -> simple_detector emits bbox -> packetizer -> UART
// - Dumps VCD: tb_kvc_top.vcd
// -----------------------------------------------------------------------------
`timescale 1ns/1ps
module tb_kvc_top;

    reg clk_27m;
    reg rst_n;

    // camera signals (for REAL mode)
    reg cam_pclk;
    reg cam_vsync;
    reg cam_href;
    reg [7:0] cam_data;

    // top outputs
    wire cam_xclk;
    wire cam_rst_n;
    wire cam_pwdn;
    wire cam_scl;
    wire cam_sda;
    wire uart_tx;
    wire data_ready;
    reg  mcu_ack;
    wire [15:0] pixel_debug;
    wire pixel_valid_debug;

    // test control
    reg mock_trigger;

    // Instantiate kvc_top in MOCK mode with fake uart for fast sim
    kvc_top #(.USE_MOCK(1), .USE_FAKE_UART(1)) dut_mock (
        .clk_27m(clk_27m),
        .rst_n(rst_n),
        .cam_pclk(cam_pclk),
        .cam_vsync(cam_vsync),
        .cam_href(cam_href),
        .cam_data(cam_data),
        .cam_xclk(cam_xclk),
        .cam_rst_n(cam_rst_n),
        .cam_pwdn(cam_pwdn),
        .cam_scl(cam_scl),
        .cam_sda(cam_sda),
        .uart_tx(uart_tx),
        .data_ready(data_ready),
        .mcu_ack(mcu_ack),
        .pixel_debug(pixel_debug),
        .pixel_valid_debug(pixel_valid_debug),
        .mock_trigger(mock_trigger)
    );

    // For visibility capture fake uart debug inside top: hierarchical reference to uart data
    // Fake uart in top exposes tx_data_dbg and tx_valid_dbg as internal nets; we can't directly access them unless they are ports.
    // For this testbench, we will sample top internals via hierarchical names (allowed in many simulators).
    // Signal names depend on top instantiation; attempt to reference:
    wire [7:0] uart_dbg;
    wire uart_dbg_valid;
    // Note: hierarchical access may vary; use these references for common simulators:
    assign uart_dbg = dut_mock.uart_tx_data_dbg;
    assign uart_dbg_valid = dut_mock.uart_tx_valid_dbg;

    // Clock generation
    initial begin
        clk_27m = 1'b0;
        forever #19 clk_27m = ~clk_27m; // ~27MHz (approx)
    end

    // cam_pclk for simulation: tie to 24 MHz equivalent for simple test (approx)
    initial begin
        cam_pclk = 1'b0;
        forever #21 cam_pclk = ~cam_pclk; // ~24MHz
    end

    initial begin
        $dumpfile("tb_kvc_top.vcd");
        $dumpvars(0, tb_kvc_top);

        // init
        rst_n = 1'b0;
        cam_vsync = 1'b0; cam_href = 1'b0; cam_data = 8'h00;
        mock_trigger = 1'b0;
        mcu_ack = 1'b0;
        #200;
        @(posedge clk_27m);
        rst_n = 1'b1;
        @(posedge clk_27m);

        $display("[%0t] TB: Start KVC top tests (MOCK mode)", $time);

        // Test MOCK: pulse mock_trigger to create a frame with BBoxes
        // mock_bbox in top is configured to produce MAX_BBOX by default; packetizer will send packet when frame_done
        mock_trigger = 1'b1;
        @(posedge clk_27m);
        mock_trigger = 1'b0;

        // Wait for data_ready to assert (packetizer triggers packet_done => data_ready asserted by data_ready_ctrl)
        // Allow some cycles
        wait (uart_dbg_valid == 1'b1);
        // capture a few bytes
        integer cnt;
        cnt = 0;
        reg [7:0] captured [0:1023];
        while (cnt < 32) begin
            @(posedge clk_27m);
            if (uart_dbg_valid) begin
                captured[cnt] = uart_dbg;
                $display("  captured byte[%0d] = 0x%02X", cnt, captured[cnt]);
                cnt = cnt + 1;
            end
        end
        // Check synchronization bytes at start
        if ((captured[0] == 8'h5A) && (captured[1] == 8'hA5)) $display("  PASS MOCK: packet sync found");
        else $display("  FAIL MOCK: sync mismatch %02X %02X", captured[0], captured[1]);

        // Check data_ready asserted when packet_done occurred
        if (data_ready) $display("  PASS MOCK: data_ready asserted");
        else $display("  FAIL MOCK: data_ready not asserted");

        // Simulate MCU ACK to clear data_ready
        @(posedge clk_27m); mcu_ack = 1'b1; @(posedge clk_27m); mcu_ack = 1'b0;
        wait (!data_ready);
        $display("  INFO: data_ready cleared after MCU ack");

        // ---------------------------------------------------------------------
        // Test REAL mode: instantiate another top with USE_MOCK=0, USE_FAKE_UART=1
        // Feed camera signals to produce frames; simple_detector will produce one bbox per frame
        // ---------------------------------------------------------------------
        $display("[%0t] TB: Start REAL mode test", $time);
        kvc_top #(.USE_MOCK(0), .USE_FAKE_UART(1)) dut_real (
            .clk_27m(clk_27m),
            .rst_n(rst_n),
            .cam_pclk(cam_pclk),
            .cam_vsync(cam_vsync),
            .cam_href(cam_href),
            .cam_data(cam_data),
            .cam_xclk(), .cam_rst_n(), .cam_pwdn(),
            .cam_scl(), .cam_sda(),
            .uart_tx(), .data_ready(data_ready_real),
            .mcu_ack(mcu_ack),
            .pixel_debug(), .pixel_valid_debug(),
            .mock_trigger(1'b0)
        );

        // Hierarchical access to its fake uart debug
        wire [7:0] uart_dbg_real = dut_real.uart_tx_data_dbg;
        wire uart_dbg_valid_real = dut_real.uart_tx_valid_dbg;

        // Generate one camera frame (simple): assert vsync, then one line with two bytes per pixel for simplicity
        // Simulate that camera_rx and bridge capture produce frame_start -> simple_detector emits bbox -> packetizer -> uart
        // Produce a single frame (we don't need real pixel values for detector placeholder)
        @(posedge cam_pclk); cam_vsync = 1'b1; @(posedge cam_pclk);
        // simulate a few pclk cycles while vsync high
        repeat (10) @(posedge cam_pclk);
        @(posedge cam_pclk); cam_vsync = 1'b0;

        // Wait for uart output from real top
        wait (uart_dbg_valid_real == 1);
        // capture first few bytes
        reg [7:0] cap_real [0:31];
        integer rcnt; rcnt = 0;
        while (rcnt < 16) begin
            @(posedge clk_27m);
            if (uart_dbg_valid_real) begin
                cap_real[rcnt] = uart_dbg_real;
                $display("  REAL captured[%0d]=0x%02X", rcnt, cap_real[rcnt]);
                rcnt = rcnt + 1;
            end
        end
        // check sync
        if ((cap_real[0] == 8'h5A) && (cap_real[1] == 8'hA5)) $display("  PASS REAL: packet sync found");
        else $display("  FAIL REAL: sync mismatch in REAL top");

        $display("[%0t] TB: All kvc_top tests finished", $time);
        #200;
        $finish;
    end

endmodule