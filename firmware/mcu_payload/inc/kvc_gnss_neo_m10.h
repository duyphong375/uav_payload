/**
 * @file kvc_gnss_neo_m10.h
 * @brief Driver định vị vệ tinh u-blox M10 (bo breakout chip UBX-M10050) qua UART3 trên MCU Sonix SN34F788.
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
 * - Cơ chế vận hành: RX qua ngắt UART3 + ring buffer SPSC (KVC-M2-20261025-001);
 *   main tiêu thụ ring trong kvc_gnss_poll(), không đọc thẳng FIFO phần cứng.
 *
 * Tiêu chuẩn dữ liệu GNSS được chấp nhận (hai mức, không thay thế nhau):
 *
 * A. `kvc_gnss_is_valid()` — vị trí dùng được (kiểu TinyGPSPlus):
 *    1. GGA Fix Quality >= 1 (RMC status 'A' cũng đặt quality = 1).
 *    2. Nếu đã có câu GSA: Fix Mode >= 2 (Mode 1 = No fix bị từ chối).
 *    3. Nếu có GGA: Số vệ tinh đang dùng >= 5.
 *    4. Nếu biết HDOP: HDOP <= 2.50.
 *    5. Tọa độ trong dải WGS-84 (-90..+90, -180..+180).
 *    6. Dữ liệu mới trong 3.0 giây; quá 3 giây tự động hạ cờ.
 *
 * B. `kvc_gnss_is_3d_fix()` — đạt 3D fix để được công bố ra RF:
 *    A đúng, VÀ Fix Mode == 3, VÀ sats >= 5, VÀ 0 < HDOP <= 2.50.
 *
 * Bit 0 (KVC_FLAG_GNSS_VALID) của IF-02 được định nghĩa là "GNSS 3D Fix hợp lệ",
 * nên firmware chỉ được bật bit này khi `kvc_gnss_is_3d_fix()` trả true.
 *
 * Nguồn tiêu chí: docs/interfaces/IF_MCU_SENSORS.md §3.3 (Fix Status >= 1,
 * sats >= 5, HDOP <= 2.5) và docs/interfaces/IF_MCU_LORA_RF.md byte 24 bit 0.
 * Các hằng số dưới đây là nguồn duy nhất; không hard-code lại trong code khác.
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
/* Tốc độ UART3 mà firmware CHẠY (sau khi đổi module).
 *
 * BỐI CẢNH PHẦN CỨNG (chốt theo datasheet module — xem SENSOR_PACKAGES.md §1.3):
 * Module là `NEO-M10-0-10` (bo YXT-100-M10, chip UBX-M10050-KB). Datasheet của
 * module ghi rõ: "波特率 4800bps-921600bps (默认38400bps)" — tức **mặc định
 * 38400 bps**, khác với dòng MAX-M10N (mặc định 9600).
 *
 * VÌ SAO FIRMWARE CHẠY 9600 DÙ MODULE MẶC ĐỊNH 38400:
 * UCLK = HCLK = IHRC 12 MHz (SystemInit không bật PLL; UART3CLKSEL = 0).
 *
 *   Baud    DLL   Thực tế   Sai số     + IHRC ±2 %
 *   9600    78    9615      +0,16 %    ≈ 2,2 %   <-- chọn
 *   19200   39    19231     +0,16 %    ≈ 2,2 %
 *   38400   20    37500     −2,34 %    ≈ 4,3 %   VƯỢT giới hạn
 *   57600   13    57692     +0,16 %    ≈ 2,2 %
 *
 * User Manual MCU §15.6: "The valid deviation ... is within |3.125%|".
 * Ở 38400 sai số 4,34 % > 3,125 % nên KHÔNG dùng được khi UCLK 12 MHz.
 *
 * Vì vậy firmware chạy 9600 và gửi lệnh UBX CFG-PRT đổi module về 9600 ngay
 * khi khởi động (kvc_gnss_send_baud_change). Lệnh mẫu lấy từ datasheet module
 * §10.3, kiểm từng byte bằng test_kvc_ubx_cfg.
 *
 * Muốn dùng 38400 phải nâng UCLK bằng PLL >= 24 MHz — thay đổi cây xung nhịp
 * toàn hệ, không làm ở đây. */
#ifndef KVC_GNSS_BAUD_RATE
#define KVC_GNSS_BAUD_RATE              9600UL
#endif

/* Tốc độ module dùng lúc xuất xưởng — cần biết để mở UART3 đúng tốc độ trước
 * khi gửi lệnh đổi baud. Nếu module của bạn đã được đổi sẵn về 9600 và lưu vào
 * flash của bo thì đặt macro này = 9600 để bỏ qua bước đổi. */
#ifndef KVC_GNSS_MODULE_BOOT_BAUD
#define KVC_GNSS_MODULE_BOOT_BAUD       38400UL
#endif
#define KVC_GNSS_TIMEOUT_MS             3000UL  /* Hạn định thời dữ liệu mới (3.0 giây) */
#define KVC_GNSS_MIN_SATS               5U      /* Tối thiểu 5 vệ tinh (IF_MCU_SENSORS §3.3) */
#define KVC_GNSS_MAX_HDOP_CENTI         250U    /* HDOP tối đa 2.50 (nhân 100), IF_MCU_SENSORS §3.3 */
#define KVC_GNSS_MIN_FIX_QUALITY        1U      /* Fix quality tối thiểu của GGA (>= 1) */
#define KVC_GNSS_REQ_FIX_MODE           2U      /* GSA fix mode tối thiểu để có vị trí dùng được (2 = 2D) */
#define KVC_GNSS_REQ_FIX_MODE_3D        3U      /* GSA fix mode bắt buộc cho 3D fix (IF-02 bit 0) */
#define KVC_GNSS_MAX_SENTENCE_LEN       120U    /* Độ dài tối đa câu NMEA đệm (tránh tràn RAM) */

/* KVC-MCU-1.5 — Yaw cho georef từ `track_made_good` của câu RMC.
 *
 * GIỚI HẠN CỦA PHƯƠNG PHÁP (phải đọc trước khi dùng):
 * `track_made_good` là hướng CHUYỂN ĐỘNG thực tế, không phải hướng mũi UAV và
 * không phải hướng camera. Nó chỉ có nghĩa khi UAV đang bay ngang đủ nhanh để
 * module tính ra vector chuyển động; khi đứng yên hoặc bay thẳng đứng, giá trị
 * hoặc là rỗng (trường 8 trống) hoặc là giá trị cũ. Vì vậy:
 *   1. Chỉ nhận course khi trường có dữ liệu và status = 'A'.
 *   2. Từ chối nếu `last_course_ms` cũ hơn KVC_GNSS_COURSE_STALE_MS.
 *   3. Từ chối nếu tốc độ mặt đất dưới KVC_GNSS_COURSE_MIN_SPEED_CENTI_KNOTS
 *      (dưới ngưỡng này hướng đo được là nhiễu, sai tới hàng chục độ).
 * Không có Yaw hợp lệ thì georef PHẢI từ chối, không được giả định hướng Bắc. */
#define KVC_GNSS_COURSE_INVALID         0xFFFFU /* Giá trị "không có Yaw" */
#define KVC_GNSS_COURSE_STALE_MS        3000UL  /* Course cũ hơn 3 s thì không dùng */
/* 0,5 knot ≈ 0,93 km/h. Dưới ngưỡng này NEO-M10 không cho hướng đáng tin. */
#define KVC_GNSS_COURSE_MIN_SPEED_CENTI_KNOTS  50U

/* KVC-M2-20261025-001: RX qua ngắt + ring buffer.
 * Định cỡ theo cửa sổ KHÔNG-CONSUMER dài nhất ~650 ms:
 *   kvc_usound_read_robust 250 ms + TxDone LoRa 300 ms + init lại LoRa 100 ms.
 * Ở 9600 8N1 (960 byte/s): ~624 byte -> ring 4096 byte (biên ~6,5x).
 * NMEA 1 Hz thực tế chỉ ~500 byte/s nên đây là biên rất rộng.
 * Ở 38400 (nếu bật lại) biên vẫn đủ 1,44x; giữ nguyên 4096 cho cả hai tốc độ. */
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

    /* KVC-MCU-1.5: Yaw cho georef, lấy từ `track_made_good` (trường 8 câu RMC).
     *
     * QUY ƯỚC: 0..3599 = 0,0..359,9° theo chiều kim đồng hồ từ Bắc.
     * `KVC_GNSS_COURSE_INVALID` (0xFFFF) = chưa có hoặc không dùng được.
     *
     * GIỚI HẠN PHẢI BIẾT: track_made_good là hướng CHUYỂN ĐỘNG, không phải
     * hướng camera. Khi UAV đứng yên hoặc bay thẳng đứng, module không cập nhật
     * trường này (thường giữ giá trị cũ hoặc để rỗng) nên georef PHẢI từ chối
     * thay vì dùng giá trị cũ — xem KVC_GNSS_COURSE_STALE_MS.
     *
     * Thứ tự trường: 2 x uint16 đứng trước `last_course_ms` (uint32) để struct
     * không sinh padding — dự án build với -Wpadded. */
    uint16_t course_deg10;
    uint16_t speed_centi_knots;  /* Tốc độ mặt đất ×100 hải lý/giờ (trường 7 RMC). 0 = đứng yên */
    uint32_t last_course_ms;     /* Thời điểm (timestamp ms) cập nhật course gần nhất */
} KvcGnssState;

/* ============================================================================
 * 3. GIAO DIỆN HÀM API NGOÀI CỦA DRIVER
 * ============================================================================ */

/**
 * @brief Khởi tạo ngoại vi UART3 (9600 8N1 mặc định, cấu hình qua
 *        KVC_GNSS_BAUD_RATE) và cấu hình chân P2.0/P2.1 trên MCU Sonix SN34F788.
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
 * @brief Lấy Yaw dùng được cho georef (KVC-MCU-1.5).
 *
 * @param now_ms  Timestamp hiện tại (ms).
 * @param out_deg10 Nhận Yaw 0,1° (0..3599) khi hàm trả true. Có thể NULL.
 * @return true nếu có Yaw đáng tin ở thời điểm `now_ms`; false nếu chưa có,
 *         đã cũ quá KVC_GNSS_COURSE_STALE_MS, hoặc tốc độ mặt đất quá thấp.
 *
 * QUAN TRỌNG: giá trị trả về là hướng CHUYỂN ĐỘNG, không phải hướng camera.
 * Georef dùng nó làm xấp xỉ Yaw camera chỉ khi UAV bay ngang ổn định. Khi hàm
 * trả false, georef phải TỪ CHỐI tính toạ độ mục tiêu thay vì giả định Bắc.
 */
bool kvc_gnss_get_course_deg10(uint32_t now_ms, uint16_t *out_deg10);

/**
 * @brief Tốc độ mặt đất ×100 hải lý/giờ tại lần cập nhật RMC gần nhất.
 * @return 0 nếu đứng yên hoặc chưa có dữ liệu.
 */
uint16_t kvc_gnss_get_speed_centi_knots(void);

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
    uint32_t byte_count;      /**< Byte thật sự lấy ra khỏi RB */
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
