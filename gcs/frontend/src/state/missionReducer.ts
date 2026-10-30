import { APP_CONFIG } from '@/config/appConfig'
import type {
  AlertItem,
  AlertLevel,
  AlertSourceCategory,
  BoundingBox,
  EventLogEntry,
  MapViewMode,
  MissionState,
  PositionHistoryPoint,
  RawTelemetryPacket,
  SourceMode,
  TargetHistoryPoint,
  TerrainStatus,
  ViewLayoutMode,
} from '@/types/telemetry'

export const INITIAL_MISSION_STATE: MissionState = {
  schema_version: APP_CONFIG.SCHEMA_VERSION,
  session_id: 'SES-INIT',
  source_mode: 'MOCK',
  original_source_mode: 'MOCK',
  inference_device: 'SIMULATED',
  sender_session_id: null,
  ground_session_id: null,
  sequence_number: null,

  ws_connected: false,
  hardware_link: {
    status: 'UNKNOWN',
    port: null,
    error_message: null,
  },

  last_rx_iso: null,
  last_rx_monotonic_ms: null,
  rx_age_ms: 0,
  is_stale: false,

  telemetry: {
    battery_pct: null,
    lidar_range_cm: null,
    gps_valid: false,
    lidar_valid: false,
    imu_valid: false,
    ai_detected: false,
    packet_rssi_dbm: null,
    packet_snr_db: null,
    roll_deg: null,
    pitch_deg: null,
  },
  telemetry_age_ms: null,

  has_target: false,
  target: null,
  target_history: [],

  camera_position: {
    latitude: null,
    longitude: null,
    altitude_m: null,
    altitude_reference: 'UNKNOWN',
    heading_deg: null,
    is_valid: false,
    last_updated_iso: null,
    age_ms: 0,
  },
  camera_trail: [],

  video: {
    source_type: 'MOCK',
    url: null,
    is_connected: true,
    is_loading: false,
    error_message: null,
    has_overlay: true,
  },
  bounding_boxes: [],

  alerts: [],
  event_logs: [],
  diagnostics: {
    packets_received_total: 0,
    decode_errors_total: 0,
    ingress_drops_total: 0,
    data_loss_latched: false,
    logger_status: 'OK',
  },

  replay: null,

  layout_mode: 'BALANCED',
  map_view_mode: '2D',
  terrain_status: 'NOT_CONFIGURED',
  auto_follow_camera: true,
  show_trails: true,
  max_trail_points: APP_CONFIG.MAX_TRAIL_POINTS,
  show_radar: true,
  sidebar_collapsed: false,
}

export type MissionAction =
  | { type: 'RECEIVE_TELEMETRY'; payload: RawTelemetryPacket }
  | { type: 'SET_WS_CONNECTED'; payload: boolean }
  | { type: 'SET_SOURCE_MODE'; payload: SourceMode }
  | { type: 'SET_LAYOUT_MODE'; payload: ViewLayoutMode }
  | { type: 'SET_MAP_VIEW_MODE'; payload: MapViewMode }
  | { type: 'SET_TERRAIN_STATUS'; payload: TerrainStatus }
  | { type: 'SET_AUTO_FOLLOW'; payload: boolean }
  | { type: 'SET_SHOW_TRAILS'; payload: boolean }
  | { type: 'SET_SHOW_RADAR'; payload: boolean }
  | { type: 'SET_SIDEBAR_COLLAPSED'; payload: boolean }
  | { type: 'TOGGLE_SIDEBAR_COLLAPSED' }
  | { type: 'SET_VIDEO_STATUS'; payload: Partial<MissionState['video']> }
  | { type: 'SET_BOUNDING_BOXES'; payload: BoundingBox[] }
  | { type: 'ACKNOWLEDGE_ALERT'; payload: string }
  | { type: 'DISMISS_ALERT'; payload: string }
  | { type: 'CLEAR_ALERTS' }
  | { type: 'TICK_AGE'; payload: number }
  | { type: 'RESET_SESSION'; payload?: { session_id?: string; source_mode?: SourceMode } }
  | {
      type: 'LOG_EVENT'
      payload: {
        level: AlertLevel
        source: AlertSourceCategory | string
        code: string
        message: string
        details?: string
      }
    }

// Hàm trợ giúp phân loại nguồn, tác động và gợi ý kiểm tra cho Alert
function resolveAlertMetadata(code: string, message: string): {
  source_category: AlertSourceCategory
  impact: string
  remediation: string
} {
  const upper = (code + ' ' + message).toUpperCase()

  if (upper.includes('GNSS') || upper.includes('GPS')) {
    return {
      source_category: 'GPS',
      impact: 'Mất định vị WGS-84 toàn cầu cho camera và mục tiêu.',
      remediation: 'Kiểm tra ăng-ten GPS, góc nhìn bầu trời hoặc vị trí che chắn.',
    }
  }
  if (upper.includes('VIDEO') || upper.includes('STREAM') || upper.includes('FRAME')) {
    return {
      source_category: 'VIDEO',
      impact: 'Không thể quan sát hình ảnh thời gian thực từ camera.',
      remediation: 'Kiểm tra đường truyền RTSP/WebRTC hoặc cáp camera MIPI/CSI.',
    }
  }
  if (upper.includes('STALE') || upper.includes('LINK') || upper.includes('RSSI') || upper.includes('TIMEOUT')) {
    return {
      source_category: 'TELEMETRY',
      impact: 'Độ trễ cao hoặc mất liên lạc telemetry với tải nhiệm vụ.',
      remediation: 'Kiểm tra khoảng cách LoRa/RF, hướng ăng-ten và nguồn cấp thiết bị phát.',
    }
  }
  if (upper.includes('BATTERY') || upper.includes('LIDAR') || upper.includes('IMU') || upper.includes('PIN')) {
    return {
      source_category: 'SENSORS',
      impact: 'Cảm biến cận đất, góc nghiêng hoặc trạng thái nguồn tải báo bất thường.',
      remediation: 'Kiểm tra bề mặt phản xạ siêu âm, cảm biến IMU và nguồn cấp tải.',
    }
  }
  if (upper.includes('LOGGER') || upper.includes('STORAGE') || upper.includes('SD')) {
    return {
      source_category: 'STORAGE',
      impact: 'Dữ liệu nhiệm vụ có thể không được ghi đầy đủ vào thẻ nhớ.',
      remediation: 'Kiểm tra thẻ MicroSD, định dạng tập tin hoặc dung lượng trống.',
    }
  }

  return {
    source_category: 'SYSTEM',
    impact: 'Lỗi phát sinh trong hệ thống xử lý nội bộ.',
    remediation: 'Kiểm tra trạng thái backend và log chẩn đoán.',
  }
}

function resetSourceData(
  state: MissionState,
  sourceMode: SourceMode,
  sessionId: string
): MissionState {
  return {
    ...INITIAL_MISSION_STATE,
    session_id: sessionId,
    source_mode: sourceMode,
    original_source_mode: 'UNKNOWN',
    inference_device: 'UNKNOWN',
    ws_connected: false,
    is_stale: true,
    video: {
      ...INITIAL_MISSION_STATE.video,
      source_type: 'NONE',
      is_connected: false,
      has_overlay: false,
    },
    layout_mode: state.layout_mode,
    map_view_mode: state.map_view_mode,
    terrain_status: state.terrain_status,
    auto_follow_camera: state.auto_follow_camera,
    show_trails: state.show_trails,
    max_trail_points: state.max_trail_points,
    show_radar: state.show_radar,
    sidebar_collapsed: state.sidebar_collapsed,
  }
}

const EMPTY_TARGET: NonNullable<MissionState['target']> = {
  track_id: null,
  class_id: 0,
  class_name: 'unknown',
  confidence: null,
  target_confirmed: false,
  pos_valid: false,
  coordinate_frame: 'NONE',
  local_x_cm: null,
  local_y_cm: null,
  latitude: null,
  longitude: null,
  origin_id: null,
  age_ms: 0,
}

function normalizeTarget(target: NonNullable<MissionState['target']>): NonNullable<MissionState['target']> {
  if (!target.pos_valid || target.coordinate_frame === 'NONE') {
    return {
      ...target,
      local_x_cm: null,
      local_y_cm: null,
      latitude: null,
      longitude: null,
    }
  }
  if (target.coordinate_frame === 'LOCAL_GRID') {
    return { ...target, latitude: null, longitude: null }
  }
  return { ...target, origin_id: null }
}

export function missionReducer(state: MissionState, action: MissionAction): MissionState {
  switch (action.type) {
    case 'SET_WS_CONNECTED':
      return {
        ...state,
        ws_connected: action.payload,
        is_stale: !action.payload || state.rx_age_ms > APP_CONFIG.STALE_THRESHOLD_MS,
      }

    case 'SET_SIDEBAR_COLLAPSED':
      return { ...state, sidebar_collapsed: action.payload }

    case 'TOGGLE_SIDEBAR_COLLAPSED':
      return { ...state, sidebar_collapsed: !state.sidebar_collapsed }

    case 'SET_SOURCE_MODE': {
      if (state.source_mode === action.payload) return state
      const timestampIso = new Date().toISOString()
      const sessionId = `SES-${action.payload}-${Date.now().toString().slice(-6)}`
      const newEventLog: EventLogEntry = {
        id: `ev-src-${Date.now()}`,
        timestamp_iso: timestampIso,
        level: 'INFO',
        source: 'SYSTEM',
        code: 'SOURCE_CHANGED',
        message: `Chuyển nguồn hoạt động sang [${action.payload}]. Đang chờ snapshot nguồn mới.`,
        session_id: sessionId,
      }

      return {
        ...resetSourceData(state, action.payload, sessionId),
        event_logs: [newEventLog],
      }
    }

    case 'SET_LAYOUT_MODE':
      return { ...state, layout_mode: action.payload }

    case 'SET_MAP_VIEW_MODE':
      return { ...state, map_view_mode: action.payload }

    case 'SET_TERRAIN_STATUS':
      return { ...state, terrain_status: action.payload }

    case 'SET_AUTO_FOLLOW':
      return { ...state, auto_follow_camera: action.payload }

    case 'SET_SHOW_TRAILS':
      return { ...state, show_trails: action.payload }

    case 'SET_SHOW_RADAR':
      return { ...state, show_radar: action.payload }

    case 'SET_VIDEO_STATUS':
      return {
        ...state,
        video: { ...state.video, ...action.payload },
      }

    case 'SET_BOUNDING_BOXES':
      return { ...state, bounding_boxes: action.payload }

    case 'ACKNOWLEDGE_ALERT':
      // Đánh dấu người vận hành đã tiếp nhận, nhưng TUYỆT ĐỐI không xóa lỗi khỏi danh sách active
      return {
        ...state,
        alerts: state.alerts.map((a) =>
          a.id === action.payload
            ? { ...a, acknowledged: true, acknowledged_at_iso: new Date().toISOString() }
            : a
        ),
      }

    case 'DISMISS_ALERT':
      return {
        ...state,
        alerts: state.alerts.map((a) => (a.id === action.payload ? { ...a, active: false } : a)),
      }

    case 'CLEAR_ALERTS':
      return { ...state, alerts: [] }

    case 'TICK_AGE': {
      // Replay ages are derived from the backend virtual clock. Browser wall time,
      // including a long pause, must never age replay data.
      if (state.source_mode === 'REPLAY') return state
      const delta = Number.isFinite(action.payload) ? Math.max(0, Math.round(action.payload)) : 0
      const newAge = Math.round(state.rx_age_ms + delta)
      const isStale = !state.ws_connected || newAge > APP_CONFIG.STALE_THRESHOLD_MS
      return {
        ...state,
        rx_age_ms: newAge,
        is_stale: isStale,
        telemetry_age_ms:
          state.telemetry_age_ms === null ? null : state.telemetry_age_ms + delta,
        target: state.target
          ? { ...state.target, age_ms: (state.target.age_ms ?? 0) + delta }
          : null,
        camera_position: {
          ...state.camera_position,
          age_ms:
            state.camera_position.last_updated_iso || state.camera_position.is_valid
              ? state.camera_position.age_ms + delta
              : state.camera_position.age_ms,
        },
      }
    }

    case 'RESET_SESSION': {
      const newSessionId = action.payload?.session_id || `SES-${Date.now()}`
      const newSourceMode = action.payload?.source_mode || state.source_mode
      return resetSourceData(state, newSourceMode, newSessionId)
    }

    case 'RECEIVE_TELEMETRY': {
      const p = action.payload

      // Source được operator chọn. Packet không có quyền đổi nguồn hoặc kích hoạt MOCK cục bộ.
      if (p.source_mode !== undefined && p.source_mode !== state.source_mode) return state

      const eventType = p.event_type
      const isLegacyInternalPacket = eventType === undefined
      const isSnapshot = eventType === 'SNAPSHOT'
      const sessionChanged = p.session_id !== undefined && p.session_id !== state.session_id
      const resetForPacket = isSnapshot || sessionChanged

      const baseState = resetForPacket
        ? {
            ...resetSourceData(state, state.source_mode, p.session_id ?? state.session_id),
            ws_connected: state.ws_connected,
            is_stale: !state.ws_connected,
          }
        : state

      const updatesTelemetry =
        isLegacyInternalPacket || isSnapshot || eventType === 'TELEMETRY_UPDATE'
      const updatesTarget =
        isLegacyInternalPacket || isSnapshot || eventType === 'TARGET_UPDATE'
      const updatesLink = isLegacyInternalPacket || isSnapshot || eventType === 'LINK_STATUS'
      const updatesAlert = isLegacyInternalPacket || isSnapshot || eventType === 'ALERT_EVENT'
      const updatesDiagnostics =
        isLegacyInternalPacket || isSnapshot || eventType === 'SYSTEM_DIAGNOSTICS'
      const updatesReplay = isLegacyInternalPacket || isSnapshot || eventType === 'REPLAY_TICK'
      const historyTimestamp =
        state.source_mode === 'REPLAY' && p.pc_rx_monotonic_ms !== undefined
          ? p.pc_rx_monotonic_ms
          : Date.now()

      let telemetry = baseState.telemetry
      let telemetryAge = baseState.telemetry_age_ms
      if (updatesTelemetry && p.telemetry !== undefined) {
        if (p.telemetry === null) {
          telemetry = INITIAL_MISSION_STATE.telemetry
          telemetryAge = null
        } else {
          telemetry = { ...baseState.telemetry, ...p.telemetry }
          if (!telemetry.lidar_valid) telemetry = { ...telemetry, lidar_range_cm: null }
          telemetryAge = 0
        }
      }

      let target = baseState.target
      let hasTarget = baseState.has_target
      let targetHistory = baseState.target_history
      if (updatesTarget) {
        if (p.target === null || p.has_target === false) {
          target = null
          hasTarget = false
        } else if (p.target !== undefined) {
          target = normalizeTarget({
            ...(baseState.target ?? EMPTY_TARGET),
            ...p.target,
            age_ms: 0,
          })
          hasTarget = p.has_target ?? true
        } else if (p.has_target === true) {
          hasTarget = target !== null
        }

        if (p.target !== undefined && target?.pos_valid) {
          const coordX = target.coordinate_frame === 'LOCAL_GRID' ? target.local_x_cm : target.latitude
          const coordY = target.coordinate_frame === 'LOCAL_GRID' ? target.local_y_cm : target.longitude
          if (coordX !== null && coordY !== null) {
            const point: TargetHistoryPoint = {
              x: coordX,
              y: coordY,
              coordinate_frame: target.coordinate_frame,
              timestamp_ms: historyTimestamp,
              track_id: target.track_id,
            }
            // Giữ lịch sử theo từng track: track khác không bị track mới đè khỏi cửa sổ.
            const sameTrack = baseState.target_history.filter((h) => h.track_id === point.track_id)
            const otherTracks = baseState.target_history.filter((h) => h.track_id !== point.track_id)
            const perTrackCap = Math.max(
              1,
              Math.floor(APP_CONFIG.MAX_TARGET_HISTORY / 2)
            )
            targetHistory = [...otherTracks, ...sameTrack, point].slice(
              -APP_CONFIG.MAX_TARGET_HISTORY
            )
            if (sameTrack.length >= perTrackCap) {
              // Cắt bớt điểm cũ nhất của chính track này, giữ nguyên track khác.
              const trimmed = [...sameTrack, point].slice(-perTrackCap)
              targetHistory = [...otherTracks, ...trimmed].slice(-APP_CONFIG.MAX_TARGET_HISTORY)
            }
          }
        }
      }

      let cameraPosition = baseState.camera_position
      let cameraTrail = baseState.camera_trail
      if (updatesTelemetry && p.camera_position !== undefined) {
        if (p.camera_position === null) {
          cameraPosition = INITIAL_MISSION_STATE.camera_position
          cameraTrail = []
        } else {
          const merged = { ...baseState.camera_position, ...p.camera_position }
          const isValid = Boolean(
            merged.is_valid && merged.latitude !== null && merged.longitude !== null
          )
          cameraPosition = {
            ...merged,
            is_valid: isValid,
            last_updated_iso: isValid
              ? p.pc_rx_time_iso ?? new Date().toISOString()
              : baseState.camera_position.last_updated_iso,
            age_ms: isValid ? 0 : baseState.camera_position.age_ms,
          }

          if (isValid && cameraPosition.latitude !== null && cameraPosition.longitude !== null) {
            const point: PositionHistoryPoint = {
              latitude: cameraPosition.latitude,
              longitude: cameraPosition.longitude,
              timestamp_ms: historyTimestamp,
              is_valid: true,
            }
            cameraTrail = [...baseState.camera_trail, point].slice(-baseState.max_trail_points)
          }
        }
      }

      let hardwareLink = baseState.hardware_link
      if (updatesLink && p.hardware_link !== undefined) {
        hardwareLink = p.hardware_link === null
          ? INITIAL_MISSION_STATE.hardware_link
          : { ...baseState.hardware_link, ...p.hardware_link }
      }

      let diagnostics = baseState.diagnostics
      if (updatesDiagnostics && p.diagnostics !== undefined) {
        diagnostics = p.diagnostics === null
          ? INITIAL_MISSION_STATE.diagnostics
          : { ...baseState.diagnostics, ...p.diagnostics }
      }

      let boundingBoxes = baseState.bounding_boxes
      if ((updatesTelemetry || updatesTarget) && p.bounding_boxes !== undefined) {
        boundingBoxes = p.bounding_boxes ?? []
      }

      let alerts = baseState.alerts
      let eventLogs = baseState.event_logs
      if (updatesAlert && p.alert) {
        const timestampIso = p.pc_rx_time_iso ?? new Date().toISOString()
        const meta = resolveAlertMetadata(p.alert.code, p.alert.message)
        const eventEntry: EventLogEntry = {
          id: `ev-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
          timestamp_iso: timestampIso,
          level: p.alert.level,
          source: meta.source_category,
          code: p.alert.code,
          message: p.alert.message,
          session_id: p.session_id ?? baseState.session_id,
        }
        eventLogs = [eventEntry, ...baseState.event_logs].slice(0, APP_CONFIG.MAX_EVENT_LOGS)

        const existingIndex = baseState.alerts.findIndex((alert) => alert.code === p.alert?.code)
        const conditionStatus = p.alert.condition_status ?? 'ACTIVE'

        if (conditionStatus === 'RESOLVED') {
          if (existingIndex >= 0) {
            const existing = baseState.alerts[existingIndex]
            const resolved: AlertItem = {
              ...existing,
              level: p.alert.level,
              message: p.alert.message,
              timestamp_iso: timestampIso,
              active: false,
              condition_status: 'RESOLVED',
              last_seen_iso: timestampIso,
              source_category: meta.source_category,
              impact: meta.impact,
              remediation: meta.remediation,
            }
            alerts = [resolved, ...baseState.alerts.filter((_, index) => index !== existingIndex)]
          }
        } else if (p.alert.level === 'WARN' || p.alert.level === 'CRITICAL') {
          if (existingIndex >= 0) {
            const existing = baseState.alerts[existingIndex]
            const needsNewAcknowledgement =
              existing.condition_status === 'RESOLVED' ||
              existing.level !== p.alert.level ||
              existing.message !== p.alert.message
            const updated: AlertItem = {
              ...existing,
              level: p.alert.level,
              message: p.alert.message,
              timestamp_iso: timestampIso,
              active: true,
              condition_status: 'ACTIVE',
              acknowledged: needsNewAcknowledgement ? false : existing.acknowledged,
              acknowledged_at_iso: needsNewAcknowledgement ? null : existing.acknowledged_at_iso,
              source_category: meta.source_category,
              occurrence_count: existing.occurrence_count + 1,
              last_seen_iso: timestampIso,
              impact: meta.impact,
              remediation: meta.remediation,
            }
            alerts = [updated, ...baseState.alerts.filter((_, index) => index !== existingIndex)]
          } else {
            const newAlert: AlertItem = {
              id: `alert-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
              level: p.alert.level,
              code: p.alert.code,
              message: p.alert.message,
              timestamp_iso: timestampIso,
              active: true,
              condition_status: 'ACTIVE',
              acknowledged: false,
              acknowledged_at_iso: null,
              source_category: meta.source_category,
              occurrence_count: 1,
              first_seen_iso: timestampIso,
              last_seen_iso: timestampIso,
              impact: meta.impact,
              remediation: meta.remediation,
            }
            alerts = [newAlert, ...baseState.alerts].slice(0, APP_CONFIG.MAX_ALERTS_HISTORY)
          }
        }
      }

      let replay = baseState.replay
      if (updatesReplay && p.replay_metadata !== undefined) {
        replay = p.replay_metadata === null
          ? null
          : ({ ...baseState.replay, ...p.replay_metadata } as MissionState['replay'])
      }

      const hasRxAge = p.rx_age_ms !== undefined
      const rxAge = hasRxAge ? Math.max(0, p.rx_age_ms ?? 0) : baseState.rx_age_ms
      const staleFromPacket = p.is_stale ?? (hasRxAge ? rxAge > APP_CONFIG.STALE_THRESHOLD_MS : baseState.is_stale)

      return {
        ...baseState,
        schema_version: p.schema_version ?? baseState.schema_version,
        session_id: p.session_id ?? baseState.session_id,
        original_source_mode: p.original_source_mode ?? baseState.original_source_mode,
        inference_device: p.inference_device ?? baseState.inference_device,
        sender_session_id: p.sender_session_id !== undefined ? p.sender_session_id : baseState.sender_session_id,
        ground_session_id: p.ground_session_id !== undefined ? p.ground_session_id : baseState.ground_session_id,
        sequence_number: p.sequence_number !== undefined ? p.sequence_number : baseState.sequence_number,
        last_rx_iso: p.pc_rx_time_iso ?? baseState.last_rx_iso,
        last_rx_monotonic_ms:
          p.pc_rx_monotonic_ms !== undefined ? p.pc_rx_monotonic_ms : baseState.last_rx_monotonic_ms,
        rx_age_ms: rxAge,
        is_stale: !baseState.ws_connected || staleFromPacket || rxAge > APP_CONFIG.STALE_THRESHOLD_MS,
        telemetry,
        telemetry_age_ms: telemetryAge,
        has_target: hasTarget,
        target,
        target_history: targetHistory,
        camera_position: cameraPosition,
        camera_trail: cameraTrail,
        hardware_link: hardwareLink,
        bounding_boxes: boundingBoxes,
        diagnostics,
        alerts,
        event_logs: eventLogs,
        replay,
      }
    }

    case 'LOG_EVENT': {
      const newEntry: EventLogEntry = {
        id: `log-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`,
        timestamp_iso: new Date().toISOString(),
        level: action.payload.level,
        source: action.payload.source,
        code: action.payload.code,
        message: action.payload.message,
        session_id: state.session_id,
        details: action.payload.details,
      }
      return {
        ...state,
        event_logs: [newEntry, ...state.event_logs].slice(0, APP_CONFIG.MAX_EVENT_LOGS),
      }
    }

    default:
      return state
  }
}
