/**
 * @file main.cpp
 * @brief ESP32-S3-CAM — kênh video quan sát phụ (IF-05).
 *
 * VAI TRÒ TRONG HỆ THỐNG
 *
 * Thiết bị này là CAMERA QUAN SÁT. Nó KHÔNG sinh tọa độ, KHÔNG chạy AI, KHÔNG
 * gửi gì vào LoRa. Nguồn tọa độ duy nhất của KVC vẫn là
 * OV2640 -> FPGA blob -> IF-01 -> MCU -> IF-02 -> Gateway -> GCS.
 *
 * Nhãn trên dashboard là RELAY: backend kéo MJPEG từ đây rồi phát lại cho trình
 * duyệt. Trình duyệt KHÔNG bao giờ gọi thẳng thiết bị này (IF-03).
 *
 * CẤU TRÚC
 *
 *   kvc_config.h    mọi hằng số chỉnh được (chân, khung hình, Wi-Fi, ngưỡng)
 *   kvc_stats.*     bộ đếm atomic + cửa sổ đo fps/wait/tx
 *   kvc_camera.*    driver OV3660 + mutex framebuffer
 *   kvc_http.*      esp_http_server, MJPEG :81
 *   kvc_wifi.*      STA (chuẩn H3) + mDNS
 *   kvc_health.*    watchdog camera + log định kỳ
 *
 * HAI ĐIỀU KHÔNG ĐƯỢC ĐỔI (đã đo trên bo thật, xem README):
 *
 *   1. `fb_count` phải >= 3. Với CAMERA_GRAB_LATEST driver tạo queue dài
 *      fb_count-1; fb_count=2 làm DVP dừng mỗi khung -> 0,4 FPS.
 *   2. Watchdog stall chỉ được chạy khi có client, và mốc thời gian phải là
 *      khung đầu của phiên hiện tại. Nếu không camera bị restart vô cớ.
 */

#include <Arduino.h>

#include "kvc_camera.h"
#include "kvc_config.h"
#include "kvc_health.h"
#include "kvc_http.h"
#include "kvc_log.h"
#include "kvc_stats.h"
#include "kvc_wifi.h"

void setup() {
    Serial.begin(115200);
    delay(300);   // cho UART ổn định trước khi in dòng đầu

    Serial.println();
    Serial.println("=====================================================");
    LOGI("%s %s", KVC_FW_NAME, KVC_FW_VERSION);
    LOGI("Vai tro: camera quan sat (IF-05). KHONG sinh toa do.");
    Serial.println("=====================================================");

    LOGI("Chip: %s rev %d, %d MHz, flash %u MB", ESP.getChipModel(),
         static_cast<int>(ESP.getChipRevision()),
         static_cast<int>(getCpuFrequencyMhz()),
         static_cast<unsigned>(ESP.getFlashChipSize() / (1024 * 1024)));

    if (psramFound()) {
        LOGI("PSRAM: %u byte", static_cast<unsigned>(ESP.getPsramSize()));
    } else {
        LOGW("KHONG co PSRAM: chi 1 framebuffer trong DRAM, stream se giat.");
        LOGW("Kiem tra board trong platformio.ini (N16R8 can PSRAM OPI).");
    }

    if (!kvc::camera::init()) {
        // Không reboot: giữ thiết bị sống để còn đọc /status và log. Người vận
        // hành cần thấy lỗi, không cần thấy boot loop.
        LOGE("Camera khong khoi tao duoc. Van chay HTTP de bao trang thai.");
    }

    kvc::wifi::begin();

    if (!kvc::http::start()) {
        LOGE("Khong khoi tao duoc HTTP server.");
    }

    // mDNS được khởi tạo trong loop() khi đã có IP (xem kvc_wifi.cpp).
    kvc::wifi::maintain_mdns();

    LOGI("San sang.");
}

void loop() {
    kvc::wifi::maintain();
    kvc::wifi::maintain_mdns();
    kvc::health::maintain_camera();
    kvc::health::maintain_log();

    // Nhường CPU cho task của httpd và Wi-Fi. delay(0) không nhường đủ.
    vTaskDelay(pdMS_TO_TICKS(20));
}
