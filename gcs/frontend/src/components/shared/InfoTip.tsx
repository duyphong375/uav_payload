import React from 'react'
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/tooltip'

export interface InfoTipProps {
  /** Nội dung giải thích tác dụng của mục */
  text: string
  /** Kích thước icon: 'sm' (16px) | 'md' (18px) */
  size?: 'sm' | 'md'
  /** Vị trí tooltip hiển thị */
  side?: 'top' | 'right' | 'bottom' | 'left'
  className?: string
}

/**
 * Component hiển thị dấu chấm than (!) mang tính năng Tooltip giải thích tác dụng của mục.
 */
export const InfoTip: React.FC<InfoTipProps> = ({
  text,
  size = 'sm',
  side = 'top',
  className = '',
}) => {
  const sizeClasses =
    size === 'md'
      ? 'w-4.5 h-4.5 text-[11px]'
      : 'w-4 h-4 text-[10px]'

  return (
    <TooltipProvider delayDuration={100}>
      <Tooltip>
        <TooltipTrigger asChild>
          <button
            type="button"
            aria-label={`Chú thích: ${text}`}
            className={`inline-flex items-center justify-center rounded-full border border-primary/30 bg-primary/10 text-primary hover:bg-primary hover:text-primary-foreground font-mono font-bold leading-none cursor-help transition-all shadow-2xs select-none shrink-0 ${sizeClasses} ${className}`}
          >
            !
          </button>
        </TooltipTrigger>
        <TooltipContent
          side={side}
          sideOffset={5}
          className="max-w-xs text-xs font-normal leading-relaxed bg-popover text-popover-foreground border border-border/80 shadow-md p-2.5 rounded-lg z-50 text-left"
        >
          <div className="flex items-start gap-1.5">
            <span className="font-bold text-primary font-mono shrink-0">[!]</span>
            <span>{text}</span>
          </div>
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  )
}
