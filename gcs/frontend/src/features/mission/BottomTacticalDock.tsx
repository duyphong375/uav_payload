import React, { useState } from 'react'
import {
  AlertTriangle,
  ArrowDownUp,
  BookmarkPlus,
  ChevronDown,
  ChevronUp,
  Compass,
  Copy,
  Crosshair,
  LifeBuoy,
  MapPin,
  Radio,
  User,
  Video,
  VideoOff,
} from 'lucide-react'
import { toast } from 'sonner'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'
import { useMission } from '@/state/MissionProvider'

export interface BottomTacticalDockProps {
  showVideoFeed?: boolean
  onToggleVideoFeed?: () => void
  className?: string
}

/**
 * Thanh Dock Telemetry & SAR HUD trong suốt đặt gọn tại góc dưới bên trái.
 * Đảm bảo 100% diện tích bản đồ được hiển thị trực quan nhất.
 * Cung cấp đầy đủ thông số cho môi trường thử nghiệm (Sa bàn / Local Grid) và thực địa (WGS-84 / LoRa).
 */
export const BottomTacticalDock: React.FC<BottomTacticalDockProps> = ({
  showVideoFeed,
  onToggleVideoFeed,
  className = '',
}) => {
  const { state, dispatch } = useMission()
  const {
    camera_position,
    telemetry,
    target,
    has_target,
    is_stale,
    alerts,
  } = state

  const [isMinimized, setIsMinimized] = useState<boolean>(false)

  const hasGpsFix = Boolean(
    camera_position.is_valid &&
    camera_position.latitude !== null &&
    camera_position.longitude !== null
  )

  const isLocalGrid = target?.coordinate_frame === 'LOCAL_GRID'
  const lidarDistM = telemetry.lidar_range_cm !== null ? telemetry.lidar_range_cm / 100 : null
  const isLidarDangerLow = lidarDistM !== null && lidarDistM < 2.0

  // Tọa độ UAV
  const uavLatStr = hasGpsFix && camera_position.latitude !== null
    ? `${camera_position.latitude.toFixed(6)}° N`
    : 'Chờ GNSS 3D Fix'
  const uavLonStr = hasGpsFix && camera_position.longitude !== null
    ? `${camera_position.longitude.toFixed(6)}° E`
    : ''

  // Sao chép tọa độ UAV
  const handleCopyUavCoord = async () => {
    if (!hasGpsFix || camera_position.latitude === null || camera_position.longitude === null) {
      toast.error('UAV chưa có tọa độ GNSS hợp lệ!')
      return
    }
    const text = `${camera_position.latitude.toFixed(6)}, ${camera_position.longitude.toFixed(6)}`
    try {
      await navigator.clipboard.writeText(text)
      toast.success(`Đã sao chép tọa độ UAV: ${text}`)
    } catch {
      toast.error('Không thể sao chép vào bộ nhớ tạm')
    }
  }

  // Mục tiêu SAR Handover
  const hasTarget = Boolean(has_target && target && target.pos_valid)
  const targetTypeLabel = target?.class_name === 'boat' || target?.class_name === 'lifebuoy'
    ? 'TÀU THUYỀN (Boat)'
    : target?.class_name === 'person'
    ? 'NGƯỜI GẶP NẠN (Person)'
    : 'MỤC TIÊU SAR'

  const targetCoordStr = target?.pos_valid
    ? isLocalGrid
      ? `hệ local X: ${target.local_x_cm ?? 0} cm | Y: ${target.local_y_cm ?? 0} cm`
      : `${target.latitude?.toFixed(6) ?? 'N/A'}° N, ${target.longitude?.toFixed(6) ?? 'N/A'}° E`
    : 'Chưa có tọa độ hợp lệ'

  // Sao chép tọa độ mục tiêu SAR
  const handleCopyTargetCoord = async () => {
    if (!target || !target.pos_valid) {
      toast.error('Chưa có tọa độ mục tiêu hợp lệ để sao chép!')
      return
    }
    const timeStr = new Date().toLocaleTimeString('vi-VN', { hour12: false })
    const confStr = target.confidence !== null ? `${target.confidence}%` : 'N/A'
    const text = isLocalGrid
      ? `[KVC SAR HANDOVER] Track #${target.track_id ?? 101} [${targetTypeLabel}] • Local X: ${target.local_x_cm}cm, Y: ${target.local_y_cm}cm • Độ tin cậy: ${confStr} • Thời điểm: ${timeStr}`
      : `[KVC SAR HANDOVER] Track #${target.track_id ?? 101} [${targetTypeLabel}] • Vĩ độ: ${target.latitude?.toFixed(6)}° N, Kinh độ: ${target.longitude?.toFixed(6)}° E • WGS-84 • Độ tin cậy: ${confStr} • Thời điểm: ${timeStr}`
    
    try {
      await navigator.clipboard.writeText(text)
      toast.success(`Đã sao chép tọa độ bàn giao cứu nạn: ${text}`)
    } catch {
      toast.error('Không thể truy cập clipboard')
    }
  }

  // Đánh dấu mốc sự kiện
  const handleMarkTargetEvent = () => {
    if (!target) return
    dispatch({
      type: 'LOG_EVENT',
      payload: {
        level: 'INFO',
        source: 'SAR_MISSION',
        code: 'SAR_MARK_EVENT',
        message: `Đánh dấu mốc mục tiêu #${target.track_id ?? 101} [${target.class_name}] tại ${targetCoordStr}`,
      },
    })
    toast.success(`Đã đánh dấu sự kiện mục tiêu #${target.track_id ?? 101} vào nhật ký phiên!`)
  }

  // RF Link
  const rssi = is_stale ? null : telemetry.packet_rssi_dbm
  const snr = is_stale ? null : telemetry.packet_snr_db
  const rssiStr = rssi !== null ? `${rssi} dBm` : 'N/A'
  const snrStr = snr !== null ? `${snr > 0 ? `+${snr}` : snr} dB` : 'N/A'

  // Lọc cảnh báo chưa tiếp nhận
  const unacknowledgedAlerts = alerts.filter((a) => a.active && !a.acknowledged)

  return (
    <aside
      className={`absolute bottom-3 left-3 z-[400] max-w-[calc(100vw-24px)] sm:max-w-md lg:max-w-xl select-none pointer-events-auto transition-all duration-300 font-sans ${className}`}
      aria-label="Thanh Dock Đáy Tác Chiến SAR"
    >
      {/* 1. Dạng thu nhỏ siêu gọn (Mini Floating Capsule Chip) */}
      {isMinimized ? (
        <div className="bg-slate-950/85 dark:bg-slate-950/90 backdrop-blur-md border border-white/20 dark:border-white/10 rounded-full px-3 py-1.5 flex items-center gap-2.5 text-xs font-mono text-slate-200 shadow-xl">
          <div className="flex items-center gap-1.5 truncate">
            <button
              type="button"
              onClick={handleCopyUavCoord}
              className="flex items-center gap-1 text-white font-bold hover:text-cyan-300 cursor-pointer"
              title="Nhấp để sao chép tọa độ UAV"
            >
              <MapPin className="h-3 w-3 text-cyan-400 shrink-0" />
              <span className="truncate">{uavLatStr} {uavLonStr}</span>
            </button>
            <span className="text-slate-500">•</span>
            <span className={isLidarDangerLow ? 'text-rose-400 font-bold animate-pulse' : 'text-slate-300'}>
              Siêu âm: {lidarDistM !== null ? `${lidarDistM.toFixed(2)}m` : '—'}
            </span>
            <span className="text-slate-500">•</span>
            <span className="text-slate-300">
              Mũi: {camera_position.heading_deg != null ? `${Math.round(camera_position.heading_deg)}°` : '—'}
            </span>
            <span className="text-slate-500 hidden sm:inline">•</span>
            <span className="text-slate-300 hidden sm:inline">
              LoRa: {rssiStr}
            </span>
          </div>

          <div className="flex items-center gap-1.5 shrink-0 ml-auto">
            {hasTarget ? (
              <Badge className="bg-rose-600 text-white font-mono text-[10px] h-5 px-1.5">
                MỤC TIÊU #{target?.track_id ?? 101}
              </Badge>
            ) : (
              <span className="text-[10px] text-slate-400 hidden md:inline">Đang quét SAR...</span>
            )}
            <Button
              size="icon"
              variant="ghost"
              onClick={() => setIsMinimized(false)}
              className="h-6 w-6 text-cyan-400 hover:text-cyan-300 hover:bg-white/10 rounded-full cursor-pointer"
              title="Mở rộng thanh dock tác chiến"
            >
              <ChevronUp className="h-3.5 w-3.5" />
            </Button>
          </div>
        </div>
      ) : (
        /* 2. Dạng mở rộng: Thanh HUD nổi trong suốt góc dưới trái (Glassmorphism HUD Card) */
        <div className="bg-slate-950/85 dark:bg-slate-950/90 backdrop-blur-md border border-white/20 dark:border-white/10 rounded-2xl shadow-2xl p-2.5 sm:p-3 text-slate-100 flex flex-col gap-2">
          
          {/* Thanh tiêu đề HUD nhỏ gọn + Trạng thái sóng + Nút điều khiển */}
          <div className="flex items-center justify-between gap-2 border-b border-white/10 pb-1.5">
            <div className="flex items-center gap-2 min-w-0">
              <span className="relative flex h-2 w-2 shrink-0">
                <span className={`animate-ping absolute inline-flex h-full w-full rounded-full opacity-75 ${is_stale ? 'bg-amber-400' : 'bg-emerald-400'}`} />
                <span className={`relative inline-flex rounded-full h-2 w-2 ${is_stale ? 'bg-amber-500' : 'bg-emerald-500'}`} />
              </span>
              <span className="text-[10px] font-mono font-bold tracking-wider text-slate-300 uppercase truncate">
                HUD THỜI GIAN THỰC
              </span>
              <span className="text-slate-600">•</span>
              <span className="text-[11px] font-mono text-indigo-300 flex items-center gap-1 truncate">
                <Radio className="h-3 w-3 shrink-0" />
                <span>LoRa: {rssiStr} <span className="text-slate-400 text-[10px]">({snrStr})</span></span>
              </span>
            </div>

            <div className="flex items-center gap-1 shrink-0">
              {/* Nút bật/tắt Video phụ (PiP) nếu có handler */}
              {onToggleVideoFeed && (
                <Tooltip>
                  <TooltipTrigger asChild>
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={onToggleVideoFeed}
                      className="h-6 px-1.5 text-[10px] gap-1 text-slate-300 hover:text-white hover:bg-white/10 rounded-md cursor-pointer"
                      aria-label="Bật tắt Video phụ"
                    >
                      {showVideoFeed ? (
                        <Video className="h-3 w-3 text-cyan-400" />
                      ) : (
                        <VideoOff className="h-3 w-3 text-slate-400" />
                      )}
                      <span className="hidden sm:inline">PiP</span>
                    </Button>
                  </TooltipTrigger>
                  <TooltipContent>
                    <p className="text-xs">{showVideoFeed ? 'Thu nhỏ video PiP' : 'Mở video PiP'}</p>
                  </TooltipContent>
                </Tooltip>
              )}

              {/* Cảnh báo khẩn nếu có */}
              {unacknowledgedAlerts.length > 0 && (
                <div
                  className="px-1.5 py-0.5 rounded bg-rose-500/20 border border-rose-500/40 text-rose-400 text-[10px] font-mono flex items-center gap-1 animate-pulse"
                  title={`Có ${unacknowledgedAlerts.length} cảnh báo chưa tiếp nhận`}
                >
                  <AlertTriangle className="h-3 w-3" />
                  <span>{unacknowledgedAlerts.length}</span>
                </div>
              )}

              {/* Nút thu nhỏ Dock */}
              <Button
                variant="ghost"
                size="icon"
                onClick={() => setIsMinimized(true)}
                className="h-6 w-6 text-slate-400 hover:text-white hover:bg-white/10 rounded-md cursor-pointer"
                title="Thu nhỏ thanh dock tác chiến"
              >
                <ChevronDown className="h-3.5 w-3.5" />
              </Button>
            </div>
          </div>

          {/* ========================================================
              BẢNG THAM SỐ GÓI TIN 32-BYTE CỐ ĐỊNH (FIXED TELEMETRY INSPECTOR)
              Tất cả các trường dữ liệu luôn hiển thị cố định ở mọi thời điểm
              ======================================================== */}
          <div className="flex flex-col gap-2">
            {/* HÀNG 1: TỌA ĐỘ VỊ TRÍ UAV (GPS GNSS) & MỤC TIÊU CỨU NẠN SAR */}
            <div className="grid grid-cols-2 gap-2 bg-white/5 p-2 rounded-xl border border-white/10">
              {/* Cột 1: Vị trí UAV theo GPS */}
              <div className="flex flex-col min-w-0">
                <div className="flex items-center justify-between gap-1">
                  <span className="text-[10px] font-bold text-cyan-400 uppercase tracking-wider flex items-center gap-1">
                    <MapPin className="h-3 w-3 shrink-0" />
                    TỌA ĐỘ UAV (GPS GNSS)
                  </span>
                  <span className={`text-[9px] font-mono font-bold px-1.5 py-0.2 rounded ${hasGpsFix ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/30' : 'bg-amber-500/20 text-amber-300'}`}>
                    {hasGpsFix ? '3D FIX' : 'NO FIX'}
                  </span>
                </div>
                <button
                  type="button"
                  onClick={handleCopyUavCoord}
                  className="text-left font-mono text-xs font-bold text-white hover:text-cyan-300 truncate mt-0.5 cursor-pointer"
                  title="Nhấp để sao chép tọa độ UAV"
                >
                  {hasGpsFix
                    ? `${camera_position.latitude?.toFixed(6)}° N, ${camera_position.longitude?.toFixed(6)}° E`
                    : <span className="text-slate-500 font-normal">Chờ khóa vệ tinh GNSS...</span>}
                </button>
              </div>

              {/* Cột 2: Tọa độ Mục tiêu SAR (WGS-84 / Sa bàn) */}
              <div className="flex flex-col min-w-0 border-l border-white/10 pl-2">
                <div className="flex items-center justify-between gap-1">
                  <span className="text-[10px] font-bold text-emerald-400 uppercase tracking-wider flex items-center gap-1">
                    <Crosshair className="h-3 w-3 shrink-0" />
                    MỤC TIÊU SAR ({isLocalGrid ? 'SA BÀN' : 'WGS-84'})
                  </span>
                  {hasTarget && (
                    <span className="text-[9px] font-mono font-bold px-1.5 py-0.2 rounded bg-rose-500/20 text-rose-300 border border-rose-500/30">
                      {target?.class_id === 1 ? 'PERSON' : target?.class_id === 2 ? 'BOAT' : 'TARGET'}
                    </span>
                  )}
                </div>
                <button
                  type="button"
                  onClick={handleCopyTargetCoord}
                  className="text-left font-mono text-xs font-bold text-white hover:text-emerald-300 truncate mt-0.5 cursor-pointer"
                  title="Nhấp để sao chép tọa độ mục tiêu SAR"
                >
                  {isLocalGrid ? (
                    target?.local_x_cm != null && target?.local_y_cm != null
                      ? `X: ${target.local_x_cm > 0 ? `+${target.local_x_cm}` : target.local_x_cm} cm | Y: ${target.local_y_cm > 0 ? `+${target.local_y_cm}` : target.local_y_cm} cm`
                      : <span className="text-slate-500 font-normal">Chưa có tọa độ sa bàn</span>
                  ) : (
                    target?.latitude != null && target?.longitude != null
                      ? `${target.latitude.toFixed(6)}° N, ${target.longitude.toFixed(6)}° E`
                      : <span className="text-slate-500 font-normal">Đang quét dòng nước...</span>
                  )}
                </button>
              </div>
            </div>

            {/* HÀNG 2: BẢNG THÔNG SỐ GÓI TIN ĐO XA (3 CỘT CỐ ĐỊNH) */}
            <div className="grid grid-cols-3 gap-2 text-xs font-mono bg-white/5 p-2 rounded-xl border border-white/10">
              {/* Ô 1: Cảm biến Siêu âm AJ-SR04M khoảng cách mặt nước */}
              <div className="flex flex-col">
                <span className="text-[10px] text-slate-400 font-sans flex items-center gap-1">
                  <ArrowDownUp className={`h-3 w-3 shrink-0 ${isLidarDangerLow ? 'text-rose-400 animate-pulse' : 'text-cyan-400'}`} />
                  Siêu âm AJ-SR04M:
                </span>
                <span className={`font-bold mt-0.5 ${isLidarDangerLow ? 'text-rose-400 animate-pulse' : telemetry.lidar_range_cm !== null ? 'text-white' : 'text-slate-500 font-normal'}`}>
                  {telemetry.lidar_range_cm !== null ? `${(telemetry.lidar_range_cm / 100).toFixed(2)}m (${telemetry.lidar_range_cm}cm)` : 'N/A'}
                </span>
              </div>

              {/* Ô 2: Tư thế góc nghiêng IMU GY-87 (MPU-6050) */}
              <div className="flex flex-col">
                <span className="text-[10px] text-slate-400 font-sans flex items-center gap-1">
                  <Compass className="h-3 w-3 text-amber-400 shrink-0" />
                  Tư thế IMU GY-87:
                </span>
                <span className="font-bold text-white mt-0.5 truncate">
                  {telemetry.imu_valid ? (
                    <span className="text-amber-300">
                      R:{telemetry.roll_deg != null ? (telemetry.roll_deg > 0 ? `+${telemetry.roll_deg}` : telemetry.roll_deg) : 0}° P:{telemetry.pitch_deg != null ? (telemetry.pitch_deg > 0 ? `+${telemetry.pitch_deg}` : telemetry.pitch_deg) : 0}°
                    </span>
                  ) : (
                    <span className="text-slate-500 font-normal">N/A (Chưa sẵn sàng)</span>
                  )}
                </span>
              </div>

              {/* Ô 3: Đối tượng AI nhận diện & Độ tin cậy */}
              <div className="flex flex-col">
                <span className="text-[10px] text-slate-400 font-sans flex items-center gap-1">
                  {target?.class_id === 1 ? (
                    <User className="h-3 w-3 text-rose-400 shrink-0" />
                  ) : (
                    <LifeBuoy className="h-3 w-3 text-amber-400 shrink-0" />
                  )}
                  AI Nhận diện:
                </span>
                <span className="font-bold text-white mt-0.5 truncate">
                  {target?.class_name && target?.class_name !== 'unknown' ? (
                    <span className={target.class_id === 1 ? 'text-rose-400' : 'text-amber-400'}>
                      {target.class_id === 1 ? 'Người' : target.class_id === 2 ? 'Tàu thuyền' : target.class_name}
                      <span className="text-cyan-300 ml-1">({target.confidence ?? 0}%)</span>
                    </span>
                  ) : (
                    <span className="text-slate-500 font-normal">Quét quang học...</span>
                  )}
                </span>
              </div>

              {/* Ô 4: Cờ cảm biến Sensor Flags */}
              <div className="flex flex-col pt-1.5 border-t border-white/5">
                <span className="text-[10px] text-slate-400 font-sans flex items-center gap-1">
                  <Radio className="h-3 w-3 text-emerald-400 shrink-0" />
                  Cờ Sensor (0x{((telemetry.gps_valid ? 1 : 0) | (telemetry.lidar_valid ? 2 : 0) | (telemetry.imu_valid ? 4 : 0) | (telemetry.ai_detected ? 8 : 0)).toString(16).toUpperCase()}):
                </span>
                <div className="flex items-center gap-1 text-[10px] mt-0.5 font-bold">
                  <span className={telemetry.gps_valid ? 'text-emerald-400' : 'text-slate-600'} title="GPS 3D Fix">GPS</span>
                  <span className="text-slate-600">•</span>
                  <span className={telemetry.lidar_valid ? 'text-emerald-400' : 'text-slate-600'} title="Siêu âm ALT hợp lệ">ALT</span>
                  <span className="text-slate-600">•</span>
                  <span className={telemetry.imu_valid ? 'text-emerald-400' : 'text-slate-600'} title="IMU góc nghiêng hợp lệ">IMU</span>
                  <span className="text-slate-600">•</span>
                  <span className={telemetry.ai_detected ? 'text-rose-400' : 'text-slate-600'} title="AI nhận diện">AI</span>
                </div>
              </div>

              {/* Ô 5: Điện áp Pin UAV */}
              <div className="flex flex-col pt-1.5 border-t border-white/5">
                <span className="text-[10px] text-slate-400 font-sans">Nguồn Pin UAV:</span>
                <span className="font-bold text-white mt-0.5">
                  {telemetry.battery_pct !== null ? `${telemetry.battery_pct}%` : <span className="text-slate-500 font-normal">N/A</span>}
                </span>
              </div>

              {/* Ô 6: Sóng LoRa SX1278 & Gói tin */}
              <div className="flex flex-col pt-1.5 border-t border-white/5">
                <span className="text-[10px] text-slate-400 font-sans">LoRa #{state.sequence_number ?? 0}:</span>
                <span className="font-bold text-indigo-300 mt-0.5 truncate">
                  {rssiStr} <span className="text-slate-400 text-[10px] font-normal">({snrStr})</span>
                </span>
              </div>
            </div>

            {/* HÀNG 3: NÚT THAO TÁC BÀN GIAO CỨU NẠN SAR */}
            <div className="flex items-center justify-between gap-2 pt-0.5">
              <span className="text-[10px] font-mono text-slate-400 truncate">
                {targetCoordStr}
              </span>
              <div className="flex items-center gap-1.5 shrink-0">
                <Button
                  size="sm"
                  variant="default"
                  onClick={handleCopyTargetCoord}
                  className="h-6 px-2 text-[11px] font-semibold gap-1 bg-cyan-600 hover:bg-cyan-500 text-white shadow-xs cursor-pointer"
                  title="Sao chép tọa độ chuẩn bàn giao cứu nạn"
                >
                  <Copy className="h-3 w-3" />
                  <span>Sao chép SAR</span>
                </Button>
                <Button
                  size="sm"
                  variant="outline"
                  onClick={handleMarkTargetEvent}
                  className="h-6 px-1.5 text-[11px] font-semibold gap-1 border-white/20 text-slate-200 hover:bg-white/10 cursor-pointer"
                  title="Đánh dấu mốc sự kiện vào nhật ký phiên"
                >
                  <BookmarkPlus className="h-3 w-3 text-cyan-400" />
                  <span className="hidden sm:inline">Đánh dấu</span>
                </Button>
              </div>
            </div>
          </div>

        </div>
      )}
    </aside>
  )
}

