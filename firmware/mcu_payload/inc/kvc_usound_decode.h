/**
 * @file kvc_usound_decode.h
 * @brief Giải mã khung 4 byte của cảm biến siêu âm AJ-SR04M (Mode 3 / Mode 4).
 *
 * TÁCH RIÊNG KHỎI DRIVER PHẦN CỨNG (KVC-MCU-1.2):
 * Trước đây máy trạng thái 4 bước nằm lẫn trong `kvc_usound_ajsr04m.h`, kéo theo
 * `SN34F780.h`, `kvc_pinout.h`, `kvc_uart_ring.h` và các thanh ghi UART2. Vì vậy
 * không thể chạy trên PC. File này chỉ phụ thuộc `<stdint.h>`/`<stdbool.h>` nên
 * `tests/test_kvc_usound_decode.c` biên dịch và kiểm thử được bằng gcc.
 *
 * ĐẶC TẢ KHUNG (hai tài liệu hãng mâu thuẫn nhau về checksum — xem
 * docs/hardware/sensors/SENSOR_PACKAGES.md §1.1; firmware bám theo khung mẫu
 * `FF 07 A1 A7` của chính tài liệu Anji, tức công thức có cộng 0xFF):
 *   byte 0: 0xFF — header
 *   byte 1: Data_H — byte cao của khoảng cách, đơn vị mm
 *   byte 2: Data_L — byte thấp
 *   byte 3: Checksum = (0xFF + Data_H + Data_L) & 0xFF
 *
 * Distance_mm = (Data_H << 8) | Data_L ; Distance_cm = Distance_mm / 10.
 *
 * Người phụ trách: Nguyễn Tá Duy Phong
 */

#ifndef KVC_USOUND_DECODE_H
#define KVC_USOUND_DECODE_H

#include <stdint.h>
#include <stdbool.h>

#ifdef __cplusplus
extern "C" {
#endif

/* ============================================================================
 * 1. HẰNG SỐ GIAO THỨC VÀ CHÍNH SÁCH DẢI ĐO
 * ============================================================================ */
#define KVC_USOUND_FRAME_HEADER        0xFFU   /* Byte đồng bộ đầu khung */
#define KVC_USOUND_NO_ECHO_MM          6000U   /* Giá trị module dùng khi không có phản xạ */
#define KVC_USOUND_MAX_FRAME_MM        6000U   /* Module không bao giờ trả lớn hơn mức này */

#define KVC_USOUND_MIN_RANGE_CM        20U     /* Vùng mù dưới 20 cm */
#define KVC_USOUND_MAX_RANGE_CM        500U    /* Trần đo tin cậy phục vụ tải UAV cứu nạn */

/* Mã trạng thái đo đạc (giá trị được dùng trong telemetry và log [M3] err/N). */
#define KVC_USOUND_OK                  0U      /* Đo thành công, nằm trong dải tin cậy 20–500 cm */
#define KVC_USOUND_ERR_TIMEOUT         1U      /* Có byte đến nhưng không đủ khung 4 byte hợp lệ */
#define KVC_USOUND_ERR_CHECKSUM        2U      /* Checksum sai */
#define KVC_USOUND_ERR_OUT_OF_RANGE    3U      /* Có phản xạ nhưng vượt trần 500 cm */
#define KVC_USOUND_ERR_BLIND_ZONE      4U      /* Vật cản nằm trong vùng mù dưới 20 cm */
#define KVC_USOUND_ERR_NO_ECHO         5U      /* Module báo 6000 mm: không có phản xạ về đầu dò */
#define KVC_USOUND_ERR_NO_RESPONSE     6U      /* Không nhận được byte nào: module không đáp 0x01 */

/* ============================================================================
 * 2. MÁY TRẠNG THÁI 4 BƯỚC
 * ============================================================================ */
typedef enum {
    KVC_USOUND_DEC_STATE_HEADER = 0,   /* Chờ 0xFF */
    KVC_USOUND_DEC_STATE_DATA_H,       /* Đã có header, chờ byte cao */
    KVC_USOUND_DEC_STATE_DATA_L,       /* Đã có byte cao, chờ byte thấp */
    KVC_USOUND_DEC_STATE_CHECKSUM      /* Đã có đủ 3 byte, chờ checksum */
} KvcUsoundDecState;

/** Trạng thái giải mã. Không có con trỏ, không cấp phát: đặt được trên stack. */
typedef struct {
    uint8_t state;    /* KvcUsoundDecState */
    uint8_t data_h;   /* Byte cao của khoảng cách, đơn vị mm */
    uint8_t data_l;   /* Byte thấp của khoảng cách, đơn vị mm */
} KvcUsoundDecoder;

/** Kết quả giải mã một byte. */
typedef enum {
    KVC_USOUND_FRAME_NONE = 0,   /* Chưa đủ khung, chưa kết luận gì */
    KVC_USOUND_FRAME_OK,         /* Khung hợp lệ, nằm trong dải 20..500 cm */
    KVC_USOUND_FRAME_NO_ECHO,    /* Khung hợp lệ nhưng 6000 mm = không có phản xạ */
    KVC_USOUND_FRAME_OUT_OF_RANGE, /* Khung hợp lệ nhưng > 500 cm */
    KVC_USOUND_FRAME_BLIND_ZONE, /* Khung hợp lệ nhưng < 20 cm */
    KVC_USOUND_FRAME_BAD_CHECKSUM /* Đủ 4 byte nhưng checksum sai hoặc > 6000 mm */
} KvcUsoundFrameResult;

/* ============================================================================
 * 3. API
 * ============================================================================ */

/** @brief Đưa máy trạng thái về đầu khung. Gọi khi mở/đóng cửa sổ nghe. */
void kvc_usound_decode_reset(KvcUsoundDecoder *dec);

/**
 * @brief Nạp một byte vào máy trạng thái.
 *
 * @param dec     Trạng thái giải mã (không được NULL).
 * @param b       Byte nhận được từ UART.
 * @param out_mm  Nhận giá trị mm thô khi kết quả KHÁC `KVC_USOUND_FRAME_NONE`
 *                và là khung qua checksum (kể cả ngoài dải). Có thể NULL.
 * @return `KVC_USOUND_FRAME_NONE` nếu chưa đủ khung; ngược lại là phân loại khung.
 *
 * Hàm thuần logic, không đụng phần cứng, không giữ trạng thái toàn cục.
 */
KvcUsoundFrameResult kvc_usound_decode_byte(KvcUsoundDecoder *dec, uint8_t b, uint16_t *out_mm);

/**
 * @brief Ánh xạ kết quả giải mã sang mã trạng thái đo `KVC_USOUND_ERR_*`.
 * @return `KVC_USOUND_OK` hoặc một trong các mã lỗi; `KVC_USOUND_ERR_TIMEOUT`
 *         cho `KVC_USOUND_FRAME_NONE` (chưa kết luận thì chưa có mẫu dùng được).
 */
uint8_t kvc_usound_result_to_err(KvcUsoundFrameResult res);

#ifdef __cplusplus
}
#endif

#endif /* KVC_USOUND_DECODE_H */
