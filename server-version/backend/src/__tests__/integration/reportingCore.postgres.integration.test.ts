import { randomUUID } from 'node:crypto'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { PlatformRole, PrismaClient, UserRole } from '@prisma/client'
import { integrationDatabaseUrl } from './integration-env'
import {
  createMembership,
  createOrganization,
  denyOrganizationAccess,
  grantPersona,
} from '../../modules/organization/service'
import { addAssessmentRunTrackDraft, createAssessmentRunDraft } from '../../modules/assessment-run/repository'
import { publishAssessmentRun } from '../../modules/assessment-run/publish'
import { RunResourceAuthorityRegistry, type RunResourceAuthorityAdapter } from '../../modules/assessment-run/resourceAuthority'
import { canonicalHash } from '../../modules/assessment-runtime/canonical'
import {
  createPlatformReportingSpec,
  publishPlatformReportingSpec,
  reviewPlatformReportingSpec,
} from '../../modules/reporting/spec'
import { freezeRunTrackCohort } from '../../modules/reporting/cohort'
import { buildReportingArtifact } from '../../modules/reporting/engine'
import { createOrReuseReportingArtifact } from '../../modules/reporting/artifact'
import { readOrganizationGroupArtifact } from '../../modules/reporting/service'
import type { ReportingAnalysisSpecDefinitionV1, ReportingResultBatchV1 } from '../../modules/reporting/types'

const DB_URL = integrationDatabaseUrl(
  'RELEASE_INTEGRATION_DATABASE_URL',
  'PR26_INTEGRATION_DATABASE_URL',
  'COGNITIVE_INTEGRATION_DB_URL',
)
const suite = DB_URL ? describe : describe.skip
let db: PrismaClient
const suffix = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`
const key = (label: string) => `reporting-core-${label}-${suffix}-${randomUUID()}`

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
      runtimeLaunchTarget: { kind: 'COMPOSITE', ref: 'reporting-test-composite' },
    }
  },
}
const resourceRegistry = new RunResourceAuthorityRegistry([resourceAdapter])

const specDefinition: ReportingAnalysisSpecDefinitionV1 = {
  schemaVersion: 1,
  analysisKind: 'GROUP',
  engineKey: 'ORG_GROUP_V1',
  engineVersion: '1.0.0',
  privacyUnit: 'SUBJECT',
  selectionPolicy: 'UNIQUE_OR_REJECT',
  minimumCohortN: 3,
  minimumContributorN: 3,
  reportEvidenceCeiling: 'RESEARCH_READY',
  metricRules: [{
    metricId: 'score',
    sourceMetricKey: 'score',
    acceptedResultQuality: ['interpretable'],
    acceptedMetricQuality: 'IGNORE_METRIC_QUALITY',
    aggregations: ['MEAN', 'MEDIAN'],
    missingnessRule: 'EXCLUDE',
    minimumMetricN: 3,
    observationUnit: 'SUBJECT',
    selectionPolicy: 'UNIQUE_OR_REJECT',
  }],
}

async function createUser(label: string, platformRole: PlatformRole = PlatformRole.STANDARD) {
  return db.user.create({
    data: {
      username: `reporting-${label}-${suffix}-${randomUUID().slice(0, 8)}`,
      passwordHash: 'test-only',
      role: UserRole.STUDENT,
      platformRole,
    },
    select: { id: true },
  })
}

async function publishSelfRun(organizationId: string, ownerId: string, membershipIds: string[], label: string) {
  const run = await createAssessmentRunDraft({ organizationId, name: label, createdByUserId: ownerId })
  await addAssessmentRunTrackDraft({
    organizationId,
    runId: run.id,
    resource: { family: 'BUNDLE', key: `reporting-${label}`, version: '1.0.0' },
    subjectSelector: { kind: 'MEMBERSHIP_IDS', membershipIds },
    respondentSelector: { kind: 'MEMBERSHIP_IDS', membershipIds },
    requestedPolicy,
  })
  await publishAssessmentRun({
    organizationId,
    runId: run.id,
    actorUserId: ownerId,
    expectedVersion: 2,
    resourceRegistry,
  })
  const tracks = await db.$queryRawUnsafe<Array<{ id: string }>>(
    `SELECT id FROM assessment_run_tracks WHERE run_id=$1 ORDER BY created_at LIMIT 1`,
    run.id,
  )
  return { runId: run.id, trackId: tracks[0].id }
}

suite('PR3 reporting core release gate (real PostgreSQL)', () => {
  beforeAll(async () => {
    db = new PrismaClient({ datasources: { db: { url: DB_URL! } } })
    await db.$connect()
  })
  afterAll(async () => db.$disconnect())

  it('freezes exact membership cohorts, makes governed records immutable, reuses one concurrent artifact, and reauthorizes cached reads', async () => {
    const admin = await createUser('admin', PlatformRole.SYSTEM_ADMIN)
    const students = await Promise.all(Array.from({ length: 4 }, (_, index) => createUser(`student-${index}`)))
    const org = await createOrganization({
      name: `reporting core ${suffix}`,
      meta: { actorUserId: admin.id, commandKey: key('org') },
    })
    const memberships = [] as Array<{ id: string }>
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

    const sourceA = await publishSelfRun(org.organization.id, admin.id, memberships.slice(0, 3).map((row) => row.id), 'run-a')
    const sourceB = await publishSelfRun(org.organization.id, admin.id, [memberships[0].id, memberships[1].id, memberships[3].id], 'run-b')
    const cohortA = await freezeRunTrackCohort({
      organizationId: org.organization.id,
      runId: sourceA.runId,
      trackId: sourceA.trackId,
      generatedByUserId: admin.id,
    })
    const cohortB = await freezeRunTrackCohort({
      organizationId: org.organization.id,
      runId: sourceB.runId,
      trackId: sourceB.trackId,
      generatedByUserId: admin.id,
    })
    expect(cohortA.eligibleN).toBe(3)
    expect(cohortB.eligibleN).toBe(3)
    expect(cohortA.cohortIdentityHash).not.toBe(cohortB.cohortIdentityHash)
    expect(cohortA.members.map((member) => member.membershipId).sort())
      .not.toEqual(cohortB.members.map((member) => member.membershipId).sort())
    await expect(db.$executeRawUnsafe(
      `UPDATE reporting_cohort_snapshots SET eligible_n=eligible_n+1 WHERE id=$1`,
      cohortA.id,
    )).rejects.toThrow()
    await expect(db.$executeRawUnsafe(
      `DELETE FROM reporting_cohort_snapshots WHERE id=$1`,
      cohortA.id,
    )).rejects.toThrow()

    const draft = await createPlatformReportingSpec({
      actor: { userId: admin.id, platformRole: 'SYSTEM_ADMIN' },
      specKey: `generic-${suffix}`,
      version: 1,
      definition: specDefinition,
    })
    const reviewed = await reviewPlatformReportingSpec({ actor: { userId: admin.id, platformRole: 'SYSTEM_ADMIN' }, specId: draft.id })
    expect(reviewed.status).toBe('REVIEWED')
    await expect(db.$executeRawUnsafe(
      `UPDATE reporting_analysis_specs SET definition='{}'::jsonb, spec_hash=$2 WHERE id=$1`,
      draft.id,
      canonicalHash({}),
    )).rejects.toThrow()
    const published = await publishPlatformReportingSpec({ actor: { userId: admin.id, platformRole: 'SYSTEM_ADMIN' }, specId: draft.id })
    await expect(db.$executeRawUnsafe(
      `UPDATE reporting_analysis_specs SET definition='{}'::jsonb WHERE id=$1`,
      published.id,
    )).rejects.toThrow()

    const resolved = cohortA.members.map((member, index) => ({
      executionId: member.executionId,
      subjectUserId: member.userId,
      membershipId: member.membershipId,
      trackId: sourceA.trackId,
      canonicalResultHash: canonicalHash({ member: member.userId, index }),
      metrics: [{ key: 'score', value: index + 1, resultQuality: 'interpretable' as const, metricQuality: null }],
      scientificMaturity: 'PILOT' as const,
      provenanceState: 'FROZEN' as const,
      scientificProvenanceHash: canonicalHash({ provenance: member.executionId }),
    }))
    const resultBatch: ReportingResultBatchV1 = {
      resourceFamily: 'BUNDLE',
      resourceKey: 'reporting-run-a',
      resourceVersion: '1.0.0',
      resourceMinimumN: null,
      resolved,
      unresolved: [],
    }

    const writes = Array.from({ length: 8 }, (_, index) => {
      const generatedAt = new Date(Date.UTC(2026, 0, 3, 0, 0, index))
      const built = buildReportingArtifact({
        artifactId: randomUUID(),
        generatedByUserId: admin.id,
        generatedAt: generatedAt.toISOString(),
        spec: published,
        cohort: cohortA,
        batch: resultBatch,
      })
      return createOrReuseReportingArtifact({
        organizationId: org.organization.id,
        cohortSnapshotId: cohortA.id,
        specId: published.id,
        analysisIdentityHash: built.analysisIdentityHash,
        artifactPayload: built.payload,
        snapshotHash: built.snapshotHash,
        generatedByUserId: admin.id,
        generatedAt,
      })
    })
    const artifacts = await Promise.all(writes)
    expect(new Set(artifacts.map((artifact) => artifact.id)).size).toBe(1)
    const persisted = await db.$queryRawUnsafe<Array<{ count: number }>>(
      `SELECT COUNT(*)::int count FROM reporting_analysis_artifacts WHERE analysis_identity_hash=$1`,
      artifacts[0].analysisIdentityHash,
    )
    expect(persisted[0].count).toBe(1)
    await expect(db.$executeRawUnsafe(
      `UPDATE reporting_analysis_artifacts SET generated_at=generated_at+INTERVAL '1 second' WHERE id=$1`,
      artifacts[0].id,
    )).rejects.toThrow()
    await expect(db.$executeRawUnsafe(
      `DELETE FROM reporting_analysis_artifacts WHERE id=$1`,
      artifacts[0].id,
    )).rejects.toThrow()

    const beforeDeny = await readOrganizationGroupArtifact({
      principal: { userId: admin.id, platformRole: 'SYSTEM_ADMIN' },
      organizationId: org.organization.id,
      artifactId: artifacts[0].id,
    })
    expect(beforeDeny.projection.state).toBe('present')
    expect(beforeDeny).not.toHaveProperty('inputManifest')
    expect(beforeDeny).not.toHaveProperty('snapshotHash')

    await denyOrganizationAccess({
      organizationId: org.organization.id,
      userId: admin.id,
      permission: 'REPORT_READ',
      reason: 'reporting reauthorization regression',
      meta: { actorUserId: admin.id, commandKey: key('deny-report-read') },
    })
    await expect(readOrganizationGroupArtifact({
      principal: { userId: admin.id, platformRole: 'SYSTEM_ADMIN' },
      organizationId: org.organization.id,
      artifactId: artifacts[0].id,
    })).rejects.toMatchObject({ code: 'REPORT_ARTIFACT_NOT_FOUND', statusCode: 404 })
  })
})
