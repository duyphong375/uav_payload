#include "kvc_camera.h"

#include <freertos/FreeRTOS.h>
#include <freertos/semphr.h>

#include "kvc_config.h"
#include "kvc_log.h"
#include "kvc_stats.h"

namespace kvc {
namespace camera {
namespace {

SemaphoreHandle_t s_lock = nullptr;
bool s_ready = false;
bool s_psram = false;
uint8_t s_fb_count = 0;

char s_sensor_name[16] = "UNKNOWN";
uint16_t s_sensor_pid = 0;

std::atomic<bool> s_close_requested{false};

const char *pid_name(uint16_t pid) {
    switch (pid) {
        case 0x2640:
        case 0x2641:
        case 0x2642:
            return "OV2640";
        case 0x3660:
            return "OV3660";
        case 0x5640:
            return "OV5640";
        case 0x7670:
            return "OV7670";
        case 0x7725:
            return "OV7725";
        case 0x2145:
            return "GC2145";
        case 0x032a:
            return "GC032A";
        case 0x030a:
            return "SC030IOT";
        default:
            return "UNKNOWN_PID";
    }
}

/** Áp cấu hình hình ảnh cho cảm biến đã nhận diện. */
void apply_sensor_tuning(sensor_t *s) {
    s->set_framesize(s, KVC_CAM_FRAME_SIZE);
    s->set_quality(s, KVC_CAM_JPEG_QUALITY);

    // Hướng quang học của module FPC 24 chân (cảm biến gắn lật).
    s->set_vflip(s, 1);
    s->set_hmirror(s, 0);

    // Bộ điều khiển tự động.
    s->set_gain_ctrl(s, 1);
    s->set_exposure_ctrl(s, 1);
    s->set_whitebal(s, 1);
    s->set_awb_gain(s, 1);

    s->set_brightness(s, KVC_CAM_BRIGHTNESS);
    s->set_contrast(s, 0);
    s->set_saturation(s, 0);
    s->set_sharpness(s, KVC_CAM_SHARPNESS);

    // AE_LEVEL: mục tiêu sáng. Giữ 0 để không kéo dài phơi sáng (mất FPS).
    s->set_ae_level(s, KVC_CAM_AE_LEVEL);

    // Với OV3660, driver ghi trực tiếp giá trị 10-bit Q4 vào 0x3A18/0x3A19.
    // Ép gain trần cao để AEC ưu tiên tăng ISO thay vì kéo dài màn trập.
    if (s_sensor_pid == 0x3660) {
        s->set_gainceiling(s, static_cast<gainceiling_t>(KVC_CAM_GAINCEILING_RAW));
    } else {
        s->set_gainceiling(s, GAINCEILING_16X);
    }

    s->set_aec2(s, KVC_CAM_AEC2);      // 0 = tắt night mode (night mode hạ FPS)
    s->set_raw_gma(s, 1);
    s->set_lenc(s, 1);
    s->set_bpc(s, 1);
    s->set_wpc(s, 1);
    s->set_denoise(s, KVC_CAM_DENOISE);
}

}  // namespace

bool init() {
    if (s_lock == nullptr) {
        s_lock = xSemaphoreCreateMutex();
        if (s_lock == nullptr) {
            LOGE("Khong tao duoc mutex camera");
            return false;
        }
    }

    s_psram = psramFound();

    camera_config_t config = {};
    config.ledc_channel = LEDC_CHANNEL_0;
    config.ledc_timer = LEDC_TIMER_0;

    config.pin_d0 = KVC_CAM_PIN_D0;
    config.pin_d1 = KVC_CAM_PIN_D1;
    config.pin_d2 = KVC_CAM_PIN_D2;
    config.pin_d3 = KVC_CAM_PIN_D3;
    config.pin_d4 = KVC_CAM_PIN_D4;
    config.pin_d5 = KVC_CAM_PIN_D5;
    config.pin_d6 = KVC_CAM_PIN_D6;
    config.pin_d7 = KVC_CAM_PIN_D7;

    config.pin_xclk = KVC_CAM_PIN_XCLK;
    config.pin_pclk = KVC_CAM_PIN_PCLK;
    config.pin_vsync = KVC_CAM_PIN_VSYNC;
    config.pin_href = KVC_CAM_PIN_HREF;
    config.pin_sccb_sda = KVC_CAM_PIN_SIOD;
    config.pin_sccb_scl = KVC_CAM_PIN_SIOC;

    config.pin_pwdn = KVC_CAM_PIN_PWDN;
    config.pin_reset = KVC_CAM_PIN_RESET;

    config.xclk_freq_hz = KVC_CAM_XCLK_HZ;
    config.pixel_format = PIXFORMAT_JPEG;
    config.frame_size = KVC_CAM_FRAME_SIZE;
    config.jpeg_quality = KVC_CAM_JPEG_QUALITY;

    if (s_psram) {
        config.fb_count = KVC_CAM_FB_COUNT_PSRAM;
        config.fb_location = CAMERA_FB_IN_PSRAM;
        // Lấy khung mới nhất: độ trễ hiển thị thấp, đúng cho camera quan sát.
        config.grab_mode = CAMERA_GRAB_LATEST;
    } else {
        config.fb_count = KVC_CAM_FB_COUNT_NO_PSRAM;
        config.fb_location = CAMERA_FB_IN_DRAM;
        config.grab_mode = CAMERA_GRAB_WHEN_EMPTY;
    }
    s_fb_count = static_cast<uint8_t>(config.fb_count);

    esp_err_t err = esp_camera_init(&config);
    if (err != ESP_OK) {
        LOGE("esp_camera_init that bai: 0x%04X (%s)", static_cast<unsigned>(err),
             esp_err_to_name(err));
        LOGE("0x105/0x107 = khong thay cam bien qua SCCB -> kiem tra SIOD/SIOC, cap FPC");
        s_ready = false;
        return false;
    }

    sensor_t *s = esp_camera_sensor_get();
    if (s == nullptr) {
        LOGE("esp_camera_sensor_get() tra NULL sau khi init thanh cong");
        esp_camera_deinit();
        s_ready = false;
        return false;
    }

    s_ready = true;
    s_sensor_pid = s->id.PID;
    snprintf(s_sensor_name, sizeof(s_sensor_name), "%s", pid_name(s_sensor_pid));

    apply_sensor_tuning(s);

    LOGI("Cam bien: %s (PID=0x%04X)", s_sensor_name, static_cast<unsigned>(s_sensor_pid));
    LOGI("Cau hinh: %dx%d JPEG q=%d, fb_count=%d, %s, xclk=%d MHz",
         KVC_CAM_FRAME_WIDTH, KVC_CAM_FRAME_HEIGHT, KVC_CAM_JPEG_QUALITY,
         static_cast<int>(s_fb_count), s_psram ? "PSRAM" : "DRAM (khong co PSRAM)",
         KVC_CAM_XCLK_HZ / 1000000);

    if (s_sensor_pid != 0x3660) {
        LOGW("CANH BAO: ky vong OV3660 (PID=0x3660) nhung doc duoc 0x%04X (%s).",
             static_cast<unsigned>(s_sensor_pid), s_sensor_name);
        LOGW("Hieu chuan mau cho OV3660 KHONG ap dung cho cam bien nay.");
    }

    return true;
}

void restart(const char *why) {
    LOGW("Khoi tao lai camera: %s", why);
    stats::cam_restarts.fetch_add(1);

    if (s_ready) {
        esp_camera_deinit();
        s_ready = false;
    }
    delay(200);
    if (!init()) {
        LOGE("Khoi tao lai that bai; se thu lai theo backoff");
    }
}

camera_fb_t *acquire(uint32_t lock_timeout_ms) {
    if (s_lock == nullptr) return nullptr;

    if (xSemaphoreTake(s_lock, pdMS_TO_TICKS(lock_timeout_ms)) != pdTRUE) {
        stats::lock_timeouts.fetch_add(1);
        return nullptr;
    }

    stats::last_attempt_ms.store(millis());
    stats::attempts_since_ok.fetch_add(1);

    camera_fb_t *fb = esp_camera_fb_get();

    // Nhả khoá NGAY: driver giữ framebuffer cho tới khi fb_return(), nên không
    // cần khoá trong suốt thời gian gửi TCP.
    xSemaphoreGive(s_lock);

    // Ghi nhận sức khoẻ CAMERA, tách khỏi việc gửi TCP thành công hay không.
    if (fb != nullptr) {
        stats::fb_ok_total.fetch_add(1);
        stats::fb_null_since.store(0);
    } else {
        stats::fb_null_total.fetch_add(1);
        uint32_t expected = 0;
        stats::fb_null_since.compare_exchange_strong(expected, millis());
    }

    return fb;
}

void release(camera_fb_t *fb) {
    if (fb != nullptr) esp_camera_fb_return(fb);
}

bool ready() { return s_ready; }
const char *sensor_name() { return s_sensor_name; }
uint16_t sensor_pid() { return s_sensor_pid; }
bool psram_found() { return s_psram; }
uint8_t fb_count() { return s_fb_count; }

void request_stream_close() { s_close_requested.store(true); }
bool stream_close_requested() { return s_close_requested.load(); }
void clear_stream_close_request() { s_close_requested.store(false); }

}  // namespace camera
}  // namespace kvc
