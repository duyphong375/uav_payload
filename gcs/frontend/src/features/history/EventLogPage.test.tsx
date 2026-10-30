import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { TooltipProvider } from '@/components/ui/tooltip'
import { MissionContext, type MissionContextValue } from '@/state/MissionProvider'
import { INITIAL_MISSION_STATE } from '@/state/missionReducer'
import type { EventLogEntry, MissionState } from '@/types/telemetry'
import { EventLogPage } from './EventLogPage'

const fetchSessionsMock = vi.fn()

vi.mock('@/services/telemetryClient', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/services/telemetryClient')>()
  return {
    ...actual,
    TelemetryClient: {
      ...actual.TelemetryClient,
      fetchSessions: (...args: unknown[]) => fetchSessionsMock(...args),
    },
  }
})

const log = (overrides: Partial<EventLogEntry>): EventLogEntry => ({
  id: `log-${Math.random().toString(36).slice(2, 8)}`,
  timestamp_iso: '2026-10-16T04:28:04.000Z',
  level: 'INFO',
  source: 'SYSTEM',
  code: 'GNSS_FIX_LOST',
  message: 'Mất khoá vệ tinh GNSS',
  session_id: 'SES-REAL-20261016-01',
  ...overrides,
})

const renderPage = (overrides: Partial<MissionState> = {}) => {
  const state: MissionState = {
    ...INITIAL_MISSION_STATE,
    session_id: 'SES-REAL-20261016-01',
    source_mode: 'REAL',
    event_logs: [],
    ...overrides,
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
        <EventLogPage />
      </MissionContext.Provider>
    </TooltipProvider>
  )
}

describe('EventLogPage - Nhật ký phiên', () => {
  beforeEach(() => {
    fetchSessionsMock.mockReset()
    fetchSessionsMock.mockResolvedValue({
      active_session_id: 'SES-REAL-20261016-01',
      storage_implemented: true,
      sessions: [
        {
          session_id: 'SES-REAL-20261016-01',
          file: 'data/sessions/SES-REAL-20261016-01.db',
          records: 1250,
          size_bytes: 42000,
          last_persisted_at_iso: '2026-10-16T12:00:00Z',
        },
      ],
    })
  })

  it('hiển thị hai khối độc lập: nhật ký phiên đang chạy và phiên đã lưu', async () => {
    renderPage()

    expect(screen.getByRole('heading', { name: 'Nhật ký phiên' })).toBeDefined()
    expect(screen.getByText('Nhật ký phiên đang chạy')).toBeDefined()
    expect(screen.getByText('Phiên đã lưu')).toBeDefined()
    expect(screen.getByText('Chưa có sự kiện nào trong phiên này')).toBeDefined()

    await waitFor(() => expect(screen.getByText('SES-REAL-20261016-01')).toBeDefined())
    expect(screen.getByText('41.0 KB')).toBeDefined()

    // Không còn nút xem lại video/debriefing hay tab kiểm toán
    expect(screen.queryByText(/video/i)).toBeNull()
    expect(screen.queryByRole('button', { name: /Nhật ký sự kiện kiểm toán/i })).toBeNull()
  })

  it('tách tác nhân: bộ lọc Người vận hành chỉ còn dòng SAR_MARK_EVENT', () => {
    renderPage({
      event_logs: [
        log({ id: 'op-1', source: 'SAR_MISSION', code: 'SAR_MARK_EVENT', message: 'Đánh dấu sự kiện mục tiêu' }),
        log({ id: 'sys-1', code: 'GNSS_FIX_LOST', message: 'Mất khoá vệ tinh GNSS' }),
      ],
    })

    // Cả hai dòng hiển thị ở chế độ Tất cả
    expect(screen.getByText('Đánh dấu sự kiện mục tiêu')).toBeDefined()
    expect(screen.getByText('Mất khoá vệ tinh GNSS')).toBeDefined()

    fireEvent.click(screen.getByRole('button', { name: /Người vận hành/ }))

    expect(screen.getByText('Đánh dấu sự kiện mục tiêu')).toBeDefined()
    expect(screen.queryByText('Mất khoá vệ tinh GNSS')).toBeNull()

    fireEvent.click(screen.getByRole('button', { name: /Hệ thống/ }))
    expect(screen.queryByText('Đánh dấu sự kiện mục tiêu')).toBeNull()
    expect(screen.getByText('Mất khoá vệ tinh GNSS')).toBeDefined()
  })

  it('không có phiên giả và hiện thông báo rỗng khi backend không trả dữ liệu', async () => {
    fetchSessionsMock.mockResolvedValue(null)
    renderPage()

    await waitFor(() => expect(screen.getByText('Chưa có phiên nào được ghi')).toBeDefined())
    // Không được có phiên bịa
    expect(screen.queryByText(/MOCK-DEMO/i)).toBeNull()
  })

  it('không suy diễn thời lượng hay trạng thái video từ số gói', async () => {
    renderPage()
    await waitFor(() => expect(screen.getByText('SES-REAL-20261016-01')).toBeDefined())

    const content = document.body.textContent ?? ''
    expect(content).not.toMatch(/Có video/i)
    expect(content).not.toMatch(/Chỉ telemetry/i)
    expect(content).not.toMatch(/phút/i)
  })
})
