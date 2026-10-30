import React, { useState } from 'react'
import {
  AlertCircle,
  AlertTriangle,
  ChevronDown,
  ChevronUp,
  Columns,
  Compass,
  Radio,
  Video,
  VideoOff,
  X,
} from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { InfoTip } from '@/components/shared/InfoTip'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'
import { GpsMapPanel } from '@/features/map/GpsMapPanel'
import { LocalRadarPanel } from '@/features/radar/LocalRadarPanel'
import { VideoPanel } from '@/features/video/VideoPanel'
import { useMission } from '@/state/MissionProvider'
import { BottomTacticalDock } from './BottomTacticalDock'
import { FloatingMapControls } from './FloatingMapControls'

export type ViewportMode = 'MAP' | 'RADAR' | 'SPLIT'

/** Overlay chrome dùng chung cho thanh nổi trên bản đồ: một lớp kính duy nhất. */
const overlayChrome =
  'kvc-on-overlay bg-[var(--kvc-overlay)] border border-[var(--kvc-line-strong)] text-[var(--kvc-text-on-overlay)]'

const sourceBadgeClass = (mode: string) => {
  if (mode === 'MOCK') return 'border-[var(--kvc-mock-line)] text-[var(--kvc-mock-ink)] bg-[var(--kvc-mock-bg)]'
  return 'border-[var(--kvc-ok-line)] text-[var(--kvc-ok-ink)] bg-[var(--kvc-ok-bg)]'
}

const modeButtonClass = (active: boolean) =>
  active
    ? 'bg-[var(--kvc-accent-fill)] text-[var(--kvc-text-on-fill)] border-[var(--kvc-accent)]'
    : 'text-[var(--kvc-text-on-overlay-muted)] border-transparent hover:text-[var(--kvc-text-on-overlay)] hover:bg-[var(--kvc-surface-2)]/25'

export const MissionPage: React.FC = () => {
  const { state, selectedScenarioId, dispatch } = useMission()
  const { source_mode, session_id, ws_connected, target, alerts } = state

  // Chế độ hiển thị khung nhìn định vị (Bản đồ WGS-84 | Radar Hệ Local | Chia đôi)
  const [viewportMode, setViewportMode] = useState<ViewportMode>('MAP')

  // Bật/tắt video phụ dạng PiP (mặc định thu gọn để tối đa diện tích bản đồ)
  const [showVideoFeed, setShowVideoFeed] = useState<boolean>(false)

  // Bật/tắt dạng thanh thu của thanh điều khiển trên cùng để tăng diện tích hiển thị bản đồ
  const [isTopBarCollapsed, setIsTopBarCollapsed] = useState<boolean>(() => {
    try {
      return localStorage.getItem('kvc_topbar_collapsed') === 'true'
    } catch {
      return false
    }
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

  // Lọc các cảnh báo nguy cấp đang hoạt động chưa tiếp nhận
  const criticalAlert = alerts.find(
    (a) => a.active && (a.level === 'CRITICAL' || a.level === 'WARN') && !a.acknowledged
  )

  // Tên kịch bản hoặc phiên làm việc
  const sessionOrScenarioName =
    source_mode === 'MOCK'
      ? selectedScenarioId
        ? `Kịch bản: ${selectedScenarioId}`
        : 'Mô phỏng độc lập'
      : `Phiên: ${session_id || 'Chưa có phiên'}`

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
      {/* 1. KHUNG BẢN ĐỒ / RADAR ĐỘC LẬP TỪNG CHẾ ĐỘ HOẶC SONG SONG */}
      <div className="w-full h-full min-h-0 overflow-hidden">
        {viewportMode === 'MAP' && <GpsMapPanel hideHeader />}
        {viewportMode === 'RADAR' && (
          <LocalRadarPanel onSwitchToMap={() => setViewportMode('MAP')} hideHeader />
        )}
        {viewportMode === 'SPLIT' && (
          <div className="w-full flex flex-col md:flex-row gap-2 h-full min-h-0 overflow-hidden p-1 sm:p-2">
            <div className="flex-1 h-1/2 md:h-full min-h-0 overflow-hidden relative rounded-kvc-panel border border-[var(--kvc-line-strong)] bg-[var(--kvc-surface)]">
              <div className="absolute top-14 left-3 z-[var(--kvc-z-map-overlay)] px-2.5 py-0.5 rounded-kvc-control bg-[var(--kvc-surface-2)] text-[11px] font-mono text-[var(--kvc-text-muted)] font-semibold border border-[var(--kvc-line)]">
                BẢN ĐỒ WGS-84
              </div>
              <GpsMapPanel hideHeader />
            </div>
            <div className="flex-1 h-1/2 md:h-full min-h-0 overflow-hidden relative rounded-kvc-panel border border-[var(--kvc-line-strong)] bg-[var(--kvc-surface)]">
              <div className="absolute top-14 left-3 z-[var(--kvc-z-map-overlay)] px-2.5 py-0.5 rounded-kvc-control bg-[var(--kvc-surface-2)] text-[11px] font-mono text-[var(--kvc-text-muted)] font-semibold border border-[var(--kvc-line)]">
                RADAR LOCAL (cm)
              </div>
              <LocalRadarPanel onSwitchToMap={() => setViewportMode('MAP')} hideHeader />
            </div>
          </div>
        )}
      </div>

      {/* 2. DẢI CẢNH BÁO NỔI TRUNG TÂM */}
      <div className="absolute top-14 left-1/2 -translate-x-1/2 z-[var(--kvc-z-banner)] w-[92%] max-w-xl pointer-events-auto flex flex-col gap-1.5 items-center">
        {criticalAlert && (
          <div
            className={`w-full px-3 py-1 rounded-kvc-control border flex items-center justify-between gap-2 text-xs ${
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
              <span className="truncate">{criticalAlert.message}</span>
            </div>
            <Button
              size="sm"
              variant="outline"
              onClick={() => dispatch({ type: 'ACKNOWLEDGE_ALERT', payload: criticalAlert.id })}
              className="h-5 px-2 text-[11px] font-semibold shrink-0 border-current hover:bg-transparent"
            >
              Tiếp nhận (ACK)
            </Button>
          </div>
        )}

        {isLocalGrid && viewportMode === 'MAP' && (
          <div className="bg-[var(--kvc-accent-bg)] border border-[var(--kvc-accent-line)] px-3 py-1 rounded-full text-xs text-[var(--kvc-accent-ink)] flex items-center gap-2">
            <span>
              Gói tin hệ LOCAL_GRID (#{target?.track_id ?? 'N/A'}: X={target?.local_x_cm ?? 'N/A'}cm, Y={target?.local_y_cm ?? 'N/A'}cm)
            </span>
            <button
              type="button"
              onClick={() => setViewportMode('RADAR')}
              className="text-xs font-bold underline hover:no-underline cursor-pointer ml-1"
            >
              Xem Radar &rarr;
            </button>
          </div>
        )}
      </div>

      {/* 3. THANH ĐIỀU KHIỂN NỔI TRÊN BẢN ĐỒ */}
      {isTopBarCollapsed ? (
        <div
          className={`absolute top-3 left-3 z-[var(--kvc-z-panel)] flex items-center gap-1.5 p-1 rounded-kvc-panel ${overlayChrome} pointer-events-auto`}
        >
          <div className="flex items-center bg-[var(--kvc-surface-2)]/20 p-0.5 rounded-kvc-control border border-[var(--kvc-line)]/40 h-7">
            <Button
              variant="ghost"
              size="sm"
              onClick={() => setViewportMode('MAP')}
              className={`h-6 px-1.5 text-[11px] gap-1 font-semibold cursor-pointer border ${modeButtonClass(viewportMode === 'MAP')}`}
              aria-label="Xem Bản đồ WGS-84"
            >
              <Compass className="h-3 w-3" />
              <span className="hidden md:inline">GPS</span>
            </Button>

            <Button
              variant="ghost"
              size="sm"
              onClick={() => setViewportMode('RADAR')}
              className={`h-6 px-1.5 text-[11px] gap-1 font-semibold cursor-pointer border ${modeButtonClass(viewportMode === 'RADAR')}`}
              aria-label="Xem Radar Local (Hệ Local)"
            >
              <Radio className="h-3 w-3" />
              <span className="hidden md:inline">Radar</span>
            </Button>

            <Button
              variant="ghost"
              size="sm"
              onClick={() => setViewportMode('SPLIT')}
              className={`h-6 px-1 text-[11px] gap-1 font-semibold hidden xl:inline-flex cursor-pointer border ${modeButtonClass(viewportMode === 'SPLIT')}`}
              aria-label="Xem Chia đôi Bản đồ và Radar"
            >
              <Columns className="h-3 w-3" />
            </Button>
          </div>

          <Badge
            variant="outline"
            className="text-[11px] px-1.5 py-0 h-5 font-mono border-[var(--kvc-line-strong)] text-[var(--kvc-text-on-overlay-muted)]"
          >
            {source_mode}
          </Badge>

          {source_mode !== 'MOCK' && !ws_connected && (
            <Badge variant="destructive" className="text-[11px] px-1.5 py-0 h-5 font-mono">
              MẤT KẾT NỐI
            </Badge>
          )}

          <Button
            variant="ghost"
            size="icon"
            onClick={() => setShowVideoFeed(!showVideoFeed)}
            className={`h-6 w-6 cursor-pointer border ${
              showVideoFeed
                ? 'bg-[var(--kvc-accent-bg)] text-[var(--kvc-accent-ink)] border-[var(--kvc-accent-line)]'
                : 'text-[var(--kvc-text-on-overlay-muted)] border-transparent hover:text-[var(--kvc-text-on-overlay)] hover:bg-[var(--kvc-surface-2)]/25'
            }`}
            title={showVideoFeed ? 'Thu gọn video PiP' : 'Mở video quang học PiP'}
            aria-label="Bật tắt Video phụ"
          >
            {showVideoFeed ? <Video className="h-3 w-3" /> : <VideoOff className="h-3 w-3" />}
          </Button>

          <Button
            variant="ghost"
            size="sm"
            onClick={toggleTopBarCollapse}
            className="h-6 px-2 text-[11px] gap-1 font-semibold text-[var(--kvc-accent-ink)] hover:bg-[var(--kvc-surface-2)]/25 rounded-kvc-control cursor-pointer ml-1"
            aria-label="Mở rộng thanh điều khiển"
            title="Mở rộng đầy đủ thanh điều khiển tác chiến (Phím T)"
          >
            <ChevronDown className="h-3.5 w-3.5" />
            <span className="hidden sm:inline">Mở rộng</span>
          </Button>
        </div>
      ) : (
        <div className="absolute top-3 left-3 right-3 z-[var(--kvc-z-panel)] flex items-center justify-between gap-2 pointer-events-none">
          {/* Góc trên trái: tiêu đề, nguồn, kết nối, phiên */}
          <div
            className={`flex items-center gap-2 px-3 py-1.5 rounded-kvc-panel ${overlayChrome} max-w-[calc(100vw-420px)] pointer-events-auto`}
          >
            <h1 className="text-xs sm:text-sm font-bold tracking-tight text-[var(--kvc-text-on-overlay)] truncate">
              Giám sát định vị tải nhiệm vụ
            </h1>
            <InfoTip text="Bàn làm việc tác chiến trực tiếp: khung nhìn bản đồ toàn chiều rộng, radar hệ local, mục tiêu phát hiện Người/Tàu và dock bàn giao cứu nạn SAR." />

            <Badge
              variant="outline"
              className={`text-[11px] px-1.5 py-0 h-4.5 font-mono shrink-0 ${sourceBadgeClass(source_mode)}`}
            >
              Nguồn: {source_mode}
            </Badge>

            {source_mode !== 'MOCK' && !ws_connected && (
              <Badge variant="destructive" className="text-[11px] px-1.5 py-0 h-4.5 font-mono shrink-0">
                MẤT KẾT NỐI
              </Badge>
            )}

            <span className="text-[11px] font-mono text-[var(--kvc-text-on-overlay-muted)] truncate hidden xl:inline max-w-[160px]">
              • {sessionOrScenarioName}
            </span>
          </div>

          {/* Góc trên phải: chuyển viewport + video PiP + thu gọn */}
          <div className={`flex items-center gap-1.5 p-1 rounded-kvc-panel ${overlayChrome} pointer-events-auto`}>
            <div className="flex items-center bg-[var(--kvc-surface-2)]/20 p-0.5 rounded-kvc-control border border-[var(--kvc-line)]/40 h-7">
              <Button
                variant="ghost"
                size="sm"
                onClick={() => setViewportMode('MAP')}
                className={`h-6 px-2 text-[11px] gap-1 font-semibold cursor-pointer border ${modeButtonClass(viewportMode === 'MAP')}`}
                aria-label="Xem Bản đồ WGS-84"
              >
                <Compass className="h-3 w-3" />
                <span className="hidden sm:inline">Bản đồ GPS (WGS-84)</span>
                <span className="sm:hidden">GPS</span>
              </Button>

              <Button
                variant="ghost"
                size="sm"
                onClick={() => setViewportMode('RADAR')}
                className={`h-6 px-2 text-[11px] gap-1 font-semibold cursor-pointer border ${modeButtonClass(viewportMode === 'RADAR')}`}
                aria-label="Xem Radar Local (Hệ Local)"
              >
                <Radio className="h-3 w-3" />
                <span className="hidden sm:inline">Radar Local (cm)</span>
                <span className="sm:hidden">Radar</span>
              </Button>

              <Button
                variant="ghost"
                size="sm"
                onClick={() => setViewportMode('SPLIT')}
                className={`h-6 px-2 text-[11px] gap-1 font-semibold inline-flex cursor-pointer border ${modeButtonClass(viewportMode === 'SPLIT')}`}
                aria-label="Xem Hai Khung Riêng Song Song (Bản đồ + Radar)"
              >
                <Columns className="h-3 w-3" />
                <span className="hidden md:inline">Hai khung song song</span>
                <span className="md:hidden">Song song</span>
              </Button>
            </div>

            <Button
              variant="ghost"
              size="sm"
              onClick={() => setShowVideoFeed(!showVideoFeed)}
              className={`h-7 px-2 text-[11px] gap-1 font-medium cursor-pointer border ${
                showVideoFeed
                  ? 'bg-[var(--kvc-accent-bg)] text-[var(--kvc-accent-ink)] border-[var(--kvc-accent-line)]'
                  : 'text-[var(--kvc-text-on-overlay-muted)] border-transparent hover:text-[var(--kvc-text-on-overlay)] hover:bg-[var(--kvc-surface-2)]/25'
              }`}
              title={showVideoFeed ? 'Thu gọn video PiP' : 'Mở video quang học PiP'}
              aria-label="Bật tắt Video phụ"
            >
              {showVideoFeed ? <Video className="h-3.5 w-3.5" /> : <VideoOff className="h-3.5 w-3.5" />}
              <span className="hidden sm:inline">Video PiP</span>
            </Button>

            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={toggleTopBarCollapse}
                  className="h-7 px-2 text-[11px] gap-1 text-[var(--kvc-accent-ink)] hover:bg-[var(--kvc-surface-2)]/25 rounded-kvc-control cursor-pointer border border-[var(--kvc-accent-line)] font-semibold"
                  aria-label="Thu gọn thanh điều khiển"
                  title="Thu gọn thanh điều khiển để tăng tối đa diện tích bản đồ (Phím T)"
                >
                  <ChevronUp className="h-3.5 w-3.5" />
                  <span className="hidden sm:inline">Thu gọn</span>
                </Button>
              </TooltipTrigger>
              <TooltipContent side="bottom">
                <p className="text-xs">Thu gọn thanh điều khiển để tăng tối đa diện tích bản đồ (Phím T)</p>
              </TooltipContent>
            </Tooltip>
          </div>
        </div>
      )}

      {/* 5. GÓC DƯỚI BÊN TRÁI: dock tác chiến */}
      <BottomTacticalDock
        showVideoFeed={showVideoFeed}
        onToggleVideoFeed={() => setShowVideoFeed(!showVideoFeed)}
      />

      {/* 6. GÓC DƯỚI BÊN PHẢI: điều khiển khung nhìn */}
      <FloatingMapControls
        onResetView={handleTriggerResetView}
        onFocusTarget={handleTriggerFocusTarget}
      />

      {/* 7. KHUNG NỔI VIDEO PICTURE-IN-PICTURE (PiP) */}
      {showVideoFeed && (
        <div
          className="absolute top-13 left-3 z-[var(--kvc-z-panel)] w-72 sm:w-80 md:w-96 rounded-kvc-panel border border-[var(--kvc-line-strong)] bg-[var(--kvc-surface)] overflow-hidden flex flex-col"
          role="dialog"
          aria-modal="false"
          aria-label="Cửa sổ Video PiP"
        >
          <div className="flex items-center justify-between px-3 py-1.5 bg-[var(--kvc-surface-2)] border-b border-[var(--kvc-line)]">
            <span className="text-xs font-semibold text-[var(--kvc-text)] flex items-center gap-1.5">
              <Video className="h-3.5 w-3.5 text-[var(--kvc-accent-ink)]" />
              Video tham chiếu
              <Badge
                variant="outline"
                className="text-[11px] px-1 py-0 h-4 font-mono text-[var(--kvc-accent-ink)] border-[var(--kvc-accent-line)]"
              >
                PiP
              </Badge>
            </span>
            <Button
              variant="ghost"
              size="icon"
              onClick={() => setShowVideoFeed(false)}
              className="h-6 w-6 text-[var(--kvc-text-muted)] hover:text-[var(--kvc-text)] cursor-pointer"
              title="Đóng video PiP"
            >
              <X className="h-3.5 w-3.5" />
            </Button>
          </div>
          <div className="h-48 sm:h-56 md:h-60 overflow-hidden">
            <VideoPanel />
          </div>
        </div>
      )}
    </div>
  )
}
