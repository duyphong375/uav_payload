import React from 'react'
import { Cpu } from 'lucide-react'
import { InfoTip } from '@/components/shared/InfoTip'

interface SensorFlagsInspectorProps {
  gpsValid: boolean
  lidarValid: boolean
  imuValid: boolean
  aiDetected: boolean
  sequenceNumber: number | null
  /** Ẩn hàng tiêu đề khi component nằm trong một khối đã có tiêu đề riêng. */
  hideTitle?: boolean
  className?: string
}

/**
 * Bit 0..3 theo thứ tự backend tách cờ (gcs/backend/esp32_ingress.py):
 * bit0 GPS, bit1 LiDAR, bit2 IMU, bit3 AI.
 * Frontend chỉ nhận 4 boolean đã tách, nên HEX được DỰNG TỪ boolean,
 * không parse ngược từ hex.
 */
const BITS = [
  { index: 0, key: 'gps', label: 'GPS' },
  { index: 1, key: 'lidar', label: 'LiDAR' },
  { index: 2, key: 'imu', label: 'IMU' },
  { index: 3, key: 'ai', label: 'AI' },
] as const

export const SensorFlagsInspector: React.FC<SensorFlagsInspectorProps> = ({
  gpsValid,
  lidarValid,
  imuValid,
  aiDetected,
  sequenceNumber,
  hideTitle = false,
  className = '',
}) => {
  const flags = [gpsValid, lidarValid, imuValid, aiDetected]
  const hexValue = flags.reduce((acc, on, i) => (on ? acc | (1 << i) : acc), 0)
  const hex = `0x${hexValue.toString(16).toUpperCase().padStart(2, '0')}`

  return (
    <div className={`flex flex-col gap-1.5 min-w-0 ${className}`}>
      {!hideTitle && (
        <div className="flex items-center justify-between gap-2">
          <div className="flex items-center gap-1.5 min-w-0">
            <Cpu className="h-3.5 w-3.5 text-[var(--kvc-text-muted)] shrink-0" />
            <span className="text-[11px] uppercase tracking-wider text-[var(--kvc-text-muted)] font-semibold whitespace-nowrap">
              Cờ cảm biến
            </span>
            <InfoTip text="Bốn bit hợp lệ tách từ gói tin. HEX được dựng từ các bit đang bật, không suy ngược từ gói." />
          </div>
          <span className="shrink-0 font-mono text-[11px] font-bold text-[var(--kvc-text)]">{hex}</span>
        </div>
      )}

      {hideTitle && (
        <div className="flex items-center justify-end">
          <span className="shrink-0 font-mono text-[11px] font-bold text-[var(--kvc-text)]">{hex}</span>
        </div>
      )}

      <div className="grid grid-cols-4 gap-1">
        {BITS.map((bit, i) => {
          const on = flags[i]
          return (
            <div
              key={bit.key}
              className={`flex flex-col items-center gap-0.5 px-0.5 py-0.5 rounded-kvc-control border min-w-0 ${
                on
                  ? 'border-[var(--kvc-ok-line)] bg-[var(--kvc-ok-bg)]'
                  : 'border-[var(--kvc-line)] bg-[var(--kvc-surface-2)]'
              }`}
              title={`bit${bit.index} ${bit.label}: ${on ? 'hợp lệ' : 'không hợp lệ'}`}
            >
              <span
                className={`w-1.5 h-1.5 rounded-full shrink-0 ${
                  on ? 'bg-[var(--kvc-ok)]' : 'bg-[var(--kvc-text-muted)]'
                }`}
              />
              <span
                className={`font-mono text-[10px] font-bold truncate max-w-full ${
                  on ? 'text-[var(--kvc-ok-ink)]' : 'text-[var(--kvc-text-muted)]'
                }`}
              >
                {bit.label}
              </span>
              <span className="font-mono text-[9px] text-[var(--kvc-text-muted)]">b{bit.index}</span>
            </div>
          )
        })}
      </div>

      <span className="mt-auto font-mono text-[11px] text-[var(--kvc-text-muted)]">
        {sequenceNumber !== null ? `PKT #${sequenceNumber}` : 'PKT #N/A'}
      </span>
    </div>
  )
}
