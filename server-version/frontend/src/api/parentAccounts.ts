import apiClient from './client'
import type { User } from '../types'
const data = <T>(response: {
  code: number | string
  data?: T
  message: string
}): T => {
  if (response.code !== 0 || response.data == null)
    throw new Error(response.message || '账号服务响应无效')
  return response.data
}
export const parentAccountsApi = {
  list: async (page: number, keyword: string, signal?: AbortSignal) =>
    data(
      await apiClient.get<{
        list: User[]
        total: number
        page: number
        pageSize: number
      }>('/parent-accounts', {
        params: { page, pageSize: 20, keyword },
        signal,
      }),
    ),
  create: async (input: {
    username: string
    nickname: string
    password: string
    commandKey: string
  }) => data(await apiClient.post<User>('/parent-accounts', input)),
  reset: async (id: string, password: string, commandKey: string) =>
    data(
      await apiClient.post(
        `/parent-accounts/${encodeURIComponent(id)}/reset-password`,
        { password, commandKey },
      ),
    ),
  active: async (id: string, isActive: boolean) =>
    data(await apiClient.put(`/users/${encodeURIComponent(id)}`, { isActive })),
  searchUsers: async (keyword: string, signal?: AbortSignal) =>
    data(
      await apiClient.get<{ list: User[]; total: number }>('/platform-users', {
        params: { keyword, page: 1, pageSize: 20 },
        signal,
      }),
    ),
}
