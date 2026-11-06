import React, { useState } from 'react'
import { ChevronDown, ChevronUp, WifiOff } from 'lucide-react'
import type { CameraPosition } from '@/types/telemetry'
import { formatCoordinates, formatTimeAgo } from './positionUtils'

/**
 * Cảnh báo mất khoá GNSS của bản đồ.
 *
 * Trước đây khối này nằm `absolute top-14 left-1/2` bên trong Map2DView, trùng
 * đúng hàng của dải cảnh báo CRITICAL trong MissionPage nên hai lớp đè nhau khi
 * vừa mất GNSS vừa có cảnh báo. Nay MissionPage bố trí nó trong overlay rail
 * (hàng banner), còn component này chỉ giữ nội dung và trạng thái thu gọn.
 */
export const MapGnssBanner: React.FC<{ cameraPosition: CameraPosition }> = ({
  cameraPosition,
}) => {
  const [isCollapsed, setIsCollapsed] = useState(true)

  if (isCollapsed) {
    return (
      <button
        type="button"
        data-overlay="gnss-banner"
        onClick={() => setIsCollapsed(false)}
        className="flex items-center gap-1.5 px-3.5 py-1.5 rounded-full bg-amber-600 text-white font-bold border-2 border-amber-700 dark:border-amber-400 shadow-md hover:bg-amber-700 transition-all text-xs cursor-pointer select-none"
        title="Nhấp để xem chi tiết cảnh báo mất khóa GNSS"
        aria-label="Xem chi tiết cảnh báo mất khóa GNSS"
      >
        <WifiOff className="h-3.5 w-3.5 text-white shrink-0 stroke-[2.5]" />
        <span className="font-bold tracking-tight">Mất Khóa Vệ Tinh (GNSS)</span>
        <span className="text-[11px] font-semibold text-amber-100 hidden sm:inline">
          • Giữ vị trí cuối
        </span>
        <ChevronDown className="h-3.5 w-3.5 text-white ml-0.5 shrink-0 stroke-[2.5]" />
      </button>
    )
  }

  return (
    <div
      data-overlay="gnss-banner"
      className="kvc-on-overlay w-full max-w-sm bg-card border-2 border-amber-600 dark:border-amber-500 p-3.5 rounded-kvc-panel shadow-xl text-center relative text-foreground select-none"
    >
      <button
        type="button"
        onClick={() => setIsCollapsed(true)}
        className="absolute top-2 right-2 text-muted-foreground hover:text-foreground p-1 rounded-kvc-control hover:bg-muted cursor-pointer"
        title="Thu nhỏ cảnh báo để xem bản đồ"
        aria-label="Thu nhỏ cảnh báo GNSS"
      >
        <ChevronUp className="h-4 w-4" />
      </button>
      <div className="flex items-center justify-center gap-1.5 mb-1.5 text-amber-600 dark:text-amber-400">
        <WifiOff className="h-5 w-5 stroke-[2.5]" />
        <h4 className="text-xs font-bold uppercase tracking-wide">
          Mất Khóa Vệ Tinh (GNSS)
        </h4>
      </div>
      <p className="text-[11px] text-muted-foreground mb-2 font-medium">
        {cameraPosition.last_updated_iso
          ? `Vị trí cuối nhận: ${formatCoordinates(cameraPosition.latitude, cameraPosition.longitude)} (${formatTimeAgo(cameraPosition.last_updated_iso)})`
          : 'Chưa nhận được gói tin tọa độ hợp lệ từ tải nhiệm vụ.'}
      </p>
      <div className="text-[11px] text-amber-900 dark:text-amber-200 font-bold bg-amber-500/20 py-1.5 px-2.5 rounded-md border border-amber-500/40">
        Vị trí marker làm mờ để tránh nhầm lẫn với dữ liệu trực tiếp.
      </div>
    </div>
  )
}
