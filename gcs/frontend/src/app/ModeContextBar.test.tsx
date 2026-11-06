import { fireEvent, render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { TooltipProvider } from '@/components/ui/tooltip'
import { MissionProvider } from '@/state/MissionProvider'
import { ModeContextBar } from './ModeContextBar'

describe('ModeContextBar - Thanh điều khiển ngữ cảnh MOCK/REAL', () => {
  it('hiển thị danh sách kịch bản khi ở MOCK', () => {
    render(
      <TooltipProvider>
        <MissionProvider>
          <ModeContextBar />
        </MissionProvider>
      </TooltipProvider>
    )

    expect(screen.getByLabelText(/Chọn kịch bản mô phỏng/i)).toBeDefined()
    expect(screen.getByText('Khởi động lại')).toBeDefined()
    // Trạng thái nguồn do AppHeader đảm nhiệm, không lặp ở thanh này
    expect(screen.queryByText(/Chế độ Mô phỏng/i)).toBeNull()
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
})
