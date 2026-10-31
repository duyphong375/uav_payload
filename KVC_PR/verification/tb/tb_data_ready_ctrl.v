// -----------------------------------------------------------------------------
// Testbench: tb_data_ready_ctrl.v (updated to use SIM=1)
// Author: Vững (assistant)
// Date:   2026-10-15
// Desc:   Testbench cho data_ready_ctrl với các test cases sau:
//   1) Frame valid -> packet_done -> data_ready high -> MCU ACK -> data_ready low
//   2) Frame valid -> packet_done -> no ACK -> timeout -> data_ready low & timeout_flag=1
//   3) Frame valid liên tục -> data_ready giữ cao (cho đến ACK)
//   4) Reset giữa chừng -> data_ready về 0
//   5) clear_timeout: MCU clears timeout_flag via clear_timeout pulse
//   6) packet_done gate: frame_valid without packet_done does NOT assert data_ready
// - Mô phỏng nhanh: instantiate DUT với SIM=1 (CYCLES_PER_MS=10)
// - Clock: 100 MHz (10 ns), nhưng ms scaled by SIM
// - Dump VCD tb_data_ready_ctrl.vcd
// -----------------------------------------------------------------------------
`timescale 1ns/1ps
module tb_data_ready_ctrl;

    // signals
    reg clk;
    reg rst_n;
    reg frame_valid;
    reg packet_done;
    reg mcu_ack;
    reg clear_timeout;
    reg [15:0] timeout_ms;
    wire data_ready;
    wire timeout_flag;

    // instantiate DUT with SIM=1 for fast simulation
    data_ready_ctrl #(
        .CLK_FREQ_HZ(100_000_000),
        .SIM(1) // use fast sim cycles per ms = 10
    ) dut (
        .clk(clk),
        .rst_n(rst_n),
        .frame_valid(frame_valid),
        .packet_done(packet_done),
        .mcu_ack(mcu_ack),
        .clear_timeout(clear_timeout),
        .timeout_ms(timeout_ms),
        .data_ready(data_ready),
        .timeout_flag(timeout_flag)
    );

    // clock gen: 100 MHz
    initial begin
        clk = 1'b0;
        forever #5 clk = ~clk;
    end

    // helper wait cycles
    task wait_cycles(input integer n);
        integer i;
        begin
            for (i = 0; i < n; i = i + 1) @(posedge clk);
        end
    endtask

    // helper convert ms->cycles (SIM=1: CYCLES_PER_MS=10)
    function integer ms_to_cycles;
        input integer ms;
        begin
            // matches DUT SIM=1 param: 10 cycles per ms
            ms_to_cycles = ms * 10;
        end
    endfunction

    integer pass_cnt = 0;
    integer fail_cnt = 0;

    initial begin
        $dumpfile("tb_data_ready_ctrl.vcd");
        $dumpvars(0, tb_data_ready_ctrl);

        // init
        rst_n = 1'b0;
        frame_valid = 1'b0;
        packet_done = 1'b0;
        mcu_ack = 1'b0;
        clear_timeout = 1'b0;
        timeout_ms = 16'd100; // default, but tests override
        #200;
        @(posedge clk);
        rst_n = 1'b1;
        @(posedge clk);

        $display("[%0t] TB: Start data_ready_ctrl tests (SIM=1)", $time);

        // ---------------------------------------------------------------------
        // Test 1: Normal flow: frame_valid + packet_done -> data_ready -> ACK -> deassert
        // ---------------------------------------------------------------------
        timeout_ms = 16'd50; // 50 ms (but SIM small)
        frame_valid = 1'b1; @(posedge clk); frame_valid = 1'b0;
        // no packet_done yet -> data_ready should NOT assert
        wait_cycles(2);
        if (data_ready == 0) begin
            $display("Test1: OK: data_ready not asserted before packet_done");
        end

        packet_done = 1'b1; @(posedge clk); packet_done = 1'b0; // now packet ready
        // DUT should assert data_ready
        wait_cycles(1);
        if (data_ready == 1) begin
            $display("Test1: data_ready asserted after packet_done - OK");
        end else begin
            $display("Test1: FAIL: data_ready not asserted");
            fail_cnt = fail_cnt + 1;
        end

        // wait at least hold time (simulate >1 ms)
        wait_cycles(ms_to_cycles(2)); // 2 ms
        // pulse MCU ack
        @(posedge clk); mcu_ack = 1'b1; @(posedge clk); mcu_ack = 1'b0;
        // allow some cycles
        wait_cycles(2);
        if (data_ready == 0) begin
            $display("Test1: PASS: ACK cleared data_ready");
            pass_cnt = pass_cnt + 1;
        end else begin
            $display("Test1: FAIL: data_ready still high after ACK");
            fail_cnt = fail_cnt + 1;
        end

        // ---------------------------------------------------------------------
        // Test 2: Timeout flow: no ACK -> timeout occurs -> timeout_flag set
        // ---------------------------------------------------------------------
        timeout_ms = 16'd2; // 2 ms (fast)
        frame_valid = 1'b1; @(posedge clk); frame_valid = 1'b0;
        packet_done = 1'b1; @(posedge clk); packet_done = 1'b0;
        // data_ready asserted
        wait_cycles(1);
        if (data_ready != 1) begin
            $display("Test2: FAIL: data_ready not asserted");
            fail_cnt = fail_cnt + 1;
        end
        // wait for timeout_ms + margin
        wait_cycles(ms_to_cycles(2) + 5);
        if (data_ready == 0 && timeout_flag == 1) begin
            $display("Test2: PASS: timeout occurred and data_ready cleared");
            pass_cnt = pass_cnt + 1;
        end else begin
            $display("Test2: FAIL: data_ready=%b timeout_flag=%b", data_ready, timeout_flag);
            fail_cnt = fail_cnt + 1;
        end

        // Now test clear_timeout input clears the flag
        clear_timeout = 1'b1; @(posedge clk); clear_timeout = 1'b0;
        wait_cycles(1);
        if (timeout_flag == 0) begin
            $display("Test2b: PASS: clear_timeout cleared timeout_flag");
            pass_cnt = pass_cnt + 1;
        end else begin
            $display("Test2b: FAIL: timeout_flag not cleared");
            fail_cnt = fail_cnt + 1;
        end

        // ---------------------------------------------------------------------
        // Test 3: Continuous frames -> data_ready remains high until ack
        // ---------------------------------------------------------------------
        timeout_ms = 16'd20;
        // send a frame and keep sending frame_valid pulses (pending_frame should be set)
        frame_valid = 1'b1; @(posedge clk); frame_valid = 1'b0;
        packet_done = 1'b1; @(posedge clk); packet_done = 1'b0;
        wait_cycles(1);
        if (data_ready != 1) begin
            $display("Test3: FAIL: data_ready not asserted");
            fail_cnt = fail_cnt + 1;
        end
        // while data_ready is high, assert repeated frame_valid pulses (should not cause deassert)
        repeat (5) begin
            frame_valid = 1'b1; @(posedge clk); frame_valid = 1'b0;
            wait_cycles(1);
        end
        if (data_ready == 1) begin
            $display("Test3: PASS: data_ready remained high during continuous frames");
            pass_cnt = pass_cnt + 1;
        end else begin
            $display("Test3: FAIL: data_ready low unexpectedly");
            fail_cnt = fail_cnt + 1;
        end
        // clear by ack after hold
        wait_cycles(ms_to_cycles(2));
        @(posedge clk); mcu_ack = 1'b1; @(posedge clk); mcu_ack = 1'b0;
        wait_cycles(1);
        if (data_ready == 0) begin
            $display("Test3: PASS end: ACK cleared data_ready");
            pass_cnt = pass_cnt + 1;
        end else begin
            $display("Test3: FAIL end: data_ready still high");
            fail_cnt = fail_cnt + 1;
        end

        // ---------------------------------------------------------------------
        // Test 4: Reset behavior clears data_ready and flags
        // ---------------------------------------------------------------------
        timeout_ms = 16'd10;
        frame_valid = 1'b1; @(posedge clk); frame_valid = 1'b0;
        packet_done = 1'b1; @(posedge clk); packet_done = 1'b0;
        wait_cycles(1);
        if (data_ready != 1) begin
            $display("Test4: FAIL before reset data_ready not asserted");
            fail_cnt = fail_cnt + 1;
        end
        // apply asynchronous reset
        #10; rst_n = 1'b0; #20; rst_n = 1'b1; @(posedge clk);
        wait_cycles(1);
        if (data_ready == 0 && timeout_flag == 0) begin
            $display("Test4: PASS: reset cleared outputs");
            pass_cnt = pass_cnt + 1;
        end else begin
            $display("Test4: FAIL: outputs not cleared after reset data_ready=%b timeout_flag=%b", data_ready, timeout_flag);
            fail_cnt = fail_cnt + 1;
        end

        // ---------------------------------------------------------------------
        // Test 5: packet_done gating: frame_valid without packet_done should NOT assert data_ready until packet_done
        // ---------------------------------------------------------------------
        timeout_ms = 16'd10;
        frame_valid = 1'b1; @(posedge clk); frame_valid = 1'b0;
        // do NOT pulse packet_done yet
        wait_cycles(5);
        if (data_ready == 0) begin
            $display("Test5: PASS: data_ready not asserted before packet_done");
            pass_cnt = pass_cnt + 1;
        end else begin
            $display("Test5: FAIL: data_ready asserted without packet_done");
            fail_cnt = fail_cnt + 1;
        end
        // now pulse packet_done -> should assert
        packet_done = 1'b1; @(posedge clk); packet_done = 1'b0;
        wait_cycles(1);
        if (data_ready == 1) begin
            $display("Test5: PASS: data_ready asserted after packet_done");
            pass_cnt = pass_cnt + 1;
        end else begin
            $display("Test5: FAIL: data_ready did not assert after packet_done");
            fail_cnt = fail_cnt + 1;
        end
        // clear by ack
        wait_cycles(ms_to_cycles(2));
        @(posedge clk); mcu_ack = 1'b1; @(posedge clk); mcu_ack = 1'b0;
        wait_cycles(1);

        $display("-----------------------------------------------------------------");
        $display("TB SUMMARY: PASS=%0d FAIL=%0d", pass_cnt, fail_cnt);
        $display("-----------------------------------------------------------------");

        #100;
        $finish;
    end

endmodule