// -----------------------------------------------------------------------------
// tb_pixel_stats.v â€” Kiem chung `pixel_stats` (muc G6.1.9)
//
// MUC DICH
//   Chung minh thong ke mau tinh DUNG tren du lieu da biet truoc. Day la phep
//   do dung de quyet dinh nguong mau trong `kvc_blob_detect` co can sua hay
//   khong, nen neu thong ke sai thi moi ket luan sau do deu sai.
//
// PHUONG PHAP
//   Bom mot frame nho voi so pixel va gia tri RGB DA BIET, roi doc bao cao
//   qua khung IF-01 va doi chieu tung con so.
//
//   Nguong rev 6 â€” khop `kvc_blob_detect.v` rev 11 (bo loc TY LE, che do NHay):
//     ord_ok  : R8 >= G8 > B8
//     hue_ok  : d >= 0 va n >= 0 va d != 0 va 6n >= d va n <= d  (10..60 do)
//     sat_ok  : 2*B8 <= R8                          (S >= 0,50)
//     tone_ok : d >= 0 va R8 >= 24 va d >= 16
//     match   = ord && hue && sat && tone
//   trong do R8 = r5*8, G8 = g6*4, B8 = b5*8, d = R8-B8, n = G8-B8.
//
//   REV 4 SUA GI
//     Rev 3 khai bao `d`/`n` 8 bit nen TRAN khi R8 < B8 / G8 < B8. `hue_ok` va
//     `tone_ok` khi do "dat" tren pixel xanh/tim â€” lam `cnt_hue_ok` va
//     `cnt_tone_ok` khong dung duoc de ket luan dieu kien nao dang loai pixel.
//     Test [5] duoi day khoa hanh vi do: cung mot pixel wrap phai cho
//     hue=0/tone=0 o rev 4.
//
//   Frame thu: 4 dong x 8 pixel = 32 pixel
//     dong 0: CAM        (R5=31, G6=30, B5=2)   R8/G8/B8 = 248/120/16
//                       ord 1, hue 1, sat 1, tone 1 -> KHOP (run 8 lien tiep)
//     dong 1: DO THUAN   (R5=31, G6=0, B5=0)    248/0/0
//                       ord 0 (G8 = 0 khong > B8), hue 0 (n < 0), sat 1, tone 1
//     dong 2: XAM        (R5=16, G6=32, B5=16)  128/128/128
//                       ord 0, hue 0 (d = 0), sat 0, tone 0
//     dong 3: TRANG      (R5=31, G6=63, B5=31)  248/252/248
//                       ord 0, hue 0 (d = 0), sat 0, tone 0
//
//   Ky vong:
//     pix_count   = 32
//     sum_r       = 8*(31+31+16+31) = 872
//     sum_g       = 8*(30+0+32+63)  = 1000
//     sum_b       = 8*(2+0+16+31)   = 392
//     cnt_match   = 8    (chi dong cam; run = 8 >= RLE_MIN = 5)
//     cnt_ord_ok  = 8    (chi dong cam)
//     cnt_hue_ok  = 8    (chi dong cam)
//     cnt_sat_ok  = 16   (cam + do thuan)
//     cnt_tone_ok = 16   (cam + do thuan)
//     max_px      = 7    (frame nho 8 cot)
//     max_py      = 3    (4 dong)
//     max_r5      = 31
//     slot 10     = 4    (dau hieu revision)
//
//   DONG 1 (DO THUAN): `sat_ok` va `tone_ok` dat nhung `ord_ok` = 0 vi G8 = 0
//   khong LON HON B8 = 0. Day la khac biet co chu y so voi rev 1 (`G_MIN = 10`
//   loai do thuan): rev 4 loai do thuan vi no KHONG PHAI mau cam, chu khong
//   phai vi no qua toi.
//
// KIEM CA: khong co VSYNC -> khong phat bao cao; frame 2 phai RESET chu khong
// cong don; `cnt_match` phai dem theo run-length giong blob.
//
// Exit code: $fatal(1) khi fail.
// -----------------------------------------------------------------------------
`timescale 1ns/1ps

module tb_pixel_stats;

    localparam integer BAUD    = 38_400;
    localparam integer CLK_HZ  = 100_000_000;
    localparam integer BIT_CYC = CLK_HZ / BAUD;

    reg        clk = 1'b0;
    reg        rst_n = 1'b0;
    reg        pclk = 1'b0;
    reg  [15:0] pixel = 16'd0;
    reg        pixel_valid = 1'b0;
    reg        href = 1'b0;
    reg        vsync = 1'b0;
    reg        frame_valid = 1'b0;

    wire [15:0] st_x, st_y;
    wire [7:0]  st_w, st_h, st_conf, st_class;
    wire        st_valid, st_last;

    integer pass_cnt = 0;
    integer fail_cnt = 0;

    always #5 clk = ~clk;      // 100 MHz
    always #7 pclk = ~pclk;    // ~71 MHz, gia tri bat ky

    pixel_stats #(.N_SLOT(12)) dut (
        .pclk        (pclk),
        .prst_n      (rst_n),
        .pixel       (pixel),
        .pixel_valid (pixel_valid),
        .href        (href),
        .vsync       (vsync),
        .frame_valid (frame_valid),
        .clk         (clk),
        .rst_n       (rst_n),
        .st_x        (st_x),
        .st_y        (st_y),
        .st_w        (st_w),
        .st_h        (st_h),
        .st_conf     (st_conf),
        .st_class    (st_class),
        .st_valid    (st_valid),
        .st_last     (st_last)
    );

    task check;
        input [255:0] name;
        input integer got;
        input integer exp;
        begin
            if (got === exp) begin
                pass_cnt = pass_cnt + 1;
                $display("  [PASS] %0s = %0d", name, got);
            end else begin
                fail_cnt = fail_cnt + 1;
                $display("  [FAIL] %0s = %0d (ky vong %0d)", name, got, exp);
            end
        end
    endtask

    // Bom mot pixel: dat du lieu + valid trong 1 chu ky pclk
    task send_pixel;
        input [15:0] p;
        begin
            @(negedge pclk);
            pixel       = p;
            pixel_valid = 1'b1;
            @(negedge pclk);
            pixel_valid = 1'b0;
        end
    endtask

    // Thu thap cac slot bao cao phat ra tren duong st_*
    reg [15:0] slot_x [0:23];
    reg [15:0] slot_y [0:23];
    reg  [7:0] slot_w [0:23];
    integer    n_slot;
    reg        got_last;

    initial begin
        n_slot   = 0;
        got_last = 1'b0;
    end

    always @(posedge clk) begin
        if (st_valid) begin
            if (n_slot < 24) begin
                slot_x[n_slot] = st_x;
                slot_y[n_slot] = st_y;
                slot_w[n_slot] = st_w;
            end
            n_slot = n_slot + 1;
        end
        if (st_last) got_last = 1'b1;
    end

    // Giai ma hai truong 16 bit thanh so nguyen
    function integer join16;
        input [15:0] lo;
        input [15:0] hi;
        begin
            join16 = lo + (hi << 16);
        end
    endfunction

    integer i;
    integer t;

    initial begin
        $display("================================================================");
        $display("  tb_pixel_stats â€” thong ke mau RGB565 (G6.1.9, rev 6)");
        $display("================================================================");

        // ---- Test 1: khong co VSYNC -> khong phat bao cao ----
        $display("\n[1] Khong co VSYNC: khong duoc phat bao cao");
        rst_n = 1'b0;
        repeat (5) @(posedge clk);
        rst_n = 1'b1;
        repeat (10) @(posedge clk);
        check("n_slot sau reset", n_slot, 0);
        check("got_last sau reset", got_last, 0);

        // ---- Test 2: mot frame day du ----
        $display("\n[2] Mot frame 4x8 = 32 pixel, gia tri da biet");

        @(negedge pclk); vsync = 1'b1;
        @(negedge pclk); vsync = 1'b0; frame_valid = 1'b1;
        repeat (2) @(negedge pclk);
        frame_valid = 1'b0;

        for (i = 0; i < 4; i = i + 1) begin
            @(negedge pclk); href = 1'b1;
            for (t = 0; t < 8; t = t + 1) begin
                case (i)
                    0: send_pixel(16'b11111_011110_00010);  // cam (31,30,2) -> KHOP
                    1: send_pixel(16'b11111_000000_00000);  // do thuan (31,0,0) -> ord=0
                    2: send_pixel(16'b10000_100000_10000);  // xam (16,32,16) -> d=0
                    default: send_pixel(16'b11111_111111_11111); // trang -> d=0
                endcase
            end
            @(negedge pclk); href = 1'b0;
        end

        repeat (2) @(negedge pclk);
        @(negedge pclk); vsync = 1'b1;
        @(negedge pclk); vsync = 1'b0;

        repeat (200) @(posedge clk);

        check("so slot phat ra", n_slot, 12);
        check("got_last", got_last, 1);

        for (i = 0; i < 12; i = i + 1) begin
            if (slot_w[i] !== i[7:0]) begin
                fail_cnt = fail_cnt + 1;
                $display("  [FAIL] slot %0d: W = %0d (ky vong %0d)", i, slot_w[i], i);
            end
        end
        if (fail_cnt == 0) begin
            pass_cnt = pass_cnt + 1;
            $display("  [PASS] thu tu slot 0..11 dung");
        end

        // ---- Kiem gia tri thong ke ----
        $display("\n[3] Gia tri thong ke (bo loc ty le rev 6)");
        check("pix_count",   join16(slot_x[0], slot_y[0]), 32);
        check("sum_r",       join16(slot_x[1], slot_y[1]), 872);
        check("sum_g",       join16(slot_x[2], slot_y[2]), 1000);
        check("sum_b",       join16(slot_x[3], slot_y[3]), 392);
        check("cnt_match",   join16(slot_x[4], slot_y[4]), 8);
        check("cnt_ord_ok",  join16(slot_x[6], slot_y[6]), 8);
        check("cnt_hue_ok",  join16(slot_x[7], slot_y[7]), 8);
        check("cnt_sat_ok",  join16(slot_x[8], slot_y[8]), 16);
        check("cnt_tone_ok", join16(slot_x[9], slot_y[9]), 16);
        check("PIXSTAT_REV (slot 10)", join16(slot_x[10], slot_y[10]), 6);

        // Rev 5: slot 5 X = {vsync_per_rep[5:0], max_px[9:0]}
        check("max_px (frame 8 cot)", slot_x[5] & 16'h03FF, 7);
        check("max_py (frame 4 dong)", slot_y[5], 3);
        check("vsync_per_rep (1 bao cao)", (slot_x[5] >> 10) & 16'h003F, 1);

        // Rev 5: slot 11 X = href_last (so HREF trong chu ky VSYNC vua roi),
        //         slot 11 Y = max_r5.
        // Frame thu co 4 dong HREF -> href_last phai = 4.
        check("href_last (4 dong HREF)", slot_x[11], 4);
        check("max_r5 (slot 11 Y)", slot_y[11], 31);

        // Bat bien: cnt_match <= min(ord, hue, sat, tone)
        if (join16(slot_x[4], slot_y[4]) > join16(slot_x[6], slot_y[6])) begin
            fail_cnt = fail_cnt + 1;
            $display("  [FAIL] cnt_match > cnt_ord_ok");
        end

        // ---- Test 3: frame thu hai, chi de xac nhan khong bi cong don ----
        $display("\n[4] Frame thu hai: thong ke phai RESET, khong cong don");

        n_slot = 0;
        got_last = 1'b0;

        @(negedge pclk); vsync = 1'b1;
        @(negedge pclk); vsync = 1'b0; frame_valid = 1'b1;
        repeat (2) @(negedge pclk);
        frame_valid = 1'b0;
        repeat (2) @(negedge pclk);

        // Chi 2 dong x 8 pixel CAM (khop) = 16 pixel
        for (i = 0; i < 2; i = i + 1) begin
            @(negedge pclk); href = 1'b1;
            for (t = 0; t < 8; t = t + 1) begin
                send_pixel(16'b11111_011110_00010);
            end
            @(negedge pclk); href = 1'b0;
        end

        repeat (2) @(negedge pclk);
        @(negedge pclk); vsync = 1'b1;
        @(negedge pclk); vsync = 1'b0;
        repeat (200) @(posedge clk);

        check("frame2 pix_count",  join16(slot_x[0], slot_y[0]), 16);
        check("frame2 sum_r",      join16(slot_x[1], slot_y[1]), 16 * 31);
        check("frame2 sum_g",      join16(slot_x[2], slot_y[2]), 16 * 30);
        check("frame2 cnt_match",  join16(slot_x[4], slot_y[4]), 16);

        // ---- Test 5: hoi quy TRAN 8 BIT (loi rev 3) ----
        //
        // Rev 3 khai bao d = R8-B8 va n = G8-B8 la 8 bit khong dau. Khi R8 < B8
        // phep tru quay vong thanh so duong LON, nen pixel XANH/TIM lot qua
        // `hue_ok` va `tone_ok`. Hai mau duoi day chung minh dieu do:
        //
        //   (1,23,7)  -> R8/G8/B8 = 8/92/56
        //                d = (8-56) mod 256 = 208, n = (92-56) = 36
        //                rev 3: 6*36=216 >= 208 va 3*36=108 <= 416 -> hue_ok = 1
        //                rev 4: d < 0 -> hue_ok = 0
        //
        //   (4,25,30) -> R8/G8/B8 = 32/100/240
        //                d = (32-240) mod 256 = 48 >= 24 -> rev 3 tone_ok = 1
        //                rev 4: d < 0 -> tone_ok = 0
        //
        // Ca hai deu la mau LANH (R < B). Neu rev 4 dung thi KHONG mot chi tieu
        // nao duoc dem, va `cnt_match` = 0.
        $display("\n[5] Hoi quy tran 8 bit: pixel R<B khong duoc tinh hue/tone");
        n_slot = 0;
        got_last = 1'b0;

        @(negedge pclk); vsync = 1'b1;
        @(negedge pclk); vsync = 1'b0; frame_valid = 1'b1;
        repeat (2) @(negedge pclk);
        frame_valid = 1'b0;
        repeat (2) @(negedge pclk);

        for (i = 0; i < 2; i = i + 1) begin
            @(negedge pclk); href = 1'b1;
            for (t = 0; t < 8; t = t + 1) begin
                case (i)
                    0: send_pixel(16'b00001_010111_00111);  // (1,23,7)  -> wrap hue
                    default: send_pixel(16'b00100_011001_11110); // (4,25,30) -> wrap tone
                endcase
            end
            @(negedge pclk); href = 1'b0;
        end

        repeat (2) @(negedge pclk);
        @(negedge pclk); vsync = 1'b1;
        @(negedge pclk); vsync = 1'b0;
        repeat (200) @(posedge clk);

        check("wrap pix_count",   join16(slot_x[0], slot_y[0]), 16);
        check("wrap sum_r",       join16(slot_x[1], slot_y[1]), 40);
        check("wrap sum_g",       join16(slot_x[2], slot_y[2]), 384);
        check("wrap sum_b",       join16(slot_x[3], slot_y[3]), 296);
        check("wrap cnt_ord_ok",  join16(slot_x[6], slot_y[6]), 0);
        check("wrap cnt_hue_ok",  join16(slot_x[7], slot_y[7]), 0);
        check("wrap cnt_sat_ok",  join16(slot_x[8], slot_y[8]), 0);
        check("wrap cnt_tone_ok", join16(slot_x[9], slot_y[9]), 0);
        check("wrap cnt_match",   join16(slot_x[4], slot_y[4]), 0);
        check("wrap max_r5",      slot_y[11], 4);
        check("wrap max_px",      slot_x[5] & 16'h03FF, 7);
        check("wrap max_py",      slot_y[5], 1);
        check("wrap href_last (2 dong)", slot_x[11], 2);

        // ---- Test 6: F-10 â€” VSYNC gai giua khung ----
        //
        // Day la ca mau tra loi truc tiep cau hoi cua F-10 va chinh la co che
        // dang nghi tren bo that.
        //
        // Khi mot gai VSYNC roi vao GIUA khung, FPGA phat HAI bao cao lien
        // tiep, moi bao cao mo ta mot PHA cua khung:
        //   report 1: pix_count = pixel pha 1, href_per_vs = so dong pha 1
        //   report 2: pix_count = pixel pha 2, href_per_vs = so dong pha 2
        // Tong hai pix_count = toan bo pixel cua khung.
        //
        // Do chinh la dau van tay cua F-10 tren bo: hai bao cao lien tiep co
        // tong pixel ~ 120.000 (mot khung 400x300) thay vi moi bao cao ~120.000.
        // Test kiem ca hai phia de khong the PASS gia.
        $display("\n[6] F-10: VSYNC gai giua khung -> hai bao cao");
        n_slot = 0;
        got_last = 1'b0;

        // Pha 1: 3 dong x 8 pixel
        @(negedge pclk); vsync = 1'b1;
        @(negedge pclk); vsync = 1'b0; frame_valid = 1'b1;
        repeat (2) @(negedge pclk);
        frame_valid = 1'b0;
        for (i = 0; i < 3; i = i + 1) begin
            @(negedge pclk); href = 1'b1;
            for (t = 0; t < 8; t = t + 1) send_pixel(16'b11111_011110_00010);
            @(negedge pclk); href = 1'b0;
        end

        // GAI VSYNC giua khung
        repeat (2) @(negedge pclk);
        @(negedge pclk); vsync = 1'b1;
        @(negedge pclk); vsync = 1'b0; frame_valid = 1'b1;
        repeat (2) @(negedge pclk);
        frame_valid = 1'b0;

        // Pha 2: 2 dong x 8 pixel
        for (i = 0; i < 2; i = i + 1) begin
            @(negedge pclk); href = 1'b1;
            for (t = 0; t < 8; t = t + 1) send_pixel(16'b11111_011110_00010);
            @(negedge pclk); href = 1'b0;
        end

        repeat (2) @(negedge pclk);
        @(negedge pclk); vsync = 1'b1;
        @(negedge pclk); vsync = 1'b0;
        repeat (200) @(posedge clk);

        check("glitch: so bao cao", n_slot, 24);
        check("glitch bao cao 1: pix_count", join16(slot_x[0], slot_y[0]), 24);
        check("glitch bao cao 1: href_per_vs", slot_x[11], 3);
        check("glitch bao cao 2: pix_count", join16(slot_x[12], slot_y[12]), 16);
        check("glitch bao cao 2: href_per_vs", slot_x[23], 2);
        check("glitch tong pixel = ca khung", join16(slot_x[0], slot_y[0])
                                            + join16(slot_x[12], slot_y[12]), 40);

        // ---- Tong ket ----
        $display("\n================================================================");
        $display("  KET QUA: %0d PASS / %0d FAIL", pass_cnt, fail_cnt);
        $display("================================================================");
        if (fail_cnt != 0) $fatal(1, "tb_pixel_stats FAIL");
        $finish;
    end

    initial begin
        #2_000_000;
        $display("[FAIL] timeout");
        $fatal(1, "timeout");
    end

endmodule

