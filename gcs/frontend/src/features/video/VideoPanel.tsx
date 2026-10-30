import React, { useRef, useState } from 'react'
import {
  Camera,
  Expand,
  Eye,
  EyeOff,
  Video,
  VideoOff,
} from 'lucide-react'
import { Panel } from '@/components/shared/Panel'
import { StatusBadge } from '@/components/shared/StatusBadge'
import { Button } from '@/components/ui/button'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'
import { APP_CONFIG } from '@/config/appConfig'
import { useMission } from '@/state/MissionProvider'
import { DetectionOverlay } from './DetectionOverlay'

export const VideoPanel: React.FC = () => {
  const { state } = useMission()
  const { video, bounding_boxes, source_mode } = state

  const [showOverlay, setShowOverlay] = useState(true)
  const [localVideoError, setLocalVideoError] = useState(false)
  const [lastFrameTimeIso] = useState<string>(() => new Date().toLocaleTimeString())

  const videoContainerRef = useRef<HTMLDivElement | null>(null)

  // Toàn màn hình khung video
  const toggleFullscreen = () => {
    if (!videoContainerRef.current) return
    if (!document.fullscreenElement) {
      videoContainerRef.current.requestFullscreen().catch(console.error)
    } else {
      document.exitFullscreen().catch(console.error)
    }
  }

  const isMock = source_mode === 'MOCK' || video.source_type === 'MOCK'
  const isVideoOffline = !video.is_connected || localVideoError

  // Nhãn nguồn video theo mục 5
  const getSourceLabel = () => {
    if (source_mode === 'REAL') return 'REAL'
    return 'MOCK'
  }

  // Tên camera / nguồn quang học
  const getCameraName = () => {
    if (source_mode === 'REAL') return 'Camera RGB — nguồn video được cấu hình'
    return 'Khung hình mô phỏng IMX219'
  }

  const streamUrl = video.url || APP_CONFIG.VIDEO_STREAM_URL

  return (
    <Panel
      title="Video tham chiếu"
      infoTip="Luồng hình ảnh trực tiếp từ camera quang học trên tải UAV kèm khung nhận diện bounding box từ mô hình AI YOLO."
      icon={<Video className="h-4 w-4 text-primary" />}
      noPadding
      className="h-full flex flex-col min-h-0 border-border bg-card shadow-xs"
      headerRight={
        <div className="flex items-center gap-1.5 flex-wrap">
          {/* Nhãn MOCK / REAL */}
          <StatusBadge
            label={getSourceLabel()}
            variant={source_mode === 'REAL' ? 'ok' : 'accent'}
          />

          {/* Bật/Tắt Hộp nhận diện bounding box */}
          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                variant={showOverlay ? 'secondary' : 'ghost'}
                size="icon"
                className="h-7 w-7 text-xs border border-border/50"
                onClick={() => setShowOverlay(!showOverlay)}
                aria-label="Bật tắt hiển thị hộp nhận diện AI"
              >
                {showOverlay ? <Eye className="h-3.5 w-3.5 text-primary" /> : <EyeOff className="h-3.5 w-3.5 text-muted-foreground" />}
              </Button>
            </TooltipTrigger>
            <TooltipContent>
              <p className="text-xs">{showOverlay ? 'Ẩn bounding box AI' : 'Hiện bounding box AI'}</p>
            </TooltipContent>
          </Tooltip>

          {/* Nút Toàn màn hình */}
          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                variant="outline"
                size="icon"
                className="h-7 w-7 text-xs border-border"
                onClick={toggleFullscreen}
                aria-label="Toàn màn hình khung video tham chiếu"
              >
                <Expand className="h-3.5 w-3.5 text-muted-foreground" />
              </Button>
            </TooltipTrigger>
            <TooltipContent>
              <p className="text-xs">Toàn màn hình video</p>
            </TooltipContent>
          </Tooltip>
        </div>
      }
    >
      <div
        ref={videoContainerRef}
        className="relative w-full h-full min-h-0 flex-1 bg-[var(--kvc-surface)] flex items-center justify-center overflow-hidden select-none"
      >
        {/* Nguồn Video: Mock SVG Test Pattern hoặc Live Feed */}
        {isMock ? (
          <div className="relative w-full h-full flex items-center justify-center">
            <img
              src="/assets/test_pattern.svg"
              alt="KVC Reference Video Pattern"
              className="w-full h-full object-contain pointer-events-none"
            />
            {/* Lớp Bounding Box nếu nguồn video có dữ liệu phát hiện */}
            <DetectionOverlay boxes={bounding_boxes} isSynced={showOverlay} />
          </div>
        ) : (
          <div className="relative w-full h-full flex items-center justify-center">
            <img
              src={streamUrl}
              alt="KVC Live Optical Feed"
              className="w-full h-full object-contain pointer-events-none"
              onError={() => setLocalVideoError(true)}
            />
            <DetectionOverlay boxes={bounding_boxes} isSynced={showOverlay} />
          </div>
        )}

        {/* Lớp phủ khi mất video (Mục 5: Giữ frame cuối, phủ thông báo, kích thước panel không đổi) */}
        {isVideoOffline && !isMock && (
          <div className="absolute inset-0 z-20 bg-[var(--kvc-surface)]/95 flex flex-col items-center justify-center p-4 text-center">
            <div className="p-3 rounded-full bg-destructive/15 text-destructive mb-2 border border-destructive/30">
              <VideoOff className="h-6 w-6" />
            </div>
            <h4 className="text-xs font-bold text-foreground mb-1">
              Video tạm thời không cập nhật
            </h4>
            <p className="text-[11px] text-muted-foreground max-w-xs mb-2">
              Đường truyền hình ảnh bị gián đoạn. Tọa độ telemetry và định vị GPS vẫn tiếp tục hoạt động độc lập.
            </p>
            <div className="text-[11px] font-mono text-muted-foreground/80 bg-background/80 px-2 py-0.5 rounded border border-border">
              Frame cuối: {lastFrameTimeIso}
            </div>
          </div>
        )}

        {/* Thông tin OSD Quang học góc dưới trái (Không tự đặt FPS/Độ phân giải khi không có trong schema) */}
        <div className="absolute bottom-2 left-2 z-10 bg-[var(--kvc-surface-2)] border border-[var(--kvc-line)] px-2.5 py-1 rounded-kvc-control text-[11px] font-mono text-[var(--kvc-text-muted)] flex items-center gap-2 shadow-xs">
          <span className="flex items-center gap-1">
            <Camera className="h-3 w-3 text-[var(--kvc-accent-ink)]" />
            <span>{getCameraName()}</span>
          </span>
          <span className="text-[var(--kvc-text-on-overlay)]/30">•</span>
          <span>{isMock ? 'PATTERN MÔ PHỎNG' : 'ĐỘ PHÂN GIẢI: N/A'}</span>
          <span className="text-[var(--kvc-text-on-overlay)]/30">•</span>
          <span className="text-[var(--kvc-text-on-overlay-muted)]">FPS: N/A</span>
          {bounding_boxes && bounding_boxes.length > 0 && (
            <>
              <span className="text-[var(--kvc-text-on-overlay)]/30">•</span>
              <span className="text-[var(--kvc-accent-ink)] font-semibold">
                {bounding_boxes.filter((b) => b.is_synced).length}/{bounding_boxes.length} BBOX ĐỒNG BỘ
              </span>
            </>
          )}
        </div>
      </div>
    </Panel>
  )
}
