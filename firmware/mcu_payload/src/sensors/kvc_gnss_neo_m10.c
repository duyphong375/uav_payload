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

    /* Nếu có câu GSA, kiểm tra không bị rơi vào Mode 1 (No Fix) */
    bool gsa_ok = !fresh_gsa || (s_state.fix_mode >= KVC_GNSS_REQ_FIX_MODE);

    /* Số lượng vệ tinh: Nếu có GGA, yêu cầu >= MIN_SATS (4); nếu chỉ có RMC thì cho qua */
    bool sats_ok = (!fresh_gga) || (s_state.satellites_tracked >= KVC_GNSS_MIN_SATS);

    /* Sai số hình học HDOP: Nếu có thông số, yêu cầu <= MAX_HDOP_CENTI (5.00) */
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

    /* 3. Cài đặt Baudrate (mặc định 38400 bps) trên SN_UART3 (Xung nhịp UCLK = 12 MHz):
     *    Với 38400 bps: Divisor = 12000000 / (16 * 38400) = 19.53 ≈ 20 = 0x0014
     *    Tốc độ thực tế: 37500 bps (sai số -2.34%, nằm hoàn toàn trong dải an toàn ±3% của UART)
     */
    SN_UART3->LC |= (1U << 7);    /* DLAB = 1: Cho phép ghi DLL/DLM */
#if (KVC_GNSS_BAUD_RATE == 38400UL)
    SN_UART3->DLL = 0x14;         /* DLL = 20 (0x14) cho 38400 bps */
    SN_UART3->DLM = 0x00;         /* DLM = 0 */
#else
    SN_UART3->DLL = 0x4E;         /* DLL = 78 (0x4E) cho 9600 bps */
    SN_UART3->DLM = 0x00;         /* DLM = 0 */
#endif

    /* 4. Cấu hình khung 8N1 (8 bit dữ liệu, 1 stop bit, không parity) và trả DLAB = 0 */
    SN_UART3->LC = 0x03;          /* WLS = 3 (8-bit), SBS = 0 (1 stop bit), PE = 0 (no parity), DLAB = 0 */

    /* 5. Kích hoạt và thiết lập lại bộ đệm FIFO 16-byte phần cứng */
    SN_UART3->FIFOCTRL = 0x07;    /* FIFOEN = 1, RXFIFORST = 1, TXFIFORST = 1 */

    /* 6. Khởi tạo ring RX TRƯỚC khi bật ngắt */
    (void)kvc_ring_init(&s_rx_ring, s_rx_ring_buf, (uint16_t)KVC_GNSS_RX_RING_SIZE);
    s_rx_overrun_count = 0U;
    s_rx_framing_count = 0U;
    s_rx_parity_count  = 0U;
    s_rx_isr_count     = 0U;

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
           (s_state.fix_mode == 3U) &&
           (s_state.satellites_tracked >= 5U) &&
           (s_state.hdop_centi > 0U && s_state.hdop_centi <= 250U);
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
