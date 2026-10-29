# KVC — Kế hoạch bench MCU-only (không FPGA, không ESP32)

**Ngày:** 28/10/2026
**Task:** `KVC-MCU-BENCH-20261028-001`
**Owner:** phiên Kilo (model/provider: deepseek-ai/deepseek-v4.1-flash-1017, giao thức Kilo)
**Phạm vi:** `firmware/mcu_payload/**`
**Trạng thái:** `SOURCE-VERIFIED` + `BUILT` (Keil ARMCLANG V6.14: 0 Error / 8 Warning, tất cả warning là code có sẵn). **Chưa** `HARDWARE-VERIFIED` — chưa cắm bo.

---

## 0. Bối cảnh phần cứng

| Thành phần | Có trên bàn | Ghi chú |
| :--- | :---: | :--- |
| MCU Sonix SN34F788 + kit Starter V1.1 | **Có** | Nguồn qua USB hoặc J6/J5 |
| MPU-6050 (GY-87) | **Có** | I2C0: P0.10 SCL / P0.11 SDA |
| AJ-SR04M (Mode 4, đã hàn R19 47 kΩ) | **Có** | UART2 9600: P2.14 TX / P2.15 RX qua cầu 1k/2k |
| NEO-M10-0-10 GNSS | **Có** | UART3 9600: P2.0 TX / P2.1 RX |
| SX1278 Ra-02 433 MHz | **Có** (cần anten) | SPI bit-bang: P2.4..P2.9 |
| FPGA OneKiwi Primer 20K | **KHÔNG** | Chưa có RTL/top-level phát BBox |
| ESP32-C3 gateway | **KHÔNG** | Không có đường nhận RF |

**Hệ quả trực tiếp của việc thiếu FPGA:** cờ `KVC_FLAG_AI_DETECTED` luôn bằng 0, `class_id`/`confidence` luôn 0, `target_lat/lon` luôn 0, `target_x/y_local` luôn 0. Toàn bộ nhánh georef trong `main.c` **không chạy**. Vì vậy các rủi ro FW-001 (Codex, georef công bố toạ độ sai) và F4 (trần 500/800 cm) **không kích hoạt** trong buổi bench này — nhưng chúng vẫn là nợ kỹ thuật phải sửa trước khi có RTL.

---

## 1. Cấu hình Hercules

| Tham số | Giá trị | Ghi chú |
| :--- | :--- | :--- |
| Port | COM của USB-TTL nối **P0.15 (UTXD5)** | Không phải cổng nạp Keil (nạp qua SNLink) |
| Baud | **9600** | Firmware chạy 9615 bps (+0,16 %), đặt 9600 |
| Data / Parity / Stop | 8 / None / 1 | |
| Flow control | None | |
| Hiển thị | Bật `CR+LF`, `Capture to file` | Cần file thô để đối chiếu |

**Bắt buộc nối GND chung** giữa USB-TTL và kit. Thiếu GND sẽ ra ký tự rác dù mọi thứ khác đúng, và rất dễ bị chẩn đoán nhầm thành "firmware lỗi".

> Bản cũ `kvc_pinout.h` ghi UART5 là 115200 bps. **Đó là sai**; code đặt PRE=1, DLL=78 → 9615 bps. Đã sửa comment trong source ngày 28/10/2026. Đặt Hercules 115200 sẽ ra rác hoàn toàn.

---

## 2. Trình tự log kỳ vọng

```text
=== KVC-MCU-20261028 BOOT ===
[INIT] UART5 cfg=9615 8N1 (Hercules: 9600 8N1)
[INIT] LORA OK ver=0x12
[INIT] IMU OK addr=0x68
[INIT] US uart2=9600 window=250ms (Mode 4, trigger 0x01)
[INIT] GNSS baud=9600 target=9600 autobaud=on
[INIT] FPGA SKIP en=0 (khong co RTL/topmodule)
[M3] t=1234 US=142cm ok | IMU r=12 p=-3 v=1 | GNSS q1 f3 s9 hd0.85 \
     la160738520 lo1081499210 v1 yw=- sp=0 | BB n0 v0 crc0 en0 \
     | LORA d1 ver=0x12 | ovr0 tx=1/0
[RING] FPGA pend=0 drop=0 oe=0 fe=0 byt=0 isr=0
[RING] GNSS  pend=0 drop=0 oe=0 fe=0 byt=... isr=...
[RING] USND  pend=0 drop=0 oe=0 fe=... byt=... isr=... val=.. ok=.. bad=0 trg=.. raw=..
```

**Thời gian:** dòng `BOOT` phải xuất hiện **< 0,5 s** sau reset. Sáu dòng `[INIT]` tiếp theo chiếm ~250 ms (mỗi dòng ~40 ký tự @ 9615 bps). Nếu autobaud GNSS phải dò hết 5 ứng viên thì `[INIT] GNSS` có thể tới sau **11–15 s** — trong khoảng đó màn hình im lặng, **không phải treo**.

Đặt `KVC_GNSS_SKIP_AUTOBAUD=1` để boot nhanh < 5 s, chỉ khi chắc chắn module đã ở 9600.

---

## 3. Checklist đọc log

Mỗi dòng log là một phép kiểm. Cột "Nếu sai" là nơi cần kiểm tra **trước khi** nghi ngờ firmware.

### 3.1 Banner + UART5

| Dòng | Kỳ vọng | Nếu sai → kiểm tra |
| :--- | :--- | :--- |
| `=== KVC-MCU-20261028 BOOT ===` | Có, < 0,5 s | TX P0.15, GND chung, Hercules đúng COM + 9600 8N1 |
| `[INIT] UART5 cfg=9615 8N1` | Có | Như trên; nếu ra ký tự rác → đặt sai baud (115200?) |

### 3.2 LoRa SX1278

| Dòng | Kỳ vọng | Nếu sai → kiểm tra |
| :--- | :--- | :--- |
| `[INIT] LORA OK ver=0x12` | OK | — |
| `FAIL ver=0x00` | — | MISO kẹt thấp / chip mất nguồn / NSS sai |
| `FAIL ver=0xFF` | — | MISO kẹt cao / dây hở / thiếu pull-up |
| `FAIL ver=<khác>` | — | Chip khác hoặc SPI sai mode |
| `mode=DEGRADED(no_tx)` | — | Firmware vẫn chạy cảm biến, chỉ không phát. Không chặn bench |

### 3.3 IMU MPU-6050

| Dòng | Kỳ vọng | Nếu sai → kiểm tra |
| :--- | :--- | :--- |
| `[INIT] IMU OK addr=0x68` | OK | — |
| `OK addr=0x69` | Chấp nhận | GY-87 clone đặt AD0 cao; không phải lỗi |
| `FAIL err=1` | — | SDA/SCL chập mass hoặc chạm sai chân |
| `FAIL err=2` | — | Không ACK ở cả 0x68 và 0x69: mất nguồn, lỏng dây |
| `FAIL err=3` | — | Có ACK nhưng `WHO_AM_I != 0x68`: chip lạ cùng địa chỉ (DS1307/AT24C32) |
| `FAIL err=4` | — | Ghi `PWR_MGMT_1` thất bại |

### 3.4 Siêu âm AJ-SR04M

| Trường trong `[M3]` | Kỳ vọng | Nếu sai → kiểm tra |
| :--- | :--- | :--- |
| `US=xx cm ok` | 20..500 | — |
| `err/5` + `raw=6000` | **Bình thường khi board trên bàn** | Không có phản xạ. Che đầu dò bằng tay để thấy `ok` |
| `err/6` | — | Module không đáp `0x01`: TX UART2 (P2.14), nguồn 5 V, dây tín hiệu |
| `err/2` | — | Checksum sai: nhiễu đường RX, kiểm cầu phân áp 1k/2k |
| `err/3` | — | Có phản xạ nhưng > 500 cm (vượt trần tin cậy) |
| `err/4` | — | Vật cản < 20 cm (vùng mù) — bình thường |

Trong `[RING] USND`:

| Trường | Kỳ vọng | Ghi chú |
| :--- | :--- | :--- |
| `bad` | **0** | Đây là chỉ số chất lượng dữ liệu **thật** |
| `val/trg` | ≈ 1 (dao động 0,6–1) | Số khung module thật sự trả lời / số lệnh đã gửi |
| `drop` | 0 | Ring 1024 B tràn |
| `oe` | 0 | FIFO 16 B tràn |
| `fe ≈ byt` | **Chấp nhận được** | Artifact phần cứng: chân TX module LOW khi ngủ. **Không phải tiêu chí PASS** |

### 3.5 GNSS NEO-M10

| Dòng / trường | Kỳ vọng | Nếu sai → kiểm tra |
| :--- | :--- | :--- |
| `[INIT] GNSS baud=9600` | 9600 | — |
| `baud=0` | — | Autobaud thất bại ở cả 5 ứng viên: dây TX module → P2.1, nguồn module, anten |
| `q` / `f` / `s` | `q>=1`, `f=3`, `s>=5` khi có fix | Trong nhà: `q0 f1 s0..3` là **bình thường** |
| `hd` | ≤ 2.50 khi đủ tốt | `hd=na` = chưa có câu GGA |
| `v` | 1 khi 3D fix | Trong nhà `v0` — không phải lỗi |
| `yw=` | `-` khi đứng yên | Đây là hành vi đúng: course chỉ dùng khi bay ngang ≥ 0,5 knot |
| `sp=` | 0 khi đứng yên | |

### 3.6 FPGA (vắng mặt)

| Dòng / trường | Kỳ vọng | Nếu sai → kiểm tra |
| :--- | :--- | :--- |
| `[INIT] FPGA SKIP en=0` | Có | Nếu thấy `en=1` → build sai macro `KVC_FPGA_ENABLE` |
| `BB n0 v0 crc0 en0` | Đúng | `en0` nghĩa là driver không khởi tạo; `n0 v0 crc0` là **kết quả đúng**, không phải lỗi |
| `[RING] FPGA` | **toàn 0** | Khác 0 → UART1 vẫn bật ngắt: kiểm macro, pull P2.3 |

### 3.7 Vòng main

| Trường | Kỳ vọng | Nếu sai → kiểm tra |
| :--- | :--- | :--- |
| `ovr` | 0 | `>0` = khối xử lý vượt 1 s. Kiểm thời gian US (250 ms) + TX (300 ms) + I2C |
| `tx=ok/fail` | `ok` tăng 1/giây, `fail=0` | `fail>0` = gói không ra anten: brown-out 3 V3 khi phát, SPI lỏng. Xem `ver=` cùng dòng |
| `d1` | 1 | `d0` = degraded mode |

---

## 4. Ba phép thử chủ động

Ngoài việc nhìn log, chủ động kích thích để chứng minh đường dữ liệu sống:

1. **Che/mở đầu dò siêu âm.** `US` phải chuyển `ok` → `err/5` (`raw=6000`) → `ok`. Chứng minh FSM + cửa sổ nghe 250 ms hoạt động, không phải chỉ "im lặng may mắn".
2. **Nghiêng board ±30°.** `IMU r/p` phải thay đổi tương ứng và **không nhảy** quá ~3°/mẫu (nhờ EMA 1/4). Nếu nhảy mạnh → nhiễu cơ học/nguồn. Nếu board nằm phẳng mà `r`/`p` ≈ ±130° → sai ánh xạ trục (kiểm hướng gắn module), **không** phải lỗi bộ lọc.
3. **Đặt cạnh cửa sổ 60 s.** `s` phải tăng dần, `v` chuyển 1. Nếu `isr=0` → dây RX3 đứt. Nếu `fe≈byt` lớn → sai baud.

> **An toàn:** không phát LoRa khi chưa gắn anten. PA +14 dBm vào hở có thể hỏng SX1278. Nếu chưa có anten, tháo module — firmware nhận `ver=0x00/0xFF` và vào degraded mode, vẫn log đủ cảm biến.

---

## 5. Bảng ghi kết quả (điền vào khi bench)

```
Ngày/giờ:
Commit SHA:                  (git rev-parse HEAD)
KVC_FW_ID trong log:         KVC-MCU-20261028
Keil build:                  __ Error / __ Warning
Thời gian từ reset đến dòng BOOT:        __ s
Thời gian từ reset đến [M3] đầu tiên:    __ s

[INIT] LORA:    OK / FAIL ver=____
[INIT] IMU:     OK addr=____ / FAIL err=____
[INIT] GNSS:    baud=____ (0 = autobaud thất bại)
[INIT] FPGA:    en=____

Sau 60 giây:
  US ok / err:        ____ / ____   (mã lỗi gặp: ____)
  USND bad / val / trg:  ____ / ____ / ____
  IMU v:              ____  (r=____  p=____)
  GNSS v / s / hd:    ____ / ____ / ____
  FPGA en / n / v / crc: ____ / ____ / ____ / ____
  ovr:                ____
  tx (ok/fail):       ____ / ____
  [RING] GNSS drop/oe/fe/byt/isr: ____ / ____ / ____ / ____ / ____
  [RING] USND drop/oe/fe/byt/isr: ____ / ____ / ____ / ____ / ____

Phép thử chủ động:
  [ ] Che đầu dò US: ok -> err/5 -> ok
  [ ] Nghiêng ±30 độ: r/p thay đổi, không nhảy > 3 độ/mẫu
  [ ] Cạnh cửa sổ 60 s: s tăng, v=1

KẾT LUẬN:  PASS / FAIL / NOT RUN
Ghi chú:
```

---

## 6. Tiêu chí PASS cho buổi bench này

Buổi bench **không** nghiệm thu chuỗi RF (không có gateway) và **không** nghiệm thu georef (không có FPGA). Tiêu chí đúng cho phạm vi này:

| # | Tiêu chí | Bắt buộc |
| :---: | :--- | :---: |
| 1 | Dòng `BOOT` xuất hiện < 0,5 s sau reset | **Có** |
| 2 | 6 dòng `[INIT]` xuất hiện, mỗi dòng < 0,3 s | **Có** |
| 3 | `[INIT] LORA` có `ver=0x12` (hoặc ghi rõ degraded nếu tháo module) | **Có** |
| 4 | `[INIT] IMU` = `OK addr=0x68` hoặc `0x69` | **Có** |
| 5 | `[INIT] GNSS baud=9600` (hoặc ghi rõ `0` + nguyên nhân) | **Có** |
| 6 | `[RING] FPGA` **toàn 0** trong 60 s | **Có** |
| 7 | `USND bad=0` và `val/trg ≥ 0,6` trong 60 s | **Có** |
| 8 | `US` có ít nhất một mẫu `ok` khi che/mở đầu dò | **Có** |
| 9 | `IMU v=1` và `|r|,|p| < 5°` khi board nằm phẳng | **Có** |
| 10 | `ovr=0` trong 60 s | **Có** |
| 11 | `tx` tăng đúng 1/giây, `fail=0` (khi có anten) | Nếu có anten |
| 12 | GNSS `v=1`, `s>=5`, `hd<=2.50` | Ngoài trời, tuỳ điều kiện |

**Không dùng** `fe=0` làm tiêu chí (xem §3.4). **Không dùng** "thấy `[M3]` là PASS" — phải đối chiếu từng trường.

---

## 7. Giới hạn đã biết của buổi bench

| Giới hạn | Ảnh hưởng | Xử lý |
| :--- | :--- | :--- |
| Không có FPGA/RTL | `AI_DETECTED` luôn 0, georef không chạy, toạ độ mục tiêu luôn 0 | Đúng thiết kế với `KVC_FPGA_ENABLE=0`. Không kết luận gì về georef từ buổi này |
| Không có ESP32 | `tx` chứng minh gói ra anten, **không** chứng minh ai nhận | Chỉ số `tx` là nửa phép đo; nửa còn lại cần gateway |
| Không có gateway | Không kết luận được mất gói | Ghi `tx=ok/fail`, để dành đối chiếu khi có ESP32 |
| `fe ≈ byt` trên 3 cổng | Không ảnh hưởng dữ liệu | Dùng `bad`, `val/trg`, `crc` làm chỉ số chất lượng |
| Time base IHRC ±2 % | `timestamp_ms` trôi tới 2 % (1,2 s/phút) | Chấp nhận; muốn ppm phải hiệu chuẩn 1PPS |
| Autobaud GNSS 11–15 s | Boot chậm, dễ tưởng treo | Xem §2; có thể `KVC_GNSS_SKIP_AUTOBAUD=1` |
| Retry IMU mỗi 10 chu kỳ | Cắm lại dây phải chờ tới 10 s mới nhận | Đúng thiết kế (giảm tải bit-bang); không phải lỗi |

---

## 8. Tài liệu liên quan

| Tài liệu | Dùng để |
| :--- | :--- |
| [MCU_BUILD_KEIL.md](../configuration/MCU_BUILD_KEIL.md) | Build + bảng macro biên dịch |
| [KVC_MASTER_PINOUT_WIRING.md](../hardware/wiring/KVC_MASTER_PINOUT_WIRING.md) | Đấu dây, mức logic, ghi chú pull |
| [IF_MCU_SENSORS.md](../interfaces/IF_MCU_SENSORS.md) | Ngưỡng GNSS, đặc tả cảm biến |
| [IF_FPGA_MCU_UART.md](../interfaces/IF_FPGA_MCU_UART.md) | IF-01 khi có FPGA/mock |
| [KVC_PHAN_CONG_2_NGUOI.md](../planning/KVC_PHAN_CONG_2_NGUOI.md) | Phân công, tiến độ, giới hạn |
