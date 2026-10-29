/**
 * @file kvc_usound_filter.c
 * @brief Cài đặt bộ lọc trung vị trượt + chặn ngoại lai. Xem header.
 *
 * HÀNH VI PHẢI GIỮ NGUYÊN: file này là bản chuyển nguyên văn logic từ
 * `kvc_usound_read_robust()` trong `kvc_usound_ajsr04m.h` (trước 29/10/2026),
 * chỉ thay biến `static` cục bộ bằng trường của struct. Mọi quyết định
 * (điều kiện giữ mẫu, ngưỡng ngoại lai, cách so chiều, thứ tự cập nhật lịch sử)
 * đều giữ đúng để hành vi trên kit không đổi.
 *
 * Người phụ trách: Nguyễn Tá Duy Phong
 */

#include "kvc_usound_filter.h"

void kvc_usound_filter_reset(KvcUsoundFilter *f) {
    if (f == 0) {
        return;
    }
    f->hist[0]      = 0U;
    f->hist[1]      = 0U;
    f->hist[2]      = 0U;
    f->pending_cm   = 0U;
    f->last_good_cm = 0U;
    f->hist_count   = 0U;
    f->hist_idx     = 0U;
    f->pending      = 0U;
    f->drop_count   = 0U;
    f->fail_run     = 0U;
    f->pad0         = 0U;
}

uint16_t kvc_usound_median3(uint16_t a, uint16_t b, uint16_t c) {
    uint16_t lo_ab = (a < b) ? a : b;
    uint16_t hi_ab = (a > b) ? a : b;
    uint16_t cand  = (hi_ab < c) ? hi_ab : c;
    return (lo_ab > cand) ? lo_ab : cand;
}

uint8_t kvc_usound_filter_push(KvcUsoundFilter *f, uint8_t res, uint16_t cm,
                               uint16_t *out_cm, bool *out_held) {
    uint16_t out = 0U;

    if (out_held != 0) {
        *out_held = false;
    }

    if (f == 0) {
        if (out_cm != 0) {
            *out_cm = (res == KVC_USOUND_OK) ? cm : 0U;
        }
        return res;
    }

    /* ========================================================================
     * NHÁNH 1: lần đo KHÔNG có giá trị dùng được
     * ======================================================================== */
    if (res != KVC_USOUND_OK) {
        /* Lỗi nhiễu/đường truyền: tạm giữ mẫu cũ ĐÚNG MỘT chu kỳ để dashboard
         * không nhấp nháy vì một lần trượt.
         *
         * Lỗi NGOÀI DẢI (OUT_OF_RANGE/NO_ECHO/BLIND_ZONE) thì KHÔNG giữ: đó là
         * câu trả lời đúng và mới của cảm biến. Giữ số cũ sẽ khiến telemetry
         * báo độ cao cũ dù UAV đã ra khỏi tầm, và georef dùng alt_dist_cm để
         * tính toạ độ mục tiêu nên sẽ ra toạ độ sai. */
        if (((res == KVC_USOUND_ERR_TIMEOUT) ||
             (res == KVC_USOUND_ERR_CHECKSUM) ||
             (res == KVC_USOUND_ERR_NO_RESPONSE)) &&
            (f->fail_run == 0U) &&
            (f->last_good_cm > 0U) && (f->drop_count < 1U)) {
            f->drop_count++;
            if (out_cm != 0) {
                *out_cm = f->last_good_cm;
            }
            if (out_held != 0) {
                *out_held = true;
            }
            return KVC_USOUND_OK;
        }

        /* Không có mẫu dùng được. GIÁ TRỊ CÔNG BỐ LÀ 0 kèm mã lỗi (georef không
         * được dùng số cũ), nhưng lịch sử trung vị chỉ bị xoá sau
         * KVC_USOUND_HIST_HOLD_CYCLES chu kỳ liên tiếp. Nhờ vậy khi echo trở lại
         * ngay sau một khe no-echo, mẫu đầu tiên vẫn được lọc như bình thường. */
        if (f->fail_run < 0xFFU) {
            f->fail_run++;
        }
        f->pending    = 0U;
        f->drop_count = 0U;
        if (f->fail_run >= KVC_USOUND_HIST_HOLD_CYCLES) {
            /* Mất tín hiệu kéo dài: xoá lịch sử để lần có lại không trộn mẫu cũ. */
            f->hist_count   = 0U;
            f->hist_idx     = 0U;
            f->last_good_cm = 0U;
        }
        if (out_cm != 0) {
            *out_cm = 0U;
        }
        return res;
    }

    /* ========================================================================
     * NHÁNH 2: lần đo THÀNH CÔNG
     * ======================================================================== */
    f->drop_count = 0U;
    f->fail_run   = 0U;

    /* ---- Chặn ngoại lai: chỉ áp dụng khi đã có ít nhất 1 mẫu lịch sử ---- */
    if (f->hist_count > 0U) {
        uint16_t ref = f->hist[(uint8_t)((f->hist_idx + 2U) % 3U)];  /* mẫu mới nhất */
        uint16_t diff = (cm > ref) ? (uint16_t)(cm - ref) : (uint16_t)(ref - cm);

        if (diff > KVC_USOUND_OUTLIER_CM) {
            /* So CHIỀU thật (sửa 28/10/2026): mẫu xác nhận phải lệch về CÙNG
             * phía so với ref mới được coi là thay đổi thật. Trước đây chỉ kiểm
             * `pending != 0` mà không so chiều, nên hai ngoại lai liên tiếp
             * NGƯỢC chiều vẫn được chấp nhận và đẩy giá trị đi rất xa. */
            bool same_dir = (f->pending != 0U) &&
                            ((cm > ref) == (f->pending_cm > ref));

            if (same_dir) {
                /* Mẫu thứ hai lệch cùng chiều -> xác nhận thay đổi thật. */
                f->pending = 0U;
            } else {
                /* Mẫu đầu tiên lệch xa (hoặc mẫu thứ hai lệch ngược chiều):
                 * nghi ngờ, chưa đưa vào lịch sử. Vẫn trả mẫu đã lọc hiện tại
                 * để dashboard không nhảy. */
                f->pending    = 1U;
                f->pending_cm = cm;
                if (out_cm != 0) {
                    *out_cm = f->last_good_cm;
                }
                if (out_held != 0) {
                    *out_held = true;
                }
                return KVC_USOUND_OK;
            }
        } else {
            /* Mẫu nằm trong dải bình thường -> huỷ trạng thái nghi ngờ. */
            f->pending = 0U;
        }
    }

    /* ---- Đẩy mẫu vào lịch sử vòng tròn ---- */
    f->hist[f->hist_idx] = cm;
    f->hist_idx = (uint8_t)((f->hist_idx + 1U) % 3U);
    if (f->hist_count < 3U) {
        f->hist_count++;
    }

    /* ---- Xuất trung vị ---- */
    if (f->hist_count == 1U) {
        out = f->hist[0];
    } else if (f->hist_count == 2U) {
        /* Hai mẫu: lấy trung bình (chưa đủ để lấy trung vị). */
        out = (uint16_t)(((uint32_t)f->hist[0] + (uint32_t)f->hist[1]) / 2U);
    } else {
        out = kvc_usound_median3(f->hist[0], f->hist[1], f->hist[2]);
    }

    f->last_good_cm = out;
    if (out_cm != 0) {
        *out_cm = out;
    }
    return KVC_USOUND_OK;
}
