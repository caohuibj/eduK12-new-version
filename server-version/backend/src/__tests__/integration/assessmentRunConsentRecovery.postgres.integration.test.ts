import { randomUUID } from 'node:crypto'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { PrismaClient, UserRole } from '@prisma/client'
import { integrationDatabaseUrl } from './integration-env'
import { createMembership, createOrganization, grantPersona } from '../../modules/organization/service'
import { addAssessmentRunTrackDraft, createAssessmentRunDraft } from '../../modules/assessment-run/repository'
import { publishAssessmentRun } from '../../modules/assessment-run/publish'
import { acceptRunExecutionConsent } from '../../modules/assessment-run/consent'
import {
  RunResourceAuthorityRegistry,
  type RunResourceAuthorityAdapter,
} from '../../modules/assessment-run/resourceAuthority'
import {
  RunRuntimeAdapterRegistry,
  type ExternalRunRuntimeAdapter,
  type RunRuntimeBinding,
} from '../../modules/assessment-run/runtimeAdapter'
import { startAssessmentRunExecution } from '../../modules/assessment-run/startExecution'
import { canonicalHash } from '../../modules/assessment-runtime/canonical'
import { createSqlRelationalAssignmentRepository } from '../../modules/assessment-relational/repository'
import { createRelationalRuntimeConsentAuthority } from '../../modules/assessment-relational/runtime-consent'

const DB_URL = integrationDatabaseUrl(
  'RELEASE_INTEGRATION_DATABASE_URL',
  'PR26_INTEGRATION_DATABASE_URL',
  'COGNITIVE_INTEGRATION_DB_URL',
)
const suite = DB_URL ? describe : describe.skip
let db: PrismaClient
const suffix = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`
const key = (label: string) => `run-consent-recovery-${label}-${suffix}-${randomUUID()}`

const observerPolicy = {
  subjectRoles: ['STUDENT'],
  respondentRoles: ['PARENT'],
  relationshipKinds: ['PARENT_CHILD'],
  perspectives: ['OBSERVER_REPORT'],
  analysisMode: 'INDIVIDUAL_ONLY',
  visibilityPolicyKey: 'observer_assigning_teacher_v1',
  minimumRespondents: null,
}

const observerResourceAdapter: RunResourceAuthorityAdapter = {
  family: 'BUNDLE',
  capabilities: {
    transactionMode: 'EXTERNAL',
    startMode: 'OPERATION_KEY',
    supportsLookupByOperationKey: true,
    supportsSafeCancel: false,
    finalAuthority: 'CANONICAL_RUNTIME',
    runtimeBindingKind: 'FAKE_RUNTIME',
    runV1Enabled: true,
  },
  async resolveExact(ref) {
    return {
      family: ref.family,
      key: ref.key,
      version: ref.version,
      scientificMaturity: 'PILOT',
      applicabilityHash: canonicalHash({ ref, observerPolicy }),
      ...observerPolicy,
      runtimeLaunchTarget: { kind: 'FAKE_RUNTIME', ref: 'fake-parent-observer-v1' },
    }
  },
}
const resourceRegistry = new RunResourceAuthorityRegistry([observerResourceAdapter])

class AmbiguousCommittedRuntime implements ExternalRunRuntimeAdapter {
  runtimeBindingKind = 'FAKE_RUNTIME'
  mode: 'ambiguous' | 'recoverable' = 'ambiguous'
  startCalls = 0
  lookupCalls = 0
  readonly byOperation = new Map<string, RunRuntimeBinding>()

  async startWithOperationKey(input: { operationKey: string }): Promise<RunRuntimeBinding> {
    this.startCalls += 1
    const existing = this.byOperation.get(input.operationKey)
    if (existing) return existing
    const binding = {
      runtimeBindingKind: this.runtimeBindingKind,
      runtimeBindingRef: `fake:${input.operationKey}`,
    }
    this.byOperation.set(input.operationKey, binding)
    throw new Error('remote committed but transport outcome is ambiguous')
  }

  async lookupByOperationKey(operationKey: string): Promise<RunRuntimeBinding | null> {
    this.lookupCalls += 1
    if (this.mode === 'ambiguous') throw new Error('provider lookup temporarily unavailable')
    return this.byOperation.get(operationKey) ?? null
  }
}

async function createObserverExecution() {
  const owner = await db.user.create({
    data: {
      username: `consent-recovery-owner-${suffix}-${randomUUID().slice(0, 8)}`,
      passwordHash: 'test-only',
      role: UserRole.TEACHER,
      teacherApproved: true,
    },
    select: { id: true },
  })
  const child = await db.user.create({
    data: {
      username: `consent-recovery-child-${suffix}-${randomUUID().slice(0, 8)}`,
      passwordHash: 'test-only',
      role: UserRole.STUDENT,
    },
    select: { id: true },
  })
  // Legacy role is intentionally not PARENT; Organization observer authority is
  // frozen from the real relationship, not User.role.
  const parent = await db.user.create({
    data: {
      username: `consent-recovery-parent-${suffix}-${randomUUID().slice(0, 8)}`,
      passwordHash: 'test-only',
      role: UserRole.STUDENT,
    },
    select: { id: true },
  })

  const org = await createOrganization({
    name: `consent recovery ${suffix}`,
    meta: { actorUserId: owner.id, commandKey: key('org') },
  })
  const childMembership = await createMembership({
    organizationId: org.organization.id,
    userId: child.id,
    meta: { actorUserId: owner.id, commandKey: key('child-membership') },
  })
  await grantPersona({
    organizationId: org.organization.id,
    membershipId: childMembership.id,
    persona: 'STUDENT',
    meta: { actorUserId: owner.id, commandKey: key('child-persona') },
  })
  await db.parentStudentRelationship.create({
    data: {
      parentUserId: parent.id,
      studentUserId: child.id,
      status: 'ACTIVE',
      approvedAt: new Date(),
      approvedByUserId: owner.id,
    },
  })

  const run = await createAssessmentRunDraft({
    organizationId: org.organization.id,
    name: 'observer recovery',
    createdByUserId: owner.id,
  })
  await addAssessmentRunTrackDraft({
    organizationId: org.organization.id,
    runId: run.id,
    resource: { family: 'BUNDLE', key: 'observer-recovery', version: '1.0.0' },
    subjectSelector: { kind: 'MEMBERSHIP_IDS', membershipIds: [childMembership.id] },
    respondentSelector: { kind: 'RELATED_PARENT' },
    requestedPolicy: observerPolicy,
  })
  await publishAssessmentRun({
    organizationId: org.organization.id,
    runId: run.id,
    actorUserId: owner.id,
    expectedVersion: 2,
    resourceRegistry,
  })

  const rows = await db.$queryRawUnsafe<Array<{
    executionId: string
    assignmentId: string
    rootConsentId: string
  }>>(
    `SELECT e.id AS "executionId", e.relational_assignment_id AS "assignmentId", a.consent_id AS "rootConsentId"
     FROM assessment_run_executions e
     JOIN relational_assessment_assignments a ON a.id=e.relational_assignment_id
     WHERE e.run_id=$1`,
    run.id,
  )
  const task = rows[0]
  await acceptRunExecutionConsent({ executionId: task.executionId, actorUserId: parent.id })
  const accepted = await db.assessmentAttemptConsent.findFirstOrThrow({
    where: { priorConsentId: task.rootConsentId, acceptedAt: { not: null } },
    select: { id: true },
  })
  return {
    organizationId: org.organization.id,
    runId: run.id,
    executionId: task.executionId,
    assignmentId: task.assignmentId,
    actorUserId: parent.id,
    acceptedConsentId: accepted.id,
  }
}

suite('Assessment Run consent-bearing UNKNOWN recovery gate (real PostgreSQL)', () => {
  beforeAll(async () => {
    db = new PrismaClient({ datasources: { db: { url: DB_URL! } } })
    await db.$connect()
  })
  afterAll(async () => db.$disconnect())

  it('reconciles the admitted operation after consent revoke, while FINAL still rejects revoked consent', async () => {
    const execution = await createObserverExecution()
    const runtime = new AmbiguousCommittedRuntime()
    const runtimeAdapters = new RunRuntimeAdapterRegistry([runtime])

    await expect(startAssessmentRunExecution({
      ...execution,
      resourceRegistry,
      runtimeAdapters,
    })).rejects.toMatchObject({ code: 'RUN_START_OUTCOME_UNKNOWN', statusCode: 503 })

    const before = await db.$queryRawUnsafe<Array<{
      id: string
      operationKey: string
      claimGeneration: number
      state: string
      admittedAttemptIdentity: { consentId: string }
    }>>(
      `SELECT id, operation_key AS "operationKey", claim_generation AS "claimGeneration", state,
              admitted_attempt_identity AS "admittedAttemptIdentity"
       FROM assessment_run_execution_start_claims WHERE execution_id=$1`,
      execution.executionId,
    )
    expect(before[0].state).toBe('UNKNOWN')
    expect(before[0].admittedAttemptIdentity.consentId).toBe(execution.acceptedConsentId)
    expect(runtime.byOperation.has(before[0].operationKey)).toBe(true)

    await db.assessmentAttemptConsent.update({
      where: { id: execution.acceptedConsentId },
      data: { revokedAt: new Date() },
    })
    await db.$executeRawUnsafe(
      `UPDATE assessment_run_execution_start_claims
       SET claimed_at=NOW()-INTERVAL '2 seconds', lease_until=NOW()-INTERVAL '1 second'
       WHERE id=$1`,
      before[0].id,
    )
    runtime.mode = 'recoverable'

    const recovered = await startAssessmentRunExecution({
      ...execution,
      resourceRegistry,
      runtimeAdapters,
    })
    expect(recovered).toMatchObject({
      state: 'STARTED',
      runtimeBindingRef: `fake:${before[0].operationKey}`,
      replayed: true,
    })
    expect(runtime.startCalls).toBe(1)
    expect(runtime.lookupCalls).toBeGreaterThanOrEqual(2)

    const after = await db.$queryRawUnsafe<Array<{
      operationKey: string
      claimGeneration: number
      state: string
      admittedAttemptIdentity: { consentId: string }
    }>>(
      `SELECT operation_key AS "operationKey", claim_generation AS "claimGeneration", state,
              admitted_attempt_identity AS "admittedAttemptIdentity"
       FROM assessment_run_execution_start_claims WHERE execution_id=$1`,
      execution.executionId,
    )
    expect(after[0]).toMatchObject({
      operationKey: before[0].operationKey,
      claimGeneration: before[0].claimGeneration + 1,
      state: 'COMPLETED',
    })
    expect(after[0].admittedAttemptIdentity.consentId).toBe(execution.acceptedConsentId)

    const assignments = createSqlRelationalAssignmentRepository(db as any)
    const finalAuthority = createRelationalRuntimeConsentAuthority({
      db: {
        compositeAssessmentAttempt: {
          async findUnique() {
            return {
              userId: execution.actorUserId,
              assignmentRef: execution.assignmentId,
              consentId: execution.acceptedConsentId,
            }
          },
        },
        cognitiveSession: { async findUnique() { return null } },
      },
      assignments,
    })
    await expect(finalAuthority.assertCompositeFinal('synthetic-runtime-attempt', execution.actorUserId))
      .rejects.toMatchObject({ code: 'RELATIONAL_CONSENT_REQUIRED' })
  })
})
