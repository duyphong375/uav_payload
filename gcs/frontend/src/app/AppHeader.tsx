import React, { useState } from 'react'
import {
  Battery,
  Clock,
  FlaskConical,
  Menu,
  Radio,
  Satellite,
  Wifi,
  WifiOff,
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { InfoTip } from '@/components/shared/InfoTip'
import { getEsp32PhysicalStatus } from '@/lib/connectionStatus'
import { GnssSatelliteSheet } from '@/features/telemetry/GnssSatelliteSheet'
import { ThemeToggle } from '@/features/theme/ThemeToggle'
import { useMission } from '@/state/MissionProvider'
import { APP_ROUTES, useAppRouter } from './routes'

import { APP_CONFIG } from '@/config/appConfig'
import type { SourceMode } from '@/types/telemetry'

interface AppHeaderProps {
  onOpenMobileMenu: () => void
}

export const AppHeader: React.FC<AppHeaderProps> = ({
  onOpenMobileMenu,
}) => {
  const { currentPath } = useAppRouter()
  const { state, switchSourceMode } = useMission()
  const { ws_connected, is_stale, rx_age_ms, telemetry, camera_position, source_mode, hardware_link } = state

  const [satelliteSheetOpen, setSatelliteSheetOpen] = useState(false)

  React.useEffect(() => {
    const handleOpen = () => setSatelliteSheetOpen(true)
    window.addEventListener('kvc-open-satellite-sheet', handleOpen)
    return () => window.removeEventListener('kvc-open-satellite-sheet', handleOpen)
  }, [])

  const routeConfig = APP_ROUTES[currentPath] || APP_ROUTES['/mission']

  // Chuyển đổi chế độ có thông báo hệ quả khi đang ở phiên REAL hoặc chuyển sang REAL
  const handleSwitchSourceMode = (targetMode: SourceMode) => {
    if (targetMode === source_mode) return
    if (source_mode === 'REAL' && targetMode !== 'REAL') {
      const confirmed = window.confirm(
        'Hệ thống đang ở chế độ REAL. Chuyển sang chế độ khác sẽ tạm ngắt liên kết giám sát thực tế. Tiếp tục chuyển?'
      )
      if (!confirmed) return
    }
    switchSourceMode(targetMode)
  }

  // Màu và nhãn độ trễ tín hiệu (rx_age_ms)
  const getAgeStatus = (age: number, stale: boolean) => {
    const safeAge = Math.max(0, age)
    if (stale || safeAge > 3000) {
      return {
        color: 'text-red-500 bg-red-500/10 border-red-500/30',
        dot: 'bg-red-500',
        label: `${(safeAge / 1000).toFixed(1)}s (MẤT SÓNG)`,
      }
    }
    if (safeAge > 1000) {
      return {
        color: 'text-amber-500 bg-amber-500/10 border-amber-500/30',
        dot: 'bg-amber-500',
        label: `${(safeAge / 1000).toFixed(1)}s (Trễ)`,
      }
    }
    return {
      color: 'text-emerald-500 bg-emerald-500/10 border-emerald-500/30',
      dot: 'bg-emerald-500',
      label: `${Math.round(safeAge)}ms (Tốt)`,
    }
  }

  const ageStatus = getAgeStatus(rx_age_ms, is_stale)

  // Xác định tình trạng kết nối vật lý thật của Gateway ESP32 với Backend GCS
  const esp32Status = getEsp32PhysicalStatus(source_mode, ws_connected, hardware_link, is_stale, rx_age_ms)

  // Cấu hình nút REAL phản ánh đúng tình trạng thật
  const getRealButtonConfig = () => {
    switch (esp32Status.status) {
      case 'LIVE':
        return {
          btnClass: 'bg-emerald-600 text-white shadow-[0_0_12px_rgba(16,185,129,0.4)]',
          label: 'REAL (LIVE)',
          ping: 'bg-emerald-300',
          dot: 'bg-white',
        }
      case 'LOST_SIGNAL':
        return {
          btnClass: 'bg-rose-600 text-white animate-pulse shadow-[0_0_12px_rgba(244,63,94,0.4)]',
          label: 'REAL (MẤT SÓNG)',
          ping: 'bg-rose-300',
          dot: 'bg-white',
        }
      case 'BACKEND_DOWN':
        return {
          btnClass: 'bg-rose-950/70 text-rose-300 border border-rose-500/50',
          label: 'REAL (MẤT BACKEND)',
          ping: null,
          dot: 'bg-rose-500',
        }
      case 'WAITING':
      default:
        return {
          btnClass: 'bg-rose-600/90 text-white border border-rose-500/60 shadow-xs',
          label: 'REAL (CHƯA KẾT NỐI)',
          ping: null,
          dot: 'bg-white',
        }
    }
  }

  const realBtnConfig = getRealButtonConfig()

  return (
    <header className="h-14 bg-card border-b border-border px-3 sm:px-4 flex items-center justify-between gap-3 shrink-0 select-none">
      {/* 1. Bên trái: Nút Menu Mobile + Tên trang / Breadcrumb */}
      <div className="flex items-center gap-2.5 min-w-0">
        <Button
          variant="ghost"
          size="icon"
          onClick={onOpenMobileMenu}
          className="md:hidden min-h-[36px] h-9 w-9 text-muted-foreground hover:text-foreground shrink-0 cursor-pointer"
          aria-label="Mở menu điều hướng"
        >
          <Menu className="h-4 w-4" />
        </Button>

        <div className="flex flex-col min-w-0">
          <div className="flex items-center gap-1.5 text-xs text-muted-foreground font-medium uppercase tracking-wider truncate">
            <span>{routeConfig.breadcrumb}</span>
          </div>
          <span className="text-sm font-bold text-foreground tracking-tight truncate leading-tight">
            {routeConfig.title}
          </span>
        </div>
      </div>

      {/* 2. Ở giữa: Bộ chuyển chế độ 3 lựa chọn MOCK vs REAL vs REPLAY */}
      <div className="flex items-center gap-1.5">
        <div className="flex items-center p-1 rounded-xl border border-border/80 bg-muted/50 dark:bg-[#111622] shadow-2xs gap-0.5">
          {/* Nút MOCK */}
          <button
            type="button"
            onClick={() => handleSwitchSourceMode('MOCK')}
            className={`flex items-center gap-1.5 px-2.5 py-1.5 min-h-[32px] rounded-lg text-xs font-bold transition-all cursor-pointer focus-visible:ring-2 focus-visible:ring-primary ${
              source_mode === 'MOCK'
                ? 'bg-purple-600 text-white shadow-[0_0_12px_rgba(168,85,247,0.35)]'
                : 'text-muted-foreground hover:text-foreground'
            }`}
            title={`Chế độ Mô phỏng MOCK (${APP_CONFIG.MOCK_TRANSPORT === 'LOCAL' ? 'Cục bộ offline' : 'Backend loopback'})`}
            aria-label="Chế độ Mô phỏng MOCK"
          >
            <FlaskConical className="h-3.5 w-3.5" />
            <span>MOCK</span>
            <span className="text-[9px] px-1 py-0.2 rounded bg-black/20 uppercase font-mono hidden sm:inline">
              {APP_CONFIG.MOCK_TRANSPORT}
            </span>
          </button>

          {/* Nút REAL */}
          <button
            type="button"
            onClick={() => handleSwitchSourceMode('REAL')}
            className={`flex items-center gap-1.5 px-2.5 py-1.5 min-h-[32px] rounded-lg text-xs font-bold transition-all cursor-pointer focus-visible:ring-2 focus-visible:ring-primary ${
              source_mode === 'REAL'
                ? realBtnConfig.btnClass
                : 'text-muted-foreground hover:text-foreground'
            }`}
            title={
              source_mode === 'REAL'
                ? `Chế độ REAL: ${esp32Status.description}`
                : 'Chuyển sang chế độ REAL (Nhận dữ liệu từ Gateway ESP32)'
            }
            aria-label="Chế độ Thực tế REAL"
          >
            <Radio className="h-3.5 w-3.5" />
            <span>{source_mode === 'REAL' ? realBtnConfig.label : 'REAL'}</span>
            {source_mode === 'REAL' && realBtnConfig.ping && (
              <span className="relative flex h-2 w-2 ml-0.5">
                <span className={`animate-ping absolute inline-flex h-full w-full rounded-full ${realBtnConfig.ping} opacity-75`}></span>
                <span className={`relative inline-flex rounded-full h-2 w-2 ${realBtnConfig.dot}`}></span>
              </span>
            )}
          </button>

          {/* Nút REPLAY */}
          <button
            type="button"
            onClick={() => handleSwitchSourceMode('REPLAY')}
            className={`flex items-center gap-1.5 px-2.5 py-1.5 min-h-[32px] rounded-lg text-xs font-bold transition-all cursor-pointer focus-visible:ring-2 focus-visible:ring-primary ${
              source_mode === 'REPLAY'
                ? 'bg-cyan-600 text-white shadow-[0_0_12px_rgba(6,182,212,0.35)]'
                : 'text-muted-foreground hover:text-foreground'
            }`}
            title="Chế độ Phát lại nhật ký SQLite (REPLAY)"
            aria-label="Chế độ Phát lại REPLAY"
          >
            <Clock className="h-3.5 w-3.5" />
            <span>REPLAY</span>
          </button>
        </div>
        <InfoTip text="Nguồn dữ liệu: MOCK (kịch bản mô phỏng), REAL (dữ liệu từ Gateway ESP32 qua Ingress), REPLAY (phát lại nhật ký SQLite). Trình duyệt chỉ nhận qua Backend GCS localhost." />
      </div>

      {/* 3. Bên phải: Chỉ số hệ thống tóm tắt & Công cụ */}
      <div className="flex items-center gap-2 sm:gap-3 shrink-0">
        {/* Kết nối WebSocket Trình duyệt ↔ Backend GCS */}
        {source_mode === 'MOCK' && APP_CONFIG.MOCK_TRANSPORT === 'LOCAL' ? (
          <div
            className="hidden sm:flex items-center gap-1.5 px-2.5 py-1 min-h-[32px] rounded-lg border text-xs font-semibold bg-purple-500/10 border-purple-500/30 text-purple-600 dark:text-purple-400"
            title="Đang chạy mô phỏng cục bộ trên trình duyệt (Offline)"
          >
            <FlaskConical className="h-4 w-4 shrink-0" />
            <span className="hidden md:inline font-mono">MOCK OFFLINE</span>
          </div>
        ) : (
          <div
            className={`hidden sm:flex items-center gap-1.5 px-2.5 py-1 min-h-[32px] rounded-lg border text-xs font-semibold ${
              ws_connected
                ? 'bg-emerald-500/10 border-emerald-500/30 text-emerald-600 dark:text-emerald-400'
                : 'bg-red-500/10 border-red-500/30 text-red-600 dark:text-red-400'
            }`}
            title={ws_connected ? 'WebSocket Trình duyệt ↔ Backend GCS đang kết nối' : 'Mất kết nối WebSocket tới Backend GCS'}
          >
            {ws_connected ? (
              <Wifi className="h-4 w-4 shrink-0" />
            ) : (
              <WifiOff className="h-4 w-4 shrink-0" />
            )}
            <span className="hidden md:inline font-mono">
              {ws_connected ? 'WS BACKEND OK' : 'MẤT WS BACKEND'}
            </span>
          </div>
        )}

        {/* Tình trạng kết nối thật Gateway ESP32 ↔ Backend GCS (chế độ REAL) */}
        {source_mode === 'REAL' && (
          <div
            className={`hidden md:flex items-center gap-1.5 px-2.5 py-1 min-h-[32px] rounded-lg border text-xs font-semibold ${esp32Status.badgeColorClass}`}
            title={esp32Status.description}
          >
            <Radio className="h-3.5 w-3.5 shrink-0" />
            <span className="font-mono font-bold">{esp32Status.label}</span>
            {esp32Status.pingClass && (
              <span className="relative flex h-2 w-2 ml-0.5">
                <span className={`animate-ping absolute inline-flex h-full w-full rounded-full ${esp32Status.pingClass} opacity-75`} />
                <span className={`relative inline-flex rounded-full h-2 w-2 ${esp32Status.dotColorClass}`} />
              </span>
            )}
          </div>
        )}


        {/* Độ trễ tín hiệu telemetry (rx_age) */}
        <div
          className={`flex items-center gap-1.5 px-2 py-1 rounded-md border text-xs font-mono tabular-nums font-medium ${ageStatus.color}`}
          title="Độ trễ tín hiệu gói tin gần nhất từ tải UAV"
        >
          <Clock className="h-3.5 w-3.5 shrink-0 opacity-80" />
          <span>{ageStatus.label}</span>
        </div>

        {/* Trạng thái Định vị GNSS - Nhấp để mở Phần Vệ Tinh chi tiết */}
        <button
          type="button"
          onClick={() => setSatelliteSheetOpen(true)}
          className="hidden lg:flex items-center gap-1.5 px-2 py-1 rounded-md border border-border/80 bg-muted/30 hover:bg-muted/70 hover:border-cyan-500/50 transition-all text-xs cursor-pointer group"
          title="Xem trạng thái GNSS và các chỉ số có dữ liệu"
          aria-label="Xem chi tiết vệ tinh GNSS"
        >
          <Satellite className="h-3.5 w-3.5 text-cyan-500 shrink-0 group-hover:scale-110 transition-transform" />
          <span className="text-muted-foreground">GNSS:</span>
          <span
            className={`font-semibold font-mono ${
              camera_position.is_valid && telemetry.gps_valid
                ? 'text-emerald-500'
                : 'text-amber-500'
            }`}
          >
            {camera_position.is_valid && telemetry.gps_valid ? 'FIX HỢP LỆ' : 'NO FIX'}
          </span>
        </button>

        {/* Pin tải nhiệm vụ */}
        {telemetry.battery_pct !== null && (
          <div className="hidden md:flex items-center gap-1.5 px-2 py-1 rounded-md border border-border/80 bg-muted/30 text-xs font-mono">
            <Battery className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
            <span
              className={`font-semibold ${
                telemetry.battery_pct <= 20
                  ? 'text-red-500'
                  : telemetry.battery_pct <= 35
                  ? 'text-amber-500'
                  : 'text-foreground'
              }`}
            >
              {telemetry.battery_pct}%
            </span>
          </div>
        )}

        {/* Nút chuyển đổi Theme Light/Dark/System */}
        <ThemeToggle />
      </div>

      {/* Drawer GNSS NEO-M8N / ATGM336H */}
      <GnssSatelliteSheet
        open={satelliteSheetOpen}
        onOpenChange={setSatelliteSheetOpen}
      />
    </header>
  )
}
