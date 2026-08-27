import apiClient from './client'
import type { User } from '../types'

export interface LoginRequest {
  username: string
  password: string
}

export interface LoginData {
  user: User
}

export const authApi = {
  login: (data: LoginRequest) => apiClient.post<LoginData>('/auth/login', data),
  me: () => apiClient.get<User>('/auth/me'),
  csrf: () => apiClient.get<{ csrfToken: string }>('/auth/csrf'),
  logout: () => apiClient.post<void>('/auth/logout'),
  changePassword: (oldPassword: string, newPassword: string) =>
    apiClient.post<void>('/auth/change-password', { oldPassword, newPassword }),
}
