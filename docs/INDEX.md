# KVC Product — Chỉ mục tài liệu

Task tạo bản: `KVC-PRODUCT-MIGRATE-20261026-001` · Ngày: 2026-10-26 · Owner: Kilo
Cập nhật P0 baseline: **2026-10-31** · Owner: Kilo · Phê duyệt break B-1→B-10: HUMAN
Cập nhật đồng bộ tài liệu: **2026-11-02** · Owner: Kilo · Bỏ Replay khỏi UI, bổ sung IF-05 (ESP32-S3-CAM)
Cập nhật đồng bộ chuẩn dự án: **2026-11-05** · Owner: Antigravity · Tactical HUD, Cảnh báo tự động, FPGA blob rev 2, pixel stats rev 3, 6 luồng chi tiết chuẩn hóa

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
| SYS-001 | Thiết kế hệ thống | `architecture/KVC_ThietKeHeThong.md` | ACTIVE | DESIGN | Phong | 2026-11-05 | toàn repo |
| SYS-002 | Trạng thái dự án | `architecture/KVC_PROJECT_STATUS.md` | ACTIVE | SOURCE-VERIFIED | Phong | 2026-11-05 | toàn repo |
| SYS-003 | Đặc tả thiết kế GCS | `architecture/KVC_GCS_DESIGN_SPEC.md` | ACTIVE | DESIGN | — | 2026-11-02 | `gcs/backend/`, `gcs/frontend/` |
| SYS-004 | Kế hoạch GCS (lịch sử) | `architecture/KVC_GCS_PLAN.md` | SUPERSEDED | DESIGN | — | 2026-10-15 | — |
| SYS-005 | Thiết kế gateway | `architecture/GATEWAY_DESIGN.md` | ACTIVE | DESIGN | Thịnh | 2026-10-25 | `firmware/gateway_esp32/` |
| SYS-006 | Design contract GCS (token, deny-list) | `architecture/KVC_GCS_DESIGN_CONTRACT.md` | ACTIVE | DESIGN | Kilo | 2026-10-29 | `gcs/frontend/src/styles/tokens.css`, `gcs/frontend/src/features/` |
| SYS-007 | Đề xuất vai trò hai camera (OV2640/FPGA + ESP32-S3-CAM) | `architecture/KVC_DUAL_CAMERA_DESIGN_PROPOSAL.md` | DRAFT | **DESIGN** — kiến trúc hai camera đã được HUMAN duyệt 02/11/2026 cho demo phân tầng; chưa có phần cứng. Liệt kê P0/P1/P2, giới hạn overlay và 3 phương án hiển thị | Kilo | 2026-11-02 | `gcs/backend/video_relay.py`, `KVC_PR/src/processing/kvc_blob_detect.v`, `gcs/frontend/src/features/video/VideoPanel.tsx` |

## Phần cứng

| ID | Tài liệu | Đường dẫn | Trạng thái | Bằng chứng | Owner | Kiểm tra gần nhất | Code liên quan |
|---|---|---|---|---|---|---|---|
| HW-MCU-001 | SONiX SN34F788 | `hardware/mcu/CHIP_SONIX_SN34F788_MCU.md` | ACTIVE | SOURCE-VERIFIED | Phong | 2026-10-25 | `firmware/mcu_payload/project_keil/` |
| HW-FPGA-001 | OneKiwi Primer 20K (GW2A) | `hardware/fpga/CHIP_ONEKIWI_20K_GOWIN_GW2A.md` | ACTIVE | SOURCE-VERIFIED | Vững | 2026-10-31 | `KVC_PR/src/KVC_FPGA.cst` |
| HW-FPGA-002 | FPGA CNN Engine (YOLO11n INT8) | `hardware/fpga/FPGA_CNN_ENGINE.md` | DRAFT | **SIMULATED** (31/10/2026): 3 TB engine PASS (1026+1026+146); E-01/E-02/E-03/E-05/E-06/E-08/E-09 FIXED; E-04 (module `conv_engine_dynamic` chưa hoàn chỉnh) + E-07 (calibration) mở | Vững | 2026-10-31 | `KVC_PR/src/conv_engine_dynamic_fsm.v`, `tb_conv0_golden.v`, `tb_conv0_real.v`, `tb_depthwise.v`, `tools/gen_*.py` |
| HW-FPGA-003 | Spec viet lai kvc_yolo_top (C-b) | hardware/fpga/KVC_YOLO_TOP_REWRITE_SPEC.md | DRAFT | DESIGN (chua implement) | (chua chon) | 2026-10-31 | KVC_PR/rtl/gen/kvc_yolo_top.v, docs/hardware/fpga/FPGA_CNN_ENGINE.md |
| HW-SEN-001 | Thông số gói cảm biến (AJ-SR04M, GY-87, NEO-M10N) | `hardware/sensors/SENSOR_PACKAGES.md` | ACTIVE | SOURCE-VERIFIED | Cường | 2026-11-05 | `firmware/mcu_payload/src/sensors/` |
| WIR-001 | Pinout và đấu dây tổng | `hardware/wiring/KVC_MASTER_PINOUT_WIRING.md` | ACTIVE | DESIGN | Phong | 2026-10-25 | `firmware/mcu_payload/inc/kvc_pinout.h` |
| WIR-002 | Hướng dẫn sơ đồ nguyên lý mạch & phân phối nguồn | `hardware/wiring/KVC_CIRCUIT_SCHEMATIC_GUIDE.md` | ACTIVE | DESIGN | Kiên | 2026-11-05 | `docs/hardware/wiring/` |
| VEN-001 | Gói hãng (version/nguồn/checksum) | `hardware/vendor/VENDOR_PACKAGES.md` | ACTIVE | SOURCE-VERIFIED | Phong | 2026-10-25 | `firmware/mcu_payload/inc/SONiX.SN34F7_DFP.2.0.4/` |

## Giao diện

ID giao diện là **bất biến**. Đổi tên file phải giữ ID trong tiêu đề.

| ID | Tài liệu | Đường dẫn | Trạng thái | Bằng chứng | Owner | Kiểm tra gần nhất | Code liên quan |
|---|---|---|---|---|---|---|---|
| IF-00 | MCU ↔ cảm biến | `interfaces/IF_MCU_SENSORS.md` | ACTIVE | **SIMULATED** (31/10/2026): trần 700 cm + `MAX_FRAME_MM` 8000 + `alt_quality`; test 65/65 và 64/64 PASS | Phong | 2026-10-31 | `inc/kvc_usound_decode.h`, `inc/kvc_georef.h`, `src/sensors/kvc_usound_decode.c` |
| IF-01 | FPGA ↔ MCU UART | `interfaces/IF_FPGA_MCU_UART.md` | ACTIVE | **`HARDWARE-VERIFIED`** cho cả đường mock (31/10/2026) và **đường blob thật** (01/11/2026): FPGA→PC 1.102/1.102 frame 0 CRC; FPGA→MCU `fe=0 oe=0 drop=0 isr==byt` trên **197.844 B/7.609 frame** (mock) và **720 B** (blob thật, `BB v1 crc0`). `BBOX_SOURCE=1` từ 01/11/2026 — layout/CRC/baud không đổi. 22/22 TB, Fmax 113,277 MHz TNS=0. **Lưu ý:** nhịp khung đường blob là **5,08–7,48 frame/s** (F-01), không phải 100 Hz của đường mock | Vững | 2026-11-01 | `KVC_PR/src/comm/`, `KVC_PR/src/processing/kvc_blob_detect.v`, `KVC_PR/verification/tb/`, `src/sensors/kvc_fpga_bbox.c` |
| IF-02 | MCU ↔ LoRa RF 32 byte | `interfaces/IF_MCU_LORA_RF.md` | ACTIVE | APPROVED ABI (HUMAN 29/10/2026). **01/11/2026: `HARDWARE-VERIFIED` một phần** — MCU đóng gói + SX1278 phát TxDone `tx=17/0`, tự kiểm GV-02 PASS (CRC `0xE260`). Cấu hình RF 2 phía khớp cả 6 tham số (433 MHz/SF7/BW125/CR4-5/sync 0x12/hardware CRC). **Phía gateway nhận sóng: `NOT RUN` — BLOCKED, bo Gateway chưa bàn giao (owner Thịnh)** | Thịnh | 2026-11-01 | `inc/kvc_telemetry.h`, `firmware/gateway_esp32/src/main.cpp`, `verification/evidence/KVC-MCU-FPGA-LORA-20261101-001.md` |
| IF-03 | ESP32 ↔ GCS WebSocket | `interfaces/IF_ESP32_GCS_WS.md` | ACTIVE | SOURCE-VERIFIED (ABI payload IF-02 đã duyệt 29/10/2026) | Thịnh | 2026-10-29 | `gcs/backend/esp32_ingress.py` |
| IF-04 | GCS REST/WebSocket route | `interfaces/IF_GCS_DATA_CONTRACT.md` | ACTIVE | SOURCE-VERIFIED | Phong | 2026-10-25 | `gcs/backend/main.py` |
| IF-04-SEM | GCS semantics dữ liệu | `interfaces/KVC_GCS_DATA_CONTRACT.md` | ACTIVE | DESIGN | Phong | 2026-10-25 | `gcs/backend/schemas.py`, `gcs/backend/state.py` |
| IF-05 | ESP32-S3-CAM ↔ GCS Backend (MJPEG relay) | `interfaces/IF_ESP32_CAM_GCS.md` | ACTIVE | **SOURCE-VERIFIED + SIMULATED + BUILT**; **HARDWARE-VERIFIED chỉ cho firmware b1.5.1 (HVGA 480×320/q22)**. Hiện hành **b1.5.2** (`firmware/esp32_s3_cam/`, build exit 0, OV3660/HVGA 480×320/**q26**/fb_count=3/cổng 81/STA/TCP_NODELAY) — q26 **CHƯA nạp bo, CHƯA đo**; chỉ đổi `KVC_CAM_JPEG_QUALITY` 22→26 để tăng biên an toàn dưới trần buffer. **Số đo q22 (bo thật, 3789 khung, IP 192.168.137.220)**: `fps` 16,94–20,97, `tx` 41–53 ms, `bytes` 4390–5158, `kbps` 83–121, `fail=0`. **Nhưng 66 cửa sổ log liên tiếp (IP 192.168.137.189) cho thấy giới hạn thật**: `bytes` **3886–7206** — **13/66 = 20% vượt trần 5744**, cao nhất 7206 (vượt 1462 B) ⇒ `tx` dội **2360 ms**, `fps` xuống **0,79**, `kbps` về 2; `send_fail=1` (`errno=104`). Vì vậy **KHÔNG được nói "đã triệt tiêu congestion collapse"** hay "`bytes` là hằng số ~4,4 KB". Nguyên nhân gốc: `CONFIG_LWIP_TCP_SND_BUF_DEFAULT=5744` / `MSS=1436` (4 segment) — VGA q16 (~11 KB = 8 segment) vượt buffer, mất gói ⇒ RTO 3 s. Đã sửa trước đó: **bug watchdog restart camera khi hết client** (chỉ chạy khi `active_streams > 0`, mốc = đầu phiên, deinit chỉ khi `active==0`), **bug `TxBuffer` static dùng chung gây hỏng JPEG khi ≥2 client**, **`fb_count` 3→2 làm 0,4 FPS** (driver tạo queue `fb_count-1`, DVP dừng mỗi khung). `AE_LEVEL=-2` chỉ giảm nhoè chuyển động, **KHÔNG tăng FPS** (`wait=0` chứng minh cảm biến không chậm). **Tiêu chí nghiệm thu q26 (chưa đạt)**: `bytes` max ≤ 5744 ở cả cảnh nhiều chi tiết, `tx` < 150 ms trong ≥ 30 phút soak, `fps` ≥ 12, `fail/null/restarts` = 0. **Fan-out một kết nối**: `VideoRelay` giữ **1** kết nối tới camera, broadcast cho subscriber. **41 PASS** (`test_video_relay.py` 24 + `test_s3cam_wire_contract.py` 17). H1/H2/H3/H4/H5 đã chốt 01/11/2026 | Kilo | 2026-11-04 | `firmware/esp32_s3_cam/`, `gcs/backend/video_relay.py`, `gcs/backend/main.py`, `gcs/frontend/src/features/video/VideoPanel.tsx`, `scripts/manual/measure_mjpeg_stream.py` |
| IF-CAM | Camera ↔ FPGA | `interfaces/IF_CAMERA_FPGA.md` | ACTIVE | **SIMULATED** cho FIFO+timestamp+blob detect (01/11/2026); ảnh thật chưa đo, camera chưa xác nhận phát VSYNC trên bo | Kiên | 2026-11-01 | `KVC_PR/src/KVC_FPGA.cst:58-98`, `KVC_PR/src/camera/`, `KVC_PR/src/processing/kvc_blob_detect.v`, `KVC_PR/src/async_fifo_cdc.v` |
| IF-MATRIX | Ma trận giao diện | `interfaces/README.md` | ACTIVE | SOURCE-VERIFIED | — | 2026-11-05 | tất cả `IF-*` |

Ghi chú IF-04: `IF_GCS_DATA_CONTRACT.md` là đặc tả **route/endpoint**; 
`KVC_GCS_DATA_CONTRACT.md` là **semantics dữ liệu** (mục 2/5/6/7). Hai tài liệu
khác vai trò, không gộp. Cả hai đều thuộc họ IF-04.

> **Cập nhật 02/11/2026 — bỏ chế độ phát lại khỏi giao diện:** `routes.tsx` chỉ còn
> 6 route (`/overview`, `/mission`, `/alerts`, `/history`, `/devices`, `/settings`);
> `AppHeader.tsx` chỉ còn nút **MOCK** và **REAL**. Chức năng thay thế là trang
> **Nhật ký phiên** (`gcs/frontend/src/features/history/EventLogPage.tsx`) đọc log đã
> commit, lọc theo actor/mức/source, ẩn mục và xuất CSV.
>
> Backend **vẫn giữ** `gcs/backend/replay_engine.py` và 6 route `/api/replay/*`
> (`start/pause/resume/seek/speed/stop`) trong `main.py`; đây là **code dự phòng
> không có UI gọi**, không phải tính năng đang hoạt động. `SourceMode` vẫn khai báo
> `'REPLAY'` để parser/adapter không crash khi đọc bản ghi cũ
> (`gcs/frontend/src/types/telemetry.ts:7-12`). Các tài liệu IF-04 mô tả các route
> này như đặc tả backend hợp lệ, **không** dùng chúng để tuyên bố GCS có chức năng
> phát lại trên giao diện.

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
| CFG-GCS-001 | Chạy Dashboard (tổng) | `configuration/DASHBOARD_RUN.md` | ACTIVE | SOURCE-VERIFIED | Phong | 2026-11-02 | `gcs/` |
| CFG-GCS-002 | Chạy backend | `configuration/DASHBOARD_BACKEND.md` | ACTIVE | SOURCE-VERIFIED | Phong | 2026-11-02 | `gcs/backend/` |
| CFG-GCS-003 | Chạy frontend | `configuration/DASHBOARD_FRONTEND.md` | ACTIVE | SOURCE-VERIFIED | Phong | 2026-11-02 | `gcs/frontend/` |
| CFG-CAM-001 | Build/nạp firmware ESP32-S3-CAM (IF-05) | `firmware/esp32_s3_cam/README.md` | ACTIVE | **HARDWARE-VERIFIED cho b1.5.1/q22** (soak 3789 khung, `fps` 16,94–20,97, `tx` 41–53 ms, `bytes` 4390–5158, `fail=0`). **b1.5.2/q26: BUILT only — chưa nạp bo, chưa đo.** Log 66 cửa sổ ở q22 cho thấy 20% cửa sổ vượt trần buffer 5744 B (max 7206) ⇒ q26 là biện pháp giảm rủi ro, **chưa được chứng minh**. Tiêu chí nghiệm thu q26: `bytes` max ≤ 5744, `tx` < 150 ms trong ≥ 30 phút soak, `fps` ≥ 12 | Kilo | 2026-11-04 | `firmware/esp32_s3_cam/`, `gcs/backend/video_relay.py` |

## Kiểm thử

| ID | Tài liệu | Đường dẫn | Trạng thái | Bằng chứng | Owner | Kiểm tra gần nhất | Code liên quan |
|---|---|---|---|---|---|---|---|
| VER-001 | Kế hoạch kiểm thử gateway | `verification/GATEWAY_TEST_PLAN.md` | ACTIVE | DESIGN — **01/11/2026: G1–G6 `NOT RUN`, BLOCKED vì bo Gateway chưa bàn giao** (owner Thịnh). Riêng G5 có số liệu phía phát: `tx=17/0` HARDWARE-VERIFIED | Thịnh | 2026-11-01 | `firmware/gateway_esp32/` |
| VER-002 | Kế hoạch bench MCU | `verification/MCU_BENCH_TEST_PLAN.md` | ACTIVE | DESIGN | Phong | 2026-10-28 | `firmware/mcu_payload/` |
| VER-003 | Checklist bring-up FPGA trên kit | `verification/BRINGUP_CHECKLIST.md` | ACTIVE | **G2.1–G2.4 PASS** trên bo thật. **01/11/2026: G2.4 chạy lại PASS** với `KVC-MCU-20261101-FPGA` (`fe=0 oe=0 drop=0` trên 720 B, `BB v1 crc0`, ABI GV-02 PASS). **03/11/2026: 6.1.10 PASS (HARDWARE-VERIFIED)** — 7/58 dòng `[M3]` có `N=1 class=2`, `crc=0`, `fe=oe=drop=0` trên 2.296 B, `tx` 1 gói/s, ratio timebase 1,0030. **G6.1 = PASS 8/10**: 6.1.6/6.1.7 SUPERSEDED (blob từ pixel thật là bằng chứng mạnh hơn scope), **6.1.9 (ngưỡng màu RGB565) NOT RUN** — là dữ liệu cần cho F-02. **G6.2 UNBLOCKED** + có số đo đầu tiên, 6.2.1–6.2.7 chưa đo. **G2.7 = PASS 3/4** (nhiệt NOT MEASURED). **6.1.10 tái xác thực 03/11/2026 trên release `86CCF5DD`** (xác nhận bằng `N∈{0,1}`): **9/58 = 15,5 %**, `v1`/`crc=0` 100 %, `Δfe=0` trên 2.162 B, ratio 1,0053 — độc lập với phiên 12,1 % trước đó. **G6.1 = PASS 8/10**: 6.1.6/6.1.7 SUPERSEDED (blob từ pixel thật mạnh hơn scope), **6.1.9 (ngưỡng màu RGB565) NOT RUN** — là dữ liệu cần cho F-02. **G6.2 UNBLOCKED** + `US=68..70cm ok`, 6.2.1–6.2.7 chưa đo. **G2.7 = PASS 3/4** (nhiệt **NOT MEASURED** — cảm nhận tay không thay nhiệt kế). **F-06 + F-07 + F-08 CLOSED** | Vững | 2026-11-03 | `scripts/manual/fpga_uart_capture.py`, `scripts/manual/soak_mcu_log.py`, `verification/evidence/G6.1_release_clean_f08.txt`, `verification/evidence/KVC-G6.1-20261103-002_release.md` |
| VER-004 | Hồ sơ build bitstream FPGA | `verification/FPGA_BUILD_RECORD.md` | ACTIVE | **BUILT** — **`9E62B590…` (blob rev 2, bộ lọc tỷ lệ)**, Fmax `clk_100m` **116,630 MHz** / `cam_pclk` **89,710 MHz**, TNS=0, **1.785 LUT-ALU (1.574 LUT + 211 ALU) / 1.281 FF / 1 BSRAM / 0,5 DSP**. Bản trước `86CCF5DD…` (blob rev 1) lưu ở §1z để so hồi quy. Diag G0 `3620B802…`, diag pixel `05288FA6…`. **B0: `KVC_PR/` còn nhiều file sửa + chưa track → không tái lập được từ HEAD (H6 chưa đóng)**. **`9E62B590` CHƯA NẠP BO** | Kilo | 2026-11-04 | `KVC_PR/tools/build_kvc_fpga.tcl`, `verification/FPGA_BUILD_RECORD.md` |
| VER-005 | Runbook Track B trên bo thật (G0/G6.1/A1–A10) | `verification/TRACK_B_RUNBOOK.md` | ACTIVE | DESIGN — quy trình thao tác, tiêu chí PASS/FAIL, mẫu ghi bằng chứng. Đã dùng thật cho G0/G6.1; thêm §2.1 (kiểm dây) và §2.2 (nhận diện bitstream) sau hai sự cố 02–03/11 | Kilo | 2026-11-03 | `scripts/manual/fpga_uart_capture.py`, `review/artifacts/` |
| VER-006 | Công cụ đo màu RGB565 cho G6.1.9 | `verification/G6.1.9_PIXEL_COLOR_PROCEDURE.md` | ACTIVE | **BUILT + SIMULATED** — `pixel_stats.v` **rev 3** (khớp bộ lọc tỷ lệ của blob rev 2 + 4 bộ đếm chẩn đoán + slot 10 = `PIXSTAT_REV`) + wrapper `kvc_top_diag_pixel` (`DIAG_MODE=3`), bitstream **`05288FA6`** (Fmax `clk_100m` **113,761 MHz**, TNS 0, 2.187 LUT / 1.504 FF), `tb_pixel_stats` **21/21 PASS**, suite FPGA **25/25**, `decode_pixel_diag.py` (test **22/22**). Rev 1 `A92E18B9` (chặt hơn blob cũ) và rev 2 `0B125CDC` (đúng ngưỡng blob **cũ**) **giữ lại nhưng không dùng để hiệu chuẩn** — ngưỡng cũ đã bị thay bằng bộ lọc tỷ lệ. **`HARDWARE-VERIFIED`: NOT RUN** — chưa nạp bo. Capture rev 1 (43 khung, 0 CRC): `pix_count` 36.668–119.911 = **12–39 % VGA** ⇒ frame bị cắt | Kilo | 2026-11-04 | `KVC_PR/src/processing/pixel_stats.v`, `KVC_PR/src/kvc_top_diag_pixel.v`, `KVC_PR/tools/build_kvc_diag_pixel.tcl`, `scripts/manual/decode_pixel_diag.py`, `tests/integration/test_decode_pixel_diag.py` |
| VER-007 | Bộ lọc màu blob rev 2 (tỷ lệ + hình học) | `verification/FPGA_BUILD_RECORD.md` §1.0c–§1.0e | **BUILT + SIMULATED** | **DESIGN đã triển khai** — `kvc_blob_detect.v` rev 2 thay 5 ngưỡng biên độ tuyệt đối (`R_MIN/G_MIN/G_MAX/B_MAX` + trội đỏ) bằng **thứ tự R>G>B + dải hue 10–40° + bão hoà S≥0,80 + sàn sáng/chroma**; thêm **run-length ≥3**, **rows≥6**, **aspect≤4**; `MIN_PIXELS` 400→120, `CONF_SHIFT` 6→5. Bitstream **`9E62B590`** (Fmax `clk_100m` 116,630 MHz, `cam_pclk` 89,710 MHz, TNS 0, **1.574 LUT / 211 ALU / 1.281 FF / 1 BSRAM / 0,5 DSP** — **+131 LUT, 0 DSP, 0 BSRAM thêm**). `tb_kvc_blob_detect` **18/18**. Lý do: rev 1 chỉ đạt **12,1–15,5 %** trên bo. **`HARDWARE-VERIFIED`: NOT RUN** — chưa nạp bo; ngưỡng `S` chưa đo dưới nắng thật | Kilo | 2026-11-04 | `KVC_PR/src/processing/kvc_blob_detect.v`, `KVC_PR/verification/tb/tb_kvc_blob_detect.v`, `KVC_PR/verification/tb/tb_pixel_stats.v` |

## Kế hoạch và phân công

| ID | Tài liệu | Đường dẫn | Trạng thái | Bằng chứng | Owner | Kiểm tra gần nhất | Code liên quan |
|---|---|---|---|---|---|---|---|
| PLAN-001 | Phân công MCU Payload + Gateway ESP32 | `planning/KVC_PHAN_CONG_2_NGUOI.md` | **ARCHIVED** | **HISTORICAL** (26/10/2026) — khôi phục 01/11/2026 sau khi bị xoá nhầm ở `6cce988`; nội dung giữ nguyên bản gốc, đầu file có bảng đối chiếu các điểm đã lệch (GV-01→GV-02, bỏ pin, trần 500→700 cm, siêu âm nay BLOCKED). Không dùng làm trạng thái hiện hành | Phong + Thịnh | 2026-11-01 | `firmware/mcu_payload/`, `firmware/gateway_esp32/` |
| PLAN-002 | Kế hoạch triển khai GCS Dashboard | `architecture/KVC_GCS_IMPLEMENTATION_PLAN_20261029.md` | ACTIVE | DESIGN — ghi chú 02/11/2026: mục chế độ phát lại **không còn hiệu lực** (UI đã bỏ Replay) | Kilo | 2026-11-02 | `gcs/frontend/`, `gcs/backend/esp32_ingress.py` |
| PLAN-003 | P0 hotfix GCS Dashboard (29/10) | `architecture/KVC_GCS_P0_Hotfix_Plan_20261029.md` | ACTIVE | DESIGN — ghi chú 02/11/2026: mục chế độ phát lại **không còn hiệu lực** | Kilo | 2026-11-02 | `gcs/frontend/src/` |
| PLAN-004 | Danh sách công việc còn lại (P0–P3) | `architecture/KVC_WORK_BACKLOG_20261031.md` | ACTIVE | SOURCE-VERIFIED | Kilo | 2026-10-31 | toàn repo |
| PLAN-005 | Task chỉnh PCLK OV2640 + xử lý AEC (F-01 → F-05) | `planning/KVC-CAM-PCLK-20261102-001.md` | **APPROVED** (HUMAN 02/11/2026, điều kiện: Pha 0 tiên quyết) | SOURCE-VERIFIED — **chưa sửa RTL, chưa build**. Pha 0 bắt buộc: đo PCLK/VSYNC/HREF + **bắt ≥200 chu kỳ VSYNC (bước 0.5)** để chọn 1 trong 3 nhánh. Pha 0b (AEC) bắt buộc trước Pha 1. Không chạm IF-01 | Kilo | 2026-11-02 | `KVC_PR/src/camera/ov2640_config.v`, `KVC_PR/constraints/kvc_top_demo.sdc` |

## Trình diễn, Bảo vệ Đề tài & Quy trình

| ID | Tài liệu | Đường dẫn | Trạng thái | Bằng chứng | Owner | Kiểm tra gần nhất | Code liên quan |
|---|---|---|---|---|---|---|---|
| PRES-001 | Cẩm nang toàn diện đi thi KVC | `presentation/KVC_CAM_NANG_TOAN_DIEN_DI_THI.md` | ACTIVE | SOURCE-VERIFIED | Nhóm KVC | 2026-11-05 | toàn repo |
| PRES-002 | Bộ câu hỏi phản biện Ban giám khảo | `presentation/KVC_BO_CAU_HOI_PHAN_BIEN_BGK.md` | ACTIVE | SOURCE-VERIFIED | Nhóm KVC | 2026-11-05 | toàn repo |
| WF-001 | Quy trình làm việc và phân vai AI | `KVC_AI_WORKFLOW.md` | ACTIVE | SOURCE-VERIFIED | Nhóm KVC | 2026-11-05 | `scripts/kvc-review.ps1` |

## Planned — chưa triển khai

Các mục dưới **chưa có source hoặc tài liệu**. Không tạo file giả để lấp chỗ.

| ID | Nội dung | Trạng thái | Ghi chú |
|---|---|---|---|
| ALG-MCU-001 | Hợp nhất cảm biến (IMU + GNSS + siêu âm) | Planned | Chờ `firmware/mcu_payload/src/algorithms/` |
| ALG-MCU-002 | Hiệu chuẩn và bù sai số cảm biến | Planned | Chờ source thuật toán |
| ALG-MCU-003 | Ước lượng vị trí / dead-reckoning | Planned | Chờ source thuật toán |
| RTL-001 | RTL FPGA (BBox/UART/camera pipeline) | **SIMULATED + BUILT** — 01/11/2026: đường BBox **tính từ pixel thật** (`kvc_blob_detect`, ngưỡng màu RGB565 + color dominance, 0 BSRAM/DSP) thay `mock_bbox`; mặc định `BBOX_SOURCE=1`. 22/22 TB PASS, Fmax 113,277 MHz TNS=0. **Chưa `HARDWARE-VERIFIED`** (Gate G0 + A1–A10 chưa chạy). Bitstream **chưa chứa CNN** (`BBOX_SOURCE=2`). **P6 chặn:** `kvc_yolo_top.v` chưa bao giờ compile (instantiation `.p_in_w`, `.win_00`, `.fifo_rd_en` không tồn tại trong `conv_engine_dynamic`); cần 4–6 tuần | `KVC_PR/src/`, `KVC_PR/rtl/`; commit `3ab8da2` → `2c49446` |
| RTL-003 | Bảng cấu hình lớp | **SOURCE-VERIFIED** — `layer_table.vh` sinh từ `conv_layer_map.csv`: 88 dòng, 7 stride=2, 7 grouped, 0 placeholder, verify 0 mismatch | `KVC_PR/rtl/gen/layer_table.vh`, `KVC_PR/tools/gen_layer_table.py` |
| RTL-002 | Testbench FPGA | **SIMULATED** — **22/22 TB PASS** (exit 0): 3 engine (1026+1026+146), 6 toán tử (maxpool/concat/split/upsample/residual/sppf), line buffer đa kênh, UART (30 check), packetizer, top demo, **đo nhịp frame**, **giải mã UART → parser IF-01**, CDC, NMS, **blob detect (12 kịch bản)** + **tích hợp blob → IF-01 (8 check)**. Chạy bằng `pwsh scripts/run_fpga_tb.ps1` | `KVC_PR/verification/tb/`, `scripts/run_fpga_tb.ps1` |
| RTL-004 | Toán tử graph (C-b) | **SIMULATED** — 6 module cần cho model rút gọn đã verify: `maxpool2d`, `concat_n_feature`, `split_channels`, `upsample_nearest`, `residual_add_int8` (quét 65536 tổ hợp), `sppf_block` | `KVC_PR/src/processing/` |
| GCS-REPLAY-002 | Đồng bộ replay đa client | **CANCELLED** (02/11/2026) | UI đã bỏ chế độ phát lại; backend `replay_engine.py` + `/api/replay/*` còn là code dự phòng không có UI gọi. Không mở task mới trừ khi quyết định tái dùng |
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
