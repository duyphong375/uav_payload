# KVC-FPGA-BLOB-REV8 — Bản "chốt hạ": nới bão hoà + nâng MIN_PIXELS

- **Task ID:** `KVC-FPGA-BLOB-REV8`
- **Owner:** Kilo (agent có quyền workspace) · **Model:** DeepSeek
- **Ngày:** 04/11/2026
- **Mục đích:** bản chốt cho buổi chấm demo. Nắp cam ăn **liên tục không chập
  chờn**, trong khi vùng da nhỏ của ngón tay cầm nắp bị chặn.
- **Scope:**
  - `KVC_PR/src/processing/kvc_blob_detect.v`
  - `KVC_PR/verification/tb/tb_kvc_blob_detect.v`
  - `docs/verification/FPGA_BUILD_RECORD.md`
  - `docs/verification/evidence/KVC-FPGA-BLOB-REV8.md`
- **Status:** `IMPLEMENTED` · `SIMULATED` (23/23 PASS) · `BUILT` · **chưa `HARDWARE-VERIFIED`**

---

## 1. Cơ sở của quyết định

Hai quan sát từ bo, đối chiếu nhau:

| Bản | `sat_ok` | `MIN_PIXELS` | Nắp cam | Ngón tay |
| :--- | ---: | ---: | :--- | :--- |
| rev 5 (14:00) | **0,75** | 16 | **ăn rất mượt** | **nhận nhầm** |
| rev 6/7 (15:00) | 0,80 | 36 / 20 | **chập chờn** (~10 % khung) | chặn đúng |

Rev 5 và rev 7 chỉ khác nhau ở `sat_ok` (0,75 vs 0,80). Nắp cam ăn mượt ở 0,75
nhưng chập chờn ở 0,80 ⇒ **biên an toàn của nắp tại 0,80 quá mỏng**.

Với S của nắp trong khoảng 0,78–0,82 (theo quan sát của HUMAN), tại ngưỡng 0,80:

```text
biên dưới = 0,78 - 0,80 = -0,02   -> RỚT khi AWB kéo xuống
biên trên = 0,82 - 0,80 = +0,02   -> ĐẬU khi AWB kéo lên
```

Biên ±0,02 **nhỏ hơn** biên dao động AWB giữa các khung ⇒ `n1`/`n0` xen kẽ.
Đây là nguyên nhân chập chờn, **không phải hình học** (ở 78 cm `MIN_PIXELS=20`
dư 39 lần).

Tại 0,75, biên thành **−0,03 / +0,07** — đủ rộng để AWB dao động.

---

## 2. Thay đổi

| Tham số | Rev 7 | **Rev 8** | Lý do |
| :--- | ---: | ---: | :--- |
| `sat_ok` | `5B ≤ R` (0,80) | **`4B ≤ R` (0,75)** | mở biên an toàn cho AWB |
| `hue_hi` | `4n ≤ 3d` (45°) | `4n ≤ 3d` (45°) | không đổi |
| `hue_lo` | `6n ≥ d` (10°) | `6n ≥ d` (10°) | không đổi |
| `ROW_MIN` | 3 | **4** | chặn vệt sáng ngang ngắn |
| `MIN_PIXELS` | 20 | **50** | chặn vùng da ngón tay (15–49 px) |
| `CONF_SHIFT` | 4 | 4 | `cnt = 50` → `conf = 3` |
| `LUM_MIN` / `CHROMA_MIN` | 32 / 24 | 32 / 24 | không đổi |
| `ASPECT_MAX` / `MAX_SPAN` | 4 / 255 | 4 / 255 | không đổi |

Dây tín hiệu: `b5v` → `b4v` (`b11 << 2`).

---

## 3. Kết quả kiểm chứng

### 3.1 Testbench

```
iverilog -g2012 -o tb.vvp KVC_PR/src/processing/kvc_blob_detect.v \
                            KVC_PR/verification/tb/tb_kvc_blob_detect.v
vvp tb.vvp
```

**`=== SUMMARY: PASS=23 FAIL=0 ===`** · exit code 0

### 3.2 Ma trận màu

| Màu | R8/G8/B8 | H | S | Rev 7 | **Rev 8** |
| :--- | :--- | ---: | ---: | :---: | :---: |
| Cam phao (255,120,20) | 248/120/16 | 26,9° | 0,935 | nhận | **nhận** |
| Nắp cam 31° (255,150,40) | 248/148/40 | 31,2° | 0,839 | nhận | **nhận** |
| Nắp cam 42,7° (248,188,40) | 248/188/40 | 42,7° | 0,839 | nhận | **nhận** |
| Cam tối 25 % (63,32,0) | 64/36/0 | 33,8° | 1,000 | nhận | **nhận** |
| Cam tối 50 % (127,64,0) | 120/64/0 | 32,0° | 1,000 | nhận | **nhận** |
| Vàng chanh | 248/228/56 | 53,8° | 0,774 | loại | **loại** (hue_hi) |
| Da sáng | 192/132/64 | 31,9° | 0,667 | loại | **loại** (sat) |
| **Da tối** | 136/84/32 | 30,0° | **0,765** | loại | **NHẬN pixel** |
| **Da ngăm** | 176/108/40 | 30,0° | **0,773** | loại | **NHẬN pixel** |
| Da rất tối | 104/68/40 | 26,2° | 0,615 | loại | **loại** (sat) |
| Nước / Trắng | — | — | — | loại | **loại** |

### 3.3 Ngưỡng hình học

Cần **cả** `cnt ≥ 50` **và** `rows_good ≥ 4`. Với `cnt = 0,4·a²` và
`rows = 0,4·a` (a = cạnh vật tính bằng px, hệ số 0,4 là phần dòng có dữ liệu):

| a (px) | cnt | rows | MIN=50 | ROW=4 |
| ---: | ---: | ---: | :---: | :---: |
| 9 | 32 | 3,6 | ✗ | ✗ |
| 10 | 40 | 4,0 | ✗ | ✓ |
| 11 | 48 | 4,4 | ✗ | ✓ |
| **12** | **58** | **4,8** | **✓** | **✓** |
| 15 | 90 | 6,0 | ✓ | ✓ |
| 20 | 160 | 8,0 | ✓ | ✓ |

⇒ **Cạnh tối thiểu: 12 px.**

### 3.4 Tầm nhìn (tính, CHƯA ĐO)

**Ở 78 cm** (1 cm = 4,44 px):

| Nắp | cạnh | cnt | rows | Kết quả |
| :--- | ---: | ---: | ---: | :--- |
| 2,0 cm | 8,9 | 32 | 3,6 | rớt |
| 2,5 cm | 11,1 | 49 | 4,4 | **rớt** (cnt 49 < 50) |
| **3,0 cm** | 13,3 | 71 | 5,3 | **đạt** |
| 5,0 cm | 22,2 | 197 | 8,9 | đạt |
| 10,0 cm | 44,4 | 789 | 17,8 | đạt |
| 15,0 cm | 66,6 | 1.775 | 26,6 | đạt |

**Ở 3 m:**

| Nắp | cạnh | cnt | rows | Kết quả |
| :--- | ---: | ---: | ---: | :--- |
| 8 cm | 9,2 | 34 | 3,7 | rớt |
| **10 cm** | 11,5 | 53 | 4,6 | **đạt** (sát) |
| 15 cm | 17,3 | 120 | 6,9 | đạt |

### 3.5 `git diff --check`

exit code 0.

---

## 4. Bitstream

| Trường | Giá trị |
| :--- | :--- |
| **Bản bàn giao** | **`review/artifacts/KVC_FPGA_release_B65114B3.fs`** |
| **SHA-256** | **`B65114B358C1F899C6939ECD5E238D817B9D9C4738E32F1794E90D649DF94CCF`** |
| Kích thước | 4.620.698 B |
| Top module | `kvc_top_demo` |
| Cấu hình | `BBOX_SOURCE = 1`, `DIAG_MODE = 0` |
| Fmax `clk_100m` | **116,310 MHz** (ràng buộc 100) |
| Fmax `cam_pclk` | **81,098 MHz** (ràng buộc 24) |
| Vi phạm setup / hold | **0 / 0** |
| LUT / Register / DSP | 2.024 (1.789 LUT + 235 ALU + 0 ROM16) / 1.314 / 0,5 |
| Trạng thái | `BUILT` — **CHƯA NẠP** |

---

## 5. ⚠️ ĐỐI TRÁI PHẢI BIẾT — `MIN_PIXELS` không chặn được da

Đây là điểm **quan trọng nhất** của rev 8 và dễ bị hiểu sai.

**`MIN_PIXELS = 50` chặn theo DIỆN TÍCH, không theo MÀU.** Ở `sat_ok = 0,75`,
màu da tối và da ngăm **đã qua được** bộ lọc màu trên từng pixel. Thứ duy nhất
ngăn chúng phát bbox là kích thước vùng.

| Vùng da | Số pixel | Kết quả |
| :--- | ---: | :--- |
| Đầu ngón tay (nhỏ) | 15–30 | **chặn** |
| Ngón tay đầy đủ | 50–150 | **lọt** |
| Bàn tay ở 78 cm | **~1.200** | **LỌT — phát bbox** |
| Bàn tay ở 3 m | ~86 | **lọt** |

Test 21 trong `tb_kvc_blob_detect` **khoá hành vi này**: bàn tay 80×80 px da tối
**phải** phát bbox. Nếu test đó FAIL nghĩa là ai đó đã lặng lẽ đổi hành vi.

**Hệ quả thực tế cho demo:**

- Cầm nắp bằng **đầu ngón tay**, tay nằm **ngoài khung** → an toàn.
- Để **cả bàn tay** trong khung cùng nắp → có thể `n1` giả.
- Nếu `n1` giả xảy ra, bbox sẽ bao **cả bàn tay + nắp** (vì không có
  connected-component labeling), làm `box_w/h` lớn bất thường. Có thể dùng dấu
  hiệu đó để phân biệt khi debug.

**Nếu cần chặn da ở mọi kích thước:** phải quay về `sat_ok = 0,80` và chấp
nhận nắp chập chờn. Không có cấu hình nào đạt cả hai — khe S giữa da tối
(0,765) và nắp (0,78–0,82) chỉ rộng **0,015 đến 0,055**.

---

## 6. Giới hạn khác

- **Chưa đo trên bo.** §3 là `SIMULATED`; §3.4 là **tính toán**.
- **Chưa đo AWB.** Kết luận "nguyên nhân là AWB trôi" dựa trên suy luận từ hai
  lần quan sát, chưa có capture chứng minh S dao động.
- **F-10 chưa đóng:** frame chỉ có ~40 % dòng mang dữ liệu. Nắp rơi vào dải dòng
  trống sẽ `n0` bất kể màu đúng.
- **Không có connected-component labeling:** mọi pixel khớp gộp vào một hộp.
- **MCU không lọc `confidence`:** `cnt = 50` → `conf = 3` vẫn được phát LoRa.

---

## 7. Việc tiếp theo

| # | Việc | Kỳ vọng |
| :---: | :--- | :--- |
| 1 | Nạp `B65114B3`, giữ nắp im ở 78 cm **30 giây** | đếm tỉ lệ `n1` — mong > 95 % |
| 2 | Cầm nắp bằng đầu ngón tay | `n1` ổn định, không `n1` giả |
| 3 | Đưa **cả bàn tay** vào khung | kỳ vọng **`n1` giả** — đây là xác nhận đối trái, không phải lỗi |
| 4 | Thử ở 3 m với nắp 10 cm | mong `n1` (sát ngưỡng) |
| 5 | Nếu `n1` vẫn chập chờn: đo bằng `373CD916` (diag rev 5) | xác định S thật |

**Không làm:** hạ `MIN_PIXELS` dưới 50 (mở lại lỗ ngón tay); hạ `hue_hi` (mất
nắp 42°); đổi ABI IF-01.
