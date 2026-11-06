/**
 * Cấu hình hệ thống GCS Frontend KVC.
 * Toàn bộ biến VITE_* là build-time/runtime công khai trong bundle, không chứa credentials hoặc secrets.
 */

export const APP_CONFIG = {
  APP_NAME: 'KVC SAR GCS',
  APP_SUBTITLE: 'Trạm Giám Sát Tải Nhiệm Vụ UAV Cứu Nạn Bão Lũ',
  VERSION: '1.0.0',
  SCHEMA_VERSION: '1.0.0',

  // Kết nối mạng
  API_BASE_URL: import.meta.env.VITE_API_BASE_URL || 'http://127.0.0.1:8000',
  WS_URL: import.meta.env.VITE_WS_URL || 'ws://127.0.0.1:8000/ws/telemetry',
  DEFAULT_SOURCE_MODE: (import.meta.env.VITE_DEFAULT_SOURCE_MODE || 'MOCK') as 'MOCK' | 'REAL' | 'REPLAY',
  MOCK_TRANSPORT: import.meta.env.VITE_MOCK_TRANSPORT === 'BACKEND' ? 'BACKEND' : 'LOCAL',
  // IF-05: để trống thì URL được lấy từ trạng thái backend (`video.url`).
  // Chỉ đặt biến này khi muốn ép một nguồn ngoài backend (vd. replay file cục bộ).
  // KHÔNG trỏ thẳng vào ESP32-S3-CAM: IF-03 cấm trình duyệt nối trực tiếp thiết bị.
  VIDEO_STREAM_URL: import.meta.env.VITE_VIDEO_STREAM_URL || '',

  // Bản đồ GPS (Leaflet 2D & MapLibre 3D)
  // Lưu ý: Offline bản đồ phụ thuộc tile cache hoặc server tile nội bộ.
  // Ứng dụng luôn sẵn sàng hoạt động cục bộ mà không bắt buộc tile internet.
  MAP_TILE_URL:
    import.meta.env.VITE_MAP_TILE_URL || 'https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png',
  MAP_ATTRIBUTION:
    import.meta.env.VITE_MAP_ATTRIBUTION || '&copy; OpenStreetMap contributors',

  // Bản đồ Vệ tinh (Google Maps Hybrid Satellite - Zoom sắc nét đến cấp 21, có địa danh & sông ngòi)
  MAP_SATELLITE_TILE_URL:
    import.meta.env.VITE_MAP_SATELLITE_TILE_URL ||
    'https://mt{s}.google.com/vt/lyrs=y&x={x}&y={y}&z={z}',
  TERRAIN_DEM_URL:
    import.meta.env.VITE_TERRAIN_DEM_URL ||
    'https://s3.amazonaws.com/elevation-tiles-prod/terrarium/{z}/{x}/{y}.png',

  // Tọa độ mặc định khi khởi tạo (Vùng thử nghiệm Sa bàn / Thực địa mẫu Miền Trung)
  DEFAULT_CENTER: {
    lat: 16.0544, // Đà Nẵng / Miền Trung
    lng: 108.2022,
    zoom: 17,
  },

  // Ngưỡng thời gian dữ liệu (ms)
  STALE_THRESHOLD_MS: Number(import.meta.env.VITE_STALE_THRESHOLD_MS) || 3000,
  WS_RECONNECT_INTERVAL_MS: 2000,
  HEARTBEAT_INTERVAL_MS: 500,

  // IF-05: chu kỳ thử tải lại khung hình sau khi <img> báo lỗi. đủ ngắn để
  // người vận hành thấy hình trở lại sau vài giây, đủ dài để không dội stream
  // khi camera thật sự mất kết nối.
  VIDEO_RETRY_INTERVAL_MS: 3000,

  // Ngưỡng khoảng cách mặt nước (mét). Giá trị duy nhất có căn cứ trong code
  // hiện hành là 2.0 m (BottomTacticalDock); chưa có văn bản kỹ thuật cho mức
  // "chú ý", nên KHÔNG thêm ngưỡng vàng khi chưa được duyệt.
  LIDAR_DANGER_M: 2.0,
  // Thang đo của ống nước: cận trên hiển thị, không phải ngưỡng an toàn.
  LIDAR_GAUGE_MAX_M: 8.0,

  // Giới hạn lưu trữ bộ nhớ client (Memory bounds)
  MAX_TRAIL_POINTS: 200,
  MAX_ALERTS_HISTORY: 50,
  MAX_EVENT_LOGS: 500,
  MAX_TARGET_HISTORY: 100,

  // Các giá trị Sentinel phần cứng theo hợp đồng KVC-GCS-CONTRACT-001
  SENTINELS: {
    INT32_MIN: -2147483648,
    UINT8_MAX: 255,
    UINT16_MAX: 65535,
    RSSI_NULL: -128,
  },

  // LocalStorage Keys
  STORAGE_KEYS: {
    THEME: 'kvc_gcs_theme',
    LAYOUT: 'kvc_gcs_layout',
    MOCK_SCENARIO: 'kvc_gcs_mock_scenario',
    WS_URL: 'kvc_gcs_ws_url',
    FOLLOW_CAMERA: 'kvc_gcs_follow_camera',
    SHOW_TRAILS: 'kvc_gcs_show_trails',
    DISPLAY_DENSITY: 'kvc_gcs_density',
  },

  // Mật độ hiển thị do người vận hành chọn tay (PLAN-002 §13.2).
  // Không tự đổi theo chiều rộng màn hình.
  DEFAULT_DENSITY: 'comfortable' as const,
} as const
