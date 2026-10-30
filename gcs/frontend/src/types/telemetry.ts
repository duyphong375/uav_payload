/**
 * Định nghĩa kiểu dữ liệu chuẩn KVC GCS theo Hợp đồng dữ liệu KVC-GCS-CONTRACT-001.
 * Tuân thủ nguyên tắc: Không tự ý suy đoán, không thay đổi layout phần cứng,
 * phân biệt rõ ràng giữa tọa độ hệ local (cm) và GPS toàn cầu (WGS-84).
 */

/**
 * 'REPLAY' được giữ lại trong union dù giao diện đã bỏ chế độ phát lại (PLAN-KVC-HISTORY-001).
 * Lý do: backend vẫn có thể gửi packet replay (REST /api/replay/*); transport và reducer
 * phải parse được packet đó để không crash. UI không còn lối vào chế độ này.
 */
export type SourceMode = 'REAL' | 'MOCK' | 'REPLAY'

export type OriginalSourceMode = 'REAL' | 'MOCK' | 'REPLAY' | 'UNKNOWN'

export type InferenceDevice = 'FPGA_GW2A' | 'PC_REFERENCE' | 'SIMULATED' | 'UNKNOWN'

export type CoordinateFrame = 'LOCAL_GRID' | 'WGS84' | 'NONE'

export type TargetObjectClass = 'unknown' | 'person' | 'lifebuoy' | 'boat'

export function formatTargetAgeLabel(
  ageMs: number | undefined,
  staleThresholdMs: number
): string {
  if (ageMs === undefined) return 'Tuổi dữ liệu mục tiêu: N/A'
  if (ageMs > staleThresholdMs) return `Dữ liệu cũ: ${Math.round(ageMs)} ms trước`
  return `Cập nhật: ${Math.round(ageMs)} ms trước`
}

export interface TargetInfo {
  track_id: number | null
  class_id: number // 0: unknown, 1: person, 2: lifebuoy
  class_name: TargetObjectClass
  confidence: number | null // % (0..100)
  target_confirmed: boolean
  pos_valid: boolean
  coordinate_frame: CoordinateFrame
  local_x_cm: number | null
  local_y_cm: number | null
  latitude: number | null
  longitude: number | null
  origin_id: number | null
  /** Tuổi riêng của lần cập nhật mục tiêu cuối, không bị reset bởi packet link/alert. */
  age_ms?: number
}

export interface PayloadTelemetry {
  battery_pct: number | null // % (0..100)
  lidar_range_cm: number | null // cm (20..800)
  gps_valid: boolean
  lidar_valid: boolean
  imu_valid: boolean
  ai_detected: boolean
  packet_rssi_dbm: number | null // dBm (-127..0)
  packet_snr_db: number | null // dB
  roll_deg: number | null // Roll góc nghiêng ngang (° -180..180)
  pitch_deg: number | null // Pitch góc chúc ngẩng (° -90..90)
}

export interface DiagnosticsInfo {
  packets_received_total: number
  decode_errors_total: number
  ingress_drops_total: number
  logger_drops_total?: number
  client_drops_total?: number
  data_loss_latched: boolean
  logger_status: 'OK' | 'LOG_DEGRADED' | 'STORAGE_ERROR'
}

export type HardwareLinkStatus = 'CONNECTED' | 'DISCONNECTED' | 'RECONNECTING' | 'UNKNOWN'

export interface HardwareLink {
  status: HardwareLinkStatus
  port?: string | null
  error_message?: string | null
}

export type AlertLevel = 'INFO' | 'WARN' | 'CRITICAL'

export type AlertConditionStatus = 'ACTIVE' | 'RESOLVED' | 'UNKNOWN'

export type AlertSourceCategory = 'GPS' | 'VIDEO' | 'TELEMETRY' | 'SENSORS' | 'STORAGE' | 'SYSTEM'

export interface AlertItem {
  id: string
  level: AlertLevel
  code: string
  message: string
  timestamp_iso: string
  active: boolean // true nếu lỗi đang hoạt động
  condition_status: AlertConditionStatus
  acknowledged: boolean // true nếu người vận hành đã tiếp nhận
  acknowledged_at_iso?: string | null
  source_category: AlertSourceCategory
  occurrence_count: number
  first_seen_iso: string
  last_seen_iso: string
  impact?: string
  remediation?: string
}

export interface EventLogEntry {
  id: string
  timestamp_iso: string
  level: AlertLevel
  source: AlertSourceCategory | string
  code: string
  message: string
  session_id: string
  details?: string
}

export type MapViewMode = '2D' | '3D'

export type TerrainStatus =
  | 'AVAILABLE'
  | 'UNAVAILABLE'
  | 'NOT_CONFIGURED'
  | 'WEBGL_UNSUPPORTED'

export type AltitudeReference =
  | 'ELLIPSOID'
  | 'MSL'
  | 'AGL'
  | 'UNKNOWN'

export interface CameraPosition {
  latitude: number | null
  longitude: number | null
  altitude_m?: number | null
  altitude_reference?: AltitudeReference
  heading_deg?: number | null
  is_valid: boolean
  last_updated_iso: string | null
  age_ms: number
}

export interface BoundingBox {
  id: string
  x: number // chuẩn hóa 0..1 hoặc pixel theo frame
  y: number
  width: number
  height: number
  confidence: number
  label: string
  track_id?: number | null
  is_synced: boolean
}

export interface VideoStreamStatus {
  source_type: 'LIVE' | 'MOCK' | 'REFERENCE' | 'REPLAY' | 'NONE'
  url: string | null
  is_connected: boolean
  is_loading: boolean
  error_message: string | null
  has_overlay: boolean
  frame_timestamp_iso?: string | null
}

export interface ReplayMetadata {
  source_file: string
  source_session_id: string
  speed_multiplier: number
  is_paused: boolean
  current_record_index: number
  total_records: number
  progress_pct: number
  position_ms: number
  duration_ms: number
}

export interface RawTelemetryPacket {
  event_type?: WebSocketEventType
  schema_version?: string
  session_id?: string
  source_mode?: SourceMode
  original_source_mode?: OriginalSourceMode
  inference_device?: InferenceDevice
  sender_session_id?: number | null
  ground_session_id?: number | null
  sequence_number?: number | null
  pc_rx_time_iso?: string
  pc_rx_monotonic_ms?: number
  device_measurement_time_ms?: number | null
  rx_age_ms?: number
  measurement_age_ms?: number | null
  is_stale?: boolean
  has_target?: boolean
  target?: Partial<TargetInfo> | null
  telemetry?: Partial<PayloadTelemetry> | null
  diagnostics?: Partial<DiagnosticsInfo> | null
  hardware_link?: Partial<HardwareLink> | null
  alert?: {
    level: AlertLevel
    code: string
    message: string
    condition_status?: AlertConditionStatus
  } | null
  replay_metadata?: Partial<ReplayMetadata> | null
  // Cho camera payload position
  camera_position?: {
    latitude?: number | null
    longitude?: number | null
    altitude_m?: number | null
    altitude_reference?: AltitudeReference
    heading_deg?: number | null
    is_valid?: boolean
  } | null
  bounding_boxes?: BoundingBox[] | null
}

export type WebSocketEventType =
  | 'SNAPSHOT'
  | 'TELEMETRY_UPDATE'
  | 'TARGET_UPDATE'
  | 'ALERT_EVENT'
  | 'LINK_STATUS'
  | 'REPLAY_TICK'
  | 'SYSTEM_DIAGNOSTICS'

export interface WebSocketEventMessage extends RawTelemetryPacket {
  event_type: WebSocketEventType
}

export type ViewLayoutMode = 'BALANCED' | 'VIDEO_PRIORITY' | 'MAP_PRIORITY' | 'VIDEO_FULL' | 'MAP_FULL'

export interface PositionHistoryPoint {
  latitude: number
  longitude: number
  timestamp_ms: number
  is_valid: boolean
}

export interface TargetHistoryPoint {
  x: number // cm (nếu local) hoặc lat (nếu wgs84)
  y: number // cm (nếu local) hoặc lon (nếu wgs84)
  coordinate_frame: CoordinateFrame
  timestamp_ms: number
  track_id: number | null
}

export interface MissionState {
  // Metadata phiên
  schema_version: string
  session_id: string
  source_mode: SourceMode
  original_source_mode: OriginalSourceMode
  inference_device: InferenceDevice
  sender_session_id: number | null
  ground_session_id: number | null
  sequence_number: number | null

  // Kết nối
  ws_connected: boolean
  hardware_link: HardwareLink

  // Thời gian và tuổi dữ liệu
  last_rx_iso: string | null
  last_rx_monotonic_ms: number | null
  rx_age_ms: number
  is_stale: boolean

  // Telemetry cảm biến
  telemetry: PayloadTelemetry
  telemetry_age_ms: number | null

  // Mục tiêu cứu nạn
  has_target: boolean
  target: TargetInfo | null
  target_history: TargetHistoryPoint[]

  // Định vị camera / tải nhiệm vụ
  camera_position: CameraPosition
  camera_trail: PositionHistoryPoint[]

  // Video stream
  video: VideoStreamStatus
  bounding_boxes: BoundingBox[]

  // Cảnh báo và chẩn đoán
  alerts: AlertItem[]
  event_logs: EventLogEntry[]
  diagnostics: DiagnosticsInfo

  // Replay
  replay: ReplayMetadata | null

  // Tùy chọn hiển thị
  layout_mode: ViewLayoutMode
  map_view_mode: MapViewMode
  terrain_status: TerrainStatus
  auto_follow_camera: boolean
  show_trails: boolean
  max_trail_points: number
  show_radar: boolean
  sidebar_collapsed: boolean
}
