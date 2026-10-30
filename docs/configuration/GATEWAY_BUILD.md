# KVC — Phân hệ Gateway Trạm Đất ESP32-C3

- **Người phụ trách:** **Đoàn Thanh Trường Thịnh**
- **Phần cứng mục tiêu:** Bo mạch **ESP32-C3 DevKit** (Kiến trúc 32-bit RISC-V đơn nhân 160 MHz, nguồn pin riêng độc lập, kèm module LoRa Ra-02 433 MHz)
- **Công cụ phát triển (IDE / Toolchain):** **PlatformIO IDE** (trên VS Code) với **`framework = arduino`** (Arduino Core for ESP32, board `esp32-c3-devkitm-1`)
- **File cấu hình dự án đã tạo sẵn:** [platformio.ini](platformio.ini)

---

## 1. Nhiệm vụ của phân hệ Gateway ESP32

1. **Thu tín hiệu LoRa:** Đọc gói từ MCU Sonix trên UAV; nhận RF payload 32 byte cấu trúc `KvcTelemetryPacket32` (IF-02) và cấu hình điều chế candidate 433.0 MHz, Sync Word 0x12, BW 125 kHz, SF7/SF8, CR 4/5.
2. **Đo lường chất lượng sóng:** Trích xuất chỉ số cường độ sóng **RSSI (dBm)** và tỷ số tín hiệu trên nhiễu **SNR (dB)** từ chip SX1278.
3. **Thiết lập mạng theo thứ tự ưu tiên:** (1) kết nối Wi-Fi 2.4 GHz đã cấu hình sẵn qua build flags `-D KVC_WIFI_SSID` / `-D KVC_WIFI_PASS` (hỗ trợ tới 4 mạng `..._SSID2..4`; **"4G" của dự án là hotspot do điện thoại phát, không cần module 4G**); (2) nếu không có credential hoặc hết ngân sách khởi động mà chưa nối được thì tự phát SoftAP `KVC_GROUND_STATION` (mật khẩu `kvc123456`, IP `192.168.4.1`). Khi ưu tiên 1 nối lại được, firmware tự đóng SoftAP. ESP32-C3 chỉ hỗ trợ 2.4 GHz.
4. **Chạy WebSocket Server:** Đã triển khai WebSocket Server (cổng 8080, endpoint `/telemetry`) trong `src/main.cpp`, đóng gói JSON envelope theo chuẩn IF-03 với các trường `transport_version`, `gateway_session_id`, `gateway_sequence`, `rx_monotonic_ms`, `rf_payload_hex`, `rssi_dbm`, `snr_db`, `rx_drop_count`. Backend GCS đã có module `gcs/backend/esp32_ingress.py` tiếp nhận và giải mã thông suốt.
5. **Duy trì hoạt động độc lập:** ESP32 dùng nguồn pin riêng, tiếp tục nhận và đếm gói LoRa ngay cả khi laptop tắt hoặc ngắt kết nối Wi-Fi.

---

## 2. Giao diện kỹ thuật bắt buộc tuân thủ

Phân hệ Gateway là cầu nối trung chuyển vô tuyến sang mạng cục bộ:
1. **Đầu vào (Thu sóng LoRa từ MCU Sonix):** 👉 **[docs/interfaces/IF_MCU_LORA_RF.md](file:///d:/Project_UAV_KVC/docs/interfaces/IF_MCU_LORA_RF.md)**
   - Nhận RF payload 32 byte bắt đầu bằng `0xAA 0x55` theo chuẩn `KvcTelemetryPacket32`. CRC-16 của payload do firmware kiểm tra trước khi chuyển tiếp; CRC LoRa PHY là lớp kiểm tra phần cứng riêng của SX1278.
2. **Đầu ra (Phát Wi-Fi sang Backend Laptop):** 👉 **[docs/interfaces/IF_ESP32_GCS_WS.md](file:///d:/Project_UAV_KVC/docs/interfaces/IF_ESP32_GCS_WS.md)**
   - Forward envelope transport IF-03 qua WebSocket tới Backend laptop (`ws://192.168.4.1:8080/telemetry`). Backend GCS xử lý kết nối qua Ingress Client (`gcs/backend/esp32_ingress.py`).

> ⚠️ **LƯU Ý:** Trình duyệt Web Dashboard trên laptop kết nối tới Backend Python (`ws://127.0.0.1:8000/ws`), **KHÔNG kết nối trực tiếp vào ESP32**.

---

## 3. Cấu trúc tổ chức thư mục khuyến nghị cho Thịnh

Dự án đã được cấu hình sẵn theo chuẩn PlatformIO:

```text
firmware/gateway_esp32/
├── platformio.ini       # File cấu hình PlatformIO (đã khóa board & thư viện LoRa, WebSocket, ArduinoJson)
├── src/                 # Toàn bộ mã nguồn C/C++ (*.cpp, *.c)
│   ├── main.cpp         # Setup & loop chính (tích hợp SX1278 SPI, SoftAP, WebSocketsServer 8080 /telemetry)
│   ├── lora_receiver.cpp# Module hóa đọc LoRa & RSSI/SNR (dự kiến refactor)
│   ├── wifi_softap.cpp  # Module hóa cấu hình Wi-Fi AP (dự kiến refactor)
│   └── ws_server.cpp    # Module hóa WebSocket Server (dự kiến refactor)
├── include/             # File header (*.h)
└── README.md            # Tài liệu chỉ dẫn này
```

---

## 4. Hướng dẫn mở dự án bằng PlatformIO trên VS Code

1. Cài đặt extension **PlatformIO IDE** trên VS Code.
2. Mở thư mục `firmware/gateway_esp32/` bằng PlatformIO (*Open Project*).
3. PlatformIO sẽ tự động tải đúng phiên bản toolchain `espressif32` cho kiến trúc RISC-V (`esp32-c3-devkitm-1`) và các thư viện `LoRa`, `WebSockets`, `ArduinoJson`.
4. Bấm biểu tượng **Build (✓)** ở thanh trạng thái dưới cùng để biên dịch.

---

## 5. Lưu ý kỹ thuật quan trọng khi lập trình ESP32-C3

1. **Kiến trúc đơn nhân (Single-Core RISC-V):**
   - ESP32-C3 chỉ có 1 lõi CPU (160 MHz). Tuyệt đối **không gọi `xTaskCreatePinnedToCore` sang Core 1** như trên ESP32 classic. Tất cả tác vụ (LoRa RX ISR, SoftAP Wi-Fi, WebSocket broadcast) chạy phối hợp non-blocking hoặc định thời trên Core 0.
2. **Cảnh báo chân Strapping Pins khi đấu nối:**
   - `GPIO 2`, `GPIO 8`, `GPIO 9` là các chân quyết định chế độ boot của chip. Đặc biệt `GPIO 8` và `GPIO 9` không được để mức kéo LOW bất thường khi khởi động làm chip rơi vào chế độ nạp ROM.
3. **Cấu hình chân kết nối chính thức (Khớp mã nguồn `src/main.cpp` & Master Pinout):**
   - Tham chiếu toàn bộ tại [KVC_MASTER_PINOUT_WIRING.md](../hardware/wiring/KVC_MASTER_PINOUT_WIRING.md):
   - **Bus SPI (Module LoRa Ra-02 SX1278 - 433 MHz):**
     * `NSS / CS`: **`GPIO 7`**
     * `SCK`: **`GPIO 4`**
     * `MOSI`: **`GPIO 6`**
     * `MISO`: **`GPIO 5`**
     * `RST`: **`GPIO 1`**
     * `DIO0 (Ngắt RxDone)`: **`GPIO 3`**
   - **Bus I2C (Màn hình OLED SSD1306 0.96", tùy chọn trạm đất):**
     * `SDA`: `GPIO 8`
     * `SCL`: `GPIO 9`
     *(Lưu ý: GPIO 8 và GPIO 9 là strapping pins; kiểm tra mức logic khi khởi động để tránh kẹt boot)*
4. **Cổng nạp & Debug Serial (USB-CDC vs USB-to-UART):**
   - Nếu bo devkit ESP32-C3 dùng cổng Type-C nối trực tiếp vào chân USB phần cứng của SoC (`GPIO 18 / 19`), cần bật cờ `-D ARDUINO_USB_CDC_ON_BOOT=1` trong `platformio.ini` để `Serial.print()` xuất ra đúng cổng USB máy tính.
   - Nếu bo dùng chip chuyển đổi trung gian (CH340 / CP2102) nối vào `GPIO 20 / 21` (UART0) thì dùng cấu hình mặc định.
