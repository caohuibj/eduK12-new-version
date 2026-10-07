import { forwardRef, type InputHTMLAttributes } from 'react'

/** Explicit local wall time; reject rollover dates and nonexistent DST times. */
export function parseLocalDateTime(value: string): Date | null {
  const normalized = value.trim().replace(' ', 'T'), date = new Date(normalized)
  if (!Number.isFinite(date.getTime())) return null
  if (/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(normalized)) {
    const parts = [date.getFullYear(), date.getMonth() + 1, date.getDate(), date.getHours(), date.getMinutes()]
    const requested = normalized.split(/[-T:]/).map(Number)
    return parts.every((part, index) => part === requested[index]) ? date : null
  }
  return /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{3})?Z$/.test(normalized) ? date : null
}
export function localDateTimeValue(value: string): string {
  if (!value || !value.endsWith('Z')) return value
  const date = parseLocalDateTime(value)
  return date ? new Date(date.getTime() - date.getTimezoneOffset() * 60000).toISOString().slice(0, 16) : value
}
type Props = Omit<InputHTMLAttributes<HTMLInputElement>, 'type' | 'value'> & { value: string }
const LocalDateTimeInput = forwardRef<HTMLInputElement, Props>(function LocalDateTimeInput({ value, onChange, ...props }, ref) {
  return <input {...props} ref={ref} type="text" placeholder="年-月-日 时:分，如 2026-10-14 23:59"
    title={`格式：YYYY-MM-DD HH:mm；时区：${Intl.DateTimeFormat().resolvedOptions().timeZone}`}
    pattern="[0-9]{4}-[0-9]{2}-[0-9]{2}[ T][0-9]{2}:[0-9]{2}" value={localDateTimeValue(value).replace('T', ' ')}
    aria-invalid={props['aria-invalid'] || Boolean(value && !parseLocalDateTime(value))}
    onChange={event => { event.currentTarget.value = event.currentTarget.value.replace(' ', 'T'); onChange?.(event) }} />
})
export default LocalDateTimeInput
