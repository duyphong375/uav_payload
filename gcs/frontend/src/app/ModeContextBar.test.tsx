import { fireEvent, render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { TooltipProvider } from '@/components/ui/tooltip'
import { MissionProvider, useMission } from '@/state/MissionProvider'
import { ModeContextBar } from './ModeContextBar'

function ReplayHarness() {
  const { switchSourceMode } = useMission()
  return <><button onClick={() => switchSourceMode('REPLAY')}>Test REPLAY</button><ModeContextBar /></>
}

describe('ModeContextBar - Thanh điều khiển ngữ cảnh MOCK/REAL', () => {
  it('hiển thị Chế độ Mô phỏng và danh sách kịch bản khi ở MOCK', () => {
    render(
      <TooltipProvider>
        <MissionProvider>
          <ModeContextBar />
        </MissionProvider>
      </TooltipProvider>
    )

    expect(screen.getByText(/Chế độ Mô phỏng/i)).toBeDefined()
    expect(screen.getByLabelText(/Chọn kịch bản mô phỏng/i)).toBeDefined()
    expect(screen.getByText('Khởi động lại')).toBeDefined()
  })

  it('cho phép thay đổi kịch bản mô phỏng qua dropdown', () => {
    render(
      <TooltipProvider>
        <MissionProvider>
          <ModeContextBar />
        </MissionProvider>
      </TooltipProvider>
    )

    const select = screen.getByLabelText(/Chọn kịch bản mô phỏng/i) as HTMLSelectElement
    fireEvent.change(select, { target: { value: 'NORMAL_NO_TARGET' } })

    expect(select.value).toBe('NORMAL_NO_TARGET')
  })

  it('hiển thị REPLAY riêng, không gắn nhãn Live hoặc điều khiển kịch bản', () => {
    render(
      <TooltipProvider>
        <MissionProvider><ReplayHarness /></MissionProvider>
      </TooltipProvider>
    )
    fireEvent.click(screen.getByRole('button', { name: 'Test REPLAY' }))
    expect(screen.getByText(/Phát lại nhật ký/i)).toBeDefined()
    expect(screen.queryByText(/Trực tiếp từ thiết bị/i)).toBeNull()
    expect(screen.queryByLabelText(/Chọn kịch bản mô phỏng/i)).toBeNull()
    expect(screen.getByText('MẤT REPLAY WS')).toBeDefined()
  })
})
