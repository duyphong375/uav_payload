import { describe, expect, it } from 'vitest'
import { formatTargetAgeLabel } from '@/types/telemetry'

describe('Map2DView target freshness label', () => {
  it('phân biệt đúng biên 3000/3001ms và không gắn nhãn Vừa nhận cố định', () => {
    expect(formatTargetAgeLabel(3000, 3000)).toBe('Cập nhật: 3000 ms trước')
    expect(formatTargetAgeLabel(3001, 3000)).toBe('Dữ liệu cũ: 3001 ms trước')
    expect(formatTargetAgeLabel(undefined, 3000)).toBe('Tuổi dữ liệu mục tiêu: N/A')
    expect(formatTargetAgeLabel(0, 3000)).not.toContain('Vừa nhận')
  })
})
