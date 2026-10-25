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

export const MissionPage: React.FC = () => {
  const { state, selectedScenarioId, dispatch } = useMission()
  const {
    source_mode,
    session_id,
    ws_connected,
    target,
    alerts,
  } = state

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
      : source_mode === 'REPLAY'
        ? `Phát lại: ${state.replay?.source_session_id ?? 'đang chờ snapshot'}`
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
    <div className="relative flex-1 w-full h-full min-h-0 overflow-hidden select-none bg-background">
      {/* 1. KHUNG BẢN ĐỒ / RADAR ĐỘC LẬP TỪNG CHẾ ĐỘ HOẶC SONG SONG */}
      <div className="w-full h-full min-h-0 overflow-hidden">
        {viewportMode === 'MAP' && <GpsMapPanel hideHeader />}
        {viewportMode === 'RADAR' && (
          <LocalRadarPanel onSwitchToMap={() => setViewportMode('MAP')} hideHeader />
        )}
        {viewportMode === 'SPLIT' && (
          <div className="w-full flex flex-col md:flex-row gap-2 h-full min-h-0 overflow-hidden p-1 sm:p-2">
            <div className="flex-1 h-1/2 md:h-full min-h-0 overflow-hidden relative rounded-xl border border-white/15 shadow-xl bg-slate-950">
              <div className="absolute top-14 left-3 z-20 px-2.5 py-0.5 rounded-md bg-slate-900/90 backdrop-blur-md text-[10px] font-mono text-cyan-300 font-bold border border-cyan-500/40 shadow">
                🌐 KHUNG BẢN ĐỒ VỆ TINH (WGS-84)
              </div>
              <GpsMapPanel hideHeader />
            </div>
            <div className="flex-1 h-1/2 md:h-full min-h-0 overflow-hidden relative rounded-xl border border-white/15 shadow-xl bg-slate-950">
              <div className="absolute top-14 left-3 z-20 px-2.5 py-0.5 rounded-md bg-slate-900/90 backdrop-blur-md text-[10px] font-mono text-emerald-300 font-bold border border-emerald-500/40 shadow">
                🎯 KHUNG RADAR SA BÀN (LOCAL GRID)
              </div>
              <LocalRadarPanel onSwitchToMap={() => setViewportMode('MAP')} hideHeader />
            </div>
          </div>
        )}
      </div>

      {/* 2. DẢI CẢNH BÁO NỔI TRUNG TÂM (Chỉ hiện khi có cảnh báo nguy cấp hoặc nhận hệ local) */}
      <div className="absolute top-14 left-1/2 -translate-x-1/2 z-[420] w-[92%] max-w-xl pointer-events-auto flex flex-col gap-1.5 items-center">
        {criticalAlert && (
          <div
            className={`w-full px-3 py-1 rounded-xl border flex items-center justify-between gap-2 text-xs shadow-xl backdrop-blur-md ${
              criticalAlert.level === 'CRITICAL'
                ? 'bg-red-950/85 border-red-500/50 text-red-200'
                : 'bg-amber-950/85 border-amber-500/50 text-amber-200'
            }`}
            role="alert"
          >
            <div className="flex items-center gap-1.5 min-w-0">
              {criticalAlert.level === 'CRITICAL' ? (
                <AlertCircle className="h-4 w-4 shrink-0 text-red-400" />
              ) : (
                <AlertTriangle className="h-4 w-4 shrink-0 text-amber-400" />
              )}
              <span className="font-mono font-bold shrink-0">[{criticalAlert.code}]</span>
              <span className="truncate">{criticalAlert.message}</span>
            </div>
            <Button
              size="sm"
              variant="outline"
              onClick={() => dispatch({ type: 'ACKNOWLEDGE_ALERT', payload: criticalAlert.id })}
              className="h-5 px-2 text-[10px] font-semibold shrink-0 border-current hover:bg-white/10"
            >
              Tiếp nhận (ACK)
            </Button>
          </div>
        )}

        {isLocalGrid && viewportMode === 'MAP' && (
          <div className="bg-cyan-950/90 backdrop-blur-md border border-cyan-500/50 px-3 py-1 rounded-full text-xs text-cyan-200 flex items-center gap-2 shadow-lg animate-in fade-in slide-in-from-top-2">
            <span>
              🎯 Nhận gói tin hệ local <strong>LOCAL_GRID</strong> (#{target?.track_id ?? '101'}: X={target?.local_x_cm ?? 0}cm, Y={target?.local_y_cm ?? 0}cm)
            </span>
            <button
              type="button"
              onClick={() => setViewportMode('RADAR')}
              className="text-xs font-bold text-cyan-400 underline hover:text-cyan-300 cursor-pointer ml-1"
            >
              Xem Radar &rarr;
            </button>
          </div>
        )}
      </div>

      {/* 3. THANH ĐIỀU KHIỂN NỔI TRÊN BẢN ĐỒ — HỖ TRỢ DẠNG THANH THU ĐỂ TĂNG DIỆN TÍCH BẢN ĐỒ */}
      {isTopBarCollapsed ? (
        /* DẠNG THANH THU (COLLAPSED): Capsule chip siêu gọn nằm sát góc trên bên trái */
        <div className="absolute top-3 left-3 z-[410] flex items-center gap-1.5 p-1 rounded-xl bg-slate-950/85 backdrop-blur-md border border-white/20 shadow-xl text-slate-100 pointer-events-auto animate-in fade-in zoom-in-95 duration-150">
          {/* Nhóm nút micro chuyển view nhanh */}
          <div className="flex items-center bg-white/10 p-0.5 rounded-lg border border-white/10 h-7">
            <Button
              variant={viewportMode === 'MAP' ? 'default' : 'ghost'}
              size="sm"
              onClick={() => setViewportMode('MAP')}
              className={`h-6 px-1.5 text-[11px] gap-1 font-semibold cursor-pointer ${
                viewportMode === 'MAP'
                  ? 'bg-cyan-600 text-white shadow-xs'
                  : 'text-slate-300 hover:text-white hover:bg-white/10'
              }`}
              aria-label="Xem Bản đồ WGS-84"
            >
              <Compass className="h-3 w-3" />
              <span className="hidden md:inline">GPS</span>
            </Button>

            <Button
              variant={viewportMode === 'RADAR' ? 'default' : 'ghost'}
              size="sm"
              onClick={() => setViewportMode('RADAR')}
              className={`h-6 px-1.5 text-[11px] gap-1 font-semibold cursor-pointer ${
                viewportMode === 'RADAR'
                  ? 'bg-cyan-600 text-white shadow-xs'
                  : 'text-slate-300 hover:text-white hover:bg-white/10'
              }`}
              aria-label="Xem Radar Sa Bàn (Hệ Local)"
            >
              <Radio className="h-3 w-3" />
              <span className="hidden md:inline">Radar</span>
            </Button>

            <Button
              variant={viewportMode === 'SPLIT' ? 'default' : 'ghost'}
              size="sm"
              onClick={() => setViewportMode('SPLIT')}
              className={`h-6 px-1 text-[11px] gap-1 font-semibold hidden xl:inline-flex cursor-pointer ${
                viewportMode === 'SPLIT'
                  ? 'bg-cyan-600 text-white shadow-xs'
                  : 'text-slate-300 hover:text-white hover:bg-white/10'
              }`}
              aria-label="Xem Chia đôi Bản đồ và Radar"
            >
              <Columns className="h-3 w-3" />
            </Button>
          </div>

          <Badge
            variant="outline"
            className="text-[10px] px-1.5 py-0 h-5 font-mono border-white/20 text-slate-300"
          >
            {source_mode}
          </Badge>

          {!ws_connected && (
            <Badge variant="destructive" className="text-[10px] px-1.5 py-0 h-5 font-mono">
              MẤT KẾT NỐI
            </Badge>
          )}

          {/* Nút bật/tắt Video PiP nhỏ gọn */}
          <Button
            variant={showVideoFeed ? 'secondary' : 'ghost'}
            size="icon"
            onClick={() => setShowVideoFeed(!showVideoFeed)}
            className={`h-6 w-6 cursor-pointer ${
              showVideoFeed
                ? 'bg-cyan-500/20 text-cyan-300'
                : 'text-slate-300 hover:text-white hover:bg-white/10'
            }`}
            title={showVideoFeed ? 'Thu gọn video PiP' : 'Mở video quang học PiP'}
            aria-label="Bật tắt Video phụ"
          >
            {showVideoFeed ? (
              <Video className="h-3 w-3 text-cyan-400" />
            ) : (
              <VideoOff className="h-3 w-3 text-slate-400" />
            )}
          </Button>

          {/* Nút Mở rộng lại thanh điều khiển */}
          <Button
            variant="ghost"
            size="sm"
            onClick={toggleTopBarCollapse}
            className="h-6 px-2 text-[11px] gap-1 font-semibold text-cyan-400 hover:text-cyan-300 hover:bg-white/10 rounded-lg cursor-pointer ml-1"
            aria-label="Mở rộng thanh điều khiển"
            title="Mở rộng đầy đủ thanh điều khiển tác chiến (Phím T)"
          >
            <ChevronDown className="h-3.5 w-3.5" />
            <span className="hidden sm:inline">Mở rộng</span>
          </Button>
        </div>
      ) : (
        /* DẠNG MỞ RỘNG (EXPANDED): Thanh điều khiển nổi kính mờ trải đều 2 góc trên bản đồ */
        <div className="absolute top-3 left-3 right-3 z-[410] flex items-center justify-between gap-2 pointer-events-none">
          {/* Góc trên trái: Tiêu đề + InfoTip + Nguồn + Kết nối + Session */}
          <div className="flex items-center gap-2 px-3 py-1.5 rounded-xl bg-slate-950/85 backdrop-blur-md border border-white/20 shadow-xl text-slate-100 max-w-[calc(100vw-420px)] pointer-events-auto">
            <h1 className="text-xs sm:text-sm font-bold tracking-tight text-white truncate">
              Giám sát định vị tải nhiệm vụ
            </h1>
            <InfoTip text="Bàn làm việc tác chiến trực tiếp: Khung nhìn bản đồ 100% full-width, radar sa bàn hệ local, mục tiêu phát hiện Người/Tàu và dock bàn giao cứu nạn SAR." />

            {/* Nhãn nguồn dữ liệu: MOCK / REAL / REPLAY */}
            <Badge
              variant="outline"
              className={`text-[10px] px-1.5 py-0 h-4.5 font-mono shrink-0 ${
                source_mode === 'MOCK'
                  ? 'border-purple-400/40 text-purple-300 bg-purple-500/20'
                  : source_mode === 'REPLAY'
                  ? 'border-cyan-400/40 text-cyan-300 bg-cyan-500/20'
                  : 'border-emerald-400/40 text-emerald-300 bg-emerald-500/20'
              }`}
            >
              Nguồn: {source_mode}
            </Badge>

            {/* Trạng thái kết nối (Chỉ hiện khi mất kết nối để tránh lặp với Header) */}
            {!ws_connected && (
              <Badge
                variant="destructive"
                className="text-[10px] px-1.5 py-0 h-4.5 font-mono shrink-0"
              >
                MẤT KẾT NỐI
              </Badge>
            )}

            {/* Tên phiên rút gọn */}
            <span className="text-[11px] font-mono text-slate-400 truncate hidden xl:inline max-w-[160px]">
              • {sessionOrScenarioName}
            </span>
          </div>

          {/* Góc trên phải: Chuyển đổi Viewport + Video PiP + Nút Thu gọn dạng thanh thu */}
          <div className="flex items-center gap-1.5 p-1 rounded-xl bg-slate-950/85 backdrop-blur-md border border-white/20 shadow-xl text-slate-100 pointer-events-auto">
            {/* Nhóm nút chuyển đổi khung nhìn định vị (Bản đồ WGS-84 ↔ Radar Hệ Local ↔ Chia đôi) */}
            <div className="flex items-center bg-white/10 p-0.5 rounded-lg border border-white/10 h-7">
              <Button
                variant={viewportMode === 'MAP' ? 'default' : 'ghost'}
                size="sm"
                onClick={() => setViewportMode('MAP')}
                className={`h-6 px-2 text-[11px] gap-1 font-semibold cursor-pointer ${
                  viewportMode === 'MAP'
                    ? 'bg-cyan-600 text-white shadow-xs'
                    : 'text-slate-300 hover:text-white hover:bg-white/10'
                }`}
                aria-label="Xem Bản đồ WGS-84"
              >
                <Compass className="h-3 w-3" />
                <span className="hidden sm:inline">🌐 Bản đồ GPS (WGS-84)</span>
                <span className="sm:hidden">GPS</span>
              </Button>

              <Button
                variant={viewportMode === 'RADAR' ? 'default' : 'ghost'}
                size="sm"
                onClick={() => setViewportMode('RADAR')}
                className={`h-6 px-2 text-[11px] gap-1 font-semibold cursor-pointer ${
                  viewportMode === 'RADAR'
                    ? 'bg-cyan-600 text-white shadow-xs'
                    : 'text-slate-300 hover:text-white hover:bg-white/10'
                }`}
                aria-label="Xem Radar Sa Bàn (Hệ Local)"
              >
                <Radio className="h-3 w-3" />
                <span className="hidden sm:inline">🎯 Radar Sa bàn (Local)</span>
                <span className="sm:hidden">Radar</span>
              </Button>

              <Button
                variant={viewportMode === 'SPLIT' ? 'default' : 'ghost'}
                size="sm"
                onClick={() => setViewportMode('SPLIT')}
                className={`h-6 px-2 text-[11px] gap-1 font-semibold inline-flex cursor-pointer ${
                  viewportMode === 'SPLIT'
                    ? 'bg-cyan-600 text-white shadow-xs'
                    : 'text-slate-300 hover:text-white hover:bg-white/10'
                }`}
                aria-label="Xem Hai Khung Riêng Song Song (Bản đồ + Radar)"
              >
                <Columns className="h-3 w-3" />
                <span className="hidden md:inline">🪟 Hai Khung Song Song</span>
                <span className="md:hidden">Song song</span>
              </Button>
            </div>

            {/* Nút bật/tắt Video phụ (PiP) */}
            <Button
              variant={showVideoFeed ? 'secondary' : 'ghost'}
              size="sm"
              onClick={() => setShowVideoFeed(!showVideoFeed)}
              className={`h-7 px-2 text-[11px] gap-1 font-medium shadow-2xs cursor-pointer border border-white/10 ${
                showVideoFeed
                  ? 'bg-cyan-500/20 text-cyan-300 border-cyan-500/40'
                  : 'text-slate-300 hover:text-white hover:bg-white/10'
              }`}
              title={showVideoFeed ? 'Thu gọn video PiP' : 'Mở video quang học PiP'}
              aria-label="Bật tắt Video phụ"
            >
              {showVideoFeed ? (
                <Video className="h-3.5 w-3.5 text-cyan-400" />
              ) : (
                <VideoOff className="h-3.5 w-3.5 text-slate-400" />
              )}
              <span className="hidden sm:inline">Video PiP</span>
            </Button>

            {/* Nút Thu gọn thanh điều khiển dạng thanh thu */}
            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={toggleTopBarCollapse}
                  className="h-7 px-2 text-[11px] gap-1 text-cyan-400 hover:text-cyan-300 hover:bg-white/10 rounded-lg cursor-pointer border border-cyan-500/30 font-semibold"
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

      {/* 5. GÓC DƯỚI BÊN TRÁI: Thanh HUD kính mờ thu thập gói tin thời gian thực (LiDAR, IMU, GPS, LoRa, SAR Handover) */}
      <BottomTacticalDock
        showVideoFeed={showVideoFeed}
        onToggleVideoFeed={() => setShowVideoFeed(!showVideoFeed)}
      />

      {/* 6. GÓC DƯỚI BÊN PHẢI: Cụm điều khiển nổi Đặt lại khung nhìn UAV & Tâm Mục tiêu */}
      <FloatingMapControls
        onResetView={handleTriggerResetView}
        onFocusTarget={handleTriggerFocusTarget}
      />

      {/* 7. KHUNG NỔI VIDEO PICTURE-IN-PICTURE (PiP) (Khi người dùng mở video quang học) */}
      {showVideoFeed && (
        <div
          className="absolute top-13 left-3 z-[410] w-72 sm:w-80 md:w-96 rounded-xl border border-white/20 bg-slate-950/95 backdrop-blur-md shadow-2xl overflow-hidden flex flex-col animate-in fade-in zoom-in-95 duration-200"
          role="dialog"
          aria-label="Cửa sổ Video PiP"
        >
          <div className="flex items-center justify-between px-3 py-1.5 bg-white/5 border-b border-white/10">
            <span className="text-xs font-semibold text-white flex items-center gap-1.5">
              <Video className="h-3.5 w-3.5 text-cyan-400" />
              Video tham chiếu
              <Badge variant="outline" className="text-[10px] px-1 py-0 h-4 font-mono text-cyan-400 border-cyan-400/40">
                PiP
              </Badge>
            </span>
            <Button
              variant="ghost"
              size="icon"
              onClick={() => setShowVideoFeed(false)}
              className="h-6 w-6 text-slate-400 hover:text-white cursor-pointer"
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
