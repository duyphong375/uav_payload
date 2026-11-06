import React, { useState } from 'react'
import {
  AlertCircle,
  AlertTriangle,
  ChevronDown,
  Compass,
  Radio,
  Video,
  VideoOff,
  X,
} from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { GpsMapPanel } from '@/features/map/GpsMapPanel'
import { MapGnssBanner } from '@/features/map/MapGnssBanner'
import { MapLayerSwitcher } from '@/features/map/MapLayerSwitcher'
import { LocalRadarPanel } from '@/features/radar/LocalRadarPanel'
import { VideoPanel } from '@/features/video/VideoPanel'
import { useHeightTier } from '@/lib/viewport'
import { useMission } from '@/state/MissionProvider'
import { BottomTacticalDock } from './BottomTacticalDock'
import { FloatingMapControls } from './FloatingMapControls'

export type ViewportMode = 'MAP' | 'RADAR' | 'VIDEO'

const VIEWPORT_MODES: Array<{
  mode: ViewportMode
  icon: React.ReactNode
  label: string
  shortLabel: string
  ariaLabel: string
}> = [
  {
    mode: 'MAP',
    icon: <Compass className="h-3.5 w-3.5" />,
    label: 'Bản đồ WGS-84',
    shortLabel: 'Bản đồ',
    ariaLabel: 'Xem Bản đồ WGS-84',
  },
  {
    mode: 'RADAR',
    icon: <Radio className="h-3.5 w-3.5" />,
    label: 'Radar Local (cm)',
    shortLabel: 'Radar',
    ariaLabel: 'Xem Radar Local (Hệ Local)',
  },
  {
    mode: 'VIDEO',
    icon: <Video className="h-3.5 w-3.5" />,
    label: 'Video Stream (ESP32-S3-CAM)',
    shortLabel: 'Video Stream',
    ariaLabel: 'Xem Video Stream từ ESP32-S3-CAM',
  },
]

/** Overlay chrome dùng chung cho thanh nổi trên bản đồ: một lớp kính duy nhất. */
const overlayChrome =
  'kvc-on-overlay bg-[var(--kvc-overlay)] border border-[var(--kvc-line-strong)] text-[var(--kvc-text-on-overlay)]'

const modeButtonClass = (active: boolean) =>
  active
    ? 'bg-[var(--kvc-accent-fill)] text-[var(--kvc-text-on-fill)] border-[var(--kvc-accent)]'
    : 'text-[var(--kvc-text-on-overlay-muted)] border-transparent hover:text-[var(--kvc-text-on-overlay)] hover:bg-[var(--kvc-surface-2)]/25'

const readTopBarPreference = (): boolean | null => {
  try {
    const saved = localStorage.getItem('kvc_topbar_collapsed')
    return saved === null ? null : saved === 'true'
  } catch {
    return null
  }
}

export const MissionPage: React.FC = () => {
  const { state, dispatch } = useMission()
  const { target, alerts } = state
  const heightTier = useHeightTier()

  // Chế độ hiển thị khung nhìn định vị (Bản đồ WGS-84 | Radar Hệ Local | Video)
  const [viewportMode, setViewportMode] = useState<ViewportMode>('MAP')

  // Lớp nền bản đồ: bản đồ số (2D) hoặc ảnh vệ tinh (3D). State nằm ở đây để
  // nút chuyển lớp được bố trí trong overlay rail, không nổi riêng trong khung
  // bản đồ (nơi nó từng đè lên dock/PiP ở màn hình nhỏ).
  const [mapLayerMode, setMapLayerMode] = useState<'2D' | '3D'>('2D')

  // Bật/tắt video phụ dạng PiP (mặc định thu gọn để tối đa diện tích bản đồ)
  const [showVideoFeed, setShowVideoFeed] = useState<boolean>(false)

  // Thanh thu của thanh điều khiển trên cùng để tăng diện tích hiển thị bản đồ.
  // Màn hình thấp (laptop 768 px có thanh trình duyệt, hoặc zoom 125 %) mặc định
  // thu gọn; lựa chọn thủ công của người vận hành vẫn được ưu tiên nếu đã lưu.
  const [isTopBarCollapsed, setIsTopBarCollapsed] = useState<boolean>(() => {
    const saved = readTopBarPreference()
    if (saved !== null) return saved
    return heightTier !== 'regular'
  })

  const toggleTopBarCollapse = () => {
    setIsTopBarCollapsed((prev) => {
      const next = !prev
      try {
        localStorage.setItem('kvc_topbar_collapsed', String(next))
      } catch {
        // ignore
      }
      return next
    })
  }

  // Cửa sổ quá thấp thì đóng PiP: dock đã chiếm đáy, giữ PiP sẽ đè lên nhau.
  React.useEffect(() => {
    if (heightTier === 'tight') setShowVideoFeed(false)
  }, [heightTier])

  // Phím tắt 'T' để thu gọn / mở rộng nhanh thanh điều khiển nổi
  React.useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (
        e.target instanceof HTMLInputElement ||
        e.target instanceof HTMLTextAreaElement ||
        e.target instanceof HTMLSelectElement
      ) {
        return
      }
      if (e.key === 't' || e.key === 'T') {
        toggleTopBarCollapse()
      }
      // Esc đóng lớp phủ đang mở (video PiP) trước khi đóng gì khác.
      if (e.key === 'Escape') {
        setShowVideoFeed(false)
      }
    }
    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [])

  const isLocalGrid = target?.coordinate_frame === 'LOCAL_GRID'
  const hasGpsFix =
    state.camera_position.is_valid &&
    state.camera_position.latitude !== null &&
    state.camera_position.longitude !== null

  // Lọc các cảnh báo nguy cấp đang hoạt động chưa tiếp nhận
  const criticalAlert = alerts.find(
    (a) => a.active && (a.level === 'CRITICAL' || a.level === 'WARN') && !a.acknowledged
  )

  const gnssBanner = !hasGpsFix && viewportMode === 'MAP'
  const localGridNotice = isLocalGrid && viewportMode === 'MAP'
  const hasBannerRow = Boolean(criticalAlert) || gnssBanner || localGridNotice

  // Kích hoạt Đặt lại khung nhìn về vị trí UAV
  const handleTriggerResetView = () => {
    window.dispatchEvent(new CustomEvent('kvc-map-reset-view'))
    window.dispatchEvent(new CustomEvent('kvc-radar-reset-view'))
  }

  // Kích hoạt Đưa tâm bản đồ về vị trí Mục tiêu
  const handleTriggerFocusTarget = () => {
    window.dispatchEvent(new CustomEvent('kvc-map-focus-target'))
  }

  return (
    <div className="relative flex-1 w-full h-full min-h-0 overflow-hidden select-none bg-[var(--kvc-bg)]">
      {/* 1. KHUNG BẢN ĐỒ / RADAR / VIDEO — chiếm toàn bộ, nằm dưới lớp rail */}
      <div className="w-full h-full min-h-0 overflow-hidden">
        {viewportMode === 'MAP' && <GpsMapPanel hideHeader layerMode={mapLayerMode} />}
        {viewportMode === 'RADAR' && (
          <LocalRadarPanel onSwitchToMap={() => setViewportMode('MAP')} hideHeader />
        )}
        {viewportMode === 'VIDEO' && (
          <div className="w-full h-full min-h-0 overflow-hidden relative bg-[var(--kvc-bg)]">
            <VideoPanel hideHeader osdPosition="top-right" />
          </div>
        )}
      </div>

      {/* 2. OVERLAY RAIL — mọi lớp nổi nằm trong MỘT lưới có ô cố định.
          Trước đây mỗi lớp tự đặt `absolute` với offset riêng nên chồng nhau khi
          màn hình hẹp hoặc thấp. Lưới 3 hàng (trên / giữa / dưới) tách banner,
          PiP và dock ra các hàng khác nhau, nên chúng đẩy nhau thay vì đè nhau.
          `pointer-events-none` để bản đồ vẫn nhận chuột ở vùng trống. */}
      <div
        className="pointer-events-none absolute inset-0 z-[var(--kvc-z-panel)] p-2 sm:p-3
                   grid grid-cols-[minmax(0,1fr)_auto] grid-rows-[auto_minmax(0,1fr)_auto]
                   gap-2"
      >
        {/* Hàng 1, cột 1: thanh công cụ khung nhìn + PiP xếp dọc trong luồng */}
        <div className="pointer-events-none flex flex-col items-start gap-2 min-w-0 min-h-0 justify-self-start max-w-max">
          <div
            data-overlay="viewport-toolbar"
            className={`pointer-events-auto flex items-center gap-1 p-1 rounded-kvc-panel ${overlayChrome} shrink-0 max-w-full`}
          >
            {isTopBarCollapsed ? (
              <Button
                variant="ghost"
                size="icon"
                onClick={toggleTopBarCollapse}
                className="h-7 w-7 text-[var(--kvc-text-on-overlay-muted)] hover:bg-[var(--kvc-surface-2)]/25 rounded-kvc-control cursor-pointer"
                aria-label="Mở rộng thanh điều khiển"
                title="Hiện thanh điều khiển khung nhìn (Phím T)"
              >
                <ChevronDown className="h-3.5 w-3.5 rotate-180" />
              </Button>
            ) : (
              <>
                <div className="flex items-center bg-[var(--kvc-surface-2)]/20 p-0.5 rounded-kvc-control border border-[var(--kvc-line)]/40 h-7">
                  {VIEWPORT_MODES.map(({ mode, icon, shortLabel, ariaLabel }) => (
                    <Button
                      key={mode}
                      variant="ghost"
                      size="sm"
                      onClick={() => setViewportMode(mode)}
                      className={`h-6 px-2 text-[11px] gap-1 font-semibold cursor-pointer border ${modeButtonClass(viewportMode === mode)}`}
                      aria-label={ariaLabel}
                      aria-pressed={viewportMode === mode}
                    >
                      {icon}
                      <span className="hidden md:inline">{shortLabel}</span>
                    </Button>
                  ))}
                </div>

                {viewportMode !== 'VIDEO' && (
                  <Button
                    variant="ghost"
                    size="icon"
                    onClick={() => setShowVideoFeed(!showVideoFeed)}
                    className={`h-7 w-7 cursor-pointer border ${
                      showVideoFeed
                        ? 'bg-[var(--kvc-accent-bg)] text-[var(--kvc-accent-ink)] border-[var(--kvc-accent-line)]'
                        : 'text-[var(--kvc-text-on-overlay-muted)] border-transparent hover:text-[var(--kvc-text-on-overlay)] hover:bg-[var(--kvc-surface-2)]/25'
                    }`}
                    title={showVideoFeed ? 'Thu gọn video PiP' : 'Mở video quang học PiP'}
                    aria-label="Bật tắt Video phụ"
                  >
                    {showVideoFeed ? (
                      <Video className="h-3.5 w-3.5" />
                    ) : (
                      <VideoOff className="h-3.5 w-3.5" />
                    )}
                  </Button>
                )}

                <Button
                  variant="ghost"
                  size="icon"
                  onClick={toggleTopBarCollapse}
                  className="h-7 w-7 text-[var(--kvc-text-on-overlay-muted)] hover:bg-[var(--kvc-surface-2)]/25 rounded-kvc-control cursor-pointer"
                  aria-label="Thu gọn thanh điều khiển"
                  title="Ẩn thanh điều khiển để xem bản đồ trọn vẹn (Phím T)"
                >
                  <ChevronDown className="h-3.5 w-3.5" />
                </Button>
              </>
            )}
          </div>

          {/* PiP nằm ngay dưới thanh công cụ TRONG CÙNG cột, không phải lớp
              absolute riêng; nhờ vậy nó không bao giờ đè lên banner cảnh báo
              và bị chặn chiều cao theo khung nhìn thấp. */}
          {showVideoFeed && viewportMode !== 'VIDEO' && (
            <div
              data-overlay="video-pip"
              className="pointer-events-auto w-[min(22rem,100%)] max-h-[min(32dvh,18rem)] rounded-kvc-panel border border-[var(--kvc-line-strong)] bg-[var(--kvc-surface)] overflow-hidden flex flex-col min-h-0 shrink"
              role="dialog"
              aria-modal="false"
              aria-label="Cửa sổ Video PiP"
            >
              <div className="flex items-center justify-between px-3 py-1.5 bg-[var(--kvc-surface-2)] border-b border-[var(--kvc-line)] shrink-0">
                <span className="text-xs font-semibold text-[var(--kvc-text)] flex items-center gap-1.5 min-w-0">
                  <Video className="h-3.5 w-3.5 shrink-0 text-[var(--kvc-accent-ink)]" />
                  <span className="truncate">Video tham chiếu</span>
                  <Badge
                    variant="outline"
                    className="text-[11px] px-1 py-0 h-4 font-mono text-[var(--kvc-accent-ink)] border-[var(--kvc-accent-line)] shrink-0"
                  >
                    PiP
                  </Badge>
                </span>
                <Button
                  variant="ghost"
                  size="icon"
                  onClick={() => setShowVideoFeed(false)}
                  className="h-6 w-6 shrink-0 text-[var(--kvc-text-muted)] hover:text-[var(--kvc-text)] cursor-pointer"
                  title="Đóng video PiP"
                >
                  <X className="h-3.5 w-3.5" />
                </Button>
              </div>
              <div className="flex-1 min-h-0 overflow-hidden">
                <VideoPanel hideHeader />
              </div>
            </div>
          )}
        </div>

        {/* Hàng 1, cột 2: Góc trên bên phải — Cụm cảnh báo nổi (Alert Corner).
            Đưa toàn bộ cảnh báo (criticalAlert, gnssBanner, localGridNotice) về
            1 góc màn hình thay vì chiếm toàn bộ dải giữa màn hình, giúp tầm nhìn
            bản đồ / radar luôn thông thoáng. */}
        {hasBannerRow && (
          <div
            data-overlay="alert-corner"
            className="col-start-2 row-start-1 justify-self-end self-start pointer-events-auto flex flex-col items-end gap-1.5 max-w-[min(26rem,calc(100vw-18rem))] min-w-0 z-30"
          >
            {criticalAlert && (
              <div
                data-overlay="alert-banner"
                className={`w-auto max-w-full px-3 py-1.5 rounded-kvc-control border flex items-center justify-between gap-2 text-xs shadow-md backdrop-blur-sm ${
                  criticalAlert.level === 'CRITICAL'
                    ? 'bg-[var(--kvc-crit-bg)] border-[var(--kvc-crit-line)] text-[var(--kvc-crit-ink)]'
                    : 'bg-[var(--kvc-warn-bg)] border-[var(--kvc-warn-line)] text-[var(--kvc-warn-ink)]'
                }`}
                role="alert"
              >
                <div className="flex items-center gap-1.5 min-w-0">
                  {criticalAlert.level === 'CRITICAL' ? (
                    <AlertCircle className="h-4 w-4 shrink-0" />
                  ) : (
                    <AlertTriangle className="h-4 w-4 shrink-0" />
                  )}
                  <span className="font-mono font-bold shrink-0">[{criticalAlert.code}]</span>
                  <span className="truncate max-w-[180px] sm:max-w-[240px]" title={criticalAlert.message}>
                    {criticalAlert.message}
                  </span>
                </div>
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => dispatch({ type: 'ACKNOWLEDGE_ALERT', payload: criticalAlert.id })}
                  className="h-5 px-2 text-[11px] font-semibold shrink-0 border-current hover:bg-transparent cursor-pointer"
                >
                  Tiếp nhận (ACK)
                </Button>
              </div>
            )}

            {gnssBanner && <MapGnssBanner cameraPosition={state.camera_position} />}

            {localGridNotice && (
              <div className="bg-[var(--kvc-accent-bg)] border border-[var(--kvc-accent-line)] px-3 py-1 rounded-full text-xs text-[var(--kvc-accent-ink)] flex items-center gap-2 max-w-full shadow-md">
                <span className="truncate max-w-[200px] sm:max-w-[260px]">
                  Hệ LOCAL_GRID (#{target?.track_id ?? 'N/A'}: X=
                  {target?.local_x_cm ?? 'N/A'}cm, Y={target?.local_y_cm ?? 'N/A'}cm)
                </span>
                <button
                  type="button"
                  onClick={() => setViewportMode('RADAR')}
                  className="text-xs font-bold underline hover:no-underline cursor-pointer ml-1 shrink-0"
                >
                  Xem Radar &rarr;
                </button>
              </div>
            )}
          </div>
        )}

        {/* Hàng 3: dock tác chiến, cụm điều khiển khung nhìn và nút đổi lớp bản
            đồ nằm CHUNG một hàng flex, nên chúng đẩy nhau thay vì chồng lên
            nhau ở màn hình hẹp. */}
        <div className="col-span-2 row-start-3 flex items-end justify-between gap-2 min-w-0">
          <div className="min-w-0 max-w-[min(100%,36rem)]">
            <BottomTacticalDock
              anchored={false}
              showVideoFeed={showVideoFeed}
              onToggleVideoFeed={() => setShowVideoFeed(!showVideoFeed)}
            />
          </div>
          {/* Màn hình hẹp: xếp nút đổi lớp và cụm điều khiển thành một cột dọc
              để nhường bề rộng cho dock; từ `sm` trở lên mới đặt cạnh nhau. */}
          <div className="flex flex-col items-end gap-1.5 shrink-0 sm:flex-row sm:items-end sm:gap-2">
            {viewportMode === 'MAP' && (
              <MapLayerSwitcher
                anchored={false}
                mode={mapLayerMode}
                onToggle={() => setMapLayerMode((prev) => (prev === '2D' ? '3D' : '2D'))}
              />
            )}
            {viewportMode === 'MAP' && (
              <FloatingMapControls
                anchored={false}
                onResetView={handleTriggerResetView}
                onFocusTarget={handleTriggerFocusTarget}
              />
            )}
          </div>
        </div>
      </div>
    </div>
  )
}
