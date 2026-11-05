# KVC — Phân hệ Trạm Giám Sát Mặt Đất (Dashboard / GCS)

- **Người phụ trách:** **Đoàn Thanh Trường Thịnh**
- **Mục tiêu:** Cung cấp giao diện trạm mặt đất (GCS) chuyên dụng để giám sát tải nhiệm vụ cứu nạn bão lũ (Bounding Box người/phao cứu sinh từ AI, hình ảnh camera quan sát qua kênh phụ IF-05, vị trí định vị WGS-84, cảm biến độ cao siêu âm AJ-SR04M).
- **Phân định ranh giới khí tài:** KVC là hệ thống giám sát **tải nhiệm vụ cứu nạn** (Payload), **không phải Flight Controller (FC)**. Dashboard không can thiệp điều khiển bay, arm/disarm hay lập lộ trình bay waypoint của máy bay.
- **Tài liệu căn cứ:**
  - Thiết kế kiến trúc tổng thể: [docs/architecture/KVC_ThietKeHeThong.md](../architecture/KVC_ThietKeHeThong.md)
  - Đặc tả thiết kế GCS: [docs/architecture/KVC_GCS_DESIGN_SPEC.md](../architecture/KVC_GCS_DESIGN_SPEC.md)
  - Hợp đồng dữ liệu nội bộ: [docs/interfaces/IF_GCS_DATA_CONTRACT.md](../interfaces/IF_GCS_DATA_CONTRACT.md)
  - Hướng dẫn kết nối Wi-Fi & ESP32: [HUONG_DAN_KET_NOI_WIFI_VA_ESP32.md](GATEWAY_WIFI_ESP32.md)
  - Giao diện kết nối Gateway ESP32: [docs/interfaces/IF_ESP32_GCS_WS.md](../interfaces/IF_ESP32_GCS_WS.md)

---

## 1. Kiến Trúc Kết Nối 2 Chặng (2-Tier Topology)

Kiến trúc mục tiêu của trạm mặt đất được thiết kế phân tầng. Backend GCS chạy FastAPI hỗ trợ MOCK, Ingress thu nhận thực tế từ Gateway ESP32 (`gcs/backend/esp32_ingress.py` theo chuẩn [IF-03](../interfaces/IF_ESP32_GCS_WS.md) và [IF-02](../interfaces/IF_MCU_LORA_RF.md)) và relay video phụ [IF-05](../interfaces/IF_ESP32_CAM_GCS.md). Xem [backend README](DASHBOARD_BACKEND.md) để biết trạng thái chi tiết.

> **Cập nhật 02/11/2026:** chế độ phát lại (REPLAY) **đã bỏ khỏi giao diện**. `AppHeader.tsx` chỉ còn nút MOCK và REAL; `routes.tsx` không còn route Replay. Chức năng thay thế là trang **Nhật ký phiên** (`/history`) đọc log đã commit, lọc và xuất CSV. Backend còn `replay_engine.py` + `/api/replay/*` như code dự phòng không có UI gọi.

```text
[UAV Tải Nhiệm Vụ]
       │
       ▼ (LoRa 433 MHz; gói nhị phân 32-byte IF-02)
[Gateway ESP32-C3 Trạm Đất] (Nguồn pin riêng, thu LoRa và mở WebSocket Server :8080)
       │
       ▼ (Wi-Fi SoftAP / WebSocket; JSON Envelope v1 IF-03)
[gcs/backend] (Laptop Ground Station - FastAPI; module esp32_ingress.py)
  ├── MOCK: phát dữ liệu mô phỏng và ghi SQLite
  ├── INGRESS: kết nối ESP32 ws://192.168.4.1:8080/telemetry và giải mã RF 32-byte
  ├── VIDEO RELAY (IF-05, tùy chọn): MJPEG từ ESP32-S3-CAM → same-origin cho trình duyệt
  └── WebSocket nội bộ cho frontend: ws://127.0.0.1:8000/ws/telemetry
       │
       ▼ (Localhost WebSocket)
[gcs/frontend] (Trình duyệt Web - React + TypeScript + Vite + Leaflet)
  └── Hiển thị HUD bay, bản đồ cứu hộ OSM, tọa độ mục tiêu, biểu đồ cảm biến
      và trang Nhật ký phiên (đọc log, xuất CSV — KHÔNG có chế độ phát lại)
```

> [!IMPORTANT]
> **Quy tắc bất biến:** Trình duyệt (`frontend`) **tuyệt đối không kết nối trực tiếp** tới Gateway ESP32. Toàn bộ luồng kết nối bắt buộc phải đi qua `backend` trên Laptop để ghi log SQLite, quản lý trạng thái và tránh làm treo vi điều khiển ESP32 khi có nhiều client kết nối.

---

## 2. Cấu Trúc Thư Mục Phân Hệ Dashboard

```text
gcs/
├── backend/                  # Dịch vụ Backend trung tâm trên Laptop (FastAPI / Python)
│   ├── main.py               # Điểm khởi chạy FastAPI, WebSocket server/client & REST API
│   ├── config.py             # Cấu hình biến môi trường, cổng, đường dẫn DB
│   ├── state.py              # Quản lý trạng thái xe bay/nhiệm vụ trong bộ nhớ
│   ├── schemas.py            # Pydantic models cho gói tin telemetry, BBox, trạng thái
│   ├── sqlite_logger.py      # Module ghi/đọc telemetry và nhật ký cứu hộ vào SQLite WAL
│   ├── replay_engine.py      # [DỰ PHÒNG] Bộ phát lại — backend còn, UI KHÔNG còn dùng
│   ├── video_relay.py        # Relay MJPEG IF-05 (ESP32-S3-CAM → backend → trình duyệt)
│   ├── esp32_ingress.py      # WebSocket client nhận Transport Envelope v1 từ ESP32-C3
│   ├── mock_source.py        # Nguồn sinh dữ liệu giả lập phục vụ kiểm thử độc lập
│   ├── requirements.txt      # Danh mục thư viện Python phụ thuộc
│   ├── tests/                # Bộ kiểm thử tự động pytest cho backend
│   └── README.md             # Hướng dẫn chi tiết vận hành backend
│
├── frontend/                 # Giao diện người dùng Web GCS (React + TypeScript + Vite)
│   ├── src/                  # Mã nguồn ứng dụng giao diện
│   │   ├── app/              # Cấu trúc ứng dụng chính
│   │   ├── components/       # Các UI components (HUD, bản đồ Leaflet, BBox video, sensors)
│   │   ├── features/         # Logic chức năng theo nghiệp vụ (telemetry, alerts, map)
│   │   ├── services/         # Client kết nối WebSocket & gọi REST API backend
│   │   ├── types/            # TypeScript interfaces & types
│   │   └── main.tsx          # Điểm khởi chạy React
│   ├── public/               # Tài nguyên tĩnh, icon cứu nạn, âm thanh cảnh báo
│   ├── tests/                # Bộ kịch bản kiểm tra giao diện bằng Puppeteer/browser
│   ├── package.json          # Quản lý thư viện phụ thuộc npm
│   ├── vite.config.ts        # Cấu hình đóng gói Vite
│   └── README.md             # Hướng dẫn chi tiết vận hành frontend
│
└── README.md                 # Tài liệu chỉ dẫn tổng quan này
```

---

## 3. Hướng Dẫn Vận Hành Nhanh

### 3.1. Khởi chạy Backend (Terminal 1)
```powershell
cd gcs/backend
# Kích hoạt môi trường ảo Python
../../.venv/Scripts/Activate.ps1
# Cài đặt thư viện (lần đầu)
pip install -r requirements.txt
# Chạy backend server
python -m uvicorn main:app --host 127.0.0.1 --port 8000 --reload
```
* API Documentation: `http://127.0.0.1:8000/docs`
* Endpoint WebSocket: `ws://127.0.0.1:8000/ws/telemetry`

### 3.2. Khởi chạy Frontend (Terminal 2)
```powershell
cd gcs/frontend
# Cài đặt dependencies (lần đầu)
npm ci
# Chạy Vite dev server
npm run dev
```
* Truy cập giao diện: `http://localhost:5173`

### 3.3. Chạy nhận diện AI (tùy chọn, process riêng — Terminal 3)

AI chạy như **một process độc lập**, đọc khung từ relay backend rồi phát lại luồng
đã vẽ box. Không nhúng vào backend: Ultralytics chạy Python pre/post trên event
loop sẽ làm mọi viewer cùng trễ, và một lần model crash sẽ kéo dashboard chết theo.

```powershell
python scripts/manual/run_stream.py `
  --source http://127.0.0.1:8000/video/stream `
  --device 0 --imgsz 480 --conf 0.25
```

Điều bắt buộc:

- `--source` trỏ vào **relay** `127.0.0.1:8000`, KHÔNG trỏ thẳng
  `192.168.x.x:81/stream`. Firmware chỉ cho 2 slot stream
  (`kMaxStreams = fb_count - 1`); client thứ ba bị `503`, và mọi kết nối thêm đều
  tranh sóng Wi-Fi với relay.
- `--imgsz 480` khớp nguồn 480×320. `imgsz=640` phóng to 1,33× mà không thêm
  thông tin, chỉ thêm latency.
- Bỏ `--display` khi vận hành: `cv2.imshow` là chi phí GUI thật. Cửa sổ OpenCV
  chỉ để debug, không phải điều kiện để AI lên dashboard.

Luồng đã vẽ box được phát tại `http://127.0.0.1:8090/`. Muốn dashboard hiển thị
luồng đó thay vì luồng sạch của relay, đặt trong `gcs/frontend/.env`:

```ini
VITE_VIDEO_STREAM_URL=http://127.0.0.1:8090/
```

Đây là **Đường A** (box đốt vào pixel). Nó luôn khớp khung vì box được vẽ trên
chính khung được phát. **Đường B** (backend phát metadata `bounding_boxes` để
frontend tự vẽ overlay) chưa có producer: `has_overlay` bị ép `false` trong
`gcs/frontend/src/state/missionReducer.ts`, và mảng `bounding_boxes` luôn rỗng.
Không bật overlay bằng cách tự sinh box từ `target` — toạ độ mục tiêu là WGS-84,
không phải pixel trong khung này.

`/healthz` của process AI trả `fps`, `infer_ms`, `frames`, `last_boxes`,
`detections`. **`fps` là tốc độ lấy được khung MỚI từ nguồn**, không phải tốc độ
model; `infer_ms` mới là chi phí suy luận. HUD trên video ghi rõ `SRC ... FPS`
và `INFER ... ms` để hai đại lượng không bị nhầm.

---

## 4. Các Chế Độ Hoạt Động (Operating Modes)

1. **MOCK Mode (Kiểm thử độc lập không phần cứng):**
   - Backend tự động sinh luồng tọa độ UAV bay quỹ đạo quanh khu vực lũ lụt giả lập và phát hiện người/phao giả lập.
   - Thích hợp phát triển giao diện, kiểm thử tính năng HUD, bản đồ mà không cần phần cứng.
2. **REAL ingress (đã có module, chưa kiểm trên thiết bị):**
   - IF-03 nêu gateway chọn mạng theo thứ tự ưu tiên: STA vào Wi-Fi 2.4 GHz trước, SoftAP `KVC_GROUND_STATION` (IP `192.168.4.1`, mật khẩu `kvc123456`) chỉ là dự phòng khi STA thất bại. Endpoint mục tiêu `ws://192.168.4.1:8080/telemetry`; chưa xác minh trên thiết bị.
   - Module `gcs/backend/esp32_ingress.py` đã viết parser WebSocket IF-03 + giải mã RF 32 byte và có test; bật bằng `$env:KVC_ENABLE_ESP32="true"`. **Chưa có capture từ Gateway ESP32-C3 thật** — không dùng source hiện tại để nghiệm thu đường dữ liệu phần cứng.
3. **Nhật ký phiên (thay chế độ phát lại từ 02/11/2026):**
   - Trang `/history` của frontend đọc danh sách phiên đã commit qua `GET /api/sessions`, hiển thị bảng sự kiện, lọc theo actor/mức cảnh báo/source, cho ẩn từng mục và xuất CSV.
   - **Không có tua lại, pause, seek hay đổi tốc độ trên giao diện.** Backend vẫn giữ `replay_engine.py` và 6 route `/api/replay/*` như code dự phòng; không UI nào gọi các route này.
   - Muốn phân tích sâu sau nhiệm vụ: dùng file SQLite trong `data/sessions/<session_id>.db` hoặc bản CSV xuất từ trang Nhật ký phiên.
