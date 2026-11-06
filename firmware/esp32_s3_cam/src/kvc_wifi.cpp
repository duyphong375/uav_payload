/**
 * @file kvc_wifi.cpp
 * @brief Wi-Fi STA (chuẩn H3) + mDNS.
 *
 * TOPOLOGY
 *
 * `KVC_WIFI_USE_SOFTAP = 0` (vận hành): S3 là STA, nối hotspot 2.4 GHz của
 * laptop/router bằng credential trong `include/wifi_secrets.h`. Nhờ vậy laptop
 * một card Wi-Fi vừa nhận telemetry gateway vừa xem video.
 *
 * `KVC_WIFI_USE_SOFTAP = 1` (chỉ bring-up): tự phát AP 192.168.5.1/24. Khi bật,
 * laptop phải đổi mạng và mất telemetry gateway 192.168.4.x.
 *
 * VÌ SAO mDNS KHÔNG GỌI TRONG setup()
 *
 * `MDNS.begin()` cần netif đã có địa chỉ. Gọi ngay sau `WiFi.begin()` (chưa có
 * IP) thường thất bại và không tự thử lại. Vì vậy mDNS được khởi tạo trong
 * maintain_mdns(), chỉ khi `WL_CONNECTED` và `localIP() != 0.0.0.0`, và được
 * begin lại mỗi khi có IP mới.
 */

#include "kvc_wifi.h"

#include <ESPmDNS.h>
#include <WiFi.h>

#include "kvc_config.h"
#include "kvc_log.h"
#include "kvc_stats.h"

namespace kvc {
namespace wifi {
namespace {

uint32_t s_retry_ms = KVC_WIFI_RETRY_MIN_MS;
uint32_t s_next_check_ms = 0;
bool s_mdns_up = false;
bool s_mdns_dirty = true;   // cần begin (lại) ngay khi có IP

void on_wifi_event(WiFiEvent_t event) {
    switch (event) {
        case ARDUINO_EVENT_WIFI_STA_CONNECTED:
            LOGI("Wi-Fi: da ket noi AP, dang cho DHCP");
            break;

        case ARDUINO_EVENT_WIFI_STA_GOT_IP:
            LOGI("Wi-Fi: IP = %s, RSSI = %d dBm",
                 WiFi.localIP().toString().c_str(), WiFi.RSSI());
            s_retry_ms = KVC_WIFI_RETRY_MIN_MS;
            s_mdns_dirty = true;
            break;

        case ARDUINO_EVENT_WIFI_STA_DISCONNECTED:
            stats::wifi_drops.fetch_add(1);
            LOGW("Wi-Fi: mat ket noi (tong %u lan)",
                 static_cast<unsigned>(stats::wifi_drops.load()));
            break;

        default:
            break;
    }
}

bool have_ip() {
    return WiFi.status() == WL_CONNECTED &&
           WiFi.localIP() != IPAddress(0, 0, 0, 0);
}

}  // namespace

void begin() {
    WiFi.persistent(false);   // không ghi credential vào NVS mỗi lần boot
    WiFi.setSleep(false);     // tắt modem-sleep: giảm jitter cho MJPEG

#if KVC_WIFI_USE_SOFTAP
    WiFi.mode(WIFI_AP);
    WiFi.softAPConfig(KVC_AP_IP, KVC_AP_GATEWAY, KVC_AP_SUBNET);
    WiFi.softAP(KVC_AP_SSID, KVC_AP_PASSWORD, KVC_AP_CHANNEL);
    LOGI("Wi-Fi: SoftAP da bat. SSID: \"%s\", IP %s", KVC_AP_SSID,
         WiFi.softAPIP().toString().c_str());
#else
    if (KVC_WIFI_SSID[0] == '\0') {
        LOGE("Chua cau hinh Wi-Fi: thieu include/wifi_secrets.h");
        LOGE("Copy wifi_secrets.h.example -> wifi_secrets.h roi dien SSID/mat khau.");
        LOGE("Thiet bi van chay nhung KHONG co mang, KHONG co stream.");
        return;
    }

    WiFi.setAutoReconnect(true);
    WiFi.setHostname(KVC_HOSTNAME);

    // IP tĩnh phải đặt TRƯỚC begin() để DHCP client không ghi đè.
#if KVC_STA_USE_STATIC_IP
    if (WiFi.config(KVC_STA_IP, KVC_STA_GATEWAY, KVC_STA_SUBNET, KVC_STA_DNS)) {
        LOGI("Wi-Fi: dung IP tinh %s", KVC_STA_IP.toString().c_str());
    } else {
        LOGW("Wi-Fi: WiFi.config() tu choi IP tinh, quay ve DHCP");
    }
#endif

    WiFi.onEvent(on_wifi_event);
    WiFi.mode(WIFI_STA);   // gọi trước begin() để không bao giờ mở SoftAP
    WiFi.begin(KVC_WIFI_SSID, KVC_WIFI_PASSWORD);

    LOGI("Wi-Fi: dang ket noi SSID \"%s\" (STA)", KVC_WIFI_SSID);
#endif
}

void maintain() {
#if KVC_WIFI_USE_SOFTAP
    return;
#else
    if (KVC_WIFI_SSID[0] == '\0') return;

    uint32_t now = millis();
    if (now < s_next_check_ms) return;
    s_next_check_ms = now + KVC_WIFI_CHECK_PERIOD_MS;

    if (WiFi.status() == WL_CONNECTED) {
        s_retry_ms = KVC_WIFI_RETRY_MIN_MS;
        return;
    }

    // Backoff 2s, 4s, 8s, 16s, 30s (trần). Không thử lại mỗi 100 ms: mỗi lần
    // thử đều tốn năng lượng và làm nóng module.
    LOGW("Wi-Fi: chua ket noi (status=%d), thu lai", static_cast<int>(WiFi.status()));
    WiFi.disconnect(false, false);
    WiFi.begin(KVC_WIFI_SSID, KVC_WIFI_PASSWORD);
    stats::wifi_reconnects.fetch_add(1);

    uint32_t next = s_retry_ms * 2;
    s_retry_ms = (next > KVC_WIFI_RETRY_MAX_MS) ? KVC_WIFI_RETRY_MAX_MS : next;
    s_next_check_ms = millis() + s_retry_ms;
#endif
}

void maintain_mdns() {
#if KVC_WIFI_USE_SOFTAP
    const IPAddress ip = WiFi.softAPIP();
    const bool net_up = ip != IPAddress(0, 0, 0, 0);
#else
    const IPAddress ip = WiFi.localIP();
    const bool net_up = have_ip();
#endif

    if (!net_up) {
        // Mất mạng: lần sau phải begin lại từ đầu.
        s_mdns_dirty = true;
        return;
    }
    if (s_mdns_up && !s_mdns_dirty) return;

    s_mdns_dirty = false;

    if (s_mdns_up) {
        MDNS.end();
        s_mdns_up = false;
    }

    if (!MDNS.begin(KVC_MDNS_NAME)) {
        s_mdns_up = false;
        s_mdns_dirty = true;   // thử lại vòng sau
        LOGW("mDNS khong khoi tao duoc; dung IP thay the (%s)", ip.toString().c_str());
        return;
    }

    MDNS.addService("http", "tcp", KVC_HTTP_PORT);
    s_mdns_up = true;
    LOGI("mDNS: http://%s.local:%d/stream (ip %s)", KVC_MDNS_NAME, KVC_HTTP_PORT,
         ip.toString().c_str());
}

bool connected() {
#if KVC_WIFI_USE_SOFTAP
    return true;
#else
    return WiFi.status() == WL_CONNECTED;
#endif
}

}  // namespace wifi
}  // namespace kvc
