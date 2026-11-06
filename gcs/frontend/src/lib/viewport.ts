import React from 'react'

/**
 * Ngưỡng chiều cao khả dụng của khung nhìn.
 *
 * Lỗi bố cục của GCS trước đây xảy ra theo CHIỀU CAO, không theo chiều rộng:
 * laptop 1366×768 có thanh trình duyệt chỉ còn ~640 px, hoặc zoom 125 %.
 * Toàn bộ breakpoint `sm/md/lg` của Tailwind đều đo chiều rộng nên không bắt
 * được các trường hợp này. Các hằng số dưới đây là nguồn duy nhất để component
 * quyết định thu gọn theo chiều cao; không hardcode lại số trong JSX.
 */

/** Dưới ngưỡng này, dock tác chiến mặc định thu nhỏ và PiP mặc định đóng. */
export const COMPACT_HEIGHT_PX = 760

/** Dưới ngưỡng này, bảng số đo radar chuyển thành nút mở/đóng. */
export const TIGHT_HEIGHT_PX = 700

/** Chiều cao ước tính của dock khi mở rộng, dùng để chừa chỗ cho PiP. */
export const DOCK_RESERVED_HEIGHT_PX = 132

export type HeightTier = 'regular' | 'compact' | 'tight'

export function heightTierOf(heightPx: number): HeightTier {
  if (heightPx < TIGHT_HEIGHT_PX) return 'tight'
  if (heightPx < COMPACT_HEIGHT_PX) return 'compact'
  return 'regular'
}

/**
 * Đọc chiều cao khả dụng hiện tại. Trả `regular` khi không có `window`
 * (SSR/unit test) để hành vi mặc định không đổi so với trước.
 */
export function currentHeightTier(): HeightTier {
  if (typeof window === 'undefined') return 'regular'
  return heightTierOf(window.innerHeight)
}

/**
 * Theo dõi chiều cao khả dụng và trả về tier hiện tại.
 *
 * Dùng `resize` thay cho `matchMedia` để một listener duy nhất phục vụ cả ba
 * ngưỡng; số lần đổi tier trong một phiên là rất nhỏ nên không cần debounce.
 */
export function useHeightTier(): HeightTier {
  const [tier, setTier] = React.useState<HeightTier>(currentHeightTier)

  React.useEffect(() => {
    if (typeof window === 'undefined') return
    const onChange = () => setTier(heightTierOf(window.innerHeight))
    onChange()
    window.addEventListener('resize', onChange)
    return () => window.removeEventListener('resize', onChange)
  }, [])

  return tier
}
