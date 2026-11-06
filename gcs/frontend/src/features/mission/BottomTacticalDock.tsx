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
  Gauge,
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
import { OrientationCluster } from '@/features/telemetry/OrientationCluster'
import { SensorFlagsInspector } from '@/features/telemetry/SensorFlagsInspector'
import { WaterClearanceGauge } from '@/features/telemetry/WaterClearanceGauge'
import { APP_CONFIG } from '@/config/appConfig'
import { useHeightTier } from '@/lib/viewport'
import { useMission } from '@/state/MissionProvider'

export interface BottomTacticalDockProps {
  showVideoFeed?: boolean
  onToggleVideoFeed?: () => void
  /**
   * `true` (mặc định): dock tự định vị `absolute bottom-3 left-3` như trước.
   * `false`: dock nằm trong luồng của overlay rail do MissionPage bố trí, nhờ
   * vậy nó không bao giờ đè lên cụm điều khiển khung nhìn ở màn hình hẹp.
   */
  anchored?: boolean
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
  anchored = true,
  className = '',
}) => {
  const { state, dispatch } = useMission()
  const { camera_position, telemetry, target, has_target, is_stale, alerts } = state
  const heightTier = useHeightTier()

  // Màn hình thấp: dock mở rộng chiếm gần hết chiều cao còn lại của bản đồ,
  // nên mặc định thu nhỏ. Người vận hành vẫn mở lại được bằng một nút.
  const [isMinimized, setIsMinimized] = useState<boolean>(() => heightTier === 'tight')
  const [showInstruments, setShowInstruments] = useState<boolean>(false)

  const hasGpsFix = Boolean(
    camera_position.is_valid &&
    camera_position.latitude !== null &&
    camera_position.longitude !== null
  )

  const isLocalGrid = target?.coordinate_frame === 'LOCAL_GRID'
  const lidarDistM = telemetry.lidar_range_cm !== null ? telemetry.lidar_range_cm / 100 : null
  const isLidarDangerLow = lidarDistM !== null && lidarDistM < APP_CONFIG.LIDAR_DANGER_M

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
      ? 'PHAO CỨU SINH (Lifebuoy)'
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

  // Đánh dấu mốc sự kiện vào nhật ký phiên
  const handleMarkTargetEvent = () => {
    if (target && target.pos_valid) {
      dispatch({
        type: 'LOG_EVENT',
        payload: {
          level: 'INFO',
          source: 'SAR_MISSION',
          code: 'SAR_MARK_EVENT',
          message: `Đánh dấu mốc mục tiêu ${trackLabel} [${targetTypeLabel}] tại ${targetCoordStr}`,
        },
      })
      toast.success(`Đã đánh dấu sự kiện mục tiêu ${trackLabel} vào nhật ký phiên!`)
      return
    }

    if (hasGpsFix && camera_position.latitude !== null && camera_position.longitude !== null) {
      dispatch({
        type: 'LOG_EVENT',
        payload: {
          level: 'INFO',
          source: 'SAR_MISSION',
          code: 'SAR_MARK_EVENT',
          message: `Người vận hành đánh dấu mốc toạ độ UAV tại ${camera_position.latitude.toFixed(6)}° N, ${camera_position.longitude.toFixed(6)}° E`,
        },
      })
      toast.success('Đã ghi nhận mốc toạ độ UAV vào nhật ký phiên!')
      return
    }

    toast.error('Chưa có tọa độ mục tiêu hoặc UAV hợp lệ để đánh dấu!')
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
      data-overlay="tactical-dock"
      className={
        anchored
          ? `absolute bottom-3 left-3 z-[var(--kvc-z-dock)] max-w-[calc(100vw-24px)] sm:max-w-md lg:max-w-xl select-none pointer-events-auto font-sans ${className}`
          : `w-full select-none pointer-events-auto font-sans ${className}`
      }
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
        <div
          className={`${overlayChrome} rounded-kvc-panel p-2.5 sm:p-3 flex flex-col gap-2 max-h-[min(46dvh,22rem)] overflow-y-auto`}
        >
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

          <div className="flex flex-col gap-1.5">
            {/* Hàng 1 (chính): toạ độ UAV và mục tiêu — thứ bậc cao nhất */}
            <div className="grid grid-cols-2 gap-2 bg-[var(--kvc-surface-2)]/25 p-2 rounded-kvc-panel border border-[var(--kvc-line)]/40">
              <div className="flex flex-col min-w-0">
                <div className="flex items-center justify-between gap-1 flex-wrap">
                  <span className="text-[11px] font-bold text-[var(--kvc-accent-ink)] uppercase tracking-wider flex items-center gap-1 shrink-0">
                    <MapPin className="h-3 w-3 shrink-0" />
                    Toạ độ UAV
                  </span>
                  <span
                    className={`text-[10px] font-mono font-bold px-1 py-0.2 rounded border shrink-0 ${
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
                <div className="flex items-center justify-between gap-1 flex-wrap">
                  <span className="text-[11px] font-bold text-[var(--kvc-ok-ink)] uppercase tracking-wider flex items-center gap-1 shrink-0 truncate">
                    <Crosshair className="h-3 w-3 shrink-0" />
                    Mục tiêu ({isLocalGrid ? 'LOCAL' : 'WGS-84'})
                  </span>
                  {hasTarget && (
                    <span className="text-[10px] font-mono font-bold px-1 py-0.2 rounded bg-[var(--kvc-crit-bg)] text-[var(--kvc-crit-ink)] border border-[var(--kvc-crit-line)] shrink-0">
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
                      `X ${target.local_x_cm > 0 ? '+' : ''}${target.local_x_cm} | Y ${target.local_y_cm > 0 ? '+' : ''}${target.local_y_cm} cm`
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

            {/* Hàng 2: chỉ số then chốt + thao tác.
                Dụng cụ đo chi tiết nằm sau nút "Chi tiết" thay vì nổi riêng trên bản đồ. */}
            <div className="flex items-center justify-between gap-2 flex-wrap">
              <div className="flex flex-wrap items-center gap-x-2.5 gap-y-1 font-mono text-[11px] min-w-0">
                <span className="flex items-center gap-1 shrink-0">
                  <ArrowDownUp
                    className={`h-3 w-3 shrink-0 ${isLidarDangerLow ? 'text-[var(--kvc-crit-ink)]' : 'text-[var(--kvc-text-muted)]'}`}
                  />
                  <span className="text-[var(--kvc-text-muted)]">Siêu âm</span>
                  <span
                    className={`font-bold tabular-nums ${
                      isLidarDangerLow
                        ? 'text-[var(--kvc-crit-ink)]'
                        : telemetry.lidar_range_cm !== null
                          ? 'text-[var(--kvc-text)]'
                          : 'text-[var(--kvc-text-faint)]'
                    }`}
                  >
                    {telemetry.lidar_range_cm !== null
                      ? `${(telemetry.lidar_range_cm / 100).toFixed(2)} m`
                      : 'N/A'}
                  </span>
                </span>

                <span className="h-3 w-px bg-[var(--kvc-line-strong)] shrink-0 hidden xs:inline" aria-hidden="true" />

                <span className="flex items-center gap-1 shrink-0">
                  <Compass className="h-3 w-3 shrink-0 text-[var(--kvc-text-muted)]" />
                  <span className="text-[var(--kvc-text-muted)]">IMU</span>
                  <span className={`font-bold tabular-nums ${telemetry.imu_valid ? 'text-[var(--kvc-text)]' : 'text-[var(--kvc-text-faint)]'}`}>
                    {telemetry.imu_valid
                      ? `R${telemetry.roll_deg ?? 'N/A'}/P${telemetry.pitch_deg ?? 'N/A'}°`
                      : 'N/A'}
                  </span>
                </span>

                <span className="h-3 w-px bg-[var(--kvc-line-strong)] shrink-0 hidden xs:inline" aria-hidden="true" />

                <span className="flex items-center gap-1 min-w-0 max-w-[190px] shrink-0" title={target?.class_name}>
                  {target?.class_id === 1 ? (
                    <User className="h-3 w-3 shrink-0 text-[var(--kvc-crit-ink)]" />
                  ) : (
                    <LifeBuoy className="h-3 w-3 shrink-0 text-[var(--kvc-warn-ink)]" />
                  )}
                  <span className={`font-bold truncate ${target?.class_name && target?.class_name !== 'unknown' ? 'text-[var(--kvc-text)]' : 'text-[var(--kvc-text-faint)]'}`}>
                    {target?.class_name && target?.class_name !== 'unknown'
                      ? `${target.class_id === 1 ? 'Người' : target.class_id === 2 ? 'Phao' : target.class_name} (${target.confidence ?? 'N/A'}%)`
                      : 'N/A'}
                  </span>
                </span>
              </div>

              <div className="flex items-center gap-1.5 shrink-0">
                <Button
                  size="sm"
                  variant="ghost"
                  onClick={() => setShowInstruments((v) => !v)}
                  aria-expanded={showInstruments}
                  aria-label={showInstruments ? 'Thu gọn dụng cụ đo' : 'Mở rộng dụng cụ đo'}
                  className="h-6 px-1.5 text-[11px] font-semibold gap-1 text-[var(--kvc-text-muted)] hover:text-[var(--kvc-text)] cursor-pointer"
                  title="Ống đo mặt nước, la bàn, cờ cảm biến"
                >
                  <Gauge className="h-3 w-3" />
                  <span>{showInstruments ? 'Ẩn' : 'Chi tiết'}</span>
                </Button>
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
                  <span>{isLocalGrid ? 'Sao chép Local' : 'Sao chép WGS-84'}</span>
                </Button>
                <Button
                  size="sm"
                  variant="ghost"
                  onClick={handleMarkTargetEvent}
                  className="h-6 px-1.5 text-[11px] font-semibold gap-1 border border-[var(--kvc-line-strong)] bg-transparent text-[var(--kvc-text)] hover:bg-[var(--kvc-surface-2)]/30 hover:text-[var(--kvc-text)] cursor-pointer"
                  title="Đánh dấu mốc sự kiện vào nhật ký phiên"
                >
                  <BookmarkPlus className="h-3 w-3" />
                  <span className="hidden sm:inline">Đánh dấu</span>
                </Button>
              </div>
            </div>

            {/* Dụng cụ đo — gộp trong dock, bố trí 3 cột ngang cho khớp bề rộng dock
                để không tăng chiều cao quá nhiều khi mở rộng. */}
            {showInstruments && (
              <div className="grid grid-cols-3 gap-2 border-t border-[var(--kvc-line)]/50 pt-2 items-start">
                <div className="flex flex-col h-full">
                  <WaterClearanceGauge
                    rangeCm={telemetry.lidar_range_cm}
                    valid={telemetry.lidar_valid}
                    stale={is_stale}
                  />
                </div>
                <div className="flex flex-col h-full">
                  <OrientationCluster
                    headingDeg={camera_position.heading_deg ?? null}
                    rollDeg={telemetry.roll_deg}
                    pitchDeg={telemetry.pitch_deg}
                    imuValid={telemetry.imu_valid}
                    stale={is_stale}
                  />
                </div>
                <div className="flex flex-col h-full">
                  <SensorFlagsInspector
                    gpsValid={telemetry.gps_valid}
                    lidarValid={telemetry.lidar_valid}
                    imuValid={telemetry.imu_valid}
                    aiDetected={telemetry.ai_detected}
                    sequenceNumber={state.sequence_number}
                  />
                </div>
              </div>
            )}
          </div>
        </div>
      )}
    </aside>
  )
}
