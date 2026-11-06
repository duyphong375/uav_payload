/**
 * KVC SAR GCS - PHẦN 3: LOGIC PHÁT HIỆN SỰ KIỆN TOÀN DIỆN (Telemetry Event Detector)
 * =================================================================================
 * Bộ điều phối phát hiện sự kiện toàn diện trên dữ liệu Telemetry đầu vào.
 */

import { ALERT_THRESHOLDS } from './alertThresholds'
import { ImuTiltHandler } from './imuTiltHandler'
import type { AlertConditionStatus, AlertItem, AlertLevel, PayloadTelemetry, TargetInfo } from '@/types/telemetry'

export interface AlertEvaluationEvent {
  code: string
  level: AlertLevel
  condition_status: AlertConditionStatus
  message: string
}

/**
 * Đánh giá dữ liệu telemetry và xuất ra danh sách các cảnh báo cần kích hoạt hoặc giải tỏa.
 *
 * ĐẦU VÀO (Inputs):
 *   - telem: Partial<PayloadTelemetry> (toàn bộ trường cảm biến: roll, pitch, lidar, flags, rssi).
 *   - activeAlerts: AlertItem[] (danh sách cảnh báo hiện có trong state).
 *   - target?: TargetInfo | null (thông tin mục tiêu cứu nạn nhận diện).
 *   - hasTarget?: boolean (cờ có mục tiêu hay không).
 *
 * ĐIỀU KIỆN & QUY TRÌNH PHÁT HIỆN (Detection Logic):
 *   1. Gọi ImuTiltHandler xử lý chuyên biệt góc nghiêng IMU GY-87.
 *   2. Đánh giá độ cao mặt nước từ cảm biến siêu âm (LIDAR_DANGER_LOW).
 *   3. Đánh giá cờ trạng thái cảm biến phần cứng tải (SENSOR_DEGRADED).
 *   4. Đánh giá chất lượng sóng RF LoRa SX1278 (RF_LINK_WEAK).
 *   5. Đánh giá phát hiện mục tiêu cứu nạn (TARGET_LIFEBUOY_DETECTED).
 *
 * ĐẦU RA (Outputs):
 *   - AlertEvaluationEvent[]: Danh sách các sự kiện cần dispatch/xử lý.
 */
export function evaluateTelemetryAlerts(
  telem: Partial<PayloadTelemetry>,
  activeAlerts: AlertItem[],
  target?: TargetInfo | null,
  hasTarget?: boolean
): AlertEvaluationEvent[] {
  const events: AlertEvaluationEvent[] = []
  const alertMap = new Map<string, AlertItem>()
  activeAlerts.forEach((a) => alertMap.set(a.code, a))

  // --- 3.1 Đánh giá góc nghiêng IMU qua ImuTiltHandler ---
  const rollDeg = telem.roll_deg ?? null
  const pitchDeg = telem.pitch_deg ?? null
  const imuValid = Boolean(telem.imu_valid)
  const currentTilt = alertMap.get(ImuTiltHandler.ALERT_CODE)

  const tiltEvent = ImuTiltHandler.evaluate(rollDeg, pitchDeg, imuValid, currentTilt)
  if (tiltEvent) {
    events.push(tiltEvent)
  }

  // --- 3.2 Đánh giá cự ly siêu âm sát mặt nước ---
  const lidarCm = telem.lidar_range_cm ?? null
  const lidarValid = Boolean(telem.lidar_valid)
  const lidarCode = 'LIDAR_DANGER_LOW'
  const currentLidar = alertMap.get(lidarCode)
  const lidarIsActive = Boolean(currentLidar && currentLidar.active && currentLidar.condition_status !== 'RESOLVED')

  if (lidarValid && lidarCm !== null) {
    if (lidarCm <= ALERT_THRESHOLDS.LIDAR_DANGER_CRIT_CM) {
      if (!lidarIsActive || currentLidar?.level !== 'CRITICAL') {
        const distM = (lidarCm / 100).toFixed(2)
        events.push({
          code: lidarCode,
          level: 'CRITICAL',
          condition_status: 'ACTIVE',
          message: `Khoảng cách mặt nước nguy hiểm: Siêu âm đo ${distM} m (dưới ngưỡng ${(ALERT_THRESHOLDS.LIDAR_DANGER_CRIT_CM / 100).toFixed(1)} m). Nguy cơ rơi hoặc chìm trong nước lũ!`,
        })
      }
    } else if (lidarCm <= ALERT_THRESHOLDS.LIDAR_WARN_LOW_CM) {
      if (!lidarIsActive) {
        const distM = (lidarCm / 100).toFixed(2)
        events.push({
          code: lidarCode,
          level: 'WARN',
          condition_status: 'ACTIVE',
          message: `Độ cao bay thấp sát mặt nước: ${distM} m. Chú ý cành cây và vật cản vùng ngập lụt.`,
        })
      }
    } else if (lidarIsActive && lidarCm >= ALERT_THRESHOLDS.LIDAR_RECOVERY_CM) {
      const distM = (lidarCm / 100).toFixed(2)
      events.push({
        code: lidarCode,
        level: 'INFO',
        condition_status: 'RESOLVED',
        message: `Độ cao an toàn đã được tái lập: Siêu âm đạt ${distM} m.`,
      })
    }
  }

  // --- 3.3 Đánh giá cờ cảm biến tải (Sensor Degradation) ---
  const sensorCode = 'SENSOR_DEGRADED'
  const currentSensor = alertMap.get(sensorCode)
  const sensorIsActive = Boolean(currentSensor && currentSensor.active && currentSensor.condition_status !== 'RESOLVED')

  const invalidSensors: string[] = []
  if (telem.imu_valid === false) invalidSensors.push('IMU GY-87')
  if (telem.lidar_valid === false) invalidSensors.push('Siêu âm AJ-SR04M')

  if (invalidSensors.length > 0) {
    if (!sensorIsActive) {
      events.push({
        code: sensorCode,
        level: 'WARN',
        condition_status: 'ACTIVE',
        message: `Cảm biến phần cứng tải nhiệm vụ báo lỗi/mất tín hiệu: ${invalidSensors.join(', ')}.`,
      })
    }
  } else if (sensorIsActive && telem.imu_valid === true && telem.lidar_valid === true) {
    events.push({
      code: sensorCode,
      level: 'INFO',
      condition_status: 'RESOLVED',
      message: 'Các cảm biến phần cứng IMU và Siêu âm đã hoạt động bình thường trở lại.',
    })
  }

  // --- 3.4 Đánh giá chất lượng sóng liên kết LoRa RF ---
  const rssi = telem.packet_rssi_dbm ?? null
  const rfCode = 'RF_LINK_WEAK'
  const currentRf = alertMap.get(rfCode)
  const rfIsActive = Boolean(currentRf && currentRf.active && currentRf.condition_status !== 'RESOLVED')

  if (rssi !== null && rssi >= -127 && rssi <= 0) {
    if (rssi <= ALERT_THRESHOLDS.RF_RSSI_CRIT_DBM) {
      if (!rfIsActive || currentRf?.level !== 'CRITICAL') {
        events.push({
          code: rfCode,
          level: 'CRITICAL',
          condition_status: 'ACTIVE',
          message: `Tín hiệu LoRa 433MHz suy hao nghiêm trọng (RSSI: ${rssi} dBm). Cận kề mất kết nối telemetry!`,
        })
      }
    } else if (rssi <= ALERT_THRESHOLDS.RF_RSSI_WARN_DBM) {
      if (!rfIsActive) {
        events.push({
          code: rfCode,
          level: 'WARN',
          condition_status: 'ACTIVE',
          message: `Tín hiệu sóng LoRa yếu (RSSI: ${rssi} dBm). Kiểm tra hướng ăng-ten trạm đất.`,
        })
      }
    } else if (rfIsActive && rssi >= ALERT_THRESHOLDS.RF_RSSI_RECOVERY_DBM) {
      events.push({
        code: rfCode,
        level: 'INFO',
        condition_status: 'RESOLVED',
        message: `Liên kết LoRa đã ổn định trở lại (RSSI: ${rssi} dBm).`,
      })
    }
  }

  // --- 3.5 Đánh giá phát hiện mục tiêu cứu nạn (Phao cứu sinh - LIFEBUOY) ---
  const effectiveTarget = target !== undefined ? target : (telem as { target?: TargetInfo | null }).target ?? null
  const effectiveHasTarget = hasTarget !== undefined ? hasTarget : Boolean((telem as { has_target?: boolean }).has_target)

  const buoyCode = 'TARGET_LIFEBUOY_DETECTED'
  const currentBuoy = alertMap.get(buoyCode)
  const buoyIsActive = Boolean(currentBuoy && currentBuoy.active && currentBuoy.condition_status !== 'RESOLVED')

  let isLifebuoy = false
  if (effectiveHasTarget && effectiveTarget) {
    const cid = effectiveTarget.class_id
    const cname = (effectiveTarget.class_name ?? '').toLowerCase()
    if (cid === 2 || cname.includes('lifebuoy') || cname.includes('phao') || cname.includes('boat')) {
      isLifebuoy = true
    }
  }

  if (isLifebuoy) {
    if (!buoyIsActive) {
      const conf = effectiveTarget?.confidence
      const confStr = conf !== undefined && conf !== null ? ` (độ tin cậy ${conf}%)` : ''
      events.push({
        code: buoyCode,
        level: 'WARN',
        condition_status: 'ACTIVE',
        message: `Phát hiện Phao cứu sinh (Lifebuoy)${confStr} trong khu vực tìm kiếm!`,
      })
    }
  } else if (buoyIsActive) {
    events.push({
      code: buoyCode,
      level: 'INFO',
      condition_status: 'RESOLVED',
      message: 'Mục tiêu phao cứu sinh đã ra khỏi vùng quét của tải nhiệm vụ.',
    })
  }

  return events
}
