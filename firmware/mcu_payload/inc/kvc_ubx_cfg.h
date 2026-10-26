/**
 * @file kvc_ubx_cfg.h
 * @brief Dựng khung lệnh UBX `CFG-PRT` để đổi tốc độ UART của module GNSS.
 *
 * VÌ SAO CẦN: module `NEO-M10-0-10` (bo YXT-100-M10, chip UBX-M10050-KB) xuất
 * xưởng ở **38400 bps** theo datasheet của chính module. Ở UCLK 12 MHz, MCU
 * Sonix chỉ chia được 38400 thành 37500 bps (sai số −2,34 %); cộng dung sai
 * IHRC ±2 % thành ~4,34 %, vượt giới hạn 3,125 % của chính MCU. Vì vậy firmware
 * chạy 9600 (sai số +0,16 %) và phải đổi module về 9600 một lần.
 *
 * Module cũng hỗ trợ 4800–921600, nên phương án khác là nâng UCLK bằng PLL;
 * việc đó thay đổi cây xung nhịp toàn hệ nên không làm ở đây.
 *
 * Module này là **thuần C**, không phụ thuộc phần cứng, nên kiểm thử được trên
 * host. Ba khung dưới đây lấy nguyên văn từ datasheet module (§10.3,
 * `docs/hardware/sensors/neo_m10/`) và được test đối chiếu từng byte.
 */

#ifndef KVC_UBX_CFG_H
#define KVC_UBX_CFG_H

#include <stdbool.h>
#include <stdint.h>

#ifdef __cplusplus
extern "C" {
#endif

/** Độ dài khung UBX CFG-PRT (8N1, chỉ UART) do module quy định. */
#define KVC_UBX_CFG_PRT_LEN   28U

/** Độ dài khung UBX CFG-GNSS bật 4 chòm sao (payload 52 byte). */
#define KVC_UBX_CFG_GNSS_LEN  60U

/** Cổng UART của module (UBX: 1 = UART1). */
#define KVC_UBX_PORT_UART1    1U

/**
 * @brief Lấy khung UBX `CFG-GNSS` bật đồng thời GPS + Galileo + BeiDou + GLONASS.
 *
 * VÌ SAO CẦN: HDOP (hệ số phóng đại sai số ngang) phụ thuộc **hình học vệ tinh**,
 * không phải số vệ tinh. Khi đứng ở nơi bị chắn một phần bầu trời (trong nhà, sát
 * tường, ban công), các vệ tinh nhìn thấy đều dồn về một hướng nên HDOP tăng vọt
 * (đo thực tế trên kit: 9 vệ tinh nhưng HDOP 5.60 → sai số ngang ~28 m). Bật đủ
 * 4 chòm giúp có thêm vệ tinh ở các hướng khác, cải thiện hình học.
 *
 * CÁCH DỰNG: datasheet module (§10.5) chỉ cho 4 khung mẫu — GLONASS-only,
 * BeiDou-only, GPS+BeiDou, GLONASS+BeiDou. Không có khung 4 chòm. Khung dưới đây
 * được **ghép** từ đúng các tham số của những khung mẫu đó:
 *   - GPS : resTrkCh=8  maxTrkCh=16  sigCfgMask=0x01  (từ khung GPS+BeiDou)
 *   - BDS : resTrkCh=8  maxTrkCh=16  sigCfgMask=0x01  (từ khung BeiDou-only)
 *   - GLO : resTrkCh=8  maxTrkCh=14  sigCfgMask=0x01  (từ khung GPS+BeiDou)
 *   - GAL : resTrkCh=4  maxTrkCh=8   sigCfgMask=0x01  (theo chuẩn u-blox M10;
 *           datasheet module không có khung mẫu Galileo)
 *   - SBAS, QZSS: giữ `off` như mọi khung mẫu
 * `numTrkChUse = 32` vì tổng `resTrkCh` = 29 ≤ 32.
 *
 * ĐÃ KIỂM: checksum Fletcher tính lại độc lập, `sum(resTrkCh) <= numTrkChUse`.
 * Xem `tests/test_kvc_ubx_cfg.c`.
 *
 * GIỚI HẠN: đây là khung **ghép theo chuẩn u-blox**, không phải khung nguyên văn
 * từ datasheet. Nếu module từ chối (không trả ACK hoặc không đổi số vệ tinh),
 * quay lại dùng khung mẫu `GPS+BeiDou` trong datasheet.
 *
 * @param out Vùng đệm đích, tối thiểu `KVC_UBX_CFG_GNSS_LEN` byte. Bị ghi đè.
 * @return true nếu ghi thành công; false nếu con trỏ NULL.
 */
bool kvc_ubx_get_cfg_gnss_4const(uint8_t out[KVC_UBX_CFG_GNSS_LEN]);

/**
 * @brief Kiểm tra khung có đúng là UBX CFG-GNSS hợp lệ (sync + class/id + len +
 *        checksum Fletcher) hay không.
 *
 * @param frame Con trỏ khung, tối thiểu `KVC_UBX_CFG_GNSS_LEN` byte.
 * @param len Độ dài khung; phải bằng `KVC_UBX_CFG_GNSS_LEN`.
 * @return true nếu hợp lệ.
 */
bool kvc_ubx_validate_cfg_gnss(const uint8_t *frame, uint32_t len);

/**
 * @brief Dựng khung UBX `CFG-PRT` đặt tốc độ UART.
 *
 * Nội dung: set `baudRate`, `mode = 0x08D0` (8 bit, no parity, 1 stop),
 * `inProtoMask = outProtoMask = 0x07` (UBX + NMEA + RTCM), giống các lệnh mẫu
 * trong datasheet module.
 *
 * @param baud_rate Tốc độ đích (bps). Phải nằm trong 4800..921600.
 * @param out Vùng đệm đích, tối thiểu `KVC_UBX_CFG_PRT_LEN` byte. Bị ghi đè.
 * @return true nếu dựng thành công; false nếu tham số không hợp lệ.
 */
bool kvc_ubx_build_cfg_prt_baud(uint32_t baud_rate, uint8_t out[KVC_UBX_CFG_PRT_LEN]);

/**
 * @brief Kiểm tra khung có đúng là UBX CFG-PRT hợp lệ (sync + class/id + len +
 *        checksum Fletcher) hay không.
 *
 * Dùng để tự kiểm tra khung vừa dựng trước khi gửi, và trong host test.
 *
 * @param frame Con trỏ khung, tối thiểu `KVC_UBX_CFG_PRT_LEN` byte.
 * @param len Độ dài khung; phải bằng `KVC_UBX_CFG_PRT_LEN`.
 * @return true nếu hợp lệ.
 */
bool kvc_ubx_validate_cfg_prt(const uint8_t *frame, uint32_t len);

/**
 * @brief Đọc trường `baudRate` (offset 8 trong payload) từ khung CFG-PRT.
 * @param frame Khung hợp lệ.
 * @return Tốc độ baud ghi trong khung, hoặc 0 nếu con trỏ NULL.
 */
uint32_t kvc_ubx_get_baud(const uint8_t *frame);

#ifdef __cplusplus
}
#endif

#endif /* KVC_UBX_CFG_H */
