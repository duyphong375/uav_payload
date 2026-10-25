import React from 'react'
import { InfoTip } from '@/components/shared/InfoTip'

interface PageHeaderProps {
  breadcrumb?: string
  title: string
  subtitle?: string
  infoTip?: string
  badge?: React.ReactNode
  actions?: React.ReactNode
  className?: string
}

export const PageHeader: React.FC<PageHeaderProps> = ({
  breadcrumb,
  title,
  subtitle,
  infoTip,
  badge,
  actions,
  className = '',
}) => {
  return (
    <div className={`flex flex-col sm:flex-row sm:items-center justify-between gap-2.5 pb-2 border-b border-border/50 shrink-0 ${className}`}>
      <div className="flex flex-col gap-0.5">
        {breadcrumb && (
          <div className="text-[11px] font-medium text-muted-foreground uppercase tracking-wider">
            {breadcrumb}
          </div>
        )}
        <div className="flex items-center gap-2">
          <h1 className="text-lg sm:text-xl font-bold tracking-tight text-foreground">
            {title}
          </h1>
          {infoTip && <InfoTip text={infoTip} />}
          {badge}
        </div>
        {subtitle && (
          <p className="text-xs text-muted-foreground">
            {subtitle}
          </p>
        )}
      </div>
      {actions && (
        <div className="flex items-center gap-2 self-start sm:self-auto shrink-0">
          {actions}
        </div>
      )}
    </div>
  )
}

