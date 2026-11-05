# KVC — G6.1.9 rev 3: phản biện báo cáo hiệu chỉnh, hai lỗi chẩn đoán, và rev 4

- **Mã:** `KVC-G6.1-20261104-001`
- **Loại:** phản biện + sửa RTL + build (owner: Kilo)
- **Ngày:** 04/11/2026
- **Căn cứ:** `G6.1.9_pixel_rev3_20261104-1143.bin` (capture 10 s, 4.452 B,
  42 khung, 0 lỗi CRC, SHA-256
  `1F4BC2228D19A9F30A6F9F4EF3D6814B6654043F617508571DA397FB67EE168F` — bản
  `G6.1.9_pixel_rev3_20261104-1143.bin` (bản sao của `px.bin` ở gốc repo), `docs/verification/evidence/G6.1.9_pixel_test.bin`
  (43 khung, rev 1), `KVC_PR/src/processing/pixel_stats.v`,
  `KVC_PR/src/processing/kvc_blob_detect.v`,
  `scripts/manual/decode_pixel_diag.py`
- **Mức bằng chứng:** `HARDWARE-VERIFIED` cho các số đọc trực tiếp từ `.bin`;
  `SOURCE-VERIFIED` cho suy luận RTL; `BUILT` + `SIMULATED` cho bitstream rev 4

---

## 0. Kết luận ngắn

Báo cáo kỹ thuật đề nghị đổi `sat_ok` thành `4*B8 <= R8` và hạ `MIN_PIXELS`
120 → 64 **không được xác nhận**. Cả hai suy ra từ số liệu **không đáng tin**:

1. `cnt_sat_ok` **luôn lớn hơn** `cnt_ord_ok` ở **42/42 khung** ⇒ bão hoà
   **không phải** nút thắt. Nới `sat_ok` không thể vượt trần `cnt_ord_ok`.
2. `cnt_hue_ok` và `cnt_tone_ok` (dùng để xếp hạng điều kiện lọc) bị **tràn
   8 bit** trong RTL ⇒ hai số đó vô nghĩa.
3. `cnt_match` đo trên khung **chưa xác định được chiều cao thật**, nên không
   dùng để hiệu chuẩn `MIN_PIXELS`.

Đã sửa RTL (rev 4) và build bitstream mới. **Chưa nạp bo.**

---

## 1. Bốn con số trong báo cáo không khớp file gốc

Đọc lại chính `G6.1.9_pixel_rev3_20261104-1143.bin` bằng `decode_pixel_diag.py`:

| Đại lượng | Báo cáo | Đo lại từ `G6.1.9_pixel_rev3_20261104-1143.bin` |
| :--- | :--- | :--- |
| `mean_r8` | 60 .. 94 | **45 .. 101** |
| `mean_g8` | 123 .. 136 | **116 .. 139** |
| `mean_b8` | 125 .. 138 | **119 .. 142** |
| `cnt_match` | 15 .. 71 | **3 .. 71** (khung 19 = 3) |
| `max_r5` | 31/31 | **30 .. 31** (khung 31 = 30) |
| `ord_ok_pct` | 3,4 .. 5,4 % | **2,03 .. 5,35 %** |
| `tone_ok_pct` | 50,5 .. 66,5 % | **38,93 .. 67,54 %** |

Các dải đều **hẹp hơn** dải thật ⇒ báo cáo tổng hợp một tập con, không phải
42 khung. Ngoài ra `max_r5 = 31` ⇒ `R8 = 248/255 = 97,3 %`, **không** phải
"kịch trần 100 %".

---

## 2. `sat_ok` KHÔNG phải nút thắt — bằng chứng trực tiếp

`kvc_blob_detect.v:141` (rev 2): `match = ord_ok && hue_ok && sat_ok && tone_ok`.
`cnt_match` không thể vượt `cnt_ord_ok`. Đo trên `G6.1.9_pixel_rev3_20261104-1143.bin`:

| Khung | `cnt_ord_ok` | `cnt_sat_ok` | `cnt_match` |
| ---: | ---: | ---: | ---: |
| 9 | 4.041 | 5.102 | 71 |
| 20 | 4.211 | 5.287 | 49 |
| 42 | 4.274 | 4.837 | 65 |

`cnt_sat_ok > cnt_ord_ok` ở **42/42 khung**. Tỉ lệ `sat_ok_pct` trong chính báo
cáo (3,6–6,4 %) cũng **lớn hơn** `ord_ok_pct` (3,4–5,4 %) ở mọi khung — tự nó
đã chứng minh bão hoà đang không loại gì đáng kể.

Quét đủ 65.536 mã RGB565: đổi `5*B8 <= R8` → `4*B8 <= R8` chỉ mở thêm **409 mã**
(3,36 % → 3,98 %) và **không thêm một pixel `ord_ok` nào**. Vì `ord_ok` đứng
trước, đổi `sat_ok` **không làm `cnt_match` tăng**.

---

## 3. F-07 (P2) — tràn 8 bit làm `cnt_hue_ok` / `cnt_tone_ok` vô nghĩa

**Vị trí:** `pixel_stats.v:154-155` (rev 3).

```verilog
wire [7:0]  d = R8 - B8;   // TRAN khi R8 < B8
wire [7:0]  n = G8 - B8;   // TRAN khi G8 < B8
```

`hue_ok` (`:170`) và `tone_ok` (`:172`) dùng `d11`/`n11` dựng từ hai dây này mà
**không** có `ord_ok` chặn trước. Khi `R8 < B8`, phép trừ 8 bit quay vòng thành
số dương lớn:

| Mã RGB565 | R8/G8/B8 | `d` (wrap) | Rev 3 | Rev 4 |
| :--- | :--- | ---: | :--- | :--- |
| `(1,23,7)` | 8 / 92 / 56 | **208** | `hue_ok = 1` | `hue_ok = 0` |
| `(4,25,30)` | 32 / 100 / 240 | **48** | `tone_ok = 1` | `tone_ok = 0` |

Quét toàn bộ 65.536 mã:

| Bộ đếm | Rev 3 (có lỗi) | Rev 4 (đã sửa) | Artifact |
| :--- | ---: | ---: | ---: |
| `cnt_hue_ok` | 16.192 | 5.611 | **10.581** (65,3 %) |
| `cnt_tone_ok` | 51.968 | 27.776 | **24.192** (46,6 %) |
| `cnt_match` | 2.202 | **2.202** | **0** |

`cnt_match` **không đổi** vì `ord_ok` đã bảo đảm `R > G > B` ⇒ `d`, `n` dương.
Nên bộ lọc blob vẫn được đo đúng từng bit ở rev 3; chỉ hai bộ đếm chẩn đoán sai.

**Hệ quả:** mọi xếp hạng "điều kiện nào loại nhiều pixel nhất" dựa trên
`cnt_hue_ok` / `cnt_tone_ok` của rev 3 đều không dùng được. `cnt_ord_ok`,
`cnt_sat_ok`, `cnt_match` thì vẫn đúng.

---

## 4. F-08 (P3) — `center_pixel` là giá trị cũ, và nó **bác bỏ** giả thuyết frame bị cắt

**Vị trí:** `pixel_stats.v:213` (rev 3): `at_center = acc_en && (px == 320) && (py == 240)`.

Giá trị chỉ được ghi khi `py` tới **240**. Nếu frame không tới dòng đó, slot 5 in
lại giá trị frame trước ⇒ stale.

### 4.1 Điều bất ngờ: `center_pixel` khác 0 ở 42/42 khung

| File | `center_pixel` khác 0 | đổi giữa 2 report liền kề |
| :--- | :--- | :--- |
| `G6.1.9_pixel_test.bin` (rev 1) | **43/43** | 22/42 lần |
| `G6.1.9_pixel_rev3_20261104-1143.bin` (rev 3) | **42/42** | 16/41 lần |

Giá trị **thay đổi liên tục** ⇒ không phải giá trị chết. Nghĩa là `py` **đã tới
240** trong phần lớn frame ⇒ frame **không** bị cắt ở dòng 46–187.

### 4.2 Ràng buộc hình học mâu thuẫn với cả VGA và SVGA

Từ `center_pixel` cập nhật được, suy ra:

```text
width  >= 321   (vì px == 320 đã đạt)
height >= 241   (vì py == 240 đã đạt)
```

Nhưng `pix_count` lớn nhất đo được là **119.838**. Suy ra:

```text
width <= 119838 / 241 = 497 px
```

| Độ phân giải | Tổng pixel | 241 dòng đầu | Kết luận |
| :--- | ---: | ---: | :--- |
| QVGA 320×240 | 76.800 | — | không thể (height < 241) |
| VGA 640×480 | 307.200 | **154.240** > 119.838 | **mâu thuẫn** |
| SVGA 800×600 | 480.000 | **192.800** > 119.838 | **mâu thuẫn** |
| CIF 352×288 | 101.376 | 84.832 | khả dĩ |

⇒ **Không được kết luận "frame bị cắt còn 46–187 dòng"** chỉ từ `pix_count`.
Cần `max_px`/`max_py` (rev 4) để biết chắc. Đây là đính chính cho nhận định
tương ứng trong phiên trước.

### 4.3 Mô hình khớp dữ liệu nhất: `pix_count` lượng tử hoá theo bội số

`pix_count` chỉ rơi vào 3 cụm, cả hai file, lệch < 200 pixel:

| Cụm | rev 1 | rev 3 | `pix_count / 39905` |
| :--- | ---: | ---: | ---: |
| 39.905 | 8 khung | 9 khung | 1× |
| 79.810 | 24 khung | 23 khung | 2× |
| 119.737 | 4 khung | 4 khung | 3× |
| khác (bị cắt giữa cụm) | 7 khung | 6 khung | — |

Và **`M <= N` đúng 42/42** (rev 1) và **41/41** (rev 3), với
`N = round(dts / 65,5 ms)` và `M = round(pix_count / 39905)`:

- `N` = số chu kỳ VSYNC trôi qua giữa hai report
- `M` = số "đơn vị 39.905 px" mà accumulator đếm được

`M` **luôn nhỏ hơn hoặc bằng** `N`, không bao giờ vượt. Nếu accumulator cộng dồn
qua nhiều frame thì `M` phải xấp xỉ `N`; nếu VSYNC bị bỏ sót thì `M < N`.
Mẫu `1× : 2× : 3×` xuất hiện đúng theo tỉ lệ `N = 3 : 5 : 6` ⇒ **camera phát
VSYNC đều, nhưng `pixel_valid` chỉ tới trong một phần các frame**.

`39.905 ≈ 400 × 99,76`. Ở `width = 400`, ba cụm là **~100 / ~200 / ~300 dòng** —
đúng dạng "VSYNC tới nhưng chỉ một phần số dòng có pixel". Giả thuyết này khớp
mọi ràng buộc hình học ở §4.2 (400 ≥ 321, 300 ≥ 241) nhưng **chưa được xác
nhận**: chưa đo được độ rộng dòng thật.

**Trạng thái:** `DESIGN` (giả thuyết có định lượng), **không** phải kết luận.
Rev 4 thêm `max_px`/`max_py` để phân biệt dứt điểm.

---

## 5. F-09 (P2, mới) — `MIN_PIXELS` không thể hiệu chuẩn từ dữ liệu này

Báo cáo đề nghị hạ `MIN_PIXELS` 120 → 64 vì `cnt_match` đỉnh = 71.

Vấn đề: `cnt_match` đo trên khung **chưa xác định chiều cao thật**, và
`cnt_match / cnt_ord_ok` chỉ **0,27 % .. 1,76 %** (trung bình **0,94 %**).

Nếu một tấm cam 240×240 nằm trong dải đã phát, pixel `ord_ok` của nó **liền
nhau** thành run 240 ⇒ `cnt_match ≈ cnt_ord_ok` (≈100 %). Tỉ lệ 1 % nghĩa là
pixel `ord_ok` **rời rạc**, không thành mảng.

Kiểm chứng độc lập bằng hồi quy 42 khung:

| Đại lượng | Giá trị | Ý nghĩa |
| :--- | ---: | :--- |
| `corr(meanR, meanB)` | **+0,585** | cùng tăng |
| `dB/dR` | **+0,253** | vật cam bão hoà phải cho `dB/dR` **âm** |
| `corr(meanR, pix_count)` | +0,054 | độ sáng không do vật chiếm khung |

⇒ Phần "đỏ" tăng lên là **ánh sáng trắng ấm**, không phải mảng cam. Không có
mảng cam liền mạch trong phần khung được đo.

**Ba khả năng chưa phân biệt được:** (a) vật nằm ngoài dải đã phát, (b) AWB/AGC
làm mất bão hoà, (c) vật không nằm trong ống kính.

Vì vậy hạ `MIN_PIXELS` lúc này là **hiệu chuẩn trên nhiễu**. Ngoài ra hạ 64 chỉ
giúp **2/42 khung** (71 và 65); mức 80 giúp **0/42**.

---

## 6. Thay đổi rev 4

### 6.1 RTL — `KVC_PR/src/processing/pixel_stats.v`

| Thay đổi | Lý do |
| :--- | :--- |
| `d`/`n` tính 9 bit + `d_neg`/`n_neg`, kẹp 0 khi âm; `hue_ok`/`tone_ok` chặn bằng `~d_neg & ~n_neg` | F-07 |
| Slot 5: `center_pixel` → `max_px` / `max_py` | F-08 |
| Slot 11: `0` → `max_r5` | nhường slot 5; giữ khả năng đọc capture cũ |
| `PIXSTAT_REV` 3 → **4** | phân biệt bằng số |

`cnt_match`, `cnt_ord_ok`, `cnt_sat_ok` **không đổi** — quét 65.536 mã xác nhận
`match` 2202 = 2202.

### 6.2 Tool — `scripts/manual/decode_pixel_diag.py`

- Nhận `rev 4`; đọc slot 5 theo nghĩa `max_px`/`max_py`, slot 11 = `max_r5`.
- `rev 3`: **cảnh báo FAIL** rằng hue/tone không tin được, không in chúng như
  số liệu hợp lệ.
- Thêm kiểm tra `Khung đầy đủ (max_px=639, max_py=479)` — FAIL nếu `max_py < 479`.
- Sửa lệnh nhắc nạp lại: `86CCF5DD` → `9E62B590` (release hiện hành).
- Sửa quy trình: `decode_pixel_diag.py` chỉ có `--file`; capture phải dùng
  `fpga_uart_capture.py --dump`.

### 6.3 Kiểm chứng

| Hạng mục | Lệnh | Kết quả |
| :--- | :--- | :--- |
| `tb_pixel_stats` | `iverilog -g2012 ... && vvp` | **34/34 PASS** (thêm test [5] hồi quy tràn) |
| `test_decode_pixel_diag.py` | `python -m unittest` | **28/28 PASS** |
| `tb_kvc_blob_detect` | cùng | **18/18 PASS** (không hồi quy) |
| `git diff --check` | | exit 0 |
| Build rev 4 | `gw_sh tools/build_kvc_diag_pixel.tcl` | OK, Fmax 119,792 MHz, TNS 0 |

### 6.4 Bitstream rev 4

| Trường | Giá trị |
| :--- | :--- |
| SHA-256 | `EC4BC0081339729AD8CAFA4551A3076908E0FCC04CF4A8827A61B9CF153971A4` |
| Bản sao | `review/artifacts/KVC_FPGA_diag_pixel_EC4BC008.fs` (7.264.154 B) |
| Fmax `clk_100m` | 119,792 MHz (ràng buộc 100) |
| Fmax `cam_pclk` | 70,545 MHz (ràng buộc 24) |
| TNS setup/hold | 0 / 0 |
| Logic / Register | 2.296 (1.958 LUT + 338 ALU) / 1.525 |
| Trạng thái | `BUILT` + `SIMULATED` — **CHƯA NẠP BO** |

---

## 7. Việc cần làm tiếp

| # | Việc | Điều kiện |
| :--- | :--- | :--- |
| 1 | Nạp `EC4BC008`, capture 10 s, đọc `max_px`/`max_py` | xác nhận hay bác bỏ §4.3 |
| 2 | Nếu `max_py < 479`: điều tra `camera_rx` / PCLK (F-04/F-05) | dùng số đo, không suy đoán |
| 3 | Nếu `max_py = 479`: đo lại tỉ lệ 6.1.9 với vật cam phủ khung | khi đó mới bàn `MIN_PIXELS` |
| 4 | Chỉ đổi `sat_ok` → `4*B8` khi `cnt_sat_ok / cnt_ord_ok` thấp trên **vật thật** | hiện chưa có bằng chứng |
| 5 | Nạp lại release `9E62B590` sau khi đo | diag phát `N=12` giả |

**Không làm:** đổi `sat_ok` sang `3*B8 <= R8` (bắt nhầm da `S=0,667` và phù sa
`S=0,706`); hạ `MIN_PIXELS` trước khi biết chiều cao frame; đặt tên "rev 3" cho
một release mới (trùng số với diag màu).
