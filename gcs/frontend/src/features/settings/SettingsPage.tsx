import React, { useState } from 'react'
import {
  Check,
  Compass,
  Copy,
  Database,
  Globe,
  Layers,
  Monitor,
  Moon,
  Palette,
  Radio,
  RefreshCw,
  RotateCcw,
  Rows3,
  Rows4,
  Sun,
  Wifi,
  WifiOff,
} from 'lucide-react'
import { toast } from 'sonner'
import { InfoTip } from '@/components/shared/InfoTip'
import { PageFrame } from '@/components/shared/PageFrame'
import { PageHeader } from '@/components/shared/PageHeader'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Switch } from '@/components/ui/switch'
import { APP_CONFIG } from '@/config/appConfig'
import { useDensity } from '@/features/theme/densityContext'
import { useTheme } from '@/features/theme/ThemeProvider'
import { MOCK_SCENARIOS } from '@/mocks/scenarios'
import { useMission } from '@/state/MissionProvider'
import type { ViewLayoutMode } from '@/types/telemetry'

/** Thẻ khối cài đặt chuyên nghiệp với tiêu đề, biểu tượng và badge trạng thái */
const SettingsCard: React.FC<{
  icon: React.ReactNode
  title: string
  badgeText?: string
  badgeVariant?: 'default' | 'outline' | 'secondary'
  badgeColorClass?: string
  infoTip: string
  children: React.ReactNode
  className?: string
}> = ({
  icon,
  title,
  badgeText,
  badgeVariant = 'outline',
  badgeColorClass = '',
  infoTip,
  children,
  className = '',
}) => (
  <section
    className={`rounded-kvc-panel border border-border bg-card shadow-xs overflow-hidden flex flex-col ${className}`}
  >
    <div className="flex items-center justify-between gap-2 px-3.5 py-2.5 border-b border-border/60 bg-muted/30">
      <div className="flex items-center gap-2 min-w-0">
        <span className="text-primary shrink-0">{icon}</span>
        <h2 className="text-xs font-bold text-foreground uppercase tracking-wider truncate">
          {title}
        </h2>
        <InfoTip text={infoTip} />
      </div>
      {badgeText && (
        <Badge
          variant={badgeVariant}
          className={`text-[11px] font-mono shrink-0 ${badgeColorClass}`}
        >
          {badgeText}
        </Badge>
      )}
    </div>
    <div className="flex-1 flex flex-col divide-y divide-border/40 p-1">{children}</div>
  </section>
)

/** Một dòng cài đặt chuẩn: nhãn + mô tả bên trái, điều khiển bên phải */
const SettingsRow: React.FC<{
  label: string
  hint: string
  children: React.ReactNode
}> = ({ label, hint, children }) => (
  <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 px-3 py-2.5 hover:bg-muted/20 transition-colors rounded-sm">
    <div className="flex flex-col gap-0.5 min-w-0 pr-2">
      <span className="text-xs font-medium text-foreground">{label}</span>
      <span className="text-[11px] text-muted-foreground leading-snug">{hint}</span>
    </div>
    <div className="flex items-center shrink-0 self-start sm:self-center">{children}</div>
  </div>
)

/** Thanh nút bấm chọn giá trị phân đoạn (Segmented Control) */
const Segmented: React.FC<{
  value: string
  options: Array<{ value: string; label: string; icon: React.ReactNode }>
  onChange: (value: string) => void
  ariaLabel: string
}> = ({ value, options, onChange, ariaLabel }) => (
  <div
    className="inline-flex items-center gap-0.5 border border-border rounded-kvc-control p-0.5 bg-muted/40 shadow-2xs"
    role="group"
    aria-label={ariaLabel}
  >
    {options.map((opt) => {
      const active = value === opt.value
      return (
        <Button
          key={opt.value}
          variant={active ? 'secondary' : 'ghost'}
          size="sm"
          onClick={() => onChange(opt.value)}
          aria-pressed={active}
          className={`h-7 px-2.5 text-xs gap-1.5 cursor-pointer font-medium transition-all ${
            active
              ? 'bg-background shadow-xs text-foreground font-semibold'
              : 'text-muted-foreground hover:text-foreground'
          }`}
        >
          {opt.icon}
          <span>{opt.label}</span>
        </Button>
      )
    })}
  </div>
)

export const SettingsPage: React.FC = () => {
  const { theme, setTheme } = useTheme()
  const { density, setDensity } = useDensity()
  const {
    state,
    dispatch,
    selectedScenarioId,
    setSelectedScenarioId,
    switchSourceMode,
    wsUrl,
    setWsUrl,
  } = useMission()

  const {
    source_mode,
    layout_mode,
    auto_follow_camera,
    show_trails,
    sidebar_collapsed,
    ws_connected,
  } = state

  const [customWsUrl, setCustomWsUrl] = useState(() => wsUrl)
  const [saveSuccess, setSaveSuccess] = useState(false)
  const [wsError, setWsError] = useState<string | null>(null)
  const [copiedWsUrl, setCopiedWsUrl] = useState(false)

  const handleSaveNetwork = (e: React.FormEvent) => {
    e.preventDefault()
    const result = setWsUrl(customWsUrl)
    if (!result.ok) {
      setWsError(result.error ?? 'Không áp dụng được địa chỉ WebSocket.')
      setSaveSuccess(false)
      toast.error(result.error ?? 'Không áp dụng được địa chỉ WebSocket.')
      return
    }
    setWsError(null)
    setCustomWsUrl(customWsUrl.trim())
    setSaveSuccess(true)
    setTimeout(() => setSaveSuccess(false), 2000)
    toast.success('Đã áp dụng địa chỉ WebSocket mới.')
  }

  const handleRestoreWsDefault = () => {
    const result = setWsUrl(APP_CONFIG.WS_URL)
    if (result.ok) {
      setCustomWsUrl(APP_CONFIG.WS_URL)
      setWsError(null)
      toast.info('Đã khôi phục địa chỉ WebSocket mặc định.')
    }
  }

  const handleResetDefaults = () => {
    dispatch({ type: 'SET_LAYOUT_MODE', payload: 'BALANCED' })
    dispatch({ type: 'SET_SHOW_TRAILS', payload: true })
    dispatch({ type: 'SET_AUTO_FOLLOW', payload: true })
    setTheme('system')
    setDensity(APP_CONFIG.DEFAULT_DENSITY)
    toast.info('Đã khôi phục các tùy chọn hiển thị về giá trị mặc định.')
  }

  const handleCopyWsUrl = () => {
    void navigator.clipboard.writeText(wsUrl).then(() => {
      setCopiedWsUrl(true)
      setTimeout(() => setCopiedWsUrl(false), 2000)
      toast.success('Đã sao chép địa chỉ WebSocket vào clipboard')
    })
  }

  const activeScenario = MOCK_SCENARIOS.find((s) => s.id === selectedScenarioId)

  return (
    <PageFrame variant="scroll" maxWidthClass="max-w-6xl">
      <PageHeader
        title="Cài đặt"
        infoTip="Tùy biến hiển thị, chọn nguồn dữ liệu tác chiến và cấu hình kết nối mạng telemetry. Thay đổi được lưu tự động trên trình duyệt."
        subtitle="Hiển thị · Nguồn dữ liệu · Kết nối mạng"
        badge={
          <Badge
            variant="outline"
            className={`font-mono text-[11px] px-2 py-0.5 ${
              source_mode === 'REAL'
                ? 'border-[var(--kvc-ok-line)] text-[var(--kvc-ok-ink)] bg-[var(--kvc-ok-bg)]'
                : 'border-[var(--kvc-mock-line)] text-[var(--kvc-mock-ink)] bg-[var(--kvc-mock-bg)]'
            }`}
          >
            {source_mode}
          </Badge>
        }
        actions={
          <Button
            variant="outline"
            size="sm"
            onClick={handleResetDefaults}
            className="h-8 text-xs gap-1.5 border-border shadow-2xs hover:border-primary/50 cursor-pointer"
          >
            <RotateCcw className="h-3.5 w-3.5" />
            <span>Khôi phục mặc định</span>
          </Button>
        }
      />

      {/* Lưới bố cục 2 cột cân xứng tuyệt đối */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-3.5 items-stretch">
        {/* KHỐI 1 — Giao diện & Hiển thị */}
        <SettingsCard
          icon={<Palette className="h-4 w-4" />}
          title="Giao diện & Mật độ"
          infoTip="Chủ đề màu sắc, mật độ bố trí dữ liệu và chế độ thu gọn thanh bên. Thay đổi có hiệu lực ngay lập tức."
        >
          <SettingsRow label="Chủ đề màu" hint="Sáng, tối hoặc tự động theo hệ điều hành">
            <Segmented
              value={theme ?? 'system'}
              ariaLabel="Chọn chủ đề"
              onChange={(v) => setTheme(v as 'light' | 'dark' | 'system')}
              options={[
                { value: 'light', label: 'Sáng', icon: <Sun className="h-3.5 w-3.5" /> },
                { value: 'dark', label: 'Tối', icon: <Moon className="h-3.5 w-3.5" /> },
                { value: 'system', label: 'Tự động', icon: <Monitor className="h-3.5 w-3.5" /> },
              ]}
            />
          </SettingsRow>

          <SettingsRow label="Mật độ hiển thị" hint="Thoáng cho màn hình lớn hoặc Gọn để quan sát nhiều thông số">
            <Segmented
              value={density}
              ariaLabel="Chọn mật độ hiển thị"
              onChange={(v) => setDensity(v as 'comfortable' | 'compact')}
              options={[
                { value: 'comfortable', label: 'Thoáng', icon: <Rows3 className="h-3.5 w-3.5" /> },
                { value: 'compact', label: 'Gọn', icon: <Rows4 className="h-3.5 w-3.5" /> },
              ]}
            />
          </SettingsRow>

          <SettingsRow label="Thu gọn thanh điều hướng" hint="Thu nhỏ thanh bên trái để giải phóng tối đa diện tích quan sát">
            <Switch
              checked={sidebar_collapsed}
              onCheckedChange={(checked) =>
                dispatch({ type: 'SET_SIDEBAR_COLLAPSED', payload: checked })
              }
              aria-label="Thu gọn thanh điều hướng"
            />
          </SettingsRow>
        </SettingsCard>

        {/* KHỐI 2 — Bản đồ & Tác chiến */}
        <SettingsCard
          icon={<Compass className="h-4 w-4" />}
          title="Bản đồ & Tác chiến"
          infoTip="Cấu hình hiển thị bản đồ định vị GPS, vẽ vệt hành trình và tỷ lệ phân chia khung nhìn tác chiến."
        >
          <SettingsRow label="Vệt di chuyển GNSS" hint="Vẽ đường quỹ đạo di chuyển thực của tải cứu nạn trên bản đồ">
            <Switch
              checked={show_trails}
              onCheckedChange={(checked) =>
                dispatch({ type: 'SET_SHOW_TRAILS', payload: checked })
              }
              aria-label="Vệt di chuyển camera"
            />
          </SettingsRow>

          <SettingsRow label="Tự động bám camera" hint="Tự căn giữa bản đồ theo vị trí GPS UAV mới nhận">
            <Switch
              checked={auto_follow_camera}
              onCheckedChange={(checked) =>
                dispatch({ type: 'SET_AUTO_FOLLOW', payload: checked })
              }
              aria-label="Tự động bám theo camera"
            />
          </SettingsRow>

          <SettingsRow label="Bố cục khung nhìn" hint="Tỷ lệ phân chia giữa luồng video quang học và bản đồ GPS">
            <Select
              value={layout_mode}
              onValueChange={(val) =>
                dispatch({ type: 'SET_LAYOUT_MODE', payload: val as ViewLayoutMode })
              }
            >
              <SelectTrigger className="h-7 w-[140px] text-xs bg-background" aria-label="Bố cục giám sát">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="BALANCED">Cân bằng</SelectItem>
                <SelectItem value="VIDEO_PRIORITY">Ưu tiên Video</SelectItem>
                <SelectItem value="MAP_PRIORITY">Ưu tiên Bản đồ</SelectItem>
              </SelectContent>
            </Select>
          </SettingsRow>
        </SettingsCard>

        {/* KHỐI 3 — Nguồn dữ liệu tác chiến */}
        <SettingsCard
          icon={<Database className="h-4 w-4" />}
          title="Nguồn dữ liệu"
          badgeText={source_mode === 'REAL' ? 'LIVE HARDWARE' : 'SIMULATION'}
          badgeColorClass={
            source_mode === 'REAL'
              ? 'border-[var(--kvc-ok-line)] text-[var(--kvc-ok-ink)] bg-[var(--kvc-ok-bg)]'
              : 'border-[var(--kvc-mock-line)] text-[var(--kvc-mock-ink)] bg-[var(--kvc-mock-bg)]'
          }
          infoTip="MOCK chạy kịch bản mô phỏng độc lập trên trình duyệt; REAL nhận telemetry 32 byte từ thiết bị thật và không tự chuyển nguồn khi mất sóng."
        >
          <div className="p-3 flex flex-col gap-3">
            {/* Bộ chọn nguồn chế độ tác chiến */}
            <div className="grid grid-cols-2 gap-2 p-1 rounded-kvc-control border border-border bg-muted/30" role="group" aria-label="Chọn chế độ nguồn dữ liệu">
              <Button
                variant={source_mode === 'MOCK' ? 'default' : 'ghost'}
                size="sm"
                aria-pressed={source_mode === 'MOCK'}
                className={`text-xs h-8 cursor-pointer font-semibold transition-all ${
                  source_mode === 'MOCK'
                    ? 'bg-[var(--kvc-mock-fill)] text-[var(--kvc-text-on-fill)] shadow-xs'
                    : 'text-muted-foreground hover:text-foreground'
                }`}
                onClick={() => switchSourceMode('MOCK')}
              >
                MOCK (Mô phỏng)
              </Button>
              <Button
                variant={source_mode === 'REAL' ? 'default' : 'ghost'}
                size="sm"
                aria-pressed={source_mode === 'REAL'}
                className={`text-xs h-8 cursor-pointer font-semibold transition-all ${
                  source_mode === 'REAL'
                    ? 'bg-[var(--kvc-ok-fill)] text-[var(--kvc-text-on-fill)] shadow-xs'
                    : 'text-muted-foreground hover:text-foreground'
                }`}
                onClick={() => switchSourceMode('REAL')}
              >
                REAL (Thực địa)
              </Button>
            </div>

            {/* Thông tin giải thích chế độ nguồn hiện tại */}
            {source_mode === 'REAL' ? (
              <div className="p-2.5 rounded-md border border-[var(--kvc-ok-line)] bg-[var(--kvc-ok-bg)]/60 text-xs flex flex-col gap-1.5">
                <div className="flex items-center gap-1.5 text-[var(--kvc-ok-ink)] font-semibold">
                  <span className="relative flex h-2 w-2">
                    <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-[var(--kvc-ok)] opacity-75" />
                    <span className="relative inline-flex rounded-full h-2 w-2 bg-[var(--kvc-ok)]" />
                  </span>
                  <span>Chế độ Thực địa (Hardware Live)</span>
                </div>
                <p className="text-[11px] text-muted-foreground leading-relaxed">
                  Nhận telemetry RF trực tiếp từ Gateway ESP32 qua backend. Giao thức khung chuẩn ABI v1 (32-byte). Khi mất kết nối hoặc mất sóng, hệ thống giữ nguyên trạng thái cảnh báo và tuyệt đối không tự động chuyển sang dữ liệu giả lập.
                </p>
              </div>
            ) : (
              <div className="p-2.5 rounded-md border border-[var(--kvc-mock-line)] bg-[var(--kvc-mock-bg)]/60 text-xs flex flex-col gap-1.5">
                <div className="flex items-center gap-1.5 text-[var(--kvc-mock-ink)] font-semibold">
                  <Radio className="h-3.5 w-3.5" />
                  <span>Chế độ Mô phỏng (Mock Sandbox)</span>
                </div>
                <p className="text-[11px] text-muted-foreground leading-relaxed">
                  Dữ liệu được sinh tự động theo kịch bản diễn tập cứu hộ đã chọn bên dưới, phục vụ kiểm thử giao diện và trình diễn quy trình tác chiến không cần phần cứng.
                </p>
              </div>
            )}

            {/* Khi ở chế độ MOCK: hiển thị bộ chọn kịch bản diễn tập */}
            {source_mode === 'MOCK' && (
              <div className="flex flex-col gap-2 pt-1 border-t border-border/50">
                <label
                  htmlFor="scenario-select"
                  className="text-[11px] font-semibold text-foreground flex items-center gap-1.5"
                >
                  <Layers className="h-3.5 w-3.5 text-primary" />
                  <span>Kịch bản diễn tập</span>
                </label>
                <Select
                  value={selectedScenarioId}
                  onValueChange={(val) => {
                    setSelectedScenarioId(val)
                    toast.success('Đã nạp kịch bản mô phỏng mới')
                  }}
                >
                  <SelectTrigger id="scenario-select" className="w-full text-xs h-8 bg-background">
                    <SelectValue placeholder="Chọn kịch bản..." />
                  </SelectTrigger>
                  <SelectContent className="max-h-60">
                    {MOCK_SCENARIOS.map((sc) => (
                      <SelectItem key={sc.id} value={sc.id} className="text-xs">
                        {sc.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>

                {activeScenario && (
                  <div className="flex flex-col gap-1.5 p-2 rounded-md bg-muted/40 border border-border/40">
                    <p className="text-[11px] text-muted-foreground leading-relaxed">
                      {activeScenario.description}
                    </p>
                    <div className="flex flex-wrap gap-1">
                      {activeScenario.tags.map((t) => (
                        <Badge
                          key={t}
                          variant="outline"
                          className="text-[10px] py-0 px-1 border-[var(--kvc-mock-line)] text-[var(--kvc-mock-ink)] font-mono"
                        >
                          {t}
                        </Badge>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            )}
          </div>
        </SettingsCard>

        {/* KHỐI 4 — Kết nối mạng Telemetry */}
        <SettingsCard
          icon={<Globe className="h-4 w-4" />}
          title="Kết nối mạng"
          badgeText={ws_connected ? 'CONNECTED' : 'DISCONNECTED'}
          badgeColorClass={
            ws_connected
              ? 'border-[var(--kvc-ok-line)] text-[var(--kvc-ok-ink)] bg-[var(--kvc-ok-bg)]'
              : 'border-[var(--kvc-crit-line)] text-[var(--kvc-crit-ink)] bg-[var(--kvc-crit-bg)]'
          }
          infoTip="Cấu hình địa chỉ WebSocket kết nối trực tiếp với backend GCS. Lưu xong hệ thống sẽ tự động bắt tay và tái kết nối."
        >
          <div className="p-3 flex flex-col gap-3">
            {/* Trạng thái kết nối nhanh */}
            <div className="flex items-center justify-between gap-2 p-2 rounded-md border border-border/50 bg-muted/30">
              <div className="flex items-center gap-2 text-xs">
                {ws_connected ? (
                  <Wifi className="h-4 w-4 text-[var(--kvc-ok-ink)] shrink-0" />
                ) : (
                  <WifiOff className="h-4 w-4 text-[var(--kvc-crit-ink)] shrink-0" />
                )}
                <span className="font-semibold text-foreground">
                  {ws_connected ? 'Đường truyền Backend đang mở' : 'Chưa kết nối Backend'}
                </span>
              </div>
              <Button
                variant="ghost"
                size="sm"
                onClick={handleCopyWsUrl}
                className="h-6 px-1.5 text-[11px] gap-1 text-muted-foreground hover:text-foreground cursor-pointer"
                title="Sao chép URL WebSocket đang dùng"
              >
                {copiedWsUrl ? <Check className="h-3 w-3 text-primary" /> : <Copy className="h-3 w-3" />}
                <span>{copiedWsUrl ? 'Đã chép' : 'Sao chép'}</span>
              </Button>
            </div>

            {/* Biểu mẫu cập nhật WebSocket URL */}
            <form onSubmit={handleSaveNetwork} className="flex flex-col gap-2">
              <div className="flex flex-col gap-1">
                <label
                  htmlFor="ws-url-input"
                  className="text-[11px] font-semibold text-foreground"
                >
                  WebSocket URL
                </label>
                <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2">
                  <input
                    id="ws-url-input"
                    type="text"
                    value={customWsUrl}
                    onChange={(e) => setCustomWsUrl(e.target.value)}
                    placeholder="ws://localhost:8000/ws/telemetry"
                    aria-invalid={Boolean(wsError)}
                    className={`h-8 px-2.5 flex-1 rounded-kvc-control border bg-background font-mono text-xs text-foreground focus:outline-none focus:ring-1 focus:ring-[var(--kvc-accent)] transition-all ${
                      wsError ? 'border-[var(--kvc-crit-line)]' : 'border-input hover:border-primary/50'
                    }`}
                  />
                  <div className="flex items-center gap-1.5 shrink-0">
                    <Button
                      type="submit"
                      size="sm"
                      className="h-8 text-xs gap-1 cursor-pointer font-semibold shadow-xs"
                    >
                      <RefreshCw className="h-3.5 w-3.5" />
                      <span>Áp dụng</span>
                    </Button>
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      onClick={handleRestoreWsDefault}
                      className="h-8 text-xs gap-1 border-border cursor-pointer shadow-2xs hover:border-primary/50"
                      title="Khôi phục địa chỉ mặc định từ cấu hình build"
                    >
                      <RotateCcw className="h-3.5 w-3.5" />
                      <span>Mặc định</span>
                    </Button>
                  </div>
                </div>
              </div>

              {wsError && (
                <div role="alert" className="p-2 rounded bg-destructive/10 border border-destructive/20 text-[11px] text-[var(--kvc-crit-ink)] font-medium">
                  {wsError}
                </div>
              )}
              {saveSuccess && !wsError && (
                <div className="p-2 rounded bg-[var(--kvc-ok-bg)] border border-[var(--kvc-ok-line)] text-[11px] text-[var(--kvc-ok-ink)] font-medium">
                  Đã áp dụng địa chỉ WebSocket mới thành công.
                </div>
              )}
            </form>

            {/* Thông tin URL chi tiết */}
            <div className="flex flex-col gap-1 p-2 rounded-md bg-muted/20 border border-border/40 text-[11px]">
              <div className="flex items-center justify-between gap-2">
                <span className="text-muted-foreground shrink-0">Đang dùng:</span>
                <code className="font-mono text-foreground font-semibold truncate text-right">
                  {wsUrl}
                </code>
              </div>
              <div className="flex items-center justify-between gap-2 border-t border-border/30 pt-1">
                <span className="text-muted-foreground shrink-0">Mặc định build:</span>
                <code className="font-mono text-muted-foreground truncate text-right">
                  {APP_CONFIG.WS_URL}
                </code>
              </div>
            </div>
          </div>
        </SettingsCard>
      </div>
    </PageFrame>
  )
}
