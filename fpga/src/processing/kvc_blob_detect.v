// -----------------------------------------------------------------------------
// Module : kvc_blob_detect.v
// Revision: REV 26 - GOLDEN SUNLIGHT IMMUNITY & ORANGE RESCUE TARGET
// Date    : 2026-11-05
//
// Chuc nang:
//   - Nhan dien pixel thuoc dai mau cam tu pixel RGB565 cua OV2640.
//   - Tich luy dien tich pixel va toa do blob trong domain cam_pclk.
//   - Tao toi da MOT bounding box cho moi frame.
//   - Frame khong co blob van phat bbox_last de packetizer gui frame N=0.
//   - CDC sang clk_100m bang toggle + 3FF synchronizer.
//
// REV 26 - TRIET TIEU HOAN TOAN HIEN TUONG BAT NHAM ANH NANG MAT TROI:
//   1. Khép Hue chuẩn dải màu cam cứu nạn: 10 <= Hue <= 39.0 độ (20*n <= 13*d).
//      - Màu cam cứu hộ (áo phao, phao tròn, giấy cam, nắp cam) có Hue = 18..33 độ.
//      - Vệt nắng mặt trời rọi sàn gỗ, gạch men vàng kem, tường ấm (Hue = 41..44 độ)
//        bị CHẶN ĐỨNG 100%.
//   2. Chống lóa sáng / cháy trắng trên bề mặt bóng:
//        not_glare = ~((r5 == 31) && (g6 >= 40))
//      Triệt tiêu điểm nắng chói chang trên nền gạch men bóng.
//   3. Saturation: S >= 75% (4*B <= R).
//      Bắt nhạy cả vật thể cự ly gần (15cm) và cự ly xa (1.5m - 2m).
//   4. LUM_MIN = 32; CHROMA_MIN = 20; MIN_PIXELS = 24.
//      Loại bỏ hoàn toàn đốm nắng li ti / hạt nhiễu sàn nhà.
//   5. Giữ nguyên bộ lọc hình học, chống quầng sáng phòng (>240 px) và CDC.
// -----------------------------------------------------------------------------
`timescale 1ns/1ps

module kvc_blob_detect #(
    // ---- bo loc mau cam REV 26 ----
    parameter integer LUM_MIN    = 32,
    parameter integer CHROMA_MIN = 20,

    // ---- bo loc hinh hoc ----
    parameter integer RLE_MIN    = 2,
    parameter integer RLE_BOX    = 3,
    parameter integer ROW_MIN    = 2,
    parameter integer ASPECT_MAX = 4,
    parameter integer MIN_PIXELS = 24,
    parameter integer CONF_SHIFT = 4,
    parameter integer MAX_SPAN   = 240
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
    output reg         bbox_valid,
    output reg         bbox_last,
    output reg  [15:0] bbox_x,
    output reg  [15:0] bbox_y,
    output reg  [7:0]  bbox_w,
    output reg  [7:0]  bbox_h,
    output reg  [7:0]  bbox_conf,
    output reg  [7:0]  bbox_class
);

    // IF-02: class 2 = lifebuoy.
    localparam [7:0] CLASS_LIFEBUOY = 8'd2;

    // =========================================================================
    // 1. BO LOC MAU CAM - REV 23
    // =========================================================================

    // RGB565 -> RGB8 mo rong bang cach them cac bit 0 o ben phai.
    wire [4:0] r5 = pixel[15:11];
    wire [5:0] g6 = pixel[10:5];
    wire [4:0] b5 = pixel[4:0];

    wire [7:0] R8 = {r5, 3'b000};
    wire [7:0] G8 = {g6, 2'b00};
    wire [7:0] B8 = {b5, 3'b000};

    // Dieu kien thu tu kenh mau: R > G > B.
    wire ord_ok = (R8 > G8) && (G8 > B8);

    // Hue trong sector R > G > B:
    // H = 60 * (G-B)/(R-B).
    wire [7:0] d = R8 - B8;
    wire [7:0] n = G8 - B8;

    // Mo rong do rong phep toan de tranh tran bit.
    wire [10:0] n11 = {3'b000, n};
    wire [10:0] d11 = {3'b000, d};
    wire [10:0] r11 = {3'b000, R8};
    wire [10:0] b11 = {3'b000, B8};

    // 6*n = 4*n + 2*n (cho nguong H >= 10 do: 6*n >= d).
    wire [10:0] n6 = (n11 << 2) + (n11 << 1);

    // 20*n = 16*n + 4*n.
    wire [12:0] n20 = ({2'b00, n11} << 4) + ({2'b00, n11} << 2);

    // 13*d = 8*d + 4*d + d.
    wire [12:0] d13 = ({2'b00, d11} << 3) + ({2'b00, d11} << 2) + {2'b00, d11};

    // 4*B.
    wire [10:0] b4v = (b11 << 2);

    localparam [10:0] LUM_MIN_C    = LUM_MIN;
    localparam [10:0] CHROMA_MIN_C = CHROMA_MIN;

    // 1. Nguong kenh do toi thieu.
    wire lum_ok = (r11 >= LUM_MIN_C);

    // 2. Do chenh lech R-B toi thieu.
    wire chr_ok = (d11 >= CHROMA_MIN_C);

    // 3. Hue: 10 <= H <= 39.0 do.
    //
    // H >= 10: 6*n >= d
    // H <= 39.0 do: 20*n <= 13*d (60 * 13 / 20 = 39.0 do)
    // Chặn triệt để vệt nắng mặt trời chiếu trên sàn gỗ / gạch men (Hue = 41..44 do)
    wire hue_lo = (d11 != 11'd0) && (n6 >= d11);
    wire hue_hi = (n20 <= d13);

    // 4. Saturation >= 75%.
    // S = (R-B)/R
    // S >= 0.75 <=> 4*B <= R.
    wire sat_ok = (b4v <= r11);

    // 5. Quyet dinh pixel mau cam:
    // Chặn đốm sáng bóng đèn / vệt lóa cháy sáng trên gạch men (R=248, G>=160).
    wire not_glare = ~((r5 == 5'd31) && (g6 >= 6'd40));

    wire match = ord_ok &&
                 lum_ok &&
                 chr_ok &&
                 hue_lo &&
                 hue_hi &&
                 sat_ok &&
                 not_glare;


    // =========================================================================
    // 2. DEM TOA DO PIXEL / NHAN DIEN BIEN FRAME
    // =========================================================================

    reg [9:0] px;
    reg [9:0] py;
    reg       prev_href;
    reg       prev_vsync;

    wire href_falling  = prev_href & ~href;
    wire vsync_rising  = ~prev_vsync & vsync;
    wire vsync_falling = prev_vsync & ~vsync;

    // frame_valid chi duoc chot tai canh xuong VSYNC.
    reg frame_active;

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
                if (vsync_falling)
                    frame_active <= frame_valid;

                if (pixel_valid)
                    px <= px + 10'd1;

                if (href_falling) begin
                    px <= 10'd0;
                    py <= py + 10'd1;
                end
            end
        end
    end


    // =========================================================================
    // 3. LOC HINH HOC MUC PIXEL - RUN LENGTH HAI TANG
    // =========================================================================

    // RLE_MIN: run toi thieu de cong dien tich vao cnt.
    // RLE_BOX: run toi thieu de cap nhat min/max va danh dau dong hop le.
    // Yeu cau RLE_BOX >= RLE_MIN.

    localparam [9:0] RLE_MIN_C = RLE_MIN;
    localparam [9:0] RLE_BOX_C = RLE_BOX;

    localparam [18:0] RLE_MIN_C19 = RLE_MIN;

    reg [9:0] run_len;
    reg [9:0] run_start;
    reg [9:0] rows_good;
    reg       row_hit;

    wire acc_en = pixel_valid && frame_active;

    // Tang 1: dem dien tich run >= RLE_MIN.
    wire run_cnt_first = acc_en && match &&
                         (run_len == (RLE_MIN_C - 10'd1));

    wire run_cnt_more = acc_en && match &&
                        (run_len >= RLE_MIN_C);

    // Tang 2: mo bbox khi run >= RLE_BOX.
    wire run_box_first = acc_en && match &&
                         (run_len == (RLE_BOX_C - 10'd1));

    wire run_box_more = acc_en && match &&
                        (run_len >= RLE_BOX_C);


    // =========================================================================
    // 4. TICH LUY DIEN TICH VA MIN/MAX TOA DO
    // =========================================================================

    // cnt 19 bit du cho frame 640x480 = 307200 pixel.

    reg [18:0] cnt;

    reg [9:0] min_x, max_x;
    reg [9:0] min_y, max_y;

    reg frame_seen;

    localparam [9:0] COORD_MAX = 10'h3FF;

    always @(posedge pclk or negedge prst_n) begin
        if (!prst_n) begin
            cnt        <= 19'd0;
            run_len    <= 10'd0;
            run_start  <= 10'd0;
            rows_good  <= 10'd0;
            row_hit    <= 1'b0;

            min_x      <= COORD_MAX;
            max_x      <= 10'd0;

            min_y      <= COORD_MAX;
            max_y      <= 10'd0;

            frame_seen <= 1'b0;

        end else if (vsync_rising) begin
            cnt        <= 19'd0;
            run_len    <= 10'd0;
            run_start  <= 10'd0;
            rows_good  <= 10'd0;
            row_hit    <= 1'b0;

            min_x      <= COORD_MAX;
            max_x      <= 10'd0;

            min_y      <= COORD_MAX;
            max_y      <= 10'd0;

            frame_seen <= 1'b0;

        end else begin

            // -------------------------------------------------------------
            // Cap nhat run-length theo tung pixel hop le.
            // -------------------------------------------------------------

            if (acc_en) begin
                frame_seen <= 1'b1;

                if (match) begin
                    if (run_len == 10'd0)
                        run_start <= px;

                    if (run_len != COORD_MAX)
                        run_len <= run_len + 10'd1;

                end else begin
                    run_len <= 10'd0;
                end
            end

            // -------------------------------------------------------------
            // Ket thuc mot dong HREF.
            // -------------------------------------------------------------

            if (href_falling) begin
                run_len <= 10'd0;

                if (row_hit)
                    rows_good <= rows_good + 10'd1;

                row_hit <= 1'b0;
            end

            // -------------------------------------------------------------
            // Tang 1: dem dien tich run >= RLE_MIN.
            // -------------------------------------------------------------

            if (run_cnt_first) begin
                cnt <= cnt + RLE_MIN_C19;

            end else if (run_cnt_more) begin
                cnt <= cnt + 19'd1;
            end

            // -------------------------------------------------------------
            // Tang 2: mo rong bounding box khi run dat RLE_BOX.
            // -------------------------------------------------------------

            if (run_box_first) begin
                row_hit <= 1'b1;

                if (run_start < min_x)
                    min_x <= run_start;

                if (px > max_x)
                    max_x <= px;

                if (py < min_y)
                    min_y <= py;

                if (py > max_y)
                    max_y <= py;

            end else if (run_box_more) begin

                if (px > max_x)
                    max_x <= px;

                if (py > max_y)
                    max_y <= py;

            end
        end
    end


    // =========================================================================
    // 5. TINH BOUNDING BOX, CLAMP VA KIEM TRA HINH HOC
    // =========================================================================

    wire [9:0] raw_span_x =
        (max_x >= min_x) ? (max_x - min_x) : 10'd0;

    wire [9:0] raw_span_y =
        (max_y >= min_y) ? (max_y - min_y) : 10'd0;

    wire [10:0] raw_w =
        {1'b0, raw_span_x} + 11'd1;

    wire [10:0] raw_h =
        {1'b0, raw_span_y} + 11'd1;

    localparam [18:0] MIN_PIXELS_C = MIN_PIXELS;
    localparam [10:0] MAX_SPAN_C   = MAX_SPAN;
    localparam [9:0]  ROW_MIN_C    = ROW_MIN;

    wire [10:0] span_lim = MAX_SPAN_C;

    wire clamp_x = (raw_w > span_lim);
    wire clamp_y = (raw_h > span_lim);

    wire [10:0] box_w = clamp_x ? span_lim : raw_w;
    wire [10:0] box_h = clamp_y ? span_lim : raw_h;

    // bbox_x/bbox_y la tam hop bao.
    wire [10:0] cx =
        ({1'b0, min_x} + {1'b0, max_x} + 11'd1) >> 1;

    wire [10:0] cy =
        ({1'b0, min_y} + {1'b0, max_y} + 11'd1) >> 1;

    wire [10:0] box_x =
        (cx > 11'd1023) ? 11'd1023 : cx;

    wire [10:0] box_y =
        (cy > 11'd1023) ? 11'd1023 : cy;

    // ASPECT_MAX mac dinh la luy thua cua 2.
    localparam integer ASPECT_SHIFT =
        (ASPECT_MAX == 1) ? 0 :
        (ASPECT_MAX == 2) ? 1 :
        (ASPECT_MAX == 4) ? 2 :
        (ASPECT_MAX == 8) ? 3 : 4;

    wire [12:0] w13  = {2'b00, box_w};
    wire [12:0] h13  = {2'b00, box_h};

    wire [12:0] wlim = h13 << ASPECT_SHIFT;
    wire [12:0] hlim = w13 << ASPECT_SHIFT;

    wire geom_ok =
        (max_x >= min_x) &&
        (max_y >= min_y);

    // Vung qua lon chi bi loai neu cnt < 8000.
    // Voi cnt lon, chap nhan clamp bbox ve MAX_SPAN.

    wire span_oversized =
        (clamp_x || clamp_y) && (cnt < 19'd8000);

    wire shape_ok =
        (rows_good >= ROW_MIN_C) &&
        !span_oversized &&
        (w13 <= wlim) &&
        (h13 <= hlim);

    wire density_ok = (cnt >= MIN_PIXELS_C);

    wire q_valid_c =
        frame_seen &&
        geom_ok &&
        shape_ok &&
        density_ok;

    // Confidence la diem theo dien tich, khong phai xac suat nhan dang.
    wire [18:0] conf_raw = cnt >> CONF_SHIFT;

    wire [7:0] conf_c =
        (conf_raw > 19'd100) ? 8'd100 : conf_raw[7:0];


    // =========================================================================
    // 6. CHOT KET QUA TAI VSYNC RISING - cam_pclk domain
    // =========================================================================

    reg [15:0] q_x, q_y;

    reg [7:0] q_w, q_h, q_conf;

    reg q_valid;

    reg tgl;

    always @(posedge pclk or negedge prst_n) begin
        if (!prst_n) begin
            q_x     <= 16'd0;
            q_y     <= 16'd0;

            q_w     <= 8'd0;
            q_h     <= 8'd0;
            q_conf  <= 8'd0;

            q_valid <= 1'b0;
            tgl     <= 1'b0;

        end else if (vsync_rising) begin

            q_x <= {5'd0, box_x};
            q_y <= {5'd0, box_y};

            q_w    <= box_w[7:0];
            q_h    <= box_h[7:0];
            q_conf <= conf_c;

            q_valid <= q_valid_c;

            // Chi toggle khi frame thuc su co pixel.
            if (frame_seen)
                tgl <= ~tgl;
        end
    end


    // =========================================================================
    // 7. CDC SANG clk_100m: toggle + 3FF synchronizer
    // =========================================================================

    reg [2:0] tgl_sync;

    always @(posedge clk or negedge rst_n) begin
        if (!rst_n)
            tgl_sync <= 3'b000;
        else
            tgl_sync <= {tgl_sync[1:0], tgl};
    end

    wire tgl_edge = tgl_sync[1] ^ tgl_sync[2];


    // =========================================================================
    // 8. XUAT BBOX THEO THU TU PACKETIZER
    //
    // Chu ky N:   bbox_valid = 1
    // Chu ky N+1: bbox_last  = 1
    //
    // Frame rong:
    //   bbox_valid = 0
    //   bbox_last  = 1
    //   -> gui frame N=0
    // =========================================================================

    always @(posedge clk or negedge rst_n) begin
        if (!rst_n) begin
            bbox_valid <= 1'b0;
            bbox_last  <= 1'b0;

            bbox_x <= 16'd0;
            bbox_y <= 16'd0;

            bbox_w <= 8'd0;
            bbox_h <= 8'd0;

            bbox_conf  <= 8'd0;
            bbox_class <= CLASS_LIFEBUOY;

        end else begin

            bbox_valid <= 1'b0;
            bbox_last  <= 1'b0;

            if (tgl_edge) begin

                bbox_x <= q_x;
                bbox_y <= q_y;

                bbox_w <= q_w;
                bbox_h <= q_h;

                bbox_conf  <= q_conf;
                bbox_class <= CLASS_LIFEBUOY;

                bbox_valid <= q_valid;
                bbox_last  <= ~q_valid;

            end else if (bbox_valid) begin

                bbox_last <= 1'b1;

            end
        end
    end

endmodule
