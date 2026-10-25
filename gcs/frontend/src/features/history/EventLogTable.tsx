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

interface EventLogTableProps {
  entries: EventLogEntry[]
}

export const EventLogTable: React.FC<EventLogTableProps> = ({ entries }) => {
  const getLevelBadge = (level: string) => {
    switch (level) {
      case 'CRITICAL':
        return (
          <Badge
            variant="destructive"
            className="text-[10px] px-1.5 py-0 font-medium inline-flex items-center gap-1"
          >
            <AlertCircle className="h-3 w-3" />
            CRITICAL
          </Badge>
        )
      case 'WARN':
        return (
          <Badge
            variant="outline"
            className="text-[10px] px-1.5 py-0 border-amber-500/40 text-amber-600 dark:text-amber-400 bg-amber-500/10 font-medium inline-flex items-center gap-1"
          >
            <AlertTriangle className="h-3 w-3" />
            WARN
          </Badge>
        )
      default:
        return (
          <Badge
            variant="outline"
            className="text-[10px] px-1.5 py-0 border-slate-500/40 text-slate-600 dark:text-slate-400 bg-slate-500/10 font-medium inline-flex items-center gap-1"
          >
            <Info className="h-3 w-3" />
            INFO
          </Badge>
        )
    }
  }

  return (
    <div className="border rounded-xl bg-card overflow-hidden shadow-xs">
      <Table>
        <TableHeader className="bg-muted/40">
          <TableRow className="border-border">
            <TableHead className="w-[110px] text-xs font-semibold py-2.5">
              Thời gian
            </TableHead>
            <TableHead className="w-[100px] text-xs font-semibold py-2.5">
              Mức độ
            </TableHead>
            <TableHead className="w-[110px] text-xs font-semibold py-2.5">
              Nguồn
            </TableHead>
            <TableHead className="w-[160px] text-xs font-semibold py-2.5">
              Mã sự kiện
            </TableHead>
            <TableHead className="text-xs font-semibold py-2.5">
              Nội dung thông báo
            </TableHead>
            <TableHead className="w-[140px] text-xs font-semibold py-2.5 font-mono">
              Phiên (Session)
            </TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {entries.map((item) => (
            <TableRow key={item.id} className="border-border/60 hover:bg-muted/30">
              <TableCell className="text-xs font-mono text-muted-foreground py-2">
                {new Date(item.timestamp_iso).toLocaleTimeString()}
              </TableCell>
              <TableCell className="py-2">
                {getLevelBadge(item.level)}
              </TableCell>
              <TableCell className="text-xs font-medium text-foreground py-2">
                <Badge variant="outline" className="text-[10px] py-0 px-1.5 font-mono">
                  {item.source}
                </Badge>
              </TableCell>
              <TableCell className="text-xs font-bold font-mono text-foreground py-2">
                {item.code}
              </TableCell>
              <TableCell className="text-xs text-foreground/90 py-2 leading-relaxed">
                {item.message}
              </TableCell>
              <TableCell className="text-[11px] font-mono text-muted-foreground py-2 truncate" title={item.session_id}>
                {item.session_id.length > 14 ? `${item.session_id.slice(0, 12)}...` : item.session_id}
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  )
}
