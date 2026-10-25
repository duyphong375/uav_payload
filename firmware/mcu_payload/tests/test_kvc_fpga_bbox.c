/**
 * @file test_kvc_fpga_bbox.c
 * @brief Host Unit Test cho Driver thu nhận và giải mã BBox FPGA qua UART1 (IF-01).
 *
 * Kiểm tra các tính năng:
 * 1. Tiếp nhận và bóc tách đúng frame 1 BBox (Người tại tâm ảnh 320, 240).
 * 2. Tiếp nhận frame đa mục tiêu (2 BBox: Người + Phao) và tìm mục tiêu ưu tiên.
 * 3. Tiếp nhận frame rỗng (Count = 0).
 * 4. Phát hiện và loại bỏ frame sai mã CRC-16.
 * 5. Tự phục hồi và đồng bộ lại khi có byte rác chèn phía trước.
 * 6. Kiểm tra hạn định thời (Timeout 2.0s) tự động hạ cờ valid.
 *
 * Tác giả: Nguyễn Tá Duy Phong
 */

#define KVC_HOST_TEST 1

#include "kvc_fpga_bbox.h"
#include <stdio.h>
#include <stdlib.h>
#include <string.h>

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

static uint16_t calc_crc16(const uint8_t *data, size_t length) {
    uint16_t crc = 0xFFFFU;
    size_t i;
    uint8_t bit;
    for (i = 0; i < length; i++) {
        crc ^= (uint16_t)((uint16_t)data[i] << 8);
        for (bit = 0; bit < 8; bit++) {
            if (crc & 0x8000U) {
                crc = (uint16_t)(((uint32_t)crc << 1) ^ 0x1021U);
            } else {
                crc = (uint16_t)((uint32_t)crc << 1);
            }
        }
    }
    return crc;
}

static void feed_bytes(const uint8_t *data, size_t len, uint32_t now_ms) {
    for (size_t i = 0; i < len; i++) {
        kvc_fpga_bbox_feed_byte(data[i], now_ms);
    }
}

/* ============================================================================
 * TEST 1: Frame chuẩn 1 BBox (Person)
 * ============================================================================ */
static void test_single_person_bbox(void) {
    kvc_fpga_bbox_reset();

    /* Header: 0x5A, 0xA5, Ver=1, Count=1, Time=1000ms */
    uint8_t frame[18] = {
        0x5A, 0xA5, 0x01, 0x01,
        0xE8, 0x03, 0x00, 0x00, /* 1000 ms Little-Endian */
        /* BBox 0: X=320 (0x0140), Y=240 (0x00F0), W=45, H=65, Class=1, Conf=95 */
        0x40, 0x01, 0xF0, 0x00, 45, 65, 0x01, 95,
        0x00, 0x00 /* CRC-16 placeholder */
    };

    uint16_t crc = calc_crc16(frame, 16);
    frame[16] = (uint8_t)(crc & 0xFF);
    frame[17] = (uint8_t)((crc >> 8) & 0xFF);

    feed_bytes(frame, sizeof(frame), 1000);

    TEST_ASSERT(kvc_fpga_bbox_is_valid() == true, "Test 1: Frame 1 BBox hop le");
    const KvcFpgaFrameState *st = kvc_fpga_bbox_get_state();
    TEST_ASSERT(st->candidate_count == 1, "Test 1: Candidate count == 1");
    TEST_ASSERT(st->timestamp_ms == 1000, "Test 1: Timestamp == 1000");
    TEST_ASSERT(st->targets[0].x_center == 320, "Test 1: X_center == 320");
    TEST_ASSERT(st->targets[0].y_center == 240, "Test 1: Y_center == 240");
    TEST_ASSERT(st->targets[0].class_id == KVC_FPGA_CLASS_PERSON, "Test 1: Class == Person");
    TEST_ASSERT(st->targets[0].confidence == 95, "Test 1: Confidence == 95");

    const KvcFpgaBBoxItem *primary = kvc_fpga_bbox_get_primary_target();
    TEST_ASSERT(primary != NULL, "Test 1: Primary target not NULL");
    if (primary != NULL) {
        TEST_ASSERT(primary->class_id == 1, "Test 1: Primary target is Person");
    }
}

/* ============================================================================
 * TEST 2: Frame đa mục tiêu (2 BBox) và chọn mục tiêu ưu tiên
 * ============================================================================ */
static void test_multi_target_bbox(void) {
    kvc_fpga_bbox_reset();

    /* Header: 0x5A, 0xA5, Ver=1, Count=2, Time=2000ms */
    uint8_t frame[26] = {
        0x5A, 0xA5, 0x01, 0x02,
        0xD0, 0x07, 0x00, 0x00, /* 2000 ms */
        /* BBox 0: Person tại (310, 230), Conf = 85 */
        0x36, 0x01, 0xE6, 0x00, 40, 60, 0x01, 85,
        /* BBox 1: Lifebuoy tại (380, 270), Conf = 98 */
        0x7C, 0x01, 0x0E, 0x01, 35, 35, 0x02, 98,
        0x00, 0x00 /* CRC placeholder */
    };

    uint16_t crc = calc_crc16(frame, 24);
    frame[24] = (uint8_t)(crc & 0xFF);
    frame[25] = (uint8_t)((crc >> 8) & 0xFF);

    feed_bytes(frame, sizeof(frame), 2000);

    TEST_ASSERT(kvc_fpga_bbox_is_valid() == true, "Test 2: Frame 2 BBox hop le");
    const KvcFpgaFrameState *st = kvc_fpga_bbox_get_state();
    TEST_ASSERT(st->candidate_count == 2, "Test 2: Candidate count == 2");

    /* Mục tiêu ưu tiên phải là Lifebuoy vì có Conf = 98 > 85 */
    const KvcFpgaBBoxItem *primary = kvc_fpga_bbox_get_primary_target();
    TEST_ASSERT(primary != NULL, "Test 2: Primary target not NULL");
    if (primary != NULL) {
        TEST_ASSERT(primary->class_id == KVC_FPGA_CLASS_LIFEBUOY, "Test 2: Primary target is Lifebuoy (Conf 98%)");
        TEST_ASSERT(primary->confidence == 98, "Test 2: Primary confidence == 98");
    }
}

/* ============================================================================
 * TEST 3: Frame rỗng (Count = 0)
 * ============================================================================ */
static void test_empty_frame(void) {
    kvc_fpga_bbox_reset();

    /* Header: 0x5A, 0xA5, Ver=1, Count=0, Time=3000ms */
    uint8_t frame[10] = {
        0x5A, 0xA5, 0x01, 0x00,
        0xB8, 0x0B, 0x00, 0x00,
        0x00, 0x00
    };

    uint16_t crc = calc_crc16(frame, 8);
    frame[8] = (uint8_t)(crc & 0xFF);
    frame[9] = (uint8_t)((crc >> 8) & 0xFF);

    feed_bytes(frame, sizeof(frame), 3000);

    TEST_ASSERT(kvc_fpga_bbox_is_valid() == true, "Test 3: Frame trong hop le");
    const KvcFpgaFrameState *st = kvc_fpga_bbox_get_state();
    TEST_ASSERT(st->candidate_count == 0, "Test 3: Candidate count == 0");
    TEST_ASSERT(kvc_fpga_bbox_get_primary_target() == NULL, "Test 3: Primary target is NULL when count == 0");
}

/* ============================================================================
 * TEST 4: Phát hiện lỗi CRC-16
 * ============================================================================ */
static void test_crc_error(void) {
    kvc_fpga_bbox_reset();

    uint8_t frame[18] = {
        0x5A, 0xA5, 0x01, 0x01,
        0xE8, 0x03, 0x00, 0x00,
        0x40, 0x01, 0xF0, 0x00, 45, 65, 0x01, 95,
        0xDE, 0xAD /* Sai CRC */
    };

    feed_bytes(frame, sizeof(frame), 4000);

    TEST_ASSERT(kvc_fpga_bbox_is_valid() == false, "Test 4: Tu choi frame sai CRC");
    const KvcFpgaFrameState *st = kvc_fpga_bbox_get_state();
    TEST_ASSERT(st->crc_err_count == 1, "Test 4: crc_err_count tang len 1");
}

/* ============================================================================
 * TEST 5: Phục hồi khi có byte rác phía trước
 * ============================================================================ */
static void test_resync_with_noise(void) {
    kvc_fpga_bbox_reset();

    uint8_t noise_and_frame[25] = {
        0xFF, 0x00, 0x5A, 0x77, 0x5A, /* Byte rac va Sync0 gia */
        0x5A, 0xA5, 0x01, 0x01,        /* Sync that */
        0xE8, 0x03, 0x00, 0x00,
        0x40, 0x01, 0xF0, 0x00, 45, 65, 0x01, 95,
        0x00, 0x00
    };

    uint16_t crc = calc_crc16(&noise_and_frame[5], 16);
    noise_and_frame[21] = (uint8_t)(crc & 0xFF);
    noise_and_frame[22] = (uint8_t)((crc >> 8) & 0xFF);

    feed_bytes(noise_and_frame, 23, 5000);

    TEST_ASSERT(kvc_fpga_bbox_is_valid() == true, "Test 5: Dong bo lai thanh cong khi co rac");
    const KvcFpgaFrameState *st = kvc_fpga_bbox_get_state();
    TEST_ASSERT(st->candidate_count == 1, "Test 5: Nhan dung 1 BBox sau rac");
}

/* ============================================================================
 * TEST 6: Hạn định thời (Timeout 2.0 giây)
 * ============================================================================ */
static void test_timeout_expiry(void) {
    test_single_person_bbox();
    TEST_ASSERT(kvc_fpga_bbox_is_valid() == true, "Test 6: Valid truoc khi timeout");

    /* Sau 1.5 giây: van con trong han */
    kvc_fpga_bbox_check_expiry(2500);
    TEST_ASSERT(kvc_fpga_bbox_is_valid() == true, "Test 6: Van valid sau 1.5s");

    /* Sau 2.1 giây (3101 ms so voi 1000 ms): qua han 2.0s */
    kvc_fpga_bbox_check_expiry(3101);
    TEST_ASSERT(kvc_fpga_bbox_is_valid() == false, "Test 6: Tu dong ha co valid sau 2.1s");
}

int main(void) {
    printf("==================================================================\n");
    printf("  KVC - UNIT TEST: DRIVER THU BBOX FPGA UART1 (IF-01)\n");
    printf("==================================================================\n");

    test_single_person_bbox();
    test_multi_target_bbox();
    test_empty_frame();
    test_crc_error();
    test_resync_with_noise();
    test_timeout_expiry();

    printf("\n------------------------------------------------------------------\n");
    printf("  KET QUA: %d / %d tests PASS\n", s_tests_passed, s_tests_run);
    printf("==================================================================\n");

    return (s_tests_passed == s_tests_run) ? 0 : 1;
}
