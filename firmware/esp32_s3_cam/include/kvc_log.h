/**
 * @file kvc_log.h
 * @brief Macro log dùng chung cho firmware ESP32-S3-CAM.
 *
 * Dùng UART0 (GPIO43/44), 115200 8N1, khớp `monitor_speed` trong platformio.ini.
 * Không dùng USB-CDC: một số module để cổng USB ở chế độ không có CDC và log sẽ
 * mất đúng lúc cần nhất.
 */

#pragma once

#include <Arduino.h>

#ifndef KVC_LOG_LEVEL
#define KVC_LOG_LEVEL 2
#endif

#define KVC_LOG_PREFIX "[CAM]"

#if KVC_LOG_LEVEL >= 3
#define LOGD(fmt, ...) Serial.printf(KVC_LOG_PREFIX "[D] " fmt "\n", ##__VA_ARGS__)
#else
#define LOGD(fmt, ...) ((void)0)
#endif

#if KVC_LOG_LEVEL >= 2
#define LOGI(fmt, ...) Serial.printf(KVC_LOG_PREFIX "[I] " fmt "\n", ##__VA_ARGS__)
#else
#define LOGI(fmt, ...) ((void)0)
#endif

#define LOGW(fmt, ...) Serial.printf(KVC_LOG_PREFIX "[W] " fmt "\n", ##__VA_ARGS__)
#define LOGE(fmt, ...) Serial.printf(KVC_LOG_PREFIX "[E] " fmt "\n", ##__VA_ARGS__)
