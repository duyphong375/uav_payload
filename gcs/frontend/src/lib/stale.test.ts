import { describe, expect, it } from 'vitest'
import {
  AMBER_AGE_MS,
  STALE_MS,
  isAgeStale,
  staleLabel,
  staleSeconds,
  staleSecondsText,
} from './stale'

describe('stale threshold helper', () => {
  it('keeps the legacy label for the default 3000 ms threshold', () => {
    expect(staleLabel(3000)).toBe('DỮ LIỆU CŨ (>3s)')
  })

  it('derives the label from the configured threshold', () => {
    expect(staleLabel(5000)).toBe('DỮ LIỆU CŨ (>5s)')
    expect(staleLabel(1500)).toBe('DỮ LIỆU CŨ (>2s)')
  })

  it('exposes the short form used in compact columns', () => {
    expect(staleSecondsText(3000)).toBe('>3s')
    expect(staleSecondsText(5000)).toBe('>5s')
  })

  it('rounds partial seconds up so the label never understates the gate', () => {
    expect(staleSeconds(2500)).toBe(3)
    expect(staleSeconds(0)).toBe(1)
    expect(staleSeconds(-1)).toBe(1)
  })

  it('treats the boundary as not stale and the next millisecond as stale', () => {
    expect(isAgeStale(3000, false)).toBe(false)
    expect(isAgeStale(3001, false)).toBe(true)
    expect(isAgeStale(0, true)).toBe(true)
  })

  it('does not invent staleness when age is unknown', () => {
    expect(isAgeStale(undefined, false)).toBe(false)
    expect(isAgeStale(null, false)).toBe(false)
    expect(isAgeStale(undefined, true)).toBe(true)
  })

  it('keeps amber below the stale gate', () => {
    expect(AMBER_AGE_MS).toBe(1000)
    expect(AMBER_AGE_MS).toBeLessThan(STALE_MS)
  })
})
