import React from 'react'
import {
  BookmarkPlus,
  CheckCircle2,
  Clock,
  Copy,
  Crosshair,
  LifeBuoy,
  Target,
  User,
} from 'lucide-react'
import { toast } from 'sonner'
import { Panel } from '@/components/shared/Panel'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { useMission } from '@/state/MissionProvider'
import { isAgeStale } from '@/lib/stale'

export const TargetDetailsPanel: React.FC<{ className?: string }> = ({ className = '' }) => {
  const { state, dispatch } = useMission()
  const { has_target, target, rx_age_ms, is_stale, source_mode } = state

  const getTargetIcon = (classNameStr?: string) => {
    switch (classNameStr) {
      case 'person':
        return <User className="h-4 w-4 text-[var(--kvc-ok-ink)]" />
      case 'boat':
      case 'lifebuoy':
        return <LifeBuoy className="h-4 w-4 text-[var(--kvc-accent-ink)]" />
      default:
        return <Target className="h-4 w-4 text-muted-foreground" />
    }
  }

  const getTargetLabel = (classNameStr?: string) => {
    switch (classNameStr) {
      case 'person':
        return 'Người gặp nạn (Person)'
      case 'boat':
      case 'lifebuoy':
        return 'Tàu thuyền (Boat / Vessel)'
      default:
        return 'Chưa phân loại'
    }
  }

  // Sao chép tọa độ chuẩn bàn giao cứu nạn (SAR Handover)
  const handleCopyCoord = async () => {
    if (!target) {
      toast.error('Chưa có thông tin mục tiêu để sao chép!')
      return
    }

    if (!target.pos_valid) {
      toast.error('Tọa độ mục tiêu chưa hợp lệ (pos_valid: false), không thể bàn giao!')
      return
    }

    let text = ''
    const timeStr = new Date().toLocaleTimeString('vi-VN', { hour12: false })
    const confStr = target.confidence !== null ? `${target.confidence}%` : 'Chưa xác định'
    const confStatus = target.target_confirmed ? 'Xác nhận (≥3 frame)' : 'Sơ bộ'
    const targetType = getTargetLabel(target.class_name)

    if (target.coordinate_frame === 'LOCAL_GRID') {
      if (target.local_x_cm === null || target.local_y_cm === null) {
        toast.error('Tọa độ local cục bộ bị thiếu (null), không thể sao chép!')
        return
      }
      text = `[KVC SAR TARGET] Track #${target.track_id ?? 'N/A'} (${targetType}) | hệ local: X=${target.local_x_cm}cm, Y=${target.local_y_cm}cm | Hệ quy chiếu: LOCAL_GRID (Gốc O 0,0) | Độ tin cậy: ${confStr} (${confStatus}) | Nguồn: ${source_mode} | Thời điểm: ${timeStr}`
    } else {
      if (target.latitude === null || target.longitude === null) {
        toast.error('Tọa độ WGS-84 mục tiêu bị thiếu (null), không thể sao chép!')
        return
      }
      text = `[KVC SAR TARGET] Track #${target.track_id ?? 'N/A'} (${targetType}) | Vĩ độ: ${target.latitude.toFixed(6)}° N, Kinh độ: ${target.longitude.toFixed(6)}° E | Hệ quy chiếu: WGS-84 | Độ tin cậy: ${confStr} (${confStatus}) | Nguồn: ${source_mode} | Thời điểm: ${timeStr}`
    }

    if (isAgeStale(rx_age_ms, is_stale)) {
      text += ` [CẢNH BÁO: Dữ liệu cũ ${rx_age_ms}ms]`
    }

    try {
      await navigator.clipboard.writeText(text)
      const frameLabel = target.coordinate_frame === 'LOCAL_GRID' ? 'LOCAL (cm)' : 'WGS-84'
      toast.success(`Đã sao chép toạ độ ${frameLabel} mục tiêu bàn giao cứu nạn: ${text}`)
    } catch {
      toast.error('Không thể truy cập clipboard của trình duyệt!')
    }
  }

  // Đánh dấu mốc sự kiện vào nhật ký phiên
  const handleSaveEvidence = () => {
    if (!target) return
    const textCoord =
      target.coordinate_frame === 'LOCAL_GRID'
        ? `X:${target.local_x_cm ?? '—'}cm, Y:${target.local_y_cm ?? '—'}cm`
        : `${target.latitude !== null ? target.latitude.toFixed(6) : 'N/A'}, ${target.longitude !== null ? target.longitude.toFixed(6) : 'N/A'}`

    dispatch({
      type: 'LOG_EVENT',
      payload: {
        level: 'INFO',
        source: 'SAR_MISSION',
        code: 'SAR_MARK_EVENT',
        message: `Đánh dấu sự kiện mục tiêu #${target.track_id ?? 'N/A'} [${target.class_name}] tại ${textCoord}`,
      },
    })
    toast.success(`Đã đánh dấu sự kiện mục tiêu #${target.track_id ?? 'N/A'} vào nhật ký phiên làm việc!`)
  }

  const isLocalGrid = target?.coordinate_frame === 'LOCAL_GRID'

  return (
    <Panel
      title="Mục tiêu cứu nạn (Target)"
      infoTip="Chi tiết mục tiêu Người gặp nạn hoặc Tàu thuyền phát hiện bởi AI: độ tin cậy, cự ly, góc lệch, tọa độ WGS-84/Local và nút sao chép bàn giao cứu nạn (SAR Handover)."
      icon={<Crosshair className="h-4 w-4 text-[var(--kvc-accent-ink)]" />}
      className={`h-auto shrink-0 shadow-xs border-border ${className}`}
      headerRight={
        has_target && target ? (
          <div className="flex items-center gap-1.5">
            <Badge
              variant="outline"
              className="text-xs px-2 py-0.5 border-[var(--kvc-ok-line)] text-[var(--kvc-ok-ink)] bg-[var(--kvc-ok-bg)] font-mono font-bold"
            >
              TRACK #{target.track_id ?? 'N/A'}
            </Badge>
            <Badge variant="outline" className="text-xs py-0.5 px-2 font-mono">
              {isLocalGrid ? 'LOCAL_GRID' : 'WGS-84'}
            </Badge>
          </div>
        ) : (
          <Badge variant="outline" className="text-xs px-2 py-0.5 text-muted-foreground font-mono">
            Chưa phát hiện
          </Badge>
        )
      }
    >
      {!has_target || !target ? (
        <div className="py-6 text-center flex flex-col items-center justify-center gap-2 text-muted-foreground">
          <Target className="h-8 w-8 stroke-[1.5] text-muted-foreground/40" />
          <span className="text-sm font-semibold text-foreground">Không có mục tiêu cứu nạn trong tầm nhìn</span>
          <span className="text-xs text-muted-foreground max-w-xs">
            Hệ thống AI đang liên tục rà quét mặt nước tìm kiếm người gặp nạn (Class 1) và tàu thuyền (Class 2)...
          </span>
        </div>
      ) : (
        <div className="flex flex-col gap-3 text-sm">
          {/* 1. Loại đối tượng & Độ tin cậy AI */}
          <div className="flex items-center justify-between p-2.5 rounded-kvc-control bg-muted/40 border border-border/70">
            <div className="flex items-center gap-2.5 min-w-0">
              <div className="p-2 rounded-md bg-card border border-border/80 shrink-0">
                {getTargetIcon(target.class_name)}
              </div>
              <div className="flex flex-col min-w-0">
                <span className="font-bold text-foreground text-sm truncate">
                  {getTargetLabel(target.class_name)}
                </span>
                <span className="text-xs text-muted-foreground font-medium flex items-center gap-1">
                  {target.target_confirmed ? (
                    <span className="text-[var(--kvc-ok-ink)] flex items-center gap-1">
                      <CheckCircle2 className="h-3.5 w-3.5" /> Xác nhận liên tục (≥3 frame)
                    </span>
                  ) : (
                    <span className="text-[var(--kvc-warn-ink)]">Phát hiện sơ bộ (&lt;3 frame)</span>
                  )}
                </span>
              </div>
            </div>
            <div className="flex flex-col items-end shrink-0 pl-2">
              <span className="text-base sm:text-lg font-bold font-mono text-[var(--kvc-accent-ink)]">
                {target.confidence !== null ? `${target.confidence}%` : 'N/A'}
              </span>
              <span className="text-xs text-muted-foreground">Độ tin cậy AI</span>
            </div>
          </div>

          {/* 2. Tọa độ bàn giao cứu nạn (Font 16-18px) */}
          <div className="p-2.5 rounded-kvc-control bg-card border border-border/80 shadow-2xs flex flex-col gap-2">
            <div className="flex items-center justify-between border-b border-border/50 pb-1.5">
              <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
                Tọa độ bàn giao cứu nạn
              </span>
              <div className="flex items-center gap-1.5 text-xs font-mono text-muted-foreground">
                <Clock className="h-3.5 w-3.5" />
                <span className={isAgeStale(rx_age_ms, is_stale) ? 'text-[var(--kvc-warn-ink)] font-bold' : ''}>
                  {rx_age_ms}ms {isAgeStale(rx_age_ms, is_stale) ? '(STALE)' : ''}
                </span>
              </div>
            </div>

            {isLocalGrid ? (
              <div className="grid grid-cols-2 gap-3 pt-1">
                <div className="flex flex-col bg-muted/30 p-2 rounded-md border border-border/40">
                  <span className="text-xs text-muted-foreground">hệ local X (cm):</span>
                  <span className="text-base sm:text-lg font-bold font-mono text-foreground">
                    {target.local_x_cm !== null ? `${target.local_x_cm > 0 ? `+${target.local_x_cm}` : target.local_x_cm} cm` : 'N/A'}
                  </span>
                </div>
                <div className="flex flex-col bg-muted/30 p-2 rounded-md border border-border/40">
                  <span className="text-xs text-muted-foreground">hệ local Y (cm):</span>
                  <span className="text-base sm:text-lg font-bold font-mono text-foreground">
                    {target.local_y_cm !== null ? `${target.local_y_cm > 0 ? `+${target.local_y_cm}` : target.local_y_cm} cm` : 'N/A'}
                  </span>
                </div>
              </div>
            ) : (
              <div className="grid grid-cols-2 gap-3 pt-1">
                <div className="flex flex-col bg-muted/30 p-2 rounded-md border border-border/40 min-w-0">
                  <span className="text-xs text-muted-foreground">Vĩ độ (Lat):</span>
                  <span className="text-base sm:text-lg font-bold font-mono text-foreground truncate" title={String(target.latitude)}>
                    {target.latitude !== null ? `${target.latitude.toFixed(6)}°` : 'N/A'}
                  </span>
                </div>
                <div className="flex flex-col bg-muted/30 p-2 rounded-md border border-border/40 min-w-0">
                  <span className="text-xs text-muted-foreground">Kinh độ (Lon):</span>
                  <span className="text-base sm:text-lg font-bold font-mono text-foreground truncate" title={String(target.longitude)}>
                    {target.longitude !== null ? `${target.longitude.toFixed(6)}°` : 'N/A'}
                  </span>
                </div>
              </div>
            )}
          </div>

          {/* 3. Thao tác chính: Sao chép tọa độ SAR & Đánh dấu sự kiện (Nút chuẩn 36-40px) */}
          <div className="grid grid-cols-2 gap-2 pt-1 border-t border-border/50">
            <Button
              variant="default"
              size="default"
              onClick={handleCopyCoord}
              className="min-h-[36px] h-9 text-xs sm:text-sm font-semibold gap-1.5 bg-primary text-primary-foreground hover:bg-primary/90 shadow-xs cursor-pointer focus-visible:ring-2 focus-visible:ring-primary"
              title={
                target.coordinate_frame === 'LOCAL_GRID'
                  ? 'Sao chép toạ độ LOCAL (cm) — không phải WGS-84'
                  : 'Sao chép cặp toạ độ WGS-84'
              }
              aria-label={
                target.coordinate_frame === 'LOCAL_GRID'
                  ? 'Sao chép Local (cm)'
                  : 'Sao chép WGS-84'
              }
            >
              <Copy className="h-4 w-4" />
              <span>
                {target.coordinate_frame === 'LOCAL_GRID' ? 'Sao chép Local (cm)' : 'Sao chép WGS-84'}
              </span>
            </Button>
            <Button
              variant="secondary"
              size="default"
              onClick={handleSaveEvidence}
              className="min-h-[36px] h-9 text-xs sm:text-sm font-semibold gap-1.5 text-foreground hover:bg-muted border border-border cursor-pointer focus-visible:ring-2 focus-visible:ring-primary"
              title="Đánh dấu mốc sự kiện tọa độ vào nhật ký phiên (lưu trong phiên RAM)"
              aria-label="Đánh dấu sự kiện mục tiêu"
            >
              <BookmarkPlus className="h-4 w-4 text-primary" />
              <span>Đánh dấu sự kiện</span>
            </Button>
          </div>
        </div>
      )}
    </Panel>
  )
}
