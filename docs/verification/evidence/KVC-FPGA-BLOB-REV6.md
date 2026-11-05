# KVC-FPGA-BLOB-REV6 — Siết ngưỡng để loại màu da người

- **Task ID:** `KVC-FPGA-BLOB-REV6`
- **Owner:** Kilo (agent có quyền workspace) · **Model:** DeepSeek
- **Ngày:** 04/11/2026
- **Scope (allowed files):**
  - `KVC_PR/src/processing/kvc_blob_detect.v`
  - `KVC_PR/verification/tb/tb_kvc_blob_detect.v`
  - `docs/verification/FPGA_BUILD_RECORD.md`
  - `docs/verification/evidence/KVC-FPGA-BLOB-REV6.md`
- **Status:** `IMPLEMENTED` · `SIMULATED` (22/22 PASS) · `BUILT` · **chưa `HARDWARE-VERIFIED`**

---

## 1. Vấn đề phải sửa

Rev 5 (`034DB01B`) hạ `sat_ok` xuống `4B ≤ R` (S ≥ 0,75) để chịu ánh sáng phòng.
Hệ quả: **da người tối lọt qua bộ lọc màu** → `n1` giả khi tay/vùng da ngăm vào
khung.

| Màu | R8/G8/B8 | H | S | `4B ≤ R` | `5B ≤ R` |
| :--- | :--- | ---: | ---: | :---: | :---: |
| Da tối (141,85,36) | 136/84/32 | 30,0° | **0,765** | 4·32 = 128 ≤ 136 → **NHẬN** | 5·32 = 160 > 136 → **LOẠI** |
| Da ngăm (176,108,40) | 176/108/40 | 30,0° | **0,773** | 4·40 = 160 ≤ 176 → **NHẬN** | 5·40 = 200 > 176 → **LOẠI** |
| Phao cam (255,150,40) | 248/148/40 | 31,2° | **0,839** | nhận | 5·40 = 200 ≤ 248 → **NHẬN** |

**Điểm mấu chốt:** hue của da (30,0°) và phao (31,2°) chỉ lệch **1,2°**. Bão hoà
là **lớp duy nhất** tách được hai màu. Vì vậy không thể hạ `sat_ok` xuống 0,75
mà vẫn giữ được phao.

---

## 2. Thay đổi

### 2.1 `KVC_PR/src/processing/kvc_blob_detect.v`

| Tham số | Rev 5 | **Rev 6** | Mục đích |
| :--- | ---: | ---: | :--- |
| `sat_ok` | `4B ≤ R` (0,75) | **`5B ≤ R` (0,80)** | loại da người tối |
| `hue_hi` | `4n ≤ 3d` (45°) | **`3n ≤ 2d` (40°)** | loại vàng mật ong / đèn trần vàng |
| `hue_lo` | `6n ≥ d` (10°) | `6n ≥ d` (10°) | **không đổi** |
| `ROW_MIN` | 3 | **5** | loại vệt sáng quét ngang |
| `MIN_PIXELS` | 16 | **36** | loại nhiễu phòng |
| `CONF_SHIFT` | 4 | **5** | `cnt = 36` → `conf = 1` |
| `LUM_MIN` | 32 | 32 | không đổi |
| `CHROMA_MIN` | 24 | 24 | không đổi |
| `MAX_SPAN` | 255 | 255 | không đổi |

Dây tín hiệu: bỏ `n4`, `d3`, `b4v` (không còn dùng); thêm `n3`, `d2`, `b5v`.
Tất cả vẫn là dịch trái + cộng + so sánh — **0 DSP, 0 phép chia**.

### 2.2 `KVC_PR/verification/tb/tb_kvc_blob_detect.v`

| Test | Thay đổi | Lý do |
| :--- | :--- | :--- |
| 3 | khối 3×5 (15 px) → **5×5 (25 px)** | `MIN_PIXELS` 16 → 36 |
| 12 | 8×2 (16 px) → **9×4 (36 px, 4 dòng)** | `ROW_MIN` 3 → 5. 9×4 là hình **duy nhất** vừa bằng `MIN_PIXELS`, aspect 2,25 ≤ 4, run 9 ≥ 3, nhưng chỉ 4 dòng → cô lập đúng `ROW_MIN` |
| 18 | **đảo kỳ vọng**: PHẢI phát → **PHẢI CHẶN** | mục tiêu chính của rev 6 |
| 19 | **mới**: da ngăm S = 0,773 → PHẢI CHẶN | chứng minh chặn cả dải, không chỉ một điểm màu |
| 20 | **mới**: vàng mật ong H = 42,7° → PHẢI CHẶN | chứng minh `hue_hi` 40° cắt được vùng rev 5 mở ra |

Thêm hằng số `C_SKIN_TAN` = `{5'd22, 6'd27, 5'd5}` (176/108/40) và
`C_YELLOW_AMBER` = `{5'd31, 6'd47, 5'd5}` (248/188/40).

---

## 3. Kết quả kiểm chứng

### 3.1 Testbench

```
iverilog -g2012 -o tb.vvp KVC_PR/src/processing/kvc_blob_detect.v \
                            KVC_PR/verification/tb/tb_kvc_blob_detect.v
vvp tb.vvp
```

**`=== SUMMARY: PASS=22 FAIL=0 ===`** · exit code 0

### 3.2 Ma trận màu (đo từ chính RTL, không phải suy đoán)

| Màu | R8/G8/B8 | H | S | ord | lum | chr | hue_lo | hue_hi | sat | **MATCH** |
| :--- | :--- | ---: | ---: | :-: | :-: | :-: | :-: | :-: | :-: | :---: |
| Cam phao (31,30,2) | 248/120/16 | 26,9° | 0,935 | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | **nhận** |
| Nắp cam 42° (31,37,5) | 248/148/40 | 31,2° | 0,839 | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | **nhận** |
| Cam 25 % (8,9,0) | 64/36/0 | 33,8° | 1,000 | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | **nhận** |
| Cam 50 % (15,16,0) | 120/64/0 | 32,0° | 1,000 | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | **nhận** |
| Da sáng (24,33,8) | 192/132/64 | 31,9° | 0,667 | ✓ | ✓ | ✓ | ✓ | ✓ | ✗ | loại |
| **Da tối (17,21,4)** | 136/84/32 | 30,0° | 0,765 | ✓ | ✓ | ✓ | ✓ | ✓ | ✗ | **loại** |
| **Da ngăm (22,27,5)** | 176/108/40 | 30,0° | 0,773 | ✓ | ✓ | ✓ | ✓ | ✓ | ✗ | **loại** |
| Vàng chanh (31,57,7) | 248/228/56 | 53,8° | 0,774 | ✓ | ✓ | ✓ | ✓ | ✗ | ✗ | loại |
| **Vàng mật ong (31,47,5)** | 248/188/40 | 42,7° | 0,839 | ✓ | ✓ | ✓ | ✓ | ✗ | ✓ | **loại** |
| Nước (7,37,22) | 56/148/176 | — | âm | ✗ | ✓ | ✗ | ✗ | ✗ | ✗ | loại |
| Trắng (31,63,31) | 248/252/248 | — | 0,000 | ✗ | ✓ | ✗ | ✗ | ✗ | ✗ | loại |

Ba dòng in đậm là **đúng ba lỗi của rev 5**, mỗi lỗi do một ngưỡng khác nhau:
da tối và da ngăm do `sat_ok`, vàng mật ong do `hue_hi`.

### 3.3 Không gian mã

| Cấu hình | Số mã khớp / 65.536 | % |
| :--- | ---: | ---: |
| Rev 5 (0,75 / 45°) | 3.048 | 4,65 % |
| **Rev 6 (0,80 / 40°)** | **2.202** | **3,36 %** |

Rev 6 cắt đúng phần mở rộng của rev 5 và trở về đúng con số của rev 4.

### 3.4 `git diff --check`

exit code 0, không có lỗi whitespace.

---

## 4. Bitstream

| Trường | Giá trị |
| :--- | :--- |
| Đường dẫn build | `KVC_PR/impl/pnr/KVC_FPGA.fs` |
| **Bản bàn giao** | **`review/artifacts/KVC_FPGA_release_4E7C1A59.fs`** |
| **SHA-256** | **`4E7C1A59FE92FC1FC41ED42350A735333C256DCF99213DD66C94E6B1A70DD34D`** |
| Kích thước | 4.620.698 B |
| Top module | `kvc_top_demo` |
| Cấu hình | `BBOX_SOURCE = 1`, `DIAG_MODE = 0` |
| Tool | Gowin V1.9.11.03 Education x64 |
| Device | GW2A-LV18PG256C8/I7 |
| Fmax `clk_100m` | **100,858 MHz** (ràng buộc 100) |
| Fmax `cam_pclk` | **74,015 MHz** (ràng buộc 24) |
| Vi phạm setup / hold | **0 / 0** |
| LUT / Register / DSP | 2.032 (1.809 LUT + 223 ALU + 0 ROM16) / 1.314 / 0,5 |
| Trạng thái | `BUILT` — **CHƯA NẠP** |

Lệnh nạp kiểm tra:

```powershell
Get-FileHash review\artifacts\KVC_FPGA_release_4E7C1A59.fs -Algorithm SHA256
# Phai ra 4E7C1A59FE92FC1FC41ED42350A735333C256DCF99213DD66C94E6B1A70DD34D
```

---

## 5. Giới hạn — phải đọc trước khi kết luận

### 5.1 Chưa đo trên bo

Toàn bộ §3 là `SIMULATED`: testbench bơm pixel **lý tưởng**, không bơm ảnh chụp
thật có nhiễu, gradient, phản xạ, AWB trôi. Chưa có TPR/FPR.

### 5.2 Margin timing mỏng

`clk_100m` đạt **100,858 MHz** so với ràng buộc 100 MHz — dư **0,86 %**. Bản
`034DB01B` đạt 128,147 MHz. Nguyên nhân là tổ hợp so sánh `3n ≤ 2d` / `5B ≤ R`
dày hơn `4n ≤ 3d` / `4B ≤ R`. Không có vi phạm ở góc slow 0,95 V / 85 °C, nhưng
margin này không cho phép thêm logic vào đường `clk_100m` mà không build lại.

### 5.3 Rủi ro mất phao thật

`MIN_PIXELS = 36` + `ROW_MIN = 5` chặt hơn rev 5. Nếu phao ở 35–40 cm chỉ chiếm
< 36 pixel thì **sẽ bị loại**. Rev 5 đo được `cnt_match` trung bình 43 trên
capture `px_rev5.bin` — sát ngưỡng mới. Đây là rủi ro **thật**, cần đo.

### 5.4 Ánh sáng phòng làm nhạt màu

Nếu AWB đẩy S của phao xuống dưới 0,80 thì phao bị loại. Cách xử lý đúng là
chỉnh AWB/gain của OV2640 (`ov2640_config.v`), **không** hạ `sat_ok` — vì hạ
`sat_ok` là mở lại đúng lỗi mà rev 6 vừa sửa.

### 5.5 Không có connected-component labeling

`min_x/max_x/min_y/max_y` là biến **toàn cục cho cả frame**
(`kvc_blob_detect.v:250-251`). Mọi pixel khớp ở bất kỳ đâu gộp vào **một** hộp
bao. Hai vật cam ở hai góc → `box_w` vượt `MAX_SPAN = 255` → mất cả hai.

### 5.6 MCU không lọc theo `confidence`

`firmware/mcu_payload/src/sensors/kvc_fpga_bbox.c:2183` chỉ kiểm `class_id`.
`CONF_SHIFT = 5` nên `cnt = 36` → `conf = 1`; blob 36 pixel được phát LoRa với
`AI_DETECTED` và confidence 1 %. Không có tầng nào chặn.

---

## 6. Việc tiếp theo

| # | Việc | Điều kiện |
| :---: | :--- | :--- |
| 1 | Nạp `4E7C1A59`, đo TPR ở 20/30/35/40 cm (thẳng + nghiêng 30°) | TPR ≥ 90 % |
| 2 | Đo FPR: phòng trống, có người, có vật đỏ/vàng | FPR ≤ 5 % |
| 3 | Nếu TPR thấp: hạ `MIN_PIXELS` 36 → 28 (giữ `sat_ok` 0,80) | không hạ `sat_ok` |
| 4 | Nếu FPR cao: nâng `MIN_PIXELS` hoặc `ROW_MIN` | |
| 5 | Nếu phao nhạt màu: chỉnh AWB, không hạ `sat_ok` | |

**Không làm:** hạ `sat_ok` về 0,75; nới `hue_hi` quá 40°; đổi ABI IF-01.
