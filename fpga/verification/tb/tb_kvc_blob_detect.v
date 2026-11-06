// -----------------------------------------------------------------------------
// tb_kvc_blob_detect.v — Unit test cho kvc_blob_detect (rev 11)
//
// REV 11 — CHE DO NHay: `n0` -> `n1`.
//     LUM_MIN    : 32 -> 24
//     CHROMA_MIN : 24 -> 16
//     MIN_PIXELS : 20 -> 12
//     CONF_SHIFT : 4 -> 3
//     ord_ok     : R > G  ->  R >= G
//     hue_hi     : 4n <= 3d (45 do) -> n <= d (60 do)
//     sat_ok     : 4B <= R (0,75)   -> 2B <= R (0,50)
//     ROW_MIN    : 3 -> 2
//     RLE_BOX    : MOI — nguong run-length rieng cho viec mo bbox
//     MAX_SPAN   : LOAI hop bao -> CLAMP hop bao ve 255x255
//
// BA TEST DOI KY VONG (6, 7, 15) — day la DOI TRAI DA GHI, khong phai bug:
//     Truoc rev 11 chung la "PASS = KHONG phat" (chong duong tinh gia).
//     Nay chung PHAI phat, vi rev 11 uu tien do nhay. Neu ai siet nguong
//     tro lai, ba test nay se FAIL — do la co che bao ve thay doi.
//
// KICH BAN (23 test):
//   1-5   nhu cu (khung bao, nen, bien, trang)
//   6. Vang chanh 53,8 do -> PHAI PHAT (rev 11 noi hue len 60 do)
//   7. Hai khoi cam roi xa -> PHAI PHAT voi w = 255 (CLAMP, khong loai)
//   8-14  nhu cu
//   15. Da nguoi S=0,67 -> PHAI PHAT (rev 11 ha sat xuong 0,50)
//
// Exit code: $fatal(1,...) khi fail.
// -----------------------------------------------------------------------------
`timescale 1ns/1ps

module tb_kvc_blob_detect;

    localparam real PCLK_T = 20.0;    // 50 MHz (chi can dung, khong phai tan so that)
    localparam real CLK_T  = 10.0;    // 100 MHz

    reg pclk   = 1'b0;
    reg clk    = 1'b0;
    reg prst_n = 1'b0;
    reg rst_n  = 1'b0;

    reg [15:0] pixel       = 16'd0;
    reg        pixel_valid = 1'b0;
    reg        href        = 1'b0;
    reg        vsync       = 1'b0;
    reg        frame_valid = 1'b0;

    wire        bbox_valid, bbox_last;
    wire [15:0] bbox_x, bbox_y;
    wire [7:0]  bbox_w, bbox_h, bbox_conf, bbox_class;

    // Mau RGB565
    localparam [15:0] C_ORANGE  = {5'd31, 6'd30, 5'd2};   // (255,120,20)  cam
    localparam [15:0] C_ORANGE2 = {5'd31, 6'd37, 5'd5};   // (255,150,40)  cam nhat
    localparam [15:0] C_DARK50  = {5'd15, 6'd16, 5'd0};   // (127,64,0)    cam 50 % sang
    localparam [15:0] C_DARK25  = {5'd8,  6'd9,  5'd0};   // (63,32,0)     cam 25 % sang
    localparam [15:0] C_SKIN    = {5'd24, 6'd33, 5'd8};   // (198,134,66)  da nguoi
    // Da nguoi TOI (141,85,36) -> R8/G8/B8 = 136/84/32, H = 30 do, S = 0,765.
    // NAM GIUA hai nguong: 4*32 = 128 <= 136 (rev 5 NHAN) nhung
    //                      5*32 = 160 >  136 (rev 6 LOAI). Day la ca chinh.
    localparam [15:0] C_SKIN_DARK = {5'd17, 6'd21, 5'd4};
    // Da nguoi NGAM duoi anh sang am (176,108,40) -> R8/G8/B8 = 176/108/40,
    // H = 30 do, S = 0,773. Cung nam trong khe 0,75..0,80 nhu C_SKIN_DARK
    // nhung o tong sang cao hon — chung minh nguong 5B chan duoc ca dai, khong
    // phai chi mot gia tri mau duy nhat.
    localparam [15:0] C_SKIN_TAN = {5'd22, 6'd27, 5'd5};
    // Nap hop cam nghieng ~42 do, kieu anh sang phong: (255,150,40).
    localparam [15:0] C_ORANGE42 = {5'd31, 6'd37, 5'd5};
    localparam [15:0] C_WATER   = {5'd7,  6'd37, 5'd22};  // (60,150,180)  nuoc
    localparam [15:0] C_WHITE   = {5'd31, 6'd63, 5'd31};  // (255,255,255) trang
    localparam [15:0]     C_YELLOW  = {5'd31, 6'd57, 5'd7};   // (255,230,60)  vang chanh -> REV 11: PHAT
    // Vang mat ong / den tron vang (248,188,40) -> R8/G8/B8 = 248/188/40,
    // H = 42,7 do, S = 0,839.
    localparam [15:0] C_YELLOW_AMBER = {5'd31, 6'd47, 5'd5};
    // Bong den soi dot / vet loa chay sang (248, 184, 24) -> R8 >= 232 va G8 >= 148: BI NOT_GLARE CHAN
    localparam [15:0] C_GLARE = {5'd31, 6'd46, 5'd3};
    // Vệt nắng mặt trời rọi sàn gỗ / gạch men (210, 150, 24) -> R8/G8/B8 = 208/148/24, H = 40.4 do, S = 0.885.
    localparam [15:0] C_SUNLIGHT_WOOD = {5'd26, 6'd37, 5'd3};
    // NAP CAM DUOI AWB LECH — truong hop lam `n0` tren bo that.
    // (208,120,96) -> R8/G8/B8 = 208/120/96. S = 0,538, H = 30 do.
    //   rev 10: 4*96 = 384 > 208  -> LOAI (sat_ok 0,75)
    //   rev 11: 2*96 = 192 <= 208 -> NHAN (sat_ok 0,50)
    //   rev 12: 5*96 = 480 > 416  -> LOAI (sat_ok 0,60, cat bo mat ban go/carton)
    localparam [15:0] C_ORANGE_AWB = {5'd26, 6'd30, 5'd12};
    // NAP CAM THUC TE TRONG NHA do tu anh chup (212,113,8) -> R8/G8/B8 = 208/112/8, H = 31,4 do, S = 0,962.
    localparam [15:0] C_ORANGE_LID = {5'd26, 6'd28, 5'd1};
    // TRUNG BINH DO DUOC tren bo (G6.1.9 rev 5): 118/138/148 -> B > G > R.
    // Khong phai mau cam; bo loc PHAI tu choi. Khoa lai de khong ai "sua"
    // nguong theo huong nhan ca khung xanh.
    localparam [15:0] C_BLUISH = {5'd14, 6'd34, 5'd18};
    // Mau DEN nhieu cam bien toi tren bo: R8=24, G8=16, B8=0 -> REV 22 PHAI CHAN
    localparam [15:0] C_BLACK  = {5'd3,  6'd4,  5'd0};

    integer pass_cnt = 0;
    integer fail_cnt = 0;

    always #(PCLK_T/2) pclk = ~pclk;
    always #(CLK_T/2)  clk  = ~clk;

    kvc_blob_detect dut (
        .pclk        (pclk),
        .prst_n      (prst_n),
        .pixel       (pixel),
        .pixel_valid (pixel_valid),
        .href        (href),
        .vsync       (vsync),
        .frame_valid (frame_valid),
        .clk         (clk),
        .rst_n       (rst_n),
        .bbox_valid  (bbox_valid),
        .bbox_last   (bbox_last),
        .bbox_x      (bbox_x),
        .bbox_y      (bbox_y),
        .bbox_w      (bbox_w),
        .bbox_h      (bbox_h),
        .bbox_conf   (bbox_conf),
        .bbox_class  (bbox_class)
    );

    // ------------------------------------------------------------------
    // Thu nghiem: danh sach hinh chu nhat "cam" (toi da 8)
    // ------------------------------------------------------------------
    integer nb = 0;
    integer bx0_a [0:7];
    integer by0_a [0:7];
    integer bx1_a [0:7];
    integer by1_a [0:7];

    // Che do "hat nhieu": chi to mau khi (x % 3 == 0 && y % 3 == 0) -> moi run = 1
    reg noise_mode = 1'b0;

    // Che do "vet ngang": ve cac vet dai `dash_width` px, cach nhau `dash_width`
    // px. Dung de co lap RLE_MIN ma khong bi anh huong boi MIN_PIXELS/aspect.
    reg    dash_mode  = 1'b0;
    integer dash_width = 4;

    function automatic is_fg;
        input integer xx;
        input integer yy;
        integer k;
        reg hit;
        begin
            hit = 1'b0;
            if (noise_mode) begin
                hit = ((xx % 3) == 0) && ((yy % 3) == 0);
            end else if (dash_mode) begin
                // vet: (xx % (2*dash_width)) < dash_width
                hit = ((xx % (2 * dash_width)) < dash_width);
            end else begin
                for (k = 0; k < 8; k = k + 1) begin
                    if (k < nb &&
                        xx >= bx0_a[k] && xx < bx1_a[k] &&
                        yy >= by0_a[k] && yy < by1_a[k])
                        hit = 1'b1;
                end
            end
            is_fg = hit;
        end
    endfunction

    task automatic clear_blobs;
        begin
            nb = 0;
            noise_mode = 1'b0;
            dash_mode  = 1'b0;
            dash_width = 4;
        end
    endtask

    task automatic add_blob;
        input integer x0, y0, w, h;
        begin
            if (w > 0 && h > 0) begin
                bx0_a[nb] = x0;        by0_a[nb] = y0;
                bx1_a[nb] = x0 + w;    by1_a[nb] = y0 + h;
                nb = nb + 1;
            end
        end
    endtask

    // ------------------------------------------------------------------
    // Kich ban camera: vsync pulse + than frame
    //
    // KY LUAT DRIVE: moi tin hieu kich thich doi o canh XUONG cua pclk de
    // DUT (sample o canh len) khong bi race.
    // ------------------------------------------------------------------
    task automatic vsync_pulse;
        input integer fvalid;
        begin
            @(negedge pclk);
            vsync       = 1'b1;
            @(negedge pclk);
            frame_valid = fvalid[0];
            repeat (4) @(negedge pclk);
            vsync       = 1'b0;      // frame_valid con cao qua canh xuong
            @(negedge pclk);
            frame_valid = 1'b0;
            @(negedge pclk);
        end
    endtask

    task automatic body;
        input integer W, H;
        input [15:0]  bg;
        input [15:0]  fg;
        integer xx, yy;
        begin
            for (yy = 0; yy < H; yy = yy + 1) begin
                @(negedge pclk);
                href = 1'b1;
                for (xx = 0; xx < W; xx = xx + 1) begin
                    pixel       = is_fg(xx, yy) ? fg : bg;
                    pixel_valid = 1'b1;
                    @(negedge pclk);
                end
                pixel_valid = 1'b0;
                href        = 1'b0;
                @(negedge pclk);
                @(negedge pclk);
            end
        end
    endtask

    // ------------------------------------------------------------------
    // Bat output o domain clk
    // ------------------------------------------------------------------
    reg        cap_arm   = 1'b0;
    integer    cap_seq   = 0;
    integer    cap_valid = 0;
    integer    cap_last  = 0;
    integer    cap_class = -1;
    integer    cap_conf  = 0;
    reg [15:0] cap_x = 16'hDEAD, cap_y = 16'hDEAD;
    reg [7:0]  cap_w = 8'hDE, cap_h = 8'hDE;

    always @(posedge clk) begin
        if (rst_n && cap_arm) begin
            if (bbox_valid) begin
                cap_seq   = cap_seq + 1;
                cap_valid = 1;
                cap_x     = bbox_x;
                cap_y     = bbox_y;
                cap_w     = bbox_w;
                cap_h     = bbox_h;
                cap_conf  = bbox_conf;
                cap_class = bbox_class;
            end
            if (bbox_last) begin
                cap_seq  = cap_seq + 1;
                cap_last = 1;
            end
        end
    end

    task automatic arm;
        begin
            cap_valid = 0;
            cap_last  = 0;
            cap_seq   = 0;
            cap_arm   = 1'b1;
        end
    endtask

    task automatic check_frame;
        input integer exp_valid;
        input integer exp_pulse;   // 1 = phai co it nhat mot xung (valid hoac last)
        input integer ex, ey, ew, eh;
        input [255:0] label;
        integer guard;
        reg bad;
        begin
            guard = 0;
            while (cap_seq == 0 && guard < 200000) begin
                @(posedge clk);
                guard = guard + 1;
            end
            // Cho xung thu hai (bbox_last sau bbox_valid)
            repeat (20) @(posedge clk);
            cap_arm = 1'b0;

            bad = 1'b0;

            if (!exp_pulse) begin
                if (cap_seq != 0) begin
                    bad = 1'b1;
                    $display("      ky vong KHONG co xung nao, nhung thay seq=%0d valid=%0d last=%0d",
                             cap_seq, cap_valid, cap_last);
                end
            end else if (cap_seq == 0) begin
                bad = 1'b1;
                $display("      khong thay xung nao (timeout)");
            end else if (exp_valid) begin
                if (!cap_valid) begin
                    bad = 1'b1;
                    $display("      thieu bbox_valid (chi thay bbox_last)");
                end
                if (!cap_last) begin
                    bad = 1'b1;
                    $display("      thieu bbox_last sau bbox_valid -> packetizer se mat bbox");
                end
                if (cap_x !== ex[15:0] || cap_y !== ey[15:0] ||
                    cap_w !== ew[7:0]  || cap_h !== eh[7:0]) begin
                    bad = 1'b1;
                    $display("      hop bao sai: x=%0d (ky vong %0d) y=%0d (%0d) w=%0d (%0d) h=%0d (%0d)",
                             cap_x, ex, cap_y, ey, cap_w, ew, cap_h, eh);
                end
                if (cap_class !== 2) begin
                    bad = 1'b1;
                    $display("      class = %0d, ky vong 2 (lifebuoy)", cap_class);
                end
                if (cap_conf <= 0) begin
                    bad = 1'b1;
                    $display("      conf = %0d, ky vong > 0", cap_conf);
                end
            end else begin
                if (cap_valid) begin
                    bad = 1'b1;
                    $display("      KHONG duoc co bbox_valid nhung lai co (x=%0d y=%0d w=%0d h=%0d)",
                             cap_x, cap_y, cap_w, cap_h);
                end
                if (!cap_last) begin
                    bad = 1'b1;
                    $display("      thieu bbox_last (frame rong van phai gui khung N=0)");
                end
            end

            if (bad) begin
                $display("  FAIL %0s", label);
                fail_cnt = fail_cnt + 1;
            end else begin
                $display("  PASS %0s", label);
                pass_cnt = pass_cnt + 1;
            end
        end
    endtask

    // Chay 1 frame (vsync + than) va doc ket qua o vsync ke tiep.
    // `fg` la mau vat, `bg` la mau nen.
    task automatic run_frame;
        input integer W, H;
        input [15:0]  bg;
        input [15:0]  fg;
        begin
            vsync_pulse(1);
            body(W, H, bg, fg);
            arm();
            vsync_pulse(1);
        end
    endtask

    // ------------------------------------------------------------------
    // Chuong trinh chinh
    // ------------------------------------------------------------------
    initial begin
        $display("=== tb_kvc_blob_detect (16 kich ban, bo loc ty le rev 2) ===");

        prst_n = 1'b0;
        rst_n  = 1'b0;
        repeat (20) @(posedge pclk);
        repeat (20) @(posedge clk);
        prst_n = 1'b1;
        rst_n  = 1'b1;
        repeat (20) @(posedge pclk);

        // --------------------------------------------------------------
        // Hai frame dau bi SKIP_FRAMES -> phai im lang hoan toan
        // --------------------------------------------------------------
        $display("");
        $display("--- Khoi tao: 2 frame bi skip (frame_valid = 0) ---");
        arm();
        clear_blobs();
        add_blob(10, 10, 200, 200);
        vsync_pulse(0);
        body(320, 240, C_WATER, C_ORANGE);
        vsync_pulse(0);
        body(320, 240, C_WATER, C_ORANGE);
        vsync_pulse(0);
        check_frame(0, 0, 0, 0, 0, 0, "2 frame skip: khong phat gi");

        // --------------------------------------------------------------
        // Test 1: khoi cam 100x80 tai (200,150) trong 640x480
        // --------------------------------------------------------------
        $display("");
        $display("--- Test 1: khoi cam 100x80 tai (200,150), frame 640x480 ---");
        clear_blobs();
        add_blob(200, 150, 100, 80);
        vsync_pulse(1);
        body(640, 480, C_WATER, C_ORANGE);
        arm();
        vsync_pulse(1);
        check_frame(1, 1, 250, 190, 100, 80, "test 1: x=250 y=190 w=100 h=80");
        $display("      conf = %0d, class = %0d", cap_conf, cap_class);

        // --------------------------------------------------------------
        // Test 2: nen nuoc, khong co vat cam
        // --------------------------------------------------------------
        $display("");
        $display("--- Test 2: nen nuoc hoi xanh (khong blob) ---");
        clear_blobs();
        vsync_pulse(1);
        body(320, 240, C_WATER, C_ORANGE);
        arm();
        vsync_pulse(1);
        check_frame(0, 1, 0, 0, 0, 0, "test 2: valid=0, van gui khung N=0");

        // --------------------------------------------------------------
        // Test 3: khoi cam 2x2 = 4 px < MIN_PIXELS = 12
        //   REV 11: MIN_PIXELS 20 -> 12, nen kich thuoc phai nho hon 12 moi chan.
        // --------------------------------------------------------------
        $display("");
        $display("--- Test 3: khoi cam 2x2 (4 px < MIN_PIXELS=12) ---");
        clear_blobs();
        add_blob(100, 100, 2, 2);
        vsync_pulse(1);
        body(320, 240, C_WATER, C_ORANGE);
        arm();
        vsync_pulse(1);
        check_frame(0, 1, 0, 0, 0, 0, "test 3: duoi MIN_PIXELS -> valid=0");

        // --------------------------------------------------------------
        // Test 4: sat bien trai/tren
        // --------------------------------------------------------------
        $display("");
        $display("--- Test 4: khoi cam 100x80 tai (0,0) ---");
        clear_blobs();
        add_blob(0, 0, 100, 80);
        vsync_pulse(1);
        body(320, 240, C_WATER, C_ORANGE);
        arm();
        vsync_pulse(1);
        check_frame(1, 1, 50, 40, 100, 80, "test 4: bien trai/tren, khong tran so");

        // --------------------------------------------------------------
        // Test 5: trang chay toan frame
        // --------------------------------------------------------------
        $display("");
        $display("--- Test 5: trang chay (31,63,31) toan frame ---");
        clear_blobs();
        add_blob(0, 0, 320, 240);
        vsync_pulse(1);
        body(320, 240, C_WHITE, C_WHITE);
        arm();
        vsync_pulse(1);
        check_frame(0, 1, 0, 0, 0, 0, "test 5: trang chay -> valid=0 (bao hoa + hue)");

        // --------------------------------------------------------------
        // Test 6: vang chanh (31,57,7) — REV 12: LOAI (H <= 45 do)
        //
        // R8/G8/B8 = 248/228/56, H = 53,8 do, S = 0,774.
        // Rev 12 siet hue_hi = 45 do (4n <= 3d) de cat bo mau vang / den vang.
        // --------------------------------------------------------------
        $display("");
        $display("--- Test 6: vang chanh (31,57,7) -> REV 12 LOAI (H=53,8 > 45) ---");
        clear_blobs();
        add_blob(0, 0, 320, 240);
        vsync_pulse(1);
        body(320, 240, C_YELLOW, C_YELLOW);
        arm();
        vsync_pulse(1);
        check_frame(0, 1, 0, 0, 0, 0,
                    "test 6: vang chanh -> LOAI (H <= 45 do)");

        // --------------------------------------------------------------
        // Test 7: hai khoi cam roi xa — REV 11 DOI KY VONG: PHAI PHAT (CLAMP)
        //
        // Rev 10 loai vi span x = 309 > MAX_SPAN = 255. Rev 11 CLAMP hop bao
        // ve 255x255 nen khong con bi loai. day la thay doi chinh sua F-04/F-05:
        // cuc tri toan cuc khong con xoa ket qua.
        //
        // Hinh hoc: min_x=0, max_x=309 -> cx = (0+309+1)>>1 = 155, w = 255.
        //           min_y=0, max_y=209 -> cy = (0+209+1)>>1 = 105, h = 210.
        // --------------------------------------------------------------
        $display("");
        $display("--- Test 7: hai khoi cam roi xa (span x = 309 > MAX_SPAN=255) -> REV 18 LOAI ---");
        clear_blobs();
        add_blob(0, 0, 60, 60);        // 3600 px
        add_blob(250, 150, 60, 60);    // 3600 px
        vsync_pulse(1);
        body(320, 240, C_WATER, C_ORANGE2);
        arm();
        vsync_pulse(1);
        check_frame(0, 1, 0, 0, 0, 0,
                    "test 7: span > MAX_SPAN -> LOAI (khong tao BBox gia toan khung)");

        // --------------------------------------------------------------
        // Test 8: frame_valid = 0 -> khong tich luy, khong phat
        // --------------------------------------------------------------
        $display("");
        $display("--- Test 8: frame_valid = 0 (camera dang skip) ---");
        clear_blobs();
        add_blob(100, 100, 100, 80);
        arm();
        vsync_pulse(0);
        body(320, 240, C_WATER, C_ORANGE);
        vsync_pulse(0);
        body(320, 240, C_WATER, C_ORANGE);
        vsync_pulse(0);
        check_frame(0, 0, 0, 0, 0, 0, "test 8: frame skip -> khong phat gi");

        // frame hop le tro lai phai hoat dong lai
        $display("");
        $display("--- Test 8b: frame hop le tro lai sau khi skip ---");
        clear_blobs();
        add_blob(100, 100, 100, 80);
        vsync_pulse(1);
        body(320, 240, C_WATER, C_ORANGE);
        arm();
        vsync_pulse(1);
        check_frame(1, 1, 150, 140, 100, 80, "test 8b: hoi phuc sau skip");

        // --------------------------------------------------------------
        // Test 9: 25x25 = 625 px
        // --------------------------------------------------------------
        $display("");
        $display("--- Test 9: khoi 25x25 (625 px) ---");
        clear_blobs();
        add_blob(20, 20, 25, 25);
        vsync_pulse(1);
        body(320, 240, C_WATER, C_ORANGE);
        arm();
        vsync_pulse(1);
        check_frame(1, 1, 32, 32, 25, 25, "test 9: 625 px khong bi chan oan");
        $display("      conf = %0d (625>>4 = 39)", cap_conf);

        // --------------------------------------------------------------
        // Test 10: khoi cam 6x6 = 36 px (vua tren nguong 20)
        //
        // REV 10: MIN_PIXELS = 20, ROW_MIN = 3. Khoi 6x6 cho cnt = 36,
        // rows = 6 >= 3. Kich thuoc gan voi cnt trung binh do duoc tren bo
        // (43 px) — chung minh nguong 20 khong chan oan vat the nho.
        // --------------------------------------------------------------
        $display("");
        $display("--- Test 10: khoi 6x6 (36 px, gan cnt trung binh tren bo) ---");
        clear_blobs();
        add_blob(40, 40, 6, 6);
        vsync_pulse(1);
        body(320, 240, C_WATER, C_ORANGE);
        arm();
        vsync_pulse(1);
        check_frame(1, 1, 43, 43, 6, 6, "test 10: 36 px -> phat");
        $display("      conf = %0d (36>>4 = 2)", cap_conf);

        // --------------------------------------------------------------
        // Test 11: hat nhieu roi rac — moi run = 1 px, tong ~400 px mau cam.
        //   Truoc rev 2, 400 hat nay duoi MIN_PIXELS=400 va van co the lot.
        //   Sau rev 2, run-length = 1 < RLE_MIN = 3 -> cnt = 0.
        // --------------------------------------------------------------
        $display("");
        $display("--- Test 11: 400 hat nhieu roi rac (run = 1 px) ---");
        clear_blobs();
        noise_mode = 1'b1;
        vsync_pulse(1);
        body(120, 120, C_WATER, C_ORANGE);   // 40x40 = 1600 hat
        arm();
        vsync_pulse(1);
        check_frame(0, 1, 0, 0, 0, 0, "test 11: hat nhieu roi rac -> valid=0");
        noise_mode = 1'b0;

        // --------------------------------------------------------------
        // Test 11b: VET NHIEU run = 2 px — duoi RLE_MIN = 3 nen bi chan
        //
        // REV 11: RLE_MIN 5 -> 3 de bat duoc vat that duoi AWB lech. Test nay
        // khoa nguong MOI: run 2 van bi loai, run 3 moi duoc tinh.
        //
        // Mo phong: 40 dong x 8 vet, moi vet 2 px cach nhau 6 px.
        // Neu RLE_MIN <= 2 thi cnt = 640 >= 12 -> phat.
        // Voi RLE_MIN = 3 thi cnt = 0 -> khong phat.
        // --------------------------------------------------------------
        $display("");
        $display("--- Test 11b: 8 vet x 1 px/dong (run=1 < RLE_MIN=2) -> KHONG phat ---");
        clear_blobs();
        dash_mode   = 1'b1;
        dash_width  = 1;
        vsync_pulse(1);
        body(64, 40, C_WATER, C_ORANGE);
        arm();
        vsync_pulse(1);
        check_frame(0, 1, 0, 0, 0, 0, "test 11b: run=1 < RLE_MIN=2 -> valid=0");
        dash_mode  = 1'b0;
        dash_width = 4;

        // --------------------------------------------------------------
        // Test 11c: 8 vet x 2 px/dong (run=2 < RLE_BOX=3) -> KHONG phat
        // --------------------------------------------------------------
        $display("");
        $display("--- Test 11c: 8 vet x 2 px/dong (run=2 < RLE_BOX=3) -> KHONG phat ---");
        clear_blobs();
        dash_mode  = 1'b1;
        dash_width = 2;
        vsync_pulse(1);
        body(48, 40, C_WATER, C_ORANGE);
        arm();
        vsync_pulse(1);
        check_frame(0, 1, 0, 0, 0, 0, "test 11c: run=2 < RLE_BOX=3 -> valid=0");
        dash_mode  = 1'b0;
        dash_width = 4;

        // --------------------------------------------------------------
        // Test 11d: 8 vet x 3 px/dong (run=3 = RLE_BOX=3) -> PHAI phat
        // --------------------------------------------------------------
        $display("");
        $display("--- Test 11d: 8 vet x 3 px/dong (run=3 = RLE_BOX=3) -> PHAI phat ---");
        clear_blobs();
        dash_mode  = 1'b1;
        dash_width = 3;
        vsync_pulse(1);
        body(48, 40, C_WATER, C_ORANGE);
        arm();
        vsync_pulse(1);
        check_frame(1, 1, 22, 20, 45, 40, "test 11d: run=3 >= RLE_BOX -> phat");
        dash_mode  = 1'b0;
        dash_width = 4;

        // --------------------------------------------------------------
        // Test 12: bang mong 20x2 = 40 px, chi 2 dong
        //
        // REV 10: cnt = 40 >= MIN_PIXELS = 20 (qua), nhung rows = 2 < ROW_MIN = 3
        // VA aspect 20/2 = 10 > 4. Vi pham hai rang buoc hinh hoc.
        // --------------------------------------------------------------
        $display("");
        $display("--- Test 12: bang mong 20x2 (40 px, 2 dong) ---");
        clear_blobs();
        add_blob(50, 100, 20, 2);
        vsync_pulse(1);
        body(320, 240, C_WATER, C_ORANGE);
        arm();
        vsync_pulse(1);
        check_frame(0, 1, 0, 0, 0, 0, "test 12: mong 2 dong -> valid=0");

        // --------------------------------------------------------------
        // Test 13: thanh det 200x10 -> aspect 20 > 4
        // --------------------------------------------------------------
        $display("");
        $display("--- Test 13: thanh det 200x10 (aspect 20) ---");
        clear_blobs();
        add_blob(50, 100, 200, 10);
        vsync_pulse(1);
        body(320, 240, C_WATER, C_ORANGE);
        arm();
        vsync_pulse(1);
        check_frame(0, 1, 0, 0, 0, 0, "test 13: aspect 20 > 4 -> valid=0");

        // --------------------------------------------------------------
        // Test 14: vat cam TOI 25 % (63,32,0) — bao hoa va hue khong doi
        //   Day la kich ban rev 1 THAT BAI (r5 = 8 < R_MIN = 20).
        // --------------------------------------------------------------
        $display("");
        $display("--- Test 14: cam toi con 25 phan tram sang (63,32,0) ---");
        clear_blobs();
        add_blob(60, 60, 40, 40);
        vsync_pulse(1);
        body(320, 240, C_WATER, C_DARK25);
        arm();
        vsync_pulse(1);
        check_frame(1, 1, 80, 80, 40, 40, "test 14: cam toi 25% -> VAN phat");

        // --------------------------------------------------------------
        // Test 15: khoi mau DA NGUOI 80x80 — REV 11 DOI KY VONG: PHAI PHAT
        //
        // S = 0,67. Rev 10 chan bang `sat_ok` 0,75. Rev 11 ha xuong 0,50 nen
        // LOT. Day la doi trai LON NHAT cua rev 11 va la ly do nap cam duoi
        // AWB lech (S ~ 0,52) duoc nhan.
        // --------------------------------------------------------------
        $display("");
        $display("--- Test 15: da nguoi S=0,67 -> REV 18 CHAN (sat_ok >= 0,80) ---");
        clear_blobs();
        add_blob(100, 80, 80, 80);
        vsync_pulse(1);
        body(320, 240, C_WATER, C_SKIN);
        arm();
        vsync_pulse(1);
        check_frame(0, 1, 0, 0, 0, 0,
                    "test 15: da nguoi -> CHAN boi sat_ok 5B");

        // --------------------------------------------------------------
        // Test 16: cam 50 % sang (127,64,0)
        // --------------------------------------------------------------
        $display("");
        $display("--- Test 16: cam con 50 phan tram sang (127,64,0) ---");
        clear_blobs();
        add_blob(120, 120, 40, 40);
        vsync_pulse(1);
        body(320, 240, C_WATER, C_DARK50);
        arm();
        vsync_pulse(1);
        check_frame(1, 1, 140, 140, 40, 40, "test 16: cam 50% sang -> VAN phat");

        // --------------------------------------------------------------
        // Test 17: NAP HOP CAM NGHIENG ~42 do — ca ma rev 6 phai GIU DUOC
        //
        // Mau (255,150,40) -> R8/G8/B8 = 248/148/40, H = 31,2 do, S = 0,839.
        // Sau khi rev 6 siet sat_ok ve 0,80, mau nay van qua (5*40 = 200 <= 248).
        // Test khoa bat bien: siet nguong KHONG duoc lam mat vat that.
        // --------------------------------------------------------------
        $display("");
        $display("--- Test 17: nap hop cam nghieng 42 do (255,150,40) ---");
        clear_blobs();
        add_blob(120, 120, 40, 40);
        vsync_pulse(1);
        body(320, 240, C_WATER, C_ORANGE42);
        arm();
        vsync_pulse(1);
        check_frame(1, 1, 140, 140, 40, 40, "test 17: nap hop cam -> phat bbox");

        // --------------------------------------------------------------
        // Test 18: DA NGUOI TOI 2x2 = 4 px — ngon tay nho
        //
        // REV 11: MIN_PIXELS 20 -> 12 nen khoi phai nho hon 12 moi bi chan.
        // 4 px < 12 -> KHONG phat.
        // --------------------------------------------------------------
        $display("");
        $display("--- Test 18: da toi 2x2 (4 px) -> CHAN boi MIN_PIXELS=12 ---");
        clear_blobs();
        add_blob(100, 80, 2, 2);
        vsync_pulse(1);
        body(320, 240, C_WATER, C_SKIN_DARK);
        arm();
        vsync_pulse(1);
        check_frame(0, 1, 0, 0, 0, 0, "test 18: da toi 4 px -> CHAN (MIN=12)");

        // --------------------------------------------------------------
        // Test 19: BAN TAY DAY DU — DA NGAM 80x80 = 6400 px -> LOT
        //
        // DAY LA DOI TRAI DA GHI CUA REV 9, KHONG PHAI TEST DE KHEN.
        //
        // O nguong bao hoa 0,75, mau da ngam (S = 0,773) qua bo loc mau. Vung
        // da lon hon 20 px se phat bbox. Ban tay day du trong khung o 78 cm
        // chiem ~1200 px -> vuot xa nguong.
        // --------------------------------------------------------------
        $display("");
        $display("--- Test 19: ban tay da ngam 80x80 (6400 px) -> REV 21 (S>=0.75) PHAT ---");
        clear_blobs();
        add_blob(100, 80, 80, 80);
        vsync_pulse(1);
        body(320, 240, C_WATER, C_SKIN_TAN);
        arm();
        vsync_pulse(1);
        check_frame(1, 1, 140, 120, 80, 80,
                    "test 19: ban tay da ngam -> phat bbox (doi tra do nhay xa)");

        // --------------------------------------------------------------
        // Test 20: NAP HOP VANG CAM 42,7 do (248,188,40) -> PHAI PHAT
        //
        // R8/G8/B8 = 248/188/40, H = 42,7 do, S = 0,839.
        // Qua ca hue (45 do) lan sat (0,75). Day la ca rev 7/8 phai bat duoc.
        // --------------------------------------------------------------
        $display("");
        $display("--- Test 20: vang mat ong / den tran vang (248,188,40) -> CHAN boi not_glare ---");
        clear_blobs();
        add_blob(100, 100, 40, 40);
        vsync_pulse(1);
        body(320, 240, C_WATER, C_YELLOW_AMBER);
        arm();
        vsync_pulse(1);
        check_frame(0, 1, 0, 0, 0, 0,
                    "test 20: vang mat ong / den tran -> CHAN boi not_glare");

        // --------------------------------------------------------------
        // Test 21: BAN TAY DAY DU — DA TOI 80x80 = 6400 px -> LOT
        //
        // DAY LA DOI TRAI DA GHI CUA REV 8, KHONG PHAI TEST DE KHEN.
        //
        // O nguong bao hoa 0,75, mau da toi (S = 0,765) VA da ngam (S = 0,773)
        // deu qua bo loc mau. MIN_PIXELS = 50 chi chan duoc vung da NHO
        // (ngon tay ~15..50 px). Mot ban tay day du trong khung o 78 cm
        // chiem ~1200 px, vuot xa nguong 50 -> PHAI PHAT BBOX.
        //
        // Test khoa hanh vi nay de:
        //   - khong ai tuong rang rev 8 chan duoc da o MOI kich thuoc;
        //   - neu sau nay muon chan lai, phai quay ve sat_ok = 0,80 va chap
        //     nhan nap cam chap chon (xem FPGA_BUILD_RECORD §1.0).
        // --------------------------------------------------------------
        $display("");
        $display("--- Test 21: ban tay day du da toi 80x80 (6400 px) -> REV 21 (S>=0.75) PHAT ---");
        clear_blobs();
        add_blob(100, 80, 80, 80);
        vsync_pulse(1);
        body(320, 240, C_WATER, C_SKIN_DARK);
        arm();
        vsync_pulse(1);
        check_frame(1, 1, 140, 120, 80, 80,
                    "test 21: ban tay da toi -> phat bbox (doi tra do nhay xa)");

        // --------------------------------------------------------------
        // Test 22: NAP CAM DUOI AWB LECH S=0,538 (208,120,96) -> REV 13: PHAI PHAT
        // --------------------------------------------------------------
        $display("");
        $display("--- Test 22: den roi / mau nhat S=0,538 -> REV 18 CHAN (sat_ok >= 0,80) ---");
        clear_blobs();
        add_blob(100, 100, 40, 40);
        vsync_pulse(1);
        body(320, 240, C_WATER, C_ORANGE_AWB);
        arm();
        vsync_pulse(1);
        check_frame(0, 1, 0, 0, 0, 0,
                    "test 22: den roi tren nen trang S=0.538 -> CHAN boi sat_ok 5B");

        // --------------------------------------------------------------
        // Test 22b: NAP CAM THUC TE TRONG NHA S=0,692 -> PHAI PHAT
        // --------------------------------------------------------------
        $display("");
        $display("--- Test 22b: nap cam thuc te trong nha S=0,692 -> PHAI PHAT ---");
        clear_blobs();
        add_blob(100, 100, 40, 40);
        vsync_pulse(1);
        body(320, 240, C_WATER, C_ORANGE_LID);
        arm();
        vsync_pulse(1);
        check_frame(1, 1, 120, 120, 40, 40,
                    "test 22b: nap cam thuc te -> PHAT");

        // --------------------------------------------------------------
        // Test 23: NEN XANH DO DUOC TREN BO (118/138/148) -> KHONG duoc phat
        //
        // Khoa rui ro cua rev 11: noi mau den muc nhan ca khung. B > G > R nen
        // `ord_ok` = 0 -> bo loc phai tu choi du da noi hue/sat.
        // --------------------------------------------------------------
        $display("");
        $display("--- Test 23: nen xanh B>G>R (do duoc tren bo) -> KHONG phat ---");
        clear_blobs();
        add_blob(0, 0, 320, 240);
        vsync_pulse(1);
        body(320, 240, C_BLUISH, C_BLUISH);
        arm();
        vsync_pulse(1);
        check_frame(0, 1, 0, 0, 0, 0,
                    "test 23: nen B>G>R -> valid=0");

        // --------------------------------------------------------------
        // Test 24: BONG DEN / VET LOA CHAY SANG (R8>=232, G8>=148) -> CHAN
        // --------------------------------------------------------------
        $display("");
        $display("--- Test 24: bong den / vet loa chay sang -> CHAN boi not_glare ---");
        clear_blobs();
        add_blob(100, 100, 40, 40);
        vsync_pulse(1);
        body(320, 240, C_WATER, C_GLARE);
        arm();
        vsync_pulse(1);
        check_frame(0, 1, 0, 0, 0, 0,
                    "test 24: bong den chay sang -> valid=0");

        // --------------------------------------------------------------
        // Test 25: MAU DEN / TOI (24,16,0) -> REV 22 TRIET TIEU (LUM_MIN=40)
        // --------------------------------------------------------------
        $display("");
        $display("--- Test 25: mau den / toi (24,16,0) -> REV 22 CHAN boi LUM_MIN=40 ---");
        clear_blobs();
        add_blob(50, 50, 100, 80);
        vsync_pulse(1);
        body(320, 240, C_BLACK, C_BLACK);
        arm();
        vsync_pulse(1);
        check_frame(0, 1, 0, 0, 0, 0,
                    "test 25: mau den -> valid=0 (LUM_MIN=40)");

        // --------------------------------------------------------------
        // Test 26: CAM CU LY GAN DAC (260x160 = 41600 px > 8000) -> CLAMP 240 PHAT
        // --------------------------------------------------------------
        $display("");
        $display("--- Test 26: cam cu ly gan dac (260x160 px, cnt > 8000) -> REV 22 CLAMP 240 VA PHAT ---");
        clear_blobs();
        add_blob(20, 20, 260, 160);
        vsync_pulse(1);
        body(320, 240, C_WATER, C_ORANGE);
        arm();
        vsync_pulse(1);
        check_frame(1, 1, 150, 100, 240, 160,
                    "test 26: cam cu ly gan dac -> CLAMP 240 va PHAT");

        // --------------------------------------------------------------
        // Test 27: VET NANG MAT TROI ROI SAN GO / GACH MEN (H = 40.4 do) -> REV 26 CHAN
        // --------------------------------------------------------------
        $display("");
        $display("--- Test 27: vet nang mat troi san go (H=40.4 do, S=0.885) -> REV 26 CHAN boi H<=39.0 do ---");
        clear_blobs();
        add_blob(80, 80, 80, 60);
        vsync_pulse(1);
        body(320, 240, C_WATER, C_SUNLIGHT_WOOD);
        arm();
        vsync_pulse(1);
        check_frame(0, 1, 0, 0, 0, 0,
                    "test 27: vet nang mat troi tren san go -> valid=0");

        $display("");
        $display("=== SUMMARY: PASS=%0d FAIL=%0d ===", pass_cnt, fail_cnt);
        if (fail_cnt != 0) $fatal(1, "tb_kvc_blob_detect FAILED");
        $display("PASS: tb_kvc_blob_detect completed");
        $finish;
    end

    initial begin
        #(400_000_000);
        $display("WATCHDOG timeout");
        $fatal(1, "tb_kvc_blob_detect timeout");
    end

endmodule
