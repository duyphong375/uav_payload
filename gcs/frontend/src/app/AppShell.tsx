import React, { Suspense, lazy, useState } from 'react'
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetTitle,
} from '@/components/ui/sheet'
import { Toaster } from '@/components/ui/sonner'
import { useMission } from '@/state/MissionProvider'
import { PositionSummary } from '@/features/mission/PositionSummary'
import { AppHeader } from './AppHeader'
import { AppSidebar } from './AppSidebar'
import { ModeContextBar } from './ModeContextBar'
import { useAppRouter } from './routes'

// Chia tải route: mỗi trang là một chunk riêng, chỉ tải khi người dùng mở.
const MissionPage = lazy(() =>
  import('@/features/mission/MissionPage').then((m) => ({ default: m.MissionPage }))
)
const OverviewPage = lazy(() =>
  import('@/features/overview/OverviewPage').then((m) => ({ default: m.OverviewPage }))
)
const AlertsPage = lazy(() =>
  import('@/features/alerts/AlertsPage').then((m) => ({ default: m.AlertsPage }))
)
const EventLogPage = lazy(() =>
  import('@/features/history/EventLogPage').then((m) => ({ default: m.EventLogPage }))
)
const DevicesPage = lazy(() =>
  import('@/features/devices/DevicesPage').then((m) => ({ default: m.DevicesPage }))
)
const SettingsPage = lazy(() =>
  import('@/features/settings/SettingsPage').then((m) => ({ default: m.SettingsPage }))
)

const PageFallback: React.FC = () => (
  <div
    className="flex-1 flex items-center justify-center p-8 text-xs font-mono text-muted-foreground"
    role="status"
    aria-live="polite"
  >
    Đang tải trang…
  </div>
)

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
          <SheetTitle className="sr-only">Điều hướng chính</SheetTitle>
          <SheetDescription className="sr-only">
            Danh sách trang: Tổng quan, Tác chiến, Cảnh báo, Nhật ký, Thiết bị, Cài đặt.
          </SheetDescription>
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
            <Suspense fallback={<PageFallback />}>{renderCurrentPage()}</Suspense>
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
