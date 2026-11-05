import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { PrismaClient } from '@prisma/client'
import { randomUUID } from 'node:crypto'
import { prisma as db } from '../../config/database'
import { integrationDatabaseUrl } from './integration-env'
import { startAssessmentRunExecution } from '../../modules/assessment-run/startExecution'
import { acquireRunExecutionStartClaim } from '../../modules/assessment-run/startClaim'
import { RunResourceAuthorityRegistry } from '../../modules/assessment-run/resourceAuthority'
import { canonicalHash } from '../../modules/assessment-runtime/canonical'
import { createOrganization, createMembership, grantPersona } from '../../modules/organization/service'
import { createAssessmentRunDraft, addAssessmentRunTrackDraft } from '../../modules/assessment-run/repository'
import { publishAssessmentRun } from '../../modules/assessment-run/publish'

/**
 * BOUND Run replay governance matrix with deterministic interleaving (real
 * PostgreSQL, tx1 + tx2 existing-branch end-to-end).
 *
 * Pinned CURRENT semantics (product confirmation pending, must not be
 * silently tightened): a Run CLOSE or execution REVOKED committed inside the
 * envelope-lock window does NOT change the replay outcome, because the BOUND
 * branch performs no status checks. Each interleave holds the execution row,
 * issues the replay, OBSERVES it blocked on an assessment_run_executions
 * query owned by the holder, commits the state flip in the same transaction,
 * then asserts the preserved outcome.
 */
const DB_URL = integrationDatabaseUrl('TRAINING_START_ADMISSION_INTEGRATION_DATABASE_URL', 'PR26_INTEGRATION_DATABASE_URL', 'COGNITIVE_INTEGRATION_DB_URL')
const suite = DB_URL ? describe : describe.skip

const policy = {
  subjectRoles: ['STUDENT'], respondentRoles: ['STUDENT'], relationshipKinds: ['SELF'],
  perspectives: ['SELF_REPORT'], analysisMode: 'INDIVIDUAL_ONLY', visibilityPolicyKey: 'ORG_SELF_V1', minimumRespondents: null,
}

suite('BOUND Run replay governance interleave (real PostgreSQL)', () => {
  const suffix = `bound-il-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`
  let organizationId = ''
  let ownerUserId = ''
  let runId = ''
  let compositeId = ''
  const bound: Array<{ executionId: string; actorUserId: string }> = []
  const unbound: Array<{ executionId: string; actorUserId: string }> = []
  const strangerId = `${suffix}-stranger`
  const observer = new PrismaClient({ datasources: { db: { url: DB_URL } } })
  const registry = new RunResourceAuthorityRegistry([{
    family: 'BUNDLE',
    capabilities: { transactionMode: 'TRANSACTIONAL_DB', startMode: 'TRANSACTIONAL', supportsLookupByOperationKey: false,
      supportsSafeCancel: false, finalAuthority: 'CANONICAL_RUNTIME', runtimeBindingKind: 'COMPOSITE', runV1Enabled: true },
    async resolveExact(ref: { family: string; key: string; version: string }) {
      return { family: ref.family, key: ref.key, version: ref.version, scientificMaturity: 'PILOT',
        applicabilityHash: canonicalHash({ ref, policy }), ...policy,
        runtimeLaunchTarget: { kind: 'COMPOSITE', ref: compositeId } }
    },
  }])

  const bindExecution = async (executionId: string, actorUserId: string): Promise<void> => {
    const d = await acquireRunExecutionStartClaim({ executionId, actorUserId, resourceRegistry: registry })
    if (d.kind !== 'ACQUIRED') throw new Error(`bind precondition got ${d.kind}`)
    await db.$executeRaw`UPDATE assessment_run_executions SET runtime_binding_kind='COMPOSITE', runtime_binding_ref=${randomUUID()}, status='STARTED' WHERE id=${executionId}`
    await db.$executeRaw`UPDATE assessment_run_execution_start_claims SET state='DISPATCHED', dispatched_at=transaction_timestamp(), updated_at=transaction_timestamp() WHERE execution_id=${executionId}`
  }

  /** Hold the execution row FOR UPDATE, issue the replay, observe it blocked
   * on an assessment_run_executions query owned by this holder, run the flip
   * in the same transaction, commit, then collect the replay outcome. */
  const interleave = async (executionId: string, flip: (tx: Parameters<Parameters<typeof db.$transaction>[0]>[0]) => Promise<void>,
    probe: () => Promise<unknown>): Promise<{ ok: boolean; value?: unknown; message?: string }> => {
    let ready!: () => void
    const held = new Promise<void>(r => { ready = r })
    let releaseFlip!: () => void
    const flipGate = new Promise<void>(r => { releaseFlip = r })
    let holderPid = 0
    const holder = db.$transaction(async tx => {
      const [pidRow] = await tx.$queryRawUnsafe<Array<{ pid: number }>>('SELECT pg_backend_pid() AS pid')
      holderPid = pidRow.pid
      await tx.$queryRawUnsafe('SELECT id FROM assessment_run_executions WHERE id = $1 FOR UPDATE', executionId)
      ready()
      await flipGate
      await flip(tx)
    }, { maxWait: 10000, timeout: 30000 })
    holder.catch(() => {})
    await held
    const outcome = probe()
      .then(v => ({ ok: true as const, value: v }))
      .catch((e: { code?: string; message?: string }) => ({ ok: false as const, message: String(e.code ?? e.message ?? 'error') }))
    const deadline = Date.now() + 15000
    for (;;) {
      const rows = await observer.$queryRawUnsafe<Array<{ pid: number }>>(
        `SELECT s.pid FROM pg_stat_activity s
         WHERE s.wait_event_type = 'Lock' AND cardinality(pg_blocking_pids(s.pid)) > 0
           AND ${holderPid} = ANY(pg_blocking_pids(s.pid))
           AND s.query ILIKE '%assessment_run_executions%'`)
      if (rows.length > 0) break
      if (Date.now() > deadline) { releaseFlip(); await holder; throw new Error('replay never observed blocked on the execution row') }
      await new Promise(r => setTimeout(r, 50))
    }
    releaseFlip()
    await holder
    return outcome
  }

  beforeAll(async () => {
    const owner = await db.user.create({ data: { username: `${suffix}-owner`, passwordHash: 'SYNTHETIC NONLOGIN', role: 'TEACHER', teacherApproved: true, accountDomain: 'LEGACY' } })
    ownerUserId = owner.id
    await db.user.create({ data: { id: strangerId, username: strangerId, passwordHash: 'SYNTHETIC NONLOGIN', role: 'STUDENT', accountDomain: 'LEGACY' } })
    const org = await createOrganization({ name: `${suffix} org`, meta: { actorUserId: owner.id, commandKey: randomUUID() } })
    organizationId = org.organization.id
    const memberships: Array<{ membershipId: string; userId: string }> = []
    for (let i = 0; i < 8; i++) {
      const student = await db.user.create({ data: { username: `${suffix}-s${i}`, passwordHash: 'SYNTHETIC NONLOGIN', role: 'STUDENT', accountDomain: 'LEGACY' } })
      const m = await createMembership({ organizationId, userId: student.id, meta: { actorUserId: owner.id, commandKey: randomUUID() } })
      await grantPersona({ organizationId, membershipId: m.id, persona: 'STUDENT', meta: { actorUserId: owner.id, commandKey: randomUUID() } })
      memberships.push({ membershipId: m.id, userId: student.id })
    }
    const composite = await db.compositeAssessment.create({ data: {
      code: `${suffix}-composite`, name: 'bound interleave runtime', createdBy: owner.id,
      productKind: 'QUESTIONNAIRE', questionnaireType: 'COURSE', status: 'PUBLISHED', maxAttempts: 3 } })
    compositeId = composite.id
    const run = await createAssessmentRunDraft({ organizationId, name: `${suffix} run`, createdByUserId: owner.id })
    await addAssessmentRunTrackDraft({ organizationId, runId: run.id,
      resource: { family: 'BUNDLE', key: `${suffix}-res`, version: '1.0.0' },
      subjectSelector: { kind: 'MEMBERSHIP_IDS', membershipIds: memberships.map(m => m.membershipId) },
      respondentSelector: { kind: 'MEMBERSHIP_IDS', membershipIds: memberships.map(m => m.membershipId) }, requestedPolicy: policy })
    await publishAssessmentRun({ organizationId, runId: run.id, actorUserId: owner.id, expectedVersion: 2, resourceRegistry: registry })
    runId = run.id
    const rows = await db.$queryRaw<Array<{ executionId: string; userId: string }>>`
      SELECT e.id AS "executionId", a.user_id AS "userId"
      FROM assessment_run_executions e JOIN assessment_run_actor_snapshots a ON a.id=e.respondent_actor_snapshot_id
      WHERE e.run_id=${run.id} ORDER BY e.id LIMIT 8`
    for (const r of rows.slice(0, 4)) { await bindExecution(r.executionId, r.userId); bound.push({ executionId: r.executionId, actorUserId: r.userId }) }
    for (const r of rows.slice(4)) unbound.push({ executionId: r.executionId, actorUserId: r.userId })
    await observer.$connect()
  }, 240000)

  afterAll(async () => {
    try {
      // Suffix-keyed best-effort cleanup (isolated DB; FK order).
      const step = (p: Promise<unknown>): Promise<unknown> => p.catch(() => undefined)
      await step(db.compositeAssessmentAttempt.deleteMany({ where: { compositeAssessmentId: compositeId } }))
      await step(db.compositeAssessment.deleteMany({ where: { code: `${suffix}-composite` } }))
      await step(db.$executeRaw`DELETE FROM assessment_run_execution_start_claims WHERE execution_id IN (SELECT id FROM assessment_run_executions WHERE run_id=${runId})`)
      await step(db.$executeRaw`DELETE FROM assessment_run_executions WHERE run_id=${runId}`)
      await step(db.$executeRaw`DELETE FROM assessment_run_actor_snapshots WHERE run_id=${runId}`)
      await step(db.$executeRaw`DELETE FROM assessment_run_relationship_snapshots WHERE run_id=${runId}`)
      await step(db.$executeRaw`DELETE FROM assessment_run_tracks WHERE run_id=${runId}`)
      await step(db.$executeRaw`DELETE FROM assessment_runs WHERE id=${runId}`)
      await step(db.organizationMembership.deleteMany({ where: { organizationId } }))
      await step(db.$executeRaw`DELETE FROM organizations WHERE id=${organizationId}`)
      await step(db.user.deleteMany({ where: { username: { startsWith: suffix } } }))
    } finally {
      await observer.$disconnect()
      await (await import('../../config/queue')).closeQueues(true)
      await db.$disconnect()
    }
  }, 120000)

  it('concurrent first admission on one execution fences to exactly one ACQUIRED', async () => {
    const exec = unbound[0]
    const race = await Promise.all([
      acquireRunExecutionStartClaim({ executionId: exec.executionId, actorUserId: exec.actorUserId, resourceRegistry: registry })
        .then(v => v.kind).catch(e => `error:${(e as { code?: string }).code ?? (e as Error).message}`),
      acquireRunExecutionStartClaim({ executionId: exec.executionId, actorUserId: exec.actorUserId, resourceRegistry: registry })
        .then(v => v.kind).catch(e => `error:${(e as { code?: string }).code ?? (e as Error).message}`),
    ])
    expect([...race].sort()).toEqual(['ACQUIRED', 'IN_PROGRESS'])
  }, 60000)

  it('unauthorized actor is rejected on the BOUND path', async () => {
    await expect(startAssessmentRunExecution({ executionId: bound[0].executionId, actorUserId: strangerId }))
      .rejects.toMatchObject({ code: 'RUN_EXECUTION_ACTOR' })
  }, 30000)

  it('Run CLOSE committed inside the envelope-lock window does not change the BOUND replay outcome (pinned behavior)', async () => {
    const exec = bound[1]
    // The holder starts at the RUN row, matching the product closeAssessmentRun
    // lock order (Run -> Executions); the replay is observed blocked on the run
    // row, the CLOSE commits, and the replay then re-reads governance under its
    // own envelope locks and must still return the bound attempt.
    let ready!: () => void
    const held = new Promise<void>(r => { ready = r })
    let releaseFlip!: () => void
    const flipGate = new Promise<void>(r => { releaseFlip = r })
    let holderPid = 0
    const holder = db.$transaction(async tx => {
      const [pidRow] = await tx.$queryRawUnsafe<Array<{ pid: number }>>('SELECT pg_backend_pid() AS pid')
      holderPid = pidRow.pid
      await tx.$queryRawUnsafe(`UPDATE assessment_runs SET status='CLOSED', closed_at=transaction_timestamp() WHERE id='${runId}'`)
      ready()
      await flipGate
    }, { maxWait: 10000, timeout: 30000 })
    holder.catch(() => {})
    await held
    // Issue the probe while the run row is held; observe it blocked on an
    // assessment_runs query owned by this holder; then commit the CLOSE.
    const outcome = startAssessmentRunExecution({ executionId: exec.executionId, actorUserId: exec.actorUserId })
      .then(v => ({ ok: true as const, v })).catch(e => ({ ok: false as const, message: String((e as { code?: string; message?: string }).code ?? e.message ?? 'error') }))
    const deadline = Date.now() + 15000
    for (;;) {
      const rows = await observer.$queryRawUnsafe<Array<{ pid: number; query: string }>>(
        `SELECT s.pid FROM pg_stat_activity s
         WHERE s.wait_event_type = 'Lock' AND cardinality(pg_blocking_pids(s.pid)) > 0
           AND ${holderPid} = ANY(pg_blocking_pids(s.pid))
           AND s.query ILIKE '%assessment_run%'`)
      if (rows.length > 0) break
      if (Date.now() > deadline) { releaseFlip(); await holder; throw new Error('replay never observed blocked on the run row') }
      await new Promise(r => setTimeout(r, 50))
    }
    releaseFlip()
    await holder
    const resolved = await outcome
    expect(resolved.ok).toBe(true)
    expect((resolved.v as { replayed?: boolean }).replayed).toBe(true)
    expect((resolved.v as { runtimeBindingKind?: string }).runtimeBindingKind).toBe('COMPOSITE')
    // Test hygiene only: restore the run so later cases see a PUBLISHED run.
    await db.$executeRaw`UPDATE assessment_runs SET status='PUBLISHED', closed_at=NULL WHERE id=${runId}`
  }, 30000)

  it('execution REVOKED inside the envelope-lock window does not change the BOUND replay outcome (pinned behavior)', async () => {
    const exec = bound[2]
    const outcome = await interleave(exec.executionId,
      tx => tx.$executeRaw`UPDATE assessment_run_executions SET status='REVOKED' WHERE id=${exec.executionId}`,
      () => startAssessmentRunExecution({ executionId: exec.executionId, actorUserId: exec.actorUserId }))
    expect(outcome.ok).toBe(true)
    expect((outcome.value as { replayed?: boolean }).replayed).toBe(true)
  }, 30000)

  it('tx2 existing-branch end-to-end: frozen identity match attaches binding and dispatches the claim', async () => {
    const exec = unbound[1]
    const assignment = (await db.$queryRaw<Array<{ id: string; subjectUserId: string; respondentUserId: string; episodeId: string | null; status: string }>>`
      SELECT a.id, a.subject_user_id AS "subjectUserId", a.respondent_user_id AS "respondentUserId",
        a.episode_id AS "episodeId", a.status
      FROM assessment_run_executions e JOIN relational_assessment_assignments a ON a.id=e.relational_assignment_id
      WHERE e.id=${exec.executionId}`)[0]
    // Synthetic prior runtime mirroring the relational assignment (the frozen
    // admitted identity is derived from this assignment during admission).
    await db.compositeAssessmentAttempt.create({ data: {
      id: randomUUID(), participantKey: `${suffix}-pk-${exec.executionId.slice(0, 8)}`,
      compositeAssessmentId: compositeId, userId: exec.actorUserId, attemptNo: 1, status: 'IN_PROGRESS',
      subjectUserId: assignment.subjectUserId, respondentUserId: assignment.respondentUserId,
      respondentType: 'SELF' as never, episodeId: assignment.episodeId, assignmentRef: assignment.id } })
    await db.$executeRaw`UPDATE relational_assessment_assignments SET status='STARTED' WHERE id=${assignment.id}`
    const result = await startAssessmentRunExecution({ executionId: exec.executionId, actorUserId: exec.actorUserId, resourceRegistry: registry })
    expect(result.state).toBe('STARTED')
    expect(result.replayed).toBe(true)
    const binding = (await db.$queryRaw<Array<{ kind: string | null; ref: string | null }>>`
      SELECT runtime_binding_kind AS kind, runtime_binding_ref AS ref FROM assessment_run_executions WHERE id=${exec.executionId}`)[0]
    expect(binding.kind).toBe('COMPOSITE')
    expect(binding.ref).toBe(result.runtimeBindingRef)
    const claim = (await db.$queryRaw<Array<{ state: string }>>`
      SELECT state FROM assessment_run_execution_start_claims WHERE execution_id=${exec.executionId}`)[0]
    // The product advances the dispatched claim to its terminal state; both
    // are legitimate post-conditions of the existing-branch attach.
    expect(['DISPATCHED', 'COMPLETED']).toContain(claim.state)
    // Second call must take the tx1 BOUND fast path with the same binding.
    const replay = await startAssessmentRunExecution({ executionId: exec.executionId, actorUserId: exec.actorUserId })
    expect(replay.replayed).toBe(true)
    expect(replay.runtimeBindingRef).toBe(result.runtimeBindingRef)
  }, 60000)
})
