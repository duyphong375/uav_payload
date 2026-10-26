# KVC — Tài liệu Kỹ thuật Phần cứng: Vi Điều Khiển Sonix SN34F788 & Bo Starter-Kit V1.1

Tài liệu này tổng hợp các thông số trọng yếu của vi điều khiển 32-bit **Sonix SN34F788FG** và bo mạch phát triển **SN34F780 Starter-Kit V1.1** dựa trên User Manual v1.7, Quick Start Guide, schematic Starter-Kit V1.1 và DFP 2.0.4 có trong `docs/hardware/sonix_sn34f788/`. Đây là bản tra cứu theo chủ đề, không thay thế User Manual đầy đủ hoặc xác nhận phần cứng/firmware KVC đã chạy.

---

## 1. Tổng quan Thiết bị & Nhận dạng

| Thành phần | Thông tin chi tiết | Căn cứ tài liệu |
| :--- | :--- | :--- |
| **Mã chip vi điều khiển** | **Sonix SN34F788FG** (Dòng SN34F780 Series, kiến trúc ARM Cortex-M4F) | User Manual v1.7 trang 26–27 |
| **Lưu ý phân biệt** | Đây là dòng **SN34F788** (Cortex-M4F 192 MHz, Flash 512KB, SRAM 160KB). Không nhầm lẫn với dòng SN32F788 hoặc STM32F4. | User Manual v1.7 Product Overview |
| **Đóng gói (Package)** | **LQFP 64-pin** (kích thước thân 10 × 10 mm, bước chân 0.5 mm, mã hậu tố `FG`) | User Manual v1.7 mục 1.4.1 & trang 513 |
| **Bo mạch phát triển** | **SN34F780 Starter-Kit Board V1.1** (tích hợp mạch nạp SN-LINK Lite) | QuickStart v1.1 mục 2.2, Schematic V1.1 |
| **Công cụ nạp & debug** | Bộ nạp giả lập phần cứng **SN-LINK-V3** hoặc **SN-LINK Lite** tích hợp sẵn | User Manual v1.7 Chương 22, 23 |
| **Môi trường phát triển** | Keil MDK-ARM v5.xx với gói thiết bị `SONiX.SN34F7_DFP.2.0.4.pack` | QuickStart v1.1 mục 2.3 |

---

## 2. Thông số Kiến trúc Lõi ARM Cortex-M4F

Vi điều khiển **SN34F788** sử dụng nhân vi xử lý 32-bit RISC hiệu năng cao của ARM:

*   **Lõi CPU:** ARM Cortex-M4F phiên bản r0p1.
*   **Tần số làm việc tối đa:** **192 MHz** cho CPUCLK, HCLK và ma trận bus AHB.
*   **Khối xử lý dấu phẩy động (FPU):** Tích hợp phần cứng FPU đơn chính xác (Single Precision Floating Point Unit, chuẩn IEEE 754), hỗ trợ lệnh tính toán dấu phẩy động nhanh cho các thuật toán định vị, ma trận góc Euler/quaternion, và lọc Kalman.
*   **Khối bảo vệ bộ nhớ (MPU):** Hỗ trợ thiết lập 8 vùng bảo vệ bộ nhớ độc lập, chống tràn stack hoặc ghi đè phân vùng bộ nhớ nguy hiểm.
*   **Bộ điều khiển ngắt (NVIC):** Hỗ trợ ngắt lồng nhau đa mức ưu tiên với thời gian phản hồi ngắt cực ngắn.
*   **SysTick Timer:** Bộ đếm thời gian hệ thống 24-bit đếm lùi, xung nhịp cố định theo xung nhịp hệ thống để cấp nhịp cho RTOS (FreeRTOS, CMSIS-RTOS).
*   **Ma trận Bus AHB:** Ma trận **9 Master × 11 Slave**, HCLK tối đa 192 MHz theo sơ đồ khối. Cấu trúc cho phép nhiều master/slave hoạt động; không tự bảo đảm không có tranh chấp hoặc đạt băng thông ứng dụng nào đó.
*   **Bus ngoại vi APB:**
    *   **APB0:** Tốc độ xung nhịp tối đa **48 MHz** (phục vụ UART1~4, Timer CT16B6~7, ADC0, RTC, SSP0~1).
    *   **APB1:** Tốc độ xung nhịp tối đa **96 MHz** (phục vụ UART0, UART5, Timer CT16B0~5, CT16B8, CAN0, CAN1, SSP2, SDIO, ETHMAC).

---

## 3. Tổ chức Bộ nhớ (Memory Map)

### 3.1 Bộ nhớ Flash ROM (512 KB)
Tổng dung lượng bộ nhớ Flash trên chip là **512 KB**, chia làm 2 phân vùng:
*   **User Application Flash:** **504 KB** (từ địa chỉ `0x0000_0000` đến `0x0007_DFFF`), dùng để chứa vector ngắt và mã nguồn chương trình ứng dụng.
*   **System Bootloader ROM (ISP):** **8 KB** (từ địa chỉ `0x0007_E000` đến `0x0007_FFFF`), chứa chương trình nạp Bootloader nạp sẵn của nhà sản xuất Sonix phục vụ nạp chương trình qua UART/USB (In-System Programming - ISP).
*   **Đặc tính lập trình Flash:**
    *   Phân trang: Kích thước 1 trang (Page) = **512 bytes** (tổng cộng 1024 trang).
    *   Khối Sector: 512 trang = 256 KB.
    *   Thời gian xóa 1 trang: ~10.6 ms.
    *   Thời gian nạp 1 trang: ~3.8 ms.
    *   Tuổi thọ ghi/xóa: 10.000 ~ 100.000 chu kỳ (Endurance Cycles).

### 3.2 Bộ nhớ RAM nội (160 KB SRAM)
Tổng dung lượng SRAM là **160 KB**, được chia nhỏ thành các khối độc lập trên ma trận AHB:
*   **SRAM1:** 32 KB, địa chỉ `0x2000_0000` (có alias tại `0x1000_0000`).
*   **SRAM2:** 96 KB, địa chỉ `0x2000_8000`.
*   **SRAM3:** 32 KB, địa chỉ `0x2002_0000`.
*   **BKPSRAM:** 4 KB tại `0x4005_1000`, có thanh ghi điều khiển riêng (`SCU_BKPSRAMCTRL`). Manual mô tả chế độ sleep/retention/nap và nguồn backup; dữ liệu chỉ được xem là giữ lại khi cấu hình đúng miền nguồn/chế độ hoạt động. Không coi đây là RAM giữ dữ liệu qua mọi loại reset hoặc mất nguồn.

### 3.3 Bảng Phân Bố Địa Chỉ Cơ Sở Ngoại Vi (Peripheral Base Memory Map)

Bảng địa chỉ cơ sở trích xuất trực tiếp từ CMSIS Device Family Pack `SONiX.SN34F7_DFP.2.0.4.pack` (`SN34F780.h` & `SN34F780.svd`) và đối chiếu User Manual v1.7:

| Miền Bus | Khối Ngoại Vi (C/C++ Symbol) | Địa Chỉ Cơ Sở (Base Address) | Tốc Độ Tối Đa | Chức Năng Chính Phục Vụ Hệ Thống |
| :--- | :--- | :--- | :---: | :--- |
| **System** | `SN_UC` | `0x0040_0000` | HCLK | Mã định danh thiết bị duy nhất (Unique Device Code / Chip UID) |
| **System** | `SN_FLASH` | `0x0060_1000` | HCLK | Bộ điều khiển bộ nhớ Flash (Flash Memory Controller - FMC) |
| **APB0** | `SN_CT16B6` | `0x4000_0000` | 48 MHz | Bộ đếm thời gian cơ bản 16-bit Timer 6 |
| | `SN_CT16B7` | `0x4000_1000` | 48 MHz | Bộ đếm thời gian cơ bản 16-bit Timer 7 |
| | `SN_WDT` | `0x4000_B000` | 32 kHz (ILRC) | Watchdog Timer độc lập (chu kỳ an toàn 6s - Task F10) |
| | `SN_WWDT` | `0x4000_C000` | 48 MHz | Window Watchdog Timer (giám sát cửa sổ thời gian) |
| | `SN_UART1` | `0x4001_1000` | 48 MHz | Giao diện UART1 (Nhận BBox từ FPGA: P2.3/P2.2, 38.4k mặc định / 115.2k khi có PLL) |
| | `SN_UART2` | `0x4001_2000` | 48 MHz | Giao diện UART2 (Đọc cảm biến siêu âm AJ-SR04M: P2.15/P2.14, 9.600 bps) |
| | `SN_UART3` | `0x4001_3000` | 48 MHz | Giao diện UART3 (Đọc NMEA GNSS NEO-M10N: P2.1/P2.0, 9.600 bps) |
| | `SN_UART4` | `0x4001_4000` | 48 MHz | Giao diện UART4 |
| | `SN_CAN0` | `0x4001_9000` | 48 MHz | Bộ điều khiển mạng CAN 0 (CAN 2.0A/B) |
| | `SN_CAN1` | `0x4001_A000` | 48 MHz | Bộ điều khiển mạng CAN 1 |
| | `SN_ALWAYSON` | `0x4001_B000` | 32.768 kHz | Miền Always-On (Quản lý RTC & chế độ đánh thức năng lượng thấp) |
| | **`SN_SCU`** | **`0x4001_F000`** | 48 MHz | **Khối Điều khiển Hệ thống (System Control Unit: Clock, Reset, Pin Mux AFIO)** |
| **APB1** | `SN_CT16B0` | `0x4002_0000` | 96 MHz | Bộ Timer nâng cao 16-bit CT16B0 (Hỗ trợ ngắt Break, Dead-band PWM) |
| | `SN_CT16B1` | `0x4002_1000` | 96 MHz | Bộ Timer đa năng 16-bit CT16B1 |
| | `SN_CT16B2` | `0x4002_2000` | 96 MHz | Bộ Timer đa năng 16-bit CT16B2 |
| | `SN_CT16B3` | `0x4002_3000` | 96 MHz | Bộ Timer đa năng 16-bit CT16B3 |
| | `SN_UART0` | `0x4002_4000` | 96 MHz | Giao diện High-Speed UART0 |
| | `SN_UART5` | `0x4002_5000` | 96 MHz | Giao diện High-Speed UART5 (Cổng Console chẩn đoán / Debug: P1.5/P1.6, 9.600 bps) |
| | `SN_LCM` | `0x4002_6000` | 96 MHz | Bộ điều khiển màn hình LCD song song (Chuẩn 8080/6800) |
| | **`SN_ADC0`** | **`0x4002_7000`** | 96 MHz | **Bộ chuyển đổi SAR ADC 12-bit 1 MSPS (16 kênh ngoài + VDD/VSS)** |
| | `SN_CRC` | `0x4002_8000` | 96 MHz | Bộ tăng tốc tính toán CRC phần cứng (CRC-16 / CRC-32) |
| | **`SN_SPI0`** | **`0x4002_A000`** | 96 MHz | **Bộ điều khiển SPI 0 (Giao tiếp module LoRa Ai-Thinker Ra-02 SX1278: P0.6~P0.9)** |
| | `SN_SPI1` | `0x4002_B000` | 96 MHz | Bộ điều khiển SPI 1 |
| | `SN_CT16B4` | `0x4002_D000` | 96 MHz | Bộ Timer đa năng 16-bit CT16B4 |
| | `SN_CT16B5` | `0x4002_E000` | 96 MHz | Bộ Timer đa năng 16-bit CT16B5 |
| | `SN_CT16B8` | `0x4002_F000` | 96 MHz | Bộ Timer đa năng 16-bit CT16B8 |
| | `SN_SPI2` | `0x4003_1000` | 96 MHz | Bộ điều khiển SPI 2 |
| | **`SN_I2C0`** | **`0x4003_3000`** | 96 MHz | **Bộ điều khiển I2C 0 (Giao tiếp cảm biến IMU GY-87: P0.10/P0.11)** |
| | `SN_I2C1` | `0x4003_4000` | 96 MHz | Bộ điều khiển I2C 1 |
| | `SN_I2C2` | `0x4003_5000` | 96 MHz | Bộ điều khiển I2C 2 |
| | **`SN_GPIO0`** | **`0x4003_7000`** | 96 MHz | **Cổng xuất/nhập đa năng GPIO Port 0 (Chứa SPI0 LoRa, I2C0 IMU GY-87)** |
| | **`SN_GPIO1`** | **`0x4003_8000`** | 96 MHz | **Cổng GPIO Port 1 (Chứa UART5 Console P1.5/P1.6, chân BOOT P1.3)** |
| | **`SN_GPIO2`** | **`0x4003_9000`** | 96 MHz | **Cổng GPIO Port 2 (Chứa UART3 GNSS, UART1 FPGA, UART2 Siêu âm và 16 ngõ ADC)** |
| | **`SN_GPIO3`** | **`0x4003_A000`** | 96 MHz | **Cổng GPIO Port 3 (Chứa đường nạp SWD, chân Reset và Thạch anh)** |
| **AHB** | `SN_BKPSRAM` | `0x4005_1000` | 192 MHz | Bộ nhớ lưu trữ dữ liệu nguồn phụ Backup SRAM (4 KB) |
| | `SN_SDIO` | `0x4005_2000` | 192 MHz | Giao diện Thẻ nhớ tốc độ cao SDIO 4-bit |
| | **`SN_DMA0`** | **`0x4005_3000`** | 192 MHz | **Bộ điều khiển truy cập bộ nhớ trực tiếp DMA 0 (8 kênh độc lập)** |
| | **`SN_DMA1`** | **`0x4005_4000`** | 192 MHz | **Bộ điều khiển truy cập bộ nhớ trực tiếp DMA 1 (8 kênh độc lập)** |
| | `SN_ETHMAC` | `0x4005_5000` | 192 MHz | Bộ điều khiển Ethernet MAC 10/100 Mbps (RMII/MII) |
| **ARM Core SCS** | `CORTEX_M4_SCS` | `0xE000_E000` | 192 MHz | Không gian điều khiển hệ thống ARM Cortex-M4F |
| | `SysTick` | `0xE000_E010` | 192 MHz | Đồng hồ định thời hệ thống SysTick 24-bit |
| | `NVIC` | `0xE000_E100` | 192 MHz | Bộ điều khiển ngắt lồng nhau đa mức ưu tiên |
| | `SCB` | `0xE000_ED00` | 192 MHz | Khối điều khiển hệ thống System Control Block (Vector Table, Reset) |
| | `MPU` | `0xE000_ED90` | 192 MHz | Khối bảo vệ bộ nhớ Memory Protection Unit (8 phân vùng) |
| | `FPU` | `0xE000_EF30` | 192 MHz | Thanh ghi điều khiển bộ xử lý dấu phẩy động FPU (FPCCR, FPCAR) |

---

### 3.4 Bản Đồ Thanh Ghi Các Khối Ngoại Vi Cốt Lõi (Core Peripheral Register Map)

#### 3.4.1 Khối Điều Khiển Hệ Thống ([`SN_SCU`](file:///d:/Project_UAV_KVC/docs/hardware/mcu/CHIP_SONIX_SN34F788_MCU.md) — Địa chỉ cơ sở `0x4001_F000`)
Khối SCU quản lý toàn bộ hệ thống nguồn, clock, reset và cấu hình chân của MCU:

| Offset | Tên Thanh Ghi | Thuộc Tính | Reset Value | Chức Năng Kỹ Thuật |
| :---: | :--- | :---: | :---: | :--- |
| `0x000` | `BTUP_STS` | R/W | `0x0000_0000` | Trạng thái khởi động (Boot-up Status, bit 2 `GPIO_HOLD`) |
| `0x004` | `BTUP_CTRL` | R/W | `0x0000_0000` | Điều khiển khởi động hệ thống |
| `0x010` | `CHIPID` | R | Chip Spec | Mã định danh ID vi điều khiển |
| `0x020` | `PWRMODE` | R/W | `0x0000_0000` | Chế độ nguồn (Normal, Sleep, Deep-Sleep, Deep Power-Down) |
| `0x02C` | `PERRSTCTL` | R/W | `0x0000_0000` | Điều khiển Reset ngoại vi hệ thống |
| `0x030` | `PLLCTRL` | R/W | `0x0000_0000` | Điều khiển bộ nhân tần PLL nội lên tới 192 MHz |
| `0x050` | `AHBCLKG` | R/W | `0x0000_0001` | Cấp xung nhịp (Clock Gating) bus AHB: DMA0/1, SDIO, BKPSRAM, ETHMAC |
| `0x060` | `APB0CLKG` | R/W | `0x0000_0000` | Cấp xung nhịp bus APB0: UART1~4, CT16B6/7, WDT, CAN0/1 |
| `0x064` | `APB1CLKG` | R/W | `0x0000_0000` | Cấp xung nhịp bus APB1: UART0/5, SPI0~2, I2C0~2, ADC0, CT16B0~5/8 |
| `0x200` | `RTC_TIME1` | R/W | `0x0000_0000` | Thanh ghi thời gian RTC 1 (Giây, Phút, Giờ) |
| `0x204` | `RTC_TIME2` | R/W | `0x0000_0000` | Thanh ghi thời gian RTC 2 (Ngày, Tháng, Năm, Thứ) |
| `0x800` | `CLKSEL` | R/W | `0x0000_0000` | Chọn nguồn xung nhịp chính (IHRC 12MHz, HXT 10~25MHz, SysPLL) |
| `0x804` | `CLKPRE` | R/W | `0x0000_0000` | Bộ chia tần xung nhịp hệ thống (HCLK Prescaler) |
| `0x808` | `IHRCCTRL` | R/W | `0x0000_0000` | Cân chỉnh và bật/tắt bộ dao động RC nội cao tần |
| `0x80C` | `PLLSTS` | R | `0x0000_0000` | Trạng thái khóa tần PLL (PLL Lock status) |
| `0x810` | `AHBRST` | R/W | `0x0000_0000` | Reset phần mềm các ngoại vi thuộc ma trận AHB |
| `0x814` | `APB0RST` | R/W | `0x0000_0000` | Reset phần mềm các ngoại vi bus APB0 |
| `0x818` | `APB1RST` | R/W | `0x0000_0000` | Reset phần mềm các ngoại vi bus APB1 |
| `0x900` | `P0STR` | R/W | `0x0000_0000` | Độ mạnh dòng lái/kéo (Drive/Sink Strength) cho `P0.0 ~ P0.15` |
| `0x904` | `P1STR` | R/W | `0x0000_0000` | Độ mạnh dòng lái/kéo cho `P1.0 ~ P1.15` |
| `0x908` | `P2STR` | R/W | `0x0000_0000` | Độ mạnh dòng lái/kéo cho `P2.0 ~ P2.15` |
| `0x90C` | `P3STR` | R/W | `0x0000_0000` | Độ mạnh dòng lái/kéo cho `P3.0 ~ P3.13` |
| `0xBF0` | `SRAM1CTRL` | R/W | `0x0000_0000` | Cấu hình tín hiệu phụ cho khối bộ nhớ SRAM1 32KB |
| `0xBF4` | `SRAM2CTRL` | R/W | `0x0000_0000` | Cấu hình tín hiệu phụ cho khối bộ nhớ SRAM2 96KB |
| `0xBF8` | `SRAM3CTRL` | R/W | `0x0000_0000` | Cấu hình tín hiệu phụ cho khối bộ nhớ SRAM3 32KB |
| `0xBFC` | `BKPSRAMCTRL`| R/W | `0x0000_0000` | Cấu hình chế độ duy trì dữ liệu cho khối BKPSRAM 4KB |

#### 3.4.2 Khối Xuất Nhập Ngoại Vi GPIO (Port 0 ~ Port 3)
Địa chỉ cơ sở: Port 0 = `0x4003_7000`, Port 1 = `0x4003_8000`, Port 2 = `0x4003_9000`, Port 3 = `0x4003_A000`:

| Offset | Tên Thanh Ghi | Thuộc Tính | Reset Value | Chức Năng Kỹ Thuật |
| :---: | :--- | :---: | :---: | :--- |
| `+0x00` | `DATAOUT` | R/W | `0x0000_0000` | Xuất mức logic ngõ ra cho các chân thuộc Port |
| `+0x04` | `DATAIN` | R | Logic Chân | Đọc mức logic thực tế trên chân ngõ vào |
| `+0x08` | `DIR` | R/W | `0x0000_0000` | Hướng chân: bit = `0` là Input (Mặc định), bit = `1` là Output |
| `+0x10` | `BSET` | W | — | Thiết lập mức HIGH cho chân tương ứng theo bit (Atomic Bit Set) |
| `+0x14` | `BCLR` | W | — | Thiết lập mức LOW cho chân tương ứng theo bit (Atomic Bit Clear) |
| `+0x18` | `PULLEN` | R/W | `0x0000_0000` | Cho phép điện trở kéo nội (Pull Resistor Enable) |
| `+0x1C` | `PUTYPE` | R/W | `0x0000_0000` | Chọn loại trở kéo: bit = `0` là Pull-down, bit = `1` là Pull-up |
| `+0x20` | `IE` | R/W | `0x0000_0000` | Cho phép kích hoạt cờ ngắt ngõ vào trên chân tương ứng |
| `+0x2C` | `IMASKEN` | R/W | `0x0000_0000` | Mặt nạ ngắt GPIO (Mask Interrupt) |
| `+0x30` | `IC` | W | — | Xóa cờ trạng thái ngắt chân (Interrupt Clear) |
| `+0x34` | `ITRIG` | R/W | `0x0000_0000` | Chọn kiểu kích hoạt ngắt: Mức điện áp (Level) hay Sườn xung (Edge) |
| `+0x38` | `IBETRIG` | R/W | `0x0000_0000` | Cho phép ngắt kích hoạt ở cả hai sườn xung (Both Edge Trigger) |
| `+0x3C` | `IRFTRIG` | R/W | `0x0000_0000` | Chọn sườn kích hoạt: Sườn lên (Rising) hay Sườn xuống (Falling) |
| `+0x40` | `BNEN` | R/W | `0x0000_0000` | Bật mạch lọc chống rung số cho chân ngõ vào (De-bounce Enable) |
| `+0x44` | `BNCLKPRE` | R/W | `0x0000_0000` | Bộ chia tần xung nhịp cho mạch lọc chống rung ngõ vào |

#### 3.4.3 Khối Truyền Thông Nối Tiếp (UART0 ~ UART5)
Cấu trúc chuẩn công nghiệp tích hợp Fractional Baud Rate Generator và FIFO 16-byte:

| Offset | Tên Thanh Ghi | Thuộc Tính | Chức Năng Kỹ Thuật Khi Truy Cập |
| :---: | :--- | :---: | :--- |
| `+0x00` | `RB` | R | Receiver Buffer: Đọc dữ liệu 8-bit từ đầu hàng đợi RX FIFO |
| `+0x00` | `TH` | W | Transmit Holding: Ghi dữ liệu 8-bit vào đầu hàng đợi TX FIFO |
| `+0x00` | `DLL` | R/W | Divisor Latch LSB: 8-bit thấp của bộ chia tốc độ Baud (chỉ truy cập khi bit `DLAB = 1` trong thanh ghi `LC`) |
| `+0x04` | `DLM` | R/W | Divisor Latch MSB: 8-bit cao của bộ chia tốc độ Baud (khi `DLAB = 1`) |
| `+0x04` | `IE` | R/W | Interrupt Enable: Cho phép ngắt nhận dữ liệu (RDAIE), trống đệm phát (THREIE), lỗi đường truyền (RLSIE) |
| `+0x08` | `II` | R | Interrupt Identification: Nhận diện nguyên nhân ngắt phần cứng đang xảy ra |
| `+0x08` | `FIFOCTRL` | W | FIFO Control: Bật/tắt FIFO, xóa hàng đợi RX/TX FIFO, cấu hình ngưỡng ngắt FIFO trigger |
| `+0x08` | `PRE` | R/W | Fractional Baud Prescaler: Bộ chia tần số thập phân giúp tinh chỉnh sai số Baud về xấp xỉ 0% |
| `+0x0C` | `LC` | R/W | Line Control: Thiết lập độ dài ký tự (5/6/7/8-bit), bit dừng (Stop bits), chẵn lẻ (Parity), và chốt `DLAB` |
| `+0x10` | `MC` | R/W | Modem Control: Điều khiển tín hiệu RTS, DTR và kích hoạt Auto-Flow Control phần cứng |
| `+0x14` | `LS` | R | Line Status: Cờ trạng thái đường truyền (DR - Data Ready, THRE - TX Empty, OE - Overrun, FE - Frame Error) |
| `+0x18` | `MS` | R | Modem Status: Trạng thái các chân bắt tay ngoài (CTS, DSR, RI, DCD) |
| `+0x1C` | `SP` | R/W | Scratch Pad: Thanh ghi nháp 8-bit lưu trữ tạm |
| `+0x20` | `MD` | R/W | Mode Definition: Cấu hình chế độ mở rộng (RS-485 Auto-Direction DE/RE, IrDA, ISO7816 Smartcard) |
| `+0x5C` | `RXFFCNT` | R | RX FIFO Count: Số byte thực tế đang sẵn sàng trong bộ đệm nhận RX FIFO |

#### 3.4.4 Khối Giao Tiếp Đồng Bộ SPI / SSP (SPI0 ~ SPI2)
Phục vụ giao tiếp trực tiếp với chip LoRa Semtech SX1278 (trên module Ai-Thinker Ra-02):

| Offset | Tên Thanh Ghi | Thuộc Tính | Reset Value | Chức Năng Kỹ Thuật |
| :---: | :--- | :---: | :---: | :--- |
| `+0x00` | `CTRL0` | R/W | `0x0000_0000` | Thiết lập độ dài từ truyền (4-bit đến 16-bit), định dạng khung (SPI / SSI / Microwire), pha và cực tính xung (`CPOL`, `CPHA`) |
| `+0x04` | `CTRL1` | R/W | `0x0000_0000` | Bật khối SPI (`SPI_EN`), chọn Master/Slave mode, Loopback test, bộ chia xung nhịp SCK (`CLKDIV`) |
| `+0x08` | `CTRL2` | R/W | `0x0000_0000` | Cấu hình bật bộ đệm FIFO truyền/nhận và kích hoạt luồng DMA (`DMA_TX_EN`, `DMA_RX_EN`) |
| `+0x0C` | `STATUS` | R | `0x0000_0003` | Cờ trạng thái: `BUSY` (Đang truyền nhận), `TFE` (TX FIFO Empty), `TNF` (TX Not Full), `RNE` (RX Not Empty), `RFF` (RX Full) |
| `+0x10` | `ICTRL` | R/W | `0x0000_0000` | Cho phép các nguồn ngắt phần cứng SPI (RX Overflow, RX Timeout, RX/TX FIFO Threshold) |
| `+0x14` | `RIS` | R | `0x0000_0000` | Trạng thái cờ ngắt thô (Raw Interrupt Status) |
| `+0x18` | `DATA` | R/W | `0x0000_0000` | Cổng dữ liệu 16-bit: ghi vào để phát qua MOSI, đọc ra để nhận từ MISO |

#### 3.4.5 Khối Giao Tiếp I2C (I2C0 ~ I2C2)
Hỗ trợ tốc độ Standard (100 kbps), Fast (400 kbps), Fast-plus (1 Mbps):

| Offset | Tên Thanh Ghi | Thuộc Tính | Reset Value | Chức Năng Kỹ Thuật |
| :---: | :--- | :---: | :---: | :--- |
| `+0x00` | `CTRL` | R/W | `0x0000_0000` | Điều khiển I2C: Bật giao tiếp (`I2C_EN`), phát tín hiệu `START`, `STOP`, `ACK`, chọn chế độ Master/Slave |
| `+0x04` | `STATUS` | R | `0x0000_00F8` | Trạng thái máy trạng thái I2C (Mã trạng thái bus theo chuẩn công nghiệp) |
| `+0x08` | `CLKDIV` | R/W | `0x0000_0000` | Bộ chia tốc độ xung nhịp SCL (Tính toán cho 100 kHz hoặc 400 kHz) |
| `+0x0C` | `DATA` | R/W | `0x0000_0000` | Thanh ghi dữ liệu 8-bit truyền và nhận trên đường SDA |
| `+0x10` | `ADDR` | R/W | `0x0000_0000` | Thiết lập địa chỉ Slave 7-bit hoặc 10-bit của MCU |
| `+0x14` | `TGS` | R/W | `0x0000_0000` | Thiết lập thời gian Set/Hold và mạch lọc chống xung nhiễu (Glitch Suppression) |
| `+0x18` | `BM` | R | `0x0000_0000` | Giám sát đường bus vật lý SDA/SCL (Bus Monitor) |

#### 3.4.6 Khối Bộ Chuyển Đổi Tương Tự - Số ([`SN_ADC0`](file:///d:/Project_UAV_KVC/docs/hardware/mcu/CHIP_SONIX_SN34F788_MCU.md) — Địa chỉ cơ sở `0x4002_7000`)
12-bit SAR ADC tốc độ 1 MSPS với 18 nguồn kênh đo:

| Offset | Tên Thanh Ghi | Thuộc Tính | Chức Năng Kỹ Thuật |
| :---: | :--- | :---: | :--- |
| `+0x000 ~ +0x044` | `DATA0 ~ DATA17` | R | Dữ liệu chuyển đổi 12-bit của 18 kênh (Kênh `0~15` ngoài, kênh `16` đo VDD, kênh `17` đo VSS) |
| `+0x100` | `CTRL` | R/W | Bật bộ ADC (`ADC_EN`), kích hoạt chuyển đổi (Software / Timer trigger), chọn chế độ quét Single/Continuous |
| `+0x110` | `TPARM` | R/W | Tham số định thời cho bộ chuyển đổi SAR nội |
| `+0x114` | `SMPR` | R/W | Chu kỳ lấy mẫu kênh ADC (Sampling Time Parameter) |
| `+0x11C` | `PRE` | R/W | Bộ chia tần số xung nhịp cho ADC (đảm bảo f_ADC ≤ 16 MHz) |
| `+0x120 ~ +0x130`| `SQR0 ~ SQR4` | R/W | Thanh ghi trình tự chuyển đổi đa kênh liên tục (Scan Sequence Registers) |
| `+0x140` | `EOCIE` | R/W | Cho phép ngắt khi hoàn thành chuyển đổi mẫu (End Of Conversion Interrupt Enable) |
| `+0x150` | `EOCIS` | R/W | Cờ trạng thái ngắt kết thúc chuyển đổi (End Of Conversion Interrupt Status) |
| `+0x200 ~ +0x23C`| `DMA0DAT ~ DMA3IS`| R/W | Cổng truyền nhận dữ liệu kết nối trực tiếp với 4 kênh DMA |
| `+0x300 ~ +0x38C`| `THRHOLD0 ~ 35` | R/W | Cấu hình ngưỡng bảo vệ Analog Window Watchdog (High/Low Threshold Detect) |

#### 3.4.7 Khối Điều Khiển DMA ([`SN_DMA0`](file:///d:/Project_UAV_KVC/docs/hardware/mcu/CHIP_SONIX_SN34F788_MCU.md) / [`SN_DMA1`](file:///d:/Project_UAV_KVC/docs/hardware/mcu/CHIP_SONIX_SN34F788_MCU.md) — Base `0x4005_3000` / `0x4005_4000`)
Mỗi bộ điều khiển DMA quản lý 8 kênh phần cứng độc lập. Các thanh ghi chung của bộ điều khiển:
* `+0x00` (`INT`): Trạng thái ngắt tổng thể của bộ DMA.
* `+0x04` (`INT_TC`): Trạng thái ngắt hoàn thành truyền toàn bộ khối (Terminal Count).
* `+0x08` (`INT_TC_CLR`): Xóa cờ ngắt Terminal Count.
* `+0x1C` (`CH_EN`): Cờ trạng thái cho phép của 8 kênh DMA.
* `+0x20` (`CH_BUSY`): Cờ báo kênh DMA đang bận truyền dữ liệu.

Các thanh ghi điều khiển riêng cho từng Kênh $n$ ($n = 0 \dots 7$, mỗi kênh chiếm khối $0x20$ byte, bắt đầu từ địa chỉ `+0x100 + n * 0x20`):
* `+0x100 + n*0x20` (`Cn_CSR`): Điều khiển và trạng thái của Kênh $n$ (Bật/tắt kênh, ưu tiên mức kênh).
* `+0x104 + n*0x20` (`Cn_CFG`): Cấu hình loại nguồn/đích (Memory/Peripheral), kích thước gói dữ liệu (8/16/32-bit), bước tăng địa chỉ.
* `+0x108 + n*0x20` (`Cn_SRCADDR`): Địa chỉ ô nhớ nguồn (Source Memory / Peripheral Data Register).
* `+0x10C + n*0x20` (`Cn_DSTADDR`): Địa chỉ ô nhớ đích (Destination Memory / Peripheral Data Register).
* `+0x114 + n*0x20` (`Cn_SIZE`): Số lượng dữ liệu (Transfer Length) cần chuyển giao trước khi dừng.

---

## 4. Điện áp Hoạt động, Miền Nguồn & Tiêu Thụ Năng Lượng

### 4.1 Mức điện áp hoạt động
*   **Điện áp nguồn chính (VDD):** **2.4V ~ 3.6V** (danh định **3.3V**). Dải tuyệt đối tối đa: `-0.3V ~ 3.6V`.
*   **Miền nguồn I/O độc lập (VDDIO1):** Dải cấp nguồn từ **1.8V đến VDD**.
    *   Cấp nguồn riêng cho các chân I/O: **`P0.12 ~ P0.15`**, **`P3.0 ~ P3.6`**, và **`P1.6 ~ P1.11`**.
    *   Tính năng: Cho phép các chân này giao tiếp trực tiếp với cảm biến hoặc FPGA ở mức logic 1.8V, 2.5V hoặc 3.3V mà không cần mạch chuyển mức điện áp ngoài.
    *   Trên bo Starter-Kit V1.1, Jumper **`J1`** mặc định nối `VDDIO1` với `VDD` (3.3V).
*   **Bộ điều áp nội (Internal Core LDO):** Hạ áp từ `VDD` xuống **1.2V** để cấp nguồn cho lõi CPU logic.
    *   Yêu cầu phần cứng bắt buộc: Chân **`VCAP1`** phải gắn tụ lọc điện áp ngoài có giá trị danh định **CLOAD ≥ 1.1 µF** (thường dùng tụ gốm 1.5 µF hoặc 2.2 µF nối đất) để đảm bảo độ ổn định cho bộ điều áp.

> [!CAUTION]
> Chip Sonix SN34F788 **không phải là dòng vi điều khiển 5V**. Mọi chân GPIO và chân nguồn VDD/VDDA chỉ chấp nhận mức điện áp tối đa `VDD + 0.2V` (tối đa 3.6V). Cổng USB 5.0V trên Starter Kit chỉ đi vào IC ổn áp LDO (U2) hạ áp xuống 3.3V; tuyệt đối không cấp 5.0V trực tiếp vào các chân của MCU.

### 4.2 Dòng tiêu thụ điện năng (tại VDD = 3.3V)
*   **Chế độ hoạt động bình thường (Normal Mode):**
    *   12 MHz: ~2.1 mA
    *   48 MHz: ~10.0 mA
    *   96 MHz: ~15.0 mA
    *   144 MHz: ~20.0 mA
    *   **192 MHz:** **~25.5 mA**
*   **Chế độ ngủ (Sleep Mode, 12 MHz):** ~1.1 mA
*   **Chế độ ngủ sâu (Deep Sleep Mode):** ~300 µA
*   **Chế độ tắt nguồn sâu (Deep Power-Down Mode):** ~10 µA

### 4.3 Khối bảo vệ nguồn (LVD / Reset)
Tích hợp mạch phát hiện sụt áp thấp (Low Voltage Detector - LVD) hỗ trợ tạo tín hiệu Reset hoặc Ngắt ngắt cảnh báo với 4 ngưỡng lập trình:
*   Mức 0: 2.30V ~ 2.50V (danh định 2.40V)
*   Mức 1: 2.50V ~ 2.70V (danh định 2.60V)
*   Mức 2: 2.70V ~ 2.90V (danh định 2.80V)
*   Mức 3: 2.90V ~ 3.10V (danh định 3.00V)

---

## 5. Hệ thống Xung Nhịp (Clock System)

SN34F788 sở hữu cấu trúc cây xung nhịp linh hoạt gồm 4 nguồn dao động:
1.  **HXT (External High-Speed Crystal):** Dao động thạch anh ngoài cao tần từ **10 MHz đến 25 MHz** (kết nối chân `XIN`/`P3.12` và `XOUT`/`P3.13`). Bo Starter-Kit gắn sẵn thạch anh **12 MHz** (Y1).
2.  **IHRC (Internal High-Speed RC):** Bộ dao động RC nội cao tần **12 MHz** (độ chính xác ±2% tại 25°C).
3.  **LXT (External Low-Speed Crystal):** Dao động thạch anh ngoài thấp tần **32.768 kHz** (kết nối chân `LXIN`/`P3.10` và `LXOUT`/`P3.11`), dùng làm nguồn xung chuẩn cho khối thời gian thực RTC. Bo Starter-Kit gắn sẵn thạch anh **32.768 kHz** (Y2).
4.  **ILRC (Internal Low-Speed RC):** Dao động RC nội thấp tần **32 kHz**, dùng cho Watchdog Timer độc lập và chế độ tiết kiệm năng lượng.
5.  **Bộ nhân tần PLL (System Phase-Locked Loop):** Nhận ngõ vào từ HXT hoặc IHRC, nhân tần số lên đến **192 MHz** để cấp xung nhịp chính cho CPU và toàn bộ hệ thống.

---

## 6. Khối Ngoại Vi Giao Tiếp & Xử Lý Tín Hiệu

### 6.1 Giao diện Truyền thông Số

#### 6× Bộ điều khiển UART (UART0 ~ UART5)
*   **UART0, UART5:** Nằm trên bus APB1 (tốc độ xung nhịp PCLK lên tới 96 MHz), hỗ trợ tốc độ baud cực cao và ổn định.
*   **UART1, UART2, UART3, UART4:** Nằm trên bus APB0 (tốc độ xung nhịp PCLK lên tới 48 MHz).
*   **Đặc tính:**
    *   Tích hợp bộ tạo tốc độ baud phân số (Fractional Baud Rate Generator) cho phép đạt sai số baud xấp xỉ 0% ở nhiều dải tần số.
    *   Hỗ trợ phần cứng bộ đệm FIFO truyền/nhận.
    *   Hỗ trợ điều khiển luồng phần cứng tự động CTS/RTS.
    *   Hỗ trợ chế độ đa điểm RS-485 (tự động điều khiển chân DE/RE).
    *   Hỗ trợ chuẩn hồng ngoại IrDA và thẻ thông minh ISO7816 Smartcard.

#### 3× Bộ điều khiển Đồng bộ SSP / SPI (SSP0 ~ SSP2)
*   Hỗ trợ đầy đủ các chuẩn truyền thông SPI (Master / Slave mode, 4 dây hoặc 3 dây).
*   Độ dài khung truyền lập trình linh hoạt từ **4-bit đến 16-bit**.
*   Hỗ trợ chế độ âm thanh số **I2S** (Inter-IC Sound) phục vụ truyền nhận dữ liệu âm thanh số.

#### 3× Bộ điều khiển I2C (I2C0 ~ I2C2)
*   Tương thích chuẩn giao tiếp I2C-bus của Philips/NXP và chuẩn SMBus.
*   Hỗ trợ 3 cấp tốc độ: Standard mode (**100 kbps**), Fast mode (**400 kbps**), và Fast-mode Plus (**1 Mbps**).
*   Hỗ trợ định địa chỉ thiết bị 7-bit và 10-bit; có mạch lọc nhiễu số trên các chân SCL/SDA.

#### 2× Bộ điều khiển Mạng CAN (CAN0, CAN1)
*   Tương thích hoàn toàn chuẩn **CAN 2.0A (chuẩn 11-bit ID)** và **CAN 2.0B (mở rộng 29-bit ID)**.
*   Tốc độ truyền dữ liệu tối đa lên đến **1 Mbps**.
*   Tích hợp bộ đệm tin nhắn phần cứng và bộ lọc chấp nhận ID (acceptance filter), tối ưu cho mạng điều khiển công nghiệp và ô tô/UAV.

#### 1× Giao tiếp Thẻ nhớ SDIO
*   Tương thích chuẩn SD Memory Card Specification v2.0 và MMC v4.2.
*   Hỗ trợ chế độ truyền bus 1-bit và 4-bit tốc độ cao, hỗ trợ liên kết DMA để đọc/ghi dữ liệu thẻ nhớ mà không tiêu tốn tài nguyên CPU.

#### 1× Giao tiếp Mạng Ethernet MAC (ETHMAC)
*   Bộ điều khiển Ethernet MAC 10/100 Mbps tương thích chuẩn IEEE 802.3.
*   Hỗ trợ kết nối chip PHY bên ngoài thông qua giao diện **RMII** (Reduced Media Independent Interface) hoặc **MII**.
*   Hỗ trợ quản lý phần cứng qua giao diện SMI (MDC/MDIO) và bộ lọc địa chỉ MAC phần cứng.

#### 1× Giao tiếp Màn hình LCD (LCM)
*   Giao tiếp điều khiển màn hình LCD song song hỗ trợ bus 8-bit hoặc 16-bit theo chuẩn công nghiệp **8080** hoặc **6800**.

### 6.2 Khối Điều khiển Truy cập Bộ nhớ Trực tiếp (DMA)
*   **2 bộ điều khiển DMA độc lập:** **DMA0** và **DMA1**.
*   Mỗi bộ điều khiển có **8 kênh phần cứng độc lập** (tổng cộng 16 luồng DMA trong hệ thống).
*   Hỗ trợ các hướng truyền:
    *   Bộ nhớ tới Bộ nhớ (Memory-to-Memory).
    *   Ngoại vi tới Bộ nhớ (Peripheral-to-Memory).
    *   Bộ nhớ tới Ngoại vi (Memory-to-Peripheral).
*   Liên kết tự động với các khối ADC, UART, SSP/SPI, Timers, SDIO để giảm tải tối đa cho lõi CPU khi xử lý luồng dữ liệu lớn.

### 6.3 Khối Ngoại Vi Tương Tự (Analog) & Định Thời (Timers)

#### 12-bit SAR ADC (16+2 Kênh)
*   **Độ phân giải:** 12-bit (không mất mã - No missing code).
*   **Tốc độ lấy mẫu:** Lên tới **1 MSPS** (thời gian chuyển đổi 14~16 chu kỳ xung nhịp ADC, xung nhịp ADC tối đa 16 MHz).
*   **Số kênh:** 18 nguồn chọn `AIN0 ~ AIN17`: 16 ngõ vào ngoài (`AIN0 ~ AIN15` trên `P2.0 ~ P2.15`), một kênh nội lấy `VDD` (`AIN16`) và một kênh nội lấy `VSS` (`AIN17`). Manual còn cho phép dùng `AIN0` làm ngõ đo mức tham chiếu nội 1,5/2/2,5 V trong chế độ tương ứng; khi đó chân ngoài `P2.0` bị chiếm/không dùng như ADC ngoài. Không thấy manual xác nhận cảm biến nhiệt độ tích hợp.
*   **Nguồn điện áp tham chiếu:**
    *   Tham chiếu ngoài qua chân `AVREFH` (`P2.0`): 2.4V ~ VDDA.
    *   Tham chiếu nội lập trình được: **2.5V**, **2.0V**, hoặc **1.5V** (sai số ±1% tại 25°C). Bắt buộc có tụ ngoài tại chân tham chiếu.
*   **Chế độ chuyển đổi:** Single mode, Single Scan mode, Continuous Scan mode.
*   **Analog Window Watchdog:** Cho phép thiết lập 2 ngưỡng điện áp (ngưỡng cao và ngưỡng thấp); tự động phát tín hiệu ngắt khi điện áp cảm biến vượt ra ngoài hoặc rơi vào khoảng giám sát mà không cần CPU đọc định kỳ.

#### 9× Bộ Timer 16-bit CT16B0 ~ CT16B8
Theo phần Features của User Manual v1.7: 4 timer hỗ trợ đếm up/down/center-aligned; 3 timer hỗ trợ đếm up; 2 basic timer hỗ trợ đếm up. Tài liệu nêu 32 bộ PWM và 8 bộ inverse PWM có dead-band. Phân bố chức năng, số kênh và giới hạn riêng của từng timer phải tra bảng pin/feature và chương CT16B trước khi chọn peripheral; đây không phải khẳng định mọi timer có cùng chức năng. CT16B0 có chức năng break theo manual.

#### Các bộ định thời khác
*   **Watchdog Timer độc lập (WDT):** Sử dụng xung clock ILRC riêng biệt, tự động reset hệ thống khi phần mềm bị treo.
*   **Window Watchdog Timer (WWDT):** Giám sát phần mềm trong một khung cửa sổ thời gian xác định.
*   **Real-Time Clock (RTC):** Bộ đếm thời gian thực 32-bit chạy bằng thạch anh 32.768 kHz, hỗ trợ lịch BCD (năm, tháng, ngày, thứ, giờ, phút, giây), ngắt báo thức (alarm) và ngắt chu kỳ đánh thức MCU.
*   **Khối tính toán CRC:** Bộ tính toán kiểm tra lỗi phần cứng hỗ trợ đa thức chuẩn CRC-16 và CRC-32.

---

## 7. Sơ đồ Chân & Bảng Phân Bố Chức Năng (LQFP64)

> 📌 **Bản đồ phân bổ chân dự thảo:** Tra cứu chi tiết sơ đồ chân, mức điện áp và kết nối các module tại [KVC_MASTER_PINOUT_WIRING.md](../wiring/KVC_MASTER_PINOUT_WIRING.md); tài liệu đang ở trạng thái DESIGN BASELINE - SOURCE-VERIFIED, chưa HARDWARE-VERIFIED.

Dưới đây là bảng phân bố chức năng chân của vi điều khiển **SN34F788FG** (gói LQFP 64 chân) theo chuẩn Alternate Function (AFIO) từ User Manual v1.7:

| Chân | Tên cổng | Miền nguồn | Chức năng chính / Alternate Functions (AFIO) |
| :---: | :--- | :--- | :--- |
| **1** | `P3.8` | VDD | GPIO, `CT16B1_CAP0`, AFIO |
| **2** | `P3.9` | VDD | GPIO, `CT16B0_CAP0`, AFIO |
| **3** | `P0.12` | **VDDIO1** | GPIO, `SCK1` (SPI1), `SDA2` (I2C2), `CLKOUT2` |
| **4** | `P0.13` | **VDDIO1** | GPIO, `SEL1` (SPI1), `CT16B4_CAP0` |
| **5** | `P0.14` | **VDDIO1** | GPIO, `SCK1` (SPI1), `SDA0` (I2C0), `BCLK1`, `URXD5` (UART5 RX) |
| **6** | `P0.15` | **VDDIO1** | GPIO, `SCL0` (I2C0), `UTXD5` (UART5 TX) |
| **7** | `P3.7` / `RESET` | VDD | Chân Reset ngoài của chip (Active-LOW, có trở kéo lên nội) |
| **8** | `P3.10` | VDD | GPIO, ngõ vào thạch anh 32.768 kHz RTC (**`LXIN`**), LCM WE |
| **9** | `P3.11` | VDD | GPIO, ngõ ra thạch anh 32.768 kHz RTC (**`LXOUT`**), LCM OE |
| **10** | `P3.12` | VDD | GPIO, ngõ vào thạch anh chính 12 MHz (**`XIN`**) |
| **11** | `P3.13` | VDD | GPIO, ngõ ra thạch anh chính 12 MHz (**`XOUT`**) |
| **12** | `VSSA` | GND | Nối đất analog cho khối ADC |
| **13** | `AVDD` / `VDDA`| VDD (3.3V) | Cấp nguồn analog cho khối ADC (2.4V ~ 3.6V) |
| **14** | `P2.0` | VDD | GPIO, `ADC0_AIN0` (Kênh ADC 0), `AVREFH` (Điện áp tham chiếu ngoài), `SCL1` |
| **15** | `P2.1` | VDD | GPIO, `ADC0_AIN1` (Kênh ADC 1), `SDA1` |
| **16** | `P2.2` | VDD | GPIO, `ADC0_AIN2` (Kênh ADC 2), **`UTXD1`** (UART1 TX), `CAN_TX1` |
| **17** | `P2.3` | VDD | GPIO, `ADC0_AIN3` (Kênh ADC 3), **`URXD1`** (UART1 RX) |
| **18** | `VSS` | GND | Nối đất kỹ thuật số |
| **19** | `VDD` | VDD (3.3V) | Cấp nguồn kỹ thuật số chính (2.4V ~ 3.6V) |
| **20** | `P2.4` | VDD | GPIO, `ADC0_AIN4` (Kênh ADC 4), `SEL0` (SPI0) |
| **21** | `P2.5` | VDD | GPIO, `ADC0_AIN5` (Kênh ADC 5), `SCK0` (SPI0), `URXD5` (UART5 RX) |
| **22** | `P2.6` | VDD | GPIO, `ADC0_AIN6` (Kênh ADC 6), `MI0` (SPI0 MISO) |
| **23** | `P2.7` | VDD | GPIO, `ADC0_AIN7` (Kênh ADC 7), `MO0` (SPI0 MOSI) |
| **24** | `P2.8` | VDD | GPIO, `ADC0_AIN8` (Kênh ADC 8), `MO2` (SPI2 MOSI) |
| **25** | `P2.9` | VDD | GPIO, `ADC0_AIN9` (Kênh ADC 9), `SCK1` (SPI1), `URTS2` |
| **26** | `P2.10` | VDD | GPIO, `ADC0_AIN10` (Kênh ADC 10), `SCL2` (I2C2), `UTXD5` (UART5 TX) |
| **27** | `P2.11` | VDD | GPIO, `ADC0_AIN11` (Kênh ADC 11), `ETH_MDC` |
| **28** | `P2.12` | VDD | GPIO, `ADC0_AIN12` (Kênh ADC 12), `MI1` (SPI1 MISO) |
| **29** | `P2.13` | VDD | GPIO, `ADC0_AIN13` (Kênh ADC 13), `MO1` (SPI1 MOSI) |
| **30** | `P2.14` | VDD | GPIO, `ADC0_AIN14` (Kênh ADC 14), **`UTXD2`** (UART2 TX) |
| **31** | `P2.15` | VDD | GPIO, `ADC0_AIN15` (Kênh ADC 15), **`URXD2`** (UART2 RX) |
| **32** | `VDD` | VDD (3.3V) | Cấp nguồn kỹ thuật số chính |
| **33** | `VCAP1` | Core (1.2V)| **Chân tụ lọc điều áp nội (bắt buộc nối tụ ≥ 1.1 µF xuống GND)** |
| **34** | `P0.20` | VDD | GPIO, `SDA1` (I2C1), `CT16B8_PWM1`, `LCM_CS` |
| **35** | `P0.0` | VDD | GPIO, AFIO |
| **36** | `P0.1` | VDD | GPIO, `SEL0` (SPI0) |
| **37** | `P0.2` | VDD | GPIO, `MI0` (SPI0 MISO) |
| **38** | `P0.10` | VDD | GPIO, `SCL0` (I2C0), `CLKOUT3` |
| **39** | `P0.11` | VDD | GPIO, `SDA0` (I2C0), `CT16B2_CAP0` |
| **40** | `P3.0` | **VDDIO1** | GPIO, `SCK0` (SPI0), `SCL2` (I2C2), **`UTXD1`** (UART1 TX) |
| **41** | `P3.1` | **VDDIO1** | GPIO, AFIO |
| **42** | `P3.2` | **VDDIO1** | GPIO, AFIO |
| **43** | `P3.3` | **VDDIO1** | GPIO, `SEL1` (SPI1), `SCL1` (I2C1) |
| **44** | `P3.4` | **VDDIO1** | GPIO, `MI1` (SPI1 MISO) |
| **45** | `P3.5` / `SWDIO` | **VDDIO1** | **Chân dữ liệu gỡ lỗi SWD (SWDIO)**, GPIO, `MI2` (SPI2 MISO) |
| **46** | `P3.6` / `SWCLK` | **VDDIO1** | **Chân xung nhịp gỡ lỗi SWD (SWCLK)**, GPIO, `MO2` (SPI2 MOSI) |
| **47** | `VSS` | GND | Nối đất kỹ thuật số |
| **48** | `VDDIO1` | **VDDIO1** | **Chân cấp nguồn miền I/O độc lập (nối 1.8V ~ VDD)** |
| **49** | `P1.15` | VDD | GPIO, `CT16B5_CAP0`, `MO1` (SPI1 MOSI) |
| **50** | `P1.14` | VDD | GPIO, `MI1` (SPI1 MISO) |
| **51** | `P1.13` | VDD | GPIO, `SCK1` (SPI1), `SCL1` (I2C1) |
| **52** | `P1.12` | VDD | GPIO, `SEL1` (SPI1) |
| **53** | `P1.11` | **VDDIO1** | GPIO, `MO1` (SPI1 MOSI) |
| **54** | `P1.10` | **VDDIO1** | GPIO, AFIO |
| **55** | `P1.0` | VDD | GPIO, `SCK0` (SPI0), chân CLK khi dùng bộ nạp chuyên dụng |
| **56** | `P1.1` | VDD | GPIO, chân ALSB khi dùng bộ nạp chuyên dụng |
| **57** | `P1.2` | VDD | GPIO, AFIO |
| **58** | `P1.3` / `BOOT` | VDD | **Chân chọn chế độ khởi động BOOT pin**, `URXD2` (UART2 RX) |
| **59** | `P1.4` | VDD | GPIO, `SCL0` (I2C0) |
| **60** | `P1.5` | VDD | GPIO, `SEL1` (SPI1), `SDA0` (I2C0) |
| **61** | `P1.6` | **VDDIO1** | GPIO, `MI2` (SPI2 MISO) |
| **62** | `P1.7` | **VDDIO1** | GPIO, `SEL0` (SPI0) |
| **63** | `P1.8` | **VDDIO1** | GPIO; không thuộc LED/KEY TEST trên Starter-Kit V1.1 |
| **64** | `P1.9` | **VDDIO1** | GPIO, `SEL1`, `SDA1`; không thuộc LED/KEY TEST trên Starter-Kit V1.1 |

---

## 8. Giao Diện Nạp, Chế Độ Boot & Gỡ Lỗi (Debug & Recovery)

### 8.1 Giao diện Serial Wire Debug (SWD)
*   **Giao thức:** ARM SWD chuẩn 2 dây:
    *   **`SWCLK`:** Chân **`P3.6`** (Chân 46 trên LQFP64). Tích hợp điện trở kéo xuống nội (internal pull-down).
    *   **`SWDIO`:** Chân **`P3.5`** (Chân 45 trên LQFP64). Tích hợp điện trở kéo lên nội (internal pull-up).
*   **Khả năng gỡ lỗi:**
    *   Truy cập trực tiếp toàn bộ không gian bộ nhớ, thanh ghi ngoại vi và lõi CPU.
    *   Hỗ trợ tối đa **4 điểm ngắt phần cứng (Hardware Breakpoints)**.
    *   Hỗ trợ tối đa **2 điểm giám sát dữ liệu (Data Watchpoints)**.

### 8.2 Chế độ Bootloader & Chân Khởi Động BOOT (`P1.3`)
ROM Bootloader tích hợp sẵn trong vi điều khiển sẽ kiểm tra mức logic của chân **`P1.3` (BOOT pin)** trong quá trình khởi động thoát Reset:
1.  **Chế độ chạy mã người dùng (User Application Mode):** Nếu chân `P1.3` ở mức **HIGH** (mức cao, trạng thái mặc định do có trở kéo lên nội), vi điều khiển sẽ nhảy vào thực thi chương trình người dùng trong Flash (`0x0000_0000`).
2.  **Chế độ nạp Bootloader (ISP / Recovery Mode):** Nếu chân `P1.3` bị giữ ở mức **LOW** (mức thấp) khi Reset, vi điều khiển sẽ dừng lại trong ROM Bootloader. Chế độ này có 2 tác dụng sống còn:
    *   Cho phép nạp lại firmware qua giao diện ISP (In-System Programming) bằng cổng nối tiếp.
    *   **Khôi phục SWD (Debug Recovery):** Nếu firmware người dùng lỡ cấu hình 2 chân `P3.5`/`P3.6` thành GPIO thông thường (làm vô hiệu hóa SWD), việc giữ `P1.3 = LOW` khi Reset sẽ ngăn mã người dùng chạy, giữ cho cổng SWD luôn mở để mạch nạp có thể kết nối và nạp lại firmware mới.

> [!IMPORTANT]
> **Khuyến cáo từ nhà sản xuất Sonix:** Tuyệt đối **KHÔNG** sử dụng chân `P1.3` làm ngõ ra điều khiển LED kéo xuống GND mà không có cách ly, vì tải của LED có thể vô tình kéo mức logic chân `P1.3` xuống thấp trong lúc cấp nguồn, khiến MCU luôn bị kẹt trong Bootloader thay vì chạy ứng dụng.

---

## 9. Chi Tiết Phần Cứng Bo Mạch Phát Triển (SN34F780 Starter-Kit V1.1)

Bo mạch phát triển chính thức **SN34F780 Starter-Kit Board V1.1** tích hợp sẵn chip thật SN34F788FG và mạch nạp trên bo:

### 9.1 Các khối chức năng chính trên bo
*   **MCU mục tiêu (U1):** Chip thực Sonix **SN34F788FG** (LQFP 64-pin).
*   **Mạch nạp tích hợp SN-LINK Lite:** Giao tiếp qua cổng Micro-USB, kết nối sẵn với đường SWD (`P3.5`, `P3.6`) và đường Reset của MCU.
*   **LED trạng thái mạch nạp:**
    *   **D3 (Trạng thái nạp):** Sáng Xanh (GREEN) khi nạp THÀNH CÔNG (`LED-OK`); Sáng Đỏ (RED) khi nạp THẤT BẠI (`LED-FAIL`).
    *   **D4 (Trạng thái kết nối):** Sáng Xanh (GREEN) khi bộ nạp ONLINE (`LED-Online`); Sáng Đỏ (RED) khi bộ nạp OFFLINE.
*   **IC hạ áp nguồn LDO 3.3V (U2):** Hạ áp nguồn 5.0V từ cổng Micro-USB thành nguồn `3V3_LINK` (3.3V) cấp cho MCU và mạch nạp.
*   **Hệ thống thạch anh trên bo:**
    *   **Y1:** Thạch anh 12.000 MHz cấp cho khối dao động chính HXT của MCU SN34F788FG.
    *   **Y2:** Thạch anh 32.768 kHz cấp cho khối RTC của MCU.
    *   **Y3:** Thạch anh 12.000 MHz phục vụ vi điều khiển trên mạch nạp SN-LINK Lite.

### 9.2 Bảng tra cứu Jumper & Đầu nối cấu hình trên Kit

| Jumper / Cổng | Trạng thái mặc định | Chức năng cấu hình |
| :--- | :--- | :--- |
| **J4** | Chọn theo nguồn cấp (không ghi trạng thái mặc định) | Chân 1 = `3V3_LINK` (LDO SN-Link), chân 2 = `VDD`, chân 3 = `3V3_EXT`. Đóng 1–2 chọn nguồn SN-Link; đóng 2–3 chọn nguồn ngoài 3.3 V đã ổn áp (LiPo qua Buck/LDO, không pin thô). |
| **J1** | Đóng (Short) | **Cấp nguồn cho miền VDDIO1:** Mặc định nối chung với đường nguồn `VDD` (3.3V) |
| **JP16** | Đóng (Short) | **Chân đo dòng tiêu thụ:** Mở jumper để gắn đồng hồ miliampe đo dòng tiêu thụ thực tế của MCU |
| **JP9** | Mở (Open) | **Jumper vào Bootloader cưỡng bức:** Nối tắt (Short) để kéo chân `P1.3` (BOOT) xuống GND, ép MCU vào ROM Bootloader |
| **JP5** | Đầu nối 20-pin | **Đầu nối nạp Writer chuyên dụng:** Phục vụ nạp hàng loạt bằng máy nạp chuyên dụng ngoài |
| **JP6** | Đầu nối SWD ngoài | Cổng kết nối với bộ nạp **SN-LINK-V3** rời khi không sử dụng SN-LINK Lite tích hợp |
| **Nút RESET** | Phím nhấn thường hở | Nối vào chân `P3.7`/`RESET` để kích hoạt Reset phần cứng bằng tay |
| **KEY1 (Phím thử)** | `P1.14` (LQFP64 Pin 50), qua `JP12`; header `JP2` Pin 29/30 | Phím nhấn người dùng theo khối KEY TEST của Starter-Kit V1.1 |
| **LED1 (Xanh lục)** | `P1.12` (LQFP64 Pin 52), qua `JP10`; header `JP2` Pin 25/26 | LED người dùng theo khối KEY TEST của Starter-Kit V1.1 |
| **LED2 (Xanh lục)** | `P1.13` (LQFP64 Pin 51), qua `JP11`; header `JP2` Pin 27/28 | LED người dùng theo khối KEY TEST của Starter-Kit V1.1 |

> 📌 **Bản đồ phân bổ chân chi tiết cho dự án KVC:**
> Toàn bộ kết nối phần cứng từ Kit Sonix SN34F780 Starter-Kit V1.1 tới module LoRa Ra-02, cụm cảm biến (AJ-SR04M, GY-87 I2C0, NEO-M10N) và bo FPGA OneKiwi được chuẩn hóa tại:
> 👉 **[KVC_MASTER_PINOUT_WIRING.md](../wiring/KVC_MASTER_PINOUT_WIRING.md)**<br/>Header mã nguồn C tương ứng: [firmware/mcu_payload/inc/kvc_pinout.h](../../firmware/mcu_payload/inc/kvc_pinout.h).

---

## 10. Tài liệu Gốc & Gói Công Cụ trong Workspace

Hồ sơ kỹ thuật, gói cài đặt và tài liệu gốc của hãng **không** được version trong
Git (bị ignore, chưa xác minh quyền phân phối). Danh mục phiên bản, checksum và
cách khôi phục nằm ở [VENDOR_PACKAGES.md](../vendor/VENDOR_PACKAGES.md) mục 1.

**Trạng thái cục bộ ngày 26/10/2026:** hai file quan trọng nhất đã có trong
workspace và hash khớp manifest — `SN34F780_V1.7.pdf` (User Manual) và
`SN34F780_STARTKIT_V1.1.pdf` (schematic). Chúng vẫn bị Git ignore, nên clone mới
phải khôi phục lại theo manifest. Các file còn lại trong danh sách dưới đây
(QuickStart PDF, DFP pack, SN-Link driver) hiện **chưa** có trong workspace này.

Vị trí các file (đường dẫn tương đối trong `docs/hardware/sonix_sn34f788/`):

*   `SN34F780_StartKit_Package_V1.10R/Document/SN34F780_V1.7.pdf`: User Manual v1.7 của dòng SN34F780 Series (521 trang PDF; nội dung áp dụng theo từng mã biến thể).
*   `SN34F780_StartKit_Package_V1.10R/Document/QuickStart/SN34F780_QuickStart_V1.1R_EN.pdf`: Hướng dẫn khởi động nhanh thiết lập phần cứng Starter Kit và cài đặt Keil MDK (26 trang).
*   `SN34F780_StartKit_Package_V1.10R/Reference Circuit/SN34F780_STARTKIT_V1.1.pdf`: Sơ đồ nguyên lý hoàn chỉnh của bo mạch SN34F780 Starter-Kit V1.1 (3 trang).
*   `SN34F780_StartKit_Package_V1.10R/Pack/SONiX.SN34F7_DFP.2.0.4.pack`: Gói Device Family Pack (DFP) dành cho Keil MDK chứa file định nghĩa thanh ghi, startup code, system clock và CMSIS-SVD.
*   `SN-Link_Driver for Keil Cortex-M_V2.00.324.exe`: Trình điều khiển kết nối bộ nạp SN-LINK với Keil MDK.

## 11. Mức độ bao phủ tài liệu và giới hạn tra cứu

User Manual v1.7 là datasheet/reference manual đầy đủ nhất có trong thư mục kết hợp gói CMSIS DFP 2.0.4. Bản Markdown này đã tóm tắt nhận dạng/đóng gói, core, memory map, nguồn, clock, ngoại vi, AFIO/pinout, bảng địa chỉ cơ sở toàn bộ 40 khối ngoại vi (Peripheral Base Memory Map) và bản đồ thanh ghi chi tiết của các khối ngoại vi cốt lõi (SCU, GPIO, UART, SPI, I2C, ADC, DMA). Các cấu hình thanh ghi chi tiết chuyên sâu khác (như bit-field chi tiết của CAN, ETHMAC, SDIO) hoặc timing diagram, bảng giá trị điện, trình tự hiệu chuẩn khi thiết kế mạch/firmware nâng cao cần đối chiếu trực tiếp chương tương ứng của User Manual PDF và CMSIS header `SN34F780.h`.

| Nguồn có trong workspace | Phạm vi dùng | Giới hạn |
| :--- | :--- | :--- |
| `SN34F780_V1.7.pdf` | Đặc tính họ chip, bảng biến thể, pin/package, clock, memory map, điện học và register/peripheral reference | Một số mục là đặc tính chung họ SN34F780; xác minh đúng biến thể SN34F788FG và revision trước khi áp dụng. |
| `SN34F780_QuickStart_V1.1R_EN.pdf` | Quy trình cài Keil/DFP và khởi động starter-kit | Không thay cho datasheet chip hoặc phép đo firmware. |
| `SN34F780_STARTKIT_V1.1.pdf` | Sơ đồ nguồn, jumper, debugger và nối chân trên kit | Chỉ mô tả revision V1.1; không suy ra pinout module khác. |
| DFP 2.0.4 và công cụ SN-Link | Header/register definitions (`SN34F780.h`, `SN34F780.svd`) và toolchain support | Đã trích xuất toàn bộ bảng địa chỉ cơ sở ngoại vi và thanh ghi cốt lõi vào Mục 3.3 & 3.4. |

**Các điểm đã đối chiếu với User Manual v1.7 & DFP 2.0.4:** SRAM1/2/3 lần lượt 32/96/32 KB tại `0x2000_0000`, `0x2000_8000`, `0x2002_0000`; ADC có 16 ngõ ngoài cùng hai nguồn nội VDD/VSS; địa chỉ cơ sở 40 ngoại vi thuộc APB0, APB1 và AHB đã được định danh và đối chiếu đầy đủ.
