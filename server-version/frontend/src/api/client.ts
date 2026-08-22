import axios from 'axios'
import type { ApiResponse } from '../types'

const axiosClient = axios.create({
  baseURL: '/api',
  headers: {
    'Content-Type': 'application/json',
    'Cache-Control': 'no-cache',
    'Pragma': 'no-cache',
  },
})

// 请求拦截器 - 添加 token 和禁用缓存参数
axiosClient.interceptors.request.use(
  (config) => {
    const token = localStorage.getItem('token')
    if (token) {
      config.headers.Authorization = `Bearer ${token}`
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
    return response.data
  },
  (error) => {
    if (error.response?.status === 401) {
      localStorage.removeItem('token')
      localStorage.removeItem('user')
      // 使用事件通知替代强制刷新，保留用户操作状态
      window.dispatchEvent(new CustomEvent('auth:expired', {
        detail: { message: '登录已过期，请重新登录' }
      }))
      // 延迟跳转，让应用有机会保存状态
      setTimeout(() => {
        window.location.href = '/'
      }, 100)
    }
    return Promise.reject(error.response?.data || error.message)
  }
)

// 类型安全的 API 客户端
// axios拦截器已经返回了 response.data，类型就是 ApiResponse<T>
const apiClient = {
  get: <T = any>(url: string, config?: any): Promise<ApiResponse<T>> => 
    axiosClient.get(url, config) as Promise<ApiResponse<T>>,
  post: <T = any>(url: string, data?: any, config?: any): Promise<ApiResponse<T>> => 
    axiosClient.post(url, data, config) as Promise<ApiResponse<T>>,
  put: <T = any>(url: string, data?: any, config?: any): Promise<ApiResponse<T>> => 
    axiosClient.put(url, data, config) as Promise<ApiResponse<T>>,
  patch: <T = any>(url: string, data?: any, config?: any): Promise<ApiResponse<T>> => 
    axiosClient.patch(url, data, config) as Promise<ApiResponse<T>>,
  delete: <T = any>(url: string, config?: any): Promise<ApiResponse<T>> => 
    axiosClient.delete(url, config) as Promise<ApiResponse<T>>,
}

export default apiClient
