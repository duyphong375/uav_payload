import React, { useMemo, useState } from 'react'
import {
  AlertCircle,
  AlertTriangle,
  Bell,
  CheckCheck,
  FilterX,
  Radio,
  ShieldCheck,
} from 'lucide-react'
import { toast } from 'sonner'
import { useAppRouter } from '@/app/routes'
import { PageHeader } from '@/components/shared/PageHeader'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { useMission } from '@/state/MissionProvider'
import { AlertFilters, type AlertFilterValues } from './AlertFilters'
import { AlertItemCard } from './AlertItemCard'

export const AlertsPage: React.FC = () => {
  const { state, dispatch } = useMission()
  const { alerts } = state
  const { navigate } = useAppRouter()

  const [filters, setFilters] = useState<AlertFilterValues>({
    level: 'ALL',
    ackStatus: 'ALL',
    source: 'ALL',
  })

  // Chỉ lấy cảnh báo đang hoạt động (active: true)
  const activeAlerts = useMemo(() => {
    return alerts.filter((a) => a.active)
  }, [alerts])

  // Lọc theo các tiêu chí đã chọn
  const filteredAlerts = useMemo(() => {
    return activeAlerts.filter((item) => {
      if (filters.level !== 'ALL' && item.level !== filters.level) {
        return false
      }
      if (filters.ackStatus === 'UNACKNOWLEDGED' && item.acknowledged) {
        return false
      }
      if (filters.ackStatus === 'ACKNOWLEDGED' && !item.acknowledged) {
        return false
      }
      if (filters.source !== 'ALL' && item.source_category !== filters.source) {
        return false
      }
      return true
    })
  }, [activeAlerts, filters])

  const criticalCount = activeAlerts.filter((a) => a.level === 'CRITICAL').length
  const unackCount = activeAlerts.filter((a) => !a.acknowledged).length

  const handleAcknowledgeAll = () => {
    const unacknowledgedList = activeAlerts.filter((a) => !a.acknowledged)
    if (unacknowledgedList.length === 0) return
    unacknowledgedList.forEach((alert) => {
      dispatch({ type: 'ACKNOWLEDGE_ALERT', payload: alert.id })
    })
    toast.success(`Đã tiếp nhận ${unacknowledgedList.length} cảnh báo đang mở!`)
  }

  return (
    <div className="flex-1 flex flex-col p-3 sm:p-5 gap-3.5 sm:gap-4 overflow-y-auto max-w-7xl mx-auto w-full select-none">
      {/* 1. Header Trang Cảnh Báo */}
      <PageHeader
        breadcrumb="Dữ liệu · Cảnh báo hệ thống"
        title="Trung tâm cảnh báo kỹ thuật"
        infoTip="Hệ thống giám sát và quản lý toàn bộ cảnh báo về ngắt kết nối LoRa/Wi-Fi, độ lệch cảm biến siêu âm và khóa vệ tinh GNSS."
        subtitle="Tiếp nhận, phân loại và xử lý các sự cố an toàn tải nhiệm vụ, cảm biến và kênh truyền."
        badge={
          <Badge
            variant={activeAlerts.length > 0 ? 'destructive' : 'outline'}
            className="text-xs font-mono"
          >
            {activeAlerts.length} đang mở
          </Badge>
        }
        actions={
          <div className="flex items-center gap-2">
            {unackCount > 0 && (
              <Button
                variant="outline"
                size="sm"
                onClick={handleAcknowledgeAll}
                className="h-8 text-xs gap-1.5 border-border hover:bg-muted"
                title="Tiếp nhận toàn bộ cảnh báo chưa xác nhận"
              >
                <CheckCheck className="h-3.5 w-3.5 text-primary" />
                <span>Tiếp nhận tất cả ({unackCount})</span>
              </Button>
            )}
            <Button
              size="sm"
              onClick={() => navigate('/mission')}
              className="h-8 text-xs gap-1.5 bg-primary text-primary-foreground hover:bg-primary/90 shadow-xs"
            >
              <Radio className="h-3.5 w-3.5" />
              <span>Xem Trực tiếp</span>
            </Button>
          </div>
        }
      />

      {/* 2. Thẻ Tóm Tắt Thống Kê Nhanh (3 Cards) */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        <Card className="border-border bg-card shadow-xs">
          <CardContent className="p-3.5 flex items-center justify-between">
            <div className="flex flex-col">
              <span className="text-[11px] text-muted-foreground font-medium uppercase tracking-wider">
                Tổng cảnh báo mở
              </span>
              <span className="text-2xl font-bold font-mono text-foreground mt-0.5">
                {activeAlerts.length}
              </span>
            </div>
            <div className="p-2.5 rounded-kvc-panel bg-primary/10 border border-primary/20 text-primary">
              <Bell className="h-5 w-5" />
            </div>
          </CardContent>
        </Card>

        <Card className="border-border bg-card shadow-xs">
          <CardContent className="p-3.5 flex items-center justify-between">
            <div className="flex flex-col">
              <span className="text-[11px] text-muted-foreground font-medium uppercase tracking-wider">
                Chưa tiếp nhận
              </span>
              <span
                className={`text-2xl font-bold font-mono mt-0.5 ${
                  unackCount > 0 ? 'text-[var(--kvc-warn-ink)]' : 'text-foreground'
                }`}
              >
                {unackCount}
              </span>
            </div>
            <div className="p-2.5 rounded-kvc-panel bg-[var(--kvc-warn-bg)] border border-[var(--kvc-warn-line)] text-[var(--kvc-warn-ink)]">
              <AlertTriangle className="h-5 w-5" />
            </div>
          </CardContent>
        </Card>

        <Card className="border-border bg-card shadow-xs">
          <CardContent className="p-3.5 flex items-center justify-between">
            <div className="flex flex-col">
              <span className="text-[11px] text-muted-foreground font-medium uppercase tracking-wider">
                Mức độ nguy cấp
              </span>
              <span
                className={`text-2xl font-bold font-mono mt-0.5 ${
                  criticalCount > 0 ? 'text-[var(--kvc-crit-ink)]' : 'text-foreground'
                }`}
              >
                {criticalCount}
              </span>
            </div>
            <div className="p-2.5 rounded-kvc-panel bg-[var(--kvc-crit-bg)] border border-[var(--kvc-crit-line)] text-[var(--kvc-crit-ink)]">
              <AlertCircle className="h-5 w-5" />
            </div>
          </CardContent>
        </Card>
      </div>

      {/* 3. Thanh Bộ Lọc */}
      <AlertFilters filters={filters} onChange={setFilters} />

      {/* 4. Danh Sách Cảnh Báo */}
      <div className="flex flex-col gap-2.5 flex-1 pb-6" aria-live="polite" aria-atomic="false">
        {activeAlerts.length === 0 ? (
          <div className="py-12 border border-border rounded-kvc-panel bg-card text-center flex flex-col items-center justify-center gap-2 shadow-xs">
            <ShieldCheck className="h-10 w-10 stroke-[1.5] text-[var(--kvc-ok-ink)]" />
            <span className="text-sm font-semibold text-foreground">
              Không có sự cố hoặc cảnh báo nào đang mở
            </span>
            <span className="text-xs text-muted-foreground max-w-sm">
              Mọi cảm biến, kênh truyền viễn thông LoRa và module xử lý AI đang hoạt động bình thường trong phiên làm việc.
            </span>
          </div>
        ) : filteredAlerts.length === 0 ? (
          <div className="py-12 border border-border rounded-kvc-panel bg-card text-center flex flex-col items-center justify-center gap-2 shadow-xs">
            <FilterX className="h-10 w-10 stroke-[1.5] text-muted-foreground/50" />
            <span className="text-sm font-semibold text-foreground">
              Không tìm thấy cảnh báo phù hợp với bộ lọc
            </span>
            <span className="text-xs text-muted-foreground">
              Thử đặt lại các tiêu chí bộ lọc mức độ hoặc nguồn để xem toàn bộ danh sách.
            </span>
            <Button
              variant="outline"
              size="sm"
              onClick={() => setFilters({ level: 'ALL', ackStatus: 'ALL', source: 'ALL' })}
              className="mt-2 text-xs"
            >
              Đặt lại bộ lọc
            </Button>
          </div>
        ) : (
          filteredAlerts.map((alert) => (
            <AlertItemCard key={alert.id} alert={alert} />
          ))
        )}
      </div>
    </div>
  )
}
