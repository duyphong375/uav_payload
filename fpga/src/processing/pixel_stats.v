// -----------------------------------------------------------------------------
// Module: pixel_stats.v
// Author: KVC Team (Kilo)
// Date:   2026-11-04 (rev 4 — sua tran 8 bit hue/tone + bao dai cot/dong)
// Desc:   Thong ke gia tri RGB565 tren MOT frame de do mau that (muc 6.1.9).
//
// TAI SAO CAN MODULE NAY
//   Muc G6.1.9 yeu cau: "Chup vat do thuan, R > nguong, G/B < nguong". Day la
//   phep do GIA TRI MAU, khac han phep do blob (6.1.10). Blob chi tra loi "co
//   pixel khop nguong hay khong", KHONG tra loi "mau that la gi".
//
// ANH XA 12 SLOT (rev 4, 2026-11-04)
//   slot  X                  Y                  Y nghia
//   ----  -----------------  -----------------  --------------------------------
//     0   pix_count[15:0]     pix_count[18:16]   tong so pixel hop le
//     1   sum_r[15:0]         sum_r[24:16]       tong R5 (5 bit) tren frame
//     2   sum_g[15:0]         sum_g[24:16]       tong G6 (6 bit) tren frame
//     3   sum_b[15:0]         sum_b[24:16]       tong B5 (5 bit) tren frame
//     4   cnt_match[15:0]     cnt_match[18:16]   so pixel vao cnt cua blob
//     5   max_px              max_py             cot/dong lon nhat da nhan (frame bi cat?)
//     6   cnt_ord_ok[15:0]    (cnt_ord_ok[18:16]) R>G>B
//     7   cnt_hue_ok[15:0]    (cnt_hue_ok[18:16]) 6n>=d VA 3n<=2d
//     8   cnt_sat_ok[15:0]    (cnt_sat_ok[18:16]) 5B<=R
//     9   cnt_tone_ok[15:0]   (cnt_tone_ok[18:16]) R>=LUM_MIN VA R-B>=CHROMA_MIN
//    10   PIXSTAT_REV (4)    0                  dau hieu nhan dien rev 4
//    11   max_r5             0                  R5 lon nhat trong frame
//
//   `W` cua moi slot = chi so slot (0..11), de nguoi doc xac nhan thu tu.
//
// VÌ SAO rev 4
//   Rev 3 co hai loi chan doan lam so lieu KHONG dung de hieu chuan nguong:
//     1. `d`/`n` khai bao 8 bit nen TRAN khi R8 < B8 hoac G8 < B8. `hue_ok` va
//        `tone_ok` dung thang `d11`/`n11` ma khong co `ord_ok` chan, nen mot
//        pixel XANH/TRANG van "dat hue" hoac "dat do sang". Do la ly do
//        `cnt_hue_ok` (22..25 %) va `cnt_tone_ok` (39..68 %) vo nghia.
//        Rev 4 tinh hieu 9 bit, kep ve 0 khi am, va chan ca hai dieu kien bang
//        `~d_neg & ~n_neg`. `cnt_match` KHONG doi (ord_ok da bao dam d,n > 0),
//        nen bo loc blob van duoc do dung tung bit.
//     2. `center_pixel` doc tai (320,240) — frame bi cat o 46..187 dong nen
//        khong bao gio toi py = 240, gia tri in ra la cua frame truoc (stale).
//        Rev 4 thay bang `max_px`/`max_py`, tuc dai cot/dong THUC SU nhan duoc.
//
//   `max_r5` chuyen tu slot 5 sang slot 11 de nhuong slot 5 cho max_px/max_py.
//
// VÌ SAO rev 3
//   Rev 1 dat nguong "do dam" CHAT HON nguong blob (R>=26, G<=12, B<=8) nen
//   `red_count` khong so sanh duoc voi `cnt` cua blob.
//   Rev 2 dung dung nguong blob CU (R>=20, G 10..44, B<=12) — nhung nguong do
//   da bi thay bang bo loc TY LE o rev 2 cua `kvc_blob_detect`, nen rev 2 khong
//   con do duoc cai gi co y nghia.
//   Rev 3 copy DUNG tung dieu kien cua `kvc_blob_detect.v` §1, ke ca buoc
//   run-length >= RLE_MIN, nen `cnt_match` == `cnt` cua blob tren cung frame.
//
//   Slot 6..9 tach tung dieu kien de biet DIEU KIEN NAO loai nhieu pixel nhat:
//      ord_ok  : R > G > B                     (mau phai "nong" va do nhat)
//      hue_ok  : 6n >= d va 3n <= 2d           (dai hue ~10..40 do)
//      sat_ok  : 5B <= R                       (bao hoa >= 0,80)
//      tone_ok : R >= 32 va R-B >= 24          (khong toi, du chroma)
//   Bat bien: cnt_match <= min(ord, hue, sat, tone) luon dung.
//
// TU TINH TRUNG BINH
//   Khong chia trong RTL (divider ton DSP va lam giam Fmax). Tool decode o
//   `scripts/manual/decode_pixel_diag.py` tinh mean_R5/G6/B5 va quy ve 8 bit.
//
// GIOI HAN
//   Day la build CHAN DOAN (DIAG_MODE = 3), khong nam trong bitstream release.
//   No ton them LUT/FF nhung khong anh huong duong blob that.
// -----------------------------------------------------------------------------
`timescale 1ns/1ps

module pixel_stats #(
    // Gia tri MAC DINH khop `kvc_blob_detect.v`. Neu sua mot ben, sua ca hai.
    // REV 6 (04/11/2026): dong bo voi blob rev 11 — cung nguong mau va cung
    // RLE_MIN = 5, de `cnt_match` van so sanh duoc truc tiep voi `cnt` cua blob.
    parameter integer LUM_MIN     = 24,
    parameter integer CHROMA_MIN  = 16,
    parameter integer RLE_MIN     = 5,
    parameter integer PIXSTAT_REV = 6,
    parameter integer N_SLOT      = 12
)(
    // ---- cam_pclk domain ----
    input  wire        pclk,
    input  wire        prst_n,

    input  wire [15:0] pixel,
    input  wire        pixel_valid,
    input  wire        href,
    input  wire        vsync,
    input  wire        frame_valid,

    // ---- clk_100m domain ----
    input  wire        clk,
    input  wire        rst_n,

    output reg  [15:0] st_x,
    output reg  [15:0] st_y,
    output reg  [7:0]  st_w,
    output reg  [7:0]  st_h,
    output reg  [7:0]  st_conf,
    output reg  [7:0]  st_class,
    output reg         st_valid,
    output reg         st_last
);

    localparam [7:0] CLASS_LIFEBUOY = 8'd2;
    localparam [7:0] CONF_FIXED     = 8'd100;
    // Cat tham so ve dung do rong (GowinSynthesis khong thich bit-select tren
    // integer parameter).
    localparam [15:0] PIXSTAT_REV_C = PIXSTAT_REV;

    // Tach kenh. RGB565: { R[4:0], G[5:0], B[4:0] }
    wire [4:0] r5 = pixel[15:11];
    wire [5:0] g6 = pixel[10:5];
    wire [4:0] b5 = pixel[4:0];

    // -------------------------------------------------------------------------
    // 1. Dem toa do + xac dinh frame dang hoat dong
    //
    // `frame_valid` cua camera_rx chi cao trong luc VSYNC cao (duty < 2 %), nen
    // phai CHOT no tai canh xuong VSYNC thanh `frame_active` giu nguyen ca
    // frame. Cung ly do va cung cach voi `kvc_blob_detect.v` §2.
    // -------------------------------------------------------------------------
    reg [9:0] px;
    reg [9:0] py;
    reg       prev_href;
    reg       prev_vsync;
    reg       frame_active;

    wire href_falling  = prev_href  & ~href;
    wire vsync_rising  = ~prev_vsync & vsync;
    wire vsync_falling = prev_vsync  & ~vsync;

    // -------------------------------------------------------------------------
    // 1b. DO CHU KY VSYNC (rev 5) — tra loi F-10
    //
    // CAU HOI: 38/42 khung chi co 100 hoac 200 tren 300 dong. Nguyen nhan la
    //   (A) sensor TU CAT frame (chi phat 100/200 dong),
    //   (B) VSYNC gai chia frame lam 2, hoac
    //   (C) FPGA/camera_rx LAM ROT pixel (sensor phat du dong, FPGA dem thieu)?
    //
    // CACH DO — khong dung dong ho, nen khong phu thuoc PCLK:
    //   `href_per_vs` dem so xung HREF trong MOT chu ky VSYNC. Day chinh la so
    //   dong ma SENSOR noi rang no da phat. So sanh voi so dong CO PIXEL
    //   (pix_count / 400) phan biet duoc (A) va (C):
    //
    //     href_per_vs ~ 300, pix_count/400 ~ 200  -> (C) FPGA lam rot pixel
    //     href_per_vs ~ 200, pix_count/400 ~ 200  -> (A) sensor tu cat frame
    //     href_per_vs nho bat thuong, vsync_per_rep >= 2 -> (B) gai VSYNC
    //
    // VI SAO KHONG DEM BANG CHU KY PCLK: PCLK la dau ra cua OV2640 (chia tu
    // XCLK), chua do chinh xac. Dem theo HREF la dai luong cung nguon voi so
    // dong dang tranh cai, nen so sanh truc tiep duoc.
    // -------------------------------------------------------------------------
    reg [9:0] href_per_vs;   // so HREF trong khung hien tai (bao hoa)
    reg [5:0] vsync_per_rep; // so VSYNC trong khoang bao cao (bao hoa 6 bit)
    reg       frame_seen;    // 1 = khung hien tai da co pixel

    // Xung 1 chu ky khi latch bao cao vua chot mot khung CO pixel: do la moc
    // "mot bao cao da duoc phat", dung de reset bo dem VSYNC/bao cao.
    wire rep_taken = vsync_rising && frame_seen;

    // REV 5b — SUA OFF-BY-ONE CUA REV 5.
    //
    // Rev 5 reset bo dem ve 0 tai moi canh VSYNC co bao cao, va khong cong o
    // canh do. Nhung sau khung dau tien, MOI canh VSYNC deu la canh bao cao
    // (frame_seen luon = 1), nen bo dem khong bao gio duoc cong -> ket qua la
    // 0 tren 64/64 khung tren bo. Con so 0 do TRONG NHU bang chung loai tru
    // gai VSYNC, nhung thuc chat la loi dem.
    //
    // Nay: tai canh bao cao, bo dem nhan 1 (khoang bao cao chua dung mot xung);
    // tai canh KHONG bao cao (gai giua khung, frame_seen = 0) thi cong them.
    // Nho vay:
    //   bao cao binh thuong -> 1
    //   co gai VSYNC giua khung -> >= 2 (gai cong 1, roi canh bao cao nhan 1)
    always @(posedge pclk or negedge prst_n) begin
        if (!prst_n) begin
            href_per_vs   <= 10'd0;
            vsync_per_rep <= 6'd0;
        end else begin
            if (vsync_rising) begin
                if (rep_taken) begin
                    vsync_per_rep <= 6'd1;
                end else if (vsync_per_rep != 6'h3F) begin
                    vsync_per_rep <= vsync_per_rep + 6'd1;
                end
            end

            // Tai canh len VSYNC, href_per_vs dang giu so HREF cua khung VUA
            // KET THUC — dung khung ma cac thong ke ben duoi dang mo ta. Khong
            // dua qua mot thanh ghi trung gian: se tre mot khung.
            if (vsync_rising) begin
                href_per_vs <= 10'd0;
            end else if (href_falling) begin
                if (href_per_vs != 10'h3FF) begin
                    href_per_vs <= href_per_vs + 10'd1;
                end
            end
        end
    end

    always @(posedge pclk or negedge prst_n) begin
        if (!prst_n) begin
            px           <= 10'd0;
            py           <= 10'd0;
            prev_href    <= 1'b0;
            prev_vsync   <= 1'b0;
            frame_active <= 1'b0;
        end else begin
            prev_href  <= href;
            prev_vsync <= vsync;

            if (vsync_rising) begin
                px           <= 10'd0;
                py           <= 10'd0;
                frame_active <= 1'b0;
            end else begin
                if (vsync_falling) frame_active <= frame_valid;
                if (pixel_valid)   px <= px + 10'd1;
                if (href_falling) begin
                    px <= 10'd0;
                    py <= py + 10'd1;
                end
            end
        end
    end

    // -------------------------------------------------------------------------
    // 2. Dieu kien khop — KHOP CHINH XAC `kvc_blob_detect.v` §1
    //
    // Moi phep cong khai bao du rong (11 bit), khong dua vao tu cat cua
    // Verilog. Neu sua blob thi sua ca day.
    // -------------------------------------------------------------------------
    wire [7:0]  R8 = {r5, 3'b000};
    wire [7:0]  G8 = {g6, 2'b00};
    wire [7:0]  B8 = {b5, 3'b000};

    wire ord_ok = (R8 >= G8) && (G8 > B8);

    // Hieu R8-B8 va G8-B8 la so CO DAU. Khai bao 8 bit nhu rev 3 lam TRAN khi
    // R8 < B8 / G8 < B8, bien pixel xanh/tim thanh "hue cam" hoac "du sang".
    // O day: co `*_neg` de biet dau, gia tri am bi kep ve 0.
    wire d_neg = (R8 < B8);
    wire n_neg = (G8 < B8);

    wire [10:0] r11 = {3'b000, R8};
    wire [10:0] b11 = {3'b000, B8};
    wire [10:0] g11 = {3'b000, G8};

    wire [10:0] d11 = d_neg ? 11'd0 : (r11 - b11);
    wire [10:0] n11 = n_neg ? 11'd0 : (g11 - b11);

    wire [10:0] n6  = (n11 << 2) + (n11 << 1);
    wire [10:0] b2v = (b11 << 1);

    localparam [10:0] LUM_MIN_C    = LUM_MIN;
    localparam [10:0] CHROMA_MIN_C = CHROMA_MIN;

    // `~d_neg & ~n_neg` khong thua: `match` da co `ord_ok` chan, nhung slot 7/9
    // duoc doc RIENG de ket luan "dieu kien nao loai pixel", nen chung phai tu
    // dung nghia khi khong co ord_ok.
    // REV 6: dong bo nguong voi blob rev 11 — hue <= 60 do, bao hoa >= 0,50.
    wire hue_ok  = ~d_neg && ~n_neg && (d11 != 11'd0) && (n6 >= d11) && (n11 <= d11);
    wire sat_ok  = (b2v <= r11);
    wire tone_ok = ~d_neg && (r11 >= LUM_MIN_C) && (d11 >= CHROMA_MIN_C);

    wire match = ord_ok && hue_ok && sat_ok && tone_ok;

    // -------------------------------------------------------------------------
    // 3. Run-length: `cnt_match` phai dem DUNG so pixel ma blob dem.
    //    Blob chi cong pixel thuoc run >= RLE_MIN (tinh ca 3 pixel dau run).
    // -------------------------------------------------------------------------
    localparam [9:0] RLE_MIN_C = RLE_MIN;
    // Cong RLE_MIN chu khong phai hang so 3: neu doi RLE_MIN ma giu 3 thi
    // `cnt_match` se lech so voi `cnt` cua blob (loi da tung co o blob).
    localparam [18:0] RLE_MIN_C19 = RLE_MIN;
    localparam [9:0] COORD_MAX = 10'h3FF;

    reg [9:0] run_len;
    reg [9:0] run_start;

    wire acc_en = pixel_valid && frame_active;

    wire run3  = acc_en && match && (run_len == RLE_MIN_C - 10'd1);
    wire run3p = acc_en && match && (run_len >= RLE_MIN_C);

    // -------------------------------------------------------------------------
    // 4. Tich luy thong ke trong mot frame
    //
    // Do rong:
    //   pix_count : 640*480 = 307.200 < 2^19
    //   sum_r/sum_b: 307.200 * 31 = 9.523.200 < 2^24
    //   sum_g     : 307.200 * 63 = 19.353.600 < 2^25
    // -------------------------------------------------------------------------
    reg [18:0] pix_count;
    reg [24:0] sum_r;
    reg [24:0] sum_g;
    reg [24:0] sum_b;
    reg [18:0] cnt_match;
    reg [18:0] cnt_ord_ok;
    reg [18:0] cnt_hue_ok;
    reg [18:0] cnt_sat_ok;
    reg [18:0] cnt_tone_ok;
    reg [4:0]  max_r5;
    // Toa do lon nhat THUC SU nhan duoc trong frame (0-based). Dung de phat
    // hien frame bi cat: VGA day du phai co max_px=639, max_py=479.
    reg [9:0]  max_px;
    reg [9:0]  max_py;

    always @(posedge pclk or negedge prst_n) begin
        if (!prst_n) begin
            pix_count    <= 19'd0;
            sum_r        <= 25'd0;
            sum_g        <= 25'd0;
            sum_b        <= 25'd0;
            cnt_match    <= 19'd0;
            cnt_ord_ok   <= 19'd0;
            cnt_hue_ok   <= 19'd0;
            cnt_sat_ok   <= 19'd0;
            cnt_tone_ok  <= 19'd0;
            max_r5       <= 5'd0;
            max_px       <= 10'd0;
            max_py       <= 10'd0;
            frame_seen   <= 1'b0;
            run_len      <= 10'd0;
            run_start    <= 10'd0;
        end else if (vsync_rising) begin
            pix_count   <= 19'd0;
            sum_r       <= 25'd0;
            sum_g       <= 25'd0;
            sum_b       <= 25'd0;
            cnt_match   <= 19'd0;
            cnt_ord_ok  <= 19'd0;
            cnt_hue_ok  <= 19'd0;
            cnt_sat_ok  <= 19'd0;
            cnt_tone_ok <= 19'd0;
            max_r5      <= 5'd0;
            max_px      <= 10'd0;
            max_py      <= 10'd0;
            frame_seen  <= 1'b0;
            run_len     <= 10'd0;
            run_start   <= 10'd0;
        end else begin
            if (acc_en) begin
                frame_seen <= 1'b1;
                pix_count  <= pix_count + 19'd1;
                sum_r      <= sum_r + {20'd0, r5};
                sum_g      <= sum_g + {19'd0, g6};
                sum_b      <= sum_b + {20'd0, b5};
                if (ord_ok)  cnt_ord_ok  <= cnt_ord_ok  + 19'd1;
                if (hue_ok)  cnt_hue_ok  <= cnt_hue_ok  + 19'd1;
                if (sat_ok)  cnt_sat_ok  <= cnt_sat_ok  + 19'd1;
                if (tone_ok) cnt_tone_ok <= cnt_tone_ok + 19'd1;
                if (r5 > max_r5) max_r5 <= r5;
                if (px > max_px) max_px <= px;
                if (py > max_py) max_py <= py;

                if (match) begin
                    if (run_len == 10'd0) run_start <= px;
                    if (run_len != COORD_MAX) run_len <= run_len + 10'd1;
                end else begin
                    run_len <= 10'd0;
                end
            end
            if (href_falling) run_len <= 10'd0;

            // Cung quy tac voi blob: pixel thu RLE_MIN cong RLE_MIN (ca run),
            // sau do moi pixel +1.
            if (run3)        cnt_match <= cnt_match + RLE_MIN_C19;
            else if (run3p)  cnt_match <= cnt_match + 19'd1;
        end
    end

    // -------------------------------------------------------------------------
    // 5. Chot ket qua tai canh len VSYNC (domain cam_pclk)
    //
    // Toggle chi dao khi frame da thuc su co pixel -> camera chet khong phat
    // bao cao rac. Giong `kvc_blob_detect.v` §6.
    // -------------------------------------------------------------------------
    reg [18:0] l_pix;
    reg [24:0] l_sr, l_sg, l_sb;
    reg [18:0] l_match, l_ord, l_hue, l_sat, l_tone;
    reg [4:0]  l_maxr;
    reg [9:0]  l_maxpx, l_maxpy;
    reg [5:0]  l_vsper;
    reg [9:0]  l_href;
    reg        tgl;

    wire [15:0] pix_lo  = l_pix[15:0];
    wire [15:0] pix_hi  = {13'd0, l_pix[18:16]};
    wire [15:0] sr_lo   = l_sr[15:0];
    wire [15:0] sr_hi   = {7'd0, l_sr[24:16]};
    wire [15:0] sg_lo   = l_sg[15:0];
    wire [15:0] sg_hi   = {7'd0, l_sg[24:16]};
    wire [15:0] sb_lo   = l_sb[15:0];
    wire [15:0] sb_hi   = {7'd0, l_sb[24:16]};
    wire [15:0] mt_lo   = l_match[15:0];
    wire [15:0] mt_hi   = {13'd0, l_match[18:16]};
    wire [15:0] ord_lo  = l_ord[15:0];
    wire [15:0] ord_hi  = {13'd0, l_ord[18:16]};
    wire [15:0] hue_lo  = l_hue[15:0];
    wire [15:0] hue_hi  = {13'd0, l_hue[18:16]};
    wire [15:0] sat_lo  = l_sat[15:0];
    wire [15:0] sat_hi  = {13'd0, l_sat[18:16]};
    wire [15:0] tone_lo = l_tone[15:0];
    wire [15:0] tone_hi = {13'd0, l_tone[18:16]};
    // Slot 5 X: 6 bit cao = so VSYNC ke tu bao cao truoc, 10 bit thap = max_px.
    wire [15:0] mpx_16  = {l_vsper, l_maxpx};
    wire [15:0] mpy_16  = {6'd0, l_maxpy};
    wire [15:0] maxr_16 = {11'd0, l_maxr};
    // Slot 11: X = so HREF trong chu ky VSYNC vua roi (sensor noi da phat bao
    // nhieu dong), Y = max_r5 (chuyen tu slot 5 de nhuong chan cho mpx_16).
    wire [15:0] href_16 = {6'd0, l_href};

    always @(posedge pclk or negedge prst_n) begin
        if (!prst_n) begin
            l_pix    <= 19'd0;
            l_sr     <= 25'd0;
            l_sg     <= 25'd0;
            l_sb     <= 25'd0;
            l_match  <= 19'd0;
            l_ord    <= 19'd0;
            l_hue    <= 19'd0;
            l_sat    <= 19'd0;
            l_tone   <= 19'd0;
            l_maxr   <= 5'd0;
            l_maxpx  <= 10'd0;
            l_maxpy  <= 10'd0;
            l_vsper  <= 6'd0;
            l_href   <= 10'd0;
            tgl      <= 1'b0;
        end else if (vsync_rising) begin
            l_pix    <= pix_count;
            l_sr     <= sum_r;
            l_sg     <= sum_g;
            l_sb     <= sum_b;
            l_match  <= cnt_match;
            l_ord    <= cnt_ord_ok;
            l_hue    <= cnt_hue_ok;
            l_sat    <= cnt_sat_ok;
            l_tone   <= cnt_tone_ok;
            l_maxr   <= max_r5;
            l_maxpx  <= max_px;
            l_maxpy  <= max_py;
            l_vsper  <= vsync_per_rep;
            l_href   <= href_per_vs;
            if (frame_seen) tgl <= ~tgl;
        end
    end

    // -------------------------------------------------------------------------
    // 6. CDC sang clk_100m bang 1 bit toggle + 3FF sync + edge detect
    // -------------------------------------------------------------------------
    reg [2:0] tgl_sync;

    always @(posedge clk or negedge rst_n) begin
        if (!rst_n) tgl_sync <= 3'b000;
        else        tgl_sync <= {tgl_sync[1:0], tgl};
    end

    wire tgl_edge = tgl_sync[1] ^ tgl_sync[2];

    // -------------------------------------------------------------------------
    // 7. Chon gia tri cho tung slot
    // -------------------------------------------------------------------------
    reg [3:0]  idx;
    reg        active;
    reg        last_pending;
    reg [15:0] sel_x, sel_y;

    always @(*) begin
        case (idx)
            4'd0:  begin sel_x = pix_lo;   sel_y = pix_hi;   end
            4'd1:  begin sel_x = sr_lo;    sel_y = sr_hi;    end
            4'd2:  begin sel_x = sg_lo;    sel_y = sg_hi;    end
            4'd3:  begin sel_x = sb_lo;    sel_y = sb_hi;    end
            4'd4:  begin sel_x = mt_lo;   sel_y = mt_hi;   end
            4'd5:  begin sel_x = mpx_16;  sel_y = mpy_16;  end
            4'd6:  begin sel_x = ord_lo;   sel_y = ord_hi;   end
            4'd7:  begin sel_x = hue_lo;   sel_y = hue_hi;   end
            4'd8:  begin sel_x = sat_lo;   sel_y = sat_hi;   end
            4'd9:  begin sel_x = tone_lo;  sel_y = tone_hi;  end
            // Slot 10 = dau hieu revision. Rev 1/2 de 0; rev 3..5 ghi PIXSTAT_REV.
            4'd10: begin sel_x = PIXSTAT_REV_C; sel_y = 16'd0; end
            // Slot 11: rev 4 mang max_r5; rev 5 mang href_per_vs, max_r5 -> mpy_16.
            4'd11: begin sel_x = href_16; sel_y = maxr_16; end
            default: begin sel_x = 16'd0;  sel_y = 16'd0;    end
        endcase
    end

    // -------------------------------------------------------------------------
    // 8. Phat bao cao qua khung IF-01 (dung chung bbox_packetizer)
    //
    // `st_last` phai di SAU `st_valid` cuoi cung DUNG 1 chu ky: packetizer cap
    // nhat `mem_wr_count` bang non-blocking o chinh chu ky co `st_valid`, nen
    // `start` lay gia tri CU neu den cung chu ky -> send_count = 0 -> mat khung.
    // Da ghi chi tiet trong `kvc_blob_detect.v` §8.
    // -------------------------------------------------------------------------
    always @(posedge clk or negedge rst_n) begin
        if (!rst_n) begin
            st_x         <= 16'd0;
            st_y         <= 16'd0;
            st_w         <= 8'd0;
            st_h         <= 8'd0;
            st_conf      <= CONF_FIXED;
            st_class     <= CLASS_LIFEBUOY;
            st_valid     <= 1'b0;
            st_last      <= 1'b0;
            idx          <= 4'd0;
            active       <= 1'b0;
            last_pending <= 1'b0;
        end else begin
            st_valid <= 1'b0;
            st_last  <= 1'b0;

            if (tgl_edge) begin
                idx      <= 4'd0;
                active   <= 1'b1;
            end else if (active && idx < N_SLOT[3:0]) begin
                st_x     <= sel_x;
                st_y     <= sel_y;
                st_w     <= {4'd0, idx};   // W = chi so slot
                st_h     <= 8'd0;
                st_conf  <= CONF_FIXED;
                st_class <= CLASS_LIFEBUOY;
                st_valid <= 1'b1;
                idx      <= idx + 4'd1;
                if (idx == N_SLOT[3:0] - 4'd1) begin
                    active       <= 1'b0;
                    last_pending <= 1'b1;
                end
            end else if (last_pending) begin
                st_last      <= 1'b1;
                last_pending <= 1'b0;
            end else begin
                active <= 1'b0;
            end
        end
    end

endmodule
