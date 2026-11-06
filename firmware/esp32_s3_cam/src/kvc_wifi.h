/**
 * @file kvc_wifi.h
 * @brief Kết nối Wi-Fi (STA chuẩn H3) + mDNS.
 */

#pragma once

#include <Arduino.h>

namespace kvc {
namespace wifi {

/** Bắt đầu kết nối. Không chặn chờ IP — dùng maintain() trong loop(). */
void begin();

/** Duy trì kết nối với backoff. Gọi mỗi vòng loop(). */
void maintain();

/** Khởi tạo/khôi phục mDNS khi đã có IP. Gọi mỗi vòng loop(). */
void maintain_mdns();

bool connected();

}  // namespace wifi
}  // namespace kvc
