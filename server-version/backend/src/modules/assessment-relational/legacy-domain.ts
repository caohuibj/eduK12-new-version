import { prisma } from '../../config/database'
import { relationalFail } from './errors'

/** Legacy Course product routes must never operate on Organization Run assignments. */
export const assertLegacyRelationalAssignmentDomain = async (assignmentId: string): Promise<void> => {
  const rows = await prisma.$queryRaw<Array<{ policyDomain: string }>>`
    SELECT "policy_domain" AS "policyDomain"
    FROM "relational_assessment_assignments"
    WHERE "id" = ${assignmentId}
    LIMIT 1
  `
  const row = rows[0]
  if (!row) relationalFail('RELATIONAL_ASSIGNMENT_NOT_FOUND', 'assignment not found')
  if (row.policyDomain !== 'LEGACY_COURSE') {
    relationalFail('RELATIONAL_POLICY_DOMAIN', 'Organization Run assignments must use the Run execution surface')
  }
}
