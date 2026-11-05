# KVC-FPGA-BLOB-REV9 — Sửa lỗi `MIN_PIXELS = 50` của rev 8

- **Task ID:** `KVC-FPGA-BLOB-REV9`
- **Owner:** Kilo (agent có quyền workspace) · **Model:** DeepSeek
- **Ngày:** 04/11/2026
- **Tiền đề:** rev 8 (`B65114B3`) cho `BB n0` liên tục trên bo
- **Scope:**
  - `KVC_PR/src/processing/kvc_blob_detect.v`
  - `KVC_PR/verification/tb/tb_kvc_blob_detect.v`
  - `docs/verification/FPGA_BUILD_RECORD.md`
  - `docs/verification/evidence/KVC-FPGA-BLOB-REV9.md`
- **Status:** `IMPLEMENTED` · `SIMULATED` (23/23 PASS) · `BUILT` · **chưa `HARDWARE-VERIFIED`**

---

## 1. Bằng chứng: giả thiết của rev 8 sai

Rev 8 được thiết kế trên giả thiết:

> *"Nắp cam chiếm 300–700 pixel. Vùng da của ngón tay chỉ 15–25 pixel.
> `MIN_PIXELS = 50` chặn ngón tay 100 %."*

**Đo trên bo bác bỏ giả thiết này.**

### 1.1 Số liệu từ `px_rev5.bin` (65 khung)

Bộ lọc của `pixel_stats` rev 5 là **chặt hơn** rev 8 (`sat 5B = 0,80` so với
`4B = 0,75`; `hue 40°` so với `45°`), nên `cnt_match` của nó là **cận dưới**
của rev 8.

| Đại lượng | Giá trị |
| :--- | ---: |
| `cnt_match` trung bình | **43 px** |
| `cnt_match` trung vị | 42 px |
| `cnt_match` nhỏ nhất | 4 px |
| `cnt_match` **lớn nhất** | **89 px** |

**Không khung nào đạt 300–700 px.** Con số cao nhất là 89.

### 1.2 Tỉ lệ đạt theo ngưỡng

| `MIN_PIXELS` | Số khung đạt | % |
| ---: | ---: | ---: |
| 16 | 60/65 | 92 % |
| **20** | **56/65** | **86 %** |
| 24 | 50/65 | 77 % |
| 30 | 46/65 | 71 % |
| 36 | 40/65 | 62 % |
| **50** | **24/65** | **37 %** |

Ở `MIN_PIXELS = 50`, **63 % số khung bị loại**. Đó chính là `BB n0` liên tục.

### 1.3 Tỉ lệ từng cổng lọc

| Cổng | Pixel trung bình | % của frame |
| :--- | ---: | ---: |
| `pix_count` | 62.178 | 100 % |
| `ord_ok` (R>G>B) | 4.488 | 7,22 % |
| `hue_ok` (10–40°) | 2.678 | 4,31 % |
| `sat_ok` (S≥0,80) | 4.354 | 7,00 % |
| **`cnt_match`** | **43** | **0,07 %** |

Chỉ **0,07 %** pixel lọt qua toàn bộ chuỗi. Nếu nắp chiếm ~2.000 px trên ảnh
(10 cm ở 78 cm), kỳ vọng `cnt` ≈ 788 px — nhưng thực đo chỉ **43 px**, tức
**5,5 %** so với kỳ vọng.

---

## 2. Thay đổi rev 9

| Tham số | Rev 8 | **Rev 9** |
| :--- | ---: | ---: |
| `sat_ok` | `4B ≤ R` (0,75) | `4B ≤ R` (0,75) |
| `hue_hi` | `4n ≤ 3d` (45°) | `4n ≤ 3d` (45°) |
| `hue_lo` | `6n ≥ d` (10°) | `6n ≥ d` (10°) |
| `ROW_MIN` | 4 | 4 |
| **`MIN_PIXELS`** | **50** | **20** |
| `CONF_SHIFT` | 4 | 4 |
| `LUM_MIN` / `CHROMA_MIN` | 32 / 24 | 32 / 24 |
| `ASPECT_MAX` / `MAX_SPAN` | 4 / 255 | 4 / 255 |

Chỉ **một** tham số đổi. Bộ lọc màu giữ nguyên.

---

## 3. Kết quả kiểm chứng

### 3.1 Testbench

```
iverilog -g2012 -o tb.vvp KVC_PR/src/processing/kvc_blob_detect.v \
                            KVC_PR/verification/tb/tb_kvc_blob_detect.v
vvp tb.vvp
```

**`=== SUMMARY: PASS=23 FAIL=0 ===`** · exit code 0

### 3.2 Các test thay đổi

| Test | Rev 8 | Rev 9 |
| :--- | :--- | :--- |
| 3 | khối 4×4 (16 px) dưới `MIN=50` | khối 4×4 (16 px) dưới `MIN=20` |
| 10 | khối 8×8 (64 px) | **khối 6×6 (36 px)** — gần `cnt` trung bình 43 |
| 12 | 20×2 = 40 px, vi phạm cả `cnt` lẫn `rows` | 20×2 = 40 px, vi phạm `ROW_MIN` và `ASPECT` |
| 18 | da tối 6×6 (36 px) chặn bởi `MIN=50` | **da tối 4×4 (16 px)** chặn bởi `MIN=20` |
| 19 | da ngăm 7×7 (49 px) chặn | **bàn tay da ngăm 80×80 → LỌT** (đối trái) |

### 3.3 `git diff --check`

exit code 0.

---

## 4. Bitstream

| Trường | Giá trị |
| :--- | :--- |
| **Bản bàn giao** | **`review/artifacts/KVC_FPGA_release_1792FFFB.fs`** |
| **SHA-256** | **`1792FFFB372773788BDA19E37F2DAB5132192BC32D7F6ED45B492281EEB9E656`** |
| Kích thước | 4.620.698 B |
| Top module | `kvc_top_demo` |
| Cấu hình | `BBOX_SOURCE = 1`, `DIAG_MODE = 0` |
| Fmax `clk_100m` | **128,918 MHz** (ràng buộc 100) |
| Fmax `cam_pclk` | **87,561 MHz** (ràng buộc 24) |
| Vi phạm setup / hold | **0 / 0** |
| LUT / Register / DSP | 2.020 (1.786 LUT + 234 ALU + 0 ROM16) / 1.314 / 0,5 |
| Trạng thái | `BUILT` — **CHƯA NẠP** |

---

## 5. Dự đoán kết quả (chưa đo)

Với bộ lọc rev 9 (rộng hơn bộ lọc đã dùng để đo):

| `MIN_PIXELS` | Kỳ vọng |
| ---: | :--- |
| 20 | ~86 % khung đạt (cận dưới; rev 9 rộng hơn nên có thể cao hơn) |
| 16 | ~92 % |

**Không đạt 100 %.** Muốn đạt 100 % phải xử lý nguyên nhân gốc: chỉ 0,07 %
pixel lọt qua bộ lọc.

---

## 6. Nguyên nhân gốc chưa xác định

`cnt_match` chỉ 43 px trong khi kỳ vọng 788 px. Hai ứng viên, **chưa loại trừ**:

### 6.1 F-10 — frame mất 60 % dòng

Đo được `pix_count = 62.178` trên 390 HREF × 400 px ⇒ chỉ **155/390 dòng** mang
dữ liệu. Nếu nắp rơi vào dải dòng trống thì frame đó `n0`.

Hệ số này đã được tính trong ước lượng 788 px (đã nhân 0,40), nên **một mình
nó không giải thích được mức 43 px**.

### 6.2 Chói sáng bề mặt nắp (specular highlight)

Nắp nhựa bóng dưới đèn LED trần: phần hứng đèn bị bão hoà trắng → mất màu →
`ord_ok` sai (`R ≈ G ≈ B`) → loại.

Nếu chỉ một phần bề mặt bị chói, phần còn lại vẫn khớp → tạo mảng nhỏ rời rạc
→ `cnt` thấp. **Phù hợp với phân bố đo được** (4–89 px, dao động lớn).

### 6.3 Cách phân biệt

| Phép đo | Kết quả | Kết luận |
| :--- | :--- | :--- |
| Nghiêng nắp 15–20° rồi đo lại | `cnt` tăng rõ | **6.2 chói sáng** |
| Che bớt đèn trần, dùng đèn tán xạ | `cnt` tăng rõ | **6.2** |
| Di chuyển nắp theo phương dọc | `n1` phụ thuộc mạnh vị trí | **6.1 F-10** |
| Đo bằng diag `373CD916`, xem `cnt_ord_ok` | `cnt_ord_ok` thấp | **6.2** (mất màu) |
| | `cnt_ord_ok` cao, `cnt_match` thấp | run-length / hình học |

---

## 7. Việc tiếp theo

| # | Việc | Kỳ vọng |
| :---: | :--- | :--- |
| 1 | Nạp `1792FFFB`, giữ nắp im 30 s ở 78 cm | đếm tỉ lệ `n1` — mong ≥ 86 % |
| 2 | Nghiêng nắp 15–20° | nếu `n1` tăng rõ → chói sáng |
| 3 | Đổi sang đèn tán xạ (che trực tiếp) | nếu `n1` tăng rõ → chói sáng |
| 4 | Nếu vẫn thấp: nạp `373CD916` đo `cnt_ord_ok` | phân biệt 6.1 vs 6.2 |
| 5 | Đóng F-10 | tăng pixel khả dụng 2,5× |

**Không làm:** hạ `MIN_PIXELS` xuống dưới 20 (nhiễu phòng sẽ kích hoạt);
hạ `sat_ok` xuống dưới 0,75.
