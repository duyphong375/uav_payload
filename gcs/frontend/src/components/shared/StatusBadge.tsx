import React from 'react'
import { Badge } from '@/components/ui/badge'

export type StatusVariant = 'emerald' | 'amber' | 'red' | 'cyan' | 'slate'

interface StatusBadgeProps {
  label: string
  status?: string
  variant?: StatusVariant
  icon?: React.ReactNode
  pulse?: boolean
  className?: string
}

export const StatusBadge: React.FC<StatusBadgeProps> = ({
  label,
  status,
  variant = 'slate',
  icon,
  pulse = false,
  className = '',
}) => {
  const variantStyles: Record<StatusVariant, string> = {
    emerald: 'bg-emerald-500/15 text-emerald-600 dark:text-emerald-400 border-emerald-500/30',
    amber: 'bg-amber-500/15 text-amber-600 dark:text-amber-400 border-amber-500/30',
    red: 'bg-red-500/15 text-red-600 dark:text-red-400 border-red-500/30',
    cyan: 'bg-cyan-500/15 text-cyan-600 dark:text-cyan-400 border-cyan-500/30',
    slate: 'bg-slate-500/15 text-slate-600 dark:text-slate-400 border-slate-500/30',
  }

  return (
    <Badge
      variant="outline"
      className={`inline-flex items-center gap-1.5 px-2 py-0.5 text-xs font-medium border ${variantStyles[variant]} ${className}`}
    >
      {pulse && (
        <span className="relative flex h-2 w-2">
          <span
            className={`animate-ping absolute inline-flex h-full w-full rounded-full opacity-75 ${
              variant === 'emerald'
                ? 'bg-emerald-400'
                : variant === 'amber'
                ? 'bg-amber-400'
                : variant === 'red'
                ? 'bg-red-400'
                : 'bg-cyan-400'
            }`}
          />
          <span
            className={`relative inline-flex rounded-full h-2 w-2 ${
              variant === 'emerald'
                ? 'bg-emerald-500'
                : variant === 'amber'
                ? 'bg-amber-500'
                : variant === 'red'
                ? 'bg-red-500'
                : 'bg-cyan-500'
            }`}
          />
        </span>
      )}
      {icon && <span className="shrink-0">{icon}</span>}
      <span className="font-semibold">{label}</span>
      {status && <span className="opacity-80">({status})</span>}
    </Badge>
  )
}
