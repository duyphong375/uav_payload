import React, { useState } from 'react'
import {
  ArrowDownUp,
  ChevronDown,
  ChevronUp,
  Compass,
  LocateFixed,
  MapPin,
  Mountain,
  Radio,
  ShieldAlert,
} from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { InfoTip } from '@/components/shared/InfoTip'
import { useMission } from '@/state/MissionProvider'

interface CurrentPositionPanelProps {
  onResetView: () => void
  className?: string
  floating?: boolean
}

export const CurrentPositionPanel: React.FC<CurrentPositionPanelProps> = ({
  onResetView,
  className = '',
  floating = false,
}) => {
  const { state } = useMission()
  const {
    camera_position,
    telemetry,
    source_mode,
    rx_age_ms,
    is_stale,
  } = state

  const [isCollapsed, setIsCollapsed] = useState(false)

  const hasGpsFix = Boolean(
    camera_position.is_valid &&
    camera_position.latitude !== null &&
    camera_position.longitude !== null
  )

  // Xác định trạng thái tọa độ tổng quan của tải UAV
  const getCoordinateStatus = () => {
    if (!hasGpsFix) {
      return {
        label: 'MẤT GNSS FIX',
        variant: 'destructive' as const,
        reason: 'Chưa có khóa vệ tinh GNSS từ anten u-blox của tải UAV.',
        isError: true,
      }
    }
    if (is_stale || rx_age_ms > 3000) {
      return {
        label: 'DỮ LIỆU CŨ',
        variant: 'secondary' as const,
        reason: `Dữ liệu telemetry quá cũ (>3000ms, hiện tại: ${rx_age_ms}ms).`,
        isError: false,
      }
    }
    if (source_mode === 'MOCK') {
      return {
        label: 'MÔ PHỎNG',
        variant: 'outline' as const,
        reason: 'Đang hoạt động trong kịch bản mô phỏng tải bay.',
        isError: false,
      }
    }
    return {
      label: 'HỢP LỆ (3D FIX)',
      variant: 'default' as const,
      reason: 'Tọa độ WGS-84 tải UAV thời gian thực hợp lệ.',
      isError: false,
    }
  }

  const coordStatus = getCoordinateStatus()

  const latDisplay = hasGpsFix && camera_position.latitude !== null
    ? `${camera_position.latitude.toFixed(6)}°`
    : 'N/A'

  const lonDisplay = hasGpsFix && camera_position.longitude !== null
    ? `${camera_position.longitude.toFixed(6)}°`
    : 'N/A'

  const baseContainerClasses = floating
    ? 'absolute top-3 left-3 z-[400] w-72 sm:w-80 bg-card/95 backdrop-blur-md border border-border/80 rounded-2xl shadow-md p-3 select-none pointer-events-auto transition-all'
    : 'w-full bg-card border border-border/80 rounded-xl shadow-xs p-3 select-none transition-all'

  return (
    <div
      className={`${baseContainerClasses} ${className}`}
      aria-label="Panel Vị trí hiện tại"
    >
      {/* 1. Header: Tiêu đề, Badge trạng thái & Nút thu gọn */}
      <div className="flex items-center justify-between gap-2 pb-2 border-b border-border/60">
        <div className="flex items-center gap-2 min-w-0">
          <div className="p-1.5 rounded-lg bg-primary/10 text-primary border border-primary/20 shrink-0">
            <MapPin className="h-4 w-4" />
          </div>
          <div className="flex flex-col min-w-0">
            <div className="flex items-center gap-1.5">
              <span className="text-sm font-bold tracking-tight text-foreground truncate">
                Vị trí hiện tại
              </span>
              <InfoTip text="Tọa độ WGS-84, độ cao thực tế LiDAR mặt nước và hướng la bàn của tải UAV thời gian thực." />
            </div>
            <span className="text-xs text-muted-foreground truncate">
              Tải nhiệm vụ UAV (Payload)
            </span>
          </div>
        </div>

        <div className="flex items-center gap-1.5 shrink-0">
          <Badge
            variant={coordStatus.variant}
            className={`text-xs font-mono px-2 py-0.5 ${
              coordStatus.label === 'MÔ PHỎNG'
                ? 'border-purple-500/40 text-purple-600 dark:text-purple-300 bg-purple-500/10'
                : coordStatus.label === 'DỮ LIỆU CŨ'
                ? 'border-amber-500/40 text-amber-600 dark:text-amber-400 bg-amber-500/10'
                : ''
            }`}
          >
            {coordStatus.label}
          </Badge>

          {floating && (
            <Button
              variant="ghost"
              size="icon"
              onClick={() => setIsCollapsed(!isCollapsed)}
              className="h-7 w-7 text-muted-foreground hover:text-foreground"
              title={isCollapsed ? 'Mở rộng panel vị trí' : 'Thu gọn panel vị trí'}
              aria-label="Thu gọn hoặc mở rộng panel vị trí"
            >
              {isCollapsed ? <ChevronDown className="h-4 w-4" /> : <ChevronUp className="h-4 w-4" />}
            </Button>
          )}
        </div>
      </div>

      {/* 2. Dạng thu gọn (khi floating) */}
      {isCollapsed && floating ? (
        <div className="pt-2 flex items-center justify-between gap-2 text-xs font-mono">
          <span className="text-foreground font-semibold truncate">
            {latDisplay}, {lonDisplay}
          </span>
          <Button
            size="sm"
            variant="outline"
            onClick={onResetView}
            className="h-7 px-2.5 text-xs gap-1 shrink-0"
            title="Đặt lại khung nhìn về tải nhiệm vụ"
          >
            <LocateFixed className="h-3.5 w-3.5" />
            <span>Đặt lại</span>
          </Button>
        </div>
      ) : (
        /* 3. Dạng mở rộng: Thông tin chi tiết của tải UAV */
        <div className="pt-2 flex flex-col gap-2.5 text-xs">
          {/* Tọa độ WGS-84 Tải UAV (Font 16px) */}
          <div className="grid grid-cols-2 gap-2 p-2.5 rounded-lg bg-muted/40 border border-border/60 font-mono">
            <div className="flex flex-col min-w-0">
              <span className="text-xs font-sans text-muted-foreground">Vĩ độ (Lat):</span>
              <span className="text-base font-bold text-foreground truncate" title={latDisplay}>
                {latDisplay}
              </span>
            </div>
            <div className="flex flex-col min-w-0">
              <span className="text-xs font-sans text-muted-foreground">Kinh độ (Lon):</span>
              <span className="text-base font-bold text-foreground truncate" title={lonDisplay}>
                {lonDisplay}
              </span>
            </div>
          </div>

          {/* Độ cao GNSS & LiDAR & Hướng bay */}
          <div className="grid grid-cols-3 gap-1.5 p-2 rounded-lg bg-muted/20 border border-border/40 font-mono text-xs">
            <div className="flex flex-col">
              <span className="text-xs text-muted-foreground font-sans flex items-center gap-1">
                <Mountain className="h-3 w-3 text-emerald-500" /> Alt:
              </span>
              <span className="font-semibold text-foreground">
                {camera_position.altitude_m != null ? `${camera_position.altitude_m.toFixed(1)}m` : '—'}
              </span>
            </div>
            <div className="flex flex-col">
              <span className="text-xs text-muted-foreground font-sans flex items-center gap-1">
                <ArrowDownUp className="h-3 w-3 text-indigo-500" /> LiDAR:
              </span>
              <span className="font-semibold text-foreground">
                {telemetry.lidar_range_cm != null ? `${telemetry.lidar_range_cm}cm` : '—'}
              </span>
            </div>
            <div className="flex flex-col">
              <span className="text-xs text-muted-foreground font-sans flex items-center gap-1">
                <Compass className="h-3 w-3 text-primary" /> Heading:
              </span>
              <span className="font-semibold text-foreground">
                {camera_position.heading_deg != null ? `${Math.round(camera_position.heading_deg)}°` : '—'}
              </span>
            </div>
          </div>

          {/* Hệ quy chiếu & Độ trễ tín hiệu */}
          <div className="grid grid-cols-2 gap-2 text-xs">
            <div className="flex items-center justify-between p-2 rounded-lg bg-muted/20 border border-border/30">
              <span className="text-xs text-muted-foreground">Hệ quy chiếu:</span>
              <span className="font-mono font-bold text-foreground">WGS-84</span>
            </div>
            <div className="flex items-center justify-between p-2 rounded-lg bg-muted/20 border border-border/30">
              <span className="text-xs text-muted-foreground flex items-center gap-1">
                Độ trễ tín hiệu:
                <InfoTip text="Thời gian trôi qua từ gói tin gần nhất của tải UAV: Dưới 1s (Xanh) là trực tiếp, 1-3s (Vàng) là nghẽn sóng, trên 3s (Đỏ) là mất tín hiệu." />
              </span>
              <span
                className={`font-mono font-bold flex items-center gap-1.5 ${
                  rx_age_ms > 3000
                    ? 'text-destructive'
                    : rx_age_ms > 1000
                    ? 'text-amber-500'
                    : 'text-emerald-600 dark:text-emerald-400'
                }`}
              >
                <span
                  className={`h-2 w-2 rounded-full shrink-0 ${
                    rx_age_ms > 3000
                      ? 'bg-destructive animate-pulse'
                      : rx_age_ms > 1000
                      ? 'bg-amber-500'
                      : 'bg-emerald-500'
                  }`}
                />
                {rx_age_ms > 3000 ? `${(rx_age_ms / 1000).toFixed(1)}s (Mất tín hiệu)` : `${rx_age_ms} ms`}
              </span>
            </div>
          </div>

          {/* Khóa vệ tinh & Chi tiết GNSS */}
          <div className="flex items-center justify-between p-2 rounded-lg bg-cyan-500/5 border border-cyan-500/20 text-xs">
            <div className="flex items-center gap-1.5">
              <Radio className="h-3.5 w-3.5 text-cyan-600 dark:text-cyan-400" />
              <span className="text-muted-foreground">Khóa vệ tinh GNSS:</span>
              <span className="font-mono font-bold text-foreground">
                {hasGpsFix ? 'Số vệ tinh / HDOP: N/A' : 'Mất khóa GNSS'}
              </span>
            </div>
            <button
              type="button"
              onClick={() => window.dispatchEvent(new CustomEvent('kvc-open-satellite-sheet'))}
              className="text-xs font-semibold text-cyan-600 dark:text-cyan-400 hover:underline cursor-pointer"
            >
              Chi tiết &rarr;
            </button>
          </div>

          {/* Cảnh báo lý do cụ thể khi tọa độ không hoàn hảo */}
          {(!hasGpsFix || is_stale || source_mode === 'MOCK') && (
            <div
              className={`flex items-start gap-1.5 p-2 rounded-lg text-xs leading-snug border ${
                !hasGpsFix
                  ? 'bg-destructive/10 border-destructive/30 text-destructive'
                  : is_stale
                  ? 'bg-amber-500/10 border-amber-500/30 text-amber-700 dark:text-amber-300'
                  : 'bg-purple-500/10 border-purple-500/30 text-purple-700 dark:text-purple-300'
              }`}
            >
              <ShieldAlert className="h-4 w-4 shrink-0 mt-0.5" />
              <span>{coordStatus.reason}</span>
            </div>
          )}

          {/* Nút hành động chuẩn touch target 36px: Đặt lại khung nhìn */}
          <Button
            size="default"
            variant="outline"
            onClick={onResetView}
            className="w-full min-h-[36px] h-9 text-xs sm:text-sm gap-1.5 border-border hover:border-primary/50 text-foreground font-semibold shadow-xs cursor-pointer focus-visible:ring-2 focus-visible:ring-primary"
            title="Đưa tâm bản đồ về lại vị trí tải nhiệm vụ UAV"
            aria-label="Đặt lại khung nhìn"
          >
            <LocateFixed className="h-4 w-4 text-primary" />
            <span>Đặt lại khung nhìn (Tâm UAV)</span>
          </Button>
        </div>
      )}
    </div>
  )
}
