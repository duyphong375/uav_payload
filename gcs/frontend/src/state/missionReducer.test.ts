import { describe, expect, it } from 'vitest'
import { INITIAL_MISSION_STATE, missionReducer } from './missionReducer'
import type { MissionState, RawTelemetryPacket, TargetInfo } from '@/types/telemetry'

const wgsTarget = (overrides: Partial<TargetInfo> = {}): TargetInfo => ({
  track_id: 101,
  class_id: 1,
  class_name: 'person',
  confidence: 90,
  target_confirmed: true,
  pos_valid: true,
  coordinate_frame: 'WGS84',
  local_x_cm: null,
  local_y_cm: null,
  latitude: 0,
  longitude: 0,
  origin_id: null,
  age_ms: 0,
  ...overrides,
})
const receive = (state: MissionState, payload: RawTelemetryPacket): MissionState =>
  missionReducer(state, { type: 'RECEIVE_TELEMETRY', payload })

describe('missionReducer - Quản lý trạng thái Mission GCS', () => {
  it('khởi tạo state ban đầu đúng chuẩn MOCK và chưa kết nối', () => {
    expect(INITIAL_MISSION_STATE.source_mode).toBe('MOCK')
    expect(INITIAL_MISSION_STATE.ws_connected).toBe(false)
    expect(INITIAL_MISSION_STATE.camera_position.is_valid).toBe(false)
    expect(INITIAL_MISSION_STATE.has_target).toBe(false)
    expect(INITIAL_MISSION_STATE.alerts).toHaveLength(0)
    expect(INITIAL_MISSION_STATE.event_logs).toHaveLength(0)
  })

  it('xóa vệt và mục tiêu khi đổi nguồn hoạt động sang REAL hoặc MOCK và ghi vào event_logs (không tăng alerts)', () => {
    const stateWithTarget = {
      ...INITIAL_MISSION_STATE,
      has_target: true,
      camera_trail: [{ latitude: 16.0, longitude: 108.0, timestamp_ms: 100, is_valid: true }],
      target_history: [{ x: 10, y: 20, coordinate_frame: 'LOCAL_GRID' as const, timestamp_ms: 100, track_id: 1 }],
    }

    const nextState = missionReducer(stateWithTarget, {
      type: 'SET_SOURCE_MODE',
      payload: 'REAL',
    })

    expect(nextState.source_mode).toBe('REAL')
    expect(nextState.has_target).toBe(false)
    expect(nextState.target).toBeNull()
    expect(nextState.camera_trail).toHaveLength(0)
    expect(nextState.target_history).toHaveLength(0)
    expect(nextState.camera_position.is_valid).toBe(false)
    expect(nextState.telemetry.battery_pct).toBeNull()
    expect(nextState.telemetry_age_ms).toBeNull()
    expect(nextState.hardware_link.status).toBe('UNKNOWN')
    expect(nextState.inference_device).toBe('UNKNOWN')
    expect(nextState.video.source_type).toBe('NONE')
    expect(nextState.ws_connected).toBe(false)
    // SOURCE_CHANGED là sự kiện INFO, chỉ ghi vào event_logs, không tăng active alerts
    expect(nextState.event_logs.some((e) => e.code === 'SOURCE_CHANGED')).toBe(true)
    expect(nextState.alerts).toHaveLength(0)
  })

  it('tăng rx_age_ms khi nhận action TICK_AGE và tự động kích hoạt is_stale khi > 3000ms', () => {
    const connectedState = {
      ...INITIAL_MISSION_STATE,
      ws_connected: true,
    }
    const s1 = missionReducer(connectedState, {
      type: 'TICK_AGE',
      payload: 3000,
    })
    expect(s1.rx_age_ms).toBe(3000)
    expect(s1.is_stale).toBe(false)

    const s2 = missionReducer(s1, {
      type: 'TICK_AGE',
      payload: 1,
    })
    expect(s2.rx_age_ms).toBe(3001)
    expect(s2.is_stale).toBe(true)
  })

  it('dùng elapsed thực 10s và giữ stale sau disconnect dù age còn dưới ngưỡng', () => {
    const active: MissionState = {
      ...INITIAL_MISSION_STATE,
      source_mode: 'REAL',
      ws_connected: true,
      telemetry_age_ms: 0,
      target: wgsTarget(),
      has_target: true,
      camera_position: {
        ...INITIAL_MISSION_STATE.camera_position,
        latitude: 0,
        longitude: 0,
        is_valid: true,
        last_updated_iso: '2026-10-13T00:00:00.000Z',
      },
    }

    const delayed = missionReducer(active, { type: 'TICK_AGE', payload: 10_000 })
    expect(delayed.rx_age_ms).toBe(10_000)
    expect(delayed.telemetry_age_ms).toBe(10_000)
    expect(delayed.target?.age_ms).toBe(10_000)
    expect(delayed.camera_position.age_ms).toBe(10_000)

    const disconnected = missionReducer({ ...active, rx_age_ms: 0 }, {
      type: 'SET_WS_CONNECTED',
      payload: false,
    })
    const afterTick = missionReducer(disconnected, { type: 'TICK_AGE', payload: 100 })
    expect(afterTick.is_stale).toBe(true)
  })

  it('giữ source REAL khi nhận packet MOCK và không nhập dữ liệu mẫu', () => {
    const realState = missionReducer(INITIAL_MISSION_STATE, {
      type: 'SET_SOURCE_MODE',
      payload: 'REAL',
    })
    const afterMockPacket = receive(realState, {
      event_type: 'SNAPSHOT',
      source_mode: 'MOCK',
      session_id: 'SES-MOCK-FOREIGN',
      telemetry: { battery_pct: 99 },
      camera_position: { latitude: 15.9, longitude: 108.1, is_valid: true },
    })

    expect(afterMockPacket).toBe(realState)
    expect(afterMockPacket.source_mode).toBe('REAL')
    expect(afterMockPacket.telemetry.battery_pct).toBeNull()
    expect(afterMockPacket.camera_position.is_valid).toBe(false)
  })

  it('SNAPSHOT rồi LINK_STATUS/ALERT_EVENT/TARGET_UPDATE chỉ sửa đúng domain', () => {
    let state = missionReducer(INITIAL_MISSION_STATE, { type: 'SET_SOURCE_MODE', payload: 'REAL' })
    state = missionReducer(state, { type: 'SET_WS_CONNECTED', payload: true })
    state = receive(state, {
      event_type: 'SNAPSHOT',
      source_mode: 'REAL',
      session_id: 'SES-REAL-1',
      rx_age_ms: 50,
      telemetry: {
        battery_pct: 76,
        gps_valid: true,
        lidar_valid: true,
        lidar_range_cm: 220,
      },
      has_target: true,
      target: wgsTarget(),
      camera_position: { latitude: 0, longitude: 0, is_valid: true },
      hardware_link: { status: 'CONNECTED' },
    })

    state = missionReducer(state, { type: 'TICK_AGE', payload: 3500 })
    const targetBeforeLink = state.target
    state = receive(state, {
      event_type: 'LINK_STATUS',
      source_mode: 'REAL',
      session_id: 'SES-REAL-1',
      rx_age_ms: 0,
      is_stale: false,
      hardware_link: { status: 'RECONNECTING' },
    })
    expect(state.telemetry.battery_pct).toBe(76)
    expect(state.target?.track_id).toBe(101)
    expect(state.target?.age_ms).toBe(targetBeforeLink?.age_ms)
    expect(state.hardware_link.status).toBe('RECONNECTING')

    state = receive(state, {
      event_type: 'ALERT_EVENT',
      source_mode: 'REAL',
      session_id: 'SES-REAL-1',
      alert: { level: 'WARN', code: 'LINK_WEAK', message: 'Liên kết yếu' },
    })
    expect(state.telemetry.battery_pct).toBe(76)
    expect(state.target?.track_id).toBe(101)
    expect(state.alerts).toHaveLength(1)

    state = receive(state, {
      event_type: 'TARGET_UPDATE',
      source_mode: 'REAL',
      session_id: 'SES-REAL-1',
      has_target: true,
      target: { track_id: 102, pos_valid: true, coordinate_frame: 'WGS84', latitude: 1, longitude: 2 },
    })
    expect(state.target?.track_id).toBe(102)
    expect(state.target?.latitude).toBe(1)
    expect(state.target?.age_ms).toBe(0)
    expect(state.telemetry.battery_pct).toBe(76)
    expect(state.hardware_link.status).toBe('RECONNECTING')
  })

  it('null clear domain còn field vắng trong patch giữ nguyên', () => {
    const state: MissionState = {
      ...INITIAL_MISSION_STATE,
      source_mode: 'REAL',
      ws_connected: true,
      telemetry: { ...INITIAL_MISSION_STATE.telemetry, battery_pct: 55 },
      telemetry_age_ms: 100,
      target: wgsTarget(),
      has_target: true,
    }
    const absent = receive(state, {
      event_type: 'LINK_STATUS',
      source_mode: 'REAL',
      hardware_link: { status: 'CONNECTED' },
    })
    expect(absent.telemetry.battery_pct).toBe(55)
    expect(absent.target).toEqual(state.target)

    const clearedTarget = receive(absent, {
      event_type: 'TARGET_UPDATE',
      source_mode: 'REAL',
      has_target: false,
      target: null,
    })
    expect(clearedTarget.has_target).toBe(false)
    expect(clearedTarget.target).toBeNull()

    const clearedTelemetry = receive(clearedTarget, {
      event_type: 'TELEMETRY_UPDATE',
      source_mode: 'REAL',
      telemetry: null,
      camera_position: null,
    })
    expect(clearedTelemetry.telemetry.battery_pct).toBeNull()
    expect(clearedTelemetry.telemetry_age_ms).toBeNull()
    expect(clearedTelemetry.camera_position.is_valid).toBe(false)
  })

  it('đổi MOCK có camera/pin sang REAL xóa toàn bộ data source cũ nhưng giữ UI preferences', () => {
    const mockState: MissionState = {
      ...INITIAL_MISSION_STATE,
      layout_mode: 'MAP_PRIORITY',
      map_view_mode: '3D',
      show_trails: false,
      telemetry: { ...INITIAL_MISSION_STATE.telemetry, battery_pct: 88, gps_valid: true },
      telemetry_age_ms: 10,
      target: wgsTarget(),
      has_target: true,
      camera_position: {
        ...INITIAL_MISSION_STATE.camera_position,
        latitude: 15.9,
        longitude: 108.1,
        is_valid: true,
        last_updated_iso: '2026-10-13T00:00:00.000Z',
      },
      inference_device: 'SIMULATED',
      hardware_link: { status: 'CONNECTED' },
    }
    const real = missionReducer(mockState, { type: 'SET_SOURCE_MODE', payload: 'REAL' })

    expect(real.source_mode).toBe('REAL')
    expect(real.telemetry.battery_pct).toBeNull()
    expect(real.telemetry.gps_valid).toBe(false)
    expect(real.target).toBeNull()
    expect(real.camera_position.is_valid).toBe(false)
    expect(real.inference_device).toBe('UNKNOWN')
    expect(real.hardware_link.status).toBe('UNKNOWN')
    expect(real.video.source_type).toBe('NONE')
    expect(real.layout_mode).toBe('MAP_PRIORITY')
    expect(real.map_view_mode).toBe('3D')
    expect(real.show_trails).toBe(false)
  })

  it('session_id mới reset data phiên cũ trước khi áp dụng patch của phiên mới', () => {
    const oldSession: MissionState = {
      ...INITIAL_MISSION_STATE,
      source_mode: 'REAL',
      session_id: 'SES-OLD',
      ws_connected: true,
      telemetry: { ...INITIAL_MISSION_STATE.telemetry, battery_pct: 64, gps_valid: true },
      telemetry_age_ms: 500,
      target: wgsTarget({ age_ms: 500 }),
      has_target: true,
      camera_position: {
        ...INITIAL_MISSION_STATE.camera_position,
        latitude: 15,
        longitude: 108,
        is_valid: true,
        last_updated_iso: '2026-10-13T00:00:00.000Z',
      },
    }

    const newSession = receive(oldSession, {
      event_type: 'LINK_STATUS',
      source_mode: 'REAL',
      session_id: 'SES-NEW',
      hardware_link: { status: 'CONNECTED' },
    })

    expect(newSession.session_id).toBe('SES-NEW')
    expect(newSession.hardware_link.status).toBe('CONNECTED')
    expect(newSession.telemetry.battery_pct).toBeNull()
    expect(newSession.telemetry_age_ms).toBeNull()
    expect(newSession.target).toBeNull()
    expect(newSession.camera_position.is_valid).toBe(false)
  })

  it('giới hạn số lượng điểm vệt camera theo max_trail_points', () => {
    let state = {
      ...INITIAL_MISSION_STATE,
      max_trail_points: 3,
    }

    for (let i = 0; i < 5; i++) {
      state = missionReducer(state, {
        type: 'RECEIVE_TELEMETRY',
        payload: {
          pc_rx_time_iso: new Date().toISOString(),
          camera_position: {
            latitude: 16.0 + i * 0.001,
            longitude: 108.0 + i * 0.001,
            is_valid: true,
          },
        },
      })
    }

    expect(state.camera_trail).toHaveLength(3)
    expect(state.camera_trail[2].latitude).toBeCloseTo(16.0 + 4 * 0.001)
  })

  it('phân biệt Alert WARN/CRITICAL và INFO: INFO chỉ vào event_logs, WARN vào cả alerts và event_logs', () => {
    // 1. Nhận INFO alert
    const stateWithInfo = missionReducer(INITIAL_MISSION_STATE, {
      type: 'RECEIVE_TELEMETRY',
      payload: {
        alert: {
          level: 'INFO',
          code: 'GPS_CONNECTED',
          message: 'Kết nối mô-đun GPS thành công',
        },
      },
    })
    expect(stateWithInfo.event_logs).toHaveLength(1)
    expect(stateWithInfo.event_logs[0].code).toBe('GPS_CONNECTED')
    expect(stateWithInfo.alerts).toHaveLength(0) // Không thêm vào active alerts

    // 2. Nhận WARN alert
    const stateWithWarn = missionReducer(stateWithInfo, {
      type: 'RECEIVE_TELEMETRY',
      payload: {
        alert: {
          level: 'WARN',
          code: 'GNSS_FIX_LOST',
          message: 'Mất khóa tín hiệu vệ tinh GNSS',
        },
      },
    })
    expect(stateWithWarn.event_logs).toHaveLength(2)
    expect(stateWithWarn.alerts).toHaveLength(1)
    expect(stateWithWarn.alerts[0].code).toBe('GNSS_FIX_LOST')
    expect(stateWithWarn.alerts[0].active).toBe(true)
    expect(stateWithWarn.alerts[0].acknowledged).toBe(false)
  })

  it('thao tác ACKNOWLEDGE_ALERT đánh dấu đã tiếp nhận nhưng không xóa cảnh báo đang hoạt động', () => {
    const stateWithAlert = missionReducer(INITIAL_MISSION_STATE, {
      type: 'RECEIVE_TELEMETRY',
      payload: {
        alert: {
          level: 'CRITICAL',
          code: 'COMM_TIMEOUT',
          message: 'Mất liên lạc hoàn toàn với tải nhiệm vụ',
        },
      },
    })

    expect(stateWithAlert.alerts).toHaveLength(1)
    const alertId = stateWithAlert.alerts[0].id

    // Người vận hành bấm Tiếp nhận
    const ackedState = missionReducer(stateWithAlert, {
      type: 'ACKNOWLEDGE_ALERT',
      payload: alertId,
    })

    expect(ackedState.alerts[0].acknowledged).toBe(true)
    expect(ackedState.alerts[0].acknowledged_at_iso).toBeTruthy()
    // Vẫn còn active! Không bị xóa khỏi active alerts
    expect(ackedState.alerts[0].active).toBe(true)
  })

  it('WARN→CRITICAL cùng code cập nhật/dedup; ACK khác RESOLVED và tái phát cần ACK mới', () => {
    let state = receive({ ...INITIAL_MISSION_STATE, source_mode: 'REAL' }, {
      event_type: 'ALERT_EVENT',
      source_mode: 'REAL',
      pc_rx_time_iso: '2026-10-13T01:00:00.000Z',
      alert: { level: 'WARN', code: 'LINK_LOSS', message: 'Tín hiệu yếu' },
    })
    const alertId = state.alerts[0].id
    state = missionReducer(state, { type: 'ACKNOWLEDGE_ALERT', payload: alertId })
    expect(state.alerts[0].active).toBe(true)
    expect(state.alerts[0].condition_status).toBe('ACTIVE')

    state = receive(state, {
      event_type: 'ALERT_EVENT',
      source_mode: 'REAL',
      pc_rx_time_iso: '2026-10-13T01:00:01.000Z',
      alert: { level: 'CRITICAL', code: 'LINK_LOSS', message: 'Mất liên kết hoàn toàn' },
    })
    expect(state.alerts).toHaveLength(1)
    expect(state.alerts[0]).toMatchObject({
      id: alertId,
      level: 'CRITICAL',
      message: 'Mất liên kết hoàn toàn',
      occurrence_count: 2,
      active: true,
      condition_status: 'ACTIVE',
      acknowledged: false,
    })

    state = receive(state, {
      event_type: 'ALERT_EVENT',
      source_mode: 'REAL',
      pc_rx_time_iso: '2026-10-13T01:00:02.000Z',
      alert: {
        level: 'INFO',
        code: 'LINK_LOSS',
        message: 'Liên kết đã phục hồi',
        condition_status: 'RESOLVED',
      },
    })
    expect(state.alerts[0].active).toBe(false)
    expect(state.alerts[0].condition_status).toBe('RESOLVED')

    state = receive(state, {
      event_type: 'ALERT_EVENT',
      source_mode: 'REAL',
      pc_rx_time_iso: '2026-10-13T01:00:03.000Z',
      alert: { level: 'WARN', code: 'LINK_LOSS', message: 'Tín hiệu yếu trở lại' },
    })
    expect(state.alerts).toHaveLength(1)
    expect(state.alerts[0].condition_status).toBe('ACTIVE')
    expect(state.alerts[0].occurrence_count).toBe(3)
    expect(state.alerts[0].acknowledged).toBe(false)
  })

  it('chuyển đổi chế độ bản đồ SET_MAP_VIEW_MODE và trạng thái địa hình SET_TERRAIN_STATUS', () => {
    expect(INITIAL_MISSION_STATE.map_view_mode).toBe('2D')
    expect(INITIAL_MISSION_STATE.terrain_status).toBe('NOT_CONFIGURED')

    const state3D = missionReducer(INITIAL_MISSION_STATE, {
      type: 'SET_MAP_VIEW_MODE',
      payload: '3D',
    })
    expect(state3D.map_view_mode).toBe('3D')

    const stateTerrain = missionReducer(state3D, {
      type: 'SET_TERRAIN_STATUS',
      payload: 'AVAILABLE',
    })
    expect(stateTerrain.terrain_status).toBe('AVAILABLE')

    // RESET_SESSION bảo toàn map_view_mode và terrain_status
    const resetState = missionReducer(stateTerrain, {
      type: 'RESET_SESSION',
    })
    expect(resetState.map_view_mode).toBe('3D')
    expect(resetState.terrain_status).toBe('AVAILABLE')
  })

  it('dùng virtual clock cho REPLAY và không tăng tuổi theo wall-clock tick', () => {
    let state = missionReducer(INITIAL_MISSION_STATE, { type: 'SET_SOURCE_MODE', payload: 'REPLAY' })
    state = receive({ ...state, ws_connected: true }, {
      event_type: 'SNAPSHOT', source_mode: 'REPLAY', session_id: 'SES-REPLAY-1',
      original_source_mode: 'REAL', inference_device: 'PC_REFERENCE',
      pc_rx_monotonic_ms: 500, rx_age_ms: 250, telemetry_age_ms: 250,
      telemetry: { battery_pct: 77 }, target: wgsTarget(), has_target: true,
      replay_metadata: {
        source_file: 'SES-RECORDED.db', source_session_id: 'SES-RECORDED',
        speed_multiplier: 1, is_paused: false, current_record_index: 1,
        total_records: 4, progress_pct: 25, position_ms: 500, duration_ms: 2000,
      },
    } as RawTelemetryPacket & { telemetry_age_ms: number })
    expect(state.original_source_mode).toBe('REAL')
    expect(state.target_history.at(-1)?.timestamp_ms).toBe(500)
    expect(state.replay?.position_ms).toBe(500)

    const afterWallTick = missionReducer(state, { type: 'TICK_AGE', payload: 10000 })
    expect(afterWallTick).toBe(state)

    const advanced = receive(state, {
      event_type: 'REPLAY_TICK', source_mode: 'REPLAY', session_id: 'SES-REPLAY-1',
      rx_age_ms: 1250,
      replay_metadata: { ...state.replay!, is_paused: true, position_ms: 1500, progress_pct: 75 },
    })
    expect(advanced.replay).toMatchObject({ is_paused: true, position_ms: 1500 })
    expect(advanced.rx_age_ms).toBe(1250)
  })

  it('reset REPLAY sang MOCK xóa dữ liệu tương lai trước khi nhận snapshot live mới', () => {
    const replayState: MissionState = {
      ...INITIAL_MISSION_STATE,
      source_mode: 'REPLAY',
      has_target: true,
      target: wgsTarget(),
      camera_position: { ...INITIAL_MISSION_STATE.camera_position, latitude: 16, longitude: 108, is_valid: true },
      bounding_boxes: [{ id: 'future', x: 1, y: 1, width: 2, height: 2, confidence: 90, label: 'person', is_synced: true }],
      alerts: [{
        id: 'future-alert', level: 'WARN', code: 'FUTURE', message: 'future', timestamp_iso: '2026-10-14T00:00:00Z',
        active: true, condition_status: 'ACTIVE', acknowledged: false, source_category: 'SYSTEM', occurrence_count: 1,
        first_seen_iso: '2026-10-14T00:00:00Z', last_seen_iso: '2026-10-14T00:00:00Z',
      }],
      replay: {
        source_file: 'record.db', source_session_id: 'record', speed_multiplier: 1, is_paused: false,
        current_record_index: 3, total_records: 3, progress_pct: 100, position_ms: 3000, duration_ms: 3000,
      },
    }
    const stopped = missionReducer(replayState, { type: 'SET_SOURCE_MODE', payload: 'MOCK' })
    expect(stopped.source_mode).toBe('MOCK')
    expect(stopped.target).toBeNull()
    expect(stopped.camera_position.is_valid).toBe(false)
    expect(stopped.bounding_boxes).toEqual([])
    expect(stopped.alerts).toEqual([])
    expect(stopped.replay).toBeNull()
  })
})
