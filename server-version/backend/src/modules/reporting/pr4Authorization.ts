import { resolveOrganizationAccessContext } from '../organization/access'
import { reportingFail } from './types'
import type { ReportingPrincipal } from './authorization'

const hidden = (): never => reportingFail('REPORT_NOT_FOUND', 'reporting resource not found', 404)

/**
 * Series is a reporting workspace resource, not content authority by itself.
 * Platform role alone never grants access; current Organization evidence is required.
 */
export const assertOrganizationReportingWorkspaceAccess = async (input: {
  principal: ReportingPrincipal
  organizationId: string
}): Promise<void> => {
  const context = await resolveOrganizationAccessContext({ principal: input.principal, organizationId: input.organizationId })
  if (!context || context.membershipId === null) return hidden()
  if (
    context.explicitDenies.includes('*')
    || context.explicitDenies.includes('REPORT_READ')
    || context.explicitDenies.includes('ORG_GROUP_REPORT_V1')
  ) return hidden()
  if (context.organizationStatus !== 'ACTIVE') reportingFail('ORGANIZATION_SUSPENDED', 'organization is suspended', 409)
  if (context.orgRole === 'ORG_ADMIN' || context.capabilities.includes('PSYCHOLOGY_STAFF')) return
  if (context.personas.includes('TEACHER') || context.personas.includes('COUNSELOR')) return
  hidden()
}
