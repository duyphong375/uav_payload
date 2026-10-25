import { act, fireEvent, render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { TooltipProvider } from '@/components/ui/tooltip'
import { MockLocationControl } from './MockLocationControl'
import { mockSourceInstance } from '@/mocks/mockSource'

describe('MockLocationControl - Điều khiển vị trí GPS MOCK', () => {
  it('hiển thị nút Lấy GPS Tôi khi chưa dùng vị trí tùy chỉnh', () => {
    mockSourceInstance.resetBaseLocation()
    render(
      <TooltipProvider>
        <MockLocationControl />
      </TooltipProvider>
    )

    expect(screen.getByText('Lấy GPS Tôi')).toBeDefined()
  })

  it('gọi hàm cập nhật khi lấy vị trí thành công', async () => {
    mockSourceInstance.resetBaseLocation()
    const handleUpdated = vi.fn()

    // Mock geolocation
    const mockGeolocation = {
      getCurrentPosition: vi.fn((success) => {
        success({
          coords: {
            latitude: 21.0285,
            longitude: 105.8542,
          },
        })
      }),
    }
    vi.stubGlobal('navigator', { geolocation: mockGeolocation })

    render(
      <TooltipProvider>
        <MockLocationControl onLocationUpdated={handleUpdated} />
      </TooltipProvider>
    )

    const btn = screen.getByRole('button', { name: /Lấy định vị GPS thiết bị hiện tại/i })
    await act(async () => {
      fireEvent.click(btn)
    })

    expect(mockGeolocation.getCurrentPosition).toHaveBeenCalled()
    expect(mockSourceInstance.getBaseLocation().isCustom).toBe(true)
    expect(mockSourceInstance.getBaseLocation().lat).toBe(21.0285)

    // Khôi phục
    mockSourceInstance.resetBaseLocation()
    vi.unstubAllGlobals()
  })
})
