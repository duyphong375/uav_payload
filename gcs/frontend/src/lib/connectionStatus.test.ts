import { describe, expect, it } from 'vitest'
import { getEsp32PhysicalStatus } from './connectionStatus'

describe('getEsp32PhysicalStatus', () => {
  it('returns MOCK status when source_mode is MOCK regardless of network state', () => {
    const res = getEsp32PhysicalStatus('MOCK', false, { status: 'UNKNOWN' }, false, 0)
    expect(res.status).toBe('MOCK')
    expect(res.shortLabel).toContain('MÔ PHỎNG')
  })

  it('returns REPLAY status when source_mode is REPLAY', () => {
    const res = getEsp32PhysicalStatus('REPLAY', true, { status: 'UNKNOWN' }, false, 0)
    expect(res.status).toBe('REPLAY')
    expect(res.shortLabel).toBe('REPLAY')
  })

  it('returns BACKEND_DOWN when source_mode is REAL but wsConnected is false', () => {
    const res = getEsp32PhysicalStatus('REAL', false, { status: 'UNKNOWN' }, false, 0)
    expect(res.status).toBe('BACKEND_DOWN')
    expect(res.shortLabel).toBe('MẤT KẾT NỐI')
    expect(res.label).toBe('BACKEND: MẤT KẾT NỐI')
    expect(res.badgeVariant).toBe('destructive')
  })

  it('returns WAITING when source_mode is REAL, wsConnected is true, but ESP32 has not connected', () => {
    const res = getEsp32PhysicalStatus('REAL', true, { status: 'UNKNOWN' }, true, 0)
    expect(res.status).toBe('WAITING')
    expect(res.shortLabel).toBe('CHƯA KẾT NỐI')
    expect(res.label).toBe('ESP32: CHƯA KẾT NỐI')
    expect(res.badgeVariant).toBe('destructive')
  })

  it('returns LIVE when source_mode is REAL, wsConnected is true, hardware is CONNECTED, and not stale', () => {
    const res = getEsp32PhysicalStatus('REAL', true, { status: 'CONNECTED', port: 'ESP32_WIFI' }, false, 80)
    expect(res.status).toBe('LIVE')
    expect(res.shortLabel).toBe('ĐÃ KẾT NỐI')
    expect(res.label).toBe('ESP32: ĐÃ KẾT NỐI')
    expect(res.badgeVariant).toBe('default')
  })

  it('returns LOST_SIGNAL when source_mode is REAL and packet is stale (>3000ms)', () => {
    const res = getEsp32PhysicalStatus('REAL', true, { status: 'CONNECTED', port: 'ESP32_WIFI' }, true, 3500)
    expect(res.status).toBe('LOST_SIGNAL')
    expect(res.shortLabel).toBe('CHỜ SÓNG RF')
    expect(res.label).toBe('GATEWAY: ĐÃ NỐI (CHỜ SÓNG RF)')
    expect(res.badgeVariant).toBe('outline')
  })
})
