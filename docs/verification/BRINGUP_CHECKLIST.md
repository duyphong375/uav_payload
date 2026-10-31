# KVC — Checklist bring-up FPGA trên kit OneKiwi Primer 20K

- **Ngày tạo:** 31/10/2026
- **Mục đích:** chạy tuần tự khi có kit, không phải suy nghĩ lại
- **Bằng chứng thu được:** log + ảnh, lưu vào `review/` hoặc `docs/verification/evidence/`
- **Trạng thái hiện tại:** tất cả mục đều `NOT RUN` — chưa có kit

> **Không được đánh dấu PASS nếu chưa có log/ảnh.** Mỗi bước ghi rõ ngưỡng đạt.

---

## Chuẩn bị trước khi cắm bất cứ thứ gì

| # | Việc | Dụng cụ | Ngưỡng đạt | Kết quả |
| ---: | :--- | :--- | :--- | :--- |
| 0.1 | Đo đầu ra LM2596 **khi chưa nối tải** | VOM | 5,0 V ± 0,1 | ⬜ |
| 0.2 | Đo ripple LM2596 có tải (nối trở 10 Ω 5 W) | Oscilloscope hoặc VOM AC | < 100 mV | ⬜ |
| 0.3 | Kiểm tra module USB-UART là loại **3,3 V** | Nhìn jumper/nhãn | Jumper ở 3V3, không phải 5V | ⬜ |
| 0.4 | Kiểm tra có **GND chung** giữa LM2596, FPGA, USB-UART | VOM thông mạch | < 1 Ω | ⬜ |
| 0.5 | Chụp ảnh module camera, đọc marking sensor | Điện thoại | Xác nhận OV2640 (không phải OV5640) | ⬜ |

**Nếu 0.1 hoặc 0.2 fail → DỪNG.** Không cắm FPGA.

Ghi chú: nếu ripple > 100 mV, thêm 470 µF electrolytic + 10 µF ceramic tại đầu vào bo.

---

## G2 — Bitstream và UART

### G2.1 Nạp bitstream

| # | Việc | Ngưỡng đạt | Kết quả |
| ---: | :--- | :--- | :--- |
| 2.1.1 | Kết nối JTAG (USB blaster) | Thiết bị nhận diện | ⬜ |
| 2.1.2 | Nạp `KVC_PR/impl/pnr/KVC_FPGA.fs` | Không lỗi | ⬜ |
| 2.1.3 | Quan sát LED sau khi nạp | `led_uart_busy` nhấp nháy ~200 Hz (mock) | ⬜ |
| 2.1.4 | Đo nhiệt FPGA sau 2 phút | < 45 °C (không nóng bất thường) | ⬜ |

**Nếu 2.1.3 không nhấp nháy:** kiểm tra `TopModule` có đúng `kvc_top_demo` không, và bitstream có phải bản mới (mtime sau commit `dbcb83d`).

### G2.2 Kiểm UART bằng USB-UART (chưa nối MCU)

| # | Việc | Ngưỡng đạt | Kết quả |
| ---: | :--- | :--- | :--- |
| 2.2.1 | Nối **chỉ RX** của USB-UART vào `R13` (J2 pin 11). **Không nối TX.** | — | ⬜ |
| 2.2.2 | Mở Hercules/TeraTerm: 38.400, 8N1, HEX display | — | ⬜ |
| 2.2.3 | Quan sát dữ liệu | Chuỗi bắt đầu `5A A5 01 02`, lặp lại | ⬜ |
| 2.2.4 | Lưu capture ra file | `capture_01.hex` | ⬜ |
| 2.2.5 | Chạy parser: `python scripts/manual/fpga_uart_capture.py --file capture_01.hex` | exit 0, "PASS" | ⬜ |

**Chẩn đoán nếu 2.2.3 sai:**

| Hiện tượng | Nguyên nhân | Xử lý |
| :--- | :--- | :--- |
| Không có dữ liệu | Chưa nạp bitstream / sai chân / thiếu GND | Kiểm 2.1.2, đo `R13` bằng VOM |
| Ra `B4 4A` thay `5A A5` | Bitstream cũ (start bit 2 bit-time) | Nạp lại `.fs` mới |
| Ra ký tự rác, không có `5A` | Baud sai | Kiểm 38.400, kiểm USB-UART loại 3,3 V |
| `5A A5` nhưng CRC sai | Endianness hoặc bitstream cũ | Nạp `.fs` mới |

### G2.3 Kiểm timestamp đơn vị ms

| # | Việc | Ngưỡng đạt | Kết quả |
| ---: | :--- | :--- | :--- |
| 2.3.1 | Chạy parser, đọc dòng "FPS do được" | ≈ 200 FPS (mock `MOCK_DIV=500_000` @ 100 MHz) | ⬜ |
| 2.3.2 | Đọc dòng "Timestamp" | TĂNG DẦN OK, dt trung bình ≈ 5 ms | ⬜ |

**Nếu FPS ≈ 0,02 (dt ≈ 5000 ms):** timestamp vẫn đang đếm tick 100 MHz, chưa chia `MS_DIV`. Kiểm bitstream.

**Nếu FPS rất thấp (< 50):** nghẽn UART — kiểm `MAX_BBOX` có bị override > 12 không.

### G2.4 Nối MCU Sonix

| # | Việc | Ngưỡng đạt | Kết quả |
| ---: | :--- | :--- | :--- |
| 2.4.1 | Nối `R13` → MCU `P2.3` (URXD1), `R12` → `P0.12` (DATA_READY), GND chung | — | ⬜ |
| 2.4.2 | Nạp firmware MCU có `KVC_FPGA_ENABLE=1` | Build OK | ⬜ |
| 2.4.3 | Mở log UART debug MCU, đọc dòng `[RING] FPGA` | `byt` tăng đều | ⬜ |
| 2.4.4 | Đọc `fe` (framing error) | **= 0** | ⬜ |
| 2.4.5 | Đọc `crc` (CRC error) | **= 0** | ⬜ |
| 2.4.6 | So `rx_frame_count` MCU với số frame parser đếm được | Chênh < 2 % | ⬜ |

**Nếu 2.4.5 fail (`crc > 0`):** sai số baud phía MCU (~4,34 % tính ở P5). Thử hạ về 19.200 và chấp nhận ~15 FPS.

### G2.7 Soak test

| # | Việc | Ngưỡng đạt | Kết quả |
| ---: | :--- | :--- | :--- |
| 2.7.1 | Chạy liên tục 30 phút, log mỗi 60 s | 0 reset, 0 tràn ring | ⬜ |
| 2.7.2 | Đo nhiệt FPGA cuối soak | < 60 °C | ⬜ |
| 2.7.3 | Đo FPS cuối soak | Không giảm > 5 % so với đầu | ⬜ |

---

## G6 — Camera và siêu âm

### G6.1 Camera

| # | Việc | Ngưỡng đạt | Kết quả |
| ---: | :--- | :--- | :--- |
| 6.1.1 | Cắm camera vào Header J1 pin 5–20 theo `KVC_MASTER_PINOUT_WIRING.md` §3.5.1 | Đúng 14 chân | ⬜ |
| 6.1.2 | Quan sát `led_camera_ok` | Sáng đều (không nhấp nháy bất thường) | ⬜ |
| 6.1.3 | Chụp vật đỏ thuần trước ống kính | R > 0xF000, G/B < 0x2000 (nếu đọc được pixel) | ⬜ |
| 6.1.4 | Kiểm `frame_counter` vs 640×480 | Khớp 100 % | ⬜ |

**Nếu 6.1.2 không sáng:** kiểm 14 chân, kiểm `PCLK` (chân A14) có xung bằng scope.

**Nếu ảnh sai màu:** `ov2640_config` có thể chưa đúng RGB565 (`0xDA`), cần đo màu thật rồi sửa.

### G6.2 Siêu âm

| # | Việc | Ngưỡng đạt | Kết quả |
| ---: | :--- | :--- | :--- |
| 6.2.1 | Đặt board trên cột, cách mặt nước tĩnh **2,0 m**, đo 50 mẫu | `frame_ok` ≥ 98 % | ⬜ |
| 6.2.2 | Lặp ở **3,0 m** | `frame_ok` ≥ 98 % | ⬜ |
| 6.2.3 | Lặp ở **4,0 m** | `frame_ok` ≥ 95 % | ⬜ |
| 6.2.4 | Lặp ở **5,0 m** | `frame_ok` ≥ 90 % | ⬜ |
| 6.2.5 | Đo sai số khoảng cách so với thước | < 2 cm trong 0,5–5,0 m | ⬜ |
| 6.2.6 | Đo trên mặt nước gợn nhẹ ở 3,0 m | `frame_ok` ≥ 80 % | ⬜ |
| 6.2.7 | Ghi bảng kết quả vào `docs/verification/USOUND_CALIBRATION_5M.md` | Có bảng đầy đủ | ⬜ |

**Nếu 6.2.x fail ở mọi khoảng cách:** kiểm `KVC_USOUND_MAX_FRAME_MM` = 8000, `TIMEOUT_MS` = 350, đã nạp firmware mới.

### G6.3 Hiệu chuẩn `fx_px`

| # | Việc | Ngưỡng đạt | Kết quả |
| ---: | :--- | :--- | :--- |
| 6.3.1 | In bàn cờ 9×6 ô, mỗi ô 25 mm, dán phẳng | — | ⬜ |
| 6.3.2 | Chụp 15–20 ảnh bằng chính OV2640 ở nhiều góc | File ảnh lưu được | ⬜ |
| 6.3.3 | Chạy `cv2.calibrateCamera` | Reproj error < 0,5 px | ⬜ |
| 6.3.4 | Ghi `fx_px`, `cx_px`, `cy_px` thật | Sai khác so với 554/320/240 được ghi rõ | ⬜ |
| 6.3.5 | Cập nhật `firmware/mcu_payload/inc/kvc_georef.h:80-82` | — | ⬜ |
| 6.3.6 | Nạp lại firmware MCU, đo lại georef tĩnh | Sai số < 0,5 m @ 3 m | ⬜ |

**Đây là bước quan trọng nhất trong G6.** `fx_px = 554` là giả định HFOV 60°; nếu OV2640 thực tế 56° hoặc 64°, toạ độ sai 6–7 % ở mọi khoảng cách và không test nào phát hiện được.

---

## Bảng ghi kết quả

Sao chép và điền khi chạy:

```text
Ngày giờ: ______________
Kit: OneKiwi Primer 20K V1.1, serial ______________
Bitstream: KVC_FPGA.fs, sha256 ______________
Firmware MCU: ______________

G2.1 Nạp bitstream     : PASS / FAIL   ghi chú: ______________
G2.2 UART (USB)        : PASS / FAIL   frame/s = ____
G2.3 Timestamp ms      : PASS / FAIL   dt tb = ____ ms
G2.4 MCU nhận          : PASS / FAIL   fe = ____ crc = ____
G2.7 Soak 30 min       : PASS / FAIL   reset = ____
G6.1 Camera            : PASS / FAIL   frame_ok = ____ %
G6.2 Siêu âm 3 m       : PASS / FAIL   frame_ok = ____ %
G6.3 fx_px             : PASS / FAIL   đo được = ____
```

---

## Điều không được làm

| Việc | Lý do |
| :--- | :--- |
| Cắm FPGA trước khi đo nguồn (0.1, 0.2) | Ripple lớn gây reset ngẫu nhiên, mọi kết quả sau đó không tái lập |
| Dùng USB-UART loại 5 V | Đẩy 5 V vào chân FPGA 3,3 V → hỏng IO |
| Nối MCU trước khi kiểm UART bằng USB-UART | Không phân biệt được lỗi FPGA hay lỗi MCU |
| Đánh dấu PASS khi chưa có log | Vi phạm `AGENTS.md` |
| Dùng `fx_px = 554` mà không đo | Sai toạ độ hệ thống 6–7 % |
| Bật `USE_MOCK_BBOX=0` khi chưa viết lại `kvc_yolo_top` | Build fail `EX3937` |

---

## Sau khi hoàn thành

| Gate | Bằng chứng cần lưu | Cập nhật tài liệu |
| :--- | :--- | :--- |
| **G2** | `capture_01.hex` + log `[RING] FPGA` + ảnh LED | `IF_FPGA_MCU_UART.md` → `HARDWARE-VERIFIED` |
| **G6** | Bảng đo siêu âm + ảnh capture + tham số camera | `IF_MCU_SENSORS.md`, `IF_CAMERA_FPGA.md` → `HARDWARE-VERIFIED` |

Chỉ sau khi cả hai gate PASS mới được tuyên bố hệ thống hoạt động trên phần cứng thật.
