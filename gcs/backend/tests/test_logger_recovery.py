"""Process-crash recovery evidence; this is not a physical power-loss test."""

import json
import sqlite3
import subprocess
import sys
from pathlib import Path


def test_reopen_after_terminating_only_owned_writer_process(tmp_path):
    root = Path(__file__).resolve().parents[3]
    child_code = r'''
import json, os, sys, time
from pathlib import Path
from gcs.backend.sqlite_logger import SQLiteLogger

storage = Path(sys.argv[1])
session = "SES-CRASH-001"
logger = SQLiteLogger(storage, queue_capacity=8)
logger.start()
for sequence in range(1, 6):
    payload = {
        "event_type": "SYSTEM_DIAGNOSTICS", "session_id": session,
        "source_mode": "MOCK", "original_source_mode": "MOCK",
        "sequence_number": sequence,
        "pc_rx_time_iso": "2026-10-14T00:00:00.000Z",
        "pc_rx_monotonic_ms": sequence,
        "sender_session_id": None,
    }
    result = logger.enqueue(payload, storage_session_id=session, is_valid=True).result(5)
    assert result.committed
print(json.dumps({"pid": os.getpid(), "acked_commits": 5}), flush=True)
time.sleep(120)
'''
    process = subprocess.Popen(
        [sys._base_executable, "-u", "-c", child_code, str(tmp_path)],
        cwd=root,
        stdout=subprocess.PIPE,
        stderr=subprocess.PIPE,
        text=True,
    )
    try:
        line = process.stdout.readline()
        if not line:
            raise AssertionError(process.stderr.read())
        announced = json.loads(line)
        assert announced == {"pid": process.pid, "acked_commits": 5}
        process.terminate()  # exact Popen child created by this test; no process-name kill
        process.wait(timeout=10)
    finally:
        if process.poll() is None:
            process.kill()
            process.wait(timeout=10)

    path = tmp_path / "SES-CRASH-001.db"
    connection = sqlite3.connect(path)
    try:
        assert connection.execute("PRAGMA journal_mode").fetchone()[0].lower() == "wal"
        assert connection.execute("PRAGMA integrity_check").fetchone()[0] == "ok"
        count = connection.execute("SELECT COUNT(*) FROM telemetry_records").fetchone()[0]
        sequences = [row[0] for row in connection.execute(
            "SELECT sequence_number FROM telemetry_records ORDER BY record_id"
        )]
    finally:
        connection.close()
    assert count == 5
    assert sequences == [1, 2, 3, 4, 5]
