/**
 * @file rf_decode.h
 * @brief Giải mã/kiểm tra gói RF 32 byte (IF-02) cho Gateway trạm đất.
 *
 * VÌ SAO TÁCH RIÊNG: trước đây struct, CRC-16, kiểm tra gói và chuyển Hex nằm
 * lẫn trong `main.cpp` và phụ thuộc Arduino, nên KHÔNG có test nào chạy được
 * trên host. Module này thuần C++ (chỉ <stdint.h>/<stddef.h>), biên dịch được
 * bằng cả toolchain ESP32 và g++ trên PC, nhờ đó lớp quyết định đúng/sai của
 * chuỗi REAL có test tự động.
 *
 * Hợp đồng tham chiếu: docs/interfaces/IF_MCU_LORA_RF.md (IF-02).
 * Định nghĩa phía MCU: firmware/mcu_payload/inc/kvc_telemetry.h.
 * Nếu hai bên lệch layout, static_assert dưới đây làm build FAIL ngay.
 *
 * Người phụ trách phân hệ Gateway: Đoàn Thanh Trường Thịnh
 */

#ifndef KVC_GATEWAY_RF_DECODE_H
#define KVC_GATEWAY_RF_DECODE_H

#include <stddef.h>
#include <stdint.h>

namespace kvc {

/* Kích thước gói RF chuẩn IF-02 và vùng dữ liệu được bảo vệ bởi CRC. */
constexpr size_t kRfPacketSize = 32U;
constexpr size_t kRfCrcCoverage = 30U;

/* Byte đồng bộ đầu khung. */
constexpr uint8_t kRfSync0 = 0xAAU;
constexpr uint8_t kRfSync1 = 0x55U;

/* Message ID (IF-02 byte 2). */
constexpr uint8_t kMsgIdTelemetry = 0x01U;
constexpr uint8_t kMsgIdHeartbeat = 0x02U;

/* CRC-16/CCITT-FALSE của golden vector GV-01 (IF-02 mục 3), dùng chung với
 * firmware MCU và parser Python. */
constexpr uint16_t kGoldenGv01Crc16 = 0x304EU;

/**
 * @brief Gói telemetry 32 byte Little-Endian nhận từ UAV.
 *
 * Layout khoá bằng static_assert bên dưới; mọi thay đổi phải cập nhật
 * docs/interfaces/IF_MCU_LORA_RF.md và golden vectors trong cùng commit.
 */
struct __attribute__((packed)) RfTelemetryPacket32 {
  uint8_t sync[2];        // Byte 0..1
  uint8_t msg_id;         // Byte 2
  uint8_t seq_num;        // Byte 3
  uint32_t timestamp_ms;  // Byte 4..7
  int32_t target_lat;     // Byte 8..11
  int32_t target_lon;     // Byte 12..15
  int16_t target_x_local; // Byte 16..17
  int16_t target_y_local; // Byte 18..19
  union {
    uint16_t alt_dist_cm;   // Byte 20..21 (tên chuẩn IF-02)
    uint16_t lidar_dist_cm; // Bí danh cũ, giữ để mã hiện hành biên dịch
  };
  uint8_t class_id;     // Byte 22
  uint8_t confidence;   // Byte 23
  uint8_t sensor_flags; // Byte 24
  uint8_t battery_raw;  // Byte 25
  uint8_t reserved[4];  // Byte 26..29
  uint16_t crc16;       // Byte 30..31
};

static_assert(sizeof(RfTelemetryPacket32) == kRfPacketSize,
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

/**
 * @brief Tính CRC-16/CCITT-FALSE.
 *
 * Poly 0x1021, Init 0xFFFF, RefIn/RefOut false, XorOut 0x0000.
 *
 * @param data Con trỏ dữ liệu; NULL với length > 0 trả về 0xFFFF (không tính).
 * @param length Số byte cần tính; với gói RF là 30.
 * @return Giá trị CRC 16-bit.
 */
uint16_t calculateCrc16(const uint8_t *data, size_t length);

/**
 * @brief Thẩm định gói 32 byte: đúng độ dài, đúng sync, đúng CRC.
 *
 * @param packetBuffer Con trỏ tới gói nhận được.
 * @param length Độ dài thực nhận; phải đúng 32.
 * @return true nếu gói nguyên vẹn.
 */
bool validatePacketCrc(const uint8_t *packetBuffer, size_t length);

/**
 * @brief Đổi mảng byte sang chuỗi hex thường, zero-padded.
 *
 * @param data Dữ liệu nguồn.
 * @param length Số byte cần đổi.
 * @param output Vùng đệm đích, tối thiểu length * 2 + 1 byte.
 * @param outputSize Kích thước vùng đệm đích.
 * @return true nếu đổi thành công; false nếu tham số/vùng đệm không hợp lệ.
 */
bool bytesToHexString(const uint8_t *data, size_t length, char *output,
                      size_t outputSize);

/**
 * @brief Kiểm tra gói có khớp golden vector GV-01 của IF-02 hay không.
 *        Dùng để phát hiện lệch ABI giữa MCU, Gateway và parser Python.
 *
 * @param pkt Gói cần kiểm tra; NULL trả về false.
 * @return true nếu mọi trường và CRC khớp GV-01.
 */
bool matchesGoldenGv01(const RfTelemetryPacket32 *pkt);

} // namespace kvc

#endif /* KVC_GATEWAY_RF_DECODE_H */
