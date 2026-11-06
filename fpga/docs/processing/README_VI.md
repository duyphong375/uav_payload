# KVC — phần mở rộng RTL cho YOLO11n INT8

## Nội dung bộ này

- `src/processing/conv_engine.v`: engine convolution INT8 tuần tự, NCHW input/output, OIHW weight, hỗ trợ `GROUPS` (kể cả depthwise), stride, padding đối xứng; cổng RAM synchronous-read.
- `src/processing/conv_bn_act.v`: wrapper convolution + requantization + activation. BatchNorm phải được fold vào weights/bias trước khi nạp.
- `src/processing/activation_int8.v`: ReLU, SiLU-LUT hoặc identity.
- `src/processing/line_buffer_3x3.v`: tạo cửa sổ 3x3 theo raster stream cho một channel; không tự tạo padding biên.
- `src/processing/maxpool2d.v`: max-pool INT8 signed dùng RAM đồng bộ.
- `src/processing/upsample_nearest.v`: nearest-neighbour upsample hệ số nguyên.
- `src/processing/concat_feature.v`: concat hai tensor theo trục channel NCHW.
- `src/processing/split_channels.v`: split tensor theo trục channel.
- `src/processing/residual_add_int8.v`: cộng residual có saturation, chỉ đúng khi hai toán hạng đã cùng scale/zero-point.
- `src/processing/nms_engine.v`: greedy class-aware NMS cho hộp XYXY đưa vào theo score giảm dần.
- `src/processing/layers/`: 88 wrapper theo thông số shapes/kernel/stride/padding/group từ `conv_manifest.csv`.
- `docs/conv_layer_map.csv` và `.json`: bảng ánh xạ 88 Conv từ ONNX và base address đề xuất cho weight/bias/quant ROM.
- `tools/gen_silu_lut.py`: sinh bảng SiLU 256 mục cho *một bộ scale/zero-point cụ thể*.
- `tb/tb_conv_engine_smoke.v`: smoke test cho generic Conv engine.

## Conv kế tiếp sau Conv1 đã PASS

Theo `conv_manifest.csv`, lớp Conv kế tiếp là node 6 `/model.2/cv1/conv/Conv`:

- Input `[1, 32, 160, 160]`
- Output `[1, 32, 160, 160]`
- Weights `[32, 32, 1, 1]`
- Kernel `1x1`, stride `1`, padding `0`, groups `1`
- Wrapper: `conv_02__model_2_cv1_conv_Conv.v`

Nó nằm bên trong C2f; graph trước nó cũng có activation SiLU và Split, vì vậy không được nối trực tiếp Conv1 sang Conv2 nếu chưa dựng các toán tử graph đó.

## Rất quan trọng — chưa phải full YOLO inference

Các 88 wrapper thực hiện phép MAC/accumulate/requantize *khi được cấp đúng dữ liệu*. Tuy nhiên, ONNX mà bạn cung cấp là model float; `conv_manifest.csv` chỉ nêu shape/stride/padding/weights name, không chứa bảng quantized weight, bias INT32, activation scale, multiplier/shift cho tất cả các tensor. Vì vậy bộ này chưa có đủ dữ liệu để tạo ROM weights/params chính xác hoặc một `yolo11n_top.v` end-to-end có thể khẳng định đúng.

Không dùng `conv_engine_top.v` cũ trong `rtl_gen.zip`: audit của ZIP đó đã xác định 88 Conv là placeholder pass-through và bị nối serial chain, không đại diện cho graph thật có nhánh/residual/concat/attention/detection head.

## Quy ước giao tiếp `conv_engine`

- Input/weight/bias/quant memory là các cổng bên ngoài; thiết kế cho RAM/ROM đọc đồng bộ một chu kỳ.
- `input_addr` và `output_addr` là offset tuyến tính trong tensor NCHW đang xử lý.
- `weight_addr` là offset OIHW local của lớp. Wrapper thêm `WEIGHT_BASE`.
- `bias_addr` / `quant_addr` lần lượt là kênh output + base tương ứng.
- `quant_multiplier` và `quant_shift` phải được tạo từ đúng scale input/weight/output đã chọn. Engine làm round-to-nearest ties-away-from-zero; nếu golden dùng ties-to-even, cần đổi hàm requant hoặc chứng minh không có tie ảnh hưởng kết quả.
- `INPUT_IS_SIGNED`, `INPUT_ZERO_POINT`, `OUTPUT_IS_SIGNED`, `OUTPUT_ZERO_POINT` phải khớp tensor thực.
- `output_we` là strobe ghi output. `done` báo hoàn tất toàn bộ tensor.

## Lệnh ModelSim gợi ý

Từ thư mục gốc `KVC_RTL_remaining`:

```tcl
vlib work
vlog -sv src/processing/conv_engine.v
vlog -sv tb/tb_conv_engine_smoke.v
vsim -voptargs=+acc work.tb_conv_engine_smoke
run -all
```

Sau khi smoke test đạt, biên dịch các operator riêng. Bộ này chưa được chạy bằng ModelSim/Gowin trong môi trường tạo file; cần kiểm thử ở máy bạn trước khi đưa vào project chính.
