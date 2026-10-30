import { act, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { RawTelemetryPacket } from '@/types/telemetry'
import { APP_CONFIG } from '@/config/appConfig'
import type { ApplicationPacket } from '@/services/telemetryClient'

const mocks = vi.hoisted(() => ({
  mockPacketListeners: [] as Array<(packet: RawTelemetryPacket) => void>,
  realPacketListeners: [] as Array<(packet: RawTelemetryPacket) => void>,
  statusListeners: [] as Array<(connected: boolean) => void>,
  mockStart: vi.fn(),
  mockStop: vi.fn(),
  mockSetScenario: vi.fn(),
  realConnect: vi.fn(),
  realDisconnect: vi.fn(),
  realReconnect: vi.fn(),
}))

vi.mock('@/mocks/mockSource', () => ({
  mockSourceInstance: {
    subscribe: vi.fn((listener: (packet: RawTelemetryPacket) => void) => {
      mocks.mockPacketListeners.push(listener)
      return vi.fn()
    }),
    start: mocks.mockStart,
    stop: mocks.mockStop,
    setScenario: mocks.mockSetScenario,
  },
}))

vi.mock('@/services/telemetryClient', () => ({
  telemetryClientInstance: {
    onPacket: vi.fn((listener: (packet: RawTelemetryPacket) => void) => {
      mocks.realPacketListeners.push(listener)
      return vi.fn()
    }),
    onStatusChange: vi.fn((listener: (connected: boolean) => void) => {
      mocks.statusListeners.push(listener)
      return vi.fn()
    }),
    connect: mocks.realConnect,
    disconnect: mocks.realDisconnect,
    reconnect: mocks.realReconnect,
    setUrl: vi.fn(),
  },
}))

import { MissionProvider, useMission } from './MissionProvider'

function Probe() {
  const { state, switchSourceMode } = useMission()
  return (
    <div>
      <span data-testid="source-mode">{state.source_mode}</span>
      <span data-testid="battery">{state.telemetry.battery_pct ?? 'N/A'}</span>
      <span data-testid="ws">{String(state.ws_connected)}</span>
      <span data-testid="hardware">{state.hardware_link.status}</span>
      <span data-testid="logger">{state.diagnostics.logger_status}</span>
      <span data-testid="target-age">{state.target?.age_ms ?? 'N/A'}</span>
      <span data-testid="telemetry-age">{state.telemetry_age_ms ?? 'N/A'}</span>
      <span data-testid="alerts">{state.alerts.length}</span>
      <span data-testid="replay-position">{state.replay?.position_ms ?? 'N/A'}</span>
      <button type="button" onClick={() => switchSourceMode('MOCK')}>MOCK</button>
      <button type="button" onClick={() => switchSourceMode('REAL')}>REAL</button>
      <button type="button" onClick={() => switchSourceMode('REPLAY')}>REPLAY</button>
    </div>
  )
}

describe('MissionProvider source ownership', () => {
  beforeEach(() => {
    localStorage.clear()
    mocks.mockPacketListeners.length = 0
    mocks.realPacketListeners.length = 0
    mocks.statusListeners.length = 0
    vi.clearAllMocks()
    Object.defineProperty(APP_CONFIG, 'MOCK_TRANSPORT', { value: 'LOCAL', configurable: true })
  })

  it('LOCAL keeps backend disconnected and storage degraded without opening WS', () => {
    render(<MissionProvider><Probe /></MissionProvider>)
    expect(screen.getByTestId('ws').textContent).toBe('false')
    expect(screen.getByTestId('logger').textContent).toBe('LOG_DEGRADED')
    expect(mocks.realConnect).not.toHaveBeenCalled()
  })

  it('BACKEND uses MOCK WS exclusively; lost socket never starts local fallback', () => {
    Object.defineProperty(APP_CONFIG, 'MOCK_TRANSPORT', { value: 'BACKEND', configurable: true })
    render(<MissionProvider><Probe /></MissionProvider>)
    expect(mocks.realConnect).toHaveBeenCalledWith('MOCK')
    expect(mocks.mockStart).not.toHaveBeenCalled()
    act(() => mocks.statusListeners[0](true))
    act(() => mocks.realPacketListeners[0]({
      event_type: 'SNAPSHOT', source_mode: 'MOCK', session_id: 'SES-BACKEND',
      inference_device: 'SIMULATED', hardware_link: { status: 'UNKNOWN' },
      telemetry: { battery_pct: 85 }, diagnostics: { logger_status: 'LOG_DEGRADED' },
    }))
    expect(screen.getByTestId('source-mode').textContent).toBe('MOCK')
    expect(screen.getByTestId('battery').textContent).toBe('85')
    expect(screen.getByTestId('ws').textContent).toBe('true')
    expect(screen.getByTestId('hardware').textContent).toBe('UNKNOWN')
    act(() => mocks.statusListeners[0](false))
    expect(screen.getByTestId('ws').textContent).toBe('false')
    expect(mocks.mockStart).not.toHaveBeenCalled()
  })

  it('restores multiple snapshot alerts and independent ages at reconnect', () => {
    Object.defineProperty(APP_CONFIG, 'MOCK_TRANSPORT', { value: 'BACKEND', configurable: true })
    const packet: ApplicationPacket = {
      event_type: 'SNAPSHOT', source_mode: 'MOCK', session_id: 'SES-BACKEND',
      telemetry: { battery_pct: 85 }, telemetry_age_ms: 1000, target_age_ms: 10000,
      target: { class_id: 1, class_name: 'person', pos_valid: true, coordinate_frame: 'LOCAL_GRID', local_x_cm: 0, local_y_cm: 0 },
      has_target: true,
      alerts: [
        { level: 'WARN', code: 'A', message: 'warning', timestamp_iso: '2026-10-13T00:00:00Z' },
        { level: 'CRITICAL', code: 'B', message: 'critical', timestamp_iso: '2026-10-13T00:00:01Z' },
      ],
    }
    render(<MissionProvider><Probe /></MissionProvider>)
    act(() => mocks.statusListeners[0](true))
    act(() => mocks.realPacketListeners[0](packet))
    expect(screen.getByTestId('alerts').textContent).toBe('2')
    expect(screen.getByTestId('target-age').textContent).toBe('10000')
    expect(screen.getByTestId('telemetry-age').textContent).toBe('1000')
    act(() => mocks.realPacketListeners[0]({ event_type: 'ALERT_EVENT', source_mode: 'MOCK', alert: null }))
    expect(screen.getByTestId('alerts').textContent).toBe('0')
  })

  it('không khởi động lại mockSource khi REAL nhận packet MOCK', async () => {
    render(
      <MissionProvider>
        <Probe />
      </MissionProvider>
    )

    expect(screen.getByTestId('source-mode').textContent).toBe('MOCK')
    expect(mocks.mockStart).toHaveBeenCalledTimes(1)
    expect(mocks.mockPacketListeners).toHaveLength(1)

    act(() => {
      mocks.mockPacketListeners[0]({
        event_type: 'SNAPSHOT',
        source_mode: 'REAL',
        session_id: 'SES-SCENARIO-HW',
        telemetry: { battery_pct: 42 },
      })
    })
    expect(screen.getByTestId('source-mode').textContent).toBe('MOCK')
    expect(screen.getByTestId('battery').textContent).toBe('42')

    fireEvent.click(screen.getByRole('button', { name: 'REAL' }))
    await waitFor(() => expect(screen.getByTestId('source-mode').textContent).toBe('REAL'))
    await waitFor(() => expect(mocks.realConnect).toHaveBeenCalledTimes(1))
    expect(mocks.realPacketListeners).toHaveLength(1)
    expect(screen.getByTestId('logger').textContent).toBe('OK')

    act(() => {
      mocks.realPacketListeners[0]({
        event_type: 'SNAPSHOT',
        source_mode: 'MOCK',
        session_id: 'SES-FOREIGN-MOCK',
        telemetry: { battery_pct: 99 },
      })
    })

    expect(screen.getByTestId('source-mode').textContent).toBe('REAL')
    expect(screen.getByTestId('battery').textContent).toBe('N/A')
    expect(mocks.mockStart).toHaveBeenCalledTimes(1)
  })

  it('REPLAY packet vẫn được parse dù UI không còn chế độ này', async () => {
    render(<MissionProvider><Probe /></MissionProvider>)
    expect(mocks.mockStart).toHaveBeenCalledTimes(1)

    fireEvent.click(screen.getByRole('button', { name: 'REPLAY' }))
    await waitFor(() => expect(screen.getByTestId('source-mode').textContent).toBe('REPLAY'))
    await waitFor(() => expect(mocks.realConnect).toHaveBeenLastCalledWith('REPLAY'))
    expect(mocks.mockStart).toHaveBeenCalledTimes(1)
    expect(mocks.mockStop).toHaveBeenCalled()

    act(() => mocks.realPacketListeners.at(-1)?.({
      event_type: 'SNAPSHOT', source_mode: 'REPLAY', session_id: 'SES-REPLAY',
      original_source_mode: 'REAL', inference_device: 'PC_REFERENCE',
      telemetry: { battery_pct: 64 }, has_target: false, target: null,
      replay_metadata: {
        source_file: 'SES-LOG.db', source_session_id: 'SES-LOG', speed_multiplier: 1,
        is_paused: false, current_record_index: 1, total_records: 4,
        progress_pct: 25, position_ms: 1000, duration_ms: 4000,
      },
    }))
    expect(screen.getByTestId('battery').textContent).toBe('64')
    expect(screen.getByTestId('replay-position').textContent).toBe('1000')

    fireEvent.click(screen.getByRole('button', { name: 'MOCK' }))
    await waitFor(() => expect(screen.getByTestId('source-mode').textContent).toBe('MOCK'))
    expect(screen.getByTestId('battery').textContent).toBe('N/A')
    expect(screen.getByTestId('replay-position').textContent).toBe('N/A')
    expect(mocks.mockStart).toHaveBeenCalledTimes(2)
  })
})
