import { prisma } from '../../config/database'
import { resolveOrganizationAccessContext } from '../organization/access'
import { ReportingError, reportingFail } from './types'

export interface ReportingPrincipal {
  userId: string
  platformRole: 'SYSTEM_ADMIN' | 'STANDARD'
}

export const assertOrganizationGroupReportAccess = async (input: {
  principal: ReportingPrincipal
  organizationId: string
  runId: string
}): Promise<void> => {
  const resolved = await resolveOrganizationAccessContext({ principal: input.principal, organizationId: input.organizationId })
  if (resolved === null) throw new ReportingError('REPORT_NOT_FOUND', 'reporting resource not found', 404)
  const context = resolved
  if (context.membershipId === null) throw new ReportingError('REPORT_NOT_FOUND', 'reporting resource not found', 404)
  if (context.organizationStatus !== 'ACTIVE') reportingFail('ORGANIZATION_SUSPENDED', 'organization is suspended', 409)
  if (
    context.explicitDenies.includes('*')
    || context.explicitDenies.includes('REPORT_READ')
    || context.explicitDenies.includes('ORG_GROUP_REPORT_V1')
  ) reportingFail('REPORT_NOT_FOUND', 'reporting resource not found', 404)

  if (context.orgRole === 'ORG_ADMIN' || context.capabilities.includes('PSYCHOLOGY_STAFF')) return
  if (!context.personas.includes('TEACHER') && !context.personas.includes('COUNSELOR')) {
    reportingFail('REPORT_NOT_FOUND', 'reporting resource not found', 404)
  }
  const rows = await prisma.$queryRaw<Array<{ createdByUserId: string }>>`
    SELECT "created_by_user_id" AS "createdByUserId" FROM "assessment_runs"
    WHERE "organization_id"=${input.organizationId} AND "id"=${input.runId} LIMIT 1
  `
  if (!rows[0] || rows[0].createdByUserId !== input.principal.userId) {
    reportingFail('REPORT_NOT_FOUND', 'reporting resource not found', 404)
  }
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
