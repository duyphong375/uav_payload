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
#include "kvc_timebase.h"
#include "kvc_imu_gy87.h"
#include "kvc_usound_ajsr04m.h"
#include "kvc_gnss_neo_m10.h"
#include "kvc_fpga_bbox.h"
#include "kvc_geo_math.h"
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

/* KVC-BENCH-20261028: số chu kỳ telemetry giữa hai lần thử lại IMU khi chưa
 * nhận được cảm biến. Mỗi lần thử chạy bus-recovery 9 xung + 4 lệnh ghi (~1 ms
 * bit-bang), nên thử mỗi chu kỳ là lãng phí khi IMU hỏng/hở dây.
 * 10 chu kỳ ≈ 10 s: vẫn đủ nhanh để cắm lại dây là nhận trong vòng 10 s. */
#ifndef KVC_IMU_RETRY_DIV
#define KVC_IMU_RETRY_DIV           10U
#endif

/* Cờ cho biết SX1278 đã khởi tạo được chưa. 0 = degraded mode. */
static uint8_t s_lora_available = 0U;

/* KVC-BENCH-20261028: đếm kết quả phát LoRa.
 *
 * VÌ SAO CẦN: `sx1278_send_packet()` trước đây là void và nhánh timeout
 * `return` im lặng, nên KHÔNG có cách nào biết MCU đã phát bao nhiêu gói. Hệ quả
 * là không thể đối chiếu "số gói phát" với "số gói gateway nhận", tức không
 * nghiệm thu được bất kỳ tiêu chí mất gói nào (kế hoạch GW-2.2 / SH-3.1).
 *
 * `fail` tăng ở mọi nhánh thất bại, kể cả khi auto-recovery tầng 1 không cứu
 * được chip. Đọc cặp `tx=ok/fail` trên dòng `[M3]`: fail > 0 nghĩa là có gói
 * KHÔNG ra được anten, khác hẳn với "gateway không nhận".
 *
 * Khai báo Ở ĐÂY (trước khối M3) vì `kvc_m3_value_tick()` đọc hai biến này. */
static uint32_t s_tx_ok_count   = 0U;
static uint32_t s_tx_fail_count = 0U;

/* KVC-DIAG: giá trị RegVersion (0x42) đọc được từ SX1278 ở lần thử CUỐI CÙNG.
 *
 * VÌ SAO CẦN: khi `sx1278_init_tx()` thất bại, code cũ chỉ trả 0 mà không cho
 * biết đọc ra gì — không phân biệt được "không thấy chip" với "dây sai" với
 * "chip khác". In giá trị này ra UART5 giúp chẩn đoán ngay:
 *   0x12 = chip SX1278 đúng (lỗi ở bước sau, không phải SPI)
 *   0x00 = MISO kẹt thấp / chip mất nguồn / NSS sai
 *   0xFF = MISO kẹt cao / không nối dây / thiếu pull-up
 *   khác = chip khác hoặc SPI sai mode
 *
 * Chỉ ghi khi thử init (lúc boot). Không ảnh hưởng vòng lặp chính. */
static uint8_t s_lora_last_version = 0U;

/* Hàm trễ thời gian phần cứng chuẩn xác tuyệt đối qua bộ đếm SysTick của Cortex-M4 (Xung 12 MHz).
 * Đồng thời cộng dồn thời gian đã tiêu vào time base dùng chung (kvc_timebase) để
 * timestamp_ms phản ánh thời gian trôi thật, kể cả thời gian chặn. */

static void delay_ms(uint32_t ms) {
    while (ms--) {
        SysTick->LOAD = (12000000UL / 1000UL) - 1UL; /* Đúng 12000 chu kỳ cho 1.0 ms */
        SysTick->VAL  = 0UL;
        SysTick->CTRL = SysTick_CTRL_CLKSOURCE_Msk | SysTick_CTRL_ENABLE_Msk;
        while ((SysTick->CTRL & SysTick_CTRL_COUNTFLAG_Msk) == 0) {
            __NOP();
        }
        SysTick->CTRL = 0UL;
        kvc_timebase_add_ms(1U);
    }
}

/* ============================================================================
 * KVC-F6 — TIME BASE THẬT CHO timestamp_ms
 * ============================================================================
 * VẤN ĐỀ: trước đây `pkt.timestamp_ms += 1000` mỗi vòng, nên timestamp chỉ là
 * "số vòng × 1000", bỏ qua thời gian xử lý và thời gian chặn (TX LoRa 300 ms,
 * đo siêu âm 250 ms, ...). Hệ quả: các ngưỡng expiry 2 s / 3 s và cửa sổ TDM
 * 1.5 s bị lệch, và GCS nhận timestamp không khớp thời gian thực.
 *
 * CÁCH SỬA (F6 rồi F6b): time base nằm trong module `kvc_timebase` dùng chung,
 * KHÔNG còn là biến cục bộ của main.c. `delay_ms()` cộng ms, còn
 * `kvc_usound_delay_us()` cộng µs (phần lẻ dưới 1 ms được giữ lại). Nhờ vậy
 * thời gian chờ trong driver siêu âm — tới 250 ms ở chu kỳ thất bại — không còn bị
 * mất khỏi time base như bản trước.
 *
 * GIỚI HẠN (phải ghi rõ, không được coi là đồng hồ chuẩn):
 *   - Nguồn đếm là IHRC 12 MHz ±2 % theo datasheet. Vì vậy time base trôi tới
 *     ~±2 % (khoảng 1,2 s mỗi phút trong điều kiện xấu). Muốn chính xác ppm
 *     phải có thạch anh ngoài hoặc hiệu chuẩn bằng 1PPS của GNSS (task riêng).
 *   - `delay_ms()` và `kvc_usound_delay_us()` đều giả định 12 MHz; nếu UCLK
 *     thật khác thì cả hai và time base đều lệch cùng một tỉ lệ.
 *   - Bit-bang I2C của IMU chưa báo thời gian vào time base (xem kvc_timebase.h).
 *   - Không phải phép đo: giá trị này suy ra từ số chu kỳ SysTick/vòng lặp.
 * ============================================================================ */

/* Trả về time base monotonic hiện tại (ms kể từ reset). */
static uint32_t kvc_millis(void) {
    return kvc_timebase_ms();
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
 *   - kvc_usound_read_robust : tới 250 ms (chờ khung 4 byte @9600, cửa sổ nghe)
 *   - sx1278_send_packet     : tới 300 ms (poll TxDone)
 *   - sx1278_init_tx (khi params sai): +100 ms (delay_ms(50) x2)
 *   - vòng 1000 bước         : 1000 x (delay_ms(1) + overhead poll) ≈ 2,5 s
 *   Tổng ≈ 3,2 s.
 *
 * Bản đầu tôi đặt 2,0 s -> SẼ RESET OAN mỗi vòng. Nay dùng 6 s (biên ~3 s).
 *
 * KVC-BENCH-20261028 (SỬA COMMENT SAI): bản trước ghi "vẫn kick thêm một lần
 * giữa vòng 1000 bước (sau 500 bước)" nhưng CODE KHÔNG HỀ LÀM ĐIỀU ĐÓ — chỉ có
 * đúng một lệnh `kvc_wdt_feed()` ở đầu mỗi vòng main. Nay sửa comment cho khớp
 * code thay vì thêm lệnh feed thứ hai: worst case một vòng hiện tại ~655 ms
 * (US 250 + TX 300 + I2C/GNSS ~100) < 6 s, nên MỘT điểm feed là đủ và còn giữ
 * được nguyên tắc "chỉ kick ở một chỗ" của manual §9.1.
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
/* KVC-M1 — CHẨN ĐOÁN CLOCK. ĐÂY LÀ CODE TẠM THỜI, PHẢI = 0 KHI PHÁT HÀNH.
 * Bật =1 chỉ khi cần điều tra cây xung nhịp trên kit. Khi bật, firmware đọc
 * thanh ghi SCU, gọi SystemCoreClockUpdate() và bơm text chẩn đoán ra UART5
 * mỗi nhịp 1 ms — không phù hợp vận hành thật. */
#ifndef KVC_M1_CLOCK_DIAG
#define KVC_M1_CLOCK_DIAG            0
#endif
#ifndef KVC_M1_UART5_BURST_LINES
#define KVC_M1_UART5_BURST_LINES     5
#endif
/* KVC-M2 — THỐNG KÊ RX RING. GIỮ = 1 kể cả khi phát hành: đây là SỐ ĐO THẬT
 * (counter phần mềm/phần cứng) dùng để nghiệm thu gate "oe/fe/drop = 0 trong
 * 10 phút". Không phải code tạm, không đọc thanh ghi clock.
 *
 * Trước đây M1 và M2 dùng chung một cờ, nên tắt chẩn đoán clock là mất luôn
 * thống kê ring. Nay tách riêng. */
#ifndef KVC_M2_RX_STATS_DIAG
#define KVC_M2_RX_STATS_DIAG         1
#endif
/* KVC-M2: chu kỳ công bố thống kê RX ring, tính bằng nhịp poll 1 ms.
 * 5000 nhịp ~ 5 giây. Đủ thưa để không chiếm UART5, đủ dày để thấy tràn sớm. */
#ifndef KVC_M2_RX_STATS_PERIOD_TICKS
#define KVC_M2_RX_STATS_PERIOD_TICKS 5000U
#endif
/* KVC-M3-20261026-001 — IN GIÁ TRỊ CẢM BIẾN QUA UART5.
 *
 * VÌ SAO: trước đây UART5 chỉ in thống kê ring (isr/oe/fe/drop). Bring-up trên
 * bo không thể biết siêu âm đọc được bao nhiêu cm, IMU ra góc nào, GNSS có fix
 * hay không — chỉ biết "có byte đến". Khối này in giá trị thật để nghiệm thu
 * từng cảm biến mà không cần debugger.
 *
 * CHỈ ĐỌC giá trị đã được main loop cập nhật; KHÔNG đọc lại cảm biến, KHÔNG
 * gọi driver, KHÔNG đổi chu kỳ phát, KHÔNG chạm ABI IF-02.
 * =1 mặc định trong giai đoạn bring-up; đặt =0 khi phát hành nếu cần.
 */
#ifndef KVC_M3_VALUE_DIAG
#define KVC_M3_VALUE_DIAG            1
#endif

/* Chu kỳ in giá trị cảm biến, mili-giây. Mặc định 1000 ms ~ 1 Hz, trùng nhịp
 * telemetry để dễ đối chiếu log M3 với gói RF.
 *
 * Dùng kvc_millis() (time base chung) chứ KHÔNG đếm số lần được gọi: khối xử lý
 * có thể vượt 1 s (siêu âm 250 ms + TX LoRa 300 ms), khi đó vòng chờ không chạy
 * và bộ đếm theo lần gọi sẽ trôi. Time base vẫn tiến nhờ delay_ms/delay_us.
 *
 * RÀNG BUỘC BĂNG THÔNG UART5: 9615 bps 8N1 ~ 960 byte/s khả dụng. Một dòng M3
 * cỡ ~140 ký tự ở 1 Hz là ~140 B/s; M2 ~200 ký tự mỗi 5 s là ~40 B/s. Tổng
 * ~180 B/s, còn dư ~5x. Pump xả 32 byte/lượt (~32000 B/s) nên không nghẽn. */
#ifndef KVC_M3_VALUE_PERIOD_MS
#define KVC_M3_VALUE_PERIOD_MS       1000UL
#endif
#ifndef KVC_M1_UART5_STANDALONE_TEST
#define KVC_M1_UART5_STANDALONE_TEST 0
#endif

/* Chu kỳ phát telemetry (ms). Một chỗ duy nhất để chỉnh tần số phát.
 *
 * RÀNG BUỘC PHÍA NHẬN (không được giảm dưới các ngưỡng này):
 *   - Gateway coi mất sóng sau 3000 ms  (firmware/gateway_esp32/src/main.cpp).
 *   - BBox của FPGA hết hạn sau 2000 ms (kvc_fpga_bbox.h) -> period phải nhỏ
 *     hơn ngưỡng này, nếu không mục tiêu AI gần như luôn "cũ" khi tới trạm đất.
 * Vì vậy 1000 ms là giá trị hợp lệ lớn nhất; tăng lên 1500 ms vẫn còn an toàn
 * cho BBox nhưng sát ngưỡng hơn. Không đặt >= 3000 ms. */
#ifndef KVC_TELEMETRY_PERIOD_MS
#define KVC_TELEMETRY_PERIOD_MS      1000UL
#endif

/* KVC-BENCH-20261028: nhận diện firmware đang nạp.
 * In ra ngay sau reset để log Hercules tự mô tả phiên bản + cấu hình biên dịch,
 * thay vì phải suy ra từ hành vi. Khi so log giữa hai lần nạp, đây là dòng đầu
 * tiên cần khớp.
 *
 * ĐỔI CHUỖI NÀY mỗi khi nạp một bản khác lên kit. */
#define KVC_FW_ID                    "KVC-MCU-20261028"

/* PB-FIX (P1-2): trước đây cửa sổ TDM là 1500 ms, dài hơn một chu kỳ phát nên
 * thực tế mục tiêu chỉ nhảy mỗi 2 gói. Nay TDM đếm theo SỐ GÓI: mỗi gói báo
 * một mục tiêu kế tiếp, tất định và dễ kiểm chứng.
 * =0: mỗi gói giữ nguyên mục tiêu, không luân phiên. */
#ifndef KVC_TDM_ROTATE_EVERY_PACKET
#define KVC_TDM_ROTATE_EVERY_PACKET  1
#endif

/* KVC-BENCH-20261028: FPGA OneKiwi (IF-01) có được khởi tạo hay không.
 *
 * BỐI CẢNH: bo bench hiện tại KHÔNG có FPGA và phía FPGA chưa có RTL/top-level
 * phát BBox. Khi UART1 bật ngắt mà P2.3 (URXD1) không được lái, chân CMOS float
 * sinh byte rác -> `[RING] FPGA fe/byt/isr` tăng liên tục, làm log chẩn đoán
 * nhiễu và đốt CPU trong ISR vô ích. Đây đúng cơ chế đã gặp với đường RX siêu
 * âm trước khi tắt ngắt ngoài cửa sổ nghe.
 *
 * =0 (mặc định): KHÔNG cấu hình UART1, KHÔNG bật NVIC, đặt P2.3/P0.12 về mức
 *     xác định. Khối BBox luôn invalid -> cờ AI luôn 0, toạ độ mục tiêu = 0,
 *     georef không chạy. Đây là hành vi ĐÚNG cho bo không có FPGA.
 * =1: hành vi cũ. Dùng khi cắm mock_fpga_bbox.py qua USB-TTL, hoặc khi đã có RTL.
 *
 * KHÔNG đổi IF-01: khi =1, layout khung, CRC, baud 38400 và vector IRQ giữ nguyên. */
#ifndef KVC_FPGA_ENABLE
#define KVC_FPGA_ENABLE 0
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

/* ============================================================================
 * KÊNH CHẨN ĐOÁN UART5 (P0.15) — dùng chung cho M1 (clock, tạm thời),
 * M2 (thống kê RX ring, giữ lâu dài) và M3 (giá trị cảm biến, KVC-M3-20261026-001).
 * Cơ sở hạ tầng buffer/truyền nằm ở đây để chỉ có MỘT định nghĩa; phần thân nào
 * thuộc M1/M2/M3 được bọc riêng.
 * ============================================================================ */
#if (KVC_M1_CLOCK_DIAG == 1) || (KVC_M2_RX_STATS_DIAG == 1) || (KVC_M3_VALUE_DIAG == 1)

/* Lấy HCLK cho phần chẩn đoán clock. */
#if (KVC_M1_CLOCK_DIAG == 1)
/* system_SN34F780.c không có header khai báo hai ký hiệu này trong project hiện tại.
 * Khai báo extern cục bộ để không phải sửa header (ngoài allowed files của task). */
extern void SystemCoreClockUpdate(void);
extern uint32_t SystemCoreClock;
#endif

static uint8_t  s_m1_tx_ready   = 0;
#if (KVC_M1_CLOCK_DIAG == 1)
static uint32_t s_m1_pllclk     = 0;
static uint8_t  s_m1_pllclk_ok  = 0;
#endif

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
#if (KVC_M1_CLOCK_DIAG == 1)
/* KVC-FIX-ABI-20261025-001: self-check IF-02 được gọi trong khối clock dump. */
static void kvc_m1_dump_abi_selfcheck(void);
#endif

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

/* hex32: dùng bởi M1 (clock/ABI) VÀ M3 (in RegVersion LoRa dạng hex).
 * Vì vậy phải biên dịch khi M1 hoặc M3 bật — trước đây chỉ theo M1 nên build
 * với M1=0/M3=1 bị "Undefined symbol kvc_m1_buf_hex32".
 *
 * KVC-BENCH-20261028: mở rộng thêm M2 vì khối log `[INIT]` (dùng chung buffer)
 * được biên dịch khi bất kỳ M1/M2/M3 bật. */
#if (KVC_M1_CLOCK_DIAG == 1) || (KVC_M2_RX_STATS_DIAG == 1) || (KVC_M3_VALUE_DIAG == 1)
static void kvc_m1_buf_hex32(uint32_t v) {
    static const char s_hex[] = "0123456789ABCDEF";
    int shift;
    kvc_m1_buf_puts("0x");
    for (shift = 28; shift >= 0; shift -= 4) {
        kvc_m1_buf_putc(s_hex[(v >> (uint32_t)shift) & 0x0FU]);
    }
}

/* KVC-BENCH-20261028: hex 1 byte cho log `[INIT]` (RegVersion, địa chỉ I2C).
 * Tách khỏi hex32 để dòng log gọn ("ver=0x12" thay vì "ver=0x00000012") và
 * không phải cắt chuỗi khi đối chiếu bằng mắt. */
static void kvc_m1_buf_hex8(uint32_t v) {
    static const char s_hex[] = "0123456789ABCDEF";
    kvc_m1_buf_puts("0x");
    kvc_m1_buf_putc(s_hex[(v >> 4) & 0x0FU]);
    kvc_m1_buf_putc(s_hex[v & 0x0FU]);
}
#endif

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

/* Xả toàn bộ buffer, chờ THRE từng byte. CHỈ dùng khi chưa có driver cảm biến
 * nào đang nhận dữ liệu (trước khi init cảm biến) hoặc ở chế độ test độc lập.
 * Trong main loop luôn dùng `kvc_m1_diag_pump()` để không chặn polling.
 *
 * KVC-BENCH-20261028: khối này trước đây nằm trong `#if (KVC_M1_CLOCK_DIAG == 1)`.
 * VÌ SAO PHẢI MỞ RỘNG: cấu hình mặc định là M1 = 0, M2 = 1, M3 = 1. Trước đây
 * không có cách nào in log đồng bộ lúc khởi tạo — bo thiếu FPGA/LoRa im lặng tới
 * ~20 s và trông như treo. Khối `[INIT]` cần hàm này để chắc chắn dòng banner ra
 * hết trước khi driver cảm biến bật ngắt.
 *
 * (Nay toàn bộ file đã nằm trong khối `#if` M1||M2||M3 ở trên, nên không cần
 * điều kiện riêng tại đây.) */
/* ============================================================================
 * KVC-BENCH-20261028 — LOG ĐỒNG BỘ LÚC KHỞI TẠO
 * ============================================================================
 * VÌ SAO CẦN: không có banner thì một bo thiếu FPGA/thiếu LoRa im lặng tới ~20 s
 * (autobaud GNSS 11-15 s + retry LoRa tối đa 3 s). Không phân biệt được "đang
 * init" với "treo", và không biết cảm biến nào nhận được.
 *
 * AN TOÀN: chỉ dùng TRƯỚC main loop, khi chưa có driver cảm biến nào đang nhận
 * byte. Sau khi main loop chạy, mọi log đi qua kvc_m1_diag_pump() (không chặn).
 *
 * CHI PHÍ: 9615 bps 8N1 ~ 960 byte/s -> một dòng 40 ký tự ~42 ms. Tổng 6 dòng
 * `[INIT]` ~ 250 ms, chấp nhận được so với 11-15 s autobaud.
 *
 * KHÔNG dùng hàm này trong main loop: nó chờ THRE nên sẽ chặn polling UART.
 * ============================================================================ */
static void kvc_diag_boot_flush(void) {
    uint16_t i;

    if (s_m1_tx_ready == 0U) {
        return;
    }
    for (i = 0U; i < s_m1_snap_len; i++) {
        uint32_t guard = 200000UL;
        while (((SN_UART5->LS & (1U << 5)) == 0U) && (--guard > 0U)) {
            __NOP();
        }
        if (guard == 0U) {
            s_m1_tx_ready = 0U;   /* THRE không bật: ngừng in, không treo boot */
            break;
        }
        SN_UART5->TH = (uint32_t)(uint8_t)s_m1_snap[i];
    }
    s_m1_snap_len   = 0U;
    s_m1_snap_pos   = 0U;
    s_m1_snap_ready = 0U;
}

/* Bắt đầu một dòng `[INIT]` mới. Luôn đi cặp với kvc_diag_boot_end(). */
static void kvc_diag_boot_begin(void) {
    if (s_m1_tx_ready == 0U) {
        return;
    }
    kvc_m1_buf_reset();
}

/* Kết thúc dòng: chèn CRLF rồi xả đồng bộ.
 *
 * Tách khỏi `kvc_diag_boot_flush()` để phần flush giữ nguyên hành vi cũ khi
 * khối M1 gọi. Nếu flush tự chèn CRLF, log M1 sẽ có thêm dòng trắng so với
 * trước — đó là thay đổi hành vi không cần thiết. */
static void kvc_diag_boot_end(void) {
    kvc_m1_buf_puts("\r\n");
    kvc_diag_boot_flush();
}

/* In nguyên một dòng cố định. */
static void kvc_diag_boot_puts(const char *s) {
    if (s_m1_tx_ready == 0U) {
        return;
    }
    kvc_diag_boot_begin();
    kvc_m1_buf_puts(s);
    kvc_diag_boot_end();
}

#if (KVC_M1_CLOCK_DIAG == 1)
/* Bản cũ của khối M1: hành vi giữ nguyên, nay gọi hàm flush chung để chỉ có MỘT
 * chỗ chờ THRE. Chỉ biên dịch khi M1 bật, tránh "never referenced" ở cấu hình
 * mặc định (M1=0, M2=1, M3=1). */
static void kvc_m1_flush_blocking(void) {
    kvc_diag_boot_flush();
}
#endif /* KVC_M1_CLOCK_DIAG */

/* Xả dần buffer, KHÔNG chặn: mỗi lượt ghi tối đa vài byte nếu THRE sẵn sàng,
 * sau đó trả về ngay để main loop tiếp tục poll UART1/2/3.
 *
 * KVC-M3-20261026-001 (P1 FIX): trước đây hàm này nằm TRONG `#if
 * (KVC_M1_CLOCK_DIAG == 1)`, nhưng nó là bộ xả DUY NHẤT của buffer dùng chung.
 * Với cấu hình mặc định M1 = 0, M2 = 1, `kvc_m2_stats_tick()` vẫn đặt
 * s_m1_snap_ready = 1 mà KHÔNG có ai xả ra UART5; lần tick sau lại thấy
 * s_m1_snap_ready != 0 và return. Kết quả: UART5 im lặng vĩnh viễn, gate
 * "oe/fe/drop = 0 trong 10 phút" không đọc được. Nay pump thuộc mọi khối M1/M2/M3. */
#if (KVC_M1_CLOCK_DIAG == 1) || (KVC_M2_RX_STATS_DIAG == 1) || (KVC_M3_VALUE_DIAG == 1)
static void kvc_m1_diag_pump(void) {
    /* Budget 32 byte: TX FIFO của UART5 sâu 16 byte, nên một lượt có thể nạp
     * đầy FIFO thay vì 8 byte. Ở chế độ bình thường (gọi mỗi 1 ms) tốc độ bị
     * giới hạn bởi đường truyền ~960 B/s chứ không bởi budget. Ở chế độ vòng
     * main bị overrun (gọi chỉ 1 lần/vòng >1 s), budget lớn giúp xả được cả FIFO
     * mỗi vòng thay vì nhỏ giọt.
     *
     * GIỚI HẠN ĐÃ BIẾT: nếu khối xử lý vượt 1 s LIÊN TỤC thì hàm chỉ được gọi
     * ~1 lần/vòng và mỗi dòng M3 (~110 ký tự) có thể mất vài giây mới ra hết.
     * Không mất ký tự (chỉ ghi khi buffer sẵn sàng) nhưng log sẽ thưa. Muốn xả
     * cả trong lúc chặn (TX LoRa 300 ms, siêu âm 250 ms) phải gọi pump từ
     * delay_ms() — việc đó cần đưa macro điều khiển lên trước delay_ms, để task
     * riêng vì chạm thứ tự khai báo của toàn file. */
    uint32_t budget = 32U;

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
#endif /* M1 || M2 || M3 */

/* KVC-M2: công bố lại thống kê RX ring theo chu kỳ để có thể theo dõi gate
 * "oe/fe/drop = 0 trong 10 phút" mà không cần nạp lại firmware.
 *
 * Cách đếm thời gian: đếm số nhịp của vòng poll 1 ms. Sau KVC-F6b, mốc thời
 * gian duy nhất của firmware là kvc_timebase; hàm này vẫn đếm nhịp vì nó đo
 * "số lần được gọi", không phải thời gian trôi, và chỉ dùng cho chẩn đoán.
 * Đây là ước lượng, không phải phép đo: nếu HCLK khác 12 MHz thì chu kỳ thực
 * sẽ lệch tương ứng.
 *
 * Không ghi đè buffer đang xả dở: chỉ định dạng khi s_m1_snap_ready == 0. */
#if (KVC_M2_RX_STATS_DIAG == 1)
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
#endif /* KVC_M2_RX_STATS_DIAG */

/* ============================================================================
 * KVC-M3-20261026-001 — IN GIÁ TRỊ CẢM BIẾN QUA UART5 (1 Hz)
 * ============================================================================
 * MỤC ĐÍCH: cho phép nghiệm thu từng cảm biến trên bo bằng log, không cần
 * debugger. Trước đây chỉ có thống kê ring (có byte đến hay không), không có
 * giá trị đo nên không phân biệt được "driver chạy đúng" với "driver trả rác".
 *
 * NGUYÊN TẮC:
 *   - CHỈ ĐỌC snapshot do main loop đã tính trong vòng hiện tại. Không đọc lại
 *     cảm biến, không gọi driver, không delay, không chặn RX UART1/2/3.
 *   - Không ghi vào gói telemetry, không đổi reserved[], không đổi ABI IF-02.
 *   - Dùng chung buffer và pump của khối M1/M2; nếu buffer đang bận thì bỏ nhịp
 *     (không ghi đè text chưa xả).
 *
 * ĐỊNH DẠNG (một dòng, ~140 ký tự):
 *   [M3] t=12345 US=142cm ok | IMU r=12 p=-3 v=1 | GNSS q1 f3 s9 hd0.85 \
 *        la160738520 lo1081499210 v1 yw=- sp=0 | BB n1 v1 crc0 en0 \
 *        | LORA d1 ver=0x12 | ovr0 tx=60/0
 * ============================================================================ */
#if (KVC_M3_VALUE_DIAG == 1)

/* Ảnh chụp giá trị của vòng main hiện tại, do main loop điền trước vòng chờ.
 * Không dùng con trỏ tới biến cục bộ để tránh phụ thuộc thời gian sống.
 * Thứ tự field xếp giảm dần theo kích thước/căn lệnh để không sinh padding
 * (dự án build với -Wpadded, coi cảnh báo mới là nợ kỹ thuật). */
typedef struct {
    uint32_t cycle_overrun_count;/* Số vòng vượt chu kỳ phát */
    int16_t  roll_deg10;         /* Roll, 0.1 độ */
    int16_t  pitch_deg10;        /* Pitch, 0.1 độ */
    uint16_t usound_cm;          /* Cự ly siêu âm, cm */
    uint8_t  usound_ok;          /* 1 = KVC_USOUND_OK */
    uint8_t  usound_code;        /* Mã lỗi KVC_USOUND_ERR_* khi ok = 0 */
    uint8_t  imu_ok;             /* 1 = có góc hợp lệ trong vòng này */
    uint8_t  pad0;               /* Đệm tường minh, tránh -Wpadded */
    uint8_t  pad1;               /* Đệm tường minh, tránh -Wpadded */
    uint8_t  pad2;               /* Đệm tường minh, tránh -Wpadded */
} KvcM3Snapshot;

/* In số có dấu. Xử lý INT32_MIN mà không tràn (không dùng -v trực tiếp). */
static void kvc_m3_buf_dec32s(int32_t v) {
    uint32_t m;
    if (v < 0) {
        kvc_m1_buf_putc('-');
        m = (uint32_t)(-(v + 1)) + 1U;
    } else {
        m = (uint32_t)v;
    }
    kvc_m1_buf_dec32(m);
}

/* In HDOP dạng "1.20" từ đơn vị centi. Sentinel 0xFFFF in "na". */
static void kvc_m3_buf_hdop(uint16_t centi) {
    uint16_t frac;

    if (centi == 0xFFFFU) {
        kvc_m1_buf_puts("na");
        return;
    }
    kvc_m1_buf_dec32((uint32_t)(centi / 100U));
    kvc_m1_buf_putc('.');
    frac = (uint16_t)(centi % 100U);
    kvc_m1_buf_putc((char)('0' + (char)(frac / 10U)));
    kvc_m1_buf_putc((char)('0' + (char)(frac % 10U)));
}

static void kvc_m3_value_tick(const KvcM3Snapshot *snap) {
    static uint32_t s_last_ms = 0U;
    static uint8_t  s_started = 0U;
    const KvcGnssState *gnss;
    const KvcFpgaFrameState *bbox;
    const uint32_t now_ms = kvc_millis();

    if ((s_m1_tx_ready == 0U) || (snap == NULL)) {
        return;
    }
    if (s_started == 0U) {
        s_started = 1U;      /* in dòng đầu ngay, không chờ hết chu kỳ */
    } else if ((uint32_t)(now_ms - s_last_ms) < (uint32_t)KVC_M3_VALUE_PERIOD_MS) {
        return;
    }

    if (s_m1_snap_ready != 0U) {
        return;   /* buffer còn text chưa xả: bỏ nhịp, không ghi đè */
    }
    s_last_ms = now_ms;

    kvc_m1_buf_reset();

    kvc_m1_buf_puts("\r\n[M3] t=");
    kvc_m1_buf_dec32(kvc_millis());

    /* Siêu âm: giá trị + cờ hợp lệ + mã lỗi khi không hợp lệ. Mã lỗi cho biết
     * PHẢI kiểm tra gì:
     *   1 = có byte nhưng khung bị cắt -> tăng cửa sổ nghe
     *   2 = checksum sai               -> nhiễu làm hỏng bit
     *   3 = có phản xạ nhưng > 500 cm  -> bình thường (xem raw)
     *   4 = vật cản trong vùng mù      -> bình thường
     *   5 = module báo 6000 mm         -> không có phản xạ về đầu dò
     *   6 = module không đáp lệnh 0x01 -> kiểm tra TX/dây/nguồn module */
    kvc_m1_buf_puts(" US=");
    kvc_m1_buf_dec32((uint32_t)snap->usound_cm);
    if (snap->usound_ok != 0U) {
        kvc_m1_buf_puts("cm ok");
    } else {
        kvc_m1_buf_puts("cm err/");
        kvc_m1_buf_dec32((uint32_t)snap->usound_code);
        /* last= : mẫu ĐÃ LỌC tốt gần nhất, CHẨN ĐOÁN ONLY. Không được dùng
         * cho telemetry/georef (xem kvc_usound_get_last_good_cm). Có trường này
         * thì log phân biệt được "mất echo thật" (last cũng 0) với "trượt một
         * nhịp" (last vẫn có số) mà không phải giữ mẫu cũ trong alt_dist_cm. */
        kvc_m1_buf_puts(" last=");
        kvc_m1_buf_dec32((uint32_t)kvc_usound_get_last_good_cm());
    }

    /* IMU: roll/pitch 0.1 độ + cờ. */
    kvc_m1_buf_puts(" | IMU r=");
    kvc_m3_buf_dec32s((int32_t)snap->roll_deg10);
    kvc_m1_buf_puts(" p=");
    kvc_m3_buf_dec32s((int32_t)snap->pitch_deg10);
    kvc_m1_buf_puts(" v=");
    kvc_m1_buf_dec32((uint32_t)snap->imu_ok);

    /* GNSS: quality, fix mode, số vệ tinh, HDOP, lat/lon, cờ 3D fix. */
    gnss = kvc_gnss_get_state();
    kvc_m1_buf_puts(" | GNSS q");
    kvc_m1_buf_dec32((gnss != NULL) ? (uint32_t)gnss->fix_quality : 0U);
    kvc_m1_buf_puts(" f");
    kvc_m1_buf_dec32((gnss != NULL) ? (uint32_t)gnss->fix_mode : 0U);
    kvc_m1_buf_puts(" s");
    kvc_m1_buf_dec32((gnss != NULL) ? (uint32_t)gnss->satellites_tracked : 0U);
    kvc_m1_buf_puts(" hd");
    kvc_m3_buf_hdop((gnss != NULL) ? gnss->hdop_centi : 0xFFFFU);
    kvc_m1_buf_puts(" la");
    kvc_m3_buf_dec32s((gnss != NULL) ? gnss->lat_deg7 : 0);
    kvc_m1_buf_puts(" lo");
    kvc_m3_buf_dec32s((gnss != NULL) ? gnss->lon_deg7 : 0);
    kvc_m1_buf_puts(" v");
    kvc_m1_buf_dec32(kvc_gnss_is_3d_fix() ? 1U : 0U);

    /* Yaw cho georef (KVC-MCU-1.5): giá trị 0,1° và cờ dùng được.
     * `yw=-` nghĩa là chưa có/đã cũ/tốc độ quá thấp -> georef từ chối.
     * Kèm tốc độ (0,01 knot) vì hướng chỉ đáng tin khi UAV đang bay ngang. */
    {
        uint16_t yaw_deg10 = 0U;
        bool yaw_ok = kvc_gnss_get_course_deg10(kvc_millis(), &yaw_deg10);
        kvc_m1_buf_puts(" yw=");
        if (yaw_ok) {
            kvc_m1_buf_dec32((uint32_t)yaw_deg10);
        } else {
            kvc_m1_buf_puts("-");
        }
        kvc_m1_buf_puts(" sp=");
        kvc_m1_buf_dec32((uint32_t)kvc_gnss_get_speed_centi_knots());
    }

    /* FPGA BBox: số candidate, cờ valid, số frame lỗi CRC, và cờ bật driver.
     *
     * KVC-BENCH-20261028: thêm `en=` ở CUỐI cụm để log cũ vẫn đọc được bằng mắt
     * theo cùng thứ tự; `en0` nghĩa là driver UART1 không được khởi tạo (bo
     * không có FPGA), nên `n0 v0 crc0` là ĐÚNG chứ không phải lỗi. */
    bbox = kvc_fpga_bbox_get_state();
    kvc_m1_buf_puts(" | BB n");
    kvc_m1_buf_dec32((bbox != NULL) ? (uint32_t)bbox->candidate_count : 0U);
    kvc_m1_buf_puts(" v");
    kvc_m1_buf_dec32(kvc_fpga_bbox_is_valid() ? 1U : 0U);
    kvc_m1_buf_puts(" crc");
    kvc_m1_buf_dec32((bbox != NULL) ? bbox->crc_err_count : 0U);
    kvc_m1_buf_puts(" en");
    kvc_m1_buf_dec32((uint32_t)KVC_FPGA_ENABLE);

    /* LoRa: cờ sẵn sàng + RegVersion thật đọc được lúc boot.
     * ver=0x12 là đúng; 0x00/0xFF là dấu hiệu dây SPI hoặc nguồn. */
    kvc_m1_buf_puts(" | LORA d");
    kvc_m1_buf_dec32((uint32_t)s_lora_available);
    kvc_m1_buf_puts(" ver=");
    kvc_m1_buf_hex32((uint32_t)s_lora_last_version);

    /* Chu kỳ: số vòng vượt hạn 1 s. >0 nghĩa là khối xử lý chậm hơn 1 Hz. */
    kvc_m1_buf_puts(" | ovr");
    kvc_m1_buf_dec32(snap->cycle_overrun_count);

    /* KVC-BENCH-20261028: số gói phát thành công / thất bại (cộng dồn từ reset).
     * fail > 0 nghĩa là có gói KHÔNG ra được anten — khác hẳn với "gateway
     * không nhận". Đây là nửa còn lại của phép đối chiếu GW-2.2. */
    kvc_m1_buf_puts(" tx=");
    kvc_m1_buf_dec32(s_tx_ok_count);
    kvc_m1_buf_putc('/');
    kvc_m1_buf_dec32(s_tx_fail_count);

    s_m1_snap_ready = 1;
}

#endif /* KVC_M3_VALUE_DIAG */

/* Cấu hình UART5 (P0.14/P0.15) cho kênh chẩn đoán. Dùng chung cho M1 và M2:
 * M2 cần TX UART5 để công bố thống kê ring. Chỉ tác động UART5 và P0.14/P0.15.
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

#if (KVC_M1_CLOCK_DIAG == 1)
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

#endif /* KVC_M1_CLOCK_DIAG */

/* In thống kê RX ring của 3 cổng cảm biến. Đây là SỐ ĐO THẬT từ counter phần
 * mềm/phần cứng, khác với các giá trị clock suy ra từ thanh ghi ở trên. */
static void kvc_m1_dump_rx_stats(void) {
#if (KVC_M2_RX_STATS_DIAG == 1)
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
    kvc_m1_buf_puts(" byt=");
    kvc_m1_buf_dec32(bbox.byte_count);
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
    kvc_m1_buf_puts(" byt=");
    kvc_m1_buf_dec32(gnss.byte_count);
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
    kvc_m1_buf_puts(" byt=");
    kvc_m1_buf_dec32(usd.byte_count);
    kvc_m1_buf_puts(" isr=");
    kvc_m1_buf_dec32(usd.isr_count);
    /* KVC-MCU-1.1: các bộ đếm theo KẾT QUẢ GIẢI MÃ mới là chỉ số chất lượng dữ
     * liệu thật. `fe` cao chỉ phản ánh chân TX idle LOW, không phải dữ liệu hỏng.
     *   val = khung qua checksum (trong + ngoài dải) -> module CÓ trả lời
     *   ok  = khung nằm trong dải 20..500 cm         -> dùng được
     *   bad = checksum sai                            -> nhiễu làm hỏng bit
     * Đọc theo thứ tự: bad>0 -> đường dây; val=0 -> module không đáp;
     * val>0 & ok=0 -> module đáp nhưng ngoài tầm (xem raw). */
    kvc_m1_buf_puts(" val=");
    kvc_m1_buf_dec32(usd.frame_valid);
    kvc_m1_buf_puts(" ok=");
    kvc_m1_buf_dec32(usd.frame_ok);
    kvc_m1_buf_puts(" bad=");
    kvc_m1_buf_dec32(usd.frame_bad);
    kvc_m1_buf_puts(" trg=");
    kvc_m1_buf_dec32(usd.trigger_count);
    /* raw = mm thô của khung hợp lệ gần nhất, KỂ CẢ ngoài dải.
     * 6000 = No Echo (không có phản xạ); 501..5999 = có phản xạ nhưng vượt trần. */
    {
        uint16_t raw_mm = 0U;
        bool     raw_ok = false;
        kvc_usound_get_last_raw(&raw_mm, &raw_ok);
        kvc_m1_buf_puts(" raw=");
        if (raw_ok) {
            kvc_m1_buf_dec32((uint32_t)raw_mm);
        } else {
            kvc_m1_buf_puts("na");
        }
    }
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
 * Hiện được gọi từ khối chẩn đoán clock (M1) nên chỉ biên dịch khi M1 bật.
 */
#if (KVC_M1_CLOCK_DIAG == 1)
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
#endif /* KVC_M1_CLOCK_DIAG */

#if (KVC_M1_CLOCK_DIAG == 1)
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

#else /* M1 == 0 && M2 == 0 && M3 == 0 */

/* KVC-BENCH-20261028: cấu hình KHÔNG bật bất kỳ khối chẩn đoán nào (bản phát
 * hành tối giản, UART5 chỉ để nạp/debug).
 *
 * Toàn bộ buffer + pump UART5 không được biên dịch, nhưng `main()` vẫn gọi các
 * hàm soạn dòng `[INIT]` ở 6 chỗ. Nếu không có stub thì build FAIL vì undefined
 * symbol. Định nghĩa stub rỗng cho CẢ bộ builder thay vì bọc `#if` quanh từng
 * call-site (6 khối, dễ sót khi thêm dòng log mới).
 *
 * Lưu ý: stub KHÔNG sinh mã — ở cấu hình này firmware hoàn toàn không in gì ra
 * UART5, đúng như chủ ý "bản phát hành tối giản". */
static void kvc_diag_boot_begin(void) { }
static void kvc_diag_boot_end(void) { }
static void kvc_diag_boot_puts(const char *s) { (void)s; }
static void kvc_m1_buf_puts(const char *s) { (void)s; }
static void kvc_m1_buf_dec32(uint32_t v) { (void)v; }
static void kvc_m1_buf_hex8(uint32_t v) { (void)v; }

#endif /* (KVC_M1_CLOCK_DIAG == 1) || (KVC_M2_RX_STATS_DIAG == 1) || (KVC_M3_VALUE_DIAG == 1) */

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

/* SPI bit-bang 1 byte.
 *
 * TỐC ĐỘ THỰC (sửa comment sai — KVC-BENCH-20261028): mỗi pha là 25 vòng NOP
 * trên biến `volatile`, ước ~3-4 chu kỳ/vòng ở 12 MHz => 25*3.5/12e6 ≈ 7,3 µs
 * cho mỗi nửa chu kỳ, tức ~14,6 µs/bit => SCL ~68 kHz. Bản trước ghi
 * "500 kHz - 1 MHz" là SAI khoảng một bậc độ lớn.
 *
 * Hệ quả: 32 byte (256 bit) ~3,7 ms cho phần nạp FIFO — vẫn không đáng kể so với
 * 67 ms airtime, nên KHÔNG cần tăng tốc. Muốn tăng phải đo bằng scope trước.
 * Đây là ước lượng từ số chu kỳ, chưa phải phép đo. */
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

    /* 3. Kiểm tra thanh ghi nhận diện chip RegVersion (0x42) phải là 0x12.
     * Ghi lại giá trị vừa đọc để khối chẩn đoán M3 in ra khi init thất bại —
     * xem giải thích ở s_lora_last_version. */
    uint8_t ver = sx1278_read_reg(0x42);
    s_lora_last_version = ver;
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

/* Phát 1 gói tin dữ liệu ra Anten.
 *
 * KVC-BENCH-20261028: đổi từ `void` sang `uint8_t` (1 = phát xong có TxDone,
 * 0 = thất bại) và cập nhật s_tx_ok_count / s_tx_fail_count. Mọi nhánh thoát
 * đều phải đếm — nếu chỉ đếm nhánh thành công thì `tx=ok/fail` không còn phản
 * ánh đúng số gói đã cố phát. */
static uint8_t sx1278_send_packet(const uint8_t *payload, uint8_t len) {
    /* 0. AUTO-RECOVERY TẦNG 1: Kiểm tra chip SX1278 có bị sụt áp reset về FSK (bit 7 LongRangeMode == 0) không.
     *    Nếu có, lập tức khôi phục lại cấu hình LoRa chuẩn trước khi gửi */
    if ((sx1278_read_reg(0x01) & 0x80) == 0) {
        if (!sx1278_init_tx()) {
            /* Không khôi phục được chip: gói này chắc chắn không phát ra được.
             * Vẫn tiếp tục phần còn lại để không treo vòng main — nhưng phải
             * đếm fail thay vì im lặng như bản trước. */
            s_tx_fail_count++;
            return 0U;
        }
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
        s_tx_fail_count++;
        (void)sx1278_init_tx();
        return 0U;
    }

    /* 7. Xóa cờ ngắt sau khi phát xong */
    sx1278_write_reg(0x12, 0xFF);

    /* 8. Đưa chip về Standby để giải phóng khối khuếch đại công suất PA */
    sx1278_write_reg(0x01, 0x81);

    s_tx_ok_count++;
    return 1U;
}

/* KVC-BENCH-20261028: đưa hai chân giao tiếp FPGA về trạng thái xác định khi
 * KHÔNG có bo FPGA cắm vào.
 *
 * VẤN ĐỀ: P2.3 (URXD1) và P0.12 (DATA_READY) hiện là input không pull. Chân
 * CMOS float vừa dễ nhiễu vừa tiêu hao dòng; riêng P2.3 khi UART1 bật ngắt sẽ
 * sinh byte rác liên tục. Đây đúng cơ chế đã gặp với đường RX siêu âm trước khi
 * tắt ngắt ngoài cửa sổ nghe.
 *
 * GIỚI HẠN (chưa xác minh): cần đo thực tế xem pull nội còn tác dụng khi chân ở
 * chế độ AFIO. Nếu không tác dụng, P2.3 vẫn float — khi đó phải hàn trở treo
 * 10 kΩ lên 3V3 như phương án A của KVC_PHAN_CONG_2_NGUOI.md mục 1.1.
 * Hàm này KHÔNG thay đổi gì tới UART1 (không ghi LC/DLL/NVIC).
 */
static void kvc_fpga_pins_idle_safe(void) {
    SN_SCU->APB1CLKG |= (1U << 17) | (1U << 19);   /* P0CLKEN, P2CLKEN */

    /* P2.3 = URXD1: kéo LÊN để đường RX idle HIGH (mức stop bit). Kéo xuống sẽ
     * tạo start bit giả liên tục nếu ai đó bật ngắt UART1. */
    SN_GPIO2->PUTYPE |= (1U << KVC_PIN_FPGA_URXD1_PIN);
    SN_GPIO2->PULLEN |= (1U << KVC_PIN_FPGA_URXD1_PIN);

    /* P0.12 = DATA_READY: input, kéo XUỐNG (mức "không có frame mới"), không
     * bật EXTI. Kéo xuống để tránh chân float khi FPGA vắng mặt. */
    SN_GPIO0->PUTYPE &= ~(1U << KVC_PIN_FPGA_READY_PIN);
    SN_GPIO0->PULLEN |= (1U << KVC_PIN_FPGA_READY_PIN);
    SN_GPIO0->DIR    &= ~(1U << KVC_PIN_FPGA_READY_PIN);
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
#elif (KVC_M2_RX_STATS_DIAG == 1) || (KVC_M3_VALUE_DIAG == 1)
    /* M1 tắt nhưng M2/M3 bật: vẫn phải mở UART5 để công bố thống kê ring và
     * giá trị cảm biến, nếu không tick nào cũng thấy s_m1_tx_ready == 0 và im
     * lặng. Chỉ cấu hình TX UART5/P0.15, không đọc thanh ghi clock. */
    kvc_m1_uart5_diag_init();
#endif

    /* KVC-BENCH-20261028: banner ngay sau khi mở UART5, TRƯỚC mọi thứ khác.
     *
     * Nếu Hercules không thấy 2 dòng này thì lỗi nằm ở đường TX P0.15 / baud /
     * GND chung — KHÔNG phải ở cảm biến. Nhờ vậy không mất thời gian nghi ngờ
     * driver khi thực chất chưa có log nào ra được.
     *
     * Đặt trước khối test LED (500 ms) để dòng đầu tiên xuất hiện càng sớm càng
     * tốt sau reset. */
    kvc_diag_boot_puts("=== " KVC_FW_ID " BOOT ===");
    kvc_diag_boot_puts("[INIT] UART5 cfg=9615 8N1 (Hercules: 9600 8N1)");

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

    /* KVC-BENCH-20261028: kết quả init LoRa kèm RegVersion thật.
     *
     * Dùng lại s_lora_last_version (đã đọc trong sx1278_init_tx) — KHÔNG đọc
     * thêm SPI, nên dòng log này không thể tự gây lỗi bus. Giá trị giúp phân
     * biệt ngay nguyên nhân:
     *   0x12 -> chip đúng, lỗi ở bước sau (không phải SPI)
     *   0x00 -> MISO kẹt thấp / chip mất nguồn / NSS sai
     *   0xFF -> MISO kẹt cao / dây hở / thiếu pull-up
     *   khác -> chip khác hoặc SPI sai mode */
    kvc_diag_boot_begin();
    kvc_m1_buf_puts("[INIT] LORA ");
    if (s_lora_available != 0U) {
        kvc_m1_buf_puts("OK ver=");
    } else {
        kvc_m1_buf_puts("FAIL ver=");
    }
    kvc_m1_buf_hex8((uint32_t)s_lora_last_version);
    if (s_lora_available == 0U) {
        kvc_m1_buf_puts(" tries=");
        kvc_m1_buf_dec32((uint32_t)KVC_LORA_BOOT_RETRIES);
        kvc_m1_buf_puts(" mode=DEGRADED(no_tx)");
    }
    kvc_diag_boot_end();

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

    /* KVC-BENCH-20261028: kết quả init IMU + địa chỉ thật tìm được.
     *
     * Mã lỗi trùng với số nhịp chớp LED2 nên log và đèn nói cùng một chuyện:
     *   0 OK (kèm addr 0x68/0x69)
     *   1 bus kẹt (SDA/SCL chập mass)      2 không ACK ở cả 0x68 và 0x69
     *   3 có ACK nhưng WHO_AM_I != 0x68    4 ghi lệnh đánh thức thất bại
     * addr là thông tin chỉ có trong log: GY-87 clone có thể đặt AD0 cao -> 0x69,
     * và người dùng cần biết điều đó trước khi kết luận "module hỏng". */
    kvc_diag_boot_begin();
    kvc_m1_buf_puts("[INIT] IMU ");
    if (imu_ready) {
        kvc_m1_buf_puts("OK addr=");
        kvc_m1_buf_hex8((uint32_t)imu_addr);
    } else {
        kvc_m1_buf_puts("FAIL err=");
        kvc_m1_buf_dec32((uint32_t)imu_status);
    }
    kvc_diag_boot_end();

    /* 5. Khởi tạo cảm biến siêu âm chống nước AJ-SR04M qua UART2 (9600 bps: P2.14 UTXD2, P2.15 URXD2) */
    kvc_usound_init();

    kvc_diag_boot_puts("[INIT] US uart2=9600 window=250ms (Mode 4, trigger 0x01)");

    /* 5b. Khởi tạo module định vị vệ tinh u-blox NEO-M10 qua UART3
     * (9600 bps mặc định theo KVC_GNSS_BAUD_RATE: P2.0 UTXD3, P2.1 URXD3)
     *
     * LƯU Ý THỜI GIAN: kvc_gnss_init() có thể chạy tới 11–15 s vì nó dò tốc độ
     * module (5 ứng viên × 1500 ms). Trong suốt thời gian đó UART2 đã bật ngắt từ
     * bước 5 nhưng KHÔNG ai tiêu thụ ring, nên ring 1024 byte tràn và FSM giải mã
     * siêu âm bị lệch trạng thái. Vì vậy ngay sau đây phải xả ring (xem bước 5d). */
    kvc_gnss_init();

    /* KVC-BENCH-20261028: kết quả GNSS kèm tốc độ THỰC đã chọn.
     *
     * `baud=0` = autobaud không nhận được câu NMEA nào ở cả 5 ứng viên; UART3
     * vẫn được mở ở KVC_GNSS_BAUD_RATE để hệ thống chạy tiếp. Khi đó đừng kết
     * luận "driver GNSS hỏng" — kiểm tra dây TX module -> P2.1, nguồn module,
     * anten. Muốn boot nhanh hơn có thể đặt KVC_GNSS_SKIP_AUTOBAUD=1 sau khi
     * chắc chắn module đã ở 9600. */
    kvc_diag_boot_begin();
    kvc_m1_buf_puts("[INIT] GNSS baud=");
    kvc_m1_buf_dec32(kvc_gnss_get_active_baud());
    kvc_m1_buf_puts(" target=");
    kvc_m1_buf_dec32((uint32_t)KVC_GNSS_BAUD_RATE);
#if (KVC_GNSS_SKIP_AUTOBAUD == 1)
    kvc_m1_buf_puts(" autobaud=off");
#else
    kvc_m1_buf_puts(" autobaud=on");
#endif
    kvc_diag_boot_end();

    /* 5d. Xả dữ liệu siêu âm ứ đọng trong lúc autobaud GNSS chạy.
     *
     * Nếu bỏ bước này, khung 4 byte bị cắt giữa chừng khi ring tràn sẽ khiến FSM
     * hiểu sai vị trí byte (ví dụ đang chờ checksum lại nhận được 0xFF header) và
     * cảm biến trả lỗi liên tục dù phần cứng vẫn tốt. Đã gặp trên kit.
     *
     * Đặt SAU kvc_gnss_init() và TRƯỚC kvc_fpga_bbox_init() để thời gian chết
     * không tăng thêm (bbox init ngắn). */
    kvc_usound_discard_stale_rx();

    /* 5c. FPGA OneKiwi (IF-01).
     *
     * KVC-BENCH-20261028: bo hiện tại KHÔNG có FPGA và phía FPGA chưa có
     * RTL/top-level phát BBox, nên mặc định KHÔNG khởi tạo UART1 (xem
     * KVC_FPGA_ENABLE).
     *
     * VÌ SAO PHẢI TẮT CẢ ĐƯỜNG: khi UART1 bật ngắt mà P2.3 không được lái,
     * chân float sinh byte rác -> `[RING] FPGA fe/byt/isr` tăng liên tục, log
     * chẩn đoán nhiễu và ISR đốt CPU vô ích. Đặt =1 khi cắm mock_fpga_bbox.py
     * qua USB-TTL hoặc khi đã có RTL. */
    kvc_fpga_pins_idle_safe();
#if (KVC_FPGA_ENABLE == 1)
    kvc_fpga_bbox_init();
    kvc_diag_boot_puts("[INIT] FPGA UART1 en=1 38400 8N1 (IF-01)");
#else
    kvc_diag_boot_puts("[INIT] FPGA SKIP en=0 (khong co RTL/topmodule)");
#endif

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

    /* 7. Vòng lặp phát sóng định kỳ.
     *
     * KVC-PERIOD: chu kỳ được điều khiển bằng MỐC THỜI GIAN TUYỆT ĐỐI, không
     * đếm số bước. Trước đây vòng trong đếm đúng 1000 nhịp `delay_ms(1)`, nên
     * chu kỳ thật = 1000 ms + thời gian chặn của cảm biến/TX. Kết quả: telemetry
     * ~1,1-1,4 s chứ không phải 1,0 s, đúng bằng ngưỡng 3 s mà gateway coi là
     * mất sóng và ngưỡng 2 s BBox hết hạn -> dữ liệu AI tới trạm đất đã cũ.
     *
     * Nay mỗi vòng ghi `cycle_start` rồi chờ ĐẾN mốc `cycle_start + period`
     * trong lúc vẫn poll cảm biến. Nếu khối xử lý vượt quá period thì vòng chờ
     * bằng 0 (không bù dồn, không tăng tốc bất thường) và `s_cycle_overrun`
     * tăng để biết có xảy ra và xảy ra bao nhiêu lần. */
    uint32_t cycle_start_ms = kvc_millis();
    uint32_t cycle_overrun_count = 0U;

    while (1) {
        /* KVC-F10: kick watchdog ở ĐÚNG MỘT chỗ, đầu mỗi vòng. Không kick trong
         * ISR để watchdog còn phát hiện được main bị treo. */
        kvc_wdt_feed();

        cycle_start_ms = kvc_millis();

        pkt.seq_num = seq++;
        /* FIX (Codex F6 / KVC-F6b): timestamp_ms được lấy NGAY TRƯỚC khi đóng gói
         * ở cuối vòng (xem khối kvc_finalize_telemetry_packet). Không lấy ở đây
         * vì các bước sau (IMU bit-bang, chờ siêu âm ~250 ms) đã làm mốc này cũ. */

        /* Nếu IMU chưa nhận diện được, tự động dò tìm lại để người dùng cắm lại
         * dây là nhận ngay.
         *
         * KVC-BENCH-20261028: chỉ thử lại mỗi KVC_IMU_RETRY_DIV chu kỳ, không thử
         * mỗi chu kỳ. `mpu6050_init()` chạy cả bus-recovery 9 xung SCL + 4 lệnh
         * ghi (~1 ms bit-bang); khi IMU hỏng, gọi mỗi giây là đốt thời gian vô
         * ích và làm nặng thêm ngân sách 1 Hz. 10 chu kỳ ~ 10 s: đủ nhanh để
         * người dùng thấy nhận lại sau khi cắm dây, đủ thưa để không ảnh hưởng
         * chu kỳ đo.
         *
         * Vẫn giữ nguyên hành vi cũ về mặt chức năng: cắm lại dây -> tự nhận. */
        if (!imu_ready) {
            static uint8_t s_imu_retry_div = 0U;
            bool do_retry = false;

            if (s_imu_retry_div == 0U) {
                do_retry = true;
            }
            s_imu_retry_div++;
            if (s_imu_retry_div >= (uint8_t)KVC_IMU_RETRY_DIV) {
                s_imu_retry_div = 0U;
            }

            if (do_retry) {
                imu_status = mpu6050_init(&imu_addr);
                if (imu_status == MPU6050_ERR_OK) {
                    imu_ready = 1;
                    /* BẬT SÁNG ĐÈN LED2 ĐỨNG YÊN NGAY LẬP TỨC KHI CẢM BIẾN ĐƯỢC KẾT NỐI */
                    KVC_BOARD_LED2_ON();
                } else {
                    KVC_BOARD_LED2_OFF();
                }
            }
        } else {
            /* Giữ LED2 luôn sáng đứng yên báo hiệu IMU đang kết nối tốt */
            KVC_BOARD_LED2_ON();
        }

        /* Đọc dữ liệu góc nghiêng từ cảm biến IMU GY-87 nếu có cắm.
         * KVC-M3-20261026-001: roll/pitch được khai báo NGOÀI khối if để khối
         * chẩn đoán M3 đọc được giá trị của vòng hiện tại. Việc ghi vào
         * pkt.reserved[] và cờ IMU_VALID giữ nguyên hoàn toàn như trước. */
        int16_t m3_roll_deg10 = 0;
        int16_t m3_pitch_deg10 = 0;
        uint8_t m3_imu_ok = 0U;

        if (imu_ready) {
            if (mpu6050_read_angles(imu_addr, &m3_roll_deg10, &m3_pitch_deg10)) {
                m3_imu_ok = 1U;
                pkt.sensor_flags |= KVC_FLAG_IMU_VALID;
                /* Ghi Roll và Pitch (đơn vị 0.1 độ, ví dụ 152 = 15.2°) vào 4 byte reserved */
                pkt.reserved[0] = (uint8_t)(m3_roll_deg10 & 0xFF);
                pkt.reserved[1] = (uint8_t)((m3_roll_deg10 >> 8) & 0xFF);
                pkt.reserved[2] = (uint8_t)(m3_pitch_deg10 & 0xFF);
                pkt.reserved[3] = (uint8_t)((m3_pitch_deg10 >> 8) & 0xFF);
            } else {
                /* Đọc thất bại (mất kết nối hoặc chập I2C): Đánh dấu mất IMU để tự dò tìm lại */
                imu_ready = 0;
                KVC_BOARD_LED2_OFF();
                pkt.sensor_flags &= ~KVC_FLAG_IMU_VALID;
                pkt.reserved[0] = 0;
                pkt.reserved[1] = 0;
                pkt.reserved[2] = 0;
                pkt.reserved[3] = 0;
                m3_roll_deg10 = 0;
                m3_pitch_deg10 = 0;
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
        kvc_gnss_poll(kvc_millis());
        int32_t uav_lat = 0;
        int32_t uav_lon = 0;
        /* IF-02 byte 24 bit 0 nghĩa là "GNSS 3D Fix hợp lệ", nên chỉ bật cờ khi
         * driver xác nhận 3D fix (mode == 3, sats >= 5, 0 < HDOP <= 2.50).
         * Trước đây dùng kvc_gnss_is_valid() (chấp nhận cả 2D) nên toạ độ có
         * thể được công bố dù chưa đủ điều kiện 3D. */
        if (kvc_gnss_is_3d_fix()) {
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

        /* Cập nhật và giải mã khung BBox từ FPGA (UART1 P2.3).
         *
         * KVC-BENCH-20261028: chỉ poll khi driver đã được khởi tạo. Khi
         * KVC_FPGA_ENABLE=0, ring RX1 không có dữ liệu (UART1 chưa bật) nên
         * poll vẫn an toàn, nhưng bỏ hẳn lời gọi tránh phải gọi hàm rỗng
         * 1000 lần/giây và làm rõ ý định trong code. */
#if (KVC_FPGA_ENABLE == 1)
        kvc_fpga_bbox_poll(kvc_millis());
#endif
        if (kvc_fpga_bbox_is_valid()) {
            const KvcFpgaFrameState *fpga_state = kvc_fpga_bbox_get_state();
            const KvcFpgaBBoxItem *target = NULL;
            uint8_t target_idx = 0;

            if (fpga_state != NULL && fpga_state->candidate_count > 0) {
                /* Luân phiên báo cáo các mục tiêu (TDM Round-Robin).
                 *
                 * KVC-PERIOD: đếm theo SỐ GÓI, không theo thời gian. Trước đây
                 * dùng cửa sổ 1500 ms trong khi chu kỳ phát ~1,1-1,4 s, nên
                 * thực tế mục tiêu chỉ nhảy mỗi 2 gói và mốc 1,5 s không bao
                 * giờ đúng. Đếm theo gói là tất định: mỗi gói một mục tiêu.
                 * Chỉ số được mod theo candidate_count nên luôn nằm trong mảng
                 * kể cả khi số mục tiêu giảm giữa hai gói. */
                static uint8_t s_target_cycle_idx = 0;
                target_idx = (uint8_t)(s_target_cycle_idx % fpga_state->candidate_count);
#if (KVC_TDM_ROTATE_EVERY_PACKET == 1)
                s_target_cycle_idx++;
#endif
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
                 * KVC-MCU-1.5: BỔ SUNG XOAY THEO YAW. Trước đây khối này giả
                 * định camera LUÔN hướng Bắc, nên khi UAV xoay thì toạ độ mục
                 * tiêu lệch đúng bằng góc xoay (sai hoàn toàn ở 90/180/270°).
                 *
                 * Yaw lấy từ `track_made_good` của câu RMC (xem
                 * kvc_gnss_get_course_deg10). Đó là hướng CHUYỂN ĐỘNG, không
                 * phải hướng camera, nên chỉ dùng khi UAV bay ngang đủ nhanh;
                 * hàm getter đã từ chối khi đứng yên hoặc course quá 3 s.
                 *
                 * GIỚI HẠN CÒN LẠI: fx = 554 và tâm 320x240 là hằng số danh
                 * định, chưa dùng intrinsics hiệu chuẩn, chưa undistort, chưa bù
                 * góc nghiêng IMU và chưa có extrinsic camera->body. Yaw cũng
                 * chỉ là xấp xỉ hướng chuyển động. Đây vẫn là georef xấp xỉ,
                 * chưa đủ để nghiệm thu (M3). */
                bool alt_ok = ((pkt.sensor_flags & KVC_FLAG_ALT_VALID) != 0U) &&
                              (pkt.alt_dist_cm >= 20U) && (pkt.alt_dist_cm <= 800U);
                bool pose_ok = ((pkt.sensor_flags & KVC_FLAG_GNSS_VALID) != 0U);

                uint16_t yaw_deg10 = 0U;
                /* KVC-MCU-1.5: Yaw chỉ dùng khi ĐÁNG TIN (RMC status A, course
                 * ≤ 3 s, tốc độ ≥ 0,5 knot). Khi không có Yaw, hành vi giữ
                 * nguyên như trước đây: giả định camera hướng Bắc.
                 *
                 * VÌ SAO KHÔNG TỪ CHỐI TÍNH TOẠ ĐỘ KHI THIẾU YAW: IF-02 chỉ có
                 * một cặp lat/lon và 4 bit cờ (bit 4..7 dự phòng). Nếu MCU giữ
                 * lat/lon = toạ độ UAV mà vẫn bật ALT_VALID + GNSS_VALID, backend
                 * (esp32_ingress.py:95 `has_wgs84_position`) sẽ coi đó là toạ độ
                 * mục tiêu HỢP LỆ và báo mục tiêu nằm ngay dưới UAV — sai nguy
                 * hiểm hơn nhiều so với việc dùng Yaw xấp xỉ. Muốn biểu diễn
                 * "phát hiện nhưng chưa định vị" cần thêm 1 bit trong byte cờ
                 * (đề xuất bit 4 = TARGET_POS_VALID); đó là thay đổi IF-02 nên
                 * phải thống nhất với gateway/backend trước, không tự sửa.
                 *
                 * GIỚI HẠN CÒN LẠI (đã ghi trong KVC_PHAN_CONG_2_NGUOI.md §7):
                 * khi UAV đứng yên hoặc bay chậm, Yaw không có -> georef vẫn
                 * giả định hướng Bắc như trước, nên nếu camera đang xoay thì toạ
                 * độ vẫn lệch. Log `[M3]` in `yw=-` để nhận biết trạng thái này. */
                bool yaw_ok = kvc_gnss_get_course_deg10(kvc_millis(), &yaw_deg10);
                if (!yaw_ok) {
                    yaw_deg10 = 0U;   /* 0 = Bắc: hành vi cũ, đã ghi rõ giới hạn */
                }

                if (!alt_ok || !pose_ok) {
                    /* Không bịa vị trí target; giữ vị trí UAV nếu GNSS vẫn hợp lệ. */
                    pkt.target_lat = pose_ok ? uav_lat : 0;
                    pkt.target_lon = pose_ok ? uav_lon : 0;
                    pkt.target_x_local = 0;
                    pkt.target_y_local = 0;
                } else {
                    float h_m = (float)pkt.alt_dist_cm / 100.0f;
                    if (h_m < 0.2f) h_m = 0.2f;

                    /* Độ lệch MÉT trong hệ trục ẢNH:
                     *   right_m  : dương = sang phải ảnh
                     *   fwd_m    : dương = lên trên ảnh (ra xa camera) */
                    int32_t right_mm = (int32_t)(((float)target->x_center - 320.0f) * (h_m / 554.0f) * 1000.0f);
                    int32_t fwd_mm   = (int32_t)((240.0f - (float)target->y_center) * (h_m / 554.0f) * 1000.0f);

                    /* Xoay hệ trục ảnh sang hệ trục địa lý (Đông, Bắc). */
                    int32_t east_mm  = 0;
                    int32_t north_mm = 0;
                    kvc_geo_rotate_to_ne(right_mm, fwd_mm, yaw_deg10, &east_mm, &north_mm);

                    float delta_x_m = (float)east_mm / 1000.0f;    /* Đông */
                    float delta_y_m = (float)north_mm / 1000.0f;   /* Bắc */

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

        /* Làm mới mốc thời gian NGAY TRƯỚC khi đóng gói: từ KVC-F6b, time base đã
         * tính cả thời gian chặn (đọc siêu âm ~250 ms, bit-bang I2C, TX LoRa
         * ~300 ms của vòng trước), nên `pkt.timestamp_ms` lấy ở đầu vòng đã cũ
         * vài trăm ms. Đóng gói bằng giá trị cũ sẽ làm GCS hiển thị mốc lệch và
         * làm sai ngưỡng expiry/TDM ở phía nhận. */
        pkt.timestamp_ms = kvc_millis();

        /* Tự động điền Sync Header 0xAA 0x55 và tính mã CRC-16 chuẩn xác */
        kvc_finalize_telemetry_packet(&pkt);

        /* Bật đèn LED1 chỉ báo bắt đầu bắn gói tin */
        KVC_BOARD_LED1_ON();

        /* Bắn gói tin 32 bytes ra Anten.
         * F7: ở degraded mode (LoRa không khởi tạo được) thì bỏ qua phát để
         * không chặn 300 ms mỗi vòng và không gọi SPI vào chip không tồn tại.
         * Cảm biến vẫn được poll bình thường để chẩn đoán. */
        if (s_lora_available != 0U) {
            (void)sx1278_send_packet((const uint8_t *)&pkt, sizeof(pkt));
        }

        /* Tắt đèn LED1 sau khi bắn xong */
        KVC_BOARD_LED1_OFF();

#if (KVC_M3_VALUE_DIAG == 1)
        /* KVC-M3-20261026-001: chốt ảnh chụp giá trị của VÒNG HIỆN TẠI để in
         * trong lúc chờ. Snapshot lấy đúng các biến đã dùng cho telemetry phía
         * trên nên log M3 và gói RF luôn nhất quán. */
        KvcM3Snapshot m3_snap;
        m3_snap.usound_cm          = usound_cm;
        m3_snap.usound_ok          = (usound_res == KVC_USOUND_OK) ? 1U : 0U;
        m3_snap.usound_code        = usound_res;
        m3_snap.pad0               = 0U;
        m3_snap.pad1               = 0U;
        m3_snap.pad2               = 0U;
        m3_snap.roll_deg10         = m3_roll_deg10;
        m3_snap.pitch_deg10        = m3_pitch_deg10;
        m3_snap.imu_ok             = m3_imu_ok;
        m3_snap.cycle_overrun_count = cycle_overrun_count;
#else
        /* M3 tắt: roll/pitch vẫn được đọc để ghi pkt.reserved[] nên không có
         * cảnh báo unused; chỉ m3_imu_ok là set-but-not-used nên đọc bỏ. */
        (void)m3_imu_ok;
#endif

#if (KVC_M1_CLOCK_DIAG == 1) || (KVC_M2_RX_STATS_DIAG == 1) || (KVC_M3_VALUE_DIAG == 1)
        /* KVC-M3-20261026-001: định dạng + xả text MỘT lần mỗi vòng main, TRƯỚC
         * vòng chờ. Lý do: nếu khối xử lý vượt hạn 1 s (siêu âm 250 ms + TX LoRa
         * 300 ms + ...) thì vòng chờ bên dưới không chạy lượt nào; nếu chỉ tick
         * trong vòng chờ thì UART5 im lặng đúng lúc cần chẩn đoán overrun nhất.
         * Cả hai tick đều tự chặn theo thời gian nên gọi thêm trong vòng chờ
         * không sinh dòng trùng. */
#if (KVC_M2_RX_STATS_DIAG == 1)
        kvc_m2_stats_tick();
#endif
#if (KVC_M3_VALUE_DIAG == 1)
        kvc_m3_value_tick(&m3_snap);
#endif
        kvc_m1_diag_pump();
#endif

        /* CHỜ ĐẾN MỐC TUYỆT ĐỐI `cycle_start_ms + KVC_TELEMETRY_PERIOD_MS`.
         *
         * Vẫn poll cảm biến trong lúc chờ để không mất byte UART nào. Vòng lặp
         * kết thúc khi đã tới hạn, nên chu kỳ phát là 1000 ms bất kể thời gian
         * xử lý ở trên là bao nhiêu (miễn là < 1000 ms).
         *
         * Nếu khối xử lý đã vượt hạn, `elapsed >= period` ngay từ đầu nên vòng
         * chờ không chạy lần nào; ta đếm vào `cycle_overrun_count` để biết chuyện
         * đó có xảy ra thật hay không, thay vì im lặng coi như đúng 1 Hz. */
        while ((uint32_t)(kvc_millis() - cycle_start_ms) < KVC_TELEMETRY_PERIOD_MS) {
            kvc_gnss_poll(kvc_millis());
#if (KVC_FPGA_ENABLE == 1)
            kvc_fpga_bbox_poll(kvc_millis());
#endif
            kvc_usound_poll();
#if (KVC_M1_CLOCK_DIAG == 1) || (KVC_M2_RX_STATS_DIAG == 1) || (KVC_M3_VALUE_DIAG == 1)
            /* Xả text chẩn đoán dần theo THRE. Không delay, nên không chặn
             * polling UART1/2/3 và không gây tràn FIFO cảm biến.
             * KVC-M3-20261026-001: pump phục vụ M1/M2/M3 nên điều kiện mở rộng;
             * trước đây chỉ M1 nên cấu hình mặc định (M1=0, M2=1) không xả gì. */
            kvc_m1_diag_pump();
#endif
#if (KVC_M2_RX_STATS_DIAG == 1)
            /* Công bố thống kê RX ring mỗi ~5 s để theo dõi gate
             * oe/fe/drop = 0 trong suốt buổi chạy, không cần nạp lại. */
            kvc_m2_stats_tick();
#endif
#if (KVC_M3_VALUE_DIAG == 1)
            /* In giá trị cảm biến ~1 Hz để nghiệm thu từng cảm biến trên bo. */
            kvc_m3_value_tick(&m3_snap);
#endif
            delay_ms(1);
        }

        /* Đo chu kỳ thực đã trôi (ms). > period nghĩa là khối xử lý vượt hạn;
         * đếm lại để có số liệu thay vì giả định 1 Hz. Không log mỗi vòng để
         * không chiếm UART5; log qua thống kê dưới đây khi có overrun. */
        if ((uint32_t)(kvc_millis() - cycle_start_ms) > KVC_TELEMETRY_PERIOD_MS) {
            cycle_overrun_count++;
        }
    }
}
