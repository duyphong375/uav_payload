/**
 * @file net_policy.cpp
 * @brief Cài đặt quyết định chế độ mạng theo thứ tự ưu tiên. Xem net_policy.h.
 */

#include "net_policy.h"

namespace kvc {

NetAction netPolicyEvaluate(const NetPolicyState &state, uint32_t nowMs,
                            uint32_t retryIntervalMs) {
  /* Ưu tiên 1 chưa được cấu hình: SoftAP đang là phương án duy nhất. */
  if (!state.staConfigured) {
    return NetAction::None;
  }

  if (state.staConnected) {
    /* Ưu tiên 1 hoạt động: đóng SoftAP dự phòng nếu đang phát. */
    return state.apStarted ? NetAction::CloseSoftAp : NetAction::None;
  }

  /* Ưu tiên 1 chưa nối: thử lại theo chu kỳ. Dùng phép trừ không dấu để vẫn
   * đúng khi millis() tràn qua 2^32. */
  if ((uint32_t)(nowMs - state.lastStaAttemptMs) >= retryIntervalMs) {
    return NetAction::RetrySta;
  }

  return NetAction::None;
}

size_t netNextConfiguredIndex(const char *const *ssids, size_t count,
                              size_t afterIndex) {
  if (ssids == nullptr || count == 0U) {
    return count;
  }

  for (size_t i = 0; i < count; i++) {
    const size_t idx = (afterIndex + i) % count;
    const char *ssid = ssids[idx];
    if (ssid != nullptr && ssid[0] != '\0') {
      return idx;
    }
  }
  return count;
}

} // namespace kvc
