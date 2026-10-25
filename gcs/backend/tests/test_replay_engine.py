"""Replay virtual-clock, seek, API/session isolation and hardware-boundary tests."""

import asyncio
import sqlite3
from unittest.mock import Mock

from fastapi.testclient import TestClient

from gcs.backend.config import Settings
from gcs.backend.main import create_app
from gcs.backend.replay_engine import ReplayEngine
from gcs.backend.sqlite_logger import SQLiteLogger
from gcs.backend.state import Hub, MissionStore


class FakeClock:
    def __init__(self):
        self.value = 0.0

    def __call__(self):
        return self.value

    def advance(self, seconds):
        self.value += seconds


def base_event(session_id, event_type, timestamp_ms, sequence, **domains):
    return {
        "event_type": event_type,
        "schema_version": "1.0.0",
        "session_id": session_id,
        "source_mode": "MOCK",
        "original_source_mode": "REAL",
        "inference_device": "PC_REFERENCE",
        "sender_session_id": None,
        "ground_session_id": None,
        "sequence_number": sequence,
        "pc_rx_time_iso": f"2026-10-14T00:00:{sequence:02d}.000Z",
        "pc_rx_monotonic_ms": timestamp_ms,
        "device_measurement_time_ms": None,
        "measurement_age_ms": None,
        "rx_age_ms": 0,
        "is_stale": False,
        **domains,
    }


def fixture_events(session_id="SES-REPLAY-FIXTURE"):
    telemetry = {
        "battery_pct": 90, "lidar_range_cm": 240, "gps_valid": True,
        "lidar_valid": True, "imu_valid": True, "ai_detected": False,
        "packet_rssi_dbm": None, "packet_snr_db": None,
        "roll_deg": None, "pitch_deg": None,
    }
    diagnostics = {
        "packets_received_total": 1, "decode_errors_total": 0,
        "ingress_drops_total": 0, "logger_drops_total": 0,
        "client_drops_total": 0, "data_loss_latched": False,
        "logger_status": "OK",
    }
    return [
        base_event(
            session_id, "SNAPSHOT", 10_000, 1,
            telemetry=telemetry, target=None, has_target=False,
            hardware_link={"status": "UNKNOWN", "port": None, "error_message": None},
            diagnostics=diagnostics, alerts=[], camera_position=None,
            bounding_boxes=[], replay_metadata=None,
            telemetry_age_ms=0, target_age_ms=None, camera_age_ms=None,
        ),
        base_event(
            session_id, "TARGET_UPDATE", 11_000, 2, has_target=True,
            target={
                "track_id": None, "class_id": 1, "class_name": "person",
                "confidence": 92, "target_confirmed": False, "pos_valid": True,
                "coordinate_frame": "LOCAL_GRID", "local_x_cm": 0.0,
                "local_y_cm": 125.0, "latitude": None, "longitude": None,
                "origin_id": 1,
            }, bounding_boxes=[],
        ),
        base_event(
            session_id, "TELEMETRY_UPDATE", 12_000, 3,
            telemetry={"battery_pct": 80},
            camera_position={
                "latitude": 16.0, "longitude": 108.0, "altitude_m": 20.0,
                "altitude_reference": "MSL", "heading_deg": 90.0,
                "is_valid": True, "last_updated_iso": "2026-10-14T00:00:03.000Z",
                "age_ms": 0,
            }, bounding_boxes=[],
        ),
        base_event(
            session_id, "ALERT_EVENT", 13_000, 4,
            alert={
                "level": "WARN", "code": "FUTURE_ALERT", "message": "Future warning",
                "condition_status": "ACTIVE",
            },
        ),
        base_event(
            session_id, "TARGET_UPDATE", 14_000, 5,
            target=None, has_target=False, bounding_boxes=[],
        ),
        base_event(
            session_id, "TELEMETRY_UPDATE", 15_000, 6,
            camera_position=None, bounding_boxes=[],
        ),
    ]


def write_fixture(storage_dir, session_id="SES-REPLAY-FIXTURE"):
    logger = SQLiteLogger(storage_dir, queue_capacity=16)
    logger.start()
    tickets = [
        logger.enqueue(payload, storage_session_id=session_id, is_valid=True)
        for payload in fixture_events(session_id)
    ]
    assert all(ticket.result(3).committed for ticket in tickets)
    assert logger.stop()
    return storage_dir / f"{session_id}.db"


def record_count(path):
    connection = sqlite3.connect(path)
    try:
        return connection.execute("SELECT COUNT(*) FROM telemetry_records").fetchone()[0]
    finally:
        connection.close()


def test_fake_clock_speed_pause_seek_and_no_hardware_or_relogging(tmp_path):
    path = write_fixture(tmp_path)
    before = record_count(path)
    clock = FakeClock()
    hardware = Mock()

    async def run():
        settings = Settings(enable_mock=False, storage_dir=tmp_path)
        hub = Hub(MissionStore(settings))
        engine = ReplayEngine(hub, tmp_path, clock=clock, hardware=hardware)
        snapshot = await engine.start("SES-REPLAY-FIXTURE", 2.0, background=False)
        assert snapshot["source_mode"] == "REPLAY"
        assert snapshot["original_source_mode"] == "REAL"
        assert snapshot["inference_device"] == "PC_REFERENCE"
        assert snapshot["session_id"].startswith("SES-REPLAY-")
        assert hub.store.target is None

        clock.advance(0.5)  # 2x => virtual +1000 ms
        metadata = await engine.advance()
        assert metadata["position_ms"] == 1000
        assert hub.store.target["class_name"] == "person"

        await engine.pause()
        paused_position = engine.position_ms
        paused_target_age = hub.store.ages()["target_age_ms"]
        clock.advance(10)
        await engine.advance()
        assert engine.position_ms == paused_position
        assert hub.store.ages()["target_age_ms"] == paused_target_age

        await engine.set_speed(0.5)
        await engine.resume()
        clock.advance(2)
        await engine.advance()
        assert engine.position_ms == 2000
        assert hub.store.camera_position["is_valid"] is True

        forward = await engine.seek(3500)
        assert forward["position_ms"] == 3500
        assert hub.store.target is not None
        assert hub.store.camera_position is not None
        assert "FUTURE_ALERT" in hub.store.alerts

        backward = await engine.seek(500)
        assert backward["position_ms"] == 500
        assert hub.store.target is None
        assert hub.store.camera_position is None
        assert hub.store.alerts == {}
        assert hub.store.bounding_boxes == []

        await engine.set_speed(1.0)
        clock.advance(0.5)  # 1x => virtual 500 ms from the backward seek point
        one_x = await engine.advance()
        assert one_x["position_ms"] == 1000
        assert hub.store.target["class_name"] == "person"
        await engine.stop()

    asyncio.run(run())
    assert record_count(path) == before
    hardware.open.assert_not_called()
    hardware.read.assert_not_called()
    hardware.write.assert_not_called()


def test_session_isolation_and_unsafe_name_rejected(tmp_path):
    write_fixture(tmp_path, "SES-A")
    write_fixture(tmp_path, "SES-B")
    clock = FakeClock()

    async def run():
        hub = Hub(MissionStore(Settings(enable_mock=False, storage_dir=tmp_path)))
        engine = ReplayEngine(hub, tmp_path, clock=clock)
        await engine.start("SES-A", background=False)
        assert engine.source_session_id == "SES-A"
        assert all(record.payload["session_id"] == "SES-A" for record in engine.records)
        await engine.stop()
        try:
            await engine.start("../SES-B", background=False)
        except ValueError as exc:
            assert "Unsafe" in str(exc)
        else:
            raise AssertionError("unsafe session_id accepted")

    asyncio.run(run())


def test_replay_api_controls_ws_reset_and_selected_log_unchanged(tmp_path):
    path = write_fixture(tmp_path)
    before = record_count(path)
    hardware = Mock()
    app = create_app(
        Settings(enable_mock=False, storage_dir=tmp_path),
        hardware=hardware,
    )
    with TestClient(app) as client:
        preflight = client.options(
            "/api/replay/start",
            headers={
                "Origin": "http://127.0.0.1:5173",
                "Access-Control-Request-Method": "POST",
                "Access-Control-Request-Headers": "content-type",
            },
        )
        assert preflight.status_code == 200
        assert "content-type" in preflight.headers["access-control-allow-headers"].lower()
        with client.websocket_connect("/ws/telemetry") as ws:
            assert ws.receive_json()["source_mode"] == "MOCK"
            started = client.post(
                "/api/replay/start",
                json={"session_id": "SES-REPLAY-FIXTURE", "speed": 1.0},
            )
            assert started.status_code == 200
            replay_snapshot = ws.receive_json()
            assert replay_snapshot["event_type"] == "SNAPSHOT"
            assert replay_snapshot["source_mode"] == "REPLAY"
            assert client.get("/api/health").json()["source_mode"] == "REPLAY"
            assert client.post("/api/sessions/new").status_code == 409
            assert client.post("/api/replay/pause").json()["status"] == "replay_paused"
            assert client.post("/api/replay/seek", json={"timestamp_ms": 3500}).json()["status"] == "seek_ok"
            assert client.post("/api/replay/speed", json={"speed": 2.0}).json()["status"] == "speed_ok"
            assert client.post("/api/replay/resume").json()["status"] == "replay_resumed"
            stopped = client.post("/api/replay/stop")
            assert stopped.json()["source_mode"] == "MOCK"
            for _ in range(10):
                item = ws.receive_json()
                if item["event_type"] == "SNAPSHOT" and item["source_mode"] == "MOCK":
                    break
            else:
                raise AssertionError("stop did not broadcast a clean live snapshot")
        assert client.get("/api/status").json()["replay"]["active"] is False
    assert record_count(path) == before
    hardware.open.assert_not_called()
    hardware.read.assert_not_called()
    hardware.write.assert_not_called()


if __name__ == "__main__":  # Explicit, isolated harness for the optional browser smoke.
    import argparse
    from pathlib import Path

    import uvicorn

    parser = argparse.ArgumentParser(description="Serve the replay fixture on loopback only")
    parser.add_argument("--serve-smoke", type=Path, required=True)
    parser.add_argument("--port", type=int, default=8000)
    args = parser.parse_args()
    args.serve_smoke.mkdir(parents=True, exist_ok=True)
    write_fixture(args.serve_smoke)
    smoke_app = create_app(Settings(
        host="127.0.0.1", port=args.port, enable_mock=False,
        storage_dir=args.serve_smoke,
    ))
    uvicorn.run(smoke_app, host="127.0.0.1", port=args.port, log_level="warning")


def test_replay_preserves_recorded_snapshot_ages_on_start_and_seek(tmp_path):
    session_id = "SES-SNAPSHOT-AGES"
    events = fixture_events(session_id)
    events[0].update(telemetry_age_ms=5000, rx_age_ms=6000, is_stale=True)
    logger = SQLiteLogger(tmp_path)
    logger.start()
    try:
        for event in events:
            assert logger.enqueue(event, storage_session_id=session_id, is_valid=True).result(3).committed
    finally:
        assert logger.stop()

    async def run():
        hub = Hub(MissionStore(Settings(enable_mock=False, storage_dir=tmp_path)))
        engine = ReplayEngine(hub, tmp_path, clock=FakeClock())
        try:
            snapshot = await engine.start(session_id, background=False)
            assert snapshot["telemetry_age_ms"] == 5000
            assert snapshot["rx_age_ms"] == 6000
            assert snapshot["is_stale"] is True
            assert snapshot["target_age_ms"] is None
            assert snapshot["camera_age_ms"] is None
            await engine.seek(250)
            assert hub.store.ages()["telemetry_age_ms"] == 5250
            assert hub.store.ages()["rx_age_ms"] == 6250
            assert hub.store.ages()["is_stale"] is True
        finally:
            await engine.stop()

    asyncio.run(run())
