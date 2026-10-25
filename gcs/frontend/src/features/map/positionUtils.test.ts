import { describe, expect, it } from 'vitest'
import {
  calculateHaversineDistanceMeters,
  formatAltitude,
  formatCoordinates,
  formatTimeAgo,
  getTerrainStatus,
} from './positionUtils'

describe('positionUtils - Tiện ích tọa độ GPS', () => {
  it('định dạng đúng tọa độ WGS-84 với tọa độ 0.0 hợp lệ', () => {
    expect(formatCoordinates(0.0, 0.0)).toBe('0.000000° N, 0.000000° E')
    expect(formatCoordinates(15.8925, 108.0654)).toBe('15.892500° N, 108.065400° E')
    expect(formatCoordinates(-10.5, -50.25)).toBe('10.500000° S, 50.250000° W')
  })

  it('trả về — khi tọa độ null hoặc ngoài dải', () => {
    expect(formatCoordinates(null, 108.0)).toBe('—')
    expect(formatCoordinates(15.0, null)).toBe('—')
    expect(formatCoordinates(95.0, 108.0)).toBe('—')
  })

  it('tính khoảng cách Haversine chính xác', () => {
    // Khoảng cách giữa 2 điểm cách nhau ~111km theo vĩ độ
    const dist = calculateHaversineDistanceMeters(0, 0, 1, 0)
    expect(dist).toBeGreaterThan(110000)
    expect(dist).toBeLessThan(112000)
  })

  it('định dạng thời gian trôi qua formatTimeAgo', () => {
    const now = Date.now()
    expect(formatTimeAgo(new Date(now - 1000).toISOString(), now)).toBe('Vừa mới nhận')
    expect(formatTimeAgo(new Date(now - 15000).toISOString(), now)).toBe('15 giây trước')
    expect(formatTimeAgo(new Date(now - 120000).toISOString(), now)).toBe('2 phút trước')
    expect(formatTimeAgo(null, now)).toBe('Chưa có dữ liệu')
  })

  it('định dạng độ cao GNSS kèm hệ quy chiếu tham chiếu formatAltitude', () => {
    expect(formatAltitude(120.45, 'ELLIPSOID')).toBe('120.5 m (ELLIPSOID)')
    expect(formatAltitude(45.0, 'MSL')).toBe('45.0 m (MSL)')
    expect(formatAltitude(50.2, 'UNKNOWN')).toBe('50.2 m (UNKNOWN)')
    expect(formatAltitude(null, 'UNKNOWN')).toBe('—')
    expect(formatAltitude(undefined, 'UNKNOWN')).toBe('—')
  })

  it('xác định trạng thái địa hình 3D getTerrainStatus', () => {
    // 1. Khi WebGL không hỗ trợ
    expect(getTerrainStatus(null, false)).toBe('WEBGL_UNSUPPORTED')
    expect(getTerrainStatus('https://internal.tile.local/terrain.png', false)).toBe('WEBGL_UNSUPPORTED')

    // 2. Khi WebGL hỗ trợ nhưng chưa cấu hình DEM URL -> NOT_CONFIGURED (tuân thủ KVC)
    expect(getTerrainStatus(null, true)).toBe('NOT_CONFIGURED')
    expect(getTerrainStatus(undefined, true)).toBe('NOT_CONFIGURED')

    // 3. Khi WebGL hỗ trợ và đã có DEM URL -> AVAILABLE
    expect(getTerrainStatus('https://internal.tile.local/terrain.png', true)).toBe('AVAILABLE')
  })
})
