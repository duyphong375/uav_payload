/**
 * @file test_kvc_telemetry.c
 * @brief Host Unit Test cho ABI IF-02 (KVC-MCU-TELEMETRY-TEST-001).
 *
 * VÌ SAO CẦN: layout 32 byte được khoá bằng static_assert trong header, nhưng
 * không có test NÀO chạy tới. Bản self-check GV-02 trên MCU lại nằm trong
 * `#if (KVC_M1_CLOCK_DIAG == 1)` mà macro đó mặc định 0, nên bản bench thực tế
 * không hề tự kiểm ABI lúc boot. Test này bù cả hai lỗ hổng ở phía host.
 *
 * Phủ:
 *   1. sizeof == 32
 *   2. 15 offset trường khớp bảng IF-02
 *   3. Hằng số RF (freq/sync/bw/sf/cr) khớp đặc tả
 *   4. CRC-16/CCITT-FALSE với vector chuẩn
 *   5. CRC thay đổi khi đảo 1 bit
 *   6. GV-02 khớp toàn bộ trường + CRC 0xE260 (byte 25 reserved = 0)
 *   7. GV-02 phát hiện lệch từng trường
 *   8. Little-Endian trên dây (byte thấp trước)
 *   9. Class ID: LIFEBUOY là tên chuẩn, BOAT là alias
 *  10. Cờ sensor_flags đúng bit
 *
 * Người phụ trách: Nguyễn Tá Duy Phong
 */

#define KVC_HOST_TEST 1

#include "kvc_telemetry.h"
#include <stdio.h>
#include <string.h>

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

/* Dựng đúng GV-02 như IF-02 mục 3 mô tả (đã bỏ đo pin: byte 25 = 0). */
static void build_gv02(KvcTelemetryPacket32 *pkt) {
    memset(pkt, 0, sizeof(*pkt));
    pkt->msg_id          = KVC_MSG_ID_TELEMETRY;
    pkt->seq_num         = 42U;
    pkt->timestamp_ms    = 1000UL;
    pkt->target_lat      = 107723450L;
    pkt->target_lon      = 1066578900L;
    pkt->target_x_local  = 150;
    pkt->target_y_local  = 320;
    pkt->alt_dist_cm     = 240U;
    pkt->class_id        = KVC_CLASS_ID_PERSON;
    pkt->confidence      = 92U;
    pkt->sensor_flags    = 0x0FU;
    pkt->status_reserved = 0U;
    kvc_finalize_telemetry_packet(pkt);
}

/* ============================================================================
 * TEST 1-2: KÍCH THƯỚC VÀ OFFSET
 * ============================================================================ */
static void test_layout(void) {
    printf("[TEST 1-2] Kich thuoc 32 byte va 15 offset IF-02...\n");

    TEST_ASSERT(sizeof(KvcTelemetryPacket32) == 32U, "sizeof phai bang 32");
    TEST_ASSERT(KVC_TELEMETRY_PACKET_SIZE == 32U, "hang so packet size = 32");
    TEST_ASSERT(KVC_TELEMETRY_CRC_COVERAGE == 30U, "CRC coverage = 30");

    TEST_ASSERT(offsetof(KvcTelemetryPacket32, sync)          == 0U,  "sync @0");
    TEST_ASSERT(offsetof(KvcTelemetryPacket32, msg_id)        == 2U,  "msg_id @2");
    TEST_ASSERT(offsetof(KvcTelemetryPacket32, seq_num)       == 3U,  "seq_num @3");
    TEST_ASSERT(offsetof(KvcTelemetryPacket32, timestamp_ms)  == 4U,  "timestamp @4");
    TEST_ASSERT(offsetof(KvcTelemetryPacket32, target_lat)    == 8U,  "target_lat @8");
    TEST_ASSERT(offsetof(KvcTelemetryPacket32, target_lon)    == 12U, "target_lon @12");
    TEST_ASSERT(offsetof(KvcTelemetryPacket32, target_x_local)== 16U, "x_local @16");
    TEST_ASSERT(offsetof(KvcTelemetryPacket32, target_y_local)== 18U, "y_local @18");
    TEST_ASSERT(offsetof(KvcTelemetryPacket32, alt_dist_cm)   == 20U, "alt_dist @20");
    TEST_ASSERT(offsetof(KvcTelemetryPacket32, class_id)      == 22U, "class_id @22");
    TEST_ASSERT(offsetof(KvcTelemetryPacket32, confidence)    == 23U, "confidence @23");
    TEST_ASSERT(offsetof(KvcTelemetryPacket32, sensor_flags)  == 24U, "flags @24");
    TEST_ASSERT(offsetof(KvcTelemetryPacket32, status_reserved) == 25U, "status_reserved @25");
    TEST_ASSERT(offsetof(KvcTelemetryPacket32, reserved)      == 26U, "reserved @26");
    TEST_ASSERT(offsetof(KvcTelemetryPacket32, crc16)         == 30U, "crc16 @30");
}

/* ============================================================================
 * TEST 3: HẰNG SỐ RF
 * ============================================================================ */
static void test_rf_constants(void) {
    printf("[TEST 3] Hang so RF khop dac ta IF-02...\n");

    TEST_ASSERT(KVC_LORA_FREQ_HZ == 433000000UL, "433.0 MHz");
    TEST_ASSERT(KVC_LORA_SYNC_WORD == 0x12, "sync word 0x12");
    TEST_ASSERT(KVC_LORA_BANDWIDTH_HZ == 125000, "BW 125 kHz");
    TEST_ASSERT(KVC_LORA_SPREADING_FACTOR == 7, "SF7");
    TEST_ASSERT(KVC_LORA_CODING_RATE_DENOM == 5, "CR 4/5");
    TEST_ASSERT(KVC_TELEMETRY_SYNC0 == 0xAA, "sync0 0xAA");
    TEST_ASSERT(KVC_TELEMETRY_SYNC1 == 0x55, "sync1 0x55");
}

/* ============================================================================
 * TEST 4-5: CRC
 * ============================================================================ */
static void test_crc(void) {
    static const uint8_t kCheck[] = "123456789";
    KvcTelemetryPacket32 a;
    KvcTelemetryPacket32 b;
    uint16_t crc_a;
    uint16_t crc_b;

    printf("[TEST 4-5] CRC-16/CCITT-FALSE...\n");

    /* Vector chuẩn của CRC-16/CCITT-FALSE: "123456789" -> 0x29B1. */
    TEST_ASSERT(kvc_calculate_crc16(kCheck, 9U) == 0x29B1U,
                "vector chuan \"123456789\" -> 0x29B1");

    build_gv02(&a);
    crc_a = a.crc16;
    TEST_ASSERT(crc_a == KVC_GOLDEN_GV02_CRC16, "GV-02 CRC = 0xE260");

    /* Đảo 1 bit ở payload -> CRC phải khác. */
    b = a;
    b.confidence ^= 0x01U;
    kvc_finalize_telemetry_packet(&b);
    crc_b = b.crc16;
    TEST_ASSERT(crc_b != crc_a, "dao 1 bit -> CRC doi");

    /* Lưu LE: byte thấp trước. */
    {
        const uint8_t *raw = (const uint8_t *)&a;
        TEST_ASSERT(raw[30] == (uint8_t)(crc_a & 0xFFU), "crc low byte @30");
        TEST_ASSERT(raw[31] == (uint8_t)((crc_a >> 8) & 0xFFU), "crc high byte @31");
    }
}

/* ============================================================================
 * TEST 6: GV-02 KHỚP
 * ============================================================================ */
static void test_golden_vector(void) {
    KvcTelemetryPacket32 pkt;

    printf("[TEST 6] Golden vector GV-02...\n");

    build_gv02(&pkt);

    TEST_ASSERT(pkt.sync[0] == 0xAAU && pkt.sync[1] == 0x55U, "sync AA 55");
    TEST_ASSERT(pkt.msg_id == KVC_MSG_ID_TELEMETRY, "msg_id = 0x01");
    TEST_ASSERT(pkt.seq_num == 42U, "seq = 42");
    TEST_ASSERT(pkt.timestamp_ms == 1000UL, "timestamp = 1000");
    TEST_ASSERT(pkt.target_lat == 107723450L, "lat = 107723450");
    TEST_ASSERT(pkt.target_lon == 1066578900L, "lon = 1066578900");
    TEST_ASSERT(pkt.class_id == KVC_CLASS_ID_PERSON, "class = person");
    TEST_ASSERT(pkt.confidence == 92U, "confidence = 92");
    TEST_ASSERT(pkt.sensor_flags == 0x0FU, "flags = 0x0F");
    TEST_ASSERT(pkt.status_reserved == 0U, "status_reserved = 0 (da bo do pin)");

    TEST_ASSERT(kvc_telemetry_match_golden_gv02(&pkt), "match_golden tra true");
    TEST_ASSERT(!kvc_telemetry_match_golden_gv02(NULL), "NULL -> false");

    /* So sánh với chuỗi hex trong IF-02 mục 3 để bắt lệch endian. */
    {
        static const uint8_t kExpected[32] = {
            0xAA, 0x55, 0x01, 0x2A,
            0xE8, 0x03, 0x00, 0x00,
            0xBA, 0xBA, 0x6B, 0x06,
            0xD4, 0xB3, 0x92, 0x3F,
            0x96, 0x00, 0x40, 0x01,
            0xF0, 0x00, 0x01, 0x5C,
            0x0F, 0x00, 0x00, 0x00,
            0x00, 0x00, 0x60, 0xE2,
        };
        TEST_ASSERT(memcmp(&pkt, kExpected, sizeof(kExpected)) == 0,
                    "byte-for-byte khop GV-02 trong IF-02");
    }
}

/* ============================================================================
 * TEST 7: PHÁT HIỆN LỆCH
 * ============================================================================ */
static void test_golden_detects_mismatch(void) {
    KvcTelemetryPacket32 pkt;

    printf("[TEST 7] GV-02 phat hien lech tung truong...\n");

    build_gv02(&pkt);
    pkt.seq_num = 43U;
    TEST_ASSERT(!kvc_telemetry_match_golden_gv02(&pkt), "seq sai -> khong khop");

    build_gv02(&pkt);
    pkt.sensor_flags = 0x07U;
    TEST_ASSERT(!kvc_telemetry_match_golden_gv02(&pkt), "flags sai -> khong khop");

    build_gv02(&pkt);
    pkt.crc16 ^= 0x0001U;
    TEST_ASSERT(!kvc_telemetry_match_golden_gv02(&pkt), "crc sai -> khong khop");

    build_gv02(&pkt);
    pkt.sync[0] = 0x00U;
    TEST_ASSERT(!kvc_telemetry_match_golden_gv02(&pkt), "sync sai -> khong khop");
}

/* ============================================================================
 * TEST 8: LITTLE-ENDIAN TRÊN DÂY
 * ============================================================================ */
static void test_little_endian(void) {
    KvcTelemetryPacket32 pkt;
    const uint8_t *raw;

    printf("[TEST 8] Little-Endian tren duong truyen...\n");

    build_gv02(&pkt);
    raw = (const uint8_t *)&pkt;

    /* timestamp_ms = 1000 = 0x000003E8 -> e8 03 00 00 */
    TEST_ASSERT(raw[4] == 0xE8U && raw[5] == 0x03U &&
                raw[6] == 0x00U && raw[7] == 0x00U,
                "timestamp 1000 -> e8 03 00 00");

    /* alt_dist_cm = 240 = 0x00F0 -> f0 00 */
    TEST_ASSERT(raw[20] == 0xF0U && raw[21] == 0x00U, "alt 240 -> f0 00");

    /* target_x_local = 150 = 0x0096 -> 96 00 */
    TEST_ASSERT(raw[16] == 0x96U && raw[17] == 0x00U, "x_local 150 -> 96 00");
}

/* ============================================================================
 * TEST 9-10: CLASS ID VÀ CỜ
 * ============================================================================ */
static void test_class_and_flags(void) {
    printf("[TEST 9-10] Class ID va sensor flags...\n");

    TEST_ASSERT(KVC_CLASS_ID_NONE == 0, "NONE = 0");
    TEST_ASSERT(KVC_CLASS_ID_PERSON == 1, "PERSON = 1");
    TEST_ASSERT(KVC_CLASS_ID_LIFEBUOY == 2, "LIFEBUOY = 2");
    TEST_ASSERT(KVC_CLASS_ID_BOAT == KVC_CLASS_ID_LIFEBUOY,
                "BOAT la alias cua LIFEBUOY");

    TEST_ASSERT(KVC_FLAG_GNSS_VALID == (1U << 0), "GNSS flag bit 0");
    TEST_ASSERT(KVC_FLAG_ALT_VALID == (1U << 1), "ALT flag bit 1");
    TEST_ASSERT(KVC_FLAG_IMU_VALID == (1U << 2), "IMU flag bit 2");
    TEST_ASSERT(KVC_FLAG_AI_DETECTED == (1U << 3), "AI flag bit 3");

    /* 4 bit thấp dùng hết, bit 4..7 còn trống — chỗ đề xuất cho
     * TARGET_POS_VALID nếu sau này IF-02 được duyệt đổi. */
    TEST_ASSERT((KVC_FLAG_GNSS_VALID | KVC_FLAG_ALT_VALID |
                 KVC_FLAG_IMU_VALID | KVC_FLAG_AI_DETECTED) == 0x0FU,
                "4 co hien dung = 0x0F, bit 4..7 con trong");
}

int main(void) {
    printf("================================================================\n");
    printf("  KVC - HOST TEST: ABI IF-02 TELEMETRY (32 BYTE)\n");
    printf("================================================================\n\n");

    test_layout();
    test_rf_constants();
    test_crc();
    test_golden_vector();
    test_golden_detects_mismatch();
    test_little_endian();
    test_class_and_flags();

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
