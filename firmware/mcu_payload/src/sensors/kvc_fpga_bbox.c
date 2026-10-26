/**
 * @file kvc_fpga_bbox.c
 * @brief Hiện thực driver thu nhận và giải mã BBox từ FPGA qua UART1 trên MCU Sonix SN34F788.
 *
 * Đối chiếu tài liệu đặc tả chuẩn:
 * - docs/interfaces/IF_FPGA_MCU_UART.md (IF-01)
 * - docs/hardware/wiring/KVC_MASTER_PINOUT_WIRING.md (Mục 3.5: P2.3 URXD1, P2.2 UTXD1)
 *
 * Người phụ trách phân hệ MCU UAV: Nguyễn Tá Duy Phong
 */

#include "kvc_fpga_bbox.h"
#include <string.h>

#if defined(__arm__) || defined(__CC_ARM) || defined(__ARMCC_VERSION) || defined(SN34F780)
#include "SN34F780.h"
#include "kvc_pinout.h"
#define KVC_FPGA_HAS_SONIX_HW 1
#else
#define KVC_FPGA_HAS_SONIX_HW 0
#endif

/* KVC-M2-20261025-001: RX qua ngắt + ring buffer.
 *
 * TRƯỚC: IE = 0x00 và poll đọc thẳng FIFO trong vòng 1 ms. Khi main bị chặn
 * (chờ TxDone LoRa tới 300 ms, hoặc delay khởi tạo), FIFO 16 byte tràn và mất
 * frame. Ở 38400 8N1 (260 us/byte) FIFO đầy trong ~4,2 ms.
 *
 * SAU: ISR UART1 rút cạn FIFO vào ring 2048 byte. Main tiêu thụ ring trong
 * kvc_fpga_bbox_poll(). Ring 2048 byte chứa được 1152 byte của cửa sổ chặn
 * 300 ms ở 38400 bps, còn dư ~1,8x.
 *
 * ISR CHỈ: đọc LS -> ghi nhận OE/PE/FE -> đọc RB -> push ring.
 * ISR KHÔNG: gọi FSM, tính CRC, SPI, delay hay chờ.
 */
#if KVC_FPGA_HAS_SONIX_HW
#include "kvc_uart_ring.h"

/* Kích thước ring và trần drain lấy từ kvc_fpga_bbox.h (một nguồn duy nhất). */

static uint8_t     s_rx_ring_buf[KVC_FPGA_RX_RING_SIZE];
static KvcUartRing s_rx_ring;

/* Counter chẩn đoán. Chỉ tăng trong ISR nên không cần bảo vệ. */
static volatile uint32_t s_rx_overrun_count   = 0U;  /* LS.OE  - FIFO phần cứng tràn */
static volatile uint32_t s_rx_framing_count   = 0U;  /* LS.FE  - sai stop bit */
static volatile uint32_t s_rx_parity_count    = 0U;  /* LS.PE  - sai parity */
static volatile uint32_t s_rx_isr_count       = 0U;  /* số lần vào ISR */
/* Số byte THẬT SỰ lấy ra khỏi RB. Cần để phân biệt "ISR bắn vì có byte" với
 * "ISR bắn vì nhiễu/đường RX float" — xem chẩn đoán UART5. */
static volatile uint32_t s_rx_byte_count      = 0U;
#endif

/* ============================================================================
 * 1. MÁY TRẠNG THÁI GIẢI MÃ (FSM)
 * ============================================================================ */
typedef enum {
    STATE_WAIT_SYNC0 = 0,
    STATE_WAIT_SYNC1,
    STATE_READ_HEADER,
    STATE_READ_PAYLOAD,
    STATE_READ_CRC
} FpgaRxState_t;

static FpgaRxState_t     s_fsm_state = STATE_WAIT_SYNC0;
static uint8_t           s_rx_buf[180];      /* Đệm tối đa 8 + 20*8 + 2 = 170 bytes */
static uint16_t          s_buf_idx   = 0;
static uint16_t          s_expected_len = 0;
static KvcFpgaFrameState s_frame_state;

/* ============================================================================
 * 2. HÀM TÍNH TOÁN CRC-16/CCITT-FALSE
 * Poly: 0x1021, Init: 0xFFFF, RefIn: false, RefOut: false, XorOut: 0x0000
 * ============================================================================ */
static uint16_t kvc_bbox_calc_crc16(const uint8_t *data, size_t length) {
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

/* ============================================================================
 * 3. KHỞI TẠO VÀ ĐẶT LẠI DRIVER
 * ============================================================================ */
void kvc_fpga_bbox_reset(void) {
    s_fsm_state = STATE_WAIT_SYNC0;
    s_buf_idx = 0;
    s_expected_len = 0;
    memset(&s_frame_state, 0, sizeof(s_frame_state));
    s_frame_state.valid = false;
#if KVC_FPGA_HAS_SONIX_HW
    kvc_ring_reset(&s_rx_ring);
#endif
}

void kvc_fpga_bbox_init(void) {
    kvc_fpga_bbox_reset();

#if KVC_FPGA_HAS_SONIX_HW
    /* 1. Cấp xung nhịp ngoại vi UART1 (APB0CLKG bit 4) và GPIO Port 2 (APB1CLKG bit 19) */
    SN_SCU->APB0CLKG |= (1U << 4);                 /* Bit 4: UART1CLKEN */
    SN_SCU->APB1CLKG |= (1U << 14) | (1U << 19);   /* Bit 19: P2CLKEN (kèm bit 14 dự phòng theo DFP) */

    /* 2. Cấu hình chức năng phụ AFIO trong SN_ALWAYSON->P2_AFIO0:
     *    - Chân P2.2: IO2 = 1 -> Chức năng phần cứng UTXD1 (Pin 16 LQFP64 | JP3 Pin 5/6)
     *    - Chân P2.3: IO3 = 1 -> Chức năng phần cứng URXD1 (Pin 17 LQFP64 | JP3 Pin 7/8)
     */
    SN_ALWAYSON->P2_AFIO0 = (SN_ALWAYSON->P2_AFIO0 & ~((0x1FU << 10) | (0x1FU << 15)))
                          | (1U << 10)  /* IO2 = 1: UTXD1 */
                          | (1U << 15); /* IO3 = 1: URXD1 */

    /* 3. Cài đặt Baudrate trên SN_UART1 (Xung nhịp UCLK = 12 MHz):
     *    Bật DLAB (bit 7 LC) để truy cập DLL và DLM */
    SN_UART1->LC |= (1U << 7);
    SN_UART1->DLL = KVC_FPGA_UART_DLL;
    SN_UART1->DLM = 0x00;

    /* 4. Cấu hình khung truyền 8N1 (8 bit dữ liệu, 1 stop bit, không parity) và trả DLAB = 0 */
    SN_UART1->LC = 0x03;          /* WLS = 3 (8-bit), SBS = 0 (1 stop bit), PE = 0 (no parity) */

    /* 5. Kích hoạt và thiết lập lại bộ đệm FIFO 16-byte phần cứng */
    SN_UART1->FIFOCTRL = 0x07;    /* FIFOEN = 1, RXFIFORST = 1, TXFIFORST = 1 */

    /* 6. Khởi tạo ring RX TRƯỚC khi bật ngắt (ISR sẽ push vào ring này) */
    (void)kvc_ring_init(&s_rx_ring, s_rx_ring_buf, (uint16_t)KVC_FPGA_RX_RING_SIZE);
    s_rx_overrun_count = 0U;
    s_rx_framing_count = 0U;
    s_rx_parity_count  = 0U;
    s_rx_isr_count     = 0U;
    s_rx_byte_count    = 0U;

    /* 7. Bật ngắt RX (RDAIE) + ngắt lỗi đường truyền (RLSIE).
     *    Không bật THREIE: driver không dùng ngắt TX. */
    SN_UART1->IE = (1U << 0) | (1U << 2);

    /* 8. Bật ngắt UART1 trong NVIC (IRQ 38). Độ ưu tiên trung bình để không
     *    chèn lên các ngắt an toàn cao hơn nếu sau này có thêm. */
    NVIC_SetPriority(UART1_IRQn, 2U);
    NVIC_ClearPendingIRQ(UART1_IRQn);
    NVIC_EnableIRQ(UART1_IRQn);
#endif
}

#if KVC_FPGA_HAS_SONIX_HW
/**
 * @brief ISR RX UART1 (FPGA -> MCU). Vector: UART1_IRQHandler, IRQ 38.
 *
 * Thứ tự đọc BẮT BUỘC theo User Manual SN34F780 V1.7 §15.11.1: đọc LS TRƯỚC
 * rồi mới đọc RB, để các cờ FE/PE/BI khớp với đúng byte vừa lấy ra.
 *
 * Không gọi FSM/CRC ở đây: chỉ chuyển byte vào ring để ISR ngắn nhất.
 */
void UART1_IRQHandler(void) {
    uint32_t ls;

    s_rx_isr_count++;

    /* Rút cạn FIFO. Điều kiện dừng là RDR = 0 (bit 0).
     *
     * Đọc LS đúng MỘT lần cho mỗi byte: cờ FE/PE ở LS là sticky gắn với byte ở
     * đỉnh RX FIFO (§15.11.13), nên đọc lặp cho cùng byte sẽ đếm lỗi trùng và
     * làm `fe` tiến gần bằng `isr`. Vòng lặp có trần để sự cố clock/AFIO không
     * treo ISR. */
    for (uint32_t guard = 0U; guard < 64U; guard++) {
        ls = SN_UART1->LS;
        if ((ls & 0x01U) == 0U) {          /* RDR = 0: không còn byte */
            break;
        }
        if ((ls & 0x02U) != 0U) {          /* OE: FIFO phần cứng đã tràn */
            s_rx_overrun_count++;
        }
        if ((ls & 0x08U) != 0U) {          /* FE: framing error */
            s_rx_framing_count++;
        }
        if ((ls & 0x04U) != 0U) {          /* PE: parity error */
            s_rx_parity_count++;
        }
        (void)kvc_ring_push_from_isr(&s_rx_ring, (uint8_t)(SN_UART1->RB & 0xFFU));
        s_rx_byte_count++;
    }

    /* Xoá cờ ngắt đang treo (RLS/RDA) bằng cách đọc LS thêm lần nữa. */
    (void)SN_UART1->LS;
}
#endif

/* ============================================================================
 * 4. XỬ LÝ DỮ LIỆU TỪNG BYTE (FSM)
 * ============================================================================ */
void kvc_fpga_bbox_feed_byte(uint8_t b, uint32_t now_ms) {
    switch (s_fsm_state) {
        case STATE_WAIT_SYNC0:
            if (b == KVC_FPGA_SYNC0) {
                s_rx_buf[0] = b;
                s_buf_idx = 1;
                s_fsm_state = STATE_WAIT_SYNC1;
            }
            break;

        case STATE_WAIT_SYNC1:
            if (b == KVC_FPGA_SYNC1) {
                s_rx_buf[1] = b;
                s_buf_idx = 2;
                s_fsm_state = STATE_READ_HEADER;
            } else if (b == KVC_FPGA_SYNC0) {
                /* Giữ nguyên chờ Sync1 nếu nhận lại Sync0 liên tiếp */
                s_buf_idx = 1;
            } else {
                s_fsm_state = STATE_WAIT_SYNC0;
            }
            break;

        case STATE_READ_HEADER:
            s_rx_buf[s_buf_idx++] = b;
            /* Header có tổng cộng 8 byte:
             * Byte 0..1: Sync (0x5A 0xA5)
             * Byte 2:    Version (0x01)
             * Byte 3:    Candidate Count N (0..20)
             * Byte 4..7: Timestamp uint32 Little-Endian
             */
            if (s_buf_idx == 8) {
                uint8_t ver = s_rx_buf[2];
                uint8_t count = s_rx_buf[3];

                if (ver != KVC_FPGA_VERSION || count > KVC_FPGA_MAX_CANDIDATES) {
                    /* Sai version hoặc số mục tiêu vượt quá ngưỡng an toàn -> hủy frame */
                    s_fsm_state = STATE_WAIT_SYNC0;
                } else {
                    /* Tính độ dài toàn bộ gói gồm: 8B Header + N * 8B BBox + 2B CRC */
                    s_expected_len = 8U + ((uint16_t)count * 8U) + 2U;
                    if (count == 0) {
                        /* Không có mục tiêu -> nhảy thẳng tới đọc 2 byte CRC */
                        s_fsm_state = STATE_READ_CRC;
                    } else {
                        s_fsm_state = STATE_READ_PAYLOAD;
                    }
                }
            }
            break;

        case STATE_READ_PAYLOAD:
            s_rx_buf[s_buf_idx++] = b;
            if (s_buf_idx == (s_expected_len - 2U)) {
                s_fsm_state = STATE_READ_CRC;
            }
            break;

        case STATE_READ_CRC:
            s_rx_buf[s_buf_idx++] = b;
            if (s_buf_idx == s_expected_len) {
                /* Đã nhận đủ toàn bộ frame! Kiểm tra mã CRC-16 */
                uint16_t received_crc = (uint16_t)s_rx_buf[s_expected_len - 2U] |
                                       ((uint16_t)s_rx_buf[s_expected_len - 1U] << 8);

                uint16_t calculated_crc = kvc_bbox_calc_crc16(s_rx_buf, (size_t)(s_expected_len - 2U));

                if (calculated_crc == received_crc) {
                    /* CRC HỢP LỆ: Trích xuất dữ liệu an toàn */
                    s_frame_state.candidate_count = s_rx_buf[3];
                    s_frame_state.timestamp_ms = (uint32_t)s_rx_buf[4] |
                                                ((uint32_t)s_rx_buf[5] << 8) |
                                                ((uint32_t)s_rx_buf[6] << 16) |
                                                ((uint32_t)s_rx_buf[7] << 24);

                    for (uint8_t i = 0; i < s_frame_state.candidate_count; i++) {
                        const uint8_t *p = &s_rx_buf[8U + (uint16_t)i * 8U];
                        s_frame_state.targets[i].x_center   = (uint16_t)p[0] | ((uint16_t)p[1] << 8);
                        s_frame_state.targets[i].y_center   = (uint16_t)p[2] | ((uint16_t)p[3] << 8);
                        s_frame_state.targets[i].width      = p[4];
                        s_frame_state.targets[i].height     = p[5];
                        s_frame_state.targets[i].class_id   = p[6];
                        s_frame_state.targets[i].confidence = p[7];
                    }

                    s_frame_state.valid = true;
                    s_frame_state.last_rx_ms = now_ms;
                    s_frame_state.rx_frame_count++;
                } else {
                    /* Lỗi CRC */
                    s_frame_state.crc_err_count++;
                }

                /* Quay về chờ frame mới */
                s_fsm_state = STATE_WAIT_SYNC0;
            }
            break;

        default:
            s_fsm_state = STATE_WAIT_SYNC0;
            break;
    }
}

/* ============================================================================
 * 5. POLLING VÀ CÁC HÀM TRUY VẤN DỮ LIỆU
 * ============================================================================ */
void kvc_fpga_bbox_poll(uint32_t now_ms) {
#if KVC_FPGA_HAS_SONIX_HW
    /* KVC-M2: tiêu thụ từ ring (ISR đã rút FIFO phần cứng). Có trần mỗi lượt
     * để sau một cửa sổ chặn dài (TX LoRa tới 300 ms) không dành cả một nhịp
     * poll để xử lý 1000+ byte tích luỹ. */
    uint16_t budget = KVC_FPGA_RX_DRAIN_PER_POLL;
    uint8_t b;

    while ((budget > 0U) && kvc_ring_pop(&s_rx_ring, &b)) {
        kvc_fpga_bbox_feed_byte(b, now_ms);
        budget--;
    }
#endif
    kvc_fpga_bbox_check_expiry(now_ms);
}

#if KVC_FPGA_HAS_SONIX_HW
void kvc_fpga_bbox_get_rx_stats(KvcBBoxRxStats *out) {
    if (out == NULL) {
        return;
    }
    out->bytes_pending   = kvc_ring_count(&s_rx_ring);
    out->ring_dropped    = s_rx_ring.dropped;
    out->overrun_count   = s_rx_overrun_count;
    out->framing_count   = s_rx_framing_count;
    out->parity_count    = s_rx_parity_count;
    out->isr_count       = s_rx_isr_count;
    out->byte_count      = s_rx_byte_count;
}
#endif

void kvc_fpga_bbox_check_expiry(uint32_t now_ms) {
    if (s_frame_state.valid) {
        if ((now_ms - s_frame_state.last_rx_ms) > KVC_FPGA_TIMEOUT_MS) {
            s_frame_state.valid = false;
        }
    }
}

bool kvc_fpga_bbox_is_valid(void) {
    return s_frame_state.valid;
}

const KvcFpgaFrameState* kvc_fpga_bbox_get_state(void) {
    return &s_frame_state;
}

const KvcFpgaBBoxItem* kvc_fpga_bbox_get_primary_target(void) {
    if (!s_frame_state.valid || s_frame_state.candidate_count == 0) {
        return NULL;
    }

    /* Tìm mục tiêu có độ tin cậy cao nhất */
    uint8_t best_idx = 0;
    uint8_t max_conf = s_frame_state.targets[0].confidence;

    for (uint8_t i = 1; i < s_frame_state.candidate_count; i++) {
        if (s_frame_state.targets[i].confidence > max_conf) {
            max_conf = s_frame_state.targets[i].confidence;
            best_idx = i;
        }
    }

    return &s_frame_state.targets[best_idx];
}
