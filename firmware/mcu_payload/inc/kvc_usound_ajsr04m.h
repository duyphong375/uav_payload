/**
 * @file kvc_usound_ajsr04m.h
 * @brief Driver UART 9600 8N1 cho cảm biến siêu âm chống nước **AJ-SR04M**
 *        (board xanh có pad chọn mode `R19`) trên MCU Sonix SN34F788.
 *
 * PHẦN CỨNG NGƯỜI DÙNG ĐANG DÙNG (chốt 26/10/2026):
 * - Board: AJ-SR04M (không phải JSN-SR04T-2.0 — xem cảnh báo cuối file).
 * - Đã hàn **47 kΩ tại pad `R19`** -> chế độ **Mode 4 (Serial Trigger)**.
 *   Mode 4: module ngủ, chỉ đo khi nhận byte `0x01` trên chân RX, rồi phát
 *   đúng 1 khung 4 byte ra TX và quay lại ngủ. Tiêu thụ 20 µA khi chờ.
 * - Cầu phân áp trên đường TX (5 V -> 3.3 V): **1 kΩ nối tiếp, 2 kΩ xuống GND**
 *   -> V_out = 5 × 2/(1+2) = **3,33 V**, an toàn cho GPIO Sonix.
 *
 * Sơ đồ chân theo docs/hardware/wiring/KVC_MASTER_PINOUT_WIRING.md (Mục 3.2):
 * - VCC  -> 5.0 V (Buck DC-DC ngoài; KHÔNG cấp 3.3 V, module cần 5 V cho mạch áp cao)
 * - GND  -> VSS / GND chung toàn hệ thống
 * - TX cảm biến (5 V TTL) -> cầu phân áp 1 kΩ / 2 kΩ -> P2.15 (URXD2, Pin 31)
 * - RX cảm biến (nhận 3.3 V)                            -> P2.14 (UTXD2, Pin 30)
 *
 * Đặc tả khung 4 byte (Mode 3 và Mode 4 dùng chung định dạng):
 * - Byte 0: `0xFF` — header
 * - Byte 1: `Data_H` — byte cao của khoảng cách, đơn vị **mm**
 * - Byte 2: `Data_L` — byte thấp
 * - Byte 3: `Checksum = (0xFF + Data_H + Data_L) & 0xFF`
 * Distance_mm = (Data_H << 8) | Data_L; Distance_cm = Distance_mm / 10.
 *
 * CƠ SỞ CÔNG THỨC CHECKSUM: hai tài liệu hãng mâu thuẫn nhau (xem
 * docs/hardware/sensors/SENSOR_PACKAGES.md §1.1). Bản Anji viết công thức
 * `H + L` nhưng ví dụ khung của chính nó là `FF 07 A1 A7`, và chỉ công thức
 * cộng thêm 0xFF mới cho ra `0xA7`. Firmware bám theo khung mẫu.
 * **Chưa xác minh trên kit** — nếu khung thật không khớp, `s_usound_last_err`
 * sẽ là `KVC_USOUND_ERR_CHECKSUM` (2) và đây là chỗ cần xem lại đầu tiên.
 *
 * Người phụ trách: Nguyễn Tá Duy Phong
 */

#ifndef KVC_USOUND_AJSR04M_H
#define KVC_USOUND_AJSR04M_H

#include <stdint.h>
#include <stdbool.h>
#include "SN34F780.h"
#include "kvc_pinout.h"
#include "kvc_uart_ring.h"

/* KVC-F6b: driver này báo thời gian chờ vào time base dùng chung, nên mọi
 * target/host test có gọi kvc_usound_delay_us() phải link thêm
 * firmware/mcu_payload/src/kvc_timebase.c. */
#include "kvc_timebase.h"

#ifdef __cplusplus
extern "C" {
#endif

/* ============================================================================
 * 1. CÁC HẰNG SỐ ĐẶC TẢ CẢM BIẾN VÀ MÃ TRẠNG THÁI
 * ============================================================================ */
#define KVC_USOUND_MIN_RANGE_CM       20U     /* Vùng mù dưới 20 cm */
#define KVC_USOUND_MAX_RANGE_CM       500U    /* Trần đo tin cậy phục vụ tải UAV cứu nạn */
#define KVC_USOUND_TIMEOUT_MS         150U    /* Timeout tối đa 150 ms chờ phản hồi khung */

/* Mã trạng thái đo đạc */
#define KVC_USOUND_OK                 0U      /* Đo cự ly thành công, nằm trong dải tin cậy 20–500 cm */
#define KVC_USOUND_ERR_TIMEOUT        1U      /* Quá timeout không nhận đủ 4 byte hợp lệ */
#define KVC_USOUND_ERR_CHECKSUM       2U      /* Mã Checksum khung dữ liệu 4 byte không khớp */
#define KVC_USOUND_ERR_OUT_OF_RANGE   3U      /* Cự ly vượt trần 500 cm hoặc cảm biến báo mã 6000 mm (No Echo) */
#define KVC_USOUND_ERR_BLIND_ZONE     4U      /* Vật cản nằm trong vùng mù dưới 20 cm */

/* ============================================================================
 * 2. HÀM TRỄ VI GIÂY (MICROSECOND) BẰNG VÒNG LẶP LỆNH CHUẨN XÁC, AN TOÀN TUYỆT ĐỐI
 * ============================================================================ */
static inline void kvc_usound_delay_us(uint32_t us) {
    /* Xung nhịp 12 MHz: 1 µs tương đương 12 chu kỳ clock CPU Cortex-M4.
     * Vòng lặp decrement volatile tốn khoảng 3-4 chu kỳ -> nhân hệ số 4.
     * Tuyệt đối không dùng DWT CYCCNT để tránh bị treo khi MCU chạy standalone không cắm mạch nạp.
     *
     * KVC-F6b: thời gian chờ này PHẢI được báo vào time base dùng chung, nếu
     * không thì mỗi lần đo siêu âm (tới 100 ms) sẽ mất khỏi timestamp_ms và
     * time base chạy chậm ~9-10 % so với thời gian thật.
     */
    volatile uint32_t count = us * 4U;
    while (count > 0U) {
        count--;
        __NOP();
    }
    kvc_timebase_add_us(us);
}

/* ============================================================================
 * 3. HÀM PHÁT 1 BYTE QUA NGOẠI VI UART2 (P2.14 - UTXD2)
 * ============================================================================ */
static inline void kvc_usound_uart_tx_byte(uint8_t b) {
    /* Chờ đệm phát sẵn sàng (THRE = 1 trong LS) với giới hạn lặp an toàn */
    uint32_t timeout = 50000U;
    while (((SN_UART2->LS & (1U << 5)) == 0) && (--timeout > 0)) {
        __NOP();
    }
    SN_UART2->TH = b;
}

/* ============================================================================
 * 4. HÀM KHỞI TẠO PHẦN CỨNG UART2 VÀ AFIO CHO SONIX SN34F788
 * ============================================================================ */

/* KVC-M2-20261025-001: RX qua ngắt + ring buffer.
 *
 * TRƯỚC: IE = 0x00, poll đọc thẳng FIFO. Khi main chờ TxDone LoRa (tới 300 ms)
 * FIFO 16 byte tràn -> mất khung 4 byte của AJ-SR04M, mất mẫu đo.
 * SAU: ISR UART2 rút FIFO vào ring; kvc_usound_poll() tiêu thụ ring.
 *
 * Định cỡ: cửa sổ KHÔNG-CONSUMER dài nhất ~740 ms (usound robust 340 ms + LoRa
 * 360 ms). Riêng UART2 không bị chặn bởi chính usound_measure vì hàm đó có đọc
 * ring; nhưng vẫn có thể bị chặn bởi LoRa. 9600 8N1 = 960 byte/s x 0,74 = 711
 * byte -> ring 1024 byte (biên 1,44x).
 */
#define KVC_USOUND_RX_RING_SIZE    1024U   /* luỹ thừa của 2 */
#define KVC_USOUND_RX_DRAIN_PER_POLL 128U

static uint8_t     s_usound_rx_ring_buf[KVC_USOUND_RX_RING_SIZE];
static KvcUartRing s_usound_rx_ring;

static volatile uint32_t s_usound_rx_overrun_count = 0U;  /* LS.OE */
static volatile uint32_t s_usound_rx_framing_count = 0U;  /* LS.FE */
static volatile uint32_t s_usound_rx_isr_count     = 0U;
/* Số byte THẬT SỰ lấy ra khỏi RB (bằng số byte vào ring nếu ring không tràn).
 * Cần để phân biệt "ISR bắn nhiều vì có byte" với "ISR bắn nhiều vì nhiễu trên
 * đường RX khi module nghỉ" — xem chẩn đoán UART5. */
static volatile uint32_t s_usound_rx_byte_count    = 0U;

static inline void kvc_usound_init(void) {
    /* 1. Cấp xung nhịp cho khối UART2 (APB0CLKG bit 5) và GPIO Port 2 (APB1CLKG bit 19) */
    SN_SCU->APB0CLKG |= (1U << 5);                 /* Bit 5: UART2CLKEN */
    SN_SCU->APB1CLKG |= (1U << 14) | (1U << 19);   /* Bit 19: P2CLKEN (kèm bit 14 dự phòng theo đặc tả) */

    /* 2. Cấu hình chức năng phụ AFIO trong SN_ALWAYSON->P2_AFIO2 (User Manual v1.7 trang 121 & 169):
     *    - Chân P2.14: IO14 = 1 -> Chức năng phần cứng UTXD2 (Pin 30 LQFP64)
     *    - Chân P2.15: IO15 = 1 -> Chức năng phần cứng URXD2 (Pin 31 LQFP64)
     */
    SN_ALWAYSON->P2_AFIO2 = (SN_ALWAYSON->P2_AFIO2 & ~((0x1FU << 10) | (0x1FU << 15)))
                          | (1U << 10)   /* IO14 = 1: UTXD2 */
                          | (1U << 15);  /* IO15 = 1: URXD2 */

    /* 3. Cài đặt Baudrate 9600 bps trên SN_UART2 (Xung nhịp UCLK = 12 MHz):
     *    Divisor = 12000000 / (16 * 9600) = 78 = 0x004E
     */
    SN_UART2->LC |= (1U << 7);    /* DLAB = 1: Cho phép ghi DLL/DLM */
    SN_UART2->DLL = 0x4E;         /* DLL = 78 (0x4E) */
    SN_UART2->DLM = 0x00;         /* DLM = 0 */

    /* 4. Cấu hình khung 8N1 (8 bit dữ liệu, 1 stop bit, không parity) và trả DLAB = 0 */
    SN_UART2->LC = 0x03;          /* WLS = 3 (8-bit), SBS = 0 (1 stop bit), PE = 0 (no parity), DLAB = 0 */

    /* 5. Kích hoạt và thiết lập lại bộ đệm FIFO 16-byte */
    SN_UART2->FIFOCTRL = 0x07;    /* FIFOEN = 1, RXFIFORST = 1, TXFIFORST = 1 */

    /* 6. Khởi tạo ring RX TRƯỚC khi bật ngắt */
    (void)kvc_ring_init(&s_usound_rx_ring, s_usound_rx_ring_buf,
                        (uint16_t)KVC_USOUND_RX_RING_SIZE);
    s_usound_rx_overrun_count = 0U;
    s_usound_rx_framing_count = 0U;
    s_usound_rx_isr_count     = 0U;
    s_usound_rx_byte_count    = 0U;

    /* 7. Bật ngắt RX (RDAIE) + ngắt lỗi đường truyền (RLSIE) */
    SN_UART2->IE = (1U << 0) | (1U << 2);

    /* 8. Bật ngắt UART2 trong NVIC (IRQ 39) */
    NVIC_SetPriority(UART2_IRQn, 2U);
    NVIC_ClearPendingIRQ(UART2_IRQn);
    NVIC_EnableIRQ(UART2_IRQn);
}

/**
 * @brief ISR RX UART2 (siêu âm -> MCU). Vector: UART2_IRQHandler, IRQ 39.
 *
 * Không phải static inline: phải là ký hiệu ngoài đúng tên vector để override
 * handler WEAK trong startup_SN34F780.s. Toàn bộ driver UART2 là header-only
 * và chỉ được include bởi đúng một translation unit (main.c), nên định nghĩa ở
 * đây không gây trùng ký hiệu.
 *
 * Đọc LS trước rồi RB theo §15.11.1; chỉ đẩy byte vào ring.
 */
static inline void kvc_usound_uart2_isr(void) {
    uint32_t ls;

    s_usound_rx_isr_count++;

    /* ĐỌC LS ĐÚNG MỘT LẦN CHO MỖI BYTE.
     *
     * Cờ FE/PE/BI/OE trong LS là **sticky gắn với byte ở đỉnh RX FIFO** và chỉ
     * được xoá khi đọc LS kế tiếp (§15.11.13). Vòng lặp cũ đọc LS ở đầu mỗi
     * lượt, nên nếu luồng ngắt bắn lại khi FIFO còn byte đó, cùng một byte bị
     * đếm lỗi hai lần — làm `fe` tiến gần bằng `isr` dù dữ liệu vẫn đúng.
     *
     * Nay mỗi lượt: đọc LS một lần, nếu có byte thì đếm lỗi + lấy RB + đếm byte,
     * rồi mới sang lượt sau. Nhờ vậy `fe` và `bytes` phản ánh đúng số byte.
     */
    for (uint32_t guard = 0U; guard < 64U; guard++) {
        ls = SN_UART2->LS;
        if ((ls & 0x01U) == 0U) {
            break;
        }
        if ((ls & 0x02U) != 0U) {
            s_usound_rx_overrun_count++;
        }
        if ((ls & 0x08U) != 0U) {
            s_usound_rx_framing_count++;
        }
        (void)kvc_ring_push_from_isr(&s_usound_rx_ring, (uint8_t)(SN_UART2->RB & 0xFFU));
        s_usound_rx_byte_count++;
    }

    (void)SN_UART2->LS;
}

/* ============================================================================
 * 5. MÁY TRẠNG THÁI GIẢI MÃ LIÊN TỤC VÀ HÀM POLLING KHÔNG CHẶN (ZERO LATENCY)
 * ============================================================================ */
typedef enum {
    KVC_USOUND_STATE_HEADER = 0,
    KVC_USOUND_STATE_DATA_H,
    KVC_USOUND_STATE_DATA_L,
    KVC_USOUND_STATE_CHECKSUM
} KvcUsoundRxState;

static KvcUsoundRxState s_usound_rx_state       = KVC_USOUND_STATE_HEADER;
static uint8_t          s_usound_data_h          = 0;
static uint8_t          s_usound_data_l          = 0;
static uint16_t         s_usound_latest_mm       = 0;
static uint16_t         s_usound_latest_cm       = 0;
static bool             s_usound_has_fresh_data  = false;
static uint8_t          s_usound_last_err        = KVC_USOUND_ERR_TIMEOUT;
static uint32_t         s_usound_poll_count      = 0;
static uint32_t         s_usound_last_rx_tick    = 0;

/**
 * @brief Nạp và giải mã từng byte từ UART2 theo máy trạng thái.
 */
static inline void kvc_usound_feed_byte(uint8_t b) {
    switch (s_usound_rx_state) {
        case KVC_USOUND_STATE_HEADER:
            if (b == 0xFF) {
                s_usound_rx_state = KVC_USOUND_STATE_DATA_H;
            }
            break;

        case KVC_USOUND_STATE_DATA_H:
            s_usound_data_h = b;
            s_usound_rx_state = KVC_USOUND_STATE_DATA_L;
            break;

        case KVC_USOUND_STATE_DATA_L:
            s_usound_data_l = b;
            s_usound_rx_state = KVC_USOUND_STATE_CHECKSUM;
            break;

        case KVC_USOUND_STATE_CHECKSUM: {
            uint8_t checksum = b;
            uint8_t expected_cs = (uint8_t)((0xFFU + (uint16_t)s_usound_data_h + (uint16_t)s_usound_data_l) & 0xFFU);
            if (checksum == expected_cs) {
                uint32_t calc_mm = ((uint32_t)s_usound_data_h << 8) | (uint32_t)s_usound_data_l;
                uint32_t calc_cm = calc_mm / 10UL;

                /* Xử lý mã hết tầm 6000 mm (No Echo) hoặc vượt ngưỡng tối đa 500 cm */
                if (calc_cm >= 600U || calc_cm > KVC_USOUND_MAX_RANGE_CM) {
                    s_usound_latest_mm = 0;
                    s_usound_latest_cm = 0;
                    s_usound_has_fresh_data = false;
                    s_usound_last_err = KVC_USOUND_ERR_OUT_OF_RANGE;
                } else if (calc_cm < KVC_USOUND_MIN_RANGE_CM) {
                    s_usound_latest_mm = 0;
                    s_usound_latest_cm = 0;
                    s_usound_has_fresh_data = false;
                    s_usound_last_err = KVC_USOUND_ERR_BLIND_ZONE;
                } else {
                    s_usound_latest_mm = (uint16_t)calc_mm;
                    s_usound_latest_cm = (uint16_t)calc_cm;
                    s_usound_has_fresh_data = true;
                    s_usound_last_err = KVC_USOUND_OK;
                    s_usound_last_rx_tick = s_usound_poll_count;
                }
            } else {
                s_usound_last_err = KVC_USOUND_ERR_CHECKSUM;
            }
            /* Nếu byte hiện tại là 0xFF, khóa ngay làm Header của khung kế tiếp */
            s_usound_rx_state = (b == 0xFF) ? KVC_USOUND_STATE_DATA_H : KVC_USOUND_STATE_HEADER;
            break;
        }
    }
}

/**
 * @brief Đọc cạn toàn bộ byte trong bộ đệm nhận FIFO UART2 (Polling không chặn).
 *        Cần gọi đều đặn trong vòng lặp 1ms để giữ bộ đệm luôn rỗng và bắt gói tin mới nhất.
 */
static inline void kvc_usound_poll(void) {    s_usound_poll_count++;

    /* KVC-M2: tiêu thụ từ ring (ISR đã rút FIFO phần cứng). Có trần mỗi lượt. */
    uint16_t budget = KVC_USOUND_RX_DRAIN_PER_POLL;
    uint8_t b;
    while ((budget > 0U) && kvc_ring_pop(&s_usound_rx_ring, &b)) {
        kvc_usound_feed_byte(b);
        budget--;
    }

    /* Nếu quá 1500 nhịp poll (~1.5 giây) không có khung tin hợp lệ mới, hủy cờ fresh data */
    if (s_usound_has_fresh_data && (s_usound_poll_count - s_usound_last_rx_tick > 1500U)) {
        s_usound_has_fresh_data = false;
        s_usound_last_err = KVC_USOUND_ERR_TIMEOUT;
    }
}

/* ============================================================================
 * 6. HÀM ĐO CỰ LY THÔNG MINH, TỨC THÌ, KHÔNG DELAY (DRAIN TO LATEST FRAME)
 * ============================================================================ */
static inline uint8_t kvc_usound_measure(uint16_t *dist_cm, uint16_t *dist_mm) {
    /* 1. Xả sạch và giải mã toàn bộ các byte đang có trong FIFO để lấy gói tin MỚI NHẤT */
    kvc_usound_poll();

    /* 2. Nếu đã có dữ liệu hợp lệ (vừa giải mã hoặc đã được poll ngầm) */
    if (s_usound_has_fresh_data) {
        if (dist_mm != 0) *dist_mm = s_usound_latest_mm;
        if (dist_cm != 0) *dist_cm = s_usound_latest_cm;
        return KVC_USOUND_OK;
    }

    /* 3. Mode 4: chưa có khung trong ring (vừa boot hoặc đã bỏ lỡ khung trước).
     *    Mode 4 CHỈ đo khi được kích hoạt, nên phải gửi byte 0x01 rồi chờ.
     *    (Nếu board đang ở Mode 3 - không phải cấu hình đang dùng - module tự phát
     *    100 ms/lần và byte 0x01 bị bỏ qua, không gây hại.)
     *
     *    Chờ tối đa 100 ms. GIỚI HẠN: datasheet Anji KHÔNG ghi thời gian đáp ứng
     *    của Mode 4; con số 100 ms được chọn theo chu kỳ danh định của Mode 3.
     *    Đo ở 5-6 m có thể cần lâu hơn — chưa xác minh được khi không có kit.
     *    Nếu hay bị KVC_USOUND_ERR_TIMEOUT ở cự ly xa, tăng hằng số này. */
    kvc_usound_uart_tx_byte(0x01);

    uint32_t wait_us = 100000U; /* 100 ms */
    while (wait_us > 0U) {
        uint8_t b;
        while (kvc_ring_pop(&s_usound_rx_ring, &b)) {
            kvc_usound_feed_byte(b);
            if (s_usound_has_fresh_data) {
                if (dist_mm != 0) *dist_mm = s_usound_latest_mm;
                if (dist_cm != 0) *dist_cm = s_usound_latest_cm;
                return KVC_USOUND_OK;
            }
        }
        kvc_usound_delay_us(500);
        if (wait_us >= 500U) wait_us -= 500U;
        else wait_us = 0;
    }

    if (dist_mm != 0) *dist_mm = 0;
    if (dist_cm != 0) *dist_cm = 0;
    return s_usound_last_err;
}

/* ============================================================================
 * 7. HÀM ĐỌC CỰ LY ỔN ĐỊNH, PHẢN HỒI TỨC THÌ (FAST RESPONSIVE ROBUST READ)
 * ============================================================================ */
static inline uint8_t kvc_usound_read_robust(uint16_t *filtered_cm) {
    static uint16_t s_last_valid_cm = 0;
    static uint8_t  s_drop_count    = 0;

    uint16_t cm = 0;
    uint8_t res = kvc_usound_measure(&cm, 0);

    if (res == KVC_USOUND_OK) {
        s_last_valid_cm = cm;
        s_drop_count = 0;
        if (filtered_cm != 0) *filtered_cm = cm;
        return KVC_USOUND_OK;
    }

    /* Nếu gặp sự cố tạm thời (dội trượt 1 nhịp do bề mặt nước sóng sánh):
     * Chỉ giữ lại 1 chu kỳ để tránh làm trễ việc hiển thị khoảng cách mới */
    if (s_last_valid_cm > 0 && s_drop_count < 1) {
        s_drop_count++;
        if (filtered_cm != 0) *filtered_cm = s_last_valid_cm;
        return KVC_USOUND_OK;
    }

    /* Mất tín hiệu liên tục -> Hạ cờ báo lỗi thực sự */
    s_last_valid_cm = 0;
    if (filtered_cm != 0) *filtered_cm = 0;
    return res;
}

/* ============================================================================
 * 7. HÀM ĐỌC LỌC TRUNG VỊ (MEDIAN FILTER 3 MẪU) KHỬ NHIỄU MẶT NƯỚC DAO ĐỘNG
 * ============================================================================ */
static inline uint8_t kvc_usound_read_filtered(uint16_t *filtered_cm) {
    uint16_t samples[3];
    uint8_t valid_count = 0;

    for (uint8_t i = 0; i < 3; i++) {
        uint16_t cm = 0;
        uint8_t res = kvc_usound_measure(&cm, 0);
        if (res == KVC_USOUND_OK) {
            samples[valid_count++] = cm;
        }
        /* Giãn cách 20ms giữa 2 lần đo */
        kvc_usound_delay_us(20000);
    }

    if (valid_count == 0) {
        if (filtered_cm != 0) *filtered_cm = 0;
        return KVC_USOUND_ERR_TIMEOUT;
    }

    if (valid_count == 1) {
        if (filtered_cm != 0) *filtered_cm = samples[0];
        return KVC_USOUND_OK;
    }

    if (valid_count == 2) {
        if (filtered_cm != 0) *filtered_cm = (samples[0] + samples[1]) / 2;
        return KVC_USOUND_OK;
    }

    /* Đủ 3 mẫu hợp lệ: Sắp xếp lấy giá trị trung vị (Median of 3) */
    if (samples[0] > samples[1]) {
        uint16_t tmp = samples[0]; samples[0] = samples[1]; samples[1] = tmp;
    }
    if (samples[1] > samples[2]) {
        uint16_t tmp = samples[1]; samples[1] = samples[2]; samples[2] = tmp;
    }
    if (samples[0] > samples[1]) {
        uint16_t tmp = samples[0]; samples[0] = samples[1]; samples[1] = tmp;
    }

    if (filtered_cm != 0) *filtered_cm = samples[1];
    return KVC_USOUND_OK;
}

/* ============================================================================
 * 8. THỐNG KÊ RX UART2 (CHẨN ĐOÁN KVC-M2)
 * ============================================================================ */
typedef struct {
    uint32_t ring_dropped;    /**< Byte bị bỏ vì ring đầy (phần mềm) */
    uint32_t overrun_count;   /**< LS.OE: FIFO 16 byte phần cứng đã tràn */
    uint32_t framing_count;   /**< LS.FE: sai stop bit */
    uint32_t isr_count;       /**< Số lần vào UART2_IRQHandler */
    uint32_t byte_count;      /**< Byte thật sự lấy ra khỏi RB */
    uint32_t bytes_pending;   /**< Byte còn trong ring tại thời điểm đọc */
} KvcUsoundRxStats;

/** @brief ISR RX UART2. Vector: UART2_IRQHandler (IRQ 39). */
void UART2_IRQHandler(void);

static inline void kvc_usound_get_rx_stats(KvcUsoundRxStats *out) {
    if (out == 0) {
        return;
    }
    out->bytes_pending = kvc_ring_count(&s_usound_rx_ring);
    out->ring_dropped  = s_usound_rx_ring.dropped;
    out->overrun_count = s_usound_rx_overrun_count;
    out->framing_count = s_usound_rx_framing_count;
    out->isr_count     = s_usound_rx_isr_count;
    out->byte_count    = s_usound_rx_byte_count;
}

/**
 * @brief Xả ring RX và đặt lại máy trạng thái giải mã về đầu khung.
 *
 * DÙNG KHI NÀO: sau một khoảng thời gian dài KHÔNG gọi `kvc_usound_poll()`, ring
 * 1024 byte có thể đã tràn và byte bị mất giữa khung khiến FSM lệch trạng thái.
 * Ví dụ điển hình: `kvc_gnss_init()` chạy autobaud 11–15 s ngay sau
 * `kvc_usound_init()`, trong lúc UART2 ISR vẫn bật nhưng không ai tiêu thụ ring.
 *
 * Gọi hàm này một lần trước khi vào vòng lặp chính để bắt đầu lại từ khung mới,
 * thay vì giải mã tiếp phần đuôi khung bị cắt.
 *
 * Chỉ gọi ở main context khi không có ai đang đọc ring. Không làm mất dữ liệu
 * thật đang cần: chỉ bỏ các byte đã cũ trong ring.
 */
static inline void kvc_usound_discard_stale_rx(void) {
    kvc_ring_reset(&s_usound_rx_ring);
    s_usound_rx_state = KVC_USOUND_STATE_HEADER;
    s_usound_has_fresh_data = false;
    s_usound_last_err = KVC_USOUND_ERR_TIMEOUT;
}

#ifdef __cplusplus
}
#endif

#endif /* KVC_USOUND_AJSR04M_H */
