import React from 'react'
import { Crosshair, Mountain, Radio } from 'lucide-react'
import { APP_CONFIG } from '@/config/appConfig'
import { InfoTip } from '@/components/shared/InfoTip'
import { Card } from '@/components/ui/card'
import { useMission } from '@/state/MissionProvider'

export const TopStatCards: React.FC<{ className?: string }> = ({ className = '' }) => {
  const { state } = useMission()
  const { telemetry, has_target, target, bounding_boxes, inference_device, is_stale, source_mode } =
    state

  const targetCount = is_stale ? 0 : bounding_boxes.length || (has_target ? 1 : 0)
  const isLocalGrid = target?.coordinate_frame === 'LOCAL_GRID'
  const hasValidTarget =
    !is_stale &&
    has_target &&
    target?.pos_valid &&
    target.coordinate_frame === 'WGS84' &&
    telemetry.gps_valid
  const targetLatStr =
    hasValidTarget && target?.latitude !== null ? target?.latitude?.toFixed(6) + '°' : 'N/A'
  const targetLonStr =
    hasValidTarget && target?.longitude !== null ? target?.longitude?.toFixed(6) + '°' : 'N/A'
  const targetLocationSummary = isLocalGrid
    ? target?.local_x_cm != null && target?.local_y_cm != null
      ? `Local Grid: (${target.local_x_cm}, ${target.local_y_cm}) cm`
      : 'Local Grid: N/A'
    : hasValidTarget
      ? `WGS84: ${targetLatStr}, ${targetLonStr}`
      : 'Tọa độ: N/A'

  const targetTrackId = !is_stale ? (target?.track_id ?? 'N/A') : 'N/A'
  const isLidarLocked = !is_stale && telemetry.lidar_valid && telemetry.lidar_range_cm !== null
  const lidarMeters = isLidarLocked ? (telemetry.lidar_range_cm! / 100).toFixed(2) : 'N/A'
  const rawConfidence = is_stale
    ? null
    : (target?.confidence ?? (bounding_boxes[0] ? bounding_boxes[0].confidence * 100 : null))
  const confidenceStr = rawConfidence === null ? 'N/A' : rawConfidence.toFixed(1) + '%'
  const targetClassLabel =
    targetCount === 0
      ? 'Chưa phát hiện'
      : target?.class_name === 'boat' || target?.class_name === 'lifebuoy'
        ? 'Tàu thuyền (Boat)'
        : target?.class_name === 'person'
          ? 'Người gặp nạn (Person)'
          : 'Đối tượng SAR'
  const deviceLabel =
    inference_device === 'FPGA_GW2A'
      ? 'FPGA GW2A'
      : inference_device === 'PC_REFERENCE'
        ? 'PC REFERENCE'
        : inference_device === 'SIMULATED'
          ? 'MÔ PHỎNG'
          : 'AI ENGINE'

  // Chất lượng tín hiệu sóng LoRa SX1278
  const rssi = is_stale ? null : telemetry.packet_rssi_dbm
  const snr = is_stale ? null : telemetry.packet_snr_db
  const rssiStr = rssi !== null ? `${rssi} dBm` : 'N/A'
  const snrStr = snr !== null ? `${snr > 0 ? `+${snr}` : snr} dB` : 'N/A'

  const getRfStatus = () => {
    if (rssi === null) {
      return source_mode === 'REAL'
        ? {
            label: 'CHƯA CÓ INGRESS',
            color:
              'text-[var(--kvc-crit-ink)] bg-[var(--kvc-crit-bg)] border-[var(--kvc-crit-line)]',
          }
        : { label: 'CHỜ TÍN HIỆU', color: 'text-muted-foreground bg-muted border-border' }
    }
    if (rssi >= -85)
      return {
        label: 'SÓNG TỐT',
        color: 'text-[var(--kvc-ok-ink)] bg-[var(--kvc-ok-bg)] border-[var(--kvc-ok-line)]',
      }
    if (rssi >= -105)
      return {
        label: 'SÓNG TRUNG BÌNH',
        color: 'text-[var(--kvc-warn-ink)] bg-[var(--kvc-warn-bg)] border-[var(--kvc-warn-line)]',
      }
    return {
      label: 'SÓNG YẾU',
      color: 'text-[var(--kvc-crit-ink)] bg-[var(--kvc-crit-bg)] border-[var(--kvc-crit-line)]',
    }
  }

  const rfStatus = getRfStatus()

  return (
    <div
      className={`shrink-0 grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-3 sm:gap-4 ${className}`}
    >
      {/* Stat 1: Mục tiêu cứu nạn */}
      <Card className="flex flex-col justify-between p-4 sm:p-5 rounded-kvc-panel bg-card border border-border">
        <div className="flex items-center justify-between gap-2">
          <div className="flex items-center gap-1.5 min-w-0">
            <span className="font-mono text-xs uppercase tracking-wider text-muted-foreground font-semibold truncate">
              Mục tiêu cứu nạn
            </span>
            <InfoTip text="Kết quả AI YOLO11n từ camera: phân loại Người dưới nước hoặc Tàu thuyền, độ tin cậy và toạ độ bàn giao. Trường thiếu hiển thị N/A." />
          </div>
          <span
            className={`shrink-0 flex items-center gap-1.5 px-2 py-0.5 rounded-full font-mono text-[11px] font-bold ${
              targetCount > 0
                ? 'bg-[var(--kvc-crit-bg)] text-[var(--kvc-crit-ink)]'
                : 'bg-muted text-muted-foreground'
            }`}
          >
            <span
              className={`w-1.5 h-1.5 rounded-full ${
                targetCount > 0 ? 'bg-[var(--kvc-crit)]' : 'bg-muted-foreground'
              }`}
            />
            {targetCount > 0 ? 'PHÁT HIỆN SAR' : 'QUÉT DÒNG NƯỚC'}
          </span>
        </div>

        <div className="my-3">
          <div className="flex items-baseline gap-2">
            <span className="font-mono text-3xl font-black text-[var(--kvc-crit-ink)] tracking-tight tabular-nums">
              {targetCount.toString().padStart(2, '0')}
            </span>
            <span className="text-sm font-bold text-foreground truncate">{targetClassLabel}</span>
          </div>
          <div
            className="mt-1 font-mono text-xs text-foreground font-semibold truncate"
            title={`Track #${targetTrackId} • ${deviceLabel} • ${targetLocationSummary}`}
          >
            {targetCount > 0
              ? `Track #${targetTrackId} • ${deviceLabel} (${confidenceStr}) • ${targetLocationSummary}`
              : source_mode === 'REAL'
                ? 'Chưa có Ingress ESP32 (chế độ REAL)'
                : `AI [${deviceLabel}] đang phân tích luồng thị giác`}
          </div>
        </div>

        <div className="pt-1 text-muted-foreground flex items-center justify-between text-xs">
          <span className="truncate">
            {targetCount > 0
              ? target?.target_confirmed
                ? 'Xác nhận liên tục'
                : 'Phát hiện sơ bộ'
              : 'Chưa có đối tượng trôi dạt'}
          </span>
          <Crosshair className="h-4 w-4 text-[var(--kvc-crit-ink)] shrink-0 ml-1" />
        </div>
      </Card>

      {/* Stat 2: Độ cao siêu âm & GNSS */}
      <Card className="flex flex-col justify-between p-4 sm:p-5 rounded-kvc-panel bg-card border border-border">
        <div className="flex items-center justify-between gap-2">
          <div className="flex items-center gap-1.5 min-w-0">
            <span className="font-mono text-xs uppercase tracking-wider text-muted-foreground font-semibold truncate">
              Độ cao & cảm biến
            </span>
            <InfoTip text="Khoảng cách từ tải bay xuống mặt nước đo bằng cảm biến siêu âm AJ-SR04M và trạng thái khoá vệ tinh 3D Fix của module GNSS." />
          </div>
          <span className="shrink-0 font-mono text-[11px] font-bold text-[var(--kvc-accent-ink)] bg-[var(--kvc-accent-bg)] px-2 py-0.5 rounded-full border border-[var(--kvc-accent-line)]">
            {isLidarLocked ? 'KHOÁ CỰ LY' : 'CHỜ DỮ LIỆU'}
          </span>
        </div>

        <div className="my-3">
          <div className="flex items-baseline gap-1.5">
            <span className="font-mono text-3xl font-black text-[var(--kvc-accent-ink)] tracking-tight tabular-nums">
              {lidarMeters}
            </span>
            <span className="text-xs font-semibold text-muted-foreground">m mặt nước</span>
          </div>
          <div className="mt-1 font-mono text-xs text-foreground truncate">
            {!is_stale &&
            telemetry.imu_valid &&
            (telemetry.roll_deg !== null || telemetry.pitch_deg !== null)
              ? `Siêu âm AJ-SR04M • IMU (R:${telemetry.roll_deg ?? 'N/A'}°, P:${telemetry.pitch_deg ?? 'N/A'}°)`
              : 'Cảm biến: Siêu âm AJ-SR04M • IMU GY-87'}
          </div>
        </div>

        <div className="pt-1 text-muted-foreground flex items-center justify-between text-xs">
          <span className="truncate">
            {!is_stale && telemetry.gps_valid
              ? 'Định vị GNSS 3D Fix hợp lệ'
              : 'Đang chờ khoá vệ tinh GNSS'}
          </span>
          <Mountain className="h-4 w-4 text-[var(--kvc-accent-ink)] shrink-0 ml-1" />
        </div>
      </Card>

      {/* Stat 3: Đường truyền LoRa & RF — gộp cả liên kết/gateway để giảm
          một thẻ KPI trùng lặp. Số gói tin chi tiết nằm ở /devices. */}
      <Card className="flex flex-col justify-between p-4 sm:p-5 rounded-kvc-panel bg-card border border-border">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-1.5">
            <span className="font-mono text-xs uppercase tracking-wider text-muted-foreground font-semibold">
              Đường truyền LoRa & RF
            </span>
            <InfoTip text="Cường độ tín hiệu thu RSSI và tỷ số tín hiệu trên nhiễu SNR của liên kết LoRa SX1278 (433 MHz) từ UAV về trạm mặt đất, kèm trạng thái Gateway." />
          </div>
          <span className={`font-mono text-[11px] font-bold px-2 py-0.5 rounded-full border ${rfStatus.color}`}>
            {rfStatus.label}
          </span>
        </div>

        <div className="my-3">
          <div className="flex items-baseline gap-1.5">
            <span className="font-mono text-3xl font-black text-[var(--kvc-accent-ink)] tracking-tight tabular-nums">
              {rssiStr}
            </span>
            <span className="text-xs font-semibold text-muted-foreground tabular-nums">
              SNR: {snrStr}
            </span>
          </div>
          <div className="mt-1 font-mono text-xs text-foreground truncate">
            {rssi !== null
              ? `433 MHz • BW 125 kHz • SF7${state.sequence_number != null ? ` • #${state.sequence_number}` : ''}`
              : 'Chưa có tín hiệu RF'}
          </div>
        </div>

        <div className="pt-1 text-muted-foreground flex items-center justify-between text-xs">
          <span className="truncate">
            {source_mode === 'REAL'
              ? state.hardware_link.status === 'CONNECTED'
                ? (state.hardware_link.port ?? 'ESP32 Gateway đã nối')
                : 'Chưa có ingress Gateway'
              : APP_CONFIG.MOCK_TRANSPORT === 'LOCAL'
                ? 'Trình duyệt sinh kịch bản'
                : 'Kênh mô phỏng backend'}
          </span>
          <Radio className="h-4 w-4 text-[var(--kvc-accent-ink)] shrink-0 ml-1" />
        </div>
      </Card>
    </div>
  )
}
