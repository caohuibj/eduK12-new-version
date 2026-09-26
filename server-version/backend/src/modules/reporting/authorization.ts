import { prisma } from '../../config/database'
import { resolveOrganizationAccessContext, type OrganizationAccessContext } from '../organization/access'
import { ReportingError, reportingFail } from './types'

export interface ReportingPrincipal {
  userId: string
  platformRole: 'SYSTEM_ADMIN' | 'STANDARD'
}

type RunAuthorityRow = { runId: string; createdByUserId: string }

const hidden = (): never => reportingFail('REPORT_NOT_FOUND', 'reporting resource not found', 404)

const readScopedRuns = async (organizationId: string, runIds: string[]): Promise<RunAuthorityRow[]> => {
  const ids = [...new Set(runIds)]
  if (!ids.length) return []
  const rows = await prisma.$queryRaw<RunAuthorityRow[]>`
    SELECT "id" AS "runId", "created_by_user_id" AS "createdByUserId"
    FROM "assessment_runs"
    WHERE "organization_id"=${organizationId} AND "id" = ANY(${ids}::text[])
  `
  if (rows.length !== ids.length) hidden()
  return rows
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

export const assertOrganizationGroupSubgroupSubjectsAccess = async (input: {
  principal: ReportingPrincipal
  organizationId: string
  subjectUserIds: string[]
}): Promise<{ organizationManager: boolean }> => {
  const context = await resolveOrganizationAccessContext({ principal: input.principal, organizationId: input.organizationId })
    ?? hidden()
  assertNoReportDeny(context)
  if (context.membershipId === null) hidden()
  if (context.organizationStatus !== 'ACTIVE') {
    reportingFail('ORGANIZATION_SUSPENDED', 'organization is suspended', 409)
  }
  const organizationManager = context.orgRole === 'ORG_ADMIN' || context.capabilities.includes('PSYCHOLOGY_STAFF')
  if (organizationManager) return { organizationManager: true }
  const teacher = context.personas.includes('TEACHER')
  const counselor = context.personas.includes('COUNSELOR')
  if (!teacher && !counselor) hidden()

  const allowed = await prisma.$queryRaw<Array<{ userId: string }>>`
    SELECT DISTINCT membership."user_id" AS "userId"
    FROM "organization_memberships" membership
    WHERE membership."organization_id"=${input.organizationId}
      AND membership."valid_from" <= statement_timestamp()
      AND (membership."valid_until" IS NULL OR membership."valid_until" > statement_timestamp())
      AND (
        (${teacher} AND EXISTS (
          SELECT 1
          FROM "organization_student_class_assignments" student
          JOIN "organization_staff_class_assignments" staff
            ON staff."organization_id"=student."organization_id"
           AND staff."class_unit_id"=student."class_unit_id"
           AND staff."membership_id"=${context.membershipId}
           AND staff."valid_from" <= statement_timestamp()
           AND (staff."valid_until" IS NULL OR staff."valid_until" > statement_timestamp())
          JOIN "organization_persona_grants" persona
            ON persona."organization_id"=membership."organization_id"
           AND persona."membership_id"=membership."id"
           AND persona."persona"='STUDENT'
           AND persona."revoked_at" IS NULL
          WHERE student."organization_id"=membership."organization_id"
            AND student."membership_id"=membership."id"
            AND student."valid_from" <= statement_timestamp()
            AND (student."valid_until" IS NULL OR student."valid_until" > statement_timestamp())
        ))
        OR (${counselor} AND EXISTS (
          SELECT 1
          FROM "organization_counselor_client_relationships" relation
          JOIN "organization_persona_grants" persona
            ON persona."organization_id"=membership."organization_id"
           AND persona."membership_id"=membership."id"
           AND persona."persona"='CLIENT'
           AND persona."revoked_at" IS NULL
          WHERE relation."organization_id"=membership."organization_id"
            AND relation."counselor_membership_id"=${context.membershipId}
            AND relation."client_membership_id"=membership."id"
            AND relation."valid_from" <= statement_timestamp()
            AND (relation."valid_until" IS NULL OR relation."valid_until" > statement_timestamp())
        ))
      )
  `
  const allowedUsers = new Set(allowed.map((row) => row.userId))
  if ([...new Set(input.subjectUserIds)].some((userId) => !allowedUsers.has(userId))) hidden()
  return { organizationManager: false }
}

const resolveScopedContextBatch = async (input: {
  principal: ReportingPrincipal
  organizationId: string
  runIds: string[]
}): Promise<{ context: OrganizationAccessContext; runs: RunAuthorityRow[] }> => {
  const ids = [...new Set(input.runIds)]
  const [resolved, runs] = await Promise.all([
    resolveOrganizationAccessContext({ principal: input.principal, organizationId: input.organizationId }),
    readScopedRuns(input.organizationId, ids),
  ])
  const context = resolved ?? hidden()
  assertNoReportDeny(context)
  return { context, runs }
}

/**
 * Analysis generation is always a current-tenant operation. A suspended
 * Organization cannot generate/reuse a fresh report, and platform role alone
 * never substitutes for a current Organization membership.
 */
export const assertOrganizationGroupReportsGenerateAccess = async (input: {
  principal: ReportingPrincipal
  organizationId: string
  runIds: string[]
}): Promise<void> => {
  const { context, runs } = await resolveScopedContextBatch(input)
  if (context.membershipId === null) hidden()
  if (context.organizationStatus !== 'ACTIVE') {
    reportingFail('ORGANIZATION_SUSPENDED', 'organization is suspended', 409)
  }
  for (const run of runs) assertCurrentGroupAudience({ context, principal: input.principal, run })
}

export const assertOrganizationGroupReportGenerateAccess = async (input: {
  principal: ReportingPrincipal
  organizationId: string
  runId: string
}): Promise<void> => assertOrganizationGroupReportsGenerateAccess({ ...input, runIds: [input.runId] })

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
export const assertOrganizationGroupArtifactsReadAccess = async (input: {
  principal: ReportingPrincipal
  organizationId: string
  runIds: string[]
}): Promise<void> => {
  const { context, runs } = await resolveScopedContextBatch(input)
  if (context.membershipId === null) hidden()
  if (context.organizationStatus !== 'ACTIVE') {
    if (input.principal.platformRole === 'SYSTEM_ADMIN') return
    reportingFail('ORGANIZATION_SUSPENDED', 'organization is suspended', 409)
  }
  for (const run of runs) assertCurrentGroupAudience({ context, principal: input.principal, run })
}

export const assertOrganizationGroupArtifactReadAccess = async (input: {
  principal: ReportingPrincipal
  organizationId: string
  runId: string
}): Promise<void> => assertOrganizationGroupArtifactsReadAccess({ ...input, runIds: [input.runId] })

export const hideUnauthorizedArtifact = async <T>(operation: () => Promise<T>): Promise<T> => {
  try { return await operation() }
  catch (error) {
    if (error instanceof ReportingError && ['REPORT_NOT_FOUND', 'REPORT_AUTHORITY_REVOKED'].includes(error.code)) {
      reportingFail('REPORT_ARTIFACT_NOT_FOUND', 'reporting artifact not found', 404)
    }
    throw error
  }
}
