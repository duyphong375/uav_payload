/**
 * @file test_kvc_geo_math.c
 * @brief Host Unit Test cho lượng giác số nguyên dùng trong georef (MCU-1.5).
 *
 * Kiểm:
 *   1. Bảng sin khớp giá trị chuẩn tại các mốc đặc biệt
 *   2. sin/cos đúng dấu ở cả 4 góc phần tư
 *   3. Chuẩn hoá góc ngoài dải (>= 3600)
 *   4. Nội suy 0,1° nằm giữa hai mốc 1°
 *   5. Xoay vector: 4 hướng chính (0/90/180/270°)
 *   6. Xoay vector giữ nguyên độ dài (±1 mm)
 *   7. Xoay 360° trả lại vector gốc
 *   8. Xoay hai lần 180° = xoay 360°
 *   9. Không tràn số với cự ly lớn (500 m)
 *
 * Tác giả: Nguyễn Tá Duy Phong
 */

#define KVC_HOST_TEST 1

#include "kvc_geo_math.h"
#include <stdio.h>
#include <stdlib.h>

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

/* sai số tuyệt đối */
static int32_t iabs32(int32_t v) { return (v < 0) ? -v : v; }

/* ============================================================================
 * TEST 1: bảng sin tại các mốc chuẩn
 * ============================================================================ */
static void test_sin_landmarks(void) {
    printf("[1] Gia tri sin tai cac moc chuan\n");

    TEST_ASSERT(kvc_geo_sin_deg10(0U) == 0, "sin(0) = 0");
    TEST_ASSERT(kvc_geo_sin_deg10(300U) == 5000, "sin(30) = 5000");
    TEST_ASSERT(iabs32(kvc_geo_sin_deg10(450U) - 7071) <= 1, "sin(45) ~ 7071");
    TEST_ASSERT(kvc_geo_sin_deg10(900U) == 10000, "sin(90) = 10000");
    TEST_ASSERT(kvc_geo_sin_deg10(1800U) == 0, "sin(180) = 0");
    TEST_ASSERT(iabs32(kvc_geo_sin_deg10(2700U) + 10000) <= 1, "sin(270) = -10000");
    TEST_ASSERT(iabs32(kvc_geo_sin_deg10(600U) - 8660) <= 1, "sin(60) ~ 8660");
}

/* ============================================================================
 * TEST 2: dấu ở 4 góc phần tư
 * ============================================================================ */
static void test_quadrant_signs(void) {
    printf("[2] Dau sin/cos o 4 goc phan tu\n");
    uint16_t q;
    for (q = 1U; q < 900U; q += 97U) {
        TEST_ASSERT(kvc_geo_sin_deg10(q) > 0, "Q1 sin > 0");
        TEST_ASSERT(kvc_geo_cos_deg10(q) > 0, "Q1 cos > 0");

        TEST_ASSERT(kvc_geo_sin_deg10((uint16_t)(1800U - q)) > 0, "Q2 sin > 0");
        TEST_ASSERT(kvc_geo_cos_deg10((uint16_t)(1800U - q)) < 0, "Q2 cos < 0");

        TEST_ASSERT(kvc_geo_sin_deg10((uint16_t)(1800U + q)) < 0, "Q3 sin < 0");
        TEST_ASSERT(kvc_geo_cos_deg10((uint16_t)(1800U + q)) < 0, "Q3 cos < 0");

        TEST_ASSERT(kvc_geo_sin_deg10((uint16_t)(3600U - q)) < 0, "Q4 sin < 0");
        TEST_ASSERT(kvc_geo_cos_deg10((uint16_t)(3600U - q)) > 0, "Q4 cos > 0");
    }
}

/* ============================================================================
 * TEST 3: chuẩn hoá góc ngoài dải
 * ============================================================================ */
static void test_wrap(void) {
    printf("[3] Chuan hoa goc ngoai dai\n");

    TEST_ASSERT(kvc_geo_sin_deg10(3600U) == kvc_geo_sin_deg10(0U), "3600 = 0");
    TEST_ASSERT(kvc_geo_sin_deg10(4500U) == kvc_geo_sin_deg10(900U), "4500 = 90");
    TEST_ASSERT(kvc_geo_cos_deg10(3600U) == kvc_geo_cos_deg10(0U), "cos 3600 = cos 0");
    TEST_ASSERT(kvc_geo_cos_deg10(7250U) == kvc_geo_cos_deg10(50U), "cos 7250 = cos 5");
}

/* ============================================================================
 * TEST 4: nội suy 0,1°
 * ============================================================================ */
static void test_interpolation(void) {
    printf("[4] Noi suy 0,1 do\n");

    int32_t s5 = kvc_geo_sin_deg10(5U);     /* 0,5° */
    int32_t s10 = kvc_geo_sin_deg10(10U);   /* 1,0° */

    TEST_ASSERT(s5 > 0, "sin(0,5) > 0");
    TEST_ASSERT(s5 < s10, "sin(0,5) < sin(1,0)");

    /* Nội suy phải nằm giữa hai mốc và gần trung bình cộng. */
    int32_t mid = (kvc_geo_sin_deg10(0U) + s10) / 2;
    TEST_ASSERT(iabs32(s5 - mid) <= 2, "sin(0,5) xap xi trung binh sin(0) va sin(1)");

    /* 90° là biên trên của bảng: không được truy cập ngoài mảng. */
    TEST_ASSERT(kvc_geo_sin_deg10(900U) == 10000, "bien 90 do dung");
    TEST_ASSERT(kvc_geo_sin_deg10(899U) < 10000, "89,9 do < 90 do");
}

/* ============================================================================
 * TEST 5: xoay vector theo 4 hướng chính
 * ============================================================================ */
static void test_rotate_cardinal(void) {
    printf("[5] Xoay vector theo 4 huong chinh\n");
    int32_t east = 0, north = 0;

    /* Camera hướng Bắc: "phải ảnh" là Đông, "tới" là Bắc. */
    kvc_geo_rotate_to_ne(1000, 0, 0U, &east, &north);
    TEST_ASSERT(east == 1000 && north == 0, "yaw 0: phai -> Dong");

    kvc_geo_rotate_to_ne(0, 1000, 0U, &east, &north);
    TEST_ASSERT(east == 0 && north == 1000, "yaw 0: toi -> Bac");

    /* Camera hướng Đông: "tới" là Đông, "phải" là Nam. */
    kvc_geo_rotate_to_ne(1000, 0, 900U, &east, &north);
    TEST_ASSERT(iabs32(east) <= 1 && iabs32(north + 1000) <= 1, "yaw 90: phai -> Nam");

    kvc_geo_rotate_to_ne(0, 1000, 900U, &east, &north);
    TEST_ASSERT(iabs32(east - 1000) <= 1 && iabs32(north) <= 1, "yaw 90: toi -> Dong");

    /* Camera hướng Nam: "tới" là Nam. */
    kvc_geo_rotate_to_ne(0, 1000, 1800U, &east, &north);
    TEST_ASSERT(iabs32(east) <= 1 && iabs32(north + 1000) <= 1, "yaw 180: toi -> Nam");

    /* Camera hướng Tây: "tới" là Tây. */
    kvc_geo_rotate_to_ne(0, 1000, 2700U, &east, &north);
    TEST_ASSERT(iabs32(east + 1000) <= 1 && iabs32(north) <= 1, "yaw 270: toi -> Tay");
}

/* ============================================================================
 * TEST 6: xoay giữ nguyên độ dài
 * ============================================================================ */
static void test_rotate_length(void) {
    printf("[6] Xoay giu nguyen do dai vector\n");
    int32_t east = 0, north = 0;
    uint16_t yaw;

    for (yaw = 0U; yaw < 3600U; yaw += 137U) {
        kvc_geo_rotate_to_ne(3000, 4000, yaw, &east, &north);   /* vector 5 m */
        int32_t mag = (int32_t)(((int64_t)east * east + (int64_t)north * north) / 1000000);
        TEST_ASSERT(iabs32(mag - 25) <= 1, "do dai giu nguyen 5 m");
    }

    /* Cùng vector nhưng xoay 360° phải trả lại y hệt. */
    kvc_geo_rotate_to_ne(3000, 4000, 3600U, &east, &north);
    TEST_ASSERT(east == 3000 && north == 4000, "yaw 360 = yaw 0");
}

/* ============================================================================
 * TEST 7: xoay 90° bốn lần = 360°
 * ============================================================================ */
static void test_rotate_compose(void) {
    printf("[7] Xoay 180 hai lan = xoay 360\n");
    int32_t e1 = 0, n1 = 0, e2 = 0, n2 = 0;

    kvc_geo_rotate_to_ne(2500, -1500, 1800U, &e1, &n1);
    kvc_geo_rotate_to_ne(e1, n1, 1800U, &e2, &n2);

    TEST_ASSERT(iabs32(e2 - 2500) <= 2, "180+180 = 0 (dong)");
    TEST_ASSERT(iabs32(n2 + 1500) <= 2, "180+180 = 0 (bac)");
}

/* ============================================================================
 * TEST 8: không tràn với cự ly lớn
 * ============================================================================ */
static void test_no_overflow(void) {
    printf("[8] Khong tran so voi cu ly lon (500 m)\n");
    int32_t east = 0, north = 0;

    /* Vector chéo 500 m + 500 m ở yaw 45°: đông = 707 m, bắc = 0 (hai thành
     * phần triệt tiêu đúng, không phải lỗi). Chỉ kiểm không tràn và dấu. */
    kvc_geo_rotate_to_ne(500000, 500000, 450U, &east, &north);

    TEST_ASSERT(iabs32(east) <= 1000000, "dong trong khoang hop ly");
    TEST_ASSERT(iabs32(north) <= 1000000, "bac trong khoang hop ly");
    TEST_ASSERT(iabs32(east - 707100) <= 2, "dong = 707,1 m");
    TEST_ASSERT(iabs32(north) <= 2, "bac = 0 do trieu tieu");

    /* Vector chỉ hướng tới, yaw 45°: cả hai thành phần đều dương. */
    kvc_geo_rotate_to_ne(0, 500000, 450U, &east, &north);
    TEST_ASSERT(iabs32(east - 353550) <= 2, "toi 500 m, yaw 45: dong = 353,55 m");
    TEST_ASSERT(iabs32(north - 353550) <= 2, "toi 500 m, yaw 45: bac = 353,55 m");
}

/* ============================================================================
 * TEST 9: NULL pointer an toàn
 * ============================================================================ */
static void test_null_output(void) {
    printf("[9] Con tro ra NULL khong gay loi\n");
    int32_t east = 0;

    kvc_geo_rotate_to_ne(1000, 1000, 0U, &east, 0);
    TEST_ASSERT(east == 1000, "chi ghi dong khi north = NULL");

    kvc_geo_rotate_to_ne(1000, 1000, 0U, 0, 0);
    TEST_ASSERT(1, "ca hai NULL khong crash");
}

/* ============================================================================
 * MAIN
 * ============================================================================ */
int main(void) {
    printf("================================================================\n");
    printf("  KVC - HOST TEST: LUONG GIAC SO NGUYEN CHO GEOREF (MCU-1.5)\n");
    printf("================================================================\n\n");

    test_sin_landmarks();
    test_quadrant_signs();
    test_wrap();
    test_interpolation();
    test_rotate_cardinal();
    test_rotate_length();
    test_rotate_compose();
    test_no_overflow();
    test_null_output();

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
