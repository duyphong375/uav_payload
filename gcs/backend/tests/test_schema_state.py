import asyncio

import pytest
from pydantic import ValidationError

from gcs.backend.config import Settings
from gcs.backend.mock_source import step, target
from gcs.backend.schemas import Event
from gcs.backend.state import Hub, MissionStore


def test_strict_schema_and_domain_isolation():
    hub = Hub(MissionStore())
    for invalid in ("false", "0", 0, [], {}, None):
        with pytest.raises(ValidationError):
            hub.publish("TELEMETRY_UPDATE", telemetry={"gps_valid": invalid})
    for invalid in ("85", True, 101):
        with pytest.raises(ValidationError):
            hub.publish("TELEMETRY_UPDATE", telemetry={"battery_pct": invalid})
    with pytest.raises(ValidationError):
        hub.publish("LINK_STATUS", target=target(1))
    with pytest.raises(ValidationError):
        Event.model_validate({**hub.store.metadata("TARGET_UPDATE"), "source_mode": "REAL"})
    with pytest.raises(ValidationError):
        Event.model_validate({**hub.store.metadata("TARGET_UPDATE"), "inference_device": "FPGA_GW2A"})
    with pytest.raises(ValidationError):
        Event.model_validate({**hub.store.metadata("SNAPSHOT"), "telemetry": {}})


def test_patch_null_and_rejection_are_atomic():
    store = MissionStore()
    hub = Hub(store)
    hub.publish("TELEMETRY_UPDATE", telemetry={"battery_pct": 85, "lidar_valid": True, "lidar_range_cm": 240})
    hub.publish("TARGET_UPDATE", target=target(1), has_target=True)
    hub.publish("LINK_STATUS", hardware_link={"status": "DISCONNECTED"})
    hub.publish("ALERT_EVENT", alert={"code": "A", "level": "WARN", "message": "warning"})
    assert store.target["local_x_cm"] == 0
    assert store.telemetry["battery_pct"] == 85
    hub.publish("TELEMETRY_UPDATE", telemetry={"battery_pct": None})
    assert store.telemetry["battery_pct"] is None
    assert store.telemetry["lidar_range_cm"] == 240
    before = store.snapshot()
    with pytest.raises(ValueError):
        store.apply({**store.metadata("TARGET_UPDATE"), "target": {"pos_valid": True, "local_x_cm": None}})
    assert store.target == before["target"]
    hub.publish("TARGET_UPDATE", target=None)
    assert store.target is None
    hub.publish("TELEMETRY_UPDATE", telemetry=None)
    assert store.telemetry["lidar_valid"] is False
    assert store.telemetry["lidar_range_cm"] is None
    hub.publish("ALERT_EVENT", alert=None)
    assert not store.alerts


def test_freshness_uses_elapsed_clock_and_status_does_not_refresh_target():
    clock = [100.0]
    store = MissionStore(clock=lambda: clock[0])
    hub = Hub(store)
    hub.publish("TARGET_UPDATE", target=target(1))
    clock[0] += 3
    assert store.ages()["is_stale"] is False
    assert store.ages()["target_age_ms"] == 3000
    clock[0] += .001
    hub.publish("LINK_STATUS", hardware_link={"status": "DISCONNECTED"})
    assert store.ages()["is_stale"] is True
    assert store.ages()["target_age_ms"] == 3001
    clock[0] += 10
    assert store.ages()["target_age_ms"] == 13001
    hub.publish("TELEMETRY_UPDATE", telemetry={"battery_pct": 80})
    assert store.ages()["telemetry_age_ms"] == 0
    assert store.ages()["target_age_ms"] == 13001
    snapshot = store.snapshot()
    assert snapshot["target_age_ms"] == 13001


def test_alert_severity_recovery_and_new_session():
    store = MissionStore()
    hub = Hub(store)
    for level, message, condition in (("WARN", "warn", "ACTIVE"), ("CRITICAL", "critical", "ACTIVE"), ("INFO", "recovered", "RESOLVED"), ("WARN", "again", "ACTIVE")):
        hub.publish("ALERT_EVENT", alert={"level": level, "code": "A", "message": message, "condition_status": condition})
        assert len(store.alerts) == 1
        assert store.alerts["A"]["level"] == level
        assert store.alerts["A"]["condition_status"] == condition
    hub.publish("TARGET_UPDATE", target=target(1))
    old = store.session_id
    hub.rotate_session()
    assert old != store.session_id
    assert store.target is None and not store.alerts
    assert store.telemetry["battery_pct"] is None
    assert store.ages()["target_age_ms"] is None
    with pytest.raises(ValueError):
        store.apply({**store.metadata("LINK_STATUS"), "session_id": "foreign"})


def test_all_mock_scenarios_and_truthful_storage_hardware():
    hub = Hub(MissionStore())
    for phase in range(30):
        step(hub, phase)
        Event.model_validate(hub.store.snapshot(hub.diagnostics()))
    assert hub.store.hardware_link["status"] == "UNKNOWN"
    assert hub.diagnostics()["logger_status"] == "LOG_DEGRADED"
    assert hub.status()["storage_implemented"] is False
    assert hub.diagnostics()["packets_received_total"] == 0


def test_mock_cycle_person_lifebuoy_negative_invalid_recovery_new_session():
    hub = Hub(MissionStore())
    original_session = hub.store.session_id
    step(hub, 0)
    assert hub.store.target["class_id"] == 1
    assert hub.store.target["local_x_cm"] == 0.0
    assert hub.store.target["target_confirmed"] is False
    step(hub, 3)
    assert hub.store.target["class_id"] == 2
    step(hub, 6)
    assert hub.store.target is None
    assert hub.store.telemetry["ai_detected"] is False
    step(hub, 9)
    assert hub.store.telemetry["lidar_valid"] is False
    assert hub.store.telemetry["lidar_range_cm"] is None
    assert hub.store.target["pos_valid"] is False
    assert hub.store.target["local_x_cm"] is None
    step(hub, 11)
    assert hub.store.alerts["SENSOR_DEGRADED"]["level"] == "CRITICAL"
    step(hub, 15)
    assert hub.store.telemetry["lidar_valid"] is True
    assert hub.store.target["pos_valid"] is True
    assert hub.store.alerts["SENSOR_DEGRADED"]["condition_status"] == "RESOLVED"
    step(hub, 24)
    assert hub.store.session_id != original_session
    assert hub.store.target is None and not hub.store.alerts
    assert hub.store.telemetry["battery_pct"] is None


def test_bounded_queue_overflow_only_evicts_slow_client():
    async def run():
        hub = Hub(MissionStore(Settings(queue_capacity=2)))
        slow, fast = hub.subscribe(), hub.subscribe()
        assert (await fast.queue.get())["event_type"] == "SNAPSHOT"
        for _ in range(3):
            hub.publish("LINK_STATUS", hardware_link={"status": "UNKNOWN"})
            assert (await fast.queue.get())["event_type"] == "LINK_STATUS"
        assert slow.queue.qsize() == 2
        assert slow.stopped.is_set() and slow.close_code == 1008
        assert not fast.stopped.is_set()
        assert hub.client_drops == 3
        assert hub.diagnostics()["data_loss_latched"] is True
        assert hub.queue_high_water == 2
    asyncio.run(run())
