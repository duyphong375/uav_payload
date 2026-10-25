import React from 'react'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import type { AlertLevel, AlertSourceCategory } from '@/types/telemetry'

export interface AlertFilterValues {
  level: 'ALL' | AlertLevel
  ackStatus: 'ALL' | 'UNACKNOWLEDGED' | 'ACKNOWLEDGED'
  source: 'ALL' | AlertSourceCategory
}

interface AlertFiltersProps {
  filters: AlertFilterValues
  onChange: (filters: AlertFilterValues) => void
}

export const AlertFilters: React.FC<AlertFiltersProps> = ({
  filters,
  onChange,
}) => {
  return (
    <div className="flex flex-wrap items-center gap-2 p-2.5 rounded-lg border border-border bg-card text-xs">
      {/* 1. Lọc Mức Độ */}
      <div className="flex items-center gap-1.5">
        <span className="text-muted-foreground font-medium">Mức độ:</span>
        <Select
          value={filters.level}
          onValueChange={(val) =>
            onChange({ ...filters, level: val as AlertFilterValues['level'] })
          }
        >
          <SelectTrigger className="h-7 w-[120px] text-xs">
            <SelectValue placeholder="Tất cả" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="ALL">Tất cả mức độ</SelectItem>
            <SelectItem value="CRITICAL">Nghiêm trọng (CRITICAL)</SelectItem>
            <SelectItem value="WARN">Cảnh báo (WARN)</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {/* 2. Lọc Trạng Thái Tiếp Nhận */}
      <div className="flex items-center gap-1.5">
        <span className="text-muted-foreground font-medium">Tiếp nhận:</span>
        <Select
          value={filters.ackStatus}
          onValueChange={(val) =>
            onChange({ ...filters, ackStatus: val as AlertFilterValues['ackStatus'] })
          }
        >
          <SelectTrigger className="h-7 w-[140px] text-xs">
            <SelectValue placeholder="Tất cả" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="ALL">Tất cả trạng thái</SelectItem>
            <SelectItem value="UNACKNOWLEDGED">Chưa tiếp nhận</SelectItem>
            <SelectItem value="ACKNOWLEDGED">Đã tiếp nhận</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {/* 3. Lọc Theo Nguồn */}
      <div className="flex items-center gap-1.5">
        <span className="text-muted-foreground font-medium">Nguồn:</span>
        <Select
          value={filters.source}
          onValueChange={(val) =>
            onChange({ ...filters, source: val as AlertFilterValues['source'] })
          }
        >
          <SelectTrigger className="h-7 w-[130px] text-xs">
            <SelectValue placeholder="Tất cả" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="ALL">Tất cả nguồn</SelectItem>
            <SelectItem value="GPS">GNSS / GPS</SelectItem>
            <SelectItem value="VIDEO">Video Stream</SelectItem>
            <SelectItem value="TELEMETRY">Telemetry / RF</SelectItem>
            <SelectItem value="SENSORS">Cảm biến / Pin</SelectItem>
            <SelectItem value="STORAGE">Thẻ nhớ / Ghi log</SelectItem>
            <SelectItem value="SYSTEM">Hệ thống chung</SelectItem>
          </SelectContent>
        </Select>
      </div>
    </div>
  )
}
