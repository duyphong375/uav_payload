# Những khối chưa thể tuyên bố hoàn tất

Không đưa các file pass-through hoặc chuỗi Conv giả vào package này.

## Vì sao chưa có `c2f_block.v` hoàn chỉnh?

C2f không chỉ là một phép concat. Nó gồm Conv+SiLU, Split, một/nhiều bottleneck có Conv+SiLU và Add residual, concat các nhánh rồi Conv chiếu cuối. Số bottleneck, channels, feature-buffer mapping và scale/zero-point của từng tensor phải được xác lập theo từng node trong graph. Các operator cơ sở `conv_engine`, `activation_int8`, `split_channels`, `concat_feature`/`concat_n_feature`, `residual_add_int8` đã được cung cấp để ráp block và kiểm thử từng phần.

## Vì sao chưa có `detect_head.v` end-to-end và `yolo11n_top.v`?

ONNX graph report cho biết graph có 321 node, bao gồm `Conv`, `Sigmoid`, `Mul`, `Split`, `Add`, `Concat`, `MaxPool`, `MatMul`, `Softmax`, `Transpose`, `Reshape`, `Resize`, `Slice`, `Sub`, `Div`. Detection head còn có DFL/softmax, reshape/transpose và decode box. Cần xác định cách lượng tử hóa các tensor và format fixed-point của tọa độ trước khi viết head/NMS chain.

Bản ONNX hiện là float và manifest hiện có chỉ mô tả các Conv: shape, kernel, stride, padding, dilation, groups và tên initializer. Nó chưa phải file ROM INT8 hoàn chỉnh cho 88 lớp. `conv_layer_map.csv` chỉ đề xuất địa chỉ base theo thứ tự Conv; nó không tự sinh giá trị weights/bias/multiplier đúng.

Khi có file weight INT8/bias INT32/scale table cho tất cả lớp cùng kế hoạch bộ nhớ tensor, lúc đó mới nên tạo C2f controller, attention block, detection head và top-level scheduler. Nếu viết `yolo11n_top.v` bây giờ theo chuỗi đơn thì sẽ sai graph, vì graph có nhiều nhánh.
