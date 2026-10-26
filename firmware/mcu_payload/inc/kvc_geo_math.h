/**
 * @file kvc_geo_math.h
 * @brief Lượng giác số nguyên cho georef — KHÔNG dùng libm, chạy được cả trên MCU
 *        và host test.
 *
 * VÌ SAO KHÔNG DÙNG `<math.h>`: georef cần xoay vector theo Yaw. `sinf`/`cosf`
 * của newlib kéo theo hàng chục KB và dùng soft-float double, trong khi
 * Cortex-M4F ở đây chạy 12 MHz IHRC (không bật PLL) nên phép tính dấu phẩy động
 * đắt. Bảng sin 0..90° với bước 1° (91 hằng số) đủ chính xác cho georef xấp xỉ
 * này: sai số nội suy tối đa 0,09 % tương ứng ~0,9 mm ở cự ly 1 m.
 *
 * PHẠM VI SỬ DỤNG: chỉ để xoay vector mặt phẳng cho georef. Không dùng cho
 * dẫn đường, không dùng cho phép chiếu bản đồ chính xác cao.
 *
 * Người phụ trách: Nguyễn Tá Duy Phong
 */

#ifndef KVC_GEO_MATH_H
#define KVC_GEO_MATH_H

#include <stdint.h>
#include <stdbool.h>

#ifdef __cplusplus
extern "C" {
#endif

/** Đơn vị góc: 0,1 độ (545 = 54,5°). Dùng chung với `course_deg10` của GNSS. */
#define KVC_GEO_DEG10_PER_DEG      10

/** Giá trị "không có" cho góc, khớp quy ước 0xFFFF của driver GNSS. */
#define KVC_GEO_DEG10_INVALID      0xFFFFU

/**
 * @brief sin của góc tính bằng 0,1°, kết quả nhân 10000.
 * @param deg10 Góc 0,1° (0..3599). Giá trị ngoài dải được chuẩn hoá modulo 3600.
 * @return sin × 10000, dải −10000..+10000.
 */
int32_t kvc_geo_sin_deg10(uint16_t deg10);

/**
 * @brief cos của góc tính bằng 0,1°, kết quả nhân 10000.
 */
int32_t kvc_geo_cos_deg10(uint16_t deg10);

/**
 * @brief Xoay một vector mặt phẳng (Đông, Bắc) theo Yaw.
 *
 * QUY ƯỚC TRỤC — quan trọng, đọc trước khi sửa:
 *   - `x_east_mm`  : độ lệch theo hướng Đông (dương = Đông).
 *   - `y_north_mm` : độ lệch theo hướng Bắc (dương = Bắc).
 *   - `yaw_deg10`  : hướng camera so với Bắc, đo theo chiều kim đồng hồ
 *                    (0 = Bắc, 900 = Đông, 1800 = Nam, 2700 = Tây). Đây đúng
 *                    là quy ước của `track_made_good` trong câu RMC.
 *
 * Ảnh camera có trục riêng: `dx_px` dương sang PHẢI ảnh, `dy_fwd_px` dương
 * LÊN TRÊN trong ảnh (tức xa camera). Khi camera hướng Bắc thì "lên ảnh" là
 * Bắc và "phải ảnh" là Đông, nên:
 *
 *     đông  =  dx_px·cos(yaw) + dy_fwd_px·sin(yaw)
 *     bắc   = −dx_px·sin(yaw) + dy_fwd_px·cos(yaw)
 *
 * Hàm nhận vector ảnh (phải, tới) và trả vector địa lý (đông, bắc) để georef
 * cộng trực tiếp vào toạ độ UAV.
 *
 * @param right_mm    Độ lệch sang phải ảnh (mm).
 * @param forward_mm  Độ lệch tới trước trong ảnh (mm).
 * @param yaw_deg10   Yaw camera (0,1°).
 * @param out_east_mm Nhận độ lệch Đông (mm). Có thể NULL.
 * @param out_north_mm Nhận độ lệch Bắc (mm). Có thể NULL.
 */
void kvc_geo_rotate_to_ne(int32_t right_mm, int32_t forward_mm, uint16_t yaw_deg10,
                          int32_t *out_east_mm, int32_t *out_north_mm);

#ifdef __cplusplus
}
#endif

#endif /* KVC_GEO_MATH_H */
