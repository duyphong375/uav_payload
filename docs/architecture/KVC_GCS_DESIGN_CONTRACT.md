# KVC GCS — Design Contract (field-ops)

| Trường | Giá trị |
|---|---|
| Mã | `KVC-GCS-DESIGN-CONTRACT-001` |
| Trạng thái | `ACTIVE` |
| Ngày chốt | 2026-10-29 |
| Thuộc kế hoạch | `KVC_GCS_IMPLEMENTATION_PLAN_20261029.md` Phase 2 |
| Áp dụng cho | `gcs/frontend/src/app/**`, `src/features/**` |
| Mức bằng chứng | DESIGN (ràng buộc để code Phase 3–4), chưa phải kết quả đo giao diện |

---

## 1. Vì sao có tài liệu này

`KVC_GCS_DESIGN_SPEC.md` mô tả một phong cách lai: "siêu phẳng" nhưng lại khuyến khích glassmorphism, `rounded-2xl`, glow và nhiều lớp nổi. Kết quả trong code là 41 chỗ palette trực tiếp trong riêng `MissionPage.tsx`, 6 emoji trong label, 5 lớp `backdrop-blur` chồng nhau và `z-[410]`/`z-[420]` tuỳ tiện.

Cảm giác "giao diện do AI tạo" không đến từ thư viện hay framework. Nó đến từ **bốn thói quen**:

1. Màu palette viết trực tiếp thay vì token ngữ nghĩa.
2. Emoji làm icon trong nhãn kỹ thuật.
3. Bo góc và đổ bóng không có luật.
4. Nhiều lớp "kính nổi" xếp chồng để tạo chiều sâu giả.

Contract này chặn bốn thói quen đó bằng **luật đo được**, không bằng cảm nhận.

---

## 2. Nguyên tắc

| # | Nguyên tắc | Hệ quả thực thi |
|---|---|---|
| P1 | Dữ liệu trước, trang trí sau | Không thêm KPI, gauge hay biểu đồ nếu không có nguồn dữ liệu thật |
| P2 | Token trước, palette sau | Feature component **không** được viết `slate-`, `cyan-`, `rose-`, `emerald-`, `amber-`, `red-` |
| P3 | Một accent duy nhất | Accent = `primary`. Trạng thái = `ok` / `warn` / `crit` / `muted`. Không có accent thứ hai |
| P4 | Phẳng là mặc định | Panel phẳng + viền 1px. Chỉ header được phép 1 lớp kính |
| P5 | Số phải đọc được | Mọi số dùng `tabular-nums`; đơn vị tách khỏi số bằng khoảng trắng mảnh |
| P6 | Thiếu thì N/A | Không nội suy, không làm tròn che giấu, không hiển thị 0 thay cho null |
| P7 | Bố cục là hợp đồng | Sidebar 220 px, header 56 px, mission full-bleed, dock dưới trái, controls dưới phải |
| P8 | Chuyển động chỉ để giải thích | Không `animate-pulse` cho dữ liệu tĩnh; không animation khi mount hàng loạt |

---

## 3. Token ngữ nghĩa

Định nghĩa trong `src/styles/tokens.css`, ánh xạ sang Tailwind trong `index.css`.

### 3.1. Bề mặt

| Token | Dùng cho | Không dùng cho |
|---|---|---|
| `--kvc-bg` | Nền ứng dụng | Card |
| `--kvc-surface` | Panel, card, sidebar | Nền trang |
| `--kvc-surface-2` | Vùng lồng trong panel (header bảng, dải phụ) | Card cấp 1 |
| `--kvc-overlay` | Lớp phủ trên bản đồ (chỉ 1 lớp) | Mọi panel cùng lúc |
| `--kvc-line` | Viền 1px mặc định | Đường phân cách mạnh |
| `--kvc-line-strong` | Viền nhấn (focus, active) | Viền thường |

### 3.2. Chữ

| Token | Dùng cho | Tương phản tối thiểu |
|---|---|---|
| `--kvc-text` | Nội dung chính | 7:1 |
| `--kvc-text-muted` | Nhãn phụ, đơn vị, metadata | 4.5:1 |
| `--kvc-text-faint` | Chỉ chữ trang trí không mang thông tin | 3:1 (không dùng cho dữ liệu) |

### 3.3. Trạng thái

| Token | Nghĩa | Ví dụ |
|---|---|---|
| `--kvc-accent` | Hành động, liên kết, UAV | Nút chính, marker camera |
| `--kvc-ok` | Kết nối tốt, GNSS fix, mục tiêu hợp lệ | Badge REAL, dot xanh |
| `--kvc-warn` | Trễ, dữ liệu cũ, phao cứu sinh | Badge stale, marker lifebuoy |
| `--kvc-crit` | Mất kết nối, mục tiêu người, lỗi | Badge CRITICAL, marker person |
| `--kvc-mock` | Nguồn MOCK | Dải ngữ cảnh MOCK |

Mỗi token có biến thể `-bg` (nền 10–15 % alpha) và `-line` (viền 40 % alpha). Không tự pha màu tại chỗ.

### 3.4. Chữ và khoảng cách

| Token | Giá trị |
|---|---|
| `--kvc-font-ui` | Geist Variable, fallback system |
| `--kvc-font-mono` | Geist Mono, fallback monospace |
| `--kvc-text-2xs` | 10 px |
| `--kvc-text-xs` | 11 px |
| `--kvc-text-sm` | 12.5 px |
| `--kvc-text-base` | 15 px |
| `--kvc-text-lg` | 17 px |
| `--kvc-radius-control` | 6 px |
| `--kvc-radius-panel` | 10 px |
| `--kvc-space-1..6` | 4, 8, 12, 16, 24, 32 px |

### 3.5. Z-index

| Token | Giá trị | Dùng cho |
|---|---|---|
| `--kvc-z-map` | 0 | Bản đồ |
| `--kvc-z-map-overlay` | 10 | Nhãn chế độ xem, chip trạng thái |
| `--kvc-z-dock` | 20 | Dock dưới, controls dưới |
| `--kvc-z-panel` | 30 | Panel chi tiết |
| `--kvc-z-banner` | 40 | Banner cảnh báo |
| `--kvc-z-modal` | 50 | Modal, sheet |

Không dùng giá trị ngoài thang này.

---

## 4. Deny-list (đo được)

Kiểm bằng lệnh ở §6. Mỗi vi phạm là lỗi, không phải "phong cách".

| # | Cấm | Phạm vi |
|---|---|---|
| DL-1 | Emoji trong `label`, `aria-label`, `title`, toast, `<span>` hiển thị | `src/app/**`, `src/features/**` |
| DL-2 | Palette trực tiếp: `slate-`, `cyan-`, `rose-`, `emerald-`, `amber-`, `red-`, `purple-`, `indigo-`, `blue-` | `src/features/**` (trừ `src/components/ui/**`) |
| DL-3 | `rounded-2xl`, `rounded-3xl` ngoài modal/sheet | Toàn bộ feature |
| DL-4 | `shadow-xl`, `shadow-2xl` | Toàn bộ feature |
| DL-5 | Nhiều hơn một lớp `backdrop-blur` hiển thị đồng thời trên một màn hình | Toàn bộ feature |
| DL-6 | `animate-pulse` trên dữ liệu tĩnh (không phải skeleton đang tải) | Toàn bộ feature |
| DL-7 | `z-[<số>]` ngoài thang §3.5 | Toàn bộ feature |
| DL-8 | Fallback số cho dữ liệu thiếu (toạ độ, confidence, khoảng cách, thời gian, pin) | Toàn bộ feature |
| DL-9 | `heading_deg` mặc định 0 khi không có dữ liệu | Bản đồ, radar |

---

## 5. Ngoại lệ được phép

| Ngoại lệ | Lý do | Ghi chú |
|---|---|---|
| `src/components/ui/**` | Primitive shadcn dùng token riêng | Không sửa để tránh phá thư viện |
| Màu trong SVG marker (`Map2DView`, `LocalRadarPanel`) | Leaflet `divIcon` cần mã màu tuyệt đối | Phải khớp token `--kvc-accent` / `-crit` / `-warn`; ghi chú trong code |
| `will-change`, `transform` cho map pane | Hiệu năng Leaflet | Không tính là trang trí |
| Bảng in PDF/CSV | Không phải UI | — |

---

## 6. Cách kiểm

```powershell
# DL-1: emoji
Select-String -Path 'gcs\frontend\src\features\**\*.tsx','gcs\frontend\src\app\**\*.tsx' `
  -Pattern '[\u2600-\u27BF]|[\uD83C-\uDBFF]' -Encoding UTF8

# DL-2: palette trực tiếp
Select-String -Path 'gcs\frontend\src\features\**\*.tsx' `
  -Pattern '(bg|text|border|from|to|ring)-(slate|cyan|rose|emerald|amber|red|purple|indigo|blue)-' -Encoding UTF8

# DL-3..4: bo góc và bóng
Select-String -Path 'gcs\frontend\src\features\**\*.tsx' -Pattern 'rounded-(2xl|3xl)|shadow-(xl|2xl)' -Encoding UTF8

# DL-7: z-index tuỳ tiện
Select-String -Path 'gcs\frontend\src\features\**\*.tsx' -Pattern 'z-\[[0-9]+\]' -Encoding UTF8
```

Ngưỡng: **0 kết quả** cho mỗi lệnh, trừ khi có ghi chú ngoại lệ ngay trong file.

---

## 7. Lộ trình áp dụng

| Bước | Nội dung | Phase |
|---|---|---|
| 1 | Thêm `tokens.css`, ánh xạ vào `index.css` | 3 |
| 2 | Áp cho `AppShell`, `AppSidebar`, `AppHeader` | 3 |
| 3 | Áp cho `MissionPage`, `BottomTacticalDock`, `FloatingMapControls` | 3 |
| 4 | Áp cho `OverviewPage`, `TargetDetailsPanel`, `LocalRadarPanel` | 3 |
| 5 | Áp cho Alerts, History, Devices, Settings | 4 |
| 6 | Rà deny-list toàn bộ, ghi số vi phạm còn lại | 4 |

---

## 8. Giới hạn

1. Tài liệu này **không** phải kết quả đo giao diện; nó là ràng buộc để code.
2. Không có ảnh before/after trong bản này; ảnh thuộc Phase 7.
3. Không tuyên bố cải thiện khả năng đọc hay giảm mỏi mắt — chưa có nghiên cứu người dùng.
4. Không thay đổi bố cục, route hay hành vi. Chỉ thay cách biểu diễn.
