"""Bounded, non-blocking SQLite event logger with a dedicated writer thread."""

from __future__ import annotations

import json
import queue
import re
import sqlite3
import threading
from concurrent.futures import Future
from dataclasses import dataclass
from datetime import datetime, timezone
from pathlib import Path
from typing import Any


SCHEMA_SQL = """
CREATE TABLE IF NOT EXISTS telemetry_records (
    record_id INTEGER PRIMARY KEY AUTOINCREMENT,
    session_id TEXT NOT NULL,
    pc_rx_monotonic_ms INTEGER NOT NULL,
    pc_rx_iso TEXT NOT NULL,
    source_mode TEXT NOT NULL,
    raw_envelope_hex TEXT,
    rf_payload_hex TEXT,
    is_valid INTEGER NOT NULL CHECK (is_valid IN (0, 1)),
    reject_reason TEXT,
    packet_type INTEGER,
    sender_session_id INTEGER,
    sequence_number INTEGER,
    track_id INTEGER,
    local_x_cm REAL,
    local_y_cm REAL,
    confidence INTEGER,
    class_id INTEGER,
    flags_hex TEXT,
    parsed_json TEXT NOT NULL,
    persisted_at_iso TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_records_time ON telemetry_records(pc_rx_monotonic_ms);
CREATE INDEX IF NOT EXISTS idx_records_session ON telemetry_records(session_id);
"""

INSERT_SQL = """
INSERT INTO telemetry_records (
    session_id, pc_rx_monotonic_ms, pc_rx_iso, source_mode,
    raw_envelope_hex, rf_payload_hex, is_valid, reject_reason, packet_type,
    sender_session_id, sequence_number, track_id, local_x_cm, local_y_cm,
    confidence, class_id, flags_hex, parsed_json, persisted_at_iso
) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
"""

_SAFE_SESSION = re.compile(r"^[A-Za-z0-9][A-Za-z0-9._-]{0,127}$")
_PACKET_TYPES = {
    "TELEMETRY_UPDATE": 1,
    "TARGET_UPDATE": 2,
    "LINK_STATUS": 3,
    "SYSTEM_DIAGNOSTICS": 3,
    "ALERT_EVENT": 3,
    "SNAPSHOT": 3,
}


def utc_now() -> str:
    return datetime.now(timezone.utc).isoformat(timespec="milliseconds").replace("+00:00", "Z")


@dataclass(frozen=True)
class CommitResult:
    committed: bool
    record_id: int | None
    reason: str | None = None


@dataclass
class LogRequest:
    storage_session_id: str
    values: tuple[Any, ...]
    ticket: Future


class SQLiteLogger:
    """Owns all write connections on one thread; producers only use put_nowait."""

    def __init__(self, storage_dir: Path, queue_capacity: int = 1024):
        self.storage_dir = Path(storage_dir)
        self.queue_capacity = queue_capacity
        self._queue: queue.Queue[LogRequest] = queue.Queue(maxsize=queue_capacity)
        self._thread: threading.Thread | None = None
        self._stop = threading.Event()
        self._ready = threading.Event()
        self._lock = threading.Lock()
        self._connection_lock = threading.Lock()
        self._connection: sqlite3.Connection | None = None
        self._sessions: dict[str, dict[str, Any]] = {}
        self._status = "LOG_DEGRADED"
        self._last_error: str | None = None
        self._accepted_to_memory = 0
        self._committed = 0
        self._rejected_committed = 0
        self._drops = 0
        self._write_errors = 0
        self._high_water = 0
        self._inflight = 0

    @staticmethod
    def _validate_session_id(session_id: str) -> str:
        if not _SAFE_SESSION.fullmatch(session_id) or session_id in {".", ".."}:
            raise ValueError("Unsafe logger session_id")
        return session_id

    def _db_path(self, session_id: str) -> Path:
        return self.storage_dir / f"{self._validate_session_id(session_id)}.db"

    def start(self, timeout: float = 5.0) -> None:
        if self._thread is not None:
            raise RuntimeError("Logger already started")
        self._thread = threading.Thread(target=self._run, name="kvc-sqlite-writer", daemon=True)
        self._thread.start()
        if not self._ready.wait(timeout):
            self._set_storage_error("Logger writer startup timeout")
            raise TimeoutError("Logger writer startup timeout")

    def _set_storage_error(self, message: str) -> None:
        with self._lock:
            self._status = "STORAGE_ERROR"
            self._last_error = message

    def _discover_sessions(self) -> None:
        self.storage_dir.mkdir(parents=True, exist_ok=True)
        for path in self.storage_dir.glob("*.db"):
            session_id = path.stem
            if not _SAFE_SESSION.fullmatch(session_id):
                continue
            connection = self._open(path)
            try:
                row = connection.execute(
                    "SELECT COUNT(*), COALESCE(MAX(persisted_at_iso), '') FROM telemetry_records"
                ).fetchone()
                self._sessions[session_id] = {
                    "session_id": session_id,
                    "file": path.name,
                    "records": int(row[0]),
                    "size_bytes": path.stat().st_size,
                    "last_persisted_at_iso": row[1] or None,
                }
            finally:
                connection.close()

    @staticmethod
    def _open(path: Path) -> sqlite3.Connection:
        connection = sqlite3.connect(path, timeout=1.0)
        mode = connection.execute("PRAGMA journal_mode=WAL").fetchone()[0]
        connection.execute("PRAGMA synchronous=FULL")
        synchronous = connection.execute("PRAGMA synchronous").fetchone()[0]
        if str(mode).lower() != "wal" or synchronous != 2:
            connection.close()
            raise sqlite3.OperationalError("Required WAL/FULL pragmas were not applied")
        connection.executescript(SCHEMA_SQL)
        connection.commit()
        return connection

    def _run(self) -> None:
        current_session: str | None = None
        connection: sqlite3.Connection | None = None
        try:
            try:
                self._discover_sessions()
                with self._lock:
                    self._status = "OK"
                    self._last_error = None
            except Exception as exc:  # surfaced through status; producers stay non-blocking
                self._set_storage_error(f"{type(exc).__name__}: {exc}")
            finally:
                self._ready.set()

            while not self._stop.is_set() or not self._queue.empty():
                try:
                    request = self._queue.get(timeout=0.05)
                except queue.Empty:
                    continue
                with self._lock:
                    self._inflight += 1
                try:
                    if current_session != request.storage_session_id or connection is None:
                        if connection is not None:
                            connection.close()
                        current_session = request.storage_session_id
                        connection = self._open(self._db_path(current_session))
                        with self._connection_lock:
                            self._connection = connection
                    cursor = connection.execute(INSERT_SQL, request.values)
                    connection.commit()
                    persisted_at = request.values[-1]
                    path = self._db_path(current_session)
                    with self._lock:
                        self._committed += 1
                        if request.values[6] == 0:
                            self._rejected_committed += 1
                        previous = self._sessions.get(current_session, {})
                        self._sessions[current_session] = {
                            "session_id": current_session,
                            "file": path.name,
                            "records": int(previous.get("records", 0)) + 1,
                            "size_bytes": path.stat().st_size,
                            "last_persisted_at_iso": persisted_at,
                        }
                        if self._status != "STORAGE_ERROR" and self._drops == 0:
                            self._status = "OK"
                    request.ticket.set_result(CommitResult(True, int(cursor.lastrowid)))
                except Exception as exc:
                    if connection is not None:
                        try:
                            connection.rollback()
                        except sqlite3.Error:
                            pass
                    with self._lock:
                        self._write_errors += 1
                        self._drops += 1
                    self._set_storage_error(f"{type(exc).__name__}: {exc}")
                    request.ticket.set_result(CommitResult(False, None, str(exc)))
                    if connection is not None:
                        connection.close()
                    connection = None
                    current_session = None
                    with self._connection_lock:
                        self._connection = None
                finally:
                    with self._lock:
                        self._inflight -= 1
                    self._queue.task_done()
        finally:
            if connection is not None:
                connection.close()
            with self._connection_lock:
                self._connection = None
            self._ready.set()

    def enqueue(
        self,
        payload: dict[str, Any],
        *,
        storage_session_id: str,
        is_valid: bool,
        reject_reason: str | None = None,
        raw_envelope_hex: str | None = None,
        rf_payload_hex: str | None = None,
    ) -> Future:
        """Attempt one RAM enqueue. The returned ticket resolves only after commit/failure."""
        ticket: Future = Future()
        try:
            safe_session = self._validate_session_id(storage_session_id)
            parsed_json = json.dumps(
                payload, ensure_ascii=False, sort_keys=True, separators=(",", ":"), allow_nan=False
            )
            target = payload.get("target") if isinstance(payload.get("target"), dict) else {}
            original_source = payload.get("original_source_mode") or payload.get("source_mode") or "UNKNOWN"
            values = (
                safe_session,
                int(payload.get("pc_rx_monotonic_ms") or 0),
                str(payload.get("pc_rx_time_iso") or utc_now()),
                str(original_source),
                raw_envelope_hex,
                rf_payload_hex,
                int(is_valid),
                reject_reason,
                _PACKET_TYPES.get(payload.get("event_type")),
                payload.get("sender_session_id"),
                payload.get("sequence_number"),
                target.get("track_id"),
                target.get("local_x_cm"),
                target.get("local_y_cm"),
                target.get("confidence"),
                target.get("class_id"),
                payload.get("flags_hex"),
                parsed_json,
                utc_now(),
            )
            request = LogRequest(safe_session, values, ticket)
            if self._thread is None or not self._thread.is_alive() or self._stop.is_set():
                raise RuntimeError("Logger writer unavailable")
            self._queue.put_nowait(request)
            with self._lock:
                self._accepted_to_memory += 1
                self._high_water = max(self._high_water, self._queue.qsize())
        except (queue.Full, ValueError, TypeError, OverflowError, RuntimeError) as exc:
            reason = "logger queue full" if isinstance(exc, queue.Full) else str(exc)
            with self._lock:
                self._drops += 1
                if self._status != "STORAGE_ERROR":
                    self._status = "LOG_DEGRADED"
                self._last_error = f"{type(exc).__name__}: {reason}"
            ticket.set_result(CommitResult(False, None, reason))
        return ticket

    def stop(self, timeout: float = 5.0) -> bool:
        """Flush queued work. If the deadline is missed, report remaining items as drops."""
        if self._thread is None:
            return True
        self._stop.set()
        self._thread.join(timeout)
        if self._thread.is_alive():
            with self._connection_lock:
                if self._connection is not None:
                    self._connection.interrupt()
            self._thread.join(min(timeout, 1.0))
        if self._thread.is_alive():
            remaining = self._queue.qsize()
            with self._lock:
                self._drops += remaining + self._inflight
            self._set_storage_error("Logger shutdown deadline exceeded")
            return False
        return True

    def sessions(self) -> list[dict[str, Any]]:
        with self._lock:
            return [dict(item) for _, item in sorted(self._sessions.items())]

    def status(self) -> dict[str, Any]:
        with self._lock:
            return {
                "status": self._status,
                "last_error": self._last_error,
                "accepted_to_memory_total": self._accepted_to_memory,
                "committed_total": self._committed,
                "rejected_committed_total": self._rejected_committed,
                "drops_total": self._drops,
                "write_errors_total": self._write_errors,
                "queue_capacity": self.queue_capacity,
                "queue_depth": self._queue.qsize(),
                "queue_high_water": self._high_water,
                "inflight": self._inflight,
                "writer_running": self._thread is not None and self._thread.is_alive(),
            }
