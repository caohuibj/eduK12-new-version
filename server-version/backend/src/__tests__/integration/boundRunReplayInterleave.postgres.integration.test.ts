import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { Prisma, PrismaClient } from '@prisma/client'
import { randomUUID } from 'node:crypto'
import { prisma as db } from '../../config/database'
import { integrationDatabaseUrl, requireIsolatedReleaseDatabase } from './integration-env'
import { startAssessmentRunExecution } from '../../modules/assessment-run/startExecution'
import { acquireRunExecutionStartClaim } from '../../modules/assessment-run/startClaim'
import { RunResourceAuthorityRegistry, type RunResourcePolicy, type RunResourceRef } from '../../modules/assessment-run/resourceAuthority'
import { canonicalHash } from '../../modules/assessment-runtime/canonical'
import { createOrganization, createMembership, grantPersona } from '../../modules/organization/service'
import { createAssessmentRunDraft, addAssessmentRunTrackDraft } from '../../modules/assessment-run/repository'
import { publishAssessmentRun } from '../../modules/assessment-run/publish'
import { rolledBackStartReason } from '../../modules/composite/start-transient'

/**
 * BOUND Run replay governance matrix with deterministic interleaving (real
 * PostgreSQL, tx1 + tx2 existing-branch end-to-end).
 *
 * Product decisions D-1 / D-2 (2026-11-06, see bound-replay-decision.md §6):
 * a Run CLOSE (D-1) or execution REVOKED (D-2) committed inside the
 * envelope-lock window does NOT change the replay outcome, because the BOUND
 * branch performs no status checks — revocation blocks only new intake,
 * already-bound work finishes. D-2 additionally records that REVOKED has no
 * production writer; the REVOKED case below is a defensive pin, not
 * production evidence. Each interleave holds the execution row, issues the
 * replay, OBSERVES it blocked on an assessment_run_executions query owned by
 * the holder, commits the state flip in the same transaction, then asserts
 * the preserved outcome.
 */
const DB_URL = integrationDatabaseUrl('TRAINING_START_ADMISSION_INTEGRATION_DATABASE_URL', 'PR26_INTEGRATION_DATABASE_URL', 'COGNITIVE_INTEGRATION_DB_URL')
const suite = DB_URL ? describe : describe.skip
if (DB_URL) requireIsolatedReleaseDatabase(DB_URL)

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
  const createdUserIds: string[] = []
  const observer = new PrismaClient({ datasources: { db: { url: DB_URL } } })
  const registry = new RunResourceAuthorityRegistry([{
    family: 'BUNDLE',
    capabilities: { transactionMode: 'TRANSACTIONAL_DB', startMode: 'TRANSACTIONAL', supportsLookupByOperationKey: false,
      supportsSafeCancel: false, finalAuthority: 'CANONICAL_RUNTIME', runtimeBindingKind: 'COMPOSITE', runV1Enabled: true },
    async resolveExact(ref: RunResourceRef): Promise<RunResourcePolicy> {
      return { family: ref.family, key: ref.key, version: ref.version, scientificMaturity: 'PILOT',
        applicabilityHash: canonicalHash({ ref, policy }), ...policy,
        runtimeLaunchTarget: { kind: 'COMPOSITE', ref: compositeId } }
    },
  }])

  // publishAssessmentRun runs at Serializable isolation, so two concurrent
  // publishes (e.g. this suite running beside another integration file in the
  // same vitest invocation) can abort each other with 40001. That is a
  // transient serialization abort by definition, not a product failure; retry
  // the publish, mirroring the production START path's transient handling.
  const publishAssessmentRunWithRetry = async (args: Parameters<typeof publishAssessmentRun>[0]): Promise<void> => {
    for (let attempt = 0; attempt < 3; attempt++) {
      try { await publishAssessmentRun(args); return }
      catch (e: unknown) {
        // P2-04: classify with the shared START transient classifier, not a
        // bare top-level code check. Prisma surfaces a serialization conflict
        // as P2034 or as P2010 with the SQLSTATE in meta.code; a business
        // error must never be retried. The last error is rethrown as-is.
        if (rolledBackStartReason(e) !== null && attempt < 2) continue
        throw e
      }
    }
  }

  const bindExecution = async (executionId: string, actorUserId: string): Promise<void> => {
    const d = await acquireRunExecutionStartClaim({ executionId, actorUserId, resourceRegistry: registry })
    if (d.kind !== 'ACQUIRED') throw new Error(`bind precondition got ${d.kind}`)
    await db.$executeRaw`UPDATE assessment_run_executions SET runtime_binding_kind='COMPOSITE', runtime_binding_ref=${randomUUID()}, status='STARTED' WHERE id=${executionId}`
    await db.$executeRaw`UPDATE assessment_run_execution_start_claims SET state='DISPATCHED', dispatched_at=transaction_timestamp(), updated_at=transaction_timestamp() WHERE execution_id=${executionId}`
  }

  type Tx = Parameters<Parameters<typeof db.$transaction>[0]>[0]
  /** `hold` takes the row lock in a test-owned transaction; the replay is then
   * issued and OBSERVED Lock-waiting on a query matching `blockedQuery` that is
   * blocked by this holder PID (deadline fails the case); `flip` runs in the
   * same transaction, which then commits; the replay outcome is returned.
   * Holder and replay are settled on every path before returning. */
  const interleave = async (hold: (tx: Tx) => Promise<unknown>, flip: (tx: Tx) => Promise<unknown>,
    probe: () => Promise<unknown>, blockedQuery: string): Promise<{ ok: boolean; value?: unknown; message?: string }> => {
    let ready!: () => void
    const held = new Promise<void>(r => { ready = r })
    let releaseFlip!: () => void
    const flipGate = new Promise<void>(r => { releaseFlip = r })
    let holderPid = 0
    const holder = db.$transaction(async tx => {
      const [pidRow] = await tx.$queryRawUnsafe<Array<{ pid: number }>>('SELECT pg_backend_pid() AS pid')
      holderPid = pidRow.pid
      await hold(tx)
      ready()
      await flipGate
      await flip(tx)
    }, { maxWait: 10000, timeout: 30000 })
    let outcome: Promise<{ ok: boolean; value?: unknown; message?: string }> | undefined
    try {
      // A holder that fails before signalling surfaces here instead of hanging.
      await Promise.race([held, holder.then(() => { throw new Error('holder ended before taking the row lock') })])
      outcome = probe()
        .then(v => ({ ok: true as const, value: v }))
        .catch((e: { code?: string; message?: string }) => ({ ok: false as const, message: String(e.code ?? e.message ?? 'error') }))
      const deadline = Date.now() + 15000
      for (;;) {
        const rows = await observer.$queryRawUnsafe<Array<{ pid: number }>>(
          `SELECT s.pid FROM pg_stat_activity s
           WHERE s.wait_event_type = 'Lock' AND ${holderPid} = ANY(pg_blocking_pids(s.pid))
             AND s.query ILIKE $1`, blockedQuery)
        if (rows.length > 0) break
        if (Date.now() > deadline) throw new Error(`replay never observed blocked on ${blockedQuery}`)
        await new Promise(r => setTimeout(r, 50))
      }
      releaseFlip()
      await holder
      return await outcome
    } finally {
      releaseFlip()
      await Promise.allSettled([holder, ...(outcome ? [outcome] : [])])
    }
  }

  beforeAll(async () => {
    const owner = await db.user.create({ data: { username: `${suffix}-owner`, passwordHash: 'SYNTHETIC NONLOGIN', role: 'TEACHER', teacherApproved: true, accountDomain: 'LEGACY' } })
    ownerUserId = owner.id
    createdUserIds.push(owner.id)
    await db.user.create({ data: { id: strangerId, username: strangerId, passwordHash: 'SYNTHETIC NONLOGIN', role: 'STUDENT', accountDomain: 'LEGACY' } })
    createdUserIds.push(strangerId)
    const org = await createOrganization({ name: `${suffix} org`, meta: { actorUserId: owner.id, commandKey: randomUUID() } })
    organizationId = org.organization.id
    const memberships: Array<{ membershipId: string; userId: string }> = []
    for (let i = 0; i < 8; i++) {
      const student = await db.user.create({ data: { username: `${suffix}-s${i}`, passwordHash: 'SYNTHETIC NONLOGIN', role: 'STUDENT', accountDomain: 'LEGACY' } })
      createdUserIds.push(student.id)
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
    await publishAssessmentRunWithRetry({ organizationId, runId: run.id, actorUserId: owner.id, expectedVersion: 2, resourceRegistry: registry })
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
      // Exact this-run cleanup (FK order) of every deletable row; a failure
      // here is a real defect and fails the suite. The run/tracks/actor
      // snapshots, episode allocations, organization, memberships/personas and
      // users stay in the
      // disposable isolated database: they are anchored by FKs from episode
      // rows and append-only organization governance audit rows.
      if (compositeId) {
        await db.compositeAssessmentAttempt.deleteMany({ where: { compositeAssessmentId: compositeId } })
        await db.compositeAssessment.deleteMany({ where: { id: compositeId } })
      }
      if (runId) {
        await db.$executeRaw`DELETE FROM assessment_run_execution_start_claims WHERE execution_id IN (SELECT id FROM assessment_run_executions WHERE run_id=${runId})`
        const assignments = await db.$queryRaw<Array<{ id: string }>>`
          SELECT relational_assignment_id AS id FROM assessment_run_executions WHERE run_id=${runId} AND relational_assignment_id IS NOT NULL`
        await db.$executeRaw`DELETE FROM assessment_run_executions WHERE run_id=${runId}`
        if (assignments.length) await db.$executeRaw`DELETE FROM relational_assessment_assignments WHERE id IN (${Prisma.join(assignments.map(a => a.id))})`
        await db.$executeRaw`DELETE FROM assessment_run_relationship_snapshots WHERE run_id=${runId}`
      }
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

  it('Run CLOSE committed inside the envelope-lock window does not change the BOUND replay outcome (decision D-1, 2026-11-06)', async () => {
    const exec = bound[1]
    // The holder starts at the RUN row (the CLOSE UPDATE itself), matching the
    // product closeAssessmentRun lock order (Run -> Executions); the replay is
    // observed blocked behind it, the CLOSE commits, and the replay then
    // re-reads governance under its own envelope locks.
    try {
      const outcome = await interleave(
        tx => tx.$executeRaw`UPDATE assessment_runs SET status='CLOSED', closed_at=transaction_timestamp() WHERE id=${runId}`,
        async () => undefined,
        () => startAssessmentRunExecution({ executionId: exec.executionId, actorUserId: exec.actorUserId }),
        '%assessment_run%')
      expect(outcome.ok).toBe(true)
      expect((outcome.value as { replayed?: boolean }).replayed).toBe(true)
      expect((outcome.value as { runtimeBindingKind?: string }).runtimeBindingKind).toBe('COMPOSITE')
    } finally {
      // Test hygiene only: restore the run so later cases see a PUBLISHED run.
      await db.$executeRaw`UPDATE assessment_runs SET status='PUBLISHED', closed_at=NULL WHERE id=${runId}`
    }
  }, 30000)

  it('execution REVOKED inside the envelope-lock window does not change the BOUND replay outcome (decision D-2, 2026-11-06; defensive pin, no production writer)', async () => {
    const exec = bound[2]
    const outcome = await interleave(
      tx => tx.$queryRaw`SELECT id FROM assessment_run_executions WHERE id=${exec.executionId} FOR UPDATE`,
      tx => tx.$executeRaw`UPDATE assessment_run_executions SET status='REVOKED' WHERE id=${exec.executionId}`,
      () => startAssessmentRunExecution({ executionId: exec.executionId, actorUserId: exec.actorUserId }),
      '%assessment_run_executions%')
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
    if (result.state !== 'STARTED') throw new Error(`expected STARTED, got ${result.state}`)
    expect(result.replayed).toBe(true)
    const binding = (await db.$queryRaw<Array<{ kind: string | null; ref: string | null }>>`
      SELECT runtime_binding_kind AS kind, runtime_binding_ref AS ref FROM assessment_run_executions WHERE id=${exec.executionId}`)[0]
    expect(binding.kind).toBe('COMPOSITE')
    expect(binding.ref).toBe(result.runtimeBindingRef)
    const claim = (await db.$queryRaw<Array<{ state: string }>>`
      SELECT state FROM assessment_run_execution_start_claims WHERE execution_id=${exec.executionId}`)[0]
    // B-15: the success path's only legitimate final claim state is
    // COMPLETED (attachBindingInTransaction calls markRunStartClaimCompleted).
    // A DISPATCHED claim here would mean the completion step did not run.
    expect(claim.state).toBe('COMPLETED')
    // Second call must take the tx1 BOUND fast path with the same binding.
    const replay = await startAssessmentRunExecution({ executionId: exec.executionId, actorUserId: exec.actorUserId })
    if (replay.state !== 'STARTED') throw new Error(`expected STARTED replay, got ${replay.state}`)
    expect(replay.replayed).toBe(true)
    expect(replay.runtimeBindingRef).toBe(result.runtimeBindingRef)
  }, 60000)
})
