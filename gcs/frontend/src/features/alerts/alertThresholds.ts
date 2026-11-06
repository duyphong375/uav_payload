/**
 * KVC SAR GCS - PHẦN 1: XÁC ĐỊNH NGƯỠNG CẢNH BÁO (Alert Thresholds & Configuration)
 * ==============================================================================
 * Toàn bộ hằng số ngưỡng kích hoạt, mức độ nghiêm trọng và cửa sổ hồi phục (hysteresis)
 * cho tải nhiệm vụ UAV tìm kiếm cứu nạn bão lũ.
 */

export const ALERT_THRESHOLDS = {
  // --- 1.1 Ngưỡng góc nghiêng IMU GY-87 (Độ) ---
  // Vùng bay bình thường của UAV chở tải: trong khoảng +/-15°
  IMU_ROLL_WARN_DEG: 30.0,       // |Roll| >= 30°: Cảnh báo nghiêng ngang bất thường (WARN)
  IMU_PITCH_WARN_DEG: 25.0,      // |Pitch| >= 25°: Cảnh báo chúi/ngửa mũi bất thường (WARN)
  IMU_ROLL_CRIT_DEG: 45.0,       // |Roll| >= 45°: Nguy cơ lật tải hoặc mất thăng bằng (CRITICAL)
  IMU_PITCH_CRIT_DEG: 40.0,      // |Pitch| >= 40°: Nguy cơ mất kiểm soát độ cao (CRITICAL)

  // Cửa sổ hồi phục (Hysteresis): Phải đưa về dưới ngưỡng an toàn mới giải tỏa cảnh báo
  IMU_RECOVERY_ROLL_DEG: 20.0,   // Hồi phục khi |Roll| <= 20°
  IMU_RECOVERY_PITCH_DEG: 18.0,  // Hồi phục khi |Pitch| <= 18°

  // --- 1.2 Ngưỡng khoảng cách siêu âm AJ-SR04M xuống mặt nước (cm) ---
  LIDAR_DANGER_CRIT_CM: 200,     // < 2.0 m: Nguy cơ chạm mặt nước lũ (CRITICAL)
  LIDAR_WARN_LOW_CM: 350,        // < 3.5 m: Độ cao bay thấp sát nước (WARN)
  LIDAR_RECOVERY_CM: 400,        // >= 4.0 m: Tái lập độ cao an toàn (RESOLVED)

  // --- 1.3 Ngưỡng cường độ sóng LoRa SX1278 (dBm) ---
  RF_RSSI_CRIT_DBM: -115,        // <= -115 dBm: Tín hiệu cận kề rớt kết nối (CRITICAL)
  RF_RSSI_WARN_DBM: -105,        // <= -105 dBm: Tín hiệu suy hao mạnh (WARN)
  RF_RSSI_RECOVERY_DBM: -95,     // >= -95 dBm: Tín hiệu hồi phục tốt (RESOLVED)
} as const
