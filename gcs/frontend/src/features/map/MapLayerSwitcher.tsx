import React from 'react'
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from '@/components/ui/tooltip'
import type { MapViewMode } from '@/types/telemetry'

interface MapLayerSwitcherProps {
  mode: MapViewMode
  onToggle: () => void
  disabled?: boolean
  className?: string
}

/**
 * Nút chuyển đổi lớp bản đồ chuẩn phong cách Google Maps (Vệ tinh ↔ Bản đồ)
 * Đặt nổi tại góc dưới bên trái của khung bản đồ.
 */
export const MapLayerSwitcher: React.FC<MapLayerSwitcherProps> = ({
  mode,
  onToggle,
  disabled = false,
  className = '',
}) => {
  const is2D = mode === '2D'
  const positionClass = className || 'bottom-24 right-3 z-[390]'

  return (
    <div className={`absolute select-none ${positionClass}`}>
      <Tooltip>
        <TooltipTrigger asChild>
          <button
            type="button"
            onClick={onToggle}
            disabled={disabled}
            className={`group relative flex flex-col items-center focus:outline-hidden transition-transform duration-200 hover:scale-105 active:scale-95 ${
              disabled ? 'opacity-50 cursor-not-allowed' : 'cursor-pointer'
            }`}
            aria-label={is2D ? 'Chuyển sang chế độ Vệ tinh 3D' : 'Chuyển sang chế độ Bản đồ 2D'}
          >
            {/* Khung thumbnail hình vuông bo góc chuẩn Google Maps (44x44px) */}
            <div
              className={`relative w-11 h-11 sm:w-12 sm:h-12 rounded-lg overflow-hidden shadow-md transition-all duration-200 ${
                is2D
                  ? 'border-2 border-cyan-500 shadow-cyan-500/25 group-hover:border-cyan-400 group-hover:shadow-lg'
                  : 'border-2 border-slate-300 dark:border-slate-600 shadow-black/20 group-hover:border-cyan-400 group-hover:shadow-lg'
              }`}
            >
              {is2D ? (
                /* Ảnh thumbnail Vệ tinh: Nền xanh rừng rậm, đường nhựa uốn cong & vạch trắng đứt đoạn */
                <svg
                  viewBox="0 0 48 48"
                  className="w-full h-full object-cover"
                  xmlns="http://www.w3.org/2000/svg"
                  aria-hidden="true"
                >
                  <defs>
                    <linearGradient id="satGrass" x1="0%" y1="0%" x2="100%" y2="100%">
                      <stop offset="0%" stopColor="#254336" />
                      <stop offset="100%" stopColor="#1b3026" />
                    </linearGradient>
                    <linearGradient id="satRoad" x1="0%" y1="0%" x2="100%" y2="100%">
                      <stop offset="0%" stopColor="#525b68" />
                      <stop offset="100%" stopColor="#3d4450" />
                    </linearGradient>
                  </defs>
                  {/* Mảng cỏ xanh địa hình vệ tinh */}
                  <rect width="48" height="48" fill="url(#satGrass)" />
                  {/* Nhánh đường phụ rẽ chéo */}
                  <path
                    d="M10,-4 C18,18 34,30 52,38"
                    stroke="#434c58"
                    strokeWidth="9"
                    fill="none"
                  />
                  {/* Tuyến đường chính cong chéo */}
                  <path
                    d="M-4,12 C16,18 28,32 36,52"
                    stroke="url(#satRoad)"
                    strokeWidth="11"
                    fill="none"
                  />
                  {/* Vạch kẻ đường đứt nét màu trắng */}
                  <path
                    d="M-4,12 C16,18 28,32 36,52"
                    stroke="#ffffff"
                    strokeWidth="1.2"
                    strokeDasharray="2.5,2.5"
                    fill="none"
                    opacity="0.9"
                  />
                  <path
                    d="M10,-4 C18,18 34,30 52,38"
                    stroke="#ffffff"
                    strokeWidth="1"
                    strokeDasharray="2,2"
                    fill="none"
                    opacity="0.8"
                  />
                </svg>
              ) : (
                /* Ảnh thumbnail Bản đồ: Bản đồ số đường phố & mảng công viên xanh */
                <svg
                  viewBox="0 0 48 48"
                  className="w-full h-full object-cover"
                  xmlns="http://www.w3.org/2000/svg"
                  aria-hidden="true"
                >
                  <rect width="48" height="48" fill="#f8fafc" />
                  {/* Mảng công viên xanh */}
                  <rect x="2" y="24" width="18" height="22" rx="2" fill="#a7f3d0" />
                  <rect x="28" y="2" width="18" height="12" rx="2" fill="#bbf7d0" />
                  {/* Tuyến phố thứ cấp */}
                  <path d="M0,18 L48,18 M24,0 L24,48 M0,34 L48,34" stroke="#cbd5e1" strokeWidth="3" />
                  {/* Tuyến đường chính màu cam */}
                  <path d="M-2,8 C18,12 34,26 50,42" stroke="#ea580c" strokeWidth="4.5" fill="none" />
                  <path d="M-2,8 C18,12 34,26 50,42" stroke="#fed7aa" strokeWidth="2.5" fill="none" />
                </svg>
              )}
            </div>

            {/* Nhãn văn bản bên dưới: "Vệ tinh" hoặc "Bản đồ" */}
            <span
              className={`mt-1 text-[11px] font-semibold tracking-tight px-1 rounded-xs transition-colors drop-shadow-sm ${
                is2D
                  ? 'text-cyan-600 dark:text-cyan-400 group-hover:text-cyan-500'
                  : 'text-slate-800 dark:text-slate-200 group-hover:text-cyan-500 dark:group-hover:text-cyan-400'
              }`}
            >
              {is2D ? 'Vệ tinh' : 'Bản đồ'}
            </span>
          </button>
        </TooltipTrigger>
        <TooltipContent side="right" className="text-xs font-normal">
          <p>
            {is2D
              ? 'Bật lớp ảnh Vệ tinh phân giải cao phong cách Google Maps'
              : 'Trở về chế độ Bản đồ số tiêu chuẩn'}
          </p>
        </TooltipContent>
      </Tooltip>
    </div>
  )
}
