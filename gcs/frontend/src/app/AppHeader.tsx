import React, { useState } from 'react'
import {
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
import { AMBER_AGE_MS, isAgeStale } from '@/lib/stale'
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
    if (isAgeStale(safeAge, stale)) {
      return {
        color: 'text-[var(--kvc-crit-ink)] bg-[var(--kvc-crit-bg)] border-[var(--kvc-crit-line)]',
        dot: 'bg-[var(--kvc-crit)]',
        label: `${(safeAge / 1000).toFixed(1)}s (MẤT SÓNG)`,
      }
    }
    if (safeAge > AMBER_AGE_MS) {
      return {
        color: 'text-[var(--kvc-warn-ink)] bg-[var(--kvc-warn-bg)] border-[var(--kvc-warn-line)]',
        dot: 'bg-[var(--kvc-warn)]',
        label: `${(safeAge / 1000).toFixed(1)}s (Trễ)`,
      }
    }
    return {
      color: 'text-[var(--kvc-ok-ink)] bg-[var(--kvc-ok-bg)] border-[var(--kvc-ok-line)]',
      dot: 'bg-[var(--kvc-ok)]',
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
          btnClass: 'bg-[var(--kvc-ok-fill)] text-[var(--kvc-text-on-fill)]',
          label: 'REAL (LIVE)',
          ping: 'bg-[var(--kvc-ok)]/60',
          dot: 'bg-[var(--kvc-text-on-overlay)]',
        }
      case 'LOST_SIGNAL':
        return {
          btnClass: 'bg-[var(--kvc-crit-fill)] text-[var(--kvc-text-on-fill)]',
          label: 'REAL (MẤT SÓNG)',
          ping: 'bg-[var(--kvc-crit)]/60',
          dot: 'bg-[var(--kvc-text-on-overlay)]',
        }
      case 'BACKEND_DOWN':
        return {
          btnClass: 'bg-[var(--kvc-crit-bg)] text-[var(--kvc-crit-ink)] border border-[var(--kvc-crit-line)]',
          label: 'REAL (MẤT BACKEND)',
          ping: null,
          dot: 'bg-[var(--kvc-crit)]',
        }
      case 'WAITING':
      default:
        return {
          btnClass: 'bg-[var(--kvc-crit-fill)]/90 text-[var(--kvc-text-on-fill)] border border-[var(--kvc-crit-line)]',
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

      {/* 2. Ở giữa: Bộ chuyển chế độ 2 lựa chọn MOCK vs REAL */}
      <div className="flex items-center gap-1.5">
        <div className="flex items-center p-1 rounded-kvc-panel border border-border/80 bg-muted/50 dark:bg-[#111622] shadow-2xs gap-0.5">
          {/* Nút MOCK */}
          <button
            type="button"
            onClick={() => handleSwitchSourceMode('MOCK')}
            className={`flex items-center gap-1.5 px-2.5 py-1.5 min-h-[32px] rounded-kvc-control text-xs font-bold transition-all cursor-pointer focus-visible:ring-2 focus-visible:ring-primary ${
              source_mode === 'MOCK'
                ? 'bg-[var(--kvc-mock-fill)] text-[var(--kvc-text-on-fill)]'
                : 'text-muted-foreground hover:text-foreground'
            }`}
            title={`Chế độ Mô phỏng MOCK (${APP_CONFIG.MOCK_TRANSPORT === 'LOCAL' ? 'Cục bộ offline' : 'Backend loopback'})`}
            aria-label="Chế độ Mô phỏng MOCK"
          >
            <FlaskConical className="h-3.5 w-3.5" />
            <span>MOCK</span>
            <span className="text-[11px] px-1 py-0.2 rounded bg-black/20 uppercase font-mono hidden sm:inline">
              {APP_CONFIG.MOCK_TRANSPORT}
            </span>
          </button>

          {/* Nút REAL */}
          <button
            type="button"
            onClick={() => handleSwitchSourceMode('REAL')}
            className={`flex items-center gap-1.5 px-2.5 py-1.5 min-h-[32px] rounded-kvc-control text-xs font-bold transition-all cursor-pointer focus-visible:ring-2 focus-visible:ring-primary ${
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
        </div>
        <InfoTip text="Nguồn dữ liệu: MOCK (kịch bản mô phỏng), REAL (dữ liệu từ Gateway ESP32 qua Ingress). Trình duyệt chỉ nhận qua Backend GCS localhost." />
      </div>

      {/* 3. Bên phải: Chỉ số hệ thống tóm tắt & Công cụ */}
      <div className="flex items-center gap-2 sm:gap-3 shrink-0">
        {/* Kết nối WebSocket Trình duyệt ↔ Backend GCS */}
        {source_mode === 'MOCK' && APP_CONFIG.MOCK_TRANSPORT === 'LOCAL' ? (
          <div
            className="hidden sm:flex items-center gap-1.5 px-2.5 py-1 min-h-[32px] rounded-kvc-control border text-xs font-semibold bg-[var(--kvc-mock-bg)] border-[var(--kvc-mock-line)] text-[var(--kvc-mock-ink)]"
            title="Đang chạy mô phỏng cục bộ trên trình duyệt (Offline)"
          >
            <FlaskConical className="h-4 w-4 shrink-0" />
            <span className="hidden md:inline font-mono">MOCK OFFLINE</span>
          </div>
        ) : (
          <div
            className={`hidden sm:flex items-center gap-1.5 px-2.5 py-1 min-h-[32px] rounded-kvc-control border text-xs font-semibold ${
              ws_connected
                ? 'bg-[var(--kvc-ok-bg)] border-[var(--kvc-ok-line)] text-[var(--kvc-ok-ink)]'
                : 'bg-[var(--kvc-crit-bg)] border-[var(--kvc-crit-line)] text-[var(--kvc-crit-ink)]'
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
            className={`hidden md:flex items-center gap-1.5 px-2.5 py-1 min-h-[32px] rounded-kvc-control border text-xs font-semibold ${esp32Status.badgeColorClass}`}
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
          className="hidden lg:flex items-center gap-1.5 px-2 py-1 rounded-md border border-border/80 bg-muted/30 hover:bg-muted/70 hover:border-[var(--kvc-accent-line)] transition-all text-xs cursor-pointer group"
          title="Xem trạng thái GNSS và các chỉ số có dữ liệu"
          aria-label="Xem chi tiết vệ tinh GNSS"
        >
          <Satellite className="h-3.5 w-3.5 text-[var(--kvc-accent-ink)] shrink-0 group-hover:scale-110 transition-transform" />
          <span className="text-muted-foreground">GNSS:</span>
          <span
            className={`font-semibold font-mono ${
              camera_position.is_valid && telemetry.gps_valid
                ? 'text-[var(--kvc-ok-ink)]'
                : 'text-[var(--kvc-warn-ink)]'
            }`}
          >
            {camera_position.is_valid && telemetry.gps_valid ? 'FIX HỢP LỆ' : 'NO FIX'}
          </span>
        </button>

        {/* Pin tải nhiệm vụ: KVC đã bỏ phép đo pin nên không hiển thị chỉ số pin */}

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
