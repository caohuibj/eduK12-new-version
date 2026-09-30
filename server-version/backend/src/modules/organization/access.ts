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
      assessmentDeliveryAccess?: AssessmentDeliveryAuthorityContext
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
  const canGovern = !deniedAll && (organization.status === 'ACTIVE' || input.principal.platformRole === 'SYSTEM_ADMIN') && (
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

export type AssessmentDeliveryScope = 'ORGANIZATION' | 'CLASS' | 'PROFESSIONAL'

export interface AssessmentDeliveryAuthorityContext extends OrganizationAccessContext {
  deliveryScopes: AssessmentDeliveryScope[]
}

/**
 * Assessment delivery is narrower than Organization governance.
 *
 * A current ORG_ADMIN may create institution-wide campaigns. TEACHER and
 * COUNSELOR personas may create campaigns only inside their relationship scope;
 * publish/preview re-check every resolved pair. Platform role alone is not
 * delivery authority and explicit denies remain fail-closed.
 */
export async function resolveAssessmentDeliveryAuthority(input: {
  principal: Pick<AuthenticatedPrincipal, 'userId' | 'platformRole'>
  organizationId: string
}): Promise<AssessmentDeliveryAuthorityContext | null> {
  const context = await resolveOrganizationAccessContext(input)
  if (!context?.membershipId || context.organizationStatus !== 'ACTIVE') return null
  if (context.explicitDenies.some((permission) => [
    '*',
    'ORGANIZATION_GOVERNANCE',
    'ASSESSMENT_DELIVERY',
    'ASSESSMENT_RUN_PUBLISH',
    'RUN_PUBLISH',
  ].includes(permission))) return null

  const deliveryScopes: AssessmentDeliveryScope[] = []
  if (context.orgRole === 'ORG_ADMIN') deliveryScopes.push('ORGANIZATION')
  if (context.personas.includes('TEACHER')) deliveryScopes.push('CLASS')
  if (context.personas.includes('COUNSELOR')) deliveryScopes.push('PROFESSIONAL')
  if (deliveryScopes.length === 0) return null
  return { ...context, deliveryScopes }
}

export const requireAssessmentDeliveryAuthority = async (
  req: Request,
  res: Response,
  next: NextFunction,
) => {
  try {
    if (!req.user) return unauthorized(res)
    const organizationId = req.params.organizationId
    if (!organizationId) return notFound(res, '组织不存在')
    const context = await resolveAssessmentDeliveryAuthority({ principal: req.user, organizationId })
    if (!context) return forbidden(res, '无测评投放权限')
    req.assessmentDeliveryAccess = context
    next()
  } catch (err) {
    next(err)
  }
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

/**
 * Break-glass surface for explicit-deny management only.
 *
 * Explicit deny continues to outrank SYSTEM_ADMIN for every ordinary
 * Organization operation. Deny management itself is the recovery surface:
 * a current SYSTEM_ADMIN may enter even when its OrganizationAccessContext is
 * denied, while STANDARD users still require normal Organization governance.
 */
export const requireOrganizationDenyGovernance = async (
  req: Request,
  res: Response,
  next: NextFunction,
) => {
  try {
    if (!req.user) return unauthorized(res)
    const organizationId = req.params.organizationId
    if (!organizationId) return notFound(res, '组织不存在')
    const context = await resolveOrganizationAccessContext({ principal: req.user, organizationId })
    if (!context) return notFound(res, '组织不存在')
    if (req.user.platformRole !== 'SYSTEM_ADMIN' && !context.canGovern) {
      return forbidden(res, '无组织拒绝规则治理权限')
    }
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
