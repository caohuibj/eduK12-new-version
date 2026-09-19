import { randomUUID } from 'node:crypto'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { PrismaClient, UserRole } from '@prisma/client'
import { integrationDatabaseUrl } from './integration-env'
import { createMembership, createOrganization, grantPersona } from '../../modules/organization/service'
import { addAssessmentRunTrackDraft, createAssessmentRunDraft } from '../../modules/assessment-run/repository'
import { publishAssessmentRun } from '../../modules/assessment-run/publish'
import {
  RunResourceAuthorityRegistry,
  type RunResourceAuthorityAdapter,
} from '../../modules/assessment-run/resourceAuthority'
import { RunRuntimeAdapterRegistry, type ExternalRunRuntimeAdapter, type RunRuntimeBinding } from '../../modules/assessment-run/runtimeAdapter'
import { startAssessmentRunExecution } from '../../modules/assessment-run/startExecution'
import { canonicalHash } from '../../modules/assessment-runtime/canonical'

const DB_URL = integrationDatabaseUrl('RELEASE_INTEGRATION_DATABASE_URL', 'PR26_INTEGRATION_DATABASE_URL', 'COGNITIVE_INTEGRATION_DB_URL')
const suite = DB_URL ? describe : describe.skip
let db: PrismaClient
const suffix = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`
const key = (label: string) => `run-recovery-${label}-${suffix}-${randomUUID()}`

const policy = {
  subjectRoles: ['STUDENT'], respondentRoles: ['STUDENT'], relationshipKinds: ['SELF'], perspectives: ['SELF_REPORT'],
  analysisMode: 'INDIVIDUAL_ONLY', visibilityPolicyKey: 'ORG_SELF_V1', minimumRespondents: null,
}

const externalResourceAdapter: RunResourceAuthorityAdapter = {
  family: 'BUNDLE',
  capabilities: {
    transactionMode: 'EXTERNAL', startMode: 'OPERATION_KEY', supportsLookupByOperationKey: true,
    supportsSafeCancel: false, finalAuthority: 'CANONICAL_RUNTIME', runtimeBindingKind: 'FAKE_RUNTIME', runV1Enabled: true,
  },
  async resolveExact(ref) {
    return {
      family: ref.family, key: ref.key, version: ref.version, scientificMaturity: 'PILOT',
      applicabilityHash: canonicalHash({ ref, policy }),
      subjectRoles: ['STUDENT'], respondentRoles: ['STUDENT'], relationshipKinds: ['SELF'], perspectives: ['SELF_REPORT'],
      analysisMode: 'INDIVIDUAL_ONLY', visibilityPolicyKey: 'ORG_SELF_V1', minimumRespondents: null,
      runtimeLaunchTarget: { kind: 'FAKE_RUNTIME', ref: 'fake-target-v1' },
    }
  },
}
const resourceRegistry = new RunResourceAuthorityRegistry([externalResourceAdapter])

class FaultRuntime implements ExternalRunRuntimeAdapter {
  runtimeBindingKind = 'FAKE_RUNTIME'
  mode: 'normal' | 'commit-then-throw' | 'unknown' = 'normal'
  startCalls = 0
  lookupCalls = 0
  readonly byOperation = new Map<string, RunRuntimeBinding>()

  async startWithOperationKey(input: { operationKey: string }): Promise<RunRuntimeBinding> {
    this.startCalls += 1
    const existing = this.byOperation.get(input.operationKey)
    if (existing) return existing
    if (this.mode === 'unknown') throw new Error('simulated transport ambiguity')
    const binding = { runtimeBindingKind: this.runtimeBindingKind, runtimeBindingRef: `fake:${input.operationKey}` }
    this.byOperation.set(input.operationKey, binding)
    if (this.mode === 'commit-then-throw') throw new Error('owner died after remote commit')
    return binding
  }

  async lookupByOperationKey(operationKey: string): Promise<RunRuntimeBinding | null> {
    this.lookupCalls += 1
    if (this.mode === 'unknown') throw new Error('lookup unavailable')
    return this.byOperation.get(operationKey) ?? null
  }
}

async function createExecution(label: string) {
  const owner = await db.user.create({
    data: { username: `recovery-owner-${label}-${suffix}-${randomUUID().slice(0, 8)}`, passwordHash: 'test-only', role: UserRole.TEACHER },
    select: { id: true },
  })
  const student = await db.user.create({
    data: { username: `recovery-student-${label}-${suffix}-${randomUUID().slice(0, 8)}`, passwordHash: 'test-only', role: UserRole.STUDENT },
    select: { id: true },
  })
  const org = await createOrganization({ name: `recovery ${label} ${suffix}`, meta: { actorUserId: owner.id, commandKey: key(`${label}-org`) } })
  const membership = await createMembership({ organizationId: org.organization.id, userId: student.id, meta: { actorUserId: owner.id, commandKey: key(`${label}-member`) } })
  await grantPersona({ organizationId: org.organization.id, membershipId: membership.id, persona: 'STUDENT', meta: { actorUserId: owner.id, commandKey: key(`${label}-persona`) } })
  const run = await createAssessmentRunDraft({ organizationId: org.organization.id, name: label, createdByUserId: owner.id })
  await addAssessmentRunTrackDraft({
    organizationId: org.organization.id, runId: run.id,
    resource: { family: 'BUNDLE', key: `external-${label}`, version: '1.0.0' },
    subjectSelector: { kind: 'MEMBERSHIP_IDS', membershipIds: [membership.id] },
    respondentSelector: { kind: 'MEMBERSHIP_IDS', membershipIds: [membership.id] },
    requestedPolicy: policy,
  })
  await publishAssessmentRun({ organizationId: org.organization.id, runId: run.id, actorUserId: owner.id, expectedVersion: 2, resourceRegistry })
  const rows = await db.$queryRawUnsafe<Array<{ id: string }>>(`SELECT id FROM assessment_run_executions WHERE run_id=$1`, run.id)
  return { executionId: rows[0].id, actorUserId: student.id }
}

suite('Assessment Run external START recovery gate (real PostgreSQL)', () => {
  beforeAll(async () => {
    db = new PrismaClient({ datasources: { db: { url: DB_URL! } } })
    await db.$connect()
  })
  afterAll(async () => db.$disconnect())

  it('recovers a remote commit after the owner dies mid-call and never creates a second runtime identity', async () => {
    const execution = await createExecution('mid-call')
    const runtime = new FaultRuntime()
    runtime.mode = 'commit-then-throw'
    const adapters = new RunRuntimeAdapterRegistry([runtime])

    const first = await startAssessmentRunExecution({ ...execution, resourceRegistry, runtimeAdapters: adapters })
    expect(first.state).toBe('STARTED')
    expect(first.replayed).toBe(true)
    expect(runtime.startCalls).toBe(1)
    expect(runtime.lookupCalls).toBe(1)

    const replay = await startAssessmentRunExecution({ ...execution, resourceRegistry, runtimeAdapters: adapters })
    expect(replay).toMatchObject({ state: 'STARTED', runtimeBindingRef: first.state === 'STARTED' ? first.runtimeBindingRef : undefined, replayed: true })
    expect(runtime.startCalls).toBe(1)
  })

  it('persists UNKNOWN when neither dispatch nor lookup can determine outcome, then takeover attaches the same operationKey', async () => {
    const execution = await createExecution('unknown')
    const runtime = new FaultRuntime()
    runtime.mode = 'unknown'
    const adapters = new RunRuntimeAdapterRegistry([runtime])

    await expect(startAssessmentRunExecution({ ...execution, resourceRegistry, runtimeAdapters: adapters }))
      .rejects.toMatchObject({ code: 'RUN_START_OUTCOME_UNKNOWN', statusCode: 503 })
    const claims = await db.$queryRawUnsafe<Array<{ id: string; operationKey: string; claimGeneration: number; state: string }>>(
      `SELECT id, operation_key AS "operationKey", claim_generation AS "claimGeneration", state FROM assessment_run_execution_start_claims WHERE execution_id=$1`,
      execution.executionId,
    )
    expect(claims[0].state).toBe('UNKNOWN')
    const operationKey = claims[0].operationKey
    const recoveredBinding = { runtimeBindingKind: 'FAKE_RUNTIME', runtimeBindingRef: `fake:${operationKey}` }
    runtime.byOperation.set(operationKey, recoveredBinding)
    runtime.mode = 'normal'
    await db.$executeRawUnsafe(`UPDATE assessment_run_execution_start_claims SET lease_until=NOW()-INTERVAL '1 second' WHERE id=$1`, claims[0].id)

    const recovered = await startAssessmentRunExecution({ ...execution, resourceRegistry, runtimeAdapters: adapters })
    expect(recovered).toMatchObject({ state: 'STARTED', runtimeBindingRef: recoveredBinding.runtimeBindingRef, replayed: true })
    const after = await db.$queryRawUnsafe<Array<{ operationKey: string; claimGeneration: number; state: string }>>(
      `SELECT operation_key AS "operationKey", claim_generation AS "claimGeneration", state FROM assessment_run_execution_start_claims WHERE execution_id=$1`,
      execution.executionId,
    )
    expect(after[0].operationKey).toBe(operationKey)
    expect(after[0].claimGeneration).toBe(claims[0].claimGeneration + 1)
    expect(after[0].state).toBe('COMPLETED')
  })
})
