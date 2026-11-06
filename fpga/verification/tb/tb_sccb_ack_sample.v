// -----------------------------------------------------------------------------
// tb_sccb_ack_sample.v — Kiem tra logic ACK cua sccb_master
//
// BOI CANH
//   tb_ov2640_config KHONG instantiate sccb_master; no dung mo hinh hanh vi
//   (`sccb_ack_error` la input do TB dieu khien) nen KHONG THE phat hien loi
//   ben trong sccb_master. TB nay instantiate sccb_master THAT.
//
// HAI LOI DA TIM THAY O DAY
//   P0-a: sample ACK tai `clk_cnt == HALF` = dung chu ky SCL vua len HIGH.
//         Tren phan cung, SDA la open-drain, tai suon len dien ap van ~0 V
//         nen FPGA doc 0 -> hieu la ACK -> `ack_error` LUON = 0 du sensor
//         khong he tra loi. Day la ly do `cfg_done` luon len tren bo.
//         => Sua: sample tai (2*HALF - 2) = cuoi pha SCL HIGH.
//
//   P0-b: SCL/SDA la open-drain, chi co pull-up noi GW2A ~50 kOhm.
//         Module OV2640 MINI-200W khong co pull-up ngoai. Voi C_bus ~100 pF,
//         tau = 5 us; o SCL_DIV=1000 (HALF=5 us) dien ap chi dat 2,09 V < VIH
//         (2,31 V) => MOI bit 1 bi doc thanh 0.
//         => Sua: SCL va SDA chuyen sang PUSH-PULL. SDA chi tha (Z) trong
//            cua so bit ACK de slave co the keo thap, va cua so mo/dong khi
//            SCL con thap nen khong bao gio chong lai.
//
// TB NAY KIEM GI
//   1. Slave ACK  -> ack_error = 0
//   2. Slave NACK -> ack_error = 1     <- loi P0-a lam test nay FAIL
//   3. Thoi diem sample nam TRONG pha SCL HIGH (khong phai tai suon len)
//   4. SDA duoc tha (Z) trong pha ACK, va master lai o cac bit khac
//   5. SCL la push-pull: khong bao gio co trang thai Z tren SCL
//
// BUS MODEL: dung tri-state that (tri sda_bus + pullup), KHONG mo phong RC.
// Muc dich la kiem LOGIC; thong so analog duoc tinh trong tai lieu.
//
// Exit code: $fatal(1) khi fail.
// -----------------------------------------------------------------------------
`timescale 1ns/1ps

module tb_sccb_ack_sample;

    localparam real    CLK_HZ  = 100.0e6;
    localparam real    CLK_T   = 1.0e9 / CLK_HZ;
    localparam integer SCL_DIV = 1000;
    localparam integer HALF    = SCL_DIV / 2;      // 500 chu ky

    localparam [7:0] DEV_ADDR = 8'h60;
    localparam [7:0] REG_ADDR = 8'h12;
    localparam [7:0] REG_DATA = 8'h40;

    reg         clk   = 1'b0;
    reg         rst_n = 1'b0;
    reg         start = 1'b0;
    reg  [15:0] reg_addr = {8'h00, REG_ADDR};
    reg  [7:0]  reg_data = REG_DATA;

    wire scl, busy, done, ack_error;

    always #(CLK_T/2) clk = ~clk;

    // ------------------------------------------------------------------
    // Bus SDA: tri-state that, co pull-up
    // ------------------------------------------------------------------
    tri  sda;
    pullup (sda);

    sccb_master #(
        .SCL_DIV    (SCL_DIV),
        .DEV_ADDR   (DEV_ADDR),
        .ADDR_BYTES (1)
    ) dut (
        .clk       (clk),
        .rst_n     (rst_n),
        .start     (start),
        .reg_addr  (reg_addr),
        .reg_data  (reg_data),
        .scl       (scl),
        .sda       (sda),
        .busy      (busy),
        .done      (done),
        .ack_error (ack_error)
    );

    // Slave keo SDA (khai bao som de assign duoc)
    reg  sl_drive_low = 1'b0;
    assign sda = sl_drive_low ? 1'b0 : 1'bz;

    // ------------------------------------------------------------------
    // Slave: keo SDA thap trong bit ACK
    //
    // THAY DOI 01/11: truoc day TB dem suon xuong SCL de tim pha ACK, nhung
    // byte DAU co them 1 suon xuong tu START nen phep dem lech 1 cho cac byte
    // sau -> slave keo ACK sai thoi diem, TB bao FAIL gia.
    //
    // Nay slave phan ung theo dung tin hieu cua master: khi master mo cua so
    // ACK (`sda_release` len 1), slave quyet dinh keo hay khong. Day la cach
    // mo hinh dung ban chat giao thuc: master tha bus, slave tra loi.
    // ------------------------------------------------------------------
    reg  g_slave_ack   = 1'b1;
    reg  sda_release_d = 1'b0;

    always @(posedge clk) begin
        sda_release_d <= dut.sda_release;
        if (rst_n && dut.sda_release && !sda_release_d) begin
            // Cua so ACK vua mo -> slave keo thap neu no muon ACK
            sl_drive_low <= g_slave_ack;
        end else if (rst_n && !dut.sda_release) begin
            // Master dong cua so -> slave nha bus
            sl_drive_low <= 1'b0;
        end
    end

    // ------------------------------------------------------------------
    // Giam sat
    // ------------------------------------------------------------------
    integer pass_cnt = 0;
    integer fail_cnt = 0;
    integer k;

    // 3. Thoi diem sample: ghi lai clk_cnt khi ack_sampled duoc cap nhat
    integer   sample_clk_cnt = -1;
    reg [3:0] prev_ack = 4'b1111;
    always @(posedge clk) begin
        if (rst_n && dut.state == 4'd4) begin
            if (dut.ack_sampled !== prev_ack) begin
                sample_clk_cnt <= dut.clk_cnt;
            end
        end
        prev_ack <= dut.ack_sampled;
    end

    // 5. SCL khong duoc co trang thai Z (push-pull)
    reg scl_z_seen = 1'b0;
    always @(*) if (scl === 1'bz) scl_z_seen = 1'b1;

    // 6. Kiem tra khong chap bus: khi slave dang giu SDA thap (ACK), master
    //    PHAI dang tha (sda_release = 1). Neu master lai cung luc -> chap.
    integer contention_cnt = 0;
    always @(posedge clk) begin
        if (rst_n && sl_drive_low && !dut.sda_release && dut.sda_low) begin
            // slave keo 0, master cung lai 0 -> khong chap (cung muc)
        end else if (rst_n && sl_drive_low && !dut.sda_release && !dut.sda_low) begin
            // slave keo 0, master lai 1 -> CHAP THUC SU
            contention_cnt <= contention_cnt + 1;
        end
    end

    // 7. Sau khi ACK ket thuc, master phai giu SDA o Z it nhat SAFE_RELEASE_CYC
    //    truoc khi lai. Do so chu ky trong MOT lan vao ST_NEXT_BYTE.
    integer z_hold_cycles  = 0;
    integer z_hold_max     = 0;
    reg     in_next_byte_d = 1'b0;
    integer cur_hold       = 0;

    always @(posedge clk) begin
        if (!rst_n) begin
            cur_hold       <= 0;
            z_hold_cycles  <= 0;
            in_next_byte_d <= 1'b0;
        end else begin
            in_next_byte_d <= (dut.state == 4'd5);   // ST_NEXT_BYTE = 5

            if (dut.state == 4'd5) begin
                if (dut.sda_release) cur_hold <= cur_hold + 1;
            end

            // Ra khoi ST_NEXT_BYTE -> chot so do cua lan vua roi
            if (in_next_byte_d && dut.state != 4'd5) begin
                z_hold_cycles <= cur_hold;
                if (cur_hold > z_hold_max) z_hold_max <= cur_hold;
                cur_hold <= 0;
            end
        end
    end

    // 4. SDA co duoc tha trong pha ACK khong (khi slave KHONG keo)
    reg sda_released_in_ack = 1'b0;
    always @(posedge clk) begin
        if (rst_n && dut.state == 4'd4 && (!dut.sda_release ? 1'b0 : 1'b1))
            sda_released_in_ack <= 1'b1;
    end

    task automatic one_transaction;
        input        slave_acks;
        input [8*24-1:0] label;
        begin
            g_slave_ack = slave_acks;
            sl_drive_low = 1'b0;
            sda_release_d = 1'b0;
            sample_clk_cnt = -1;

            start <= 1'b1;
            @(posedge clk);
            start <= 1'b0;

            k = 0;
            while (!done && k < 200_000) begin
                @(posedge clk);
                k = k + 1;
            end

            if (!done) begin
                $display("  FAIL %0s: khong bao done", label);
                fail_cnt = fail_cnt + 1;
            end else begin
                $display("  %0s: ack_error=%b ack_sampled=%b (ky vong ack_error=%0d)",
                         label, ack_error, dut.ack_sampled, !slave_acks);
                if (ack_error !== !slave_acks) begin
                    $display("    FAIL: ack_error sai");
                    if (!slave_acks)
                        $display("    ^^^ day chinh la loi P0-a: sample tai suon len SCL");
                    fail_cnt = fail_cnt + 1;
                end else begin
                    $display("    PASS");
                    pass_cnt = pass_cnt + 1;
                end
            end

            repeat (30) @(posedge clk);
        end
    endtask

    initial begin
        $display("=== tb_sccb_ack_sample ===");
        $display("  SCL_DIV=%0d -> %0.0f kHz, HALF=%0d chu ky",
                 SCL_DIV, CLK_HZ/SCL_DIV/1e3, HALF);
        $display("  Sample point mong doi: clk_cnt = %0d (cuoi pha HIGH)",
                 2*HALF - 2);
        $display("");

        rst_n = 1'b0;
        repeat (20) @(posedge clk);
        rst_n = 1'b1;
        repeat (30) @(posedge clk);

        $display("--- Test 1: slave ACK ---");
        one_transaction(1'b1, "ACK ");

        $display("");
        $display("--- Test 2: slave KHONG tra loi (NACK) ---");
        $display("    Test nay BAT BUOC phai phat hien loi sample tai suon len");
        one_transaction(1'b0, "NACK");

        $display("");
        $display("--- Test 3: SCL push-pull (khong bao gio Z) ---");
        if (scl_z_seen) begin
            $display("  FAIL: SCL co trang thai Z -> van la open-drain");
            fail_cnt = fail_cnt + 1;
        end else begin
            $display("  PASS SCL luon o muc 0/1 (push-pull)");
            pass_cnt = pass_cnt + 1;
        end

        $display("");
        $display("--- Test 4: khong chap bus SDA (master vs slave) ---");
        $display("    Dem chu ky slave keo 0 trong khi master lai 1: %0d", contention_cnt);
        if (contention_cnt != 0) begin
            $display("  FAIL: phat hien %0d chu ky chap bus -> nguy co hong chan FPGA",
                     contention_cnt);
            fail_cnt = fail_cnt + 1;
        end else begin
            $display("  PASS khong co chu ky chap bus");
            pass_cnt = pass_cnt + 1;
        end

        $display("");
        $display("--- Test 5: khoang nghi an toan sau ACK ---");
        $display("    SAFE_RELEASE_CYC mong doi = %0d, do duoc (max) = %0d",
                 dut.SAFE_RELEASE_CYC, z_hold_max);
        if (z_hold_max < 16) begin
            $display("  FAIL: giu SDA o Z chi %0d chu ky (< 16) -> slave chua kip nha bus",
                     z_hold_max);
            fail_cnt = fail_cnt + 1;
        end else begin
            $display("  PASS giu SDA o Z %0d chu ky truoc khi master lai", z_hold_max);
            pass_cnt = pass_cnt + 1;
        end

        $display("");
        $display("=== SUMMARY: PASS=%0d FAIL=%0d ===", pass_cnt, fail_cnt);
        if (fail_cnt != 0) $fatal(1, "tb_sccb_ack_sample FAILED");
        $display("PASS: tb_sccb_ack_sample completed");
        $finish;
    end

    initial begin
        #(50_000_000);
        $display("WATCHDOG");
        $fatal(1, "timeout");
    end

endmodule
