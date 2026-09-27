import { Prisma } from '@prisma/client'
import { prisma } from '../../config/database'
import { resolveOrganizationAccessContext } from '../organization/access'
import type { ReportingPrincipal } from './authorization'
import { readReportingCohorts } from './cohort'
import { reportingFail, type ReportingCohortSnapshotRecord } from './types'

/**
 * Ordinary aggregate readers must not obtain several different contributor
 * sets for the same frozen source. Arbitrary subgroups and attrition-based
 * matched populations belong to the explicitly trusted aggregate workflow.
 *
 * This is an intrinsic predicate over immutable inputs/output, not an exposure
 * history heuristic. Concurrent publication, another spec or another selector
 * cannot reset it. Stored historical bytes and hashes are never rewritten.
 */
export const fixedPopulationPrivacyFailure = (): never => reportingFail(
  'REPORT_PRIVACY_GUARD',
  '此报告包含子群或不完整贡献者，需要机构管理员或心理专业人员的受信任汇总权限',
  409,
)

export type FixedPopulationArtifact = {
  organizationId: string
  analysisKind: string
  cohortSnapshotId?: string | null
  artifactPayload: {
    projection: unknown
    waveBindings?: Array<{ waveId: string; cohortSnapshotId: string }>
  }
}

type Projection = Record<string, unknown>
const object = (value: unknown): Projection => {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    reportingFail('REPORT_ARTIFACT_INTEGRITY', 'invalid aggregate projection', 500)
  }
  return value as Projection
}

const assertWholeMetricContributors = (projection: Projection, population: number): void => {
  if (projection.state === 'suppressed') return
  if (projection.state !== 'present' || projection.eligibleN !== population) fixedPopulationPrivacyFailure()
  const metrics = object(projection.metrics)
  for (const value of Object.values(metrics)) {
    const metric = object(value)
    if (metric.state === 'suppressed') continue
    if (metric.state !== 'present' || metric.validN !== population || metric.missingN !== 0
      || projection.resultContributorN !== population) fixedPopulationPrivacyFailure()
  }
}

/** Exported pure policy for adversarial tests; it does not grant authority. */
export const assertFixedPopulationProjection = (input: {
  analysisKind: string
  projection: unknown
  cohorts: ReportingCohortSnapshotRecord[]
  waveBindings?: Array<{ waveId: string; cohortSnapshotId: string }>
}): void => {
  const projection = object(input.projection)
  if (!input.cohorts.length) fixedPopulationPrivacyFailure()
  const byId = new Map(input.cohorts.map((cohort) => [cohort.id, cohort]))
  if (input.analysisKind === 'GROUP') {
    if (input.cohorts.length !== 1 || projection.kind !== 'GROUP') fixedPopulationPrivacyFailure()
    assertWholeMetricContributors(projection, input.cohorts[0].eligibleN)
    return
  }
  const bindings = input.waveBindings ?? []
  if (bindings.length < 2 || new Set(bindings.map((binding) => binding.waveId)).size !== bindings.length) {
    fixedPopulationPrivacyFailure()
  }
  const populations = bindings.map((binding) => byId.get(binding.cohortSnapshotId) ?? fixedPopulationPrivacyFailure())
  if (input.analysisKind === 'REPEATED_COHORT') {
    if (projection.kind !== 'REPEATED_COHORT' || !Array.isArray(projection.waves)
      || projection.waves.length !== bindings.length) fixedPopulationPrivacyFailure()
    const byWave = new Map(bindings.map((binding, index) => [binding.waveId, populations[index]]))
    const seen = new Set<string>()
    for (const value of projection.waves as unknown[]) {
      const wave = object(value)
      if (typeof wave.waveId !== 'string' || seen.has(wave.waveId)) fixedPopulationPrivacyFailure()
      seen.add(wave.waveId as string)
      const cohort = byWave.get(wave.waveId as string) ?? fixedPopulationPrivacyFailure()
      assertWholeMetricContributors(wave, cohort.eligibleN)
    }
    return
  }
  if (input.analysisKind !== 'MATCHED_LONGITUDINAL' || projection.kind !== 'MATCHED_LONGITUDINAL') {
    fixedPopulationPrivacyFailure()
  }
  const firstUsers = new Set(populations[0].members.map((member) => member.userId))
  if (firstUsers.size !== populations[0].eligibleN || populations.some((cohort) => (
    cohort.eligibleN !== firstUsers.size || cohort.members.some((member) => !firstUsers.has(member.userId))
  ))) fixedPopulationPrivacyFailure()
  if (projection.state === 'suppressed') return
  if (projection.state !== 'present' || projection.matchedEligibleN !== firstUsers.size) fixedPopulationPrivacyFailure()
  for (const value of Object.values(object(projection.metrics))) {
    const metric = object(value)
    if (metric.state === 'suppressed') continue
    if (metric.state !== 'present' || metric.validCaseN !== firstUsers.size) fixedPopulationPrivacyFailure()
  }
}

export const assertFixedPopulationArtifactDisclosure = async (input: {
  principal: ReportingPrincipal
  artifact: FixedPopulationArtifact
}): Promise<void> => {
  const { artifact } = input
  if (!['GROUP', 'REPEATED_COHORT', 'MATCHED_LONGITUDINAL'].includes(artifact.analysisKind)) return
  // This supplements (never substitutes for) existing Run/read/export authority.
  const context = await resolveOrganizationAccessContext({ principal: input.principal, organizationId: artifact.organizationId })
  if (!context?.membershipId || context.explicitDenies.some((deny) => ['*', 'REPORT_READ', 'ORG_GROUP_REPORT_V1'].includes(deny))) {
    reportingFail('REPORT_ARTIFACT_NOT_FOUND', 'reporting artifact not found', 404)
  }
  if (context.organizationStatus !== 'ACTIVE') {
    // Preserve the existing narrow current-member platform historical read.
    // Generation still refuses suspension before reaching this disclosure gate.
    if (input.principal.platformRole === 'SYSTEM_ADMIN') return
    reportingFail('ORGANIZATION_SUSPENDED', 'organization is suspended', 409)
  }
  if (context.orgRole === 'ORG_ADMIN' || context.capabilities.includes('PSYCHOLOGY_STAFF')) return
  if (!context.personas.some((persona) => persona === 'TEACHER' || persona === 'COUNSELOR')) {
    reportingFail('REPORT_ARTIFACT_NOT_FOUND', 'reporting artifact not found', 404)
  }
  const bindings = artifact.artifactPayload.waveBindings
  const ids = artifact.analysisKind === 'GROUP'
    ? [artifact.cohortSnapshotId ?? fixedPopulationPrivacyFailure()]
    : (bindings ?? []).map((binding) => binding.cohortSnapshotId)
  const cohorts = await readReportingCohorts(ids)
  if (cohorts.some((cohort) => cohort.organizationId !== artifact.organizationId)) fixedPopulationPrivacyFailure()
  const sources = [...new Map(cohorts.map((cohort) => [
    `${cohort.sourceRunId}:${cohort.sourceTrackId}`, cohort,
  ])).values()]
  if (!sources.length) fixedPopulationPrivacyFailure()
  // Header-only coverage; never load/decrypt canonical payloads here. Compare
  // actual execution IDs, not selector spelling or only the population count.
  const rows = await prisma.$queryRaw<Array<{ runId: string; trackId: string; executionId: string; userId: string }>>(Prisma.sql`
    SELECT e.run_id AS "runId", e.track_id AS "trackId", e.id AS "executionId", a.user_id AS "userId"
    FROM assessment_run_executions e
    JOIN assessment_run_actor_snapshots a ON a.organization_id=e.organization_id AND a.run_id=e.run_id AND a.id=e.subject_actor_snapshot_id
    WHERE e.organization_id=${artifact.organizationId}
      AND (${Prisma.join(sources.map((cohort) => Prisma.sql`(e.run_id=${cohort.sourceRunId} AND e.track_id=${cohort.sourceTrackId})`), ' OR ')})
  `)
  const bySource = new Map<string, Map<string, string>>()
  for (const row of rows) {
    const key = `${row.runId}:${row.trackId}`
    const population = bySource.get(key) ?? new Map<string, string>()
    if (population.has(row.executionId)) fixedPopulationPrivacyFailure()
    population.set(row.executionId, row.userId)
    bySource.set(key, population)
  }
  for (const cohort of cohorts) {
    const population = bySource.get(`${cohort.sourceRunId}:${cohort.sourceTrackId}`)
    if (!population || population.size < 3 || cohort.eligibleN !== population.size
      || cohort.members.length !== population.size
      || new Set(cohort.members.map((member) => member.executionId)).size !== population.size
      || new Set(cohort.members.map((member) => member.userId)).size !== population.size
      || cohort.members.some((member) => population.get(member.executionId) !== member.userId)) {
      fixedPopulationPrivacyFailure()
    }
  }
  assertFixedPopulationProjection({ analysisKind: artifact.analysisKind, projection: artifact.artifactPayload.projection, cohorts, waveBindings: bindings })
}
