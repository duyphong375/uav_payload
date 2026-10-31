// -----------------------------------------------------------------------------
// tb_uart_tx.v — Testbench co assertion cho uart_tx
//
// Phuong phap: lay mau tai TAM moi bit (0.5, 1.5, ..., 9.5 bit-time ke tu
// canh xuong cua start bit). Khong dung do rong canh vi du lieu 0x00 lam
// duong tin hieu giu muc thap suot khung.
//
// Kiem chung:
//   1. Khung co dung 10 bit-time (start + 8 data + stop)
//   2. Start bit = 0, stop bit = 1
//   3. 8 bit du lieu giai ma dung thu tu LSB-first
//   4. Kiem 4 mau: 0x00, 0xFF, 0xA5, 0x5A
//
// Exit code: $fatal(1,...) khi fail
// -----------------------------------------------------------------------------
`timescale 1ns/1ps

module tb_uart_tx;

    localparam integer CLK_HZ   = 100_000_000;
    localparam integer BAUD     = 38_400;
    localparam real    CLK_T    = 1.0e9 / CLK_HZ;
    localparam integer BAUD_DIV = CLK_HZ / BAUD;
    localparam real    BIT_T    = BAUD_DIV * CLK_T;

    reg        clk = 1'b0;
    reg        rst_n = 1'b0;
    reg  [7:0] tx_data = 8'd0;
    reg        tx_start = 1'b0;

    wire       tx_pin;
    wire       tx_busy;
    wire       tx_done;
    wire       tx_ready;

    integer    pass_cnt = 0;
    integer    fail_cnt = 0;

    // Sticky flag bat tx_done (pulse 1 chu ky)
    reg        seen_done;

    // Monitor do do rong tx_busy cho frame gan nhat.
    // Khong the do trong task vi task da lay mau den 9.5 bit-time,
    // trong khi tx_busy ve 0 tai 9.0 bit-time.
    realtime   busy_rise_t, busy_width;
    always @(posedge tx_busy) busy_rise_t = $realtime;
    always @(negedge tx_busy) busy_width  = $realtime - busy_rise_t;

    always #(CLK_T/2) clk = ~clk;

    always @(posedge clk) begin
        if (!rst_n)      seen_done <= 1'b0;
        else if (tx_done) seen_done <= 1'b1;
    end

    uart_tx #(
        .CLK_FREQ_HZ(CLK_HZ),
        .BAUD_RATE  (BAUD)
    ) dut (
        .clk      (clk),
        .rst_n    (rst_n),
        .tx_data  (tx_data),
        .tx_valid (1'b0),
        .tx_start (tx_start),
        .tx_ready (tx_ready),
        .tx_pin   (tx_pin),
        .tx       (),
        .tx_busy  (tx_busy),
        .tx_done  (tx_done)
    );

    task automatic send_and_check;
        input [7:0] data;
        realtime t_start, frame_width;
        reg [7:0] rx;
        integer b;
        begin
            seen_done = 1'b0;

            @(posedge clk);
            tx_data  <= data;
            tx_start <= 1'b1;
            @(posedge clk);
            tx_start <= 1'b0;

            // Cho canh xuong dau tien = bat dau start bit
            @(negedge tx_pin);
            t_start = $realtime;

            // Lay mau tai tam start bit (0.5 bit-time)
            #(BIT_T * 0.5);
            if (tx_pin !== 1'b0) begin
                $display("FAIL 0x%02X: start bit sample = %b (expect 0)", data, tx_pin);
                fail_cnt = fail_cnt + 1;
            end else pass_cnt = pass_cnt + 1;

            // Lay mau 8 bit du lieu tai 1.5 .. 8.5 bit-time (LSB truoc)
            for (b = 0; b < 8; b = b + 1) begin
                #(BIT_T);
                rx[b] = tx_pin;
            end

            // Lay mau stop bit tai 9.5 bit-time
            #(BIT_T);
            if (tx_pin !== 1'b1) begin
                $display("FAIL 0x%02X: stop bit sample = %b (expect 1)", data, tx_pin);
                fail_cnt = fail_cnt + 1;
            end else pass_cnt = pass_cnt + 1;

            // Kiem byte giai ma
            if (rx !== data) begin
                $display("FAIL 0x%02X: decoded 0x%02X", data, rx);
                fail_cnt = fail_cnt + 1;
            end else begin
                $display("  PASS 0x%02X decode + framing", data);
                pass_cnt = pass_cnt + 1;
            end

            // Do thoi gian tx_busy tu monitor doc lap (xem khoi khai bao).
            // Phai la 9 bit-time (start + 8 data). Neu start bi lap 2 bit-time
            // thi se la 10 bit-time -> phat hien duoc loi cu.
            frame_width = busy_width;

            if (frame_width < BIT_T * 8.8 || frame_width > BIT_T * 9.2) begin
                $display("FAIL 0x%02X: busy width = %.0f ns, expect %.0f ns (9 bit-time)",
                         data, frame_width, BIT_T * 9.0);
                fail_cnt = fail_cnt + 1;
            end else begin
                $display("  PASS 0x%02X busy width = %.0f ns (9 bit-time)",
                         data, frame_width);
                pass_cnt = pass_cnt + 1;
            end

            // tx_done phai da xay ra
            if (!seen_done) begin
                $display("FAIL 0x%02X: tx_done never asserted", data);
                fail_cnt = fail_cnt + 1;
            end else pass_cnt = pass_cnt + 1;

            // tx_busy phai ve 0
            repeat (2) @(posedge clk);
            if (tx_busy !== 1'b0) begin
                $display("FAIL 0x%02X: tx_busy still 1", data);
                fail_cnt = fail_cnt + 1;
            end else pass_cnt = pass_cnt + 1;

            // Duong idle phai la 1
            if (tx_pin !== 1'b1) begin
                $display("FAIL 0x%02X: line not idle after frame", data);
                fail_cnt = fail_cnt + 1;
            end else pass_cnt = pass_cnt + 1;
        end
    endtask

    initial begin
        $display("=== tb_uart_tx (BAUD_DIV=%0d, BIT_T=%.0f ns) ===", BAUD_DIV, BIT_T);

        repeat (10) @(posedge clk);
        rst_n = 1'b1;
        repeat (5) @(posedge clk);

        if (tx_pin !== 1'b1) begin
            $display("FAIL: idle line = %b (expect 1)", tx_pin);
            fail_cnt = fail_cnt + 1;
        end else begin
            $display("  PASS idle line = 1");
            pass_cnt = pass_cnt + 1;
        end

        send_and_check(8'h00);
        send_and_check(8'hFF);
        send_and_check(8'hA5);
        send_and_check(8'h5A);

        $display("=== SUMMARY: PASS=%0d FAIL=%0d ===", pass_cnt, fail_cnt);
        if (fail_cnt != 0) $fatal(1, "tb_uart_tx FAILED with %0d error(s)", fail_cnt);
        $display("PASS: tb_uart_tx completed");
        $finish;
    end

    initial begin
        #(BIT_T * 120);
        $fatal(1, "TIMEOUT: tb_uart_tx exceeded simulation limit");
    end

endmodule
