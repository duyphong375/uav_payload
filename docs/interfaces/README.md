# KVC — Ma trận và danh mục giao diện toàn hệ thống (Interfaces)

Tài liệu này quản lý tập trung toàn bộ các giao diện kết nối (hợp đồng kỹ thuật / ABI) giữa các phân hệ trong hệ thống KVC. Mọi thay đổi về giao thức, cấu trúc gói tin, baudrate, pinout hoặc CRC phải được cập nhật tại thư mục này trước khi triển khai trên phần cứng.

---

## 1. Sơ đồ luồng dữ liệu toàn hệ thống

```text
[ Camera Quang Học ]
        │ (camera interface TBD; theo board/camera đã xác minh)
        ▼
[ FPGA OneKiwi Primer 20K (Vững) ]
        │
        │  IF-01: UART BBox Frame (115.200 bps, Header 0x5A 0xA5, CRC-16)
        ▼
[ MCU Tải Sonix SN34F788 (Phong) ] ◄── Cảm biến: Siêu âm (AJ-SR04M), IMU (GY-87), GNSS (NEO-M10N)
        │
        │  IF-02: LoRa 433 MHz RF Packet (Ra-02 SX1278, Telemetry Metadata)
        ▼
[ ESP32-C3 Gateway Trạm Đất (Thịnh; kit/board TBD) ] (Nguồn riêng độc lập, chạy Wi-Fi SoftAP & WebSocket Server)
        │
        │  IF-03: Wi-Fi SoftAP / WebSocket Telemetry Stream (endpoint còn chờ đối chiếu)
        ▼
[ Backend GCS Python trên Laptop (Thịnh) ] (FastAPI đóng vai trò WebSocket Client hứng stream, ghi SQLite WAL)
        │
        │  IF-04: WebSocket Server nội bộ Host (ws://127.0.0.1:8000/ws/telemetry) + REST API
        ▼
[ Trình duyệt Web GCS Dashboard (Thịnh) ] (React + Vite + TypeScript vẽ Radar, Map, Cảnh báo)
```

> **LƯU Ý QUAN TRỌNG VỀ TOPOLOGY:**
> - ESP32 trạm đất phát Wi-Fi SoftAP và chạy WebSocket Server.
> - **Backend Python trên laptop kết nối tới WebSocket Server của ESP32** để thu nhận dữ liệu thô, giải mã và ghi vào SQLite.
> - **Dashboard trên trình duyệt web kết nối với Backend Python trên laptop**, **TUYỆT ĐỐI KHÔNG** kết nối trực tiếp từ trình duyệt tới ESP32 nhằm tránh quá tải tài nguyên vi điều khiển và bảo đảm 100% dữ liệu được ghi log phục vụ tính năng Replay.
> - Endpoint mục tiêu theo mục IV.4 thiết kế và IF-03 là `ws://192.168.4.1:8080/telemetry`. Đây là baseline DESIGN, chưa có firmware/capture để xác minh; không coi là endpoint đã chạy.

---

## 2. Danh mục chi tiết các giao diện (Interface Catalog)

| Mã giao diện | Tên giao diện | Đầu phát (TX / Server) | Đầu nhận (RX / Client) | Kênh vật lý / Transport | Tài liệu đặc tả chi tiết |
| :---: | :--- | :--- | :--- | :--- | :--- |
| **IF-CAM**| Luồng ảnh thô quang học từ Camera | Cụm camera (model TBD; **Kiên**) | FPGA OneKiwi (**Vững**) | Giao diện/cáp/connector TBD; cần xác minh theo board và camera thực | [IF_CAMERA_FPGA.md](IF_CAMERA_FPGA.md) |
| **IF-00** | Cảm biến định vị tải UAV (Siêu âm AJ-SR04M, IMU, GNSS) | Cụm cảm biến (**Cường / Kiên**) | MCU Sonix (**Phong**) | UART (AJ-SR04M 9k6, GNSS 9k6), I2C (GY-87 400k) | [IF_MCU_SENSORS.md](IF_MCU_SENSORS.md) |
| **IF-01** | Khung kết quả nhận diện BBox | FPGA OneKiwi (**Vững**) | MCU Sonix (**Phong**) | UART 3.3V CMOS (115.200 bps, 8N1) + Chân ngắt DATA_READY | [IF_FPGA_MCU_UART.md](IF_FPGA_MCU_UART.md) |
| **IF-02** | Gói tin telemetry vô tuyến cứu nạn | MCU Sonix (**Phong**) | ESP32 Trạm Đất (**Thịnh**) | Sóng vô tuyến LoRa 433 MHz (SX1278 Ra-02, SPI) | [IF_MCU_LORA_RF.md](IF_MCU_LORA_RF.md) |
| **IF-03** | Luồng telemetry từ Trạm đất sang Host | ESP32 Trạm Đất (**Thịnh**) | Backend GCS Laptop (**Thịnh**) | Wi-Fi 802.11 b/g/n (SoftAP) + WebSocket Protocol | [IF_ESP32_GCS_WS.md](IF_ESP32_GCS_WS.md) |
| **IF-04** | Dữ liệu ứng dụng GCS Host nội bộ | Backend GCS FastAPI | Frontend Dashboard Web | Localhost HTTP / WebSocket (`ws://127.0.0.1:8000/ws/telemetry`) | [IF_GCS_DATA_CONTRACT.md](IF_GCS_DATA_CONTRACT.md) — **nguồn chuẩn route**; semantics tại [KVC_GCS_DATA_CONTRACT.md](KVC_GCS_DATA_CONTRACT.md) |

---

## 3. Quy tắc quản lý và khóa giao thức (Protocol Governance)

1. **Nguyên tắc "Single Source of Truth":** Thư mục này là nơi lưu giữ duy nhất quy chuẩn kỹ thuật của từng giao diện. Không tạo các bản sao đặc tả rải rác trong thư mục code.
2. **Khóa ABI trước khi ghép nối:** Trước khi cắm dây thử nghiệm giữa hai khối bất kỳ (ví dụ FPGA ↔ MCU hoặc MCU ↔ ESP32), hai thành viên phụ trách hai đầu phải cùng đối chiếu với file đặc tả tương ứng tại đây và xác nhận khớp cấu trúc byte, thứ tự byte (Endianness) và thuật toán CRC. IF-02 (RF 32 byte) đã được HUMAN duyệt ABI ngày 29/10/2026 nhưng capture frame thật vẫn là điều kiện nghiệm thu bắt buộc.
3. **Quy định thay đổi:** Nghiêm cấm đơn phương thay đổi baudrate, pinout, packet layout hoặc CRC trong code nếu chưa cập nhật và được duyệt tại tài liệu giao diện tương ứng.
4. **Đối chiếu sơ đồ chân Master:** Toàn bộ phân bổ chân, số thứ tự pin và header bo mạch của các giao diện trên phải đối chiếu với [KVC_MASTER_PINOUT_WIRING.md](../hardware/wiring/KVC_MASTER_PINOUT_WIRING.md) trước khi cấp nguồn hoặc đấu nối phần cứng.
