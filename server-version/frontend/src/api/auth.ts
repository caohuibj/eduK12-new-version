import apiClient from './client'
import type { ApiResponse, User } from '../types'

export interface LoginRequest {
  username: string
  password: string
}

export interface RegisterRequest {
  username: string
  password: string
  nickname?: string
  teacherCode?: string
}

export interface LoginData {
  token: string
  user: User
}

export const authApi = {
  login: (data: LoginRequest) => apiClient.post<LoginData>('/auth/login', data),
  register: (data: RegisterRequest) => apiClient.post<LoginData>('/auth/register', data),
  me: () => apiClient.get<User>('/auth/me'),
  changePassword: (oldPassword: string, newPassword: string) =>
    apiClient.post<void>('/auth/change-password', { oldPassword, newPassword }),
}
