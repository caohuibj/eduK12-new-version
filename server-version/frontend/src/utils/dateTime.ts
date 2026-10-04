/** Form inputs and displayed deadlines use the browser's local time zone. */
export const localTimeZoneLabel = () => {
  const formatter = new Intl.DateTimeFormat('zh-CN', { timeZoneName: 'shortOffset' })
  const offset = formatter.formatToParts(new Date()).find(part => part.type === 'timeZoneName')?.value.replace('GMT', 'UTC')
  return `${formatter.resolvedOptions().timeZone}${offset ? ` · ${offset}` : ''}`
}

export const dateTimeInputValue = (value: string) => {
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return ''
  const pad = (part: number) => String(part).padStart(2, '0')
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`
}

export const deadlineToIso = (value: string) => value ? new Date(value).toISOString() : undefined

export const formatLocalDateTime = (value: string, options: Intl.DateTimeFormatOptions = {}) => {
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return '无效日期'
  return new Intl.DateTimeFormat('zh-CN', { ...options, timeZoneName: 'shortOffset' }).format(date).replace('GMT', 'UTC')
}

/** Full local timestamp, with an explicit offset and Chinese locale. */
export const formatLocalTimestamp = (value: string) => formatLocalDateTime(value, {
  year: 'numeric', month: '2-digit', day: '2-digit',
  hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false,
})
