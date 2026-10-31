# KVC Product — Chỉ mục tài liệu

Task tạo bản: `KVC-PRODUCT-MIGRATE-20261026-001` · Ngày: 2026-10-26 · Owner: Kilo
Cập nhật P0 baseline: **2026-10-31** · Owner: Kilo · Phê duyệt break B-1→B-10: HUMAN

Đây là **chỉ mục duy nhất** của bản sản phẩm. Không tạo tài liệu mới mà không
thêm một dòng vào bảng dưới.

## Cách đọc

Hai cột độc lập, không thay thế nhau:

- **Trạng thái tài liệu:** `DRAFT` (đang viết) · `ACTIVE` (nguồn chân lý hiện hành) ·
  `SUPERSEDED` (đã bị thay) · `ARCHIVED` (chỉ đọc, không sửa)
- **Mức bằng chứng:** `DESIGN` (đề xuất) · `SOURCE-VERIFIED` (đối chiếu source) ·
  `SIMULATED` (mock/sim) · `BUILT/SYNTHESIZED` (đã build/tổng hợp) ·
  `HARDWARE-VERIFIED` (đã chạy trên board)

Một tài liệu `ACTIVE` + `DESIGN` nghĩa là nội dung đang có hiệu lực nhưng **chưa
được chứng minh bằng thực nghiệm**. Không đọc `ACTIVE` thành "đã chạy".

## Kiến trúc

| ID | Tài liệu | Đường dẫn | Trạng thái | Bằng chứng | Owner | Kiểm tra gần nhất | Code liên quan |
|---|---|---|---|---|---|---|---|
| SYS-001 | Thiết kế hệ thống | `architecture/KVC_ThietKeHeThong.md` | ACTIVE | DESIGN | Phong | 2026-10-25 | toàn repo |
| SYS-002 | Trạng thái dự án | `architecture/KVC_PROJECT_STATUS.md` | ACTIVE | SOURCE-VERIFIED | Phong | 2026-10-25 | toàn repo |
| SYS-003 | Đặc tả thiết kế GCS | `architecture/KVC_GCS_DESIGN_SPEC.md` | ACTIVE | DESIGN | — | 2026-10-15 | `gcs/backend/`, `gcs/frontend/` |
| SYS-004 | Kế hoạch GCS (lịch sử) | `architecture/KVC_GCS_PLAN.md` | SUPERSEDED | DESIGN | — | 2026-10-15 | — |
| SYS-005 | Thiết kế gateway | `architecture/GATEWAY_DESIGN.md` | ACTIVE | DESIGN | Thịnh | 2026-10-25 | `firmware/gateway_esp32/` |
| SYS-006 | Design contract GCS (token, deny-list) | `architecture/KVC_GCS_DESIGN_CONTRACT.md` | ACTIVE | DESIGN | Kilo | 2026-10-29 | `gcs/frontend/src/styles/tokens.css`, `gcs/frontend/src/features/` |

## Phần cứng

| ID | Tài liệu | Đường dẫn | Trạng thái | Bằng chứng | Owner | Kiểm tra gần nhất | Code liên quan |
|---|---|---|---|---|---|---|---|
| HW-MCU-001 | SONiX SN34F788 | `hardware/mcu/CHIP_SONIX_SN34F788_MCU.md` | ACTIVE | SOURCE-VERIFIED | Phong | 2026-10-25 | `firmware/mcu_payload/project_keil/` |
| HW-FPGA-001 | OneKiwi Primer 20K (GW2A) | `hardware/fpga/CHIP_ONEKIWI_20K_GOWIN_GW2A.md` | ACTIVE | SOURCE-VERIFIED | Vững | 2026-10-31 | `KVC_PR/src/KVC_FPGA.cst` |
| HW-FPGA-002 | FPGA CNN Engine (YOLO11n INT8) | `hardware/fpga/FPGA_CNN_ENGINE.md` | DRAFT | **SIMULATED** (31/10/2026): 3 TB engine PASS (1026+1026+146); E-01/E-02/E-03/E-05/E-06/E-08/E-09 FIXED; E-04 (module `conv_engine_dynamic` chưa hoàn chỉnh) + E-07 (calibration) mở | Vững | 2026-10-31 | `KVC_PR/src/conv_engine_dynamic_fsm.v`, `tb_conv0_golden.v`, `tb_conv0_real.v`, `tb_depthwise.v`, `tools/gen_*.py` |
| WIR-001 | Pinout và đấu dây tổng | `hardware/wiring/KVC_MASTER_PINOUT_WIRING.md` | ACTIVE | DESIGN | Phong | 2026-10-25 | `firmware/mcu_payload/inc/kvc_pinout.h` |
| VEN-001 | Gói hãng (version/nguồn/checksum) | `hardware/vendor/VENDOR_PACKAGES.md` | ACTIVE | SOURCE-VERIFIED | Phong | 2026-10-25 | `firmware/mcu_payload/inc/SONiX.SN34F7_DFP.2.0.4/` |

## Giao diện

ID giao diện là **bất biến**. Đổi tên file phải giữ ID trong tiêu đề.

| ID | Tài liệu | Đường dẫn | Trạng thái | Bằng chứng | Owner | Kiểm tra gần nhất | Code liên quan |
|---|---|---|---|---|---|---|---|
| IF-00 | MCU ↔ cảm biến | `interfaces/IF_MCU_SENSORS.md` | ACTIVE | **SIMULATED** (31/10/2026): trần 700 cm + `MAX_FRAME_MM` 8000 + `alt_quality`; test 65/65 và 64/64 PASS | Phong | 2026-10-31 | `inc/kvc_usound_decode.h`, `inc/kvc_georef.h`, `src/sensors/kvc_usound_decode.c` |
| IF-01 | FPGA ↔ MCU UART | `interfaces/IF_FPGA_MCU_UART.md` | ACTIVE | **SIMULATED** (31/10/2026): 3 TB PASS, Fmax 100 MHz, 0 violation | Vững | 2026-10-31 | `KVC_PR/src/comm/`, `KVC_PR/verification/tb/`, `src/sensors/kvc_fpga_bbox.c` |
| IF-02 | MCU ↔ LoRa RF 32 byte | `interfaces/IF_MCU_LORA_RF.md` | ACTIVE | APPROVED ABI (HUMAN 29/10/2026) / SOURCE-VERIFIED | Thịnh | 2026-10-29 | `inc/kvc_telemetry.h`, `firmware/gateway_esp32/src/main.cpp` |
| IF-03 | ESP32 ↔ GCS WebSocket | `interfaces/IF_ESP32_GCS_WS.md` | ACTIVE | SOURCE-VERIFIED (ABI payload IF-02 đã duyệt 29/10/2026) | Thịnh | 2026-10-29 | `gcs/backend/esp32_ingress.py` |
| IF-04 | GCS REST/WebSocket route | `interfaces/IF_GCS_DATA_CONTRACT.md` | ACTIVE | SOURCE-VERIFIED | Phong | 2026-10-25 | `gcs/backend/main.py` |
| IF-04-SEM | GCS semantics dữ liệu | `interfaces/KVC_GCS_DATA_CONTRACT.md` | ACTIVE | DESIGN | Phong | 2026-10-25 | `gcs/backend/schemas.py`, `gcs/backend/state.py` |
| IF-CAM | Camera ↔ FPGA | `interfaces/IF_CAMERA_FPGA.md` | ACTIVE | **SIMULATED** cho FIFO+timestamp (31/10/2026); ảnh thật chưa đo | Kiên | 2026-10-31 | `KVC_PR/src/KVC_FPGA.cst:58-98`, `KVC_PR/src/camera/`, `KVC_PR/src/async_fifo_cdc.v` |
| IF-MATRIX | Ma trận giao diện | `interfaces/README.md` | ACTIVE | SOURCE-VERIFIED | — | 2026-10-25 | tất cả `IF-*` |

Ghi chú IF-04: `IF_GCS_DATA_CONTRACT.md` là đặc tả **route/endpoint**; 
`KVC_GCS_DATA_CONTRACT.md` là **semantics dữ liệu** (mục 2/5/6/7). Hai tài liệu
khác vai trò, không gộp. Cả hai đều thuộc họ IF-04.

### Bảng chuyển đổi mức bằng chứng

Khi tài liệu ngoài `docs/` (đặc biệt trong `review/`) dùng thuật ngữ khác, map theo bảng sau:

| Mức trong `docs/INDEX.md` | Tương đương trong review | Ý nghĩa |
| :--- | :--- | :--- |
| `DESIGN` | `DESIGN`, `PLAN`, `SYNTHETIC_ONLY` | Đề xuất, chưa đối chiếu source |
| `SOURCE-VERIFIED` | `SOURCE-VERIFIED`, `ANALYZED` | Đã đọc/đối chiếu source |
| `SIMULATED` | `SIMULATED` | Đã chạy mô phỏng/host test |
| `BUILT/SYNTHESIZED` | `BUILT`, `SYNTHESIZED` | Có artifact build/synthesis nhưng chưa lên board |
| `HARDWARE-VERIFIED` | `HARDWARE-VERIFIED` | Có log/capture từ board thật |
| — | `MIXED_SYNTHETIC_PLUS_REAL` | Dùng cho model AI có train synthetic + test thật; map sang `SIMULATED` khi ghi INDEX, kèm ghi chú |

## Tài liệu review (ngoài `docs/`)

Báo cáo review độc lập nằm ngoài repo sản phẩm theo quy tắc 8. Mục lục đầy đủ:
`review/README.md`. Không chép nội dung review vào `docs/`.

| Tác giả | Số báo cáo | Ghi chú |
| :--- | ---: | :--- |
| Antigravity | 3 | Đánh giá MCU payload, GCS UI/UX, phản biện kế hoạch 5 m |
| Codex | 3 | Trạng thái firmware, tiến độ MCU, kế hoạch redesign GCS |
| DeepSeek | 8 | MCU status/priority, FPGA model, review lượt 2, backlog, 3 plan |
| Không gán tác giả / theo task | 7 | 2 ở `review/` gốc, 5 trong `review/KVC-*/` |

Tổng: **21 báo cáo + `review/README.md`**.

## Cấu hình và vận hành

| ID | Tài liệu | Đường dẫn | Trạng thái | Bằng chứng | Owner | Kiểm tra gần nhất | Code liên quan |
|---|---|---|---|---|---|---|---|
| CFG-MCU-001 | Build MCU bằng Keil | `configuration/MCU_BUILD_KEIL.md` | ACTIVE | SOURCE-VERIFIED | Phong | 2026-10-25 | `firmware/mcu_payload/project_keil/mcu_uav.uvprojx` |
| CFG-GW-001 | Build gateway ESP32 | `configuration/GATEWAY_BUILD.md` | ACTIVE | SOURCE-VERIFIED | Thịnh | 2026-10-25 | `firmware/gateway_esp32/platformio.ini` |
| CFG-GW-002 | Kết nối WiFi/ESP32 | `configuration/GATEWAY_WIFI_ESP32.md` | ACTIVE | DESIGN | Thịnh | 2026-10-25 | `firmware/gateway_esp32/src/main.cpp` |
| CFG-GCS-001 | Chạy Dashboard (tổng) | `configuration/DASHBOARD_RUN.md` | ACTIVE | SOURCE-VERIFIED | Phong | 2026-10-25 | `gcs/` |
| CFG-GCS-002 | Chạy backend | `configuration/DASHBOARD_BACKEND.md` | ACTIVE | SOURCE-VERIFIED | Phong | 2026-10-25 | `gcs/backend/` |
| CFG-GCS-003 | Chạy frontend | `configuration/DASHBOARD_FRONTEND.md` | ACTIVE | SOURCE-VERIFIED | Phong | 2026-10-25 | `gcs/frontend/` |

## Kiểm thử

| ID | Tài liệu | Đường dẫn | Trạng thái | Bằng chứng | Owner | Kiểm tra gần nhất | Code liên quan |
|---|---|---|---|---|---|---|---|
| VER-001 | Kế hoạch kiểm thử gateway | `verification/GATEWAY_TEST_PLAN.md` | ACTIVE | DESIGN | Thịnh | 2026-10-25 | `firmware/gateway_esp32/` |

## Kế hoạch và phân công

| ID | Tài liệu | Đường dẫn | Trạng thái | Bằng chứng | Owner | Kiểm tra gần nhất | Code liên quan |
|---|---|---|---|---|---|---|---|
| PLAN-001 | Phân công MCU Payload + Gateway ESP32 | `planning/KVC_PHAN_CONG_2_NGUOI.md` | ACTIVE | SOURCE-VERIFIED (hiện trạng đo trên kit 26/10/2026) | Phong + Thịnh | 2026-10-26 | `firmware/mcu_payload/`, `firmware/gateway_esp32/` |
| PLAN-002 | Kế hoạch triển khai GCS Dashboard | `architecture/KVC_GCS_IMPLEMENTATION_PLAN_20261029.md` | ACTIVE | DESIGN | Kilo | 2026-10-29 | `gcs/frontend/`, `gcs/backend/esp32_ingress.py` |
| PLAN-003 | P0 hotfix GCS Dashboard (29/10) | `architecture/KVC_GCS_P0_Hotfix_Plan_20261029.md` | ACTIVE | DESIGN | Kilo | 2026-10-29 | `gcs/frontend/src/` |

## Planned — chưa triển khai

Các mục dưới **chưa có source hoặc tài liệu**. Không tạo file giả để lấp chỗ.

| ID | Nội dung | Trạng thái | Ghi chú |
|---|---|---|---|
| ALG-MCU-001 | Hợp nhất cảm biến (IMU + GNSS + siêu âm) | Planned | Chờ `firmware/mcu_payload/src/algorithms/` |
| ALG-MCU-002 | Hiệu chuẩn và bù sai số cảm biến | Planned | Chờ source thuật toán |
| ALG-MCU-003 | Ước lượng vị trí / dead-reckoning | Planned | Chờ source thuật toán |
| RTL-001 | RTL FPGA (BBox/UART/camera pipeline) | **SIMULATED** — P1–P5 xong: 7 lỗi engine sửa, 7 TB PASS, Fmax 100 MHz, 0 violation. Bitstream `.fs` có nhưng **chưa chứa CNN** (`USE_MOCK_BBOX=1`). **P6 chặn:** `kvc_yolo_top.v` chưa bao giờ compile (instantiation `.p_in_w`, `.win_00`, `.fifo_rd_en` không tồn tại trong `conv_engine_dynamic`); cần 4–6 tuần | `KVC_PR/src/`, `KVC_PR/rtl/`; commit `3ab8da2` → `2c49446` |
| RTL-003 | Bảng cấu hình lớp | **SOURCE-VERIFIED** — `layer_table.vh` sinh từ `conv_layer_map.csv`: 88 dòng, 7 stride=2, 7 grouped, 0 placeholder, verify 0 mismatch | `KVC_PR/rtl/gen/layer_table.vh`, `KVC_PR/tools/gen_layer_table.py` |
| RTL-002 | Testbench FPGA | **SIMULATED** — 3 TB có `$fatal`: `tb_uart_tx` 29/29, `tb_bbox_packetizer` 103/103, `tb_kvc_top_demo` 4/4 | `KVC_PR/verification/tb/`; stub `sim_stubs.v` cho primitive Gowin |
| GCS-REPLAY-002 | Đồng bộ replay đa client | Planned | Chưa có task |
| CAM-001 | Chốt camera chính (OV2640 vs OV9782) | **Decided 31/10/2026 — OV2640 DVP 8-bit** | IF-CAM đã ACTIVE; OV9782 loại khỏi phạm vi |

### Điểm phá vỡ hợp đồng đã duyệt (31/10/2026)

| ID | Nội dung | Từ | Thành | Phê duyệt |
| :--- | :--- | :--- | :--- | :--- |
| B-1 | Baud FPGA↔MCU | 115.200 (tài liệu) | **38.400** | HUMAN 31/10/2026 |
| B-2 | N max | 20 | **12** | HUMAN 31/10/2026 |
| B-3 | Endianness | RTL big / spec little | RTL sửa theo spec | Không cần (RTL sai) |
| B-4 | Camera | TBD | **OV2640 DVP** | HUMAN 31/10/2026 |
| B-5 | Input resolution | 640×640 | **160×160** | HUMAN 31/10/2026 |
| B-6 | NMS | — | **Giữ trên FPGA** | Quyết định thiết kế |
| B-7 | Trần siêu âm | 500 cm | **700 cm** | HUMAN 31/10/2026 |
| B-8 | `MAX_BOXES` | 16 | **12** | Khớp B-2 |
| B-9 | RTL path | `fpga/` | **`KVC_PR/` giữ nguyên** | HUMAN 31/10/2026 |
| B-10 | Top module | `kvc_top_demo` | `kvc_top` (có CNN) ở P6 | Nội bộ |

Chi tiết đầy đủ và tác động: `review/Deepseek/KVC-FPGA-REPAIR-20261030-DEEPSEEK-MASTER-PLAN.md` §3.

## Quy tắc duy trì

1. Một tài liệu = một ID = một đường dẫn. Không tạo file `.md` mới mà không thêm dòng.
2. Không có dòng trong INDEX = tài liệu không tồn tại. ID có trong INDEX mà file mất = lỗi.
3. Chỉ một tài liệu `ACTIVE` cho mỗi chủ đề. Khi bị thay: đổi `SUPERSEDED` và ghi ID thay thế.
4. Sửa code chạm contract trong `interfaces/` phải cập nhật tài liệu **trong cùng commit**.
5. Không xoá tài liệu: chuyển `ARCHIVED`, giữ nguyên nội dung.
6. Không ghi `Planned` thành đã triển khai. Mục Planned ở trên chỉ là danh sách chờ.
7. `SOURCE-VERIFIED` không phải `HARDWARE-VERIFIED`. Chỉ nâng mức khi có log/hash/board.
8. Không chép review report hoặc log review vào `docs/`; chúng nằm ngoài repo sản phẩm.
