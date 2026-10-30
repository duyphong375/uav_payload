# Đặc tả giao diện: ESP32 Trạm Đất ↔ Backend GCS Laptop (Wi-Fi SoftAP / WebSocket)

- **Mã giao diện:** `IF-03`
- **Hai đầu kết nối:** ESP32-C3 Gateway Trạm Đất (kit/board TBD; **Đoàn Thanh Trường Thịnh** - Wi-Fi SoftAP & WebSocket Server) ↔ Dịch vụ Backend Python trên Laptop GCS (**Đoàn Thanh Trường Thịnh** - WebSocket Client Ingress)
- **Trạng thái:** `SOURCE-VERIFIED` — cả firmware Gateway (`main.cpp`) và module Ingress (`esp32_ingress.py`) đều đã có code và `pytest` hiện hành pass. Chưa có `HARDWARE-VERIFIED`: chưa capture frame LoRa thật hoặc chạy ESP32 trên bo trong task này.
- **Liên kết ABI:** payload RF bên trong envelope là frame 32 byte theo [IF-02](IF_MCU_LORA_RF.md) mục 2 và golden vector GV-02 mục 3; ABI này đã được HUMAN duyệt ngày 29/10/2026. Backend không đổi endian/field/layout.

---

## 1. Kiến trúc kết nối và Topology mạng

```text
+------------------------------------+
|    ESP32-C3 Gateway                |
|    - Nguồn độc lập (Pin/Power Bank)|
|    - Thu LoRa SX1278 (SPI)         |
|    - Phát Wi-Fi SoftAP / Kết nối STA|
|    - WebSocket Server (:8080/telemetry) |
+-----------------+------------------+
                  │
                  │  Sóng Wi-Fi 802.11 b/g/n (SSID: KVC_GROUND_STATION hoặc Wi-Fi STA)
                  │  Giao thức: WebSocket (:8080/telemetry)
                  ▼
+------------------------------------+
|    Backend GCS trên Laptop (Host)  |
|    - Kết nối Wi-Fi vào Gateway     |
|    - Chạy Client esp32_ingress.py  | ──► Ghi nhật ký vào SQLite WAL (sqlite_logger.py)
|    - Quản lý trạng thái State      | ──► Động cơ phát lại (replay_engine.py)
|    - Mở WebSocket Server nội bộ    |
|      (ws://127.0.0.1:8000/ws/telemetry) |
+-----------------+------------------+
                  │
                  │  Localhost WebSocket nội bộ máy tính
                  ▼
+------------------------------------+
|    Frontend Dashboard trên Browser |
|    - React + TypeScript + Vite     |
|    - Vẽ Radar Canvas, Bản đồ OSM   |
|    - Bảng cảnh báo và trạng thái   |
+------------------------------------+
```

> ⚠️ **QUY TẮC CỐT LÕI:**
> 1. Trình duyệt Web (Dashboard) **tuyệt đối không kết nối trực tiếp vào ESP32**. Trình duyệt chỉ kết nối vào Backend Python tại `ws://127.0.0.1:8000/ws/telemetry` (route chuẩn: [IF-04](IF_GCS_DATA_CONTRACT.md)).
> 2. Backend Python trên laptop chạy module Ingress `esp32_ingress.py` để kết nối vào ESP32, giải mã RF 32 bytes và chuyển tiếp dữ liệu vào Hub hệ thống.

---

## 2. Cấu hình mạng Wi-Fi và Endpoint của ESP32

Gateway ESP32 tự chọn chế độ mạng theo **thứ tự ưu tiên cố định** (firmware quyết định, người vận hành không phải chọn tay):

### Ưu tiên 1 — Station Mode (STA), Wi-Fi 2.4 GHz có sẵn

- ESP32 kết nối vào mạng Wi-Fi 2.4 GHz của phòng Lab, router, hoặc hotspot điện thoại. Credential truyền lúc build qua `KVC_WIFI_SSID` / `KVC_WIFI_PASS` (không hardcode trong source).
- **ESP32-C3 chỉ hỗ trợ 2.4 GHz**, không hỗ trợ 5 GHz.
- Khi STA thành công, firmware **không phát SoftAP**.
- Backend Python tích hợp cơ chế Auto-Discovery (`discover_esp32_gateway`) tự dò địa chỉ IP của ESP32 trên mạng cục bộ, không cần cấu hình IP thủ công.
- IP do router cấp, in ra Serial: `[WIFI-STA] IP do Router cap: <ip>`.

### Ưu tiên 2 — SoftAP dự phòng (tự động)

- Kích hoạt khi **không có credential** hoặc **hết 15 giây** (`KVC_STA_BOOT_BUDGET_MS = 15000` trong `main.cpp`) chưa nối được STA.
- **SSID:** `KVC_GROUND_STATION`
- **Mật khẩu (Password):** `kvc123456` (WPA2-PSK, thông số vận hành nội bộ)
- **Địa chỉ IP ESP32:** `192.168.4.1`
- **WebSocket Endpoint:** `ws://192.168.4.1:8080/telemetry`
- Firmware vẫn thử lại STA mỗi 30 giây; nếu STA nối được thì **tự đóng SoftAP** và chuyển về ưu tiên 1.

> [!NOTE]
> **"4G" trong dự án là do điện thoại phát hotspot Wi-Fi 2.4 GHz**, không phải module 4G/LTE gắn vào ESP32. Điện thoại lo phần sóng di động; gateway chỉ cần bắt Wi-Fi của điện thoại nên **không cần thêm phần cứng nào**. Firmware hỗ trợ khai báo tối đa 4 mạng ở ưu tiên 1 và thử lần lượt; nếu không mạng nào kết nối được thì mới phát SoftAP.

---

## 3. Transport envelope WebSocket v1

Mỗi message JSON UTF-8 chuyển tiếp một RF payload 32 byte còn nguyên vẹn. ESP32 loại bỏ các payload không qua được kiểm tra CRC-16 trước khi tạo message. `rf_payload_hex` giữ đúng thứ tự 32 byte nhận được. Số frame bị loại vì sai độ dài/sai CRC **không** cộng vào `rx_drop_count` (xem bảng trường bên dưới); chúng chỉ hiện ở Serial. Phía Backend Python tiếp nhận và giải mã qua module `gcs/backend/esp32_ingress.py`, có bộ test `test_esp32_ingress.py` (chạy trong task `KVC-FIX-ABI-20261025-001`: **14 passed**).

> **Golden vector dùng chung:** `rf_payload_hex` trong ví dụ dưới là vector toàn-zero của IF-02 và đã kiểm CRC-16/CCITT-FALSE = `0x8F79` (lưu LE `79 8f`). Vector đầy đủ có dữ liệu là **GV-02** ở [IF-02](IF_MCU_LORA_RF.md) mục 3: `aa55012ae8030000baba6b06d4b3923f96004001f000015c0f000000000060e2` (CRC `0xE260`). GV-02 thay GV-01 sau khi KVC bỏ phép đo pin (byte 25 `status_reserved` = 0).

> **Cảnh báo lịch sử:** ví dụ `aa55012a78e10100...a1b2` từng nằm trong `docs/architecture/GATEWAY_DESIGN.md` và `KE_HOACH_TEST_VA_TIEN_DO_GATEWAY_ESP32.md` có CRC **sai** (`0x91F5` tính lại ≠ `0xB2A1` khai báo). Không dùng vector đó làm fixture.

```json
{
  "transport_version": 1,
  "gateway_session_id": 3,
  "gateway_sequence": 42,
  "rx_monotonic_ms": 125430,
  "rf_payload_hex": "aa5501010000000000000000000000000000000000000000000000000000798f",
  "rssi_dbm": -76,
  "snr_db": 8.5,
  "rx_drop_count": 0
}
```

| Trường | Kiểu / quy tắc |
| --- | --- |
| `transport_version` | Integer; hiện bằng `1`. |
| `gateway_session_id` | `uint32`; thay đổi khi ESP32 khởi động lại. Firmware sinh từ entropy phần cứng (`esp_random()`) trộn MAC eFuse và bảo đảm giá trị `>= 2`, nên hai phiên boot không trùng nhau. Giá trị được in ra Serial lúc boot: `[SESSION] gateway_session_id = ...`. |
| `gateway_sequence` | `uint32`; tăng theo message, wrap modulo `2^32`. |
| `rx_monotonic_ms` | `uint32`; thời gian monotonic kể từ lúc ESP32 boot, không phải UTC. |
| `rf_payload_hex` | 64 ký tự hex thường, đúng 32 byte đã qua kiểm tra CRC-16; không sửa field/endian. |
| `rssi_dbm`, `snr_db` | Số đo nhận từ SX1278 theo đơn vị dBm và dB. |
| `rx_drop_count` | `uint32`; số message **hợp lệ** bị loại ở ESP32 do buffer đầy kể từ boot. Firmware hiện hành phát trực tiếp, **chưa có FIFO 64**, nên trường này luôn `0`. Frame RF **không hợp lệ** (sai độ dài, sai CRC-16) **không** cộng vào trường này; chúng được đếm riêng ở `rx_invalid_count` và chỉ in ra Serial (`[RX-LORA-ERR]`, `[HEARTBEAT] InvalidFrames: N`), không có trong envelope v1. |

Heartbeat riêng không thuộc envelope v1 đã mô tả. Link stale/disconnect được suy ra ở backend theo thời gian nhận message hợp lệ; muốn thêm loại message trạng thái cần schema/version được duyệt.

---

## 4. Xử lý mất kết nối và tự động phục hồi (Reconnection & Fallback)

1. **Khi laptop tắt hoặc mất sóng Wi-Fi:**
   - ESP32 trạm đất vẫn duy trì nguồn pin riêng, tiếp tục nhận và đếm gói LoRa.
   - Thiết kế mục tiêu giữ tối đa 64 message hợp lệ trong FIFO RAM; đầy thì loại message cũ nhất và tăng `rx_drop_count`. Chưa triển khai/xác minh.
2. **Phía Backend Python trên laptop:**
   - Khởi chạy client ingress mục tiêu tới `ws://192.168.4.1:8080/telemetry`.
   - Thiết kế đề xuất reconnect backoff 1–5 giây; trạng thái sequence reset khi `gateway_session_id` đổi.
   - Backend đánh dấu dữ liệu stale khi không có message RF hợp lệ trong 3 giây. Buffer/reconnect/stale values chưa được xác minh bằng integration test.
