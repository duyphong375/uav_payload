# Đặc tả giao diện: MCU Tải Sonix ↔ Cảm biến Định vị (Siêu âm AJ-SR04M, IMU, GNSS)

- **Mã giao diện:** `IF-00`
- **Hai đầu kết nối:** MCU Sonix SN34F788 trên UAV (**Nguyễn Tá Duy Phong** - Xử lý phần mềm) ↔ Cụm cảm biến tải (**Đàm Nguyễn Mạnh Cường** - Lắp đặt & đo đạc; **Trương Trung Kiên** - Nguồn & dây)
- **Trạng thái:** `BASELINE DESIGN` (Theo mục III và IV.2 [KVC_ThietKeHeThong.md](../architecture/KVC_ThietKeHeThong.md))

---

## 1. Quy tắc an toàn điện và nguồn (Bắt buộc tuân thủ)

> ⚠️ **CẢNH BÁO CHỐNG CHÁY CHIP SONIX:**
> 1. Vi điều khiển Sonix SN34F788 hoạt động ở dải điện áp **VDD = 2,4 V – 3,6 V (Chuẩn 3,3 V)**. Các chân GPIO của chip **KHÔNG chịu được mức điện áp 5 V**. Tuyệt đối không cắm nguồn 5 V trực tiếp vào chân GPIO của Sonix (chân TX của module cảm biến nếu có mức 5V cần dùng cầu phân áp hoặc chọn mức 3.3V).
> 2. **Nối chung GND (Ground):** Toàn bộ dây GND của Kit Sonix, AJ-SR04M, GY-87, bo GNSS u-blox M10 và nguồn hạ áp Buck DC-DC phải được nối chung với nhau để tạo mốc điện áp chuẩn.
> 3. Cụm cảm biến và MCU tải phải dùng nguồn từ mạch Buck hạ áp riêng (cấp dòng tối thiểu 2 A), **không dùng chân 3.3V của mạch nạp SN-Link hoặc mạch nạp CP2102** để nuôi toàn bộ cảm biến.

> **Module GNSS u-blox NEO-M10-0-10 (bo YXT-100-M10, chip UBX-M10050-KB):** Bo tích hợp IC hạ áp LDO với chân nguồn ghi rõ nhãn **`5V`**. Cấp nguồn **5.0 V DC** từ rail Buck vào chân `5V` của module (không cấp 3.3 V vào chân `5V` này vì sụt áp qua LDO sẽ khiến GPS thiếu áp hoạt động chập chờn). Tín hiệu UART TX/RX xuất/nhận ở mức logic chuẩn **3.3 V LVTTL**, an toàn tuyệt đối khi kết nối trực tiếp với GPIO Sonix SN34F788. Datasheet của đúng module: `YXT-100-M10_GNSS_Module_Datasheet_v1.00_Mar2022.pdf`, lưu tại [`docs/hardware/sensors/neo_m10/`](../hardware/sensors/SENSOR_PACKAGES.md).

---

## 2. Bảng phân bổ chân cắm và mức điện áp trên MCU Sonix

> 📌 **Tham chiếu pinout dự thảo:** Xem sơ đồ chân, số thứ tự pin và header Kit tại [KVC_MASTER_PINOUT_WIRING.md](../hardware/wiring/KVC_MASTER_PINOUT_WIRING.md).

| Cảm biến / Module | Chuẩn giao tiếp | Mức logic tín hiệu | Nguồn cấp VCC | Chân tín hiệu trên Module | Cổng ngoại vi phần cứng trên Sonix SN34F788 |
| :--- | :---: | :---: | :---: | :---: | :--- |
| **AJ-SR04M / JSN-SR04T (Siêu âm IP67)** | UART (9.600 bps) / Trig-Echo | 3,3 V / 5,0 V TTL | **5,0 V** (Buck DC-DC) | TXD (qua phân áp) ➔ RXD<br>RXD ◄ TXD | **UART2_RX** (`P2.15` - Pin 31)<br>**UART2_TX** (`P2.14` - Pin 30) |
| **GY-87 IMU 10-DOF** | I2C (100 / 400 kHz) | 3,3 V CMOS | **3,3 V** | SCL (Clock)<br>SDA (Data) | **I2C0_SCL** (`P0.10` - Pin 38)<br>**I2C0_SDA** (`P0.11` - Pin 39)<br>*(Kit có R3/R4 = 1 kΩ cho I2C0; không thêm pull-up ngoài. Kiểm tra pull-up có sẵn trên module và cô lập một bộ nếu cần.)* |
| **GNSS u-blox M10** | UART (9.600 bps) | 3,3 V logic | **5,0 V DC** (LDO trên bo hạ về 3,3 V) | TXD ➔ RXD<br>RXD ◄ TXD; logic 3,3 V | **UART3_RX** (`P2.1` - Pin 15)<br>**UART3_TX** (`P2.0` - Pin 14) |
| **LoRa Ra-02 (SX1278)** | SPI (1–4 MHz) | 3,3 V CMOS | **3,3 V** (DC-DC) | NSS, SCK, MISO, MOSI<br>DIO0 (Ngắt)<br>RST | **SPI0** (`P2.4..P2.7` - Pin 20..23)<br>**DIO0** (`P2.8` - Pin 24)<br>**RST** (`P2.9` - Pin 25) |
| **FPGA BBox Data** | UART (38.400 bps / 115.200 bps nếu có PLL) | 3,3 V CMOS | Chung nguồn | RXD ◄ TXD (FPGA)<br>DATA_READY | **UART1_RX** (`P2.3` - Pin 17)<br>**DATA_READY** (`P0.12` - Pin 3) |
| **Debug Console PC** | UART (9.600 bps mặc định / 115.200 bps khi có PLL) | 3,3 V TTL | Chung GND | TXD ➔ RXD<br>RXD ◄ TXD | **UART5_TX** (`P0.15` - Pin 6)<br>**UART5_RX** (`P0.14` - Pin 5) |

---

## 3. Đặc tả giao thức chi tiết từng cảm biến

### 3.1. Cảm biến cự ly độ cao siêu âm chống nước AJ-SR04M / JSN-SR04T

> *Ghi chú cập nhật phần cứng:* Thay thế cảm biến laser ToF TF-Luna bằng cảm biến siêu âm chống nước AJ-SR04M (JSN-SR04T) chuẩn IP67 để giảm giá thành, chống chịu môi trường mưa lũ, bọt nước và phản xạ tốt trên bề mặt nước.

* **Chuẩn truyền thông:** UART 9.600 bps, 8 bit dữ liệu, No Parity, 1 Stop bit (8N1) (chế độ xuất nối tiếp Serial). Có thể dùng chế độ xung Trigger/Echo qua GPIO.
* **Dải đo danh định phần cứng:** 20 cm – 600 cm (0,2 m – 6,0 m).
* **Độ chính xác:** $\pm 1\text{ cm}$, độ phân giải 1 mm. Tần số sóng siêu âm: 40 kHz.
* **Định dạng khung dữ liệu UART 4 byte:**

```text
+------+--------+--------+----------+
| 0xFF | Data_H | Data_L | Checksum |
+------+--------+--------+----------+
```

* **Công thức giải mã:**
  * $\text{Distance (mm)} = (\text{Data\_H} \ll 8) + \text{Data\_L}$
  * $\text{Distance (cm)} = \text{Distance (mm)} / 10$
  * $\text{Checksum} = (0\text{xFF} + \text{Data\_H} + \text{Data\_L}) \ \& \ 0\text{xFF}$
* **Các ngưỡng cự ly trong hệ thống (Đồng bộ toàn chuỗi):**
  * **Ngưỡng phần cứng danh định (Datasheet):** $20\text{ cm} \le \text{Distance} \le 600\text{ cm}$.
  * **Ngưỡng cờ hợp lệ Firmware MCU (`ALT_VALID`):** $20\text{ cm} \le \text{Distance} \le 500\text{ cm}$ (định nghĩa trong `kvc_usound_ajsr04m.h`, ngoài dải này trả lỗi cự ly).
  * **Ngưỡng thẩm định Backend GCS (`lidar_position_valid`):** $20\text{ cm} \le \text{Distance} \le 800\text{ cm}$ (định nghĩa trong `esp32_ingress.py` và `schemas.py` nhằm dự phòng dung sai đỉnh).
  * Checksum khung dữ liệu đúng.
  * **Lưu ý góc mở chùm sóng (~75°):** Khi thử nghiệm bể bơi, cho UAV bay cách mép bờ kè/thành bể tối thiểu 1,5 m để tránh sóng âm bắt nhầm tiếng vọng từ thành bờ.

---

### 3.2. Cụm cảm biến tư thế GY-87 IMU 10-DOF

Mô-đun GY-87 tích hợp 3 chip trên cùng 1 bus I2C:

#### A. MPU6050 (3-axis Gyroscope + 3-axis Accelerometer)
* **Địa chỉ I2C:** `0x68` (khi chân AD0 nối GND).
* **Thanh ghi cấu hình chính:**
  * `0x6B` (`PWR_MGMT_1`): Ghi `0x00` để đánh thức chip thoát chế độ Sleep.
  * `0x1A` (`CONFIG`): Cấu hình bộ lọc thông thấp số DLPF (42 Hz).
  * `0x1B` (`GYRO_CONFIG`): Dải đo Gyro $\pm 500^\circ/\text{s}$ (Thanh ghi `0x43`..`0x48`).
  * `0x1C` (`ACCEL_CONFIG`): Dải đo Gia tốc $\pm 4g$ (Thanh ghi `0x3B`..`0x40`).
* **Trích xuất góc tư thế:** Kết hợp bộ lọc bù (Complementary Filter) hoặc Madgwick Filter để tính góc nghiêng **Roll ($\phi$)** và **Pitch ($\theta$)** của camera/tải.

#### B. HMC5883L / QMC5883L (La bàn số 3 trục Magnetometer) — **HOÃN, CHƯA DÙNG**

> [!WARNING]
> **Trạng thái: hoãn có chủ đích (quyết định 26/10/2026).** Chip này **có mặt trên module
> GY-87** nhưng firmware **không** khởi tạo, **không** đọc và **không** truyền dữ liệu.
> IF-02 không có byte nào dành cho Yaw; backend gán cứng `heading_deg = None`
> (`gcs/backend/esp32_ingress.py`). Vì vậy hiện **không có Yaw tuyệt đối**.

* **Địa chỉ I2C (khi triển khai):** `0x1E` (HMC5883L) hoặc `0x0D` (nếu dùng chip tương đương QMC5883L — phải kiểm tra chip thực tế trên bo).
* **Mục đích dự kiến:** Cung cấp góc hướng Bắc từ trường (Heading / **Yaw ($\psi$)**) để xác định phương vị quang học.
* **Vì sao hoãn:** cần hiệu chuẩn hard/soft iron bằng cách xoay UAV 360° tại chỗ — việc này bắt buộc phải làm trên kit thật. Viết driver trước khi có kit là code chưa kiểm chứng.
* **Hướng thay thế đã chọn (khi cần):** lấy Yaw từ GNSS **`track_made_good`** (trường 7 của câu RMC) — không cần phần cứng thêm, không cần hiệu chuẩn, và test được bằng câu NMEA dựng sẵn như 70 test GNSS hiện có. Giới hạn: không có Yaw khi UAV đứng yên hoặc bay thẳng đứng.
* **Hệ quả hiện tại của việc chưa có Yaw:** georef trong `main.c` giả định camera hướng Bắc. Nếu UAV xoay, toạ độ mục tiêu sẽ lệch theo hướng vuông góc. Xem ghi chú "chưa đủ nghiệm thu (M3)" tại khối georef.

#### C. BMP180 (Cảm biến áp suất khí quyển) — **ĐÃ LOẠI BỎ**

> [!NOTE]
> **Đã loại khỏi thiết kế (quyết định 26/10/2026).** Chip vẫn nằm trên module GY-87
> nhưng **không được sử dụng**: không có code, không có byte trong IF-02, và không
> có nhu cầu chức năng.

* **Lý do loại:** AJ-SR04M đã đo cao độ trực tiếp và là nguồn chính cho georef.
  BMP180 cho cao độ tuyệt đối với sai số ±1 m do biến động khí áp — không đủ chính
  xác cho georef yêu cầu dưới 1 m, nên không dùng làm dự phòng được.
* **Không ảnh hưởng:** byte 26–29 của IF-02 đã cấp cho Roll/Pitch, không có chỗ
  cho áp suất. Bỏ BMP180 không làm thay đổi ABI.
* Nếu sau này cần đo cao độ tuyệt đối (ví dụ log độ cao bay), mở lại như task riêng.

---

### 3.3. Bo định vị vệ tinh u-blox M10 (chip UBX-M10050)

* **Nguồn:** Cấp **5.0 V DC** vào chân `5V` của bo breakout (IC LDO on-board hạ áp xuống 3.3 V nuôi chip u-blox UBX-M10050 và mạch RF/anten). Không cấp 3.3 V vào chân `5V` để tránh sụt áp qua LDO làm suy giảm độ nhạy hoặc gián đoạn hoạt động.
* **Logic UART:** Chân `TX` và `RX` hoạt động ở mức chuẩn **3.3 V LVTTL**, kết nối trực tiếp an toàn với chân `P2.1` (`URXD3`) và `P2.0` (`UTXD3`) của MCU Sonix SN34F788.
* **Khả năng thu vệ tinh:** Theo datasheet module: `GPS L1 C/A, GLONASS L1 C/A, BDS B1I/B1C, GALILEO E1 B/C, SBAS L1, QZSS L1 C/A` — tức **4 chòm chính (GPS, GLONASS, Galileo, BeiDou) + QZSS + SBAS**. Độ nhạy tracking −167 dBm, dòng tiêu thụ 30 mA (typ) ở 5 V. Đây là số liệu datasheet, **chưa đo trên kit**.
* **Nguồn tham chiếu:** `SENSOR_PACKAGES.md` mục 1.3 (datasheet MAX-M10N-10B, bản gốc u-blox). Bo breakout thương mại **không có datasheet chính thức**.

* **Chuẩn truyền thông:** UART 9.600 bps (mặc định xuất xưởng) hoặc cấu hình lên 38.400 / 115.200 bps qua phần mềm u-center 2, 8N1.
* **Giao thức:** NMEA-0183 v4.11 (Câu `$GNGGA` hoặc `$GNRMC` xuất định kỳ 1–10 Hz, mặc định 1 Hz).
* **Trường dữ liệu cần trích xuất:**
  * **Fix Status:** Trường chất lượng định vị ($0$: No Fix, $1$: GPS 2D/3D Fix, $2$: DGPS Fix). Chỉ chấp nhận khi $\ge 1$.
  * **Latitude & Longitude:** Tọa độ địa lý WGS-84 (độ phút sang độ thập phân $\times 10^7$).
  * **HDOP (Horizontal Dilution of Precision):** Độ chính xác hình học mặt phẳng. Chỉ chấp nhận $\text{HDOP} \le 2.5$.
* **Điều kiện cờ hợp lệ (`gnss_valid`):**
  * $\text{Fix Status} \ge 1$ VÀ Số lượng vệ tinh theo dõi $\ge 5$ VÀ $\text{HDOP} \le 2.5$.
  * Khi thiếu các điều kiện trên, MCU xuất cờ `GNSS_INVALID` và không công bố tọa độ WGS-84 mục tiêu (chỉ dùng tọa độ phẳng Local Grid cm).

---

## 4. Trách nhiệm phối hợp kiểm thử giữa Phong và Cường

1. **Cường (Phần cứng):**
   - Kiểm tra thông mạch và đo điện áp các chân cấp nguồn bằng đồng hồ VOM trước khi cắm vào Kit Sonix.
   - Thử nghiệm độ phản xạ của cảm biến siêu âm AJ-SR04M trên mặt nước thật (bể bơi/chậu nước) với các góc nghiêng, kiểm tra vùng mù dưới 20 cm.
2. **Phong (Firmware):**
   - Viết module đọc lần lượt từng cảm biến trong `firmware/mcu_payload/src/sensors/`.
   - Cài đặt cơ chế Timeout cho các hàm đọc I2C/UART: nếu 1 cảm biến bị tuột dây hoặc treo bus, chương trình chính vẫn tiếp tục chạy điều phối, **tuyệt đối không bị treo vô hạn trong vòng lặp chờ**.
