import { fireEvent, render, screen } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { TooltipProvider } from '@/components/ui/tooltip'
import { APP_CONFIG } from '@/config/appConfig'
import { SettingsPage } from '@/features/settings/SettingsPage'
import { DensityProvider } from '@/features/theme/DensityProvider'
import { MissionContext, type MissionContextValue } from '@/state/MissionProvider'
import { INITIAL_MISSION_STATE } from '@/state/missionReducer'

const renderSettings = () => {
  const value: MissionContextValue = {
    state: { ...INITIAL_MISSION_STATE },
    dispatch: vi.fn(),
    selectedScenarioId: 'NORMAL_GPS_TARGET',
    setSelectedScenarioId: vi.fn(),
    switchSourceMode: vi.fn(),
    reconnect: vi.fn(),
    wsUrl: 'ws://127.0.0.1:8000/ws/telemetry',
    setWsUrl: vi.fn(() => ({ ok: true })),
  }
  return render(
    <TooltipProvider>
      <DensityProvider>
        <MissionContext.Provider value={value}>
          <SettingsPage />
        </MissionContext.Provider>
      </DensityProvider>
    </TooltipProvider>
  )
}

describe('Mật độ hiển thị (PLAN-002 §13.2)', () => {
  beforeEach(() => {
    localStorage.clear()
    delete document.documentElement.dataset.density
  })

  it('mặc định là comfortable và gắn data-density lên documentElement', () => {
    renderSettings()

    expect(APP_CONFIG.DEFAULT_DENSITY).toBe('comfortable')
    expect(document.documentElement.dataset.density).toBe('comfortable')
  })

  it('chọn Gọn thì gắn data-density="compact" và lưu localStorage', () => {
    renderSettings()

    fireEvent.click(screen.getByRole('button', { name: /Gọn/ }))

    expect(document.documentElement.dataset.density).toBe('compact')
    expect(localStorage.getItem(APP_CONFIG.STORAGE_KEYS.DISPLAY_DENSITY)).toBe('compact')
  })

  it('đọc lại lựa chọn đã lưu sau khi mount lại', () => {
    localStorage.setItem(APP_CONFIG.STORAGE_KEYS.DISPLAY_DENSITY, 'compact')
    renderSettings()

    expect(document.documentElement.dataset.density).toBe('compact')
  })

  it('giá trị lưu không hợp lệ thì rơi về mặc định, không crash', () => {
    localStorage.setItem(APP_CONFIG.STORAGE_KEYS.DISPLAY_DENSITY, 'ultra-wide')
    renderSettings()

    expect(document.documentElement.dataset.density).toBe('comfortable')
  })

  it('nút Khôi phục mặc định đưa mật độ về comfortable', () => {
    localStorage.setItem(APP_CONFIG.STORAGE_KEYS.DISPLAY_DENSITY, 'compact')
    renderSettings()

    fireEvent.click(screen.getByRole('button', { name: /Khôi phục mặc định/ }))

    expect(document.documentElement.dataset.density).toBe('comfortable')
  })
})
