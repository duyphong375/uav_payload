# Capture 300 s — `DIAG_MODE = 2` thật, `G6.1_blob_vsyncdiag_20261102-1415.bin`

- **Nguồn:** file `.bin` 13.590 byte trong thư mục này, Kilo đọc trực tiếp bằng
  parser CRC-16 độc lập. Log console thô (do `fpga_uart_capture.py` sinh) nằm ở
  `G6.1_blob_vsyncdiag_20261102-1415.txt` — **file này là bản phân tích**, tách
  riêng để không đè lên log gốc.
- **Bitstream:** **đúng** bản chẩn đoán — 151/151 khung có `N = 10`, dài 90 byte
  (`151 × 90 = 13.590` khớp tuyệt đối). Khác với lần 11:30 (file đó là release).
- **Cổng:** COM9, 38.400 8N1. `--seconds 300` dừng đúng 300,00 s.
- **Trạng thái:** `HARDWARE-VERIFIED` cho **số đo**; các **kết luận** cần sửa §2/§3.

---

## 1. Số đúng, đọc trực tiếp từ `.bin`

| Trường | Giá trị |
| :--- | ---: |
| Số báo cáo | **151** (tất cả `N=10`, 90 B) |
| Cửa sổ capture | 322.000 → 622.000 ms = **300,0 s** |
| `t_vsync` | **4.534** |
| `t_frame` | **2.754** |
| `t_periods` | **4.533** |
| `t_b1x` / `t_b3x` | **662** / **1.421** |
| `t_b5x` / `t_b6x` | **158** / **101** |
| `t_bother` | **2.191** ← không phải 143, xem §2.2 |

Bốn bucket đầu **đúng như báo cáo**. Ba số sau **sai**, và tôi đã sửa công cụ.

---

## 2. Bốn lỗi số học trong kết luận

### 2.1 "15,11 Hz" sai — đúng là **7,29 Hz**

`t_vsync` và `t_frame` đếm **từ lúc reset** (`ts = 0`), không phải từ đầu cửa sổ
capture. Kiểm chứng bằng hai mốc độc lập:

```text
báo cáo đầu  : ts = 322.000 ms  t_vsync = 2.362  -> 2362/322,0 = 7,34 Hz
báo cáo cuối : ts = 622.000 ms  t_vsync = 4.534  -> 4534/622,0 = 7,29 Hz
```

Hai mốc khớp nhau ⇒ **đếm từ reset**. Vì vậy phải chia cho **622 s**, không
phải 300 s:

| | Báo cáo | Đúng |
| :--- | ---: | ---: |
| VSYNC | 4534 / 300 s = **15,11 Hz** | 4534 / 622 s = **7,29 Hz** |
| frame | — | 2754 / 622 s = **4,43 Hz** |
| tỷ lệ | 60,7 % | 60,7 % (đúng số, sai cách đọc) |

### 2.2 `t_bother` = **2.191**, không phải 143 — lỗi thiết kế của tôi

`vsync_report` cũ đặt `t_bother` vào **trường H của slot 9 — chỉ 8 bit**. Giá trị
thật 2.191 bị cắt còn `2191 mod 256 = 143`. Kiểm chứng bằng số học thuần:

```text
t_periods − (t_b1x + t_b3x + t_b5x + t_b6x) = 4533 − 2342 = 2191
2191 mod 256 = 143   ← khớp đúng giá trị đọc được từ H
```

Nên phân bố đúng là:

| Bucket | Báo cáo | **Đúng** | % đúng |
| :--- | ---: | ---: | ---: |
| 1x (~65 ms) | 662 (26,6 %) | 662 | **14,6 %** |
| 3x (~197 ms) | 1421 (57,2 %) | 1421 | **31,3 %** |
| 5x (~328 ms) | 158 (6,4 %) | 158 | **3,5 %** |
| 6x (~394 ms) | 101 (4,1 %) | 101 | **2,2 %** |
| **other** | **143 (5,8 %)** | **2191** | **48,3 %** |
| Tổng | 2.485 | **4.533** | 100 % |

### 2.3 Phần trăm dùng sai mẫu số

Báo cáo chia cho **2.485** = `4 bucket + 143` (tức `other` đã bị cắt). Mẫu số
đúng là **`t_periods` = 4.533**.

### 2.4 Kết luận "F-05 ĐÚNG" chưa đứng được

`other` chiếm **48,3 %** — gần **một nửa** số chu kỳ không rơi vào bất kỳ bucket
nào. Nói "xác nhận mô hình 1/3/5/6" khi gần nửa dữ liệu nằm ngoài mô hình là
**không hợp lệ**.

Và RTL **không có bucket 2x (131 ms)**. Nếu nhịp thật có 2x, toàn bộ sẽ rơi vào
`other` — đúng bằng 48,3 % đang thấy. Đây là **ứng viên đầu tiên**, chưa kiểm.

---

## 3. Có **glitch** trên đường VSYNC — `t_vsync` bị thổi phồng

Đây là phát hiện quan trọng nhất, và nó làm hỏng kết luận Q2.

### 3.1 Bằng chứng: `w_min_ms`

Xung VSYNC thật rộng ~200 µs. Hai cạnh lên cách nhau **< 10 ms là bất khả** với
một frame VGA (frame ngắn nhất ~65 ms).

| `w_min_ms` trong cửa sổ | Số cửa sổ / 151 |
| ---: | ---: |
| **0 ms** | 1 |
| **1 ms** | **39** |
| 2–5 ms | 42 |
| 7–9 ms | 6 |
| ≥ 50 ms | 40 |

**111/151 cửa sổ (74 %) có `w_min < 50 ms`, 88 cửa sổ (58 %) có `w_min ≤ 10 ms`.**
Đó không phải frame — đó là **nhiễu/glitch** trên chân `cam_vsync` (hoặc do
`cam_vsync_sync` 3FF lấy mẫu một tín hiệu không đồng bộ với clock 100 MHz).

### 3.2 Tách cửa sổ sạch

| Nhóm | Cửa sổ | `w_periods` | Chu kỳ TB | VSYNC | frame | Tỷ lệ |
| :--- | ---: | ---: | ---: | ---: | ---: | ---: |
| **sạch** (`w_min ≥ 50 ms`) | 40 | 399 | **200,10 ms** (5,00 Hz) | 399 | 351 | **88,0 %** |
| **glitch** (`w_min < 50 ms`) | 111 | 1.782 | 124,69 ms (8,02 Hz) | 1.782 | 987 | 55,4 % |
| tất cả | 151 | 2.181 | 138,48 ms (7,22 Hz) | 2.181 | 1.338 | 61,3 % |

Ở cửa sổ **sạch**, chu kỳ TB **200,1 ms (5,00 Hz)** và tỷ lệ phát **88 %** — rất
khác "60,7 %". Nhưng chỉ có 40 cửa sổ (80 s), chưa đủ để kết luận.

### 3.3 Vì sao Q2 không kết luận được

`t_frame` (2.754) là **số đếm thật**, không bị glitch ảnh hưởng (nó đếm
`bbox_last` từ blob, mỗi frame một lần). Nhưng `t_vsync` (4.534) **bị thổi
phồng** bởi glitch. Nên hiệu `4.534 − 2.754 = 1.780` **không phải** số frame bị
rớt.

Kiểm chứng độc lập bằng tốc độ frame:

```text
t_frame / thời gian thật = 2754 / 622 s = 4,43 Hz
IF-01 đo 4 phiên trước   = 4,10 / 4,24 / 4,28 / 4,29 Hz
```

Khớp trong **3 %**. Nếu FPGA thật sự rớt 39 % frame thì IF-01 phải cho tốc độ
**thấp hơn** đáng kể so với tốc độ camera — nhưng ta không có phép đo độc lập
nào về tốc độ camera để so. Vì vậy:

> **Không thể kết luận "mất 1.780 khung trong FPGA".** Cũng **không thể** kết
> luận "không mất khung". Dữ liệu này chưa trả lời được Q2.

---

## 4. Hai lỗi trong thiết kế chẩn đoán của tôi

| # | Lỗi | Bằng chứng | Đã sửa |
| :---: | :--- | :--- | :--- |
| 1 | `t_bother` ở trường H của slot 9, chỉ 8 bit | §2.2: 2.191 → 143 | **Có** — chuyển sang **Y của slot 5** (16 bit, trước đây để 0). Không thêm slot |
| 2 | Không có bucket **2x (131 ms)** | `other` = 48,3 %, đúng bằng nếu 2x bị dồn vào `other` | **Chưa** — cần dữ liệu phân biệt |

Lỗi 1 làm báo cáo trên bo **sai một đại lượng quan trọng**; công cụ
`decode_vsync_diag.py` nay **phục hồi** giá trị bằng
`t_periods − (t_b1x+t_b3x+t_b5x+t_b6x)` và **cảnh báo** khi phát hiện cắt 8 bit,
nên **file 1415 cũ vẫn đọc đúng** mà không cần đo lại.

Lỗi 2 chưa sửa vì cần biết `other` là 2x hay là gì khác. Cách rẻ nhất: **thêm
bucket 2x (120–145 ms)** và **bucket "rất ngắn" (< 50 ms)** để tách glitch khỏi
frame thật — hiện glitch và frame lạ cùng rơi vào `other`.

---

## 5. Bitstream đã sửa (chưa nạp)

| Trường | Giá trị |
| :--- | :--- |
| SHA-256 | **`840117FADCBB110339531D908A2451C957C35ABA359EC86594A7122C0FD3C263`** |
| File | `review/artifacts/KVC_FPGA_diag_vsync_840117FA.fs` |
| Thay đổi | slot 5 Y = `t_bother` (16 bit) thay vì H slot 9 (8 bit) |
| Fmax `clk_100m` | **121,436 MHz** (bản cũ 105,030) |
| Fmax `cam_pclk` | **161,412 MHz** |
| TNS | 0 trên `clk_27m`, `clk_100m`, `cam_pclk` |
| Tài nguyên | 2.416 LUT / 2.004 FF / 1 BSRAM / 0,5 DSP |
| Testbench | **24/24 PASS** |

Cảnh báo từ chính `vsync_report.v`: `t_bother > 40 %` ⇒ **mô hình bucket sai, không
kết luận được** — đúng với dữ liệu này.

---

## 6. Việc cần làm

| # | Việc | Lý do |
| :---: | :--- | :--- |
| 1 | Thêm bucket **2x (120–145 ms)** và **"ngắn" (< 50 ms)** vào `vsync_monitor` | `other` = 48,3 % chưa giải thích được; tách được glitch khỏi frame |
| 2 | Nạp `840117FA`, capture ≥ 300 s | có `t_bother` 16 bit đúng, kiểm lại §2.2 |
| 3 | Điều tra glitch `cam_vsync` | 39 cửa sổ có `w_min = 1 ms`; xem `cam_vsync_sync` 3FF và nhiễu chân A15 |
| 4 | Chỉ sau đó mới kết luận Q1/Q2 | hiện cả hai đều chưa đủ cơ sở |

**Chưa nên** chuyển sang Pha 1 (khoá AEC / nâng PCLK): chưa chứng minh được AEC
là nguyên nhân, và 48,3 % dữ liệu nằm ngoài mô hình bucket.

---

## 7. Trạng thái bằng chứng

| Mệnh đề | Trạng thái |
| :--- | :--- |
| 151 báo cáo `N=10`, 0 CRC, 0 rác, 300,0 s | **HARDWARE-VERIFIED** |
| Bitstream đúng là `C82B9EFE` | **HARDWARE-VERIFIED** (chữ ký `N=10`) |
| Bốn bucket 1x/3x/5x/6x = 662/1421/158/101 | **HARDWARE-VERIFIED** |
| `t_bother` = 2.191 (48,3 %) | **HARDWARE-VERIFIED** (suy ra, khớp mod 256) |
| VSYNC 7,29 Hz · frame 4,43 Hz | **HARDWARE-VERIFIED** (đếm từ reset / 622 s) |
| **Có glitch trên `cam_vsync`** | **HARDWARE-VERIFIED** (`w_min` 1 ms × 39 cửa sổ) |
| **F-05 đúng (AEC)** | **CHƯA KẾT LUẬN** — `other` 48,3 %, thiếu bucket 2x |
| **Rớt 1.780 frame trong FPGA** | **KHÔNG ĐƯỢC HỖ TRỢ** — `t_vsync` bị glitch |
| F-04 đã fix trên bo | **CHƯA KIỂM** — lần 11:30 là release; lần này `C82B9EFE` **có** `ts_lat` nhưng 151 báo cáo chưa đủ để kết luận (cần ≥ 409) |
