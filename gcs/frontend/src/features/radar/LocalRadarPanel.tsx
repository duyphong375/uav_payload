import React, { useEffect, useMemo, useState } from 'react'
import {
  AlertTriangle,
  Compass,
  MapPin,
  Radio,
  RotateCcw,
  Ruler,
  ZoomIn,
  ZoomOut,
} from 'lucide-react'
import { Panel } from '@/components/shared/Panel'
import { StatusBadge } from '@/components/shared/StatusBadge'
import { Button } from '@/components/ui/button'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'
import { useMission } from '@/state/MissionProvider'
import { isAgeStale, staleLabel } from '@/lib/stale'
import { useHeightTier } from '@/lib/viewport'

export interface LocalRadarPanelProps {
  onSwitchToMap?: () => void
  className?: string
  hideHeader?: boolean
}

export const LocalRadarPanel: React.FC<LocalRadarPanelProps> = ({
  onSwitchToMap,
  className = '',
  hideHeader = false,
}) => {
  const { state } = useMission()
  const { target, is_stale, ws_connected, source_mode } = state

  const isLocalGrid = target?.coordinate_frame === 'LOCAL_GRID'
  const hasLocalCoord =
    Boolean(target?.pos_valid) &&
    target?.local_x_cm !== null &&
    target?.local_y_cm !== null &&
    target?.local_x_cm !== undefined &&
    target?.local_y_cm !== undefined &&
    !isNaN(target.local_x_cm) &&
    !isNaN(target.local_y_cm)

  const targetX = target?.local_x_cm ?? 0
  const targetY = target?.local_y_cm ?? 0

  // Khoảng cách từ gốc O(0,0) tới mục tiêu (cm)
  const polarDistanceCm = useMemo(() => {
    if (!hasLocalCoord) return 0
    return Math.sqrt(targetX * targetX + targetY * targetY)
  }, [hasLocalCoord, targetX, targetY])

  // Góc phương vị từ gốc O(0,0) (độ: 0° = Bắc (+Y), 90° = Đông (+X))
  const polarAzimuthDeg = useMemo(() => {
    if (!hasLocalCoord) return 0
    const rad = Math.atan2(targetX, targetY)
    const deg = (rad * 180) / Math.PI
    return deg >= 0 ? deg : deg + 360
  }, [hasLocalCoord, targetX, targetY])

  // Thang đo bán kính tối đa của local (cm) - mặc định 200cm (tự động mở rộng khi mục tiêu ở xa)
  const [maxRadiusCm, setMaxRadiusCm] = useState<number>(200)

  // Màn hình thấp: bảng số đo nổi chiếm 272 px ngang và ~100 px dọc trên radar
  // vốn đã bị dock + controls chiếm đáy. Mặc định thu nó thành nút để trả lại
  // diện tích cho vòng radar; người dùng vẫn mở lại được.
  const heightTier = useHeightTier()
  const [showMeasurements, setShowMeasurements] = useState<boolean>(() => heightTier === 'regular')

  // Tự động mở rộng thang đo nếu mục tiêu nằm ngoài bán kính hiện tại
  useEffect(() => {
    if (hasLocalCoord && polarDistanceCm > 0) {
      if (polarDistanceCm > maxRadiusCm) {
        const needed = Math.min(800, Math.ceil((polarDistanceCm + 40) / 50) * 50)
        setMaxRadiusCm(needed)
      }
    }
  }, [hasLocalCoord, polarDistanceCm, maxRadiusCm])

  // Lắng nghe sự kiện toàn cục đặt lại khung nhìn
  useEffect(() => {
    const handleReset = () => {
      setMaxRadiusCm(polarDistanceCm > 200 ? Math.ceil((polarDistanceCm + 40) / 50) * 50 : 200)
    }
    window.addEventListener('kvc-radar-reset-view', handleReset)
    return () => {
      window.removeEventListener('kvc-radar-reset-view', handleReset)
    }
  }, [polarDistanceCm])

  // Kích thước SVG chuẩn (viewBox 360x360, tâm 180, 180)
  const SVG_SIZE = 360
  const CENTER = 180
  const PADDING = 28
  const USABLE_RADIUS = CENTER - PADDING
  const SCALE = USABLE_RADIUS / maxRadiusCm // Pixel trên mỗi cm

  // Chuyển hệ tọa độ hệ local (+X sang Đông/phải, +Y sang Bắc/trên) sang SVG (+X sang phải, +Y xuống dưới)
  const svgTargetX = CENTER + targetX * SCALE
  const svgTargetY = CENTER - targetY * SCALE

  // Tạo các vòng cự ly tương ứng theo thang đo
  const rings = useMemo(() => {
    const step = maxRadiusCm / 4
    return [step, step * 2, step * 3, maxRadiusCm]
  }, [maxRadiusCm])

  const handleZoomIn = () => {
    setMaxRadiusCm((prev) => Math.max(50, prev - 50))
  }

  const handleZoomOut = () => {
    setMaxRadiusCm((prev) => Math.min(600, prev + 50))
  }

  const handleResetZoom = () => {
    setMaxRadiusCm(polarDistanceCm > 200 ? Math.ceil((polarDistanceCm + 40) / 50) * 50 : 200)
  }

  // Tình trạng dữ liệu cũ
  const targetAgeMs = target?.age_ms
  const isDataStale = !ws_connected || isAgeStale(targetAgeMs, is_stale)

  const radarSvgBody = (
    <div className={`relative w-full h-full min-h-[300px] flex-1 flex flex-col items-center justify-center bg-[var(--kvc-surface)] p-2 overflow-hidden ${hideHeader ? className : ''}`}>
      {hideHeader && <span className="sr-only">Hệ Local Radar Cục Bộ (Local Grid)</span>}

      {/* Cụm điều khiển Zoom và Bảng số đo gom chung trong 1 flex column nổi để không bao giờ đè lên nhau */}
      {hideHeader && (
        <div className="absolute top-14 right-3 z-[var(--kvc-z-panel)] flex flex-col items-end gap-1.5 pointer-events-auto">
          <div className="flex items-center gap-1.5 p-1 rounded-kvc-panel bg-[var(--kvc-surface-2)] border border-[var(--kvc-line-strong)] shadow-xs text-[var(--kvc-text)]">
            <StatusBadge
              label={
                !ws_connected && source_mode !== 'MOCK'
                  ? 'MẤT KẾT NỐI'
                  : hasLocalCoord
                  ? isDataStale
                    ? staleLabel()
                    : 'KHÓA MỤC TIÊU'
                  : isLocalGrid
                  ? 'TÌM KIẾM MỤC TIÊU'
                  : 'WGS-84 ACTIVE'
              }
              variant={
                !ws_connected && source_mode !== 'MOCK'
                  ? 'crit'
                  : hasLocalCoord
                  ? isDataStale
                    ? 'warn'
                    : 'ok'
                  : isLocalGrid
                  ? 'accent'
                  : 'neutral'
              }
            />
            <div className="flex items-center bg-[var(--kvc-surface-2)]/40 p-0.5 rounded-kvc-control border border-[var(--kvc-line)]">
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button
                    variant="ghost"
                    size="icon"
                    onClick={handleZoomIn}
                    className="h-6 w-6 text-[var(--kvc-text-muted)] hover:text-[var(--kvc-text)]"
                    aria-label="Phóng to local"
                    disabled={maxRadiusCm <= 50}
                  >
                    <ZoomIn className="h-3.5 w-3.5" />
                  </Button>
                </TooltipTrigger>
                <TooltipContent>
                  <p className="text-xs">Phóng to local (-50cm)</p>
                </TooltipContent>
              </Tooltip>

              <span className="text-[11px] font-mono px-1.5 text-[var(--kvc-text)] font-semibold min-w-[48px] text-center">
                {maxRadiusCm}cm
              </span>

              <Tooltip>
                <TooltipTrigger asChild>
                  <Button
                    variant="ghost"
                    size="icon"
                    onClick={handleZoomOut}
                    className="h-6 w-6 text-[var(--kvc-text-muted)] hover:text-[var(--kvc-text)]"
                    aria-label="Thu nhỏ local"
                    disabled={maxRadiusCm >= 600}
                  >
                    <ZoomOut className="h-3.5 w-3.5" />
                  </Button>
                </TooltipTrigger>
                <TooltipContent>
                  <p className="text-xs">Thu nhỏ local (+50cm)</p>
                </TooltipContent>
              </Tooltip>

              <Tooltip>
                <TooltipTrigger asChild>
                  <Button
                    variant="ghost"
                    size="icon"
                    onClick={handleResetZoom}
                    className="h-6 w-6 text-[var(--kvc-text-muted)] hover:text-[var(--kvc-text)]"
                    aria-label="Đặt lại cự ly 200cm"
                  >
                    <RotateCcw className="h-3 w-3" />
                  </Button>
                </TooltipTrigger>
                <TooltipContent>
                  <p className="text-xs">Đặt lại thang đo chuẩn 200cm</p>
                </TooltipContent>
              </Tooltip>
            </div>
          </div>

          {/* Nút hoặc Bảng số đo radar nằm ngay dưới Zoom controls trong cùng cột flex */}
          {!showMeasurements ? (
            <button
              type="button"
              onClick={() => setShowMeasurements(true)}
              className="flex items-center gap-1 rounded-kvc-control border border-[var(--kvc-line-strong)] bg-[var(--kvc-surface-2)] px-2 py-1 text-[11px] font-semibold text-[var(--kvc-text-muted)] shadow-xs hover:text-[var(--kvc-text)] cursor-pointer"
              aria-expanded={false}
              aria-label="Mở bảng số đo radar"
            >
              <Ruler className="h-3 w-3" />
              <span>Số đo</span>
            </button>
          ) : (
            <div className="w-[272px] max-w-[calc(100vw-2rem)] grid grid-cols-1 gap-1 rounded-kvc-control border border-[var(--kvc-line)] bg-[var(--kvc-surface-2)] p-2 text-[11px] font-mono text-[var(--kvc-text-muted)] shadow-xs">
              <div className="flex items-center justify-between col-span-full">
                <span className="text-[11px] font-semibold text-[var(--kvc-text-muted)]">Số đo radar</span>
                <button
                  type="button"
                  onClick={() => setShowMeasurements(false)}
                  className="rounded-kvc-control px-1 text-[11px] font-semibold text-[var(--kvc-text-muted)] hover:text-[var(--kvc-text)] cursor-pointer"
                  aria-expanded
                  aria-label="Thu gọn bảng số đo radar"
                >
                  Ẩn
                </button>
              </div>

              <div className="flex flex-col">
                <span className="text-[11px] text-[var(--kvc-text-muted)] font-sans">TỌA ĐỘ WGS-84 (GPS):</span>
                <span className={target?.latitude != null ? "text-[var(--kvc-accent-ink)] font-bold truncate" : "text-[var(--kvc-text-faint)] font-normal"}>
                  {target?.latitude != null ? `${target.latitude.toFixed(6)}° N, ${target.longitude?.toFixed(6)}° E` : "N/A"}
                </span>
              </div>

              <div className="flex flex-col">
                <span className="text-[11px] text-[var(--kvc-text-muted)] font-sans">TỌA ĐỘ SA BÀN (LOCAL):</span>
                <span className={hasLocalCoord ? "text-[var(--kvc-ok-ink)] font-bold truncate" : "text-[var(--kvc-text-faint)] font-normal"}>
                  {hasLocalCoord ? `X: ${targetX > 0 ? `+${targetX}` : targetX} cm | Y: ${targetY > 0 ? `+${targetY}` : targetY} cm` : "Tọa độ Hệ Local: N/A"}
                </span>
              </div>

              <div className="flex flex-col sm:col-span-1 col-span-2">
                <span className="text-[11px] text-[var(--kvc-text-muted)] font-sans">CỰ LY & GÓC PHƯƠNG VỊ:</span>
                <span className={hasLocalCoord ? "text-[var(--kvc-accent-ink)] font-bold truncate" : "text-[var(--kvc-text-faint)] font-normal"}>
                  {hasLocalCoord ? `R: ${polarDistanceCm.toFixed(1)} cm | Góc: ${polarAzimuthDeg.toFixed(1)}°` : "N/A"}
                </span>
              </div>
            </div>
          )}
        </div>
      )}

      {/* Khung bản đồ Radar SVG */}
        <div className="relative w-full h-full flex items-center justify-center max-w-full max-h-full aspect-square">
          <svg
            viewBox={`0 0 ${SVG_SIZE} ${SVG_SIZE}`}
            className="w-full h-full max-w-[540px] max-h-[540px] drop-shadow-md select-none"
            aria-label="Radar local thực nghiệm cục bộ"
          >
            <defs>
              {/* Gradient tia quét radar */}
              <radialGradient id="radarGlow" cx="50%" cy="50%" r="50%">
                <stop offset="0%" stopColor="#0891b2" stopOpacity="0.25" />
                <stop offset="80%" stopColor="#0891b2" stopOpacity="0.05" />
                <stop offset="100%" stopColor="#0891b2" stopOpacity="0" />
              </radialGradient>

              {/* Pattern lưới phụ */}
              <pattern id="radarGridPattern" width="18" height="18" patternUnits="userSpaceOnUse">
                <path d="M 18 0 L 0 0 0 18" fill="none" stroke="#1e293b" strokeWidth="0.5" strokeOpacity="0.5" />
              </pattern>
            </defs>

            {/* Nền lưới phụ */}
            <circle cx={CENTER} cy={CENTER} r={USABLE_RADIUS} fill="url(#radarGridPattern)" />

            {/* Vùng quét bóng radar */}
            <circle cx={CENTER} cy={CENTER} r={USABLE_RADIUS} fill="url(#radarGlow)" />

            {/* Đường hướng 45 độ la bàn local */}
            {[-45, 45, 135, 225].map((angle) => {
              const rad = (angle * Math.PI) / 180
              const x2 = CENTER + USABLE_RADIUS * Math.cos(rad)
              const y2 = CENTER + USABLE_RADIUS * Math.sin(rad)
              return (
                <line
                  key={angle}
                  x1={CENTER}
                  y1={CENTER}
                  x2={x2}
                  y2={y2}
                  stroke="#334155"
                  strokeWidth="0.75"
                  strokeDasharray="2 4"
                />
              )
            })}

            {/* Vòng tròn cự ly cm */}
            {rings.map((rCm) => {
              const rPx = rCm * SCALE
              return (
                <g key={rCm}>
                  <circle
                    cx={CENTER}
                    cy={CENTER}
                    r={rPx}
                    fill="none"
                    stroke="#334155"
                    strokeWidth="1"
                    strokeDasharray={rCm === maxRadiusCm ? 'none' : '3 3'}
                    strokeOpacity={rCm === maxRadiusCm ? '0.9' : '0.6'}
                  />
                  {/* Nhãn khoảng cách cm gắn trên trục +Y có nền bảo vệ tránh đè nét trục */}
                  <g transform={`translate(${CENTER + 3}, ${CENTER - rPx - 2})`}>
                    <rect
                      x="0"
                      y="0"
                      width={rCm >= 100 ? 34 : 28}
                      height="12"
                      rx="2"
                      className="fill-[var(--kvc-surface)] stroke-[var(--kvc-line)]"
                      fillOpacity="0.88"
                      strokeWidth="0.5"
                    />
                    <text
                      x="2"
                      y="9"
                      className="fill-[var(--kvc-text-muted)] font-semibold"
                      fontSize="9"
                      fontFamily="monospace"
                      textAnchor="start"
                      paintOrder="stroke"
                      stroke="var(--kvc-surface)"
                      strokeWidth="1.5"
                      strokeLinejoin="round"
                    >
                      {rCm}cm
                    </text>
                  </g>
                </g>
              )
            })}

            {/* Trục chính +X (Đông) và +Y (Bắc local) */}
            <line
              x1={PADDING}
              y1={CENTER}
              x2={SVG_SIZE - PADDING}
              y2={CENTER}
              stroke="#0284c7"
              strokeWidth="1.25"
              strokeOpacity="0.7"
            />
            <line
              x1={CENTER}
              y1={PADDING}
              x2={CENTER}
              y2={SVG_SIZE - PADDING}
              stroke="#0284c7"
              strokeWidth="1.25"
              strokeOpacity="0.7"
            />

            {/* Nhãn các hướng local — đặt lệch khỏi đường trục để không đè
                lên nét kẻ; có viền text halo chống chìm trên mọi vạch lưới */}
            <text
              x={CENTER}
              y={14}
              className="fill-[var(--kvc-accent-ink)]"
              fontSize="11"
              fontWeight="bold"
              textAnchor="middle"
              paintOrder="stroke"
              stroke="var(--kvc-surface)"
              strokeWidth="3"
              strokeLinejoin="round"
            >
              +Y (BẮC LOCAL)
            </text>
            <text
              x={CENTER}
              y={SVG_SIZE - 12}
              className="fill-[var(--kvc-text-muted)]"
              fontSize="11"
              textAnchor="middle"
              paintOrder="stroke"
              stroke="var(--kvc-surface)"
              strokeWidth="3"
              strokeLinejoin="round"
            >
              -Y (NAM)
            </text>
            <text
              x={SVG_SIZE - PADDING - 4}
              y={CENTER - 6}
              className="fill-[var(--kvc-accent-ink)]"
              fontSize="11"
              fontWeight="bold"
              textAnchor="end"
              paintOrder="stroke"
              stroke="var(--kvc-surface)"
              strokeWidth="3"
              strokeLinejoin="round"
            >
              +X (ĐÔNG)
            </text>
            <text
              x={PADDING + 4}
              y={CENTER - 6}
              className="fill-[var(--kvc-text-muted)]"
              fontSize="11"
              textAnchor="start"
              paintOrder="stroke"
              stroke="var(--kvc-surface)"
              strokeWidth="3"
              strokeLinejoin="round"
            >
              -X (TÂY)
            </text>

            {/* Gốc O(0,0) Mốc chuẩn */}
            <circle cx={CENTER} cy={CENTER} r="4" className="fill-[var(--kvc-accent)]" stroke="white" strokeWidth="1.5" />
            <g transform={`translate(${CENTER + 8}, ${CENTER + 5})`}>
              <rect
                x="0"
                y="0"
                width="84"
                height="15"
                rx="3"
                className="fill-[var(--kvc-surface)] stroke-[var(--kvc-line)]"
                fillOpacity="0.88"
                strokeWidth="0.5"
              />
              <text
                x="4"
                y="11"
                className="fill-[var(--kvc-text-muted)] font-semibold"
                fontSize="9"
                fontFamily="monospace"
                paintOrder="stroke"
                stroke="var(--kvc-surface)"
                strokeWidth="1"
                strokeLinejoin="round"
              >
                O(0,0) Mốc #{target?.origin_id ?? 'N/A'}
              </text>
            </g>

            {/* Vệt quét radar mô phỏng (quét góc theo tia ngắm) */}
            <line
              x1={CENTER}
              y1={CENTER}
              x2={CENTER + USABLE_RADIUS * Math.cos(-Math.PI / 4)}
              y2={CENTER + USABLE_RADIUS * Math.sin(-Math.PI / 4)}
              stroke="#06b6d4"
              strokeWidth="1.5"
              strokeOpacity="0.35"
            />

            {/* HIỂN THỊ MỤC TIÊU SA BÀN (LOCAL GRID HOẶC TỌA ĐỘ LOCAL HỢP LỆ) */}
            {hasLocalCoord && (
              <g
                className="transition-all duration-300"
                style={{ opacity: isDataStale ? 0.5 : 1 }}
              >
                {/* Đường nối vector từ gốc O tới mục tiêu */}
                <line
                  x1={CENTER}
                  y1={CENTER}
                  x2={svgTargetX}
                  y2={svgTargetY}
                  stroke={isDataStale ? '#f59e0b' : '#ef4444'}
                  strokeWidth="1.5"
                  strokeDasharray="3 3"
                  strokeOpacity="0.85"
                />

                {/* Vòng lan tỏa mục tiêu (Pulsing ring) */}
                {!isDataStale && (
                  <circle
                    cx={svgTargetX}
                    cy={svgTargetY}
                    r="14"
                    fill="none"
                    stroke="#ef4444"
                    strokeWidth="1.5"
                    strokeOpacity="0.6"
                  />
                )}

                {/* Chấm tròn mục tiêu */}
                <circle
                  cx={svgTargetX}
                  cy={svgTargetY}
                  r="7"
                  fill={target.class_name === 'lifebuoy' || target.class_name === 'boat' ? '#f59e0b' : '#ef4444'}
                  stroke="#ffffff"
                  strokeWidth="2.5"
                />

                {/* Nếu dữ liệu cũ (STALE > 3s): Vẽ gạch chéo cảnh báo lên marker theo quy định */}
                {isDataStale && (
                  <g stroke="#f59e0b" strokeWidth="2.5" strokeLinecap="round">
                    <line x1={svgTargetX - 8} y1={svgTargetY - 8} x2={svgTargetX + 8} y2={svgTargetY + 8} />
                    <line x1={svgTargetX - 8} y1={svgTargetY + 8} x2={svgTargetX + 8} y2={svgTargetY - 8} />
                  </g>
                )}

                {/* Hộp nhãn mô tả mục tiêu.
                    Kẹp cả X và Y vào trong viewBox: trước đây chỉ kẹp cạnh phải
                    và cạnh trên, nên mục tiêu ở nửa dưới bị nhãn tràn ra ngoài
                    và bị cắt mất dòng toạ độ. */}
                {/* Hộp nhãn mô tả mục tiêu: tránh đè lên tâm O(0,0) khi ở cự ly gần */}
                {(() => {
                  const boxWidth = 148
                  const boxHeight = 34
                  const posX = svgTargetX > CENTER + 30
                    ? Math.max(4, svgTargetX - boxWidth - 10)
                    : Math.min(SVG_SIZE - boxWidth - 4, svgTargetX + 10)
                  const posY = svgTargetY > CENTER
                    ? Math.max(16, svgTargetY - boxHeight - 8)
                    : Math.min(SVG_SIZE - boxHeight - 4, svgTargetY + 10)
                  return (
                    <g transform={`translate(${posX}, ${posY})`}>
                      <rect
                        x="0"
                        y="0"
                        width={boxWidth}
                        height={boxHeight}
                        rx="4"
                        fill="#0f172a"
                        fillOpacity="0.95"
                        stroke={isDataStale ? '#f59e0b' : '#ef4444'}
                        strokeWidth="1.25"
                      />
                      <text
                        x="6"
                        y="14"
                        fill={isDataStale ? '#f59e0b' : '#f87171'}
                        fontSize="10"
                        fontFamily="monospace"
                        fontWeight="bold"
                      >
                        #{target.track_id ?? 'N/A'}{' '}
                        {target.class_name === 'person'
                          ? 'Người'
                          : target.class_name === 'lifebuoy' || target.class_name === 'boat'
                          ? 'Phao cứu sinh'
                          : 'Mục tiêu'}
                        {target.confidence ? ` (${target.confidence}%)` : ''}
                      </text>
                      <text
                        x="6"
                        y="27"
                        fill="#38bdf8"
                        fontSize="9"
                        fontFamily="monospace"
                        fontWeight="bold"
                      >
                        X:{targetX > 0 ? `+${targetX}` : targetX} Y:{targetY > 0 ? `+${targetY}` : targetY} cm
                      </text>
                    </g>
                  )
                })()}
              </g>
            )}

            {/* THÔNG TIN HƯỚNG MỤC TIÊU KHI Ở CHẾ ĐỘ WGS-84 (KHÔNG BỊ CHE KHUẤT) */}
            {!isLocalGrid && target?.latitude != null && (
              <g transform={`translate(${CENTER}, ${CENTER})`}>
                <circle cx="0" cy="0" r="18" fill="#0284c7" fillOpacity="0.2" stroke="#38bdf8" strokeWidth="1" />
                <Compass className="h-6 w-6 text-[var(--kvc-accent-ink)] -translate-x-3 -translate-y-3" />
              </g>
            )}
          </svg>

          {/* HUY HIỆU THÔNG BÁO HỆ WGS-84 (NHỎ GỌN TRÊN ĐẦU, GIỚI HẠN CHIỀU RỘNG TRÁNH CHỒNG ĐÈ CỤM ĐIỀU KHIỂN BÊN PHẢI) */}
          {!isLocalGrid && (
            <div
              className={`absolute left-2 z-20 pointer-events-auto max-w-[calc(100%-300px)] ${
                hideHeader ? 'top-14' : 'top-2'
              }`}
            >
              <div className="bg-[var(--kvc-surface-2)] border border-[var(--kvc-accent-line)] px-2.5 py-1 rounded-md text-[11px] text-[var(--kvc-accent-ink)] font-medium flex items-center gap-1.5 shadow-lg">
                <Compass className="h-3.5 w-3.5 text-[var(--kvc-accent-ink)] shrink-0" />
                <span className="min-w-0 truncate">
                  Hệ quy chiếu toàn cầu (WGS-84) đang kích hoạt: {target?.latitude != null ? `${target.latitude.toFixed(6)}° N, ${target.longitude?.toFixed(6)}° E` : 'Chờ tọa độ'}
                </span>
                {onSwitchToMap && (
                  <button
                    type="button"
                    onClick={onSwitchToMap}
                    className="ml-1 shrink-0 text-[var(--kvc-accent-ink)] underline hover:text-[var(--kvc-text)] cursor-pointer font-bold"
                    aria-label="Xem Bản Đồ WGS-84"
                  >
                    Xem Bản Đồ WGS-84 &rarr;
                  </button>
                )}
              </div>
            </div>
          )}

          {/* CẢNH BÁO STALE KHI DỮ LIỆU CŨ QUÁ 3 GIÂY */}
          {isLocalGrid && isDataStale && (
            <div
              className={`absolute left-2 z-20 pointer-events-auto max-w-[calc(100%-300px)] ${
                hideHeader ? 'top-14' : 'top-2'
              }`}
            >
              <div className="bg-[var(--kvc-warn-bg)] border border-[var(--kvc-warn-line)] px-2.5 py-1 rounded-md text-[11px] text-[var(--kvc-warn-ink)] font-medium flex items-center gap-1.5 shadow-lg">
                <AlertTriangle className="h-3.5 w-3.5 text-[var(--kvc-warn-ink)] shrink-0" />
                <span className="truncate">
                  DỮ LIỆU CŨ ({targetAgeMs === undefined ? 'N/A' : `${Math.round(targetAgeMs)} ms`}): Vị trí mục tiêu bị làm mờ, giữ nguyên tọa độ cuối.
                </span>
              </div>
            </div>
          )}
        </div>

        {/* BẢNG ĐO THÔNG SỐ ĐÁY RADAR — chỉ hiển thị ở chế độ panel độc lập (không hideHeader) */}
        {!hideHeader && (
          <div className="mt-1 grid w-full shrink-0 grid-cols-2 gap-2 rounded-kvc-control border border-[var(--kvc-line)] bg-[var(--kvc-surface-2)] p-2 text-[11px] font-mono text-[var(--kvc-text-muted)] sm:grid-cols-3">
            <div className="flex flex-col">
              <span className="text-[11px] text-[var(--kvc-text-muted)] font-sans">TỌA ĐỘ WGS-84 (GPS):</span>
              <span className={target?.latitude != null ? "text-[var(--kvc-accent-ink)] font-bold truncate" : "text-[var(--kvc-text-faint)] font-normal"}>
                {target?.latitude != null ? `${target.latitude.toFixed(6)}° N, ${target.longitude?.toFixed(6)}° E` : "N/A"}
              </span>
            </div>

            <div className="flex flex-col">
              <span className="text-[11px] text-[var(--kvc-text-muted)] font-sans">TỌA ĐỘ SA BÀN (LOCAL):</span>
              <span className={hasLocalCoord ? "text-[var(--kvc-ok-ink)] font-bold truncate" : "text-[var(--kvc-text-faint)] font-normal"}>
                {hasLocalCoord ? `X: ${targetX > 0 ? `+${targetX}` : targetX} cm | Y: ${targetY > 0 ? `+${targetY}` : targetY} cm` : "Tọa độ Hệ Local: N/A"}
              </span>
            </div>

            <div className="flex flex-col sm:col-span-1 col-span-2">
              <span className="text-[11px] text-[var(--kvc-text-muted)] font-sans">CỰ LY & GÓC PHƯƠNG VỊ:</span>
              <span className={hasLocalCoord ? "text-[var(--kvc-accent-ink)] font-bold truncate" : "text-[var(--kvc-text-faint)] font-normal"}>
                {hasLocalCoord ? `R: ${polarDistanceCm.toFixed(1)} cm | Góc: ${polarAzimuthDeg.toFixed(1)}°` : "N/A"}
              </span>
            </div>
          </div>
        )}

        {/* Dòng chú giải thang đo: chỉ giữ thông tin KHÔNG lặp với bảng trên
            (gốc toạ độ và kích thước ô lưới). X/Y/R/góc đã có ở bảng phía trên. */}
        <div className={`w-full mt-1 flex flex-wrap items-center gap-x-4 gap-y-1 text-[11px] font-mono text-[var(--kvc-text-muted)] bg-[var(--kvc-surface-2)] border border-[var(--kvc-line)] rounded-kvc-control px-3 py-1.5 shrink-0 ${
          hideHeader ? 'sr-only' : ''
        }`}>
          <span className="flex items-center gap-1">
            <MapPin className="h-3 w-3 text-[var(--kvc-accent-ink)]" />
            Gốc O(0,0): Cột mốc #{target?.origin_id ?? 'N/A'}
          </span>
          <span>Thước đo: 1 ô = {maxRadiusCm / 4} cm</span>
          {!hasLocalCoord && (
            <span className={isLocalGrid ? 'text-[var(--kvc-warn-ink)]' : 'text-[var(--kvc-text-faint)]'}>
              {isLocalGrid ? 'Đang chờ giải toạ độ local…' : 'Toạ độ Local: N/A (chế độ WGS-84)'}
            </span>
          )}
        </div>
      </div>
    )

    if (hideHeader) {
    return radarSvgBody
  }

  return (
    <Panel
      title="Hệ Local Radar Cục Bộ (Local Grid)"
      infoTip="Radar tọa độ cực phục vụ thử nghiệm hồ bơi hoặc sa bàn: hiển thị vị trí tương đối X, Y (cm), cự ly và góc lệch của mục tiêu so với gốc tọa độ O(0,0)."
      icon={<Radio className="h-4 w-4 text-[var(--kvc-accent-ink)]" />}
      noPadding
      className={`h-full flex flex-col min-h-0 border-border bg-card shadow-xs select-none ${className}`}
      headerRight={
        <div className="flex items-center gap-1.5 flex-wrap">
          <StatusBadge
            label={
              !ws_connected && source_mode !== 'MOCK'
                ? 'MẤT KẾT NỐI'
                : hasLocalCoord
                ? isDataStale
                  ? staleLabel()
                  : 'KHÓA MỤC TIÊU'
                : isLocalGrid
                ? 'TÌM KIẾM MỤC TIÊU'
                : 'WGS-84 ACTIVE'
            }
            variant={
              !ws_connected && source_mode !== 'MOCK'
                ? 'crit'
                : hasLocalCoord
                ? isDataStale
                  ? 'warn'
                  : 'ok'
                : isLocalGrid
                ? 'accent'
                : 'neutral'
            }
          />
          <div className="flex items-center bg-muted/60 p-0.5 rounded-md border border-border/50">
            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  variant="ghost"
                  size="icon"
                  onClick={handleZoomIn}
                  className="h-6 w-6 text-muted-foreground hover:text-foreground"
                  aria-label="Phóng to local"
                  disabled={maxRadiusCm <= 50}
                >
                  <ZoomIn className="h-3.5 w-3.5" />
                </Button>
              </TooltipTrigger>
              <TooltipContent>
                <p className="text-xs">Phóng to local (-50cm)</p>
              </TooltipContent>
            </Tooltip>

            <span className="text-[11px] font-mono px-1.5 text-foreground font-semibold min-w-[50px] text-center">
              {maxRadiusCm}cm
            </span>

            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  variant="ghost"
                  size="icon"
                  onClick={handleZoomOut}
                  className="h-6 w-6 text-muted-foreground hover:text-foreground"
                  aria-label="Thu nhỏ local"
                  disabled={maxRadiusCm >= 600}
                >
                  <ZoomOut className="h-3.5 w-3.5" />
                </Button>
              </TooltipTrigger>
              <TooltipContent>
                <p className="text-xs">Thu nhỏ local (+50cm)</p>
              </TooltipContent>
            </Tooltip>

            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  variant="ghost"
                  size="icon"
                  onClick={handleResetZoom}
                  className="h-6 w-6 text-muted-foreground hover:text-foreground"
                  aria-label="Đặt lại cự ly 200cm"
                >
                  <RotateCcw className="h-3 w-3" />
                </Button>
              </TooltipTrigger>
              <TooltipContent>
                <p className="text-xs">Đặt lại thang đo chuẩn 200cm</p>
              </TooltipContent>
            </Tooltip>
          </div>
        </div>
      }
    >
      {radarSvgBody}
    </Panel>
  )
}
