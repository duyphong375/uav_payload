import React, { useEffect, useState } from 'react'
import { Pause, Play, RotateCcw, Square } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { TelemetryClient, type StoredSession } from '@/services/telemetryClient'
import { useMission } from '@/state/MissionProvider'

type ReplaySpeed = 0.5 | 1 | 2

function formatDuration(value: number): string {
  const totalSeconds = Math.max(0, Math.floor(value / 1000))
  const minutes = Math.floor(totalSeconds / 60)
  return `${minutes}:${String(totalSeconds % 60).padStart(2, '0')}`
}

export const ReplayControls: React.FC = () => {
  const { state, switchSourceMode } = useMission()
  const [sessions, setSessions] = useState<StoredSession[]>([])
  const [sessionId, setSessionId] = useState('')
  const [speed, setSpeed] = useState<ReplaySpeed>(1)
  const [activeSpeedOverride, setActiveSpeedOverride] = useState<ReplaySpeed | null>(null)
  const [seekPosition, setSeekPosition] = useState<number | null>(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const replay = state.replay
  const isReplay = state.source_mode === 'REPLAY'

  useEffect(() => {
    let active = true
    void TelemetryClient.fetchSessions().then(result => {
      if (!active || !result) return
      const committed = result.sessions.filter(session => session.records > 0)
      setSessions(committed)
      setSessionId(current => current || committed[0]?.session_id || '')
    })
    return () => { active = false }
  }, [])

  const run = async (command: () => Promise<unknown>, message: string): Promise<boolean> => {
    setBusy(true)
    setError(null)
    try {
      const result = await command()
      if (!result) {
        setError(message)
        return false
      }
      return true
    } finally {
      setBusy(false)
    }
  }

  const start = async () => {
    if (!sessionId) {
      setError('Không có phiên đã ghi để phát lại.')
      return
    }
    if (await run(() => TelemetryClient.startReplay(sessionId, speed), 'Không thể bắt đầu phát lại.')) {
      switchSourceMode('REPLAY')
    }
  }

  const pauseOrResume = async () => {
    await run(
      () => replay?.is_paused ? TelemetryClient.resumeReplay() : TelemetryClient.pauseReplay(),
      'Không thể đổi trạng thái phát lại.',
    )
  }

  const changeSpeed = async (value: ReplaySpeed) => {
    setSpeed(value)
    if (isReplay) {
      setActiveSpeedOverride(value)
      if (!await run(() => TelemetryClient.setReplaySpeed(value), 'Không thể đổi tốc độ phát lại.')) {
        setActiveSpeedOverride(null)
      }
    }
  }

  const seek = async () => {
    const target = seekPosition ?? replay?.position_ms ?? 0
    if (await run(() => TelemetryClient.seekReplay(target), 'Không thể tìm đến thời điểm đã chọn.')) {
      setSeekPosition(null)
    }
  }

  const stop = async () => {
    if (await run(() => TelemetryClient.stopReplay(), 'Không thể dừng phát lại.')) {
      switchSourceMode('MOCK')
    }
  }

  return (
    <section className="rounded-lg border border-cyan-500/30 bg-cyan-500/5 px-3 py-2" aria-label="Điều khiển phát lại">
      <div className="flex flex-wrap items-center gap-2 text-xs">
        <strong className="text-cyan-700 dark:text-cyan-300">Phát lại nhật ký</strong>
        {!isReplay ? (
          <>
            <label htmlFor="replay-session" className="text-muted-foreground">Phiên</label>
            <select
              id="replay-session"
              value={sessionId}
              onChange={event => setSessionId(event.target.value)}
              disabled={busy || sessions.length === 0}
              className="h-8 max-w-64 rounded-md border bg-background px-2 font-mono"
            >
              {sessions.length === 0 && <option value="">Không có phiên đã ghi</option>}
              {sessions.map(session => (
                <option key={session.session_id} value={session.session_id}>
                  {session.session_id} ({session.records} bản ghi)
                </option>
              ))}
            </select>
            <label htmlFor="replay-speed">Tốc độ</label>
            <select
              id="replay-speed"
              value={speed}
              onChange={event => void changeSpeed(Number(event.target.value) as ReplaySpeed)}
              disabled={busy}
              className="h-8 rounded-md border bg-background px-2"
            >
              <option value={0.5}>0.5×</option><option value={1}>1×</option><option value={2}>2×</option>
            </select>
            <Button type="button" size="sm" onClick={() => void start()} disabled={busy || !sessionId}>
              <Play className="mr-1 h-3.5 w-3.5" /> Bắt đầu
            </Button>
          </>
        ) : (
          <>
            <span className="font-mono" data-testid="replay-session-id">{replay?.source_session_id ?? 'Đang chờ snapshot'}</span>
            <span aria-label="Thời gian phát lại">
              {formatDuration(replay?.position_ms ?? 0)} / {formatDuration(replay?.duration_ms ?? 0)}
            </span>
            <Button type="button" size="sm" variant="outline" onClick={() => void pauseOrResume()} disabled={busy || !replay}>
              {replay?.is_paused ? <Play className="mr-1 h-3.5 w-3.5" /> : <Pause className="mr-1 h-3.5 w-3.5" />}
              {replay?.is_paused ? 'Tiếp tục' : 'Tạm dừng'}
            </Button>
            <label htmlFor="replay-active-speed">Tốc độ</label>
            <select
              id="replay-active-speed"
              value={activeSpeedOverride ?? replay?.speed_multiplier ?? speed}
              onChange={event => void changeSpeed(Number(event.target.value) as ReplaySpeed)}
              disabled={busy}
              className="h-8 rounded-md border bg-background px-2"
            >
              <option value={0.5}>0.5×</option><option value={1}>1×</option><option value={2}>2×</option>
            </select>
            <label htmlFor="replay-seek">Vị trí (ms)</label>
            <input
              id="replay-seek"
              type="number"
              min={0}
              max={replay?.duration_ms ?? 0}
              value={Math.round(seekPosition ?? replay?.position_ms ?? 0)}
              onChange={event => setSeekPosition(Math.max(0, Number(event.target.value) || 0))}
              className="h-8 w-24 rounded-md border bg-background px-2 font-mono"
            />
            <Button type="button" size="sm" variant="outline" onClick={() => void seek()} disabled={busy || !replay}>
              <RotateCcw className="mr-1 h-3.5 w-3.5" /> Tìm đến
            </Button>
            <Button type="button" size="sm" variant="destructive" onClick={() => void stop()} disabled={busy}>
              <Square className="mr-1 h-3.5 w-3.5" /> Dừng phát lại
            </Button>
          </>
        )}
      </div>
      {error && <p role="alert" className="mt-1 text-xs text-red-600">{error}</p>}
    </section>
  )
}
