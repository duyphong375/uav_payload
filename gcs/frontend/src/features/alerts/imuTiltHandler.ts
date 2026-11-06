/**
 * KVC SAR GCS - PHẦN 2: XỬ LÝ TRƯỜNG HỢP IMU BỊ NGHIÊNG QUÁ MỨC (Excessive IMU Tilt Handler)
 * ==========================================================================================
 * Xử lý chuyên biệt sự cố góc nghiêng con quay IMU GY-87 vượt ngưỡng an toàn.
 */

import { ALERT_THRESHOLDS } from './alertThresholds'
import type { AlertConditionStatus, AlertItem, AlertLevel } from '@/types/telemetry'

export interface TiltAlertEvent {
  code: string
  level: AlertLevel
  condition_status: AlertConditionStatus
  message: string
}

export class ImuTiltHandler {
  public static readonly ALERT_CODE = 'IMU_EXCESSIVE_TILT'

  /**
   * Phân tích và mô tả hướng nghiêng chi tiết bằng tiếng Việt.
   */
  private static formatTiltDirection(roll: number, pitch: number): string {
    const parts: string[] = []
    if (Math.abs(roll) >= ALERT_THRESHOLDS.IMU_ROLL_WARN_DEG) {
      const direction = roll > 0 ? 'nghiêng phải' : 'nghiêng trái'
      const sign = roll >= 0 ? '+' : ''
      parts.push(`${direction} Roll=${sign}${roll.toFixed(1)}°`)
    }
    if (Math.abs(pitch) >= ALERT_THRESHOLDS.IMU_PITCH_WARN_DEG) {
      const direction = pitch > 0 ? 'ngửa mũi' : 'chúi mũi'
      const sign = pitch >= 0 ? '+' : ''
      parts.push(`${direction} Pitch=${sign}${pitch.toFixed(1)}°`)
    }
    return parts.length > 0 ? parts.join(', ') : `Roll=${roll >= 0 ? '+' : ''}${roll.toFixed(1)}°, Pitch=${pitch >= 0 ? '+' : ''}${pitch.toFixed(1)}°`
  }

  /**
   * Đánh giá dữ liệu IMU và xuất ra sự kiện cảnh báo tương ứng.
   *
   * ĐẦU VÀO (Inputs):
   *   - rollDeg (number | null): Góc roll đo bởi IMU (°).
   *   - pitchDeg (number | null): Góc pitch đo bởi IMU (°).
   *   - imuValid (boolean): Cờ hợp lệ phần cứng IMU.
   *   - currentAlert (AlertItem | undefined): Trạng thái cảnh báo tilt hiện hành.
   *
   * ĐIỀU KIỆN KÍCH HOẠT (Trigger Conditions):
   *   1. Kích hoạt CRITICAL:
   *      - imuValid === true
   *      - AND (|rollDeg| >= IMU_ROLL_CRIT_DEG HOẶC |pitchDeg| >= IMU_PITCH_CRIT_DEG)
   *   2. Kích hoạt WARN:
   *      - imuValid === true
   *      - AND KHÔNG thỏa mãn CRITICAL
   *      - AND (|rollDeg| >= IMU_ROLL_WARN_DEG HOẶC |pitchDeg| >= IMU_PITCH_WARN_DEG)
   *   3. Hồi phục RESOLVED:
   *      - Đang có cảnh báo IMU_EXCESSIVE_TILT với condition_status === 'ACTIVE'
   *      - AND imuValid === true
   *      - AND |rollDeg| <= IMU_RECOVERY_ROLL_DEG
   *      - AND |pitchDeg| <= IMU_RECOVERY_PITCH_DEG
   *
   * ĐẦU RA (Outputs):
   *   - TiltAlertEvent | null: Sự kiện cảnh báo phát sinh hoặc null nếu bình thường.
   */
  public static evaluate(
    rollDeg: number | null,
    pitchDeg: number | null,
    imuValid: boolean,
    currentAlert?: AlertItem
  ): TiltAlertEvent | null {
    // Nếu cờ IMU báo hỏng hoặc thiếu số liệu, không thể đánh giá góc nghiêng vật lý
    if (!imuValid || rollDeg === null || pitchDeg === null) {
      return null
    }

    const absRoll = Math.abs(rollDeg)
    const absPitch = Math.abs(pitchDeg)
    const isActive = Boolean(currentAlert && currentAlert.active && currentAlert.condition_status !== 'RESOLVED')
    const currentLevel = isActive ? currentAlert?.level : null

    // 1. Kiểm tra ngưỡng Nguy hiểm (CRITICAL)
    if (absRoll >= ALERT_THRESHOLDS.IMU_ROLL_CRIT_DEG || absPitch >= ALERT_THRESHOLDS.IMU_PITCH_CRIT_DEG) {
      const directionDesc = this.formatTiltDirection(rollDeg, pitchDeg)
      if (currentLevel !== 'CRITICAL') {
        return {
          code: this.ALERT_CODE,
          level: 'CRITICAL',
          condition_status: 'ACTIVE',
          message: `Góc nghiêng IMU vượt ngưỡng an toàn nghiêm trọng: ${directionDesc}. Nguy cơ lật tải hoặc mất kiểm soát độ cao!`,
        }
      }
      return null
    }

    // 2. Kiểm tra ngưỡng Cảnh báo (WARN)
    if (absRoll >= ALERT_THRESHOLDS.IMU_ROLL_WARN_DEG || absPitch >= ALERT_THRESHOLDS.IMU_PITCH_WARN_DEG) {
      const directionDesc = this.formatTiltDirection(rollDeg, pitchDeg)
      if (currentLevel !== 'WARN') {
        return {
          code: this.ALERT_CODE,
          level: 'WARN',
          condition_status: 'ACTIVE',
          message: `Góc nghiêng UAV bất thường: ${directionDesc}. Cần theo dõi tư thế bay.`,
        }
      }
      return null
    }

    // 3. Kiểm tra điều kiện Hồi phục (RESOLVED kèm hysteresis)
    if (isActive) {
      if (
        absRoll <= ALERT_THRESHOLDS.IMU_RECOVERY_ROLL_DEG &&
        absPitch <= ALERT_THRESHOLDS.IMU_RECOVERY_PITCH_DEG
      ) {
        const signR = rollDeg >= 0 ? '+' : ''
        const signP = pitchDeg >= 0 ? '+' : ''
        return {
          code: this.ALERT_CODE,
          level: 'INFO',
          condition_status: 'RESOLVED',
          message: `Tư thế UAV đã ổn định an toàn: Roll=${signR}${rollDeg.toFixed(1)}°, Pitch=${signP}${pitchDeg.toFixed(1)}°. Góc nghiêng đã trở về phạm vi cho phép.`,
        }
      }
    }

    return null
  }
}
