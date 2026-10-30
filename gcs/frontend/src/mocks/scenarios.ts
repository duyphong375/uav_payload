import type { RawTelemetryPacket } from '@/types/telemetry'

export interface MockScenarioConfig {
  id: string
  name: string
  description: string
  tags: string[]
  generatePacket: (tickIndex: number) => RawTelemetryPacket
}

// Tọa độ thực địa mặc định: Vùng ven sông Vu Gia - Thu Bồn (Đại Lộc, Quảng Nam)
export const DEFAULT_BASE_LAT = 15.8925
export const DEFAULT_BASE_LON = 108.0654

function getSavedBaseLat(): number {
  if (typeof window !== 'undefined') {
    const val = localStorage.getItem('kvc_mock_base_lat')
    if (val) {
      const parsed = parseFloat(val)
      if (!isNaN(parsed) && parsed >= -90 && parsed <= 90) return parsed
    }
  }
  return DEFAULT_BASE_LAT
}

function getSavedBaseLon(): number {
  if (typeof window !== 'undefined') {
    const val = localStorage.getItem('kvc_mock_base_lon')
    if (val) {
      const parsed = parseFloat(val)
      if (!isNaN(parsed) && parsed >= -180 && parsed <= 180) return parsed
    }
  }
  return DEFAULT_BASE_LON
}

let activeBaseLat = getSavedBaseLat()
let activeBaseLon = getSavedBaseLon()

export function setMockBaseCoordinates(lat: number, lon: number): void {
  activeBaseLat = lat
  activeBaseLon = lon
  if (typeof window !== 'undefined') {
    localStorage.setItem('kvc_mock_base_lat', lat.toString())
    localStorage.setItem('kvc_mock_base_lon', lon.toString())
  }
}

export function resetMockBaseCoordinates(): void {
  activeBaseLat = DEFAULT_BASE_LAT
  activeBaseLon = DEFAULT_BASE_LON
  if (typeof window !== 'undefined') {
    localStorage.removeItem('kvc_mock_base_lat')
    localStorage.removeItem('kvc_mock_base_lon')
  }
}

export function getMockBaseCoordinates(): { lat: number; lon: number; isCustom: boolean } {
  return {
    lat: activeBaseLat,
    lon: activeBaseLon,
    isCustom: activeBaseLat !== DEFAULT_BASE_LAT || activeBaseLon !== DEFAULT_BASE_LON,
  }
}

export function requestCurrentLocation(): Promise<{ lat: number; lon: number }> {
  return new Promise((resolve, reject) => {
    if (typeof window === 'undefined' || !navigator.geolocation) {
      reject(new Error('Trình duyệt không hỗ trợ Geolocation.'))
      return
    }

    navigator.geolocation.getCurrentPosition(
      (pos) => {
        const lat = pos.coords.latitude
        const lon = pos.coords.longitude
        setMockBaseCoordinates(lat, lon)
        resolve({ lat, lon })
      },
      (err) => {
        reject(err)
      },
      {
        enableHighAccuracy: true,
        timeout: 10000,
        maximumAge: 30000,
      }
    )
  })
}

const getBaseLat = () => activeBaseLat
const getBaseLon = () => activeBaseLon

export const MOCK_SCENARIOS: MockScenarioConfig[] = [
  {
    id: 'NORMAL_GPS_TARGET',
    name: '1. Tuần tra có GPS & Phát hiện Mục tiêu',
    description: 'Cụm camera di chuyển dọc dòng sông với GPS hợp lệ, phát hiện người cứu nạn (track #101) với WGS-84.',
    tags: ['GPS OK', 'Target', 'Normal'],
    generatePacket: (tick) => {
      const angle = (tick * 0.05) % (Math.PI * 2)
      const lat = getBaseLat() + Math.sin(angle) * 0.002
      const lon = getBaseLon() + Math.cos(angle) * 0.003
      return {
        schema_version: '1.0.0',
        session_id: 'SES-MOCK-NORMAL-001',
        source_mode: 'MOCK',
        original_source_mode: 'MOCK',
        inference_device: 'SIMULATED',
        sender_session_id: 1,
        ground_session_id: 1,
        sequence_number: 100 + tick,
        pc_rx_time_iso: new Date().toISOString(),
        pc_rx_monotonic_ms: 100000 + tick * 1000,
        device_measurement_time_ms: 20000 + tick * 1000,
        rx_age_ms: 80,
        measurement_age_ms: null,
        is_stale: false,
        has_target: true,
        target: {
          track_id: 101,
          class_id: 1,
          class_name: 'person',
          confidence: 94,
          target_confirmed: true,
          pos_valid: true,
          coordinate_frame: 'WGS84',
          local_x_cm: null,
          local_y_cm: null,
          latitude: lat + 0.0004,
          longitude: lon + 0.0003,
          origin_id: null,
        },
        telemetry: {
          battery_pct: Math.max(20, 88 - Math.floor(tick / 20)),
          lidar_range_cm: 250 + Math.floor(Math.sin(tick * 0.2) * 30),
          gps_valid: true,
          lidar_valid: true,
          imu_valid: true,
          ai_detected: true,
          packet_rssi_dbm: -82,
          packet_snr_db: 7.5,
        },
        camera_position: {
          latitude: lat,
          longitude: lon,
          altitude_m: 25.5,
          heading_deg: (tick * 8) % 360,
          is_valid: true,
        },
        diagnostics: {
          packets_received_total: 100 + tick,
          decode_errors_total: 0,
          ingress_drops_total: 0,
          data_loss_latched: false,
          logger_status: 'OK',
        },
        hardware_link: {
          status: 'CONNECTED',
          port: 'COM4 (Dongle SX1278)',
          error_message: null,
        },
        bounding_boxes: [
          {
            id: 'box-101',
            x: 0.45 + Math.sin(tick * 0.1) * 0.05,
            y: 0.5 + Math.cos(tick * 0.1) * 0.04,
            width: 0.12,
            height: 0.18,
            confidence: 94,
            label: 'Người (Person) #101',
            track_id: 101,
            is_synced: true,
          },
        ],
      }
    },
  },

  {
    id: 'NORMAL_NO_TARGET',
    name: '2. Tuần tra Bình thường (Không có mục tiêu)',
    description: 'Camera bay tuần tra quét khu vực, GPS tốt, không phát hiện mục tiêu.',
    tags: ['GPS OK', 'No Target'],
    generatePacket: (tick) => {
      const angle = (tick * 0.04) % (Math.PI * 2)
      const lat = getBaseLat() + Math.sin(angle) * 0.0015
      const lon = getBaseLon() + Math.cos(angle) * 0.0025
      return {
        schema_version: '1.0.0',
        session_id: 'SES-MOCK-PATROL-002',
        source_mode: 'MOCK',
        original_source_mode: 'MOCK',
        inference_device: 'SIMULATED',
        sender_session_id: 1,
        ground_session_id: 1,
        sequence_number: 200 + tick,
        pc_rx_time_iso: new Date().toISOString(),
        pc_rx_monotonic_ms: 200000 + tick * 1000,
        rx_age_ms: 100,
        is_stale: false,
        has_target: false,
        target: null,
        telemetry: {
          battery_pct: 85,
          lidar_range_cm: 280,
          gps_valid: true,
          lidar_valid: true,
          imu_valid: true,
          ai_detected: false,
          packet_rssi_dbm: -80,
          packet_snr_db: 8.2,
        },
        camera_position: {
          latitude: lat,
          longitude: lon,
          altitude_m: 28.0,
          heading_deg: 90,
          is_valid: true,
        },
        diagnostics: {
          packets_received_total: 200 + tick,
          decode_errors_total: 0,
          ingress_drops_total: 0,
          data_loss_latched: false,
          logger_status: 'OK',
        },
        hardware_link: { status: 'CONNECTED', port: 'COM4' },
        bounding_boxes: [],
      }
    },
  },

  {
    id: 'GPS_LOST_FIX',
    name: '3. GNSS Mất Fix / Vệ tinh bị che khuất',
    description: 'Mất tín hiệu GPS (gps_valid=false), bản đồ làm mờ vị trí cuối, hiển thị N/A cho tọa độ mới.',
    tags: ['GPS LOST', 'Warning'],
    generatePacket: (tick) => ({
      schema_version: '1.0.0',
      session_id: 'SES-MOCK-NOGPS-003',
      source_mode: 'MOCK',
      original_source_mode: 'MOCK',
      inference_device: 'SIMULATED',
      sequence_number: 300 + tick,
      pc_rx_time_iso: new Date().toISOString(),
      rx_age_ms: 120,
      is_stale: false,
      has_target: false,
      target: null,
      telemetry: {
        battery_pct: 79,
        lidar_range_cm: 260,
        gps_valid: false, // MẤT FIX
        lidar_valid: true,
        imu_valid: true,
        ai_detected: false,
        packet_rssi_dbm: -92,
        packet_snr_db: 2.1,
      },
      camera_position: {
        latitude: null,
        longitude: null,
        altitude_m: null,
        heading_deg: null,
        is_valid: false,
      },
      alert: {
        level: 'WARN',
        code: 'GNSS_FIX_LOST',
        message: 'Mất khóa tín hiệu vệ tinh GNSS. Tọa độ toàn cầu không khả dụng.',
      },
      hardware_link: { status: 'CONNECTED', port: 'COM4' },
      diagnostics: {
        packets_received_total: 300 + tick,
        decode_errors_total: 0,
        ingress_drops_total: 0,
        data_loss_latched: false,
        logger_status: 'OK',
      },
    }),
  },

  {
    id: 'STALE_DATA',
    name: '4. Dữ liệu Quá Cũ (STALE > 3 Giây)',
    description: 'Kênh truyền RF bị suy hao hoặc che chắn, gói tin không về trong 4,5 giây (rx_age_ms=4500).',
    tags: ['STALE', 'Warning'],
    generatePacket: (tick) => ({
      schema_version: '1.0.0',
      session_id: 'SES-MOCK-STALE-004',
      source_mode: 'MOCK',
      original_source_mode: 'MOCK',
      sequence_number: 400 + tick,
      pc_rx_time_iso: new Date(Date.now() - 4500).toISOString(),
      rx_age_ms: 4500,
      is_stale: true,
      has_target: true,
      target: {
        track_id: 102,
        class_id: 2,
        class_name: 'lifebuoy',
        confidence: 88,
        target_confirmed: true,
        pos_valid: true,
        coordinate_frame: 'WGS84',
        local_x_cm: null,
        local_y_cm: null,
        latitude: getBaseLat() + 0.001,
        longitude: getBaseLon() + 0.001,
        origin_id: null,
      },
      telemetry: {
        battery_pct: 74,
        lidar_range_cm: 245,
        gps_valid: true,
        lidar_valid: true,
        imu_valid: true,
        ai_detected: true,
        packet_rssi_dbm: -108,
        packet_snr_db: -5.0,
      },
      alert: {
        level: 'WARN',
        code: 'LINK_STALE',
        message: 'Dữ liệu quá hạn (>3,0 giây không nhận được gói tin mới). Đang giữ vị trí cuối.',
      },
      hardware_link: { status: 'CONNECTED', port: 'COM4' },
      diagnostics: {
        packets_received_total: 400,
        decode_errors_total: 4,
        ingress_drops_total: 0,
        data_loss_latched: false,
        logger_status: 'OK',
      },
    }),
  },

  {
    id: 'LOCAL_GRID_RADAR',
    name: '5. Hệ Local Cục Bộ (LOCAL_GRID XY cm)',
    description: 'Thử nghiệm phòng thí nghiệm: Tọa độ local X, Y (cm) xung quanh gốc O (0,0), radar hiển thị trực tiếp.',
    tags: ['Local Grid', 'Radar', 'Lab Test'],
    generatePacket: (tick) => {
      const x = Math.round(Math.sin(tick * 0.15) * 120 * 10) / 10
      const y = Math.round(Math.cos(tick * 0.15) * 80 * 10) / 10
      return {
        schema_version: '1.0.0',
        session_id: 'SES-MOCK-GRID-005',
        source_mode: 'MOCK',
        original_source_mode: 'MOCK',
        inference_device: 'SIMULATED',
        sequence_number: 500 + tick,
        pc_rx_time_iso: new Date().toISOString(),
        rx_age_ms: 90,
        is_stale: false,
        has_target: true,
        target: {
          track_id: 103,
          class_id: 1,
          class_name: 'person',
          confidence: 91,
          target_confirmed: true,
          pos_valid: true,
          coordinate_frame: 'LOCAL_GRID',
          local_x_cm: x,
          local_y_cm: y,
          latitude: null, // Không gán XY vào lat/lon
          longitude: null,
          origin_id: 1,
        },
        telemetry: {
          battery_pct: 92,
          lidar_range_cm: 220,
          gps_valid: false,
          lidar_valid: true,
          imu_valid: true,
          ai_detected: true,
          packet_rssi_dbm: -75,
          packet_snr_db: 10.0,
        },
        hardware_link: { status: 'CONNECTED', port: 'COM4' },
        diagnostics: {
          packets_received_total: 500 + tick,
          decode_errors_total: 0,
          ingress_drops_total: 0,
          data_loss_latched: false,
          logger_status: 'OK',
        },
      }
    },
  },

  {
    id: 'BACKEND_DISCONNECTED',
    name: '6. Backend Mất Kết Nối (WebSocket Closed)',
    description: 'Trình duyệt mất liên lạc với Backend GCS (kết nối mạng đứt hoặc backend sập).',
    tags: ['Error', 'Connection'],
    generatePacket: () => ({
      schema_version: '1.0.0',
      session_id: 'SES-DISCONNECTED',
      source_mode: 'MOCK',
      rx_age_ms: 15000,
      is_stale: true,
      has_target: false,
      target: null,
      telemetry: {
        battery_pct: null,
        lidar_range_cm: null,
        gps_valid: false,
        lidar_valid: false,
        imu_valid: false,
        ai_detected: false,
        packet_rssi_dbm: null,
        packet_snr_db: null,
      },
      alert: {
        level: 'CRITICAL',
        code: 'BACKEND_UNREACHABLE',
        message: 'Mất kết nối WebSocket tới GCS Backend. Đang tự động kết nối lại...',
      },
      hardware_link: { status: 'UNKNOWN' },
      diagnostics: {
        packets_received_total: 0,
        decode_errors_total: 0,
        ingress_drops_total: 0,
        data_loss_latched: true,
        logger_status: 'STORAGE_ERROR',
      },
    }),
  },

  {
    id: 'HARDWARE_LINK_LOST',
    name: '7. Phần Cứng Ngừng Gửi (WS vẫn mở)',
    description: 'WebSocket nối tốt, nhưng cáp USB/dongle LoRa bị ngắt hoặc tải nhiệm vụ tắt nguồn đột ngột.',
    tags: ['Hardware Lost', 'Critical'],
    generatePacket: () => ({
      schema_version: '1.0.0',
      session_id: 'SES-MOCK-HWLOST-007',
      source_mode: 'REAL',
      original_source_mode: 'REAL',
      inference_device: 'FPGA_GW2A',
      sequence_number: null,
      pc_rx_time_iso: new Date().toISOString(),
      rx_age_ms: 8000,
      is_stale: true,
      has_target: false,
      target: null,
      telemetry: {
        battery_pct: null,
        lidar_range_cm: null,
        gps_valid: false,
        lidar_valid: false,
        imu_valid: false,
        ai_detected: false,
        packet_rssi_dbm: null,
        packet_snr_db: null,
      },
      alert: {
        level: 'CRITICAL',
        code: 'HARDWARE_PORT_LOST',
        message: 'Cổng nối tiếp trạm thu mặt đất (COM3) bị ngắt kết nối. Không có tín hiệu RF.',
      },
      hardware_link: {
        status: 'DISCONNECTED',
        port: 'COM3',
        error_message: 'ClearCommError: Serial device unmounted',
      },
      diagnostics: {
        packets_received_total: 150,
        decode_errors_total: 2,
        ingress_drops_total: 0,
        data_loss_latched: true,
        logger_status: 'OK',
      },
    }),
  },

  {
    id: 'VIDEO_ERROR',
    name: '8. Video Chưa Cấu Hình / Lỗi Luồng',
    description: 'Luồng video camera quang học bị gián đoạn; telemetry và GPS vẫn hoạt động bình thường.',
    tags: ['Video Error', 'Telemetry OK'],
    generatePacket: (tick) => ({
      schema_version: '1.0.0',
      session_id: 'SES-MOCK-VIDERR-008',
      source_mode: 'MOCK',
      sequence_number: 600 + tick,
      pc_rx_time_iso: new Date().toISOString(),
      rx_age_ms: 100,
      is_stale: false,
      has_target: false,
      target: null,
      telemetry: {
        battery_pct: 82,
        lidar_range_cm: 230,
        gps_valid: true,
        lidar_valid: true,
        imu_valid: true,
        ai_detected: false,
        packet_rssi_dbm: -84,
        packet_snr_db: 6.8,
      },
      camera_position: {
        latitude: getBaseLat(),
        longitude: getBaseLon(),
        altitude_m: 22.0,
        heading_deg: 45,
        is_valid: true,
      },
      hardware_link: { status: 'CONNECTED', port: 'COM4' },
      alert: {
        level: 'WARN',
        code: 'VIDEO_STREAM_LOST',
        message: 'Mất tín hiệu luồng video camera tải nhiệm vụ. Telemetry và GPS vẫn hoạt động độc lập.',
      },
      diagnostics: {
        packets_received_total: 600 + tick,
        decode_errors_total: 0,
        ingress_drops_total: 0,
        data_loss_latched: false,
        logger_status: 'OK',
      },
    }),
  },

  {
    id: 'SENSOR_DEGRADED',
    name: '9. Cảm Biến Suy Hao (Siêu âm & IMU Lỗi)',
    description: 'Cáp siêu âm lỏng, góc nghiêng IMU vượt ngưỡng cho phép, hạ cờ pos_valid=false.',
    tags: ['Sensor Error', 'Warning'],
    generatePacket: (tick) => ({
      schema_version: '1.0.0',
      session_id: 'SES-MOCK-SENS-009',
      source_mode: 'MOCK',
      sequence_number: 700 + tick,
      pc_rx_time_iso: new Date().toISOString(),
      rx_age_ms: 110,
      is_stale: false,
      has_target: true,
      target: {
        track_id: 105,
        class_id: 1,
        class_name: 'person',
        confidence: 76,
        target_confirmed: false,
        pos_valid: false, // HẠ CỜ
        coordinate_frame: 'LOCAL_GRID',
        local_x_cm: null,
        local_y_cm: null,
        latitude: null,
        longitude: null,
        origin_id: 1,
      },
      telemetry: {
        battery_pct: 77,
        lidar_range_cm: null, // Lỗi
        gps_valid: false,
        lidar_valid: false,
        imu_valid: false,
        ai_detected: true,
        packet_rssi_dbm: -88,
        packet_snr_db: 5.0,
      },
      alert: {
        level: 'WARN',
        code: 'SENSOR_DEGRADED',
        message: 'Siêu âm ngoài tầm đo và IMU mất hiệu chuẩn. Không thể tính toán tọa độ local.',
      },
      hardware_link: { status: 'CONNECTED', port: 'COM4' },
      diagnostics: {
        packets_received_total: 700 + tick,
        decode_errors_total: 0,
        ingress_drops_total: 0,
        data_loss_latched: false,
        logger_status: 'OK',
      },
    }),
  },

  {
    id: 'SESSION_CHANGE',
    name: '10. Đổi Phiên Dữ Liệu Mới (Session Reset)',
    description: 'Chuyển sang phiên ghi nhật ký mới SES-20261012-NEW, tự động dọn dẹp vệt và mục tiêu cũ.',
    tags: ['Session Reset', 'Info'],
    generatePacket: (tick) => ({
      schema_version: '1.0.0',
      session_id: 'SES-20261012-NEW',
      source_mode: 'MOCK',
      sequence_number: tick,
      pc_rx_time_iso: new Date().toISOString(),
      rx_age_ms: 50,
      is_stale: false,
      has_target: false,
      target: null,
      telemetry: {
        battery_pct: 100,
        lidar_range_cm: 300,
        gps_valid: true,
        lidar_valid: true,
        imu_valid: true,
        ai_detected: false,
        packet_rssi_dbm: -70,
        packet_snr_db: 12.0,
      },
      camera_position: {
        latitude: getBaseLat(),
        longitude: getBaseLon(),
        altitude_m: 30.0,
        heading_deg: 0,
        is_valid: true,
      },
      alert: {
        level: 'INFO',
        code: 'SESSION_INITIALIZED',
        message: 'Khởi tạo phiên mới SES-20261012-NEW thành công. Bắt đầu giám sát vùng mới.',
      },
      hardware_link: { status: 'CONNECTED', port: 'COM4' },
      diagnostics: {
        packets_received_total: tick,
        decode_errors_total: 0,
        ingress_drops_total: 0,
        data_loss_latched: false,
        logger_status: 'OK',
      },
    }),
  },

  {
    id: 'RECOVERY_AFTER_FAULT',
    name: '11. Phục Hồi Sau Sự Cố',
    description: 'Kênh truyền kết nối lại, GNSS khóa lại vệ tinh, tín hiệu ổn định.',
    tags: ['Recovery', 'Success'],
    generatePacket: (tick) => ({
      schema_version: '1.0.0',
      session_id: 'SES-MOCK-RECOVER-011',
      source_mode: 'MOCK',
      sequence_number: 800 + tick,
      pc_rx_time_iso: new Date().toISOString(),
      rx_age_ms: 70,
      is_stale: false,
      has_target: true,
      target: {
        track_id: 106,
        class_id: 2,
        class_name: 'lifebuoy',
        confidence: 96,
        target_confirmed: true,
        pos_valid: true,
        coordinate_frame: 'WGS84',
        local_x_cm: null,
        local_y_cm: null,
        latitude: getBaseLat() + 0.0008,
        longitude: getBaseLon() + 0.0006,
        origin_id: null,
      },
      telemetry: {
        battery_pct: 75,
        lidar_range_cm: 260,
        gps_valid: true,
        lidar_valid: true,
        imu_valid: true,
        ai_detected: true,
        packet_rssi_dbm: -78,
        packet_snr_db: 9.0,
      },
      camera_position: {
        latitude: getBaseLat() + 0.0005,
        longitude: getBaseLon() + 0.0004,
        altitude_m: 26.0,
        heading_deg: 180,
        is_valid: true,
      },
      alert: {
        level: 'INFO',
        code: 'SYSTEM_RESTORED',
        message: 'Khôi phục kết nối và GNSS fix thành công. Hệ thống hoạt động bình thường.',
      },
      hardware_link: { status: 'CONNECTED', port: 'COM4' },
      diagnostics: {
        packets_received_total: 800 + tick,
        decode_errors_total: 1,
        ingress_drops_total: 0,
        data_loss_latched: false,
        logger_status: 'OK',
      },
    }),
  },

  {
    id: 'MISSING_COORDINATES',
    name: '12. Thiếu Tọa Độ / Mục tiêu ngoài vùng đo',
    description: 'AI phát hiện đối tượng nhưng thuật toán định vị chưa giải được tọa độ (latitude/longitude null).',
    tags: ['Missing Coords', 'Edge Case'],
    generatePacket: (tick) => ({
      schema_version: '1.0.0',
      session_id: 'SES-MOCK-NOCOORD-012',
      source_mode: 'MOCK',
      sequence_number: 900 + tick,
      pc_rx_time_iso: new Date().toISOString(),
      rx_age_ms: 95,
      is_stale: false,
      has_target: true,
      target: {
        track_id: 107,
        class_id: 1,
        class_name: 'person',
        confidence: 85,
        target_confirmed: true,
        pos_valid: false, // Chưa có tọa độ
        coordinate_frame: 'WGS84',
        local_x_cm: null,
        local_y_cm: null,
        latitude: null,
        longitude: null,
        origin_id: null,
      },
      telemetry: {
        battery_pct: 80,
        lidar_range_cm: 270,
        gps_valid: true,
        lidar_valid: true,
        imu_valid: true,
        ai_detected: true,
        packet_rssi_dbm: -81,
        packet_snr_db: 7.2,
      },
      camera_position: {
        latitude: getBaseLat(),
        longitude: getBaseLon(),
        altitude_m: 25.0,
        heading_deg: 270,
        is_valid: true,
      },
      hardware_link: { status: 'CONNECTED', port: 'COM4' },
      diagnostics: {
        packets_received_total: 900 + tick,
        decode_errors_total: 0,
        ingress_drops_total: 0,
        data_loss_latched: false,
        logger_status: 'OK',
      },
    }),
  },
]
