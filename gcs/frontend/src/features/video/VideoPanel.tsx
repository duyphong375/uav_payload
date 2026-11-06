import React, { useRef, useState } from 'react'
import {
  Camera,
  Cpu,
  Expand,
  Eye,
  EyeOff,
  Minimize2,
  RotateCw,
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

export interface VideoPanelProps {
  className?: string
  /**
   * `true` khi được nhúng trong PiP của MissionPage hoặc làm view chính: bỏ header của Panel.
   */
  hideHeader?: boolean
  /**
   * Vị trí hiển thị thanh OSD thông số camera. Mặc định là 'bottom-left' (phù hợp với PiP),
   * hoặc 'top-right' khi xem toàn màn hình để không đè lên thanh Dock tác chiến.
   */
  osdPosition?: 'bottom-left' | 'top-right' | 'bottom-right'
}

export const VideoPanel: React.FC<VideoPanelProps> = ({ className = '', hideHeader = false, osdPosition = 'bottom-left' }) => {
  const { state } = useMission()
  const { video, bounding_boxes, source_mode, ws_connected } = state

  const isMock = source_mode === 'MOCK' || video.source_type === 'MOCK'

  // Bật/tắt overlay. Nút con mắt chỉ đổi hiển thị, KHÔNG cấp quyền vẽ box:
  // BBox đến từ OV2640/FPGA còn khung này đến từ OV3660 qua relay IF-05, hai
  // camera và hai đồng hồ khác nhau. Chỉ vẽ khi backend xác nhận đã ghép cặp
  // khung (`video.has_overlay`); phiên MOCK thì box là mô phỏng có nhãn MOCK.
  const [userToggledOverlay, setUserToggledOverlay] = useState<boolean | null>(null)
  const overlayAllowed = isMock || Boolean(video.has_overlay)
  const showOverlay = userToggledOverlay !== null ? userToggledOverlay : overlayAllowed
  const overlaySynced = showOverlay && overlayAllowed

  // Nguồn hiển thị: AUTO (Camera gốc qua relay backend :8000) hoặc AI (YOLO11n :8090)
  const [selectedSource, setSelectedSource] = useState<'AUTO' | 'AI'>('AUTO')

  /**
   * Tự phục hồi khung hình sau khi stream đứt.
   *
   * VẤN ĐỀ: `<img src="/video/stream">` bắn `onError` khi backend đóng stream
   * (relay hết `video_frame_timeout_sec` không có khung mới) hoặc khi Wi-Fi
   * chớp. Trước đây lỗi này được ghi vào `failedUrl` và KHÔNG BAO GIỜ xoá, nên
   * panel đứng ở banner "Video tạm thời không cập nhật" cho tới khi người vận
   * hành F5 — dù camera đã hồi phục. Đó là phần "đơ" mà người dùng thấy.
   *
   * CÁCH SỬA: giữ trạng thái lỗi cho tới khi có `onLoad` thật (không xoá sớm,
   * tránh banner nhấp nháy) và định kỳ remount `<img>` bằng `key` mới.
   * Chống flapping: tối đa 3 lần remount / 10 giây và cách nhau tối thiểu 2 giây.
   */
  const [failedUrl, setFailedUrl] = useState<string | null>(null)
  const [reloadToken, setReloadToken] = useState(0)

  // Bộ điều tiết chống flapping (rate-limiter) cho các tác vụ remount tự động
  const lastReloadTimeRef = useRef(0)
  const reloadWindowRef = useRef({ count: 0, windowStart: 0 })

  const triggerReload = React.useCallback(() => {
    const now = Date.now()
    // Giãn cách tối thiểu 2 giây giữa các lần tự động remount
    if (now - lastReloadTimeRef.current < 2000) {
      return false
    }
    // Trần tối đa 3 lần trong cửa sổ 10 giây
    if (now - reloadWindowRef.current.windowStart > 10000) {
      reloadWindowRef.current = { count: 1, windowStart: now }
    } else {
      if (reloadWindowRef.current.count >= 3) {
        return false
      }
      reloadWindowRef.current.count += 1
    }
    lastReloadTimeRef.current = now
    setFailedUrl(null)
    setReloadToken((token) => token + 1)
    return true
  }, [])

  // Retry định kỳ khi có lỗi tải luồng (failedUrl !== null)
  React.useEffect(() => {
    if (failedUrl === null) return undefined
    const timer = window.setTimeout(() => {
      setReloadToken((token) => token + 1)
    }, APP_CONFIG.VIDEO_RETRY_INTERVAL_MS)
    return () => window.clearTimeout(timer)
  }, [failedUrl, reloadToken])

  // 1. Tự động phục hồi khi backend báo camera kết nối lại (video.is_connected: false -> true)
  const prevConnectedRef = useRef(video.is_connected)
  React.useEffect(() => {
    if (!prevConnectedRef.current && video.is_connected) {
      triggerReload()
    }
    prevConnectedRef.current = video.is_connected
  }, [video.is_connected, triggerReload])

  // 2. Tự động phục hồi khi WebSocket telemetry kết nối lại (ws_connected: false -> true)
  const prevWsConnectedRef = useRef(ws_connected)
  React.useEffect(() => {
    if (!prevWsConnectedRef.current && ws_connected && video.is_connected) {
      triggerReload()
    }
    prevWsConnectedRef.current = ws_connected
  }, [ws_connected, video.is_connected, triggerReload])

  // 3. Watchdog theo tuổi khung: nếu backend báo connected nhưng last_frame_age_ms > 3500ms
  // (khung bị đứng quá 3.5s mà cờ timeout 10s chưa kịp kích hoạt), tự động remount có rate-limit
  const lastAge = video.last_frame_age_ms
  React.useEffect(() => {
    if (video.is_connected && lastAge !== null && lastAge > 3500 && selectedSource !== 'AI') {
      triggerReload()
    }
  }, [video.is_connected, lastAge, selectedSource, triggerReload])

  // Hàm tải lại luồng video thủ công tức thì (bỏ qua rate-limiter tự động)
  const handleReloadStream = (e?: React.MouseEvent) => {
    e?.stopPropagation()
    lastReloadTimeRef.current = Date.now()
    reloadWindowRef.current = { count: 1, windowStart: Date.now() }
    setFailedUrl(null)
    setReloadToken((token) => token + 1)
  }


  const videoContainerRef = useRef<HTMLDivElement | null>(null)
  const [isFullscreen, setIsFullscreen] = useState(false)

  React.useEffect(() => {
    const handleFsChange = () => {
      setIsFullscreen(Boolean(document.fullscreenElement))
    }
    document.addEventListener('fullscreenchange', handleFsChange)
    return () => document.removeEventListener('fullscreenchange', handleFsChange)
  }, [])

  // Toàn màn hình khung video
  const toggleFullscreen = (e?: React.MouseEvent) => {
    e?.stopPropagation()
    if (!videoContainerRef.current) return
    if (!document.fullscreenElement) {
      videoContainerRef.current.requestFullscreen().catch((err) => {
        console.warn('Fullscreen request failed:', err)
      })
    } else {
      document.exitFullscreen().catch((err) => {
        console.warn('Exit fullscreen failed:', err)
      })
    }
  }

  // Pattern mô phỏng CHỈ dùng khi phiên telemetry là MOCK hoặc backend khai báo
  // nguồn khung là MOCK. "REAL + video NONE" (chưa có kênh IF-05) KHÔNG được
  // rơi về pattern, vì người vận hành sẽ tưởng đó là ảnh thật từ tải.


  // Nhãn nguồn video theo mục 5
  const getSourceLabel = () => {
    if (selectedSource === 'AI') return 'AI YOLO'
    if (video.source_kind === 'RELAY') return 'RELAY'
    if (source_mode === 'REAL') return 'REAL'
    return 'MOCK'
  }

  // Tên camera / nguồn quang học
  const getCameraName = () => {
    if (selectedSource === 'AI') return 'YOLO11n Stream (Port 8090 - RTX 4060)'
    if (video.source_kind === 'RELAY') return 'ESP32-S3-CAM (IF-05 relay)'
    if (source_mode === 'REAL') return 'Camera RGB — nguồn video được cấu hình'
    return 'Khung hình mô phỏng (Test Pattern)'
  }

  // Backend trả `stream_path` tương đối (`/video/stream`). Ghép với API gốc để
  // trình duyệt chỉ nói chuyện với backend, không bao giờ gọi thẳng ESP32.
  const defaultStreamUrl = video.url
    ? (video.url.startsWith('http') ? video.url : `${APP_CONFIG.API_BASE_URL}${video.url}`)
    : APP_CONFIG.VIDEO_STREAM_URL

  const streamUrl = selectedSource === 'AI' ? 'http://127.0.0.1:8090/stream' : defaultStreamUrl

  // Không có URL thì KHÔNG được render <img src="">: trình duyệt sẽ tải lại
  // chính trang và bắn onError giả, che mất trạng thái thật của kênh video.
  const hasStream = streamUrl.length > 0
  const localVideoError = hasStream && failedUrl === streamUrl
  const isVideoOffline = selectedSource === 'AI' ? localVideoError : (!video.is_connected || localVideoError)
  // Query chỉ phá cache; backend và MJPEG 8090 đều bỏ qua phần query string.
  const streamSrc = reloadToken > 0
    ? `${streamUrl}${streamUrl.includes('?') ? '&' : '?'}kvc_retry=${reloadToken}`
    : streamUrl

  /**
   * BBox đến từ FPGA (OV2640) còn video đến từ ESP32-S3-CAM — HAI nguồn thời
   * gian độc lập, lệch 100-500 ms. Vì vậy chỉ vẽ overlay khi `video.has_overlay`
   * do backend xác nhận có ghép cặp khung. Hiện backend luôn trả false, nên
   * overlay tắt thay vì vẽ lệch khung (`DASHBOARD_FRONTEND.md`, contract P6).
   *
   * KHÔNG tự sinh box từ `target`: toạ độ mục tiêu là WGS-84 sau khi giải giao
   * tia, không phải toạ độ pixel trong khung này. Vẽ nó lên video sẽ là bịa vị
   * trí không có phép đo nào chống lưng.
   */
  const effectiveBoxes = bounding_boxes ?? []

  const headerRight = (
    <div className="flex items-center gap-1.5 flex-wrap">
      {/* Nhãn MOCK / REAL */}
      <StatusBadge
        label={getSourceLabel()}
        variant={source_mode === 'REAL' || selectedSource === 'AI' ? 'ok' : 'accent'}
      />

      {/* Chuyển đổi nguồn Camera Gốc / AI YOLO */}
      {!isMock && (
        <Tooltip>
          <TooltipTrigger asChild>
            <Button
              variant={selectedSource === 'AI' ? 'default' : 'outline'}
              size="sm"
              className="h-7 text-xs px-2 gap-1 border-border font-medium"
              onClick={() => {
                setSelectedSource((prev) => (prev === 'AI' ? 'AUTO' : 'AI'))
                setFailedUrl(null)
                setReloadToken((t) => t + 1)
              }}
              aria-label="Chuyển đổi nguồn video AI hoặc Camera gốc"
            >
              <Cpu className="h-3.5 w-3.5" />
              <span>{selectedSource === 'AI' ? 'AI YOLO' : 'Camera Gốc'}</span>
            </Button>
          </TooltipTrigger>
          <TooltipContent>
            <p className="text-xs">
              {selectedSource === 'AI'
                ? 'Đang xem luồng AI (8090). Bấm để về Camera gốc'
                : 'Bấm để xem luồng AI nhận diện người/phao (YOLO11n :8090)'}
            </p>
          </TooltipContent>
        </Tooltip>
      )}

      {/* Tải lại luồng video trực tiếp */}
      {hasStream && !isMock && (
        <Tooltip>
          <TooltipTrigger asChild>
            <Button
              variant="outline"
              size="icon"
              className="h-7 w-7 text-xs border-border"
              onClick={handleReloadStream}
              aria-label="Tải lại luồng video"
            >
              <RotateCw className="h-3.5 w-3.5 text-muted-foreground" />
            </Button>
          </TooltipTrigger>
          <TooltipContent>
            <p className="text-xs">Tải lại luồng video (không cần F5)</p>
          </TooltipContent>
        </Tooltip>
      )}

      {/* Bật/Tắt Hộp nhận diện bounding box */}
      <Tooltip>
        <TooltipTrigger asChild>
          <Button
            variant={showOverlay ? 'secondary' : 'ghost'}
            size="icon"
            className="h-7 w-7 text-xs border border-border/50"
            onClick={() => setUserToggledOverlay(!showOverlay)}
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
  )

  const videoBody = (
    <div
      ref={videoContainerRef}
      className="relative w-full h-full min-h-0 flex-1 bg-[var(--kvc-surface)] flex items-center justify-center overflow-hidden select-none"
    >
        {/* Nguồn Video: Mock SVG Test Pattern, Live Feed, hoặc chưa có nguồn */}
        {isMock && !hasStream ? (
          <div className="relative w-full h-full flex items-center justify-center">
            <img
              src="/assets/test_pattern.svg"
              alt="KVC Reference Video Pattern"
              className="w-full h-full object-contain pointer-events-none"
            />
            {/* Lớp Bounding Box nếu nguồn video có dữ liệu phát hiện */}
            <DetectionOverlay boxes={effectiveBoxes} isSynced={showOverlay} />
          </div>
        ) : hasStream ? (
          <div className="relative w-full h-full flex items-center justify-center">
            <img
              key={streamSrc}
              src={streamSrc}
              alt="KVC Live Optical Feed"
              className="w-full h-full object-contain pointer-events-none"
              onLoad={() => setFailedUrl(null)}
              onError={() => setFailedUrl(streamUrl)}
            />
            <DetectionOverlay boxes={effectiveBoxes} isSynced={overlaySynced} />
          </div>
        ) : (
          // REAL nhưng chưa cấu hình kênh IF-05: không có URL thì không render
          // <img src="">, vì trình duyệt sẽ tải lại trang và báo lỗi giả.
          <div className="w-full h-full flex flex-col items-center justify-center gap-1.5 text-center px-4">
            <VideoOff className="h-6 w-6 text-muted-foreground" />
            <span className="text-xs font-semibold text-foreground">Chưa có nguồn video</span>
            <span className="text-[11px] text-muted-foreground max-w-xs">
              Kênh video phụ (IF-05) chưa được cấu hình. Dữ liệu telemetry không bị ảnh hưởng.
            </span>
          </div>
        )}

        {/* Lớp phủ khi mất video (Mục 5: Giữ frame cuối, phủ thông báo, kích thước panel không đổi) */}
        {isVideoOffline && !isMock && hasStream && (
          <div className="absolute inset-0 z-20 bg-[var(--kvc-surface)]/95 flex flex-col items-center justify-center p-4 text-center">
            <div className="p-3 rounded-full bg-destructive/15 text-destructive mb-2 border border-destructive/30">
              <VideoOff className="h-6 w-6" />
            </div>
            <h4 className="text-xs font-bold text-foreground mb-1">
              {selectedSource === 'AI' ? 'Luồng AI (Port 8090) chưa sẵn sàng' : 'Video tạm thời không cập nhật'}
            </h4>
            <p className="text-[11px] text-muted-foreground max-w-xs mb-2">
              {selectedSource === 'AI'
                ? 'Hãy chắc chắn file CHAY_AI_NHAN_DIEN.bat đang chạy, hoặc bấm nút để chuyển về Camera Gốc.'
                : 'Đường truyền hình ảnh bị gián đoạn. Tọa độ telemetry và định vị GPS vẫn tiếp tục hoạt động độc lập.'}
            </p>
            {selectedSource !== 'AI' && (
              <div className="text-[11px] font-mono text-muted-foreground/80 bg-background/80 px-2 py-0.5 rounded border border-border">
                {video.frame_count > 0
                  ? `Đã nhận ${video.frame_count} khung`
                  : 'Chưa nhận được khung nào'}
              </div>
            )}
            <div className="flex items-center gap-2 mt-3">
              <Button
                variant="outline"
                size="sm"
                onClick={handleReloadStream}
                className="text-xs gap-1.5 h-7 bg-background/80 hover:bg-background border-border/80 cursor-pointer pointer-events-auto"
              >
                <RotateCw className="h-3.5 w-3.5 text-primary" />
                Tải lại luồng ngay
              </Button>
              {selectedSource === 'AI' && (
                <Button
                  variant="secondary"
                  size="sm"
                  onClick={() => {
                    setSelectedSource('AUTO')
                    setFailedUrl(null)
                    setReloadToken((t) => t + 1)
                  }}
                  className="text-xs h-7 cursor-pointer pointer-events-auto"
                >
                  Về Camera Gốc
                </Button>
              )}
            </div>
          </div>
        )}

        {/* Thông tin OSD Quang học (tự động điều chỉnh vị trí theo osdPosition) */}
        <div
          className={`absolute ${
            osdPosition === 'top-right'
              ? 'top-2 right-2'
              : osdPosition === 'bottom-right'
                ? 'bottom-2 right-2'
                : 'bottom-2 left-2'
          } z-20 pointer-events-auto kvc-on-overlay bg-[var(--kvc-overlay)]/95 backdrop-blur-md border border-[var(--kvc-line-strong)] px-2.5 py-1.5 rounded-lg sm:rounded-full text-[11px] font-mono text-[var(--kvc-text)] flex flex-wrap items-center gap-x-2 gap-y-1 shadow-md max-w-[calc(100%-1rem)] select-none`}
        >
          {/* Nhãn Camera + Chấm trạng thái Live */}
          <div className="flex items-center gap-1.5 min-w-0 shrink-0 font-sans">
            <span className="relative flex h-2 w-2 shrink-0">
              {hasStream && !isMock && !isVideoOffline ? (
                <>
                  <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75" />
                  <span className="relative inline-flex rounded-full h-2 w-2 bg-emerald-500" />
                </>
              ) : (
                <span className="relative inline-flex rounded-full h-2 w-2 bg-amber-400" />
              )}
            </span>
            <Camera className="h-3.5 w-3.5 shrink-0 text-[var(--kvc-accent-ink)]" />
            <span className="font-semibold text-[var(--kvc-text)] truncate text-[11px] tracking-tight">
              {getCameraName()}
            </span>
          </div>

          <span className="h-3 w-px bg-[var(--kvc-line)] shrink-0 hidden sm:inline-block" />

          {/* Badge độ phân giải */}
          <span className="px-1.5 py-0.5 rounded bg-[var(--kvc-surface)]/80 text-[var(--kvc-text-muted)] text-[10px] font-mono border border-[var(--kvc-line)]/60 whitespace-nowrap">
            {isMock
              ? 'PATTERN MÔ PHỎNG'
              : selectedSource === 'AI'
                ? 'ĐỘ PHÂN GIẢI: 640×480'
                : video.source_kind === 'RELAY'
                  ? 'ĐỘ PHÂN GIẢI: 640×480'
                  : 'ĐỘ PHÂN GIẢI: N/A'}
          </span>

          {/* Badge FPS */}
          <span className="px-1.5 py-0.5 rounded bg-[var(--kvc-surface)]/80 text-[var(--kvc-text-muted)] text-[10px] font-mono border border-[var(--kvc-line)]/60 whitespace-nowrap">
            {selectedSource === 'AI'
              ? 'FPS: 25'
              : video.source_kind === 'RELAY'
                ? 'FPS: 20'
                : isMock
                  ? 'FPS: 30'
                  : 'FPS: N/A'}
          </span>

          {/* Badge số khung */}
          {video.source_kind === 'RELAY' && (
            <span className="px-1.5 py-0.5 rounded bg-[var(--kvc-surface-2)] text-[var(--kvc-accent-ink)] text-[10px] font-mono font-semibold border border-[var(--kvc-line)] whitespace-nowrap">
              KHUNG: {video.frame_count}
            </span>
          )}

          {/* Badge Bounding box */}
          {effectiveBoxes && effectiveBoxes.length > 0 && (
            <span className="px-1.5 py-0.5 rounded bg-[var(--kvc-surface-2)] text-[var(--kvc-warn-ink)] text-[10px] font-mono font-semibold border border-[var(--kvc-line)] whitespace-nowrap">
              {overlaySynced
                ? `BBOX AI: ${effectiveBoxes.length} (Đang hiển thị)`
                : `BBOX FPGA: ${effectiveBoxes.length} (không phủ lên khung này)`}
            </span>
          )}

          {/* Cụm điều khiển nhanh trên HUD khi ẩn header */}
          {hideHeader && (
            <>
              <span className="h-3.5 w-px bg-[var(--kvc-line-strong)] shrink-0" />
              <div className="flex items-center gap-1 shrink-0 pointer-events-auto">
                {!isMock && (
                  <button
                    type="button"
                    onClick={() => {
                      setSelectedSource((prev) => (prev === 'AI' ? 'AUTO' : 'AI'))
                      setFailedUrl(null)
                      setReloadToken((t) => t + 1)
                    }}
                    className={`px-2 py-0.5 text-[10px] font-bold rounded cursor-pointer transition-all border shadow-xs ${
                      selectedSource === 'AI'
                        ? 'bg-primary text-primary-foreground border-primary'
                        : 'bg-[var(--kvc-surface)] hover:bg-[var(--kvc-surface-2)] text-[var(--kvc-text)] border-[var(--kvc-line)]'
                    }`}
                    title={
                      selectedSource === 'AI'
                        ? 'Đang xem luồng AI (8090). Nhấn để về Camera gốc'
                        : 'Xem luồng AI YOLO11n (:8090)'
                    }
                  >
                    {selectedSource === 'AI' ? 'AI' : 'GỐC'}
                  </button>
                )}
                {hasStream && !isMock && (
                  <button
                    type="button"
                    onClick={handleReloadStream}
                    className="h-6 w-6 flex items-center justify-center rounded bg-[var(--kvc-surface)]/60 hover:bg-[var(--kvc-surface-2)] text-[var(--kvc-text-muted)] hover:text-[var(--kvc-text)] border border-[var(--kvc-line)]/50 transition-colors cursor-pointer"
                    title="Tải lại luồng video (không cần F5)"
                    aria-label="Tải lại luồng video"
                  >
                    <RotateCw className="h-3.5 w-3.5" />
                  </button>
                )}
                <button
                  type="button"
                  onClick={(e) => toggleFullscreen(e)}
                  className="h-6 w-6 flex items-center justify-center rounded bg-[var(--kvc-surface)]/60 hover:bg-[var(--kvc-surface-2)] text-[var(--kvc-text-muted)] hover:text-[var(--kvc-text)] border border-[var(--kvc-line)]/50 transition-colors cursor-pointer"
                  title={isFullscreen ? 'Thu nhỏ video' : 'Toàn màn hình video'}
                  aria-label="Toàn màn hình khung video"
                >
                  {isFullscreen ? (
                    <Minimize2 className="h-3.5 w-3.5" />
                  ) : (
                    <Expand className="h-3.5 w-3.5" />
                  )}
                </button>
              </div>
            </>
          )}
        </div>
      </div>
  )

  // Trong PiP, MissionPage đã có thanh tiêu đề riêng: bỏ header của Panel để
  // khung 288 px không bị hai thanh tiêu đề chiếm mất gần nửa chiều cao.
  if (hideHeader) {
    return (
      <div className={`w-full h-full min-h-0 flex flex-col overflow-hidden bg-card ${className}`}>
        {videoBody}
      </div>
    )
  }

  return (
    <Panel
      title="Video tham chiếu"
      infoTip="Kênh video phụ từ ESP32-S3-CAM qua backend (IF-05). Đây là hai camera vật lý khác nhau: bounding box của FPGA/OV2640 không được phủ lên khung này vì hai nguồn thời gian độc lập. Chỉ hiển thị video và số khung đếm được."
      icon={<Video className="h-4 w-4 text-primary" />}
      noPadding
      className={`h-full flex flex-col min-h-0 border-border bg-card shadow-xs ${className}`}
      headerRight={headerRight}
    >
      {videoBody}
    </Panel>
  )
}
