# Bằng chứng kiểm chứng (local evidence)

Thư mục này chứa log/ảnh/capture sinh ra khi chạy checklist
`docs/verification/BRINGUP_CHECKLIST.md` trên phần cứng thật.

## Nội dung hiện có

| File | Bước | Nội dung | Kết quả |
| :--- | :--- | :--- | :--- |
| `capture_01.bin` | G2.2 | 28.672 byte thô từ FPGA qua USB-UART (CH340) | — |
| `G2.2_uart_capture_20261031.txt` | G2.2/G2.3 | Output parser đầy đủ từng frame | **PASS** — 1.102 frame, 99,9 % byte trong khung, 100,0 FPS, dt 10,00 ms |
| `G2.4_mcu_log_20261031.md` | G2.4 | 2 lần đo log `[M3]`/`[RING]` từ MCU Sonix + phân tích | **PASS** — `fe=0 oe=0 drop=0 pend=0` trên 197.844 B / 7.609 frame |
| `KVC-FPGA-BLOB-20261101-001_T1-T13.md` | Plan blob | Thực hiện T1–T13: file sửa, 4 khác biệt so với plan, build SHA, giới hạn | **SIMULATED + BUILT** — 22/22 TB PASS; Gate G0.2–G0.4 và A1–A10 **NOT RUN** |
| `KVC-S3CAM-20261101-001_A3-A5.md` | IF-05 A3–A5 | Sửa `last_frame_age_ms`/nhịp publish/boundary; công cụ đo MJPEG; số test thực | **SOURCE-VERIFIED + SIMULATED** — 22/22 relay, 84 backend, 173 frontend; **phần cứng NOT RUN** |
| `KVC-S3CAM-20261101-002_A1.md` | IF-05 A1 | Firmware ESP32-S3-CAM (OV3660/SVGA/q12/cổng 81/STA) + 17 test hợp đồng byte; **phát hiện và sửa lỗi P1 khung MJPEG bị cắt** | **SOURCE-VERIFIED + BUILT** — build exit 0, 84/84 backend; **chưa nạp bo** |
| `KVC-FPGA-G0G6-20261101-001.md` | Track B: G0 + G6.1 | Nạp release `86CCF5DD` trên Primer 20K + OV2640, capture UART thật: nền `N=0`, mục tiêu cam `N=1 class=2` | **HARDWARE-VERIFIED** cho "pixel thật → blob" · **2 finding mở (F-01 FPS, F-02 độ ổn định)** · G0.3/G0.4 đo bằng đường khác |
| `KVC-MCU-FPGA-LORA-20261101-001.md` | Track B: MCU + LoRa | Nối `R13`→`P2.3`, capture COM9: `fe=0 crc0 drop=0` trên 720 B, `v1`, `tx=17/0`, ABI GV-02 PASS, `US=68..70cm ok` | **HARDWARE-VERIFIED** cho "FPGA→MCU bóc đúng IF-01" và "MCU→SX1278 phát TxDone" · **gateway `NOT RUN` — BLOCKED, bo chưa bàn giao (owner Thịnh)** · `BB n0` là đúng (xem §3) |
| `G6.1_blob_baseline_neg_20261102-0142.txt` | Track B: baseline âm | Nền không mục tiêu, release `86CCF5DD`, COM8: **409 khung** `N=0`, 0 CRC, 0 rác thật. **FPS 7,5** (133,7 ms/khung) — xác nhận F-01 trên bo | **HARDWARE-VERIFIED** cho "link IF-01 + camera phát frame" · `--seconds` **không có hiệu lực** (block-read cũ) · **KHÔNG** nói gì về nhận diện (không có mục tiêu) |
| `G6.1_blob_light_bright_20261102-0230.txt` | Track B: A/B ánh sáng (có `--dump`) | Đọc trực tiếp từ `.bin`: **1.288 B**, **128 khung** (127×10 + 18 khớp tuyệt đối), 0 CRC, 0 rác, ts đơn điệu, 4,245 fps. **1 khung `N=1`** `x=212 y=89 w=243 h=49 cls=2 conf=8`. Nhịp khung nằm trên **lưới 65,6 ms** với bội **1/3/5/6** ⇒ trần **15,25 fps**, không phải 4,2 | **HARDWARE-VERIFIED** cho link + blob `class=2` · **KHÔNG** cho A8/A9 · 4 số của bản tóm tắt chat bị đính chính (xem §2 của file) |
| `G2.7_soak_20261102.txt` | G2.7 | Soak 30,0 phút (03:02:31→03:32:31): 272 mẫu `[RING]FPGA`, **`fe=oe=drop=0`**, `isr==byt` 272/272, **76.750 B / 1.788,4 s = 42,92 B/s = 4,29 frame/s**, nửa đầu/sau lệch 0,2 %. `late_max=0`, `ovr=0`, LoRa `tx=1691 err=0`, `BB v1 crc0 en1` 100 % | **PASS 3/4** — **nhiệt độ CHƯA ĐO**. Phát hiện phụ: `BB n1` xuất hiện 13/1.456 dòng; `[M3] t` trôi 0,751→0,817 (F-06) |
| `G6.1_blob_baseline_neg_20261102-0142.txt` | Track B: baseline âm | Nền không mục tiêu, release `86CCF5DD`, COM8: **409 khung** `N=0`, 0 CRC, 0 rác thật. **FPS 7,5** (133,7 ms/khung) — xác nhận F-01 trên bo | **HARDWARE-VERIFIED** cho "link IF-01 + camera phát frame" · `--seconds` **không có hiệu lực** (block-read cũ) · **KHÔNG** nói gì về nhận diện (không có mục tiêu) |
| `KVC-FPGA-BLOB-20261102-001.md` | Track B: phân tích | Phân tích 5 file `.bin`/log + **F-04** (timestamp bị xé, đo được 1 khung lùi 59 ms), **F-05** (lưới 65,6 ms), **F-06** (timebase MCU trôi) | **HARDWARE-VERIFIED** cho số đo · cả 3 finding **MỞ**, chưa sửa RTL. **F-06 đã nâng P1** — xem file dưới |
| `KVC-F02-G27-20261102-001.md` | F-02 + G2.7 + F-06 | F-02: thẻ 240×240 → BBox 226×200 nhưng **lấp đầy chỉ 1 %**, **bác bỏ giả thuyết kích thước**, nguyên nhân là ngưỡng màu. G2.7: PASS 2/3. **F-06 nâng P1** — `kvc_millis()` chỉ tăng khi `delay_*` chạy, drift 110 s/10 phút | **HARDWARE-VERIFIED** cho số đo · F-06 **MỞ** |
| `KVC-MCU-TB-001-20261102-001.md` | `KVC-MCU-TB-001` — fix F-06 | Đổi timebase sang **SysTick 1 ms phần cứng**; `add_*` no-op khi HW tick (chống đếm đôi với `kvc_usound_delay_us`/`kvc_gnss_spin_ms`); viết lại `delay_ms`; dòng `[INIT] Timebase`; script soak kiểm **tỉ lệ MCU/wall** thay vì dùng đồng hồ lỗi làm chuẩn | **SOURCE-VERIFIED + BUILT** (Keil 0E/0W, host 33/33) |
| `KVC-MCU-TB-001-20261102-002_HW.md` | `KVC-MCU-TB-001` — nghiệm thu bo | `[INIT] Timebase SYSTICK 1ms (hw, dung)`; chu kỳ `t` = 1.000 ms (trước 1.220); IF-01 `fe=oe=drop=0` trên 1.050 B. **Đính chính: cửa sổ siêu âm 350 ms (không phải 500), và `late_max` không phải "bỏ qua idle"** | **HARDWARE-VERIFIED** cho "SysTick chạy trên bo" |
| `KVC-MCU-TB-001-20261102-003_SOAK2.md` | Soak 10 phút — đóng F-06 + F-07 | **ratio MCU/wall = 1,0023** (trước 0,8166), ổn định ±1,2 % qua 10 đoạn ⇒ **F-06 CLOSED** · F-07 phát hiện trong cùng phiên (`fe == byt`, `BB v0`) rồi **CLOSED**: nguyên nhân là **tiếp xúc dây R13/GND**, không phải phần mềm. Cắm lại → `fe=0`, `BB v1` 100 % | **HARDWARE-VERIFIED** cho cả F-06 và F-07 |
| `F02_card_20261102.bin` · `F02_card240_20261102.bin` | F-02 | 85 / 84 khung, 0 CRC. Card 240: 10/84 khung có `N=1`, fill 1,0–5,5 %, aspect 1,1–4,6 | dùng cho F-02 + F-05 |
| `F02_card240_run2.bin` | — | 3.655 B, **0 khung IF-01**, chỉ 4 giá trị byte (`00 78 80 F8`) | **không dùng** — không phải dữ liệu IF-01 |
| `KVC-CAM-DIAG-20261102-001.md` | `KVC-CAM-DIAG` — tự đo VSYNC | Bitstream **`C82B9EFE`** (`DIAG_MODE=2`): `vsync_monitor` đo chu kỳ VSYNC bằng clock nội 100 MHz (**thay scope/LA**), `vsync_report` đẩy 10 slot ra IF-01. Kèm **sửa F-04** (latch `timestamp`). Fmax `clk_100m` **105,030 MHz**, `cam_pclk` 167,628 MHz, TNS = 0. Công cụ: `scripts/manual/decode_vsync_diag.py` | **BUILT + SIMULATED** — 24/24 TB PASS, F-04 có phép thử âm · **CHƯA NẠP BO** |
| `G6.1_blob_vsyncdiag_20261102-1130.bin` + `.txt` | Capture 40 s COM9 | **163 khung** (160 `N=0` + 3 `N=1`), 1.654 B, 0 CRC, 0 rác, ts đơn điệu 21.857→61.614 ms, 4,10 fps, tải UART 1,08 %. 3 BBox `class=2` conf 6/8/15, fill 1,9–4,0 % | **KHÔNG phải capture của `C82B9EFE`.** Không có khung `N=10` nào ⇒ bitstream đang nạp là release `86CCF5DD`. **F-04 chưa kiểm** (bản chạy thiếu `ts_lat`); **VSYNC chưa đo**. Lưới 65,54 ms **không xác định được**: P=32,77 ms (30,52 fps) khớp y hệt, và "1x" thực tế là 68–69 ms, không phải 65–66 |
| `G6.1_blob_vsyncdiag_20261102-1415.bin` · `.txt` · `KVC-CAM-DIAG-20261102-1415-analysis.md` | Capture 300 s COM9 | **Đúng** bitstream `C82B9EFE` (rev 0): **151/151 khung `N=10`**, 13.590 B, 0 CRC, 0 rác, 300,0 s. `t_vsync` 4.534 · `t_frame` 2.754 · bucket **662/1421/158/101/2191**. Phát hiện **glitch `cam_vsync`**: 39 cửa sổ `w_min = 1 ms` | **HARDWARE-VERIFIED** cho số đo · **KHÔNG** kết luận được F-05 (`other` 48,3 %) hay "rớt 1.780 frame" (`t_vsync` bị glitch) · 4 số trong bản tóm tắt chat bị đính chính. `.txt` = log thô, `.md` = phân tích |
| `KVC-CAM-DIAG-20261102-002.md` | `KVC-CAM-DIAG` **rev 2** | Sửa 3 lỗi của rev 0: `t_bother` 8 bit → 16 bit; thêm **bucket 2x (120–145)** và **bucket short (<55)**; thêm **lọc glitch `GLITCH_MS = 10`** (`t_rejected`/`t_bshort` cho biết mức nhiễu). Bitstream **`CA6D5137`**, Fmax `clk_100m` **109,546 MHz**, 2.588 LUT, N=12. `tb_vsync_monitor` **42/42**, suite **24/24** | **BUILT + SIMULATED** — **CHƯA NẠP BO** · decoder tự nhận layout 10/12 nên file cũ vẫn đọc đúng |


**Chưa có:** G2.1 (log nạp bitstream), **G2.7 (soak — xem ghi chú dưới)**,
6.1.9 (ngưỡng màu RGB565), G6.2 mục 6.2.1–6.2.7 (2/3/4/5 m, mặt nước),
A1/A3/A4/A5/A7 (nghiệm thu blob), A0/A5/A6 (bring-up và đo ESP32-S3-CAM),
**toàn bộ phía Gateway (G1–G6)**.

**Đã có trên bo (01–02/11/2026):**

| Mục | Trạng thái có bằng chứng |
| :--- | :--- |
| Gate G0.2–G0.4 | ✅ đạt (G0.3/G0.4 gián tiếp qua release — xem `KVC-FPGA-G0G6-20261101-001.md` §4.1) |
| A2 (mục tiêu cam → `N=1 class=2`) | ✅ |
| A6 (`crc_err=0`) | ✅ 0 lỗi CRC trên 128 + 84 + 409 khung; **chưa đạt 1.000 khung liên tục** trên một phiên `.bin` |
| A8 (nhịp khung 25–32/s) | ❌ FAIL — 5,08 / 7,48 / 4,245 / 4,29 frame/s (F-01 → **F-05**) |
| A9 (LUT/BSRAM/DSP) | ❌ theo hồ sơ build: 1 BSRAM / 0,5 DSP, vượt tiêu chí |
| A10 (Fmax ≥ 100 MHz) | ✅ 113,277 MHz, TNS 0 (theo hồ sơ build) |
| IF-01 trên MCU | ✅ `fe=0 crc0 drop=0`, `v1` — trên 720 B, 1.050 B, 2.162–2.880 B sau khi cắm lại dây |
| IF-02 trên MCU | ✅ `tx=188..194/0` trong phiên sửa F-07; `tx=609/0` kết soak2; ABI GV-02 PASS |
| Timebase MCU | ✅ **F-06 CLOSED** — ratio MCU/wall = 1,0023 (soak 10 phút) |
| F-07 (IF-01 framing) | ✅ **CLOSED** 02/11/2026 — nguyên nhân **tiếp xúc dây**, không phải phần mềm |
| G2.7 soak 30 phút | ⚠️ **PASS 3/4** — `fe=oe=drop=0` 272/272, nhiệt **CHƯA ĐO** |
| Gateway nhận sóng | ❌ **NOT RUN — BLOCKED, bo chưa bàn giao (owner Thịnh)** |

> **G6.2 — UNBLOCKED 01/11/2026 + có số đo đầu tiên.** Cảm biến siêu âm AJ-SR04M
> đã hoạt động ổn định; log MCU ghi `US=68cm ok` / `US=70cm ok` (một khoảng cách
> ~0,7 m trong không khí tĩnh). Điều này bỏ chặn nhánh "có độ cao thật nhưng thiếu
> góc hướng"; **không** làm hộp đứng yên có tọa độ — H4 vẫn giữ `N/A` vì không có
> Yaw khi vận tốc GNSS = 0. Muốn đóng G6.2 cần đo đủ 6.2.1–6.2.7 (2/3/4/5 m +
> mặt nước) và lưu bảng vào `USOUND_CALIBRATION_5M.md`.

> **G2.7 — ĐÃ CHẠY 02/11/2026, PASS 3/4.** File
> `G2.7_soak_20261102.txt` (03:02:31 → 03:32:31, đúng 30,0 phút): 272 mẫu
> `[RING]FPGA`, `fe=oe=drop=0` trên toàn bộ, `isr==byt` 272/272, 76.750 B qua
> 1.788,4 s = **42,92 B/s**, nửa đầu / nửa sau lệch **0,2 %**. `late_max=0`,
> `ovr=0` trên 1.456 dòng `[M3]`; LoRa `tx=1691 err=0`; `BB v1 crc0 en1` 100 %.
> **Còn thiếu mục 2.7.2 nhiệt độ** ⇒ ghi `PASS (3/4, nhiệt CHƯA ĐO)`, không ghi
> PASS tuyệt đối. Ghi chú cũ bên dưới giữ lại làm lịch sử.
>
> Phát hiện phụ khi đọc log: (a) `BB n1` xuất hiện **13/1.456** dòng — chưa rõ có
> mục tiêu trước ống kính hay là false positive; (b) `[M3] t` trôi
> **0,751 → 0,817** so với wall-clock (F-06); (c) `USND ... fe=` **không phải**
> framing error — mọi dòng đều `fe == byt == isr`, nên trường này mang nghĩa khác.
>
> **Ghi chú lịch sử (01/11/2026):** trước lần chạy này, `BRINGUP_CHECKLIST.md`
> từng ghi G2.7 `PASS` "theo người dùng xác nhận" trong khi tài liệu này và
> `docs/INDEX.md` ghi `NOT RUN`. Ba tài liệu đã khớp nhau ở trạng thái *chưa có
> soak* cho tới 02/11/2026.

> **Gateway — `NOT RUN` vì thiếu bo (01/11/2026).** Toàn bộ Giai đoạn 1–6 của
> `GATEWAY_TEST_PLAN.md` chưa chạy được: bo Gateway ESP32 do **Thịnh** phụ trách và
> chưa bàn giao sang bàn lab của **Phong**. Đây là chặn phần cứng, **không phải**
> FAIL và **không** suy ra được từ `tx=17/0` phía phát.

**Chưa có review độc lập** cho plan `KVC-FPGA-BLOB-20261101-001`. Người dùng đã
quyết định bỏ qua bước review (01/11/2026). Mọi kết luận trong tài liệu blob là
kết quả tự kiểm của owner, không phải của người thứ hai. Việc đo trên bo ngày
01–02/11/2026 **đã có** nên các kết luận *có capture* được nâng lên
`HARDWARE-VERIFIED` trong phạm vi hẹp đã ghi rõ ở từng file; các mục chưa đo vẫn
giữ `SIMULATED`/`BUILT`/`NOT RUN` tương ứng.

## Quy ước đặt tên

```text
G2.1_nap_bitstream_<YYYYMMDD-HHMM>.log
G2.2_uart_capture_<YYYYMMDD-HHMM>.hex
G2.2_uart_parser_<YYYYMMDD-HHMM>.txt
G2.4_mcu_ring_log_<YYYYMMDD-HHMM>.txt
G6.1_camera_marking_<YYYYMMDD-HHMM>.jpg
G6.1_blob_mp_<YYYYMMDD-HHMM>.txt       (mp = mau phat hien: baseline_neg / target_on / light_bright)
G6.1_blob_mp_<YYYYMMDD-HHMM>.bin       (byte tho, tu --dump — bat buoc khi muon kiem lai CRC)
G6.2_usound_<YYYYMMDD-HHMM>.csv
IF-05_mjpeg_measure_<YYYYMMDD-HHMM>.csv   (từ scripts/manual/measure_mjpeg_stream.py --out)
```

`G6.1_blob_*` dùng cho **mọi** lần capture đường blob, để so A/B theo một bộ
chỉ số cố định. Ghi `<mp>` ngay trong tên file để không phải mở file mới biết
đó là nền hay có mục tiêu.

Ngoại lệ đã có: `G6.1_blob_baseline_neg_20261102-0142.txt` giữ tên cũ vì đã
được tham chiếu trong báo cáo; từ lần sau theo mẫu `<mp>` ở trên.

Mỗi file phải kèm trong bảng kết quả của checklist:

- Git HEAD
- SHA-256 bitstream (đối chiếu `FPGA_BUILD_RECORD.md`)
- Firmware MCU (version/hash)
- Ngày giờ đo

Không đánh dấu PASS nếu thư mục này không có file tương ứng.

## Quy tắc ghi mức bằng chứng

Chỉ ghi `PASS` khi có **số liệu trực tiếp** trong file log, không suy ra từ
chỉ số khác. Ví dụ cụ thể đã gặp ngày 31/10/2026: `crc = 0` chứng minh *dữ liệu
giải mã được*, nhưng **không** thay thế được `fe` — `fe` mới là chỉ số biên
đường truyền. Khi thiếu số liệu, ghi `CHƯA ĐO` và lý do, không ghi `PASS`.
