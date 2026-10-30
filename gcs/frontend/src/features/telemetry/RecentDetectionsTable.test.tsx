import { render } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { TooltipProvider } from '@/components/ui/tooltip'
import { AppRouterProvider } from '@/app/routes'
import { MissionContext, type MissionContextValue } from '@/state/MissionProvider'
import { INITIAL_MISSION_STATE } from '@/state/missionReducer'
import { RecentDetectionsTable } from './RecentDetectionsTable'
import type { BoundingBox, MissionState, TargetInfo } from '@/types/telemetry'

vi.mock('sonner', () => ({
  toast: { success: vi.fn(), error: vi.fn(), info: vi.fn() },
}))

const makeTarget = (overrides: Partial<TargetInfo> = {}): TargetInfo => ({
  track_id: 1001,
  class_id: 1,
  class_name: 'person',
  confidence: 91,
  target_confirmed: true,
  pos_valid: true,
  coordinate_frame: 'WGS84',
  local_x_cm: null,
  local_y_cm: null,
  latitude: 16.0544,
  longitude: 108.2022,
  origin_id: null,
  age_ms: 100,
  ...overrides,
})

const renderTable = (partial: Partial<MissionState>) => {
  const state: MissionState = { ...INITIAL_MISSION_STATE, ...partial }
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
        <AppRouterProvider>
          <RecentDetectionsTable />
        </AppRouterProvider>
      </MissionContext.Provider>
    </TooltipProvider>
  )
}

describe('RecentDetectionsTable – không bịa toạ độ/confidence/khoảng cách', () => {
  it('không hiển thị toạ độ Hà Nội mặc định khi không có mục tiêu', () => {
    const { container } = renderTable({
      source_mode: 'MOCK',
      has_target: false,
      target: null,
      bounding_boxes: [],
    })
    expect(container.textContent).not.toContain('21.028420')
    expect(container.textContent).not.toContain('105.854090')
    expect(container.textContent).not.toContain('94.2')
    expect(container.textContent).not.toContain('82.4')
    expect(container.textContent).not.toContain('88.5')
  })

  it('không hiển thị mục tiêu với toạ độ khi pos_valid = false', () => {
    const { container } = renderTable({
      source_mode: 'REAL',
      has_target: true,
      target: makeTarget({ pos_valid: false, coordinate_frame: 'NONE', latitude: null, longitude: null }),
    })
    expect(container.textContent).toContain('N/A')
    expect(container.textContent).toContain('Không có')
    expect(container.textContent).not.toMatch(/21\.028420/)
  })

  it('BBox phụ không có toạ độ địa lý không sinh dòng mục tiêu giả', () => {
    const boxes: BoundingBox[] = [
      { id: 'b1', x: 0.1, y: 0.1, width: 0.2, height: 0.2, confidence: 0.9, label: 'person', track_id: 55, is_synced: false },
    ]
    const { container } = renderTable({
      source_mode: 'MOCK',
      has_target: false,
      target: null,
      bounding_boxes: boxes,
    })
    expect(container.textContent).not.toContain('21.028420')
    expect(container.textContent).toContain('khung phát hiện không kèm toạ độ')
  })

  it('LOCAL_GRID hiển thị X/Y cm và nhãn LOCAL (cm), không ép sang WGS-84', () => {
    const { container } = renderTable({
      source_mode: 'REAL',
      has_target: true,
      target: makeTarget({
        coordinate_frame: 'LOCAL_GRID',
        latitude: null,
        longitude: null,
        local_x_cm: 150,
        local_y_cm: -75,
      }),
    })
    expect(container.textContent).toContain('X=150 cm, Y=-75 cm')
    expect(container.textContent).toContain('LOCAL (cm)')
    expect(container.textContent).not.toContain('21.028420')
  })

  it('CSV có cột hệ toạ độ và nguồn, không có cột giả', () => {
    const { container } = renderTable({
      source_mode: 'REAL',
      has_target: true,
      target: makeTarget(),
    })
    expect(container.textContent).toContain('WGS-84')
  })
})
