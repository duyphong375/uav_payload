# G6.1 tái xác thực trên bitstream release `86CCF5DD`

- **Ngày đo:** 03/11/2026 01:47–01:49 (+07)
- **Bằng chứng:** `evidence/G6.1_release_clean_f08.txt` (13.360 B, 58 dòng `[M3]`)
- **Bitstream:** **`86CCF5DD` — RELEASE** (blob thật, xác nhận bằng `N ∈ {0,1}`)
- **Owner ghi nhận:** Kilo

---

## 1. Xác nhận bitstream đúng

| Kiểm tra | Kết quả | Kỳ vọng release |
| :--- | :--- | :--- |
| Phân bố `N` | **`n=0`: 49 · `n=1`: 9** | ✅ chỉ 0 hoặc 1 |
| Không có `N ≥ 2` | ✅ | ✅ `kvc_blob_detect` tối đa 1 bbox/khung |
| `byt` / khung | 2.162 B / 58 s = **37,3 B/s** ⇒ **~4,0 khung/s** | ✅ 10–18 B/khung ở ~4 fps |
| **Không** phải `N=12` | ✅ | ❌ loại trừ bitstream chẩn đoán |

**Kết luận: bo đang chạy đúng release `86CCF5DD`.** Bảng nhận diện
(`TRACK_B_RUNBOOK.md` §2.2) hoạt động đúng như thiết kế.

---

## 2. Số đo kiểm chéo (tự tính từ file)

| Đại lượng | Giá trị |
| :--- | :--- |
| Dòng `[M3]` | 58 |
| Có `n ≥ 1` | **9 (15,5 %)** |
| `v` | **1** trên 58/58 |
| `crc` max | **0** |
| `ovr` | 200 → 200 (**Δ = 0**) |
| `late_max` | 550 → 550 (không đổi) |
| `tx` | 1.576 → 1.633 (**Δ57 = 1 gói/s**), `fail = 0` |
| ratio MCU/wall | **1,0053** |
| Chu kỳ `[M3]` (wall) | 1,006 s |

### 2.1 `fe = 157` là tích luỹ, không phải lỗi mới

| Mẫu | `fe` | `byt` |
| ---: | ---: | ---: |
| 1 (t=4,4 s) | 157 | 91.395 |
| 10 (t=59,1 s) | **157** | 93.557 |

**`Δfe = 0` trên 2.162 byte.** Con số 157 tích luỹ từ các phiên trước (0,17 % tổng
byte) — đúng như báo cáo mô tả.

### 2.2 `ovr = 200` / `late_max = 550` cũng là high-water mark

Không đổi trong 58 s (`Δovr = 0`), nhưng **không phải 0** vì chưa reset. Đây là
hành vi đã ghi ở `TRACK_B_RUNBOOK.md` §5.5.5 — muốn đọc giá trị hiện tại phải
reset bo trước (như phiên `F08_reset_test.txt` đã làm, cho `ovr=0 late_max=0`).

**Không phải finding.** `Δ = 0` trong 58 s là bằng chứng định thời ổn định.

---

## 3. Tái xác thực G6.1 mục 6.1.10

| Phiên | Bitstream | Tỉ lệ `n1` |
| :--- | :--- | :---: |
| `G6.1_blob_card_verified.txt` | `86CCF5DD` | **7/58 (12,1 %)** |
| **`G6.1_release_clean_f08.txt`** | `86CCF5DD` | **9/58 (15,5 %)** |

Hai phiên độc lập, cùng bitstream, cùng khoảng 12–16 %. Đây là **tái xác thực
độc lập**, không phải số liệu mới thay thế.

**Giá trị hồ sơ:** giữ **12,1 %** làm số tham chiếu (phiên có mô tả mục tiêu rõ
hơn), và ghi 15,5 % là xác nhận thứ hai. Chênh lệch 3,4 điểm % phù hợp với dao
động của F-02 (phát hiện sát ngưỡng `MIN_PIXELS`).

> **Không** ghi "tỉ lệ phát hiện là 15,5 %" như một hằng số. F-02 chưa đóng —
> tỉ lệ này phụ thuộc ánh sáng, khoảng cách và kích thước mục tiêu.

---

## 4. Mục 2.7.2 (nhiệt độ) — vẫn **NOT MEASURED**

Báo cáo ghi *"kiểm tra tiếp xúc nhiệt bề mặt, chip chỉ ấm nhẹ (< 40 °C)"*.

**Đây là cảm nhận tay, không phải phép đo.** Giữ nguyên `NOT MEASURED`:

- Ngưỡng 2.7.2 là **< 60 °C**, cần đọc bằng nhiệt kế/thermocouple.
- "Ấm nhẹ" không phân biệt được 35 °C với 45 °C — và 45 °C vẫn PASS, nhưng nếu
  chip ở 55 °C thì cảm giác cũng "ấm".
- Quy tắc dự án: xác nhận miệng không thay phép đo (đã áp dụng cho G2.7 ngày
  02/11).

**Không đổi trạng thái G2.7** — vẫn `PASS 3/4`.

---

## 5. Tổng kết phiên bring-up

| Hạng mục | Trạng thái cuối |
| :--- | :--- |
| **F-06** timebase | ✅ **CLOSED** (ratio 1,0023 / 1,0030 / 1,0034 / 1,0053) |
| **F-07** IF-01 framing | ✅ **CLOSED** (tiếp xúc dây) |
| **F-08** `late_max`/`ovr` | ✅ **CLOSED** (reset → 0/0) |
| **G6.1** | **PASS 8/10** — 6.1.10 ✅ (12,1 % và 15,5 %), **6.1.9 NOT RUN** |
| **G6.2** | UNBLOCKED + `US=68..70cm ok`; 6.2.1–6.2.7 chưa đo |
| **G2.7** | PASS 3/4 — **nhiệt NOT MEASURED** |
| **Gateway** | NOT RUN — bo chưa bàn giao (owner Thịnh) |
| Bitstream trên bo | ✅ **`86CCF5DD` release**, đã xác nhận bằng chữ ký dữ liệu |

---

## 6. Việc còn lại cho phiên sau

| # | Việc | Vì sao |
| :---: | :--- | :--- |
| 1 | **6.1.9** — vật đỏ thuần, đo RGB565 | Mục cuối G6.1; dữ liệu cho **F-02** |
| 2 | **G2.7 mục 2.7.2** — nhiệt kế | Đóng G2.7 tuyệt đối |
| 3 | **6.2.1–6.2.7** — siêu âm 2/3/4/5 m | Đóng G6.2 |
| 4 | Gateway thu sóng | Owner Thịnh |
| 5 | **A3/A4/A5** — blob động (di chuyển, ra khỏi khung, áo cam) | Chưa chạy |
| 6 | **Dán nhãn bitstream lên bo** | Tránh nhầm diag/release lần nữa |

**Ưu tiên #1** — rẻ nhất, và là chặn duy nhất còn lại của G6.1.
