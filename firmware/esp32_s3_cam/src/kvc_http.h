/**
 * @file kvc_http.h
 * @brief HTTP server MJPEG cho IF-05.
 */

#pragma once

#include <Arduino.h>

namespace kvc {
namespace http {

bool start();

/** Số kết nối /stream tối đa được phục vụ đồng thời. */
uint8_t max_streams();

}  // namespace http
}  // namespace kvc
