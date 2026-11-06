import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { TooltipProvider } from '@/components/ui/tooltip'
import { MissionContext, type MissionContextValue } from '@/state/MissionProvider'
import { INITIAL_MISSION_STATE } from '@/state/missionReducer'
import type { AlertItem } from '@/types/telemetry'
import { MissionPage } from './MissionPage'

const renderPage = (overrides: Partial<typeof INITIAL_MISSION_STATE> = {}) => {
  const value: MissionContextValue = {
    state: { ...INITIAL_MISSION_STATE, ...overrides },
    dispatch: () => {},
    selectedScenarioId: 'NORMAL_GPS_TARGET',
    setSelectedScenarioId: () => {},
    switchSourceMode: () => {},
    reconnect: () => {},
    wsUrl: 'ws://127.0.0.1:8000/ws/telemetry',
    setWsUrl: () => ({ ok: true }),
  }
  return render(
    <TooltipProvider>
      <MissionContext.Provider value={value}>
        <MissionPage />
      </MissionContext.Provider>
    </TooltipProvider>
  )
}

const CRITICAL_ALERT: AlertItem = {
  id: 'alert-1',
  level: 'CRITICAL',
  code: 'LINK_LOST',
  message: 'Mất liên kết LoRa với tải nhiệm vụ',
  timestamp_iso: '2026-11-04T09:00:05Z',
  active: true,
  condition_status: 'ACTIVE',
  acknowledged: false,
  source_category: 'TELEMETRY',
  occurrence_count: 3,
  first_seen_iso: '2026-11-04T09:00:00Z',
  last_seen_iso: '2026-11-04T09:00:05Z',
  impact: 'Mất telemetry',
  remediation: 'Kiểm tra ăng-ten',
}

describe('MissionPage — overlay rail không chồng lớp', () => {
  it('dock, cụm điều khiển và thanh khung nhìn đều nằm trong rail có data-overlay', () => {
    const { container } = renderPage()

    const ids = Array.from(container.querySelectorAll('[data-overlay]')).map(
      (el) => (el as HTMLElement).dataset.overlay
    )

    expect(ids).toContain('viewport-toolbar')
    expect(ids).toContain('tactical-dock')
    expect(ids).toContain('map-controls')
    expect(ids).toContain('layer-switcher')
    // Không còn lớp nổi trùng chức năng hiển thị toạ độ trong khung bản đồ.
    expect(ids).not.toContain('position-panel')
  })

  it('banner cảnh báo CRITICAL nằm ở hàng riêng, không nằm trong cột của PiP', () => {
    renderPage({
      alerts: [CRITICAL_ALERT],
    })

    const banner = document.querySelector('[data-overlay="alert-banner"]')
    expect(banner).not.toBeNull()
    expect(banner?.getAttribute('role')).toBe('alert')
    expect(screen.getByText(/Mất liên kết LoRa/i)).toBeDefined()
  })

  it('không có banner cảnh báo khi cảnh báo đã được tiếp nhận', () => {
    renderPage({ alerts: [{ ...CRITICAL_ALERT, acknowledged: true }] })

    expect(document.querySelector('[data-overlay="alert-banner"]')).toBeNull()
  })

  it('có thể thu gọn thanh điều khiển khung nhìn', () => {
    renderPage()

    expect(screen.getByRole('button', { name: /Xem Bản đồ WGS-84/i })).toBeDefined()
    expect(screen.getByRole('button', { name: /Thu gọn thanh điều khiển/i })).toBeDefined()
  })
})
