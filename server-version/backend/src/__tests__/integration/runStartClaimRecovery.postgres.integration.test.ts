import {randomUUID} from 'node:crypto'
import {afterAll,beforeAll,describe,expect,it} from 'vitest'
import {prisma as db} from '../../config/database'
import {integrationDatabaseUrl,requireIsolatedReleaseDatabase} from './integration-env'
import {createCustomScaleDefinition,hashScaleDefinition} from '../../modules/scale/scale-definition'
import {publishRegisteredScaleFixture} from './registered-resource-fixture'
import {independentReviewer} from './independent-reviewer'
import {registerDescriptiveResource,transitionDescriptiveResource} from '../../modules/assessment-run/registeredResources'
import {changeTeacherScaleLicense} from '../../modules/huiteacher/scaleLicense.service'
import {SELF_GROUP_POLICY_KEY} from '../../modules/assessment-policy/self-group-contract'
import {createHuiteacherTarget,createHuiteacherEvent,createHuiteacherEventRunDraft,readHuiteacherEventRun,transitionHuiteacherEvent} from '../../modules/huiteacher/evaluation.service'
import {addTeacherRunTrack,publishTeacherRun} from '../../modules/huiteacher/run.service'
import {
  acquireRunExecutionStartClaim,
  markRunStartDispatchIntent,
  markRunStartUnknown,
  releaseRolledBackRunStartClaim,
  abortUndispatchedRunStartClaim,
} from '../../modules/assessment-run/startClaim'
import {startAssessmentRunExecution} from '../../modules/assessment-run/startExecution'

/**
 * Real-PostgreSQL verification of the Run START claim recovery protocol: a
 * classified rollback of the runtime dispatch transaction must leave the
 * committed CLAIMED row takeover-ready (shortened lease, intact
 * operationKey/generation), the retry must take over through the existing
 * generation CAS, and the whole cycle must produce exactly one Attempt.
 */
const DB_URL = integrationDatabaseUrl('RUN_START_RECOVERY_INTEGRATION_DATABASE_URL', 'PR26_INTEGRATION_DATABASE_URL', 'COGNITIVE_INTEGRATION_DB_URL')
const suite = DB_URL ? describe : describe.skip
if (DB_URL) requireIsolatedReleaseDatabase(DB_URL)

const claimRow = async (claimId: string) => {
  const rows = await db.$queryRaw<Array<{
    state: string; gen: number; op: string; lease: Date; dispatched: Date | null
  }>>`SELECT state, claim_generation AS gen, operation_key AS op, lease_until AS lease, dispatched_at AS dispatched
      FROM assessment_run_execution_start_claims WHERE id=${claimId}`
  return rows[0]
}

suite('Run START claim recovery on real PostgreSQL', () => {
  const prefix = `run-recovery-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`
  let execIds: string[] = []
  let userIds: string[] = []

  beforeAll(async () => {
    const root = await db.user.create({ data: {
      username: `${prefix}-root`, passwordHash: 'synthetic-only',
      accountDomain: 'TRAINING', platformRole: 'SYSTEM_ADMIN', role: 'ADMIN',
    } })
    const actor = { userId: root.id, platformRole: 'SYSTEM_ADMIN' as const }
    const definition = createCustomScaleDefinition()
    definition.respondentType = 'teacher_self_report'
    definition.source.title = 'Synthetic claim recovery source'
    definition.items = [{ itemCode: 'Q1', sortOrder: 0, content: '本次可获得的工作支持', type: 'single', required: true, responseSetKey: 'default', randomizeOptions: false }]
    definition.scoring.itemRules = [{ itemCode: 'Q1', transform: { type: 'identity' } }]
    definition.scoring.scores = [{ key: 'support', type: 'total', label: '支持体验', direction: 'descriptive', canonical: true, displayPrecision: 1, source: { type: 'items', aggregation: 'sum', items: [{ itemCode: 'Q1', weight: 1 }] } }]
    definition.report.primaryScoreKeys = ['support']; definition.report.scoreOrder = ['support']
    definition.report.audienceContract = { schemaVersion: 1, respondent: 'ADULT_SELF', audience: 'teacher', locale: 'zh-CN', longitudinalMetricKeys: [], qcReview: { reviewer: 'synthetic-independent-editor', reviewedAt: '2026-10-30T00:00:00.000Z', basis: 'Isolated software fixture; not actual scientific approval' } }
    definition.report.interpretations = [{ scoreKey: 'support', headline: '本次支持体验', source: { type: 'score_only' }, summary: '这道题只记录本次填写时对工作支持的主观体验，不能表示全部工作状态，也不能判断一名教师的教学水平。请结合最近一次具体的协作经历，回想哪些帮助解决了实际问题，哪些支持仍然缺少。可以把需要的资源、时间和沟通方式记录下来，与信任的同事讨论下一步可行行动。本结果不提供诊断、人口常模、绩效评价或因果结论。', bands: [], guidance: [{ category: 'reflection', text: '回想一次具体的支持经历。' }, { category: 'support', text: '与信任的同事沟通实际需求。' }] }]
    const scale = await db.scale.create({ data: {
      code: `${prefix}-scale`, name: 'Synthetic claim recovery source', creatorId: root.id,
      status: 'PUBLISHED', instrumentClass: 'CUSTOM_DESCRIPTIVE', definition, definitionHash: hashScaleDefinition(definition),
    } })
    await publishRegisteredScaleFixture(db, scale.id)
    const entry = await registerDescriptiveResource(actor, scale.id, 'TEACHER_GROUP')
    const reviewer = await independentReviewer(actor)
    await transitionDescriptiveResource(reviewer, entry.id, 'review')
    await transitionDescriptiveResource(actor, entry.id, 'publish')

    for (let i = 0; i < 10; i += 1) {
      const user = await db.user.create({ data: {
        username: `${prefix}-teacher-${i}`, passwordHash: 'synthetic-only',
        accountDomain: 'SCHOOL', role: 'TEACHER', teacherApproved: true,
      } })
      userIds.push(user.id)
    }
    const [manager] = userIds
    const organization = await db.organization.create({ data: {
      id: randomUUID(), name: 'Synthetic claim recovery organization',
      productDomain: 'SCHOOL', createdByUserId: manager,
    } })
    await db.educationProductEntitlement.create({ data: {
      organizationId: organization.id, product: 'HUITEACHER', grantedByUserId: root.id,
    } })
    for (const user of userIds) {
      const member = await db.organizationMembership.create({ data: {
        id: randomUUID(), organizationId: organization.id, userId: user, orgRole: 'MEMBER',
      } })
      await db.organizationPersonaGrant.create({ data: {
        id: randomUUID(), organizationId: organization.id, membershipId: member.id,
        persona: 'TEACHER', grantedByUserId: root.id,
      } })
      if (user === manager) await db.educationProductRoleGrant.create({ data: {
        id: randomUUID(), organizationId: organization.id, membershipId: member.id,
        product: 'HUITEACHER', role: 'PRODUCT_ADMIN', grantedByUserId: root.id,
      } })
    }
    const entryAdmin = await db.user.create({ data: {
      username: `${prefix}-entry`, passwordHash: 'synthetic-only',
      accountDomain: 'TRAINING', role: 'TEACHER', teacherApproved: true,
    } })
    await db.adminEntryGrant.create({ data: {
      id: randomUUID(), userId: entryAdmin.id, entry: 'HUITEACHER', grantedBy: root.id,
    } })
    await changeTeacherScaleLicense({ organizationId: organization.id, resourceId: entry.id, actorUserId: entryAdmin.id, action: 'GRANT' })

    const target = await createHuiteacherTarget({ organizationId: organization.id, actorUserId: manager, kind: 'ORGANIZATION', name: 'Claim recovery target' })
    const event = await createHuiteacherEvent({ organizationId: organization.id, actorUserId: manager, targetId: target.id, kind: 'ASSESSMENT', title: 'Claim recovery event' })
    const scope = { organizationId: organization.id, eventId: event.id, actorUserId: manager }
    const draft = await createHuiteacherEventRunDraft({ ...scope, name: 'Claim recovery run' })
    await addTeacherRunTrack({ ...scope,
      resource: { family: 'SCALE', key: entry.resource_key, version: entry.resource_version },
      subjectSelector: { kind: 'ALL_CURRENT' }, respondentSelector: { kind: 'ALL_CURRENT' },
      requestedPolicy: {
        subjectRoles: ['TEACHER'], respondentRoles: ['TEACHER'], relationshipKinds: ['SELF'],
        perspectives: ['SELF_REPORT'], analysisMode: 'COHORT_AGGREGATE',
        visibilityPolicyKey: SELF_GROUP_POLICY_KEY, minimumRespondents: entry.entry.applicability.minimumRespondents,
      },
    })
    await transitionHuiteacherEvent({ ...scope, action: 'OPEN', expectedVersion: 1 })
    const run = await readHuiteacherEventRun(scope)
    const published = await publishTeacherRun({ ...scope, expectedVersion: run.version })
    const rows = await db.$queryRaw<Array<{ id: string; userId: string }>>`
      SELECT e.id, r.user_id AS "userId"
      FROM assessment_run_executions e
      JOIN assessment_run_actor_snapshots r
        ON r.id = e.respondent_actor_snapshot_id AND r.organization_id = e.organization_id AND r.run_id = e.run_id
      WHERE e.organization_id = ${organization.id} AND e.run_id = ${draft.runId}`
    const byUser = new Map(rows.map((row) => [row.userId, row.id]))
    execIds = userIds.map((id) => byUser.get(id)!)
    expect(execIds.every(Boolean)).toBe(true)
  }, 180000)

  afterAll(async () => {
    await (await import('../../config/queue')).closeQueues(true)
    await db.$disconnect()
  })

  it('a classified rollback releases the lease, the retry takes over and creates exactly one Attempt', async () => {
    const [executionId, respondent] = [execIds[1], userIds[1]]
    const d1 = await acquireRunExecutionStartClaim({ executionId, actorUserId: respondent })
    if (d1.kind !== 'ACQUIRED') throw new Error(`expected ACQUIRED, got ${d1.kind}`)
    const before = await claimRow(d1.claim.id)
    expect(before.state).toBe('CLAIMED')
    expect(before.lease.getTime()).toBeGreaterThan(Date.now() + 20000)

    // The exact call the patch makes after a classified runtime rollback.
    const released = await releaseRolledBackRunStartClaim({
      claimId: d1.claim.id, executionId, generation: d1.claim.claimGeneration,
    })
    expect(released).toBe(true)
    const afterRelease = await claimRow(d1.claim.id)
    expect(afterRelease.state).toBe('CLAIMED')
    expect(afterRelease.gen).toBe(d1.claim.claimGeneration)
    expect(afterRelease.op).toBe(d1.claim.operationKey)
    expect(afterRelease.lease.getTime()).toBeLessThanOrEqual(Date.now() + 2000)
    expect(afterRelease.lease.getTime()).toBeLessThan(before.lease.getTime() - 10000)

    // The retry: existing generation CAS takes over and the full START completes.
    const started = await startAssessmentRunExecution({ executionId, actorUserId: respondent })
    if (started.state !== 'STARTED') throw new Error(`expected STARTED, got ${started.state}`)
    const finalRow = await claimRow(d1.claim.id)
    expect(finalRow.state).toBe('COMPLETED')
    expect(finalRow.gen).toBe(d1.claim.claimGeneration + 1)
    expect(finalRow.op).toBe(d1.claim.operationKey)

    // Exactly one Attempt for this respondent on this runtime target, bound
    // to the execution, with its frozen Scale child.
    const attempt = await db.compositeAssessmentAttempt.findUniqueOrThrow({ where: { id: started.runtimeBindingRef } })
    expect(attempt.userId).toBe(respondent)
    const sameTarget = await db.compositeAssessmentAttempt.count({
      where: { compositeAssessmentId: attempt.compositeAssessmentId, userId: respondent },
    })
    expect(sameTarget).toBe(1)
    expect(await db.assessment.count({ where: { compositeAttemptId: attempt.id } })).toBeGreaterThanOrEqual(1)

    // A further START replays the durable binding instead of a second Attempt.
    const replay = await startAssessmentRunExecution({ executionId, actorUserId: respondent })
    expect(replay.state).toBe('STARTED')
    expect(replay.runtimeBindingRef).toBe(started.runtimeBindingRef)
    expect(await db.compositeAssessmentAttempt.count({
      where: { compositeAssessmentId: attempt.compositeAssessmentId, userId: respondent },
    })).toBe(1)
  }, 120000)

  it('release never touches DISPATCHED or UNKNOWN claims', async () => {
    const [executionId, respondent] = [execIds[2], userIds[2]]
    const d = await acquireRunExecutionStartClaim({ executionId, actorUserId: respondent })
    if (d.kind !== 'ACQUIRED') throw new Error(`expected ACQUIRED, got ${d.kind}`)
    const dispatched = await markRunStartDispatchIntent({ claimId: d.claim.id, generation: d.claim.claimGeneration })
    const dispatchedRow = await claimRow(d.claim.id)
    expect(dispatchedRow.state).toBe('DISPATCHED')
    await expect(releaseRolledBackRunStartClaim({ claimId: d.claim.id, executionId, generation: d.claim.claimGeneration })).resolves.toBe(false)
    expect(await claimRow(d.claim.id)).toMatchObject({ state: 'DISPATCHED', lease: dispatched.leaseUntil })
    const unknown = await markRunStartUnknown({ claimId: d.claim.id, generation: d.claim.claimGeneration })
    await expect(releaseRolledBackRunStartClaim({ claimId: d.claim.id, executionId, generation: d.claim.claimGeneration })).resolves.toBe(false)
    expect((await claimRow(d.claim.id)).state).toBe(unknown.state)
  }, 120000)

  it('release never resurrects an ABORTED claim and takeover stays lifecycle-fenced', async () => {
    const [executionId, respondent] = [execIds[0], userIds[0]]
    const d = await acquireRunExecutionStartClaim({ executionId, actorUserId: respondent })
    if (d.kind !== 'ACQUIRED') throw new Error(`expected ACQUIRED, got ${d.kind}`)
    const aborted = await db.$transaction((tx) => abortUndispatchedRunStartClaim(tx, { executionId }))
    expect(aborted).toBe(true)
    const row = await claimRow(d.claim.id)
    await expect(releaseRolledBackRunStartClaim({ claimId: d.claim.id, executionId, generation: d.claim.claimGeneration })).resolves.toBe(false)
    expect(await claimRow(d.claim.id)).toMatchObject({ state: 'ABORTED', op: row.op })
    // Lifecycle arbitration stays authoritative: a later START is refused.
    await expect(startAssessmentRunExecution({ executionId, actorUserId: respondent }))
      .rejects.toMatchObject({ code: 'RUN_START_ABORTED' })
    expect(await db.compositeAssessmentAttempt.count({ where: { userId: respondent } })).toBe(0)
  }, 120000)

  it('release skips executions that already carry a runtime binding', async () => {
    const [executionId, respondent] = [execIds[3], userIds[3]]
    const d = await acquireRunExecutionStartClaim({ executionId, actorUserId: respondent })
    if (d.kind !== 'ACQUIRED') throw new Error(`expected ACQUIRED, got ${d.kind}`)
    await db.$executeRaw`UPDATE assessment_run_executions SET runtime_binding_kind='COMPOSITE', runtime_binding_ref='synthetic-binding' WHERE id=${executionId}`
    const boundLease = (await claimRow(d.claim.id)).lease
    await expect(releaseRolledBackRunStartClaim({ claimId: d.claim.id, executionId, generation: d.claim.claimGeneration })).resolves.toBe(false)
    expect((await claimRow(d.claim.id)).lease.getTime()).toBe(boundLease.getTime())
    await db.$executeRaw`UPDATE assessment_run_executions SET runtime_binding_kind=NULL, runtime_binding_ref=NULL WHERE id=${executionId}`
    await expect(releaseRolledBackRunStartClaim({ claimId: d.claim.id, executionId, generation: d.claim.claimGeneration })).resolves.toBe(true)
  }, 120000)

  it('two concurrent claims on one execution yield one owner and one IN_PROGRESS', async () => {
    const [executionId, respondent] = [execIds[4], userIds[4]]
    const decisions = await Promise.all([
      acquireRunExecutionStartClaim({ executionId, actorUserId: respondent }),
      acquireRunExecutionStartClaim({ executionId, actorUserId: respondent }),
    ])
    expect(decisions.map((d) => d.kind).sort()).toEqual(['ACQUIRED', 'IN_PROGRESS'])
  }, 120000)
})
