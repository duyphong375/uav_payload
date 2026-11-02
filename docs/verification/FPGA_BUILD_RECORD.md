# KVC — Hồ sơ build bitstream FPGA

- **Ngày lập:** 31/10/2026 (cập nhật 01/11/2026)
- **Mục đích:** định danh chính xác bitstream nào đã được build, từ source nào,
  bằng tool nào. `KVC_PR/impl/` bị `.gitignore` nên `.fs` không nằm trong Git —
  nếu không ghi ở đây thì không ai tái lập được.
- **Mức bằng chứng:** `BUILT` + `SIMULATED`. **Không phải** `HARDWARE-VERIFIED`.
  Chưa có bo nào nhận bitstream này tại thời điểm lập hồ sơ.

---

## 1. Bitstream hiện tại (01/11/2026 — blob detect, T13)

| Trường | Giá trị |
| :--- | :--- |
| Đường dẫn | `KVC_PR/impl/pnr/KVC_FPGA.fs` |
| SHA-256 | `86CCF5DDAA12DED9D66C9729E27EBB828FF3A3D2B1B46170E79B61277C38ED13` |
| Git HEAD khi build | `2be0f05f92a0a31e0bd80d237eff2da939995e78` (working tree có thay đổi chưa commit) |
| Thời điểm build | 2026-11-01 15:12 (Asia/Saigon) |
| Tool | Gowin V1.9.11.03 Education x64 (`C:\Gowin\Gowin_V1.9.11.03_Education_x64`) |
| Device | GW2A-LV18PG256C8/I7 (GW2A-18, version C) |
| Top module | `kvc_top_demo` |
| Cấu hình | `BBOX_SOURCE = 1`, `DIAG_MODE = 0` — **BBox tính từ pixel thật**, không có YOLO11n / conv engine |
| Đặc điểm sửa đổi | Thêm `kvc_blob_detect` (threshold RGB565 + color dominance, 0 BSRAM); mux 3 nguồn BBox; `set_false_path` CDC `cam_pclk → clk_100m` |
| Lệnh build | `gw_sh tools/build_kvc_fpga.tcl` (chạy trong `KVC_PR/`) |

Mã kế hoạch: `KVC-FPGA-BLOB-20261101-001`. Chi tiết và bằng chứng testbench:
`evidence/KVC-FPGA-BLOB-20261101-001_T1-T13.md`.

Bản sao cục bộ: `review/artifacts/KVC_FPGA_release_86CCF5DD.fs`.

**Đã nạp bo 01/11/2026** — SRAM Program trên OneKiwi Primer 20K, camera OV2640.
Chạy 136 khung IF-01 hợp lệ, 0 lỗi CRC, 0 byte rác. Chi tiết:
`evidence/KVC-FPGA-G0G6-20261101-001.md`.

### 1.0a Kiểm lại baseline 01/11/2026 (task B0 / `KVC-FPGA-BASE-001`)

| Kiểm tra | Kết quả |
| :--- | :--- |
| `Get-FileHash KVC_PR/impl/pnr/KVC_FPGA.fs -Algorithm SHA256` | `86CCF5DDA…38ED13` — **khớp dòng §1** |
| `git rev-parse HEAD` | `2be0f05f92a0a31e0bd80d237eff2da939995e78` — **khớp dòng §1** |
| Working tree của `KVC_PR/` | **CÒN 9 file sửa + 10 file chưa track** (xem `git status --short`) |
| Kết luận baseline | **CHƯA ĐÓNG (H6 blocking)** |

**Việc còn phải làm trước khi nạp bo (H6):** HUMAN duyệt commit theo phân hệ cho
`KVC_PR/` (`ov2640_config.v`, `sccb_master.v`, `kvc_top_demo.v`, `mock_bbox.v`,
`uart_tx.v`, `constraints/kvc_top_demo.sdc`, `KVC_FPGA.gprj`, 2 TB đã sửa) và
10 file chưa track (`kvc_blob_detect.v`, `build_kvc_fpga.tcl`, 8 TB mới). Nếu
không commit, `.fs` đang có **không tái lập được từ HEAD** dù SHA khớp tài liệu.

Bitstream hiện tại vẫn được coi là hợp lệ để nạp **thử** (SHA khớp hồ sơ), nhưng
mọi kết quả G0/G6/A1–A10 phải ghi kèm "working tree dirty, HEAD `2be0f05`" cho
tới khi H6 được duyệt.


### 1.0 Build diag Gate G0.1 (`BBOX_SOURCE=0`, `DIAG_MODE=1`)

| Trường | Giá trị |
| :--- | :--- |
| SHA-256 | `3620B802C010993DCF98E56691C5496132CB5347D6776D5B5EAA88BD5DFC5EBB` |
| Cấu hình | `BBOX_SOURCE = 0`, `DIAG_MODE = 1` |
| Fmax `clk_100m` / `cam_pclk` | 127,823 MHz / 170,149 MHz; TNS setup & hold = 0 |
| LUT / Register / BSRAM / DSP | 1.349 / 839 / 1 / 0,5 |
| Bản sao cục bộ | `review/artifacts/KVC_FPGA_diag_3620B802.fs` |
| Mục đích | Nạp cho G0.3 (`x` tăng 27–33 đơn vị/giây) và G0.4 (`y = 1`) |
| Trạng thái | `BUILT`. **Chưa nạp bo.** G0.3/G0.4 đã đạt **gián tiếp** qua bản release `86CCF5DD` ngày 01/11/2026 (§8) — không qua thủ tục diag |

### 1.0b Bitstream blob trước khi sửa cảnh báo `EX1998`

| Trường | Giá trị |
| :--- | :--- |
| SHA-256 | `814A9987AD685DA97DB43BC64BF900E0C4AD187A015CE45C7E6AFBFA8BDC1D28` |
| Khác biệt | Cùng timing/tài nguyên với bản hiện tại; chỉ thiếu gán 0 cho `cnn_out_*` nên có 8 cảnh báo `EX1998` |
| Bản sao cục bộ | `review/artifacts/KVC_FPGA_release_814A9987.fs` |

### 1.0b2 Bitstream CHẨN ĐOÁN TỰ ĐO VSYNC (`DIAG_MODE = 2`) — 02/11/2026

| Trường | Giá trị |
| :--- | :--- |
| SHA-256 | `C82B9EFE7F6D7232867FB552495F8E76BF367D4CCA1DE666473843F9E171764C` |
| Cấu hình | `BBOX_SOURCE = 1`, `DIAG_MODE = 2`, `DIAG_TICK_HZ = 10_000`, `DIAG_WINDOW_MS = 2_000` |
| Top module | **`kvc_top_diag_vsync`** (wrapper), không phải `kvc_top_demo` |
| File constraint | `constraints/kvc_cam_pclk.sdc` (khác `kvc_top_demo.sdc` ở đường dẫn PLL: `u_top/`) |
| Fmax `clk_100m` / `cam_pclk` | **105,030 MHz** / **167,628 MHz**; TNS setup & hold = 0 trên cả `clk_27m`, `clk_100m`, `cam_pclk` |
| LUT / Register / BSRAM / DSP | 2.437 / 2.100 / 1 / 0,5 (như bản release; đều dưới ngưỡng) |
| Đường tới hạn | `bbox_packetizer` **11,757 ns** — **không phải** `vsync_monitor` (xem ghi chú dưới) |
| Bản sao cục bộ | `review/artifacts/KVC_FPGA_diag_vsync_C82B9EFE.fs` |
| Script build | `KVC_PR/tools/build_kvc_diag_vsync.tcl` (dùng `gw_sh`) |
| Trạng thái | **BUILT** — **chưa nạp bo** |

**Thay đổi RTL kèm theo (đều đã test):**

| File | Thay đổi | Test |
| :--- | :--- | :--- |
| `src/comm/bbox_packetizer.v` | **F-04**: chốt `timestamp` vào `ts_lat` tại `start`, header đọc từ bản chốt | `tb_bbox_packetizer` **109/109 PASS**, gồm 3 case F-04; phép thử âm xác nhận bắt được lỗi |
| `src/processing/vsync_monitor.v` | **MỚI** — đo chu kỳ VSYNC bằng clock nội, không tru 32 bit | `tb_vsync_monitor` **28/28 PASS** |
| `src/processing/vsync_report.v` | **MỚI** — đóng gói 10 slot kết quả vào khung IF-01 `N = 10` | `tb_vsync_selfmeas` **10/10 PASS** |
| `src/kvc_top_diag_vsync.v` | **MỚI** — wrapper cắm `DIAG_MODE = 2` (không sửa mặc định trong `kvc_top_demo.v`) | build OK |
| `src/kvc_top_demo.v` | thêm `DIAG_TICK_HZ` / `DIAG_WINDOW_MS` là `parameter`; thêm nhánh `DIAG_MODE = 2` | `tb_vsync_diag` **6/6**, `tb_kvc_top_blob` **8/8**, `tb_kvc_top_demo_uartlink` **5/5** |

**Vì sao Fmax chỉ 105,030 MHz chứ không cao hơn:** đường tới hạn đã **rời khỏi** `vsync_monitor` và quay về `bbox_packetizer` (`cur_bbox_i_0_s0` → `uart_tx_data_4_s0`, 11,757 ns). Bản `vsync_monitor` đầu tiên đo bằng `now_ms − prev_ms` (trừ 32 bit) và **giữ kỷ lục xấu**: Fmax 100,153 MHz, chỉ hơn ngưỡng 0,15 %. Đổi sang bộ đếm reset-theo-VSYNC đưa Fmax lên 105,030 MHz và giảm 234 LUT.

**Cấu hình `WINDOW_MS = 2.000` là bắt buộc trên bo, không phải tuỳ chọn.** Ở 4,28 Hz, cửa sổ 1 s chỉ có ~4 xung; một lần lệch là 25 %. Testbench dùng `DIAG_TICK_HZ = 1 MHz` / `WINDOW_MS = 200` chỉ để mô phỏng nhanh — **không** nạp cấu hình đó lên bo.

### 1.0c Bitstream trước đó (camera-capable, mock BBox) — dùng để rollback

| Trường | Giá trị |
| :--- | :--- |
| SHA-256 | `948D697E537D8C7A6529224F59B17A388675B951D79DDE41445F6232270B9423` |
| Cấu hình | `USE_MOCK_BBOX = 1` (nay là `BBOX_SOURCE = 0`) |
| Fmax `clk_100m` | 107,447 MHz |
| Bản sao cục bộ | `review/artifacts/KVC_FPGA_948D697E.fs` (thư mục `review/` bị Git ignore) |

### 1.1 Bitstream trước đó (đã nạp bo 31/10, dùng cho G2)

| Trường | Giá trị |
| :--- | :--- |
| SHA-256 | `70460C92DC4C37138C06847B0C7A97C639851AFCC737F94C0082B014ED9FE5C5` |
| Fmax `clk_100m` | 129,149 MHz |
| Camera config | **bảng cũ 38 thanh ghi — KHÔNG hoạt động** |
| Bằng chứng | `evidence/capture_01.bin` (G2.2), `evidence/G2.4_mcu_log_20261031.md` (G2.4) |

### 1.2 Bitstream trung gian (01/11, bảng 224 thanh ghi, CHƯA sửa FSM)

| Trường | Giá trị |
| :--- | :--- |
| SHA-256 | `A1047050BA7787236BD16977471B6B76EE0117295BC29A01C54B77893F5FFAC4` |
| Fmax `clk_100m` | 123,658 MHz |
| Đặc điểm | Bảng 224 thanh ghi, nhưng FSM chạy vòng vô hạn (`start` nối mức `pll_lock`) |
| Đo trên bo | shortfall 70 ms (chưa nối XCLK) → 145 ms (sau khi nối XCLK pin 18) |

Bitstream trước đó chỉ thay khối camera và dùng mock BBox. Bitstream hiện tại
(`86CCF5DD`) thay khối camera **và** nguồn BBox (blob thật), nên kết quả
G2.2/G2.4 chỉ còn hiệu lực cho **đường mock** — không dùng để kết luận cho blob.

## 2. Kết quả tổng hợp và PnR

### 2.0 Bitstream hiện tại (01/11/2026, `BBOX_SOURCE=1`)

| Clock | Constraint | Actual Fmax | Logic level | TNS setup | TNS hold |
| :--- | ---: | ---: | ---: | ---: | ---: |
| `clk_100m` | 100,000 MHz | **113,277 MHz** | 8 | 0,000 | 0,000 |
| `cam_pclk` | 24,000 MHz | **140,757 MHz** | 8 | 0,000 | 0,000 |

| Resource | Dùng | Tổng | % | So với bitstream mock |
| :--- | ---: | ---: | ---: | ---: |
| Logic (LUT/ALU) | 1.616 | 20.736 | 8 % | +324 |
| Register | 1.218 | 16.173 | 8 % | +439 |
| BSRAM | 1 | 46 | 3 % | **+0** |
| DSP (MULT18X18) | 0,5 | 24 | 3 % | **+0** |

Nguồn: `KVC_PR/impl/pnr/KVC_FPGA.rpt.txt:43-60`,
`KVC_PR/impl/pnr/KVC_FPGA_tr_content.html:243-258` (Fmax) và `:268-311` (TNS).

Phân bổ khối blob: `g_blob_gen.u_blob` = 174 Register, 98 ALU, 172 LUT
(`KVC_PR/impl/gwsynthesis/KVC_FPGA_syn_rsc.xml:8`). **0 BSRAM, 0 DSP** — đúng
quyết định D4 của plan.

Chênh so với bitstream mock: **+324 LUT, +439 FF**. Trong đó khối
`kvc_blob_detect` chiếm 172 LUT / 174 FF. Phần còn lại là mux chọn nguồn BBox
3 nhánh và logic mã hoá `diag_status_y`; chưa phân rã chi tiết từng net.
`vsync_cnt` (16 FF) vẫn được tổng hợp vì là thanh ghi luôn chạy ở `clk_100m`,
dù `DIAG_MODE = 0` đã loại nhánh ghi đè khỏi đường dữ liệu.

Đường tới hạn: `u_bbox_pkt/cur_bbox_i_0_s0/Q → u_bbox_pkt/uart_tx_data_3_s0/D`,
slack +1,172 ns. Không phải đường của `kvc_blob_detect`.

### 2.1 Timing (bitstream mock `948D697E`, 01/11/2026 02:5x — tham chiếu)

| Clock | Constraint | Actual Fmax | Logic level | TNS setup | TNS hold |
| :--- | ---: | ---: | ---: | ---: | ---: |
| `clk_100m` | 100,000 MHz | **107,447 MHz** | 9 | 0,000 | 0,000 |
| `cam_pclk` | 24,000 MHz | 166,081 MHz | 7 | 0,000 | 0,000 |

Nguồn: `KVC_PR/impl/pnr/KVC_FPGA_tr_content.html:243-259` (Fmax) và `:286-320` (TNS).

**Kết luận:** đạt constraint, không có endpoint vi phạm.

Fmax 107,447 MHz — dư 7 % so với yêu cầu 100 MHz.

Đường tới hạn: `u_bbox_pkt/send_count_0_s0 → u_bbox_pkt/state_3_s1`, slack
+0,693 ns. **Không phải** đường của khối chẩn đoán VSYNC thêm vào.

**Cảnh báo biên mỏng.** Khi thêm bộ đếm VSYNC, Fmax giảm 124,934 → 107,447 MHz
(−14 %) và logic level tăng 7 → 9. Biên so với 100 MHz chỉ còn 7 %. Nguyên nhân
tăng tài nguyên:

| Thay đổi | LUT | FF |
| :--- | ---: | ---: |
| Trước chẩn đoán | 1.144 | 570 |
| Sau chẩn đoán | 1.292 | 779 |
| Chênh | **+148** | **+209** |

FF tăng 209 nhiều hơn dự kiến (chỉ 17 FF cho `vsync_cnt[15:0]` + `bbox_first`).
Nguyên nhân: `bbox_x_final` có fanout rộng vào 16 bit của `bbox_data_src`, khiến
tool nhân bản logic. Nếu cần biên rộng hơn, đặt `DIAG_MODE = 0` để loại bỏ
hoàn toàn nhánh chẩn đoán.

### 2.1b Tài nguyên (bitstream mock `948D697E`)

| Resource | Dùng | Tổng | % |
| :--- | ---: | ---: | ---: |
| Logic (LUT/ALU) | 1.292 | 20.736 | 7 % |
| Register | 779 | 16.173 | 5 % |
| BSRAM | 1 | 46 | 3 % |
| DSP (MULT18X18) | 0,5 | 24 | 3 % |

Nguồn: `KVC_PR/impl/pnr/KVC_FPGA.rpt.txt:43-59`.

### 2.2 Công suất (ước tính của tool, không phải đo)

| Đại lượng | Giá trị (blob, `86CCF5DD`) | Giá trị (mock, `948D697E`) |
| :--- | ---: | ---: |
| Total power | 147,592 mW | 145,006 mW |
| Quiescent | 122,800 mW | 122,800 mW |
| Dynamic | 24,792 mW | 22,206 mW |
| Junction temp (ước tính) | 29,726 °C | 29,643 °C |

Nguồn: `KVC_PR/impl/pnr/KVC_FPGA.power.html:163-179`. Đây là **ước tính của
tool với toggle rate giả định** — không thay thế phép đo nhiệt ở bước 2.1.4.

## 3. Nội dung bitstream (module nào thực sự được tổng hợp)

### 3.0 Bitstream hiện tại (`BBOX_SOURCE=1`)

Từ `KVC_PR/impl/gwsynthesis/KVC_FPGA_syn_rsc.xml`:

```text
kvc_top_demo
├── u_pll100, u_pll24
├── u_ov2640_cfg   (ROM cấu hình SCCB)
├── u_sccb
├── u_cam_rx
├── g_blob_gen.u_blob   <-- kvc_blob_detect (BBox tu pixel that)
├── u_bbox_pkt          <-- bbox_packetizer (+ crc_inst)
├── u_uart_tx
└── u_dr_ctrl           <-- data_ready_ctrl
```

**Không có** `kvc_yolo_top`, `conv_engine_dynamic_fsm`, `yolo_nms`,
`spi_flash_wrapper`, `weight_mem`, `g_mock_gen`, `line_buffer_3x3`,
`image_letterbox`. Đúng như thiết kế `BBOX_SOURCE=1`.

### 3.1 Bitstream mock `948D697E` (`BBOX_SOURCE=0`)

```text
kvc_top_demo
├── u_pll100, u_pll24
├── u_ov2640_cfg   (ROM cấu hình SCCB)
├── u_sccb
├── u_cam_rx
├── g_mock_gen.u_mock   <-- mock_bbox
├── u_bbox_pkt          <-- bbox_packetizer (+ crc_inst)
├── u_uart_tx
└── u_dr_ctrl           <-- data_ready_ctrl
```

**Không có** `kvc_yolo_top`, `conv_engine_dynamic_fsm`, `yolo_nms`,
`spi_flash_wrapper`, `weight_mem`. Đúng như thiết kế `BBOX_SOURCE=0`.

## 4. Cảnh báo của tool (không chặn build)

### 4.0 Bitstream hiện tại (`86CCF5DD`)

| Mã | Nội dung | Đánh giá |
| :--- | :--- | :--- |
| `CV0016` ×1 | `spi_miso` không dùng | **Đúng thiết kế** — chế độ blob không có CNN/SPI |
| `CK3000` | Không tính được quan hệ `cam_pclk` ↔ `clk_100m` | **Đúng** — hai clock bất đồng bộ; đã có `set_clock_groups` + `set_false_path` |
| `PR1014` | `cam_pclk_d` dùng generic routing clock | Chấp nhận được ở 24 MHz (`cam_pclk` Fmax 140,757 MHz). Cần xem lại nếu nâng tần số hoặc kéo dài dây camera |

Đã hết 8 cảnh báo `EX1998` (net `cnn_out_*` không có driver) bằng cách gán 0
trong nhánh `g_mock_path` của generate. Không có cảnh báo trùng constraint cho
`set_false_path`, không có đường không-constrain mới.

### 4.1 Bitstream mock `948D697E`

| Mã | Nội dung | Đánh giá |
| :--- | :--- | :--- |
| `CV0016` ×3 | `cam_href`, `cam_data`, `spi_miso` không dùng | **Đúng thiết kế** ở mock path; camera path chưa nối |
| `PR1014` | `cam_pclk_d` dùng generic routing clock | Chấp nhận được ở 24 MHz (`cam_pclk` Fmax 153 MHz). Cần xem lại nếu nâng tần số hoặc dùng camera thật dài dây |

## 5. Kiểm chứng mô phỏng tại cùng thời điểm

### 5.0 Bitstream hiện tại — `scripts/run_fpga_tb.ps1` → **22/22 PASS** (exit 0)

```text
tb_uart_tx               PASS  PASS=30  FAIL=0
tb_bbox_packetizer       PASS  PASS=103 FAIL=0
tb_conv0_golden          PASS  PASS=1026 FAIL=0
tb_conv0_real            PASS  PASS=1026 FAIL=0
tb_depthwise             PASS  PASS=146 FAIL=0
tb_maxpool2d             PASS  PASS=4   FAIL=0
tb_concat_n_feature      PASS  PASS=3   FAIL=0
tb_split_channels        PASS  PASS=3   FAIL=0
tb_upsample_nearest      PASS  PASS=3   FAIL=0
tb_residual_add_int8     PASS  PASS=65536 FAIL=0
tb_sppf_block            PASS  PASS=1   FAIL=0
tb_line_buffer_mc        PASS  PASS=5   FAIL=0
tb_async_fifo_cdc        PASS
tb_yolo_nms              PASS
tb_kvc_top_demo          PASS  PASS=4   FAIL=0
tb_kvc_top_demo_rate     PASS  PASS=3   FAIL=0
tb_kvc_top_demo_uartlink PASS  PASS=5   FAIL=0
tb_ov2640_config         PASS  PASS=16  FAIL=0
tb_sccb_ack_sample       PASS  PASS=5   FAIL=0
tb_vsync_diag            PASS  PASS=6   FAIL=0
tb_kvc_blob_detect       PASS  PASS=12  FAIL=0   <-- moi
tb_kvc_top_blob          PASS  PASS=8   FAIL=0   <-- moi
```

### 5.1 Bitstream mock `948D697E` — 20/20 PASS (trước khi thêm 2 TB blob):

```text
tb_uart_tx               PASS  PASS=30  FAIL=0
tb_bbox_packetizer       PASS  PASS=103 FAIL=0
tb_conv0_golden          PASS  PASS=1026 FAIL=0
tb_conv0_real            PASS  PASS=1026 FAIL=0
tb_depthwise             PASS  PASS=146 FAIL=0
tb_maxpool2d             PASS  PASS=4   FAIL=0
tb_concat_n_feature      PASS  PASS=3   FAIL=0
tb_split_channels        PASS  PASS=3   FAIL=0
tb_upsample_nearest      PASS  PASS=3   FAIL=0
tb_residual_add_int8     PASS  PASS=65536 FAIL=0
tb_sppf_block            PASS  PASS=1   FAIL=0
tb_line_buffer_mc        PASS  PASS=5   FAIL=0
tb_async_fifo_cdc        PASS
tb_yolo_nms              PASS
tb_kvc_top_demo          PASS  PASS=4   FAIL=0
tb_kvc_top_demo_rate     PASS  PASS=3   FAIL=0
tb_kvc_top_demo_uartlink PASS  PASS=5   FAIL=0
tb_ov2640_config         PASS  PASS=16  FAIL=0
tb_sccb_ack_sample       PASS  PASS=5   FAIL=0
tb_vsync_diag            PASS  PASS=5   FAIL=0   <-- moi
```

## 5.2 Blob detect — đặc tả đã kiểm bằng mô phỏng (01/11/2026)

Chi tiết đầy đủ: `evidence/KVC-FPGA-BLOB-20261101-001_T1-T13.md`.

| Hạng mục | Trạng thái |
| :--- | :--- |
| Unit test `tb_kvc_blob_detect` | 12/12 PASS — 10 kịch bản plan §11 + hồi phục sau skip + biên `MIN_PIXELS` |
| Integration `tb_kvc_top_blob` | 8/8 PASS — blob thật qua DVP → IF-01, N=1 `x=130 y=80 w=60 h=40 class=2 conf=37`; khung rỗng N=0; R7 (`DIAG_MODE=1` không ghi đè X của blob) |
| Gate G0.1 (T12, build diag) | ✅ **BUILT** — `3620B802`, Fmax 127,823 MHz, TNS 0 |
| Gate G0.2–G0.4 (nạp bo + capture UART ≥ 10 s) | ✅ **01/11/2026** — xem §8. G0.3/G0.4 đạt **gián tiếp** qua bitstream release, không qua thủ tục diag |
| Nạp bo + A1–A10 (T14) | **MỘT PHẦN** — A2 PASS, A8 **FAIL** (~5 frame/s), A1/A3/A5/A7 **NOT RUN**. Chi tiết: `evidence/KVC-FPGA-G0G6-20261101-001.md` |
| **02/11/2026 — đo lại 4 phiên** | **A6 gần đạt** (0 CRC trên 128+84+409 khung, nhưng chưa 1.000 khung trong một `.bin`) · **A8 vẫn FAIL** (4,245 / 4,29 frame/s) · **nguyên nhân A8 đổi**: nhịp khung nằm trên **lưới 65,6 ms** với bội **1/3/5/6** ⇒ trần **15,25 frame/s**, fps 4,2 là do frame bị kéo dài chứ không phải chia xung. KHÔNG cần build mới. Chi tiết: `evidence/KVC-FPGA-BLOB-20261102-001.md` (§2 F-05) |
| **G2.7 soak 30 phút (02/11/2026)** | **PASS 2/3** — `fe=oe=drop=0` 272/272 mẫu, `isr==byt`, 76.750 B / 1.788,4 s = 42,92 B/s (lệch nửa đầu/sau 0,2 %), 0 reset; **nhiệt độ NOT MEASURED**. Chi tiết: `evidence/G2.7_soak_20261102.txt` |
| **Finding mới 02/11/2026** | **F-04** — `timestamp` IF-01 đọc trực tiếp từ counter đang chạy (`bbox_packetizer.v:76-79`), đo được **1 khung lùi 59 ms** trong `F02_card_20261102.bin`; sửa tối thiểu = 1 thanh ghi latch 32 bit, cần duyệt riêng |


**Bốn khác biệt so với plan §7, đều có lý do và đã kiểm bằng test:**

1. **Công thức hộp bao.** Plan ghi `w = max-min` và `x = (min+max)>>1`; với khối
   100 px tại x∈[200,299] công thức đó cho `w=99, x=249` — lệch so với chính
   bảng kỳ vọng của plan. Module dùng `w = max-min+1`, `x = (min+max+1)>>1`.
2. **`frame_valid` không dùng trực tiếp được.** `camera_rx.frame_valid` chỉ cao
   trong lúc VSYNC cao (duty < 2 %) nên không có pixel nào được đếm. Module chốt
   nó thành `frame_active` tại **cạnh xuống VSYNC**.
3. **Frame rỗng phát `bbox_last` một mình** → khung N=0 (10 byte). Giữ khả năng
   phân biệt "không có phao" với "FPGA chết". Layout IF-01 không đổi.
4. **`tgl` chỉ đảo khi frame có pixel.** Nếu đảo vô điều kiện, camera mất tín
   hiệu vẫn phát khung N=0 liên tục, trông như camera còn sống.

**Giới hạn phải ghi vào tài liệu nghiệm thu:** false positive da người
(RGB565 (25,40,15) lọt ngưỡng); W/H 8-bit nên span > 255 px không biểu diễn
được (cần khoảng cách ≥ 1,6 m); chỉ 1 blob/frame; `CONF_SHIFT = 6` cho conf
thấp — cần tinh chỉnh sau A2; ngưỡng màu chưa đo dưới nắng thật.

## 6. Lỗi P0 đã tìm và sửa trong lần build này

### 6.0a Sample ACK tại sườn lên SCL → `ack_error` luôn = 0 (P0, sửa 01/11)

**Vị trí:** `KVC_PR/src/camera/sccb_master.v`, state `ST_ACK`.

**Lỗi:** sample ACK tại `clk_cnt == HALF`, tức **đúng chu kỳ SCL chuyển từ LOW
lên HIGH**. Trên phần cứng SDA là open-drain, tại sườn lên điện áp vẫn ~0 V,
nên FPGA đọc được 0 → hiểu là ACK.

**Hệ quả:** `ack_error` **luôn = 0** dù sensor không trả lời. Đây là lý do
`cfg_done` luôn lên trên bo, kể cả khi camera không được cấp XCLK và không ACK gì.

Tính toán với SDA là open-drain, tau = 5 µs (pull-up nội ~50 kΩ, C_bus 100 pF),
SCL_DIV = 1000 (100 kHz):

| Điểm sample | Thời gian từ lúc thả SDA | V(SDA) | So VIH (2,31 V) |
| :--- | ---: | ---: | :--- |
| Sườn lên SCL (lỗi cũ) | 5,0 µs | **2,09 V** | **FAIL → đọc 0** |
| Giữa pha HIGH | 7,5 µs | 2,56 V | OK (biên mỏng) |
| Cuối pha HIGH (đã sửa) | 10,0 µs | **2,85 V** | **OK** |

**Sửa:** sample tại `clk_cnt == (2*HALF - 2)` = cuối pha SCL HIGH. Còn 2 chu kỳ
trước khi SCL xuống, nên không sample nhầm lúc slave nhả bus.

**Vì sao 19 testbench cũ không bắt được:** `tb_ov2640_config` **không instantiate**
`sccb_master` — nó dùng mô hình hành vi với `sccb_ack_error` là input do TB điều
khiển. Không TB nào kiểm bus vật lý.

**Kiểm chứng:** `tb_sccb_ack_sample` (mới) instantiate `sccb_master` thật với
bus tri-state + pull-up:
- Slave ACK → `ack_error = 0`, `ack_sampled = 0010` ✓
- Slave NACK → `ack_error = 1`, `ack_sampled = 1111` ✓
- SCL không bao giờ ở trạng thái Z ✓

### 6.0b Bus SCCB không thể lên mức HIGH với pull-up nội (P0, sửa 01/11)

**Đo trên bo:** SCL = 0,2 V, SDA = 0,9 V — bus không bao giờ đạt VIH.

**Nguyên nhân:** module OV2640 MINI-200W **không có pull-up ngoài**. Pull-up nội
GW2A ~50 kΩ cho tau ≈ 2,5–5 µs tùy C_bus. Ở 100 kHz (HALF = 5 µs), điện áp chỉ
đạt 2,09 V < VIH 2,31 V → **mọi bit 1 bị đọc thành 0** ở phía sensor.

**Sửa:** chuyển **cả SCL và SDA sang push-pull có kiểm soát**:

| Tín hiệu | Cách lái | Lý do an toàn |
| :--- | :--- | :--- |
| `SCL` | Push-pull hoàn toàn | SCCB không có clock stretching, sensor không kéo SCL → không chồng output |
| `SDA` | Push-pull, **thả Z trong cửa sổ ACK** | Slave cần kéo thấp để ACK. Cửa sổ mở ở sườn **xuống** SCL (khi SCL còn thấp) và đóng sau khi SCL xuống kết thúc pha ACK → không bao giờ master và slave cùng lái mức đối nghịch |

**Không cần hàn pull-up 4,7 kΩ** khi đã dùng push-pull.

**Kiểm chứng** (tính toán, chưa đo bo): với push-pull, sườn lên do driver CMOS
lái, không phụ thuộc RC → V đạt 3,3 V trong vài ns.

### 6.0d Camera OV2640 không hoạt động — bảng khởi tạo chỉ 38/224 thanh ghi

**Triệu chứng trên bo (31/10/2026):** VSYNC = 0 V cố định, không có xung 30 Hz,
FPS vẫn 100,0 (không đổi vì mock chạy độc lập). Capture UART 15 s cho 1.575 frame,
tất cả timestamp tăng đúng +10 ms — **không một khoảng nào bị rút ngắn**, chứng minh
`cam_vsync_pulse` chưa từng xuất hiện.

Tính xác suất: khung truyền 6,771 ms trong chu kỳ 10 ms → 3,229 ms cửa sổ rảnh
(32 %). Với VSYNC 30 Hz trên 1.574 khoảng, kỳ vọng ~500 khoảng bị rút. Quan sát 0.
Xác suất ngẫu nhiên 0,68^1574 ≈ 10⁻²⁶³.

**Nguyên nhân:** `ov2640_config.v` cũ có `ROM_DEPTH = 72` nhưng FSM dừng ở
`rom_idx < 8'd38` — chỉ 38 lượt ghi. Bảng chuẩn cho OV2640 VGA RGB565 cần ~200.
Thiếu toàn bộ khối sensor core (Bank 1: 0x2c..0x62) và khối DSP (Bank 0: 0xe5..0xc3),
nên sensor chưa bao giờ ra khỏi trạng thái mặc định.

**Ba lỗi phụ cùng tồn tại:**

| Lỗi | Bằng chứng | Hệ quả |
| :--- | :--- | :--- |
| SCCB ACK bị bỏ qua | `sccb_master.v:174` lưu `ack_sampled` nhưng không ai đọc | `cfg_done` luôn = 1 dù mọi lệnh NACK |
| Không delay power-on | `.start(pll_lock)` — PLL lock sau vài trăm µs | Lượt ghi đầu có thể bị bỏ |
| Thiếu zoom VGA | Không có 0x5A/0x5B/0x5C | Nếu sensor chạy, dữ liệu ra 800x600 chứ không phải 640x480 |

**Sửa:**

1. `ov2640_config.v` viết lại, ROM 224 entry, lấy từ **espressif/esp32-camera**
   (Apache-2.0) — ba mảng `ov2640_settings_cif` (157), `ov2640_settings_rgb565` (6),
   `ov2640_settings_to_svga` (39), cộng 22 entry tự viết cho zoom VGA và PLL.
   Đối chiếu **máy móc** bằng script parse cả hai phía: cả 3 mảng có mặt nguyên vẹn,
   đúng thứ tự (`KET LUAN: ca 3 mang nguon co mat nguyen ven, dung thu tu`).
2. `sccb_master.v` thêm cổng `ack_error`, kiểm ACK của **mọi byte thực sự được phát**
   (dev_addr, reg, data) — không đếm slot chưa dùng.
3. `ov2640_config.v` thêm `POR_DELAY_MS = 20` trước lượt ghi đầu, và `cfg_error`:
   NACK ở bất kỳ lượt nào → dừng ngay, không chạy tiếp 224 lượt vô nghĩa.
4. `kvc_top_demo.v`: `led_camera_ok = cfg_done & ~cfg_error & cap_frame_valid`.

**Kiểm chứng:** `tb_ov2640_config` 13/13 PASS, gồm ba kịch bản:
- Bình thường: 224 lượt ghi, COM7=0x40, RGB565 ở 8 lượt cuối, zoom 640x480 có mặt,
  R_BYPASS=0x00 cuối cùng, lượt ghi đầu sau đúng 20,0 ms, bank nhất quán.
- NACK tại lượt 30: dừng sau 31 lượt, `cfg_error = 1`.
- NACK ngay lượt đầu: dừng sau 1 lượt, `cfg_error = 1`.

**Lỗi trong lúc sửa (đã khắc phục):** phiên bản đầu dùng biến `integer rom_end`
gán trong `initial` để đánh dấu điểm dừng. Gowin báo
`WARN (EX3780) : Using initial value of 'rom_end' since it is never assigned`
— biến này **không được tổng hợp thành logic**, nên nếu = 0 thì FSM nhảy thẳng
`S_DONE` và ghi 0 thanh ghi, trong khi mô phỏng vẫn PASS. Đã thay bằng mảng
`rom_last[0:ROM_DEPTH-1]` (được extract như `rom_addr`/`rom_data`).
Sau khi sửa, `EX3780` không còn xuất hiện.

**Chưa kiểm chứng:** bitstream mới chưa nạp bo. Mức bằng chứng cho camera vẫn là
`SIMULATED` + `BUILT`, chưa `HARDWARE-VERIFIED`.

### 6.0e FSM cấu hình chạy vòng vô hạn (P0, sửa 01/11)

**Nguyên nhân:** `kvc_top_demo.v` nối `.start(pll_lock)` — `pll_lock` là **mức**,
không phải xung. Trong `ov2640_config.v`, `S_DONE` quay lại `S_IDLE`, và `S_IDLE`
thấy `start` vẫn cao nên chạy lại từ đầu.

Chu kỳ một vòng ở `SCL_DIV = 250` (400 kHz): 224 thanh ghi × 3 byte × 9 bit ÷ 400 kHz
+ 224 × 100 µs ≈ **38 ms**. Bảng có `RESET (0xE0) = 0x04` (RESET_DVP) nhiều lần,
nên DVP interface bị reset mỗi 38 ms → sensor không phát được khung hoàn chỉnh.

**Bằng chứng trên bo:**

| Thời điểm | shortfall | Diễn giải |
| :--- | ---: | :--- |
| 01/11 trước nối XCLK | 70 ms | Nhiễu gai kích A15, sensor hoàn toàn im |
| 01/11 sau nối XCLK (pin 18) | **145 ms** | Sensor có nhịp nhưng bị reset liên tục — shortfall tăng gấp đôi |

Việc shortfall tăng khi có XCLK xác nhận sensor **đã bắt đầu đáp**, nhưng FSM
lặp đang chặn nó hoàn tất cấu hình và stream ổn định.

**Sửa:** thêm cờ `cfg_attempted`:
- `S_IDLE`: chỉ vào khi `start && !cfg_attempted`; set `cfg_attempted = 1`
- `S_DONE`: giữ nguyên (không quay lại `S_IDLE`) chừng nào `start` còn cao
- Reset `cfg_attempted` khi `!start` hoặc `!rst_n`

Nhờ vậy FSM cấu hình **đúng một lần** sau mỗi lần reset hệ thống, bất kể `start`
là xung hay mức.

**Sửa phụ:** `SCL_DIV 250 → 1000` (400 kHz → 100 kHz). Không có pull-up ngoài,
pull-up nội GW2A ~50 kΩ có τ ≈ 5 µs, lớn hơn nửa chu kỳ 1,25 µs ở 400 kHz → đường
SCL không lên kịp 3,3 V. Ở 100 kHz, nửa chu kỳ là 5 µs, biên thời gian đủ.

**Kiểm chứng:** `tb_ov2640_config` 16/16 PASS, thêm hai assertion chống lặp:
- "chi chay dung 1 luot cau hinh khi start=1" — sau 10.000 chu kỳ, `log_n` không đổi
- "dung han sau NACK khi start giu HIGH" — NACK xong FSM không tái nhập

Testbench nay drive `start` bằng **mức** (giống `pll_lock` thật), không phải xung.
Đây chính là điều kiện mà TB cũ bỏ sót, khiến lỗi này lọt qua 18 TB trước đó.

### 6.0f Module camera `OV2640 MINI-200W` không có oscillator onboard

**Phát hiện 01/11/2026 bằng soi bo:** dưới cụm ống kính in lụa `OV2640 MINI-200W`.
Hai IC 5 chân bên trái header (ổn áp 2,8 V và 1,2 V), **không có can thạch anh**.

Bảng chân người bán ghi `Pin 18 = NC` là **sai** (chép từ variant khác). Trên
bo này, **pin 18 là XCLK đầu vào**.

**Hệ quả trước khi nối dây:** OV2640 không có nhịp tim → SCCB không ACK (dẫn tới
`cfg_error = 1` ngay byte 0), PCLK không phát (DCLK không có áp AC), VSYNC không
phát (FPS đứng ở 100,0).

Đã nối `J1-12` (ball `B13`, 24 MHz) → module pin 18, kèm dây GND xoắn đôi.
Shortfall tăng 70 → 145 ms xác nhận sensor bắt đầu đáp.

**Sửa tài liệu:** `docs/hardware/wiring/KVC_MASTER_PINOUT_WIRING.md` §3.5.1 ghi
`XCLK | B13 | 12` nhưng không nói rõ đây là **bắt buộc**, và trước đó có hướng dẫn
sai rằng J1-12 "phải để trống" vì module có oscillator.

### 6.1 `uart_tx` thiếu stop bit (P0, sửa 31/10)

`KVC_PR/src/comm/uart_tx.v` hạ `tx_busy` **ngay tại thời điểm stop bit bắt đầu**
(`bit_cnt == 8`), nên byte kế tiếp chiếm mất cửa sổ stop bit. Kết quả: mỗi byte
chỉ tồn tại **9 bit-time** thay vì 10.

Với một byte đơn lẻ, bộ thu vẫn có thể đọc đúng nếu nó lấy mẫu stop bit sớm.
Nhưng trong `bbox_packetizer`, 26 byte được gửi **liên tiếp**, nên mọi byte sau
byte đầu đều bị cắt stop bit → bộ thu thật (và firmware MCU) báo framing error.

### 6.2 Bằng chứng trước khi sửa

`tb_kvc_top_demo_uartlink` (bộ thu 8N1 độc lập + parser IF-01):

```text
byte giai ma=1053, byte hop le=127, framing err=926
frame OK=0, CRC err=0, bad sync=120
FAIL: 0 frame hop le
FAIL: 926 framing error
```

Tỉ lệ lỗi khung: **926/1053 = 88 %**. Frame hợp lệ: **0**.

### 6.3 Vì sao 15 testbench cũ không bắt được

`tb_uart_tx` cũ assert `busy width = 9 bit-time` — tức là **khóa cứng hành vi
sai** thành kỳ vọng. `tb_kvc_top_demo` chỉ đếm cạnh xuống của `uart_tx`, không
giải mã khung, nên không thấy stop bit bị thiếu.

### 6.4 Sửa

`bit_cnt` chạy 0..9 thay vì 0..8:
- `0..7`: phát data bit LSB-first
- `8`: giữ `tx_pin = 1` (stop bit) **và giữ `tx_busy`**
- `9`: hạ `tx_busy`, báo `tx_done`

### 6.5 Bằng chứng sau khi sửa

```text
byte giai ma=78, byte hop le=78, framing err=0
frame OK=3, CRC err=0, bad sync=0
PASS nhan duoc 3 frame IF-01 hop le
PASS 0 framing error tren 78 byte
PASS 100% byte hop le (78/78)
PASS 0 CRC error
```

Đo lại nhịp frame: khung **677.124 cycle** (6,771 ms) — khớp chính xác 26 byte
× 10 bit × 2.604 cycle/bit. Trước khi sửa là 609.420 cycle (9 bit/byte).

### 6.6 Ảnh hưởng

| Hạng mục | Trước | Sau |
| :--- | ---: | ---: |
| Độ dài khung N=2 | 609.420 cycle | **677.124 cycle** |
| Byte/khung | 26 | 26 |
| Bit/byte trên dây | 9 | **10** |
| Nhịp frame (mock) | 100 FPS | 100 FPS (không đổi — vẫn bị chặn bởi trigger 5 ms) |
| Fmax `clk_100m` | 136,374 MHz | 129,149 MHz |
| Framing error (TB) | 88 % | **0 %** |
| Frame hợp lệ (TB) | 0/3 | **3/3** |

**Không đổi:** baud 38.400, packet layout IF-01, CRC, pinout. Chỉ sửa độ rộng
xung `tx_busy`. ABI không bị ảnh hưởng.

## 7. Tính tái lập của build

Build hai lần từ cùng source cho SHA-256 **khác nhau**:

| Lần | SHA-256 |
| ---: | :--- |
| 1 (trước sửa) | `046EE21CF41E4B3EC50E15A9F25045A44748682266CC7708707B2BAA2F66BFEB` |
| 2 (trước sửa) | `FE1B57F330DF3F1AC6D71CC6ADEB8845F7661620F6E63DBF1E9FF9D45C1113C6` |
| 3 (sau sửa) | `70460C92DC4C37138C06847B0C7A97C639851AFCC737F94C0082B014ED9FE5C5` |
| 4 (mock, camera mới) | `948D697E537D8C7A6529224F59B17A388675B951D79DDE41445F6232270B9423` |
| 5 (blob, trước khi drive `cnn_out_*`) | `7EF7062A982C7918AE0DC9F040EB09456FE2AF274AE9926B285F27AC5086880F` |
| 6 (blob, sau khi drive `cnn_out_*` = 0) | `814A9987AD685DA97DB43BC64BF900E0C4AD187A015CE45C7E6AFBFA8BDC1D28` |
| 7 (diag `BBOX_SOURCE=0, DIAG_MODE=1`) | `3620B802C010993DCF98E56691C5496132CB5347D6776D5B5EAA88BD5DFC5EBB` |
| 8 (release lần cuối, cùng source với 6) | `86CCF5DDAA12DED9D66C9729E27EBB828FF3A3D2B1B46170E79B61277C38ED13` |

Lần 6 và 8 **cùng source, cùng tool, cho cùng timing (113,277 MHz) và cùng tài
nguyên (1.616 LUT / 1.218 FF / 1 BSRAM / 0,5 DSP) nhưng khác SHA** — xác nhận
lại kết luận dưới đây: PnR không tất định.

Lần 1 và 2 **cùng source, cùng tool, vẫn khác hash**. Nguyên nhân khả dĩ: PnR
có yếu tố không tất định (seed/thứ tự placement). Hệ quả:

- Không thể dùng SHA-256 bitstream làm định danh nguồn.
- Phải định danh bằng **Git HEAD + tool version + lệnh build**.
- Nếu cần so sánh chức năng giữa hai bitstream, phải đo trên bo, không so hash.
- Timing summary giữa lần 1 và 2 giống nhau (129,149 MHz) → PnR ổn định về chất
  lượng, chỉ khác chi tiết routing.

## 8. Việc chưa làm được

| Việc | Lý do | Cần gì |
| :--- | :--- | :--- |
| **B0 — đóng baseline H6** | SHA `.fs` khớp nhưng working tree `KVC_PR/` còn 9 file sửa + 10 file chưa track (§1.0a) | HUMAN duyệt commit theo phân hệ |
| Đo nguồn, ripple | Cần VOM/oscilloscope | Thiết bị đo |
| **Gate G0.1** — build diag `BBOX_SOURCE=0, DIAG_MODE=1` | ✅ **BUILT** (`3620B802`, Fmax 127,823 MHz, TNS 0) | — |
| **Gate G0.2** — nạp bitstream lên bo | ✅ **PASS 01/11/2026** — SRAM Program, `86CCF5DD` (release). Log Gowin không lưu thành file | — |
| **Gate G0.3** — VSYNC thật | ✅ **PASS (gián tiếp, mạnh hơn)** 01/11/2026 — 136 khung IF-01 liên tiếp chỉ phát khi có pixel thật. ⚠️ **Không qua thủ tục diag `3620B802`**; nếu cần bản ghi đúng thủ tục thì nạp `3620B802` và capture thêm | — |
| **Gate G0.4** — SCCB ACK | ✅ **PASS (gián tiếp)** — sensor phát DVP được ⇒ đã cấu hình xong. ⚠️ Cùng ghi chú như G0.3 | — |
| **A1–A10 (T14)** — nghiệm thu blob trên bo | **MỘT PHẦN** 01–02/11/2026: A2 PASS, A6 một phần (0 lỗi CRC nhưng < 1.000 khung), **A8 FAIL (5,08 và 7,48 frame/s, kỳ vọng 25–32)**, A9 không đạt nếu đọc tuyệt đối (1 BSRAM / 0,5 DSP), A1/A3/A4/A5/A7 **NOT RUN** | Xem `evidence/KVC-FPGA-G0G6-20261101-001.md` §5, `evidence/G6.1_blob_baseline_neg_20261102-0142.txt` |
| **G6.1 §6.1.9** — ngưỡng màu R/G/B | **NOT RUN** — lần đo chứng minh blob, không đo giá trị màu | Vật đỏ thuần + đọc RGB565 |
| **G6.2** — siêu âm | **UNBLOCKED** 01/11/2026 (AJ-SR04M đã ổn định theo HUMAN). Các mục 6.2.1–6.2.7 vẫn **NOT RUN** | Phép đo 2/3/4/5 m |
| Đo FPS/nhiệt thật | **FPS đã đo 2 lần: 5,08 và 7,48 frame/s** (F-01, phụ thuộc ánh sáng). Nhiệt chưa đo | Thermometer |

**Cập nhật 01/11/2026 — Track B đã chạy trên bo thật.** Lần đầu tiên đường
`OV2640 → kvc_blob_detect → bbox_packetizer → UART` được chứng minh end-to-end:
136 khung IF-01 hợp lệ, 0 byte rác, 0 lỗi CRC, `N=0` trên nền và `N=1 class=2`
khi có mục tiêu cam. Chi tiết và các finding mở:
`evidence/KVC-FPGA-G0G6-20261101-001.md`.

Cho đến khi các mục `NOT RUN` ở trên hoàn tất, mức bằng chứng **tổng thể** của
blob giữ nguyên `BUILT` + `SIMULATED`. Riêng kết luận *"pixel thật tạo ra bbox"*
đã đạt **`HARDWARE-VERIFIED`** — xem tài liệu evidence để biết phạm vi chính xác.
