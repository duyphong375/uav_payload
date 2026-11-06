"""Unit tests cho hệ thống cảnh báo KVC (Alert Engine)."""

import pytest
from gcs.backend.alerts import THRESHOLDS, ImuTiltHandler, evaluate_telemetry_alerts
from gcs.backend.esp32_ingress import inject_envelope
from gcs.backend.state import Hub, MissionStore


def test_alert_thresholds_definition():
    """Kiểm tra Phần 1: các ngưỡng cảnh báo phải có giá trị số hợp lệ và logic."""
    # IMU thresholds
    assert 0 < THRESHOLDS.IMU_RECOVERY_ROLL_DEG < THRESHOLDS.IMU_ROLL_WARN_DEG < THRESHOLDS.IMU_ROLL_CRIT_DEG
    assert 0 < THRESHOLDS.IMU_RECOVERY_PITCH_DEG < THRESHOLDS.IMU_PITCH_WARN_DEG < THRESHOLDS.IMU_PITCH_CRIT_DEG
    assert THRESHOLDS.IMU_ROLL_WARN_DEG == 30.0
    assert THRESHOLDS.IMU_ROLL_CRIT_DEG == 45.0
    assert THRESHOLDS.IMU_PITCH_WARN_DEG == 25.0
    assert THRESHOLDS.IMU_PITCH_CRIT_DEG == 40.0

    # LiDAR thresholds
    assert 0 < THRESHOLDS.LIDAR_DANGER_CRIT_CM < THRESHOLDS.LIDAR_WARN_LOW_CM < THRESHOLDS.LIDAR_RECOVERY_CM

    # RF thresholds
    assert THRESHOLDS.RF_RSSI_CRIT_DBM < THRESHOLDS.RF_RSSI_WARN_DBM < THRESHOLDS.RF_RSSI_RECOVERY_DBM


def test_imu_tilt_handler_normal():
    """Góc nghiêng bình thường trong ngưỡng an toàn -> không có cảnh báo."""
    res = ImuTiltHandler.evaluate(roll_deg=10.0, pitch_deg=-5.0, imu_valid=True)
    assert res is None


def test_imu_tilt_handler_invalid_flag():
    """Cờ IMU báo False -> không đánh giá góc nghiêng vật lý giả."""
    res = ImuTiltHandler.evaluate(roll_deg=60.0, pitch_deg=-50.0, imu_valid=False)
    assert res is None


def test_imu_tilt_handler_warning_roll_and_pitch():
    """Kiểm tra kích hoạt cảnh báo cấp độ WARN kèm phân tích hướng nghiêng."""
    # Nghiêng phải
    res_right = ImuTiltHandler.evaluate(roll_deg=32.5, pitch_deg=5.0, imu_valid=True)
    assert res_right is not None
    assert res_right["code"] == "IMU_EXCESSIVE_TILT"
    assert res_right["level"] == "WARN"
    assert res_right["condition_status"] == "ACTIVE"
    assert "nghiêng phải Roll=+32.5°" in res_right["message"]

    # Nghiêng trái và chúi mũi
    res_left = ImuTiltHandler.evaluate(roll_deg=-35.0, pitch_deg=-26.0, imu_valid=True)
    assert res_left is not None
    assert res_left["level"] == "WARN"
    assert "nghiêng trái Roll=-35.0°" in res_left["message"]
    assert "chúi mũi Pitch=-26.0°" in res_left["message"]


def test_imu_tilt_handler_critical_escalation():
    """Kiểm tra kích hoạt cảnh báo nguy hiểm CRITICAL khi vượt ngưỡng lật."""
    # Roll vượt 45°
    res_crit_roll = ImuTiltHandler.evaluate(roll_deg=-47.8, pitch_deg=10.0, imu_valid=True)
    assert res_crit_roll is not None
    assert res_crit_roll["level"] == "CRITICAL"
    assert "nghiêng trái Roll=-47.8°" in res_crit_roll["message"]
    assert "Nguy cơ lật tải" in res_crit_roll["message"]

    # Pitch vượt 40° (ngửa mũi quá mức)
    res_crit_pitch = ImuTiltHandler.evaluate(roll_deg=10.0, pitch_deg=42.0, imu_valid=True)
    assert res_crit_pitch is not None
    assert res_crit_pitch["level"] == "CRITICAL"
    assert "ngửa mũi Pitch=+42.0°" in res_crit_pitch["message"]


def test_imu_tilt_handler_recovery_hysteresis():
    """Kiểm tra logic hồi phục với hysteresis (tránh flapping)."""
    # 1. Đang có cảnh báo WARN
    active_alert = {
        "code": "IMU_EXCESSIVE_TILT",
        "level": "WARN",
        "condition_status": "ACTIVE",
    }

    # Góc giảm xuống 25° (dưới ngưỡng 30° nhưng chưa dưới ngưỡng recovery 20°)
    res_still_active = ImuTiltHandler.evaluate(
        roll_deg=25.0, pitch_deg=5.0, imu_valid=True, current_alert=active_alert
    )
    # Không phát sự kiện hồi phục sớm (giữ nguyên để tránh flapping)
    assert res_still_active is None

    # Góc giảm sâu về 15.0° và 5.0° (dưới ngưỡng recovery 20° và 18°)
    res_recovered = ImuTiltHandler.evaluate(
        roll_deg=15.0, pitch_deg=5.0, imu_valid=True, current_alert=active_alert
    )
    assert res_recovered is not None
    assert res_recovered["code"] == "IMU_EXCESSIVE_TILT"
    assert res_recovered["level"] == "INFO"
    assert res_recovered["condition_status"] == "RESOLVED"
    assert "đã ổn định an toàn" in res_recovered["message"]


def test_evaluate_telemetry_alerts_comprehensive():
    """Kiểm tra Phần 3: phát hiện sự kiện toàn diện trên telemetry."""
    telem = {
        "roll_deg": 35.0,
        "pitch_deg": 10.0,
        "imu_valid": True,
        "lidar_range_cm": 180,  # 1.8m < 2.0m -> LIDAR_DANGER_LOW CRITICAL
        "lidar_valid": True,
        "packet_rssi_dbm": -118, # <= -115 -> RF_LINK_WEAK CRITICAL
    }
    active_alerts = {}

    events = evaluate_telemetry_alerts(telem, active_alerts)
    event_codes = {e["code"] for e in events}
    assert "IMU_EXCESSIVE_TILT" in event_codes
    assert "LIDAR_DANGER_LOW" in event_codes
    assert "RF_LINK_WEAK" in event_codes

    # Kiểm tra chi tiết sự kiện cự ly nước nguy hiểm
    lidar_evt = next(e for e in events if e["code"] == "LIDAR_DANGER_LOW")
    assert lidar_evt["level"] == "CRITICAL"
    assert "1.80 m" in lidar_evt["message"]


def test_ingress_telemetry_triggers_imu_tilt_alert():
    """Kiểm tra tích hợp: khi Ingress nhận telemetry có Roll vượt ngưỡng, tự động phát ALERT_EVENT."""
    from gcs.backend.esp32_ingress import crc16_ccitt_false
    import struct

    store = MissionStore()
    hub = Hub(store)

    # reserved: roll = +48.0° (480), pitch = -5.0° (-50)
    reserved = struct.pack("<hh", 480, -50)
    # flags=0x0E (gps_valid=1, lidar_valid=1, imu_valid=1)
    body = struct.pack(
        "<2sBBIIIhhHBBBB4s",
        b"\xaa\x55", 1, 1, 3000,
        107723450, 1066578900,
        0, 0, 300, 1, 95,
        0x0E, 126, reserved,
    )
    raw = body + struct.pack("<H", crc16_ccitt_false(body))

    inject_envelope(hub, {"rf_payload_hex": raw.hex()})

    # Cảnh báo IMU_EXCESSIVE_TILT phải được tự động kích hoạt trong store.alerts!
    assert "IMU_EXCESSIVE_TILT" in hub.store.alerts
    tilt_alert = hub.store.alerts["IMU_EXCESSIVE_TILT"]
    assert tilt_alert["level"] == "CRITICAL"
    assert "Roll=+48.0°" in tilt_alert["message"]
    assert tilt_alert["condition_status"] == "ACTIVE"


def test_evaluate_telemetry_alerts_lifebuoy_detected():
    """Kiểm tra Phần 3: phát hiện phao cứu sinh (class_id=2) kích hoạt TARGET_LIFEBUOY_DETECTED."""
    telem = {"imu_valid": True, "lidar_valid": True, "roll_deg": 0.0, "pitch_deg": 0.0}
    target = {"class_id": 2, "class_name": "lifebuoy", "confidence": 92}
    active_alerts = {}

    # 1. Phát hiện mục tiêu phao cứu sinh lần đầu
    events = evaluate_telemetry_alerts(telem, active_alerts, target=target, has_target=True)
    assert len(events) == 1
    buoy_evt = events[0]
    assert buoy_evt["code"] == "TARGET_LIFEBUOY_DETECTED"
    assert buoy_evt["level"] == "WARN"
    assert buoy_evt["condition_status"] == "ACTIVE"
    assert "Phao cứu sinh (Lifebuoy)" in buoy_evt["message"]
    assert "92%" in buoy_evt["message"]

    # 2. Frame tiếp theo vẫn có phao: không spam event mới vì đã active
    active_alerts["TARGET_LIFEBUOY_DETECTED"] = buoy_evt
    events_repeat = evaluate_telemetry_alerts(telem, active_alerts, target=target, has_target=True)
    assert len(events_repeat) == 0

    # 3. Mục tiêu ra khỏi khung hình (has_target=False) -> Hồi phục RESOLVED
    events_resolved = evaluate_telemetry_alerts(telem, active_alerts, target=None, has_target=False)
    assert len(events_resolved) == 1
    res_evt = events_resolved[0]
    assert res_evt["code"] == "TARGET_LIFEBUOY_DETECTED"
    assert res_evt["level"] == "INFO"
    assert res_evt["condition_status"] == "RESOLVED"


def test_ingress_telemetry_triggers_lifebuoy_alert():
    """Kiểm tra tích hợp: khi Ingress nhận gói LoRa chứa class_id=2 (phao), tự động kích hoạt cảnh báo."""
    from gcs.backend.esp32_ingress import crc16_ccitt_false
    import struct

    store = MissionStore()
    hub = Hub(store)

    reserved = b"\x00\x00\x00\x00"
    # class_id=2 (lifebuoy), confidence=88%, flags=0x0F (GPS, LiDAR, IMU, AI detected)
    body = struct.pack(
        "<2sBBIIIhhHBBBB4s",
        b"\xaa\x55", 1, 2, 4000,
        160751000, 1081512000,
        100, 200, 250, 2, 88,
        0x0F, 126, reserved,
    )
    raw = body + struct.pack("<H", crc16_ccitt_false(body))

    inject_envelope(hub, {"rf_payload_hex": raw.hex()})

    assert "TARGET_LIFEBUOY_DETECTED" in hub.store.alerts
    buoy_alert = hub.store.alerts["TARGET_LIFEBUOY_DETECTED"]
    assert buoy_alert["level"] == "WARN"
    assert buoy_alert["condition_status"] == "ACTIVE"
    assert "Phao cứu sinh (Lifebuoy)" in buoy_alert["message"]
