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
      className={`absolute bottom-3 right-3 z-[400] flex flex-col gap-1.5 p-1 rounded-xl bg-slate-950/80 dark:bg-slate-950/85 backdrop-blur-md border border-white/20 dark:border-white/10 shadow-xl select-none pointer-events-auto ${className}`}
      aria-label="Cụm điều khiển khung nhìn nổi"
    >
      {/* Nút Đặt lại khung nhìn về Tâm UAV */}
      <Tooltip>
        <TooltipTrigger asChild>
          <Button
            variant="ghost"
            size="icon"
            onClick={onResetView}
            className="h-8 w-8 text-slate-200 hover:text-cyan-400 hover:bg-white/10 cursor-pointer"
            aria-label="Đặt lại khung nhìn"
          >
            <LocateFixed className="h-4 w-4 text-cyan-400" />
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
            className="h-8 w-8 text-slate-200 hover:text-rose-400 hover:bg-white/10 disabled:opacity-30 cursor-pointer"
            aria-label="Tâm mục tiêu"
          >
            <Crosshair className="h-4 w-4 text-rose-500" />
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
