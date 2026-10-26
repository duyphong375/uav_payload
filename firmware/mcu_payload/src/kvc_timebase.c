/**
 * @file kvc_timebase.c
 * @brief Cài đặt time base monotonic (ms) dùng chung. Xem kvc_timebase.h.
 *
 * Không phụ thuộc phần cứng: nhận thời gian đã trôi từ nơi gọi, nên module này
 * biên dịch và kiểm thử được trên host lẫn target.
 */

#include "kvc_timebase.h"

/* Time base tính bằng mili-giây kể từ reset. */
static volatile uint32_t s_timebase_ms = 0U;

/* Phần lẻ vi-giây (< 1000 us) chưa được cộng vào time base. */
static uint32_t s_sub_ms_us = 0U;

#define KVC_TIMEBASE_US_PER_MS 1000U

void kvc_timebase_add_ms(uint32_t ms) {
    if (ms != 0U) {
        s_timebase_ms += ms;
    }
}

void kvc_timebase_add_us(uint32_t us) {
    if (us == 0U) {
        return;
    }

    /* Cộng dồn phần lẻ trước để không mất thời gian khi chia nguyên. */
    uint32_t total_us = s_sub_ms_us + us;
    uint32_t whole_ms = total_us / KVC_TIMEBASE_US_PER_MS;
    s_sub_ms_us = total_us % KVC_TIMEBASE_US_PER_MS;

    if (whole_ms != 0U) {
        s_timebase_ms += whole_ms;
    }
}

uint32_t kvc_timebase_ms(void) {
    return s_timebase_ms;
}

void kvc_timebase_reset(void) {
    s_timebase_ms = 0U;
    s_sub_ms_us = 0U;
}
