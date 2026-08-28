export interface NormalizedApiError {
  message: string
  status: number | null
  code: number | string | null
  retryable: boolean
}

type ErrorLike = {
  message?: unknown
  response?: { status?: unknown; data?: { message?: unknown; code?: unknown } }
  status?: unknown
  code?: unknown
  retryable?: unknown
}

const asStatus = (value: unknown): number | null => {
  return typeof value === 'number' && Number.isFinite(value) ? value : null
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

  return {
    message: resolvedMessage || '请求失败',
    status: resolvedStatus,
    code: resolvedCode as number | string | null,
    retryable: isRetryable,
  }
}

export default normalizeApiError
