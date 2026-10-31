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
| E-01 | `weight_addr` cắt 16 bit | `conv_engine_dynamic_fsm.v:226` | ✅ **FIXED** — giữ 24 bit |
| E-02 | Requant không shift/round | `:302` | ✅ **FIXED** — Q31 + ties-to-even |
| E-03 | Không hỗ trợ groups | `:11, 90-98, 218-270` | ✅ **FIXED** — thêm `GROUPS`, `p_groups`, `ic_g`; `tb_depthwise` PASS 146/146 |
| E-04 | `conv_engine_dynamic.v` chưa hoàn chỉnh | `rtl/gen/conv_engine_dynamic.v` | ⏸ **MỞ — không phải lỗi `out_c` đơn lẻ** |
| E-05 | SPI mất byte MSB | `spi_flash_wrapper.v:151-155` | ✅ **FIXED** — `rdata <= {rx_data, word_buf[23:0]}` |
| E-06 | `win_vec` cứng 27 phần tử | `conv_engine_dynamic_fsm.v:98` | ✅ **FIXED** — `WIN_ELEMS = IN_C*K*K` |
| E-07 | `bias_mem`/`mult_mem` dữ liệu mẫu | `bias_mem.v`, `mult_mem.v` | ⏸ **MỞ** — đã zero hoá + tách `shift`, chờ calibration thật |
| E-08 | Engine dùng lại window pixel đầu | FSM `ST_EMIT` | ✅ **FIXED** |
| E-09 | `sum_acc` không reset khi sang pixel | FSM `ST_EMIT` | ✅ **FIXED** |

### E-04 chi tiết — vì sao không sửa được bằng cách thêm biến `oc`

Review lượt 2 mô tả E-04 là "`out_c` luôn 0" ở `conv_engine_dynamic.v:103,179`. Khi kiểm tra thực tế, module này **thiếu toàn bộ cơ chế multi-channel**:

| Dòng | Hiện tại | Vấn đề |
| ---: | :--- | :--- |
| `:139` | `bias_addr <= ox` | Địa chỉ bias phải là `oc`, không phải toạ độ X |
| `:142` | `mult_addr <= oy` | Địa chỉ mult phải là `oc`, không phải toạ độ Y |
| `:145` | `weight_addr <= (oy * IMG_W) + ox` | Phải là `oc*IN_C*K*K + ic*K*K + ky*K + kx` |
| `:168-172` | Vòng lặp `i` cộng **tất cả** tap vào `acc` trong 1 chu kỳ | Không có thanh ghi `ic/ky/kx`; `acc` cộng dồn 27 lần nonblocking → chỉ giữ giá trị cuối |
| `:169-171` | Nhân **3 toán hạng** `win * weight * mult` | Requant phải làm SAU tích lũy, không xen vào từng tap |
| `:179` | `out_c <= 16'd0` | Hệ quả của việc không có `oc` |

⇒ Module này là **khung chưa hoàn chỉnh**, không phải bản có 1 bug. Sửa đúng = viết lại theo kiến trúc của `conv_engine_dynamic_fsm.v` (đã verify).

**Quan trọng:** `kvc_yolo_top.v:1073` instantiate `conv_engine_dynamic` (**bản chưa hoàn chỉnh**), KHÔNG phải `conv_engine_dynamic_fsm` (bản đã sửa và verify 1026/1026). Nghĩa là bật `USE_MOCK_BBOX=0` hiện tại sẽ dùng engine sai.

**Việc cần làm ở P6:** đổi `kvc_yolo_top.v:1073` sang `conv_engine_dynamic_fsm`, hoặc port các sửa E-01/E-02/E-03/E-06 sang `conv_engine_dynamic`. Cách thứ nhất ít rủi ro hơn.

### P6 — Kết quả khảo sát (31/10/2026): KHÔNG THỂ tích hợp trong 1 bước

Ba phát hiện chặn P6:

**1. `kvc_yolo_top.v` chưa bao giờ compile được.**

Instantiation `u_eng` (dòng 112-129) truyền các port **không tồn tại** trong `conv_engine_dynamic.v`:

| Port trong instantiation | Có trong module? |
| :--- | :---: |
| `.p_in_w`, `.p_in_h`, `.p_in_c` | ❌ |
| `.p_out_w`, `.p_out_h`, `.p_out_c` | ❌ |
| `.p_k_size`, `.p_ic_per_group`, `.p_oc_per_group` | ❌ |
| `.win_00` … `.win_22` (9 port riêng) | ❌ (module dùng `win_data` packed) |
| `.fifo_rd_en`, `.fifo_rd_data`, `.fifo_empty` | ❌ |
| `.bias_data`, `.quant_multiplier`, `.output_we` | ❌ |

Bằng chứng: Gowin báo `ERROR (EX3937): Instantiating unknown module 'conv_engine_dynamic'` khi đặt `kvc_yolo_top` làm top — vì `.gprj` **không có** `conv_engine_dynamic.v` trong danh sách source. Module chưa từng được synthesis.

**2. `kvc_yolo_top` chỉ có conv + activation, không đủ graph YOLO11n.**

| Thành phần ONNX | Có trong `kvc_yolo_top`? |
| :--- | :---: |
| Conv | ✅ |
| SiLU/activation | ✅ (`activation_dynamic`) |
| MaxPool (3) | ❌ |
| Concat (21) | ❌ |
| Add/residual (16) | ❌ |
| Split (10) | ❌ |
| Resize/upsample (2) | ❌ |
| MatMul/Softmax (attention C2PSA) | ❌ |
| DFL decode | ❌ |

⇒ Kể cả sửa được interface, module này chỉ chạy được các nhánh thuần conv, không phải YOLO11n.

**3. Bảng lớp đã sửa nhưng chưa dùng được.**

Đã sinh `layer_table.vh` (88 dòng, 7 stride=2, 7 grouped, 0 placeholder, verify 0 mismatch so với CSV) và thay vào `kvc_yolo_top.v`. Nhưng bảng này chỉ có tác dụng khi engine được nối đúng — hiện engine chưa compile.

### Việc thực sự cần cho P6

| # | Việc | Ước lượng |
| ---: | :--- | ---: |
| 1 | Viết lại `kvc_yolo_top.v` theo interface `conv_engine_dynamic_fsm` (win_data packed, bias/mult req/rvalid) | 2–3 ngày |
| 2 | Bổ sung RTL cho MaxPool/Concat/Add/Split/Resize | 1–2 tuần |
| 3 | Bổ sung RTL cho attention C2PSA (MatMul/Softmax) hoặc loại nhánh đó khỏi model | 1–2 tuần |
| 4 | DFL decode + NMS theo class | 3–5 ngày |
| 5 | Nạp weights, verify end-to-end trên 1 ảnh | 2–3 ngày |

**Tổng: 4–6 tuần**, không phải một bước tích hợp.

### Đề xuất thay thế: model rút gọn

Nếu mục tiêu là "có AI chạy trên FPGA" trong thời gian ngắn, hướng khả thi hơn:

| Phương án | Nội dung | Thời gian |
| :--- | :--- | ---: |
| **Rút gọn graph** | Train lại model chỉ giữ conv + SiLU + maxpool (bỏ C2PSA attention, bỏ DFL — dùng anchor-based head). Cần train lại từ đầu. | 2–3 tuần |
| **Chỉ dùng `kvc_yolo_top` hiện tại** | Chấp nhận chạy **1 lớp conv** như testbench, không phải YOLO | Đã có |
| **Giữ nguyên mock bbox** | Bitstream hiện tại: camera → mock → UART. Dùng để bring-up, không có AI. | Đã có |

**Khuyến nghị:** hoàn thành bring-up phần cứng (G2/G6) trước, vì 4–6 tuần P6 chỉ có nghĩa nếu đường UART/camera đã chứng minh chạy thật.

### Kết quả verify (P3/P4, 31/10/2026)

**Golden độc lập** sinh bởi `tools/gen_conv0_golden.py` (Python, không dùng RTL):
- Seed `20261031`, config 3×3×3 → 16 out, 8×8 pixel, pad 1, stride 1, shift 31
- `tb_conv0_golden` **PASS 1026/1026, 0 FAIL**, `win_pulse=64` (= 8×8 pixel)

**Weights thật từ YOLO11n** (`tools/gen_conv0_real.py` đọc ONNX):
- Nguồn: `yolo11n_2class_best.onnx`, tensor `model.0.conv.weight` `[16,3,3,3]` + `model.0.conv.bias` `[16]`
- Per-output-channel symmetric INT8, `input_scale = 1/255`
- `bias.hex` = `[4, 1, 4, 13, ...]`, `quant.hex` shift 41–42, mult 0.59–0.99 × 2^31
- `tb_conv0_real` **PASS 1026/1026, 0 FAIL**, `win_pulse=64`

Đây là test **đầu tiên** trong repo chứng minh engine đúng số học **với dữ liệu model thật**, vì `verification/data/` trước đó **hoàn toàn rỗng**.

**Giới hạn cần ghi rõ:**

| Hạng mục | Trạng thái |
| :--- | :--- |
| Weights nguồn | ✅ Thật, từ ONNX YOLO11n |
| Activation test | ⚠️ Sinh giả lập `[-64, 64]`, **không phải ảnh thật** |
| `output_scale` | ⚠️ **Giả định** `input_scale × 128.5`, **chưa calibration** |
| Resolution | ONNX là 640×640, nhưng conv0 `[16,3,3,3]` độc lập resolution — dùng được cho 160 |
| Độ chính xác model | ❌ Không đánh giá được từ test này; cần calibration set thật |

**Không được kết luận:** test này chứng minh **số học engine đúng**, không chứng minh **model chính xác** hay **INT8 không mất mAP**.

### Công thức quant đúng (ghi để tránh lặp lỗi)

```
out_q = clamp( round_ties_even( (acc * mult_q31) >> shift ) + bias_q , -128, 127 )

Trong đó:
  weight_q  = round(w_fp / w_scale)            w_scale = max|w_fp| / 127  (per-channel)
  bias_q    = round(bias_fp / out_scale)        ← CHIA CHO out_scale
  mult_q31  = round( (input_scale * w_scale / out_scale) × 2^(31-e) )
  shift     = 31 - e,  e chọn để mult ∈ [2^30, 2^31)
```

**Lỗi đã mắc và sửa ở P4:** ban đầu đặt `bias_q = bias_fp / (input_scale × w_scale)`. Sai vì `bias` được cộng **sau** requant (đơn vị output), không phải trước (đơn vị accumulator). Kết quả: `bias_q` lớn gấp ~128 lần → 896/1024 output bão hoà về 127.

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
| G4 (P3) | ✅ 5 TB PASS; E-01/E-02/E-08/E-09 FIXED; bảng timing thực |
| G5 (P4) | ✅ Weights thật từ ONNX; `tb_conv0_real` PASS 1026/1026 |
| **P6-prep (31/10/2026)** | ✅ E-03 (groups) + E-05 (SPI MSB) + E-06 (`win_vec`) FIXED; `tb_depthwise` PASS 146/146 |
| G7 (P6) | FPS đo được trên board; bảng cycle thực tế |

### Bảng testbench hiện có

| TB | Nội dung | Kết quả |
| :--- | :--- | :--- |
| `tb_conv0_golden` | Golden độc lập, `GROUPS=1` | **PASS 1026/1026** |
| `tb_conv0_real` | Weights thật YOLO11n, `GROUPS=1` | **PASS 1026/1026** |
| `tb_depthwise` | `GROUPS=C=4`, weight `[4][1][3][3]` | **PASS 146/146** |
| `tb_uart_tx` | Framing 8N1, start bit | **PASS 29/29** |
| `tb_bbox_packetizer` | Little-endian vs parser C MCU | **PASS 103/103** |
| `tb_kvc_top_demo` | Top-level mock path | **PASS 4/4** |
| `tb_async_fifo_cdc` | CDC FIFO | **PASS** (TB cũ, không assertion) |

**Chưa có TB cho:** `spi_flash_wrapper` (E-05 sửa nhưng chưa verify bằng simulation — cần mô hình SPI flash slave).

---

## 10. Điều không được kết luận từ tài liệu này

- **Không** khẳng định engine đã chạy đúng — 5 lỗi E-01→E-05 vẫn mở.
- **Không** khẳng định FPS 2–4 đạt được — đó là **tính toán**, chưa đo.
- **Không** khẳng định 4–8 MAC là đủ — cần synthesis để xác nhận LUT.
- Không có `HARDWARE-VERIFIED`.
