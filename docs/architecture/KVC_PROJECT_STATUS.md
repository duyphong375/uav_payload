# KVC — Tiến độ dự án theo bằng chứng

Cập nhật **05/11/2026, Asia/Saigon**. Task: **KVC-STATUS-DOC-20261105-001**; owner tài liệu: Antigravity. Source author: **KVC Team**; tài liệu này tổng hợp tiến độ thực tế theo các cấp độ bằng chứng thực nghiệm của dự án (DESIGN, SOURCE-VERIFIED, SIMULATED, BUILT/SYNTHESIZED, HARDWARE-VERIFIED).

> **Cập nhật 05/11/2026 — Tactical HUD, Cảnh Báo Tự Động & FPGA Blob Rev 2:**
> - **GCS Dashboard & UI:** Hoàn thiện cụm công cụ tác chiến **Tactical HUD** gồm `OrientationCluster.tsx` (cụm đo góc nghiêng Roll/Pitch), `WaterClearanceGauge.tsx` (thanh đo độ cao mặt nước có cảnh báo), `SensorFlagsInspector.tsx` (thanh kiểm tra cờ cảm biến thời gian thực), và `RecentDetectionsTable.tsx`. Bộ phát hiện cảnh báo tự động `alertDetector.ts` (kiểm tra ngắt kết nối LoRa, UAV nghiêng nguy hiểm > 25°, độ cao quá thấp < 1,5 m, mất GNSS fix) và mô đun thời gian nhật ký `eventLogTime.ts`. Chế độ Replay đã loại bỏ hoàn toàn khỏi UI (thay bằng trang **Nhật ký phiên** `EventLogPage`). Suite Vitest đạt **173+ tests / 27 file PASS**, build UI exit 0.
> - **FPGA Gowin GW2A (OneKiwi Primer 20K):** Đạt mốc **`HARDWARE-VERIFIED`** trên đường BBox blob thật (`86CCF5DD`, 03/11/2026: 9/58 khung $N=1$, `v1`/`crc=0` 100%, $\Delta fe=0$ trên 2.162 B). Hoàn thành tổng hợp và mô phỏng bộ lọc blob rev 2 (`9E62B590`, Fmax 116,63 MHz, 18/18 TB PASS) và công cụ chẩn đoán màu pixel stats rev 3 (`05288FA6`, 21/21 TB PASS, Fmax 113,76 MHz). Toàn bộ 25/25 testbench FPGA đạt PASS.
> - **Gateway ESP32-C3:** Bổ sung mô đun điều phối tuyến WebSocket `ws_route.cpp` và chính sách mạng `net_policy.cpp` (ưu tiên STA ➔ fallback SoftAP không cắt client). Bộ host test C++ (`test_rf_decode`, `test_net_policy`, `test_ws_route`) PASS 100%.
> - **Kênh Video Phụ IF-05:** Firmware ESP32-S3-CAM b1.5.2 (HVGA 480×320, q26, cổng 81, single upstream connection fanout) build exit 0. Backend relay đạt 41/41 test hợp đồng PASS (`test_video_relay.py` + `test_s3cam_wire_contract.py`).

> **Cập nhật 02/11/2026 — bỏ chế độ phát lại khỏi giao diện:** Dashboard chỉ còn 2 chế độ **MOCK** và **REAL** (`AppHeader.tsx`), `routes.tsx` chỉ còn 6 route và **không có trang Replay**. Chức năng thay thế là trang **Nhật ký phiên** (`features/history/EventLogPage.tsx`): đọc log đã commit, lọc theo actor/mức/source, ẩn mục và xuất CSV. Backend **vẫn còn** `gcs/backend/replay_engine.py` + 6 route `/api/replay/*` nhưng **không có UI nào gọi** — coi là code dự phòng, không phải tính năng đang hoạt động. `SourceMode` vẫn khai báo `'REPLAY'` để parser không crash khi đọc bản ghi cũ.
>
> **Cập nhật 02/11/2026 — kênh quan sát phụ IF-05:** thêm **ESP32-S3-CAM + OV3660 3 MP** phát MJPEG qua Wi-Fi tới backend relay. Đây là **kênh phụ**, **không sinh tọa độ**, không đi qua LoRa, không thay OV2640/FPGA. Firmware mới Build exit 0 nhưng **chưa nạp bo** → mức `SOURCE-VERIFIED` + `SIMULATED` + `BUILT`, **không** `HARDWARE-VERIFIED`.

> **Cập nhật 31/10/2026 (B-1→B-10):** Chủ dự án phê duyệt 10 điểm phá vỡ hợp đồng theo thực tế kỹ thuật: baud 38.400, N ≤ 12, camera OV2640 DVP, input 160×160, trần siêu âm 700 cm, giữ thư mục `KVC_PR/`. Chi tiết xem `docs/INDEX.md` §"Điểm phá vỡ hợp đồng đã duyệt" và `review/Deepseek/KVC-FPGA-REPAIR-20261030-DEEPSEEK-MASTER-PLAN.md`. Matrix FPGA bên dưới đã cập nhật: **RTL tồn tại (~200 tệp `.v`) nhưng bitstream chưa đạt timing (Fmax 14,6 MHz) và không chứa YOLO11n**.

> Đồng bộ nội dung trong **KVC-DOC-CONSISTENCY-20261014-001**, owner Codex, 14/10/2026. Các kết quả test phía dưới là lịch sử; lượt này đối chiếu source/tài liệu và sửa Markdown, chưa chạy phần cứng. Xem báo cáo cập nhật (không có trong bản sản phẩm).

> **Cập nhật kiến trúc 15/10/2026:** Thiết kế hiện hành chọn họ SoC ESP32-C3 cho gateway trạm đất có nguồn riêng, Wi-Fi SoftAP/WebSocket tới dịch vụ GCS trên laptop và Dashboard web trong browser. Mã kit/board, module, flash và pinout còn chờ xác minh; ingress trên phần cứng chưa được kiểm tra. Snapshot/status, test và log bên dưới giữ nguyên mốc 14/10; các chỗ ghi USB/CP2102 hoặc STM32 là lịch sử, không phải cấu hình mục tiêu mới. RF 32 byte đã được HUMAN duyệt ABI ngày 29/10/2026 (xem mục "Những điểm chặn" số 3); transport Wi-Fi chưa được xác minh trên thiết bị.

> **Cập nhật phần cứng & Pinout 20/10/2026 (KVC-HW-PINOUT-20261020-001):** Ban hành bản đồ chân tổng thể [KVC_MASTER_PINOUT_WIRING.md](../hardware/wiring/KVC_MASTER_PINOUT_WIRING.md). Đã tạo file ràng buộc chân Header J2 FPGA OneKiwi [pins.cst](../fpga/constraints/pins.cst); header chân chuẩn MCU Sonix [kvc_pinout.h](../firmware/mcu_payload/inc/kvc_pinout.h) và template Keil; đồng bộ mã nguồn Gateway ESP32 [main.cpp](../firmware/gateway_esp32/src/main.cpp) với chân SPI LoRa SX1278 (433 MHz).

> **Cập nhật bench MCU-only 28/10/2026 (KVC-MCU-BENCH-20261028-001):** Bo bench hiện có **MCU Sonix đầy đủ cảm biến (MPU-6050, AJ-SR04M, NEO-M10N) + SX1278**, nhưng **KHÔNG có FPGA** (chưa có RTL/top-level phát BBox) và **KHÔNG có ESP32-C3**. Firmware được chỉnh để chạy ổn định ở cấu hình đó: `KVC_FPGA_ENABLE=0` (không init UART1, đặt P2.3/P0.12 về mức xác định), banner + dòng `[INIT]` đồng bộ ngay sau reset, counter `tx=ok/fail` trong `[M3]`, macro `KVC_GNSS_SKIP_AUTOBAUD`. Keil full rebuild: **0 Error / 8 Warning** (toàn bộ warning có sẵn). Host test 9/9 PASS. **Chưa nạp flash, chưa HARDWARE-VERIFIED.** Kế hoạch đọc log: [MCU_BENCH_TEST_PLAN.md](../verification/MCU_BENCH_TEST_PLAN.md).
>
> Hệ quả cần nhớ: khi `KVC_FPGA_ENABLE=0`, cờ `AI_DETECTED` luôn 0, `target_lat/lon` và `target_x/y_local` luôn 0, **toàn bộ nhánh georef không chạy**. Các rủi ro georef (FW-001 của review Codex 28/10, trần siêu âm 500/800 cm) **không kích hoạt** trong buổi bench này nhưng vẫn là nợ kỹ thuật phải sửa trước khi có RTL.
>
> **Lỗi thời so với hiện trạng 01/11/2026:** khối này mô tả cấu hình bench ngày 28/10, **không phải** cấu hình hiện hành. Từ 31/10, `KVC_FPGA_ENABLE` mặc định là **1** (`main.c:371`) sau khi G2.4 PASS; `=0` chỉ dùng khi cố ý bench bo không có FPGA. Trần siêu âm đã là **700 cm** (B-7), và đầu dò hiện đang hỏng nên `ALT_VALID` thực tế luôn 0.

> **Cập nhật ABI 29/10/2026 (HUMAN APPROVAL):** ABI RF v1 32 byte (IF-02) đã được chủ dự án duyệt thay mặt hai owner MCU (Phong) và Gateway (Thịnh), phạm vi: độ dài 32 byte, thứ tự trường/offset, Little-Endian, CRC-16/CCITT-FALSE trên byte 0–29, golden vector. Đây là **duyệt thiết kế**, không phải nghiệm thu phần cứng: chưa có capture frame thật MCU ↔ ESP32, chưa nạp lại firmware 28/10, chưa có ESP32-C3 trên bench. Không duyệt kèm thay đổi pinout, baud UART hay modulation SF7/SF8.
>
> **Sửa đổi cùng ngày — bỏ phép đo pin:** byte 25 (trước là `battery_raw`) đổi thành `status_reserved`, luôn `0`; độ dài 32 byte, offset và CRC coverage không đổi. Golden vector chuyển GV-01 (`0x304E`) → **GV-02** (`0xE260`). Backend map `battery_pct` luôn `null`; dashboard bỏ thẻ/ô hiển thị pin. Vẫn **chưa** HARDWARE-VERIFIED.

## Kết luận hiện tại

**KVC đã có nền tảng phần mềm GCS, relay video phụ và AI tham chiếu PC; chưa có bằng chứng hoàn thành payload FPGA–MCU–LoRa–GCS trên phần cứng.** Phần mềm MOCK đã đi xa hơn skeleton, nhưng chưa thay thế serial ingress, định vị bằng cảm biến thật hoặc AI chạy trên FPGA. Không có cơ sở quy toàn dự án thành một tỷ lệ phần trăm.

KVC là tải nhiệm vụ tìm kiếm cứu nạn bão lũ, không phải flight controller. Lịch và KPI ở [thiết kế hệ thống](KVC_ThietKeHeThong.md) là mục tiêu DESIGN. Báo cáo này là nguồn trạng thái tổng hợp; bản thiết kế vẫn là nguồn kiến trúc và lịch.

**Mô hình đã chốt về lựa chọn:** YOLO11n, detection person/lifebuoy. Script/run/template có tên yolo11n; chưa kiểm metadata/graph mọi checkpoint, chưa train lại hoặc xác nhận chạy FPGA trong lượt đồng nhất.

Cập nhật UI trong **KVC-PROJECT-SYNC-CLEAN-20261014-001**: tên thiết bị bám BOM; GNSS/DOP/pin/AI throughput thiếu dữ liệu để N/A, bỏ thông báo lệnh gimbal/eco/ping giả. Đây là sửa nguồn/hiển thị, chưa nghiệm thu runtime hoặc phần cứng. Bảng linh kiện thiết kế đã có chức năng/In/Out.

## Ma trận thực hiện

| Phân hệ | Đã có | Mức bằng chứng hiện có | Còn thiếu để tích hợp/nghiệm thu |
| --- | --- | --- | --- |
| GCS frontend | React 19 / TypeScript / Vite; Tactical HUD (OrientationCluster, WaterClearanceGauge, SensorFlagsInspector), radar local, bản đồ Leaflet WGS-84, hệ thống cảnh báo tự động `alertDetector.ts`, MOCK/REAL; adapter/reducer, HTTP/WS, trang **Nhật ký phiên** (`EventLogPage` có lọc + xuất CSV), panel video IF-05 | SOURCE-VERIFIED; 173+ tests/27 file và build exit 0 | Browser E2E đúng candidate, offline cold-cache, soak và máy demo sạch |
| Backend GCS | FastAPI loopback; schema/state; MOCK, client queues; API sessions; module Ingress `esp32_ingress.py` nhận WebSocket IF-03 và giải mã RF 32-byte; relay MJPEG IF-05 | SOURCE-VERIFIED; SIMULATED theo tests/log; **84 PASS** backend (gồm 17 test hợp đồng IF-05 và các test relay/alerts) | Thử nghiệm với ESP32 phát sóng LoRa thật ngoài thực địa và kiểm tra reconnect đường dài |
| SQLite/logger | Logger, WAL/FULL, commit boundary, session list/summary; tests recovery | SOURCE-VERIFIED; SIMULATED trong log | Phiên dài, tải/concurrent controls; mất điện thật chưa được thử |
| Nhật ký phiên | `EventLogPage` đọc phiên đã commit, lọc actor/mức/source, ẩn mục, xuất CSV | SOURCE-VERIFIED | Kiểm phiên dài và tải lớn; chốt số phận code `replay_engine.py` (xoá hay tái dùng) |
| Video phụ IF-05 | Backend relay MJPEG same-origin; firmware S3-CAM `firmware/esp32_s3_cam/` build exit 0; công cụ đo `scripts/manual/measure_mjpeg_stream.py` | SOURCE-VERIFIED + SIMULATED (camera TCP giả 29,75/30 khung/s) + **BUILT** | Nạp bo S3, đo FPS/độ trễ thật, kiểm `1 + số_người_xem` kết nối; **chưa `HARDWARE-VERIFIED`** |
| AI tham chiếu PC | Adapter person/lifebuoy, caller video/webcam, dataset, checkpoints và reports | SOURCE-VERIFIED; adapter test bằng dữ liệu giả | Provenance/license, QA có evidence, locked-test, calibration và metrics tái lập trên candidate |
| AI evidence tooling | Generator mặc định dry-run/hash thật, validator chỉ đọc và fixture tests | SOURCE-VERIFIED; SIMULATED trong báo cáo DATAFIX | Manifest cũ chưa được chữa bằng dữ liệu thật; validator ghi 335 issues ở lần chạy đã lưu |
| FPGA KVC | **~200 tệp RTL** trong `KVC_PR/` (commit baseline `3ab8da2`). **P1 (31/10/2026):** sửa 4 lỗi P0 UART, TB PASS 136/136 assertion. **P2:** CDC FIFO 2-FF sync, timestamp ms, camera OV2640. **P3:** engine sửa E-01, E-02, E-08, E-09. **P1-fix:** `uart_tx` 10 bit-time, suite 17/17 PASS, Fmax 129,15 MHz. **Đã nạp bo Primer 20K:** FPGA→PC 1.102/1.102 frame PASS. **Blob detect (`kvc_blob_detect.v`):** BBox tính từ pixel thật cho phao cứu sinh (`BBOX_SOURCE=1`, 0 BSRAM, 0 DSP). **01–03/11/2026: ĐÃ NẠP VÀ CHẠY TRÊN BO THẬT (HARDWARE-VERIFIED)** — release `86CCF5DD` đạt 9/58 khung $N=1$, `v1`/`crc=0` 100%, $\Delta fe=0$ trên 2.162 B, ratio 1,0053 (`KVC-G6.1-20261103-002_release.md`). **04/11/2026:** Hoàn thành tổng hợp bộ lọc blob rev 2 tỷ lệ (`9E62B590`, Fmax 116,63 MHz, 18/18 TB PASS) và pixel stats rev 3 (`05288FA6`, 21/21 TB PASS, Fmax 113,76 MHz). Toàn suite **25/25 TB PASS**. Bitstream **chưa chứa YOLO11n**. | `BUILT` + `SIMULATED`; **`HARDWARE-VERIFIED` cho FPGA→PC và FPGA→MCU đường blob** | A1–A10 nghiệm thu blob; đo soak nhiệt; E-04/E-07 hoàn thiện conv engine; P6 trả CNN vào top (`BBOX_SOURCE=2`) |
| MCU KVC | Mã nguồn Firmware Sonix: driver GNSS NEO-M10N (`kvc_gnss_neo_m10.c`), ngắt UART Ring buffer SPSC (Task M2), Watchdog 6s (Task F10), time base dùng chung (`kvc_timebase.c`), chu kỳ phát theo mốc tuyệt đối, header chân chuẩn (`kvc_pinout.h`) và template Keil MDK. **Phạm vi cảm biến đã chốt 26/10/2026: chỉ MPU-6050, AJ-SR04M, NEO-M10N, SX1278. HMC5883L hoãn (chưa có Yaw), BMP180 loại bỏ.** **28/10/2026 (`KVC-MCU-BENCH-20261028-001`): thêm banner + `[INIT]` log, macro `KVC_FPGA_ENABLE`, counter `tx=ok/fail`, `KVC_GNSS_SKIP_AUTOBAUD`, getter baud GNSS; sửa comment sai (WDT feed, baud UART5/UART1, tốc độ SPI, ring size) và vá 2 lỗi logic (outlier siêu âm, retry IMU)** **P5 (31/10/2026): nâng trần siêu âm 500→700 cm, `MAX_FRAME_MM` 6000→8000 (phát hiện: trần cũ chặn ngầm mọi giá trị >6000 thành `BAD_CHECKSUM`), `TIMEOUT_MS` 250→350, thêm `alt_quality` GOOD/FAIR/POOR với georef từ chối khi POOR.** | SOURCE-VERIFIED code; **Keil ARMCLANG V6.14 full rebuild 28/10/2026: 0 Error / 8 Warning (toàn bộ warning là code có sẵn: 2 vendor SDK + 5 `kvc_fpga_bbox.c` + 1 padding)**; host C tests 9/9 PASS | Nạp flash Keil MDK trên kit Sonix thật, đo kiểm xung ngoại vi và thử nghiệm tích hợp RF trên bo. **Kit MCU đã có (bring-up 26/10/2026 theo [KVC_PHAN_CONG_2_NGUOI.md](../planning/KVC_PHAN_CONG_2_NGUOI.md) §0), nhưng bản 28/10 chưa nạp lại nên vẫn SOURCE-VERIFIED + BUILT, chưa HARDWARE-VERIFIED.** Không có FPGA và không có ESP32-C3 tại 28/10: đường BBox và chuỗi RF end-to-end chưa nghiệm thu. **Yaw đã có từ GNSS** (`kvc_gnss_get_course_deg10()` gọi tại `main.c:872,2115`; xoay vector bằng `kvc_geo_rotate_to_ne()` trong `kvc_geo_math.c`), nhưng chỉ khi UAV bay ngang ≥ 0,5 knot và course còn mới ≤ 3 s — đứng yên hoặc bay thẳng đứng thì không có Yaw và georef quay về giả định camera hướng Bắc. **Mặc định `KVC_FPGA_ENABLE` đã đổi 0 → 1 từ 31/10/2026** (`main.c:371`) sau khi G2.4 PASS; `=0` chỉ còn là chế độ bench tùy chọn, khi đó `AI_DETECTED` luôn 0 và georef không chạy |
| Chuỗi REAL | Kiến trúc, application JSON, RF 32-byte (IF-02, ABI đã duyệt 29/10/2026), baseline ESP32 Wi-Fi/WebSocket (IF-03); bản đồ chân Master (`KVC_MASTER_PINOUT_WIRING.md`) và mã nguồn Gateway ESP32 (`main.cpp` + `rf_decode`, `net_policy`, `ws_route`) | SOURCE-VERIFIED code / APPROVED ABI; host C++ tests PASS (`test_rf_decode`, `test_net_policy`, `test_ws_route`); PlatformIO build 0 error | Thử nghiệm tích hợp toàn chuỗi trên phần cứng thật: FPGA ➔ MCU ➔ LoRa ➔ ESP32 ➔ WebSocket ➔ GCS. Thứ tự ưu tiên mạng (STA 2.4 GHz → SoftAP) và khai báo nhiều SSID chỉ được kiểm bằng host test, chưa test trên ESP32 thật |
| Quản lý dự án | AGENTS, adapter Antigravity, review workflow, Git baseline | SOURCE-VERIFIED tài liệu và metadata Git | Kiểm worktree/staging bằng Git; nghiệm thu task, sao lưu evidence/data; không coi test PASS là approval |

Phạm vi inventory chỉ xác nhận source KVC dạng rời được thấy trong workspace. Source mẫu bên trong SDK không phải implementation payload đã tích hợp; không kết luận công việc trên máy/bo ngoài workspace chưa tồn tại.

## G0–G5: các mốc của kế hoạch trước và tình trạng bằng chứng

| Gate lịch sử | Ngày trong kế hoạch cũ 2026 | Tình trạng đánh giá | Bằng chứng còn cần |
| --- | --- | --- | --- |
| G0 | 12/10 | CHƯA XÁC NHẬN ĐẠT | Inventory/toolchain/license/candidate và baseline AI đầy đủ, biên bản chấp thuận |
| G1 | 14/10 | BLOCKED cho tổng thể | Chốt camera/board/điện/pinout và khả năng AI; chưa có bằng chứng tensor/ảnh chạy FPGA; UI source không tự chứng minh offline. (ABI RF 32 byte đã duyệt riêng ngày 29/10/2026, không còn là hạng mục chờ của G1) |
| G2 | 18/10 | CHƯA NGHIỆM THU; phần MOCK ứng dụng đã có | Chuỗi theo gate hệ thống chạy 30 phút, nhật ký phiên/fault và dữ liệu QA; smoke 6 giây không thay bài 30 phút |
| G3 | 22/10 | CHƯA CÓ BẰNG CHỨNG REAL | Dongle, serial parser, dữ liệu đo RSSI/SNR, validity/session/clock và hiển thị/log từ hardware |
| G4 | 25/10 | CHƯA CÓ BẰNG CHỨNG ĐẠT | 10.000 frame, soak 2 giờ, phục hồi, resource/timing/đo chỉ tiêu và feature freeze |
| G5 | 01/11 | CHƯA CÓ BẰNG CHỨNG ĐẠT | Laptop sạch offline, 5 lượt demo, tài liệu vận hành, bộ bàn giao và backup evidence |

Bản thiết kế hiện tại không còn lịch 21 ngày; bảng G0–G5 giữ để tra kế hoạch cũ, không phải lịch mới được xác nhận. Tiêu chí nghiệm thu hiện hành ở mục VII thiết kế; thứ tự công việc theo checklist 5 người (không có trong bản sản phẩm). Gate con GCS trong [kế hoạch GCS](KVC_GCS_PLAN.md) cũng cần đối chiếu phạm vi hiện hành. Các task PROPOSED trong kế hoạch là mẫu phân rã; không dùng trạng thái ban đầu đó thay kết quả source/test mới, và không tự ghi DONE khi thiếu acceptance.

## Những điểm chặn cần quyết định

1. **Board/camera:** nhóm xác nhận đang có OneKiwi Primer 20K V1.1; không cần mua thêm bo. **Camera đã chốt 31/10/2026 (B-4): OV2640 DVP 8-bit**, 14 `IO_LOC` tại `KVC_PR/src/KVC_FPGA.cst:58-98` khớp Header J1 pin 5–20. OV9782 (global shutter) **đã loại khỏi phạm vi**. Board không có socket DVP chuyên dụng được tài liệu hóa; dùng breakout 2.54 mm cắm Header J1. Chưa hardware-verified — cần đo ảnh thật ở P7.
2. **Bộ nhớ/điện và nối FPGA–SONiX:** GW2A có 828 Kbit BSRAM, không đủ chứa full VGA RGB565 frame (614.400 byte). Trang OneKiwi ghi board có DDR3 512 MB, nhưng hardware notes/schematic cục bộ hiện ghi không thấy chip DDR3; đây là mâu thuẫn cần đối chiếu marking/BOM và revision bo thực trước khi chốt frame-buffer/controller. UART, DATA_READY/IRQ, reset, VCCIO/I/O standard và mapping hai board cũng chưa được phê duyệt. SPI Flash khác nhau giữa User Guide (64 Mbit) và schematic W25Q128JVSIQ (128 Mbit); xác minh revision/marking. Các chi tiết này là câu hỏi tích hợp, chưa phải phép đo.
3. **Wire ABI:** **ABI RF 32 byte (IF-02) đã được HUMAN duyệt ngày 29/10/2026** cho cả hai owner MCU (Phong) và Gateway (Thịnh); đây là contract hiện hành, không còn là draft. USB48 thuộc kiến trúc cũ; parser telemetry20 không có trong đường ingress hiện tại và layout của nó không thể khôi phục. UART FPGA có đặc tả riêng, không phải gói telemetry20. Duyệt ABI **không** đồng nghĩa HARDWARE-VERIFIED: vẫn phải capture frame thật MCU ↔ ESP32 và kiểm endian/CRC/framing/wrap/session/timeout/status trên bo trước khi nghiệm thu tích hợp. Giữ nguyên baud/layout/CRC/IRQ/pinout khi chưa được giao thay đổi.
4. **AI release:** guardrails đã sửa cách tạo/kiểm evidence, nhưng không làm dữ liệu release-ready. Cần nguồn/license/consent, session có hash, QA độc lập, test khóa theo phiên và calibration hợp lệ. Không công bố INT8/FPS/GoAI support từ metrics PC hoặc tên file weights.

Nguồn: ABI report (không có trong bản sản phẩm), hardware report (không có trong bản sản phẩm), AI fix report (không có trong bản sản phẩm). Các report là snapshot lịch sử trong review bị Git ignore; vị trí/line của report có thể khác source mới.

## Kiểm thử: lịch sử và lượt đánh giá này

| Lệnh / bằng chứng đã lưu | Exit đã ghi | Kết quả lịch sử và giới hạn |
| --- | --- | --- |
| .venv/Scripts/python.exe -B -m pytest gcs/backend/tests tests -q -p no:cacheprovider | 0 | Audit/cleanup: 39 tests + 8 subtests; trước các tests AI tooling mới, không coi là tổng test hiện tại |
| .venv/Scripts/python.exe -B -m Dashboard.backend.tests.test_api_websocket | 0 | Audit: host TCP smoke 6 giây; không phần cứng, không soak |
| npm test (gcs/frontend) | 0 | Audit/cleanup: 14 files, 76 tests (01/11/2026 cập nhật **173 tests / 27 file**) |
| npm run typecheck; npm run build | 0 | Frontend audit/cleanup; build UI không phải synthesis FPGA |
| npm run lint | 0 | Audit: 8 warnings; không gọi là zero-warning |
| python scripts/data/validate_ai_evidence.py | 1 | DATAFIX: AI_EVIDENCE_BLOCKED, 335 issues; thiếu evidence thật, không phải dataset PASS |

Log gốc: [audit TEST_RESULTS](../review/KVC-MAINT-20261014-001/TEST_RESULTS.json), cleanup report (không có trong bản sản phẩm), [DATAFIX commands](../review/KVC-AI-DATAFIX-20261014-001/commands.log).

**Lượt tổng hợp KVC-STATUS-DOC-20261014-001:** dry-run review, git diff --check, git diff --cached --check và git status đã thử gọi nhưng process creation bị chặn (EPERM/Access denied); **NOT RUN, exit N/A**. Không gọi AI CLI review. Không chạy lại pytest/npm/validator, browser, compiler, synthesis, camera, model hoặc hardware. Chỉ kiểm tài liệu, existence, links, hashes bằng Node; kết quả chi tiết ở TEST_RESULTS (không có trong bản sản phẩm). Không dùng kiểm text thay Git/compiler/testbench.

Lượt đồng bộ Markdown KVC-DOC-CONSISTENCY-20261014-001 đã sửa sai điện áp VDD trong ghi chú Sonix và các khẳng định phần cứng/phần mềm chưa có bằng chứng. Đây là sửa nội dung tài liệu, không phải xác nhận đã xử lý phần cứng hay thay source. Kết quả kiểm links/nội dung và giới hạn Git ghi trong report riêng ở đầu file.

## Baseline và thứ tự tiếp tục

Đọc trực tiếp .git/HEAD và refs/heads/main cho thấy nhánh main có HEAD **0666e4e389571a62bbb7185b6b9b116d53bed7e8**. Reflog ghi baseline trước đó **4464266c5f38d1cd0ace55c200953dba9db26879**. Vì Git không chạy được, chưa xác minh clean/dirty, staging hoặc nội dung commit; không ghi toàn bộ source vẫn untracked. Không suy tác giả module từ commit baseline.

- **Trước tích hợp:** A/C chốt board/camera/pinout/toolchain; B/E cung cấp AI evidence; ABI RF 32 byte (IF-02) đã duyệt ngày 29/10/2026 cùng golden vector GV-02, còn lại là capture frame thật trên bo. Mỗi công việc cần task có một owner, files literal, acceptance và tests.
- **GCS:** tiếp tục frontend/backend có sẵn; hoàn thiện ingress sau ABI, kiểm
  chunking/resync/CRC/timeout/disconnect; sau đó browser BACKEND/nhật ký phiên và phiên 30 phút.
- **FPGA/MCU:** tạo hoặc bàn giao project KVC đúng board; build/testbench trước, đo bring-up và hardware loopback sau. Quyết định GoAI/fallback dựa compiler/resource/timing và mẫu chạy thật.
- **Nghiệm thu:** đo chain REAL, tọa độ và validity; stress/soak/offline; tổng duyệt và bàn giao. Giữ nhãn MOCK/PC_REFERENCE cho mọi phần chưa đo trên bo.

Không phát hành finding P0/P1/P2 code mới trong lượt tổng quan KVC-STATUS-DOC-20261014-001: dry-run và runtime chưa chạy, chưa review đầy đủ module nhỏ. Các blocker là việc chưa được xác minh hoặc chưa triển khai. Không có finding mới không có nghĩa hệ thống đã an toàn.
