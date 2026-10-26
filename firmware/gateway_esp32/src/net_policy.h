/**
 * @file net_policy.h
 * @brief Quyết định chế độ mạng của Gateway theo thứ tự ưu tiên (thuần C++).
 *
 * THỨ TỰ ƯU TIÊN (yêu cầu vận hành):
 *   Ưu tiên 1 — STA: kết nối Wi-Fi 2.4 GHz đã thiết lập sẵn.
 *   Ưu tiên 2 — SoftAP: chỉ phát khi ưu tiên 1 thất bại; tự đóng khi ưu tiên 1
 *               hoạt động lại.
 *
 * VÌ SAO TÁCH RIÊNG: đây là quy tắc quyết định đúng/sai của toàn bộ đường mạng,
 * nhưng nằm trong main.cpp thì phụ thuộc Arduino và không test được. Module này
 * chỉ có <stdint.h>, nên cùng một logic chạy trên ESP32 và trong host test.
 *
 * Phạm vi: quyết định *hành động tiếp theo*, không gọi WiFi API. Phía gọi
 * (main.cpp) thực thi hành động trả về bằng WiFi.begin/softAP/softAPdisconnect.
 */

#ifndef KVC_GATEWAY_NET_POLICY_H
#define KVC_GATEWAY_NET_POLICY_H

#include <stddef.h>
#include <stdint.h>

namespace kvc {

/** Trạng thái mạng quan sát được tại thời điểm quyết định. */
struct NetPolicyState {
  bool staConfigured;      // Có credential Wi-Fi 2.4 GHz để thử không
  bool staConnected;       // STA đang nối thành công
  bool apStarted;          // SoftAP đang phát
  uint32_t lastStaAttemptMs; // Mốc lần thử STA gần nhất
};

/** Hành động phía gọi cần thực hiện. */
enum class NetAction {
  None,          // Không làm gì
  RetrySta,      // Gọi WiFi.reconnect()
  CloseSoftAp,   // Gọi WiFi.softAPdisconnect(true) rồi WiFi.mode(WIFI_STA)
};

/**
 * @brief Quyết định hành động kế tiếp cho mạng.
 *
 * Quy tắc:
 * 1. Chưa cấu hình STA -> không làm gì (SoftAP là phương án duy nhất, do lúc
 *    khởi động đã bật).
 * 2. STA đang nối:
 *    - Nếu SoftAP đang phát -> CloseSoftAp (không phát sóng thừa).
 *    - Nếu không -> None.
 * 3. STA chưa nối:
 *    - Nếu đã qua retryIntervalMs kể từ lần thử trước -> RetrySta.
 *    - Nếu chưa -> None.
 *
 * @param state Trạng thái hiện tại.
 * @param nowMs Đồng hồ millis() hiện tại.
 * @param retryIntervalMs Chu kỳ thử lại STA (ms). 0 nghĩa là thử mỗi lần gọi.
 * @return Hành động cần thực hiện.
 */
NetAction netPolicyEvaluate(const NetPolicyState &state, uint32_t nowMs,
                            uint32_t retryIntervalMs);

/**
 * @brief Tìm mạng kế tiếp có SSID, duyệt vòng tròn từ afterIndex.
 *
 * Mạng có SSID rỗng (chuỗi "") được coi là "không khai báo" và bị bỏ qua. Nhờ
 * vậy cùng một mảng 4 phần tử phục vụ được cấu hình 1, 2, 3 hoặc 4 mạng mà
 * không cần ifdef.
 *
 * @param ssids Mảng con trỏ SSID; phần tử NULL cũng bị coi là không khai báo.
 * @param count Số phần tử của mảng.
 * @param afterIndex Vị trí bắt đầu duyệt (duyệt từ afterIndex, quay vòng).
 * @return Chỉ số mạng hợp lệ, hoặc count nếu không có mạng nào khai báo.
 */
size_t netNextConfiguredIndex(const char *const *ssids, size_t count,
                              size_t afterIndex);

} // namespace kvc

#endif /* KVC_GATEWAY_NET_POLICY_H */
