# KVC_FPGA — rà soát và bản vá theo các cổng nghiệm thu
Ngày cập nhật: 2026-10-22

## 1. Đã cập nhật trong bản này

### `rtl/gen/conv_engine_dynamic.v`
- Giữ phép requantization signed 64-bit, round-to-nearest/ties-to-even, xử lý riêng `shift=0` và saturation INT8.
- Địa chỉ bias/multiplier đã chuyển sang `base + oc + write_cnt`, cho phép lấy giá trị riêng theo output channel dù giao diện dữ liệu vẫn là scalar.
- Bias được nạp tuần tự theo lane; không còn nạp một bias duy nhất vào toàn bộ 32 accumulator.
- `fifo_rd_en` chỉ bật khi FIFO không rỗng; FSM ở `ST_READ_REQ` chờ nếu FIFO rỗng, sau đó ghi nhận một từ đọc và xử lý ở `ST_READ_WAIT`.
- Mở rộng toán hạng MAC tường minh để tránh truncate do độ rộng biểu thức nhân.
- Tính `output_addr` với toán hạng 24-bit để tránh tràn trung gian 16-bit.
- Viết lại `tb/tb_conv_engine_dynamic.v` theo giao diện cửa sổ 3x3/FIFO hiện tại; test nhắm tới FIFO stall, bias từng kênh, multiplier từng kênh, địa chỉ output và timeout.

**Giới hạn còn lại của convolution engine:** đây chưa phải thiết kế convolution hoàn chỉnh có thể nghiệm thu. Giao diện hiện chưa có `win_valid/win_ready`, vì vậy không thể bảo đảm cửa sổ 3x3 ổn định trong suốt chuỗi MAC; `p_stride`, `p_pad`, `p_in_w/h/c` hiện chưa được dùng để điều khiển engine; `p_weight_base` không tham gia yêu cầu đọc FIFO; `p_oc_per_group` chưa điều khiển nhóm lane. FIFO đang được giả định là synchronous FIFO, `FirstWordFallThrough=false`, và dữ liệu bias/multiplier đang được giả định là asynchronous-read. Nếu dùng BSRAM có output register, cần thêm valid/wait handshake trước khi dùng trên phần cứng.

### `src/image_letterbox.v`
- Viết lại đồng bộ đầu vào/đầu ra theo pixel được lấy mẫu: phát R từ `in_pixel` hiện tại, sau đó phát G/B từ các thanh ghi đã chốt; tránh dùng RGB của chu kỳ cũ.
- RGB565 mở rộng full-range bằng bit replication.
- Sinh padding trên/dưới theo bộ đếm riêng và có thể xen kẽ với byte ảnh vì output ghi theo địa chỉ.
- `out_frame_done` chỉ phát sau khi đã nhận đủ frame, hoàn tất byte RGB đang phát và ghi xong padding.
- Mở `out_addr` lên 17-bit vì ảnh planar 160×160×3 cần 76.800 byte; 16-bit không đủ địa chỉ.
- Cập nhật `src/kvc_top_demo.v` để buffer ảnh có 76.800 byte và dùng địa chỉ 17-bit.
- Thêm `tb/tb_image_letterbox_sync.v` để kiểm tra RGB565, địa chỉ plane, padding và frame-done trên kích thước nhỏ.

**Giới hạn còn lại của letterbox:** giả định scale nguyên đều theo chiều rộng, và khoảng cách giữa hai pixel được lấy mẫu phải đủ để tuần tự hóa 3 byte RGB (cấu hình mặc định scale=4 đáp ứng điều này). Cần xác nhận `frame_start`, `in_valid` và số pixel thực tế từ camera bằng mô phỏng/hardware. Buffer 76.800 byte tiêu thụ khoảng 614.4 Kbit; cần kiểm tra mức sử dụng BSRAM sau synthesis để chắc chắn còn tài nguyên cho các khối khác.

### Tránh ghi đè RTL
- `src/processing/tools/gen_wrappers.py` hiện mặc định **không** ghi đè `conv_engine_dynamic.v` bằng template cũ. Chỉ dùng `--regenerate-engine-template` nếu chủ động muốn xuất template legacy và sẽ rà soát giao diện ngay sau đó.

## 2. Kiểm chứng đã chạy trong môi trường hiện tại

Lệnh:
`python tools/validate_conv0_requant.py`

Kết quả:
- Layer: `/model.0/conv/Conv`
- Tensor accumulator/golden: `[1, 16, 320, 320]`, 1.638.400 phần tử
- Q31 shift: 31
- Mismatch: `0 / 1.638.400`
- Max absolute difference: `0`

Đây là kiểm chứng **Python integer reference + hệ số Q31** với tensor golden đã lưu; không phải kiểm chứng RTL convolution.

Đã chạy kiểm tra cú pháp Python cho các script trợ giúp. Không tìm thấy `iverilog`, `verilator`, `yosys` hoặc executable Gowin trong môi trường làm việc hiện tại, nên hai testbench Verilog mới chưa được chạy. Không có kết quả synthesis/PnR/timing mới cho các thay đổi này.

## 3. Trạng thái theo cổng nghiệm thu

| Cổng | Trạng thái | Bằng chứng/điều kiện còn thiếu |
|---|---|---|
| 1. Interface + TB convolution | **Đang làm / chưa PASS** | Testbench mới đã viết; cần simulator. Cần bổ sung handshake cửa sổ, địa chỉ/handshake weight và latency memory thật trước khi coi engine đúng. |
| 2. Letterbox + pixel sync | **Đã viết lại / chưa PASS** | Có testbench nhỏ; chưa chạy RTL sim và chưa xác nhận timing camera thực. |
| 3. Camera → CDC/FIFO → CNN → NMS → UART | **BLOCKED** | `kvc_top_demo` vẫn dùng `mock_bbox`; `kvc_wrapper` còn buộc `fm_rd_data=0`, bias=0, multiplier=1 và `done=0`. Chưa có đường inference thật hoàn chỉnh. |
| 4. Regression + timing Gowin | **CHƯA CHẠY** | Cần chạy trên máy có Gowin EDA và simulator, kiểm tra compile, regression, utilization, critical path, setup/hold. |
| 5. Bitstream + phần cứng | **CHƯA ĐƯỢC PHÉP CHUYỂN TIẾP** | Chỉ làm sau khi các cổng 1–4 đạt và có log nghiệm thu. |

## 4. Trình tự tiếp theo
1. Chạy `tb_conv_engine_dynamic.v` và `tb_image_letterbox_sync.v` trong simulator; sửa tất cả lỗi compile/fail trước khi tích hợp.
2. Chốt hợp đồng `win_valid/win_ready`, thứ tự duyệt `ic/ky/kx`, FIFO read latency và latency của bias/multiplier RAM; viết reference convolution nhỏ cho kernel 1×1/3×3, stride 1/2, padding 0/1 và nhiều channel.
3. Kiểm tra `out_addr` 17-bit, buffer 76.800 byte, frame_start/frame_done và CDC camera bằng testbench dữ liệu liên tục, khoảng trống `in_valid`, reset giữa frame.
4. Tích hợp đường dữ liệu thật. Không nối `mock_bbox` vào đường chứng minh AI; bỏ toàn bộ dummy data và xác nhận output CNN qua golden vectors trước NMS/UART.
5. Chạy regression, synthesis, place-and-route và timing trên Gowin EDA; lưu log và report mới.
6. Chỉ build bitstream sau khi các bước trên PASS; sau đó xác nhận trên bo bằng camera thật, UART packet decode và log đo được.
