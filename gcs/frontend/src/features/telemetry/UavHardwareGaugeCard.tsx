import React, { useState } from 'react'
import { ChevronDown, Cpu, Radio } from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { Card } from '@/components/ui/card'
import { InfoTip } from '@/components/shared/InfoTip'
import { getEsp32PhysicalStatus } from '@/lib/connectionStatus'
import { isAgeStale } from '@/lib/stale'
import { useMission } from '@/state/MissionProvider'

/**
 * Tổng quan phần cứng: một card duy nhất.
 * - Mặc định chỉ hiện 4 module chính (GNSS, siêu âm, LoRa, Gateway).
 * - 4 module còn lại nằm sau nút "Xem đủ 8 khối" để không chiếm chiều cao màn hình.
 */
export const UavHardwareGaugeCard: React.FC<{ className?: string }> = ({ className = '' }) => {
  const { state } = useMission()
  const { telemetry, source_mode, inference_device, hardware_link, is_stale, ws_connected, rx_age_ms } =
    state
  const [expanded, setExpanded] = useState(false)

  const esp32Status = getEsp32PhysicalStatus(
    source_mode,
    ws_connected,
    hardware_link,
    is_stale,
    rx_age_ms
  )

  const dataStatus =
    source_mode === 'REAL'
      ? isAgeStale(rx_age_ms, is_stale)
        ? 'MẤT TÍN HIỆU'
        : 'TRỰC TIẾP'
      : is_stale
        ? 'DỮ LIỆU CŨ'
        : source_mode === 'MOCK'
          ? 'MÔ PHỎNG'
          : 'CÓ DỮ LIỆU'

  const subsystems = [
    {
      id: 'gnss',
      title: 'GNSS NEO-M8N / ATGM336H',
      detail: !is_stale && telemetry.gps_valid ? 'Fix hợp lệ theo nguồn' : 'Chờ khoá vệ tinh',
      status: !is_stale && telemetry.gps_valid ? dataStatus : 'N/A',
      primary: true,
      clickable: true,
    },
    {
      id: 'sonar',
      title: 'Siêu âm AJ-SR04M',
      detail:
        !is_stale && telemetry.lidar_valid && telemetry.lidar_range_cm !== null
          ? 'Cự ly dọc tia: ' + (telemetry.lidar_range_cm / 100).toFixed(2) + ' m'
          : 'Cự ly: Chờ đo',
      status: !is_stale && telemetry.lidar_valid ? dataStatus : 'N/A',
      primary: true,
      clickable: false,
    },
    {
      id: 'lora',
      title: 'LoRa Ra-02 SX1278',
      detail:
        !is_stale && telemetry.packet_rssi_dbm !== null
          ? 'RSSI ' + telemetry.packet_rssi_dbm + ' dBm • SNR ' + (telemetry.packet_snr_db ?? 'N/A')
          : 'Sóng vô tuyến 433 MHz',
      status: !is_stale && telemetry.packet_rssi_dbm !== null ? dataStatus : 'RF LINK',
      primary: true,
      clickable: false,
    },
    {
      id: 'ground',
      title: 'ESP32-C3 Gateway',
      detail:
        source_mode === 'REAL'
          ? hardware_link.status === 'CONNECTED'
            ? (hardware_link.port ?? 'ESP32 Ingress')
            : 'Chưa có Ingress Gateway'
          : 'Virtual Loopback / Mock',
      status: esp32Status.shortLabel,
      primary: true,
      clickable: false,
    },
    {
      id: 'imu',
      title: 'IMU GY-87',
      detail: 'Tư thế & góc nghiêng UAV',
      status: !is_stale && telemetry.imu_valid ? dataStatus : 'N/A',
      primary: false,
      clickable: false,
    },
    {
      id: 'camera',
      title: 'Camera RGB',
      detail: 'Kênh video độc lập • Chờ tích hợp',
      status: 'CHƯA TÍCH HỢP',
      primary: false,
      clickable: false,
    },
    {
      id: 'fpga',
      title: 'OneKiwi Primer 20K V1.1',
      detail: 'YOLO11n mục tiêu • ' + inference_device,
      status: 'AI ENGINE',
      primary: false,
      clickable: false,
    },
    {
      id: 'sonix',
      title: 'Sonix SN34F788',
      detail: 'MCU tải: Cảm biến / Định vị / RF',
      status: 'MCU TẢI',
      primary: false,
      clickable: false,
    },
  ]

  const visible = expanded ? subsystems : subsystems.filter((s) => s.primary)

  return (
    <Card className={'shrink-0 flex flex-col p-4 sm:p-5 rounded-kvc-panel border-border ' + className}>
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-border pb-2">
        <div className="flex items-center gap-2">
          <Cpu className="h-4 w-4 text-[var(--kvc-accent-ink)]" />
          <h3 className="text-sm font-bold">Phần cứng & liên kết</h3>
          <InfoTip text="Trạng thái các khối phần cứng KVC: GNSS, siêu âm, IMU, camera, FPGA, MCU tải, LoRa và Gateway trạm đất. Mở rộng để xem đủ 8 khối." />
        </div>
        <div className="flex items-center gap-2">
          <Badge variant="outline" className="font-mono">
            {source_mode}
          </Badge>
          <button
            type="button"
            onClick={() => setExpanded((v) => !v)}
            aria-expanded={expanded}
            className="inline-flex items-center gap-1 rounded-kvc-control border border-border px-2 py-1 text-xs font-semibold text-[var(--kvc-accent-ink)] hover:bg-muted/60 cursor-pointer"
          >
            {expanded ? 'Thu gọn' : 'Xem đủ 8 khối'}
            <ChevronDown
              className={`h-3.5 w-3.5 transition-transform ${expanded ? 'rotate-180' : ''}`}
            />
          </button>
        </div>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-2.5 my-3">
        {visible.map((sub) => (
          <div
            key={sub.id}
            className="p-2.5 rounded-kvc-panel bg-muted/30 border border-border flex flex-col gap-1.5 min-w-0"
          >
            {sub.clickable ? (
              <button
                type="button"
                className="text-left text-xs font-bold text-[var(--kvc-accent-ink)] cursor-pointer"
                onClick={() => window.dispatchEvent(new CustomEvent('kvc-open-satellite-sheet'))}
              >
                {sub.title}
              </button>
            ) : (
              <p className="text-xs font-bold truncate" title={sub.title}>
                {sub.title}
              </p>
            )}
            <p className="text-[11px] text-muted-foreground truncate" title={sub.detail}>
              {sub.detail}
            </p>
            <p className="font-mono text-[11px] font-semibold">{sub.status}</p>
          </div>
        ))}
      </div>

      <div className="flex flex-wrap items-center justify-between gap-2 text-xs text-muted-foreground border-t border-border pt-2">
        <span>
          Tuổi gói tin:{' '}
          <span className="font-mono font-bold text-foreground tabular-nums">
            {rx_age_ms !== null && rx_age_ms !== undefined ? `${rx_age_ms} ms` : 'N/A'}
          </span>
          {'  ·  '}
          GNSS:{' '}
          <span className="font-mono font-bold text-foreground">
            {telemetry.gps_valid ? '3D FIX' : 'CHỜ TÍN HIỆU'}
          </span>
        </span>
        <span className="flex items-center gap-1">
          <Radio className="h-3.5 w-3.5 text-[var(--kvc-accent-ink)]" />
          KVC là tải nhiệm vụ, không phải flight controller. Chỉ số không có nguồn đo hiển thị N/A.
        </span>
      </div>
    </Card>
  )
}
