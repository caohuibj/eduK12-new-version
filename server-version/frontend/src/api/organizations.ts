import apiClient from './client'

export type PlatformRole = 'SYSTEM_ADMIN' | 'STANDARD'
export type OrganizationStatus = 'ACTIVE' | 'SUSPENDED'
export type OrganizationRole = 'MEMBER' | 'ORG_ADMIN'
export type OrganizationPersona = 'TEACHER' | 'STUDENT' | 'COUNSELOR' | 'CLIENT'
export type OrganizationCapability = 'PSYCHOLOGY_STAFF' | 'REPORT_EXPORT' | 'REPORT_MEMBER_EXPORT'
export type OrganizationAccessBasis = 'SYSTEM_ADMIN' | 'ORG_ADMIN' | 'MEMBERSHIP' | 'CAPABILITY'
export type OrganizationUnitKind = 'GRADE' | 'CLASS'
export type StaffClassRole = 'HOMEROOM' | 'TEACHING'

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
  allowedActions: Array<'CREATE_ORGANIZATION'>
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

export type OrganizationProductAction = 'GOVERN' | 'RUNS' | 'MANAGE_DENIES' | 'SUSPEND' | 'RESUME' | 'REPORTING' | 'SAFETY' | 'EXPORT_AGGREGATE' | 'EXPORT_MEMBER' | 'DELIVERY'

export interface OrganizationContextProjection {
  allowedActions: OrganizationProductAction[]
  organization: {
    id: string
    name: string
    status: OrganizationStatus
  }
  access: OrganizationAccessContext
}

export interface OrganizationMembership {
  id: string
  userId: string
  orgRole: OrganizationRole
  validFrom: string
  validUntil: string | null
  endedByUserId: string | null
  endReason: string | null
}

export interface OrganizationUnit {
  id: string
  organizationId: string
  unitKind: OrganizationUnitKind
  name: string
  parentUnitId: string | null
  createdAt: string
  updatedAt: string
}

export interface StudentClassAssignment {
  id: string
  membershipId: string
  classUnitId: string
  isPrimary: boolean
  validFrom: string
  validUntil: string | null
}

export interface StaffClassAssignment {
  id: string
  membershipId: string
  classUnitId: string
  staffRole: StaffClassRole
  validFrom: string
  validUntil: string | null
}

export interface PersonaGrantHistory {
  id: string
  persona: OrganizationPersona
  grantedByUserId: string
  grantedAt: string
  revokedByUserId: string | null
  revokedAt: string | null
}

export interface CapabilityGrantHistory {
  id: string
  capability: OrganizationCapability
  grantedByUserId: string
  grantedAt: string
  revokedByUserId: string | null
  revokedAt: string | null
}

export interface MembershipAccessHistory {
  membership: Pick<OrganizationMembership, 'id' | 'userId' | 'orgRole' | 'validFrom' | 'validUntil'>
  personas: PersonaGrantHistory[]
  capabilities: CapabilityGrantHistory[]
}

export interface Paged<T> {
  list: T[]
  total: number
  page: number
  pageSize: number
}

const requireData = <T>(response: { code: number | string; message: string; data?: T }): T => {
  if (response.code !== 0 || response.data === undefined || response.data === null) {
    throw new Error(response.message || '组织服务响应无效')
  }
  return response.data
}

const commandKey = (prefix: string) => `${prefix}-${typeof crypto !== 'undefined' && 'randomUUID' in crypto ? crypto.randomUUID() : `${Date.now()}-${Math.random().toString(36).slice(2)}`}`
const orgPath = (organizationId: string) => `/organizations/${encodeURIComponent(organizationId)}`

export interface ClassificationProjection {
  dimensions: Array<{ id: string; key: string; name: string; cardinality: 'SINGLE' | 'MULTI' }>
  labels: Array<{ id: string; dimensionId: string; name: string }>
  assignments: Array<{ id: string; membershipId: string; labelId: string; validFrom: string; validUntil: string | null }>
  relationships: Array<{ id: string; counselorMembershipId: string; clientMembershipId: string; validFrom: string; validUntil: string | null }>
  historyLimit: number
}

export const organizationApi = {
  async create(name: string, firstAdminUserId: string): Promise<{ organization: { id: string } }> {
    return requireData(await apiClient.post('/organizations', { name, firstAdminUserId, commandKey: commandKey('org-create') }))
  },
  async classification(organizationId: string): Promise<ClassificationProjection> {
    return requireData(await apiClient.get<ClassificationProjection>(`${orgPath(organizationId)}/classification`))
  },
  async classificationCommand(organizationId: string, command: Record<string, string>): Promise<unknown> {
    return requireData(await apiClient.post(`${orgPath(organizationId)}/classification`, command))
  },
  async audit(organizationId: string, page = 1): Promise<{ list: Array<{ id: string; action: string; actorUserId: string; targetType: string; targetId: string; createdAt: string }> }> {
    return requireData(await apiClient.get(`${orgPath(organizationId)}/audit`, { params: { page, pageSize: 50 } }))
  },
  async list(page = 1, pageSize = 50): Promise<OrganizationListProjection> {
    return requireData(await apiClient.get<OrganizationListProjection>('/organizations', {
      params: { page, pageSize },
    }))
  },

  async context(organizationId: string): Promise<OrganizationContextProjection> {
    return requireData(await apiClient.get<OrganizationContextProjection>(
      `${orgPath(organizationId)}/context`,
    ))
  },

  async listMemberships(organizationId: string, page = 1, pageSize = 100): Promise<Paged<OrganizationMembership>> {
    return requireData(await apiClient.get<Paged<OrganizationMembership>>(`${orgPath(organizationId)}/memberships`, {
      params: { page, pageSize },
    }))
  },

  async createMembership(organizationId: string, userId: string, orgRole: OrganizationRole = 'MEMBER'): Promise<OrganizationMembership> {
    return requireData(await apiClient.post<OrganizationMembership>(`${orgPath(organizationId)}/memberships`, {
      userId, orgRole, commandKey: commandKey('org-membership-create'),
    }))
  },

  async endMembership(organizationId: string, membershipId: string, reason?: string): Promise<OrganizationMembership> {
    return requireData(await apiClient.post<OrganizationMembership>(`${orgPath(organizationId)}/memberships/${encodeURIComponent(membershipId)}/end`, {
      reason, commandKey: commandKey('org-membership-end'),
    }))
  },

  async setMembershipRole(organizationId: string, membershipId: string, orgRole: OrganizationRole): Promise<OrganizationMembership> {
    return requireData(await apiClient.post<OrganizationMembership>(`${orgPath(organizationId)}/memberships/${encodeURIComponent(membershipId)}/role`, {
      orgRole, commandKey: commandKey('org-membership-role'),
    }))
  },

  async membershipAccessHistory(organizationId: string, membershipId: string): Promise<MembershipAccessHistory> {
    return requireData(await apiClient.get<MembershipAccessHistory>(`${orgPath(organizationId)}/memberships/${encodeURIComponent(membershipId)}/access-history`))
  },

  async grantPersona(organizationId: string, membershipId: string, persona: OrganizationPersona): Promise<unknown> {
    return requireData(await apiClient.post(`${orgPath(organizationId)}/memberships/${encodeURIComponent(membershipId)}/personas`, {
      persona, commandKey: commandKey('org-persona-grant'),
    }))
  },

  async revokePersona(organizationId: string, membershipId: string, persona: OrganizationPersona): Promise<unknown> {
    return requireData(await apiClient.post(`${orgPath(organizationId)}/memberships/${encodeURIComponent(membershipId)}/personas/revoke`, {
      persona, commandKey: commandKey('org-persona-revoke'),
    }))
  },

  async grantCapability(organizationId: string, membershipId: string, capability: OrganizationCapability): Promise<unknown> {
    return requireData(await apiClient.post(`${orgPath(organizationId)}/memberships/${encodeURIComponent(membershipId)}/capabilities`, {
      capability, commandKey: commandKey('org-capability-grant'),
    }))
  },

  async revokeCapability(organizationId: string, membershipId: string, capability: OrganizationCapability): Promise<unknown> {
    return requireData(await apiClient.post(`${orgPath(organizationId)}/memberships/${encodeURIComponent(membershipId)}/capabilities/revoke`, {
      capability, commandKey: commandKey('org-capability-revoke'),
    }))
  },

  async suspend(organizationId: string): Promise<unknown> {
    return requireData(await apiClient.post(`${orgPath(organizationId)}/suspend`, { commandKey: commandKey('org-suspend') }))
  },

  async resume(organizationId: string): Promise<unknown> {
    return requireData(await apiClient.post(`${orgPath(organizationId)}/resume`, { commandKey: commandKey('org-resume') }))
  },

  async deny(organizationId: string, userId: string, permission: string, reason: string): Promise<unknown> {
    return requireData(await apiClient.post(`${orgPath(organizationId)}/access-denies`, {
      userId, permission, reason, commandKey: commandKey('org-deny'),
    }))
  },

  async liftDeny(organizationId: string, userId: string, permission: string): Promise<unknown> {
    return requireData(await apiClient.post(`${orgPath(organizationId)}/access-denies/lift`, {
      userId, permission, commandKey: commandKey('org-deny-lift'),
    }))
  },

  async listUnits(organizationId: string): Promise<OrganizationUnit[]> {
    return requireData<{ list: OrganizationUnit[] }>(await apiClient.get(`${orgPath(organizationId)}/units`)).list
  },

  async createUnit(organizationId: string, input: { unitKind: OrganizationUnitKind; name: string; parentUnitId?: string | null }): Promise<OrganizationUnit> {
    return requireData(await apiClient.post<OrganizationUnit>(`${orgPath(organizationId)}/units`, input))
  },

  async deleteUnit(organizationId: string, unitId: string): Promise<void> {
    await apiClient.delete(`${orgPath(organizationId)}/units/${encodeURIComponent(unitId)}`)
  },

  async listStudentAssignments(organizationId: string, currentOnly = false): Promise<Paged<StudentClassAssignment>> {
    return requireData(await apiClient.get<Paged<StudentClassAssignment>>(`${orgPath(organizationId)}/student-class-assignments`, {
      params: { page: 1, pageSize: 100, currentOnly },
    }))
  },

  async assignStudent(organizationId: string, input: { membershipId: string; classUnitId: string; isPrimary?: boolean }): Promise<StudentClassAssignment> {
    return requireData(await apiClient.post<StudentClassAssignment>(`${orgPath(organizationId)}/student-class-assignments`, input))
  },

  async endStudentAssignment(organizationId: string, assignmentId: string): Promise<StudentClassAssignment> {
    return requireData(await apiClient.post<StudentClassAssignment>(`${orgPath(organizationId)}/student-class-assignments/${encodeURIComponent(assignmentId)}/end`))
  },

  async listStaffAssignments(organizationId: string, currentOnly = false): Promise<Paged<StaffClassAssignment>> {
    return requireData(await apiClient.get<Paged<StaffClassAssignment>>(`${orgPath(organizationId)}/staff-class-assignments`, {
      params: { page: 1, pageSize: 100, currentOnly },
    }))
  },

  async assignStaff(organizationId: string, input: { membershipId: string; classUnitId: string; staffRole: StaffClassRole }): Promise<StaffClassAssignment> {
    return requireData(await apiClient.post<StaffClassAssignment>(`${orgPath(organizationId)}/staff-class-assignments`, input))
  },

  async endStaffAssignment(organizationId: string, assignmentId: string): Promise<StaffClassAssignment> {
    return requireData(await apiClient.post<StaffClassAssignment>(`${orgPath(organizationId)}/staff-class-assignments/${encodeURIComponent(assignmentId)}/end`))
  },
}
