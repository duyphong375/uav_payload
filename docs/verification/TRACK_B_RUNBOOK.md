# Runbook — Track B trên phần cứng thật

Tài liệu thao tác cho người ngồi cạnh bo. Mục tiêu của lượt đầu: **đóng Gate G0**
trong khoảng 30–45 phút, **không cần oscilloscope**.

Kế hoạch gốc: `.kilo/plans/1793547108260-esp32-s3-cam-integration.md` §B1.
Checklist chi tiết: `docs/verification/BRINGUP_CHECKLIST.md`.
Hồ sơ bitstream: `docs/verification/FPGA_BUILD_RECORD.md`.

---

## 0. Chuẩn bị

### 0.1 Vật tư

| # | Món | Ghi chú |
| :---: | :--- | :--- |
| 1 | Bo FPGA Primer 20K | Đã nạp được bitstream trước đây |
| 2 | Module camera **OV2640** | Ghi lại marking trước khi cắm |
| 3 | USB-UART **3,3 V** (CH340/CP2102) | **Không dùng loại 5 V** — mức 5 V làm hỏng chân FPGA |
| 4 | Dây nối R13 → RX của USB-UART, GND chung | Bắt buộc có GND hồi lưu |
| 5 | Nguồn bo | Theo hướng dẫn bo; **không** cấp qua USB-UART |
| 6 | Gowin Programmer | Đã cài cùng toolchain |

### 0.2 Kiểm tra bitstream trước khi nạp

Đây là bước **bắt buộc**. Nạp nhầm file làm mất 30 phút và dễ kết luận sai là
"camera hỏng".

```powershell
Get-FileHash review\artifacts\KVC_FPGA_diag_3620B802.fs -Algorithm SHA256
```

Phải ra **đúng**:

```text
3620B802C010993DCF98E56691C5496132CB5347D6776D5B5EAA88BD5DFC5EBB
```

Không khớp → **dừng**. File sai hoặc bị hỏng; không nạp.

Ba file trong `review/artifacts/`:

| File | SHA (8 ký tự đầu) | Dùng cho |
| :--- | :--- | :--- |
| `KVC_FPGA_diag_3620B802.fs` | `3620B802` | **G0 hôm nay** |
| `KVC_FPGA_release_86CCF5DD.fs` | `86CCF5DD` | Blob A1–A10, **sau khi G0 PASS** |
| `KVC_FPGA_948D697E.fs` | `948D697E` | **Rollback** nếu có gì sai |

> `review/` nằm trong `.gitignore`. Nếu clone mới không có ba file này, phải
> build lại từ `KVC_PR/` theo `docs/verification/FPGA_BUILD_RECORD.md` §5 và
> đối chiếu SHA.

### 0.3 Ghi lại baseline (H6 chưa đóng)

```powershell
git rev-parse HEAD
git status --short
```

Ghi hai kết quả này vào đầu file log bằng chứng. Trạng thái hiện tại:
`HEAD 2be0f05` + working tree dirty. Vì chưa commit (quyết định H6), **mọi kết
quả hôm nay không tái lập được từ Git**. Không phải lý do để hoãn — nhưng phải
ghi rõ trong báo cáo.

---

## 1. Nạp bitstream diag

### 1.1 Cắm camera TRƯỚC khi nạp

Cắm module OV2640 vào bo, **chụp ảnh marking** rồi lưu
`G6.1_camera_marking_<YYYYMMDD-HHMM>.jpg`.

Ảnh marking là bằng chứng cho G6.1 và cho quyết định H2 (biến thể cảm biến).
Không có ảnh này thì không chứng minh được module là OV2640 thay vì biến thể khác.

### 1.2 Nạp

1. Mở **Gowin Programmer**.
2. `Scan Device` → phải thấy `GW2A-18` (hoặc đúng mã của Primer 20K).
3. Thêm file `review\artifacts\KVC_FPGA_diag_3620B802.fs`.
4. Chọn **SRAM Program** (nạp tạm, không ghi flash).
   Lý do: nạp SRAM mất khi mất điện → không thể vô tình để lại bitstream diag
   trên bo rồi tưởng là bản release.
5. Bấm `Program`. Chờ `Finished`.

Lưu log/progress vào `G2.1_nap_bitstream_<YYYYMMDD-HHMM>.log`.

**Nếu Program báo lỗi:** dừng, kiểm tra cáp JTAG và nguồn bo. Không thử tiếp
các bước sau — không có bitstream thì UART sẽ im lặng và bạn sẽ kết luận sai
là "camera hỏng".

---

## 2. Đấu dây UART

```text
FPGA R13 (UART TX) ──────► RX  USB-UART 3,3 V
FPGA GND          ──────► GND USB-UART (bắt buộc)
```

**Chỉ một chiều.** Không nối TX của USB-UART vào FPGA — không cần, và có nguy
cơ đấu nhầm rail.

Không cấp nguồn bo qua USB-UART.

### 2.1 BẮT BUỘC kiểm sau MỖI lần rút/cắm lại dây

> **Bài học 02/11/2026 (F-07).** Để capture tín hiệu FPGA bằng CH340, dây `R13`
> được rút khỏi MCU rồi cắm lại. Lần cắm lại bị **lệch pin** và **GND chung
> lỏng**, khiến đường RX trôi mức logic: **mọi byte** lỗi framing
> (`fe == byt`), `BB v0` suốt 10 phút, nhưng `crc=0` trông như "tốt".
>
> Mất gần một phiên soak 10 phút mới phát hiện.

Trước khi chạy bất kỳ phép đo dài nào, kiểm **hai dòng**:

```text
[RING]FPGA  pend=0 drop=0 oe=0 fe=0 byt=<tăng> isr=<tăng>
[M3] ... BB n? v1 crc0 en1
```

| Dấu hiệu | Ý nghĩa | Làm gì |
| :--- | :--- | :--- |
| `byt = 0`, `isr = 0` | Không có tín hiệu tới RX | Kiểm R13 tiếp xúc, GND chung, FPGA có nguồn/bitstream |
| `fe == byt` | Mọi byte lỗi framing | **Tiếp xúc/GND kém** (không phải phần mềm) — cắm lại dây |
| `fe > 0` nhưng `fe < byt` | Nhiễu lẻ tẻ | Dây dài/không có GND tốt |
| `BB v0` dù `byt` tăng | Không bóc được khung | Kiểm `fe` trước; nếu `fe=0` mới nghi FSM/CRC |
| `BB v1` | Đường tốt | Yên tâm chạy tiếp |

**`crc=0` không phải bằng chứng lành.** Nếu không có khung nào được bóc,
`crc` giữ 0 vì không có gì để kiểm — đó là "0 rỗng", không phải "0 lỗi".

**Ghi nhận kèm:** pull nội trên P2.3 **có tác dụng trong chế độ AFIO** — bằng
chứng là `byt = 0` tuyệt đối khi dây tuột (nếu pull không tác dụng, chân float
sẽ sinh byte rác liên tục). Không cần hàn trở treo 10 kΩ.

---

## 3. Capture G0

```powershell
python scripts/manual/fpga_uart_capture.py `
    --port COM5 --baud 38400 --seconds 15 `
    --dump docs/verification/evidence/G0.3_uart_capture_<YYYYMMDD-HHMM>.bin
```

- Thay `COM5` bằng cổng thật (`Get-CimInstance Win32_SerialPort` để liệt kê).
- `--seconds 15` chứ không phải 10: 10 s là mức tối thiểu, 15 s cho dư để tính
  tốc độ tăng của `x` qua nhiều mốc.
- Parser mặc định đã đúng: `38400`, IF-01 v1, CRC-16/CCITT-FALSE.

### 3.1 Đọc kết quả

Parser in tổng kết. Ghép với bảng sau:

| Hiện tượng | Nghĩa | Hành động |
| :--- | :--- | :--- |
| `0 frame` — không có byte nào | UART không có tín hiệu | Kiểm R13, GND, cổng COM, đúng 38400 |
| Có byte nhưng `crc_err` cao | Sai baud hoặc nhiễu | Kiểm baud = 38400 8N1, dây ngắn, GND tốt |
| Frame OK, **`x` không tăng** | Không có xung VSYNC | Camera không phát, hoặc XCLK chết → xem 3.2 |
| Frame OK, **`x` tăng 27–33 /giây** | Camera chạy đúng ~30 Hz | **G0.3 PASS** |
| `y = 1` | `cfg_done=1`, `cfg_error=0` — SCCB OK | **G0.4 PASS** |
| `y = 0` | SCCB chưa cấu hình xong | Chờ thêm; nếu giữ nguyên → chân SCCB |

### 3.1b Ba dòng mới của parser (từ 02/11/2026)

| Dòng | Ý nghĩa | Cách đọc |
| :--- | :--- | :--- |
| `Thoi gian doc thuc` | cửa sổ thực của `--seconds` | phải ≈ `--seconds`; lệch nhiều ⇒ `--seconds` bị vô hiệu (lỗi block-read cũ) |
| `FPS theo wall-clock` | `n / t_wall` | phải **khớp** `FPS do duoc (timestamp)`; lệch > 2 chu kỳ khung ⇒ cảnh báo + exit 1 |
| `Luoi chu ky` + `Boi so` | tìm chu kỳ P để mọi khoảng là bội số nguyên | **`Boi so: 1x:N`** = nhịp đều · nhiều bội số = nhịp **không** đều |

`Luoi chu ky` là dòng quan trọng nhất khi chẩn đoán FPS. FPS trung bình **che
giấu** dao động: 4,2 fps có thể là (a) camera 4,2 Hz đều, hoặc (b) camera 15,25 Hz
nhưng frame bị kéo 3×/5×/6×. Hai trường hợp có cùng FPS trung bình nhưng **chỉ (a)
là dùng được cho georef**. Ví dụ thật, `G6.1_blob_light_bright_20261102-0230.bin`:

```text
FPS do duoc (timestamp): 4.2 frame/s
Khoang (mode)    : 197 ms (41/127 = 32%)
Khoang min/max   : 67 / 395 ms
Luoi chu ky      : P=65.58 ms (15.25 frame/s), rms=1.37 ms, 98% khoang khop
Boi so           : 1x:9, 3x:80, 5x:21, 6x:17
CANH BAO: nhieu boi so -> nhip khung KHONG deu; xem A6 cua PLAN-005 (AEC / chia xung)
```

Đọc: trần 15,25 fps; phần lớn frame dài gấp **3 lần** frame ngắn nhất. Không phải
"camera chạy 4,2 fps" — xem `evidence/KVC-FPGA-BLOB-20261102-001.md` §2.

| `y = 3` | Có ACK error | Đấu dây SIOD/SIOC, pull-up, nguồn camera |
| `y` giá trị khác 0/1/3 | Không phải bitstream diag | Nạp nhầm file → quay lại §0.2 |

**Cách tính `x`:** lấy `x` ở frame đầu và frame cuối, chia cho khoảng thời gian
giữa chúng. Ví dụ `x: 12 → 42` trong `1,0 s` ⇒ 30 xung/giây.

### 3.2 Nếu `x` đứng yên (không có VSYNC)

Kiểm theo thứ tự, **dừng ở bước tìm ra lỗi**:

1. **XCLK** — đo chân **J1-12 / B13** bằng VOM hoặc LA. Phải có xung ~20 MHz
   (VOM chỉ thấy điện áp trung bình ~1,5–2 V; muốn chắc phải dùng LA/scope).
   Không có xung ⇒ PLL hoặc gán chân XCLK sai.
2. **Chân 18** (VSYNC) — phải có xung ~30 Hz nếu LA có.
3. **GND hồi lưu** giữa camera và bo.
4. **Nguồn camera** — 3,3 V tại chân module, không chỉ tại đầu rail.

**Không** chỉnh `ov2640_config.v` ở bước này. G0 chưa PASS thì chưa biết camera
có sống; sửa cấu hình lúc này là sửa mù.

---

## 4. Ghi bằng chứng

### 4.1 File cần lưu

| File | Nội dung |
| :--- | :--- |
| `G0.3_uart_capture_<YYYYMMDD-HHMM>.bin` | Byte thô, để phân tích lại |
| `G0.3_uart_parser_<YYYYMMDD-HHMM>.txt` | Output parser (chép nguyên) |
| `G2.1_nap_bitstream_<YYYYMMDD-HHMM>.log` | Log Gowin Programmer |
| `G6.1_camera_marking_<YYYYMMDD-HHMM>.jpg` | Ảnh marking module |

Tất cả vào `docs/verification/evidence/`. Quy ước tên: xem
`docs/verification/evidence/README.md`.

### 4.2 Ghi vào hồ sơ

Sau khi có kết quả, cập nhật **cả ba** nơi sau — chúng đang chờ đúng ba mục này:

| File | Mục | Sửa gì |
| :--- | :--- | :--- |
| `docs/verification/FPGA_BUILD_RECORD.md` | §8 bảng trạng thái | `G0.2–G0.4` từ `NOT RUN` → `PASS`/`FAIL` kèm số đo |
| `docs/verification/evidence/README.md` | bảng nội dung | Thêm dòng cho file mới |
| `docs/INDEX.md` | dòng FPGA | Cập nhật mức bằng chứng |

### 4.3 Mẫu ghi kết quả

```text
Gate G0.2 — nạp bitstream diag
  SHA-256      : 3620B802...5EBB (khớp hồ sơ)
  Ngày giờ     : 2026-11-01 17:20 +07
  HEAD         : 2be0f05 + working tree dirty (H6 chưa đóng)
  Kết quả      : PASS

Gate G0.3 — VSYNC
  x frame đầu  : 12
  x frame cuối : 437
  Thời gian    : 14,2 s
  Tốc độ       : 29,9 xung/giây   -> PASS (dải 27–33)
  crc_err      : 0 / 428 frame

Gate G0.4 — SCCB
  y            : 1  (cfg_done=1, cfg_error=0)  -> PASS
```

---

## 5. Sau khi G0 PASS

**Bắt buộc: nạp lại bitstream release.**

Bitstream diag **không chứa** `kvc_blob_detect` (`BBOX_SOURCE=0`). Để nguyên
diag mà chạy A1–A10 thì mọi thử nghiệm blob đều vô nghĩa — `x`/`y` vẫn là số
đếm chẩn đoán chứ không phải toạ độ blob.

```powershell
Get-FileHash review\artifacts\KVC_FPGA_release_86CCF5DD.fs -Algorithm SHA256
# Phải ra 86CCF5DD...
```

Nạp theo §1.2 với file release. Sau đó mới sang G6.1 và A1–A10.

### 5.1 Kết quả đã chạy 01/11/2026

Đã nạp **release `86CCF5DD`** và chạy capture với OV2640:

| Đo | Kết quả |
| :--- | :--- |
| Nền, không mục tiêu | 67 khung, `N=0`, 0 rác, 0 CRC |
| Có mục tiêu cam | 69 khung, **7 khung `N=1 class=2`**, 0 rác, 0 CRC |
| Tổng byte | 746 = 62×10 + 7×18 — khớp tuyệt đối |
| Nhịp khung | **~197 ms/khung → ~5 frame/s** |

Chi tiết + findings mở: `evidence/KVC-FPGA-G0G6-20261101-001.md`.

⚠️ **A8 (25–32 frame/s) KHÔNG ĐẠT.** Nhịp thật ~5 frame/s, chưa rõ nguyên nhân
(nghi phơi sáng/AGC hoặc chia tần PCLK trong `ov2640_config.v`). Chưa sửa.

### 5.1b Đo lại 02/11/2026 — nhịp khung đổi theo ánh sáng

| Đo | Kết quả |
| :--- | :--- |
| Nền, không mục tiêu | **409** khung, `N=0` toàn bộ, 0 rác (6 B cuối là đầu khung #410 bị cắt), 0 CRC |
| Nhịp khung | **133,7 ms/khung → 7,48 frame/s** |
| Timestamp | tăng đơn điệu, 133 hoặc 134 ms mỗi khung |
| Tải UART | 4090 B × 10 bit ÷ 38400 = **1,065 s** → 1,95 % |

So với 5,08 frame/s lần trước: **cùng bitstream, cùng script, khác ánh sáng**.
Đây là bằng chứng gián tiếp cho giả thuyết AEC (F-01): thiếu sáng → OV2640 kéo
dài exposure quá frame time → tự giảm frame rate. **Chưa** phải phép đo exposure.

File: `evidence/G6.1_blob_baseline_neg_20261102-0142.txt`.

> ⚠️ **Script cũ đọc block.** `--seconds 15` không có hiệu lực: `ser.read(4096)`
> block tới khi đủ 4096 byte, ở 75 B/s mất 54,6 s. Đã sửa cùng ngày — bản mới
> đọc theo `ser.in_waiting` và in thêm **"Thoi gian doc thuc"** + **"FPS theo
> wall-clock"**. Các log cũ phải hiểu là đo bằng bản trước khi sửa.

### 5.1c `.bin` 128 khung 02/11/2026 — nhịp khung lượng tử hoá

Đây là lần đầu có file `.bin` thô đủ dài để phân tích phân bố khoảng.

| Đo | Kết quả |
| :--- | :--- |
| Byte / khung | **1.288 B / 128 khung** = 127×10 + 18 (khớp tuyệt đối) |
| CRC / rác | **0 / 0** |
| Timestamp | 219.129 → 249.044 ms, đơn điệu |
| FPS trung bình | **4,245** |
| Khoảng (mode) | **197 ms** (41/127) |
| Phân bố | 68 ms (9), 197 ms (80), 326 ms (21), 394 ms (17) |
| **Lưới** | **65,6 ms**, bội **1/3/5/6**, rms 1,25 ms |
| Trần suy ra | **15,25 frame/s** |
| `N=1` | 1/128 = 0,78 %, `x=212 y=89 w=243 h=49 cls=2 conf=8` |

**Diễn giải:** không phải camera chạy 4,2 fps, mà **frame bị kéo dài 3×/5×/6×**
so với frame ngắn nhất 65,6 ms. Xác nhận độc lập bằng soak 30 phút: 42,92 B/s =
**4,29 frame/s**, lệch 1 %. Chi tiết: `evidence/KVC-FPGA-BLOB-20261102-001.md`.

**Hệ quả cho A8:** nâng PCLK một mình chỉ nâng **trần** 15,25 → 30 fps; fps thực
vẫn ≈ 10 nếu AEC còn kéo 3×. Vì vậy `KVC-CAM-PCLK-20261102-001` nay có **Pha 0b
(AEC) bắt buộc trước Pha 1 (PCLK)**, và Pha 0 phải gồm **bước 0.5** bắt ≥ 200 chu
kỳ VSYNC để chọn đúng nhánh.

> **Bốn số trong báo cáo miệng 02/11 đã đính chính** bằng `.bin`:
> "126 khung" → **128**; "`x=128 y=82 w=201 h=101 conf=6`" → **không tồn tại**
> trong dữ liệu (đúng là `212/89/243/49/8`); "chu kỳ đều 196–197 ms" → **chỉ 63 %**;
> "`conf=6` vừa khít `MIN_PIXELS`" → `conf=8` (`cnt` 512–575, trên ngưỡng 28–44 %).


### 5.2 Bước kế: nối MCU Sonix

Đúng và rẻ, nhưng **phải chấp nhận trước** rằng georef sẽ trả `NONE`.

**Đấu dây (3 dây, đúng IF-01):**

```text
FPGA R13  (J2 pin 11) ──► MCU P2.3 (URXD1, JP3 pin 7/8)   ← dữ liệu IF-01
FPGA R12  (J2 pin 13) ──► MCU P0.12 (EXTI, JP1 pin 11/12) ← DATA_READY (tùy chọn)
FPGA GND  (J2 pin 14) ──► MCU GND (J5)                     ← BẮT BUỘC
```

Cả hai phía 3,3 V CMOS — **không cần mạch đệm**. Không nối `T12` (`mcu_ack`):
firmware MCU không định nghĩa chân này, và `data_ready_ctrl` tự chạy bằng
timeout 100 ms.

> **Quan sát 01/11/2026:** với nhịp khung ~197 ms > timeout 100 ms,
> `timeout_flag` trong `data_ready_ctrl` sẽ bật ở **mọi** khung. Hiện
> `timeout_flag` không được nối ra chân nào nên vô hại, nhưng nếu sau này ai
> dùng nó làm chỉ báo thì phải nâng `timeout_ms` lên > 200.

**Kỳ vọng đúng khi chạy:**

| Chỉ số | Kỳ vọng | Ghi chú |
| :--- | :--- | :--- |
| `[RING] FPGA fe` | **0** | Sai baud/nhiễu mới làm tăng |
| `[RING] FPGA crc` | **0** | |
| `[RING] FPGA oe` | **0** | FIFO 16 B tràn — ở 5 Hz không thể xảy ra |
| `BB n1 v1` | **thỉnh thoảng**, không liên tục | Xem cảnh báo dưới |
| `KVC_FLAG_AI_DETECTED` | **Bật khi có mục tiêu**, tắt khi không | Nhấp nháy theo nhịp khung |
| `ABI GV-02 ... PASS` | **PASS** | Tự kiểm IF-02 lúc boot |
| `target_lat/lon` | **0** | H4 — không GNSS fix + không Yaw |
| `target_x/y_local` | **0** | Cùng lý do |

> ⚠️ **`BB n1` SẼ KHÔNG LIÊN TỤC — đây là kết quả đúng, không phải lỗi.**
>
> Trên bo 01/11/2026, chỉ **7/69 khung (10,1 %)** có mục tiêu, và nhịp khung là
> **~5 Hz**. Vậy `n1` xuất hiện khoảng **0,5 lần/giây**, xen giữa là các khung
> `n0`. Cờ `AI_DETECTED` theo đó cũng nhấp nháy.
>
> Nếu kỳ vọng là "thấy `n1` trên hầu hết dòng `[M3]`" thì sẽ tưởng là fail. Muốn
> `n1` ổn định phải giải quyết **F-02** (tỉ lệ lấp đầy 5–7 % quá sát ngưỡng) —
> nhiệm vụ của lần đo với tấm bìa cam đặc.
>
> `[M3]` in ở 1 Hz, nên bạn chỉ thấy ~1/10 số dòng có `n1`. Đó là **lấy mẫu**,
> không phải tỉ lệ phát hiện thật.

**Đây là kết quả ĐÚNG, không phải lỗi.** Quyết định H4: hộp đứng yên hiển thị
`N/A`, không sinh tọa độ giả. Muốn có toạ độ thật phải có GNSS fix **và** Yaw —
mà Yaw cần vận tốc GNSS ≥ 0,5 knot, tức hộp phải **đang di chuyển**.

**Giá trị thật của phép thử này:**

- Chứng minh MCU bóc đúng khung IF-01 trên **dữ liệu thật** (không phải mock).
- Chứng minh `kvc_fpga_bbox.c` FSM + CRC + ring buffer chạy với nhịp 5 Hz.
- Chứng minh khung LoRa 32 byte IF-02 được đóng gói và CRC đúng.
- Đo được `fe`/`crc`/`drop` ở nhịp thật.

**Không** chứng minh: georef ra toạ độ, hay `target_x_local` khác 0.

### 5.4 Kết quả đã chạy 01/11/2026 — PASS

Đã nối và đo thành công. Log đầy đủ:
`evidence/KVC-MCU-FPGA-LORA-20261101-001.md`.

| Kiểm tra | Kết quả |
| :--- | :--- |
| `KVC_FW_ID` | `KVC-MCU-20261101-FPGA` — xác nhận đã nạp bản mới |
| ABI GV-02 | **PASS** — size 32, CRC `0xE260` |
| `[RING] FPGA` | `fe=0 oe=0 drop=0`, `isr == byt` trên **720 byte** |
| `BB v1 crc0 en1` | ✅ khung IF-01 bóc đúng, CRC khớp |
| `tx=17/0` | ✅ 17 gói LoRa phát thành công, **0 lỗi** |
| `ovr0 late_max=0` | ✅ chu kỳ 1 Hz chính xác |
| `US=68..70cm ok` | ✅ **số đo siêu âm thật đầu tiên** |
| `target_lat/lon = 0` | ✅ đúng H4 |

**Còn thiếu:** phía gateway nhận sóng — xem §6 (`NOT RUN`, chờ bo).

### 5.5 Việc CÓ THỂ làm ngay, không cần bo Gateway

Chuỗi FPGA → MCU → LoRa TX đã `HARDWARE-VERIFIED`. Các mục còn mở **không cần
gateway**, chỉ cần bo FPGA + camera đang có:

| # | Việc | Cần gì | Đóng gate | Thời gian | Cổng đọc |
| :---: | :--- | :--- | :--- | :--- | :--- |
| 1 | **G2.7 — soak** | Bo đang chạy sẵn | `fe=oe=drop=0` liên tục **30 phút** (2.7.1) | **30 phút** | COM9 |
| 2 | **F-02 — thẻ cam đặc 240×240 px** | Thẻ cam (w,h ≤ 255 px) | Đóng finding P2, xác định `conf` thật | 5 phút | **COM8** |
| 3 | A3 — di chuyển mục tiêu, `x` thay đổi | Thẻ cam + tay | A3 | 5 phút | COM8 |
| 4 | A4 — mục tiêu ra khỏi khung → `N=0` | Thẻ cam | A4 | 5 phút | COM8 |
| 5 | A5 — áo cam ngoài khung → `w>255` bị loại | Áo/vật cam lớn | A5 | 5 phút | COM8 |
| 6 | A6 — 1.000 frame `crc_err=0` | Chờ ở 5–7,5 Hz | A6 | ~2,5 phút | COM8 |
| 7 | 6.1.9 — ngưỡng màu RGB565 | Vật đỏ thuần | G6.1 mục 9 | 10 phút | COM8 |
| 8 | G6.2 — 2/3/4/5 m | Thước + mặt nước tĩnh | 6.2.1–6.2.5 | 30 phút | COM9 |

**Ưu tiên: #2 rồi #1, hoặc chạy song song COM8 + COM9.** Hai cổng độc lập về
điện lẫn phần mềm — COM8 đọc UART FPGA trực tiếp, COM9 đọc log MCU.

- **#2 (F-02)** đo qua **COM8** bằng `fpga_uart_capture.py` để lấy `w, h, conf`.
  Diện tích khớp `cnt ≥ 6400` thì `conf` bão hoà 100 %.
- **#1 (soak 30 phút)** đọc **COM9**, theo dõi `[RING]` và `[M3]`: `reset=0`,
  `fe=oe=drop=0`, `late_max=0`, `tx` tăng đều.

#### 5.5.1 Ràng buộc `MAX_SPAN` — đọc TRƯỚC khi chọn vật thử

`kvc_blob_detect.v:203-204` **loại** box khi `w > 255` **hoặc** `h > 255`
(`MAX_SPAN = 255`). Đây là thiết kế đúng để chống "áo cam phủ toàn khung" (A5),
nhưng nó **làm hỏng phép thử F-02 nếu chọn vật sai kích thước**.

| Vật thử | Cạnh (px) | Diện tích | `w,h ≤ 255`? | Kết quả |
| :--- | :--- | :--- | :---: | :--- |
| Tấm phủ 1/3 khung (vuông) | 320 × 320 | 102.400 | ❌ | **`N=0`** — tưởng F-02 tệ hơn thực |
| Dải ngang 1/3 | 640 × 160 | 102.400 | ❌ (w=640) | **`N=0`** |
| **Thẻ 240×240** | **240 × 240** | **57.600 (19 %)** | ✅ | **Dùng cái này** |
| Thẻ 250×200 | 250 × 200 | 50.000 (16 %) | ✅ | Cũng được |

**Chọn thẻ 240×240 px** — lấp đầy tối đa trong giới hạn `MAX_SPAN`. Ước lượng
bằng mắt ở khung 640 px rộng: thẻ chiếm **37 % chiều rộng**, **50 % chiều cao**.
Đừng phóng to hơn.

#### 5.5.2 Vì sao KHÔNG đọc được `conf` từ `[M3]`

Dòng `[M3]` chỉ in **bốn** trường (`main.c:828-835`): `BB n<count> v<valid>
crc<err> en<enable>`. **Không có `w`, `h`, `x`, `y`, `conf`.**

- `[M3]` trả lời *"có mục tiêu hay không"* → dùng cho soak G2.7.
- `fpga_uart_capture.py` in `(x=..,y=..,w=..,h=..,c=..,p=..)` → dùng cho F-02,
  A3, A5.

Muốn `conf` phải đọc **COM8** bằng script, không phải COM9.

#### 5.5.3 Lệnh cụ thể

```powershell
# F-02: đọc hình học + conf (COM8). Đặt thẻ cam 240x240 px trước ống kính.
python scripts/manual/fpga_uart_capture.py `
    --port COM8 --baud 38400 --seconds 20 `
    --dump docs/verification/evidence/F02_card240_<YYYYMMDD-HHMM>.bin
```

**Kỳ vọng F-02 với thẻ 240×240:**

| Trường | Kỳ vọng |
| :--- | :--- |
| `N` | **1** trên gần như mọi khung |
| `w`, `h` | ~240 (dao động theo khoảng cách thẻ) |
| `p` (conf) | **100** (bão hoà) |

Nếu `p` vẫn **9–12** dù thẻ phủ 19 % ⇒ vấn đề là **ngưỡng màu**, không phải lấp
đầy. Khi đó mới xem `R_MIN/G_MIN/G_MAX/B_MAX` — và **chỉ sau** khi có số đo này.

#### 5.5.4 Soak G2.7 — dùng script, không chép tay

```powershell
.venv/Scripts/python.exe -B scripts/manual/soak_mcu_log.py `
    --port COM9 --minutes 30 `
    --out docs/verification/evidence/G2.7_soak_<YYYYMMDD-HHMM>.txt
```

Script tự kiểm và in bảng PASS/FAIL cho từng tiêu chí 2.7.1:

| Tiêu chí | Cách kiểm |
| :--- | :--- |
| Không reset | Đếm số dòng `BOOT ===`; > 1 là có reset |
| `fe`, `oe`, `drop` không tăng | So mẫu `[RING]` đầu và cuối |
| `byt` tăng | Δ > 0 |
| `isr == byt` | Không mất byte giữa ngắt và ring |
| `tx` không lỗi | `tx_fail` cuối = 0 |
| `crc_err = 0` | Trường `crc` cuối |
| `ovr` = 0, `late_max` nhỏ | Không trượt chu kỳ |
| `[M3]` cách ~1000 ms | Khoảng lớn nhất trong 900–1200 ms |

Script **không** kiểm được nhiệt FPGA (2.7.2) và FPS (2.7.3) — phải làm tay.
FPS phụ thuộc ánh sáng (F-01) nên **không** dùng làm tiêu chí ổn định.

Nếu `Ctrl+C` giữa chừng, script vẫn in báo cáo trên phần đã thu và ghi rõ
*"chưa đủ thời lượng 2.7.1"* thay vì đánh PASS.

---

### 5.6 Checklist trước khi cấp nguồn

Đối chiếu `firmware/mcu_payload/project_keil/main.c` — các macro dưới đây đã
đúng **mặc định**, không cần sửa:

| Macro | Giá trị mặc định | Đúng? |
| :--- | :--- | :--- |
| `KVC_FPGA_ENABLE` | `1` (dòng 371, từ 31/10/2026) | ✅ bật UART1 + ring |
| `KVC_M1_CLOCK_DIAG` | `0` | ✅ đây là code chẩn đoán tạm, phải tắt |
| `KVC_M2_RX_STATS_DIAG` | `1` | ✅ cần cho dòng `[RING]` |
| `KVC_M3_VALUE_DIAG` | `1` | ✅ cần cho dòng `[M3]` có `BB n...` |
| `KVC_ENABLE_INDOOR_MOCK_GPS` | `0` | ✅ **quan trọng** — không gửi toạ độ giả Đà Nẵng |
| `KVC_FPGA_UART_BAUD` | `38400` → DLL `0x14` | ✅ khớp IF-01 |

**Việc DUY NHẤT nên làm:** đổi `KVC_FW_ID` (dòng 341, hiện
`"KVC-MCU-20261028"`) thành chuỗi mới, ví dụ `"KVC-MCU-20261101-FPGA"`.

Lý do: dòng `=== <ID> BOOT ===` là thứ **duy nhất** chứng minh bo đang chạy bản
vừa nạp chứ không phải firmware cũ còn trong flash. Nếu giữ nguyên ID, không
phân biệt được "nạp thành công" với "nạp hỏng, vẫn chạy bản cũ".

**Đối chiếu UART5** (`kvc_pinout.h:97-111`): P0.15 = `UTXD5`, P0.14 = `URXD5`.
Tốc độ thật là **9615 bps** (`PRE=1`, `DLL=78`, UCLK 12 MHz), không phải 115200.
Terminal đặt **9600 8N1, không flow control** — lệch +0,16 %, đọc bình thường.
Đặt 115200 sẽ ra ký tự rác hoàn toàn.

**Không cần nối R12.** `kvc_fpga_bbox_poll()` chỉ đọc ring buffer; firmware
không đọc `P0.12` và không bật EXTI trên chân này. `kvc_fpga_pins_idle_safe()`
kéo nội bộ P0.12 xuống để tránh float.

**Trước khi nối, cần:** nạp firmware MCU bản mới nhất, xác nhận
`KVC_FPGA_ENABLE = 1` (mặc định từ 31/10/2026), và chụp ảnh cách đấu dây để lưu
vào `evidence/`.

---

## 6. Kiểm tra phía Gateway — `NOT RUN` (BLOCKED: thiếu bo)

> **Trạng thái 01/11/2026:** bo Gateway ESP32 **không có trên bàn lab của Phong**;
> do **Thịnh** phụ trách, **chưa bàn giao**. Mục này **không thể chạy** và được
> ghi `NOT RUN` — không phải FAIL.
>
> **Owner: Thịnh.** Chi tiết bàn giao:
> `evidence/KVC-MCU-FPGA-LORA-20261101-001.md` §7.3.

Trạng thái kỹ thuật: **`tx=17/0` phía MCU đã PASS** (LoRa đã phát và có TxDone).
Đây là nửa còn lại của phép đối chiếu mất gói — **chưa có số liệu**.

### 6.1 Xác nhận cấu hình RF đã khớp (đọc source, không cần đo)

| Tham số | MCU | Gateway | Khớp |
| :--- | :--- | :--- | :---: |
| Tần số | 433,0 MHz (reg `0x06/0x07`) | `LoRa.begin(433E6)` | ✅ |
| SF | SF7 (reg `0x1E = 0x74`) | `setSpreadingFactor(7)` | ✅ |
| BW | 125 kHz (reg `0x1D = 0x72`) | `setSignalBandwidth(125E3)` | ✅ |
| CR | 4/5 | `setCodingRate4(5)` | ✅ |
| Sync Word | `0x12` | `setSyncWord(0x12)` | ✅ |
| Hardware CRC | bật (reg `0x1E` bit 2) | `enableCrc()` | ✅ |

Cấu hình khớp **cả 6 tham số**. Nếu gateway không nhận thì lỗi ở tầng vật lý
(khoảng cách, anten, nguồn), **không phải** cấu hình — đừng sửa thông số RF.

### 6.2 Chuẩn bị gateway

1. **Tắt self-mock.** `ENABLE_SELF_MOCK` phải là `false` (đã là mặc định trong
   `firmware/gateway_esp32/src/main.cpp:231`). Nếu bật, gateway tự sinh dữ liệu và
   bạn sẽ "thấy số" dù không có sóng nào tới.
2. **Wi-Fi.** Truyền credential lúc build:
   ```powershell
   pio run -d firmware/gateway_esp32 `
       -D KVC_WIFI_SSID=\"ten-hotspot\" -D KVC_WIFI_PASS=\"mat-khau\"
   ```
   Không truyền thì gateway chạy SoftAP: SSID `KVC_GROUND_STATION`, pass
   `kvc123456`.
3. **Nạp và mở Serial 115200** để xem log gateway.

### 6.3 Phép đo nghiệm thu

Chạy **đồng thời** hai cửa sổ trong **60 giây**:

| Bên | Đọc gì |
| :--- | :--- |
| MCU (COM9, 9600) | `tx=ok/fail` trên dòng `[M3]` — lấy giá trị đầu và cuối |
| Gateway (115200) | Số gói nhận được trong cùng cửa sổ |

**Tiêu chí:**

| Kết quả | Kết luận |
| :--- | :--- |
| Gói nhận ≈ gói phát (lệch ≤ 2 %) | **PASS** — đường RF tốt |
| Nhận được một phần (< 98 %) | Mất gói — đo RSSI/SNR, kiểm anten/khoảng cách |
| Nhận 0 gói, MCU `tx` vẫn tăng | Lỗi tầng vật lý: anten, tần số, nguồn module, khoảng cách |
| Nhận 0 gói và MCU `tx` không tăng | Lỗi phía MCU — quay lại §5.2 |

> Đây chính là nội dung comment `main.c:65-72` mô tả: chỉ khi có cả
> `tx_ok_count` (MCU) **và** số gói gateway nhận trong cùng cửa sổ mới nghiệm
> thu được tiêu chí mất gói. Một phía không đủ.

### 6.4 Nếu gateway nhận nhưng backend không thấy

`tx` tăng mà GCS không có dữ liệu ⇒ lỗi nằm ở **gateway → WebSocket → backend**,
không phải RF. Kiểm theo thứ tự:

1. Gateway có kết nối Wi-Fi? Log `Serial` báo IP.
2. Backend chạy và trỏ đúng địa chỉ WS của gateway?
3. `rf_payload_hex` có xuất hiện trong message không?
4. Backend log có báo `crc_valid` false không? (Nếu có, xem lại IF-02.)

---

## 7. Nếu phải dừng giữa chừng

Nạp lại `KVC_FPGA_948D697E.fs` (bản mock đã từng chạy được) để bo về trạng thái
đã biết. Đừng để bo ở bitstream diag qua đêm — lần sau sẽ có người tưởng đó là
bản release.

Ghi vào log lý do dừng và đang ở bước nào. Một lần dừng có ghi chép rẻ hơn
nhiều so với việc đoán lại từ đầu.

---

## 8. Điều KHÔNG được kết luận từ G0

G0 chỉ trả lời **hai** câu: camera có phát VSYNC, và SCCB có cấu hình xong.

Nó **không** chứng minh:

| Không suy ra | Cần gì để chứng minh |
| :--- | :--- |
| Ảnh đúng màu | B2/G6.1: chụp vật đỏ, đo R/G/B |
| Blob detect đúng | B3/A1–A10 với bitstream release |
| Georef cho ra toạ độ | Cần GNSS + Yaw + độ cao thật |
| Hộp đứng yên có toạ độ | **Không có** — quyết định H4: hiển thị `N/A` |
