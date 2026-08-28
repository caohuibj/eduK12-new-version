import type { ApiResponse } from '../types'

export class PublicCapabilityError extends Error {
  status: number
  code: number | string | null
  retryable: boolean
  constructor(message: string, status = 0, code: number | string | null = null) {
    super(message)
    this.name = 'PublicCapabilityError'
    this.status = status
    this.code = code
    this.retryable = status === 408 || status === 429 || status >= 500
  }
}

const parseError = async (response: Response): Promise<PublicCapabilityError> => {
  let message = `请求失败 (${response.status})`
  let code: number | string | null = null
  try {
    const payload = await response.clone().json() as { message?: unknown; code?: unknown; data?: { message?: unknown } }
    if (typeof payload.message === 'string' && payload.message) message = payload.message
    else if (typeof payload.data?.message === 'string' && payload.data.message) message = payload.data.message
    if (typeof payload.code === 'number' || typeof payload.code === 'string') code = payload.code
  } catch {
    // Keep the status-based message for non-JSON errors.
  }
  return new PublicCapabilityError(message, response.status, code)
}

export const createPublicCapabilityClient = (capability: string, options: { baseUrl?: string; timeoutMs?: number } = {}) => {
  const baseUrl = options.baseUrl || '/api/public'
  const timeoutMs = options.timeoutMs ?? 15_000
  const request = async <T>(path: string, init: RequestInit = {}): Promise<ApiResponse<T>> => {
    const controller = new AbortController()
    const timeout = setTimeout(() => controller.abort(), timeoutMs)
    const headers = new Headers(init.headers)
    headers.set('Accept', 'application/json')
    headers.set('Content-Type', 'application/json')
    // This client intentionally sends only the resume bearer capability; it
    // never includes cookies or CSRF/session authority.
    if (capability) headers.set('Authorization', `Bearer ${capability}`)
    try {
      const response = await fetch(`${baseUrl}${path}`, { ...init, headers, credentials: 'omit', signal: init.signal || controller.signal })
      if (!response.ok) throw await parseError(response)
      const payload = await response.json() as unknown
      if (!payload || typeof payload !== 'object' || typeof (payload as any).code !== 'number' || typeof (payload as any).message !== 'string') {
        throw new PublicCapabilityError('服务响应格式无效', response.status)
      }
      if ((payload as any).code !== 0) {
        throw new PublicCapabilityError((payload as any).message, response.status, (payload as any).code)
      }
      return payload as ApiResponse<T>
    } catch (error) {
      if (error instanceof PublicCapabilityError) throw error
      if ((error as DOMException)?.name === 'AbortError') throw new PublicCapabilityError('请求超时', 408)
      throw new PublicCapabilityError(error instanceof Error ? error.message : '网络请求失败')
    } finally {
      clearTimeout(timeout)
    }
  }
  return {
    get: <T = any>(path: string, init?: RequestInit) => request<T>(path, { ...init, method: 'GET' }),
    post: <T = any>(path: string, body?: unknown, init?: RequestInit) => request<T>(path, { ...init, method: 'POST', body: body === undefined ? undefined : JSON.stringify(body) }),
    patch: <T = any>(path: string, body?: unknown, init?: RequestInit) => request<T>(path, { ...init, method: 'PATCH', body: body === undefined ? undefined : JSON.stringify(body) }),
  }
}

export default createPublicCapabilityClient
