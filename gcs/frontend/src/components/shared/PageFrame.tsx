import React from 'react'

/**
 * Khung trang duy nhất cho các trang dữ liệu (không áp dụng cho /mission).
 *
 * Trước đây mỗi trang tự khai `overflow` riêng và AppShell lại có
 * `overflow-y-auto lg:overflow-hidden`, nên hành vi đổi theo breakpoint và
 * trang Nhật ký bị cắt hẳn phần dưới khi màn hình thấp. PageFrame gom về một
 * trong hai biến thể, để chỉ có MỘT chủ sở hữu vùng cuộn.
 *
 * - `scroll`: nội dung cao hơn khung thì cuộn dọc (Tổng quan, Cảnh báo,
 *   Thiết bị, Cài đặt, Nhật ký).
 * - `fixed`: nội dung tự quản vùng cuộn bên trong, cả trang không cuộn.
 *
 * `maxWidthClass` và `paddingClass` là prop rời (không ghép qua `className`)
 * để không tạo hai utility cùng thuộc tính padding — Tailwind không đảm bảo
 * thứ tự thắng giữa `p-3` và `p-2.5` khi cả hai cùng có mặt.
 */

export type PageFrameVariant = 'scroll' | 'fixed'

export interface PageFrameProps {
  variant?: PageFrameVariant
  maxWidthClass?: string
  paddingClass?: string
  className?: string
  children: React.ReactNode
}

export const PageFrame: React.FC<PageFrameProps> = ({
  variant = 'scroll',
  maxWidthClass = 'max-w-7xl',
  paddingClass = 'p-3 sm:p-5',
  className = '',
  children,
}) => (
  <div
    data-page-frame={variant}
    className={`flex-1 min-h-0 w-full mx-auto flex flex-col kvc-density-gap select-none ${paddingClass} ${maxWidthClass} ${
      variant === 'scroll' ? 'overflow-y-auto overflow-x-hidden' : 'overflow-hidden'
    } ${className}`}
  >
    {children}
  </div>
)
