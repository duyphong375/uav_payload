# KVC — Phân công công việc: MCU Payload và Gateway ESP32

**Ngày lập:** 26/10/2026
**Cơ sở:** kết quả bring-up trên kit thật ngày 26/10/2026 (log UART5)

| Vai trò | Người phụ trách | Phạm vi file | Toolchain |
| :--- | :--- | :--- | :--- |
| **MCU Payload** | Phong | `firmware/mcu_payload/**` | Keil MDK + ARMCLANG V6.14 |
| **Gateway ESP32** | Thịnh | `firmware/gateway_esp32/**` | PlatformIO 6.2.0 |

> **Ranh giới:** hai người sửa hai thư mục **không chồng lấn một file nào**.
> Giao tiếp chỉ qua hợp đồng IF-02 / IF-03 trong `docs/interfaces/`.
> Xem mục 5 để biết quy tắc phối hợp.

---

## 0. Hiện trạng đã xác minh trên phần cứng (26/10/2026)

Đây là kết quả **đo thật**, không phải thiết kế.

| Hạng mục | Trạng thái | Bằng chứng từ log |
| :--- | :--- | :--- |
| GNSS NEO-M10-0-10 | **ĐẠT** | `q1 f3 s11 hd1.50 la160763502 lo1081473923 v1`, `fe=0` |
| CFG-GNSS 4 chòm | **ĐẠT** | HDOP 5.60 → 1.50, vệ tinh 9 → 11, `v` 0 → 1 |
| Siêu âm AJ-SR04M | **ĐẠT chức năng** | `US=22..424cm ok`, Mode 4 nhận `0x01` |
| IMU MPU-6050 | **ĐẠT** | `v=1`, `WHO_AM_I=0x68`, góc ổn định |
| LoRa SX1278 | **ĐẠT init** | `LORA d1 ver=0x00000012` |
| Chu kỳ phát | **ĐẠT** | 1 000 ms chính xác 300+ giây, `ovr0` |
| Keil build | **PASS** | 0 Error, 0 Warning, Code 10 332 B |
| Gateway build | **PASS** | Flash 82,2 %, RAM 12,5 % |

> **CHƯA có gói tin nào đi từ MCU tới dashboard.** LoRa mới qua bước init;
> gateway chưa nhận; dashboard chưa nhận dữ liệu thật. Đây là khoảng trống lớn nhất.

---

## 1. PHẦN RIÊNG — MCU PAYLOAD (Phong)

Làm độc lập, không cần chờ Thịnh.

### 1.1. P0 — Sửa nhiễu đường RX siêu âm

**Hiện tượng đo được:** `USND fe=15728 byt=15728 isr=15728` → cả ba số bằng nhau,
tốc độ ~50 byte/giây, trong khi Mode 4 chỉ gửi 4 byte/giây khi được kích hoạt.

**Nguyên nhân:** Mode 4 cho module ngủ ở 20 µA. Khi ngủ, chân TX của module có thể
thả nổi (high‑Z). Cầu phân áp 1 kΩ / 2 kΩ kéo P2.15 **về 0 V** — mức SPACE liên tục.
UART thấy start bit giả liên tục nên sinh byte rác có cờ framing error.

**Hai cách sửa, chọn một:**

| Cách | Việc làm | Ưu / Nhược |
| :--- | :--- | :--- |
| **A. Phần cứng (khuyến nghị)** | Hàn thêm **10 kΩ từ P2.15 lên 3,3 V** | Sửa đúng gốc, không đụng code. Cần hàn. |
| **B. Phần mềm** | Chỉ bật ngắt RX UART2 trong cửa sổ ~120 ms sau khi gửi `0x01`; ngoài cửa sổ thì tắt `IE` | Không cần hàn. Phức tạp hơn, phải quản lý trạng thái ngắt. |

**File được sửa:**
- Cách A: `docs/hardware/wiring/KVC_MASTER_PINOUT_WIRING.md` (ghi thêm trở treo)
- Cách B: `firmware/mcu_payload/inc/kvc_usound_ajsr04m.h` (`kvc_usound_measure`)

**Tiêu chí PASS:**
```
USND  pend=0 drop=0 oe=0 fe=0 byt=~4 isr=~4     (sau 60 giây)
US=xx cm ok  liên tục, không có err xen kẽ
```

**Bàn giao:** log UART5 60 giây + xác nhận `byt` giảm từ ~50/s về ~4/s.

---

### 1.2. P1 — Viết host test cho driver siêu âm

**Lý do:** đây là driver **duy nhất** chưa có test. FPGA BBox 33 assert, GNSS 70,
timebase 16, UBX 66, ring 364 — nhưng FSM 4 byte của siêu âm thì không có gì.

**Việc làm:**
1. Tách `kvc_usound_feed_byte()` (thuần logic, hiện nằm lẫn trong header phần cứng)
   thành `kvc_usound_decode.{h,c}` chỉ có `<stdint.h>`.
2. Viết `tests/test_kvc_usound_decode.c` kiểm 5 ca:

| Ca | Dữ liệu bơm vào | Kỳ vọng |
| :--- | :--- | :--- |
| Khung tốt | `FF 03 E8 01…` (1000 mm) | `OK`, `cm = 100` |
| Sai checksum | `FF 03 E8 FF` | `ERR_CHECKSUM`, không cập nhật |
| No‑Echo | `FF 17 70 …` (6000 mm) | `ERR_OUT_OF_RANGE` |
| Vùng mù | `FF 00 64 …` (100 mm) | `ERR_BLIND_ZONE` |
| Rác chèn giữa khung | `FF 03 FF 03 E8 …` | Bắt lại khung đúng từ header thứ hai |

3. Thêm vào `scripts/test_firmware.ps1`.

**Tiêu chí PASS:** `test_kvc_usound_decode` PASS, tổng suite 9/9 bước PASS.

**Bàn giao:** 2 file nguồn mới + test file + dòng trong script.

---

### 1.3. P1 — Kiểm tra bộ đếm `fe` còn sạch không

Đã sửa một lần (đọc `LS` đúng một lần mỗi byte), nhưng log vẫn cho `fe == byt` trên
cả ba cổng. Sau khi làm mục 1.1, kiểm lại:

- Nếu `fe` về 0 → xong.
- Nếu vẫn `fe == byt` → bộ đếm còn sai; đọc lại §15.11.13 và sửa tiếp.

**Bàn giao:** số liệu `fe`/`byt`/`isr` của 3 cổng trước và sau khi sửa 1.1.

---

### 1.4. P2 — ADC đo điện áp pin

**Hiện trạng:** `battery_raw` luôn 0. Backend đã xử lý đúng (`battery_raw == 0`
→ `battery_pct = None`, không hiện pin giả), dashboard hiện **N/A**.

**Việc làm:**
1. Chốt chân ADC trên SN34F788 và cầu phân áp (pin 3S ~12,6 V → phải chia xuống
   dưới 3,3 V).
2. Đọc ADC mỗi chu kỳ, quy đổi `battery_raw = V_pin × 10`.
3. Bật `KVC_FLAG_*` tương ứng nếu cần tách cờ pin hợp lệ.

**Tiêu chí PASS:** `battery_raw` khác 0 và khớp điện áp đo bằng VOM (±0,1 V).

**Bàn giao:** sơ đồ cầu phân áp + log `battery_raw` + so sánh với VOM.

---

### 1.5. P3 — Yaw cho georef

**Hiện trạng:** `IF-02` không có byte Yaw; backend gán `heading_deg = None` cứng.
Georef giả định camera **luôn hướng Bắc** (`main.c`, khối georef). UAV xoay → toạ độ
mục tiêu lệch theo hướng vuông góc.

**Hướng đã chọn (không cần phần cứng thêm):** lấy Yaw từ GNSS `track_made_good`
(trường 7 của câu RMC).

**Việc làm:**
1. Parse `track_made_good` trong `kvc_gnss_neo_m10.c` (hiện chỉ dùng GGA/GSA/RMC
   nhưng chưa lấy trường này).
2. Lưu vào `KvcGnssState` dưới dạng `course_deg10` (0,1°).
3. Dùng trong georef: xoay `(delta_x, delta_y)` theo Yaw trước khi quy đổi toạ độ.
4. Thêm test NMEA với câu RMC có `track_made_good`.

**Giới hạn phải ghi rõ:** không có Yaw khi UAV đứng yên hoặc bay thẳng đứng.
Khi đó georef phải **từ chối** thay vì dùng Yaw cũ — nếu không sẽ báo toạ độ sai.

**Bàn giao:** code + test + ghi chú giới hạn trong `IF-00`.

---

## 2. PHẦN RIÊNG — GATEWAY ESP32 (Thịnh)

Làm độc lập, không cần chờ Phong.

### 2.1. P0 — Nghiệm thu thứ tự mạng trên chip thật

Host test `net_policy` đã PASS 22 assert nhưng **chưa chạy trên ESP32 thật**.

**Ba kịch bản phải kiểm:**

| Kịch bản | Nạp firmware | Kỳ vọng trên Serial |
| :--- | :--- | :--- |
| Không có credential | không truyền `KVC_WIFI_SSID` | `[WIFI-STA] Khong co KVC_WIFI_SSID` → `[WIFI-AP] Phat SoftAP du phong THANH CONG` |
| Có hotspot 2,4 GHz | `-D KVC_WIFI_SSID=... KVC_WIFI_PASS=...` | `[WIFI-STA] Ket noi STA THANH CONG` và **KHÔNG** có dòng `[WIFI-AP]` |
| Mất rồi có lại | bật hotspot → tắt → bật | AP tự bật sau ~15 s, tự tắt khi STA nối lại |

**Tiêu chí PASS:** cả ba log đúng như bảng, và `[WS] Endpoint` in đúng IP.

**Bàn giao:** ba đoạn log Serial (copy nguyên văn).

---

### 2.2. P0 — Nhận gói LoRa từ MCU

**Đây là việc quan trọng nhất của gateway.** Hiện `LoRa.parsePacket()` có trong code
nhưng chưa từng nhận gói thật.

**Việc làm:**
1. Xác nhận tham số khớp MCU (đã đối chiếu 26/10, tất cả khớp):
   `433 MHz, SF7, BW125, CR 4/5, CRC on, sync 0x12, preamble 8`.
2. Đặt hai bo cách 1–2 m, anten gắn cả hai.
3. Bật gateway, xem Serial có `RX OK` và `CRC hop le`.
4. Kiểm `rx_drop_count` không tăng.

**Tiêu chí PASS:**
```
- Nhận ≥ 55 gói trong 60 giây (MCU phát 1 Hz)
- CRC hợp lệ 100 %
- seq_num tăng liên tục, không nhảy
```

**Bàn giao:** log gateway 60 giây + số gói nhận / số gói MCU phát.

---

### 2.3. P1 — `gateway_session_id` phải đổi mỗi lần boot

**Hiện trạng:** là hằng `1` trong `main.cpp`. IF-03 nói phải đổi khi restart để backend
reset trạng thái sequence. Backend hiện chưa dùng, nhưng nếu sau này dùng thì đây là bug.

**Việc làm:** sinh từ `esp_random()` hoặc `millis()` lúc boot, ghi vào envelope.

**Tiêu chí PASS:** hai lần reboot cho hai `gateway_session_id` khác nhau.

**Bàn giao:** hai đoạn JSON envelope từ hai lần boot.

---

### 2.4. P2 — Quyết định hợp đồng buffer IF-03

**Hiện trạng mâu thuẫn:** `IF_ESP32_GCS_WS.md` §104 mô tả FIFO 64 message, loại cũ
nhất, tăng `rx_drop_count`. Nhưng code **không có buffer** — `webSocket.broadcastTXT()`
gửi trực tiếp, và `rx_drop_count` đang đếm lỗi CRC/độ dài.

**Chọn một:**
- **(a) Implement** ring 64 message + tách riêng `rx_crc_drop_count`
- **(b) Hạ tài liệu** xuống đúng hiện trạng (không buffer, ghi rõ mất gói khi client vắng)

Không được để tài liệu hứa điều code không làm.

**Bàn giao:** quyết định + file đã sửa (code hoặc doc).

---

### 2.5. P2 — Quyết định xử lý Flash 82,2 %

**Hiện trạng:** 1,078 MB / 1,31 MB. Còn ~234 KB. Đủ cho hiện tại nhưng **không đủ OTA kép**.

**Ba lựa chọn:**
- Bỏ mDNS (tiết kiệm ~39 KB) — mất `kvc-gateway.local`
- Đổi partition scheme sang 2 app slot — phải giảm tính năng
- Giữ nguyên, chấp nhận không OTA

**Bàn giao:** quyết định + ghi vào `GATEWAY_BUILD.md`.

---

## 3. PHẦN CHUNG — sau khi cả hai xong phần riêng

Chỉ làm khi mục 1.1, 1.3, 2.1, 2.2 đã xong.

### 3.1. P0 — Tích hợp chuỗi thật: MCU → LoRa → Gateway → WebSocket → Dashboard

**Điều kiện tiên quyết:** MCU phát được (1.1 xong), gateway nhận được (2.2 xong).

**Việc làm:**
1. Khởi động backend + frontend theo `docs/configuration/DASHBOARD_RUN.md`.
2. Laptop bắt Wi-Fi của gateway (SoftAP hoặc cùng mạng STA).
3. Mở dashboard, xác nhận telemetry chạy 1 Hz.
4. Đối chiếu từng trường: `seq_num`, `timestamp_ms`, `target_lat/lon`,
   `alt_dist_cm`, `class_id`, `confidence`, `sensor_flags`, `battery_raw`.

**Tiêu chí PASS:** 60 gói liên tiếp hiển thị đúng trên dashboard, không mất gói,
các trường khớp giữa log M3 (MCU) và JSON (gateway).

**Bàn giao:** ảnh dashboard + log MCU + log gateway của cùng 60 giây.

---

### 3.2. P1 — Đo khoảng cách LoRa

**Việc làm:** giữ nguyên cấu hình, tăng dần khoảng cách hai bo, ghi lại mức tín hiệu
và tỉ lệ mất gói. Đọc RSSI/SNR từ gateway.

**Bàn giao:** bảng khoảng cách → RSSI/SNR → tỉ lệ mất gói. Đây là dữ liệu **chưa ai có**,
dùng cho báo cáo.

---

### 3.3. P1 — Nghiệm thu 10 000 frame

**Việc làm:** chạy liên tục tới khi `seq_num` vòng 10 000 lần (~2,8 giờ ở 1 Hz).
Đếm số gói mất, số CRC fail, số lần watchdog reset.

**Tiêu chí PASS:** mất gói < 1 %, không reset watchdog oan.

**Bàn giao:** bảng thống kê + log.

---

### 3.4. P2 — Soak 2 giờ + laptop sạch offline

Chạy 2 giờ liên tục, sau đó thử trên laptop khác chỉ cài theo README, không có mạng ngoài.

**Bàn giao:** checklist PASS/FAIL + ghi chú chỗ README thiếu.

---

## 4. Thứ tự thực hiện

```
GIAI ĐOẠN 1 — RIÊNG (song song, không chờ nhau)
  Phong                          Thịnh
  ├─ 1.1 Sửa nhiễu siêu âm (P0)  ├─ 2.1 Thứ tự mạng trên chip (P0)
  ├─ 1.2 Test siêu âm (P1)       ├─ 2.2 Nhận LoRa từ MCU (P0)
  ├─ 1.3 Kiểm bộ đếm fe (P1)     ├─ 2.3 session_id (P1)
  └─ 1.4 ADC pin (P2)            └─ 2.4/2.5 Quyết định buffer + Flash (P2)

  ↓ cả hai báo "phần riêng P0 xong"

GIAI ĐOẠN 2 — CHUNG (bắt buộc có mặt cả hai + hai bo)
  ├─ 3.1 Tích hợp chuỗi thật (P0)
  ├─ 3.2 Đo khoảng cách LoRa (P1)
  └─ 3.3 10 000 frame (P1)

  ↓ PASS

GIAI ĐOẠN 3 — NGHIỆM THU
  ├─ 3.4 Soak 2 giờ + laptop sạch (P2)
  └─ Phong: 1.5 Yaw (P3, có thể làm trong lúc chờ)
```

**Mốc bắt đầu Giai đoạn 2:** cả hai nói "P0 phần riêng đã PASS kèm log".

---

## 5. Quy tắc phối hợp (tránh giẫm chân)

### 5.1. Ranh giới file

| Thư mục | Chỉ người này sửa |
| :--- | :--- |
| `firmware/mcu_payload/**` | Phong |
| `firmware/gateway_esp32/**` | Thịnh |
| `gcs/**` | Phong |
| `docs/interfaces/IF_MCU_LORA_RF.md` (IF-02) | Phong |
| `docs/interfaces/IF_MCU_SENSORS.md` (IF-00) | Phong |
| `docs/interfaces/IF_ESP32_GCS_WS.md` (IF-03) | Thịnh |
| `docs/verification/GATEWAY_TEST_PLAN.md` | Thịnh |
| `docs/hardware/**` | Phong |
| `scripts/test_firmware.ps1` | **Hỏi trước khi sửa** (dùng chung) |

### 5.2. Ba hợp đồng bất biến — KHÔNG tự đổi

| Hợp đồng | Nội dung | Hệ quả nếu lệch |
| :--- | :--- | :--- |
| **IF-02** | Layout 32 byte, CRC‑16 trên 30 byte đầu, sync `AA 55` | Gateway giải mã sai, dashboard hiện rác |
| **GV‑01** | Golden vector CRC `0x304E`, chuỗi hex 64 ký tự | Test một bên FAIL |
| **Tham số LoRa** | 433 MHz, SF7, BW125, CR 4/5, CRC on, sync `0x12`, preamble 8 | Hai bo không nói chuyện được |

### 5.3. Lưới an toàn chung

**Trước mỗi lần commit, chạy:**

```powershell
pwsh -File scripts/test_firmware.ps1
```

Script này chạy **cả hai bộ test** (MCU + gateway) nên lệch hợp đồng bị bắt ngay:

| Test | Bắt được gì |
| :--- | :--- |
| `test_kvc_ubx_cfg` | Khung UBX sai checksum |
| `test_kvc_gnss_neo_m10` | Parser NMEA hỏng |
| `test_rf_decode` | **Layout IF-02 lệch** (static_assert + GV‑01) |
| `test_net_policy` | Thứ tự STA/SoftAP sai |
| `pytest` | Parser Python lệch với C/C++ |

### 5.4. Khi cần đổi hợp đồng

1. **Báo người kia trước** — không sửa một mình.
2. Sửa theo thứ tự: doc → MCU → gateway → backend → cả hai test.
3. Chạy full suite, phải PASS toàn bộ.
4. Ghi ngày + lý do vào doc.

---

## 6. Tổng hợp bàn giao

| Mã | Việc | Owner | Đầu ra | Trạng thái |
| :--- | :--- | :--- | :--- | :--- |
| MCU‑1.1 | Sửa nhiễu RX siêu âm | Phong | Log 60 s, `byt≈4` `fe=0` | CHƯA LÀM |
| MCU‑1.2 | Test driver siêu âm | Phong | `test_kvc_usound_decode.c` PASS | CHƯA LÀM |
| MCU‑1.3 | Kiểm bộ đếm `fe` | Phong | Bảng số liệu 3 cổng | CHƯA LÀM |
| MCU‑1.4 | ADC pin | Phong | Sơ đồ + log + so VOM | CHƯA LÀM |
| MCU‑1.5 | Yaw từ GNSS | Phong | Code + test + giới hạn | CHƯA LÀM |
| GW‑2.1 | Thứ tự mạng trên chip | Thịnh | 3 đoạn log Serial | CHƯA LÀM |
| GW‑2.2 | Nhận LoRa từ MCU | Thịnh | Log 60 s, ≥55 gói | CHƯA LÀM |
| GW‑2.3 | `session_id` đổi mỗi boot | Thịnh | 2 JSON envelope | CHƯA LÀM |
| GW‑2.4 | Quyết định buffer IF‑03 | Thịnh | Code hoặc doc đã sửa | CHƯA LÀM |
| GW‑2.5 | Quyết định Flash 82,2 % | Thịnh | Ghi vào `GATEWAY_BUILD.md` | CHƯA LÀM |
| SH‑3.1 | Tích hợp chuỗi thật | **Cả hai** | Ảnh dashboard + 2 log | CHƯA LÀM |
| SH‑3.2 | Đo khoảng cách LoRa | **Cả hai** | Bảng RSSI/SNR/mất gói | CHƯA LÀM |
| SH‑3.3 | 10 000 frame | **Cả hai** | Bảng thống kê | CHƯA LÀM |
| SH‑3.4 | Soak 2 h + laptop sạch | **Cả hai** | Checklist PASS/FAIL | CHƯA LÀM |

---

## 7. Giới hạn đã biết (không phải bug, nhưng phải ghi nhận)

| Giới hạn | Ảnh hưởng | Cách xử lý |
| :--- | :--- | :--- |
| **Chưa có Yaw** | Georef chỉ đúng khi camera hướng Bắc | MCU‑1.5 |
| **Không có FPGA RTL** | `target_x_local`/`target_y_local` = 0 | Dùng `scripts/manual/mock_fpga_bbox.py` |
| **Chưa có ADC pin** | Dashboard hiện N/A | MCU‑1.4 |
| **Flash gateway 82,2 %** | Không đủ OTA kép | GW‑2.5 |
| **IHRC ±2 %** | Time base trôi tới 2 % | Chấp nhận; muốn ppm phải hiệu chuẩn bằng 1PPS |
| **Mode 4 không có datasheet timing** | Timeout 100 ms là giả định | Đo trên kit khi sửa MCU‑1.1 |

---

## 8. Tài liệu liên quan

| Tài liệu | Dùng để |
| :--- | :--- |
| `docs/architecture/KVC_PROJECT_STATUS.md` | Trạng thái tổng thể + nhãn xác minh |
| `docs/interfaces/IF_MCU_LORA_RF.md` | Hợp đồng IF‑02 (bất biến) |
| `docs/interfaces/IF_ESP32_GCS_WS.md` | Hợp đồng IF‑03 |
| `docs/interfaces/IF_MCU_SENSORS.md` | Đặc tả cảm biến + ngưỡng GNSS |
| `docs/hardware/sensors/SENSOR_PACKAGES.md` | Datasheet + hash + mâu thuẫn tài liệu |
| `docs/verification/GATEWAY_TEST_PLAN.md` | Kịch bản kiểm thử gateway |
| `docs/configuration/MCU_BUILD_KEIL.md` | Build MCU |
| `docs/configuration/GATEWAY_BUILD.md` | Build gateway |
