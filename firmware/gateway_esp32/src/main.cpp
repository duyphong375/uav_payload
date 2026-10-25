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
 * Cấu hình mạng Wi-Fi cục bộ để ESP32 và Laptop cùng bắt chung.
 * Lưu ý: ESP32-C3 chỉ hỗ trợ băng tần 2.4GHz.
 *
 * FIX (Codex F11): trước đây SSID/mật khẩu Wi-Fi được hardcode trong source đã
 * commit, tức là credential bị lộ cho bất kỳ ai đọc repo. Nay giá trị được lấy
 * từ build flag (platformio.ini / biến môi trường), KHÔNG còn literal trong
 * source. Nếu không truyền flag, firmware vẫn build được nhưng sẽ không kết nối
 * Wi-Fi và in cảnh báo ra Serial.
 *
 * Truyền khi build (không commit giá trị thật):
 *   pio run -e esp32-c3-devkitm-1 \
 *     -D KVC_WIFI_SSID=\"ten-mang\" -D KVC_WIFI_PASS=\"mat-khau\"
 * Hoặc đặt trong platformio.ini cục bộ (file này nên nằm trong .gitignore):
 *   build_flags = -D KVC_WIFI_SSID=\"...\" -D KVC_WIFI_PASS=\"...\"
 *
 * LƯU Ý BẢO MẬT: credential đã từng nằm trong history Git. Cần rotate mật khẩu
 * Wi-Fi đó; việc xoá khỏi source hiện tại KHÔNG làm sạch history.
 */
#ifndef KVC_WIFI_SSID
#define KVC_WIFI_SSID ""
#endif
#ifndef KVC_WIFI_PASS
#define KVC_WIFI_PASS ""
#endif

const char *WIFI_SSID = KVC_WIFI_SSID;
const char *WIFI_PASS = KVC_WIFI_PASS;

// ======================================================================================
// 3. CẤU HÌNH DỊCH VỤ WEBSOCKET SERVER
// ======================================================================================

// Cổng mạng TCP quy định cho dịch vụ WebSocket (Chuẩn IF_ESP32_GCS_WS.md quy
// định cổng 8080)
const uint16_t WS_PORT = 8080;

// Khởi tạo đối tượng máy chủ WebSocket lắng nghe trên cổng 8080
WebSocketsServer webSocket = WebSocketsServer(WS_PORT);

// ======================================================================================
// 4. ĐỊNH NGHĨA CẤU TRÚC GÓI ĐO XA TELEMETRY 32-BYTE (CHUẨN IF_MCU_LORA_RF.MD)
// ======================================================================================

/**
 * @brief Cấu trúc gói tin 32 bytes Little-Endian truyền từ máy bay UAV về mặt
 * đất.
 *
 * ⚠️ QUY TẮC CỐT LÕI:
 * Phải sử dụng __attribute__((packed)) để vô hiệu hóa tính năng căn chỉnh tự
 * động của compiler, đảm bảo kích thước struct chính xác tròn trĩnh 32 bytes
 * không có byte rác (padding), tương thích 100% với
 * struct.unpack("<2sBBIIIhhHBBBB4sH") trên Backend Python.
 */
struct __attribute__((packed)) RfTelemetryPacket32 {
  // Byte 0..1: Tiêu đề đồng bộ nhận diện gói tin UAV (Cố định: 0xAA 0x55)
  uint8_t sync[2];

  // Byte 2: Mã định danh loại gói tin (0x01 = Telemetry cứu nạn, 0x02 =
  // Heartbeat)
  uint8_t msg_id;

  // Byte 3: Số thứ tự gói tin (0 - 255, xoay vòng) giúp phát hiện rớt gói vô
  // tuyến
  uint8_t seq_num;

  // Byte 4..7: Mốc thời gian bay của UAV tính bằng mili-giây kể từ lúc cất cánh
  uint32_t timestamp_ms;

  // Byte 8..11: Vĩ độ WGS-84 mục tiêu nhân 10^7 (Ví dụ: 107723450
  // = 10.772345°N)
  int32_t target_lat;

  // Byte 12..15: Kinh độ WGS-84 mục tiêu nhân 10^7 (Ví dụ: 1066578900 =
  // 106.657890°E)
  int32_t target_lon;

  // Byte 16..17: Tọa độ X tương đối so với mốc sa bàn/bể bơi thực nghiệm (cm)
  int16_t target_x_local;

  // Byte 18..19: Tọa độ Y tương đối so với mốc sa bàn/bể bơi thực nghiệm (cm)
  int16_t target_y_local;

  // Byte 20..21: Khoảng cách cảm biến đo mặt nước từ AJ-SR04M siêu âm (cm)
  // [tiền thân LiDAR TF-Luna]
  union {
    uint16_t alt_dist_cm;
    uint16_t lidar_dist_cm; // Bí danh tương thích mã nguồn hiện hành
  };

  // Byte 22: Phân loại mục tiêu do AI nhận diện (1 = Người/person, 2 = Phao/tàu
  // thuyền)
  uint8_t class_id;

  // Byte 23: Độ tin cậy nhận diện của AI (0 đến 100%)
  uint8_t confidence;

  // Byte 24: Cờ trạng thái cảm biến (Bit 0: GPS, Bit 1: Siêu âm ALT, Bit 2:
  // IMU, Bit 3: Khóa AI)
  uint8_t sensor_flags;

  // Byte 25: Điện áp Pin UAV (Đơn vị: 0.1V/bit, ví dụ 126 tương đương 12.6V)
  uint8_t battery_raw;

  // Byte 26..29: 4 byte dự phòng mở rộng (áp suất khí quyển, nhiệt độ môi
  // trường, ...)
  uint8_t reserved[4];

  // Byte 30..31: Mã kiểm tra an toàn CRC-16/CCITT-FALSE (tính trên 30 byte đầu
  // từ byte 0..29)
  uint16_t crc16;
};

// Khoa ABI IF-02 tai thoi diem bien dich: neu layout lech khoi bang offset
// trong docs/interfaces/IF_MCU_LORA_RF.md thi build FAIL ngay, khong doi den
// luc chay tren bo moi phat hien.
static_assert(sizeof(RfTelemetryPacket32) == 32,
              "IF-02: RfTelemetryPacket32 phai dung 32 byte");
static_assert(offsetof(RfTelemetryPacket32, sync) == 0, "IF-02: sync @0");
static_assert(offsetof(RfTelemetryPacket32, msg_id) == 2, "IF-02: msg_id @2");
static_assert(offsetof(RfTelemetryPacket32, seq_num) == 3, "IF-02: seq_num @3");
static_assert(offsetof(RfTelemetryPacket32, timestamp_ms) == 4,
              "IF-02: timestamp_ms @4");
static_assert(offsetof(RfTelemetryPacket32, target_lat) == 8,
              "IF-02: target_lat @8");
static_assert(offsetof(RfTelemetryPacket32, target_lon) == 12,
              "IF-02: target_lon @12");
static_assert(offsetof(RfTelemetryPacket32, target_x_local) == 16,
              "IF-02: target_x_local @16");
static_assert(offsetof(RfTelemetryPacket32, target_y_local) == 18,
              "IF-02: target_y_local @18");
static_assert(offsetof(RfTelemetryPacket32, alt_dist_cm) == 20,
              "IF-02: alt_dist_cm @20");
static_assert(offsetof(RfTelemetryPacket32, class_id) == 22,
              "IF-02: class_id @22");
static_assert(offsetof(RfTelemetryPacket32, confidence) == 23,
              "IF-02: confidence @23");
static_assert(offsetof(RfTelemetryPacket32, sensor_flags) == 24,
              "IF-02: sensor_flags @24");
static_assert(offsetof(RfTelemetryPacket32, battery_raw) == 25,
              "IF-02: battery_raw @25");
static_assert(offsetof(RfTelemetryPacket32, reserved) == 26,
              "IF-02: reserved @26");
static_assert(offsetof(RfTelemetryPacket32, crc16) == 30, "IF-02: crc16 @30");

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

// Mã định danh phiên làm việc của Gateway (Tăng lên 1 mỗi khi ESP32 khởi động
// lại)
static uint32_t gatewaySessionId = 1;

// Bộ đếm số lượng gói tin JSON do ESP32 phát đi qua WebSocket (tăng dần 1,
// 2, 3...)
static uint32_t gatewaySequence = 0;

// Bộ đếm số lượng gói tin bị vứt bỏ do sai lệch mã kiểm tra CRC-16 hoặc sai
// Sync Header
static uint32_t rxDropCount = 0;

// Trạng thái phần cứng module LoRa Ra-02 (SX1278) sau khi khởi tạo SPI
static bool loraHardwareReady = false;

// Thời điểm gần nhất nhận được gói tin LoRa hợp lệ (mili-giây)
static uint32_t lastRxPacketMs = 0;

// ======================================================================================
// 6. CÁC HÀM XỬ LÝ DỮ LIỆU: THUẬT TOÁN CRC-16, CHUYỂN ĐỔI HEX & ĐÓNG GÓI JSON
// ======================================================================================

/**
 * @brief Tính toán mã kiểm tra toàn vẹn CRC-16/CCITT-FALSE trên mảng dữ liệu
 * byte.
 *
 * Đặc tả kỹ thuật thuật toán:
 * - Đa thức sinh (Polynomial): 0x1021 (x^16 + x^12 + x^5 + 1)
 * - Giá trị khởi tạo (Initial Value): 0xFFFF
 * - Chiều xử lý: MSB first (Không đảo bit vào RefIn=false, không đảo bit ra
 * RefOut=false)
 * - Giá trị XOR đầu ra (XorOut): 0x0000
 *
 * @param data Con trỏ trỏ tới vùng đệm byte cần tính CRC.
 * @param length Số lượng byte cần tính (Với gói RF, length = 30 byte đầu tiên).
 * @return uint16_t Giá trị mã băm 16-bit tính được.
 */
uint16_t calculateCrc16(const uint8_t *data, size_t length) {
  uint16_t crc = 0xFFFF; // Khởi tạo thanh ghi với giá trị 0xFFFF
  for (size_t i = 0; i < length; i++) {
    crc ^= ((uint16_t)data[i]
            << 8); // Đưa byte dữ liệu vào 8-bit cao của thanh ghi CRC
    for (uint8_t bit = 0; bit < 8; bit++) {
      if (crc & 0x8000) { // Nếu bit cao nhất là 1
        crc = (crc << 1) ^
              0x1021; // Dịch trái 1 bit và thực hiện phép chia đa thức (XOR)
      } else {
        crc = (crc << 1); // Dịch trái 1 bit bình thường
      }
    }
  }
  return crc;
}

/**
 * @brief Thẩm định tính hợp lệ của gói tin đo xa 32 bytes nhận được.
 *
 * Kiểm tra 2 điều kiện an toàn:
 * 1. Tiêu đề đồng bộ (Sync Header) phải đúng cặp byte 0xAA 0x55.
 * 2. Mã CRC-16 tính trên 30 byte đầu phải trùng khớp hoàn toàn với 2 byte cuối
 * (byte 30..31).
 *
 * @param packetBuffer Con trỏ trỏ tới mảng 32 bytes nhị phân.
 * @param length Kích thước gói (bắt buộc đúng 32 bytes).
 * @return true Gói tin nguyên vẹn, hợp lệ 100%.
 * @return false Gói tin bị lỗi, méo bit hoặc không rõ nguồn gốc.
 */
bool validatePacketCrc(const uint8_t *packetBuffer, size_t length) {
  // Điều kiện 1: Độ dài gói phải đúng chuẩn 32 bytes
  if (length != sizeof(RfTelemetryPacket32)) {
    return false;
  }

  // Điều kiện 2: Kiểm tra Sync Header (0xAA 0x55)
  if (packetBuffer[0] != 0xAA || packetBuffer[1] != 0x55) {
    return false;
  }

  // Ép kiểu mảng byte về struct để trích xuất trường crc16 ở cuối
  const RfTelemetryPacket32 *pkt = (const RfTelemetryPacket32 *)packetBuffer;

  // Tính mã CRC-16 trên 30 byte đầu tiên (từ byte 0 đến byte 29)
  uint16_t computedCrc = calculateCrc16(packetBuffer, 30);

  // So khớp mã vừa tính với mã do máy bay ghi ở cuối gói tin
  return (computedCrc == pkt->crc16);
}

/**
 * @brief Chuyển đổi mảng byte nhị phân thành chuỗi Hex chữ thường (Zero-padded
 * lowercase Hex).
 *
 * @param data Con trỏ trỏ tới mảng dữ liệu nhị phân.
 * @param length Số byte cần chuyển đổi (32 bytes sẽ tạo thành chuỗi 64 ký tự).
 * @param output Vùng đệm nhận chuỗi Hex; cần tối thiểu length * 2 + 1 byte.
 * @param outputSize Kích thước vùng đệm output.
 * @return true nếu chuyển đổi thành công; false nếu tham số hoặc vùng đệm không
 * hợp lệ.
 */
bool bytesToHexString(const uint8_t *data, size_t length, char *output,
                      size_t outputSize) {
  if (data == nullptr || output == nullptr || outputSize == 0) {
    return false;
  }

  // Kiểm tra theo phép chia để tránh tràn khi tính length * 2 + 1.
  if (length > (outputSize - 1) / 2) {
    output[0] = '\0';
    return false;
  }

  const char hexChars[] = "0123456789abcdef";
  size_t outputIndex = 0;
  for (size_t i = 0; i < length; i++) {
    output[outputIndex++] = hexChars[(data[i] >> 4) & 0x0F]; // 4 bit cao
    output[outputIndex++] = hexChars[data[i] & 0x0F];        // 4 bit thấp
  }
  output[outputIndex] = '\0';
  return true;
}

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
  doc["rx_drop_count"] = rxDropCount; // Số lượng gói tin đã bị loại bỏ do lỗi

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
  samplePkt.battery_raw = 126;       // 12.6V (100% pin)

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

  // TEST 2B: DOI CHIEU GOLDEN VECTOR GV-01 (IF-02 muc 3) — dung chung C/Python
  // Vector nay duoc sinh tu kvc_telemetry.h (MCU) va parse lai bang
  // struct.unpack("<2sBBIIIhhHBBBB4sH") trong gcs/backend/esp32_ingress.py.
  {
    static const uint16_t kGoldenGv01Crc = 0x304E;
    static const char kGoldenGv01Hex[] =
        "aa55012ae8030000baba6b06d4b3923f96004001f000015c0f7e000000004e30";
    char gvHex[sizeof(samplePkt) * 2 + 1] = {0};
    bool gvHexOk = bytesToHexString((const uint8_t *)&samplePkt,
                                    sizeof(samplePkt), gvHex, sizeof(gvHex));
    bool gvCrcOk = (expectedCrc == kGoldenGv01Crc);
    bool gvHexMatch = gvHexOk && (strcmp(gvHex, kGoldenGv01Hex) == 0);
    Serial.printf("[TEST 2B - GOLDEN GV-01] CRC 0x%04X (expect 0x%04X) %s | "
                  "Hex %s\n",
                  expectedCrc, kGoldenGv01Crc, gvCrcOk ? "MATCH" : "MISMATCH",
                  gvHexMatch ? "MATCH" : "MISMATCH");
    if (!gvHexMatch && gvHexOk) {
      Serial.printf("                       actual: %s\n", gvHex);
    }
    if (gvCrcOk && gvHexMatch) {
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
    pkt.battery_raw = 125;   // 12.5V (90% pin)
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
    pkt.battery_raw = 124;   // 12.4V (86% pin)
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
    pkt.battery_raw = 123;    // 12.3V (81% pin)
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

    // Gửi bản tin chào mừng (Handshake Frame) dạng JSON sang Laptop
    String welcomeMsg = "{\"status\":\"CONNECTED\",\"gateway\":\"KVC_ESP32_"
                        "GATEWAY\",\"mode\":\"WIFI_STA_LOCAL\"}";
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

  // BƯỚC 1: CHẠY BÀI SÁT HẠCH TỰ ĐỘNG GIAI ĐOẠN 2 (SELF-TEST UNIT)
  runPhase2SelfTest();

  // BƯỚC 2: CẤU HÌNH ESP32 CHẾ ĐỘ DUAL WIFI (SOFTAP + STA)
  // Luôn phát mạng Wi-Fi KVC_GROUND_STATION (IP cố định 192.168.4.1) ngay lập tức
  WiFi.mode(WIFI_AP_STA);
  WiFi.softAP("KVC_GROUND_STATION", "kvc123456");
  delay(100);
  Serial.println("[WIFI-AP]  Phat SoftAP KVC_GROUND_STATION THANH CONG!");
  Serial.print("[WIFI-AP]  Ten mang (SSID): KVC_GROUND_STATION | Mat khau: kvc123456\n");
  Serial.print("[WIFI-AP]  Dia chi IP Gateway: ");
  Serial.println(WiFi.softAPIP());

  // Đồng thời thử kết nối mạng Wi-Fi ngoài nếu có.
  // F11: nếu không được cấu hình credential qua build flag thì bỏ qua STA,
  // chỉ chạy SoftAP. Không gọi WiFi.begin("") vì sẽ treo chờ vô ích.
  WiFi.setAutoReconnect(true);
  WiFi.persistent(true);

  const bool staConfigured = (WIFI_SSID[0] != '\0');
  if (staConfigured) {
    Serial.print("[WIFI-STA] Dang thu ket noi mang Wi-Fi ngoai: ");
    Serial.println(WIFI_SSID);
    WiFi.begin(WIFI_SSID, WIFI_PASS);

    // Chờ tối đa 10 giây để không làm gián đoạn hệ thống nếu ngoài tầm phủ sóng
    uint32_t startAttemptTime = millis();
    while (WiFi.status() != WL_CONNECTED && (millis() - startAttemptTime < 10000)) {
      delay(500);
      Serial.print(".");
    }
  } else {
    Serial.println("[WIFI-STA] BO QUA: chua cau hinh KVC_WIFI_SSID/KVC_WIFI_PASS khi build. Chi chay SoftAP.");
  }

  // Kiểm tra kết quả kết nối Wi-Fi (Nếu thất bại, tự động chuyển sang SoftAP KVC_GROUND_STATION)
  if (WiFi.status() == WL_CONNECTED) {
    Serial.println("\n[WIFI-STA] Ket noi Wi-Fi STA THANH CONG!");
    Serial.print("[WIFI-STA] Dia chi IP do Router cap cho ESP32: ");
    Serial.println(WiFi.localIP());
    Serial.printf("[WIFI-STA] Cuong do song RSSI: %d dBm\n", WiFi.RSSI());
  } else {
    Serial.println("\n[WIFI-STA] Khong the ket noi Wi-Fi STA sau 10 giay.");
    Serial.println("[WIFI-AP]  Kich hoat che do tu phat Wi-Fi SoftAP du phong...");
    WiFi.mode(WIFI_AP);
    WiFi.softAP("KVC_GROUND_STATION", "kvc123456");
    delay(500);
    Serial.println("[WIFI-AP]  Phat SoftAP THANH CONG!");
    Serial.print("[WIFI-AP]  Ten mang (SSID): KVC_GROUND_STATION | Mat khau: kvc123456\n");
    Serial.print("[WIFI-AP]  Dia chi IP Gateway: ");
    Serial.println(WiFi.softAPIP());
  }

  // BƯỚC 3: KHỞI ĐỘNG DỊCH VỤ MÁY CHỦ WEBSOCKET SERVER
  webSocket.begin();
  webSocket.enableHeartbeat(15000, 3000, 2);
  webSocket.onEvent(onWebSocketEvent);

  Serial.println("\n=======================================================");
  Serial.printf("[WS] WebSocket Server da mo tai cong: %u\n", WS_PORT);
  Serial.printf("[WS] Endpoint SoftAP: ws://%s:%u/telemetry\n",
                WiFi.softAPIP().toString().c_str(), WS_PORT);
  if (WiFi.status() == WL_CONNECTED) {
    Serial.printf("[WS] Endpoint STA   : ws://%s:%u/telemetry\n",
                  WiFi.localIP().toString().c_str(), WS_PORT);
  }
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
    Serial.println("[LORA] >>> PHAT HIEN VA KHOI TAO PHAN CUNG LORA RA-02 "
                   "THANH CONG! [OK]");
  } else {
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
  // TỰ ĐỘNG KẾT NỐI LẠI WI-FI NẾU BỊ MẤT SÓNG TRONG CHẾ ĐỘ STA
  // ----------------------------------------------------------------------------------
  if (WiFi.getMode() == WIFI_STA && WiFi.status() != WL_CONNECTED) {
    static uint32_t lastReconnectAttempt = 0;
    if (now - lastReconnectAttempt >= 5000) {
      lastReconnectAttempt = now;
      Serial.println(
          "[WIFI-STA-WARN] Mat ket noi Wi-Fi STA! Dang tu dong ket noi lai...");
      WiFi.reconnect();
    }
  }

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
        rxDropCount++;
        while (LoRa.available()) {
          LoRa.read(); // Xả sạch bộ đệm gói tin rác/nhiễu
        }
        Serial.printf("[RX-LORA-ERR] Tu choi goi bat thuong %d bytes (Khac "
                      "chuan 32B)! (Tong drop: %u)\n",
                      packetSize, rxDropCount);
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
            rxDropCount++;
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
                          "Alt:%3u cm [%s] | %s | %s | %s | Pin:%.1fV\n",
                          gatewaySequence, rxPkt->seq_num, rssiDbm, snrDb,
                          rxPkt->alt_dist_cm,
                          altValid ? "ALT_VALID" : "ALT_INVALID", imuStr,
                          gnssStr, aiStr, (float)rxPkt->battery_raw / 10.0f);
          }
        } else {
          rxDropCount++;
          Serial.printf("[RX-LORA-ERR] Tu choi goi %d bytes do sai ma CRC-16! "
                        "(Tong drop: %u)\n",
                        bytesRead, rxDropCount);
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
    if (WiFi.getMode() == WIFI_STA && WiFi.status() == WL_CONNECTED) {
      ipStr = WiFi.localIP().toString();
    } else if (WiFi.getMode() == WIFI_AP) {
      ipStr = WiFi.softAPIP().toString();
    }

    int activeClients = webSocket.connectedClients();

    Serial.printf("[HEARTBEAT] UpTime: %02u:%02u:%02u | IP: %s | Clients: %d | "
                  "Drops: %u\n",
                  hours, minutes, seconds, ipStr.c_str(), activeClients,
                  rxDropCount);
  }

  // Nghỉ 2ms mỗi chu kỳ để giải phóng nhân CPU, hạ nhiệt độ chip và ổn định
  // nguồn 3.3V
  delay(2);
}
