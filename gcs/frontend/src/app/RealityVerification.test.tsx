import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { TooltipProvider } from '@/components/ui/tooltip'
import { AppHeader } from '@/app/AppHeader'
import { AppRouterProvider } from '@/app/routes'
import { ModeContextBar } from '@/app/ModeContextBar'
import { TopStatCards } from '@/features/telemetry/TopStatCards'
import { DetectionOverlay } from '@/features/video/DetectionOverlay'
import { VideoPanel } from '@/features/video/VideoPanel'
import { MissionContext } from '@/state/MissionProvider'
import { INITIAL_MISSION_STATE } from '@/state/missionReducer'
import type { BoundingBox, MissionState } from '@/types/telemetry'

function renderWithMissionState(customState: Partial<MissionState>, component: React.ReactNode) {
  const state: MissionState = {
    ...INITIAL_MISSION_STATE,
    ...customState,
  }

  const mockValue = {
    state,
    dispatch: () => {},
    selectedScenarioId: 'NORMAL_GPS_TARGET',
    setSelectedScenarioId: () => {},
    switchSourceMode: () => {},
    reconnect: () => {},
  }

  return render(
    <TooltipProvider>
      <MissionContext.Provider value={mockValue}>
        <AppRouterProvider>{component}</AppRouterProvider>
      </MissionContext.Provider>
    </TooltipProvider>
  )
}

describe('KVC Reality Verification (KVC-GCS-UI-REALITY-001)', () => {
  it('AC1: MOCK được đánh dấu rõ là mô phỏng và phân biệt LOCAL/BACKEND', () => {
    renderWithMissionState(
      {
        source_mode: 'MOCK',
        ws_connected: false,
      },
      <>
        <AppHeader onOpenMobileMenu={() => {}} />
        <ModeContextBar />
      </>
    )

    // Nút và badge MOCK hiển thị rõ ràng
    expect(screen.getAllByText(/MOCK/i).length).toBeGreaterThan(0)
    expect(screen.getByText(/Chế độ Mô phỏng/i)).toBeDefined()
  })

  it('AC2: REAL hiển thị rõ CHƯA KẾT NỐI khi chưa có Ingress từ ESP32-C3', () => {
    renderWithMissionState(
      {
        source_mode: 'REAL',
        ws_connected: true, // Browser kết nối localhost backend thành công
        hardware_link: { status: 'DISCONNECTED', port: null }, // Nhưng chưa có ingress phần cứng
      },
      <>
        <AppHeader onOpenMobileMenu={() => {}} />
        <ModeContextBar />
      </>
    )

    // Nút REAL ở AppHeader hoặc badge phải hiện rõ CHƯA KẾT NỐI
    expect(screen.getAllByText(/CHƯA KẾT NỐI/i).length).toBeGreaterThan(0)
    // ModeContextBar phải thông báo chưa có Ingress ESP32
    expect(screen.getByText(/REAL: ESP32 Chưa Kết Nối/i)).toBeDefined()
    expect(screen.getByText(/Chưa cấu hình Ingress/i)).toBeDefined()
  })

  it('AC3: REPLAY được đánh dấu xuyên suốt và hiển thị metadata phiên', () => {
    renderWithMissionState(
      {
        source_mode: 'REPLAY',
        ws_connected: true,
        replay: {
          source_file: 'data/sessions/SES-RECORD-001.db',
          source_session_id: 'SES-RECORD-001',
          speed_multiplier: 1,
          is_paused: false,
          current_record_index: 10,
          total_records: 100,
          progress_pct: 10,
          position_ms: 12000,
          duration_ms: 120000,
        },
      },
      <ModeContextBar />
    )

    expect(screen.getByText(/Phát lại nhật ký/i)).toBeDefined()
    expect(screen.getByText('SES-RECORD-001')).toBeDefined()
    expect(screen.getByText('12000 ms')).toBeDefined()
    expect(screen.getByText(/1× ĐANG PHÁT/i)).toBeDefined()
  })

  it('AC4: Tách rõ Browser-Backend WS và Hardware Link (ESP32)', () => {
    renderWithMissionState(
      {
        source_mode: 'REAL',
        ws_connected: true,
        hardware_link: { status: 'DISCONNECTED', port: null },
      },
      <AppHeader onOpenMobileMenu={() => {}} />
    )

    // Browser WS thì OK
    expect(screen.getByText('WS BACKEND OK')).toBeDefined()
    // Nhưng ESP32 Hardware link thì cờ CHƯA KẾT NỐI
    expect(screen.getByText('ESP32: CHƯA KẾT NỐI')).toBeDefined()
  })

  it('AC5: Không tự đặt FPS, độ phân giải giả mạo trong VideoPanel', () => {
    const { container } = renderWithMissionState(
      {
        source_mode: 'REAL',
        video: {
          source_type: 'REFERENCE',
          url: null,
          is_connected: true,
          is_loading: false,
          error_message: null,
          has_overlay: true,
        },
      },
      <VideoPanel />
    )

    // Không được hardcode "FPS: 30" hay "1280×720"
    expect(container.textContent).not.toContain('FPS: 30')
    expect(container.textContent).not.toContain('1280×720')
    expect(container.textContent).toContain('FPS: N/A')
  })

  it('AC5: Video là kênh riêng, chỉ vẽ BBox khi dữ liệu đồng bộ frame hợp lệ (box.is_synced === true)', () => {
    const boxes: BoundingBox[] = [
      {
        id: 'box-1',
        label: 'Target Synced',
        confidence: 90,
        x: 0.1,
        y: 0.1,
        width: 0.2,
        height: 0.2,
        is_synced: true,
      },
      {
        id: 'box-2',
        label: 'Target Unsynced',
        confidence: 85,
        x: 0.5,
        y: 0.5,
        width: 0.2,
        height: 0.2,
        is_synced: false,
      },
    ]

    render(<DetectionOverlay boxes={boxes} isSynced={true} />)

    // Box đồng bộ phải được vẽ
    expect(screen.getByText('Target Synced')).toBeDefined()
    // Box không đồng bộ frame KHÔNG được vẽ
    expect(screen.queryByText('Target Unsynced')).toBeNull()
  })

  it('AC5: Tọa độ LOCAL_GRID không được hiển thị như WGS-84 trong TopStatCards', () => {
    renderWithMissionState(
      {
        has_target: true,
        target: {
          pos_valid: true,
          target_confirmed: true,
          origin_id: 0,
          coordinate_frame: 'LOCAL_GRID',
          local_x_cm: 120,
          local_y_cm: -45,
          latitude: null,
          longitude: null,
          confidence: 92,
          class_id: 1,
          class_name: 'person',
          track_id: 105,
        },
        telemetry: {
          ...INITIAL_MISSION_STATE.telemetry,
          gps_valid: false,
        },
      },
      <TopStatCards />
    )

    // Phải hiển thị Local Grid, không được gán nhãn WGS-84
    expect(screen.getByText(/Local Grid: \(120, -45\) cm/i)).toBeDefined()
    expect(screen.queryByText(/WGS84: 120/i)).toBeNull()
  })
})
