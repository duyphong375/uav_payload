/**
 * @file kvc_gnss_neo_m10.h
 * @brief Driver định vị vệ tinh u-blox NEO-M10 (M10N) qua UART3 trên MCU Sonix SN34F788.
 *
 * Nhiệm vụ thuộc Task KVC-GNSS-M10-001.
 * Đối chiếu tài liệu đặc tả chuẩn:
 * - docs/hardware/wiring/KVC_MASTER_PINOUT_WIRING.md (Mục 3.3: P2.0 UTXD3, P2.1 URXD3)
 * - docs/interfaces/IF_MCU_SENSORS.md
 * - firmware/mcu_payload/inc/kvc_pinout.h
 * - firmware/mcu_payload/inc/kvc_telemetry.h (Bit cờ KVC_FLAG_GNSS_VALID)
 * - docs/hardware/sonix_sn34f788/SN34F780_StartKit_Package_V1.10R/Document/SN34F780_V1.7.pdf
 *
 * Cấu hình phần cứng:
 * - UART3: Baudrate 9600 bps, khung truyền 8N1 (8 data bits, no parity, 1 stop bit).
 * - Chân kết nối:
 *   + P2.1 (Pin 15 LQFP64 | JP3 Pin 3/4): URXD3 (Nhận dữ liệu NMEA từ chân TX của module).
 *   + P2.0 (Pin 14 LQFP64 | JP3 Pin 1/2): UTXD3 (Nối chân RX của module, không gửi lệnh đổi cấu hình).
 * - Cơ chế vận hành: Polling không chặn (non-blocking), không sử dụng ngắt (IRQ).
 *
 * Tiêu chuẩn nghiệm thu 3D Fix hợp lệ (KVC_FLAG_GNSS_VALID):
 * 1. GGA Fix Quality >= 1 (1 = GPS SPS, 2 = DGPS, 4 = RTK Fix, 5 = RTK Float, 6 = Dead reckoning).
 * 2. GSA Fix Mode == 3 (3D Fix bắt buộc; Mode 1 = No fix, Mode 2 = 2D fix bị từ chối).
 * 3. Số vệ tinh đang theo dõi (Satellites in use) >= 5.
 * 4. Sai số hình học mặt ngang (HDOP) <= 2.50.
 * 5. Tọa độ nằm trong giới hạn chuẩn WGS-84 (-90° <= Lat <= +90°, -180° <= Lon <= +180°).
 * 6. Dữ liệu mới cập nhật trong vòng 3.0 giây (3000 ms). Quá 3 giây tự động hạ cờ valid.
 *
 * Người phụ trách phân hệ MCU UAV: Nguyễn Tá Duy Phong
 */

#ifndef KVC_GNSS_NEO_M10_H
#define KVC_GNSS_NEO_M10_H

#include <stdint.h>
#include <stdbool.h>
#include <stddef.h>

#ifdef __cplusplus
extern "C" {
#endif

/* ============================================================================
 * 1. HẰNG SỐ CẤU HÌNH GIAO TIẾP VÀ NGƯỠNG AN TOÀN FIX
 * ============================================================================ */
#define KVC_GNSS_BAUD_RATE              38400UL /* Tốc độ Baud mặc định của module u-blox M10 (38400 bps) */
#define KVC_GNSS_TIMEOUT_MS             3000UL  /* Hạn định thời dữ liệu mới (3.0 giây) */
#define KVC_GNSS_MIN_SATS               4U      /* Tối thiểu 4 vệ tinh cho định vị không gian 3 chiều và thời gian */
#define KVC_GNSS_MAX_HDOP_CENTI         500U    /* Ngưỡng HDOP tối đa 5.00 (nhân 100) theo chuẩn TinyGPSPlus */
#define KVC_GNSS_MIN_FIX_QUALITY        1U      /* Fix quality tối thiểu của GGA (>= 1) */
#define KVC_GNSS_REQ_FIX_MODE           2U      /* Fix mode tối thiểu của GSA (>= 2: 2D fix hoặc 3D fix) */
#define KVC_GNSS_MAX_SENTENCE_LEN       120U    /* Độ dài tối đa câu NMEA đệm (tránh tràn RAM) */

/* KVC-M2-20261025-001: RX qua ngắt + ring buffer.
 * Định cỡ theo cửa sổ KHÔNG-CONSUMER dài nhất ~740 ms:
 *   kvc_usound_read_robust 340 ms + TxDone LoRa 300 ms + init lại LoRa 100 ms.
 * Ở 38400 8N1 (3840 byte/s): ~2842 byte -> ring 4096 byte (biên 1,44x).
 * NMEA 1 Hz thực tế chỉ ~500 byte/s nên đây là biên rất rộng. */
#define KVC_GNSS_RX_RING_SIZE           4096U
#define KVC_GNSS_RX_DRAIN_PER_POLL      256U

/* Giới hạn tọa độ WGS-84 nhân 10^7 */
#define KVC_GNSS_LAT_MIN_DEG7           (-900000000LL)   /* -90.0000000° */
#define KVC_GNSS_LAT_MAX_DEG7           (900000000LL)    /* +90.0000000° */
#define KVC_GNSS_LON_MIN_DEG7           (-1800000000LL)  /* -180.0000000° */
#define KVC_GNSS_LON_MAX_DEG7           (1800000000LL)   /* +180.0000000° */

/* ============================================================================
 * 2. CẤU TRÚC DỮ LIỆU TRẠNG THÁI ĐỊNH VỊ VỆ TINH GNSS
 * ============================================================================ */
typedef struct {
    int32_t  lat_deg7;           /* Vĩ độ WGS-84 nhân 10^7 (Bắc: dương, Nam: âm; ví dụ 160738520 = 16.0738520° N) */
    int32_t  lon_deg7;           /* Kinh độ WGS-84 nhân 10^7 (Đông: dương, Tây: âm; ví dụ 1081499210 = 108.1499210° E) */
    uint32_t last_update_ms;     /* Thời điểm (timestamp ms) trạng thái GNSS hợp lệ gần nhất */
    uint32_t last_gga_ms;        /* Thời điểm (timestamp ms) câu GGA hợp lệ gần nhất */
    uint32_t last_gsa_ms;        /* Thời điểm (timestamp ms) câu GSA hợp lệ gần nhất */
    uint32_t last_rmc_ms;        /* Thời điểm (timestamp ms) câu RMC hợp lệ gần nhất */
    uint16_t hdop_centi;         /* Độ suy giảm chính xác mặt ngang x100 (ví dụ 120 = 1.20, 250 = 2.50) */
    uint16_t hdop_x10;           /* Độ suy giảm chính xác mặt ngang x10 (ví dụ 12 = 1.2, 25 = 2.5) */
    uint8_t  fix_quality;        /* GGA Quality: 0=No fix, 1=GPS SPS, 2=DGPS, 4=RTK Fix, 5=RTK Float */
    uint8_t  fix_mode;           /* GSA Fix mode: 1=No fix, 2=2D fix, 3=3D fix */
    uint8_t  satellites_tracked; /* Số lượng vệ tinh đang tham gia giải nghiệm (0..99) */
    bool     valid;              /* true khi có vị trí hợp lệ (kiểu TinyGPSPlus) và dữ liệu còn mới trong 3 giây */
} KvcGnssState;

/* ============================================================================
 * 3. GIAO DIỆN HÀM API NGOÀI CỦA DRIVER
 * ============================================================================ */

/**
 * @brief Khởi tạo ngoại vi UART3 (38400 8N1) và cấu hình chân P2.0/P2.1 trên MCU Sonix SN34F788.
 *        Xóa sạch bộ đệm và thiết lập trạng thái GNSS ban đầu.
 */
void kvc_gnss_init(void);

/**
 * @brief Kiểm tra xem GNSS có đạt độ chính xác cao 3D Fix chuẩn (GSA mode == 3, sats >= 5, HDOP <= 2.50) hay không.
 * @return true nếu đạt 3D Fix chuẩn cao cấp, false nếu chỉ đạt 2D fix hoặc HDOP lớn hơn 2.50.
 */
bool kvc_gnss_is_3d_fix(void);

/**
 * @brief Đọc bộ đệm FIFO UART3 theo cơ chế Polling không chặn và cập nhật máy trạng thái.
 *        Cần được gọi định kỳ trong vòng lặp chính (ví dụ mỗi nhịp 1 ms).
 * @param now_ms Timestamp hiện tại tính bằng mili-giây từ khi MCU khởi động.
 */
void kvc_gnss_poll(uint32_t now_ms);

/**
 * @brief Nạp trực tiếp 1 byte dữ liệu UART vào bộ giải mã NMEA.
 *        Hàm này độc lập phần cứng, dùng cho cả Polling thực tế và kiểm thử Host Test.
 * @param b Byte dữ liệu nhận được từ cổng nối tiếp.
 * @param now_ms Timestamp mili-giây tại thời điểm nhận byte.
 */
void kvc_gnss_feed_byte(uint8_t b, uint32_t now_ms);

/**
 * @brief Nạp toàn bộ một chuỗi câu NMEA (kết thúc bằng '\0') vào bộ giải mã.
 * @param nmea_str Chuỗi NMEA chứa ký tự bắt đầu '$' và checksum '*XX'.
 * @param now_ms Timestamp mili-giây tại thời điểm xử lý.
 * @return true nếu câu NMEA được tiếp nhận và xử lý thành công.
 */
bool kvc_gnss_feed_sentence(const char *nmea_str, uint32_t now_ms);

/**
 * @brief Kiểm tra xem trạng thái định vị 3D hiện tại có hợp lệ và còn mới trong 3 giây hay không.
 * @return true nếu fix 3D hợp lệ, false nếu mất fix hoặc quá hạn 3 giây.
 */
bool kvc_gnss_is_valid(void);

/**
 * @brief Trả về con trỏ hằng tới cấu trúc trạng thái GNSS nội bộ.
 * @return Con trỏ tới cấu trúc KvcGnssState.
 */
const KvcGnssState* kvc_gnss_get_state(void);

/**
 * @brief Sao chép an toàn trạng thái GNSS hiện tại ra biến của người dùng.
 * @param out_state Con trỏ vùng nhớ nhận dữ liệu sao chép.
 */
void kvc_gnss_get_state_copy(KvcGnssState *out_state);

/**
 * @brief Kiểm tra hạn định thời dữ liệu và hạ cờ valid nếu quá 3 giây không có bản tin mới.
 * @param now_ms Timestamp hiện tại tính bằng mili-giây.
 */
void kvc_gnss_check_expiry(uint32_t now_ms);

/**
 * @brief Đặt lại toàn bộ trạng thái bộ giải mã và xóa sạch cấu trúc dữ liệu.
 */
void kvc_gnss_reset(void);

#if defined(__arm__) || defined(__CC_ARM) || defined(__ARMCC_VERSION) || defined(SN34F780)
/**
 * @brief Thống kê RX UART3 (chẩn đoán M2). Chỉ có trên target thật.
 */
typedef struct {
    uint32_t ring_dropped;    /**< Byte bị bỏ vì ring đầy (phần mềm) */
    uint32_t overrun_count;   /**< LS.OE: FIFO 16 byte phần cứng đã tràn */
    uint32_t framing_count;   /**< LS.FE: sai stop bit */
    uint32_t parity_count;    /**< LS.PE: sai parity */
    uint32_t isr_count;       /**< Số lần vào UART3_IRQHandler */
    uint32_t bytes_pending;   /**< Byte còn trong ring tại thời điểm đọc */
} KvcGnssRxStats;

/**
 * @brief ISR RX UART3. Vector: UART3_IRQHandler (IRQ 52).
 *        Khai báo để thoả -Wmissing-prototypes; không gọi trực tiếp từ code.
 */
void UART3_IRQHandler(void);

/**
 * @brief Đọc thống kê RX UART3. Chỉ có trên target thật.
 * @param out Cấu trúc nhận kết quả; NULL sẽ được bỏ qua.
 */
void kvc_gnss_get_rx_stats(KvcGnssRxStats *out);
#endif

#ifdef __cplusplus
}
#endif

#endif /* KVC_GNSS_NEO_M10_H */
