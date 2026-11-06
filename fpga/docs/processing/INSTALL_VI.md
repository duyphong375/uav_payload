# Cách chép vào project KVC_FPGA

1. Sao lưu thư mục project hiện tại.
2. Giải nén `KVC_RTL_extension.zip` trực tiếp vào thư mục gốc `KVC_FPGA` để gộp các thư mục `src`, `tb`, `tools`, `docs`, `sim`. Các file Conv0/Conv1 cũ không bị thay thế.
3. Mở ModelSim tại đúng thư mục gốc project. Chạy:

   ```tcl
   do sim/run_conv_engine_smoke.do
   ```

4. Nếu test smoke pass, chạy file compile extension:

   ```tcl
   do sim/compile_rtl_extension.do
   ```

   Đây là bước kiểm tra cú pháp/khai báo; nó không phải Golden Test cho 88 layer và không chứng minh đầy đủ graph YOLO chạy đúng.
5. Thêm các file nguồn cần dùng vào project Gowin EDA hoặc danh sách source project. Không thêm tất cả 88 wrapper vào bitstream nếu chưa có top-level graph scheduler — chúng là module cấu hình theo node.
6. Sinh LUT SiLU riêng cho tensor đang xử lý, ví dụ:

   ```bash
   python tools/gen_silu_lut.py --input-scale 0.1 --input-zero-point 0 --output-scale 0.1 --output-zero-point 0 --output silu_lut.hex
   ```

   Các scale ở lệnh ví dụ chỉ minh họa cú pháp, **không phải scale đã hiệu chuẩn cho YOLO11n**.
