"""Deterministic MOCK scenarios paced by actual elapsed monotonic time."""

import asyncio


def target(class_id, invalid=False):
    return {
        "track_id": None, "class_id": class_id,
        "class_name": "person" if class_id == 1 else "lifebuoy", "confidence": 92,
        "target_confirmed": False, "pos_valid": not invalid,
        "coordinate_frame": "LOCAL_GRID", "local_x_cm": None if invalid else 0.0,
        "local_y_cm": None if invalid else 125.0, "latitude": None, "longitude": None,
        "origin_id": 1,
    }


def step(hub, phase):
    """30-second cycle, including a 5-second data silence and a clean new session."""
    if phase == 0:
        hub.publish("TELEMETRY_UPDATE", telemetry={
            "battery_pct": 85, "lidar_range_cm": 240, "gps_valid": False,
            "lidar_valid": True, "imu_valid": True, "ai_detected": True,
            "packet_rssi_dbm": None, "packet_snr_db": None,
        })
        hub.publish("TARGET_UPDATE", has_target=True, target=target(1))
    elif phase == 3:
        hub.publish("TARGET_UPDATE", has_target=True, target=target(2))
    elif phase == 6:
        hub.publish("TARGET_UPDATE", has_target=False, target=None)
        hub.publish("TELEMETRY_UPDATE", telemetry={"ai_detected": False})
    elif phase == 9:
        hub.publish("TELEMETRY_UPDATE", telemetry={"lidar_valid": False, "imu_valid": False, "lidar_range_cm": None})
        hub.publish("TARGET_UPDATE", has_target=True, target=target(1, invalid=True))
        hub.publish("ALERT_EVENT", alert={"level": "WARN", "code": "SENSOR_DEGRADED", "message": "MOCK sensors invalid"})
    elif phase == 11:
        hub.publish("ALERT_EVENT", alert={"level": "CRITICAL", "code": "SENSOR_DEGRADED", "message": "MOCK sensors remain invalid"})
    elif phase == 15:
        hub.publish("TELEMETRY_UPDATE", telemetry={"lidar_valid": True, "imu_valid": True, "lidar_range_cm": 240})
        hub.publish("TARGET_UPDATE", has_target=True, target=target(1))
        hub.publish("ALERT_EVENT", alert={"level": "INFO", "code": "SENSOR_DEGRADED", "message": "MOCK sensor recovery", "condition_status": "RESOLVED"})
    elif phase == 24:
        hub.rotate_session()
    hub.publish("LINK_STATUS", hardware_link={"status": "UNKNOWN"})
    if phase % 2 == 0:
        hub.publish("SYSTEM_DIAGNOSTICS", diagnostics=hub.diagnostics())


async def run_mock(hub):
    clock = hub.store.clock
    interval = hub.store.settings.mock_interval_sec
    next_tick = clock()
    tick = 0
    while True:
        await asyncio.sleep(max(0, next_tick - clock()))
        try:
            step(hub, tick % 30)
        except Exception:
            hub.mock_errors += 1
            raise
        tick += 1
        # No catch-up burst when the event loop was delayed.
        next_tick = max(next_tick + interval, clock())
