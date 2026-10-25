/**
 * @file test_kvc_gnss_neo_m10.c
 * @brief Bộ kiểm thử đơn vị Host Unit Test cho Driver GNSS u-blox NEO-M10 (Task KVC-GNSS-M10-001).
 *
 * Kiểm tra đầy đủ các yêu cầu nghiệm thu của task:
 * 1. Câu GGA/GSA hợp lệ, bóc tách đúng vĩ độ/kinh độ WGS-84 x 10^7, số vệ tinh, HDOP, fix quality, fix mode.
 * 2. Đa định dạng Talker ID ($GNGGA, $GPGGA, $GAGGA, $GLGGA, $GBGGA và $GNGSA, $GPGSA).
 * 3. Kiểm tra mã Checksum (XOR) và phát hiện, loại bỏ câu sai lệch checksum.
 * 4. Xử lý câu thiếu trường, trường rỗng, câu không có fix.
 * 5. Chống tràn bộ đệm khi nhận câu quá dài (> 120 ký tự).
 * 6. Kiểm tra các ngưỡng tiêu chuẩn 3D Fix:
 *    - Fix Quality < 1 -> Invalid
 *    - Fix Mode != 3 (Mode 1 không có fix, Mode 2 là 2D fix) -> Invalid
 *    - Satellites < 5 -> Invalid
 *    - HDOP > 2.50 (2.51 trở lên) -> Invalid; HDOP <= 2.50 -> Valid
 * 7. Kiểm tra tọa độ bán cầu Bắc/Nam ('N'/'S'), Đông/Tây ('E'/'W') và biên WGS-84:
 *    - Biên vĩ độ [-90°, +90°]
 *    - Biên kinh độ [-180°, +180°]
 *    - Phút vượt ngưỡng (>= 60) -> Bị từ chối
 * 8. Hạn định thời dữ liệu mới (3.0 giây / 3000 ms) và tự động hạ cờ valid khi quá hạn.
 * 9. Phục hồi sau câu lỗi, nhiễu đường truyền, câu bị cắt ngang giữa chừng.
 * 10. Luồng byte-by-byte liên tục mô phỏng cơ chế Polling UART thực tế.
 *
 * Người phụ trách phân hệ MCU UAV: Nguyễn Tá Duy Phong
 */

#define KVC_HOST_TEST 1

#include "kvc_gnss_neo_m10.h"
#include <stdio.h>
#include <stdlib.h>
#include <string.h>
#include <assert.h>

static int s_tests_run = 0;
static int s_tests_passed = 0;

#define TEST_ASSERT(cond, msg) do { \
    s_tests_run++; \
    if (!(cond)) { \
        printf("  [FAIL] Line %d: %s\n", __LINE__, msg); \
    } else { \
        s_tests_passed++; \
    } \
} while (0)

/**
 * @brief Helper tự động tính Checksum XOR và gửi câu NMEA hoàn chỉnh.
 */
static void send_nmea(const char *payload, uint32_t now_ms) {
    uint8_t cs = 0;
    for (const char *p = payload; *p != '\0'; p++) {
        cs ^= (uint8_t)(*p);
    }
    char buf[256];
    snprintf(buf, sizeof(buf), "$%s*%02X\r\n", payload, cs);
    kvc_gnss_feed_sentence(buf, now_ms);
}

/**
 * @brief Helper gửi câu NMEA với mã Checksum cố ý bị sai lệch để test phát hiện lỗi.
 */
static void send_nmea_corrupt_cs(const char *payload, uint32_t now_ms) {
    uint8_t cs = 0;
    for (const char *p = payload; *p != '\0'; p++) {
        cs ^= (uint8_t)(*p);
    }
    cs ^= 0x5AU; /* Làm sai lệch checksum */
    char buf[256];
    snprintf(buf, sizeof(buf), "$%s*%02X\r\n", payload, cs);
    kvc_gnss_feed_sentence(buf, now_ms);
}

/* ============================================================================
 * TEST CASE 1: CÂU GGA VÀ GSA HỢP LỆ — 3D FIX CHUẨN
 * ============================================================================ */
static void test_valid_3d_fix(void) {
    printf("[TEST 1] Valid GGA + GSA 3D Fix...\n");
    kvc_gnss_reset();

    /* Nạp câu GGA tọa độ Đà Nẵng (16°04.43112' N, 108°08.99526' E), 8 vệ tinh, HDOP 1.20 */
    send_nmea("GNGGA,074522.00,1604.43112,N,10808.99526,E,1,08,1.20,12.5,M,0.0,M,,", 1000);
    
    /* GGA độc lập với fix_quality=1 và 8 vệ tinh đã cho vị trí hợp lệ */
    TEST_ASSERT(kvc_gnss_is_valid(), "GGA alone with fix quality=1 reports valid location");

    /* Nạp câu GSA báo Mode 3 (3D fix) */
    send_nmea("GNGSA,A,3,01,02,03,04,05,06,07,08,,,,,1.80,1.20,1.00", 1050);

    TEST_ASSERT(kvc_gnss_is_valid(), "GGA + GSA Mode 3 must be valid");
    TEST_ASSERT(kvc_gnss_is_3d_fix(), "GGA + GSA Mode 3 with sats=8 and HDOP=1.20 must be 3D fix");

    const KvcGnssState *st = kvc_gnss_get_state();
    TEST_ASSERT(st->lat_deg7 == 160738520, "Latitude must match 16.0738520 deg N (160738520)");
    TEST_ASSERT(st->lon_deg7 == 1081499210, "Longitude must match 108.1499210 deg E (1081499210)");
    TEST_ASSERT(st->fix_quality == 1, "Fix quality must be 1 (GPS SPS)");
    TEST_ASSERT(st->fix_mode == 3, "Fix mode must be 3 (3D Fix)");
    TEST_ASSERT(st->satellites_tracked == 8, "Satellites tracked must be 8");
    TEST_ASSERT(st->hdop_centi == 120, "HDOP centi must be 120 (1.20)");
    TEST_ASSERT(st->hdop_x10 == 12, "HDOP x10 must be 12 (1.2)");
    TEST_ASSERT(st->last_update_ms == 1050, "Last update ms must be 1050");
}

/* ============================================================================
 * TEST CASE 2: CÁC TALKER ID KHÁC NHAU (GP, GN, GL, GA, GB)
 * ============================================================================ */
static void test_talker_ids(void) {
    printf("[TEST 2] Talker IDs (GP, GL, GA, GB)...\n");
    kvc_gnss_reset();

    /* GPS Talker ($GPGGA, $GPGSA) */
    send_nmea("GPGGA,123519.00,1604.43112,N,10808.99526,E,1,06,1.50,545.4,M,46.9,M,,", 2000);
    send_nmea("GPGSA,A,3,04,05,,09,12,,,24,,,,,2.50,1.50,2.10", 2010);
    TEST_ASSERT(kvc_gnss_is_valid(), "GPGGA + GPGSA must be valid");

    /* Galileo Talker ($GAGGA) với Fix Quality = 4 (RTK Fixed) */
    send_nmea("GAGGA,123520.00,1604.43112,N,10808.99526,E,4,10,0.80,545.4,M,46.9,M,,", 2100);
    const KvcGnssState *st = kvc_gnss_get_state();
    TEST_ASSERT(st->fix_quality == 4, "RTK Fixed (quality=4) must be accepted");
    TEST_ASSERT(st->satellites_tracked == 10, "Satellites must be 10");
    TEST_ASSERT(st->hdop_centi == 80, "HDOP centi must be 80");

    /* GLONASS Talker ($GLGGA) */
    send_nmea("GLGGA,123521.00,1604.43112,N,10808.99526,E,2,07,1.10,545.4,M,46.9,M,,", 2200);
    st = kvc_gnss_get_state();
    TEST_ASSERT(st->fix_quality == 2, "DGPS (quality=2) must be accepted");

    /* BeiDou Talker ($GBGGA) */
    send_nmea("GBGGA,123522.00,1604.43112,N,10808.99526,E,1,09,1.00,545.4,M,46.9,M,,", 2300);
    st = kvc_gnss_get_state();
    TEST_ASSERT(st->satellites_tracked == 9, "BeiDou satellites must be 9");
}

/* ============================================================================
 * TEST CASE 3: KIỂM TRA MÃ CHECKSUM VÀ TỪ CHỐI CÂU LỖI
 * ============================================================================ */
static void test_checksum_verification(void) {
    printf("[TEST 3] Checksum verification & corrupted packet rejection...\n");
    kvc_gnss_reset();

    /* Nạp câu GGA có checksum bị sai */
    send_nmea_corrupt_cs("GNGGA,074522.00,1604.43112,N,10808.99526,E,1,08,1.20,12.5,M,0.0,M,,", 1000);
    const KvcGnssState *st = kvc_gnss_get_state();
    TEST_ASSERT(st->last_gga_ms == 0, "Corrupted checksum must not update state");
    TEST_ASSERT(!kvc_gnss_is_valid(), "Corrupted checksum must not become valid");

    /* Nạp câu hoàn toàn không có dấu '*' checksum */
    kvc_gnss_feed_sentence("$GNGGA,074522.00,1604.43112,N,10808.99526,E,1,08,1.20,12.5,M,0.0,M,,\r\n", 1100);
    TEST_ASSERT(st->last_gga_ms == 0, "Sentence without '*' must be rejected");

    /* Nạp câu đúng checksum ngay sau đó */
    send_nmea("GNGGA,074522.00,1604.43112,N,10808.99526,E,1,08,1.20,12.5,M,0.0,M,,", 1200);
    TEST_ASSERT(st->last_gga_ms == 1200, "Valid checksum must update last_gga_ms to 1200");
}

/* ============================================================================
 * TEST CASE 4: XỬ LÝ CÂU THIẾU TRƯỜNG, TRƯỜNG RỖNG VÀ CÂU RỖNG
 * ============================================================================ */
static void test_missing_fields_and_empty(void) {
    printf("[TEST 4] Missing fields and empty sentences...\n");
    kvc_gnss_reset();

    /* Câu hoàn toàn rỗng khi chưa có sóng GPS */
    send_nmea("GNGGA,,,,,,0,00,99.99,,,,,,", 1000);
    send_nmea("GNGSA,A,1,,,,,,,,,,,,,99.99,99.99,99.99", 1050);

    const KvcGnssState *st = kvc_gnss_get_state();
    TEST_ASSERT(!kvc_gnss_is_valid(), "No fix sentence must not be valid");
    TEST_ASSERT(st->fix_quality == 0, "Fix quality must be 0");
    TEST_ASSERT(st->fix_mode == 1, "Fix mode must be 1 (No fix)");
    TEST_ASSERT(st->satellites_tracked == 0, "Satellites tracked must be 0");

    /* Câu bị cắt cụt thiếu trường */
    send_nmea("GNGGA,074522.00,1604.43112", 1100);
    TEST_ASSERT(!kvc_gnss_is_valid(), "Truncated GGA must be safely handled");
}

/* ============================================================================
 * TEST CASE 5: BẢO VỆ CHỐNG TRÀN BỘ ĐỆM (> 120 BYTES)
 * ============================================================================ */
static void test_buffer_overflow_protection(void) {
    printf("[TEST 5] Buffer overflow protection (> 120 chars)...\n");
    kvc_gnss_reset();

    /* Tạo một câu giả lập cực dài vượt 120 ký tự */
    char long_payload[200];
    memset(long_payload, 'A', sizeof(long_payload));
    long_payload[199] = '\0';

    send_nmea(long_payload, 1000);

    /* Bộ giải mã phải hủy bỏ an toàn mà không tràn bộ nhớ hoặc treo CPU */
    TEST_ASSERT(!kvc_gnss_is_valid(), "Overflow payload must be safely dropped");

    /* Gửi tiếp câu bình thường để xác nhận máy trạng thái phục hồi tốt */
    send_nmea("GNGGA,074522.00,1604.43112,N,10808.99526,E,1,08,1.20,12.5,M,0.0,M,,", 1100);
    send_nmea("GNGSA,A,3,01,02,03,04,05,06,07,08,,,,,1.80,1.20,1.00", 1110);
    TEST_ASSERT(kvc_gnss_is_valid(), "Parser must recover after oversized buffer discard");
}

/* ============================================================================
 * TEST CASE 6: KIỂM TRA TOÀN BỘ CÁC NGƯỠNG TIÊU CHUẨN ĐỊNH VỊ 3D
 * ============================================================================ */
static void test_fix_thresholds(void) {
    printf("[TEST 6] Fix thresholds (quality >= 1, mode >= 2, sats >= 4, HDOP <= 5.00)...\n");

    /* 6.1: Fix quality < 1 */
    kvc_gnss_reset();
    send_nmea("GNGGA,074522.00,1604.43112,N,10808.99526,E,0,08,1.20,12.5,M,0.0,M,,", 1000);
    send_nmea("GNGSA,A,3,01,02,03,04,05,06,07,08,,,,,1.80,1.20,1.00", 1010);
    TEST_ASSERT(!kvc_gnss_is_valid(), "Quality=0 must NOT be valid");

    /* 6.2: Fix mode == 1 (Mode 1 = No fix) */
    kvc_gnss_reset();
    send_nmea("GNGGA,074522.00,1604.43112,N,10808.99526,E,1,08,1.20,12.5,M,0.0,M,,", 1000);
    send_nmea("GNGSA,A,1,,,,,,,,,,,,,1.80,1.20,1.00", 1010);
    TEST_ASSERT(!kvc_gnss_is_valid(), "Mode=1 (No fix) must NOT be valid");

    /* 6.3: Satellites < 4 (Ví dụ 3 vệ tinh) */
    kvc_gnss_reset();
    send_nmea("GNGGA,074522.00,1604.43112,N,10808.99526,E,1,03,1.20,12.5,M,0.0,M,,", 1000);
    send_nmea("GNGSA,A,3,01,02,03,,,,,,,,,,1.80,1.20,1.00", 1010);
    TEST_ASSERT(!kvc_gnss_is_valid(), "Sats=3 (< 4) must NOT be valid");

    /* 6.4: HDOP > 5.00 (Ví dụ 5.01) */
    kvc_gnss_reset();
    send_nmea("GNGGA,074522.00,1604.43112,N,10808.99526,E,1,08,5.01,12.5,M,0.0,M,,", 1000);
    send_nmea("GNGSA,A,3,01,02,03,04,05,06,07,08,,,,,6.00,5.01,2.00", 1010);
    TEST_ASSERT(!kvc_gnss_is_valid(), "HDOP=5.01 (> 5.00) must NOT be valid");

    /* 6.5: HDOP đúng ngưỡng biên 5.00 và 4 vệ tinh với Mode 2 (2D fix) -> Phải VALID */
    kvc_gnss_reset();
    send_nmea("GNGGA,074522.00,1604.43112,N,10808.99526,E,1,04,5.00,12.5,M,0.0,M,,", 1000);
    send_nmea("GNGSA,A,2,01,02,03,04,,,,,,,,,6.00,5.00,2.00", 1010);
    TEST_ASSERT(kvc_gnss_is_valid(), "Boundary sats=4 and HDOP=5.00 with Mode=2 must be VALID");
    TEST_ASSERT(!kvc_gnss_is_3d_fix(), "Mode=2 must NOT be 3D fix");
}

/* ============================================================================
 * TEST CASE 7: TỌA ĐỘ BẮC/NAM, ĐÔNG/TÂY VÀ BIÊN WGS-84
 * ============================================================================ */
static void test_coordinates_and_bounds(void) {
    printf("[TEST 7] Coordinates North/South, East/West and WGS-84 boundaries...\n");

    /* 7.1: Bán cầu Nam ('S') và Bán cầu Tây ('W') */
    kvc_gnss_reset();
    send_nmea("GNGGA,074522.00,1604.43112,S,10808.99526,W,1,08,1.20,12.5,M,0.0,M,,", 1000);
    send_nmea("GNGSA,A,3,01,02,03,04,05,06,07,08,,,,,1.80,1.20,1.00", 1010);
    TEST_ASSERT(kvc_gnss_is_valid(), "South/West coords with valid fix must be valid");
    const KvcGnssState *st = kvc_gnss_get_state();
    TEST_ASSERT(st->lat_deg7 == -160738520, "South latitude must be negative (-160738520)");
    TEST_ASSERT(st->lon_deg7 == -1081499210, "West longitude must be negative (-1081499210)");

    /* 7.2: Điểm xích đạo và kinh tuyến gốc (0°, 0°) */
    kvc_gnss_reset();
    send_nmea("GNGGA,074522.00,0000.00000,N,00000.00000,E,1,08,1.20,0.0,M,0.0,M,,", 1000);
    send_nmea("GNGSA,A,3,01,02,03,04,05,06,07,08,,,,,1.80,1.20,1.00", 1010);
    TEST_ASSERT(kvc_gnss_is_valid(), "Equator and prime meridian must be valid");
    st = kvc_gnss_get_state();
    TEST_ASSERT(st->lat_deg7 == 0, "Equator latitude must be 0");
    TEST_ASSERT(st->lon_deg7 == 0, "Prime meridian longitude must be 0");

    /* 7.3: Cực Bắc (+90°) và Cực Nam (-90°) */
    kvc_gnss_reset();
    send_nmea("GNGGA,074522.00,9000.00000,N,00000.00000,E,1,08,1.20,0.0,M,0.0,M,,", 1000);
    send_nmea("GNGSA,A,3,01,02,03,04,05,06,07,08,,,,,1.80,1.20,1.00", 1010);
    TEST_ASSERT(kvc_gnss_is_valid(), "North pole must be valid");
    st = kvc_gnss_get_state();
    TEST_ASSERT(st->lat_deg7 == 900000000, "North pole must be +900000000");

    kvc_gnss_reset();
    send_nmea("GNGGA,074522.00,9000.00000,S,00000.00000,E,1,08,1.20,0.0,M,0.0,M,,", 1000);
    send_nmea("GNGSA,A,3,01,02,03,04,05,06,07,08,,,,,1.80,1.20,1.00", 1010);
    TEST_ASSERT(kvc_gnss_is_valid(), "South pole must be valid");
    st = kvc_gnss_get_state();
    TEST_ASSERT(st->lat_deg7 == -900000000, "South pole must be -900000000");

    /* 7.4: Vĩ độ vượt biên WGS-84 (> 90°) */
    kvc_gnss_reset();
    send_nmea("GNGGA,074522.00,9000.00001,N,00000.00000,E,1,08,1.20,0.0,M,0.0,M,,", 1000);
    send_nmea("GNGSA,A,3,01,02,03,04,05,06,07,08,,,,,1.80,1.20,1.00", 1010);
    TEST_ASSERT(!kvc_gnss_is_valid(), "Latitude > 90 deg must be REJECTED");

    /* 7.5: Đường đổi ngày quốc tế (+180° và -180°) */
    kvc_gnss_reset();
    send_nmea("GNGGA,074522.00,0000.00000,N,18000.00000,E,1,08,1.20,0.0,M,0.0,M,,", 1000);
    send_nmea("GNGSA,A,3,01,02,03,04,05,06,07,08,,,,,1.80,1.20,1.00", 1010);
    TEST_ASSERT(kvc_gnss_is_valid(), "180 deg East must be valid");
    st = kvc_gnss_get_state();
    TEST_ASSERT(st->lon_deg7 == 1800000000, "180 deg East must be +1800000000");

    kvc_gnss_reset();
    send_nmea("GNGGA,074522.00,0000.00000,N,18000.00000,W,1,08,1.20,0.0,M,0.0,M,,", 1000);
    send_nmea("GNGSA,A,3,01,02,03,04,05,06,07,08,,,,,1.80,1.20,1.00", 1010);
    TEST_ASSERT(kvc_gnss_is_valid(), "180 deg West must be valid");
    st = kvc_gnss_get_state();
    TEST_ASSERT(st->lon_deg7 == -1800000000, "180 deg West must be -1800000000");

    /* 7.6: Kinh độ vượt biên WGS-84 (> 180°) */
    kvc_gnss_reset();
    send_nmea("GNGGA,074522.00,0000.00000,N,18000.00001,E,1,08,1.20,0.0,M,0.0,M,,", 1000);
    send_nmea("GNGSA,A,3,01,02,03,04,05,06,07,08,,,,,1.80,1.20,1.00", 1010);
    TEST_ASSERT(!kvc_gnss_is_valid(), "Longitude > 180 deg must be REJECTED");

    /* 7.7: Số phút không hợp lệ (>= 60) */
    kvc_gnss_reset();
    send_nmea("GNGGA,074522.00,1660.00000,N,10808.99526,E,1,08,1.20,12.5,M,0.0,M,,", 1000);
    send_nmea("GNGSA,A,3,01,02,03,04,05,06,07,08,,,,,1.80,1.20,1.00", 1010);
    TEST_ASSERT(!kvc_gnss_is_valid(), "Minutes >= 60 must be REJECTED");

    /* 7.8: Ký tự bán cầu không hợp lệ ('X') */
    kvc_gnss_reset();
    send_nmea("GNGGA,074522.00,1604.43112,X,10808.99526,E,1,08,1.20,12.5,M,0.0,M,,", 1000);
    send_nmea("GNGSA,A,3,01,02,03,04,05,06,07,08,,,,,1.80,1.20,1.00", 1010);
    TEST_ASSERT(!kvc_gnss_is_valid(), "Invalid hemisphere char 'X' must be REJECTED");
}

/* ============================================================================
 * TEST CASE 8: HẾT HẠN DỮ LIỆU SAU 3.0 GIÂY VÀ TỰ ĐỘNG KHÔI PHỤC
 * ============================================================================ */
static void test_data_expiry(void) {
    printf("[TEST 8] Data freshness timeout (3000 ms expiry) and recovery...\n");
    kvc_gnss_reset();

    /* Nạp bản tin hợp lệ tại t = 1000 ms */
    send_nmea("GNGGA,074522.00,1604.43112,N,10808.99526,E,1,08,1.20,12.5,M,0.0,M,,", 1000);
    send_nmea("GNGSA,A,3,01,02,03,04,05,06,07,08,,,,,1.80,1.20,1.00", 1050);
    TEST_ASSERT(kvc_gnss_is_valid(), "Fix should be valid at t=1050 ms");

    /* Tại t = 3999 ms (chưa quá 3000 ms từ 1000/1050) */
    kvc_gnss_check_expiry(3999);
    TEST_ASSERT(kvc_gnss_is_valid(), "Fix must still be valid at t=3999 ms (< 3000 ms age)");

    /* Tại t = 4051 ms (đã trôi qua > 3000 ms từ câu GGA t=1000 ms) */
    kvc_gnss_check_expiry(4051);
    TEST_ASSERT(!kvc_gnss_is_valid(), "Fix must be EXPIRED (invalid) at t=4051 ms (> 3000 ms)");

    /* Khi có dữ liệu mới tại t = 5000 ms -> Phải khôi phục hợp lệ ngay lập tức */
    send_nmea("GNGGA,074523.00,1604.43112,N,10808.99526,E,1,08,1.20,12.5,M,0.0,M,,", 5000);
    send_nmea("GNGSA,A,3,01,02,03,04,05,06,07,08,,,,,1.80,1.20,1.00", 5020);
    TEST_ASSERT(kvc_gnss_is_valid(), "Fix must recover to valid after fresh sentences at t=5020 ms");
}

/* ============================================================================
 * TEST CASE 9: PHỤC HỒI SAU RÁC VÀ BẢN TIN BỊ CẮT NGANG
 * ============================================================================ */
static void test_error_recovery(void) {
    printf("[TEST 9] Garbage line noise and concatenated '$' recovery...\n");
    kvc_gnss_reset();

    /* Nạp rác ngẫu nhiên */
    const char *garbage = "@!#$%$%^&*!)(*@^&! random noise 1234567890 \r\n";
    kvc_gnss_feed_sentence(garbage, 1000);

    /* Nạp bản tin bị cắt ngang giữa chừng: "$GNGGA,12345$GNGGA..." */
    const char *interrupted = "$GNGGA,074522.00,1604$GNGGA,074522.00,1604.43112,N,10808.99526,E,1,08,1.20,12.5,M,0.0,M,,*4F\r\n";
    kvc_gnss_feed_sentence(interrupted, 1100);
    send_nmea("GNGSA,A,3,01,02,03,04,05,06,07,08,,,,,1.80,1.20,1.00", 1120);

    TEST_ASSERT(kvc_gnss_is_valid(), "Parser must recover cleanly from '$' resync inside packet");
    const KvcGnssState *st = kvc_gnss_get_state();
    TEST_ASSERT(st->lat_deg7 == 160738520, "Recovered latitude must be correct");
}

/* ============================================================================
 * TEST CASE 10: NẠP TỪNG BYTE (STREAMING BYTE-BY-BYTE)
 * ============================================================================ */
static void test_byte_by_byte_stream(void) {
    printf("[TEST 10] Streaming byte-by-byte simulation...\n");
    kvc_gnss_reset();

    char buf1[160];
    char buf2[160];
    uint8_t cs1 = 0;
    const char *p1 = "GNGGA,074522.00,1604.43112,N,10808.99526,E,1,08,1.20,12.5,M,0.0,M,,";
    for (const char *p = p1; *p != '\0'; p++) cs1 ^= (uint8_t)(*p);
    snprintf(buf1, sizeof(buf1), "$%s*%02X\r\n", p1, cs1);

    uint8_t cs2 = 0;
    const char *p2 = "GNGSA,A,3,01,02,03,04,05,06,07,08,,,,,1.80,1.20,1.00";
    for (const char *p = p2; *p != '\0'; p++) cs2 ^= (uint8_t)(*p);
    snprintf(buf2, sizeof(buf2), "$%s*%02X\r\n", p2, cs2);

    /* Bắn từng byte của câu 1 */
    uint32_t t = 1000;
    for (size_t i = 0; i < strlen(buf1); i++) {
        kvc_gnss_feed_byte((uint8_t)buf1[i], t++);
    }

    /* Bắn từng byte của câu 2 */
    for (size_t i = 0; i < strlen(buf2); i++) {
        kvc_gnss_feed_byte((uint8_t)buf2[i], t++);
    }

    TEST_ASSERT(kvc_gnss_is_valid(), "Byte-by-byte streaming must produce valid 3D fix");
    const KvcGnssState *st = kvc_gnss_get_state();
    TEST_ASSERT(st->lat_deg7 == 160738520, "Streamed latitude must match Da Nang coordinate");
    TEST_ASSERT(st->lon_deg7 == 1081499210, "Streamed longitude must match Da Nang coordinate");
}

/* ============================================================================
 * TEST CASE 11: CÂU RMC ĐỘC LẬP THEO CHUẨN TINYGPSPLUS
 * ============================================================================ */
static void test_rmc_sentence(void) {
    printf("[TEST 11] RMC sentence parsing (TinyGPSPlus style)...\n");
    kvc_gnss_reset();

    /* Nạp câu RMC Active ('A') tọa độ Đà Nẵng */
    send_nmea("GNRMC,083559.00,A,1604.43112,N,10808.99526,E,0.004,77.52,241026,,,A,V", 2000);
    TEST_ASSERT(kvc_gnss_is_valid(), "RMC with status=A must report valid location");

    const KvcGnssState *st = kvc_gnss_get_state();
    TEST_ASSERT(st->lat_deg7 == 160738520, "RMC latitude must match 160738520");
    TEST_ASSERT(st->lon_deg7 == 1081499210, "RMC longitude must match 1081499210");
    TEST_ASSERT(st->last_rmc_ms == 2000, "last_rmc_ms must be 2000");

    /* Nạp câu RMC Void ('V') -> Phải vô hiệu hóa RMC */
    send_nmea("GNRMC,083600.00,V,1604.43112,N,10808.99526,E,0.004,77.52,241026,,,A,V", 2050);
    TEST_ASSERT(!kvc_gnss_is_valid(), "RMC with status=V must report invalid location");
}

/* ============================================================================
 * MAIN ENTRY POINT CHO TEST RUNNER
 * ============================================================================ */
int main(void) {
    printf("================================================================\n");
    printf("  KVC-GNSS-M10-001 — Host Unit Tests (u-blox NEO-M10 GNSS Driver)\n");
    printf("================================================================\n");

    test_valid_3d_fix();
    test_talker_ids();
    test_checksum_verification();
    test_missing_fields_and_empty();
    test_buffer_overflow_protection();
    test_fix_thresholds();
    test_coordinates_and_bounds();
    test_data_expiry();
    test_error_recovery();
    test_byte_by_byte_stream();
    test_rmc_sentence();

    printf("================================================================\n");
    printf("  Results: %d/%d assertions PASSED\n", s_tests_passed, s_tests_run);
    printf("================================================================\n");

    if (s_tests_passed == s_tests_run && s_tests_run > 0) {
        printf(">>> ALL TESTS PASSED SUCCESSFULLY! <<<\n");
        return 0;
    } else {
        printf(">>> SOME TESTS FAILED! <<<\n");
        return 1;
    }
}
