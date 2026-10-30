import React from 'react'
import {
  Check,
  Compass,
  Copy,
  Download,
  History,
  LifeBuoy,
  Radar,
  Ship,
  User,
} from 'lucide-react'
import { toast } from 'sonner'
import { useAppRouter } from '@/app/routes'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { InfoTip } from '@/components/shared/InfoTip'
import { useMission } from '@/state/MissionProvider'
import type { CoordinateFrame } from '@/types/telemetry'

interface DetectionItem {
  key: string
  id: string
  label: string
  rawType: 'person' | 'boat' | 'buoy' | 'debris'
  confidence: number | null
  lat: number | null
  lon: number | null
  localX: number | null
  localY: number | null
  frame: CoordinateFrame | 'NONE'
  distanceM: number | null
  time: string | null
  simulated: boolean
  actionIcon: 'boat' | 'buoy' | 'check'
}

function computeDistanceMeters(
  uavLat: number | null,
  uavLon: number | null,
  tgtLat: number | null,
  tgtLon: number | null
): number | null {
  if (uavLat === null || uavLon === null || tgtLat === null || tgtLon === null) return null
  const R = 6371e3
  const dLat = ((tgtLat - uavLat) * Math.PI) / 180
  const dLon = ((tgtLon - uavLon) * Math.PI) / 180
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos((uavLat * Math.PI) / 180) *
      Math.cos((tgtLat * Math.PI) / 180) *
      Math.sin(dLon / 2) *
      Math.sin(dLon / 2)
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a))
  const dist = Math.round(R * c * 10) / 10
  return Number.isFinite(dist) ? dist : null
}

function formatFrame(frame: DetectionItem['frame']): string {
  if (frame === 'WGS84') return 'WGS-84'
  if (frame === 'LOCAL_GRID') return 'LOCAL (cm)'
  return 'Không có'
}

function formatPosition(item: DetectionItem): string {
  if (item.frame === 'WGS84' && item.lat !== null && item.lon !== null) {
    return `${item.lat.toFixed(6)}°, ${item.lon.toFixed(6)}°`
  }
  if (item.frame === 'LOCAL_GRID' && item.localX !== null && item.localY !== null) {
    return `X=${item.localX.toFixed(0)} cm, Y=${item.localY.toFixed(0)} cm`
  }
  return 'N/A'
}

function positionPayload(item: DetectionItem): string | null {
  if (item.frame === 'WGS84' && item.lat !== null && item.lon !== null) {
    return `WGS-84 ${item.lat.toFixed(6)}, ${item.lon.toFixed(6)}`
  }
  if (item.frame === 'LOCAL_GRID' && item.localX !== null && item.localY !== null) {
    return `LOCAL_GRID (cm) X=${item.localX.toFixed(0)}, Y=${item.localY.toFixed(0)}`
  }
  return null
}

function classLabel(rawType: DetectionItem['rawType']): string {
  if (rawType === 'person') return 'Người gặp nạn (Person)'
  if (rawType === 'buoy') return 'Phao cứu sinh (Lifebuoy)'
  if (rawType === 'boat') return 'Tàu thuyền (Boat / Vessel)'
  return 'Vật trôi dạt'
}

export const RecentDetectionsTable: React.FC<{ className?: string }> = ({
  className = '',
}) => {
  const { state } = useMission()
  const { navigate } = useAppRouter()
  const { target, has_target, bounding_boxes, camera_position, last_rx_iso, source_mode } = state

  const detections = React.useMemo<DetectionItem[]>(() => {
    const list: DetectionItem[] = []
    const uavLat = camera_position.latitude
    const uavLon = camera_position.longitude
    const timestamp = last_rx_iso ? last_rx_iso.slice(11, 19) : null

    if (has_target && target) {
      const isBoat = target.class_name === 'boat' || target.class_name === 'lifebuoy'
      const frame: DetectionItem['frame'] = target.pos_valid ? target.coordinate_frame : 'NONE'
      const lat = frame === 'WGS84' ? target.latitude : null
      const lon = frame === 'WGS84' ? target.longitude : null
      const localX = frame === 'LOCAL_GRID' ? target.local_x_cm : null
      const localY = frame === 'LOCAL_GRID' ? target.local_y_cm : null

      list.push({
        key: `target-${target.track_id ?? 'live'}`,
        id: target.track_id !== null ? `#${target.track_id}` : 'N/A',
        label: classLabel(isBoat ? 'boat' : 'person'),
        rawType: isBoat ? 'boat' : 'person',
        confidence: target.confidence ?? null,
        lat,
        lon,
        localX,
        localY,
        frame,
        distanceM: computeDistanceMeters(uavLat, uavLon, lat, lon),
        time: timestamp,
        simulated: source_mode === 'MOCK',
        actionIcon: 'check',
      })
    }

    return list
  }, [has_target, target, camera_position.latitude, camera_position.longitude, last_rx_iso, source_mode])

  const boxesWithoutGeo = React.useMemo(() => {
    if (!bounding_boxes || bounding_boxes.length === 0) return 0
    return bounding_boxes.filter((box) => {
      if (!has_target || !target || !target.pos_valid) return true
      if (target.track_id !== null && box.track_id === target.track_id) return false
      return true
    }).length
  }, [bounding_boxes, has_target, target])

  const handleCopyCoord = (item: DetectionItem) => {
    const payload = positionPayload(item)
    if (!payload) {
      toast.error('Mục tiêu chưa có vị trí hợp lệ — không thể sao chép.')
      return
    }
    navigator.clipboard.writeText(payload)
    toast.success(`Đã sao chép toạ độ ${formatFrame(item.frame)} mục tiêu ${item.id}: ${payload}`)
  }

  const handleExportCsv = () => {
    const headers = [
      'ID',
      'ThoiGian',
      'DoiTuong',
      'DoTinCay_pct',
      'HeToaDo',
      'ViDo_Lat',
      'KinhDo_Lon',
      'Local_X_cm',
      'Local_Y_cm',
      'KhoangCach_m',
      'Nguon',
      'MoPhong',
    ]
    const rows = detections.map((d) => [
      d.id,
      d.time ?? 'N/A',
      `"${d.label}"`,
      d.confidence !== null ? `${d.confidence.toFixed(1)}` : 'N/A',
      formatFrame(d.frame),
      d.lat !== null ? d.lat.toFixed(6) : 'N/A',
      d.lon !== null ? d.lon.toFixed(6) : 'N/A',
      d.localX !== null ? d.localX.toFixed(0) : 'N/A',
      d.localY !== null ? d.localY.toFixed(0) : 'N/A',
      d.distanceM !== null ? `${d.distanceM}` : 'N/A',
      source_mode,
      d.simulated ? 'CO' : 'KHONG',
    ])
    const csvContent =
      'data:text/csv;charset=utf-8,\uFEFF' +
      [headers.join(','), ...rows.map((e) => e.join(','))].join('\n')
    const encodedUri = encodeURI(csvContent)
    const link = document.createElement('a')
    link.setAttribute('href', encodedUri)
    link.setAttribute('download', `kvc_detections_log_${new Date().toISOString().slice(0, 10)}.csv`)
    document.body.appendChild(link)
    link.click()
    document.body.removeChild(link)
    toast.success('Đã xuất CSV nhật ký nhận diện (kèm hệ toạ độ và nguồn dữ liệu).')
  }

  const handleActionClick = (item: DetectionItem) => {
    const payload = positionPayload(item)
    if (!payload) {
      toast.error(`Mục tiêu ${item.id} chưa có vị trí hợp lệ — chưa thể ghi mốc.`)
      return
    }
    toast.success(`Đã ghi nhận mốc ${payload} cho mục tiêu ${item.id}.`)
  }

  return (
    <Card className={`shrink-0 overflow-hidden border-border bg-card shadow-xs p-4 sm:p-5 rounded-kvc-panel ${className}`}>
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-3 border-b border-border/60">
        <div className="flex items-center gap-2.5">
          <div className="flex h-9 w-9 items-center justify-center rounded-kvc-panel bg-[var(--kvc-accent-bg)] text-[var(--kvc-accent-ink)] border border-[var(--kvc-accent-line)] shrink-0">
            <Radar className="h-5 w-5" />
          </div>
          <div>
            <div className="flex items-center gap-1.5">
              <h3 className="text-sm font-bold text-foreground uppercase tracking-tight">
                LỊCH SỬ NHẬN DIỆN THỜI GIAN THỰC (DETECTION LOG)
              </h3>
              <InfoTip text="Bảng ghi nhận mục tiêu từ payload hiện hành. Chỉ hiển thị toạ độ khi mục tiêu có vị trí hợp lệ; trường thiếu hiển thị N/A, không suy diễn." />
            </div>
            <p className="text-xs text-muted-foreground">
              Mục tiêu YOLO11n (Người / Phao / Tàu) • Chỉ số thiếu hiển thị N/A
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2 flex-wrap">
          <Badge variant="secondary" className="font-mono text-xs px-2.5 py-0.5">
            Tổng: {detections.length} mục tiêu
          </Badge>
          <Button
            size="sm"
            onClick={handleExportCsv}
            className="h-8 text-xs gap-1.5 bg-primary text-primary-foreground hover:bg-primary/90"
            title="Xuất bảng ghi ra file CSV"
          >
            <Download className="h-3.5 w-3.5" />
            <span>Xuất CSV</span>
          </Button>
          <Button
            variant="outline"
            size="sm"
            onClick={() => navigate('/history')}
            className="h-8 text-xs gap-1.5 border-border hover:border-[var(--kvc-accent-line)]"
            title="Xem toàn bộ nhật ký sự kiện và bằng chứng"
          >
            <History className="h-3.5 w-3.5 text-[var(--kvc-accent-ink)]" />
            <span>Xem log</span>
          </Button>
          <Button
            variant="outline"
            size="sm"
            onClick={() => navigate('/mission')}
            className="h-8 text-xs gap-1.5 border-border hover:border-[var(--kvc-accent-line)] hidden md:inline-flex"
            title="Mở bản đồ vị trí trực tiếp"
          >
            <Compass className="h-3.5 w-3.5 text-[var(--kvc-accent-ink)]" />
            <span>Bản đồ</span>
          </Button>
        </div>
      </div>

      {boxesWithoutGeo > 0 && (
        <p className="mt-3 text-[11px] font-mono text-muted-foreground">
          {boxesWithoutGeo} khung phát hiện không kèm toạ độ địa lý — không hiển thị như mục tiêu.
        </p>
      )}

      <div className="w-full overflow-x-auto mt-3">
        <table className="w-full text-left border-collapse">
          <thead>
            <tr className="bg-muted/40 font-mono text-[11px] text-muted-foreground uppercase border-b border-border/50">
              <th className="py-2.5 px-3 rounded-l">ID</th>
              <th className="py-2.5 px-3">Thời gian</th>
              <th className="py-2.5 px-3">Đối tượng nhận diện</th>
              <th className="py-2.5 px-3">Độ tin cậy</th>
              <th className="py-2.5 px-3">Vị trí</th>
              <th className="py-2.5 px-3">Khoảng cách UAV</th>
              <th className="py-2.5 px-3 rounded-r text-right">Hành động</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border/40 text-xs">
            {detections.length === 0 ? (
              <tr>
                <td colSpan={7} className="py-8 text-center text-muted-foreground font-mono">
                  {source_mode === 'REAL'
                    ? 'Chưa có mục tiêu trong phiên hiện tại (chưa có ingress REAL từ ESP32)'
                    : 'Chưa có mục tiêu trong phiên hiện tại (chờ dữ liệu AI)'}
                </td>
              </tr>
            ) : (
              detections.map((item) => (
                <tr key={item.key} className="hover:bg-muted/30 transition-colors select-none">
                  <td className="py-3 px-3 font-mono font-bold text-[var(--kvc-accent-ink)]">
                    {item.id}
                    {item.simulated && (
                      <span className="ml-1.5 text-[11px] font-normal text-muted-foreground">MÔ PHỎNG</span>
                    )}
                  </td>

                  <td className="py-3 px-3 font-mono text-muted-foreground">
                    {item.time ?? 'N/A'}
                  </td>

                  <td className="py-3 px-3">
                    {item.rawType === 'person' && (
                      <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full bg-[var(--kvc-crit-bg)] text-[var(--kvc-crit-ink)] font-mono text-[11px] font-bold">
                        <span className="w-1.5 h-1.5 rounded-full bg-[var(--kvc-crit)]" />
                        <User className="h-3 w-3" />
                        {item.label}
                      </span>
                    )}
                    {(item.rawType === 'buoy' || item.rawType === 'boat') && (
                      <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full bg-[var(--kvc-warn-bg)] text-[var(--kvc-warn-ink)] font-mono text-[11px] font-bold">
                        <span className="w-1.5 h-1.5 rounded-full bg-[var(--kvc-warn)]" />
                        <LifeBuoy className="h-3 w-3" />
                        {item.label}
                      </span>
                    )}
                    {item.rawType === 'debris' && (
                      <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full bg-muted text-muted-foreground font-mono text-[11px]">
                        <span className="w-1.5 h-1.5 rounded-full bg-muted-foreground" />
                        {item.label}
                      </span>
                    )}
                  </td>

                  <td className="py-3 px-3 font-mono font-bold tabular-nums">
                    {item.confidence !== null ? (
                      <span
                        className={
                          item.confidence >= 90
                            ? 'text-[var(--kvc-crit-ink)]'
                            : item.confidence >= 80
                            ? 'text-[var(--kvc-warn-ink)]'
                            : 'text-muted-foreground'
                        }
                      >
                        {item.confidence.toFixed(1)}%
                      </span>
                    ) : (
                      <span className="text-muted-foreground">N/A</span>
                    )}
                  </td>

                  <td className="py-3 px-3 font-mono text-foreground select-all tabular-nums">
                    <div>{formatPosition(item)}</div>
                    <div className="text-[11px] text-muted-foreground">{formatFrame(item.frame)}</div>
                  </td>

                  <td className="py-3 px-3 font-mono text-foreground font-semibold tabular-nums">
                    {item.distanceM !== null ? `${item.distanceM} m` : <span className="text-muted-foreground">N/A</span>}
                  </td>

                  <td className="py-3 px-3 text-right">
                    <div className="inline-flex items-center gap-1.5">
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => handleCopyCoord(item)}
                        disabled={positionPayload(item) === null}
                        className="h-7 px-2 text-xs gap-1 border-border hover:border-[var(--kvc-accent-line)]"
                        title={
                          item.frame === 'LOCAL_GRID'
                            ? 'Sao chép toạ độ LOCAL (cm) — không phải WGS-84'
                            : item.frame === 'WGS84'
                            ? 'Sao chép cặp toạ độ WGS-84'
                            : 'Mục tiêu chưa có vị trí hợp lệ'
                        }
                      >
                        <Copy className="h-3 w-3 text-[var(--kvc-accent-ink)]" />
                        <span>
                          {item.frame === 'LOCAL_GRID'
                            ? 'Sao chép Local (cm)'
                            : item.frame === 'WGS84'
                            ? 'Sao chép WGS-84'
                            : 'Không có vị trí'}
                        </span>
                      </Button>

                      <Button
                        size="sm"
                        onClick={() => handleActionClick(item)}
                        disabled={positionPayload(item) === null}
                        className={`h-7 px-2.5 text-xs gap-1 ${
                          item.rawType === 'person'
                            ? 'bg-[var(--kvc-crit-fill)] hover:bg-[var(--kvc-crit-fill)]/90 text-[var(--kvc-text-on-fill)]'
                            : item.rawType === 'buoy' || item.rawType === 'boat'
                            ? 'bg-[var(--kvc-warn-fill)] hover:bg-[var(--kvc-warn-fill)]/90 text-[var(--kvc-text-on-fill)]'
                            : 'bg-muted text-muted-foreground hover:bg-muted/80'
                        }`}
                      >
                        {item.actionIcon === 'boat' && <Ship className="h-3 w-3" />}
                        {item.actionIcon === 'buoy' && <LifeBuoy className="h-3 w-3" />}
                        {item.actionIcon === 'check' && <Check className="h-3 w-3" />}
                        <span>Ghi mốc</span>
                      </Button>
                    </div>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </Card>
  )
}
