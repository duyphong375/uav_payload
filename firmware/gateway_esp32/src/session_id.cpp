/**
 * @file session_id.cpp
 * @brief Cài đặt sinh `gateway_session_id`. Xem session_id.h.
 */

#include "session_id.h"

namespace kvc {

namespace {

/* Finalizer splitmix32: khuếch tán mọi bit đầu vào ra toàn bộ 32 bit đầu ra,
 * nhờ đó MAC gần giống nhau vẫn cho session id khác xa nhau. */
uint32_t mix32(uint32_t value) {
  value += 0x9E3779B9U;
  value ^= value >> 16;
  value *= 0x21F0AAADU;
  value ^= value >> 15;
  value *= 0x735A2D97U;
  value ^= value >> 15;
  return value;
}

} // namespace

uint32_t deriveGatewaySessionId(uint32_t randomNonce, uint32_t macLow,
                                uint32_t macHigh) {
  uint32_t id = mix32(randomNonce ^ mix32(macLow) ^ mix32((macHigh & 0xFFFFU) ^ 0xA5A5A5A5U));
  id = mix32(id);

  /* 0 và 1 nằm ngoài miền hợp lệ: 0 trông như "chưa khởi tạo", 1 là hằng số
   * của firmware cũ nên không chứng minh được phiên đã đổi. */
  if (id < kGatewaySessionIdMin) {
    id += kGatewaySessionIdMin;
  }
  return id;
}

} // namespace kvc
