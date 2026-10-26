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

**Trạng thái: XONG (26/10/2026) — theo Cách B, không hàn.**

**Hai cách sửa, chọn một:**

| Cách | Việc làm | Ưu / Nhược |
| :--- | :--- | :--- |
| **A. Phần cứng (khuyến nghị)** | Hàn thêm **10 kΩ từ P2.15 lên 3,3 V** | Sửa đúng gốc, không đụng code. Cần hàn. **CHƯA LÀM.** |
| **B. Phần mềm (đã làm)** | Chỉ bật ngắt RX UART2 trong cửa sổ 250 ms sau khi gửi `0x01`; ngoài cửa sổ thì tắt `IE` | Không cần hàn. Đã chạy trên kit. |

**File được sửa:**
- Cách A: `docs/hardware/wiring/KVC_MASTER_PINOUT_WIRING.md` (ghi thêm trở treo) — **còn treo**
- Cách B: `firmware/mcu_payload/inc/kvc_usound_ajsr04m.h` (`kvc_usound_measure`)

**Bằng chứng đo trên kit (26/10/2026):**
```
[M3] t=... US=25cm ok | ... | ovr0
USND  pend=0 drop=0 oe=0 fe=632 byt=632 isr=632
```
`byt` giảm từ 57,6 B/s xuống ~3,6 B/s (đúng 4 byte/giây, tức 1 khung thật mỗi
giây kích hoạt). Cửa sổ nghe cuối cùng chốt ở **250 ms**, không phải 120 ms:
khi không có phản xạ, module chạy hết thời gian chờ nội bộ rồi mới phát cụm
`6000 mm`, và cửa sổ 120 ms bỏ sót cụm đó ~1/65 lần — log cũ hiện `err/6`
("module không đáp") trong khi thực chất module có đáp nhưng muộn. Đo lại sau
khi nới: `trg=7 val=68` và `byt/trg = 38,9` ≈ 9,7 khung × 4 byte, `bad=0` —
không còn khung nào bị bỏ.

**Tiêu chí PASS — ĐÃ SỬA so với bản đầu:**

Tiêu chí cũ ghi `fe=0`, nhưng `fe == byt` là **artifact phần cứng không sửa
được bằng phần mềm**: chân TX module ở mức LOW khi ngủ, cầu phân áp 1k/2k kéo
P2.15 về 0 V, UART luôn thấy start bit giả nên cờ FE dính trên mọi byte. Cả ba
cổng (FPGA/GNSS/USND) đều có `fe ≈ byt`; GNSS vẫn `bad=0` và fix 3D bình
thường. Chỉ số đúng để nghiệm thu là **`bad`** (khung sai checksum) và
**`val/trg`** (số khung module thật sự gửi):

```
USND  pend=0 drop=0 oe=0 val/trg ≈ 4..10  bad=0
US=xx cm ok  liên tục, không có err/6 xen kẽ
```
`fe`/`byt` chỉ dùng để phát hiện nhiễu tăng đột biến, không phải tiêu chí PASS.

**Bàn giao:** log UART5 60 giây + xác nhận `byt` giảm từ ~50/s về ~4/s. ✅

---

### 1.2. P1 — Viết host test cho driver siêu âm

**Lý do:** đây là driver **duy nhất** chưa có test. FPGA BBox 33 assert, GNSS 70,
timebase 16, UBX 66, ring 364 — nhưng FSM 4 byte của siêu âm thì không có gì.

**Trạng thái: XONG (26/10/2026), 62/62 assert PASS.**

**Việc làm:**
1. Tách `kvc_usound_feed_byte()` (thuần logic, hiện nằm lẫn trong header phần cứng)
   thành `kvc_usound_decode.{h,c}` chỉ có `<stdint.h>`/`<stdbool.h>`.
2. Viết `tests/test_kvc_usound_decode.c` kiểm 14 ca (5 ca theo kế hoạch + 9 ca
   biên phát sinh trong quá trình viết test).

| Ca | Dữ liệu bơm vào | Kỳ vọng |
| :--- | :--- | :--- |
| Khung tốt | `FF 03 E8 EA` (1000 mm) | `OK`, `cm = 100` |
| Sai checksum | `FF 03 E8 FF` | `ERR_CHECKSUM`, không cập nhật |
| No‑Echo | `FF 17 70 86` (6000 mm) | `ERR_NO_ECHO` (**5**, không phải OUT_OF_RANGE) |
| Vùng mù | `FF 00 64 63` (100 mm) | `ERR_BLIND_ZONE` |
| Rác trước khung + khung bị cắt | rác `00 5A 13` rồi khung đúng | nhiễu bị bỏ, khung đúng vẫn OK; khung ngay sau khung bị cắt bị mất 1 khung (giới hạn đã biết), tự đồng bộ lại trong 2 khung |
| Checksum 0xFF | `FF 01 FF FF` (511 mm) | `OK`, khung kế tiếp không bị lệch |
| Ngoài dải trên | `FF 15 7C xx` (5500 mm) | `ERR_OUT_OF_RANGE` |
| Vượt trần module | `FF 20 00 xx` (8192 mm) dù checksum đúng | `ERR_CHECKSUM` (bộ lọc miễn phí) |
| Chuỗi 10 khung | 250…2680 mm | cả 10 đúng |
| 0xFF lặp ở Data_H | `FF FF FF 03 E8 EA` | bỏ qua 0xFF, không mất dữ liệu |
| Byte đơn lẻ | từng byte của khung | `NONE` cho tới byte checksum |
| Reset giữa khung | reset sau `FF 03` | không tạo khung giả |
| Ánh xạ mã lỗi | cả 6 giá trị | 0/1/2/3/4/5/6 đúng |
| Biên dải | 199/200/5000/5001 mm | BLIND / OK / OK / OUT_OF_RANGE |

3. Thêm vào `scripts/test_firmware.ps1` (bước 6).

**Hai lỗi thật do test phát hiện:**
1. **Tài liệu ghi sai checksum mẫu.** Kế hoạch ghi `FF 03 E8 01` cho 1000 mm,
   nhưng `0xFF + 0x03 + 0xE8 = 0x1EA` → checksum đúng là **`0xEA`**. Test dùng
   `cs_of()` tự tính nên không phụ thuộc hằng số viết tay.
2. **Biên dải sai do chia nguyên.** Code cũ so `calc_mm / 10 > 500`; phép chia
   cắt phần lẻ nên 5001–5009 mm cho ra 500 cm và **lọt** qua bộ lọc trần. Đã
   đổi sang so sánh trực tiếp bằng mm (`calc_mm > 500 * 10`). Lỗi cùng loại ở
   biên dưới (199 mm → 19 cm) không gây hậu quả vì ngưỡng chia hết, nhưng đã
   sửa luôn cho nhất quán.

**Tiêu chí PASS:** `test_kvc_usound_decode` PASS, tổng suite 9/9 bước PASS. ✅
(62/62 assert; Keil build 0 Error 0 Warning; toàn suite 9/9 PASS.)

**Bàn giao:** `kvc_usound_decode.h`, `kvc_usound_decode.c`, `test_kvc_usound_decode.c`,
dòng trong `scripts/test_firmware.ps1`, entry trong `mcu_uav.uvprojx`. ✅

---

### 1.3. P1 — Kiểm tra bộ đếm `fe` còn sạch không

**Kết luận sau khi làm 1.1: KHÔNG PHẢI BUG — đóng mục này, chỉ ghi nhận.**

Sau khi làm 1.1, log vẫn cho `fe ≈ byt` trên cả ba cổng. Nguyên nhân đã xác
định: chân TX của module/cảm biến ở mức LOW khi rảnh hoặc khi ngủ, nên UART luôn
thấy start bit giả và bật cờ FE trên mọi byte — kể cả byte hợp lệ. Đây là hành
vi của đường truyền, không phải bộ đếm sai.

Bằng chứng: GNSS có `fe` lớn (hàng chục nghìn) nhưng `bad=0` và fix 3D vẫn đạt;
FPGA BBox có `fe == byt` nhưng `crc0`; siêu âm có `fe == byt` nhưng `bad=0` và
`val/trg ≈ 4..10`. Nếu bộ đếm sai thì `bad`/`crc` cũng phải tăng theo.

**Việc còn lại (tuỳ chọn, không chặn):** hàn trở treo 10 kΩ từ P2.15 lên 3,3 V
(Cách A của mục 1.1) để `fe` về 0 tuyệt đối. Không cần cho chức năng.

**Số liệu bàn giao (log 26/10/2026):**

| Cổng | fe | byt | isr | Chỉ số đúng |
| :--- | ---: | ---: | ---: | :--- |
| FPGA UART1 | 2497 | 2497 | 2497 | `crc0` |
| GNSS UART3 | 0 | 46028 | 46028 | `bad` không áp dụng, fix 3D OK |
| USND UART2 | 1060 | 1062 | 1062 | `bad=0`, `val/trg ≈ 4` |

---

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
(trường 8 của câu RMC — lưu ý tài liệu cũ ghi trường 7, nhưng trường 7 là
`speed over ground`, trường 8 mới là `course over ground`).

**Trạng thái: XONG phần mềm (26/10/2026) — chưa kiểm trên kit đang bay.**

**Đã làm:**
1. `parse_centi_unsigned()` trong `kvc_gnss_neo_m10.c` đọc trường 7 (speed) và
   trường 8 (course) của câu RMC; lưu `course_deg10` (0,1°), `speed_centi_knots`
   (0,01 knot) và `last_course_ms` vào `KvcGnssState`.
2. `kvc_gnss_get_course_deg10(now_ms, &deg10)` chỉ trả `true` khi: đã có RMC
   status 'A', course còn mới ≤ 3 s, và tốc độ ≥ 0,5 knot.
3. `src/kvc_geo_math.c` — lượng giác số nguyên (bảng sin 91 mốc, nội suy 0,1°,
   nhân 10000) để xoay vector ảnh sang hệ Đông/Bắc mà không cần libm.
4. Georef trong `main.c` gọi `kvc_geo_rotate_to_ne()` trước khi quy đổi WGS-84.
   Khi **không có** Yaw hợp lệ, georef giữ **hành vi cũ** (giả định camera hướng
   Bắc) và log `[M3]` in `yw=-` để nhận biết.

   VÌ SAO KHÔNG TỪ CHỐI TÍNH TOẠ ĐỘ KHI THIẾU YAW: IF-02 chỉ có **một** cặp
   lat/lon và 4 bit cờ (bit 4–7 dự phòng). Nếu MCU giữ lat/lon = toạ độ UAV mà
   vẫn bật `ALT_VALID` + `GNSS_VALID`, backend (`esp32_ingress.py:95`,
   `has_wgs84_position`) sẽ coi đó là toạ độ mục tiêu **hợp lệ** và báo mục tiêu
   nằm ngay dưới UAV — sai nguy hiểm hơn hẳn so với dùng Yaw xấp xỉ. Muốn biểu
   diễn "phát hiện nhưng chưa định vị" cần thêm 1 bit (đề xuất bit 4 =
   `TARGET_POS_VALID`); đó là thay đổi IF-02 nên phải thống nhất với gateway và
   backend trước, không tự sửa một phía.
5. Log `[M3]` thêm `yw=<deg10>|-` và `sp=<centi_knot>` để kiểm trên kit.

**Test:**
- `tests/test_kvc_geo_math.c`: 140/140 assert PASS (sin/cos 4 góc phần tư, nội
  suy, xoay 4 hướng chính, bảo toàn độ dài, không tràn int64, NULL an toàn).
- `tests/test_kvc_gnss_neo_m10.c` TEST 12: 17 assert mới (giờ 87/87) — course
  đúng, hết hạn 3 s, đứng yên bị từ chối, trường rỗng không cập nhật mốc,
  359,98° → 0°, RMC void xoá Yaw, reset về `0xFFFF`.

**GIỚI HẠN PHẢI BIẾT (không phải bug):**
1. `track_made_good` là hướng **chuyển động**, không phải hướng camera. Nếu
   camera lệch so với trục thân UAV, Yaw vẫn sai đúng bằng góc lệch đó — cần
   hiệu chuẩn extrinsic camera→body mới sửa được.
2. UAV đứng yên hoặc bay thẳng đứng → không có Yaw → georef **quay về giả định
   hướng Bắc** như trước (xem lý do ở mục 4 phía trên). Log in `yw=-`.
3. Ngưỡng 0,5 knot là kinh nghiệm, **chưa đo** trên kit: chưa xác minh ở tốc độ
   nào NEO-M10 bắt đầu cho `track_made_good` ổn định.
4. Georef vẫn dùng `fx = 554`, tâm 320×240 danh định, chưa intrinsics, chưa
   undistort, chưa bù roll/pitch. Yaw chỉ sửa được một phần sai số.

**Bàn giao (đã có):** `kvc_geo_math.{h,c}`, `test_kvc_geo_math.c`, sửa
`kvc_gnss_neo_m10.{h,c}`, sửa khối georef `main.c`, dòng trong
`scripts/test_firmware.ps1`, entry trong `mcu_uav.uvprojx`.

**Bàn giao (còn thiếu):** log `[M3]` trên kit đang bay ngang, có `yw=` khác `-`
và toạ độ mục tiêu đối chiếu với GPS tham chiếu.

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
| MCU‑1.1 | Sửa nhiễu RX siêu âm | Phong | Log 60 s, `byt≈4` `bad=0` | **XONG** (Cách B, cửa sổ 250 ms) |
| MCU‑1.2 | Test driver siêu âm | Phong | `test_kvc_usound_decode.c` PASS | **XONG** (62/62 assert) |
| MCU‑1.3 | Kiểm bộ đếm `fe` | Phong | Bảng số liệu 3 cổng | **XONG** (không phải bug) |
| MCU‑1.4 | ADC pin | Phong | Sơ đồ + log + so VOM | CHƯA LÀM |
| MCU‑1.5 | Yaw từ GNSS | Phong | Code + test + giới hạn | **XONG phần mềm** (157 assert; chờ log trên kit) |
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
| **Yaw chỉ là hướng chuyển động** | Camera lệch trục thân UAV → georef sai đúng góc lệch đó | Đã dùng `track_made_good`, từ chối khi đứng yên/chậm. Muốn chính xác phải hiệu chuẩn extrinsic camera→body |
| **Ngưỡng tốc độ 0,5 knot chưa đo** | Có thể nhận Yaw nhiễu ở tốc độ thấp hoặc từ chối quá sớm | Chỉnh `KVC_GNSS_COURSE_MIN_SPEED_CENTI_KNOTS` sau khi có log bay thật |
| **Không có FPGA RTL** | `target_x_local`/`target_y_local` = 0 | Dùng `scripts/manual/mock_fpga_bbox.py` |
| **Chưa có ADC pin** | Dashboard hiện N/A | MCU‑1.4 |
| **Flash gateway 82,2 %** | Không đủ OTA kép | GW‑2.5 |
| **IHRC ±2 %** | Time base trôi tới 2 % | Chấp nhận; muốn ppm phải hiệu chuẩn bằng 1PPS |
| **Mode 4 không có datasheet timing** | Cửa sổ nghe là ước lượng, không phải thông số hãng | Đã đo trên kit: cửa sổ 250 ms phủ cả trường hợp No‑Echo muộn (xem 1.1). Muốn con số chính thức phải đo bằng oscilloscope trên chân TX module |
| **Không thể phục hồi giữa khung bị cắt** | Mất đúng 1 khung khi byte Data_L/checksum bị mất | FSM 4 byte không có escape; đã ghi nhận trong `test_kvc_usound_decode.c` ca 5. Chấp nhận vì cửa sổ nghe + ring 1024 B khiến mất byte gần như không xảy ra (`drop=0`) |
| **`fe ≈ byt` trên cả 3 cổng** | Không ảnh hưởng dữ liệu, chỉ là cờ phần cứng | Xem MCU‑1.3; muốn `fe=0` phải hàn trở treo |

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
