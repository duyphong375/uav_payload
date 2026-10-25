import React from 'react'
import {
  AlertCircle,
  AlertTriangle,
  ArrowRight,
  CheckCircle2,
  ShieldCheck,
} from 'lucide-react'
import { useAppRouter } from '@/app/routes'
import { Panel } from '@/components/shared/Panel'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { useMission } from '@/state/MissionProvider'

export const ActiveAlertsQuickPanel: React.FC = () => {
  const { state, dispatch } = useMission()
  const { navigate } = useAppRouter()

  // Lọc các cảnh báo còn đang hoạt động
  const activeAlerts = state.alerts.filter((a) => a.active)

  return (
    <Panel
      title="Cảnh báo cần xử lý"
      infoTip="Danh sách cảnh báo kỹ thuật tải bay (pin yếu, mất kết nối LoRa, độ cao ngoài vùng an toàn) hỗ trợ xác nhận và xử lý nhanh."
      icon={<AlertTriangle className="h-4 w-4 text-amber-500" />}
      className="h-auto shrink-0 shadow-xs"
      headerRight={
        <div className="flex items-center gap-1.5">
          {activeAlerts.length > 0 ? (
            <Badge
              variant="destructive"
              className="text-[10px] px-1.5 py-0 font-mono"
            >
              {activeAlerts.length}
            </Badge>
          ) : (
            <Badge
              variant="outline"
              className="text-[10px] px-1.5 py-0 border-emerald-500/40 text-emerald-600 dark:text-emerald-400 bg-emerald-500/10"
            >
              OK
            </Badge>
          )}
        </div>
      }
    >
      <div className="flex flex-col gap-2 max-h-[220px] overflow-y-auto pr-0.5">
        {activeAlerts.length === 0 ? (
          <div className="py-4 text-center flex flex-col items-center justify-center gap-1.5 text-muted-foreground">
            {state.ws_connected && state.diagnostics.packets_received_total > 0 ? (
              <>
                <ShieldCheck className="h-6 w-6 stroke-[1.5] text-emerald-500" />
                <span className="text-xs font-semibold text-foreground">
                  Hệ thống ổn định
                </span>
                <span className="text-xs text-muted-foreground">
                  Không có sự cố hoặc cảnh báo nguy cấp.
                </span>
              </>
            ) : (
              <>
                <ShieldCheck className="h-6 w-6 stroke-[1.5] text-muted-foreground/60" />
                <span className="text-xs font-semibold text-foreground">
                  Đang chờ liên kết
                </span>
                <span className="text-xs text-muted-foreground">
                  Chưa nhận gói tin telemetry từ tải nhiệm vụ.
                </span>
              </>
            )}
          </div>
        ) : (
          <div className="flex flex-col gap-2">
            {activeAlerts.slice(0, 3).map((alert) => {
              const isCritical = alert.level === 'CRITICAL'
              return (
                <div
                  key={alert.id}
                  className={`p-2.5 rounded-lg border text-xs flex flex-col gap-1.5 transition-colors ${
                    isCritical
                      ? 'bg-red-500/10 border-red-500/30'
                      : 'bg-amber-500/10 border-amber-500/30'
                  }`}
                >
                  <div className="flex items-start justify-between gap-2">
                    <div className="flex items-start gap-2 min-w-0">
                      {isCritical ? (
                        <AlertCircle className="h-4 w-4 mt-0.5 text-red-500 shrink-0" />
                      ) : (
                        <AlertTriangle className="h-4 w-4 mt-0.5 text-amber-500 shrink-0" />
                      )}
                      <div className="flex flex-col min-w-0">
                        <span className="font-bold text-foreground truncate leading-tight">
                          {alert.code}
                        </span>
                        <span className="text-xs text-muted-foreground line-clamp-2 leading-snug">
                          {alert.message}
                        </span>
                      </div>
                    </div>
                  </div>

                  <div className="flex items-center justify-between pt-1.5 border-t border-border/40 text-xs text-muted-foreground">
                    <span className="font-mono">
                      {new Date(alert.last_seen_iso).toLocaleTimeString()}
                    </span>
                    <div>
                      {alert.acknowledged ? (
                        <span className="inline-flex items-center gap-1 text-emerald-600 dark:text-emerald-400 font-semibold text-xs">
                          <CheckCircle2 className="h-3.5 w-3.5" /> Đã tiếp nhận (Đang theo dõi)
                        </span>
                      ) : (
                        <Button
                          variant="outline"
                          size="sm"
                          className="h-7 px-2.5 text-xs font-semibold border-border hover:bg-card cursor-pointer focus-visible:ring-2 focus-visible:ring-primary"
                          onClick={() =>
                            dispatch({ type: 'ACKNOWLEDGE_ALERT', payload: alert.id })
                          }
                        >
                          Tiếp nhận (ACK)
                        </Button>
                      )}
                    </div>
                  </div>
                </div>
              )
            })}
            {activeAlerts.length > 3 && (
              <div className="text-xs text-center text-muted-foreground font-mono py-0.5">
                +{activeAlerts.length - 3} cảnh báo khác đang chờ
              </div>
            )}
          </div>
        )}

        {/* Nút Chuyển hướng sang Trung tâm cảnh báo đầy đủ */}
        <div className="pt-2 flex items-center justify-between border-t border-border/40">
          <span className="text-xs text-muted-foreground">
            {activeAlerts.length > 0 ? `Hiển thị ${Math.min(activeAlerts.length, 3)}/${activeAlerts.length}` : '0 cảnh báo'}
          </span>
          <Button
            variant="ghost"
            size="sm"
            onClick={() => navigate('/alerts')}
            className="h-7 px-2 text-xs font-semibold text-primary hover:text-primary/90 gap-1 cursor-pointer"
          >
            <span>Mở Trung tâm cảnh báo</span>
            <ArrowRight className="h-3.5 w-3.5" />
          </Button>
        </div>
      </div>
    </Panel>
  )
}
