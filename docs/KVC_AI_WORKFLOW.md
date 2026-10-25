# KVC — phân công CODER, Codex review và lựa chọn bên sửa

Cập nhật vai trò **13/10/2026, Asia/Saigon** tại `D:\Project_UAV_KVC`.
Thiết lập ban đầu ngày 11/10 là lịch sử; quy tắc vai trò hiện hành nằm trong AGENTS.md.
Luồng: chọn một CODER → implement → build/test → người dùng yêu cầu Codex review
→ báo finding → người dùng chọn FIX OWNER → sửa/build/test → human approval.

## Vai trò hiện hành và lựa chọn sau review

| Yêu cầu của người dùng | Codex thực hiện | Quyền sửa |
|---|---|---|
| “Codex triển khai/sửa task X” | Là CODER, lập task scope rồi code/test | Trong allowed files của task |
| “Giao Antigravity làm task X” | Chuẩn bị prompt/evidence handoff | Antigravity là writer; Codex không sửa cùng task |
| “Giao Kilo làm task X” | Chuẩn bị prompt/evidence handoff | Kilo là owner cho phiên Kilo; ghi model/provider đang dùng |
| “Giao task cho phiên/công cụ chạy DeepSeek” | Chuẩn bị handoff đến phiên có DeepSeek và quyền workspace | Ghi rõ công cụ/agent làm owner và DeepSeek là model/provider |
| “Codex review/đánh giá/chẩn đoán X” | Review chỉ đọc, báo finding và giới hạn | Chưa được sửa source |
| “Codex sửa các finding này” | Nhận FIX OWNER, sửa/test | Scope finding và allowed files đã giao |
| “Đưa Antigravity sửa” | Xuất prompt sửa có ID/files/tests/evidence | Chuyển owner sau khi writer cũ dừng |
| “Đưa Kilo sửa” | Chuẩn bị prompt/evidence handoff | Kilo là owner trong phiên Kilo; ghi model/provider |
| “Chọn coder dùng DeepSeek sửa” | Chuẩn bị handoff đến phiên coding có quyền workspace | Ghi rõ công cụ/agent owner và model DeepSeek |

Kilo có thể làm CODER và DeepSeek có thể được dùng làm model để code. DeepSeek
không tự xác định công cụ/phiên có quyền sửa workspace. Nếu DeepSeek chạy trong phiên Kilo,
Kilo vẫn là owner mặc định; ghi DeepSeek ở trường model/provider. Nếu DeepSeek
được dùng qua công cụ coding khác có quyền đọc/sửa workspace và chạy build/test,
ghi rõ công cụ/agent đó làm owner. Đổi model/provider tự nó không chuyển owner,
không mở rộng allowed files và không thay đổi quyền hạn của task.

Nếu có finding cần xử lý và người dùng chưa chọn bên sửa, Codex hỏi người dùng
chọn một CODER có quyền workspace làm FIX OWNER (Codex, Antigravity, Kilo hoặc
công cụ/agent coding chạy DeepSeek qua phiên đã nêu rõ).
Trạng thái handoff là `WAITING_FIX_OWNER`; đây là trạng thái task, không thay
status COMPLETE của report hoặc ledger wrapper. Yêu cầu review không tự cho phép fix.

Nếu người dùng đã chỉ định “review rồi Codex sửa” cho scope cụ thể, hoàn tất review,
lưu báo cáo trước rồi thực hiện fix trong scope; không hỏi lại cùng lựa chọn.
Có finding ngoài scope thì báo riêng, không tự mở rộng allowed files.

Mỗi task chỉ một writer. Chuyển owner giữ Task ID, source/diff hash, evidence,
finding IDs, allowed files và số lượt review; owner cũ dừng sửa trước khi bàn giao.
Codex review code của owner khác có thể ghi INDEPENDENT REVIEW; code do Codex viết
phải ghi SELF-REVIEW. Author chưa xác minh thì AUTHOR UNKNOWN, không tự tuyên bố độc lập.

Việc đổi workflow này không tự giao triển khai các task project đang PROPOSED.
Không bật AutoFix/hook/vòng AI gọi nhau, không tự commit/push/merge/deploy/flash.

## 0. Snapshot hiện hành và tham chiếu kế hoạch — 14/10/2026

Cập nhật KVC-STATUS-DOC-20261014-001: đọc metadata Git thấy main/HEAD 0666e4e389571a62bbb7185b6b9b116d53bed7e8; baseline đã tồn tại. Git status/diff lượt này NOT RUN do process bị chặn. Xem [tiến độ dự án](architecture/KVC_PROJECT_STATUS.md) và danh mục tài liệu (không có trong bản sản phẩm). Các mục setup 11/10 và ví dụ unborn/untracked là lịch sử/điều kiện riêng; trước review luôn kiểm Git hiện tại, không mặc định source vẫn untracked. AI DATAFIX đã thêm generator/validator, nhưng evidence release còn BLOCKED; ABI/hardware G1 chưa được duyệt.

[Thiết kế hệ thống](architecture/KVC_ThietKeHeThong.md) hiện có BOM mục III, wire draft mục IV và nghiệm thu mục VII; không còn lịch 21 ngày. Các mốc 12/10–01/11 và vai A–E phía dưới là lịch sử KVC-DOC-21D-001. Phân công hiện hành theo tên ở checklist 5 người (không có trong bản sản phẩm). [Kế hoạch GCS](architecture/KVC_GCS_PLAN.md) là kế hoạch lịch sử đã superseded cho ingress USB; task mới phải theo kiến trúc và checklist hiện hành. Tiếp tục frontend React/TypeScript đã có.

Audit KVC-MAINT-20261014-001 ngày 14/10 xác nhận frontend, backend MOCK/logger/replay, ai và tests đã có. Tại thời điểm audit đó, Git main chưa có HEAD và source untracked; đây là lịch sử, không phải trạng thái hiện tại. Có gói SDK/tài liệu nhưng chưa thấy project RTL/firmware KVC dạng rời. Công cụ kiểm trong audit: Python 3.13.2, Node 24.15.0, npm 11.12.1; log hiện hành ở review/KVC-MAINT-20261014-001. Mục 1/7/8 dưới đây giữ khảo sát setup 11/10 như lịch sử; không lấy chúng thay inventory/test mới.

KVC-DOC-21D-001 ngày 12/10 chỉ sửa tài liệu theo scope lịch sử. Quy tắc Codex REVIEW-ONLY của phiên setup đã được thay bằng vai trò theo task ngày 13/10 ở đầu tài liệu này. Các giới hạn riêng của task cũ vẫn là lịch sử, không mở quyền sửa ngoài scope task mới. Không bật multi-agent.

Telemetry 20 byte trong quy tắc là ghi nhận source cũ; chưa thấy parser đó trong snapshot hiện tại. RF payload 32 byte vẫn là DESIGN/PENDING duyệt ABI. Wi-Fi SoftAP/WebSocket v1 giữa ESP32 và laptop là baseline trong thiết kế hiện hành, chưa triển khai/xác minh. USB envelope 48 byte thuộc kiến trúc cũ. Không tự đổi baud/CRC/layout/IRQ/pinout. Ví dụ review bên dưới dùng schemas.py/state.py hiện có; mỗi lần phải kiểm inventory và allowed files. Không suy ra parser phần cứng đã có từ các module schema ứng dụng.

Mỗi task ngày KVC-Dxx phải tách owner/file cụ thể theo mẫu mục 3; ngày không phải quyền sửa toàn repo. Task GCS đã có ID giữ nguyên để quản lý evidence và số lượt review. Tài liệu kế hoạch ghi PLANNED; hoàn thành thực tế cần log/mẫu/hash và human approval. review/ bị ignore nên phải sao lưu/bàn giao evidence riêng ở G5.

## 1. Kết quả khảo sát setup lịch sử — 11/10/2026

Ban đầu workspace chưa có `.git`, AGENTS.md, rules Antigravity hay script review.
Theo lựa chọn rõ ràng của người dùng, đã chạy `git init -b main`. Nhánh `main`
chưa có commit; worktree duy nhất là thư mục hiện tại. Không stage/commit source.
Vì vậy `git diff` hiện chưa phản ánh các file untracked; không được suy ra rằng
diff rỗng nghĩa là không có file. Script hỗ trợ untracked ngay khi HEAD chưa tồn tại.

```text
D:\Project_UAV_KVC\
  gcs/backend/       FastAPI, serial reader, decoder, georef, simulator, video
  gcs/frontend/      HTML/CSS/JavaScript, Leaflet, WebSocket client
  ai/             best.pt và train_sar_colab.ipynb
  docs/                    thiết kế .md, analysis.md, DEMO.md, hồ sơ đề tài .pdf
  media/                   ảnh, video demo
  scripts/                 webcam, firewall, SSH; thêm kvc-review.ps1
  run_dashboard.bat        launcher hiện có
```

`ai/best.pt` tồn tại, **6.249.706 bytes**; chỉ xác minh file và checksum,
không load weights hoặc xác nhận precision, accuracy hay hỗ trợ GoAI.
Không tìm thấy RTL `.v/.sv`, firmware `.c`, project Gowin/Keil hoặc bộ unit test
trong workspace. PDF hiện có là hồ sơ đề tài; không tìm thấy datasheet nhà sản
xuất riêng. `docs/architecture/KVC_ThietKeHeThong.md` chứa liên kết hãng và là nguồn kế hoạch.

| Công cụ | Bằng chứng khảo sát | Giới hạn |
|---|---|---|
| PowerShell | 7.6.6 | Script yêu cầu PowerShell 7+, dùng `pwsh`, không Windows PowerShell 5.1 |
| Git | 2.55.0.windows.5, trong PATH | Chưa có lịch sử commit |
| Codex CLI | 0.154.0, trong PATH | Help đã kiểm tra; chưa chạy inference/authentication end-to-end |
| VS Code | `code.cmd` trong PATH | Không mặc định trạng thái cửa sổ/extension đang mở |
| Antigravity IDE | 1.107.0, extension `antigravity` 0.2.0 | IDE launcher có đường dẫn đầy đủ; `antigravity` không có trong PATH |
| Icarus Verilog | 14.0 devel, trong PATH | Chưa có RTL để simulation |
| Gowin | `C:\Gowin\Gowin_V1.9.11.03_Education_x64\IDE\bin\gw_sh.exe` | Chưa xác minh license, IP, synthesis hoặc board |
| Keil | `C:\Keil_v5\UV4\UV4.exe`; MDK-ARM Lite 5.30 | Chưa build firmware |
| ARM compiler | `C:\Keil_v5\ARM\ARMCLANG\bin\armclang.exe`, 6.14 | Không nằm trong PATH |
| Sonix packs | SN32F1_DFP 1.1.2; SN32F4_DFP 1.1.1 | Không thấy chuỗi SN34F788 trong hai file PDSC; chưa xác minh pack đúng chip |
| Python | 3.13.2 | `find_spec` thấy FastAPI, serial, NumPy, torch, ultralytics; chưa chứng minh runtime tương thích |
| Node | 24.15.0, npm trong PATH | Frontend hiện dùng JS thuần, không có bước npm build được phát hiện |
| Chưa thấy trong PATH | pytest, Verilator, Yosys, arm-none-eabi-gcc | pytest cũng không thấy trong Python hiện tại; không đồng nghĩa mọi môi trường đều thiếu |

Có thư mục ứng dụng Antigravity khác và dữ liệu `~/.gemini/antigravity-cli`,
nhưng không thấy executable CLI độc lập trong PATH; `bin` chỉ thấy `agentapi.bat`
và `webm_encoder.exe`. Không dùng các file này làm giao diện headless chưa kiểm chứng.
Không cài thêm phần mềm hoặc thay đổi PATH/config toàn hệ thống.

## 2. Các file cấu hình và cách mở IDE

`AGENTS.md` là nguồn quy tắc chung. `.agents/rules/kvc.md` chỉ là adapter ngắn
cho Antigravity, không sao chép một bộ policy thứ hai. Manifest extension cài
trên máy nhận cả `.agent/rules/**/*.md` và `.agents/rules/**/*.md`; chọn `.agents`
theo tài liệu hiện hành, với `trigger: always_on`.
Việc IDE thực sự nạp rule vào một phiên chat chưa được chạy thử bằng AI.

Trong VS Code Terminal chọn PowerShell 7:

```powershell
Set-Location D:\Project_UAV_KVC
code .
pwsh -NoProfile -File .\scripts\kvc-review.ps1 -Help
```

Mở Antigravity IDE bằng **File → Open Folder → D:\Project_UAV_KVC**, hoặc:

```powershell
& "$env:LOCALAPPDATA\Programs\Antigravity IDE\bin\antigravity-ide.cmd" 'D:\Project_UAV_KVC'
```

Trong panel Agent, mở **… → Customizations → Rules**, kiểm tra rule `kvc` là
Always On và mở đúng workspace. Nếu rule không hiển thị, trước tiên gắn
`@AGENTS.md` vào prompt; kiểm tra phiên bản IDE thay vì tạo thêm bản sao rules.
Không cho hai IDE cùng sửa một task. CLI review không chia sẻ hội thoại với IDE;
handoff là file và thông tin task, không dựa vào bộ nhớ giữa ứng dụng.

Tài liệu tham chiếu: [Google Antigravity Rules](https://antigravity.google/docs/rules/).

## 3. Task và kiểm thử trước review

Copy prompt sau vào CODER được chọn; điền đúng một owner, công cụ/phiên và phạm vi cụ thể:

```text
Đọc AGENTS.md. Bạn là MAIN CODER được chọn; nếu dùng DeepSeek, ghi riêng công cụ/phiên owner và model/provider.
Task ID: KVC-GCS-001
Scope: [một thay đổi nhỏ, nêu hành vi trước/sau]
Owner: [Codex / Antigravity / Kilo / công cụ-agent chạy DeepSeek — chọn đúng một]
Allowed files: [danh sách file được sửa, kể cả tests]
Acceptance criteria: [điều kiện quan sát được]
Tests: [lệnh và đầu vào/đầu ra kỳ vọng]
Status: IMPLEMENTING
Chỉ sửa allowed files. Build/test trước review. Ghi lệnh, exit code, kết quả
và giới hạn vào review/TEST_RESULTS.md. Không gọi Codex tự động.
Không tự đổi ABI đang dùng, baud/IRQ/CRC hoặc pinout. RF payload 32 byte
chỉ triển khai sau khi ABI được duyệt; Wi-Fi SoftAP/WebSocket v1 là baseline
thiết kế chưa kiểm chứng; USB48 thuộc kiến trúc cũ; source 20 byte là lịch sử.
Kết thúc với diff summary và status READY_FOR_REVIEW hoặc BLOCKED.
```

File evidence nên ngắn (script giới hạn 16 KB), đã loại secrets:

```text
Task: KVC-GCS-001
Code owner / author: [Codex / Antigravity / Kilo / công cụ-agent khác; UNKNOWN nếu chưa xác minh]
Model/provider: [DeepSeek nếu có; nếu không ghi model/provider đang dùng]
Review type: [INDEPENDENT REVIEW / SELF-REVIEW / AUTHOR UNKNOWN]
Revision / scope: ...
Command: ...
Exit code: ...
Result: PASS / FAIL / NOT RUN / BLOCKED
Log: review/test-...txt
Coverage: ...
Not run / reason: ...
Hardware evidence: NOT RUN (nếu chưa thử trên bo)
```

Không ghi PASS chỉ vì compiler không chạy. Với FPGA ưu tiên compile/testbench,
CDC/reset/FIFO/UART/IRQ rồi synthesis/timing khi có project và license. Firmware
cần project đúng chip/pack trước build. Python cần unit tests và FastAPI tests
không khởi động camera, serial hay model thật ngoài ý muốn.

Các lệnh dưới đây là kiểm tra có thể dùng; không có nghĩa đã chạy bộ test GCS:

```powershell
git diff --check
git diff --cached --check
# Kiểm tra cú pháp Python bằng AST, không import app, không tạo pyc:
python -c "import ast,pathlib; fs=list(pathlib.Path('gcs/backend').glob('*.py')); [ast.parse(p.read_text(encoding='utf-8-sig'), filename=str(p)) for p in fs]; print('Syntax OK:', len(fs), 'files')"
# Chỉ dùng sau khi owner tạo tests và cài dependency cần thiết:
# python -m pytest gcs/backend/tests -q
# iverilog -g2012 -s tb_uart -o review/uart.vvp <rtl files> <testbench>
# vvp review/uart.vvp
```

Các công cụ trong `scripts/manual/` (ví dụ `run_webcam.py`), script firewall/SSH và `run_dashboard.bat` không phải
unit test an toàn mặc định; chúng có thể mở camera, model, mạng hoặc đổi hệ thống.
Setup không chạy chúng. Frontend hiện có Vitest/Oxlint/TypeScript/Vite qua package.json; dùng npm test, npm run lint, npm run typecheck và npm run build. Backend có pytest; test adapter dùng boxes giả, không cần nạp model.

## 4. Chạy review đầu tiên

Đã kiểm tra `codex --help`, `codex review --help`, `codex exec --help` và
`codex exec review --help` của 0.154.0. `review` hỗ trợ non-interactive, nhưng
không có bộ lọc file/path. Để loại artifacts và review module chính xác, wrapper
chuẩn bị diff rồi gửi qua stdin cho **`codex exec`**, dùng:

```text
exec --ignore-user-config --sandbox read-only --disable multi_agent
     --disable multi_agent_v2 --ephemeral --color never
     -o <final-message-file> -
```

`--ignore-user-config` áp dụng riêng lượt chạy, không sửa config cá nhân; các
tùy chỉnh model/provider trong config cá nhân sẽ không được dùng. Authentication
vẫn do CLI quản lý. Không chọn model trả phí cụ thể hay bật auto-approval.
Nếu CLI/provider/sandbox không chạy được, dừng và chẩn đoán; không thêm cờ bỏ qua
quyền. Tham khảo [OpenAI non-interactive mode](https://learn.chatgpt.com/docs/non-interactive-mode)
và [sandbox](https://learn.chatgpt.com/docs/security).

Kiểm tra đăng nhập trong terminal của bạn; không gửi token vào chat/log:

```powershell
codex --version
codex login status
# Chỉ khi chưa đăng nhập:
codex login
```

Nếu terminal khác không tìm được CLI, mở lại terminal và kiểm tra
`Get-Command codex -All`. Máy này có CLI riêng tại
`%LOCALAPPDATA%\Programs\OpenAI\Codex\bin\codex.exe`, ngoài bản đi kèm extension.
Nếu một máy khác chưa cài: người dùng chủ động cài theo
[OpenAI CLI](https://developers.openai.com/codex/cli/), chẳng hạn
`npm install -g @openai/codex`, rồi `codex login`; setup không tự cài toàn hệ thống.

**Bước miễn phí trong setup — không gọi AI:**

```powershell
pwsh -NoProfile -File .\scripts\kvc-review.ps1 -Uncommitted -Paths gcs/backend/schemas.py -TaskId KVC-GCS-001 -DryRun
```

Ở snapshot setup chưa có baseline, ví dụ này coi schemas.py là file mới hoàn toàn; hiện baseline đã có nên dry-run phải xét diff thực tế.
Baseline hiện đã có; người dùng kiểm Source Control trong VS Code, chỉ stage những file đã xem. Không stage
weights, báo cáo review, secret hoặc artifacts. Không cần baseline để dry-run.

**Sau khi CODER hoàn thành task và evidence**, người dùng yêu cầu một lượt:

```powershell
pwsh -NoProfile -File .\scripts\kvc-review.ps1 -Uncommitted -Paths gcs/backend/schemas.py -TaskId KVC-GCS-001 -VerificationFile review/TEST_RESULTS.md
Get-Content .\review\CODEX_REVIEW.md
```

Sau khi có commit do người dùng tạo, có thể chọn đúng commit:

```powershell
pwsh -NoProfile -File .\scripts\kvc-review.ps1 -Commit HEAD -TaskId KVC-GCS-002 -DryRun
# Thay SHA_THAT bằng SHA thực từ git log; không dùng nguyên placeholder:
pwsh -NoProfile -File .\scripts\kvc-review.ps1 -Commit SHA_THAT -TaskId KVC-GCS-002 -VerificationFile review/TEST_RESULTS.md
```

Gọi từ PowerShell để truyền nhiều paths bằng mảng:

```powershell
& .\scripts\kvc-review.ps1 -Uncommitted -Paths @('gcs/backend/schemas.py','gcs/backend/state.py') -TaskId KVC-GCS-003 -DryRun
```

Script resolve SHA thật, hỗ trợ commit đầu tiên và detached HEAD, từ chối merge
commit để tránh scope mơ hồ. Uncommitted gồm staged, unstaged riêng biệt và
untracked không ignored. Những thay đổi staged/unstaged triệt tiêu nhau vẫn
được trình bày riêng; reviewer phải xét kết quả tổng hợp.

Scope chỉ nhận path tương đối literal. Giới hạn 40 file/200 KB diff; quá giới hạn
thì dừng, không cắt mất nội dung. File binary, weights, build outputs, `review/`
và tên file credential bị loại cả khi đã tracked. `.gitignore` không tự loại
file đã tracked; đây là lý do script có bộ lọc riêng. Bộ lọc tên không phải ranh
giới bảo mật toàn bộ filesystem; sandbox chỉ đọc vẫn cho phép đọc context, nên
không để secrets trong source. Scanner nội dung chỉ là lớp hỗ trợ, có thể báo
nhầm và không phát hiện mọi secret. Xem metadata scope trước khi chạy thật.

Output có thời gian +07:00, task, branch, HEAD/commit SHA, danh sách file và hash
diff. Script chỉ lưu final message, không in raw CLI stderr/stdout để tránh lộ
thông tin nhạy cảm. Báo cáo cũ được lưu thành `review/<id>.previous.md` trước
lượt mới. Lỗi CLI tạo status FAILED; file RUNNING/FAILED/STALE không được coi là
review hoàn tất. Exit 0 = wrapper hoàn tất, **không có nghĩa không có P0/P1/P2**;
exit 1 = lỗi; exit 2 = diff thay đổi trong lúc review. Không sửa code song song
khi review. Với commit cũ, reviewer được yêu cầu đọc context qua `git show SHA:path`.

## 5. Chọn bên sửa và xác minh finding

Review của Codex chỉ đọc. Sau report có finding, nếu chưa được chọn FIX OWNER,
Codex hỏi người dùng chọn một CODER có quyền workspace. Nếu chọn model DeepSeek,
handoff phải nêu rõ công cụ/phiên chạy model đó; trong phiên Kilo thì Kilo vẫn là owner.
Không cần hỏi lại nếu người dùng đã chọn cho cùng task/scope; vẫn giữ review
report trước khi sửa. No-findings không đồng nghĩa đã an toàn/nghiệm thu.

### 5.1. Người dùng chọn Codex sửa

```text
Task: [Task ID đã review]. Chọn Codex làm FIX OWNER.
Dùng allowed files, acceptance và tests của task gốc; chỉ sửa findings đã giao.
Antigravity dừng sửa các file này. Giữ Task ID và lịch sử review.
Đọc report COMPLETE/SHA/hash/scope/evidence, đối chiếu source hiện tại;
nếu source đã đổi thì xác minh lại finding trước khi sửa, không dùng report STALE.
Với từng finding ghi ACCEPTED/FIXED/DISPUTED kèm bằng chứng.
Sửa tối thiểu, bổ sung regression test và chạy lại compiler/tests.
Ghi review/<Task ID>/FIX_RESPONSE.md, TEST_RESULTS.md và log.
Không tự gọi review tiếp, commit/push/merge/deploy/flash. Bàn giao người dùng xem.
```

Codex tự kiểm lại bản sửa ghi SELF-REVIEW/verification, không gọi đó là review độc lập.
Tự kiểm compiler/regression test trong task fix không phải một lượt AI review CLI mới.

### 5.2. Người dùng chọn coder khác phiên hiện tại sửa

Codex chuẩn bị prompt dưới đây, điền Task ID, finding IDs, danh sách allowed files
literal, report/hash, owner/công cụ/phiên và tests thật; không tự gọi công cụ bên ngoài.

```text
Đọc AGENTS.md. Task: [Task ID đã review]. Owner sửa: [Antigravity / Kilo / công cụ-agent chạy DeepSeek].
Model/provider: [DeepSeek nếu có; với phiên Kilo ghi Kilo là owner].
Scope: [finding IDs người dùng chọn]. Allowed files: [literal files của task].
Codex đã dừng writer trước khi bàn giao. Giữ Task ID và lịch sử review.
Đọc [report path], [test evidence], [task manifest]; xác minh COMPLETE/SHA/hash/scope.
Với từng finding đối chiếu source/test/datasheet, ghi ACCEPTED/FIXED/DISPUTED.
Sửa tối thiểu trong scope, bổ sung regression test và chạy lại tests.
Ghi review/<Task ID>/FIX_RESPONSE.md và TEST_RESULTS.md với lệnh/exit code/log/giới hạn.
Không tự gọi Codex review tiếp, commit/push/merge/deploy/flash.
Kết thúc READY_FOR_REVIEW hoặc BLOCKED, để người dùng xem và quyết định.
```

Người dùng xem FIX_RESPONSE, TEST_RESULTS, log và diff. Chỉ khi người dùng yêu cầu
lượt review thứ hai cho lỗi nghiêm trọng còn cần kiểm, dùng **cùng TaskId**
với `-FollowUp`, đúng phạm vi và evidence mới. Không tự gọi lại vì đã fix.
Script chặn hash trùng và lượt thứ ba. Chuyển owner không reset ledger/quota.

Ledger `review/<TaskId>.state.json` đếm cả lần đã bắt đầu nhưng lỗi. Không đổi
TaskId/xóa ledger để lách giới hạn. Khi đổi worktree, bàn giao task và lịch sử review;
ledger cục bộ không phải quota toàn tài khoản.

## 6. Branch, worktree, conflict và rollback

Sau baseline commit do người dùng tạo, tạo branch cho một task:

```powershell
git status --short
git switch -c task/KVC-GCS-001
git worktree list
```

Tùy chọn worktree cho coder khác (chỉ dùng sau khi có HEAD và đường dẫn chưa có):

```powershell
git worktree add -b task/KVC-FPGA-001 ..\KVC-FPGA-001 main
```

Commit các file setup được người dùng kiểm tra trước khi tạo worktree để rules
và script đi theo. Không chia một task cho hai owner, không cho hai worktree dùng
cùng branch. Không tự merge vào main. Review bản chưa commit trong đúng worktree
của owner; worktree khác không nhìn thấy thay đổi chưa commit.

Khi conflict: dừng AI writer, chạy `git status`, xem từng conflict trong editor,
giao một owner giải quyết theo giao thức đã chốt, rồi chạy lại tests. Không dùng
`reset --hard`, `clean -fd` hoặc tự chấp nhận toàn bộ ours/theirs.

Rollback: trước hết copy file chưa commit ra bản backup cục bộ ngoài scope review
và xem diff. Chỉ người dùng mới quyết định khôi phục từng file bằng Source Control.
Với commit đã chia sẻ, cân nhắc `git revert <SHA>` trong phiên riêng có phê duyệt;
lệnh này tạo commit mới, **setup không thực hiện**. Chưa có baseline thì Git không
thể phục hồi nội dung ban đầu: cần backup hoặc lịch sử editor.

## 7. Các điểm kỹ thuật ghi nhận tại setup 11/10 — cần kiểm lại khi triển khai

| Điểm | Bằng chứng khảo sát setup 11/10 / việc còn thiếu tại thời điểm đó |
|---|---|
| Telemetry | Source `packet_decoder.py` có PACKET_SIZE=20, big-endian, float32, CRC poly 0x1021/init 0xFFFF. Thiết kế đề xuất v1 32 byte; chưa migration/test liên thiết bị |
| UART/IRQ | Thiết kế yêu cầu đo trước khi nâng 921600 bps; chưa có RTL/firmware để xác minh baud, FIFO/ring buffer, DATA_READY semantics và DMA |
| Camera/DDR3/GoAI | Thiết kế nêu rủi ro DVP so với IMX219 MIPI, IP và DDR3; chưa có bring-up, conversion/operator report hay LUT/BRAM/DSP/timing report |
| AI | File weights có tồn tại; chưa xác minh ONNX operators, calibration, INT8 accuracy, throughput hay FPS trên FPGA |
| MCU/FPU/georef | Chưa xác minh đúng DFP SN34F788, registers, FPU/compiler ABI, thời gian xử lý, đồng bộ cảm biến và sai số WGS-84 trên bo |
| LoRa/GCS | Ghi nhận setup 11/10 mô tả SX1278 qua MCU trạm đất và CP2102/USB tới PC. Cấu hình này đã được thay thế trong kiến trúc 15/10 bằng ESP32 nguồn riêng và Wi-Fi SoftAP/WebSocket tới dịch vụ GCS trên laptop; chưa xác minh ingress, mất gói/CRC/timeout hay khoảng cách RF. |
| GCS | Source có FastAPI/WebSocket/serial/parser; chưa chạy test lifecycle, reconnect, validity, GIS hoặc lưu trữ. Không thấy tích hợp SQLite qua import khảo sát |

Task setup không sửa README/source. Task tài liệu KVC-DOC-21D-001 ngày 12/10 đã đồng bộ README/DEMO/analysis với kế hoạch; inventory 14/10 không còn docs/archive, nên không cung cấp liên kết tới các bản cũ không có trên đĩa.

## 8. Giới hạn tự động hóa và kiểm chứng setup

Không bật AutoFix, hook theo file/task, CI gọi AI, scheduler hay vòng agent gọi
nhau. Phase 2 chỉ nghiên cứu sau khi Phase 1 đã chạy thật ổn định và người dùng
yêu cầu; phải kiểm tra CLI Antigravity thực tế và không giả định chia sẻ session.

Tiết kiệm token: owner dùng compiler/tests trước, gom lỗi hợp lệ vào một lượt,
chọn một module/commit nhỏ, không gửi lại toàn bộ tài liệu, không review code
không đổi, không multi-agent mặc định, tối đa hai lượt/task rồi dừng.
200 KB là giới hạn dữ liệu đầu vào, **không phải cam kết giới hạn token/chi phí**.

Kết quả validation setup được ghi tại `review/SETUP_VALIDATION.txt`. Các test dùng
repository giả ở TEMP; chỉ tạo commit dữ liệu giả ở đó. Tại thời điểm setup, repository KVC chưa
có commit; trạng thái ngày 12/10 chưa được kiểm lại bằng Git. `review/validate-setup.ps1` là artifact kiểm tra cục bộ, không auto-run.
Checksum của 47 file ban đầu được so với manifest TEMP để xác nhận không đổi
source. Không gọi AI review, không chạy synthesis/firmware/board, không chứng
minh login/inference/sandbox end-to-end. Lần review có chi phí đầu tiên chỉ chạy
khi người dùng cần review task thật.
