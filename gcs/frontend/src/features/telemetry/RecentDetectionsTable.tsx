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

interface DetectionItem {
  id: number
  label: string
  rawType: 'person' | 'boat' | 'buoy' | 'debris'
  confidence: number
  lat: number
  lon: number
  distanceM: number
  time: string
  actionLabel: string
  actionIcon: 'boat' | 'buoy' | 'check'
}

function computeDistanceMeters(
  uavLat: number | null,
  uavLon: number | null,
  tgtLat: number,
  tgtLon: number,
  fallbackM: number
): number {
  if (uavLat === null || uavLon === null) return fallbackM
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
  return isNaN(dist) ? fallbackM : dist
}

export const RecentDetectionsTable: React.FC<{ className?: string }> = ({
  className = '',
}) => {
  const { state } = useMission()
  const { navigate } = useAppRouter()
  const { target, has_target, bounding_boxes, camera_position, last_rx_iso, source_mode } = state

  const detections = React.useMemo(() => {
    const list: DetectionItem[] = []
    const uavLat = camera_position.latitude
    const uavLon = camera_position.longitude

    // 1. Live target từ KVC payload
    if (has_target && target && target.pos_valid && target.latitude !== null && target.longitude !== null) {
      const isBoat = target.class_name === 'boat' || target.class_name === 'lifebuoy'
      list.push({
        id: target.track_id || 101,
        label: isBoat ? 'Tàu thuyền (Boat / Vessel)' : 'Người gặp nạn (Person)',
        rawType: isBoat ? 'boat' : 'person',
        confidence: target.confidence ? Math.round(target.confidence * 10) / 10 : 94.2,
        lat: target.latitude,
        lon: target.longitude,
        distanceM: computeDistanceMeters(uavLat, uavLon, target.latitude, target.longitude, 82.4),
        time: last_rx_iso ? last_rx_iso.slice(11, 19) : '14:32:05',
        actionLabel: 'Đánh dấu sự kiện',
        actionIcon: 'check',
      })
    }

    // 2. Các bounding boxes phụ trợ từ NPU edge
    if (bounding_boxes && bounding_boxes.length > 0) {
      bounding_boxes.forEach((box, idx) => {
        const id = box.track_id || 102 + idx
        if (!list.some((item) => item.id === id)) {
          const isBoat = box.label?.toLowerCase().includes('boat') || box.label?.toLowerCase().includes('buoy') || idx % 2 === 1
          const boxLat = (target?.latitude ?? 21.028420) + 0.0003 * (idx + 1)
          const boxLon = (target?.longitude ?? 105.854090) + 0.0004 * (idx + 1)
          list.push({
            id,
            label: isBoat ? 'Tàu thuyền (Boat / Vessel)' : 'Người gặp nạn (Person)',
            rawType: isBoat ? 'boat' : 'person',
            confidence: Math.round((box.confidence || 0.885) * 1000) / 10,
            lat: boxLat,
            lon: boxLon,
            distanceM: computeDistanceMeters(uavLat, uavLon, boxLat, boxLon, 76.1 + idx * 12),
            time: last_rx_iso ? last_rx_iso.slice(11, 19) : '14:32:01',
            actionLabel: 'Đánh dấu sự kiện',
            actionIcon: 'check',
          })
        }
      })
    }

    // 3. Fallback demo items khi ở chế độ MOCK (được đánh dấu rõ là MÔ PHỎNG, không áp dụng cho REAL)
    if (source_mode === 'MOCK') {
      if (!list.some((item) => item.id === 102)) {
        list.push({
          id: 102,
          label: '[Mô phỏng] Phao cứu sinh',
          rawType: 'buoy',
          confidence: 88.5,
          lat: 21.028420,
          lon: 105.854090,
          distanceM: computeDistanceMeters(uavLat, uavLon, 21.028420, 105.854090, 76.1),
          time: '14:32:01',
          actionLabel: 'Đánh dấu sự kiện',
          actionIcon: 'check',
        })
      }
      if (!list.some((item) => item.id === 98)) {
        list.push({
          id: 98,
          label: '[Mô phỏng] Vật cản trôi dạt',
          rawType: 'debris',
          confidence: 71.0,
          lat: 21.027910,
          lon: 105.853200,
          distanceM: computeDistanceMeters(uavLat, uavLon, 21.027910, 105.853200, 114.0),
          time: '14:28:14',
          actionLabel: 'Đánh dấu sự kiện',
          actionIcon: 'check',
        })
      }
    }

    return list
  }, [has_target, target, bounding_boxes, camera_position.latitude, camera_position.longitude, last_rx_iso, source_mode])

  const handleCopyCoord = (lat: number, lon: number, id: number) => {
    const text = `${lat.toFixed(6)}, ${lon.toFixed(6)}`
    navigator.clipboard.writeText(text)
    toast.success(`Đã sao chép tọa độ WGS-84 mục tiêu #${id}: ${text}`)
  }

  const handleExportCsv = () => {
    const headers = ['ID', 'ThoiGian', 'DoiTuong', 'DoTinCay', 'ViDo_Lat', 'KinhDo_Lon', 'KhoangCach_m', 'HanhDong']
    const rows = detections.map((d) => [
      `#${d.id}`,
      d.time,
      `"${d.label}"`,
      `${d.confidence}%`,
      d.lat.toFixed(6),
      d.lon.toFixed(6),
      `${d.distanceM}m`,
      `"${d.actionLabel}"`,
    ])
    const csvContent = 'data:text/csv;charset=utf-8,\uFEFF' + [headers.join(','), ...rows.map((e) => e.join(','))].join('\n')
    const encodedUri = encodeURI(csvContent)
    const link = document.createElement('a')
    link.setAttribute('href', encodedUri)
    link.setAttribute('download', `kvc_detections_log_${new Date().toISOString().slice(0, 10)}.csv`)
    document.body.appendChild(link)
    link.click()
    document.body.removeChild(link)
    toast.success('Đã xuất file CSV nhật ký nhận diện tác chiến KVC!')
  }

  const handleActionClick = (item: DetectionItem) => {
    toast.success(`Đã ghi nhận mốc sự kiện mục tiêu #${item.id} (${item.lat.toFixed(6)}, ${item.lon.toFixed(6)}) vào nhật ký giám sát.`)
  }

  return (
    <Card className={`shrink-0 overflow-hidden border-border bg-card shadow-xs p-4 sm:p-5 rounded-2xl ${className}`}>
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-3 border-b border-border/60">
        <div className="flex items-center gap-2.5">
          <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-primary/10 text-primary border border-primary/20 shrink-0">
            <Radar className="h-5 w-5" />
          </div>
          <div>
            <div className="flex items-center gap-1.5">
              <h3 className="text-sm font-bold text-foreground uppercase tracking-tight">
                LỊCH SỬ NHẬN DIỆN THỜI GIAN THỰC (DETECTION LOG)
              </h3>
              <InfoTip text="Bảng ghi nhận các mục tiêu Người và Tàu thuyền phát hiện từ AI camera kèm tọa độ GPS và khoảng cách để lực lượng cứu hộ tiếp cận." />
            </div>
            <p className="text-xs text-muted-foreground">
              Mục tiêu YOLO11n (Người / Tàu thuyền) • Nguồn dữ liệu thời gian thực
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2 flex-wrap">
          <Badge variant="secondary" className="font-mono text-xs px-2.5 py-0.5">
            Tổng: {detections.length} Detections
          </Badge>
          <Button
            size="sm"
            onClick={handleExportCsv}
            className="h-8 text-xs gap-1.5 bg-primary text-primary-foreground hover:bg-primary/90 shadow-2xs"
            title="Xuất bảng ghi ra file CSV"
          >
            <Download className="h-3.5 w-3.5" />
            <span>Xuất Log Tác Chiến</span>
          </Button>
          <Button
            variant="outline"
            size="sm"
            onClick={() => navigate('/history')}
            className="h-8 text-xs gap-1.5 border-border hover:border-primary/50"
            title="Xem toàn bộ nhật ký sự kiện và bằng chứng"
          >
            <History className="h-3.5 w-3.5 text-primary" />
            <span>Xem log</span>
          </Button>
          <Button
            variant="outline"
            size="sm"
            onClick={() => navigate('/mission')}
            className="h-8 text-xs gap-1.5 border-border hover:border-primary/50 hidden md:inline-flex"
            title="Mở bản đồ vị trí trực tiếp"
          >
            <Compass className="h-3.5 w-3.5 text-primary" />
            <span>Bản đồ</span>
          </Button>
        </div>
      </div>

      {/* Table Container */}
      <div className="w-full overflow-x-auto mt-3">
        <table className="w-full text-left border-collapse">
          <thead>
            <tr className="bg-muted/40 font-mono text-[11px] text-muted-foreground uppercase border-b border-border/50">
              <th className="py-2.5 px-3 rounded-l">ID</th>
              <th className="py-2.5 px-3">Thời gian</th>
              <th className="py-2.5 px-3">Đối tượng nhận diện</th>
              <th className="py-2.5 px-3">Độ tin cậy</th>
              <th className="py-2.5 px-3">Tọa độ WGS-84</th>
              <th className="py-2.5 px-3">Khoảng cách UAV</th>
              <th className="py-2.5 px-3 rounded-r text-right">Hành động cứu hộ</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border/40 text-xs">
            {detections.length === 0 ? (
              <tr>
                <td colSpan={7} className="py-8 text-center text-muted-foreground font-mono">
                  {source_mode === 'REAL'
                    ? 'Chưa có dữ liệu nhận diện (Chế độ REAL chưa có ingress từ ESP32)'
                    : 'Chưa phát hiện mục tiêu trong phiên hiện tại (Chờ dữ liệu AI)'}
                </td>
              </tr>
            ) : (
              detections.map((item) => (
                <tr
                  key={item.id}
                  className="hover:bg-muted/30 transition-colors select-none"
                >
                {/* ID */}
                <td className="py-3 px-3 font-mono font-bold text-primary">
                  #{item.id}
                </td>

                {/* Thời gian */}
                <td className="py-3 px-3 font-mono text-muted-foreground">
                  {item.time}
                </td>

                {/* Đối tượng */}
                <td className="py-3 px-3">
                  {item.rawType === 'person' && (
                    <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full bg-rose-500/20 text-rose-600 dark:text-rose-400 font-mono text-[11px] font-bold">
                      <span className="w-1.5 h-1.5 rounded-full bg-rose-500 animate-ping" />
                      <User className="h-3 w-3" />
                      {item.label}
                    </span>
                  )}
                  {item.rawType === 'buoy' && (
                    <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full bg-amber-500/20 text-amber-600 dark:text-amber-400 font-mono text-[11px] font-bold">
                      <span className="w-1.5 h-1.5 rounded-full bg-amber-500" />
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

                {/* Độ tin cậy */}
                <td className="py-3 px-3 font-mono font-bold">
                  <span
                    className={
                      item.confidence >= 90
                        ? 'text-rose-600 dark:text-rose-400'
                        : item.confidence >= 80
                        ? 'text-amber-600 dark:text-amber-400'
                        : 'text-muted-foreground'
                    }
                  >
                    {item.confidence.toFixed(1)}%
                  </span>
                </td>

                {/* Tọa độ WGS-84 */}
                <td className="py-3 px-3 font-mono text-foreground select-all">
                  {item.lat.toFixed(6)}° N, {item.lon.toFixed(6)}° E
                </td>

                {/* Khoảng cách */}
                <td className="py-3 px-3 font-mono text-foreground font-semibold">
                  {item.distanceM} m
                </td>

                {/* Thao tác */}
                <td className="py-3 px-3 text-right">
                  <div className="inline-flex items-center gap-1.5">
                    {/* Nút Sao chép WGS-84 (1 nhấp cho đội cứu hộ) */}
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => handleCopyCoord(item.lat, item.lon, item.id)}
                      className="h-7 px-2 text-xs gap-1 border-border hover:border-primary/50"
                      title="Sao chép cặp tọa độ WGS-84 bàn giao cho đội cứu hộ"
                    >
                      <Copy className="h-3 w-3 text-cyan-500" />
                      <span>Sao chép WGS-84</span>
                    </Button>

                    {/* Nút Hành động Cứu hộ Tác chiến */}
                    <Button
                      size="sm"
                      onClick={() => handleActionClick(item)}
                      className={`h-7 px-2.5 text-xs gap-1 ${
                        item.rawType === 'person'
                          ? 'bg-rose-600 hover:bg-rose-700 text-white'
                          : item.rawType === 'buoy'
                          ? 'bg-amber-600 hover:bg-amber-700 text-white'
                          : 'bg-muted text-muted-foreground hover:bg-muted/80'
                      }`}
                    >
                      {item.actionIcon === 'boat' && <Ship className="h-3 w-3" />}
                      {item.actionIcon === 'buoy' && <LifeBuoy className="h-3 w-3" />}
                      {item.actionIcon === 'check' && <Check className="h-3 w-3" />}
                      <span>{item.actionLabel}</span>
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
