import { describe, expect, it } from 'vitest'
import {
  COMPACT_HEIGHT_PX,
  TIGHT_HEIGHT_PX,
  currentHeightTier,
  heightTierOf,
} from '@/lib/viewport'

describe('viewport height tiers', () => {
  it('xếp màn hình cao bình thường vào tier regular', () => {
    expect(heightTierOf(1080)).toBe('regular')
    expect(heightTierOf(COMPACT_HEIGHT_PX)).toBe('regular')
  })

  it('màn hình 1366×640 (laptop có thanh trình duyệt) là tier compact', () => {
    expect(heightTierOf(768)).toBe('regular')
    expect(heightTierOf(COMPACT_HEIGHT_PX - 1)).toBe('compact')
    expect(heightTierOf(TIGHT_HEIGHT_PX)).toBe('compact')
  })

  it('màn hình rất thấp là tier tight và phải hẹp hơn compact', () => {
    expect(heightTierOf(TIGHT_HEIGHT_PX - 1)).toBe('tight')
    expect(heightTierOf(640)).toBe('tight')
    expect(TIGHT_HEIGHT_PX).toBeLessThan(COMPACT_HEIGHT_PX)
  })

  it('không có window (SSR/test) thì mặc định regular, không đoán bừa', () => {
    expect(typeof window).toBe('object')
    expect(['regular', 'compact', 'tight']).toContain(currentHeightTier())
  })
})
