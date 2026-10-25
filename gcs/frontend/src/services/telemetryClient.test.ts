import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { adaptApplicationPacket, TelemetryClient } from './telemetryClient'

class FakeSocket {
  static OPEN = 1
  static CONNECTING = 0
  static instances: FakeSocket[] = []
  readyState = 0
  onopen: (() => void) | null = null
  onclose: (() => void) | null = null
  onmessage: ((event: { data: string }) => void) | null = null
  onerror: (() => void) | null = null
  close = vi.fn(() => { this.readyState = 3 })
  constructor(public url: string) { FakeSocket.instances.push(this) }
  open() { this.readyState = 1; this.onopen?.() }
  message(packet: object) { this.onmessage?.({ data: JSON.stringify(packet) }) }
  lost() { this.readyState = 3; this.onclose?.() }
}

function snapshot() {
  return {
    event_type: 'SNAPSHOT', source_mode: 'MOCK', original_source_mode: 'MOCK',
    inference_device: 'SIMULATED', schema_version: '1.0.0', session_id: 'SES-A',
    sequence_number: 0, telemetry: null, target: null, has_target: false,
    camera_position: null, bounding_boxes: [], replay_metadata: null,
    hardware_link: { status: 'UNKNOWN' }, diagnostics: { logger_status: 'LOG_DEGRADED' },
    alerts: [], telemetry_age_ms: null, target_age_ms: null, camera_age_ms: null,
  }
}

function replayMetadata() {
  return {
    source_file: 'SES-RECORDED.db', source_session_id: 'SES-RECORDED',
    speed_multiplier: 1, is_paused: false, current_record_index: 1,
    total_records: 4, progress_pct: 25, position_ms: 1000, duration_ms: 4000,
  }
}

describe('TelemetryClient transport ownership', () => {
  beforeEach(() => {
    vi.useFakeTimers()
    FakeSocket.instances = []
    vi.stubGlobal('WebSocket', FakeSocket)
  })
  afterEach(() => { vi.useRealTimers(); vi.unstubAllGlobals() })

  it('gates incremental events behind a fresh snapshot on each connection', () => {
    const client = new TelemetryClient('ws://127.0.0.1:8000/ws/telemetry')
    const packets = vi.fn(), statuses = vi.fn()
    client.onPacket(packets)
    client.onStatusChange(statuses)
    client.connect('MOCK')
    const ws = FakeSocket.instances[0]
    ws.open()
    expect(statuses).toHaveBeenLastCalledWith(true)
    const patch = { event_type: 'TARGET_UPDATE', schema_version: '1.0.0', session_id: 'SES-A', source_mode: 'MOCK', target: null }
    ws.message(patch)
    expect(packets).not.toHaveBeenCalled()
    ws.message(snapshot())
    ws.message(patch)
    expect(packets).toHaveBeenCalledTimes(2)
    ws.message({ ...patch, session_id: 'foreign' })
    ws.message({ ...snapshot(), source_mode: 'REAL' })
    expect(packets).toHaveBeenCalledTimes(2)
    ws.lost()
    expect(statuses).toHaveBeenLastCalledWith(false)
    vi.advanceTimersByTime(2000)
    const reconnect = FakeSocket.instances[1]
    reconnect.open()
    reconnect.message(patch)
    expect(packets).toHaveBeenCalledTimes(2)
    reconnect.message(snapshot())
    expect(packets).toHaveBeenCalledTimes(3)
    client.disconnect()
    vi.advanceTimersByTime(10000)
    expect(FakeSocket.instances).toHaveLength(2)
  })

  it('connect/manual reconnect cancels the old retry and detaches old socket handlers', () => {
    const client = new TelemetryClient()
    client.connect('MOCK')
    const old = FakeSocket.instances[0]
    old.lost()
    client.reconnect()
    expect(old.onmessage).toBeNull()
    vi.advanceTimersByTime(2000)
    expect(FakeSocket.instances).toHaveLength(2)
    client.disconnect()
  })

  it('preserves ages and snapshot alerts and rejects invalid extended schema', () => {
    const packet = adaptApplicationPacket({ ...snapshot(), target_age_ms: 10000,
      alerts: [{ level: 'WARN', code: 'SENSOR_DEGRADED', message: 'invalid', condition_status: 'ACTIVE', timestamp_iso: '2026-10-13T00:00:00Z' }],
    })
    expect(packet?.target_age_ms).toBe(10000)
    expect(packet?.alerts).toHaveLength(1)
    expect(adaptApplicationPacket({ ...snapshot(), target_age_ms: '0' })).toBeNull()
    expect(adaptApplicationPacket({ ...snapshot(), alerts: [{}] })).toBeNull()
    expect(adaptApplicationPacket({ ...snapshot(), schema_version: '2.0.0' })).toBeNull()
    expect(adaptApplicationPacket({ ...snapshot(), session_id: '' })).toBeNull()
    expect(adaptApplicationPacket({ event_type: 'SNAPSHOT', source_mode: 'MOCK', schema_version: '1.0.0', session_id: 'A' })).toBeNull()
    const replaySnapshot = { ...snapshot(), source_mode: 'REPLAY', session_id: 'SES-REPLAY', replay_metadata: replayMetadata() }
    expect(adaptApplicationPacket(replaySnapshot)?.replay_metadata).toMatchObject({ position_ms: 1000 })
    expect(adaptApplicationPacket({ ...replaySnapshot, replay_metadata: null })).toBeNull()
    expect(adaptApplicationPacket({ ...replaySnapshot, replay_metadata: { ...replayMetadata(), speed_multiplier: 3 } })).toBeNull()
    expect(adaptApplicationPacket({ ...replaySnapshot, replay_metadata: { ...replayMetadata(), position_ms: 5000 } })).toBeNull()
  })

  it('accepts REPLAY only after its snapshot and keeps session isolation', () => {
    const client = new TelemetryClient()
    const packets = vi.fn()
    client.onPacket(packets)
    client.connect('REPLAY')
    const ws = FakeSocket.instances[0]
    ws.open()
    ws.message({ event_type: 'REPLAY_TICK', schema_version: '1.0.0', session_id: 'SES-REPLAY', source_mode: 'REPLAY', replay_metadata: replayMetadata() })
    expect(packets).not.toHaveBeenCalled()
    ws.message({ ...snapshot(), source_mode: 'REPLAY', session_id: 'SES-REPLAY', replay_metadata: replayMetadata() })
    ws.message({ event_type: 'REPLAY_TICK', schema_version: '1.0.0', session_id: 'SES-REPLAY', source_mode: 'REPLAY', replay_metadata: { ...replayMetadata(), position_ms: 2000, progress_pct: 50 } })
    expect(packets).toHaveBeenCalledTimes(2)
    client.disconnect()
  })

  it('calls session and replay REST endpoints with exact application payloads', async () => {
    const response = (body: object, ok = true) => ({ ok, json: vi.fn().mockResolvedValue(body) })
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(response({ active_session_id: 'LIVE', storage_implemented: true, sessions: [
        { session_id: 'SES-RECORDED', file: 'SES-RECORDED.db', records: 4, size_bytes: 4096, last_persisted_at_iso: null },
      ] }))
      .mockResolvedValueOnce(response({ status: 'replay_started', replay: replayMetadata() }))
      .mockResolvedValueOnce(response({ status: 'seek_ok', replay: { ...replayMetadata(), position_ms: 2000, progress_pct: 50 } }))
      .mockResolvedValueOnce(response({ status: 'speed_ok', replay: { ...replayMetadata(), speed_multiplier: 2 } }))
      .mockResolvedValueOnce(response({ status: 'replay_stopped', source_mode: 'MOCK', session_id: 'SES-NEW' }))
    vi.stubGlobal('fetch', fetchMock)

    expect((await TelemetryClient.fetchSessions('http://loopback'))?.sessions[0].records).toBe(4)
    expect(await TelemetryClient.startReplay('SES-RECORDED', 1, 'http://loopback')).not.toBeNull()
    expect(await TelemetryClient.seekReplay(2000, 'http://loopback')).not.toBeNull()
    expect(await TelemetryClient.setReplaySpeed(2, 'http://loopback')).not.toBeNull()
    expect(await TelemetryClient.stopReplay('http://loopback')).toBe(true)

    expect(fetchMock.mock.calls[1]).toEqual(['http://loopback/api/replay/start', expect.objectContaining({
      method: 'POST', body: JSON.stringify({ session_id: 'SES-RECORDED', speed: 1 }),
    })])
    expect(fetchMock.mock.calls[2][1].body).toBe(JSON.stringify({ timestamp_ms: 2000 }))
    expect(fetchMock.mock.calls[3][1].body).toBe(JSON.stringify({ speed: 2 }))
  })

  it('accepts backend snapshot when connected in REAL mode and normalizes source_mode', () => {
    const client = new TelemetryClient()
    const packets = vi.fn()
    client.onPacket(packets)
    client.connect('REAL')
    const ws = FakeSocket.instances[0]
    ws.open()
    ws.message(snapshot())
    expect(packets).toHaveBeenCalledTimes(1)
    expect(packets.mock.calls[0][0].source_mode).toBe('REAL')
    client.disconnect()
  })
})
