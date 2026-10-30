import { APP_CONFIG } from '@/config/appConfig'

/** Nguồn ngưỡng stale duy nhất cho UI. Đọc từ APP_CONFIG (VITE_STALE_THRESHOLD_MS). */
export const STALE_MS = APP_CONFIG.STALE_THRESHOLD_MS

/** Ngưỡng chuyển màu amber (chỉ hiển thị, không phải stale). */
export const AMBER_AGE_MS = 1000

/** Tuổi dữ liệu (ms) vượt ngưỡng stale? Cờ stale do backend gửi luôn thắng. */
export function isAgeStale(rxAgeMs: number | null | undefined, isStaleFlag?: boolean): boolean {
  if (isStaleFlag) return true
  if (rxAgeMs === null || rxAgeMs === undefined) return false
  return rxAgeMs > STALE_MS
}

/** Số giây làm tròn lên, tối thiểu 1 — dùng cho nhãn ngưỡng. */
export function staleSeconds(thresholdMs: number = STALE_MS): number {
  if (!Number.isFinite(thresholdMs) || thresholdMs <= 0) return 1
  return Math.max(1, Math.ceil(thresholdMs / 1000))
}

/** Nhãn cảnh báo, tự đổi theo cấu hình. Với 3000 ms trả đúng 'DỮ LIỆU CŨ (>3s)'. */
export function staleLabel(thresholdMs: number = STALE_MS): string {
  return `DỮ LIỆU CŨ (>${staleSeconds(thresholdMs)}s)`
}

/** Dạng ngắn '>3s' cho bảng/cột hẹp. */
export function staleSecondsText(thresholdMs: number = STALE_MS): string {
  return `>${staleSeconds(thresholdMs)}s`
}
