# KVC — F-10/F-11: hình học khung thật 400×300, cắt 90 % khung, georef sai hệ quy chiếu

- **Mã:** `KVC-G6.1-20261104-002`
- **Loại:** chẩn đoán (1) + sửa georef (2). Owner: Kilo
- **Ngày:** 04/11/2026
- **Căn cứ:** `G6.1.9_pixel_rev4_20261104-1244.bin` (4.452 B, 42 khung IF-01,
  0 lỗi CRC, `rev_slot = 4`, SHA-256
  `816743AAFEE5ECC1576D923A2DD08D5FFF86EF1F1F66FE620745BDAC9E0EDE86` — bản sao
  của `px_rev4.bin` ở gốc repo, capture trên bo), `px.bin` (rev 3),
  `ov2640_config.v`, `pixel_stats.v` rev 4, `camera_rx.v`, `kvc_georef.c`
- **Mức bằng chứng:** `HARDWARE-VERIFIED` cho mọi số đọc từ `.bin`;
  `SOURCE-VERIFIED` cho suy luận RTL/C; **cơ chế cắt khung: CHƯA XÁC ĐỊNH**

---

## 0. Kết luận

1. **Chiều rộng 400 px: ĐÚNG.** `max_px = 399` ở **41/42** khung.
2. **Chiều cao 240: SAI.** `max_py` chạy **98 … 356** (29 giá trị). Khung
   **đầy đủ là 400 × 300**, không phải 400 × 240.
3. **Chỉ 4/42 khung (9,5 %) là đầy đủ.** 38/42 khung bị cắt còn **1/3** hoặc
   **2/3** chiều cao. Đây là **F-10**, nặng hơn F-04/F-05 đã ghi trước đó.
4. **RTL blob KHÔNG giả định 640×480.** Không có hằng số nào. Chỗ hard-code
   640×480 là **`kvc_georef.c:20-22`** → **F-11 (P1)**, sai 13,5 m ở 50 m.

---

## 1. F-10 — khung thật là 400 × 300, và 90 % khung bị cắt

### 1.1 Chiều rộng: 400

| Đại lượng | Giá trị |
| :--- | :--- |
| `max_px` | **399** ở 41/42 khung; 1 khung = 715 (HREF dính dòng, xem §1.4) |
| `pix_count` chia 399 | 100,01 / 200,03 / 300,09 — gần đúng số nguyên |

`max_px = 399` ⇒ chỉ số cột lớn nhất là 399 ⇒ **400 cột**.

### 1.2 Chiều cao: 300, không phải 240

| Đại lượng | Giá trị |
| :--- | :--- |
| `max_py` | **98 … 356**, 29 giá trị khác nhau |
| Số khung có `max_py = 239` | **0/42** |
| `pix_count` lớn nhất | **119.903** |
| `400 × 300` | **120.000** → thiếu 97 px (**0,08 %**) |
| `400 × 240` | 96.000 → **không khung nào** rơi vào ±5.000 |

`pix_count` chia 400 rơi đúng 3 cụm, cả hai file capture:

| `pix_count` | ≈ dòng | rev 4 (42 khung) | rev 3 (42 khung) |
| ---: | ---: | ---: | ---: |
| 39.905 | **100** = 300/3 | 10 | 9 |
| 79.810 | **200** = 2×300/3 | 21 | 23 |
| 119.737 | **300** = đầy đủ | 4 | 4 |
| lẻ (92–105 dòng) | — | 7 | 6 |

**Chỉ 4/42 khung đạt 300 dòng. 31/42 khung còn đúng 1/3 hoặc 2/3.**

### 1.3 Nguồn gốc 400 × 300 — khớp thanh ghi, không phải lỗi đặt

Đối chiếu `ov2640_config.v:339-363` với bảng chuẩn `ov2640_settings_to_svga`
của espressif/esp32-camera:

| Thanh ghi | Giá trị ghi | Nghĩa chuẩn | Kết quả |
| :--- | :--- | :--- | :--- |
| `0xC0` HSIZE8 | `0x64` = 100 | 100 × 4 = 800 cột sensor | SVGA |
| `0xC1` VSIZE8 | `0x4B` = 75 | 75 × 4 = 600 dòng sensor | SVGA |
| `0x51` HSIZE | `0xC8` = 200 | cửa sổ 800 px | SVGA |
| `0x52` VSIZE | `0x96` = 150 | cửa sổ 600 px | SVGA |
| `0x5A` ZMOW | `0xA0` = 160 | 160 × 4 = **640** px ra | VGA |
| `0x5B` ZMOH | `0x78` = 120 | 120 × 4 = **480** dòng ra | VGA |

Bảng ghi **đúng cặp SVGA chuẩn** và **đúng zoom VGA**. Nhưng đầu ra đo được là
**800 ÷ 2 = 400** và **600 ÷ 2 = 300**, tức tỉ lệ **DCW 1/2**, không phải zoom
640×480.

⇒ **Ghi lại các giá trị này (Phương án A như mô tả) sẽ không thay đổi gì** —
chúng đã đúng. Nút thắt nằm ở chỗ khác: khối zoom không được áp dụng.

**Ứng viên số một (chưa kiểm):** `ov2640_config.v:381-386` ghi `0xE0 = 0x04`
(**RESET_DVP**) **sau** `win_regs` ở bước D. Driver chuẩn ghi `RESET_DVP` **trước**
khi đặt cửa sổ, không phải sau. Nếu reset xoá cấu hình cửa sổ vừa ghi thì DSP
rơi về tỉ lệ DCW mặc định — khớp đúng quan sát 1/2.

### 1.4 19–47 % dòng HREF không mang pixel

`max_py` tăng tại **mỗi** cạnh xuống HREF; `pix_count` chỉ tăng khi
`pixel_valid`. Hiệu số hai đại lượng là số dòng **rỗng**:

| Cụm | `max_py+1` (HREF) | dòng có pixel | dòng rỗng | % rỗng |
| :--- | ---: | ---: | ---: | ---: |
| 100 dòng | 183 | 100 | 83 | **45 %** |
| 200 dòng | 250 | 200 | 50 | **20 %** |
| 300 dòng | 356 | 300 | 56 | **16 %** |
| **Tổng (42 khung)** | **9.515** | **7.079** | **2.436** | **25,6 %** |

Trong **cùng một cụm**, `max_px` không đổi (399) nhưng `max_py` đổi 176…189 —
nghĩa là số dòng HREF thay đổi trong khi số dòng **có dữ liệu** giữ nguyên.

⇒ Có hai hiện tượng **độc lập**: (a) khung bị cắt sớm, (b) một số dòng HREF
không sinh pixel. Cả hai đều chưa rõ cơ chế.

### 1.5 Giới hạn — cơ chế CHƯA xác định

Không kết luận được nguyên nhân từ dữ liệu hiện có. Ba ứng viên, **chưa loại trừ**:

| # | Ứng viên | Cần đo gì để quyết |
| :---: | :--- | :--- |
| A | VSYNC glitch reset `pix_count`/`py` giữa frame | đếm VSYNC/frame; đã thấy `w_min = 1 ms` trong `KVC-CAM-DIAG-20261102-1415` |
| B | `camera_rx` mất cặp byte (HREF lẻ byte) | thêm bộ đếm byte/dòng vào diag |
| C | AEC kéo dài phơi sáng → sensor đọc theo lô | đo `COM8`/AEC, khoá AEC rồi lặp lại |

Lưới 65,54 ms với bội **1/3/5/6/8** (khớp F-05) nghiêng về **C**, nhưng chưa đủ.

> Ghi chú: báo cáo gửi reviewer nói "camera xuất cố định 400×240, không ngắt do
> glitch VSYNC". Hai vế đều **trái dữ liệu**: chiều cao là 300, và 38/42 khung
> bị cắt đúng ở 1/3 và 2/3 — dấu hiệu ngắt **có chu kỳ**, không phải cố định.

---

## 2. F-11 (P1) — georef hard-code hệ 640×480

**Vị trí:** `firmware/mcu_payload/src/kvc_georef.c:20-22`

```c
#define KVC_GEO_DEFAULT_FX_PX          554.0f   /* = 320 / tan(30°) @ 640 px */
#define KVC_GEO_DEFAULT_CX_PX          320.0f
#define KVC_GEO_DEFAULT_CY_PX          240.0f
```

**Bằng chứng RTL không dính lỗi này:** rà `kvc_blob_detect.v` — **không có**
hằng số 640/480/800/600 nào. `px`/`py` 10 bit (tới 1023), `MAX_SPAN = 255`,
`MIN_PIXELS` là số pixel tuyệt đối. `bbox_x/y` 16 bit, `w/h` 8 bit ⇒ **400×300 và
640×480 đều vừa ABI IF-01**, không cần đổi layout.

**Sai số đo được.** Vật ở **tâm ảnh thật** (200, 150) — trường hợp tốt nhất:

| Độ cao | `right` báo | `fwd` báo | Sai vị trí |
| ---: | ---: | ---: | ---: |
| 30 m | −6,5 m | +4,9 m | 8,1 m |
| 50 m | **−10,8 m** | **+8,1 m** | **13,5 m** |
| 100 m | −21,7 m | +16,2 m | 27,1 m |

Tiêu chí `6.3.6` là **< 0,5 m @ 3 m**. Ở 3 m vẫn sai **~0,8 m**. Ngay cả khi vật
nằm chính giữa khung, georef báo lệch hơn 10 m ở độ cao bay thường.

**Hệ quả:** marker mục tiêu trên GCS lệch khỏi vị trí thật theo một vector **cố
định** phụ thuộc độ cao. Ở 50 m, mọi mục tiêu đều bị đẩy 13,5 m về Tây-Nam (với
Yaw = Bắc). Đây là lỗi dẫn đường, không phải lỗi hiển thị.

---

## 3. Sửa F-11

### 3.1 Thay đổi

`kvc_georef.c`:

| Hằng số | Cũ | Mới | Căn cứ |
| :--- | ---: | ---: | :--- |
| `FX_PX` | 554,0 | **346,0** | `200 / tan(30°) = 346,41`; 400 px giữ nguyên HFOV 60° ⇒ `554 × 400/640` |
| `CX_PX` | 320,0 | **200,0** | `400 / 2` |
| `CY_PX` | 240,0 | **150,0** | `300 / 2` |

`kvc_georef.h`: cập nhật comment mô tả 400×300 và cảnh báo `fx` phải hiệu chuẩn.

`test_kvc_georef.c`: TEST 9 đổi kỳ vọng; `make_input()` đổi tâm ảnh sang
(200, 150) cho khớp hình học mới.

### 3.2 Giới hạn phải ghi rõ

- **346,0 là giá trị DANH ĐỊNH**, suy từ giả định HFOV 60° của giá trị 554 cũ.
  `fx` thật **phải đo** (bảng hiệu chuẩn hoặc ít nhất một vật có kích thước biết
  trước ở khoảng cách biết trước). Chưa có phép đo nào.
- Sai số do `fx` sai **tỉ lệ thuận**: `fx` lệch 10 % ⇒ cự ly ngang lệch 10 %.
  Ở 50 m, 10 % = 5 m — vẫn vượt tiêu chí. **Không được coi 346,0 là đã hiệu chuẩn.**
- Chưa mô hình hoá roll/pitch (đã ghi trong `kvc_georef.h`).
- **F-10 chưa đóng:** nếu 38/42 khung bị cắt ở 1/3 hoặc 2/3, mục tiêu nằm ngoài
  phần đã đọc sẽ **không bao giờ** được phát hiện. Sửa `cx/cy/fx` chỉ làm đúng
  phép chiếu **cho phần ảnh đọc được**, không khôi phục phần bị cắt.

### 3.3 Kiểm chứng

Xem §4.

---

## 4. Kết quả kiểm chứng

| Hạng mục | Lệnh | Kết quả |
| :--- | :--- | :--- |
| georef host tests | `gcc -std=c99 -Wall -Wextra -Ifirmware/mcu_payload/inc ... test_kvc_georef.c` | **72/72 PASS** (thêm TEST 15) |
| bbox host tests | cùng cách, `test_kvc_fpga_bbox.c` | **33/33 PASS** (không hồi quy) |
| `git diff --check` | | exit 0 (chỉ cảnh báo CRLF của Git, không có lỗi whitespace) |

**TEST 15** khoá đúng lỗi: vật ở tâm ảnh thật (200, 150) ở 8 m phải cho
`x_local ≈ 0`, `y_local ≈ 0`. Với `cx = 320 / cy = 240` cũ, test này cho
**−173 cm / +130 cm** — đúng bằng sai số F-11. Nếu ai đổi lại hằng số, test FAIL.

Test cũng phát hiện một chi tiết hình học có thật: ảnh 400 px có chỉ số 0..399
nên tâm nguyên 200 để lại **200 px bên trái, 199 px bên phải** — lệch nửa pixel.
Dung sai test vì vậy là 1 px (2,3 cm @ 8 m), không phải 0.

---

## 5. Việc tiếp theo

| # | Việc | Điều kiện |
| :---: | :--- | :--- |
| 1 | Kiểm giả thuyết `RESET_DVP` sau `win_regs` | sửa thứ tự, build, đo `max_px`/`max_py`; kỳ vọng 640×480 |
| 2 | Thêm bộ đếm VSYNC/frame + byte/dòng vào diag | phân biệt ứng viên A/B/C ở §1.5 |
| 3 | Đo `fx` thật | vật chuẩn ở khoảng cách biết trước |
| 4 | Đo lại 6.1.9 chỉ trên khung **300 dòng** | lọc `pix_count >= 119000` |
| 5 | Chỉ sau đó mới bàn `MIN_PIXELS`/`MAX_SPAN`/`sat_ok` | dữ liệu hiện chưa đủ |
