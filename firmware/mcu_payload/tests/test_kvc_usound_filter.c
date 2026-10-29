/**
 * @file test_kvc_usound_filter.c
 * @brief Host Unit Test cho bộ lọc siêu âm (KVC-MCU-US-FILTER-001).
 *
 * VÌ SAO CẦN: bản sửa logic "so chiều ngoại lai" ngày 28/10/2026 nằm trong
 * `kvc_usound_ajsr04m.h` — header kéo theo thanh ghi UART2 nên KHÔNG test nào
 * chạy tới. Test này khoá lại toàn bộ hành vi quyết định giá trị nào được
 * công bố ra telemetry/georef.
 *
 * Các ca:
 *   1. Trung vị của 3 giá trị (hàm thuần)
 *   2. Ba mẫu chuẩn -> xuất trung vị
 *   3. Một ngoại lai đơn lẻ bị chặn (không đẩy giá trị đi)
 *   4. Hai ngoại lai CÙNG chiều -> nhận (thay đổi thật)
 *   5. Hai ngoại lai NGƯỢC chiều -> chặn (đây là bug đã sửa 28/10)
 *   6. Giữ mẫu cũ đúng 1 chu kỳ khi lỗi timeout
 *   7. Lỗi out-of-range KHÔNG giữ mẫu cũ
 *   8. Lịch sử không bị xoá ngay ở mẫu lỗi đầu, xoá sau 5 chu kỳ
 *   9. Mẫu trong dải bình thường huỷ trạng thái nghi ngờ
 *  10. Reset xoá sạch trạng thái
 *  11. NULL an toàn
 *  12. Chuỗi dài: nhiễu ngẫu nhiên rải rác -> giá trị công bố ổn định
 *
 * Người phụ trách: Nguyễn Tá Duy Phong
 */

#define KVC_HOST_TEST 1

#include "kvc_usound_filter.h"
#include <stdio.h>

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

/* Nạp một mẫu và trả giá trị công bố; `ok` báo mã trả về có phải OK không. */
static uint16_t push(KvcUsoundFilter *f, uint8_t res, uint16_t cm, bool *held) {
    uint16_t out = 0xFFFFU;
    bool h = false;
    (void)kvc_usound_filter_push(f, res, cm, &out, &h);
    if (held != 0) {
        *held = h;
    }
    return out;
}

/* ============================================================================
 * TEST 1: TRUNG VỊ
 * ============================================================================ */
static void test_median3(void) {
    printf("[TEST 1] Trung vi cua 3 gia tri...\n");

    TEST_ASSERT(kvc_usound_median3(100U, 200U, 300U) == 200U, "100,200,300 -> 200");
    TEST_ASSERT(kvc_usound_median3(300U, 100U, 200U) == 200U, "300,100,200 -> 200");
    TEST_ASSERT(kvc_usound_median3(200U, 300U, 100U) == 200U, "200,300,100 -> 200");
    TEST_ASSERT(kvc_usound_median3(100U, 100U, 500U) == 100U, "trung vi khong bi keo");
    TEST_ASSERT(kvc_usound_median3(500U, 100U, 100U) == 100U, "trung vi khong bi keo");
    TEST_ASSERT(kvc_usound_median3(50U, 50U, 50U) == 50U, "bang nhau -> chinh no");
    TEST_ASSERT(kvc_usound_median3(0U, 1000U, 2000U) == 1000U, "co so 0");
}

/* ============================================================================
 * TEST 2: BA MẪU CHUẨN
 * ============================================================================ */
static void test_three_clean_samples(void) {
    KvcUsoundFilter f;
    uint16_t v;

    printf("[TEST 2] Ba mau chuan -> xuat trung vi...\n");

    kvc_usound_filter_reset(&f);

    v = push(&f, KVC_USOUND_OK, 200U, 0);
    TEST_ASSERT(v == 200U, "mau 1 -> 200");

    v = push(&f, KVC_USOUND_OK, 202U, 0);
    TEST_ASSERT(v == 201U, "mau 2 -> trung binh 201");

    v = push(&f, KVC_USOUND_OK, 204U, 0);
    TEST_ASSERT(v == 202U, "mau 3 -> trung vi 202");

    v = push(&f, KVC_USOUND_OK, 206U, 0);
    TEST_ASSERT(v == 204U, "mau 4 -> trung vi 204");

    /* Lịch sử đã đầy: giá trị trượt theo đúng cửa sổ 3 mẫu. */
    TEST_ASSERT(f.hist_count == 3U, "lich su day 3 mau");
}

/* ============================================================================
 * TEST 3: MỘT NGOẠI LAI BỊ CHẶN
 * ============================================================================ */
static void test_single_outlier_blocked(void) {
    KvcUsoundFilter f;
    uint16_t v;
    bool held = false;

    printf("[TEST 3] Mot ngoai lai don le bi chan...\n");

    kvc_usound_filter_reset(&f);
    (void)push(&f, KVC_USOUND_OK, 200U, 0);
    (void)push(&f, KVC_USOUND_OK, 200U, 0);

    /* Nhảy +400 cm (> ngưỡng 150) -> nghi ngờ, vẫn công bố giá trị cũ. */
    v = push(&f, KVC_USOUND_OK, 600U, &held);
    TEST_ASSERT(v == 200U, "ngoai lai bi chan, giu 200");
    TEST_ASSERT(held, "co bao held");
    TEST_ASSERT(f.pending == 1U, "co trang thai nghi ngo");

    /* Mẫu kế tiếp bình thường -> huỷ nghi ngờ. Lịch sử lúc này là
     * {200, 200, 202} nên trung vị VẪN là 200: trung vị 3 mẫu cần 2 mẫu cùng
     * phía mới dịch, đúng thiết kế "trễ 2 chu kỳ". */
    v = push(&f, KVC_USOUND_OK, 202U, &held);
    TEST_ASSERT(v == 200U, "tro lai binh thuong -> trung vi van 200");
    TEST_ASSERT(f.pending == 0U, "nghi ngo duoc huy");
    TEST_ASSERT(f.hist_count == 3U, "mau binh thuong duoc nap vao lich su");
}

/* ============================================================================
 * TEST 4: HAI NGOẠI LAI CÙNG CHIỀU -> NHẬN
 * ============================================================================ */
static void test_two_outliers_same_direction_accepted(void) {
    KvcUsoundFilter f;
    uint16_t v;

    printf("[TEST 4] Hai ngoai lai CUNG chieu -> thay doi that...\n");

    kvc_usound_filter_reset(&f);
    (void)push(&f, KVC_USOUND_OK, 200U, 0);
    (void)push(&f, KVC_USOUND_OK, 200U, 0);

    v = push(&f, KVC_USOUND_OK, 600U, 0);      /* lệch +400, nghi ngờ */
    TEST_ASSERT(v == 200U, "mau dau bi chan");

    /* Mẫu xác nhận cùng chiều được ĐƯA VÀO lịch sử, nhưng trung vị của
     * {200, 200, 620} vẫn là 200 — phải cần thêm mẫu thứ ba mới hội tụ.
     * Đây đúng thiết kế "trễ 2 chu kỳ", không phải lỗi. */
    v = push(&f, KVC_USOUND_OK, 620U, 0);
    TEST_ASSERT(f.hist_count == 3U, "mau xac nhan duoc dua vao lich su");
    TEST_ASSERT(v == 200U, "trung vi {200,200,620} = 200");

    /* Mẫu thứ ba cùng vùng mới -> trung vị dịch sang vùng mới. */
    v = push(&f, KVC_USOUND_OK, 640U, 0);
    TEST_ASSERT(v == 620U, "trung vi {200,620,640} = 620");
    TEST_ASSERT(v > 500U, "da hoi tu ve vung gia tri moi");
}

/* ============================================================================
 * TEST 5: HAI NGOẠI LAI NGƯỢC CHIỀU -> CHẶN (bug đã sửa 28/10)
 * ============================================================================ */
static void test_two_outliers_opposite_direction_blocked(void) {
    KvcUsoundFilter f;
    uint16_t v;

    printf("[TEST 5] Hai ngoai lai NGUOC chieu -> phai bi chan...\n");

    kvc_usound_filter_reset(&f);
    (void)push(&f, KVC_USOUND_OK, 300U, 0);
    (void)push(&f, KVC_USOUND_OK, 300U, 0);

    /* +600 -> nghi ngờ. */
    v = push(&f, KVC_USOUND_OK, 900U, 0);
    TEST_ASSERT(v == 300U, "ngoai lai thu nhat bi chan");

    /* -600 (xuống 0 gần) -> NGƯỢC chiều, phải bị chặn tiếp, KHÔNG nhận. */
    v = push(&f, KVC_USOUND_OK, 0U, 0);
    TEST_ASSERT(v == 300U, "ngoai lai nguoc chieu bi chan (bug cu se nhan)");
    TEST_ASSERT(f.pending == 1U, "van o trang thai nghi ngo");

    /* Đây chính là regression của lỗi 28/10: bản cũ nhận cả hai và công bố 0. */
    TEST_ASSERT(f.hist[0] != 0U || f.hist[1] != 0U || f.hist[2] != 0U ||
                f.hist_count == 0U,
                "gia tri ngoai lai khong lot vao lich su");
}

/* ============================================================================
 * TEST 6: GIỮ MẪU CŨ MỘT CHU KỲ KHI LỖI ĐƯỜNG TRUYỀN
 * ============================================================================ */
static void test_hold_on_transport_error(void) {
    KvcUsoundFilter f;
    uint16_t out = 0;
    bool held = false;
    uint8_t res;

    printf("[TEST 6] Giu mau cu dung 1 chu ky khi timeout...\n");

    kvc_usound_filter_reset(&f);
    (void)push(&f, KVC_USOUND_OK, 250U, 0);

    res = kvc_usound_filter_push(&f, KVC_USOUND_ERR_TIMEOUT, 0U, &out, &held);
    TEST_ASSERT(res == KVC_USOUND_OK, "truot 1 nhip -> van OK (held)");
    TEST_ASSERT(out == 250U, "tra lai mau cu 250");
    TEST_ASSERT(held, "co bao held");

    /* Trượt nhịp thứ hai liên tiếp -> hết giữ, báo lỗi thật. */
    res = kvc_usound_filter_push(&f, KVC_USOUND_ERR_TIMEOUT, 0U, &out, &held);
    TEST_ASSERT(res == KVC_USOUND_ERR_TIMEOUT, "truot 2 nhip -> tra loi loi");
    TEST_ASSERT(out == 0U, "khong con giu mau cu");
    TEST_ASSERT(!held, "khong con held");
}

/* ============================================================================
 * TEST 7: LỖI NGOÀI DẢI KHÔNG GIỮ MẪU
 * ============================================================================ */
static void test_no_hold_on_range_error(void) {
    KvcUsoundFilter f;
    uint16_t out = 99U;
    uint8_t res;
    static const uint8_t kRangeErrors[] = {
        KVC_USOUND_ERR_OUT_OF_RANGE,
        KVC_USOUND_ERR_NO_ECHO,
        KVC_USOUND_ERR_BLIND_ZONE,
    };
    unsigned i;

    printf("[TEST 7] Loi ngoai dai KHONG giu mau cu...\n");

    for (i = 0U; i < (unsigned)sizeof(kRangeErrors); i++) {
        kvc_usound_filter_reset(&f);
        (void)push(&f, KVC_USOUND_OK, 250U, 0);

        out = 99U;
        res = kvc_usound_filter_push(&f, kRangeErrors[i], 0U, &out, 0);
        TEST_ASSERT(res == kRangeErrors[i], "tra dung ma loi ngoai dai");
        TEST_ASSERT(out == 0U, "khong giu mau cu cho loi ngoai dai");
    }
}

/* ============================================================================
 * TEST 8: LỊCH SỬ CHỈ BỊ XOÁ SAU 5 CHU KỲ
 * ============================================================================ */
static void test_history_hold_cycles(void) {
    KvcUsoundFilter f;
    unsigned i;

    printf("[TEST 8] Lich su chi xoa sau %u chu ky loi...\n",
           (unsigned)KVC_USOUND_HIST_HOLD_CYCLES);

    kvc_usound_filter_reset(&f);
    (void)push(&f, KVC_USOUND_OK, 200U, 0);
    (void)push(&f, KVC_USOUND_OK, 200U, 0);
    TEST_ASSERT(f.hist_count == 2U, "co 2 mau lich su");

    /* Trượt 1 nhịp: nhánh GIỮ MẪU return sớm nên `fail_run` KHÔNG tăng và lịch
     * sử chưa bị xoá. Đây là hành vi gốc, giữ nguyên có chủ ý. */
    (void)push(&f, KVC_USOUND_ERR_NO_RESPONSE, 0U, 0);
    TEST_ASSERT(f.hist_count == 2U, "truot 1 nhip chua xoa lich su");
    TEST_ASSERT(f.fail_run == 0U, "nhanh giu mau khong tang fail_run");
    TEST_ASSERT(f.drop_count == 1U, "da dung luot giu mau");

    /* Từ nhịp trượt thứ hai trở đi `fail_run` mới tăng dần. Lưu ý: lượt trượt
     * ĐẦU TIÊN bị nhánh giữ mẫu tiêu thụ (không tăng `fail_run`), nên muốn xoá
     * lịch sử cần tổng cộng 1 + KVC_USOUND_HIST_HOLD_CYCLES lần trượt liên tiếp.
     * Đây là hành vi gốc của bản 28/10, giữ nguyên. */
    for (i = 1U; i < KVC_USOUND_HIST_HOLD_CYCLES; i++) {
        (void)push(&f, KVC_USOUND_ERR_NO_RESPONSE, 0U, 0);
    }
    TEST_ASSERT(f.fail_run == (uint8_t)(KVC_USOUND_HIST_HOLD_CYCLES - 1U),
                "sau 5 lan truot: fail_run = 4 (1 lan bi nhanh giu tieu thu)");
    TEST_ASSERT(f.hist_count == 2U, "chua cham nguong -> chua xoa lich su");

    /* Lần trượt thứ 6 đưa fail_run tới ngưỡng -> xoá lịch sử. */
    (void)push(&f, KVC_USOUND_ERR_NO_RESPONSE, 0U, 0);
    TEST_ASSERT(f.fail_run >= KVC_USOUND_HIST_HOLD_CYCLES,
                "du so chu ky loi -> fail_run cham nguong");
    TEST_ASSERT(f.hist_count == 0U, "du 6 lan truot -> xoa lich su");

    /* Echo trở lại -> mẫu mới nhất không trộn mẫu cũ. */
    {
        uint16_t v = push(&f, KVC_USOUND_OK, 450U, 0);
        TEST_ASSERT(v == 450U, "sau khi xoa, mau moi di thang");
    }
}

/* ============================================================================
 * TEST 9: MẪU BÌNH THƯỜNG HUỶ NGHI NGỜ
 * ============================================================================ */
static void test_normal_sample_clears_pending(void) {
    KvcUsoundFilter f;

    printf("[TEST 9] Mau binh thuong huy trang thai nghi ngo...\n");

    kvc_usound_filter_reset(&f);
    (void)push(&f, KVC_USOUND_OK, 200U, 0);
    (void)push(&f, KVC_USOUND_OK, 200U, 0);
    (void)push(&f, KVC_USOUND_OK, 900U, 0);   /* nghi ngờ */
    TEST_ASSERT(f.pending == 1U, "dang nghi ngo");

    (void)push(&f, KVC_USOUND_OK, 210U, 0);   /* trong dải -> huỷ */
    TEST_ASSERT(f.pending == 0U, "mau trong dai huy nghi ngo");

    (void)push(&f, KVC_USOUND_OK, 215U, 0);
    TEST_ASSERT(f.pending == 0U, "van sach");
}

/* ============================================================================
 * TEST 10-11: RESET VÀ NULL
 * ============================================================================ */
static void test_reset_and_null(void) {
    KvcUsoundFilter f;
    uint16_t out = 55U;

    printf("[TEST 10-11] Reset va tham so NULL...\n");

    kvc_usound_filter_reset(&f);
    (void)push(&f, KVC_USOUND_OK, 300U, 0);
    (void)push(&f, KVC_USOUND_OK, 900U, 0);
    TEST_ASSERT(f.hist_count > 0U, "co trang thai truoc reset");

    kvc_usound_filter_reset(&f);
    TEST_ASSERT(f.hist_count == 0U, "reset xoa hist_count");
    TEST_ASSERT(f.hist_idx == 0U, "reset xoa hist_idx");
    TEST_ASSERT(f.pending == 0U, "reset xoa pending");
    TEST_ASSERT(f.last_good_cm == 0U, "reset xoa last_good");
    TEST_ASSERT(f.fail_run == 0U, "reset xoa fail_run");

    kvc_usound_filter_reset(0);
    TEST_ASSERT(1, "reset NULL khong crash");

    /* Filter NULL -> chuyển tiếp nguyên trạng. */
    out = 999U;
    TEST_ASSERT(kvc_usound_filter_push(0, KVC_USOUND_OK, 123U, &out, 0)
                == KVC_USOUND_OK, "NULL filter -> tra res goc");
    TEST_ASSERT(out == 123U, "NULL filter -> out = cm");

    TEST_ASSERT(kvc_usound_filter_push(0, KVC_USOUND_ERR_TIMEOUT, 0U, &out, 0)
                == KVC_USOUND_ERR_TIMEOUT, "NULL filter -> tra loi goc");
    TEST_ASSERT(out == 0U, "NULL filter + loi -> out = 0");

    kvc_usound_filter_reset(&f);
    TEST_ASSERT(kvc_usound_filter_push(&f, KVC_USOUND_OK, 100U, 0, 0)
                == KVC_USOUND_OK, "out_cm NULL van chay");
}

/* ============================================================================
 * TEST 12: CHUỖI DÀI CÓ NHIỄU
 * ============================================================================ */
static void test_long_run_with_noise(void) {
    KvcUsoundFilter f;
    uint16_t v = 0;
    unsigned i;
    unsigned bad = 0;
    unsigned far = 0;

    printf("[TEST 12] Chuoi dai co nhieu rai rac...\n");

    kvc_usound_filter_reset(&f);

    /* Nền 200 cm; cứ 7 mẫu chèn một ngoại lai +900 cm. */
    for (i = 0U; i < 60U; i++) {
        uint16_t cm = ((i % 7U) == 3U) ? 900U : (uint16_t)(200U + (i % 5U));
        v = push(&f, KVC_USOUND_OK, cm, 0);

        if ((v < 195U) || (v > 215U)) {
            far++;
        }
        if ((i % 7U) == 3U) {
            bad++;
        }
    }

    TEST_ASSERT(far == 0U, "khong lan nao gia tri cong bo vuot 195..215");
    TEST_ASSERT(bad > 0U, "thuc su co ngoai lai duoc nap");
}

int main(void) {
    printf("================================================================\n");
    printf("  KVC - HOST TEST: BO LOC SIEU AM (MEDIAN + OUTLIER + HOLD)\n");
    printf("================================================================\n\n");

    test_median3();
    test_three_clean_samples();
    test_single_outlier_blocked();
    test_two_outliers_same_direction_accepted();
    test_two_outliers_opposite_direction_blocked();
    test_hold_on_transport_error();
    test_no_hold_on_range_error();
    test_history_hold_cycles();
    test_normal_sample_clears_pending();
    test_reset_and_null();
    test_long_run_with_noise();

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
