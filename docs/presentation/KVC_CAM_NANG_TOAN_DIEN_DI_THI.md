# KVC — CẨM NANG TOÀN DIỆN DỰ ÁN TẢI NHIỆM VỤ UAV CỨU NẠN BÃO LŨ
## TÀI LIỆU NẠP KIẾN THỨC BẢO VỆ ĐỀ TÀI & THI ĐẤU (PHIÊN BẢN 2026)

> **Dành cho:** Toàn đội KVC (Đại học Bách Khoa – Đại học Đà Nẵng)
> **Cuộc thi:** Thiết kế Vi mạch FPGA và Hệ thống Nhúng MCU mở rộng khu vực Miền Trung 2026
> **Thời điểm cập nhật:** 05/11/2026
> **Phạm vi tài liệu:** Kiến trúc hệ thống, cấu trúc mã nguồn, luồng dữ liệu end-to-end, chi tiết thuật toán từng phân hệ, định dạng gói tin và quy trình vận hành.

---

## MỤC LỤC TỔNG QUAN

1. [Tầm nhìn, Bối cảnh & Triết lý Cốt lõi của Đề tài](#1-tầm-nhìn-bối-cảnh--triết-lý-cốt-lõi-của-đề-tài)
2. [Cấu trúc Thư mục Dự án & Phân công Trách nhiệm](#2-cấu-trúc-thư-mục-dự-án--phân-công-trách-nhiệm)
3. [Kiến trúc Tổng thể Hai Nửa & Luồng Dữ liệu End-to-End](#3-kiến-trúc-tổng-thể-hai-nửa--luồng-dữ-liệu-end-to-end)
4. [Phân hệ FPGA Gowin GW2A — Xử lý Thị giác Biên](#4-phân-hệ-fpga-gowin-gw2a--xử-lý-thị-giác-biên)
5. [Phân hệ MCU Sonix SN34F788 — Định vị Không gian 3D](#5-phân-hệ-mcu-sonix-sn34f788--định-vị-không-gian-3d)
6. [Phân hệ Vô tuyến LoRa 433 MHz & Gateway ESP32-C3](#6-phân-hệ-vô-tuyến-lora-433-mhz--gateway-esp32-c3)
7. [Phân hệ Trạm Mặt Đất GCS — Backend FastAPI & Web Dashboard Offline](#7-phân-hệ-trạm-mặt-đất-gcs--backend-fastapi--web-dashboard-offline)
8. [Phân hệ Quan sát Phụ trợ IF-05 & AI Tham chiếu PC](#8-phân-hệ-quan-sát-phụ-trợ-if-05--ai-tham-chiếu-pc)
9. [Ma trận Hợp đồng Giao tiếp Hệ thống (IF-01 đến IF-05)](#9-ma-trận-hợp-đồng-giao-tiếp-hệ-thống-if-01-đến-if-05)
10. [Quy trình Khởi động & Kịch bản Vận hành Demo](#10-quy-trình-khởi-động--kịch-bản-vận-hành-demo)

---

## 1. TẦM NHÌN, BỐI CẢNH & TRIẾT LÝ CỐT LÕI CỦA ĐỀ TÀI

### 1.1 Tên Đề Tài & Định Vị Ranh Giới
* **Tên chính thức:** *Hệ thống Tải nhiệm vụ UAV tìm kiếm cứu nạn bão lũ kết hợp xử lý thị giác biên trên FPGA Gowin GW2A, định vị không gian 3D trên MCU Sonix SN34F788 và truyền tin vô tuyến LoRa 433 MHz (KVC Payload).*
* **Ranh giới kỹ thuật bất biến:** KVC là **TẢI NHIỆM VỤ (PAYLOAD)** độc lập, **KHÔNG PHẢI FLIGHT CONTROLLER**.
  * Hệ thống không can thiệp vào mạch điều khiển bay (Pixhawk/ArduPilot/Betaflight).
  * Không phát lệnh arm/disarm động cơ, không sửa waypoint bay tự động.
  * Tải nhiệm vụ chỉ đọc cảm biến riêng (hoặc thụ động trích xuất GNSS), xử lý ảnh tại biên và phát dữ liệu cứu hộ về mặt đất. Thiết kế này giúp payload có thể gắn lên bất kỳ khung bay nào mà không gây rủi ro an toàn bay.

### 1.2 Ba Nút Thắt Cứu Nạn Thực Địa Tại Miền Trung
1. **Hạ tầng viễn thông tê liệt hoàn toàn:** Bão lũ làm gãy đổ cột điện, trạm BTS ngập nước hoặc mất điện lưới, hoàn toàn không có sóng 4G/5G/Internet.
2. **Nghịch lý truyền dẫn video số:** Luồng video HD thông thường cần băng thông hàng Megabit/giây (Mbps). Sóng vô tuyến băng tần cao (2.4 GHz, 5.8 GHz) bị mưa bão, sương mù và hơi nước suy hao cực nặng, gây mất tín hiệu hoặc trễ hàng chục giây.
3. **Áp lực thời gian sống còn:** Trong lũ xiết, cứu hộ viên không cần ngồi xem video mượt mà; họ cần **TỌA ĐỘ CHÍNH XÁC (Vĩ độ, Kinh độ)** trong thời gian sớm nhất để xuất ca-nô tiếp cận nạn nhân.

### 1.3 Triết Lý Thiết Kế Cốt Lõi
> **"Chỉ truyền kết luận, không truyền dữ liệu thô — Biến một luồng video băng thông lớn thành một tọa độ cứu nạn duy nhất gói gọn trong 32 byte."**

* **Giảm tải băng thông 5 bậc độ lớn:** Từ ~2.000.000 bps (video nén) xuống còn đúng 256 bps (LoRa 32 byte @ 1 Hz).
* **Miễn nhiễm suy hao thời tiết:** Gói tin LoRa 433 MHz có độ nhạy thu xuống tới -130 dBm, đâm xuyên mưa bão vượt trội so với Wi-Fi/Video link.
* **100% Tự chủ dã chiến:** Trạm mặt đất có nguồn riêng, bản đồ vệ tinh offline, không phụ thuộc kết nối Internet ngoài thực địa.

---

## 2. CẤU TRÚC THƯ MỤC DỰ ÁN & PHÂN CÔNG TRÁCH NHIỆM

### 2.1 Cấu Trúc Cây Thư Mục Dự Án
```text
D:\KVC_PRODUCT
├── KVC_PR/                     # MÃ NGUỒN THIẾT KẾ VI MẠCH FPGA (Gowin GW2A-18C)
│   ├── src/                    # RTL Verilog: top, camera_rx, sccb, packetizer, blob...
│   │   ├── camera/             # Giao tiếp OV2640: ov2640_config.v, sccb_master.v
│   │   ├── comm/               # bbox_packetizer.v, uart_tx.v, mock_bbox.v
│   │   ├── processing/         # kvc_blob_detect.v (lọc màu), pixel_stats.v
│   │   └── kvc_top_demo.v      # Top-level module tích hợp toàn bộ pipeline
│   ├── constraints/            # Ràng buộc chân và thời gian: pins.cst, sdc
│   ├── verification/tb/        # 22 Testbench Verilog tự động (Icarus/Gowin)
│   └── tools/                  # Script build batch TCL: build_kvc_fpga.tcl
│
├── firmware/                   # MÃ NGUỒN VI ĐIỀU KHIỂN BARE-METAL & GATEWAY
│   ├── mcu_payload/            # Firmware MCU Sonix SN34F788 (ARM Cortex-M4F)
│   │   ├── inc/                # kvc_georef.h, kvc_timebase.h, kvc_pinout.h, kvc_fpga_bbox.h
│   │   ├── src/                # kvc_georef.c (chiếu tia 3D), kvc_timebase.c, sensors/
│   │   ├── project_keil/       # Project Keil MDK ARMCLANG V6.14: main.c
│   │   └── tests/              # 14 Host C tests biên dịch GCC trên máy tính
│   ├── gateway_esp32/          # Firmware Trạm đất ESP32-C3 (PlatformIO Arduino)
│   │   ├── src/                # main.cpp, net_policy.cpp, ws_route.cpp
│   │   └── host_tests/         # Host C++ tests: test_rf_decode, test_net_policy...
│   └── esp32_s3_cam/           # Firmware Kênh video phụ IF-05 (ESP32-S3 + OV3660)
│
├── gcs/                        # TRẠM MẶT ĐẤT GROUND CONTROL STATION
│   ├── backend/                # Dịch vụ FastAPI Python 3.13
│   │   ├── main.py             # Server loopback, WebSocket hub, routing
│   │   ├── esp32_ingress.py    # Tiếp nhận WebSocket IF-03 từ ESP32, giải mã 32B
│   │   ├── video_relay.py      # Relay video phụ MJPEG same-origin (cổng 8000)
│   │   ├── sqlite_logger.py    # Ghi nhật ký SQLite WAL mode synchronous=FULL
│   │   └── tests/              # 84 Unit & Contract tests pytest
│   └── frontend/               # Giao diện Web tác chiến (React + Vite + TypeScript)
│       ├── src/app/            # AppShell, AppHeader, ModeContextBar
│       ├── src/features/       # radar/, map/ (Leaflet WGS-84), history/ (EventLogPage)...
│       └── tests/              # 173 bài test frontend tự động
│
├── ai/                         # MÔ HÌNH HỌC SÂU THAM CHIẾU PC
│   ├── models/                 # Trọng số YOLO11n (person / lifebuoy)
│   └── checkpoints/            # Dữ liệu xuất mô hình ONNX / PyTorch
│
├── khoidong/                   # BỘ SCRIPT KHỞI ĐỘNG HỆ THỐNG 1-CLICK DÃ CHIẾN
│   ├── 0_CHAY_TAT_CA.bat       # Bật đồng thời Backend, Frontend và mở trình duyệt
│   ├── 1_chay_backend.bat      # Chạy riêng Backend FastAPI
│   ├── 2_chay_frontend.bat     # Chạy riêng Frontend Vite React
│   ├── 3_chay_ai_worker.bat    # Chạy AI Worker YOLO11n trên GPU RTX 4060
│   └── HUONG_DAN.txt           # Hướng dẫn quy trình vận hành nhanh
│
├── CHAY_AI_NHAN_DIEN.bat       # Script khởi chạy suy luận AI tham chiếu trên GPU rời
├── docs/                       # TÀI LIỆU KỸ THUẬT, BẰNG CHỨNG & SLIDE BÁO CÁO
│   ├── architecture/           # KVC_ThietKeHeThong.md, GATEWAY_DESIGN.md...
│   ├── verification/           # FPGA_BUILD_RECORD.md, BRINGUP_CHECKLIST.md, evidence/
│   └── presentation/           # index.html (15 Slide), PowerPoint thuyết trình
└── scripts/                    # Scripts chẩn đoán, mô phỏng và công cụ đo kiểm

```

### 2.2 Phân Công 5 Thành Viên Trong Đội
1. **Lê Viết Vững (RTL / FPGA Owner):** Phụ trách kiến trúc vi mạch GW2A, FSM điều khiển camera, CDC FIFO, bộ lọc màu `kvc_blob_detect.v` và đóng gói UART IF-01.
2. **Nguyễn Tá Duy Phong (MCU Firmware Owner):** Phụ trách lập trình bare-metal ARM Cortex-M4 Sonix, Ring buffer ISR UART1, giải thuật hình học chiếu tia 3D `kvc_georef.c`, bộ lọc siêu âm và đóng gói LoRa IF-02.
3. **Thịnh (Gateway ESP32 Owner):** Phụ trách mạch trạm đất ESP32-C3, thu sóng LoRa SX1278, màn hình OLEDSSD1306, chính sách mạng STA/SoftAP và WebSocket IF-03.
4. **Kiên (Hardware & Optical Camera):** Phụ trách đấu nối phần cứng, module camera OV2640/OV3660, đo kiểm dao động ký XCLK/PCLK/VSYNC, nguồn cấp hạ áp dã chiến LM2596/MP1584.
5. **Cường (Data & AI Model):** Phụ trách thu thập tập dữ liệu cứu nạn lũ lụt, huấn luyện mô hình YOLO11n đối chứng, vận hành AI Worker trên GPU RTX 4060 và kiểm định bằng chứng dữ liệu.

---

## 3. KIẾN TRÚC TỔNG THỂ HAI NỬA & LUỒNG DỮ LIỆU END-TO-END

Hệ thống KVC được chia thành hai nửa phân định vật lý nghiêm ngặt:

```text
====================================== NỬA 1: TẢI NHIỆM VỤ UAV (AIR UNIT) ======================================
[Quang học]       [Thị giác biên FPGA]             [Định vị 3D MCU Sonix]            [Kênh vô tuyến tầm xa]
OV2640 DVP ───► Gowin GW2A-18C ─────────────► Sonix SN34F788 M4F ─────────────► Ra-02 LoRa TX (433 MHz)
(640x480 RGB)    (Streaming Blob Detect)  [IF-01]  (Ray-Plane Intersection)  [IF-02]  (Phát gói tin 32 byte)
                 (Fmax 113MHz, 0 BSRAM)   38.400   (Dung hợp IMU + Siêu âm)  1 Hz
                                           bps
                                                         ▲
                                             ┌───────────┴───────────┐
                                         [AJ-SR04M]   [GY-87]   [NEO-M10N]
                                         (Cao độ nước) (Nghiêng) (WGS-84)

                                            ~~~~~~~~ SÓNG LORA 433 MHz ~~~~~~~~
                                            (Gói nhị phân 32 byte xuyên mưa lũ)
                                                         ▼
====================================== NỬA 2: TRẠM MẶT ĐẤT (GROUND STATION) ====================================
[Thu phát dã chiến]                 [Máy tính chỉ huy dã chiến GCS]
ESP32-C3 + Ra-02 RX ──────────────► GCS Backend (FastAPI) ───────────► GCS Web Dashboard
(Pin 18650 riêng + OLED)   [IF-03]   (Loopback 127.0.0.1:8000)   [IF-04]   (React/TypeScript 100% Offline)
(Hiển thị RSSI/SNR/Tọa độ) WebSocket (SQLite WAL mode sync=FULL)  WS nội bộ (Radar Local, Leaflet WGS-84)

────────────────────────────────────────────────────────────────────────────────────────────────────────────────
[KÊNH QUAN SÁT PHỤ TRỢ IF-05 - NÉT ĐỨT, KHÔNG QUA LORA, KHÔNG SINH TỌA ĐỘ]:
ESP32-S3-CAM ──[Wi-Fi / MJPEG 81]──► Backend Relay (Cổng 8000) ──► Trình duyệt UI & AI Worker (RTX 4060 Cổng 8090)
```

### Chi Tiết Chuỗi Chuyển Hóa 4 Bước Dữ Liệu Cứu Nạn
1. **Bước 1 (Ảnh thô):** Camera OV2640 xuất dữ liệu RGB565 độ phân giải danh định qua bus song song DVP (614 KB/khung).
2. **Bước 2 (Trích xuất BBox biên):** FPGA Gowin quét streaming từng dòng pixel, tách các khối màu cam nổi bật (áo phao, phao tròn), sinh tọa độ hộp bao `[X, Y, W, H, Conf, Class]` đóng gói thành khung UART IF-01 (18 byte).
3. **Bước 3 (Định vị 3D không gian):** MCU Sonix nhận BBox qua ngắt UART1, đồng bộ với khoảng cách siêu âm mặt nước $h$ và góc nghiêng $\text{Roll}/\text{Pitch}$, giải hệ phương trình tia quang học giao mặt nước phẳng để tính tọa độ mét cục bộ $(X, Y)_{local}$ và tọa độ GPS toàn cầu $(\text{Lat}, \text{Lon})$. Đóng gói thành khung LoRa IF-02 (32 byte).
4. **Bước 4 (Tiếp nhận & Chỉ huy):** Gateway ESP32 thu sóng LoRa, hiển thị tọa độ tức thì lên màn hình OLED cho cứu hộ viên dã chiến, đồng thời chuyển qua WebSocket về Web Dashboard để ghim điểm cứu nạn lên bản đồ vệ tinh ngoại tuyến.

---

## 4. PHÂN HỆ FPGA GOWIN GW2A — XỬ LÝ THỊ GIÁC BIÊN

### 4.1 Phần Cứng & Kiến Trúc RTL
* **Chip vi mạch:** Gowin GW2A-LV18PG256C8/I7 (Kit OneKiwi Primer 20K V1.1).
* **Tài nguyên vi mạch:** 20.736 LUTs, 828 Kbit BSRAM, 24 bộ nhân DSP.
* **Top-level module:** `kvc_top_demo.v` tích hợp các khối:
  * `ov2640_config.v` & `sccb_master.v`: Khởi tạo sensor camera qua bus SCCB I2C (RGB565, tốc độ 100 kHz).
  * `camera_rx.v`: Bắt nhịp xung `cam_pclk`, ghép byte cao và byte thấp tạo thành pixel 16-bit `{R[4:0], G[5:0], B[2:0]}`.
  * `kvc_blob_detect.v`: Thuật toán phân ngưỡng màu sắc và hình học streaming trực tiếp.
  * `bbox_packetizer.v`: Đóng gói danh sách hộp bao theo chuẩn khung UART IF-01.
  * `uart_tx.v`: Bộ phát UART chuẩn 38.400 bps, 8N1, khung 10 bit-time hoàn chỉnh.
  * **Đồng bộ miền xung (CDC):** Sử dụng FIFO bất đồng bộ 2 tầng Flip-Flop để chuyển dữ liệu từ miền xung camera `cam_pclk` (12–24 MHz) sang miền xung xử lý hệ thống `clk_100m` (100 MHz).

### 4.2 Thuật Toán Streaming Blob Detection (`kvc_blob_detect.v`)
Thay vì lưu trữ toàn bộ khung ảnh vào RAM ngoài (vốn đòi hỏi chip DDR3 phức tạp và tiêu tốn năng lượng), KVC thiết kế thuật toán nhận diện mảng màu trôi nổi (Blob Detect) dạng **Single-pass Streaming**:

1. **Chuẩn hóa không gian màu 8-bit:**
   $$\text{R8} = \{R[4:0], R[4:2]\}, \quad \text{G8} = \{G[5:0], G[5:4]\}, \quad \text{B8} = \{B[4:0], B[4:2]\}$$
2. **Tiêu chí lọc màu cam cứu sinh (Golden Rev 23):**
   * Ưu thế sắc đỏ: $R8 > G8 > B8$.
   * Sàn độ sáng tối thiểu: $R8 \ge \text{LUM\_MIN}$ ($\text{LUM\_MIN} = 40$).
   * Độ bão hòa sắc tố (Chroma): $R8 - B8 \ge \text{CHROMA\_MIN}$ ($\text{CHROMA\_MIN} = 28$).
   * Góc Hue trong dải màu cam ($10^\circ \le \text{Hue} \le 45^\circ$):
     $$6 \cdot (G8 - B8) \ge (R8 - B8) \quad \text{và} \quad 4 \cdot (G8 - B8) \le 3 \cdot (R8 - B8)$$
   * Độ bão hòa Saturation $S \ge 0.75$: $4 \cdot B8 \le R8$.
   * Bộ lọc triệt tiêu dương tính giả màu đen: $\sim((B5 == 0) \ \text{và} \ (R5 < 8))$.
3. **Bộ lọc hình học & Run-Length Encoding (RLE):**
   * Đếm chuỗi pixel liên tiếp trên một dòng: $\text{RLE} \ge 2$.
   * Đếm số dòng quét liên tiếp có mục tiêu: $\text{ROW\_MIN} \ge 2$.
   * Tổng số pixel tích lũy của vật thể: $\text{MIN\_PIXELS} \ge 16$.
   * **Cơ chế Clamp cự ly gần (10–20 cm):** Khi phao cứu sinh đưa sát ống kính làm kích thước vượt giới hạn ($W > 240$ hoặc $H > 240$), mạch tự động ghìm kích thước về 240 và bỏ qua kiểm tra tỷ lệ khung hình (Aspect Ratio), giúp hệ thống nhận diện mượt mà không bị ngắt quãng.

### 4.3 Tài Nguyên & Chỉ Số Thực Nghiệm
* **Tiêu thụ tài nguyên:** Đúng **0 BSRAM, 0 DSP**, chỉ sử dụng **1.616 / 20.736 LUTs (~7%)**.
* **Tần số tối đa:** Fmax clock hệ thống đạt **113,277 MHz** (vượt chỉ tiêu 100 MHz), Fmax camera PCLK đạt **91,900 MHz** (vượt chỉ tiêu 24 MHz), tổng vi phạm thời gian $\text{TNS} = 0.000$.
* **Đo kiểm thực tế trên bo:** Bộ thu MCU nhận 197.844 byte liên tiếp với $\text{Framing Error} = 0$, $\text{Overrun Error} = 0$, $\text{Drop} = 0$.

### 4.4 Hợp Đồng Khung UART IF-01 (FPGA ➔ MCU)
* **Baudrate:** 38.400 bps, 8N1 (cố định, đã được duyệt).
* **Cấu trúc khung:**
  ```text
  [0..1]  Sync Byte   : 0x5A 0xA5 (2B)
  [2]     Version     : 0x01 (1B)
  [3]     Count (N)   : Số lượng BBox (1B, N <= 12)
  [4..7]  Timestamp   : Thời gian tương đối FPGA (4B, ms, Little-Endian)
  [8..]   Danh sách BBox: N x 8 byte
          - X_center (2B, uint16)
          - Y_center (2B, uint16)
          - Width    (1B, uint8)
          - Height   (1B, uint8)
          - Class_ID (1B, uint8: 1=person, 2=lifebuoy)
          - Conf     (1B, uint8: 0..100%)
  [End]   CRC-16      : CRC-16/CCITT-FALSE tính từ Byte 0 đến trước CRC (2B)
  ```
  *Khung N=0 chiếm 10 byte; Khung N=1 chiếm 18 byte; Khung N=2 chiếm 26 byte.*

---

## 5. PHÂN HỆ MCU SONIX SN34F788 — ĐỊNH VỊ KHÔNG GIAN 3D

### 5.1 Phần Cứng & Kiến Trúc Phần Mềm Bare-metal
* **Vi điều khiển:** Sonix SN34F788 (ARM Cortex-M4F 32-bit, xung nhịp 96 MHz, có FPU dấu phẩy động phần cứng).
* **Không dùng RTOS (Zero-OS):** Chạy bare-metal thuần túy theo mô hình Super-loop kết hợp ngắt ưu tiên nhằm đảm bảo tính tiền định (Deterministic) và không có độ trễ do chuyển ngữ cảnh task:
  * `UART1_IRQHandler`: Ngắt thu byte từ FPGA, ghi thẳng vào Ring Buffer SPSC (Single-Producer Single-Consumer) kích thước 4096 byte.
  * `SysTick`: Cung cấp timebase chuẩn mili-giây độc lập.
  * `Watchdog Timer (WDT)`: Đặt chu kỳ bảo vệ 6 giây, được nạp lại trong vòng lặp chính.
  * Tần suất phát LoRa chuẩn: Đúng chu kỳ 1.000 ms (1 Hz).

### 5.2 Thuật Toán Chiếu Tia Quang Học 3D (Ray-Plane Intersection)
Thuật toán độc quyền tại `firmware/mcu_payload/src/kvc_georef.c` giải quyết bài toán biến tọa độ pixel trên mặt phẳng ảnh thành tọa độ trắc địa thực tế:

```text
               Z (Trời)
               ▲
               │      UAV [t_cam = (0, 0, h)]
               │       /|
               │      / |
               │     /  │ (Độ cao h từ siêu âm AJ-SR04M)
               │    /   │
               │   /    │
               │  / λ·v │
───────────────┼─/──────┴────────────────► Y (Bắc)
             O │/ p_local = (x_loc, y_loc, 0)
              /│  [Vị trí mục tiêu trên mặt nước]
             / │
            ▼ X (Đông)
```

1. **Vector tia quang học trong hệ tọa độ camera ($v_{cam}$):**
   Từ tâm BBox $(u, v)$ và tiêu cự camera $f_x, f_y$ (đơn vị pixel), vector đơn vị hướng tia nhìn là:
   $$v_{cam} = \begin{bmatrix} (u - c_x) / f_x \\ (v - c_y) / f_y \\ 1 \end{bmatrix}$$
   *(Với cấu hình OV2640 400×300: $c_x = 200, c_y = 150, f_x = 346$).*

2. **Bù góc nghiêng qua Ma trận Xoay IMU ($R_{body}^{NED}$):**
   Đọc góc $\text{Roll} \ (\phi)$ và $\text{Pitch} \ (\theta)$ từ MPU-6050, vector tia nhìn trong hệ quy chiếu mặt đất là:
   $$v_{ned} = R_{IMU} \cdot v_{cam}$$

3. **Giải giao điểm với mặt phẳng nước ($Z = 0$):**
   Biết độ cao UAV so với mặt nước là $h$ (đo từ cảm biến siêu âm AJ-SR04M), hệ số co giãn $\lambda$ thỏa mãn phương trình:
   $$t_{cam\_z} + \lambda \cdot v_{ned\_z} = 0 \implies \lambda = \frac{-h}{v_{ned\_z}}$$
   Từ đó tính được tọa độ cục bộ mét:
   $$p_{local} = \begin{bmatrix} x_{local} \\ y_{local} \end{bmatrix} = \begin{bmatrix} t_{cam\_x} + \lambda \cdot v_{ned\_x} \\ t_{cam\_y} + \lambda \cdot v_{ned\_y} \end{bmatrix}$$

4. **Chuyển đổi sang tọa độ toàn cầu WGS-84:**
   Dung hợp góc định hướng $\text{Yaw} \ (\psi)$ trích xuất từ hướng di chuyển GNSS Course-over-ground khi vận tốc $\ge 0.5 \ \text{knot}$:
   $$\Delta \text{Lat} = \frac{y_{local\_rotated}}{111.320}, \quad \Delta \text{Lon} = \frac{x_{local\_rotated}}{111.320 \cdot \cos(\text{Lat}_{uav})}$$
   $$\text{Target\_Lat} = \text{UAV\_Lat} + \Delta \text{Lat}, \quad \text{Target\_Lon} = \text{UAV\_Lon} + \Delta \text{Lon}$$

### 5.3 Cơ Chế An Toàn Bắt Buộc (Fail-Safe Validity Rules)
* **Quy tắc 1 (Thiếu Yaw hoặc mất GNSS):** MCU lập tức gán `POS_VALID = 0`, tọa độ mục tiêu trả về $0$. Cờ `AI_DETECTED` vẫn giữ bật để trạm đất biết có đối tượng nhưng **tuyệt đối không bịa tọa độ giả**.
* **Quy tắc 2 (Chất lượng siêu âm POOR hoặc ngoài dải 20–700 cm):** Đánh dấu `alt_quality = POOR`, thuật toán từ chối giải định vị, bảo vệ hệ thống khỏi các vật cản đột ngột hoặc nhiễu tia phản xạ.

### 5.4 Hợp Đồng Khung LoRa IF-02 (MCU ➔ Gateway ESP32)
* Khung nhị phân cố định đúng **32 byte**, Little-Endian:

| Byte Offset | Tên trường | Kiểu dữ liệu | Mô tả chi tiết |
| :---: | :--- | :---: | :--- |
| `0..1` | `sync` | `uint16` | Luôn cố định `0xAA55` (Đồng bộ khung) |
| `2` | `msg_id` | `uint8` | `0x01`: Target Detected, `0x02`: Heartbeat |
| `3` | `seq` | `uint8` | Bộ đếm gói tin tuần hoàn `0..255` |
| `4..7` | `timestamp_ms` | `uint32` | Thời gian chạy hệ thống MCU (mili-giây) |
| `8..11` | `target_lat` | `int32` | Vĩ độ mục tiêu (Độ x $10^7$, ví dụ 16.0748123) |
| `12..15`| `target_lon` | `int32` | Kinh độ mục tiêu (Độ x $10^7$, ví dụ 108.1498123) |
| `16..17`| `target_x_local`| `int16` | Tọa độ X cục bộ so với UAV (cm) |
| `18..19`| `target_y_local`| `int16` | Tọa độ Y cục bộ so với UAV (cm) |
| `20..21`| `distance_cm` | `uint16`| Khoảng cách siêu âm tới mặt nước (cm) |
| `22` | `class_id` | `uint8` | `1`: Person, `2`: Lifebuoy (Phao cứu sinh) |
| `23` | `confidence` | `uint8` | Độ tin cậy nhận diện (`0..100%`) |
| `24` | `sensor_flags` | `uint8` | Bit 0: Alt Valid, Bit 1: IMU Valid, Bit 2: GNSS Valid, Bit 3: AI Detected, Bit 4: Pos Valid |
| `25` | `status_reserved`| `uint8`| **Luôn cố định `0x00`** (Đã bỏ đo pin ngày 29/10/2026) |
| `26..27`| `pitch_deg10` | `int16` | Góc Pitch của UAV (Độ x 10) |
| `28..29`| `roll_deg10` | `int16` | Góc Roll của UAV (Độ x 10) |
| `30..31`| `checksum` | `uint16` | **CRC-16/CCITT-FALSE** tính trên Byte 0 đến 29 |

> **Golden Vector GV-02:** Chuỗi dữ liệu mẫu chuẩn có CRC hợp lệ bằng đúng **`0xE260`**.

---

## 6. PHÂN HỆ VÔ TUYẾN LORA 433 MHz & GATEWAY ESP32-C3

### 6.1 Cấu Hình Kênh Truyền Vô Tuyến LoRa
* **Tần số trung tâm:** $433.0 \ \text{MHz}$ (Băng tần dân sự miễn cấp phép ISM, khả năng đâm xuyên mưa bão tối ưu).
* **Băng thông (BW):** $125 \ \text{kHz}$.
* **Hệ số trải phổ (Spreading Factor):** $\text{SF} = 7$ (mặc định) hoặc $\text{SF} = 8$ (khi cần cự ly xa hơn).
* **Tỷ lệ mã sửa lỗi (Code Rate):** $\text{CR} = 4/5$.
* **Độ dài Preamble:** 8 ký hiệu.
* **Thời gian chiếm sóng thực tế (Time-on-Air):**
  * Tại SF7: Đúng **$71,9 \ \text{ms}$** cho gói tin 32 byte.
  * Tại SF8: Đúng **$133,6 \ \text{ms}$** cho gói tin 32 byte.
  * Với chu kỳ phát $1 \ \text{Hz}$ ($1000 \ \text{ms}$), tỷ lệ chiếm sóng (Duty Cycle) chỉ là **$7,19\%$**, hoàn toàn tuân thủ tiêu chuẩn an toàn vô tuyến và tránh gây nghẽn kênh.

### 6.2 Gateway ESP32-C3 — Tự Chủ Dã Chiến
* **Khái niệm thiết kế:** *"Hệ thống không chết khi Laptop chết."*
* **Nguồn cấp dã chiến:** Bộ pin Li-ion 18650 2S (7.4V) tích hợp mạch giảm áp xung MP1584 hạ về 5V, cấp nguồn độc lập cho ESP32 và module LoRa Ra-02.
* **Màn hình OLED SSD1306 0.96 inch tại hiện trường:**
  * Hiển thị chỉ số vật lý tức thời: $\text{RSSI} \ (\text{dBm})$, $\text{SNR} \ (\text{dB})$, số gói tin nhận thành công, lỗi CRC.
  * Hiển thị tọa độ cứu nạn $(\text{Lat}, \text{Lon})$ trực tiếp trên màn hình nhỏ. Trong trường hợp laptop sập nguồn, đội cứu hộ vẫn đọc được vị trí nạn nhân ngay trên tay cầm Gateway.
* **Chính sách mạng hai tầng tự động (`net_policy.cpp`):**
  * *Tầng 1 (STA Mode):* Tự động kết nối vào điểm phát sóng Wi-Fi của laptop cứu hộ (`Ars vô địch thì đổi tên`).
  * *Tầng 2 (SoftAP Fallback):* Nếu mất kết nối Wi-Fi $\ge 5 \ \text{giây}$, Gateway tự động phát mạng Wi-Fi riêng tên `KVC_GROUND_STATION` (IP `192.168.4.1`) để laptop hoặc điện thoại kết nối vào.

### 6.3 Hợp Đồng WebSocket IF-03 (Gateway ➔ Laptop GCS)
* **Giao thức:** WebSocket cổng `8080`, đường dẫn bắt buộc `/telemetry`.
* **Cấu trúc JSON chuẩn 7 trường:**
  ```json
  {
    "type": "telemetry",
    "seq": 142,
    "rssi": -85,
    "snr": 8.5,
    "raw_hex": "aa55018e00123456...",
    "gateway_session_id": 4098,
    "received_at": 1730789123.45
  }
  ```

---

## 7. PHÂN HỆ TRẠM MẶT ĐẤT GCS — BACKEND FASTAPI & WEB DASHBOARD OFFLINE

### 7.1 Backend GCS FastAPI (`gcs/backend/`)
* **Chức năng Ingress (`esp32_ingress.py`):** Lắng nghe luồng WebSocket IF-03 từ Gateway, giải mã chuỗi `raw_hex` 32 byte theo chuẩn IF-02, kiểm tra tính toàn vẹn CRC-16, chuyển đổi hệ tọa độ và cập nhật trạng thái hệ thống (`state.py`).
* **Bảo toàn dữ liệu bằng SQLite WAL Mode (`sqlite_logger.py`):**
  * Sử dụng cấu hình `PRAGMA journal_mode=WAL` và `PRAGMA synchronous=FULL`.
  * Thực hiện cơ chế Commit Boundary tức thời khi có sự kiện phát hiện mục tiêu. Đảm bảo dữ liệu tọa độ không bao giờ bị hỏng kể cả khi laptop bị đột ngột rút nguồn hoặc sập pin.
* **Thay thế tính năng Replay bằng Nhật Ký Phiên (`features/history/EventLogPage.tsx`):**
  * Toàn bộ sự kiện được lưu trữ minh bạch. Người chỉ huy có thể lọc sự kiện theo cấp độ (INFO, WARNING, CRITICAL), theo Actor (FPGA, MCU, GATEWAY) và xuất ra file CSV phục vụ báo cáo cứu nạn.

### 7.2 Frontend Web Dashboard Offline (`gcs/frontend/`)
* **Công nghệ:** React 18, Vite, TypeScript, TailwindCSS kết hợp Design Tokens chuyên nghiệp.
* **Hoàn toàn 100% Offline:**
  * Toàn bộ mã nguồn thư viện Leaflet, tile bản đồ nền, font chữ Inter và icon SVG được đóng gói cục bộ trong thư mục `public/`.
  * Không gọi bất kỳ CDN Internet bên ngoài nào, khởi động tức thì trong mọi hoàn cảnh ngắt mạng.
* **Ba phân khu tác chiến trực quan:**
  1. *Radar Cục bộ (Local Radar Panel):* Hiển thị góc phương vị và cự ly mét tương đối quanh UAV.
  2. *Bản đồ Toàn cầu (GpsMapPanel):* Hiển thị vết bay UAV, vị trí trạm đất và ghim cờ đỏ vị trí nạn nhân theo tọa độ WGS-84.
  3. *Bảng Thanh trạng thái (SensorFlagsInspector & TopStatCards):* Giám sát thời gian thực nhịp tim hệ thống, trạng thái từng cảm biến (Alt, IMU, GNSS, AI), chỉ số suy hao sóng RSSI/SNR.

---

## 8. PHÂN HỆ QUAN SÁT PHỤ TRỢ IF-05 & AI THAM CHIẾU PC

### 8.1 Kênh Video Phụ Trợ ESP32-S3-CAM
* Nhằm phục vụ quan sát bối cảnh góc rộng ngoài hiện trường, hệ thống bổ sung module ESP32-S3-CAM trang bị cảm biến OV3660 3 Megapixel.
* **Đường truyền Relay 3 tầng:**
  * S3-CAM phát luồng HTTP MJPEG độ phân giải QVGA/VGA qua Wi-Fi nội bộ đến cổng 81.
  * Backend GCS đóng vai trò Proxy Relay (`video_relay.py`), chuyển tiếp luồng video về cùng nguồn gốc (Same-Origin) tại cổng `8000/video/stream`.
  * Trình duyệt Web Dashboard hiển thị mượt mà không gặp lỗi bảo mật Mixed Content hoặc CORS.

### 8.2 Ranh Giới Hình Học & Quyết Định Không Vẽ Đè BBox
> **NGUYÊN TẮC BẢO TOÀN KHOA HỌC:** Cờ `has_overlay` trên giao diện luôn giữ giá trị `false`.

* **Lý do kỹ thuật:**
  1. Hai camera sử dụng hai cảm biến quang học độc lập (OV2640 trên tải bay và OV3660 trên kênh phụ) có tiêu cự, kích thước ma trận ảnh và trường nhìn (FOV) khác nhau hoàn toàn.
  2. Hai chip vi điều khiển chạy hai bộ dao động thạch anh rời rạc, có độ lệch trễ pha thời gian 100–500 ms.
  3. Việc lấy tọa độ BBox từ FPGA rồi vẽ đè lên luồng video của S3-CAM sẽ dẫn đến sai lệch hình học nghiêm trọng và đánh lừa thị giác người dùng. Nhóm kiên quyết phân định: **Kênh tọa độ LoRa chịu trách nhiệm cứu nạn, Kênh video chỉ chịu trách nhiệm hỗ trợ mắt nhìn.**

### 8.3 Mô Hình Học Sâu Đối Chứng Trên PC (AI Reference Worker)
* Khởi chạy qua file batch `CHAY_AI_NHAN_DIEN.bat` hoặc `khoidong/3_chay_ai_worker.bat`.
* Sử dụng mô hình **YOLO11n** đã được huấn luyện tối ưu trên tập dữ liệu người và phao trôi sông lũ, tận dụng nhân TensorRT / CUDA trên card đồ họa rời NVIDIA GeForce RTX 4060.
* Nhận luồng video từ relay cổng 8000, suy luận với tốc độ >60 FPS và phát luồng video đã vẽ BBox ra cổng `http://127.0.0.1:8090/`. Đóng vai trò làm mốc đối chứng (Ground Truth) để đánh giá khả năng bắt màu của thuật toán Blob trên FPGA.

---

## 9. MA TRẬN HỢP ĐỒNG GIAO TIẾP HỆ THỐNG (IF-01 ĐẾN IF-05)

Mọi luồng dữ liệu trong KVC được kiểm soát bằng ma trận 5 giao diện chuẩn hóa:

| Mã Giao Diện | Điểm Kết Nối Vật Lý | Thông Số Kỹ Thuật | Kích Thước Khung | Mức Bằng Chứng Kiểm Thử | Quyền Phê Duyệt Thay Đổi |
| :---: | :--- | :--- | :---: | :---: | :---: |
| **IF-01** | FPGA GW2A ➔ MCU Sonix | UART 38.400 bps, 8N1, tín hiệu `DATA_READY` | 10 / 18 / 26 Byte | **HARDWARE-VERIFIED** (197k byte, fe=0) | **HUMAN APPROVAL** |
| **IF-02** | MCU Sonix ➔ ESP32-C3 | LoRa 433 MHz, BW 125k, SF7/8, CR 4/5 | Cố định đúng **32 Byte** | **HARDWARE-VERIFIED (TX)** (1.466 gói soak test) | **HUMAN APPROVAL** (Đã duyệt 29/10/2026) |
| **IF-03** | ESP32-C3 ➔ Laptop GCS | Wi-Fi 2.4 GHz, WebSocket cổng 8080 | JSON 7 trường | **BUILT / HOST-PASS** (Chờ ghép nối bo thật) | **HUMAN APPROVAL** |
| **IF-04** | GCS Backend ➔ Web UI | HTTP Loopback & WebSocket cổng 8000 | JSON Schema | **SOURCE-VERIFIED** (84 test backend, 173 frontend) | Owner GCS |
| **IF-05** | ESP32-S3-CAM ➔ Backend | HTTP MJPEG cổng 81, Boundary Token | Luồng ảnh liên tục | **BUILT + SIMULATED** (29,75 fps camera TCP giả) | **HUMAN APPROVAL** |

---

## 10. QUY TRÌNH KHỞI ĐỘNG & KỊCH BẢN VẬN HÀNH DEMO

### 10.1 Quy Trình Khởi Động Phần Cứng & Phần Mềm Dã Chiến
1. **Bước 1 (Bật phần mềm Trạm mặt đất):**
   * Mở thư mục `khoidong/`, kích đúp vào file `0_CHAY_TAT_CA.bat`.
   * Cửa sổ Backend FastAPI tự động mở tại `http://127.0.0.1:8000`.
   * Cửa sổ Web Dashboard tự động mở tại `http://localhost:5173`.
2. **Bước 2 (Bật nguồn Gateway ESP32):**
   * Bật công tắc pin 18650 của Gateway.
   * Quan sát màn hình OLED: Phải hiển thị logo KVC, địa chỉ IP kết nối và trạng thái `LORA: READY`.
3. **Bước 3 (Cấp nguồn Tải nhiệm vụ UAV):**
   * Cấp nguồn cho bo FPGA Primer 20K và bo MCU Sonix SN34F788.
   * Đèn LED `led_uart_busy` trên FPGA sáng nhấp nháy đều (tần suất ~7,5 Hz theo nhịp VSYNC camera).
   * MCU Sonix phát gói tin Heartbeat LoRa chu kỳ 1 giây/lần.
4. **Bước 4 (Khởi động AI Worker tham chiếu - Tùy chọn):**
   * Kích đúp `CHAY_AI_NHAN_DIEN.bat` để mở nhận diện YOLO11n trên GPU rời nếu muốn trình diễn luồng video phụ.

### 10.2 Kịch Bản 3 Hoạt Động Minh Chứng Trước Ban Giám Khảo

```text
┌────────────────────────────────────────────────────────────────────────────────────────┐
│                        KỊCH BẢN 3 HOẠT ĐỘNG TRÌNH DIỄN THỰC CHUYẾN                      │
├────────────────────────────┬────────────────────────────┬──────────────────────────────┤
│  1. VIDEO LŨ LỤT CÓ SẴN    │  2. VIDEO BỂ BƠI THỰC ĐỊA  │  3. LIVE DEMO TẠI BÀN THI    │
│    (PC AI Reference)       │     (Full-Chain Stream)    │     (Live Hardware Kit)      │
├────────────────────────────┼────────────────────────────┼──────────────────────────────┤
│ • Chiếu video lũ lụt quay  │ • Trình chiếu video ghi    │ • Cấp nguồn trực tiếp bộ bo  │
│   thực tế từ flycam.       │   hình toàn cảnh thử       │   mạch tại bàn thi.          │
│ • Thể hiện khả năng bắt    │   nghiệm trên bể bơi dã    │ • Đưa vật thể màu cam (nắp   │
│   người và phao của        │   chiến.                   │   chai, phao cam) trước ống  │
│   YOLO11n trên laptop.     │ • Chứng minh chuỗi: Tải ➔  │   kính OV2640.               │
│ • Kiểm thử âm tính: Đoạn   │   LoRa ➔ Gateway ➔ UI.     │ • Quan sát gói tin LoRa nhảy │
│   video không có người để  │ • Bắt được cự ly siêu âm   │   trên OLED Gateway và cờ đỏ │
│   chứng minh không báo giả.│   thật phản xạ mặt nước.   │   ghim tức thì trên Web GCS. │
└────────────────────────────┴────────────────────────────┴──────────────────────────────┤
```

---

## 11. BẢNG THUẬT NGỮ & TỪ VIẾT TẮT QUAN TRỌNG

* **BBox (Bounding Box):** Khung chữ nhật bao quanh đối tượng nhận diện, định nghĩa bởi tâm $(X, Y)$ cùng chiều rộng $W$ và chiều cao $H$.
* **CDC (Clock Domain Crossing):** Kỹ thuật chuyển tiếp dữ liệu an toàn giữa hai miền xung nhịp bất đồng bộ trên FPGA.
* **DVP (Digital Video Port):** Giao diện truyền dữ liệu hình ảnh song song kèm các tín hiệu đồng bộ PCLK, VSYNC, HREF.
* **FPU (Floating Point Unit):** Khối phần cứng tính toán số thực dấu phẩy động tích hợp trong nhân ARM Cortex-M4F.
* **GCS (Ground Control Station):** Trạm chỉ huy mặt đất tiếp nhận dữ liệu và điều phối công tác cứu hộ.
* **Georeferencing:** Thuật toán gắn tọa độ trắc địa thực tế (Lat, Lon) cho các điểm ảnh quang học.
* **PCLK (Pixel Clock):** Xung nhịp đồng bộ của từng byte dữ liệu ảnh xuất ra từ cảm biến camera.
* **PRR (Packet Reception Rate):** Tỷ lệ thu nhận gói tin thành công trên kênh truyền vô tuyến.
* **RLE (Run-Length Encoding):** Thuật toán nén/đếm độ dài chuỗi pixel liên tiếp thỏa mãn điều kiện lọc màu.
* **SCCB (Serial Camera Control Bus):** Giao thức I2C chuyên dụng của OmniVision dùng để cấu hình thanh ghi camera.
* **TNS (Total Negative Slack):** Tổng độ trễ vi phạm thời gian trong phân tích PnR FPGA (yêu cầu $\text{TNS} = 0$).
* **VSYNC (Vertical Synchronization):** Xung báo hiệu kết thúc một khung ảnh hoàn chỉnh.

---
*Tài liệu thuộc bản quyền nhóm nghiên cứu KVC — Đại học Bách Khoa, Đại học Đà Nẵng. Lưu hành nội bộ phục vụ thi đấu.*
