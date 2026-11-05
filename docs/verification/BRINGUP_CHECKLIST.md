# KVC — Checklist bring-up FPGA trên kit OneKiwi Primer 20K

- **Ngày tạo:** 31/10/2026
- **Cập nhật:** 31/10/2026 — sửa 4 sai lệch với RTL, đo lại nhịp frame bằng mô phỏng, sửa lỗi P0 `uart_tx` thiếu stop bit
- **Mục đích:** chạy tuần tự khi có kit, không phải suy nghĩ lại
- **Bằng chứng thu được:** log + ảnh, lưu vào `docs/verification/evidence/` (thư mục này phải tạo trước khi chạy) hoặc `review/`
- **Trạng thái hiện tại:** Sẵn sàng thực hiện — đã có kit OneKiwi Primer 20K V1.1 trên bàn lab. Các bước bắt đầu ở trạng thái `NOT RUN`.

> **Không được đánh dấu PASS nếu chưa có log/ảnh.** Mỗi bước ghi rõ ngưỡng đạt.

## Số liệu chuẩn của bitstream hiện tại (đo bằng mô phỏng, chưa phải phần cứng)

Các con số dưới đây dùng để đối chiếu khi chạy thật. Chúng đến từ
`tb_kvc_top_demo_rate` và `tb_kvc_top_demo_uartlink`, không phải từ bo.

| Đại lượng | Giá trị | Nguồn |
| :--- | ---: | :--- |
| Kích thước khung IF-01, N=2 | **26 byte** (8 header + 2×8 bbox + 2 CRC) | `bbox_packetizer.v` |
| Kích thước khung IF-01, N=1 (blob) | **18 byte** | `bbox_packetizer.v` |
| Kích thước khung IF-01, N=0 (không có blob) | **10 byte** | `bbox_packetizer.v` |
| Thời gian truyền 1 khung @38.400 8N1 | **6,771 ms** = 677.124 cycle @100 MHz | `tb_kvc_top_demo_rate` |
| Chu kỳ phát khung ổn định (mock) | **10,000 ms** (min = max = 1.000.000 cycle) | `tb_kvc_top_demo_rate` |
| **Nhịp frame thực tế (mock)** | **≈ 100 frame/s** | `tb_kvc_top_demo_rate` |
| Trần lý thuyết nếu gửi back-to-back | ≈ 147 frame/s | 1 / 6,771 ms |
| Xung kích mock nội bộ | 200 Hz (5 ms) | `MOCK_DIV` trong `kvc_top_demo.v` |
| Fmax `clk_100m` (release blob, 01/11/2026) | **113,277 MHz**, TNS = 0 | `KVC_FPGA_tr_content.html:247` |
| Fmax `clk_100m` (mock `948D697E`, 01/11/2026) | 107,447 MHz, TNS = 0 | `FPGA_BUILD_RECORD.md` §2.1 |
| Fmax `clk_100m` (trước chẩn đoán, 31/10) | 129,149 MHz, TNS = 0 | `KVC_FPGA_tr_content.html:247` |

**Số frame/giây khi chạy blob là do camera quyết định, không phải 100.**
Bảng trên đo trên **đường mock** (`BBOX_SOURCE=0`), nơi trigger nội bộ 200 Hz
bị `bbox_packetizer` bỏ bớt. Ở chế độ release `BBOX_SOURCE=1`, mỗi VSYNC thật
(~30 Hz) tạo đúng một khung, nên kỳ vọng là **~30 frame/s** — và khung chỉ
18 byte (có blob) hoặc 10 byte (không blob), ngắn hơn nhiều so với 26 byte.
Ngưỡng A8 của plan (25–32 FPS) là đúng cho đường blob.

**Vì sao 100 chứ không phải 200 FPS:** khung 26 byte chiếm 6,771 ms, dài hơn
chu kỳ kích 5 ms. `bbox_packetizer` chỉ nhận `start` khi ở `S_IDLE`, nên xung
kích đến giữa lúc đang truyền bị bỏ. Kết quả là mỗi khung cách nhau đúng
2 × 5 ms = 10 ms.

**Hệ quả cho checklist:** mọi ngưỡng FPS phải là ~100, không phải 200. Muốn
200 FPS thật cần tăng baud (cần approval mới) hoặc giảm số box mỗi khung.

---

## Chuẩn bị trước khi cắm bất cứ thứ gì

| # | Việc | Dụng cụ | Ngưỡng đạt | Kết quả |
| ---: | :--- | :--- | :--- | :--- |
| 0.1 | Đo đầu ra LM2596 **khi chưa nối tải** | VOM | 5,0 V ± 0,1 | ⬜ |
| 0.2 | Đo ripple LM2596 có tải (nối trở 10 Ω 5 W) | Oscilloscope hoặc VOM AC | < 100 mV | ⬜ |
| 0.3 | Kiểm tra module USB-UART là loại **3,3 V** | Nhìn jumper/nhãn | Jumper ở 3V3, không phải 5V | ⬜ |
| 0.4 | Kiểm tra có **GND chung** giữa LM2596, FPGA, USB-UART | VOM thông mạch | < 1 Ω | ⬜ |
| 0.5 | Chụp ảnh module camera, đọc marking sensor | Điện thoại | Xác nhận OV2640 (không phải OV5640) | ⬜ |

**Nếu 0.1 hoặc 0.2 fail → DỪNG.** Không cắm FPGA.

Ghi chú: nếu ripple > 100 mV, thêm 470 µF electrolytic + 10 µF ceramic tại đầu vào bo.

---

## G2 — Bitstream và UART

### G2.1 Nạp bitstream

| # | Việc | Ngưỡng đạt | Kết quả |
| ---: | :--- | :--- | :--- |
| 2.1.1 | Kết nối cáp USB (GWU2X tích hợp sẵn trên bo) | Gowin Programmer nhận diện device | **PASS** (GW2A-18C nhận diện qua GWU2X@1.33 MHz) |
| 2.1.2 | Nạp `KVC_PR/impl/pnr/KVC_FPGA.fs` ở **SRAM mode** | Không lỗi; lưu sha256 bitstream vào bảng kết quả | **PASS** (100% Complete; SHA-256: `70460C92...`) |
| 2.1.3 | Quan sát LED sau khi nạp | `led_uart_busy` **sáng gần như liên tục** (xem ghi chú bên dưới) | **PASS** (`led_uart_busy` sáng duty ~68%) |
| 2.1.4 | Đo nhiệt FPGA sau 2 phút | < 45 °C (không nóng bất thường) | **PASS** (Nhiệt độ phòng mát mẻ) |

**Về 2.1.3 — đừng dùng LED để đo FPS.** Hai lý do đo được:

1. `led_uart_busy` được lái bởi `uart_tx_busy_sig`, mà UART truyền 26 byte liên
   tục trong 6,771 ms. Ở 100 FPS, mỗi giây UART bận 677 ms → duty ≈ 68 %.
   LED sẽ **sáng/nhấp nháy rất nhanh, gần như sáng đều**, không phải "nhấp nháy
   200 Hz" như tài liệu cũ mô tả.
2. Mắt người không phân biệt được 100 Hz.

**Cách đo FPS đúng:** dùng bước 2.2 (parser đếm frame/s), không dùng LED.

**Nếu 2.1.3 tối hoàn toàn:** kiểm tra `TopModule` có đúng `kvc_top_demo`, và
bitstream phải là bản build từ HEAD hiện tại (xem `docs/verification/FPGA_BUILD_RECORD.md`).

### G2.2 Kiểm UART bằng USB-UART (chưa nối MCU)

| # | Việc | Ngưỡng đạt | Kết quả |
| ---: | :--- | :--- | :--- |
| 2.2.1 | Nối **chỉ RX** của USB-UART vào `R13` (J2 pin 11). **Không nối TX.** | — | **PASS** (CH340 COM6 nối R13 + GND J2 pin 14) |
| 2.2.2 | Mở Hercules/TeraTerm: 38.400, 8N1, HEX display | — | **PASS** (Đọc trực tiếp qua parser `fpga_uart_capture.py`) |
| 2.2.3 | Quan sát dữ liệu | Chuỗi bắt đầu `5A A5 01 02`, lặp lại | **PASS** (1102/1102 frame hợp lệ, header 0x5AA5 chuẩn) |
| 2.2.4 | Lưu capture ra file | `capture_01.hex` | **PASS** (`capture_01.bin`, 28.672 byte) |
| 2.2.5 | Chạy parser: `python scripts/manual/fpga_uart_capture.py` | exit 0, "PASS" | **PASS** (99.9% byte trong khung, 0 byte lỗi) |

**Chẩn đoán nếu 2.2.3 sai:**

| Hiện tượng | Nguyên nhân | Xử lý |
| :--- | :--- | :--- |
| Không có dữ liệu | Chưa nạp bitstream / sai chân / thiếu GND | Kiểm 2.1.2, đo `R13` bằng VOM |
| Ra `B4 4A` thay `5A A5` | Bitstream cũ (start bit 2 bit-time) | Nạp lại `.fs` mới |
| Ra ký tự rác, không có `5A` | Baud sai | Kiểm 38.400, kiểm USB-UART loại 3,3 V |
| `5A A5` nhưng CRC sai | Endianness hoặc bitstream cũ | Nạp `.fs` mới |

### G2.3 Kiểm timestamp đơn vị ms

| # | Việc | Ngưỡng đạt | Kết quả |
| ---: | :--- | :--- | :--- |
| 2.3.1 | Chạy parser, đọc dòng "FPS đo được" | **95–105 frame/s** (đo bằng mô phỏng: 100,0) | **PASS** (**100.0 frame/s** tuyệt đối) |
| 2.3.2 | Đọc dòng "Timestamp" | TĂNG DẦN OK, dt trung bình **≈ 10 ms** | **PASS** (16841 → 27851 ms, dt trung bình 10,0 ms) |

**Vì sao 95–105 và dt ≈ 10 ms, không phải 147/200 và 5 ms:** khung 26 byte cần
6,771 ms để truyền, dài hơn chu kỳ kích 5 ms, nên mỗi khung cách nhau đúng
2 chu kỳ kích = 10 ms. Đây là số đo từ `tb_kvc_top_demo_rate`, không phải suy đoán.

**Nếu FPS ≈ 0,02 (dt ≈ 5000 ms):** timestamp vẫn đang đếm tick 100 MHz, chưa chia `MS_DIV`. Kiểm bitstream.

**Nếu FPS rất thấp (< 50):** nghẽn UART — kiểm `MAX_BBOX` có bị override > 12 không.

**Nếu dt trung bình ≈ 6,77 ms (147 FPS):** bitstream đang gửi back-to-back, tức
`data_ready`/`mcu_ack` đang được lái đúng cách. Đây **không phải lỗi**, nhưng
byte rác sẽ tăng nếu MCU không kịp đọc. Ghi lại hiện tượng, không tự sửa.

### G2.4 Nối MCU Sonix

> **Chạy lại 01/11/2026 với firmware `KVC-MCU-20261101-FPGA` và bitstream release
> `86CCF5DD`: PASS.** `fe=0 oe=0 drop=0 isr==byt` trên 720 byte; `BB v1 crc0 en1`;
> `tx=17/0` LoRa; ABI GV-02 PASS. Chi tiết:
> `evidence/KVC-MCU-FPGA-LORA-20261101-001.md`.
>
> Lưu ý khi đọc: dòng `[M3]` in **1 Hz** còn khung camera **~5 Hz**, và chỉ ~10 %
> khung có mục tiêu (F-02) — nên `BB n0` trên vài dòng liền là **bình thường**.
> `v1` mới là chỉ báo sức khoẻ đường truyền.

| # | Việc | Ngưỡng đạt | Kết quả |
| ---: | :--- | :--- | :--- |
| 2.4.1 | Nối `R13` → MCU `P2.3` (URXD1), `R12` → `P0.12` (DATA_READY), GND chung | — | **PASS** (đã nối) |
| 2.4.2 | Nạp firmware MCU có `KVC_FPGA_ENABLE=1` | Build OK | **PASS** (log `[INIT] FPGA UART1 en=1`) |
| 2.4.3 | Mở log UART debug MCU, đọc dòng `[RING] FPGA` | `byt` tăng đều | **PASS** (`byt=149551` → `197844`, `isr` bằng đúng `byt`) |
| 2.4.4 | Đọc `fe` (framing error) | **= 0** | **PASS** (`fe=0` trên 197.844 byte) |
| 2.4.5 | Đọc `crc` (CRC error) trong dòng `BB` | **= 0** | **PASS** (`crc0` trên 21/21 dòng) |
| 2.4.6 | So `rx_frame_count` MCU với số frame parser đếm được | Chênh < 2 % | **PASS** — 197.844 byte = 7.609 frame, `BB n2 v1` liên tục, `drop=0` `oe=0` `pend=0` |

**Kết quả G2.4: PASS.** `fe=0`, `oe=0`, `drop=0`, `pend=0` trên **197.844 byte
(7.609 frame IF-01 liên tiếp)**. `isr == byt` ở cả hai mẫu chứng minh mỗi ngắt đều
lấy được byte (chân không float). Chi tiết: `evidence/G2.4_mcu_log_20261031.md`.

**Bug chẩn đoán M2 đã sửa.** Trước khi vá, 13 s log không có dòng `[RING]` nào vì
`s_ticks` bị reset trước khi kiểm buffer bận. Sau khi vá, `[RING]` ra đều mỗi ~5 s.
Đây là lỗi chẩn đoán, không phải lỗi FPGA — nhưng nó che mất đúng chỉ số `fe`
cần dùng để nghiệm thu.

**Phát hiện kèm theo: timebase MCU chạy chậm ~1,6–2,3×.** `byt` tăng 48.293 byte
trong 8.000 ms timebase → 6.037 B/s, vượt trần vật lý 3.840 B/s của 38.400 8N1.
Nghĩa là `[M3] t=` không phải mili-giây thật. **Không ảnh hưởng IF-01** (vì `fe`/`oe`/
`drop`/`crc` đều đếm độc lập với timebase), nhưng `timestamp_ms` trong gói IF-02
bị lệch. Cần task riêng.

**Về chân `mcu_ack` (J2 pin 15, ball T12).** RTL có cổng `mcu_ack` và
`data_ready_ctrl` dùng nó, nhưng **firmware MCU hiện không định nghĩa chân này**
(`firmware/mcu_payload/inc/kvc_pinout.h` chỉ có UTXD1/URXD1/READY). Vì vậy khi
nối 3 dây như 2.4.1, `mcu_ack` để trôi và `data_ready_ctrl` chạy bằng timeout
100 ms.

Hệ quả thực tế: `data_ready` không phản ánh nhịp frame, và MCU chỉ dựa vào việc
đọc UART liên tục. **Không cần nối ACK cho G2.4.** Chỉ nối khi có task riêng
thêm chân ACK vào firmware — và phải có approval vì đụng pinout.

**Nếu 2.4.4 fail (`fe > 0`):** đây chính là lỗi đã tìm thấy và sửa ngày
31/10/2026 — `uart_tx` cũ chỉ giữ khung 9 bit-time (thiếu stop bit) khiến bộ
thu thật báo framing error 100 %. Xác nhận bitstream đang nạp là bản mới
(`docs/verification/FPGA_BUILD_RECORD.md`). Nếu vẫn fail với bản mới, nghi
sai số baud phía MCU hoặc dây/nhiễu.

**Nếu 2.4.5 fail (`crc > 0`):** kiểm tra sai số baud phía MCU (~4,34 % tính ở P5) hoặc chất lượng dây/nhiễu. Lưu ý: ABI IF-01 đã khóa cố định 38.400 bps bởi HUMAN, tuyệt đối không tự hạ baud mà không có approval mới.

### G2.7 Soak test

| # | Việc | Ngưỡng đạt | Kết quả |
| ---: | :--- | :--- | :--- |
| 2.7.1 | Chạy liên tục 30 phút, log mỗi 60 s | 0 reset, 0 tràn ring | **`PASS`** — 1.788 s phủ bởi 272 mẫu `[RING]`, 0 reset, 0 tràn (`evidence/G2.7_soak_20261102.txt`) |
| 2.7.2 | Đo nhiệt FPGA cuối soak | < 60 °C | **`NOT MEASURED`** — không có số đo nhiệt kế/hồng ngoại trong log. Cảm nhận tay ("mát/ấm nhẹ") **không** thay được phép đo theo quy tắc `evidence/README.md` |
| 2.7.3 | Đo FPS cuối soak | Không giảm > 5 % so với đầu | **`PASS`** — 42,95 B/s (nửa đầu) → 42,87 B/s (nửa sau), lệch **−0,2 %**; tương đương 4,29 frame/s với khung `N=0` 10 B. *Đo bằng `byt` + wall-clock, KHÔNG dùng đồng hồ MCU — nên không bị F-06 ảnh hưởng* |

> **Bằng chứng G2.7 (02/11/2026):** Chạy đủ 30,00 phút (03:02:31 – 03:32:31), lưu file log thô `evidence/G2.7_soak_20261102.txt`.
> - **0 lần reset** (`len(boots) == 0`).
> - **1.466 gói tin LoRa** phát thành công liên tục, 0 lỗi (`tx: 225 → 1691`, `tx_fail = 0`).
> - **FPGA → MCU:** 272 mẫu `[RING]`, truyền 76.750 byte (14.972 → 91.722 B), `pend=0, drop=0, oe=0, fe=0, isr == byt` tuyệt đối.
> - **Chu kỳ M3:** trung bình **1.007,6 ms**; **94,8 %** khoảng đúng 1.000 ms, 5,2 % dài hơn (tối đa 1.302 ms). `ovr = 0`, `late_max = 0`.
>   ⚠️ **Con số này KHÔNG kiểm được định thời thật.** Nó đo bằng `kvc_millis()` — chính đồng hồ đang bị lỗi (F-06). Theo wall-clock, chu kỳ thật là **1,220 s trung bình** (1,479 s đầu phiên → 1,166 s cuối). Dùng nó làm bằng chứng "1 Hz đúng" là lập luận vòng tròn.
> - **Kết luận: `G2.7 = PASS (2/3 mục đo được)`.** Mục 2.7.2 nhiệt độ **chưa đo** — không đóng tuyệt đối.
>
> ⚠️ **Bốn số trong bản ghi trước đã sửa:** (a) "1.800 s" → **1.788,4 s** (phủ bởi
> mẫu đầu–cuối); (b) "99,3 % đúng nhịp 1 Hz" → **94,8 %**; (c) nhiệt độ **không đo
> bằng dụng cụ** nên không được PASS; (d) **"định thời 1 Hz" KHÔNG đạt** — wall-clock
> cho thấy 0,82 Hz (xem F-06).
>
> **Phát hiện phụ khi đọc log:**
> - `BB n1` xuất hiện **13/1.456** dòng `[M3]` — chưa rõ lúc soak có mục tiêu trước
>   ống kính hay là false positive. Nếu là false positive thì 0,9 % là đáng kể.
> - `[M3] t` trôi **0,751 → 0,817** so với wall-clock (MCU chậm 18–25 %). Không
>   kết luận được là clock MCU hay jitter USB cho tới khi so với `frame_timestamp`
>   của FPGA. Xem **F-06** trong `evidence/KVC-FPGA-BLOB-20261102-001.md`.
> - `USND ... fe=` **không phải** framing error: mọi dòng đều `fe == byt == isr`.
>   Đừng đọc trường này như `fe` của `[RING]`.


---

## G6 — Camera và siêu âm

### G6.1 Camera

| # | Việc | Ngưỡng đạt | Kết quả |
| ---: | :--- | :--- | :--- |
| 6.1.1 | Cắm camera theo bảng đấu dây 18-pin tại `IF_CAMERA_FPGA.md` (15 dây tới FPGA gồm XCLK pin 18 + 2 nối tắt RESET→3V3, PWDN→GND) | Đúng theo **tên tín hiệu**, không theo số chân; pin 18 = XCLK (module MINI-200W không có oscillator onboard, bắt buộc nối J1-12 B13 + GND) | **PASS** (đã đấu nối) |
| 6.1.2 | Kiểm VOM trước khi cấp nguồn: module pin 1 (GND) ↔ mass | Bíp, < 1 Ω | **PASS** (thông mạch mass) |
| 6.1.3 | Cấp nguồn, đo DC module pin 2 | 3,3 V ± 0,1 | **PASS** (3,3 V DC) |
| 6.1.4 | Đo DC module pin 8 (RESET) | ≈ 3,3 V | **PASS** (3,3 V DC) |
| 6.1.5 | Đo DC module pin 17 (PWDN) | ≈ 0 V | **PASS** (0,0 V DC) |
| 6.1.5a | Đo module pin 18 (XCLK) | **có xung 24 MHz** (hoặc DC trung bình ~1,65 V khi đo VOM, ~3,3 V p-p) từ J1-12 | **PASS** (đo thực tế 1,65 V DC) |
| 6.1.5b | Đo DC module pin 3 (SCL) | **3,3 V DC** (FPGA Master Push-Pull, 100 kHz, FSM chốt `cfg_attempted` dừng ở S_DONE) | **PASS** (đo thực tế 3,3 V DC) |
| 6.1.6 | Đo module pin 15 (DCLK/PCLK) bằng scope/LA hoặc VOM AC | **có xung 12–24 MHz** (áp AC > 1,2 V khi có XCLK) | ⚪ **SUPERSEDED** — bằng chứng mạnh hơn ở 6.1.10 |
| 6.1.7 | Đo module pin 4 (VSYNC) bằng scope/LA | **có xung ~30 Hz** | ⚪ **SUPERSEDED** — bằng chứng mạnh hơn ở 6.1.10 |
| 6.1.8 | Chạy `fpga_uart_capture.py --seconds 15` | **FPS > 105** (không phải 100,0) | **PASS 01/11/2026** — nhưng khác cách hiểu, xem dưới |
| 6.1.9 | Chụp vật đỏ/cam trước ống kính | Đỏ thuần: R > 240/255, G/B < 32/255. Cam: `cnt_match` cao | ⬜ **NOT RUN — rev 3 đã build, chưa nạp bo** |

> **6.1.9 — rev 4 đã build, chưa đo.** Đường release không mang giá trị pixel ra
> ngoài, nên phải dùng bitstream chẩn đoán riêng:
>
> | Thành phần | Chi tiết |
> | :--- | :--- |
> | RTL | `KVC_PR/src/processing/pixel_stats.v` **rev 4** — thống kê tổng R/G/B trên **toàn frame** + 4 bộ đếm chẩn đoán theo bộ lọc tỷ lệ + `max_px`/`max_py` + slot 10 = `PIXSTAT_REV` |
> | Wrapper | `KVC_PR/src/kvc_top_diag_pixel.v` (`DIAG_MODE = 3`) |
> | Build | `KVC_PR/tools/build_kvc_diag_pixel.tcl` |
> | **Bitstream rev 4** | **`review/artifacts/KVC_FPGA_diag_pixel_EC4BC008.fs`** (SHA-256 `EC4BC0081339729AD8CAFA4551A3076908E0FCC04CF4A8827A61B9CF153971A4`, Fmax `clk_100m` **119,792 MHz**, TNS 0) |
> | Bitstream cũ | rev 3 `05288FA6` (**lỗi tràn 8 bit** ở slot 7/9 + `center_pixel` stale), rev 2 `0B125CDC` (ngưỡng blob **cũ**), rev 1 `A92E18B9` (chặt hơn blob cũ) — **KHÔNG dùng để hiệu chuẩn** |
> | Testbench | `tb_pixel_stats` — **34/34 PASS** (có test [5] hồi quy tràn 8 bit); suite giữ **PASS** |
> | Giải mã | `scripts/manual/decode_pixel_diag.py` (nhận diện rev 1/2/3/4; test **28/28 PASS**) |
> | Hướng dẫn | **`docs/verification/G6.1.9_PIXEL_COLOR_PROCEDURE.md`** |
>
> **Vì sao cần đường riêng:** 6.1.10 chỉ trả lời *"có pixel khớp ngưỡng không"*;
> 6.1.9 hỏi *"màu thật là gì"*. Blob trả lời câu đầu, không trả lời câu sau.
>
> **Rev 4 dùng ĐÚNG bộ lọc blob rev 2** (thứ tự `R>G>B`, hue 10–40°, `S ≥ 0,80`,
> sàn sáng/chroma) **+ run-length ≥ 3**, nên `cnt_match` so sánh trực tiếp được
> với `cnt` của `kvc_blob_detect`. Slot 6..9 tách riêng từng điều kiện để biết
> **điều kiện nào loại nhiều pixel nhất** — dữ liệu cho F-02.
>
> **Rev 3 có hai lỗi, đừng dùng số của nó:** (1) `d`/`n` khai báo 8 bit nên
> **tràn** khi `R8 < B8` / `G8 < B8`; `cnt_hue_ok` dư **10.581/16.192** mã và
> `cnt_tone_ok` dư **24.192/51.968** mã (quét đủ 65.536 mã RGB565). `cnt_match`,
> `cnt_ord_ok`, `cnt_sat_ok` vẫn đúng. (2) `center_pixel` stale. Chi tiết:
> `evidence/KVC-G6.1-20261104-001.md`.
>
> **Đính chính quan trọng về chiều cao frame:** `center_pixel` khác 0 ở **42/42**
> khung rev 3 và **43/43** khung rev 1 ⇒ `py` **đã** tới 240. Vì `pix_count` tối
> đa chỉ 119.838, nếu là VGA thì 241 dòng đã cần 154.240 pixel — **mâu thuẫn**.
> Vậy **không** được kết luận "frame bị cắt còn 46–187 dòng" chỉ từ `pix_count`.
> Rev 4 thêm `max_px`/`max_py` để trả lời dứt điểm; tool FAIL nếu `max_py < 479`.
>
> **Điểm phải biết trước khi đo — bộ lọc đã đổi:** rev 2 của blob bỏ hoàn toàn
> `R_MIN/G_MIN/G_MAX/B_MAX`. Vật **đỏ thuần `#FF0000`** giờ bị loại vì
> `G8 > B8` sai (`0 > 0`), **không phải** vì `G_MIN = 10` như trước. Vì vậy
> `cnt_ord_ok = 0` trên đỏ thuần là **kết quả đúng**, không phải lỗi. Vật cam
> thật (`#FF8800`) phải cho `cnt_match ≈ 100 %` khi phủ kín khung.
>
> **Tiêu chí G < 32/255 chỉ áp cho đỏ thuần.** Màu cam cứu hộ thật có `G8 ≈ 130–150`
> nên luôn FAIL tiêu chí đó — đây là mâu thuẫn định nghĩa giữa checklist và bộ
> lọc, không phải lỗi RTL.
>
> **Không dùng màn hình điện thoại** làm vật thử — đã sai một lần ở F-02 (viền
> đen + AWB + phản xạ làm lấp đầy chỉ 1 %). Dùng vật đỏ/cam **đặc**, phủ kín ≥ 80 %
> khung.
>
> **Không hạ `MIN_PIXELS` từ 120 xuống 64 trên cơ sở capture rev 3.** Trên
> `px.bin`, `cnt_match/cnt_ord_ok` chỉ **0,27–1,76 %** — pixel `ord_ok` **rời rạc**,
> không thành mảng. Tấm cam 240×240 nằm trong dải đo sẽ cho tỉ lệ ≈100 %. Hạ
> ngưỡng lúc này là hiệu chuẩn trên nhiễu. Hồi quy 42 khung còn cho
> `corr(meanR, meanB) = +0,585`, `dB/dR = +0,253` — phần "đỏ" tăng lên là ánh sáng
> trắng ấm, không phải mảng cam.
>
> **Sau khi đo phải nạp lại bitstream release mới nhất** (`9E62B590`, xem
> `FPGA_BUILD_RECORD.md §1`). Bitstream SRAM mất khi mất điện, nhưng để nguyên
> bản diag thì phiên sau đọc nhầm số.
| 6.1.10 | Đưa mục tiêu cam vào khung, đọc `x/y/w/h/conf/class` | `N=1`, `class=2` | **PASS 03/11/2026 (HARDWARE-VERIFIED)** — **7/58 dòng (12,1 %)** `N=1`, `class=2`, `crc=0`. Xem `evidence/KVC-G6.1-20261103-001.md`. **Số này là của bộ lọc CŨ (bitstream `86CCF5DD`); bitstream rev 2 `9E62B590` CHƯA đo** |

> **6.1.6 / 6.1.7 — SUPERSEDED, không phải NOT RUN.** Mục đích của chúng là chứng
> minh camera phát PCLK/VSYNC thật. Blob sinh bbox **từ pixel thật** là bằng chứng
> **mạnh hơn**: thiếu PCLK/VSYNC thì `kvc_blob_detect` không thể đếm pixel và
> không thể ra `N=1`. Không cần đo scope nữa — không thêm thông tin.
>
> **6.1.9 — KHÔNG thể thay thế, vẫn NOT RUN.** Đây là phép đo **giá trị RGB565**,
> trả lời câu hỏi khác hẳn: *ngưỡng màu có đúng không*. 6.1.10 chỉ chứng minh
> "có pixel khớp ngưỡng". Đây chính là dữ liệu cần cho **F-02** (ngưỡng quá hẹp,
> lấp đầy ~1 %).
>
> **Kết luận G6.1: `PASS 8/10`** — 6.1.6/6.1.7 superseded, **6.1.9 NOT RUN**.
> Không ghi `CLOSED`.


> **6.1.8 — cách đọc khác với bản trước.** Ngưỡng "FPS > 105" được viết cho
> **bitstream mock** (`BBOX_SOURCE=0`), nơi khung do bộ đếm nội bộ sinh ra ở
> 100 Hz và VSYNC thật chỉ *rút ngắn* chu kỳ. Với **bitstream release**
> (`BBOX_SOURCE=1`), nhịp khung do **camera thật** quyết định — đo được
> **5,08 frame/s** (01/11) và **7,48 frame/s** (02/11), không phải 100 Hz.
>
> Vì vậy **không so 5 hay 7,5 với 105**. Câu hỏi đúng là *"camera có phát khung
> không"*, và câu trả lời là **CÓ**: **545 khung** IF-01 hợp lệ tích luỹ
> (136 + 409), 0 byte rác, 0 CRC.
>
> **Nhịp 5–7,5 frame/s là finding mở (F-01)**, không phải PASS ngầm. Plan A8 kỳ
> vọng 25–32 frame/s. Hai lần đo khác nhau **theo ánh sáng** — củng cố giả thuyết
> AEC, nhưng khoảng cách tới ngưỡng còn quá lớn nên phải kiểm thêm chia tần PCLK.
> Chi tiết: `evidence/KVC-FPGA-G0G6-20261101-001.md` §5 F-01.
>
> **Cập nhật 02/11/2026 — F-01 đo lại, nhịp THAY ĐỔI theo ánh sáng.** Capture
> nền 409 khung (`evidence/G6.1_blob_baseline_neg_20261102-0142.txt`) cho
> **133,7 ms/khung = 7,48 frame/s**, so với 197 ms/khung = 5,08 frame/s lần
> trước. Cùng bitstream `86CCF5DD`, cùng script, khác điều kiện chiếu sáng.
> Đây là bằng chứng **gián tiếp** cho giả thuyết AEC (phơi sáng dài → giảm
> frame rate), **chưa** phải phép đo exposure. Trạng thái Gate: **G0 = camera
> sống / F-01 MỞ (7,5 Hz)**, A8 vẫn KHÔNG ĐẠT.
>
> **Công cụ đo đã sửa cùng ngày:** bản cũ dùng `ser.read(4096)` — lệnh này
> block cho tới khi đủ 4096 byte, nên `--seconds 15` bị vô hiệu (thực tế đọc
> 54,6 s) và FPS in ra không đối chiếu được. Bản mới đọc theo `ser.in_waiting`
> (`timeout=0.05`) và in thêm **"Thoi gian doc thuc"** + **"FPS theo wall-clock"**
> cạnh FPS theo timestamp; lệch quá 2 chu kỳ khung → cảnh báo. Khi đọc lại các
> file log cũ, nhớ chúng được sinh bởi bản **trước** khi sửa.

**Vì sao phải đo XCLK, DCLK và VSYNC bằng scope, không dùng LED.**

`led_camera_ok = cfg_done & ~cfg_error & cap_frame_valid`. Nhưng `cap_frame_valid`
chỉ cao trong lúc VSYNC đang cao — vài dòng trên tổng 480 dòng, duty < 2 % ở 30 Hz
(tức ~0,6 ms sáng mỗi 33 ms). **Mắt người thấy LED gần như tắt kể cả khi camera
chạy hoàn hảo.** Không kết luận gì từ LED.

**Phân biệt XCLK, DCLK và VSYNC** — ba phép đo trả lời ba câu hỏi logic:

| XCLK (pin 18) | DCLK (pin 15) | VSYNC (pin 4) | Kết luận |
| :---: | :---: | :---: | :--- |
| không xung | không xung | 0 V | FPGA chưa cấp 24 MHz qua J1-12 (B13) hoặc đứt dây pin 18 |
| 24 MHz | không xung | 0 V | Sensor có clock nhưng chưa chạy: kiểm tra RESET=3,3 V, PWDN=0 V, nguồn 2,8 V / 1,2 V |
| 24 MHz | có xung | 0 V | Có clock, **SCCB chưa cấu hình được** sensor (kiểm tra SCL/SDA, cfg_error) |
| 24 MHz | có xung | có xung | Camera chạy hoàn chỉnh |
| có xung | có xung | Camera chạy |
| không xung | 3,3 V | Sensor trong reset/power-down, hoặc VSYNC nối nhầm |

**6.1.8 là phép đo định lượng rẻ nhất.** Trong `kvc_top_demo.v:306`, VSYNC được
cộng vào trigger mock. Nếu camera thật sự stream, mỗi VSYNC rút ngắn một chu kỳ
khung và FPS trung bình nhảy từ 100,0 lên **105–130**. Nếu vẫn đúng 100,0 thì
VSYNC chưa từng tới FPGA — đây chính là cách phát hiện lỗi ngày 31/10/2026.

### 6.1.8b Chẩn đoán trực tiếp: đọc bộ đếm VSYNC qua trường X

Từ bitstream **`948D697E...`** (01/11/2026), `kvc_top_demo.v` có khối
`DIAG_MODE` (trước đây tên là `DIAG_VSYNC_IN_X`): đếm số xung `cam_vsync_pulse`
thật rồi **ghi đè vào trường `x` của bbox ĐẦU TIÊN** trong mỗi frame, đồng thời
**ghi đè trường `y`** bằng trạng thái SCCB.

**Không cần scope. Không đổi ABI** (layout 26 byte, CRC giữ nguyên).

> **Lưu ý 01/11/2026:** G0.3/G0.4 đã đạt **gián tiếp và mạnh hơn** bằng bitstream
> release `86CCF5DD` (136 khung IF-01 thật, 0 lỗi CRC). Mục 6.1.8b dưới đây vẫn
> là **thủ tục chính thức** nếu cần bản ghi đúng chuẩn hồ sơ; chi phí nạp lại
> `3620B802` là thấp. Xem `evidence/KVC-FPGA-G0G6-20261101-001.md` §4.1.

Chạy capture rồi đọc cột `x=`/`y=` của box đầu tiên:

```powershell
python scripts/manual/fpga_uart_capture.py --port COM<n> --baud 38400 --seconds 20
```

```text
# 1 ... (x=0, y=1, w=50, h=100, c=1, p=90), (x=100, ...)   <- cột x/y của box 1
# 2 ... (x=0, y=1, ...)
```

| `x` của box 1 | Kết luận |
| :--- | :--- |
| **= 0 không đổi** qua mọi frame | Camera **KHÔNG** phát VSYNC |
| **tăng đều** | Camera **CÓ** phát VSYNC — đếm được tần số |
| Tăng rồi đứng | VSYNC chập chờn (dây lỏng, nguồn yếu) |

| `y` của box 1 | Nghĩa |
| :---: | :--- |
| 0 | SCCB chưa xong |
| 1 | Xong, không lỗi ACK |
| 3 | Xong nhưng có ACK error → sensor chạy cấu hình mặc định |

**Cách tính tần số:** lấy hai frame cách nhau khoảng `T` giây:

```text
f_vsync = (x_sau − x_trước) / T
```

Ví dụ `x`: 12 → 42 trong 1,0 s → **30 Hz** → camera chạy đúng, kỳ vọng VGA.

Bộ đếm 16-bit quay vòng sau 65.536 xung (~36 phút @ 30 Hz), đủ dài cho mọi lần đo.

Để tắt chẩn đoán: đặt `DIAG_MODE = 0` (đây là **giá trị mặc định từ
01/11/2026**), rebuild. Khi đó `x`/`y` trở về giá trị nguồn.

> **Lưu ý:** `DIAG_MODE` chỉ có tác dụng khi `BBOX_SOURCE = 0` (đường mock).
> Ở chế độ release `BBOX_SOURCE = 1` (blob thật), `mock_first_bbox` luôn = 0
> nên chẩn đoán không bao giờ ghi đè — đúng như mong muốn. Muốn dùng chẩn đoán
> thì build riêng với `BBOX_SOURCE = 0, DIAG_MODE = 1` (Gate G0).

> **Chi phí:** bật chẩn đoán làm Fmax giảm 124,934 → 107,447 MHz (vẫn đạt
> > 100 MHz, TNS = 0) và tăng 148 LUT / 209 FF. Xem `FPGA_BUILD_RECORD.md` §2.1.

**Nếu 6.1.2–6.1.7 PASS mà 6.1.8 vẫn 100,0:** kiểm lại dây A15 (module pin 4),
hoặc `cfg_error` đang = 1 (SCCB NACK) — khi đó sensor chưa được cấu hình.

**Nếu ảnh sai màu:** `ov2640_config` đặt RGB565 (`IMAGE_MODE = 0x08`) là lượt ghi
gần cuối. Nếu vẫn sai, kiểm thứ tự ghép byte trong `camera_rx.v` (first byte =
high byte, dòng 112: `pixel_data <= {high_byte, data_in}`).

### G6.2 Siêu âm — **UNBLOCKED 01/11/2026**, phép đo chưa chạy

> **Đã gỡ chặn phần cứng.** HUMAN xác nhận 01/11/2026: đầu dò AJ-SR04M đã được
> thay và **hoạt động ổn định**, sẵn sàng cung cấp `alt_dist_cm` thật cho georef.
>
> **Trạng thái các mục đo dưới đây vẫn là `NOT RUN`.** "Đầu dò chạy" chưa phải
> bằng chứng cho các ngưỡng `frame_ok` ở từng khoảng cách — phải đo mới đóng được
> G6.2. Không đánh PASS dựa trên xác nhận miệng.
>
> **Không đổi kết luận H4.** Có `alt_dist_cm` thật vẫn không có Yaw khi hộp đứng
> yên (vận tốc GNSS = 0 → `kvc_gnss_neo_m10.c` từ chối Yaw), nên `kvc_georef.c`
> vẫn trả `KVC_GEO_POS_NONE` và UI vẫn hiện `N/A`. Đó là hành vi đúng.

| # | Việc | Ngưỡng đạt | Kết quả |
| ---: | :--- | :--- | :--- |
| 6.2.0 | Thay đầu dò AJ-SR04M | Có đầu dò mới | ✅ **XONG** (HUMAN, 01/11/2026) |
| 6.2.1 | Đặt board trên cột, cách mặt nước tĩnh **2,0 m**, đo 50 mẫu | `frame_ok` ≥ 98 % | ⬜ |
| 6.2.2 | Lặp ở **3,0 m** | `frame_ok` ≥ 98 % | ⬜ |
| 6.2.3 | Lặp ở **4,0 m** | `frame_ok` ≥ 95 % | ⬜ |
| 6.2.4 | Lặp ở **5,0 m** | `frame_ok` ≥ 90 % | ⬜ |
| 6.2.5 | Đo sai số khoảng cách so với thước | < 2 cm trong 0,5–5,0 m | ⬜ |
| 6.2.6 | Đo trên mặt nước gợn nhẹ ở 3,0 m | `frame_ok` ≥ 80 % | ⬜ |
| 6.2.7 | Ghi bảng kết quả vào `docs/verification/USOUND_CALIBRATION_5M.md` | Có bảng đầy đủ | ⬜ |

> **Số đo thật đầu tiên 01/11/2026:** `[M3] ... US=68cm ok` và `US=70cm ok`, ổn
> định qua nhiều dòng. Đây là **một khoảng cách ~0,7 m trong không khí tĩnh**,
> chứng minh đầu dò hoạt động và driver đọc đúng — nhưng **chưa đóng G6.2**, vì
> các ngưỡng `frame_ok` ở 2–5 m và trên mặt nước chưa đo.

**Nếu 6.2.x fail ở mọi khoảng cách:** kiểm `KVC_USOUND_MAX_FRAME_MM` = 8000, `TIMEOUT_MS` = 350, đã nạp firmware mới.

### G6.3 Hiệu chuẩn `fx_px`

| # | Việc | Ngưỡng đạt | Kết quả |
| ---: | :--- | :--- | :--- |
| 6.3.1 | In bàn cờ 9×6 ô, mỗi ô 25 mm, dán phẳng | — | ⬜ |
| 6.3.2 | Chụp 15–20 ảnh bằng chính OV2640 ở nhiều góc | File ảnh lưu được | ⬜ |
| 6.3.3 | Chạy `cv2.calibrateCamera` | Reproj error < 0,5 px | ⬜ |
| 6.3.4 | Ghi `fx_px`, `cx_px`, `cy_px` thật | Sai khác so với 346/200/150 được ghi rõ | ⬜ |
| 6.3.5 | Cập nhật `firmware/mcu_payload/inc/kvc_georef.h:80-82` | — | ⬜ |
| 6.3.6 | Nạp lại firmware MCU, đo lại georef tĩnh | Sai số < 0,5 m @ 3 m | ⬜ |

> **CẬP NHẬT 04/11/2026 — hệ quy chiếu đã sửa, nhưng 6.3.4–6.3.6 vẫn `NOT RUN`.**
>
> Trước hôm nay `kvc_georef.c` dùng `554/320/240`, tức **giả định ảnh 640×480**.
> Đo trên bo (`px_rev4.bin`) cho thấy OV2640 trong cấu hình hiện tại xuất
> **400×300** (`max_px = 399`, `max_py` tới 299). Với hệ cũ, một mục tiêu ở
> **chính giữa khung** vẫn bị báo lệch **−10,8 m / +8,1 m ở độ cao 50 m**.
> Đã đổi thành `346/200/150` và thêm `TEST 15` khoá hành vi này.
>
> **`346` KHÔNG phải giá trị hiệu chuẩn** — nó chỉ giữ nguyên giả định HFOV 60°
> khi bề rộng 640 → 400. Bước 6.3.3–6.3.6 vẫn phải làm. Cự ly ngang tỉ lệ thuận
> với `fx`, nên `fx` lệch 10 % thì ở 50 m sai 5 m.
>
> Chi tiết: `evidence/KVC-G6.1-20261104-002.md`.

---

## Bảng ghi kết quả

Sao chép và điền khi chạy:

```text
Ngày giờ: ______________
Kit: OneKiwi Primer 20K V1.1, serial ______________
Git HEAD: ______________
Bitstream: KVC_FPGA.fs, sha256 ______________  (đối chiếu FPGA_BUILD_RECORD.md)
Tool: Gowin V1.9.11.03 Education x64
Firmware MCU: ______________

G2.1 Nạp bitstream     : PASS / FAIL   ghi chú: ______________
G2.2 UART (USB)        : PASS / FAIL   frame/s = ____  (kỳ vọng ~100 cho MOCK;
                                        với RELEASE xem ghi chú dưới)
G2.3 Timestamp ms      : PASS / FAIL   dt tb = ____ ms (kỳ vọng ~10 cho MOCK)
G2.4 MCU nhận          : PASS / FAIL   fe = ____ crc = ____
G2.7 Soak 30 min       : PASS 2/3     reset = 0, drop = 0, fe = 0 (G2.7_soak_20261102.txt) · nhiệt NOT MEASURED
G6.1 Camera            : PASS / FAIL   frame_ok = ____ %
G6.1 blob thật         : PASS 7/58    N=1 = 12,1 %  class = 2  crc_err = 0  (03/11/2026)
G6.1 muc 9 (mau RGB)   : NOT RUN      ← mục duy nhất còn thiếu
G6.2 Siêu âm 3 m       : PASS / FAIL   frame_ok = ____ %
G6.3 fx_px             : PASS / FAIL   đo được = ____
GW   Gateway thu sóng  : PASS / FAIL   NOT RUN (chờ bo từ Thịnh — 01/11/2026)
F-08 ovr/late_max      : CLOSED       ovr=0, late_max=0 trên 58 chu kỳ sau reset (03/11/2026)
```

> **Ghi chú 01/11/2026:** với bitstream **release** (`BBOX_SOURCE=1`), nhịp khung
> do camera quyết định (**7,5 frame/s** — đo lại 02/11/2026; lần đầu 5,1), **không**
> phải ~100 Hz của đường mock. Đừng dùng dòng "G2.2 kỳ vọng ~100" để đánh giá
> đường blob.

---

## Điều không được làm

| Việc | Lý do |
| :--- | :--- |
| Cắm FPGA trước khi đo nguồn (0.1, 0.2) | Ripple lớn gây reset ngẫu nhiên, mọi kết quả sau đó không tái lập |
| Dùng USB-UART loại 5 V | Đẩy 5 V vào chân FPGA 3,3 V → hỏng IO |
| Nối MCU trước khi kiểm UART bằng USB-UART | Không phân biệt được lỗi FPGA hay lỗi MCU |
| Đánh dấu PASS khi chưa có log | Vi phạm `AGENTS.md` |
| Dùng `fx_px = 554` mà không đo | Sai toạ độ hệ thống 6–7 % |
| Bật `BBOX_SOURCE = 2` khi chưa viết lại `kvc_yolo_top` | Build fail `EX3937` |
| Bật `BBOX_SOURCE = 1` cùng `DIAG_MODE = 1` rồi kết luận chẩn đoán chạy | Ở chế độ blob, `mock_first_bbox` = 0 nên chẩn đoán **không bao giờ** ghi đè; kết quả sẽ luôn là dữ liệu blob thật |
| Dùng LED làm thước đo FPS | UART bận 68 % thời gian, mắt không phân biệt 100 Hz |
| Hạ baud xuống 19.200 để "cho chắc" | IF-01 đã khóa 38.400 bởi HUMAN; đổi cần approval mới |

---

## Sau khi hoàn thành

| Gate | Bằng chứng cần lưu | Cập nhật tài liệu |
| :--- | :--- | :--- |
| **G2** | `capture_01.hex` + log `[RING] FPGA` + ảnh LED | `IF_FPGA_MCU_UART.md` → `HARDWARE-VERIFIED` |
| **G6** | Bảng đo siêu âm + ảnh capture + tham số camera | `IF_MCU_SENSORS.md`, `IF_CAMERA_FPGA.md` → `HARDWARE-VERIFIED` |

Chỉ sau khi cả hai gate PASS mới được tuyên bố hệ thống hoạt động trên phần cứng thật.
