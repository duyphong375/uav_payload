#include "kvc_stats.h"

#include <Arduino.h>

namespace kvc {
namespace stats {

std::atomic<uint32_t> frames_served{0};
std::atomic<uint32_t> fb_get_failures{0};
std::atomic<uint32_t> oversize_drops{0};
std::atomic<uint32_t> send_failures{0};
std::atomic<uint32_t> client_errors{0};
std::atomic<uint32_t> lock_timeouts{0};
std::atomic<uint32_t> stall_closes{0};
std::atomic<uint32_t> stream_requests{0};
std::atomic<uint32_t> rejected_clients{0};
std::atomic<uint32_t> cam_restarts{0};
std::atomic<uint32_t> wifi_drops{0};
std::atomic<uint32_t> wifi_reconnects{0};

std::atomic<int> active_streams{0};
std::atomic<uint32_t> last_ok_ms{0};
std::atomic<uint32_t> last_attempt_ms{0};
std::atomic<uint32_t> attempts_since_ok{0};

std::atomic<uint32_t> fb_null_total{0};
std::atomic<uint32_t> fb_null_since{0};
std::atomic<uint32_t> fb_ok_total{0};
std::atomic<uint32_t> session_starts{0};

std::atomic<uint32_t> win_wait_ms{0};
std::atomic<uint32_t> win_tx_ms{0};
std::atomic<uint32_t> win_bytes{0};

std::atomic<StreamPhase> stream_phase{StreamPhase::Idle};
std::atomic<uint32_t> stream_phase_since_ms{0};

void set_phase(StreamPhase phase) {
    stream_phase.store(phase);
    stream_phase_since_ms.store(millis());
}

namespace {
uint32_t s_prev_frames = 0;
uint32_t s_prev_ms = 0;
}  // namespace

Window close_window(uint32_t now_ms) {
    Window w;

    uint32_t frames = frames_served.load();
    if (s_prev_ms != 0) {
        uint32_t dt = now_ms - s_prev_ms;
        w.frames = frames - s_prev_frames;
        if (dt != 0) {
            w.fps_x100 = static_cast<uint32_t>(
                (static_cast<uint64_t>(w.frames) * 100000ULL) / dt);
        }
    }
    s_prev_frames = frames;
    s_prev_ms = now_ms;

    uint32_t wait_ms = win_wait_ms.exchange(0);
    uint32_t tx_ms = win_tx_ms.exchange(0);
    uint32_t bytes = win_bytes.exchange(0);
    if (w.frames != 0) {
        w.avg_wait_ms = wait_ms / w.frames;
        w.avg_tx_ms = tx_ms / w.frames;
        w.avg_bytes = bytes / w.frames;
    }

    // KB/s thực đo trên cửa sổ: tổng byte / tổng thời gian gửi. Khác hẳn
    // "bytes × fps" vì mẫu số là thời gian THẬT SỰ nằm trong send(), không phải
    // toàn bộ cửa sổ (phần còn lại là chờ camera và khe hở giữa các khung).
    // Đây là con số quyết định giữa "nghẽn băng thông" và "nghẽn số gói".
    if (tx_ms != 0) {
        w.tx_kbps = static_cast<uint32_t>(
            (static_cast<uint64_t>(bytes) * 1000ULL) / (static_cast<uint64_t>(tx_ms) * 1024ULL));
    }

    return w;
}

Snapshot snapshot() {
    Snapshot s;
    s.frames_served = frames_served.load();
    s.fb_get_failures = fb_get_failures.load();
    s.oversize_drops = oversize_drops.load();
    s.send_failures = send_failures.load();
    s.client_errors = client_errors.load();
    s.lock_timeouts = lock_timeouts.load();
    s.stall_closes = stall_closes.load();
    s.stream_requests = stream_requests.load();
    s.rejected_clients = rejected_clients.load();
    s.cam_restarts = cam_restarts.load();
    s.wifi_drops = wifi_drops.load();
    s.wifi_reconnects = wifi_reconnects.load();
    s.active_streams = active_streams.load();
    s.last_ok_ms = last_ok_ms.load();
    s.last_attempt_ms = last_attempt_ms.load();
    return s;
}

}  // namespace stats
}  // namespace kvc
