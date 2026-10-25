import React from 'react'
import {
  AlertTriangle,
  CheckCircle2,
  Clock3,
  FlaskConical,
  Radio,
  RotateCcw,
  Wifi,
} from 'lucide-react'
import { APP_CONFIG } from '@/config/appConfig'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { MockLocationControl } from '@/features/map/MockLocationControl'
import { MOCK_SCENARIOS } from '@/mocks/scenarios'
import { useMission } from '@/state/MissionProvider'

export const ModeContextBar: React.FC = () => {
  const {
    state,
    selectedScenarioId,
    setSelectedScenarioId,
    reconnect,
  } = useMission()

  const { source_mode, ws_connected, rx_age_ms, is_stale } = state
  const isMock = source_mode === 'MOCK'
  const isReplay = source_mode === 'REPLAY'

  const currentScenario = MOCK_SCENARIOS.find((s) => s.id === selectedScenarioId)

  const isLive = state.hardware_link.status === 'CONNECTED' && !is_stale && rx_age_ms <= 3000

  return (
    <div
      className={`border-b px-3 sm:px-4 py-1.5 transition-colors flex flex-wrap items-center justify-between gap-2 text-xs select-none ${
        isMock
          ? 'bg-purple-950/15 border-purple-500/20 text-purple-900 dark:text-purple-200'
          : isReplay
          ? 'bg-cyan-950/15 border-cyan-500/20 text-cyan-900 dark:text-cyan-200'
          : isLive
          ? 'bg-emerald-950/15 border-emerald-500/20 text-emerald-900 dark:text-emerald-200'
          : 'bg-rose-950/15 border-rose-500/30 text-rose-900 dark:text-rose-200'
      }`}
    >
      {/* 1. Bên trái: Huy hiệu chế độ & Thông tin kịch bản */}
      <div className="flex items-center gap-2 min-w-0">
        {isMock ? (
          <div className="flex items-center gap-1.5">
            <span className="relative flex h-2 w-2">
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-purple-400 opacity-75"></span>
              <span className="relative inline-flex rounded-full h-2 w-2 bg-purple-500"></span>
            </span>
            <span className="font-bold tracking-tight text-purple-600 dark:text-purple-300 uppercase text-[11px] flex items-center gap-1">
              <FlaskConical className="h-3.5 w-3.5" />
              Chế độ Mô phỏng [{APP_CONFIG.MOCK_TRANSPORT === 'LOCAL' ? 'LOCAL' : 'BACKEND'}]
            </span>
            <span className="text-muted-foreground hidden sm:inline">•</span>
          </div>
        ) : isReplay ? (
          <div className="flex items-center gap-1.5">
            <span className="relative flex h-2 w-2">
              <span className="relative inline-flex rounded-full h-2 w-2 bg-cyan-500"></span>
            </span>
            <span className="font-bold tracking-tight text-cyan-600 dark:text-cyan-300 uppercase text-[11px] flex items-center gap-1">
              <Clock3 className="h-3.5 w-3.5" />
              Phát lại nhật ký
            </span>
            <span className="text-muted-foreground hidden sm:inline">•</span>
          </div>
        ) : isLive ? (
          <div className="flex items-center gap-1.5">
            <span className="relative flex h-2 w-2">
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
              <span className="relative inline-flex rounded-full h-2 w-2 bg-emerald-500"></span>
            </span>
            <span className="font-bold tracking-tight text-emerald-600 dark:text-emerald-400 uppercase text-[11px] flex items-center gap-1">
              <Radio className="h-3.5 w-3.5" />
              Trực tiếp từ thiết bị (Live)
            </span>
            <span className="text-muted-foreground hidden sm:inline">•</span>
          </div>
        ) : (
          <div className="flex items-center gap-1.5">
            <span className="relative flex h-2 w-2">
              <span className="relative inline-flex rounded-full h-2 w-2 bg-rose-500"></span>
            </span>
            <span className="font-bold tracking-tight text-rose-600 dark:text-rose-400 uppercase text-[11px] flex items-center gap-1">
              <Radio className="h-3.5 w-3.5" />
              REAL: ESP32 Chưa Kết Nối
            </span>
            <span className="text-muted-foreground hidden sm:inline">•</span>
          </div>
        )}

        {/* Tùy biến ngữ cảnh */}
        {isMock ? (
          <div className="flex items-center gap-2 min-w-0">
            <span className="text-muted-foreground text-xs hidden md:inline">Kịch bản:</span>
            <select
              value={selectedScenarioId}
              onChange={(e) => setSelectedScenarioId(e.target.value)}
              className="bg-background text-foreground text-xs font-semibold border border-border/80 rounded-lg px-2.5 py-1 min-h-[32px] max-w-[220px] sm:max-w-xs truncate focus:outline-none focus:ring-2 focus:ring-purple-500 cursor-pointer"
              aria-label="Chọn kịch bản mô phỏng"
            >
              {MOCK_SCENARIOS.map((sc) => (
                <option key={sc.id} value={sc.id}>
                  {sc.name}
                </option>
              ))}
            </select>
            {currentScenario?.tags && (
              <div className="hidden xl:flex items-center gap-1">
                {currentScenario.tags.map((tag) => (
                  <Badge
                    key={tag}
                    variant="secondary"
                    className="text-xs px-1.5 py-0.5 font-normal bg-purple-500/10 text-purple-600 dark:text-purple-300 border-purple-500/20"
                  >
                    {tag}
                  </Badge>
                ))}
              </div>
            )}
          </div>
        ) : isReplay ? (
          <div className="flex items-center gap-2 text-xs font-mono">
            <span>{state.replay?.source_session_id ?? 'Đang chờ snapshot'}</span>
            <span className="text-muted-foreground">•</span>
            <span>{Math.round(state.replay?.position_ms ?? 0)} ms</span>
            <Badge variant="outline" className="border-cyan-500/30 text-cyan-700 dark:text-cyan-300">
              {state.replay?.speed_multiplier ?? 1}× {state.replay?.is_paused ? 'TẠM DỪNG' : 'ĐANG PHÁT'}
            </Badge>
          </div>
        ) : (
          <div className="flex items-center gap-2 text-xs font-mono">
            <span className="text-muted-foreground hidden md:inline">Gateway ESP32:</span>
            <span className="text-foreground font-semibold">
              {state.hardware_link.port || (state.hardware_link.status === 'CONNECTED' ? 'ESP32 Ingress' : 'Chưa cấu hình Ingress')}
            </span>
            <span className="text-muted-foreground hidden lg:inline">•</span>
            <span className="hidden lg:inline text-muted-foreground">
              Độ trễ:{' '}
              <span
                className={`font-semibold ${
                  is_stale || rx_age_ms > 3000
                    ? 'text-red-500'
                    : rx_age_ms > 1000
                    ? 'text-amber-500'
                    : 'text-emerald-500'
                }`}
              >
                {Math.round(rx_age_ms ?? 0)}ms
              </span>
            </span>
          </div>
        )}
      </div>

      {/* 2. Bên phải: Các nút thao tác nhanh (Diễn tập cứu nạn / Mock Location / Reconnect) */}
      <div className="flex items-center gap-2 shrink-0 flex-wrap">
        {isMock ? (
          <>
            <Button
              variant="default"
              size="sm"
              onClick={() => {
                setSelectedScenarioId('NORMAL_GPS_DETECT')
              }}
              className="min-h-[32px] h-8 px-3 text-xs gap-1.5 bg-purple-600 hover:bg-purple-700 text-white font-semibold shadow-xs cursor-pointer focus-visible:ring-2 focus-visible:ring-purple-500"
              title="Kích hoạt nhanh kịch bản diễn tập tìm kiếm cứu nạn (3-click demo)"
            >
              <span>▶ Diễn tập cứu nạn</span>
            </Button>
            <MockLocationControl />
            <Button
              variant="outline"
              size="sm"
              onClick={reconnect}
              className="min-h-[32px] h-8 px-2.5 text-xs gap-1 border-purple-500/30 hover:bg-purple-500/10 text-purple-600 dark:text-purple-300 font-semibold cursor-pointer focus-visible:ring-2 focus-visible:ring-purple-500"
              title="Khởi động lại kịch bản mô phỏng từ đầu"
            >
              <RotateCcw className="h-3.5 w-3.5" />
              <span className="hidden sm:inline">Khởi động lại</span>
            </Button>
          </>
        ) : isReplay ? (
          <div
            className={`flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-xs font-semibold border ${
              ws_connected
                ? 'bg-cyan-500/10 border-cyan-500/30 text-cyan-700 dark:text-cyan-300'
                : 'bg-red-500/10 border-red-500/30 text-red-600 dark:text-red-400'
            }`}
          >
            {ws_connected ? <CheckCircle2 className="h-3.5 w-3.5" /> : <AlertTriangle className="h-3.5 w-3.5" />}
            <span>{ws_connected ? 'REPLAY WS' : 'MẤT REPLAY WS'}</span>
          </div>
        ) : (
          <>
            <div
              className={`flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-xs font-semibold border ${
                !ws_connected
                  ? 'bg-red-500/10 border-red-500/30 text-red-600 dark:text-red-400'
                  : isLive
                  ? 'bg-emerald-500/10 border-emerald-500/30 text-emerald-600 dark:text-emerald-400'
                  : 'bg-rose-500/10 border-rose-500/30 text-rose-600 dark:text-rose-400'
              }`}
            >
              {!ws_connected ? (
                <>
                  <AlertTriangle className="h-3.5 w-3.5 animate-pulse" />
                  <span>MẤT BACKEND WS</span>
                </>
              ) : isLive ? (
                <>
                  <CheckCircle2 className="h-3.5 w-3.5" />
                  <span>ESP32 LIVE</span>
                </>
              ) : (
                <>
                  <AlertTriangle className="h-3.5 w-3.5" />
                  <span>ESP32 CHƯA KẾT NỐI</span>
                </>
              )}
            </div>
            <Button
              variant="outline"
              size="sm"
              onClick={reconnect}
              className="min-h-[32px] h-8 px-2.5 text-xs gap-1 border-emerald-500/30 hover:bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 font-semibold cursor-pointer focus-visible:ring-2 focus-visible:ring-emerald-500"
              title="Thử kết nối lại WebSocket trạm mặt đất"
            >
              <Wifi className="h-3.5 w-3.5" />
              <span>Kết nối lại</span>
            </Button>
          </>
        )}
      </div>
    </div>
  )
}
