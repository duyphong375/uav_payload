import React, { useState } from 'react'
import {
  Download,
  Film,
  Map,
  MapPin,
  Mountain,
  Pause,
  Play,
  Square,
} from 'lucide-react'
import { toast } from 'sonner'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'
import { TelemetryClient, type StoredSession } from '@/services/telemetryClient'
import { useMission } from '@/state/MissionProvider'
import { DetectionOverlay } from '@/features/video/DetectionOverlay'

interface FlightDebriefingPlayerProps {
  session: StoredSession
  onExportCsv?: () => void
}

function formatDuration(valueMs: number): string {
  const totalSeconds = Math.max(0, Math.floor(valueMs / 1000))
  const minutes = Math.floor(totalSeconds / 60)
  const seconds = totalSeconds % 60
  return `${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`
}

export const FlightDebriefingPlayer: React.FC<FlightDebriefingPlayerProps> = ({
  session,
  onExportCsv,
}) => {
  const { state, switchSourceMode } = useMission()
  const { replay, source_mode, camera_position, telemetry, target, has_target } = state

  const [activeView, setActiveView] = useState<'VIDEO' | 'MAP'>('VIDEO')
  const [speed, setSpeed] = useState<0.5 | 1 | 2>(1)
  const [busy, setBusy] = useState(false)

  const isReplayActive = source_mode === 'REPLAY' && replay?.source_session_id === session.session_id
  const isPaused = replay?.is_paused ?? false
  const currentPosMs = isReplayActive ? replay?.position_ms ?? 0 : 0
  const durationMs = isReplayActive ? replay?.duration_ms ?? 60000 : Math.max(60000, session.records * 200)

  // Bắt đầu / Tiếp tục / Tạm dừng Replay
  const handleTogglePlay = async () => {
    setBusy(true)
    try {
      if (!isReplayActive) {
        const res = await TelemetryClient.startReplay(session.session_id, speed)
        if (res) {
          switchSourceMode('REPLAY')
          toast.success(`Đang phát lại phiên [${session.session_id}]`)
        } else {
          toast.error('Không thể khởi động phát lại phiên.')
        }
      } else if (isPaused) {
        await TelemetryClient.resumeReplay()
      } else {
        await TelemetryClient.pauseReplay()
      }
    } catch {
      toast.error('Lỗi khi điều khiển phát lại.')
    } finally {
      setBusy(false)
    }
  }

  // Dừng phát lại
  const handleStop = async () => {
    setBusy(true)
    try {
      await TelemetryClient.stopReplay()
      switchSourceMode('MOCK')
      toast.info('Đã dừng phát lại.')
    } catch {
      toast.error('Không thể dừng phát lại.')
    } finally {
      setBusy(false)
    }
  }

  // Tua thời gian (+10s hoặc -10s)
  const handleSeekDelta = async (deltaMs: number) => {
    if (!isReplayActive) return
    const targetMs = Math.max(0, Math.min(durationMs, currentPosMs + deltaMs))
    await TelemetryClient.seekReplay(targetMs)
  }

  // Kéo thanh trượt Scrubber
  const handleScrubberChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const targetMs = Number(e.target.value)
    if (isReplayActive) {
      await TelemetryClient.seekReplay(targetMs)
    }
  }

  // Thay đổi tốc độ
  const handleSpeedChange = async (newSpeed: 0.5 | 1 | 2) => {
    setSpeed(newSpeed)
    if (isReplayActive) {
      await TelemetryClient.setReplaySpeed(newSpeed)
    }
  }

  // Tải video chuyến bay .mp4
  const handleDownloadVideo = () => {
    const filename = `KVC_FlightVideo_${session.session_id}.mp4`
    // Tạo file blob mô phỏng xuất bằng chứng video MP4
    const dummyBlob = new Blob(['KVC UAV OPTICAL RECON RECORDER EVIDENCE'], { type: 'video/mp4' })
    const url = URL.createObjectURL(dummyBlob)
    const link = document.createElement('a')
    link.href = url
    link.download = filename
    document.body.appendChild(link)
    link.click()
    document.body.removeChild(link)
    URL.revokeObjectURL(url)
    toast.success(`Đã chuẩn bị tải về video bằng chứng: ${filename}`)
  }

  const hasGpsFix = camera_position.is_valid && camera_position.latitude !== null && camera_position.longitude !== null
  const lidarM = telemetry.lidar_range_cm !== null ? (telemetry.lidar_range_cm / 100).toFixed(2) : 'N/A'
  const targetLabel = has_target && target?.class_name
    ? target.class_name === 'boat' || target.class_name === 'lifebuoy'
      ? 'TÀU THUYỀN (Boat)'
      : 'NGƯỜI GẶP NẠN (Person)'
    : 'Không phát hiện mục tiêu'

  return (
    <div className="flex flex-col gap-3 h-full select-none">
      {/* 1. Header phát lại: Tiêu đề phiên, trạng thái, nút xuất bằng chứng */}
      <div className="flex flex-wrap items-center justify-between gap-2 p-2.5 rounded-xl border border-border bg-card/80 backdrop-blur-xs shadow-2xs">
        <div className="flex items-center gap-2 flex-wrap min-w-0">
          <Film className="h-4 w-4 text-cyan-500 shrink-0" />
          <span className="text-sm font-bold font-mono text-foreground truncate">
            {session.session_id}
          </span>
          <Badge
            variant="outline"
            className="text-[10px] px-2 py-0.5 font-mono border-cyan-500/40 text-cyan-600 dark:text-cyan-400 bg-cyan-500/10"
          >
            {isReplayActive ? (isPaused ? 'TẠM DỪNG' : 'ĐANG PHÁT LẠI') : 'SẴN SÀNG PHÁT'}
          </Badge>
          <span className="text-xs text-muted-foreground hidden sm:inline">
            • {session.records.toLocaleString()} gói tin ({((session.size_bytes || 4096) / 1024).toFixed(1)} KB)
          </span>
        </div>

        {/* Nút Xuất Bằng Chứng Cứu Nạn (Mục 4.5) */}
        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={handleDownloadVideo}
            className="h-8 text-xs gap-1.5 border-border hover:border-cyan-500/60 shadow-2xs cursor-pointer"
            title="Tải video quang học camera hành trình của phiên bay này"
          >
            <Download className="h-3.5 w-3.5 text-cyan-500" />
            <span className="hidden md:inline">Tải Video Chuyến Bay (.mp4)</span>
            <span className="md:hidden">Tải Video</span>
          </Button>

          {onExportCsv && (
            <Button
              variant="outline"
              size="sm"
              onClick={onExportCsv}
              className="h-8 text-xs gap-1.5 border-border hover:border-primary/60 shadow-2xs cursor-pointer"
              title="Xuất báo cáo toàn bộ sự kiện cứu hộ SAR dạng file CSV"
            >
              <Download className="h-3.5 w-3.5 text-primary" />
              <span className="hidden md:inline">Xuất Báo Cáo SAR (.csv)</span>
              <span className="md:hidden">Xuất CSV</span>
            </Button>
          )}
        </div>
      </div>

      {/* 2. Màn hình phát lại: Video Camera Hành Trình hoặc Vệt Bay Bản Đồ */}
      <div className="relative aspect-video w-full rounded-xl border border-border/80 bg-slate-950 overflow-hidden shadow-md flex flex-col justify-between">
        {/* Nền màn hình: Giả lập Video quang học hoặc vệt bay */}
        {activeView === 'VIDEO' ? (
          <div className="absolute inset-0 flex items-center justify-center bg-gradient-to-br from-slate-950 via-slate-900 to-slate-950">
            {/* Giả lập khung cảnh mặt nước / đối tượng */}
            <div className="absolute inset-0 opacity-40 bg-[radial-gradient(ellipse_at_center,_var(--tw-gradient-stops))] from-blue-900/40 via-slate-950/80 to-black pointer-events-none" />
            
            {/* Lớp hiển thị Bounding Box AI YOLO */}
            <DetectionOverlay boxes={state.bounding_boxes} isSynced={true} />

            {/* Thủy vân Watermark trung tâm */}
            <div className="relative z-10 flex flex-col items-center gap-2 p-4 text-center pointer-events-none">
              <div className="h-12 w-12 rounded-full border border-cyan-500/40 bg-cyan-500/10 flex items-center justify-center text-cyan-400">
                <Film className="h-6 w-6" />
              </div>
              <div className="text-sm font-bold text-slate-200">
                LUỒNG QUANG HỌC HỘP ĐEN PHIÊN BAY
              </div>
              <div className="text-xs font-mono text-slate-400">
                SONIX SN98660 HD CAMERA • YOLO11n 30 FPS • HỘP ĐEN KVC
              </div>
            </div>
          </div>
        ) : (
          <div className="absolute inset-0 flex flex-col items-center justify-center bg-slate-900 text-slate-300 p-6">
            <Map className="h-12 w-12 text-primary mb-2 opacity-80" />
            <h4 className="font-bold text-sm">Vệt bay định vị WGS-84</h4>
            <p className="text-xs text-muted-foreground mt-1 max-w-md text-center">
              Tọa độ tái hiện: {camera_position.latitude?.toFixed(6) ?? '10.776889'}° N,{' '}
              {camera_position.longitude?.toFixed(6) ?? '106.700806'}° E
            </p>
          </div>
        )}

        {/* HUD Trên cùng: Mã phiên, Tọa độ WGS-84, Nút chuyển chế độ xem */}
        <div className="relative z-20 flex items-center justify-between p-3 bg-gradient-to-b from-black/80 via-black/40 to-transparent pointer-events-auto">
          <div className="flex items-center gap-2">
            <Badge className="bg-red-500/80 hover:bg-red-500 text-white font-mono text-[10px] uppercase tracking-wider px-2 py-0.5">
              ● RECORDER DEBRIEF
            </Badge>
            <span className="text-xs font-mono font-bold text-white drop-shadow-md">
              KVC-UAV-01 • {session.session_id}
            </span>
          </div>

          <div className="flex items-center gap-1.5 bg-black/60 p-1 rounded-lg backdrop-blur-md border border-white/10">
            <Button
              variant={activeView === 'VIDEO' ? 'secondary' : 'ghost'}
              size="sm"
              onClick={() => setActiveView('VIDEO')}
              className="h-6 px-2 text-[10px] text-white hover:text-white cursor-pointer"
            >
              <Film className="h-3 w-3 mr-1" /> Video
            </Button>
            <Button
              variant={activeView === 'MAP' ? 'secondary' : 'ghost'}
              size="sm"
              onClick={() => setActiveView('MAP')}
              className="h-6 px-2 text-[10px] text-white hover:text-white cursor-pointer"
            >
              <Map className="h-3 w-3 mr-1" /> Vệt bay
            </Button>
          </div>
        </div>

        {/* HUD Dưới cùng: Bounding box AI & Cảm biến trực tiếp tại giây đang phát */}
        <div className="relative z-20 flex items-center justify-between p-3 bg-gradient-to-t from-black/90 via-black/50 to-transparent text-white text-xs font-mono">
          <div className="flex items-center gap-3">
            <span className="flex items-center gap-1 text-emerald-400">
              <MapPin className="h-3.5 w-3.5" />
              {hasGpsFix ? `${camera_position.latitude?.toFixed(5)}°N, ${camera_position.longitude?.toFixed(5)}°E` : 'Chưa có GPS'}
            </span>
            <span className="flex items-center gap-1 text-cyan-400">
              <Mountain className="h-3.5 w-3.5" />
              LiDAR: {lidarM !== 'N/A' ? `${lidarM}m` : 'N/A'}
            </span>
          </div>

          <div className="flex items-center gap-2">
            {has_target && (
              <Badge className="bg-rose-600 text-white font-semibold text-[10px] border-none">
                AI: {targetLabel} ({target?.confidence != null ? `${target.confidence}%` : 'N/A'})
              </Badge>
            )}
          </div>
        </div>
      </div>

      {/* 3. Thanh Scrubber Timeline & Cụm nút Playback (Mục 4.3) */}
      <div className="p-3 rounded-xl border border-border bg-card shadow-xs flex flex-col gap-2.5">
        {/* Dải tiến trình & Thời gian Scrubber */}
        <div className="flex items-center gap-3">
          <span className="text-xs font-mono font-bold text-primary min-w-[45px]">
            {formatDuration(currentPosMs)}
          </span>
          <input
            type="range"
            min={0}
            max={durationMs}
            value={currentPosMs}
            onChange={handleScrubberChange}
            disabled={!isReplayActive}
            aria-label="Thanh kéo trượt thời gian phát lại"
            className="flex-1 h-2 rounded-lg bg-muted accent-primary cursor-pointer disabled:opacity-40"
          />
          <span className="text-xs font-mono text-muted-foreground min-w-[45px] text-right">
            {formatDuration(durationMs)}
          </span>
        </div>

        {/* Cụm điều khiển: Tua lùi 10s, Play/Pause, Tua tới 10s, Dừng, Chọn tốc độ */}
        <div className="flex flex-wrap items-center justify-between gap-2 pt-1 border-t border-border/50">
          <div className="flex items-center gap-1.5">
            {/* Tua lùi 10s */}
            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => handleSeekDelta(-10000)}
                  disabled={!isReplayActive || busy}
                  className="h-8 px-2 text-xs font-mono cursor-pointer"
                  aria-label="Tua lùi 10 giây"
                >
                  -10s
                </Button>
              </TooltipTrigger>
              <TooltipContent><p className="text-xs">Tua lùi lại 10 giây</p></TooltipContent>
            </Tooltip>

            {/* Play / Pause */}
            <Button
              variant={isReplayActive && !isPaused ? 'default' : 'secondary'}
              size="sm"
              onClick={handleTogglePlay}
              disabled={busy}
              className="h-8 px-3 text-xs gap-1.5 font-semibold cursor-pointer"
              aria-label={isReplayActive && !isPaused ? 'Tạm dừng phát lại' : 'Bắt đầu hoặc tiếp tục phát lại'}
            >
              {isReplayActive && !isPaused ? (
                <>
                  <Pause className="h-3.5 w-3.5" />
                  <span>Tạm dừng</span>
                </>
              ) : (
                <>
                  <Play className="h-3.5 w-3.5" />
                  <span>{isReplayActive ? 'Tiếp tục' : 'Bắt đầu phát'}</span>
                </>
              )}
            </Button>

            {/* Tua tới 10s */}
            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => handleSeekDelta(10000)}
                  disabled={!isReplayActive || busy}
                  className="h-8 px-2 text-xs font-mono cursor-pointer"
                  aria-label="Tua tới 10 giây"
                >
                  +10s
                </Button>
              </TooltipTrigger>
              <TooltipContent><p className="text-xs">Tua tới 10 giây</p></TooltipContent>
            </Tooltip>

            {/* Nút Dừng */}
            {isReplayActive && (
              <Button
                variant="destructive"
                size="sm"
                onClick={handleStop}
                disabled={busy}
                className="h-8 px-2.5 text-xs gap-1 cursor-pointer"
                aria-label="Dừng phát lại"
              >
                <Square className="h-3 w-3" />
                <span className="hidden sm:inline">Dừng</span>
              </Button>
            )}
          </div>

          {/* Chọn Tốc Độ Phát Lại (0.5x, 1x, 2x) */}
          <div className="flex items-center gap-1 bg-muted/60 p-0.5 rounded-lg border border-border/60">
            <span className="text-[10px] text-muted-foreground px-1 font-medium hidden sm:inline">
              Tốc độ:
            </span>
            {([0.5, 1, 2] as const).map((spd) => (
              <Button
                key={spd}
                variant={speed === spd ? 'default' : 'ghost'}
                size="sm"
                onClick={() => handleSpeedChange(spd)}
                className="h-6 px-2 text-[10px] font-mono cursor-pointer"
              >
                {spd}x
              </Button>
            ))}
          </div>
        </div>
      </div>

      {/* 4. Bảng thông số bay đồng bộ theo thời gian phát (Mục 4.4) */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
        <div className="p-2.5 rounded-xl border border-border bg-card/60">
          <div className="text-[10px] text-muted-foreground uppercase font-medium">📍 Tọa độ GPS UAV</div>
          <div className="text-xs font-mono font-bold text-foreground mt-0.5 truncate">
            {camera_position.latitude ? `${camera_position.latitude.toFixed(6)}° N` : 'N/A'}
          </div>
          <div className="text-[10px] font-mono text-muted-foreground truncate">
            {camera_position.longitude ? `${camera_position.longitude.toFixed(6)}° E` : 'N/A'}
          </div>
        </div>

        <div className="p-2.5 rounded-xl border border-border bg-card/60">
          <div className="text-[10px] text-muted-foreground uppercase font-medium">⛰️ Độ cao mặt nước LiDAR</div>
          <div className="text-sm font-mono font-bold text-cyan-600 dark:text-cyan-400 mt-0.5">
            {lidarM !== 'N/A' ? `${lidarM} m` : 'N/A'}
          </div>
          <div className="text-[10px] text-muted-foreground">Khoảng cách an toàn</div>
        </div>

        <div className="p-2.5 rounded-xl border border-border bg-card/60">
          <div className="text-[10px] text-muted-foreground uppercase font-medium">🎯 Nhận diện AI SAR</div>
          <div className="text-xs font-bold text-rose-600 dark:text-rose-400 mt-0.5 truncate">
            {targetLabel}
          </div>
          <div className="text-[10px] font-mono text-muted-foreground">
            Độ tin cậy: {target?.confidence != null ? `${target.confidence}%` : 'N/A'}
          </div>
        </div>

        <div className="p-2.5 rounded-xl border border-border bg-card/60">
          <div className="text-[10px] text-muted-foreground uppercase font-medium">📡 Đường truyền RF LoRa</div>
          <div className="text-xs font-mono font-bold text-foreground mt-0.5">
            RSSI: {telemetry.packet_rssi_dbm != null ? `${telemetry.packet_rssi_dbm} dBm` : 'N/A'}
          </div>
          <div className="text-[10px] font-mono text-muted-foreground">
            SNR: {telemetry.packet_snr_db != null ? `${telemetry.packet_snr_db > 0 ? `+${telemetry.packet_snr_db}` : telemetry.packet_snr_db} dB` : 'N/A'}
          </div>
        </div>
      </div>
    </div>
  )
}
