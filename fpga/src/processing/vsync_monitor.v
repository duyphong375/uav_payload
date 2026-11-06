// -----------------------------------------------------------------------------
// Module: vsync_monitor.v
// Author: KVC Team (Kilo)
// Date:   2026-11-02 (rev 2 — them loc glitch + bucket 2x/short)
// Desc:   TU DO VSYNC bang clock noi — thay cho scope/LA.
//
// BOI CANH
//   Ban thi nghiem KHONG co scope. Ba cau hoi can tra loi:
//     (1) Camera phat VSYNC deu, hay nhay 1x/2x/3x/5x/6x?
//     (2) FPGA co lam rot frame giua camera va duong IF-01 khong?
//     (3) Duong VSYNC co nhieu (glitch) khong, bao nhieu?
//   Module nay do noi bo, day ket qua ra UART qua DIAG_MODE = 2.
//   KHONG doi ABI IF-01 (layout, CRC, baud giu nguyen).
//
// REV 2 — BA THAY DOI
//   1. BUCKET 2x (120..145 ms). Ban rev 1 chi co 1x/3x/5x/6x. Tren bo do duoc
//      48,3 % chu ky roi vao `other`; ung vien dau tien la 2x (2 x 65,5 =
//      131 ms, cung la chu ky 7,5 fps da do ngay 01-02/11). Thieu bucket nay
//      khien gan nua du lieu khong doc duoc.
//   2. BUCKET SHORT (< 55 ms). Ban rev 1 do `w_min_ms` = 1 ms o 39/151 cua so
//      — bat kha voi mot frame VGA (nen ngan nhat ~65 ms). Do la NHIEU tren
//      chan cam_vsync, khong phai frame. Nay gom rieng de khong lan vao `other`.
//   3. LOC GLITCH: chi nhan canh VSYNC neu da qua GLITCH_MS (mac dinh 10 ms)
//      ke tu canh TRUOC DO DUOC CHAP NHAN. Cach dem so voi canh da chap nhan
//      (khong phai canh truoc bat ky) de mot chuoi gai ngan khong tu keo dai
//      thoi gian khoa vo han.
//
// GIOI HAN CUA LOC
//   Neu nhieu lien tuc day du moi 10 ms, mot gai se lot qua sau moi 10 ms.
//   Khong the phan biet bang so sanh thoi gian don thuan. Tri so `t_rejected`
//   va `t_bshort` cho biet co bao nhieu gai bi chan / lot qua — nguoi doc tu
//   ket luan duoc muc do nhieu thay vi tin mu vao bo loc.
//
// NGUYEN LY DO
//   Clock tham chieu clk (100 MHz). Hai moc thoi gian tu do:
//     now_100us : +1 moi TICK_DIV chu ky (mac dinh 10.000 -> 100 us)
//     now_ms    : +1 moi 10 lan now_100us
//   Chu ky do bang BO DEM TU RESET tai moi canh duoc chap nhan, KHONG dung phep
//   tru 32 bit: ban rev 0 dung `now_ms - prev_ms` va path do dai 12,2 ns, keo
//   Fmax clk_100m xuong 100,153 MHz (sat nguong 100). Bo dem cho Fmax 121 MHz.
//
// HAI BO DEM SONG SONG
//   w_* : cua so WINDOW_MS (mac dinh 2.000 ms)
//   t_* : tich luy tu reset
//   Cua so 2 s o ~5 Hz chi co ~10 chu ky; muon ket luan phai nhin ban tich luy.
//
// VI SAO KHONG DUNG BO CHIA / DSP / BSRAM
//   Chi cong, tru, so sanh. Trung binh = w_sum_100us / w_periods do Python
//   tinh. Bo chia 32/16 se ton vai tram LUT ma khong them thong tin.
//
// BUCKET (don vi ms) — KHONG chong nhau, phu kin truc so
//   short  : d_ms <  55            (duoi dai 1x; gom moi glitch lot qua loc)
//   1x     : 55.. 80
//   2x     : 120..145
//   3x     : 180..215
//   5x     : 310..340
//   6x     : 380..410
//   other  : con lai (bao gom 4x ~262, 7x.., va cac gia tri giua dai)
//
//   Cac dai bao quanh boi so cua 65,5 ms da do tren bo
//   (evidence/KVC-FPGA-BLOB-20261102-001.md §2) va 2x = 131 ms khop phep do
//   7,5 fps ngay 01/02-11.
//
// QUY UOC RANH GIOI CUA SO
//   Mot canh roi dung chu ky dong cua so thuoc ve CUA SO MOI. Nho vay moi
//   canh duoc dem dung mot lan, va tong `w_periods` qua cac cua so = tong so
//   canh chap nhan - 1 (canh dau khong co chu ky truoc no).
// -----------------------------------------------------------------------------
`timescale 1ns/1ps

module vsync_monitor #(
    parameter integer CLK_HZ    = 100_000_000,
    parameter integer TICK_HZ   = 10_000,   // 100 us
    parameter integer WINDOW_MS = 2_000,
    parameter integer GLITCH_MS = 10        // bo qua canh gan hon 10 ms
)(
    input  wire clk,
    input  wire rst_n,

    input  wire vsync_pulse,   // 1 chu ky clk, canh len VSYNC (da dong bo)
    input  wire frame_pulse,   // 1 chu ky clk, frame nguon da phat

    // snapshot cuoi moi cua so, cao 1 chu ky
    output reg         snap,
    output reg  [15:0] w_vsync,
    output reg  [15:0] w_periods,
    output reg  [15:0] w_sum_100us,
    output reg  [15:0] w_min_ms,
    output reg  [15:0] w_max_ms,
    output reg  [15:0] w_b1x,
    output reg  [15:0] w_b2x,
    output reg  [15:0] w_b3x,
    output reg  [15:0] w_b5x,
    output reg  [15:0] w_b6x,
    output reg  [15:0] w_bshort,
    output reg  [15:0] w_bother,
    output reg  [15:0] w_rejected,

    // tich luy tu reset (bao hoa 16 bit)
    output reg  [15:0] t_vsync,
    output reg  [15:0] t_frame,
    output reg  [15:0] t_max_ms,
    output reg  [15:0] t_rejected,
    output reg  [15:0] t_b1x,
    output reg  [15:0] t_b2x,
    output reg  [15:0] t_b3x,
    output reg  [15:0] t_b5x,
    output reg  [15:0] t_b6x,
    output reg  [15:0] t_bshort,
    output reg  [15:0] t_bother
);

    // ---------------------------------------------------------------------
    // tick 100 us va 1 ms
    // ---------------------------------------------------------------------
    localparam integer TICK_DIV = (CLK_HZ / TICK_HZ > 0) ? (CLK_HZ / TICK_HZ) : 1;
    localparam integer TICKW    = 16;
    localparam integer GLITCH_TICKS = GLITCH_MS * 10;   // 100 us -> 10 ms = 100

    reg [TICKW-1:0] tick_cnt;
    reg [3:0]       sub_ms;

    wire tick_100us = (tick_cnt == TICK_DIV - 1);
    wire tick_ms    = tick_100us && (sub_ms == 4'd9);

    // ---------------------------------------------------------------------
    // Bo loc glitch + bo dem chu ky
    // ---------------------------------------------------------------------
    reg        have_prev;
    reg [15:0] since_ok;        // thoi gian tu canh CHAP NHAN truoc, 100 us
    reg [15:0] period_100us;    // reset tai moi canh chap nhan
    reg [15:0] period_ms;       // reset tai moi canh chap nhan

    // Canh dau tien sau reset luon duoc nhan de bat dau do.
    wire accept = vsync_pulse && (!have_prev || (since_ok >= GLITCH_TICKS));
    wire reject = vsync_pulse && !accept;

    // Canh vua tao ra mot chu ky hoan chinh
    wire vsync_valid = accept && have_prev;

    wire [15:0] d_100us = period_100us;
    wire [15:0] d_ms    = period_ms;

    wire is_short = (d_ms <  16'd55);
    wire is_1x    = (d_ms >= 16'd55)  && (d_ms <= 16'd80);
    wire is_2x    = (d_ms >= 16'd120) && (d_ms <= 16'd145);
    wire is_3x    = (d_ms >= 16'd180) && (d_ms <= 16'd215);
    wire is_5x    = (d_ms >= 16'd310) && (d_ms <= 16'd340);
    wire is_6x    = (d_ms >= 16'd380) && (d_ms <= 16'd410);
    wire is_other = !(is_short || is_1x || is_2x || is_3x || is_5x || is_6x);

    wire add_short = vsync_valid && is_short;
    wire add_1x    = vsync_valid && is_1x;
    wire add_2x    = vsync_valid && is_2x;
    wire add_3x    = vsync_valid && is_3x;
    wire add_5x    = vsync_valid && is_5x;
    wire add_6x    = vsync_valid && is_6x;
    wire add_other = vsync_valid && is_other;

    always @(posedge clk or negedge rst_n) begin
        if (!rst_n) begin
            tick_cnt     <= {TICKW{1'b0}};
            sub_ms       <= 4'd0;
            have_prev    <= 1'b0;
            since_ok     <= 16'd0;
            period_100us <= 16'd0;
            period_ms    <= 16'd0;
        end else begin
            // ---- tick ----
            if (tick_100us) begin
                tick_cnt <= {TICKW{1'b0}};
                sub_ms   <= tick_ms ? 4'd0 : (sub_ms + 4'd1);
            end else begin
                tick_cnt <= tick_cnt + {{(TICKW-1){1'b0}}, 1'b1};
            end

            // ---- bo loc + bo dem chu ky ----
            if (accept) begin
                have_prev    <= 1'b1;
                since_ok     <= 16'd0;
                period_100us <= 16'd0;
                period_ms    <= 16'd0;
            end else begin
                if (tick_100us) begin
                    if (since_ok != 16'hFFFF)     since_ok     <= since_ok + 16'd1;
                    if (period_100us != 16'hFFFF) period_100us <= period_100us + 16'd1;
                end
                if (tick_ms && period_ms != 16'hFFFF)
                    period_ms <= period_ms + 16'd1;
            end
        end
    end

    // ---------------------------------------------------------------------
    // Cua so
    // ---------------------------------------------------------------------
    reg [31:0] win_ms_cnt;

    reg [15:0] c_vsync, c_periods, c_sum, c_min, c_max;
    reg [15:0] c_b1x, c_b2x, c_b3x, c_b5x, c_b6x, c_bshort, c_bother;
    reg [15:0] c_rejected;

    wire win_done = (win_ms_cnt >= WINDOW_MS);

    always @(posedge clk or negedge rst_n) begin
        if (!rst_n) begin
            snap       <= 1'b0;
            win_ms_cnt <= 32'd0;

            c_vsync <= 16'd0; c_periods <= 16'd0; c_sum <= 16'd0;
            c_min   <= 16'hFFFF; c_max <= 16'd0;
            c_b1x <= 16'd0; c_b2x <= 16'd0; c_b3x <= 16'd0;
            c_b5x <= 16'd0; c_b6x <= 16'd0;
            c_bshort <= 16'd0; c_bother <= 16'd0;
            c_rejected <= 16'd0;

            w_vsync <= 16'd0; w_periods <= 16'd0; w_sum_100us <= 16'd0;
            w_min_ms <= 16'hFFFF; w_max_ms <= 16'd0;
            w_b1x <= 16'd0; w_b2x <= 16'd0; w_b3x <= 16'd0;
            w_b5x <= 16'd0; w_b6x <= 16'd0;
            w_bshort <= 16'd0; w_bother <= 16'd0; w_rejected <= 16'd0;

            t_vsync <= 16'd0; t_frame <= 16'd0;
            t_max_ms <= 16'd0; t_rejected <= 16'd0;
            t_b1x <= 16'd0; t_b2x <= 16'd0; t_b3x <= 16'd0;
            t_b5x <= 16'd0; t_b6x <= 16'd0;
            t_bshort <= 16'd0; t_bother <= 16'd0;
        end else begin
            snap <= 1'b0;

            // ---- tich luy toan phien ----
            if (accept) begin
                if (t_vsync != 16'hFFFF) t_vsync <= t_vsync + 16'd1;
                if (vsync_valid) begin
                    if (d_ms > t_max_ms) t_max_ms <= d_ms;
                end
            end
            if (reject && t_rejected != 16'hFFFF)
                t_rejected <= t_rejected + 16'd1;

            if (add_1x    && t_b1x    != 16'hFFFF) t_b1x    <= t_b1x    + 16'd1;
            if (add_2x    && t_b2x    != 16'hFFFF) t_b2x    <= t_b2x    + 16'd1;
            if (add_3x    && t_b3x    != 16'hFFFF) t_b3x    <= t_b3x    + 16'd1;
            if (add_5x    && t_b5x    != 16'hFFFF) t_b5x    <= t_b5x    + 16'd1;
            if (add_6x    && t_b6x    != 16'hFFFF) t_b6x    <= t_b6x    + 16'd1;
            if (add_short && t_bshort != 16'hFFFF) t_bshort <= t_bshort + 16'd1;
            if (add_other && t_bother != 16'hFFFF) t_bother <= t_bother + 16'd1;

            if (frame_pulse && t_frame != 16'hFFFF) t_frame <= t_frame + 16'd1;

            // ---- cua so ----
            if (win_done) begin
                win_ms_cnt  <= 32'd0;

                w_vsync     <= c_vsync;
                w_periods   <= c_periods;
                w_sum_100us <= c_sum;
                w_min_ms    <= c_min;
                w_max_ms    <= c_max;
                w_b1x       <= c_b1x;
                w_b2x       <= c_b2x;
                w_b3x       <= c_b3x;
                w_b5x       <= c_b5x;
                w_b6x       <= c_b6x;
                w_bshort    <= c_bshort;
                w_bother    <= c_bother;
                w_rejected  <= c_rejected;

                // Cua so moi bat dau bang chinh chu ky nay (neu co).
                c_vsync    <= accept ? 16'd1 : 16'd0;
                c_periods  <= vsync_valid ? 16'd1 : 16'd0;
                c_sum      <= vsync_valid ? d_100us : 16'd0;
                c_min      <= vsync_valid ? d_ms : 16'hFFFF;
                c_max      <= vsync_valid ? d_ms : 16'd0;
                c_b1x      <= add_1x    ? 16'd1 : 16'd0;
                c_b2x      <= add_2x    ? 16'd1 : 16'd0;
                c_b3x      <= add_3x    ? 16'd1 : 16'd0;
                c_b5x      <= add_5x    ? 16'd1 : 16'd0;
                c_b6x      <= add_6x    ? 16'd1 : 16'd0;
                c_bshort   <= add_short ? 16'd1 : 16'd0;
                c_bother   <= add_other ? 16'd1 : 16'd0;
                c_rejected <= reject    ? 16'd1 : 16'd0;

                snap <= 1'b1;
            end else begin
                if (accept) begin
                    c_vsync <= c_vsync + 16'd1;
                    if (vsync_valid) begin
                        c_sum     <= c_sum + d_100us;
                        c_periods <= c_periods + 16'd1;
                        if (d_ms < c_min) c_min <= d_ms;
                        if (d_ms > c_max) c_max <= d_ms;
                    end
                    if (add_1x)      c_b1x    <= c_b1x    + 16'd1;
                    else if (add_2x) c_b2x    <= c_b2x    + 16'd1;
                    else if (add_3x) c_b3x    <= c_b3x    + 16'd1;
                    else if (add_5x) c_b5x    <= c_b5x    + 16'd1;
                    else if (add_6x) c_b6x    <= c_b6x    + 16'd1;
                    else if (add_short) c_bshort <= c_bshort + 16'd1;
                    else if (add_other) c_bother <= c_bother + 16'd1;
                end
                if (reject) c_rejected <= c_rejected + 16'd1;

                if (tick_ms) win_ms_cnt <= win_ms_cnt + 32'd1;
            end
        end
    end

endmodule
