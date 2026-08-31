export interface NormalizedApiError {
  message: string
  status: number | null
  code: number | string | null
  retryable: boolean
  retryAfterMs: number | null
}

type ErrorLike = {
  message?: unknown
  response?: { status?: unknown; data?: { message?: unknown; code?: unknown } }
  status?: unknown
  code?: unknown
  retryable?: unknown
  retryAfterMs?: unknown
}

const asStatus = (value: unknown): number | null => {
  return typeof value === 'number' && Number.isFinite(value) ? value : null
}

/** Parse an RFC 9110 Retry-After value into milliseconds. */
export const parseRetryAfterMs = (value: unknown, now = Date.now()): number | null => {
  if (typeof value === 'number' && Number.isFinite(value) && value >= 0) return value * 1000
  if (typeof value !== 'string' || value.trim() === '') return null
  const seconds = Number(value)
  if (Number.isFinite(seconds) && seconds >= 0) return seconds * 1000
  const date = Date.parse(value)
  return Number.isFinite(date) ? Math.max(0, date - now) : null
}

const responseRetryAfter = (response: ErrorLike['response']): unknown => {
  const headers = (response as (ErrorLike['response'] & { headers?: unknown }) | undefined)?.headers as {
    get?: (name: string) => unknown
    [key: string]: unknown
  } | undefined
  if (!headers) return undefined
  if (typeof headers.get === 'function') return headers.get('retry-after')
  return headers['retry-after'] ?? headers['Retry-After']
}

/** Normalize Axios/fetch/API envelope errors into one UI-safe shape. */
export const normalizeApiError = (
  message?: unknown,
  status?: unknown,
  code?: unknown,
  retryable?: unknown,
): NormalizedApiError => {
  const source = (message && typeof message === 'object' ? message : null) as ErrorLike | null
  const response = source?.response
  const responseData = response?.data
  const resolvedStatus = asStatus(status) ?? asStatus(source?.status) ?? asStatus(response?.status)
  const resolvedCode = code ?? source?.code ?? responseData?.code ?? null
  const resolvedMessage = typeof message === 'string'
    ? message
    : typeof responseData?.message === 'string'
      ? responseData.message
      : typeof source?.message === 'string'
        ? source.message
        : '请求失败'
  const explicitRetryable = retryable ?? source?.retryable
  const isRetryable = typeof explicitRetryable === 'boolean'
    ? explicitRetryable
    : resolvedStatus === null
      ? true
      : resolvedStatus === 408 || resolvedStatus === 425 || resolvedStatus === 429 || resolvedStatus >= 500
  const retryAfterMs = typeof source?.retryAfterMs === 'number' && Number.isFinite(source.retryAfterMs) && source.retryAfterMs >= 0
    ? source.retryAfterMs
    : parseRetryAfterMs(responseRetryAfter(response))

  return {
    message: resolvedMessage || '请求失败',
    status: resolvedStatus,
    code: resolvedCode as number | string | null,
    retryable: isRetryable,
    retryAfterMs,
  }
}

export default normalizeApiError
