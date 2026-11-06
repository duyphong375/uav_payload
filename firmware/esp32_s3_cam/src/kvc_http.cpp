/**
 * @file kvc_http.cpp
 * @brief HTTP server phát MJPEG trên cổng 81.
 *
 * VÌ SAO DÙNG esp_http_server CHỨ KHÔNG PHẢI WebServer CỦA ARDUINO
 *
 * MJPEG là response KHÔNG BAO GIỜ KẾT THÚC. `WebServer` gom toàn bộ nội dung
 * vào `String` trước khi gửi nên không dùng được. `httpd` của ESP-IDF gửi theo
 * chunk, tự đóng socket khi client biến mất và có `lru_purge_enable` để thu hồi
 * socket của client chết.
 *
 * VÌ SAO GIỚI HẠN SỐ STREAM
 *
 * Mỗi handler /stream giữ một framebuffer trong lúc gửi TCP. Với fb_count = 3,
 * chỉ 2 handler có thể chạy song song mà không làm driver dừng DVP. Handler thứ
 * ba sẽ chờ ở `acquire()` và bị timeout, khiến mọi client cùng chậm. Vì vậy
 * firmware TỪ CHỐI kết nối thứ ba bằng 503 thay vì nhận rồi cùng nghẽn — backend
 * đã fan-out 1 kết nối duy nhất (`video_relay.py`), nên đây là giới hạn an toàn.
 *
 * THỨ TỰ BYTE TRÊN DÂY (RFC 2046 §5.1.1)
 *
 *     \r\n--<boundary>\r\n
 *     Content-Type: image/jpeg\r\n
 *     Content-Length: <n>\r\n
 *     \r\n
 *     <n byte JPEG>
 *
 * Dấu `\r\n` đầu là phần kết thúc của part TRƯỚC; ở khung đầu nó là tiền tố vô
 * hại và là dạng mà VLC/ffmpeg/trình duyệt chấp nhận. Tham số `boundary=` của
 * Content-Type KHÔNG có `--`; chỉ dấu phân cách mới có.
 */

#include "kvc_http.h"

#include <WiFi.h>
#include <esp_http_server.h>
#include <esp_heap_caps.h>
#include <lwip/sockets.h>

#include <cerrno>
#include <cstdlib>
#include <cstring>

#include "kvc_camera.h"
#include "kvc_config.h"
#include "kvc_log.h"
#include "kvc_stats.h"

namespace kvc {
namespace http {
namespace {

httpd_handle_t g_server = nullptr;

const char *BOUNDARY_LINE = "\r\n--" KVC_STREAM_BOUNDARY "\r\n";
const char *STREAM_TYPE = "multipart/x-mixed-replace; boundary=" KVC_STREAM_BOUNDARY;

/**
 * Giới hạn đồng thời. fb_count = 3 cho phép 2 handler giữ buffer; handler thứ ba
 * sẽ làm cả ba cùng chậm nên bị từ chối.
 */
constexpr int kMaxStreams = static_cast<int>(KVC_CAM_FB_COUNT_PSRAM) - 1;

/** Từ chối client vượt giới hạn bằng 503 kèm lý do đọc được. */
esp_err_t reject_overloaded(httpd_req_t *req) {
    stats::rejected_clients.fetch_add(1);
    httpd_resp_set_status(req, "503 Service Unavailable");
    httpd_resp_set_type(req, "text/plain; charset=utf-8");
    httpd_resp_set_hdr(req, "Retry-After", "5");
    httpd_resp_set_hdr(req, "Cache-Control", "no-store");
    return httpd_resp_send(req,
                           "Camera dang phuc vu du so client.\n"
                           "Backend nen dung video_relay de fan-out.\n",
                           HTTPD_RESP_USE_STRLEN);
}

/**
 * Bộ đệm gộp header + JPEG, MỖI HANDLER MỘT BỘ ĐỆM RIÊNG.
 *
 * KHÔNG dùng static dùng chung: mỗi handler /stream chạy trên task riêng của
 * httpd. Hai client cùng xem mà chia sẻ một buffer thì handler này ghi đè lên
 * khung handler kia đang chuẩn bị gửi → JPEG hỏng, client nhận khung sai
 * Content-Length. Đây là lỗi chỉ xuất hiện khi có ≥2 client, nên rất dễ lọt.
 *
 * Cấp phát một lần cho mỗi handler rồi dùng lại, không malloc mỗi khung.
 */
class TxBuffer {
public:
    ~TxBuffer() { free(buf_); }

    uint8_t *get(size_t need) {
        if (need <= cap_) return buf_;
        if (buf_ != nullptr) {
            free(buf_);
            buf_ = nullptr;
            cap_ = 0;
        }
        // PSRAM trước: không tranh DRAM nội với Wi-Fi/DMA.
        buf_ = static_cast<uint8_t *>(heap_caps_malloc(need, MALLOC_CAP_SPIRAM));
        if (buf_ == nullptr) buf_ = static_cast<uint8_t *>(malloc(need));
        cap_ = (buf_ != nullptr) ? need : 0;
        if (buf_ == nullptr) {
            LOGE("Khong cap duoc %u byte dem gui khung",
                 static_cast<unsigned>(need));
        }
        return buf_;
    }

private:
    uint8_t *buf_ = nullptr;
    size_t cap_ = 0;
};

/**
 * Bật TCP_NODELAY nếu KVC_HTTP_TCP_NODELAY = 1.
 *
 * Chỉ là công tắc thí nghiệm. Xem chú thích ở kvc_config.h: với b1.0.0 (6 lần
 * send/khung) NODELAY làm FPS tệ hơn; từ b1.1.0 chỉ còn ~3 lần send/khung nên
 * kết quả có thể khác và phải đo lại trước khi kết luận.
 */
void apply_nodelay(httpd_req_t *req) {
#if KVC_HTTP_TCP_NODELAY
    int fd = httpd_req_to_sockfd(req);
    if (fd < 0) return;

    int flag = 1;
    if (setsockopt(fd, IPPROTO_TCP, TCP_NODELAY, &flag, sizeof(flag)) != 0) {
        LOGW("setsockopt(TCP_NODELAY) that bai, errno=%d", errno);
    } else {
        LOGI("TCP_NODELAY: da bat cho client nay");
    }
#else
    (void)req;
#endif
}

esp_err_t stream_handler(httpd_req_t *req) {
    stats::stream_requests.fetch_add(1);

    // Tăng rồi kiểm tra (không phải kiểm tra rồi tăng) để hai handler đến cùng
    // lúc không cùng vượt qua cổng giới hạn.
    int active = stats::active_streams.fetch_add(1) + 1;
    if (active > kMaxStreams) {
        stats::active_streams.fetch_sub(1);
        LOGW("Tu choi client (dang co %d, gioi han %d)", active - 1, kMaxStreams);
        return reject_overloaded(req);
    }

    // Đánh dấu ranh giới phiên bằng bộ đếm, KHÔNG dựa vào việc loop() kịp lấy
    // mẫu `active_streams`. Client ngắt rồi nối lại trong vài ms từng làm
    // watchdog tưởng vẫn là phiên cũ và bắn oan.
    stats::session_starts.fetch_add(1);

    esp_err_t res = httpd_resp_set_type(req, STREAM_TYPE);
    if (res != ESP_OK) {
        stats::client_errors.fetch_add(1);
        stats::active_streams.fetch_sub(1);
        return res;
    }

    httpd_resp_set_hdr(req, "Cache-Control", "no-store, no-cache, must-revalidate");
    httpd_resp_set_hdr(req, "Pragma", "no-cache");
    httpd_resp_set_hdr(req, "X-KVC-Source", "IF-05-S3CAM");
    apply_nodelay(req);

    LOGI("Client bat dau xem stream (dang co %d/%d)", active, kMaxStreams);

    char part_hdr[160];
    TxBuffer txbuf;

    for (;;) {
        // Watchdog yêu cầu đóng để deinit camera an toàn.
        if (camera::stream_close_requested()) {
            LOGW("Camera stall: dong stream de khoi tao lai an toan");
            stats::stall_closes.fetch_add(1);
            break;
        }

        uint32_t t_wait0 = millis();
        uint32_t lock_before = stats::lock_timeouts.load();
        stats::set_phase(stats::StreamPhase::Acquiring);
        camera_fb_t *fb = camera::acquire(KVC_CAM_LOCK_TIMEOUT_MS);
        uint32_t wait_ms = millis() - t_wait0;
        stats::set_phase(stats::StreamPhase::Idle);

        if (fb == nullptr) {
            // Phân biệt "không lấy được khoá" với "driver trả NULL": hai lỗi
            // khác nhau hoàn toàn và cần cách xử lý khác nhau.
            if (stats::lock_timeouts.load() != lock_before) {
                LOGD("Het thoi gian cho khoa camera");
            } else {
                stats::fb_get_failures.fetch_add(1);
                LOGD("esp_camera_fb_get() tra NULL");
            }
            vTaskDelay(pdMS_TO_TICKS(KVC_STREAM_RETRY_MS));
            continue;
        }

        stats::win_wait_ms.fetch_add(wait_ms);
        stats::win_bytes.fetch_add(static_cast<uint32_t>(fb->len));

        // Khung quá lớn: BỎ NGUYÊN KHUNG. Cắt ngắn tạo JPEG hỏng mà backend vẫn
        // đếm là khung hợp lệ -> sai số liệu.
        if (fb->len > KVC_MAX_JPEG_BYTES) {
            stats::oversize_drops.fetch_add(1);
            LOGW("Bo khung %u byte > tran %u byte",
                 static_cast<unsigned>(fb->len),
                 static_cast<unsigned>(KVC_MAX_JPEG_BYTES));
            camera::release(fb);
            continue;
        }

        int hlen = snprintf(part_hdr, sizeof(part_hdr),
                            "%sContent-Type: image/jpeg\r\nContent-Length: %u\r\n\r\n",
                            BOUNDARY_LINE, static_cast<unsigned>(fb->len));
        if (hlen <= 0) {
            stats::client_errors.fetch_add(1);
            camera::release(fb);
            break;
        }

        // MỘT chunk chứa cả header lẫn ảnh. Gửi hai chunk riêng làm httpd phát
        // sinh ~6 lần send() mỗi khung (đo: chỉ ~34 KB/s trên Wi-Fi 2.4 GHz).
        const size_t need = static_cast<size_t>(hlen) + fb->len;
        uint8_t *out = txbuf.get(need);

        uint32_t t_tx0 = millis();
        if (out == nullptr) {
            stats::client_errors.fetch_add(1);
            camera::release(fb);
            break;
        }

        memcpy(out, part_hdr, static_cast<size_t>(hlen));
        memcpy(out + hlen, fb->buf, fb->len);

        stats::set_phase(stats::StreamPhase::Sending);
        res = httpd_resp_send_chunk(req, reinterpret_cast<const char *>(out),
                                    static_cast<ssize_t>(need));
        stats::set_phase(stats::StreamPhase::Idle);
        stats::win_tx_ms.fetch_add(millis() - t_tx0);

        camera::release(fb);

        if (res != ESP_OK) {
            // Client đóng hoặc quá hạn gửi. Bình thường (đóng tab, backend
            // restart), KHÔNG phải lỗi camera — watchdog không được restart
            // camera vì việc này.
            //
            // Ghi rõ mã lỗi: `ESP_ERR_HTTPD_RESULT_TRUNC` = client không nhận
            // hết; `ESP_ERR_HTTPD_SOCK_ERR`/`ESP_ERR_HTTPD_FAIL` = socket chết.
            // Không có mã này thì không phân biệt được "client tự đóng" với
            // "firmware gửi sai định dạng".
            stats::send_failures.fetch_add(1);
            LOGW("Gui khung %u byte that bai: %s (0x%04X), errno=%d",
                 static_cast<unsigned>(need), esp_err_to_name(res),
                 static_cast<unsigned>(res), errno);
            break;
        }

        stats::frames_served.fetch_add(1);
        stats::last_ok_ms.store(millis());
        stats::attempts_since_ok.store(0);
    }

    int remaining = stats::active_streams.fetch_sub(1) - 1;
    LOGI("Client ngung xem stream (con %d)", remaining);

    // Hết client: xoá trạng thái stall của phiên này. Không có client thì
    // fb_get() không được gọi, nên mọi bộ đếm stall đều vô nghĩa và watchdog
    // không được phép restart camera dựa vào chúng.
    if (remaining <= 0) {
        stats::attempts_since_ok.store(0);
    }

    // Kết thúc multipart đúng cách để client không coi là stream bị cắt.
    httpd_resp_send_chunk(req, "\r\n--" KVC_STREAM_BOUNDARY "--\r\n", 0);
    return ESP_OK;
}

esp_err_t status_handler(httpd_req_t *req) {
    stats::Snapshot s = stats::snapshot();
    uint32_t now = millis();

    long last_frame_age_ms = -1;
    if (s.last_ok_ms != 0) {
        last_frame_age_ms = static_cast<long>(now - s.last_ok_ms);
    }
    long last_attempt_age_ms = -1;
    if (s.last_attempt_ms != 0) {
        last_attempt_age_ms = static_cast<long>(now - s.last_attempt_ms);
    }

    IPAddress ip = (WiFi.getMode() & WIFI_AP) ? WiFi.softAPIP() : WiFi.localIP();
    int rssi = (WiFi.getMode() & WIFI_AP)
                   ? 0
                   : ((WiFi.status() == WL_CONNECTED) ? WiFi.RSSI() : 0);

    char body[1024];
    int n = snprintf(
        body, sizeof(body),
        "{\"fw\":\"%s\",\"ver\":\"%s\","
        "\"sensor\":\"%s\",\"sensor_pid\":%u,"
        "\"width\":%d,\"height\":%d,\"jpeg_quality\":%d,"
        "\"fb_count\":%d,\"xclk_hz\":%d,"
        "\"psram\":%s,\"free_heap\":%u,\"free_psram\":%u,"
        "\"ip\":\"%s\",\"rssi\":%d,\"mdns\":\"%s.local\","
        "\"uptime_ms\":%u,\"frames\":%u,"
        "\"stream_requests\":%u,\"active_streams\":%d,\"max_streams\":%d,"
        "\"last_frame_age_ms\":%ld,\"last_attempt_age_ms\":%ld,"
        "\"fb_get_failures\":%u,\"oversize_drops\":%u,"
        "\"send_failures\":%u,\"lock_timeouts\":%u,\"client_errors\":%u,"
        "\"rejected_clients\":%u,\"stall_closes\":%u,"
        "\"cam_restarts\":%u,\"wifi_drops\":%u,\"wifi_reconnects\":%u,"
        "\"max_jpeg_bytes\":%u}",
        KVC_FW_NAME, KVC_FW_VERSION, camera::sensor_name(),
        static_cast<unsigned>(camera::sensor_pid()), KVC_CAM_FRAME_WIDTH,
        KVC_CAM_FRAME_HEIGHT, KVC_CAM_JPEG_QUALITY, static_cast<int>(camera::fb_count()),
        KVC_CAM_XCLK_HZ, camera::psram_found() ? "true" : "false",
        static_cast<unsigned>(ESP.getFreeHeap()),
        static_cast<unsigned>(ESP.getFreePsram()), ip.toString().c_str(), rssi,
        KVC_MDNS_NAME, static_cast<unsigned>(now), static_cast<unsigned>(s.frames_served),
        static_cast<unsigned>(s.stream_requests), s.active_streams, kMaxStreams,
        last_frame_age_ms, last_attempt_age_ms,
        static_cast<unsigned>(s.fb_get_failures),
        static_cast<unsigned>(s.oversize_drops),
        static_cast<unsigned>(s.send_failures),
        static_cast<unsigned>(s.lock_timeouts),
        static_cast<unsigned>(s.client_errors),
        static_cast<unsigned>(s.rejected_clients),
        static_cast<unsigned>(s.stall_closes),
        static_cast<unsigned>(s.cam_restarts),
        static_cast<unsigned>(s.wifi_drops),
        static_cast<unsigned>(s.wifi_reconnects),
        static_cast<unsigned>(KVC_MAX_JPEG_BYTES));

    if (n <= 0 || n >= static_cast<int>(sizeof(body))) {
        LOGE("JSON /status bi cat (%d byte)", n);
    }

    httpd_resp_set_type(req, "application/json");
    httpd_resp_set_hdr(req, "Cache-Control", "no-store");
    return httpd_resp_send(req, body, n);
}

/**
 * Trang gốc chỉ để mở bằng trình duyệt khi bring-up tại chỗ.
 * KHÔNG có CORS, KHÔNG có JS điều khiển: theo IF-03, trình duyệt của GCS không
 * được nói chuyện trực tiếp với camera.
 */
esp_err_t root_handler(httpd_req_t *req) {
    static const char html[] =
        "<!doctype html><meta charset=utf-8>"
        "<title>KVC S3-CAM (IF-05)</title>"
        "<body style=\"font-family:sans-serif;background:#111;color:#eee;padding:12px\">"
        "<h3>KVC ESP32-S3-CAM - kenh video phu</h3>"
        "<p>Camera quan sat. Khong sinh toa do. Khong dung cho georef.</p>"
        "<img src=\"/stream\" style=\"max-width:100%;border:1px solid #444\">"
        "<p><a style=\"color:#6cf\" href=\"/status\">/status</a></p></body>";
    httpd_resp_set_type(req, "text/html; charset=utf-8");
    return httpd_resp_send(req, html, HTTPD_RESP_USE_STRLEN);
}

}  // namespace

uint8_t max_streams() { return static_cast<uint8_t>(kMaxStreams); }

bool start() {
    httpd_config_t config = HTTPD_DEFAULT_CONFIG();

    config.server_port = KVC_HTTP_PORT;
    config.ctrl_port = KVC_HTTP_PORT + 1;
    config.max_open_sockets = KVC_HTTP_MAX_SOCKETS;
    config.stack_size = KVC_HTTP_STACK_SIZE;
    config.backlog_conn = KVC_HTTP_MAX_SOCKETS;

    // Thu hồi socket của client chết trước khi từ chối client mới. Bắt buộc với
    // MJPEG: mở/đóng tab liên tục sẽ ăn hết socket.
    config.lru_purge_enable = true;

    config.recv_wait_timeout = KVC_HTTP_RECV_TIMEOUT_S;
    config.send_wait_timeout = KVC_HTTP_SEND_TIMEOUT_S;

    esp_err_t err = httpd_start(&g_server, &config);
    if (err != ESP_OK) {
        LOGE("httpd_start that bai: 0x%04X (%s)", static_cast<unsigned>(err),
             esp_err_to_name(err));
        return false;
    }

    httpd_uri_t stream_uri = {};
    stream_uri.uri = "/stream";
    stream_uri.method = HTTP_GET;
    stream_uri.handler = stream_handler;
    httpd_register_uri_handler(g_server, &stream_uri);

    httpd_uri_t status_uri = {};
    status_uri.uri = "/status";
    status_uri.method = HTTP_GET;
    status_uri.handler = status_handler;
    httpd_register_uri_handler(g_server, &status_uri);

    httpd_uri_t root_uri = {};
    root_uri.uri = "/";
    root_uri.method = HTTP_GET;
    root_uri.handler = root_handler;
    httpd_register_uri_handler(g_server, &root_uri);

    LOGI("HTTP server: cong %d, toi da %d socket, %d stream song song",
         KVC_HTTP_PORT, KVC_HTTP_MAX_SOCKETS, kMaxStreams);
    LOGI("Stream: http://<ip>:%d/stream   Trang thai: http://<ip>:%d/status",
         KVC_HTTP_PORT, KVC_HTTP_PORT);
    return true;
}

}  // namespace http
}  // namespace kvc
