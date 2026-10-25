import { render, screen } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { GnssSatelliteSheet } from './GnssSatelliteSheet'

const mission = vi.hoisted(() => ({ state: {
  source_mode: 'MOCK', is_stale: false,
  telemetry: { gps_valid: true },
  camera_position: { is_valid: true, latitude: 15.89 as number | null, longitude: 108.06 as number | null },
} }))
vi.mock('@/state/MissionProvider', () => ({ useMission: () => mission }))

beforeEach(() => {
  mission.state.is_stale = false
  mission.state.telemetry.gps_valid = true
})

describe('GnssSatelliteSheet — GNSS theo cấu hình KVC', () => {
  it('không tạo số vệ tinh, DOP hay sai số từ một cờ fix', () => {
    const { container } = render(<GnssSatelliteSheet open onOpenChange={vi.fn()} />)
    expect(screen.getByText(/NEO-M10N/)).toBeDefined()
    expect(screen.getByText('FIX HỢP LỆ')).toBeDefined()
    expect(screen.getAllByText('N/A')).toHaveLength(6)
    expect(container.textContent).not.toContain('18 SATS')
    expect(container.textContent).not.toContain('0.8')
    expect(container.textContent).not.toContain('AN TOÀN')
  })

  it('dữ liệu cũ không được trình bày là fix hoặc tọa độ hiện hành', () => {
    mission.state.is_stale = true
    render(<GnssSatelliteSheet open onOpenChange={vi.fn()} />)
    expect(screen.getByText('DỮ LIỆU CŨ')).toBeDefined()
    expect(screen.queryByText('15.890000')).toBeNull()
    expect(screen.queryByText('FIX HỢP LỆ')).toBeNull()
  })

  it('không hiển thị nội dung khi đóng', () => {
    render(<GnssSatelliteSheet open={false} onOpenChange={vi.fn()} />)
    expect(screen.queryByText('Phần Vệ Tinh GNSS Định Vị')).toBeNull()
  })
})
