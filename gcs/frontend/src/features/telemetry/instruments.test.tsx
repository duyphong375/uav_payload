import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { TooltipProvider } from '@/components/ui/tooltip'
import { APP_CONFIG } from '@/config/appConfig'
import { OrientationCluster } from './OrientationCluster'
import { SensorFlagsInspector } from './SensorFlagsInspector'
import { WaterClearanceGauge } from './WaterClearanceGauge'

const wrap = (node: React.ReactNode) => render(<TooltipProvider>{node}</TooltipProvider>)

describe('WaterClearanceGauge', () => {
  it('hiện số mét khi cảm biến hợp lệ và dữ liệu mới', () => {
    wrap(<WaterClearanceGauge rangeCm={285} valid stale={false} />)

    expect(screen.getByText('2.85')).toBeDefined()
    expect(screen.getByText('Còn 285 cm tới mặt nước')).toBeDefined()
    expect(screen.getByText('AN TOÀN')).toBeDefined()
  })

  it('cảnh báo nguy hiểm khi dưới ngưỡng 2.0 m', () => {
    wrap(<WaterClearanceGauge rangeCm={150} valid stale={false} />)

    expect(screen.getByText('NGUY HIỂM')).toBeDefined()
    expect(APP_CONFIG.LIDAR_DANGER_M).toBe(2.0)
  })

  it('không bịa số khi cờ cảm biến không hợp lệ', () => {
    wrap(<WaterClearanceGauge rangeCm={null} valid={false} stale={false} />)

    expect(screen.getByText('CHỜ ĐO')).toBeDefined()
    expect(screen.getByText('N/A')).toBeDefined()
    expect(screen.getByText('Cảm biến chưa báo hợp lệ')).toBeDefined()
  })

  it('không hiện số cũ khi dữ liệu stale', () => {
    wrap(<WaterClearanceGauge rangeCm={285} valid stale />)

    expect(screen.getByText('CHỜ ĐO')).toBeDefined()
    expect(screen.queryByText('2.85')).toBeNull()
    expect(screen.getByText('Dữ liệu cũ — đang chờ gói mới')).toBeDefined()
  })
})

describe('OrientationCluster', () => {
  it('hiện hướng và roll/pitch khi IMU hợp lệ', () => {
    wrap(
      <OrientationCluster headingDeg={127} rollDeg={4.2} pitchDeg={-3.6} imuValid stale={false} />
    )

    expect(screen.getAllByText('127°').length).toBeGreaterThanOrEqual(1)
    // Roll và pitch gộp một ô để tiết kiệm chiều cao trong dock
    expect(screen.getByText('4° / -4°')).toBeDefined()
    expect(screen.getByText('IMU hợp lệ')).toBeDefined()
  })

  it('heading null hiện N/A, không mặc định 0', () => {
    wrap(<OrientationCluster headingDeg={null} rollDeg={null} pitchDeg={null} imuValid stale={false} />)

    // Hai ô hiển thị: la bàn (Hướng) và Roll/Pitch — đều N/A khi thiếu dữ liệu
    expect(screen.getAllByText('N/A').length).toBe(2)
    expect(screen.queryByText('0°')).toBeNull()
  })

  it('IMU không hợp lệ thì che toàn bộ số, kể cả khi có giá trị', () => {
    wrap(
      <OrientationCluster headingDeg={90} rollDeg={5} pitchDeg={2} imuValid={false} stale={false} />
    )

    expect(screen.queryByText('90°')).toBeNull()
    expect(screen.getByText('Chờ IMU')).toBeDefined()
  })
})

describe('SensorFlagsInspector', () => {
  it('dựng HEX từ các bit đang bật', () => {
    wrap(
      <SensorFlagsInspector
        gpsValid
        lidarValid
        imuValid
        aiDetected
        sequenceNumber={142}
      />
    )

    expect(screen.getByText('0x0F')).toBeDefined()
    expect(screen.getByText('PKT #142')).toBeDefined()
  })

  it('HEX đúng khi chỉ bật bit 0 và bit 3', () => {
    wrap(
      <SensorFlagsInspector
        gpsValid
        lidarValid={false}
        imuValid={false}
        aiDetected
        sequenceNumber={null}
      />
    )

    expect(screen.getByText('0x09')).toBeDefined()
    expect(screen.getByText('PKT #N/A')).toBeDefined()
  })

  it('tất cả tắt thì HEX là 0x00', () => {
    wrap(
      <SensorFlagsInspector
        gpsValid={false}
        lidarValid={false}
        imuValid={false}
        aiDetected={false}
        sequenceNumber={7}
      />
    )

    expect(screen.getByText('0x00')).toBeDefined()
  })
})
