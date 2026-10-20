import apiClient from './client'
import { isTrainingHost } from '../training/context'
import type { User } from '../types'
import { assertSecurityKey } from '../admin/securityKey'

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
  login: async (data: LoginRequest, entrance?: LoginEntrance) => {
    const response = await apiClient.post<LoginData | {adminKeyRequired:true;options:Record<string,unknown>}>(entrance !== 'admin' && isTrainingHost() ? '/auth/training-login' : '/auth/login', data)
    if(response.data && 'adminKeyRequired' in response.data) {
      const assertion=await assertSecurityKey(response.data.options)
      return apiClient.post<LoginData>('/admin/security/authentication/verify',{response:assertion})
    }
    return response as import('../types').ApiResponse<LoginData>
  },
  me: () => apiClient.get<User>('/auth/me'),
  csrf: () => apiClient.get<{ csrfToken: string }>('/auth/csrf'),
  logout: () => apiClient.post<void>('/auth/logout'),
  changePassword: (oldPassword: string, newPassword: string) =>
    apiClient.post<void>('/auth/change-password', { oldPassword, newPassword }),
}
