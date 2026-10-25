import { describe, expect, it } from 'vitest'
import {
  adaptTelemetryPacket,
  isValidLatitude,
  isValidLongitude,
  parsePayloadTelemetry,
  parseTargetInfo,
} from './telemetryAdapter'

describe('telemetryAdapter - Kiểm tra hợp đồng dữ liệu KVC-GCS-CONTRACT-001', () => {
  it('chấp nhận tọa độ 0.0 là hợp lệ trên cả vĩ độ và kinh độ', () => {
    expect(isValidLatitude(0)).toBe(true)
    expect(isValidLongitude(0)).toBe(true)
    expect(isValidLatitude(0.0)).toBe(true)
    expect(isValidLongitude(0.0)).toBe(true)

    const target = parseTargetInfo(
      {
        track_id: 1,
        pos_valid: true,
        coordinate_frame: 'WGS84',
        latitude: 0.0,
        longitude: 0.0,
      },
      true // gps_valid = true
    )

    expect(target).not.toBeNull()
    expect(target?.latitude).toBe(0.0)
    expect(target?.longitude).toBe(0.0)
  })

  it('loại bỏ tọa độ ngoài giới hạn WGS-84 hoặc sai kiểu', () => {
    expect(isValidLatitude(91.0)).toBe(false)
    expect(isValidLatitude(-91.0)).toBe(false)
    expect(isValidLongitude(181.0)).toBe(false)
    expect(isValidLongitude(-181.0)).toBe(false)
    expect(isValidLatitude('16.05')).toBe(false)
    expect(isValidLatitude(NaN)).toBe(false)
    expect(isValidLatitude(null)).toBe(false)
  })

  it('xử lý đúng Sentinel của pin (255 -> null) và LiDAR (65535 -> null)', () => {
    const telem = parsePayloadTelemetry({
      battery_pct: 255,
      lidar_range_cm: 65535,
      lidar_valid: true,
      packet_rssi_dbm: -128,
    })

    expect(telem).not.toBeNull()
    expect(telem?.battery_pct).toBeNull()
    expect(telem?.lidar_range_cm).toBeNull()
    expect(telem?.packet_rssi_dbm).toBeNull()
  })

  it('không xuất LiDAR range khi lidar_valid = false dù có số', () => {
    const telem = parsePayloadTelemetry({
      lidar_range_cm: 250,
      lidar_valid: false,
    })
    expect(telem).not.toBeNull()
    expect(telem?.lidar_range_cm).toBeNull()
  })

  it('tách biệt tuyệt đối giữa Sa bàn LOCAL_GRID và WGS84, không sao chép XY vào Lat/Lon', () => {
    const localTarget = parseTargetInfo(
      {
        track_id: 101,
        pos_valid: true,
        coordinate_frame: 'LOCAL_GRID',
        local_x_cm: 125.4,
        local_y_cm: -45.2,
        latitude: 16.05,
        longitude: 108.2,
      },
      false
    )

    expect(localTarget).not.toBeNull()
    expect(localTarget?.coordinate_frame).toBe('LOCAL_GRID')
    expect(localTarget?.local_x_cm).toBe(125.4)
    expect(localTarget?.local_y_cm).toBe(-45.2)
    // Khi frame là LOCAL_GRID hoặc gps_valid=false, lat/lon phải là null
    expect(localTarget?.latitude).toBeNull()
    expect(localTarget?.longitude).toBeNull()
  })

  it('xử lý đúng cờ STALE khi rx_age_ms > 3000ms', () => {
    const packet = adaptTelemetryPacket({
      event_type: 'LINK_STATUS',
      source_mode: 'REAL',
      session_id: 'SES-01',
      rx_age_ms: 3500,
      telemetry: { battery_pct: 80, gps_valid: true },
    })

    expect(packet).not.toBeNull()
    expect(packet?.rx_age_ms).toBe(3500)
    expect(packet?.is_stale).toBe(true)
  })

  it('phân biệt hai tầng kết nối: WebSocket mở nhưng phần cứng DISCONNECTED', () => {
    const packet = adaptTelemetryPacket({
      event_type: 'LINK_STATUS',
      source_mode: 'REAL',
      hardware_link: {
        status: 'DISCONNECTED',
        port: 'COM3',
        error_message: 'Serial device unmounted',
      },
    })

    expect(packet?.hardware_link?.status).toBe('DISCONNECTED')
    expect(packet?.hardware_link?.port).toBe('COM3')
  })

  it('từ chối packet thiếu/sai source_mode hoặc event_type thay vì mặc định MOCK', () => {
    expect(adaptTelemetryPacket({})).toBeNull()
    expect(adaptTelemetryPacket({ event_type: 'SNAPSHOT', source_mode: 'UNKNOWN' })).toBeNull()
    expect(adaptTelemetryPacket({ event_type: 'UNKNOWN', source_mode: 'REAL' })).toBeNull()
  })

  it.each(['false', '0', [], {}])('từ chối boolean sai schema: %j', (invalidBoolean) => {
    expect(parsePayloadTelemetry({ gps_valid: invalidBoolean })).toBeNull()
    expect(
      adaptTelemetryPacket({
        event_type: 'TARGET_UPDATE',
        source_mode: 'REAL',
        has_target: true,
        target: {
          track_id: 7,
          pos_valid: invalidBoolean,
          coordinate_frame: 'WGS84',
          latitude: 0,
          longitude: 0,
        },
      })
    ).toBeNull()
  })

  it('giữ false strict khác chuỗi false và giữ tọa độ WGS-84 (0,0) hợp lệ', () => {
    const falseTelemetry = parsePayloadTelemetry({ gps_valid: false, ai_detected: false })
    expect(falseTelemetry?.gps_valid).toBe(false)
    expect(falseTelemetry?.ai_detected).toBe(false)

    const packet = adaptTelemetryPacket({
      event_type: 'TARGET_UPDATE',
      source_mode: 'REAL',
      has_target: true,
      target: {
        track_id: 8,
        pos_valid: true,
        target_confirmed: false,
        coordinate_frame: 'WGS84',
        latitude: 0,
        longitude: 0,
      },
    })

    expect(packet?.target).toMatchObject({
      pos_valid: true,
      target_confirmed: false,
      latitude: 0,
      longitude: 0,
    })
  })

  it('LINK_STATUS chỉ materialize domain link, không tạo default target/telemetry', () => {
    const packet = adaptTelemetryPacket({
      event_type: 'LINK_STATUS',
      source_mode: 'REAL',
      rx_age_ms: 1200,
      is_stale: false,
      hardware_link: { status: 'CONNECTED' },
      has_target: false,
      target: null,
      telemetry: { battery_pct: 0, gps_valid: false },
    })

    expect(packet?.hardware_link).toEqual({ status: 'CONNECTED' })
    expect(packet?.target).toBeUndefined()
    expect(packet?.has_target).toBeUndefined()
    expect(packet?.telemetry).toBeUndefined()
  })

  it('giải mã chính xác góc nghiêng Roll và Pitch của IMU, reset khi imu_valid = false', () => {
    const telemValid = parsePayloadTelemetry({
      imu_valid: true,
      roll_deg: 15.2,
      pitch_deg: -3.5,
    })
    expect(telemValid).not.toBeNull()
    expect(telemValid?.imu_valid).toBe(true)
    expect(telemValid?.roll_deg).toBe(15.2)
    expect(telemValid?.pitch_deg).toBe(-3.5)

    const telemInvalid = parsePayloadTelemetry({
      imu_valid: false,
      roll_deg: 15.2,
      pitch_deg: -3.5,
    })
    expect(telemInvalid).not.toBeNull()
    expect(telemInvalid?.imu_valid).toBe(false)
    expect(telemInvalid?.roll_deg).toBeNull()
    expect(telemInvalid?.pitch_deg).toBeNull()
  })
})
