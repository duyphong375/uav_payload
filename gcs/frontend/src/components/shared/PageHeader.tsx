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
      <div className="flex flex-col gap-0.5 min-w-0">
        {breadcrumb && (
          <div className="text-[11px] font-medium text-muted-foreground uppercase tracking-wider">
            {breadcrumb}
          </div>
        )}
        <div className="flex items-center gap-2 flex-wrap">
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
        /* `flex-wrap`: ở điện thoại (360 px) 2–3 nút hành động cộng lại rộng hơn
           khung, nếu để `shrink-0` một hàng thì nút cuối bị đẩy ra ngoài và bị
           cắt. Cho xuống hàng thì vẫn bấm được toàn bộ. */
        <div className="flex items-center gap-2 flex-wrap self-start sm:self-auto sm:shrink-0">
          {actions}
        </div>
      )}
    </div>
  )
}

