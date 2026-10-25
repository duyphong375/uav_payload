/**
 * @file main.c
 * @brief Chương trình phát gói Telemetry 32-byte định kỳ để kiểm thử Anten LoRa Ra-02 trên MCU Sonix SN34F788.
 *
 * Đối chiếu tài liệu đặc tả chuẩn:
 * - docs/hardware/wiring/KVC_MASTER_PINOUT_WIRING.md (Mục 2 & 3.1)
 * - firmware/mcu_payload/inc/kvc_pinout.h
 * - firmware/mcu_payload/inc/kvc_telemetry.h (IF-02)
 *
 * Người phụ trách: Nguyễn Tá Duy Phong
 */

#include "SN34F780.h"
#include "kvc_pinout.h"
#include "kvc_telemetry.h"
#include "kvc_imu_gy87.h"
#include "kvc_usound_ajsr04m.h"
#include "kvc_gnss_neo_m10.h"
#include "kvc_fpga_bbox.h"
#include <string.h>
#include <stdbool.h>

/* ============================================================================
 * KVC-M2-20261025-001 — VECTOR ISR RX CHO UART2 (SIÊU ÂM)
 * ============================================================================
 * Driver UART2 (kvc_usound_ajsr04m.h) là header-only, chỉ được include ở đây.
 * Handler vector phải mang đúng tên ký hiệu của startup_SN34F780.s để override
 * bản WEAK; do đó nó nằm trong main.c thay vì trong header.
 *
 * UART1 (FPGA) và UART3 (GNSS) có handler riêng trong .c của driver tương ứng.
 * ============================================================================ */
void UART2_IRQHandler(void) {
    kvc_usound_uart2_isr();
}

/* Cấu hình chế độ tọa độ:
 * 0 = Chế độ bay thực tế: Chỉ xuất tọa độ khi GPS có Fix thực sự, tuyệt đối không gửi tọa độ giả khi chưa có fix.
 * 1 = Chế độ phòng Lab: Dùng tọa độ mẫu Đà Nẵng khi chưa có sóng vệ tinh trong nhà để test Web GCS.
 */
#ifndef KVC_ENABLE_INDOOR_MOCK_GPS
#define KVC_ENABLE_INDOOR_MOCK_GPS  0
#endif

/* F7: số lần thử khởi tạo LoRa trước khi vào chế độ degraded (không phát LoRa).
 * Mỗi lần cách nhau 300 ms -> mặc định 10 lần ~ 3 giây. */
#ifndef KVC_LORA_BOOT_RETRIES
#define KVC_LORA_BOOT_RETRIES       10U
#endif

/* Cờ cho biết SX1278 đã khởi tạo được chưa. 0 = degraded mode. */
static uint8_t s_lora_available = 0U;

/* Hàm trễ thời gian phần cứng chuẩn xác tuyệt đối qua bộ đếm SysTick của Cortex-M4 (Xung 12 MHz).
 * Đồng thời cộng dồn time base monotonic (xem kvc_tick_advance bên dưới) để
 * timestamp_ms phản ánh thời gian trôi thật, kể cả thời gian chặn. */

/* Time base monotonic của firmware (ms kể từ reset). Định nghĩa sớm để delay_ms
 * dùng được. Xem khối KVC-F6 bên dưới để biết giới hạn độ chính xác. */
static volatile uint32_t s_kvc_tick_ms = 0U;

static void kvc_tick_advance(uint32_t ms) {
    s_kvc_tick_ms += ms;
}

static void delay_ms(uint32_t ms) {
    while (ms--) {
        SysTick->LOAD = (12000000UL / 1000UL) - 1UL; /* Đúng 12000 chu kỳ cho 1.0 ms */
        SysTick->VAL  = 0UL;
        SysTick->CTRL = SysTick_CTRL_CLKSOURCE_Msk | SysTick_CTRL_ENABLE_Msk;
        while ((SysTick->CTRL & SysTick_CTRL_COUNTFLAG_Msk) == 0) {
            __NOP();
        }
        SysTick->CTRL = 0UL;
        kvc_tick_advance(1U);
    }
}

/* ============================================================================
 * KVC-F6 — TIME BASE THẬT CHO timestamp_ms
 * ============================================================================
 * VẤN ĐỀ: trước đây `pkt.timestamp_ms += 1000` mỗi vòng, nên timestamp chỉ là
 * "số vòng × 1000", bỏ qua thời gian xử lý và thời gian chặn (TX LoRa 300 ms,
 * đo siêu âm 340 ms, ...). Hệ quả: các ngưỡng expiry 2 s / 3 s và cửa sổ TDM
 * 1.5 s bị lệch, và GCS nhận timestamp không khớp thời gian thực.
 *
 * CÁCH SỬA: đếm tick 1 ms bằng SysTick ở chế độ polling, cộng dồn vào một biến
 * monotonic. Không bật ngắt SysTick để không đụng NVIC/priority của các ISR
 * UART đã có ở M2.
 *
 * GIỚI HẠN (phải ghi rõ, không được coi là đồng hồ chuẩn):
 *   - Nguồn đếm là IHRC 12 MHz ±2 % theo datasheet. Vì vậy tick_ms trôi tới
 *     ~±2 % (khoảng 1,2 s mỗi phút trong điều kiện xấu). Muốn chính xác ppm
 *     phải có thạch anh ngoài hoặc hiệu chuẩn bằng 1PPS của GNSS (task riêng).
 *   - `delay_ms()` và `kvc_usound_delay_us()` đều giả định 12 MHz; nếu UCLK
 *     thật khác thì cả hai và tick_ms đều lệch cùng một tỉ lệ.
 *   - Không phải phép đo: giá trị này suy ra từ số chu kỳ SysTick.
 * ============================================================================ */

/* Trả về time base monotonic hiện tại (ms kể từ reset). */
static uint32_t kvc_millis(void) {
    return s_kvc_tick_ms;
}

/* ============================================================================
 * KVC-F10 — WATCHDOG (SN_WDT) + BOOT REASON
 * ============================================================================
 * WDT trên SN34F780 đếm bằng EXTCLK = ILRC 32 kHz (manual §9.1: "The watchdog
 * timer block use EXTCLK ... ILRC is the clock source for EXTCLK"), KHÔNG phải
 * HCLK. Vì vậy timeout tính theo 32 kHz, độc lập với cấu hình PLL/clock tree.
 *
 * Công thức: timeout ≈ LOAD / 32768 giây.
 *   LOAD = 32768 * 2  -> ~2,0 s
 *
 * Nạp lại (kick) bằng cách ghi 0x5AB9 vào WDT_RESTART (manual §9.1: "write
 * 0x5AB9 to the WDT_RESTART register as the password").
 *
 * NGUYÊN TẮC (manual §9.1 khuyến nghị): CHỈ kick ở MỘT chỗ trong main loop,
 * KHÔNG kick trong ISR — nếu kick trong ISR thì một main bị treo vẫn có thể
 * được "cứu" bởi ngắt và watchdog mất tác dụng.
 *
 * GIỚI HẠN:
 *   - ILRC 32 kHz có dung sai lớn (không phải thạch anh), nên timeout thực tế
 *     có thể lệch đáng kể so với 2,0 s. Đây là watchdog phát hiện treo, không
 *     phải bộ định thời chính xác.
 *   - Chưa có test trên kit; chưa xác nhận reset thật xảy ra sau bao lâu.
 *   - Boot reason đọc từ BTUP_STS.WDTRSTF, chỉ đúng nếu bit đó còn giữ sau reset.
 * ============================================================================ */
#define KVC_WDT_RESTART_KEY     0x5AB9UL
/* Timeout phải LỚN HƠN khoảng cách dài nhất giữa hai lần kick.
 *
 * Một vòng main hiện tại (worst case) gồm:
 *   - kvc_usound_read_robust : tới 100 ms (chờ khung 4 byte @9600)
 *   - sx1278_send_packet     : tới 300 ms (poll TxDone)
 *   - sx1278_init_tx (khi params sai): +100 ms (delay_ms(50) x2)
 *   - vòng 1000 bước         : 1000 x (delay_ms(1) + overhead poll) ≈ 2,5 s
 *   Tổng ≈ 3,0 s.
 *
 * Bản đầu tôi đặt 2,0 s -> SẼ RESET OAN mỗi vòng. Nay dùng 6 s (biên ~3 s) và
 * vẫn kick thêm một lần giữa vòng 1000 bước (sau 500 bước) để không phụ thuộc
 * hoàn toàn vào ước lượng này. Đây là biện pháp kép: timeout rộng + kick định kỳ.
 *
 * Đánh đổi: phát hiện treo chậm hơn (tối đa ~6 s thay vì 2 s). Với nhiệm vụ
 * UAV tìm kiếm cứu nạn 1 Hz telemetry, 6 s là chấp nhận được; nếu cần phát hiện
 * nhanh hơn thì phải giảm thời gian chặn (M2/M3) trước, không phải giảm timeout. */
#define KVC_WDT_LOAD_6S         (32768UL * 6UL)

/* Lý do khởi động, chốt lại ngay đầu main trước khi có gì ghi đè. */
static uint8_t s_boot_reason_wdt = 0U;

static void kvc_wdt_capture_boot_reason(void) {
    uint32_t v;

    s_boot_reason_wdt = (SN_SCU->BTUP_STS_b.WDTRSTF != 0U) ? 1U : 0U;

    /* BTUP_STS (manual §3.3.1) trộn hai loại bit:
     *   - [9] WDTRSTF và [17..23] các cờ wakeup: RW1C (ghi 1 để xoá, ghi 0 không tác dụng)
     *   - [2] GPIO_HOLD: RW thường
     * Vì vậy KHÔNG dùng bitfield RMW (sẽ xoá oan cờ wakeup khác) và cũng không
     * ghi 0x200 trơn (sẽ xoá GPIO_HOLD). Giữ nguyên GPIO_HOLD, chỉ set bit 9. */
    v = (SN_SCU->BTUP_STS & (1UL << 2))   /* giữ GPIO_HOLD */
      | (1UL << 9);                        /* WDTRSTF = 1 -> clear */
    SN_SCU->BTUP_STS = v;
}

static void kvc_wdt_init(void) {
    /* BUGFIX (self-review F10): WDTCLKEN là bit 0 của SCU_APB0CLKG (offset 0x60),
     * KHÔNG phải APB1CLKG. Bản trước ghi APB1CLKG bit 0 — đó là ADC0CLKEN, nên
     * clock WDT không được bật và watchdog sẽ không đếm (hỏng âm thầm).
     * Đối chiếu: DFP SN34F780.h APB0CLKG_b.WDTCLKEN [0:0]; manual §9.1
     * "The watchdog timer clock is enabled by WDTCLKEN bit of SCU_APB0CLKG". */
    SN_SCU->APB0CLKG |= (1U << 0);           /* WDTCLKEN */

    SN_WDT->CTRL = 0U;                       /* 1. Disable */
    SN_WDT->LOAD = KVC_WDT_LOAD_6S;          /* 2. Set LOAD (~6 s, xem giải thích ở macro) */
    SN_WDT->RESTART = KVC_WDT_RESTART_KEY;   /* 3. Unlock + reload */
    SN_WDT->CTRL = (1U << 0) | (1U << 1);    /* 4. WDTEN = 1, RSTEN = 1 (reset, không chỉ interrupt) */
}

/* Kick watchdog. Chỉ gọi từ đúng một chỗ trong main loop. */
static void kvc_wdt_feed(void) {
    SN_WDT->RESTART = KVC_WDT_RESTART_KEY;
}

/* ============================================================================
 * KVC-M1-20261025-001 — CHẨN ĐOÁN TẠM THỜI: CLOCK SAU SystemInit + TX UART5
 * ============================================================================
 * PHẠM VI (chỉ chẩn đoán, không chốt cấu hình):
 *   - In các thanh ghi clock thô đọc từ SCU để biết cây xung nhịp đang thực sự ở đâu.
 *   - In CLKSEL/PRE/DLL/DLM của UART1/2/3/5 trước và sau khi init cảm biến.
 *   - Bắn thử chuỗi "KVC-OK 0123456789" trên UART5/P0.15 để kiểm tra đường TX.
 *
 * GIỚI HẠN QUAN TRỌNG:
 *   - Đây KHÔNG phải phép đo tần số vật lý. Mọi giá trị clock in ra là đọc thanh
 *     ghi và số học suy ra từ trạng thái thanh ghi, không phải kết quả đo bằng
 *     máy hiện sóng/tần số kế.
 *   - UART5 TX chạy được chỉ chứng minh đường TX/P0.15 tương thích terminal ở
 *     cấu hình danh định của bài test. Nó KHÔNG chứng minh UCLK của UART1/2/3
 *     giống nhau, vì mỗi cổng có UARTnCLKSEL riêng.
 *   - Task này KHÔNG đổi baud/clock của UART1 (FPGA), UART2 (siêu âm), UART3 (GNSS).
 *   - Task này CÓ ghi tạm thanh ghi LC của từng cổng để bật DLAB trong lúc đọc
 *     DLL/DLM/PRE, rồi trả LC về DLAB = 0 ngay trong cùng vài µs. DLL/DLM/PRE và
 *     tốc độ baud không bị thay đổi.
 *   - Không có phép đo tần số vật lý: nếu SYSCLK không lấy từ PLL thì PLLCLK chỉ
 *     được suy ra khi nguồn PLL là IHRC; trường hợp khác in UNKNOWN.
 *
 * GIẢ ĐỊNH CỦA BÀI TEST UART5 (chưa xác minh trên kit):
 *   UCLK = 12 MHz (IHRC là clock mặc định sau reset, UARTnCLKSEL = 0 -> HCLK,
 *   AHBPRE = 0 -> HCLK = SYSCLK/1). Với PRE = 1, DLL = 78 (0x4E) ta có
 *   12.000.000 / (16 * 1 * 78) = 9615 bps, tức +0,16 % so với 9600 bps.
 *   Nếu UCLK thực tế khác 12 MHz thì tốc độ in ra sẽ khác và terminal sẽ không đọc được.
 *
 * BẬT CHẾ ĐỘ TEST ĐỘC LẬP (không chạy cảm biến/LoRa):
 *   Đặt KVC_M1_UART5_STANDALONE_TEST = 1 khi biên dịch. Mặc định 0.
 * ============================================================================ */
#ifndef KVC_M1_CLOCK_DIAG
/* =1 trong task M1 để có thể nạp và test ngay trên kit. ĐÂY LÀ CODE CHẨN ĐOÁN
 * TẠM THỜI: phải đặt =0 (hoặc xoá khối KVC-M1 trong main()) trước khi dùng
 * firmware cho vận hành thật. */
#define KVC_M1_CLOCK_DIAG            1
#endif
#ifndef KVC_M1_UART5_BURST_LINES
#define KVC_M1_UART5_BURST_LINES     5
#endif
/* KVC-M2: chu kỳ công bố thống kê RX ring, tính bằng nhịp poll 1 ms.
 * 5000 nhịp ~ 5 giây. Đủ thưa để không chiếm UART5, đủ dày để thấy tràn sớm. */
#ifndef KVC_M2_RX_STATS_PERIOD_TICKS
#define KVC_M2_RX_STATS_PERIOD_TICKS 5000U
#endif
#ifndef KVC_M1_UART5_STANDALONE_TEST
#define KVC_M1_UART5_STANDALONE_TEST 0
#endif

#define KVC_M1_UART5_TEST_PRE        1U
#define KVC_M1_UART5_TEST_DLL        78U   /* 0x4E -> 9615 bps khi UCLK = 12 MHz */
#define KVC_M1_HCLK_ASSUMED          12000000UL

/* Offset thanh ghi UART theo User Manual SN34F780 V1.7 mục 15.11 (đã đối chiếu DFP):
 * 0x00 = RB/TH  hoặc DLL (DLAB = 1)
 * 0x04 = IE     hoặc DLM (DLAB = 1)
 * 0x08 = II/FIFOCTRL hoặc PRE (DLAB = 1)
 * 0x0C = LC, 0x14 = LS */
#define KVC_M1_UART_DLL_OFS          0x00U
#define KVC_M1_UART_DLM_OFS          0x04U
#define KVC_M1_UART_PRE_OFS          0x08U
#define KVC_M1_UART_LC_OFS           0x0CU

#if (KVC_M1_CLOCK_DIAG == 1)

/* system_SN34F780.c không có header khai báo hai ký hiệu này trong project hiện tại.
 * Khai báo extern cục bộ để không phải sửa header (ngoài allowed files của task). */
extern void SystemCoreClockUpdate(void);
extern uint32_t SystemCoreClock;

static uint8_t  s_m1_tx_ready   = 0;
static uint32_t s_m1_pllclk     = 0;
static uint8_t  s_m1_pllclk_ok  = 0;

/* Bộ đệm text của khối chẩn đoán.
 * Tách ĐỊNH DẠNG khỏi TRUYỀN: sau khi các driver cảm biến đã init, UART1/2/3
 * đang nhận dữ liệu nhưng chưa được polling. In đồng bộ lúc đó sẽ chặn RX và
 * làm tràn FIFO 16 byte. Vì vậy phase 1 chỉ ĐỊNH DẠNG vào buffer, rồi xả dần
 * trong vòng polling 1 ms của main loop (mỗi lượt vài byte, không delay). */
#define KVC_M1_SNAP_MAX 768U
static char     s_m1_snap[KVC_M1_SNAP_MAX];
static uint16_t s_m1_snap_len   = 0;
static uint16_t s_m1_snap_pos   = 0;
static uint8_t  s_m1_snap_ready = 0;

/* Định nghĩa sớm để kvc_m2_stats_tick() dùng được trước khi hàm được viết. */
static void kvc_m1_dump_rx_stats(void);
/* KVC-FIX-ABI-20261025-001: self-check IF-02 được gọi trong khối clock dump. */
static void kvc_m1_dump_abi_selfcheck(void);

static void kvc_m1_buf_putc(char c) {
    if (s_m1_snap_len < (uint16_t)(KVC_M1_SNAP_MAX - 1U)) {
        s_m1_snap[s_m1_snap_len] = c;
        s_m1_snap_len++;
    }
}

static void kvc_m1_buf_puts(const char *s) {
    while (*s != '\0') {
        kvc_m1_buf_putc(*s);
        s++;
    }
}

static void kvc_m1_buf_hex32(uint32_t v) {
    static const char s_hex[] = "0123456789ABCDEF";
    int shift;
    kvc_m1_buf_puts("0x");
    for (shift = 28; shift >= 0; shift -= 4) {
        kvc_m1_buf_putc(s_hex[(v >> (uint32_t)shift) & 0x0FU]);
    }
}

static void kvc_m1_buf_dec32(uint32_t v) {
    char buf[10];
    int n = 0;
    if (v == 0U) {
        kvc_m1_buf_putc('0');
        return;
    }
    while ((v != 0U) && (n < 10)) {
        buf[n] = (char)('0' + (char)(v % 10U));
        n++;
        v /= 10U;
    }
    while (n > 0) {
        n--;
        kvc_m1_buf_putc(buf[n]);
    }
}

static void kvc_m1_buf_reset(void) {
    s_m1_snap_len   = 0;
    s_m1_snap_pos   = 0;
    s_m1_snap_ready = 0;
}

/* Xả toàn bộ buffer, chờ THRE từng byte. CHỈ dùng khi UART1/2/3 chưa nhận
 * dữ liệu (phase 0, trước khi init cảm biến) hoặc ở chế độ test độc lập. */
static void kvc_m1_flush_blocking(void) {
    uint16_t i;
    if (s_m1_tx_ready == 0U) {
        return;
    }
    for (i = 0; i < s_m1_snap_len; i++) {
        uint32_t guard = 200000UL;
        while (((SN_UART5->LS & (1U << 5)) == 0U) && (--guard > 0U)) {
            __NOP();
        }
        if (guard == 0U) {
            s_m1_tx_ready = 0;   /* THRE không bật -> ngừng in, không chặn khởi tạo */
            break;
        }
        SN_UART5->TH = (uint32_t)(uint8_t)s_m1_snap[i];
    }
    s_m1_snap_pos   = s_m1_snap_len;
    s_m1_snap_ready = 0;
}

/* Xả dần buffer, KHÔNG chặn: mỗi lượt ghi tối đa vài byte nếu THRE sẵn sàng,
 * sau đó trả về ngay để main loop tiếp tục poll UART1/2/3. */
static void kvc_m1_diag_pump(void) {
    uint32_t budget = 8U;

    if ((s_m1_snap_ready == 0U) || (s_m1_tx_ready == 0U)) {
        return;
    }
    while ((budget > 0U) && (s_m1_snap_pos < s_m1_snap_len)) {
        if ((SN_UART5->LS & (1U << 5)) == 0U) {
            return;   /* TX chưa sẵn sàng: để lượt sau, không chờ */
        }
        SN_UART5->TH = (uint32_t)(uint8_t)s_m1_snap[s_m1_snap_pos];
        s_m1_snap_pos++;
        budget--;
    }
    if (s_m1_snap_pos >= s_m1_snap_len) {
        s_m1_snap_ready = 0;
    }
}

/* KVC-M2: công bố lại thống kê RX ring theo chu kỳ để có thể theo dõi gate
 * "oe/fe/drop = 0 trong 10 phút" mà không cần nạp lại firmware.
 *
 * Cách đếm thời gian: đếm số nhịp của vòng poll 1 ms, KHÔNG dùng timestamp_ms
 * (timestamp đó đang là hằng số cộng dồn giả). Vì delay_ms() nạp cố định 12000
 * chu kỳ cho 1 ms ở 12 MHz, một nhịp poll xấp xỉ 1 ms. Đây là ước lượng, không
 * phải phép đo: nếu HCLK khác 12 MHz thì chu kỳ thực sẽ lệch tương ứng.
 *
 * Không ghi đè buffer đang xả dở: chỉ định dạng khi s_m1_snap_ready == 0. */
static void kvc_m2_stats_tick(void) {
    static uint32_t s_ticks = 0U;

    if (s_m1_tx_ready == 0U) {
        return;
    }
    s_ticks++;
    if (s_ticks < (uint32_t)KVC_M2_RX_STATS_PERIOD_TICKS) {
        return;
    }
    s_ticks = 0U;

    if (s_m1_snap_ready != 0U) {
        return;   /* vẫn còn text chưa xả hết: bỏ nhịp này, không ghi đè */
    }

    kvc_m1_buf_reset();
    kvc_m1_buf_puts("\r\n[RING]");
    kvc_m1_dump_rx_stats();
    s_m1_snap_ready = 1;
}

/* Cấu hình UART5 cho bài test danh định. Chỉ tác động UART5 và P0.14/P0.15.
 * Không đụng UART1/2/3, không đổi SYSCLK/PLL/HCLK. */
static void kvc_m1_uart5_diag_init(void) {
    s_m1_tx_ready = 0;

    /* Clock gate: UART5CLKEN = APB1CLKG bit 5; P0CLKEN = APB1CLKG bit 17 */
    SN_SCU->APB1CLKG |= (1U << 5);
    SN_SCU->APB1CLKG |= (1U << 17);

    /* AFIO P0_AFIO2 (offset 0x208): IO14[14:10] = 1 -> URXD5, IO15[19:15] = 1 -> UTXD5.
     * Chỉ ghi 2 trường này, giữ nguyên P0.12 (IO12[4:0]) và P0.13 (IO13[9:5]). */
    SN_ALWAYSON->P0_AFIO2 = (SN_ALWAYSON->P0_AFIO2 & ~((0x1FU << 10) | (0x1FU << 15)))
                          | (1U << 10)
                          | (1U << 15);

    /* DLAB = 1 để truy cập DLL/DLM (0x00/0x04) và PRE (0x08) theo mục 15.11 manual.
     * PRE là bộ chia NGUYÊN 1..31 (mục 15.11.9), không phải fractional. */
    SN_UART5->LC |= (1U << 7);
    SN_UART5->PRE = KVC_M1_UART5_TEST_PRE;
    SN_UART5->DLL = KVC_M1_UART5_TEST_DLL;
    SN_UART5->DLM = 0x00U;

    /* DLAB = 0: khung 8N1. Sau đó mới ghi FIFOCTRL vì FIFOCTRL và PRE chung offset 0x08. */
    SN_UART5->LC = 0x03U;
    SN_UART5->FIFOCTRL = 0x07U;   /* FIFOEN = 1, RXFIFORST = 1, TXFIFORST = 1 */
    SN_UART5->IE = 0x00U;

    s_m1_tx_ready = 1;
}

/* PLLCLK suy ra từ PLLSTS. Không phụ thuộc SYSCLKSTS: một cổng UART có thể chọn
 * UCLK = PLLCLK qua UARTnCLKSEL riêng trong khi SYSCLK vẫn chạy IHRC, nên PLL
 * phải được giải mã độc lập với nguồn SYSCLK.
 * Giới hạn: chỉ xác định được khi nguồn PLL là IHRC (12 MHz). Nếu PLL lấy từ EHS
 * thì tần số thạch anh không đọc được từ thanh ghi -> UNKNOWN (đúng, không đoán). */
static void kvc_m1_compute_pllclk(void) {
    uint32_t fs_div = 0;
    uint32_t ns;

    s_m1_pllclk_ok = 0;
    if (SN_SCU->PLLSTS_b.PLLCLKSTS != 0U) {
        return;   /* PLL nguồn EHS: chưa biết tần số thạch anh */
    }
    switch (SN_SCU->PLLSTS_b.FSSTS) {
        case 0U: fs_div = 32U; break;
        case 1U: fs_div = 16U; break;
        case 2U: fs_div = 8U;  break;
        case 3U: fs_div = 4U;  break;
        default: return;
    }
    ns = (uint32_t)SN_SCU->PLLSTS_b.NSSTS;
    if (ns == 0U) {
        return;
    }
    s_m1_pllclk = (KVC_M1_HCLK_ASSUMED * ns) / fs_div;
    s_m1_pllclk_ok = 1;
}

/* Đọc DLL/DLM/PRE thật của một cổng rồi ĐỊNH DẠNG vào buffer (không truyền).
 * Phải tạm bật DLAB; chỉ đọc thanh ghi chia tần nên không mất dữ liệu RX (không
 * đọc RB). LC được khôi phục với DLAB = 0 ngay trong cùng vài µs. */
static void kvc_m1_dump_uart(const char *name, uint32_t base,
                             uint8_t clken, uint32_t clksel_bit,
                             uint32_t hclk) {
    volatile uint32_t *u = (volatile uint32_t *)base;
    uint32_t lc;
    uint32_t dll;
    uint32_t dlm;
    uint32_t pre;
    uint32_t uclk;
    uint32_t dl;

    kvc_m1_buf_puts(name);
    kvc_m1_buf_puts(": CLKSEL=");
    kvc_m1_buf_dec32((SN_SCU->CLKSEL >> clksel_bit) & 1U);
    kvc_m1_buf_puts(" CLKEN=");
    kvc_m1_buf_dec32((uint32_t)clken);

    if (clken == 0U) {
        kvc_m1_buf_puts(" NOT_INITIALIZED\r\n");
        return;
    }

    lc = u[KVC_M1_UART_LC_OFS / 4U];
    u[KVC_M1_UART_LC_OFS / 4U] = lc | (1U << 7);
    dll = u[KVC_M1_UART_DLL_OFS / 4U] & 0xFFU;
    dlm = u[KVC_M1_UART_DLM_OFS / 4U] & 0xFFU;
    pre = u[KVC_M1_UART_PRE_OFS / 4U] & 0x1FU;
    /* Khôi phục LC với DLAB = 0: DLAB là trạng thái tạm của phép đọc này, để sót
     * DLAB = 1 sẽ làm cổng không truy cập được RB/TH (mất TX/RX). */
    u[KVC_M1_UART_LC_OFS / 4U] = lc & ~(1U << 7);

    kvc_m1_buf_puts(" PRE=");
    kvc_m1_buf_dec32(pre);
    kvc_m1_buf_puts(" DLL=");
    kvc_m1_buf_hex32(dll);
    kvc_m1_buf_puts(" DLM=");
    kvc_m1_buf_hex32(dlm);
    kvc_m1_buf_puts(" LC=");
    kvc_m1_buf_hex32(lc & 0xFFU);

    /* UCLK: CLKSEL = 0 -> HCLK, 1 -> PLLCLK. Không suy ra được thì ghi UNKNOWN. */
    uclk = 0;
    kvc_m1_buf_puts(" UCLK=");
    if (((SN_SCU->CLKSEL >> clksel_bit) & 1U) == 0U) {
        uclk = hclk;
        kvc_m1_buf_dec32(uclk);
    } else if (s_m1_pllclk_ok != 0U) {
        uclk = s_m1_pllclk;
        kvc_m1_buf_dec32(uclk);
    } else {
        kvc_m1_buf_puts("UNKNOWN");
    }

    dl = (dlm << 8) | dll;
    kvc_m1_buf_puts(" BAUD_CALC=");
    if ((uclk == 0U) || (pre == 0U) || (dl == 0U)) {
        kvc_m1_buf_puts("N/A");
    } else {
        kvc_m1_buf_dec32(uclk / (16U * pre * dl));
    }
    kvc_m1_buf_puts("\r\n");
}

static void kvc_m1_dump_clock_regs(void) {
    uint32_t hclk;

    kvc_m1_buf_puts("PLLSTS=");
    kvc_m1_buf_hex32(SN_SCU->PLLSTS);
    kvc_m1_buf_puts("\r\n");
    kvc_m1_buf_puts("CLKPRE=");
    kvc_m1_buf_hex32(SN_SCU->CLKPRE);
    kvc_m1_buf_puts("\r\n");
    kvc_m1_buf_puts("CLKSEL=");
    kvc_m1_buf_hex32(SN_SCU->CLKSEL);
    kvc_m1_buf_puts("\r\n");
    kvc_m1_buf_puts("APB0CLKG=");
    kvc_m1_buf_hex32(SN_SCU->APB0CLKG);
    kvc_m1_buf_puts(" APB1CLKG=");
    kvc_m1_buf_hex32(SN_SCU->APB1CLKG);
    kvc_m1_buf_puts("\r\n");

    /* KVC-F10: lý do khởi động, đọc từ BTUP_STS.WDTRSTF trước khi bị xoá. */
    kvc_m1_buf_puts("BOOT_REASON=");
    kvc_m1_buf_puts((s_boot_reason_wdt != 0U) ? "WATCHDOG_RESET" : "POWER_ON_OR_PIN");
    kvc_m1_buf_puts("\r\n");

    /* KVC-FIX-ABI-20261025-001: kiểm contract IF-02 ngay khi boot. */
    kvc_m1_dump_abi_selfcheck();

    kvc_m1_buf_puts("SYSCLKSTS=");
    kvc_m1_buf_dec32((uint32_t)SN_SCU->PLLSTS_b.SYSCLKSTS);
    kvc_m1_buf_puts(" PLLEN=");
    kvc_m1_buf_dec32((uint32_t)SN_SCU->PLLSTS_b.PLLENSTS);
    kvc_m1_buf_puts(" PLLCLKSTS=");
    kvc_m1_buf_dec32((uint32_t)SN_SCU->PLLSTS_b.PLLCLKSTS);
    kvc_m1_buf_puts(" FSSTS=");
    kvc_m1_buf_dec32((uint32_t)SN_SCU->PLLSTS_b.FSSTS);
    kvc_m1_buf_puts(" NSSTS=");
    kvc_m1_buf_dec32((uint32_t)SN_SCU->PLLSTS_b.NSSTS);
    kvc_m1_buf_puts(" AHBPRE=");
    kvc_m1_buf_dec32((uint32_t)SN_SCU->CLKPRE_b.AHBPRE);
    kvc_m1_buf_puts("\r\n");

    SystemCoreClockUpdate();
    hclk = SystemCoreClock;
    kvc_m1_buf_puts("HCLK_CALC=");
    kvc_m1_buf_dec32(hclk);
    kvc_m1_buf_puts(" (SystemCoreClockUpdate: suy ra tu trang thai thanh ghi, KHONG phai phep do)\r\n");
    kvc_m1_buf_puts("PLLCLK_CALC=");
    if (s_m1_pllclk_ok != 0U) {
        kvc_m1_buf_dec32(s_m1_pllclk);
    } else {
        kvc_m1_buf_puts("UNKNOWN");
    }
    kvc_m1_buf_puts("\r\n");
}

/* In thống kê RX ring của 3 cổng cảm biến. Đây là SỐ ĐO THẬT từ counter phần
 * mềm/phần cứng, khác với các giá trị clock suy ra từ thanh ghi ở trên. */
static void kvc_m1_dump_rx_stats(void) {
#if (KVC_M1_CLOCK_DIAG == 1)
    KvcBBoxRxStats   bbox;
    KvcGnssRxStats   gnss;
    KvcUsoundRxStats usd;

    kvc_fpga_bbox_get_rx_stats(&bbox);
    kvc_gnss_get_rx_stats(&gnss);
    kvc_usound_get_rx_stats(&usd);

    kvc_m1_buf_puts("FPGA  pend=");
    kvc_m1_buf_dec32((uint32_t)bbox.bytes_pending);
    kvc_m1_buf_puts(" drop=");
    kvc_m1_buf_dec32(bbox.ring_dropped);
    kvc_m1_buf_puts(" oe=");
    kvc_m1_buf_dec32(bbox.overrun_count);
    kvc_m1_buf_puts(" fe=");
    kvc_m1_buf_dec32(bbox.framing_count);
    kvc_m1_buf_puts(" isr=");
    kvc_m1_buf_dec32(bbox.isr_count);
    kvc_m1_buf_puts("\r\n");

    kvc_m1_buf_puts("GNSS  pend=");
    kvc_m1_buf_dec32((uint32_t)gnss.bytes_pending);
    kvc_m1_buf_puts(" drop=");
    kvc_m1_buf_dec32(gnss.ring_dropped);
    kvc_m1_buf_puts(" oe=");
    kvc_m1_buf_dec32(gnss.overrun_count);
    kvc_m1_buf_puts(" fe=");
    kvc_m1_buf_dec32(gnss.framing_count);
    kvc_m1_buf_puts(" isr=");
    kvc_m1_buf_dec32(gnss.isr_count);
    kvc_m1_buf_puts("\r\n");

    kvc_m1_buf_puts("USND  pend=");
    kvc_m1_buf_dec32((uint32_t)usd.bytes_pending);
    kvc_m1_buf_puts(" drop=");
    kvc_m1_buf_dec32(usd.ring_dropped);
    kvc_m1_buf_puts(" oe=");
    kvc_m1_buf_dec32(usd.overrun_count);
    kvc_m1_buf_puts(" fe=");
    kvc_m1_buf_dec32(usd.framing_count);
    kvc_m1_buf_puts(" isr=");
    kvc_m1_buf_dec32(usd.isr_count);
    kvc_m1_buf_puts("\r\n");
#endif
}

/* KVC-FIX-ABI-20261025-001: tự kiểm ABI IF-02 ngay trên MCU.
 *
 * Dựng lại đúng golden vector GV-01 bằng struct thật trong kvc_telemetry.h,
 * tính CRC-16/CCITT-FALSE trên 30 byte đầu rồi so với hằng số đã pin.
 * Mục đích: nếu ai sửa struct/thứ tự field/CRC coverage mà không cập nhật
 * IF-02 + Gateway + parser Python, log UART5 sẽ báo MISMATCH ngay khi boot
 * thay vì phát frame sai xuống trạm đất.
 *
 * Hàm này CHỈ đọc/định dạng, không gửi LoRa, không đổi cấu hình phần cứng.
 */
static void kvc_m1_dump_abi_selfcheck(void) {
    KvcTelemetryPacket32 pkt;
    uint16_t crc;

    memset(&pkt, 0, sizeof(pkt));
    pkt.msg_id         = KVC_MSG_ID_TELEMETRY;
    pkt.seq_num        = 42U;
    pkt.timestamp_ms   = 1000UL;
    pkt.target_lat     = 107723450L;
    pkt.target_lon     = 1066578900L;
    pkt.target_x_local = 150;
    pkt.target_y_local = 320;
    pkt.alt_dist_cm    = 240U;
    pkt.class_id       = KVC_CLASS_ID_PERSON;
    pkt.confidence     = 92U;
    pkt.sensor_flags   = 0x0FU;
    pkt.battery_raw    = 126U;
    kvc_finalize_telemetry_packet(&pkt);
    crc = pkt.crc16;

    kvc_m1_buf_puts("ABI GV-01 SIZE=");
    kvc_m1_buf_dec32((uint32_t)sizeof(KvcTelemetryPacket32));
    kvc_m1_buf_puts(" CRC=");
    kvc_m1_buf_hex32((uint32_t)crc);
    kvc_m1_buf_puts(" EXPECT=");
    kvc_m1_buf_hex32((uint32_t)KVC_GOLDEN_GV01_CRC16);
    kvc_m1_buf_puts(kvc_telemetry_match_golden_gv01(&pkt) ? " PASS\r\n"
                                                          : " FAIL\r\n");
}

/* phase 0: trước khi init cảm biến — UART1/2/3 chưa nhận dữ liệu nên được phép
 *          xả text đồng bộ (blocking) để log chắc chắn ra hết.
 * phase 1: sau khi init cảm biến — UART1/2/3 đang nhận dữ liệu nhưng chưa được
 *          poll, nên CHỈ định dạng vào buffer rồi trả về ngay; main loop xả dần
 *          qua kvc_m1_diag_pump() để không chặn RX / không tràn FIFO 16 byte. */
static void kvc_m1_diag(uint8_t phase) {
    uint32_t hclk;
    uint8_t u1, u2, u3, u5;
    uint8_t i;

    if (phase == 0U) {
        kvc_m1_uart5_diag_init();
        kvc_m1_compute_pllclk();
    }
    if (s_m1_tx_ready == 0U) {
        return;   /* UART5 không lên được: bỏ qua, không chặn boot */
    }

    kvc_m1_buf_reset();

    if (phase == 0U) {
        kvc_m1_buf_puts("\r\n=== KVC-M1-20261025-001 CLOCK DIAG (TEMPORARY) ===\r\n");
        kvc_m1_buf_puts("NOTE: register reads + derived arithmetic, NOT a measured frequency.\r\n");
        kvc_m1_dump_clock_regs();   /* gọi SystemCoreClockUpdate() bên trong */
        kvc_m1_buf_puts("--- PRE-INIT ---\r\n");
    } else {
        kvc_m1_buf_puts("--- POST-INIT ---\r\n");
    }

    /* Lấy HCLK sau khi SystemCoreClockUpdate() đã chạy, không dùng giá trị 0 ban đầu. */
    hclk = SystemCoreClock;

    u1 = ((SN_SCU->APB0CLKG & (1U << 4)) != 0U) ? 1U : 0U;
    u2 = ((SN_SCU->APB0CLKG & (1U << 5)) != 0U) ? 1U : 0U;
    u3 = ((SN_SCU->APB0CLKG & (1U << 6)) != 0U) ? 1U : 0U;
    u5 = ((SN_SCU->APB1CLKG & (1U << 5)) != 0U) ? 1U : 0U;

    kvc_m1_dump_uart("UART1/FPGA  ", SN_UART1_BASE, u1, 11U, hclk);
    kvc_m1_dump_uart("UART2/USOUND", SN_UART2_BASE, u2, 12U, hclk);
    kvc_m1_dump_uart("UART3/GNSS  ", SN_UART3_BASE, u3, 13U, hclk);
    kvc_m1_dump_uart("UART5/DEBUG ", SN_UART5_BASE, u5, 15U, hclk);

    /* KVC-M2: chỉ báo nghẽn RX ngay từ đầu. Ở phase 1 (sau khi ring đã chạy)
     * đây là số liệu chẩn đoán thật, không phải suy luận từ thanh ghi. */
    if (phase == 1U) {
        kvc_m1_buf_puts("--- RX RING STATS ---\r\n");
        kvc_m1_dump_rx_stats();
    }

    if (phase == 0U) {
        kvc_m1_buf_puts("ASSUME: UART5 test expects UCLK=12000000 (IHRC reset default; NOT measured).\r\n");
        kvc_m1_buf_puts("ASSUME: PRE=1 DLL=78 -> 9615 bps nominal for 9600 target (+0.16%).\r\n");
        kvc_m1_buf_puts("ASSUME: UART5 OK chi xac nhan TX/P0.15, KHONG xac nhan UCLK UART1/2/3.\r\n");
    }

    /* Chuỗi kiểm tra có giới hạn, không tạo vòng lặp vô hạn. */
    for (i = 0; i < (uint8_t)KVC_M1_UART5_BURST_LINES; i++) {
        kvc_m1_buf_puts("KVC-OK 0123456789\r\n");
    }

    if (phase == 0U) {
        kvc_m1_flush_blocking();
    } else {
        s_m1_snap_ready = 1;   /* main loop xả dần, không chặn UART1/2/3 */
    }

#if (KVC_M1_UART5_STANDALONE_TEST == 1)
    /* Chế độ test độc lập: KHÔNG chạy LoRa/cảm biến, chỉ phát chuỗi liên tục.
     * Phải bật rõ ràng bằng macro khi biên dịch; mặc định 0 nên luồng thường không đổi. */
    kvc_m1_buf_reset();
    kvc_m1_buf_puts("STANDALONE TEST MODE: sensors/LoRa are NOT initialized.\r\n");
    kvc_m1_flush_blocking();
    while (1) {
        kvc_m1_buf_reset();
        kvc_m1_buf_puts("KVC-OK 0123456789\r\n");
        kvc_m1_flush_blocking();
        delay_ms(500);
    }
#endif
}

#endif /* KVC_M1_CLOCK_DIAG */

/* ============================================================================
 * ĐIỀU KHIỂN CHÂN SPI VÀ GPIO CHO MODULE LORA RA-02 (SX1278)
 * ============================================================================ */
static inline void lora_nss(uint8_t level) {
    if (level) SN_GPIO2->BSET = (1U << KVC_PIN_LORA_NSS_PIN);
    else       SN_GPIO2->BCLR = (1U << KVC_PIN_LORA_NSS_PIN);
}

static inline void lora_sck(uint8_t level) {
    if (level) SN_GPIO2->BSET = (1U << KVC_PIN_LORA_SCK_PIN);
    else       SN_GPIO2->BCLR = (1U << KVC_PIN_LORA_SCK_PIN);
}

static inline void lora_mosi(uint8_t level) {
    if (level) SN_GPIO2->BSET = (1U << KVC_PIN_LORA_MOSI_PIN);
    else       SN_GPIO2->BCLR = (1U << KVC_PIN_LORA_MOSI_PIN);
}

static inline uint8_t lora_miso(void) {
    return (SN_GPIO2->DATAIN & (1U << KVC_PIN_LORA_MISO_PIN)) ? 1 : 0;
}

/* Truyền nhận 1 byte SPI qua bit-banging tốc độ khoảng 500kHz - 1MHz ổn định trên dây cắm */
static uint8_t spi_transfer(uint8_t data) {
    uint8_t rx = 0;
    for (int i = 7; i >= 0; i--) {
        lora_sck(0);
        lora_mosi((data >> i) & 1);
        for (volatile int d = 0; d < 25; d++) { __NOP(); }
        lora_sck(1);
        if (lora_miso()) rx |= (1 << i);
        for (volatile int d = 0; d < 25; d++) { __NOP(); }
    }
    lora_sck(0);
    return rx;
}

static uint8_t sx1278_read_reg(uint8_t addr) {
    lora_nss(0);
    spi_transfer(addr & 0x7F);
    uint8_t val = spi_transfer(0x00);
    lora_nss(1);
    return val;
}

static void sx1278_write_reg(uint8_t addr, uint8_t val) {
    lora_nss(0);
    spi_transfer(addr | 0x80);
    spi_transfer(val);
    lora_nss(1); 
}

/* Khởi tạo module LoRa Ra-02 ở chế độ Phát */
static uint8_t sx1278_init_tx(void) {
    /* 1. Đặt mức logic tĩnh an toàn trước khi bật DIR */
    lora_nss(1);
    lora_sck(0);
    SN_GPIO2->BSET = (1U << KVC_PIN_LORA_RST_PIN);

    /* Thiết lập hướng chân GPIO Port 2 (DIR: 1 = Output, 0 = Input) */
    SN_GPIO2->DIR |= (1U << KVC_PIN_LORA_NSS_PIN) |
                     (1U << KVC_PIN_LORA_SCK_PIN) |
                     (1U << KVC_PIN_LORA_MOSI_PIN) |
                     (1U << KVC_PIN_LORA_RST_PIN);
    SN_GPIO2->DIR &= ~((1U << KVC_PIN_LORA_MISO_PIN) | (1U << KVC_PIN_LORA_DIO0_PIN));

    /* 2. Reset cứng module Ra-02 qua chân P2.9: Kéo LOW 50ms, nhả HIGH chờ 50ms cho thạch anh SX1278 ổn định */
    SN_GPIO2->BCLR = (1U << KVC_PIN_LORA_RST_PIN);
    delay_ms(50);
    SN_GPIO2->BSET = (1U << KVC_PIN_LORA_RST_PIN);
    delay_ms(50);

    /* 3. Kiểm tra thanh ghi nhận diện chip RegVersion (0x42) phải là 0x12 */
    uint8_t ver = sx1278_read_reg(0x42);
    if (ver != 0x12) {
        return 0; /* Lỗi nối dây SPI hoặc tiếp xúc lỏng */
    }

    /* 4. Chuyển sang LoRa Sleep rồi Standby */
    sx1278_write_reg(0x01, 0x80);
    delay_ms(10);
    sx1278_write_reg(0x01, 0x81);
    delay_ms(10);

    /* 5. Cấu hình tần số sóng mang 433.0 MHz (0x6C4000) */
    sx1278_write_reg(0x06, 0x6C);
    sx1278_write_reg(0x07, 0x40); /* 0x40 khớp chuẩn 433.0 MHz (7094272 * 61.035 Hz) */
    sx1278_write_reg(0x08, 0x00);

    /* 6. Công suất phát +14 dBm qua chân PA_BOOST (tiết kiệm dòng ~80mA, triệt tiêu sụt áp 3.3V gây rơi gói tin) */
    sx1278_write_reg(0x09, 0x8C);

    /* 7. Cấu hình Modem: Băng thông 125kHz, Coding Rate 4/5 */
    sx1278_write_reg(0x1D, 0x72);
    /* Spreading Factor 7 (SF7), Bật kiểm tra CRC phần cứng */
    sx1278_write_reg(0x1E, 0x74);
    /* Bật tự động điều chỉnh độ lợi (AGC Auto) */
    sx1278_write_reg(0x26, 0x04);
    /* Khóa mạng nội bộ KVC Sync Word 0x12 (Khớp 100% với ESP32 Gateway) */
    sx1278_write_reg(0x39, KVC_LORA_SYNC_WORD);

    /* Đặt con trỏ cơ sở hàng đợi FIFO TX */
    sx1278_write_reg(0x0E, 0x00);
    sx1278_write_reg(0x0F, 0x00);

    return 1;
}

/* Phát 1 gói tin dữ liệu ra Anten */
static void sx1278_send_packet(const uint8_t *payload, uint8_t len) {
    /* 0. AUTO-RECOVERY TẦNG 1: Kiểm tra chip SX1278 có bị sụt áp reset về FSK (bit 7 LongRangeMode == 0) không.
     *    Nếu có, lập tức khôi phục lại cấu hình LoRa chuẩn trước khi gửi */
    if ((sx1278_read_reg(0x01) & 0x80) == 0) {
        (void)sx1278_init_tx();
    }

    /* 1. Đưa về chế độ Standby */
    sx1278_write_reg(0x01, 0x81);

    /* 2. Xóa sạch mọi cờ ngắt cũ còn sót lại */
    sx1278_write_reg(0x12, 0xFF);

    /* 3. Đặt con trỏ bộ đệm FIFO về vị trí gốc TX (0x00) */
    sx1278_write_reg(0x0E, 0x00);
    sx1278_write_reg(0x0D, 0x00);
    sx1278_write_reg(0x22, len);

    /* 4. Nạp mảng byte vào thanh ghi FIFO 0x00 */
    lora_nss(0);
    spi_transfer(0x00 | 0x80);
    for (uint8_t i = 0; i < len; i++) {
        spi_transfer(payload[i]);
    }
    lora_nss(1);

    /* 5. Chuyển sang chế độ TX để bắt đầu bắn sóng ra anten */
    sx1278_write_reg(0x01, 0x83);

    /* 6. Chờ cờ phát xong TxDone (bit 3 của thanh ghi 0x12 RegIrqFlags) */
    /* Thời gian truyền 32 bytes ở SF7/125kHz là khoảng 67ms. Cho phép tối đa 300ms */
    uint32_t timeout = 300;
    while (((sx1278_read_reg(0x12) & 0x08) == 0) && (--timeout > 0)) {
        delay_ms(1);
    }

    /* AUTO-RECOVERY TẦNG 2: Nếu quá 300ms không nhận được cờ TxDone,
     * chứng tỏ chip LoRa bị brown-out sụt áp hoặc kẹt SPI -> Reset cứng và khởi tạo lại ngay lập tức! */
    if (timeout == 0) {
        (void)sx1278_init_tx();
        return;
    }

    /* 7. Xóa cờ ngắt sau khi phát xong */
    sx1278_write_reg(0x12, 0xFF);

    /* 8. Đưa chip về Standby để giải phóng khối khuếch đại công suất PA */
    sx1278_write_reg(0x01, 0x81);
}

int main(void) {
    /* KVC-F10: đọc lý do reset TRƯỚC mọi thứ khác, rồi xoá cờ. Nếu vừa bị
     * watchdog reset thì s_boot_reason_wdt = 1 để báo qua UART5 ở chẩn đoán. */
    kvc_wdt_capture_boot_reason();

#if (KVC_M1_CLOCK_DIAG == 1)
    /* KVC-M1-20261025-001: chẩn đoán clock + TX UART5 phải chạy TRƯỚC vòng chờ
     * sx1278_init_tx() bên dưới, vì vòng đó có thể chặn boot khi thiếu module LoRa.
     * Chỉ đọc thanh ghi và in log; không đổi SYSCLK/PLL/HCLK/UART1/2/3. */
    kvc_m1_diag(0);
#endif

    /* 1. Cấp xung nhịp APB1 cho GPIO Port 0 (IMU), Port 1 (LED) và Port 2 (LoRa Ra-02) */
    SN_SCU->APB1CLKG |= (1U << 17) | (1U << 18) | (1U << 19);

    /* Đảm bảo chân LED1 (P1.12) và LED2 (P1.13) là GPIO */
    SN_ALWAYSON->P1_AFIO2 &= ~((0x1FU << 0) | (0x1FU << 5));

    /* 2. Cấu hình đèn LED1 (P1.12) và LED2 (P1.13) trên kit làm đèn chỉ báo */
    SN_GPIO1->DIR |= (1U << KVC_PIN_BOARD_LED1_PIN) | (1U << KVC_PIN_BOARD_LED2_PIN);

    /* TEST ĐÈN LED KHỞI ĐỘNG (0.5 giây): Bật cả 2 LED1 và LED2 sáng để kiểm tra phần cứng và Jumper JP10/JP11 */
    KVC_BOARD_LED1_ON();
    KVC_BOARD_LED2_ON();
    delay_ms(500);
    KVC_BOARD_LED1_OFF();
    KVC_BOARD_LED2_OFF();
    delay_ms(200);

    /* 3. Khởi tạo module LoRa Ra-02 (Chờ đến khi SPI nhận đúng chip 0x12)
     *
     * FIX (Codex F7): trước đây là `while (!sx1278_init_tx())` KHÔNG có giới hạn,
     * nên thiếu module LoRa là treo boot vĩnh viễn, không đo được cảm biến, không
     * có log. Nay thử tối đa KVC_LORA_BOOT_RETRIES lần rồi đi tiếp ở chế độ
     * degraded: vẫn chạy cảm biến, chỉ không phát LoRa.
     *
     * GIỚI HẠN: nếu LoRa không lên, nhiệm vụ không thể hoàn thành (không truyền
     * về GCS). Đây là chế độ để CHẨN ĐOÁN, không phải chế độ vận hành. */
    {
        uint8_t lora_boot_tries = 0U;
        bool lora_ok = false;

        while (lora_boot_tries < (uint8_t)KVC_LORA_BOOT_RETRIES) {
            if (sx1278_init_tx()) {
                lora_ok = true;
                break;
            }
            lora_boot_tries++;
            /* Chớp LED1 nhanh nếu chưa nối được dây SPI với Ra-02 */
            KVC_BOARD_LED1_TOGGLE();
            delay_ms(300);
        }

        if (!lora_ok) {
            /* Degraded mode: báo bằng LED2 nháy đôi và đi tiếp. */
            for (uint8_t i = 0U; i < 4U; i++) {
                KVC_BOARD_LED1_ON();
                delay_ms(80);
                KVC_BOARD_LED1_OFF();
                delay_ms(80);
            }
        }

        /* ĐÃ NHẬN CHIP RA-02 THÀNH CÔNG: Sáng LED1 đứng 0.3 giây để xác nhận SPI hoạt động OK */
        if (lora_ok) {
            KVC_BOARD_LED1_ON();
            delay_ms(300);
            KVC_BOARD_LED1_OFF();
            delay_ms(200);
        }
        s_lora_available = lora_ok ? 1U : 0U;
    }

    /* 4. Khởi tạo cảm biến tư thế IMU GY-87 (MPU-6050) qua bus I2C0 */
    uint8_t imu_addr = 0;
    uint8_t imu_status = mpu6050_init(&imu_addr);
    uint8_t imu_ready = (imu_status == MPU6050_ERR_OK);

    if (imu_ready) {
        /* ĐÃ NHẬN IMU MPU-6050: Bật sáng LED2 đứng yên vững chắc để báo hiệu cảm biến đã sẵn sàng */
        KVC_BOARD_LED2_ON();
    } else {
        /* BÁO MÃ LỖI IMU QUA ĐÈN LED2:
         * - Chớp 1 nhịp: Bus I2C bị kẹt (SDA/SCL bị chập mass hoặc chạm sai chân)
         * - Chớp 2 nhịp: Cả địa chỉ 0x68 và 0x69 đều không có ACK (chưa nối nguồn hoặc lỏng dây SCL/SDA)
         * - Chớp 3 nhịp: Có ACK nhưng đọc WHO_AM_I trả về 0x00 hoặc 0xFF
         * - Chớp 4 nhịp: Ghi lệnh đánh thức chip thất bại
         * Chớp 3 chu kỳ để người dùng dễ quan sát trực tiếp trên bo mạch */
        for (int cycle = 0; cycle < 3; cycle++) {
            for (int b = 0; b < (int)imu_status; b++) {
                KVC_BOARD_LED2_ON(); // Bật LED2
                delay_ms(150);
                KVC_BOARD_LED2_OFF(); // Tắt LED2
                delay_ms(150);
            }
            delay_ms(700);
        }
        KVC_BOARD_LED2_OFF();
    }

    /* 5. Khởi tạo cảm biến siêu âm chống nước AJ-SR04M qua UART2 (9600 bps: P2.14 UTXD2, P2.15 URXD2) */
    kvc_usound_init();

    /* 5b. Khởi tạo module định vị vệ tinh u-blox NEO-M10 qua UART3 (38400/9600 bps: P2.0 UTXD3, P2.1 URXD3) */
    kvc_gnss_init();

    /* 5c. Khởi tạo driver tiếp nhận BBox FPGA qua UART1 (115200 bps: P2.3 URXD1, P2.2 UTXD1) */
    kvc_fpga_bbox_init();

#if (KVC_M1_CLOCK_DIAG == 1)
    /* KVC-M1-20261025-001: đọc lại CLKSEL/PRE/DLL/DLM của từng cổng SAU khi các
     * driver đã init, giữ nguyên thứ tự khởi động hiện có (chỉ đọc, không cấu hình lại). */
    kvc_m1_diag(1);
#endif

    /* KVC-F10: bật watchdog SAU khi mọi init xong (init có thể mất >2 s do retry
     * LoRa/IMU). Từ đây main loop phải kick đều. */
    kvc_wdt_init();

    /* 6. Chuẩn bị khung dữ liệu Telemetry 32 bytes (IF-02)
     * - DỮ LIỆU ĐO THỰC TẾ:
     *   + Cự ly siêu âm (alt_dist_cm) từ cảm biến AJ-SR04M.
     *   + Góc nghiêng Roll/Pitch từ IMU GY-87 (MPU6050).
     *   + Tọa độ vị trí UAV từ GNSS NEO-M10.
     *   + Mục tiêu nhận diện BBox từ FPGA (hoặc script PC giả lập qua cổng UART1).
     * - DỮ LIỆU DỰ PHÒNG: Khi chưa có GPS 3D fix hoặc BBox, sử dụng mốc mẫu Đà Nẵng để kiểm thử.
     */
    KvcTelemetryPacket32 pkt;
    memset(&pkt, 0, sizeof(pkt));

    pkt.msg_id         = KVC_MSG_ID_TELEMETRY;
    pkt.target_lat     = 0;           /* Mặc định 0: Chưa có GPS 3D fix */
    pkt.target_lon     = 0;           /* Mặc định 0: Chưa có GPS 3D fix */
    pkt.alt_dist_cm    = 0;
    pkt.class_id       = KVC_CLASS_ID_NONE;
    pkt.confidence     = 0;
    pkt.sensor_flags   = 0;
    /* FIX (Codex F5): trước đây battery_raw luôn = 126 (12.6 V) nên GCS hiển thị
     * pin 100% như dữ liệu thật. Hiện KHÔNG có ADC đo pin trong firmware, nên
     * phát 0 = "chưa đo" thay vì bịa giá trị đầy pin.
     * GIỚI HẠN: backend hiện map battery_raw = 0 thành 0% chứ chưa có cờ riêng
     * cho "không đo"; muốn phân biệt cần thêm cờ trong ABI (task riêng). */
    pkt.battery_raw    = 0;

    uint8_t seq = 1;

    /* 7. Vòng lặp phát sóng định kỳ mỗi 1.0 giây */
    while (1) {
        /* KVC-F10: kick watchdog ở ĐÚNG MỘT chỗ, đầu mỗi vòng. Không kick trong
         * ISR để watchdog còn phát hiện được main bị treo. */
        kvc_wdt_feed();

        pkt.seq_num = seq++;
        /* FIX (Codex F6): dùng time base monotonic thật thay cho `+= 1000`.
         * Trước đây timestamp chỉ đếm số vòng nên bỏ qua toàn bộ thời gian
         * xử lý/chặn trong vòng, làm lệch ngưỡng expiry và cửa sổ TDM. */
        pkt.timestamp_ms = kvc_millis();

        /* Nếu IMU chưa nhận diện được, tự động dò tìm lại mỗi chu kỳ để người dùng cắm lại dây là nhận ngay */
        if (!imu_ready) {
            imu_status = mpu6050_init(&imu_addr);
            if (imu_status == MPU6050_ERR_OK) {
                imu_ready = 1;
                /* BẬT SÁNG ĐÈN LED2 ĐỨNG YÊN NGAY LẬP TỨC KHI CẢM BIẾN ĐƯỢC KẾT NỐI */
                KVC_BOARD_LED2_ON();
            } else {
                KVC_BOARD_LED2_OFF();
            }
        } else {
            /* Giữ LED2 luôn sáng đứng yên báo hiệu IMU đang kết nối tốt */
            KVC_BOARD_LED2_ON();
        }

        /* Đọc dữ liệu góc nghiêng từ cảm biến IMU GY-87 nếu có cắm */
        if (imu_ready) {
            int16_t roll_deg10 = 0;
            int16_t pitch_deg10 = 0;
            if (mpu6050_read_angles(imu_addr, &roll_deg10, &pitch_deg10)) {
                pkt.sensor_flags |= KVC_FLAG_IMU_VALID;
                /* Ghi Roll và Pitch (đơn vị 0.1 độ, ví dụ 152 = 15.2°) vào 4 byte reserved */
                pkt.reserved[0] = (uint8_t)(roll_deg10 & 0xFF);
                pkt.reserved[1] = (uint8_t)((roll_deg10 >> 8) & 0xFF);
                pkt.reserved[2] = (uint8_t)(pitch_deg10 & 0xFF);
                pkt.reserved[3] = (uint8_t)((pitch_deg10 >> 8) & 0xFF);
            } else {
                /* Đọc thất bại (mất kết nối hoặc chập I2C): Đánh dấu mất IMU để tự dò tìm lại */
                imu_ready = 0;
                KVC_BOARD_LED2_OFF();
                pkt.sensor_flags &= ~KVC_FLAG_IMU_VALID;
                pkt.reserved[0] = 0;
                pkt.reserved[1] = 0;
                pkt.reserved[2] = 0;
                pkt.reserved[3] = 0;
            }
        } else {
            /* Chưa có IMU: Đảm bảo xóa cờ IMU */
            pkt.sensor_flags &= ~KVC_FLAG_IMU_VALID;
            pkt.reserved[0] = 0;
            pkt.reserved[1] = 0;
            pkt.reserved[2] = 0;
            pkt.reserved[3] = 0;
        }

        /* Đọc cự ly bề mặt nước thực tế từ cảm biến siêu âm chống nước AJ-SR04M qua thuật toán lọc ổn định */
        uint16_t usound_cm = 0;
        uint8_t usound_res = kvc_usound_read_robust(&usound_cm);
        if (usound_res == KVC_USOUND_OK) {
            pkt.alt_dist_cm = usound_cm;
            pkt.sensor_flags |= KVC_FLAG_ALT_VALID;
        } else {
            pkt.alt_dist_cm = 0;
            pkt.sensor_flags &= ~KVC_FLAG_ALT_VALID;
        }

        /* Cập nhật trạng thái định vị vệ tinh từ module GNSS NEO-M10 (Polling không chặn) */
        kvc_gnss_poll(pkt.timestamp_ms);
        int32_t uav_lat = 0;
        int32_t uav_lon = 0;
        if (kvc_gnss_is_valid()) {
            /* Cảm biến GPS đã thu nhận được tín hiệu vệ tinh thực tế */
            const KvcGnssState *gnss_st = kvc_gnss_get_state();
            uav_lat = gnss_st->lat_deg7;
            uav_lon = gnss_st->lon_deg7;
            pkt.sensor_flags |= KVC_FLAG_GNSS_VALID;
        } else {
#if (KVC_ENABLE_INDOOR_MOCK_GPS == 1)
            /* Chế độ phòng Lab: Dùng tọa độ mẫu Đà Nẵng khi chưa có sóng vệ tinh trong nhà */
            uav_lat = 160738520;
            uav_lon = 1081499210;
            pkt.sensor_flags |= KVC_FLAG_GNSS_VALID;
#else
            /* Chế độ bay thực tế (Mặc định): Khi chưa có GPS Fix, TUYỆT ĐỐI KHÔNG gửi tọa độ giả cố định */
            uav_lat = 0;
            uav_lon = 0;
            pkt.sensor_flags &= ~KVC_FLAG_GNSS_VALID;
#endif
        }

        /* Cập nhật và giải mã khung BBox từ FPGA (UART1 P2.3) */
        kvc_fpga_bbox_poll(pkt.timestamp_ms);
        if (kvc_fpga_bbox_is_valid()) {
            const KvcFpgaFrameState *fpga_state = kvc_fpga_bbox_get_state();
            const KvcFpgaBBoxItem *target = NULL;
            uint8_t target_idx = 0;

            if (fpga_state != NULL && fpga_state->candidate_count > 0) {
                /* Luân phiên báo cáo các mục tiêu (TDM Round-Robin) nếu có nhiều người/phao gặp nạn (xoay vòng mỗi 1.5s) */
                static uint8_t s_target_cycle_idx = 0;
                static uint32_t s_last_cycle_time = 0;
                if ((pkt.timestamp_ms - s_last_cycle_time) >= 1500UL) {
                    s_last_cycle_time = pkt.timestamp_ms;
                    s_target_cycle_idx++;
                }
                target_idx = s_target_cycle_idx % fpga_state->candidate_count;
                target = &fpga_state->targets[target_idx];
            } else {
                target = kvc_fpga_bbox_get_primary_target();
            }

            if (target != NULL) {
                pkt.sensor_flags |= KVC_FLAG_AI_DETECTED;
                pkt.class_id = target->class_id;
                pkt.confidence = target->confidence;

                /* TÍNH TOÁN TỌA ĐỘ MỤC TIÊU (TARGET GEO-REFERENCING):
                 * Khung hình chuẩn 640x480, tâm quang học cx = 320, cy = 240.
                 * Góc nhìn HFOV ~ 60 độ => fx ≈ 554 pixel.
                 *
                 * FIX (Codex F4): KHÔNG dùng độ cao giả 25 m. Trước đây khi cờ
                 * ALT_VALID = 0, code vẫn lấy h_m = 25.0 và xuất ra target_lat/lon
                 * trông "hợp lệ" nhưng sai hoàn toàn. Nay nếu thiếu độ cao hợp lệ
                 * thì target position không hợp lệ. Nếu GNSS còn hợp lệ, giữ tọa độ
                 * UAV để GCS vẫn có thể hiển thị vị trí UAV; backend dùng ALT_VALID
                 * để không diễn giải tọa độ UAV đó thành tọa độ target.
                 *
                 * GIỚI HẠN CÒN LẠI: fx = 554 và tâm 320x240 là hằng số danh định,
                 * chưa dùng intrinsics hiệu chuẩn, chưa undistort, chưa bù góc
                 * nghiêng IMU và chưa có extrinsic camera->body. Đây vẫn là georef
                 * xấp xỉ, chưa đủ để nghiệm thu (M3). */
                bool alt_ok = ((pkt.sensor_flags & KVC_FLAG_ALT_VALID) != 0U) &&
                              (pkt.alt_dist_cm >= 20U) && (pkt.alt_dist_cm <= 800U);
                bool pose_ok = ((pkt.sensor_flags & KVC_FLAG_GNSS_VALID) != 0U);

                if (!alt_ok || !pose_ok) {
                    /* Không bịa vị trí target; giữ vị trí UAV nếu GNSS vẫn hợp lệ. */
                    pkt.target_lat = pose_ok ? uav_lat : 0;
                    pkt.target_lon = pose_ok ? uav_lon : 0;
                    pkt.target_x_local = 0;
                    pkt.target_y_local = 0;
                } else {
                    float h_m = (float)pkt.alt_dist_cm / 100.0f;
                    if (h_m < 0.2f) h_m = 0.2f;

                    /* Độ lệch mét từ tâm camera đến đối tượng */
                    float delta_x_m = ((float)target->x_center - 320.0f) * (h_m / 554.0f);
                    float delta_y_m = (240.0f - (float)target->y_center) * (h_m / 554.0f);

                    /* Đổi độ lệch mét sang tọa độ WGS-84 (nhân 10^7):
                     * 1m vĩ độ  ≈ 89.977 x 10^-7 độ (1 / 111139 m)
                     * 1m kinh độ ≈ 93.633 x 10^-7 độ (tại vĩ độ 16° Bắc: 1 / (111139 * cos(16°))) */
                    int32_t d_lat_deg7 = (int32_t)(delta_y_m * 89.977f);
                    int32_t d_lon_deg7 = (int32_t)(delta_x_m * 93.633f);

                    pkt.target_lat = uav_lat + d_lat_deg7;
                    pkt.target_lon = uav_lon + d_lon_deg7;

                    /* Xuất cự ly tương đối thực tế (cm) quanh UAV để màn hình Radar vẽ đúng vị trí mục tiêu */
                    pkt.target_x_local = (int16_t)(delta_x_m * 100.0f);
                    pkt.target_y_local = (int16_t)(delta_y_m * 100.0f);
                }
            } else {
                /* Khung hình không có mục tiêu (count == 0) */
                pkt.sensor_flags &= ~KVC_FLAG_AI_DETECTED;
                pkt.class_id = KVC_CLASS_ID_NONE;
                pkt.confidence = 0;
                if (pkt.sensor_flags & KVC_FLAG_GNSS_VALID) {
                    pkt.target_lat = uav_lat;
                    pkt.target_lon = uav_lon;
                } else {
                    pkt.target_lat = 0;
                    pkt.target_lon = 0;
                }
                pkt.target_x_local = 0;
                pkt.target_y_local = 0;
            }
        } else {
            /* Chưa có tín hiệu BBox mới trong 2.0 giây: hạ cờ AI, giữ vị trí UAV */
            pkt.sensor_flags &= ~KVC_FLAG_AI_DETECTED;
            if (pkt.sensor_flags & KVC_FLAG_GNSS_VALID) {
                pkt.target_lat = uav_lat;
                pkt.target_lon = uav_lon;
            } else {
                pkt.target_lat = 0;
                pkt.target_lon = 0;
            }
            pkt.target_x_local = 0;
            pkt.target_y_local = 0;
        }

        /* Tự động điền Sync Header 0xAA 0x55 và tính mã CRC-16 chuẩn xác */
        kvc_finalize_telemetry_packet(&pkt);

        /* Bật đèn LED1 chỉ báo bắt đầu bắn gói tin */
        KVC_BOARD_LED1_ON();

        /* Bắn gói tin 32 bytes ra Anten.
         * F7: ở degraded mode (LoRa không khởi tạo được) thì bỏ qua phát để
         * không chặn 300 ms mỗi vòng và không gọi SPI vào chip không tồn tại.
         * Cảm biến vẫn được poll bình thường để chẩn đoán. */
        if (s_lora_available != 0U) {
            sx1278_send_packet((const uint8_t *)&pkt, sizeof(pkt));
        }

        /* Tắt đèn LED1 sau khi bắn xong */
        KVC_BOARD_LED1_OFF();

        /* Chu kỳ phát 1 giây / gói: polling GNSS, FPGA BBox và Siêu âm liên tục theo từng nhịp 1 ms không chặn */
        for (uint32_t step = 0; step < 1000; step++) {
            kvc_gnss_poll(pkt.timestamp_ms + step);
            kvc_fpga_bbox_poll(pkt.timestamp_ms + step);
            kvc_usound_poll();
#if (KVC_M1_CLOCK_DIAG == 1)
            /* Xả text chẩn đoán post-init dần theo THRE. Không delay, nên không
             * chặn polling UART1/2/3 và không gây tràn FIFO cảm biến. */
            kvc_m1_diag_pump();
            /* KVC-M2: công bố thống kê RX ring mỗi ~5 s để theo dõi gate
             * oe/fe/drop = 0 trong suốt buổi chạy, không cần nạp lại. */
            kvc_m2_stats_tick();
#endif
            /* KVC-F10: kick giữa vòng để không phụ thuộc hoàn toàn vào ước lượng
             * thời gian một vòng. Vẫn là "một chỗ" theo nghĩa chỉ trong main. */
            if (step == 500U) {
                kvc_wdt_feed();
            }
            delay_ms(1);
        }
    }
}
