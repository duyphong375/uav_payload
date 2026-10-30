import React, { useRef } from 'react'
import type L from 'leaflet'
import { Compass, LocateFixed } from 'lucide-react'
import { Panel } from '@/components/shared/Panel'
import { StatusBadge } from '@/components/shared/StatusBadge'
import { Button } from '@/components/ui/button'
import { CurrentPositionPanel } from '@/features/mission/CurrentPositionPanel'
import { useMission } from '@/state/MissionProvider'
import { Map2DView } from './Map2DView'

export interface GpsMapPanelProps {
  hideHeader?: boolean
  className?: string
}

export const GpsMapPanel: React.FC<GpsMapPanelProps> = ({
  hideHeader = false,
  className = '',
}) => {
  const { state } = useMission()
  const {
    camera_position,
    target,
    has_target,
    camera_trail,
    show_trails,
    is_stale,
    rx_age_ms,
    ws_connected,
  } = state

  const mapInstanceRef = useRef<L.Map | null>(null)

  const hasGpsFix = Boolean(
    camera_position.is_valid &&
    camera_position.latitude !== null &&
    camera_position.longitude !== null
  )

  // Hàm xử lý đặt lại khung nhìn về vị trí tải UAV
  const handleResetView = React.useCallback(() => {
    if (
      mapInstanceRef.current &&
      hasGpsFix &&
      camera_position.latitude !== null &&
      camera_position.longitude !== null &&
      !isNaN(camera_position.latitude) &&
      !isNaN(camera_position.longitude)
    ) {
      mapInstanceRef.current.setView([camera_position.latitude, camera_position.longitude], 17, {
        animate: true,
      })
    }
  }, [hasGpsFix, camera_position])

  // Hàm xử lý đưa tâm bản đồ về mục tiêu cứu nạn
  const handleFocusTarget = React.useCallback(() => {
    if (
      mapInstanceRef.current &&
      target &&
      target.latitude !== null &&
      target.longitude !== null &&
      !isNaN(target.latitude) &&
      !isNaN(target.longitude)
    ) {
      mapInstanceRef.current.setView([target.latitude, target.longitude], 18, {
        animate: true,
      })
    }
  }, [target])

  // Lắng nghe sự kiện toàn cục khi nhấn nút Đặt lại khung nhìn hoặc Focus Target
  React.useEffect(() => {
    const onGlobalReset = () => {
      handleResetView()
    }
    const onGlobalFocusTarget = () => {
      handleFocusTarget()
    }
    window.addEventListener('kvc-map-reset-view', onGlobalReset)
    window.addEventListener('kvc-map-focus-target', onGlobalFocusTarget)
    return () => {
      window.removeEventListener('kvc-map-reset-view', onGlobalReset)
      window.removeEventListener('kvc-map-focus-target', onGlobalFocusTarget)
    }
  }, [handleResetView, handleFocusTarget])

  // Nếu hideHeader=true (dùng trong MissionPage), vẽ bản đồ trực tiếp tràn viền 100% không qua thẻ Panel
  if (hideHeader) {
    return (
      <div className={`relative w-full h-full min-h-0 flex-1 overflow-hidden select-none ${className}`}>
        <span className="sr-only">Bản đồ định vị WGS-84</span>
        {/* Bản đồ 2D chính chiếm 100% diện tích */}
        <Map2DView
          cameraPosition={camera_position}
          target={target}
          hasTarget={has_target}
          cameraTrail={camera_trail}
          showTrails={show_trails}
          isStale={is_stale}
          rxAgeMs={rx_age_ms}
          mapInstanceRef={mapInstanceRef}
          onResetView={handleResetView}
        />

        {/* Panel Vị trí nổi chỉ hiển thị trên màn hình nhỏ/hẹp (lg:hidden) */}
        <CurrentPositionPanel onResetView={handleResetView} floating className="lg:hidden" />
      </div>
    )
  }

  return (
    <Panel
      title="Bản đồ định vị WGS-84"
      infoTip="Bản đồ không gian địa lý thời gian thực: Hiển thị vị trí kinh/vĩ độ của UAV, vệt bay lịch sử và các điểm mục tiêu Người/Tàu thuyền trên nền bản đồ OpenStreetMap / vệ tinh."
      icon={<Compass className="h-4 w-4 text-primary" />}
      noPadding
      className="h-full flex flex-col min-h-0 border-border bg-card shadow-xs"
      headerRight={
        <div className="flex items-center gap-2">
          {/* Trạng thái kết nối GNSS / Kênh truyền */}
          <StatusBadge
            label={ws_connected && hasGpsFix ? (is_stale ? 'GNSS CHẬM' : 'GNSS 3D FIX') : 'GNSS NO FIX'}
            variant={ws_connected && hasGpsFix ? (is_stale ? 'warn' : 'ok') : 'crit'}
          />

          {/* Nút Đặt lại khung nhìn */}
          <Button
            variant="outline"
            size="sm"
            onClick={handleResetView}
            disabled={!hasGpsFix}
            className="min-h-[32px] h-8 px-2.5 text-xs gap-1.5 border-border hover:border-primary/50 text-foreground font-semibold shadow-xs cursor-pointer focus-visible:ring-2 focus-visible:ring-primary"
            title="Đưa bản đồ về vị trí tải nhiệm vụ UAV"
            aria-label="Đặt lại khung nhìn về tải nhiệm vụ"
          >
            <LocateFixed className="h-3.5 w-3.5 text-primary" />
            <span className="hidden sm:inline">Đặt lại khung nhìn</span>
          </Button>
        </div>
      }
    >
      <div className="relative w-full h-full min-h-0 flex-1 overflow-hidden">
        {/* Bản đồ 2D chính chiếm 100% diện tích panel */}
        <Map2DView
          cameraPosition={camera_position}
          target={target}
          hasTarget={has_target}
          cameraTrail={camera_trail}
          showTrails={show_trails}
          isStale={is_stale}
          rxAgeMs={rx_age_ms}
          mapInstanceRef={mapInstanceRef}
          onResetView={handleResetView}
        />

        {/* Panel Vị trí nổi chỉ hiển thị trên màn hình nhỏ/hẹp (lg:hidden) để giữ bản đồ desktop thoáng đãng */}
        <CurrentPositionPanel onResetView={handleResetView} floating className="lg:hidden" />
      </div>
    </Panel>
  )
}
