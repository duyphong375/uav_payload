import { fireEvent, render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { TooltipProvider } from '@/components/ui/tooltip'
import { AlertsPage } from '@/features/alerts/AlertsPage'
import { DevicesPage } from '@/features/devices/DevicesPage'
import { EventLogPage } from '@/features/history/EventLogPage'
import { OverviewPage } from '@/features/overview/OverviewPage'
import { SettingsPage } from '@/features/settings/SettingsPage'
import { MissionProvider } from '@/state/MissionProvider'
import { AppRouterProvider } from './routes'
import { ModeContextBar } from './ModeContextBar'

// Mock clipboard
Object.assign(navigator, {
  clipboard: {
    writeText: vi.fn().mockImplementation(() => Promise.resolve()),
  },
})

describe('KVC-GCS UI Redesign & Rescue Value Chain Verification', () => {
  it('đảm bảo tất cả 5 trang chính có tiêu đề và mô tả riêng biệt, không trùng lặp', () => {
    // 1. Overview Page
    const { unmount: unmountOverview } = render(
      <TooltipProvider>
        <MissionProvider>
          <AppRouterProvider>
            <OverviewPage />
          </AppRouterProvider>
        </MissionProvider>
      </TooltipProvider>
    )
    expect(screen.getByText('Tổng quan nhiệm vụ tìm kiếm cứu nạn')).toBeDefined()
    expect(
      screen.getByText('Bảng theo dõi chuỗi giá trị cứu nạn: Phát hiện → Định vị → Theo dõi → Cảnh báo → Bằng chứng.')
    ).toBeDefined()
    unmountOverview()

    // 2. Alerts Page
    const { unmount: unmountAlerts } = render(
      <TooltipProvider>
        <MissionProvider>
          <AppRouterProvider>
            <AlertsPage />
          </AppRouterProvider>
        </MissionProvider>
      </TooltipProvider>
    )
    expect(screen.getByText('Trung tâm cảnh báo kỹ thuật')).toBeDefined()
    expect(
      screen.getByText('Tiếp nhận, phân loại và xử lý các sự cố an toàn tải nhiệm vụ, cảm biến và kênh truyền.')
    ).toBeDefined()
    unmountAlerts()

    // 3. Event Log Page
    const { unmount: unmountHistory } = render(
      <TooltipProvider>
        <MissionProvider>
          <AppRouterProvider>
            <EventLogPage />
          </AppRouterProvider>
        </MissionProvider>
      </TooltipProvider>
    )
    expect(screen.getByText('Nhật ký phiên & Bằng chứng cứu hộ')).toBeDefined()
    expect(screen.getByText(/Lưu trữ chuỗi sự kiện hoạt động/i)).toBeDefined()
    unmountHistory()

    // 4. Devices Page
    const { unmount: unmountDevices } = render(
      <TooltipProvider>
        <MissionProvider>
          <AppRouterProvider>
            <DevicesPage />
          </AppRouterProvider>
        </MissionProvider>
      </TooltipProvider>
    )
    expect(screen.getByText('Thiết bị & kết nối phần cứng')).toBeDefined()
    expect(
      screen.getByText('Theo dõi tình trạng liên kết truyền thông, cụm cảm biến và thiết bị suy luận AI trên trạm giám sát GCS.')
    ).toBeDefined()
    unmountDevices()

    // 5. Settings Page
    const { unmount: unmountSettings } = render(
      <TooltipProvider>
        <MissionProvider>
          <AppRouterProvider>
            <SettingsPage />
          </AppRouterProvider>
        </MissionProvider>
      </TooltipProvider>
    )
    expect(screen.getByText('Cài đặt giao diện & Tham số GCS')).toBeDefined()
    expect(
      screen.getByText('Tùy biến hiển thị chiến thuật, bố cục trạm điều khiển và cấu hình kết nối mạng mặt đất.')
    ).toBeDefined()
    unmountSettings()
  })

  it('thực hiện kịch bản trình diễn cứu hộ 3 nhấp chuột (3-click rescue demo scenario)', async () => {
    render(
      <TooltipProvider>
        <MissionProvider>
          <AppRouterProvider>
            <ModeContextBar />
            <OverviewPage />
          </AppRouterProvider>
        </MissionProvider>
      </TooltipProvider>
    )

    // NHẤP 1: Kích hoạt nhanh kịch bản diễn tập cứu nạn qua nút "▶ Diễn tập cứu nạn"
    const demoButton = screen.getByRole('button', { name: /Diễn tập cứu nạn/i })
    expect(demoButton).toBeDefined()
    fireEvent.click(demoButton)

    // NHẤP 2: Sao chép tọa độ WGS-84 mục tiêu cứu nạn từ bảng danh sách
    const copyButtons = screen.getAllByRole('button', { name: /Sao chép WGS-84/i })
    expect(copyButtons.length).toBeGreaterThan(0)
    fireEvent.click(copyButtons[0])
    expect(navigator.clipboard.writeText).toHaveBeenCalled()

    // NHẤP 3: Điều hướng sang trang nhật ký / bằng chứng cứu hộ
    const logNavButton = screen.getByRole('button', { name: /Xem log/i })
    expect(logNavButton).toBeDefined()
    fireEvent.click(logNavButton)
  })

  it('không chứa bất kỳ phát ngôn nào vi phạm nguyên tắc kỹ thuật (không có "28 FPS" giả mạo)', () => {
    const { container } = render(
      <TooltipProvider>
        <MissionProvider>
          <AppRouterProvider>
            <OverviewPage />
          </AppRouterProvider>
        </MissionProvider>
      </TooltipProvider>
    )

    // Đảm bảo không còn số liệu FPS/INT8 bịa đặt
    expect(container.textContent).not.toContain('28 FPS')
    expect(container.textContent).not.toContain('TensorRT Sẵn sàng')
    expect(container.textContent).not.toContain('đã chứng minh')
    expect(container.textContent).not.toContain('NEO-M9N')
    expect(container.textContent).not.toContain('FLIR')
    expect(container.textContent).not.toContain('4S LiPo')
    expect(container.textContent).not.toContain('HDOP 0.8')
    expect(container.textContent).not.toContain('20B @ 10Hz')
    expect(screen.queryByRole('button', { name: /Hiệu chuẩn Gimbal/i })).toBeNull()
    expect(screen.queryByRole('button', { name: /Eco Mode/i })).toBeNull()
    expect(container.textContent).toContain('Sonix SN34F788')
    expect(container.textContent).toContain('TF-Luna')
  })
})
