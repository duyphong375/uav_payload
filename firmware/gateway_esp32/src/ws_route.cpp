/**
 * @file ws_route.cpp
 * @brief Cài đặt quy tắc path WebSocket. Xem ws_route.h.
 */

#include "ws_route.h"

#include <cstring>

namespace kvc {

const char kTelemetryPath[] = "/telemetry";

bool isAcceptedTelemetryPath(const char *path, size_t length) {
  if (path == nullptr) {
    return false;
  }

  const size_t baseLength = sizeof(kTelemetryPath) - 1U; // bỏ '\0'
  if (length < baseLength) {
    return false;
  }
  if (std::memcmp(path, kTelemetryPath, baseLength) != 0) {
    return false;
  }
  if (length == baseLength) {
    return true;
  }

  /* Chỉ cho phép query string ngay sau path. `/telemetry/` hay
   * `/telemetryXYZ` đều bị từ chối vì không phải endpoint đã công bố. */
  return path[baseLength] == '?';
}

} // namespace kvc
