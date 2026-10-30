import React from 'react'
import { Monitor, Moon, Sun } from 'lucide-react'
import { Button } from '@/components/ui/button'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'
import { useTheme } from './ThemeProvider'

export const ThemeToggle: React.FC = () => {
  const { theme, setTheme, resolvedTheme } = useTheme()

  return (
    <DropdownMenu>
      <Tooltip>
        <TooltipTrigger asChild>
          <DropdownMenuTrigger asChild>
            <Button
              variant="outline"
              size="icon"
              className="h-8 w-8 relative text-foreground border-border hover:bg-muted"
              aria-label="Chọn giao diện hiển thị Sáng, Tối hoặc Hệ thống"
            >
              {resolvedTheme === 'dark' ? (
                <Moon className="h-4 w-4 text-[var(--kvc-accent-ink)]" />
              ) : (
                <Sun className="h-4 w-4 text-[var(--kvc-warn-ink)]" />
              )}
              <span className="sr-only">Chuyển đổi giao diện (Hiện tại: {theme})</span>
            </Button>
          </DropdownMenuTrigger>
        </TooltipTrigger>
        <TooltipContent side="bottom">
          <p className="text-xs">Giao diện: {theme === 'system' ? 'Theo hệ thống' : theme === 'dark' ? 'Chế độ Tối' : 'Chế độ Sáng'}</p>
        </TooltipContent>
      </Tooltip>

      <DropdownMenuContent align="end" className="w-40 bg-card border-border">
        <DropdownMenuItem
          onClick={() => setTheme('light')}
          className={`flex items-center gap-2 cursor-pointer text-xs ${theme === 'light' ? 'bg-accent font-semibold text-accent-foreground' : ''}`}
        >
          <Sun className="h-4 w-4 text-[var(--kvc-warn-ink)]" />
          <span>Sáng (Light)</span>
        </DropdownMenuItem>
        <DropdownMenuItem
          onClick={() => setTheme('dark')}
          className={`flex items-center gap-2 cursor-pointer text-xs ${theme === 'dark' ? 'bg-accent font-semibold text-accent-foreground' : ''}`}
        >
          <Moon className="h-4 w-4 text-[var(--kvc-accent-ink)]" />
          <span>Tối (Dark)</span>
        </DropdownMenuItem>
        <DropdownMenuItem
          onClick={() => setTheme('system')}
          className={`flex items-center gap-2 cursor-pointer text-xs ${theme === 'system' ? 'bg-accent font-semibold text-accent-foreground' : ''}`}
        >
          <Monitor className="h-4 w-4 text-[var(--kvc-text-on-overlay-muted)]" />
          <span>Hệ thống (System)</span>
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  )
}
