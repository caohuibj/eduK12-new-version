import apiClient from './client'
import type { User } from '../types'

export type MaterialResourceType = 'SCALE' | 'COGNITIVE_CONFIG' | 'REPORT_PACKAGE' | 'ASSESSMENT_BUNDLE'

export interface MaterialGrantRow {
  id: string
  teacherId: string
  resourceType: MaterialResourceType
  resourceId: string
  grantedBy: string
  createdAt: string
  teacher: { id: string; username: string; nickname: string | null; role: string } | null
  granter: { id: string; username: string; nickname: string | null } | null
  resource: { id: string; name: string; status?: string } | null
  resourceMissing: boolean
}

export const materialGrantApi = {
  list: (query: { resourceType?: MaterialResourceType; resourceId?: string; teacherId?: string } = {}) => {
    const params = new URLSearchParams()
    if (query.resourceType) params.set('resourceType', query.resourceType)
    if (query.resourceId) params.set('resourceId', query.resourceId)
    if (query.teacherId) params.set('teacherId', query.teacherId)
    const qs = params.toString()
    return apiClient.get<{ list: MaterialGrantRow[] }>(`/admin/material-grants${qs ? `?${qs}` : ''}`)
  },
  create: (input: { teacherId: string; resourceType: MaterialResourceType; resourceId: string }) =>
    apiClient.post<MaterialGrantRow>('/admin/material-grants', input),
  batch: (input: { resourceType: MaterialResourceType; resourceId: string; teacherIds: string[] }) =>
    apiClient.post<{ list: MaterialGrantRow[] }>('/admin/material-grants/batch', input),
  set: (input: { resourceType: MaterialResourceType; resourceId: string; teacherIds: string[] }) =>
    apiClient.put<{ list: MaterialGrantRow[] }>('/admin/material-grants/set', input),
  remove: (id: string) => apiClient.delete<{ id: string }>(`/admin/material-grants/${id}`),
  listTeachers: async () => {
    const pageSize = 100
    const list: User[] = []
    let page = 1
    let last = await apiClient.get<{ list: User[]; total: number }>(`/users?role=TEACHER&page=${page}&pageSize=${pageSize}`)
    if (last.code !== 0 || !last.data) return last
    if (!Array.isArray(last.data.list)) throw new Error('教师名单格式不完整')
    list.push(...last.data.list)
    const total = last.data.total ?? list.length
    while (list.length < total) {
      page += 1
      last = await apiClient.get<{ list: User[]; total: number }>(`/users?role=TEACHER&page=${page}&pageSize=${pageSize}`)
      if (last.code !== 0 || !last.data) return last
      const chunk = last.data.list
      if (!Array.isArray(chunk) || chunk.length === 0 || (last.data.total != null && last.data.total !== total)) {
        throw new Error('教师名单读取不完整，请重新加载')
      }
      list.push(...chunk)
    }
    return { ...last, data: { ...last.data, list, total } }
  },
}

export const eligibleGrantTeachers = (users: User[]) =>
  users.filter((user) =>
    user.role === 'TEACHER'
    && user.teacherApproved === true
    && user.isActive === true
    && user.isFrozen === false
  )
