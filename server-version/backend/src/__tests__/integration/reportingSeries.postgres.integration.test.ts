import { independentReviewer } from './independent-reviewer'
import { randomUUID } from 'node:crypto'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { PlatformRole, PrismaClient, UserRole } from '@prisma/client'
import { integrationDatabaseUrl } from './integration-env'
import { createMembership, createOrganization, grantPersona } from '../../modules/organization/service'
import { addAssessmentRunTrackDraft, createAssessmentRunDraft } from '../../modules/assessment-run/repository'
import { publishAssessmentRun } from '../../modules/assessment-run/publish'
import { RunResourceAuthorityRegistry, type RunResourceAuthorityAdapter } from '../../modules/assessment-run/resourceAuthority'
import { canonicalHash } from '../../modules/assessment-runtime/canonical'
import { freezeRunTrackCohort } from '../../modules/reporting/cohort'
import {
  bindReportingSeriesWave,
  createReportingSeries,
  readReportingSeriesWave,
} from '../../modules/reporting/series'
import { createLongitudinalAnalysisArtifact } from '../../modules/reporting/pr4Artifact'
import {
  createPlatformReportingSpec,
  publishPlatformReportingSpec,
  reviewPlatformReportingSpec,
} from '../../modules/reporting/spec'
import type { ReportingAnalysisSpecRecord, ReportingRepeatedCohortSpecV1 } from '../../modules/reporting/types'

const DB_URL = integrationDatabaseUrl(
  'RELEASE_INTEGRATION_DATABASE_URL',
  'PR26_INTEGRATION_DATABASE_URL',
  'COGNITIVE_INTEGRATION_DB_URL',
)
const suite = DB_URL ? describe : describe.skip
let db: PrismaClient
const suffix = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`
const key = (label: string) => `reporting-series-${label}-${suffix}-${randomUUID()}`
const resourceKey = `longitudinal-${suffix}`

const requestedPolicy = {
  subjectRoles: ['STUDENT'], respondentRoles: ['STUDENT'], relationshipKinds: ['SELF'], perspectives: ['SELF_REPORT'],
  analysisMode: 'INDIVIDUAL_ONLY', visibilityPolicyKey: 'ORG_SELF_V1', minimumRespondents: null,
}
const resourceAdapter: RunResourceAuthorityAdapter = {
  family: 'BUNDLE',
  capabilities: {
    transactionMode: 'TRANSACTIONAL_DB', startMode: 'TRANSACTIONAL', supportsLookupByOperationKey: false,
    supportsSafeCancel: true, finalAuthority: 'CANONICAL_RUNTIME', runtimeBindingKind: 'COMPOSITE', runV1Enabled: true,
  },
  async resolveExact(ref) {
    return {
      family: ref.family, key: ref.key, version: ref.version, scientificMaturity: 'PILOT',
      applicabilityHash: canonicalHash({ ref, applicability: requestedPolicy }),
      ...requestedPolicy,
      runtimeLaunchTarget: { kind: 'COMPOSITE', ref: 'reporting-series-test-composite' },
    }
  },
}
const resourceRegistry = new RunResourceAuthorityRegistry([resourceAdapter])

async function createUser(label: string, platformRole: PlatformRole = PlatformRole.STANDARD, role: UserRole = UserRole.STUDENT) {
  return db.user.create({
    data: {
      username: `series-${label}-${suffix}-${randomUUID().slice(0, 8)}`,
      passwordHash: 'test-only',
      role,
      platformRole,
    },
    select: { id: true },
  })
}

async function publishSelfRun(input: {
  organizationId: string
  ownerId: string
  membershipIds: string[]
  version: string
  label: string
}) {
  const run = await createAssessmentRunDraft({ organizationId: input.organizationId, name: input.label, createdByUserId: input.ownerId })
  await addAssessmentRunTrackDraft({
    organizationId: input.organizationId,
    runId: run.id,
    resource: { family: 'BUNDLE', key: resourceKey, version: input.version },
    subjectSelector: { kind: 'MEMBERSHIP_IDS', membershipIds: input.membershipIds },
    respondentSelector: { kind: 'MEMBERSHIP_IDS', membershipIds: input.membershipIds },
    requestedPolicy,
  })
  await publishAssessmentRun({
    organizationId: input.organizationId,
    runId: run.id,
    actorUserId: input.ownerId,
    expectedVersion: 2,
    resourceRegistry,
  })
  const tracks = await db.$queryRawUnsafe<Array<{ id: string }>>(
    'SELECT id FROM assessment_run_tracks WHERE run_id=$1 ORDER BY created_at LIMIT 1',
    run.id,
  )
  return { runId: run.id, trackId: tracks[0].id }
}

suite('PR4 Reporting Series/Wave gate (real PostgreSQL)', () => {
  beforeAll(async () => {
    db = new PrismaClient({ datasources: { db: { url: DB_URL! } } })
    await db.$connect()
  })
  afterAll(async () => db.$disconnect())

  it('freezes scoped Waves and persists immutable longitudinal artifact bindings', async () => {
    const admin = await createUser('admin', PlatformRole.SYSTEM_ADMIN, UserRole.ADMIN)
    const students = await Promise.all(Array.from({ length: 3 }, (_, index) => createUser(`student-${index}`)))
    const org = await createOrganization({
      name: `Series org ${suffix}`,
      meta: { actorUserId: admin.id, commandKey: key('org') },
    })
    const memberships: Array<{ id: string }> = []
    for (let index = 0; index < students.length; index += 1) {
      const membership = await createMembership({
        organizationId: org.organization.id,
        userId: students[index].id,
        meta: { actorUserId: admin.id, commandKey: key(`member-${index}`) },
      })
      await grantPersona({
        organizationId: org.organization.id,
        membershipId: membership.id,
        persona: 'STUDENT',
        meta: { actorUserId: admin.id, commandKey: key(`persona-${index}`) },
      })
      memberships.push(membership)
    }

    const source1 = await publishSelfRun({ organizationId: org.organization.id, ownerId: admin.id, membershipIds: memberships.map((row) => row.id), version: '1.0.0', label: `Wave one ${suffix}` })
    const cohort1 = await freezeRunTrackCohort({ organizationId: org.organization.id, runId: source1.runId, trackId: source1.trackId, generatedByUserId: admin.id })
    const series = await createReportingSeries({
      organizationId: org.organization.id,
      seriesKey: `wellbeing-${suffix}`,
      scope: { schemaVersion: 1, resourceFamily: 'BUNDLE', resourceKey },
      createdByUserId: admin.id,
    })
    const wave1 = await bindReportingSeriesWave({ organizationId: org.organization.id, seriesId: series.id, waveKey: 'W1', ordinal: 1, cohortSnapshotId: cohort1.id, createdByUserId: admin.id })
    expect(wave1.inputManifest.resource.version).toBe('1.0.0')
    expect(wave1.inputManifest.resolved).toHaveLength(0)
    expect(wave1.inputManifest.unresolved).toHaveLength(3)
    expect((await readReportingSeriesWave({ organizationId: org.organization.id, seriesId: series.id, waveKey: 'W1' })).snapshotHash).toBe(wave1.snapshotHash)

    const retry = await bindReportingSeriesWave({ organizationId: org.organization.id, seriesId: series.id, waveKey: 'W1', ordinal: 1, cohortSnapshotId: cohort1.id, createdByUserId: admin.id })
    expect(retry.id).toBe(wave1.id)
    await expect(db.$executeRawUnsafe('UPDATE reporting_series SET series_key=series_key || $1 WHERE id=$2', '-tampered', series.id)).rejects.toThrow()
    await expect(db.$executeRawUnsafe('DELETE FROM reporting_series_waves WHERE id=$1', wave1.id)).rejects.toThrow()

    const source2 = await publishSelfRun({ organizationId: org.organization.id, ownerId: admin.id, membershipIds: memberships.map((row) => row.id), version: '1.1.0', label: `Wave two ${suffix}` })
    const cohort2 = await freezeRunTrackCohort({ organizationId: org.organization.id, runId: source2.runId, trackId: source2.trackId, generatedByUserId: admin.id })
    const wave2 = await bindReportingSeriesWave({ organizationId: org.organization.id, seriesId: series.id, waveKey: 'W2', ordinal: 2, cohortSnapshotId: cohort2.id, createdByUserId: admin.id })
    expect(wave2.inputManifest.resource.version).toBe('1.1.0')
    expect(wave2.inputIdentityHash).not.toBe(wave1.inputIdentityHash)

    await expect(bindReportingSeriesWave({ organizationId: org.organization.id, seriesId: series.id, waveKey: 'W3', ordinal: 2, cohortSnapshotId: cohort2.id, createdByUserId: admin.id })).rejects.toMatchObject({ code: 'REPORT_WAVE_CONFLICT' })

    const specDraft = await createPlatformReportingSpec({
      actor: { userId: admin.id, platformRole: 'SYSTEM_ADMIN' },
      specKey: `repeated-${suffix}`,
      version: 1,
      definition: {
        schemaVersion: 1,
        analysisKind: 'REPEATED_COHORT',
        engineKey: 'ORG_REPEATED_COHORT_V1',
        engineVersion: '1.0.0',
        privacyUnit: 'SUBJECT',
        selectionPolicy: 'UNIQUE_OR_REJECT',
        minimumCohortN: 3,
        minimumContributorN: 3,
        reportEvidenceCeiling: 'PILOT',
        metricRules: [{
          metricId: 'score', sourceMetricKey: 'score', sourceFamily: 'BUNDLE', sourceResourceKey: resourceKey,
          valueType: 'NUMBER', longitudinalMetricKey: 'score', acceptedResultQuality: ['interpretable'],
          acceptedMetricQuality: 'IGNORE_METRIC_QUALITY', aggregations: ['MEAN'], missingnessRule: 'EXCLUDE',
          minimumMetricN: 3, observationUnit: 'SUBJECT', selectionPolicy: 'UNIQUE_OR_REJECT',
        }],
        comparabilityRules: [],
      },
    })
    await reviewPlatformReportingSpec({ actor: await independentReviewer({ userId: admin.id, platformRole: 'SYSTEM_ADMIN' }), specId: specDraft.id })
    const published = await publishPlatformReportingSpec({ actor: { userId: admin.id, platformRole: 'SYSTEM_ADMIN' }, specId: specDraft.id })
    if (published.definition.analysisKind !== 'REPEATED_COHORT') throw new Error('test spec kind mismatch')
    const repeatedSpec = published as ReportingAnalysisSpecRecord<ReportingRepeatedCohortSpecV1>

    const artifact = await createLongitudinalAnalysisArtifact({
      series,
      waves: [wave1, wave2],
      spec: repeatedSpec,
      generatedByUserId: admin.id,
    })
    expect(artifact.analysisKind).toBe('REPEATED_COHORT')
    expect(artifact.seriesId).toBe(series.id)
    expect(artifact.artifactPayload.waveBindings.map((binding) => binding.waveId)).toEqual([wave1.id, wave2.id])
    const artifactRetry = await createLongitudinalAnalysisArtifact({ series, waves: [wave1, wave2], spec: repeatedSpec, generatedByUserId: admin.id })
    expect(artifactRetry.id).toBe(artifact.id)

    const links = await db.$queryRawUnsafe<Array<{ waveId: string; ordinal: number }>>(
      'SELECT wave_id AS "waveId", ordinal FROM reporting_analysis_artifact_waves WHERE artifact_id=$1 ORDER BY ordinal',
      artifact.id,
    )
    expect(links).toEqual([{ waveId: wave1.id, ordinal: 1 }, { waveId: wave2.id, ordinal: 2 }])
    await expect(db.$executeRawUnsafe('UPDATE reporting_analysis_artifact_waves SET ordinal=3 WHERE artifact_id=$1 AND ordinal=2', artifact.id)).rejects.toThrow()

    await expect(db.$executeRawUnsafe(
      `INSERT INTO reporting_analysis_artifacts
        (id,organization_id,analysis_kind,policy_domain,cohort_snapshot_id,spec_id,analysis_identity_hash,artifact_payload,snapshot_hash,generated_by_user_id)
       VALUES ($1,$2,'GROUP','ORG_GROUP_REPORT_V1',NULL,$3,$4,'{}'::jsonb,$5,$6)`,
      randomUUID(), org.organization.id, published.id, 'a'.repeat(64), 'b'.repeat(64), admin.id,
    )).rejects.toThrow()

    const otherOrg = await createOrganization({ name: `Other Series org ${suffix}`, meta: { actorUserId: admin.id, commandKey: key('other-org') } })
    await expect(bindReportingSeriesWave({ organizationId: otherOrg.organization.id, seriesId: series.id, waveKey: 'X', ordinal: 3, cohortSnapshotId: cohort1.id, createdByUserId: admin.id })).rejects.toMatchObject({ code: 'REPORT_SERIES_SCOPE_MISMATCH', statusCode: 404 })

    const wrongSeries = await createReportingSeries({ organizationId: org.organization.id, seriesKey: `wrong-resource-${suffix}`, scope: { schemaVersion: 1, resourceFamily: 'BUNDLE', resourceKey: `${resourceKey}-other` }, createdByUserId: admin.id })
    await expect(bindReportingSeriesWave({ organizationId: org.organization.id, seriesId: wrongSeries.id, waveKey: 'W1', ordinal: 1, cohortSnapshotId: cohort1.id, createdByUserId: admin.id })).rejects.toMatchObject({ code: 'REPORT_SERIES_RESOURCE_MISMATCH' })
  })
})
