# Đặc tả giao diện: Backend GCS ↔ Frontend Dashboard Web (Localhost WebSocket & REST)

- **Mã giao diện:** `IF-04`
- **Hai đầu kết nối:** Dịch vụ Backend Python FastAPI trên Laptop ↔ Giao diện Web Dashboard trên Trình duyệt
- **Trạng thái:** `IMPLEMENTED / SOURCE-VERIFIED` — đối chiếu `gcs/backend/main.py` ngày 25/10/2026
- **Vai trò tài liệu:** **nguồn chuẩn duy nhất cho route HTTP và endpoint WebSocket** của GCS
- **Tài liệu bổ sung:** [docs/interfaces/KVC_GCS_DATA_CONTRACT.md](KVC_GCS_DATA_CONTRACT.md) — semantics trường dữ liệu, quy tắc null/stale và mô hình dữ liệu ứng dụng

> Quy ước: bảng route dưới đây **chỉ** nằm ở tài liệu này. Mọi tài liệu khác mô tả
> API GCS phải trỏ về đây thay vì chép lại bảng. Khi thêm/bớt route phải sửa cả
> `main.py`, tài liệu này và test tương ứng trong cùng một task.

---

## 1. Kiến trúc kết nối nội bộ Host

Giao diện IF-04 hoạt động hoàn toàn cục bộ trong nội bộ máy tính laptop (Localhost Loopback):

* **REST API:** `http://127.0.0.1:8000/api` — cấu hình, chuyển chế độ nguồn, quản lý phiên ghi, điều khiển replay, ingress thủ công.
* **WebSocket:** `ws://127.0.0.1:8000/ws/telemetry` — phát sự kiện thời gian thực tới mọi tab Dashboard đang mở.
* **Cổng mặc định:** `8000`. Frontend đọc từ `VITE_API_BASE_URL` / `VITE_WS_URL` (`gcs/frontend/.env.example`), mặc định `gcs/frontend/src/config/appConfig.ts:13-14`.
* **CORS:** chỉ cho phép `http://127.0.0.1:5173` và `http://localhost:5173`. WebSocket đóng với mã `1008` nếu `Origin` khác hai giá trị này.

> Trình duyệt **không** kết nối trực tiếp tới ESP32; xem [IF_ESP32_GCS_WS.md](IF_ESP32_GCS_WS.md).

---

## 2. Endpoint REST (đối chiếu `gcs/backend/main.py`)

### 2.1. Trạng thái và chẩn đoán

| Phương thức | Đường dẫn | Mục đích | Ghi chú |
| :--- | :--- | :--- | :--- |
| `GET` | `/api/health` | Liveness: `ok` / `degraded` | Trả `service`, `uptime_sec`, `source_mode` |
| `GET` | `/api/status` | Trạng thái hub, client, bộ đếm, replay | Hợp nhất `hub.status()` + `replay.status()` |
| `GET` | `/api/state/snapshot` | Snapshot trạng thái tích luỹ | Cùng dữ liệu với sự kiện `SNAPSHOT` |

### 2.2. Phiên ghi nhật ký (SQLite)

| Phương thức | Đường dẫn | Mục đích | Ghi chú |
| :--- | :--- | :--- | :--- |
| `GET` | `/api/sessions` | Liệt kê phiên đã ghi | Trả `active_session_id`, `storage_implemented`, `sessions[]` |
| `POST` | `/api/sessions/new` | Đóng phiên hiện tại, mở phiên mới | `409` nếu replay đang chạy |

### 2.3. Replay (virtual clock)

| Phương thức | Đường dẫn | Body | Mục đích |
| :--- | :--- | :--- | :--- |
| `POST` | `/api/replay/start` | `{"session_id": str, "speed": 0.5\|1.0\|2.0}` | Bắt đầu phát lại; `404` nếu thiếu phiên, `409` nếu đang replay |
| `POST` | `/api/replay/pause` | — | Tạm dừng |
| `POST` | `/api/replay/resume` | — | Tiếp tục |
| `POST` | `/api/replay/seek` | `{"timestamp_ms": int >= 0}` | Nhảy mốc thời gian |
| `POST` | `/api/replay/speed` | `{"speed": 0.5\|1.0\|2.0}` | Đổi tốc độ |
| `POST` | `/api/replay/stop` | — | Dừng, phát lại snapshot MOCK và khởi động lại nguồn MOCK |

`pause` và `resume` là **hai route riêng**, không dùng chung một route như bản mô tả cũ.

### 2.4. Ingress thủ công (dữ liệu thật hoặc test)

| Phương thức | Đường dẫn | Body | Mục đích |
| :--- | :--- | :--- | :--- |
| `POST` | `/api/ingress/envelope` | Transport Envelope v1 | Nhận envelope như ESP32 gửi; `400` nếu giải mã thất bại |
| `POST` | `/api/ingress/telemetry` | `{"telemetry": …, "target": …, "has_target": bool}` | Bơm telemetry/target trực tiếp, đặt `original_source_mode = REAL` |

### 2.5. Điều khiển Gateway ESP32

| Phương thức | Đường dẫn | Body | Mục đích |
| :--- | :--- | :--- | :--- |
| `GET` | `/api/esp32/status` | — | Trạng thái link, URL đích, tuổi dữ liệu nhận |
| `POST` | `/api/esp32/connect` | `{"url": "ws://<ip>:8080/telemetry"}` | Huỷ tác vụ ingress cũ và kết nối URL mới |
| `POST` | `/api/esp32/command` | `{"action": …}` | Gửi lệnh JSON tới gateway, chờ phản hồi tối đa 2 giây |

---

## 3. WebSocket

- **URL:** `ws://127.0.0.1:8000/ws/telemetry`
- **Giao thức:** text JSON, mỗi frame một `Event` (`schema_version = "1.0.0"`)
- **Handshake:** frame đầu tiên sau khi accept là sự kiện `SNAPSHOT`
- **Slow client:** hàng đợi > 64 sự kiện hoặc send quá 1,0 giây → đóng với mã `1008`; client tự kết nối lại sau 2 giây (`WS_RECONNECT_INTERVAL_MS`)
- **Origin:** chỉ chấp nhận hai origin dev nêu ở mục 1
- **Nguồn chuẩn mã nguồn:** `gcs/backend/main.py:360` (route), `gcs/backend/schemas.py:119` (Literal `event_type`)

### 3.1. Ngữ nghĩa sự kiện

Danh sách `event_type`, điều kiện phát và trường mang dữ liệu của từng sự kiện nằm tại
[docs/interfaces/KVC_GCS_DATA_CONTRACT.md mục 4.2](KVC_GCS_DATA_CONTRACT.md) — không
chép lại ở đây. Ràng buộc domain (ví dụ `source_mode = MOCK` bắt buộc
`inference_device = SIMULATED`) do validator trong `gcs/backend/schemas.py`
quyết định; tài liệu chỉ mô tả, source là chuẩn cuối.

---

## 4. Quy tắc thay đổi

1. Route mới hoặc đổi tên route phải cập nhật đồng thời: `gcs/backend/main.py`, tài liệu này, `docs/configuration/DASHBOARD_BACKEND.md` và test trong `gcs/backend/tests/`.
2. Không chép lại bảng route ở tài liệu khác; chỉ trỏ về IF-04.
3. Semantics trường, null/stale, đơn vị và mô hình dữ liệu ứng dụng: xem [docs/interfaces/KVC_GCS_DATA_CONTRACT.md](KVC_GCS_DATA_CONTRACT.md).
4. Không đổi giao thức RF, baud, CRC hay pinout từ tài liệu này.
