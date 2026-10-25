import { isValidLatitude, isValidLongitude } from '@/services/telemetryAdapter'

/**
 * Định dạng tọa độ WGS-84 thành chuỗi hiển thị gọn (ví dụ: 15.892500° N, 108.065400° E).
 * Nếu tọa độ null/undefined trả về "—".
 */
export function formatCoordinates(lat: number | null | undefined, lon: number | null | undefined): string {
  if (!isValidLatitude(lat) || !isValidLongitude(lon)) {
    return '—'
  }

  const latDir = lat >= 0 ? 'N' : 'S'
  const lonDir = lon >= 0 ? 'E' : 'W'

  const latStr = Math.abs(lat).toFixed(6)
  const lonStr = Math.abs(lon).toFixed(6)

  return `${latStr}° ${latDir}, ${lonStr}° ${lonDir}`
}

/**
 * Tính khoảng cách cung lớn giữa hai điểm WGS-84 (công thức Haversine, đơn vị mét).
 */
export function calculateHaversineDistanceMeters(
  lat1: number,
  lon1: number,
  lat2: number,
  lon2: number
): number {
  const R = 6371000 // Bán kính trái đất (mét)
  const dLat = ((lat2 - lat1) * Math.PI) / 180
  const dLon = ((lon2 - lon1) * Math.PI) / 180

  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos((lat1 * Math.PI) / 180) *
      Math.cos((lat2 * Math.PI) / 180) *
      Math.sin(dLon / 2) *
      Math.sin(dLon / 2)

  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a))
  return Math.round(R * c)
}

/**
 * Định dạng thời gian trôi qua từ mốc timestamp ISO.
 */
export function formatTimeAgo(isoString: string | null | undefined, nowMs = Date.now()): string {
  if (!isoString) return 'Chưa có dữ liệu'

  const timeMs = new Date(isoString).getTime()
  if (Number.isNaN(timeMs)) return '—'

  const diffSec = Math.max(0, Math.floor((nowMs - timeMs) / 1000))
  if (diffSec < 2) return 'Vừa mới nhận'
  if (diffSec < 60) return `${diffSec} giây trước`
  const diffMin = Math.floor(diffSec / 60)
  return `${diffMin} phút trước`
}

/**
 * Định dạng độ cao GNSS kèm hệ quy chiếu tham chiếu (ELLIPSOID, MSL, UNKNOWN).
 */
export function formatAltitude(
  altM: number | null | undefined,
  ref: string = 'UNKNOWN'
): string {
  if (altM === null || altM === undefined || Number.isNaN(altM)) {
    return '—'
  }
  return `${altM.toFixed(1)} m (${ref})`
}

/**
 * Kiểm tra khả năng hỗ trợ WebGL của trình duyệt.
 */
export function checkWebGLSupport(): boolean {
  if (typeof window === 'undefined') return false
  try {
    const canvas = document.createElement('canvas')
    const gl =
      canvas.getContext('webgl') || canvas.getContext('experimental-webgl')
    return Boolean(gl && gl instanceof WebGLRenderingContext)
  } catch {
    return false
  }
}

/**
 * Xác định trạng thái địa hình 3D (Terrain).
 * Tuân thủ quy định KVC: Không tự nạp tile ngoài Internet chưa được phê duyệt.
 */
export function getTerrainStatus(
  configuredDemUrl?: string | null,
  isWebGLSupported = checkWebGLSupport()
): 'AVAILABLE' | 'UNAVAILABLE' | 'NOT_CONFIGURED' | 'WEBGL_UNSUPPORTED' {
  if (!isWebGLSupported) {
    return 'WEBGL_UNSUPPORTED'
  }
  if (!configuredDemUrl) {
    return 'NOT_CONFIGURED'
  }
  return 'AVAILABLE'
}
