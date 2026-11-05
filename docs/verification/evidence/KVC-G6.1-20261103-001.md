# G6.1 — Nhận diện mục tiêu trên pixel thật (6.1.10) + đính chính số liệu

- **Task:** `KVC-FPGA-G6-001`
- **Ngày đo:** 03/11/2026 00:55:05 – 00:56:05 (+07)
- **Người thao tác bo:** HUMAN (Phong) & Antigravity
- **Bằng chứng:** `evidence/G6.1_blob_card_verified.txt` (91 dòng, 13.077 B)
- **Bitstream:** `86CCF5DD` (release, SRAM)
- **Firmware MCU:** `KVC-MCU-20261101-FPGA` + `KVC-MCU-TB-001`
- **Mức bằng chứng:** **`HARDWARE-VERIFIED` cho mục 6.1.10** (target → `N=1`).
  **KHÔNG** đóng toàn bộ G6.1 — xem §3.

---

## 1. Số đo kiểm chéo (tự tính từ file, không chép báo cáo)

| Đại lượng | Giá trị |
| :--- | :--- |
| Dòng `[M3]` | **58** |
| Dòng có `n ≥ 1` | **7** |
| Tỉ lệ | **12,1 %** |
| `n = 0` | 51 |
| `crc` (IF-01 CRC error) | **0** trên toàn bộ |
| `v` | **1** trên toàn bộ 58 dòng |
| `en` | 1 |
| Cửa sổ wall-clock | 57,91 s |
| Cửa sổ MCU (`t`) | 58,083 s |
| **Tỉ lệ MCU/wall** | **1,0030** (+0,30 %) |
| Chu kỳ `[M3]` (wall) | 1,016 s |
| `byt` đầu → cuối | 78.488 → **80.784** (Δ 2.296 B) |
| Tốc độ byte | 47,08 B/s ⇒ **~4,7 frame/s** (khung rỗng 10 B) |
| `fe` / `oe` / `drop` / `pend` | **0 / 0 / 0 / 0** mọi mẫu |
| `isr == byt` | ✅ 8/8 mẫu |
| LoRa `tx` | 989 → 1.047 (**Δ 58 = đúng 1 gói/s**), `fail = 0` |
| Reset | 0 |

**F-06 tái xác nhận:** ratio 1,0030 — lần thứ hai trong dải 0,98–1,02 trên một
phiên độc lập. Củng cố kết luận CLOSED.

---

## 2. Bốn điểm trong báo cáo chat KHÔNG khớp file bằng chứng

Báo cáo dẫn số từ **một phiên khác** (thấy qua `t=1080963…1112967`, `tx=916…948`,
`byt=75364`). File trên đĩa là phiên **sau** (`t=1153735…1211818`, `tx=989…1047`,
`byt=78488…80784`). Cùng kết luận định tính, khác số định lượng:

| # | Báo cáo nói | File thực tế | Ảnh hưởng |
| :---: | :--- | :--- | :--- |
| 1 | "**13 / 48 dòng (27 %)**" | **7 / 58 (12,1 %)** | Tỉ lệ phát hiện thấp hơn một nửa. Không đổi kết luận "có phát hiện", nhưng **không được** dùng 27 % làm số tham chiếu |
| 2 | "`byt = 76596 == isr`" | 78.488 → **80.784** | Số khác; tốc độ 47 B/s chứ không phải 50 |
| 3 | "`crc = 0` … **CRC `0xE260` khớp tuyệt đối**" | `crc` là **số lỗi CRC của IF-01**, không liên quan `0xE260` | **Sai bản chất** — xem §2.1 |
| 4 | "MCU/Wall = **1,0188**" | **1,0030** | Cả hai trong dải, nhưng số sai |

### 2.1 `crc0` và `0xE260` là hai thứ khác nhau

- `crc` trong `BB n? v? crc0 en1` = `bbox.crc_err_count` — **số khung IF-01 bị
  sai CRC-16**. Bằng 0 nghĩa là **không có khung nào sai**, không phải "CRC khớp
  0xE260".
- `0xE260` = `KVC_GOLDEN_GV02_CRC16` (`kvc_telemetry.h:164`) — CRC của **gói
  telemetry 32 byte IF-02**, tự kiểm **một lần lúc boot** (`ABI GV-02 … PASS`),
  không xuất hiện trong `[M3]`.

Gộp hai con số này làm một là **nhầm hai lớp giao thức**. IF-01 CRC đúng ⇒ khung
UART lành. IF-02 CRC đúng ⇒ struct 32 byte không lệch ABI. Không thể suy cái này
từ cái kia.

---

## 3. Vì sao KHÔNG đóng toàn bộ G6.1

G6.1 gồm 10 mục (`BRINGUP_CHECKLIST.md:217-228`). Trạng thái sau phiên này:

| Mục | Nội dung | Trạng thái |
| :--- | :--- | :--- |
| 6.1.1–6.1.5b | Đấu dây, VOM, nguồn, RESET, PWDN, XCLK, SCL | ✅ PASS (trước đó) |
| 6.1.6 | Đo PCLK (pin 15) bằng scope/LA | ⬜ **VẪN NOT RUN** |
| 6.1.7 | Đo VSYNC (pin 4) bằng scope/LA | ⬜ **VẪN NOT RUN** |
| 6.1.8 | `fpga_uart_capture.py` thấy khung | ✅ PASS (545 khung tích luỹ) |
| **6.1.9** | **Chụp vật đỏ thuần, đo R/G/B** | ⬜ **NOT RUN** |
| **6.1.10** | **Mục tiêu cam → `N=1`** | ✅ **PASS (HARDWARE-VERIFIED)** |

### 3.1 6.1.6 và 6.1.7 — coi như ĐƯỢC THAY THẾ

Mục đích của chúng là chứng minh camera phát PCLK/VSYNC thật. Blob sinh ra bbox
**từ pixel thật** là bằng chứng **mạnh hơn** scope: nếu thiếu PCLK/VSYNC thì
`kvc_blob_detect` không thể đếm pixel và không thể ra `N=1`.

Đề xuất ghi `SUPERSEDED (bằng chứng mạnh hơn: 6.1.10)` thay vì `NOT RUN`.
**Không** đo scope nữa — không thêm thông tin.

### 3.2 6.1.9 — KHÔNG thể thay thế, vẫn NOT RUN

Đây là phép đo **giá trị RGB565**, trả lời câu hỏi khác hẳn: *ngưỡng màu có đúng
không*. 6.1.10 chỉ chứng minh "có pixel khớp ngưỡng", **không** chứng minh ngưỡng
đúng.

Đây chính là phép đo cần cho **F-02** (ngưỡng màu quá hẹp, lấp đầy chỉ ~1 %).
Không làm 6.1.9 thì F-02 không có dữ liệu để sửa.

**Kết luận: G6.1 = `PASS 8/10`** — 6.1.6/6.1.7 superseded, **6.1.9 NOT RUN**.
Không ghi `CLOSED`.

---

## 4. `late_max` và `ovr` là high-water mark, không phải giá trị hiện tại

Quan sát của HUMAN đúng: `ovr` **đứng yên ở 317** suốt 58 s. Nhưng cần ghi rõ cơ
chế để lần sau không đọc sai:

Source `main.c:2291-2302`:

```c
uint32_t elapsed = (uint32_t)(kvc_millis() - cycle_start_ms);
if (elapsed > KVC_TELEMETRY_PERIOD_MS) {
    late_ms = elapsed - KVC_TELEMETRY_PERIOD_MS;
}
if (late_ms > cycle_late_max_ms) {
    cycle_late_max_ms = late_ms;      /* chỉ tăng, không bao giờ giảm */
}
if (late_ms > KVC_OVERRUN_TOLERANCE_MS) {
    cycle_overrun_count++;             /* chỉ tăng */
}
```

Cả hai là **cộng dồn từ lúc boot**, không reset. Vậy:

- `late_max = 552` nghĩa là **đã từng** có một chu kỳ trễ 552 ms (rất có thể lúc
  khởi động hoặc một lần siêu âm timeout) — **không** phải chu kỳ hiện tại.
- `ovr = 317` cũng là tổng từ boot.

**Hệ quả cho F-08:** đứng yên của `ovr` trong 58 s là bằng chứng **tốt** rằng
định thời đã ổn định ở trạng thái này. Nhưng để tuyên bố "F-08 hết", phải:
1. Reset bo (đưa cả hai về 0), rồi
2. Chạy đủ lâu, rồi
3. Đọc lại — nếu `ovr` vẫn 0 và `late_max` < 20 ms thì F-08 mới đóng được.

> **ĐÃ CHẠY 03/11/2026 — F-08 CLOSED.** `F08_reset_test.txt`: sau reset,
> `ovr = 0` và `late_max = 0 ms` trên **58 chu kỳ** liên tiếp. Chi tiết:
> `KVC-F08-20261103-001.md` §1.
>
> ⚠️ Phiên đó chạy trên **bitstream chẩn đoán VSYNC**, không phải release blob
> (xem cùng file §2). F-08 chỉ phụ thuộc thời gian vòng lặp MCU nên kết luận vẫn
> hợp lệ, nhưng tải UART1 thấp hơn blob thật ~12 % — đã ghi làm caveat.

---

## 5. Quan sát thêm trong file (không phải finding)

| # | Quan sát | Ghi chú |
| :---: | :--- | :--- |
| 1 | `US=22cm ok` suốt phiên (trước đó 68–162 cm) | Hợp lý: thẻ cam đặt trước ống kính có thể che luôn đầu dò siêu âm. **Không phải lỗi** |
| 2 | `IMU p=770` (pitch = 77,0°) | Board nghiêng mạnh hoặc IMU chưa hiệu chuẩn. Không ảnh hưởng phép thử blob, nhưng **không dùng số này cho georef** |
| 3 | `GNSS drop=60442` (**10,3 %** byte) | **Không tăng** trong 58 s (Δ=0) ⇒ tích luỹ từ trước. Xem §6 |
| 4 | `USND fe == byt` (21.182) | Đúng như đã ghi: `fe` của siêu âm **không phải** framing error, chỉ là TX idle LOW |

---

## 6. Việc cần làm (theo thứ tự)

| # | Việc | Đóng được gì |
| :---: | :--- | :--- |
| 1 | **6.1.9** — vật đỏ thuần, đo RGB565 | Cung cấp dữ liệu cho F-02; đóng mục cuối của G6.1 |
| 2 | **Reset bo rồi soak 10 phút** | Đóng F-08 nếu `ovr=0`, `late_max` < 20 ms |
| 3 | Điều tra GNSS `drop` | Xem có tái diễn khi `ovr=0` không |
| 4 | Stage 2/3 (cơ khí, S3-CAM) | Theo kế hoạch |

**Ưu tiên #1** — rẻ nhất, và là mục duy nhất còn thiếu của G6.1.

---

## 7. Điều KHÔNG được suy ra

| Không được nói | Vì sao |
| :--- | :--- |
| "G6.1 CLOSED toàn bộ" | 6.1.9 chưa đo — và nó là dữ liệu cần cho F-02 |
| "Tỉ lệ phát hiện 27 %" | File thực tế 12,1 % (7/58). Hai phiên khác nhau |
| "CRC 0xE260 khớp 100 %" | `crc0` là lỗi IF-01; `0xE260` là ABI IF-02 lúc boot. Khác lớp |
| "F-08 đã hết" | `late_max`/`ovr` là high-water từ boot, chưa reset |
| "Blob ổn định để nghiệm thu" | F-02 chưa đóng: lấp đầy ~1 %, sát ngưỡng `MIN_PIXELS` |
