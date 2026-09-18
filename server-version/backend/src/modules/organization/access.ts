import { NextFunction, Request, Response } from 'express'
import { prisma } from '../../config/database'
import { AuthenticatedPrincipal } from '../../types'
import { forbidden, notFound, unauthorized } from '../../utils/response'
import { OrganizationCapability, OrganizationPersona, OrganizationRole, OrganizationStatus } from './types'

export interface OrganizationAccessContext {
  organizationId: string
  organizationStatus: OrganizationStatus
  userId: string
  platformRole: 'SYSTEM_ADMIN' | 'STANDARD'
  membershipId: string | null
  orgRole: OrganizationRole | null
  personas: OrganizationPersona[]
  capabilities: OrganizationCapability[]
  explicitDenies: string[]
  basis: Array<'SYSTEM_ADMIN' | 'ORG_ADMIN' | 'MEMBERSHIP' | 'CAPABILITY'>
  canGovern: boolean
}

declare global {
  namespace Express {
    interface Request {
      organizationAccess?: OrganizationAccessContext
    }
  }
}

type OrgRow = { id: string; status: OrganizationStatus }
type MembershipRow = { id: string; orgRole: OrganizationRole }
type PersonaRow = { persona: OrganizationPersona }
type CapabilityRow = { capability: OrganizationCapability }
type DenyRow = { permission: string }

export async function resolveOrganizationAccessContext(input: {
  principal: Pick<AuthenticatedPrincipal, 'userId' | 'platformRole'>
  organizationId: string
}): Promise<OrganizationAccessContext | null> {
  const organizations = await prisma.$queryRaw<OrgRow[]>`
    SELECT "id", "status"
    FROM "organizations"
    WHERE "id" = ${input.organizationId}
    LIMIT 1
  `
  const organization = organizations[0]
  if (!organization) return null

  const [memberships, denyRows] = await Promise.all([
    prisma.$queryRaw<MembershipRow[]>`
      SELECT "id", "org_role" AS "orgRole"
      FROM "organization_memberships"
      WHERE "organization_id" = ${input.organizationId}
        AND "user_id" = ${input.principal.userId}
        AND "valid_from" <= statement_timestamp()
        AND ("valid_until" IS NULL OR statement_timestamp() < "valid_until")
      ORDER BY "valid_from" DESC
      LIMIT 1
    `,
    prisma.$queryRaw<DenyRow[]>`
      SELECT "permission"
      FROM "organization_access_denies"
      WHERE "organization_id" = ${input.organizationId}
        AND "user_id" = ${input.principal.userId}
        AND "lifted_at" IS NULL
    `,
  ])

  const membership = memberships[0] ?? null
  const [personaRows, capabilityRows] = membership
    ? await Promise.all([
        prisma.$queryRaw<PersonaRow[]>`
          SELECT "persona"
          FROM "organization_persona_grants"
          WHERE "organization_id" = ${input.organizationId}
            AND "membership_id" = ${membership.id}
            AND "revoked_at" IS NULL
        `,
        prisma.$queryRaw<CapabilityRow[]>`
          SELECT "capability"
          FROM "organization_capability_grants"
          WHERE "organization_id" = ${input.organizationId}
            AND "membership_id" = ${membership.id}
            AND "revoked_at" IS NULL
        `,
      ])
    : [[], []]

  const explicitDenies = denyRows.map((row) => row.permission)
  const basis: OrganizationAccessContext['basis'] = []
  if (input.principal.platformRole === 'SYSTEM_ADMIN') basis.push('SYSTEM_ADMIN')
  if (membership?.orgRole === 'ORG_ADMIN') basis.push('ORG_ADMIN')
  if (membership) basis.push('MEMBERSHIP')
  if (capabilityRows.length > 0) basis.push('CAPABILITY')

  const deniedAll = explicitDenies.includes('*') || explicitDenies.includes('ORGANIZATION_GOVERNANCE')
  const canGovern = !deniedAll && (
    input.principal.platformRole === 'SYSTEM_ADMIN' || membership?.orgRole === 'ORG_ADMIN'
  )

  return {
    organizationId: input.organizationId,
    organizationStatus: organization.status,
    userId: input.principal.userId,
    platformRole: input.principal.platformRole,
    membershipId: membership?.id ?? null,
    orgRole: membership?.orgRole ?? null,
    personas: personaRows.map((row) => row.persona),
    capabilities: capabilityRows.map((row) => row.capability),
    explicitDenies,
    basis,
    canGovern,
  }
}

export function contextHasCapability(
  context: OrganizationAccessContext,
  capability: OrganizationCapability,
): boolean {
  if (context.explicitDenies.includes('*') || context.explicitDenies.includes(capability)) return false
  if (context.organizationStatus !== 'ACTIVE') return false
  if (context.platformRole === 'SYSTEM_ADMIN' || context.orgRole === 'ORG_ADMIN') return true
  return context.capabilities.includes(capability)
}

export const requireOrganizationGovernance = async (req: Request, res: Response, next: NextFunction) => {
  try {
    if (!req.user) return unauthorized(res)
    const organizationId = req.params.organizationId
    if (!organizationId) return notFound(res, '组织不存在')
    const context = await resolveOrganizationAccessContext({ principal: req.user, organizationId })
    if (!context) return notFound(res, '组织不存在')
    if (!context.canGovern) return forbidden(res, '无组织治理权限')
    req.organizationAccess = context
    next()
  } catch (err) {
    next(err)
  }
}

export const requireOrganizationCapability = (capability: OrganizationCapability) => (
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      if (!req.user) return unauthorized(res)
      const organizationId = req.params.organizationId
      if (!organizationId) return notFound(res, '组织不存在')
      const context = await resolveOrganizationAccessContext({ principal: req.user, organizationId })
      if (!context) return notFound(res, '组织不存在')
      if (!contextHasCapability(context, capability)) return forbidden(res, '缺少组织能力授权')
      req.organizationAccess = context
      next()
    } catch (err) {
      next(err)
    }
  }
)
