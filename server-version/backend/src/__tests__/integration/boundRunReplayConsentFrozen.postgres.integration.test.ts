import { randomUUID } from 'node:crypto'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { Prisma, PrismaClient, UserRole } from '@prisma/client'
import { prisma as db } from '../../config/database'
import { integrationDatabaseUrl, requireIsolatedReleaseDatabase } from './integration-env'
import { startAssessmentRunExecution } from '../../modules/assessment-run/startExecution'
import { acquireRunExecutionStartClaim } from '../../modules/assessment-run/startClaim'
import { closeAssessmentRun } from '../../modules/assessment-run/lifecycle'
import { RunResourceAuthorityRegistry, type RunResourceAuthorityAdapter } from '../../modules/assessment-run/resourceAuthority'
import { canonicalHash } from '../../modules/assessment-runtime/canonical'
import { createOrganization, createMembership, grantPersona } from '../../modules/organization/service'
import { createAssessmentRunDraft, addAssessmentRunTrackDraft } from '../../modules/assessment-run/repository'
import { publishAssessmentRun } from '../../modules/assessment-run/publish'
import { rolledBackStartReason } from '../../modules/composite/start-transient'
import { acceptRunExecutionConsent } from '../../modules/assessment-run/consent'
import { createAttemptConsent, acceptPendingAttemptConsent } from '../../modules/assessment-identity/identity'
import { createSqlRelationalAssignmentRepository } from '../../modules/assessment-relational/repository'
import { finalizeCompositeAttemptIfReady, getAttemptState, getReport } from '../../modules/composite/composite.service'
import { submitCompositeFormSectionFinal } from '../../modules/composite/final-submit.service'

/**
 * PR-2 / D-5: frozen consent survives a re-consent, against a REAL observer
 * Run execution (real PostgreSQL).
 *
 * Decision D-5 (2026-11-06, bound-replay-decision.md §6): consent is frozen
 * at claim time and stays valid for the whole START flow. The dispatch
 * compares only subjectUserId / respondentUserId / episodeId / assignmentRef
 * against the frozen admission; the consentId comparison was removed.
 *
 * The consent model is a lineage: a pending ROOT row (the assignment's
 * consentId) plus one accepted CHILD row (priorConsentId = root). There is
 * no production revoke/re-issue flow that changes an assignment's consentId
 * after publish, so the re-consent is constructed at the DB level following
 * the same rules production enforces: a new root R2 with the same
 * subject/respondent/purpose/scope, an accepted child C2, and the assignment
 * re-pointed at R2. resolveAcceptedConsent must then return C2, while the
 * dispatched attempt still carries the frozen consent A.
 *
 * Fixture shape (why a PARENT observer in a LEGACY org): a consent-bearing
 * observer Run needs PARENT/TEACHER respondents, and the Run dispatch
 * (createAttempt) requires the respondent to hold an ACTIVE courseStudent
 * row in a non-library course. The realm guards forbid a SCHOOL-domain user
 * from holding one (and forbid LEGACY users in SCHOOL orgs), so a SCHOOL
 * teacher observer can never dispatch a plain QUESTIONNAIRE Run. A LEGACY
 * parent observer can: the parent is a LEGACY user enrolled as a student
 * in the delivery TRAINING_COURSE. The PARENT_CHILD population resolves
 * from parentStudentRelationship rows in a LEGACY org (no campus machinery).
 */
const DB_URL = integrationDatabaseUrl(
  'RELEASE_INTEGRATION_DATABASE_URL',
  'PR26_INTEGRATION_DATABASE_URL',
  'COGNITIVE_INTEGRATION_DB_URL',
)
const suite = DB_URL ? describe : describe.skip
if (DB_URL) requireIsolatedReleaseDatabase(DB_URL)

const observerPolicy = {
  subjectRoles: ['STUDENT'],
  respondentRoles: ['PARENT'],
  relationshipKinds: ['PARENT_CHILD'],
  perspectives: ['OBSERVER_REPORT'],
  analysisMode: 'INDIVIDUAL_ONLY',
  visibilityPolicyKey: 'observer_assigning_teacher_v1',
  minimumRespondents: null,
}

suite('BOUND frozen consent after re-consent (real PostgreSQL)', () => {
  const suffix = `consent-frozen-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`
  let organizationId = ''
  let ownerUserId = ''
  let parentId = ''
  let childAId = ''
  let childBId = ''
  let compositeId = ''
  let formSectionId = ''
  let formItemId = ''
  let runId = ''
  let execA = { executionId: '', actorUserId: '' }
  let execSubj = { executionId: '', actorUserId: '' }
  let execEp = { executionId: '', actorUserId: '' }
  let execRef = { executionId: '', actorUserId: '' }
  let execResp = { executionId: '', actorUserId: '' }
  let assignmentIdA = ''
  let assignmentIds: string[] = []

  const registry = new RunResourceAuthorityRegistry([{
    family: 'BUNDLE',
    capabilities: {
      transactionMode: 'TRANSACTIONAL_DB',
      startMode: 'TRANSACTIONAL',
      supportsLookupByOperationKey: false,
      supportsSafeCancel: true,
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
        applicabilityHash: canonicalHash({ ref, applicability: observerPolicy }),
        ...observerPolicy,
        runtimeLaunchTarget: { kind: 'COMPOSITE', ref: compositeId },
      }
    },
  } satisfies RunResourceAuthorityAdapter])

  const assignmentOf = async (executionId: string): Promise<string> => {
    const rows = await db.$queryRaw<Array<{ id: string }>>`SELECT "relational_assignment_id" AS "id" FROM "assessment_run_executions" WHERE "id"=${executionId}`
    if (!rows[0]?.id) throw new Error(`no assignment for execution ${executionId}`)
    return rows[0].id
  }
  const frozenConsentOf = async (executionId: string): Promise<string | null> => {
    const rows = await db.$queryRaw<Array<{ identity: { consentId?: string | null } }>>`SELECT "admitted_attempt_identity" AS "identity" FROM "assessment_run_execution_start_claims" WHERE "execution_id"=${executionId}`
    return rows[0]?.identity?.consentId ?? null
  }
  const resolveConsent = async (assignmentId: string): Promise<string | null> => {
    const repository = createSqlRelationalAssignmentRepository(db as never)
    const assignment = await repository.findById(assignmentId)
    if (!assignment) throw new Error(`assignment ${assignmentId} not found`)
    return (await repository.resolveAcceptedConsent(assignment))?.consentId ?? null
  }
  // A manually acquired claim holds a lease (30s by default); a dispatch
  // re-acquiring it while the lease is live returns IN_PROGRESS ("another
  // dispatch in flight") instead of dispatching. Acquire with a 1s lease
  // and sleep past it instead: the lease check constraint
  // (lease_until >= claimed_at) forbids backdating lease_until by hand.
  const sleep = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms))

  // publishAssessmentRun runs at Serializable isolation, so two concurrent
  // publishes (e.g. this suite running beside another integration file in the
  // same vitest invocation) can abort each other with 40001. That is a
  // transient serialization abort by definition, not a product failure; retry
  // the publish, mirroring the production START path's transient handling
  // (same helper as boundRunReplayRealBinding / boundRunReplayInterleave).
  const publishRunWithRetry = async (args: Parameters<typeof publishAssessmentRun>[0]): Promise<void> => {
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

  beforeAll(async () => {
    const seed = `${suffix}-${randomUUID().slice(0, 8)}`
    const owner = await db.user.create({
      data: { username: `consent-frozen-owner-${seed}`, passwordHash: 'test-only', role: 'TEACHER', teacherApproved: true, accountDomain: 'LEGACY' },
      select: { id: true },
    })
    ownerUserId = owner.id
    // Legacy role is intentionally not PARENT: observer authority is frozen
    // from the real relationship, not User.role (same as the consent
    // recovery suite). The parent is a LEGACY user so it can hold the
    // courseStudent row the dispatch gate requires of the respondent.
    const parent = await db.user.create({
      data: { username: `consent-frozen-parent-${seed}`, passwordHash: 'test-only', role: 'STUDENT', accountDomain: 'LEGACY' },
      select: { id: true },
    })
    parentId = parent.id
    const children = []
    for (const label of ['a', 'b', 'c', 'd', 'e']) {
      children.push(await db.user.create({
        data: { username: `consent-frozen-child-${label}-${seed}`, passwordHash: 'test-only', role: 'STUDENT', accountDomain: 'LEGACY' },
        select: { id: true },
      }))
    }
    const [childA, childB, childC, childD, childE] = children
    childAId = childA.id
    childBId = childB.id
    const org = await createOrganization({ name: `consent frozen ${seed}`, meta: { actorUserId: owner.id, commandKey: randomUUID() } })
    organizationId = org.organization.id
    const childMemberships = []
    for (const child of children) {
      const m = await createMembership({ organizationId, userId: child.id, meta: { actorUserId: owner.id, commandKey: randomUUID() } })
      await grantPersona({ organizationId, membershipId: m.id, persona: 'STUDENT', meta: { actorUserId: owner.id, commandKey: randomUUID() } })
      childMemberships.push(m)
      await db.parentStudentRelationship.create({
        data: { parentUserId: parent.id, studentUserId: child.id, status: 'ACTIVE', approvedAt: new Date(), approvedByUserId: owner.id },
      })
    }
    const course = await db.course.create({ data: {
      creatorId: owner.id, title: `consent-frozen course ${seed}`, courseType: 'TRAINING_COURSE',
      courseCode: `CF-${seed}`, status: 'PUBLISHED' } })
    // The dispatch gate (createAttempt) requires the RESPONDENT to hold an
    // ACTIVE courseStudent row in a non-library course; the subjects need
    // none. Enroll only the parent.
    await db.courseStudent.create({ data: { courseId: course.id, studentId: parent.id, status: 'ACTIVE' } })
    // Direct inserts: product.create would stamp a training policy and the
    // Run dispatch would reject it ("此投放不支持 Training 冻结策略").
    const composite = await db.compositeAssessment.create({ data: {
      code: `${suffix}-consent`, name: 'consent-frozen', createdBy: owner.id,
      productKind: 'QUESTIONNAIRE', questionnaireType: 'COURSE', status: 'PUBLISHED', maxAttempts: 3 } })
    const section = await db.compositeFormSection.create({ data: {
      compositeAssessmentId: composite.id, title: 'consent section', position: 0, contextSection: false } })
    const item = await db.compositeAssessmentItem.create({ data: {
      compositeAssessmentId: composite.id, type: 'FORM', position: 0, required: true,
      formType: 'text_input', formLabel: 'consent answer', formSectionId: section.id, formSectionPosition: 0 } })
    await db.questionnaireCourseDelivery.create({ data: { compositeId: composite.id, courseId: course.id } })
    compositeId = composite.id
    formSectionId = section.id
    formItemId = item.id

    const run = await createAssessmentRunDraft({ organizationId, name: `consent run ${seed}`, createdByUserId: owner.id })
    await addAssessmentRunTrackDraft({
      organizationId, runId: run.id,
      resource: { family: 'BUNDLE', key: `consent-frozen-${seed}`, version: '1.0.0' },
      subjectSelector: { kind: 'MEMBERSHIP_IDS', membershipIds: childMemberships.map((m) => m.id) },
      respondentSelector: { kind: 'RELATED_PARENT' },
      requestedPolicy: observerPolicy,
    })
    await publishRunWithRetry({
      organizationId, runId: run.id, actorUserId: owner.id, expectedVersion: 2, resourceRegistry: registry,
    })
    runId = run.id
    const executions = await db.$queryRaw<Array<{ id: string; subjectUserId: string; respondentUserId: string }>>`
      SELECT e."id", s."user_id" AS "subjectUserId", r."user_id" AS "respondentUserId"
      FROM "assessment_run_executions" e
      JOIN "assessment_run_actor_snapshots" s ON s."id" = e."subject_actor_snapshot_id"
      JOIN "assessment_run_actor_snapshots" r ON r."id" = e."respondent_actor_snapshot_id"
      WHERE e."run_id" = ${run.id}
    `
    expect(executions).toHaveLength(5)
    const bySubject = new Map(executions.map((row) => [row.subjectUserId, row]))
    execA = { executionId: bySubject.get(childA.id)!.id, actorUserId: parent.id }
    execSubj = { executionId: bySubject.get(childB.id)!.id, actorUserId: parent.id }
    execEp = { executionId: bySubject.get(childC.id)!.id, actorUserId: parent.id }
    execRef = { executionId: bySubject.get(childD.id)!.id, actorUserId: parent.id }
    execResp = { executionId: bySubject.get(childE.id)!.id, actorUserId: parent.id }
    assignmentIdA = await assignmentOf(execA.executionId)
    assignmentIds = [assignmentIdA]
    for (const exec of [execSubj, execEp, execRef, execResp]) assignmentIds.push(await assignmentOf(exec.executionId))
  }, 240000)

  afterAll(async () => {
    try {
      const attempts = await db.compositeAssessmentAttempt.findMany({ where: { compositeAssessmentId: compositeId }, select: { id: true } })
      const attemptIds = attempts.map((a) => a.id)
      if (attemptIds.length) {
        await db.assessmentUnitSnapshot.deleteMany({ where: { compositeAttemptId: { in: attemptIds } } })
        await db.assessment.deleteMany({ where: { compositeAttemptId: { in: attemptIds } } })
        await db.compositeAssessmentAttempt.deleteMany({ where: { id: { in: attemptIds } } })
      }
      if (runId) {
        await db.$executeRaw`DELETE FROM "assessment_run_execution_start_claims" WHERE "execution_id" IN (SELECT "id" FROM "assessment_run_executions" WHERE "run_id"=${runId})`
        await db.$executeRaw`DELETE FROM "assessment_run_executions" WHERE "run_id"=${runId}`
        if (assignmentIds.length) await db.$executeRaw`DELETE FROM "relational_assessment_assignments" WHERE "id" IN (${Prisma.join(assignmentIds)})`
        await db.$executeRaw`DELETE FROM "assessment_run_relationship_snapshots" WHERE "run_id"=${runId}`
      }
      if (compositeId) await db.compositeAssessment.deleteMany({ where: { id: compositeId } })
    } finally {
      await (await import('../../config/queue')).closeQueues(true)
      await db.$disconnect()
    }
  }, 120000)

  // The negative test runs FIRST: the main test closes the Run at the end,
  // and consent acceptance + claim admission require a PUBLISHED Run. Each
  // negative case uses its own execution, so a rejection leaves no shared
  // state behind: the claim stays CLAIMED with its frozen identity intact.
  it('other frozen identity fields still reject after a change (D-5 negative)', async () => {
    const claimStateOf = async (exec: { executionId: string }): Promise<string> => {
      const rows = await db.$queryRaw<Array<{ state: string }>>`SELECT "state" FROM "assessment_run_execution_start_claims" WHERE "execution_id"=${exec.executionId}`
      return rows[0]?.state ?? ''
    }
    const freeze = async (exec: { executionId: string }): Promise<{ assignmentId: string; frozen: string }> => {
      const assignmentId = await assignmentOf(exec.executionId)
      expect((await acceptRunExecutionConsent({ executionId: exec.executionId, actorUserId: parentId })).accepted).toBe(true)
      const frozen = await resolveConsent(assignmentId)
      expect(frozen).toBeTruthy()
      expect((await acquireRunExecutionStartClaim({ executionId: exec.executionId, actorUserId: parentId, leaseMs: 1000, resourceRegistry: registry })).kind).toBe('ACQUIRED')
      expect(await frozenConsentOf(exec.executionId)).toBe(frozen)
      return { assignmentId, frozen: frozen! }
    }
    // subject: the frozen identity no longer matches the assignment.
    {
      const { assignmentId, frozen } = await freeze(execSubj)
      await db.$executeRaw`UPDATE "relational_assessment_assignments" SET "subject_user_id"=${childAId} WHERE "id"=${assignmentId}`
      await sleep(1200)
      await expect(startAssessmentRunExecution({ executionId: execSubj.executionId, actorUserId: parentId, resourceRegistry: registry }))
        .rejects.toMatchObject({ code: 'RUN_START_IDENTITY_MISMATCH' })
      expect(await claimStateOf(execSubj)).toBe('CLAIMED')
      expect(await frozenConsentOf(execSubj.executionId)).toBe(frozen)
    }
    // episode: same frozen-identity fence. All assignments of one track
    // share the allocation's episode, so the sibling's episode is the same
    // value; mutate to a separately created real episode instead.
    {
      const { assignmentId, frozen } = await freeze(execEp)
      const otherEpisode = await db.assessmentEpisode.create({
        data: { subjectUserId: childAId, initiatedByUserId: ownerUserId, initiationMode: 'TEACHER_CAMPAIGN', courseId: null },
        select: { id: true },
      })
      await db.$executeRaw`UPDATE "relational_assessment_assignments" SET "episode_id"=${otherEpisode.id} WHERE "id"=${assignmentId}`
      await sleep(1200)
      await expect(startAssessmentRunExecution({ executionId: execEp.executionId, actorUserId: parentId, resourceRegistry: registry }))
        .rejects.toMatchObject({ code: 'RUN_START_IDENTITY_MISMATCH' })
      expect(await claimStateOf(execEp)).toBe('CLAIMED')
      expect(await frozenConsentOf(execEp.executionId)).toBe(frozen)
    }
    // assignmentRef: the execution side cannot be re-pointed at a live
    // assignment (relational_assignment_id is UNIQUE per execution), so the
    // tamper is applied to the frozen side: rewrite the claim's frozen
    // assignmentRef to a sibling assignment. The guard compares the frozen
    // identity against the current assignment either way.
    {
      const { assignmentId, frozen } = await freeze(execRef)
      await db.$executeRaw`UPDATE "assessment_run_execution_start_claims" SET "admitted_attempt_identity" = jsonb_set("admitted_attempt_identity", '{assignmentRef}', to_jsonb(${assignmentIdA}::text)) WHERE "execution_id"=${execRef.executionId}`
      await sleep(1200)
      await expect(startAssessmentRunExecution({ executionId: execRef.executionId, actorUserId: parentId, resourceRegistry: registry }))
        .rejects.toMatchObject({ code: 'RUN_START_IDENTITY_MISMATCH' })
      expect(await claimStateOf(execRef)).toBe('CLAIMED')
      expect(await frozenConsentOf(execRef.executionId)).toBe(frozen)
    }
    // respondent: the assignment no longer belongs to the acting respondent.
    {
      const { assignmentId, frozen } = await freeze(execResp)
      await db.$executeRaw`UPDATE "relational_assessment_assignments" SET "respondent_user_id"=${ownerUserId} WHERE "id"=${assignmentId}`
      await sleep(1200)
      await expect(startAssessmentRunExecution({ executionId: execResp.executionId, actorUserId: parentId, resourceRegistry: registry }))
        .rejects.toMatchObject({ code: 'RUN_EXECUTION_ACTOR' })
      expect(await claimStateOf(execResp)).toBe('CLAIMED')
      expect(await frozenConsentOf(execResp.executionId)).toBe(frozen)
    }
  }, 180000)

  it('frozen consent survives re-consent: dispatch and replay keep A while the current consent is B (D-5)', async () => {
    const accepted = await acceptRunExecutionConsent({ executionId: execA.executionId, actorUserId: parentId })
    expect(accepted.accepted).toBe(true)
    const consentA = await resolveConsent(assignmentIdA)
    expect(consentA).toBeTruthy()
    // Short lease: the dispatch below re-acquires the claim, and a live
    // 30s lease would make it report IN_PROGRESS instead of dispatching.
    const decision = await acquireRunExecutionStartClaim({ executionId: execA.executionId, actorUserId: parentId, leaseMs: 1000, resourceRegistry: registry })
    expect(decision.kind).toBe('ACQUIRED')
    expect(await frozenConsentOf(execA.executionId)).toBe(consentA)

    // Re-consent, following the consent rules: a new root R2 with the same
    // subject/respondent/purpose/scope, an accepted child C2, and the
    // assignment re-pointed at R2. The currently effective consent is now C2.
    const rootConsentId = (await db.$queryRaw<Array<{ consentId: string }>>`SELECT "consent_id" AS "consentId" FROM "relational_assessment_assignments" WHERE "id"=${assignmentIdA}`)[0].consentId
    const rootA = await db.assessmentAttemptConsent.findUniqueOrThrow({ where: { id: rootConsentId } })
    const rootB = createAttemptConsent({
      subjectUserId: rootA.subjectUserId!, respondentUserId: rootA.respondentUserId!,
      respondentType: rootA.respondentType as 'PARENT', consentVersion: rootA.consentVersion,
      purpose: rootA.purpose, visibilityScope: rootA.visibilityScope,
      shareTargets: (rootA.shareTargetsJson as string[]) ?? [], pending: true,
    })
    await db.assessmentAttemptConsent.create({ data: {
      id: rootB.consentId, priorConsentId: null, subjectUserId: rootB.subjectUserId,
      respondentUserId: rootB.respondentUserId, respondentType: rootB.respondentType,
      consentVersion: rootB.consentVersion, consentHash: rootB.consentHash,
      purpose: rootB.purpose, visibilityScope: rootB.visibilityScope,
      shareTargetsJson: rootB.shareTargets, acceptedAt: null, revokedAt: null,
    } })
    const acceptedB = acceptPendingAttemptConsent({ pending: { ...rootB, acceptedAt: null, revokedAt: null } })
    await db.assessmentAttemptConsent.create({ data: {
      id: acceptedB.consentId, priorConsentId: rootB.consentId, subjectUserId: acceptedB.subjectUserId,
      respondentUserId: acceptedB.respondentUserId, respondentType: acceptedB.respondentType,
      consentVersion: acceptedB.consentVersion, consentHash: acceptedB.consentHash,
      purpose: acceptedB.purpose, visibilityScope: acceptedB.visibilityScope,
      shareTargetsJson: acceptedB.shareTargets, acceptedAt: new Date(acceptedB.acceptedAt!), revokedAt: null,
    } })
    await db.$executeRaw`UPDATE "relational_assessment_assignments" SET "consent_id"=${rootB.consentId} WHERE "id"=${assignmentIdA}`
    const consentB = await resolveConsent(assignmentIdA)
    expect(consentB).toBe(acceptedB.consentId)
    expect(consentB).not.toBe(consentA)
    // The frozen claim still holds A: the re-consent did not rewrite it.
    expect(await frozenConsentOf(execA.executionId)).toBe(consentA)

    // Real transactional dispatch: relational.start resolves the CURRENT
    // consent (B), but the attempt is created with the frozen identity (A).
    // Wait out the 1s claim lease first, or the dispatch reports
    // IN_PROGRESS instead of dispatching.
    await sleep(1200)
    const first = await startAssessmentRunExecution({ executionId: execA.executionId, actorUserId: parentId, resourceRegistry: registry })
    expect(first.state).toBe('STARTED')
    expect((first as { replayed?: boolean }).replayed).toBe(false)
    const ref = (first as { runtimeBindingRef: string }).runtimeBindingRef
    const attemptRow = await db.compositeAssessmentAttempt.findUniqueOrThrow({ where: { id: ref } })
    expect(attemptRow.status).toBe('IN_PROGRESS')
    expect(attemptRow.consentId).toBe(consentA)

    // L2 read + fill, L3 submit + report, all under the frozen consent.
    const state = await getAttemptState(ref, { userId: parentId })
    expect((state as { status: string }).status).toBe('IN_PROGRESS')
    const definitionHash = (state as { currentItem?: { definitionHash?: string } }).currentItem?.definitionHash
    expect(definitionHash).toBeTruthy()
    await submitCompositeFormSectionFinal({
      attemptId: ref, sectionId: formSectionId, userId: parentId,
      submissionId: randomUUID(), attemptEpoch: attemptRow.attemptEpoch,
      definitionHash: definitionHash!,
      answers: [{ formItemId, value: 'frozen consent answer' }],
    })
    expect((await finalizeCompositeAttemptIfReady(ref))?.status).toBe('COMPLETED')
    expect(await getReport(ref, { userId: parentId })).toBeTruthy()
    expect((await db.compositeAssessmentAttempt.findUniqueOrThrow({ where: { id: ref } })).consentId).toBe(consentA)

    // Replay after CLOSE returns the same binding, still under consent A.
    await closeAssessmentRun({ organizationId, runId })
    const replay = await startAssessmentRunExecution({ executionId: execA.executionId, actorUserId: parentId, resourceRegistry: registry })
    expect(replay.state).toBe('STARTED')
    expect((replay as { replayed?: boolean }).replayed).toBe(true)
    expect((replay as { runtimeBindingRef: string }).runtimeBindingRef).toBe(ref)
    expect((await db.compositeAssessmentAttempt.findUniqueOrThrow({ where: { id: ref } })).consentId).toBe(consentA)
  }, 180000)
})
