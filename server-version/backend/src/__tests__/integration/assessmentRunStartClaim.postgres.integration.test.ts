import { randomUUID } from 'node:crypto'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { PrismaClient, UserRole } from '@prisma/client'
import { integrationDatabaseUrl } from './integration-env'
import { createMembership, createOrganization, grantPersona } from '../../modules/organization/service'
import { addAssessmentRunTrackDraft, createAssessmentRunDraft } from '../../modules/assessment-run/repository'
import { publishAssessmentRun } from '../../modules/assessment-run/publish'
import { RunResourceAuthorityRegistry, type RunResourceAuthorityAdapter } from '../../modules/assessment-run/resourceAuthority'
import { canonicalHash } from '../../modules/assessment-runtime/canonical'
import {
  acquireRunExecutionStartClaim as acquireClaim,
  markRunStartDispatchIntent,
} from '../../modules/assessment-run/startClaim'
import { freezeRunExecutionScientificProvenance } from '../../modules/assessment-run/scientificProvenance'

const DB_URL = integrationDatabaseUrl(
  'RELEASE_INTEGRATION_DATABASE_URL',
  'PR26_INTEGRATION_DATABASE_URL',
  'COGNITIVE_INTEGRATION_DB_URL',
)
const suite = DB_URL ? describe : describe.skip
let db: PrismaClient
const suffix = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`
const key = (label: string) => `run-start-claim-${label}-${suffix}-${randomUUID()}`

const requestedPolicy = {
  subjectRoles: ['STUDENT'],
  respondentRoles: ['STUDENT'],
  relationshipKinds: ['SELF'],
  perspectives: ['SELF_REPORT'],
  analysisMode: 'INDIVIDUAL_ONLY',
  visibilityPolicyKey: 'ORG_SELF_V1',
  minimumRespondents: null,
}

const testAdapter: RunResourceAuthorityAdapter = {
  family: 'BUNDLE',
  capabilities: {
    transactionMode: 'TRANSACTIONAL_DB',
    startMode: 'TRANSACTIONAL',
    supportsLookupByOperationKey: false,
    supportsSafeCancel: false,
    finalAuthority: 'CANONICAL_RUNTIME',
    runtimeBindingKind: 'COMPOSITE',
    runV1Enabled: true,
  },
  async resolveExact(ref) {
    return {
      family: ref.family,
      key: ref.key,
      version: ref.version,
      scientificMaturity: 'PILOT',
      applicabilityHash: canonicalHash({ ref, requestedPolicy }),
      subjectRoles: ['STUDENT'],
      respondentRoles: ['STUDENT'],
      relationshipKinds: ['SELF'],
      perspectives: ['SELF_REPORT'],
      analysisMode: 'INDIVIDUAL_ONLY',
      visibilityPolicyKey: 'ORG_SELF_V1',
      minimumRespondents: null,
      runtimeLaunchTarget: { kind: 'COMPOSITE', ref: 'test-composite' },
    }
  },
}
const registry = new RunResourceAuthorityRegistry([testAdapter])
const acquireRunExecutionStartClaim = (input: Parameters<typeof acquireClaim>[0]) => acquireClaim({ ...input, resourceRegistry: registry })

async function createExecution(label: string) {
  const owner = await db.user.create({
    data: { username: `claim-owner-${label}-${suffix}-${randomUUID().slice(0, 8)}`, passwordHash: 'test-only', role: UserRole.TEACHER },
    select: { id: true },
  })
  const student = await db.user.create({
    data: { username: `claim-student-${label}-${suffix}-${randomUUID().slice(0, 8)}`, passwordHash: 'test-only', role: UserRole.STUDENT },
    select: { id: true },
  })
  const organization = await createOrganization({
    name: `claim ${label} ${suffix}`,
    meta: { actorUserId: owner.id, commandKey: key(`${label}-org`) },
  })
  const membership = await createMembership({
    organizationId: organization.organization.id,
    userId: student.id,
    meta: { actorUserId: owner.id, commandKey: key(`${label}-member`) },
  })
  await grantPersona({
    organizationId: organization.organization.id,
    membershipId: membership.id,
    persona: 'STUDENT',
    meta: { actorUserId: owner.id, commandKey: key(`${label}-persona`) },
  })
  const run = await createAssessmentRunDraft({
    organizationId: organization.organization.id,
    name: `claim ${label}`,
    createdByUserId: owner.id,
  })
  await addAssessmentRunTrackDraft({
    organizationId: organization.organization.id,
    runId: run.id,
    resource: { family: 'BUNDLE', key: `bundle-${label}`, version: '1.0.0' },
    subjectSelector: { kind: 'MEMBERSHIP_IDS', membershipIds: [membership.id] },
    respondentSelector: { kind: 'MEMBERSHIP_IDS', membershipIds: [membership.id] },
    requestedPolicy,
  })
  await publishAssessmentRun({
    organizationId: organization.organization.id,
    runId: run.id,
    actorUserId: owner.id,
    expectedVersion: 2,
    resourceRegistry: registry,
  })
  const executions = await db.$queryRawUnsafe<Array<{ id: string; trackId: string }>>(
    `SELECT id, track_id AS "trackId" FROM "assessment_run_executions" WHERE "run_id"=$1`,
    run.id,
  )
  return { executionId: executions[0].id, trackId: executions[0].trackId, actorUserId: student.id }
}


const waitGate = () => {
  let release!: () => void
  const promise = new Promise<void>((resolve) => { release = resolve })
  return { promise, release }
}

async function createExecutionPair(label: string, sameRun: boolean) {
  const owner = await db.user.create({
    data: { username: `claim-pair-owner-${label}-${suffix}-${randomUUID().slice(0, 8)}`, passwordHash: 'test-only', role: UserRole.TEACHER },
    select: { id: true },
  })
  const students = await Promise.all([0, 1].map((index) => db.user.create({
    data: { username: `claim-pair-student-${label}-${index}-${suffix}-${randomUUID().slice(0, 8)}`, passwordHash: 'test-only', role: UserRole.STUDENT },
    select: { id: true },
  })))
  const organization = await createOrganization({
    name: `claim pair ${label} ${suffix}`,
    meta: { actorUserId: owner.id, commandKey: key(`${label}-pair-org`) },
  })
  const memberships = []
  for (const [index, student] of students.entries()) {
    const membership = await createMembership({
      organizationId: organization.organization.id,
      userId: student.id,
      meta: { actorUserId: owner.id, commandKey: key(`${label}-pair-member-${index}`) },
    })
    await grantPersona({
      organizationId: organization.organization.id,
      membershipId: membership.id,
      persona: 'STUDENT',
      meta: { actorUserId: owner.id, commandKey: key(`${label}-pair-persona-${index}`) },
    })
    memberships.push(membership)
  }

  const publish = async (runLabel: string, selected: typeof memberships) => {
    const run = await createAssessmentRunDraft({
      organizationId: organization.organization.id,
      name: `claim pair ${runLabel}`,
      createdByUserId: owner.id,
    })
    await addAssessmentRunTrackDraft({
      organizationId: organization.organization.id,
      runId: run.id,
      resource: { family: 'BUNDLE', key: `bundle-pair-${runLabel}-${randomUUID()}`, version: '1.0.0' },
      subjectSelector: { kind: 'MEMBERSHIP_IDS', membershipIds: selected.map((membership) => membership.id) },
      respondentSelector: { kind: 'MEMBERSHIP_IDS', membershipIds: selected.map((membership) => membership.id) },
      requestedPolicy,
    })
    await publishAssessmentRun({
      organizationId: organization.organization.id,
      runId: run.id,
      actorUserId: owner.id,
      expectedVersion: 2,
      resourceRegistry: registry,
    })
    return db.$queryRawUnsafe<Array<{ executionId: string; actorUserId: string; runId: string }>>(
      `SELECT e.id AS "executionId", actor.user_id AS "actorUserId", e.run_id AS "runId"
       FROM assessment_run_executions e
       JOIN assessment_run_actor_snapshots actor ON actor.id=e.respondent_actor_snapshot_id
       WHERE e.run_id=$1 ORDER BY e.id`,
      run.id,
    )
  }

  const executions = sameRun
    ? await publish(`${label}-same`, memberships)
    : [
        ...(await publish(`${label}-a`, [memberships[0]])),
        ...(await publish(`${label}-b`, [memberships[1]])),
      ]
  return { organizationId: organization.organization.id, executions }
}

suite('Assessment Run durable START claims (real PostgreSQL)', () => {
  beforeAll(async () => {
    db = new PrismaClient({ datasources: { db: { url: DB_URL! } } })
    await db.$connect()
  })
  afterAll(async () => db.$disconnect())

  it.each([
    ['suspended organization', `UPDATE organizations SET status='SUSPENDED' WHERE id=(SELECT organization_id FROM assessment_run_executions WHERE id=$1)`, 'ORGANIZATION_SUSPENDED'],
    ['ended membership', `UPDATE organization_memberships SET valid_until=clock_timestamp() WHERE id=(SELECT a.membership_id FROM assessment_run_actor_snapshots a JOIN assessment_run_executions e ON e.respondent_actor_snapshot_id=a.id WHERE e.id=$1)`, 'RUN_ACTOR_AUTHORITY_REVOKED'],
    ['revoked persona', `UPDATE organization_persona_grants SET revoked_at=clock_timestamp() WHERE membership_id=(SELECT a.membership_id FROM assessment_run_actor_snapshots a JOIN assessment_run_executions e ON e.respondent_actor_snapshot_id=a.id WHERE e.id=$1)`, 'RUN_ACTOR_AUTHORITY_REVOKED'],
    ['expired deadline', `UPDATE assessment_runs SET intake_deadline=clock_timestamp()-INTERVAL '1 second' WHERE id=(SELECT run_id FROM assessment_run_executions WHERE id=$1)`, 'RUN_INTAKE_CLOSED'],
    ['frozen account', `UPDATE users SET is_frozen=true WHERE id=(SELECT a.user_id FROM assessment_run_actor_snapshots a JOIN assessment_run_executions e ON e.respondent_actor_snapshot_id=a.id WHERE e.id=$1)`, 'RUN_ACCOUNT_INACTIVE'],
  ])('rejects first admission with %s and leaves no claim or frozen provenance', async (label, mutation, code) => {
    const fixture = await createExecution(label.replaceAll(' ', '-'))
    await db.$executeRawUnsafe(mutation, fixture.executionId)
    await expect(acquireRunExecutionStartClaim(fixture)).rejects.toMatchObject({ code })
    const rows = await db.$queryRawUnsafe<Array<{ claims: number; frozen: string | null }>>(
      `SELECT (SELECT COUNT(*)::int FROM assessment_run_execution_start_claims WHERE execution_id=e.id) AS claims, scientific_provenance_hash AS frozen FROM assessment_run_executions e WHERE e.id=$1`, fixture.executionId,
    )
    expect(rows[0]).toEqual({ claims: 0, frozen: null })
  })

  it('uses maturity at first admission rather than the earlier publish value', async () => {
    const fixture = await createExecution('promoted-before-admission')
    const promotedRegistry = new RunResourceAuthorityRegistry([{ ...testAdapter, async resolveExact(ref) {
      return { ...await testAdapter.resolveExact(ref), scientificMaturity: 'RESEARCH_READY' }
    } }])
    await acquireClaim({ ...fixture, resourceRegistry: promotedRegistry })
    const frozen = await freezeRunExecutionScientificProvenance(fixture.executionId, registry)
    expect(frozen.scientificMaturity).toBe('RESEARCH_READY')
  })

  it('commits admission, scientific provenance and one audit together', async () => {
    const fixture = await createExecution('atomic-admission')
    await acquireRunExecutionStartClaim(fixture)
    await acquireRunExecutionStartClaim(fixture)
    const rows = await db.$queryRawUnsafe<Array<{ frozen: string; audits: number }>>(
      `SELECT scientific_provenance_hash AS frozen, (SELECT COUNT(*)::int FROM organization_governance_audits WHERE target_id=e.id AND action='ASSESSMENT_RUN_START_ADMITTED') AS audits FROM assessment_run_executions e WHERE e.id=$1`, fixture.executionId,
    )
    expect(rows[0].frozen).toBeTruthy()
    expect(rows[0].audits).toBe(1)
  })


  it.each([
    ['the same Run', true],
    ['different Runs', false],
  ])('allows unrelated executions in %s across shared Organization/Run authority fences', async (_label, sameRun) => {
    const fixture = await createExecutionPair(`parallel-${sameRun ? 'same' : 'different'}`, sameRun)
    expect(fixture.executions).toHaveLength(2)
    const locked = waitGate()
    const release = waitGate()
    const blocker = db.$transaction(async (tx) => {
      await tx.$queryRawUnsafe('SELECT id FROM organizations WHERE id=$1 FOR SHARE', fixture.organizationId)
      if (sameRun) await tx.$queryRawUnsafe('SELECT id FROM assessment_runs WHERE id=$1 FOR SHARE', fixture.executions[0].runId)
      locked.release()
      await release.promise
    }, { timeout: 10_000 })
    await locked.promise
    try {
      const starts = Promise.all(fixture.executions.map((execution) => acquireRunExecutionStartClaim({
        executionId: execution.executionId,
        actorUserId: execution.actorUserId,
        leaseMs: 30_000,
      })))
      const timeout = new Promise<never>((_, reject) => setTimeout(
        () => reject(new Error('unrelated START was serialized behind a shared authority fence')),
        2_000,
      ))
      const results = await Promise.race([starts, timeout])
      expect(results.every((result) => result.kind === 'ACQUIRED')).toBe(true)
    } finally {
      release.release()
      await blocker
    }
  }, 30_000)

  it.each([
    ['organization suspension', false, `UPDATE organizations SET status='SUSPENDED' WHERE id=(SELECT organization_id FROM assessment_run_executions WHERE id=$1)`, 'ORGANIZATION_SUSPENDED'],
    ['Run close', false, `UPDATE assessment_runs SET status='CLOSED', closed_at=clock_timestamp() WHERE id=(SELECT run_id FROM assessment_run_executions WHERE id=$1)`, 'RUN_NOT_STARTABLE'],
    ['intake close', false, `UPDATE assessment_runs SET intake_deadline=clock_timestamp()-INTERVAL '1 second' WHERE id=(SELECT run_id FROM assessment_run_executions WHERE id=$1)`, 'RUN_INTAKE_CLOSED'],
    ['account freeze', false, `UPDATE users SET is_frozen=true WHERE id=(SELECT a.user_id FROM assessment_run_actor_snapshots a JOIN assessment_run_executions e ON e.respondent_actor_snapshot_id=a.id WHERE e.id=$1)`, 'RUN_ACCOUNT_INACTIVE'],
    ['account deactivate', false, `UPDATE users SET is_active=false WHERE id=(SELECT a.user_id FROM assessment_run_actor_snapshots a JOIN assessment_run_executions e ON e.respondent_actor_snapshot_id=a.id WHERE e.id=$1)`, 'RUN_ACCOUNT_INACTIVE'],
    ['membership end', true, `UPDATE organization_memberships SET valid_until=clock_timestamp() WHERE id=(SELECT a.membership_id FROM assessment_run_actor_snapshots a JOIN assessment_run_executions e ON e.respondent_actor_snapshot_id=a.id WHERE e.id=$1)`, 'RUN_ACTOR_AUTHORITY_REVOKED'],
    ['persona revoke', true, `UPDATE organization_persona_grants SET revoked_at=clock_timestamp() WHERE membership_id=(SELECT a.membership_id FROM assessment_run_actor_snapshots a JOIN assessment_run_executions e ON e.respondent_actor_snapshot_id=a.id WHERE e.id=$1)`, 'RUN_ACTOR_AUTHORITY_REVOKED'],
  ])('serializes START against a concurrently committing %s', async (_label, lockOrganization, mutation, code) => {
    const fixture = await createExecution(`race-${String(_label).replaceAll(' ', '-')}`)
    const locked = waitGate()
    const release = waitGate()
    const mutator = db.$transaction(async (tx) => {
      if (lockOrganization) {
        await tx.$queryRawUnsafe(
          'SELECT o.id FROM organizations o JOIN assessment_run_executions e ON e.organization_id=o.id WHERE e.id=$1 FOR UPDATE OF o',
          fixture.executionId,
        )
      }
      await tx.$executeRawUnsafe(mutation, fixture.executionId)
      locked.release()
      await release.promise
    }, { timeout: 10_000 })
    await locked.promise
    const start = acquireRunExecutionStartClaim(fixture)
    await new Promise((resolve) => setTimeout(resolve, 50))
    release.release()
    await mutator
    await expect(start).rejects.toMatchObject({ code })
    const rows = await db.$queryRawUnsafe<Array<{ count: number }>>(
      'SELECT COUNT(*)::int AS count FROM assessment_run_execution_start_claims WHERE execution_id=$1',
      fixture.executionId,
    )
    expect(rows[0].count).toBe(0)
  }, 30_000)

  it('admits exactly one active claim under concurrent START and never accepts a client operation key', async () => {
    const execution = await createExecution('concurrent')
    const results = await Promise.all([
      acquireRunExecutionStartClaim({ executionId: execution.executionId, actorUserId: execution.actorUserId, leaseMs: 30_000 }),
      acquireRunExecutionStartClaim({ executionId: execution.executionId, actorUserId: execution.actorUserId, leaseMs: 30_000 }),
    ])
    expect(results.filter((result) => result.kind === 'ACQUIRED')).toHaveLength(1)
    expect(results.filter((result) => result.kind === 'IN_PROGRESS')).toHaveLength(1)
    const acquired = results.find((result) => result.kind === 'ACQUIRED')!
    expect(acquired.claim.operationKey).toMatch(new RegExp(`^run-start:${execution.executionId}:`))

    const rows = await db.$queryRawUnsafe<Array<{ count: number }>>(
      `SELECT COUNT(*)::int AS count FROM "assessment_run_execution_start_claims" WHERE "execution_id"=$1`,
      execution.executionId,
    )
    expect(rows[0].count).toBe(1)
  })

  it('takes over an expired undispatched claim by generation while preserving the server operation key', async () => {
    const execution = await createExecution('takeover')
    const first = await acquireRunExecutionStartClaim({ executionId: execution.executionId, actorUserId: execution.actorUserId, leaseMs: 30_000 })
    expect(first.kind).toBe('ACQUIRED')
    if (first.kind !== 'ACQUIRED') throw new Error('expected acquired')
    await db.$executeRawUnsafe(
      `UPDATE "assessment_run_execution_start_claims"
       SET "claimed_at"=NOW()-INTERVAL '2 seconds', "lease_until"=NOW()-INTERVAL '1 second'
       WHERE "id"=$1`,
      first.claim.id,
    )
    const second = await acquireRunExecutionStartClaim({ executionId: execution.executionId, actorUserId: execution.actorUserId, leaseMs: 30_000 })
    expect(second.kind).toBe('ACQUIRED')
    if (second.kind !== 'ACQUIRED') throw new Error('expected takeover')
    expect(second.claim.operationKey).toBe(first.claim.operationKey)
    expect(second.claim.claimGeneration).toBe(first.claim.claimGeneration + 1)
  })

  it('routes an expired dispatched claim to recovery with the same operation key instead of blind retry', async () => {
    const execution = await createExecution('recovery')
    const first = await acquireRunExecutionStartClaim({ executionId: execution.executionId, actorUserId: execution.actorUserId, leaseMs: 30_000 })
    if (first.kind !== 'ACQUIRED') throw new Error('expected acquired')
    const dispatched = await markRunStartDispatchIntent({
      claimId: first.claim.id,
      generation: first.claim.claimGeneration,
      leaseMs: 30_000,
    })
    await db.$executeRawUnsafe(
      `UPDATE "assessment_run_execution_start_claims"
       SET "claimed_at"=NOW()-INTERVAL '2 seconds', "lease_until"=NOW()-INTERVAL '1 second'
       WHERE "id"=$1`,
      first.claim.id,
    )
    const recovered = await acquireRunExecutionStartClaim({ executionId: execution.executionId, actorUserId: execution.actorUserId, leaseMs: 30_000 })
    expect(recovered.kind).toBe('RECOVER')
    if (recovered.kind !== 'RECOVER') throw new Error('expected recovery')
    expect(recovered.claim.operationKey).toBe(dispatched.operationKey)
    expect(recovered.claim.claimGeneration).toBe(dispatched.claimGeneration + 1)
    expect(recovered.claim.state).toBe('DISPATCHED')
  })

  it('freezes exact current maturity once at admission and never promotes historical provenance', async () => {
    const execution = await createExecution('science')
    const first = await freezeRunExecutionScientificProvenance(execution.executionId, registry)
    expect(first.scientificMaturity).toBe('PILOT')

    const promotedPolicy = {
      family: 'BUNDLE',
      key: 'promoted',
      version: '1.0.0',
      scientificMaturity: 'RESEARCH_READY',
    }
    await db.$executeRawUnsafe(
      `UPDATE "assessment_run_tracks" SET "frozen_resource_policy"=$1::jsonb, "resource_policy_hash"=$2 WHERE "id"=$3`,
      JSON.stringify(promotedPolicy),
      canonicalHash(promotedPolicy),
      execution.trackId,
    )

    const replay = await freezeRunExecutionScientificProvenance(execution.executionId, registry)
    expect(replay.scientificMaturity).toBe('PILOT')
    expect(replay.scientificProvenanceHash).toBe(first.scientificProvenanceHash)
    expect(replay.scientificProvenance.resourcePolicyHash).toBe(first.scientificProvenance.resourcePolicyHash)
  })
})
