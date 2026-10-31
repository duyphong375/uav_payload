# KVC_PR — Cấu trúc đã sắp xếp

Mở `KVC_FPGA.gprj` ngay trong thư mục này bằng Gowin EDA. Top lưu trong cấu hình là `kvc_top_demo`.

| Vị trí | Nội dung |
|---|---|
| `src/` | RTL và IP; giữ nguyên toàn bộ file tạm sinh IP |
| `rtl/gen/` | RTL được sinh tự động |
| `gen/` | Weights và bảng dữ liệu dùng cho thiết kế |
| `constraints/` | Ràng buộc timing |
| `verification/tb/` | Testbench và script chạy test |
| `verification/data/conv0/`, `conv1/` | Dữ liệu kiểm chứng |
| `verification/results/` | Kết quả kiểm chứng, trace |
| `verification/sim/` | Script biên dịch RTL mở rộng |
| `tools/` | Công cụ Python; công cụ sinh RTL cũ vẫn ở `src/processing/tools/` |
| `docs/` | Tài liệu và bảng đối chiếu đường dẫn |
| `impl/` | Cấu hình build và log lỗi cũ được giữ lại |

## Chạy từ thư mục chứa KVC_FPGA.gprj

ModelSim:

```tcl
do verification/tb/run_conv_engine_smoke.do
# hoặc:
do verification/tb/run_conv_engine_conv0_full.do
```

Python:

```powershell
python tools/gen_conv0_multiplier_fixed.py --data-dir verification/data/conv0 --out-dir verification/results/conv0_multiplier --policy ceil --strict
python tools/validate_conv0_requant.py
```

Các đường dẫn dữ liệu trong testbench và script đã được cập nhật. RTL synthesis, weights, constraints và IP không thay đổi nội dung. `docs/FILE_MOVES.csv` liệt kê đầy đủ đường dẫn cũ và mới.

## Giới hạn hiện có

Bản này vẫn là thiết kế cũ vượt tài nguyên: log lưu báo 65.385 logic (59.403 LUTs), giới hạn 20.736. Việc sắp xếp thư mục không sửa lỗi này. Chưa chạy Gowin EDA hoặc ModelSim. Một số script test cũ có thể phụ thuộc file chưa có sẵn; không bổ sung dữ liệu giả.

Tham chiếu đã thiếu từ bản gốc trong .gprj: rtl/gen/manifest.json.
