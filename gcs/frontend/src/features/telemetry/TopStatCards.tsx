import React from 'react'
import { Crosshair, Mountain, Radio } from 'lucide-react'
import { APP_CONFIG } from '@/config/appConfig'
import { InfoTip } from '@/components/shared/InfoTip'
import { useMission } from '@/state/MissionProvider'

interface StatCellProps {
  label: string
  infoTip: string
  icon: React.ReactNode
  statusLabel: string
  statusClass: string
  value: React.ReactNode
  valueSub?: React.ReactNode
  detail: string
  detailTitle?: string
  footnote: string
}

const StatCell: React.FC<StatCellProps> = ({
  label,
  infoTip,
  icon,
  statusLabel,
  statusClass,
  value,
  valueSub,
  detail,
  detailTitle,
  footnote,
}) => (
  <div className="flex flex-col gap-1 p-2.5 sm:p-3 min-w-0">
    {/* Nhãn và badge trạng thái: cho phép xuống dòng thay vì ép nhãn còn vài
        ký tự. Trước đây badge `whitespace-nowrap` + nhãn `truncate` trong một
        hàng `justify-between`, nên ở cột hẹp ("CHƯA CÓ INGRESS" ~100 px) nhãn
        bị cắt thành "MỤC TIÊU CỨU…". */}
    <div className="flex flex-wrap items-center justify-between gap-x-2 gap-y-1">
      <div className="flex items-center gap-1.5 min-w-0">
        <span className="shrink-0 text-muted-foreground">{icon}</span>
        <span className="text-[11px] uppercase tracking-wider text-muted-foreground font-semibold truncate">
          {label}
        </span>
        <InfoTip text={infoTip} />
      </div>
      <span
        className={`shrink-0 px-1.5 py-0 rounded font-mono text-[10px] sm:text-[11px] font-bold whitespace-nowrap ${statusClass}`}
      >
        {statusLabel}
      </span>
    </div>

    <div className="flex items-baseline gap-1.5 min-w-0">
      {value}
      {valueSub}
    </div>

    {/* Chi tiết giữ MỘT dòng: dải KPI có ngân sách chiều cao ≤104 px
        @1366×768 (verify_plan002 §13.4), nên không thể nới thành 2 dòng.
        Bù lại, cho phép cuộn ngang trong ô để toạ độ vẫn đọc được đầy đủ. */}
    <div
      className="font-mono text-[11px] text-foreground leading-snug truncate"
      title={detailTitle ?? `${detail} — ${footnote}`}
    >
      {detail}
      <span className="text-muted-foreground">
        <span aria-hidden="true"> · </span>
        {footnote}
      </span>
    </div>
  </div>
)

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
        ? 'Phao cứu sinh (Lifebuoy)'
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
              'text-[var(--kvc-crit-ink)] bg-[var(--kvc-crit-bg)] border border-[var(--kvc-crit-line)]',
          }
        : {
            label: 'CHỜ TÍN HIỆU',
            color: 'text-muted-foreground bg-muted border border-border',
          }
    }
    if (rssi >= -85)
      return {
        label: 'SÓNG TỐT',
        color:
          'text-[var(--kvc-ok-ink)] bg-[var(--kvc-ok-bg)] border border-[var(--kvc-ok-line)]',
      }
    if (rssi >= -105)
      return {
        label: 'SÓNG TRUNG BÌNH',
        color:
          'text-[var(--kvc-warn-ink)] bg-[var(--kvc-warn-bg)] border border-[var(--kvc-warn-line)]',
      }
    return {
      label: 'SÓNG YẾU',
      color:
        'text-[var(--kvc-crit-ink)] bg-[var(--kvc-crit-bg)] border border-[var(--kvc-crit-line)]',
    }
  }

  const rfStatus = getRfStatus()

  return (
    <div
      className={`shrink-0 grid grid-cols-1 md:grid-cols-3 divide-y md:divide-y-0 md:divide-x divide-border rounded-kvc-panel border border-border bg-card shadow-xs ${className}`}
    >
      <StatCell
        label="Mục tiêu cứu nạn"
        infoTip="Kết quả AI YOLO11n: phân loại, độ tin cậy và toạ độ bàn giao. Trường thiếu hiển thị N/A."
        icon={<Crosshair className="h-3.5 w-3.5" />}
        statusLabel={targetCount > 0 ? 'PHÁT HIỆN SAR' : 'QUÉT DÒNG NƯỚC'}
        statusClass={
          targetCount > 0
            ? 'bg-[var(--kvc-crit-bg)] text-[var(--kvc-crit-ink)]'
            : 'bg-muted text-muted-foreground'
        }
        value={
          <span className="font-mono text-2xl font-black text-[var(--kvc-crit-ink)] tabular-nums">
            {targetCount.toString().padStart(2, '0')}
          </span>
        }
        valueSub={
          <span className="text-xs font-bold text-foreground truncate">{targetClassLabel}</span>
        }
        detail={
          targetCount > 0
            ? `Track #${targetTrackId} • ${deviceLabel} (${confidenceStr}) • ${targetLocationSummary}`
            : source_mode === 'REAL'
              ? 'Chưa có Ingress ESP32 (chế độ REAL)'
              : `AI [${deviceLabel}] đang phân tích luồng thị giác`
        }
        detailTitle={
          targetCount > 0
            ? `Track #${targetTrackId} • ${deviceLabel} • ${targetLocationSummary}`
            : undefined
        }
        footnote={
          targetCount > 0
            ? target?.target_confirmed
              ? 'Xác nhận liên tục'
              : 'Phát hiện sơ bộ'
            : 'Chưa có đối tượng trôi dạt'
        }
      />

      <StatCell
        label="Độ cao & cảm biến"
        infoTip="Khoảng cách xuống mặt nước đo bằng siêu âm AJ-SR04M và trạng thái khoá vệ tinh GNSS."
        icon={<Mountain className="h-3.5 w-3.5" />}
        statusLabel={isLidarLocked ? 'KHOÁ CỰ LY' : 'CHỜ DỮ LIỆU'}
        statusClass="bg-[var(--kvc-accent-bg)] text-[var(--kvc-accent-ink)]"
        value={
          <span className="font-mono text-2xl font-black text-[var(--kvc-accent-ink)] tabular-nums">
            {lidarMeters}
          </span>
        }
        valueSub={<span className="text-xs font-semibold text-muted-foreground">m mặt nước</span>}
        detail={
          !is_stale &&
          telemetry.imu_valid &&
          (telemetry.roll_deg !== null || telemetry.pitch_deg !== null)
            ? `Siêu âm AJ-SR04M • IMU (R:${telemetry.roll_deg ?? 'N/A'}°, P:${telemetry.pitch_deg ?? 'N/A'}°)`
            : 'Cảm biến: Siêu âm AJ-SR04M • IMU GY-87'
        }
        footnote={
          !is_stale && telemetry.gps_valid ? 'Định vị GNSS 3D Fix hợp lệ' : 'Đang chờ khoá vệ tinh GNSS'
        }
      />

      <StatCell
        label="Đường truyền LoRa & RF"
        infoTip="RSSI và SNR của liên kết LoRa SX1278 (433 MHz) từ UAV về trạm, kèm trạng thái Gateway."
        icon={<Radio className="h-3.5 w-3.5" />}
        statusLabel={rfStatus.label}
        statusClass={rfStatus.color}
        value={
          <span className="font-mono text-2xl font-black text-[var(--kvc-accent-ink)] tabular-nums">
            {rssiStr}
          </span>
        }
        valueSub={
          <span className="text-xs font-semibold text-muted-foreground tabular-nums">
            SNR: {snrStr}
          </span>
        }
        detail={
          rssi !== null
            ? `433 MHz • BW 125 kHz • SF7${state.sequence_number != null ? ` • #${state.sequence_number}` : ''}`
            : 'Chưa có tín hiệu RF'
        }
        footnote={
          source_mode === 'REAL'
            ? state.hardware_link.status === 'CONNECTED'
              ? (state.hardware_link.port ?? 'ESP32 Gateway đã nối')
              : 'Chưa có ingress Gateway'
            : APP_CONFIG.MOCK_TRANSPORT === 'LOCAL'
              ? 'Trình duyệt sinh kịch bản'
              : 'Kênh mô phỏng backend'
        }
      />
    </div>
  )
}
