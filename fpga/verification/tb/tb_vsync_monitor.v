// -----------------------------------------------------------------------------
// tb_vsync_monitor.v — Kiem chung bo tu do VSYNC (rev 2)
//
// MUC DICH
//   Chung minh `vsync_monitor` do dung khi KHONG co scope, va loc duoc glitch:
//     1. VSYNC deu ~65,6 ms      -> chi bucket 1x
//     2. Khong co xung           -> khong tang, khong treo
//     3. VSYNC deu 131 ms        -> bucket 2x (MOI trong rev 2)
//     4. Mau 1x/2x/3x/5x/6x      -> ca nam bucket deu > 0
//     5. Glitch 1 ms bi LOC      -> t_rejected tang, bucket khong bi ban
//     6. frame_pulse thieu       -> t_vsync - t_frame > 0
//     7. Tong bucket khop so chu ky
//
// CACH RUT NGAN THOI GIAN
//   TICK_HZ = 1 MHz (1 tick = 1 us) thay vi 10 kHz (100 us). Khi do 1 "ms"
//   cua module = 10 us thuc, nen VSYNC 65,6 ms thuc = 656 us thuc = 65,6 "ms"
//   module. Bucket so sanh bang "ms" module nen van kiem dung.
//
// CHONG RACE O CANH CLOCK
//   Moi thao tac drive deu bat dau bang `@(posedge clk); #1;` de nam trong
//   nua chu ky, khong tranh chao voi non-blocking assignment cua DUT.
//
// Exit code: $fatal(1) khi fail.
// -----------------------------------------------------------------------------
`timescale 1ns/1ps

module tb_vsync_monitor;

    localparam real    CLK_T      = 10.0;
    localparam integer CY_PER_MS  = 1000;   // 1 "ms" module = 1.000 cycle
    localparam integer WINDOW_MS  = 1200;
    localparam integer GLITCH_MS  = 10;

    reg clk   = 1'b0;
    reg rst_n = 1'b0;

    reg vsync_pulse = 1'b0;
    reg frame_pulse = 1'b0;

    always #(CLK_T/2) clk = ~clk;

    wire        snap;
    wire [15:0] w_vsync, w_periods, w_sum, w_min, w_max;
    wire [15:0] w_b1x, w_b2x, w_b3x, w_b5x, w_b6x;
    wire [15:0] w_bshort, w_bother, w_rejected;
    wire [15:0] t_vsync, t_frame, t_max, t_rejected;
    wire [15:0] t_b1x, t_b2x, t_b3x, t_b5x, t_b6x, t_bshort, t_bother;

    vsync_monitor #(
        .CLK_HZ   (100_000_000),
        .TICK_HZ  (1_000_000),
        .WINDOW_MS(WINDOW_MS),
        .GLITCH_MS(GLITCH_MS)
    ) dut (
        .clk         (clk),
        .rst_n       (rst_n),
        .vsync_pulse (vsync_pulse),
        .frame_pulse (frame_pulse),
        .snap        (snap),
        .w_vsync     (w_vsync),
        .w_periods   (w_periods),
        .w_sum_100us (w_sum),
        .w_min_ms    (w_min),
        .w_max_ms    (w_max),
        .w_b1x       (w_b1x),
        .w_b2x       (w_b2x),
        .w_b3x       (w_b3x),
        .w_b5x       (w_b5x),
        .w_b6x       (w_b6x),
        .w_bshort    (w_bshort),
        .w_bother    (w_bother),
        .w_rejected  (w_rejected),
        .t_vsync     (t_vsync),
        .t_frame     (t_frame),
        .t_max_ms    (t_max),
        .t_rejected  (t_rejected),
        .t_b1x       (t_b1x),
        .t_b2x       (t_b2x),
        .t_b3x       (t_b3x),
        .t_b5x       (t_b5x),
        .t_b6x       (t_b6x),
        .t_bshort    (t_bshort),
        .t_bother    (t_bother)
    );

    integer pass_cnt = 0;
    integer fail_cnt = 0;

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

    task automatic check_range;
        input [255:0] what;
        input integer got;
        input integer lo;
        input integer hi;
        begin
            if (got < lo || got > hi) begin
                $display("  FAIL %0s: got=%0d expect %0d..%0d", what, got, lo, hi);
                fail_cnt = fail_cnt + 1;
            end else begin
                $display("  PASS %0s = %0d (trong %0d..%0d)", what, got, lo, hi);
                pass_cnt = pass_cnt + 1;
            end
        end
    endtask

    // 1 xung VSYNC, cach lan truoc `gap_cycles` chu ky clk.
    task automatic pulse;
        input integer gap_cycles;
        input         do_frame;
        begin
            @(posedge clk); #1;
            vsync_pulse = 1'b1;
            frame_pulse = do_frame;
            @(posedge clk); #1;
            vsync_pulse = 1'b0;
            frame_pulse = 1'b0;
            repeat (gap_cycles) @(posedge clk);
            #1;
        end
    endtask

    // Glitch: xung ngan khong kem frame_pulse.
    task automatic glitch;
        input integer gap_cycles;
        begin
            @(posedge clk); #1;
            vsync_pulse = 1'b1;
            @(posedge clk); #1;
            vsync_pulse = 1'b0;
            repeat (gap_cycles) @(posedge clk);
            #1;
        end
    endtask

    task automatic do_reset;
        begin
            rst_n = 1'b0;
            repeat (20) @(posedge clk);
            #1;
            rst_n = 1'b1;
            repeat (10) @(posedge clk);
            #1;
        end
    endtask

    integer k;

    initial begin
        $display("=== tb_vsync_monitor rev 2 (bucket 2x/short + loc glitch) ===");
        $display("  1 ms module = %0d cycle; cua so = %0d ms; GLITCH_MS = %0d",
                 CY_PER_MS, WINDOW_MS, GLITCH_MS);
        $display("");

        // ------------------------------------------------------------------
        // Test 1: 5 xung deu 65,6 ms -> bucket 1x
        // ------------------------------------------------------------------
        $display("--- Test 1: 5 xung deu ~65,6 ms ---");
        do_reset;
        for (k = 0; k < 5; k = k + 1) pulse(65_600, 1'b1);
        repeat (5) @(posedge clk);

        check("t_vsync", t_vsync, 5);
        check("t_frame", t_frame, 5);
        check("t_rejected", t_rejected, 0);
        check("t_b1x", t_b1x, 4);
        check("t_b2x", t_b2x, 0);
        check("t_b3x", t_b3x, 0);
        check("t_bshort", t_bshort, 0);
        check("t_bother", t_bother, 0);
        check_range("t_max_ms", t_max, 65, 66);

        // ------------------------------------------------------------------
        // Test 2: ngung bom -> khong tang
        // ------------------------------------------------------------------
        $display("");
        $display("--- Test 2: ngung bom 300 ms, khong duoc dem ---");
        begin : t2
            integer v0, f0;
            v0 = t_vsync; f0 = t_frame;
            repeat (300 * CY_PER_MS) @(posedge clk);
            check("t_vsync khong doi", t_vsync, v0);
            check("t_frame khong doi", t_frame, f0);
        end

        // ------------------------------------------------------------------
        // Test 3: 5 xung deu 131 ms -> bucket 2x (MOI)
        //   131 ms = 131.000 cycle. Bucket 2x = 120..145 ms.
        // ------------------------------------------------------------------
        $display("");
        $display("--- Test 3: 5 xung deu 131 ms -> bucket 2x ---");
        do_reset;
        for (k = 0; k < 5; k = k + 1) pulse(131_000, 1'b1);
        repeat (5) @(posedge clk);

        check("t_vsync", t_vsync, 5);
        check("t_b2x", t_b2x, 4);
        check("t_b1x", t_b1x, 0);
        check("t_b3x", t_b3x, 0);
        check("t_bshort", t_bshort, 0);
        check("t_bother", t_bother, 0);
        check_range("t_max_ms", t_max, 130, 132);

        // ------------------------------------------------------------------
        // Test 4: mau du 1x/2x/3x/5x/6x -> ca nam bucket > 0
        //   Can 6 xung de co 5 chu ky.
        // ------------------------------------------------------------------
        $display("");
        $display("--- Test 4: mau 1x/2x/3x/5x/6x ---");
        do_reset;
        pulse(65_600,  1'b1);   // chu ky 1: 65  -> 1x
        pulse(131_000, 1'b1);   // chu ky 2: 131 -> 2x
        pulse(196_800, 1'b1);   // chu ky 3: 196 -> 3x
        pulse(328_000, 1'b1);   // chu ky 4: 328 -> 5x
        pulse(393_600, 1'b1);   // chu ky 5: 393 -> 6x
        pulse(65_600,  1'b1);   // xung thu 6
        repeat (5) @(posedge clk);

        check("t_vsync", t_vsync, 6);
        check("t_b1x", t_b1x, 1);
        check("t_b2x", t_b2x, 1);
        check("t_b3x", t_b3x, 1);
        check("t_b5x", t_b5x, 1);
        check("t_b6x", t_b6x, 1);
        check("t_bshort", t_bshort, 0);
        check("t_bother", t_bother, 0);
        check("tong bucket", t_b1x + t_b2x + t_b3x + t_b5x + t_b6x
              + t_bshort + t_bother, 5);

        // ------------------------------------------------------------------
        // Test 5: LOC GLITCH — gai ngan phai bi chan
        //   Bom 1 canh that, roi 5 gai cach nhau 1 ms (giong hien truong:
        //   `w_min_ms = 1 ms`), roi 1 canh that sau 65,6 ms.
        //   Tong thoi gian 5 gai = 5 ms < GLITCH_MS = 10 ms nen TAT CA bi chan.
        //   Ky vong: t_vsync = 2 (chi 2 canh that), t_rejected = 5.
        // ------------------------------------------------------------------
        $display("");
        $display("--- Test 5: 5 gai cach 1 ms (< GLITCH_MS) bi loc ---");
        do_reset;
        pulse(65_600, 1'b1);                          // canh that #1
        for (k = 0; k < 5; k = k + 1) glitch(1_000);  // 5 gai, moi cai cach 1 ms
        pulse(65_600, 1'b1);                          // canh that #2
        repeat (5) @(posedge clk);

        check("t_vsync chi dem canh that", t_vsync, 2);
        check("t_rejected", t_rejected, 5);
        check("t_bshort (gai khong vao bucket)", t_bshort, 0);
        check("t_b1x", t_b1x, 1);
        check("t_frame", t_frame, 2);

        // ------------------------------------------------------------------
        // Test 5b: GIOI HAN CUA BO LOC — gai day du moi 10 ms thi LOT
        //   Tai lieu module ghi ro: so sanh thoi gian don thuan khong phan biet
        //   duoc. Khi nhieu lap day >= GLITCH_MS, mot gai se duoc chap nhan va
        //   roi vao bucket `short`. Test nay KHANG DINH hanh vi do de nguoi doc
        //   khong tuong bo loc manh hon thuc te.
        // ------------------------------------------------------------------
        $display("");
        $display("--- Test 5b: gai cach 12 ms (> GLITCH_MS) -> LOT, vao short ---");
        do_reset;
        pulse(65_600, 1'b1);                          // canh that #1
        glitch(12_000);                               // cach 12 ms -> lot qua
        pulse(65_600, 1'b1);                          // canh that #2
        repeat (5) @(posedge clk);

        $display("  t_vsync=%0d t_rejected=%0d t_bshort=%0d",
                 t_vsync, t_rejected, t_bshort);
        check("t_rejected (12 ms > 10 ms nen KHONG bi chan)", t_rejected, 0);
        check("t_bshort (gai lot qua vao bucket short)", t_bshort, 1);
        check("t_vsync (dem ca gai lot qua)", t_vsync, 3);

        // ------------------------------------------------------------------
        // Test 6: frame_pulse thieu -> phat hien chenh
        // ------------------------------------------------------------------
        $display("");
        $display("--- Test 6: 6 VSYNC / 3 frame -> chenh 3 ---");
        do_reset;
        for (k = 0; k < 6; k = k + 1) pulse(65_600, (k % 2) == 0);
        repeat (5) @(posedge clk);

        check("t_vsync", t_vsync, 6);
        check("t_frame", t_frame, 3);
        check("chenh", t_vsync - t_frame, 3);

        // ------------------------------------------------------------------
        // Test 7: chu ky 30 ms (< 55) nhung > GLITCH_MS -> vao bucket short
        //   Kiem rang bucket `short` phan biet duoc voi glitch bi chan.
        // ------------------------------------------------------------------
        $display("");
        $display("--- Test 7: chu ky 30 ms (> 10 ms, < 55 ms) -> bucket short ---");
        do_reset;
        for (k = 0; k < 4; k = k + 1) pulse(30_000, 1'b1);
        repeat (5) @(posedge clk);

        check("t_vsync", t_vsync, 4);
        check("t_rejected (30 ms > 10 ms nen KHONG bi chan)", t_rejected, 0);
        check("t_bshort", t_bshort, 3);
        check("t_b1x", t_b1x, 0);

        $display("");
        $display("=== SUMMARY: PASS=%0d FAIL=%0d ===", pass_cnt, fail_cnt);
        if (fail_cnt != 0) $fatal(1, "tb_vsync_monitor FAILED");
        $display("PASS: tb_vsync_monitor completed");
        $finish;
    end

    initial begin
        #(500_000_000);
        $fatal(1, "tb_vsync_monitor TIMEOUT");
    end

endmodule
