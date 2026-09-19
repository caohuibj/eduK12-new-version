import { randomUUID } from 'node:crypto'
import {
  AssessmentUnitPayloadKind,
  AssessmentUnitTerminalState,
  AssessmentUnitType,
  CompositeAssessmentAttemptStatus,
  CompositeAssessmentStatus,
  InstrumentDeliveryMode,
  RuntimeGeneration,
  UserRole,
  type PrismaClient,
} from '@prisma/client'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { canonicalHash } from '../../modules/assessment-runtime/canonical'
import type { ReportingCohortSnapshotRecord, ReportingResultBatchV1 } from '../../modules/reporting/types'
import { integrationDatabaseUrl } from './integration-env'

/**
 * PR3 / A-08 — real PostgreSQL population query-budget gate.
 *
 * Fixture creation is deliberately bulk-oriented and excluded from observation.
 * The measured operation is only resolveAuthoritativeRunResults().  Growing a
 * cohort from 100 to 500 subjects must not add service-level Prisma calls:
 *   1 raw Run graph read
 *   1 CompositeAssessmentAttempt batch read
 *   1 AssessmentUnitSnapshot batch read
 *
 * This is a logical-call budget (same convention as Work C query-budget tests),
 * not a claim that Prisma emits exactly three PostgreSQL wire round trips.
 */
const DB_URL = integrationDatabaseUrl(
  'RELEASE_INTEGRATION_DATABASE_URL',
  'PR26_INTEGRATION_DATABASE_URL',
  'COGNITIVE_INTEGRATION_DB_URL',
)
const suite = DB_URL ? describe : describe.skip

type ObservedPrismaCall = { model?: string; action: string }
type FixtureMember = {
  userId: string
  membershipId: string
  actorSnapshotId: string
  relationshipSnapshotId: string
  executionId: string
  attemptId: string
}
type PopulationFixture = {
  ownerId: string
  organizationId: string
  runId: string
  trackId: string
  compositeId: string
  members: FixtureMember[]
  cohort: ReportingCohortSnapshotRecord
}

let prisma: PrismaClient
let resolveAuthoritativeRunResults: (cohort: ReportingCohortSnapshotRecord) => Promise<ReportingResultBatchV1>
let encryptUnifiedRuntimePayload: typeof import('../../modules/assessment-runtime/security')['encryptUnifiedRuntimePayload']
let createCanonicalUnitResultEnvelope: typeof import('../../modules/assessment-runtime/unit-result')['createCanonicalUnitResultEnvelope']
let observedPrismaCalls: ObservedPrismaCall[] = []
const fixtures: PopulationFixture[] = []

const countCall = (calls: ObservedPrismaCall[], model: string | undefined, action: string): number => (
  calls.filter((call) => call.model === model && call.action === action).length
)

const observe = async <T>(operation: () => Promise<T>): Promise<{ value: T; calls: ObservedPrismaCall[] }> => {
  observedPrismaCalls = []
  const value = await operation()
  return { value, calls: [...observedPrismaCalls] }
}

const buildFixture = async (population: number): Promise<PopulationFixture> => {
  const prefix = `reporting-qb-${population}-${randomUUID().slice(0, 8)}`
  const ownerId = randomUUID()
  const organizationId = randomUUID()
  const runId = randomUUID()
  const trackId = randomUUID()
  const compositeId = randomUUID()
  const now = new Date('2026-09-19T00:00:00.000Z')
  const members: FixtureMember[] = Array.from({ length: population }, () => ({
    userId: randomUUID(),
    membershipId: randomUUID(),
    actorSnapshotId: randomUUID(),
    relationshipSnapshotId: randomUUID(),
    executionId: randomUUID(),
    attemptId: randomUUID(),
  }))

  await prisma.user.create({
    data: {
      id: ownerId,
      username: `${prefix}-owner`,
      passwordHash: 'query-budget-only',
      role: UserRole.TEACHER,
    },
  })
  await prisma.user.createMany({
    data: members.map((member, index) => ({
      id: member.userId,
      username: `${prefix}-subject-${index}`,
      passwordHash: 'query-budget-only',
      role: UserRole.STUDENT,
    })),
  })
  await prisma.organization.create({
    data: {
      id: organizationId,
      name: `${prefix}-organization`,
      createdByUserId: ownerId,
    },
  })
  await prisma.organizationMembership.createMany({
    data: members.map((member) => ({
      id: member.membershipId,
      organizationId,
      userId: member.userId,
      orgRole: 'MEMBER',
    })),
  })

  const resourcePolicyHash = canonicalHash({ prefix, policy: 'reporting-query-budget' })
  await prisma.$executeRawUnsafe(
    `INSERT INTO assessment_runs
      (id, organization_id, name, status, version, created_by_user_id, published_at)
     VALUES ($1,$2,$3,'PUBLISHED',1,$4,$5)`,
    runId,
    organizationId,
    `${prefix}-run`,
    ownerId,
    now,
  )
  await prisma.$executeRawUnsafe(
    `INSERT INTO assessment_run_tracks
      (id, organization_id, run_id, resource_family, resource_key, resource_version,
       subject_selector, respondent_selector, requested_policy, frozen_resource_policy, resource_policy_hash)
     VALUES ($1,$2,$3,'BUNDLE',$4,'1.0.0','{}'::jsonb,'{}'::jsonb,$5::jsonb,$6::jsonb,$7)`,
    trackId,
    organizationId,
    runId,
    `${prefix}-resource`,
    JSON.stringify({ analysisMode: 'INDIVIDUAL_ONLY' }),
    JSON.stringify({ minimumRespondents: 3 }),
    resourcePolicyHash,
  )

  const graphRows = members.map((member) => ({
    user_id: member.userId,
    membership_id: member.membershipId,
    actor_id: member.actorSnapshotId,
    relationship_id: member.relationshipSnapshotId,
    execution_id: member.executionId,
    attempt_id: member.attemptId,
  }))
  const graphJson = JSON.stringify(graphRows)
  const snapshotHash = canonicalHash({ prefix, kind: 'actor' })
  await prisma.$executeRawUnsafe(
    `INSERT INTO assessment_run_actor_snapshots
      (id, organization_id, run_id, provenance_kind, user_id, membership_id, actor_role,
       external_relationship_ref, snapshot_payload, snapshot_hash)
     SELECT x.actor_id, $1, $2, 'ORG_MEMBER', x.user_id, x.membership_id, 'STUDENT', NULL,
       jsonb_build_object('schemaVersion',1,'userId',x.user_id,'membershipId',x.membership_id,'actorRole','STUDENT'),
       $3
     FROM jsonb_to_recordset($4::jsonb)
       AS x(user_id text, membership_id text, actor_id text, relationship_id text, execution_id text, attempt_id text)`,
    organizationId,
    runId,
    snapshotHash,
    graphJson,
  )
  await prisma.$executeRawUnsafe(
    `INSERT INTO assessment_run_relationship_snapshots
      (id, organization_id, run_id, relationship_kind, relationship_ref,
       subject_actor_snapshot_id, respondent_actor_snapshot_id, snapshot_payload, snapshot_hash)
     SELECT x.relationship_id, $1, $2, 'SELF', NULL, x.actor_id, x.actor_id,
       jsonb_build_object('schemaVersion',1,'relationshipKind','SELF','subjectActorSnapshotId',x.actor_id,'respondentActorSnapshotId',x.actor_id),
       $3
     FROM jsonb_to_recordset($4::jsonb)
       AS x(user_id text, membership_id text, actor_id text, relationship_id text, execution_id text, attempt_id text)`,
    organizationId,
    runId,
    canonicalHash({ prefix, kind: 'relationship' }),
    graphJson,
  )
  const scientificProvenance = {
    schemaVersion: 1,
    resourceFamily: 'BUNDLE',
    resourceKey: `${prefix}-resource`,
    resourceVersion: '1.0.0',
    resourcePolicyHash,
    scientificMaturity: 'PILOT',
  }
  await prisma.$executeRawUnsafe(
    `INSERT INTO assessment_run_executions
      (id, organization_id, run_id, track_id, subject_actor_snapshot_id, respondent_actor_snapshot_id,
       relationship_snapshot_id, status, relational_assignment_id, runtime_binding_kind, runtime_binding_ref,
       started_at, completed_at, scientific_maturity, scientific_provenance, scientific_provenance_hash, scientific_frozen_at)
     SELECT x.execution_id, $1, $2, $3, x.actor_id, x.actor_id, x.relationship_id,
       'COMPLETED', NULL, 'COMPOSITE', x.attempt_id, $4, $4,
       'PILOT', $5::jsonb, $6, $4
     FROM jsonb_to_recordset($7::jsonb)
       AS x(user_id text, membership_id text, actor_id text, relationship_id text, execution_id text, attempt_id text)`,
    organizationId,
    runId,
    trackId,
    now,
    JSON.stringify(scientificProvenance),
    canonicalHash(scientificProvenance),
    graphJson,
  )

  await prisma.compositeAssessment.create({
    data: {
      id: compositeId,
      code: `${prefix}-composite`,
      name: `${prefix}-composite`,
      status: CompositeAssessmentStatus.PUBLISHED,
      createdBy: ownerId,
      publishedAt: now,
    },
  })
  await prisma.compositeAssessmentAttempt.createMany({
    data: members.map((member, index) => ({
      id: member.attemptId,
      compositeAssessmentId: compositeId,
      userId: member.userId,
      participantKey: `${prefix}:subject:${index}`,
      status: CompositeAssessmentAttemptStatus.COMPLETED,
      deliveryMode: InstrumentDeliveryMode.FINAL_ONLY,
      runtimeGeneration: RuntimeGeneration.UNIFIED_V1,
      attemptEpoch: 1,
      progress: 100,
      completedItems: 1,
      completedAt: now,
      subjectUserId: member.userId,
      respondentUserId: member.userId,
      assignmentRef: null,
      consentId: null,
    })),
  })

  const instrumentKey = `${prefix}-instrument`
  const sourceDefinitionHash = canonicalHash({ prefix, definition: 1 })
  const compiledRuntimeHash = canonicalHash({ prefix, runtime: 1 })
  const envelope = createCanonicalUnitResultEnvelope({
    core: {
      schemaVersion: 1,
      unitType: 'SCALE',
      instrumentKey,
      instrumentVersion: '1.0.0',
      sourceDefinitionHash,
      compilerVersion: 'reporting-query-budget-test',
      compiledRuntimeHash,
      scorerKey: 'reporting-query-budget-test',
      scorerVersion: '1.0.0',
      quality: { status: 'interpretable', flags: [] },
      metrics: [{ key: 'score', value: 1, unit: 'score', quality: 'calculated' }],
      facts: [],
      references: [],
      contextHash: null,
      scientificProvenance: { instrumentKey, instrumentVersion: '1.0.0' },
    },
    completedAt: now,
    persistenceProvenance: {
      sourceType: 'ASSESSMENT',
      sourceAttemptId: `${prefix}-source`,
    },
  })
  const encrypted = encryptUnifiedRuntimePayload(envelope)
  await prisma.assessmentUnitSnapshot.createMany({
    data: members.map((member) => ({
      compositeAttemptId: member.attemptId,
      attemptEpoch: 1,
      slotKey: 'scale:reporting-query-budget',
      unitType: AssessmentUnitType.SCALE,
      terminalState: AssessmentUnitTerminalState.COMPLETED,
      payloadKind: AssessmentUnitPayloadKind.UNIT_RESULT,
      sourceType: 'ASSESSMENT',
      sourceAttemptId: `${prefix}-source`,
      sourceDefinitionHash,
      compiledRuntimeHash,
      canonicalResultEncrypted: encrypted,
      completedAt: now,
    })),
  })

  const cohort: ReportingCohortSnapshotRecord = {
    id: randomUUID(),
    organizationId,
    sourceRunId: runId,
    sourceTrackId: trackId,
    selector: { kind: 'RUN_TRACK_SUBJECTS', runId, trackId },
    members: members.map((member) => ({
      userId: member.userId,
      membershipId: member.membershipId,
      actorSnapshotId: member.actorSnapshotId,
      executionId: member.executionId,
    })),
    eligibleN: population,
    cohortIdentityHash: canonicalHash({ prefix, population, identity: 'cohort' }),
    snapshotHash: canonicalHash({ prefix, population, identity: 'snapshot' }),
    generatedByUserId: ownerId,
    generatedAt: now,
  }
  const fixture = { ownerId, organizationId, runId, trackId, compositeId, members, cohort }
  fixtures.push(fixture)
  return fixture
}

const destroyFixture = async (fixture: PopulationFixture): Promise<void> => {
  const attemptIds = fixture.members.map((member) => member.attemptId)
  const userIds = fixture.members.map((member) => member.userId)
  await prisma.assessmentUnitSnapshot.deleteMany({ where: { compositeAttemptId: { in: attemptIds } } })
  await prisma.compositeAssessmentAttempt.deleteMany({ where: { id: { in: attemptIds } } })
  await prisma.compositeAssessment.deleteMany({ where: { id: fixture.compositeId } })
  await prisma.$executeRawUnsafe('DELETE FROM assessment_run_executions WHERE run_id=$1', fixture.runId)
  await prisma.$executeRawUnsafe('DELETE FROM assessment_run_relationship_snapshots WHERE run_id=$1', fixture.runId)
  await prisma.$executeRawUnsafe('DELETE FROM assessment_run_actor_snapshots WHERE run_id=$1', fixture.runId)
  await prisma.$executeRawUnsafe('DELETE FROM assessment_run_tracks WHERE run_id=$1', fixture.runId)
  await prisma.$executeRawUnsafe('DELETE FROM assessment_runs WHERE id=$1', fixture.runId)
  await prisma.organizationMembership.deleteMany({ where: { organizationId: fixture.organizationId } })
  await prisma.organization.deleteMany({ where: { id: fixture.organizationId } })
  await prisma.user.deleteMany({ where: { id: { in: [...userIds, fixture.ownerId] } } })
}

suite('PR3 reporting result-source query budget (real PostgreSQL)', () => {
  beforeAll(async () => {
    process.env.DATABASE_URL = DB_URL!
    process.env.DATA_ENCRYPTION_KEY = process.env.DATA_ENCRYPTION_KEY || 'a'.repeat(64)
    const database = await import('../../config/database')
    prisma = database.prisma
    resolveAuthoritativeRunResults = (await import('../../modules/reporting/resultSource')).resolveAuthoritativeRunResults
    encryptUnifiedRuntimePayload = (await import('../../modules/assessment-runtime/security')).encryptUnifiedRuntimePayload
    createCanonicalUnitResultEnvelope = (await import('../../modules/assessment-runtime/unit-result')).createCanonicalUnitResultEnvelope
    prisma.$use(async (params, next) => {
      try { return await next(params) }
      finally { observedPrismaCalls.push({ model: params.model, action: params.action }) }
    })
  })

  afterAll(async () => {
    for (const fixture of [...fixtures].reverse()) await destroyFixture(fixture)
    await prisma.$disconnect()
  }, 120_000)

  it('keeps the same logical query budget for 100 and 500 SUBJECT observations', async () => {
    const oneHundred = await buildFixture(100)
    const fiveHundred = await buildFixture(500)

    const measured100 = await observe(() => resolveAuthoritativeRunResults(oneHundred.cohort))
    const measured500 = await observe(() => resolveAuthoritativeRunResults(fiveHundred.cohort))

    expect(measured100.value.resolved).toHaveLength(100)
    expect(measured500.value.resolved).toHaveLength(500)
    expect(measured100.value.unresolved).toHaveLength(0)
    expect(measured500.value.unresolved).toHaveLength(0)

    for (const measured of [measured100, measured500]) {
      expect(countCall(measured.calls, undefined, 'queryRaw')).toBe(1)
      expect(countCall(measured.calls, 'CompositeAssessmentAttempt', 'findMany')).toBe(1)
      expect(countCall(measured.calls, 'AssessmentUnitSnapshot', 'findMany')).toBe(1)
      expect(measured.calls).toHaveLength(3)
    }
    expect(measured500.calls).toEqual(measured100.calls)
  }, 120_000)
})
