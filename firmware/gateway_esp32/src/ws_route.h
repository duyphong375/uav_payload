/**
 * @file ws_route.h
 * @brief Quy tắc path WebSocket của Gateway (thuần C++).
 *
 * IF-03 quy định endpoint duy nhất là `ws://<ip>:8080/telemetry`. Thư viện
 * links2004/WebSockets chấp nhận MỌI path khi upgrade, nên firmware phải tự
 * kiểm tra; nếu không, một client lỡ cấu hình `/ws/telemetry` vẫn nhận được
 * telemetry và hợp đồng với Backend bị hiểu sai.
 *
 * Tách khỏi main.cpp để host test chứng minh được quy tắc mà không cần board.
 */

#ifndef KVC_GATEWAY_WS_ROUTE_H
#define KVC_GATEWAY_WS_ROUTE_H

#include <stddef.h>

namespace kvc {

/** Path duy nhất được phục vụ (không gồm query string). */
extern const char kTelemetryPath[];

/**
 * @brief Kiểm tra path do client yêu cầu có được phục vụ không.
 *
 * Chấp nhận đúng `/telemetry` và `/telemetry?<query>` (một số WebSocket client
 * tự thêm query/cache-buster). Từ chối mọi path khác, kể cả `/`, `/telemetry/`
 * và `/Telemetry` (path WebSocket phân biệt hoa thường).
 *
 * @param path Chuỗi path từ HTTP request line; có thể NULL.
 * @param length Độ dài chuỗi (không tính '\0'); có thể 0.
 * @return true nếu được phục vụ.
 */
bool isAcceptedTelemetryPath(const char *path, size_t length);

} // namespace kvc

#endif /* KVC_GATEWAY_WS_ROUTE_H */
