# KVC Application Backend (Mock & ESP32 Ingress)

Dịch vụ Backend GCS tiếp nhận dữ liệu đo xa Telemetry và trạng thái mục tiêu UAV. Hệ thống hỗ trợ hai nguồn dữ liệu:
1. **Chế độ Giả lập (MOCK):** Tự sinh kịch bản chu kỳ phục vụ kiểm thử đơn vị, giao diện và chức năng phát lại (Replay Engine).
2. **Chế độ Thu nhận Thực tế (ESP32 Ingress):** Module `esp32_ingress.py` kết nối trực tiếp vào WebSocket Server của Gateway ESP32 (`ws://<IP>:8080/telemetry`), tiếp nhận Transport Envelope v1, thẩm định và giải mã khung nhị phân 32-byte Little-Endian (`RfTelemetryPacket32`), trích xuất tọa độ GPS, cự ly siêu âm mặt nước, góc nghiêng IMU (Roll/Pitch từ 4 byte reserved), cờ cảnh báo cảm biến và phát sự kiện vào Hub thời gian thực. Bật chế độ này bằng biến môi trường `$env:KVC_ENABLE_ESP32="true"`.

From repository root (Windows PowerShell):

```powershell
python -m venv .venv
.venv/Scripts/python.exe -m pip install -r gcs/backend/requirements.txt
.venv/Scripts/python.exe -m Dashboard.backend.main
```

Default server: `127.0.0.1:8000`. Use one process/worker: application state and client queues are in memory; accepted records are durable only after the logger commit counter/ticket acknowledges them. Runtime databases default to `data/sessions/<session_id>.db`. The module does not start tasks during import; FastAPI lifespan owns the generator, SQLite writer and shutdown. CORS/browser WS origins allow only localhost/127.0.0.1 port 5173. This is a local development service, not a remotely exposed service.

Endpoints:

- GET `/api/health`: liveness, source and monotonic uptime.
- GET `/api/status`: hardware link, logger RAM/commit/drop/error counters, mock counters, queue depths/high-water and task state.
- GET `/api/state/snapshot`: full accumulated application snapshot with domain ages and all retained alerts.
- GET `/api/sessions`: active application session and committed SQLite session summaries.
- POST `/api/sessions/new`: rotate application state/session and enqueue its full snapshot; response persistence is `PENDING`, never a durable-success claim.
- POST `/api/replay/start`: body `{ "session_id": "SES-...", "speed": 0.5|1|2 }`; stop MOCK generation, open only that committed SQLite session read-only and broadcast a full REPLAY snapshot before patches.
- POST `/api/replay/pause` and `/api/replay/resume`: freeze/resume the application virtual clock. Resume is an application control, not a hardware command.
- POST `/api/replay/seek`: body `{ "timestamp_ms": 0 }`; clamp to the session duration, clear accumulated state and rebuild from the first record through the requested relative timestamp.
- POST `/api/replay/speed`: body `{ "speed": 0.5|1|2 }`; change application playback rate without discontinuity. It is not a hardware command.
- POST `/api/replay/stop`: cancel the replay task, broadcast a clean MOCK snapshot and restart the configured MOCK generator. Replay target/camera/alerts are not retained under a live label.
- WS `/ws/telemetry`: read-only JSON stream, full snapshot first, then event patches. Client commands are rejected with 1008.

Replay time is relative to the first committed `pc_rx_monotonic_ms` in the selected session. A paused replay position and its telemetry/target/camera ages do not advance with host wall time. Seek in either direction reconstructs state deterministically, so fields from records later than the seek point cannot survive. Replay uses a new `SES-REPLAY-*` application session; `source_session_id` identifies the recorded session. The logger path is disabled for replay publishes, therefore playback is not re-acquired or mislabeled as a new REAL/MOCK record. The injected hardware boundary is never invoked; tests assert zero open/read/write calls. These are host application properties, not hardware verification.

Each client has its own queue, at most 64 pending messages. Overflow or a send taking longer than 1 second closes only that client with 1008; discarded pending/new messages are counted and loss is latched. Reconnect after 2 seconds receives current state. A slow client's send is never awaited by broadcast or another client. Frame-local mock observations have no persistent track identity and are unconfirmed.

The logger has a separate bounded queue of at most 1024 records and one dedicated SQLite writer thread. `Hub.publish` uses only `put_nowait`; disk I/O never sits in the WS/ingress event loop. SQLite applies `journal_mode=WAL` and `synchronous=FULL` on each writer connection. `accepted_to_memory_total` counts successful RAM enqueue, while `committed_total` increments only after COMMIT. Queue overflow reports `LOG_DEGRADED`; open/write failures report `STORAGE_ERROR`; both increment `logger_drops_total` and latch data loss. Shutdown drains the queue within five seconds or reports remaining/in-flight work as drops.

Each record stores the application session, receive clocks, original source, validation outcome/reject reason and canonical parsed JSON. MOCK has no hardware byte capture, so `raw_envelope_hex` and `rf_payload_hex` remain SQL `NULL`. Rejected application events are logged without mutating mission state. The logger schema follows section 5.1 of `docs/interfaces/KVC_GCS_DATA_CONTRACT.md`. Section 7 describes the current MOCK/logger/replay application implementation.

The generator repeats a 30-second scenario: person → lifebuoy → negative → invalid sensors → severity escalation → delayed data/stale → sensor recovery → new session. It does not synthesize camera coordinates or RF measurements. Status events continue during data silence and do not refresh telemetry/target age. A generated new session starts a new database file when its snapshot reaches the writer.

Frontend: set the public build-time setting `VITE_MOCK_TRANSPORT=BACKEND` while keeping source mode MOCK. `LOCAL` is the default and uses the existing in-browser generator. BACKEND never starts the local generator or falls back when the socket fails. Run Vite on port 5173. No local `.env` is written by this task; PowerShell example:

```powershell
$env:VITE_MOCK_TRANSPORT='BACKEND'
Set-Location gcs/frontend
npm run dev -- --host 127.0.0.1 --port 5173
```

Validation from repository root:

```powershell
.venv/Scripts/python.exe -B -m pytest gcs/backend/tests -q -p no:cacheprovider
.venv/Scripts/python.exe -B -m Dashboard.backend.tests.test_api_websocket
.venv/Scripts/python.exe -u -B -m Dashboard.backend.tests.test_api_websocket --soak
```

The last command runs 1800 seconds with real loopback TCP clients. The loopback harness disables durable storage; logger tests create databases only in pytest-managed temporary directories. Same-process RSS includes server, both clients and harness, providing a conservative combined memory figure. Thresholds are declared in the task before the run; stdout should be captured only under its review directory. Unit tests use injected clocks only for boundary semantics; the soak uses real monotonic time.

Application patch/null/session examples: `docs/interfaces/KVC_GCS_DATA_CONTRACT.md` section 7; SQLite columns and PRAGMAs: section 5.1. The recovery test terminates only its known child PID after five commit ACKs and then reopens/integrity-checks that temporary database. This is host process-crash evidence, not proof against physical power loss. Serial/parser/hardware remain separate tasks. SOURCE-VERIFIED and SIMULATED/loopback evidence do not establish hardware verification.
