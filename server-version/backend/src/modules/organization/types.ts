export type OrganizationStatus = 'ACTIVE' | 'SUSPENDED'
export type OrganizationRole = 'MEMBER' | 'ORG_ADMIN'
export type OrganizationPersona = 'TEACHER' | 'STUDENT' | 'COUNSELOR' | 'CLIENT'
export type OrganizationCapability = 'PSYCHOLOGY_STAFF' | 'REPORT_EXPORT' | 'REPORT_MEMBER_EXPORT'

export interface OrganizationRecord {
  id: string
  name: string
  status: OrganizationStatus
  createdByUserId: string
  suspendedAt: Date | null
  createdAt: Date
  updatedAt: Date
}

export interface MembershipRecord {
  id: string
  organizationId: string
  userId: string
  orgRole: OrganizationRole
  validFrom: Date
  validUntil: Date | null
  endedByUserId: string | null
  endReason: string | null
}

export class OrganizationDomainError extends Error {
  constructor(
    public readonly code: string,
    message: string,
    public readonly statusCode = 409,
  ) {
    super(message)
    this.name = 'OrganizationDomainError'
  }
}
