import { APP_CONFIG } from '@/config/appConfig'
import type {
  AlertConditionStatus,
  BoundingBox,
  DiagnosticsInfo,
  HardwareLink,
  PayloadTelemetry,
  RawTelemetryPacket,
  TargetInfo,
  TargetObjectClass,
  WebSocketEventType,
} from '@/types/telemetry'

const DEFAULT_TELEMETRY: PayloadTelemetry = {
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
}

const DEFAULT_DIAGNOSTICS: DiagnosticsInfo = {
  packets_received_total: 0,
  decode_errors_total: 0,
  ingress_drops_total: 0,
  data_loss_latched: false,
  logger_status: 'OK',
}

const EVENT_TYPES = new Set<WebSocketEventType>([
  'SNAPSHOT',
  'TELEMETRY_UPDATE',
  'TARGET_UPDATE',
  'ALERT_EVENT',
  'LINK_STATUS',
  'REPLAY_TICK',
  'SYSTEM_DIAGNOSTICS',
])

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function hasOwn(data: Record<string, unknown>, key: string): boolean {
  return Object.prototype.hasOwnProperty.call(data, key)
}

function parseStrictBoolean(data: Record<string, unknown>, key: string): boolean | undefined {
  if (!hasOwn(data, key)) return undefined
  if (typeof data[key] !== 'boolean') {
    throw new TypeError(`${key} must be boolean`)
  }
  return data[key]
}

function parseOptionalNumber(
  data: Record<string, unknown>,
  key: string,
  allowNull = true
): number | null | undefined {
  if (!hasOwn(data, key)) return undefined
  if (data[key] === null && allowNull) return null
  if (!isValidNumber(data[key])) {
    throw new TypeError(`${key} must be a finite number${allowNull ? ' or null' : ''}`)
  }
  return data[key]
}

/** Kiểm tra số hữu hạn; chuỗi số và object không được ép kiểu. */
export function isValidNumber(val: unknown): val is number {
  return typeof val === 'number' && !Number.isNaN(val) && Number.isFinite(val)
}

/** Tọa độ 0.0 hợp lệ. */
export function isValidLatitude(lat: unknown): lat is number {
  return isValidNumber(lat) && lat >= -90.0 && lat <= 90.0
}

/** Tọa độ 0.0 hợp lệ. */
export function isValidLongitude(lon: unknown): lon is number {
  return isValidNumber(lon) && lon >= -180.0 && lon <= 180.0
}

function parsePayloadTelemetryPatch(raw: unknown): Partial<PayloadTelemetry> | null {
  if (!isRecord(raw)) return null

  const result: Partial<PayloadTelemetry> = {}
  for (const key of ['gps_valid', 'lidar_valid', 'imu_valid', 'ai_detected'] as const) {
    const parsed = parseStrictBoolean(raw, key)
    if (parsed !== undefined) result[key] = parsed
  }

  const battery = parseOptionalNumber(raw, 'battery_pct')
  if (battery !== undefined) {
    result.battery_pct =
      battery !== null &&
      battery !== APP_CONFIG.SENTINELS.UINT8_MAX &&
      battery >= 0 &&
      battery <= 100
        ? Math.round(battery)
        : null
  }

  const lidar = parseOptionalNumber(raw, 'lidar_range_cm')
  if (lidar !== undefined) {
    result.lidar_range_cm =
      lidar !== null &&
      lidar !== APP_CONFIG.SENTINELS.UINT16_MAX &&
      lidar >= 20 &&
      lidar <= 800
        ? Math.round(lidar)
        : null
  }
  if (result.lidar_valid === false) result.lidar_range_cm = null

  const rssi = parseOptionalNumber(raw, 'packet_rssi_dbm')
  if (rssi !== undefined) {
    result.packet_rssi_dbm =
      rssi !== null &&
      rssi !== APP_CONFIG.SENTINELS.RSSI_NULL &&
      rssi >= -127 &&
      rssi <= 0
        ? Math.round(rssi)
        : null
  }

  const snr = parseOptionalNumber(raw, 'packet_snr_db')
  if (snr !== undefined) {
    result.packet_snr_db = snr === null ? null : Math.round(snr * 100) / 100
  }

  const roll = parseOptionalNumber(raw, 'roll_deg')
  if (roll !== undefined) {
    result.roll_deg = roll === null ? null : Math.round(roll * 10) / 10
  }

  const pitch = parseOptionalNumber(raw, 'pitch_deg')
  if (pitch !== undefined) {
    result.pitch_deg = pitch === null ? null : Math.round(pitch * 10) / 10
  }

  if (result.imu_valid === false) {
    result.roll_deg = null
    result.pitch_deg = null
  }

  return result
}

/** Parse đầy đủ telemetry; schema sai kiểu trả null thay vì truthy-coercion. */
export function parsePayloadTelemetry(raw: unknown): PayloadTelemetry | null {
  try {
    const patch = parsePayloadTelemetryPatch(raw)
    return patch ? { ...DEFAULT_TELEMETRY, ...patch } : null
  } catch {
    return null
  }
}

function parseTargetPatch(raw: unknown): Partial<TargetInfo> | null {
  if (!isRecord(raw)) return null

  const result: Partial<TargetInfo> = {}
  const posValid = parseStrictBoolean(raw, 'pos_valid')
  const confirmed = parseStrictBoolean(raw, 'target_confirmed')
  if (posValid !== undefined) result.pos_valid = posValid
  if (confirmed !== undefined) result.target_confirmed = confirmed

  if (hasOwn(raw, 'coordinate_frame')) {
    if (raw.coordinate_frame === null) {
      result.coordinate_frame = 'NONE'
    } else if (
      raw.coordinate_frame === 'LOCAL_GRID' ||
      raw.coordinate_frame === 'WGS84' ||
      raw.coordinate_frame === 'NONE'
    ) {
      result.coordinate_frame = raw.coordinate_frame
    } else {
      throw new TypeError('coordinate_frame is invalid')
    }
  }

  if (hasOwn(raw, 'class_id')) {
    if (!isValidNumber(raw.class_id)) throw new TypeError('class_id must be a number')
    let classId = 0
    let className: TargetObjectClass = 'unknown'
    if (raw.class_id === 1) {
      classId = 1
      className = 'person'
    } else if (raw.class_id === 2) {
      classId = 2
      className = 'lifebuoy'
    }
    result.class_id = classId
    result.class_name = className
  } else if (hasOwn(raw, 'class_name')) {
    if (raw.class_name !== 'unknown' && raw.class_name !== 'person' && raw.class_name !== 'lifebuoy') {
      throw new TypeError('class_name is invalid')
    }
    result.class_name = raw.class_name
  }

  const confidence = parseOptionalNumber(raw, 'confidence')
  if (confidence !== undefined) {
    result.confidence =
      confidence !== null &&
      confidence !== APP_CONFIG.SENTINELS.UINT8_MAX &&
      confidence >= 0 &&
      confidence <= 100
        ? Math.round(confidence)
        : null
  }

  for (const key of ['track_id', 'origin_id'] as const) {
    const value = parseOptionalNumber(raw, key)
    if (value !== undefined) result[key] = value !== null && value > 0 ? Math.round(value) : null
  }

  for (const key of ['local_x_cm', 'local_y_cm'] as const) {
    const value = parseOptionalNumber(raw, key)
    if (value !== undefined) {
      result[key] = value !== APP_CONFIG.SENTINELS.INT32_MIN ? value : null
    }
  }

  const latitude = parseOptionalNumber(raw, 'latitude')
  if (latitude !== undefined) result.latitude = latitude !== null && isValidLatitude(latitude) ? latitude : null
  const longitude = parseOptionalNumber(raw, 'longitude')
  if (longitude !== undefined) result.longitude = longitude !== null && isValidLongitude(longitude) ? longitude : null

  return result
}

/** Parse đầy đủ target. gps_valid được giữ trong chữ ký để tương thích caller cũ nhưng pos_valid là validity của target. */
export function parseTargetInfo(raw: unknown, _gpsValid = false): TargetInfo | null {
  try {
    const patch = parseTargetPatch(raw)
    if (!patch) return null
    const target: TargetInfo = {
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
      ...patch,
    }
    return normalizeTarget(target)
  } catch {
    return null
  }
}

function normalizeTarget(target: TargetInfo): TargetInfo {
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

function parseDiagnosticsPatch(raw: unknown): Partial<DiagnosticsInfo> | null {
  if (!isRecord(raw)) return null
  const result: Partial<DiagnosticsInfo> = {}

  for (const key of [
    'packets_received_total',
    'decode_errors_total',
    'ingress_drops_total',
    'logger_drops_total',
    'client_drops_total',
  ] as const) {
    const value = parseOptionalNumber(raw, key)
    if (value !== undefined) result[key] = value === null ? 0 : Math.max(0, value)
  }

  const dataLoss = parseStrictBoolean(raw, 'data_loss_latched')
  if (dataLoss !== undefined) result.data_loss_latched = dataLoss

  if (hasOwn(raw, 'logger_status')) {
    if (raw.logger_status !== 'OK' && raw.logger_status !== 'LOG_DEGRADED' && raw.logger_status !== 'STORAGE_ERROR') {
      throw new TypeError('logger_status is invalid')
    }
    result.logger_status = raw.logger_status
  }

  return result
}

export function parseDiagnostics(raw: unknown): DiagnosticsInfo | null {
  try {
    const patch = parseDiagnosticsPatch(raw)
    return patch ? { ...DEFAULT_DIAGNOSTICS, ...patch } : null
  } catch {
    return null
  }
}

function parseHardwareLinkPatch(raw: unknown): Partial<HardwareLink> | null {
  if (!isRecord(raw)) return null
  const result: Partial<HardwareLink> = {}

  if (hasOwn(raw, 'status')) {
    if (
      raw.status !== 'CONNECTED' &&
      raw.status !== 'DISCONNECTED' &&
      raw.status !== 'RECONNECTING' &&
      raw.status !== 'UNKNOWN'
    ) {
      throw new TypeError('hardware_link.status is invalid')
    }
    result.status = raw.status
  }

  for (const key of ['port', 'error_message'] as const) {
    if (hasOwn(raw, key)) {
      if (raw[key] !== null && typeof raw[key] !== 'string') {
        throw new TypeError(`hardware_link.${key} must be string or null`)
      }
      result[key] = raw[key]
    }
  }
  return result
}

export function parseHardwareLink(raw: unknown): HardwareLink | null {
  try {
    const patch = parseHardwareLinkPatch(raw)
    return patch ? { status: 'UNKNOWN', port: null, error_message: null, ...patch } : null
  } catch {
    return null
  }
}

function parseCameraPositionPatch(raw: unknown): RawTelemetryPacket['camera_position'] {
  if (!isRecord(raw)) throw new TypeError('camera_position must be an object or null')
  const result: NonNullable<RawTelemetryPacket['camera_position']> = {}

  const latitude = parseOptionalNumber(raw, 'latitude')
  if (latitude !== undefined) result.latitude = latitude !== null && isValidLatitude(latitude) ? latitude : null
  const longitude = parseOptionalNumber(raw, 'longitude')
  if (longitude !== undefined) result.longitude = longitude !== null && isValidLongitude(longitude) ? longitude : null
  const altitude = parseOptionalNumber(raw, 'altitude_m')
  if (altitude !== undefined) result.altitude_m = altitude
  const heading = parseOptionalNumber(raw, 'heading_deg')
  if (heading !== undefined) result.heading_deg = heading !== null && heading >= 0 && heading <= 360 ? heading : null

  const isValid = parseStrictBoolean(raw, 'is_valid')
  if (isValid !== undefined) result.is_valid = isValid

  if (hasOwn(raw, 'altitude_reference')) {
    if (
      raw.altitude_reference !== 'ELLIPSOID' &&
      raw.altitude_reference !== 'MSL' &&
      raw.altitude_reference !== 'AGL' &&
      raw.altitude_reference !== 'UNKNOWN' &&
      raw.altitude_reference !== null
    ) {
      throw new TypeError('altitude_reference is invalid')
    }
    result.altitude_reference = raw.altitude_reference ?? 'UNKNOWN'
  }

  return result
}

function parseAlert(raw: unknown): NonNullable<RawTelemetryPacket['alert']> {
  if (!isRecord(raw)) throw new TypeError('alert must be an object or null')
  if (raw.level !== 'INFO' && raw.level !== 'WARN' && raw.level !== 'CRITICAL') {
    throw new TypeError('alert.level is invalid')
  }
  if (typeof raw.code !== 'string' || raw.code.length === 0 || typeof raw.message !== 'string') {
    throw new TypeError('alert code/message is invalid')
  }

  let conditionStatus: AlertConditionStatus | undefined
  if (hasOwn(raw, 'condition_status')) {
    if (raw.condition_status !== 'ACTIVE' && raw.condition_status !== 'RESOLVED' && raw.condition_status !== 'UNKNOWN') {
      throw new TypeError('alert.condition_status is invalid')
    }
    conditionStatus = raw.condition_status
  }

  return {
    level: raw.level,
    code: raw.code,
    message: raw.message,
    ...(conditionStatus ? { condition_status: conditionStatus } : {}),
  }
}

function copyCommonFields(data: Record<string, unknown>, packet: RawTelemetryPacket): void {
  for (const key of ['schema_version', 'session_id', 'pc_rx_time_iso'] as const) {
    if (hasOwn(data, key)) {
      if (typeof data[key] !== 'string' || (key === 'session_id' && data[key].length === 0)) {
        throw new TypeError(`${key} must be a non-empty string`)
      }
      packet[key] = data[key]
    }
  }

  if (hasOwn(data, 'original_source_mode')) {
    if (
      data.original_source_mode !== 'REAL' &&
      data.original_source_mode !== 'MOCK' &&
      data.original_source_mode !== 'REPLAY' &&
      data.original_source_mode !== 'UNKNOWN'
    ) {
      throw new TypeError('original_source_mode is invalid')
    }
    packet.original_source_mode = data.original_source_mode
  }

  if (hasOwn(data, 'inference_device')) {
    if (
      data.inference_device !== 'FPGA_GW2A' &&
      data.inference_device !== 'PC_REFERENCE' &&
      data.inference_device !== 'SIMULATED' &&
      data.inference_device !== 'UNKNOWN'
    ) {
      throw new TypeError('inference_device is invalid')
    }
    packet.inference_device = data.inference_device
  }

  for (const key of [
    'sender_session_id',
    'ground_session_id',
    'sequence_number',
    'pc_rx_monotonic_ms',
    'device_measurement_time_ms',
    'rx_age_ms',
    'measurement_age_ms',
  ] as const) {
    const value = parseOptionalNumber(data, key)
    if (value !== undefined) {
      if ((key === 'rx_age_ms' || key === 'pc_rx_monotonic_ms') && value === null) {
        throw new TypeError(`${key} cannot be null`)
      }
      ;(packet as Record<string, unknown>)[key] = value === null ? null : Math.max(0, value)
    }
  }

  const isStale = parseStrictBoolean(data, 'is_stale')
  if (isStale !== undefined) {
    packet.is_stale = isStale
  } else if (typeof packet.rx_age_ms === 'number') {
    packet.is_stale = packet.rx_age_ms > 3000
  }
}

function parseBoundingBoxes(raw: unknown): BoundingBox[] {
  if (!Array.isArray(raw) || raw.some((item) => !isRecord(item))) {
    throw new TypeError('bounding_boxes must be an array of objects')
  }
  return raw as unknown as BoundingBox[]
}

/**
 * Adapter WebSocket strict: source_mode và event_type không được suy đoán.
 * Patch chỉ materialize các field thuộc domain của event; field vắng mặt không trở thành default.
 */
export function adaptTelemetryPacket(rawText: string | object): RawTelemetryPacket | null {
  try {
    const raw = typeof rawText === 'string' ? JSON.parse(rawText) : rawText
    if (!isRecord(raw)) return null

    if (raw.source_mode !== 'REAL' && raw.source_mode !== 'MOCK' && raw.source_mode !== 'REPLAY') {
      return null
    }
    if (typeof raw.event_type !== 'string' || !EVENT_TYPES.has(raw.event_type as WebSocketEventType)) {
      return null
    }

    const eventType = raw.event_type as WebSocketEventType
    const packet: RawTelemetryPacket = {
      event_type: eventType,
      source_mode: raw.source_mode,
    }
    copyCommonFields(raw, packet)
    if (packet.is_stale === undefined && packet.rx_age_ms !== undefined) {
      packet.is_stale = packet.rx_age_ms > APP_CONFIG.STALE_THRESHOLD_MS
    }

    const includeTelemetry = eventType === 'SNAPSHOT' || eventType === 'TELEMETRY_UPDATE'
    const includeTarget = eventType === 'SNAPSHOT' || eventType === 'TARGET_UPDATE'
    const includeLink = eventType === 'SNAPSHOT' || eventType === 'LINK_STATUS'
    const includeAlert = eventType === 'SNAPSHOT' || eventType === 'ALERT_EVENT'
    const includeDiagnostics = eventType === 'SNAPSHOT' || eventType === 'SYSTEM_DIAGNOSTICS'
    const includeReplay = eventType === 'SNAPSHOT' || eventType === 'REPLAY_TICK'

    if (includeTelemetry && hasOwn(raw, 'telemetry')) {
      if (raw.telemetry === null) {
        packet.telemetry = null
      } else {
        const parsed = parsePayloadTelemetryPatch(raw.telemetry)
        if (!parsed) throw new TypeError('telemetry must be an object or null')
        packet.telemetry = parsed
      }
    }

    if (includeTarget) {
      const hasTarget = parseStrictBoolean(raw, 'has_target')
      if (hasTarget !== undefined) packet.has_target = hasTarget
      if (hasOwn(raw, 'target')) {
        if (raw.target === null) {
          packet.target = null
        } else {
          const parsed = parseTargetPatch(raw.target)
          if (!parsed) throw new TypeError('target must be an object or null')
          packet.target = parsed
        }
      }
    }

    if (includeTelemetry && hasOwn(raw, 'camera_position')) {
      packet.camera_position = raw.camera_position === null ? null : parseCameraPositionPatch(raw.camera_position)
    }

    if ((includeTelemetry || includeTarget) && hasOwn(raw, 'bounding_boxes')) {
      packet.bounding_boxes = raw.bounding_boxes === null ? null : parseBoundingBoxes(raw.bounding_boxes)
    }

    if (includeLink && hasOwn(raw, 'hardware_link')) {
      if (raw.hardware_link === null) {
        packet.hardware_link = null
      } else {
        const parsed = parseHardwareLinkPatch(raw.hardware_link)
        if (!parsed) throw new TypeError('hardware_link must be an object or null')
        packet.hardware_link = parsed
      }
    }

    if (includeAlert && hasOwn(raw, 'alert')) {
      packet.alert = raw.alert === null ? null : parseAlert(raw.alert)
    }

    if (includeDiagnostics && hasOwn(raw, 'diagnostics')) {
      if (raw.diagnostics === null) {
        packet.diagnostics = null
      } else {
        const parsed = parseDiagnosticsPatch(raw.diagnostics)
        if (!parsed) throw new TypeError('diagnostics must be an object or null')
        packet.diagnostics = parsed
      }
    }

    if (includeReplay && hasOwn(raw, 'replay_metadata')) {
      if (raw.replay_metadata !== null && !isRecord(raw.replay_metadata)) {
        throw new TypeError('replay_metadata must be an object or null')
      }
      packet.replay_metadata = raw.replay_metadata as RawTelemetryPacket['replay_metadata']
    }

    return packet
  } catch (error) {
    console.error('[TelemetryAdapter] Từ chối gói JSON sai schema:', error)
    return null
  }
}
