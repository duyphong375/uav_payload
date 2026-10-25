import { APP_CONFIG } from '@/config/appConfig'
import { adaptTelemetryPacket } from './telemetryAdapter'
import type { RawTelemetryPacket, ReplayMetadata, SourceMode } from '@/types/telemetry'

export interface ApplicationPacket extends RawTelemetryPacket {
  telemetry_age_ms?: number | null
  target_age_ms?: number | null
  camera_age_ms?: number | null
  alerts?: Array<NonNullable<RawTelemetryPacket['alert']> & { timestamp_iso: string }>
}

export type TelemetryPacketCallback = (packet: ApplicationPacket) => void
export type ConnectionStatusCallback = (isConnected: boolean) => void

export interface StoredSession {
  session_id: string
  file: string
  records: number
  size_bytes: number
  last_persisted_at_iso: string | null
}

export interface SessionListResponse {
  active_session_id: string
  storage_implemented: boolean
  sessions: StoredSession[]
}

export interface ReplayApiResponse {
  status: string
  replay: ReplayMetadata
}

const REPLAY_SPEEDS = new Set([0.5, 1, 2])

function isNonNegativeFinite(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value) && value >= 0
}

function parseReplayMetadata(value: unknown): ReplayMetadata | null {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) return null
  const data = value as Record<string, unknown>
  if (
    typeof data.source_file !== 'string' || !data.source_file ||
    typeof data.source_session_id !== 'string' || !data.source_session_id ||
    !REPLAY_SPEEDS.has(data.speed_multiplier as number) ||
    typeof data.is_paused !== 'boolean' ||
    !Number.isInteger(data.current_record_index) || !isNonNegativeFinite(data.current_record_index) ||
    !Number.isInteger(data.total_records) || !isNonNegativeFinite(data.total_records) ||
    !isNonNegativeFinite(data.progress_pct) || data.progress_pct > 100 ||
    !isNonNegativeFinite(data.position_ms) ||
    !isNonNegativeFinite(data.duration_ms) || data.position_ms > data.duration_ms
  ) return null
  return data as unknown as ReplayMetadata
}

function parseSessions(value: unknown): SessionListResponse | null {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) return null
  const data = value as Record<string, unknown>
  if (typeof data.active_session_id !== 'string' || typeof data.storage_implemented !== 'boolean' || !Array.isArray(data.sessions)) return null
  const sessions: StoredSession[] = []
  for (const value of data.sessions) {
    if (typeof value !== 'object' || value === null || Array.isArray(value)) return null
    const item = value as Record<string, unknown>
    if (
      typeof item.session_id !== 'string' || !item.session_id ||
      typeof item.file !== 'string' || !item.file ||
      !Number.isInteger(item.records) || !isNonNegativeFinite(item.records) ||
      !Number.isInteger(item.size_bytes) || !isNonNegativeFinite(item.size_bytes) ||
      (item.last_persisted_at_iso !== null && typeof item.last_persisted_at_iso !== 'string')
    ) return null
    sessions.push(item as unknown as StoredSession)
  }
  return { active_session_id: data.active_session_id, storage_implemented: data.storage_implemented, sessions }
}

/** Extra application snapshot fields, retained without changing hardware/frontend ABI types. */
export function adaptApplicationPacket(raw: unknown): ApplicationPacket | null {
  if (typeof raw !== 'object' || raw === null || Array.isArray(raw)) return null
  const data = raw as Record<string, unknown>
  if (data.schema_version !== '1.0.0' || typeof data.session_id !== 'string' || !data.session_id) return null
  const packet: ApplicationPacket | null = adaptTelemetryPacket(data)
  if (!packet) return null
  for (const key of ['telemetry_age_ms', 'target_age_ms', 'camera_age_ms'] as const) {
    if (Object.hasOwn(data, key)) {
      const value = data[key]
      if (value !== null && (typeof value !== 'number' || !Number.isFinite(value) || value < 0)) return null
      packet[key] = value as number | null
    }
  }
  if (packet.event_type === 'SNAPSHOT') {
    if (!['telemetry', 'target', 'has_target', 'hardware_link', 'diagnostics', 'camera_position', 'bounding_boxes', 'replay_metadata'].every(key => Object.hasOwn(data, key))) return null
    if (!Array.isArray(data.alerts) || data.alerts.length > 50) return null
    packet.alerts = []
    for (const rawAlert of data.alerts) {
      if (typeof rawAlert !== 'object' || rawAlert === null || Array.isArray(rawAlert)) return null
      const item = rawAlert as Record<string, unknown>
      if (typeof item.timestamp_iso !== 'string') return null
      const parsed = adaptTelemetryPacket({
        event_type: 'ALERT_EVENT', source_mode: packet.source_mode, alert: item,
      })
      if (!parsed?.alert) return null
      packet.alerts.push({ ...parsed.alert, timestamp_iso: item.timestamp_iso })
    }
  }
  if (Object.hasOwn(data, 'replay_metadata')) {
    if (data.replay_metadata === null) packet.replay_metadata = null
    else {
      const metadata = parseReplayMetadata(data.replay_metadata)
      if (!metadata) return null
      packet.replay_metadata = metadata
    }
  }
  if (packet.source_mode === 'REPLAY' &&
      (packet.event_type === 'SNAPSHOT' || packet.event_type === 'REPLAY_TICK') &&
      !packet.replay_metadata) return null
  return packet
}

export class TelemetryClient {
  private ws: WebSocket | null = null
  private url: string
  private isExplicitlyClosed = false
  private reconnectTimeoutId: ReturnType<typeof setTimeout> | null = null
  private expectedSource: SourceMode = 'REAL'
  private snapshotSession: string | null = null

  private onPacketListeners: Set<TelemetryPacketCallback> = new Set()
  private onStatusListeners: Set<ConnectionStatusCallback> = new Set()

  constructor(url = APP_CONFIG.WS_URL) {
    this.url = url
  }

  public setUrl(url: string): void {
    if (this.url !== url) {
      this.url = url
      if (this.ws && !this.isExplicitlyClosed) {
        this.reconnect()
      }
    }
  }

  public onPacket(callback: TelemetryPacketCallback): () => void {
    this.onPacketListeners.add(callback)
    return () => this.onPacketListeners.delete(callback)
  }

  public onStatusChange(callback: ConnectionStatusCallback): () => void {
    this.onStatusListeners.add(callback)
    return () => this.onStatusListeners.delete(callback)
  }

  public connect(expectedSource: SourceMode = this.expectedSource): void {
    this.expectedSource = expectedSource
    this.isExplicitlyClosed = false
    if (this.reconnectTimeoutId) clearTimeout(this.reconnectTimeoutId)
    this.reconnectTimeoutId = null
    this.snapshotSession = null
    this.cleanupSocket()
    this.notifyStatus(false)

    try {
      const socket = new WebSocket(this.url)
      this.ws = socket

      socket.onopen = () => {
        if (socket !== this.ws) return
        this.notifyStatus(true)
      }

      socket.onmessage = (event) => {
        if (socket !== this.ws) return
        if (typeof event.data === 'string') {
          let raw: unknown
          try { raw = JSON.parse(event.data) } catch { return }
          const packet = adaptApplicationPacket(raw)
          if (packet) {
            // Khi ở chế độ REAL:
            // 1. Tuyệt đối không cho phép các gói tin Telemetry/Target giả tạo từ MOCK đi vào state
            if (this.expectedSource === 'REAL') {
              if (packet.original_source_mode === 'MOCK' && (packet.event_type === 'TELEMETRY_UPDATE' || packet.event_type === 'TARGET_UPDATE')) {
                return
              }
              if (packet.event_type === 'SNAPSHOT' && packet.original_source_mode !== 'REAL') {
                packet.telemetry = {
                  battery_pct: null,
                  lidar_range_cm: null,
                  gps_valid: false,
                  lidar_valid: false,
                  imu_valid: false,
                  ai_detected: false,
                  packet_rssi_dbm: null,
                  packet_snr_db: null,
                }
                packet.has_target = false
                packet.target = null
                packet.alerts = []
              }
            }

            const matchesExpected = packet.source_mode === this.expectedSource
            // Khi ở chế độ REAL: kết nối tới backend để nhận tình trạng phần cứng thật.
            // Nếu backend đang chạy MOCK slice hoặc chuyển tiếp ESP32, chuẩn hóa về REAL để Dashboard cập nhật đúng tình trạng.
            const allowRealFromBackend =
              this.expectedSource === 'REAL' && (packet.source_mode === 'REAL' || packet.source_mode === 'MOCK')

            if (matchesExpected || allowRealFromBackend) {
              const adaptedPacket =
                this.expectedSource === 'REAL' && packet.source_mode === 'MOCK'
                  ? { ...packet, source_mode: 'REAL' as const }
                  : packet

              if (adaptedPacket.event_type === 'SNAPSHOT') this.snapshotSession = adaptedPacket.session_id ?? null
              else if (!this.snapshotSession || adaptedPacket.session_id !== this.snapshotSession) return
              for (const listener of this.onPacketListeners) {
                try {
                  listener(adaptedPacket)
                } catch (err) {
                  console.error('[TelemetryClient] Lỗi listener packet:', err)
                }
              }
            }
          }
        }
      }

      socket.onerror = (error) => {
        if (socket !== this.ws) return
        console.warn('[TelemetryClient] WebSocket error:', error)
      }

      socket.onclose = () => {
        if (socket !== this.ws) return
        this.snapshotSession = null
        this.notifyStatus(false)
        if (!this.isExplicitlyClosed) {
          this.scheduleReconnect()
        }
      }
    } catch (err) {
      console.warn('[TelemetryClient] Không thể khởi tạo kết nối WebSocket:', err)
      this.notifyStatus(false)
      if (!this.isExplicitlyClosed) {
        this.scheduleReconnect()
      }
    }
  }

  public disconnect(): void {
    this.isExplicitlyClosed = true
    if (this.reconnectTimeoutId) {
      clearTimeout(this.reconnectTimeoutId)
      this.reconnectTimeoutId = null
    }
    this.cleanupSocket()
    this.notifyStatus(false)
  }

  public reconnect(): void {
    this.disconnect()
    this.connect()
  }

  private cleanupSocket(): void {
    if (this.ws) {
      this.ws.onopen = null
      this.ws.onmessage = null
      this.ws.onerror = null
      this.ws.onclose = null
      if (this.ws.readyState === WebSocket.OPEN || this.ws.readyState === WebSocket.CONNECTING) {
        this.ws.close()
      }
      this.ws = null
    }
  }

  private scheduleReconnect(): void {
    if (this.reconnectTimeoutId) return
    this.reconnectTimeoutId = setTimeout(() => {
      this.reconnectTimeoutId = null
      if (!this.isExplicitlyClosed) {
        this.connect()
      }
    }, APP_CONFIG.WS_RECONNECT_INTERVAL_MS)
  }

  private notifyStatus(isConnected: boolean): void {
    for (const listener of this.onStatusListeners) {
      try {
        listener(isConnected)
      } catch (err) {
        console.error('[TelemetryClient] Lỗi listener status:', err)
      }
    }
  }

  // REST API Client
  public static async checkHealth(apiBaseUrl = APP_CONFIG.API_BASE_URL): Promise<{ status: string; uptime_sec?: number } | null> {
    try {
      const res = await fetch(`${apiBaseUrl}/api/health`, { method: 'GET', headers: { Accept: 'application/json' } })
      if (!res.ok) return null
      return await res.json()
    } catch {
      return null
    }
  }

  public static async fetchStateSnapshot(apiBaseUrl = APP_CONFIG.API_BASE_URL): Promise<RawTelemetryPacket | null> {
    try {
      const res = await fetch(`${apiBaseUrl}/api/state/snapshot`, { method: 'GET', headers: { Accept: 'application/json' } })
      if (!res.ok) return null
      const json = await res.json()
      return adaptApplicationPacket(json)
    } catch {
      return null
    }
  }

  public static async fetchSessions(apiBaseUrl = APP_CONFIG.API_BASE_URL): Promise<SessionListResponse | null> {
    try {
      const res = await fetch(`${apiBaseUrl}/api/sessions`, { method: 'GET', headers: { Accept: 'application/json' } })
      if (!res.ok) return null
      return parseSessions(await res.json())
    } catch {
      return null
    }
  }

  private static async replayCommand(
    path: string,
    body?: Record<string, unknown>,
    apiBaseUrl = APP_CONFIG.API_BASE_URL,
  ): Promise<ReplayApiResponse | null> {
    try {
      const res = await fetch(`${apiBaseUrl}${path}`, {
        method: 'POST',
        headers: { Accept: 'application/json', 'Content-Type': 'application/json' },
        ...(body ? { body: JSON.stringify(body) } : {}),
      })
      if (!res.ok) return null
      const data = await res.json() as Record<string, unknown>
      const replay = parseReplayMetadata(data.replay)
      return typeof data.status === 'string' && replay ? { status: data.status, replay } : null
    } catch {
      return null
    }
  }

  public static startReplay(sessionId: string, speed: 0.5 | 1 | 2, apiBaseUrl = APP_CONFIG.API_BASE_URL) {
    return this.replayCommand('/api/replay/start', { session_id: sessionId, speed }, apiBaseUrl)
  }

  public static pauseReplay(apiBaseUrl = APP_CONFIG.API_BASE_URL) {
    return this.replayCommand('/api/replay/pause', undefined, apiBaseUrl)
  }

  public static resumeReplay(apiBaseUrl = APP_CONFIG.API_BASE_URL) {
    return this.replayCommand('/api/replay/resume', undefined, apiBaseUrl)
  }

  public static seekReplay(timestampMs: number, apiBaseUrl = APP_CONFIG.API_BASE_URL) {
    return this.replayCommand('/api/replay/seek', { timestamp_ms: timestampMs }, apiBaseUrl)
  }

  public static setReplaySpeed(speed: 0.5 | 1 | 2, apiBaseUrl = APP_CONFIG.API_BASE_URL) {
    return this.replayCommand('/api/replay/speed', { speed }, apiBaseUrl)
  }

  public static async stopReplay(apiBaseUrl = APP_CONFIG.API_BASE_URL): Promise<boolean> {
    try {
      const res = await fetch(`${apiBaseUrl}/api/replay/stop`, {
        method: 'POST', headers: { Accept: 'application/json', 'Content-Type': 'application/json' },
      })
      if (!res.ok) return false
      const data = await res.json() as Record<string, unknown>
      return data.status === 'replay_stopped' && data.source_mode === 'MOCK' && typeof data.session_id === 'string'
    } catch {
      return false
    }
  }
}

export const telemetryClientInstance = new TelemetryClient()
