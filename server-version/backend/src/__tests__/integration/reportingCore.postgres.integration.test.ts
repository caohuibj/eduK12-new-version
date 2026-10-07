import { independentReviewer } from './independent-reviewer'
import { randomUUID } from 'node:crypto'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { ParentRelationshipStatus, PlatformRole, PrismaClient, UserRole } from '@prisma/client'
import { integrationDatabaseUrl } from './integration-env'
import {
  createMembership,
  createOrganization,
  denyOrganizationAccess,
  endMembership,
  grantPersona,
  resumeOrganization,
  suspendOrganization,
} from '../../modules/organization/service'
import {
  assignOrganizationLabel,
  createClassificationDimension,
  createOrganizationLabel,
  endOrganizationLabelAssignment,
} from '../../modules/organization/classificationRelations'
import { hasCurrentParentOrganizationEvidence } from '../../modules/organization/parentEvidence'
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
import { generateOrganizationGroupAnalysis, readOrganizationGroupArtifact } from '../../modules/reporting/service'
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

async function createUser(
  label: string,
  platformRole: PlatformRole = PlatformRole.STANDARD,
  role: UserRole = UserRole.STUDENT,
) {
  return db.user.create({
    data: {
      username: `reporting-${label}-${suffix}-${randomUUID().slice(0, 8)}`,
      passwordHash: 'test-only',
      role,
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

async function publishLabelSelfRun(organizationId: string, ownerId: string, labelId: string, name: string) {
  const run = await createAssessmentRunDraft({ organizationId, name, createdByUserId: ownerId })
  const selector = { kind: 'LABELS' as const, labelIds: [labelId], match: 'ANY' as const }
  await addAssessmentRunTrackDraft({
    organizationId,
    runId: run.id,
    resource: { family: 'BUNDLE', key: `reporting-${name}`, version: '1.0.0' },
    subjectSelector: selector,
    respondentSelector: selector,
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

const createStartBarrier = (participants: number) => {
  let ready = 0
  let resolveReady!: () => void
  let release!: () => void
  const allReady = new Promise<void>((resolve) => { resolveReady = resolve })
  const released = new Promise<void>((resolve) => { release = resolve })
  return {
    arrive: async () => {
      ready += 1
      if (ready === participants) resolveReady()
      await released
    },
    waitUntilReady: () => allReady,
    release: () => release(),
  }
}

suite('PR3 reporting core release gate (real PostgreSQL)', () => {
  beforeAll(async () => {
    db = new PrismaClient({ datasources: { db: { url: DB_URL! } } })
    await db.$connect()
  })
  afterAll(async () => db.$disconnect())

  it('closes governed spec, frozen cohort, concurrency and authorization contracts', async () => {
    const admin = await createUser('admin', PlatformRole.SYSTEM_ADMIN, UserRole.ADMIN)
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

    const dimension = await createClassificationDimension({
      organizationId: org.organization.id,
      key: `reporting-label-${suffix}`,
      name: 'Reporting cohort label',
      cardinality: 'MULTI',
    })
    const label = await createOrganizationLabel({
      organizationId: org.organization.id,
      dimensionId: dimension.id,
      name: `pilot-${suffix}`,
    })
    const originalAssignments = [] as Array<{ id: string }>
    for (const membership of memberships.slice(0, 3)) {
      originalAssignments.push(await assignOrganizationLabel({
        organizationId: org.organization.id,
        membershipId: membership.id,
        labelId: label.id,
      }))
    }
    const labelSource = await publishLabelSelfRun(org.organization.id, admin.id, label.id, 'label-run')
    await endOrganizationLabelAssignment({ organizationId: org.organization.id, assignmentId: originalAssignments[0].id })
    await assignOrganizationLabel({ organizationId: org.organization.id, membershipId: memberships[3].id, labelId: label.id })
    const labelCohort = await freezeRunTrackCohort({
      organizationId: org.organization.id,
      runId: labelSource.runId,
      trackId: labelSource.trackId,
      generatedByUserId: admin.id,
    })
    expect(labelCohort.members.map((member) => member.membershipId).sort())
      .toEqual(memberships.slice(0, 3).map((membership) => membership.id).sort())

    const specKey = `generic-${suffix}`
    const draft = await createPlatformReportingSpec({
      actor: { userId: admin.id, platformRole: 'SYSTEM_ADMIN' },
      specKey,
      version: 1,
      definition: specDefinition,
    })
    await expect(createPlatformReportingSpec({
      actor: { userId: admin.id, platformRole: 'SYSTEM_ADMIN' },
      specKey,
      version: 1,
      definition: specDefinition,
    })).rejects.toMatchObject({ code: 'REPORT_SPEC_VERSION_CONFLICT', statusCode: 409 })
    await expect(reviewPlatformReportingSpec({ actor: { userId: admin.id, platformRole: 'SYSTEM_ADMIN' }, specId: draft.id })).rejects.toMatchObject({ code: 'REPORT_SPEC_INDEPENDENT_REVIEW_REQUIRED', statusCode: 403 })
    const reviewed = await reviewPlatformReportingSpec({ actor: await independentReviewer({ userId: admin.id, platformRole: 'SYSTEM_ADMIN' }), specId: draft.id })
    expect(reviewed.status).toBe('REVIEWED')
    expect(reviewed.reviewedByUserId).not.toBe(admin.id)
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

    const participantCount = 8
    const barrier = createStartBarrier(participantCount)
    const writes = Array.from({ length: participantCount }, (_, index) => (async () => {
      const generatedAt = new Date(Date.UTC(2026, 0, 3, 0, 0, index))
      const built = buildReportingArtifact({
        artifactId: randomUUID(),
        generatedByUserId: admin.id,
        generatedAt: generatedAt.toISOString(),
        spec: published,
        cohort: cohortA,
        batch: resultBatch,
      })
      await barrier.arrive()
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
    })())
    await barrier.waitUntilReady()
    barrier.release()
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
    expect(beforeDeny).not.toHaveProperty('analysisIdentityHash')
    await expect(readOrganizationGroupArtifact({
      principal: { userId: admin.id, platformRole: 'SYSTEM_ADMIN' },
      organizationId: randomUUID(),
      artifactId: artifacts[0].id,
    })).rejects.toMatchObject({ code: 'REPORT_ARTIFACT_NOT_FOUND', statusCode: 404 })

    const parent = await createUser('parent', PlatformRole.STANDARD, UserRole.PARENT)
    const parentRelationship = await db.parentStudentRelationship.create({
      data: {
        parentUserId: parent.id,
        studentUserId: students[0].id,
        status: ParentRelationshipStatus.ACTIVE,
        approvedByUserId: admin.id,
        approvedAt: new Date(),
      },
    })
    await expect(hasCurrentParentOrganizationEvidence({
      parentUserId: parent.id,
      studentUserId: students[0].id,
      organizationId: org.organization.id,
    })).resolves.toBe(true)
    await expect(readOrganizationGroupArtifact({
      principal: { userId: parent.id, platformRole: 'STANDARD' },
      organizationId: org.organization.id,
      artifactId: artifacts[0].id,
    })).rejects.toMatchObject({ code: 'REPORT_ARTIFACT_NOT_FOUND', statusCode: 404 })
    await endMembership({
      organizationId: org.organization.id,
      membershipId: memberships[0].id,
      reason: 'historical parent boundary',
      meta: { actorUserId: admin.id, commandKey: key('end-child') },
    })
    await expect(hasCurrentParentOrganizationEvidence({
      parentUserId: parent.id,
      studentUserId: students[0].id,
      organizationId: org.organization.id,
    })).resolves.toBe(false)
    await db.parentStudentRelationship.update({
      where: { id: parentRelationship.id },
      data: {
        status: ParentRelationshipStatus.REVOKED,
        revokedByUserId: admin.id,
        revokedAt: new Date(),
        revokeReason: 'reporting historical authorization regression',
      },
    })
    await expect(readOrganizationGroupArtifact({
      principal: { userId: parent.id, platformRole: 'STANDARD' },
      organizationId: org.organization.id,
      artifactId: artifacts[0].id,
    })).rejects.toMatchObject({ code: 'REPORT_ARTIFACT_NOT_FOUND', statusCode: 404 })

    await suspendOrganization({
      organizationId: org.organization.id,
      meta: { actorUserId: admin.id, commandKey: key('suspend') },
    })
    const suspendedHistoricalRead = await readOrganizationGroupArtifact({
      principal: { userId: admin.id, platformRole: 'SYSTEM_ADMIN' },
      organizationId: org.organization.id,
      artifactId: artifacts[0].id,
    })
    expect(suspendedHistoricalRead.artifactId).toBe(artifacts[0].id)
    await expect(generateOrganizationGroupAnalysis({
      principal: { userId: admin.id, platformRole: 'SYSTEM_ADMIN' },
      organizationId: org.organization.id,
      runId: sourceA.runId,
      trackId: sourceA.trackId,
      specId: published.id,
    })).rejects.toMatchObject({ code: 'ORGANIZATION_SUSPENDED', statusCode: 409 })
    await resumeOrganization({
      organizationId: org.organization.id,
      meta: { actorUserId: admin.id, commandKey: key('resume') },
    })

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
  }, 30_000)
})
