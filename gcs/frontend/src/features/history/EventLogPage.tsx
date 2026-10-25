import React, { useEffect, useMemo, useState } from 'react'
import {
  Clock,
  Download,
  FileText,
  Film,
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
import type { AlertLevel, AlertSourceCategory } from '@/types/telemetry'
import { EventLogTable } from './EventLogTable'
import { FlightDebriefingPlayer } from './FlightDebriefingPlayer'

// Phiên mô phỏng mẫu dự phòng khi database chưa có phiên ghi
const FALLBACK_SESSIONS: StoredSession[] = [
  {
    session_id: 'MOCK-DEMO-SAR-01',
    file: 'data/sessions/MOCK-DEMO-SAR-01.db',
    records: 600,
    size_bytes: 20480,
    last_persisted_at_iso: new Date(Date.now() - 3600000).toISOString(),
  },
]

export const EventLogPage: React.FC = () => {
  const { state } = useMission()
  const { event_logs, source_mode } = state

  // Danh sách phiên bay lưu trữ
  const [sessions, setSessions] = useState<StoredSession[]>(FALLBACK_SESSIONS)
  const [selectedSessionId, setSelectedSessionId] = useState<string>(FALLBACK_SESSIONS[0].session_id)
  const [sessionSearch, setSessionSearch] = useState<string>('')
  const [sessionFilterTag, setSessionFilterTag] = useState<'ALL' | 'VIDEO' | 'TELEMETRY'>('ALL')

  // Tab khung bên phải: Video Debriefing hoặc Bảng kiểm toán sự kiện
  const [activeRightTab, setActiveRightTab] = useState<'VIDEO_DEBRIEF' | 'AUDIT_LOGS'>('VIDEO_DEBRIEF')

  // Bộ lọc nhật ký sự kiện kiểm toán
  const [searchKeyword, setSearchKeyword] = useState('')
  const [levelFilter, setLevelFilter] = useState<'ALL' | AlertLevel>('ALL')
  const [sourceFilter, setSourceFilter] = useState<'ALL' | AlertSourceCategory>('ALL')

  // Lấy danh sách phiên từ Backend SQLite
  useEffect(() => {
    let active = true
    void TelemetryClient.fetchSessions().then((res) => {
      if (!active || !res) return
      const committed = res.sessions.filter((s) => s.records > 0)
      if (committed.length > 0) {
        setSessions(committed)
        setSelectedSessionId((cur) => cur || committed[0].session_id)
      }
    })
    return () => {
      active = false
    }
  }, [])

  // Phiên đang được chọn
  const activeSession = useMemo(() => {
    return sessions.find((s) => s.session_id === selectedSessionId) || sessions[0] || FALLBACK_SESSIONS[0]
  }, [sessions, selectedSessionId])

  // Lọc danh sách phiên ở cột trái
  const filteredSessions = useMemo(() => {
    return sessions.filter((s) => {
      const q = sessionSearch.trim().toLowerCase()
      const matchSearch = !q || s.session_id.toLowerCase().includes(q) || (s.last_persisted_at_iso && s.last_persisted_at_iso.includes(q))
      if (!matchSearch) return false

      const hasVideo = s.session_id.startsWith('SES-REAL') || s.records > 500
      if (sessionFilterTag === 'VIDEO' && !hasVideo) return false
      if (sessionFilterTag === 'TELEMETRY' && hasVideo) return false

      return true
    })
  }, [sessions, sessionSearch, sessionFilterTag])

  // Lọc dữ liệu nhật ký sự kiện
  const filteredLogs = useMemo(() => {
    return event_logs.filter((log) => {
      if (levelFilter !== 'ALL' && log.level !== levelFilter) {
        return false
      }
      if (sourceFilter !== 'ALL' && log.source !== sourceFilter) {
        return false
      }
      if (searchKeyword.trim()) {
        const q = searchKeyword.toLowerCase()
        const matchCode = log.code.toLowerCase().includes(q)
        const matchMsg = log.message.toLowerCase().includes(q)
        const matchSource = log.source.toLowerCase().includes(q)
        if (!matchCode && !matchMsg && !matchSource) {
          return false
        }
      }
      return true
    })
  }, [event_logs, levelFilter, sourceFilter, searchKeyword])

  const hasActiveLogFilter = searchKeyword.trim() !== '' || levelFilter !== 'ALL' || sourceFilter !== 'ALL'

  const handleResetLogFilter = () => {
    setSearchKeyword('')
    setLevelFilter('ALL')
    setSourceFilter('ALL')
  }

  // Xuất file CSV từ dữ liệu đã lọc
  const handleExportCsv = () => {
    if (filteredLogs.length === 0) return

    const headers = ['Thời gian', 'Mức độ', 'Nguồn', 'Mã sự kiện', 'Nội dung', 'Phiên']
    const rows = filteredLogs.map((item) => [
      `"${item.timestamp_iso}"`,
      `"${item.level}"`,
      `"${item.source}"`,
      `"${item.code.replace(/"/g, '""')}"`,
      `"${item.message.replace(/"/g, '""')}"`,
      `"${item.session_id}"`,
    ])

    const csvContent = [headers.join(','), ...rows.map((r) => r.join(','))].join('\r\n')
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' })
    const url = URL.createObjectURL(blob)
    const link = document.createElement('a')
    link.setAttribute('href', url)
    link.setAttribute('download', `kvc_rescue_evidence_${activeSession.session_id}_${Date.now()}.csv`)
    document.body.appendChild(link)
    link.click()
    document.body.removeChild(link)
    URL.revokeObjectURL(url)
  }

  return (
    <div className="flex-1 flex flex-col p-2.5 sm:p-4 gap-3 overflow-hidden w-full select-none">
      {/* 1. Header Trang Thống Nhất */}
      <PageHeader
        breadcrumb="Dữ liệu · Nhật ký phiên"
        title="Nhật ký phiên & Bằng chứng cứu hộ"
        infoTip="Trung tâm quản lý phiên bay & Hộp đen: Xem lại Video camera quang học đồng bộ telemetry, quản lý các chuyến bay đã ghi và xuất file CSV bằng chứng cứu nạn SAR."
        subtitle={`Lưu trữ chuỗi sự kiện hoạt động, mốc thời gian phát hiện mục tiêu và xuất file bằng chứng cứu nạn [${source_mode}].`}
        badge={
          <Badge variant="outline" className="text-xs font-mono">
            {sessions.length} phiên đã lưu
          </Badge>
        }
        actions={
          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={handleExportCsv}
              disabled={filteredLogs.length === 0}
              className="h-8 text-xs gap-1.5 border-border shadow-2xs hover:border-primary/50 cursor-pointer"
            >
              <Download className="h-3.5 w-3.5 text-primary" />
              <span>Xuất CSV bằng chứng ({filteredLogs.length})</span>
            </Button>
          </div>
        }
      />

      {/* 2. BỐ CỤC 2 CỘT CHUYÊN NGHIỆP (SPLIT VIEW LAYOUT - MỤC 4.1) */}
      <div className="flex-1 flex flex-col lg:flex-row gap-3 min-h-0 overflow-hidden">
        {/* CỘT TRÁI (SESSION EXPLORER - 35% CHIỀU RỘNG): Danh sách toàn bộ các phiên bay */}
        <div className="w-full lg:w-[35%] xl:w-[32%] flex flex-col gap-2.5 p-3 rounded-xl border border-border bg-card shadow-xs overflow-hidden shrink-0">
          <div className="flex items-center justify-between pb-1 border-b border-border/50">
            <span className="text-xs font-bold text-foreground flex items-center gap-1.5">
              <History className="h-4 w-4 text-primary" />
              Danh sách phiên bay hộp đen
            </span>
            <Badge variant="outline" className="text-[10px] font-mono">
              {filteredSessions.length} / {sessions.length}
            </Badge>
          </div>

          {/* Ô tìm kiếm phiên */}
          <div className="flex items-center gap-2 px-2.5 py-1.5 rounded-lg border border-input bg-background text-xs">
            <Search className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
            <input
              type="text"
              placeholder="Tìm theo mã SES-xxx hoặc ngày..."
              value={sessionSearch}
              onChange={(e) => setSessionSearch(e.target.value)}
              className="w-full bg-transparent text-xs text-foreground placeholder:text-muted-foreground focus:outline-none font-mono"
            />
          </div>

          {/* Bộ lọc tag: Tất cả / Có Video / Chỉ Telemetry */}
          <div className="flex items-center gap-1 bg-muted/60 p-0.5 rounded-lg border border-border/50 text-[10px]">
            <Button
              variant={sessionFilterTag === 'ALL' ? 'default' : 'ghost'}
              size="sm"
              onClick={() => setSessionFilterTag('ALL')}
              className="h-6 px-2 text-[10px] font-medium flex-1 cursor-pointer"
            >
              Tất cả
            </Button>
            <Button
              variant={sessionFilterTag === 'VIDEO' ? 'default' : 'ghost'}
              size="sm"
              onClick={() => setSessionFilterTag('VIDEO')}
              className="h-6 px-2 text-[10px] font-medium flex-1 cursor-pointer"
            >
              🎬 Có Video
            </Button>
            <Button
              variant={sessionFilterTag === 'TELEMETRY' ? 'default' : 'ghost'}
              size="sm"
              onClick={() => setSessionFilterTag('TELEMETRY')}
              className="h-6 px-2 text-[10px] font-medium flex-1 cursor-pointer"
            >
              📡 Chỉ Telemetry
            </Button>
          </div>

          {/* Danh sách thẻ phiên cuộn mượt mà */}
          <div className="flex-1 overflow-y-auto pr-0.5 flex flex-col gap-2 min-h-0">
            {filteredSessions.length === 0 ? (
              <div className="flex flex-col items-center justify-center p-6 text-center text-muted-foreground text-xs">
                <History className="h-8 w-8 mb-2 opacity-40" />
                <span>Không tìm thấy phiên bay phù hợp.</span>
              </div>
            ) : (
              filteredSessions.map((s) => {
                const isSelected = s.session_id === selectedSessionId
                const hasVideo = s.session_id.startsWith('SES-REAL') || s.records > 500
                const durationMin = Math.max(1, Math.round(s.records / 60))
                const dateStr = s.last_persisted_at_iso
                  ? new Date(s.last_persisted_at_iso).toLocaleString('vi-VN', {
                      month: '2-digit',
                      day: '2-digit',
                      hour: '2-digit',
                      minute: '2-digit',
                    })
                  : 'Vừa hoàn tất'

                return (
                  <div
                    key={s.session_id}
                    onClick={() => setSelectedSessionId(s.session_id)}
                    className={`p-2.5 rounded-xl border text-xs cursor-pointer transition-all duration-150 flex flex-col gap-1.5 ${
                      isSelected
                        ? 'border-primary bg-primary/10 shadow-xs ring-1 ring-primary/40'
                        : 'border-border/70 bg-card hover:bg-muted/40 hover:border-border'
                    }`}
                  >
                    <div className="flex items-center justify-between gap-1">
                      <span className="font-mono font-bold text-foreground truncate">
                        {s.session_id}
                      </span>
                      <Badge
                        variant="outline"
                        className={`text-[9px] px-1.5 py-0 font-medium ${
                          hasVideo
                            ? 'border-cyan-500/40 text-cyan-600 dark:text-cyan-400 bg-cyan-500/10'
                            : 'border-slate-500/40 text-slate-600 dark:text-slate-400 bg-slate-500/10'
                        }`}
                      >
                        {hasVideo ? '🎬 Có Video' : '📡 Chỉ Telemetry'}
                      </Badge>
                    </div>

                    <div className="flex items-center justify-between text-[11px] text-muted-foreground">
                      <span className="flex items-center gap-1">
                        <Clock className="h-3 w-3" />
                        {dateStr}
                      </span>
                      <span className="font-mono">
                        ~{durationMin} phút ({s.records} gói)
                      </span>
                    </div>
                  </div>
                )
              })
            )}
          </div>
        </div>

        {/* KHUNG PHẢI (SESSION PLAYBACK & DEBRIEFING - 65% CHIỀU RỘNG): Xem lại Video & Telemetry hoặc Kiểm toán sự kiện */}
        <div className="flex-1 flex flex-col gap-2.5 p-3 rounded-xl border border-border bg-card shadow-xs min-h-0 overflow-y-auto">
          {/* Tabs chuyển đổi giữa [Xem lại Video & Telemetry] và [Bảng Nhật ký sự kiện] */}
          <div className="flex items-center justify-between border-b border-border/60 pb-2">
            <div className="flex items-center gap-1.5 bg-muted/60 p-0.5 rounded-lg border border-border/50 text-xs">
              <Button
                variant={activeRightTab === 'VIDEO_DEBRIEF' ? 'default' : 'ghost'}
                size="sm"
                onClick={() => setActiveRightTab('VIDEO_DEBRIEF')}
                className="h-7 px-3 text-xs gap-1.5 font-semibold cursor-pointer"
              >
                <Film className="h-3.5 w-3.5" />
                <span>🎬 Xem lại Video & Telemetry (Hộp đen)</span>
              </Button>
              <Button
                variant={activeRightTab === 'AUDIT_LOGS' ? 'default' : 'ghost'}
                size="sm"
                onClick={() => setActiveRightTab('AUDIT_LOGS')}
                className="h-7 px-3 text-xs gap-1.5 font-semibold cursor-pointer"
              >
                <FileText className="h-3.5 w-3.5" />
                <span>📋 Nhật ký sự kiện kiểm toán ({filteredLogs.length})</span>
              </Button>
            </div>

            <span className="text-xs font-mono text-muted-foreground hidden sm:inline">
              Phiên: <strong>{activeSession.session_id}</strong>
            </span>
          </div>

          {/* TAB 1: FLIGHT VIDEO PLAYER & SYNCED TELEMETRY (MỤC 4.2 - 4.5) */}
          {activeRightTab === 'VIDEO_DEBRIEF' && (
            <FlightDebriefingPlayer
              session={activeSession}
              onExportCsv={handleExportCsv}
            />
          )}

          {/* TAB 2: BẢNG NHẬT KÝ SỰ KIỆN KIỂM TOÁN (MỤC 4.6) */}
          {activeRightTab === 'AUDIT_LOGS' && (
            <div className="flex-1 flex flex-col gap-2.5 min-h-0">
              {/* Thanh Tìm Kiếm và Bộ Lọc Sự Kiện */}
              <div className="flex flex-wrap items-center gap-2 p-2 rounded-lg border border-border bg-background text-xs">
                {/* Ô Tìm Kiếm */}
                <div className="flex items-center gap-2 flex-1 min-w-[180px] px-2 py-1 rounded-md border border-input bg-card">
                  <Search className="h-3 w-3 text-muted-foreground shrink-0" />
                  <input
                    type="text"
                    placeholder="Tìm mã, nội dung sự kiện..."
                    value={searchKeyword}
                    onChange={(e) => setSearchKeyword(e.target.value)}
                    className="w-full bg-transparent text-xs text-foreground placeholder:text-muted-foreground focus:outline-none"
                  />
                </div>

                {/* Lọc Mức Độ */}
                <div className="flex items-center gap-1.5">
                  <span className="text-muted-foreground font-medium text-[11px]">Mức độ:</span>
                  <Select
                    value={levelFilter}
                    onValueChange={(val) => setLevelFilter(val as 'ALL' | AlertLevel)}
                  >
                    <SelectTrigger className="h-7 w-[100px] text-xs">
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

                {/* Lọc Nguồn */}
                <div className="flex items-center gap-1.5">
                  <span className="text-muted-foreground font-medium text-[11px]">Nguồn:</span>
                  <Select
                    value={sourceFilter}
                    onValueChange={(val) => setSourceFilter(val as 'ALL' | AlertSourceCategory)}
                  >
                    <SelectTrigger className="h-7 w-[110px] text-xs">
                      <SelectValue placeholder="Tất cả" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="ALL">Tất cả</SelectItem>
                      <SelectItem value="COMMUNICATION">Liên lạc</SelectItem>
                      <SelectItem value="PAYLOAD_AI">AI Tải</SelectItem>
                      <SelectItem value="NAVIGATION">Định vị</SelectItem>
                      <SelectItem value="SYSTEM">Hệ thống</SelectItem>
                      <SelectItem value="SAR_MISSION">Cứu hộ SAR</SelectItem>
                    </SelectContent>
                  </Select>
                </div>

                {/* Nút Đặt Lại */}
                {hasActiveLogFilter && (
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={handleResetLogFilter}
                    className="h-7 px-2 text-xs gap-1 text-muted-foreground hover:text-foreground cursor-pointer"
                  >
                    <RotateCcw className="h-3 w-3" />
                    <span>Đặt lại</span>
                  </Button>
                )}
              </div>

              {/* Bảng Sự Kiện */}
              <div className="flex-1 overflow-y-auto min-h-0">
                <EventLogTable entries={filteredLogs} />
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
