import React from 'react'
import type { BoundingBox } from '@/types/telemetry'

interface DetectionOverlayProps {
  boxes: BoundingBox[]
  videoWidth?: number
  videoHeight?: number
  isSynced: boolean
}

export const DetectionOverlay: React.FC<DetectionOverlayProps> = ({
  boxes,
  isSynced,
}) => {
  if (!isSynced || boxes.length === 0) {
    return null
  }

  // Chỉ vẽ BBox khi dữ liệu đồng bộ frame hợp lệ (box.is_synced === true)
  const syncedBoxes = boxes.filter((box) => box.is_synced)
  if (syncedBoxes.length === 0) {
    return null
  }

  return (
    <div className="absolute inset-0 pointer-events-none overflow-hidden z-10">
      {syncedBoxes.map((box) => {
        // Tọa độ chuẩn hóa theo tỷ lệ phần trăm % của khung hình
        const leftPct = `${(box.x * 100).toFixed(2)}%`
        const topPct = `${(box.y * 100).toFixed(2)}%`
        const widthPct = `${(box.width * 100).toFixed(2)}%`
        const heightPct = `${(box.height * 100).toFixed(2)}%`

        return (
          <div
            key={box.id}
            style={{
              left: leftPct,
              top: topPct,
              width: widthPct,
              height: heightPct,
            }}
            className="absolute border-2 border-[var(--kvc-ok)] bg-[var(--kvc-ok-bg)] shadow-[0_0_8px_rgba(16,185,129,0.3)] transition-all duration-150"
          >
            {/* Nhãn đối tượng phía trên góc trái box */}
            <div className="absolute -top-6 left-0 bg-[var(--kvc-ok-fill)] text-[var(--kvc-text-on-fill)] text-[11px] font-mono px-1.5 py-0.5 rounded-t whitespace-nowrap shadow flex items-center gap-1">
              <span>{box.label}</span>
              <span className="font-bold opacity-90">{box.confidence}%</span>
            </div>
            {/* 4 góc nhọn định vị target (Corner brackets) */}
            <div className="absolute top-0 left-0 w-2 h-2 border-t-2 border-l-2 border-[var(--kvc-ok-line)]" />
            <div className="absolute top-0 right-0 w-2 h-2 border-t-2 border-r-2 border-[var(--kvc-ok-line)]" />
            <div className="absolute bottom-0 left-0 w-2 h-2 border-b-2 border-l-2 border-[var(--kvc-ok-line)]" />
            <div className="absolute bottom-0 right-0 w-2 h-2 border-b-2 border-r-2 border-[var(--kvc-ok-line)]" />
          </div>
        )
      })}
    </div>
  )
}
