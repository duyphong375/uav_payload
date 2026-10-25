import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  state: { source_mode: 'MOCK', replay: null } as any,
  switchSourceMode: vi.fn(),
  fetchSessions: vi.fn(),
  startReplay: vi.fn(),
  pauseReplay: vi.fn(),
  resumeReplay: vi.fn(),
  seekReplay: vi.fn(),
  setReplaySpeed: vi.fn(),
  stopReplay: vi.fn(),
}))

vi.mock('@/state/MissionProvider', () => ({
  useMission: () => ({ state: mocks.state, switchSourceMode: mocks.switchSourceMode }),
}))

vi.mock('@/services/telemetryClient', () => ({
  TelemetryClient: {
    fetchSessions: mocks.fetchSessions,
    startReplay: mocks.startReplay,
    pauseReplay: mocks.pauseReplay,
    resumeReplay: mocks.resumeReplay,
    seekReplay: mocks.seekReplay,
    setReplaySpeed: mocks.setReplaySpeed,
    stopReplay: mocks.stopReplay,
  },
}))

import { ReplayControls } from './ReplayControls'

const metadata = {
  source_file: 'SES-REC.db', source_session_id: 'SES-REC', speed_multiplier: 1,
  is_paused: false, current_record_index: 2, total_records: 4,
  progress_pct: 50, position_ms: 2000, duration_ms: 4000,
}

describe('ReplayControls', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mocks.state = { source_mode: 'MOCK', replay: null }
    mocks.fetchSessions.mockResolvedValue({
      active_session_id: 'SES-LIVE', storage_implemented: true,
      sessions: [
        { session_id: 'SES-EMPTY', file: 'SES-EMPTY.db', records: 0, size_bytes: 0, last_persisted_at_iso: null },
        { session_id: 'SES-REC', file: 'SES-REC.db', records: 4, size_bytes: 4096, last_persisted_at_iso: null },
      ],
    })
    mocks.startReplay.mockResolvedValue({ status: 'replay_started', replay: metadata })
    mocks.pauseReplay.mockResolvedValue({ status: 'replay_paused', replay: { ...metadata, is_paused: true } })
    mocks.resumeReplay.mockResolvedValue({ status: 'replay_resumed', replay: metadata })
    mocks.seekReplay.mockResolvedValue({ status: 'seek_ok', replay: metadata })
    mocks.setReplaySpeed.mockResolvedValue({ status: 'speed_ok', replay: metadata })
    mocks.stopReplay.mockResolvedValue(true)
  })

  it('chỉ liệt kê phiên có record và start đúng session/speed trước khi chuyển REPLAY', async () => {
    render(<ReplayControls />)
    const select = await screen.findByLabelText('Phiên') as HTMLSelectElement
    expect(select.value).toBe('SES-REC')
    expect(screen.queryByText(/SES-EMPTY/)).toBeNull()
    fireEvent.change(screen.getByLabelText('Tốc độ'), { target: { value: '2' } })
    fireEvent.click(screen.getByRole('button', { name: /Bắt đầu/ }))
    await waitFor(() => expect(mocks.startReplay).toHaveBeenCalledWith('SES-REC', 2))
    expect(mocks.switchSourceMode).toHaveBeenCalledWith('REPLAY')
  })

  it('pause/resume/speed/seek/stop gọi API và stop xóa nhãn REPLAY', async () => {
    mocks.state = { source_mode: 'REPLAY', replay: metadata }
    const { rerender } = render(<ReplayControls />)
    expect(screen.getByTestId('replay-session-id').textContent).toBe('SES-REC')
    expect(screen.getByLabelText('Thời gian phát lại').textContent).toBe('0:02 / 0:04')

    fireEvent.click(screen.getByRole('button', { name: /Tạm dừng/ }))
    await waitFor(() => expect(mocks.pauseReplay).toHaveBeenCalled())
    fireEvent.change(screen.getByLabelText('Tốc độ'), { target: { value: '0.5' } })
    await waitFor(() => expect(mocks.setReplaySpeed).toHaveBeenCalledWith(0.5))
    fireEvent.change(screen.getByLabelText('Vị trí (ms)'), { target: { value: '3500' } })
    fireEvent.click(screen.getByRole('button', { name: /Tìm đến/ }))
    await waitFor(() => expect(mocks.seekReplay).toHaveBeenCalledWith(3500))

    mocks.state = { source_mode: 'REPLAY', replay: { ...metadata, is_paused: true } }
    rerender(<ReplayControls />)
    fireEvent.click(screen.getByRole('button', { name: /Tiếp tục/ }))
    await waitFor(() => expect(mocks.resumeReplay).toHaveBeenCalled())
    fireEvent.click(screen.getByRole('button', { name: /Dừng phát lại/ }))
    await waitFor(() => expect(mocks.stopReplay).toHaveBeenCalled())
    expect(mocks.switchSourceMode).toHaveBeenCalledWith('MOCK')
  })
})
