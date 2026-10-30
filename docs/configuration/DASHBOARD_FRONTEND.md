# KVC SAR Payload Ground Control Station (Frontend)

Frontend trạm giám sát tải nhiệm vụ cứu nạn bão lũ KVC hiện có source **React + TypeScript + Vite + Tailwind CSS + các component UI**. Phiên bản dependency cụ thể lấy từ package.json và package-lock.json.

Cập nhật 14/10/2026: backend FastAPI MOCK, SQLite logger và replay đã có source và kiểm thử ứng dụng. Parser hardware/serial chưa triển khai; frontend MOCK không chứng minh chuỗi phần cứng. [Thiết kế hệ thống](../../docs/architecture/KVC_ThietKeHeThong.md) là nguồn kiến trúc/BOM/nghiệm thu, [GCS plan](../../docs/architecture/KVC_GCS_PLAN.md) (stub DEPRECATED, bản đầy đủ ở archive (không có trong bản sản phẩm)), [route API chuẩn](../interfaces/IF_GCS_DATA_CONTRACT.md) và [data contract](../interfaces/KVC_GCS_DATA_CONTRACT.md) quy định dữ liệu ứng dụng.

> **Phân định ranh giới khí tài:**
> KVC là trạm giám sát tải nhiệm vụ cứu nạn (camera, AI phát hiện người/phao, cảm biến siêu âm AJ-SR04M, telemetry cảm biến và định vị vị trí). **Không phải Flight Controller, không can thiệp điều khiển bay, arm/disarm hay lập lộ trình waypoint.**

---

## 1. Yêu Cầu Môi Trường & Cài Đặt

- **Node.js/npm:** dùng phiên bản tương thích dependency lock của dự án; ghi phiên bản đã kiểm trong build evidence. Tài liệu này chưa xác nhận dải Node tối thiểu.
- **Package Manager:** `npm` (có kèm `package-lock.json`)

### Cài đặt dependencies:
```bash
cd gcs/frontend
npm ci
```

---

## 2. Các Lệnh Thực Thi (Scripts)

| Lệnh | Ý nghĩa & Mục đích |
|---|---|
| `npm run dev` | Khởi động Vite; dùng địa chỉ/cổng được in trong terminal |
| `npm run build` | Kiểm tra kiểu dữ liệu (`tsc -b`) và đóng gói bản production vào thư mục `dist/` |
| `npm run preview` | Khởi chạy bản xem trước của gói production tại `http://localhost:4173` |
| `npm run typecheck` | Kiểm tra TypeScript cho cả `tsconfig.app.json` và `tsconfig.node.json` bằng `tsc -p ... --noEmit` |
| `npm run test` | Chạy toàn bộ bộ kiểm thử tự động với Vitest (`vitest run`) |
| `npm run lint` | Kiểm tra quy chuẩn mã nguồn với Oxlint |
| `node tests/verify_browser.mjs` | Script kiểm browser hiện có; đọc điều kiện server/browser trong script trước khi chạy |

---

## 3. Cấu Hình Hệ Thống (.env)

Sao chép `.env.example` thành `.env` để tùy biến:

```ini
# Backend API & WebSocket
VITE_API_BASE_URL=http://localhost:8000
VITE_WS_URL=ws://localhost:8000/ws/telemetry

# Video tham chiếu tùy chọn; để trống khi chưa có nguồn thật
VITE_VIDEO_STREAM_URL=

# Bản Đồ Nền GPS (Leaflet Tile Source)
VITE_MAP_TILE_URL=https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png
VITE_MAP_ATTRIBUTION=&copy; OpenStreetMap contributors

# Nguồn Dữ Liệu Khởi Tạo (MOCK / REAL / REPLAY)
VITE_DEFAULT_SOURCE_MODE=MOCK

# LOCAL: generator trình duyệt; BACKEND: FastAPI MOCK + SQLite
VITE_MOCK_TRANSPORT=LOCAL

# Ngưỡng Dữ Liệu Cũ STALE (ms)
VITE_STALE_THRESHOLD_MS=3000
```

> **Lưu ý bảo mật:** Toàn bộ biến `VITE_*` là công khai trong mã nguồn client bundle sau khi build, tuyệt đối không đưa API keys, token quản trị hay mật khẩu nhạy cảm vào đây.

---

## 4. Chế Độ MOCK Độc Lập & 12 Kịch Bản Kiểm Thử

Source có bộ MOCK phía trình duyệt phục vụ phát triển khi chưa có backend/hardware. Danh sách dưới đây là các kịch bản cần kiểm, không xác nhận kết quả runtime của bản hiện tại. Người dùng có thể chọn kịch bản trực tiếp trong bảng **Cài đặt Vận hành (Settings Sheet)**:

1. **Tuần tra có GPS & Phát hiện Mục tiêu:** Tải di chuyển dọc sông, GPS 3D fix, phát hiện người cứu nạn WGS-84 (`#101`).
2. **Tuần tra Bình thường:** Tải bay tuần tra quét khu vực, GPS tốt, không có mục tiêu.
3. **GNSS Mất Fix:** Vệ tinh bị che khuất, `gps_valid=false`, làm mờ vị trí cuối, hiển thị N/A cho tọa độ mới.
4. **Dữ liệu Quá Cũ (STALE > 3 Giây):** Tín hiệu vô tuyến gián đoạn, `rx_age_ms=4500`, kích hoạt cờ cảnh báo `is_stale=true`.
5. **Hệ Local Cục Bộ (LOCAL_GRID XY cm):** Tọa độ local thực nghiệm $X, Y$ (cm) xung quanh gốc mốc chuẩn $O(0,0)$, hiển thị trực tiếp trên Radar local.
6. **Backend Mất Kết Nối:** WebSocket ngắt kết nối, hiển thị cảnh báo mất liên lạc và cơ chế tự động thử kết nối lại.
7. **Phần Cứng Ngừng Gửi:** WebSocket vẫn mở nhưng cáp nối tiếp hoặc dongle LoRa bị rút (`DISCONNECTED`).
8. **Video Chưa Cấu Hình / Lỗi Luồng:** Báo lỗi luồng video nhưng Telemetry và GPS vẫn hoạt động độc lập bình thường.
9. **Cảm Biến Suy Hao (Cảm biến siêu âm & IMU Lỗi):** Cảm biến siêu âm ngoài dải đo (hoặc vùng mù < 20 cm), IMU mất hiệu chuẩn, hạ cờ `pos_valid=false`.
10. **Đổi Phiên Dữ Liệu Mới:** Khởi tạo phiên nhật ký mới, tự động xóa sạch bộ nhớ đệm vệt di chuyển và mục tiêu cũ.
11. **Phục Hồi Sau Sự Cố:** Kết nối lại thành công, tín hiệu phục hồi bình thường.
12. **Thiếu Tọa Độ:** AI phát hiện đối tượng nhưng thuật toán chưa giải được tọa độ (latitude/longitude null).

---

## 5. Ý Nghĩa Kỹ Thuật & Giới Hạn Phần Cứng

Cấu hình mục tiêu theo [thiết kế hệ thống](../../docs/architecture/KVC_ThietKeHeThong.md): OneKiwi Primer 20K V1.1, Sonix SN34F788, AJ-SR04M, GY-87, GNSS NEO-M10N, Ra-02 hai đầu, gateway ESP32-C3 (kit/module còn TBD) và model YOLO11n hai lớp. ESP32 có nguồn riêng; baseline kết nối laptop là Wi-Fi SoftAP/WebSocket. Camera/cáp và pinout còn phải xác minh; ingress ESP32 chưa được triển khai. UI không tự tạo số vệ tinh/DOP/sai số, điện áp/cell/dòng pin hoặc hiệu năng AI khi schema không có dữ liệu; chỉ số thiếu là N/A.

### 5.1. Vị Trí Camera / Tải Nhiệm Vụ
- **Nguồn:** Trích xuất từ anten GNSS gắn trên cụm tải nhiệm vụ hoặc thân UAV do backend truyền về qua bản tin telemetry.
- **Ranh giới:** Đây là tọa độ hình học của anten GNSS, **chưa phải tâm quang học chính xác của ống kính camera**.
- **Không nội suy:** Hệ thống tuyệt đối không tự ý suy ra điểm camera đang chiếu xuống mặt nước nếu chưa có ma trận góc quay gimbal/IMU và phép chiếu tia hợp lệ.
- **Tọa độ bằng 0:** Tọa độ $(0.0, 0.0)$ được xử lý như một giá trị số hợp lệ, không tự động bị coi là thiếu dữ liệu.

### 5.2. Tách Biệt Hệ Local (LOCAL_GRID) và Tọa Độ Toàn Cầu (WGS-84)
- Khi `coordinate_frame == 'LOCAL_GRID'`: Đơn vị là centimét (cm) trên hệ trục local. Hệ thống tuyệt đối **không sao chép `local_x_cm` / `local_y_cm` vào `latitude` / `longitude`**.
- Khi mất GPS fix, tọa độ WGS-84 hiển thị `—` hoặc `N/A`, không tự lấy tọa độ sa bàn thay thế vào.

### 5.3. Giới Hạn Video Stream và Telemetry
- Video là nguồn tham chiếu tùy chọn trên PC; chưa có bằng chứng camera IMX219 hoặc kênh video riêng đã được triển khai. Camera payload theo quyết định G1 trong thiết kế.
- LoRa chỉ truyền metadata, **không truyền video**. RF payload 32 byte là ABI đã được HUMAN duyệt ngày 29/10/2026 (IF-02), nhưng chưa HARDWARE-VERIFIED. Wi-Fi SoftAP/WebSocket v1 là transport mục tiêu giữa ESP32 và laptop nhưng chưa có REAL ingress. USB envelope 48 byte thuộc kiến trúc cũ; telemetry 20 byte là ghi nhận source lịch sử. Frontend hiện chưa hỗ trợ các ABI phần cứng này.
- Bounding Box overlay chỉ được vẽ lên khung video khi có dữ liệu đồng bộ; nếu thiếu liên kết đồng bộ frame, hệ thống thông báo overlay chưa khả dụng thay vì vẽ sai lệch.

### 5.4. Bản Đồ Offline
- Source/CSS Leaflet được import từ dependency npm và đóng gói qua Vite. Không có thư mục `public/assets/leaflet/`; không coi thư viện cục bộ là bằng chứng tile map khả dụng offline.
- Dữ liệu bản đồ nền (Map Tiles) phụ thuộc nguồn tile server nội bộ hoặc kết nối internet. Khi không có tile mạng, không cam kết bản đồ nền khả dụng. Mục tiêu MVP là radar sa bàn/log/replay offline; cần kiểm bằng cold cache, WAN off và đúng bản build.

### 5.5. Phân Biệt Hai Tầng Kết Nối
1. **Tầng Trình duyệt ↔ Backend:** Kiểm soát qua trạng thái kết nối WebSocket (`ws_connected`).
2. **Tầng Backend ↔ Thiết bị Khí tài:** Kiểm soát qua cờ trạng thái phần cứng (`hardware_link.status`).
- Trình duyệt kết nối WebSocket thành công không đồng nghĩa trạm thu mặt đất đang nhận được sóng từ UAV.

---

## 6. Kiểm tra và trạng thái bằng chứng

Audit KVC-MAINT-20261014-001 ngày 14/10/2026 chạy baseline 14 test files / 76 tests PASS, lint exit 0 với 8 cảnh báo Fast Refresh và production build PASS. Lệnh typecheck cũ chỉ chạy root config rỗng; đã sửa để kiểm cả app và Vite config. Kết quả sau sửa cùng log nằm trong báo cáo cục bộ (không có trong bản sản phẩm); đây là SELF-REVIEW, không phải nghiệm thu.

~~~powershell
npm run typecheck
npm run lint
npm test
npm run build
~~~

Build có cảnh báo chunk JS khoảng 821 kB trước gzip. Chưa dùng cảnh báo này để kết luận có lỗi runtime; cần đo trên máy vận hành trước khi tối ưu. GpsMapPanel dùng Map2DView. Các module UI không được app/test sử dụng và ảnh mẫu đã được dọn trong KVC-ORGANIZE-20261014-001; cấu hình tạo component ở components.json vẫn được giữ.

Các script Playwright ở tests/ dùng URL/port và thư mục evidence cố định theo task cũ; không chạy chúng để ghi đè evidence. Browser E2E/ảnh chụp, cold-cache/WAN-off và đo tải dài hạn chưa được chạy lại trong audit này. Unit tests/build không thay thế các phép thử đó.

## 7. Dùng backend MOCK và replay

Đọc [backend README](DASHBOARD_BACKEND.md) để chạy server, kiểm trạng thái logger và API replay. Trong terminal Vite đặt VITE_MOCK_TRANSPORT=BACKEND trước khi chạy dev/build, giữ source MOCK và cổng 5173 để khớp CORS. LOCAL là mặc định, không mở WS, không lưu SQLite. BACKEND không tự fallback LOCAL khi mất socket; ingress REAL từ ESP32 qua Wi-Fi/WebSocket chưa có. REPLAY cần session đã commit trong backend, không phải timeline của generator trình duyệt.

Tiêu chí đo ở mục VII của [thiết kế](../../docs/architecture/KVC_ThietKeHeThong.md); bản hiện tại không chứa lịch 21 ngày. Công việc theo checklist 5 người; không tự đánh dấu gate hoàn thành chỉ vì có source hoặc test PASS.
