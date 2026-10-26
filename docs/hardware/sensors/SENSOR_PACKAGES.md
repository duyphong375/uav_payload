# Danh mục datasheet cảm biến KVC

> Các file PDF trong thư mục này **bị Git ignore** (`docs/hardware/sensors/**/*.pdf`)
> vì chưa xác minh quyền phân phối lại. Đây là bản dùng cục bộ để đối chiếu driver.
> Clone mới phải tải lại theo URL ở cột "Nguồn" và **đối chiếu SHA-256** trước khi dùng.

Cập nhật: 26/10/2026.

---

## 1. Linh kiện ĐANG dùng trong firmware

### 1.1. Siêu âm AJ-SR04M (board xanh, pad `R19`)

| File | Tài liệu | Phiên bản | Bytes | SHA-256 |
| :--- | :--- | :--- | ---: | :--- |
| `aj_sr04m/AJ-SR04M-TX_UsersGuide_ShenzhenAnji.pdf` | User's Guide (bản gốc hãng) | Không ghi rev | 2.027.639 | `D5395F247E8222260683106AE834C41F95CDBDFC83D7D93A76A830D236A8993E` |
| `aj_sr04m/AJ-SR04M_Datasheet_Probots_vA_P001.pdf` | Datasheet, doc `#P001` | Version A | 2.667.748 | `D745C13858F5570DB265B8ABE8D0A90247D7F0B94720829484E1CAC5D5191DB5` |

Nguồn: bản Anji lấy từ GitHub `tomaskovacik/kicad-library`; bản Probots từ
`probots.co.in`. **Bản Probots là bên thứ ba** (ghi "ProMax"), không phải hãng.

**Khác biệt đã biết giữa hai bản — quan trọng:**

| Nội dung | Bản Anji | Bản Probots |
| :--- | :--- | :--- |
| Bảng điện trở chọn mode | **Không có** | Có (R19: 300k/120k/47k/0Ω) |
| Công thức checksum | Ghi `H+DATA + L_DATA` nhưng ví dụ khung là `FF 07 A1 A7` | Ghi `0xFF + H + L` |

→ Khi hai bản mâu thuẫn, **khung mẫu** là bằng chứng mạnh hơn công thức viết tay.
Khung `FF 07 A1 A7` chỉ khớp `0xFF + 0x07 + 0xA1 = 0xA7`. Firmware dùng công thức này.

### 1.2. IMU GY-87 — chỉ dùng MPU-6050

| File | Tài liệu | Phiên bản | Bytes | SHA-256 |
| :--- | :--- | :--- | ---: | :--- |
| `mpu6050/PS-MPU-6000A-00_Rev3.3_ProductSpec.pdf` | Product Specification | **Rev 3.3**, 16/05/2012 | 1.958.783 | `EDC9AD691B4866CF71337FB773A006F97D57299778CDE2E752DEF96B44ACF305` |
| `mpu6050/RM-MPU-6000A-00_RegisterMap.pdf` | Register Map and Descriptions | Rev 4.0 | 665.861 | `CCAA6312B9D86A9DA79E26E511101E1150DC85A48255600010A854369CF7C05D` |

Nguồn: DFRobot CDN (bản InvenSense gốc) và SparkFun CDN.

**Giá trị dùng trong driver, đã đối chiếu datasheet:**

| Thông số | Datasheet | Code |
| :--- | :--- | :--- |
| `WHO_AM_I` (reg 117 / `0x75`) | **`0x68`** cố định | ⚠ xem mục 4 |
| Accel sensitivity `AFS_SEL=0` (±2 g) | **16.384 LSB/g** | 16384 (chỉ dùng để kiểm tra khác 0) |
| Gyro sensitivity `FS_SEL=0` (±250 °/s) | **131 LSB/(°/s)** | không dùng (chưa đọc gyro) |
| `DLPF_CFG=3` | Accel BW **44 Hz**, delay 4,9 ms; Gyro BW **42 Hz** | `CONFIG=0x03` ✔ |
| Sample rate | `Rate = 1 kHz / (1 + SMPLRT_DIV)` | `SMPLRT_DIV=7` → 125 Hz ✔ |

### 1.3. GNSS — module `NEO-M10-0-10` (bo YXT-100-M10, chip `UBX-M10050-KB`)

| File | Tài liệu | Phiên bản | Bytes | SHA-256 |
| :--- | :--- | :--- | ---: | :--- |
| `neo_m10/YXT-100-M10_GNSS_Module_Datasheet_v1.00_Mar2022.pdf` | **Data Sheet của đúng module** | **Ver 1.1** (03/2020, sửa 06/2022) | 1.913.673 | `D9DC055AAD4076071E4B0BF1286210F756E57609A23D30195A778F0F71E98E8F` |
| `ublox_m10/MAX-M10N-10B_DataSheet_UBXDOC-304424225-18248.pdf` | Data sheet chip cùng dòng (tham chiếu phụ) | `UBXDOC-304424225-18248` | 1.528.975 | `FA0C3631D247C69D71251842DE241F28401BAFBBE355CACC5E785A7DA9DF4089` |

Nguồn bản chính: link "Tài liệu hỗ trợ" của Nshop (nhà bán module tại VN) →
MediaFire `YXT-100GNSS模块规格书.pdf`. Bản này **không phải** tài liệu u-blox;
nó là datasheet của **nhà đóng gói** (YXT / "卫星物联 助力北斗"), mô tả bo
G-MOUSE dùng chip u-blox.

> [!IMPORTANT]
> **Đính chính các kết luận trước (ghi ngày 26/10/2026):**
>
> 1. `NEO-M10-0-10` **là hàng thật**, không phải bo trôi nổi không tên. Marking
>    trên module (ảnh người dùng) in rõ `NEO-M10-0-10`; JLCPCB có mã
>    `C19725851`, đóng gói **LCC-24 16,3 × 12,2 mm**. Đây là module OEM mà
>    u-blox **không** niêm yết công khai trên website (`/en/product/neo-m10-series`
>    trả 404 — đúng, nhưng không có nghĩa sản phẩm không tồn tại).
> 2. Datasheet `MAX-M10N` **không dùng được** cho thông số cơ/điện của module
>    này: MAX-M10N là LCC 10,1 × 9,7 mm, còn `NEO-M10-0-10` là 16,3 × 12,2 mm.
>    Chỉ dùng nó để đối chiếu hành vi cấp chip.
> 3. **Baud mặc định của module là 38400, không phải 9600.** Datasheet dòng 4
>    ghi: `波特率 4800bps-921600bps (默认38400bps)`.

**Giá trị dùng trong driver, đối chiếu datasheet module (YXT-100-M10):**

| Thông số | Datasheet | Code hiện tại |
| :--- | :--- | :--- |
| Chip | `UBLOX-M10050-KB` | ✔ khớp |
| Baud mặc định | **4800–921600, mặc định 38400** | ✘ code đặt 9600 |
| Nguồn | **3,3–5 V** (min 3.3 / typ 5 / max 5.5) | ✔ 5 V |
| Dòng | 28 / **30** / 32 mA | — |
| Mức logic | TTL (V_IO theo nguồn) | ✔ 3,3 V |
| Cập nhật | 0,25–10 Hz, **mặc định 1 Hz** | — |
| Chòm sao | `GPS L1 C/A, GLONASS L1 C/A, BDS B1I/B1C, GALILEO E1 B/C, SBAS L1, QZSS L1 C/A` | **4 chòm + QZSS/SBAS** (không phải 3) |
| Tiền tố NMEA | tài liệu mẫu dùng **`GPGGA`/`GPRMC`** (không phải `GNGGA`) | parser chấp nhận cả hai ✔ |
| Kích thước | 30 × 20 × 3,6 mm | — |

**Quan trọng — tiền tố NMEA:** datasheet của module in ví dụ `$GPGGA` và
`$GPRMC` (đếm 5 lần mỗi loại, **không** có `GNGGA`). Parser hiện tại nhận diện
theo hậu tố 3 ký tự (`GGA`/`GSA`/`RMC`) nên chấp nhận cả `GP…` và `GN…` — đúng.
Nhưng nếu ai đó "tối ưu" thành so khớp `GNGGA` cứng thì sẽ hỏng với module này.

**Về baud — phân tích lại đầy đủ:**

| Baud | DLL | Thực tế @12 MHz | Sai số chia tần | + IHRC ±2 % | Kết luận |
| ---: | ---: | ---: | ---: | ---: | :--- |
| 9600 | 78 | 9615 | +0,16 % | 2,16 % | an toàn |
| 19200 | 39 | 19231 | +0,16 % | 2,16 % | an toàn |
| **38400** | **20** | **37500** | **−2,34 %** | **4,34 %** | **vượt 3,125 %** |
| 57600 | 13 | 57692 | +0,16 % | 2,16 % | an toàn |

User Manual MCU §15.6 ghi giới hạn hợp lệ: `Deviation < |3.125 %|`.
Nhưng đây là **giới hạn của MCU**, không phải của module. Theo datasheet module,
UART chấp nhận 4800–921600 nên nó không siết thêm.

→ Kết luận: **không thể chạy 38400 ở UCLK 12 MHz** (4,34 % > 3,125 %). Firmware
giải quyết bằng cách **dò tốc độ lúc khởi động** rồi đưa module về 9600:

`kvc_gnss_autobaud()` (`firmware/mcu_payload/src/sensors/kvc_gnss_neo_m10.c`)
thử lần lượt `{38400, 9600, 19200, 57600, 4800}`. Với mỗi tốc độ, nó chờ tối đa
1200 ms để nhận **2 câu NMEA có checksum đúng** (tiêu chí: ở sai baud, byte nhận
là rác nên gần như không câu nào qua checksum). Tốc độ nào đạt trước thì chọn,
rồi gửi `UBX CFG-PRT` đưa module về `KVC_GNSS_BAUD_RATE` (9600).

Nhờ vậy **không cần u-center** và không cần biết trước module đang ở tốc độ nào,
miễn là nằm trong danh sách và MCU chia được với sai số <3,125 %.

Không thử 115200: tại 12 MHz divisor 7 cho 107143 bps (−6,99 %), vượt giới hạn
nên dù nhận ra cũng không giao tiếp ổn định được.

Thời gian xấu nhất: 5 × 1200 ms = **6 s** khi không tìm thấy tốc độ nào. Chấp
nhận được vì đây là lúc khởi động và watchdog chưa bật (`kvc_wdt_init()` gọi sau
khi init xong). Không tìm ra tốc độ nào thì firmware **vẫn mở UART3 ở 9600** và
chạy tiếp — `[RING] GNSS isr=0` là dấu hiệu cần kiểm tra dây/anten.

**Lệnh đổi baud có sẵn trong datasheet module** (§10.3), đã kiểm checksum:

| Baud | Payload (hex) | Checksum |
| ---: | :--- | :--- |
| 9600 | `B5 62 06 00 14 00 01 00 00 00 D0 08 00 00 80 25 00 00 07 00 07 00 00 00 00 00` | `A6 CD` ✔ |
| 38400 | `B5 62 06 00 14 00 01 00 00 00 D0 08 00 00 00 96 00 00 07 00 07 00 00 00 00 00` | `97 A8` ✔ |
| 115200 | `B5 62 06 00 14 00 01 00 00 00 D0 08 00 00 00 C2 01 00 07 00 07 00 00 00 00 00` | `C4 96` ✔ |

(Đã giải mã lại bằng script: `portID=1`, `mode=0x08D0`, `inProto=outProto=0x07`,
giá trị baud đúng từng lệnh, checksum Fletcher khớp.)


### 1.4. LoRa SX1278 (module Ra-02)

| File | Tài liệu | Phiên bản | Bytes | SHA-256 |
| :--- | :--- | :--- | ---: | :--- |
| `sx1278/SX1276-7-8-9_Datasheet_Rev4_Mar2015.pdf` | Datasheet | **Rev. 4, 03/2015** | 3.268.248 | `6C24C19EE54309633D4A9057BB8663D1AACDB7F456BEBCC6973728A07BD7854E` |

Nguồn: Adafruit CDN (bản Semtech gốc).

---

## 2. Linh kiện có trên module nhưng KHÔNG dùng

| Linh kiện | Trạng thái | Datasheet |
| :--- | :--- | :--- |
| HMC5883L / QMC5883L (la bàn) | **Hoãn** — cần hiệu chuẩn hard/soft iron trên kit | Chưa lưu |
| BMP180 (áp suất) | **Loại bỏ** khỏi thiết kế | Chưa lưu |

Xem `docs/interfaces/IF_MCU_SENSORS.md` §3.2 B–C.

---

## 3. Board tham chiếu (không phải linh kiện của KVC)

`jsn_sr04t/JSN-SR04T-2.0_Datasheet.pdf` (178.730 B,
`2B31BC3E17E80EAE50A3FAEF048BEF16B8FE3EF10FB83FE42D72E08B11783DF9`) chỉ lưu để
phân biệt với AJ-SR04M: hai board **cùng 4 byte khung nhưng khác cách chọn mode**.

| | AJ-SR04M (KVC dùng) | JSN-SR04T-2.0 |
| :--- | :--- | :--- |
| Pad | **`R19`** | `R27` |
| 47 kΩ | **Mode 4** — ngủ, đo khi nhận `0x01` | Mode 2 — tự phát 100 ms |
| 120 kΩ | Mode 3 — tự phát 100 ms | Mode 3 — đo khi nhận `0x55` |

---

## 4. Việc còn phải làm (chưa xác minh được nếu không có kit)

1. **`WHO_AM_I`**: datasheet khẳng định giá trị cố định `0x68`. Hiện firmware chỉ loại
   `0x00`/`0xFF` mà không so `== 0x68`, nên một chip I2C khác cùng địa chỉ (ví dụ
   DS1307, AT24C32 trên nhiều module GY-87 "clone") sẽ được chấp nhận nhầm.
   Cần sửa và cần xác minh trên bo thật.
2. **Timeout Mode 4**: datasheet Anji **không ghi** thời gian đáp ứng của Mode 4.
   Firmware chờ tối đa 100 ms (`kvc_usound_measure`). Đo xa 5–6 m có thể cần lâu hơn.
   Chỉ xác minh được bằng kit + logic analyzer.
3. **Dải đo**: datasheet ghi 20–800 cm; firmware giới hạn 500 cm theo yêu cầu tải UAV.
   Đây là lựa chọn thiết kế, không phải lỗi.
4. **Baud module GNSS thực tế**: bo breakout có thể đã bị đổi tốc độ bằng u-center.
   Datasheet chỉ nói mặc định 9600. Chỉ xác minh bằng kit.
