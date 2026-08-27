import axios, { type AxiosRequestConfig } from 'axios'
import type { ApiResponse } from '../types'

const axiosClient = axios.create({
  baseURL: '/api',
  withCredentials: true,
  headers: {
    'Content-Type': 'application/json',
    'Cache-Control': 'no-cache',
    'Pragma': 'no-cache',
  },
})

const readCookie = (name: string): string | null => {
  if (typeof document === 'undefined') return null
  const encodedName = `${encodeURIComponent(name)}=`
  const item = document.cookie.split('; ').find((entry) => entry.startsWith(encodedName))
  return item ? decodeURIComponent(item.slice(encodedName.length)) : null
}

export const getCsrfToken = (): string | null => readCookie('ptool_csrf')

export const ensureCsrfToken = async (): Promise<string | null> => {
  const existing = getCsrfToken()
  if (existing) return existing

  const response = await fetch('/api/auth/csrf', { credentials: 'same-origin' })
  if (!response.ok) return null
  const body = await response.json() as { data?: { csrfToken?: string } }
  return body.data?.csrfToken || getCsrfToken()
}

export const sessionFetch = async (input: RequestInfo | URL, init: RequestInit = {}): Promise<Response> => {
  const method = (init.method || 'GET').toUpperCase()
  const headers = new Headers(init.headers)
  if (!['GET', 'HEAD', 'OPTIONS'].includes(method)) {
    const csrfToken = await ensureCsrfToken()
    if (csrfToken) headers.set('X-CSRF-Token', csrfToken)
  }
  return fetch(input, { ...init, headers, credentials: 'same-origin' })
}

// 请求拦截器 - 使用 Cookie 会话并为写请求添加 CSRF
axiosClient.interceptors.request.use(
  async (config) => {
    const method = (config.method || 'get').toUpperCase()
    if (!['GET', 'HEAD', 'OPTIONS'].includes(method) && typeof window !== 'undefined') {
      const csrfToken = await ensureCsrfToken()
      if (csrfToken) {
        config.headers = config.headers || {}
        config.headers['X-CSRF-Token'] = csrfToken
      }
    }
    return config
  },
  (error) => {
    return Promise.reject(error)
  }
)

// 响应拦截器 - 处理错误
axiosClient.interceptors.response.use(
  (response) => {
    return response
  },
  (error) => {
    if (error.response?.status === 401) {
      // 使用事件通知替代强制刷新，保留用户操作状态
      if (typeof window !== 'undefined') window.dispatchEvent(new CustomEvent('auth:expired', {
        detail: { message: '登录已过期，请重新登录' }
      }))
      // 延迟跳转，让应用有机会保存状态
      if (typeof window !== 'undefined') setTimeout(() => {
        window.location.href = '/'
      }, 100)
    }
    return Promise.reject(error.response?.data || error.message)
  }
)

const parseApiResponse = <T>(value: unknown): ApiResponse<T> => {
  if (
    !value ||
    typeof value !== 'object' ||
    typeof (value as { code?: unknown }).code !== 'number' ||
    typeof (value as { message?: unknown }).message !== 'string'
  ) {
    throw new Error('服务响应格式无效')
  }
  return value as ApiResponse<T>
}

// 类型安全的 API 客户端；所有 JSON 响应先验证公共包络结构。
const apiClient = {
  get: <T = any>(url: string, config?: AxiosRequestConfig): Promise<ApiResponse<T>> =>
    axiosClient.get<ApiResponse<T>>(url, config).then((response) => parseApiResponse<T>(response.data)),
  post: <T = any>(url: string, data?: unknown, config?: AxiosRequestConfig): Promise<ApiResponse<T>> =>
    axiosClient.post<ApiResponse<T>>(url, data, config).then((response) => parseApiResponse<T>(response.data)),
  put: <T = any>(url: string, data?: unknown, config?: AxiosRequestConfig): Promise<ApiResponse<T>> =>
    axiosClient.put<ApiResponse<T>>(url, data, config).then((response) => parseApiResponse<T>(response.data)),
  patch: <T = any>(url: string, data?: unknown, config?: AxiosRequestConfig): Promise<ApiResponse<T>> =>
    axiosClient.patch<ApiResponse<T>>(url, data, config).then((response) => parseApiResponse<T>(response.data)),
  delete: <T = any>(url: string, config?: AxiosRequestConfig): Promise<ApiResponse<T>> =>
    axiosClient.delete<ApiResponse<T>>(url, config).then((response) => parseApiResponse<T>(response.data)),
}

export default apiClient
