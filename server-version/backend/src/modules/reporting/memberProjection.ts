import { Prisma } from '@prisma/client'
import { prisma } from '../../config/database'
import { resolveOrganizationAccessContext } from '../organization/access'
import { readReportingArtifactRecord } from './artifact'
import type { ReportingPrincipal } from './authorization'
import { readReportingCohort } from './cohort'
import { readOrganizationReportingArtifact } from './pr4Service'
import { resolveAuthoritativeRunResults } from './resultSource'
import { getPublishedReportingSpec } from './spec'
import { finiteReportingNumber } from './statistics'
import { reportingFail } from './types'

/** Per-member content authority is independent of an export grant and of
 * aggregate-management authority. Every selected member must be in the current
 * teacher class/counselor relationship (or be the viewer's own SELF record). */
export const readOrganizationMemberProjection = async (input: {
  principal: ReportingPrincipal; organizationId: string; artifactId: string
}) => {
  await readOrganizationReportingArtifact(input)
  const artifact = await readReportingArtifactRecord(input.artifactId)
  if (artifact.analysisKind !== 'GROUP') return reportingFail('EXPORT_NOT_ALLOWED', 'member projection is not enabled for this report kind', 403)
  const context = await resolveOrganizationAccessContext(input)
  if (!context?.membershipId || context.organizationStatus !== 'ACTIVE'
    || context.explicitDenies.some((deny) => ['*', 'REPORT_READ', 'REPORT_MEMBER_READ'].includes(deny))) {
    return reportingFail('EXPORT_NOT_ALLOWED', 'member report access denied', 403)
  }
  const cohort = await readReportingCohort(artifact.cohortSnapshotId)
  const users = [...new Set(cohort.members.map((member) => member.userId))]
  const allowed = await prisma.$queryRaw<Array<{ userId: string }>>`
    SELECT m.user_id AS "userId" FROM organization_memberships m
    WHERE m.organization_id=${input.organizationId} AND m.valid_until IS NULL
      AND m.user_id IN (${Prisma.join(users)}) AND (
        m.user_id=${input.principal.userId}
        OR (${context.personas.includes('TEACHER')} AND EXISTS (
          SELECT 1 FROM organization_staff_class_assignments staff
          JOIN organization_student_class_assignments student ON student.organization_id=staff.organization_id
            AND student.class_unit_id=staff.class_unit_id AND student.valid_until IS NULL
          JOIN organization_persona_grants persona ON persona.organization_id=m.organization_id
            AND persona.membership_id=m.id AND persona.persona='STUDENT' AND persona.revoked_at IS NULL
          WHERE staff.organization_id=m.organization_id AND staff.membership_id=${context.membershipId}
            AND staff.valid_until IS NULL AND student.membership_id=m.id
        ))
        OR (${context.personas.includes('COUNSELOR')} AND EXISTS (
          SELECT 1 FROM organization_counselor_client_relationships relation
          JOIN organization_persona_grants persona ON persona.organization_id=m.organization_id
            AND persona.membership_id=m.id AND persona.persona='CLIENT' AND persona.revoked_at IS NULL
          WHERE relation.organization_id=m.organization_id AND relation.counselor_membership_id=${context.membershipId}
            AND relation.client_membership_id=m.id AND relation.valid_until IS NULL
        ))
      )
  `
  if (new Set(allowed.map((row) => row.userId)).size !== users.length) {
    return reportingFail('EXPORT_NOT_ALLOWED', 'underlying member report access required for every member', 403)
  }
  const spec = await getPublishedReportingSpec(artifact.specId)
  if (spec.definition.analysisKind !== 'GROUP') return reportingFail('EXPORT_NOT_ALLOWED', 'member spec mismatch', 403)
  const batch = await resolveAuthoritativeRunResults(cohort)
  const hashes = new Map(batch.resolved.map((row) => [row.executionId, row.canonicalResultHash]))
  if (artifact.artifactPayload.inputManifest.some((row) => hashes.get(row.executionId) !== row.canonicalResultHash)) {
    return reportingFail('REPORT_ARTIFACT_INTEGRITY', 'member source no longer matches frozen report inputs', 409)
  }
  const frozenIds = new Set(artifact.artifactPayload.inputManifest.map((row) => row.executionId))
  const projection = artifact.artifactPayload.projection
  const rows = batch.resolved.filter((row) => frozenIds.has(row.executionId)).map((row) => {
    const metrics: Record<string, number> = {}
    if (projection.state === 'present') for (const rule of spec.definition.metricRules) {
      if (projection.metrics?.[rule.metricId]?.state !== 'present') continue
      const metric = row.metrics.find((value) => value.key === rule.sourceMetricKey)
      if (!metric || !rule.acceptedResultQuality.includes(metric.resultQuality)) continue
      if (rule.acceptedMetricQuality !== 'IGNORE_METRIC_QUALITY'
        && (!metric.metricQuality || !rule.acceptedMetricQuality.includes(metric.metricQuality))) continue
      const value = finiteReportingNumber(metric.value)
      if (value !== null) metrics[rule.metricId] = value
    }
    return { userId: row.subjectUserId, membershipId: row.membershipId, metrics }
  })
  // Suppressed reports never become identity-bearing member lists via export.
  if (projection.state !== 'present') return { state: 'suppressed' as const }
  return { state: 'present' as const, members: rows }
}
