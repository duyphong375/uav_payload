# Đặc tả giao diện: FPGA OneKiwi ↔ MCU Tải Sonix (UART BBox)

- **Mã giao diện:** `IF-01`
- **Hai đầu kết nối:** FPGA OneKiwi Primer 20K (**Nguyễn Tất Vững** - Đầu phát TX) ↔ MCU Sonix SN34F788 (**Nguyễn Tá Duy Phong** - Đầu nhận RX)
- **Trạng thái:** `ACTIVE` — 38.400 bps và N ≤ 12 đã chốt 31/10/2026 (B-1, B-2).
- **Bằng chứng:** **`HARDWARE-VERIFIED` TOÀN DIỆN (FPGA ↔ MCU Sonix)** (31/10/2026) —
  - **FPGA → PC (G2.2/G2.3): ĐÓNG.** 1.102/1.102 frame PASS, 100,0 FPS, 0 byte lỗi, 0 CRC error; capture 28.672 byte tại `docs/verification/evidence/capture_01.bin`.
  - **FPGA → MCU Sonix (G2.4): ĐÓNG.** `fe=0`, `oe=0`, `drop=0`, `pend=0` trên **197.844 byte (7.609 frame IF-01 liên tiếp)**; `isr == byt` ở cả hai mẫu; `BB n2 v1 crc0` trên 21/21 dòng log. Chi tiết: `docs/verification/evidence/G2.4_mcu_log_20261031.md`.
  - 17 testbench PASS. **Sai số baud 37.500 vs 38.400 đã được chứng minh chấp nhận được trên phần cứng** — xem §1.5.
  - *Lưu ý:* timebase MCU chạy chậm ~1,6–2,3× so với thực tế (phát hiện khi đối chiếu `byt` với trần vật lý UART). Không ảnh hưởng kết luận IF-01 nhưng làm `timestamp_ms` của IF-02 lệch — cần task riêng.
- **Trạng thái phía FPGA (31/10/2026, sau P1):** 4 lỗi P0 đã sửa — `uart_tx` start bit, endianness `bbox_packetizer`, `yolo_nms` `IOU_THRESH`, `width/height` bbox. CNN/NMS tạm loại khỏi datapath. Bitstream hiện tại là **camera → mock bbox → packetizer → UART**, không chứa YOLO11n. Phía MCU hỗ trợ vắng mặt qua `KVC_FPGA_ENABLE=0` (nay không còn là mặc định) — xem §1.4.
  - *Cập nhật 01/11/2026:* tham số chọn nguồn BBox đổi tên `USE_MOCK_BBOX` → **`BBOX_SOURCE`** (0 = mock, 1 = blob thật từ pixel, 2 = CNN). Mặc định release nay là **1**. Layout/CRC/baud IF-01 **không đổi**.

### Trạng thái triển khai (P1, 31/10/2026)

| Hạng mục | Trạng thái | Bằng chứng |
| :--- | :--- | :--- |
| `uart_tx` bit start | ✅ FIXED | `tb_uart_tx` PASS 30/30, busy width = 10 bit-time |
| `bbox_packetizer` endianness | ✅ FIXED | `tb_bbox_packetizer` PASS 103/103, đối chiếu parser C MCU |
| `yolo_nms` IOU_THRESH | ✅ FIXED | `32768` → `16384` (`yolo_nms.v:10`) |
| `width/height` bbox | ✅ FIXED | `bbox_data_src` lấy đúng trường, Little-Endian |
| CNN/NMS trong datapath | ⏸ TẮT (`BBOX_SOURCE` ≠ 2) | Resource: DSP 0,5/24 thay vì 24/24 |
| Nguồn BBox mặc định | 🔄 ĐỔI 01/11/2026 (`BBOX_SOURCE=1` = blob thật) | `kvc_blob_detect` từ pixel RGB565; layout IF-01 không đổi; **chưa có capture trên bo** |
| Timing | ✅ PASS | Fmax 113,277 MHz (release blob), 0 setup/hold violation (TNS=0) |
| Testbench có assertion | ✅ 22 TB PASS | Bao gồm giải mã UART thật `tb_kvc_top_demo_uartlink`, `tb_kvc_top_demo_rate`, blob `tb_kvc_blob_detect` + `tb_kvc_top_blob` |
| Mock frame rate | 100 FPS thực | Khung 26 byte cần 6,771 ms @ 38.400 bps, chu kỳ phát 10 ms |
| Blob frame rate | ~30 FPS (theo VSYNC camera) | Khung N=1 = 18 byte, N=0 = 10 byte; **chưa đo trên bo** |

**Còn mở:** `KVC_PR/gen/` vẫn là weights giả; engine requant chưa sửa (P3); camera OV2640 chưa xác nhận phát VSYNC trên bo (Gate G0); **timebase MCU chạy chậm ~1,6–2,3×** (làm `timestamp_ms` IF-02 lệch — cần task riêng); soak ≥ 10 phút để kiểm trôi IHRC theo nhiệt. Bitstream đã nạp bo Primer 20K thành công (SHA-256 `70460C92...`) — đó là **đường mock**; bitstream blob `86CCF5DD...` **chưa nạp bo**.

---

## 1. Kết nối vật lý và đường truyền

### 1.1. Bảng phân bổ chân vật lý (Physical Pin Mapping)

| Tín hiệu | Hướng | Chân FPGA OneKiwi (Header J2) | Chân MCU Sonix (LQFP64) | Chân trên Kit Sonix | Mức logic | Mô tả kỹ thuật |
| :--- | :---: | :--- | :--- | :--- | :---: | :--- |
| **UART_TX (FPGA)** → **URXD1** | FPGA → MCU | **`R13`** (J2 Pin 11, Bank 2) | **`P2.3`** (`URXD1`, Pin 17) | `JP3` Pin 7 hoặc 8 | 3.3 V CMOS | Đường truyền dữ liệu nối tiếp khung kết quả BBox |
| **DATA_READY** → **EXTI** | FPGA → MCU | **`R12`** (J2 Pin 13, Bank 2) | **`P0.12`** (Pin 3) | `JP1` Pin 11 hoặc 12 | 3.3 V CMOS | Xung báo hiệu khung ảnh mới sẵn sàng; kích hoạt ngắt ngoài (EXTI) trên MCU |
| **UART_RX (FPGA)** ← **UTXD1** | MCU → FPGA | **`T13`** (J2 Pin 12, Bank 2) | **`P2.2`** (`UTXD1`, Pin 16) | `JP3` Pin 5 hoặc 6 | 3.3 V CMOS | Tín hiệu phản hồi / ACK / lệnh điều khiển (dự phòng) |
| **GND** | Hai chiều | **`GND`** (J2 Pin 14) | `VSS` (GND) | **`J5`** Pin 1..4 | 0 V | **Nối chung GND bắt buộc** giữa bo OneKiwi và kit Sonix |

> [!NOTE]
> **Tương thích điện áp:**
> - I/O Bank 2 trên bo OneKiwi Primer 20K được cấp nguồn bởi đường `P3V3` (3.3V).
> - MCU Sonix SN34F788 hoạt động ở điện áp `VDD = 3.3V`.
> - Do đó, **2 bo mạch tương thích logic 3.3V trực tiếp 100%**, không cần mạch đệm hay cầu phân áp.

### 1.2. Mẫu cấu hình chân Gowin Physical Constraints (`.cst`) cho Vững

```cst
// Cấu hình chân giao tiếp UART & DATA_READY sang MCU Sonix
// Bo mạch: OneKiwi Primer 20K V1.1 (GW2A-LV18PG256)

IO_LOC "uart_tx" R13;
IO_PORT "uart_tx" IO_TYPE=LVCMOS33 DRIVE=8;

IO_LOC "uart_rx" T13;
IO_PORT "uart_rx" IO_TYPE=LVCMOS33 PULL_MODE=UP;

IO_LOC "data_ready" R12;
IO_PORT "data_ready" IO_TYPE=LVCMOS33 DRIVE=8;
```

> 📌 **File cấu hình dự án đã tạo:** File ràng buộc chân vật lý đã được tạo tại [fpga/constraints/pins.cst](../../fpga/constraints/pins.cst). Header định nghĩa chân phía MCU tại [firmware/mcu_payload/inc/kvc_pinout.h](../../firmware/mcu_payload/inc/kvc_pinout.h). Tham chiếu đấu nối chi tiết xem tại [KVC_MASTER_PINOUT_WIRING.md](../hardware/wiring/KVC_MASTER_PINOUT_WIRING.md).
### 1.3. Tham số UART

- **Baudrate:** **38.400 bps** — chốt duy nhất ngày 31/10/2026 (B-1). FPGA dùng `BAUD_DIV = 2604 @100 MHz` = chính xác 38.400 (sai số 0 %). MCU dùng `DLL = 20 @UCLK 12 MHz` = 37.500 bps (−2,34 %).
  - *Trạng thái thực nghiệm:* đã chạy được trên bo — `fe = 0`, `oe = 0`, `drop = 0`, `crc = 0` trên **197.844 byte / 7.609 frame** (xem §1.5). Dòng `[RING]` từng bị bug chẩn đoán `kvc_m2_stats_tick` che; đã vá và đo lại được.
  - 115.200 bps **không dùng** trong thiết kế hiện tại; chỉ khả thi nếu nâng UCLK lên ≥ 24 MHz bằng PLL (khi đó sai số 6,99 % mới giảm xuống mức chấp nhận).
- **Cấu hình bit:** 8N1 (8 bit dữ liệu, No Parity, 1 Stop bit).

---

## 2. Cấu trúc khung truyền BBox (AI Detection Frame)

Toàn bộ số nguyên nhiều byte lưu theo định dạng **Little-Endian** (byte thấp trước).

```text
+---------------+-----------+-----------------+----------------+--------------------+-----------+
| Sync (2B)     | Ver (1B)  | Count N (1B)    | Timestamp (4B) | N x BBox (N x 8B)  | CRC (2B)  |
| 0x5A 0xA5     | 0x01      | 0 .. 12         | uint32 (ms)    | Mỗi BBox 8 byte    | CRC-16    |
+---------------+-----------+-----------------+----------------+--------------------+-----------+
```

### Giới hạn N và băng thông (chốt 31/10/2026)

**`N ≤ 12`** — thay đổi so với spec cũ (`0..20`), phê duyệt B-2.

Lý do: khung = `10 + 8N` byte. Ở 38.400 bps × 30 FPS: ngân sách 128 B/frame.

| N | Byte/frame | Băng thông @30 FPS | Sử dụng ngân sách |
|---:|---:|---:|---:|
| 0 | 10 | 300 B/s | 8 % |
| 2 | 26 | 780 B/s | 20 % |
| 8 | 74 | 2.220 B/s | 58 % |
| **12** | **106** | **3.180 B/s** | **83 %** |
| 16 | 138 | 4.140 B/s | 108 % ❌ |
| 20 | 170 | 5.100 B/s | 133 % ❌ |

Ngân sách thực tế = 3.840 B/s (38.400 bps / 10 bit/byte). N=12 còn margin 17 %.

**Tác động:** `mock_bbox` và AI phải clamp `N ≤ 12`. Nếu phát hiện > 12 mục tiêu, giữ 12 box có `confidence` cao nhất.

### Bảng phân rã khung truyền

| Offset | Độ dài | Tên trường | Kiểu dữ liệu | Mô tả |
| :---: | :---: | :--- | :--- | :--- |
| **0–1** | 2 byte | Sync Header | `uint8[2]` | Cố định `0x5A 0xA5` (nhận diện đầu khung) |
| **2** | 1 byte | Version | `uint8` | Phiên bản giao thức (giá trị `1`) |
| **3** | 1 byte | Candidate Count ($N$) | `uint8` | Số lượng mục tiêu phát hiện trong frame (**tối đa 12**, xem §giới hạn trên) |
| **4–7** | 4 byte | Timestamp | `uint32` | Thời điểm chụp/suy luận của khung ảnh (ms) |
| **8 .. (8+8N-1)** | $N \times 8$ byte | Danh sách BBox | Mảng struct BBox | Chứa thông tin vị trí và phân loại của $N$ đối tượng |
| **Cuối** | 2 byte | CRC-16 Checksum | `uint16` | **CRC-16/CCITT-FALSE** tính từ byte 0 đến hết danh sách BBox |

---

## 3. Cấu trúc chi tiết 8 byte của từng Bounding Box (BBox)

Mỗi mục tiêu được mã hóa trong đúng 8 byte:

| Byte | Tên trường | Kiểu dữ liệu | Đơn vị / Phạm vi | Ý nghĩa |
| :---: | :--- | :--- | :--- | :--- |
| **0–1** | `X_center` | `uint16` | pixel | Tọa độ tâm X của BBox trên khung ảnh gốc |
| **2–3** | `Y_center` | `uint16` | pixel | Tọa độ tâm Y của BBox trên khung ảnh gốc |
| **4** | `Width` | `uint8` | pixel (0–255) | Chiều rộng BBox (nếu ảnh scale chuẩn) |
| **5** | `Height` | `uint8` | pixel (0–255) | Chiều cao BBox (nếu ảnh scale chuẩn) |
| **6** | `Class_ID` | `uint8` | Enum | `1`: `person` (người trôi dạt)<br>`2`: `lifebuoy` (phao cứu sinh) |
| **7** | `Confidence` | `uint8` | 0 – 100 (%) | Mức độ tin cậy của thuật toán AI |

---

## 4. Cơ chế đồng bộ và xử lý lỗi đường truyền

1. **Phía FPGA (Vững):**
   - Khi có kết quả suy luận AI từ camera, ghi danh sách BBox vào bộ đệm FIFO UART.
   - Kéo chân `DATA_READY` lên mức HIGH trong 1–5 µs để kích hoạt ngắt trên MCU Sonix.
   - Bắt đầu truyền luồng byte qua UART. Nếu không có mục tiêu nào trong khung ảnh ($N = 0$), vẫn gửi gói tin rỗng hợp lệ (độ dài 10 byte: 2B Sync + 1B Ver + 1B Count=0 + 4B Time + 2B CRC).
2. **Phía MCU Sonix (Phong):**
   - Phía MCU sử dụng ngắt phần cứng `UART1_IRQHandler` đẩy luồng byte vào bộ đệm vòng Ring Buffer SPSC 4096 byte (Task M2), giải phóng hoàn toàn thời gian blocking của CPU và chống tràn FIFO 16 byte khi MCU đang bận phát LoRa (~300 ms).
   - Tín hiệu `DATA_READY` trên chân `P0.12` được quy hoạch kích hoạt ngắt EXTI (hiện tại firmware đang đọc kiểm tra ở mức logic/ring buffer, chờ đo kiểm tín hiệu thực tế trên bo FPGA).
   - Kiểm tra 2 byte đầu khung `0x5A 0xA5`. Nếu sai, trượt tìm lại mốc đồng bộ (Resynchronization).
   - Kiểm tra CRC-16; nếu đúng, nạp BBox vào bài toán giao điểm tia quang học tính tọa độ. Nếu sai, bỏ qua frame và tăng bộ đếm lỗi `uart_crc_err`.

---

## 1.4. Yêu cầu phía MCU khi KHÔNG có FPGA

> **Cập nhật 31/10/2026 (sau G2.4):** mặc định `KVC_FPGA_ENABLE` đã đổi **0 → 1** vì FPGA đã nạp bitstream hợp lệ (Fmax 129,149 MHz) và đường BBox chạy thật (`BB n2 v1 crc0 en1`). Chế độ `=0` **vẫn giữ nguyên** cho bo không có FPGA — đặt bằng define của Keil khi cần. Con số "Fmax 14,6 MHz" trong bản tài liệu trước thuộc về bitstream `BBOX_SOURCE = 2` từng thất bại (khi đó tên tham số còn là `USE_MOCK_BBOX=0`); bản hiện tại không còn dùng.

Bo bench **không có FPGA** (hoặc khi cần bench thuần cảm biến) phải **im lặng tuyệt đối** trên đường UART1 thay vì sinh log rác.

| Yêu cầu | Cách hiện thực | Kiểm chứng trong log |
| :--- | :--- | :--- |
| Không cấu hình UART1 | `#if (KVC_FPGA_ENABLE == 1)` bọc `kvc_fpga_bbox_init()` | `[INIT] FPGA SKIP en=0` |
| Không bật NVIC IRQ 38 | Như trên (nằm trong `kvc_fpga_bbox_init`) | `[RING] FPGA` toàn 0 trong 60 s |
| P2.3 (`URXD1`) không float | `PULLEN` + `PUTYPE` kéo **lên** → idle HIGH (mức stop bit) | Không có `isr`/`byt` tăng |
| P0.12 (`DATA_READY`) không float | `PULLEN` + `PUTYPE` kéo **xuống**, `DIR` = input, không EXTI | — |
| Không poll driver | `#if (KVC_FPGA_ENABLE == 1)` bọc `kvc_fpga_bbox_poll()` (2 chỗ) | — |
| BBox luôn invalid | `kvc_fpga_bbox_is_valid()` trả `false` vì chưa từng nhận frame | `[M3] ... BB n0 v0 crc0 en0` |

**Bật lại:** build với `-DKVC_FPGA_ENABLE=1`, rồi nạp `scripts/manual/mock_fpga_bbox.py --baud 38400` qua USB-TTL vào `P2.3` (GND chung). Không đổi gì trong ABI.

> **Giới hạn chưa xác minh:** pull nội có còn tác dụng khi chân ở chế độ AFIO hay không. Nếu đo thấy P2.3 vẫn float, hàn **10 kΩ từ P2.3 lên 3V3** (cùng lý do với trở treo 10 kΩ cho P2.15 siêu âm — xem [KVC_PHAN_CONG_2_NGUOI.md](../planning/KVC_PHAN_CONG_2_NGUOI.md) mục 1.1).

---

## 1.5. Baud 38.400 — đã chốt, và đã chạy được trên phần cứng

**Quyết định 31/10/2026 (B-1): dùng 38.400 bps duy nhất** trên mọi tài liệu, kể cả phần cứng lẫn MCU.

**Sai số danh định:** tại UCLK 12 MHz, divisor 20 cho 37.500 bps (lệch **−2,34 %**); cộng IHRC ±2 % thành tối đa ~4,34 %, **vượt** ngưỡng 3,125 % ghi trong User Manual MCU §15.6. Điều này đã được chính dự án bác cho GNSS trong [MCU_BUILD_KEIL.md](../configuration/MCU_BUILD_KEIL.md) §5.

UART1 dùng **cùng UCLK 12 MHz, cùng IHRC, cùng bộ chia** (`KVC_FPGA_UART_DLL = 0x14 = 20`). Về lý thuyết cùng sai số.

### Kết quả thực nghiệm 31/10/2026 — chạy được, đã nghiệm thu

Nối FPGA → MCU thật, firmware `KVC_FPGA_ENABLE=1`. Log đầy đủ:
`docs/verification/evidence/G2.4_mcu_log_20261031.md`.

```text
[RING]FPGA  pend=0 drop=0 oe=0 fe=0 byt=149551 isr=149551
[RING]FPGA  pend=0 drop=0 oe=0 fe=0 byt=197844 isr=197844
BB n2 v1 crc0 en1     <- 21/21 dòng [M3]
```

**197.844 byte = 7.609 frame IF-01, không một lỗi khung, không một byte tràn.**
`isr == byt` chứng minh mỗi ngắt đều lấy được byte. `fe = 0` xác nhận sai số baud
nằm trong biên chịu đựng.

### Chạy lại 01/11/2026 — với bitstream blob thật `86CCF5DD`

Trước đó `BB n2 v1` là **mock BBox** (khung do bộ đếm sinh). Lần này là **blob
thật từ pixel OV2640**:

```text
[INIT] FPGA UART1 en=1 38400 8N1 (IF-01)
ABI GV-02 SIZE=32 CRC=0x0000E260 EXPECT=0x0000E260 PASS
[RING] FPGA pend=0 drop=0 oe=0 fe=0 byt=270 isr=270
[RING] FPGA pend=0 drop=0 oe=0 fe=0 byt=480 isr=480
[RING] FPGA pend=0 drop=0 oe=0 fe=0 byt=720 isr=720
[M3] ... BB n0 v1 crc0 en1 | LORA d1 ver=0x00000012 | ovr0 late_max=0 tx=17/0
```

**Điểm khác biệt so với 31/10:** nhịp khung giảm từ ~100 Hz (mock) xuống
**~5 Hz** (camera thật, F-01). `fe=0`, `crc=0` vẫn giữ nguyên — chất lượng đường
truyền không phụ thuộc nhịp. Chi tiết:
`evidence/KVC-MCU-FPGA-LORA-20261101-001.md`.

> **Đọc `BB n0` cho đúng:** `[M3]` in 1 Hz còn khung camera ~5 Hz, và chỉ ~10 %
> khung có mục tiêu (F-02). Vậy phần lớn dòng `[M3]` **phải** là `n0`. `v1` mới
> là chỉ báo sức khoẻ đường truyền; `n0` không có nghĩa là hỏng.

**Vì sao ngưỡng 3,125 % không áp dụng nguyên xi ở đây:**

| Yếu tố | Ảnh hưởng |
| :--- | :--- |
| Trôi điểm lấy mẫu tại stop bit | 9,5 bit × 2,34 % = **0,22 bit** (worst case 4,34 % → 0,41 bit), vẫn trong cửa sổ ±0,5 bit |
| Header `5A A5` mỗi frame | Parser tự đồng bộ lại mỗi 26 byte, sai số không tích lũy qua nhiều frame |
| Khung ngắn | 260 bit/frame, không đủ dài để trôi ra khỏi cửa sổ |

Ngưỡng 3,125 % là quy tắc cho khung dài liên tục không resync. Với khung 26 byte
có sync marker, biên thực tế rộng hơn — đã được **chứng minh bằng phép đo**, không
còn là suy đoán.

### Rủi ro còn lại

1. **Trôi nhiệt của IHRC chưa kiểm.** Log hiện tại chưa chạy đủ dài để thấy IHRC
   trôi khi chip ấm lên sau 10–20 phút. Cần soak ≥ 10 phút, đọc `fe` lần nữa.
   Nếu `fe` vẫn 0 → đóng hoàn toàn. Nếu `fe` tăng → cần HUMAN quyết định giữa nâng
   UCLK 24 MHz (PLL) hay hạ IF-01 xuống 19.200.
2. **Timebase MCU chạy chậm ~1,6–2,3×** (phát hiện khi đối chiếu `byt` với trần vật
   lý UART). Không ảnh hưởng IF-01, nhưng `timestamp_ms` IF-02 lệch. Cần task riêng.

**Không đổi code một phía.** Nếu chọn 19.200, phải sửa đồng thời `KVC_FPGA_UART_DLL`/`KVC_FPGA_UART_BAUD` trong `kvc_fpga_bbox.h`, `BAUD_DIV` trong `KVC_PR/src/comm/uart_tx.v`, và §1.3 tài liệu này.

**Số `fe=2497 byt=2497` ghi trong tài liệu 26/10 không dùng làm bằng chứng cho UART1:** khi đó chưa có RTL nên chân R13 float, và lời giải thích "TX idle LOW + cầu phân áp" áp dụng cho siêu âm (P2.15), không áp dụng cho đường LVCMOS33 push-pull của FPGA. Cùng bảng đó ghi GNSS `fe=0`.
