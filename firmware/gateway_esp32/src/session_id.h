/**
 * @file session_id.h
 * @brief Sinh `gateway_session_id` cho Transport Envelope v1 (IF-03).
 *
 * VÌ SAO TÁCH RIÊNG: IF-03 mục 3 yêu cầu `gateway_session_id` thay đổi mỗi khi
 * ESP32 khởi động lại, nhưng trước đây `main.cpp` dùng hằng số 1 nên hai phiên
 * boot bị trộn khi backend replay. Phép trộn bit dưới đây thuần số học, không
 * phụ thuộc Arduino, nên host test chứng minh được tính chất của nó mà không
 * cần board.
 *
 * Phía gọi (`main.cpp`) truyền entropy thật của chip: `esp_random()` và 48-bit
 * MAC eFuse. Module này không tự lấy entropy để giữ khả năng kiểm thử.
 */

#ifndef KVC_GATEWAY_SESSION_ID_H
#define KVC_GATEWAY_SESSION_ID_H

#include <stdint.h>

namespace kvc {

/* Giá trị nhỏ nhất được trả về. `0` dễ bị hiểu là "chưa khởi tạo" và `1` là
 * hằng số của firmware cũ, nên cả hai bị đẩy lên khỏi miền này. */
constexpr uint32_t kGatewaySessionIdMin = 2U;

/**
 * @brief Trộn entropy của chip thành một session id 32-bit.
 *
 * Tính chất (được khoá bằng host test):
 * - Cùng đầu vào -> cùng kết quả (hàm thuần).
 * - Kết quả luôn >= kGatewaySessionIdMin, không bao giờ 0 hoặc 1.
 * - Đổi nonce hoặc đổi MAC đều làm kết quả đổi (avalanche của splitmix32).
 *
 * @param randomNonce Số ngẫu nhiên phần cứng lấy một lần lúc boot.
 * @param macLow 32 bit thấp của MAC eFuse.
 * @param macHigh 16 bit cao của MAC eFuse (đặt ở 32 bit thấp của tham số).
 * @return Session id dùng cho mọi envelope của phiên boot hiện tại.
 */
uint32_t deriveGatewaySessionId(uint32_t randomNonce, uint32_t macLow,
                                uint32_t macHigh);

} // namespace kvc

#endif /* KVC_GATEWAY_SESSION_ID_H */
