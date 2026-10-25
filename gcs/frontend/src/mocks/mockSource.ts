import {
  getMockBaseCoordinates,
  resetMockBaseCoordinates,
  setMockBaseCoordinates,
  MOCK_SCENARIOS,
  type MockScenarioConfig,
} from './scenarios'
import type { RawTelemetryPacket } from '@/types/telemetry'

export type MockPacketListener = (packet: RawTelemetryPacket) => void

export class MockSourceService {
  private scenario: MockScenarioConfig
  private tickIndex = 0
  private intervalId: ReturnType<typeof setInterval> | null = null
  private listeners: Set<MockPacketListener> = new Set()
  private intervalMs = 1000
  private isRunning = false

  constructor(initialScenarioId = 'NORMAL_GPS_TARGET') {
    this.scenario = MOCK_SCENARIOS.find((s) => s.id === initialScenarioId) || MOCK_SCENARIOS[0]
  }

  public getScenario(): MockScenarioConfig {
    return this.scenario
  }

  public setScenario(scenarioId: string): void {
    const found = MOCK_SCENARIOS.find((s) => s.id === scenarioId)
    if (found) {
      this.scenario = found
      this.tickIndex = 0
      // Phát ngay gói đầu tiên của kịch bản mới
      if (this.isRunning) {
        this.emitNext()
      }
    }
  }

  public setBaseLocation(lat: number, lon: number): void {
    setMockBaseCoordinates(lat, lon)
    if (this.isRunning) {
      this.emitNext()
    }
  }

  public resetBaseLocation(): void {
    resetMockBaseCoordinates()
    if (this.isRunning) {
      this.emitNext()
    }
  }

  public getBaseLocation(): { lat: number; lon: number; isCustom: boolean } {
    return getMockBaseCoordinates()
  }

  public subscribe(listener: MockPacketListener): () => void {
    this.listeners.add(listener)
    // Nếu đang chạy thì phát ngay cho subscriber mới
    if (this.isRunning) {
      const packet = this.scenario.generatePacket(this.tickIndex)
      listener(packet)
    }
    return () => {
      this.listeners.delete(listener)
    }
  }

  public start(intervalMs = 1000): void {
    if (this.isRunning) return
    this.intervalMs = intervalMs
    this.isRunning = true
    this.emitNext()
    this.intervalId = setInterval(() => {
      this.tickIndex++
      this.emitNext()
    }, this.intervalMs)
  }

  public stop(): void {
    if (this.intervalId) {
      clearInterval(this.intervalId)
      this.intervalId = null
    }
    this.isRunning = false
  }

  public emitNext(): void {
    const packet = this.scenario.generatePacket(this.tickIndex)
    for (const listener of this.listeners) {
      try {
        listener(packet)
      } catch (err) {
        console.error('[MockSourceService] Lỗi phát packet tới listener:', err)
      }
    }
  }
}

export const mockSourceInstance = new MockSourceService()
