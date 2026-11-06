import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { Prisma, PrismaClient } from '@prisma/client'
import { randomUUID } from 'node:crypto'
import { prisma as db } from '../../config/database'
import { integrationDatabaseUrl, requireIsolatedReleaseDatabase } from './integration-env'
import { startAssessmentRunExecution } from '../../modules/assessment-run/startExecution'
import { acquireRunExecutionStartClaim } from '../../modules/assessment-run/startClaim'
import { closeAssessmentRun } from '../../modules/assessment-run/lifecycle'
import { RunResourceAuthorityRegistry, type RunResourcePolicy, type RunResourceRef } from '../../modules/assessment-run/resourceAuthority'
import { canonicalHash } from '../../modules/assessment-runtime/canonical'
import { createOrganization, createMembership, grantPersona } from '../../modules/organization/service'
import { createAssessmentRunDraft, addAssessmentRunTrackDraft } from '../../modules/assessment-run/repository'
import { publishAssessmentRun } from '../../modules/assessment-run/publish'
import { finalizeCompositeAttemptIfReady, getAttemptState, getReport, restartUserAttempt, startUserAttempt } from '../../modules/composite/composite.service'
import { submitCompositeFormSectionFinal } from '../../modules/composite/final-submit.service'

/**
 * PR-2 / B-16: BOUND replay against a REAL attempt created by real admission.
 *
 * The #645 interleave suite pins replay semantics with SYNTHETIC bindings
 * (hand-inserted attempt rows / random-UUID runtime refs). This suite closes
 * that evidence gap: the attempt is created by the real dispatch
 * (startAssessmentRunExecution -> startRelationalCompositeAttemptInTransaction),
 * the Run is closed by the real closeAssessmentRun, and the three layers are
 * asserted against the returned runtimeBindingRef:
 *   L1 START return value after CLOSE,
 *   L2 read (getAttemptState) + fill (form-section FINAL submit),
 *   L3 submit completion + report read.
 *
 * Product decisions exercised (2026-11-06, bound-replay-decision.md §6):
 * D-1 (CLOSE blocks only new START, replay finishes), D-9 (CLOSE terminates
 * a CLAIMED-but-undispatched execution), D-7 (restart counts toward
 * maxAttempts on every composite).
 */
const DB_URL = integrationDatabaseUrl('TRAINING_START_ADMISSION_INTEGRATION_DATABASE_URL', 'PR26_INTEGRATION_DATABASE_URL', 'COGNITIVE_INTEGRATION_DB_URL')
const suite = DB_URL ? describe : describe.skip
if (DB_URL) requireIsolatedReleaseDatabase(DB_URL)

const policy = {
  subjectRoles: ['STUDENT'], respondentRoles: ['STUDENT'], relationshipKinds: ['SELF'],
  perspectives: ['SELF_REPORT'], analysisMode: 'INDIVIDUAL_ONLY', visibilityPolicyKey: 'ORG_SELF_V1', minimumRespondents: null,
}

suite('BOUND replay against a real binding (real PostgreSQL)', () => {
  const suffix = `bound-real-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`
  let organizationId = ''
  let ownerUserId = ''
  let courseId = ''
  let compositeId = ''
  let formSectionId = ''
  let formItemId = ''
  let runId = ''
  let d9RunId = ''
  let d7CompositeId = ''
  let execA = { executionId: '', actorUserId: '' }
  let execB = { executionId: '', actorUserId: '' }
  const studentA = `${suffix}-student-a`
  const studentB = `${suffix}-student-b`
  const createdUserIds: string[] = []
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
  const publishRunWithRetry = async (args: Parameters<typeof publishAssessmentRun>[0]): Promise<void> => {
    for (let attempt = 0; attempt < 3; attempt++) {
      try { await publishAssessmentRun(args); return }
      catch (e: unknown) {
        if ((e as { code?: string }).code === '40001' && attempt < 2) continue
        throw e
      }
    }
  }

  const makeRun = async (membershipIds: string[], name: string): Promise<string> => {
    const run = await createAssessmentRunDraft({ organizationId, name: `${suffix} ${name}`, createdByUserId: ownerUserId })
    await addAssessmentRunTrackDraft({ organizationId, runId: run.id,
      resource: { family: 'BUNDLE', key: `${suffix}-res-${name}`, version: '1.0.0' },
      subjectSelector: { kind: 'MEMBERSHIP_IDS', membershipIds },
      respondentSelector: { kind: 'MEMBERSHIP_IDS', membershipIds }, requestedPolicy: policy })
    await publishRunWithRetry({ organizationId, runId: run.id, actorUserId: ownerUserId, expectedVersion: 2, resourceRegistry: registry })
    return run.id
  }

  const executionOf = async (run: string): Promise<{ executionId: string; actorUserId: string }> => {
    const rows = await db.$queryRaw<Array<{ executionId: string; userId: string }>>`
      SELECT e.id AS "executionId", a.user_id AS "userId"
      FROM assessment_run_executions e JOIN assessment_run_actor_snapshots a ON a.id=e.respondent_actor_snapshot_id
      WHERE e.run_id=${run} ORDER BY e.id LIMIT 1`
    if (!rows[0]) throw new Error(`no execution for run ${run}`)
    return { executionId: rows[0].executionId, actorUserId: rows[0].userId }
  }

  beforeAll(async () => {
    const owner = await db.user.create({ data: { username: `${suffix}-owner`, passwordHash: 'SYNTHETIC NONLOGIN', role: 'TEACHER', teacherApproved: true, accountDomain: 'LEGACY' } })
    ownerUserId = owner.id
    createdUserIds.push(owner.id)
    const org = await createOrganization({ name: `${suffix} org`, meta: { actorUserId: owner.id, commandKey: randomUUID() } })
    organizationId = org.organization.id
    const membershipIds: Record<string, string> = {}
    for (const student of [studentA, studentB]) {
      const user = await db.user.create({ data: { id: student, username: student, passwordHash: 'SYNTHETIC NONLOGIN', role: 'STUDENT', accountDomain: 'LEGACY' } })
      createdUserIds.push(user.id)
      const m = await createMembership({ organizationId, userId: user.id, meta: { actorUserId: owner.id, commandKey: randomUUID() } })
      await grantPersona({ organizationId, membershipId: m.id, persona: 'STUDENT', meta: { actorUserId: owner.id, commandKey: randomUUID() } })
      membershipIds[student] = m.id
    }
    const course = await db.course.create({ data: { creatorId: owner.id, title: `bound-real course ${suffix}`, courseType: 'TRAINING_COURSE', courseCode: `BR-${suffix}`, status: 'PUBLISHED' } })
    courseId = course.id
    await db.courseStudent.create({ data: { courseId, studentId: studentA, status: 'ACTIVE' } })
    // Direct inserts (same as the sibling boundRunReplayInterleave suite):
    // product.create would stamp a training persistence/feedback policy, and
    // createAttempt rejects a Run (relational-identity) dispatch for such a
    // composite ("此投放不支持 Training 冻结策略"). A plain QUESTIONNAIRE with
    // no training policy columns is what the Run dispatch accepts.
    const makeFormComposite = async (name: string, maxAttempts: number) => {
      const composite = await db.compositeAssessment.create({ data: {
        code: `${suffix}-${name}`, name, createdBy: ownerUserId,
        productKind: 'QUESTIONNAIRE', questionnaireType: 'COURSE', status: 'PUBLISHED', maxAttempts } })
      const section = await db.compositeFormSection.create({ data: {
        compositeAssessmentId: composite.id, title: `${name} section`, position: 0, contextSection: false } })
      const item = await db.compositeAssessmentItem.create({ data: {
        compositeAssessmentId: composite.id, type: 'FORM', position: 0, required: true,
        formType: 'text_input', formLabel: `${name} answer`, formSectionId: section.id, formSectionPosition: 0 } })
      await db.questionnaireCourseDelivery.create({ data: { compositeId: composite.id, courseId } })
      return { composite, section, item }
    }
    const main = await makeFormComposite('bound-real', 3)
    compositeId = main.composite.id
    formSectionId = main.section.id
    formItemId = main.item.id
    runId = await makeRun([membershipIds[studentA]], 'real-binding')
    execA = await executionOf(runId)
    d9RunId = await makeRun([membershipIds[studentB]], 'd9-close')
    execB = await executionOf(d9RunId)
    const d7 = await makeFormComposite('d7-restart', 1)
    d7CompositeId = d7.composite.id
  }, 240000)

  afterAll(async () => {
    try {
      const attempts = await db.compositeAssessmentAttempt.findMany({ where: { compositeAssessmentId: { in: [compositeId, d7CompositeId] } }, select: { id: true } })
      const attemptIds = attempts.map(a => a.id)
      if (attemptIds.length) {
        await db.assessmentUnitSnapshot.deleteMany({ where: { compositeAttemptId: { in: attemptIds } } })
        await db.assessment.deleteMany({ where: { compositeAttemptId: { in: attemptIds } } })
        await db.compositeAssessmentAttempt.deleteMany({ where: { id: { in: attemptIds } } })
      }
      for (const run of [runId, d9RunId]) {
        if (!run) continue
        await db.$executeRaw`DELETE FROM assessment_run_execution_start_claims WHERE execution_id IN (SELECT id FROM assessment_run_executions WHERE run_id=${run})`
        const assignments = await db.$queryRaw<Array<{ id: string }>>`
          SELECT relational_assignment_id AS id FROM assessment_run_executions WHERE run_id=${run} AND relational_assignment_id IS NOT NULL`
        await db.$executeRaw`DELETE FROM assessment_run_executions WHERE run_id=${run}`
        if (assignments.length) await db.$executeRaw`DELETE FROM relational_assessment_assignments WHERE id IN (${Prisma.join(assignments.map(a => a.id))})`
        await db.$executeRaw`DELETE FROM assessment_run_relationship_snapshots WHERE run_id=${run}`
      }
      if (compositeId || d7CompositeId) await db.compositeAssessment.deleteMany({ where: { id: { in: [compositeId, d7CompositeId].filter(Boolean) } } })
      // The course, its enrollments, the organization, memberships/personas
      // and users stay in the disposable isolated database: they are anchored
      // by FKs from organization governance audit rows (same as the sibling
      // boundRunReplayInterleave suite).
    } finally {
      await (await import('../../config/queue')).closeQueues(true)
      await db.$disconnect()
    }
  }, 120000)

  it('three layers after CLOSE: START replay + runtime read/fill + submit + report read on the real binding (D-1)', async () => {
    // Real admission: the dispatch creates a real composite attempt row.
    const first = await startAssessmentRunExecution({ executionId: execA.executionId, actorUserId: execA.actorUserId, resourceRegistry: registry })
    expect(first.state).toBe('STARTED')
    expect((first as { replayed?: boolean }).replayed).toBe(false)
    expect((first as { runtimeBindingKind?: string }).runtimeBindingKind).toBe('COMPOSITE')
    const ref = (first as { runtimeBindingRef: string }).runtimeBindingRef
    const attemptRow = await db.compositeAssessmentAttempt.findUniqueOrThrow({ where: { id: ref } })
    expect(attemptRow.compositeAssessmentId).toBe(compositeId)
    expect(attemptRow.userId).toBe(execA.actorUserId)
    expect(attemptRow.status).toBe('IN_PROGRESS')

    // The Run is closed by the real lifecycle service (D-1: CLOSE blocks only
    // new STARTs; the bound execution is untouched).
    await closeAssessmentRun({ organizationId, runId })

    // L1: START after CLOSE returns the same real binding.
    const replay = await startAssessmentRunExecution({ executionId: execA.executionId, actorUserId: execA.actorUserId, resourceRegistry: registry })
    expect(replay.state).toBe('STARTED')
    expect((replay as { replayed?: boolean }).replayed).toBe(true)
    expect((replay as { runtimeBindingRef: string }).runtimeBindingRef).toBe(ref)

    // L2 read: the returned ref loads through the real runtime read path.
    const state = await getAttemptState(ref, { userId: execA.actorUserId })
    expect((state as { id: string }).id).toBe(ref)
    expect((state as { status: string }).status).toBe('IN_PROGRESS')
    const definitionHash = (state as { currentItem?: { definitionHash?: string } }).currentItem?.definitionHash
    expect(definitionHash).toBeTruthy()

    // L2 fill + L3 submit: the form-section FINAL submit runs against the
    // real attempt, then the report reads back.
    const submitted = await submitCompositeFormSectionFinal({
      attemptId: ref, sectionId: formSectionId, userId: execA.actorUserId,
      submissionId: randomUUID(), attemptEpoch: attemptRow.attemptEpoch,
      definitionHash: definitionHash!,
      answers: [{ formItemId, value: 'real binding answer' }],
    })
    expect(submitted).toBeTruthy()
    // L3 submit: the section FINAL is in, so the real finalizer completes
    // the attempt (the same step the runtime read path triggers).
    const finalized = await finalizeCompositeAttemptIfReady(ref)
    expect(finalized?.status).toBe('COMPLETED')
    const finalRow = await db.compositeAssessmentAttempt.findUniqueOrThrow({ where: { id: ref } })
    expect(finalRow.status).toBe('COMPLETED')
    const report = await getReport(ref, { userId: execA.actorUserId })
    expect(report).toBeTruthy()
  }, 120000)

  it('CLOSE terminates a CLAIMED-but-undispatched execution: EXPIRED + claim ABORTED (D-9)', async () => {
    const decision = await acquireRunExecutionStartClaim({ executionId: execB.executionId, actorUserId: execB.actorUserId, resourceRegistry: registry })
    expect(decision.kind).toBe('ACQUIRED')
    const before = await db.$queryRaw<Array<{ status: string }>>`SELECT status FROM assessment_run_executions WHERE id=${execB.executionId}`
    expect(before[0].status).toBe('ASSIGNED')
    await closeAssessmentRun({ organizationId, runId: d9RunId })
    const execution = await db.$queryRaw<Array<{ status: string }>>`SELECT status FROM assessment_run_executions WHERE id=${execB.executionId}`
    expect(execution[0].status).toBe('EXPIRED')
    const claim = await db.$queryRaw<Array<{ state: string }>>`SELECT state FROM assessment_run_execution_start_claims WHERE execution_id=${execB.executionId}`
    expect(claim[0].state).toBe('ABORTED')
    // A later START gets a clean terminal refusal, not the old repeated
    // RUN_NOT_STARTABLE loop.
    await expect(startAssessmentRunExecution({ executionId: execB.executionId, actorUserId: execB.actorUserId, resourceRegistry: registry }))
      .rejects.toMatchObject({ code: 'RUN_START_ABORTED' })
  }, 60000)

  it('restart counts toward maxAttempts on a plain questionnaire: maxAttempts=1 cannot restart (D-7)', async () => {
    const original = await startUserAttempt(studentA, d7CompositeId)
    expect((original.attempt as { status: string }).status).toBe('IN_PROGRESS')
    await expect(restartUserAttempt(studentA, (original.attempt as { id: string }).id))
      .rejects.toMatchObject({ message: expect.stringContaining('次数已用完') })
  }, 60000)
})
