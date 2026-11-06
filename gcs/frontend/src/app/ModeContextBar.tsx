import React from 'react'
import { FlaskConical, RotateCcw, Wifi } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { MockLocationControl } from '@/features/map/MockLocationControl'
import { isAgeStale } from '@/lib/stale'
import { MOCK_SCENARIOS } from '@/mocks/scenarios'
import { useMission } from '@/state/MissionProvider'

/**
 * Thanh ngữ cảnh chỉ giữ những gì AppHeader KHÔNG có:
 * chọn kịch bản MOCK và các thao tác nhanh của chế độ hiện tại.
 *
 * Trạng thái nguồn (MOCK/REAL), kết nối WS và mô tả gateway đã hiển thị ở
 * AppHeader + trang Thiết bị, nên không lặp lại ở đây (PLAN-KVC-GCS-UI-CONSISTENCY-002).
 */
export const ModeContextBar: React.FC = () => {
  const { state, selectedScenarioId, setSelectedScenarioId, reconnect } = useMission()
  const { source_mode, rx_age_ms, is_stale } = state
  const isMock = source_mode === 'MOCK'

  // REAL + dữ liệu tươi: không có thao tác nào cần thiết, trả lại chiều cao cho dữ liệu.
  const isLive = state.hardware_link.status === 'CONNECTED' && !isAgeStale(rx_age_ms, is_stale)
  if (!isMock && isLive) {
    return null
  }

  const currentScenario = MOCK_SCENARIOS.find((s) => s.id === selectedScenarioId)

  return (
    <div
      className={`border-b px-3 sm:px-4 py-1.5 flex flex-wrap items-center justify-between gap-2 text-xs select-none ${
        isMock
          ? 'bg-[var(--kvc-mock-bg)] border-[var(--kvc-mock-line)] text-[var(--kvc-mock-ink)]'
          : 'bg-[var(--kvc-warn-bg)] border-[var(--kvc-warn-line)] text-[var(--kvc-warn-ink)]'
      }`}
    >
      {/* Trái: chọn kịch bản (MOCK) hoặc mô tả gateway (REAL chưa live) */}
      <div className="flex items-center gap-2 min-w-0">
        {isMock ? (
          <>
            <span className="flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wider shrink-0">
              <FlaskConical className="h-3.5 w-3.5" />
              Kịch bản
            </span>
            <select
              value={selectedScenarioId}
              onChange={(e) => setSelectedScenarioId(e.target.value)}
              className="bg-background text-foreground text-xs font-semibold border border-border/80 rounded-kvc-control px-2.5 py-1 min-h-[30px] max-w-[220px] sm:max-w-xs truncate focus:outline-none focus:ring-2 focus:ring-[var(--kvc-mock)] cursor-pointer"
              aria-label="Chọn kịch bản mô phỏng"
            >
              {MOCK_SCENARIOS.map((sc) => (
                <option key={sc.id} value={sc.id}>
                  {sc.name}
                </option>
              ))}
            </select>
            {currentScenario?.tags && currentScenario.tags.length > 0 && (
              <span className="hidden xl:inline text-[11px] text-muted-foreground truncate">
                {currentScenario.tags.join(' · ')}
              </span>
            )}
          </>
        ) : (
          <span className="text-[11px] font-mono text-muted-foreground">
            Gateway:{' '}
            <span className="font-semibold text-foreground">
              {state.hardware_link.port || 'Chưa cấu hình Ingress'}
            </span>
          </span>
        )}
      </div>

      {/* Phải: thao tác nhanh */}
      <div className="flex items-center gap-2 shrink-0 flex-wrap">
        {isMock ? (
          <>
            <Button
              variant="default"
              size="sm"
              onClick={() => setSelectedScenarioId('NORMAL_GPS_TARGET')}
              className="min-h-[32px] h-8 px-3 text-xs gap-1.5 bg-[var(--kvc-mock-fill)] hover:bg-[var(--kvc-mock-fill)]/90 text-[var(--kvc-text-on-fill)] font-semibold shadow-xs cursor-pointer"
              title="Kích hoạt nhanh kịch bản diễn tập tìm kiếm cứu nạn"
            >
              Diễn tập cứu nạn
            </Button>
            <MockLocationControl />
            <Button
              variant="outline"
              size="sm"
              onClick={reconnect}
              className="min-h-[32px] h-8 px-2.5 text-xs gap-1 border-[var(--kvc-mock-line)] hover:bg-[var(--kvc-mock-bg)] text-[var(--kvc-mock-ink)] font-semibold cursor-pointer"
              title="Khởi động lại kịch bản mô phỏng từ đầu"
            >
              <RotateCcw className="h-3.5 w-3.5" />
              <span className="hidden sm:inline">Khởi động lại</span>
            </Button>
          </>
        ) : (
          <Button
            variant="outline"
            size="sm"
            onClick={reconnect}
            className="min-h-[32px] h-8 px-2.5 text-xs gap-1 border-[var(--kvc-warn-line)] hover:bg-[var(--kvc-warn-bg)] text-[var(--kvc-warn-ink)] font-semibold cursor-pointer"
            title="Thử kết nối lại WebSocket trạm mặt đất"
          >
            <Wifi className="h-3.5 w-3.5" />
            <span>Kết nối lại</span>
          </Button>
        )}
      </div>
    </div>
  )
}
