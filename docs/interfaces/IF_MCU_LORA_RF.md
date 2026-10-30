# Đặc tả giao diện: MCU Tải Sonix ↔ ESP32 Trạm Đất (LoRa RF Telemetry)

- **Mã giao diện:** `IF-02`
- **Hai đầu kết nối:** MCU Sonix SN34F788 trên UAV (**Nguyễn Tá Duy Phong** - Đầu phát TX) ↔ ESP32-C3 Gateway Trạm Đất (kit/board TBD; **Đoàn Thanh Trường Thịnh** - Đầu thu RX)
- **Trạng thái:** `APPROVED ABI / SOURCE-VERIFIED` — ABI RF v1 32 byte đã được **HUMAN duyệt ngày 29/10/2026** cho cả hai owner: Nguyễn Tá Duy Phong (MCU) và Đoàn Thanh Trường Thịnh (Gateway). Layout khớp ở cả ba đầu (MCU header, Gateway struct, parser Python). **Chưa** có bằng chứng `HARDWARE-VERIFIED` (chưa capture frame thật giữa MCU Sonix ↔ ESP32); duyệt ABI không thay thế phép đo.
- **Bản ghi duyệt:** Chủ dự án xác nhận HUMAN APPROVAL ngày 29/10/2026 thay mặt hai owner phân hệ MCU và Gateway, trong phiên Kilo (owner ghi tài liệu: Kilo; model/provider: DeepSeek). Duyệt phạm vi: chiều dài 32 byte, thứ tự trường/offset tại mục 2, Little-Endian, CRC-16/CCITT-FALSE trên byte 0–29, golden vector.
- **Sửa đổi 29/10/2026 (bỏ đo pin):** byte 25 đổi từ `battery_raw` sang `status_reserved` (luôn `0`); độ dài, offset và vị trí CRC **không đổi**. Golden vector chuyển GV-01 → **GV-02** (`CRC 0xE260`). Đây là thay đổi ngữ nghĩa trường, được chủ dự án duyệt cùng ngày trong phiên Kilo; vẫn không phải HARDWARE-VERIFIED.
- **Ghi chú ABI 20-byte:** task `KVC-FIX-ABI-20261025-001` đã truy toàn bộ lịch sử Git và working tree. **Không tìm thấy** bất kỳ định nghĩa, parser hay golden vector 20-byte nào trong repo; ghi nhận "telemetry 20 byte" chỉ là câu mô tả lịch sử trong `AGENTS.md`/`docs/KVC_AI_WORKFLOW.md` và không thể khôi phục layout. Vì vậy **không** dựng lại ABI 20-byte; 32-byte dưới đây là ABI đã duyệt. Mọi thay đổi layout/CRC/field phải có human approval mới và phải cập nhật đồng bộ ba đầu cùng golden vectors.

---

## 1. Cấu hình vô tuyến LoRa (RF Physical Parameters)

Hệ thống sử dụng 02 module **LoRa Ra-02 (chip Semtech SX1278)** giao tiếp qua SPI:

| Tham số | Giá trị thiết lập | Ghi chú kỹ thuật |
| :--- | :---: | :--- |
| **Tần số trung tâm (Frequency)** | **433.0 MHz** | Băng tần ISM không cần xin phép, phù hợp module Ra-02 |
| **Băng thông (Bandwidth - BW)** | **125 kHz** | Cân bằng giữa độ nhạy thu và tốc độ truyền |
| **Hệ số trải phổ (Spreading Factor - SF)** | **SF7** | Thời gian truyền trên không (Airtime) khoảng 71,9 ms cho gói 32 byte (tính theo tham số ở [thiết kế hệ thống](../../architecture/KVC_ThietKeHeThong.md) mục IV.3; chưa đo trên thanh ghi thực) |
| **Tỷ lệ mã sửa sai (Coding Rate - CR)** | **4/5** | Chuẩn cấu hình hoạt động |
| **Độ dài Preamble** | **8 symbols** | Preamble tiêu chuẩn cho SX1278 |
| **Sync Word** | **`0x12`** | Phân biệt mạng nội bộ KVC (tránh xung đột mạng LoRaWAN 0x34) |
| **Công suất phát (Tx Power)** | **+16 dBm** | Kích hoạt chân PA_BOOST, đảm bảo SNR an toàn |
| **CRC phần cứng SX1278** | **BẬT (Enabled)** | Tự động loại bỏ gói lỗi ở tầng PHY |

---

## 2. Cấu trúc gói tin Telemetry (RF Payload Format)

> **LƯU Ý LỊCH SỬ:** Ghi nhận cũ trong `AGENTS.md`/workflow nói "source dùng telemetry 20 byte". Task
> `KVC-FIX-ABI-20261025-001` đã kiểm toàn bộ lịch sử Git (mọi commit, branch, dangling object) và xác nhận **không có**
> struct/parser/golden vector 20-byte nào trong repo — câu đó chỉ là ghi nhận khảo sát, không phải layout có thể truy
> xuất. **ABI 32 byte dưới đây đã được HUMAN duyệt ngày 29/10/2026** và là contract duy nhất ở cả ba đầu.
> Toàn bộ số nguyên đa byte lưu theo chuẩn **Little-Endian**.

```text
 0                   1                   2                   3
 0 1 2 3 4 5 6 7 8 9 0 1 2 3 4 5 6 7 8 9 0 1 2 3 4 5 6 7 8 9 0 1
+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+
|       Sync (0xAA 0x55)        |  Msg_ID (1B)  |   Seq_Num (1B)|
+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+
|                          Timestamp (4B)                       |
+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+
|                       Target_Lat (4B, int32)                  |
+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+
|                       Target_Lon (4B, int32)                  |
+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+
|      Target_X_local (2B)      |      Target_Y_local (2B)      |
+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+
|   Altitude_Dist_cm(2B,uint16) |  Class_ID (1B)| Confidence(1B)|
+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+
|  Sensor_Flags |  UAV_Battery  |         CRC-16/CCITT          |
+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+
```

### Bảng phân rã 32 byte chi tiết:

| Offset | Kích thước | Tên trường | Kiểu dữ liệu | Đơn vị / Ý nghĩa |
| :---: | :---: | :--- | :--- | :--- |
| **0–1** | 2 byte | Sync Header | `uint8[2]` | Cố định `0xAA 0x55` |
| **2** | 1 byte | Message ID | `uint8` | `0x01`: Telemetry mục tiêu, `0x02`: Heartbeat/Ping |
| **3** | 1 byte | Sequence Number | `uint8` | Bộ đếm gói (0–255, xoay vòng) phát hiện mất gói |
| **4–7** | 4 byte | Timestamp | `uint32` | Thời gian MCU (ms) tính từ lúc khởi động |
| **8–11** | 4 byte | Target Latitude | `int32` | Vĩ độ WGS-84 mục tiêu ($\times 10^7$ độ); `0` nếu không có GNSS fix |
| **12–15** | 4 byte | Target Longitude | `int32` | Kinh độ WGS-84 mục tiêu ($\times 10^7$ độ); `0` nếu không có GNSS fix |
| **16–17** | 2 byte | Target X Local | `int16` | Tọa độ X so với mốc bể bơi/sa bàn (đơn vị: cm) |
| **18–19** | 2 byte | Target Y Local | `int16` | Tọa độ Y so với mốc bể bơi/sa bàn (đơn vị: cm) |
| **20–21** | 2 byte | Altitude Distance | `uint16` | Khoảng cách đo mặt nước từ cảm biến siêu âm AJ-SR04M (đơn vị: cm) |
| **22** | 1 byte | Class ID | `uint8` | `1`: `person` (người), `2`: `lifebuoy` (phao) |
| **23** | 1 byte | Confidence | `uint8` | Độ tin cậy nhận diện (0–100%) |
| **24** | 1 byte | Sensor Status Flags | `uint8` | Bit 0: GNSS 3D Fix hợp lệ<br>Bit 1: Cự ly siêu âm hợp lệ (ALT_VALID)<br>Bit 2: IMU hợp lệ<br>Bit 3: FPGA BBox có mục tiêu<br>Bit 4–7: Dự phòng |
| **25** | 1 byte | Status Reserved | `uint8` | **Dự phòng — không còn mang nghĩa điện áp pin.** Trước đây là `battery_raw` (0,1 V/bit); KVC đã bỏ phép đo pin nên firmware luôn ghi `0` và phía nhận bỏ qua. Giữ nguyên offset 25 để không đổi layout/CRC. |
| **26–29** | 4 byte | Dự phòng mở rộng / Góc IMU | `uint8[4]` | Khi cờ IMU hợp lệ (Bit 2): Byte 26–27 là Roll (int16 LE, 0.1°), Byte 28–29 là Pitch (int16 LE, 0.1°); hoặc đệm mở rộng độ cao áp kế |
| **30–31** | 2 byte | CRC-16 Checksum | `uint16` | **CRC-16/CCITT-FALSE** (Poly `0x1021`, Init `0xFFFF`) tính từ byte 0 đến byte 29 |

---

## 3. Golden vectors (dùng chung C / Gateway / Python)

Vector dưới đây được sinh **từ chính `KvcTelemetryPacket32`** trong `firmware/mcu_payload/inc/kvc_telemetry.h` bằng
`kvc_finalize_telemetry_packet()` (biên dịch host, `sizeof` = 32, offset khớp bảng mục 2), rồi đối chiếu lại bằng
parser Python `struct.unpack("<2sBBIIIhhHBBBB4sH")` trong `gcs/backend/esp32_ingress.py`.

```text
GV-02  Telemetry WGS-84, person, flags 0x0F, byte 25 reserved = 0 (bỏ đo pin)
  aa55012ae8030000baba6b06d4b3923f96004001f000015c0f000000000060e2
```

| Trường | Giá trị | Ghi chú |
| :--- | :--- | :--- |
| Sync / msg_id / seq | `aa 55` / `01` / `42` | |
| timestamp_ms | `1000` | `e8 03 00 00` — LE |
| target_lat / target_lon | `107723450` / `1066578900` | LE int32, đã ×10^7 |
| target_x_local / target_y_local | `150` / `320` | LE int16, cm |
| alt_dist_cm | `240` | LE uint16, cm |
| class_id / confidence | `1` / `92` | person |
| sensor_flags / status_reserved | `0x0F` / `0` | GPS\|ALT\|IMU\|AI; byte 25 dự phòng |
| reserved | `00 00 00 00` | không có IMU trong vector này |
| crc16 | `0xE260` | byte cuối `60 e2` — CRC tính trên 30 byte đầu, lưu **low-byte trước** |

> **GV-02 thay GV-01.** GV-01 cũ (`...0f7e000000004e30`, CRC `0x304E`) mã hoá byte 25 = `126` (12.6 V).
> Sau khi KVC bỏ phép đo pin, byte 25 luôn là `0`, nên vector và CRC đổi. GV-01 chỉ còn giá trị lịch sử;
> mọi test C/C++/Python dùng **GV-02**.

Vector thứ hai (toàn bộ payload bằng 0 ngoài header) xuất hiện ở
[IF-03](IF_ESP32_GCS_WS.md) và cũng đã được kiểm: CRC-16/CCITT-FALSE trên 30 byte đầu = `0x8F79`, khớp hai byte cuối.

**Quy tắc bắt buộc cho mọi golden vector:**
1. Endian: mọi trường đa byte là **Little-Endian**; CRC lưu low-byte trước (tương đương `uint16_t` LE khi memcpy).
2. CRC-16/CCITT-FALSE: Poly `0x1021`, Init `0xFFFF`, RefIn/RefOut `false`, XorOut `0x0000`, **coverage = byte 0..29**.
3. Vector phải là 32 byte (64 ký tự hex) và `sync == aa 55`.
4. Khi sửa bất kỳ byte nào trong 0..29, **phải** tính lại CRC trước khi dùng làm vector.

---

## 4. Quy trình xác nhận và nghiệm thu (Verification)

1. **Phía MCU Sonix (Phong):**
   - Đóng gói đúng 32 byte theo thứ tự Little-Endian.
   - Tính CRC-16 trước khi nạp buffer SPI vào SX1278.
   - Thiết kế tính airtime khoảng 71,9 ms (SF7) / 133,6 ms (SF8) với các giả định đã nêu tại mục IV.3. Chưa xác minh trên thanh ghi thực; chu kỳ phát và giới hạn duty-cycle còn chờ cấu hình/địa điểm được duyệt.
2. **Phía ESP32 Trạm Đất (Thịnh):**
   - Đọc gói tin khi chân DIO0 (RxDone) kích hoạt ngắt.
   - Đọc kèm 2 thông số chất lượng sóng từ thanh ghi SX1278:
     * **RSSI** (Received Signal Strength Indicator, dBm)
     * **SNR** (Signal-to-Noise Ratio, dB)
   - Kiểm tra CRC-16 gói tin; nếu sai, tăng bộ đếm lỗi và bỏ qua gói.
