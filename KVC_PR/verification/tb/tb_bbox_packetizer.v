`timescale 1ns/1ps

module tb_bbox_packetizer;

    parameter integer MAX_BBOX    = 20;
    parameter integer CLK_FREQ_HZ = 100_000_000;
    parameter integer BAUD_RATE   = 5_000_000;

    reg clk;
    reg rst_n;

    // mock_bbox signals
    reg trigger;
    reg [1:0] mode;
    wire [63:0] mb_bbox_data;
    wire mb_bbox_valid;
    wire [7:0] mb_bbox_count;
    wire mb_frame_done;

    // packetizer signals
    reg start;
    reg [31:0] timestamp;
    reg force_bad_crc;
    reg [7:0] packetizer_bbox_count;
    reg [15:0] expected_crc;
    reg [15:0] sent_crc;

    wire [7:0] pack_uart_tx_data;
    wire       pack_uart_tx_start;
    wire       pack_packet_done;
    wire       pack_uart_tx_busy;

    // instantiate mock_bbox
    mock_bbox #(.MAX_BBOX(MAX_BBOX)) mock (
        .clk(clk),
        .rst_n(rst_n),
        .trigger(trigger),
        .mode(mode),
        .bbox_data(mb_bbox_data),
        .bbox_valid(mb_bbox_valid),
        .bbox_count_out(mb_bbox_count),
        .frame_done(mb_frame_done)
    );

    // instantiate packetizer
    bbox_packetizer #(.MAX_BBOX(MAX_BBOX), .VERSION(8'h01)) pack (
        .clk(clk),
        .rst_n(rst_n),
        .bbox_data(mb_bbox_data),
        .bbox_valid(mb_bbox_valid),
        .bbox_count(packetizer_bbox_count),
        .timestamp(timestamp),
        .start(start),
        .force_bad_crc(force_bad_crc),
        .uart_tx_busy(pack_uart_tx_busy),
        .uart_tx_data(pack_uart_tx_data),
        .uart_tx_start(pack_uart_tx_start),
        .packet_done(pack_packet_done)
    );

    // instantiate real uart_tx to provide uart_tx_busy behavior
    wire uart_tx_line;
    wire tx_done;
    uart_tx #(
        .CLK_FREQ_HZ(CLK_FREQ_HZ),
        .BAUD_RATE(BAUD_RATE)
    ) uart_inst (
        .clk(clk),
        .rst_n(rst_n),
        .tx_data(pack_uart_tx_data),
        .tx_valid(1'b0),
        .tx_start(pack_uart_tx_start),
        .tx(uart_tx_line),
        .tx_busy(pack_uart_tx_busy),
        .tx_done(tx_done)
    );

    // clock (100MHz)
    initial begin
        clk = 0;
        forever #5 clk = ~clk;
    end

    // capture emitted bytes when pack_uart_tx_start pulses
    reg [7:0] captured [0:4095];
    integer cap_idx;
    integer i;

    // reference buffer for computing expected CRC
    reg [7:0] ref_buf [0:4095];
    integer ref_len;

    // CRC reference calculation (CCITT-FALSE: poly 0x1021, init 0xFFFF)
    function [15:0] calc_crc_ref;
        input integer byte_count;
        integer idx, kk;
        reg [15:0] crc;
        begin
            crc = 16'hFFFF;
            for (idx = 0; idx < byte_count; idx = idx + 1) begin
                crc = crc ^ (ref_buf[idx] << 8);
                for (kk = 0; kk < 8; kk = kk + 1) begin
                    if (crc[15])
                        crc = (crc << 1) ^ 16'h1021;
                    else
                        crc = (crc << 1);
                end
                crc = crc & 16'hFFFF;
            end
            calc_crc_ref = crc & 16'hFFFF;
        end
    endfunction

    // capture bytes on uart start
    always @(posedge clk) begin
        if (pack_uart_tx_start) begin
            captured[cap_idx] <= pack_uart_tx_data;
            cap_idx <= cap_idx + 1;
        end
    end

    // Watchdog
    initial begin
        #50_000_000; // 50ms max simulation time
        $display("[WATCHDOG TIMEOUT] Simulation time limit reached at %0t", $time);
        $finish;
    end

    initial begin
        // init
        rst_n = 1'b0;
        trigger = 1'b0;
        mode = 2'b00;
        start = 1'b0;
        timestamp = 32'h5A5A5A5A;
        force_bad_crc = 1'b0;
        packetizer_bbox_count = 8'd0;
        cap_idx = 0;
        ref_len = 0;
        #100;
        @(posedge clk);
        #1;
        rst_n = 1'b1;
        @(posedge clk);

        $display("[%0t] TB: Start bbox_packetizer tests (with uart handshake)", $time);

        // -----------------------------
        // Test A: 0 bbox
        // -----------------------------
        cap_idx = 0;
        ref_len = 0;
        mode = 2'b00;
        #1; trigger = 1'b1; @(posedge clk); #1; trigger = 1'b0;
        wait (mb_frame_done == 1);
        @(posedge clk);
        #1;
        packetizer_bbox_count = mb_bbox_count;
        start = 1'b1; @(posedge clk); #1; start = 1'b0;
        wait (pack_packet_done == 1);

        ref_len = 0;
        ref_buf[ref_len++] = 8'h5A;
        ref_buf[ref_len++] = 8'hA5;
        ref_buf[ref_len++] = 8'h01;
        ref_buf[ref_len++] = 8'h00;
        ref_buf[ref_len++] = timestamp[31:24];
        ref_buf[ref_len++] = timestamp[23:16];
        ref_buf[ref_len++] = timestamp[15:8];
        ref_buf[ref_len++] = timestamp[7:0];
        expected_crc = calc_crc_ref(ref_len);
        ref_buf[ref_len++] = expected_crc[15:8];
        ref_buf[ref_len++] = expected_crc[7:0];

        $display("[%0t] TB A: captured %0d bytes, expected %0d", $time, cap_idx, ref_len);
        if (cap_idx != ref_len) $display("  FAIL A: len mismatch");
        for (i = 0; i < ref_len; i = i + 1) begin
            if (captured[i] !== ref_buf[i]) $display("  FAIL A: byte %0d mismatch got 0x%02X expected 0x%02X", i, captured[i], ref_buf[i]);
        end
        if (cap_idx == ref_len) $display("  PASS A: 0 bbox");

        // -----------------------------
        // Test B: 1 bbox
        // -----------------------------
        cap_idx = 0;
        ref_len = 0;
        mode = 2'b01;
        #1; trigger = 1'b1; @(posedge clk); #1; trigger = 1'b0;
        wait (mb_frame_done == 1);
        @(posedge clk);
        #1;
        packetizer_bbox_count = mb_bbox_count;
        start = 1'b1; @(posedge clk); #1; start = 1'b0;
        wait (pack_packet_done == 1);

        ref_len = 0;
        ref_buf[ref_len++] = 8'h5A; ref_buf[ref_len++] = 8'hA5; ref_buf[ref_len++] = 8'h01;
        ref_buf[ref_len++] = 8'h01;
        ref_buf[ref_len++] = timestamp[31:24]; ref_buf[ref_len++] = timestamp[23:16];
        ref_buf[ref_len++] = timestamp[15:8];  ref_buf[ref_len++] = timestamp[7:0];
        ref_buf[ref_len++] = 8'h01; ref_buf[ref_len++] = 8'h40;
        ref_buf[ref_len++] = 8'h00; ref_buf[ref_len++] = 8'hF0;
        ref_buf[ref_len++] = 8'h32; ref_buf[ref_len++] = 8'h64;
        ref_buf[ref_len++] = 8'h01; ref_buf[ref_len++] = 8'd90;
        expected_crc = calc_crc_ref(ref_len);
        ref_buf[ref_len++] = expected_crc[15:8]; ref_buf[ref_len++] = expected_crc[7:0];

        $display("[%0t] TB B: captured %0d bytes, expected %0d", $time, cap_idx, ref_len);
        if (cap_idx != ref_len) $display("  FAIL B: len mismatch");
        for (i = 0; i < ref_len; i = i + 1) begin
            if (captured[i] !== ref_buf[i]) $display("  FAIL B: byte %0d mismatch (got 0x%02X, exp 0x%02X)", i, captured[i], ref_buf[i]);
        end
        if (cap_idx == ref_len) $display("  PASS B: 1 bbox");

        // -----------------------------
        // Test C: 20 bbox
        // -----------------------------
        cap_idx = 0;
        ref_len = 0;
        mode = 2'b11; // 20
        #1; trigger = 1'b1; @(posedge clk); #1; trigger = 1'b0;
        wait (mb_frame_done == 1);
        @(posedge clk);
        #1;
        packetizer_bbox_count = mb_bbox_count;
        start = 1'b1; @(posedge clk); #1; start = 1'b0;
        wait (pack_packet_done == 1);

        ref_len = 0;
        ref_buf[ref_len++] = 8'h5A; ref_buf[ref_len++] = 8'hA5; ref_buf[ref_len++] = 8'h01;
        ref_buf[ref_len++] = 8'd20;
        ref_buf[ref_len++] = timestamp[31:24]; ref_buf[ref_len++] = timestamp[23:16];
        ref_buf[ref_len++] = timestamp[15:8]; ref_buf[ref_len++] = timestamp[7:0];
        for (i = 0; i < 20; i = i + 1) begin
            if ((i % 2) == 0) begin
                ref_buf[ref_len++] = 8'h01; ref_buf[ref_len++] = 8'h40;
                ref_buf[ref_len++] = 8'h00; ref_buf[ref_len++] = 8'hF0;
                ref_buf[ref_len++] = 8'h32; ref_buf[ref_len++] = 8'h64;
                ref_buf[ref_len++] = 8'h01; ref_buf[ref_len++] = 8'd90;
            end else begin
                ref_buf[ref_len++] = 8'h00; ref_buf[ref_len++] = 8'h64;
                ref_buf[ref_len++] = 8'h00; ref_buf[ref_len++] = 8'hC8;
                ref_buf[ref_len++] = 8'h50; ref_buf[ref_len++] = 8'h50;
                ref_buf[ref_len++] = 8'h02; ref_buf[ref_len++] = 8'd95;
            end
        end
        expected_crc = calc_crc_ref(ref_len);
        ref_buf[ref_len++] = expected_crc[15:8]; ref_buf[ref_len++] = expected_crc[7:0];

        $display("[%0t] TB C: captured %0d bytes, expected %0d", $time, cap_idx, ref_len);
        if (cap_idx == ref_len) $display("  PASS C: 20 bbox");
        else $display("  FAIL C: length mismatch (%0d vs %0d)", cap_idx, ref_len);

        // -----------------------------
        // Test D: force_bad_crc
        // -----------------------------
        cap_idx = 0;
        ref_len = 0;
        mode = 2'b01; // 1 bbox
        #1; trigger = 1'b1; @(posedge clk); #1; trigger = 1'b0;
        wait (mb_frame_done == 1);
        @(posedge clk);
        #1;
        packetizer_bbox_count = mb_bbox_count;
        force_bad_crc = 1'b1;
        start = 1'b1; @(posedge clk); #1; start = 1'b0;
        wait (pack_packet_done == 1);
        force_bad_crc = 1'b0;

        ref_len = 0;
        ref_buf[ref_len++] = 8'h5A; ref_buf[ref_len++] = 8'hA5; ref_buf[ref_len++] = 8'h01;
        ref_buf[ref_len++] = 8'h01;
        ref_buf[ref_len++] = timestamp[31:24]; ref_buf[ref_len++] = timestamp[23:16];
        ref_buf[ref_len++] = timestamp[15:8]; ref_buf[ref_len++] = timestamp[7:0];
        ref_buf[ref_len++] = 8'h01; ref_buf[ref_len++] = 8'h40;
        ref_buf[ref_len++] = 8'h00; ref_buf[ref_len++] = 8'hF0;
        ref_buf[ref_len++] = 8'h32; ref_buf[ref_len++] = 8'h64;
        ref_buf[ref_len++] = 8'h01; ref_buf[ref_len++] = 8'd90;
        expected_crc = calc_crc_ref(ref_len);

        if (cap_idx >= 2) begin
            sent_crc = {captured[cap_idx-2], captured[cap_idx-1]};
            if (sent_crc !== expected_crc) $display("  PASS D: CRC intentionally corrupted (sent 0x%04X expected 0x%04X)", sent_crc, expected_crc);
            else $display("  FAIL D: CRC was not corrupted (sent correct 0x%04X)", sent_crc);
        end else begin
            $display("  FAIL D: insufficient captured bytes");
        end

        // -----------------------------
        // Test E: bbox_count > stored_count -> clamp
        // -----------------------------
        cap_idx = 0;
        ref_len = 0;
        mode = 2'b10; // 2 bboxes stored
        #1; trigger = 1'b1; @(posedge clk); #1; trigger = 1'b0;
        wait (mb_frame_done == 1);
        @(posedge clk);
        #1;
        packetizer_bbox_count = mb_bbox_count + 8'd3; // request bigger than stored
        start = 1'b1; @(posedge clk); #1; start = 1'b0;
        wait (pack_packet_done == 1);

        ref_len = 0;
        ref_buf[ref_len++] = 8'h5A; ref_buf[ref_len++] = 8'hA5; ref_buf[ref_len++] = 8'h01;
        ref_buf[ref_len++] = mb_bbox_count; // clamped
        ref_buf[ref_len++] = timestamp[31:24]; ref_buf[ref_len++] = timestamp[23:16];
        ref_buf[ref_len++] = timestamp[15:8]; ref_buf[ref_len++] = timestamp[7:0];
        for (i = 0; i < mb_bbox_count; i = i + 1) begin
            if ((i % 2) == 0) begin
                ref_buf[ref_len++] = 8'h01; ref_buf[ref_len++] = 8'h40;
                ref_buf[ref_len++] = 8'h00; ref_buf[ref_len++] = 8'hF0;
                ref_buf[ref_len++] = 8'h32; ref_buf[ref_len++] = 8'h64;
                ref_buf[ref_len++] = 8'h01; ref_buf[ref_len++] = 8'd90;
            end else begin
                ref_buf[ref_len++] = 8'h00; ref_buf[ref_len++] = 8'h64;
                ref_buf[ref_len++] = 8'h00; ref_buf[ref_len++] = 8'hC8;
                ref_buf[ref_len++] = 8'h50; ref_buf[ref_len++] = 8'h50;
                ref_buf[ref_len++] = 8'h02; ref_buf[ref_len++] = 8'd95;
            end
        end
        expected_crc = calc_crc_ref(ref_len);
        ref_buf[ref_len++] = expected_crc[15:8]; ref_buf[ref_len++] = expected_crc[7:0];

        $display("[%0t] TB E: captured %0d bytes, expected %0d (clamped to stored)", $time, cap_idx, ref_len);
        if (cap_idx == ref_len) $display("  PASS E: bbox_count > stored_count clamped correctly");
        else $display("  FAIL E: length mismatch (captured %0d expected %0d)", cap_idx, ref_len);

        $display("[%0t] TB: All tests finished", $time);
        #100;
        $finish;
    end

endmodule
