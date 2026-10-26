/**
 * @file kvc_timebase.h
 * @brief Time base monotonic (ms) dùng chung cho toàn firmware MCU tải UAV.
 *
 * VÌ SAO CẦN: bản cũ cộng dồn tick bên trong `delay_ms()` của main.c, nên mọi
 * thời gian chờ KHÔNG đi qua hàm đó (đặc biệt vòng chờ khung siêu âm
 * `kvc_usound_delay_us()`, tới 100 ms mỗi chu kỳ) bị mất khỏi time base.
 * `timestamp_ms` vì thế chạy chậm cỡ 9-10 % so với thời gian thật, làm lệch
 * ngưỡng expiry (GNSS 3 s, FPGA BBox 2 s), cửa sổ TDM 1.5 s và phép so với
 * `rx_monotonic_ms` của gateway.
 *
 * CÁCH DÙNG: mọi điểm chờ/trễ trong firmware phải báo thời gian đã tiêu vào
 * time base này. Không tự cộng biến cục bộ ở nơi khác.
 *
 * GIỚI HẠN (ghi rõ để không bị hiểu là đồng hồ chuẩn):
 * - Nguồn đếm vẫn là ước lượng phần mềm: `delay_ms()` đo bằng SysTick giả định
 *   IHRC 12 MHz ±2 %, `kvc_usound_delay_us()` là vòng lặp hiệu chuẩn theo
 *   UCLK 12 MHz. Sai số tổng của time base vì vậy vẫn cỡ ±2 % theo datasheet.
 * - Chưa tính thời gian bit-bang I2C của IMU (`mpu6050_*`): mỗi lần đọc góc cỡ
 *   ~1 ms ở 100 kHz, tức dưới 0,1 % chu kỳ 1 giây. Không đáng kể nhưng phải
 *   ghi nhận để không ai tưởng time base là tuyệt đối.
 * - Muốn chính xác ppm phải hiệu chuẩn bằng 1PPS của GNSS hoặc thạch anh ngoài
 *   (task riêng). Đây không phải phép đo.
 *
 * Ngữ cảnh gọi: chỉ main context. Không gọi từ ISR (không có khoá ngắt).
 */

#ifndef KVC_TIMEBASE_H
#define KVC_TIMEBASE_H

#include <stdint.h>

#ifdef __cplusplus
extern "C" {
#endif

/**
 * @brief Cộng thêm thời gian đã trôi (mili-giây) vào time base.
 * @param ms Số mili-giây đã trôi; 0 là hợp lệ và không đổi gì.
 */
void kvc_timebase_add_ms(uint32_t ms);

/**
 * @brief Cộng thêm thời gian đã trôi (vi-giây) vào time base.
 *        Phần lẻ dưới 1 ms được giữ lại, không bị cắt bỏ.
 * @param us Số vi-giây đã trôi; 0 là hợp lệ và không đổi gì.
 */
void kvc_timebase_add_us(uint32_t us);

/**
 * @brief Đọc time base hiện tại.
 * @return Số mili-giây kể từ lần reset gần nhất, wrap modulo 2^32.
 */
uint32_t kvc_timebase_ms(void);

/**
 * @brief Đưa time base về 0. Chỉ dùng cho khởi tạo và host test.
 */
void kvc_timebase_reset(void);

#ifdef __cplusplus
}
#endif

#endif /* KVC_TIMEBASE_H */
