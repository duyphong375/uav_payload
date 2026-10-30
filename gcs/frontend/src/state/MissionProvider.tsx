import React, { createContext, useContext, useEffect, useReducer, useRef, useState } from 'react'
import { APP_CONFIG } from '@/config/appConfig'
import { MOCK_SCENARIOS } from '@/mocks/scenarios'
import { mockSourceInstance } from '@/mocks/mockSource'
import { telemetryClientInstance, type ApplicationPacket } from '@/services/telemetryClient'
import { INITIAL_MISSION_STATE, missionReducer, type MissionAction } from './missionReducer'
import type { MissionState, SourceMode } from '@/types/telemetry'

export interface MissionContextValue {
  state: MissionState
  dispatch: React.Dispatch<MissionAction>
  selectedScenarioId: string
  setSelectedScenarioId: (id: string) => void
  switchSourceMode: (mode: SourceMode) => void
  reconnect: () => void
  wsUrl: string
  setWsUrl: (url: string) => { ok: boolean; error?: string }
}

export const MissionContext = createContext<MissionContextValue | null>(null)

function monotonicNow(): number {
  return typeof performance !== 'undefined' ? performance.now() : Date.now()
}

/** Transport integration keeps snapshot ages/alert history without changing the mission reducer ABI. */
function transportReducer(state: MissionState, action: MissionAction): MissionState {
  let next = missionReducer(state, action)
  if (action.type === 'RECEIVE_TELEMETRY' && next !== state) {
    const packet = action.payload as ApplicationPacket
    if (packet.event_type === 'SNAPSHOT' && packet.alerts) {
      for (const alert of packet.alerts) {
        next = missionReducer(next, {
          type: 'RECEIVE_TELEMETRY', payload: {
            event_type: 'ALERT_EVENT', source_mode: packet.source_mode,
            session_id: packet.session_id, pc_rx_time_iso: alert.timestamp_iso, alert,
          },
        })
      }
    } else if (packet.event_type === 'ALERT_EVENT' && packet.alert === null) {
      next = { ...next, alerts: [] }
    }
    if (packet.telemetry_age_ms !== undefined) next.telemetry_age_ms = packet.telemetry_age_ms
    if (packet.target_age_ms !== undefined && next.target) {
      next.target = { ...next.target, age_ms: packet.target_age_ms ?? undefined }
    }
    if (packet.camera_age_ms !== undefined) {
      next.camera_position = { ...next.camera_position, age_ms: packet.camera_age_ms ?? 0 }
    }
  }
  if (next.source_mode === 'MOCK') {
    if (APP_CONFIG.MOCK_TRANSPORT === 'LOCAL') {
      next = { ...next, ws_connected: false,
        diagnostics: { ...next.diagnostics, logger_status: 'LOG_DEGRADED' },
        is_stale: next.rx_age_ms > APP_CONFIG.STALE_THRESHOLD_MS ||
          (action.type === 'RECEIVE_TELEMETRY' ? action.payload.is_stale === true : state.is_stale),
      }
    }
  }
  return next
}

export const MissionProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const initialMode: SourceMode =
    (typeof window !== 'undefined' && (localStorage.getItem('kvc_source_mode') as SourceMode)) ||
    (APP_CONFIG.DEFAULT_SOURCE_MODE as SourceMode) ||
    'MOCK'

  const [state, dispatch] = useReducer(transportReducer, {
    ...INITIAL_MISSION_STATE,
    source_mode: initialMode,
    original_source_mode: initialMode === 'MOCK' ? 'MOCK' : 'REAL',
    diagnostics: { ...INITIAL_MISSION_STATE.diagnostics, logger_status: 'LOG_DEGRADED' },
  })
  const lastAgeTickRef = useRef(monotonicNow())
  const [selectedScenarioId, setSelectedScenarioIdState] = useState<string>(() => {
    return localStorage.getItem(APP_CONFIG.STORAGE_KEYS.MOCK_SCENARIO) || 'NORMAL_GPS_TARGET'
  })

  const [wsUrl, setWsUrlState] = useState<string>(() => {
    if (typeof window === 'undefined') return APP_CONFIG.WS_URL
    return localStorage.getItem(APP_CONFIG.STORAGE_KEYS.WS_URL) || APP_CONFIG.WS_URL
  })

  // Áp URL đã lưu trước khi luồng dữ liệu connect.
  useEffect(() => {
    telemetryClientInstance.setUrl(wsUrl)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const setWsUrl = (url: string): { ok: boolean; error?: string } => {
    const trimmed = url.trim()
    if (!trimmed) return { ok: false, error: 'Địa chỉ WebSocket không được để trống.' }
    let parsed: URL
    try {
      parsed = new URL(trimmed)
    } catch {
      return { ok: false, error: 'Địa chỉ WebSocket không hợp lệ (không phân tích được URL).' }
    }
    if (parsed.protocol !== 'ws:' && parsed.protocol !== 'wss:') {
      return { ok: false, error: 'Địa chỉ phải bắt đầu bằng ws:// hoặc wss://.' }
    }
    telemetryClientInstance.setUrl(trimmed)
    localStorage.setItem(APP_CONFIG.STORAGE_KEYS.WS_URL, trimmed)
    setWsUrlState(trimmed)
    return { ok: true }
  }

  // Đổi kịch bản MOCK
  const setSelectedScenarioId = (id: string) => {
    if (!MOCK_SCENARIOS.some((s) => s.id === id)) {
      console.warn(`[MissionProvider] Bỏ qua scenario không tồn tại: ${id}`)
      return
    }
    setSelectedScenarioIdState(id)
    localStorage.setItem(APP_CONFIG.STORAGE_KEYS.MOCK_SCENARIO, id)
    mockSourceInstance.setScenario(id)
  }

  // Chuyển chế độ nguồn
  const switchSourceMode = (mode: SourceMode) => {
    if (typeof window !== 'undefined') {
      localStorage.setItem('kvc_source_mode', mode)
    }
    dispatch({ type: 'SET_SOURCE_MODE', payload: mode })
  }

  // Tái kết nối thủ công
  const reconnect = () => {
    if (state.source_mode === 'REPLAY' || state.source_mode === 'REAL' || (state.source_mode === 'MOCK' && APP_CONFIG.MOCK_TRANSPORT === 'BACKEND')) {
      telemetryClientInstance.reconnect()
    } else {
      mockSourceInstance.setScenario(selectedScenarioId)
    }
  }

  // Hiệu ứng quản lý luồng dữ liệu theo source_mode
  useEffect(() => {
    if (state.source_mode === 'MOCK' && APP_CONFIG.MOCK_TRANSPORT === 'LOCAL') {
      telemetryClientInstance.disconnect()

      // Đăng ký nhận packet từ mock source
      const unsubscribe = mockSourceInstance.subscribe((packet) => {
        // Provenance do channel đang chạy quyết định; scenario không được giả mạo nguồn hoạt động.
        dispatch({ type: 'RECEIVE_TELEMETRY', payload: { ...packet, source_mode: 'MOCK' } })
      })

      // Đặt kịch bản hiện tại và khởi động
      mockSourceInstance.setScenario(selectedScenarioId)
      mockSourceInstance.start(1000)

      dispatch({ type: 'SET_WS_CONNECTED', payload: false })

      return () => {
        unsubscribe()
        mockSourceInstance.stop()
      }
    } else if (state.source_mode === 'REPLAY' || state.source_mode === 'REAL' || (state.source_mode === 'MOCK' && APP_CONFIG.MOCK_TRANSPORT === 'BACKEND')) {
      mockSourceInstance.stop()

      // Đăng ký nhận packet từ WebSocket thật
      const unsubsPacket = telemetryClientInstance.onPacket((packet) => {
        dispatch({ type: 'RECEIVE_TELEMETRY', payload: packet })
      })

      const unsubsStatus = telemetryClientInstance.onStatusChange((isConnected) => {
        dispatch({ type: 'SET_WS_CONNECTED', payload: isConnected })
      })

      telemetryClientInstance.connect(state.source_mode)

      return () => {
        unsubsPacket()
        unsubsStatus()
        telemetryClientInstance.disconnect()
      }
    }
    mockSourceInstance.stop()
    telemetryClientInstance.disconnect()
  }, [state.source_mode, selectedScenarioId])

  // Dùng elapsed monotonic thực; callback bị browser throttle không được làm tuổi dữ liệu thấp giả.
  useEffect(() => {
    if (state.source_mode === 'REPLAY') return
    lastAgeTickRef.current = monotonicNow()
    const timer = setInterval(() => {
      const now = monotonicNow()
      const elapsedMs = Math.max(0, Math.round(now - lastAgeTickRef.current))
      lastAgeTickRef.current = now
      dispatch({ type: 'TICK_AGE', payload: elapsedMs })
    }, APP_CONFIG.HEARTBEAT_INTERVAL_MS)

    return () => clearInterval(timer)
  }, [state.source_mode])

  return (
    <MissionContext.Provider
      value={{
        state,
        dispatch,
        selectedScenarioId,
        setSelectedScenarioId,
        switchSourceMode,
        reconnect,
        wsUrl,
        setWsUrl,
      }}
    >
      {children}
    </MissionContext.Provider>
  )
}

export function useMission(): MissionContextValue {
  const ctx = useContext(MissionContext)
  if (!ctx) {
    throw new Error('useMission phải được sử dụng bên trong MissionProvider')
  }
  return ctx
}
