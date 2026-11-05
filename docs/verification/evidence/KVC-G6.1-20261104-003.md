# KVC — F-10: đo VSYNC/HREF, và ba khác biệt với driver OV2640 chuẩn

- **Mã:** `KVC-G6.1-20261104-003`
- **Loại:** chẩn đoán + sửa RTL + build. Owner: Kilo
- **Ngày:** 04/11/2026
- **Căn cứ:** driver `espressif/esp32-camera` (`sensors/ov2640.c`,
  `sensors/private_include/ov2640_settings.h`, `ov2640_regs.h`),
  `KVC_PR/src/camera/ov2640_config.v`, `KVC_PR/src/processing/pixel_stats.v`,
  `px_rev4.bin`
- **Mức bằng chứng:** `SOURCE-VERIFIED` (đối chiếu driver) ·
  `SIMULATED` (testbench) · `BUILT` (bitstream) · **chưa nạp bo**

---

## 0. Kết luận

| Yêu cầu | Kết quả |
| :--- | :--- |
| **Bước 1** — chuyển `RESET_DVP` lên trước `win_regs` | **KHÔNG LÀM. Giả thuyết SAI.** Driver chuẩn cũng ghi `RESET_DVP` **sau** `win_regs` |
| **Bước 1** — ba khác biệt thật với driver chuẩn | **ĐÃ SỬA**: thiếu `COM7_SRST`, thiếu 3 delay 10 ms |
| **Bước 2** — đo VSYNC/HREF để tìm cơ chế cắt khung | **ĐÃ THÊM** 2 bộ đếm vào `pixel_stats` rev 5 |
| **Bước 3** — build | **XONG** `373CD916`, Fmax 112,059 MHz, TNS 0, **chưa nạp** |

---

## 1. Bước 1 — giả thuyết `RESET_DVP` bị bác bỏ bằng source driver

### 1.1 Driver chuẩn ghi `RESET_DVP` ở đâu

`set_window()` trong `sensors/ov2640.c` (espressif/esp32-camera):

```c
WRITE_REG_OR_RETURN(BANK_DSP, R_BYPASS, R_BYPASS_DSP_BYPAS);
WRITE_REGS_OR_RETURN(regs);        // ov2640_settings_to_svga — KET THUC bang RESET_DVP
WRITE_REGS_OR_RETURN(win_regs);    // cua so 800x600 + zoom 640x480
WRITE_REG_OR_RETURN(BANK_SENSOR, CLKRC, c.clk);
WRITE_REG_OR_RETURN(BANK_DSP, R_DVP_SP, c.pclk);
WRITE_REG_OR_RETURN(BANK_DSP, R_BYPASS, R_BYPASS_DSP_EN);
vTaskDelay(10);
set_pixformat(sensor, sensor->pixformat);   // RESET_DVP -> IMAGE_MODE -> ... -> RESET=0
```

Bảng `ov2640_settings_to_svga` **kết thúc bằng `{RESET, RESET_DVP}`**, và
`set_pixformat()` (gọi ở cuối `set_window`) **lại** ghi `RESET_DVP` **sau**
`win_regs`.

**Trình tự của ta khớp hoàn toàn:** `0xE0=0x04` tại entry 28 (cuối khối SVGA
window) và entry 55 (đầu khối D), đều **sau** các lượt ghi `0x51/0x52/0x5A/0x5B`.

⇒ Chuyển `RESET_DVP` lên trước `win_regs` sẽ làm ta **khác** driver chuẩn, không
phải giống hơn. Không thực hiện.

### 1.2 Ba khác biệt THẬT đã sửa

| # | Khác biệt | Driver chuẩn | Trước | Sau |
| :---: | :--- | :--- | :--- | :--- |
| 1 | `COM7_SRST` đầu chuỗi | `COM7=0x80` + `vTaskDelay(10)` trước khi nạp bảng | **thiếu hoàn toàn** | thêm `0x12=0x80` + 10 ms |
| 2 | Delay sau `set_window()` | `vTaskDelay(10)` sau `R_BYPASS=DSP_EN` | chỉ 100 µs | **10 ms** |
| 3 | Delay sau `set_pixformat()` | `vTaskDelay(10)` sau `RESET=0` | chỉ 100 µs | **10 ms** |

Tác động đo được trong mô phỏng: tổng thời gian cấu hình **65,0 ms** thay vì
~30 ms. Nếu không có ba delay này, OV2640 không có thời gian áp lại cửa sổ/zoom
sau khi đổi thanh ghi — đúng loại lỗi có thể làm cửa sổ không được áp dụng.

**Giới hạn:** đây là `SOURCE-VERIFIED` + `SIMULATED`. Chưa có phép đo nào trên bo
chứng minh ba delay này sửa được F-10. Chúng là điều kiện cần theo driver, không
phải nguyên nhân đã xác nhận.

---

## 2. Bước 2 — phép đo để trả lời F-10

### 2.1 Thiết kế

Không dùng đồng hồ (PCLK chưa đo chính xác). Đo bằng chính đại lượng đang tranh
cãi: **số dòng HREF**.

| Bộ đếm | Nghĩa | Dùng để |
| :--- | :--- | :--- |
| `href_per_vs` | số xung HREF trong một chu kỳ VSYNC | số dòng **sensor nói** nó đã phát |
| `vsync_per_rep` | số xung VSYNC kể từ báo cáo trước | phát hiện VSYNC **giữa** khung |

So sánh `href_per_vs` với `pix_count / 400` (số dòng **có pixel**) phân biệt ba
cơ chế:

| Quan sát | Kết luận |
| :--- | :--- |
| `href ≈ 300`, `pix/400 ≈ 200` | **(C)** FPGA/`camera_rx` làm rớt pixel |
| `href ≈ 200`, `pix/400 ≈ 200` | **(A)** sensor tự cắt frame |
| `vsync_per_rep ≥ 2` | **(B)** gai VSYNC chia khung |

### 2.2 Slot (giữ `N_SLOT = 12`, không đổi ABI IF-01)

| Slot | Rev 4 | Rev 5 |
| :--- | :--- | :--- |
| 5 X | `max_px` (16 bit) | `{vsync_per_rep[5:0], max_px[9:0]}` |
| 5 Y | `max_py` | `max_py` (không đổi) |
| 11 X | `max_r5` | `href_per_vs` |
| 11 Y | 0 | `max_r5` |

`max_px` còn 10 bit vì 400 cột chỉ cần 0..399.

### 2.3 Mô phỏng chứng minh cơ chế (B)

Test `[6]` trong `tb_pixel_stats`:

```text
Pha 1: 3 dòng x 8 pixel      -> báo cáo 1: pix_count=24, href_per_vs=3
Gai VSYNC giữa khung
Pha 2: 2 dòng x 8 pixel      -> báo cáo 2: pix_count=16, href_per_vs=2
Tổng pixel = 40 = toàn bộ khung
```

**Đây là dấu vân tay cần tìm trên bo:** một gai VSYNC giữa khung tạo **hai báo
cáo liên tiếp** có tổng pixel bằng một khung đầy đủ.

Rà `px_rev4.bin` (chỉ có `pix_count`, chưa có `href`/`vsync_per_rep`):

| | |
| :--- | :--- |
| Cặp báo cáo liên tiếp có tổng ≈ 300 dòng | **9/41** |
| Ví dụ | `200+102`, `92+200`, `200+105`, `94+200`, `200+102`, `92+200` |
| `corr(dts, số dòng pixel)` | **+0,603** |

9/41 cặp cộng lại đúng ~300 dòng là dấu hiệu **phù hợp** với cơ chế (B), nhưng
`corr = +0,603` chưa đủ mạnh để loại (A). **Kết luận: chưa xác định.** Rev 5 sẽ
trả lời dứt điểm vì `href_per_vs` đo trực tiếp số dòng sensor phát.

---

## 3. Thay đổi RTL

### 3.1 `KVC_PR/src/camera/ov2640_config.v`

| Thay đổi | Lý do |
| :--- | :--- |
| Thêm `rom_dly[]` (8 bit/entry) | cho phép mỗi lượt ghi có thời gian nghỉ riêng |
| Thêm `COM7_SRST` + 10 ms ở entry 0 | reset sensor trước khi nạp bảng (driver chuẩn) |
| `rom_dly = 10` sau `R_BYPASS=DSP_EN` | driver chuẩn `vTaskDelay(10)` sau `set_window()` |
| `rom_dly = 10` sau `RESET=0` cuối | driver chuẩn `vTaskDelay(10)` sau `set_pixformat()` |
| Delay đếm theo **đơn vị 100 µs** thay vì chu kỳ | tránh phép nhân 32 bit làm Fmax rớt còn 101,2 MHz |

**Bài học timing:** phiên bản đầu dùng `delay_target <= rom_dly * CYCLES_PER_MS`
(100 M × 10) và tạo đường tổ hợp **12,236 ns** qua `delay_target`, kéo Fmax
`clk_100m` xuống **101,211 MHz** — sát ngưỡng 100. Đổi sang bộ đếm hai tầng
(`delay_units` × `delay_cnt` so với hằng số `CYCLES_PER_100US`) đưa Fmax về
**112,059 MHz**.

### 3.2 `KVC_PR/src/processing/pixel_stats.v` — rev 5

| Thay đổi | Lý do |
| :--- | :--- |
| `href_per_vs` | đếm HREF mỗi chu kỳ VSYNC |
| `vsync_per_rep` | đếm VSYNC giữa hai báo cáo, reset sau mỗi báo cáo |
| Slot 5 X gói `vsync_per_rep + max_px` | không tăng `N_SLOT`, giữ ABI IF-01 |
| Slot 11 = `{href_per_vs, max_r5}` | `max_r5` dời sang Y |
| `PIXSTAT_REV = 5` | nhận diện bằng số |

### 3.3 `scripts/manual/decode_pixel_diag.py`

- Nhận rev 5, đọc slot 5/11 theo nghĩa mới; rev 4 vẫn đọc đúng (tương thích ngược).
- Kiểm tra "Khung đầy đủ" đổi sang **`max_px=399, max_py=299`** (không phải 640×480).
- Thêm verdict `F-10` tự phân loại (A)/(B)/(C) từ `href_per_vs` + `vsync_per_rep`.

---

## 4. Kiểm chứng

| Hạng mục | Lệnh | Kết quả |
| :--- | :--- | :--- |
| `tb_ov2640_config` | `iverilog -g2012` + `vvp` | **17/17 PASS** (thêm test delay 10 ms) |
| `tb_pixel_stats` | cùng | **43/43 PASS** (thêm test [6] glitch) |
| `tb_kvc_blob_detect` | cùng | **18/18 PASS** (không hồi quy) |
| `test_decode_pixel_diag.py` | `python -m unittest` | **32/32 PASS** |
| `git diff --check` | | xem §6 |

### 4.1 Test delay — chống "delay bị tối ưu mất"

Test 1.2b đo tổng thời gian cấu hình. Trước khi sửa: ~30 ms. Sau khi sửa:
**65,0 ms**. Ngưỡng kiểm là 30 ms để bắt trường hợp delay biến mất mà mọi kiểm
tra khác vẫn PASS.

### 4.2 Bitstream

| Trường | Giá trị |
| :--- | :--- |
| SHA-256 | `373CD91630C1A0D2F440F9CB163F14C8680627B5F9EA1DBDAAA3FACB9D0152F4` |
| Bản sao | `review/artifacts/KVC_FPGA_diag_pixel_373CD916.fs` (4.620.698 B) |
| Fmax `clk_100m` | **112,059 MHz** (ràng buộc 100) |
| Fmax `cam_pclk` | **72,809 MHz** (ràng buộc 24) |
| TNS setup/hold | 0 / 0, 0 endpoint vi phạm |
| Logic | 2.621 (2.271 LUT + 350 ALU + 0 ROM16) |
| Register | 1.590 |
| DSP | 0,5 |
| Trạng thái | `BUILT` + `SIMULATED` — **CHƯA NẠP BO** |

---

## 5. Quy trình đo trên bo

```powershell
# 1. Xác nhận hash TRƯỚC khi nạp
Get-FileHash review\artifacts\KVC_FPGA_diag_pixel_373CD916.fs -Algorithm SHA256
# Phai ra 373CD91630C1A0D2F440F9CB163F14C8680627B5F9EA1DBDAAA3FACB9D0152F4

# 2. Nap bang Gowin Programmer -> SRAM Program

# 3. Capture 10 s
python scripts/manual/fpga_uart_capture.py --port COM6 --baud 38400 --seconds 10 --dump px_rev5.bin

# 4. Giai ma
python scripts/manual/decode_pixel_diag.py --file px_rev5.bin

# 5. NAP LAI release 9E62B590
```

### 5.1 Cách đọc kết quả

| `vsync_per_rep` | `href_per_vs` | `pix/400` | Kết luận | Bước tiếp |
| :--- | :--- | :--- | :--- | :--- |
| 1 | ~300 | ~300 | **Bình thường** — F-10 không tái hiện | đo lại 6.1.9 |
| 1 | ~200 | ~200 | **(A)** sensor tự cắt | xét `COM7`/AEC, khung 400×300 vẫn dùng được |
| 1 | ~300 | ~200 | **(C)** FPGA rớt pixel | điều tra `camera_rx`/FIFO |
| ≥ 2 | bất kỳ | bất kỳ | **(B)** gai VSYNC | thêm lọc glitch vào `camera_rx` |

Cả ba trường hợp đều **không** cần đổi ABI IF-01.

---

## 6. Việc tiếp theo

| # | Việc | Ghi chú |
| :---: | :--- | :--- |
| 1 | Nạp `373CD916`, capture, đọc `href_per_vs`/`vsync_per_rep` | quyết định (A)/(B)/(C) |
| 2 | Nếu (B): thêm lọc glitch `GLITCH_MS` vào đường VSYNC của `camera_rx` | RTL nhỏ, không đổi ABI |
| 3 | Nếu (A): khoá AEC (`COM8`/`AEC`) rồi đo lại | xem `KVC-CAM-PCLK-20261102-001` Pha 0b |
| 4 | Nếu (C): kiểm `camera_rx` ghép cặp byte khi HREF lẻ | |
| 5 | Sau khi hết cắt khung mới hiệu chuẩn `MIN_PIXELS`/`MAX_SPAN`/`sat_ok` | dữ liệu hiện chưa đủ |
| 6 | Đo `fx` thật cho georef | `346` vẫn là danh định |

**Chưa làm:** đổi `sat_ok`, hạ `MIN_PIXELS`, đổi `MIN_PIXELS`/`MAX_SPAN` cho
400×300 — tất cả đều phải chờ biết khung có đầy đủ hay không.
