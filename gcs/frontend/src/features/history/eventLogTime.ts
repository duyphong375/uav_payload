import type { EventLogEntry } from '@/types/telemetry'

/** Nhóm nhật ký theo một ngày lịch địa phương. */
export interface DayGroup {
  key: string
  label: string
  entries: EventLogEntry[]
}

export const UNKNOWN_DAY_KEY = 'unknown'
export const UNKNOWN_DAY_LABEL = 'Không xác định'

const pad2 = (value: number) => String(value).padStart(2, '0')

/** HH:MM:SS của mốc ISO; trả N/A khi mốc không hợp lệ thay vì bịa giờ hiện tại. */
export function formatClock(timestampIso: string): string {
  const date = new Date(timestampIso)
  if (Number.isNaN(date.getTime())) return 'N/A'
  return `${pad2(date.getHours())}:${pad2(date.getMinutes())}:${pad2(date.getSeconds())}`
}

/** dd/mm/yyyy theo giờ địa phương. */
const formatDay = (date: Date) =>
  `${pad2(date.getDate())}/${pad2(date.getMonth() + 1)}/${date.getFullYear()}`

/** Khoá ngày lịch địa phương. */
const localDayKey = (date: Date) =>
  `${date.getFullYear()}-${pad2(date.getMonth() + 1)}-${pad2(date.getDate())}`

/**
 * Nhóm nhật ký theo ngày lịch địa phương của trình duyệt (quyết định D6).
 * Giữ thứ tự xuất hiện: nhóm của dòng đầu tiên đứng trước, nên "Hôm nay"
 * tự nhiên đứng đầu khi event_logs mới nhất trước.
 */
export function groupByLocalDay(entries: EventLogEntry[], now: Date = new Date()): DayGroup[] {
  const today = localDayKey(now)
  const yesterday = localDayKey(new Date(now.getFullYear(), now.getMonth(), now.getDate() - 1))

  const groups: DayGroup[] = []
  const index = new Map<string, DayGroup>()

  for (const entry of entries) {
    const date = new Date(entry.timestamp_iso)
    const valid = !Number.isNaN(date.getTime())
    const key = valid ? localDayKey(date) : UNKNOWN_DAY_KEY
    const label = !valid
      ? UNKNOWN_DAY_LABEL
      : key === today
        ? `Hôm nay · ${formatDay(date)}`
        : key === yesterday
          ? `Hôm qua · ${formatDay(date)}`
          : formatDay(date)

    let group = index.get(key)
    if (!group) {
      group = { key, label, entries: [] }
      index.set(key, group)
      groups.push(group)
    }
    group.entries.push(entry)
  }

  return groups
}
