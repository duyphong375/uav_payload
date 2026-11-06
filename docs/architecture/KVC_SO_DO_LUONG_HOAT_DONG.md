# TÀI LIỆU TOÀN TẬP SƠ ĐỒ LUỒNG HOẠT ĐỘNG HỆ THỐNG KVC
## (KVC System Operational Data Flows — From High-Level to Detailed Architecture)

> **Dự án:** Tải Trinh Sát & Cứu Nạn UAV Tìm Kiếm Mục Tiêu Trôi Dạt Vùng Bão Lũ (KVC Payload & GCS)  
> **Cơ quan chủ quản:** Nhóm Nghiên Cứu KVC — Đại học Bách Khoa, Đại học Đà Nẵng  
> **Phiên bản tài liệu:** v2.0 (Chuẩn hóa toàn diện tháng 11/2026)  
> **Phân loại:** Tài liệu Kiến trúc & Luồng dữ liệu kỹ thuật cốt lõi  

---

## MỤC LỤC TỔNG QUAN

1. [Bản Đồ Kiến Trúc Hệ Sinh Thái KVC (System Architecture Overview)](#1-bản-đồ-kiến-trúc-hệ-sinh-thái-kvc)
2. [Sơ Đồ Phân Định Ranh Giới 2 Kênh Độc Lập (Dual-Stream Isolation Topology)](#2-sơ-đồ-phân-định-ranh-giới-2-kênh-độc-lập)
3. [Sơ Đồ Chi Tiết 6 Luồng Hoạt Động (Detailed 6 Operational Flows)](#3-sơ-đồ-chi-tiết-6-luồng-hoạt-động)
   * [Luồng 1: Xử lý Quang học & Thị giác Máy tính trên FPGA](#luồng-1-xử-lý-quang-học--thị-giác-máy-tính-trên-fpga)
   * [Luồng 2: Cảm biến & Định vị Cục bộ trên MCU Payload](#luồng-2-cảm-biến--định-vị-cục-bộ-trên-mcu-payload)
   * [Luồng 3: Viễn thám Vô tuyến Xuyên Mưa Lũ LoRa RF (IF-02)](#luồng-3-viễn-thám-vô-tuyến-xuyên-mưa-lũ-lora-rf-if-02)
   * [Luồng 4: Gateway Trạm Mặt Đất — Chuyển Tiếp Wi-Fi & WebSocket (IF-03)](#luồng-4-gateway-trạm-mặt-đất--chuyển-tiếp-wi-fi--websocket-if-03)
   * [Luồng 5: Trạm Mặt Đất GCS — Ingress, Giám Sát, Cảnh Báo & Hiển Thị (IF-04)](#luồng-5-trạm-mặt-đất-gcs--ingress-giám-sát-cảnh-báo--hiển-thị-if-04)
   * [Luồng 6: Kênh Video Quan Sát Phụ Độc Lập (IF-05 Aux Video)](#luồng-6-kênh-video-quan-sát-phụ-độc-lập-if-05-aux-video)
4. [Sơ Đồ Tuần Tự End-to-End Chu Kỳ 1.000 ms (Sequence Diagram)](#4-sơ-đồ-tuần-tự-end-to-end-chu-kỳ-1000-ms)
5. [Sơ Đồ Máy Trạng Thái Toàn Hệ Thống (Finite State Machines)](#5-sơ-đồ-máy-trạng-thái-toàn-hệ-thống)
6. [Sơ Đồ Xử Lý Sự Cố & Phòng Vệ Fail-Safe (Fault Handling & Redundancy)](#6-sơ-đồ-xử-lý-sự-cố--phòng-vệ-fail-safe)

---

## 1. Bản Đồ Kiến Trúc Hệ Sinh Thái KVC

Hệ sinh thái KVC bao gồm 2 phân hệ độc lập về mặt vật lý: **Cụm Khí tài trên UAV (KVC Airborne Payload)** và **Trạm Điều Khiển Mặt Đất (KVC Ground Station)**.

> [!IMPORTANT]
> **Ranh giới cốt lõi:** Cụm Payload KVC là tải nhiệm vụ quang học và viễn thám cứu nạn chuyên dụng, **hoàn toàn độc lập** với Flight Controller (Pixhawk/ArduPilot) của máy bay. KVC không can thiệp vào mạch điều khiển động cơ hay hành trình bay của UAV.

```mermaid
graph TB
    subgraph AIRBORNE["PHÂN HỆ TRÊN KHÔNG (UAV AIRBORNE PAYLOAD)"]
        direction TB
        subgraph VISION_BLOCK["Cụm Nhận Diện Thị Giác"]
            CAM_OPT["Camera OV2640 DVP<br/>(Quang học RGB565)"]
            FPGA["FPGA Gowin GW1NR-9 (Tang Nano 9K)<br/>• CDC Dual-Clock FIFO<br/>• kvc_blob_detect.v (Lọc màu phao)<br/>• BBox Packetizer"]
            CAM_OPT -->|"IF-CAM: Bus DVP 8-bit<br/>(PCLK 24 MHz, VSYNC, HREF)"| FPGA
        end

        subgraph SENSOR_BLOCK["Cụm Cảm Biến Không Gian"]
            USOUND["Cảm biến Siêu âm AJ-SR04M<br/>(Đo cự ly mặt nước 20–700 cm)"]
            IMU["GY-87 IMU (MPU-6050)<br/>(Roll/Pitch góc nghiêng tải)"]
            GNSS["u-blox NEO-M10 GNSS<br/>(Tọa độ WGS-84 kinh/vĩ độ)"]
        end

        subgraph MCU_BLOCK["Bộ Xử Lý Trung Tâm Tải"]
            MCU["MCU Sonix SN34F788 (Cortex-M0 48 MHz)<br/>• SPSC Ring Buffer UART RX<br/>• Thuật toán Chiếu tia Ray-Plane<br/>• Đóng gói ABI RF v1 32 Byte"]
        end

        subgraph AUX_VIDEO["Cụm Video Bổ Trợ (Kênh Phụ)"]
            CAM_S3["ESP32-S3-CAM + OV3660<br/>(MJPEG 480x320 @ 15–20 FPS)"]
        end

        LORA_AIR["Module LoRa Ra-02 TX<br/>(Semtech SX1278 433 MHz, SPI)"]

        FPGA -->|"IF-01: UART 38.400 bps + DATA_READY<br/>(BBox list, N <= 12, CRC-16)"| MCU
        USOUND -->|"UART 9600 bps"| MCU
        IMU -->|"I2C0 400 kHz"| MCU
        GNSS -->|"UART 9600 bps UBX/NMEA"| MCU
        MCU -->|"SPI Bus (32 Byte / 1 Hz)"| LORA_AIR
    end

    subgraph TELECOMM["KHÔNG GIAN TRUYỀN DẪN VÔ TUYẾN"]
        CH_LORA{{"IF-02: Sóng Vô Tuyến LoRa 433 MHz<br/>(Gói nhị phân 32 byte bất biến)<br/>Xuyên mưa bão, cự ly dài"}}
        CH_WIFI{{"IF-05: Sóng Wi-Fi 2.4 GHz<br/>(HTTP MJPEG port 81)<br/>Cự ly quan sát trực quan gần"}}
    end

    subgraph GROUND["PHÂN HỆ TRẠM MẶT ĐẤT (GROUND STATION)"]
        direction TB
        subgraph GATEWAY_BLOCK["Gateway Cầm Tay Ngoài Hiện Trường"]
            LORA_GND["Module LoRa Ra-02 RX<br/>(SX1278 433 MHz, SPI)"]
            ESP32_GW["ESP32-C3 Gateway (RISC-V 160 MHz)<br/>• Kiểm CRC-16 & đo RSSI/SNR<br/>• Wi-Fi STA / SoftAP Server<br/>• WebSocket Server :8080/telemetry"]
            OLED["Màn hình OLED SSD1306 0.96 inch<br/>(Cứu hộ viên đọc tọa độ tức thì)"]
            
            LORA_GND -->|"SPI + Ngắt DIO0"| ESP32_GW
            ESP32_GW -->|"I2C 400 kHz"| OLED
        end

        subgraph GCS_HOST["Máy Tính Trạm Chỉ Huy (GCS Laptop)"]
            INGRESS["Backend GCS Ingress<br/>(esp32_ingress.py - Client)"]
            SQLITE[("SQLite Database<br/>(WAL Mode, kvc_telemetry.db)")]
            V_RELAY["Video Relay Service<br/>(video_relay.py)"]
            LOCAL_WS["Localhost WebSocket Server<br/>(:8000/ws/telemetry)"]
            DASHBOARD["GCS Tactical Dashboard (React 19)<br/>• Tactical HUD (Pin, Sóng, Độ trễ)<br/>• Bản đồ WGS-84 Leaflet/MapLibre<br/>• Radar Local cự ly gần<br/>• Đồng hồ độ cao tiếp nước<br/>• Bảng phát hiện cảnh báo tự động"]

            INGRESS -->|"Ghi bền vững"| SQLITE
            INGRESS -->|"Phát tán thời gian thực"| LOCAL_WS
            LOCAL_WS -->|"Dữ liệu viễn thám"| DASHBOARD
            V_RELAY -->|"same-origin MJPEG stream"| DASHBOARD
        end
    end

    LORA_AIR ==>|"Phát sóng RF 433 MHz"| CH_LORA
    CH_LORA ==>|"Thu sóng RF 433 MHz"| LORA_GND
    CAM_S3 -.->|"Phát Wi-Fi HTTP"| CH_WIFI
    CH_WIFI -.->|"Thu luồng Video"| V_RELAY

    ESP32_GW -->|"IF-03: Wi-Fi WebSocket JSON Envelope v1"| INGRESS
```

---

## 2. Sơ Đồ Phân Định Ranh Giới 2 Kênh Độc Lập

Nhằm đảm bảo an toàn tuyệt đối cho công tác cứu nạn trong điều kiện mưa bão khắc nghiệt, hệ thống KVC áp dụng nguyên tắc **Dual-Stream Isolation Topology**:

```mermaid
graph LR
    subgraph STREAM_A["LUỒNG A: KÊNH VIỄN THÁM CỨU NẠN SỐNG CÒN (MISSION CRITICAL)"]
        direction TB
        A1["Camera OV2640"] --> A2["FPGA Blob Detect"]
        A2 --> A3["MCU Ray-Plane Georef"]
        A3 --> A4["LoRa SX1278 (433 MHz)"]
        A4 --> A5["ESP32-C3 Gateway"]
        A5 --> A6["GCS Telemetry & WGS-84 Map"]
    end

    subgraph STREAM_B["LUỒNG B: KÊNH VIDEO PHỤ QUAN SÁT TRỰC QUAN (AUXILIARY SIGHT)"]
        direction TB
        B1["Camera OV3660"] --> B2["ESP32-S3-CAM"]
        B2 --> B3["Wi-Fi 2.4 GHz MJPEG"]
        B3 --> B4["GCS Video Relay :81"]
        B4 --> B5["Dashboard Video Panel"]
    end

    STREAM_A -.->|"Cách ly vật lý 100%<br/>Không chia sẻ băng thông"| STREAM_B

    classDef streamA fill:#1e3a8a,stroke:#3b82f6,stroke-width:2px,color:#ffffff;
    classDef streamB fill:#065f46,stroke:#10b981,stroke-width:2px,color:#ffffff;
    class A1,A2,A3,A4,A5,A6 streamA;
    class B1,B2,B3,B4,B5 streamB;
```

> [!CAUTION]
> **4 Nguyên Tắc "Bất Khả Xâm Phạm":**
> 1. **Zero-Video over LoRa:** Băng thông LoRa 125 kHz không thể truyền tải video. Toàn bộ thông tin qua LoRa chỉ là **Metadata nhị phân 32 byte** cố định.
> 2. **Không vẽ đè BBox lên Video phụ (No Overlay):** Cụm camera FPGA (OV2640) và cụm camera phụ (OV3660) khác nhau về vị trí lắp đặt, trục quang học (FOV) và lệch thời gian (latency 100–500 ms). Do đó video phụ tuyệt đối không overlay khung nhận diện từ FPGA để tránh định hướng sai lệch cho cứu hộ viên.
> 3. **Độc lập khi hỏng hóc:** Nếu kênh video phụ mất sóng Wi-Fi do khoảng cách xa hoặc mưa gió, **kênh viễn thám LoRa vẫn hoạt động 100% bình thường**, bảo đảm vị trí nạn nhân luôn được cập nhật liên tục trên bản đồ GCS.
> 4. **Trình duyệt không nối thẳng vào ESP32 Gateway:** Dashboard GCS kết nối qua Backend Python để bảo vệ CPU đơn nhân của ESP32-C3 không bị treo do ngắt mạng WebSocket.

---

## 3. Sơ Đồ Chi Tiết 6 Luồng Hoạt Động

---

### Luồng 1: Xử lý Quang học & Thị giác Máy tính trên FPGA

* **Nhiệm vụ:** Thu nhận luồng pixel tốc độ cao, khử nhiễu bề mặt nước, lọc màu tìm phao cứu sinh/vật thể nổi và đóng gói danh sách Bounding Box gửi sang MCU.

```mermaid
flowchart TD
    subgraph HARDWARE_CAMERA["Cảm Biến Ảnh Quang Học OV2640"]
        CAM["OV2640 Image Sensor<br/>(Cấu hình qua SCCB: RGB565 / VGA)"]
        CAM_BUS["DVP Parallel Bus 8-bit<br/>• PCLK (24 MHz)<br/>• VSYNC (30 Hz Frame Sync)<br/>• HREF (Line Sync)<br/>• D[7:0] (Data Bus)"]
        CAM --> CAM_BUS
    end

    subgraph FPGA_GW1NR9["FPGA Gowin GW1NR-9 (Tang Nano 9K)"]
        subgraph CLK_DOMAIN_CAM["Miền Xung Nhịp Camera (PCLK 24 MHz)"]
            CAP["Khối Bắt Dữ Liệu DVP<br/>(Ghép 2 byte thành 1 pixel RGB565)"]
            CDC_FIFO["Asynchronous Dual-Clock FIFO<br/>(Đồng bộ xung nhịp, triệt tiêu Metastability)"]
            CAM_BUS --> CAP
            CAP --> CDC_FIFO
        end

        subgraph CLK_DOMAIN_SYS["Miền Xung Nhịp Hệ Thống (SYS_CLK 27 MHz)"]
            CDC_FIFO --> READ_FIFO["Đọc Pixel Đồng Bộ"]
            
            subgraph BLOB_CORE["Lõi Xử Lý Thị Giác kvc_blob_detect.v"]
                DECOMPOSE["Phân Tách Kênh Màu<br/>• R = Pixel[15:11] (5 bit)<br/>• G = Pixel[10:5] (6 bit)<br/>• B = Pixel[4:0] (5 bit)"]
                FILTER["Bộ Lọc Tỷ Lệ Màu Phao Cứu Sinh<br/>Điều kiện: (R > G + Thresh) VÀ (R > B + Thresh)<br/>Loại bỏ ánh sáng phản xạ mặt nước"]
                BBOX_TRACK["Bộ Cập Nhật Tọa Độ Vùng Bao<br/>• Tìm Min/Max X, Y của Blob<br/>• Lọc diện tích tối thiểu chống nhiễu hạt"]
                
                READ_FIFO --> DECOMPOSE
                DECOMPOSE --> FILTER
                FILTER --> BBOX_TRACK
            end

            subgraph PACKETIZER["Khối Đóng Gói IF-01 (bbox_packetizer.v)"]
                FSM_PKT["FSM Đóng Gói Nhị Phân<br/>• Header: 0x5A 0xA5, Ver 0x01<br/>• Target Count N (N <= 12)<br/>• Timestamp ms (4 byte)<br/>• N x BBox (Mỗi BBox 8 byte: X, Y, W, H, Conf)<br/>• CRC-16/CCITT-FALSE (2 byte)"]
                UART_TX["UART Transmitter (uart_tx.v)<br/>38.400 bps, 8N1"]
                GPIO_DR["Chân Kích Hoạt Ngắt GPIO<br/>(DATA_READY Pulse)"]

                BBOX_TRACK --> FSM_PKT
                FSM_PKT --> UART_TX
                FSM_PKT --> GPIO_DR
            end
        end
    end

    subgraph MCU_INT["MCU Sonix SN34F788"]
        MCU_RX_PIN["UART1 RX + GPIO Edge Interrupt"]
        UART_TX -->|"Dữ liệu nối tiếp 38.400 bps"| MCU_RX_PIN
        GPIO_DR -->|"Xung báo có dữ liệu"| MCU_RX_PIN
    end
```

---

### Luồng 2: Cảm biến & Định vị Cục bộ trên MCU Payload

* **Nhiệm vụ:** Nhận ngắt UART từ FPGA, kết hợp dữ liệu độ cao siêu âm, góc nghiêng IMU và tọa độ GPS để giải bài toán hình học chiếu tia Ray-Plane, xác định tọa độ WGS-84 của mục tiêu và đóng gói khung ABI 32 byte.

```mermaid
flowchart TD
    subgraph INPUT_STREAMS["Các Luồng Dữ Liệu Đầu Vào"]
        IN_FPGA["Khung BBox UART 38.400 bps<br/>(Nhận qua UART RX ISR -> SPSC Ring Buffer)"]
        IN_USOUND["Độ cao mặt nước AJ-SR04M<br/>(UART2 9600 bps -> Khoảng cách h mặt nước)"]
        IN_IMU["Góc tải GY-87 MPU-6050<br/>(I2C0 400 kHz -> Roll phi, Pitch theta, Yaw psi)"]
        IN_GNSS["Tọa độ UAV NEO-M10 GNSS<br/>(UART3 9600 bps -> Lat_uav, Lon_uav, Alt_msl)"]
    end

    subgraph MCU_CORE["MCU Sonix SN34F788 (Cortex-M0 48 MHz)"]
        PARSER["Bộ Phân Tích & Kiểm Tra Lỗi Khung BBox<br/>• Kiểm tra Header 0x5A 0xA5<br/>• Kiểm tra CRC-16/CCITT-FALSE<br/>• Kiểm tra số mục tiêu N <= 12"]
        IN_FPGA --> PARSER

        GEOREF["Thuật Toán Chiếu Tia Ray-Plane (kvc_georef.c)<br/>1. Biến đổi tọa độ ảnh (u, v) sang Vector tia trong Camera Frame:<br/>   V_cam = [ (u - cx)/fx, (v - cy)/fy, 1 ]^T<br/>2. Quay qua Ma Trận Thái Độ R(phi, theta, psi) sang Body Frame<br/>3. Cắt mặt phẳng nước Z = -h (đo từ siêu âm):<br/>   X_local = -h * Vx / Vz ; Y_local = -h * Vy / Vz<br/>4. Chiếu sang Tọa Độ Trắc Địa Toàn Cầu WGS-84:<br/>   Lat_target = Lat_uav + (Y_local / R_earth) * (180 / pi)<br/>   Lon_target = Lon_uav + (X_local / (R_earth * cos(Lat))) * (180 / pi)"]

        PARSER --> GEOREF
        IN_USOUND --> GEOREF
        IN_IMU --> GEOREF
        IN_GNSS --> GEOREF

        BUILD_ABI["Khối Đóng Gói ABI RF v1 (Đúng 32 Byte Bất Biến)<br/>• Byte 0..1: Sync 0xAA 0x55<br/>• Byte 2: Msg Type (0x01 Telemetry)<br/>• Byte 3..6: Timestamp (ms)<br/>• Byte 7..10: Target Latitude (WGS-84 deg x 10^7)<br/>• Byte 11..14: Target Longitude (WGS-84 deg x 10^7)<br/>• Byte 15..16: Target Local X (cm)<br/>• Byte 17..18: Target Local Y (cm)<br/>• Byte 19..20: Distance to Water (cm, Siêu âm)<br/>• Byte 21: Pitch (deg + 90 offset)<br/>• Byte 22: Roll (deg + 90 offset)<br/>• Byte 23..24: Target Area (px, từ FPGA Blob)<br/>• Byte 25: status_reserved = 0x00<br/>• Byte 26: Target Count (N <= 12)<br/>• Byte 27..28: Error Status Flags (Bitmask)<br/>• Byte 29: Sequence ID (0..255)<br/>• Byte 30..31: CRC-16/CCITT-FALSE (tính trên Byte 0..29)"]

        GEOREF --> BUILD_ABI
        SPI_TX["Khối Giao Tiếp SPI Master<br/>(Đẩy 32 byte sang Ra-02 theo nhịp 1 Hz)"]
        BUILD_ABI --> SPI_TX
    end

    subgraph RF_AIR["Module LoRa SX1278 (Ra-02 Air)"]
        LORA_FIFO["Nạp gói tin vào Tx FIFO và kích hoạt cờ TX_START"]
        SPI_TX --> LORA_FIFO
    end
```

---

### Luồng 3: Viễn thám Vô tuyến Xuyên Mưa Lũ LoRa RF (IF-02)

* **Nhiệm vụ:** Truyền phát gói tin 32 byte qua tầng vật lý vô tuyến 433 MHz, đảm bảo khả năng xuyên qua mưa lũ bão lốc và cự ly xa mà mạng Wi-Fi/4G không thể đáp ứng.

```mermaid
flowchart LR
    subgraph TX_SIDE["Đầu Phát Trên UAV (Airborne TX)"]
        MCU_SPI["MCU SN34F788<br/>SPI Master"]
        RA02_TX["LoRa Ra-02 (SX1278)<br/>• Tần số: 433.00 MHz<br/>• Spreading Factor: SF7<br/>• Băng thông: BW 125 kHz<br/>• Mã sửa lỗi: CR 4/5<br/>• Công suất phát: +18 dBm<br/>• Preamble: 8 symbol"]
        ANT_TX["Anten LoRa 433 MHz<br/>(Monopole / Dipole phân cực đứng)"]

        MCU_SPI -->|"SPI Write (32 Byte)"| RA02_TX
        RA02_TX --> ANT_TX
    end

    subgraph RF_MEDIUM["Môi Trường Không Gian Truyền Sóng"]
        PROPAGATION{{"Sóng Vô Tuyến 433 MHz (Băng UHF)<br/>• Khả năng nhiễu xạ qua địa hình tốt<br/>• Độ suy hao trong mưa bão thấp<br/>• Airtime gói 32 byte: ~62 ms / 1.000 ms (Duty cycle ~6.2%)"}}
        ANT_TX ==> PROPAGATION
    end

    subgraph RX_SIDE["Đầu Thu Trạm Đất (Ground RX)"]
        ANT_RX["Anten Thu 433 MHz"]
        RA02_RX["LoRa Ra-02 (SX1278 RX)<br/>• Nhận khung vô tuyến<br/>• Tự động tính RSSI & SNR<br/>• Kích hoạt xung ngắt DIO0"]
        ESP32_SPI["ESP32-C3 Gateway<br/>SPI Master (Đọc 32 byte + RSSI/SNR)"]

        PROPAGATION ==> ANT_RX
        ANT_RX --> RA02_RX
        RA02_RX -->|"Ngắt chân DIO0 (Packet Ready)"| ESP32_SPI
        RA02_RX -->|"SPI Read Register"| ESP32_SPI
    end
```

---

### Luồng 4: Gateway Trạm Mặt Đất — Chuyển Tiếp Wi-Fi & WebSocket (IF-03)

* **Nhiệm vụ:** ESP32-C3 tiếp nhận khung LoRa, xác thực toàn vẹn CRC-16, hiển thị ngay lên OLED tại hiện trường, đóng gói JSON Transport Envelope v1 và phát tán qua mạng Wi-Fi/WebSocket.

```mermaid
flowchart TD
    subgraph ESP32_INTERNAL["Phần Cứng & Firmware ESP32-C3 Gateway"]
        INT_DIO0["Ngắt Chân DIO0 từ LoRa RX"]
        SPI_READ["Đọc 32 Byte nhị phân từ SX1278 FIFO + Đọc thanh ghi RSSI, SNR"]
        INT_DIO0 --> SPI_READ

        CRC_CHECK{"Kiểm tra CRC-16/CCITT-FALSE<br/>(Đa thức 0x1021, Init 0xFFFF)<br/>Byte 30..31 == Calc_CRC(Byte 0..29)?"}
        SPI_READ --> CRC_CHECK

        CRC_FAIL["Đánh Dấu Lỗi:<br/>• Tăng biến rx_drop_count<br/>• Ghi log Serial: 'CRC Mismatch'<br/>• Bỏ qua gói hỏng, không treo FSM"]
        CRC_CHECK -- "Sai CRC" --> CRC_FAIL

        CRC_OK["Gói Tin Toàn Vẹn Hợp Lệ"]
        CRC_CHECK -- "Đúng CRC" --> CRC_OK

        subgraph FIELD_OLED["Màn Hình Cầm Tay Ngoài Hiện Trường"]
            OLED_UPDATE["Cập Nhật Màn Hình OLED SSD1306 (I2C 400 kHz)<br/>• Dòng 1: RSSI: -85dBm | SNR: +8dB<br/>• Dòng 2: Lat: 16.0728912<br/>• Dòng 3: Lon: 108.1539201<br/>• Dòng 4: Target: 01 | Alt: 4.8m | OK"]
        end
        CRC_OK --> OLED_UPDATE

        subgraph NET_POLICY["Chính Sách Kết Nối Mạng Wi-Fi (net_policy.cpp)"]
            POLICY_DECIDE{"Đã kết nối Wi-Fi Router (STA Mode) thành công?"}
            STA_ACTIVE["Ưu Tiên 1: Chế Độ STA (Station Mode)<br/>Hoạt động trong mạng LAN của Ban Chỉ Huy"]
            AP_ACTIVE["Ưu Tiên 2 (Fallback): Chế Độ SoftAP<br/>Phát Wi-Fi riêng: 'KVC_GROUND_STATION'<br/>IP tĩnh: 192.168.4.1 (Không cần Router ngoài)"]

            POLICY_DECIDE -- "Có sóng Router" --> STA_ACTIVE
            POLICY_DECIDE -- "Mất Router / Hiện trường" --> AP_ACTIVE
        end
        CRC_OK --> NET_POLICY

        subgraph WS_SERVER["Máy Chủ WebSocket Server (ws_route.cpp)"]
            HEX_CONVERT["Mã Hóa 32 Byte Thành 64 Hex Characters<br/>rf_payload_hex = 'AA5501...'"]
            JSON_ENVELOPE["Đóng Gói Khung Transport Envelope v1 JSON:<br/>{<br/>  'transport_version': 1,<br/>  'gateway_session_id': 'GW_KVC_01',<br/>  'gateway_sequence': 142,<br/>  'rx_monotonic_ms': 854210,<br/>  'rf_payload_hex': 'AA5501...',<br/>  'rssi_dbm': -82,<br/>  'snr_db': 7.5,<br/>  'rx_drop_count': 0<br/>}"]
            BROADCAST["Phát Broadcast tới WebSocket Clients<br/>Endpoint: ws://<IP>:8080/telemetry"]

            HEX_CONVERT --> JSON_ENVELOPE
            JSON_ENVELOPE --> BROADCAST
        end
        STA_ACTIVE --> HEX_CONVERT
        AP_ACTIVE --> HEX_CONVERT
    end

    subgraph CLIENT_SIDE["Laptop Trạm GCS"]
        GCS_CLIENT["gcs/backend Ingress Client (esp32_ingress.py)<br/>Chủ động kết nối WebSocket vào ESP32 Gateway"]
        BROADCAST -->|"Kênh Wi-Fi 2.4 GHz (JSON TCP)"| GCS_CLIENT
    end
```

---

### Luồng 5: Trạm Mặt Đất GCS — Ingress, Giám Sát, Cảnh Báo & Hiển Thị (IF-04)

* **Nhiệm vụ:** Backend Laptop tiếp nhận luồng WebSocket từ Gateway, xác minh schema, ghi cơ sở dữ liệu SQLite chống mất mát dữ liệu, và phát tán thời gian thực sang giao diện Frontend React Dashboard với đầy đủ công cụ cứu hộ chuyên nghiệp.

```mermaid
flowchart TD
    subgraph BACKEND_ENGINE["GCS Backend Service (Python FastAPI)"]
        INGRESS["WebSocket Ingress Worker (esp32_ingress.py)<br/>• Tự động kết nối lại nếu mất mạng (Backoff Reconnect)<br/>• Giải mã 64 hex characters thành 32 byte nhị phân<br/>• Thẩm định ABI RF v1 Wire Schema"]

        DB_WORKER["SQLite Logger (sqlite_logger.py)<br/>• Chế độ WAL (Write-Ahead Logging)<br/>• PRAGMA synchronous = FULL<br/>• Lưu vết tuyệt đối vào kvc_telemetry.db"]

        STATE_MGR["Quản Lý Trạng Thái Toàn Cục (state.py)<br/>• Lưu trữ TelemetryState mới nhất<br/>• Tính toán trôi dạt (Drift), lịch sử tọa độ"]

        LOCAL_WS_PUB["Localhost WebSocket Broadcaster<br/>Endpoint: ws://127.0.0.1:8000/ws/telemetry"]

        INGRESS --> DB_WORKER
        INGRESS --> STATE_MGR
        STATE_MGR --> LOCAL_WS_PUB
    end

    subgraph FRONTEND_DASHBOARD["GCS Tactical Dashboard (React 19 + TypeScript + Vite)"]
        direction TB
        WS_CLIENT["Frontend Telemetry Client (telemetryClient.ts)<br/>Nhận JSON Payload thời gian thực từ Localhost WS"]
        REDUCER["Mission State Reducer (missionReducer.ts)<br/>Cập nhật Store: Detections, SensorFlags, Alerts, Stats"]

        WS_CLIENT --> REDUCER

        subgraph UI_TACTICAL_COMPONENTS["Các Module Giao Diện Trinh Sát"]
            HUD["Tactical HUD & TopStatCards<br/>• Mức sóng RSSI/SNR LoRa<br/>• Trạng thái GNSS Fix & Số vệ tinh<br/>• Nhịp tim hệ thống & Độ trễ gói"]
            MAP2D["Bản Đồ Bản Quyền WGS-84 (Map2DView.tsx)<br/>• Vị trí UAV & Hướng đầu mũi máy bay<br/>• Vị trí Nạn nhân / Phao cứu sinh<br/>• Vệt quỹ đạo bay & Bán kính sai số"]
            RADAR["Radar Cục Bộ (LocalRadarPanel.tsx)<br/>• Hiển thị cự ly cực (Polar 360 độ)<br/>• Khoảng cách tương đối X, Y (cm)"]
            GAUGE["Đồng Hồ Tiếp Nước (WaterClearanceGauge.tsx)<br/>• Cảnh báo độ cao an toàn siêu âm (ngưỡng 2.0m)"]
            ALERT_DETECTOR["Bộ Giám Sát Cảnh Báo Tự Động (alertDetector.ts)<br/>• Cảnh báo IMU lật nghiêng quá 45 độ<br/>• Cảnh báo UAV rơi tự do / Mất độ cao<br/>• Cảnh báo Timeout mất tín hiệu LoRa (> 3s)<br/>• Cảnh báo phát hiện mục tiêu mới"]
        end

        REDUCER --> HUD
        REDUCER --> MAP2D
        REDUCER --> RADAR
        REDUCER --> GAUGE
        REDUCER --> ALERT_DETECTOR
    end

    LOCAL_WS_PUB -->|"Localhost WebSocket Event Stream"| WS_CLIENT
```

---

### Luồng 6: Kênh Video Quan Sát Phụ Độc Lập (IF-05 Aux Video)

* **Nhiệm vụ:** Truyền phát hình ảnh trực quan góc nhìn người cứu hộ (FPV) từ camera phụ OV3660 qua Wi-Fi trực tiếp về laptop, phục vụ cứu hộ viên quan sát bối cảnh dòng nước cuốn mà không ảnh hưởng tới kênh viễn thám LoRa.

```mermaid
flowchart TD
    subgraph AIR_CAM_NODE["Cụm Camera Phụ Trên UAV"]
        OV3660["Cảm Biến Ảnh CMOS OV3660 (Góc Rộng)"]
        ESP32_S3["Module ESP32-S3-CAM (Dual-Core Xtensa LX7)<br/>• Nén phần cứng JPEG DMA<br/>• Cấu hình: Độ phân giải HVGA (480x320)<br/>• Chất lượng nén: Quality 22–26 (Cân bằng băng thông/nét)<br/>• Tốc độ khung hình: 15–20 FPS"]
        WIFI_CAM["Wi-Fi Radio 2.4 GHz<br/>(Chạy HTTP Server MJPEG trên cổng 81)"]

        OV3660 --> ESP32_S3
        ESP32_S3 --> WIFI_CAM
    end

    subgraph WIRELESS_LINK["Kênh Truyền Wi-Fi Cự Ly Gần"]
        STREAM_HTTP{{"Luồng HTTP Multipart MJPEG Stream<br/>URL: http://192.168.4.2:81/stream<br/>Độ trễ kính ngắm: ~120–250 ms"}}
        WIFI_CAM ==> STREAM_HTTP
    end

    subgraph GCS_LAPTOP["Máy Tính Trạm GCS"]
        RELAY_SVC["Dịch Vụ Chuyển Tiếp Backend (video_relay.py)<br/>• Duy trì 1 kết nối Upstream duy nhất tới Camera<br/>• Phục vụ Fan-out Same-Origin cho Trình duyệt<br/>• Tránh làm cạn kiệt socket của ESP32-S3"]

        VIDEO_PANEL["Khung Video Trình Duyệt GCS (VideoPanel.tsx)<br/>• Nhúng thẻ img src='/api/video/stream'<br/>• Tuyệt đối KHÔNG vẽ BBox đè lên ảnh (No Overlay)<br/>• Cung cấp nút chụp ảnh tĩnh hiện trường"]

        STREAM_HTTP ==> RELAY_SVC
        RELAY_SVC -->|"Local Same-Origin HTTP Stream"| VIDEO_PANEL
    end
```

---

## 4. Sơ Đồ Tuần Tự End-to-End Chu Kỳ 1.000 ms

Biểu đồ tuần tự thời gian thực mô tả trọn vẹn hành trình của một gói tin từ khi phao cứu sinh lọt vào tầm nhìn của camera trên máy bay cho tới khi hiển thị trên màn hình GCS:

```mermaid
sequenceDiagram
    autonumber
    actor Target as Phao/Người Cứu Nạn
    participant Cam as OV2640 DVP
    participant FPGA as FPGA GW1NR-9
    participant MCU as MCU Sonix SN34F788
    participant Sensors as Cảm Biến (Siêu Âm/IMU/GNSS)
    participant LoRa_Air as LoRa SX1278 (TX)
    participant LoRa_Gnd as LoRa SX1278 (RX)
    participant Gateway as ESP32-C3 Gateway
    participant Backend as Laptop GCS Backend
    participant SQLite as Database SQLite
    participant Frontend as GCS Dashboard UI

    Note over Target,Frontend: BẮT ĐẦU CHU KỲ NHỊP THỜI GIAN THỰC (T = 0 ms .. 1000 ms)

    rect rgb(240, 248, 255)
        Note over Target,FPGA: Giai đoạn 1: Thu ảnh & Xử lý Thị giác (~33 ms)
        Target->>Cam: Phản xạ ánh sáng màu cam/đỏ trên nền nước đục
        Cam->>FPGA: [IF-CAM] Luồng DVP 8-bit (PCLK, VSYNC, HREF)
        Note over FPGA: kvc_blob_detect.v tách kênh màu<br/>Lọc tỷ lệ: R > G + 15 và R > B + 15<br/>Tính Bounding Box Blob mục tiêu
        FPGA->>MCU: [IF-01] Gửi UART 38.400 bps + Nháy xung DATA_READY (Khung BBox + CRC-16)
    end

    rect rgb(255, 250, 240)
        Note over MCU,Sensors: Giai đoạn 2: Định vị & Đóng gói Cứu nạn (~15 ms)
        Sensors->>MCU: Đọc cự ly nước h (Siêu âm), góc nghiêng phi/theta (IMU), tọa độ UAV (GNSS)
        Note over MCU: Nhận BBox qua Ring Buffer SPSC<br/>Giải thuật Chiếu tia Ray-Plane:<br/>• Chiếu pixel (u, v) xuống mặt nước Z = -h<br/>• Tính tọa độ Local (cm) và WGS-84 (độ)<br/>Đóng gói ABI RF v1 (32 byte Little-Endian)<br/>Tính toán CRC-16/CCITT-FALSE
        MCU->>LoRa_Air: Ghi 32 byte vào FIFO qua SPI Bus
    end

    rect rgb(245, 255, 245)
        Note over LoRa_Air,LoRa_Gnd: Giai đoạn 3: Viễn thám Vô tuyến LoRa (~62 ms Airtime)
        LoRa_Air->>LoRa_Gnd: [IF-02] Phát sóng RF 433 MHz (SF7, BW 125 kHz, CR 4/5)
        Note over LoRa_Gnd: Thu nhận trọn vẹn 32 byte<br/>Đo công suất sóng RSSI (dBm) & SNR (dB)<br/>Kích hoạt ngắt DIO0 Packet Ready
    end

    rect rgb(255, 245, 255)
        Note over Gateway,Backend: Giai đoạn 4: Gateway Chuyển Tiếp Wi-Fi (~10 ms)
        LoRa_Gnd->>Gateway: Đọc 32 byte qua SPI Bus
        Note over Gateway: Kiểm tra tính toàn vẹn CRC-16<br/>Hiển thị tức thời OLED SSD1306<br/>Đóng gói JSON Transport Envelope v1
        Gateway->>Backend: [IF-03] Gửi WebSocket (ws://192.168.4.1:8080/telemetry)
    end

    rect rgb(240, 255, 255)
        Note over Backend,Frontend: Giai đoạn 5: Lưu trữ & Hiển thị Chỉ huy (~5 ms)
        Note over Backend: esp32_ingress.py giải mã hex<br/>Kiểm tra schema và trạng thái
        par Lưu trữ bền vững
            Backend->>SQLite: Commit bản ghi vào kvc_telemetry.db (synchronous=FULL)
        and Phát tán giao diện
            Backend->>Frontend: [IF-04] Phát WebSocket localhost (ws://127.0.0.1:8000/ws/telemetry)
        end
        Note over Frontend: Cập nhật vị trí mục tiêu lên Bản đồ WGS-84<br/>Vẽ Radar cự ly gần & Cập nhật độ cao tiếp nước<br/>Kích hoạt cảnh báo âm thanh nếu lật nghiêng
    end

    Note over Target,Frontend: KẾT THÚC CHU KỲ (Tổng trễ End-to-End: ~125 ms << 1.000 ms)
```

---

## 5. Sơ Đồ Máy Trạng Thái Toàn Hệ Thống

Để đảm bảo hệ thống không bao giờ bị rơi vào trạng thái "treo" (Deadlock) ngoài hiện trường, các bộ điều khiển đều tuân thủ máy trạng thái hữu hạn (FSM) chặt chẽ:

### A. Máy Trạng Thái MCU Payload (kvc_timebase.c)

```mermaid
stateDiagram-v2
    [*] --> STATE_BOOT: Cấp nguồn 5V
    STATE_BOOT --> STATE_SENSOR_INIT: Khởi tạo I2C0, UART1, UART2, UART3, SPI
    STATE_SENSOR_INIT --> STATE_WARMUP: Chờ GNSS Fix & Cảm biến ổn định (3 giây)
    
    STATE_WARMUP --> STATE_IDLE_POLL: Bước vào chu kỳ nhịp 1 Hz
    
    state STATE_IDLE_POLL {
        [*] --> READ_UART_BBOX: Kiểm tra cờ ngắt DATA_READY từ FPGA
        READ_UART_BBOX --> READ_SENSORS: Đọc Siêu âm mặt nước + IMU 6-trục
        READ_SENSORS --> GEOREF_CALC: Giải toán chiếu tia Ray-Plane
        GEOREF_CALC --> ASSEMBLE_PACKET: Đóng gói khung 32B + Tính CRC-16
        ASSEMBLE_PACKET --> [*]
    }

    STATE_IDLE_POLL --> STATE_LORA_TRANSMIT: Kích hoạt truyền SPI LoRa
    STATE_LORA_TRANSMIT --> STATE_WAIT_TX_DONE: Chờ cờ TX_DONE (Tối đa 100 ms)
    
    STATE_WAIT_TX_DONE --> STATE_SLEEP_WINDOW: TX Thành công
    STATE_WAIT_TX_DONE --> STATE_HANDLE_TIMEOUT: Hết 100 ms không thấy TX_DONE
    
    STATE_HANDLE_TIMEOUT --> STATE_SLEEP_WINDOW: Reset phần cứng SX1278 & Bỏ qua
    STATE_SLEEP_WINDOW --> STATE_IDLE_POLL: Đồng hồ SysTick báo hết chu kỳ 1.000 ms
```

---

### B. Máy Trạng Thái Gateway ESP32-C3 (main.cpp & net_policy.cpp)

```mermaid
stateDiagram-v2
    [*] --> GW_BOOT: Khởi động ESP32-C3
    GW_BOOT --> GW_RADIO_INIT: Khởi tạo SPI LoRa SX1278 + OLED SSD1306
    GW_RADIO_INIT --> GW_NET_CONNECT: Khởi động Quản lý Mạng net_policy

    state GW_NET_CONNECT {
        [*] --> TRY_STA: Thử kết nối Wi-Fi Router (STA Mode)
        TRY_STA --> STA_SUCCESS: Bắt được sóng Wi-Fi (Có IP LAN)
        TRY_STA --> FALLBACK_AP: Timeout 5 giây không thấy Router
        FALLBACK_AP --> AP_READY: Kích hoạt SoftAP 'KVC_GROUND_STATION' (192.168.4.1)
    }

    GW_NET_CONNECT --> GW_RUNNING: Mở cổng WebSocket Server :8080/telemetry

    state GW_RUNNING {
        [*] --> WAIT_DIO0: Đợi ngắt DIO0 từ LoRa RX
        WAIT_DIO0 --> READ_PACKET: Đọc 32B nhị phân + RSSI/SNR qua SPI
        READ_PACKET --> VALIDATE_CRC: Kiểm tra CRC-16
        
        VALIDATE_CRC --> DROP_PACKET: CRC Sai -> Tăng rx_drop_count
        VALIDATE_CRC --> PROCESS_PACKET: CRC Đúng -> Hiển thị OLED
        
        PROCESS_PACKET --> WS_BROADCAST: Đóng gói JSON Envelope v1 -> Bắn tới GCS Laptop
        DROP_PACKET --> WAIT_DIO0
        WS_BROADCAST --> WAIT_DIO0
    }
```

---

## 6. Sơ Đồ Xử Lý Sự Cố & Phòng Vệ Fail-Safe

Hệ thống được thiết kế theo tư duy phòng thủ (Defensive Engineering) để đối phó với mọi tình huống bất trắc ngoài hiện trường thiên tai:

```mermaid
flowchart TD
    subgraph FAULT_DETECTION["Phát Hiện Sự Cố & Nguy Cơ"]
        F1["Mất Tín Hiệu GNSS / GPS Trôi Dạt<br/>(GNSS Fix Lost / HDOP > 5.0)"]
        F2["Mất Liên Lạc LoRa Vô Tuyến<br/>(Timeout > 3.000 ms không có gói tin)"]
        F3["UAV Lật Nghiêng Quá Mức Trong Gió Lốc<br/>(Góc Roll hoặc Pitch > 45 độ)"]
        F4["Nguy Cơ Rơi Xuống Nước / Va Chạm<br/>(Cự ly siêu âm h < 1.0 m)"]
        F5["Mất Kết Nối Kênh Video Phụ Wi-Fi IF-05"]
    end

    subgraph DEFENSE_ACTIONS["Cơ Chế Tự Động Ứng Phó (Fail-Safe Defense)"]
        A1["Bật Cờ Cảnh Báo WARN_GPS_LOST trong Byte 27 Status Flags<br/>• Bản đồ GCS chuyển sang chế độ nội suy Dead-Reckoning<br/>• Khóa vị trí mục tiêu cuối cùng (Hold Last Known Position)"]
        A2["GCS Kích Hoạt Báo Động Âm Thanh & Đổi Màu HUD Sang Đỏ<br/>• Gateway ESP32 hiển thị 'LORA LOST' trên màn hình OLED<br/>• Hệ thống không treo, tiếp tục lắng nghe trên kênh vô tuyến"]
        A3["Kích Hoạt IMU Tilt Handler (alertDetector.ts)<br/>• Loại bỏ kết quả Georeferencing (Vì góc chiếu tia quá xiên)<br/>• Gửi cảnh báo rung/chuông yêu cầu người lái cân bằng tải"]
        A4["Phát Cảnh Báo Nguy Hiểm Cực Độ 'CRITICAL_WATER_LOW'<br/>• Đồng hồ WaterClearanceGauge nhấp nháy đỏ rực<br/>• Phát âm cảnh báo khẩn cấp cho chỉ huy bay"]
        A5["Tự Động Bỏ Qua Kênh Video Phụ<br/>• Giao diện hiển thị thông báo 'Aux Video Offline'<br/>• Toàn bộ kênh Telemetry LoRa vẫn dẫn đường cứu nạn 100%"]
    end

    F1 ==> A1
    F2 ==> A2
    F3 ==> A3
    F4 ==> A4
    F5 ==> A5

    classDef danger fill:#7f1d1d,stroke:#ef4444,stroke-width:2px,color:#ffffff;
    classDef action fill:#14532d,stroke:#22c55e,stroke-width:2px,color:#ffffff;
    class F1,F2,F3,F4,F5 danger;
    class A1,A2,A3,A4,A5 action;
```

---

## 7. Bảng Tổng Hợp Thông Số Kỹ Thuật 6 Giao Diện

| Ký Hiệu | Tên Giao Diện | Giao Thức Vật Lý | Băng Thông / Tần Suất | Dữ Liệu Trao Đổi | Trạng Thái Kiểm Thử |
| :---: | :--- | :--- | :---: | :--- | :---: |
| **IF-CAM** | Camera Quang Học ➔ FPGA | Song song DVP 8-bit | 24 MHz / 30 FPS | Pixel thô RGB565 / VGA 640×480 | `SIMULATED` |
| **IF-00** | Cảm Biến ➔ MCU Payload | I2C0 400kHz, UART 9600 | 1–10 Hz | Độ cao siêu âm, Góc IMU, Tọa độ GPS | `SIMULATED` (65/65 PASS) |
| **IF-01** | FPGA ➔ MCU Payload | UART 38.400 bps + GPIO ngắt | 5–30 FPS | Khung danh sách BBox ($N \le 12$) + CRC-16 | **`HARDWARE-VERIFIED`** |
| **IF-02** | MCU Payload ➔ Gateway Trạm Đất | Sóng vô tuyến LoRa 433 MHz | 1 Hz (32 Byte cố định) | ABI RF v1 Little-Endian + CRC-16 | **`HARDWARE-VERIFIED`** |
| **IF-03** | Gateway Trạm Đất ➔ Laptop GCS | Wi-Fi 2.4 GHz + WebSocket | 1 Hz | JSON Transport Envelope v1 (64 hex chars) | `SOURCE-VERIFIED` (Host tests PASS) |
| **IF-04** | Backend GCS ➔ Frontend Dashboard | Localhost HTTP REST + WS | 1 Hz | JSON TelemetryState, Events & Alerts | `SOURCE-VERIFIED` (209 vitests + 99 pytests PASS) |
| **IF-05** | ESP32-S3-CAM ➔ GCS Video Panel | Wi-Fi 2.4 GHz HTTP MJPEG | 15–20 FPS (port 81) | Video phụ HVGA 480×320 (Không BBox overlay) | `SOURCE-VERIFIED` (Firmware built exit 0) |

---
*Tài liệu được biên soạn và bảo chứng kỹ thuật bởi Nhóm Kỹ sư Nghiên cứu Hệ thống KVC (Đại học Bách Khoa, Đại học Đà Nẵng) — Tháng 11/2026.*
