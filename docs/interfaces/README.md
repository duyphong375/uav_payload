# KVC — Ma trận và Danh mục Giao diện Toàn Hệ thống (Interfaces)

Tài liệu này quản lý tập trung toàn bộ các giao diện kết nối (hợp đồng kỹ thuật / ABI) giữa các phân hệ trong hệ thống KVC. Mọi thay đổi về giao thức, cấu trúc gói tin, baudrate, pinout hoặc CRC phải được cập nhật tại thư mục này trước khi triển khai trên phần cứng.

---

## 1. Sơ Đồ Luồng Dữ Liệu Toàn Hệ Thống

Hệ thống phân tách rõ rệt thành hai đường truyền vật lý độc lập:
1. **Kênh chính: Đo xa Telemetry & Tọa độ cứu nạn qua LoRa 433 MHz** (Zero-video, 32 byte/gói, bảo đảm cự ly xa và xuyên nhiễu).
2. **Kênh phụ: Video quang học quan sát qua Wi-Fi MJPEG (IF-05)** (Dành riêng cho mắt người vận hành, không sinh tọa độ, không can thiệp luồng LoRa).

```mermaid
flowchart TB
    subgraph AIR_UNIT["TẢI NHIỆM VỤ TRÊN UAV (AIR UNIT)"]
        direction TB
        CAM_OPT["Camera quang học OV2640 DVP 8-bit<br/>(Header J1 pin 5–20)"]
        FPGA["FPGA Gowin GW2A Primer 20K<br/>(kvc_blob_detect.v / packetizer)"]
        SENSORS["Cảm biến Tải:<br/>AJ-SR04M Siêu âm, GY-87 IMU, NEO-M10N GNSS"]
        MCU["MCU Sonix SN34F788<br/>(Georef Ray-Plane & Packetizer)"]
        LORA_TX["LoRa Ra-02 TX (SX1278 433 MHz)"]
        CAM_S3["Camera phụ ESP32-S3-CAM + OV3660<br/>(Kênh quan sát, KHÔNG sinh tọa độ)"]

        CAM_OPT -->|"IF-CAM: DVP 8-bit song song"| FPGA
        FPGA -->|"IF-01: UART 38.400 bps + DATA_READY"| MCU
        SENSORS -->|"IF-00: UART 9600 / I2C 400k"| MCU
        MCU -->|"SPI Bus"| LORA_TX
    end

    subgraph GROUND_STATION["TRẠM MẶT ĐẤT (GROUND STATION)"]
        direction TB
        LORA_RX["LoRa Ra-02 RX (SX1278 433 MHz)"]
        ESP32_GW["ESP32-C3 Gateway (Nguồn pin riêng)<br/>(Kiểm CRC, đo RSSI/SNR, phát OLED)"]
        OLED["OLED SSD1306 0.96 inch<br/>(Hiển thị độc lập ngoài trời)"]

        LORA_RX -->|"SPI + Chân ngắt DIO0"| ESP32_GW
        ESP32_GW -->|"I2C 400 kHz"| OLED
    end

    subgraph GCS_HOST["LAPTOP GCS (HỆ THỐNG GIÁM SÁT OFFLINE)"]
        direction TB
        INGRESS["gcs/backend Ingress Client<br/>(esp32_ingress.py)"]
        SQLITE["SQLite Logger (WAL Mode)<br/>(Commit kvc_telemetry.db)"]
        VIDEO_RELAY["Video Relay Service<br/>(video_relay.py, 1 upstream)"]
        LOCAL_WS["Local WebSocket Server<br/>(ws://127.0.0.1:8000/ws/telemetry)"]
        DASHBOARD["GCS Tactical Dashboard (React 19)<br/>(Tactical HUD, Radar Local, Bản đồ WGS-84, Nhật ký phiên)"]

        INGRESS --> SQLITE
        INGRESS --> LOCAL_WS
        LOCAL_WS --> DASHBOARD
        VIDEO_RELAY -->|"same-origin HTTP MJPEG"| DASHBOARD
    end

    LORA_TX <==>|"IF-02: LoRa RF 433 MHz (32 Byte / 1 Hz)"| LORA_RX
    ESP32_GW -->|"IF-03: Wi-Fi SoftAP / WebSocket JSON v1 (:8080/telemetry)"| INGRESS
    CAM_S3 -.->|"IF-05: Wi-Fi HTTP MJPEG (:81/stream) — Kênh phụ"| VIDEO_RELAY
```

> [!IMPORTANT]
> **Quy Tắc Ranh Giới Topology Bắt Buộc:**
> 1. **Zero-Video over LoRa:** Toàn bộ dữ liệu truyền qua LoRa chỉ là **Metadata nhị phân 32 byte** (Tọa độ, BBox, Cảm biến, Trạng thái). Tuyệt đối không truyền hình ảnh hoặc video qua LoRa.
> 2. **Hai Chặng Mạng Độc Lập:** ESP32 trạm đất phát Wi-Fi SoftAP hoặc kết nối STA Wi-Fi 2.4 GHz và chạy WebSocket Server. **Backend Python trên Laptop đóng vai trò WebSocket Client kết nối vào ESP32** để thu nhận dữ liệu và ghi vào SQLite.
> 3. **Trình duyệt Web Dashboard tuyệt đối KHÔNG kết nối trực tiếp vào ESP32** để bảo vệ tài nguyên vi điều khiển đơn nhân ESP32-C3 và bảo đảm 100% dữ liệu được lưu vết bền vững vào SQLite.
> 4. **Kênh Video IF-05 là Kênh Phụ:** ESP32-S3-CAM chỉ làm nhiệm vụ phát hình ảnh quan sát cho cứu hộ viên. Kênh này **không sinh tọa độ**, **không vẽ đè BBox từ FPGA** (do khác biệt cảm biến/FOV và lệch thời gian 100–500 ms) và **không đi qua LoRa**.

---

## 2. Danh Mục Chi Tiết Các Giao Diện (Interface Catalog)

| Mã giao diện | Tên giao diện | Đầu phát (TX / Server) | Đầu nhận (RX / Client) | Kênh vật lý & Giao thức | Định dạng dữ liệu & Tần suất | Trạng thái bằng chứng | Tài liệu chi tiết |
| :---: | :--- | :--- | :--- | :--- | :--- | :---: | :--- |
| **IF-CAM** | Luồng ảnh thô quang học | Cụm camera quang học OV2640 DVP 8-bit (**Kiên**) | FPGA OneKiwi Primer 20K (**Vững**) | Bus song song DVP 8-bit trên Header J1 pin 5–20 (PCLK, VSYNC, HREF, D[7:0], SCCB); 14 `IO_LOC` tại `KVC_PR/src/KVC_FPGA.cst:58-98` | VGA 640×480 RGB565 / YUV; ~30 FPS | `SIMULATED` | [IF_CAMERA_FPGA.md](IF_CAMERA_FPGA.md) |
| **IF-00** | Cảm biến định vị tải UAV | Cụm cảm biến tải: AJ-SR04M Siêu âm, GY-87 IMU, NEO-M10N GNSS (**Cường / Kiên**) | MCU Sonix SN34F788 (**Phong**) | - AJ-SR04M: UART2 9600 bps<br>- GY-87: I2C0 400 kHz<br>- NEO-M10N: UART3 9600 bps | - Siêu âm: khung 4B, dải 20–700 cm<br>- IMU: Accel/Gyro thô 6-trục<br>- GNSS: Khung NMEA/UBX 1–10 Hz | `SIMULATED` (Test 65/65 PASS) | [IF_MCU_SENSORS.md](IF_MCU_SENSORS.md) |
| **IF-01** | Khung kết quả nhận diện BBox | FPGA OneKiwi Primer 20K (**Vững**) | MCU Sonix SN34F788 (**Phong**) | UART 3.3V CMOS (**38.400 bps**, 8N1) + Chân ngắt GPIO `DATA_READY` | Khung nhị phân Little-Endian: Sync `0x5A 0xA5`, Ver `0x01`, Count $N \le 12$, Timestamp ms, $N \times 8$ byte BBox, CRC-16; nhịp ~5–30 FPS | **`HARDWARE-VERIFIED`** (FPGA ↔ MCU: 197.844B mock / 720B blob thật, `fe=0 oe=0 crc=0`) | [IF_FPGA_MCU_UART.md](IF_FPGA_MCU_UART.md) |
| **IF-02** | Gói tin telemetry vô tuyến cứu nạn | MCU Sonix SN34F788 (**Phong**) | ESP32-C3 Gateway Trạm Đất (**Thịnh**) | Sóng vô tuyến LoRa 433 MHz (Ai-Thinker Ra-02 / Semtech SX1278, SPI) | Gói tin nhị phân cố định **đúng 32 byte** Little-Endian; CRC-16/CCITT-FALSE trên byte 0–29; tần suất 1 Hz (chuẩn) / 2–5 Hz (target) | **APPROVED ABI** (HUMAN 29/10/2026); Tx `HARDWARE-VERIFIED` (`tx=17/0`) | [IF_MCU_LORA_RF.md](IF_MCU_LORA_RF.md) |
| **IF-03** | Luồng telemetry từ Trạm đất sang Host | ESP32-C3 Gateway Trạm Đất (**Thịnh**) | Backend GCS trên Laptop (**Thịnh**) | Wi-Fi 2.4 GHz 802.11 b/g/n (Ưu tiên STA; fallback SoftAP `KVC_GROUND_STATION` 192.168.4.1) + WebSocket Server cổng 8080 | JSON UTF-8 Transport Envelope v1: `transport_version`, `gateway_session_id`, `gateway_sequence`, `rx_monotonic_ms`, `rf_payload_hex` (64 hex chars), `rssi_dbm`, `snr_db`, `rx_drop_count` | `SOURCE-VERIFIED` (PlatformIO build exit 0; host test PASS) | [IF_ESP32_GCS_WS.md](IF_ESP32_GCS_WS.md) |
| **IF-04** | Dữ liệu ứng dụng GCS Host nội bộ | Backend GCS Python FastAPI | Frontend Dashboard Web GCS | Localhost HTTP REST + WebSocket Server (`ws://127.0.0.1:8000/ws/telemetry`) | JSON payload: Snapshot khởi tạo, Patches sự kiện delta, REST CRUD session, Alert events | `SOURCE-VERIFIED` (84 tests pytest backend PASS) | [IF_GCS_DATA_CONTRACT.md](IF_GCS_DATA_CONTRACT.md) & [KVC_GCS_DATA_CONTRACT.md](KVC_GCS_DATA_CONTRACT.md) |
| **IF-05** | Video quan sát phụ (MJPEG) | Module ESP32-S3-CAM + OV3660 (**Kilo**) | Backend GCS relay trung gian ➔ Trình duyệt Web Dashboard | Wi-Fi 2.4 GHz; HTTP MJPEG `multipart/x-mixed-replace` trên cổng 81 (`/stream`); Backend fan-out same-origin | Luồng ảnh JPEG HVGA 480×320 (q22/q26), nhịp 15–20 FPS; **KHÔNG sinh tọa độ, KHÔNG overlay BBox** | `SOURCE-VERIFIED + SIMULATED + BUILT` (Firmware b1.5.2 build exit 0; 41 test relay PASS) | [IF_ESP32_CAM_GCS.md](IF_ESP32_CAM_GCS.md) |

---

## 3. Trình Tự Thực Thi End-to-End (Sequence Diagram)

Trình tự thời gian từ khi đối tượng trôi dạt xuất hiện trên mặt nước cho đến khi hiển thị cảnh báo lên màn hình GCS:

```mermaid
sequenceDiagram
    autonumber
    actor Target as Người/Phao dưới nước
    participant Cam as OV2640 DVP
    participant FPGA as FPGA GW2A
    participant MCU as MCU Sonix
    participant Sensors as Cảm biến (Siêu âm/IMU/GNSS)
    participant LoRa_Air as LoRa SX1278 (TX)
    participant LoRa_Gnd as LoRa SX1278 (RX)
    participant ESP32 as Gateway ESP32-C3
    participant Backend as Laptop GCS Backend
    participant SQLite as Database SQLite WAL
    participant Frontend as GCS Dashboard UI

    Target->>Cam: Quang ảnh phản xạ bề mặt nước
    Cam->>FPGA: [IF-CAM] Luồng pixel DVP 8-bit (PCLK, VSYNC, HREF)
    Note over FPGA: Letterbox 160×160 RGB565<br/>kvc_blob_detect.v quét màu cam/đỏ phao<br/>Sinh danh sách BBox (N ≤ 12)
    FPGA->>MCU: [IF-01] UART 38.400 bps + Xung DATA_READY (Khung Little-Endian + CRC-16)

    Sensors->>MCU: [IF-00] Đo cự ly siêu âm (20–700 cm), góc Roll/Pitch IMU, GNSS Fix
    Note over MCU: Đọc BBox qua Ring Buffer SPSC<br/>Giải bài toán Chiếu tia Ray-Plane<br/>Tính tọa độ Local (cm) & WGS-84 (độ×10⁷)<br/>Đóng gói 32B Little-Endian (CRC-16 byte 0–29)

    MCU->>LoRa_Air: Đẩy 32 byte qua SPI Bus
    LoRa_Air->>LoRa_Gnd: [IF-02] Sóng vô tuyến LoRa 433 MHz (SF7/BW125/CR4-5)

    LoRa_Gnd->>ESP32: Kích hoạt ngắt DIO0, đọc 32B qua SPI + Đọc RSSI/SNR
    Note over ESP32: Kiểm tra CRC-16/CCITT-FALSE<br/>Hiển thị tức thời OLED SSD1306<br/>Đóng gói JSON Envelope v1 (64 hex chars)

    ESP32->>Backend: [IF-03] WebSocket ws://<IP>:8080/telemetry (Wi-Fi STA/SoftAP)
    Note over Backend: esp32_ingress.py giải mã hex<br/>Thẩm định wire schema 32 byte<br/>Cập nhật TelemetryState

    par Ghi cơ sở dữ liệu
        Backend->>SQLite: Commit bản ghi vào kvc_telemetry.db (synchronous=FULL)
    and Phát tán thời gian thực
        Backend->>Frontend: [IF-04] Localhost WebSocket (ws://127.0.0.1:8000/ws/telemetry)
    end

    Note over Frontend: Cập nhật Tactical HUD, Radar local, Bản đồ WGS-84<br/>alertDetector.ts kích hoạt cảnh báo nếu vi phạm an toàn<br/>Ghi vào bảng Nhật ký phiên
```

---

## 4. Quy Tắc Quản Lý & Khóa Giao Thức (Protocol Governance)

1. **Nguyên tắc "Single Source of Truth":** Thư mục `docs/interfaces/` là nơi duy nhất quy định chuẩn kỹ thuật của từng giao diện. Không tạo các bản sao đặc tả rải rác trong thư mục code.
2. **Khóa ABI trước khi ghép nối phần cứng:**
   - Trước khi cắm dây thử nghiệm giữa hai khối bất kỳ (ví dụ FPGA ↔ MCU hoặc MCU ↔ ESP32), thành viên phụ trách hai đầu phải cùng đối chiếu với file đặc tả tương ứng tại đây và xác nhận khớp cấu trúc byte, thứ tự byte (Little-Endian) và thuật toán CRC.
   - ABI RF 32 byte (IF-02) đã được **HUMAN duyệt ngày 29/10/2026**. Mọi thay đổi layout/CRC sau mốc này phải có phê duyệt HUMAN mới.
3. **Quy định thay đổi:** Nghiêm cấm đơn phương thay đổi baudrate, pinout, packet layout hoặc CRC trong code nếu chưa cập nhật và được duyệt tại tài liệu giao diện tương ứng.
4. **Đối chiếu sơ đồ chân Master:** Toàn bộ phân bổ chân, số thứ tự pin và header bo mạch của các giao diện trên phải đối chiếu với [KVC_MASTER_PINOUT_WIRING.md](../hardware/wiring/KVC_MASTER_PINOUT_WIRING.md) trước khi cấp nguồn hoặc đấu nối phần cứng.
