import apiClient from './client'

export type PlatformRole = 'SYSTEM_ADMIN' | 'STANDARD'
export type OrganizationStatus = 'ACTIVE' | 'SUSPENDED'
export type OrganizationRole = 'MEMBER' | 'ORG_ADMIN'
export type OrganizationPersona = 'TEACHER' | 'STUDENT' | 'COUNSELOR' | 'CLIENT'
export type OrganizationCapability = 'PSYCHOLOGY_STAFF' | 'REPORT_EXPORT' | 'REPORT_MEMBER_EXPORT'
export type OrganizationAccessBasis = 'SYSTEM_ADMIN' | 'ORG_ADMIN' | 'MEMBERSHIP' | 'CAPABILITY'

export interface AccessibleOrganization {
  id: string
  name: string
  status: OrganizationStatus
  membershipId: string | null
  orgRole: OrganizationRole | null
  createdAt: string
  scopeBasis: 'SYSTEM_ADMIN' | 'MEMBERSHIP'
}

export interface OrganizationListProjection {
  platformRole: PlatformRole
  list: AccessibleOrganization[]
  total: number
  page: number
  pageSize: number
}

export interface OrganizationAccessContext {
  organizationId: string
  organizationStatus: OrganizationStatus
  userId: string
  platformRole: PlatformRole
  membershipId: string | null
  orgRole: OrganizationRole | null
  personas: OrganizationPersona[]
  capabilities: OrganizationCapability[]
  explicitDenies: string[]
  basis: OrganizationAccessBasis[]
  canGovern: boolean
}

export interface OrganizationContextProjection {
  organization: {
    id: string
    name: string
    status: OrganizationStatus
  }
  access: OrganizationAccessContext
}

const requireData = <T>(response: { code: number | string; message: string; data?: T }): T => {
  if (response.code !== 0 || response.data === undefined || response.data === null) {
    throw new Error(response.message || '组织服务响应无效')
  }
  return response.data
}

export const organizationApi = {
  async list(page = 1, pageSize = 50): Promise<OrganizationListProjection> {
    return requireData(await apiClient.get<OrganizationListProjection>('/organizations', {
      params: { page, pageSize },
    }))
  },

  async context(organizationId: string): Promise<OrganizationContextProjection> {
    return requireData(await apiClient.get<OrganizationContextProjection>(
      `/organizations/${encodeURIComponent(organizationId)}/context`,
    ))
  },
}
