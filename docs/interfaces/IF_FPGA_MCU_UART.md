# Đặc tả giao diện: FPGA OneKiwi ↔ MCU Tải Sonix (UART BBox)

- **Mã giao diện:** `IF-01`
- **Hai đầu kết nối:** FPGA OneKiwi Primer 20K (**Nguyễn Tất Vững** - Đầu phát TX) ↔ MCU Sonix SN34F788 (**Nguyễn Tá Duy Phong** - Đầu nhận RX)
- **Trạng thái:** `DRAFT ABI` (Dự thảo kỹ thuật theo mục IV.2 [KVC_ThietKeHeThong.md](../architecture/KVC_ThietKeHeThong.md); cần Vững và Phong thống nhất trước khi khóa ABI)

---

## 1. Kết nối vật lý và đường truyền

### 1.1. Bảng phân bổ chân vật lý (Physical Pin Mapping)

| Tín hiệu | Hướng | Chân FPGA OneKiwi (Header J2) | Chân MCU Sonix (LQFP64) | Chân trên Kit Sonix | Mức logic | Mô tả kỹ thuật |
| :--- | :---: | :--- | :--- | :--- | :---: | :--- |
| **UART_TX (FPGA)** → **URXD1** | FPGA → MCU | **`R13`** (J2 Pin 11, Bank 2) | **`P2.3`** (`URXD1`, Pin 17) | `JP3` Pin 7 hoặc 8 | 3.3 V CMOS | Đường truyền dữ liệu nối tiếp khung kết quả BBox |
| **DATA_READY** → **EXTI** | FPGA → MCU | **`R12`** (J2 Pin 13, Bank 2) | **`P0.12`** (Pin 3) | `JP1` Pin 11 hoặc 12 | 3.3 V CMOS | Xung báo hiệu khung ảnh mới sẵn sàng; kích hoạt ngắt ngoài (EXTI) trên MCU |
| **UART_RX (FPGA)** ← **UTXD1** | MCU → FPGA | **`T13`** (J2 Pin 12, Bank 2) | **`P2.2`** (`UTXD1`, Pin 16) | `JP3` Pin 5 hoặc 6 | 3.3 V CMOS | Tín hiệu phản hồi / ACK / lệnh điều khiển (dự phòng) |
| **GND** | Hai chiều | **`GND`** (J2 Pin 14) | `VSS` (GND) | **`J5`** Pin 1..4 | 0 V | **Nối chung GND bắt buộc** giữa bo OneKiwi và kit Sonix |

> [!NOTE]
> **Tương thích điện áp:**
> - I/O Bank 2 trên bo OneKiwi Primer 20K được cấp nguồn bởi đường `P3V3` (3.3V).
> - MCU Sonix SN34F788 hoạt động ở điện áp `VDD = 3.3V`.
> - Do đó, **2 bo mạch tương thích logic 3.3V trực tiếp 100%**, không cần mạch đệm hay cầu phân áp.

### 1.2. Mẫu cấu hình chân Gowin Physical Constraints (`.cst`) cho Vững

```cst
// Cấu hình chân giao tiếp UART & DATA_READY sang MCU Sonix
// Bo mạch: OneKiwi Primer 20K V1.1 (GW2A-LV18PG256)

IO_LOC "uart_tx" R13;
IO_PORT "uart_tx" IO_TYPE=LVCMOS33 DRIVE=8;

IO_LOC "uart_rx" T13;
IO_PORT "uart_rx" IO_TYPE=LVCMOS33 PULL_MODE=UP;

IO_LOC "data_ready" R12;
IO_PORT "data_ready" IO_TYPE=LVCMOS33 DRIVE=8;
```

> 📌 **File cấu hình dự án đã tạo:** File ràng buộc chân vật lý đã được tạo tại [fpga/constraints/pins.cst](../../fpga/constraints/pins.cst). Header định nghĩa chân phía MCU tại [firmware/mcu_payload/inc/kvc_pinout.h](../../firmware/mcu_payload/inc/kvc_pinout.h). Tham chiếu đấu nối chi tiết xem tại [KVC_MASTER_PINOUT_WIRING.md](../hardware/wiring/KVC_MASTER_PINOUT_WIRING.md).

### 1.3. Tham số UART
- **Baudrate:** Mặc định trong mã nguồn firmware MCU (`kvc_fpga_bbox.h`) là **38.400 bps** (cấu hình tối ưu với clock ngoại vi UCLK 12 MHz từ nguồn dao động nội IHRC của Sonix SN34F788).
  - *Lưu ý về Clock Tree:* Ở xung UCLK 12 MHz, nếu chạy 115.200 bps thì sai số baudrate tối thiểu là **6,99 %** (vượt xa ngưỡng cho phép 3,125 %, gây lỗi khung UART). Do đó, tốc độ 115.200 bps chỉ áp dụng khi MCU được cấu hình PLL để nâng UCLK lên ≥ 24 MHz.
- **Cấu hình bit:** 8N1 (8 bit dữ liệu, No Parity, 1 Stop bit).

---

## 2. Cấu trúc khung truyền BBox (AI Detection Frame)

Toàn bộ số nguyên nhiều byte lưu theo định dạng **Little-Endian** (byte thấp trước).

```text
+---------------+-----------+-----------------+----------------+--------------------+-----------+
| Sync (2B)     | Ver (1B)  | Count N (1B)    | Timestamp (4B) | N x BBox (N x 8B)  | CRC (2B)  |
| 0x5A 0xA5     | 0x01      | 0 .. 20         | uint32 (ms)    | Mỗi BBox 8 byte    | CRC-16    |
+---------------+-----------+-----------------+----------------+--------------------+-----------+
```

### Bảng phân rã khung truyền

| Offset | Độ dài | Tên trường | Kiểu dữ liệu | Mô tả |
| :---: | :---: | :--- | :--- | :--- |
| **0–1** | 2 byte | Sync Header | `uint8[2]` | Cố định `0x5A 0xA5` (nhận diện đầu khung) |
| **2** | 1 byte | Version | `uint8` | Phiên bản giao thức (giá trị `1`) |
| **3** | 1 byte | Candidate Count ($N$) | `uint8` | Số lượng mục tiêu phát hiện trong frame (tối đa 20 mục tiêu) |
| **4–7** | 4 byte | Timestamp | `uint32` | Thời điểm chụp/suy luận của khung ảnh (ms) |
| **8 .. (8+8N-1)** | $N \times 8$ byte | Danh sách BBox | Mảng struct BBox | Chứa thông tin vị trí và phân loại của $N$ đối tượng |
| **Cuối** | 2 byte | CRC-16 Checksum | `uint16` | **CRC-16/CCITT-FALSE** tính từ byte 0 đến hết danh sách BBox |

---

## 3. Cấu trúc chi tiết 8 byte của từng Bounding Box (BBox)

Mỗi mục tiêu được mã hóa trong đúng 8 byte:

| Byte | Tên trường | Kiểu dữ liệu | Đơn vị / Phạm vi | Ý nghĩa |
| :---: | :--- | :--- | :--- | :--- |
| **0–1** | `X_center` | `uint16` | pixel | Tọa độ tâm X của BBox trên khung ảnh gốc |
| **2–3** | `Y_center` | `uint16` | pixel | Tọa độ tâm Y của BBox trên khung ảnh gốc |
| **4** | `Width` | `uint8` | pixel (0–255) | Chiều rộng BBox (nếu ảnh scale chuẩn) |
| **5** | `Height` | `uint8` | pixel (0–255) | Chiều cao BBox (nếu ảnh scale chuẩn) |
| **6** | `Class_ID` | `uint8` | Enum | `1`: `person` (người trôi dạt)<br>`2`: `lifebuoy` (phao cứu sinh) |
| **7** | `Confidence` | `uint8` | 0 – 100 (%) | Mức độ tin cậy của thuật toán AI |

---

## 4. Cơ chế đồng bộ và xử lý lỗi đường truyền

1. **Phía FPGA (Vững):**
   - Khi có kết quả suy luận AI từ camera, ghi danh sách BBox vào bộ đệm FIFO UART.
   - Kéo chân `DATA_READY` lên mức HIGH trong 1–5 µs để kích hoạt ngắt trên MCU Sonix.
   - Bắt đầu truyền luồng byte qua UART. Nếu không có mục tiêu nào trong khung ảnh ($N = 0$), vẫn gửi gói tin rỗng hợp lệ (độ dài 10 byte: 2B Sync + 1B Ver + 1B Count=0 + 4B Time + 2B CRC).
2. **Phía MCU Sonix (Phong):**
   - Phía MCU sử dụng ngắt phần cứng `UART1_IRQHandler` đẩy luồng byte vào bộ đệm vòng Ring Buffer SPSC 4096 byte (Task M2), giải phóng hoàn toàn thời gian blocking của CPU và chống tràn FIFO 16 byte khi MCU đang bận phát LoRa (~300 ms).
   - Tín hiệu `DATA_READY` trên chân `P0.12` được quy hoạch kích hoạt ngắt EXTI (hiện tại firmware đang đọc kiểm tra ở mức logic/ring buffer, chờ đo kiểm tín hiệu thực tế trên bo FPGA).
   - Kiểm tra 2 byte đầu khung `0x5A 0xA5`. Nếu sai, trượt tìm lại mốc đồng bộ (Resynchronization).
   - Kiểm tra CRC-16; nếu đúng, nạp BBox vào bài toán giao điểm tia quang học tính tọa độ. Nếu sai, bỏ qua frame và tăng bộ đếm lỗi `uart_crc_err`.
