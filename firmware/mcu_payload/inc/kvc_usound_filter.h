/**
 * @file kvc_usound_filter.h
 * @brief Bộ lọc trung vị trượt + chặn ngoại lai + giữ mẫu cho cảm biến siêu âm.
 *
 * TÁCH RIÊNG KHỎI DRIVER PHẦN CỨNG (KVC-MCU-US-FILTER-001, 29/10/2026):
 * Trước đây toàn bộ logic này nằm trong `kvc_usound_ajsr04m.h` — một header kéo
 * theo `SN34F780.h`, thanh ghi UART2, ring buffer và bit-bang. Vì vậy KHÔNG có
 * host test nào chạm tới phần quyết định giá trị nào được công bố ra telemetry
 * và georef. Bản sửa "so chiều ngoại lai" ngày 28/10 cũng rơi vào vùng không
 * test được đó.
 *
 * File này chỉ phụ thuộc `<stdint.h>`/`<stdbool.h>` nên `tests/test_kvc_usound_filter.c`
 * biên dịch và kiểm thử được bằng gcc trên PC.
 *
 * ============================================================================
 * BA CƠ CHẾ, ĐỘC LẬP VỚI PHẦN CỨNG
 * ============================================================================
 * 1. TRUNG VỊ TRƯỢT 3 MẪU: mỗi chu kỳ chỉ đo 1 lần (1 Hz), lịch sử giữ 3 mẫu
 *    gần nhất. Trung vị của {đúng, đúng, sai} = đúng, nên một mẫu lỗi đơn lẻ
 *    không lọt ra ngoài. Độ trễ 2 chu kỳ (~2 s) — chấp nhận được ở 1 Hz.
 * 2. CHẶN NGOẠI LAI: mẫu lệch quá `KVC_USOUND_OUTLIER_CM` so với mẫu mới nhất
 *    bị coi là nghi ngờ và KHÔNG đưa vào lịch sử. Chỉ nhận khi mẫu kế tiếp lệch
 *    CÙNG CHIỀU (xác nhận thay đổi thật). Bản trước chỉ kiểm "đã có mẫu chờ"
 *    mà không so chiều, nên hai ngoại lai ngược chiều vẫn được nhận.
 * 3. GIỮ MẪU KHI LỖI ĐƯỜNG TRUYỀN: rơi đúng 1 mẫu do timeout/checksum/no-response
 *    thì trả lại giá trị tốt gần nhất (tránh dashboard nhấp nháy). Lỗi NGOÀI DẢI
 *    (out-of-range/no-echo/blind-zone) thì KHÔNG giữ: đó là câu trả lời mới và
 *    đúng của cảm biến, giữ số cũ sẽ làm georef dùng độ cao sai.
 *
 * ============================================================================
 * HỢP ĐỒNG VỚI NGƯỜI GỌI (quan trọng)
 * ============================================================================
 * `kvc_usound_filter_push()` trả về ĐÚNG mã mà driver phải trả cho main loop:
 *   - `KVC_USOUND_OK` khi có giá trị dùng được (kể cả trường hợp "held").
 *   - Mã lỗi gốc khi không có giá trị.
 * Nhờ vậy driver chỉ cần chuyển tiếp kết quả, không phải quyết định lại.
 *
 * Khi filter trả `KVC_USOUND_OK` do GIỮ MẪU CŨ, `*out_held` = true. Cờ này
 * dành cho chẩn đoán; telemetry hiện vẫn bật `ALT_VALID` như hành vi cũ.
 *
 * Người phụ trách: Nguyễn Tá Duy Phong
 */

#ifndef KVC_USOUND_FILTER_H
#define KVC_USOUND_FILTER_H

#include <stdint.h>
#include <stdbool.h>

#include "kvc_usound_decode.h"

#ifdef __cplusplus
extern "C" {
#endif

/** Ngưỡng nghi ngờ ngoại lai (cm). 150 cm đủ rộng để không chặn thay đổi thật
 *  của tải treo dưới UAV, nhưng đủ hẹp để chặn xung nhiễu điển hình. */
#define KVC_USOUND_OUTLIER_CM        150U

/** Số chu kỳ telemetry giữ lịch sử trung vị khi mất echo liên tiếp.
 *
 *  VẤN ĐỀ ĐO ĐƯỢC TRÊN KIT: chuỗi `202 ok / err/5 / 207 ok` cho thấy echo yếu
 *  bị mất cách quãng. Nếu xoá trắng lịch sử ngay ở mẫu lỗi đầu tiên thì mẫu tốt
 *  kế tiếp được trả THẲNG (count == 1), không qua trung vị, nên một xung nhiễu
 *  lọt đúng khe đó sẽ đi thẳng ra telemetry và vào georef.
 *
 *  Nay lịch sử chỉ bị xoá sau 5 chu kỳ liên tiếp không có mẫu dùng được. Giá trị
 *  công bố trong 5 chu kỳ đó VẪN là 0 kèm mã lỗi (không giữ mẫu cũ), nên georef
 *  không bao giờ dùng số cũ — chỉ bộ lọc là không mất trí nhớ. */
#define KVC_USOUND_HIST_HOLD_CYCLES  5U

/** Trạng thái bộ lọc. Không con trỏ, không cấp phát: đặt tĩnh được trong driver
 *  hoặc trên stack trong test. */
typedef struct {
    uint16_t hist[3];        /**< Lịch sử 3 mẫu đã qua kiểm ngoại lai. */
    uint16_t pending_cm;     /**< Mẫu nghi ngờ đang chờ xác nhận. */
    uint16_t last_good_cm;   /**< Giá trị đã lọc tốt gần nhất (0 = chưa có). */
    uint8_t  hist_count;     /**< Số mẫu hợp lệ trong lịch sử, 0..3. */
    uint8_t  hist_idx;       /**< Vị trí ghi kế tiếp, 0..2. */
    uint8_t  pending;        /**< 1 = đang chờ mẫu xác nhận cùng chiều. */
    uint8_t  drop_count;     /**< Đã giữ mẫu cũ cho lần trượt này chưa (0/1). */
    uint8_t  fail_run;       /**< Số chu kỳ liên tiếp không có mẫu dùng được. */
    uint8_t  pad0;           /**< Đệm tường minh, tránh -Wpadded. */
} KvcUsoundFilter;

/**
 * @brief Xoá toàn bộ trạng thái bộ lọc. Gọi khi init driver hoặc khi muốn
 *        bắt đầu phiên đo mới (ví dụ sau khi cắm lại cảm biến).
 * @param f Bộ lọc; NULL được bỏ qua.
 */
void kvc_usound_filter_reset(KvcUsoundFilter *f);

/**
 * @brief Trung vị của 3 giá trị.
 *
 * Công thức `max(min(a,b), min(max(a,b), c))` đúng với mọi tổ hợp và không cần
 * mảng hay sắp xếp. Tách thành hàm riêng để test trực tiếp.
 */
uint16_t kvc_usound_median3(uint16_t a, uint16_t b, uint16_t c);

/**
 * @brief Nạp kết quả MỘT lần đo vào bộ lọc và nhận giá trị nên công bố.
 *
 * @param f        Bộ lọc; NULL -> trả `res` nguyên trạng, không cập nhật gì.
 * @param res      Mã kết quả đo: `KVC_USOUND_OK` hoặc `KVC_USOUND_ERR_*`.
 * @param cm       Cự ly đo được (chỉ dùng khi `res == KVC_USOUND_OK`).
 * @param out_cm   Nhận giá trị nên công bố khi trả về `KVC_USOUND_OK`. Có thể NULL.
 * @param out_held Nhận true nếu giá trị trả về là MẪU CŨ ĐƯỢC GIỮ (chẩn đoán).
 *                 Có thể NULL.
 * @return Mã mà tầng trên phải dùng: `KVC_USOUND_OK` nếu có giá trị, ngược lại
 *         là `res` gốc.
 */
uint8_t kvc_usound_filter_push(KvcUsoundFilter *f, uint8_t res, uint16_t cm,
                               uint16_t *out_cm, bool *out_held);

#ifdef __cplusplus
}
#endif

#endif /* KVC_USOUND_FILTER_H */
