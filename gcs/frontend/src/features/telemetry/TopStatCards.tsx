import React from 'react'
import {
  BatteryCharging,
  Crosshair,
  Mountain,
  Radio,
} from 'lucide-react'
import { APP_CONFIG } from '@/config/appConfig'
import { InfoTip } from '@/components/shared/InfoTip'
import { Card } from '@/components/ui/card'
import { useMission } from '@/state/MissionProvider'

export const TopStatCards: React.FC<{ className?: string }> = ({ className = '' }) => {
  const { state } = useMission()
  const {
    telemetry,
    has_target,
    target,
    bounding_boxes,
    inference_device,
    is_stale,
    source_mode,
  } = state

  const targetCount = is_stale ? 0 : bounding_boxes.length || (has_target ? 1 : 0)
  const isLocalGrid = target?.coordinate_frame === 'LOCAL_GRID'
  const hasValidTarget = !is_stale && has_target && target?.pos_valid && target.coordinate_frame === 'WGS84' && telemetry.gps_valid
  const targetLatStr = hasValidTarget && target?.latitude !== null ? target?.latitude?.toFixed(6) + '°' : 'N/A'
  const targetLonStr = hasValidTarget && target?.longitude !== null ? target?.longitude?.toFixed(6) + '°' : 'N/A'
  const targetLocationSummary = isLocalGrid
    ? (target?.local_x_cm != null && target?.local_y_cm != null ? `Local Grid: (${target.local_x_cm}, ${target.local_y_cm}) cm` : 'Local Grid: N/A')
    : (hasValidTarget ? `WGS84: ${targetLatStr}, ${targetLonStr}` : 'Tọa độ: N/A')

  const targetTrackId = !is_stale ? target?.track_id ?? 'N/A' : 'N/A'
  const isLidarLocked = !is_stale && telemetry.lidar_valid && telemetry.lidar_range_cm !== null
  const lidarMeters = isLidarLocked ? (telemetry.lidar_range_cm! / 100).toFixed(2) : 'N/A'
  const batteryPct = is_stale ? null : telemetry.battery_pct
  const isLowBattery = batteryPct !== null && batteryPct <= 20
  const rawConfidence = is_stale ? null : target?.confidence ?? (bounding_boxes[0] ? bounding_boxes[0].confidence * 100 : null)
  const confidenceStr = rawConfidence === null ? 'N/A' : rawConfidence.toFixed(1) + '%'
  const targetClassLabel = targetCount === 0 ? 'Chưa phát hiện' : target?.class_name === 'boat' || target?.class_name === 'lifebuoy' ? 'Tàu thuyền (Boat)' : target?.class_name === 'person' ? 'Người gặp nạn (Person)' : 'Đối tượng SAR'
  const deviceLabel = inference_device === 'FPGA_GW2A' ? 'FPGA GW2A' : inference_device === 'PC_REFERENCE' ? 'PC REFERENCE' : inference_device === 'SIMULATED' ? 'MÔ PHỎNG' : 'AI ENGINE'

  // Chất lượng tín hiệu sóng LoRa SX1278
  const rssi = is_stale ? null : telemetry.packet_rssi_dbm
  const snr = is_stale ? null : telemetry.packet_snr_db
  const rssiStr = rssi !== null ? `${rssi} dBm` : 'N/A'
  const snrStr = snr !== null ? `${snr > 0 ? `+${snr}` : snr} dB` : 'N/A'

  const getRfStatus = () => {
    if (rssi === null) {
      return source_mode === 'REAL'
        ? { label: 'CHƯA CÓ INGRESS', color: 'text-rose-600 dark:text-rose-400 bg-rose-500/10 border-rose-500/30' }
        : { label: 'CHỜ TÍN HIỆU', color: 'text-muted-foreground bg-muted border-border' }
    }
    if (rssi >= -85) return { label: 'SÓNG TỐT', color: 'text-emerald-600 dark:text-emerald-400 bg-emerald-500/10 border-emerald-500/30' }
    if (rssi >= -105) return { label: 'SÓNG TRUNG BÌNH', color: 'text-amber-600 dark:text-amber-400 bg-amber-500/10 border-amber-500/30' }
    return { label: 'SÓNG YẾU', color: 'text-rose-600 dark:text-rose-400 bg-rose-500/10 border-rose-500/30' }
  }

  const rfStatus = getRfStatus()

  return (
    <div className={`shrink-0 grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-3 sm:gap-4 ${className}`}>
      {/* Stat 1: Mục tiêu cứu nạn (Gộp Nhận diện AI + Tọa độ SAR) */}
      <Card className="relative overflow-hidden flex flex-col justify-between p-4 sm:p-5 rounded-2xl bg-card border border-border shadow-xs hover:border-rose-500/40 transition-colors">
        <div className="absolute -top-12 -right-12 w-28 h-28 bg-rose-500/10 rounded-full blur-2xl pointer-events-none" />
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-1.5">
            <span className="font-mono text-xs uppercase tracking-wider text-muted-foreground font-semibold">
              Mục tiêu cứu nạn
            </span>
            <InfoTip text="Kết quả AI YOLO11n nhận diện từ camera: phân loại Người dưới nước (Class 1) hoặc Tàu thuyền (Class 2), độ tin cậy và tọa độ GPS bàn giao." />
          </div>
          <span className={`flex items-center gap-1.5 px-2 py-0.5 rounded-full font-mono text-[10px] font-bold ${
            targetCount > 0
              ? 'bg-rose-500/20 text-rose-600 dark:text-rose-400'
              : 'bg-muted text-muted-foreground'
          }`}>
            <span className={`w-1.5 h-1.5 rounded-full ${targetCount > 0 ? 'bg-rose-500 animate-pulse' : 'bg-muted-foreground'}`} />
            {targetCount > 0 ? 'PHÁT HIỆN SAR' : 'QUÉT DÒNG NƯỚC'}
          </span>
        </div>

        <div className="my-3">
          <div className="flex items-baseline gap-2">
            <span className="font-mono text-3xl font-black text-rose-500 tracking-tight">
              {targetCount.toString().padStart(2, '0')}
            </span>
            <span className="text-sm font-bold text-foreground truncate">{targetClassLabel}</span>
          </div>
          <div className="mt-1 font-mono text-xs text-foreground font-semibold truncate" title={`Track #${targetTrackId} • ${deviceLabel} • ${targetLocationSummary}`}>
            {targetCount > 0 ? `Track #${targetTrackId} • ${deviceLabel} (${confidenceStr}) • ${targetLocationSummary}` : source_mode === 'REAL' ? 'Chưa có Ingress ESP32 (Chế độ Real)' : `AI [${deviceLabel}] đang phân tích luồng thị giác`}
          </div>
        </div>

        <div className="pt-1 text-muted-foreground flex items-center justify-between text-xs">
          <span className="truncate">
            {targetCount > 0 ? (target?.target_confirmed ? 'Xác nhận liên tục (≥3 frame)' : 'Phát hiện sơ bộ (<3 frame)') : 'Chưa có đối tượng trôi dạt'}
          </span>
          <Crosshair className="h-4 w-4 text-rose-500 shrink-0 ml-1" />
        </div>
      </Card>

      {/* Stat 2: Độ cao Siêu âm & GNSS */}
      <Card className="relative overflow-hidden flex flex-col justify-between p-4 sm:p-5 rounded-2xl bg-card border border-border shadow-xs hover:border-cyan-500/40 transition-colors">
        <div className="absolute -top-12 -right-12 w-28 h-28 bg-cyan-500/10 rounded-full blur-2xl pointer-events-none" />
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-1.5">
            <span className="font-mono text-xs uppercase tracking-wider text-muted-foreground font-semibold">
              Độ cao & Cảm biến
            </span>
            <InfoTip text="Khoảng cách từ tải bay xuống mặt nước đo bằng cảm biến siêu âm chống nước AJ-SR04M và trạng thái khóa vệ tinh 3D Fix của module GNSS." />
          </div>
          <span className="font-mono text-[10px] font-bold text-cyan-600 dark:text-cyan-400 bg-cyan-500/10 px-2 py-0.5 rounded-full border border-cyan-500/20">
            {isLidarLocked ? 'SIÊU ÂM KHÓA CỰ LY' : 'CHỜ DỮ LIỆU'}
          </span>
        </div>

        <div className="my-3">
          <div className="flex items-baseline gap-1.5">
            <span className="font-mono text-3xl font-black text-cyan-600 dark:text-cyan-400 tracking-tight">
              {lidarMeters}
            </span>
            <span className="text-xs font-semibold text-muted-foreground">m mặt nước</span>
          </div>
          <div className="mt-1 font-mono text-xs text-foreground truncate">
            {!is_stale && telemetry.imu_valid && (telemetry.roll_deg !== null || telemetry.pitch_deg !== null)
              ? `Siêu âm AJ-SR04M • IMU (R:${telemetry.roll_deg ?? 0}°, P:${telemetry.pitch_deg ?? 0}°)`
              : 'Cảm biến: Siêu âm AJ-SR04M • IMU GY-87'}
          </div>
        </div>

        <div className="pt-1 text-muted-foreground flex items-center justify-between text-xs">
          <span className="truncate">
            {!is_stale && telemetry.gps_valid ? 'Định vị GNSS 3D Fix hợp lệ' : 'Đang chờ khóa vệ tinh GNSS'}
          </span>
          <Mountain className="h-4 w-4 text-cyan-500 shrink-0 ml-1" />
        </div>
      </Card>

      {/* Stat 3: Nguồn & Pin tải KVC */}
      <Card className="relative overflow-hidden flex flex-col justify-between p-4 sm:p-5 rounded-2xl bg-card border border-border shadow-xs hover:border-emerald-500/40 transition-colors">
        <div className="absolute -top-12 -right-12 w-28 h-28 bg-emerald-500/10 rounded-full blur-2xl pointer-events-none" />
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-1.5">
            <span className="font-mono text-xs uppercase tracking-wider text-muted-foreground font-semibold">
              Nguồn & Pin tải KVC
            </span>
            <InfoTip text="Điện áp và phần trăm dung lượng pin 3S LiPo của tải UAV, cảnh báo đỏ khi pin dưới 20% để hạ cánh an toàn." />
          </div>
          <span className={`font-mono text-[10px] font-bold px-2 py-0.5 rounded-full border ${
            isLowBattery
              ? 'text-rose-500 bg-rose-500/10 border-rose-500/30'
              : 'text-emerald-600 dark:text-emerald-400 bg-emerald-500/10 border-emerald-500/20'
          }`}>
            {isLowBattery ? 'PIN YẾU' : batteryPct === null ? 'N/A' : '3S LiPo'}
          </span>
        </div>

        <div className="my-3">
          <div className="flex items-baseline gap-1.5">
            <span className={`font-mono text-3xl font-black tracking-tight ${
              isLowBattery ? 'text-rose-500' : 'text-emerald-600 dark:text-emerald-400'
            }`}>
              {batteryPct === null ? 'N/A' : batteryPct + '%'}
            </span>
            <span className="text-xs font-semibold text-muted-foreground">
              {batteryPct !== null ? 'Điện áp 12.6V max' : 'Chưa có dữ liệu'}
            </span>
          </div>
          <div className="mt-1 font-mono text-xs text-foreground truncate">
            {batteryPct !== null ? (batteryPct > 20 ? 'Mức điện áp an toàn tải bay' : 'Cảnh báo: Pin sắp cạn') : 'N/A'}
          </div>
        </div>

        <div className="pt-1 text-muted-foreground flex items-center justify-between text-xs">
          <span className="truncate">
            Giám sát nguồn tải • UAV KVC
          </span>
          <BatteryCharging className="h-4 w-4 text-emerald-500 shrink-0 ml-1" />
        </div>
      </Card>

      {/* Stat 4: MỚI - Chất lượng đường truyền vô tuyến LoRa & ESP32 (Thay thế card trùng lặp) */}
      <Card className="relative overflow-hidden flex flex-col justify-between p-4 sm:p-5 rounded-2xl bg-card border border-border shadow-xs hover:border-indigo-500/40 transition-colors">
        <div className="absolute -top-12 -right-12 w-28 h-28 bg-indigo-500/10 rounded-full blur-2xl pointer-events-none" />
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-1.5">
            <span className="font-mono text-xs uppercase tracking-wider text-muted-foreground font-semibold">
              Đường truyền LoRa & RF
            </span>
            <InfoTip text="Cường độ tín hiệu thu RSSI và tỷ số tín hiệu trên nhiễu SNR của liên kết sóng vô tuyến LoRa SX1278 (433MHz) từ UAV về trạm mặt đất." />
          </div>
          <span className={`font-mono text-[10px] font-bold px-2 py-0.5 rounded-full border ${rfStatus.color}`}>
            {rfStatus.label}
          </span>
        </div>

        <div className="my-3">
          <div className="flex items-baseline gap-1.5">
            <span className="font-mono text-3xl font-black text-indigo-600 dark:text-indigo-400 tracking-tight">
              {rssiStr}
            </span>
            <span className="text-xs font-semibold text-muted-foreground">SNR: {snrStr}</span>
          </div>
          <div className="mt-1 font-mono text-xs text-foreground truncate">
            {rssi !== null ? 'Tần số: 433MHz • Băng thông 125kHz • SF7' : 'Chưa có tín hiệu RF'}
          </div>
        </div>

        <div className="pt-1 text-muted-foreground flex items-center justify-between text-xs">
          <span className="truncate">
            {source_mode === 'REAL'
              ? (state.hardware_link.status === 'CONNECTED' ? 'Gateway ESP32-C3 SoftAP' : 'Chưa có ingress Gateway')
              : (APP_CONFIG.MOCK_TRANSPORT === 'LOCAL' ? 'Trình duyệt sinh kịch bản' : 'Kênh mô phỏng backend')}
          </span>
          <Radio className="h-4 w-4 text-indigo-500 shrink-0 ml-1" />
        </div>
      </Card>
    </div>
  )
}

