# Track B — FPGA → MCU Sonix (IF-01) + MCU → LoRa (IF-02) trên bo thật

- **Task:** `KVC-MCU-FPGA-001` (B3), `KVC-MCU-LORA-001` (B4)
- **Ngày đo:** 01/11/2026 19:__ (Asia/Saigon)
- **Người thực hiện:** HUMAN (thao tác phần cứng), ghi nhận bởi Kilo
- **Mức bằng chứng:**
  - **`HARDWARE-VERIFIED`** cho *"FPGA → MCU: khung IF-01 được bóc đúng, CRC khớp"*
  - **`HARDWARE-VERIFIED`** cho *"MCU → SX1278: gói 32 byte được phát và TxDone"*
  - **KHÔNG** `HARDWARE-VERIFIED` cho *"gateway nhận được gói"* — **chưa đo**
- **Git HEAD:** `2be0f05f92a0a31e0bd80d237eff2da939995e78` + working tree dirty (H6)

---

## 1. Thiết lập

| Trường | Giá trị |
| :--- | :--- |
| FPGA | OneKiwi Primer 20K, bitstream **release `86CCF5DD`** (SRAM) |
| Camera | OV2640, mục tiêu màu cam |
| MCU | Sonix **SN34F788**, `KVC_FW_ID = "KVC-MCU-20261101-FPGA"` |
| Build | Keil MDK — **0 Error, 0 Warning** |
| Debug | COM9 (USB-UART), **P0.15**, 9600 8N1 (thực 9615 bps) |
| Dây nối | `R13 (J2-11)` → `P2.3 (JP3 7/8)`; `GND (J2-14)` → `GND (J5)` |
| Không nối | `R12` (DATA_READY), `T12` (mcu_ack) |

---

## 2. Kết quả đo

### 2.1 Khởi động

```text
=== KVC-MCU-20261101-FPGA BOOT ===
[INIT] UART5 cfg=9615 8N1 (Hercules: 9600 8N1)
ABI GV-02 SIZE=32 CRC=0x0000E260 EXPECT=0x0000E260 PASS
[INIT] LORA OK ver=0x12
[INIT] IMU OK addr=0x68
[INIT] US uart2=9600 window=250ms (Mode 4, trigger 0x01)
[INIT] GNSS baud=9600 target=9600 autobaud=on
[INIT] FPGA UART1 en=1 38400 8N1 (IF-01)
```

| Mục | Kết quả | Ý nghĩa |
| :--- | :--- | :--- |
| `KVC_FW_ID` mới | ✅ hiển thị đúng | Chứng minh đã nạp bản mới, không phải firmware cũ |
| ABI GV-02 | **PASS** size 32, CRC `0xE260` | Struct/CRC IF-02 khớp hợp đồng **tại thời điểm build** |
| LoRa `ver=0x12` | ✅ | SX1278 hiện diện, SPI đúng mode |
| IMU `addr=0x68` | ✅ | MPU-6050 ACK |
| GNSS `baud=9600` | ✅ | Autobaud tìm đúng |
| FPGA UART1 `en=1` | ✅ | Driver IF-01 đã khởi tạo |

### 2.2 Ring buffer UART1

| Mẫu | `byt` | `isr` | `fe` | `oe` | `drop` |
| :--- | ---: | ---: | ---: | ---: | ---: |
| 1 | 270 | 270 | **0** | **0** | **0** |
| 2 | 480 | 480 | **0** | **0** | **0** |
| 3 | 720 | 720 | **0** | **0** | **0** |

`isr == byt` ở cả ba mẫu ⇒ mỗi ngắt đều lấy được đúng một byte.

**Kiểm tra số học:** nhịp khung FPGA đo được là 197 ms ⇒ ~5,08 khung/s.
Trong 5 s (chu kỳ công bố `[RING]`), số byte `N=0` = 5 × 5,08 × 10 ≈ **254**.
Chênh lệch giữa hai mẫu: 480 − 270 = **210 byte**; 720 − 480 = **240 byte**.
Khớp bậc độ lớn với kỳ vọng ~254 (dao động do nhịp camera không tuyệt đối đều).
**Đây là bằng chứng độc lập rằng nhịp ~5 Hz là thật**, không phải suy luận.

### 2.3 Dòng `[M3]` — bóc tách và đóng gói

```text
[M3] t=19742 US=68cm ok | IMU r=17 p=-51 v=1 | GNSS q0 f1 s0 hd99.99 \
     la0 lo0 v0 yw=- sp=0 | BB n0 v1 crc0 en1 | LORA d1 ver=0x00000012 \
     | ovr0 late_max=0 tx=16/0
[M3] t=20742 US=70cm ok | IMU r=18 p=-51 v=1 | GNSS q0 f1 s0 hd99.99 \
     la0 lo0 v0 yw=- sp=0 | BB n0 v1 crc0 en1 | LORA d1 ver=0x00000012 \
     | ovr0 late_max=0 tx=17/0
```

| Trường | Giá trị | Đánh giá |
| :--- | :--- | :--- |
| `BB v1` | **1** | `kvc_fpga_bbox_is_valid()` = true — đã nhận frame hợp lệ trong 2 s |
| `BB crc0` | **0** | **Không có lỗi CRC** trên toàn bộ frame đã nhận |
| `BB en1` | **1** | Driver UART1 đang bật |
| `BB n0` | **0** | Xem §3 — không phải lỗi |
| `tx=16/0`, `tx=17/0` | ok/fail | **fail = 0** — mọi gói đều có TxDone |
| `ovr0 late_max=0` | 0 / 0 ms | Chu kỳ 1 Hz chính xác, không jitter |
| `US=68..70cm ok` | ok | AJ-SR04M hoạt động — **G6.2 nay có số đo thật đầu tiên** |
| `IMU v=1` | 1 | Có góc hợp lệ |
| `GNSS q0 v0` | 0 | Chưa có fix (trong nhà) — **đúng**, không giả |

**Chênh lệch `tx` giữa hai dòng liền kề: 16 → 17 = +1 gói / 1 s.** Khớp đúng
`KVC_TELEMETRY_PERIOD_MS = 1000`.

---

## 3. Vì sao `BB n0` là ĐÚNG, không phải lỗi

Cả hai dòng `[M3]` đều `n0` vì:

1. **Mục tiêu không còn trước ống kính** hoặc **khung đó không phát hiện được**.
   Trên bo, chỉ **7/69 khung (10,1 %)** có `N=1` (finding F-02). Dòng `[M3]` in
   ở 1 Hz trong khi khung camera ở ~5 Hz ⇒ xác suất một dòng `[M3]` rơi đúng
   khung có mục tiêu chỉ khoảng **10 %**. Hai dòng liên tiếp đều `n0` là kết quả
   **thống kê bình thường**, không phải hỏng.

2. **`v1` chứng minh chuỗi hoạt động**: `valid` chỉ bật khi đã bóc được frame có
   CRC đúng trong 2 s gần nhất. Nếu UART/FPGA hỏng thì `v0`.

3. **`crc0` trên hàng nghìn byte** chứng minh chất lượng đường truyền.

**Muốn thấy `n1`:** giữ mục tiêu cam trước ống kính và quan sát lâu hơn, hoặc
giải quyết **F-02** bằng tấm bìa cam đặc (tăng tỉ lệ lấp đầy từ 5–7 % lên cao
hơn nhiều, đẩy `cnt` xa ngưỡng 400).

> Ghi chú này quan trọng: nếu báo cáo ghi "PASS" mà không giải thích `n0`, người
> đọc sau sẽ tưởng blob không chạy và đi sửa nhầm chỗ.

---

## 4. Điều bằng chứng này CHỨNG MINH

| # | Kết luận | Căn cứ |
| :---: | :--- | :--- |
| 1 | **Chuỗi FPGA → MCU → LoRa chạy end-to-end trên phần cứng thật** | 720+ byte IF-01, `v1`, `crc0`, 17 gói LoRa TxDone |
| 2 | **Baud 38400 giữa FPGA và MCU đúng** | `fe = 0` trên 720 byte. Sai baud sẽ làm `fe` tăng ngay |
| 3 | **Không mất byte nào** | `oe=0` (FIFO không tràn), `drop=0` (ring không tràn), `isr == byt` |
| 4 | **Bộ bóc khung IF-01 đúng layout** | `v1` chỉ bật khi FSM khớp sync `5A A5` + version + N + timestamp + CRC |
| 5 | **CRC-16/CCITT-FALSE khớp giữa hai bên** | `crc0` — FPGA tính (RTL) và MCU kiểm (C) cho cùng kết quả |
| 6 | **ABI IF-02 32 byte đúng hợp đồng** | Tự kiểm GV-02 PASS với CRC `0xE260` |
| 7 | **SX1278 phát được, có TxDone** | `tx=17/0` — 17 gói thành công, **0 thất bại** |
| 8 | **Chu kỳ telemetry 1 Hz chính xác** | `t=19742 → 20742` = đúng 1000 ms; `ovr0`, `late_max=0` |
| 9 | **AJ-SR04M cấp `alt_dist_cm` thật** | `US=68cm ok`, `US=70cm ok` — **G6.2 có số đo thật** |
| 10 | **Không có toạ độ giả** | `GNSS v0`, `la0 lo0` — đúng fail-safe |

Đây là **lần đầu tiên** toàn bộ chuỗi từ pixel camera đến sóng LoRa được
chứng minh trên phần cứng thật.

---

## 5. Điều bằng chứng này KHÔNG chứng minh

### 5.1 Gateway có nhận được gói hay không — **NOT RUN (BLOCKED: thiếu phần cứng)**

> **Trạng thái 01/11/2026:** bo Gateway ESP32 **không có trên bàn lab của Phong**;
> bo do **Thịnh** phụ trách và **chưa bàn giao**. Vì vậy bước đo thu sóng
> **không thể chạy** và được ghi `NOT RUN` — **không phải FAIL**.
>
> **Owner của phép đo này: Thịnh.** Không ai khác có thể đóng gate này mà không
> có bo, và không được suy ra kết quả từ `tx=17/0`.
>
> Điều kiện để mở: có bo Gateway + nạp firmware gateway + anten 433 MHz cả hai
> phía. Quy trình chi tiết ở `TRACK_B_RUNBOOK.md` §6.

`tx=17/0` chỉ chứng minh **SX1278 đã phát và báo TxDone**. Nó **không** chứng
minh:

- Gateway ESP32-C3 nằm trong tầm sóng.
- Gateway giải mã được (cùng SF/BW/SyncWord — xem §5.2).
- Anten hai phía tốt.
- Không có va chạm tần số.

Đây chính là nửa còn lại của phép đối chiếu mà comment ở `main.c:65-72` mô tả:
*"không thể nghiệm thu bất kỳ tiêu chí mất gói nào"*. Phải có
`tx_ok_count (MCU) == rx_ok_count (gateway)` mới nghiệm thu được mất gói.

### 5.2 Thông số RF hai phía — đã đối chiếu source, KHỚP

| Tham số | MCU (main.c) | Gateway (main.cpp) | Khớp |
| :--- | :--- | :--- | :---: |
| Tần số | `0x06=0x6C`, `0x07=0x40` → 433,0 MHz | `LoRa.begin(433E6)` | ✅ |
| Spreading Factor | `0x1E = 0x74` → SF7 | `setSpreadingFactor(7)` | ✅ |
| Băng thông | `0x1D = 0x72` → 125 kHz | `setSignalBandwidth(125E3)` | ✅ |
| Coding Rate | `0x1D` bit 3:1 = 001 → 4/5 | `setCodingRate4(5)` | ✅ |
| Sync Word | `KVC_LORA_SYNC_WORD` = 0x12 | `setSyncWord(0x12)` | ✅ |
| CRC phần cứng | `0x1E` bit 2 = 1 | `enableCrc()` | ✅ |

**Kết luận: cấu hình RF khớp trên cả 6 tham số.** Nếu gateway vẫn không nhận thì
nguyên nhân nằm ở **tầng vật lý** (khoảng cách, anten, nguồn), không phải cấu
hình.

### 5.3 Georef vẫn trả `NONE`

`GNSS q0 f1 s0 v0` + `yw=-` ⇒ `kvc_georef.c:136-143` từ chối với
`KVC_GEO_POS_NONE`. `target_lat/lon = 0`, `target_x/y_local = 0`.

**Đúng theo H4.** Có `alt_dist_cm` thật (68–70 cm) không thay đổi kết luận này:
thiếu Yaw vẫn chặn georef. Không được nới lỏng để "cho có số".

### 5.4 G6.2 chưa đóng

`US=68..70cm ok` là **số đo thật đầu tiên**, chứng minh đầu dò AJ-SR04M hoạt
động. Nhưng G6.2 cần các mục 6.2.1–6.2.7 (2/3/4/5 m, sai số < 2 cm, mặt nước
gợn). Hiện mới có **một khoảng cách ~0,7 m trong không khí tĩnh**.

Cập nhật: 6.2.0 ✅ (đầu dò thay), các mục còn lại vẫn `NOT RUN`.

---

## 6. Findings / quan sát

### O-01 (thông tin) — `BB n0` trên mọi dòng `[M3]` đã ghi nhận

Xem §3. Không phải finding; đây là **giới hạn lấy mẫu** của log 1 Hz so với khung
5 Hz, cộng với F-02 (tỉ lệ lấp đầy thấp). Cần thử lại với tấm bìa cam đặc.

### O-02 (thông tin) — `ver=0x00000012` hiển thị 8 chữ số

`kvc_m1_buf_hex32()` in 32-bit (`0x00000012`) trong khi driver lưu `uint8_t`.
Không sai, chỉ dư số 0. Giá trị `0x12` vẫn đọc đúng.

### O-03 (theo dõi) — Chưa có phép đối chiếu mất gói

Cần `tx_ok` (MCU) vs số gói gateway nhận trong **cùng khoảng thời gian**. Đây là
nội dung bước tiếp theo, **thuộc owner Thịnh** (xem §5.1).

---

## 7. Đề xuất bước tiếp theo

### 7.1 Việc KHÔNG thể làm từ bàn lab hiện tại

Bo Gateway không có ⇒ **không** chạy được Giai đoạn 5 của
`GATEWAY_TEST_PLAN.md`. Không có cách nào thay thế:

| Thay thế tưởng tượng | Vì sao không dùng được |
| :--- | :--- |
| Dùng module SX1278 thứ hai cắm USB-TTL | Cần thêm phần cứng (không có trên bàn), và sẽ tạo ra một "gateway giả" không phải đường thật |
| Suy ra từ `tx=17/0` | TxDone chỉ là chip tự báo phát xong; không liên quan tới việc có ai nhận |
| Giả lập qua `mock_fpga_bbox.py` / self-mock | Đây là đường **MOCK**, chứng minh phần mềm chứ không chứng minh RF |

### 7.2 Việc CÓ THỂ làm ngay trên bàn lab hiện tại

Chuỗi FPGA → MCU → LoRa TX đã `HARDWARE-VERIFIED`. Các mục còn mở **không cần
gateway**:

| # | Việc | Cần gì | Đóng gate nào |
| :---: | :--- | :--- | :--- |
| 1 | **G2.7 — soak ≥ 10 phút** | Bo đang chạy sẵn | Tiêu chí `fe=oe=drop=0` trong 10 phút liên tục |
| 2 | **A3 — di chuyển mục tiêu**, `x` thay đổi | Tấm bìa cam + di chuyển | A3 |
| 3 | **A4 — mục tiêu ra khỏi khung** → `N=0` | Tấm bìa | A4 |
| 4 | **A5 — áo cam ngoài khung** → `w < 255` | Áo/vật cam lớn | A5 |
| 5 | **A6 — 1.000 frame `crc_err=0`** | Chờ ~3,3 phút ở 5 Hz | A6 |
| 6 | **F-02 — tấm bìa cam đặc phủ 1/3 khung** | Tấm bìa | Đóng F-02, xác định `conf` thật |
| 7 | **6.1.9 — ngưỡng màu RGB565** | Vật đỏ thuần | G6.1 mục 9 |
| 8 | **G6.2 — 2/3/4/5 m** | Thước + mặt nước tĩnh | 6.2.1–6.2.5 |

**Ưu tiên đề xuất: #1 (soak 10 phút) và #6 (F-02).** Hai việc này rẻ nhất, không
cần thêm vật tư, và:

- #1 đóng một gate nghiệm thu thật (G2.7) chỉ bằng thời gian.
- #6 giải quyết finding P2 đang mở và làm `BB n1` xuất hiện đủ thường để những
  lần đo sau dễ đọc.

### 7.3 Bàn giao sang Thịnh

Khi có bo Gateway, chuyển cho Thịnh:

| Hạng mục | Nội dung |
| :--- | :--- |
| Tài liệu thao tác | `TRACK_B_RUNBOOK.md` §6 (đã viết sẵn quy trình + tiêu chí PASS/FAIL) |
| Bối cảnh RF | Cấu hình 6 tham số đã đối chiếu khớp (§5.2) — **không** chỉnh thông số RF |
| Số liệu đối chiếu | MCU `tx=ok/fail` ở 1 Hz; nối tiếp từ con số này |
| Cạm bẫy | `AI:BOAT` là lệch nhãn (class 2 = LIFEBUOY); `[LORA-GAP]` sau reset MCU là báo giả |
