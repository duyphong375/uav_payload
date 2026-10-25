"""SQLite logger unit/API coverage; all databases live under pytest tmp_path."""

import json
import sqlite3
import threading

from fastapi.testclient import TestClient
import pytest

from gcs.backend.config import Settings
from gcs.backend.main import create_app
from gcs.backend.mock_source import target
from gcs.backend.sqlite_logger import SQLiteLogger


def event(sequence=1, session_id="SES-LOGGER-001"):
    return {
        "event_type": "TARGET_UPDATE",
        "schema_version": "1.0.0",
        "session_id": session_id,
        "source_mode": "MOCK",
        "original_source_mode": "MOCK",
        "inference_device": "SIMULATED",
        "sender_session_id": None,
        "ground_session_id": None,
        "sequence_number": sequence,
        "pc_rx_time_iso": "2026-10-14T00:00:00.000Z",
        "pc_rx_monotonic_ms": sequence * 10,
        "device_measurement_time_ms": None,
        "measurement_age_ms": None,
        "rx_age_ms": 0,
        "is_stale": False,
        "telemetry_age_ms": None,
        "target_age_ms": 0,
        "camera_age_ms": None,
        "has_target": True,
        "target": target(1),
    }


def test_wal_full_commit_ack_accept_reject_and_reopen(tmp_path):
    logger = SQLiteLogger(tmp_path, queue_capacity=4)
    logger.start()
    accepted = logger.enqueue(event(), storage_session_id="SES-LOGGER-001", is_valid=True)
    rejected_payload = {**event(2), "source_mode": "INVALID", "original_source_mode": "MOCK"}
    rejected = logger.enqueue(
        rejected_payload,
        storage_session_id="SES-LOGGER-001",
        is_valid=False,
        reject_reason="ValidationError: unsupported source_mode",
    )
    assert accepted.result(3).committed
    assert rejected.result(3).committed
    assert logger.stop()

    path = tmp_path / "SES-LOGGER-001.db"
    connection = sqlite3.connect(path)
    try:
        assert connection.execute("PRAGMA journal_mode").fetchone()[0].lower() == "wal"
        assert connection.execute("PRAGMA synchronous").fetchone()[0] == 2
        assert connection.execute("PRAGMA integrity_check").fetchone()[0] == "ok"
        rows = connection.execute(
            "SELECT source_mode, raw_envelope_hex, rf_payload_hex, is_valid, "
            "reject_reason, parsed_json FROM telemetry_records ORDER BY record_id"
        ).fetchall()
    finally:
        connection.close()
    assert len(rows) == 2
    assert rows[0][:5] == ("MOCK", None, None, 1, None)
    assert rows[1][0:4] == ("MOCK", None, None, 0)
    assert rows[1][4].startswith("ValidationError")
    assert json.loads(rows[1][5])["source_mode"] == "INVALID"

    reopened = SQLiteLogger(tmp_path)
    reopened.start()
    assert reopened.sessions()[0]["records"] == 2
    assert reopened.status()["committed_total"] == 0  # current process only
    assert reopened.stop()


def test_bounded_queue_overflow_count_is_exact(tmp_path):
    logger = SQLiteLogger(tmp_path, queue_capacity=1)
    original_open = logger._open
    entered = threading.Event()
    release = threading.Event()

    def blocked_open(path):
        entered.set()
        assert release.wait(3)
        return original_open(path)

    logger._open = blocked_open
    logger.start()
    first = logger.enqueue(event(1), storage_session_id="SES-LOGGER-001", is_valid=True)
    assert entered.wait(2)
    second = logger.enqueue(event(2), storage_session_id="SES-LOGGER-001", is_valid=True)
    overflow = logger.enqueue(event(3), storage_session_id="SES-LOGGER-001", is_valid=True)
    assert overflow.result(1).committed is False
    assert "full" in overflow.result().reason.lower()
    release.set()
    assert first.result(3).committed and second.result(3).committed
    status = logger.status()
    assert status["accepted_to_memory_total"] == 2
    assert status["committed_total"] == 2
    assert status["drops_total"] == 1
    assert status["queue_high_water"] == 1
    assert status["status"] == "LOG_DEGRADED"
    assert logger.stop()


def test_shutdown_flushes_every_accepted_record(tmp_path):
    logger = SQLiteLogger(tmp_path, queue_capacity=8)
    logger.start()
    tickets = [
        logger.enqueue(event(sequence), storage_session_id="SES-FLUSH-001", is_valid=True)
        for sequence in range(1, 7)
    ]
    assert logger.stop(timeout=5)
    assert all(ticket.done() and ticket.result().committed for ticket in tickets)
    status = logger.status()
    assert status["accepted_to_memory_total"] == status["committed_total"] == 6
    assert status["drops_total"] == 0
    assert not status["writer_running"]


def test_permission_error_does_not_hang_websocket(tmp_path, monkeypatch):
    def denied(*_args, **_kwargs):
        raise sqlite3.OperationalError("attempt to write a readonly database")

    monkeypatch.setattr("gcs.backend.sqlite_logger.sqlite3.connect", denied)
    app = create_app(Settings(enable_mock=False, storage_dir=tmp_path))
    with TestClient(app) as client:
        assert client.get("/api/health").json()["status"] == "ok"
        with client.websocket_connect("/ws/telemetry") as ws:
            assert ws.receive_json()["event_type"] == "SNAPSHOT"

            async def publish():
                return app.state.hub.publish("TARGET_UPDATE", target=target(1), has_target=True)

            sent = client.portal.call(publish)
            assert ws.receive_json()["sequence_number"] == sent["sequence_number"]
        commit = app.state.hub.last_log_ticket.result(3)
        assert commit.committed is False
        status = client.get("/api/status").json()
        assert status["diagnostics"]["logger_status"] == "STORAGE_ERROR"
        assert status["diagnostics"]["logger_drops_total"] == 1
        assert status["logger"]["write_errors_total"] == 1
        assert client.get("/api/health").json()["status"] == "degraded"
    assert not app.state.logger.status()["writer_running"]


def test_rejected_application_event_is_committed_without_mutating_state(tmp_path):
    app = create_app(Settings(enable_mock=False, storage_dir=tmp_path))
    with TestClient(app) as client:
        session_id = app.state.hub.store.session_id
        before = app.state.hub.store.snapshot(app.state.hub.diagnostics())

        async def reject():
            app.state.hub.publish(
                "TARGET_UPDATE",
                target={"class_id": "1", "class_name": "person"},
                has_target=True,
            )

        with pytest.raises(ValueError):
            client.portal.call(reject)
        assert app.state.hub.last_log_ticket.result(3).committed
        after = app.state.hub.store.snapshot(app.state.hub.diagnostics())
        assert after["target"] == before["target"] is None
        assert after["has_target"] == before["has_target"] is False

    connection = sqlite3.connect(tmp_path / f"{session_id}.db")
    try:
        row = connection.execute(
            "SELECT is_valid, reject_reason, parsed_json FROM telemetry_records"
        ).fetchone()
    finally:
        connection.close()
    assert row[0] == 0
    assert "ValidationError" in row[1]
    assert json.loads(row[2])["target"]["class_id"] == "1"


def test_session_api_reports_ram_pending_then_committed(tmp_path):
    app = create_app(Settings(enable_mock=False, storage_dir=tmp_path))
    with TestClient(app) as client:
        old_session = client.get("/api/sessions").json()["active_session_id"]
        with client.websocket_connect("/ws/telemetry") as ws:
            assert ws.receive_json()["event_type"] == "SNAPSHOT"
            response = client.post("/api/sessions/new")
            assert response.status_code == 200
            created = response.json()
            assert created["persistence"] == "PENDING"
            assert created["new_session_id"] != old_session
            assert ws.receive_json()["session_id"] == created["new_session_id"]
        assert app.state.hub.last_log_ticket.result(3).committed
        sessions = client.get("/api/sessions").json()
        assert sessions["storage_implemented"] is True
        assert sessions["sessions"][0]["session_id"] == created["new_session_id"]
        status = client.get("/api/status").json()
        assert status["logger"]["accepted_to_memory_total"] == 1
        assert status["logger"]["committed_total"] == 1
        assert status["diagnostics"]["logger_status"] == "OK"
    assert not app.state.logger.status()["writer_running"]
