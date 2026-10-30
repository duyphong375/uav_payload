import { fireEvent, render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { TooltipProvider } from '@/components/ui/tooltip'
import { MissionContext, type MissionContextValue } from '@/state/MissionProvider'
import { INITIAL_MISSION_STATE } from '@/state/missionReducer'
import type { MissionState } from '@/types/telemetry'
import { LocalRadarPanel } from './LocalRadarPanel'

const createMockMissionState = (overrides?: Partial<MissionState>): MissionState => ({
  ...INITIAL_MISSION_STATE,
  source_mode: 'MOCK',
  session_id: 'SES-TEST-001',
  ws_connected: true,
  hardware_link: { status: 'CONNECTED', port: 'COM3' },
  rx_age_ms: 80,
  is_stale: false,
  telemetry: {
    battery_pct: 90,
    lidar_range_cm: 200,
    gps_valid: false,
    lidar_valid: true,
    imu_valid: true,
    ai_detected: true,
    roll_deg: null,
    pitch_deg: null,
    packet_rssi_dbm: -80,
    packet_snr_db: 8.5,
  },
  has_target: true,
  target: {
    track_id: 103,
    class_id: 1,
    class_name: 'person',
    confidence: 92,
    target_confirmed: true,
    pos_valid: true,
    coordinate_frame: 'LOCAL_GRID',
    local_x_cm: 120,
    local_y_cm: -60,
    latitude: null,
    longitude: null,
    origin_id: 1,
    age_ms: 0,
  },
  ...overrides,
})

const renderWithContext = (state: MissionState, onSwitchToMap?: () => void) => {
  const contextValue: MissionContextValue = {
    state,
    dispatch: vi.fn(),
    selectedScenarioId: 'LOCAL_GRID_RADAR',
    setSelectedScenarioId: vi.fn(),
    switchSourceMode: vi.fn(),
    reconnect: vi.fn(),
    wsUrl: 'ws://127.0.0.1:8000/ws/telemetry',
    setWsUrl: vi.fn(() => ({ ok: true })),
  }

  return render(
    <TooltipProvider>
      <MissionContext.Provider value={contextValue}>
        <LocalRadarPanel onSwitchToMap={onSwitchToMap} />
      </MissionContext.Provider>
    </TooltipProvider>
  )
}

describe('LocalRadarPanel - hệ local Radar thực nghiệm cục bộ (LOCAL_GRID)', () => {
  it('hiển thị đầy đủ tiêu đề local, các trục tọa độ +X/+Y và gốc O(0,0)', () => {
    const mockState = createMockMissionState()
    renderWithContext(mockState)

    expect(screen.getByText('Hệ Local Radar Cục Bộ (Local Grid)')).toBeDefined()
    expect(screen.getByText('+Y (BẮC LOCAL)')).toBeDefined()
    expect(screen.getByText('+X (ĐÔNG)')).toBeDefined()
    expect(screen.getByText(/O\(0,0\) Mốc #1/i)).toBeDefined()
    expect(screen.getByText('KHÓA MỤC TIÊU')).toBeDefined()
  })

  it('vẽ mục tiêu local với tọa độ cm chính xác khi coordinate_frame là LOCAL_GRID', () => {
    const mockState = createMockMissionState()
    renderWithContext(mockState)

    // Nhãn mục tiêu chứa track_id 103 và tọa độ
    expect(screen.getByText(/#103 Người/i)).toBeDefined()
    expect(screen.getByText(/X:\+120 Y:-60 cm/i)).toBeDefined()
  })

  it('xử lý trạng thái STALE (>3s): làm mờ mục tiêu và hiển thị cảnh báo dữ liệu cũ', () => {
    const mockState = createMockMissionState({
      is_stale: true,
      rx_age_ms: 4500,
      target: {
        ...createMockMissionState().target!,
        age_ms: 4500,
      },
    })
    renderWithContext(mockState)

    expect(screen.getByText('DỮ LIỆU CŨ (>3s)')).toBeDefined()
    expect(screen.getByText(/DỮ LIỆU CŨ \(4500 ms\)/i)).toBeDefined()
  })

  it('dùng tuổi riêng của target dù packet link mới hơn', () => {
    const mockState = createMockMissionState({
      is_stale: false,
      rx_age_ms: 20,
      target: {
        ...createMockMissionState().target!,
        age_ms: 5000,
      },
    })
    renderWithContext(mockState)

    expect(screen.getByText('DỮ LIỆU CŨ (>3s)')).toBeDefined()
    expect(screen.getByText(/DỮ LIỆU CŨ \(5000 ms\)/i)).toBeDefined()
  })

  it('cách ly hệ quy chiếu: khi đang ở WGS-84, radar local không vẽ điểm ảo và hiển thị N/A', () => {
    const onSwitch = vi.fn()
    const mockState = createMockMissionState({
      target: {
        track_id: 101,
        class_id: 1,
        class_name: 'person',
        confidence: 95,
        target_confirmed: true,
        pos_valid: true,
        coordinate_frame: 'WGS84',
        local_x_cm: null,
        local_y_cm: null,
        latitude: 15.8925,
        longitude: 108.0654,
        origin_id: null,
        age_ms: 0,
      },
    })

    renderWithContext(mockState, onSwitch)

    expect(screen.getByText(/Hệ quy chiếu toàn cầu \(WGS-84\) đang kích hoạt/i)).toBeDefined()
    expect(screen.getByText('WGS-84 ACTIVE')).toBeDefined()
    expect(screen.getAllByText(/Tọa độ Hệ Local: N\/A/i).length).toBeGreaterThan(0)

    // Bấm nút chuyển sang bản đồ
    const switchButton = screen.getByRole('button', { name: /Xem Bản Đồ WGS-84/i })
    fireEvent.click(switchButton)
    expect(onSwitch).toHaveBeenCalledTimes(1)
  })

  it('điều khiển zoom thang đo local hoạt động chính xác', () => {
    const mockState = createMockMissionState()
    renderWithContext(mockState)

    expect(screen.getAllByText('200cm').length).toBeGreaterThan(0)

    const zoomInButton = screen.getByRole('button', { name: /Phóng to local/i })
    fireEvent.click(zoomInButton)
    expect(screen.getAllByText('150cm').length).toBeGreaterThan(0)

    const zoomOutButton = screen.getByRole('button', { name: /Thu nhỏ local/i })
    fireEvent.click(zoomOutButton)
    expect(screen.getAllByText('200cm').length).toBeGreaterThan(0)
  })
})
