import React, { useEffect, useRef, useState } from 'react'
import L from 'leaflet'
import 'leaflet/dist/leaflet.css'
import { ChevronDown, ChevronUp, LocateFixed, WifiOff } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { APP_CONFIG } from '@/config/appConfig'
import {
  formatTargetAgeLabel,
  type CameraPosition,
  type PositionHistoryPoint,
  type TargetInfo,
} from '@/types/telemetry'
import { MapLayerSwitcher } from './MapLayerSwitcher'
import { formatCoordinates, formatTimeAgo } from './positionUtils'

// SVG Custom Icon cho Camera/Tải nhiệm vụ (Không dùng animation pulse liên tục)
function createCameraIcon(heading: number | null | undefined, isStale: boolean) {
  const rotationStyle = heading !== null && heading !== undefined ? `transform: rotate(${heading}deg);` : ''
  const opacity = isStale ? '0.6' : '1'

  return L.divIcon({
    className: 'kvc-camera-marker-icon',
    html: `
      <div style="position: relative; width: 34px; height: 34px; display: flex; align-items: center; justify-content: center; opacity: ${opacity};">
        <div style="width: 24px; height: 24px; border-radius: 50%; background: #0284c7; border: 2.5px solid #ffffff; display: flex; align-items: center; justify-content: center; box-shadow: 0 2px 8px rgba(0,0,0,0.45); ${rotationStyle}">
          ${
            heading !== null && heading !== undefined
              ? `<svg width="13" height="13" viewBox="0 0 24 24" fill="#ffffff" stroke="#ffffff" stroke-width="1"><polygon points="12 3 20 21 12 17 4 21 12 3"/></svg>`
              : `<svg width="8" height="8" viewBox="0 0 24 24" fill="#ffffff"><circle cx="12" cy="12" r="8"/></svg>`
          }
        </div>
      </div>
    `,
    iconSize: [34, 34],
    iconAnchor: [17, 17],
    popupAnchor: [0, -17],
  })
}

// SVG Custom Icon cho Mục tiêu cứu nạn (Icon tĩnh, không nhấp nháy liên tục)
function createTargetIcon(className: string, isStale: boolean) {
  const isPerson = className === 'person'
  const bgColor = isPerson ? '#ef4444' : '#f59e0b'
  const staleCross = isStale
    ? '<span style="position:absolute;width:28px;height:3px;background:#f59e0b;transform:rotate(-45deg);border-radius:2px;box-shadow:0 0 0 1px #ffffff;"></span>'
    : ''

  return L.divIcon({
    className: 'kvc-target-marker-icon',
    html: `
      <div style="position: relative; width: 32px; height: 32px; display: flex; align-items: center; justify-content: center; opacity: ${isStale ? '0.55' : '1'};">
        <div style="width: 24px; height: 24px; border-radius: 50%; background: ${bgColor}; border: 2px solid #ffffff; display: flex; align-items: center; justify-content: center; box-shadow: 0 2px 8px rgba(0,0,0,0.45);">
          <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="#ffffff" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
            <circle cx="12" cy="12" r="9"/>
            <line x1="12" y1="3" x2="12" y2="7"/>
            <line x1="12" y1="17" x2="12" y2="21"/>
            <line x1="3" y1="12" x2="7" y2="12"/>
            <line x1="17" y1="12" x2="21" y2="12"/>
          </svg>
        </div>
        ${staleCross}
      </div>
    `,
    iconSize: [32, 32],
    iconAnchor: [16, 16],
    popupAnchor: [0, -16],
  })
}

// Tính toán đa giác vùng quan sát quang học (Camera FOV polygon)
function calculateFovPolygon(
  lat: number,
  lng: number,
  headingDeg: number | null | undefined,
  altM: number | null | undefined
): [number, number][] | null {
  if (headingDeg === null || headingDeg === undefined) return null
  const alt = Math.max(altM ?? 25, 10)
  // Chiều dài vệt chiếu xuống mặt đất xấp xỉ theo độ cao và góc chúc 45 độ
  const groundDistanceM = alt * 1.0
  const fovAngleDeg = 45 // Góc mở ống kính

  // Đổi mét sang độ vĩ/kinh (xấp xỉ: 1m ≈ 0.000009 độ)
  const degPerMeterLat = 0.000009
  const degPerMeterLng = 0.000009 / Math.cos((lat * Math.PI) / 180)

  const leftHeadingRad = ((headingDeg - fovAngleDeg / 2) * Math.PI) / 180
  const rightHeadingRad = ((headingDeg + fovAngleDeg / 2) * Math.PI) / 180

  const p1: [number, number] = [lat, lng]
  const p2: [number, number] = [
    lat + Math.cos(leftHeadingRad) * groundDistanceM * degPerMeterLat,
    lng + Math.sin(leftHeadingRad) * groundDistanceM * degPerMeterLng,
  ]
  const p3: [number, number] = [
    lat + Math.cos(rightHeadingRad) * groundDistanceM * degPerMeterLat,
    lng + Math.sin(rightHeadingRad) * groundDistanceM * degPerMeterLng,
  ]

  return [p1, p2, p3]
}

// Tạo Leaflet tileLayer hỗ trợ zoom mượt mà, chống mất hình ảnh khi phóng to (Zoom in)
function createTileLayer(
  satellite: boolean,
  onTileError: () => void
): L.TileLayer {
  const tileUrl = satellite
    ? APP_CONFIG.MAP_SATELLITE_TILE_URL
    : APP_CONFIG.MAP_TILE_URL
  const isGoogle = tileUrl.includes('google')
  const tileAttr = satellite
    ? (isGoogle ? '&copy; Google Maps Satellite' : '&copy; Esri World Imagery')
    : APP_CONFIG.MAP_ATTRIBUTION

  // maxNativeZoom:
  // - Google Maps: cung cấp ảnh gốc đến zoom 20
  // - Esri: cung cấp ảnh gốc đến zoom 18 (tránh lỗi trả ảnh xám 'Map data not yet available')
  // - OpenStreetMap: cung cấp ảnh gốc đến zoom 19
  // maxZoom: 21 (cho phép phóng to cận cảnh; Leaflet tự động upscale ảnh cấp cao nhất thay vì mất hình)
  const maxNativeZoom = satellite ? (isGoogle ? 20 : 18) : 19
  const subdomains = isGoogle ? ['0', '1', '2', '3'] : ['a', 'b', 'c']

  const layer = L.tileLayer(tileUrl, {
    attribution: tileAttr,
    maxZoom: 21,
    maxNativeZoom,
    subdomains,
    keepBuffer: 8,
    updateWhenIdle: false,
    updateInterval: 100,
  })

  layer.on('tileerror', onTileError)

  return layer
}

interface Map2DViewProps {
  cameraPosition: CameraPosition
  target: TargetInfo | null
  hasTarget: boolean
  cameraTrail: PositionHistoryPoint[]
  showTrails: boolean
  isStale: boolean
  rxAgeMs: number
  mapInstanceRef: React.MutableRefObject<L.Map | null>
  onResetView?: () => void
}

export const Map2DView: React.FC<Map2DViewProps> = ({
  cameraPosition,
  target,
  hasTarget,
  cameraTrail,
  showTrails,
  isStale,
  rxAgeMs,
  mapInstanceRef,
  onResetView,
}) => {
  const mapContainerRef = useRef<HTMLDivElement | null>(null)
  const cameraMarkerRef = useRef<L.Marker | null>(null)
  const targetMarkerRef = useRef<L.Marker | null>(null)
  const targetMarkersMapRef = useRef<Map<string | number, { marker: L.Marker; lastSeen: number }>>(new Map())
  const trailPolylineRef = useRef<L.Polyline | null>(null)
  const lineToTargetRef = useRef<L.Polyline | null>(null)
  const fovPolygonRef = useRef<L.Polygon | null>(null)

  const [tileError, setTileError] = useState(false)
  const [newPositionOutsideView, setNewPositionOutsideView] = useState(false)
  const [isSatellite, setIsSatellite] = useState(false)
  // Cho phép thu gọn cảnh báo Mất Fix GNSS thành thanh chip nổi để tăng diện tích hiển thị bản đồ
  const [isGnssAlertCollapsed, setIsGnssAlertCollapsed] = useState<boolean>(true)
  const lastMarkerUpdateRef = useRef<number>(0)
  const tileLayerRef = useRef<L.TileLayer | null>(null)

  const hasGpsFix = Boolean(
    cameraPosition.is_valid &&
    cameraPosition.latitude !== null &&
    cameraPosition.longitude !== null
  )

  // 1. Khởi tạo bản đồ Leaflet một lần duy nhất (Giữ nguyên instance, không remount)
  useEffect(() => {
    if (!mapContainerRef.current) return

    if (mapInstanceRef.current) {
      mapInstanceRef.current.invalidateSize()
      return
    }

    const initialCenter: [number, number] = [
      cameraPosition.latitude ?? APP_CONFIG.DEFAULT_CENTER.lat,
      cameraPosition.longitude ?? APP_CONFIG.DEFAULT_CENTER.lng,
    ]

    const map = L.map(mapContainerRef.current, {
      center: initialCenter,
      zoom: APP_CONFIG.DEFAULT_CENTER.zoom,
      maxZoom: 21,
      minZoom: 3,
      zoomControl: false, // Tùy biến vị trí zoom ở góc dưới phải để không che phủ panel thông tin
    })

    // Đặt Zoom Control ở góc dưới phải (Google Maps style)
    L.control.zoom({ position: 'bottomright' }).addTo(map)

    const tileLayer = createTileLayer(isSatellite, () => setTileError(true))
    tileLayer.addTo(map)
    tileLayerRef.current = tileLayer

    // Lớp vệt bay lịch sử (Trail)
    const trailPolyline = L.polyline([], {
      color: '#0284c7',
      weight: 2.5,
      opacity: 0.6,
      dashArray: '4, 6',
    }).addTo(map)
    trailPolylineRef.current = trailPolyline

    // Lớp đường nối đơn giản giữa UAV và Mục tiêu
    const lineToTarget = L.polyline([], {
      color: '#ef4444',
      weight: 1.5,
      opacity: 0.65,
      dashArray: '3, 4',
    }).addTo(map)
    lineToTargetRef.current = lineToTarget

    // Lớp vùng quan sát (Camera FOV cone)
    const fovPolygon = L.polygon([], {
      color: '#0284c7',
      fillColor: '#0ea5e9',
      fillOpacity: 0.12,
      weight: 1,
      dashArray: '2, 3',
    }).addTo(map)
    fovPolygonRef.current = fovPolygon

    mapInstanceRef.current = map

    // Lắng nghe sự kiện người dùng di chuyển hoặc zoom bản đồ để cập nhật kiểm tra bounds
    const checkBounds = () => {
      if (
        hasGpsFix &&
        cameraPosition.latitude !== null &&
        cameraPosition.longitude !== null
      ) {
        const bounds = map.getBounds()
        const isInside = bounds.contains([cameraPosition.latitude, cameraPosition.longitude])
        setNewPositionOutsideView(!isInside)
      } else {
        setNewPositionOutsideView(false)
      }
    }

    map.on('moveend', checkBounds)

    let resizeObserver: ResizeObserver | null = null
    if (typeof ResizeObserver !== 'undefined') {
      resizeObserver = new ResizeObserver(() => {
        if (mapInstanceRef.current) {
          mapInstanceRef.current.invalidateSize()
        }
      })
      resizeObserver.observe(mapContainerRef.current)
    }

    return () => {
      if (resizeObserver) {
        resizeObserver.disconnect()
      }
      map.remove()
      mapInstanceRef.current = null
      tileLayerRef.current = null
      cameraMarkerRef.current = null
      targetMarkerRef.current = null
      targetMarkersMapRef.current.forEach((val) => {
        map.removeLayer(val.marker)
      })
      targetMarkersMapRef.current.clear()
      trailPolylineRef.current = null
      lineToTargetRef.current = null
      fovPolygonRef.current = null
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mapInstanceRef])

  // Chuyển đổi lớp bản đồ nền (Bản đồ số OSM ↔ Ảnh Vệ Tinh Google Maps phong cách)
  useEffect(() => {
    const map = mapInstanceRef.current
    if (!map) return

    if (tileLayerRef.current) {
      map.removeLayer(tileLayerRef.current)
    }

    setTileError(false)
    const newTileLayer = createTileLayer(isSatellite, () => setTileError(true))
    newTileLayer.addTo(map)
    tileLayerRef.current = newTileLayer
  }, [isSatellite, mapInstanceRef])

  // 2. Cập nhật Marker vị trí UAV (Không tự động pan hoặc zoom bản đồ!)
  useEffect(() => {
    const map = mapInstanceRef.current
    if (!map) return

    if (hasGpsFix && cameraPosition.latitude !== null && cameraPosition.longitude !== null) {
      const pos: L.LatLngExpression = [cameraPosition.latitude, cameraPosition.longitude]
      const icon = createCameraIcon(cameraPosition.heading_deg, isStale)

      // Tooltip tối giản theo Mục 3: Chỉ Tên/mã, Lat/Lon, Thời điểm cập nhật
      const tooltipContent = `
        <div style="font-family: system-ui, sans-serif; font-size: 11px; line-height: 1.4; padding: 2px;">
          <div style="font-weight: 700; color: #0284c7; margin-bottom: 2px;">Tải nhiệm vụ UAV KVC</div>
          <div style="font-family: monospace;">Lat: ${cameraPosition.latitude.toFixed(6)}°</div>
          <div style="font-family: monospace;">Lon: ${cameraPosition.longitude.toFixed(6)}°</div>
          <div style="font-size: 10px; color: #64748b; margin-top: 2px;">Cập nhật: ${rxAgeMs} ms trước</div>
        </div>
      `

      // Throttling cập nhật marker (250ms) để chống nhấp nháy khi packet đến dồn dập
      const now = performance.now()
      if (now - lastMarkerUpdateRef.current >= 200 || !cameraMarkerRef.current) {
        lastMarkerUpdateRef.current = now

        if (!cameraMarkerRef.current) {
          const marker = L.marker(pos, { icon, zIndexOffset: 100 }).addTo(map)
          marker.bindTooltip(tooltipContent, { permanent: false, direction: 'top', offset: [0, -18] })
          cameraMarkerRef.current = marker
        } else {
          cameraMarkerRef.current.setLatLng(pos)
          cameraMarkerRef.current.setIcon(icon)
          cameraMarkerRef.current.setTooltipContent(tooltipContent)
        }

        // Cập nhật Vùng quan sát (FOV cone)
        if (fovPolygonRef.current) {
          const fovPoints = calculateFovPolygon(
            cameraPosition.latitude,
            cameraPosition.longitude,
            cameraPosition.heading_deg,
            cameraPosition.altitude_m
          )
          if (fovPoints) {
            fovPolygonRef.current.setLatLngs(fovPoints)
          } else {
            fovPolygonRef.current.setLatLngs([])
          }
        }

        // Kiểm tra xem vị trí mới có nằm ngoài viewport của người dùng không
        const bounds = map.getBounds()
        const isInside = bounds.contains(pos)
        setNewPositionOutsideView(!isInside)
      }
    } else {
      if (cameraMarkerRef.current) {
        if (!cameraPosition.last_updated_iso) {
          map.removeLayer(cameraMarkerRef.current)
          cameraMarkerRef.current = null
        } else {
          cameraMarkerRef.current.setIcon(createCameraIcon(null, true))
        }
      }
      if (fovPolygonRef.current) {
        fovPolygonRef.current.setLatLngs([])
      }
      setNewPositionOutsideView(false)
    }
  }, [hasGpsFix, cameraPosition, isStale, rxAgeMs, mapInstanceRef])

  // 3. Cập nhật Marker Mục tiêu & Đường nối đơn giản
  useEffect(() => {
    const map = mapInstanceRef.current
    if (!map) return

    const hasValidWgsTarget =
      hasTarget &&
      target &&
      target.pos_valid &&
      target.coordinate_frame !== 'LOCAL_GRID' &&
      target.latitude !== null &&
      target.longitude !== null

    if (hasValidWgsTarget && target.latitude !== null && target.longitude !== null) {
      const pos: L.LatLngExpression = [target.latitude, target.longitude]
      const targetIsStale = isStale || (target.age_ms ?? 0) > APP_CONFIG.STALE_THRESHOLD_MS
      const icon = createTargetIcon(target.class_name, targetIsStale)

      // Tooltip tối giản theo Mục 3: Chỉ Tên/mã, Lat/Lon, Thời điểm cập nhật
      const targetTooltipContent = `
        <div style="font-family: system-ui, sans-serif; font-size: 11px; line-height: 1.4; padding: 2px;">
          <div style="font-weight: 700; color: #ef4444; margin-bottom: 2px;">
            Mục tiêu #${target.track_id ?? '101'}
          </div>
          <div style="font-family: monospace;">Lat: ${target.latitude.toFixed(6)}°</div>
          <div style="font-family: monospace;">Lon: ${target.longitude.toFixed(6)}°</div>
          <div style="font-size: 10px; color: ${targetIsStale ? '#d97706' : '#64748b'}; margin-top: 2px;">${formatTargetAgeLabel(target.age_ms, APP_CONFIG.STALE_THRESHOLD_MS)}</div>
        </div>
      `

      const targetId = target.track_id ?? target.class_id ?? 1
      const now = Date.now()
      const existing = targetMarkersMapRef.current.get(targetId)

      if (!existing) {
        const marker = L.marker(pos, { icon, zIndexOffset: 200 }).addTo(map)
        marker.bindTooltip(targetTooltipContent, { permanent: false, direction: 'top', offset: [0, -16] })
        targetMarkersMapRef.current.set(targetId, { marker, lastSeen: now })
      } else {
        existing.marker.setLatLng(pos)
        existing.marker.setIcon(icon)
        existing.marker.setTooltipContent(targetTooltipContent)
        existing.lastSeen = now
      }

      // Tự động thu dọn các mục tiêu cũ quá 20 giây không có tín hiệu cập nhật
      targetMarkersMapRef.current.forEach((val, id) => {
        if (now - val.lastSeen > 20000) {
          map.removeLayer(val.marker)
          targetMarkersMapRef.current.delete(id)
        }
      })

      // Cập nhật đường nối đơn giản giữa UAV và Mục tiêu gần nhất
      if (
        lineToTargetRef.current &&
        hasGpsFix &&
        cameraPosition.latitude !== null &&
        cameraPosition.longitude !== null
      ) {
        lineToTargetRef.current.setLatLngs([
          [cameraPosition.latitude, cameraPosition.longitude],
          pos,
        ])
      }
    } else {
      if (!hasTarget) {
        targetMarkersMapRef.current.forEach((val) => {
          map.removeLayer(val.marker)
        })
        targetMarkersMapRef.current.clear()
      }
      if (targetMarkerRef.current) {
        map.removeLayer(targetMarkerRef.current)
        targetMarkerRef.current = null
      }
      if (lineToTargetRef.current) {
        lineToTargetRef.current.setLatLngs([])
      }
    }
  }, [hasTarget, target, hasGpsFix, cameraPosition, isStale, mapInstanceRef])

  // 4. Cập nhật Vệt di chuyển (Trail)
  useEffect(() => {
    if (!trailPolylineRef.current) return

    if (showTrails && cameraTrail.length > 1) {
      const latlngs: L.LatLngExpression[] = cameraTrail.map((pt) => [pt.latitude, pt.longitude])
      trailPolylineRef.current.setLatLngs(latlngs)
    } else {
      trailPolylineRef.current.setLatLngs([])
    }
  }, [cameraTrail, showTrails])

  // Hàm xử lý đặt lại khung nhìn về vị trí UAV
  const handleResetToUav = () => {
    if (onResetView) {
      onResetView()
    } else if (
      mapInstanceRef.current &&
      hasGpsFix &&
      cameraPosition.latitude !== null &&
      cameraPosition.longitude !== null
    ) {
      mapInstanceRef.current.setView([cameraPosition.latitude, cameraPosition.longitude], 17, {
        animate: true,
      })
    }
    setNewPositionOutsideView(false)
  }

  return (
    <div className="relative w-full h-full flex flex-col bg-[#e2e8f0] dark:bg-[#1e293b] overflow-hidden select-none">
      {/* Khung bản đồ Leaflet */}
      <div ref={mapContainerRef} className="w-full h-full z-0 cursor-grab active:cursor-grabbing" />

      {/* Nút nhỏ nổi: "Có vị trí mới" khi UAV ở ngoài vùng xem hiện tại của người dùng (Quy tắc chống nhấp nháy Mục 7) */}
      {newPositionOutsideView && (
        <div className="absolute top-3 right-3 z-[var(--kvc-z-panel)] pointer-events-auto">
          <Button
            size="sm"
            variant="default"
            onClick={handleResetToUav}
            className="h-7 text-xs px-2.5 gap-1.5 bg-primary text-primary-foreground hover:bg-primary/90 shadow-md font-medium"
            title="Nhấp để đưa bản đồ về tọa độ mới nhất của tải nhiệm vụ"
          >
            <LocateFixed className="h-3.5 w-3.5" />
            <span>Có vị trí mới ngoài khung nhìn</span>
          </Button>
        </div>
      )}

      {/* Cảnh báo Mất Fix / Giữ vị trí cuối dạng thanh thu để tăng diện tích hiển thị bản đồ */}
      {!hasGpsFix && (
        <div className="absolute top-14 left-1/2 -translate-x-1/2 z-[var(--kvc-z-banner)] pointer-events-auto">
          {isGnssAlertCollapsed ? (
            <button
              type="button"
              onClick={() => setIsGnssAlertCollapsed(false)}
              className="flex items-center gap-1.5 px-3 py-1 rounded-full bg-[var(--kvc-overlay)] border border-[var(--kvc-warn-line)] shadow-sm text-[var(--kvc-warn-ink)] hover:text-[var(--kvc-warn-ink)] hover:bg-[var(--kvc-surface-2)] transition-all text-xs cursor-pointer animate-in fade-in"
              title="Nhấp để xem chi tiết cảnh báo mất khóa GNSS"
              aria-label="Xem chi tiết cảnh báo mất khóa GNSS"
            >
              <WifiOff className="h-3.5 w-3.5 text-[var(--kvc-warn-ink)] " />
              <span className="font-semibold">Mất Khóa Vệ Tinh (GNSS)</span>
              <span className="text-[11px] text-[var(--kvc-warn-ink)]/80 hidden sm:inline">• Giữ vị trí cuối</span>
              <ChevronDown className="h-3 w-3 text-[var(--kvc-warn-ink)] ml-0.5" />
            </button>
          ) : (
            <div className="kvc-on-overlay max-w-sm bg-[var(--kvc-overlay)] border border-[var(--kvc-warn-line)] p-3 rounded-kvc-panel shadow-sm text-center relative animate-in fade-in zoom-in-95 text-[var(--kvc-text-on-overlay)]">
              <button
                type="button"
                onClick={() => setIsGnssAlertCollapsed(true)}
                className="absolute top-2 right-2 text-[var(--kvc-text-on-overlay-muted)] hover:text-[var(--kvc-text-on-overlay)] p-1 rounded-kvc-control hover:bg-[var(--kvc-surface-2)]/40 cursor-pointer"
                title="Thu nhỏ cảnh báo để xem bản đồ"
                aria-label="Thu nhỏ cảnh báo GNSS"
              >
                <ChevronUp className="h-4 w-4" />
              </button>
              <WifiOff className="h-5 w-5 text-[var(--kvc-warn-ink)] mx-auto mb-1.5" />
              <h4 className="text-xs font-semibold text-[var(--kvc-text-on-overlay)] mb-1">Mất Khóa Vệ Tinh (GNSS)</h4>
              <p className="text-[11px] text-[var(--kvc-text-on-overlay-muted)] mb-1.5">
                {cameraPosition.last_updated_iso
                  ? `Vị trí cuối nhận: ${formatCoordinates(cameraPosition.latitude, cameraPosition.longitude)} (${formatTimeAgo(cameraPosition.last_updated_iso)})`
                  : 'Chưa nhận được gói tin tọa độ hợp lệ từ tải nhiệm vụ.'}
              </p>
              <div className="text-[11px] text-[var(--kvc-warn-ink)] font-medium">
                Vị trí marker làm mờ để tránh nhầm lẫn với dữ liệu trực tiếp.
              </div>
            </div>
          )}
        </div>
      )}

      {/* Nút chuyển đổi lớp Bản đồ ↔ Vệ tinh phong cách Google Maps ở góc dưới trái */}
      <MapLayerSwitcher
        mode={isSatellite ? '3D' : '2D'}
        onToggle={() => setIsSatellite((prev) => !prev)}
      />

      {/* Banner thông báo tile offline nếu không có mạng */}
      {tileError && (
        <div className="absolute bottom-20 left-3 z-[var(--kvc-z-map-overlay)] bg-[var(--kvc-surface)]/95 border border-[var(--kvc-line)] px-2.5 py-1 rounded-kvc-control text-[11px] text-muted-foreground shadow-xs pointer-events-none">
          Bản đồ nền Internet không phản hồi (Chế độ xem độc lập nội bộ)
        </div>
      )}
    </div>
  )
}
