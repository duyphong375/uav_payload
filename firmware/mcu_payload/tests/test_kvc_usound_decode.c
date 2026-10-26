/**
 * @file test_kvc_usound_decode.c
 * @brief Host Unit Test cho bộ giải mã khung 4 byte AJ-SR04M (KVC-MCU-1.2).
 *
 * Kiểm thử THUẦN LOGIC, không cần board, không cần UART2. Biên dịch bằng gcc:
 *   gcc -Wall -Wextra -O2 -std=c99 -DKVC_HOST_TEST=1 -Ifirmware/mcu_payload/inc \
 *       firmware/mcu_payload/src/sensors/kvc_usound_decode.c \
 *       firmware/mcu_payload/tests/test_kvc_usound_decode.c \
 *       -o test_kvc_usound_decode.exe
 *
 * Bộ ca kiểm thử (theo KVC_PHAN_CONG_2_NGUOI.md §1.2, mở rộng thêm các ca
 * biên đã từng gây lỗi thật trên kit):
 *   1. Khung tốt 1000 mm -> OK, cm = 100
 *   2. Checksum sai      -> BAD_CHECKSUM, không cập nhật giá trị
 *   3. No-Echo 6000 mm   -> FRAME_NO_ECHO
 *   4. Vùng mù 100 mm    -> FRAME_BLIND_ZONE
 *   5. Rác chèn giữa khung -> bắt lại đúng từ header thứ hai
 *   6. Khung 511 mm `FF 01 FF FF` -> OK, không làm lệch khung kế tiếp
 *   7. Ngoài dải 5,5 m   -> FRAME_OUT_OF_RANGE
 *   8. Giá trị > 6000 mm -> BAD_CHECKSUM (bộ lọc miễn phí)
 *   9. Chuỗi nhiều khung liên tiếp -> số khung đúng
 *  10. Nhiễu 0xFF lặp ở vị trí Data_H -> không mất khung
 *  11. Byte đơn lẻ không đủ khung -> NONE
 *  12. Reset giữa khung -> khung sau vẫn giải mã đúng
 *  13. Ánh xạ kết quả sang mã lỗi driver
 *
 * Tác giả: Nguyễn Tá Duy Phong
 */

#define KVC_HOST_TEST 1

#include "kvc_usound_decode.h"
#include <stdio.h>

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

static uint8_t cs_of(uint8_t h, uint8_t l) {
    return (uint8_t)((uint16_t)KVC_USOUND_FRAME_HEADER + (uint16_t)h + (uint16_t)l);
}

/* Nạp cả khung, trả về kết quả của byte cuối (byte checksum). */
static KvcUsoundFrameResult feed_frame(KvcUsoundDecoder *dec, uint8_t h, uint8_t l,
                                       uint8_t cs, uint16_t *out_mm) {
    KvcUsoundFrameResult r = KVC_USOUND_FRAME_NONE;
    (void)kvc_usound_decode_byte(dec, 0xFFU, out_mm);
    (void)kvc_usound_decode_byte(dec, h, out_mm);
    (void)kvc_usound_decode_byte(dec, l, out_mm);
    r = kvc_usound_decode_byte(dec, cs, out_mm);
    return r;
}

static void feed_frame_ok(KvcUsoundDecoder *dec, uint8_t h, uint8_t l, uint16_t *out_mm) {
    (void)feed_frame(dec, h, l, cs_of(h, l), out_mm);
}

/* ============================================================================
 * TEST 1: Khung tốt 1000 mm
 * ============================================================================ */
static void test_good_frame(void) {
    KvcUsoundDecoder dec;
    uint16_t mm = 0U;
    KvcUsoundFrameResult r;

    printf("[1] Khung tot 1000 mm (FF 03 E8 EA)\n");
    kvc_usound_decode_reset(&dec);

    TEST_ASSERT(kvc_usound_decode_byte(&dec, 0xFFU, &mm) == KVC_USOUND_FRAME_NONE, "header chua du khung");
    TEST_ASSERT(kvc_usound_decode_byte(&dec, 0x03U, &mm) == KVC_USOUND_FRAME_NONE, "data_h chua du khung");
    TEST_ASSERT(kvc_usound_decode_byte(&dec, 0xE8U, &mm) == KVC_USOUND_FRAME_NONE, "data_l chua du khung");
    r = kvc_usound_decode_byte(&dec, cs_of(0x03U, 0xE8U), &mm);

    TEST_ASSERT(r == KVC_USOUND_FRAME_OK, "khung dung phai OK");
    TEST_ASSERT(mm == 1000U, "mm phai bang 1000");
    TEST_ASSERT(kvc_usound_result_to_err(r) == KVC_USOUND_OK, "ma loi phai OK");
    /* 0xFF + 0x03 + 0xE8 = 0x1EA -> 0xEA. Lưu ý: tài liệu planning cũ ghi
     * "FF 03 E8 01" là SAI; khung 1000 mm thật phải có checksum 0xEA. */
    TEST_ASSERT(cs_of(0x03U, 0xE8U) == 0xEAU, "checksum khung 1000 mm phai la 0xEA");

    /* Sau khung, trạng thái phải về HEADER: byte rác 0x00 không được làm gì. */
    TEST_ASSERT(kvc_usound_decode_byte(&dec, 0x00U, &mm) == KVC_USOUND_FRAME_NONE, "ve HEADER sau khung");
}

/* ============================================================================
 * TEST 2: Checksum sai
 * ============================================================================ */
static void test_bad_checksum(void) {
    KvcUsoundDecoder dec;
    uint16_t mm = 0xFFFFU;
    KvcUsoundFrameResult r;

    printf("[2] Sai checksum (FF 03 E8 FF)\n");
    kvc_usound_decode_reset(&dec);
    r = feed_frame(&dec, 0x03U, 0xE8U, 0xFFU, &mm);

    TEST_ASSERT(r == KVC_USOUND_FRAME_BAD_CHECKSUM, "phai bao BAD_CHECKSUM");
    TEST_ASSERT(mm == 0xFFFFU, "khong duoc ghi mm khi checksum sai");
    TEST_ASSERT(kvc_usound_result_to_err(r) == KVC_USOUND_ERR_CHECKSUM, "ma loi phai CHECKSUM");

    /* Khung tốt ngay sau đó phải được nhận (checksum sai không làm kẹt FSM). */
    feed_frame_ok(&dec, 0x03U, 0xE8U, &mm);
    TEST_ASSERT(mm == 1000U, "khung tot sau loi phai giai ma duoc");
}

/* ============================================================================
 * TEST 3: No-Echo 6000 mm
 * ============================================================================ */
static void test_no_echo(void) {
    KvcUsoundDecoder dec;
    uint16_t mm = 0U;
    KvcUsoundFrameResult r;

    printf("[3] No-Echo 6000 mm (FF 17 70 86)\n");
    kvc_usound_decode_reset(&dec);
    TEST_ASSERT(cs_of(0x17U, 0x70U) == 0x86U, "checksum mau no-echo phai la 0x86");

    r = feed_frame(&dec, 0x17U, 0x70U, 0x86U, &mm);

    TEST_ASSERT(r == KVC_USOUND_FRAME_NO_ECHO, "phai bao NO_ECHO");
    TEST_ASSERT(mm == 6000U, "mm tho phai la 6000");
    TEST_ASSERT(kvc_usound_result_to_err(r) == KVC_USOUND_ERR_NO_ECHO, "ma loi phai NO_ECHO (5)");
}

/* ============================================================================
 * TEST 4: Vùng mù 100 mm
 * ============================================================================ */
static void test_blind_zone(void) {
    KvcUsoundDecoder dec;
    uint16_t mm = 0U;
    KvcUsoundFrameResult r;

    printf("[4] Vung mu 100 mm (FF 00 64 63)\n");
    kvc_usound_decode_reset(&dec);
    r = feed_frame(&dec, 0x00U, 0x64U, cs_of(0x00U, 0x64U), &mm);

    TEST_ASSERT(r == KVC_USOUND_FRAME_BLIND_ZONE, "phai bao BLIND_ZONE");
    TEST_ASSERT(mm == 100U, "mm tho phai la 100");
    TEST_ASSERT(kvc_usound_result_to_err(r) == KVC_USOUND_ERR_BLIND_ZONE, "ma loi phai BLIND_ZONE (4)");

    /* Biên dưới đúng 200 mm phải là OK (dải 20..500 cm). */
    feed_frame_ok(&dec, 0x00U, 0xC8U, &mm);
    TEST_ASSERT(mm == 200U, "200 mm phai nam trong dai");
}

/* ============================================================================
 * TEST 5: Rác trước khung + phục hồi sau khung bị cắt
 * ============================================================================ */
static void test_garbage_and_truncation(void) {
    KvcUsoundDecoder dec;
    uint16_t mm = 0U;
    KvcUsoundFrameResult r;
    int i;

    printf("[5] Rac truoc khung va phuc hoi sau khung bi cat\n");
    kvc_usound_decode_reset(&dec);

    /* (a) Byte rác KHÁC 0xFF trước header: FSM ở HEADER nên bỏ qua sạch. */
    TEST_ASSERT(kvc_usound_decode_byte(&dec, 0x00U, &mm) == KVC_USOUND_FRAME_NONE, "rac 0x00 -> NONE");
    TEST_ASSERT(kvc_usound_decode_byte(&dec, 0x5AU, &mm) == KVC_USOUND_FRAME_NONE, "rac 0x5A -> NONE");
    TEST_ASSERT(kvc_usound_decode_byte(&dec, 0x13U, &mm) == KVC_USOUND_FRAME_NONE, "rac 0x13 -> NONE");
    r = feed_frame(&dec, 0x03U, 0xE8U, cs_of(0x03U, 0xE8U), &mm);
    TEST_ASSERT(r == KVC_USOUND_FRAME_OK, "khung sau rac phai OK");
    TEST_ASSERT(mm == 1000U, "gia tri phai la 1000");

    /* (b) GIỚI HẠN ĐÃ BIẾT: khung bị CẮT (mất byte Data_L và checksum) làm FSM
     * tiêu thụ header của khung kế tiếp, nên mất đúng 1 khung. Sau đó tự đồng
     * bộ lại. Đây là hành vi thật của FSM 4 byte không có escape; test ghi nhận
     * để không ai tưởng nó phục hồi tức thì. */
    kvc_usound_decode_reset(&dec);
    (void)kvc_usound_decode_byte(&dec, 0xFFU, &mm);   /* header */
    (void)kvc_usound_decode_byte(&dec, 0x03U, &mm);   /* data_h, rồi khung bị cắt */

    /* Khung kế tiếp bị mất do lệch pha (byte 0xFF của nó bị dùng làm Data_L). */
    r = feed_frame(&dec, 0x03U, 0xE8U, cs_of(0x03U, 0xE8U), &mm);
    TEST_ASSERT(r != KVC_USOUND_FRAME_OK, "khung ngay sau khung bi cat bi mat (gioi han da biet)");

    /* Khung thứ ba phải giải mã lại được bình thường. */
    for (i = 0; i < 2; i++) {
        (void)feed_frame(&dec, 0x03U, 0xE8U, cs_of(0x03U, 0xE8U), &mm);
    }
    TEST_ASSERT(mm == 1000U, "FSM phai tu dong bo lai trong 2 khung");
}

/* ============================================================================
 * TEST 6: Khung có checksum 0xFF (FF 01 FF FF) — từng gây lệch khung
 * ============================================================================ */
static void test_ff_checksum_frame(void) {
    KvcUsoundDecoder dec;
    uint16_t mm = 0U;
    KvcUsoundFrameResult r;

    printf("[6] Khung 511 mm co checksum 0xFF (FF 01 FF FF)\n");
    kvc_usound_decode_reset(&dec);
    TEST_ASSERT(cs_of(0x01U, 0xFFU) == 0xFFU, "checksum cua 511 mm phai la 0xFF");

    r = feed_frame(&dec, 0x01U, 0xFFU, 0xFFU, &mm);
    TEST_ASSERT(r == KVC_USOUND_FRAME_OK, "511 mm phai OK");
    TEST_ASSERT(mm == 511U, "mm phai la 511");

    /* Điểm mấu chốt: sau khung này FSM phải ở HEADER, không nhảy sang DATA_H.
     * Nếu sai, khung kế tiếp sẽ bị tiêu thụ mất header và hỏng. */
    feed_frame_ok(&dec, 0x03U, 0xE8U, &mm);
    TEST_ASSERT(mm == 1000U, "khung ke tiep sau checksum 0xFF phai giai ma duoc");
}

/* ============================================================================
 * TEST 7: Ngoài dải trên (> 500 cm)
 * ============================================================================ */
static void test_out_of_range(void) {
    KvcUsoundDecoder dec;
    uint16_t mm = 0U;
    KvcUsoundFrameResult r;

    printf("[7] Ngoai dai 5500 mm\n");
    kvc_usound_decode_reset(&dec);
    r = feed_frame(&dec, 0x15U, 0x7CU, cs_of(0x15U, 0x7CU), &mm);   /* 5500 mm */

    TEST_ASSERT(r == KVC_USOUND_FRAME_OUT_OF_RANGE, "phai bao OUT_OF_RANGE");
    TEST_ASSERT(mm == 5500U, "mm tho phai la 5500");
    TEST_ASSERT(kvc_usound_result_to_err(r) == KVC_USOUND_ERR_OUT_OF_RANGE, "ma loi phai OUT_OF_RANGE (3)");

    /* Biên trên đúng 500 cm (5000 mm) phải là OK. */
    feed_frame_ok(&dec, 0x13U, 0x88U, &mm);
    TEST_ASSERT(mm == 5000U, "5000 mm phai nam trong dai");
}

/* ============================================================================
 * TEST 8: Giá trị > 6000 mm bị loại dù checksum đúng
 * ============================================================================ */
static void test_above_module_max(void) {
    KvcUsoundDecoder dec;
    uint16_t mm = 0xFFFFU;
    KvcUsoundFrameResult r;

    printf("[8] Gia tri 0x2000 (8192 mm) du checksum van phai loai\n");
    kvc_usound_decode_reset(&dec);
    r = feed_frame(&dec, 0x20U, 0x00U, cs_of(0x20U, 0x00U), &mm);

    TEST_ASSERT(r == KVC_USOUND_FRAME_BAD_CHECKSUM, "vuot 6000 mm phai bi loai");
    TEST_ASSERT(mm == 0xFFFFU, "khong duoc ghi mm");
}

/* ============================================================================
 * TEST 9: Chuỗi nhiều khung liên tiếp
 * ============================================================================ */
static void test_multiple_frames(void) {
    KvcUsoundDecoder dec;
    uint16_t mm = 0U;
    int ok_count = 0;
    int i;

    printf("[9] Chuoi 10 khung 25..295 cm lien tiep\n");
    kvc_usound_decode_reset(&dec);

    for (i = 0; i < 10; i++) {
        uint16_t target_mm = (uint16_t)(250U + (uint16_t)i * 270U);
        uint8_t h = (uint8_t)(target_mm >> 8);
        uint8_t l = (uint8_t)(target_mm & 0xFFU);
        KvcUsoundFrameResult r = feed_frame(&dec, h, l, cs_of(h, l), &mm);
        if ((r == KVC_USOUND_FRAME_OK) && (mm == target_mm)) {
            ok_count++;
        }
    }
    TEST_ASSERT(ok_count == 10, "ca 10 khung phai giai ma dung");
}

/* ============================================================================
 * TEST 10: 0xFF lặp ở vị trí Data_H (nhiễu) — không được mất khung
 * ============================================================================ */
static void test_repeated_ff_at_data_h(void) {
    KvcUsoundDecoder dec;
    uint16_t mm = 0U;
    KvcUsoundFrameResult r;

    printf("[10] Nhieu 0xFF tai vi tri Data_H\n");
    kvc_usound_decode_reset(&dec);

    (void)kvc_usound_decode_byte(&dec, 0xFFU, &mm);
    (void)kvc_usound_decode_byte(&dec, 0xFFU, &mm);   /* vẫn là header */
    (void)kvc_usound_decode_byte(&dec, 0xFFU, &mm);
    (void)kvc_usound_decode_byte(&dec, 0x03U, &mm);
    (void)kvc_usound_decode_byte(&dec, 0xE8U, &mm);
    r = kvc_usound_decode_byte(&dec, cs_of(0x03U, 0xE8U), &mm);

    TEST_ASSERT(r == KVC_USOUND_FRAME_OK, "0xFF lap phai bi bo qua, khong tieu thu du lieu");
    TEST_ASSERT(mm == 1000U, "gia tri phai la 1000");
}

/* ============================================================================
 * TEST 11: Byte đơn lẻ không đủ khung
 * ============================================================================ */
static void test_incomplete(void) {
    KvcUsoundDecoder dec;
    uint16_t mm = 0U;

    printf("[11] Byte don le khong du khung\n");
    kvc_usound_decode_reset(&dec);

    TEST_ASSERT(kvc_usound_decode_byte(&dec, 0x00U, &mm) == KVC_USOUND_FRAME_NONE, "0x00 -> NONE");
    TEST_ASSERT(kvc_usound_decode_byte(&dec, 0xFFU, &mm) == KVC_USOUND_FRAME_NONE, "header -> NONE");
    TEST_ASSERT(kvc_usound_decode_byte(&dec, 0x03U, &mm) == KVC_USOUND_FRAME_NONE, "data_h -> NONE");
    TEST_ASSERT(kvc_usound_decode_byte(&dec, 0xE8U, &mm) == KVC_USOUND_FRAME_NONE, "data_l -> NONE");
    TEST_ASSERT(kvc_usound_result_to_err(KVC_USOUND_FRAME_NONE) == KVC_USOUND_ERR_TIMEOUT,
                "NONE phai map sang TIMEOUT");
}

/* ============================================================================
 * TEST 12: Reset giữa khung
 * ============================================================================ */
static void test_reset_mid_frame(void) {
    KvcUsoundDecoder dec;
    uint16_t mm = 0U;

    printf("[12] Reset giua khung\n");
    kvc_usound_decode_reset(&dec);

    (void)kvc_usound_decode_byte(&dec, 0xFFU, &mm);
    (void)kvc_usound_decode_byte(&dec, 0x03U, &mm);
    kvc_usound_decode_reset(&dec);                    /* bỏ dở khung */

    /* Phần còn lại của khung cũ không được tạo ra khung giả. */
    TEST_ASSERT(kvc_usound_decode_byte(&dec, 0xE8U, &mm) == KVC_USOUND_FRAME_NONE, "E8 sau reset -> NONE");
    TEST_ASSERT(kvc_usound_decode_byte(&dec, 0x01U, &mm) == KVC_USOUND_FRAME_NONE, "01 sau reset -> NONE");

    /* Khung mới đầy đủ vẫn phải chạy. */
    feed_frame_ok(&dec, 0x03U, 0xE8U, &mm);
    TEST_ASSERT(mm == 1000U, "khung moi sau reset phai OK");
}

/* ============================================================================
 * TEST 13: Ánh xạ mã lỗi
 * ============================================================================ */
static void test_error_mapping(void) {
    printf("[13] Anh xa ket qua sang ma loi driver\n");

    TEST_ASSERT(kvc_usound_result_to_err(KVC_USOUND_FRAME_OK) == KVC_USOUND_OK, "OK -> 0");
    TEST_ASSERT(kvc_usound_result_to_err(KVC_USOUND_FRAME_NO_ECHO) == KVC_USOUND_ERR_NO_ECHO, "NO_ECHO -> 5");
    TEST_ASSERT(kvc_usound_result_to_err(KVC_USOUND_FRAME_OUT_OF_RANGE) == KVC_USOUND_ERR_OUT_OF_RANGE, "OUT_OF_RANGE -> 3");
    TEST_ASSERT(kvc_usound_result_to_err(KVC_USOUND_FRAME_BLIND_ZONE) == KVC_USOUND_ERR_BLIND_ZONE, "BLIND_ZONE -> 4");
    TEST_ASSERT(kvc_usound_result_to_err(KVC_USOUND_FRAME_BAD_CHECKSUM) == KVC_USOUND_ERR_CHECKSUM, "BAD_CHECKSUM -> 2");
    TEST_ASSERT(kvc_usound_result_to_err(KVC_USOUND_FRAME_NONE) == KVC_USOUND_ERR_TIMEOUT, "NONE -> 1");

    /* Các mã lỗi phải khác nhau và khác OK (log [M3] in số này). */
    TEST_ASSERT(KVC_USOUND_ERR_NO_ECHO == 5U, "ma NO_ECHO phai la 5");
    TEST_ASSERT(KVC_USOUND_ERR_NO_RESPONSE == 6U, "ma NO_RESPONSE phai la 6");
    TEST_ASSERT(KVC_USOUND_ERR_TIMEOUT != KVC_USOUND_ERR_CHECKSUM, "TIMEOUT khac CHECKSUM");
    TEST_ASSERT(KVC_USOUND_ERR_NO_ECHO != KVC_USOUND_ERR_OUT_OF_RANGE, "NO_ECHO khac OUT_OF_RANGE");
}

/* ============================================================================
 * TEST 14: Dải đo biên chính xác
 * ============================================================================ */
static void test_range_boundaries(void) {
    KvcUsoundDecoder dec;
    uint16_t mm = 0U;
    KvcUsoundFrameResult r;

    printf("[14] Bien dai do (199, 200, 5000, 5001 mm)\n");
    kvc_usound_decode_reset(&dec);

    r = feed_frame(&dec, 0x00U, 0xC7U, cs_of(0x00U, 0xC7U), &mm);   /* 199 mm = 19 cm */
    TEST_ASSERT(r == KVC_USOUND_FRAME_BLIND_ZONE, "19 cm phai la BLIND_ZONE");

    r = feed_frame(&dec, 0x00U, 0xC8U, cs_of(0x00U, 0xC8U), &mm);   /* 200 mm = 20 cm */
    TEST_ASSERT(r == KVC_USOUND_FRAME_OK, "20 cm phai OK");

    r = feed_frame(&dec, 0x13U, 0x88U, cs_of(0x13U, 0x88U), &mm);   /* 5000 mm = 500 cm */
    TEST_ASSERT(r == KVC_USOUND_FRAME_OK, "500 cm phai OK");

    r = feed_frame(&dec, 0x13U, 0x89U, cs_of(0x13U, 0x89U), &mm);   /* 5001 mm = 500,1 cm */
    TEST_ASSERT(r == KVC_USOUND_FRAME_OUT_OF_RANGE, "500,1 cm phai OUT_OF_RANGE");
}

/* ============================================================================
 * MAIN
 * ============================================================================ */
int main(void) {
    printf("================================================================\n");
    printf("  KVC - HOST TEST: BO GIAI MA KHUNG SIEU AM AJ-SR04M (MCU-1.2)\n");
    printf("================================================================\n\n");

    test_good_frame();
    test_bad_checksum();
    test_no_echo();
    test_blind_zone();
    test_garbage_and_truncation();
    test_ff_checksum_frame();
    test_out_of_range();
    test_above_module_max();
    test_multiple_frames();
    test_repeated_ff_at_data_h();
    test_incomplete();
    test_reset_mid_frame();
    test_error_mapping();
    test_range_boundaries();

    printf("\n----------------------------------------------------------------\n");
    printf("  KET QUA: %d / %d tests PASS\n", s_tests_passed, s_tests_run);
    printf("================================================================\n");

    if (s_tests_passed != s_tests_run) {
        printf("CO TEST THAT BAI\n");
        return 1;
    }
    printf("TAT CA PASS\n");
    return 0;
}
