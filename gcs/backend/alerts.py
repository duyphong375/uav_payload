"""
KVC SAR UAV - Hệ thống phát hiện và quản lý cảnh báo kỹ thuật (Alert Engine)
=============================================================================
Hệ thống giám sát an toàn cho tải nhiệm vụ UAV tìm kiếm cứu nạn bão lũ.

Logic được phân tách thành 3 phần rõ ràng:
1. PHẦN 1: XÁC ĐỊNH NGƯỠNG CẢNH BÁO (Alert Thresholds & Configuration)
2. PHẦN 2: XỬ LÝ TRƯỜNG HỢP IMU BỊ NGHIÊNG QUÁ MỨC (Excessive IMU Tilt Handler)
3. PHẦN 3: LOGIC PHÁT HIỆN SỰ KIỆN TOÀN DIỆN (Telemetry Event Detector)

Quy định hợp đồng dữ liệu:
- Mọi cảnh báo phát sinh tuân thủ schema `Alert` (code, level, message, condition_status).
- Hỗ trợ hysteresis (độ trễ hồi phục) để tránh hiện tượng rung giật / flapping liên tục.
"""

from dataclasses import dataclass
from typing import Any, Literal


# ============================================================================
# PHẦN 1: XÁC ĐỊNH NGƯỠNG CẢNH BÁO (Alert Thresholds & Configuration)
# ============================================================================

@dataclass(frozen=True)
class AlertThresholds:
    """Định nghĩa toàn bộ ngưỡng số liệu, cửa sổ hysteresis và tham số kích hoạt."""

    # --- 1.1 Ngưỡng góc nghiêng IMU GY-87 (Độ) ---
    # UAV cứu nạn bay quét mặt nước thường có góc roll/pitch trong khoảng +/-15°.
    IMU_ROLL_WARN_DEG: float = 30.0        # Roll >= 30°: Cảnh báo nghiêng ngang bất thường (WARN)
    IMU_PITCH_WARN_DEG: float = 25.0       # Pitch >= 25°: Cảnh báo chúi/ngửa mũi bất thường (WARN)
    IMU_ROLL_CRIT_DEG: float = 45.0        # Roll >= 45°: Nguy cơ lật hoặc mất thăng bằng (CRITICAL)
    IMU_PITCH_CRIT_DEG: float = 40.0       # Pitch >= 40°: Nguy cơ mất kiểm soát độ cao (CRITICAL)

    # Cửa sổ hồi phục (Hysteresis): Phải đưa về dưới ngưỡng an toàn mới giải tỏa cảnh báo
    IMU_RECOVERY_ROLL_DEG: float = 20.0    # Roll hồi phục khi <= 20°
    IMU_RECOVERY_PITCH_DEG: float = 18.0   # Pitch hồi phục khi <= 18°

    # --- 1.2 Ngưỡng khoảng cách siêu âm AJ-SR04M xuống mặt nước (cm) ---
    LIDAR_DANGER_CRIT_CM: int = 200        # < 2.0 m: Nguy cơ chạm mặt nước lũ (CRITICAL)
    LIDAR_WARN_LOW_CM: int = 350           # < 3.5 m: Độ cao bay thấp sát nước (WARN)
    LIDAR_RECOVERY_CM: int = 400           # >= 4.0 m: Hồi phục độ cao an toàn (RESOLVED)

    # --- 1.3 Ngưỡng cường độ sóng LoRa SX1278 (dBm) ---
    RF_RSSI_CRIT_DBM: int = -115           # <= -115 dBm: Tín hiệu cận kề rớt kết nối (CRITICAL)
    RF_RSSI_WARN_DBM: int = -105           # <= -105 dBm: Tín hiệu suy hao mạnh (WARN)
    RF_RSSI_RECOVERY_DBM: int = -95        # >= -95 dBm: Tín hiệu hồi phục tốt (RESOLVED)


THRESHOLDS = AlertThresholds()


# ============================================================================
# PHẦN 2: XỬ LÝ TRƯỜNG HỢP IMU BỊ NGHIÊNG QUÁ MỨC (Excessive IMU Tilt Handler)
# ============================================================================

class ImuTiltHandler:
    """Xử lý chuyên biệt sự cố góc nghiêng con quay IMU vượt ngưỡng an toàn.

    ĐẦU VÀO (Inputs):
        - roll_deg (float | None): Góc nghiêng ngang đo bởi IMU (-180° đến +180°).
        - pitch_deg (float | None): Góc nghiêng dọc đo bởi IMU (-90° đến +90°).
        - imu_valid (bool): Cờ hợp lệ phần cứng IMU từ Byte 21 của gói IF-02.
        - current_alert (dict | None): Cảnh báo tilt hiện tại trong session (nếu có)
          để áp dụng logic hồi phục hysteresis.

    ĐIỀU KIỆN KÍCH HOẠT (Trigger Conditions):
        1. Kích hoạt CRITICAL:
           - imu_valid == True
           - AND (abs(roll_deg) >= THRESHOLDS.IMU_ROLL_CRIT_DEG HOẶC abs(pitch_deg) >= THRESHOLDS.IMU_PITCH_CRIT_DEG)
        2. Kích hoạt WARN:
           - imu_valid == True
           - AND KHÔNG thỏa mãn mức CRITICAL
           - AND (abs(roll_deg) >= THRESHOLDS.IMU_ROLL_WARN_DEG HOẶC abs(pitch_deg) >= THRESHOLDS.IMU_PITCH_WARN_DEG)
        3. Hồi phục RESOLVED:
           - Đang có cảnh báo IMU_EXCESSIVE_TILT với condition_status == "ACTIVE"
           - AND imu_valid == True
           - AND abs(roll_deg) <= THRESHOLDS.IMU_RECOVERY_ROLL_DEG
           - AND abs(pitch_deg) <= THRESHOLDS.IMU_RECOVERY_PITCH_DEG

    ĐẦU RA (Outputs):
        - dict | None: Dictionary sự kiện cảnh báo (chuẩn schema Alert) hoặc None
          nếu trạng thái bình thường và không có cảnh báo nào cần thay đổi.
    """

    ALERT_CODE = "IMU_EXCESSIVE_TILT"

    @classmethod
    def _format_tilt_direction(cls, roll: float, pitch: float) -> str:
        """Phân tích và mô tả hướng nghiêng chi tiết bằng tiếng Việt."""
        parts = []
        if abs(roll) >= THRESHOLDS.IMU_ROLL_WARN_DEG:
            direction = "nghiêng phải" if roll > 0 else "nghiêng trái"
            parts.append(f"{direction} Roll={roll:+.1f}°")
        if abs(pitch) >= THRESHOLDS.IMU_PITCH_WARN_DEG:
            direction = "ngửa mũi" if pitch > 0 else "chúi mũi"
            parts.append(f"{direction} Pitch={pitch:+.1f}°")
        return ", ".join(parts) if parts else f"Roll={roll:+.1f}°, Pitch={pitch:+.1f}°"

    @classmethod
    def evaluate(
        cls,
        roll_deg: float | None,
        pitch_deg: float | None,
        imu_valid: bool,
        current_alert: dict[str, Any] | None = None,
    ) -> dict[str, Any] | None:
        """Đánh giá dữ liệu IMU và xuất ra sự kiện cảnh báo tương ứng."""
        # Nếu cờ IMU báo hỏng hoặc thiếu số liệu, không thể đánh giá góc nghiêng vật lý
        if not imu_valid or roll_deg is None or pitch_deg is None:
            return None

        abs_roll = abs(roll_deg)
        abs_pitch = abs(pitch_deg)
        is_active = current_alert is not None and current_alert.get("condition_status") != "RESOLVED"
        current_level = current_alert.get("level") if is_active else None

        # 1. Kiểm tra ngưỡng Nguy hiểm (CRITICAL)
        if abs_roll >= THRESHOLDS.IMU_ROLL_CRIT_DEG or abs_pitch >= THRESHOLDS.IMU_PITCH_CRIT_DEG:
            direction_desc = cls._format_tilt_direction(roll_deg, pitch_deg)
            # Chỉ phát event nếu chưa có cảnh báo hoặc nâng cấp cấp độ
            if current_level != "CRITICAL":
                return {
                    "code": cls.ALERT_CODE,
                    "level": "CRITICAL",
                    "condition_status": "ACTIVE",
                    "message": (
                        f"Góc nghiêng IMU vượt ngưỡng an toàn nghiêm trọng: {direction_desc}. "
                        "Nguy cơ lật tải hoặc mất kiểm soát độ cao!"
                    ),
                }
            return None

        # 2. Kiểm tra ngưỡng Cảnh báo (WARN)
        if abs_roll >= THRESHOLDS.IMU_ROLL_WARN_DEG or abs_pitch >= THRESHOLDS.IMU_PITCH_WARN_DEG:
            direction_desc = cls._format_tilt_direction(roll_deg, pitch_deg)
            if current_level != "WARN":
                return {
                    "code": cls.ALERT_CODE,
                    "level": "WARN",
                    "condition_status": "ACTIVE",
                    "message": f"Góc nghiêng UAV bất thường: {direction_desc}. Cần theo dõi tư thế bay.",
                }
            return None

        # 3. Kiểm tra điều kiện Hồi phục (RESOLVED kèm hysteresis)
        if is_active:
            if (
                abs_roll <= THRESHOLDS.IMU_RECOVERY_ROLL_DEG
                and abs_pitch <= THRESHOLDS.IMU_RECOVERY_PITCH_DEG
            ):
                return {
                    "code": cls.ALERT_CODE,
                    "level": "INFO",
                    "condition_status": "RESOLVED",
                    "message": (
                        f"Tư thế UAV đã ổn định an toàn: Roll={roll_deg:+.1f}°, Pitch={pitch_deg:+.1f}°. "
                        "Góc nghiêng đã trở về phạm vi cho phép."
                    ),
                }

        return None


# ============================================================================
# PHẦN 3: LOGIC PHÁT HIỆN SỰ KIỆN TOÀN DIỆN (Telemetry Event Detector)
# ============================================================================

def evaluate_telemetry_alerts(
    telem: dict[str, Any],
    active_alerts: dict[str, dict[str, Any]],
    *,
    target: dict[str, Any] | None = None,
    has_target: bool | None = None,
) -> list[dict[str, Any]]:
    """Bộ điều phối phát hiện sự kiện toàn diện cho gói telemetry đầu vào.

    ĐẦU VÀO (Inputs):
        - telem: dict chứa toàn bộ trường đo lường của telemetry:
            * roll_deg (float | None), pitch_deg (float | None)
            * lidar_range_cm (int | None), lidar_valid (bool)
            * imu_valid (bool), gps_valid (bool)
            * packet_rssi_dbm (int | None)
        - active_alerts: dict[str, dict] tra cứu cảnh báo đang active hiện hành
          theo `code`, phục vụ chuyển trạng thái và hồi phục (hysteresis).
        - target (dict | None): Thông tin mục tiêu nhận diện (class_id, confidence...).
        - has_target (bool | None): Cờ có mục tiêu hay không.

    ĐIỀU KIỆN VÀ LOGIC PHÁT HIỆN (Detection Logic):
        1. Gọi ImuTiltHandler đánh giá góc nghiêng con quay.
        2. Đánh giá độ cao mặt nước từ cảm biến siêu âm (LIDAR_DANGER_LOW).
        3. Đánh giá sự cố suy giảm cảm biến phần cứng (SENSOR_DEGRADED).
        4. Đánh giá chất lượng liên kết sóng RF LoRa (RF_LINK_WEAK).
        5. Đánh giá phát hiện mục tiêu cứu nạn (TARGET_LIFEBUOY_DETECTED).

    ĐẦU RA (Outputs):
        - list[dict[str, Any]]: Danh sách các sự kiện cảnh báo cần publish qua Hub.
    """
    events: list[dict[str, Any]] = []

    # --- 3.1 Đánh giá góc nghiêng IMU qua ImuTiltHandler ---
    roll_deg = telem.get("roll_deg")
    pitch_deg = telem.get("pitch_deg")
    imu_valid = bool(telem.get("imu_valid", False))
    tilt_current = active_alerts.get(ImuTiltHandler.ALERT_CODE)

    tilt_event = ImuTiltHandler.evaluate(
        roll_deg=roll_deg,
        pitch_deg=pitch_deg,
        imu_valid=imu_valid,
        current_alert=tilt_current,
    )
    if tilt_event:
        events.append(tilt_event)

    # --- 3.2 Đánh giá cự ly siêu âm sát mặt nước (LiDAR / Sonar) ---
    lidar_cm = telem.get("lidar_range_cm")
    lidar_valid = bool(telem.get("lidar_valid", False))
    lidar_code = "LIDAR_DANGER_LOW"
    lidar_current = active_alerts.get(lidar_code)
    lidar_is_active = lidar_current is not None and lidar_current.get("condition_status") != "RESOLVED"

    if lidar_valid and lidar_cm is not None:
        if lidar_cm <= THRESHOLDS.LIDAR_DANGER_CRIT_CM:
            if not lidar_is_active or lidar_current.get("level") != "CRITICAL":
                dist_m = lidar_cm / 100.0
                events.append({
                    "code": lidar_code,
                    "level": "CRITICAL",
                    "condition_status": "ACTIVE",
                    "message": (
                        f"Khoảng cách mặt nước nguy hiểm: Siêu âm đo {dist_m:.2f} m "
                        f"(dưới ngưỡng an toàn {THRESHOLDS.LIDAR_DANGER_CRIT_CM / 100.0:.1f} m). "
                        "Nguy cơ rơi hoặc chìm trong nước lũ!"
                    ),
                })
        elif lidar_cm <= THRESHOLDS.LIDAR_WARN_LOW_CM:
            if not lidar_is_active:
                dist_m = lidar_cm / 100.0
                events.append({
                    "code": lidar_code,
                    "level": "WARN",
                    "condition_status": "ACTIVE",
                    "message": (
                        f"Độ cao bay thấp sát mặt nước: {dist_m:.2f} m. "
                        "Chú ý cành cây và vật cản vùng ngập lụt."
                    ),
                })
        elif lidar_is_active and lidar_cm >= THRESHOLDS.LIDAR_RECOVERY_CM:
            dist_m = lidar_cm / 100.0
            events.append({
                "code": lidar_code,
                "level": "INFO",
                "condition_status": "RESOLVED",
                "message": f"Độ cao an toàn đã được tái lập: Siêu âm đạt {dist_m:.2f} m.",
            })

    # --- 3.3 Đánh giá sự cố cờ cảm biến tải (Sensor Degradation) ---
    sensor_code = "SENSOR_DEGRADED"
    sensor_current = active_alerts.get(sensor_code)
    sensor_is_active = sensor_current is not None and sensor_current.get("condition_status") != "RESOLVED"

    invalid_sensors: list[str] = []
    if not imu_valid:
        invalid_sensors.append("IMU GY-87")
    if not lidar_valid:
        invalid_sensors.append("Siêu âm AJ-SR04M")

    if invalid_sensors:
        if not sensor_is_active:
            sensors_str = ", ".join(invalid_sensors)
            events.append({
                "code": sensor_code,
                "level": "WARN",
                "condition_status": "ACTIVE",
                "message": f"Cảm biến phần cứng tải nhiệm vụ báo lỗi/mất tín hiệu: {sensors_str}.",
            })
    elif sensor_is_active:
        events.append({
            "code": sensor_code,
            "level": "INFO",
            "condition_status": "RESOLVED",
            "message": "Các cảm biến phần cứng IMU và Siêu âm đã hoạt động bình thường trở lại.",
        })

    # --- 3.4 Đánh giá chất lượng sóng liên kết LoRa RF ---
    rssi = telem.get("packet_rssi_dbm")
    rf_code = "RF_LINK_WEAK"
    rf_current = active_alerts.get(rf_code)
    rf_is_active = rf_current is not None and rf_current.get("condition_status") != "RESOLVED"

    if rssi is not None and -127 <= rssi <= 0:
        if rssi <= THRESHOLDS.RF_RSSI_CRIT_DBM:
            if not rf_is_active or rf_current.get("level") != "CRITICAL":
                events.append({
                    "code": rf_code,
                    "level": "CRITICAL",
                    "condition_status": "ACTIVE",
                    "message": (
                        f"Tín hiệu LoRa 433MHz suy hao nghiêm trọng (RSSI: {rssi} dBm). "
                        "Cận kề mất kết nối telemetry!"
                    ),
                })
        elif rssi <= THRESHOLDS.RF_RSSI_WARN_DBM:
            if not rf_is_active:
                events.append({
                    "code": rf_code,
                    "level": "WARN",
                    "condition_status": "ACTIVE",
                    "message": f"Tín hiệu sóng LoRa yếu (RSSI: {rssi} dBm). Kiểm tra hướng ăng-ten trạm đất.",
                })
        elif rf_is_active and rssi >= THRESHOLDS.RF_RSSI_RECOVERY_DBM:
            events.append({
                "code": rf_code,
                "level": "INFO",
                "condition_status": "RESOLVED",
                "message": f"Liên kết LoRa đã ổn định trở lại (RSSI: {rssi} dBm).",
            })

    # --- 3.5 Đánh giá phát hiện mục tiêu cứu nạn (Phao cứu sinh - LIFEBUOY) ---
    effective_target = target if target is not None else telem.get("target")
    effective_has_target = (
        has_target
        if has_target is not None
        else bool(telem.get("has_target", False))
    )

    buoy_code = "TARGET_LIFEBUOY_DETECTED"
    buoy_current = active_alerts.get(buoy_code)
    buoy_is_active = (
        buoy_current is not None
        and buoy_current.get("condition_status") != "RESOLVED"
    )

    is_lifebuoy = False
    if effective_has_target and effective_target is not None:
        cid = effective_target.get("class_id")
        cname = str(effective_target.get("class_name", "")).lower()
        if cid == 2 or "lifebuoy" in cname or "phao" in cname or "boat" in cname:
            is_lifebuoy = True

    if is_lifebuoy:
        if not buoy_is_active:
            conf = effective_target.get("confidence") if effective_target else None
            conf_str = f" (độ tin cậy {conf}%)" if conf is not None else ""
            events.append({
                "code": buoy_code,
                "level": "WARN",
                "condition_status": "ACTIVE",
                "message": f"Phát hiện Phao cứu sinh (Lifebuoy){conf_str} trong khu vực tìm kiếm!",
            })
    elif buoy_is_active:
        events.append({
            "code": buoy_code,
            "level": "INFO",
            "condition_status": "RESOLVED",
            "message": "Mục tiêu phao cứu sinh đã ra khỏi vùng quét của tải nhiệm vụ.",
        })

    return events
