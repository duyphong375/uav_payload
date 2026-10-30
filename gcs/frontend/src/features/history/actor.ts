/**
 * Tác nhân của một dòng nhật ký, suy ra từ trường có sẵn — không thêm schema.
 * "Người vận hành" là hành động đánh dấu sự kiện SAR do người dùng bấm
 * (source SAR_MISSION / code SAR_MARK_EVENT); mọi nguồn còn lại là hệ thống.
 */
export type LogActor = 'OPERATOR' | 'SYSTEM'

export const OPERATOR_SOURCE = 'SAR_MISSION'
export const OPERATOR_CODE = 'SAR_MARK_EVENT'

export const logActor = (entry: { source: string; code: string }): LogActor =>
  entry.source === OPERATOR_SOURCE || entry.code === OPERATOR_CODE ? 'OPERATOR' : 'SYSTEM'

export const LOG_ACTOR_LABEL: Record<LogActor, string> = {
  OPERATOR: 'Người vận hành',
  SYSTEM: 'Hệ thống',
}

export const LOG_ACTOR_SHORT_LABEL: Record<LogActor, string> = {
  OPERATOR: 'NVH',
  SYSTEM: 'Hệ thống',
}
