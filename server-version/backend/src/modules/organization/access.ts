import type { Prisma } from '@prisma/client'
import { currentClassDeliverySql } from './deliveryPolicy'
import { NextFunction, Request, Response } from 'express'
import { prisma } from '../../config/database'
import { AuthenticatedPrincipal } from '../../types'
import { forbidden, notFound, unauthorized } from '../../utils/response'
import { OrganizationCapability, OrganizationPersona, OrganizationRole, OrganizationStatus } from './types'

export interface OrganizationAccessContext {
  organizationId: string
  organizationStatus: OrganizationStatus
  productDomain: 'LEGACY' | 'SCHOOL'
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

type AccessRow = {
  id: string
  status: OrganizationStatus
  productDomain: 'LEGACY' | 'SCHOOL'
  viewerDomain: string
  huischoolEntitled: boolean
  membershipId: string | null
  orgRole: OrganizationRole | null
  schoolProductAdmin: boolean
  personas: OrganizationPersona[]
  capabilities: OrganizationCapability[]
  explicitDenies: string[]
}

export async function resolveOrganizationAccessContext(input: {
  principal: Pick<AuthenticatedPrincipal, 'userId' | 'platformRole'>
  organizationId: string
  /** Internal product adapter only; default School semantics remain unchanged. */
  educationProduct?: 'HUITEACHER'
}, tx?: Prisma.TransactionClient): Promise<OrganizationAccessContext | null> {
  const db = tx ?? prisma
  const educationProduct=input.educationProduct??'HUISCHOOL'
  // Read mutable authority in one PostgreSQL statement. Correlated arrays keep
  // grants independent, so multiple personas/denies cannot multiply rows.
  // Each invocation still reads current state, including inside a transaction.
  const rows = await db.$queryRaw<AccessRow[]>`
    SELECT o."id", o."status", o."product_domain" AS "productDomain",
           u."account_domain" AS "viewerDomain",
           EXISTS (SELECT 1 FROM "education_product_entitlements" entitlement
             WHERE entitlement."organization_id"=o."id"
               AND entitlement."product"=${educationProduct}
               AND entitlement."status"='ACTIVE') AS "huischoolEntitled",
           m."id" AS "membershipId", m."org_role" AS "orgRole",
           COALESCE(m."schoolProductAdmin", FALSE) AS "schoolProductAdmin",
           ARRAY(SELECT persona."persona" FROM "organization_persona_grants" persona
             WHERE persona."organization_id"=o."id" AND persona."membership_id"=m."id"
               AND persona."revoked_at" IS NULL) AS "personas",
           ARRAY(SELECT capability."capability" FROM "organization_capability_grants" capability
             WHERE capability."organization_id"=o."id" AND capability."membership_id"=m."id"
               AND capability."revoked_at" IS NULL) AS "capabilities",
           ARRAY(SELECT deny."permission" FROM "organization_access_denies" deny
             WHERE deny."organization_id"=o."id" AND deny."user_id"=u."id"
               AND deny."lifted_at" IS NULL) AS "explicitDenies"
    FROM "organizations" o
    JOIN "users" u ON u."id" = ${input.principal.userId}
    LEFT JOIN LATERAL (
      SELECT member."id", member."org_role",
        EXISTS(SELECT 1 FROM "education_product_role_grants" product_admin
          WHERE product_admin."organization_id"=member."organization_id"
            AND product_admin."membership_id"=member."id"
            AND product_admin."product"=${educationProduct}
            AND product_admin."role"='PRODUCT_ADMIN'
            AND product_admin."revoked_at" IS NULL) AS "schoolProductAdmin"
      FROM "organization_memberships" member
      WHERE member."organization_id"=o."id" AND member."user_id"=u."id"
        AND member."valid_from"<=statement_timestamp()
        AND (member."valid_until" IS NULL OR statement_timestamp()<member."valid_until")
      ORDER BY member."valid_from" DESC
      LIMIT 1
    ) m ON TRUE
    WHERE o."id" = ${input.organizationId}
    LIMIT 1
  `
  const organization = rows[0]
  if (!organization) return null
  // Platform authority never crosses identity realms or product enrollment.
  if ((organization.productDomain === 'SCHOOL') !== (organization.viewerDomain === 'SCHOOL')) return null
  if (organization.productDomain === 'SCHOOL' && !organization.huischoolEntitled) return null

  const membership = organization.membershipId
    ? { id: organization.membershipId, orgRole: organization.orgRole }
    : null
  const schoolOrgRole: OrganizationRole | null = membership
    ? (organization.productDomain === 'SCHOOL'
      && membership.orgRole === 'ORG_ADMIN' && !organization.schoolProductAdmin
        ? 'MEMBER' : membership.orgRole)
    : null
  const explicitDenies = organization.explicitDenies
  if (organization.productDomain === 'SCHOOL' && explicitDenies.some(x =>
    ['*', 'EDUCATION_ACCESS', educationProduct+'_ACCESS'].includes(x))) return null
  const basis: OrganizationAccessContext['basis'] = []
  if (input.principal.platformRole === 'SYSTEM_ADMIN') basis.push('SYSTEM_ADMIN')
  if (schoolOrgRole === 'ORG_ADMIN') basis.push('ORG_ADMIN')
  if (membership) basis.push('MEMBERSHIP')
  if (organization.capabilities.length > 0) basis.push('CAPABILITY')

  const deniedAll = explicitDenies.includes('*') || explicitDenies.includes('ORGANIZATION_GOVERNANCE')
  const canGovern = !deniedAll && (organization.status === 'ACTIVE' || input.principal.platformRole === 'SYSTEM_ADMIN') && (
    input.principal.platformRole === 'SYSTEM_ADMIN' || schoolOrgRole === 'ORG_ADMIN'
  )

  return {
    organizationId: input.organizationId,
    organizationStatus: organization.status,
    productDomain: organization.productDomain,
    userId: input.principal.userId,
    platformRole: input.principal.platformRole,
    membershipId: membership?.id ?? null,
    orgRole: schoolOrgRole,
    personas: organization.personas,
    capabilities: organization.capabilities,
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
  // SCHOOL sensitive capabilities are explicit; governance is not a report grant.
  if (context.productDomain === 'SCHOOL' && [
    'PSYCHOLOGY_STAFF', 'REPORT_EXPORT', 'REPORT_MEMBER_EXPORT', 'PARENT_REPORT_DISCLOSURE',
  ].includes(capability)) return context.capabilities.includes(capability)
  if (context.orgRole === 'ORG_ADMIN') return true
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
  return context ? resolveAssessmentDeliveryAuthorityFromContext(context) : null
}

/** Derive navigation hints from the context just read by the same request.
 * Exact resource entrypoints continue to resolve their own current authority.
 */
export async function resolveAssessmentDeliveryAuthorityFromContext(
  context: OrganizationAccessContext,
): Promise<AssessmentDeliveryAuthorityContext | null> {
  if (!context.membershipId || context.organizationStatus !== 'ACTIVE') return null
  if (context.explicitDenies.some((permission) => [
    '*',
    'ORGANIZATION_GOVERNANCE',
    'ASSESSMENT_DELIVERY',
    'ASSESSMENT_RUN_PUBLISH',
    'RUN_PUBLISH',
  ].includes(permission))) return null

  const deliveryScopes: AssessmentDeliveryScope[] = []
  if (context.orgRole === 'ORG_ADMIN') deliveryScopes.push('ORGANIZATION')
  if (context.personas.includes('TEACHER')) {
    const rows = await prisma.$queryRaw<Array<{ allowed: boolean }>>`
      SELECT EXISTS (
        SELECT 1 FROM "organization_staff_class_assignments" sa
        WHERE sa."organization_id" = ${context.organizationId}
          AND sa."membership_id" = ${context.membershipId}
          AND ${currentClassDeliverySql}
      ) AS "allowed"
    `
    if (rows[0]?.allowed) deliveryScopes.push('CLASS')
  }
  if (context.personas.includes('COUNSELOR')) {
    const rows = await prisma.$queryRaw<Array<{ allowed: boolean }>>`
      SELECT EXISTS (
        SELECT 1 FROM "organization_counselor_client_relationships" r
        WHERE r."organization_id" = ${context.organizationId}
          AND r."counselor_membership_id" = ${context.membershipId}
          AND r."valid_until" IS NULL
      ) AS "allowed"
    `
    if (rows[0]?.allowed) deliveryScopes.push('PROFESSIONAL')
  }
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
