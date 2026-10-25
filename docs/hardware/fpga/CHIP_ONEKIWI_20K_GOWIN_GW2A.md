# KVC — Tài liệu Kỹ thuật Phần cứng: FPGA Gowin GW2A-LV18 & Bo OneKiwi Primer 20K V1.1

Tài liệu này tổng hợp thông tin của **FPGA Gowin GW2A-LV18PG256** và bo **OneKiwi Primer 20K V1.1** dựa trên User Guide, schematic và sơ đồ khối có trong `docs/hardware/onekiwi20k/`. Đây là bản tra cứu theo nguồn hiện có, không phải bản thay thế đầy đủ cho datasheet chip Gowin.

---

## 1. Tổng quan Thiết bị & Nhận dạng

| Thành phần | Thông tin chi tiết | Căn cứ tài liệu |
| :--- | :--- | :--- |
| **Bo mạch phát triển** | OneKiwi Primer 20K V1.1 (KiCad EDA v9.0 schematic rev v1.0) | `KIWIPRIMER20K_USERGUIDE.pdf`, `fpga-kiwi-primer-20k.pdf` |
| **Chip FPGA** | **Gowin GW2A-LV18PG256C8/I7** (Dòng Arora GW2A) | Schematic trang 4/13, User Guide mục 2.5 |
| **Đóng gói (Package)** | Mã thiết bị cho biết package PG256/PBGA256; kích thước cơ khí và ball map cần đối chiếu datasheet Gowin đúng biến thể | User Guide mục 2.5 và schematic; datasheet chip chưa có trong folder |
| **Mã speed/temperature grade** | Schematic ghi hậu tố `C8/I7`; chưa gán dải nhiệt độ/speed grade cụ thể khi thiếu datasheet đúng biến thể. User Guide nêu nhiệt độ môi trường hoạt động của bo là −10°C đến +65°C | Schematic trang 4/13; User Guide mục 2.6 |
| **Bộ nhớ cấu hình ngoài** | Schematic ghi Winbond **W25Q128JVSIQ** (128 Mbit / 16 MByte, SPI). User Guide mục 2.6 lại ghi 64 Mbit; dung lượng thực cần xác nhận bằng BOM/marking của bo đang dùng | Schematic trang 2/13, trang 5/13; User Guide mục 2.6 có số khác |
| **DDR3 ngoài** | Trang sản phẩm OneKiwi ghi **512 MB DDR3 SDRAM**; schematic V1.1 đang lưu trong workspace chưa thể hiện rõ chip DDR3/đường bus tương ứng, nên tình trạng lắp thực và controller khả dụng chưa được xác minh | [Trang sản phẩm OneKiwi](https://onekiwi.vn/san-pham/kiwi-primer-20k-fpga-board/); schematic cục bộ V1.1 cần đối chiếu lại với revision bo thực |
| **Mạch nạp & Debug tích hợp** | Chip cầu chuyển đổi **Gowin GWU2X** (USB-to-JTAG/UART, QFN32) | Schematic trang 11/13, User Guide mục 3.2 |
| **Giao diện vật lý** | 2× HDMI (1× TX, 1× RX), 1× MicroSD (SDIO), 2× USB 2.0 Host/Device, 2× Header 40-pin, 1× Header 8-pin, 3× WS2812B RGB, 7× User LED, 2× User Key, 1× Reset Key | Schematic & User Guide mục 3 |

---

## 2. Thông số Kiến trúc FPGA Gowin GW2A-LV18

Chip FPGA **GW2A-LV18** thuộc thế hệ đầu của Arora theo User Guide OneKiwi, tích hợp logic LUT4, BSRAM, DSP và PLL:

*   **Logic Cells (LUT4):** 20.736 LUT (Look-Up Table 4 ngõ vào).
*   **Flip-Flops (FF):** 15.552 thanh ghi theo bảng thông số của User Guide mục 2.6.
*   **Shadow SRAM (SSRAM):** 41.472 bits (cấu hình phân tán trong các LUT logic).
*   **Block SRAM (BSRAM):** **828 Kbits** phân bố thành 46 khối BSRAM độc lập (mỗi khối 18 Kbits). Hỗ trợ các chế độ Single Port, Dual Port, Semi-Dual Port và FIFO.
*   **Khối DSP (Digital Signal Processing):** **48 khối nhân 18×18 bits** chuyên dụng, hỗ trợ cấu hình ghép bộ nhân kép 9×9, bộ cộng/tích lũy (accumulator), pipeline đa tầng, phù hợp tăng tốc xử lý tín hiệu và tính toán mạng nơ-ron (AI inference).
*   **Phase-Locked Loops (PLL):** **4 PLL** theo bảng thông số của User Guide mục 2.6. Cấu hình clock, primitive, vị trí/khả năng mỗi PLL phải tra đúng datasheet và Gowin User Guide; không giả định cả 4 đều dùng được đồng thời theo mọi cấu hình.
*   **Số lượng I/O Banks:** **8 I/O Banks** (Bank 0, Bank 1, Bank 2, Bank 3, Bank 4, Bank 5, Bank 6, Bank 7).
*   **Chuẩn I/O:** họ GW2A có nhiều chuẩn I/O đơn cực/vi sai; danh sách chuẩn, VCCIO, mức điện áp, drive strength và chân hỗ trợ phải tra datasheet Gowin cùng pinout đúng part. Trên bo này các rail VCCIO được thiết kế theo schematic; không suy từ danh sách khả năng của họ chip ra pinout cụ thể.

> [!NOTE]
> **Đặc thù thanh ghi trên FPGA (So sánh với MCU):**
> Khác với vi điều khiển (như Sonix SN34F788 có các thanh ghi ngoại vi cố định trên bus APB/AHB), FPGA Gowin GW2A là chip logic lập trình được (SRAM-based LUT/FF). Các thanh ghi phục vụ nhiệm vụ (như thanh ghi điều khiển camera, bộ đếm đối tượng phát hiện, tọa độ Bounding Box X/Y/W/H, cờ ngắt báo MCU) **không có địa chỉ phần cứng cố định sẵn** mà được tổng hợp trực tiếp từ mã nguồn RTL (Verilog/VHDL) bằng tài nguyên Flip-Flop hoặc Block SRAM. Khi thiết kế bus giao tiếp coprocessor giữa FPGA và MCU (qua SPI hoặc UART), kỹ sư RTL sẽ tự định nghĩa bản đồ thanh ghi tùy biến (Custom Register Map).


---

## 3. Hệ thống Nguồn & Phân bố Điện áp trên Bo

### 3.1 Mạch nguồn vào và biến đổi DC-DC
Bo OneKiwi Primer 20K nhận nguồn chính **5.0V DC** từ cổng kết nối USB Type-C hoặc chân cấp nguồn header ngoài:
*   Mạch bảo vệ ngõ vào: Tích hợp cầu chì/bảo vệ quá dòng (giới hạn ngắt **2.0A**) và diode chống phân cực ngược.
*   **IC hạ áp TLV62569 (U9 & U11):** Bộ chuyển đổi đồng bộ DC-DC Buck hiệu suất cao (dòng tối đa 2A):
    *   **U9 (TLV62569DBVR):** Hạ áp từ `P5V0` xuống **`P3V3` (3.3V)**, cấp nguồn cho toàn bộ các Bank I/O FPGA, chip Flash, chip nạp GWU2X, cổng HDMI, MicroSD và các LED.
    *   **U11 (TLV62569DBVR):** Hạ áp từ `P5V0` xuống **`P1V0` (1.0V)**, cấp nguồn cho lõi logic FPGA (`VCC`), khối phụ trợ (`VCCX`), và bộ dao động tạo xung nhịp PLL (`VCCPLLL`, `VCCPLLR`).

### 3.2 Bảng phân bố chân nguồn FPGA (GW2A-LV18PG256)

| Tên miền nguồn | Mức điện áp danh định | Dải cho phép | Chân FPGA (BGA Ball) | Chức năng |
| :--- | :--- | :--- | :--- | :--- |
| **VCC** (Core) | **1.0V** | 0.95V ~ 1.05V | G7, K10, T1, T16, A1, A16 | Cấp nguồn lõi logic, BSRAM, thanh ghi |
| **VCCX** (Auxiliary) | **1.0V** | 0.95V ~ 1.05V | G8, K9 | Cấp nguồn khối cấu hình và phụ trợ nội |
| **VCCPLLL** | **1.0V** | 0.95V ~ 1.05V | G10 | Cấp nguồn analog cho khối Left PLL |
| **VCCPLLR** | **1.0V** | 0.95V ~ 1.05V | K7 | Cấp nguồn analog cho khối Right PLL |
| **VCCIO0** | **3.3V** | 1.14V ~ 3.6V | E13, H10 | Nguồn I/O Bank 0 (HDMI TX, HDMI RX) |
| **VCCIO1** | **3.3V** | 1.14V ~ 3.6V | J10, M13 | Nguồn I/O Bank 1 (JTAG, Header J2) |
| **VCCIO2** | **3.3V** | 1.14V ~ 3.6V | N12 | Nguồn I/O Bank 2 (Header J2) |
| **VCCIO3** | **3.3V** | 1.14V ~ 3.6V | K8, N5 | Nguồn I/O Bank 3 (SPI Flash, Header J2) |
| **VCCIO4** | **3.3V** | 1.14V ~ 3.6V | J7, M4 | Nguồn I/O Bank 4 (USB 2.0, RGB LED, Header 8P) |
| **VCCIO5** | **3.3V** | 1.14V ~ 3.6V | E4, H7 | Nguồn I/O Bank 5 (MicroSD, Phím nhấn, LED 1/4/5/6/7) |
| **VCCIO6** | **3.3V** | 1.14V ~ 3.6V | D5 | Nguồn I/O Bank 6 (Header J1 LVDS) |
| **VCCIO7** | **3.3V** | 1.14V ~ 3.6V | D12, G9 | Nguồn I/O Bank 7 (Header J1 LVDS) |
| **VSS** (GND) | **0V** | 0V | B2, B15, C3, C14, D4, D13, E5, E12, F6, F11, H8, H9, J8, J9, L6, L11, M5, M12, N4, N13, P3, P14, R2, R15 | Miền đất tham chiếu chung toàn chip |

> [!IMPORTANT]
> Các rail `VCCIO0 ~ VCCIO7` được nối về `P3V3` theo schematic. Với tín hiệu một đầu, cấu hình dự kiến là 3.3V LVCMOS theo bank/constraints; các cặp vi sai phải dùng chuẩn vi sai được FPGA hỗ trợ và wiring đúng. Không đưa tín hiệu 5V trực tiếp vào chân FPGA. Giá trị tuyệt đối và chuẩn I/O hợp lệ phải kiểm tra trong datasheet đúng part.

---

## 4. Xung nhịp (Clocking) & Mạch Nạp Cấu Hình

### 4.1 Mạch dao động Clock tích hợp
*   **Bộ dao động tích cực 27 MHz (X1):** Đóng gói SMD 3225-4Pin, cấp nguồn 3.3V. Ngõ ra nối trực tiếp vào chân **`H11`** (thuộc Bank 0, ngõ vào xung nhịp toàn cục `GCLK` / ngõ vào tham chiếu PLL).
*   Từ tần số cơ sở 27 MHz, các khối PLL nội (Gowin rPLL primitive) có thể tổng hợp các tần số làm việc theo yêu cầu (ví dụ: 50 MHz, 100 MHz, 135 MHz, 148.5 MHz cho video pixel clock).

### 4.2 Mạch nạp cấu hình USB-JTAG (Gowin GWU2X)
Bo mạch tích hợp sẵn bộ nạp USB-JTAG sử dụng vi điều khiển giao tiếp **Gowin GWU2X (U6)**:
*   Sử dụng thạch anh 12 MHz (X2) và cổng kết nối USB Type-C (P5 / CN4).
*   Chân kết nối JTAG giữa GWU2X và FPGA GW2A:
    *   **FPGA_TCK:** Chân `A7` (Bank 1).
    *   **FPGA_TMS:** Chân `B8` (Bank 1).
    *   **FPGA_TDI:** Chân `A6` (Bank 1).
    *   **FPGA_TDO:** Chân `C6` (Bank 1).
*   **Thông số thanh ghi JTAG phần cứng của FPGA GW2A-LV18:**
    *   **Chiều dài thanh ghi lệnh (JTAG IR Length):** **8 bits**.
    *   **Mã định danh thiết bị phần cứng (JTAG IDCODE):** **`0x01009EF8`** (chuẩn Gowin GW2A-18 Series; Manufacturer ID: `0xEF8`, Part Number: GW2A-18).
    *   **Các mã lệnh JTAG chuẩn:**
        *   `0x11`: Đọc IDCODE thiết bị.
        *   `0x13`: Đọc mã người dùng USERCODE.
        *   `0xFF`: Lệnh BYPASS (bỏ qua chuỗi quét JTAG).
*   Người dùng kết nối máy tính qua phần mềm **Gowin Programmer** (hỗ trợ cáp Gowin USB Cable tích hợp sẵn) để nạp bitstream.

### 4.3 Bộ nhớ Flash nạp cấu hình ngoài (Winbond W25Q128)
FPGA GW2A kết nối với chip SPI Flash **W25Q128JVSIQ (128 Mbit / 16 MByte)** ở chế độ Master SPI (MSPI):
*   **MSPI_MCLK:** Chân `L10` (Bank 3).
*   **MSPI_CS:** Chân `M9` (Bank 3).
*   **MSPI_MOSI:** Chân `R10` (Bank 3).
*   **MSPI_MISO:** Chân `P10` (Bank 3).
*   **Chế độ nạp cấu hình:**
    1.  **SRAM Mode:** Nạp trực tiếp vào bộ nhớ cấu hình SRAM của FPGA qua JTAG để chạy thử nghiệm tức thời (mất chương trình khi mất điện).
    2.  **External Flash Mode:** Nạp tệp cấu hình `.bin` vào Flash W25Q128 qua JTAG; khi khởi động lại, FPGA tự động đọc bitstream từ Flash vào SRAM.

#### Thanh ghi trạng thái & Bảng mã lệnh của Flash W25Q128JV

Khi thiết kế logic RTL trên FPGA để đọc/ghi dữ liệu tĩnh hoặc nạp cấu hình, FPGA giao tiếp với Flash qua các thanh ghi trạng thái (Status Registers) và bảng mã lệnh (Opcode) chuẩn:

| Tên Thanh Ghi / Lệnh | Mã Lệnh (Opcode) | Thuộc Tính | Chức Năng Kỹ Thuật |
| :--- | :---: | :---: | :--- |
| **Status Register 1 (SR1)** | `0x05` (Đọc) / `0x01` (Ghi) | R/W | Bit 0: `BUSY` (Đang xóa/ghi), Bit 1: `WEL` (Cho phép ghi), Bit 2~4: `BP0~BP2` (Bảo vệ khối), Bit 7: `SRP0` |
| **Status Register 2 (SR2)** | `0x35` (Đọc) / `0x31` (Ghi) | R/W | Bit 1: `QE` (Quad SPI Enable), Bit 3~5: `LB1~LB3` (Khóa bảo mật OTP), Bit 7: `SUS` (Tạm dừng xóa/ghi) |
| **Status Register 3 (SR3)** | `0x15` (Đọc) / `0x11` (Ghi) | R/W | Cấu hình dòng lái ngõ ra (Driver Strength) và chức năng HOLD/RESET |
| **Write Enable (WREN)** | `0x06` | Lệnh | Bật chốt cho phép ghi dữ liệu (`WEL = 1`) trước khi ghi/xóa |
| **Read Data** | `0x03` | Lệnh | Đọc tuần tự dữ liệu Flash từ địa chỉ 24-bit (Tần số tối đa 50 MHz) |
| **Fast Read** | `0x0B` | Lệnh | Đọc dữ liệu tốc độ cao kèm dummy clock byte (Tần số tối đa 133 MHz) |
| **Page Program** | `0x02` | Lệnh | Ghi dữ liệu vào Flash (tối đa 256 bytes trong một trang) |
| **Sector Erase (4 KB)** | `0x20` | Lệnh | Xóa phân vùng nhỏ 4 KBytes (thời gian xóa ~45 ms) |
| **Block Erase (64 KB)** | `0xD8` | Lệnh | Xóa khối lớn 64 KBytes (thời gian xóa ~150 ms) |
| **Chip Erase** | `0xC7` / `0x60` | Lệnh | Xóa toàn bộ dung lượng 128 Mbits của chip Flash |
| **Read JEDEC ID** | `0x9F` | Lệnh | Đọc ID nhà sản xuất và loại thiết bị (Trả về `0xEF 0x40 0x18`) |


---

## 5. Chi tiết Giao tiếp Ngoại vi & Sơ đồ Chân trên Bo

### 5.1 Cổng Video HDMI Kép (HDMI TX & HDMI RX)
Bo mạch trang bị 2 cổng HDMI chuẩn Type-A đầy đủ với IC bảo vệ ESD (RCLAMP0524P) và IC chuyển mức I2C DDC (TXS0102DQMR):

#### HDMI TX (Bộ phát - P3)
| Tên tín hiệu | Chân FPGA | Bank FPGA | Chuẩn I/O | Chức năng |
| :--- | :--- | :--- | :--- | :--- |
| `HDMI_TX_CK_P` / `HDMI_TX_CK_N` | `J15` / `K16` | Bank 0 | True LVDS / LVCMOS33 | Clock vi sai truyền hình ảnh |
| `HDMI_TX_D0_P` / `HDMI_TX_D0_N` | `J16` / `J14` | Bank 0 | True LVDS / LVCMOS33 | Kênh dữ liệu vi sai 0 (Blue) |
| `HDMI_TX_D1_P` / `HDMI_TX_D1_N` | `H14` / `H16` | Bank 0 | True LVDS / LVCMOS33 | Kênh dữ liệu vi sai 1 (Green) |
| `HDMI_TX_D2_P` / `HDMI_TX_D2_N` | `H13` / `J12` | Bank 0 | True LVDS / LVCMOS33 | Kênh dữ liệu vi sai 2 (Red) |
| `HDMITX_SCL` / `HDMITX_SDA` | Mạch DDC qua U22 | Bank 0 | LVCMOS33 | Tín hiệu I2C nhận dạng EDID màn hình |
| `HDMITX_HPD` | Mạch đệm Q1 | Bank 0 | LVCMOS33 | Tín hiệu phát hiện cắm cáp (Hot-Plug Detect) |

#### HDMI RX (Bộ nhận - P4)
| Tên tín hiệu | Chân FPGA | Bank FPGA | Chuẩn I/O | Chức năng |
| :--- | :--- | :--- | :--- | :--- |
| `HDMI_RX_CK_P` / `HDMI_RX_CK_N` | `G16` / `H15` | Bank 0 | True LVDS | Clock vi sai ngõ vào từ nguồn video |
| `HDMI_RX_D0_P` / `HDMI_RX_D0_N` | `F13` / `G12` | Bank 0 | True LVDS | Kênh dữ liệu vi sai nhận 0 |
| `HDMI_RX_D1_P` / `HDMI_RX_D1_N` | `E16` / `F15` | Bank 0 | True LVDS | Kênh dữ liệu vi sai nhận 1 |
| `HDMI_RX_D2_P` / `HDMI_RX_D2_N` | `D16` / `E14` | Bank 0 | True LVDS | Kênh dữ liệu vi sai nhận 2 |
| `HDMIRX_SCL` / `HDMIRX_SDA` | Mạch DDC qua U8 | Bank 0 | LVCMOS33 | Tín hiệu I2C EDID |
| `HDMIRX_HPD_5V` | Mạch đệm Q5 | Bank 0 | LVCMOS33 | Tín hiệu báo nguồn 5V từ thiết bị phát |

### 5.2 Khe cắm Thẻ nhớ MicroSD (P2)
Giao tiếp theo chuẩn SD Bus 4-bit hoặc chuẩn SPI:
| Tên tín hiệu | Chân FPGA | Bank FPGA | Chuẩn I/O | Chức năng |
| :--- | :--- | :--- | :--- | :--- |
| `SDIO_CLK` | `D2` | Bank 5 | 3.3V LVCMOS | Xung nhịp truyền dữ liệu SD card |
| `SDIO_CMD` | `D1` | Bank 5 | 3.3V LVCMOS (kéo trở 10k lên 3.3V) | Lệnh / Phản hồi (Command / Response) |
| `SDIO_D0` | `C1` | Bank 5 | 3.3V LVCMOS (kéo trở 10k lên 3.3V) | Đường dữ liệu Data 0 (hoặc SPI MISO) |
| `SDIO_D1` | `C2` | Bank 5 | 3.3V LVCMOS (kéo trở 10k lên 3.3V) | Đường dữ liệu Data 1 |
| `SDIO_D2` | `E1` | Bank 5 | 3.3V LVCMOS (kéo trở 10k lên 3.3V) | Đường dữ liệu Data 2 |
| `SDIO_D3` | `E2` | Bank 5 | 3.3V LVCMOS (kéo trở 10k lên 3.3V) | Đường dữ liệu Data 3 (hoặc SPI CS) |
| `SDIO_DET` | `B1` | Bank 5 | 3.3V LVCMOS (kéo trở 10k lên 3.3V) | Phát hiện cắm thẻ (Card Detect switch) |

### 5.3 Cổng USB 2.0 Kép (P1)
Cổng USB kép Type-A kết nối trực tiếp vào các chân I/O của FPGA (qua bảo vệ ESD RCLAMP0524P):
*   **Cổng USB 0:** `USB0_P` nối chân **`N2`**, `USB0_N` nối chân **`P1`** (Bank 4).
*   **Cổng USB 1:** `USB1_P` nối chân **`M3`**, `USB1_N` nối chân **`N1`** (Bank 4).
*   *Lưu ý:* Đây là các chân I/O số kết nối trực tiếp, dùng cho các IP core USB Full-Speed/Low-Speed (USB Soft-PHY/HID).

### 5.4 Phím nhấn, LED Đơn & LED RGB

#### Phím nhấn (Active-LOW, nhấn xuống nối GND)
*   **BTN1 (User Key 1):** Chân **`A3`** (Bank 5), có tụ lọc rung 100nF và trở kéo lên 100k.
*   **BTN2 (User Key 2):** Chân **`A4`** (Bank 5), có tụ lọc rung 100nF và trở kéo lên 100k.
*   **RST (Reset Key):** Chân **`A5`** (Bank 5), có tụ lọc rung 100nF và trở kéo lên 100k.

#### LED Người Dùng (7 LED xanh D6 ~ D12, Active-LOW)
*   Nguyên lý điều khiển: FPGA xuất mức logic `LOW` (0V) để BẬT LED, xuất mức `HIGH` (3.3V) để TẮT LED.
*   **LED1:** Chân **`J1`** (Bank 5).
*   **LED2:** Chân **`J2`** (Bank 4).
*   **LED3:** Chân **`H1`** (Bank 4).
*   **LED4:** Chân **`H2`** (Bank 5).
*   **LED5:** Chân **`G1`** (Bank 5).
*   **LED6:** Chân **`G2`** (Bank 5).
*   **LED7:** Chân **`F1`** (Bank 5).

#### LED RGB Địa Chỉ (3× WS2812B-2020)
*   3 LED RGB loại WS2812B-2020 (D5, D17, D18) được mắc nối tiếp (daisy-chain).
*   Tín hiệu dữ liệu điều khiển: **`WS2812_IN`** nối vào chân **`K1`** (Bank 4), sử dụng chuẩn giao tiếp định thời xung 1-wire tốc độ 800 kHz.

---

## 6. Sơ đồ Đầu Nối Mở Rộng (Expansion Headers)

Bo OneKiwi Primer 20K cung cấp 2 header 40 chân (J1, J2) bước 2.54 mm và 1 header 8 chân (J4):

### 6.1 Header 8-Pin (J4)
| Chân | Tên tín hiệu | Chân FPGA | Bank | Chức năng |
| :--- | :--- | :--- | :--- | :--- |
| 1, 2 | `LCD_SDA` | `P2` | Bank 4 | Giao tiếp dữ liệu I2C màn hình hiển thị phụ |
| 3, 4 | `LCD_SCL` | `R1` | Bank 4 | Xung nhịp I2C màn hình hiển thị phụ |
| 5, 6 | `GND` | — | — | Nối đất (Ground) |
| 7, 8 | `3.3V` | — | — | Nguồn cấp 3.3V DC (tối đa 500mA) |

### 6.2 Header 40-Pin J1 (Tối ưu hóa các cặp vi sai LVDS)
| Chân Header | Tên tín hiệu | Chân FPGA | Bank | Chân Header | Tên tín hiệu | Chân FPGA | Bank |
| :--- | :--- | :--- | :--- | :--- | :--- | :--- | :--- |
| **1** | `GND` | — | — | **2** | `GND` | — | — |
| **3** | `P3V3` (3.3V) | — | — | **4** | `P3V3` (3.3V) | — | — |
| **5** | `LVDS_IOL31_N` | `E11` | Bank 6 | **6** | `LVDS_IOL2_N` | `A15` | Bank 7 |
| **7** | `LVDS_IOL31_P` | `F9` | Bank 6 | **8** | `LVDS_IOL2_P` | `B14` | Bank 7 |
| **9** | `LVDS_IOL15_N` | `C11` | Bank 7 | **10** | `LVDS_IOL8_N` | `A14` | Bank 7 |
| **11** | `LVDS_IOL15_P` | `A11` | Bank 7 | **12** | `LVDS_IOL8_P` | `B13` | Bank 7 |
| **13** | `LVDS_IOL38_N` | `E9` | Bank 6 | **14** | `LVDS_IOL13_N` | `A12` | Bank 7 |
| **15** | `LVDS_IOL38_P` | `D8` | Bank 6 | **16** | `LVDS_IOL13_P` | `B11` | Bank 7 |
| **17** | `LVDS_IOL33_N` | `A10` | Bank 6 | **18** | `LVDS_IOL27_N` | `C9` | Bank 7 |
| **19** | `LVDS_IOL33_P` | `B9` | Bank 6 | **20** | `LVDS_IOL27_P` | `A9` | Bank 7 |
| **21** | `LVDS_IOL7_N` | `B12` | Bank 7 | **22** | `LVDS_IOL29_N` | `A8` | Bank 6 |
| **23** | `LVDS_IOL7_P` | `C12` | Bank 7 | **24** | `LVDS_IOL29_P` | `C8` | Bank 6 |
| **25** | `LVDS_IOL17_N` | `E10` | Bank 7 | **26** | `LVDS_IOL40_N` | `C7` | Bank 6 |
| **27** | `LVDS_IOL17_P` | `D10` | Bank 7 | **28** | `LVDS_IOL40_P` | `B7` | Bank 6 |
| **29** | `LVDS_IOL35_N` | `D9` | Bank 6 | **30** | `LVDS_IOL53_N` | `D7` | Bank 6 |
| **31** | `LVDS_IOL35_P` | `F8` | Bank 6 | **32** | `LVDS_IOL53_P` | `E6` | Bank 6 |
| **33** | `LVDS_IOL45_N` | `E8` | Bank 6 | **34** | `LVDS_IOL47_N` | `B5` | Bank 6 |
| **35** | `LVDS_IOL45_P` | `F7` | Bank 6 | **36** | `LVDS_IOL47_P` | `C4` | Bank 6 |
| **37** | `P5V0` (5.0V) | — | — | **38** | `P5V0` (5.0V) | — | — |
| **39** | `GND` | — | — | **40** | `GND` | — | — |

### 6.3 Header 40-Pin J2 (I/O Đa năng GPIO)
| Chân Header | Tên tín hiệu | Chân FPGA | Bank | Chân Header | Tên tín hiệu | Chân FPGA | Bank |
| :--- | :--- | :--- | :--- | :--- | :--- | :--- | :--- |
| **1** | `P3V3` (3.3V) | — | — | **2** | `P5V0` (5.0V) | — | — |
| **3** | `B1_T48_N` | `P16` | Bank 1 | **4** | `P5V0` (5.0V) | — | — |
| **5** | `B1_T54_P` | `P15` | Bank 1 | **6** | `GND` | — | — |
| **7** | `B2_R7_P` | `T15` | Bank 2 | **8** | `B2_R7_N` | `R14` | Bank 2 |
| **9** | `GND` | — | — | **10** | `B2_R20_N` | `T14` | Bank 2 |
| **11** | `B2_R20_P` | `R13` | Bank 2 | **12** | `B2_R8_N` | `T13` | Bank 2 |
| **13** | `B2_R11_P` | `R12` | Bank 2 | **14** | `GND` | — | — |
| **15** | `B2_R17_N` | `T12` | Bank 2 | **16** | `B2_R17_P` | `R11` | Bank 2 |
| **17** | `P3V3` (3.3V) | — | — | **18** | `B3_R24_P` | `T11` | Bank 2 |
| **19** | `B3_R35_N` | `T10` | Bank 3 | **20** | `GND` | — | — |
| **21** | `B3_R38_P` | `T9` | Bank 3 | **22** | `B3_R35_P` | `R10` | Bank 3 |
| **23** | `B3_R42_N` | `T8` | Bank 3 | **24** | `B3_R29_N` | `R8` | Bank 3 |
| **25** | `GND` | — | — | **26** | `B3_R49_P` | `R7` | Bank 3 |
| **27** | `B3_B54_P` | `R6` | Bank 4 | **28** | `B3_R29_P` | `T7` | Bank 3 |
| **29** | `B3_R53_N` | `T6` | Bank 3 | **30** | `GND` | — | — |
| **31** | `B3_B54_N` | `T5` | Bank 4 | **32** | `B3_B50_N` | `R5` | Bank 4 |
| **33** | `B3_B52_P` | `R4` | Bank 4 | **34** | `GND` | — | — |
| **35** | `B3_B45_P` | `P4` | Bank 4 | **36** | `B3_B45_N` | `T4` | Bank 4 |
| **37** | `B3_B48_P` | `R3` | Bank 4 | **38** | `B3_B52_N` | `T3` | Bank 4 |
| **39** | `GND` | — | — | **40** | `B3_B48_N` | `T2` | Bank 4 |

> 📌 **Ánh xạ chân giao tiếp KVC (UART BBox & DATA_READY sang MCU Sonix):**
> File ràng buộc chính thức tại [fpga/constraints/pins.cst](../../fpga/constraints/pins.cst) và bản đồ đấu nối [KVC_MASTER_PINOUT_WIRING.md](../wiring/KVC_MASTER_PINOUT_WIRING.md):
> - **Header J2 Pin 11:** Chân FPGA **`R13`** (`uart_tx`, Bank 2, LVCMOS33) ➔ Nối chân `P2.3` (Pin 17) trên MCU Sonix.
> - **Header J2 Pin 12:** Chân FPGA **`T13`** (`uart_rx`, Bank 2, LVCMOS33) ➔ Nối chân `P2.2` (Pin 16) trên MCU Sonix.
> - **Header J2 Pin 13:** Chân FPGA **`R12`** (`data_ready`, Bank 2, LVCMOS33) ➔ Nối chân ngắt `P0.12` (Pin 3) trên MCU Sonix.
> - **Header J2 Pin 14:** Chân **`GND`** ➔ Bắt buộc nối chung Mass với cụm chân `J5` trên bo Sonix.

---

## 7. Lưu ý Kỹ thuật Phần cứng Quan trọng

1.  **Về bộ nhớ RAM ngoài (DDR3):**
    *   Trang sản phẩm OneKiwi hiện công bố board có **512 MB DDR3 SDRAM**. Tuy vậy, ghi chú khi đọc schematic V1.1 cục bộ cho biết trang `ddr3.kicad_sch` (trang 7/13) chỉ có fiducial markers và chưa xác định được chip/đường bus DDR3. Hai nguồn đang mâu thuẫn; không kết luận board có hoặc không có DDR3 chỉ từ các ghi chú này.
    *   Trước khi dùng DDR3 cho frame buffer, đối chiếu revision schematic/BOM với board thực (marking chip và các kết nối), xác nhận pin mapping và IP/controller Gowin. Nếu chưa xác minh, chỉ tính BSRAM nội **828 Kbits** là bộ nhớ xác nhận được; mức này xấp xỉ 100 KiB và không chứa đủ một frame VGA RGB565 (~600 KiB). Line-buffer/streaming là lựa chọn thiết kế khác nhưng cần RTL/timing/resource verification.
2.  **Về chuẩn ngõ vào/ngõ ra HDMI:**
    *   Cổng HDMI trên bo sử dụng trực tiếp các chân vi sai true LVDS ở Bank 0 với điện áp `VCCIO0 = 3.3V` kết hợp mạng điện trở phối trở kháng trên bo.
    *   Để thu/phát hình ảnh, thiết kế RTL cần tích hợp các IP Core tương thích (DVI/TMDS encoder, TMDS decoder) và tuân thủ chặt chẽ ràng buộc xung nhịp (timing constraints) cho xung nhịp pixel và xung nhịp dữ liệu (5× pixel clock).
3.  **Về cấp nguồn & Chuyển mức logic:**
    *   Nguồn 5V chỉ dùng làm đầu vào cho IC biến đổi nguồn Buck TLV62569.
    *   Tất cả các chân GPIO, LVDS, I2C, SPI trên bo đều chạy ở mức logic **3.3V LVCMOS**. Tuyệt đối không nối trực tiếp các chân tín hiệu 5V từ cảm biến ngoài vào FPGA mà không qua IC chuyển mức logic (logic level shifter).

---

## 8. Tài liệu Tham chiếu & Tệp Gốc trong Workspace

Tài liệu gốc của hãng **không** được version trong Git (bị ignore, chưa xác minh
quyền phân phối). Danh mục phiên bản/checksum và cách khôi phục nằm ở
[VENDOR_PACKAGES.md](../vendor/VENDOR_PACKAGES.md) mục 2:

* `KIWIPRIMER20K_USERGUIDE.pdf`: Hướng dẫn sử dụng chính thức từ OneKiwi Technology (25 trang).
* `fpga-kiwi-primer-20k.pdf`: Sơ đồ nguyên lý mạch điện tử thiết kế trên KiCad EDA (13 trang, rev v1.0).
* `Block_diagram.png`: Sơ đồ khối kiến trúc phần cứng bo mạch.

Sau khi khôi phục theo manifest, các file nằm trong `docs/hardware/onekiwi20k/`.

## 9. Mức độ bao phủ datasheet và giới hạn nguồn hiện có

Thư mục `docs/hardware/onekiwi20k/` có User Guide OneKiwi (25 trang), schematic V1.1 (13 trang) và block diagram; **không có datasheet Gowin Arora/GW2A riêng**. Vì vậy tài liệu hiện đủ tra cứu sơ bộ tài nguyên và kết nối của bo, nhưng chưa thể coi là đã liệt kê đầy đủ đặc tính chip. User Guide cũng trỏ tới datasheet GW2A trên trang Gowin.

| Nội dung | Nguồn cục bộ / tình trạng |
| :--- | :--- |
| Part trên bo, cấu hình, nguồn, clock, flash, HDMI, header và chân | Schematic V1.1 và User Guide; pinout/nguồn ở đây là board-specific. |
| LUT4, FF, BSRAM, SSRAM, multiplier, PLL, số bank, nhiệt độ bo | Bảng thông số User Guide mục 2.6; các số tài nguyên là thông số bảng hướng dẫn, không thay datasheet Gowin. |
| Absolute maximum ratings, DC/AC characteristics, speed grade, timing, package/ball map, bank electrical limits, power-up/configuration detail | Chưa đủ nguồn trong folder; cần datasheet chính thức đúng biến thể `GW2A-LV18PG256C8/I7` để hoàn thiện. Không suy ra từ tên board hoặc datasheet chung khác part. |

**Sai khác giữa nguồn cần kiểm trên bo thực:** User Guide mục 2.6 ghi Flash 64 Mbit, trong khi schematic gọi part W25Q128JVSIQ (128 Mbit). Dùng marking/BOM của revision bo thực nhận để chốt. Tài liệu này ghi 4 PLL và 15.552 FF theo bảng User Guide; nếu Gowin datasheet đúng part đưa số khác, cần cập nhật kèm nguồn và revision.
