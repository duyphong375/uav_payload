import React from 'react'
import { Cpu, Zap } from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { Card } from '@/components/ui/card'
import { InfoTip } from '@/components/shared/InfoTip'
import { getEsp32PhysicalStatus } from '@/lib/connectionStatus'
import { useMission } from '@/state/MissionProvider'

export const UavHardwareGaugeCard: React.FC<{ className?: string }> = ({ className = '' }) => {
  const { state } = useMission()
  const { telemetry, source_mode, inference_device, hardware_link, is_stale, ws_connected, rx_age_ms } = state
  const esp32Status = getEsp32PhysicalStatus(source_mode, ws_connected, hardware_link, is_stale, rx_age_ms)
  const batteryPct = is_stale ? null : telemetry.battery_pct
  const isDanger = batteryPct !== null && batteryPct <= 20
  const arcLength = 298.45
  const strokeDashoffset = arcLength * (1 - (batteryPct ?? 0) / 100)
  const dataStatus =
    source_mode === 'REAL'
      ? is_stale || rx_age_ms > 3000
        ? 'MẤT TÍN HIỆU'
        : 'TRỰC TIẾP'
      : is_stale
      ? 'DỮ LIỆU CŨ'
      : source_mode === 'MOCK'
      ? 'MÔ PHỎNG'
      : source_mode === 'REPLAY'
      ? 'PHÁT LẠI'
      : 'CÓ DỮ LIỆU'
  const subsystems = [
    { id: 'gnss', title: '1. GNSS NEO-M8N / ATGM336H', detail: !is_stale && telemetry.gps_valid ? 'Fix hợp lệ theo nguồn' : source_mode === 'REAL' ? 'Chờ gói RF tải bay' : 'Fix: Chờ vệ tinh', status: !is_stale && telemetry.gps_valid ? dataStatus : 'N/A' },
    { id: 'lidar', title: '2. LiDAR TF-Luna', detail: !is_stale && telemetry.lidar_valid && telemetry.lidar_range_cm !== null ? 'Cự ly dọc tia: ' + (telemetry.lidar_range_cm / 100).toFixed(2) + ' m' : source_mode === 'REAL' ? 'Chờ gói RF tải bay' : 'Cự ly: Chờ đo', status: !is_stale && telemetry.lidar_valid ? dataStatus : 'N/A' },
    { id: 'imu', title: '3. IMU GY-87', detail: 'Tư thế & góc nghiêng UAV', status: !is_stale && telemetry.imu_valid ? dataStatus : 'N/A' },
    { id: 'camera', title: '4. Camera RGB', detail: 'Kênh video độc lập • Chờ tích hợp', status: 'CHƯA TÍCH HỢP' },
    { id: 'fpga', title: '5. OneKiwi Primer 20K V1.1', detail: 'YOLO11n mục tiêu • ' + inference_device, status: 'AI ENGINE' },
    { id: 'sonix', title: '6. Sonix SN34F788', detail: 'MCU tải: Cảm biến/Định vị/RF', status: 'MCU TẢI' },
    { id: 'lora', title: '7. LoRa Ra-02 SX1278', detail: !is_stale && telemetry.packet_rssi_dbm !== null ? 'RSSI ' + telemetry.packet_rssi_dbm + ' dBm • SNR ' + (telemetry.packet_snr_db ?? 'N/A') : 'Sóng vô tuyến 433MHz', status: !is_stale && telemetry.packet_rssi_dbm !== null ? dataStatus : 'RF LINK' },
    { id: 'ground', title: '8. ESP32-C3 Gateway Trạm Đất', detail: source_mode === 'REAL' ? (hardware_link.status === 'CONNECTED' ? (hardware_link.port ?? 'ESP32 Ingress') : 'Chưa có Ingress Gateway') : 'Virtual Loopback / Mock', status: esp32Status.shortLabel },
  ]

  return (
    <div className={'shrink-0 grid grid-cols-1 lg:grid-cols-12 gap-4 ' + className}>
      <Card className="lg:col-span-5 flex flex-col p-4 sm:p-5 rounded-2xl border-border">
        <div className="flex items-center justify-between gap-2 border-b border-border pb-2">
          <div className="flex items-center gap-2">
            <Zap className="h-4 w-4 text-emerald-500" />
            <h3 className="text-sm font-bold">Nguồn và pin tải KVC</h3>
            <InfoTip text="Đồng hồ đo dung lượng pin tải UAV tính toán từ điện áp thực tế, cảnh báo đỏ khi mức pin giảm dưới 20%." />
          </div>
          <Badge variant="outline">{source_mode}</Badge>
        </div>
        <div className="relative flex flex-col items-center justify-center my-4">
          <svg className="w-full max-w-[270px] h-36" viewBox="0 0 240 140" aria-label="Mức pin tải">
            <path d="M 25 115 A 95 95 0 0 1 215 115" fill="none" stroke="currentColor" className="text-muted" strokeWidth="14" strokeLinecap="round" />
            <path d="M 25 115 A 95 95 0 0 1 215 115" fill="none" stroke="currentColor" className={isDanger ? 'text-rose-500' : 'text-emerald-500'} strokeWidth="14" strokeLinecap="round" strokeDasharray={arcLength} strokeDashoffset={strokeDashoffset} />
            <text x="22" y="138" className="fill-muted-foreground text-[10px]">0%</text>
            <text x="206" y="138" className="fill-muted-foreground text-[10px]">100%</text>
          </svg>
          <div className="absolute bottom-5 text-center">
            <p className={'font-mono text-3xl font-bold ' + (isDanger ? 'text-rose-500' : 'text-foreground')}>{batteryPct === null ? '-- %' : batteryPct + '%'}</p>
            <p className="text-xs text-muted-foreground">{isDanger ? 'PIN YẾU CẦN HẠ CÁNH' : batteryPct === null ? (source_mode === 'REAL' ? 'Chưa kết nối ESP32' : 'Chưa có dữ liệu pin hiện hành') : dataStatus}</p>
          </div>
        </div>
        <div className="grid grid-cols-2 gap-3 text-xs">
          <div className="rounded-lg bg-muted/30 p-2"><p className="text-muted-foreground">Loại Pin</p><p className="font-mono font-bold">3S LiPo 12.6V</p></div>
          <div className="rounded-lg bg-muted/30 p-2"><p className="text-muted-foreground">Điện áp danh định</p><p className="font-mono font-bold">11.1V – 12.6V Max</p></div>
          <div className="rounded-lg bg-muted/30 p-2"><p className="text-muted-foreground">Khóa vệ tinh GNSS</p><p className="font-mono font-bold text-emerald-600 dark:text-emerald-400">{telemetry.gps_valid ? 'ĐÃ CÓ 3D FIX' : 'CHỜ TÍN HIỆU'}</p></div>
          <div className="rounded-lg bg-muted/30 p-2"><p className="text-muted-foreground">Trạm Mặt Đất</p><p className="font-mono font-bold text-primary">{source_mode === 'REAL' ? (hardware_link.status === 'CONNECTED' ? 'ESP32 SoftAP' : 'Chưa có Ingress') : 'Mô phỏng GCS'}</p></div>
        </div>
        <p className="mt-3 text-xs text-muted-foreground">Phần trăm pin giám sát nguồn tải hệ thống KVC. Hệ thống không can thiệp điều khiển bay an toàn.</p>
      </Card>
      <Card className="lg:col-span-7 flex flex-col p-4 sm:p-5 rounded-2xl border-border">
        <div className="flex items-center justify-between gap-2 border-b border-border pb-2">
          <div className="flex items-center gap-2">
            <Cpu className="h-4 w-4 text-primary" />
            <h3 className="text-sm font-bold">Các khối phần cứng trong cấu hình KVC</h3>
            <InfoTip text="Sơ đồ giám sát trạng thái 8 khối phần cứng thuộc hệ thống UAV cứu nạn từ cảm biến, FPGA, MCU tải đến Gateway trạm đất ESP32." />
          </div>
          <Badge variant="outline">{source_mode}</Badge>
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-2.5 my-3">
          {subsystems.map((sub) => <div key={sub.id} className="p-2.5 rounded-xl bg-muted/30 border border-border flex flex-col gap-2">
            {sub.id === 'gnss' ? <button type="button" className="text-left text-xs font-bold text-cyan-600" onClick={() => window.dispatchEvent(new CustomEvent('kvc-open-satellite-sheet'))}>{sub.title}</button> : <p className="text-xs font-bold">{sub.title}</p>}
            <p className="text-[11px] text-muted-foreground">{sub.detail}</p>
            <p className="font-mono text-[10px]">{sub.status}</p>
          </div>)}
        </div>
        <p className="text-xs text-muted-foreground mt-auto border-t border-border pt-2">Camera → FPGA → UART → Sonix SN34F788 → LoRa SX1278 → Gateway ESP32-C3 → Wi-Fi WebSocket → GCS Dashboard.</p>
      </Card>
    </div>
  )
}
