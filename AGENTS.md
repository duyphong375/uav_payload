# KVC — quy tắc AI

KVC là tải nhiệm vụ UAV tìm kiếm cứu nạn bão lũ, không phải flight controller.
Kiến trúc/kế hoạch: `docs/architecture/KVC_ThietKeHeThong.md`; mục tiêu trong tài liệu không
phải kết quả đo. Workflow: `docs/KVC_AI_WORKFLOW.md`.

## Quyền và phạm vi

- Codex, Antigravity và Kilo có thể làm CODER; model DeepSeek cũng có thể được dùng
  để code trong một phiên/công cụ coding có quyền workspace phù hợp. Owner được
  chọn theo từng task, không cố định theo model. DeepSeek là model: nếu chạy trong
  phiên Kilo thì ghi Kilo là owner và DeepSeek là model/provider; nếu chạy qua công
  cụ khác, task phải nêu rõ agent/công cụ có quyền workspace làm owner. Đổi
  model/provider tự nó không chuyển owner. Yêu cầu triển
  khai trong cuộc chat Codex mặc định giao Codex; Kilo mặc định là owner cho task
  phát sinh trong phiên Kilo, bất kể model/provider; nếu người dùng chỉ định một
  công cụ khác, phiên đang chat chuẩn bị handoff thay vì tự sửa.
- Codex có thêm vai trò REVIEWER. Khi chỉ được yêu cầu review/đánh giá/chẩn đoán:
  đọc source/diff/log và báo cáo; không tự sửa code. Nếu có finding cần xử lý,
  hỏi người dùng chọn một CODER đủ quyền làm FIX OWNER (Codex, Antigravity, Kilo,
  hoặc công cụ/agent coding chạy DeepSeek qua phiên được nêu rõ).
- Sau khi người dùng chọn bên sửa (hoặc đã chỉ định trước), bên đó là FIX OWNER,
  xác minh finding, sửa tối thiểu và kiểm thử; không hỏi lại cùng lựa chọn.
- Mỗi task chỉ có một owner được sửa code. Task phải nêu ID, scope, owner,
  allowed files, acceptance criteria, tests và status. Không sửa ngoài allowed files.
  Chuyển owner phải ghi handoff/evidence và dừng writer cũ trước khi writer mới sửa.
- Review code do Codex viết phải ghi SELF-REVIEW; code do owner khác viết có thể
  được Codex review độc lập. Không coi self-review hay test PASS là approval.
- Không tự thay đổi baud, packet layout, CRC, IRQ, pinout hay giao thức phần cứng.
  Source hiện có dùng telemetry 20 byte; 32 byte trong thiết kế là đề xuất.
- Không tự commit/push/merge/deploy/flash FPGA hay MCU. Không xóa thay đổi người
  dùng, sửa secrets hoặc bật bỏ qua sandbox/approval.
- Không mặc định AGENTS.md được mọi phiên bản IDE nạp giống nhau. Antigravity
  dùng adapter `.agents/rules/kvc.md`; đọc quy tắc chung này trước mỗi task.

## Workflow bắt buộc

1. CODER được chọn làm owner duy nhất implement trong scope được giao.
2. Owner chạy compiler/linter/testbench/tests phù hợp và `git diff --check`.
   Tool/project/test thiếu: ghi BLOCKED hoặc NOT RUN kèm lý do, không ghi PASS.
3. Người dùng yêu cầu Codex review commit/diff/module nhỏ; dùng
   `scripts/kvc-review.ps1 -DryRun` (PowerShell 7+) trước. Review chỉ đọc; không gọi AI để thử setup.
   Ghi author/owner và loại INDEPENDENT REVIEW, SELF-REVIEW hoặc AUTHOR UNKNOWN.
4. Nếu finding cần sửa: báo lỗi/bằng chứng/sửa tối thiểu rồi hỏi chọn FIX OWNER
   trong số các CODER có quyền workspace, trừ khi người dùng đã chọn cho đúng scope.
   Đợi lựa chọn trước khi sửa. Nếu chọn bên khác phiên hiện tại, cung cấp prompt
   handoff cụ thể, ghi rõ công cụ/phiên và model/provider nếu có.
5. FIX OWNER xác minh từng finding, ghi ACCEPTED/FIXED/DISPUTED, sửa trong
   allowed files và chạy lại test. Giữ cùng Task ID và lịch sử review khi chuyển owner.
6. Tối đa hai lượt review Codex/task; lượt hai chỉ khi người dùng yêu cầu cho
   lỗi nghiêm trọng còn cần kiểm tra. Không review diff không đổi, không tự gọi
   review tiếp. Sau đó dừng để HUMAN APPROVAL. Không bật Codex multi-agent;
   Antigravity chỉ dùng subagent khi thật cần và không trùng quyền sửa file.

## Chuẩn báo cáo

- P0: lỗi nghiêm trọng chặn toàn bộ, có bằng chứng trực tiếp về hỏng dữ liệu hoặc
  hành vi nguy hiểm, không dựa vào giả định chưa kiểm chứng.
- P1: bug lớn cần sửa trước tích hợp/chạy thật (mất frame, deadlock, sai tọa độ,
  race, vi phạm timing/giao thức có căn cứ).
- P2: bug có phạm vi hẹp hoặc điều kiện cụ thể, vẫn có tác động thực tế.
- Mỗi finding: ID, severity, path:line/vị trí, lỗi, nguyên nhân, bằng chứng
  code/test, điều kiện kích hoạt, rủi ro, sửa tối thiểu và phép xác minh.
- Không biến formatting/refactor theo sở thích thành bug. Nếu chưa đủ bằng
  chứng, ghi câu hỏi/giới hạn riêng. Không có finding không đồng nghĩa đã an toàn.
- Tests phải có lệnh, exit code, kết quả, log và giới hạn. Phân biệt DESIGN,
  SOURCE-VERIFIED, SIMULATED, BUILT/SYNTHESIZED, HARDWARE-VERIFIED.
- RTL: CDC/reset/FSM/FIFO/UART/IRQ/memory/timing/resources/synthesis/testbench.
  MCU: ISR/ring buffer/DMA/race/stack/heap/pointer/FPU/timeout/CRC/recovery.
  GCS: parser/WebSocket/disconnect/state/GIS/WGS-84. Không khẳng định FPS, khoảng
  cách LoRa, độ chính xác INT8 hay GoAI hỗ trợ YOLO11n khi chưa có phép đo.
- Không nạp weights/binary/build artifacts, secrets hay cả repository vào prompt.
  Đọc tài liệu/datasheet liên quan đúng phạm vi; không coi comment là bằng chứng
  phần cứng đã chạy. Review output và log nằm trong `review/` (local; Git ignored).
