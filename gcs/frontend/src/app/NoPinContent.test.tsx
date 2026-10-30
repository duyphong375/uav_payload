import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { TooltipProvider } from '@/components/ui/tooltip'
import { AppRouterProvider } from '@/app/routes'
import { MissionProvider } from '@/state/MissionProvider'
import { AlertsPage } from '@/features/alerts/AlertsPage'
import { OverviewPage } from '@/features/overview/OverviewPage'
import { SettingsPage } from '@/features/settings/SettingsPage'
import { DevicesPage } from '@/features/devices/DevicesPage'

const renderPage = (page: React.ReactNode) =>
  render(
    <TooltipProvider>
      <MissionProvider>
        <AppRouterProvider>{page}</AppRouterProvider>
      </MissionProvider>
    </TooltipProvider>
  )

const forbiddenBatteryPatterns = [
  /3S LiPo/i,
  /4S LiPo/i,
  /11\.1\s*V/i,
  /12\.6\s*V/i,
  /Điện áp danh định/i,
  /dung lượng pin/i,
  /Pin tải:/i,
  /Nguồn Pin UAV/i,
]

describe('Không còn hiển thị chỉ số pin trên UI (KVC không đo pin tải)', () => {
  it('AlertsPage không còn nhắc pin trong tooltip hay nội dung', () => {
    const { container } = renderPage(<AlertsPage />)
    expect(screen.queryByLabelText(/Mức pin tải/i)).toBeNull()
    for (const pattern of forbiddenBatteryPatterns) {
      expect(container.textContent ?? '').not.toMatch(pattern)
    }
    expect(document.querySelector('[aria-label*="mức pin tải" i]')).toBeNull()
    expect(document.querySelector('[aria-label*="pin yếu" i]')).toBeNull()
  })

  it('OverviewPage không còn chỉ số pin', () => {
    const { container } = renderPage(<OverviewPage />)
    expect(screen.queryByLabelText(/Mức pin tải/i)).toBeNull()
    for (const pattern of forbiddenBatteryPatterns) {
      expect(container.textContent ?? '').not.toMatch(pattern)
    }
  })

  it('SettingsPage không còn chỉ số pin', () => {
    const { container } = renderPage(<SettingsPage />)
    for (const pattern of forbiddenBatteryPatterns) {
      expect(container.textContent ?? '').not.toMatch(pattern)
    }
  })

  it('DevicesPage không còn chỉ số pin', () => {
    const { container } = renderPage(<DevicesPage />)
    for (const pattern of forbiddenBatteryPatterns) {
      expect(container.textContent ?? '').not.toMatch(pattern)
    }
  })

  it('không còn tooltip ghi mức pin tải hoặc pin yếu', () => {
    renderPage(<AlertsPage />)
    expect(document.querySelector('[aria-label*="Chú thích:"]')?.getAttribute('aria-label') ?? '').not.toMatch(
      /mức pin tải|pin yếu/i
    )
  })
})
