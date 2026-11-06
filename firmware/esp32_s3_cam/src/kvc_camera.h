/**
 * @file kvc_camera.h
 * @brief Quản lý driver camera OV3660 và khoá truy cập framebuffer.
 *
 * Vì sao cần khoá: `esp_camera_fb_get()` không an toàn khi gọi đồng thời từ
 * nhiều task. Backend có thể mở nhiều kết nối `/stream`, nên nhiều handler có
 * thể cùng chạy. Firmware serialize lời gọi `fb_get()` bằng một mutex và NHẢ
 * KHOÁ ngay khi có con trỏ framebuffer — KHÔNG giữ khoá trong lúc gửi TCP.
 *
 * Vì sao nhả khoá sớm là an toàn: driver không ghi đè framebuffer đã trả cho
 * tới khi `esp_camera_fb_return()` được gọi. Với fb_count = 3, DMA còn 2 buffer
 * để chụp tiếp trong lúc handler đang gửi.
 */

#pragma once

#include <Arduino.h>
#include <atomic>

#include "esp_camera.h"

namespace kvc {
namespace camera {

/** Khởi tạo driver camera. Trả false nếu thất bại (đã log lý do). */
bool init();

/** Deinit + init lại. CHỈ gọi khi không còn handler nào chạy. */
void restart(const char *why);

/** Lấy framebuffer dưới khoá. Trả nullptr nếu timeout hoặc driver lỗi. */
camera_fb_t *acquire(uint32_t lock_timeout_ms);

/** Trả framebuffer về driver. */
void release(camera_fb_t *fb);

bool ready();
const char *sensor_name();
uint16_t sensor_pid();
bool psram_found();
uint8_t fb_count();

/** Đặt cờ yêu cầu handler /stream thoát để có thể deinit an toàn. */
void request_stream_close();
bool stream_close_requested();
void clear_stream_close_request();

}  // namespace camera
}  // namespace kvc
