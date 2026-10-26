# KVC Product — payload và GCS tìm kiếm cứu nạn UAV

Bản sản phẩm tách từ `D:\Project_UAV_KVC` (task `KVC-PRODUCT-MIGRATE-20261026-001`).

> **Phạm vi:** KVC là payload giám sát và hệ thống GCS, **không phải flight controller**.
> Không điều khiển bay, arm/disarm hay lập waypoint.

## Trạng thái bằng chứng

| Nhãn | Nghĩa |
|---|---|
| DESIGN | đề xuất, chưa chạy |
| SOURCE-VERIFIED | đã đọc source, có bằng chứng file/dòng |
| SIMULATED | đã chạy trên mock/sim |
| BUILT/SYNTHESIZED | đã build/tổng hợp |
| HARDWARE-VERIFIED | đã chạy trên phần cứng thật |

Bản copy này **không** chứng minh bất kỳ mức BUILT hay HARDWARE-VERIFIED nào. Xem
`docs/verification/GATEWAY_TEST_PLAN.md` cho kế hoạch kiểm thử.

## Cây thư mục

```text
KVC_PRODUCT/
├── README.md                      trang này
├── pytest.ini                     testpaths = gcs/backend/tests tests
├── scripts/
│   ├── kvc-review.ps1             review Codex (PowerShell 7+)
│   ├── test_firmware.ps1          test firmware + build gateway + pytest
│   └── manual/                    script tích hợp/debug
├── firmware/
│   ├── mcu_payload/               MCU tải UAV — Sonix SN34F788 (Keil)
│   │   ├── inc/                   header công khai + DFP hãng
│   │   ├── src/                   kvc_timebase.c + sensors/
│   │   ├── project_keil/          project Keil + RTE
│   │   └── tests/                 host test (gcc)
│   └── gateway_esp32/             gateway trạm đất ESP32-C3 (PlatformIO)
│       ├── src/                   main.cpp + rf_decode + net_policy
│       └── host_tests/            host test (g++) cho rf_decode, net_policy
├── fpga/
│   ├── README.md                  hướng dẫn Gowin EDA
│   └── constraints/pins.cst       ràng buộc chân
├── gcs/
│   ├── backend/                   FastAPI + WebSocket + SQLite + replay
│   └── frontend/                  React 19 + TypeScript + Vite
├── ai/
│   ├── inference/                 adapter suy luận + ontology
│   └── model_manifest/            mẫu manifest phát hành model
├── tests/                         test tích hợp xuyên phân hệ
└── docs/                          xem docs/INDEX.md
```

`firmware/mcu_payload/src/{algorithms,transport,app}/`, `fpga/rtl/`, `fpga/tb/` và
`docs/algorithms/` **chưa tồn tại** vì chưa có source thật. Không tạo thư mục rỗng.

## Chạy nhanh

Backend (port 8000):

```powershell
.venv\Scripts\python.exe -m pip install -r gcs/backend/requirements.txt
.venv\Scripts\python.exe -m uvicorn gcs.backend.main:app --port 8000
```

Dashboard:

```powershell
cd gcs\frontend
npm ci
npm run dev
```

Test:

```powershell
# Toàn bộ (Python + host test firmware + build gateway)
pwsh -File scripts/test_firmware.ps1

# Chỉ host test firmware (không cần board, không build)
pwsh -File scripts/test_firmware.ps1 -SkipBuild -SkipPython

# Chỉ Python
.venv\Scripts\python.exe -m pytest -q
```

Host test firmware chạy bằng lệnh riêng khi cần debug một test:

```powershell
gcc -Wall -Wextra -O2 -std=c99 -DKVC_HOST_TEST=1 -Ifirmware/mcu_payload/inc `
  firmware/mcu_payload/tests/test_kvc_gnss_neo_m10.c `
  firmware/mcu_payload/src/sensors/kvc_gnss_neo_m10.c -o test_gnss.exe

g++ -std=c++17 -Wall -Wextra -O2 -Ifirmware/gateway_esp32/src `
  firmware/gateway_esp32/host_tests/test_rf_decode.cpp `
  firmware/gateway_esp32/src/rf_decode.cpp -o test_rf_decode.exe
```

Lưu ý: thư mục host test của gateway đặt tên `host_tests/`, không phải `test/`,
vì `test/` là đường PlatformIO tự dò cho `pio test` (sẽ chèn Unity `main()` và
xung đột với test host).

Lưu ý: mỗi test driver phải link kèm đúng **một** file nguồn tương ứng
(`kvc_fpga_bbox.c`, `kvc_gnss_neo_m10.c`, `kvc_timebase.c`). Không dùng
`src/sensors/*.c` vì trên Windows gcc không tự expand glob.

## Ràng buộc bất biến

Không đổi baud, packet layout, CRC, IRQ, pinout hay giao thức phần cứng ngoài các
hợp đồng trong `docs/interfaces/`. Packet LoRa hiện hành là 32 byte
(`KvcTelemetryPacket32`, IF-02). Telemetry 20 byte là kiến trúc lịch sử.

## Bản quyền và nguồn

Bản gốc và lịch sử Git đầy đủ nằm tại `D:\Project_UAV_KVC` và
`github.com/duyphong375/Project_UAV`. Bản này được tạo bằng copy allowlist, không
mang theo lịch sử Git.

Xem [docs/INDEX.md](docs/INDEX.md) để tra cứu tài liệu.
