# KVC — Phân hệ MCU Tải trên UAV (Sonix SN34F788)

- **Người phụ trách:** **Nguyễn Tá Duy Phong**
- **Phần cứng mục tiêu:** **Sonix SN34F788FG** (ARM Cortex-M4F, tối đa 192 MHz, 160 KB SRAM, 512 KB Flash; đối chiếu chip/kit thực tế và DFP trước khi tạo project)
- **Công cụ phát triển (IDE / Toolchain):** **Keil MDK-ARM (v5.xx)** + Bộ nạp **SN-Link**
- **Tài liệu & SDK hãng:** [docs/hardware/sonix_sn34f788/](file:///d:/Project_UAV_KVC/docs/hardware/sonix_sn34f788) và [docs/hardware/mcu/CHIP_SONIX_SN34F788_MCU.md](file:///d:/Project_UAV_KVC/docs/hardware/mcu/CHIP_SONIX_SN34F788_MCU.md)

---

## 1. Nhiệm vụ của phân hệ MCU tải

1. **Nhận kết quả từ FPGA:** Bắt ngắt `DATA_READY`, nhận luồng UART và bóc tách khung BBox.
2. **Đọc đồng bộ 3 cảm biến:**
   - **AJ-SR04M Siêu âm chống nước:** Đọc cự ly bề mặt nước qua UART (đơn vị: cm).
   - **GY-87 IMU 10-DOF:** Đọc góc nghiêng Roll, Pitch, Yaw qua I2C.
   - **NEO-M10N GNSS:** Đọc tọa độ GPS/NMEA qua UART.
3. **Giải thuật toán định vị không gian (Georeferencing):**
   - Kết hợp góc quay camera, góc nghiêng IMU và cự ly siêu âm để giải phương trình giao điểm tia quang học với mặt phẳng nước.
   - Tính toán tọa độ thực tế của mục tiêu (WGS-84 hoặc Local Grid cm).
4. **Đóng gói và phát LoRa:** Điều khiển module LoRa Ra-02 (SX1278) qua SPI phát gói tin telemetry về trạm đất.

---

## 2. Giao diện kỹ thuật bắt buộc tuân thủ

Phân hệ MCU Sonix là cầu nối trung tâm, cần tuân thủ bảng sơ đồ chân tổng thể và 3 giao diện:
- 📌 **Bản đồ chân & Đấu nối Master:** 👉 **[docs/hardware/wiring/KVC_MASTER_PINOUT_WIRING.md](file:///d:/Project_UAV_KVC/docs/hardware/wiring/KVC_MASTER_PINOUT_WIRING.md)**
1. **Đầu vào Cảm biến (Siêu âm AJ-SR04M, IMU, GNSS):** 👉 **[docs/interfaces/IF_MCU_SENSORS.md](file:///d:/Project_UAV_KVC/docs/interfaces/IF_MCU_SENSORS.md)**
   - Đọc AJ-SR04M (GPIO Trigger/Echo P2.14/P2.15 hoặc UART2), GY-87 (I2C0 400k P0.10/P0.11), NEO-M10N (UART3 9k6 P2.0/P2.1). Cấm cấp 5V vào GPIO Sonix.
2. **Đầu vào Nhận diện (Nhận từ FPGA):** 👉 **[docs/interfaces/IF_FPGA_MCU_UART.md](file:///d:/Project_UAV_KVC/docs/interfaces/IF_FPGA_MCU_UART.md)**
   - Bắt ngắt DATA_READY, giải mã gói bắt đầu bằng `0x5A 0xA5`, kiểm tra CRC-16/CCITT.
3. **Đầu ra Telemetry (Phát sang ESP32 Trạm Đất):** 👉 **[docs/interfaces/IF_MCU_LORA_RF.md](file:///d:/Project_UAV_KVC/docs/interfaces/IF_MCU_LORA_RF.md)**
   - Cấu trúc gói 32 byte (`KvcTelemetryPacket32`, Little-Endian, CRC-16) đã được định nghĩa tại [`firmware/mcu_payload/inc/kvc_telemetry.h`](file:///d:/Project_UAV_KVC/firmware/mcu_payload/inc/kvc_telemetry.h).
   - Tham số RF: 433.0 MHz, Sync Word `0x12`, BW 125 kHz, candidate SF7/SF8, CR 4/5; chốt cấu hình với owner trước khi nạp phần cứng và đo.

---

## 3. Cấu trúc tổ chức thư mục khuyến nghị cho Phong

Khi mở Keil MDK để tạo project mới (*New µVision Project*), Phong lưu vào thư mục này:

```text
firmware/mcu_payload/
├── project_keil/        # Chứa file project Keil (*.uvprojx, *.uvoptx)
├── src/                 # Toàn bộ mã nguồn C (*.c)
│   ├── drivers/         # Cấu hình UART, SPI, I2C, GPIO, System Clock của chip Sonix
│   ├── sensors/         # Driver đọc AJ-SR04M, GY-87, NEO-M10N
│   ├── protocol/        # Parser giải mã FPGA và Encoder đóng gói LoRa
│   ├── geo/             # Hàm giải phương trình tia cắt mặt phẳng nước
│   └── main.c           # Vòng lặp chính điều phối
├── inc/                 # Toàn bộ file header (*.h)
├── tests/               # Unit test độc lập cho logic toán học / parser chạy trên PC (gcc/pytest)
└── README.md            # Tài liệu chỉ dẫn này
```

---

## 4. Lưu ý về Git và rác build nhị phân

File cấu hình [.gitignore](file:///d:/Project_UAV_KVC/.gitignore) của dự án đã tự động chặn các file build tạm của Keil:
* Thư mục `Objects/` và `Listings/`.
* Các file nạp nhị phân: `*.hex`, `*.axf`, `*.elf`, `*.o`, `*.bin`.

👉 **Phong chỉ cần commit mã nguồn `.c`, `.h` và file cấu hình project `.uvprojx`.**

---

## 5. Driver GNSS u-blox NEO-M10 (Task KVC-GNSS-M10-001)

Phân hệ GNSS thu thập tọa độ định vị vị trí UAV phục vụ đối chiếu và thuật toán cứu nạn:

- **Tệp nguồn:**
  - Header: [`firmware/mcu_payload/inc/kvc_gnss_neo_m10.h`](file:///d:/Project_UAV_KVC/firmware/mcu_payload/inc/kvc_gnss_neo_m10.h)
  - C Source: [`firmware/mcu_payload/src/sensors/kvc_gnss_neo_m10.c`](file:///d:/Project_UAV_KVC/firmware/mcu_payload/src/sensors/kvc_gnss_neo_m10.c)
  - Host Unit Test: [`firmware/mcu_payload/tests/test_kvc_gnss_neo_m10.c`](file:///d:/Project_UAV_KVC/firmware/mcu_payload/tests/test_kvc_gnss_neo_m10.c)
- **Cấu hình phần cứng UART3 Sonix SN34F788:**
  - Tốc độ: **9.600 bps** (chuẩn phần cứng xuất xưởng NEO-M10N, sai số chỉ **+0,16 %** với UCLK 12 MHz: `DLL = 0x4E`, `DLM = 0`, `PRE = 1`). Firmware hiện đặt `KVC_GNSS_BAUD_RATE = 9600` đúng theo khuyến nghị này. Lý do không dùng 38.400: tại UCLK 12 MHz, divisor 20 cho tốc độ thực 37.500 bps (lệch **−2,34 %**); cộng dung sai IHRC ±2 % thành ~4,3 %, vượt ngưỡng chịu đựng của UART không đồng bộ nên gây lỗi khung ngẫu nhiên. Muốn tốc độ cao hơn phải nâng UCLK bằng PLL. Khớp với [IF_MCU_SENSORS.md](file:///d:/Project_UAV_KVC/docs/interfaces/IF_MCU_SENSORS.md).
  - Pin mux (`SN_ALWAYSON->P2_AFIO0`):
    - `P2.1` (`URXD3`, Pin 15 LQFP64 | JP3 Pin 3/4): Nhận NMEA từ chân TX của module.
    - `P2.0` (`UTXD3`, Pin 14 LQFP64 | JP3 Pin 1/2): Nối RX của module (không phát lệnh đổi cấu hình).
  - Clock: `SN_SCU->APB0CLKG` bit 6 (`UART3CLKEN`), `SN_SCU->APB1CLKG` bit 19 (`P2CLKEN`).
- **Cơ chế nhận dữ liệu & Watchdog (KVC-M2 & Task F10):**
  - RX ngắt toàn bộ ngoại vi UART: `UART1_IRQHandler` (FPGA BBox - Ring 4096 B), `UART2_IRQHandler` (Siêu âm - Ring 1024 B), `UART3_IRQHandler` (GNSS NMEA - Ring 4096 B). Vòng lặp main tiêu thụ ring buffer SPSC định kỳ mỗi 1 ms, loại bỏ hoàn toàn polling FIFO blocking.
  - Tích hợp Watchdog Timer (WDT - Task F10): Sử dụng clock nội độc lập ILRC 32 kHz, chu kỳ timeout an toàn 6.0 giây; main loop nạp lại WDT định kỳ; ghi nhận và báo cáo cờ nguyên nhân khởi động `BOOT_REASON` (Power-on Reset vs WDT Timeout) vào cờ chẩn đoán telemetry.
  - Phục hồi sau câu lỗi, nhiễu rác đường truyền hoặc câu bị cắt cụt.
- **Tiêu chuẩn nghiệm thu Fix hợp lệ (`KVC_FLAG_GNSS_VALID` - Chuẩn TinyGPSPlus):**
  1. Hỗ trợ đa dạng câu NMEA: `$??GGA`, `$??GSA`, `$??RMC` ($GNGGA, $GNRMC, $GPGGA, $GPRMC...).
  2. GGA Fix Quality >= 1 hoặc RMC Status == 'A' (Active).
  3. GSA Fix Mode >= 2 (2D hoặc 3D Fix; từ chối Mode 1 No Fix).
  4. Số vệ tinh theo dõi >= 4 (chuẩn định vị không gian 3 chiều).
  5. Sai số hình học mặt ngang HDOP <= 5.00.
  6. Tọa độ hợp lệ trong biên chuẩn WGS-84 (-90° <= Lat <= +90°, -180° <= Lon <= +180°).
  7. Dữ liệu còn mới trong 3.0 giây (3000 ms). Hết hạn 3 giây tự động xóa trạng thái hợp lệ.
- **Kiểm thử Host Test:**
  ```powershell
  gcc -Wall -Wextra -O2 -DKVC_HOST_TEST=1 -Ifirmware/mcu_payload/inc firmware/mcu_payload/src/sensors/kvc_gnss_neo_m10.c firmware/mcu_payload/tests/test_kvc_gnss_neo_m10.c -o test_kvc_gnss.exe
  .\test_kvc_gnss.exe
  ```
- **Build Keil Target:**
  ```powershell
  & "C:\Keil_v5\UV4\UV4.exe" -b "firmware\mcu_payload\project_keil\mcu_uav.uvprojx" -j0 -o "build.log"
  ```

---

## 6. Bảng macro biên dịch (cấu hình hành vi firmware)

Tất cả macro dưới đây dùng `#ifndef` nên **truyền được qua `-D` của Keil** (Options for Target → C/C++ → Define) mà không phải sửa source. Giá trị ghi ở cột "Mặc định" là giá trị khi không truyền gì.

| Macro | Mặc định | Ý nghĩa / khi nào đổi |
| :--- | :---: | :--- |
| `KVC_FPGA_ENABLE` | **0** | **0** = không khởi tạo UART1, đặt P2.3/P0.12 về mức xác định. Đúng cho bo **không có FPGA**. **1** = bật IF-01 (khi có RTL hoặc chạy `scripts/manual/mock_fpga_bbox.py`). Không đổi layout/baud/IRQ của IF-01. |
| `KVC_GNSS_SKIP_AUTOBAUD` | **0** | **1** = bỏ dò baud, mở UART3 thẳng ở `KVC_GNSS_BAUD_RATE`. Boot nhanh hơn 11–15 s. **Chỉ bật khi chắc chắn module đã ở 9600**, nếu không GNSS sẽ im lặng không fix. |
| `KVC_M1_CLOCK_DIAG` | **0** | Chẩn đoán cây xung nhịp (đọc thanh ghi SCU). **Code tạm thời — phải = 0 khi phát hành.** |
| `KVC_M2_RX_STATS_DIAG` | **1** | Công bố `[RING]` (drop/oe/fe/byt/isr) mỗi ~5 s. Giữ =1 để nghiệm thu. |
| `KVC_M3_VALUE_DIAG` | **1** | In `[M3]` giá trị cảm biến 1 Hz. Giữ =1 trong giai đoạn bring-up. |
| `KVC_ENABLE_INDOOR_MOCK_GPS` | **0** | **1** = dùng toạ độ Đà Nẵng khi chưa có fix (chỉ để test GCS trong nhà). **Không bật khi bay.** |
| `KVC_LORA_BOOT_RETRIES` | 10 | Số lần thử init SX1278 trước khi vào degraded mode (~300 ms/lần). |
| `KVC_IMU_RETRY_DIV` | 10 | Số chu kỳ telemetry giữa hai lần thử lại IMU khi chưa nhận được. |
| `KVC_TELEMETRY_PERIOD_MS` | 1000 | Chu kỳ phát. **Không đặt ≥ 3000** (gateway coi mất sóng sau 3 s, BBox hết hạn sau 2 s). |
| `KVC_TDM_ROTATE_EVERY_PACKET` | 1 | 1 = mỗi gói báo một mục tiêu kế tiếp (round-robin). |
| `KVC_GNSS_BAUD_RATE` | 9600 | Tốc độ UART3 đích. Không đổi nếu chưa nâng UCLK bằng PLL (xem §5). |
| `KVC_FPGA_UART_BAUD` | 38400 | Baud UART1 theo IF-01. **Còn câu hỏi mở:** tại UCLK 12 MHz cho 37 500 bps (−2,34 %), vượt ngưỡng 3,125 % — xem IF_FPGA_MCU_UART.md. |

### 6.1 Cấu hình cho bo bench hiện tại (không FPGA, không ESP32)

Không cần truyền gì — giá trị mặc định đã đúng:

```text
KVC_FPGA_ENABLE        = 0     (mặc định)
KVC_M1_CLOCK_DIAG      = 0     (mặc định)
KVC_M2_RX_STATS_DIAG   = 1     (mặc định)
KVC_M3_VALUE_DIAG      = 1     (mặc định)
KVC_GNSS_SKIP_AUTOBAUD = 0     (mặc định — dò baud, boot chậm 11-15 s)
```

Nếu muốn boot nhanh và đã chắc module ở 9600, thêm vào Define: `KVC_GNSS_SKIP_AUTOBAUD=1`.

### 6.2 Khi có FPGA hoặc muốn chạy mock

Thêm vào Define: `KVC_FPGA_ENABLE=1`, rồi nạp `scripts/manual/mock_fpga_bbox.py --baud 38400` qua USB-TTL vào P2.3.

---

## 7. Log UART5 và Hercules

Firmware in log chẩn đoán ra **UART5 (P0.15 TX, P0.14 RX)**. Đây là cổng duy nhất cần mở terminal để xem trạng thái.

| Tham số | Giá trị |
| :--- | :--- |
| Baud | **9600** |
| Frame | 8N1, không flow control |
| Phần cứng | USB-TTL nối P0.15 (TX kit → RX adapter), **GND chung bắt buộc** |

**Tốc độ thực là 9615 bps**, không phải 115200. Code đặt `PRE=1, DLL=78` với UCLK 12 MHz → 12 000 000 / (16 × 1 × 78) = 9615 bps (+0,16 % so với 9600 danh định). Đặt Hercules 115200 sẽ ra ký tự rác hoàn toàn.

Bản `kvc_pinout.h` trước 28/10/2026 ghi sai 115200; đã sửa.

### 7.1 Các dòng log cần biết

| Tiền tố | Nội dung | Chu kỳ |
| :--- | :--- | :--- |
| `=== KVC-MCU-... BOOT ===` | Nhận diện firmware + xác nhận UART5 sống | Một lần sau reset |
| `[INIT]` | Kết quả từng cảm biến (LORA/IMU/US/GNSS/FPGA) | Một lần, ngay sau init |
| `[M3]` | Giá trị cảm biến + cờ + `tx=ok/fail` | 1 Hz |
| `[RING]` | Thống kê RX 3 cổng (drop/oe/fe/byt/isr + val/ok/bad/trg/raw) | ~5 s |

Chi tiết cách đọc từng trường và checklist PASS: [MCU_BENCH_TEST_PLAN.md](../verification/MCU_BENCH_TEST_PLAN.md).

### 7.2 Build headless và lấy số liệu

```powershell
& "C:\Keil_v5\UV4\UV4.exe" -r "firmware\mcu_payload\project_keil\mcu_uav.uvprojx" -j0 -o "build.log"
Select-String -Path build.log -Pattern "Error|Warning|Program Size"
```

`-r` = rebuild toàn bộ (cần thiết để thấy hết warning; `-b` là incremental).

**Baseline 28/10/2026** (ARMCLANG V6.14): `0 Error(s), 8 Warning(s)`, Code 11 948 B, RO 1 076 B, RW 8 B, ZI 7 480 B. Cả 8 warning đều ở code có sẵn: 2 trong `system_SN34F780.c` (vendor), 5 trong `kvc_fpga_bbox.c`, 1 padding `KvcFpgaFrameState`.

Lưu ý: `-Wpadded` **không** được bật trong `MiscControls` của project — warning padding xuất hiện là do `kvc_fpga_bbox.h` được include từ file khác có cấu hình chặt hơn. "0 warning" chỉ đạt được khi xử lý 8 mục trên.

---

## 8. Host test (không cần bo)

```powershell
pwsh -NoProfile -File scripts/test_firmware.ps1 -SkipBuild -SkipPython
```

Chạy 7 host test MCU + 2 host test gateway. Baseline 28/10/2026: **9/9 PASS**.

Script **không** build Keil — phải chạy `UV4.exe` riêng (xem §7.2).
