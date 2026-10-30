import React from 'react'
import { Crosshair, LocateFixed } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'
import { useMission } from '@/state/MissionProvider'

interface FloatingMapControlsProps {
  onResetView: () => void
  onFocusTarget: () => void
  className?: string
}

export const FloatingMapControls: React.FC<FloatingMapControlsProps> = ({
  onResetView,
  onFocusTarget,
  className = '',
}) => {
  const { state } = useMission()
  const { target, has_target } = state

  const hasValidTarget = Boolean(
    has_target &&
    target &&
    target.pos_valid &&
    ((target.coordinate_frame === 'LOCAL_GRID' && target.local_x_cm !== null) ||
      (target.latitude !== null && target.longitude !== null))
  )

  return (
    <div
      className={`kvc-on-overlay absolute bottom-3 right-3 z-[var(--kvc-z-panel)] flex flex-col gap-1.5 p-1 rounded-kvc-panel bg-[var(--kvc-overlay)] border border-[var(--kvc-line-strong)] shadow-sm select-none pointer-events-auto ${className}`}
      aria-label="Cụm điều khiển khung nhìn nổi"
    >
      {/* Nút Đặt lại khung nhìn về Tâm UAV */}
      <Tooltip>
        <TooltipTrigger asChild>
          <Button
            variant="ghost"
            size="icon"
            onClick={onResetView}
            className="h-8 w-8 text-[var(--kvc-text-on-overlay-muted)] hover:text-[var(--kvc-accent-ink)] hover:bg-[var(--kvc-surface-2)]/40 cursor-pointer"
            aria-label="Đặt lại khung nhìn"
          >
            <LocateFixed className="h-4 w-4 text-[var(--kvc-accent-ink)]" />
          </Button>
        </TooltipTrigger>
        <TooltipContent side="left">
          <p className="text-xs">Đưa tâm bản đồ về vị trí máy bay UAV</p>
        </TooltipContent>
      </Tooltip>

      {/* Nút Đưa tâm về Mục tiêu Target */}
      <Tooltip>
        <TooltipTrigger asChild>
          <Button
            variant="ghost"
            size="icon"
            onClick={onFocusTarget}
            disabled={!hasValidTarget}
            className="h-8 w-8 text-[var(--kvc-text-on-overlay-muted)] hover:text-[var(--kvc-crit-ink)] hover:bg-[var(--kvc-surface-2)]/40 disabled:opacity-30 cursor-pointer"
            aria-label="Tâm mục tiêu"
          >
            <Crosshair className="h-4 w-4 text-[var(--kvc-crit-ink)]" />
          </Button>
        </TooltipTrigger>
        <TooltipContent side="left">
          <p className="text-xs">
            {hasValidTarget ? 'Đưa tâm bản đồ về mục tiêu cứu nạn SAR' : 'Chưa có tọa độ mục tiêu để focus'}
          </p>
        </TooltipContent>
      </Tooltip>
    </div>
  )
}
