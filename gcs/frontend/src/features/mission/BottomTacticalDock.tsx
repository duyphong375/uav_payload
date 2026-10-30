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

const overlayChrome =
  'kvc-on-overlay bg-[var(--kvc-overlay)] border border-[var(--kvc-line-strong)] text-[var(--kvc-text-on-overlay)]'

const labelClass = 'text-[11px] font-mono font-semibold tracking-wide text-[var(--kvc-text-on-overlay-muted)]'
const valueClass = 'font-mono tabular-nums text-[var(--kvc-text-on-overlay)]'

/**
 * Thanh dock telemetry & SAR HUD đặt tại góc dưới bên trái.
 * Thông số dùng token ngữ nghĩa; trường thiếu hiển thị N/A, không nội suy.
 */
export const BottomTacticalDock: React.FC<BottomTacticalDockProps> = ({
  showVideoFeed,
  onToggleVideoFeed,
  className = '',
}) => {
  const { state, dispatch } = useMission()
  const { camera_position, telemetry, target, has_target, is_stale, alerts } = state

  const [isMinimized, setIsMinimized] = useState<boolean>(false)

  const hasGpsFix = Boolean(
    camera_position.is_valid &&
    camera_position.latitude !== null &&
    camera_position.longitude !== null
  )

  const isLocalGrid = target?.coordinate_frame === 'LOCAL_GRID'
  const lidarDistM = telemetry.lidar_range_cm !== null ? telemetry.lidar_range_cm / 100 : null
  const isLidarDangerLow = lidarDistM !== null && lidarDistM < 2.0

  const trackLabel = target?.track_id !== null && target?.track_id !== undefined ? `#${target.track_id}` : 'N/A'

  // Tọa độ UAV
  const uavLatStr =
    hasGpsFix && camera_position.latitude !== null ? `${camera_position.latitude.toFixed(6)}° N` : 'N/A'
  const uavLonStr =
    hasGpsFix && camera_position.longitude !== null ? `${camera_position.longitude.toFixed(6)}° E` : ''

  // Sao chép tọa độ UAV
  const handleCopyUavCoord = async () => {
    if (!hasGpsFix || camera_position.latitude === null || camera_position.longitude === null) {
      toast.error('UAV chưa có tọa độ GNSS hợp lệ!')
      return
    }
    const text = `${camera_position.latitude.toFixed(6)}, ${camera_position.longitude.toFixed(6)}`
    try {
      await navigator.clipboard.writeText(text)
      toast.success(`Đã sao chép tọa độ UAV (WGS-84): ${text}`)
    } catch {
      toast.error('Không thể sao chép vào bộ nhớ tạm')
    }
  }

  // Mục tiêu SAR Handover
  const hasTarget = Boolean(has_target && target && target.pos_valid)
  const targetTypeLabel =
    target?.class_name === 'boat' || target?.class_name === 'lifebuoy'
      ? 'TÀU THUYỀN (Boat)'
      : target?.class_name === 'person'
        ? 'NGƯỜI GẶP NẠN (Person)'
        : 'MỤC TIÊU SAR'

  const targetCoordStr = target?.pos_valid
    ? isLocalGrid
      ? `LOCAL (cm) X: ${target.local_x_cm ?? 'N/A'} | Y: ${target.local_y_cm ?? 'N/A'}`
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
      ? `[KVC SAR HANDOVER] Track ${trackLabel} [${targetTypeLabel}] • LOCAL (cm) X: ${target.local_x_cm ?? 'N/A'}, Y: ${target.local_y_cm ?? 'N/A'} • Độ tin cậy: ${confStr} • Thời điểm: ${timeStr}`
      : `[KVC SAR HANDOVER] Track ${trackLabel} [${targetTypeLabel}] • Vĩ độ: ${target.latitude?.toFixed(6) ?? 'N/A'}° N, Kinh độ: ${target.longitude?.toFixed(6) ?? 'N/A'}° E • WGS-84 • Độ tin cậy: ${confStr} • Thời điểm: ${timeStr}`

    try {
      await navigator.clipboard.writeText(text)
      toast.success(`Đã sao chép toạ độ ${isLocalGrid ? 'LOCAL (cm)' : 'WGS-84'} bàn giao cứu nạn: ${text}`)
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
        message: `Đánh dấu mốc mục tiêu ${trackLabel} [${target.class_name}] tại ${targetCoordStr}`,
      },
    })
    toast.success(`Đã đánh dấu sự kiện mục tiêu ${trackLabel} vào nhật ký phiên!`)
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
      className={`absolute bottom-3 left-3 z-[var(--kvc-z-dock)] max-w-[calc(100vw-24px)] sm:max-w-md lg:max-w-xl select-none pointer-events-auto font-sans ${className}`}
      aria-label="Thanh Dock Đáy Tác Chiến SAR"
    >
      {isMinimized ? (
        <div className={`${overlayChrome} rounded-full px-3 py-1.5 flex items-center gap-2.5 text-xs`}>
          <div className="flex items-center gap-1.5 truncate">
            <button
              type="button"
              onClick={handleCopyUavCoord}
              className="flex items-center gap-1 text-[var(--kvc-text-on-overlay)] font-bold hover:text-[var(--kvc-accent-ink)] cursor-pointer"
              title="Sao chép tọa độ UAV (WGS-84)"
            >
              <MapPin className="h-3 w-3 text-[var(--kvc-accent-ink)] shrink-0" />
              <span className="truncate font-mono tabular-nums">
                {uavLatStr} {uavLonStr}
              </span>
            </button>
            <span className="text-[var(--kvc-text-faint)]">•</span>
            <span
              className={
                isLidarDangerLow
                  ? 'text-[var(--kvc-crit-ink)] font-bold'
                  : 'text-[var(--kvc-text-on-overlay-muted)] font-mono tabular-nums'
              }
            >
              Siêu âm: {lidarDistM !== null ? `${lidarDistM.toFixed(2)} m` : 'N/A'}
            </span>
            <span className="text-[var(--kvc-text-faint)] hidden sm:inline">•</span>
            <span className="text-[var(--kvc-text-on-overlay-muted)] font-mono tabular-nums hidden sm:inline">
              LoRa: {rssiStr}
            </span>
          </div>

          <div className="flex items-center gap-1.5 shrink-0 ml-auto">
            {hasTarget ? (
              <Badge className="bg-[var(--kvc-crit-fill)] text-[var(--kvc-text-on-fill)] font-mono text-[11px] h-5 px-1.5">
                MỤC TIÊU {trackLabel}
              </Badge>
            ) : (
              <span className="text-[11px] text-[var(--kvc-text-faint)] hidden md:inline">Chưa có mục tiêu</span>
            )}
            <Button
              size="icon"
              variant="ghost"
              onClick={() => setIsMinimized(false)}
              className="h-6 w-6 text-[var(--kvc-accent-ink)] hover:bg-[var(--kvc-surface-2)]/25 rounded-full cursor-pointer"
              title="Mở rộng thanh dock tác chiến"
            >
              <ChevronUp className="h-3.5 w-3.5" />
            </Button>
          </div>
        </div>
      ) : (
        <div className={`${overlayChrome} rounded-kvc-panel p-2.5 sm:p-3 flex flex-col gap-2`}>
          {/* Tiêu đề + trạng thái sóng + điều khiển */}
          <div className="flex items-center justify-between gap-2 border-b border-[var(--kvc-line)]/50 pb-1.5">
            <div className="flex items-center gap-2 min-w-0">
              <span className="relative flex h-2 w-2 shrink-0">
                <span
                  className={`relative inline-flex rounded-full h-2 w-2 ${
                    is_stale ? 'bg-[var(--kvc-warn)]' : 'bg-[var(--kvc-ok)]'
                  }`}
                />
              </span>
              <span className={`${labelClass} uppercase truncate`}>HUD thời gian thực</span>
              <span className="text-[var(--kvc-text-faint)]">•</span>
              <span className="text-[11px] font-mono text-[var(--kvc-accent-ink)] flex items-center gap-1 truncate tabular-nums">
                <Radio className="h-3 w-3 shrink-0" />
                <span>
                  LoRa {rssiStr}{' '}
                  <span className="text-[var(--kvc-text-faint)] text-[11px]">({snrStr})</span>
                </span>
              </span>
            </div>

            <div className="flex items-center gap-1 shrink-0">
              {onToggleVideoFeed && (
                <Tooltip>
                  <TooltipTrigger asChild>
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={onToggleVideoFeed}
                      className="h-6 px-1.5 text-[11px] gap-1 text-[var(--kvc-text-on-overlay-muted)] hover:text-[var(--kvc-text-on-overlay)] hover:bg-[var(--kvc-surface-2)]/25 rounded-kvc-control cursor-pointer"
                      aria-label="Bật tắt Video phụ"
                    >
                      {showVideoFeed ? <Video className="h-3 w-3" /> : <VideoOff className="h-3 w-3" />}
                      <span className="hidden sm:inline">PiP</span>
                    </Button>
                  </TooltipTrigger>
                  <TooltipContent>
                    <p className="text-xs">{showVideoFeed ? 'Thu nhỏ video PiP' : 'Mở video PiP'}</p>
                  </TooltipContent>
                </Tooltip>
              )}

              {unacknowledgedAlerts.length > 0 && (
                <div
                  className="px-1.5 py-0.5 rounded-kvc-control bg-[var(--kvc-crit-bg)] border border-[var(--kvc-crit-line)] text-[var(--kvc-crit-ink)] text-[11px] font-mono flex items-center gap-1"
                  title={`Có ${unacknowledgedAlerts.length} cảnh báo chưa tiếp nhận`}
                >
                  <AlertTriangle className="h-3 w-3" />
                  <span>{unacknowledgedAlerts.length}</span>
                </div>
              )}

              <Button
                variant="ghost"
                size="icon"
                onClick={() => setIsMinimized(true)}
                className="h-6 w-6 text-[var(--kvc-text-on-overlay-muted)] hover:text-[var(--kvc-text-on-overlay)] hover:bg-[var(--kvc-surface-2)]/25 rounded-kvc-control cursor-pointer"
                title="Thu nhỏ thanh dock tác chiến"
              >
                <ChevronDown className="h-3.5 w-3.5" />
              </Button>
            </div>
          </div>

          <div className="flex flex-col gap-2">
            {/* Hàng 1: toạ độ UAV và mục tiêu */}
            <div className="grid grid-cols-2 gap-2 bg-[var(--kvc-surface-2)]/25 p-2 rounded-kvc-panel border border-[var(--kvc-line)]/40">
              <div className="flex flex-col min-w-0">
                <div className="flex items-center justify-between gap-1">
                  <span className="text-[11px] font-bold text-[var(--kvc-accent-ink)] uppercase tracking-wider flex items-center gap-1">
                    <MapPin className="h-3 w-3 shrink-0" />
                    Toạ độ UAV
                  </span>
                  <span
                    className={`text-[11px] font-mono font-bold px-1.5 py-0.5 rounded-kvc-control border ${
                      hasGpsFix
                        ? 'bg-[var(--kvc-ok-bg)] text-[var(--kvc-ok-ink)] border-[var(--kvc-ok-line)]'
                        : 'bg-[var(--kvc-warn-bg)] text-[var(--kvc-warn-ink)] border-[var(--kvc-warn-line)]'
                    }`}
                  >
                    {hasGpsFix ? '3D FIX' : 'NO FIX'}
                  </span>
                </div>
                <button
                  type="button"
                  onClick={handleCopyUavCoord}
                  className={`text-left text-xs font-bold hover:text-[var(--kvc-accent-ink)] truncate mt-0.5 cursor-pointer ${valueClass}`}
                  title="Sao chép tọa độ UAV (WGS-84)"
                >
                  {hasGpsFix ? (
                    `${camera_position.latitude?.toFixed(6)}° N, ${camera_position.longitude?.toFixed(6)}° E`
                  ) : (
                    <span className="text-[var(--kvc-text-faint)] font-normal">N/A</span>
                  )}
                </button>
              </div>

              <div className="flex flex-col min-w-0 border-l border-[var(--kvc-line)]/40 pl-2">
                <div className="flex items-center justify-between gap-1">
                  <span className="text-[11px] font-bold text-[var(--kvc-ok-ink)] uppercase tracking-wider flex items-center gap-1">
                    <Crosshair className="h-3 w-3 shrink-0" />
                    Mục tiêu ({isLocalGrid ? 'LOCAL (cm)' : 'WGS-84'})
                  </span>
                  {hasTarget && (
                    <span className="text-[11px] font-mono font-bold px-1.5 py-0.5 rounded-kvc-control bg-[var(--kvc-crit-bg)] text-[var(--kvc-crit-ink)] border border-[var(--kvc-crit-line)]">
                      {target?.class_id === 1 ? 'PERSON' : target?.class_id === 2 ? 'LIFEBUOY' : 'TARGET'}
                    </span>
                  )}
                </div>
                <button
                  type="button"
                  onClick={handleCopyTargetCoord}
                  className={`text-left text-xs font-bold hover:text-[var(--kvc-ok-ink)] truncate mt-0.5 cursor-pointer ${valueClass}`}
                  title={isLocalGrid ? 'Sao chép toạ độ LOCAL (cm) — không phải WGS-84' : 'Sao chép toạ độ WGS-84'}
                >
                  {isLocalGrid ? (
                    target?.local_x_cm != null && target?.local_y_cm != null ? (
                      `X ${target.local_x_cm > 0 ? '+' : ''}${target.local_x_cm} cm | Y ${target.local_y_cm > 0 ? '+' : ''}${target.local_y_cm} cm`
                    ) : (
                      <span className="text-[var(--kvc-text-faint)] font-normal">N/A</span>
                    )
                  ) : target?.latitude != null && target?.longitude != null ? (
                    `${target.latitude.toFixed(6)}° N, ${target.longitude.toFixed(6)}° E`
                  ) : (
                    <span className="text-[var(--kvc-text-faint)] font-normal">N/A</span>
                  )}
                </button>
              </div>
            </div>

            {/* Hàng 2: tham số gói tin */}
            <div className="grid grid-cols-3 gap-2 text-xs font-mono bg-[var(--kvc-surface-2)]/25 p-2 rounded-kvc-panel border border-[var(--kvc-line)]/40">
              <div className="flex flex-col">
                <span className={`${labelClass} font-sans flex items-center gap-1`}>
                  <ArrowDownUp
                    className={`h-3 w-3 shrink-0 ${isLidarDangerLow ? 'text-[var(--kvc-crit-ink)]' : 'text-[var(--kvc-accent-ink)]'}`}
                  />
                  Siêu âm:
                </span>
                <span
                  className={`font-bold mt-0.5 tabular-nums ${
                    isLidarDangerLow
                      ? 'text-[var(--kvc-crit-ink)]'
                      : telemetry.lidar_range_cm !== null
                        ? 'text-[var(--kvc-text-on-overlay)]'
                        : 'text-[var(--kvc-text-faint)] font-normal'
                  }`}
                >
                  {telemetry.lidar_range_cm !== null
                    ? `${(telemetry.lidar_range_cm / 100).toFixed(2)} m`
                    : 'N/A'}
                </span>
              </div>

              <div className="flex flex-col">
                <span className={`${labelClass} font-sans flex items-center gap-1`}>
                  <Compass className="h-3 w-3 text-[var(--kvc-warn-ink)] shrink-0" />
                  Tư thế IMU:
                </span>
                <span className="font-bold mt-0.5 truncate tabular-nums">
                  {telemetry.imu_valid ? (
                    <span className="text-[var(--kvc-warn-ink)]">
                      R {telemetry.roll_deg ?? 'N/A'}° / P {telemetry.pitch_deg ?? 'N/A'}°
                    </span>
                  ) : (
                    <span className="text-[var(--kvc-text-faint)] font-normal">N/A</span>
                  )}
                </span>
              </div>

              <div className="flex flex-col">
                <span className={`${labelClass} font-sans flex items-center gap-1`}>
                  {target?.class_id === 1 ? (
                    <User className="h-3 w-3 text-[var(--kvc-crit-ink)] shrink-0" />
                  ) : (
                    <LifeBuoy className="h-3 w-3 text-[var(--kvc-warn-ink)] shrink-0" />
                  )}
                  AI nhận diện:
                </span>
                <span className="font-bold mt-0.5 truncate">
                  {target?.class_name && target?.class_name !== 'unknown' ? (
                    <span
                      className={
                        target.class_id === 1 ? 'text-[var(--kvc-crit-ink)]' : 'text-[var(--kvc-warn-ink)]'
                      }
                    >
                      {target.class_id === 1 ? 'Người' : target.class_id === 2 ? 'Phao/Tàu' : target.class_name}
                      <span className="text-[var(--kvc-text-on-overlay-muted)] ml-1 tabular-nums">
                        ({target.confidence ?? 'N/A'}%)
                      </span>
                    </span>
                  ) : (
                    <span className="text-[var(--kvc-text-faint)] font-normal">N/A</span>
                  )}
                </span>
              </div>

            </div>

            {/* Hàng 3: bàn giao SAR. Toạ độ đã hiển thị đầy đủ ở hàng 1 nên
                hàng này chỉ giữ hai thao tác, không lặp lại số. */}
            <div className="flex items-center justify-end gap-1.5 pt-0.5">
              <div className="flex items-center gap-1.5 shrink-0">
                <Button
                  size="sm"
                  variant="default"
                  onClick={handleCopyTargetCoord}
                  className="h-6 px-2 text-[11px] font-semibold gap-1 cursor-pointer"
                  title={
                    isLocalGrid
                      ? 'Sao chép toạ độ LOCAL (cm) bàn giao — không phải WGS-84'
                      : 'Sao chép toạ độ WGS-84 bàn giao'
                  }
                >
                  <Copy className="h-3 w-3" />
                  <span>{isLocalGrid ? 'Sao chép Local (cm)' : 'Sao chép WGS-84'}</span>
                </Button>
                <Button
                  size="sm"
                  variant="ghost"
                  onClick={handleMarkTargetEvent}
                  className="h-6 px-1.5 text-[11px] font-semibold gap-1 border border-[var(--kvc-line-strong)] bg-transparent text-[var(--kvc-text-on-overlay)] hover:bg-[var(--kvc-surface-2)]/30 hover:text-[var(--kvc-text-on-overlay)] cursor-pointer"
                  title="Đánh dấu mốc sự kiện vào nhật ký phiên"
                >
                  <BookmarkPlus className="h-3 w-3" />
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
