import React from 'react'
import {
  AlertCircle,
  AlertTriangle,
  CheckCircle2,
  Clock,
  HelpCircle,
  Layers,
  Wrench,
} from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { useMission } from '@/state/MissionProvider'
import type { AlertItem } from '@/types/telemetry'

interface AlertItemCardProps {
  alert: AlertItem
}

export const AlertItemCard: React.FC<AlertItemCardProps> = ({ alert }) => {
  const { dispatch } = useMission()
  const isCritical = alert.level === 'CRITICAL'

  const getConditionBadge = (status: string) => {
    switch (status) {
      case 'ACTIVE':
        return (
          <Badge
            variant="destructive"
            className="text-[10px] px-2 py-0.5 font-medium"
          >
            Đang tồn tại
          </Badge>
        )
      case 'RESOLVED':
        return (
          <Badge
            variant="outline"
            className="text-[10px] px-2 py-0.5 border-emerald-500/40 text-emerald-600 dark:text-emerald-400 bg-emerald-500/10 font-medium"
          >
            Đã phục hồi
          </Badge>
        )
      default:
        return (
          <Badge
            variant="outline"
            className="text-[10px] px-2 py-0.5 border-amber-500/40 text-amber-600 dark:text-amber-400 bg-amber-500/10 font-medium"
          >
            Chưa xác định
          </Badge>
        )
    }
  }

  return (
    <Card
      className={`border transition-shadow hover:shadow-xs ${
        isCritical
          ? 'border-red-500/30 bg-red-500/5'
          : 'border-amber-500/30 bg-amber-500/5'
      }`}
    >
      <CardContent className="p-3.5 flex flex-col gap-2.5">
        {/* Hàng 1: Icon, Tiêu đề, Badge Mức độ, Badge Nguồn & Tình trạng lỗi */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
          <div className="flex items-start gap-2.5 min-w-0">
            {isCritical ? (
              <AlertCircle className="h-5 w-5 mt-0.5 text-red-500 shrink-0" />
            ) : (
              <AlertTriangle className="h-5 w-5 mt-0.5 text-amber-500 shrink-0" />
            )}
            <div className="flex flex-col min-w-0">
              <div className="flex items-center gap-2 flex-wrap">
                <span className="font-bold text-sm text-foreground">
                  {alert.code}
                </span>
                <Badge
                  variant="outline"
                  className="text-[10px] py-0 px-1.5 font-mono text-muted-foreground"
                >
                  Nguồn: {alert.source_category}
                </Badge>
                {getConditionBadge(alert.condition_status)}
              </div>
              <p className="text-xs text-foreground/90 mt-0.5 font-medium">
                {alert.message}
              </p>
            </div>
          </div>

          {/* Thao tác Tiếp nhận */}
          <div className="flex items-center gap-2 self-start sm:self-center shrink-0">
            {alert.acknowledged ? (
              <div className="flex items-center gap-1.5 text-xs text-emerald-600 dark:text-emerald-400 font-medium px-2 py-1 rounded-md bg-emerald-500/10 border border-emerald-500/20">
                <CheckCircle2 className="h-3.5 w-3.5" />
                <span>Đã tiếp nhận</span>
              </div>
            ) : (
              <Button
                variant="outline"
                size="sm"
                onClick={() =>
                  dispatch({ type: 'ACKNOWLEDGE_ALERT', payload: alert.id })
                }
                className="h-7 text-xs font-medium border-border hover:bg-card"
              >
                Tiếp nhận cảnh báo
              </Button>
            )}
          </div>
        </div>

        {/* Hàng 2: Tác động (Impact) & Gợi ý kiểm tra (Remediation) */}
        {(alert.impact || alert.remediation) && (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-2 p-2 rounded-lg bg-card/60 border border-border/60 text-xs">
            {alert.impact && (
              <div className="flex items-start gap-1.5 text-muted-foreground">
                <HelpCircle className="h-3.5 w-3.5 text-amber-500 shrink-0 mt-0.5" />
                <div>
                  <span className="font-semibold text-foreground">Tác động: </span>
                  <span>{alert.impact}</span>
                </div>
              </div>
            )}
            {alert.remediation && (
              <div className="flex items-start gap-1.5 text-muted-foreground">
                <Wrench className="h-3.5 w-3.5 text-cyan-500 shrink-0 mt-0.5" />
                <div>
                  <span className="font-semibold text-foreground">Gợi ý kiểm tra: </span>
                  <span>{alert.remediation}</span>
                </div>
              </div>
            )}
          </div>
        )}

        {/* Hàng 3: Thời gian xuất hiện, Lần lặp và Trạng thái thao tác */}
        <div className="flex flex-wrap items-center justify-between gap-2 pt-1.5 border-t border-border/40 text-[11px] text-muted-foreground font-mono">
          <div className="flex items-center gap-3">
            <span className="inline-flex items-center gap-1">
              <Clock className="h-3 w-3" />
              Lần đầu: {new Date(alert.first_seen_iso).toLocaleTimeString()}
            </span>
            <span>
              Lần gần nhất: {new Date(alert.last_seen_iso).toLocaleTimeString()}
            </span>
          </div>

          <div className="flex items-center gap-2">
            <span className="inline-flex items-center gap-1">
              <Layers className="h-3 w-3" />
              Lặp: <strong className="text-foreground">{alert.occurrence_count}</strong> lần
            </span>
            {alert.acknowledged_at_iso && (
              <span className="text-muted-foreground">
                (Tiếp nhận lúc {new Date(alert.acknowledged_at_iso).toLocaleTimeString()})
              </span>
            )}
          </div>
        </div>
      </CardContent>
    </Card>
  )
}
