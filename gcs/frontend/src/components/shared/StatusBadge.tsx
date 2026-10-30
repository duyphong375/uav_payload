import React from 'react'
import { Badge } from '@/components/ui/badge'

export type StatusVariant = 'ok' | 'warn' | 'crit' | 'accent' | 'neutral'

interface StatusBadgeProps {
  label: string
  status?: string
  variant?: StatusVariant
  icon?: React.ReactNode
  pulse?: boolean
  className?: string
}

const variantStyles: Record<StatusVariant, { shell: string; dot: string; ping: string }> = {
  ok: {
    shell:
      'bg-[var(--kvc-ok-bg)] text-[var(--kvc-ok-ink)] border-[var(--kvc-ok-line)]',
    dot: 'bg-[var(--kvc-ok)]',
    ping: 'bg-[var(--kvc-ok)]',
  },
  warn: {
    shell:
      'bg-[var(--kvc-warn-bg)] text-[var(--kvc-warn-ink)] border-[var(--kvc-warn-line)]',
    dot: 'bg-[var(--kvc-warn)]',
    ping: 'bg-[var(--kvc-warn)]',
  },
  crit: {
    shell:
      'bg-[var(--kvc-crit-bg)] text-[var(--kvc-crit-ink)] border-[var(--kvc-crit-line)]',
    dot: 'bg-[var(--kvc-crit)]',
    ping: 'bg-[var(--kvc-crit)]',
  },
  accent: {
    shell:
      'bg-[var(--kvc-accent-bg)] text-[var(--kvc-accent-ink)] border-[var(--kvc-accent-line)]',
    dot: 'bg-[var(--kvc-accent)]',
    ping: 'bg-[var(--kvc-accent)]',
  },
  neutral: {
    shell:
      'bg-[var(--kvc-surface-2)] text-[var(--kvc-text-muted)] border-[var(--kvc-line-strong)]',
    dot: 'bg-[var(--kvc-text-muted)]',
    ping: 'bg-[var(--kvc-text-muted)]',
  },
}

export const StatusBadge: React.FC<StatusBadgeProps> = ({
  label,
  status,
  variant = 'neutral',
  icon,
  pulse = false,
  className = '',
}) => {
  const styles = variantStyles[variant]

  return (
    <Badge
      variant="outline"
      className={`inline-flex items-center gap-1.5 px-2 py-0.5 text-xs font-medium border ${styles.shell} ${className}`}
    >
      {pulse && (
        <span className="relative flex h-2 w-2">
          <span
            className={`animate-ping absolute inline-flex h-full w-full rounded-full opacity-75 ${styles.ping}`}
          />
          <span className={`relative inline-flex rounded-full h-2 w-2 ${styles.dot}`} />
        </span>
      )}
      {icon && <span className="shrink-0">{icon}</span>}
      <span className="font-semibold">{label}</span>
      {status && <span className="opacity-80">({status})</span>}
    </Badge>
  )
}
