import React from 'react'
import {
  Bell,
  ChevronLeft,
  ChevronRight,
  Cpu,
  History,
  LayoutDashboard,
  Radio,
  Settings,
  ShieldAlert,
} from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from '@/components/ui/tooltip'
import { useMission } from '@/state/MissionProvider'
import { APP_ROUTES, type AppRoutePath, useAppRouter } from './routes'

interface AppSidebarProps {
  collapsed: boolean
  onToggleCollapse: () => void
  onItemClick?: () => void
}

export const AppSidebar: React.FC<AppSidebarProps> = ({
  collapsed,
  onToggleCollapse,
  onItemClick,
}) => {
  const { currentPath, navigate } = useAppRouter()
  const { state } = useMission()

  // Đếm số cảnh báo đang hoạt động (active: true) có mức WARN hoặc CRITICAL (loại trừ INFO)
  const activeAlertsCount = state.alerts.filter(
    (a) => a.active && (a.level === 'CRITICAL' || a.level === 'WARN')
  ).length

  const navGroups: Array<{
    group: 'GIÁM SÁT' | 'DỮ LIỆU' | 'HỆ THỐNG'
    items: Array<{
      path: AppRoutePath
      title: string
      icon: React.ReactNode
      badgeCount?: number
    }>
  }> = [
    {
      group: 'GIÁM SÁT',
      items: [
        {
          path: '/overview',
          title: APP_ROUTES['/overview'].title,
          icon: <LayoutDashboard className="h-4 w-4 shrink-0" />,
        },
        {
          path: '/mission',
          title: APP_ROUTES['/mission'].title,
          icon: <Radio className="h-4 w-4 shrink-0" />,
        },
      ],
    },
    {
      group: 'DỮ LIỆU',
      items: [
        {
          path: '/alerts',
          title: APP_ROUTES['/alerts'].title,
          icon: <Bell className="h-4 w-4 shrink-0" />,
          badgeCount: activeAlertsCount,
        },
        {
          path: '/history',
          title: APP_ROUTES['/history'].title,
          icon: <History className="h-4 w-4 shrink-0" />,
        },
      ],
    },
    {
      group: 'HỆ THỐNG',
      items: [
        {
          path: '/devices',
          title: APP_ROUTES['/devices'].title,
          icon: <Cpu className="h-4 w-4 shrink-0" />,
        },
        {
          path: '/settings',
          title: APP_ROUTES['/settings'].title,
          icon: <Settings className="h-4 w-4 shrink-0" />,
        },
      ],
    },
  ]

  const handleNavigate = (path: AppRoutePath) => {
    navigate(path)
    if (onItemClick) {
      onItemClick()
    }
  }

  // Thu gọn session_id
  const displaySessionId = state.session_id.length > 14
    ? `${state.session_id.slice(0, 12)}...`
    : state.session_id

  return (
    <aside
      className={`h-full flex flex-col bg-card border-r border-border transition-all duration-200 select-none ${
        collapsed ? 'w-16' : 'w-[220px]'
      }`}
    >
      {/* 1. Header Sidebar: Logo & Tên dự án */}
      <div className="h-14 flex items-center px-3.5 border-b border-border/60 shrink-0 justify-between">
        <div className="flex items-center gap-2.5 overflow-hidden">
          <div className="h-8 w-8 rounded-lg bg-primary/10 border border-primary/20 flex items-center justify-center shrink-0">
            <ShieldAlert className="h-4 w-4 text-primary" />
          </div>
          {!collapsed && (
            <div className="flex flex-col min-w-0">
              <span className="text-xs font-bold tracking-tight text-foreground truncate">
                KVC · GCS
              </span>
              <span className="text-[10px] text-muted-foreground truncate font-mono">
                Payload Monitor
              </span>
            </div>
          )}
        </div>
      </div>

      {/* 2. Menu Điều Hướng (3 nhóm Sortix) */}
      <div className="flex-1 overflow-y-auto overflow-x-hidden py-3 px-2 flex flex-col gap-4">
        {navGroups.map((group) => (
          <div key={group.group} className="flex flex-col gap-1">
            {!collapsed && (
              <span className="px-2.5 text-[10px] font-semibold tracking-wider text-muted-foreground/80 uppercase">
                {group.group}
              </span>
            )}
            <div className="flex flex-col gap-0.5">
              {group.items.map((item) => {
                const isActive = currentPath === item.path
                const buttonContent = (
                  <button
                    type="button"
                    onClick={() => handleNavigate(item.path)}
                    className={`w-full flex items-center gap-2.5 px-2.5 py-2 rounded-lg text-xs font-medium transition-colors relative ${
                      isActive
                        ? 'bg-primary/10 text-primary dark:bg-primary/20 font-semibold shadow-xs'
                        : 'text-muted-foreground hover:text-foreground hover:bg-muted/50'
                    } ${collapsed ? 'justify-center px-0' : ''}`}
                  >
                    {/* Active Indicator bar mép trái */}
                    {isActive && (
                      <span className="absolute left-0 top-1.5 bottom-1.5 w-1 bg-primary rounded-r-full" />
                    )}
                    <span className={isActive ? 'text-primary' : 'text-muted-foreground'}>
                      {item.icon}
                    </span>
                    {!collapsed && (
                      <span className="truncate flex-1 text-left">{item.title}</span>
                    )}
                    {/* Badge đếm cảnh báo */}
                    {item.badgeCount !== undefined && item.badgeCount > 0 && (
                      <Badge
                        variant="destructive"
                        className={`h-4 min-w-4 px-1 text-[10px] font-mono leading-none rounded-full flex items-center justify-center ${
                          collapsed ? 'absolute -top-1 -right-1' : ''
                        }`}
                      >
                        {item.badgeCount}
                      </Badge>
                    )}
                  </button>
                )

                if (collapsed) {
                  return (
                    <Tooltip key={item.path} delayDuration={150}>
                      <TooltipTrigger asChild>{buttonContent}</TooltipTrigger>
                      <TooltipContent side="right" className="text-xs font-medium">
                        {item.title}
                        {item.badgeCount !== undefined && item.badgeCount > 0 && (
                          <span className="ml-1.5 text-red-400">({item.badgeCount})</span>
                        )}
                      </TooltipContent>
                    </Tooltip>
                  )
                }

                return <React.Fragment key={item.path}>{buttonContent}</React.Fragment>
              })}
            </div>
          </div>
        ))}
      </div>

      {/* 3. Footer Sidebar: Nguồn dữ liệu, Phiên & Nút Thu Gọn */}
      <div className="p-2.5 border-t border-border/60 bg-muted/15 flex flex-col gap-2 shrink-0">
        {!collapsed ? (
          <div className="flex flex-col gap-1.5">
            <div className="flex items-center justify-between">
              <span className="text-[10px] text-muted-foreground font-medium uppercase tracking-wider">
                Nguồn dữ liệu
              </span>
              <Badge
                variant="outline"
                className={`text-[10px] px-1.5 py-0 font-mono ${
                  state.source_mode === 'MOCK'
                    ? 'border-purple-500/40 text-purple-600 dark:text-purple-300 bg-purple-500/10'
                    : state.source_mode === 'REPLAY'
                    ? 'border-cyan-500/40 text-cyan-600 dark:text-cyan-300 bg-cyan-500/10'
                    : state.hardware_link.status === 'CONNECTED'
                    ? 'bg-emerald-600 text-white border-transparent'
                    : 'border-rose-500/50 text-rose-600 dark:text-rose-400 bg-rose-500/10'
                }`}
              >
                {state.source_mode === 'REAL' && state.hardware_link.status !== 'CONNECTED'
                  ? 'REAL (CHƯA INGRESS)'
                  : state.source_mode}
              </Badge>
            </div>
            <div className="flex items-center justify-between text-[11px] text-muted-foreground font-mono">
              <span className="text-[10px] text-muted-foreground">Phiên:</span>
              <span className="truncate max-w-[120px]" title={state.session_id}>
                {displaySessionId}
              </span>
            </div>
          </div>
        ) : (
          <div className="flex flex-col items-center gap-1">
            <Badge
              variant="outline"
              className="text-[9px] px-1 py-0 font-mono text-muted-foreground"
              title={`Nguồn: ${state.source_mode}`}
            >
              {state.source_mode.slice(0, 1)}
            </Badge>
          </div>
        )}

        {/* Nút Thu gọn / Mở rộng */}
        <Button
          variant="ghost"
          size="sm"
          onClick={onToggleCollapse}
          className={`h-7 w-full text-xs text-muted-foreground hover:text-foreground justify-center gap-1.5 ${
            collapsed ? 'px-0' : 'px-2'
          }`}
          title={collapsed ? 'Mở rộng thanh điều hướng' : 'Thu gọn thanh điều hướng'}
        >
          {collapsed ? (
            <ChevronRight className="h-3.5 w-3.5" />
          ) : (
            <>
              <ChevronLeft className="h-3.5 w-3.5" />
              <span className="text-[11px]">Thu gọn</span>
            </>
          )}
        </Button>
      </div>
    </aside>
  )
}
