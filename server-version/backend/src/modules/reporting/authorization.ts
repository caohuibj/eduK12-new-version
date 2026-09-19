import { prisma } from '../../config/database'
import { resolveOrganizationAccessContext, type OrganizationAccessContext } from '../organization/access'
import { ReportingError, reportingFail } from './types'

export interface ReportingPrincipal {
  userId: string
  platformRole: 'SYSTEM_ADMIN' | 'STANDARD'
}

type RunAuthorityRow = { createdByUserId: string }

const hidden = (): never => reportingFail('REPORT_NOT_FOUND', 'reporting resource not found', 404)

const readScopedRun = async (organizationId: string, runId: string): Promise<RunAuthorityRow> => {
  const rows = await prisma.$queryRaw<RunAuthorityRow[]>`
    SELECT "created_by_user_id" AS "createdByUserId"
    FROM "assessment_runs"
    WHERE "organization_id"=${organizationId} AND "id"=${runId}
    LIMIT 1
  `
  return rows[0] ?? hidden()
}

const assertNoReportDeny = (context: OrganizationAccessContext): void => {
  if (
    context.explicitDenies.includes('*')
    || context.explicitDenies.includes('REPORT_READ')
    || context.explicitDenies.includes('ORG_GROUP_REPORT_V1')
  ) hidden()
}

const assertCurrentGroupAudience = (input: {
  context: OrganizationAccessContext
  principal: ReportingPrincipal
  run: RunAuthorityRow
}): void => {
  if (input.context.membershipId === null) hidden()
  if (input.context.orgRole === 'ORG_ADMIN' || input.context.capabilities.includes('PSYCHOLOGY_STAFF')) return
  if (!input.context.personas.includes('TEACHER') && !input.context.personas.includes('COUNSELOR')) hidden()
  if (input.run.createdByUserId !== input.principal.userId) hidden()
}

const resolveScopedContext = async (input: {
  principal: ReportingPrincipal
  organizationId: string
  runId: string
}): Promise<{ context: OrganizationAccessContext; run: RunAuthorityRow }> => {
  const [resolved, run] = await Promise.all([
    resolveOrganizationAccessContext({ principal: input.principal, organizationId: input.organizationId }),
    readScopedRun(input.organizationId, input.runId),
  ])
  const context = resolved ?? hidden()
  assertNoReportDeny(context)
  return { context, run }
}

/**
 * Analysis generation is always a current-tenant operation. A suspended
 * Organization cannot generate/reuse a fresh report, and platform role alone
 * never substitutes for a current Organization membership.
 */
export const assertOrganizationGroupReportGenerateAccess = async (input: {
  principal: ReportingPrincipal
  organizationId: string
  runId: string
}): Promise<void> => {
  const { context, run } = await resolveScopedContext(input)
  if (context.membershipId === null) hidden()
  if (context.organizationStatus !== 'ACTIVE') {
    reportingFail('ORGANIZATION_SUSPENDED', 'organization is suspended', 409)
  }
  assertCurrentGroupAudience({ context, principal: input.principal, run })
}

/**
 * Materialized artifacts are historical records, but authorization is still
 * evaluated on every read. Under Organization suspension ordinary report
 * browsing is denied; a current-member SYSTEM_ADMIN may perform the narrow
 * platform-governance historical read needed for investigation/recovery.
 *
 * PR1 Parent historical evidence is exact artifact + subject + Organization.
 * A GROUP artifact contains multiple subjects, so a single child's historical
 * evidence must never widen into access to the aggregate. Parent-only readers
 * therefore fail closed here until a future explicit group-artifact policy is
 * published; this does not create current tenant scope from historical evidence.
 */
export const assertOrganizationGroupArtifactReadAccess = async (input: {
  principal: ReportingPrincipal
  organizationId: string
  runId: string
}): Promise<void> => {
  const { context, run } = await resolveScopedContext(input)
  if (context.membershipId === null) hidden()
  if (context.organizationStatus !== 'ACTIVE') {
    if (input.principal.platformRole === 'SYSTEM_ADMIN') return
    reportingFail('ORGANIZATION_SUSPENDED', 'organization is suspended', 409)
  }
  assertCurrentGroupAudience({ context, principal: input.principal, run })
}

export const hideUnauthorizedArtifact = async <T>(operation: () => Promise<T>): Promise<T> => {
  try { return await operation() }
  catch (error) {
    if (error instanceof ReportingError && ['REPORT_NOT_FOUND', 'REPORT_AUTHORITY_REVOKED'].includes(error.code)) {
      reportingFail('REPORT_ARTIFACT_NOT_FOUND', 'reporting artifact not found', 404)
    }
    throw error
  }
}
