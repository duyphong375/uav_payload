/**
 * @file kvc_stats.h
 * @brief Bộ đếm và số đo dùng chung giữa các task của firmware.
 *
 * Mọi trường là `std::atomic` vì được ghi từ task của httpd (nhiều task song
 * song) và đọc từ `loop()` cùng handler `/status`. Không cần mutex riêng cho
 * từng bộ đếm.
 */

#pragma once

#include <atomic>
#include <cstdint>

namespace kvc {
namespace stats {

// ---- Bộ đếm tích luỹ từ lúc boot -----------------------------------------
extern std::atomic<uint32_t> frames_served;      // khung gửi TCP thành công
extern std::atomic<uint32_t> fb_get_failures;    // esp_camera_fb_get() trả NULL
extern std::atomic<uint32_t> oversize_drops;     // khung > KVC_MAX_JPEG_BYTES
extern std::atomic<uint32_t> send_failures;      // client đứt khi đang gửi
extern std::atomic<uint32_t> client_errors;      // handler trả lỗi
extern std::atomic<uint32_t> lock_timeouts;      // không lấy được khoá camera
extern std::atomic<uint32_t> stall_closes;       // handler tự đóng vì stall
extern std::atomic<uint32_t> stream_requests;    // tổng số lần GET /stream
extern std::atomic<uint32_t> rejected_clients;   // bị từ chối vì quá tải
extern std::atomic<uint32_t> cam_restarts;
extern std::atomic<uint32_t> wifi_drops;
extern std::atomic<uint32_t> wifi_reconnects;

extern std::atomic<int> active_streams;          // handler /stream đang chạy
extern std::atomic<uint32_t> last_ok_ms;
extern std::atomic<uint32_t> last_attempt_ms;
extern std::atomic<uint32_t> attempts_since_ok;

// ---- Bằng chứng CAMERA stall (tách khỏi lỗi TCP) -------------------------
//
// `attempts_since_ok` ở trên tăng mỗi lần gọi esp_camera_fb_get() và chỉ được
// xoá khi GỬI TCP thành công. Vì vậy "camera khoẻ nhưng mạng hỏng" trông y hệt
// "camera stall" — và watchdog đã restart camera oan (log 03/11/2026:
// send_fail=8, camera vẫn trả khung bình thường nhưng vẫn bị deinit/init).
//
// Ba biến dưới đây chỉ phản ánh SỨC KHOẺ CAMERA, không dính gì tới TCP:
//   fb_null_total  - tổng số lần esp_camera_fb_get() trả NULL
//   fb_null_since  - millis() của lần trả NULL ĐẦU TIÊN trong chuỗi liên tiếp
//   fb_ok_total    - tổng số lần lấy được framebuffer (bất kể gửi được hay không)
extern std::atomic<uint32_t> fb_null_total;
extern std::atomic<uint32_t> fb_null_since;
extern std::atomic<uint32_t> fb_ok_total;

// Số phiên /stream đã bắt đầu. Dùng để phát hiện ranh giới phiên một cách
// chính xác, không phụ thuộc việc loop() có kịp lấy mẫu `active_streams` hay
// không (client ngắt rồi nối lại trong <20 ms từng làm watchdog bắn oan).
extern std::atomic<uint32_t> session_starts;

// ---- Cửa sổ đo gần nhất (reset sau mỗi kỳ log) ---------------------------
//
// Tách riêng thời gian chờ camera và thời gian gửi TCP để biết nút thắt nằm ở
// đâu khi FPS thấp. Đây là số ĐO, không phải suy đoán.
struct Window {
    uint32_t fps_x100 = 0;      // FPS * 100
    uint32_t avg_wait_ms = 0;   // trung bình ms chờ esp_camera_fb_get()
    uint32_t avg_tx_ms = 0;     // trung bình ms gửi một khung qua TCP
    uint32_t avg_bytes = 0;     // trung bình byte JPEG mỗi khung
    uint32_t tx_kbps = 0;       // tốc độ đẩy khung thực đo, KB/s
    uint32_t frames = 0;        // số khung trong cửa sổ
};

extern std::atomic<uint32_t> win_wait_ms;
extern std::atomic<uint32_t> win_tx_ms;
extern std::atomic<uint32_t> win_bytes;

// ---- Pha tiến trình của handler (chẩn đoán handler bị treo) --------------
//
// Khi handler kẹt trong một lời gọi blocking, `frames` không tăng nên mọi số
// trung bình đều bằng 0 và log trở nên vô dụng — đúng ca 03/11/2026. Hai biến
// này cho biết handler đang ở pha nào và đã ở đó bao lâu, kể cả khi không có
// khung nào hoàn tất.
enum class StreamPhase : uint8_t {
    Idle = 0,
    Acquiring,   // đang chờ esp_camera_fb_get()
    Sending,     // đang trong httpd_resp_send_chunk()
};

extern std::atomic<StreamPhase> stream_phase;
extern std::atomic<uint32_t> stream_phase_since_ms;

void set_phase(StreamPhase phase);

/**
 * Chốt một cửa sổ đo: tính FPS và trung bình, rồi reset các bộ đếm cửa sổ.
 * Gọi từ `loop()` mỗi KVC_LOG_PERIOD_MS.
 */
Window close_window(uint32_t now_ms);

/** Ảnh chụp toàn bộ trạng thái để handler `/status` đọc nhất quán. */struct Snapshot {
    uint32_t frames_served;
    uint32_t fb_get_failures;
    uint32_t oversize_drops;
    uint32_t send_failures;
    uint32_t client_errors;
    uint32_t lock_timeouts;
    uint32_t stall_closes;
    uint32_t stream_requests;
    uint32_t rejected_clients;
    uint32_t cam_restarts;
    uint32_t wifi_drops;
    uint32_t wifi_reconnects;
    int active_streams;
    uint32_t last_ok_ms;
    uint32_t last_attempt_ms;
};

Snapshot snapshot();

}  // namespace stats
}  // namespace kvc
