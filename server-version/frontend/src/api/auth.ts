import apiClient from './client'
import { isTrainingHost } from '../training/context'
import type { User } from '../types'

export interface LoginRequest {
  username: string
  password: string
  expectedRole?: 'STUDENT' | 'TEACHER'
}

export type LoginEntrance = 'admin'

export interface LoginData {
  user: User
}

export const authApi = {
  login: (data: LoginRequest, entrance?: LoginEntrance) => apiClient.post<LoginData>(entrance !== 'admin' && isTrainingHost() ? '/auth/training-login' : '/auth/login', data),
  me: () => apiClient.get<User>('/auth/me'),
  csrf: () => apiClient.get<{ csrfToken: string }>('/auth/csrf'),
  logout: () => apiClient.post<void>('/auth/logout'),
  changePassword: (oldPassword: string, newPassword: string) =>
    apiClient.post<void>('/auth/change-password', { oldPassword, newPassword }),
}
