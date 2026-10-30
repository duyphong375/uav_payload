import React from 'react'
import {
  AlertCircle,
  AlertTriangle,
  Info,
} from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import type { EventLogEntry } from '@/types/telemetry'
import { LOG_ACTOR_SHORT_LABEL, logActor } from './actor'

interface EventLogTableProps {
  entries: EventLogEntry[]
  showActor?: boolean
}

/** HH:MM:SS của mốc ISO; trả N/A khi mốc không hợp lệ thay vì bịa giờ hiện tại. */
function formatClock(timestampIso: string): string {
  const date = new Date(timestampIso)
  if (Number.isNaN(date.getTime())) return 'N/A'
  const pad = (value: number) => String(value).padStart(2, '0')
  return `${pad(date.getHours())}:${pad(date.getMinutes())}:${pad(date.getSeconds())}`
}

export const EventLogTable: React.FC<EventLogTableProps> = ({ entries, showActor = true }) => {
  const getLevelBadge = (level: string) => {
    switch (level) {
      case 'CRITICAL':
        return (
          <Badge
            variant="destructive"
            className="text-[11px] px-1.5 py-0 font-medium inline-flex items-center gap-1"
          >
            <AlertCircle className="h-3 w-3" />
            CRITICAL
          </Badge>
        )
      case 'WARN':
        return (
          <Badge
            variant="outline"
            className="text-[11px] px-1.5 py-0 border-[var(--kvc-warn-line)] text-[var(--kvc-warn-ink)] bg-[var(--kvc-warn-bg)] font-medium inline-flex items-center gap-1"
          >
            <AlertTriangle className="h-3 w-3" />
            WARN
          </Badge>
        )
      default:
        return (
          <Badge
            variant="outline"
            className="text-[11px] px-1.5 py-0 border-[var(--kvc-line-strong)] text-[var(--kvc-text-muted)] bg-[var(--kvc-surface-2)] font-medium inline-flex items-center gap-1"
          >
            <Info className="h-3 w-3" />
            INFO
          </Badge>
        )
    }
  }

  const columnCount = showActor ? 6 : 5

  return (
    <div className="border rounded-kvc-panel bg-card overflow-hidden shadow-xs">
      <Table>
        <TableHeader className="bg-muted/40">
          <TableRow className="border-border">
            <TableHead className="w-[92px] text-xs font-semibold py-2.5">
              Thời gian
            </TableHead>
            <TableHead className="w-[104px] text-xs font-semibold py-2.5">
              Mức độ
            </TableHead>
            {showActor && (
              <TableHead className="w-[96px] text-xs font-semibold py-2.5">
                Tác nhân
              </TableHead>
            )}
            <TableHead className="w-[110px] text-xs font-semibold py-2.5">
              Nguồn
            </TableHead>
            <TableHead className="w-[170px] text-xs font-semibold py-2.5">
              Mã sự kiện
            </TableHead>
            <TableHead className="text-xs font-semibold py-2.5">
              Nội dung thông báo
            </TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {entries.length === 0 ? (
            <TableRow className="border-border/60">
              <TableCell
                colSpan={columnCount}
                className="py-8 text-center text-xs text-muted-foreground"
              >
                Chưa có sự kiện nào trong phiên này
              </TableCell>
            </TableRow>
          ) : (
            entries.map((item) => (
              <TableRow key={item.id} className="border-border/60 hover:bg-muted/30">
                <TableCell
                  className="text-xs font-mono text-muted-foreground py-2"
                  title={item.timestamp_iso}
                >
                  {formatClock(item.timestamp_iso)}
                </TableCell>
                <TableCell className="py-2 kvc-serif">
                  {getLevelBadge(item.level)}
                </TableCell>
                {showActor && (
                  <TableCell className="text-xs text-foreground py-2 kvc-serif">
                    {LOG_ACTOR_SHORT_LABEL[logActor(item)]}
                  </TableCell>
                )}
                <TableCell className="text-xs font-medium text-foreground py-2">
                  <Badge variant="outline" className="text-[11px] py-0 px-1.5 font-mono">
                    {item.source}
                  </Badge>
                </TableCell>
                <TableCell className="text-xs font-bold font-mono text-foreground py-2">
                  {item.code}
                </TableCell>
                <TableCell className="text-xs text-foreground/90 py-2 leading-relaxed kvc-serif whitespace-normal">
                  <span className="line-clamp-2" title={item.message}>
                    {item.message}
                  </span>
                </TableCell>
              </TableRow>
            ))
          )}
        </TableBody>
      </Table>
    </div>
  )
}
