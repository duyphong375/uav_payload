# KVC — Handoff spec: viết lại `kvc_yolo_top` theo C-b

- **Ngày tạo:** 31/10/2026
- **Task đề xuất:** `KVC-FPGA-REPAIR-20261030-001 / P6-REWRITE`
- **Owner đề xuất:** chưa chỉ định (cần HUMAN chọn)
- **Loại:** `SPEC` — chưa phải implementation
- **Điều kiện vào:** đã hoàn thành P6-prep (6 toán tử verify, weights 88 lớp, bảng lớp đúng)
- **Điều kiện ra:** top mới build được, Fmax ≥ 100 MHz, có testbench

> ⚠️ **Đây là viết lại module, không phải sửa.** `kvc_yolo_top.v` hiện tại chưa bao giờ compile được vì instantiation không khớp port của `conv_engine_dynamic`. Toàn bộ 158 dòng cần thay.

---

## 1. Vì sao phải viết lại

| Bằng chứng | Chi tiết |
| :--- | :--- |
| Gowin `EX3937` | `Instantiating unknown module 'conv_engine_dynamic'` khi đặt top |
| `.gprj` không có file | `rtl/gen/conv_engine_dynamic.v` không nằm trong danh sách source |
| Port không tồn tại | Instantiation truyền `.p_in_w`, `.p_in_h`, `.p_out_w`, `.win_00..22`, `.fifo_rd_en`, `.bias_data`, `.quant_multiplier`, `.output_we` — không port nào có trong module |
| Thiếu toán tử | Top chỉ có conv + activation; YOLO11n cần maxpool/concat/add/split/resize |

---

## 2. Kiến trúc đích (C-b)

### 2.1 Model rút gọn

```
Input 160x160x3 INT8
  ↓
[C3k2 blocks]  ← conv + maxpool + add, KHÔNG có C2PSA attention
  ↓
[SPPF]         ← sppf_block (đã verify)
  ↓
[Neck]         ← concat_n_feature + upsample_nearest (đã verify)
  ↓
[Head]         ← conv 1x1 → anchor-free decode (KHÔNG có DFL)
  ↓
[NMS]          ← yolo_nms (đã verify)
  ↓
BBox qua UART
```

**Bỏ khỏi graph:** `MatMul`, `Softmax`, `Transpose` (C2PSA), `Reshape` cho DFL, `Split` (C2PSA) — trừ khi chọn thay C2PSA bằng conv.

**Giữ:** `Conv`, `MaxPool`, `Concat`, `Add`, `Resize`, `Split` (nếu dùng cho head).

### 2.2 Sáu module đã sẵn sàng

| Module | Port chính | Testbench |
| :--- | :--- | :--- |
| `conv_engine_dynamic_fsm` | `start`, `p_stride/p_pad/p_groups/p_weight_base`, `win_valid/win_data`, `bias_req/addr/rdata/rvalid`, `mult_req/addr/rdata/rvalid`, `out_valid/out_x/out_y/out_c/out_q/out_addr` | `tb_conv0_golden` 1026/1026, `tb_conv0_real` 1026/1026, `tb_depthwise` 146/146 |
| `maxpool2d` | `start`, `input_addr/input_data`, `output_we/addr/data` | `tb_maxpool2d` 4/4 |
| `concat_n_feature` | `start`, `segment_addr[N*AW]`, `segment_data[N*8]`, `output_we/addr/data` | `tb_concat_n_feature` 3/3 |
| `split_channels` | `start`, `input_addr/data`, `a_we/addr/data`, `b_we/addr/data` | `tb_split_channels` 3/3 |
| `upsample_nearest` | `start`, `input_addr/data`, `output_we/addr/data` | `tb_upsample_nearest` 3/3 |
| `residual_add_int8` | `a`, `b` → `y` (combinational) | `tb_residual_add_int8` 65536/65536 |
| `sppf_block` | `start`, `input_raddr/rdata`, 3 bộ `sN_raddr/rdata/we/waddr/wdata`, `output_we/addr/data` | `tb_sppf_block` 64/64 |

---

## 3. Việc phải làm

### 3.1 Chốt kiến trúc (chưa làm được)

Ba câu hỏi phải trả lời trước khi viết RTL:

| # | Câu hỏi | Ảnh hưởng |
| ---: | :--- | :--- |
| 1 | Bỏ C2PSA hoàn toàn hay thay bằng conv 3×3? | Nếu bỏ hẳn: train lại từ đầu, mAP có thể giảm 3–5 điểm. Nếu thay conv: cần thêm 1 lớp conv, không cần `split_channels` |
| 2 | Anchor-free (bỏ DFL) hay anchor-based? | Anchor-free ít RTL hơn; anchor-based cần thêm decode + RTL cho anchor grid |
| 3 | Input 160×160 hay 320×320? | 160: 0,197 GMAC, 97 KiB activation. 320: 0,789 GMAC, 388 KiB (vượt BSRAM) |

**Khuyến nghị:** bỏ C2PSA thay bằng conv 3×3, giữ anchor-free, input 160×160.

### 3.2 Cấu trúc module mới

```verilog
module kvc_yolo_top (
    input  wire        clk,
    input  wire        rst_n,
    input  wire        start_frame,

    // Camera input: 160x160x3 INT8 qua FIFO
    output wire        cam_rd_en,
    input  wire [7:0]  cam_rd_data,
    input  wire        cam_empty,

    // Feature map RAM ngoài (line-buffer thay vì frame-buffer)
    output wire [23:0] fm_wr_addr,
    output wire [7:0]  fm_wr_data,
    output wire        fm_wr_en,
    output wire [23:0] fm_rd_addr,
    input  wire [7:0]  fm_rd_data,

    // Weights (SPI flash)
    output wire        spi_cs, spi_sclk, spi_mosi,
    input  wire        spi_miso,

    // Bias / quant (BRAM nội)
    output wire [15:0] bias_addr,
    input  wire signed [31:0] bias_rdata,
    output wire [15:0] mult_addr,
    input  wire [39:0] mult_rdata,

    // Output
    output reg         frame_done,
    output reg  [7:0]  debug_layer_idx,
    output reg         debug_busy
);
```

**Khác biệt so với top cũ:**

| Top cũ (sai) | Top mới |
| :--- | :--- |
| `fifo_rd_data [255:0]` (32 byte/lần) | `win_data [215:0]` (27 byte = 3×3×3) |
| `bias_data` 1 port | `bias_req/addr/rdata/rvalid` 4 port |
| `quant_multiplier` + `quant_shift` | `mult_rdata [39:0]` gộp |
| `output_we/addr/data` | `out_valid/x/y/c/q/addr` |
| Không có `p_groups` | Có `p_groups` |

### 3.3 Sửa `line_buffer`

`line_buffer_3x3.v` cần cấp **27 byte** (3×3×3), không phải 9 byte (3×3×1).

| Hiện tại | Cần |
| :--- | :--- |
| `DATA_W=8`, 3 mảng 640 phần tử | `DATA_W=8`, 3 mảng × 3 kênh = 9 mảng |
| Xuất `win_00..win_22` (9 port) | Xuất `win_data [215:0]` packed |
| `ADDR_W=10` (1024) | `ADDR_W ≥ 17` (76.800) hoặc thiết kế lại theo plane |

### 3.4 Sinh bảng điều khiển lớp

`layer_table.vh` đã có 88 dòng đúng. Nhưng top mới cần biết **loại toán tử** mỗi bước, không chỉ conv:

```verilog
// Vi du FSM
case (layer_idx)
  8'd0:  op = OP_CONV;
  8'd1:  op = OP_CONV;
  ...
  8'd35: op = OP_CONV;   // grouped conv (attention pe)
  8'd36: op = OP_CONCAT; // concat trong C3k2
  ...
endcase
```

Cần sinh thêm một bảng `op_type[0..87]` từ graph ONNX.

### 3.5 Testbench bắt buộc

| TB | Nội dung | Ngưỡng |
| :--- | :--- | :--- |
| `tb_kvc_yolo_top_smoke` | 1 lớp conv, weights biết trước | 0 mismatch |
| `tb_kvc_yolo_top_conv0` | conv0 với golden `conv0_real` | 0 mismatch |
| `tb_kvc_yolo_top_full` | 1 ảnh 160×160, so với ONNX Runtime | Sai khác < 1 LSB sau clamp |

---

## 4. Ước lượng

| Việc | Thời gian | Ghi chú |
| :--- | ---: | :--- |
| Chốt kiến trúc (§3.1) | 1 giờ | Cần HUMAN quyết |
| Viết lại top (§3.2) | 2 ngày | 400–600 dòng Verilog |
| Sửa `line_buffer` (§3.3) | 1 ngày | Cần testbench mới |
| Sinh bảng `op_type` (§3.4) | 4 giờ | Script Python |
| Testbench (§3.5) | 1 ngày | 3 TB |
| Build + timing closure | 1 ngày | Nhiều vòng synthesis |
| **Tổng** | **5–6 ngày** | Không tính kit |

**Rủi ro:** nếu Fmax < 100 MHz sau khi thêm engine, có thể phải pipeline NMS hoặc hạ clock về 50 MHz. Thêm 1–3 ngày.

---

## 5. Điều không được làm

| Việc | Lý do |
| :--- | :--- |
| Thêm `conv_engine_dynamic.v` vào `.gprj` rồi build top cũ | Module đó thiếu cơ chế multi-channel (E-04), kết quả sai |
| Sửa instantiation cũ để khớp port `conv_engine_dynamic` | Sẽ phải viết lại engine — dùng `_fsm` đã verify |
| Bỏ testbench vì "đã có 6 TB toán tử" | 6 TB đó test từng module, không test **top-level** |
| Đánh dấu `HARDWARE-VERIFIED` khi mới `SIMULATED` | Vi phạm `AGENTS.md` |
| Bật `USE_MOCK_BBOX=0` trước khi top mới PASS | Không có đường dữ liệu |

---

## 6. Câu hỏi mở

| # | Câu hỏi | Ảnh hưởng |
| ---: | :--- | :--- |
| 1 | Ai là FIX OWNER cho P6-REWRITE? | Cần HUMAN chọn CODER đủ quyền |
| 2 | Có GPU để train lại model C-b không? | Nếu không, phải giữ anchor-free và chỉ bỏ C2PSA |
| 3 | Mục tiêu FPS tối thiểu sau P6? | Ảnh hưởng quyết định có pipeline NMS hay không |
| 4 | Có cần giữ tương thích với bitstream hiện tại không? | Nếu có, phải làm thêm wrapper |
