# KVC-FPGA-BLOB-REV7 — Nới hue + hạ hình học sau khi rev 6 cho `n0` trên bo

- **Task ID:** `KVC-FPGA-BLOB-REV7`
- **Owner:** Kilo (agent có quyền workspace) · **Model:** DeepSeek
- **Ngày:** 04/11/2026
- **Tiền đề:** `KVC-FPGA-BLOB-REV6` (rev 6 `4E7C1A59`) cho `BB n0` liên tục trên bo
- **Scope:**
  - `KVC_PR/src/processing/kvc_blob_detect.v`
  - `KVC_PR/verification/tb/tb_kvc_blob_detect.v`
  - `docs/verification/FPGA_BUILD_RECORD.md`
  - `docs/verification/evidence/KVC-FPGA-BLOB-REV7.md`
- **Status:** `IMPLEMENTED` · `SIMULATED` (22/22 PASS) · `BUILT` · **chưa `HARDWARE-VERIFIED`**

---

## 1. Bằng chứng từ bo

Log MCU Hercules sau khi nạp `4E7C1A59`:

```
[M3] t=421814 US=0cm ... | BB n0 v1 crc0 en1 | LORA d1 ... tx=269/0
[RING]FPGA  pend=0 drop=0 oe=0 fe=0 byt=26348 isr=26348
```

Đọc log:

| Trường | Nghĩa | Kết luận |
| :--- | :--- | :--- |
| `BB n0` | 0 ứng viên trong frame | **không phát hiện** |
| `BB v1` | có khung IF-01 trong 2 s | camera + FPGA **còn sống** |
| `crc0` | 0 lỗi CRC | đường UART **sạch** |
| `byt=26348` tăng đều | byte FPGA gửi sang MCU | **camera đang phát** |
| `drop=0 oe=0 fe=0` | không mất byte | **không phải lỗi truyền** |

⇒ Loại trừ camera hỏng, mất cáp, UART lỗi. Vấn đề nằm ở **ngưỡng lọc**.

---

## 2. Nguyên nhân

### 2.1 `hue_hi = 40°` loại nắp hộp (nguyên nhân chính)

Yêu cầu của HUMAN ghi: nắp hộp có **"ánh vàng cam nhẹ ~42°"**.

Rev 6 đặt `3n ≤ 2d` ⇒ **H ≤ 40°**. Màu 42,7° bị loại ngay ở tầng hue.

Kiểm chứng chéo: rev 5 dùng 45° và **đã chạy được trên bo** (`n1`/`n0` đúng).
Vậy màu nắp của HUMAN nằm trong khoảng **40–45°** — rev 6 đóng đúng khoảng đó.

### 2.2 `ROW_MIN = 5` loại ở 3 m

Ở 3 m, nắp ~10 cm cho cạnh ~11,5 px. Nhưng đo được frame chỉ có **~40 % dòng
mang dữ liệu** (62.178 px trên 390 HREF × 400 px = 155 dòng có pixel).

```text
11,5 dòng vật lý × 0,40 = 4,6 dòng có dữ liệu  <  ROW_MIN = 5
```

### 2.3 `MIN_PIXELS = 36` sát ngưỡng

`cnt` ở 3 m với nắp 10 cm ≈ 53 — qua được, nhưng nắp nhỏ hơn thì rớt.

---

## 3. Thay đổi rev 7

| Tham số | Rev 6 | **Rev 7** | Lý do |
| :--- | ---: | ---: | :--- |
| `sat_ok` | `5B ≤ R` (0,80) | **`5B ≤ R` (0,80)** | **GIỮ** — lớp chặn da người chính |
| `hue_hi` | `3n ≤ 2d` (40°) | **`4n ≤ 3d` (45°)** | nắp hộp 42° |
| `hue_lo` | `6n ≥ d` (10°) | `6n ≥ d` (10°) | không đổi |
| `ROW_MIN` | 5 | **3** | ở 3 m chỉ còn ~4,6 dòng |
| `MIN_PIXELS` | 36 | **20** | nắp 10 cm @3 m cho cnt ~53 |
| `CONF_SHIFT` | 5 | **4** | `cnt = 20` → `conf = 1`; giữ 5 thì conf = 0 |
| `LUM_MIN` / `CHROMA_MIN` | 32 / 24 | 32 / 24 | không đổi |
| `ASPECT_MAX` / `MAX_SPAN` | 4 / 255 | 4 / 255 | không đổi |

Dây tín hiệu: đổi `n3`/`d2` → `n4`/`d3`; `b5v` giữ nguyên (vì `sat_ok` không đổi).

### 3.1 Vì sao hạ `MIN_PIXELS`/`ROW_MIN` KHÔNG mở lại lỗ da người

Da người bị chặn bởi `sat_ok` **trên từng pixel**, không bởi kích thước:

| Màu | S | `5B ≤ R`? |
| :--- | ---: | :--- |
| Da sáng (198,134,66) | 0,667 | 5·64 = 320 > 192 → **loại** |
| Da tối (141,85,36) | 0,765 | 5·32 = 160 > 136 → **loại** |
| Da ngăm (176,108,40) | 0,773 | 5·40 = 200 > 176 → **loại** |
| Da rất tối (110,70,40) | 0,615 | 5·40 = 200 > 104 → **loại** |

Một vùng da dù lớn đến đâu cũng không tạo được **một pixel khớp** nào, nên
`cnt = 0` và `make_blob` không bao giờ chạy. Vì vậy rev 7 **không** đánh đổi
khả năng loại da.

---

## 4. Kết quả kiểm chứng

### 4.1 Testbench

```
iverilog -g2012 -o tb.vvp KVC_PR/src/processing/kvc_blob_detect.v \
                            KVC_PR/verification/tb/tb_kvc_blob_detect.v
vvp tb.vvp
```

**`=== SUMMARY: PASS=22 FAIL=0 ===`** · exit code 0

### 4.2 Ma trận màu

| Màu | R8/G8/B8 | H | S | Rev 6 | **Rev 7** |
| :--- | :--- | ---: | ---: | :---: | :---: |
| Cam phao (255,120,20) | 248/120/16 | 26,9° | 0,935 | nhận | **nhận** |
| Nắp cam 31° (255,150,40) | 248/148/40 | 31,2° | 0,839 | nhận | **nhận** |
| **Nắp cam 42,7° (248,188,40)** | 248/188/40 | **42,7°** | 0,839 | **loại** | **nhận** |
| Cam tối 25 % (63,32,0) | 64/36/0 | 33,8° | 1,000 | nhận | **nhận** |
| Cam tối 50 % (127,64,0) | 120/64/0 | 32,0° | 1,000 | nhận | **nhận** |
| Vàng chanh (255,230,60) | 248/228/56 | 53,8° | 0,774 | loại | **loại** |
| Da sáng (198,134,66) | 192/132/64 | 31,9° | 0,667 | loại | **loại** |
| Da tối (141,85,36) | 136/84/32 | 30,0° | 0,765 | loại | **loại** |
| Da ngăm (176,108,40) | 176/108/40 | 30,0° | 0,773 | loại | **loại** |
| Da rất tối (110,70,40) | 104/68/40 | 26,2° | 0,615 | loại | **loại** |
| Nước (60,150,180) | 56/148/176 | — | âm | loại | **loại** |
| Trắng | 248/252/248 | — | 0,000 | loại | **loại** |

### 4.3 Không gian mã

| Cấu hình | Số mã / 65.536 | % |
| :--- | ---: | ---: |
| Rev 6 (0,80 / 40°) | 2.202 | 3,36 % |
| **Rev 7 (0,80 / 45°)** | **2.573** | **3,93 %** |
| Rev 5 (0,75 / 45°) | 3.048 | 4,65 % |

Rev 7 mở **+371 mã** so với rev 6 (đuôi vàng-cam 40–45°), và vẫn **hẹp hơn
475 mã** so với rev 5 (phần bão hoà thấp 0,75–0,80 — chính là vùng da người).

### 4.4 `git diff --check`

exit code 0.

---

## 5. Bitstream

| Trường | Giá trị |
| :--- | :--- |
| **Bản bàn giao** | **`review/artifacts/KVC_FPGA_release_19C849D4.fs`** |
| **SHA-256** | **`19C849D4A233056E2C994C641EA6E6FEB515109240EECA439B6B027D85B1C109`** |
| Kích thước | 4.620.698 B |
| Top module | `kvc_top_demo` |
| Cấu hình | `BBOX_SOURCE = 1`, `DIAG_MODE = 0` |
| Fmax `clk_100m` | **109,452 MHz** (ràng buộc 100) |
| Fmax `cam_pclk` | **94,387 MHz** (ràng buộc 24) |
| Vi phạm setup / hold | **0 / 0** |
| LUT / Register / DSP | 2.053 (1.810 LUT + 243 ALU + 0 ROM16) / 1.314 / 0,5 |
| Trạng thái | `BUILT` — **CHƯA NẠP** |

Timing tốt hơn rev 6 (`100,858` → `109,452 MHz`) vì `n4`/`d3` rẻ hơn `n3`/`d2`
trong đường tổ hợp.

---

## 6. Tầm nhìn (tính, CHƯA ĐO)

Giả định `fx = 346 px` và mất 40 % pixel:

| Vật | cạnh @3 m | cnt @3 m | dòng @3 m | Kết quả |
| :--- | ---: | ---: | ---: | :--- |
| 5 cm | 5,8 px | 13 | 2,3 | **rớt** |
| 6 cm | 6,9 px | 19 | 2,8 | **rớt** |
| **7 cm** | 8,1 px | 26 | 3,2 | **đạt** |
| **10 cm** | 11,5 px | 53 | 4,6 | **đạt** |
| 12 cm | 13,8 px | 77 | 5,5 | đạt |
| 15 cm | 17,3 px | 120 | 6,9 | đạt |

⇒ Nắp hộp **≥ 7 cm** mới bắt được ở 3 m. Đây là giới hạn quang học
(`fx = 346 px` trên 400 px rộng), không phải lỗi RTL. Muốn xa hơn phải tăng
độ phân giải hoặc tăng `fx`.

---

## 7. Giới hạn — phải đọc

### 7.1 Chưa đo trên bo

§4 là `SIMULATED`. Bảng §6 là **tính toán**, không phải phép đo.

### 7.2 Đối trái: vàng mật ong lọt

**Vàng mật ong / đèn tròn vàng (H ≈ 42,7°, S = 0,839) giờ LỌT** vì nó **trùng
màu** với nắp hộp cần nhận. Không bộ lọc màu nào tách được hai màu này.

Trong demo, nếu có đèn tròn vàng hoặc vật vàng-cam lớn trong khung thì có thể
sinh `n1` giả. Nếu điều đó xảy ra, chỉ có hai cách: (a) hạ `hue_hi` về 40° và
chấp nhận mất nắp 42°, hoặc (b) thêm phân loại hình dạng (không có trong thiết
kế hiện tại).

### 7.3 Frame mất 60 % dòng

Đo được: `pix_count = 62.178` trên 390 HREF × 400 px ⇒ chỉ **155/390 dòng**
mang dữ liệu. Đây là **F-10 chưa đóng**. Nó làm giảm một nửa số pixel khả dụng
và là lý do `ROW_MIN` phải hạ.

### 7.4 Không có connected-component labeling

`min_x/max_x/min_y/max_y` là biến **toàn cục cho cả frame**
(`kvc_blob_detect.v:250-251`). Hai vật cam ở hai góc → `box_w` vượt
`MAX_SPAN = 255` → **mất cả hai**.

### 7.5 MCU không lọc `confidence`

`firmware/mcu_payload/src/sensors/kvc_fpga_bbox.c:2183` chỉ kiểm `class_id`.
`CONF_SHIFT = 4` nên `cnt = 20` → `conf = 1`; blob 20 pixel được phát LoRa với
`AI_DETECTED`.

---

## 8. Việc tiếp theo

| # | Việc | Điều kiện |
| :---: | :--- | :--- |
| 1 | Nạp `19C849D4`, kiểm `n1` với nắp ở 0,4 / 1 / 2 / 3 m | mong `n1` ở mọi khoảng cách với nắp ≥ 7 cm |
| 2 | Kiểm `n0` khi bỏ nắp ra | FPR ≤ 5 % |
| 3 | Kiểm `n0` khi đưa tay/vùng da vào khung | phải `n0` — đây là phép đo quan trọng nhất |
| 4 | Nếu đèn vàng gây `n1` giả: cân nhắc hạ `hue_hi` về 40° | đánh đổi mất nắp 42° |
| 5 | Đóng F-10 (mất 60 % dòng) để tăng tầm nhìn gấp đôi | xem `KVC-G6.1-20261104-002.md` |

**Không làm:** hạ `sat_ok` về 0,75 (mở lại lỗ da người); đổi ABI IF-01.
