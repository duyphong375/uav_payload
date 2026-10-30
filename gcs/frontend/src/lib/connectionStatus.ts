import { APP_CONFIG } from '@/config/appConfig'
import type { HardwareLink, SourceMode } from '@/types/telemetry'

export type Esp32PhysicalStatus =
  | 'MOCK'          // Đang ở chế độ mô phỏng (LOCAL hoặc BACKEND)
  | 'REPLAY'        // Đang ở chế độ phát lại nhật ký
  | 'BACKEND_DOWN'  // Trình duyệt mất kết nối với GCS Backend (:8000)
  | 'WAITING'       // Chế độ REAL chưa khả dụng do thiếu Ingress hoặc chưa có tin từ ESP32
  | 'LIVE'          // ESP32 Gateway đang truyền dữ liệu trực tiếp (< 3000ms)
  | 'LOST_SIGNAL'   // Mất tín hiệu từ ESP32 Gateway (> 3000ms)

export interface Esp32StatusDescriptor {
  status: Esp32PhysicalStatus
  label: string
  shortLabel: string
  description: string
  badgeVariant: 'default' | 'destructive' | 'outline' | 'secondary'
  badgeColorClass: string
  dotColorClass: string
  pingClass: string | null
  iconName: 'radio' | 'radio-off' | 'wifi-off' | 'flask'
}

/**
 * Xác định chính xác tình trạng kết nối vật lý giữa Gateway ESP32-C3 và Backend GCS
 * theo nguyên tắc không suy đoán, phản ánh đúng tín hiệu thực tế.
 */
export function getEsp32PhysicalStatus(
  sourceMode: SourceMode,
  wsConnected: boolean,
  hardwareLink: HardwareLink,
  isStale: boolean,
  rxAgeMs: number
): Esp32StatusDescriptor {
  if (sourceMode === 'MOCK') {
    const isBackend = APP_CONFIG.MOCK_TRANSPORT === 'BACKEND'
    return {
      status: 'MOCK',
      label: isBackend ? 'MÔ PHỎNG BACKEND (LOOPBACK)' : 'MÔ PHỎNG CỤC BỘ (LOCAL)',
      shortLabel: isBackend ? 'MÔ PHỎNG (BACKEND)' : 'MÔ PHỎNG (LOCAL)',
      description: isBackend
        ? 'Dữ liệu giả lập phát từ dịch vụ Backend FastAPI (:8000) lưu SQLite'
        : 'Trình duyệt tự sinh kịch bản mô phỏng offline (không kết nối Backend)',
      badgeVariant: 'outline',
      badgeColorClass: 'border-[var(--kvc-mock-line)] text-[var(--kvc-mock-ink)] bg-[var(--kvc-mock-bg)]',
      dotColorClass: 'bg-[var(--kvc-mock)]',
      pingClass: null,
      iconName: 'flask',
    }
  }

  if (sourceMode === 'REPLAY') {
    return {
      status: 'REPLAY',
      label: 'PHÁT LẠI NHẬT KÝ (REPLAY)',
      shortLabel: 'REPLAY',
      description: 'Đang phát lại dữ liệu nhật ký từ cơ sở dữ liệu SQLite đã ghi',
      badgeVariant: 'outline',
      badgeColorClass: 'border-[var(--kvc-accent-line)] text-[var(--kvc-accent-ink)] bg-[var(--kvc-accent-bg)]',
      dotColorClass: 'bg-[var(--kvc-accent)]',
      pingClass: null,
      iconName: 'radio',
    }
  }

  // Chế độ REAL nhưng chưa kết nối được tới dịch vụ GCS Backend nội bộ
  if (!wsConnected) {
    return {
      status: 'BACKEND_DOWN',
      label: 'BACKEND: MẤT KẾT NỐI',
      shortLabel: 'MẤT KẾT NỐI',
      description: 'Trình duyệt mất kết nối tới Backend FastAPI (cổng 8000). Hãy kiểm tra dịch vụ backend.',
      badgeVariant: 'destructive',
      badgeColorClass: 'border-[var(--kvc-crit-line)] text-[var(--kvc-crit-ink)] bg-[var(--kvc-crit-bg)]',
      dotColorClass: 'bg-[var(--kvc-crit)]',
      pingClass: null,
      iconName: 'wifi-off',
    }
  }

  const isHardwareConnected = hardwareLink.status === 'CONNECTED'
  const isFresh = !isStale && rxAgeMs <= 3000 && isHardwareConnected

  // ESP32 đang truyền gói tin đều đặn và tín hiệu còn tươi (< 3000ms)
  if (isFresh) {
    return {
      status: 'LIVE',
      label: 'ESP32: ĐÃ KẾT NỐI',
      shortLabel: 'ĐÃ KẾT NỐI',
      description: `Đang nhận gói tin trực tiếp từ Gateway ESP32 qua ${hardwareLink.port || 'Wi-Fi SoftAP'}.`,
      badgeVariant: 'default',
      badgeColorClass: 'border-[var(--kvc-ok-line)] text-[var(--kvc-ok-ink)] bg-[var(--kvc-ok-bg)]',
      dotColorClass: 'bg-[var(--kvc-ok)]',
      pingClass: 'bg-[var(--kvc-ok)]/70',
      iconName: 'radio',
    }
  }

  // Đang kết nối Gateway nhưng chưa có gói tin từ Sonix hoặc bị gián đoạn sóng quá 3s
  if (isHardwareConnected && (isStale || rxAgeMs > 3000)) {
    return {
      status: 'LOST_SIGNAL',
      label: 'GATEWAY: ĐÃ NỐI (CHỜ SÓNG RF)',
      shortLabel: 'CHỜ SÓNG RF',
      description: `Gateway ESP32 đã kết nối qua ${hardwareLink.port || 'Wi-Fi'}. Đang lắng nghe sóng LoRa 433MHz từ MCU Sonix...`,
      badgeVariant: 'outline',
      badgeColorClass: 'border-[var(--kvc-warn-line)] text-[var(--kvc-warn-ink)] bg-[var(--kvc-warn-bg)]',
      dotColorClass: 'bg-[var(--kvc-warn)]',
      pingClass: 'bg-[var(--kvc-warn)]/70',
      iconName: 'radio',
    }
  }

  // Backend đã sẵn sàng nhưng ESP32 Gateway chưa kết nối hoặc chưa có ingress
  return {
    status: 'WAITING',
    label: 'ESP32: CHƯA KẾT NỐI',
    shortLabel: 'CHƯA KẾT NỐI',
    description: 'Chế độ REAL: Đang chờ kết nối từ Gateway ESP32-C3 qua cổng Ingress WebSocket (:8080).',
    badgeVariant: 'destructive',
    badgeColorClass: 'border-[var(--kvc-crit-line)] text-[var(--kvc-crit-ink)] bg-[var(--kvc-crit-bg)]',
    dotColorClass: 'bg-[var(--kvc-crit)]',
    pingClass: null,
    iconName: 'radio-off',
  }
}
