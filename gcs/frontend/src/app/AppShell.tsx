import React, { useState } from 'react'
import {
  Sheet,
  SheetContent,
} from '@/components/ui/sheet'
import { Toaster } from '@/components/ui/sonner'
import { AlertsPage } from '@/features/alerts/AlertsPage'
import { DevicesPage } from '@/features/devices/DevicesPage'
import { EventLogPage } from '@/features/history/EventLogPage'
import { MissionPage } from '@/features/mission/MissionPage'
import { OverviewPage } from '@/features/overview/OverviewPage'
import { SettingsPage } from '@/features/settings/SettingsPage'
import { useMission } from '@/state/MissionProvider'
import { PositionSummary } from '@/features/mission/PositionSummary'
import { AppHeader } from './AppHeader'
import { AppSidebar } from './AppSidebar'
import { ModeContextBar } from './ModeContextBar'
import { useAppRouter } from './routes'

export const AppShell: React.FC = () => {
  const { currentPath } = useAppRouter()
  const { state, dispatch } = useMission()
  const { sidebar_collapsed } = state

  const [mobileMenuOpen, setMobileMenuOpen] = useState(false)

  const handleToggleCollapse = () => {
    dispatch({ type: 'TOGGLE_SIDEBAR_COLLAPSED' })
  }

  // Tự động thu gọn sidebar trên màn hình < 1400px (1366x768 ngoài hiện trường)
  React.useEffect(() => {
    if (typeof window !== 'undefined' && window.innerWidth < 1400 && !sidebar_collapsed) {
      dispatch({ type: 'SET_SIDEBAR_COLLAPSED', payload: true })
    }
  }, [sidebar_collapsed, dispatch])

  // Render trang phù hợp theo URL route
  const renderCurrentPage = () => {
    switch (currentPath) {
      case '/overview':
        return <OverviewPage />
      case '/alerts':
        return <AlertsPage />
      case '/history':
        return <EventLogPage />
      case '/devices':
        return <DevicesPage />
      case '/settings':
        return <SettingsPage />
      case '/mission':
      default:
        return <MissionPage />
    }
  }

  return (
    <div className="flex h-screen w-screen overflow-hidden bg-background text-foreground font-sans antialiased select-none">
      {/* 1. Sidebar trên Desktop - cố định 220px (16 khi collapsed) */}
      <div className="hidden md:flex h-full shrink-0">
        <AppSidebar
          collapsed={sidebar_collapsed}
          onToggleCollapse={handleToggleCollapse}
        />
      </div>

      {/* 2. Drawer Sidebar cho Mobile / Màn hình nhỏ */}
      <Sheet open={mobileMenuOpen} onOpenChange={setMobileMenuOpen}>
        <SheetContent side="left" className="p-0 w-[220px] bg-card border-border">
          <AppSidebar
            collapsed={false}
            onToggleCollapse={() => setMobileMenuOpen(false)}
            onItemClick={() => setMobileMenuOpen(false)}
          />
        </SheetContent>
      </Sheet>

      {/* 3. Vùng làm việc chính bên phải */}
      <div className="flex-1 flex flex-col min-w-0 h-full overflow-hidden">
        {/* Header trên cùng (dùng chung cho mọi page) */}
        <AppHeader
          onOpenMobileMenu={() => setMobileMenuOpen(true)}
        />

        {/* Thanh ngữ cảnh MOCK / REAL (ẩn trên /mission để giải phóng chiều dọc bản đồ tối đa theo Phương án 1) */}
        {currentPath !== '/mission' && <ModeContextBar />}

        {/* Nội dung trang theo Router - trang Mission được mở rộng tràn viền trên màn hình 1920x1080 */}
        <main className="flex-1 min-h-0 overflow-y-auto lg:overflow-hidden relative flex flex-col bg-background">
          <div
            className={`w-full mx-auto h-full flex flex-col min-h-0 ${
              currentPath === '/mission' ? 'max-w-none' : 'max-w-[1440px]'
            }`}
          >
            {renderCurrentPage()}
          </div>
        </main>

        {/* Thanh trạng thái Telemetry chân trang (ẩn trên /mission vì đã có BottomTacticalDock chuyên sâu) */}
        {currentPath !== '/mission' && <PositionSummary />}
      </div>

      {/* 5. Toaster thông báo thao tác */}
      <Toaster position="top-right" richColors closeButton />
    </div>
  )
}
