import React, { useEffect, useMemo, useState } from 'react'
import {
  Download,
  History,
  RotateCcw,
  Search,
} from 'lucide-react'
import { PageHeader } from '@/components/shared/PageHeader'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { TelemetryClient, type StoredSession } from '@/services/telemetryClient'
import { useMission } from '@/state/MissionProvider'
import type { AlertLevel } from '@/types/telemetry'
import {
  LOG_ACTOR_LABEL,
  logActor,
  type LogActor,
} from './actor'
import { EventLogTable } from './EventLogTable'

type ActorFilter = 'ALL' | LogActor

const formatCount = (value: number) => new Intl.NumberFormat('vi-VN').format(value)

const formatSize = (bytes: number) => {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
}

const formatSavedAt = (iso: string | null) => {
  if (!iso) return 'N/A'
  const date = new Date(iso)
  if (Number.isNaN(date.getTime())) return 'N/A'
  return date.toLocaleString('vi-VN', {
    day: '2-digit',
    month: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  })
}

/** Kích hoạt tải một chuỗi CSV mà không cần backend. */
function downloadCsv(filename: string, rows: string[][]) {
  const csvContent = rows.map((row) => row.join(',')).join('\r\n')
  const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' })
  const url = URL.createObjectURL(blob)
  const link = document.createElement('a')
  link.setAttribute('href', url)
  link.setAttribute('download', filename)
  document.body.appendChild(link)
  link.click()
  document.body.removeChild(link)
  URL.revokeObjectURL(url)
}

const csvCell = (value: string | number) => `"${String(value).replace(/"/g, '""')}"`

/** Tên file có mốc thời gian, tính ngoài thân render để không gọi hàm không thuần. */
const timestampedFilename = (stem: string) => `${stem}_${Date.now()}.csv`

export const EventLogPage: React.FC = () => {
  const { state } = useMission()
  const { event_logs, source_mode, session_id, diagnostics } = state

  // Metadata phiên đã lưu trên backend; rỗng khi backend chưa có phiên hoặc lỗi mạng.
  const [sessions, setSessions] = useState<StoredSession[]>([])
  const [sessionsLoading, setSessionsLoading] = useState(true)

  // Bộ lọc nhật ký của phiên đang chạy
  const [actorFilter, setActorFilter] = useState<ActorFilter>('ALL')
  const [searchKeyword, setSearchKeyword] = useState('')
  const [levelFilter, setLevelFilter] = useState<'ALL' | AlertLevel>('ALL')
  const [sourceFilter, setSourceFilter] = useState<string>('ALL')

  useEffect(() => {
    let active = true
    void TelemetryClient.fetchSessions().then((res) => {
      if (!active) return
      setSessions(res ? res.sessions.filter((s) => s.records > 0) : [])
      setSessionsLoading(false)
    })
    return () => {
      active = false
    }
  }, [])

  const actorCounts = useMemo(() => {
    let operator = 0
    for (const log of event_logs) {
      if (logActor(log) === 'OPERATOR') operator++
    }
    return { all: event_logs.length, operator, system: event_logs.length - operator }
  }, [event_logs])

  // Nguồn lấy từ chính dữ liệu đang có: union `source` không đóng nên không dựng danh sách cố định.
  const availableSources = useMemo(
    () => Array.from(new Set(event_logs.map((log) => log.source))).sort(),
    [event_logs]
  )

  const filteredLogs = useMemo(() => {
    const query = searchKeyword.trim().toLowerCase()
    return event_logs.filter((log) => {
      if (actorFilter !== 'ALL' && logActor(log) !== actorFilter) return false
      if (levelFilter !== 'ALL' && log.level !== levelFilter) return false
      if (sourceFilter !== 'ALL' && log.source !== sourceFilter) return false
      if (!query) return true
      return (
        log.code.toLowerCase().includes(query) ||
        log.message.toLowerCase().includes(query) ||
        log.source.toLowerCase().includes(query)
      )
    })
  }, [event_logs, actorFilter, levelFilter, sourceFilter, searchKeyword])

  const hasActiveFilter =
    actorFilter !== 'ALL' ||
    searchKeyword.trim() !== '' ||
    levelFilter !== 'ALL' ||
    sourceFilter !== 'ALL'

  const handleResetFilter = () => {
    setActorFilter('ALL')
    setSearchKeyword('')
    setLevelFilter('ALL')
    setSourceFilter('ALL')
  }

  // Xuất bằng chứng sự kiện của phiên đang chạy (đúng những dòng đang thấy trên bảng).
  const handleExportLogsCsv = () => {
    if (filteredLogs.length === 0) return

    const headers = ['Thời gian', 'Mức độ', 'Tác nhân', 'Nguồn', 'Mã sự kiện', 'Nội dung', 'Phiên']
    const rows = filteredLogs.map((item) => [
      csvCell(item.timestamp_iso),
      csvCell(item.level),
      csvCell(LOG_ACTOR_LABEL[logActor(item)]),
      csvCell(item.source),
      csvCell(item.code),
      csvCell(item.message),
      csvCell(item.session_id),
    ])

    downloadCsv(
      timestampedFilename(`kvc_rescue_evidence_${session_id || 'CHUA-XAC-DINH'}`),
      [headers, ...rows]
    )
  }

  // Xuất metadata của một phiên lưu trữ. Không kèm log của phiên đang chạy.
  const handleExportSessionMetadataCsv = (session: StoredSession) => {
    const headers = [
      'Loại dữ liệu',
      'Mã phiên',
      'Thời điểm lưu (ISO)',
      'Số gói',
      'Dung lượng (byte)',
      'Tệp lưu trữ',
    ]
    const rows = [
      [
        csvCell('METADATA PHIÊN — KHÔNG PHẢI NHẬT KÝ SỰ KIỆN'),
        csvCell(session.session_id),
        csvCell(session.last_persisted_at_iso ?? 'N/A'),
        csvCell(session.records),
        csvCell(session.size_bytes),
        csvCell(session.file),
      ],
    ]

    downloadCsv(
      timestampedFilename(`kvc_session_metadata_${session.session_id}`),
      [headers, ...rows]
    )
  }

  return (
    <div className="kvc-serif flex-1 flex flex-col p-2.5 sm:p-4 gap-3 overflow-hidden w-full select-none">
      <PageHeader
        breadcrumb="Dữ liệu · Nhật ký phiên"
        title="Nhật ký phiên"
        infoTip="Bằng chứng sự kiện của phiên đang chạy và danh sách metadata các phiên đã lưu trên backend. Không có chế độ phát lại."
        subtitle="Bằng chứng sự kiện cứu nạn của phiên đang chạy."
        actions={
          <Button
            variant="outline"
            size="sm"
            onClick={handleExportLogsCsv}
            disabled={filteredLogs.length === 0}
            className="h-8 text-xs gap-1.5 border-border shadow-2xs hover:border-primary/50 cursor-pointer"
          >
            <Download className="h-3.5 w-3.5 text-primary" />
            <span>Xuất CSV ({filteredLogs.length})</span>
          </Button>
        }
      />

      {/* KHỐI 1 — Nhật ký phiên đang chạy */}
      <section className="flex-1 flex flex-col gap-2 min-h-0 p-3 rounded-kvc-panel border border-border bg-card shadow-xs">
        <div className="flex flex-wrap items-center justify-between gap-2 pb-1.5 border-b border-border/50">
          <div className="flex items-center gap-1.5 text-xs font-bold text-foreground">
            <History className="h-4 w-4 text-primary" />
            Nhật ký phiên đang chạy
          </div>
          <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-[11px] text-muted-foreground">
            <span>
              Phiên: <span className="font-mono text-foreground">{session_id || 'N/A'}</span>
            </span>
            <span aria-hidden="true">·</span>
            <span>
              Nguồn: <span className="font-mono text-foreground">{source_mode}</span>
            </span>
            <span aria-hidden="true">·</span>
            <span>
              Gói đã nhận:{' '}
              <span className="font-mono text-foreground">
                {formatCount(diagnostics.packets_received_total)}
              </span>
            </span>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <div className="flex items-center gap-0.5 bg-muted/60 p-0.5 rounded-kvc-control border border-border/50">
            {(
              [
                ['ALL', 'Tất cả', actorCounts.all],
                ['OPERATOR', LOG_ACTOR_LABEL.OPERATOR, actorCounts.operator],
                ['SYSTEM', LOG_ACTOR_LABEL.SYSTEM, actorCounts.system],
              ] as Array<[ActorFilter, string, number]>
            ).map(([value, label, count]) => (
              <Button
                key={value}
                variant={actorFilter === value ? 'default' : 'ghost'}
                size="sm"
                onClick={() => setActorFilter(value)}
                aria-pressed={actorFilter === value}
                className="h-7 px-2.5 text-xs font-semibold cursor-pointer"
              >
                <span>{label}</span>
                <span className="font-mono text-[11px] opacity-80">{formatCount(count)}</span>
              </Button>
            ))}
          </div>

          <div className="flex items-center gap-2 flex-1 min-w-[180px] px-2 py-1 rounded-kvc-control border border-input bg-background text-xs">
            <Search className="h-3 w-3 text-muted-foreground shrink-0" />
            <input
              type="text"
              placeholder="Tìm mã, nội dung…"
              value={searchKeyword}
              onChange={(e) => setSearchKeyword(e.target.value)}
              className="w-full bg-transparent text-xs text-foreground placeholder:text-muted-foreground focus:outline-none"
              aria-label="Tìm mã hoặc nội dung sự kiện"
            />
          </div>

          <div className="flex items-center gap-1.5">
            <span className="text-muted-foreground text-[11px]">Mức độ</span>
            <Select
              value={levelFilter}
              onValueChange={(value) => setLevelFilter(value as 'ALL' | AlertLevel)}
            >
              <SelectTrigger className="h-7 w-[100px] text-xs" aria-label="Lọc theo mức độ">
                <SelectValue placeholder="Tất cả" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="ALL">Tất cả</SelectItem>
                <SelectItem value="INFO">INFO</SelectItem>
                <SelectItem value="WARN">WARN</SelectItem>
                <SelectItem value="CRITICAL">CRITICAL</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <div className="flex items-center gap-1.5">
            <span className="text-muted-foreground text-[11px]">Nguồn</span>
            <Select
              value={sourceFilter}
              onValueChange={(value) => setSourceFilter(value)}
            >
              <SelectTrigger className="h-7 w-[120px] text-xs" aria-label="Lọc theo nguồn">
                <SelectValue placeholder="Tất cả" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="ALL">Tất cả</SelectItem>
                {availableSources.map((source) => (
                  <SelectItem key={source} value={source}>
                    {source}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {hasActiveFilter && (
            <Button
              variant="ghost"
              size="sm"
              onClick={handleResetFilter}
              className="h-7 px-2 text-xs gap-1 text-muted-foreground hover:text-foreground cursor-pointer"
            >
              <RotateCcw className="h-3 w-3" />
              <span>Đặt lại</span>
            </Button>
          )}
        </div>

        <div className="flex-1 overflow-y-auto min-h-0">
          <EventLogTable entries={filteredLogs} />
        </div>
      </section>

      {/* KHỐI 2 — Phiên đã lưu: chỉ metadata */}
      <section className="shrink-0 max-h-[30%] flex flex-col gap-2 p-3 rounded-kvc-panel border border-border bg-card shadow-xs min-h-0">
        <div className="flex items-center justify-between gap-2 pb-1.5 border-b border-border/50">
          <span className="text-xs font-bold text-foreground flex items-center gap-1.5">
            <History className="h-4 w-4 text-primary" />
            Phiên đã lưu
          </span>
          <Badge variant="outline" className="text-[11px] font-mono">
            {sessionsLoading ? 'Đang đọc…' : `${sessions.length} phiên`}
          </Badge>
        </div>

        {sessions.length === 0 ? (
          <p className="text-xs text-muted-foreground py-2">
            {sessionsLoading ? 'Đang đọc danh sách phiên…' : 'Chưa có phiên nào được ghi'}
          </p>
        ) : (
          <div className="overflow-auto min-h-0">
            <table className="w-full text-xs">
              <thead>
                <tr className="text-left text-muted-foreground border-b border-border/60">
                  <th className="py-1.5 pr-2 font-semibold">Mã phiên</th>
                  <th className="py-1.5 pr-2 font-semibold">Thời điểm lưu</th>
                  <th className="py-1.5 pr-2 font-semibold text-right">Gói</th>
                  <th className="py-1.5 pr-2 font-semibold text-right">Dung lượng</th>
                  <th className="py-1.5 font-semibold text-right">Metadata</th>
                </tr>
              </thead>
              <tbody>
                {sessions.map((session) => (
                  <tr key={session.session_id} className="border-b border-border/40 last:border-0">
                    <td className="py-1.5 pr-2 font-mono text-foreground">{session.session_id}</td>
                    <td className="py-1.5 pr-2 text-foreground">{formatSavedAt(session.last_persisted_at_iso)}</td>
                    <td className="py-1.5 pr-2 text-right font-mono tabular-nums text-foreground">
                      {formatCount(session.records)}
                    </td>
                    <td className="py-1.5 pr-2 text-right font-mono tabular-nums text-foreground">
                      {formatSize(session.size_bytes)}
                    </td>
                    <td className="py-1.5 text-right">
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => handleExportSessionMetadataCsv(session)}
                        className="h-6 px-2 text-[11px] gap-1 cursor-pointer"
                        aria-label={`Xuất metadata phiên ${session.session_id}`}
                      >
                        <Download className="h-3 w-3" />
                        <span>CSV</span>
                      </Button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        <p className="text-[11px] text-muted-foreground border-t border-border/50 pt-1.5">
          Không có dữ liệu telemetry lưu trữ cho các phiên này. Dữ liệu chỉ có thể xem khi phiên đang chạy;
          tệp CSV ở đây chỉ chứa metadata, không phải nhật ký sự kiện.
        </p>
      </section>
    </div>
  )
}
