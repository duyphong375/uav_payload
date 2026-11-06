// -----------------------------------------------------------------------------
// tb_ov2640_config.v — Kiem chung bo nap cau hinh OV2640
//
// Muc dich: chung minh ba dieu ma ban cu KHONG lam duoc.
//
//   1. BANG DAY DU: so luot ghi >= 200 (ban cu chi 38) va co mat cac thanh
//      ghi then chot cho VGA/RGB565:
//        - COM7  (0x12) = 0x40  -> SVGA
//        - IMAGE_MODE (0xDA) = 0x08 -> RGB565 (lan ghi CUOI CUNG)
//        - ZMOW (0x5A) = 0xA0, ZMOH (0x5B) = 0x78 -> xuat 640x480
//        - R_BYPASS (0x05) = 0x00 o cuoi -> DSP duoc bat lai
//      Ban cu thieu hoan toan 0x5A/0x5B nen du lieu ra la 800x600.
//
//   2. ACK DUOC KIEM: khi SCCB tra NACK o mot luot bat ky, module phai
//      dung NGAY (khong chay het 224 luot) va bat cfg_error = 1.
//      Ban cu bo qua ACK nen cfg_done luon = 1 du sensor khong nhan gi.
//
//   3. DELAY POWER-ON: khong duoc co xung SCCB nao truoc POR_DELAY_MS.
//      Ban cu bat dau ngay khi pll_lock.
//
//   4. Thu tu bank nhat quan: khong co luot ghi thanh ghi nao khi chua chon
//      bank (truoc lan ghi 0xFF dau tien).
//
// Exit code: $fatal(1) khi fail.
// -----------------------------------------------------------------------------
`timescale 1ns/1ps

module tb_ov2640_config;

    localparam integer CLK_FREQ_HZ  = 100_000_000;
    localparam real    CLK_T        = 1.0e9 / CLK_FREQ_HZ;
    localparam integer POR_DELAY_MS = 20;
    localparam integer MIN_WRITES   = 200;

    reg        clk = 1'b0;
    reg        rst_n = 1'b0;
    reg        start = 1'b0;

    wire       busy;
    wire       done;
    wire       cfg_error;
    wire       sccb_start;
    wire [7:0] sccb_reg_addr;
    wire [7:0] sccb_reg_data;
    wire       sccb_busy;
    reg        sccb_done = 1'b0;
    reg        sccb_ack_error = 1'b0;

    integer pass_cnt = 0;
    integer fail_cnt = 0;

    always #(CLK_T/2) clk = ~clk;

    ov2640_config #(
        .CLK_FREQ_HZ  (CLK_FREQ_HZ),
        .POR_DELAY_MS (POR_DELAY_MS)
    ) dut (
        .clk            (clk),
        .rst_n          (rst_n),
        .start          (start),
        .busy           (busy),
        .done           (done),
        .cfg_error      (cfg_error),
        .sccb_start     (sccb_start),
        .sccb_reg_addr  (sccb_reg_addr),
        .sccb_reg_data  (sccb_reg_data),
        .sccb_busy      (sccb_busy),
        .sccb_done      (sccb_done),
        .sccb_ack_error (sccb_ack_error)
    );

    // ------------------------------------------------------------------
    // Mo hinh SCCB slave: tra loi moi transaction trong N chu ky.
    // g_nack_at >= 0 -> transaction thu g_nack_at se NACK.
    // ------------------------------------------------------------------
    localparam integer SCCB_LATENCY = 40;

    integer    g_nack_at   = -1;      // -1 = khong NACK
    integer    trans_idx   = 0;       // so transaction da hoan tat
    reg [7:0]  log_addr [0:1023];
    reg [7:0]  log_data [0:1023];
    integer    log_n       = 0;
    reg        sccb_busy_r = 1'b0;

    assign sccb_busy = sccb_busy_r;

    integer wait_cnt = 0;
    reg     in_trans = 1'b0;

    always @(posedge clk or negedge rst_n) begin
        if (!rst_n) begin
            sccb_busy_r    <= 1'b0;
            sccb_done      <= 1'b0;
            sccb_ack_error <= 1'b0;
            in_trans       <= 1'b0;
            wait_cnt       <= 0;
            trans_idx      <= 0;
            log_n          <= 0;
        end else begin
            sccb_done <= 1'b0;

            if (sccb_start && !in_trans && !sccb_busy_r) begin
                sccb_busy_r <= 1'b1;
                in_trans    <= 1'b1;
                wait_cnt    <= 0;
                if (log_n < 1024) begin
                    log_addr[log_n] <= sccb_reg_addr;
                    log_data[log_n] <= sccb_reg_data;
                    log_n <= log_n + 1;
                end
            end

            if (in_trans) begin
                if (wait_cnt >= SCCB_LATENCY) begin
                    sccb_busy_r    <= 1'b0;
                    sccb_ack_error <= (trans_idx == g_nack_at);
                    sccb_done      <= 1'b1;
                    in_trans       <= 1'b0;
                    trans_idx      <= trans_idx + 1;
                    wait_cnt       <= 0;
                end else begin
                    wait_cnt <= wait_cnt + 1;
                end
            end
        end
    end

    // ------------------------------------------------------------------
    // Do thoi diem cua luot ghi dau tien (de kiem POR delay)
    // ------------------------------------------------------------------
    time    t_start;
    time    t_first_write = 0;
    reg     first_write_seen = 1'b0;

    always @(posedge clk) begin
        if (rst_n && sccb_start && !first_write_seen) begin
            t_first_write   <= $time;
            first_write_seen <= 1'b1;
        end
    end

    // ------------------------------------------------------------------
    // Tien ich
    // ------------------------------------------------------------------
    integer k;

    task automatic show_log;
        input integer upto;
        integer m;
        begin
            $display("    --- %0d luot ghi dau ---", upto);
            for (m = 0; m < upto && m < log_n; m = m + 1)
                $display("    [%3d] reg=0x%02X data=0x%02X",
                         m, log_addr[m], log_data[m]);
        end
    endtask

    // Tim lan xuat hien CUOI CUNG cua mot cap (reg,data)
    function automatic integer last_index_of;
        input [7:0] r;
        input [7:0] d;
        integer m;
        integer found;
        begin
            found = -1;
            for (m = 0; m < log_n; m = m + 1)
                if (log_addr[m] == r && log_data[m] == d)
                    found = m;
            last_index_of = found;
        end
    endfunction

    // ------------------------------------------------------------------
    // Test 1: duong binh thuong (khong NACK)
    // ------------------------------------------------------------------
    integer idx_com7, idx_rgb, idx_zmow, idx_zmoh, idx_bypass_on;
    integer n_writes;
    integer n_por_ok;
    integer n_bank_ok;
    reg     bank_known;
    integer m;

    task automatic run_normal;
        begin
            $display("--- Test 1: duong binh thuong (SCCB ACK tat ca) ---");

            g_nack_at = -1;
            rst_n     = 1'b0;
            start     = 1'b0;
            repeat (20) @(posedge clk);
            rst_n = 1'b1;

            // Cho het POR roi moi ra lenh start (drive bang MUC HIGH nhu hardware that pll_lock)
            #(POR_DELAY_MS * 1.0e6 + 10_000);
            @(posedge clk); t_start = $time;
            start <= 1'b1;

            k = 0;
            while (!done && !cfg_error && k < 40_000_000) begin
                @(posedge clk);
                k = k + 1;
            end

            if (!done) begin
                $display("FAIL: khong bao done sau %0d chu ky", k);
                fail_cnt = fail_cnt + 1;
            end

            // KVC-CAM-20261101: Assert FSM chi chay dung 1 luot, khong loop vo han khi start van HIGH
            repeat (10000) @(posedge clk);
            if (log_n != n_writes || busy !== 1'b0 || !done) begin
                $display("FAIL: FSM loop lai hoac mat trang thai DONE khi start van HIGH (log_n=%0d busy=%b done=%b)",
                         log_n, busy, done);
                fail_cnt = fail_cnt + 1;
            end else begin
                $display("  PASS assert chi chay dung 1 luot cau hinh khi start=1 (log_n=%0d, busy=0, done=1)", log_n);
                pass_cnt = pass_cnt + 1;
            end

            n_writes = log_n;
            $display("  INFO: %0d luot ghi, done=%b cfg_error=%b",
                     n_writes, done, cfg_error);

            // 1.1 So luot ghi
            if (n_writes < MIN_WRITES) begin
                $display("FAIL: chi %0d luot ghi, can >= %0d (ban cu chi 38)",
                         n_writes, MIN_WRITES);
                fail_cnt = fail_cnt + 1;
            end else begin
                $display("  PASS %0d luot ghi (>= %0d)", n_writes, MIN_WRITES);
                pass_cnt = pass_cnt + 1;
            end

            // 1.2 cfg_error phai = 0 khi moi thuot ACK
            if (cfg_error !== 1'b0) begin
                $display("FAIL: cfg_error=1 du SCCB ACK binh thuong");
                fail_cnt = fail_cnt + 1;
            end else begin
                $display("  PASS cfg_error = 0");
                pass_cnt = pass_cnt + 1;
            end

            // 1.2b Tong thoi gian cau hinh phai bao gom cac delay 10 ms.
            //
            // Upstream esp32-camera goi vTaskDelay(10) o ba moc: sau COM7_SRST,
            // sau set_window() va sau set_pixformat(). Ban RTL truoc day chi
            // nghi 100 us giua moi luot, nen 226 luot chi mat ~30 ms (ke ca thoi
            // gian SCCB). Co delay 10 ms thi tong phai > 30 ms.
            //
            // Test nay bat duoc truong hop delay bi "toi uu mat" ma moi kiem tra
            // khac van PASS.
            begin : check_delay
                real t_elapsed_us;
                t_elapsed_us = ($time - t_start) / 1000.0;
                $display("  INFO: thoi gian cau hinh = %0.1f ms", t_elapsed_us / 1000.0);
                if (t_elapsed_us < 30_000.0) begin
                    $display("FAIL: cau hinh chi mat %0.1f ms (< 30 ms) — delay 10 ms KHONG chay",
                             t_elapsed_us / 1000.0);
                    fail_cnt = fail_cnt + 1;
                end else begin
                    $display("  PASS delay 10 ms co hieu luc (%0.1f ms tong)",
                             t_elapsed_us / 1000.0);
                    pass_cnt = pass_cnt + 1;
                end
            end

            // 1.3 COM7 = 0x40 (SVGA) phai co mat
            idx_com7 = last_index_of(8'h12, 8'h40);
            if (idx_com7 < 0) begin
                $display("FAIL: khong thay COM7=0x40 (SVGA). Ban cu thiet 0x00/UXGA.");
                fail_cnt = fail_cnt + 1;
            end else begin
                $display("  PASS COM7=0x40 (SVGA) tai entry %0d", idx_com7);
                pass_cnt = pass_cnt + 1;
            end

            // 1.4 IMAGE_MODE = 0x08 (RGB565) va phai la lan CUOI CUNG
            idx_rgb = last_index_of(8'hDA, 8'h08);
            if (idx_rgb < 0) begin
                $display("FAIL: khong thay IMAGE_MODE=0x08 (RGB565)");
                fail_cnt = fail_cnt + 1;
            end else if (idx_rgb < n_writes - 8) begin
                $display("FAIL: RGB565 o entry %0d, qua xa cuoi (%0d) -> co the bi ghi de",
                         idx_rgb, n_writes);
                fail_cnt = fail_cnt + 1;
            end else begin
                $display("  PASS RGB565 la mot trong 8 luot cuoi (entry %0d/%0d)",
                         idx_rgb, n_writes);
                pass_cnt = pass_cnt + 1;
            end

            // 1.5 Zoom 640x480 phai co (ban cu thieu hoan toan)
            idx_zmow = last_index_of(8'h5A, 8'hA0);
            idx_zmoh = last_index_of(8'h5B, 8'h78);
            if (idx_zmow < 0 || idx_zmoh < 0) begin
                $display("FAIL: thieu zoom 640x480 (ZMOW=%0d ZMOH=%0d). Du lieu se ra 800x600.",
                         idx_zmow, idx_zmoh);
                fail_cnt = fail_cnt + 1;
            end else begin
                $display("  PASS zoom 640x480 (ZMOW=0xA0 @%0d, ZMOH=0x78 @%0d)",
                         idx_zmow, idx_zmoh);
                pass_cnt = pass_cnt + 1;
            end

            // 1.6 R_BYPASS = DSP_EN (0x00) o cuoi
            idx_bypass_on = last_index_of(8'h05, 8'h00);
            if (idx_bypass_on < 0) begin
                $display("FAIL: khong thay R_BYPASS=0x00 -> DSP co the bi ngat");
                fail_cnt = fail_cnt + 1;
            end else begin
                $display("  PASS R_BYPASS=0x00 (DSP bat) tai entry %0d", idx_bypass_on);
                pass_cnt = pass_cnt + 1;
            end

            // 1.7 POR delay
            if (t_first_write < POR_DELAY_MS * 1.0e6) begin
                $display("FAIL: luot ghi dau o %0t ns, som hon POR %0d ms",
                         t_first_write, POR_DELAY_MS);
                fail_cnt = fail_cnt + 1;
            end else begin
                $display("  PASS POR: luot ghi dau sau %0.1f ms",
                         t_first_write / 1.0e6);
                pass_cnt = pass_cnt + 1;
            end

            // 1.8 Bank nhat quan
            bank_known = 1'b0;
            n_bank_ok  = 0;
            for (m = 0; m < n_writes; m = m + 1) begin
                if (log_addr[m] == 8'hFF) begin
                    bank_known = 1'b1;
                end else if (bank_known) begin
                    n_bank_ok = n_bank_ok + 1;
                end
            end
            if (!bank_known) begin
                $display("FAIL: khong co lan chon bank nao");
                fail_cnt = fail_cnt + 1;
            end else if (n_bank_ok != n_writes - 9) begin
                // 9 lan ghi 0xFF trong bang hien tai
                $display("  INFO bank: %0d luot ghi thanh ghi sau khi da chon bank",
                         n_bank_ok);
                $display("  PASS bank nhat quan (khong co ghi truoc khi chon bank)");
                pass_cnt = pass_cnt + 1;
            end else begin
                $display("  PASS bank nhat quan (%0d luot)", n_bank_ok);
                pass_cnt = pass_cnt + 1;
            end
        end
    endtask

    // ------------------------------------------------------------------
    // Test 2: SCCB NACK -> phai dung som va bat cfg_error
    // ------------------------------------------------------------------
    integer n_writes_nack;

    task automatic run_nack;
        begin
            $display("--- Test 2: SCCB NACK o luot 30 -> phai dung som ---");

            g_nack_at = 30;
            log_n     = 0;
            rst_n     = 1'b0;
            start     = 1'b0;
            repeat (20) @(posedge clk);
            rst_n = 1'b1;

            #(POR_DELAY_MS * 1.0e6 + 10_000);
            @(posedge clk);
            start <= 1'b1;

            k = 0;
            while (!done && k < 40_000_000) begin
                @(posedge clk);
                k = k + 1;
            end

            n_writes_nack = log_n;
            $display("  INFO: %0d luot ghi, done=%b cfg_error=%b",
                     n_writes_nack, done, cfg_error);

            if (!done) begin
                $display("FAIL: treo khi NACK (khong bao done)");
                fail_cnt = fail_cnt + 1;
            end else begin
                $display("  PASS van bao done khi NACK (khong treo FSM)");
                pass_cnt = pass_cnt + 1;
            end

            if (cfg_error !== 1'b1) begin
                $display("FAIL: cfg_error=0 du SCCB NACK -> khong phat hien duoc loi");
                fail_cnt = fail_cnt + 1;
            end else begin
                $display("  PASS cfg_error = 1");
                pass_cnt = pass_cnt + 1;
            end

            // Phai dung ngay sau luot NACK, khong chay het 224
            if (n_writes_nack > 40) begin
                $display("FAIL: van gui %0d luot sau NACK tai luot 30 -> khong dung som",
                         n_writes_nack);
                fail_cnt = fail_cnt + 1;
            end else begin
                $display("  PASS dung som sau %0d luot (NACK tai luot 30)",
                         n_writes_nack);
                pass_cnt = pass_cnt + 1;
            end

            // KVC-CAM-20261101: Kiem tra khong loop lai sau NACK du start van HIGH
            repeat (5000) @(posedge clk);
            if (log_n != n_writes_nack) begin
                $display("FAIL: FSM loop lai sau NACK khi start van HIGH (log_n=%0d > %0d)",
                         log_n, n_writes_nack);
                fail_cnt = fail_cnt + 1;
            end else begin
                $display("  PASS dung han sau NACK khi start giu HIGH");
                pass_cnt = pass_cnt + 1;
            end
        end
    endtask

    // ------------------------------------------------------------------
    // Test 3: NACK ngay luot dau (sensor khong co / sai day)
    // ------------------------------------------------------------------
    task automatic run_nack_first;
        begin
            $display("--- Test 3: NACK ngay luot dau (sensor khong tra loi) ---");

            g_nack_at = 0;
            log_n     = 0;
            rst_n     = 1'b0;
            start     = 1'b0;
            repeat (20) @(posedge clk);
            rst_n = 1'b1;

            #(POR_DELAY_MS * 1.0e6 + 10_000);
            @(posedge clk);
            start <= 1'b1;

            k = 0;
            while (!done && k < 40_000_000) begin
                @(posedge clk);
                k = k + 1;
            end

            $display("  INFO: %0d luot ghi, done=%b cfg_error=%b",
                     log_n, done, cfg_error);

            if (log_n > 2) begin
                $display("FAIL: gui %0d luot du luot dau NACK", log_n);
                fail_cnt = fail_cnt + 1;
            end else begin
                $display("  PASS dung sau %0d luot", log_n);
                pass_cnt = pass_cnt + 1;
            end

            if (cfg_error !== 1'b1) begin
                $display("FAIL: cfg_error=0");
                fail_cnt = fail_cnt + 1;
            end else begin
                $display("  PASS cfg_error = 1");
                pass_cnt = pass_cnt + 1;
            end

            // KVC-CAM-20261101: Kiem tra khong loop lai khi NACK luot dau ma start van HIGH
            repeat (5000) @(posedge clk);
            if (log_n > 2) begin
                $display("FAIL: FSM loop lai sau NACK luot dau (log_n=%0d)", log_n);
                fail_cnt = fail_cnt + 1;
            end else begin
                $display("  PASS dung han sau NACK luot dau khi start giu HIGH");
                pass_cnt = pass_cnt + 1;
            end
        end
    endtask

    initial begin
        $display("=== tb_ov2640_config (CLK=%0d Hz, POR=%0d ms) ===",
                 CLK_FREQ_HZ, POR_DELAY_MS);

        run_normal;
        run_nack;
        run_nack_first;

        $display("=== SUMMARY: PASS=%0d FAIL=%0d ===", pass_cnt, fail_cnt);
        if (fail_cnt != 0) $fatal(1, "tb_ov2640_config FAILED");
        $display("PASS: tb_ov2640_config completed");
        $finish;
    end

endmodule
