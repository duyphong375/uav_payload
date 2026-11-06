import { describe, expect, it } from 'vitest'
import { ALERT_THRESHOLDS } from './alertThresholds'
import { evaluateTelemetryAlerts } from './alertDetector'
import { ImuTiltHandler } from './imuTiltHandler'
import type { AlertItem } from '@/types/telemetry'

describe('Hệ thống cảnh báo GCS (Alert Engine)', () => {
  it('Phần 1: Ngưỡng cảnh báo phải hợp lệ và tuân thủ thứ tự an toàn', () => {
    expect(ALERT_THRESHOLDS.IMU_RECOVERY_ROLL_DEG).toBeLessThan(ALERT_THRESHOLDS.IMU_ROLL_WARN_DEG)
    expect(ALERT_THRESHOLDS.IMU_ROLL_WARN_DEG).toBeLessThan(ALERT_THRESHOLDS.IMU_ROLL_CRIT_DEG)
    expect(ALERT_THRESHOLDS.IMU_ROLL_WARN_DEG).toBe(30.0)
    expect(ALERT_THRESHOLDS.IMU_ROLL_CRIT_DEG).toBe(45.0)

    expect(ALERT_THRESHOLDS.IMU_RECOVERY_PITCH_DEG).toBeLessThan(ALERT_THRESHOLDS.IMU_PITCH_WARN_DEG)
    expect(ALERT_THRESHOLDS.IMU_PITCH_WARN_DEG).toBeLessThan(ALERT_THRESHOLDS.IMU_PITCH_CRIT_DEG)
    expect(ALERT_THRESHOLDS.IMU_PITCH_WARN_DEG).toBe(25.0)
    expect(ALERT_THRESHOLDS.IMU_PITCH_CRIT_DEG).toBe(40.0)

    expect(ALERT_THRESHOLDS.LIDAR_DANGER_CRIT_CM).toBeLessThan(ALERT_THRESHOLDS.LIDAR_WARN_LOW_CM)
    expect(ALERT_THRESHOLDS.LIDAR_WARN_LOW_CM).toBeLessThan(ALERT_THRESHOLDS.LIDAR_RECOVERY_CM)
  })

  describe('Phần 2: Xử lý góc nghiêng IMU quá mức (ImuTiltHandler)', () => {
    it('không phát cảnh báo khi góc trong giới hạn bình thường', () => {
      const res = ImuTiltHandler.evaluate(12.0, -8.0, true)
      expect(res).toBeNull()
    })

    it('không phát cảnh báo khi cờ imu_valid là false (tránh báo giả do dữ liệu hỏng)', () => {
      const res = ImuTiltHandler.evaluate(50.0, -45.0, false)
      expect(res).toBeNull()
    })

    it('kích hoạt WARN khi Roll hoặc Pitch vượt ngưỡng chú ý', () => {
      // Nghiêng phải 32.4°
      const resRoll = ImuTiltHandler.evaluate(32.4, 5.0, true)
      expect(resRoll).not.toBeNull()
      expect(resRoll?.code).toBe('IMU_EXCESSIVE_TILT')
      expect(resRoll?.level).toBe('WARN')
      expect(resRoll?.condition_status).toBe('ACTIVE')
      expect(resRoll?.message).toContain('nghiêng phải Roll=+32.4°')

      // Chúi mũi 27.0°
      const resPitch = ImuTiltHandler.evaluate(0.0, -27.0, true)
      expect(resPitch).not.toBeNull()
      expect(resPitch?.level).toBe('WARN')
      expect(resPitch?.message).toContain('chúi mũi Pitch=-27.0°')
    })

    it('kích hoạt CRITICAL khi Roll vượt 45° hoặc Pitch vượt 40°', () => {
      const resCrit = ImuTiltHandler.evaluate(-48.2, 10.0, true)
      expect(resCrit).not.toBeNull()
      expect(resCrit?.level).toBe('CRITICAL')
      expect(resCrit?.message).toContain('nghiêng trái Roll=-48.2°')
      expect(resCrit?.message).toContain('Nguy cơ lật tải')
    })

    it('hồi phục RESOLVED có hysteresis chống rung giật', () => {
      const mockActive: AlertItem = {
        id: 'alert-1',
        code: 'IMU_EXCESSIVE_TILT',
        level: 'WARN',
        condition_status: 'ACTIVE',
        active: true,
        message: 'Góc nghiêng',
        timestamp_iso: new Date().toISOString(),
        first_seen_iso: new Date().toISOString(),
        last_seen_iso: new Date().toISOString(),
        acknowledged: false,
        acknowledged_at_iso: null,
        occurrence_count: 1,
        source_category: 'SENSORS',
      }

      // Giảm về 25° (chưa dưới ngưỡng hồi phục 20°) -> giữ nguyên
      const resNear = ImuTiltHandler.evaluate(25.0, 5.0, true, mockActive)
      expect(resNear).toBeNull()

      // Giảm sâu về 15.0° (đã dưới ngưỡng 20°) -> RESOLVED
      const resOk = ImuTiltHandler.evaluate(15.0, 5.0, true, mockActive)
      expect(resOk).not.toBeNull()
      expect(resOk?.code).toBe('IMU_EXCESSIVE_TILT')
      expect(resOk?.level).toBe('INFO')
      expect(resOk?.condition_status).toBe('RESOLVED')
      expect(resOk?.message).toContain('đã ổn định an toàn')
    })
  })

  describe('Phần 3: Logic phát hiện sự kiện toàn diện (evaluateTelemetryAlerts)', () => {
    it('phát hiện đồng thời nhiều sự cố (Tilt + Lidar thấp + Sóng yếu)', () => {
      const telem = {
        roll_deg: 36.0,
        pitch_deg: 5.0,
        imu_valid: true,
        lidar_range_cm: 150, // 1.5m < 2.0m -> CRITICAL
        lidar_valid: true,
        packet_rssi_dbm: -118, // <= -115 -> CRITICAL
      }

      const events = evaluateTelemetryAlerts(telem, [])
      const codes = events.map((e) => e.code)

      expect(codes).toContain('IMU_EXCESSIVE_TILT')
      expect(codes).toContain('LIDAR_DANGER_LOW')
      expect(codes).toContain('RF_LINK_WEAK')

      const lidarEvt = events.find((e) => e.code === 'LIDAR_DANGER_LOW')
      expect(lidarEvt?.level).toBe('CRITICAL')
      expect(lidarEvt?.message).toContain('1.50 m')
    })

    it('phát hiện cờ cảm biến hỏng (SENSOR_DEGRADED)', () => {
      const telem = {
        imu_valid: false,
        lidar_valid: true,
      }

      const events = evaluateTelemetryAlerts(telem, [])
      expect(events.some((e) => e.code === 'SENSOR_DEGRADED' && e.message.includes('IMU GY-87'))).toBe(true)
    })

    it('phát hiện mục tiêu cứu nạn phao cứu sinh (TARGET_LIFEBUOY_DETECTED)', () => {
      const target = {
        class_id: 2,
        class_name: 'lifebuoy' as const,
        confidence: 88,
        track_id: 1,
        target_confirmed: true,
        pos_valid: true,
        coordinate_frame: 'LOCAL_GRID' as const,
        local_x_cm: 120,
        local_y_cm: 80,
        latitude: null,
        longitude: null,
        origin_id: 1,
        age_ms: 0,
      }

      // Kích hoạt cảnh báo khi phát hiện phao
      const events = evaluateTelemetryAlerts({}, [], target, true)
      const buoyEvt = events.find((e) => e.code === 'TARGET_LIFEBUOY_DETECTED')
      expect(buoyEvt).toBeDefined()
      expect(buoyEvt?.level).toBe('WARN')
      expect(buoyEvt?.condition_status).toBe('ACTIVE')
      expect(buoyEvt?.message).toContain('Phát hiện Phao cứu sinh (Lifebuoy)')
      expect(buoyEvt?.message).toContain('88%')

      // Giải tỏa cảnh báo khi phao ra khỏi vùng quét
      const activeAlert: AlertItem = {
        id: 'alert-buoy-1',
        code: 'TARGET_LIFEBUOY_DETECTED',
        level: 'WARN',
        condition_status: 'ACTIVE',
        active: true,
        message: buoyEvt!.message,
        timestamp_iso: new Date().toISOString(),
        first_seen_iso: new Date().toISOString(),
        last_seen_iso: new Date().toISOString(),
        acknowledged: false,
        acknowledged_at_iso: null,
        occurrence_count: 1,
        source_category: 'AI',
      }

      const resolvedEvents = evaluateTelemetryAlerts({}, [activeAlert], null, false)
      const resolveEvt = resolvedEvents.find((e) => e.code === 'TARGET_LIFEBUOY_DETECTED')
      expect(resolveEvt).toBeDefined()
      expect(resolveEvt?.level).toBe('INFO')
      expect(resolveEvt?.condition_status).toBe('RESOLVED')
      expect(resolveEvt?.message).toContain('đã ra khỏi vùng quét')
    })
  })
})
