/**
 * @file kvc_health.h
 * @brief Watchdog camera + log định kỳ.
 */

#pragma once

#include <Arduino.h>

namespace kvc {
namespace health {

/** Gọi mỗi vòng loop(): quyết định restart camera khi stall thật. */
void maintain_camera();

/** Gọi mỗi vòng loop(): in log chẩn đoán mỗi KVC_LOG_PERIOD_MS. */
void maintain_log();

}  // namespace health
}  // namespace kvc
