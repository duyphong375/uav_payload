# KVC Product — Chỉ mục tài liệu

Task tạo bản: `KVC-PRODUCT-MIGRATE-20261026-001` · Ngày: 2026-10-26 · Owner: Kilo

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

## Phần cứng

| ID | Tài liệu | Đường dẫn | Trạng thái | Bằng chứng | Owner | Kiểm tra gần nhất | Code liên quan |
|---|---|---|---|---|---|---|---|
| HW-MCU-001 | SONiX SN34F788 | `hardware/mcu/CHIP_SONIX_SN34F788_MCU.md` | ACTIVE | SOURCE-VERIFIED | Phong | 2026-10-25 | `firmware/mcu_payload/project_keil/` |
| HW-FPGA-001 | OneKiwi Primer 20K (GW2A) | `hardware/fpga/CHIP_ONEKIWI_20K_GOWIN_GW2A.md` | ACTIVE | SOURCE-VERIFIED | Vững | 2026-10-25 | `fpga/constraints/pins.cst` |
| WIR-001 | Pinout và đấu dây tổng | `hardware/wiring/KVC_MASTER_PINOUT_WIRING.md` | ACTIVE | DESIGN | Phong | 2026-10-25 | `firmware/mcu_payload/inc/kvc_pinout.h` |
| VEN-001 | Gói hãng (version/nguồn/checksum) | `hardware/vendor/VENDOR_PACKAGES.md` | ACTIVE | SOURCE-VERIFIED | Phong | 2026-10-25 | `firmware/mcu_payload/inc/SONiX.SN34F7_DFP.2.0.4/` |

## Giao diện

ID giao diện là **bất biến**. Đổi tên file phải giữ ID trong tiêu đề.

| ID | Tài liệu | Đường dẫn | Trạng thái | Bằng chứng | Owner | Kiểm tra gần nhất | Code liên quan |
|---|---|---|---|---|---|---|---|
| IF-00 | MCU ↔ cảm biến | `interfaces/IF_MCU_SENSORS.md` | ACTIVE | DESIGN | Phong | 2026-10-25 | `inc/kvc_imu_gy87.h`, `inc/kvc_usound_ajsr04m.h`, `inc/kvc_gnss_neo_m10.h` |
| IF-01 | FPGA ↔ MCU UART | `interfaces/IF_FPGA_MCU_UART.md` | ACTIVE | DESIGN | Vững | 2026-10-25 | `src/sensors/kvc_fpga_bbox.c` |
| IF-02 | MCU ↔ LoRa RF 32 byte | `interfaces/IF_MCU_LORA_RF.md` | ACTIVE | DESIGN | Thịnh | 2026-10-25 | `inc/kvc_telemetry.h`, `firmware/gateway_esp32/src/main.cpp` |
| IF-03 | ESP32 ↔ GCS WebSocket | `interfaces/IF_ESP32_GCS_WS.md` | ACTIVE | DESIGN | Thịnh | 2026-10-25 | `gcs/backend/esp32_ingress.py` |
| IF-04 | GCS REST/WebSocket route | `interfaces/IF_GCS_DATA_CONTRACT.md` | ACTIVE | SOURCE-VERIFIED | Phong | 2026-10-25 | `gcs/backend/main.py` |
| IF-04-SEM | GCS semantics dữ liệu | `interfaces/KVC_GCS_DATA_CONTRACT.md` | ACTIVE | DESIGN | Phong | 2026-10-25 | `gcs/backend/schemas.py`, `gcs/backend/state.py` |
| IF-CAM | Camera ↔ FPGA | `interfaces/IF_CAMERA_FPGA.md` | DRAFT | DESIGN | Kiên | 2026-10-19 | — (chưa có RTL) |
| IF-MATRIX | Ma trận giao diện | `interfaces/README.md` | ACTIVE | SOURCE-VERIFIED | — | 2026-10-25 | tất cả `IF-*` |

Ghi chú IF-04: `IF_GCS_DATA_CONTRACT.md` là đặc tả **route/endpoint**; 
`KVC_GCS_DATA_CONTRACT.md` là **semantics dữ liệu** (mục 2/5/6/7). Hai tài liệu
khác vai trò, không gộp. Cả hai đều thuộc họ IF-04.

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

## Planned — chưa triển khai

Các mục dưới **chưa có source hoặc tài liệu**. Không tạo file giả để lấp chỗ.

| ID | Nội dung | Trạng thái | Ghi chú |
|---|---|---|---|
| ALG-MCU-001 | Hợp nhất cảm biến (IMU + GNSS + siêu âm) | Planned | Chờ `firmware/mcu_payload/src/algorithms/` |
| ALG-MCU-002 | Hiệu chuẩn và bù sai số cảm biến | Planned | Chờ source thuật toán |
| ALG-MCU-003 | Ước lượng vị trí / dead-reckoning | Planned | Chờ source thuật toán |
| RTL-001 | RTL FPGA (BBox/UART/camera pipeline) | Planned | Chưa có `*.v`/`*.sv`; chỉ có `constraints/pins.cst` |
| RTL-002 | Testbench FPGA | Planned | Chưa có `fpga/tb/` |
| GCS-REPLAY-002 | Đồng bộ replay đa client | Planned | Chưa có task |
| CAM-001 | Chốt camera chính (OV2640 vs OV9782) | Planned | IF-CAM còn DRAFT, chưa chốt pinout/rail |

## Quy tắc duy trì

1. Một tài liệu = một ID = một đường dẫn. Không tạo file `.md` mới mà không thêm dòng.
2. Không có dòng trong INDEX = tài liệu không tồn tại. ID có trong INDEX mà file mất = lỗi.
3. Chỉ một tài liệu `ACTIVE` cho mỗi chủ đề. Khi bị thay: đổi `SUPERSEDED` và ghi ID thay thế.
4. Sửa code chạm contract trong `interfaces/` phải cập nhật tài liệu **trong cùng commit**.
5. Không xoá tài liệu: chuyển `ARCHIVED`, giữ nguyên nội dung.
6. Không ghi `Planned` thành đã triển khai. Mục Planned ở trên chỉ là danh sách chờ.
7. `SOURCE-VERIFIED` không phải `HARDWARE-VERIFIED`. Chỉ nâng mức khi có log/hash/board.
8. Không chép review report hoặc log review vào `docs/`; chúng nằm ngoài repo sản phẩm.
