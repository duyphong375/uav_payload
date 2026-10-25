import React, { createContext, useContext, useEffect, useState } from 'react'

export type AppRoutePath =
  | '/overview'
  | '/mission'
  | '/alerts'
  | '/history'
  | '/devices'
  | '/settings'

export interface RouteConfig {
  path: AppRoutePath
  title: string
  breadcrumb: string
  group: 'GIÁM SÁT' | 'DỮ LIỆU' | 'HỆ THỐNG'
  iconName: string
}

export const APP_ROUTES: Record<AppRoutePath, RouteConfig> = {
  '/overview': {
    path: '/overview',
    title: 'Tổng quan',
    breadcrumb: 'Giám sát · Tổng quan',
    group: 'GIÁM SÁT',
    iconName: 'LayoutDashboard',
  },
  '/mission': {
    path: '/mission',
    title: 'Giám sát trực tiếp',
    breadcrumb: 'Giám sát · Trực tiếp',
    group: 'GIÁM SÁT',
    iconName: 'Radio',
  },
  '/alerts': {
    path: '/alerts',
    title: 'Cảnh báo',
    breadcrumb: 'Dữ liệu · Cảnh báo',
    group: 'DỮ LIỆU',
    iconName: 'Bell',
  },
  '/history': {
    path: '/history',
    title: 'Nhật ký phiên',
    breadcrumb: 'Dữ liệu · Nhật ký phiên',
    group: 'DỮ LIỆU',
    iconName: 'History',
  },
  '/devices': {
    path: '/devices',
    title: 'Thiết bị & kết nối',
    breadcrumb: 'Hệ thống · Thiết bị & kết nối',
    group: 'HỆ THỐNG',
    iconName: 'Cpu',
  },
  '/settings': {
    path: '/settings',
    title: 'Cài đặt giao diện',
    breadcrumb: 'Hệ thống · Cài đặt giao diện',
    group: 'HỆ THỐNG',
    iconName: 'Settings',
  },
}

interface RouterContextValue {
  currentPath: AppRoutePath
  navigate: (path: AppRoutePath) => void
}

const RouterContext = createContext<RouterContextValue | null>(null)

function parseHash(hash: string): AppRoutePath {
  const clean = hash.replace(/^#\/?/, '/').trim()
  const validPaths: AppRoutePath[] = ['/overview', '/mission', '/alerts', '/history', '/devices', '/settings']
  if (validPaths.includes(clean as AppRoutePath)) {
    return clean as AppRoutePath
  }
  // Mặc định mở Giám sát trực tiếp
  return '/mission'
}

export const AppRouterProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [currentPath, setCurrentPath] = useState<AppRoutePath>(() => {
    if (typeof window !== 'undefined') {
      return parseHash(window.location.hash)
    }
    return '/mission'
  })

  useEffect(() => {
    const handleHashChange = () => {
      const newPath = parseHash(window.location.hash)
      setCurrentPath(newPath)
    }

    window.addEventListener('hashchange', handleHashChange)

    // Nếu lúc nạp trang chưa có hash hoặc hash là / thì chuẩn hóa sang #/mission
    if (!window.location.hash || window.location.hash === '#' || window.location.hash === '#/') {
      window.location.hash = '#/mission'
    }

    return () => {
      window.removeEventListener('hashchange', handleHashChange)
    }
  }, [])

  const navigate = (path: AppRoutePath) => {
    if (typeof window !== 'undefined') {
      window.location.hash = `#${path}`
    }
    setCurrentPath(path)
  }

  return (
    <RouterContext.Provider value={{ currentPath, navigate }}>
      {children}
    </RouterContext.Provider>
  )
}

export function useAppRouter(): RouterContextValue {
  const ctx = useContext(RouterContext)
  if (!ctx) {
    throw new Error('useAppRouter phải được dùng bên trong AppRouterProvider')
  }
  return ctx
}
