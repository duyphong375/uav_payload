/**
 * @file kvc_georef.c
 * @brief Cài đặt phép chiếu BBox xuống mặt nước. Xem kvc_georef.h.
 *
 * Không phụ thuộc phần cứng: biên dịch và kiểm thử được trên host lẫn target.
 *
 * NGUYÊN TẮC GIỮ NGUYÊN SỐ HỌC: nhánh có Yaw dưới đây dùng đúng chuỗi phép
 * tính và đúng hằng số của bản cũ trong `main.c` (thứ tự nhân/chia, kiểu
 * float, ép int32/int16). Mục tiêu là tách module mà KHÔNG làm thay đổi kết quả
 * trên kit — mọi khác biệt hành vi chỉ nằm ở nhánh thiếu Yaw/GNSS, tức đúng
 * phạm vi finding P1 được sửa.
 *
 * Người phụ trách: Nguyễn Tá Duy Phong
 */

#include "kvc_georef.h"
#include "kvc_geo_math.h"

/* Giá trị danh định — trùng khớp hằng số hard-code trước 29/10/2026. */
#define KVC_GEO_DEFAULT_FX_PX          554.0f
#define KVC_GEO_DEFAULT_CX_PX          320.0f
#define KVC_GEO_DEFAULT_CY_PX          240.0f
#define KVC_GEO_DEFAULT_DEG7_PER_M_LAT 89.977f
/* 93.633 ≈ 1 / (111139 · cos(16°)) × 10^7 — hệ số tại vĩ độ Đà Nẵng. */
#define KVC_GEO_DEFAULT_DEG7_PER_M_LON 93.633f

/* 1 độ vĩ ≈ 111 139 m; nhân 10^7 rồi nghịch đảo cho ra deg7/m. */
#define KVC_GEO_DEG7_PER_M_LAT_EXACT   (10000000.0f / 111139.0f)

/* WGS-84 bounds (×10^7), khớp KVC_GNSS_LAT_MIN_DEG7/KVC_GNSS_LON_MIN_DEG7. */
#define KVC_GEO_LAT_LIMIT_DEG7         900000000L
#define KVC_GEO_LON_LIMIT_DEG7         1800000000L

void kvc_geo_config_default(KvcGeoConfig *cfg) {
    if (cfg == 0) {
        return;
    }
    cfg->fx_px           = KVC_GEO_DEFAULT_FX_PX;
    cfg->cx_px           = KVC_GEO_DEFAULT_CX_PX;
    cfg->cy_px           = KVC_GEO_DEFAULT_CY_PX;
    cfg->deg7_per_m_lat  = KVC_GEO_DEFAULT_DEG7_PER_M_LAT;
    cfg->deg7_per_m_lon  = KVC_GEO_DEFAULT_DEG7_PER_M_LON;
}

void kvc_geo_config_for_latitude(KvcGeoConfig *cfg, int32_t lat_deg7) {
    int32_t lat;
    int32_t cos_x10000;

    if (cfg == 0) {
        return;
    }
    kvc_geo_config_default(cfg);

    /* Kẹp về dải hợp lệ để phép chia cos không tiến về 0 ở cực. */
    if (lat_deg7 > KVC_GEO_LAT_LIMIT_DEG7) {
        lat_deg7 = KVC_GEO_LAT_LIMIT_DEG7;
    } else if (lat_deg7 < -KVC_GEO_LAT_LIMIT_DEG7) {
        lat_deg7 = -KVC_GEO_LAT_LIMIT_DEG7;
    }

    /* Lấy trị tuyệt đối của góc: cos là hàm chẵn nên bán cầu không ảnh hưởng. */
    lat = (lat_deg7 < 0) ? -lat_deg7 : lat_deg7;

    /* Đổi vĩ độ ×10^7 sang đơn vị 0,1° rồi dùng bảng sin của kvc_geo_math.
     *
     * QUY ĐỔI: deg7 = độ × 10^7, deg10 = độ × 10, nên deg10 = deg7 / 10^6.
     * (Chia 10^5 sẽ cho giá trị gấp 10 lần — đã mắc và bị test bắt.) */
    {
        uint32_t deg10 = (uint32_t)((int64_t)lat / 1000000LL);
        if (deg10 > 900U) {
            deg10 = 900U;
        }
        /* cos(lat) = sin(lat + 90°) — đúng quy ước trong kvc_geo_math. */
        cos_x10000 = kvc_geo_cos_deg10((uint16_t)deg10);
    }

    /* Tránh chia cho 0 khi vĩ độ tiến sát ±90°. 0,01 là ngưỡng tuỳ ý nhưng đủ
     * xa để giá trị hệ số vẫn hữu hạn và vô nghĩa đúng như bản chất (ở cực,
     * kinh độ không còn ý nghĩa định vị). */
    if (cos_x10000 < 100) {
        cos_x10000 = 100;
    }

    cfg->deg7_per_m_lat = KVC_GEO_DEG7_PER_M_LAT_EXACT;
    cfg->deg7_per_m_lon = KVC_GEO_DEG7_PER_M_LAT_EXACT
                        * 10000.0f / (float)cos_x10000;
}

/* Trả về true nếu cặp toạ độ nằm trong dải WGS-84 và không phải sentinel 0,0. */
static bool geo_coord_usable(int32_t lat_deg7, int32_t lon_deg7) {
    if ((lat_deg7 == 0) && (lon_deg7 == 0)) {
        return false;   /* Quy ước IF-02: 0,0 = chưa có fix */
    }
    if ((lat_deg7 > KVC_GEO_LAT_LIMIT_DEG7) || (lat_deg7 < -KVC_GEO_LAT_LIMIT_DEG7)) {
        return false;
    }
    if ((lon_deg7 > KVC_GEO_LON_LIMIT_DEG7) || (lon_deg7 < -KVC_GEO_LON_LIMIT_DEG7)) {
        return false;
    }
    return true;
}

static KvcGeoResult geo_make_none(void) {
    KvcGeoResult r;
    r.kind        = KVC_GEO_POS_NONE;
    r.lat_deg7    = 0;
    r.lon_deg7    = 0;
    r.x_local_cm  = 0;
    r.y_local_cm  = 0;
    r.east_mm     = 0;
    r.north_mm    = 0;
    return r;
}

KvcGeoResult kvc_georef_target(const KvcGeoInput *in, const KvcGeoConfig *cfg) {
    KvcGeoConfig default_cfg;
    KvcGeoResult out;
    float h_m;
    float scale;
    int32_t right_mm;
    int32_t fwd_mm;
    int32_t east_mm;
    int32_t north_mm;
    float delta_x_m;
    float delta_y_m;
    int32_t d_lat_deg7;
    int32_t d_lon_deg7;

    if (in == 0) {
        return geo_make_none();
    }

    /* ---- Bước 1: có mốc để cộng offset không? ----
     * Không có GNSS hợp lệ -> không có gốc toạ độ. Không có Yaw đáng tin ->
     * KHÔNG được giả định hướng Bắc (finding P1 của 3 review độc lập). */
    if (!in->gnss_valid ||
        !geo_coord_usable(in->uav_lat_deg7, in->uav_lon_deg7)) {
        return geo_make_none();
    }

    if (!in->yaw_valid) {
        return geo_make_none();
    }

    /* ---- Bước 2: có cự ly để chiếu xuống mặt nước không? ----
     * Thiếu cự ly thì giữ vị trí UAV: đó là thông tin đúng (UAV ở đâu), chỉ
     * không có offset mục tiêu. Backend vẫn coi target chưa định vị chuẩn xác. */
    if (!in->alt_valid ||
        (in->alt_cm < KVC_GEO_ALT_MIN_CM) ||
        (in->alt_cm > KVC_GEO_ALT_MAX_CM)) {
        out = geo_make_none();
        out.kind     = KVC_GEO_POS_UAV_ONLY;
        out.lat_deg7 = in->uav_lat_deg7;
        out.lon_deg7 = in->uav_lon_deg7;
        return out;
    }

    /* ---- Bước 3: chiếu BBox xuống mặt nước (giữ nguyên số học bản cũ) ---- */
    if (cfg == 0) {
        kvc_geo_config_default(&default_cfg);
        cfg = &default_cfg;
    }

    h_m = (float)in->alt_cm / 100.0f;
    if (h_m < 0.2f) {
        h_m = 0.2f;
    }

    /* Tỉ lệ mét/pixel ở độ cao h. Tách thành biến để không lặp lại phép chia;
     * giá trị bằng đúng `h_m / 554.0f` của bản cũ. */
    scale = h_m / cfg->fx_px;

    /* Hệ trục ẢNH: right dương = sang phải ảnh, fwd dương = lên trên ảnh. */
    right_mm = (int32_t)(((float)in->bbox_x_center - cfg->cx_px) * scale * 1000.0f);
    fwd_mm   = (int32_t)((cfg->cy_px - (float)in->bbox_y_center) * scale * 1000.0f);

    /* ---- Bước 4: xoay hệ ảnh sang hệ Đông/Bắc theo Yaw ---- */
    east_mm  = 0;
    north_mm = 0;
    kvc_geo_rotate_to_ne(right_mm, fwd_mm, in->yaw_deg10, &east_mm, &north_mm);

    delta_x_m = (float)east_mm / 1000.0f;
    delta_y_m = (float)north_mm / 1000.0f;

    /* ---- Bước 5: cộng offset mét vào toạ độ UAV ---- */
    d_lat_deg7 = (int32_t)(delta_y_m * cfg->deg7_per_m_lat);
    d_lon_deg7 = (int32_t)(delta_x_m * cfg->deg7_per_m_lon);

    out.kind       = KVC_GEO_POS_COMPUTED;
    out.lat_deg7   = in->uav_lat_deg7 + d_lat_deg7;
    out.lon_deg7   = in->uav_lon_deg7 + d_lon_deg7;
    out.x_local_cm = (int16_t)(delta_x_m * 100.0f);
    out.y_local_cm = (int16_t)(delta_y_m * 100.0f);
    out.east_mm    = east_mm;
    out.north_mm   = north_mm;
    return out;
}
