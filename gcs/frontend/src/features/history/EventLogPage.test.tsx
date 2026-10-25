import { fireEvent, render, screen } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { TooltipProvider } from '@/components/ui/tooltip'
import { AppRouterProvider } from '@/app/routes'
import { MissionProvider } from '@/state/MissionProvider'
import { EventLogPage } from './EventLogPage'

// Mock TelemetryClient
vi.mock('@/services/telemetryClient', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/services/telemetryClient')>()
  return {
    ...actual,
    TelemetryClient: {
      ...actual.TelemetryClient,
      fetchSessions: vi.fn().mockResolvedValue({
        active_session_id: 'SES-REAL-20261016-01',
        storage_implemented: true,
        sessions: [
          {
            session_id: 'SES-REAL-20261016-01',
            file: 'data/sessions/SES-REAL-20261016-01.db',
            records: 1250,
            size_bytes: 42000,
            last_persisted_at_iso: '2026-10-16T12:00:00Z',
          },
          {
            session_id: 'MOCK-DEMO-02',
            file: 'data/sessions/MOCK-DEMO-02.db',
            records: 450,
            size_bytes: 15000,
            last_persisted_at_iso: '2026-10-15T09:30:00Z',
          },
        ],
      }),
      startReplay: vi.fn().mockResolvedValue({ status: 'replay_started' }),
      pauseReplay: vi.fn().mockResolvedValue({ status: 'replay_paused' }),
      resumeReplay: vi.fn().mockResolvedValue({ status: 'replay_resumed' }),
      seekReplay: vi.fn().mockResolvedValue({ status: 'seek_ok' }),
      setReplaySpeed: vi.fn().mockResolvedValue({ status: 'speed_ok' }),
      stopReplay: vi.fn().mockResolvedValue(true),
    },
  }
})

describe('EventLogPage - Trung tâm quản lý phiên bay & Hộp đen', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('hiển thị bố cục 2 cột chuyên nghiệp gồm Session Explorer và Video Debriefing', async () => {
    render(
      <TooltipProvider>
        <MissionProvider>
          <AppRouterProvider>
            <EventLogPage />
          </AppRouterProvider>
        </MissionProvider>
      </TooltipProvider>
    )

    // Tiêu đề trang
    expect(screen.getByText('Nhật ký phiên & Bằng chứng cứu hộ')).toBeDefined()

    // Cột trái: Session Explorer
    expect(screen.getByText('Danh sách phiên bay hộp đen')).toBeDefined()
    expect(screen.getByPlaceholderText('Tìm theo mã SES-xxx hoặc ngày...')).toBeDefined()

    // Khung phải: Video Debriefing
    expect(screen.getByText(/Xem lại Video & Telemetry/i)).toBeDefined()
    expect(screen.getByText(/Nhật ký sự kiện kiểm toán/i)).toBeDefined()
  })

  it('cho phép chuyển đổi giữa tab Video Debriefing và tab Nhật ký sự kiện kiểm toán', async () => {
    render(
      <TooltipProvider>
        <MissionProvider>
          <AppRouterProvider>
            <EventLogPage />
          </AppRouterProvider>
        </MissionProvider>
      </TooltipProvider>
    )

    const auditTabBtn = screen.getByRole('button', { name: /Nhật ký sự kiện kiểm toán/i })
    fireEvent.click(auditTabBtn)

    // Kiểm tra các thành phần bộ lọc sự kiện xuất hiện
    expect(screen.getByPlaceholderText('Tìm mã, nội dung sự kiện...')).toBeDefined()

    // Chuyển lại tab Video Debriefing
    const videoTabBtn = screen.getByRole('button', { name: /Xem lại Video & Telemetry/i })
    fireEvent.click(videoTabBtn)
    expect(screen.getByText('LUỒNG QUANG HỌC HỘP ĐEN PHIÊN BAY')).toBeDefined()
  })

  it('hỗ trợ xuất bằng chứng cứu nạn dạng CSV và video MP4', async () => {
    render(
      <TooltipProvider>
        <MissionProvider>
          <AppRouterProvider>
            <EventLogPage />
          </AppRouterProvider>
        </MissionProvider>
      </TooltipProvider>
    )

    // Nút tải video
    const downloadVideoBtn = screen.getByRole('button', { name: /Tải Video Chuyến Bay \(\.mp4\)/i })
    expect(downloadVideoBtn).toBeDefined()
    fireEvent.click(downloadVideoBtn)

    // Nút xuất báo cáo SAR
    const downloadCsvBtn = screen.getByRole('button', { name: /Xuất Báo Cáo SAR \(\.csv\)/i })
    expect(downloadCsvBtn).toBeDefined()
    fireEvent.click(downloadCsvBtn)
  })
})
