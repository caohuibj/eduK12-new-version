import { randomUUID } from 'node:crypto'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { PrismaClient, UserRole } from '@prisma/client'
import { integrationDatabaseUrl } from './integration-env'
import { createMembership, createOrganization, grantPersona } from '../../modules/organization/service'
import { addAssessmentRunTrackDraft, createAssessmentRunDraft } from '../../modules/assessment-run/repository'
import { publishAssessmentRun } from '../../modules/assessment-run/publish'
import { RunResourceAuthorityRegistry, type RunResourceAuthorityAdapter } from '../../modules/assessment-run/resourceAuthority'
import { acquireRunExecutionStartClaim as acquireClaim, markRunStartDispatchIntent, markRunStartUnknown } from '../../modules/assessment-run/startClaim'
import { cancelAssessmentRun, closeAssessmentRun } from '../../modules/assessment-run/lifecycle'
import { canonicalHash } from '../../modules/assessment-runtime/canonical'

const DB_URL = integrationDatabaseUrl('RELEASE_INTEGRATION_DATABASE_URL', 'PR26_INTEGRATION_DATABASE_URL', 'COGNITIVE_INTEGRATION_DB_URL')
const suite = DB_URL ? describe : describe.skip
let db: PrismaClient
const suffix = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`
const key = (label: string) => `run-life-${label}-${suffix}-${randomUUID()}`
const policy = {
  subjectRoles: ['STUDENT'], respondentRoles: ['STUDENT'], relationshipKinds: ['SELF'], perspectives: ['SELF_REPORT'],
  analysisMode: 'INDIVIDUAL_ONLY', visibilityPolicyKey: 'ORG_SELF_V1', minimumRespondents: null,
}
const adapter: RunResourceAuthorityAdapter = {
  family: 'BUNDLE',
  capabilities: {
    transactionMode: 'TRANSACTIONAL_DB', startMode: 'TRANSACTIONAL', supportsLookupByOperationKey: false,
    supportsSafeCancel: false, finalAuthority: 'CANONICAL_RUNTIME', runtimeBindingKind: 'COMPOSITE', runV1Enabled: true,
  },
  async resolveExact(ref) {
    return {
      family: ref.family, key: ref.key, version: ref.version, scientificMaturity: 'PILOT',
      applicabilityHash: canonicalHash({ ref, policy }), subjectRoles: ['STUDENT'], respondentRoles: ['STUDENT'],
      relationshipKinds: ['SELF'], perspectives: ['SELF_REPORT'], analysisMode: 'INDIVIDUAL_ONLY',
      visibilityPolicyKey: 'ORG_SELF_V1', minimumRespondents: null,
      runtimeLaunchTarget: { kind: 'COMPOSITE', ref: 'test-composite' },
    }
  },
}
const registry = new RunResourceAuthorityRegistry([adapter])
const acquireRunExecutionStartClaim = (input: Parameters<typeof acquireClaim>[0]) => acquireClaim({ ...input, resourceRegistry: registry })

async function createExecution(label: string) {
  const owner = await db.user.create({ data: { username: `life-owner-${label}-${suffix}-${randomUUID().slice(0, 8)}`, passwordHash: 'x', role: UserRole.TEACHER }, select: { id: true } })
  const student = await db.user.create({ data: { username: `life-student-${label}-${suffix}-${randomUUID().slice(0, 8)}`, passwordHash: 'x', role: UserRole.STUDENT }, select: { id: true } })
  const org = await createOrganization({ name: `life ${label} ${suffix}`, meta: { actorUserId: owner.id, commandKey: key(`${label}-org`) } })
  const membership = await createMembership({ organizationId: org.organization.id, userId: student.id, meta: { actorUserId: owner.id, commandKey: key(`${label}-member`) } })
  await grantPersona({ organizationId: org.organization.id, membershipId: membership.id, persona: 'STUDENT', meta: { actorUserId: owner.id, commandKey: key(`${label}-persona`) } })
  const run = await createAssessmentRunDraft({ organizationId: org.organization.id, name: label, createdByUserId: owner.id })
  await addAssessmentRunTrackDraft({ organizationId: org.organization.id, runId: run.id, resource: { family: 'BUNDLE', key: label, version: '1.0.0' }, subjectSelector: { kind: 'MEMBERSHIP_IDS', membershipIds: [membership.id] }, respondentSelector: { kind: 'MEMBERSHIP_IDS', membershipIds: [membership.id] }, requestedPolicy: policy })
  await publishAssessmentRun({ organizationId: org.organization.id, runId: run.id, actorUserId: owner.id, expectedVersion: 2, resourceRegistry: registry })
  const rows = await db.$queryRawUnsafe<Array<{ id: string }>>(`SELECT id FROM assessment_run_executions WHERE run_id=$1`, run.id)
  return { organizationId: org.organization.id, runId: run.id, executionId: rows[0].id, actorUserId: student.id }
}

suite('Assessment Run close/cancel arbitration (real PostgreSQL)', () => {
  beforeAll(async () => {
    db = new PrismaClient({ datasources: { db: { url: DB_URL! } } })
    await db.$connect()
  })
  afterAll(async () => db.$disconnect())

  it('closes new intake without expiring an admitted undispatched claim', async () => {
    const fixture = await createExecution('close-claimed')
    const claim = await acquireRunExecutionStartClaim({ executionId: fixture.executionId, actorUserId: fixture.actorUserId })
    expect(claim.kind).toBe('ACQUIRED')
    await expect(closeAssessmentRun(fixture)).resolves.toEqual({ status: 'CLOSED' })
    const rows = await db.$queryRawUnsafe<Array<{ runStatus: string; executionStatus: string; claimState: string }>>(
      `SELECT r.status AS "runStatus", e.status AS "executionStatus", c.state AS "claimState" FROM assessment_runs r JOIN assessment_run_executions e ON e.run_id=r.id JOIN assessment_run_execution_start_claims c ON c.execution_id=e.id WHERE e.id=$1`, fixture.executionId,
    )
    expect(rows[0]).toEqual({ runStatus: 'CLOSED', executionStatus: 'ASSIGNED', claimState: 'CLAIMED' })
    await expect(acquireRunExecutionStartClaim({ executionId: fixture.executionId, actorUserId: fixture.actorUserId }))
      .resolves.toMatchObject({ kind: 'IN_PROGRESS' })
  })

  it('closes intake while preserving UNKNOWN for recovery', async () => {
    const fixture = await createExecution('close-unknown')
    const acquired = await acquireRunExecutionStartClaim({ executionId: fixture.executionId, actorUserId: fixture.actorUserId })
    if (acquired.kind !== 'ACQUIRED') throw new Error('expected acquired')
    const dispatched = await markRunStartDispatchIntent({ claimId: acquired.claim.id, generation: acquired.claim.claimGeneration })
    await markRunStartUnknown({ claimId: dispatched.id, generation: dispatched.claimGeneration })
    await expect(closeAssessmentRun(fixture)).resolves.toEqual({ status: 'CLOSED' })
    const run = await db.$queryRawUnsafe<Array<{ status: string }>>(`SELECT status FROM assessment_runs WHERE id=$1`, fixture.runId)
    expect(run[0].status).toBe('CLOSED')
  })

  it('refuses cancellation when an active runtime binding exists instead of manufacturing cancellation', async () => {
    const fixture = await createExecution('cancel-active')
    await db.$executeRawUnsafe(
      `UPDATE assessment_run_executions SET status='STARTED', runtime_binding_kind='COMPOSITE', runtime_binding_ref=$1, started_at=NOW() WHERE id=$2`,
      `active-${randomUUID()}`, fixture.executionId,
    )
    await expect(cancelAssessmentRun(fixture)).rejects.toMatchObject({ code: 'RUN_CANCEL_RUNTIME_ACTIVE' })
    const run = await db.$queryRawUnsafe<Array<{ status: string }>>(`SELECT status FROM assessment_runs WHERE id=$1`, fixture.runId)
    expect(run[0].status).toBe('PUBLISHED')
  })

  it('lets authoritative completion win over later Run cancellation', async () => {
    const fixture = await createExecution('final-wins')
    const binding = `completed-${randomUUID()}`
    await db.$executeRawUnsafe(
      `UPDATE assessment_run_executions SET status='COMPLETED', runtime_binding_kind='COMPOSITE', runtime_binding_ref=$1, started_at=NOW()-INTERVAL '1 minute', completed_at=NOW() WHERE id=$2`,
      binding, fixture.executionId,
    )
    await expect(cancelAssessmentRun(fixture)).resolves.toEqual({ status: 'CANCELLED' })
    const execution = await db.$queryRawUnsafe<Array<{ status: string; runtimeBindingRef: string }>>(
      `SELECT status, runtime_binding_ref AS "runtimeBindingRef" FROM assessment_run_executions WHERE id=$1`, fixture.executionId,
    )
    expect(execution[0]).toEqual({ status: 'COMPLETED', runtimeBindingRef: binding })
  })
})
