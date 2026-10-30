# HƯỚNG DẪN KẾT NỐI WI-FI VÀ ĐỒNG BỘ DỮ LIỆU GIỮA ESP32-C3 VỚI WEB SERVER DASHBOARD

- **Mã tài liệu:** `DOC-DASHBOARD-WIFI-ESP32-GUIDE`
- **Phân hệ:** Trạm Giám Sát Mặt Đất (KVC Ground Control Station - Dashboard)
- **Áp dụng cho:** Kỹ sư vận hành trạm mặt đất, kiểm thử viên thực địa
- **Trạng thái:** ✅ Chuẩn hóa kỹ thuật 100%

---

## 1. TỔNG QUAN KIẾN TRÚC VÀ NGUYÊN TẮC BẤT BIẾN

Toàn bộ hệ thống trạm mặt đất KVC hoạt động theo mô hình **3 chặng khép kín**:

```text
+------------------------------------+
|    ESP32-C3 Gateway Trạm Đất       |
|    - Thu nhận sóng LoRa RF 433MHz  |
|    - Mở WebSocket Server (:8080)   |
+-----------------+------------------+
                  │
                  │ Sóng Wi-Fi (SoftAP hoặc Router nội bộ)
                  │ Bản tin JSON Transport Envelope v1 (chứa 32-byte RF payload)
                  ▼
+------------------------------------+
|    Laptop - Backend Service        |
|    - Dịch vụ Python FastAPI (:8000)|
|    - WebSocket Ingress Client      | ──► Ghi nhật ký vào SQLite WAL (data/sessions/*.db)
|    - Giải mã 32-byte Little-Endian | ──► Phân tích mục tiêu AI & đo trễ RTT
|    - WebSocket Server nội bộ       |
+-----------------+------------------+
                  │
                  │ Localhost WebSocket nội bộ máy tính (ws://127.0.0.1:8000/ws/telemetry)
                  ▼
+------------------------------------+
|    Trình duyệt - Web Dashboard     |
|    - React + TypeScript + Vite     |
|    - Hiển thị HUD, Radar, Bản đồ   |
|    - Điều khiển và giám sát thiết bị|
+------------------------------------+
```

> [!IMPORTANT]
> **Quy tắc bất biến (Tuyệt đối tuân thủ):**
> 1. **Trình duyệt Web Dashboard tuyệt đối không kết nối trực tiếp vào ESP32.**
> 2. Trình duyệt chỉ kết nối duy nhất vào Backend Python nội bộ máy tính tại: `ws://127.0.0.1:8000/ws/telemetry`.
> 3. Toàn bộ việc thu thập gói tin từ ESP32, ghi bền vững SQLite, đo kiểm tính toàn vẹn (CRC-16), quản lý phiên và xử lý mất sóng đều do **Backend Python** đảm nhiệm.

---

## 2. THỨ TỰ ƯU TIÊN KẾT NỐI (FIRMWARE TỰ QUYẾT ĐỊNH)

Firmware gateway chạy theo đúng thứ tự sau, **không cần chọn tay**:

| Ưu tiên | Điều kiện | Hành vi |
| :--- | :--- | :--- |
| **1** | Có Wi-Fi **2.4 GHz** đã thiết lập sẵn (truyền qua build flag `KVC_WIFI_SSID` / `KVC_WIFI_PASS`, hỗ trợ tới 4 mạng `..._SSID2..4`) | ESP32 lần lượt thử từng mạng đã khai báo. **Không phát SoftAP** nếu một mạng kết nối thành công. |
| **2** | Không có credential, hoặc hết `15 s` ngân sách khởi động mà chưa nối được mạng nào | ESP32 tự phát SoftAP `KVC_GROUND_STATION` để laptop bắt vào. Đồng thời vẫn thử lại ưu tiên 1 mỗi `30 s`, luân phiên qua các mạng; nếu nối được thì **tự đóng SoftAP**. |

> [!NOTE]
> **"4G" trong dự án là do điện thoại phát hotspot Wi-Fi 2.4 GHz** — không phải module 4G/LTE gắn vào ESP32. Điện thoại lo phần sóng di động, ESP32-C3 chỉ cần bắt Wi-Fi của điện thoại, nên **không cần thêm phần cứng nào**.
>
> Cách dùng: bật hotspot trên điện thoại (nhớ chọn băng tần **2.4 GHz**, nhiều máy Android mặc định 5 GHz), rồi nạp firmware kèm SSID/mật khẩu hotspot đó. Gateway sẽ ưu tiên bắt hotspot điện thoại trước, và chỉ phát SoftAP khi không bắt được.
>
> **ESP32-C3 chỉ hỗ trợ 2.4 GHz**, không hỗ trợ 5 GHz. Đây là giới hạn phần cứng, không sửa được bằng firmware.

---

### PHƯƠNG ÁN DỰ PHÒNG: DÙNG WI-FI SOFTAP CỦA ESP32 (TỰ ĐỘNG, KHÔNG CẦN SỬA CODE)

Đây là chế độ **ưu tiên 2**: ESP32 chỉ phát mạng này khi không kết nối được Wi-Fi 2.4 GHz ở ưu tiên 1. Bạn không cần quan tâm xung quanh có Wi-Fi hay không.

#### A. Thông số mạng cố định:
| Tham số | Giá trị thiết lập | Ghi chú kỹ thuật |
| :--- | :--- | :--- |
| **Tên Wi-Fi (SSID)** | **`KVC_GROUND_STATION`** | Phát trực tiếp từ chip ESP32-C3 |
| **Mật khẩu (Password)** | **`kvc123456`** | Chuẩn bảo mật WPA2-PSK |
| **Địa chỉ IP của ESP32** | **`192.168.4.1`** | Luôn luôn cố định 100% |
| **Cổng WebSocket** | **`8080`** | Cổng dịch vụ đo xa |
| **Đường dẫn Ingress** | **`ws://192.168.4.1:8080/telemetry`** | Endpoint mục tiêu |

#### B. Các bước thực hiện:
1. **Cắm nguồn ESP32-C3:** Cắm cáp Type-C vào Laptop hoặc pin sạc dự phòng. Sau **15 giây** (`KVC_STA_BOOT_BUDGET_MS = 15000` trong `src/main.cpp`) không kết nối được Wi-Fi 2.4 GHz ở ưu tiên 1, ESP32 tự kích hoạt SoftAP `KVC_GROUND_STATION`. Tài liệu này trước đây ghi 10 giây; con số đó không khớp code.
2. **Laptop bắt Wi-Fi:** Mở danh sách mạng Wi-Fi trên thanh Taskbar Windows $\rightarrow$ Chọn mạng **`KVC_GROUND_STATION`** $\rightarrow$ Nhập mật khẩu: `kvc123456`.
3. **Khởi động Backend và Frontend:** (Xem Mục 3 bên dưới) $\rightarrow$ Hệ thống tự động kết nối và chạy ngay lập tức.
4. **Sửa code:** **HOÀN TOÀN KHÔNG CẦN SỬA BẤT KỲ DÒNG CODE NÀO.**

---

### PHƯƠNG ÁN ƯU TIÊN 1: BẮT WI-FI 2.4 GHz CÓ SẴN (HOTSPOT ĐIỆN THOẠI HOẶC ROUTER)

Áp dụng khi bạn muốn ESP32 vào chung mạng với laptop. Hai trường hợp phổ biến:

- **Hotspot 4G từ điện thoại:** điện thoại phát Wi-Fi 2.4 GHz, laptop và ESP32 cùng bắt vào. Đây là cách "dùng 4G" của dự án — **không cần module 4G**.
- **Router Wi-Fi phòng Lab/nhà:** vừa có Internet vừa giao tiếp với ESP32.

#### Bước 1: Bật hotspot 2.4 GHz trên điện thoại (nếu dùng 4G)
- Android: Cài đặt → Điểm phát sóng/Chia sẻ mạng → bật **băng tần 2.4 GHz** (nhiều máy mặc định 5 GHz — nếu để 5 GHz, ESP32-C3 sẽ **không** thấy mạng).
- iPhone: Cài đặt → Điểm truy cập cá nhân → bật "Tối đa hóa khả năng tương thích" (bắt buộc phát 2.4 GHz).

#### Bước 2: Cấu hình SSID & Mật khẩu qua Build Flag của PlatformIO (Không sửa code)
Kể từ bản vá Task F11, thông tin Wi-Fi không còn hardcode trong mã nguồn `firmware/gateway_esp32/src/main.cpp`. Bạn truyền trực tiếp thông tin mạng lúc nạp code. Có thể khai báo **tới 4 mạng**, gateway thử lần lượt theo thứ tự:

```powershell
# Chỉ hotspot điện thoại:
.venv\Scripts\python.exe -m platformio run -d firmware/gateway_esp32 -t upload `
  -D "KVC_WIFI_SSID=\"hotspot-dien-thoai\"" -D "KVC_WIFI_PASS=\"mat-khau-1\""

# Hotspot điện thoại + Wi-Fi phòng Lab (tự chuyển khi một mạng không có):
.venv\Scripts\python.exe -m platformio run -d firmware/gateway_esp32 -t upload `
  -D "KVC_WIFI_SSID=\"hotspot-dien-thoai\""  -D "KVC_WIFI_PASS=\"mat-khau-1\"" `
  -D "KVC_WIFI_SSID2=\"wifi-phong-lab\""     -D "KVC_WIFI_PASS2=\"mat-khau-2\""
```
*Hoặc đặt vào file cấu hình PlatformIO cục bộ mà không commit lên Git.*
*Lưu ý: ESP32-C3 chỉ hỗ trợ băng tần sóng 2.4 GHz (không hỗ trợ 5 GHz).*

#### Bước 2: Lấy địa chỉ IP mới do Router cấp cho ESP32
* Mở **Serial Monitor** (Baud 115200) của ESP32, sau khi khởi động bo mạch sẽ in ra:
  ```text
  [WIFI-STA] Ket noi Wi-Fi STA THANH CONG!
  [WIFI-STA] Dia chi IP do Router cap cho ESP32: 192.168.1.XXX
  ```
  *(Ghi nhớ số IP này, ví dụ: `192.168.1.182`)*.

#### Bước 3: Khởi động Backend trỏ vào IP mới (KHÔNG CẦN MỞ FILE SỬA CODE)

> [!TIP]
> **"Không cần sửa file code" nghĩa là gì?**
> * **Cách cũ (Bất tiện):** Bạn phải mở file `gcs/backend/config.py`, tìm dòng `esp32_ws_url` rồi sửa số IP trong code và lưu file lại. Mỗi lần đổi sang Wi-Fi khác bạn lại phải tìm mở file code để sửa, rất dễ gõ nhầm hoặc xung đột Git.
> * **Cách chuẩn (Hiện tại):** Bạn **giữ nguyên file code không đụng vào**. Thay vào đó, bạn truyền IP trực tiếp lúc gõ lệnh chạy trong Terminal. Backend sẽ tự động lấy IP từ lệnh bạn gõ để kết nối ngay lập tức!

Bạn chọn **1 trong các cách cực kỳ tiện lợi** dưới đây:

##### Cách 3A (Tiện và phổ biến nhất) — Gõ thêm cờ `--esp32-url` lúc chạy lệnh:
Khi mở PowerShell để khởi chạy Backend, bạn chỉ cần thêm tham số `--esp32-url ws://<IP_ESP32>:8080/telemetry` vào cuối dòng lệnh:
```powershell
# Chạy với IP thực tế vừa nhận từ Router (Ví dụ: 10.34.204.101):
.venv\Scripts\python.exe -m Dashboard.backend.main --esp32-url ws://10.34.204.101:8080/telemetry
```
*(Nếu bạn dùng lệnh `python` thông thường thay vì `.venv`: `python -m Dashboard.backend.main --esp32-url ws://10.34.204.101:8080/telemetry`)*.

##### Cách 3B (Tuyệt vời nhất) — Dùng tên miền mDNS (Không cần quan tâm số IP là gì!):
ESP32-C3 đã được tích hợp sẵn mDNS với tên định danh `kvc-gateway.local`. Router cấp bất kỳ IP nào (`192.168.1.x`, `10.x.x.x`), máy tính Windows cũng tự tìm ra được:
```powershell
.venv\Scripts\python.exe -m Dashboard.backend.main --esp32-url ws://kvc-gateway.local:8080/telemetry
```

##### Cách 3C — Gán biến môi trường tạm thời trong PowerShell:
Lệnh này chỉ gán biến cho phiên làm việc hiện tại của cửa sổ PowerShell mà không đụng chạm tới file code nào:
```powershell
$env:KVC_ESP32_WS_URL="ws://10.34.204.101:8080/telemetry"
.venv\Scripts\python.exe -m Dashboard.backend.main
```

##### Cách 3D — Đổi IP "nóng" trực tiếp khi Backend ĐANG CHẠY (Không cần tắt bật lại Server):
Nếu Backend đang chạy mà ESP32 bị nhảy sang IP mới, bạn không cần nhấn `Ctrl + C` để tắt server. Chỉ cần mở một tab PowerShell khác và gõ:
```powershell
curl -X POST http://127.0.0.1:8000/api/esp32/connect -H "Content-Type: application/json" -d "{\"url\":\"ws://10.34.204.101:8080/telemetry\"}"
```
*(Backend sẽ lập tức ngắt link cũ và kết nối sang IP mới trong 0.1 giây)*.

---

## 3. QUY TRÌNH KHỞI ĐỘNG HỆ THỐNG DASHBOARD HOÀN CHỈNH

Mở **2 cửa sổ PowerShell riêng biệt** từ thư mục dự án `Project_UAV`:

### Cửa sổ 1: Khởi chạy Backend Service (Cổng 8000)
```powershell
# 1. Đứng tại thư mục gốc Project_UAV:
cd "c:\Users\User\OneDrive - The University of Technology\Documents\SN34F788\Project_UAV"

# 2. Khởi chạy Backend:
# - Nếu dùng Phương án 1 (SoftAP ESP32 mặc định 192.168.4.1):
.venv\Scripts\python.exe -m Dashboard.backend.main

# - Nếu dùng Phương án 2 (Router Wi-Fi nội bộ, ví dụ IP ESP32 là 10.34.204.101):
.venv\Scripts\python.exe -m Dashboard.backend.main --esp32-url ws://10.34.204.101:8080/telemetry
```

* **Dấu hiệu nhận biết thành công trong Terminal:**
```text
=======================================================
   KVC SAR GCS - BACKEND SERVICE (PORT 8000)          
=======================================================
[*] Che do Mock tu sinh : TAT (OFF - REAL MODE)
[*] Ingress ESP32       : BAT (ON)
[*] Dia chi ESP32       : ws://10.34.204.101:8080/telemetry
[*] Local WebSocket     : ws://127.0.0.1:8000/ws/telemetry
=======================================================
INFO:     Uvicorn running on http://127.0.0.1:8000 (Press CTRL+C to quit)
INFO:     Connected to ESP32 Gateway at ws://10.34.204.101:8080/telemetry.
```

---

### Cửa sổ 2: Khởi chạy Frontend Web Dashboard (Cổng 5173)
```powershell
# 1. Di chuyển vào thư mục frontend
cd "D:\KVC_PRODUCT\gcs\frontend"

# 2. Chạy Vite Server
npm.cmd run dev -- --host 127.0.0.1 --port 5173
```

* **Dấu hiệu thành công:**
  ```text
    VITE v8.3.0  ready in 320 ms

    ➜  Local:   http://127.0.0.1:5173/
    ➜  Network: use --host to expose
  ```

---

## 4. DẤU HIỆU NHẬN BIẾT KẾT NỐI THÀNH CÔNG 100%

Khi hệ thống đã thông luồng hoàn toàn từ **ESP32 $\rightarrow$ Backend $\rightarrow$ Web Browser**, bạn sẽ quan sát thấy:

### 1. Trên màn hình Serial Monitor của ESP32:
```text
[WS-CONNECT] >>> Laptop GCS da ket noi thanh cong!
             Client ID: 0 | Dia chi IP: 192.168.4.2
[TX-WS #001] NGUOI (Person) | Conf: 95% | LiDAR: 250 cm | Lat: 16.073852, Lon: 108.149921 | RSSI: -76 dBm
[TX-WS #002] TAU (Boat)     | Conf: 92% | LiDAR: 230 cm | Lat: 16.075100, Lon: 108.151200 | RSSI: -75 dBm
[TX-WS #003] SA BAN LOCAL   | Conf: 89% | X: +150 cm, Y: +320 cm | LiDAR: 245 cm       | RSSI: -76 dBm
```

### 2. Trên cửa sổ Terminal Backend Python:
```text
INFO:kvc.esp32_ingress:Connecting to ESP32 Gateway at ws://192.168.4.1:8080/telemetry...
INFO:kvc.esp32_ingress:Connected to ESP32 Gateway at ws://192.168.4.1:8080/telemetry.
INFO:kvc.esp32_ingress:ESP32 Handshake received: {'status': 'CONNECTED', 'gateway': 'KVC_ESP32_GATEWAY'}
```

### 3. Trên giao diện Trình duyệt Web Dashboard (`http://127.0.0.1:5173`):
* **Góc trên cùng bên phải Header:**
  * Huy hiệu **`GCS LINK OK`** (🟢 Xanh lá): Trình duyệt đã kết nối Backend port 8000.
  * Huy hiệu **`REAL (LIVE)`** (🟢 Xanh lá có đèn nhấp nháy): Đang nhận dữ liệu trực tiếp từ ESP32-C3.
  * Ô độ trễ hiển thị: `65ms (Tốt)`.
* **Trang Giám sát (`/mission`):**
  * Tọa độ WGS-84 hoặc Sa bàn Local cập nhật liên tục mỗi 1.0 giây.
  * Radar quét mục tiêu hiển thị vị trí Người gặp nạn hoặc Tàu thuyền.
* **Trang Chẩn đoán Thiết bị (`/devices`):**
  * Thẻ `Backend GCS ↔ Gateway ESP32-C3` hiển thị: **`ESP32 TRỰC TUYẾN (<100ms)`**.
  * Bảng cảm biến hiển thị các cờ: `GNSS 3D FIX`, `LiDAR HỢP LỆ`, `IMU HOẠT ĐỘNG`.

---

## 5. BẢNG XỬ LÝ SỰ CỐ NHANH (TROUBLESHOOTING)

| Hiện tượng | Nguyên nhân | Cách khắc phục ngay lập tức |
| :--- | :--- | :--- |
| **Giao diện báo `MẤT SÓNG ESP32 (>3.0s)`** | ESP32 chưa nhận được gói LoRa hoặc đang tắt chế độ Self-Mock. | Bật cờ `enableSelfMock = true;` trong code ESP32 hoặc nhấn nút reset trên bo mạch ESP32. |
| **Backend báo `[WinError 1225] Connection refused`** | Sai cổng port (8080) hoặc sai IP ESP32. | Kiểm tra lại IP in ra trên Serial Monitor ESP32. |
| **PowerShell báo lỗi đỏ `running scripts is disabled`** | Chính sách bảo mật Windows chặn lệnh `npm`. | Dùng lệnh `npm.cmd run dev` thay vì `npm run dev`. |
| **ESP32 liên tục in dấu chấm `.....` không bắt được Wi-Fi** | Wi-Fi đang phát sóng 5GHz hoặc gõ sai mật khẩu. | Chuyển điện thoại/router sang phát chuẩn **2.4 GHz**, hoặc chuyển hẳn sang dùng **Phương án 1 (SoftAP `KVC_GROUND_STATION`)**. |
| **Laptop bắt Wi-Fi `KVC_GROUND_STATION` báo "No Internet"** | Đây là mạng cục bộ nội bộ, không có Internet. | **Hiện tượng hoàn toàn bình thường**, hệ thống chỉ cần mạng LAN nội bộ để truyền telemetry, không cần kết nối Internet ra ngoài. |
