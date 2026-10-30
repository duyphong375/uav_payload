/**
 * @file test_rf_decode.cpp
 * @brief Host Unit Test cho module giải mã RF 32 byte (IF-02) của Gateway.
 *
 * Chạy được trên PC, không cần ESP32. Kiểm tra:
 * 1. Layout ABI: sizeof == 32 và offset từng trường khớp IF-02.
 * 2. CRC-16/CCITT-FALSE: giá trị chuẩn "123456789" = 0x29B1.
 * 3. Golden vector GV-02: CRC 0xE260 và chuỗi hex 64 ký tự khớp IF-02 mục 3.
 * 4. validatePacketCrc: chấp nhận gói đúng, từ chối sai độ dài/sync/CRC.
 * 5. bytesToHexString: đúng 64 ký tự, chữ thường, zero-padded, chặn tràn đệm.
 * 6. matchesGoldenGv02: đúng với GV-02 và sai khi lệch một trường.
 *
 * Biên dịch (từ thư mục gốc repo):
 *   g++ -std=c++17 -Wall -Wextra -O2 -Ifirmware/gateway_esp32/src `
 *       firmware/gateway_esp32/host_tests/test_rf_decode.cpp `
 *       firmware/gateway_esp32/src/rf_decode.cpp -o test_rf_decode.exe
 */

#include "rf_decode.h"

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

/* Dựng golden vector GV-02 theo đúng IF-02 mục 3 (byte 25 reserved = 0). */
kvc::RfTelemetryPacket32 make_golden_gv02() {
    kvc::RfTelemetryPacket32 pkt;
    std::memset(&pkt, 0, sizeof(pkt));

    pkt.sync[0] = 0xAA;
    pkt.sync[1] = 0x55;
    pkt.msg_id = 0x01;
    pkt.seq_num = 42;
    pkt.timestamp_ms = 1000;
    pkt.target_lat = 107723450;
    pkt.target_lon = 1066578900;
    pkt.target_x_local = 150;
    pkt.target_y_local = 320;
    pkt.alt_dist_cm = 240;
    pkt.class_id = 1;
    pkt.confidence = 92;
    pkt.sensor_flags = 0x0F;
    pkt.status_reserved = 0;
    pkt.crc16 = kvc::calculateCrc16(reinterpret_cast<const uint8_t *>(&pkt),
                                    kvc::kRfCrcCoverage);
    return pkt;
}

constexpr const char *kGoldenGv02Hex =
    "aa55012ae8030000baba6b06d4b3923f96004001f000015c0f000000000060e2";

/* ---------- 1. Layout ABI ---------- */
void test_layout() {
    std::printf("[1] Layout ABI IF-02\n");

    TEST_ASSERT(sizeof(kvc::RfTelemetryPacket32) == 32U,
                "sizeof phai dung 32 byte");
    TEST_ASSERT(offsetof(kvc::RfTelemetryPacket32, sync) == 0U, "sync @0");
    TEST_ASSERT(offsetof(kvc::RfTelemetryPacket32, msg_id) == 2U, "msg_id @2");
    TEST_ASSERT(offsetof(kvc::RfTelemetryPacket32, seq_num) == 3U, "seq_num @3");
    TEST_ASSERT(offsetof(kvc::RfTelemetryPacket32, timestamp_ms) == 4U,
                "timestamp_ms @4");
    TEST_ASSERT(offsetof(kvc::RfTelemetryPacket32, target_lat) == 8U,
                "target_lat @8");
    TEST_ASSERT(offsetof(kvc::RfTelemetryPacket32, target_lon) == 12U,
                "target_lon @12");
    TEST_ASSERT(offsetof(kvc::RfTelemetryPacket32, target_x_local) == 16U,
                "target_x_local @16");
    TEST_ASSERT(offsetof(kvc::RfTelemetryPacket32, target_y_local) == 18U,
                "target_y_local @18");
    TEST_ASSERT(offsetof(kvc::RfTelemetryPacket32, alt_dist_cm) == 20U,
                "alt_dist_cm @20");
    TEST_ASSERT(offsetof(kvc::RfTelemetryPacket32, class_id) == 22U,
                "class_id @22");
    TEST_ASSERT(offsetof(kvc::RfTelemetryPacket32, confidence) == 23U,
                "confidence @23");
    TEST_ASSERT(offsetof(kvc::RfTelemetryPacket32, sensor_flags) == 24U,
                "sensor_flags @24");
    TEST_ASSERT(offsetof(kvc::RfTelemetryPacket32, status_reserved) == 25U,
                "status_reserved @25");
    TEST_ASSERT(offsetof(kvc::RfTelemetryPacket32, reserved) == 26U,
                "reserved @26");
    TEST_ASSERT(offsetof(kvc::RfTelemetryPacket32, crc16) == 30U, "crc16 @30");
}

/* ---------- 2. CRC chuẩn ---------- */
void test_crc_known_value() {
    std::printf("[2] CRC-16/CCITT-FALSE gia tri chuan\n");

    const char *check = "123456789";
    const uint16_t crc = kvc::calculateCrc16(
        reinterpret_cast<const uint8_t *>(check), std::strlen(check));
    TEST_ASSERT(crc == 0x29B1U, "CRC cua \"123456789\" phai la 0x29B1");

    TEST_ASSERT(kvc::calculateCrc16(nullptr, 5U) == 0xFFFFU,
                "con tro NULL phai tra ve gia tri khoi tao 0xFFFF");
    TEST_ASSERT(kvc::calculateCrc16(reinterpret_cast<const uint8_t *>(check), 0U)
                    == 0xFFFFU,
                "do dai 0 phai tra ve gia tri khoi tao 0xFFFF");
}

/* ---------- 3. Golden vector GV-02 ---------- */
void test_golden_vector() {
    std::printf("[3] Golden vector GV-02\n");

    const kvc::RfTelemetryPacket32 pkt = make_golden_gv02();
    TEST_ASSERT(pkt.crc16 == kvc::kGoldenGv02Crc16, "CRC GV-02 phai la 0xE260");
    TEST_ASSERT(kvc::matchesGoldenGv02(&pkt),
                "matchesGoldenGv02 phai nhan dien dung GV-02");

    char hex[sizeof(pkt) * 2 + 1] = {0};
    const bool ok = kvc::bytesToHexString(
        reinterpret_cast<const uint8_t *>(&pkt), sizeof(pkt), hex, sizeof(hex));
    TEST_ASSERT(ok, "phai ma hoa hex duoc");
    TEST_ASSERT(std::strlen(hex) == 64U, "chuoi hex phai dai 64 ky tu");
    TEST_ASSERT(std::strcmp(hex, kGoldenGv02Hex) == 0,
                "chuoi hex phai khop GV-02 cua IF-02");
}

/* ---------- 4. validatePacketCrc ---------- */
void test_validate() {
    std::printf("[4] validatePacketCrc\n");

    const kvc::RfTelemetryPacket32 pkt = make_golden_gv02();
    const uint8_t *raw = reinterpret_cast<const uint8_t *>(&pkt);

    TEST_ASSERT(kvc::validatePacketCrc(raw, sizeof(pkt)),
                "goi GV-02 phai hop le");

    TEST_ASSERT(!kvc::validatePacketCrc(raw, 31U),
                "do dai 31 phai bi tu choi");
    TEST_ASSERT(!kvc::validatePacketCrc(raw, 33U),
                "do dai 33 phai bi tu choi");
    TEST_ASSERT(!kvc::validatePacketCrc(nullptr, sizeof(pkt)),
                "con tro NULL phai bi tu choi");

    uint8_t badSync[sizeof(pkt)];
    std::memcpy(badSync, &pkt, sizeof(pkt));
    badSync[1] = 0x56U;
    TEST_ASSERT(!kvc::validatePacketCrc(badSync, sizeof(badSync)),
                "sai sync phai bi tu choi");

    uint8_t badCrc[sizeof(pkt)];
    std::memcpy(badCrc, &pkt, sizeof(pkt));
    badCrc[10] ^= 0x01U;
    TEST_ASSERT(!kvc::validatePacketCrc(badCrc, sizeof(badCrc)),
                "dao 1 bit trong vung CRC phai bi tu choi");

    uint8_t badCrcField[sizeof(pkt)];
    std::memcpy(badCrcField, &pkt, sizeof(pkt));
    badCrcField[30] ^= 0xFFU;
    TEST_ASSERT(!kvc::validatePacketCrc(badCrcField, sizeof(badCrcField)),
                "sai byte CRC phai bi tu choi");
}

/* ---------- 5. bytesToHexString ---------- */
void test_hex_encoding() {
    std::printf("[5] bytesToHexString\n");

    const uint8_t data[3] = {0x00U, 0x0FU, 0xA5U};
    char out[7] = {0};

    TEST_ASSERT(kvc::bytesToHexString(data, 3U, out, sizeof(out)),
                "phai ma hoa duoc 3 byte");
    TEST_ASSERT(std::strcmp(out, "000fa5") == 0,
                "phai la chu thuong, zero-padded");

    char exact[7] = {0};
    TEST_ASSERT(kvc::bytesToHexString(data, 3U, exact, 7U),
                "vua du bo dem phai thanh cong");

    char tight[6] = {0};
    TEST_ASSERT(!kvc::bytesToHexString(data, 3U, tight, sizeof(tight)),
                "thieu 1 byte bo dem phai bi tu choi");

    char tiny[2] = {0};
    TEST_ASSERT(!kvc::bytesToHexString(data, 3U, tiny, sizeof(tiny)),
                "bo dem qua nho phai bi tu choi");
    TEST_ASSERT(tiny[0] == '\0', "bo dem qua nho phai duoc xoa ve rong");

    TEST_ASSERT(!kvc::bytesToHexString(nullptr, 3U, out, sizeof(out)),
                "con tro du lieu NULL phai bi tu choi");
    TEST_ASSERT(!kvc::bytesToHexString(data, 3U, nullptr, sizeof(out)),
                "con tro output NULL phai bi tu choi");
    TEST_ASSERT(!kvc::bytesToHexString(data, 3U, out, 0U),
                "outputSize 0 phai bi tu choi");
}

/* ---------- 6. matchesGoldenGv02 phát hiện lệch ---------- */
void test_golden_mismatch() {
    std::printf("[6] matchesGoldenGv02 phat hien lech\n");

    kvc::RfTelemetryPacket32 pkt = make_golden_gv02();
    TEST_ASSERT(kvc::matchesGoldenGv02(&pkt), "GV-02 goc phai khop");

    pkt.seq_num = 43U;
    TEST_ASSERT(!kvc::matchesGoldenGv02(&pkt), "lech seq_num phai bi phat hien");

    pkt = make_golden_gv02();
    pkt.alt_dist_cm = 241U;
    TEST_ASSERT(!kvc::matchesGoldenGv02(&pkt), "lech alt_dist_cm phai bi phat hien");

    pkt = make_golden_gv02();
    pkt.sensor_flags = 0x0EU;
    TEST_ASSERT(!kvc::matchesGoldenGv02(&pkt), "lech sensor_flags phai bi phat hien");

    TEST_ASSERT(!kvc::matchesGoldenGv02(nullptr),
                "con tro NULL phai tra ve false");
}

} // namespace

int main() {
    std::printf("================================================================\n");
    std::printf("  KVC gateway rf_decode - Host Unit Tests (IF-02)\n");
    std::printf("================================================================\n");

    test_layout();
    test_crc_known_value();
    test_golden_vector();
    test_validate();
    test_hex_encoding();
    test_golden_mismatch();

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
