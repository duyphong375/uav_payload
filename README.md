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
├── AGENTS.md                      luật AI/owner/scope
├── pytest.ini                     testpaths = gcs/backend/tests tests
├── .agents/rules/kvc.md           adapter rule cho Antigravity
├── scripts/
│   ├── kvc-review.ps1             review Codex (PowerShell 7+)
│   └── manual/                    script tích hợp/debug
├── firmware/
│   ├── mcu_payload/               MCU tải UAV — Sonix SN34F788 (Keil)
│   │   ├── inc/                   header công khai + DFP hãng
│   │   ├── src/sensors/           driver cảm biến
│   │   ├── project_keil/          project Keil + RTE
│   │   └── tests/                 host test (gcc)
│   └── gateway_esp32/             gateway trạm đất ESP32-C3 (PlatformIO)
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
.venv\Scripts\python.exe -m pytest -q
```

MCU host test (không cần board):

```powershell
gcc -std=c99 -I firmware/mcu_payload/inc `
  firmware/mcu_payload/tests/test_kvc_fpga_bbox.c `
  firmware/mcu_payload/src/sensors/*.c -o test_bbox.exe
```

## Ràng buộc bất biến

Không đổi baud, packet layout, CRC, IRQ, pinout hay giao thức phần cứng ngoài các
hợp đồng trong `docs/interfaces/`. Packet LoRa hiện hành là 32 byte
(`KvcTelemetryPacket32`, IF-02). Telemetry 20 byte là kiến trúc lịch sử.

## Bản quyền và nguồn

Bản gốc và lịch sử Git đầy đủ nằm tại `D:\Project_UAV_KVC` và
`github.com/duyphong375/Project_UAV`. Bản này được tạo bằng copy allowlist, không
mang theo lịch sử Git.

Xem [docs/INDEX.md](docs/INDEX.md) để tra cứu tài liệu.
