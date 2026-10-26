/**
 * @file kvc_usound_decode.c
 * @brief Cài đặt máy trạng thái giải mã khung 4 byte AJ-SR04M.
 *
 * Logic ở đây được chuyển nguyên từ `kvc_usound_feed_byte()` trong
 * `kvc_usound_ajsr04m.h` (KVC-MCU-1.2) để có thể chạy host test bằng gcc.
 * Mọi thay đổi hành vi giải mã phải sửa ở ĐÂY, không sửa bản sao trong driver.
 *
 * Người phụ trách: Nguyễn Tá Duy Phong
 */

#include "kvc_usound_decode.h"

void kvc_usound_decode_reset(KvcUsoundDecoder *dec) {
    if (dec == 0) {
        return;
    }
    dec->state  = (uint8_t)KVC_USOUND_DEC_STATE_HEADER;
    dec->data_h = 0U;
    dec->data_l = 0U;
}

KvcUsoundFrameResult kvc_usound_decode_byte(KvcUsoundDecoder *dec, uint8_t b, uint16_t *out_mm) {
    if (dec == 0) {
        return KVC_USOUND_FRAME_NONE;
    }

    /* Trạng thái lạ (RAM bị hỏng, chưa khởi tạo): về đầu khung. Kiểm tra TRƯỚC
     * switch để switch dưới đây chỉ còn 4 giá trị enum, không cần `default`
     * (dự án build với -Wcovered-switch-default và yêu cầu 0 warning). */
    if (dec->state > (uint8_t)KVC_USOUND_DEC_STATE_CHECKSUM) {
        kvc_usound_decode_reset(dec);
        return KVC_USOUND_FRAME_NONE;
    }

    switch ((KvcUsoundDecState)dec->state) {
        case KVC_USOUND_DEC_STATE_HEADER:
            if (b == KVC_USOUND_FRAME_HEADER) {
                dec->state = (uint8_t)KVC_USOUND_DEC_STATE_DATA_H;
            }
            break;

        case KVC_USOUND_DEC_STATE_DATA_H:
            /* Byte cao hợp lệ tối đa là 0x17 (6000 mm), nên 0xFF ở vị trí này
             * không thể là dữ liệu. Đây là header của khung kế tiếp bị chèn vào
             * giữa -> giữ nguyên trạng thái, không tiêu thụ byte. */
            if (b == KVC_USOUND_FRAME_HEADER) {
                break;
            }
            dec->data_h = b;
            dec->state  = (uint8_t)KVC_USOUND_DEC_STATE_DATA_L;
            break;

        case KVC_USOUND_DEC_STATE_DATA_L:
            /* KHÔNG lọc 0xFF: 0x16FF = 5887 mm là giá trị hợp lệ về định dạng.
             * Việc chặn giá trị vô lý làm ở bước checksum dựa trên calc_mm. */
            dec->data_l = b;
            dec->state  = (uint8_t)KVC_USOUND_DEC_STATE_CHECKSUM;
            break;

        case KVC_USOUND_DEC_STATE_CHECKSUM: {
            const uint8_t  checksum    = b;
            const uint8_t  expected_cs = (uint8_t)((uint16_t)KVC_USOUND_FRAME_HEADER +
                                                   (uint16_t)dec->data_h +
                                                   (uint16_t)dec->data_l) & 0xFFU;
            const uint32_t calc_mm     = ((uint32_t)dec->data_h << 8) | (uint32_t)dec->data_l;

            /* ĐỒNG BỘ SAU BYTE CHECKSUM.
             *
             * Bản cũ luôn làm `state = (b == 0xFF) ? DATA_H : HEADER`. Nhưng 0xFF
             * là checksum HỢP LỆ khi H + L ≡ 0 (mod 256) — ví dụ khung 511 mm là
             * `FF 01 FF FF`. Với khung đó bản cũ nhảy sang DATA_H và tiêu thụ
             * header khung kế tiếp, gây lệch khung kéo dài, mất mẫu đo.
             *
             *   - Checksum ĐÚNG  -> 0xFF là checksum thật -> về HEADER.
             *   - Checksum SAI   -> 0xFF nhiều khả năng là header khung mới bị
             *                       chèn vào giữa -> nhận luôn làm header. */
            if (checksum == expected_cs) {
                dec->state = (uint8_t)KVC_USOUND_DEC_STATE_HEADER;
            } else if (b == KVC_USOUND_FRAME_HEADER) {
                dec->state = (uint8_t)KVC_USOUND_DEC_STATE_DATA_H;
            } else {
                dec->state = (uint8_t)KVC_USOUND_DEC_STATE_HEADER;
            }

            /* Checksum 8-bit chỉ chặn 255/256 tổ hợp nhiễu. Module chỉ có thể trả
             * 0..6000 mm, nên chặn trên 6000 là bộ lọc miễn phí, không thể loại
             * nhầm dữ liệu đúng. */
            if ((checksum != expected_cs) || (calc_mm > KVC_USOUND_MAX_FRAME_MM)) {
                return KVC_USOUND_FRAME_BAD_CHECKSUM;
            }

            if (out_mm != 0) {
                *out_mm = (uint16_t)calc_mm;
            }

            if (calc_mm == KVC_USOUND_NO_ECHO_MM) {
                return KVC_USOUND_FRAME_NO_ECHO;
            }
            /* So sánh TRỰC TIẾP bằng mm, không qua `calc_mm / 10`.
             *
             * Bản cũ dùng `(calc_mm / 10) > KVC_USOUND_MAX_RANGE_CM`: phép chia
             * nguyên cắt phần lẻ nên 5001..5009 mm cho ra 500 cm và LỌT qua bộ
             * lọc trần. Sai số chỉ dưới 1 cm nhưng làm biên dải không còn đúng
             * như tài liệu, và cùng lỗi đó khiến 199 mm được coi là 19 cm (đúng)
             * trong khi 200 mm cũng thành 20 cm (đúng) — chỉ là may mắn vì cả
             * hai đều chia hết. So sánh mm là chính xác tuyệt đối. */
            if (calc_mm > (uint32_t)KVC_USOUND_MAX_RANGE_CM * 10UL) {
                return KVC_USOUND_FRAME_OUT_OF_RANGE;
            }
            if (calc_mm < (uint32_t)KVC_USOUND_MIN_RANGE_CM * 10UL) {
                return KVC_USOUND_FRAME_BLIND_ZONE;
            }
            return KVC_USOUND_FRAME_OK;
        }
    }

    return KVC_USOUND_FRAME_NONE;
}

uint8_t kvc_usound_result_to_err(KvcUsoundFrameResult res) {
    switch (res) {
        case KVC_USOUND_FRAME_OK:
            return KVC_USOUND_OK;
        case KVC_USOUND_FRAME_NO_ECHO:
            return KVC_USOUND_ERR_NO_ECHO;
        case KVC_USOUND_FRAME_OUT_OF_RANGE:
            return KVC_USOUND_ERR_OUT_OF_RANGE;
        case KVC_USOUND_FRAME_BLIND_ZONE:
            return KVC_USOUND_ERR_BLIND_ZONE;
        case KVC_USOUND_FRAME_BAD_CHECKSUM:
            return KVC_USOUND_ERR_CHECKSUM;
        case KVC_USOUND_FRAME_NONE:
            return KVC_USOUND_ERR_TIMEOUT;
    }
    /* Không thể tới đây với enum hợp lệ; giữ nhánh an toàn cho giá trị rác. */
    return KVC_USOUND_ERR_TIMEOUT;
}
