import React, { useEffect, useState } from 'react'
import {
  AlertTriangle,
  ArrowRight,
  CheckCircle2,
  Play,
  Video,
} from 'lucide-react'
import { toast } from 'sonner'
import { useAppRouter } from '@/app/routes'
import { Button } from '@/components/ui/button'
import { InfoTip } from '@/components/shared/InfoTip'
import { getEsp32PhysicalStatus } from '@/lib/connectionStatus'
import { RecentDetectionsTable } from '@/features/telemetry/RecentDetectionsTable'
import { TopStatCards } from '@/features/telemetry/TopStatCards'
import { UavHardwareGaugeCard } from '@/features/telemetry/UavHardwareGaugeCard'
import { useMission } from '@/state/MissionProvider'

export const OverviewPage: React.FC = () => {
  const { state, setSelectedScenarioId, switchSourceMode } = useMission()
  const { navigate } = useAppRouter()
  const {
    alerts,
    session_id,
    is_stale,
    source_mode,
    ws_connected,
    hardware_link,
    rx_age_ms,
  } = state

  const esp32Status = getEsp32PhysicalStatus(source_mode, ws_connected, hardware_link, is_stale, rx_age_ms)

  const [clockTime, setClockTime] = useState<string>('N/A')

  useEffect(() => {
    const updateTime = () => {
      const now = new Date()
      setClockTime(now.toLocaleTimeString('vi-VN', { hour12: false }))
    }
    updateTime()
    const timer = setInterval(updateTime, 1000)
    return () => clearInterval(timer)
  }, [])

  const activeAlerts = alerts.filter((a) => a.active)

  const handleStartDemoScenario = () => {
    switchSourceMode('MOCK')
    setSelectedScenarioId('NORMAL_GPS_TARGET')
    toast.success('Đã kích hoạt kịch bản diễn tập cứu nạn: Phát hiện người trôi dạt & bám bắt GPS.')
  }

  return (
    <div className="flex-1 min-h-0 flex flex-col p-3 sm:p-5 gap-4 sm:gap-5 overflow-y-auto max-w-7xl mx-auto w-full select-none">
      {/* 1. Header Trang Tổng Quan Tác Chiến (Mission Banner Title Area) */}
      <div className="shrink-0 flex flex-col lg:flex-row lg:items-center justify-between gap-3 pb-3 border-b border-border/60">
        <div className="flex flex-col gap-1">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="px-2 py-0.5 rounded bg-primary/15 text-primary font-mono text-[11px] uppercase tracking-widest font-bold border border-primary/25">
              KVC TACTICAL FEED
            </span>
            <span className="font-mono text-xs text-muted-foreground">
              UTC+7 {clockTime}
            </span>
            <span className="text-xs text-muted-foreground hidden sm:inline">•</span>
            <span className="text-xs text-muted-foreground hidden sm:inline">
              Tổng quan nhiệm vụ tìm kiếm cứu nạn
            </span>
          </div>
          <div className="flex items-center gap-2">
            <h1 className="text-lg sm:text-xl font-bold tracking-tight uppercase text-foreground">
              BẢNG ĐIỀU KHIỂN TÁC CHIẾN SAR — TỔNG QUAN PHIÊN BAY <span className="text-primary">#{session_id || 'N/A'}</span>
            </h1>
            <InfoTip text="Bảng điều khiển tác chiến SAR: Giám sát toàn diện chuỗi tìm kiếm cứu nạn từ phát hiện đối tượng Người/Tàu thuyền, định vị GPS, đo độ cao mặt nước tới pin tải." />
          </div>
          <p className="text-xs text-muted-foreground">
            Bảng theo dõi chuỗi giá trị cứu nạn: Phát hiện → Định vị → Theo dõi → Cảnh báo → Bằng chứng.
          </p>
        </div>

        <div className="flex items-center gap-2 flex-wrap">
          {/* Subsystem Health Badge - Cập nhật trung thực tình trạng kết nối vật lý */}
          <div
            className={`flex items-center gap-2 px-3 py-1.5 rounded-kvc-panel bg-card border shadow-2xs ${
              esp32Status.status === 'LIVE'
                ? 'border-[var(--kvc-ok-line)]'
                : esp32Status.status === 'LOST_SIGNAL'
                ? 'border-[var(--kvc-crit-line)] bg-[var(--kvc-crit)]/5'
                : esp32Status.status === 'WAITING'
                ? 'border-[var(--kvc-crit-line)] bg-[var(--kvc-crit)]/5'
                : esp32Status.status === 'BACKEND_DOWN'
                ? 'border-[var(--kvc-crit-line)] bg-[var(--kvc-crit-bg)]'
                : 'border-[var(--kvc-mock-line)]'
            }`}
          >
            <span className="relative flex h-2.5 w-2.5">
              {esp32Status.pingClass && (
                <span className={`animate-ping absolute inline-flex h-full w-full rounded-full ${esp32Status.pingClass} opacity-75`} />
              )}
              <span className={`relative inline-flex rounded-full h-2.5 w-2.5 ${esp32Status.dotColorClass}`} />
            </span>
            <div className="flex flex-col">
              <span className="text-[11px] font-mono uppercase text-muted-foreground">
                {source_mode === 'REAL' ? 'Liên kết Gateway ESP32' : 'Trạng thái kết nối tải'}
              </span>
              <span
                className={`font-mono text-xs font-bold ${
                  esp32Status.status === 'LIVE'
                    ? 'text-[var(--kvc-ok-ink)]'
                    : esp32Status.status === 'LOST_SIGNAL' || esp32Status.status === 'BACKEND_DOWN' || esp32Status.status === 'WAITING'
                    ? 'text-[var(--kvc-crit-ink)]'
                    : 'text-[var(--kvc-mock-ink)]'
                }`}
              >
                {source_mode === 'REAL' ? esp32Status.label : 'MÔ PHỎNG (8/8 SUBSYSTEMS)'}
              </span>
            </div>
            {esp32Status.status === 'LIVE' ? (
              <CheckCircle2 className="h-4 w-4 text-[var(--kvc-ok-ink)] ml-1" />
            ) : esp32Status.status === 'LOST_SIGNAL' || esp32Status.status === 'BACKEND_DOWN' || esp32Status.status === 'WAITING' ? (
              <AlertTriangle className="h-4 w-4 text-[var(--kvc-crit-ink)] ml-1" />
            ) : (
              <CheckCircle2 className="h-4 w-4 text-[var(--kvc-mock-ink)] ml-1" />
            )}
          </div>

          {/* Action Buttons */}
          <Button
            variant="outline"
            size="sm"
            onClick={handleStartDemoScenario}
            className="h-8 text-xs gap-1.5 border-[var(--kvc-mock-line)] text-[var(--kvc-mock-ink)] hover:bg-[var(--kvc-mock-bg)] shadow-2xs"
            title="Kích hoạt nhanh kịch bản diễn tập cứu nạn trong 1 nhấp"
          >
            <Play className="h-3 w-3 fill-current" />
            <span>Diễn tập mẫu</span>
          </Button>
          <Button
            variant="outline"
            size="sm"
            onClick={() => navigate('/alerts')}
            className="h-8 text-xs gap-1.5 border-border hover:border-[var(--kvc-warn-line)]"
          >
            <AlertTriangle className={`h-3.5 w-3.5 ${activeAlerts.length > 0 ? 'text-[var(--kvc-warn-ink)]' : 'text-muted-foreground'}`} />
            <span>Cảnh báo ({activeAlerts.length})</span>
          </Button>
          <Button
            size="sm"
            onClick={() => navigate('/mission')}
            className="h-8 text-xs gap-1.5 bg-primary text-primary-foreground hover:bg-primary/90 shadow-2xs"
          >
            <Video className="h-3.5 w-3.5" />
            <span>Mở Trực tiếp</span>
            <ArrowRight className="h-3 w-3" />
          </Button>
        </div>
      </div>

      {/* 2. Row 1: 4 Tactical Stat Cards */}
      <TopStatCards />

      {/* 3. Row 2: Nguồn/pin và các khối theo BOM KVC */}
      <UavHardwareGaugeCard />

      {/* 4. Row 3: Lịch sử nhận diện thời gian thực (Detection Log) */}
      <RecentDetectionsTable />

      {/* 5. Telemetry Ticker Footer Bar (Single Line Console Status) */}
      <div className="shrink-0 w-full rounded-kvc-panel bg-card border border-border p-2.5 sm:p-3 overflow-hidden shadow-2xs">
        <div className="flex flex-wrap items-center justify-between gap-y-2 gap-x-4 font-mono text-[11px] text-muted-foreground">
          <div className="flex items-center gap-2">
            <span className="w-2 h-2 rounded-full bg-[var(--kvc-ok)] " />
            <span className="text-foreground font-bold uppercase tracking-wider">KVC LIVE CONSOLE:</span>
            <span className="text-primary font-bold">PHIÊN #{session_id || (source_mode === 'MOCK' ? 'MOCK-SESSION' : 'CHƯA CÓ PHIÊN')}</span>
            <InfoTip text="Băng thông tin tóm lược luồng dữ liệu thời gian thực: Mã phiên bay, kênh RF LoRa 433MHz, cổng Gateway ESP32-C3 và trạng thái kết nối tổng thể." />
          </div>
          <div className="flex items-center gap-1.5">
            <span className="text-muted-foreground">KÊNH TRUYỀN:</span>
            <span className="text-foreground font-bold">{source_mode === 'REAL' ? 'LoRa Ra-02 SX1278 (433MHz)' : 'Virtual Bus / Mock'}</span>
          </div>
          <div className="flex items-center gap-1.5">
            <span className="text-muted-foreground">TRẠM ĐẤT:</span>
            <span className="text-foreground font-bold">{source_mode === 'REAL' ? (hardware_link.status === 'CONNECTED' ? 'ESP32-C3 SoftAP (:8080)' : 'Chưa có Ingress') : 'Localhost Backend (:8000)'}</span>
          </div>
          <div className="flex items-center gap-1.5">
            <span className="text-muted-foreground">LIÊN KẾT:</span>
            <span className={`font-bold ${esp32Status.status === 'LIVE' ? 'text-[var(--kvc-ok-ink)]' : 'text-[var(--kvc-warn-ink)]'}`}>
              {esp32Status.shortLabel}
            </span>
          </div>
          <div className="flex items-center gap-1.5">
            <span className="text-muted-foreground">CHẾ ĐỘ NGUỒN:</span>
            <span className="text-primary font-bold">{source_mode}</span>
          </div>
        </div>
      </div>
    </div>
  )
}
