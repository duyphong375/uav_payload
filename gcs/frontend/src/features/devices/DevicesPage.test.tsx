import { render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { TooltipProvider } from '@/components/ui/tooltip'
import { MissionContext, type MissionContextValue } from '@/state/MissionProvider'
import { INITIAL_MISSION_STATE } from '@/state/missionReducer'
import type { MissionState } from '@/types/telemetry'
import { DevicesPage } from './DevicesPage'

const renderDevices = (overrides: Partial<MissionState> = {}) => {
  const value: MissionContextValue = {
    state: { ...INITIAL_MISSION_STATE, ...overrides },
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
        <DevicesPage />
      </MissionContext.Provider>
    </TooltipProvider>
  )
}

describe('DevicesPage - sau khi viết lại', () => {
  it('hiển thị đúng 6 module trên tải và trạm đất', () => {
    renderDevices()

    expect(screen.getByText('Module trên tải và trạm đất')).toBeDefined()
    for (const name of [
      'Module định vị GNSS',
      'Siêu âm AJ-SR04M',
      'IMU GY-87',
      'Thiết bị suy luận AI',
      'Kênh video',
      'Bộ ghi log nhiệm vụ',
    ]) {
      expect(screen.getByText(name)).toBeDefined()
    }
  })

  it('hiển thị ba chặng liên kết tách biệt, không trộn nghĩa', () => {
    renderDevices()

    expect(screen.getByText('Trình duyệt tới Backend')).toBeDefined()
    expect(screen.getByText('Backend tới ESP32')).toBeDefined()
    expect(screen.getByText('Cờ cảm biến')).toBeDefined()
  })

  it('thiếu dữ liệu thì hiện N/A, không bịa số 0', () => {
    renderDevices()

    expect(screen.getAllByText('N/A').length).toBeGreaterThan(0)
    expect(screen.queryByText('0 cm')).toBeNull()
    expect(screen.queryByText('0.000000, 0.000000')).toBeNull()
  })

  it('trạng thái module phản ánh cờ cảm biến hiện có', () => {
    renderDevices({
      telemetry: {
        ...INITIAL_MISSION_STATE.telemetry,
        gps_valid: true,
        lidar_valid: true,
        imu_valid: true,
        lidar_range_cm: 285,
        roll_deg: 4.2,
        pitch_deg: -3.6,
      },
      camera_position: {
        ...INITIAL_MISSION_STATE.camera_position,
        latitude: 16.0544,
        longitude: 108.2022,
        is_valid: true,
      },
    })

    expect(screen.getByText('3D FIX')).toBeDefined()
    expect(screen.getByText('HỢP LỆ')).toBeDefined()
    expect(screen.getByText('HOẠT ĐỘNG')).toBeDefined()
    expect(screen.getByText('285 cm')).toBeDefined()
  })

  it('dải chẩn đoán 4 chỉ số và số module lấy từ dữ liệu, không hardcode', () => {
    renderDevices()

    expect(screen.getByText('Độ trễ gói')).toBeDefined()
    expect(screen.getByText('Gói đã nhận')).toBeDefined()
    expect(screen.getByText('Lỗi giải mã')).toBeDefined()
    expect(screen.getByText('Gói rớt')).toBeDefined()
    expect(screen.getByText(/^6 module · /)).toBeDefined()
  })
})
