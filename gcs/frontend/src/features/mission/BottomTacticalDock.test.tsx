import { fireEvent, render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { toast } from 'sonner'
import { TooltipProvider } from '@/components/ui/tooltip'
import { MissionContext, type MissionContextValue } from '@/state/MissionProvider'
import { INITIAL_MISSION_STATE } from '@/state/missionReducer'
import type { MissionState } from '@/types/telemetry'
import { BottomTacticalDock } from './BottomTacticalDock'

vi.mock('sonner', () => ({
  toast: {
    success: vi.fn(),
    error: vi.fn(),
    info: vi.fn(),
    warning: vi.fn(),
  },
}))

const renderDock = (overrides: Partial<MissionState> = {}, dispatchMock = vi.fn()) => {
  const value: MissionContextValue = {
    state: { ...INITIAL_MISSION_STATE, ...overrides },
    dispatch: dispatchMock,
    selectedScenarioId: 'NORMAL_GPS_TARGET',
    setSelectedScenarioId: vi.fn(),
    switchSourceMode: vi.fn(),
    reconnect: vi.fn(),
    wsUrl: 'ws://127.0.0.1:8000/ws/telemetry',
    setWsUrl: vi.fn(() => ({ ok: true })),
  }
  return {
    ...render(
      <TooltipProvider>
        <MissionContext.Provider value={value}>
          <BottomTacticalDock />
        </MissionContext.Provider>
      </TooltipProvider>
    ),
    dispatch: dispatchMock,
  }
}

describe('BottomTacticalDock - dụng cụ đo', () => {
  it('mặc định ẩn dụng cụ, nút "Chi tiết" có aria-expanded=false', () => {
    renderDock()

    const toggle = screen.getByRole('button', { name: 'Mở rộng dụng cụ đo' })
    expect(toggle.getAttribute('aria-expanded')).toBe('false')
    expect(screen.queryByText('Mặt nước')).toBeNull()
    expect(screen.queryByText('Cờ cảm biến')).toBeNull()
  })

  it('bấm "Chi tiết" mở cả ba dụng cụ và đổi aria-expanded', () => {
    renderDock()

    fireEvent.click(screen.getByRole('button', { name: 'Mở rộng dụng cụ đo' }))

    expect(
      screen.getByRole('button', { name: 'Thu gọn dụng cụ đo' }).getAttribute('aria-expanded')
    ).toBe('true')
    // Ống nước, la bàn/IMU và cờ cảm biến cùng xuất hiện
    expect(screen.getByText('Mặt nước')).toBeDefined()
    expect(screen.getByText('Cờ cảm biến')).toBeDefined()
    expect(screen.getByText('La bàn')).toBeDefined()
  })

  it('bấm "Ẩn" thu gọn lại và gỡ dụng cụ khỏi DOM', () => {
    renderDock()

    fireEvent.click(screen.getByRole('button', { name: 'Mở rộng dụng cụ đo' }))
    expect(screen.getByText('Mặt nước')).toBeDefined()

    fireEvent.click(screen.getByRole('button', { name: 'Thu gọn dụng cụ đo' }))

    expect(screen.queryByText('Mặt nước')).toBeNull()
    expect(screen.getByRole('button', { name: 'Mở rộng dụng cụ đo' })).toBeDefined()
  })

  it('dock không tự bịa số khi thiếu dữ liệu cảm biến', () => {
    renderDock()
    fireEvent.click(screen.getByRole('button', { name: 'Mở rộng dụng cụ đo' }))

    expect(screen.getAllByText('N/A').length).toBeGreaterThan(0)
    expect(screen.getByText('CHỜ ĐO')).toBeDefined()
  })
})

describe('BottomTacticalDock - tính năng Đánh dấu (SAR Mark Event)', () => {
  it('khi chưa có toạ độ mục tiêu và chưa có GPS UAV: báo lỗi toast rõ ràng, không im lặng', () => {
    renderDock()
    const markBtn = screen.getByRole('button', { name: 'Đánh dấu' })
    fireEvent.click(markBtn)

    expect(toast.error).toHaveBeenCalledWith('Chưa có tọa độ mục tiêu hoặc UAV hợp lệ để đánh dấu!')
  })

  it('khi có mục tiêu hợp lệ: dispatch LOG_EVENT với toạ độ mục tiêu và toast thành công', () => {
    const dispatchMock = vi.fn()
    renderDock(
      {
        has_target: true,
        target: {
          track_id: 42,
          class_id: 1,
          class_name: 'person',
          confidence: 90,
          pos_valid: true,
          latitude: 16.074,
          longitude: 108.223,
          local_x_cm: null,
          local_y_cm: null,
          range_cm: 250,
          azimuth_deg: 15,
          coordinate_frame: 'WGS84',
          last_seen_iso: new Date().toISOString(),
          origin_id: 1,
        },
      },
      dispatchMock
    )

    const markBtn = screen.getByRole('button', { name: 'Đánh dấu' })
    fireEvent.click(markBtn)

    expect(dispatchMock).toHaveBeenCalledWith(
      expect.objectContaining({
        type: 'LOG_EVENT',
        payload: expect.objectContaining({
          code: 'SAR_MARK_EVENT',
          source: 'SAR_MISSION',
          message: expect.stringContaining('#42'),
        }),
      })
    )
    expect(toast.success).toHaveBeenCalledWith(expect.stringContaining('#42'))
  })

  it('khi không có mục tiêu nhưng UAV có GPS: ghi nhận mốc toạ độ UAV vào nhật ký', () => {
    const dispatchMock = vi.fn()
    renderDock(
      {
        has_target: false,
        target: null,
        camera_position: {
          latitude: 16.0745,
          longitude: 108.2235,
          altitude_m: 25.5,
          heading_deg: 90,
          is_valid: true,
          last_updated_iso: new Date().toISOString(),
          speed_mps: 5,
          climb_rate_mps: 0,
        },
      },
      dispatchMock
    )

    const markBtn = screen.getByRole('button', { name: 'Đánh dấu' })
    fireEvent.click(markBtn)

    expect(dispatchMock).toHaveBeenCalledWith(
      expect.objectContaining({
        type: 'LOG_EVENT',
        payload: expect.objectContaining({
          code: 'SAR_MARK_EVENT',
          source: 'SAR_MISSION',
          message: expect.stringContaining('16.074500° N'),
        }),
      })
    )
    expect(toast.success).toHaveBeenCalledWith('Đã ghi nhận mốc toạ độ UAV vào nhật ký phiên!')
  })
})
