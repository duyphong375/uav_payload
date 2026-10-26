/**
 * @file kvc_ubx_cfg.c
 * @brief Cài đặt dựng/kiểm khung UBX CFG-PRT. Xem kvc_ubx_cfg.h.
 *
 * Không phụ thuộc phần cứng: biên dịch và test được trên host lẫn target.
 * Khung 28 byte khớp nguyên văn lệnh mẫu trong datasheet module YXT-100-M10
 * (docs/hardware/sensors/neo_m10/), đã đối chiếu bằng test.
 */

#include "kvc_ubx_cfg.h"

/* Hằng số khung UBX. */
#define UBX_SYNC1        0xB5U
#define UBX_SYNC2        0x62U
#define UBX_CLASS_CFG    0x06U
#define UBX_ID_CFG_PRT   0x00U
#define UBX_PAYLOAD_LEN  20U /* CFG-PRT payload luôn 20 byte */
#define UBX_HEADER_LEN   6U  /* sync(2) + class + id + len(2) */
#define UBX_CK_LEN       2U
#define UBX_FRAME_LEN    (UBX_HEADER_LEN + UBX_PAYLOAD_LEN + UBX_CK_LEN)

/* Giá trị cấu hình cổng của các lệnh mẫu trong datasheet module.
 * mode = 0x000008D0 (U4): 8 data bit, no parity, 1 stop bit.
 * in/outProtoMask = 0x0007: UBX + NMEA + RTCM. */
#define UBX_MODE_8N1          0x000008D0UL
#define UBX_PROTO_MASK_ALL    0x0007U

#define UBX_BAUD_MIN          4800UL
#define UBX_BAUD_MAX          921600UL

/* Offset trong KHUNG 28 byte. Payload bắt đầu ở byte 6.
 *
 * CẤU TRÚC CFG-PRT (payload 20 byte) — chú ý mode là U4, không phải U2:
 *   @0  portID      U1
 *   @1  reserved0   U1
 *   @2  txReady     U2   -> khung @8..9
 *   @4  mode        U4   -> khung @10..13
 *   @8  baudRate    U4   -> khung @14..17
 *   @12 inProtoMask U2   -> khung @18..19
 *   @14 outProtoMask U2  -> khung @20..21
 *   @16 flags       U2   -> khung @22..23
 *   @18 reserved5   U2   -> khung @24..25
 *   @20 checksum         -> khung @26..27
 *
 * Đọc nhầm mode thành U2 sẽ làm baud lệch 4 byte và checksum vẫn có thể đúng
 * nếu cả hai phía cùng sai — đây là lỗi mà test đối chiếu từng byte bắt được. */
#define OFF_TXREADY     8U
#define OFF_MODE        10U
#define OFF_BAUD        14U
#define OFF_PROTO_IN    18U
#define OFF_PROTO_OUT   20U
#define OFF_FLAGS       22U
#define OFF_RESERVED5   24U
#define OFF_CK_A        26U
#define OFF_CK_B        27U

static void put_u16le(uint8_t *p, uint16_t v) {
    p[0] = (uint8_t)(v & 0xFFU);
    p[1] = (uint8_t)((v >> 8) & 0xFFU);
}

static void put_u32le(uint8_t *p, uint32_t v) {
    p[0] = (uint8_t)(v & 0xFFU);
    p[1] = (uint8_t)((v >> 8) & 0xFFU);
    p[2] = (uint8_t)((v >> 16) & 0xFFU);
    p[3] = (uint8_t)((v >> 24) & 0xFFU);
}

static uint16_t get_u16le(const uint8_t *p) {
    return (uint16_t)((uint16_t)p[0] | ((uint16_t)p[1] << 8));
}

static uint32_t get_u32le(const uint8_t *p) {
    return (uint32_t)p[0] | ((uint32_t)p[1] << 8) | ((uint32_t)p[2] << 16) |
           ((uint32_t)p[3] << 24);
}

/**
 * @brief Fletcher-16 checksum của UBX: tính trên class..payload (bỏ 2 byte sync).
 */
static void ubx_checksum(const uint8_t *data, uint32_t len, uint8_t *ck_a,
                         uint8_t *ck_b) {
    uint8_t a = 0U;
    uint8_t b = 0U;
    for (uint32_t i = 0U; i < len; i++) {
        a = (uint8_t)(a + data[i]);
        b = (uint8_t)(b + a);
    }
    *ck_a = a;
    *ck_b = b;
}

bool kvc_ubx_build_cfg_prt_baud(uint32_t baud_rate,
                                uint8_t out[KVC_UBX_CFG_PRT_LEN]) {
    if (out == 0) {
        return false;
    }
    if (baud_rate < UBX_BAUD_MIN || baud_rate > UBX_BAUD_MAX) {
        return false;
    }

    out[0] = UBX_SYNC1;
    out[1] = UBX_SYNC2;
    out[2] = UBX_CLASS_CFG;
    out[3] = UBX_ID_CFG_PRT;
    put_u16le(&out[4], (uint16_t)UBX_PAYLOAD_LEN);

    /* payload (bắt đầu ở byte 6 của khung) */
    out[6] = (uint8_t)KVC_UBX_PORT_UART1; /* portID */
    out[7] = 0U;                          /* reserved0 */
    put_u16le(&out[OFF_TXREADY], 0U);     /* txReady: disable */
    put_u32le(&out[OFF_MODE], (uint32_t)UBX_MODE_8N1);
    put_u32le(&out[OFF_BAUD], baud_rate);
    put_u16le(&out[OFF_PROTO_IN], (uint16_t)UBX_PROTO_MASK_ALL);
    put_u16le(&out[OFF_PROTO_OUT], (uint16_t)UBX_PROTO_MASK_ALL);
    put_u16le(&out[OFF_FLAGS], 0U);
    put_u16le(&out[OFF_RESERVED5], 0U);

    uint8_t a = 0U;
    uint8_t b = 0U;
    ubx_checksum(&out[2], UBX_FRAME_LEN - 4U, &a, &b);
    out[OFF_CK_A] = a;
    out[OFF_CK_B] = b;

    return true;
}

bool kvc_ubx_validate_cfg_prt(const uint8_t *frame, uint32_t len) {
    if (frame == 0 || len != UBX_FRAME_LEN) {
        return false;
    }
    if (frame[0] != UBX_SYNC1 || frame[1] != UBX_SYNC2) {
        return false;
    }
    if (frame[2] != UBX_CLASS_CFG || frame[3] != UBX_ID_CFG_PRT) {
        return false;
    }
    if (get_u16le(&frame[4]) != UBX_PAYLOAD_LEN) {
        return false;
    }

    uint8_t a = 0U;
    uint8_t b = 0U;
    ubx_checksum(&frame[2], UBX_FRAME_LEN - 4U, &a, &b);

    return a == frame[OFF_CK_A] && b == frame[OFF_CK_B];
}

uint32_t kvc_ubx_get_baud(const uint8_t *frame) {
    if (frame == 0) {
        return 0U;
    }
    return get_u32le(&frame[OFF_BAUD]);
}

/* ============================================================================
 * CFG-GNSS — bật đồng thời GPS + Galileo + BeiDou + GLONASS
 * ============================================================================
 * Khung dưới đây được ghép từ đúng tham số của 4 khung mẫu trong datasheet
 * module (§10.5). Xem giải thích đầy đủ ở kvc_ubx_cfg.h và test
 * test_kvc_ubx_cfg.c (kiểm từng block + checksum độc lập).
 *
 * Thứ tự block theo khuôn datasheet: GPS, SBAS, GAL, BDS, QZSS, GLO.
 * numTrkChUse = 32, tổng resTrkCh = 8+1+4+8+0+8 = 29 ≤ 32.
 */
static const uint8_t kCfgGnss4Const[KVC_UBX_CFG_GNSS_LEN] = {
    0xB5, 0x62, 0x06, 0x3E, 0x34, 0x00, 0x00, 0x00,
    0x20, 0x06, 0x00, 0x08, 0x10, 0x00, 0x01, 0x00,
    0x01, 0x00, 0x01, 0x01, 0x03, 0x00, 0x00, 0x00,
    0x01, 0x00, 0x02, 0x04, 0x08, 0x00, 0x01, 0x00,
    0x01, 0x00, 0x03, 0x08, 0x10, 0x00, 0x01, 0x00,
    0x01, 0x00, 0x05, 0x00, 0x03, 0x00, 0x00, 0x00,
    0x01, 0x00, 0x06, 0x08, 0x0E, 0x00, 0x01, 0x00,
    0x01, 0x00, 0x12, 0x3F,
};

bool kvc_ubx_get_cfg_gnss_4const(uint8_t out[KVC_UBX_CFG_GNSS_LEN]) {
    if (out == 0) {
        return false;
    }
    for (uint32_t i = 0U; i < KVC_UBX_CFG_GNSS_LEN; i++) {
        out[i] = kCfgGnss4Const[i];
    }
    return true;
}

bool kvc_ubx_validate_cfg_gnss(const uint8_t *frame, uint32_t len) {
    if (frame == 0 || len != KVC_UBX_CFG_GNSS_LEN) {
        return false;
    }
    if (frame[0] != UBX_SYNC1 || frame[1] != UBX_SYNC2) {
        return false;
    }
    if (frame[2] != 0x06U || frame[3] != 0x3EU) { /* CFG / GNSS */
        return false;
    }
    if (get_u16le(&frame[4]) != 0x0034U) { /* payload 52 */
        return false;
    }

    uint8_t a = 0U;
    uint8_t b = 0U;
    ubx_checksum(&frame[2], len - 4U, &a, &b);

    return a == frame[len - 2U] && b == frame[len - 1U];
}
