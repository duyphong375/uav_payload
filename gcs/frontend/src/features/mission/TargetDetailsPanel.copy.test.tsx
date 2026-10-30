import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { TooltipProvider } from '@/components/ui/tooltip'
import { MissionContext, type MissionContextValue } from '@/state/MissionProvider'
import { INITIAL_MISSION_STATE } from '@/state/missionReducer'
import { TargetDetailsPanel } from './TargetDetailsPanel'
import type { MissionState, TargetInfo } from '@/types/telemetry'

vi.mock('sonner', () => ({
  toast: {
    success: vi.fn(),
    error: vi.fn(),
    info: vi.fn(),
  },
}))

const writeText = vi.fn().mockResolvedValue(undefined)

beforeEach(() => {
  writeText.mockClear()
  Object.assign(navigator, { clipboard: { writeText } })
})

const makeTarget = (overrides: Partial<TargetInfo> = {}): TargetInfo => ({
  track_id: 1001,
  class_id: 1,
  class_name: 'person',
  confidence: 92,
  target_confirmed: true,
  pos_valid: true,
  coordinate_frame: 'WGS84',
  local_x_cm: null,
  local_y_cm: null,
  latitude: 16.0544,
  longitude: 108.2022,
  origin_id: null,
  age_ms: 200,
  ...overrides,
})

const renderPanel = (target: TargetInfo) => {
  const state: MissionState = {
    ...INITIAL_MISSION_STATE,
    has_target: true,
    target,
    source_mode: 'MOCK',
    rx_age_ms: 200,
    is_stale: false,
  }
  const value: MissionContextValue = {
    state,
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
      <MissionContext.Provider value={value}>
        <TargetDetailsPanel />
      </MissionContext.Provider>
    </TooltipProvider>
  )
}

describe('TargetDetailsPanel – sao chép toạ độ minh bạch hệ quy chiếu', () => {
  it('WGS-84: nhãn WGS-84 và clipboard chứa WGS-84, không chứa LOCAL_GRID', async () => {
    renderPanel(makeTarget())
    const button = screen.getByRole('button', { name: /Sao chép WGS-84/i })
    fireEvent.click(button)

    await waitFor(() => expect(writeText).toHaveBeenCalled())
    const payload = writeText.mock.calls[0][0] as string
    expect(payload).toContain('WGS-84')
    expect(payload).not.toContain('LOCAL_GRID')
  })

  it('LOCAL_GRID: nhãn Local (cm) và clipboard chứa LOCAL_GRID, không chứa WGS-84', async () => {
    renderPanel(
      makeTarget({
        coordinate_frame: 'LOCAL_GRID',
        latitude: null,
        longitude: null,
        local_x_cm: 120,
        local_y_cm: -80,
      })
    )
    const button = screen.getByRole('button', { name: /Sao chép Local \(cm\)/i })
    fireEvent.click(button)

    await waitFor(() => expect(writeText).toHaveBeenCalled())
    const payload = writeText.mock.calls[0][0] as string
    expect(payload).toContain('LOCAL_GRID')
    expect(payload).toContain('cm')
    expect(payload).not.toContain('WGS-84')
  })

  it('nút sao chép có title nói rõ LOCAL không phải WGS-84', () => {
    renderPanel(
      makeTarget({
        coordinate_frame: 'LOCAL_GRID',
        latitude: null,
        longitude: null,
        local_x_cm: 10,
        local_y_cm: 20,
      })
    )
    const button = screen.getByRole('button', { name: /Sao chép Local \(cm\)/i })
    expect(button.getAttribute('title')).toMatch(/không phải WGS-84/i)
  })
})
