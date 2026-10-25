import { fireEvent, render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { TooltipProvider } from '@/components/ui/tooltip'
import { MapLayerSwitcher } from './MapLayerSwitcher'

describe('MapLayerSwitcher - Nút chuyển đổi phong cách Google Maps', () => {
  it('hiển thị nhãn Vệ tinh khi đang ở chế độ 2D', () => {
    const handleToggle = vi.fn()
    render(
      <TooltipProvider>
        <MapLayerSwitcher mode="2D" onToggle={handleToggle} />
      </TooltipProvider>
    )

    expect(screen.getByText('Vệ tinh')).toBeDefined()
    expect(screen.getByRole('button', { name: /Chuyển sang chế độ Vệ tinh 3D/i })).toBeDefined()
  })

  it('hiển thị nhãn Bản đồ khi đang ở chế độ 3D', () => {
    const handleToggle = vi.fn()
    render(
      <TooltipProvider>
        <MapLayerSwitcher mode="3D" onToggle={handleToggle} />
      </TooltipProvider>
    )

    expect(screen.getByText('Bản đồ')).toBeDefined()
    expect(screen.getByRole('button', { name: /Chuyển sang chế độ Bản đồ 2D/i })).toBeDefined()
  })

  it('kích hoạt sự kiện onToggle khi người dùng nhấn nút', () => {
    const handleToggle = vi.fn()
    render(
      <TooltipProvider>
        <MapLayerSwitcher mode="2D" onToggle={handleToggle} />
      </TooltipProvider>
    )

    const button = screen.getByRole('button')
    fireEvent.click(button)
    expect(handleToggle).toHaveBeenCalledTimes(1)
  })

  it('vô hiệu hóa nút khi disabled=true', () => {
    const handleToggle = vi.fn()
    render(
      <TooltipProvider>
        <MapLayerSwitcher mode="2D" onToggle={handleToggle} disabled />
      </TooltipProvider>
    )

    const button = screen.getByRole('button') as HTMLButtonElement
    expect(button.disabled).toBe(true)
    fireEvent.click(button)
    expect(handleToggle).not.toHaveBeenCalled()
  })
})
