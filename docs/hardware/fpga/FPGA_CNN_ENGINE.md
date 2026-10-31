# KVC — FPGA CNN Engine (YOLO11n INT8)

- **Mã tài liệu:** `HW-FPGA-002`
- **Ngày tạo:** 31/10/2026
- **Owner:** Vững (FPGA)
- **Trạng thái:** `DRAFT` — viết trước khi sửa code, sẽ cập nhật sau mỗi Gate P3/P6
- **Bằng chứng hiện tại:** `SOURCE-VERIFIED` (đọc code), chưa `SIMULATED`

---

## 1. Phạm vi

Tài liệu mô tả engine tích chập dùng trong `KVC_PR/src/conv_engine_dynamic_fsm.v` và bảng cấu hình lớp trong `KVC_PR/rtl/gen/kvc_yolo_top.v`.

**Mục tiêu:** đủ để bất kỳ ai sửa engine có thể biết chính xác:
- Công thức requantization đúng
- Định dạng địa chỉ weight trong flash
- Giới hạn hỗ trợ (kernel, groups, channels)
- Cách sinh bảng cấu hình từ `conv_layer_map.csv`

---

## 2. Kiến trúc

```
SPI Flash (W25Q128, 16 MiB)
   │ weights INT8 @ 0x400000
   ▼
spi_flash_wrapper ──► weight_fifo ──► conv_engine_dynamic_fsm
                                          │
Input activation ─────────────────────────┤
  (line buffer 3 dòng)                    │
                                          ▼
                                     accumulator INT32
                                          │
                              + bias (int32) × mult (Q31) >> shift
                                          │
                                     clamp → INT8
                                          ▼
                                    output activation
```

### 2.1 Thông số engine

| Thông số | Giá trị | Ghi chú |
| :--- | :--- | :--- |
| MAC/cycle | 1 | Không song song; bottleneck chính |
| Độ rộng weight | 8 bit signed | INT8 per-channel symmetric |
| Độ rộng activation | 8 bit signed | INT8 symmetric |
| Accumulator | 32 bit signed | Đủ cho 27 tap × 127 × 127 |
| Multiplier | 32 bit Q31 | `mult_val` từ `mult_mem` |
| Kernel hỗ trợ | 1×1, 3×3 | **Không** hỗ trợ 5×5 |
| Stride hỗ trợ | 1, 2 | |
| Groups hỗ trợ | 1, depthwise | **Cần sửa** — hiện chưa hỗ trợ |
| Kênh vào tối đa | 256 | |

---

## 3. Công thức requantization (bắt buộc)

### 3.1 Dạng đúng

```
acc     = Σ (activation[i] × weight[i])          // INT32
scaled  = (acc × mult_q31 + ROUND) >> shift      // INT64 trung gian
out     = clamp(scaled + bias_int32, -128, 127)  // INT8
```

Trong đó:
- `mult_q31` là hệ số nhân dạng Q31, từ `quant.hex`
- `shift` là số bit dịch, từ `quant.hex`
- `ROUND = 1 << (shift - 1)` cho round-to-nearest
- `bias_int32` đã bao gồm zero-point adjustment

### 3.2 Hiện trạng code (SAI)

`KVC_PR/src/conv_engine_dynamic_fsm.v:225`:

```verilog
out_q <= clamp_q((sum_acc * mult_val) + bias_val);
```

**Ba lỗi:**

| Lỗi | Hệ quả |
| :--- | :--- |
| Không có `>> shift` | Kết quả lớn gấp `2^31` lần |
| `sum_acc * mult_val` gán vào 32 bit | Tràn; mất bit cao |
| Không round | Sai số tích lũy qua 88 lớp |

### 3.3 Dạng cần sửa

```verilog
wire signed [63:0] prod = $signed(sum_acc) * $signed({1'b0, mult_val});
wire signed [63:0] shifted = (prod + (64'sd1 << (shift - 1))) >>> shift;
wire signed [31:0] with_bias = shifted[31:0] + $signed(bias_val);
assign out_q = (with_bias > 127) ? 8'sd127 :
               (with_bias < -128) ? -8'sd128 :
               with_bias[7:0];
```

**Bắt buộc:** `shift` phải được đọc từ `quant.hex`, không hard-code 31.

---

## 4. Định dạng dữ liệu trong flash

Vùng weights bắt đầu tại `0x400000` (4 MiB).

```
0x400000  ┌──────────────────────────────┐
          │ Layer 0 weights (INT8)       │  weight_count[0] byte
          ├──────────────────────────────┤
          │ Layer 1 weights (INT8)       │  weight_count[1] byte
          ├──────────────────────────────┤
          │ ...                          │
          ├──────────────────────────────┤
          │ Layer 87 weights (INT8)      │  weight_count[87] byte
          └──────────────────────────────┘
```

**Base address mỗi lớp:** tính lũy kế từ `conv_layer_map.csv:weight_base`.

**Không căn lề 4 byte giữa các lớp** — engine đọc tuần tự.

### 4.1 Định dạng bias và quant

Tách khỏi weights, nạp vào BRAM nội:

| Tệp | Định dạng | Vị trí |
| :--- | :--- | :--- |
| `bias.hex` | INT32, hex 8 ký tự/dòng | `bias_mem.v` initial (hoặc BRAM) |
| `quant.hex` | `{mult_q31[31:0], shift[7:0]}` hoặc 2 dòng riêng | `mult_mem.v` |
| `silu_lut.hex` | INT8, 256 mục | LUT trong `activation_int8.v` |

---

## 5. Bảng cấu hình lớp

`KVC_PR/rtl/gen/kvc_yolo_top.v` hiện có **140 dòng hard-code**, trong đó **52 dòng là placeholder** và **7 dòng stride sai**.

**Bắt buộc:** sinh từ `docs/processing/conv_layer_map.csv` bằng script. Mỗi dòng cần:

```verilog
8'd<N>: begin
    p_in_w  = <iw>;  p_in_h  = <ih>;  p_in_c  = <ic>;
    p_out_w = <ow>;  p_out_h = <oh>;  p_out_c = <oc>;
    p_k_size = <k>;  p_stride = <s>; p_pad   = <pad>;
    p_groups = <g>;  p_act    = <act>;
    p_wbase  = 24'h<addr>;
    p_bbase  = <bias_idx>;
    p_qbase  = <quant_idx>;
end
```

### 5.1 Số liệu đã biết

| Chỉ số | Giá trị |
| :--- | ---: |
| Số lớp conv | **88** |
| Lớp stride 2 | **7** (`conv_00`, `conv_01`, `conv_06`, `conv_11`, `conv_21`, `conv_48`, `conv_61`) |
| Lớp grouped/depthwise | **7** (nhóm 64/128/256) |
| Tổng weights | 2.574.656 B (2,57 MB) |
| Lớp nặng nhất | `conv_21` 294.912 B |
| Tổng MAC/frame @160 | 0,197 GMAC |

---

## 6. Timing và thông lượng

### 6.1 Cycle/frame

| Giai đoạn | Cycle |
| :--- | ---: |
| Compute (1 MAC/cycle) | 0,197 G = **197 M** |
| Nạp weights (SPI 25 MB/s, 4 B/cycle @100MHz) | 643.664 B / 4 = **161 K** |
| Overhead (FSM, reset, bias) | ~5 % |

**Bottleneck: compute**, không phải SPI ở 160×160.

Ở 100 MHz: `197M / 100M` = **1,97 s/frame** = **0,5 FPS**. Đây là lý do phải nâng song song hoặc giảm resolution.

### 6.2 FPS mục tiêu 2–4 đạt được thế nào

Cần **4–8 MAC/cycle**. Các cách:

| Cách | LUT ước tính | Rủi ro |
| :--- | ---: | :--- |
| 4 MAC song song | +2.000 | Thấp |
| 8 MAC song song | +4.500 | Trung bình (DSP) |
| 16 MAC song song | +9.000 | **Vượt 20.736 LUT** với phần còn lại |

**Kết luận:** 4–8 MAC là khả thi. 16 MAC không khả thi trên GW2A-18 khi có đủ phần còn lại.

### 6.3 Ảnh hưởng của resolution

| Input | MAC/frame | FPS @4 MAC | FPS @8 MAC |
| :--- | ---: | ---: | ---: |
| 640×640 | 3,156 G | 0,13 | 0,25 |
| 320×320 | 0,789 G | 0,51 | 1,01 |
| **160×160** | **0,197 G** | **2,03** | **4,06** |

Đây là cơ sở của quyết định **B-5: input 160×160**.

---

## 7. Giới hạn và lỗi đã biết

| ID | Vấn đề | Vị trí | Trạng thái |
| :--- | :--- | :--- | :--- |
| E-01 | `weight_addr` cắt 16 bit | `conv_engine_dynamic_fsm.v:168` | **Chưa sửa** — chặn đọc flash > 64 KB |
| E-02 | Requant không shift/round | `:225` | **Chưa sửa** |
| E-03 | Không hỗ trợ groups | toàn module | **Chưa sửa** — 7 lớp depthwise fail |
| E-04 | `out_c` luôn 0 | `conv_engine_dynamic.v:103, 179` | **Chưa sửa** |
| E-05 | SPI mất byte MSB | `spi_flash_wrapper.v:151-155` | **Chưa sửa** |
| E-06 | `win_vec` cứng 3×3 | `conv_engine_dynamic_fsm.v:80, 93` | Giới hạn thiết kế, cần mở rộng |
| E-07 | `mult_mem`/`bias_mem` là dữ liệu mẫu | `bias_mem.v:21-31` | **Chưa sửa** |

> **Cập nhật 31/10/2026 (P1):** engine **tạm không nằm trong datapath** (`USE_MOCK_BBOX=1` trong `kvc_top_demo.v`). Nhờ vậy resource giảm còn 940 logic / 0,5 DSP và PnR đạt Fmax 100 MHz với 0 violation. 7 lỗi E-01→E-07 **vẫn nguyên** và sẽ kích hoạt lại khi `USE_MOCK_BBOX=0` ở P6.

### 7.1 Bảng tra lỗi

| Triệu chứng | Nguyên nhân khả dĩ | Kiểm tra |
| :--- | :--- | :--- |
| Output toàn 0 | `mult_mem` toàn 0 | Đọc `quant.hex` |
| Output toàn 127 hoặc −128 | Tràn do thiếu shift | Trigger E-02 |
| Output đúng lớp 0, sai lớp sau | `weight_addr` cắt | Trigger E-01 |
| Depthwise cho kết quả rác | Không hỗ trợ groups | Trigger E-03 |
| NMS nhận class = 0 | `out_c` luôn 0 | Trigger E-04 |
| 25 % byte weights sai | SPI mất MSB | Trigger E-05 |

---

## 8. Testbench bắt buộc

| TB | Nội dung | Ngưỡng |
| :--- | :--- | :--- |
| `tb_conv_engine_dynamic` | 1 lớp 3×3×3, weights biết trước | 0 mismatch |
| `tb_conv0_engine` | Conv0 thật với golden `verification/data/conv0/` | 0/1.638.400 mismatch |
| `tb_conv1_engine` | Conv1 với golden | 0 mismatch |
| `tb_depthwise` | 1 lớp grouped 64 nhóm | 0 mismatch |
| `tb_spi_flash_if` | Đọc 1.024 word tại `0x400000` và `0x410000` | Khớp 100 % |

Mỗi TB **phải `$fatal` khi fail**.

---

## 9. Cập nhật theo Gate

| Gate | Nội dung cập nhật |
| :--- | :--- |
| G4 (P3) | Điền kết quả 5 TB; xác nhận E-01→E-05 đã sửa; bảng timing thực |
| G5 (P4) | Cập nhật số liệu weights thật (entropy, kích thước) |
| G7 (P6) | FPS đo được trên board; bảng cycle thực tế |

---

## 10. Điều không được kết luận từ tài liệu này

- **Không** khẳng định engine đã chạy đúng — 5 lỗi E-01→E-05 vẫn mở.
- **Không** khẳng định FPS 2–4 đạt được — đó là **tính toán**, chưa đo.
- **Không** khẳng định 4–8 MAC là đủ — cần synthesis để xác nhận LUT.
- Không có `HARDWARE-VERIFIED`.
