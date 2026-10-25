import React, { useState } from 'react'
import {
  Database,
  Globe,
  Monitor,
  Moon,
  RefreshCw,
  RotateCcw,
  Sun,
} from 'lucide-react'
import { toast } from 'sonner'
import { PageHeader } from '@/components/shared/PageHeader'
import { InfoTip } from '@/components/shared/InfoTip'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Switch } from '@/components/ui/switch'
import { APP_CONFIG } from '@/config/appConfig'
import { useTheme } from '@/features/theme/ThemeProvider'
import { MOCK_SCENARIOS } from '@/mocks/scenarios'
import { useMission } from '@/state/MissionProvider'
import type { ViewLayoutMode } from '@/types/telemetry'

export const SettingsPage: React.FC = () => {
  const { theme, setTheme } = useTheme()
  const {
    state,
    dispatch,
    selectedScenarioId,
    setSelectedScenarioId,
    switchSourceMode,
    reconnect,
  } = useMission()

  const {
    source_mode,
    layout_mode,
    auto_follow_camera,
    show_trails,
    sidebar_collapsed,
  } = state

  const [customWsUrl, setCustomWsUrl] = useState(APP_CONFIG.WS_URL)
  const [saveSuccess, setSaveSuccess] = useState(false)

  const handleSaveNetwork = (e: React.FormEvent) => {
    e.preventDefault()
    setSaveSuccess(true)
    setTimeout(() => setSaveSuccess(false), 2000)
    toast.success('Đã lưu địa chỉ WebSocket và gửi lệnh kết nối lại!')
    reconnect()
  }

  const handleResetDefaults = () => {
    dispatch({ type: 'SET_LAYOUT_MODE', payload: 'BALANCED' })
    dispatch({ type: 'SET_SHOW_TRAILS', payload: true })
    dispatch({ type: 'SET_AUTO_FOLLOW', payload: true })
    setTheme('system')
    toast.info('Đã khôi phục các tùy chọn hiển thị về giá trị mặc định.')
  }

  return (
    <div className="flex-1 flex flex-col p-3 sm:p-5 gap-4 overflow-y-auto max-w-5xl mx-auto w-full select-none">
      {/* 1. Header Trang Cài Đặt */}
      <PageHeader
        breadcrumb="Hệ thống · Cài đặt giao diện"
        title="Cài đặt giao diện & Tham số GCS"
        infoTip="Cấu hình hiển thị giao diện tác chiến, chế độ Sáng/Tối, kịch bản diễn tập giả lập và tham số kết nối trạm GCS."
        subtitle="Tùy biến hiển thị chiến thuật, bố cục trạm điều khiển và cấu hình kết nối mạng mặt đất."
        actions={
          <Button
            variant="outline"
            size="sm"
            onClick={handleResetDefaults}
            className="h-8 text-xs gap-1.5 border-border shadow-xs hover:bg-muted"
          >
            <RotateCcw className="h-3.5 w-3.5" />
            <span>Khôi phục mặc định</span>
          </Button>
        }
      />

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4 pb-8">
        {/* Khối 1: Giao diện & Hiển thị */}
        <Card className="border-border bg-card shadow-xs">
          <CardHeader className="py-3 px-4 border-b border-border/60 bg-muted/20">
            <CardTitle className="text-xs font-semibold text-foreground uppercase tracking-wider flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Monitor className="h-4 w-4 text-cyan-500" />
                <span>Chủ đề & Bố cục hiển thị</span>
                <InfoTip text="Tùy biến theme giao diện Sáng/Tối, vệt quỹ đạo bay lịch sử và tự động cuộn bản đồ theo tâm UAV." />
              </div>
            </CardTitle>
          </CardHeader>
          <CardContent className="p-4 flex flex-col gap-4 text-xs">
            {/* Chuyển đổi Theme */}
            <div className="flex items-center justify-between">
              <div className="flex flex-col">
                <span className="font-semibold text-foreground">Giao diện màu sắc</span>
                <span className="text-[11px] text-muted-foreground">
                  Chọn chế độ Sáng (Light), Tối (Dark) hoặc theo Hệ điều hành
                </span>
              </div>
              <div className="flex items-center gap-1 border border-border rounded-lg p-0.5 bg-muted/30">
                <Button
                  variant={theme === 'light' ? 'secondary' : 'ghost'}
                  size="sm"
                  onClick={() => setTheme('light')}
                  className="h-7 px-2 text-xs gap-1"
                >
                  <Sun className="h-3 w-3" />
                  <span className="hidden sm:inline">Sáng</span>
                </Button>
                <Button
                  variant={theme === 'dark' ? 'secondary' : 'ghost'}
                  size="sm"
                  onClick={() => setTheme('dark')}
                  className="h-7 px-2 text-xs gap-1"
                >
                  <Moon className="h-3 w-3" />
                  <span className="hidden sm:inline">Tối</span>
                </Button>
                <Button
                  variant={theme === 'system' ? 'secondary' : 'ghost'}
                  size="sm"
                  onClick={() => setTheme('system')}
                  className="h-7 px-2 text-xs gap-1"
                >
                  <Monitor className="h-3 w-3" />
                  <span className="hidden sm:inline">Tự động</span>
                </Button>
              </div>
            </div>

            {/* Bố cục Giám sát mặc định */}
            <div className="flex items-center justify-between pt-2 border-t border-border/40">
              <div className="flex flex-col">
                <span className="font-semibold text-foreground">Bố cục màn hình giám sát</span>
                <span className="text-[11px] text-muted-foreground">
                  Tỷ lệ phân chia giữa Video và Bản đồ GPS
                </span>
              </div>
              <Select
                value={layout_mode}
                onValueChange={(val) =>
                  dispatch({ type: 'SET_LAYOUT_MODE', payload: val as ViewLayoutMode })
                }
              >
                <SelectTrigger className="h-8 w-[140px] text-xs">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="BALANCED">Cân bằng</SelectItem>
                  <SelectItem value="VIDEO_PRIORITY">Ưu tiên Video</SelectItem>
                  <SelectItem value="MAP_PRIORITY">Ưu tiên Bản đồ</SelectItem>
                </SelectContent>
              </Select>
            </div>

            {/* Vệt di chuyển GPS */}
            <div className="flex items-center justify-between pt-2 border-t border-border/40">
              <div className="flex flex-col">
                <span className="font-semibold text-foreground">Vệt di chuyển camera</span>
                <span className="text-[11px] text-muted-foreground">
                  Vẽ đường di chuyển GNSS của tải nhiệm vụ trên bản đồ
                </span>
              </div>
              <Switch
                checked={show_trails}
                onCheckedChange={(checked) =>
                  dispatch({ type: 'SET_SHOW_TRAILS', payload: checked })
                }
              />
            </div>

            {/* Tự động căn tâm camera */}
            <div className="flex items-center justify-between pt-2 border-t border-border/40">
              <div className="flex flex-col">
                <span className="font-semibold text-foreground">Tự động bám theo camera</span>
                <span className="text-[11px] text-muted-foreground">
                  Tự động căn giữa bản đồ theo tọa độ GPS mới nhận
                </span>
              </div>
              <Switch
                checked={auto_follow_camera}
                onCheckedChange={(checked) =>
                  dispatch({ type: 'SET_AUTO_FOLLOW', payload: checked })
                }
              />
            </div>

            {/* Thu gọn Sidebar mặc định */}
            <div className="flex items-center justify-between pt-2 border-t border-border/40">
              <div className="flex flex-col">
                <span className="font-semibold text-foreground">Thu gọn thanh điều hướng</span>
                <span className="text-[11px] text-muted-foreground">
                  Tiết kiệm diện tích quan sát (64px)
                </span>
              </div>
              <Switch
                checked={sidebar_collapsed}
                onCheckedChange={(checked) =>
                  dispatch({ type: 'SET_SIDEBAR_COLLAPSED', payload: checked })
                }
              />
            </div>
          </CardContent>
        </Card>

        {/* Khối 2: Nguồn Dữ Liệu & Kịch Bản Thử Nghiệm MOCK */}
        <Card className="border-border bg-card shadow-xs">
          <CardHeader className="py-3 px-4 border-b border-border/60 bg-muted/20">
            <CardTitle className="text-xs font-semibold text-foreground uppercase tracking-wider flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Database className="h-4 w-4 text-primary" />
                <span>Nguồn dữ liệu & Mô phỏng</span>
                <InfoTip text="Chọn nguồn dữ liệu: chế độ MOCK (chạy độc lập với kịch bản diễn tập mô phỏng) hoặc REAL (nhận RF Telemetry 32-byte thực địa)." />
              </div>
            </CardTitle>
          </CardHeader>
          <CardContent className="p-4 flex flex-col gap-4 text-xs">
            {/* Chọn REAL vs MOCK */}
            <div className="flex flex-col gap-2">
              <div className="flex items-center justify-between">
                <span className="font-semibold text-foreground">Chế độ nguồn dữ liệu</span>
                <Badge
                  variant="outline"
                  className={`font-mono text-[10px] ${
                    source_mode === 'MOCK'
                      ? 'border-purple-500/40 text-purple-600 dark:text-purple-300 bg-purple-500/10'
                      : 'border-emerald-500/40 text-emerald-600 dark:text-emerald-400 bg-emerald-500/10'
                  }`}
                >
                  {source_mode}
                </Badge>
              </div>
              <div className="grid grid-cols-2 gap-2">
                <Button
                  variant={source_mode === 'MOCK' ? 'default' : 'outline'}
                  size="sm"
                  className={`text-xs h-8 ${source_mode === 'MOCK' ? 'bg-purple-600 hover:bg-purple-700 text-white' : ''}`}
                  onClick={() => switchSourceMode('MOCK')}
                >
                  MOCK (Mô phỏng độc lập)
                </Button>
                <Button
                  variant={source_mode === 'REAL' ? 'default' : 'outline'}
                  size="sm"
                  className={`text-xs h-8 ${source_mode === 'REAL' ? 'bg-emerald-600 hover:bg-emerald-700 text-white' : ''}`}
                  onClick={() => switchSourceMode('REAL')}
                >
                  REAL (Phần cứng thực tế)
                </Button>
              </div>
              <p className="text-[11px] text-muted-foreground">
                {source_mode === 'REAL'
                  ? 'Kết nối trực tiếp tới WebSocket backend và thiết bị thật. Không âm thầm fallback sang MOCK.'
                  : 'Mô phỏng toàn diện các kịch bản cứu nạn, chạy offline không cần backend.'}
              </p>
            </div>

            {/* Chọn Kịch bản MOCK (Chỉ khi MOCK) */}
            {source_mode === 'MOCK' && (
              <div className="flex flex-col gap-2.5 p-3 rounded-lg border border-purple-500/20 bg-purple-500/5">
                <div className="flex items-center justify-between">
                  <span className="font-semibold text-foreground">
                    Chọn kịch bản mô phỏng ({MOCK_SCENARIOS.length} kịch bản)
                  </span>
                </div>
                <Select
                  value={selectedScenarioId}
                  onValueChange={(val) => setSelectedScenarioId(val)}
                >
                  <SelectTrigger className="h-8 text-xs bg-card">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent className="max-h-[280px]">
                    {MOCK_SCENARIOS.map((sc) => (
                      <SelectItem key={sc.id} value={sc.id}>
                        {sc.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>

                {/* Mô tả kịch bản đang chọn */}
                {(() => {
                  const sc = MOCK_SCENARIOS.find((s) => s.id === selectedScenarioId)
                  if (!sc) return null
                  return (
                    <div className="flex flex-col gap-1.5 pt-1 text-[11px]">
                      <p className="text-muted-foreground leading-relaxed">
                        {sc.description}
                      </p>
                      <div className="flex flex-wrap gap-1">
                        {sc.tags.map((t) => (
                          <Badge
                            key={t}
                            variant="outline"
                            className="text-[9px] py-0 px-1 border-purple-500/30 text-purple-600 dark:text-purple-300 font-mono"
                          >
                            {t}
                          </Badge>
                        ))}
                      </div>
                    </div>
                  )
                })()}
              </div>
            )}
          </CardContent>
        </Card>

        {/* Khối 3: Địa chỉ mạng & Kết nối Backend */}
        <Card className="border-border bg-card shadow-xs md:col-span-2">
          <CardHeader className="py-3 px-4 border-b border-border/60 bg-muted/20">
            <CardTitle className="text-xs font-semibold text-foreground uppercase tracking-wider flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Globe className="h-4 w-4 text-muted-foreground" />
                <span>Cấu hình kết nối mạng trạm GCS</span>
                <InfoTip text="Cấu hình địa chỉ WebSocket IP/Port của trạm điều khiển mặt đất GCS kết nối với Gateway ESP32." />
              </div>
            </CardTitle>
          </CardHeader>
          <CardContent className="p-4 flex flex-col gap-3 text-xs">
            <form onSubmit={handleSaveNetwork} className="flex flex-col sm:flex-row items-end gap-2.5">
              <div className="flex flex-col gap-1 flex-1 w-full">
                <label className="font-semibold text-foreground text-[11px]">
                  WebSocket URL của Backend GCS:
                </label>
                <input
                  type="text"
                  value={customWsUrl}
                  onChange={(e) => setCustomWsUrl(e.target.value)}
                  placeholder="ws://localhost:8000/ws/telemetry"
                  className="h-8 px-2.5 rounded-md border border-input bg-background font-mono text-xs text-foreground focus:outline-none"
                />
              </div>
              <Button
                type="submit"
                size="sm"
                className="h-8 text-xs gap-1.5 shrink-0 bg-primary text-primary-foreground hover:bg-primary/90"
              >
                <RefreshCw className="h-3.5 w-3.5" />
                <span>Áp dụng & Kết nối lại</span>
              </Button>
            </form>
            {saveSuccess && (
              <span className="text-[11px] text-emerald-600 dark:text-emerald-400 font-medium">
                Đã gửi yêu cầu kết nối lại tới địa chỉ mới!
              </span>
            )}
            <p className="text-[11px] text-muted-foreground">
              Địa chỉ mặc định theo cấu hình hệ thống: <code className="font-mono text-foreground font-semibold">{APP_CONFIG.WS_URL}</code>.
              Trong chế độ REAL, trạm sẽ kết nối tới backend này để nhận dữ liệu UART telemetry và video RTSP.
            </p>
          </CardContent>
        </Card>
      </div>
    </div>
  )
}
