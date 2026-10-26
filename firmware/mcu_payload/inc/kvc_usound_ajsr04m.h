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

/* KVC-MCU-1.2: máy trạng thái 4 byte đã tách sang module thuần logic để chạy
 * được host test bằng gcc. Driver này KHÔNG được định nghĩa lại logic giải mã;
 * mọi thay đổi định dạng khung phải sửa trong kvc_usound_decode.c. */
#include "kvc_usound_decode.h"

/* KVC-F6b: driver này báo thời gian chờ vào time base dùng chung, nên mọi
 * target/host test có gọi kvc_usound_delay_us() phải link thêm
 * firmware/mcu_payload/src/kvc_timebase.c. */
#include "kvc_timebase.h"

#ifdef __cplusplus
extern "C" {
#endif

/* ============================================================================
 * 1. CÁC HẰNG SỐ ĐẶC TẢ CẢM BIẾN VÀ MÃ TRẠNG THÁI
 * ============================================================================
 * Dải đo (KVC_USOUND_MIN_RANGE_CM, KVC_USOUND_MAX_RANGE_CM), mã trạng thái
 * (KVC_USOUND_OK, KVC_USOUND_ERR_*) và hằng số khung (KVC_USOUND_NO_ECHO_MM)
 * nay nằm trong kvc_usound_decode.h — một nguồn duy nhất, để driver và host
 * test không bao giờ lệch định nghĩa. */
/* Cửa sổ nghe RX sau khi gửi 0x01.
 *
 * Đo trên kit: khung đầu của một lần đo thành công về sau ~5 ms (26 cm) đến
 * ~30 ms (5 m) tính từ lúc gửi 0x01, nên 120 ms là dư cho đường truyền.
 *
 * NHƯNG khi KHÔNG có phản xạ, module còn phải chạy hết thời gian chờ nội bộ
 * của nó rồi mới phát 4 khung 6000 mm. Trên kit đo được cửa sổ 120 ms bỏ sót
 * cả cụm khung này khoảng 1/65 lần, và lỗi bị báo nhầm thành `err/6`
 * ("module không đáp 0x01") trong khi thực chất module có đáp nhưng muộn.
 * Nới lên 250 ms loại bỏ nhầm lẫn đó.
 *
 * CHI PHÍ: chỉ tốn thêm thời gian ở những chu kỳ THẤT BẠI. Khi có phản xạ,
 * `kvc_usound_measure()` thoát ngay ở khung đầu nên chu kỳ bình thường không
 * đổi. Trường hợp xấu nhất 250 ms + TX LoRa 300 ms + I2C/GNSS ~100 ms = 650 ms
 * vẫn dưới hạn 1000 ms của chu kỳ phát và dưới watchdog 6 s. */
#define KVC_USOUND_TIMEOUT_MS         250U    /* Độ dài cửa sổ nghe RX (ms) */

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

/* KVC-MCU-1.1 (26/10/2026): RX qua ngắt + ring buffer, NHƯNG ngắt chỉ bật
 * trong cửa sổ nghe ngắn quanh lệnh 0x01.
 *
 * VẤN ĐỀ ĐO ĐƯỢC TRÊN KIT: khi bật RDAIE thường trực, đường RX hứng nhiễu
 * 50 Hz từ lưới điện (đo được 51–58 byte/giây, `fe == byt == isr`). Nhiễu này
 * không làm hỏng byte mà phá khung ở tầng FSM: mỗi byte rác được nạp vào máy
 * trạng thái, làm nó lệch khỏi ranh giới 4 byte của khung, nên khung THẬT bị
 * cắt vụn và không bao giờ qua được checksum. Đo trên kit: 76 lần đo liên tiếp
 * đều `US=0cm err` dù module vẫn đáp lệnh (đèn nháy 1 Hz).
 *
 * CÁCH SỬA: tắt ngắt RX ngoài cửa sổ nghe. Ngoài cửa sổ module ngủ nên không
 * có dữ liệu thật; byte thu được chỉ là nhiễu. Trong cửa sổ 250 ms, lượng nhiễu
 * trung bình chỉ ~0,7 byte nên FSM gần như luôn bắt đúng khung.
 *
 * KẾT QUẢ ĐÃ ĐO với cách này: `byt` từ 57,6 B/s xuống còn 3,59 B/s (đúng 4
 * byte/giây = 1 khung thật mỗi giây), `US=25–28cm ok` liên tục 20+ mẫu.
 *
 * LƯU Ý: đây KHÔNG phải nguyên nhân gốc. Gốc là chân TX của module ở mức LOW
 * khi ngủ (cầu phân áp 1k/2k kéo P2.15 về 0 V), khiến UART thấy start bit giả.
 * Muốn `fe = 0` tuyệt đối phải xử lý phần cứng (xem KVC_PHAN_CONG_2_NGUOI.md
 * mục 1.1). Cửa sổ nghe chỉ là biện pháp phần mềm để dữ liệu vẫn dùng được.
 *
 * Định cỡ ring: cửa sổ KHÔNG-CONSUMER dài nhất ~800 ms (cửa sổ 250 ms + LoRa
 * 300 ms + init lại LoRa 100 ms + I2C ~100 ms). 9600 8N1 = 960 B/s x 0,80 =
 * 768 byte -> ring 1024 byte (biên 1,33x).
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

/* Đếm khung theo KẾT QUẢ GIẢI MÃ, không theo cờ FE.
 *
 * `fe` phụ thuộc mức idle của chân TX (module ngủ kéo LOW) nên không phản ánh
 * chất lượng dữ liệu. Ba bộ đếm dưới đây mới trả lời được "dữ liệu có đúng không":
 *   - frame_valid : khung qua checksum và <= 6000 mm (trong + ngoài dải)
 *   - frame_ok    : trong số đó, số khung nằm trong dải 20..500 cm
 *   - frame_bad   : checksum sai (nhiễu làm hỏng bit)
 * Quan hệ: frame_valid = frame_ok + (out-of-range) + (blind-zone) + (no-echo).
 *
 * `frame_valid` cần riêng vì `ok=0 bad=0` là trạng thái NHẬP NHẰNG: vừa có thể
 * là "không nhận được khung nào", vừa có thể "mọi khung đều hợp lệ nhưng ngoài
 * dải". `frame_valid > 0` chứng minh module có trả lời và khung sạch. */
static volatile uint32_t s_usound_frame_valid_count = 0U;
static volatile uint32_t s_usound_frame_ok_count    = 0U;
static volatile uint32_t s_usound_frame_bad_count   = 0U;
static volatile uint32_t s_usound_trigger_count     = 0U;

/* Giá trị mm thô của khung hợp lệ gần nhất, kể cả ngoài dải. Chẩn đoán only. */
static uint16_t s_usound_last_raw_mm     = 0U;
static bool     s_usound_has_last_raw_mm = false;

/* Giá trị cm ĐÃ LỌC tốt gần nhất, dùng cho chẩn đoán `last=` trên UART5.
 * Tách khỏi `filtered_cm` để log thấy được cả khi chu kỳ hiện tại thất bại,
 * mà KHÔNG bật cờ ALT_VALID và KHÔNG đưa vào georef. 0 = chưa từng có mẫu. */
static uint16_t s_usound_last_good_out_cm = 0U;

/* Trạng thái bộ giải mã 4 byte. Logic nằm trong kvc_usound_decode.c; khai báo
 * ở đây (trước kvc_usound_init) vì init cần reset nó. */
static KvcUsoundDecoder s_usound_decoder;

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
    s_usound_frame_valid_count = 0U;
    s_usound_frame_ok_count    = 0U;
    s_usound_frame_bad_count   = 0U;
    s_usound_trigger_count     = 0U;
    s_usound_last_raw_mm       = 0U;
    s_usound_has_last_raw_mm   = false;
    s_usound_last_good_out_cm  = 0U;
    kvc_usound_decode_reset(&s_usound_decoder);

    /* 7. KVC-MCU-1.1: KHÔNG bật ngắt RX ở đây.
     *
     * Đo trên kit 26/10/2026: nếu bật RDAIE thường trực, đường RX (idle LOW vì
     * cầu phân áp 1k/2k + module ngủ) hứng nhiễu 50 Hz ~57 byte/giây. Nhiễu này
     * làm FSM lệch ranh giới khung, khiến MỌI khung thật bị cắt vụn: 76 lần đo
     * liên tiếp đều `US=0cm err`. Ngắt chỉ được bật bên trong cửa sổ nghe của
     * kvc_usound_measure() — xem ghi chú ở mục 4. */

    /* 8. Bật ngắt UART2 trong NVIC (IRQ 39) nhưng để IE = 0.
     * NVIC vẫn enable để kvc_usound_rx_window_open() chỉ cần ghi IE. */
    SN_UART2->IE = 0U;
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
 * ============================================================================
 * Logic 4 bước nằm trong kvc_usound_decode.c (KVC-MCU-1.2). Ở đây chỉ giữ các
 * biến kết quả mà driver/telemetry cần; `s_usound_decoder` khai báo ở mục 1
 * (trước kvc_usound_init) vì init phải reset nó. */
static uint16_t         s_usound_latest_mm       = 0;
static uint16_t         s_usound_latest_cm       = 0;
static bool             s_usound_has_fresh_data  = false;
static uint8_t          s_usound_last_err        = KVC_USOUND_ERR_TIMEOUT;
static uint32_t         s_usound_poll_count      = 0;
static uint32_t         s_usound_last_rx_tick    = 0;

/**
 * @brief Xả hết byte trong ring mà KHÔNG đụng counter `dropped`.
 *
 * Dùng thay `kvc_ring_reset()` khi mở/đóng cửa sổ: reset sẽ xoá luôn `dropped`,
 * làm số liệu chẩn đoán `drop=0` trên UART5 trở nên vô nghĩa.
 */
static inline void kvc_usound_ring_drain(void) {
    uint8_t b;
    while (kvc_ring_pop(&s_usound_rx_ring, &b)) {
        /* bỏ byte cũ */
    }
}

/**
 * @brief Mở cửa sổ nghe RX UART2. Chỉ gọi từ main context.
 *
 * Thứ tự có chủ đích: đóng ngắt và xoá pending trước, xả FIFO phần cứng, xoá
 * cờ OE/FE sticky, xả ring + đưa FSM về HEADER, rồi mới bật RDAIE/RLSIE. Nhờ
 * vậy byte rác đã chốt từ trước không lọt vào khung đầu tiên.
 *
 * Vì sao phải đọc LS sau RXFIFORST: khi IE tắt, bộ thu vẫn chạy và FIFO 16 byte
 * vẫn đầy dần vì nhiễu, nên cờ OE/FE sticky đã bật. Không xoá thì `oe` tăng một
 * lần mỗi lần đo dù ring không hề tràn.
 */
static inline void kvc_usound_rx_window_open(void) {
    SN_UART2->IE = 0U;                      /* chắc chắn đang đóng trước khi xả FIFO */
    NVIC_ClearPendingIRQ(UART2_IRQn);

    SN_UART2->FIFOCTRL = 0x07;              /* FIFOEN + RXFIFORST + TXFIFORST */
    (void)SN_UART2->LS;                     /* xoá cờ OE/FE sticky tích từ lúc IE tắt */

    kvc_usound_ring_drain();
    kvc_usound_decode_reset(&s_usound_decoder);

    SN_UART2->IE = (1U << 0) | (1U << 2);   /* RDAIE + RLSIE: chỉ trong cửa sổ */
}

/**
 * @brief Đóng cửa sổ nghe RX UART2. Phải gọi ở MỌI nhánh thoát của
 *        kvc_usound_measure(), kể cả nhánh thành công.
 */
static inline void kvc_usound_rx_window_close(void) {
    SN_UART2->IE = 0U;                      /* tắt ngắt RX: nhiễu ngoài cửa sổ bị bỏ qua */
    NVIC_ClearPendingIRQ(UART2_IRQn);
    kvc_usound_ring_drain();
    kvc_usound_decode_reset(&s_usound_decoder);
}

/**
 * @brief Nạp một byte vào bộ giải mã và cập nhật trạng thái đo của driver.
 *
 * Toàn bộ logic 4 byte nằm trong `kvc_usound_decode_byte()`. Hàm này chỉ làm
 * phần "dịch kết quả sang trạng thái driver": lưu mm/cm, đặt cờ fresh, đếm
 * khung và ghi mã lỗi.
 */
static inline void kvc_usound_feed_byte(uint8_t b) {
    uint16_t raw_mm = 0U;
    KvcUsoundFrameResult r = kvc_usound_decode_byte(&s_usound_decoder, b, &raw_mm);

    if (r == KVC_USOUND_FRAME_NONE) {
        return;
    }

    s_usound_last_err = kvc_usound_result_to_err(r);

    if (r == KVC_USOUND_FRAME_BAD_CHECKSUM) {
        s_usound_frame_bad_count++;
        return;
    }

    /* Từ đây là khung qua checksum: lưu raw để chẩn đoán `raw=` trên UART5. */
    s_usound_last_raw_mm     = raw_mm;
    s_usound_has_last_raw_mm = true;
    s_usound_frame_valid_count++;

    if (r == KVC_USOUND_FRAME_OK) {
        s_usound_latest_mm    = raw_mm;
        s_usound_latest_cm    = (uint16_t)((uint32_t)raw_mm / 10UL);
        s_usound_has_fresh_data = true;
        s_usound_last_rx_tick = s_usound_poll_count;
        s_usound_frame_ok_count++;
        return;
    }

    /* No-Echo / ngoài dải / vùng mù: không có giá trị dùng được. */
    s_usound_latest_mm      = 0U;
    s_usound_latest_cm      = 0U;
    s_usound_has_fresh_data = false;
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
    if (dist_mm != 0) *dist_mm = 0;
    if (dist_cm != 0) *dist_cm = 0;

    /* 1. Tiêu thụ byte còn sót. Ngoài cửa sổ nghe ring luôn rỗng (IE tắt), nên
     *    bước này chủ yếu đảm bảo FSM sạch trước khi kích hoạt. */
    kvc_usound_poll();

    /* 2. Mode 4 chỉ đo khi nhận lệnh, nên phải gửi 0x01 rồi mở cửa sổ nghe.
     *
     *    Chỉ gửi ĐÚNG MỘT lệnh mỗi lần đo. Không thử lại: Mode 4 không có giao
     *    thức xác nhận, gửi lệnh thứ hai khi module đang xử lý phép đo đầu có
     *    thể huỷ phép đo đang chạy và cho ra giá trị sai nhưng vẫn qua checksum.
     *
     *    Cửa sổ 250 ms đủ cho cả 26 cm (~5 ms), 5 m (~30 ms), và cả trường hợp
     *    module phải chạy hết thời gian chờ nội bộ rồi mới phát 6000 mm. Không
     *    thoát sớm khi gặp khung ngoài dải, vì khung đó có thể là nhiễu khớp
     *    checksum; nghe hết cửa sổ để khung thật đến sau vẫn được xử lý. */
    s_usound_has_fresh_data = false;
    s_usound_last_err = KVC_USOUND_ERR_NO_RESPONSE;

    uint32_t const bytes_before = s_usound_rx_byte_count;

    kvc_usound_rx_window_open();
    kvc_usound_uart_tx_byte(0x01);
    s_usound_trigger_count++;

    uint32_t wait_us = (uint32_t)KVC_USOUND_TIMEOUT_MS * 1000UL;
    while (wait_us > 0U) {
        uint8_t b;
        while (kvc_ring_pop(&s_usound_rx_ring, &b)) {
            kvc_usound_feed_byte(b);
            if (s_usound_has_fresh_data) {
                kvc_usound_rx_window_close();
                s_usound_has_fresh_data = false;
                if (dist_mm != 0) *dist_mm = s_usound_latest_mm;
                if (dist_cm != 0) *dist_cm = s_usound_latest_cm;
                return KVC_USOUND_OK;
            }
        }
        kvc_usound_delay_us(500);
        if (wait_us >= 500U) wait_us -= 500U;
        else wait_us = 0U;
    }

    kvc_usound_rx_window_close();

    /* 3. Phân loại lỗi. Phân biệt "không nhận được byte nào" với "có byte nhưng
     *    khung bị cắt" vì hai nguyên nhân dẫn tới hai việc khác nhau: cái đầu là
     *    module/đường TX, cái sau là nhiễu làm hỏng khung. */
    if (s_usound_last_err == KVC_USOUND_ERR_NO_RESPONSE) {
        /* FSM không kết luận được gì -> hoặc không có byte, hoặc khung bị cắt. */
        return (s_usound_rx_byte_count == bytes_before) ? KVC_USOUND_ERR_NO_RESPONSE
                                                        : KVC_USOUND_ERR_TIMEOUT;
    }

    if (dist_mm != 0) *dist_mm = 0;
    if (dist_cm != 0) *dist_cm = 0;
    return s_usound_last_err;
}

/* ============================================================================
 * 7. ĐỌC CỰ LY CÓ LỌC (ROLLING MEDIAN-OF-3)
 * ============================================================================
 * KVC-MCU-US-FILTER-20261026-001: LỌC TRUNG VỊ TRƯỢT 3 MẪU.
 *
 * VÌ SAO CẦN LỌC: một khung 4 byte chỉ có checksum 8-bit, nên nhiễu trên đường
 * RX vẫn có thể tạo ra khung "hợp lệ" mang giá trị sai (xác suất ~1/256 mỗi tổ
 * hợp 4 byte rác). Ngoài ra AJ-SR04M trên mặt nước sóng sánh cho giá trị dao
 * động vài cm giữa các lần đo. Telemetry 1 Hz mà đưa thẳng giá trị thô thì
 * dashboard nhảy số và georef tính toạ độ sai.
 *
 * VÌ SAO MEDIAN TRƯỢT, KHÔNG PHẢI ĐO 3 LẦN: `kvc_usound_read_filtered` cũ đo
 * 3 lần rồi lấy trung vị, tốn 3 x 250 ms = 750 ms mỗi chu kỳ. Cộng TX LoRa
 * 300 ms là 1050 ms, vượt trần 1000 ms của chu kỳ phát và ăn vào biên watchdog.
 * Median trượt giữ 3 MẪU GẦN NHẤT (mỗi chu kỳ vẫn chỉ đo 1 lần) nên:
 *   - thời gian mỗi chu kỳ không đổi
 *   - vẫn loại được 1 mẫu lỗi trong 3, vì trung vị của {đúng, đúng, sai} = đúng
 *   - độ trễ chỉ 2 chu kỳ (~2 s), chấp nhận được với telemetry 1 Hz
 *
 * LỌC BỔ SUNG — CHẶN NGOẠI LAI: nếu mẫu mới lệch quá KVC_USOUND_OUTLIER_CM so
 * với trung vị hiện tại thì coi là nghi ngờ. Chỉ nhận khi mẫu kế tiếp xác nhận
 * (lệch cùng hướng). Nhờ vậy một xung nhiễu đơn lẻ không thể đẩy giá trị đi
 * xa, nhưng thay đổi tư thế THẬT vẫn được theo kịp sau 2 chu kỳ.
 *
 * GIỚI HẠN: lọc không sửa được dữ liệu sai một cách hệ thống (ví dụ module báo
 * lệch đều 5 cm do sai calibration) và không sửa được trục/vật cản sai vị trí.
 * Muốn kiểm chứng độ chính xác phải đối chiếu thước ở nhiều cự ly.
 */

/** Ngưỡng nghi ngờ ngoại lai (cm). 150 cm đủ rộng để không chặn thay đổi thật
 *  của tải treo dưới UAV, nhưng đủ hẹp để chặn xung nhiễu điển hình. */
#define KVC_USOUND_OUTLIER_CM   150U

/** Số chu kỳ telemetry (1 Hz) giữ lại lịch sử trung vị khi mất echo.
 *
 *  VẤN ĐỀ ĐO ĐƯỢC TRÊN KIT: chuỗi log `202 ok / err/5 / 207 ok` cho thấy echo
 *  yếu bị mất cách quãng. Bản trước xoá trắng lịch sử ngay ở mẫu lỗi đầu tiên,
 *  nên mẫu tốt kế tiếp được trả THẲNG (s_hist_count == 1 -> out = s_hist[0]),
 *  không qua trung vị. Một xung nhiễu lọt vào đúng khe đó sẽ đi thẳng ra
 *  telemetry và vào georef.
 *
 *  Nay lịch sử chỉ bị xoá sau 5 chu kỳ liên tiếp không có mẫu dùng được. Giá
 *  trị công bố trong 5 chu kỳ đó VẪN là 0 kèm mã lỗi (KHÔNG giữ mẫu cũ), nên
 *  georef không bao giờ dùng số cũ — chỉ có bộ lọc là không bị mất trí nhớ. */
#define KVC_USOUND_HIST_HOLD_CYCLES  5U

static inline uint16_t kvc_usound_median3(uint16_t a, uint16_t b, uint16_t c) {
    /* Trung vị của 3 giá trị = max(min(a,b), min(max(a,b), c)).
     * Công thức này đúng với mọi tổ hợp và không cần mảng hay sắp xếp. */
    uint16_t lo_ab = (a < b) ? a : b;
    uint16_t hi_ab = (a > b) ? a : b;
    uint16_t cand  = (hi_ab < c) ? hi_ab : c;
    return (lo_ab > cand) ? lo_ab : cand;
}

/**
 * @brief Đọc cự ly có lọc trung vị trượt 3 mẫu + chặn ngoại lai.
 *
 * @param filtered_cm  Nhận giá trị đã lọc khi trả về KVC_USOUND_OK.
 * @return KVC_USOUND_OK nếu có giá trị dùng được; mã lỗi KVC_USOUND_ERR_* nếu không.
 *
 * Gọi đúng MỘT lần mỗi chu kỳ telemetry (1 Hz). Bên trong gọi
 * `kvc_usound_measure()` đúng một lần nên thời gian chặn tối đa
 * KVC_USOUND_TIMEOUT_MS (250 ms) và chỉ đạt mức đó ở chu kỳ thất bại.
 */
static inline uint8_t kvc_usound_read_robust(uint16_t *filtered_cm) {
    /* Lịch sử 3 mẫu hợp lệ gần nhất (vòng tròn). */
    static uint16_t s_hist[3]      = {0U, 0U, 0U};
    static uint8_t  s_hist_count   = 0U;   /* 0..3 */
    static uint8_t  s_hist_idx     = 0U;

    /* Trạng thái chặn ngoại lai: mẫu nghi ngờ chờ xác nhận. */
    static uint16_t s_pending_cm   = 0U;
    static uint8_t  s_pending      = 0U;   /* 1 = đang chờ mẫu xác nhận */

    /* Giữ mẫu cũ một chu kỳ khi lỗi đường truyền (KHÔNG áp dụng cho ngoài dải). */
    static uint16_t s_last_good_cm = 0U;
    static uint8_t  s_drop_count   = 0U;
    /* Số chu kỳ liên tiếp không có mẫu dùng được (mọi mã lỗi). */
    static uint8_t  s_fail_run     = 0U;

    uint16_t cm = 0;
    uint8_t res = kvc_usound_measure(&cm, 0);

    if (res != KVC_USOUND_OK) {
        /* Lỗi nhiễu/đường truyền: chưa có thông tin mới, tạm giữ mẫu cũ 1 chu kỳ
         * để dashboard không nhấp nháy vì một lần trượt. Sau đó mới báo lỗi.
         *
         * Lỗi NGOÀI DẢI (OUT_OF_RANGE/NO_ECHO/BLIND_ZONE) thì KHÔNG giữ mẫu cũ:
         * đó là câu trả lời đúng và mới của cảm biến. Giữ mẫu cũ sẽ khiến telemetry
         * báo độ cao cũ dù UAV đã ra khỏi tầm, và georef dùng alt_dist_cm để tính
         * toạ độ mục tiêu nên sẽ ra toạ độ sai. */
        if (((res == KVC_USOUND_ERR_TIMEOUT) ||
             (res == KVC_USOUND_ERR_CHECKSUM) ||
             (res == KVC_USOUND_ERR_NO_RESPONSE)) &&
            (s_fail_run == 0U) &&
            (s_last_good_cm > 0U) && (s_drop_count < 1U)) {
            s_drop_count++;
            if (filtered_cm != 0) *filtered_cm = s_last_good_cm;
            return KVC_USOUND_OK;
        }

        /* Không có mẫu dùng được. GIÁ TRỊ CÔNG BỐ VẪN LÀ 0 kèm mã lỗi (georef
         * không được dùng số cũ), nhưng lịch sử trung vị chỉ bị xoá sau
         * KVC_USOUND_HIST_HOLD_CYCLES chu kỳ liên tiếp. Nhờ vậy khi echo trở lại
         * ngay sau một khe no-echo, mẫu đầu tiên vẫn được lọc như bình thường
         * thay vì đi thẳng ra ngoài. */
        if (s_fail_run < 0xFFU) {
            s_fail_run++;
        }
        s_pending = 0U;
        s_drop_count = 0U;
        if (s_fail_run >= KVC_USOUND_HIST_HOLD_CYCLES) {
            /* Mất tín hiệu kéo dài: xoá lịch sử để lần có lại không trộn mẫu cũ. */
            s_hist_count = 0U;
            s_hist_idx   = 0U;
            s_last_good_cm = 0U;
        }
        if (filtered_cm != 0) *filtered_cm = 0U;
        return res;
    }

    s_drop_count = 0U;
    s_fail_run   = 0U;

    /* ---- Chặn ngoại lai ----
     * Chỉ áp dụng khi đã có ít nhất 1 mẫu lịch sử (cần mốc so sánh). */
    if (s_hist_count > 0U) {
        uint16_t ref = s_hist[(uint8_t)((s_hist_idx + 2U) % 3U)];  /* mẫu mới nhất */
        uint16_t diff = (cm > ref) ? (uint16_t)(cm - ref) : (uint16_t)(ref - cm);

        if (diff > KVC_USOUND_OUTLIER_CM) {
            if ((s_pending != 0U)) {
                /* Mẫu thứ hai lệch cùng chiều -> xác nhận thay đổi thật. */
                s_pending = 0U;
            } else {
                /* Mẫu đầu tiên lệch xa -> nghi ngờ, chưa đưa vào lịch sử.
                 * Vẫn trả mẫu đã lọc hiện tại để dashboard không nhảy. */
                s_pending = 1U;
                s_pending_cm = cm;
                if (filtered_cm != 0) *filtered_cm = s_last_good_cm;
                return KVC_USOUND_OK;
            }
        } else {
            /* Mẫu nằm trong dải bình thường -> huỷ trạng thái nghi ngờ. */
            s_pending = 0U;
        }
    }

    /* ---- Đẩy mẫu vào lịch sử vòng tròn ---- */
    s_hist[s_hist_idx] = cm;
    s_hist_idx = (uint8_t)((s_hist_idx + 1U) % 3U);
    if (s_hist_count < 3U) {
        s_hist_count++;
    }

    /* ---- Xuất trung vị ---- */
    uint16_t out;
    if (s_hist_count == 1U) {
        out = s_hist[0];
    } else if (s_hist_count == 2U) {
        /* Hai mẫu: lấy trung bình (chưa đủ để lấy trung vị). */
        out = (uint16_t)(((uint32_t)s_hist[0] + (uint32_t)s_hist[1]) / 2U);
    } else {
        out = kvc_usound_median3(s_hist[0], s_hist[1], s_hist[2]);
    }

    s_last_good_cm = out;
    s_usound_last_good_out_cm = out;
    if (filtered_cm != 0) *filtered_cm = out;
    return KVC_USOUND_OK;
}

/* ============================================================================
 * 7. HÀM ĐỌC LỌC TRUNG VỊ (MEDIAN FILTER 3 MẪU) KHỬ NHIỄU MẶT NƯỚC DAO ĐỘNG
 * ============================================================================ */
/* ============================================================================
 * 7b. [ĐÃ GỠ] kvc_usound_read_filtered — đo 3 lần rồi lấy trung vị.
 * ============================================================================
 * Hàm này từng tồn tại nhưng KHÔNG được gọi ở đâu, và nếu gọi thì tốn
 * 3 x 250 ms = 750 ms mỗi chu kỳ (cộng TX LoRa 300 ms là 1050 ms, vượt trần
 * 1000 ms của chu kỳ phát và ăn vào biên watchdog 6 s).
 *
 * Đã thay bằng `kvc_usound_read_robust` dùng MEDIAN TRƯỢT: vẫn giữ 3 mẫu gần
 * nhất nhưng mỗi chu kỳ chỉ đo 1 lần, nên thời gian chặn của chu kỳ thành công
 * không đổi mà vẫn loại được 1 mẫu lỗi trong 3. Xem mục 7.
 */

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
    uint32_t frame_valid;     /**< Khung qua checksum VÀ <= 6000 mm (trong + ngoài dải) */
    uint32_t frame_ok;        /**< Khung qua checksum VÀ nằm trong dải 20..500 cm */
    uint32_t frame_bad;       /**< Khung đủ 4 byte nhưng checksum sai */
    uint32_t trigger_count;   /**< Số lệnh 0x01 đã gửi */
} KvcUsoundRxStats;

/** @brief ISR RX UART2. Vector: UART2_IRQHandler (IRQ 39). */
void UART2_IRQHandler(void);

/**
 * @brief Lấy giá trị mm THÔ của khung hợp lệ gần nhất, kể cả ngoài dải đo.
 * @param out_mm     Nhận giá trị mm; không đổi nếu chưa từng có khung hợp lệ.
 * @param out_valid  true nếu đã từng có khung hợp lệ.
 *
 * Dùng để phân biệt hai nguyên nhân rất khác nhau khi log báo lỗi:
 *   6000 mm       = No Echo, module không thấy phản xạ -> kiểm tra vật cản/đầu dò
 *   501..5999 mm  = có phản xạ nhưng vượt trần tin cậy
 *   20..500 mm    = hợp lệ
 * Không có giá trị này thì `err/3` không nói được gì. Hàm KHÔNG đổi trạng thái.
 */
static inline void kvc_usound_get_last_raw(uint16_t *out_mm, bool *out_valid) {
    if (out_mm != 0) {
        *out_mm = s_usound_last_raw_mm;
    }
    if (out_valid != 0) {
        *out_valid = s_usound_has_last_raw_mm;
    }
}

/**
 * @brief Lấy giá trị cm ĐÃ LỌC tốt gần nhất. CHẨN ĐOÁN ONLY.
 * @return Giá trị cm, hoặc 0 nếu chưa từng có mẫu dùng được.
 *
 * KHÔNG dùng giá trị này cho telemetry hay georef: nó có thể cũ hơn chu kỳ
 * hiện tại. Mục đích duy nhất là để log `[M3]` hiển thị `last=` khi chu kỳ
 * hiện tại lỗi, giúp phân biệt "mất echo thật" với "chỉ trượt một nhịp".
 */
static inline uint16_t kvc_usound_get_last_good_cm(void) {
    return s_usound_last_good_out_cm;
}

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
    out->frame_valid   = s_usound_frame_valid_count;
    out->frame_ok      = s_usound_frame_ok_count;
    out->frame_bad     = s_usound_frame_bad_count;
    out->trigger_count = s_usound_trigger_count;
}

/**
 * @brief Đóng cửa sổ nghe và đặt lại máy trạng thái giải mã về đầu khung.
 *
 * DÙNG KHI NÀO: ngay trước khi vào vòng lặp chính, sau `kvc_gnss_init()` (autobaud
 * 11–15 s). Từ KVC-MCU-1.1 ngắt RX chỉ bật bên trong cửa sổ nghe nên ring không
 * thể tràn trong lúc autobaud; hàm này vẫn giữ để chắc chắn cửa sổ đang đóng và
 * FSM sạch trước khi đo mẫu đầu tiên.
 *
 * Chỉ gọi ở main context khi không có ai đang đọc ring.
 */
static inline void kvc_usound_discard_stale_rx(void) {
    kvc_usound_rx_window_close();
    s_usound_has_fresh_data = false;
    s_usound_last_err = KVC_USOUND_ERR_TIMEOUT;
}

#ifdef __cplusplus
}
#endif

#endif /* KVC_USOUND_AJSR04M_H */
