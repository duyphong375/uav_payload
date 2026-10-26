/**
 * @file kvc_gnss_neo_m10.c
 * @brief Driver định vị vệ tinh u-blox NEO-M10 (M10N) qua UART3 trên MCU Sonix SN34F788.
 *
 * Nhiệm vụ thuộc Task KVC-GNSS-M10-001.
 * Đối chiếu tài liệu đặc tả chuẩn:
 * - docs/hardware/wiring/KVC_MASTER_PINOUT_WIRING.md (Mục 3.3: P2.0 UTXD3, P2.1 URXD3)
 * - docs/interfaces/IF_MCU_SENSORS.md
 * - firmware/mcu_payload/inc/kvc_pinout.h
 * - firmware/mcu_payload/inc/kvc_gnss_neo_m10.h
 * - docs/hardware/sonix_sn34f788/SN34F780_StartKit_Package_V1.10R/Document/SN34F780_V1.7.pdf
 *
 * Người phụ trách phân hệ MCU UAV: Nguyễn Tá Duy Phong
 */

#include "kvc_gnss_neo_m10.h"
#include "kvc_ubx_cfg.h"
#include "kvc_timebase.h"  /* kvc_gnss_autobaud dùng kvc_timebase_ms() để đo cửa sổ */
#include <string.h>
#include <stdlib.h>
#include <ctype.h>

#if defined(__arm__) || defined(__ARMCC_VERSION) || defined(__CC_ARM) || (!defined(KVC_HOST_TEST) && !defined(__x86_64__) && !defined(_WIN32))
#include "SN34F780.h"
#define KVC_GNSS_HAS_SONIX_HW 1
#else
#define KVC_GNSS_HAS_SONIX_HW 0
#endif

/* KVC-M2-20261025-001: RX qua ngắt + ring buffer.
 *
 * TRƯỚC: IE = 0x00, poll đọc thẳng FIFO mỗi 1 ms. Khi main chờ TxDone LoRa
 * (tới 300 ms) hoặc chạy delay khởi tạo, FIFO 16 byte tràn -> mất câu NMEA.
 * SAU: ISR UART3 rút cạn FIFO vào ring; main tiêu thụ ring trong
 * kvc_gnss_poll(). FSM NMEA và checksum giữ nguyên.
 */
#if KVC_GNSS_HAS_SONIX_HW
#include "kvc_uart_ring.h"

/* Kích thước ring và trần drain lấy từ kvc_gnss_neo_m10.h (một nguồn duy nhất). */

static uint8_t     s_rx_ring_buf[KVC_GNSS_RX_RING_SIZE];
static KvcUartRing s_rx_ring;

static volatile uint32_t s_rx_overrun_count = 0U;  /* LS.OE */
static volatile uint32_t s_rx_framing_count = 0U;  /* LS.FE */
static volatile uint32_t s_rx_parity_count  = 0U;  /* LS.PE */
static volatile uint32_t s_rx_isr_count     = 0U;
/* Số byte THẬT SỰ lấy ra khỏi RB. Cần để phân biệt "ISR bắn vì có byte" với
 * "ISR bắn vì nhiễu" — xem chẩn đoán UART5. */
static volatile uint32_t s_rx_byte_count    = 0U;
#endif

/* ============================================================================
 * BIẾN TOÀN CỤC NỘI BỘ VÀ TRẠNG THÁI MÁY GIẢI MÃ NMEA
 * ============================================================================ */
static KvcGnssState s_state;

typedef enum {
    STATE_WAIT_START = 0,   /* Đang chờ ký tự bắt đầu '$' */
    STATE_PAYLOAD,          /* Đang nạp nội dung bản tin giữa '$' và '*' */
    STATE_CHECKSUM_H,       /* Đang chờ ký tự hex cao của Checksum */
    STATE_CHECKSUM_L,       /* Đang chờ ký tự hex thấp của Checksum */
    STATE_WAIT_EOL          /* Đang chờ kết thúc dòng (\r hoặc \n) */
} KvcNmeaRxState;

static KvcNmeaRxState s_rx_state = STATE_WAIT_START;
static char           s_rx_buf[KVC_GNSS_MAX_SENTENCE_LEN + 1];
static uint8_t        s_rx_len = 0;
static uint8_t        s_calc_cs = 0;
static uint8_t        s_recv_cs = 0;

/* Đếm số câu NMEA đã qua checksum. Dùng cho bộ dò baud lúc khởi động
 * (kvc_gnss_autobaud): ở sai tốc độ, byte nhận là rác nên số này gần như
 * không tăng. Định nghĩa ở đây (trước hàm parse) vì hàm parse tăng nó. */
static volatile uint32_t s_rx_good_sentence_count = 0U;

/* ============================================================================
 * CÁC HÀM TIỆN ÍCH GIẢI MÃ NỘI BỘ
 * ============================================================================ */

/**
 * @brief Chuyển đổi ký tự hex (0-9, A-F, a-f) sang giá trị số 0..15.
 * @return Giá trị 0..15 nếu hợp lệ, -1 nếu không phải ký tự hex.
 */
static int8_t hex_to_nibble(char c) {
    if (c >= '0' && c <= '9') return (int8_t)(c - '0');
    if (c >= 'A' && c <= 'F') return (int8_t)(c - 'A' + 10);
    if (c >= 'a' && c <= 'f') return (int8_t)(c - 'a' + 10);
    return -1;
}

/**
 * @brief Đánh giá toàn bộ điều kiện Fix hợp lệ (kiểu TinyGPSPlus) và cập nhật cờ valid.
 */
static void kvc_gnss_eval_validity(uint32_t now_ms) {
    bool fresh_gga = (s_state.last_gga_ms > 0U) &&
                     (now_ms >= s_state.last_gga_ms) &&
                     ((now_ms - s_state.last_gga_ms) <= KVC_GNSS_TIMEOUT_MS);

    bool fresh_rmc = (s_state.last_rmc_ms > 0U) &&
                     (now_ms >= s_state.last_rmc_ms) &&
                     ((now_ms - s_state.last_rmc_ms) <= KVC_GNSS_TIMEOUT_MS);

    bool fresh_gsa = (s_state.last_gsa_ms > 0U) &&
                     (now_ms >= s_state.last_gsa_ms) &&
                     ((now_ms - s_state.last_gsa_ms) <= KVC_GNSS_TIMEOUT_MS);

    /* Có bản tin vị trí mới từ GGA hoặc RMC */
    bool has_fresh_pos = fresh_gga || fresh_rmc;

    /* Tọa độ hợp lệ nằm trong dải chuẩn WGS-84 */
    bool coord_ok = (s_state.lat_deg7 >= KVC_GNSS_LAT_MIN_DEG7 &&
                     s_state.lat_deg7 <= KVC_GNSS_LAT_MAX_DEG7 &&
                     s_state.lon_deg7 >= KVC_GNSS_LON_MIN_DEG7 &&
                     s_state.lon_deg7 <= KVC_GNSS_LON_MAX_DEG7);

    /* Chất lượng Fix: GGA Quality >= 1 hoặc RMC Status Active */
    bool quality_ok = (s_state.fix_quality >= KVC_GNSS_MIN_FIX_QUALITY);

    /* GSA: nếu đã nhận câu GSA thì fix_mode phải đạt ngưỡng (3 = 3D fix). */
    bool gsa_ok = !fresh_gsa || (s_state.fix_mode >= KVC_GNSS_REQ_FIX_MODE);

    /* Số lượng vệ tinh: Nếu có GGA, yêu cầu >= MIN_SATS; nếu chỉ có RMC thì cho qua */
    bool sats_ok = (!fresh_gga) || (s_state.satellites_tracked >= KVC_GNSS_MIN_SATS);

    /* Sai số hình học HDOP: Nếu có thông số, yêu cầu <= MAX_HDOP_CENTI (2.50) */
    bool hdop_ok = (s_state.hdop_centi == 0xFFFFU) || (s_state.hdop_centi <= KVC_GNSS_MAX_HDOP_CENTI);

    if (has_fresh_pos && coord_ok && quality_ok && gsa_ok && sats_ok && hdop_ok) {
        s_state.valid = true;
        s_state.last_update_ms = now_ms;
    } else {
        s_state.valid = false;
    }
}

/**
 * @brief Chuyển đổi chuỗi tọa độ định dạng NMEA (ddmm.mmmmm hoặc dddmm.mmmmm)
 *        sang tọa độ độ thập phân có dấu nhân 10^7 (WGS-84).
 * @param s Chuỗi tọa độ đầu vào từ câu NMEA.
 * @param hemi Bán cầu ('N', 'S', 'E', 'W').
 * @param is_lat true nếu là vĩ độ (Lat), false nếu là kinh độ (Lon).
 * @param out_deg7 Con trỏ nhận giá trị tọa độ x 10^7.
 * @return true nếu giải mã thành công và tọa độ nằm trong biên WGS-84, false nếu lỗi.
 */
static bool parse_coord_deg7(const char *s, char hemi, bool is_lat, int32_t *out_deg7) {
    if (s == NULL || *s == '\0' || out_deg7 == NULL) {
        return false;
    }

    const char *dot = strchr(s, '.');
    int before_len = dot ? (int)(dot - s) : (int)strlen(s);
    if (before_len < 2) {
        return false; /* Không đủ tối thiểu 2 chữ số phút nguyên */
    }

    /* 2 chữ số ngay trước dấu chấm là phút nguyên (00..59) */
    char c_min1 = s[before_len - 2];
    char c_min2 = s[before_len - 1];
    if (!isdigit((unsigned char)c_min1) || !isdigit((unsigned char)c_min2)) {
        return false;
    }
    int32_t min_int = (c_min1 - '0') * 10 + (c_min2 - '0');
    if (min_int >= 60) {
        return false; /* Phút không được vượt quá 59 */
    }

    /* Các chữ số phía trước phút là độ nguyên */
    int32_t deg = 0;
    for (int i = 0; i < before_len - 2; i++) {
        if (!isdigit((unsigned char)s[i])) {
            return false;
        }
        deg = deg * 10 + (s[i] - '0');
    }

    /* Đọc phần thập phân sau dấu chấm, đệm chuẩn hóa về tỷ lệ 10^7 */
    int64_t frac = 0;
    if (dot != NULL) {
        const char *p = dot + 1;
        int digits = 0;
        while (*p != '\0' && isdigit((unsigned char)*p) && digits < 7) {
            frac = frac * 10 + (*p - '0');
            p++;
            digits++;
        }
        while (digits < 7) {
            frac *= 10;
            digits++;
        }
    }

    /* Quy đổi chính xác tuyệt đối bằng số nguyên 64-bit:
     * total_minutes = min_int * 10^7 + frac
     * minutes_in_deg7 = (total_minutes + 30) / 60 (làm tròn số gần nhất)
     */
    int64_t total_min = (int64_t)min_int * 10000000LL + frac;
    int64_t min_deg7 = (total_min + 30LL) / 60LL;
    int64_t total_deg7 = (int64_t)deg * 10000000LL + min_deg7;

    if (is_lat) {
        if (hemi == 'S' || hemi == 's') {
            total_deg7 = -total_deg7;
        } else if (hemi != 'N' && hemi != 'n') {
            return false;
        }
        if (total_deg7 < KVC_GNSS_LAT_MIN_DEG7 || total_deg7 > KVC_GNSS_LAT_MAX_DEG7) {
            return false; /* Vượt biên WGS-84 vĩ độ [-90°, +90°] */
        }
    } else {
        if (hemi == 'W' || hemi == 'w') {
            total_deg7 = -total_deg7;
        } else if (hemi != 'E' && hemi != 'e') {
            return false;
        }
        if (total_deg7 < KVC_GNSS_LON_MIN_DEG7 || total_deg7 > KVC_GNSS_LON_MAX_DEG7) {
            return false; /* Vượt biên WGS-84 kinh độ [-180°, +180°] */
        }
    }

    *out_deg7 = (int32_t)total_deg7;
    return true;
}

/**
 * @brief Phân giải chuỗi số thực HDOP sang centi-HDOP (nhân 100) và x10.
 */
static bool parse_hdop(const char *s, uint16_t *out_centi, uint16_t *out_x10) {
    if (s == NULL || *s == '\0' || out_centi == NULL || out_x10 == NULL) {
        return false;
    }

    while (*s == ' ') s++;
    if (*s == '\0') return false;

    uint32_t int_part = 0;
    while (*s != '\0' && *s != '.') {
        if (!isdigit((unsigned char)*s)) return false;
        int_part = int_part * 10 + (*s - '0');
        s++;
    }

    uint32_t frac_part = 0;
    if (*s == '.') {
        s++;
        if (*s != '\0' && isdigit((unsigned char)*s)) {
            frac_part = (uint32_t)(*s - '0') * 10U;
            s++;
            if (*s != '\0' && isdigit((unsigned char)*s)) {
                frac_part += (uint32_t)(*s - '0');
            }
        }
    }

    uint32_t centi = int_part * 100U + frac_part;
    if (centi > 65535U) centi = 65535U;

    *out_centi = (uint16_t)centi;
    *out_x10 = (uint16_t)((centi + 5U) / 10U);
    return true;
}

/**
 * @brief Phân tách chuỗi bản tin NMEA bằng dấu phẩy ',' thành mảng con trỏ trường (an toàn cho trường rỗng).
 */
static uint8_t split_fields(char *buf, char *fields[], uint8_t max_fields) {
    if (buf == NULL || fields == NULL || max_fields == 0) return 0;
    fields[0] = buf;
    uint8_t count = 1;
    for (char *p = buf; *p != '\0'; p++) {
        if (*p == ',') {
            *p = '\0';
            if (count < max_fields) {
                fields[count++] = p + 1;
            }
        }
    }
    return count;
}

/**
 * @brief Phân giải và cập nhật câu NMEA hoàn chỉnh đã qua kiểm tra Checksum.
 */
static void kvc_gnss_parse_sentence_internal(uint32_t now_ms) {
    /* Đếm câu đã qua checksum: dùng cho bộ dò baud lúc khởi động
     * (kvc_gnss_autobaud). Tăng ở đây — sau khi checksum đã khớp — nên số đếm
     * chỉ tăng khi tốc độ UART3 thực sự đúng với module. */
    s_rx_good_sentence_count++;

    char *fields[24];
    uint8_t num_fields = split_fields(s_rx_buf, fields, 24);
    if (num_fields < 2) return;

    size_t tag_len = strlen(fields[0]);
    if (tag_len < 3) return;

    /* Nhận dạng câu GGA: kết thúc bằng "GGA", ví dụ $GNGGA, $GPGGA, $GAGGA, $GBGGA, $GLGGA */
    if (tag_len >= 5 && memcmp(&fields[0][tag_len - 3], "GGA", 3) == 0) {
        /* Định dạng chuẩn:
         * 0: Tag (GNGGA)
         * 1: UTC Time
         * 2: Latitude (ddmm.mmmmm)
         * 3: N/S indicator ('N' hoặc 'S')
         * 4: Longitude (dddmm.mmmmm)
         * 5: E/W indicator ('E' hoặc 'W')
         * 6: Fix Quality (0 = invalid, 1 = GPS SPS, 2 = DGPS, 4 = RTK fix, 5 = RTK float)
         * 7: Number of Satellites (0..99)
         * 8: HDOP (ví dụ 1.20)
         */
        if (num_fields >= 9) {
            uint8_t q = (uint8_t)(fields[6][0] >= '0' && fields[6][0] <= '9' ? fields[6][0] - '0' : 0);
            s_state.fix_quality = q;

            int sats = atoi(fields[7]);
            s_state.satellites_tracked = (sats > 0) ? (uint8_t)sats : 0U;

            uint16_t hdop_c = 0xFFFFU;
            uint16_t hdop_10 = 0xFFFFU;
            if (parse_hdop(fields[8], &hdop_c, &hdop_10)) {
                s_state.hdop_centi = hdop_c;
                s_state.hdop_x10 = hdop_10;
            } else {
                s_state.hdop_centi = 0xFFFFU;
                s_state.hdop_x10 = 0xFFFFU;
            }

            int32_t lat = 0;
            int32_t lon = 0;
            bool lat_ok = parse_coord_deg7(fields[2], fields[3][0], true, &lat);
            bool lon_ok = parse_coord_deg7(fields[4], fields[5][0], false, &lon);

            if (lat_ok && lon_ok) {
                s_state.lat_deg7 = lat;
                s_state.lon_deg7 = lon;
                s_state.last_gga_ms = now_ms;
            } else {
                /* Tọa độ lỗi hoặc rỗng */
                s_state.last_gga_ms = 0U;
            }
        }
        kvc_gnss_eval_validity(now_ms);
        return;
    }

    /* Nhận dạng câu GSA: kết thúc bằng "GSA", ví dụ $GNGSA, $GPGSA */
    if (tag_len >= 5 && memcmp(&fields[0][tag_len - 3], "GSA", 3) == 0) {
        /* Định dạng chuẩn:
         * 0: Tag (GNGSA)
         * 1: OpMode ('A' hoặc 'M')
         * 2: FixMode ('1' = No Fix, '2' = 2D Fix, '3' = 3D Fix)
         */
        if (num_fields >= 3) {
            char m = fields[2][0];
            if (m >= '1' && m <= '3') {
                s_state.fix_mode = (uint8_t)(m - '0');
                s_state.last_gsa_ms = now_ms;
            } else {
                s_state.fix_mode = 1U;
                s_state.last_gsa_ms = 0U;
            }
        }
        kvc_gnss_eval_validity(now_ms);
        return;
    }

    /* Nhận dạng câu RMC: kết thúc bằng "RMC", ví dụ $GNRMC, $GPRMC */
    if (tag_len >= 5 && memcmp(&fields[0][tag_len - 3], "RMC", 3) == 0) {
        /* Định dạng chuẩn:
         * 0: Tag (GNRMC)
         * 1: UTC Time
         * 2: Status ('A' = Data valid, 'V' = Navigation receiver warning / invalid)
         * 3: Latitude (ddmm.mmmmm)
         * 4: N/S indicator ('N' hoặc 'S')
         * 5: Longitude (dddmm.mmmmm)
         * 6: E/W indicator ('E' hoặc 'W')
         */
        if (num_fields >= 7) {
            char status = fields[2][0];
            if (status == 'A') {
                int32_t lat = 0;
                int32_t lon = 0;
                bool lat_ok = parse_coord_deg7(fields[3], fields[4][0], true, &lat);
                bool lon_ok = parse_coord_deg7(fields[5], fields[6][0], false, &lon);
                if (lat_ok && lon_ok) {
                    s_state.lat_deg7 = lat;
                    s_state.lon_deg7 = lon;
                    s_state.last_rmc_ms = now_ms;
                    if (s_state.fix_quality == 0) {
                        s_state.fix_quality = 1U;
                    }
                } else {
                    s_state.last_rmc_ms = 0U;
                }
            } else {
                s_state.last_rmc_ms = 0U;
            }
        }
        kvc_gnss_eval_validity(now_ms);
        return;
    }
}

/* ============================================================================
 * GIAO DIỆN HÀM API NGOÀI
 * ============================================================================ */

/* ============================================================================
 * PHÁT LỆNH UBX XUỐNG MODULE (chỉ dùng cho cấu hình lúc khởi động)
 * ============================================================================ */

#if KVC_GNSS_HAS_SONIX_HW
/* Khai báo trước: kvc_gnss_send_gnss_config() gọi hàm này nhưng nó được định
 * nghĩa sau (gần kvc_gnss_try_baud) để nhóm với phần autobaud. */
static void kvc_gnss_spin_ms(uint32_t ms);

/**
 * @brief Ghi divisor cho UART3 theo UCLK 12 MHz. Yêu cầu DLAB đã = 1.
 *
 * DL = round(UCLK / (16 × baud)). Giá trị thực tế:
 *   9600  -> 78 (0x4E), thực 9615 bps, +0,16 %
 *   38400 -> 20 (0x14), thực 37500 bps, −2,34 %
 *   57600 -> 13 (0x0D), thực 57692 bps, +0,16 %
 *
 * Bảng này chỉ có ba giá trị dùng thật; giá trị khác được tính tại chỗ để
 * không phải bảo trì bảng.
 */
static void kvc_gnss_set_uart3_divisor(uint32_t baud) {
    uint32_t dl;

    if (baud == 0U) {
        return;
    }

    dl = (12000000UL + (8UL * baud)) / (16UL * baud); /* làm tròn */
    if (dl < 1U) {
        dl = 1U;
    }
    if (dl > 0xFFFFUL) {
        dl = 0xFFFFUL;
    }

    SN_UART3->DLL = (uint8_t)(dl & 0xFFU);
    SN_UART3->DLM = (uint8_t)((dl >> 8) & 0xFFU);
}

/**
 * @brief Gửi 1 byte qua UART3, chờ THRE với giới hạn lặp an toàn.
 *
 * Chỉ dùng lúc khởi tạo (chưa có ngắt RX chạy hoặc ngay sau khi cấu hình xong),
 * không gọi trong vòng lặp chính. Có timeout nên không treo được nếu module
 * không phản hồi.
 */
static void kvc_gnss_uart3_tx_byte(uint8_t b) {
    uint32_t timeout = 50000U;
    while (((SN_UART3->LS & (1U << 5)) == 0U) && (--timeout > 0U)) {
        __NOP();
    }
    SN_UART3->TH = b;
}

/**
 * @brief Gửi khung UBX CFG-PRT đặt baud cho module.
 *
 * Module NEO-M10-0-10 xuất xưởng ở 38400, nhưng ở UCLK 12 MHz MCU chỉ chia được
 * 38400 thành 37500 (−2,34 %); cộng IHRC ±2 % thành ~4,34 %, vượt giới hạn
 * 3,125 % của chính MCU. Vì vậy firmware chạy 9600 và gửi lệnh này để đưa module
 * về 9600 MỘT LẦN. Xem kvc_gnss_autobaud() để biết cách xác định baud hiện tại.
 */
static void kvc_gnss_send_baud_change(void) {
    uint8_t frame[KVC_UBX_CFG_PRT_LEN];

    if (!kvc_ubx_build_cfg_prt_baud(KVC_GNSS_BAUD_RATE, frame)) {
        return; /* Không dựng được khung: giữ nguyên tốc độ hiện tại */
    }

    /* Xả FIFO phát trước khi gửi để không lẫn byte cũ. */
    SN_UART3->FIFOCTRL = 0x04; /* TXFIFORST */

    for (uint32_t i = 0U; i < KVC_UBX_CFG_PRT_LEN; i++) {
        kvc_gnss_uart3_tx_byte(frame[i]);
    }

    /* Chờ byte cuối ra hết dây (TRE = bit 6 của LS) trước khi đổi tốc độ,
     * nếu không byte cuối sẽ bị truyền sai tốc độ. */
    uint32_t guard = 200000U;
    while (((SN_UART3->LS & (1U << 6)) == 0U) && (--guard > 0U)) {
        __NOP();
    }
}

/**
 * @brief Gửi khung UBX CFG-GNSS bật 4 chòm sao, rồi lưu vào flash của module.
 *
 * MỤC ĐÍCH: tăng số vệ tinh khả dụng khi bị chắn một phần bầu trời (trong nhà,
 * sát tường, ban công) để cải thiện HDOP. Đo thực tế trên kit: 9 vệ tinh nhưng
 * HDOP 5.60 → sai số ngang ~28 m, không đủ cho georef cứu hộ.
 *
 * Đây là cấu hình **một lần**: `CFG-CFG` lưu vào flash của module, nên các lần
 * khởi động sau không cần gửi lại. Gửi lại cũng vô hại (module ghi đè cùng giá
 * trị) nhưng làm chậm boot ~60 ms.
 *
 * GIỚI HẠN ĐÃ BIẾT:
 *   - Khung được ghép theo chuẩn u-blox, không phải khung mẫu nguyên văn trong
 *     datasheet module (datasheet chỉ có GLONASS/BDS/GPS+BDS/GLO+BDS). Xem
 *     kvc_ubx_cfg.h để biết cách ghép.
 *   - Không kiểm ACK. Nếu module từ chối, triệu chứng là số vệ tinh không tăng
 *     sau khi nạp lại — khi đó thử khung mẫu `GPS+BeiDou` trong datasheet.
 *   - Không xác minh được nếu không có kit; đã kiểm bằng host test (66 assert).
 */
static void kvc_gnss_send_gnss_config(void) {
    uint8_t frame[KVC_UBX_CFG_GNSS_LEN];

    if (!kvc_ubx_get_cfg_gnss_4const(frame)) {
        return;
    }

    /* Xả FIFO phát trước khi gửi để không lẫn byte cũ. */
    SN_UART3->FIFOCTRL = 0x04; /* TXFIFORST */

    for (uint32_t i = 0U; i < KVC_UBX_CFG_GNSS_LEN; i++) {
        kvc_gnss_uart3_tx_byte(frame[i]);
    }

    /* Chờ phát xong trước khi gửi lệnh lưu (CFG-CFG), nếu không lệnh lưu có
     * thể chen vào giữa khung cấu hình và module hiểu sai. */
    uint32_t guard = 200000U;
    while (((SN_UART3->LS & (1U << 6)) == 0U) && (--guard > 0U)) {
        __NOP();
    }
    kvc_gnss_spin_ms(20U);
}

/**
 * @brief Lưu cấu hình hiện tại vào flash của module (UBX CFG-CFG, 4 nhóm).
 *
 * Khung lấy từ datasheet module §10.6 ("保存设置"):
 *   B5 62 06 09 0D 00 00 00 00 00 FF FF 00 00 00 00 00 00 17 31 BF
 *
 * Cần gọi SAU khi đã gửi CFG-GNSS, nếu không cấu hình chỉ nằm trong RAM và mất
 * khi mất nguồn.
 */
static void kvc_gnss_save_config(void) {
    /* Nguyên văn từ datasheet §10.6 — checksum đã có sẵn. */
    static const uint8_t kSaveCfg[21] = {
        0xB5, 0x62, 0x06, 0x09, 0x0D, 0x00, 0x00, 0x00,
        0x00, 0x00, 0xFF, 0xFF, 0x00, 0x00, 0x00, 0x00,
        0x00, 0x00, 0x17, 0x31, 0xBF,
    };

    SN_UART3->FIFOCTRL = 0x04; /* TXFIFORST */
    for (uint32_t i = 0U; i < sizeof(kSaveCfg); i++) {
        kvc_gnss_uart3_tx_byte(kSaveCfg[i]);
    }

    uint32_t guard = 200000U;
    while (((SN_UART3->LS & (1U << 6)) == 0U) && (--guard > 0U)) {
        __NOP();
    }
}

/**
 * @brief Chờ thật `ms` mili-giây và cập nhật time base.
 *
 * VÌ SAO KHÔNG DÙNG kvc_timebase_ms() TRẦN: `kvc_timebase` chỉ tiến khi có ai gọi
 * `kvc_timebase_add_ms()` / `add_us()` — tức chỉ khi `delay_ms()` của main hoặc
 * `kvc_usound_delay_us()` chạy. Trong vòng dò baud, nếu chỉ đọc
 * `kvc_timebase_ms()` mà không chờ thật thì giá trị đó ĐỨNG YÊN, điều kiện
 * `(now - start) < window_ms` luôn đúng và vòng lặp treo vô hạn — đúng sự cố
 * "nạp xong không in gì, LED tắt" đã gặp trên kit.
 *
 * Hàm này vừa tiêu thời gian thật (vòng NOP) vừa báo vào time base, nên đồng hồ
 * dùng chung vẫn nhất quán sau khi thoát.
 *
 * Chỉ dùng lúc khởi tạo (chưa bật ngắt cảm biến). Không gọi trong main loop.
 *
 * GIỚI HẠN: số vòng 3000 là ước lượng cho ~1 ms ở 12 MHz (~4 chu kỳ/vòng NOP).
 * Không phải phép đo; nếu HCLK khác thì cửa sổ dò dài/ngắn theo cùng tỉ lệ, và
 * vẫn bị chặn bởi `max_iter` nên không thể treo.
 */
static void kvc_gnss_spin_ms(uint32_t ms) {
    while (ms-- > 0U) {
        for (volatile uint32_t d = 0U; d < 3000U; d++) {
            __NOP();
        }
        kvc_timebase_add_ms(1U);
    }
}

/**
 * @brief Thử nhận NMEA ở một tốc độ trong khoảng thời gian cho trước.
 *
 * TIÊU CHÍ CHẤP NHẬN (sửa sau khi đo trên kit ngày 26/10/2026):
 *   1. Có ít nhất `min_good` câu NMEA qua checksum, VÀ
 *   2. **Không có byte nào lỗi khung** trong cửa sổ thử.
 *
 * VÌ SAO PHẢI THÊM ĐIỀU KIỆN 2: bản đầu chỉ yêu cầu 2 câu hợp lệ. Trên kit thật,
 * khi module ở 38400 mà MCU chia ra 37500 (sai số −2,34 %, cộng IHRC ±2 % thành
 * −4,3 %), vẫn lọt được 2 câu "may mắn" trong 1200 ms nên autobaud DỪNG LẠI ở
 * 38400 — sai. Log thực tế cho thấy 67 % byte bị lỗi khung và không có fix nào,
 * tức đã chọn nhầm tốc độ. Ở tốc độ đúng, lỗi khung phải bằng 0 tuyệt đối.
 *
 * VÒNG LẶP CÓ HAI CHỐT CHẶN TREO: mỗi vòng chờ thật 1 ms (đồng hồ tiến), và tổng
 * số vòng bị chặn bởi `max_iter` phòng khi đồng hồ có vấn đề.
 *
 * @param baud Tốc độ cần thử.
 * @param window_ms Thời gian chờ tối đa.
 * @param min_good Số câu hợp lệ tối thiểu để coi là đúng baud.
 * @param out_fe Con trỏ nhận số lỗi khung đếm được (có thể NULL).
 * @return true nếu nhận đủ số câu hợp lệ VÀ không có lỗi khung.
 */
static bool kvc_gnss_try_baud(uint32_t baud, uint32_t window_ms,
                              uint32_t min_good, uint32_t *out_fe) {
    if (baud == 0U) {
        return false;
    }

    /* Mở UART3 ở tốc độ cần thử. */
    SN_UART3->LC |= (1U << 7); /* DLAB = 1 */
    kvc_gnss_set_uart3_divisor(baud);
    SN_UART3->LC = 0x03;       /* 8N1, DLAB = 0 */

    /* Xả sạch dữ liệu còn sót của lần thử trước (FIFO phần cứng + ring phần mềm)
     * để không tính nhầm câu của tốc độ khác vào lần thử này. */
    SN_UART3->FIFOCTRL = 0x07;  /* FIFOEN, RXFIFORST, TXFIFORST */
    kvc_ring_reset(&s_rx_ring);
    s_rx_state = STATE_WAIT_START;
    s_rx_len = 0U;
    s_calc_cs = 0U;
    s_recv_cs = 0U;
    s_rx_good_sentence_count = 0U;

    uint32_t fe_count = 0U;
    const uint32_t start = kvc_timebase_ms();
    /* Chốt chặn cứng: window_ms (giả định 1 ms/vòng) cộng biên 50 %. */
    const uint32_t max_iter = (window_ms + (window_ms / 2U)) + 1U;

    for (uint32_t iter = 0U; iter < max_iter; iter++) {
        /* Rút FIFO phần cứng trực tiếp: lúc này chưa bật ngắt nên không có ISR
         * đẩy byte vào ring. Đọc LS trước RB để cờ lỗi khớp byte vừa lấy. */
        uint32_t guard = 0U;
        while (guard++ < 64U) {
            uint32_t ls = SN_UART3->LS;
            if ((ls & 0x01U) == 0U) {
                break;
            }
            if ((ls & 0x08U) != 0U) {
                fe_count++;   /* framing error: dấu hiệu chắc chắn sai tốc độ */
            }
            kvc_gnss_feed_byte((uint8_t)(SN_UART3->RB & 0xFFU),
                               kvc_timebase_ms());
        }

        if (s_rx_good_sentence_count >= min_good) {
            break;
        }
        if ((uint32_t)(kvc_timebase_ms() - start) >= window_ms) {
            break;
        }

        /* Chờ thật 1 ms: vừa cho byte mới kịp tới, vừa làm đồng hồ tiến. */
        kvc_gnss_spin_ms(1U);
    }

    if (out_fe != NULL) {
        *out_fe = fe_count;
    }

    /* Chỉ chấp nhận khi đủ câu hợp lệ VÀ không có lỗi khung nào. */
    return (s_rx_good_sentence_count >= min_good) && (fe_count == 0U);
}

/**
 * @brief Dò tốc độ module đang dùng, rồi đưa module về KVC_GNSS_BAUD_RATE.
 *
 * THỨ TỰ THỬ: ưu tiên tốc độ xuất xưởng (38400) và tốc độ firmware dùng (9600)
 * trước, sau đó tới các tốc độ phổ biến khác mà module hỗ trợ. Danh sách dừng ở
 * tốc độ MCU chia được với sai số chấp nhận (<3,125 %): 4800, 9600, 19200,
 * 38400, 57600. KHÔNG thử 115200 vì tại 12 MHz divisor 7 cho 107143 bps
 * (−6,99 %), vượt giới hạn — dù có tìm ra cũng không giao tiếp ổn định được.
 *
 * Nếu tìm ra tốc độ khác KVC_GNSS_BAUD_RATE, gửi UBX CFG-PRT đổi module về
 * KVC_GNSS_BAUD_RATE và mở lại UART3 ở tốc độ đó. Nếu không tìm ra tốc độ nào,
 * **vẫn mở UART3 ở KVC_GNSS_BAUD_RATE** để firmware chạy như trước (không sập),
 * và để `[RING] GNSS isr=0` báo hiệu cần kiểm tra dây/anten.
 *
 * @return Tốc độ thực sự đang dùng, hoặc 0 nếu không nhận được NMEA ở tốc độ nào.
 */
static uint32_t kvc_gnss_autobaud(void) {
    /* Thứ tự thử: 9600 TRƯỚC vì đó là tốc độ firmware muốn dùng — nếu module đã
     * được đổi từ lần chạy trước thì dừng ngay tại đây, không mất thời gian.
     * Sau đó mới tới các tốc độ khác, ưu tiên 38400 (mặc định xuất xưởng).
     *
     * KHÔNG thử 115200: tại 12 MHz divisor 7 cho 107143 bps (−6,99 %), vượt giới
     * hạn 3,125 % nên dù nhận ra cũng không giao tiếp ổn định được. */
    static const uint32_t kCandidate[] = {9600UL, 38400UL, 19200UL,
                                          57600UL, 4800UL};
    const uint32_t kCandidateCount =
        (uint32_t)(sizeof(kCandidate) / sizeof(kCandidate[0]));

    /* Mỗi tốc độ chờ tối đa 1500 ms (module phát 1 Hz nên đủ thấy 1–2 câu).
     * Xấu nhất 5 × 1500 = 7,5 s — an toàn vì watchdog chưa bật lúc này. */
    const uint32_t kWindowMs = 1500UL;
    const uint32_t kMinGood = 2UL;

    /* LƯỢT 1: tìm tốc độ nhận SẠCH (fe == 0). Đây là tốc độ MCU chia đúng, dùng
     * luôn nếu nó là 9600. */
    for (uint32_t i = 0U; i < kCandidateCount; i++) {
        uint32_t fe = 0U;
        if (!kvc_gnss_try_baud(kCandidate[i], kWindowMs, kMinGood, &fe)) {
            continue;
        }
        if (kCandidate[i] == KVC_GNSS_BAUD_RATE) {
            return KVC_GNSS_BAUD_RATE;
        }

        /* Nhận sạch ở tốc độ khác: đổi module về đích rồi chuyển UART3. */
        kvc_gnss_send_baud_change();
        SN_UART3->LC |= (1U << 7);
        kvc_gnss_set_uart3_divisor(KVC_GNSS_BAUD_RATE);
        SN_UART3->LC = 0x03;
        SN_UART3->FIFOCTRL = 0x07;
        return KVC_GNSS_BAUD_RATE;
    }

    /* LƯỢT 2: không tốc độ nào nhận sạch. Trường hợp thực tế đã gặp trên kit:
     * module xuất xưởng 38400, nhưng tại UCLK 12 MHz MCU chỉ chia được 37500
     * (−2,34 % + IHRC ±2 % ≈ −4,3 %) nên ~67 % byte lỗi khung — KHÔNG BAO GIỜ
     * đạt fe == 0, dù module đúng là đang ở 38400.
     *
     * Nếu bỏ qua bước này, firmware sẽ không bao giờ gửi được lệnh đổi baud và
     * kẹt ở 38400 vĩnh viễn. Vì vậy: chấp nhận "có tín hiệu NMEA" (đủ câu qua
     * checksum) làm bằng chứng module đang ở tốc độ đó, rồi gửi lệnh đổi.
     *
     * Rủi ro: lệnh UBX gửi đi ở 37500 trong khi module đo 38400 — lệch −2,34 %,
     * nằm trong ngưỡng chịu đựng của module nên phần lớn trường hợp vẫn tới.
     * Nếu lần này không ăn, lần khởi động sau module vẫn 38400 và thử lại. */
    for (uint32_t i = 0U; i < kCandidateCount; i++) {
        uint32_t fe = 0U;
        if (!kvc_gnss_try_baud(kCandidate[i], kWindowMs, kMinGood, &fe)) {
            continue;
        }
        if (kCandidate[i] == KVC_GNSS_BAUD_RATE) {
            return KVC_GNSS_BAUD_RATE;   /* đã ở đích, chỉ là còn FE */
        }

        kvc_gnss_send_baud_change();
        SN_UART3->LC |= (1U << 7);
        kvc_gnss_set_uart3_divisor(KVC_GNSS_BAUD_RATE);
        SN_UART3->LC = 0x03;
        SN_UART3->FIFOCTRL = 0x07;
        return KVC_GNSS_BAUD_RATE;
    }

    /* Không nhận được câu NMEA nào ở mọi tốc độ: vẫn mở ở tốc độ đích để hệ
     * thống chạy tiếp; chẩn đoán dựa vào isr/fe trên UART5. */
    SN_UART3->LC |= (1U << 7);
    kvc_gnss_set_uart3_divisor(KVC_GNSS_BAUD_RATE);
    SN_UART3->LC = 0x03;
    SN_UART3->FIFOCTRL = 0x07;
    return 0U;
}
#endif /* KVC_GNSS_HAS_SONIX_HW */

void kvc_gnss_init(void) {
    kvc_gnss_reset();

#if KVC_GNSS_HAS_SONIX_HW
    /* 1. Cấp xung nhịp cho ngoại vi UART3 (APB0CLKG bit 6) và GPIO Port 2 (APB1CLKG bit 19) */
    SN_SCU->APB0CLKG |= (1U << 6);                 /* Bit 6: UART3CLKEN */
    SN_SCU->APB1CLKG |= (1U << 14) | (1U << 19);   /* Bit 19: P2CLKEN (kèm bit 14 dự phòng theo DFP) */

    /* 2. Cấu hình chức năng phụ AFIO trong SN_ALWAYSON->P2_AFIO0 (Offset 0x220, User Manual v1.7 p118-119):
     *    - Chân P2.0: IO0 = 1 -> Chức năng phần cứng UTXD3 (Pin 14 LQFP64 | JP3 Pin 1/2)
     *    - Chân P2.1: IO1 = 1 -> Chức năng phần cứng URXD3 (Pin 15 LQFP64 | JP3 Pin 3/4)
     */
    SN_ALWAYSON->P2_AFIO0 = (SN_ALWAYSON->P2_AFIO0 & ~((0x1FU << 0) | (0x1FU << 5)))
                          | (1U << 0)   /* IO0 = 1: UTXD3 */
                          | (1U << 5);  /* IO1 = 1: URXD3 */

    /* 3-5. Cấu hình 8N1 + FIFO, rồi DÒ TỐC ĐỘ MODULE ĐANG DÙNG.
     *
     * Module NEO-M10-0-10 xuất xưởng 38400, nhưng có thể đã được đổi bằng
     * u-center hoặc bởi lần chạy firmware trước. Vì vậy không giả định tốc độ:
     * kvc_gnss_autobaud() thử lần lượt {38400, 9600, 19200, 57600, 4800}, chọn
     * tốc độ đầu tiên nhận được câu NMEA có checksum đúng, rồi đưa module về
     * KVC_GNSS_BAUD_RATE (9600) để MCU chạy với sai số +0,16 % thay vì −2,34 %.
     *
     * Đây là lời giải cho trường hợp "module ở tốc độ lạ": không cần u-center,
     * không cần biết trước module đang ở đâu (miễn là trong danh sách trên và
     * MCU chia được với sai số <3,125 %).
     */
    SN_UART3->LC |= (1U << 7);    /* DLAB = 1: Cho phép ghi DLL/DLM */
    kvc_gnss_set_uart3_divisor(KVC_GNSS_BAUD_RATE);
    SN_UART3->LC = 0x03;          /* WLS=3 (8-bit), 1 stop, no parity, DLAB=0 */
    SN_UART3->FIFOCTRL = 0x07;    /* FIFOEN, RXFIFORST, TXFIFORST */

    (void)kvc_gnss_autobaud();

    /* 5e. Bật đủ 4 chòm sao (GPS + Galileo + BeiDou + GLONASS) rồi lưu vào flash
     * module. Mục đích: cải thiện HDOP khi bị chắn một phần bầu trời — đo trên
     * kit cho thấy 9 vệ tinh nhưng HDOP 5.60 (~28 m sai số), không đủ cho georef.
     *
     * Chạy SAU autobaud vì phải giao tiếp được với module trước đã. Chỉ tốn
     * ~80 ms mỗi lần boot. Không kiểm ACK — nếu module từ chối thì triệu chứng
     * là số vệ tinh không tăng; xem kvc_gnss_send_gnss_config(). */
    kvc_gnss_send_gnss_config();
    kvc_gnss_save_config();

    /* 6. Khởi tạo ring RX TRƯỚC khi bật ngắt */
    (void)kvc_ring_init(&s_rx_ring, s_rx_ring_buf, (uint16_t)KVC_GNSS_RX_RING_SIZE);
    s_rx_overrun_count = 0U;
    s_rx_framing_count = 0U;
    s_rx_parity_count  = 0U;
    s_rx_isr_count     = 0U;
    s_rx_byte_count    = 0U;

    /* 7. Bật ngắt RX (RDAIE) + ngắt lỗi đường truyền (RLSIE) */
    SN_UART3->IE = (1U << 0) | (1U << 2);

    /* 8. Bật ngắt UART3 trong NVIC (IRQ 52) */
    NVIC_SetPriority(UART3_IRQn, 2U);
    NVIC_ClearPendingIRQ(UART3_IRQn);
    NVIC_EnableIRQ(UART3_IRQn);
#endif
}

#if KVC_GNSS_HAS_SONIX_HW
/**
 * @brief ISR RX UART3 (GNSS -> MCU). Vector: UART3_IRQHandler, IRQ 52.
 *
 * Đọc LS trước rồi RB theo §15.11.1 để cờ FE/PE khớp byte vừa lấy.
 * Không giải mã NMEA trong ISR: chỉ đẩy byte vào ring.
 */
void UART3_IRQHandler(void) {
    uint32_t ls;

    s_rx_isr_count++;

    /* Đọc LS đúng MỘT lần cho mỗi byte. Cờ FE/PE/BI/OE là sticky gắn với byte ở
     * đỉnh RX FIFO (§15.11.13); đọc LS lặp lại cho cùng byte sẽ đếm lỗi trùng,
     * làm `fe` tiến gần bằng `isr` dù dữ liệu đúng. Đã gặp trên kit. */
    for (uint32_t guard = 0U; guard < 64U; guard++) {
        ls = SN_UART3->LS;
        if ((ls & 0x01U) == 0U) {
            break;
        }
        if ((ls & 0x02U) != 0U) {
            s_rx_overrun_count++;
        }
        if ((ls & 0x08U) != 0U) {
            s_rx_framing_count++;
        }
        if ((ls & 0x04U) != 0U) {
            s_rx_parity_count++;
        }
        (void)kvc_ring_push_from_isr(&s_rx_ring, (uint8_t)(SN_UART3->RB & 0xFFU));
        s_rx_byte_count++;
    }

    (void)SN_UART3->LS;
}
#endif

void kvc_gnss_poll(uint32_t now_ms) {
#if KVC_GNSS_HAS_SONIX_HW
    /* KVC-M2: tiêu thụ từ ring, có trần mỗi lượt */
    uint16_t budget = KVC_GNSS_RX_DRAIN_PER_POLL;
    uint8_t b;

    while ((budget > 0U) && kvc_ring_pop(&s_rx_ring, &b)) {
        kvc_gnss_feed_byte(b, now_ms);
        budget--;
    }
#endif
    kvc_gnss_check_expiry(now_ms);
}

#if KVC_GNSS_HAS_SONIX_HW
void kvc_gnss_get_rx_stats(KvcGnssRxStats *out) {
    if (out == NULL) {
        return;
    }
    out->bytes_pending = kvc_ring_count(&s_rx_ring);
    out->ring_dropped  = s_rx_ring.dropped;
    out->overrun_count = s_rx_overrun_count;
    out->framing_count = s_rx_framing_count;
    out->parity_count  = s_rx_parity_count;
    out->isr_count     = s_rx_isr_count;
    out->byte_count    = s_rx_byte_count;
}
#endif

void kvc_gnss_feed_byte(uint8_t b, uint32_t now_ms) {
    char c = (char)b;

    switch (s_rx_state) {
        case STATE_WAIT_START:
            if (c == '$') {
                s_rx_len = 0;
                s_calc_cs = 0;
                s_rx_state = STATE_PAYLOAD;
            }
            break;

        case STATE_PAYLOAD:
            if (c == '$') {
                /* Phục hồi sau câu bị cắt cụt giữa chừng: khởi động lại ngay từ đầu */
                s_rx_len = 0;
                s_calc_cs = 0;
            } else if (c == '*') {
                /* Gặp dấu '*': dừng tính checksum nội dung, chuyển sang nhận mã kiểm tra */
                s_rx_state = STATE_CHECKSUM_H;
            } else if (c == '\r' || c == '\n') {
                /* Câu kết thúc mà không có dấu '*', câu không hợp lệ -> Hủy bỏ */
                s_rx_state = STATE_WAIT_START;
            } else {
                if (s_rx_len < KVC_GNSS_MAX_SENTENCE_LEN) {
                    s_rx_buf[s_rx_len++] = c;
                    s_calc_cs ^= (uint8_t)c;
                } else {
                    /* Tràn bộ đệm câu (vượt 120 bytes) -> Hủy bỏ ngay để bảo vệ bộ nhớ */
                    s_rx_state = STATE_WAIT_START;
                }
            }
            break;

        case STATE_CHECKSUM_H: {
            int8_t nibble = hex_to_nibble(c);
            if (nibble >= 0) {
                s_recv_cs = (uint8_t)((uint8_t)nibble << 4);
                s_rx_state = STATE_CHECKSUM_L;
            } else {
                s_rx_state = STATE_WAIT_START;
            }
            break;
        }

        case STATE_CHECKSUM_L: {
            int8_t nibble = hex_to_nibble(c);
            if (nibble >= 0) {
                s_recv_cs |= (uint8_t)nibble;
                if (s_calc_cs == s_recv_cs) {
                    /* Checksum hoàn toàn khớp: Kết thúc chuỗi và tiến hành giải mã nội dung */
                    s_rx_buf[s_rx_len] = '\0';
                    kvc_gnss_parse_sentence_internal(now_ms);
                    s_rx_state = STATE_WAIT_EOL;
                } else {
                    /* Checksum sai lệch (nhiễu đường truyền UART) -> Hủy bỏ ngay */
                    s_rx_state = STATE_WAIT_START;
                }
            } else {
                s_rx_state = STATE_WAIT_START;
            }
            break;
        }

        case STATE_WAIT_EOL:
            if (c == '\n') {
                s_rx_state = STATE_WAIT_START;
            } else if (c == '$') {
                s_rx_len = 0;
                s_calc_cs = 0;
                s_rx_state = STATE_PAYLOAD;
            }
            break;
    }
}

bool kvc_gnss_feed_sentence(const char *nmea_str, uint32_t now_ms) {
    if (nmea_str == NULL) return false;
    while (*nmea_str != '\0') {
        kvc_gnss_feed_byte((uint8_t)*nmea_str, now_ms);
        nmea_str++;
    }
    /* Đảm bảo hoàn tất nếu chuỗi có ký tự kết dòng */
    kvc_gnss_feed_byte((uint8_t)'\r', now_ms);
    kvc_gnss_feed_byte((uint8_t)'\n', now_ms);
    return true;
}

bool kvc_gnss_is_valid(void) {
    return s_state.valid;
}

bool kvc_gnss_is_3d_fix(void) {
    return s_state.valid &&
           (s_state.fix_mode == KVC_GNSS_REQ_FIX_MODE_3D) &&
           (s_state.satellites_tracked >= KVC_GNSS_MIN_SATS) &&
           (s_state.hdop_centi > 0U && s_state.hdop_centi <= KVC_GNSS_MAX_HDOP_CENTI);
}

const KvcGnssState* kvc_gnss_get_state(void) {
    return &s_state;
}

void kvc_gnss_get_state_copy(KvcGnssState *out_state) {
    if (out_state != NULL) {
        memcpy(out_state, &s_state, sizeof(KvcGnssState));
    }
}

void kvc_gnss_check_expiry(uint32_t now_ms) {
    kvc_gnss_eval_validity(now_ms);
}

void kvc_gnss_reset(void) {
    memset(&s_state, 0, sizeof(KvcGnssState));
    s_state.hdop_centi = 0xFFFFU;
    s_state.hdop_x10 = 0xFFFFU;
    s_rx_state = STATE_WAIT_START;
    s_rx_len = 0;
    s_calc_cs = 0;
    s_recv_cs = 0;
#if KVC_GNSS_HAS_SONIX_HW
    kvc_ring_reset(&s_rx_ring);
#endif
}
