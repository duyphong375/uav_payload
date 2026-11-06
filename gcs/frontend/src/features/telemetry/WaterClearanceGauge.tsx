import React from 'react'
import { Waves } from 'lucide-react'
import { APP_CONFIG } from '@/config/appConfig'
import { InfoTip } from '@/components/shared/InfoTip'

interface WaterClearanceGaugeProps {
  /** Khoảng cách xuống mặt nước, cm. null = chưa có dữ liệu hợp lệ. */
  rangeCm: number | null
  /** Cờ hợp lệ của cảm biến; false thì không vẽ cột nước. */
  valid: boolean
  stale: boolean
  className?: string
}

/**
 * Ống đo khoảng cách từ tải bay xuống mặt nước.
 * Cột nước dâng lên khi UAV hạ độ cao; ngưỡng đỏ duy nhất là APP_CONFIG.LIDAR_DANGER_M.
 * Thiếu dữ liệu thì hiện "CHỜ ĐO" — không vẽ cột 0 (contract P6).
 */
export const WaterClearanceGauge: React.FC<WaterClearanceGaugeProps> = ({
  rangeCm,
  valid,
  stale,
  className = '',
}) => {
  const hasReading = valid && !stale && rangeCm !== null
  const meters = hasReading ? rangeCm / 100 : null
  const isDanger = meters !== null && meters < APP_CONFIG.LIDAR_DANGER_M

  const max = APP_CONFIG.LIDAR_GAUGE_MAX_M
  // Tỷ lệ nước dâng: càng gần mặt nước thì cột càng cao.
  const fillRatio =
    meters === null ? 0 : Math.min(1, Math.max(0.04, 1 - Math.min(meters, max) / max))

  const tone = isDanger ? 'crit' : 'accent'
  const ink = `var(--kvc-${tone}-ink)`
  const fill = `var(--kvc-${tone}-fill)`

  return (
    <div className={`flex flex-col gap-1 min-w-0 ${className}`}>
      <div className="flex items-center gap-1.5">
        <Waves className="h-3.5 w-3.5 text-[var(--kvc-text-muted)] shrink-0" />
        <span className="text-[11px] uppercase tracking-wider text-[var(--kvc-text-muted)] font-semibold whitespace-nowrap">
          Mặt nước
        </span>
        <InfoTip
          text={`Đo bằng cảm biến siêu âm AJ-SR04M. Ngưỡng đỏ ${APP_CONFIG.LIDAR_DANGER_M.toFixed(1)} m. Thiếu dữ liệu hợp lệ thì không hiển thị số.`}
        />
      </div>

      <div className="flex items-end gap-2.5">
        {/* Ống đo dọc */}
        <div
          className="relative w-4 h-12 rounded-kvc-control border border-[var(--kvc-line-strong)] overflow-hidden bg-[var(--kvc-surface-2)] shrink-0"
          role="img"
          aria-label={
            meters === null
              ? 'Chưa có số đo khoảng cách mặt nước'
              : `Còn ${meters.toFixed(2)} mét tới mặt nước`
          }
        >
          <div
            className="absolute inset-x-0 bottom-0 transition-[height] duration-300"
            style={{
              height: `${Math.round(fillRatio * 100)}%`,
              backgroundColor: hasReading ? fill : 'transparent',
            }}
          />
          {/* Vạch ngưỡng đỏ theo APP_CONFIG.LIDAR_DANGER_M */}
          <div
            className="absolute inset-x-0 border-t border-dashed"
            style={{
              bottom: `${Math.round((1 - APP_CONFIG.LIDAR_DANGER_M / max) * 100)}%`,
              borderColor: 'var(--kvc-crit)',
            }}
          />
        </div>

        <div className="flex flex-col min-w-0">
          <div className="flex flex-wrap items-baseline gap-x-1 gap-y-0.5">
            <span
              className="font-mono text-xl sm:text-2xl font-black tabular-nums"
              style={{ color: hasReading ? ink : 'var(--kvc-text-muted)' }}
            >
              {meters === null ? 'N/A' : meters.toFixed(2)}
            </span>
            <span className="text-xs font-semibold text-[var(--kvc-text-muted)]">m</span>
            <span
              className={`px-1 py-0 rounded font-mono text-[10px] font-bold shrink-0 ${
                isDanger
                  ? 'bg-[var(--kvc-crit-bg)] text-[var(--kvc-crit-ink)]'
                  : hasReading
                    ? 'bg-[var(--kvc-accent-bg)] text-[var(--kvc-accent-ink)]'
                    : 'bg-[var(--kvc-text-muted)]/15 text-[var(--kvc-text-muted)]'
              }`}
            >
              {isDanger ? 'NGUY HIỂM' : hasReading ? 'AN TOÀN' : 'CHỜ ĐO'}
            </span>
          </div>
          <span className="text-[11px] text-[var(--kvc-text-muted)] truncate">
            {hasReading
              ? `Còn ${Math.round(rangeCm)} cm tới mặt nước`
              : valid
                ? 'Dữ liệu cũ — đang chờ gói mới'
                : 'Cảm biến chưa báo hợp lệ'}
          </span>
        </div>
      </div>
    </div>
  )
}
