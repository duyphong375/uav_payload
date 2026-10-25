# HỢP ĐỒNG DỮ LIỆU GCS (DATA CONTRACT: BACKEND ↔ FRONTEND)

- **Mã hợp đồng:** KVC-GCS-CONTRACT-001
- **Liên kết task:** KVC-GCS-001
- **Owner triển khai:** Codex, Antigravity hoặc Kilo, chọn một owner theo task; Codex review và người dùng chọn bên sửa finding.
- **Tình trạng:** PARTIAL — semantics ở mục 2/5/6/7 là nguồn chuẩn; **route API đã chuyển sang [IF-04](IF_GCS_DATA_CONTRACT.md)**
- **Bản chất tài liệu:** Hợp đồng dữ liệu tầng ứng dụng giữa GCS Backend và GCS Frontend. **Không phải văn bản đơn phương thay đổi giao thức phần cứng hay cấu hình thiết bị nhúng.**

> **Phân chia nguồn chuẩn (25/10/2026):** route HTTP và endpoint WebSocket do
> [IF-04](IF_GCS_DATA_CONTRACT.md) quy định. Tài liệu này giữ
> semantics trường, mô hình dữ liệu ứng dụng, schema SQLite và replay invariant.
> Không chép lại bảng route ở đây.


---

## 1. Phân định ranh giới và Tính độc lập của Giao thức

### 1.1. Hiện trạng giao thức và mức bằng chứng — 15/10/2026

- Source telemetry 20 byte cũ đã được ghi nhận trong AGENTS.md/workflow lịch sử. Snapshot hiện có frontend React/TypeScript và backend FastAPI MOCK/logger/replay; chưa có parser serial/legacy; không suy đoán layout hoặc khôi phục parser 20 byte. MVP không đặt mục tiêu hỗ trợ giao thức cũ.
- RF 32 byte vẫn là **DRAFT** tại mục IV.3 [thiết kế hệ thống](../architecture/KVC_ThietKeHeThong.md), chưa coi là giao thức đã nạp trên bo. Transport ESP32–laptop mục IV.4 đã chốt Wi-Fi SoftAP/WebSocket v1 nhưng cũng chưa có bằng chứng firmware, ingress hoặc capture REAL.
- Endpoint ứng dụng hiện hành có trong gcs/backend/main.py và backend README; schemas/state, logger và replay đã có tests. Wi-Fi/WebSocket ingress từ ESP32 là mục tiêu tích hợp; owner đối chiếu types/adapter/reducer và golden vectors theo task. Khác biệt source/contract phải được ghi nhận, không đổi hardware để vừa UI.
- Vector review/KVC-PLAN-002_reference_vectors.json là tham chiếu thiết kế lịch sử nếu còn, không phải phép thử sản phẩm. C+D tạo bộ golden C/Python có version/hash trong gcs/backend/fixtures theo task được giao; không phụ thuộc duy nhất file Git ignored.
- REAL ingress chưa có thiết bị/capture thì BLOCKED; tiếp tục MOCK độc lập có nhãn. Tiêu chí hệ thống ở mục VII thiết kế; mốc G1/G2/G3 trong kế hoạch cũ là lịch sử, không phải lịch hiện hành. Replay ứng dụng đã có, ingress REAL chưa có.

---

## 2. Định nghĩa Dữ liệu Ứng dụng (Application Data Models — DESIGN)

Các bảng mục 2–6 mô tả contract mục tiêu, không phải toàn bộ schema runtime hiện tại. **Mục 7** mô tả phần đã triển khai; source `gcs/backend/schemas.py` hiện chấp nhận source_mode MOCK/REPLAY và original_source_mode REAL/MOCK/UNKNOWN. Không gửi REAL hoặc sao chép fixture thiết kế rồi mặc định backend chấp nhận. Wire flags/sentinel phía dưới chưa có decoder hardware.

LOCAL_GRID là hệ tọa độ đã hiệu chuẩn; cách gọi “sa bàn” cũ không yêu cầu sa bàn tại cuộc thi. Dải cự ly siêu âm AJ-SR04M 20–500 cm (danh định 600 cm, schema lịch sử biểu diễn tới 800 cm) là miền biểu diễn, không đủ xác nhận phép đo mặt nước hợp lệ.

Toàn bộ dữ liệu trao đổi giữa Backend và Frontend được chuẩn hóa dưới dạng JSON (UTF-8). Mỗi trường dữ liệu đều được định nghĩa rõ kiểu dữ liệu, đơn vị, nguồn tạo và quy tắc xử lý khi thiếu hoặc ngoài miền giá trị.

### 2.1. Nhóm 1: Metadata Phiên và Nguồn dữ liệu

| Tên trường | Ý nghĩa | Kiểu dữ liệu | Đơn vị / Định dạng | Bắt buộc | Nguồn tạo | Quy tắc Null, Validation & Giới hạn |
| :--- | :--- | :--- | :--- | :--- | :--- | :--- |
| `schema_version` | Phiên bản schema dữ liệu | `string` | SemVer (VD: `"1.0.0"`) | Có | Backend | Cố định `"1.0.0"`. Frontend từ chối nếu khác major version. |
| `session_id` | Định danh phiên làm việc của GCS | `string` | UUID hoặc `SES-YYYYMMDD-HHMMSS` | Có | Backend | Tạo khi khởi động Backend hoặc khi người dùng tạo phiên mới. Không được rỗng. |
| `source_mode` | Chế độ nguồn dữ liệu của phiên xem | `string` | Enum: `REAL`, `MOCK`, `REPLAY` | Có | Backend | Khởi tạo tường minh. `REAL` không tự động fallback sang `MOCK`. |
| `original_source_mode` | Nguồn dữ liệu gốc của gói tin | `string` | Enum: `REAL`, `MOCK`, `REPLAY`, `UNKNOWN` | Có | Thiết bị / Log | Trích xuất từ bits 4–5 của trường Flags phần cứng (hoặc từ log file). |
| `inference_device` | Thiết bị thực hiện suy luận AI | `string` | Enum: `FPGA_GW2A`, `PC_REFERENCE`, `SIMULATED`, `UNKNOWN` | Có | Backend Manifest | Ánh xạ từ cấu hình Preflight. Chưa đối chiếu manifest thì bắt buộc ghi `UNKNOWN`. |
| `sender_session_id` | Định danh phiên nguồn từ MCU tải | `integer` hoặc `null` | uint32 (1 .. $2^{32}-1$) | Tùy chọn | Thiết bị MCU | Bằng `null` nếu là nguồn MOCK không có phần cứng hoặc chưa nhận được gói. |
| `ground_session_id` | Định danh phiên ESP32 trạm đất | `integer` hoặc `null` | uint32 (1 .. $2^{32}-1$) | Tùy chọn | ESP32 gateway | Ánh xạ từ `gateway_session_id` của WebSocket v1; bằng `null` nếu MOCK/REPLAY hoặc chưa có gateway. |

*Lưu ý bảo mật kiến trúc:* `session_id` của Backend GCS là định danh phiên ứng dụng PC, tuyệt đối không được đánh đồng với `sender_session_id` của MCU phát trên không hoặc `sequence_number` của phần cứng.

---

### 2.2. Nhóm 2: Mốc Thời gian và Tuổi Dữ liệu (Timestamps & Data Age)

| Tên trường | Ý nghĩa | Kiểu dữ liệu | Đơn vị / Định dạng | Bắt buộc | Nguồn tạo | Quy tắc Null, Validation & Giới hạn |
| :--- | :--- | :--- | :--- | :--- | :--- | :--- |
| `pc_rx_time_iso` | Thời điểm PC nhận được gói tin | `string` | ISO 8601 UTC (`YYYY-MM-DDTHH:MM:SS.sssZ`) | Có | Backend | Lấy từ đồng hồ hệ thống PC tại thời điểm Ingress hoàn tất. |
| `pc_rx_monotonic_ms` | Mốc thời gian đơn điệu của PC | `integer` | Milliseconds (ms) | Có | Backend | Dùng để tính toán khoảng thời gian nội bộ, không bị ảnh hưởng bởi đổi giờ OS. |
| `device_measurement_time_ms`| Thời điểm cảm biến đo tại MCU tải | `integer` hoặc `null` | Milliseconds (ms) từ lúc MCU boot | Tùy chọn | Thiết bị MCU | Trích xuất từ byte 8–11 của RF payload. Bằng `null` nếu không có thông tin từ thiết bị. |
| `rx_age_ms` | Tuổi dữ liệu tính từ lúc PC nhận gói | `integer` | Milliseconds (ms) | Có | Backend / Client | Khoảng cách từ `pc_rx_monotonic_ms` của gói hợp lệ mới nhất đến hiện tại. $\ge 0$. |
| `measurement_age_ms` | Tuổi dữ liệu từ lúc thiết bị đo | `integer` hoặc `null` | Milliseconds (ms) | Tùy chọn | Backend | **Chỉ có giá trị khi có cơ chế đồng bộ clock PC $\leftrightarrow$ MCU đã được kiểm chứng sai số**. Nếu chưa có, bắt buộc để `null`. |
| `is_stale` | Cờ báo dữ liệu đã cũ | `boolean` | `true` / `false` | Có | Backend / Client | Bằng `true` nếu `rx_age_ms > 3000` (quá 3,0 giây không có gói mới). |

*Quy tắc bất biến về độ trễ:* Tuyệt đối không lấy thời gian PC trừ đi thời gian boot của MCU để công bố "độ trễ đầu-cuối" khi hai thiết bị chạy trên hai miền xung nhịp (clock domains) hoàn toàn độc lập và chưa đồng bộ.

---

### 2.3. Nhóm 3: Trạng thái Khí tài và Telemetry Cảm biến

| Tên trường | Ý nghĩa | Kiểu dữ liệu | Đơn vị / Miền giá trị | Bắt buộc | Nguồn tạo | Quy tắc Null & Validation |
| :--- | :--- | :--- | :--- | :--- | :--- | :--- |
| `battery_pct` | Mức dung lượng pin của tải | `integer` hoặc `null` | % (0 .. 100) | Có | Thiết bị MCU | Giá trị 255 trên phần cứng ánh xạ thành `null` (Unknown). Ngoài 0..100 là invalid. |
| `lidar_range_cm` | Khoảng cách đo mặt nước từ cảm biến siêu âm (tên trường schema lịch sử) | `integer` hoặc `null` | cm (20 .. 800) | Có | Cảm biến siêu âm AJ-SR04M | Giá trị 65535 hoặc khi `ALT_VALID=0` ánh xạ thành `null`. Không tự ý coi là độ cao thẳng đứng. |
| `gps_valid` | Trạng thái cảm biến GNSS | `boolean` | `true` / `false` | Có | Cảm biến GNSS | Trích xuất từ Bit 0 của cờ Flags. |
| `lidar_valid` | Trạng thái cự ly siêu âm hợp lệ (ALT_VALID) | `boolean` | `true` / `false` | Có | Cảm biến siêu âm AJ-SR04M | Trích xuất từ Bit 1 của cờ Flags (ALT_VALID). |
| `imu_valid` | Trạng thái tư thế cảm biến IMU | `boolean` | `true` / `false` | Có | Cảm biến IMU | Trích xuất từ Bit 2 của cờ Flags. |
| `ai_detected` | Cờ phát hiện đối tượng từ AI | `boolean` | `true` / `false` | Có | Accelerator AI | Trích xuất từ Bit 3 của cờ Flags. |
| `packet_rssi_dbm` | Cường độ tín hiệu thu RF | `integer` hoặc `null` | dBm (-127 .. 0) | Có | MCU trạm đất | Đọc từ thanh ghi SX1278. Giá trị -128 ánh xạ thành `null`. Không tự tạo số giả. |
| `packet_snr_db` | Tỷ số tín hiệu trên nhiễu | `number` hoặc `null` | dB (Bước 0.25 dB) | Có | MCU trạm đất | Đọc từ thanh ghi SX1278. Bằng `null` nếu không có dongle phần cứng. |

---

### 2.4. Nhóm 4: Mục tiêu Cứu nạn và Định vị (Target & Georeferencing)

| Tên trường | Ý nghĩa | Kiểu dữ liệu | Đơn vị / Hệ tọa độ | Bắt buộc | Nguồn tạo | Quy tắc Null, Validation & Sentinel |
| :--- | :--- | :--- | :--- | :--- | :--- | :--- |
| `has_target` | Cờ chỉ thị có mục tiêu hay không | `boolean` | `true` / `false` | Có | Backend | `true` khi gói tin là Type 0x02 và thỏa mãn điều kiện hợp lệ. |
| `track_id` | Mã định danh bám vết mục tiêu | `integer` hoặc `null` | uint16 (1 .. 65535) | Có | Thiết bị MCU | `null` khi `has_target=false` hoặc Telemetry (Track=0). |
| `class_id` | Lớp đối tượng nhận diện | `integer` | Enum: `0` (unknown), `1` (person), `2` (lifebuoy) | Có | Accelerator AI | Trích xuất từ bits 9–11 của Flags. Lớp ngoài 0..2 bị reject. |
| `class_name` | Tên lớp đối tượng hiển thị | `string` | `"unknown"`, `"person"`, `"lifebuoy"` | Có | Backend | Ánh xạ từ `class_id`. |
| `confidence` | Độ tin cậy nhận diện AI | `integer` hoặc `null` | % (0 .. 100) | Có | Accelerator AI | Giá trị 255 trên phần cứng ánh xạ thành `null`. |
| `target_confirmed` | Mục tiêu đã được xác nhận | `boolean` | `true` / `false` | Có | Thiết bị MCU | Trích xuất từ Bit 6 của Flags (xác nhận $\ge 3$ frame liên tiếp). |
| `pos_valid` | Tọa độ mục tiêu hợp lệ | `boolean` | `true` / `false` | Có | Thiết bị MCU | Trích xuất từ Bit 7 của Flags. Nếu `false`, tọa độ là `null`. |
| `coordinate_frame` | Hệ tọa độ đang áp dụng | `string` | Enum: `"LOCAL_GRID"`, `"WGS84"`, `"NONE"` | Có | Backend | Phụ thuộc Bit 8 (`LOCAL_FRAME_ACTIVE`). Bit 8=1 là `"LOCAL_GRID"`, Bit 8=0 là `"WGS84"`. |
| `local_x_cm` | Tọa độ X trên local | `number` hoặc `null` | cm (Hệ tay phải, trục +X) | Có | Thuật toán Georef | Bắt buộc `null` nếu `coordinate_frame != "LOCAL_GRID"` hoặc `pos_valid=false`. Giá trị sentinel `INT32_MIN` ánh xạ thành `null`. |
| `local_y_cm` | Tọa độ Y trên local | `number` hoặc `null` | cm (Hệ tay phải, trục +Y) | Có | Thuật toán Georef | Bắt buộc `null` nếu `coordinate_frame != "LOCAL_GRID"` hoặc `pos_valid=false`. Giá trị sentinel `INT32_MIN` ánh xạ thành `null`. |
| `latitude` | Vĩ độ toàn cầu WGS-84 | `number` hoặc `null` | Độ thập phân (-90.0 .. +90.0) | Có | Cảm biến GNSS | Bắt buộc `null` nếu `coordinate_frame != "WGS84"` hoặc `pos_valid=false` hoặc `gps_valid=false`. |
| `longitude` | Kinh độ toàn cầu WGS-84 | `number` hoặc `null` | Độ thập phân (-180.0 .. +180.0)| Có | Cảm biến GNSS | Bắt buộc `null` nếu `coordinate_frame != "WGS84"` hoặc `pos_valid=false` hoặc `gps_valid=false`. |
| `origin_id` | Mã định danh gốc local | `integer` hoặc `null` | uint8 (1 .. 255) | Có | MCU Status / Config | Trích xuất từ gói Status Type 0x03. `0` hoặc không có ánh xạ thành `null` (`ORIGIN_UNKNOWN`). |

*Quy tắc bất biến về hệ tọa độ:*
- Khi `coordinate_frame == "LOCAL_GRID"`: Gốc $O$ (0,0) đặt tại vị trí mốc chuẩn đã đo đạc trên local. Trục $+X$ hướng sang phải (Đông local), trục $+Y$ hướng lên trên (Bắc local). Đơn vị là centimét (cm). Tuyệt đối **không copy `local_x_cm` / `local_y_cm` vào ô `latitude` / `longitude`**.
- Khi `coordinate_frame == "WGS84"`: Định vị toàn cầu theo chuẩn GNSS. Nếu mất GPS fix (`gps_valid=false`), hiển thị `N/A`, **không tự động lấy tọa độ sa bàn cũ thay thế vào**.

---

### 2.5. Nhóm 5: Bộ đếm Thống kê và Chất lượng Liên kết (Counters & Diagnostics)

| Tên trường | Ý nghĩa | Kiểu dữ liệu | Bắt buộc | Nguồn tạo | Quy tắc xử lý |
| :--- | :--- | :--- | :--- | :--- | :--- |
| `packets_received_total` | Tổng số message WebSocket hợp lệ từ ESP32 nhận được | `integer` | Có | Backend Ingress | Tăng đơn điệu từ khi khởi chạy Backend. |
| `decode_errors_total` | Số bản tin lỗi CRC hoặc sai cấu trúc | `integer` | Có | Backend Parser | Tăng khi CRC fail, sai length, sai sync hoặc sai version. |
| `ingress_drops_total` | Số gói bị drop do đầy hàng đợi Ingress | `integer` | Có | Ingress FIFO | Tăng khi Ingress FIFO vượt ngưỡng 256. |
| `logger_drops_total` | Số bản ghi bị drop do đầy hàng đợi Logger | `integer` | Có | Logger FIFO | Tăng khi Logger Queue vượt ngưỡng 1.024. |
| `client_drops_total` | Số sự kiện bị drop do client web chậm | `integer` | Có | WS Dispatcher | Tăng khi hàng đợi client vượt quá 64. |
| `data_loss_latched` | Cờ cảnh báo hệ thống đã từng mất gói | `boolean` | Có | Backend | Bằng `true` nếu bất kỳ bộ đếm drop nào $> 0$. |
| `logger_status` | Trạng thái hoạt động của cơ sở dữ liệu | `string` | Có | SQLite Logger | Enum: `"OK"`, `"LOG_DEGRADED"`, `"STORAGE_ERROR"`. |

---

## 3. Giao diện Lập trình Ứng dụng (HTTP REST API)

> **Nguồn chuẩn route:** bảng endpoint HTTP và endpoint WebSocket nằm duy nhất tại
> [đặc tả giao diện IF-04](IF_GCS_DATA_CONTRACT.md). Tài liệu này
> **không** chép lại bảng route để tránh lệch với `gcs/backend/main.py`.

Mục này chỉ mô tả ý nghĩa nghiệp vụ của các nhóm endpoint, không liệt kê đường dẫn:

- **Trạng thái/chẩn đoán:** kiểm tra sống, trạng thái hub và snapshot trạng thái tích luỹ.
- **Phiên ghi:** liệt kê phiên đã ghi và tạo phiên nhật ký mới.
- **Replay:** start / pause / resume / seek / speed / stop theo virtual clock.
- **Ingress thủ công:** nạp envelope hoặc telemetry trực tiếp để test, đánh dấu `REAL`.
- **Điều khiển ESP32:** xem trạng thái link, đổi URL gateway, gửi lệnh tới gateway.

Xem bảng route, body request và mã lỗi tại
[IF-04 mục 2](IF_GCS_DATA_CONTRACT.md).

---

## 4. Giao diện Thời gian thực (WebSocket Event Protocol)

- **URL kết nối:** `ws://<host>:<port>/ws/telemetry`
- **Giao thức trao đổi:** Text-based JSON.

### 4.1. Quy trình kết nối và Đồng bộ Trạng thái (Handshake & Snapshot)
1. **Ngay khi kết nối thành công:** Backend gửi ngay một bản tin sự kiện loại `SNAPSHOT` chứa toàn bộ trạng thái mới nhất của hệ thống (phiên hiện tại, cấu hình nguồn, telemetry gần nhất, mục tiêu hiện tại, danh sách cảnh báo chưa hết hạn).
2. **Trong quá trình hoạt động:** Backend phát (broadcast) các sự kiện tương ứng khi có dữ liệu mới.
3. **Khi client bị chậm (Slow Client):** Nếu hàng đợi gửi cho client vượt quá 64 sự kiện hoặc send timeout quá 1,0 giây, Backend chủ động ngắt kết nối với mã lỗi WebSocket `1008 (Policy Violation / Client Overflow)`. Client tự động kết nối lại sau 2 giây và nhận lại Snapshot mới.

### 4.2. Các loại sự kiện WebSocket (Event Types)

| Tên sự kiện (`event_type`) | Chu kỳ / Điều kiện phát | Nội dung truyền tải |
| :--- | :--- | :--- |
| `SNAPSHOT` | Ngay khi client kết nối hoặc kết nối lại | Toàn bộ trạng thái tích lũy của State Reducer. |
| `TELEMETRY_UPDATE` | Khi nhận gói tin Telemetry mới (Type 0x01) | Thông số pin, cảm biến, chất lượng tín hiệu RSSI/SNR, tuổi dữ liệu. |
| `TARGET_UPDATE` | Khi nhận gói tin Mục tiêu mới (Type 0x02) | Vị trí mục tiêu local, track_id, độ tin cậy, lớp đối tượng. |
| `ALERT_EVENT` | Khi phát sinh sự kiện quan trọng (Phát hiện mục tiêu, lỗi) | Mức độ cảnh báo (INFO/WARN/CRITICAL), thông điệp, timestamp. |
| `LINK_STATUS` | Khi trạng thái kết nối phần cứng thay đổi hoặc STALE | Cờ kết nối phần cứng, tuổi dữ liệu, cảnh báo STALE. |
| `REPLAY_TICK` | Mỗi nhịp phát lại trong chế độ REPLAY | Vị trí con trỏ thời gian ảo, tiến độ %, trạng thái play/pause. |
| `SYSTEM_DIAGNOSTICS`| Định kỳ 1 lần mỗi 2 giây | Bộ đếm gói tin, bộ đếm lỗi giải mã, bộ đếm drop, trạng thái đĩa. |

---

## 5. Quy chuẩn Lưu trữ và Phát lại (Log & Replay Schema)

### 5.1. Cấu trúc Bảng SQLite Lưu trữ Nhật ký (`telemetry_records`)
Cơ sở dữ liệu SQLite lưu trữ tại `data/sessions/<session_id>.db`, cấu hình `PRAGMA journal_mode = WAL; PRAGMA synchronous = FULL;`.

```sql
CREATE TABLE IF NOT EXISTS telemetry_records (
    record_id INTEGER PRIMARY KEY AUTOINCREMENT,
    session_id TEXT NOT NULL,
    pc_rx_monotonic_ms INTEGER NOT NULL,
    pc_rx_iso TEXT NOT NULL,
    source_mode TEXT NOT NULL,
    raw_transport_json TEXT,       -- JSON WebSocket v1 nhận từ ESP32, nếu có
    rf_payload_hex TEXT,           -- Chuỗi hex 32 byte payload
    is_valid INTEGER NOT NULL,     -- 1 nếu giải mã thành công, 0 nếu reject
    reject_reason TEXT,            -- Ghi rõ nguyên nhân nếu reject (VD: "CRC_FAIL")
    packet_type INTEGER,           -- 1: Telemetry, 2: Target, 3: Status
    sender_session_id INTEGER,
    sequence_number INTEGER,
    track_id INTEGER,
    local_x_cm REAL,
    local_y_cm REAL,
    confidence INTEGER,
    class_id INTEGER,
    flags_hex TEXT,
    parsed_json TEXT NOT NULL,     -- JSON đầy đủ phục vụ replay
    persisted_at_iso TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_records_time ON telemetry_records(pc_rx_monotonic_ms);
CREATE INDEX IF NOT EXISTS idx_records_session ON telemetry_records(session_id);
```

### 5.2. Nguyên tắc Bất biến của Trình phát lại (Replay Engine)
1. **Tách biệt Đồng hồ Ảo (Virtual Clock):** Khi phát lại, thời gian hiển thị là thời gian ảo được tái hiện theo khoảng cách thời gian `pc_rx_monotonic_ms` gốc trong bản ghi log. Tuyệt đối không đồng nhất thời gian phát lại với đồng hồ thực tế của máy tính.
2. **Tái lập Trạng thái Tuyệt đối khi Tua (Seek State Reset):** Khi người dùng kéo thanh trượt tua thời gian về mốc $T_{seek}$:
   - State Reducer **bắt buộc phải xóa sạch trạng thái hiện tại**.
   - Thực hiện truy vấn phục hồi trạng thái từ đầu phiên (hoặc từ điểm checkpoint gần nhất) đến đúng mốc $T_{seek}$.
   - Tuyệt đối **không giữ lại mục tiêu hoặc cảnh báo của tương lai** ($T > T_{seek}$) trên màn hình.
3. **Cách ly Tuyệt đối Kết nối Phần cứng:** Khi chế độ Replay kích hoạt, WebSocket ingress từ ESP32 bị đóng hoàn toàn. Không gửi lệnh hoặc bất kỳ gói tin nào ra thiết bị.

---

## 6. Các ví dụ Dữ liệu Minh họa (Design & Simulation Data Fixtures)

*(Lưu ý quan trọng: Toàn bộ 7 ví dụ dưới đây là dữ liệu minh họa ở cấp độ thiết kế và giả lập, phục vụ viết unit test và kiểm tra giao diện, KHÔNG PHẢI là gói tin thu được từ phần cứng thực tế)*.

---

### Ví dụ 1: Chế độ MOCK — Phát hiện Mục tiêu Hợp lệ trên Hệ local Cục bộ
*Mô tả:* Tải nhiệm vụ phát hiện người cứu nạn tại tọa độ $X = +125.4\text{ cm}, Y = -45.2\text{ cm}$, cờ local cục bộ kích hoạt, cờ GPS không áp dụng.

```json
{
  "event_type": "TARGET_UPDATE",
  "schema_version": "1.0.0",
  "session_id": "SES-20261012-001",
  "source_mode": "MOCK",
  "original_source_mode": "MOCK",
  "inference_device": "SIMULATED",
  "sender_session_id": 1,
  "ground_session_id": null,
  "sequence_number": 42,
  "pc_rx_time_iso": "2026-10-12T07:30:15.120Z",
  "pc_rx_monotonic_ms": 154200,
  "device_measurement_time_ms": 12450,
  "rx_age_ms": 120,
  "measurement_age_ms": null,
  "is_stale": false,
  "has_target": true,
  "target": {
    "track_id": 104,
    "class_id": 1,
    "class_name": "person",
    "confidence": 92,
    "target_confirmed": true,
    "pos_valid": true,
    "coordinate_frame": "LOCAL_GRID",
    "local_x_cm": 125.4,
    "local_y_cm": -45.2,
    "latitude": null,
    "longitude": null,
    "origin_id": 1
  },
  "telemetry": {
    "battery_pct": 85,
    "lidar_range_cm": 240,
    "gps_valid": false,
    "lidar_valid": true,
    "imu_valid": true,
    "ai_detected": true,
    "packet_rssi_dbm": -88,
    "packet_snr_db": 6.5
  },
  "diagnostics": {
    "packets_received_total": 145,
    "decode_errors_total": 0,
    "ingress_drops_total": 0,
    "data_loss_latched": false,
    "logger_status": "OK"
  }
}
```

---

### Ví dụ 2: Chế độ MOCK — Không có Mục tiêu (Tuần tra Bình thường)
*Mô tả:* UAV đang bay quét khu vực, không phát hiện mục tiêu cứu nạn nào (`has_target=false`). Radar không vẽ điểm.

```json
{
  "event_type": "TELEMETRY_UPDATE",
  "schema_version": "1.0.0",
  "session_id": "SES-20261012-001",
  "source_mode": "MOCK",
  "original_source_mode": "MOCK",
  "inference_device": "SIMULATED",
  "sender_session_id": 1,
  "ground_session_id": null,
  "sequence_number": 43,
  "pc_rx_time_iso": "2026-10-12T07:30:16.120Z",
  "pc_rx_monotonic_ms": 155200,
  "device_measurement_time_ms": 13450,
  "rx_age_ms": 80,
  "measurement_age_ms": null,
  "is_stale": false,
  "has_target": false,
  "target": null,
  "telemetry": {
    "battery_pct": 84,
    "lidar_range_cm": 242,
    "gps_valid": false,
    "lidar_valid": true,
    "imu_valid": true,
    "ai_detected": false,
    "packet_rssi_dbm": -89,
    "packet_snr_db": 6.0
  },
  "diagnostics": {
    "packets_received_total": 146,
    "decode_errors_total": 0,
    "ingress_drops_total": 0,
    "data_loss_latched": false,
    "logger_status": "OK"
  }
}
```

---

### Ví dụ 3: Chế độ REAL — Thiếu Tín hiệu GNSS / Mất Fix Vệ tinh
*Mô tả:* Thiết bị thật đang bay thử ngoài trời ở chế độ WGS-84 nhưng bị mất tín hiệu GPS (`gps_valid=false`, `pos_valid=false`). Ô tọa độ toàn cầu bắt buộc hiển thị `N/A`.

```json
{
  "event_type": "TELEMETRY_UPDATE",
  "schema_version": "1.0.0",
  "session_id": "SES-20261012-002",
  "source_mode": "REAL",
  "original_source_mode": "REAL",
  "inference_device": "FPGA_GW2A",
  "sender_session_id": 2,
  "ground_session_id": 1,
  "sequence_number": 88,
  "pc_rx_time_iso": "2026-10-12T08:15:20.005Z",
  "pc_rx_monotonic_ms": 289400,
  "device_measurement_time_ms": 54200,
  "rx_age_ms": 250,
  "measurement_age_ms": null,
  "is_stale": false,
  "has_target": false,
  "target": {
    "track_id": null,
    "class_id": 0,
    "class_name": "unknown",
    "confidence": null,
    "target_confirmed": false,
    "pos_valid": false,
    "coordinate_frame": "WGS84",
    "local_x_cm": null,
    "local_y_cm": null,
    "latitude": null,
    "longitude": null,
    "origin_id": null
  },
  "telemetry": {
    "battery_pct": 72,
    "lidar_range_cm": 520,
    "gps_valid": false,
    "lidar_valid": true,
    "imu_valid": true,
    "ai_detected": false,
    "packet_rssi_dbm": -95,
    "packet_snr_db": -1.25
  },
  "diagnostics": {
    "packets_received_total": 88,
    "decode_errors_total": 1,
    "ingress_drops_total": 0,
    "data_loss_latched": false,
    "logger_status": "OK"
  }
}
```

---

### Ví dụ 4: Cảm biến Siêu âm và IMU Bị Lỗi (Sensor INVALID)
*Mô tả:* Tải gặp sự cố cảm biến: Cáp cảm biến siêu âm bị lỏng dẫn đến ngoài tầm đo (`lidar_valid=false`, range=65535 $\rightarrow$ null), góc nghiêng IMU vượt ngưỡng cho phép (`imu_valid=false`). Dù AI có phát hiện đối tượng, hệ thống bắt buộc hạ cờ `pos_valid=false` và không xuất tọa độ.

```json
{
  "event_type": "ALERT_EVENT",
  "schema_version": "1.0.0",
  "session_id": "SES-20261012-001",
  "source_mode": "MOCK",
  "original_source_mode": "MOCK",
  "inference_device": "SIMULATED",
  "sender_session_id": 1,
  "ground_session_id": null,
  "sequence_number": 95,
  "pc_rx_time_iso": "2026-10-12T07:31:05.100Z",
  "pc_rx_monotonic_ms": 204180,
  "device_measurement_time_ms": 62400,
  "rx_age_ms": 95,
  "measurement_age_ms": null,
  "is_stale": false,
  "has_target": true,
  "target": {
    "track_id": 105,
    "class_id": 1,
    "class_name": "person",
    "confidence": 78,
    "target_confirmed": false,
    "pos_valid": false,
    "coordinate_frame": "LOCAL_GRID",
    "local_x_cm": null,
    "local_y_cm": null,
    "latitude": null,
    "longitude": null,
    "origin_id": 1
  },
  "telemetry": {
    "battery_pct": 81,
    "lidar_range_cm": null,
    "gps_valid": false,
    "lidar_valid": false,
    "imu_valid": false,
    "ai_detected": true,
    "packet_rssi_dbm": -91,
    "packet_snr_db": 4.0
  },
  "alert": {
    "level": "WARN",
    "code": "SENSOR_DEGRADED",
    "message": "Cảm biến siêu âm ngoài dải đo và IMU mất hiệu chuẩn. Không thể tính toán tọa độ local."
  },
  "diagnostics": {
    "packets_received_total": 198,
    "decode_errors_total": 0,
    "ingress_drops_total": 0,
    "data_loss_latched": false,
    "logger_status": "OK"
  }
}
```

---

### Ví dụ 5: Dữ liệu Bị Cũ Quá Thời hạn (`STALE` > 3 Giây)
*Mô tả:* Kênh truyền vô tuyến bị che khuất tạm thời, Backend không nhận được gói tin mới trong suốt 4,2 giây (`rx_age_ms=4200`). Giao diện bật cảnh báo `STALE`, làm mờ mục tiêu cũ.

```json
{
  "event_type": "LINK_STATUS",
  "schema_version": "1.0.0",
  "session_id": "SES-20261012-001",
  "source_mode": "MOCK",
  "original_source_mode": "MOCK",
  "inference_device": "SIMULATED",
  "sender_session_id": 1,
  "ground_session_id": null,
  "sequence_number": 120,
  "pc_rx_time_iso": "2026-10-12T07:31:30.000Z",
  "pc_rx_monotonic_ms": 229080,
  "device_measurement_time_ms": 87000,
  "rx_age_ms": 4200,
  "measurement_age_ms": null,
  "is_stale": true,
  "stale_reason": "NO_PACKET_RECEIVED_FOR_4200MS",
  "has_target": true,
  "target": {
    "track_id": 104,
    "class_id": 1,
    "class_name": "person",
    "confidence": 92,
    "target_confirmed": true,
    "pos_valid": true,
    "coordinate_frame": "LOCAL_GRID",
    "local_x_cm": 125.4,
    "local_y_cm": -45.2,
    "latitude": null,
    "longitude": null,
    "origin_id": 1
  },
  "telemetry": {
    "battery_pct": 80,
    "lidar_range_cm": 240,
    "gps_valid": false,
    "lidar_valid": true,
    "imu_valid": true,
    "ai_detected": true,
    "packet_rssi_dbm": null,
    "packet_snr_db": null
  },
  "diagnostics": {
    "packets_received_total": 222,
    "decode_errors_total": 0,
    "ingress_drops_total": 0,
    "data_loss_latched": false,
    "logger_status": "OK"
  }
}
```

---

### Ví dụ 6: Mất Kết nối Phần cứng (Hardware Disconnected / Link Lost)
*Mô tả:* Backend vẫn kết nối WebSocket với trình duyệt, nhưng mất kết nối Wi-Fi/WebSocket tới ESP32. Backend báo trạng thái phần cứng `DISCONNECTED`.

```json
{
  "event_type": "LINK_STATUS",
  "schema_version": "1.0.0",
  "session_id": "SES-20261012-002",
  "source_mode": "REAL",
  "original_source_mode": "REAL",
  "inference_device": "FPGA_GW2A",
  "sender_session_id": null,
  "ground_session_id": null,
  "sequence_number": null,
  "pc_rx_time_iso": "2026-10-12T08:20:10.500Z",
  "pc_rx_monotonic_ms": 579895,
  "device_measurement_time_ms": null,
  "rx_age_ms": 15400,
  "measurement_age_ms": null,
  "is_stale": true,
  "hardware_link": {
    "status": "DISCONNECTED",
    "endpoint": "ws://192.168.4.1:8080/telemetry",
    "error_message": "ESP32 WebSocket disconnected; reconnect pending"
  },
  "alert": {
    "level": "CRITICAL",
    "code": "GATEWAY_LINK_LOST",
    "message": "Mất kết nối WebSocket với ESP32 trạm đất. Đang thử kết nối lại tự động..."
  },
  "diagnostics": {
    "packets_received_total": 312,
    "decode_errors_total": 2,
    "ingress_drops_total": 0,
    "data_loss_latched": false,
    "logger_status": "OK"
  }
}
```

---

### Ví dụ 7: Chế độ REPLAY — Phát lại Nhật ký từ Cơ sở Dữ liệu Cũ
*Mô tả:* Người dùng đang mở xem lại phiên `rec_20261011_demo.db`. Đồng hồ ảo đang ở giây thứ 45 của phiên.

```json
{
  "event_type": "REPLAY_TICK",
  "schema_version": "1.0.0",
  "session_id": "SES-REPLAY-20261012-01",
  "source_mode": "REPLAY",
  "original_source_mode": "REAL",
  "inference_device": "FPGA_GW2A",
  "sender_session_id": 1,
  "ground_session_id": 1,
  "sequence_number": 45,
  "pc_rx_time_iso": "2026-10-11T09:12:45.000Z",
  "pc_rx_monotonic_ms": 45000,
  "device_measurement_time_ms": 44850,
  "rx_age_ms": 0,
  "measurement_age_ms": null,
  "is_stale": false,
  "replay_metadata": {
    "source_file": "rec_20261011_demo.db",
    "speed_multiplier": 1.0,
    "is_paused": false,
    "current_record_index": 45,
    "total_records": 600,
    "progress_pct": 7.5
  },
  "has_target": true,
  "target": {
    "track_id": 101,
    "class_id": 1,
    "class_name": "person",
    "confidence": 89,
    "target_confirmed": true,
    "pos_valid": true,
    "coordinate_frame": "LOCAL_GRID",
    "local_x_cm": 85.0,
    "local_y_cm": 110.5,
    "latitude": null,
    "longitude": null,
    "origin_id": 1
  },
  "telemetry": {
    "battery_pct": 91,
    "lidar_range_cm": 235,
    "gps_valid": false,
    "lidar_valid": true,
    "imu_valid": true,
    "ai_detected": true,
    "packet_rssi_dbm": -85,
    "packet_snr_db": 8.0
  },
  "diagnostics": {
    "packets_received_total": 45,
    "decode_errors_total": 0,
    "ingress_drops_total": 0,
    "data_loss_latched": false,
    "logger_status": "OK"
  }
}
```

---

## 7. Application MOCK slice — KVC-PRE-GCS-BACKEND-001

Phần này bổ sung semantics ứng dụng đã triển khai cho backend MOCK và frontend hiện hữu. RF/flags/sentinel vẫn là DESIGN; WebSocket ingress ESP32 cũng chưa được triển khai hoặc kiểm REAL trong backend. Logger và replay đã được bổ sung bởi KVC-PRE-GCS-LOGGER-001 / KVC-PRE-GCS-REPLAY-001. Các fixture thiết kế cũ ở mục 6 không tự chứng minh code đang chạy; patch hiện hành chỉ mang field thuộc domain của event.

### 7.1. Nguồn, phiên, socket và storage

- Backend phát `source_mode=MOCK`, `original_source_mode=MOCK`, `inference_device=SIMULATED`, `sender_session_id=null`, `ground_session_id=null`. `sequence_number` là số thứ tự event application trong process mock, không phải bộ đếm phần cứng.
- `session_id=SES-MOCK-<UUID>` xác định phiên application. Nguồn/phiên mới bắt đầu bằng SNAPSHOT đầy đủ; không ghép patch phiên mới vào dữ liệu cũ. Reset xóa telemetry, target, camera và alerts; UI giữ tùy chọn hiển thị riêng.
- `ws_connected` thuộc frontend socket thực. LOCAL không mở WS nên luôn false; BACKEND phải mở WS thực. WS connected không đồng nghĩa hardware connected: MOCK backend luôn `hardware_link.status=UNKNOWN` (hoặc DISCONNECTED nếu có thông báo thiếu thiết bị), `port=null`.
- Storage mặc định dùng SQLite tại `data/sessions`, một writer thread và queue tối đa 1024; WAL/FULL được áp dụng ở mỗi write connection. `accepted_to_memory_total` là enqueue RAM; `committed_total`/commit ticket mới xác nhận COMMIT. Overflow báo LOG_DEGRADED, lỗi storage báo STORAGE_ERROR và latch loss. Khi `storage_dir=None`, storage bị tắt và logger_status=LOG_DEGRADED. Bộ đếm packet/CRC vẫn 0 vì chưa có hardware ingress; logger/client drops được đo riêng.
- Client queue tối đa 64 pending events; overflow/send timeout >1s chỉ ngắt client đó với 1008. Discarded pending events và event không enqueue/in-flight bị mất được tính vào `client_drops_total`; loss latch không tự reset theo phiên. Reconnect sau 2s lấy snapshot mới. State không chờ network send.

### 7.2. Snapshot đầy đủ và patch/null

SNAPSHOT chứa metadata bắt buộc cùng toàn bộ domain: `telemetry`, `has_target`, `target`, `hardware_link`, `diagnostics`, `alerts`, `camera_position`, `bounding_boxes`, `replay_metadata` và tuổi riêng. Nullable domain vắng dữ liệu vẫn có key null; alerts/boxes rỗng là `[]`. Nested objects khi có phải đầy đủ. Server gửi snapshot nguyên tử trước incremental events cho từng connection/reconnect.

| Event | Domain được phép sửa | Ví dụ null |
| --- | --- | --- |
| TELEMETRY_UPDATE | telemetry, camera_position, bounding_boxes | `telemetry:null` invalid toàn bộ sensors; `battery_pct:null` chỉ clear pin |
| TARGET_UPDATE | target, has_target, bounding_boxes | `target:null` hoặc `has_target:false` clear target |
| LINK_STATUS | hardware_link | `hardware_link:null` trở về UNKNOWN |
| ALERT_EVENT | alert | `alert:null` clear danh sách alert; RESOLVED giải quyết một code |
| SYSTEM_DIAGNOSTICS | diagnostics | `diagnostics:null` nghĩa unavailable, frontend không được coi logger OK |

Trong patch, field vắng giữ nguyên. Explicit null clear/invalid; false là boolean thực. Chuỗi `"false"`, `"0"`, numeric string, object/array sai schema và field ngoài domain đều bị backend từ chối. Snapshot không phải patch: nó thay toàn bộ dữ liệu của phiên. ACK là thao tác UI cục bộ, không đồng nghĩa RESOLVED; cùng code WARN→CRITICAL cập nhật severity/nội dung và yêu cầu ACK mới.

Ví dụ sequence application (mỗi event còn có schema_version/session/source/time metadata):

```json
[
  {"event_type":"TELEMETRY_UPDATE","telemetry":{"battery_pct":85,"lidar_valid":true,"lidar_range_cm":240}},
  {"event_type":"TARGET_UPDATE","has_target":true,"target":{"class_id":1,"class_name":"person","pos_valid":true,"coordinate_frame":"LOCAL_GRID","local_x_cm":0,"local_y_cm":125,"origin_id":1}},
  {"event_type":"LINK_STATUS","hardware_link":{"status":"UNKNOWN"}},
  {"event_type":"ALERT_EVENT","alert":{"code":"SENSOR_DEGRADED","level":"WARN","message":"MOCK invalid sensor"}},
  {"event_type":"TELEMETRY_UPDATE","telemetry":{"battery_pct":null}},
  {"event_type":"TARGET_UPDATE","has_target":false,"target":null}
]
```

LINK_STATUS/ALERT_EVENT trên không xóa target hay sensors. Pin null chỉ clear pin và giữ cự ly siêu âm. Event cuối clear target nhưng vẫn giữ telemetry. LOCAL_GRID `(0,0)` hợp lệ khi có origin/validity phù hợp; camera/WGS84 vẫn N/A. MOCK target không tuyên bố tracker thật: track_id null, target_confirmed false.

### 7.3. Clock và reconnect freshness

Monotonic clock backend đo elapsed từ lúc process khởi động; ISO UTC là thông tin thời gian tường độc lập. `rx_age_ms` chỉ được refresh bởi dữ liệu TELEMETRY_UPDATE/TARGET_UPDATE; link/status/alert/diagnostics không làm dữ liệu mới lại. Tuổi riêng `telemetry_age_ms`, `target_age_ms`, `camera_age_ms` là ms không âm hoặc null nếu chưa có dữ liệu, gửi trong snapshot và các events. `3000 ms` còn fresh; `3001 ms` stale. Callback trễ phải tính elapsed thực, không cộng một interval cố định.

Ví dụ reconnect: target được nhận 10 giây trước và telemetry 1 giây trước thì SNAPSHOT mang `target_age_ms=10000`, `telemetry_age_ms=1000`; frontend giữ các tuổi này rồi cộng elapsed clock frontend. Snapshot không biến target cũ thành "Vừa nhận". Browser không trừ `performance.now()` trực tiếp khỏi backend monotonic clock; không có clock mapping MCU nên measurement_age_ms luôn null.

`alerts` trong snapshot là tối đa 50 alert theo code, gồm level/code/message/condition_status/timestamp_iso. Reconnect phục hồi condition history của phiên; ACK cục bộ không được server lưu bền. New-session snapshot có alerts rỗng và target/camera null trước khi scenario mới phát dữ liệu.

### 7.4. Replay phiên đã commit

Backend có start/pause/resume/seek/speed/stop qua HTTP; xem [backend README](../../docs/configuration/DASHBOARD_BACKEND.md) cho request/response. Replay đọc SQLite read-only, giữ original_source_mode và inference_device, phát source REPLAY với phiên ứng dụng riêng, không ghi lại playback vào logger và không gọi WebSocket ingress ESP32. Clock ảo dừng khi pause; seek tái dựng từ đầu, rồi phát full snapshot. Stop tạo phiên MOCK sạch. Đây là semantics ứng dụng đã có tests, không phải chứng nhận chuỗi RF/ESP32/GCS. Phần tải phiên hiện nạp toàn bộ records vào RAM và seek duyệt từ đầu; cần đo session dài trước mở rộng.
