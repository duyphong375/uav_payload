/**
 * @file kvc_health.cpp
 * @brief Watchdog camera và log chẩn đoán.
 *
 * QUY TẮC WATCHDOG
 *
 * Watchdog stall CHỈ có nghĩa khi đang có client chờ khung. Không có client thì
 * `esp_camera_fb_get()` không được gọi, nên mọi bộ đếm còn lại từ phiên trước
 * đều vô nghĩa. Bug thấy trên bo thật (03/11/2026): sau khi người xem cuối đóng
 * tab, watchdog đọc bộ đếm sót lại và deinit/init camera 3 lần liền.
 *
 * Mốc thời gian phải là "khung đầu tiên của PHIÊN HIỆN TẠI", không phải khung
 * cuối của phiên trước — nếu không, client vừa kết nối sau >10 s uptime bị coi
 * là stall ngay khung đầu và bị đá ra.
 *
 * Khi phát hiện stall thật: đặt cờ để handler tự đóng stream và nhả
 * framebuffer, rồi MỚI deinit/init khi `active_streams == 0`. Không bao giờ giải
 * phóng framebuffer mà handler còn đang dùng.
 */

#include "kvc_health.h"

#include <WiFi.h>

#include "kvc_camera.h"
#include "kvc_config.h"
#include "kvc_http.h"
#include "kvc_log.h"
#include "kvc_stats.h"

namespace kvc {
namespace health {
namespace {

bool s_stall_pending = false;
uint32_t s_session_start_ms = 0;
int s_active_at_session_start = 0;
uint32_t s_restart_backoff_ms = KVC_CAM_STALL_RESTART_MS;
uint32_t s_next_restart_ms = 0;

const char *phase_name(stats::StreamPhase p) {
    switch (p) {
        case stats::StreamPhase::Acquiring:
            return "cho-camera";
        case stats::StreamPhase::Sending:
            return "dang-gui";
        case stats::StreamPhase::Idle:
        default:
            return "ranh";
    }
}

}  // namespace

void maintain_camera() {
    const uint32_t now = millis();
    const int active = stats::active_streams.load();

    // Ranh giới phiên: đếm bằng bộ đếm trong handler, KHÔNG suy từ việc loop()
    // kịp quan sát `active_streams`. Client ngắt rồi nối lại trong <20 ms từng
    // làm watchdog so với mốc của phiên cũ và restart camera oan.
    static uint32_t s_seen_sessions = 0;
    uint32_t sessions = stats::session_starts.load();
    if (sessions != s_seen_sessions) {
        s_seen_sessions = sessions;
        s_session_start_ms = now;
        s_active_at_session_start = active;
    }

    if (active > 0) {
        // Chỉ coi là stall khi CAMERA thực sự không trả được khung. `attempts`
        // và `last_ok_ms` phụ thuộc việc gửi TCP thành công, nên dùng chúng ở
        // đây sẽ restart camera khi mạng hỏng — đúng lỗi thấy trong log
        // 03/11/2026 (send_fail=8, camera vẫn khoẻ, vẫn bị deinit/init).
        uint32_t null_since = stats::fb_null_since.load();
        if (null_since == 0) {
            // Camera vẫn trả framebuffer: khoẻ. Không đụng gì tới camera.
            return;
        }

        if (now - null_since <= KVC_CAM_STALL_RESTART_MS) return;

        if (!s_stall_pending) {
            LOGW("Camera tra NULL lien tuc %u ms khi co %d client: yeu cau dong stream",
                 static_cast<unsigned>(now - null_since), active);
            s_stall_pending = true;
            camera::request_stream_close();
        }
        return;
    }

    // ---- Không còn client ----
    if (!s_stall_pending) {
        // Phiên kết thúc bình thường. KHÔNG đụng `s_next_restart_ms` để backoff
        // sau một lần restart thật vẫn còn hiệu lực.
        stats::attempts_since_ok.store(0);
        return;
    }

    if (now < s_next_restart_ms) return;

    s_stall_pending = false;
    camera::clear_stream_close_request();
    stats::attempts_since_ok.store(0);
    stats::fb_null_since.store(0);

    camera::restart("camera khong tra duoc framebuffer");

    s_restart_backoff_ms = (s_restart_backoff_ms * 2 > KVC_CAM_RESTART_MAX_BACKOFF_MS)
                               ? KVC_CAM_RESTART_MAX_BACKOFF_MS
                               : s_restart_backoff_ms * 2;
    s_next_restart_ms = millis() + s_restart_backoff_ms;
    LOGW("Lan khoi tao lai tiep theo sau %u ms",
         static_cast<unsigned>(s_restart_backoff_ms));
}

void maintain_log() {
    static uint32_t next = 0;
    const uint32_t now = millis();
    if (now < next) return;
    next = now + KVC_LOG_PERIOD_MS;

    IPAddress ip = (WiFi.getMode() & WIFI_AP) ? WiFi.softAPIP() : WiFi.localIP();
    int rssi = (WiFi.getMode() & WIFI_AP)
                   ? 0
                   : ((WiFi.status() == WL_CONNECTED) ? WiFi.RSSI() : 0);

    // Chốt cửa sổ đo: fps, thời gian chờ camera, thời gian gửi TCP, cỡ khung.
    stats::Window w = stats::close_window(now);

    uint32_t phase_since = stats::stream_phase_since_ms.load();
    uint32_t phase_age_ms = (phase_since != 0) ? (now - phase_since) : 0;

    LOGI("ip=%s rssi=%d heap=%u psram=%u | frames=%u fps=%u.%02u "
         "wait=%ums tx=%ums bytes=%u kbps=%u | "
         "fail=%u null=%u oversize=%u send_fail=%u lock_to=%u rejected=%u "
         "stall=%u restarts=%u | active=%d/%d phase=%s %ums",
         ip.toString().c_str(), rssi, static_cast<unsigned>(ESP.getFreeHeap()),
         static_cast<unsigned>(ESP.getFreePsram()),
         static_cast<unsigned>(stats::frames_served.load()),
         static_cast<unsigned>(w.fps_x100 / 100),
         static_cast<unsigned>(w.fps_x100 % 100),
         static_cast<unsigned>(w.avg_wait_ms),
         static_cast<unsigned>(w.avg_tx_ms),
         static_cast<unsigned>(w.avg_bytes),
         static_cast<unsigned>(w.tx_kbps),
         static_cast<unsigned>(stats::fb_get_failures.load()),
         static_cast<unsigned>(stats::fb_null_total.load()),
         static_cast<unsigned>(stats::oversize_drops.load()),
         static_cast<unsigned>(stats::send_failures.load()),
         static_cast<unsigned>(stats::lock_timeouts.load()),
         static_cast<unsigned>(stats::rejected_clients.load()),
         static_cast<unsigned>(stats::stall_closes.load()),
         static_cast<unsigned>(stats::cam_restarts.load()),
         stats::active_streams.load(), static_cast<int>(http::max_streams()),
         phase_name(stats::stream_phase.load()),
         static_cast<unsigned>(phase_age_ms));
}

}  // namespace health
}  // namespace kvc
