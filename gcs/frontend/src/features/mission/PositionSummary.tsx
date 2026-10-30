import React from 'react'
import {
  ArrowDownUp,
  Camera,
  Clock,
  Crosshair,
  Database,
  Mountain,
  Signal,
} from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { useMission } from '@/state/MissionProvider'

export const PositionSummary: React.FC<{ className?: string }> = ({ className = '' }) => {
  const { state } = useMission()
  const {
    camera_position,
    target,
    has_target,
    telemetry,
    rx_age_ms,
    is_stale,
    source_mode,
  } = state

  const formatCoord = (val: number | null | undefined, precision = 6) => {
    if (val === null || val === undefined || isNaN(val)) return '—'
    return val.toFixed(precision)
  }

  const hasUavFix = Boolean(
    camera_position.is_valid &&
    camera_position.latitude !== null &&
    camera_position.longitude !== null
  )

  const isLoRaGood = telemetry.packet_rssi_dbm !== null && telemetry.packet_rssi_dbm > -95
  const isLoRaDegraded = telemetry.packet_rssi_dbm !== null && telemetry.packet_rssi_dbm <= -95

  return (
    <footer
      className={`h-10 min-h-[40px] border-t border-border bg-card px-3 sm:px-4 flex items-center justify-between gap-3 text-xs shrink-0 select-none overflow-x-auto whitespace-nowrap shadow-xs ${className}`}
      aria-label="Thanh trạng thái Telemetry thời gian thực"
    >
      {/* 1. Vị trí tải nhiệm vụ UAV */}
      <div className="flex items-center gap-1.5 font-mono text-xs shrink-0" title="Tọa độ WGS-84 Camera tải nhiệm vụ">
        <Camera
          className={`h-4 w-4 shrink-0 ${
            !hasUavFix
              ? 'text-destructive'
              : is_stale
              ? 'text-[var(--kvc-warn-ink)]'
              : source_mode === 'MOCK'
              ? 'text-[var(--kvc-mock-ink)]'
              : 'text-[var(--kvc-ok-ink)]'
          }`}
        />
        <span className="text-muted-foreground font-sans text-xs font-semibold">UAV:</span>
        {hasUavFix ? (
          <span
            className={`font-bold ${
              is_stale
                ? 'text-[var(--kvc-warn-ink)]'
                : source_mode === 'MOCK'
                ? 'text-[var(--kvc-mock-ink)]'
                : 'text-foreground'
            }`}
          >
            {formatCoord(camera_position.latitude)}, {formatCoord(camera_position.longitude)}
          </span>
        ) : (
          <span className="text-destructive font-sans font-medium text-xs">Mất GNSS Fix</span>
        )}
      </div>

      <div className="h-4 w-[1px] bg-border shrink-0" />

      {/* 2. Vị trí mục tiêu nếu có */}
      <div className="flex items-center gap-1.5 font-mono text-xs shrink-0" title="Tọa độ mục tiêu cứu nạn tính toán">
        <Crosshair
          className={`h-4 w-4 shrink-0 ${
            has_target && target && target.pos_valid
              ? 'text-[var(--kvc-crit-ink)]'
              : 'text-muted-foreground/60'
          }`}
        />
        <span className="text-muted-foreground font-sans text-xs font-semibold">Target:</span>
        {has_target && target && target.pos_valid ? (
          target.coordinate_frame === 'LOCAL_GRID' ? (
            <span className="font-bold text-foreground">
              #{target.track_id ?? '101'} (X:{target.local_x_cm ?? '—'} Y:{target.local_y_cm ?? '—'}cm)
            </span>
          ) : (
            <span className="font-bold text-foreground">
              #{target.track_id ?? '101'} ({formatCoord(target.latitude)}, {formatCoord(target.longitude)})
            </span>
          )
        ) : (
          <span className="text-muted-foreground font-sans text-xs">Chưa phát hiện</span>
        )}
      </div>

      <div className="h-4 w-[1px] bg-border shrink-0 hidden sm:block" />

      {/* 3. Độ cao bay GNSS */}
      <div className="hidden sm:flex items-center gap-1.5 font-mono text-xs shrink-0" title="Độ cao GNSS">
        <Mountain className="h-4 w-4 text-[var(--kvc-ok-ink)] shrink-0" />
        <span className="text-muted-foreground font-sans text-xs font-semibold">Alt:</span>
        <span className="font-bold text-foreground">
          {camera_position.altitude_m !== null && camera_position.altitude_m !== undefined
            ? `${camera_position.altitude_m.toFixed(1)}m`
            : '—'}
        </span>
      </div>

      <div className="hidden sm:block h-4 w-[1px] bg-border shrink-0" />

      {/* 4. Khoảng cách đo dọc tia siêu âm */}
      <div className="flex items-center gap-1.5 font-mono text-xs shrink-0" title="Khoảng cách tới mặt nước đo bằng siêu âm">
        <ArrowDownUp className="h-4 w-4 text-[var(--kvc-accent-ink)] shrink-0" />
        <span className="text-muted-foreground font-sans text-xs font-semibold">Siêu âm:</span>
        <span className="font-bold text-foreground tabular-nums">
          {telemetry.lidar_range_cm !== null ? `${telemetry.lidar_range_cm} cm` : '—'}
        </span>
      </div>

      <div className="h-4 w-[1px] bg-border shrink-0 hidden md:block" />

      {/* 5. Cường độ sóng LoRa RSSI/SNR */}
      <div className="hidden md:flex items-center gap-1.5 font-mono text-xs shrink-0" title="Cường độ tín hiệu LoRa thu nhận">
        <Signal
          className={`h-4 w-4 shrink-0 ${
            isLoRaGood
              ? 'text-[var(--kvc-ok-ink)]'
              : isLoRaDegraded
              ? 'text-[var(--kvc-warn-ink)]'
              : 'text-destructive'
          }`}
        />
        <span className="text-muted-foreground font-sans text-xs font-semibold">LoRa:</span>
        <span className="text-foreground font-semibold">
          {telemetry.packet_rssi_dbm !== null ? `${telemetry.packet_rssi_dbm} dBm` : '—'}
        </span>
        {telemetry.packet_snr_db !== null && (
          <span className="text-muted-foreground text-xs">({telemetry.packet_snr_db.toFixed(1)} dB)</span>
        )}
      </div>

      <div className="h-4 w-[1px] bg-border shrink-0" />

      {/* 6. Độ trễ tín hiệu (Packet Latency) theo quy ước Xanh / Vàng / Đỏ */}
      <div className="flex items-center gap-1 font-mono text-xs shrink-0" title="Độ trễ tín hiệu gói tin gần nhất">
        <Clock className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
        <span className="text-muted-foreground font-sans text-xs font-semibold hidden sm:inline">Trễ:</span>
        <Badge
          variant="outline"
          className={`py-0.5 px-1.5 font-mono text-xs font-bold ${
            is_stale || rx_age_ms > 3000
              ? 'border-[var(--kvc-crit-line)] text-[var(--kvc-crit-ink)] bg-[var(--kvc-crit-bg)]'
              : rx_age_ms > 1000
              ? 'border-[var(--kvc-warn-line)] text-[var(--kvc-warn-ink)] bg-[var(--kvc-warn-bg)]'
              : 'border-[var(--kvc-ok-line)] text-[var(--kvc-ok-ink)] bg-[var(--kvc-ok-bg)]'
          }`}
        >
          {is_stale || rx_age_ms > 3000 ? `${(rx_age_ms / 1000).toFixed(1)}s` : `${rx_age_ms} ms`}
        </Badge>
      </div>

      {/* 7. Nguồn dữ liệu MOCK / REAL (Tím cho MOCK, Xanh cho REAL) */}
      <Badge
        variant="outline"
        className={`font-mono text-xs py-0.5 px-2 font-bold ${
          source_mode === 'MOCK'
            ? 'border-[var(--kvc-mock-line)] text-[var(--kvc-mock-ink)] bg-[var(--kvc-mock-bg)]'
            : 'border-[var(--kvc-ok-line)] text-[var(--kvc-ok-ink)] bg-[var(--kvc-ok-bg)]'
        }`}
        title={`Nguồn dữ liệu: ${source_mode}`}
      >
        <Database className="h-3 w-3 mr-1" />
        {source_mode}
      </Badge>
    </footer>
  )
}
