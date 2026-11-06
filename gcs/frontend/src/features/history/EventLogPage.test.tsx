import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { TooltipProvider } from '@/components/ui/tooltip'
import { MissionContext, type MissionContextValue } from '@/state/MissionProvider'
import { INITIAL_MISSION_STATE } from '@/state/missionReducer'
import type { EventLogEntry, MissionState } from '@/types/telemetry'
import { EventLogPage } from './EventLogPage'
import { groupByLocalDay } from './eventLogTime'

const fetchSessionsMock = vi.fn()
const deleteSessionMock = vi.fn()
const deleteAllSessionsMock = vi.fn()

vi.mock('@/services/telemetryClient', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/services/telemetryClient')>()
  return {
    ...actual,
    TelemetryClient: {
      ...actual.TelemetryClient,
      fetchSessions: (...args: unknown[]) => fetchSessionsMock(...args),
      deleteSession: (...args: unknown[]) => deleteSessionMock(...args),
      deleteAllSessions: (...args: unknown[]) => deleteAllSessionsMock(...args),
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

/** Mốc ISO của một ngày lịch địa phương, dựng bằng giờ local để test không phụ thuộc múi giờ. */
const localIso = (daysAgo: number, hour = 10, minute = 0) => {
  const now = new Date()
  return new Date(
    now.getFullYear(),
    now.getMonth(),
    now.getDate() - daysAgo,
    hour,
    minute,
    0
  ).toISOString()
}

const renderPage = (overrides: Partial<MissionState> = {}) => {
  const state: MissionState = {
    ...INITIAL_MISSION_STATE,
    session_id: 'SES-REAL-20261016-01',
    source_mode: 'REAL',
    event_logs: [],
    ...overrides,
  }
  const dispatch = vi.fn()
  const value: MissionContextValue = {
    state,
    dispatch,
    selectedScenarioId: 'NORMAL_GPS_TARGET',
    setSelectedScenarioId: vi.fn(),
    switchSourceMode: vi.fn(),
    reconnect: vi.fn(),
    wsUrl: 'ws://127.0.0.1:8000/ws/telemetry',
    setWsUrl: vi.fn(() => ({ ok: true })),
  }
  const result = render(
    <TooltipProvider>
      <MissionContext.Provider value={value}>
        <EventLogPage />
      </MissionContext.Provider>
    </TooltipProvider>
  )
  return { ...result, dispatch }
}

describe('groupByLocalDay', () => {
  const now = new Date(2026, 9, 30, 12, 0, 0)

  it('nhóm theo ngày địa phương và đặt Hôm nay trước Hôm qua', () => {
    const groups = groupByLocalDay(
      [
        log({ id: 'a', timestamp_iso: new Date(2026, 9, 30, 9, 0).toISOString() }),
        log({ id: 'b', timestamp_iso: new Date(2026, 9, 29, 22, 0).toISOString() }),
        log({ id: 'c', timestamp_iso: new Date(2026, 9, 30, 11, 0).toISOString() }),
      ],
      now
    )

    expect(groups).toHaveLength(2)
    expect(groups[0].label).toContain('Hôm nay')
    expect(groups[0].entries.map((e) => e.id)).toEqual(['a', 'c'])
    expect(groups[1].label).toContain('Hôm qua')
    expect(groups[1].entries.map((e) => e.id)).toEqual(['b'])
  })

  it('ngày cũ dùng nhãn dd/mm/yyyy, không dùng Hôm nay/Hôm qua', () => {
    const groups = groupByLocalDay(
      [log({ id: 'x', timestamp_iso: new Date(2026, 8, 1, 8, 0).toISOString() })],
      now
    )

    expect(groups).toHaveLength(1)
    expect(groups[0].label).toBe('01/09/2026')
  })

  it('mốc thời gian hỏng rơi vào nhóm Không xác định và đứng cuối', () => {
    const groups = groupByLocalDay(
      [
        log({ id: 'good', timestamp_iso: new Date(2026, 9, 30, 9, 0).toISOString() }),
        log({ id: 'bad', timestamp_iso: 'not-a-date' }),
      ],
      now
    )

    expect(groups).toHaveLength(2)
    expect(groups[0].label).toContain('Hôm nay')
    expect(groups[1].key).toBe('unknown')
    expect(groups[1].label).toBe('Không xác định')
    expect(groups[1].entries[0].id).toBe('bad')
  })
})

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

  it('hiển thị tiêu đề nhóm ngày kèm số mục', () => {
    renderPage({
      event_logs: [
        log({ id: 't1', timestamp_iso: localIso(0, 9), message: 'Hôm nay một' }),
        log({ id: 't2', timestamp_iso: localIso(0, 11), message: 'Hôm nay hai' }),
        log({ id: 'y1', timestamp_iso: localIso(1, 8), message: 'Hôm qua một' }),
      ],
    })

    expect(screen.getByText(/Hôm nay ·/)).toBeDefined()
    expect(screen.getByText(/Hôm qua ·/)).toBeDefined()
    expect(screen.getAllByText('2 mục')).toHaveLength(1)
    expect(screen.getAllByText('1 mục')).toHaveLength(1)
  })

  it('ẩn một mục thì dòng biến mất và bộ đếm tăng', () => {
    renderPage({
      event_logs: [log({ id: 'hide-me', code: 'GNSS_FIX_LOST', message: 'Dòng sẽ bị ẩn' })],
    })

    expect(screen.getByText('Dòng sẽ bị ẩn')).toBeDefined()
    expect(screen.getByRole('button', { name: /Hiện mục đã ẩn \(0\)/ })).toBeDefined()

    fireEvent.click(screen.getByRole('button', { name: /^Ẩn sự kiện GNSS_FIX_LOST/ }))

    expect(screen.queryByText('Dòng sẽ bị ẩn')).toBeNull()
    expect(screen.getByRole('button', { name: /Hiện mục đã ẩn \(1\)/ })).toBeDefined()
  })

  it('bật Hiện mục đã ẩn thì dòng trở lại và có nhãn ĐÃ ẨN', () => {
    renderPage({
      event_logs: [log({ id: 'hide-me', code: 'GNSS_FIX_LOST', message: 'Dòng sẽ bị ẩn' })],
    })

    fireEvent.click(screen.getByRole('button', { name: /^Ẩn sự kiện GNSS_FIX_LOST/ }))
    expect(screen.queryByText('Dòng sẽ bị ẩn')).toBeNull()

    fireEvent.click(screen.getByRole('button', { name: /Hiện mục đã ẩn \(1\)/ }))

    expect(screen.getByText('Dòng sẽ bị ẩn')).toBeDefined()
    expect(screen.getByText('ĐÃ ẨN')).toBeDefined()
    expect(screen.getByRole('button', { name: /^Bỏ ẩn sự kiện GNSS_FIX_LOST/ })).toBeDefined()
  })

  it('bỏ ẩn trả dòng về trạng thái bình thường', () => {
    renderPage({
      event_logs: [log({ id: 'hide-me', code: 'GNSS_FIX_LOST', message: 'Dòng sẽ bị ẩn' })],
    })

    fireEvent.click(screen.getByRole('button', { name: /^Ẩn sự kiện GNSS_FIX_LOST/ }))
    fireEvent.click(screen.getByRole('button', { name: /Hiện mục đã ẩn \(1\)/ }))
    fireEvent.click(screen.getByRole('button', { name: /^Bỏ ẩn sự kiện GNSS_FIX_LOST/ }))

    expect(screen.getByText('Dòng sẽ bị ẩn')).toBeDefined()
    expect(screen.queryByText('ĐÃ ẨN')).toBeNull()
    expect(screen.getByRole('button', { name: /Hiện mục đã ẩn \(0\)/ })).toBeDefined()
  })

  it('mốc thời gian hỏng hiện nhóm Không xác định, không crash', () => {
    renderPage({
      event_logs: [log({ id: 'bad', timestamp_iso: 'không-phải-ngày', message: 'Mốc hỏng' })],
    })

    expect(screen.getByText('Không xác định')).toBeDefined()
    expect(screen.getByText('Mốc hỏng')).toBeDefined()
  })

  it('có hành động xoá sự kiện và xoá toàn bộ nhật ký phiên có xác nhận', () => {
    const confirmSpy = vi.spyOn(window, 'confirm').mockReturnValue(true)
    const { dispatch } = renderPage({
      event_logs: [log({ id: 'del-1', code: 'GNSS_FIX_LOST', message: 'Dòng sẽ bị xoá' })],
    })

    const deleteBtn = screen.getByRole('button', { name: /^Xoá sự kiện/ })
    expect(deleteBtn).toBeDefined()
    fireEvent.click(deleteBtn)
    expect(dispatch).toHaveBeenCalledWith({ type: 'DELETE_EVENT_LOG', payload: 'del-1' })

    const clearAllBtn = screen.getByRole('button', { name: /Xoá toàn bộ nhật ký phiên/ })
    expect(clearAllBtn).toBeDefined()
    fireEvent.click(clearAllBtn)
    expect(confirmSpy).toHaveBeenCalled()
    expect(dispatch).toHaveBeenCalledWith({ type: 'CLEAR_EVENT_LOGS' })

    confirmSpy.mockRestore()
  })

  it('xoá phiên đã lưu và xoá tất cả phiên gọi API sau khi xác nhận', async () => {
    deleteSessionMock.mockResolvedValue({ ok: true })
    deleteAllSessionsMock.mockResolvedValue({ ok: true, deletedCount: 1 })
    fetchSessionsMock.mockResolvedValue({
      active_session_id: 'SES-001',
      storage_implemented: true,
      sessions: [
        {
          session_id: 'SES-PAST-001',
          file: 'SES-PAST-001.db',
          records: 10,
          size_bytes: 4096,
          last_persisted_at_iso: '2026-11-04T12:00:00Z',
        },
      ],
    })

    const confirmSpy = vi.spyOn(window, 'confirm').mockReturnValue(true)
    renderPage()

    await waitFor(() => {
      expect(screen.getByText('SES-PAST-001')).toBeDefined()
    })

    const deleteBtn = screen.getByRole('button', { name: 'Xóa phiên SES-PAST-001' })
    fireEvent.click(deleteBtn)
    expect(confirmSpy).toHaveBeenCalled()
    expect(deleteSessionMock).toHaveBeenCalledWith('SES-PAST-001')

    const deleteAllBtn = screen.getByRole('button', { name: 'Xóa tất cả phiên đã lưu' })
    fireEvent.click(deleteAllBtn)
    expect(confirmSpy).toHaveBeenCalled()
    expect(deleteAllSessionsMock).toHaveBeenCalled()

    confirmSpy.mockRestore()
  })

  it('ẩn mềm không phát action nào lên reducer', () => {
    const { dispatch } = renderPage({
      event_logs: [log({ id: 'a', message: 'Một' }), log({ id: 'b', message: 'Hai' })],
    })

    fireEvent.click(screen.getAllByRole('button', { name: /^Ẩn sự kiện/ })[0])

    expect(dispatch).not.toHaveBeenCalled()
    expect(screen.getByRole('button', { name: /Hiện mục đã ẩn \(1\)/ })).toBeDefined()
  })
})
