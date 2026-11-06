import React from 'react'
import {
  Activity,
  ArrowDownUp,
  Camera,
  Compass,
  Cpu,
  HardDrive,
  Radio,
  RotateCcw,
  Server,
  ShieldAlert,
  ShieldCheck,
} from 'lucide-react'
import { PageFrame } from '@/components/shared/PageFrame'
import { PageHeader } from '@/components/shared/PageHeader'
import { InfoTip } from '@/components/shared/InfoTip'
import { getEsp32PhysicalStatus } from '@/lib/connectionStatus'
import { Button } from '@/components/ui/button'
import { APP_CONFIG } from '@/config/appConfig'
import { SensorFlagsInspector } from '@/features/telemetry/SensorFlagsInspector'
import { useMission } from '@/state/MissionProvider'

type Tone = 'ok' | 'warn' | 'crit' | 'neutral'

const toneClasses: Record<Tone, string> = {
  ok: 'border-[var(--kvc-ok-line)] bg-[var(--kvc-ok-bg)] text-[var(--kvc-ok-ink)]',
  warn: 'border-[var(--kvc-warn-line)] bg-[var(--kvc-warn-bg)] text-[var(--kvc-warn-ink)]',
  crit: 'border-[var(--kvc-crit-line)] bg-[var(--kvc-crit-bg)] text-[var(--kvc-crit-ink)]',
  neutral: 'border-border bg-[var(--kvc-surface-2)] text-muted-foreground',
}

const dotClasses: Record<Tone, string> = {
  ok: 'bg-[var(--kvc-ok)]',
  warn: 'bg-[var(--kvc-warn)]',
  crit: 'bg-[var(--kvc-crit)]',
  neutral: 'bg-muted-foreground',
}

interface LinkCardProps {
  icon: React.ReactNode
  title: string
  infoTip: string
  tone: Tone
  statusLabel: string
  /** Dòng mô tả ngắn dưới tiêu đề, một dòng. */
  caption: string
  rows: Array<{ label: string; value: React.ReactNode; mono?: boolean }>
  /** Nội dung tuỳ biến thay cho danh sách rows. */
  children?: React.ReactNode
}

/** Thẻ liên kết: mỗi thẻ là MỘT chặng truyền, không trộn nhiều tầng. */
const LinkCard: React.FC<LinkCardProps> = ({
  icon,
  title,
  infoTip,
  tone,
  statusLabel,
  caption,
  rows,
  children,
}) => (
  <div className="flex flex-col rounded-kvc-panel border border-border bg-card shadow-xs overflow-hidden min-w-0">
    <div className="flex items-start justify-between gap-2 px-3 py-2 border-b border-border/60">
      <div className="flex items-start gap-1.5 min-w-0">
        <span className="mt-0.5 shrink-0 text-muted-foreground">{icon}</span>
        <div className="flex flex-col min-w-0">
          <div className="flex items-center gap-1.5">
            <h3 className="text-xs font-bold text-foreground truncate">{title}</h3>
            <InfoTip text={infoTip} />
          </div>
          <span className="text-[11px] text-muted-foreground truncate">{caption}</span>
        </div>
      </div>
      <span
        className={`shrink-0 inline-flex items-center gap-1 px-1.5 py-0.5 rounded-kvc-control border font-mono text-[11px] font-bold whitespace-nowrap ${toneClasses[tone]}`}
      >
        <span className={`h-1.5 w-1.5 rounded-full ${dotClasses[tone]}`} />
        {statusLabel}
      </span>
    </div>

    <dl className="flex flex-col divide-y divide-border/40">
      {children ?? rows.map((row) => (
        <div
          key={row.label}
          className="flex items-baseline justify-between gap-3 px-3 py-1.5 min-w-0"
        >
          <dt className="text-[11px] text-muted-foreground shrink-0">{row.label}</dt>
          <dd
            className={`text-[11px] text-right ${
              row.mono ? 'font-mono tabular-nums text-foreground' : 'text-foreground'
            }`}
            title={typeof row.value === 'string' ? row.value : undefined}
          >
            {row.value}
          </dd>
        </div>
      ))}
    </dl>
  </div>
)

interface ModuleRow {
  key: string
  icon: React.ReactNode
  name: string
  short: string
  tone: Tone
  statusLabel: string
  reading: string
  note: string
}

export const DevicesPage: React.FC = () => {
  const { state, reconnect, switchSourceMode } = useMission()
  const {
    ws_connected,
    hardware_link,
    diagnostics,
    telemetry,
    camera_position,
    video,
    inference_device,
    source_mode,
    rx_age_ms,
    is_stale,
    sequence_number,
  } = state

  const esp32Status = getEsp32PhysicalStatus(
    source_mode,
    ws_connected,
    hardware_link,
    is_stale,
    rx_age_ms
  )

  // Tầng 1: trình duyệt ↔ backend. Tầng 2: backend ↔ gateway. Tách riêng để không lẫn nghĩa.
  const gcsTone: Tone = ws_connected ? 'ok' : source_mode === 'MOCK' ? 'neutral' : 'crit'
  const gcsLabel = ws_connected ? 'WS MỞ' : source_mode === 'MOCK' ? 'CỤC BỘ' : 'WS ĐÓNG'

  const gwTone: Tone =
    esp32Status.status === 'LIVE'
      ? 'ok'
      : esp32Status.status === 'WAITING'
        ? 'warn'
        : esp32Status.status === 'MOCK' || esp32Status.status === 'REPLAY'
          ? 'neutral'
          : 'crit'

  const gpsOk = telemetry.gps_valid && camera_position.is_valid
  const linkHealthy = ws_connected || source_mode === 'MOCK'
  const hasAlarm = !gpsOk || is_stale

  const modules: ModuleRow[] = [
    {
      key: 'gnss',
      icon: <Compass className="h-3.5 w-3.5" />,
      name: 'Module định vị GNSS',
      short: 'GNSS',
      tone: gpsOk ? 'ok' : 'warn',
      statusLabel: gpsOk ? '3D FIX' : 'NO FIX',
      reading:
        camera_position.latitude !== null && camera_position.longitude !== null
          ? `${camera_position.latitude.toFixed(6)}, ${camera_position.longitude.toFixed(6)}`
          : 'N/A',
      note: 'Định vị cụm camera và UAV',
    },
    {
      key: 'sonar',
      icon: <ArrowDownUp className="h-3.5 w-3.5" />,
      name: 'Siêu âm AJ-SR04M',
      short: 'Siêu âm',
      tone: telemetry.lidar_valid ? 'ok' : 'warn',
      statusLabel: telemetry.lidar_valid ? 'HỢP LỆ' : 'KHÔNG HỢP LỆ',
      reading:
        telemetry.lidar_range_cm !== null ? `${telemetry.lidar_range_cm} cm` : 'N/A',
      note: 'Khoảng cách tới mặt nước (20–800 cm)',
    },
    {
      key: 'imu',
      icon: <Activity className="h-3.5 w-3.5" />,
      name: 'IMU GY-87',
      short: 'IMU',
      tone: telemetry.imu_valid ? 'ok' : 'warn',
      statusLabel: telemetry.imu_valid ? 'HOẠT ĐỘNG' : 'CHƯA SẴN SÀNG',
      reading: telemetry.imu_valid
        ? `R ${telemetry.roll_deg ?? 'N/A'}° / P ${telemetry.pitch_deg ?? 'N/A'}°`
        : 'N/A',
      note: 'Góc nghiêng và hướng khí tài',
    },
    {
      key: 'ai',
      icon: <Cpu className="h-3.5 w-3.5" />,
      name: 'Thiết bị suy luận AI',
      short: 'AI',
      tone: inference_device === 'FPGA_GW2A' ? 'ok' : 'neutral',
      statusLabel: inference_device,
      reading: telemetry.ai_detected ? 'CÓ MỤC TIÊU' : 'Không có mục tiêu',
      note: 'YOLO11n-SAR phân loại người/phao',
    },
    {
      key: 'video',
      icon: <Camera className="h-3.5 w-3.5" />,
      name: 'Kênh video',
      short: 'Video',
      tone: video.is_connected ? 'ok' : 'crit',
      statusLabel: video.source_type,
      reading: video.url || (source_mode === 'MOCK' ? 'Mock Test Pattern' : 'Chưa có luồng video'),
      note: 'Khung 16:9 kèm lớp Bounding Box',
    },
    {
      key: 'logger',
      icon: <HardDrive className="h-3.5 w-3.5" />,
      name: 'Bộ ghi log nhiệm vụ',
      short: 'Logger',
      tone: diagnostics.logger_status === 'OK' ? 'ok' : 'crit',
      statusLabel: diagnostics.logger_status,
      reading: diagnostics.logger_status === 'OK' ? 'Ghi liên tục' : 'Lỗi thiết bị ghi',
      note: 'SQLite tại trạm GCS',
    },
  ]

  const degraded = modules.filter((m) => m.tone !== 'ok' && m.tone !== 'neutral')

  return (
    <PageFrame variant="scroll">
      <PageHeader
        title="Thiết bị & kết nối"
        infoTip="Chẩn đoán ba chặng: trình duyệt tới backend, backend tới Gateway ESP32, và 6 module trên tải. Thiếu dữ liệu hiển thị N/A."
        subtitle={`${modules.length} module · ${degraded.length === 0 ? 'tất cả bình thường' : `${degraded.length} cần chú ý`}`}
        badge={
          <span
            className={`inline-flex items-center gap-1.5 px-2 py-0.5 rounded-kvc-control border font-mono text-[11px] font-bold ${toneClasses[linkHealthy ? 'ok' : 'crit']}`}
          >
            {linkHealthy ? (
              <ShieldCheck className="h-3 w-3" />
            ) : (
              <ShieldAlert className="h-3 w-3" />
            )}
            {linkHealthy ? 'LIÊN KẾT OK' : 'LIÊN KẾT LỖI'}
          </span>
        }
        actions={
          <>
            <Button
              variant="outline"
              size="sm"
              onClick={() => switchSourceMode(source_mode === 'REAL' ? 'MOCK' : 'REAL')}
              className="h-8 text-xs gap-1.5 border-border shadow-xs cursor-pointer"
              title="Chuyển nhanh giữa Mô phỏng và Thực địa"
            >
              <span className="font-mono">{source_mode}</span>
            </Button>
            <Button
              size="sm"
              onClick={reconnect}
              className="h-8 text-xs gap-1.5 shadow-xs cursor-pointer"
              title="Thử kết nối lại WebSocket tới backend"
            >
              <RotateCcw className="h-3.5 w-3.5" />
              <span>Kết nối lại</span>
            </Button>
          </>
        }
      />

      {/* Dải chẩn đoán 4 chỉ số — quét nhanh trước khi đọc chi tiết.
          Gói/lỗi không lặp lại trong card nào khác nên giữ ở đây là nơi duy nhất.
          `divide` đổi theo số cột: 2 cột ở mobile thì phải kẻ ngang, không kẻ dọc
          (kẻ dọc ở 2 cột vẽ thêm một vạch lạc ở đầu hàng thứ hai). */}
      <div className="shrink-0 grid grid-cols-2 sm:grid-cols-4 divide-y divide-x-0 sm:divide-y-0 sm:divide-x divide-border rounded-kvc-panel border border-border bg-card shadow-xs">
        {[
          {
            label: 'Độ trễ gói',
            value: `${rx_age_ms} ms`,
            tone: is_stale ? ('crit' as Tone) : ('ok' as Tone),
          },
          {
            label: 'Gói đã nhận',
            value: new Intl.NumberFormat('vi-VN').format(diagnostics.packets_received_total),
            tone: 'neutral' as Tone,
          },
          {
            label: 'Lỗi giải mã',
            value: String(diagnostics.decode_errors_total),
            tone: diagnostics.decode_errors_total > 0 ? ('warn' as Tone) : ('neutral' as Tone),
          },
          {
            label: 'Gói rớt',
            value: String(diagnostics.ingress_drops_total),
            tone: diagnostics.ingress_drops_total > 0 ? ('warn' as Tone) : ('neutral' as Tone),
          },
        ].map((stat) => (
          <div key={stat.label} className="flex items-center justify-between gap-2 px-3 py-1.5 min-w-0">
            <span className="text-[11px] uppercase tracking-wider text-muted-foreground font-semibold truncate">
              {stat.label}
            </span>
            <span
              className={`font-mono text-sm font-black tabular-nums shrink-0 ${
                stat.tone === 'crit'
                  ? 'text-[var(--kvc-crit-ink)]'
                  : stat.tone === 'warn'
                    ? 'text-[var(--kvc-warn-ink)]'
                    : 'text-foreground'
              }`}
            >
              {stat.value}
            </span>
          </div>
        ))}
      </div>

      {/* Ba chặng liên kết — cùng một hàng, thứ tự đúng chiều dữ liệu đi */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-3">
        <LinkCard
          icon={<Server className="h-4 w-4" />}
          title="Trình duyệt tới Backend"
          infoTip="Kênh WebSocket hai chiều giữa giao diện web và dịch vụ FastAPI."
          tone={gcsTone}
          statusLabel={gcsLabel}
          caption="Kênh WebSocket GCS"
          rows={[
            { label: 'Địa chỉ', value: APP_CONFIG.WS_URL, mono: true },
            { label: 'Nguồn dữ liệu', value: source_mode, mono: true },
            {
              label: 'Độ trễ',
              value: `${rx_age_ms} ms${is_stale ? ' (mất tín hiệu)' : ''}`,
              mono: true,
            },
          ]}
        />

        <LinkCard
          icon={<Radio className="h-4 w-4" />}
          title="Backend tới ESP32"
          infoTip="Liên kết Ingress giữa backend FastAPI và Gateway ESP32-C3 thu gói 32 byte từ tải."
          tone={gwTone}
          statusLabel={esp32Status.shortLabel}
          caption="Ingress Gateway trạm đất"
          rows={[
            {
              label: 'Endpoint',
              value:
                hardware_link.port ||
                (source_mode === 'MOCK'
                  ? APP_CONFIG.MOCK_TRANSPORT === 'LOCAL'
                    ? 'Kịch bản nội bộ'
                    : 'Backend loopback'
                  : 'Chưa cấu hình'),
              mono: true,
            },
            { label: 'Tình trạng', value: esp32Status.description },
            {
              label: 'RSSI / SNR',
              value:
                telemetry.packet_rssi_dbm !== null
                  ? `${telemetry.packet_rssi_dbm} dBm / ${telemetry.packet_snr_db ?? 'N/A'} dB`
                  : source_mode === 'MOCK'
                    ? '-82 dBm / 7.5 dB (mô phỏng)'
                    : 'N/A',
              mono: true,
            },
          ]}
        />

        <LinkCard
          icon={<Cpu className="h-4 w-4" />}
          title="Cờ cảm biến"
          infoTip="Bốn bit hợp lệ tách từ gói 32 byte. HEX dựng từ các bit đang bật, không suy ngược."
          tone={hasAlarm ? 'warn' : 'ok'}
          statusLabel={hasAlarm ? 'CẦN KIỂM' : 'ĐỦ CỜ'}
          caption="Giải mã bit hợp lệ"
          rows={[]}
        >
          <div className="p-2.5">
            <SensorFlagsInspector
              gpsValid={telemetry.gps_valid}
              lidarValid={telemetry.lidar_valid}
              imuValid={telemetry.imu_valid}
              aiDetected={telemetry.ai_detected}
              sequenceNumber={sequence_number}
              hideTitle
            />
          </div>
        </LinkCard>
      </div>

      {/* Bảng module: 4 cột, gộp ghi chú vào ô tên để giảm chiều cao */}
      <section className="flex flex-col gap-2 min-w-0">
        <div className="flex items-center gap-1.5">
          <h2 className="text-xs font-bold text-muted-foreground uppercase tracking-wider">
            Module trên tải và trạm đất
          </h2>
          <InfoTip text="Tình trạng từng module theo dữ liệu gói tin hiện hành. Thiếu dữ liệu hiển thị N/A." />
        </div>

        <div className="border border-border rounded-kvc-panel bg-card overflow-hidden shadow-xs">
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead className="bg-muted/40">
                <tr className="border-b border-border">
                  <th className="text-left text-xs font-semibold kvc-density-cell w-[210px]">
                    Module
                  </th>
                  <th className="text-left text-xs font-semibold kvc-density-cell w-[140px]">
                    Trạng thái
                  </th>
                  <th className="text-left text-xs font-semibold kvc-density-cell">
                    Dữ liệu đo
                  </th>
                </tr>
              </thead>
              <tbody>
                {modules.map((mod) => (
                  <tr
                    key={mod.key}
                    className="border-b border-border/50 last:border-0 hover:bg-muted/25"
                  >
                    <td className="kvc-density-cell">
                      <div className="flex items-start gap-2 min-w-0">
                        <span className="mt-0.5 shrink-0 text-muted-foreground">{mod.icon}</span>
                        <div className="flex flex-col min-w-0">
                          <span className="text-xs font-semibold text-foreground truncate">
                            {mod.name}
                          </span>
                          <span className="text-[11px] text-muted-foreground truncate">
                            {mod.note}
                          </span>
                        </div>
                      </div>
                    </td>
                    <td className="kvc-density-cell">
                      <span
                        className={`inline-flex items-center px-1.5 py-0 rounded-kvc-control border font-mono text-[11px] font-bold whitespace-nowrap ${toneClasses[mod.tone]}`}
                      >
                        {mod.statusLabel}
                      </span>
                    </td>
                    <td className="kvc-density-cell">
                      <span
                        className="text-[11px] font-mono text-foreground tabular-nums line-clamp-2"
                        title={mod.reading}
                      >
                        {mod.reading}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </section>
    </PageFrame>
  )
}
