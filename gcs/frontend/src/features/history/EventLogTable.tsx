import React from 'react'
import {
  AlertCircle,
  AlertTriangle,
  EyeOff,
  Info,
  RotateCcw,
  Trash2,
} from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import { LOG_ACTOR_SHORT_LABEL, logActor } from './actor'
import { formatClock, type DayGroup } from './eventLogTime'

interface EventLogTableProps {
  groups: DayGroup[]
  hiddenIds: Set<string>
  onHide: (id: string) => void
  onRestore: (id: string) => void
  onDelete?: (id: string) => void
}

const COLUMN_COUNT = 7

export const EventLogTable: React.FC<EventLogTableProps> = ({
  groups,
  hiddenIds,
  onHide,
  onRestore,
  onDelete,
}) => {
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

  const isEmpty = groups.length === 0

  return (
    <div className="border rounded-kvc-panel bg-card overflow-hidden shadow-xs">
      <Table>
        <TableHeader className="bg-muted/40">
          <TableRow className="border-border">
            <TableHead className="w-[88px] text-xs font-semibold kvc-density-cell">Thời gian</TableHead>
            <TableHead className="w-[104px] text-xs font-semibold kvc-density-cell">Mức độ</TableHead>
            <TableHead className="w-[92px] text-xs font-semibold kvc-density-cell">Tác nhân</TableHead>
            <TableHead className="w-[110px] text-xs font-semibold kvc-density-cell">Nguồn</TableHead>
            <TableHead className="w-[168px] text-xs font-semibold kvc-density-cell">Mã sự kiện</TableHead>
            <TableHead className="text-xs font-semibold kvc-density-cell">Nội dung thông báo</TableHead>
            <TableHead className="w-[84px] text-xs font-semibold kvc-density-cell text-right">
              <span className="sr-only">Hành động</span>
            </TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {isEmpty ? (
            <TableRow className="border-border/60">
              <TableCell
                colSpan={COLUMN_COUNT}
                className="py-8 text-center text-xs text-muted-foreground"
              >
                Chưa có sự kiện nào trong phiên này
              </TableCell>
            </TableRow>
          ) : (
            groups.map((group) => (
              <React.Fragment key={group.key}>
                <TableRow className="border-border/60 bg-muted/30 hover:bg-muted/30">
                  <TableCell colSpan={COLUMN_COUNT} className="py-1.5">
                    <div className="flex items-center gap-2">
                      <span className="text-[11px] font-bold uppercase tracking-wide text-foreground">
                        {group.label}
                      </span>
                      <Badge variant="outline" className="text-[11px] py-0 px-1.5 font-mono">
                        {group.entries.length} mục
                      </Badge>
                    </div>
                  </TableCell>
                </TableRow>
                {group.entries.map((item) => {
                  const hidden = hiddenIds.has(item.id)
                  return (
                    <TableRow
                      key={item.id}
                      className={`border-border/60 hover:bg-muted/30 ${hidden ? 'opacity-55' : ''}`}
                    >
                      <TableCell
                        className="text-xs font-mono text-muted-foreground kvc-density-cell"
                        title={item.timestamp_iso}
                      >
                        {formatClock(item.timestamp_iso)}
                      </TableCell>
                      <TableCell className="kvc-density-cell">{getLevelBadge(item.level)}</TableCell>
                      <TableCell className="text-xs text-foreground kvc-density-cell">
                        {LOG_ACTOR_SHORT_LABEL[logActor(item)]}
                      </TableCell>
                      <TableCell className="text-xs font-medium text-foreground kvc-density-cell">
                        <Badge variant="outline" className="text-[11px] py-0 px-1.5 font-mono">
                          {item.source}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-xs font-bold font-mono text-foreground kvc-density-cell">
                        {item.code}
                      </TableCell>
                      <TableCell className="text-xs text-foreground/90 kvc-density-cell leading-relaxed whitespace-normal">
                        <span className="flex items-start gap-1.5">
                          {hidden && (
                            <Badge
                              variant="outline"
                              className="text-[11px] py-0 px-1.5 shrink-0 border-[var(--kvc-line-strong)] text-[var(--kvc-text-muted)] bg-[var(--kvc-surface-2)]"
                            >
                              ĐÃ ẨN
                            </Badge>
                          )}
                          <span className="line-clamp-2" title={item.message}>
                            {item.message}
                          </span>
                        </span>
                      </TableCell>
                      <TableCell className="kvc-density-cell text-right">
                        <div className="flex items-center justify-end gap-0.5">
                          {onDelete && (
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={() => onDelete(item.id)}
                              className="h-6 px-1.5 text-[11px] text-muted-foreground hover:text-destructive hover:bg-destructive/10 cursor-pointer"
                              aria-label={`Xoá sự kiện ${item.code} lúc ${formatClock(item.timestamp_iso)}`}
                              title="Xóa sự kiện này khỏi phiên"
                            >
                              <Trash2 className="h-3.5 w-3.5" />
                            </Button>
                          )}
                          {hidden ? (
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={() => onRestore(item.id)}
                              className="h-6 px-1.5 text-[11px] gap-1 text-muted-foreground hover:text-foreground cursor-pointer"
                              aria-label={`Bỏ ẩn sự kiện ${item.code} lúc ${formatClock(item.timestamp_iso)}`}
                            >
                              <RotateCcw className="h-3.5 w-3.5" />
                            </Button>
                          ) : (
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={() => onHide(item.id)}
                              className="h-6 px-1.5 text-[11px] text-muted-foreground hover:text-foreground cursor-pointer"
                              aria-label={`Ẩn sự kiện ${item.code} lúc ${formatClock(item.timestamp_iso)}`}
                            >
                              <EyeOff className="h-3.5 w-3.5" />
                            </Button>
                          )}
                        </div>
                      </TableCell>
                    </TableRow>
                  )
                })}
              </React.Fragment>
            ))
          )}
        </TableBody>
      </Table>
    </div>
  )
}
