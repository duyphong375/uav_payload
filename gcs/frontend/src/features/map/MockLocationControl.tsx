import React, { useState } from 'react'
import { Locate, RotateCcw, Loader2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from '@/components/ui/tooltip'
import { mockSourceInstance } from '@/mocks/mockSource'
import { requestCurrentLocation } from '@/mocks/scenarios'

interface MockLocationControlProps {
  onLocationUpdated?: (lat: number, lon: number) => void
  className?: string
}

export const MockLocationControl: React.FC<MockLocationControlProps> = ({
  onLocationUpdated,
  className = '',
}) => {
  const [loading, setLoading] = useState(false)
  const [errorMessage, setErrorMessage] = useState<string | null>(null)
  const [locState, setLocState] = useState(() => mockSourceInstance.getBaseLocation())

  const handleGetCurrentLocation = async () => {
    setLoading(true)
    setErrorMessage(null)
    try {
      const { lat, lon } = await requestCurrentLocation()
      mockSourceInstance.setBaseLocation(lat, lon)
      setLocState({ lat, lon, isCustom: true })
      onLocationUpdated?.(lat, lon)
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Lỗi lấy vị trí GPS từ trình duyệt'
      setErrorMessage(msg)
    } finally {
      setLoading(false)
    }
  }

  const handleResetLocation = () => {
    mockSourceInstance.resetBaseLocation()
    const updated = mockSourceInstance.getBaseLocation()
    setLocState(updated)
    setErrorMessage(null)
    onLocationUpdated?.(updated.lat, updated.lon)
  }

  return (
    <div className={`flex items-center gap-1 ${className}`}>
      <Tooltip>
        <TooltipTrigger asChild>
          <Button
            variant={locState.isCustom ? 'default' : 'outline'}
            size="sm"
            onClick={handleGetCurrentLocation}
            disabled={loading}
            className={`h-7 px-2 text-xs gap-1 border transition-all ${
              locState.isCustom
                ? 'bg-[var(--kvc-ok-fill)] hover:bg-[var(--kvc-ok-fill)] text-[var(--kvc-text-on-fill)] border-[var(--kvc-ok-line)] shadow-xs'
                : 'text-muted-foreground hover:text-foreground border-border/70'
            }`}
            aria-label="Lấy định vị GPS thiết bị hiện tại cho MOCK"
          >
            {loading ? (
              <Loader2 className="h-3.5 w-3.5 animate-spin text-[var(--kvc-accent-ink)]" />
            ) : (
              <Locate className={`h-3.5 w-3.5 ${locState.isCustom ? 'text-[var(--kvc-text-on-overlay)]' : 'text-[var(--kvc-accent-ink)]'}`} />
            )}
            <span className="hidden sm:inline">
              {locState.isCustom ? 'GPS Thực Tế' : 'Lấy GPS Tôi'}
            </span>
          </Button>
        </TooltipTrigger>
        <TooltipContent side="bottom" className="max-w-xs text-xs">
          {locState.isCustom ? (
            <p>
              Đang mô phỏng bay tại vị trí thực tế của bạn ({locState.lat.toFixed(4)}°, {locState.lon.toFixed(4)}°).
            </p>
          ) : (
            <p>
              Lấy tọa độ GPS thực tế của thiết bị bạn (trình duyệt) để UAV trong chế độ MOCK bay quanh vị trí của bạn.
            </p>
          )}
          {errorMessage && <p className="text-[var(--kvc-warn-ink)] mt-1">{errorMessage}</p>}
        </TooltipContent>
      </Tooltip>

      {locState.isCustom && (
        <Tooltip>
          <TooltipTrigger asChild>
            <Button
              variant="ghost"
              size="icon"
              onClick={handleResetLocation}
              className="h-7 w-7 text-muted-foreground hover:text-foreground"
              aria-label="Khôi phục tọa độ MOCK mặc định (Đại Lộc, Quảng Nam)"
            >
              <RotateCcw className="h-3 w-3" />
            </Button>
          </TooltipTrigger>
          <TooltipContent side="bottom" className="text-xs">
            <p>Khôi phục tọa độ MOCK về vùng sông Thu Bồn (Quảng Nam)</p>
          </TooltipContent>
        </Tooltip>
      )}
    </div>
  )
}
