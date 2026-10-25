import React from 'react'
import { Satellite } from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { Card } from '@/components/ui/card'
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from '@/components/ui/sheet'
import { useMission } from '@/state/MissionProvider'

interface GnssSatelliteSheetProps {
  open: boolean
  onOpenChange: (open: boolean) => void
}

export const GnssSatelliteSheet: React.FC<GnssSatelliteSheetProps> = ({ open, onOpenChange }) => {
  const { state } = useMission()
  const { telemetry, camera_position, source_mode, is_stale } = state
  const hasFix = !is_stale && camera_position.is_valid && telemetry.gps_valid

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="right" className="w-full sm:max-w-md p-0 flex flex-col bg-card overflow-y-auto">
        <SheetHeader className="p-5 border-b border-border">
          <div className="flex items-center gap-2">
            <Satellite className="h-5 w-5 text-cyan-500" />
            <SheetTitle>Phần Vệ Tinh GNSS Định Vị</SheetTitle>
          </div>
          <SheetDescription>GNSS u-blox M10 (bo mạch ghi NEO-M10N) — cấu hình carrier cần xác nhận</SheetDescription>
          <div className="flex gap-2">
            <Badge variant="outline">{source_mode}</Badge>
            <Badge variant="outline">{is_stale ? 'DỮ LIỆU CŨ' : hasFix ? 'FIX HỢP LỆ' : 'CHƯA CÓ FIX HỢP LỆ'}</Badge>
          </div>
        </SheetHeader>
        <div className="p-5 space-y-4 text-xs">
          <Card className="p-4 space-y-2">
            <p className="font-semibold">Vị trí từ nguồn dữ liệu hiện hành</p>
            <p>Vĩ độ: <span className="font-mono">{hasFix && camera_position.latitude !== null ? camera_position.latitude.toFixed(6) : 'N/A'}</span></p>
            <p>Kinh độ: <span className="font-mono">{hasFix && camera_position.longitude !== null ? camera_position.longitude.toFixed(6) : 'N/A'}</span></p>
            <p className="text-muted-foreground">MOCK là dữ liệu giả lập; REPLAY là dữ liệu của phiên đã ghi.</p>
          </Card>
          <Card className="p-4 space-y-2">
            <p className="font-semibold">Chi tiết vệ tinh chưa có dữ liệu</p>
            {['Số vệ tinh', 'Danh sách vệ tinh / C/N0', 'HDOP / VDOP / PDOP', 'Sai số vị trí', 'Tần số xuất GNSS', 'Chống giả mạo / nhiễu'].map((label) => (
              <div key={label} className="flex justify-between gap-3"><span>{label}</span><span className="font-mono text-muted-foreground">N/A</span></div>
            ))}
            <p className="text-muted-foreground">Trạng thái fix không cung cấp số vệ tinh, DOP hoặc sai số. Chỉ hiển thị những chỉ số này khi có dữ liệu tương ứng từ thiết bị.</p>
          </Card>
        </div>
      </SheetContent>
    </Sheet>
  )
}
