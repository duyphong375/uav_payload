/**
 * @file test_kvc_georef.c
 * @brief Host Unit Test cho module georeferencing (KVC-MCU-GEO-001).
 *
 * Trọng tâm là QUY TẮC VALIDITY — finding P1 mà ba review độc lập đều nêu:
 * thiếu Yaw thì phải TỪ CHỐI công bố toạ độ mục tiêu, không được giả định
 * hướng Bắc. Ngoài ra kiểm tra phép chiếu hình học và cấu hình theo vĩ độ.
 *
 * Các ca:
 *   1. Thiếu Yaw   -> POS_NONE, toạ độ 0,0 (ca quan trọng nhất)
 *   2. Thiếu GNSS  -> POS_NONE
 *   3. GNSS = 0,0 (sentinel "chưa fix") -> POS_NONE
 *   4. Thiếu cự ly / ngoài dải -> POS_UAV_ONLY, giữ toạ độ UAV
 *   5. BBox ở tâm ảnh, có đủ điều kiện -> POS_COMPUTED, offset ~0
 *   6. BBox lệch phải + Yaw Bắc -> offset Đông dương
 *   7. Xoay Yaw 90° -> trục sai khác bị hoán đổi đúng
 *   8. Yaw 180° (Nam) -> dấu offset đảo
 *   9. Cấu hình mặc định trùng hằng số cũ
 *  10. Cấu hình theo vĩ độ: 0° vs 60° -> hệ số kinh độ chênh ~2 lần
 *  11. Tham số NULL an toàn
 *  12. Offset vượt dải int16 vẫn không sinh giá trị vô nghĩa
 *
 * Người phụ trách: Nguyễn Tá Duy Phong
 */

#define KVC_HOST_TEST 1

#include "kvc_georef.h"
#include <stdio.h>
#include <math.h>

static int s_tests_run    = 0;
static int s_tests_passed = 0;

#define TEST_ASSERT(cond, msg) do { \
    s_tests_run++; \
    if (!(cond)) { \
        printf("  [FAIL] Line %d: %s\n", __LINE__, msg); \
    } else { \
        s_tests_passed++; \
    } \
} while (0)

/* Vĩ độ Đà Nẵng ~16.07°B, kinh độ ~108.15°Đ — cùng mốc với tài liệu dự án. */
#define TEST_LAT_DEG7   160738520L
#define TEST_LON_DEG7   1081499210L

/* Đầu vào "mọi thứ hợp lệ" làm nền cho các ca. */
static KvcGeoInput make_input(void) {
    KvcGeoInput in;
    in.gnss_valid    = true;
    in.uav_lat_deg7  = TEST_LAT_DEG7;
    in.uav_lon_deg7  = TEST_LON_DEG7;
    in.alt_valid     = true;
    in.alt_cm        = 300U;    /* 3 m */
    in.yaw_valid     = true;
    in.yaw_deg10     = 0U;      /* Bắc */
    in.bbox_x_center = 320U;    /* tâm ảnh */
    in.bbox_y_center = 240U;
    return in;
}

/* ============================================================================
 * TEST 1: THIẾU YAW -> PHẢI TỪ CHỐI (finding P1)
 * ============================================================================ */
static void test_missing_yaw_rejects(void) {
    KvcGeoInput in = make_input();
    KvcGeoResult r;

    printf("[TEST 1] Thieu Yaw -> POS_NONE, khong bia toa do...\n");

    in.yaw_valid = false;
    in.yaw_deg10 = 0U;

    r = kvc_georef_target(&in, NULL);

    TEST_ASSERT(r.kind == KVC_GEO_POS_NONE,
                "thieu yaw phai tra POS_NONE (khong duoc gia dinh huong Bac)");
    TEST_ASSERT(r.lat_deg7 == 0, "thieu yaw -> lat = 0");
    TEST_ASSERT(r.lon_deg7 == 0, "thieu yaw -> lon = 0");
    TEST_ASSERT(r.x_local_cm == 0, "thieu yaw -> x_local = 0");
    TEST_ASSERT(r.y_local_cm == 0, "thieu yaw -> y_local = 0");

    /* Kể cả khi BBox lệch khỏi tâm, vẫn phải từ chối. */
    in.bbox_x_center = 600U;
    in.bbox_y_center = 60U;
    r = kvc_georef_target(&in, NULL);
    TEST_ASSERT(r.kind == KVC_GEO_POS_NONE,
                "thieu yaw + BBox lech van phai tu choi");
    TEST_ASSERT(r.lat_deg7 == 0 && r.lon_deg7 == 0,
                "thieu yaw + BBox lech -> toa do van 0");
}

/* ============================================================================
 * TEST 2-3: THIẾU GNSS HOẶC TOẠ ĐỘ SENTINEL
 * ============================================================================ */
static void test_missing_gnss_rejects(void) {
    KvcGeoInput in = make_input();
    KvcGeoResult r;

    printf("[TEST 2] Thieu GNSS -> POS_NONE...\n");

    in.gnss_valid = false;
    r = kvc_georef_target(&in, NULL);
    TEST_ASSERT(r.kind == KVC_GEO_POS_NONE, "thieu GNSS -> POS_NONE");
    TEST_ASSERT(r.lat_deg7 == 0 && r.lon_deg7 == 0, "thieu GNSS -> toa do 0");

    printf("[TEST 3] GNSS (0,0) sentinel -> POS_NONE...\n");

    in = make_input();
    in.uav_lat_deg7 = 0;
    in.uav_lon_deg7 = 0;
    r = kvc_georef_target(&in, NULL);
    TEST_ASSERT(r.kind == KVC_GEO_POS_NONE, "toa do UAV (0,0) -> POS_NONE");

    /* Toạ độ ngoài dải WGS-84 cũng phải bị loại. */
    in = make_input();
    in.uav_lat_deg7 = 1000000000L;   /* 100° > 90° */
    r = kvc_georef_target(&in, NULL);
    TEST_ASSERT(r.kind == KVC_GEO_POS_NONE, "vi do > 90 do -> POS_NONE");

    in = make_input();
    in.uav_lon_deg7 = -1900000000L;  /* -190° < -180° */
    r = kvc_georef_target(&in, NULL);
    TEST_ASSERT(r.kind == KVC_GEO_POS_NONE, "kinh do < -180 do -> POS_NONE");
}

/* ============================================================================
 * TEST 4: THIẾU CỰ LY -> GIỮ VỊ TRÍ UAV
 * ============================================================================ */
static void test_missing_alt_keeps_uav(void) {
    KvcGeoInput in = make_input();
    KvcGeoResult r;

    printf("[TEST 4] Thieu cu ly -> POS_UAV_ONLY...\n");

    in.alt_valid = false;
    r = kvc_georef_target(&in, NULL);
    TEST_ASSERT(r.kind == KVC_GEO_POS_UAV_ONLY, "alt khong hop le -> POS_UAV_ONLY");
    TEST_ASSERT(r.lat_deg7 == TEST_LAT_DEG7, "POS_UAV_ONLY giu lat UAV");
    TEST_ASSERT(r.lon_deg7 == TEST_LON_DEG7, "POS_UAV_ONLY giu lon UAV");
    TEST_ASSERT(r.x_local_cm == 0 && r.y_local_cm == 0, "POS_UAV_ONLY offset = 0");

    /* Biên dải: 19 cm (dưới min) và 801 cm (trên max) đều phải bị loại. */
    in = make_input();
    in.alt_cm = 19U;
    r = kvc_georef_target(&in, NULL);
    TEST_ASSERT(r.kind == KVC_GEO_POS_UAV_ONLY, "alt 19 cm (duoi min) -> POS_UAV_ONLY");

    in.alt_cm = 801U;
    r = kvc_georef_target(&in, NULL);
    TEST_ASSERT(r.kind == KVC_GEO_POS_UAV_ONLY, "alt 801 cm (tren max) -> POS_UAV_ONLY");

    /* Biên trong dải phải được chấp nhận. */
    in.alt_cm = 20U;
    r = kvc_georef_target(&in, NULL);
    TEST_ASSERT(r.kind == KVC_GEO_POS_COMPUTED, "alt 20 cm (bien duoi) -> COMPUTED");

    in.alt_cm = 800U;
    r = kvc_georef_target(&in, NULL);
    TEST_ASSERT(r.kind == KVC_GEO_POS_COMPUTED, "alt 800 cm (bien tren) -> COMPUTED");
}

/* ============================================================================
 * TEST 5-8: HÌNH HỌC PHÉP CHIẾU VÀ XOAY YAW
 * ============================================================================ */
static void test_center_bbox_zero_offset(void) {
    KvcGeoInput in = make_input();
    KvcGeoResult r;

    printf("[TEST 5] BBox tai tam anh -> offset ~0...\n");

    r = kvc_georef_target(&in, NULL);
    TEST_ASSERT(r.kind == KVC_GEO_POS_COMPUTED, "du dieu kien -> COMPUTED");
    TEST_ASSERT(r.lat_deg7 == TEST_LAT_DEG7, "tam anh -> lat khong doi");
    TEST_ASSERT(r.lon_deg7 == TEST_LON_DEG7, "tam anh -> lon khong doi");
    TEST_ASSERT(r.x_local_cm == 0, "tam anh -> x_local = 0");
    TEST_ASSERT(r.y_local_cm == 0, "tam anh -> y_local = 0");
}

static void test_offset_right_and_forward(void) {
    KvcGeoInput in = make_input();
    KvcGeoResult r;
    int16_t x_right;
    int16_t y_up;

    printf("[TEST 6] BBox lech phai / len tren, Yaw = Bac...\n");

    /* BBox lệch phải ảnh -> Đông dương. Yaw = 0 (Bắc). */
    in.bbox_x_center = 420U;
    r = kvc_georef_target(&in, NULL);
    TEST_ASSERT(r.kind == KVC_GEO_POS_COMPUTED, "BBox lech phai -> COMPUTED");
    TEST_ASSERT(r.x_local_cm > 0, "Yaw Bac + lech phai -> x_local (Dong) duong");
    TEST_ASSERT(r.y_local_cm == 0, "lech ngang -> y_local = 0");
    TEST_ASSERT(r.lon_deg7 > TEST_LON_DEG7, "Dong duong -> lon tang");
    TEST_ASSERT(r.lat_deg7 == TEST_LAT_DEG7, "lech ngang -> lat khong doi");
    x_right = r.x_local_cm;

    /* BBox lệch lên trên ảnh -> Bắc dương. */
    in = make_input();
    in.bbox_y_center = 140U;
    r = kvc_georef_target(&in, NULL);
    TEST_ASSERT(r.y_local_cm > 0, "Yaw Bac + len anh -> y_local (Bac) duong");
    TEST_ASSERT(r.x_local_cm == 0, "lech doc -> x_local = 0");
    TEST_ASSERT(r.lat_deg7 > TEST_LAT_DEG7, "Bac duong -> lat tang");
    y_up = r.y_local_cm;

    /* Đối xứng: lệch trái và xuống dưới phải cho dấu ngược lại. */
    in = make_input();
    in.bbox_x_center = 220U;
    r = kvc_georef_target(&in, NULL);
    TEST_ASSERT(r.x_local_cm == -x_right, "lech trai doi xung voi lech phai");

    in = make_input();
    in.bbox_y_center = 340U;
    r = kvc_georef_target(&in, NULL);
    TEST_ASSERT(r.y_local_cm == -y_up, "xuong duoi doi xung voi len tren");
}

static void test_yaw_rotation(void) {
    KvcGeoInput in = make_input();
    KvcGeoResult r_north;
    KvcGeoResult r_east;
    KvcGeoResult r_south;

    printf("[TEST 7-8] Xoay Yaw 90 do / 180 do...\n");

    /* Cùng một BBox lệch phải ảnh. */
    in.bbox_x_center = 420U;
    in.yaw_deg10 = 0U;
    r_north = kvc_georef_target(&in, NULL);

    /* Yaw = 900 (Đông): "phải ảnh" giờ là hướng Nam -> Bắc âm. */
    in.yaw_deg10 = 900U;
    r_east = kvc_georef_target(&in, NULL);
    TEST_ASSERT(r_east.kind == KVC_GEO_POS_COMPUTED, "Yaw 90 do -> COMPUTED");
    TEST_ASSERT(r_east.y_local_cm < 0,
                "Yaw Dong + lech phai anh -> Bc am (di ve Nam)");
    TEST_ASSERT(abs(r_east.x_local_cm) <= 1,
                "Yaw Dong + lech phai anh -> Dong ~ 0");

    /* Bảo toàn độ lớn vector: so |(x,y)| của hai phép xoay, không so từng trục
     * (từng trục bị hoán đổi khi xoay 90° nên so trực tiếp là sai). */
    {
        float len_north = sqrtf((float)r_north.x_local_cm * (float)r_north.x_local_cm +
                                (float)r_north.y_local_cm * (float)r_north.y_local_cm);
        float len_east  = sqrtf((float)r_east.x_local_cm * (float)r_east.x_local_cm +
                                (float)r_east.y_local_cm * (float)r_east.y_local_cm);
        TEST_ASSERT(fabsf(len_north - len_east) <= 1.0f,
                    "do lon vector bao toan khi xoay 90 do");
    }

    /* Yaw = 1800 (Nam): "phải ảnh" giờ là hướng Tây -> Đông âm. */
    in.yaw_deg10 = 1800U;
    r_south = kvc_georef_target(&in, NULL);
    TEST_ASSERT(r_south.x_local_cm < 0, "Yaw Nam + lech phai anh -> Dong am");
    TEST_ASSERT(abs(r_south.y_local_cm) <= 1, "Yaw Nam -> Bac ~ 0");
}

/* ============================================================================
 * TEST 9: CẤU HÌNH MẶC ĐỊNH TRÙNG HẰNG SỐ CŨ
 * ============================================================================ */
static void test_default_config_matches_legacy(void) {
    KvcGeoConfig cfg;

    printf("[TEST 9] Cau hinh mac dinh trung hang so cu...\n");

    kvc_geo_config_default(&cfg);
    TEST_ASSERT(cfg.fx_px == 554.0f, "fx mac dinh = 554");
    TEST_ASSERT(cfg.cx_px == 320.0f, "cx mac dinh = 320");
    TEST_ASSERT(cfg.cy_px == 240.0f, "cy mac dinh = 240");
    TEST_ASSERT(cfg.deg7_per_m_lat == 89.977f, "deg7/m lat mac dinh = 89.977");
    TEST_ASSERT(cfg.deg7_per_m_lon == 93.633f, "deg7/m lon mac dinh = 93.633");
}

/* ============================================================================
 * TEST 10: HỆ SỐ KINH ĐỘ THEO VĨ ĐỘ
 * ============================================================================ */
static void test_latitude_lon_scale(void) {
    KvcGeoConfig eq;
    KvcGeoConfig mid;
    KvcGeoConfig hi;
    float ratio_60;

    printf("[TEST 10] He so kinh do theo vi do...\n");

    kvc_geo_config_for_latitude(&eq, 0);           /* xích đạo */
    kvc_geo_config_for_latitude(&mid, TEST_LAT_DEG7);  /* ~16° */
    kvc_geo_config_for_latitude(&hi, 600000000L);  /* 60° */

    /* Ở xích đạo, 1 m kinh độ xấp xỉ 1 m vĩ độ -> hai hệ số gần bằng nhau. */
    TEST_ASSERT(fabsf(eq.deg7_per_m_lon - eq.deg7_per_m_lat) < 0.5f,
                "o xich dao, he so lon ~ he so lat");

    /* Ở 60°, cos(60) = 0.5 -> hệ số kinh độ gấp đôi vĩ độ (sai số bảng sin ~1%). */
    ratio_60 = hi.deg7_per_m_lon / hi.deg7_per_m_lat;
    TEST_ASSERT(ratio_60 > 1.97f && ratio_60 < 2.03f,
                "o vi do 60, he so lon ~ 2x he so lat");

    /* ~16° phải gần 93.633 (giá trị danh định cũ) trong sai số bảng sin. */
    TEST_ASSERT(fabsf(mid.deg7_per_m_lon - 93.633f) < 0.6f,
                "o vi do ~16, he so lon ~ 93.633");

    /* Vĩ độ âm phải cho cùng kết quả (cos là hàm chẵn). */
    {
        KvcGeoConfig neg;
        kvc_geo_config_for_latitude(&neg, -600000000L);
        TEST_ASSERT(fabsf(neg.deg7_per_m_lon - hi.deg7_per_m_lon) < 0.001f,
                    "vi do am cho cung he so nhu vi do duong");
    }
}

/* ============================================================================
 * TEST 11: THAM SỐ NULL
 * ============================================================================ */
static void test_null_safe(void) {
    KvcGeoResult r;

    printf("[TEST 11] Tham so NULL an toan...\n");

    r = kvc_georef_target(NULL, NULL);
    TEST_ASSERT(r.kind == KVC_GEO_POS_NONE, "input NULL -> POS_NONE");
    TEST_ASSERT(r.lat_deg7 == 0 && r.lon_deg7 == 0, "input NULL -> toa do 0");

    kvc_geo_config_default(NULL);
    kvc_geo_config_for_latitude(NULL, TEST_LAT_DEG7);
    TEST_ASSERT(1, "config NULL khong crash");
}

/* ============================================================================
 * TEST 12: OFFSET LỚN KHÔNG TRÀN
 * ============================================================================ */
static void test_large_offset_saturates_cleanly(void) {
    KvcGeoInput in = make_input();
    KvcGeoResult r;

    printf("[TEST 12] BBox sat mep anh o do cao lon...\n");

    /* 8 m, BBox sát mép trái ảnh -> offset có thể vượt dải int16 (32767 cm).
     * Yêu cầu: không được sinh giá trị "lật dấu" vô nghĩa. */
    in.alt_cm        = 800U;
    in.bbox_x_center = 0U;
    r = kvc_georef_target(&in, NULL);

    TEST_ASSERT(r.kind == KVC_GEO_POS_COMPUTED, "8 m + mep anh -> COMPUTED");
    TEST_ASSERT(r.x_local_cm < 0, "mep trai -> x_local am (khong lat dau)");
    printf("  (info) offset x_local = %d cm, lat=%ld lon=%ld\n",
           (int)r.x_local_cm, (long)r.lat_deg7, (long)r.lon_deg7);

    /* Toạ độ vẫn phải là số hợp lệ (không phải sentinel 0 và không tràn dải). */
    TEST_ASSERT(r.lat_deg7 != 0 && r.lon_deg7 != 0, "toa do khac sentinel 0");
}

int main(void) {
    printf("================================================================\n");
    printf("  KVC - HOST TEST: GEOREFERENCING (MCU-GEO-001)\n");
    printf("================================================================\n\n");

    test_missing_yaw_rejects();
    test_missing_gnss_rejects();
    test_missing_alt_keeps_uav();
    test_center_bbox_zero_offset();
    test_offset_right_and_forward();
    test_yaw_rotation();
    test_default_config_matches_legacy();
    test_latitude_lon_scale();
    test_null_safe();
    test_large_offset_saturates_cleanly();

    printf("\n----------------------------------------------------------------\n");
    printf("  KET QUA: %d / %d tests PASS\n", s_tests_passed, s_tests_run);
    printf("================================================================\n");

    if (s_tests_passed != s_tests_run) {
        printf("CO TEST THAT BAI!\n");
        return 1;
    }
    printf("TAT CA PASS\n");
    return 0;
}
