/**
 * @file test_ws_route.cpp
 * @brief Host Unit Test cho quy tắc path WebSocket `/telemetry` (IF-03).
 *
 * Kiểm tra:
 * 1. Chấp nhận đúng `/telemetry`.
 * 2. Chấp nhận `/telemetry?query` (client tự thêm cache-buster).
 * 3. Từ chối `/`, path rỗng, `/telemetry/`, `/Telemetry`, path dài hơn.
 * 4. Từ chối NULL và length không khớp chuỗi thật.
 *
 * Biên dịch (từ thư mục gốc repo):
 *   g++ -std=c++17 -Wall -Wextra -O2 -Ifirmware/gateway_esp32/src `
 *       firmware/gateway_esp32/host_tests/test_ws_route.cpp `
 *       firmware/gateway_esp32/src/ws_route.cpp -o test_ws_route.exe
 */

#include "ws_route.h"

#include <cstdio>
#include <cstring>

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

namespace {

bool accepts(const char *s) {
    return kvc::isAcceptedTelemetryPath(s, std::strlen(s));
}

void test_accept() {
    std::printf("[1] Path hop le\n");

    TEST_ASSERT(accepts("/telemetry"), "phai chap nhan /telemetry");
    TEST_ASSERT(accepts("/telemetry?ts=1"), "phai chap nhan query string");
    TEST_ASSERT(accepts("/telemetry?"), "phai chap nhan query rong");
}

void test_reject() {
    std::printf("[2] Path khong hop le\n");

    TEST_ASSERT(!accepts("/"), "phai tu choi /");
    TEST_ASSERT(!accepts(""), "phai tu choi path rong");
    TEST_ASSERT(!accepts("/telemetry/"), "phai tu choi /telemetry/");
    TEST_ASSERT(!accepts("/Telemetry"), "path phan biet hoa thuong");
    TEST_ASSERT(!accepts("/ws/telemetry"), "phai tu choi /ws/telemetry");
    TEST_ASSERT(!accepts("/telemetryX"), "phai tu choi /telemetryX");
    TEST_ASSERT(!accepts("telemetry"), "phai tu choi path khong co /");
}

void test_bounds() {
    std::printf("[3] Tham so bien\n");

    TEST_ASSERT(!kvc::isAcceptedTelemetryPath(nullptr, 10U),
                "NULL phai tra ve false");

    const char *full = "/telemetry?x=1";
    TEST_ASSERT(!kvc::isAcceptedTelemetryPath(full, 4U),
                "length ngan hon thuc te phai tu choi");
    TEST_ASSERT(kvc::isAcceptedTelemetryPath(full, 10U),
                "length dung phan path phai chap nhan");
    TEST_ASSERT(kvc::isAcceptedTelemetryPath(full, std::strlen(full)),
                "length day du phai chap nhan");
}

} // namespace

int main() {
    std::printf("================================================================\n");
    std::printf("  KVC gateway ws_route - Host Unit Tests (IF-03)\n");
    std::printf("  Endpoint duy nhat: ws://<ip>:8080/telemetry\n");
    std::printf("================================================================\n");

    test_accept();
    test_reject();
    test_bounds();

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
