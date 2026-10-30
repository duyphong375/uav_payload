# KVC — Ground Control Station (GCS) Dashboard
## UI/UX Design Specification & System Blueprint

> DESIGN, đối chiếu 14/10/2026: UI thực tế lấy từ routes/AppShell và GpsMapPanel (Map2DView). Map3DView cũ không được ứng dụng dùng và đã bỏ trong KVC-ORGANIZE-20261014-001; mô tả 3D bên dưới là mục tiêu thiết kế, chưa triển khai. Các mô tả layout/tính năng trong bản thiết kế không phải xác nhận runtime; xem frontend README và báo cáo audit cho kiểm thử.

> Kiến trúc kết nối được đồng bộ 15/10/2026 theo [thiết kế hệ thống](KVC_ThietKeHeThong.md): gateway trạm đất dùng họ SoC ESP32-C3, nguồn riêng, Wi-Fi SoftAP/WebSocket v1 tới dịch vụ GCS trên laptop. Mã kit/board còn chờ xác minh. Dashboard web chỉ hiển thị dữ liệu từ backend local; browser không kết nối trực tiếp ESP32. Ingress này chưa triển khai/kiểm chứng. Các mô tả STM32/CP2102/USB phía dưới là nội dung cũ, đã superseded.

> **Phiên bản:** v1.2 (SortiX-Inspired Tactical SAR)<br>
> **Phân loại tài liệu:** `DESIGN SPECIFICATION`<br>
> **Đối tượng sử dụng:** Design Agent (Stitch / Figma / Frontend Engineers)<br>
> **Mục đích:** Đặc tả kiến trúc giao diện trạm mặt đất (GCS) giám sát tải nhiệm vụ cứu nạn bão lũ UAV KVC, tối ưu hóa hiển thị chiến thuật thời gian thực, trực quan hóa luồng dữ liệu kép MOCK / REAL.

---

## 1. Bản chất Dự án & Tôn chỉ Thiết kế (Product Identity)

* **Bản chất KVC:** KVC là **Tải nhiệm vụ (Payload)** cứu nạn bão lũ lắp trên UAV, **không phải Flight Controller**. GCS tập trung chuyên sâu vào:
  1. Video RGB từ kênh riêng hoặc file tham chiếu; không có camera nhiệt trong BOM.
  2. AI mục tiêu **YOLO11n**, phân loại person/lifebuoy theo candidate có hash; chưa mặc định đã chạy trên FPGA.
  3. Định vị local/WGS-84 khi có GNSS hoặc origin/pose, calibration camera–IMU–siêu âm và dữ liệu hợp lệ; gá cố định theo BOM, chưa có gimbal.
   4. Giám sát OneKiwi Primer 20K, MCU tải Sonix SN34F788, cảm biến và LoRa. ESP32-C3 là SoC gateway trạm đất theo kiến trúc hiện hành; có nguồn riêng và gửi dữ liệu tới dịch vụ GCS trên laptop qua Wi-Fi SoftAP/WebSocket v1. Kit/module và pinout còn phải xác minh. Trạng thái chưa có dữ liệu phải là UNKNOWN/N/A.
* **Cảm hứng & Ngôn ngữ tạo hình:** Lấy cảm hứng từ hệ sinh thái giao diện y tế/chiến thuật cao cấp **SortiX-Med**:
  - Giao diện **phẳng, bề mặt đặc** (flat field-ops). Không dùng glassmorphism nhiều lớp, không glow, không `shadow-2xl`. Tối đa **một** lớp phủ bán trong suốt trên bản đồ (thanh điều khiển Mission).
  - Tương phản cao, bố cục mô-đun hóa (Card-based Layout) giúp người vận hành không bị quá tải thông tin trong điều kiện thời tiết khắc nghiệt.
  - Phân biệt MOCK, REAL và REPLAY; ghi riêng thiết bị inference. Backend hiện hỗ trợ MOCK/REPLAY, REAL ingress còn thiếu.
  - Ràng buộc thi hành: xem `KVC_GCS_DESIGN_CONTRACT.md` (token `--kvc-*`, deny-list DL-1…DL-9).

---

## 2. Hệ Thống Design Tokens (Design System & Color Tokens)

### 2.1. Bảng màu Chủ đạo (Color Palette)

| Mã Màu / Token | HEX Code | Ánh xạ Vai trò (Role) | Ý nghĩa Chiến thuật |
| :--- | :--- | :--- | :--- |
| **Slate Dark (Background)** | `#0a0d14` / `#0f172a` | Nền ứng dụng chính (Dark Theme) | Giảm mỏi mắt trong trạm điều hành tối, chống lóa ngoài trời |
| **Pure Slate (Card / Surface)**| `#131722` / `#1e293b` | Nền Card / Panel / Sidebar | Khối chứa thông tin, bo góc `rounded-kvc-panel` (10px), viền mờ `1px` |
| **Tactical Cyan (Primary)** | `#0284c7` / `#06b6d4` | Điểm nhấn chính, Camera, Vị trí UAV | Tín hiệu quang học, tọa độ GPS UAV, luồng video |
| **Emergency Red (Destructive)**| `#ef4444` / `#dc2626` | Cứu nạn khẩn cấp, Mục tiêu Người | Bounding box đối tượng người trôi dạt, cảnh báo P0/P1 |
| **Mission Amber (Warning)** | `#f59e0b` / `#d97706` | Phao cứu sinh, Cảnh báo P2, Stale | Đối tượng phao cứu trợ, kết nối chậm, dữ liệu cũ |
| **Telemetry Emerald (Success)**| `#10b981` / `#059669` | Trạng thái Online, 3D Fix | Hệ thống phần cứng hoạt động tốt, đã khóa vệ tinh |
| **Simulation Purple (Special)**| `#8b5cf6` / `#7c3aed` | Nhãn Chế độ MÔ PHỎNG (MOCK) | Báo hiệu an toàn: Dữ liệu đang giả lập thử nghiệm |

### 2.2. Kiểu Chữ (Typography)
* **Font giao diện (UI Sans):** `Geist Sans`, `Inter`, hoặc `-apple-system`. Tỷ lệ chữ nhỏ gọn, tương phản sắc sảo (`text-xs` đến `text-sm` cho nhãn kỹ thuật, `text-2xl` đến `text-3xl font-black` cho chỉ số đo đạc lớn).
* **Font đo đạc (Telemetry Monospace):** `Geist Mono`, `JetBrains Mono`, `Roboto Mono`. Bắt buộc cho:
  - Tọa độ GPS: `15.893186° N, 108.068218° E`
  - Độ cao: `25.5 m`
  - Tần số & sóng vô tuyến: `-82 dBm (7.5 dB)`
  - Độ trễ gói tin: `1080 ms`

---

## 3. Cấu Trúc Tổng Thể & Bố Cục Trang (Global Layout Wireframe)

```
+----------------------------------------------------------------------------------------------------+
| [1] APP HEADER: Logo KVC-GCS | Breadcrumb | [ MOCK | REAL ] Segmented | Connect | Fix | Batt | Thm |
+----------------------------------------------------------------------------------------------------+
| [2] MODE CONTEXT SUB-BAR: 🟣 Nguồn dữ liệu • Kịch bản MOCK / trạng thái ESP32 Wi-Fi • [Lấy GPS Tôi] • [Reset]  |
+--------------------+-------------------------------------------------------------------------------+
|                    | [3] MAIN CONTENT AREA (Theo Tab được chọn)                                    |
|  [SIDEBAR NAV]     |                                                                               |
|  • Tổng quan       |  A. TRANG GIÁM SÁT TRỰC TIẾP (/mission):                                      |
|  • Trực tiếp (Live)|     [Video Stream + AI HUD] | [Leaflet 2D GNSS Map] | [Target Info & Alerts]  |
|  • Cảnh báo        |     ------------------------------------------------------------------------  |
|  • Nhật ký phiên   |     [Telemetry Footer Bar: Tọa độ, Cự ly siêu âm AGL, LoRa RSSI/SNR, Packet Age ms]   |
|  • Thiết bị        |                                                                               |
|  • Cài đặt         |  B. TRANG BẢNG ĐIỀU KHIỂN TÁC CHIẾN (/overview):                              |
|                    |     [4 Thẻ KPI Stat Cards]                                                    |
|                    |     [Liên kết RF & tuổi dữ liệu + 8 Subsystems] | [Bảng An toàn Phi vụ]      |
|                    |     [Bảng Danh sách Detections Mới nhất với nút Copy Tọa độ Thực địa]        |
+--------------------+-------------------------------------------------------------------------------+
```

---

> Đồng bộ source KVC-PROJECT-SYNC-CLEAN-20261014-001: TopStatCards/UavHardwareGaugeCard/GnssSatelliteSheet không còn dùng số cố định cho DOP, số vệ tinh, CEP, điện áp/cell, dòng/nhiệt/thời lượng hoặc tải AI; chỉ số chưa có nguồn là N/A. Không có lệnh gimbal, RTH, thả phao hoặc ping phần cứng giả trong bảng này. Chi tiết layout phía dưới vẫn là DESIGN, không thay test runtime.
>
> **Cập nhật PLAN-002 (29/10/2026):** UI **không hiển thị chỉ số pin** trên bất kỳ trang nào. `battery_pct` vẫn tồn tại trong data contract, parser và backend; với REAL trường này luôn `null`. Ngưỡng stale lấy từ `APP_CONFIG.STALE_THRESHOLD_MS` (mặc định 3000 ms) qua `src/lib/stale.ts`; UI không hardcode. Copy toạ độ phân biệt `LOCAL_GRID` (cm) và `WGS-84`; không trình bày last-known như toạ độ hiện hành. Chi tiết ràng buộc: `KVC_GCS_DESIGN_CONTRACT.md`.

## 4. Đặc Tả Chi Tiết Từng Khối Giao Diện (Component Specifications)

### 4.1. Header Toàn Cục ([AppHeader.tsx](../../gcs/frontend/src/app/AppHeader.tsx))
* **Vị trí:** Thanh cố định trên cùng (`h-14` / `h-16`).
* **Trái:** Biểu tượng khiên bảo vệ `ShieldCheck` Cyan, Logo `KVC · GCS`, nhãn phụ `Payload Monitor`.
* **Giữa:** Bộ chuyển trạng thái **Segmented Pill Mode Switcher**:
  - Nút `MOCK` dùng `var(--kvc-mock)`; `REAL` dùng `var(--kvc-ok)` hoặc `var(--kvc-crit)` tuỳ trạng thái; `REPLAY` dùng `var(--kvc-accent)`.
  - Không dùng glow/shadow màu; chỉ đổi nền và viền theo token.
* **Phải:** Các Widget chỉ số nhanh:
  - Trạng thái kết nối: `WS BACKEND OK` / `MẤT WS BACKEND`. Khi `source_mode === 'MOCK'` và `MOCK_TRANSPORT === 'LOCAL'`, hiển thị `MOCK OFFLINE` thay vì báo mất kết nối.
  - Độ trễ gói tin: nhãn lấy từ `staleLabel()`; màu theo `isAgeStale()` và `AMBER_AGE_MS`.
  - GNSS Fix: `3D FIX` kèm biểu tượng vệ tinh.
  - **Không hiển thị chỉ số pin** (KVC không đo pin tải).
  - Nút chuyển Dark/Light Theme.

### 4.2. Thanh Ngữ Cảnh Nguồn Dữ Liệu ([ModeContextBar.tsx](../../gcs/frontend/src/app/ModeContextBar.tsx))
* **Ý tưởng cốt lõi (SortiX Style):** Đảm bảo người vận hành **không bao giờ nhầm lẫn** giữa tọa độ giả lập và tọa độ thực tế ngoài hiện trường.
* **Khi ở chế độ MOCK:**
  - Nền `var(--kvc-mock-bg)` với viền `var(--kvc-mock-line)`.
  - Select Menu: Cho phép chọn nhanh kịch bản cứu nạn (Tuần tra GPS + Phát hiện mục tiêu / Mất GPS / Mất liên lạc). Không có kịch bản "cảnh báo pin yếu" vì KVC không đo pin.
  - Nút **"Lấy GPS Tôi" (`Locate me`)**: Kích hoạt HTML5 Geolocation của trình duyệt để đặt vị trí tham chiếu của máy trạm nếu người dùng cho phép. Không dùng vị trí trình duyệt thay GNSS UAV, tọa độ nạn nhân hoặc calibration local.
  - Nút **"Khởi động lại"**: Đặt lại hành trình mô phỏng từ đầu.
* **Khi ở chế độ REAL:**
  - Nền xanh lục an toàn (`bg-emerald-500/10 border-b border-emerald-500/20`).
  - Hiển thị trạng thái ingress ESP32 qua Wi-Fi/WebSocket, trạng thái WebSocket local giữa backend và browser, bộ đếm gói telemetry nhận được và tỷ lệ rớt gói (Drop Rate). Không hiển thị COM/baud như giao diện gateway mục tiêu.

---

### 4.3. Trang Giám Sát Trực Tiếp (`/mission`)

#### A. Video Stream Panel (Khối Camera & AI HUD)
* **Tỷ lệ hiển thị:** Khung video tỷ lệ vàng `16:9` chuẩn truyền hình.
* **AI Vision HUD Overlay:**
  - Bounding Box màu xanh Cyan/Emerald cho người trôi dạt (`Person #101 94%`).
  - Bounding Box màu Vàng/Cam cho phao cứu sinh (`Lifebuoy #102 88%`).
  - Thước đo góc chúi camera quang học cố định ở 45° (`Ống kính: 45° CHÚC | 1280x720 | 30 FPS`).
  - Nút thao tác: Phóng to toàn màn hình, Chụp ảnh mục tiêu (Snapshot), Bật/Tắt lưới ngắm ngắm ngắm (Crosshair HUD).

#### B. Bản đồ Tác chiến 2D Leaflet ([Map2DView.tsx](../../gcs/frontend/src/features/map/Map2DView.tsx))
* **Công nghệ:** Leaflet.js tối ưu hiệu năng, không tải lại DOM khi camera di chuyển.
* **Các lớp hiển thị (Layers):**
  - **Marker Camera/Tải:** Biểu tượng Radar xoay theo hướng bay `heading_deg`, vòng phát sóng quét xung quanh.
  - **Marker Mục tiêu Cứu nạn:** Biểu tượng tâm ngắm chữ thập đỏ phát sáng, tooltip chi tiết tọa độ WGS-84, phân loại, độ tin cậy AI, trạng thái xác thực (≥3 frame để chống báo động giả).
  - **Vệt đường bay (Trail Polyline):** Nét đứt Cyan nối các điểm lịch sử vị trí tải.
* **Điều khiển bản đồ:**
  - Chuyển đổi lớp nền Bản đồ đường bộ OpenStreetMap / Bản đồ vệ tinh Esri World Imagery (Satellite Thumbnail Button ở góc dưới).
  - Nút "Theo dõi" (Auto-follow tâm UAV) & "Về vị trí Camera".

#### C. Bảng Thông tin Mục tiêu & Cảnh báo Nhanh
* **Thẻ Mục tiêu hiện tại:** Hiển thị thẻ người/phao với điểm số phần trăm tin cậy của model candidate, tọa độ Lat/Lon dạng số thập phân 6 chữ số, nút sao chép tọa độ.
* **Thẻ Cảnh báo cần xử lý:** Tối đa 2 cảnh báo ưu tiên nhất (Mất GPS, Rớt gói tin RF LoRa, cảm biến bất thường), nút dẫn nhanh tới Trung tâm Cảnh báo.

#### D. Telemetry Footer Bar
* Ticker ngang cố định chân màn hình hiển thị tức thời:
  - `📷 Camera: 15.893186, 108.068218`
  - `🎯 Target: 15.893586, 108.068518`
  - `🏔️ Alt AGL (Siêu âm): 279 cm`
  - `📶 LoRa RF: -82 dBm (SNR: 7.5 dB)`
  - `⏱️ Packet Age: 1080 ms`

---

### 4.4. Trang Bảng Điều Khiển Tác Chiến (`/overview`)

#### A. 4 Thẻ KPI Stat Cards ([TopStatCards.tsx](../../gcs/frontend/src/features/telemetry/TopStatCards.tsx))
Các số dưới đây chỉ minh họa bố cục, không phải kết quả đo KVC; field không có trong schema/nguồn phải để N/A:
1. **Mục tiêu cứu nạn:** `01 Mục tiêu` (Track #101 • WGS84 hoặc LOCAL cm) — Badge phát hiện mục tiêu.
2. **Độ cao & cảm biến:** `2.61 m mặt nước` — siêu âm AJ-SR04M • IMU GY-87.
3. **Liên kết & thiết bị:** số gói tin, Gateway, trạng thái dữ liệu. **Không có thẻ pin.**
4. **Đường truyền LoRa & RF:** RSSI/SNR, tần số, trạng thái sóng.
5. **Độ tin cậy nhận diện:** confidence của detection, kèm nhãn inference thực tế. Confidence không phải accuracy; FPS/INT8 chỉ hiển thị khi có phép đo đúng candidate.

#### B. Khối Giám sát Phần cứng & Liên kết ([UavHardwareGaugeCard.tsx](../../gcs/frontend/src/features/telemetry/UavHardwareGaugeCard.tsx))
* **Khối "Liên kết RF và tuổi dữ liệu":** tuổi gói tin (ms), trạng thái dữ liệu, khoá GNSS, trạm mặt đất. Không có đồng hồ pin; KVC không đo dung lượng pin tải.
* **Danh sách thiết bị theo BOM:**
  1. GNSS NEO-M10N (hoặc biến thể đã chọn) — UART; chưa có mẫu thật thì UNKNOWN.
  2. AJ-SR04M — UART/GPIO theo cấu hình; range không tự là độ cao vuông góc.
  3. GY-87 — I2C; chip thực và hiệu chuẩn cần xác minh.
  4. Camera — module/giao diện còn chờ chốt cho OneKiwi.
  5. Ra-02 SX1278 hai đầu — SPI; hardware link độc lập WebSocket.
  6. FPGA OneKiwi Primer 20K V1.1 — AI chưa được kiểm chứng, không gắn nhãn ONLINE từ MOCK.
  7. MCU tải Sonix SN34F788 — UART/cảm biến/LoRa theo pin map được duyệt.
   8. ESP32-C3 gateway trạm đất — SoC mục tiêu, mã kit/module TBD; firmware/REAL ingress chưa được xác minh. STM32F103C8T6 + CP2102 là phương án kiến trúc cũ, không còn là cấu hình hiện hành.

Không thêm FLIR, MIPI CSI, PCIe, bộ thả phao hoặc MCU quản lý năng lượng riêng vào cấu hình KVC. UI mẫu không chứng minh thiết bị đã hiện diện.

#### C. Bảng Phát Hiện Mục Tiêu Mới Nhất ([RecentDetectionsTable.tsx](../../gcs/frontend/src/features/telemetry/RecentDetectionsTable.tsx))
* Danh sách các phát hiện trong phiên làm việc. **Mỗi dòng chỉ xuất hiện khi `pos_valid === true`.**
* Cột hiển thị: ID, Thời gian, Phân loại, Độ tin cậy, **Vị trí kèm hệ quy chiếu** (WGS-84 hoặc `X/Y cm`), Khoảng cách UAV.
* Trường thiếu hiển thị `N/A`. **Không** sinh toạ độ, confidence hay khoảng cách thay thế.
* Nút copy nhãn động: `Sao chép WGS-84` hoặc `Sao chép Local (cm)`.

---

## 5. Nguyên Tắc Trải Nghiệm Người Dùng (UX & Edge Case Rules)

1. **Không giật màn hình khi cập nhật GPS:**
   - Dữ liệu vị trí GPS đổ về tần số 1Hz - 5Hz. Map container tuyệt đối không tạo lại instance hay reload tile layer; chỉ gọi `marker.setLatLng()` và `polyline.addLatLng()`.
2. **Xử lý Mất Tín hiệu (Stale Data State):**
   - Ngưỡng lấy từ `APP_CONFIG.STALE_THRESHOLD_MS` qua `src/lib/stale.ts` (mặc định `3000 ms`). UI **không hardcode** con số.
   - Khi `isAgeStale(rx_age_ms, is_stale)` đúng: marker chuyển xám mờ (opacity 0.45), badge dùng `staleLabel()` → `DỮ LIỆU CŨ (>3s)` với cấu hình mặc định; hiển thị độ trễ tính bằng mili-giây.
   - Marker mục tiêu được giữ dạng **last-known** tới `LAST_KNOWN_TTL_MS` (60 s) trước khi xoá; không xoá ngay khi mất mục tiêu.
3. **Phòng chống Treo Giao Diện ([ErrorBoundary.tsx](../../gcs/frontend/src/components/common/ErrorBoundary.tsx)):**
   - Mọi trang đều được bọc trong ErrorBoundary, nếu có lỗi component sẽ xuất hiện thông báo thân thiện và nút "Tải lại trang" chứ không bao giờ để trắng màn hình.
4. **Chuẩn WGS-84 Thực Địa:**
   - Số chữ số thập phân là độ phân giải hiển thị, không phải độ chính xác vị trí. Chỉ hiển thị tọa độ khi hợp lệ; sai số cần đo ground truth và báo theo điều kiện thử.
5. **Hệ quy chiếu khi bàn giao:**
   - `LOCAL_GRID` copy `X/Y` cm, nhãn ghi rõ `LOCAL (cm)` và `title` nêu "không phải WGS-84".
   - `WGS-84` copy lat/lon. Không chuyển đổi giữa hai hệ tại UI.
   - Không trình bày toạ độ last-known như toạ độ hiện hành.
