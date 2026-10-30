import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { TooltipProvider } from '@/components/ui/tooltip'
import { APP_CONFIG } from '@/config/appConfig'
import { SettingsPage } from '@/features/settings/SettingsPage'
import { MissionProvider } from '@/state/MissionProvider'
import { AppRouterProvider } from '@/app/routes'

vi.mock('sonner', () => ({
  toast: {
    success: vi.fn(),
    error: vi.fn(),
    info: vi.fn(),
  },
}))

const renderSettings = () =>
  render(
    <TooltipProvider>
      <MissionProvider>
        <AppRouterProvider>
          <SettingsPage />
        </AppRouterProvider>
      </MissionProvider>
    </TooltipProvider>
  )

describe('SettingsPage – WebSocket URL phải được áp dụng thật', () => {
  it('áp dụng URL hợp lệ và hiển thị địa chỉ đang dùng', async () => {
    const { toast } = await import('sonner')
    const nextUrl = 'ws://192.168.1.50:8080/telemetry'
    renderSettings()

    const input = screen.getByPlaceholderText('ws://localhost:8000/ws/telemetry')
    fireEvent.change(input, { target: { value: nextUrl } })
    fireEvent.click(screen.getByRole('button', { name: /Áp dụng/i }))

    await waitFor(() => {
      expect(localStorage.getItem(APP_CONFIG.STORAGE_KEYS.WS_URL)).toBe(nextUrl)
    })
    expect(toast.error).not.toHaveBeenCalled()
    expect(screen.getByText(nextUrl)).toBeDefined()
  })

  it('từ chối URL sai scheme và không lưu', async () => {
    const { toast } = await import('sonner')
    localStorage.removeItem(APP_CONFIG.STORAGE_KEYS.WS_URL)
    renderSettings()

    const input = screen.getByPlaceholderText('ws://localhost:8000/ws/telemetry')
    fireEvent.change(input, { target: { value: 'http://example.com' } })
    fireEvent.click(screen.getByRole('button', { name: /Áp dụng/i }))

    await waitFor(() => {
      expect(toast.error).toHaveBeenCalled()
    })
    expect(localStorage.getItem(APP_CONFIG.STORAGE_KEYS.WS_URL)).toBeNull()
    expect(screen.getByText(/phải bắt đầu bằng ws:\/\/ hoặc wss:\/\//i)).toBeDefined()
  })

  it('khôi phục địa chỉ mặc định', async () => {
    localStorage.setItem(APP_CONFIG.STORAGE_KEYS.WS_URL, 'ws://10.0.0.9:9000/telemetry')
    renderSettings()

    fireEvent.click(screen.getByRole('button', { name: /^Mặc định$/i }))

    await waitFor(() => {
      expect(localStorage.getItem(APP_CONFIG.STORAGE_KEYS.WS_URL)).toBe(APP_CONFIG.WS_URL)
    })
  })
})
