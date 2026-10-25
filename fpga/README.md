# KVC — Phân hệ FPGA OneKiwi Primer 20K

- **Người phụ trách:** **Nguyễn Tất Vững**
- **Phần cứng mục tiêu:** Bo mạch **OneKiwi Primer 20K V1.1** (Chip Gowin GW2A-LV18PG256C8/I7)
- **Công cụ phát triển (IDE / Toolchain):** **Gowin EDA** (Gowin YunYuan)
- **Tài liệu tham khảo phần cứng:** [docs/hardware/onekiwi20k/](file:///d:/Project_UAV_KVC/docs/hardware/onekiwi20k) và [docs/hardware/fpga/CHIP_ONEKIWI_20K_GOWIN_GW2A.md](file:///d:/Project_UAV_KVC/docs/hardware/fpga/CHIP_ONEKIWI_20K_GOWIN_GW2A.md)

---

## 1. Nhiệm vụ của phân hệ FPGA

1. Thu nhận tín hiệu video từ camera quang học trên UAV qua giao diện sẽ được xác minh theo đúng camera, cáp và OneKiwi V1.1. Không giả định DVP/MIPI hoặc đầu nối trên board đã được xác nhận.
2. Xử lý ảnh sơ bộ (crop khung hình, chuẩn hóa kích thước, chuyển đổi không gian màu).
3. Đánh giá tính khả thi và chạy mạng nơ-ron nhận diện đối tượng (`person`, `lifebuoy`) sử dụng IP GoAI / bộ gia tốc CNN trên chip Gowin.
4. Đóng gói kết quả Bounding Box (BBox) và phát nối tiếp qua UART sang MCU tải Sonix SN34F788.

---

## 2. Giao diện kỹ thuật bắt buộc tuân thủ

Mọi mã nguồn đóng gói dữ liệu đầu ra UART của FPGA **bắt buộc phải tuân theo đặc tả hợp đồng**:
👉 **[docs/interfaces/IF_FPGA_MCU_UART.md](file:///d:/Project_UAV_KVC/docs/interfaces/IF_FPGA_MCU_UART.md)** và bản đồ chân Master **[docs/hardware/wiring/KVC_MASTER_PINOUT_WIRING.md](file:///d:/Project_UAV_KVC/docs/hardware/wiring/KVC_MASTER_PINOUT_WIRING.md)**

* **Baudrate:** **38.400 bps mặc định** (khi giao tiếp với MCU Sonix chạy clock nội IHRC 12 MHz; sai số −2,34 %) hoặc **115.200 bps** (khi MCU Sonix đã cấu hình SysPLL lên 48/96/192 MHz).
* **Đầu khung:** Cố định `0x5A 0xA5`.
* **Cấu trúc BBox:** 8 byte / mục tiêu (`X`, `Y`, `W`, `H`, `Class`, `Confidence`).
* **Kiểm tra lỗi:** CRC-16/CCITT-FALSE tính toàn bộ gói.
* **Tín hiệu điều khiển:** Kích hoạt chân `DATA_READY` (3.3V CMOS) báo ngắt cho MCU khi có frame mới.

---

## 3. Cấu trúc tổ chức thư mục khuyến nghị cho Vững

Khi mở Gowin EDA để khởi tạo dự án (*New Project*), Vững lưu project vào thư mục này theo cấu trúc sau:

```text
fpga/
├── gowin_project/       # Lưu file dự án Gowin EDA (*.gprj)
├── src/                 # Toàn bộ mã nguồn Verilog / SystemVerilog (*.v, *.sv)
│   ├── top.v            # Top-level module kết nối toàn bo mạch
│   ├── camera/          # Module đọc và cấu hình camera
│   ├── processing/      # Module tiền xử lý hình ảnh
│   └── comm/            # Module UART TX, bộ đệm FIFO BBox, FSM đóng gói
├── constraints/         # File cấu hình chân I/O (*.cst) và ràng buộc thời gian (*.sdc)
│   └── pins.cst         # Ràng buộc chân Header J2 sang Sonix MCU (R13, T13, R12)
├── tb/                  # [ĐÃ TÁCH BIỆT] Testbench mô phỏng độc lập (iverilog, ModelSim, Gowin Sim)
└── README.md            # Tài liệu chỉ dẫn này
```

> 📌 **File cấu hình chân đã tạo sẵn:** [constraints/pins.cst](constraints/pins.cst) đã thiết lập sẵn các chân giao tiếp trên Header J2 của OneKiwi Primer 20K V1.1:
> - `R13` (`uart_tx`, IO_TYPE=LVCMOS33) ➔ Nối `P2.3` MCU Sonix
> - `T13` (`uart_rx`, IO_TYPE=LVCMOS33) ➔ Nối `P2.2` MCU Sonix
> - `R12` (`data_ready`, IO_TYPE=LVCMOS33) ➔ Nối `P0.12` MCU Sonix

---

## 4. Lưu ý về Git và rác build nhị phân

File cấu hình [.gitignore](file:///d:/Project_UAV_KVC/.gitignore) của dự án đã tự động chặn các file build tạm của Gowin EDA:
* Thư mục `impl/` (chứa kết quả tổng hợp synthesis, place & route).
* File bitstream nạp flash `*.fs`, `*.bit`, `*.bin`.
* File waveform mô phỏng `*.vcd`.

👉 **Vững chỉ cần commit mã nguồn `.v`, `.cst`, `.sdc`, `.gprj` và các file testbench trong `tb/`.**
