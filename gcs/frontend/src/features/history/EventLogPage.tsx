import React, { useCallback, useEffect, useMemo, useState } from 'react'
import {
  Download,
  Eye,
  EyeOff,
  History,
  RotateCcw,
  Search,
  Trash2,
} from 'lucide-react'
import { toast } from 'sonner'
import { PageFrame } from '@/components/shared/PageFrame'
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
import { groupByLocalDay } from './eventLogTime'
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

function renderSessionIdentifier(sessionId: string) {
  const isReal = sessionId.includes('REAL')
  const isMock = sessionId.includes('MOCK')

  if (isReal) {
    // Phiên REAL: Hiển thị đầy đủ phiên REAL kèm huy hiệu nhận diện nổi bật
    return (
      <div className="flex items-center gap-1.5" title={`Mã phiên REAL đầy đủ: ${sessionId}`}>
        <span className="inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-bold uppercase tracking-wider bg-[var(--kvc-crit-bg)] text-[var(--kvc-crit-ink)] border border-[var(--kvc-crit-line)] shadow-2xs shrink-0">
          REAL
        </span>
        <span className="font-mono font-bold text-foreground text-xs select-all">
          {sessionId}
        </span>
      </div>
    )
  }

  // Phiên MOCK hoặc các phiên khác: Rút gọn badge màu + mã ngắn gọn
  let shortDisplay = sessionId
  if (sessionId.startsWith('SES-MOCK-')) {
    const raw = sessionId.slice('SES-MOCK-'.length)
    shortDisplay = raw.length > 12 ? `${raw.slice(0, 8)}…` : raw
  } else if (sessionId.length > 22) {
    shortDisplay = `${sessionId.slice(0, 18)}…`
  }

  return (
    <div className="flex items-center gap-1.5" title={`Mã phiên đầy đủ: ${sessionId}`}>
      <span className="inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-bold uppercase tracking-wider bg-muted text-muted-foreground border border-border shrink-0">
        {isMock ? 'MOCK' : 'PHIÊN'}
      </span>
      <span className="font-mono text-muted-foreground text-xs select-all">
        {shortDisplay}
      </span>
    </div>
  )
}

export const EventLogPage: React.FC = () => {
  const { state, dispatch } = useMission()
  const { event_logs, source_mode, session_id, diagnostics } = state

  // Metadata phiên đã lưu trên backend; rỗng khi backend chưa có phiên hoặc lỗi mạng.
  const [sessions, setSessions] = useState<StoredSession[]>([])
  const [sessionsLoading, setSessionsLoading] = useState(true)
  const [deletingAll, setDeletingAll] = useState(false)
  const [sessionSearchKeyword, setSessionSearchKeyword] = useState('')

  // Bộ lọc nhật ký của phiên đang chạy
  const [actorFilter, setActorFilter] = useState<ActorFilter>('ALL')
  const [searchKeyword, setSearchKeyword] = useState('')
  const [levelFilter, setLevelFilter] = useState<'ALL' | AlertLevel>('ALL')
  const [sourceFilter, setSourceFilter] = useState<string>('ALL')

  // Ẩn mềm là mối quan tâm của tầng hiển thị (D1): local state, không đụng reducer.
  // Không persist — tải lại trang hoặc rời trang thì bằng chứng khôi phục đầy đủ.
  const [hiddenIds, setHiddenIds] = useState<Set<string>>(new Set())
  const [showHidden, setShowHidden] = useState(false)

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

  const hideEntry = useCallback((id: string) => {
    setHiddenIds((prev) => {
      const next = new Set(prev)
      next.add(id)
      return next
    })
  }, [])

  const restoreEntry = useCallback((id: string) => {
    setHiddenIds((prev) => {
      const next = new Set(prev)
      next.delete(id)
      return next
    })
  }, [])

  const handleHide = useCallback(
    (id: string) => {
      hideEntry(id)
      toast.success('Đã ẩn 1 mục khỏi nhật ký', {
        description: 'Mục vẫn còn trong bằng chứng; hoàn tác được trong 5 giây.',
        action: { label: 'Hoàn tác', onClick: () => restoreEntry(id) },
      })
    },
    [hideEntry, restoreEntry]
  )

  const filteredSessions = useMemo(() => {
    const q = sessionSearchKeyword.trim().toLowerCase()
    if (!q) return sessions
    return sessions.filter(
      (s) =>
        s.session_id.toLowerCase().includes(q) ||
        (s.file && s.file.toLowerCase().includes(q))
    )
  }, [sessions, sessionSearchKeyword])

  const actorCounts = useMemo(() => {
    let operator = 0
    let system = 0
    for (const log of event_logs) {
      if (logActor(log) === 'OPERATOR') operator++
      else system++
    }
    return { all: event_logs.length, operator, system }
  }, [event_logs])

  const sources = useMemo(() => {
    const set = new Set<string>()
    for (const log of event_logs) {
      if (log.source) set.add(log.source)
    }
    return Array.from(set).sort()
  }, [event_logs])

  const filteredLogs = useMemo(() => {
    const q = searchKeyword.trim().toLowerCase()
    return event_logs.filter((log) => {
      if (actorFilter !== 'ALL' && logActor(log) !== actorFilter) return false
      if (levelFilter !== 'ALL' && log.level !== levelFilter) return false
      if (sourceFilter !== 'ALL' && log.source !== sourceFilter) return false
      if (q) {
        const matchCode = log.code.toLowerCase().includes(q)
        const matchMsg = log.message.toLowerCase().includes(q)
        if (!matchCode && !matchMsg) return false
      }
      return true
    })
  }, [event_logs, actorFilter, levelFilter, sourceFilter, searchKeyword])

  const visibleLogs = useMemo(() => {
    if (showHidden) return filteredLogs
    return filteredLogs.filter((log) => !hiddenIds.has(log.id))
  }, [filteredLogs, showHidden, hiddenIds])

  const groups = useMemo(() => groupByLocalDay(visibleLogs), [visibleLogs])

  const handleResetFilter = () => {
    setActorFilter('ALL')
    setSearchKeyword('')
    setLevelFilter('ALL')
    setSourceFilter('ALL')
  }

  const isFiltered =
    actorFilter !== 'ALL' ||
    searchKeyword.trim() !== '' ||
    levelFilter !== 'ALL' ||
    sourceFilter !== 'ALL'

  const handleExportLogsCsv = () => {
    if (visibleLogs.length === 0) return
    const headers = ['id', 'timestamp_iso', 'level', 'actor', 'source', 'code', 'message', 'session_id']
    const rows = visibleLogs.map((log) => [
      csvCell(log.id),
      csvCell(log.timestamp_iso),
      csvCell(log.level),
      csvCell(logActor(log)),
      csvCell(log.source),
      csvCell(log.code),
      csvCell(log.message),
      csvCell(log.session_id),
    ])
    downloadCsv(timestampedFilename(`kvc_event_logs_${session_id || 'session'}`), [headers, ...rows])
  }

  const handleClearAllLogs = () => {
    if (event_logs.length === 0) return
    if (
      window.confirm(
        'Bạn có chắc chắn muốn xóa toàn bộ nhật ký sự kiện của phiên đang chạy không?'
      )
    ) {
      dispatch({ type: 'CLEAR_EVENT_LOGS' })
      setHiddenIds(new Set())
      toast.success('Đã xóa toàn bộ nhật ký phiên đang chạy')
    }
  }

  const handleDeleteSingleLog = (id: string) => {
    dispatch({ type: 'DELETE_EVENT_LOG', payload: id })
    setHiddenIds((prev) => {
      const next = new Set(prev)
      next.delete(id)
      return next
    })
    toast.success('Đã xóa 1 mục khỏi nhật ký')
  }

  const handleDeleteSession = async (sessionId: string) => {
    if (
      !window.confirm(
        `Bạn có chắc chắn muốn xóa phiên đã lưu "${sessionId}" không?\nThao tác này sẽ xóa tệp dữ liệu SQLite vĩnh viễn và không thể hoàn tác.`
      )
    ) {
      return
    }
    const res = await TelemetryClient.deleteSession(sessionId)
    if (res.ok) {
      setSessions((prev) => prev.filter((s) => s.session_id !== sessionId))
      toast.success(`Đã xóa phiên "${sessionId}"`)
    } else {
      toast.error(`Không thể xóa phiên: ${res.message || 'Lỗi không xác định'}`)
    }
  }

  const handleDeleteAllSessions = async () => {
    if (sessions.length === 0) return
    if (
      !window.confirm(
        `Bạn có chắc chắn muốn xóa TẤT CẢ ${sessions.length} phiên đã lưu không?\nToàn bộ tệp cơ sở dữ liệu đã lưu sẽ bị xóa vĩnh viễn và không thể hoàn tác.`
      )
    ) {
      return
    }
    setDeletingAll(true)
    const res = await TelemetryClient.deleteAllSessions()
    setDeletingAll(false)
    if (res.ok) {
      setSessions([])
      toast.success(`Đã xóa ${res.deletedCount ?? sessions.length} phiên đã lưu`)
    } else {
      toast.error(`Không thể xóa phiên: ${res.message || 'Lỗi không xác định'}`)
      void TelemetryClient.fetchSessions().then((data) => {
        setSessions(data ? data.sessions.filter((s) => s.records > 0) : [])
      })
    }
  }

  const handleExportSessionMetadataCsv = (session: StoredSession) => {
    const headers = ['session_id', 'file', 'records', 'size_bytes', 'last_persisted_at_iso']
    const rows = [
      [
        csvCell(session.session_id),
        csvCell(session.file),
        csvCell(session.records),
        csvCell(session.size_bytes),
        csvCell(session.last_persisted_at_iso || ''),
      ],
    ]
    downloadCsv(timestampedFilename(`kvc_session_metadata_${session.session_id}`), [headers, ...rows])
  }

  return (
    <PageFrame variant="scroll" paddingClass="p-2.5 sm:p-4">
      <PageHeader
        title="Nhật ký phiên"
        infoTip="Bằng chứng sự kiện của phiên đang chạy và danh sách metadata các phiên đã lưu trên backend. Không có chế độ phát lại."
        subtitle="Bằng chứng sự kiện cứu nạn của phiên đang chạy."
        actions={
          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={handleExportLogsCsv}
              disabled={visibleLogs.length === 0}
              className="h-8 text-xs gap-1.5 border-border shadow-2xs hover:border-primary/50 cursor-pointer"
            >
              <Download className="h-3.5 w-3.5 text-primary" />
              <span>Xuất CSV ({visibleLogs.length})</span>
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={handleClearAllLogs}
              disabled={event_logs.length === 0}
              className="h-8 text-xs gap-1.5 border-destructive/40 text-destructive hover:bg-destructive/10 hover:border-destructive shadow-2xs cursor-pointer"
              aria-label="Xoá toàn bộ nhật ký phiên đang chạy"
            >
              <Trash2 className="h-3.5 w-3.5" />
              <span>Xóa nhật ký</span>
            </Button>
          </div>
        }
      />

      {/* KHỐI 1 — Nhật ký phiên đang chạy */}
      <section className="flex-1 flex flex-col gap-2 min-h-[320px] kvc-density-panel rounded-kvc-panel border border-border bg-card shadow-xs">
        <div className="flex flex-wrap items-center justify-between gap-2 pb-1.5 border-b border-border/50">
          <div className="flex items-center gap-1.5 text-xs font-bold text-foreground">
            <History className="h-4 w-4 text-primary" />
            Nhật ký phiên đang chạy
          </div>
          <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-[11px] text-muted-foreground">
            <span>
              Phiên:{' '}
              {session_id?.includes('REAL') ? (
                <span className="font-mono font-bold text-[var(--kvc-crit-ink)] select-all">{session_id}</span>
              ) : session_id?.startsWith('SES-MOCK-') && session_id.length > 22 ? (
                <span className="font-mono text-foreground select-all" title={session_id}>
                  {`SES-MOCK-${session_id.slice('SES-MOCK-'.length, 'SES-MOCK-'.length + 8)}…`}
                </span>
              ) : (
                <span className="font-mono text-foreground select-all">{session_id || 'N/A'}</span>
              )}
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

        {/* Thanh lọc */}
        <div className="flex flex-wrap items-center gap-2 shrink-0">
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
              className="bg-transparent border-none outline-none w-full text-foreground placeholder:text-muted-foreground text-xs"
            />
            {searchKeyword && (
              <button
                type="button"
                onClick={() => setSearchKeyword('')}
                className="text-muted-foreground hover:text-foreground text-[10px]"
              >
                ✕
              </button>
            )}
          </div>

          <Select value={levelFilter} onValueChange={(v) => setLevelFilter(v as 'ALL' | AlertLevel)}>
            <SelectTrigger className="h-7 w-[100px] text-xs">
              <SelectValue placeholder="Mức độ" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="ALL">Mức độ: Tất cả</SelectItem>
              <SelectItem value="CRITICAL">CRITICAL</SelectItem>
              <SelectItem value="WARN">WARN</SelectItem>
              <SelectItem value="INFO">INFO</SelectItem>
            </SelectContent>
          </Select>

          {sources.length > 0 && (
            <Select value={sourceFilter} onValueChange={(v) => setSourceFilter(v)}>
              <SelectTrigger className="h-7 w-[110px] text-xs">
                <SelectValue placeholder="Nguồn" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="ALL">Nguồn: Tất cả</SelectItem>
                {sources.map((src) => (
                  <SelectItem key={src} value={src}>
                    {src}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          )}

          <Button
            variant={showHidden ? 'secondary' : 'outline'}
            size="sm"
            onClick={() => setShowHidden(!showHidden)}
            className="h-7 px-2 text-xs gap-1 border-border/70 hover:border-primary/50 cursor-pointer"
            aria-label={`Hiện mục đã ẩn (${hiddenIds.size})`}
          >
            {showHidden ? <EyeOff className="h-3 w-3 text-primary" /> : <Eye className="h-3 w-3" />}
            <span>Hiện mục đã ẩn ({hiddenIds.size})</span>
          </Button>

          {isFiltered && (
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
          <EventLogTable
            groups={groups}
            hiddenIds={hiddenIds}
            onHide={handleHide}
            onRestore={restoreEntry}
            onDelete={handleDeleteSingleLog}
          />
        </div>
      </section>

      {/* KHỐI 2 — Phiên đã lưu (Metadata) */}
      <section className="flex flex-col gap-2.5 kvc-density-panel rounded-kvc-panel border border-border bg-card shadow-2xs shrink-0 min-h-[300px]">
        <div className="flex flex-wrap items-center justify-between gap-2 pb-2 border-b border-border/50">
          <div className="flex items-center gap-2">
            <span className="text-xs font-bold text-foreground flex items-center gap-1.5">
              <History className="h-4 w-4 text-primary" />
              Phiên đã lưu
            </span>
            <Badge variant="outline" className="text-[11px] font-mono">
              {sessionsLoading
                ? 'Đang đọc…'
                : sessionSearchKeyword.trim()
                  ? `${filteredSessions.length}/${sessions.length} phiên`
                  : `${sessions.length} phiên`}
            </Badge>
          </div>
          <div className="flex items-center gap-2">
            {sessions.length > 0 && (
              <div className="flex items-center gap-1.5 px-2 py-0.5 rounded-kvc-control border border-input bg-background text-xs">
                <Search className="h-3 w-3 text-muted-foreground shrink-0" />
                <input
                  type="text"
                  placeholder="Lọc mã phiên…"
                  value={sessionSearchKeyword}
                  onChange={(e) => setSessionSearchKeyword(e.target.value)}
                  className="bg-transparent border-none outline-none w-32 sm:w-44 text-foreground placeholder:text-muted-foreground text-xs"
                  aria-label="Lọc mã phiên đã lưu"
                />
              </div>
            )}
            {sessions.length > 0 && (
              <Button
                variant="outline"
                size="sm"
                onClick={handleDeleteAllSessions}
                disabled={sessionsLoading || deletingAll}
                className="h-6 px-2 text-[11px] gap-1 border-destructive/40 text-destructive hover:bg-destructive/10 hover:border-destructive cursor-pointer shadow-2xs"
                aria-label="Xóa tất cả phiên đã lưu"
              >
                <Trash2 className="h-3 w-3" />
                <span>{deletingAll ? 'Đang xóa…' : 'Xóa tất cả'}</span>
              </Button>
            )}
          </div>
        </div>

        {sessions.length === 0 ? (
          <p className="text-xs text-muted-foreground py-6 text-center">
            {sessionsLoading ? 'Đang đọc danh sách phiên…' : 'Chưa có phiên nào được ghi'}
          </p>
        ) : filteredSessions.length === 0 ? (
          <p className="text-xs text-muted-foreground py-6 text-center">
            Không tìm thấy phiên nào khớp với &quot;{sessionSearchKeyword}&quot;
          </p>
        ) : (
          <div className="overflow-x-auto overflow-y-auto h-[260px] sm:h-[320px] max-h-[460px] rounded-md border border-border/40 [scrollbar-width:thin] [scrollbar-color:hsl(var(--muted-foreground)/0.35)_transparent] [&::-webkit-scrollbar]:w-2.5 [&::-webkit-scrollbar-track]:bg-muted/15 [&::-webkit-scrollbar-thumb]:bg-muted-foreground/35 [&::-webkit-scrollbar-thumb]:rounded-full hover:[&::-webkit-scrollbar-thumb]:bg-muted-foreground/60 active:[&::-webkit-scrollbar-thumb]:bg-primary">
            <table className="w-full text-xs">
              <thead>
                <tr className="text-left text-muted-foreground bg-muted/90 border-b border-border/60 sticky top-0 z-10 backdrop-blur-xs">
                  <th className="py-2 px-3 font-semibold text-[11px] uppercase tracking-wider">Mã phiên</th>
                  <th className="py-2 px-3 font-semibold text-[11px] uppercase tracking-wider">Thời điểm lưu</th>
                  <th className="py-2 px-3 font-semibold text-[11px] uppercase tracking-wider text-right">Gói tin</th>
                  <th className="py-2 px-3 font-semibold text-[11px] uppercase tracking-wider text-right">Dung lượng</th>
                  <th className="py-2 px-3 font-semibold text-[11px] uppercase tracking-wider text-right">Thao tác</th>
                </tr>
              </thead>
              <tbody>
                {filteredSessions.map((session) => (
                  <tr
                    key={session.session_id}
                    className="border-b border-border/30 last:border-0 hover:bg-muted/40 transition-colors"
                  >
                    <td className="py-2 px-3 whitespace-nowrap">
                      {renderSessionIdentifier(session.session_id)}
                    </td>
                    <td className="py-2 px-3 text-muted-foreground whitespace-nowrap">
                      {formatSavedAt(session.last_persisted_at_iso)}
                    </td>
                    <td className="py-2 px-3 text-right font-mono tabular-nums text-foreground font-semibold">
                      {formatCount(session.records)}
                    </td>
                    <td className="py-2 px-3 text-right font-mono tabular-nums text-muted-foreground">
                      {formatSize(session.size_bytes)}
                    </td>
                    <td className="py-2 px-3 text-right">
                      <div className="flex items-center justify-end gap-1.5">
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => handleExportSessionMetadataCsv(session)}
                          className="h-6 px-2 text-[11px] gap-1 border-border/70 hover:border-primary/50 cursor-pointer shadow-2xs"
                          aria-label={`Xuất metadata phiên ${session.session_id}`}
                        >
                          <Download className="h-3 w-3 text-primary" />
                          <span>CSV</span>
                        </Button>
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => handleDeleteSession(session.session_id)}
                          className="h-6 px-1.5 text-[11px] gap-1 text-muted-foreground hover:text-destructive hover:bg-destructive/10 cursor-pointer"
                          aria-label={`Xóa phiên ${session.session_id}`}
                          title="Xóa phiên đã lưu này"
                        >
                          <Trash2 className="h-3 w-3" />
                          <span>Xóa</span>
                        </Button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        <div className="text-[11px] text-muted-foreground border-t border-border/40 pt-2 flex items-center justify-between gap-2">
          <span>* Tệp CSV lưu trữ metadata phiên (thời gian, số gói, dung lượng). Dữ liệu chi tiết chỉ hiển thị khi phiên đang hoạt động.</span>
        </div>
      </section>
    </PageFrame>
  )
}
