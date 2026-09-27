import { randomUUID } from 'node:crypto'
import { afterAll, describe, expect, it } from 'vitest'
import { UserRole } from '@prisma/client'
import { prisma } from '../../config/database'
import { integrationDatabaseUrl } from './integration-env'
import { buildReportingFixture } from './reporting-fixture'
import { createMembership, grantPersona, grantCapability, revokeCapability } from '../../modules/organization/service'
import { createOrganizationUnit } from '../../modules/organization/structure'
import { assignStaffToClass, assignStudentToClass, endStaffClassAssignment } from '../../modules/organization/classRelationships'
import { createPlatformReportingSpec, publishPlatformReportingSpec, reviewPlatformReportingSpec } from '../../modules/reporting/spec'
import { generateOrganizationGroupAnalysis } from '../../modules/reporting/service'
import { generateOrganizationLongitudinalAnalysis, readOrganizationReportingArtifact } from '../../modules/reporting/pr4Service'
import { readReportingArtifactRecord } from '../../modules/reporting/artifact'
import { createReportingExport, downloadReportingExport } from '../../modules/reporting/export'
import { freezeRunTrackCohort } from '../../modules/reporting/cohort'
import { resolveAuthoritativeRunResults } from '../../modules/reporting/resultSource'
import { createReportingSeries, bindReportingSeriesWave } from '../../modules/reporting/series'

const url = integrationDatabaseUrl('RELEASE_INTEGRATION_DATABASE_URL')
if (!url) throw new Error('Reporting subgroup privacy requires an isolated PostgreSQL database')
afterAll(() => prisma.$disconnect())
const meta = (userId: string) => ({ actorUserId: userId, commandKey: randomUUID() })

const fixture = async (population: number) => {
  const f = await buildReportingFixture(prisma, population)
  const organizationId = f.organizationId
  const membership = await createMembership({ organizationId, userId: f.ownerId, meta: meta(f.ownerId) })
  await grantPersona({ organizationId, membershipId: membership.id, persona: 'TEACHER', meta: meta(f.ownerId) })
  for (const member of f.members) await grantPersona({ organizationId, membershipId: member.membershipId, persona: 'STUDENT', meta: meta(f.ownerId) })
  const grade = await createOrganizationUnit({ organizationId, unitKind: 'GRADE', name: 'Privacy grade' })
  const cls = await createOrganizationUnit({ organizationId, unitKind: 'CLASS', name: 'Privacy class', parentUnitId: grade.id })
  for (const member of f.members) await assignStudentToClass({ organizationId, membershipId: member.membershipId, classUnitId: cls.id })
  const staff = await assignStaffToClass({ organizationId, membershipId: membership.id, classUnitId: cls.id, staffRole: 'TEACHING' })
  const admin = await prisma.user.create({ data: {
    username: `privacy-admin-${randomUUID()}`, passwordHash: 'test-only', role: UserRole.ADMIN, platformRole: 'SYSTEM_ADMIN',
  } })
  const actor = { userId: admin.id, platformRole: 'SYSTEM_ADMIN' as const }
  const publishSpec = async (
    kind: 'GROUP' | 'REPEATED_COHORT' = 'GROUP',
    resource?: { family: 'BUNDLE' | 'SCALE' | 'COGNITIVE' | 'SITUATIONAL'; key: string },
  ) => {
    const longitudinalIdentity = kind === 'REPEATED_COHORT'
      ? {
          sourceFamily: resource?.family ?? 'BUNDLE',
          sourceResourceKey: resource?.key ?? 'privacy-fixture',
          valueType: 'NUMBER' as const,
          longitudinalMetricKey: 'score',
        }
      : {}
    const spec = await createPlatformReportingSpec({ actor, specKey: `privacy-${randomUUID()}`, version: 1, definition: {
      schemaVersion: 1, analysisKind: kind, engineKey: kind === 'GROUP' ? 'ORG_GROUP_V1' : 'ORG_REPEATED_COHORT_V1', engineVersion: '1.0.0', privacyUnit: 'SUBJECT',
      selectionPolicy: 'UNIQUE_OR_REJECT', minimumCohortN: 3, minimumContributorN: 3, reportEvidenceCeiling: 'PILOT',
      ...(kind === 'REPEATED_COHORT' ? { comparabilityRules: [] } : {}),
      metricRules: [{ metricId: 'score', sourceMetricKey: 'score', acceptedResultQuality: ['interpretable'], acceptedMetricQuality: 'IGNORE_METRIC_QUALITY',
        aggregations: ['MEAN'], missingnessRule: 'EXCLUDE', minimumMetricN: 3, observationUnit: 'SUBJECT', selectionPolicy: 'UNIQUE_OR_REJECT',
        ...longitudinalIdentity }],
    } })
    await reviewPlatformReportingSpec({ actor, specId: spec.id })
    await publishPlatformReportingSpec({ actor, specId: spec.id })
    return spec
  }
  const spec = await publishSpec()
  const principal = { userId: f.ownerId, platformRole: 'STANDARD' as const }
  const base = { principal, organizationId, runId: f.runId, trackId: f.trackId, specId: spec.id }
  const selector = (indexes: number[]) => ({
    schemaVersion: 2 as const, combine: 'ALL' as const,
    clauses: [{ kind: 'MEMBERSHIP_IDS' as const, membershipIds: indexes.map((i) => f.members[i].membershipId) }],
  })
  const artifactCount = async () => (await prisma.$queryRaw<Array<{ n: number }>>`
    SELECT COUNT(*)::int AS n FROM reporting_analysis_artifacts WHERE organization_id=${organizationId}
  `)[0].n
  return { f, base, membership, staff, selector, publishSpec, artifactCount }
}

describe('fixed-population aggregate disclosure (real PostgreSQL)', () => {
  it('preserves complete own-Run access and trusted subgroup work without granting ordinary readers that disclosure', async () => {
    const { f, base, membership, staff, selector } = await fixture(7)
    const full = await generateOrganizationGroupAnalysis(base)
    expect(full.projection.state).toBe('present')
    await expect(generateOrganizationGroupAnalysis({ ...base, cohortSelector: selector([0, 1, 2]) })).rejects.toMatchObject({ code: 'REPORT_PRIVACY_GUARD' })

    await grantCapability({ organizationId: base.organizationId, membershipId: membership.id, capability: 'PSYCHOLOGY_STAFF', meta: meta(f.ownerId) })
    await grantCapability({ organizationId: base.organizationId, membershipId: membership.id, capability: 'REPORT_EXPORT', meta: meta(f.ownerId) })
    const subgroup = await generateOrganizationGroupAnalysis({ ...base, cohortSelector: selector([0, 1, 2]) })
    expect(subgroup.projection.state).toBe('present')
    const stored = await readReportingArtifactRecord(subgroup.artifactId)
    const ticket = await createReportingExport({ ...base, target: { kind: 'AGGREGATE', artifactId: subgroup.artifactId } })
    expect((await downloadReportingExport({ ...base, exportId: ticket.exportId })).csv).toContain('score')

    await revokeCapability({ organizationId: base.organizationId, membershipId: membership.id, capability: 'PSYCHOLOGY_STAFF', meta: meta(f.ownerId) })
    await expect(readOrganizationReportingArtifact({ ...base, artifactId: subgroup.artifactId })).rejects.toMatchObject({ code: 'REPORT_PRIVACY_GUARD' })
    await expect(downloadReportingExport({ ...base, exportId: ticket.exportId })).rejects.toMatchObject({ code: 'REPORT_PRIVACY_GUARD' })
    await expect(createReportingExport({ ...base, target: { kind: 'AGGREGATE', artifactId: subgroup.artifactId } })).rejects.toMatchObject({ code: 'REPORT_PRIVACY_GUARD' })
    expect((await readReportingArtifactRecord(subgroup.artifactId)).snapshotHash).toBe(stored.snapshotHash)
    expect((await readOrganizationReportingArtifact({ ...base, artifactId: full.artifactId })).artifactId).toBe(full.artifactId)
    expect((await generateOrganizationGroupAnalysis(base)).artifactId).toBe(full.artifactId)

    await endStaffClassAssignment({ organizationId: base.organizationId, assignmentId: staff.id })
    await expect(generateOrganizationGroupAnalysis({ ...base, cohortSelector: selector([0, 1, 2]) })).rejects.toMatchObject({ statusCode: 404 })
  }, 90_000)

  it('rejects all A/B/C aliases, including different specs, before publication', async () => {
    const { base, selector, publishSpec, artifactCount } = await fixture(10)
    // X={0,1,2}, Y={3,4,5}, Z={6}, Other={7,8,9}. Each pairwise
    // non-empty difference has N=3, yet the three means reconstruct Z.
    const otherSpec = await publishSpec()
    for (const [indexes, specId] of [
      [[0, 1, 2, 6], base.specId], [[3, 4, 5, 6], otherSpec.id], [[0, 1, 2, 3, 4, 5, 6], base.specId],
    ] as const) {
      await expect(generateOrganizationGroupAnalysis({ ...base, specId, cohortSelector: selector([...indexes]) }))
        .rejects.toMatchObject({ code: 'REPORT_PRIVACY_GUARD' })
    }
    expect(await artifactCount()).toBe(0)
  }, 90_000)

  it('has no read-history/publish TOCTOU window under concurrent subgroup requests', async () => {
    const { base, selector, artifactCount } = await fixture(10)
    const results = await Promise.allSettled([
      generateOrganizationGroupAnalysis({ ...base, cohortSelector: selector([0, 1, 2, 6]) }),
      generateOrganizationGroupAnalysis({ ...base, cohortSelector: selector([3, 4, 5, 6]) }),
      generateOrganizationGroupAnalysis({ ...base, cohortSelector: selector([0, 1, 2, 3, 4, 5, 6]) }),
    ])
    expect(results.every((result) => result.status === 'rejected')).toBe(true)
    for (const result of results) if (result.status === 'rejected') expect(result.reason).toMatchObject({ code: 'REPORT_PRIVACY_GUARD' })
    expect(await artifactCount()).toBe(0)
  }, 90_000)

  it('cannot use existing manual Waves to bypass the automatic-planner subgroup check', async () => {
    const { f, base, selector, publishSpec, artifactCount } = await fixture(10)
    const batch = await resolveAuthoritativeRunResults(f.cohort)
    const series = await createReportingSeries({ organizationId: base.organizationId, seriesKey: `privacy-manual-${randomUUID()}`,
      scope: { schemaVersion: 1, resourceFamily: batch.resourceFamily, resourceKey: batch.resourceKey }, createdByUserId: f.ownerId })
    for (const [index, members] of [[0, [0, 1, 2, 6]], [1, [3, 4, 5, 6]]] as const) {
      const selected = await freezeRunTrackCohort({ ...base, generatedByUserId: f.ownerId, cohortSelector: selector([...members]) })
      await bindReportingSeriesWave({ organizationId: base.organizationId, seriesId: series.id, waveKey: `W${index + 1}`, ordinal: index + 1,
        cohortSnapshotId: selected.id, createdByUserId: f.ownerId })
    }
    const spec = await publishSpec('REPEATED_COHORT', { family: batch.resourceFamily, key: batch.resourceKey })
    await expect(generateOrganizationLongitudinalAnalysis({ ...base, seriesId: series.id, waveKeys: ['W1', 'W2'], specId: spec.id, analysisKind: 'REPEATED_COHORT' }))
      .rejects.toMatchObject({ code: 'REPORT_PRIVACY_GUARD' })
    expect(await artifactCount()).toBe(0)
  }, 90_000)

  it('does not release a partial mean that can be differenced against one later completion', async () => {
    const { f, base, artifactCount } = await fixture(7)
    await prisma.$executeRaw`UPDATE assessment_run_executions SET status='STARTED', completed_at=NULL WHERE id=${f.members[6].executionId}`
    await expect(generateOrganizationGroupAnalysis(base)).rejects.toMatchObject({ code: 'REPORT_PRIVACY_GUARD' })
    expect(await artifactCount()).toBe(0)
    await prisma.$executeRaw`UPDATE assessment_run_executions SET status='COMPLETED', completed_at=clock_timestamp() WHERE id=${f.members[6].executionId}`
    expect((await generateOrganizationGroupAnalysis(base)).projection.state).toBe('present')
  }, 90_000)
})
