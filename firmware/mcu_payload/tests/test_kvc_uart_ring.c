/**
 * @file test_kvc_uart_ring.c
 * @brief Host Unit Test cho ring buffer SPSC dùng làm RX UART (KVC-M2-20261025-001).
 *
 * Kiểm tra:
 * 1. Init chấp nhận luỹ thừa của 2, từ chối kích thước khác/không hợp lệ.
 * 2. Push/pop cơ bản giữ đúng thứ tự FIFO.
 * 3. Wrap-around qua ranh giới cuối buffer.
 * 4. Ring đầy: byte bị bỏ, `dropped` tăng, `count` không vượt size-1.
 * 5. Ring rỗng: pop trả false.
 * 6. Reset xoá sạch head/tail/dropped.
 * 7. Mô phỏng SPSC xen kẽ: producer đẩy theo burst, consumer đọc từng nhịp,
 *    không byte nào bị mất khi consumer theo kịp.
 * 8. Mô phỏng cửa sổ chặn: producer đẩy N byte liên tục, không consumer;
 *    kiểm tra số byte mất đúng bằng phần vượt sức chứa.
 *
 * Biên dịch (từ thư mục gốc repo):
 *   gcc -Wall -Wextra -O2 -DKVC_HOST_TEST=1 -Ifirmware/mcu_payload/inc \
 *       firmware/mcu_payload/tests/test_kvc_uart_ring.c -o test_kvc_uart_ring
 */

#include "kvc_uart_ring.h"
#include <stdio.h>
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

/* ---------- 1. Init ---------- */
static void test_init(void) {
    KvcUartRing r;
    uint8_t buf[16];

    printf("[1] Init\n");

    TEST_ASSERT(kvc_ring_init(&r, buf, 16U) == true, "size 16 (luỹ thừa 2) phải hợp lệ");
    TEST_ASSERT(r.size == 16U && r.mask == 15U, "size/mask phải đúng");
    TEST_ASSERT(kvc_ring_count(&r) == 0U, "ring mới phải rỗng");
    TEST_ASSERT(r.dropped == 0U, "dropped khởi tạo phải 0");

    TEST_ASSERT(kvc_ring_init(&r, buf, 15U) == false, "size 15 (không luỹ thừa 2) phải bị từ chối");
    TEST_ASSERT(kvc_ring_init(&r, buf, 1U) == false, "size 1 phải bị từ chối");
    TEST_ASSERT(kvc_ring_init(&r, buf, 0U) == false, "size 0 phải bị từ chối");
    TEST_ASSERT(kvc_ring_init(&r, NULL, 16U) == false, "buf NULL phải bị từ chối");
    TEST_ASSERT(kvc_ring_init(NULL, buf, 16U) == false, "ring NULL phải bị từ chối");

    /* size 2 là luỹ thừa nhỏ nhất dùng được (1 slot khả dụng) */
    TEST_ASSERT(kvc_ring_init(&r, buf, 2U) == true, "size 2 phải hợp lệ");
}

/* ---------- 2. Push/pop thứ tự FIFO ---------- */
static void test_fifo_order(void) {
    KvcUartRing r;
    uint8_t buf[8];
    uint8_t out = 0;
    const uint8_t seq[5] = { 0x11U, 0x22U, 0x33U, 0x44U, 0x55U };
    int i;

    printf("[2] Thứ tự FIFO\n");
    (void)kvc_ring_init(&r, buf, 8U);

    for (i = 0; i < 5; i++) {
        TEST_ASSERT(kvc_ring_push_from_isr(&r, seq[i]) == true, "push phải thành công khi còn chỗ");
    }
    TEST_ASSERT(kvc_ring_count(&r) == 5U, "count phải bằng 5");

    for (i = 0; i < 5; i++) {
        TEST_ASSERT(kvc_ring_pop(&r, &out) == true, "pop phải thành công");
        TEST_ASSERT(out == seq[i], "byte ra phải đúng thứ tự FIFO");
    }
    TEST_ASSERT(kvc_ring_pop(&r, &out) == false, "pop trên ring rỗng phải trả false");
}

/* ---------- 3. Wrap-around ---------- */
static void test_wraparound(void) {
    KvcUartRing r;
    uint8_t buf[8];
    uint8_t out = 0;
    int round;

    printf("[3] Wrap-around\n");
    (void)kvc_ring_init(&r, buf, 8U);

    /* Đẩy/rút lệch pha nhiều vòng để head/tail quay vòng qua cuối buffer */
    for (round = 0; round < 20; round++) {
        uint8_t base = (uint8_t)(round * 5);
        int i;
        for (i = 0; i < 5; i++) {
            TEST_ASSERT(kvc_ring_push_from_isr(&r, (uint8_t)(base + i)) == true,
                        "push phải thành công trong nhiều vòng");
        }
        for (i = 0; i < 5; i++) {
            TEST_ASSERT(kvc_ring_pop(&r, &out) == true, "pop phải thành công");
            TEST_ASSERT(out == (uint8_t)(base + i), "byte phải đúng sau wrap-around");
        }
    }
    TEST_ASSERT(r.dropped == 0U, "không được bỏ byte khi consumer theo kịp");
}

/* ---------- 4. Tràn ring ---------- */
static void test_overflow(void) {
    KvcUartRing r;
    uint8_t buf[8];
    uint8_t out = 0;
    uint32_t accepted = 0;
    int i;

    printf("[4] Tràn ring\n");
    (void)kvc_ring_init(&r, buf, 8U);

    for (i = 0; i < 20; i++) {
        if (kvc_ring_push_from_isr(&r, (uint8_t)i)) {
            accepted++;
        }
    }

    /* size 8 -> giữ được tối đa 7 phần tử */
    TEST_ASSERT(accepted == 7U, "chỉ 7 byte được nhận với size=8");
    TEST_ASSERT(kvc_ring_count(&r) == 7U, "count phải bằng 7");
    TEST_ASSERT(r.dropped == 13U, "dropped phải bằng số byte bị từ chối");
    TEST_ASSERT(kvc_ring_free(&r) == 0U, "free phải bằng 0 khi đầy");

    /* Rút hết: nội dung phải là 7 byte đầu, không bị ghi đè */
    for (i = 0; i < 7; i++) {
        TEST_ASSERT(kvc_ring_pop(&r, &out) == true, "pop phải thành công");
        TEST_ASSERT(out == (uint8_t)i, "byte đầu phải được giữ nguyên, byte mới bị bỏ");
    }
}

/* ---------- 5. Reset ---------- */
static void test_reset(void) {
    KvcUartRing r;
    uint8_t buf[8];
    uint8_t out = 0;

    printf("[5] Reset\n");
    (void)kvc_ring_init(&r, buf, 8U);
    (void)kvc_ring_push_from_isr(&r, 0xAAU);
    (void)kvc_ring_push_from_isr(&r, 0xBBU);

    kvc_ring_reset(&r);
    TEST_ASSERT(kvc_ring_count(&r) == 0U, "reset phải xoá count");
    TEST_ASSERT(r.dropped == 0U, "reset phải xoá dropped");
    TEST_ASSERT(kvc_ring_pop(&r, &out) == false, "sau reset phải rỗng");

    /* Ring phải dùng lại được bình thường */
    TEST_ASSERT(kvc_ring_push_from_isr(&r, 0xCCU) == true, "push sau reset phải thành công");
    TEST_ASSERT(kvc_ring_pop(&r, &out) == true && out == 0xCCU, "byte sau reset phải đúng");
}

/* ---------- 6. SPSC xen kẽ ---------- */
static void test_interleaved(void) {
    KvcUartRing r;
    uint8_t buf[32];
    uint32_t produced = 0;
    uint32_t consumed = 0;
    uint8_t expected_next = 0;
    bool order_ok = true;
    int tick;

    printf("[6] SPSC xen kẽ\n");
    (void)kvc_ring_init(&r, buf, 32U);

    /* Producer đẩy 5 byte mỗi nhịp, consumer rút 5 byte mỗi nhịp -> cân bằng */
    for (tick = 0; tick < 200; tick++) {
        int i;
        for (i = 0; i < 5; i++) {
            if (kvc_ring_push_from_isr(&r, (uint8_t)(produced & 0xFFU))) {
                produced++;
            }
        }
        for (i = 0; i < 5; i++) {
            uint8_t b;
            if (kvc_ring_pop(&r, &b)) {
                if (b != expected_next) {
                    order_ok = false;
                }
                expected_next = (uint8_t)(expected_next + 1U);
                consumed++;
            }
        }
    }

    TEST_ASSERT(r.dropped == 0U, "nhịp cân bằng không được bỏ byte");
    TEST_ASSERT(produced == consumed, "số byte sản xuất phải bằng số tiêu thụ");
    TEST_ASSERT(produced == 1000U, "phải đúng 1000 byte qua ring");
    TEST_ASSERT(order_ok, "thứ tự byte phải nguyên vẹn qua 200 nhịp");
}

/* ---------- 7. Mô phỏng cửa sổ chặn (TX LoRa 300 ms) ---------- */
static void test_block_window(void) {
    KvcUartRing r;
    uint8_t buf[256];
    uint32_t pushed_ok = 0;
    int i;

    printf("[7] Cửa sổ chặn\n");
    (void)kvc_ring_init(&r, buf, 256U);

    /* 300 ms x 3840 byte/s = 1152 byte tới trong lúc main chặn.
     * Với ring 256 byte (mô phỏng thu nhỏ), chỉ 255 byte sống sót. */
    for (i = 0; i < 1152; i++) {
        if (kvc_ring_push_from_isr(&r, (uint8_t)(i & 0xFF))) {
            pushed_ok++;
        }
    }

    TEST_ASSERT(pushed_ok == 255U, "ring 256 giữ được 255 byte");
    TEST_ASSERT(r.dropped == (1152U - 255U), "dropped phải bằng phần vượt sức chứa");
    TEST_ASSERT(kvc_ring_count(&r) == 255U, "count phải bằng 255");
}

/* ---------- 8. Biên: size 2 ---------- */
static void test_min_size(void) {
    KvcUartRing r;
    uint8_t buf[2];
    uint8_t out = 0;

    printf("[8] Biên size=2\n");
    (void)kvc_ring_init(&r, buf, 2U);

    TEST_ASSERT(kvc_ring_push_from_isr(&r, 0x01U) == true, "push thứ nhất phải thành công");
    TEST_ASSERT(kvc_ring_push_from_isr(&r, 0x02U) == false, "push thứ hai phải thất bại (đầy)");
    TEST_ASSERT(r.dropped == 1U, "dropped phải bằng 1");
    TEST_ASSERT(kvc_ring_pop(&r, &out) == true && out == 0x01U, "byte đầu phải đúng");
    TEST_ASSERT(kvc_ring_push_from_isr(&r, 0x03U) == true, "sau khi rút phải push được");
    TEST_ASSERT(kvc_ring_pop(&r, &out) == true && out == 0x03U, "byte sau phải đúng");
}

int main(void) {
    printf("=== KVC-M2 Host Test: UART RX Ring Buffer ===\n\n");

    test_init();
    test_fifo_order();
    test_wraparound();
    test_overflow();
    test_reset();
    test_interleaved();
    test_block_window();
    test_min_size();

    printf("\n=== Kết quả: %d/%d assert PASS ===\n", s_tests_passed, s_tests_run);
    if (s_tests_passed != s_tests_run) {
        printf("*** CÓ TEST FAIL ***\n");
        return 1;
    }
    printf("TẤT CẢ PASS\n");
    return 0;
}
