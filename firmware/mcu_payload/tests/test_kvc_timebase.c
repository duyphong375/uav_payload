/**
 * @file test_kvc_timebase.c
 * @brief Host Unit Test cho time base dùng chung (KVC-F6b).
 *
 * Kiểm tra:
 * 1. Reset đưa time base về 0.
 * 2. add_ms cộng đúng, add_ms(0) không đổi.
 * 3. add_us cộng dồn phần lẻ: 250 + 250 + 250 + 250 us = đúng 1 ms.
 * 4. add_us không mất thời gian khi chia nguyên: 1500 us = 1 ms + giữ 500 us.
 * 5. Trộn ms và us giữ đúng tổng.
 * 6. Wrap modulo 2^32 đúng (không kẹt ở giá trị lớn).
 * 7. Mô phỏng chu kỳ 1 giây của main: 1000 nhịp delay 1 ms + 100 ms chờ siêu âm
 *    phải cho timestamp tăng ~1100 ms, không phải 1000 ms.
 *
 * Biên dịch (từ thư mục gốc repo):
 *   gcc -Wall -Wextra -O2 -std=c99 -DKVC_HOST_TEST=1 -Ifirmware/mcu_payload/inc `
 *       firmware/mcu_payload/tests/test_kvc_timebase.c `
 *       firmware/mcu_payload/src/kvc_timebase.c -o test_kvc_timebase.exe
 */

#include "kvc_timebase.h"
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

/* ---------- 1. Reset ---------- */
static void test_reset(void) {
    printf("[1] Reset\n");

    kvc_timebase_add_ms(1234U);
    TEST_ASSERT(kvc_timebase_ms() == 1234U, "phải cộng được 1234 ms");

    kvc_timebase_reset();
    TEST_ASSERT(kvc_timebase_ms() == 0U, "reset phải đưa time base về 0");
}

/* ---------- 2. add_ms ---------- */
static void test_add_ms(void) {
    printf("[2] add_ms\n");

    kvc_timebase_reset();
    kvc_timebase_add_ms(0U);
    TEST_ASSERT(kvc_timebase_ms() == 0U, "add_ms(0) không đổi time base");

    kvc_timebase_add_ms(1U);
    kvc_timebase_add_ms(999U);
    TEST_ASSERT(kvc_timebase_ms() == 1000U, "1 + 999 ms phải bằng 1000 ms");
}

/* ---------- 3. add_us cộng dồn phần lẻ ---------- */
static void test_add_us_accumulates(void) {
    printf("[3] add_us cộng dồn phần lẻ\n");

    kvc_timebase_reset();
    kvc_timebase_add_us(250U);
    TEST_ASSERT(kvc_timebase_ms() == 0U, "250 us chưa đủ 1 ms nên ms vẫn 0");

    kvc_timebase_add_us(250U);
    kvc_timebase_add_us(250U);
    TEST_ASSERT(kvc_timebase_ms() == 0U, "750 us chưa đủ 1 ms nên ms vẫn 0");

    kvc_timebase_add_us(250U);
    TEST_ASSERT(kvc_timebase_ms() == 1U, "4 x 250 us phải thành đúng 1 ms");
}

/* ---------- 4. add_us không mất thời gian ---------- */
static void test_add_us_no_loss(void) {
    printf("[4] add_us không mất thời gian\n");

    kvc_timebase_reset();
    kvc_timebase_add_us(1500U);
    TEST_ASSERT(kvc_timebase_ms() == 1U, "1500 us phải thành 1 ms");

    kvc_timebase_add_us(500U);
    TEST_ASSERT(kvc_timebase_ms() == 2U, "phần lẻ 500 us còn lại + 500 us phải thành 2 ms");
}

/* ---------- 5. Trộn ms và us ---------- */
static void test_mixed(void) {
    printf("[5] Trộn ms và us\n");

    kvc_timebase_reset();
    kvc_timebase_add_ms(10U);
    kvc_timebase_add_us(1500U);
    kvc_timebase_add_ms(5U);
    /* 10 + 1 + 5 = 16 ms, dư 500 us */
    TEST_ASSERT(kvc_timebase_ms() == 16U, "10 ms + 1500 us + 5 ms phải bằng 16 ms");

    kvc_timebase_add_us(500U);
    TEST_ASSERT(kvc_timebase_ms() == 17U, "phần lẻ 500 us + 500 us phải thành 17 ms");
}

/* ---------- 6. Wrap 2^32 ---------- */
static void test_wrap(void) {
    printf("[6] Wrap modulo 2^32\n");

    kvc_timebase_reset();
    kvc_timebase_add_ms(0xFFFFFFFEU);
    TEST_ASSERT(kvc_timebase_ms() == 0xFFFFFFFEU, "phải đặt được giá trị sát ngưỡng wrap");

    kvc_timebase_add_ms(1U);
    TEST_ASSERT(kvc_timebase_ms() == 0xFFFFFFFFU, "phải tới đúng 0xFFFFFFFF");

    kvc_timebase_add_ms(1U);
    TEST_ASSERT(kvc_timebase_ms() == 0U, "cộng thêm 1 phải wrap về 0");
}

/* ---------- 7. Mô phỏng một chu kỳ 1 giây của main ---------- */
static void test_main_cycle_simulation(void) {
    printf("[7] Mô phỏng chu kỳ 1 giây của main\n");

    kvc_timebase_reset();

    /* Driver siêu âm chờ khung tối đa 100 ms (kvc_usound_measure) */
    kvc_timebase_add_us(100000U);
    TEST_ASSERT(kvc_timebase_ms() == 100U, "100 ms chờ siêu âm phải được ghi nhận");

    /* Vòng poll 1000 nhịp, mỗi nhịp delay_ms(1) */
    for (uint32_t step = 0; step < 1000U; step++) {
        kvc_timebase_add_ms(1U);
    }
    TEST_ASSERT(kvc_timebase_ms() == 1100U,
                "chu kỳ phải là ~1100 ms (100 chờ + 1000 poll), không phải 1000 ms");
}

int main(void) {
    printf("================================================================\n");
    printf("  KVC-F6b — Host Unit Tests (shared monotonic time base)\n");
    printf("================================================================\n");

    test_reset();
    test_add_ms();
    test_add_us_accumulates();
    test_add_us_no_loss();
    test_mixed();
    test_wrap();
    test_main_cycle_simulation();

    printf("================================================================\n");
    printf("  Results: %d/%d assertions PASSED\n", s_tests_passed, s_tests_run);
    printf("================================================================\n");

    if (s_tests_passed != s_tests_run) {
        printf(">>> CO %d ASSERT THAT BAI!\n", s_tests_run - s_tests_passed);
        return 1;
    }
    printf(">>> ALL TESTS PASSED SUCCESSFULLY! <<<\n");
    return 0;
}
