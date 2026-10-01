import { randomUUID } from 'node:crypto'
import { afterAll, describe, expect, it } from 'vitest'
import { UserRole } from '@prisma/client'
import { prisma } from '../../config/database'
import { integrationDatabaseUrl } from './integration-env'
import { createOrganization, createMembership, grantPersona } from '../../modules/organization/service'
import { createAssessmentRunDraft, addAssessmentRunTrackDraft } from '../../modules/assessment-run/repository'
import { publishAssessmentRun } from '../../modules/assessment-run/publish'
import { acquireRunExecutionStartClaim } from '../../modules/assessment-run/startClaim'
import { RunResourceAuthorityRegistry, type RunResourceAuthorityAdapter } from '../../modules/assessment-run/resourceAuthority'
import { canonicalHash } from '../../modules/assessment-runtime/canonical'

const url = integrationDatabaseUrl('RELEASE_INTEGRATION_DATABASE_URL', 'PR26_INTEGRATION_DATABASE_URL', 'COGNITIVE_INTEGRATION_DB_URL')
if (!url) throw new Error('START fence tests require an isolated PostgreSQL database')
afterAll(() => prisma.$disconnect())
const gate = () => {
  let release!: () => void
  const promise = new Promise<void>((resolve) => { release = resolve })
  return { promise, release }
}
const policy = {
  subjectRoles: ['STUDENT'], respondentRoles: ['STUDENT'], relationshipKinds: ['SELF'],
  perspectives: ['SELF_REPORT'], analysisMode: 'INDIVIDUAL_ONLY', visibilityPolicyKey: 'ORG_SELF_V1', minimumRespondents: null,
}
const adapter: RunResourceAuthorityAdapter = {
  family: 'BUNDLE',
  capabilities: { transactionMode: 'TRANSACTIONAL_DB', startMode: 'TRANSACTIONAL', supportsLookupByOperationKey: false,
    supportsSafeCancel: false, finalAuthority: 'CANONICAL_RUNTIME', runtimeBindingKind: 'COMPOSITE', runV1Enabled: true },
  async resolveExact(ref) {
    return { family: ref.family, key: ref.key, version: ref.version, scientificMaturity: 'PILOT',
      applicabilityHash: canonicalHash({ ref, policy }), ...policy,
      runtimeLaunchTarget: { kind: 'COMPOSITE', ref: 'start-fence-fixture' } }
  },
}
const registry = new RunResourceAuthorityRegistry([adapter])
const fixture = async (sameRun: boolean) => {
  const id = randomUUID()
  const owner = await prisma.user.create({ data: { username: `fence-owner-${id}`, passwordHash: 'test-only', role: UserRole.TEACHER, teacherApproved: true } })
  const org = await createOrganization({ name: `START fence ${id}`, meta: { actorUserId: owner.id, commandKey: randomUUID() } })
  const memberships: Array<{ id: string; userId: string }> = []
  for (let index = 0; index < 2; index += 1) {
    const student = await prisma.user.create({ data: { username: `fence-student-${index}-${id}`, passwordHash: 'test-only', role: UserRole.STUDENT } })
    const member = await createMembership({ organizationId: org.organization.id, userId: student.id, meta: { actorUserId: owner.id, commandKey: randomUUID() } })
    await grantPersona({ organizationId: org.organization.id, membershipId: member.id, persona: 'STUDENT', meta: { actorUserId: owner.id, commandKey: randomUUID() } })
    memberships.push({ id: member.id, userId: student.id })
  }
  const publish = async (selected: typeof memberships) => {
    const run = await createAssessmentRunDraft({ organizationId: org.organization.id, name: `fence ${randomUUID()}`, createdByUserId: owner.id })
    await addAssessmentRunTrackDraft({ organizationId: org.organization.id, runId: run.id,
      resource: { family: 'BUNDLE', key: `fence-${randomUUID()}`, version: '1.0.0' },
      subjectSelector: { kind: 'MEMBERSHIP_IDS', membershipIds: selected.map((member) => member.id) },
      respondentSelector: { kind: 'MEMBERSHIP_IDS', membershipIds: selected.map((member) => member.id) }, requestedPolicy: policy })
    await publishAssessmentRun({ organizationId: org.organization.id, runId: run.id, actorUserId: owner.id, expectedVersion: 2, resourceRegistry: registry })
    return prisma.$queryRaw<Array<{ executionId: string; actorUserId: string }>>`
      SELECT e.id AS "executionId", a.user_id AS "actorUserId"
      FROM assessment_run_executions e JOIN assessment_run_actor_snapshots a ON a.id=e.respondent_actor_snapshot_id
      WHERE e.run_id=${run.id} ORDER BY e.id
    `
  }
  return sameRun ? publish(memberships) : [...await publish([memberships[0]]), ...await publish([memberships[1]])]
}

const beforeDeadline = async <T>(promise: Promise<T>, timeoutMs: number): Promise<T> => {
  let timer: ReturnType<typeof setTimeout> | undefined
  try {
    return await Promise.race([promise, new Promise<never>((_, reject) => {
      timer = setTimeout(() => reject(new Error('database barrier did not converge')), timeoutMs)
    })])
  } finally { if (timer) clearTimeout(timer) }
}

describe('START authority fence barriers (real PostgreSQL)', () => {
  it('allows a slow but valid admission to pass the former 5-second transaction limit', async () => {
    const [execution] = await fixture(true)
    const slowRegistry = new RunResourceAuthorityRegistry([{ ...adapter, async resolveExact(ref) {
      await new Promise((resolve) => setTimeout(resolve, 5_500))
      return adapter.resolveExact(ref)
    } }])
    const decision = await acquireRunExecutionStartClaim({ ...execution, resourceRegistry: slowRegistry })
    expect(decision.kind).toBe('ACQUIRED')
  }, 30_000)

  it.each([true, false])('holds two unrelated START transactions open together (same Run=%s)', async (sameRun) => {
    const executions = await fixture(sameRun)
    expect(executions).toHaveLength(2)
    const bothInside = gate()
    const finish = gate()
    let arrivals = 0
    const gatedRegistry = new RunResourceAuthorityRegistry([{ ...adapter, async resolveExact(ref) {
      // Scientific freezing happens inside admission, after Organization, Run,
      // Execution and current account/relationship authority fences are held.
      arrivals += 1
      if (arrivals === 2) bothInside.release()
      await finish.promise
      return adapter.resolveExact(ref)
    } }])
    const starts = executions.map((execution) => acquireRunExecutionStartClaim({ ...execution, resourceRegistry: gatedRegistry })
      .then((value) => ({ ok: true as const, value }), (error: unknown) => ({ ok: false as const, error })))
    try {
      await beforeDeadline(bothInside.promise, 4_000)
      expect(arrivals).toBe(2)
    } finally { finish.release() }
    const results = await Promise.all(starts)
    expect(results.every((result) => result.ok && result.value.kind === 'ACQUIRED')).toBe(true)
  }, 30_000)

  it('does not extend account validity by waiting on a lock acquired before expiry', async () => {
    const [execution] = await fixture(true)
    await prisma.$executeRaw`UPDATE users SET expires_at=clock_timestamp()+INTERVAL '3 seconds' WHERE id=${execution.actorUserId}`
    const locked = gate()
    const unlock = gate()
    let holderPid = 0
    const holder = prisma.$transaction(async (tx) => {
      holderPid = (await tx.$queryRaw<Array<{ pid: number }>>`SELECT pg_backend_pid() AS pid`)[0].pid
      // No UPDATE: this avoids an EvalPlanQual re-evaluation masking a stale
      // statement_timestamp predicate in SELECT ... FOR SHARE.
      await tx.$queryRaw`SELECT id FROM users WHERE id=${execution.actorUserId} FOR UPDATE`
      locked.release()
      await unlock.promise
    }, { timeout: 15_000 })
    const holderOutcome = holder.then(() => undefined, (error: unknown) => error)
    await beforeDeadline(locked.promise, 5_000)
    const start = acquireRunExecutionStartClaim({ ...execution, resourceRegistry: registry })
      .then((value) => ({ ok: true as const, value }), (error: unknown) => ({ ok: false as const, error }))
    try {
      const until = Date.now() + 5_000
      let observed = false
      while (Date.now() < until) {
        const rows = await prisma.$queryRaw<Array<{ beforeExpiry: boolean }>>`
          SELECT a.query_start < u.expires_at AS "beforeExpiry"
          FROM pg_stat_activity a CROSS JOIN users u
          WHERE u.id=${execution.actorUserId} AND ${holderPid}=ANY(pg_blocking_pids(a.pid))
        `
        if (rows.length) {
          expect(rows[0].beforeExpiry).toBe(true)
          observed = true
          break
        }
        await new Promise((resolve) => setTimeout(resolve, 10))
      }
      expect(observed).toBe(true)
      await prisma.$queryRaw`SELECT pg_sleep(GREATEST(0, EXTRACT(EPOCH FROM (expires_at-clock_timestamp())))+0.02)::text FROM users WHERE id=${execution.actorUserId}`
    } finally { unlock.release() }
    expect(await holderOutcome).toBeUndefined()
    const result = await start
    expect(result.ok).toBe(false)
    if (!result.ok) expect(result.error).toMatchObject({ code: 'RUN_ACCOUNT_INACTIVE' })
    const claims = await prisma.$queryRaw<Array<{ n: number }>>`SELECT COUNT(*)::int AS n FROM assessment_run_execution_start_claims WHERE execution_id=${execution.executionId}`
    expect(claims[0].n).toBe(0)
  }, 30_000)
})
