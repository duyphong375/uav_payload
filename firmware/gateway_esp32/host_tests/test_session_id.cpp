/**
 * @file test_session_id.cpp
 * @brief Host Unit Test cho `gateway_session_id` (IF-03 mục 3).
 *
 * Kiểm tra:
 * 1. Hàm thuần: cùng entropy -> cùng id.
 * 2. Miền giá trị: id luôn >= 2 (không bao giờ 0 hay 1).
 * 3. Đổi nonce -> đổi id (mô phỏng hai lần boot khác nhau).
 * 4. Đổi MAC -> đổi id (mô phỏng hai board khác nhau).
 * 5. Avalanche: MAC lệch 1 bit không cho id gần nhau.
 * 6. 4 096 lần boot mô phỏng -> không trùng id.
 * 7. Miền entropy biên (0, UINT32_MAX) vẫn cho id hợp lệ.
 *
 * Biên dịch (từ thư mục gốc repo):
 *   g++ -std=c++17 -Wall -Wextra -O2 -Ifirmware/gateway_esp32/src `
 *       firmware/gateway_esp32/host_tests/test_session_id.cpp `
 *       firmware/gateway_esp32/src/session_id.cpp -o test_session_id.exe
 */

#include "session_id.h"

#include <cstdio>
#include <cstdlib>

static int s_tests_run = 0;
static int s_tests_passed = 0;

#define TEST_ASSERT(cond, msg) do { \
    s_tests_run++; \
    if (!(cond)) { \
        std::printf("  [FAIL] Line %d: %s\n", __LINE__, msg); \
    } else { \
        s_tests_passed++; \
    } \
} while (0)

using kvc::deriveGatewaySessionId;
using kvc::kGatewaySessionIdMin;

/* MAC mẫu của ESP32-C3, dạng 48-bit tách thành hai tham số. */
static constexpr uint32_t kMacLow = 0x12345678U;
static constexpr uint32_t kMacHigh = 0x0000A1B2U;
static constexpr uint32_t kNonce = 0xC0FFEE01U;

/* ---------- 1. Hàm thuần ---------- */
static void test_deterministic() {
    std::printf("[1] Cung entropy -> cung id\n");

    const uint32_t a = deriveGatewaySessionId(kNonce, kMacLow, kMacHigh);
    const uint32_t b = deriveGatewaySessionId(kNonce, kMacLow, kMacHigh);
    TEST_ASSERT(a == b, "goi lai voi cung tham so phai cho cung ket qua");

    /* Lặp 100 lần để chắc chắn không có trạng thái ẩn. */
    for (int i = 0; i < 100; i++) {
        if (deriveGatewaySessionId(kNonce, kMacLow, kMacHigh) != a) {
            TEST_ASSERT(false, "ket qua phai on dinh qua nhieu lan goi");
            return;
        }
    }
    TEST_ASSERT(true, "ket qua on dinh qua 100 lan goi");
}

/* ---------- 2. Miền giá trị ---------- */
static void test_range() {
    std::printf("[2] Mien gia tri hop le\n");

    TEST_ASSERT(kGatewaySessionIdMin == 2U, "nguong toi thieu phai la 2");

    /* Quét một loạt entropy, kể cả các giá trị biên. */
    const uint32_t nonces[] = {0U, 1U, 2U, 0x7FFFFFFFU, 0x80000000U,
                               0xFFFFFFFEU, 0xFFFFFFFFU, kNonce};
    for (size_t i = 0; i < sizeof(nonces) / sizeof(nonces[0]); i++) {
        const uint32_t id = deriveGatewaySessionId(nonces[i], kMacLow, kMacHigh);
        TEST_ASSERT(id >= kGatewaySessionIdMin,
                    "id phai >= 2 voi moi nonce (khong duoc 0 hoac 1)");
    }

    const uint32_t macLows[] = {0U, 0xFFFFFFFFU, kMacLow};
    for (size_t i = 0; i < sizeof(macLows) / sizeof(macLows[0]); i++) {
        const uint32_t id = deriveGatewaySessionId(kNonce, macLows[i], 0U);
        TEST_ASSERT(id >= kGatewaySessionIdMin, "id phai hop le voi moi MAC");
    }
}

/* ---------- 3. Đổi nonce ---------- */
static void test_nonce_changes_id() {
    std::printf("[3] Doi nonce -> doi id (hai lan boot khac nhau)\n");

    const uint32_t base = deriveGatewaySessionId(kNonce, kMacLow, kMacHigh);
    TEST_ASSERT(deriveGatewaySessionId(kNonce + 1U, kMacLow, kMacHigh) != base,
                "nonce khac phai cho id khac");
    TEST_ASSERT(deriveGatewaySessionId(0U, kMacLow, kMacHigh) != base,
                "nonce 0 phai cho id khac nonce thuong");

    /* 256 lần boot liên tiếp trên cùng board: mọi id phải khác nhau. */
    bool allDistinct = true;
    for (uint32_t k = 0; k < 256U; k++) {
        const uint32_t id = deriveGatewaySessionId(k * 0x9E3779B9U, kMacLow,
                                                   kMacHigh);
        if (id == base) {
            allDistinct = false;
        }
    }
    TEST_ASSERT(allDistinct, "khong lan boot nao duoc trung id voi lan dau");
}

/* ---------- 4. Đổi MAC ---------- */
static void test_mac_changes_id() {
    std::printf("[4] Doi MAC -> doi id (hai board khac nhau)\n");

    const uint32_t base = deriveGatewaySessionId(kNonce, kMacLow, kMacHigh);
    TEST_ASSERT(deriveGatewaySessionId(kNonce, kMacLow + 1U, kMacHigh) != base,
                "MAC low khac phai cho id khac");
    TEST_ASSERT(deriveGatewaySessionId(kNonce, kMacLow, kMacHigh + 1U) != base,
                "MAC high khac phai cho id khac");
    TEST_ASSERT(deriveGatewaySessionId(kNonce, kMacLow, 0U) != base,
                "MAC high = 0 phai cho id khac");
}

/* ---------- 5. Avalanche ---------- */
static void test_avalanche() {
    std::printf("[5] MAC lech 1 bit -> id khac xa\n");

    /* Đếm số bit khác nhau giữa hai id khi MAC chỉ lệch 1 bit. Kỳ vọng trung
     * bình ~16/32 bit; đặt ngưỡng thấp (>= 6) để test không phụ thuộc một mẫu. */
    const uint32_t base = deriveGatewaySessionId(kNonce, kMacLow, kMacHigh);
    int minBitDiff = 32;
    for (int bit = 0; bit < 32; bit++) {
        const uint32_t other = deriveGatewaySessionId(
            kNonce, kMacLow ^ (1U << bit), kMacHigh);
        const uint32_t diff = base ^ other;
        int count = 0;
        for (int b = 0; b < 32; b++) {
            if ((diff >> b) & 1U) {
                count++;
            }
        }
        if (count < minBitDiff) {
            minBitDiff = count;
        }
    }
    std::printf("       (info) bit khac nhau it nhat: %d/32\n", minBitDiff);
    TEST_ASSERT(minBitDiff >= 6,
                "moi thay doi 1 bit cua MAC phai khuech tan ra >= 6 bit");
}

/* ---------- 6. Không trùng trong nhiều lần boot ---------- */
static void test_no_collision() {
    std::printf("[6] 4096 lan boot mo phong -> khong trung id\n");

    constexpr size_t kBoots = 4096;
    uint32_t *ids = (uint32_t *)std::malloc(kBoots * sizeof(uint32_t));
    if (ids == nullptr) {
        TEST_ASSERT(false, "khong cap phat duoc bo nho cho test");
        return;
    }

    /* Sinh nonce bằng LCG để tái lập được, không phụ thuộc rand() của máy. */
    uint32_t seed = 0x12345678U;
    for (size_t i = 0; i < kBoots; i++) {
        seed = seed * 1664525U + 1013904223U;
        ids[i] = deriveGatewaySessionId(seed, kMacLow, kMacHigh);
    }

    bool duplicate = false;
    bool outOfRange = false;
    for (size_t i = 0; i < kBoots; i++) {
        if (ids[i] < kGatewaySessionIdMin) {
            outOfRange = true;
        }
        for (size_t j = i + 1; j < kBoots; j++) {
            if (ids[i] == ids[j]) {
                duplicate = true;
            }
        }
    }

    std::free(ids);

    TEST_ASSERT(!outOfRange, "moi id trong 4096 lan boot deu phai >= 2");
    TEST_ASSERT(!duplicate, "khong duoc trung id trong 4096 lan boot");
}

/* ---------- 7. Entropy biên ---------- */
static void test_edge_entropy() {
    std::printf("[7] Entropy bien (0 va UINT32_MAX)\n");

    const uint32_t zero = deriveGatewaySessionId(0U, 0U, 0U);
    const uint32_t ones =
        deriveGatewaySessionId(0xFFFFFFFFU, 0xFFFFFFFFU, 0xFFFFU);

    TEST_ASSERT(zero >= kGatewaySessionIdMin,
                "entropy toan 0 van phai cho id hop le");
    TEST_ASSERT(ones >= kGatewaySessionIdMin,
                "entropy toan 1 van phai cho id hop le");
    TEST_ASSERT(zero != ones, "hai dau mut entropy phai cho id khac nhau");

    /* Chỉ có 16 bit MAC high: phần cao hơn phải bị bỏ qua, không gây lệch. */
    TEST_ASSERT(deriveGatewaySessionId(kNonce, kMacLow, 0x0001FFFFU) ==
                    deriveGatewaySessionId(kNonce, kMacLow, 0xFFFFU),
                "chi 16 bit thap cua MAC high duoc dung");
}

int main() {
    std::printf("================================================================\n");
    std::printf("  KVC gateway session_id - Host Unit Tests (IF-03 muc 3)\n");
    std::printf("  gateway_session_id phai doi sau moi lan ESP32 reboot\n");
    std::printf("================================================================\n");

    test_deterministic();
    test_range();
    test_nonce_changes_id();
    test_mac_changes_id();
    test_avalanche();
    test_no_collision();
    test_edge_entropy();

    std::printf("================================================================\n");
    std::printf("  Results: %d/%d assertions PASSED\n", s_tests_passed,
                s_tests_run);
    std::printf("================================================================\n");

    if (s_tests_passed != s_tests_run) {
        std::printf(">>> CO %d ASSERT THAT BAI!\n", s_tests_run - s_tests_passed);
        return 1;
    }
    std::printf(">>> ALL TESTS PASSED SUCCESSFULLY! <<<\n");
    return 0;
}
