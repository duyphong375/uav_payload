import { act, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { TooltipProvider } from '@/components/ui/tooltip'
import { APP_CONFIG } from '@/config/appConfig'
import { VideoPanel } from '@/features/video/VideoPanel'
import { MissionContext } from '@/state/MissionProvider'
import { INITIAL_MISSION_STATE } from '@/state/missionReducer'
import type { BoundingBox, MissionState, VideoStreamStatus } from '@/types/telemetry'

function panelTree(state: MissionState) {
  const mockValue = {
    state,
    dispatch: () => {},
    selectedScenarioId: 'NORMAL_GPS_TARGET',
    setSelectedScenarioId: () => {},
    switchSourceMode: () => {},
    reconnect: () => {},
    wsUrl: 'ws://127.0.0.1:8000/ws/telemetry',
    setWsUrl: () => ({ ok: true }),
  }
  return (
    <TooltipProvider>
      <MissionContext.Provider value={mockValue}>
        <VideoPanel />
      </MissionContext.Provider>
    </TooltipProvider>
  )
}

function renderPanelWithProps(custom: Partial<MissionState>) {
  const state: MissionState = { ...INITIAL_MISSION_STATE, ...custom }
  const utils = render(panelTree(state))
  const rerenderWith = (changes: Partial<MissionState>) =>
    utils.rerender(panelTree({ ...state, ...changes }))
  return { ...utils, rerenderWith }
}

function renderPanel(custom: Partial<MissionState>) {
  return renderPanelWithProps(custom)
}

const RELAY_VIDEO: VideoStreamStatus = {
  source_type: 'LIVE',
  source_kind: 'RELAY',
  url: '/video/stream',
  is_connected: true,
  is_loading: false,
  error_message: null,
  has_overlay: false,
  frame_count: 137,
  last_frame_age_ms: 40,
}

const UNCONFIGURED_VIDEO: VideoStreamStatus = {
  source_type: 'NONE',
  source_kind: 'NONE',
  url: null,
  is_connected: false,
  is_loading: false,
  error_message: null,
  has_overlay: false,
  frame_count: 0,
  last_frame_age_ms: null,
}

const FPGA_BOX: BoundingBox = {
  id: 'fpga-bbox-1',
  x: 0.25,
  y: 0.25,
  width: 0.2,
  height: 0.2,
  confidence: 71,
  label: 'lifebuoy',
  is_synced: true,
}

describe('VideoPanel — IF-05 relay (kênh phụ)', () => {
  it('nhãn RELAY + tên ESP32-S3-CAM, độ phân giải 640x480, 20 FPS và đếm khung', () => {
    renderPanel({ source_mode: 'REAL', video: RELAY_VIDEO })

    expect(screen.getByText('RELAY')).toBeDefined()
    expect(screen.getByText('ESP32-S3-CAM (IF-05 relay)')).toBeDefined()
    expect(screen.getByText('KHUNG: 137')).toBeDefined()
    expect(screen.getByText('FPS: 20')).toBeDefined()
    expect(screen.getByText('ĐỘ PHÂN GIẢI: 640×480')).toBeDefined()
  })

  it('không vẽ BBox FPGA lên khung S3 dù box có is_synced=true', () => {
    const { container } = renderPanel({
      source_mode: 'REAL',
      video: RELAY_VIDEO,
      bounding_boxes: [FPGA_BOX],
    })

    // Box của FPGA đến từ camera khác: không được xuất hiện như overlay khung này.
    expect(screen.queryByText('lifebuoy')).toBeNull()
    // Nhưng số lượng vẫn được báo riêng, ghi rõ là không phủ lên khung.
    expect(screen.getByText(/BBOX FPGA: 1 \(không phủ lên khung này\)/)).toBeDefined()
    expect(container.textContent).not.toContain('BBOX ĐỒNG BỘ')
  })

  it('mất kết nối thì phủ banner nhưng giữ nguyên thông tin kênh', () => {
    renderPanel({
      source_mode: 'REAL',
      video: { ...RELAY_VIDEO, is_connected: false, error_message: 'ConnectError' },
    })

    expect(screen.getByText('Video tạm thời không cập nhật')).toBeDefined()
    expect(screen.getByText('Đã nhận 137 khung')).toBeDefined()
    // Banner chỉ phủ panel video; nhãn nguồn vẫn nằm trong panel này.
    expect(screen.getByText('RELAY')).toBeDefined()
  })

  it('REAL chưa cấu hình IF-05 thì KHÔNG hiện pattern mô phỏng', () => {
    const { container } = renderPanel({
      source_mode: 'REAL',
      video: UNCONFIGURED_VIDEO,
    })

    expect(screen.queryByAltText('KVC Reference Video Pattern')).toBeNull()
    expect(screen.getByText('Chưa có nguồn video')).toBeDefined()
    // Không có URL thì không được render <img> rỗng (trình duyệt sẽ tải lại trang).
    expect(container.querySelector('img[src=""]')).toBeNull()
    expect(container.querySelector('img')).toBeNull()
  })

  it('MOCK vẫn dùng pattern và overlay cục bộ', () => {
    renderPanel({ source_mode: 'MOCK' })

    expect(screen.getByAltText('KVC Reference Video Pattern')).toBeDefined()
    expect(screen.getByText('PATTERN MÔ PHỎNG')).toBeDefined()
    expect(screen.queryByText(/Chưa có nguồn video/)).toBeNull()
  })

  it('không có chữ "đồng bộ", "AI YOLO" hay "AI FPGA" khi đang relay', () => {
    const { container } = renderPanel({ source_mode: 'REAL', video: RELAY_VIDEO })
    const text = container.textContent ?? ''

    expect(text.toLowerCase()).not.toContain('đồng bộ')
    expect(text).not.toContain('AI YOLO')
    expect(text).not.toContain('AI FPGA')
  })

  it('KHÔNG tự sinh box từ target khi relay chưa ghép cặp khung', () => {
    // Mục tiêu SAR có toạ độ WGS-84 hợp lệ, nhưng đó không phải toạ độ pixel
    // trong khung OV3660. Vẽ nó lên video là bịa vị trí.
    const { container } = renderPanel({
      source_mode: 'REAL',
      video: RELAY_VIDEO,
      has_target: true,
      target: {
        pos_valid: true,
        target_confirmed: true,
        origin_id: 0,
        coordinate_frame: 'WGS84',
        local_x_cm: null,
        local_y_cm: null,
        latitude: 16.0544,
        longitude: 108.2022,
        confidence: 94,
        class_id: 1,
        class_name: 'person',
        track_id: 101,
      },
    })

    expect(screen.queryByText(/Người \(Person\)/)).toBeNull()
    expect(screen.queryByText(/Mục tiêu SAR/)).toBeNull()
    expect(container.textContent).not.toContain('BBOX AI')
  })

  it('chỉ vẽ overlay relay khi backend xác nhận has_overlay=true', () => {
    renderPanel({
      source_mode: 'REAL',
      video: { ...RELAY_VIDEO, has_overlay: true },
      bounding_boxes: [{ ...FPGA_BOX, label: 'Phao (Lifebuoy)', is_synced: true }],
    })

    expect(screen.getByText('Phao (Lifebuoy)')).toBeDefined()
    expect(screen.getByText(/BBOX AI: 1 \(Đang hiển thị\)/)).toBeDefined()
  })
})

describe('VideoPanel — tự phục hồi sau khi stream đứt', () => {
  afterEach(() => {
    vi.useRealTimers()
  })

  const feedImage = () => screen.getByAltText('KVC Live Optical Feed') as HTMLImageElement

  it('onError hiện banner nhưng KHÔNG khoá vĩnh viễn: tự thử lại theo chu kỳ', () => {
    vi.useFakeTimers()
    const { container } = renderPanel({ source_mode: 'REAL', video: RELAY_VIDEO })

    const firstSrc = feedImage().getAttribute('src')
    expect(firstSrc).not.toContain('kvc_retry')

    fireEvent.error(feedImage())
    expect(screen.getByText('Video tạm thời không cập nhật')).toBeDefined()

    act(() => {
      vi.advanceTimersByTime(APP_CONFIG.VIDEO_RETRY_INTERVAL_MS)
    })

    // Phải remount <img> với URL mới để trình duyệt thực sự thử lại; nếu chỉ
    // giữ nguyên src cũ thì onError kẹt và panel đứng ảnh tới khi F5.
    expect(feedImage().getAttribute('src')).toContain('kvc_retry=1')
    expect(container.textContent).toContain('KHUNG: 137')
    // Banner vẫn còn cho tới khi có onLoad thật, tránh nhấp nháy.
    expect(screen.getByText('Video tạm thời không cập nhật')).toBeDefined()

    fireEvent.load(feedImage())
    expect(screen.queryByText('Video tạm thời không cập nhật')).toBeNull()
  })

  it('backend báo is_connected=false thì banner vẫn hiện dù ảnh chưa báo lỗi', () => {
    const { rerenderWith } = renderPanel({ source_mode: 'REAL', video: RELAY_VIDEO })

    expect(screen.queryByText('Video tạm thời không cập nhật')).toBeNull()

    rerenderWith({ video: { ...RELAY_VIDEO, is_connected: false } })
    expect(screen.getByText('Video tạm thời không cập nhật')).toBeDefined()

    // Hồi phục: backend báo connected lại thì banner biến mất ngay, không phải
    // đợi onLoad của ảnh.
    rerenderWith({ video: { ...RELAY_VIDEO, is_connected: true } })
    expect(screen.queryByText('Video tạm thời không cập nhật')).toBeNull()
  })

  it('đổi URL nguồn thì xoá trạng thái lỗi cũ', () => {
    const { rerenderWith } = renderPanel({ source_mode: 'REAL', video: RELAY_VIDEO })

    fireEvent.error(feedImage())
    expect(screen.getByText('Video tạm thời không cập nhật')).toBeDefined()

    rerenderWith({
      video: { ...RELAY_VIDEO, url: 'http://127.0.0.1:8090/' },
    })

    expect(screen.queryByText('Video tạm thời không cập nhật')).toBeNull()
    expect(feedImage().src).toBe('http://127.0.0.1:8090/')
  })

  it('backend phục hồi (is_connected: false -> true) tự động kích hoạt remount img để nối lại', () => {
    const { rerenderWith } = renderPanel({
      source_mode: 'REAL',
      video: { ...RELAY_VIDEO, is_connected: false },
    })

    expect(screen.getByText('Video tạm thời không cập nhật')).toBeDefined()

    // Camera có lại tín hiệu
    rerenderWith({
      video: { ...RELAY_VIDEO, is_connected: true },
    })

    // Phải sinh kvc_retry để trình duyệt kéo stream mới mà không cần F5
    expect(feedImage().getAttribute('src')).toContain('kvc_retry=1')
    expect(screen.queryByText('Video tạm thời không cập nhật')).toBeNull()
  })

  it('nút tải lại luồng video trên header cho phép làm mới stream tức thì', () => {
    renderPanel({ source_mode: 'REAL', video: RELAY_VIDEO })

    const reloadBtn = screen.getByRole('button', { name: 'Tải lại luồng video' })
    expect(reloadBtn).toBeDefined()

    fireEvent.click(reloadBtn)
    expect(feedImage().getAttribute('src')).toContain('kvc_retry=1')
  })

  it('nút "Tải lại luồng ngay" trên banner cho phép thử lại trực tiếp khi mất kết nối', () => {
    renderPanel({
      source_mode: 'REAL',
      video: { ...RELAY_VIDEO, is_connected: false },
    })

    const bannerRetryBtn = screen.getByRole('button', { name: /Tải lại luồng ngay/i })
    expect(bannerRetryBtn).toBeDefined()

    fireEvent.click(bannerRetryBtn)
    expect(feedImage().getAttribute('src')).toContain('kvc_retry=1')
  })

  it('cho phép chuyển đổi giữa Camera Gốc và AI YOLO (:8090) qua nút trên header', () => {
    renderPanel({ source_mode: 'REAL', video: RELAY_VIDEO })

    // Ban đầu là Camera gốc
    expect(screen.getByText('Camera Gốc')).toBeDefined()
    expect(feedImage().src).toContain('/video/stream')

    // Nhấn chuyển sang AI YOLO
    const switchBtn = screen.getByRole('button', { name: 'Chuyển đổi nguồn video AI hoặc Camera gốc' })
    fireEvent.click(switchBtn)

    expect(screen.getAllByText('AI YOLO').length).toBeGreaterThanOrEqual(1)
    expect(feedImage().src).toContain('http://127.0.0.1:8090/')
    expect(screen.getByText(/YOLO11n Stream/)).toBeDefined()

    // Nhấn quay về Camera gốc
    fireEvent.click(switchBtn)
    expect(screen.getByText('Camera Gốc')).toBeDefined()
    expect(feedImage().src).toContain('/video/stream')
  })

  it('WebSocket telemetry phục hồi (ws_connected: false -> true) kích hoạt remount stream', () => {
    const { rerenderWith } = renderPanel({
      source_mode: 'REAL',
      video: RELAY_VIDEO,
      ws_connected: false,
    })

    // WS kết nối lại
    rerenderWith({
      ws_connected: true,
    })

    expect(feedImage().getAttribute('src')).toContain('kvc_retry=1')
  })

  it('watchdog tuổi khung tự động remount khi last_frame_age_ms > 3500ms', () => {
    const { rerenderWith } = renderPanel({
      source_mode: 'REAL',
      video: { ...RELAY_VIDEO, last_frame_age_ms: 100 },
    })

    expect(feedImage().getAttribute('src')).not.toContain('kvc_retry')

    // Khung bị đơ quá 3.5s
    rerenderWith({
      video: { ...RELAY_VIDEO, last_frame_age_ms: 4000 },
    })

    expect(feedImage().getAttribute('src')).toContain('kvc_retry=1')
  })
})
