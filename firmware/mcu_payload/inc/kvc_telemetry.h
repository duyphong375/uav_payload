/**
 * @file kvc_telemetry.h
 * @brief Định nghĩa cấu trúc khung truyền LoRa Telemetry 32 byte (IF-02) và hàm CRC-16 cho MCU Sonix SN34F788.
 * 
 * Đối chiếu tài liệu đặc tả chuẩn:
 * - docs/interfaces/IF_MCU_LORA_RF.md (IF-02)
 * - firmware/gateway_esp32/src/main.cpp (Đầu thu Gateway trạm mặt đất)
 * - docs/hardware/wiring/KVC_MASTER_PINOUT_WIRING.md
 *
 * Người phụ trách phân hệ MCU UAV: Nguyễn Tá Duy Phong
 * Người phụ trách phân hệ Gateway: Đoàn Thanh Trường Thịnh
 */

#ifndef KVC_TELEMETRY_H
#define KVC_TELEMETRY_H

#include <stdint.h>
#include <stdbool.h>
#include <stddef.h>

#ifdef __cplusplus
extern "C" {
#endif

/* ============================================================================
 * 1. HẰNG SỐ VÔ TUYẾN LORA RF CHUẨN KVC (IF-02)
 * ============================================================================ */
#define KVC_LORA_FREQ_HZ            433000000UL /* 433.0 MHz */
#define KVC_LORA_SYNC_WORD          0x12        /* Khóa mạng nội bộ KVC */
#define KVC_LORA_BANDWIDTH_HZ       125000      /* 125 kHz */
#define KVC_LORA_SPREADING_FACTOR   7           /* SF7 (Candidate SF7/SF8) */
#define KVC_LORA_CODING_RATE_DENOM  5           /* CR 4/5 */

#define KVC_TELEMETRY_SYNC0         0xAA
#define KVC_TELEMETRY_SYNC1         0x55

#define KVC_MSG_ID_TELEMETRY        0x01        /* Gói tin đo xa mục tiêu cứu nạn */
#define KVC_MSG_ID_HEARTBEAT        0x02        /* Gói tin định kỳ duy trì kết nối */

/* Cờ trạng thái cảm biến (Sensor Status Flags - Byte 24) */
#define KVC_FLAG_GNSS_VALID         (1U << 0)   /* Bit 0: GNSS 3D Fix hợp lệ */
#define KVC_FLAG_ALT_VALID          (1U << 1)   /* Bit 1: Cự ly siêu âm hợp lệ */
#define KVC_FLAG_IMU_VALID          (1U << 2)   /* Bit 2: IMU góc nghiêng hợp lệ */
#define KVC_FLAG_AI_DETECTED        (1U << 3)   /* Bit 3: FPGA AI phát hiện mục tiêu */

/* Phân loại mục tiêu (Class ID - Byte 22)
 *
 * FIX (Codex F14): trước đây cùng class 2 vừa gọi BOAT (ở đây) vừa gọi LIFEBUOY
 * (kvc_fpga_bbox.h, IF_MCU_LORA_RF.md) nên tên không thống nhất giữa các phía.
 * Nay byte 22 dùng MỘT tên chuẩn là LIFEBUOY cho giá trị 2, khớp IF-02 và
 * kvc_fpga_bbox.h. BOAT được giữ như alias deprecated để code cũ vẫn biên dịch,
 * nhưng KHÔNG được dùng cho giá trị mới.
 *
 * GIỚI HẠN: backend Python (esp32_ingress.py) trong working tree hiện tại cũng
 * đã map class 2 -> "lifebuoy", nên hai phía khớp tên. */
#define KVC_CLASS_ID_NONE           0
#define KVC_CLASS_ID_PERSON         1           /* Người gặp nạn */
#define KVC_CLASS_ID_LIFEBUOY       2           /* Phao cứu sinh (tên chuẩn, IF-02) */
#define KVC_CLASS_ID_BOAT           KVC_CLASS_ID_LIFEBUOY  /* Deprecated alias, giữ tương thích */

/* ============================================================================
 * 2. CẤU TRÚC GÓI ĐO XA TELEMETRY 32-BYTE LITTLE-ENDIAN (PACKED)
 * ============================================================================ */

#define KVC_TELEMETRY_PACKET_SIZE   32U
#define KVC_TELEMETRY_CRC_COVERAGE  30U

#pragma pack(push, 1)
typedef struct __attribute__((packed)) {
    /* Byte 0..1: Tiêu đề đồng bộ (0xAA 0x55) */
    uint8_t sync[2];

    /* Byte 2: Message ID (0x01 = Telemetry, 0x02 = Heartbeat) */
    uint8_t msg_id;

    /* Byte 3: Sequence Number (0..255 xoay vòng) */
    uint8_t seq_num;

    /* Byte 4..7: Timestamp mili-giây từ khi MCU khởi động */
    uint32_t timestamp_ms;

    /* Byte 8..11: Vĩ độ WGS-84 mục tiêu nhân 10^7 (int32) */
    int32_t target_lat;

    /* Byte 12..15: Kinh độ WGS-84 mục tiêu nhân 10^7 (int32) */
    int32_t target_lon;

    /* Byte 16..17: Tọa độ X mốc nội bộ / sa bàn (cm, int16) */
    int16_t target_x_local;

    /* Byte 18..19: Tọa độ Y mốc nội bộ / sa bàn (cm, int16) */
    int16_t target_y_local;

    /* Byte 20..21: Khoảng cách đo mặt nước từ cảm biến siêu âm AJ-SR04M (cm) */
    uint16_t alt_dist_cm;

    /* Byte 22: Phân loại mục tiêu (1 = Person, 2 = Boat) */
    uint8_t class_id;

    /* Byte 23: Độ tin cậy AI nhận diện (0..100 %) */
    uint8_t confidence;

    /* Byte 24: Cờ trạng thái cảm biến (Bit 0..3) */
    uint8_t sensor_flags;

    /* Byte 25: Điện áp pin UAV (0.1 V/bit, ví dụ 126 = 12.6V) */
    uint8_t battery_raw;

    /* Byte 26..29: 4 byte dự phòng mở rộng */
    uint8_t reserved[4];

    /* Byte 30..31: Mã kiểm tra an toàn CRC-16/CCITT-FALSE tính trên 30 byte đầu */
    uint16_t crc16;
} KvcTelemetryPacket32;
#pragma pack(pop)

/* Đảm bảo trình biên dịch ép đúng kích thước 32 bytes */
typedef char kvc_telemetry_packet_size_check[(sizeof(KvcTelemetryPacket32) == 32) ? 1 : -1];

/* ============================================================================
 * 2b. KIỂM TRA OFFSET LAYOUT TẠI THỜI ĐIỂM BIÊN DỊCH
 * Bảng offset trong IF-02 mục 2 phải khớp tuyệt đối; nếu ai sửa struct mà
 * quên cập nhật IF-02 / Gateway / parser Python thì build sẽ FAIL ngay.
 * ============================================================================ */
#define KVC_TELEMETRY_OFF_SYNC       0U
#define KVC_TELEMETRY_OFF_MSG_ID     2U
#define KVC_TELEMETRY_OFF_SEQ_NUM    3U
#define KVC_TELEMETRY_OFF_TIMESTAMP  4U
#define KVC_TELEMETRY_OFF_TARGET_LAT 8U
#define KVC_TELEMETRY_OFF_TARGET_LON 12U
#define KVC_TELEMETRY_OFF_X_LOCAL    16U
#define KVC_TELEMETRY_OFF_Y_LOCAL    18U
#define KVC_TELEMETRY_OFF_ALT_DIST   20U
#define KVC_TELEMETRY_OFF_CLASS_ID   22U
#define KVC_TELEMETRY_OFF_CONFIDENCE 23U
#define KVC_TELEMETRY_OFF_FLAGS      24U
#define KVC_TELEMETRY_OFF_BATTERY    25U
#define KVC_TELEMETRY_OFF_RESERVED   26U
#define KVC_TELEMETRY_OFF_CRC16      30U

typedef char kvc_telemetry_off_sync_check[(offsetof(KvcTelemetryPacket32, sync) == KVC_TELEMETRY_OFF_SYNC) ? 1 : -1];
typedef char kvc_telemetry_off_msg_id_check[(offsetof(KvcTelemetryPacket32, msg_id) == KVC_TELEMETRY_OFF_MSG_ID) ? 1 : -1];
typedef char kvc_telemetry_off_seq_check[(offsetof(KvcTelemetryPacket32, seq_num) == KVC_TELEMETRY_OFF_SEQ_NUM) ? 1 : -1];
typedef char kvc_telemetry_off_ts_check[(offsetof(KvcTelemetryPacket32, timestamp_ms) == KVC_TELEMETRY_OFF_TIMESTAMP) ? 1 : -1];
typedef char kvc_telemetry_off_lat_check[(offsetof(KvcTelemetryPacket32, target_lat) == KVC_TELEMETRY_OFF_TARGET_LAT) ? 1 : -1];
typedef char kvc_telemetry_off_lon_check[(offsetof(KvcTelemetryPacket32, target_lon) == KVC_TELEMETRY_OFF_TARGET_LON) ? 1 : -1];
typedef char kvc_telemetry_off_x_check[(offsetof(KvcTelemetryPacket32, target_x_local) == KVC_TELEMETRY_OFF_X_LOCAL) ? 1 : -1];
typedef char kvc_telemetry_off_y_check[(offsetof(KvcTelemetryPacket32, target_y_local) == KVC_TELEMETRY_OFF_Y_LOCAL) ? 1 : -1];
typedef char kvc_telemetry_off_alt_check[(offsetof(KvcTelemetryPacket32, alt_dist_cm) == KVC_TELEMETRY_OFF_ALT_DIST) ? 1 : -1];
typedef char kvc_telemetry_off_class_check[(offsetof(KvcTelemetryPacket32, class_id) == KVC_TELEMETRY_OFF_CLASS_ID) ? 1 : -1];
typedef char kvc_telemetry_off_conf_check[(offsetof(KvcTelemetryPacket32, confidence) == KVC_TELEMETRY_OFF_CONFIDENCE) ? 1 : -1];
typedef char kvc_telemetry_off_flags_check[(offsetof(KvcTelemetryPacket32, sensor_flags) == KVC_TELEMETRY_OFF_FLAGS) ? 1 : -1];
typedef char kvc_telemetry_off_batt_check[(offsetof(KvcTelemetryPacket32, battery_raw) == KVC_TELEMETRY_OFF_BATTERY) ? 1 : -1];
typedef char kvc_telemetry_off_res_check[(offsetof(KvcTelemetryPacket32, reserved) == KVC_TELEMETRY_OFF_RESERVED) ? 1 : -1];
typedef char kvc_telemetry_off_crc_check[(offsetof(KvcTelemetryPacket32, crc16) == KVC_TELEMETRY_OFF_CRC16) ? 1 : -1];

/* Golden vector GV-01 (IF-02 mục 3) — dùng chung với Gateway ESP32 và parser Python.
 * Sinh bởi kvc_finalize_telemetry_packet() trên struct dưới đây, không sửa tay.
 * Kỳ vọng: sizeof = 32, CRC-16/CCITT-FALSE trên 30 byte đầu = 0x304E (lưu LE 4e 30). */
#define KVC_GOLDEN_GV01_CRC16       0x304EU

static inline bool kvc_telemetry_match_golden_gv01(const KvcTelemetryPacket32 *pkt) {
    if (pkt == NULL) {
        return false;
    }
    return (pkt->crc16 == KVC_GOLDEN_GV01_CRC16) &&
           (pkt->sync[0] == KVC_TELEMETRY_SYNC0) &&
           (pkt->sync[1] == KVC_TELEMETRY_SYNC1) &&
           (pkt->msg_id == KVC_MSG_ID_TELEMETRY) &&
           (pkt->seq_num == 42U) &&
           (pkt->timestamp_ms == 1000UL) &&
           (pkt->target_lat == 107723450L) &&
           (pkt->target_lon == 1066578900L) &&
           (pkt->target_x_local == 150) &&
           (pkt->target_y_local == 320) &&
           (pkt->alt_dist_cm == 240U) &&
           (pkt->class_id == KVC_CLASS_ID_PERSON) &&
           (pkt->confidence == 92U) &&
           (pkt->sensor_flags == 0x0FU) &&
           (pkt->battery_raw == 126U);
}

/* ============================================================================
 * 3. HÀM TÍNH TOÁN CRC-16/CCITT-FALSE (ĐỒNG BỘ 100% VỚI ESP32 & BACKEND PYTHON)
 * Poly: 0x1021, Init: 0xFFFF, RefIn: false, RefOut: false, XorOut: 0x0000
 * ============================================================================ */
static inline uint16_t kvc_calculate_crc16(const uint8_t *data, size_t length) {
    uint16_t crc = 0xFFFFU;
    size_t i;
    uint8_t bit;
    for (i = 0; i < length; i++) {
        crc ^= (uint16_t)((uint16_t)data[i] << 8);
        for (bit = 0; bit < 8; bit++) {
            if (crc & 0x8000U) {
                crc = (uint16_t)(((uint32_t)crc << 1) ^ 0x1021U);
            } else {
                crc = (uint16_t)((uint32_t)crc << 1);
            }
        }
    }
    return crc;
}

/**
 * @brief Đóng gói hoàn chỉnh mã CRC16 vào gói telemetry 32 byte trước khi truyền SPI
 */
static inline void kvc_finalize_telemetry_packet(KvcTelemetryPacket32 *pkt) {
    if (pkt != NULL) {
        pkt->sync[0] = KVC_TELEMETRY_SYNC0;
        pkt->sync[1] = KVC_TELEMETRY_SYNC1;
        pkt->crc16 = kvc_calculate_crc16((const uint8_t *)pkt, 30);
    }
}

#ifdef __cplusplus
}
#endif

#endif /* KVC_TELEMETRY_H */
