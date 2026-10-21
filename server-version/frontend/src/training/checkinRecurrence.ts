export type CheckinRecurrence = {
  firstPublishAt: string; interval: number; unit: 'days' | 'weeks'; durationHours: number; endsAt: string; timezone: string
}

export const localDateTime = (value: string) => {
  const date = new Date(value)
  return new Date(date.getTime() - date.getTimezoneOffset() * 60000).toISOString().slice(0, 16)
}

export function recurrencePayload(value: CheckinRecurrence, now = new Date()) {
  const first = value.firstPublishAt ? new Date(value.firstPublishAt) : now
  const ends = value.endsAt ? new Date(value.endsAt) : null
  const intervalDays = value.interval * (value.unit === 'weeks' ? 7 : 1)
  if (!Number.isFinite(first.getTime()) || (ends && (!Number.isFinite(ends.getTime()) || ends < first))) throw new Error('请检查首次发布和结束时间')
  if (!Number.isInteger(intervalDays) || intervalDays < 1 || intervalDays > 365 || !Number.isInteger(value.durationHours) || value.durationHours < 1 || value.durationHours > 8760) throw new Error('重复间隔和有效时长超出允许范围')
  return { firstPublishAt: first.toISOString(), endsAt: ends?.toISOString() || null, intervalDays, durationHours: value.durationHours, timezone: value.timezone }
}
