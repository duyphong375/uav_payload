# KVC — Kế hoạch GCS (DEPRECATED)

**Trạng thái:** `DEPRECATED / STUB` — cập nhật 25/10/2026.

Tài liệu này từng là kế hoạch phân rã task GCS theo phương án **STM32 / CP2102 / USB
Ground Envelope 48 byte**. Kiến trúc đó đã bị thay thế bởi gateway **ESP32-C3 có nguồn
riêng → Wi-Fi SoftAP/WebSocket v1 → backend GCS trên laptop → Dashboard web**.

Toàn văn bản cũ được giữ nguyên (không sửa nội dung lịch sử) tại:

👉 **docs/archive/KVC_GCS_PLAN_STM32_USB.md (không có trong bản sản phẩm)**

## Không dùng tài liệu này để lập task mới

Các mã task, sơ đồ USB/serial, acceptance và gate G0–G5 trong bản lưu trữ là **lịch sử**.
Khi cần lập task GCS mới, dùng các nguồn hiện hành:

| Nhu cầu | Tài liệu |
| --- | --- |
| Kiến trúc, BOM, tiêu chí nghiệm thu | [Thiết kế hệ thống](KVC_ThietKeHeThong.md) |
| Thứ tự công việc hiện hành | Checklist 5 người (không có trong bản sản phẩm) |
| Route REST/WebSocket của GCS | [IF-04](../interfaces/IF_GCS_DATA_CONTRACT.md) |
| Semantics dữ liệu, schema, replay invariant | [Data contract](../interfaces/KVC_GCS_DATA_CONTRACT.md) |
| UI/UX mục tiêu | [Thiết kế GCS](KVC_GCS_DESIGN_SPEC.md) |
| Trạng thái thực tế của dự án | [Tiến độ dự án](KVC_PROJECT_STATUS.md) |

Quy ước lưu trữ tài liệu lịch sử: docs/archive/README.md (không có trong bản sản phẩm).
