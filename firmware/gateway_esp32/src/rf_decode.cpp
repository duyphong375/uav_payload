/**
 * @file rf_decode.cpp
 * @brief Cài đặt giải mã/kiểm tra gói RF 32 byte (IF-02). Xem rf_decode.h.
 *
 * Không phụ thuộc Arduino/ESP-IDF: chỉ dùng <stdint.h>/<stddef.h>. Nhờ vậy
 * cùng một mã được biên dịch cho ESP32-C3 và cho host test (g++).
 */

#include "rf_decode.h"

#include <cstring>

namespace kvc {

uint16_t calculateCrc16(const uint8_t *data, size_t length) {
  if (data == nullptr) {
    return 0xFFFFU;
  }

  uint16_t crc = 0xFFFFU;
  for (size_t i = 0; i < length; i++) {
    crc ^= static_cast<uint16_t>(data[i]) << 8;
    for (uint8_t bit = 0; bit < 8U; bit++) {
      if ((crc & 0x8000U) != 0U) {
        crc = static_cast<uint16_t>((crc << 1) ^ 0x1021U);
      } else {
        crc = static_cast<uint16_t>(crc << 1);
      }
    }
  }
  return crc;
}

bool validatePacketCrc(const uint8_t *packetBuffer, size_t length) {
  if (packetBuffer == nullptr || length != kRfPacketSize) {
    return false;
  }

  if (packetBuffer[0] != kRfSync0 || packetBuffer[1] != kRfSync1) {
    return false;
  }

  /* Đọc crc16 bằng memcpy: buffer nhận từ LoRa là mảng byte có thể không căn
   * 2 byte, nên không được ép kiểu con trỏ struct để đọc truong này. */
  uint16_t receivedCrc = 0U;
  std::memcpy(&receivedCrc, packetBuffer + kRfCrcCoverage, sizeof(receivedCrc));

  return calculateCrc16(packetBuffer, kRfCrcCoverage) == receivedCrc;
}

bool bytesToHexString(const uint8_t *data, size_t length, char *output,
                      size_t outputSize) {
  if (data == nullptr || output == nullptr || outputSize == 0U) {
    return false;
  }

  /* Chia thay vì nhân để không tràn khi tính length * 2 + 1. */
  if (length > (outputSize - 1U) / 2U) {
    output[0] = '\0';
    return false;
  }

  static const char kHexChars[] = "0123456789abcdef";
  size_t out = 0U;
  for (size_t i = 0; i < length; i++) {
    output[out++] = kHexChars[(data[i] >> 4) & 0x0FU];
    output[out++] = kHexChars[data[i] & 0x0FU];
  }
  output[out] = '\0';
  return true;
}

bool matchesGoldenGv02(const RfTelemetryPacket32 *pkt) {
  if (pkt == nullptr) {
    return false;
  }

  return pkt->crc16 == kGoldenGv02Crc16 && pkt->sync[0] == kRfSync0 &&
         pkt->sync[1] == kRfSync1 && pkt->msg_id == kMsgIdTelemetry &&
         pkt->seq_num == 42U && pkt->timestamp_ms == 1000UL &&
         pkt->target_lat == 107723450L && pkt->target_lon == 1066578900L &&
         pkt->target_x_local == 150 && pkt->target_y_local == 320 &&
         pkt->alt_dist_cm == 240U && pkt->class_id == 1U &&
         pkt->confidence == 92U && pkt->sensor_flags == 0x0FU &&
         pkt->status_reserved == 0U;
}

} // namespace kvc
