import { describe, expect, it } from 'vitest'
import type { EventLogEntry } from '@/types/telemetry'
import { formatClock, groupByLocalDay, UNKNOWN_DAY_KEY, UNKNOWN_DAY_LABEL } from './eventLogTime'

const log = (overrides: Partial<EventLogEntry>): EventLogEntry => ({
  id: 'log-1',
  timestamp_iso: '2026-10-16T04:28:04.000Z',
  level: 'INFO',
  source: 'SYSTEM',
  code: 'GNSS_FIX_LOST',
  message: 'Mất khoá vệ tinh GNSS',
  session_id: 'SES-REAL-20261016-01',
  ...overrides,
})

/** Mốc ISO dựng bằng giờ địa phương để test không phụ thuộc múi giờ máy chạy. */
const localIso = (y: number, m: number, d: number, h = 10, min = 0) =>
  new Date(y, m - 1, d, h, min, 0).toISOString()

describe('groupByLocalDay', () => {
  const now = new Date(2026, 9, 30, 12, 0, 0)

  it('tách đúng 3 nhóm ngày và giữ thứ tự xuất hiện', () => {
    const groups = groupByLocalDay(
      [
        log({ id: 'today', timestamp_iso: localIso(2026, 10, 30, 9) }),
        log({ id: 'yesterday', timestamp_iso: localIso(2026, 10, 29, 8) }),
        log({ id: 'older', timestamp_iso: localIso(2026, 9, 1, 8) }),
      ],
      now
    )

    expect(groups).toHaveLength(3)
    expect(groups.map((g) => g.entries[0].id)).toEqual(['today', 'yesterday', 'older'])
  })

  it('nhóm Hôm nay đứng đầu và nhãn kèm ngày dd/mm/yyyy', () => {
    const groups = groupByLocalDay(
      [log({ id: 'today', timestamp_iso: localIso(2026, 10, 30, 7) })],
      now
    )

    expect(groups[0].key).toBe('2026-10-30')
    expect(groups[0].label).toBe('Hôm nay · 30/10/2026')
  })

  it('nhóm Hôm qua dùng nhãn riêng, không trùng Hôm nay', () => {
    const groups = groupByLocalDay(
      [log({ id: 'y', timestamp_iso: localIso(2026, 10, 29, 23) })],
      now
    )

    expect(groups[0].label).toBe('Hôm qua · 29/10/2026')
  })

  it('mốc thời gian hỏng rơi vào Không xác định, không bịa ngày', () => {
    const groups = groupByLocalDay(
      [
        log({ id: 'good', timestamp_iso: localIso(2026, 10, 30, 9) }),
        log({ id: 'bad', timestamp_iso: 'khong-phai-ngay' }),
      ],
      now
    )

    expect(groups).toHaveLength(2)
    expect(groups[1].key).toBe(UNKNOWN_DAY_KEY)
    expect(groups[1].label).toBe(UNKNOWN_DAY_LABEL)
    expect(groups[1].entries.map((e) => e.id)).toEqual(['bad'])
  })

  it('danh sách rỗng trả mảng rỗng', () => {
    expect(groupByLocalDay([], now)).toEqual([])
  })
})

describe('formatClock', () => {
  it('trả HH:MM:SS theo giờ địa phương', () => {
    expect(formatClock(localIso(2026, 10, 30, 7, 5))).toBe('07:05:00')
  })

  it('mốc hỏng trả N/A thay vì giờ hiện tại', () => {
    expect(formatClock('not-a-date')).toBe('N/A')
  })
})
