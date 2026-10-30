# KVC — Kế hoạch P0 nâng cấp GCS Dashboard (29/10/2026)

| Trường | Giá trị |
|---|---|
| Mã task đề xuất | `KVC-GCS-P0-20261029-001` |
| Loại tài liệu | Kế hoạch triển khai ngắn hạn (PLANNED) |
| Phạm vi | `gcs/frontend` + 2 file tài liệu |
| Owner duy nhất | Kilo (CODER) — model `deepseek-ai/deepseek-v4.1-flash-1017` |
| Hạn chót | Hết ngày 29/10/2026 |
| Trạng thái | `PLANNED` — chưa thực thi |
| Bằng chứng | DESIGN (chưa có log thực thi) |
| Tài liệu liên quan | Kế hoạch dài hạn `KVC_GCS_Dashboard_Redesign_Plan.md` (hiện chỉ có bản local ở `review/Codex/`, sẽ chép vào thư mục này ở P0 bước 7), `KVC_GCS_DESIGN_SPEC.md`, `../interfaces/KVC_GCS_DATA_CONTRACT.md` |

---

## 1. Mục tiêu

Sửa các lỗi hiển thị sai bản chất dữ liệu và lỗi "UI nói dối" trên dashboard hiện có, kèm bộ bằng chứng đủ để nghiệm thu trong ngày. **Không** làm redesign thị giác, **không** thêm feature mới, **không** đụng backend/ABI/hạ tầng RF.

Kết thúc ngày phải trả lời được "đạt/không đạt" cho 4 câu:

1. UI còn chỗ nào hiển thị chỉ số pin/điện áp không? (phải là **không**)
2. Ngưỡng stale có đúng một nguồn cấu hình không? (phải là **có**)
3. Nút sao chép tọa độ có phân biệt WGS-84 và LOCAL cm không? (phải là **có**)
4. Ô nhập WebSocket URL có thực sự được áp dụng không? (phải là **có**)

## 2. Quyết định đã chốt với người dùng

| # | Quyết định | Hệ quả |
|---|---|---|
| D1 | Hotfix đúng đắn + evidence là sản phẩm cuối ngày | Không refactor Mission/Overview trong task này |
| D2 | Kilo là CODER duy nhất | Không handoff; không writer thứ hai |
| D3 | Giữ 4 file UI đang sửa dở và hoàn tất phần bỏ pin | Không revert `AppHeader`, `TopStatCards`, `UavHardwareGaugeCard`, `BottomTacticalDock` |
| D4 | Được sửa tài liệu tối thiểu | Chỉ `KVC_GCS_DESIGN_SPEC.md` + 1 file plan canonical |
| D5 | `gcs-redesign` giữ lại, đánh dấu PROTOTYPE | Không xóa, không merge, không import vào `gcs/frontend` |
| D6 | Copy LOCAL_GRID vẫn bật, nhãn tách rõ | Một nút, nhãn động theo `coordinate_frame` |
| D7 | Stale đọc từ `APP_CONFIG.STALE_THRESHOLD_MS`, nhãn động | Giữ khả năng cấu hình qua env |
| D8 | Sửa bug scenario id ở cả 2 chỗ | `NORMAL_GPS_DETECT` → `NORMAL_GPS_TARGET` |
| D9 | Sửa bug Settings WebSocket URL | Cần `setUrl` + persist + hiển thị URL hiệu lực |
| D10 | npm và browser chạy được | Được phép ghi PASS, không dùng BLOCKED |
| D11 | Plan canonical đặt trong `docs/architecture/` | Chưa thêm vào `docs/INDEX.md` trong task này |

### 2.1. Đối chiếu với kế hoạch dài hạn

| Task trong `KVC_GCS_Dashboard_Redesign_Plan.md` | Trong kế hoạch này | Lý do |
|---|---|---|
| `KVC-GCS-UX-...-001` (thiết kế 6 trang) | **HOÃN** | Không kịp trong ngày; chỉ sửa phần pin/copy/stale của spec hiện có |
| `KVC-GCS-DATA-...-001` (dữ liệu + UI pin, stale, WS, copy) | **LẤY TOÀN BỘ**, tách thành P1, P2, P3, P5 | Đây là phần đúng đắn dữ liệu, ưu tiên cao nhất |
| `KVC-GCS-MARK-BE-...-001` (marker API) | **HOÃN** | Feature mới, cần migration SQLite; không phục vụ mục tiêu trong ngày |
| `KVC-GCS-MARK-FE-...-001` (UI marker) | **HOÃN** | Phụ thuộc MARK-BE |
| `KVC-GCS-CORE-...-001` (Mission + Overview) | **HOÃN** | Redesign thị giác; chỉ sửa text/comment trong P1 |
| `KVC-GCS-PAGES-...-001` (4 trang còn lại) | **HOÃN** | Redesign thị giác; chỉ sửa text/comment trong P1 |
| `KVC-GCS-A11Y-PERF-...-001` | **HOÃN** | Không tối ưu bundle trong ngày; P8 chỉ ghi số kB tham chiếu |
| `KVC-GCS-VERIFY-...-001` | **LẤY MỘT PHẦN**, thu gọn vào P8 | Chỉ typecheck/lint/test/build + ảnh + `git diff --check` |

## 3. Phạm vi

### 3.1. Trong phạm vi

| Nhóm | File | Nội dung |
|---|---|---|
| Bỏ pin | `gcs/frontend/src/features/alerts/AlertsPage.tsx` | `infoTip` dòng 74 |
| Bỏ pin | `gcs/frontend/src/features/alerts/AlertFilters.tsx` | Nhãn `SENSORS` dòng 85 |
| Bỏ pin | `gcs/frontend/src/features/mission/ActiveAlertsQuickPanel.tsx` | `infoTip` dòng 25 |
| Bỏ pin | `gcs/frontend/src/features/overview/OverviewPage.tsx` | `infoTip` dòng 75, comment dòng 163 |
| Bỏ pin | `gcs/frontend/src/state/missionReducer.ts` | `resolveAlertMetadata` dòng 161-166: giữ keyword, đổi text |
| Stale | `gcs/frontend/src/app/ModeContextBar.tsx` | dòng 32, 146 |
| Stale | `gcs/frontend/src/app/AppHeader.tsx` | dòng 58 |
| Stale | `gcs/frontend/src/features/telemetry/UavHardwareGaugeCard.tsx` | dòng 15 |
| Stale | `gcs/frontend/src/features/mission/TargetDetailsPanel.tsx` | dòng 78, 185 |
| Stale | `gcs/frontend/src/features/mission/PositionSummary.tsx` | dòng 158, 165 |
| Stale | `gcs/frontend/src/features/mission/CurrentPositionPanel.tsx` | dòng 56, 60, 220, 224, 233, 240 |
| Stale | `gcs/frontend/src/features/radar/LocalRadarPanel.tsx` | dòng 117, 132, 384, 552 |
| Stale | `gcs/frontend/src/features/devices/DevicesPage.tsx` | dòng 181 (nhãn `>3s`), dòng 110 (URL hiệu lực) |
| Copy | `gcs/frontend/src/features/mission/TargetDetailsPanel.tsx` | dòng 46-88, 224-236 |
| Copy | `gcs/frontend/src/features/mission/BottomTacticalDock.tsx` | dòng 99-117, 412-420 |
| Scenario | `gcs/frontend/src/features/overview/OverviewPage.tsx` | dòng 50 |
| Scenario | `gcs/frontend/src/app/ModeContextBar.tsx` | dòng 168 |
| Scenario | `gcs/frontend/src/state/MissionProvider.tsx` | Guard `setSelectedScenarioId` dòng 78-82 |
| WS URL | `gcs/frontend/src/state/MissionProvider.tsx` | Thêm `wsUrl` + `setWsUrl` |
| WS URL | `gcs/frontend/src/features/settings/SettingsPage.tsx` | dòng 50-59, 326-364 |
| WS URL | `gcs/frontend/src/features/devices/DevicesPage.tsx` | dòng 110 |
| Config | `gcs/frontend/src/config/appConfig.ts` | Thêm `STORAGE_KEYS.WS_URL` |
| Helper | `gcs/frontend/src/lib/stale.ts` | File mới: một nguồn ngưỡng stale |
| Test | `gcs/frontend/src/features/mission/MissionPage.test.tsx` | dòng 190 (aria-label) |
| Test | 4 file test mới (xem §5 P6) | `NoPinContent`, `stale`, `SettingsPage.ws`, `TargetDetailsPanel.copy` |
| Test | `gcs/frontend/src/app/AppNavigationAndDemo.test.tsx` | Assert scenario id sau nút diễn tập |
| Docs | `docs/architecture/KVC_GCS_DESIGN_SPEC.md` | Bỏ mô tả pin, thêm quy tắc copy + stale |
| Prototype | `gcs-redesign/README.md` | Banner PROTOTYPE (mới) |

### 3.2. Ngoài phạm vi

- Redesign Mission/Overview, token màu mới, bỏ emoji, gom overlay.
- Marker API (BE/FE), migration SQLite.
- Chia tải route (`React.lazy`), tối ưu bundle.
- Đổi `KVC_GCS_DESIGN_SPEC.md` sang spec field-ops mới (chỉ sửa phần pin/copy/stale).
- Backend, firmware, RF ABI, `gcs/backend/**`.
- Commit/push/merge/flash.
- Sửa các file docs đang dirty từ công việc ABI 29/10 (`docs/INDEX.md`, `docs/configuration/DASHBOARD_FRONTEND.md`, `docs/interfaces/**`, `docs/architecture/KVC_PROJECT_STATUS.md`, ...).
- Logic Replay.
- `gcs/frontend/src/lib/connectionStatus.ts` (giữ nguyên literal ngưỡng và hành vi trạng thái ESP32; có test riêng).
- 7 script Playwright cũ trong `gcs/frontend/tests/`.

## 4. Cột mốc và thời gian

**Thời gian:** hạn chót hết ngày 29/10/2026. Kế hoạch **không chia giờ công cho từng đầu việc**; tiến độ đo bằng mốc gate và bằng chứng. Thứ tự dưới đây là thứ tự thực thi bắt buộc.

| Mốc | Nhóm việc | Điều kiện qua cổng | Bằng chứng bắt buộc |
|---|---|---|---|
| **M0** | P0 Baseline | Có ảnh + số đo trước khi sửa; danh sách file dirty được ghi lại | `git status --short`, `git diff --stat`, output `npm run build` (kB từng chunk), ảnh 6 route |
| **M1** | P1 Bỏ pin | Không còn nội dung pin render trên 6 trang | `git diff` + `NoPinContent.test.tsx` |
| **M2** | P2 Một nguồn stale | Một nguồn ngưỡng, nhãn động, không phá test cũ | `git diff` + `stale.test.ts` + `LocalRadarPanel.test.tsx` |
| **M3** | P3 Copy + P4 Scenario | Nhãn copy theo hệ quy chiếu; hai nút diễn tập dùng id đúng | `git diff` + 2 test |
| **M4** | P5 WS URL | Ô nhập áp dụng thật, URL hiệu lực hiển thị đúng | Test mới + log |
| **M5** | P6 Test | Toàn bộ test cũ + mới xanh | log `npm test` |
| **M6** | P7 Docs | Spec không còn mô tả pin như chỉ số sống; có quy tắc copy và một nguồn stale | `git diff docs` |
| **M7** | P8 Verify | 4 lệnh npm + `git diff --check` exit 0; ảnh sau khi sửa | Log đầy đủ + ảnh |
| **M8** | Báo cáo | Evidence hoàn chỉnh, có giới hạn và phần NOT RUN | `review/KVC-GCS-P0-20261029-001/40-report.md` |

**Quy tắc cắt phạm vi khi hết ngày:** cắt theo thứ tự ngược — bỏ P7 docs → bỏ P5 WS URL → bỏ P3 copy LOCAL_GRID. **Không bao giờ cắt** P1 (bỏ pin), P2 (stale), P4 (scenario id), P6 (test), P8 (verify). Nếu cắt, ghi `DEFERRED` trong báo cáo, không ghi PASS.

## 5. Đầu việc theo thứ tự ưu tiên

### 5.0. Bảng ưu tiên

| Thứ tự | Nhóm | Vì sao ở vị trí này | Cắt được không |
|---:|---|---|---|
| 1 | **P0 Baseline** | Không có baseline thì không chứng minh được gì | Không |
| 2 | **P1 Bỏ pin** | Hiển thị sai bản chất dữ liệu; hợp đồng đã nói REAL luôn `null` | Không |
| 3 | **P2 Một nguồn stale** | Hai ngưỡng khác nhau trên cùng màn hình | Không |
| 4 | **P3 Copy tọa độ** | Sai nhãn hệ quy chiếu khi bàn giao cứu nạn | Chỉ khi buộc phải cắt |
| 5 | **P4 Scenario id** | Demo chỉ chạy nhờ fallback, ghi rác vào localStorage | Chỉ khi buộc phải cắt |
| 6 | **P5 WS URL** | UI báo "đã lưu" nhưng không áp dụng | Cắt được (ghi DEFERRED) |
| 7 | **P6 Test** | Khóa hành vi đã sửa | Không (là bằng chứng của P1–P5) |
| 8 | **P7 Docs** | Đồng bộ spec với hành vi mới | Cắt được (ghi DEFERRED) |
| 9 | **P8 Verify** | Cổng nghiệm thu cuối | Không |

### P0 — Baseline & governance

1. Tạo thư mục evidence bằng PowerShell (brace syntax không tạo nhiều thư mục):
   ```powershell
   $root = 'review/KVC-GCS-P0-20261029-001'
   '00-baseline','10-diff','20-tests','30-screens' | ForEach-Object { New-Item -ItemType Directory -Force -Path "$root/$_" | Out-Null }
   ```
   File `40-report.md` tạo ở bước 44 (là file, không phải thư mục).
2. Lưu `git status --short`, `git diff --stat` vào `00-baseline/`.
3. Chạy `npm run build` trong `gcs/frontend`, lưu output làm baseline bundle.
4. Chụp 6 route (`#/mission`, `#/overview`, `#/alerts`, `#/history`, `#/devices`, `#/settings`) ở 1366×768 và 1920×1080, theme tối; thêm 1 ảnh Mission theme sáng.
5. Kiểm tra `npm run dev` dùng cổng 5173 (không đổi cổng, không đụng script Playwright cũ).
6. Tạo `gcs-redesign/README.md` với nội dung: `PROTOTYPE — NOT PRODUCTION. Không import vào gcs/frontend. Không dùng types.ts/state/mission.tsx vì sai contract MOCK/REAL/REPLAY và sinh dữ liệu pin/HDOP/FPS giả.`
7. Tạo `docs/architecture/KVC_GCS_Dashboard_Redesign_Plan.md` (plan dài hạn) và ghi rõ liên kết tới tài liệu P0 này. **Không** thêm dòng vào `docs/INDEX.md` trong task này (file đang dirty từ việc ABI).

### P1 — Bỏ pin khỏi UI

8. `AlertsPage.tsx:74` — bỏ "mức pin tải" khỏi `infoTip`.
9. `AlertFilters.tsx:85` — `Cảm biến / Pin` → `Cảm biến`.
10. `ActiveAlertsQuickPanel.tsx:25` — bỏ "pin yếu" khỏi `infoTip`.
11. `OverviewPage.tsx:75` — bỏ "tới pin tải"; dòng 163 comment `Nguồn/pin` → `Liên kết và thiết bị`.
12. `missionReducer.ts:161-166` — **giữ** điều kiện `BATTERY|LIDAR|IMU|PIN` để cảnh báo cũ trong replay vẫn phân loại đúng, nhưng đổi câu:
    - `impact`: `Cảm biến cận đất, góc nghiêng hoặc trạng thái nguồn tải báo bất thường.`
    - `remediation`: `Kiểm tra bề mặt phản xạ siêu âm, cảm biến IMU và nguồn cấp tải.`
    - Không khẳng định có phép đo pin.
13. Giữ nguyên `battery_pct` trong `types/telemetry.ts`, `telemetryAdapter.ts`, `telemetryClient.ts`, `mocks/scenarios.ts` (đúng contract: trường tồn tại, REAL luôn `null`, MOCK được mang số để kiểm UI).
14. **Không** sửa 4 file UI đang dirty ngoài phần đã có; chỉ thêm test phủ.

### P2 — Một nguồn ngưỡng stale

15. Tạo helper dùng chung trong `src/lib/stale.ts` (file mới). **Lý do không đặt trong `connectionStatus.ts`:** file đó đã có `getEsp32PhysicalStatus` với literal ngưỡng ở dòng 82/100 và test riêng; sửa nó là thay đổi hành vi trạng thái ESP32, ngoài phạm vi.
    - `STALE_MS = APP_CONFIG.STALE_THRESHOLD_MS`
    - `AMBER_AGE_MS = 1000`
    - `isAgeStale(rxAgeMs, isStaleFlag)` → `isStaleFlag || rxAgeMs > STALE_MS`. Khi `rxAgeMs` là `null`, trả `isStaleFlag`.
    - `staleLabel(thresholdMs = STALE_MS)` → `DỮ LIỆU CŨ (>${giây}s)`; với 3000 giữ đúng `DỮ LIỆU CŨ (>3s)` để không phá `LocalRadarPanel.test.tsx`.
    - `staleSecondsText(thresholdMs = STALE_MS)` → `>${giây}s`.
16. Thay literal `3000` và chuỗi `>3s` trong danh sách file §3.1 bằng helper. **Loại trừ:**
    - `src/lib/connectionStatus.ts` giữ nguyên.
    - `Map2DView.test.tsx:5-9` giữ nguyên vì là test biên 3000/3001 có chủ đích cho `formatTargetAgeLabel`.
17. Đưa `1000` trong `PositionSummary`/`AppHeader` về `AMBER_AGE_MS` khi tiện sửa cùng dòng; không đổi giá trị.
18. `LocalRadarPanel.tsx:117` dùng `isAgeStale`; nhãn dòng 132/552 dùng `staleLabel()`; dòng 384 giữ logic vẽ gạch chéo nhưng đọc `isDataStale` đã tính.
19. `DevicesPage.tsx:181` dùng `staleSecondsText()`.

### P3 — Copy tọa độ phân biệt hệ quy chiếu

20. `TargetDetailsPanel.tsx`:
    - Trong `handleCopyCoord`, chốt `isLocal = target.coordinate_frame === 'LOCAL_GRID'`.
    - Payload đã đúng hệ (dòng 64-76), giữ nguyên; chỉ đổi toast sang nêu rõ hệ: `Đã sao chép toạ độ LOCAL (cm) ...` hoặc `... WGS-84 ...`.
    - Stale suffix dùng `STALE_MS` thay `3000`.
    - Nút dòng 226-236: `aria-label` và nhãn động — `Sao chép Local (cm)` khi LOCAL, `Sao chép WGS-84` khi WGS-84; `title` nêu rõ "không phải WGS-84" khi LOCAL.
21. `BottomTacticalDock.tsx`:
    - Dòng 419 `Sao chép SAR` → nhãn động như trên.
    - Dòng 312 `title` nêu hệ quy chiếu.
    - Toast dòng 113 nêu hệ.
22. Không đổi nội dung clipboard ngoài việc bảo đảm đã có `LOCAL_GRID`/`WGS-84` và đơn vị cm; không đổi thứ tự trường.

### P4 — Scenario id

23. `OverviewPage.tsx:50` và `ModeContextBar.tsx:168`: `'NORMAL_GPS_DETECT'` → `'NORMAL_GPS_TARGET'`.
24. `MissionProvider.tsx:78-82`: chỉ `localStorage.setItem` + gọi `mockSourceInstance.setScenario` khi id tồn tại trong `MOCK_SCENARIOS`; nếu không, giữ nguyên và `console.warn`.

### P5 — WebSocket URL áp dụng thật

25. `src/config/appConfig.ts` — thêm key `WS_URL: 'kvc_gcs_ws_url'` vào `STORAGE_KEYS`; không đổi giá trị các key cũ.
26. `MissionProvider.tsx`:
    - Thêm state `wsUrl` khởi tạo an toàn: `typeof window !== 'undefined' ? localStorage.getItem(APP_CONFIG.STORAGE_KEYS.WS_URL) || APP_CONFIG.WS_URL : APP_CONFIG.WS_URL`.
    - Thêm `useEffect(..., [])` **khai báo trước** effect quản lý luồng dữ liệu, nội dung chỉ `telemetryClientInstance.setUrl(wsUrl)`. Thứ tự này bảo đảm URL từ localStorage được áp trước `connect()`, và `setUrl` không tự reconnect vì lúc đó `ws` còn `null`.
    - Thêm `setWsUrl(url: string): { ok: boolean; error?: string }`:
      - Trim; `new URL(url)`; scheme phải `ws:` hoặc `wss:`.
      - Nếu hợp lệ: `telemetryClientInstance.setUrl(url)`, lưu localStorage bằng key trên, `setWsUrlState(url)`, gọi `telemetryClientInstance.reconnect()`.
      - Nếu không: trả `{ ok: false, error }`, không lưu, không reconnect.
    - Export `wsUrl` + `setWsUrl` trong `MissionContextValue`; **bắt buộc** cập nhật hai test dựng context bằng object literal, nếu không typecheck sẽ fail:
      - `src/features/radar/LocalRadarPanel.test.tsx:49-56`
      - `src/app/RealityVerification.test.tsx:20-27`

      Thêm `wsUrl: APP_CONFIG.WS_URL, setWsUrl: vi.fn()` (hoặc `() => ({ ok: true })` ở file không dùng `vi`).
27. `SettingsPage.tsx`:
    - `handleSaveNetwork`: gọi `setWsUrl(customWsUrl)`; chỉ `toast.success` khi `ok`; khi lỗi `toast.error(error)` + render text lỗi dưới input.
    - Dòng 361: hiển thị `wsUrl` hiệu lực từ context, không phải `APP_CONFIG.WS_URL`.
    - Thêm nút "Khôi phục mặc định" gọi `setWsUrl(APP_CONFIG.WS_URL)`.
28. `DevicesPage.tsx:110`: hiển thị `wsUrl` hiệu lực từ context.

### P6 — Test

29. `src/app/NoPinContent.test.tsx` (mới) — render lần lượt 6 trang trong `MissionProvider`; assert **không còn chỉ số pin**, nhưng **không cấm chữ "pin"** (UI được phép giải thích "KVC không đo pin"). Assert cụ thể:
    - `queryByLabelText(/Mức pin tải/i)` là `null` (aria-label của gauge cũ).
    - `container.textContent` không khớp `/3S LiPo|4S LiPo|11\.1V|12\.6V|Điện áp danh định/i`.
    - Không có text khớp `/\d{1,3}\s*%\s*(·|pin|Pin)/`, không có `Pin tải:` / `Nguồn Pin UAV:`.
    - **InfoTip phủ được:** `InfoTip` render `aria-label={\`Chú thích: ${text}\`}` (`src/components/shared/InfoTip.tsx:39`), nên text tooltip **có trong DOM** dù chưa hover. Thêm assert: không tồn tại `aria-label` khớp `/Chú thích:.*(mức pin tải|pin yếu|cảm biến \/ pin)/i`.
    - `SelectItem` của bộ lọc chỉ render khi mở popover → **không phủ được**; phần nhãn `Cảm biến / Pin` phải kiểm bằng `git diff` và ghi rõ trong report.
    - Không assert ở tầng state (MOCK vẫn mang `battery_pct` theo contract).
30. `src/lib/stale.test.ts` (mới) — `staleLabel(3000) === 'DỮ LIỆU CŨ (>3s)'`; `staleLabel(5000) === 'DỮ LIỆU CŨ (>5s)'`; `isAgeStale(3000, false)` false; `isAgeStale(3001, false)` true; `isAgeStale(0, true)` true.
31. `src/features/settings/SettingsPage.ws.test.tsx` (mới) — mock `telemetryClientInstance`: URL hợp lệ → `setUrl` nhận đúng chuỗi, `localStorage[APP_CONFIG.STORAGE_KEYS.WS_URL]` được ghi, không có toast lỗi; `http://x` → không gọi `setUrl`, có thông báo lỗi.
32. `src/features/mission/TargetDetailsPanel.copy.test.tsx` (mới) — target LOCAL_GRID: nút có nhãn chứa `Local`, clipboard nhận chuỗi chứa `LOCAL_GRID` và `cm`, không chứa `WGS-84`; target WGS-84: ngược lại.
33. `src/features/mission/MissionPage.test.tsx:190` — cập nhật kỳ vọng aria-label. Với `MissionProvider` mặc định (MOCK LOCAL, kịch bản `NORMAL_GPS_TARGET` có `coordinate_frame: 'WGS84'` tại `mocks/scenarios.ts:128`), nhãn mới là `Sao chép WGS-84`; đổi regex từ `/Sao chép tọa độ chuẩn SAR/i` sang `/Sao chép WGS-84/i`. Nếu test chạy với target LOCAL_GRID thì dùng `/Sao chép Local \(cm\)/i`.
    - **Lưu ý timing:** nhãn phụ thuộc `has_target`, mà target đến từ `mockSourceInstance` phát trong `useEffect`. Nếu assertion chạy trước khi packet đầu tiên tới, dùng `await screen.findByRole('button', { name: /Sao chép WGS-84/i })` thay vì `getByRole` để tránh flake.
34. `src/app/AppNavigationAndDemo.test.tsx` — thêm assert sau khi bấm "Diễn tập cứu nạn": `localStorage.getItem(APP_CONFIG.STORAGE_KEYS.MOCK_SCENARIO) === 'NORMAL_GPS_TARGET'`.
35. Chạy lại `LocalRadarPanel.test.tsx` — phải vẫn xanh vì `staleLabel(3000)` giữ chuỗi `>3s`. File này cũng phải được cập nhật context theo bước 26.
36. `src/app/RealityVerification.test.tsx` — cập nhật context theo bước 26; không đổi assertion.

### P7 — Docs

37. `docs/architecture/KVC_GCS_DESIGN_SPEC.md`:
    - Dòng 70, 92, 99, 130, 151-154: bỏ mô tả pin như chỉ số sống; thay bằng mô tả khối "Liên kết RF và tuổi dữ liệu".
    - Thêm mục ngắn: "Ngưỡng stale lấy từ `APP_CONFIG.STALE_THRESHOLD_MS`; UI không hardcode."
    - Thêm mục ngắn: "Copy tọa độ: LOCAL_GRID copy X/Y cm kèm nhãn hệ quy chiếu; WGS-84 copy lat/lon; không trình bày last-known như hiện hành."
    - Thêm dòng: "KVC không đo pin tải; `battery_pct` giữ trong contract, REAL luôn `null`, UI không hiển thị."
38. **Không** sửa `docs/INDEX.md`, `docs/configuration/DASHBOARD_FRONTEND.md`, `docs/interfaces/**` trong task này.

### P8 — Verify & báo cáo

39. Trong `gcs/frontend`, chạy tuần tự và lưu log riêng:
    - `npm run typecheck`
    - `npm run lint`
    - `npm test`
    - `npm run build`
40. Ở repo root: `git diff --check`.
41. Chụp lại 6 route × 2 độ phân giải; đối chiếu không tràn/cắt ở 1366×768.
42. So sánh bundle sau với baseline ở bước 3; ghi số kB, không đặt mục tiêu giảm.
43. Kiểm tra cold-cache: tắt WAN, mở `#/mission`, xác nhận radar local vẫn hiển thị và có thông báo tile không tải được.
44. Viết `review/KVC-GCS-P0-20261029-001/40-report.md` gồm: task ID, owner, phạm vi, lệnh + exit code + kết quả, ảnh, số đo bundle, phần `DEFERRED`, phần `NOT RUN`, giới hạn ("PASS không thay thế nghiệm thu người dùng; không có kiểm thử phần cứng").

## 6. Nguồn lực

| Loại | Có sẵn | Ghi chú |
|---|---|---|
| **Thời gian** | Trong ngày 29/10/2026 | Không chia giờ công; cắt phạm vi theo §4 nếu chưa xong |
| CODER | Kilo, 1 writer | Không mở writer thứ hai |
| Frontend runtime | `gcs/frontend/node_modules` | `npm ci` chỉ khi thiếu |
| Backend | Không cần | Không sửa backend trong task này |
| Browser | Có | Dùng cho ảnh thủ công (Chrome/Edge DevTools responsive). **Không** chạy lại 7 script Playwright cũ trong `gcs/frontend/tests/` (`verify_browser.mjs`, `verify_ui_00x.mjs`, ...) vì chúng trỏ cổng/evidence của task cũ và có thể ghi đè bằng chứng |
| Reviewer (tùy chọn) | Codex read-only | Chỉ review diff nếu người dùng yêu cầu; tối đa 1 lượt trong ngày |
| Dữ liệu | MOCK LOCAL | Không cần thiết bị thật |

## 7. Trách nhiệm

| Vai trò | Ai | Làm gì |
|---|---|---|
| Chỉ huy phạm vi | Người dùng | Chốt D1–D11; quyết định cắt phạm vi nếu P1–P4 chưa xong khi hết ngày |
| CODER / writer duy nhất | Kilo | Thực hiện P0–P8 trong allowed files; tự chạy test; tự ghi evidence |
| Reviewer | Codex (tùy chọn) | Đọc diff, báo finding; không sửa |
| Nghiệm thu | Người dùng | Xem `40-report.md` + ảnh, chấp nhận hoặc trả finding |

Quy tắc: mọi finding sau review do Kilo xử lý (giữ nguyên owner), trừ khi người dùng chỉ định khác.

## 8. Rủi ro và giảm thiểu

| ID | Rủi ro | Mức | Giảm thiểu |
|---|---|---|---|
| R1 | Working tree đang dirty nhiều docs + firmware + backend từ việc ABI; sửa thêm dễ lẫn | Cao | Chỉ chạm allowed files; ghi `git diff --stat` trước/sau; không `git add`; không revert file khác |
| R2 | Test phụ thuộc chuỗi tiếng Việt chính xác | Cao | `staleLabel(3000)` giữ nguyên `>3s`; chỉ cập nhật `MissionPage.test.tsx:190`; chạy `npm test` sau từng nhóm |
| R3 | `setUrl` gây vòng reconnect nếu URL sai | Trung bình | Validate trước khi gọi; test URL sai; giữ `isExplicitlyClosed` của client |
| R4 | Đổi text `resolveAlertMetadata` làm sai phân loại cảnh báo replay cũ | Trung bình | Giữ nguyên điều kiện keyword, chỉ đổi câu chữ |
| R5 | Test "no pin" fail vì MOCK còn `battery_pct` | Trung bình | Test ở tầng text render, không tầng state |
| R6 | `gcs-redesign` vẫn bị hiểu là app thật | Trung bình | README PROTOTYPE + không import; ghi trong report |
| R7 | Scope creep sang redesign thị giác | Cao | Danh sách ngoài phạm vi §3.2; mọi đề xuất mới ghi `DEFERRED` |
| R8 | Ảnh chụp thiếu do cổng/route hash | Thấp | Dùng `#/mission`… đúng router hiện có; xác nhận `parseHash` |
| R9 | Sửa `docs/INDEX.md` xung đột việc ABI | Trung bình | Không sửa INDEX trong task này |
| R10 | Không đủ thời gian trong ngày | Cao | Cắt phạm vi theo §4; P1, P2, P4, P6, P8 bất khả xâm phạm |
| R11 | Guard `setSelectedScenarioId` làm test cũ fail nếu test truyền id không tồn tại | Thấp | Chạy `npm test` trước khi thêm guard để biết baseline; nếu test cũ dùng id sai thì sửa test theo D8 |
| R12 | Thêm `wsUrl`/`setWsUrl` vào `MissionContextValue` làm typecheck fail ở 2 test dựng context bằng object literal | Cao | Cập nhật `LocalRadarPanel.test.tsx:49-56` và `RealityVerification.test.tsx:20-27` ngay trong P5, không để sang P6 |
| R13 | `new URL()` trong jsdom với `ws://` có thể ném khi thiếu base | Thấp | Dùng absolute URL trong test: `ws://127.0.0.1:8000/ws/telemetry` |
| R14 | Nhãn copy động làm `MissionPage.test.tsx` fail vì nút chỉ render khi `has_target` | Trung bình | Dùng `findByRole` (bất đồng bộ) thay `getByRole`; nếu vẫn flake, chuyển test sang render `TargetDetailsPanel` với context dựng sẵn target |
| R15 | `InfoTip` lồng `TooltipProvider` riêng trong mỗi instance gây chậm test khi render 6 trang | Thấp | Test no-pin chỉ render text/aria-label, không hover; nếu chậm, tách thành 2 lần render thay vì 6 |

## 9. Cách theo dõi

**Một task, một bảng trạng thái.** Ghi trong `review/KVC-GCS-P0-20261029-001/40-report.md`:

| Mã | Đầu việc | Trạng thái | Bằng chứng |
|---|---|---|---|
| P1-01 … P1-07 | Bỏ pin | TODO/DOING/DONE/BLOCKED | `git diff` + test |
| P2-01 … P2-05 | Stale | … | `stale.test.ts` |
| P3-01 … P3-03 | Copy | … | `TargetDetailsPanel.copy.test.tsx` |
| P4-01 … P4-02 | Scenario id | … | `AppNavigationAndDemo.test.tsx` |
| P5-01 … P5-03 | WS URL | … | `SettingsPage.ws.test.tsx` |
| P6-01 … P6-08 | Test | … | log `npm test` |
| P7-01 … P7-02 | Docs | … | `git diff docs` |
| P8-01 … P8-06 | Verify | … | log + ảnh + report |

Quy ước trạng thái: `DONE` chỉ khi có bằng chứng chạy được; `BLOCKED` phải kèm lý do; `DEFERRED` phải kèm lý do cắt phạm vi; **không dùng `PASS` cho mục chưa có log**.

Nhịp cập nhật: cập nhật bảng ngay sau mỗi nhóm P0–P8 hoàn tất.

## 10. Cổng nghiệm thu

1. Không còn nội dung pin render trên 6 trang; `NoPinContent.test.tsx` xanh.
2. Chỉ còn một nguồn ngưỡng stale (`APP_CONFIG.STALE_THRESHOLD_MS`) cho các điểm trong §3.1; `stale.test.ts` xanh; không còn literal `3000`/`>3s` trong danh sách file §3.1. Ngoại lệ được phép: `src/lib/connectionStatus.ts` và `Map2DView.test.tsx` (xem §5 P2 bước 16).
3. Nút copy có nhãn phân biệt LOCAL/WGS-84; clipboard chứa đúng hệ và đơn vị; `TargetDetailsPanel.copy.test.tsx` xanh.
4. Hai nút "Diễn tập cứu nạn" chọn `NORMAL_GPS_TARGET`; không ghi id không tồn tại vào localStorage.
5. Ô nhập WS URL áp dụng thật (`setUrl` + persist + hiển thị URL hiệu lực); URL sai bị từ chối; test xanh.
6. `npm run typecheck`, `npm run lint`, `npm test`, `npm run build` exit 0; `git diff --check` sạch.
7. Ảnh 6 trang × 1366×768 và 1920×1080; không tràn/cắt.
8. `40-report.md` có lệnh, exit code, log, ảnh, số đo bundle, mục DEFERRED/NOT RUN, giới hạn.

## 11. Việc mở / chờ quyết định (không chặn task này)

- **Đưa `docs/INDEX.md` lên**: chờ commit công việc ABI 29/10 xong để tránh trộn diff.
- **`docs/configuration/DASHBOARD_FRONTEND.md`**: bổ sung mô tả WS URL runtime và bỏ pin — cùng task với INDEX.
- **`KVC_GCS_DESIGN_SPEC.md` mục 2.1**: bảng màu vẫn ghi "Pin an toàn"; đã sửa ở P7, nhưng nên rà lại toàn bộ spec khi làm redesign thị giác.
- **Marker API, route lazy, redesign Mission/Overview**: thuộc kế hoạch dài hạn, cần task riêng.
- **`gcs-redesign` vòng đời**: đã đánh dấu PROTOTYPE; quyết định xóa/port để phiên sau.
- **Sai lệch nội dung ngoài phạm vi**: `AppNavigationAndDemo.test.tsx:153` còn assert `TF-Luna` trong khi BOM dùng AJ-SR04M; `SettingsPage` còn dòng "video RTSP" dù chưa có kênh video. Ghi nhận để task riêng.
- **Ngưỡng amber 1000 ms** trong `PositionSummary`/`AppHeader` là ngưỡng hiển thị, không phải stale; task này chỉ đặt tên hằng, không đổi giá trị.

## 12. Lệnh kiểm chứng

```powershell
# trong gcs/frontend
npm run typecheck
npm run lint
npm test
npm run build

# tại repo root
git diff --check
git status --short
git diff --stat
```

Ghi cho mỗi lệnh: thời điểm chạy, exit code, số test pass/fail, và đường dẫn log đã lưu.

## 13. Rollback

Vì **không commit** trong task này, rollback là thao tác file-level, chỉ trên các file đã chạm:

```powershell
# trong repo root — chỉ liệt kê, KHÔNG chạy khi chưa đối chiếu
git diff --name-only -- gcs/frontend/src
```

Quy tắc:

1. Rollback từng nhóm P1…P5 bằng `git checkout -- <file>` chỉ với file thuộc nhóm đó.
2. **Không** dùng `git checkout -- .` hoặc `git reset --hard` — sẽ xóa công việc ABI 29/10 đang dirty ở docs/firmware/backend.
3. 4 file UI vốn đã dirty từ trước (`AppHeader`, `TopStatCards`, `UavHardwareGaugeCard`, `BottomTacticalDock`) **không được rollback** — rollback sẽ mất phần bỏ pin đã làm trước phiên này.
4. Nếu phải rollback `MissionProvider.tsx`, kiểm tra lại 4 file trên vẫn compile (chúng không import `wsUrl`).
5. Sau rollback, chạy lại `npm run typecheck` và `npm test` trước khi tiếp tục.

## 14. Bàn giao sau khi xong

- Báo cáo: `review/KVC-GCS-P0-20261029-001/40-report.md`.
- Ảnh: `review/KVC-GCS-P0-20261029-001/30-screens/` (6 route × 2 độ phân giải + 1 ảnh theme sáng).
- Log: `review/KVC-GCS-P0-20261029-001/20-tests/`.
- Diff: `review/KVC-GCS-P0-20261029-001/10-diff/`.
- Việc tiếp theo (không thuộc task này): chốt `docs/INDEX.md` cho plan dài hạn; mở task thiết kế + Mission/Overview; đánh giá lại `gcs-redesign`.
