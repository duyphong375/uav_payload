/**
 * @file kvc_uart_ring.h
 * @brief Ring buffer SPSC (single-producer / single-consumer) dùng cho RX UART.
 *
 * Thuộc Task KVC-M2-20261025-001.
 *
 * MÔ HÌNH ĐỒNG THỜI
 * -----------------
 * - Producer: chỉ có ISR của một cổng UART ghi (push).
 * - Consumer: chỉ có main loop đọc (pop).
 * - Kích thước là luỹ thừa của 2 để dùng mặt nạ thay cho phép chia.
 *
 * Trên Cortex-M4, load/store 32-bit đã align là nguyên tử ở mức bus, nên
 * `head` (chỉ ISR ghi) và `tail` (chỉ main ghi) không cần critical section.
 * Mỗi biến chỉ có MỘT writer. Điều này đúng khi:
 *   - Ring struct được align tự nhiên (uint32_t/uint16_t theo kiểu khai báo).
 *   - Không có ISR khác cùng ghi vào ring đó.
 *   - Trình biên dịch không tách một store thành nhiều store (đúng với
 *     uint32_t/uint16_t aligned trên ARM).
 *
 * Header-only + `static inline` để KHÔNG phải thêm file .c vào
 * mcu_uav.uvprojx (ngoài allowed files của task M2).
 *
 * GIỚI HẠN
 * --------
 * - `kvc_ring_count()` đọc cả head và tail; nếu gọi từ ISR trong lúc main
 *   đang pop thì giá trị có thể lệch một nhịp. Chỉ dùng cho thống kê.
 * - Không hỗ trợ nhiều producer. Không dùng cho TX.
 * - Ring không tự reset khi tràn: byte mới bị bỏ và `dropped` tăng.
 */

#ifndef KVC_UART_RING_H
#define KVC_UART_RING_H

#include <stdint.h>
#include <stdbool.h>

#ifdef __cplusplus
extern "C" {
#endif

/**
 * @brief Mô tả một ring buffer SPSC.
 *
 * Kích thước `size` phải là luỹ thừa của 2 và bằng số phần tử thực của `buf`.
 * `mask` = size - 1 để tính chỉ số bằng phép AND.
 */
typedef struct {
    uint8_t *buf;            /**< Vùng đệm do caller cấp (không cấp phát động) */
    uint16_t size;           /**< Số phần tử, luỹ thừa của 2 */
    uint16_t mask;           /**< size - 1 */
    volatile uint16_t head;  /**< Chỉ producer (ISR) ghi */
    volatile uint16_t tail;  /**< Chỉ consumer (main) ghi */
    volatile uint32_t dropped; /**< Số byte bị bỏ vì ring đầy */
} KvcUartRing;

/**
 * @brief Khởi tạo ring. Gọi MỘT lần trong init driver, trước khi bật ngắt.
 * @param r     Ring cần khởi tạo.
 * @param buf   Vùng đệm do caller cấp.
 * @param size  Số phần tử; phải là luỹ thừa của 2.
 * @return true nếu tham số hợp lệ và ring đã sẵn sàng.
 */
static inline bool kvc_ring_init(KvcUartRing *r, uint8_t *buf, uint16_t size) {
    if ((r == 0) || (buf == 0) || (size < 2U)) {
        return false;
    }
    if ((size & (uint16_t)(size - 1U)) != 0U) {
        return false;   /* không phải luỹ thừa của 2 */
    }
    r->buf     = buf;
    r->size    = size;
    r->mask    = (uint16_t)(size - 1U);
    r->head    = 0U;
    r->tail    = 0U;
    r->dropped = 0U;
    return true;
}

/**
 * @brief Số byte hiện có trong ring.
 * @note Chỉ dùng cho thống kê/chẩn đoán, không dùng làm điều kiện chính xác
 *       trong ISR.
 */
static inline uint16_t kvc_ring_count(const KvcUartRing *r) {
    uint16_t head;
    uint16_t tail;
    if (r == 0) {
        return 0U;
    }
    head = r->head;
    tail = r->tail;
    return (uint16_t)((uint16_t)(head - tail) & r->mask);
}

/** @brief Số byte trống còn lại. */
static inline uint16_t kvc_ring_free(const KvcUartRing *r) {
    if (r == 0) {
        return 0U;
    }
    return (uint16_t)(r->mask - kvc_ring_count(r));
}

/**
 * @brief Đẩy 1 byte. CHỈ gọi từ ISR của cổng tương ứng.
 * @return true nếu ghi được, false nếu ring đầy (byte bị bỏ, `dropped` tăng).
 */
static inline bool kvc_ring_push_from_isr(KvcUartRing *r, uint8_t b) {
    uint16_t head;
    uint16_t next;
    if (r == 0) {
        return false;
    }
    head = r->head;
    next = (uint16_t)((uint16_t)(head + 1U) & r->mask);
    if (next == r->tail) {
        r->dropped++;
        return false;
    }
    r->buf[head] = b;
    r->head = next;
    return true;
}

/**
 * @brief Lấy 1 byte. CHỈ gọi từ main loop.
 * @param r Ring nguồn.
 * @param out Con trỏ nhận byte.
 * @return true nếu có byte, false nếu ring rỗng.
 */
static inline bool kvc_ring_pop(KvcUartRing *r, uint8_t *out) {
    uint16_t tail;
    if ((r == 0) || (out == 0)) {
        return false;
    }
    tail = r->tail;
    if (tail == r->head) {
        return false;
    }
    *out = r->buf[tail];
    r->tail = (uint16_t)((uint16_t)(tail + 1U) & r->mask);
    return true;
}

/** @brief Xoá nội dung ring (dùng khi re-init driver). */
static inline void kvc_ring_reset(KvcUartRing *r) {
    if (r == 0) {
        return;
    }
    r->head    = 0U;
    r->tail    = 0U;
    r->dropped = 0U;
}

#ifdef __cplusplus
}
#endif

#endif /* KVC_UART_RING_H */
