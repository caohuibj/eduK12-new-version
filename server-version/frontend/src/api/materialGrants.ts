import apiClient from './client'
import type { User } from '../types'

export type MaterialResourceType = 'SCALE' | 'COGNITIVE_CONFIG'

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
  remove: (id: string) => apiClient.delete<{ id: string }>(`/admin/material-grants/${id}`),
  listTeachers: () => apiClient.get<{ list: User[] }>('/users?role=TEACHER&page=1&pageSize=100'),
}

export const eligibleGrantTeachers = (users: User[]) =>
  users.filter((user) =>
    user.role === 'TEACHER'
    && user.teacherApproved !== false
    && user.isActive !== false
    && user.isFrozen !== true
  )
