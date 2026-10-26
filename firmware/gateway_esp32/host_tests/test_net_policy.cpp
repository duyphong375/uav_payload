/**
 * @file test_net_policy.cpp
 * @brief Host Unit Test cho thứ tự ưu tiên mạng (STA trước, SoftAP dự phòng).
 *
 * Kiểm tra:
 * 1. Chưa cấu hình STA -> không hành động (SoftAP là phương án duy nhất).
 * 2. STA nối được, SoftAP chưa phát -> None.
 * 3. STA nối được, SoftAP đang phát -> CloseSoftAp (không phát sóng thừa).
 * 4. STA chưa nối, chưa tới chu kỳ -> None.
 * 5. STA chưa nối, tới chu kỳ -> RetrySta.
 * 6. Không ưu tiên STA khi chưa cấu hình, kể cả đã quá chu kỳ.
 * 7. retryIntervalMs = 0 -> thử lại mỗi lần gọi.
 * 8. Wrap 2^32 của millis() vẫn tính đúng chu kỳ.
 *
 * Biên dịch (từ thư mục gốc repo):
 *   g++ -std=c++17 -Wall -Wextra -O2 -Ifirmware/gateway_esp32/src `
 *       firmware/gateway_esp32/host_tests/test_net_policy.cpp `
 *       firmware/gateway_esp32/src/net_policy.cpp -o test_net_policy.exe
 */

#include "net_policy.h"

#include <cstdio>

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

using kvc::NetAction;
using kvc::NetPolicyState;
using kvc::netPolicyEvaluate;

static constexpr uint32_t kRetry = 30000;

/* Trạng thái nền: đã cấu hình STA, chưa nối, chưa phát AP. */
static NetPolicyState base() {
    NetPolicyState s;
    s.staConfigured = true;
    s.staConnected = false;
    s.apStarted = false;
    s.lastStaAttemptMs = 0;
    return s;
}

/* ---------- 1. Chưa cấu hình STA ---------- */
static void test_not_configured() {
    std::printf("[1] Chua cau hinh STA\n");

    NetPolicyState s = base();
    s.staConfigured = false;
    s.apStarted = true;

    TEST_ASSERT(netPolicyEvaluate(s, 100000, kRetry) == NetAction::None,
                "khong co credential STA thi khong lam gi");
    TEST_ASSERT(netPolicyEvaluate(s, 0, kRetry) == NetAction::None,
                "khong co credential STA thi khong lam gi o moi moc thoi gian");
}

/* ---------- 2. STA nối được, không phát AP ---------- */
static void test_sta_up_no_ap() {
    std::printf("[2] STA noi duoc, khong phat AP\n");

    NetPolicyState s = base();
    s.staConnected = true;

    TEST_ASSERT(netPolicyEvaluate(s, 100000, kRetry) == NetAction::None,
                "STA dang chay va khong co AP thi khong can lam gi");
}

/* ---------- 3. STA nối được, đang phát AP -> đóng AP ---------- */
static void test_close_ap_when_sta_recovers() {
    std::printf("[3] STA noi lai duoc -> dong SoftAP\n");

    NetPolicyState s = base();
    s.staConnected = true;
    s.apStarted = true;

    TEST_ASSERT(netPolicyEvaluate(s, 100000, kRetry) == NetAction::CloseSoftAp,
                "STA hoat dong lai thi phai dong SoftAP du phong");
}

/* ---------- 4. Chưa tới chu kỳ thử lại ---------- */
static void test_retry_not_due() {
    std::printf("[4] Chua toi chu ky thu lai\n");

    NetPolicyState s = base();
    s.lastStaAttemptMs = 10000;

    TEST_ASSERT(netPolicyEvaluate(s, 20000, kRetry) == NetAction::None,
                "moi 10 s chua toi chu ky 30 s thi khong thu lai");
    TEST_ASSERT(netPolicyEvaluate(s, 39999, kRetry) == NetAction::None,
                "39999 - 10000 = 29999 < 30000 nen khong thu lai");
}

/* ---------- 5. Tới chu kỳ thử lại ---------- */
static void test_retry_due() {
    std::printf("[5] Toi chu ky thu lai\n");

    NetPolicyState s = base();
    s.lastStaAttemptMs = 10000;

    TEST_ASSERT(netPolicyEvaluate(s, 40000, kRetry) == NetAction::RetrySta,
                "dung 30000 ms thi phai thu lai");
    TEST_ASSERT(netPolicyEvaluate(s, 60000, kRetry) == NetAction::RetrySta,
                "qua chu ky thi phai thu lai");

    /* SoftAP đang phát không chặn việc thử lại STA (ưu tiên 1 vẫn được theo đuổi). */
    s.apStarted = true;
    TEST_ASSERT(netPolicyEvaluate(s, 40000, kRetry) == NetAction::RetrySta,
                "dang phat SoftAP van phai thu lai STA");
}

/* ---------- 6. retryIntervalMs = 0 ---------- */
static void test_retry_interval_zero() {
    std::printf("[6] Chu ky thu lai bang 0\n");

    NetPolicyState s = base();
    s.lastStaAttemptMs = 5000;

    TEST_ASSERT(netPolicyEvaluate(s, 5000, 0) == NetAction::RetrySta,
                "chu ky 0 thi thu lai moi lan goi");
}

/* ---------- 7. Wrap 2^32 ---------- */
static void test_wrap() {
    std::printf("[7] Wrap millis() qua 2^32\n");

    NetPolicyState s = base();
    s.lastStaAttemptMs = 0xFFFFFF00u; /* Sát ngưỡng tràn */

    /* 0xFFFFFF00 + 30000 = 0x... tràn về 0x6EE0 -> hiệu không dấu = 30000. */
    const uint32_t now = s.lastStaAttemptMs + 30000u;
    TEST_ASSERT(netPolicyEvaluate(s, now, kRetry) == NetAction::RetrySta,
                "qua nguong tran van phai tinh dung chu ky");

    const uint32_t justBefore = s.lastStaAttemptMs + 29999u;
    TEST_ASSERT(netPolicyEvaluate(s, justBefore, kRetry) == NetAction::None,
                "truoc nguong tran 1 ms van chua toi chu ky");
}

/* ---------- 8. Chọn mạng kế tiếp trong danh sách ---------- */
static void test_next_network() {
    std::printf("[8] Chon mang ke tiep (danh sach nhieu mang)\n");

    /* 4 ô, chỉ khai báo ô 0 và ô 2 (giống cấu hình 2 mạng rời rạc). */
    const char *const ssids[4] = {"hotspot-dien-thoai", "", "wifi-lab", ""};

    TEST_ASSERT(kvc::netNextConfiguredIndex(ssids, 4, 0) == 0,
                "bat dau tu 0 phai chon o 0");
    TEST_ASSERT(kvc::netNextConfiguredIndex(ssids, 4, 1) == 2,
                "o 1 rong thi nhay sang o 2");
    TEST_ASSERT(kvc::netNextConfiguredIndex(ssids, 4, 3) == 0,
                "duyet vong tron: tu o 3 quay ve o 0");
    TEST_ASSERT(kvc::netNextConfiguredIndex(ssids, 4, 4) == 0,
                "afterIndex = count phai quy ve dau danh sach");

    /* Chỉ khai báo 1 mạng: mọi afterIndex đều trả về ô đó (thử lại cùng mạng). */
    const char *const one[4] = {"", "wifi-lab", "", ""};
    TEST_ASSERT(kvc::netNextConfiguredIndex(one, 4, 0) == 1, "chi co 1 mang");
    TEST_ASSERT(kvc::netNextConfiguredIndex(one, 4, 2) == 1,
                "chi co 1 mang thi luon tra ve o 1");

    /* Không khai báo mạng nào -> trả về count (báo "hết"). */
    const char *const none[4] = {"", "", "", ""};
    TEST_ASSERT(kvc::netNextConfiguredIndex(none, 4, 0) == 4,
                "khong co mang nao thi tra ve count");

    /* Phần tử NULL phải được coi là không khai báo, không được deref. */
    const char *const withNull[3] = {nullptr, "wifi-lab", nullptr};
    TEST_ASSERT(kvc::netNextConfiguredIndex(withNull, 3, 0) == 1,
                "con tro NULL phai bi bo qua");

    /* Tham số không hợp lệ. */
    TEST_ASSERT(kvc::netNextConfiguredIndex(nullptr, 4, 0) == 4,
                "mang NULL tra ve count");
    TEST_ASSERT(kvc::netNextConfiguredIndex(ssids, 0, 0) == 0,
                "count 0 tra ve 0");
}

int main() {
    std::printf("================================================================\n");
    std::printf("  KVC gateway net_policy - Host Unit Tests\n");
    std::printf("  Thu tu uu tien: 1) STA 2.4 GHz, 2) SoftAP du phong\n");
    std::printf("================================================================\n");

    test_not_configured();
    test_sta_up_no_ap();
    test_close_ap_when_sta_recovers();
    test_retry_not_due();
    test_retry_due();
    test_retry_interval_zero();
    test_wrap();
    test_next_network();

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
