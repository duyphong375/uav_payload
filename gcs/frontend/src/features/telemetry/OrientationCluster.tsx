import React from 'react'
import { Compass } from 'lucide-react'
import { InfoTip } from '@/components/shared/InfoTip'

interface OrientationClusterProps {
  headingDeg: number | null
  rollDeg: number | null
  pitchDeg: number | null
  imuValid: boolean
  stale: boolean
  className?: string
}

/**
 * Nhãn hướng tiếng Việt. Cỡ 11px để không vi phạm DL-3 (chữ tối thiểu 11px),
 * nên viewBox dùng 88 đơn vị thay vì 64 để nhãn không tràn khi xoay.
 */
const CARDINALS: Array<[number, string]> = [
  [0, 'B'],
  [45, 'ĐB'],
  [90, 'Đ'],
  [135, 'ĐN'],
  [180, 'N'],
  [225, 'TN'],
  [270, 'T'],
  [315, 'TB'],
]

const C = 44
const R = 42

/** La bàn vẽ bằng SVG: mọi phần tử định vị bằng toạ độ, không chồng khi khung hẹp. */
const CompassDial: React.FC<{ headingDeg: number | null }> = ({ headingDeg }) => {
  const hasHeading = headingDeg !== null && Number.isFinite(headingDeg)
  const rotation = hasHeading ? headingDeg : 0

  return (
    <svg
      viewBox={`0 0 ${C * 2} ${C * 2}`}
      className="w-12 h-12 shrink-0"
      role="img"
      aria-label={
        hasHeading ? `Hướng bay ${Math.round(headingDeg)} độ` : 'Chưa có dữ liệu la bàn'
      }
    >
      <circle
        cx={C}
        cy={C}
        r={R}
        fill="var(--kvc-surface-2)"
        stroke="var(--kvc-line-strong)"
        strokeWidth="1"
      />
      <g opacity={hasHeading ? 1 : 0.4}>
        {CARDINALS.map(([deg, label]) => (
          <text
            key={label}
            x={C}
            y={11}
            textAnchor="middle"
            dominantBaseline="middle"
            fontSize="11"
            fontWeight="700"
            fill="var(--kvc-text-muted)"
            transform={`rotate(${deg} ${C} ${C})`}
          >
            {label}
          </text>
        ))}
      </g>
      {/* Kim hướng bay */}
      <g transform={`rotate(${rotation} ${C} ${C})`} opacity={hasHeading ? 1 : 0.35}>
        <polygon
          points={`${C},18 ${C + 5},${C} ${C},${C - 4} ${C - 5},${C}`}
          fill="var(--kvc-accent-ink)"
        />
        <polygon
          points={`${C},70 ${C + 4},${C} ${C},${C + 5} ${C - 4},${C}`}
          fill="var(--kvc-text-muted)"
          opacity="0.6"
        />
      </g>
      <circle cx={C} cy={C} r="2.5" fill="var(--kvc-text-muted)" />
    </svg>
  )
}

/** Chân trời nhân tạo bằng SVG: nền trời/nước dịch và nghiêng theo tư thế. */
const AttitudeHorizon: React.FC<{ rollDeg: number | null; pitchDeg: number | null }> = ({
  rollDeg,
  pitchDeg,
}) => {
  const has = rollDeg !== null || pitchDeg !== null
  const roll = rollDeg !== null && Number.isFinite(rollDeg) ? Math.max(-45, Math.min(45, rollDeg)) : 0
  const pitch =
    pitchDeg !== null && Number.isFinite(pitchDeg) ? Math.max(-20, Math.min(20, pitchDeg)) : 0
  const offset = pitch * 0.5

  return (
    <svg
      viewBox={`0 0 ${C * 2} ${C * 2}`}
      className="w-12 h-12 shrink-0"
      role="img"
      aria-label={has ? `Chân trời nhân tạo, roll ${Math.round(roll)} độ` : 'Chưa có dữ liệu tư thế'}
    >
      <defs>
        <clipPath id="kvc-horizon-clip">
          <circle cx={C} cy={C} r={R} />
        </clipPath>
      </defs>
      <g clipPath="url(#kvc-horizon-clip)" opacity={has ? 1 : 0.45}>
        <g transform={`rotate(${-roll} ${C} ${C})`}>
          <rect
            x={-C}
            y={-C + offset}
            width={C * 3}
            height={C * 1.5}
            fill="var(--kvc-accent-fill)"
            opacity="0.2"
          />
          <rect
            x={-C}
            y={C + offset}
            width={C * 3}
            height={C * 1.5}
            fill="var(--kvc-text-muted)"
            opacity="0.25"
          />
          <line
            x1={-C}
            y1={C + offset}
            x2={C * 2}
            y2={C + offset}
            stroke="var(--kvc-accent-ink)"
            strokeWidth="1.5"
          />
        </g>
      </g>
      <circle cx={C} cy={C} r={R} fill="none" stroke="var(--kvc-line-strong)" strokeWidth="1" />
      {/* Dấu tham chiếu cố định ở tâm */}
      <line
        x1={C - 10}
        y1={C}
        x2={C + 10}
        y2={C}
        stroke="var(--kvc-text)"
        strokeWidth="1.5"
      />
      <circle cx={C} cy={C} r="2" fill="var(--kvc-text)" />
    </svg>
  )
}

export const OrientationCluster: React.FC<OrientationClusterProps> = ({
  headingDeg,
  rollDeg,
  pitchDeg,
  imuValid,
  stale,
  className = '',
}) => {
  // Mất cờ hợp lệ hoặc dữ liệu cũ thì coi như không có số, không đoán giá trị.
  const hasData = imuValid && !stale
  const h = hasData ? headingDeg : null
  const r = hasData ? rollDeg : null
  const p = hasData ? pitchDeg : null

  const statusLabel = hasData ? 'IMU hợp lệ' : imuValid ? 'Dữ liệu cũ' : 'Chờ IMU'

  return (
    <div className={`flex flex-col gap-1.5 min-w-0 ${className}`}>
      <div className="flex items-center gap-1.5">
        <Compass className="h-3.5 w-3.5 text-[var(--kvc-text-muted)] shrink-0" />
        <span className="text-[11px] uppercase tracking-wider text-[var(--kvc-text-muted)] font-semibold whitespace-nowrap">
          Tư thế & hướng bay
        </span>
        <InfoTip text="La bàn 360 độ và chân trời nhân tạo từ IMU GY-87. Thiếu dữ liệu hợp lệ thì hiển thị N/A, không mặc định 0." />
      </div>

      <div className="grid grid-cols-2 gap-1.5">
        <div className="flex flex-col items-center gap-0.5 min-w-0">
          <CompassDial headingDeg={h} />
          <span className="font-mono text-[10px] text-[var(--kvc-text-muted)] truncate">La bàn</span>
          <span className="font-mono text-[10px] font-bold text-[var(--kvc-text)] tabular-nums truncate max-w-full text-center">
            {h === null ? 'N/A' : `${Math.round(h)}°`}
          </span>
        </div>
        <div className="flex flex-col items-center gap-0.5 min-w-0">
          <AttitudeHorizon rollDeg={r} pitchDeg={p} />
          <span className="font-mono text-[10px] text-[var(--kvc-text-muted)] truncate">Roll / Pitch</span>
          <span className="font-mono text-[10px] font-bold text-[var(--kvc-text)] tabular-nums truncate max-w-full text-center">
            {r === null || p === null ? 'N/A' : `${Math.round(r)}° / ${Math.round(p)}°`}
          </span>
        </div>
      </div>

      <span className="font-mono text-[11px] text-[var(--kvc-text-muted)]">{statusLabel}</span>
    </div>
  )
}
