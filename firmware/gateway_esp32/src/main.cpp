/**
 * @file main.cpp
 * @brief Firmware Gateway Trạm Mặt Đất ESP32-C3 - Dự án KVC UAV Tìm kiếm Cứu
 * nạn (SAR)
 * @author Đoàn Thanh Trường Thịnh
 *
 * ======================================================================================
 * TIẾN ĐỘ THỰC HIỆN:
 * - GIAI ĐOẠN 1: KẾT NỐI MẠNG WI-FI (STA/LOCAL) & MÁY CHỦ WEBSOCKET [HOÀN TẤT]
 * - GIAI ĐOẠN 2: CẤU TRÚC GÓI 32-BYTE, THẨM ĐỊNH CRC-16 & ĐÓNG GÓI JSON [HOÀN
 * TẤT]
 * - GIAI ĐOẠN 3: KIỂM THỬ THÔNG LUỒNG KHI CHƯA CÓ LORA (PHASE A: SELF-MOCK
 * INGRESS) [HIỆN TẠI]
 * ======================================================================================
 *
 * Mục tiêu Giai đoạn 3:
 * 1. Tự sinh gói nhị phân 32-byte RfTelemetryPacket32 luân phiên 3 kịch bản cứu
 * nạn (Người, Tàu, Sa bàn).
 * 2. Tính toán mã kiểm tra CRC-16/CCITT-FALSE và thẩm định tính toàn vẹn gói
 * tin.
 * 3. Chuyển đổi 32 bytes sang chuỗi Hex 64 ký tự thường (rf_payload_hex).
 * 4. Đóng gói JSON Transport Envelope v1 (IF-03) kèm RSSI và SNR.
 * 5. Phát broadcast qua WebSocket (:8080/telemetry) mỗi 1.0 giây để kích hoạt
 * thông luồng lên Web GCS.
 */

// ======================================================================================
// 1. KHAI BÁO CÁC THƯ VIỆN CẦN THIẾT
// ======================================================================================

// Thư viện lõi Arduino cho ESP32: cung cấp các hàm cơ bản (Serial, millis,
// delay, pinMode,...)
#include <Arduino.h>

// Thư viện điều khiển phần cứng Wi-Fi của ESP32: quản lý kết nối vào mạng Wi-Fi
// (Station Mode)
#include <WiFi.h>
#include <ESPmDNS.h>

// Thư viện máy chủ WebSocket: quản lý các kết nối TCP 2 chiều (Full-Duplex) với
// Laptop thời gian thực
#include <WebSocketsServer.h>

// Thư viện ArduinoJson: hỗ trợ tuần tự hóa và đóng gói chuỗi JSON chuẩn mực, an
// toàn bộ nhớ
#include <ArduinoJson.h>

// Thư viện điều khiển module truyền thông LoRa SX1278 (Ra-02) qua bus SPI
#include <LoRa.h>
#include <SPI.h>

// stddef.h cho offsetof() dùng trong static_assert khoá layout IF-02 bên dưới
#include <cstddef>
#include <cstring>

// esp_random(): entropy phần cứng dùng một lần lúc boot để sinh
// `gateway_session_id`. Header này tách khỏi esp_system.h ở IDF mới nên phải
// include tường minh.
#include <esp_random.h>

// KVC-F1: lớp giải mã RF (struct IF-02, CRC-16, hex) đã tách sang module thuần
// C++ để biên dịch và kiểm thử được trên host (firmware/gateway_esp32/host_tests).
// Không khai báo lại struct/CRC trong file này.
#include "net_policy.h"
#include "rf_decode.h"
#include "session_id.h"

using kvc::RfTelemetryPacket32;
using kvc::bytesToHexString;
using kvc::calculateCrc16;
using kvc::validatePacketCrc;


// ======================================================================================
// 1.1. CẤU HÌNH CHÂN PHẦN CỨNG LORA RA-02 (SX1278) TRẠM MẶT ĐẤT
// Đối chiếu đặc tả chuẩn: docs/hardware/wiring/KVC_MASTER_PINOUT_WIRING.md (Mục 4)
// ======================================================================================
#if defined(CONFIG_IDF_TARGET_ESP32C3) || defined(ARDUINO_ESP32C3_DEV)
// Cấu hình chuẩn khuyến nghị cho bo mạch ESP32-C3
static const int LORA_PIN_NSS = 7;  // SPI Chip Select (CS / NSS)
static const int LORA_PIN_SCK = 4;  // SPI Clock (SCK)
static const int LORA_PIN_MOSI = 6; // SPI Master Out Slave In (MOSI)
static const int LORA_PIN_MISO = 5; // SPI Master In Slave Out (MISO)
static const int LORA_PIN_RST = 1;  // Hardware Reset (RST)
static const int LORA_PIN_DIO0 =
    3; // Ngắt báo nhận xong gói tin (DIO0 / RxDone)
#else
// Cấu hình dự phòng cho bo mạch ESP32-WROOM-32 (NodeMCU 30/38 pins)
static const int LORA_PIN_NSS = 5;
static const int LORA_PIN_SCK = 18;
static const int LORA_PIN_MOSI = 23;
static const int LORA_PIN_MISO = 19;
static const int LORA_PIN_RST = 14;
static const int LORA_PIN_DIO0 = 2;
#endif

// Tần số sóng mang LoRa RF chuẩn KVC (433 MHz)
static const long LORA_BAND_HZ = 433E6;

// ======================================================================================
// 2. CẤU HÌNH THÔNG SỐ WI-FI BẮT CHUNG (STATION MODE - STA)
// ======================================================================================

/**
 * Cấu hình mạng Wi-Fi của gateway theo THỨ TỰ ƯU TIÊN:
 *
 *   Ưu tiên 1 — STA: kết nối Wi-Fi 2.4 GHz đã thiết lập sẵn.
 *               "4G" trong dự án này là do ĐIỆN THOẠI phát hotspot Wi-Fi 2.4 GHz;
 *               gateway không có module 4G/LTE riêng và không cần có. Điện thoại
 *               lo phần sóng di động, ESP32 chỉ việc bắt Wi-Fi của nó.
 *   Ưu tiên 2 — SoftAP: nếu không kết nối được STA trong thời gian cho phép
 *               thì tự phát Wi-Fi để laptop bắt vào.
 *
 * Có thể nạp TỐI ĐA 4 mạng, thử lần lượt theo thứ tự khai báo. Nhờ vậy không
 * phải build lại khi chuyển giữa hotspot điện thoại và Wi-Fi phòng Lab:
 *   pio run -e esp32-c3-devkitm-1 \
 *     -D KVC_WIFI_SSID=\"hotspot-dien-thoai\"   -D KVC_WIFI_PASS=\"mat-khau-1\" \
 *     -D KVC_WIFI_SSID2=\"wifi-phong-lab\"      -D KVC_WIFI_PASS2=\"mat-khau-2\"
 * Không truyền flag nào -> bỏ qua STA và chạy SoftAP ngay.
 *
 * Credential SoftAP là hằng số của dự án (do người dùng chốt), ghi một lần ở đây
 * và vẫn override được bằng build flag khi cần demo mạng khác.
 */
#ifndef KVC_WIFI_SSID
#define KVC_WIFI_SSID ""
#endif
#ifndef KVC_WIFI_PASS
#define KVC_WIFI_PASS ""
#endif
#ifndef KVC_WIFI_SSID2
#define KVC_WIFI_SSID2 ""
#endif
#ifndef KVC_WIFI_PASS2
#define KVC_WIFI_PASS2 ""
#endif
#ifndef KVC_WIFI_SSID3
#define KVC_WIFI_SSID3 ""
#endif
#ifndef KVC_WIFI_PASS3
#define KVC_WIFI_PASS3 ""
#endif
#ifndef KVC_WIFI_SSID4
#define KVC_WIFI_SSID4 ""
#endif
#ifndef KVC_WIFI_PASS4
#define KVC_WIFI_PASS4 ""
#endif

/* SoftAP mặc định của dự án. SSID/mật khẩu này là thông số vận hành công khai
 * trong nội bộ nhóm, không phải secret; mọi tài liệu phải dùng đúng hai giá trị
 * này (trước đây tài liệu ghi KVC_GCS_AP / kvc12345678 và đã lệch code). */
#ifndef KVC_AP_SSID
#define KVC_AP_SSID "KVC_GROUND_STATION"
#endif
#ifndef KVC_AP_PASS
#define KVC_AP_PASS "kvc123456"
#endif

/* Thời gian chờ mỗi mạng ở ưu tiên 1 trong lúc khởi động. */
static const uint32_t KVC_STA_PER_NET_TIMEOUT_MS = 8000UL;
/* Tổng ngân sách thời gian cho ưu tiên 1 lúc khởi động. Hết ngân sách thì mở
 * SoftAP ngay để laptop không phải chờ; các mạng còn lại vẫn được thử lại khi
 * chạy. Đặt nhỏ hơn thời gian một buổi demo cần để chờ là có chủ đích. */
static const uint32_t KVC_STA_BOOT_BUDGET_MS = 15000UL;
/* Chu kỳ thử lại ưu tiên 1 khi đang chạy (kể cả khi đang phát SoftAP). */
static const uint32_t KVC_STA_RETRY_INTERVAL_MS = 30000UL;

/** Một bộ credential Wi-Fi 2.4 GHz (ưu tiên 1). */
struct WifiCredential {
  const char *ssid;
  const char *pass;
};

/* Danh sách ưu tiên 1, theo đúng thứ tự khai báo build flag. Mạng không có SSID
 * (chuỗi rỗng) bị bỏ qua khi duyệt. */
static const WifiCredential WIFI_NETWORKS[] = {
    {KVC_WIFI_SSID, KVC_WIFI_PASS},   {KVC_WIFI_SSID2, KVC_WIFI_PASS2},
    {KVC_WIFI_SSID3, KVC_WIFI_PASS3}, {KVC_WIFI_SSID4, KVC_WIFI_PASS4},
};
static const size_t WIFI_NETWORK_COUNT =
    sizeof(WIFI_NETWORKS) / sizeof(WIFI_NETWORKS[0]);

const char *AP_SSID = KVC_AP_SSID;
const char *AP_PASS = KVC_AP_PASS;

/* Trạng thái mạng do wifiBegin()/wifiSupervise() quản lý. */
static bool s_staConfigured = false;   // Có ít nhất 1 mạng ở ưu tiên 1
static size_t s_netIndex = 0;          // Mạng đang/đã thử gần nhất
static bool s_apStarted = false;
static uint32_t s_lastStaAttemptMs = 0;

/**
 * @brief Tìm mạng kế tiếp có SSID, bắt đầu từ afterIndex.
 * @return Chỉ số mạng, hoặc WIFI_NETWORK_COUNT nếu không còn mạng nào.
 */
static size_t nextConfiguredNetwork(size_t afterIndex) {
  const char *ssids[WIFI_NETWORK_COUNT];
  for (size_t i = 0; i < WIFI_NETWORK_COUNT; i++) {
    ssids[i] = WIFI_NETWORKS[i].ssid;
  }
  return kvc::netNextConfiguredIndex(ssids, WIFI_NETWORK_COUNT, afterIndex);
}

// ======================================================================================
// 3. CẤU HÌNH DỊCH VỤ WEBSOCKET SERVER
// ======================================================================================

// Cổng mạng TCP quy định cho dịch vụ WebSocket (Chuẩn IF_ESP32_GCS_WS.md quy
// định cổng 8080)
const uint16_t WS_PORT = 8080;

// Khởi tạo đối tượng máy chủ WebSocket lắng nghe trên cổng 8080
WebSocketsServer webSocket = WebSocketsServer(WS_PORT);

// ======================================================================================
// 4. GÓI TELEMETRY 32-BYTE (IF-02) — ĐỊNH NGHĨA NẰM TRONG rf_decode.h
// ======================================================================================
// Struct RfTelemetryPacket32, các static_assert khoá layout, CRC-16/CCITT-FALSE,
// validatePacketCrc() và bytesToHexString() đã chuyển sang
// firmware/gateway_esp32/src/rf_decode.{h,cpp} — thuần C++, có host test tại
// firmware/gateway_esp32/test/. Lý do: lớp quyết định đúng/sai của chuỗi REAL
// phải kiểm thử được mà không cần board.
//
// Xem: docs/interfaces/IF_MCU_LORA_RF.md (đặc tả IF-02).

// ======================================================================================
// 5. CÁC BIẾN QUẢN LÝ THỜI GIAN, PHIÊN LÀM VIỆC, SELF-MOCK & THỐNG KÊ HỆ THỐNG
// ======================================================================================

// Cấu hình chế độ Self-Mock cho Giai đoạn 3 (Khi chưa cắm module LoRa phần cứng)
static const bool ENABLE_SELF_MOCK = false;

// Chu kỳ phát bản tin Self-Mock (1000ms = 1.0 giây / gói tin)
static const uint32_t SELF_MOCK_INTERVAL_MS = 1000;

// Mốc thời gian lần phát gói Self-Mock gần nhất
static uint32_t lastSelfMockMs = 0;

// Chỉ số kịch bản Self-Mock xoay vòng (0 = Người WGS-84, 1 = Tàu thuyền WGS-84,
// 2 = Sa bàn Local Grid)
static uint8_t selfMockScenarioIdx = 0;

// Số thứ tự gói tin RF tự tăng (Sequence Number 1..255)
static uint8_t mockRfSeqNum = 1;

// Lưu mốc thời gian (mili-giây) của lần in trạng thái (Heartbeat) gần nhất
static uint32_t lastHeartbeatMs = 0;

// Khoảng thời gian định kỳ giữa các lần in Heartbeat (5000ms = 5 giây)
static const uint32_t HEARTBEAT_INTERVAL_MS = 5000;

// Biến đếm số lượng máy tính / thiết bị GCS đang duy trì kết nối WebSocket tới
// ESP32
static uint8_t connectedClientCount = 0;

// Mã định danh phiên làm việc của Gateway. IF-03 mục 3 yêu cầu giá trị này
// THAY ĐỔI mỗi lần ESP32 khởi động lại. Giá trị được sinh trong setup() từ
// entropy phần cứng (esp_random) trộn với MAC eFuse; xem session_id.h. Không
// gán hằng số ở đây vì hai phiên boot sẽ bị backend trộn làm một.
static uint32_t gatewaySessionId = kvc::kGatewaySessionIdMin;

// Bộ đếm số lượng gói tin JSON do ESP32 phát đi qua WebSocket (tăng dần 1,
// 2, 3...)
static uint32_t gatewaySequence = 0;

// Số message HỢP LỆ bị vứt bỏ vì buffer FIFO đầy kể từ lúc boot (IF-03 mục 3).
// Firmware hiện phát trực tiếp cho các client đang nối, CHƯA có FIFO 64, nên
// giá trị này luôn 0. Đây là nghĩa hợp đồng của trường `rx_drop_count`.
static uint32_t rxBufferDropCount = 0;

// Số frame RF KHÔNG hợp lệ (sai độ dài, sai CRC-16, không đủ buffer hex) kể từ
// lúc boot. Đây KHÔNG phải `rx_drop_count`: frame lỗi chưa từng là message hợp
// lệ. Chỉ chẩn đoán nội bộ, in ra Serial, không nằm trong JSON envelope v1.
static uint32_t rxInvalidCount = 0;

// Trạng thái phần cứng module LoRa Ra-02 (SX1278) sau khi khởi tạo SPI
static bool loraHardwareReady = false;

// Thời điểm gần nhất nhận được gói tin LoRa hợp lệ (mili-giây)
static uint32_t lastRxPacketMs = 0;

// ======================================================================================
// 6. ĐÓNG GÓI JSON TRANSPORT ENVELOPE V1 (IF-03)
// ======================================================================================
// CRC-16 và kiểm tra gói nằm trong rf_decode.cpp (host-testable). Phần dưới chỉ
// còn trách nhiệm của gateway: dựng envelope và gắn metadata sóng vô tuyến.

/**
 * @brief Đóng gói chuỗi Hex và các metadata sóng vô tuyến vào JSON Transport
 * Envelope v1 (IF-03).
 *
 * @param hexPayload Chuỗi 64 ký tự Hex chứa 32 bytes dữ liệu UAV.
 * @param rssiDbm Cường độ sóng vô tuyến LoRa (dBm).
 * @param snrDb Tỷ số tín hiệu trên nhiễu (dB).
 * @return String Chuỗi JSON định dạng chuẩn gửi qua WebSocket lên Backend.
 */
String buildJsonEnvelope(const char *hexPayload, int16_t rssiDbm, float snrDb) {
  // Tạo tài liệu JSON sử dụng ArduinoJson v7
  JsonDocument doc;

  doc["transport_version"] = 1; // Phiên bản giao thức (cố định: 1)
  doc["gateway_session_id"] =
      gatewaySessionId; // ID phiên làm việc hiện tại của ESP32
  doc["gateway_sequence"] = ++gatewaySequence; // Tăng số thứ tự gói tin phát đi
  doc["rx_monotonic_ms"] = millis();  // Thời điểm ESP32 nhận và xử lý gói (ms)
  doc["rf_payload_hex"] = hexPayload; // Chuỗi 64 ký tự Hex của gói 32-byte
  doc["rssi_dbm"] = rssiDbm;          // Cường độ tín hiệu sóng LoRa
  doc["snr_db"] = snrDb;              // Tỷ số tín hiệu trên tạp âm LoRa
  doc["rx_drop_count"] = rxBufferDropCount; // Message hợp lệ bị loại do buffer
                                            // FIFO đầy (IF-03 mục 3)

  // Chuyển đối tượng JSON thành chuỗi ký tự String
  String output;
  output.reserve(
      measureJson(doc)); // Chỉ cấp phát một lần theo đúng độ dài JSON
  serializeJson(doc, output);
  return output;
}

// ======================================================================================
// 7. BỘ TỰ KIỂM THỬ SÁT HẠCH (SELF-TEST UNIT) CHO GIAI ĐOẠN 2
// ======================================================================================
/**
 * @brief Hàm chạy bài sát hạch tự động ngay trong setup() để chứng minh
 * tính chính xác 100% của cấu trúc struct, thuật toán CRC-16 và đóng gói JSON.
 */
void runPhase2SelfTest() {
  Serial.println("\n=======================================================");
  Serial.println("  [GIAI ĐOẠN 2] TỰ KIỂM THỬ THUẬT TOÁN CRC-16 & JSON  ");
  Serial.println("=======================================================");

  // TEST 1: KIỂM TRA KÍCH THƯỚC STRUCT PACKED
  size_t structSize = sizeof(RfTelemetryPacket32);
  Serial.printf(
      "[TEST 1 - STRUCT SIZE] Kich thuoc RfTelemetryPacket32: %u bytes\n",
      structSize);
  if (structSize == 32) {
    Serial.println("                       -> KHOA CHAT BO NHO (PACKED) THANH "
                   "CONG! [PASS]");
  } else {
    Serial.println("                       -> [FAIL] LOI PADDING: Kich thuoc "
                   "bi lech khoi 32 bytes!");
  }

  // TEST 2: KIỂM THỬ THUẬT TOÁN CRC-16 TRÊN GÓI DỮ LIỆU MẪU CHUẨN
  RfTelemetryPacket32 samplePkt;
  memset(&samplePkt, 0, sizeof(samplePkt));

  // Nạp dữ liệu giả lập mục tiêu người gặp nạn (Person rescue target)
  samplePkt.sync[0] = 0xAA;
  samplePkt.sync[1] = 0x55;
  samplePkt.msg_id = 0x01;           // Gói Telemetry
  samplePkt.seq_num = 42;            // Gói số 42
  samplePkt.timestamp_ms = 1000;     // 1000 ms sau cất cánh
  samplePkt.target_lat = 107723450;  // 10.772345°N
  samplePkt.target_lon = 1066578900; // 106.657890°E
  samplePkt.target_x_local = 150;    // 150 cm trên sa bàn
  samplePkt.target_y_local = 320;    // 320 cm trên sa bàn
  samplePkt.lidar_dist_cm = 240;     // Độ cao 240 cm
  samplePkt.class_id = 1;            // 1 = Người (person)
  samplePkt.confidence = 92;         // 92% tin cậy
  samplePkt.sensor_flags = 0x0F;     // GPS | LiDAR | IMU | AI
  samplePkt.status_reserved = 0;     // Byte 25 dự phòng (đã bỏ đo pin)

  // Tính toán mã CRC-16 trên 30 byte đầu tiên
  uint16_t expectedCrc = calculateCrc16((const uint8_t *)&samplePkt, 30);
  samplePkt.crc16 = expectedCrc; // Gán mã vào byte 30..31

  // Thẩm định lại tính hợp lệ
  bool isValid =
      validatePacketCrc((const uint8_t *)&samplePkt, sizeof(samplePkt));
  Serial.printf(
      "[TEST 2 - CRC VALID]   Computed CRC: 0x%04X | Expected: 0x%04X\n",
      expectedCrc, samplePkt.crc16);
  if (isValid) {
    Serial.println("                       -> THAM DINH CRC GOI TIN CHUAN: "
                   "PASSED! [PASS]");
  } else {
    Serial.println("                       -> [FAIL] THAM DINH CRC THAT BAI!");
  }

  // TEST 2B: DOI CHIEU GOLDEN VECTOR GV-02 (IF-02 muc 3) — dung chung C/Python
  // Vector nay duoc sinh tu kvc_telemetry.h (MCU) va parse lai bang
  // struct.unpack("<2sBBIIIhhHBBBB4sH") trong gcs/backend/esp32_ingress.py.
  // GV-02 thay GV-01 sau khi bo phep do pin: byte 25 status_reserved = 0.
  // Logic so khop nam trong rf_decode.cpp (kvc::matchesGoldenGv02) de host test
  // và firmware dùng đúng một nguồn.
  {
    static const char kGoldenGv02Hex[] =
        "aa55012ae8030000baba6b06d4b3923f96004001f000015c0f000000000060e2";
    char gvHex[sizeof(samplePkt) * 2 + 1] = {0};
    bool gvHexOk = bytesToHexString((const uint8_t *)&samplePkt,
                                    sizeof(samplePkt), gvHex, sizeof(gvHex));
    bool gvStructOk = kvc::matchesGoldenGv02(&samplePkt);
    bool gvHexMatch = gvHexOk && (strcmp(gvHex, kGoldenGv02Hex) == 0);
    Serial.printf("[TEST 2B - GOLDEN GV-02] CRC 0x%04X (expect 0x%04X) %s | "
                  "Hex %s\n",
                  expectedCrc, kvc::kGoldenGv02Crc16,
                  gvStructOk ? "MATCH" : "MISMATCH",
                  gvHexMatch ? "MATCH" : "MISMATCH");
    if (!gvHexMatch && gvHexOk) {
      Serial.printf("                       actual: %s\n", gvHex);
    }
    if (gvStructOk && gvHexMatch) {
      Serial.println("                       -> GOLDEN VECTOR KHOP C/PYTHON! "
                     "[PASS]");
    } else {
      Serial.println("                       -> [FAIL] LECH GOLDEN VECTOR "
                     "IF-02!");
    }
  }

  // TEST 3: KIỂM THỬ KHẢ NĂNG BẮT LỖI KHI NHIỄU SÓNG (BIT FLIP TEST)
  uint8_t corruptedBuffer[32];
  memcpy(corruptedBuffer, &samplePkt, 32);
  corruptedBuffer[10] ^= 0x01; // Cố tình làm sai lệch 1 bit tại byte thứ 10

  bool isCorruptedValid = validatePacketCrc(corruptedBuffer, 32);
  Serial.print("[TEST 3 - CRC REJECT]  Thu nghiem dao 1 bit tai byte[10] -> ");
  if (!isCorruptedValid) {
    Serial.println("PHAT HIEN SAI CRC & TU CHOI GOI LOI! [PASS]");
  } else {
    Serial.println("[FAIL] KHONG PHAT HIEN DUOC GOI BI NHIEU BIT!");
  }

  // TEST 4: KIỂM THỬ CHUYỂN ĐỔI CHUỖI HEX 64 KÝ TỰ
  char hexStr[sizeof(samplePkt) * 2 + 1] = {0};
  bool hexEncoded = bytesToHexString((const uint8_t *)&samplePkt,
                                     sizeof(samplePkt), hexStr, sizeof(hexStr));
  size_t hexLength = hexEncoded ? sizeof(samplePkt) * 2 : 0;
  Serial.println("[TEST 4 - HEX ENCODE]  Chuoi Hex 64 ky tu xuat ra:");
  Serial.printf("                       %s\n", hexStr);
  Serial.printf("                       Do dai: %u ky tu ",
                (unsigned int)hexLength);
  if (hexEncoded && hexLength == 64) {
    Serial.println("-> DUNG CHUAN 64 KY TU! [PASS]");
  } else {
    Serial.println("-> [FAIL] SAI DO DAI CHUOI HEX!");
  }

  // TEST 5: KIỂM THỬ ĐÓNG GÓI JSON TRANSPORT ENVELOPE V1
  String jsonEnv = buildJsonEnvelope(hexStr, -76, 8.5f);
  Serial.println(
      "[TEST 5 - JSON ENVELOPE] Mau goi tin JSON phat qua WebSocket:");
  Serial.printf("                         %s\n", jsonEnv.c_str());

  Serial.println("-------------------------------------------------------");
  Serial.println(
      "[TONG KET GIAI DOAN 2] TOAN BO LOGIC KIEM TRA DU LIEU HOAN TAT 100%!");
  Serial.println("=======================================================\n");
}

// ======================================================================================
// 8. BỘ SINH DỮ LIỆU ĐO XA GIẢ LẬP GIAI ĐOẠN 3 (PHASE A: SELF-MOCK TELEMETRY
// GENERATOR)
// ======================================================================================
/**
 * @brief Tự sinh gói nhị phân 32-byte RfTelemetryPacket32 luân phiên 3 kịch bản
 * cứu nạn, tính toán CRC-16, mã hóa chuỗi Hex 64 ký tự, đóng gói JSON Transport
 * Envelope v1 và phát sóng broadcast qua WebSocket tới tất cả các client Laptop
 * GCS đang kết nối.
 */
void generateAndSendSelfMockTelemetry() {
  RfTelemetryPacket32 pkt;
  memset(&pkt, 0, sizeof(pkt));

  // 1. TIÊU ĐỀ GÓI TIN ĐỒNG BỘ VÀ ĐỊNH DANH (SYNC & MSG_ID)
  pkt.sync[0] = 0xAA;
  pkt.sync[1] = 0x55;
  pkt.msg_id = 0x01; // Gói tin Telemetry cứu nạn SAR
  pkt.seq_num = mockRfSeqNum++;
  if (mockRfSeqNum == 0) {
    mockRfSeqNum = 1;
  }
  pkt.timestamp_ms = millis();

  // Các biến tham số sóng vô tuyến giả lập
  int16_t rssiDbm = -76;
  float snrDb = 8.5;
  const char *scenarioLabel = "";

  // 2. NẠP DỮ LIỆU TÙY THEO KỊCH BẢN XOAY VÒNG
  switch (selfMockScenarioIdx) {
  // KỊCH BẢN 1: PHÁT HIỆN NGƯỜI GẶP NẠN (PERSON) - TỌA ĐỘ TOÀN CẦU WGS-84
  case 0: {
    scenarioLabel = "NGUOI (Person)";
    pkt.class_id = 1;            // 1 = Người (person)
    pkt.confidence = 95;         // 95% độ tin cậy AI
    pkt.target_lat = 160738520;  // 16.073852° N (Đà Nẵng)
    pkt.target_lon = 1081499210; // 108.149921° E
    pkt.target_x_local = 0;
    pkt.target_y_local = 0;
    pkt.lidar_dist_cm = 250; // 250 cm (2.50 m)
    pkt.sensor_flags = 0x0F; // GPS=1 | LiDAR=1 | IMU=1 | AI=1
    pkt.status_reserved = 0; // Byte 25 dự phòng (đã bỏ đo pin)
    rssiDbm = -76;
    snrDb = 8.5;
    break;
  }

  // KỊCH BẢN 2: PHÁT HIỆN TÀU THUYỀN / PHAO CỨU SINH (BOAT) - TỌA ĐỘ TOÀN CẦU
  // WGS-84
  case 1: {
    scenarioLabel = "TAU (Boat)";
    pkt.class_id = 2;            // 2 = Tàu thuyền / Phao cứu nạn (boat)
    pkt.confidence = 92;         // 92% độ tin cậy AI
    pkt.target_lat = 160751000;  // 16.075100° N
    pkt.target_lon = 1081512000; // 108.151200° E
    pkt.target_x_local = 0;
    pkt.target_y_local = 0;
    pkt.lidar_dist_cm = 230; // 230 cm (2.30 m)
    pkt.sensor_flags = 0x0F; // GPS=1 | LiDAR=1 | IMU=1 | AI=1
    pkt.status_reserved = 0; // Byte 25 dự phòng (đã bỏ đo pin)
    rssiDbm = -75;
    snrDb = 9.0;
    break;
  }

  // KỊCH BẢN 3: THỰC NGHIỆM TRÊN SA BÀN / BỂ BƠI (LOCAL GRID) - TỌA ĐỘ NỘI BỘ
  case 2:
  default: {
    scenarioLabel = "SA BAN LOCAL";
    pkt.class_id = 1;    // 1 = Người (person)
    pkt.confidence = 89; // 89% độ tin cậy AI
    pkt.target_lat = 0;  // Tắt GPS
    pkt.target_lon = 0;
    pkt.target_x_local = 150; // X = +150 cm
    pkt.target_y_local = 320; // Y = +320 cm
    pkt.lidar_dist_cm = 245;  // 245 cm (2.45 m)
    pkt.sensor_flags = 0x0E;  // GPS=0 | LiDAR=1 | IMU=1 | AI=1 (Cờ 0x0E)
    pkt.status_reserved = 0;  // Byte 25 dự phòng (đã bỏ đo pin)
    rssiDbm = -76;
    snrDb = 8.0;
    break;
  }
  }

  // Nạp dữ liệu góc nghiêng IMU mẫu (Roll = +12.5°, Pitch = -4.5°) vào 4 byte reserved để HUD hiển thị đầy đủ
  int16_t mockRoll10 = 125;
  int16_t mockPitch10 = -45;
  pkt.reserved[0] = (uint8_t)(mockRoll10 & 0xFF);
  pkt.reserved[1] = (uint8_t)((mockRoll10 >> 8) & 0xFF);
  pkt.reserved[2] = (uint8_t)(mockPitch10 & 0xFF);
  pkt.reserved[3] = (uint8_t)((mockPitch10 >> 8) & 0xFF);

  // 3. TÍNH TOÁN CRC-16/CCITT-FALSE TRÊN 30 BYTE ĐẦU
  pkt.crc16 = calculateCrc16((const uint8_t *)&pkt, 30);

  // 4. CHUYỂN ĐỔI SANG CHUỖI HEX 64 KÝ TỰ THƯỜNG
  char hexPayload[sizeof(pkt) * 2 + 1];
  if (!bytesToHexString((const uint8_t *)&pkt, sizeof(pkt), hexPayload,
                        sizeof(hexPayload))) {
    Serial.println("[TX-WS-ERR] Khong du bo dem de ma hoa payload Hex.");
    return;
  }

  // 5. ĐÓNG GÓI JSON TRANSPORT ENVELOPE V1
  String jsonEnv = buildJsonEnvelope(hexPayload, rssiDbm, snrDb);

  // 6. PHÁT GÓI BROADCAST QUA MÁY CHỦ WEBSOCKET TỚI TẤT CẢ CLIENTS
  webSocket.broadcastTXT(jsonEnv);

  // 7. IN LOG THỐNG KÊ RA CỔNG SERIAL THEO ĐÚNG CHUẨN KẾ HOẠCH
  if (selfMockScenarioIdx == 2) {
    Serial.printf("[TX-WS #%03u] %-14s | Conf: %u%% | X: %+d cm, Y: %+d cm | "
                  "LiDAR: %u cm       | RSSI: %d dBm\n",
                  pkt.seq_num, scenarioLabel, pkt.confidence,
                  pkt.target_x_local, pkt.target_y_local, pkt.lidar_dist_cm,
                  rssiDbm);
  } else {
    Serial.printf("[TX-WS #%03u] %-14s | Conf: %u%% | LiDAR: %u cm | Lat: "
                  "%.6f, Lon: %.6f | RSSI: %d dBm\n",
                  pkt.seq_num, scenarioLabel, pkt.confidence, pkt.lidar_dist_cm,
                  (double)pkt.target_lat / 1e7, (double)pkt.target_lon / 1e7,
                  rssiDbm);
  }

  // 8. TĂNG CHỈ SỐ XOAY VÒNG KỊCH BẢN TIẾP THEO (0 -> 1 -> 2 -> 0)
  selfMockScenarioIdx = (selfMockScenarioIdx + 1) % 3;
}

// ======================================================================================
// 9. HÀM XỬ LÝ SỰ KIỆN WEBSOCKET (CALLBACK FUNCTION)
// ======================================================================================
/**
 * @brief Hàm này tự động được thư viện WebSockets gọi mỗi khi có sự kiện mạng
 * xảy ra.
 *
 * @param num     Mã định danh duy nhất (Client ID, bắt đầu từ 0) do ESP32 cấp
 * cho thiết bị kết nối.
 * @param type    Loại sự kiện: WStype_CONNECTED, WStype_DISCONNECTED,
 * WStype_TEXT, WStype_BIN, WStype_ERROR.
 * @param payload Con trỏ trỏ tới vùng nhớ chứa nội dung gói tin mà Laptop gửi
 * lên ESP32.
 * @param length  Độ dài tính theo byte của gói tin nhận được.
 */
void onWebSocketEvent(uint8_t num, WStype_t type, uint8_t *payload,
                      size_t length) {
  switch (type) {

  // SỰ KIỆN 1: CÓ THIẾT BỊ (LAPTOP GCS) VỪA KẾT NỐI VÀO WEBSOCKET THÀNH CÔNG
  case WStype_CONNECTED: {
    connectedClientCount++;
    IPAddress clientIp = webSocket.remoteIP(num);

    Serial.printf("\n[WS-CONNECT] >>> Laptop GCS da ket noi thanh cong!\n");
    Serial.printf("             Client ID: %u | Dia chi IP: %s\n", num,
                  clientIp.toString().c_str());
    Serial.printf("             Tong so thiet bi dang ket noi: %u\n",
                  connectedClientCount);

    // Gửi bản tin chào mừng (Handshake Frame) dạng JSON sang Laptop.
    // "mode" phản ánh đúng chế độ mạng đang chạy sau thứ tự ưu tiên, không cứng
    // một giá trị: STA_LOCAL khi đã nối Wi-Fi 2.4 GHz, SOFTAP khi đang dự phòng.
    const char *netMode =
        (WiFi.status() == WL_CONNECTED) ? "WIFI_STA_LOCAL" : "WIFI_SOFTAP";
    String welcomeMsg = String("{\"status\":\"CONNECTED\",\"gateway\":\"KVC_ESP32_"
                               "GATEWAY\",\"mode\":\"") +
                        netMode + "\"}";
    webSocket.sendTXT(num, welcomeMsg);
    break;
  }

  // SỰ KIỆN 2: THIẾT BỊ (LAPTOP GCS) NGẮT KẾT NỐI KHỎI WEBSOCKET
  case WStype_DISCONNECTED: {
    if (connectedClientCount > 0) {
      connectedClientCount--;
    }
    Serial.printf(
        "\n[WS-DISCONNECT] >>> Laptop GCS (Client ID: %u) da ngat ket noi!\n",
        num);
    Serial.printf("                Tong so thiet bi con lai: %u\n",
                  connectedClientCount);
    break;
  }

  // SỰ KIỆN 3: NHẬN ĐƯỢC BẢN TIN VĂN BẢN (TEXT / JSON / PING) TỪ LAPTOP GỬI LÊN
  case WStype_TEXT: {
    String textMsg = String((char *)payload).substring(0, length);
    Serial.printf("[WS-RECV #%u] Nhan tu Laptop: %s\n", num, textMsg.c_str());

    // Nếu Laptop gửi yêu cầu "PING" để kiểm tra độ trễ mạng (Latency RTT)
    if (textMsg == "PING") {
      String pongMsg = "PONG (Gateway Uptime: " + String(millis()) + " ms)";
      webSocket.sendTXT(num, pongMsg);
    }
    break;
  }

  // SỰ KIỆN 4: NHẬN GÓI DỮ LIỆU NHỊ PHÂN THÔ (BINARY)
  case WStype_BIN:
    Serial.printf("[WS-BIN #%u] Nhan goi tin nhi phan (%u bytes)\n", num,
                  length);
    break;

  // SỰ KIỆN 5: XẢY RA LỖI ĐƯỜNG TRUYỀN SOCKET (SOCKET ERROR)
  case WStype_ERROR:
    Serial.printf("[WS-ERR #%u] Xay ra loi socket tren duong truyen!\n", num);
    break;

  default:
    break;
  }
}

// Đọc thanh ghi bất kỳ của chip LoRa SX1278 trực tiếp qua bus SPI
static uint8_t readSx1278Reg(uint8_t addr) {
  digitalWrite(LORA_PIN_NSS, LOW);
  SPI.beginTransaction(SPISettings(8E6, MSBFIRST, SPI_MODE0));
  SPI.transfer(addr & 0x7F);
  uint8_t val = SPI.transfer(0x00);
  SPI.endTransaction();
  digitalWrite(LORA_PIN_NSS, HIGH);
  return val;
}

// Đọc thanh ghi RegVersion (0x42) của chip LoRa SX1278 (luôn là 0x12)
static uint8_t readSx1278Version() { return readSx1278Reg(0x42); }

// Khởi tạo hoặc tái thiết lập lại toàn bộ cấu hình module LoRa Ra-02 (SX1278)
static bool initLoRaHardware() {
  // 1. Reset cứng phần cứng qua chân RST để dập tắt mọi trạng thái kẹt SPI/FSM
  pinMode(LORA_PIN_RST, OUTPUT);
  digitalWrite(LORA_PIN_RST, LOW);
  delay(15);
  digitalWrite(LORA_PIN_RST, HIGH);
  delay(30);

  LoRa.setPins(LORA_PIN_NSS, LORA_PIN_RST, LORA_PIN_DIO0);
  if (LoRa.begin(LORA_BAND_HZ)) {
    LoRa.setSpreadingFactor(7);
    LoRa.setSignalBandwidth(125E3);
    LoRa.setCodingRate4(5);
    LoRa.enableCrc();
    LoRa.setSyncWord(0x12); // Đồng bộ khóa mạng nội bộ KVC
    loraHardwareReady = true;
    return true;
  }
  loraHardwareReady = false;
  return false;
}

// ======================================================================================
// 9.5. QUẢN LÝ MẠNG: ƯU TIÊN STA (Wi-Fi 2.4 GHz có sẵn), DỰ PHÒNG SOFTAP
// ======================================================================================

/**
 * @brief Bật SoftAP (dự phòng) và ghi log.
 *
 * Idempotent: gọi nhiều lần không mở lại AP đã chạy.
 */
static void startSoftAp() {
  if (s_apStarted) {
    return;
  }

  // AP_STA thay vì AP: vẫn giữ được STA để tự nối lại khi router xuất hiện lại.
  WiFi.mode(WIFI_AP_STA);
  s_apStarted = WiFi.softAP(AP_SSID, AP_PASS);

  if (s_apStarted) {
    Serial.println("[WIFI-AP]  Phat SoftAP du phong THANH CONG!");
    Serial.printf("[WIFI-AP]  SSID: %s | Password: %s\n", AP_SSID, AP_PASS);
    Serial.printf("[WIFI-AP]  IP Gateway: %s\n",
                  WiFi.softAPIP().toString().c_str());
  } else {
    Serial.println("[WIFI-AP-ERR] Khong mo duoc SoftAP! Kiem tra lai cau hinh.");
  }
}

/**
 * @brief Thử một mạng ở ưu tiên 1 trong tối đa timeoutMs.
 * @return true nếu nối được.
 */
static bool tryConnectSta(size_t netIndex, uint32_t timeoutMs) {
  Serial.printf("[WIFI-STA] Uu tien 1: thu mang \"%s\"...\n",
                WIFI_NETWORKS[netIndex].ssid);
  WiFi.begin(WIFI_NETWORKS[netIndex].ssid, WIFI_NETWORKS[netIndex].pass);

  const uint32_t startMs = millis();
  while (WiFi.status() != WL_CONNECTED && (millis() - startMs) < timeoutMs) {
    delay(250);
    Serial.print(".");
  }
  Serial.println();

  return WiFi.status() == WL_CONNECTED;
}

/**
 * @brief Ghi log sau khi ưu tiên 1 thành công.
 */
static void logStaConnected(size_t netIndex) {
  Serial.printf("[WIFI-STA] Ket noi STA THANH CONG (uu tien 1, mang \"%s\").\n",
                WIFI_NETWORKS[netIndex].ssid);
  Serial.printf("[WIFI-STA] IP do mang cap: %s | RSSI: %d dBm\n",
                WiFi.localIP().toString().c_str(), WiFi.RSSI());
}

/**
 * @brief Thiết lập mạng theo thứ tự ưu tiên 1 -> 2.
 *
 * Ưu tiên 1: lần lượt thử các mạng 2.4 GHz đã khai báo (tối đa 4), mỗi mạng có
 *   KVC_STA_PER_NET_TIMEOUT_MS và tổng không quá KVC_STA_BOOT_BUDGET_MS.
 *   - Thành công: chỉ chạy STA, KHÔNG phát SoftAP (đúng thứ tự ưu tiên).
 * Ưu tiên 2: không có credential, hoặc hết ngân sách mà chưa nối được -> mở
 *   SoftAP để laptop vẫn vào được. Khi đó mode là AP_STA nên wifiSupervise()
 *   vẫn tiếp tục thử ưu tiên 1; nếu nối được thì AP tự đóng.
 *
 * Ghi chú: "4G" ở đây là hotspot Wi-Fi 2.4 GHz do ĐIỆN THOẠI phát. Gateway không
 * có module 4G/LTE và không cần: điện thoại lo phần sóng di động, ESP32-C3 chỉ
 * bắt Wi-Fi của điện thoại. Vì vậy không có nhánh PPP/modem nào trong firmware.
 */
static void wifiBegin() {
  WiFi.persistent(false); // Không ghi credential vào NVS, tránh trạng thái cũ
  WiFi.setAutoReconnect(true);

  s_apStarted = false;
  s_netIndex = 0;
  s_lastStaAttemptMs = millis();

  const size_t first = nextConfiguredNetwork(0);
  s_staConfigured = (first != WIFI_NETWORK_COUNT);

  if (!s_staConfigured) {
    Serial.println("[WIFI-STA] Khong co KVC_WIFI_SSID... khi build.");
    Serial.println("[WIFI-STA] Chuyen sang uu tien 2: phat SoftAP.");
    startSoftAp();
    return;
  }

  WiFi.mode(WIFI_STA);

  const uint32_t bootStartMs = millis();
  size_t idx = first;
  while (idx != WIFI_NETWORK_COUNT) {
    const uint32_t elapsed = millis() - bootStartMs;
    if (elapsed >= KVC_STA_BOOT_BUDGET_MS) {
      Serial.printf("[WIFI-STA] Het ngan sach %lu ms cho uu tien 1.\n",
                    (unsigned long)KVC_STA_BOOT_BUDGET_MS);
      break;
    }

    uint32_t allowance = KVC_STA_BOOT_BUDGET_MS - elapsed;
    if (allowance > KVC_STA_PER_NET_TIMEOUT_MS) {
      allowance = KVC_STA_PER_NET_TIMEOUT_MS;
    }

    /* Ghi nhận mạng vừa thử TRƯỚC khi kết nối: nếu thất bại, vòng retry sau sẽ
     * bắt đầu từ mạng kế tiếp chứ không thử lại đúng mạng vừa hỏng ngay lập tức. */
    s_netIndex = idx;

    if (tryConnectSta(idx, allowance)) {
      logStaConnected(idx);
      Serial.println("[WIFI-AP]  Khong phat SoftAP vi da co Wi-Fi 2.4 GHz.");
      return;
    }

    idx = nextConfiguredNetwork(idx + 1);
  }

  Serial.println("[WIFI-STA] That bai tat ca mang o uu tien 1. Chuyen sang uu tien 2.");
  startSoftAp();
}

/**
 * @brief Giữ mạng ổn định trong loop().
 *
 * - Đang chạy STA mà mất kết nối: thử lại định kỳ, luân phiên qua các mạng đã
 *   khai báo (điện thoại tắt hotspot thì tự chuyển sang Wi-Fi khác).
 * - Đang chạy SoftAP vì ưu tiên 1 thất bại: vẫn thử lại định kỳ, và đóng SoftAP
 *   ngay khi ưu tiên 1 nối được để không phát sóng thừa.
 */
static void wifiSupervise(uint32_t now) {
  if (!s_staConfigured) {
    return; // Không có credential thì SoftAP là phương án duy nhất
  }

  kvc::NetPolicyState state;
  state.staConfigured = s_staConfigured;
  state.staConnected = (WiFi.status() == WL_CONNECTED);
  state.apStarted = s_apStarted;
  state.lastStaAttemptMs = s_lastStaAttemptMs;

  switch (kvc::netPolicyEvaluate(state, now, KVC_STA_RETRY_INTERVAL_MS)) {
  case kvc::NetAction::CloseSoftAp:
    WiFi.softAPdisconnect(true);
    s_apStarted = false;
    WiFi.mode(WIFI_STA);
    Serial.println("[WIFI-AP]  Da dong SoftAP: uu tien 1 hoat dong lai.");
    Serial.printf("[WIFI-STA] IP: %s\n", WiFi.localIP().toString().c_str());
    break;

  case kvc::NetAction::RetrySta: {
    s_lastStaAttemptMs = now;

    const size_t idx = nextConfiguredNetwork(s_netIndex + 1);
    if (idx == WIFI_NETWORK_COUNT) {
      break;
    }
    s_netIndex = idx;

    Serial.printf("[WIFI-STA] Thu ket noi lai \"%s\"...\n",
                  WIFI_NETWORKS[idx].ssid);
    /* Không chặn loop(): WiFi.begin() trả về ngay, kết quả được kiểm ở vòng sau
     * qua state.staConnected. */
    WiFi.begin(WIFI_NETWORKS[idx].ssid, WIFI_NETWORKS[idx].pass);
    break;
  }

  case kvc::NetAction::None:
  default:
    break;
  }
}

/**
 * @brief In các endpoint WebSocket đang dùng được.
 */
static void reportNetworkEndpoints() {
  if (WiFi.status() == WL_CONNECTED) {
    Serial.printf("[WS] Endpoint STA   : ws://%s:%u/telemetry\n",
                  WiFi.localIP().toString().c_str(), WS_PORT);
  }
  if (s_apStarted) {
    Serial.printf("[WS] Endpoint SoftAP: ws://%s:%u/telemetry\n",
                  WiFi.softAPIP().toString().c_str(), WS_PORT);
  }
  if (WiFi.status() != WL_CONNECTED && !s_apStarted) {
    Serial.println("[WS] Chua co endpoint mang nao san sang.");
  }
}

/**
 * @brief Bật mDNS để laptop tìm gateway bằng tên, không cần biết IP.
 *
 * Ở chế độ STA, IP do router cấp và có thể đổi mỗi lần boot; tài liệu vận hành
 * đã hướng dẫn dùng `kvc-gateway.local`. Phải bật mDNS thật thì tên đó mới phân
 * giải được — trước đây tài liệu hướng dẫn nhưng firmware chưa hề khởi tạo.
 */
static void startMdns() {
  if (MDNS.begin("kvc-gateway")) {
    MDNS.addService("http", "tcp", WS_PORT);
    Serial.println("[MDNS] Da bat: http://kvc-gateway.local");
  } else {
    Serial.println("[MDNS-WARN] Khong bat duoc mDNS; dung IP truc tiep.");
  }
}

// ======================================================================================
// 10. HÀM KHỞI TẠO HỆ THỐNG SETUP() - CHỈ CHẠY 1 LẦN DUY NHẤT KHI BẬT NGUỒN
// ======================================================================================
void setup() {
  // Khởi động cổng Serial với tốc độ baud 115200 (chuẩn giao tiếp nạp code và
  // debug)
  Serial.begin(115200);

  // Dừng 1 giây để điện áp nguồn nuôi và bộ đệm chip UART trên ESP32 hoàn toàn
  // ổn định
  delay(1000);

  // In biểu ngữ thông tin dự án ra Serial Monitor
  Serial.println("\n=======================================================");
  Serial.println("   KVC GATEWAY ESP32 - PHÂN HỆ TRẠM THU MẶT ĐẤT       ");
  Serial.println("   GIAI ĐOẠN 3: KIỂM THỬ THÔNG LUỒNG (SELF-MOCK INGRESS)");
  Serial.println("   Người thực hiện: Đoàn Thanh Trường Thịnh           ");
  Serial.println("=======================================================");

  // Mã phiên phải khác nhau sau mỗi lần reboot (IF-03 mục 3). Lấy entropy
  // phần cứng một lần, trộn với MAC eFuse 48-bit; in ra Serial để biên bản test
  // đối chiếu được với `gateway_session_id` trong envelope.
  const uint64_t efuseMac = ESP.getEfuseMac();
  gatewaySessionId = kvc::deriveGatewaySessionId(
      esp_random(), (uint32_t)(efuseMac & 0xFFFFFFFFULL),
      (uint32_t)((efuseMac >> 32) & 0xFFFFULL));
  Serial.printf("[SESSION] gateway_session_id = %u (MAC %04X%08X)\n",
                gatewaySessionId, (unsigned)((efuseMac >> 32) & 0xFFFFULL),
                (unsigned)(efuseMac & 0xFFFFFFFFULL));

  // BƯỚC 1: CHẠY BÀI SÁT HẠCH TỰ ĐỘNG GIAI ĐOẠN 2 (SELF-TEST UNIT)
  runPhase2SelfTest();

  // BƯỚC 2: THIẾT LẬP MẠNG THEO THỨ TỰ ƯU TIÊN (STA trước, SoftAP dự phòng)
  wifiBegin();
  startMdns();

  // BƯỚC 3: KHỞI ĐỘNG DỊCH VỤ MÁY CHỦ WEBSOCKET SERVER
  webSocket.begin();
  webSocket.enableHeartbeat(15000, 3000, 2);
  webSocket.onEvent(onWebSocketEvent);

  Serial.println("\n=======================================================");
  Serial.printf("[WS] WebSocket Server da mo tai cong: %u\n", WS_PORT);
  reportNetworkEndpoints();
  Serial.println("=======================================================\n");

  // BƯỚC 4: KHỞI TẠO MODULE PHẦN CỨNG LORA RA-02 (SX1278) THEO MASTER PINOUT
  Serial.println("-------------------------------------------------------");
  Serial.println(
      "[LORA] Khoi tao module LoRa Ra-02 theo Master Pinout (Muc 4)...");
  Serial.printf("[LORA] Cau hinh: NSS=%d, SCK=%d, MOSI=%d, MISO=%d, RST=%d, "
                "DIO0=%d | Tan so: 433 MHz\n",
                LORA_PIN_NSS, LORA_PIN_SCK, LORA_PIN_MOSI, LORA_PIN_MISO,
                LORA_PIN_RST, LORA_PIN_DIO0);

  SPI.begin(LORA_PIN_SCK, LORA_PIN_MISO, LORA_PIN_MOSI, LORA_PIN_NSS);
  if (initLoRaHardware()) {
    Serial.printf("[LORA] RegVersion (0x42) = 0x%02X (chuan SX1278: 0x12)\n",
                  readSx1278Version());
    Serial.println("[LORA] >>> PHAT HIEN VA KHOI TAO PHAN CUNG LORA RA-02 "
                   "THANH CONG! [OK]");
  } else {
    Serial.printf("[LORA-WARN] RegVersion (0x42) = 0x%02X (chuan SX1278: "
                  "0x12)\n",
                  readSx1278Version());
    Serial.println("[LORA-WARN] Chua phat hien phan cung LoRa Ra-02 (hoac day "
                   "cam chua noi).");
    Serial.println(
        "[LORA-WARN] Gateway tiep tuc hoat dong voi che do Self-Mock Ingress.");
  }
}

// ======================================================================================
// 11. VÒNG LẶP TUẦN HOÀN LOOP() - CHẠY LIÊN TỤC VÔ HẠN
// ======================================================================================
void loop() {
  // Bắt buộc gọi liên tục ở mỗi vòng quét loop() để duy trì kết nối mạng
  webSocket.loop();

  // Lấy thời gian thực tính bằng mili-giây
  uint32_t now = millis();

  // ----------------------------------------------------------------------------------
  // GIỮ MẠNG ỔN ĐỊNH: ưu tiên STA, tự đóng SoftAP khi STA nối lại được
  // ----------------------------------------------------------------------------------
  wifiSupervise(now);

  // ----------------------------------------------------------------------------------
  // GIAI ĐOẠN 3: BỘ PHÁT DỮ LIỆU TELEMETRY DỰ PHÒNG (SELF-MOCK FALLBACK) MỖI 1.0 GIÂY
  // ----------------------------------------------------------------------------------
  // Khi chưa có gói LoRa thật từ UAV (hoặc mất sóng quá 3.0s), tự động phát gói dự phòng
  // để Web Dashboard luôn luôn có đầy đủ thông số (GPS, Siêu âm, IMU, Pin, BBox)
  bool fallbackToMock = (lastRxPacketMs == 0) || (now - lastRxPacketMs >= 3000);
  if (ENABLE_SELF_MOCK && fallbackToMock && (now - lastSelfMockMs >= SELF_MOCK_INTERVAL_MS)) {
    lastSelfMockMs = now;
    generateAndSendSelfMockTelemetry();
  }

  // ----------------------------------------------------------------------------------
  // GIAI ĐOẠN 4: THU NHẬN GÓI TIN LORA RF THỰC TẾ TỪ UAV (KHI ĐÃ CẮM MODULE
  // RA-02)
  // ----------------------------------------------------------------------------------
  if (loraHardwareReady) {
    int packetSize = LoRa.parsePacket();
    if (packetSize > 0) {
      // 1. Kiểm tra kích thước gói chuẩn 32 bytes (KvcTelemetryPacket32)
      if (packetSize != (int)sizeof(RfTelemetryPacket32)) {
        rxInvalidCount++;
        while (LoRa.available()) {
          LoRa.read(); // Xả sạch bộ đệm gói tin rác/nhiễu
        }
        Serial.printf("[RX-LORA-ERR] Tu choi goi bat thuong %d bytes (Khac "
                      "chuan 32B)! (Tong frame loi: %u)\n",
                      packetSize, rxInvalidCount);
      } else {
        uint8_t rxBuffer[sizeof(RfTelemetryPacket32)];
        int bytesRead = 0;
        while (LoRa.available() && bytesRead < (int)sizeof(rxBuffer)) {
          rxBuffer[bytesRead++] = LoRa.read();
        }
        // Xả sạch mọi byte dư thừa nếu còn
        while (LoRa.available()) {
          LoRa.read();
        }

        int16_t rssiDbm = LoRa.packetRssi();
        float snrDb = LoRa.packetSnr();

        if (validatePacketCrc(rxBuffer, bytesRead)) {
          lastRxPacketMs =
              now; // Cập nhật mốc thời gian nhận gói hợp lệ thành công
          char hexPayload[sizeof(RfTelemetryPacket32) * 2 + 1];
          if (!bytesToHexString(rxBuffer, bytesRead, hexPayload,
                                sizeof(hexPayload))) {
            rxInvalidCount++;
            Serial.println(
                "[RX-LORA-ERR] Khong du bo dem de ma hoa payload Hex.");
          } else {
            String jsonEnv = buildJsonEnvelope(hexPayload, rssiDbm, snrDb);
            webSocket.broadcastTXT(jsonEnv);
            const RfTelemetryPacket32 *rxPkt =
                (const RfTelemetryPacket32 *)rxBuffer;
            bool gnssValid = (rxPkt->sensor_flags & (1U << 0)) != 0;
            bool altValid = (rxPkt->sensor_flags & (1U << 1)) != 0;
            bool imuValid = (rxPkt->sensor_flags & (1U << 2)) != 0;
            bool aiValid = (rxPkt->sensor_flags & (1U << 3)) != 0;

            // Giám sát tính toàn vẹn chuỗi số Sequence từ UAV
            static uint8_t lastUavSeq = 0;
            if (lastUavSeq > 0 && rxPkt->seq_num != (uint8_t)(lastUavSeq + 1)) {
              uint8_t gap = (uint8_t)(rxPkt->seq_num - lastUavSeq - 1);
              Serial.printf("[LORA-GAP] Canh bao: Mat nhay coc %u goi tin! "
                            "(UAV Seq: %u -> %u)\n",
                            gap, lastUavSeq, rxPkt->seq_num);
            }
            lastUavSeq = rxPkt->seq_num;

            char imuStr[28] = "IMU:N/A";
            if (imuValid) {
              int16_t roll =
                  (int16_t)(rxPkt->reserved[0] | (rxPkt->reserved[1] << 8));
              int16_t pitch =
                  (int16_t)(rxPkt->reserved[2] | (rxPkt->reserved[3] << 8));
              snprintf(imuStr, sizeof(imuStr), "R:%+.1f P:%+.1f",
                       (float)roll / 10.0f, (float)pitch / 10.0f);
            }

            char gnssStr[36] = "GPS:NO_FIX";
            if (gnssValid &&
                (rxPkt->target_lat != 0 || rxPkt->target_lon != 0)) {
              snprintf(gnssStr, sizeof(gnssStr), "GPS:%.5f,%.5f",
                       (double)rxPkt->target_lat / 1e7,
                       (double)rxPkt->target_lon / 1e7);
            }

            char aiStr[24] = "AI:IDLE";
            if (aiValid || rxPkt->class_id != 0) {
              const char *clsName = (rxPkt->class_id == 1)   ? "PERSON"
                                    : (rxPkt->class_id == 2) ? "BOAT"
                                                             : "TARGET";
              snprintf(aiStr, sizeof(aiStr), "AI:%s(%u%%)", clsName,
                       rxPkt->confidence);
            }

            Serial.printf("[RX-LORA #%03u] Seq:%-3u | %ddBm SNR:%+.1f | "
                          "Alt:%3u cm [%s] | %s | %s | %s\n",
                          gatewaySequence, rxPkt->seq_num, rssiDbm, snrDb,
                          rxPkt->alt_dist_cm,
                          altValid ? "ALT_VALID" : "ALT_INVALID", imuStr,
                          gnssStr, aiStr);
          }
        } else {
          rxInvalidCount++;
          Serial.printf("[RX-LORA-ERR] Tu choi goi %d bytes do sai ma CRC-16! "
                        "(Tong frame loi: %u)\n",
                        bytesRead, rxInvalidCount);
        }
      }
    }
  }

  // ----------------------------------------------------------------------------------
  // WATCHDOG TỰ ĐỘNG PHỤC HỒI KHI CHỈNH DÂY / RUNG LẮC (CHỐNG TREO BỘ THU LORA)
  // ----------------------------------------------------------------------------------
  // Nếu đã từng nhận được gói tin từ UAV mà quá 10.0 giây không có gói mới
  if (loraHardwareReady && lastRxPacketMs > 0 &&
      (now - lastRxPacketMs >= 10000)) {
    static uint32_t lastRecoveryAttempt = 0;
    if (now - lastRecoveryAttempt >= 5000) {
      lastRecoveryAttempt = now;
      uint8_t opMode = readSx1278Reg(0x01);
      uint8_t ver = readSx1278Version();
      // Chỉ tự động reset khi chip SX1278 thực sự bị sụt nguồn rớt về FSK hoặc
      // mất giao tiếp SPI
      if ((opMode & 0x80) == 0 || ver != 0x12) {
        Serial.printf("[LORA-WATCHDOG] Phat hien su co phan cung Ra-02 "
                      "(Ver=0x%02X, OpMode=0x%02X)! Dang tai nap lai...\n",
                      ver, opMode);
        if (initLoRaHardware()) {
          Serial.println("[LORA-WATCHDOG] >>> KHOI PHUC VA TAI NAP LAI PHAN "
                         "CUNG RA-02 THANH CONG! [OK]");
          lastRxPacketMs = now; // Tránh gọi lặp lại dồn dập
        } else {
          Serial.println("[LORA-WATCHDOG-ERR] Khoi phuc that bai! Vui long "
                         "kiem tra lai tiep xuc day jumper.");
        }
      }
    }
  }

  // ----------------------------------------------------------------------------------
  // HEARTBEAT ĐỊNH KỲ MỖI 5.0 GIÂY
  // ----------------------------------------------------------------------------------
  if (now - lastHeartbeatMs >= HEARTBEAT_INTERVAL_MS) {
    lastHeartbeatMs = now;

    // Giám sát sức khỏe phần cứng LoRa SX1278 (Ra-02)
    if (loraHardwareReady) {
      uint8_t loraVersion =
          readSx1278Version(); // RegVersion của SX1278 phải là 0x12
      uint8_t opMode =
          readSx1278Reg(0x01); // RegOpMode bit 7 phải là 1 (LoRa Mode)
      bool loraModeLost =
          ((opMode & 0x80) ==
           0); // Nếu bit 7 = 0 tức là chip bị sụt nguồn rớt về FSK

      if (loraVersion != 0x12 || loraModeLost) {
        Serial.printf("[LORA-WARN] Ra-02 gap su co (Ver=0x%02X, "
                      "OpMode=0x%02X)! Dang tai nap lai phan cung...\n",
                      loraVersion, opMode);
        if (initLoRaHardware()) {
          Serial.println(
              "[LORA] >>> Khoi phuc ket noi LoRa Ra-02 THANH CONG! [OK]");
        } else {
          Serial.println("[LORA-ERR] Khoi phuc LoRa that bai! Kiem tra lai day "
                         "jumper SPI.");
        }
      }
    }

    // Tính toán giờ, phút, giây hoạt động liên tục (Uptime) của bo mạch
    uint32_t hours = now / 3600000;
    uint32_t minutes = (now % 3600000) / 60000;
    uint32_t seconds = (now % 60000) / 1000;

    String ipStr = "CHUA_KET_NOI";
    if (WiFi.status() == WL_CONNECTED) {
      ipStr = WiFi.localIP().toString();
    } else if (s_apStarted) {
      ipStr = WiFi.softAPIP().toString();
    }

    int activeClients = webSocket.connectedClients();

    Serial.printf("[HEARTBEAT] UpTime: %02u:%02u:%02u | IP: %s | Clients: %d | "
                  "InvalidFrames: %u | BufDrops: %u\n",
                  hours, minutes, seconds, ipStr.c_str(), activeClients,
                  rxInvalidCount, rxBufferDropCount);
  }

  // Nghỉ 2ms mỗi chu kỳ để giải phóng nhân CPU, hạ nhiệt độ chip và ổn định
  // nguồn 3.3V
  delay(2);
}
