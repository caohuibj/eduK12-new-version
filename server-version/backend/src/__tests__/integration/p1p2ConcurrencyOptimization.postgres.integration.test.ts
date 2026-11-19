import { randomUUID } from 'node:crypto'
import { Prisma } from '@prisma/client'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { prisma as db } from '../../config/database'
import { integrationDatabaseUrl, requireIsolatedReleaseDatabase } from './integration-env'
import { grantSyntheticHuischoolProduct } from './educationProductFixture'
import { compileResearchScale } from '../../modules/survey/builder.compiler'
import * as tools from '../../modules/education-tools/private-tool.service'
import type { PrivateToolContext } from '../../modules/education-tools/private-tool.contracts'
import {
  clearVerifiedPrivateScaleSourceCache,
  preparePrivateScaleRuntimeResource,
  readPrivateScaleRuntimeResource,
} from '../../modules/education-tools/private-tool.runtime-resources'
import { readEducationScaleExecutionSource } from '../../modules/assessment-run/educationScaleExecutionSource'
import { createCampusActivity, changeCampusActivityStatus, readCampusActivity } from '../../modules/campus/activity.service'
import { allocateCampusActivityParticipants } from '../../modules/campus/activity.allocation'
import { createOrganizationUnit } from '../../modules/organization/structure'
import {
  replaceCampusRoster,
  setCampusRegistrationWindow,
  issueCampusActivationCodes,
  registerCampusStudent,
  approveCampusClass,
} from '../../modules/campus/admission.service'
import { createCampusActivityRunDraft } from '../../modules/campus/activity.runs'
import { listCampusStudentTasks } from '../../modules/campus/activity.tasks'
import { checkCampusCompositeAccessDetails } from '../../modules/campus/campus-composite-authority'
import { addAssessmentRunTrackDraft } from '../../modules/assessment-run/repository'
import { publishAssessmentRun } from '../../modules/assessment-run/publish'
import { startAssessmentRunExecution } from '../../modules/assessment-run/startExecution'
import { listSchoolStudentRunTasks } from '../../modules/assessment-run/productRead'
import { checkSingleExecutionPopulationAuthority, currentRunPopulationAuthoritySql } from '../../modules/assessment-run/currentPopulationAuthority'
import { submitCompositeScaleFinal } from '../../modules/scale/scale-final-submit.service'
import { projectRelationalUnitFinalResponse } from '../../modules/assessment-relational/result-authority'
import { getAttemptState } from '../../modules/composite/composite.service'
import { listOwnTeacherScaleTasks } from '../../modules/huiteacher/scaleRuntime.routes'
import { createHuiteacherTarget, createHuiteacherEvent, createHuiteacherEventRunDraft, transitionHuiteacherEvent, readHuiteacherEventRun } from '../../modules/huiteacher/evaluation.service'
import { addTeacherRunTrack, publishTeacherRun } from '../../modules/huiteacher/run.service'
import { changeTeacherScaleLicense } from '../../modules/huiteacher/scaleLicense.service'
import { registerDescriptiveResource, transitionDescriptiveResource } from '../../modules/assessment-run/registeredResources'
import { createCustomScaleDefinition, hashScaleDefinition } from '../../modules/scale/scale-definition'
import { independentReviewer } from './independent-reviewer'
import { publishRegisteredScaleFixture } from './registered-resource-fixture'

const DB_URL = integrationDatabaseUrl('RELEASE_INTEGRATION_DATABASE_URL', 'PR26_INTEGRATION_DATABASE_URL')
const suite = DB_URL ? describe : describe.skip
if (DB_URL) requireIsolatedReleaseDatabase(DB_URL)

const syntheticScaleDef = () => compileResearchScale('P1P2PerfScale', {
  schemaVersion: 1,
  presentationMode: 'ONE_BY_ONE',
  respondentType: 'participant_self_report',
  aggregation: 'mean',
  responseOptions: [
    { optionKey: 'a', label: 'A', score: 1 },
    { optionKey: 'b', label: 'B', score: 2 },
  ],
  dimensions: [{ dimensionKey: 'total', label: 'Total', direction: 'descriptive' }],
  items: [{ itemKey: 'q1', prompt: 'Question 1', required: true, reverse: false, dimensionKeys: ['total'] }],
})

/** Count raw SQL statements executed via Prisma during `fn`, tracking any
 * `force_custom_plan` planner overrides so hot-path regressions fail loudly. */
async function traceSql<T>(fn: () => Promise<T>): Promise<{ result: T; queries: number; forceCustomPlanCalls: number }> {
  let queries = 0
  let forceCustomPlanCalls = 0
  let depth = 0
  const hasOwnQueryRaw = Object.prototype.hasOwnProperty.call(db, '$queryRaw')
  const hasOwnExecRaw = Object.prototype.hasOwnProperty.call(db, '$executeRaw')
  const hasOwnTx = Object.prototype.hasOwnProperty.call(db, '$transaction')
  const origQueryRaw = db.$queryRaw
  const origExecRaw = db.$executeRaw
  const origTx = db.$transaction

  const inspectSql = (first: unknown) => {
    const text = Array.isArray(first)
      ? first.join('?')
      : first && typeof first === 'object' && 'strings' in first && Array.isArray((first as { strings: unknown[] }).strings)
        ? (first as { strings: string[] }).strings.join('?')
        : String(first ?? '')
    queries += 1
    if (text.includes('force_custom_plan')) forceCustomPlanCalls += 1
  }
  const wrapCall = (orig: (...args: any[]) => any) => function (this: any, ...args: any[]) {
    if (depth === 0) inspectSql(args[0])
    depth += 1
    try {
      const out = orig.apply(this, args)
      if (out && typeof out.finally === 'function') {
        return out.finally(() => { depth -= 1 })
      }
      depth -= 1
      return out
    } catch (err) {
      depth -= 1
      throw err
    }
  }

  ;(db as any).$queryRaw = wrapCall(origQueryRaw as any)
  ;(db as any).$executeRaw = wrapCall(origExecRaw as any)
  ;(db as any).$transaction = function (this: any, cbOrArr: any, opts?: any) {
    if (typeof cbOrArr !== 'function') return (origTx as any).call(this, cbOrArr, opts)
    return (origTx as any).call(this, async (tx: any) => {
      const origTxQuery = tx.$queryRaw
      const origTxExec = tx.$executeRaw
      tx.$queryRaw = wrapCall(origTxQuery)
      tx.$executeRaw = wrapCall(origTxExec)
      return cbOrArr(tx)
    }, opts)
  }
  try {
    const result = await fn()
    return { result, queries, forceCustomPlanCalls }
  } finally {
    if (hasOwnQueryRaw) (db as any).$queryRaw = origQueryRaw
    else delete (db as any).$queryRaw
    if (hasOwnExecRaw) (db as any).$executeRaw = origExecRaw
    else delete (db as any).$executeRaw
    if (hasOwnTx) (db as any).$transaction = origTx
    else delete (db as any).$transaction
  }
}

suite('P1+P2 concurrency optimizations — real PostgreSQL equivalence, zero force_custom_plan & cache invalidation', () => {
  const prevEncKey = process.env.DATA_ENCRYPTION_KEY
  const prevPseudoKey = process.env.DATA_PSEUDONYM_KEY

  beforeAll(() => {
    process.env.DATA_ENCRYPTION_KEY = '71'.repeat(32)
    process.env.DATA_PSEUDONYM_KEY = '72'.repeat(32)
    process.env.CAMPUS_ELIGIBILITY_HMAC_KEY = '73'.repeat(32)
  })

  afterAll(async () => {
    if (prevEncKey === undefined) delete process.env.DATA_ENCRYPTION_KEY
    else process.env.DATA_ENCRYPTION_KEY = prevEncKey
    if (prevPseudoKey === undefined) delete process.env.DATA_PSEUDONYM_KEY
    else process.env.DATA_PSEUDONYM_KEY = prevPseudoKey
    await db.$disconnect()
  })

  it('School student activity-tasks, START, campusCompositeAccess and receipt submit run without force_custom_plan and stay equivalent under revocations', async () => {
    const tag = randomUUID().replace(/-/g, '').slice(0, 8)
    const admin = await db.user.create({
      data: { id: randomUUID(), username: `p1p2_adm_${tag}`, passwordHash: 'synthetic', role: 'ADMIN', accountDomain: 'SCHOOL', teacherApproved: true },
    })
    const orgId = randomUUID()
    await db.organization.create({
      data: { id: orgId, name: `Org ${tag}`, productDomain: 'SCHOOL', createdByUserId: admin.id },
    })

    const adminMember = await db.organizationMembership.create({
      data: { id: randomUUID(), organizationId: orgId, userId: admin.id, orgRole: 'ORG_ADMIN', validFrom: new Date(Date.now() - 60_000) },
    })
    await grantSyntheticHuischoolProduct(db, { organizationId: orgId, adminUserId: admin.id, adminMembershipId: adminMember.id })
    await db.organizationPersonaGrant.create({
      data: { id: randomUUID(), organizationId: orgId, membershipId: adminMember.id, persona: 'COUNSELOR', grantedByUserId: admin.id },
    })
    await db.organizationCapabilityGrant.create({
      data: { id: randomUUID(), organizationId: orgId, membershipId: adminMember.id, capability: 'PSYCHOLOGY_STAFF', grantedByUserId: admin.id },
    })

    const adminPrincipal = { userId: admin.id, username: admin.username, role: 'ADMIN' as const, accountDomain: 'SCHOOL' as const, tokenVersion: 1 }
    const grade = await createOrganizationUnit({ organizationId: orgId, unitKind: 'GRADE', name: 'G5' })
    const classUnit = await createOrganizationUnit({ organizationId: orgId, unitKind: 'CLASS', name: 'C1', parentUnitId: grade.id })
    const studentNumber = 'S' + tag
    const roster = await replaceCampusRoster({ actor: adminPrincipal, organizationId: orgId, classUnitId: classUnit.id, studentNumbers: [studentNumber] })
    await setCampusRegistrationWindow({ actor: adminPrincipal, organizationId: orgId, classUnitId: classUnit.id, action: 'OPEN', closesAt: new Date(Date.now() + 30 * 60_000) })
    const codes = await issueCampusActivationCodes({ actor: adminPrincipal, organizationId: orgId, classUnitId: classUnit.id, count: 1, ttlMinutes: 30 })
    const registered = await registerCampusStudent({
      organizationId: orgId,
      classUnitId: classUnit.id,
      studentNumber,
      activationCode: codes.codes[0]!,
      username: `p1p2_stu_${tag}`,
      password: 'SyntheticPassword123',
    })
    await setCampusRegistrationWindow({ actor: adminPrincipal, organizationId: orgId, classUnitId: classUnit.id, action: 'CLOSE' })
    await approveCampusClass({ actor: adminPrincipal, organizationId: orgId, classUnitId: classUnit.id, expectedRosterVersion: roster.rosterVersion })
    const student = await db.user.findUniqueOrThrow({ where: { id: registered.userId } })
    const studentMember = await db.organizationMembership.findFirstOrThrow({ where: { organizationId: orgId, userId: student.id } })

    // Author & freeze a private scale for SCHOOL STUDENT:SELF
    const toolCtx: PrivateToolContext = { principal: { userId: admin.id, accountDomain: 'SCHOOL' }, entry: 'SCHOOL', organizationId: orgId }
    const draft = await tools.createPrivateTool(toolCtx, { kind: 'SCALE', title: `Scale ${tag}` })
    const saved = await tools.updatePrivateTool(toolCtx, draft.id, { expectedRevision: draft.revision, title: draft.title, definition: syntheticScaleDef() })
    const frozen = await tools.freezePrivateTool(toolCtx, draft.id, { expectedRevision: saved.revision, expectedContentHash: saved.contentHash })
    const prepared = await db.$transaction(
      tx => preparePrivateScaleRuntimeResource(tx, toolCtx, {
        versionId: frozen.id,
        contentHash: frozen.contentHash,
        administration: { population: 'STUDENT', responseMode: 'SELF' },
      }),
      { isolationLevel: Prisma.TransactionIsolationLevel.ReadCommitted },
    )

    // Create & open campus activity + allocate student + publish run
    const studentPrincipal = { userId: student.id, username: student.username, role: 'STUDENT' as const, accountDomain: 'SCHOOL' as const, tokenVersion: 1 }
    const activity = await createCampusActivity({
      actor: adminPrincipal,
      organizationId: orgId,
      title: `Activity ${tag}`,
      purpose: 'STUDENT_WELLBEING',
    })
    const scope = { actor: adminPrincipal, organizationId: orgId, courseId: activity.id }
    await allocateCampusActivityParticipants({ ...scope, classUnitIds: [classUnit.id], requestKey: randomUUID(), expectedVersion: 1 })
    const run = await createCampusActivityRunDraft({ ...scope, name: `Run ${tag}` })
    await addAssessmentRunTrackDraft({
      organizationId: orgId,
      runId: run.id,
      actorUserId: admin.id,
      expectedVersion: 1,
      resource: {
        family: 'SCALE',
        key: prepared.resourceEntry.applicability.resourceKey,
        version: '1.0.0',
      },
      subjectSelector: { kind: 'MEMBERSHIP_IDS', membershipIds: [studentMember.id] },
      respondentSelector: { kind: 'MEMBERSHIP_IDS', membershipIds: [studentMember.id] },
      requestedPolicy: {
        subjectRoles: ['STUDENT'],
        respondentRoles: ['STUDENT'],
        relationshipKinds: ['SELF'],
        perspectives: ['SELF_REPORT'],
        analysisMode: 'INDIVIDUAL_ONLY',
        visibilityPolicyKey: prepared.resourceEntry.applicability.visibilityPolicyKey,
      },
    })
    const detail = await readCampusActivity(scope)
    const submittedActivity = await changeCampusActivityStatus({ ...scope, action: 'SUBMIT', expectedVersion: detail.version })
    await changeCampusActivityStatus({ ...scope, action: 'OPEN', expectedVersion: submittedActivity.version })
    await publishAssessmentRun({ organizationId: orgId, runId: run.id, actorUserId: admin.id, expectedVersion: 2 })

    // 1. Verify School activity-tasks uses flat fast path with ZERO force_custom_plan and matches legacy reader
    const tracedTasks = await traceSql(() => listCampusStudentTasks(studentPrincipal, { page: 1, pageSize: 20, kind: 'MEASUREMENT' }))
    expect(tracedTasks.forceCustomPlanCalls).toBe(0)
    expect(tracedTasks.result.list).toHaveLength(1)
    const executionId = tracedTasks.result.list[0]!.id
    const legacyTasks = await listSchoolStudentRunTasks(student.id, {
      organizationIds: [orgId],
      runIds: [run.id],
      preserveBoundSchoolContinuation: true,
      populationProductScope: 'CAMPUS_ONLY',
    })
    expect(legacyTasks.list.map(t => t.executionId)).toEqual([executionId])

    // 2. Verify private-scale verified source cache warms and cuts SQL count on subsequent reads
    clearVerifiedPrivateScaleSourceCache()
    const coldSource = await traceSql(() => db.$transaction(tx => readPrivateScaleRuntimeResource(tx, {
      key: prepared.resourceEntry.applicability.resourceKey,
      version: '1.0.0',
      purpose: 'HISTORY',
    })))
    const warmSource = await traceSql(() => db.$transaction(tx => readPrivateScaleRuntimeResource(tx, {
      key: prepared.resourceEntry.applicability.resourceKey,
      version: '1.0.0',
      purpose: 'HISTORY',
    })))
    expect(warmSource.result.compositeId).toBe(coldSource.result.compositeId)
    expect(warmSource.queries).toBe(1)

    // 3. Verify School START runs with ZERO force_custom_plan calls!
    const tracedStart = await traceSql(() => startAssessmentRunExecution({
      executionId,
      actorUserId: student.id,
      startPreflight: {
        organizationId: orgId,
        runId: run.id,
        respondentUserId: student.id,
        runtimeBindingKind: null,
        runtimeBindingRef: null,
        preloadCompositeId: prepared.compositeId,
      },
    }))
    expect(tracedStart.forceCustomPlanCalls).toBe(0)
    expect(tracedStart.result.state).toBe('STARTED')
    if (tracedStart.result.state !== 'STARTED') throw new Error('expected STARTED')
    const attemptId = tracedStart.result.runtimeBindingRef

    // 4. Verify campusCompositeAccess runs with ZERO force_custom_plan calls and sets consentFreeFinalReady
    const tracedAccess = await traceSql(() => checkCampusCompositeAccessDetails({ attemptId, userId: student.id }))
    expect(tracedAccess.forceCustomPlanCalls).toBe(0)
    expect(tracedAccess.result).toEqual({ allowed: true, consentFreeFinalReady: true })

    // 5. Verify receipt-only scale/submit skips redundant feedback DB reads in projectRelationalUnitFinalResponse
    const attemptState = await getAttemptState(attemptId, { userId: student.id }, undefined, 'current-unit')
    const currentItem = attemptState.currentItem as { id: string; definitionHash: string }
    const submitted = await submitCompositeScaleFinal(
      attemptId,
      currentItem.id,
      {
        submissionId: randomUUID(),
        attemptEpoch: attemptState.attemptEpoch,
        definitionHash: currentItem.definitionHash,
        contextSnapshotHash: attemptState.contextSnapshotHash,
        answers: [{ itemCode: 'q1', responseValue: 'a' }],
      },
      { userId: student.id },
      { receiptOnly: true },
    )
    const tracedProject = await traceSql(() => projectRelationalUnitFinalResponse(attemptId, submitted))
    expect(tracedProject.queries).toBe(0)
    expect(tracedProject.result).toMatchObject({ completed: true, replayed: false })

    // 6. Verify emergency stop still blocks EXISTING_EXECUTION immediately even when cache is warm!
    // (scale_library_emergency_stops is immutable by trigger, so check after submit completes.)
    await db.$executeRaw`
      INSERT INTO scale_library_emergency_stops (target_kind, target_id, actor_id, reason)
      VALUES ('RELEASE', ${prepared.origin.releaseId}, ${admin.id}, 'p1p2 test stop')
    `
    await expect(db.$transaction(tx => readEducationScaleExecutionSource(tx, {
      product: 'SCHOOL',
      organizationId: orgId,
      resourceKey: prepared.resourceEntry.applicability.resourceKey,
      resourceVersion: '1.0.0',
      purpose: 'EXISTING_EXECUTION',
    }))).rejects.toThrow('紧急停用')
    // HISTORY still succeeds on frozen identity
    await expect(db.$transaction(tx => readEducationScaleExecutionSource(tx, {
      product: 'SCHOOL',
      organizationId: orgId,
      resourceKey: prepared.resourceEntry.applicability.resourceKey,
      resourceVersion: '1.0.0',
      purpose: 'HISTORY',
    }))).resolves.toMatchObject({ compositeId: prepared.compositeId })

    // 7. Verify revocations match currentRunPopulationAuthoritySql 100% identically
    await db.organizationAccessDeny.create({
      data: { id: randomUUID(), organizationId: orgId, userId: student.id, permission: 'RUN_START', reason: 'test', deniedByUserId: admin.id },
    })
    const deniedAccess = await checkCampusCompositeAccessDetails({ attemptId, userId: student.id })
    expect(deniedAccess.allowed).toBe(false)
    const [sqlDenied] = await db.$queryRaw<Array<{ ok: boolean }>>`
      SELECT ${currentRunPopulationAuthoritySql(Prisma.sql`${executionId}`, 'COLLECTION', 'CAMPUS_ONLY')} AS "ok"
    `
    expect(sqlDenied?.ok).toBe(false)
    expect(await checkSingleExecutionPopulationAuthority(db, { executionId, purpose: 'COLLECTION', productScope: 'CAMPUS_ONLY' })).toBe(false)
    const deniedTasks = await listCampusStudentTasks(studentPrincipal, { page: 1, pageSize: 20, kind: 'MEASUREMENT' })
    expect(deniedTasks.list).toHaveLength(0)
  })

  it('Teacher my-scale-tasks, START, and HUITEACHER_ONLY authority run without force_custom_plan and enforce revocations identically', async () => {
    const tag = randomUUID().replace(/-/g, '').slice(0, 8)
    const manager = await db.user.create({
      data: { id: randomUUID(), username: `p1p2_tmgr_${tag}`, passwordHash: 'synthetic', role: 'TEACHER', accountDomain: 'SCHOOL', teacherApproved: true },
    })
    const teacher = await db.user.create({
      data: { id: randomUUID(), username: `p1p2_tchr_${tag}`, passwordHash: 'synthetic', role: 'TEACHER', accountDomain: 'SCHOOL', teacherApproved: true },
    })
    const orgId = randomUUID()
    await db.organization.create({
      data: { id: orgId, name: `TeacherOrg ${tag}`, productDomain: 'SCHOOL', createdByUserId: manager.id },
    })
    const mgrMember = await db.organizationMembership.create({
      data: { id: randomUUID(), organizationId: orgId, userId: manager.id, orgRole: 'ORG_ADMIN', validFrom: new Date(Date.now() - 60_000) },
    })
    const teacherMember = await db.organizationMembership.create({
      data: { id: randomUUID(), organizationId: orgId, userId: teacher.id, orgRole: 'MEMBER', validFrom: new Date(Date.now() - 60_000) },
    })
    for (const m of [mgrMember, teacherMember]) {
      await db.organizationPersonaGrant.create({
        data: { id: randomUUID(), organizationId: orgId, membershipId: m.id, persona: 'TEACHER', grantedByUserId: manager.id },
      })
    }
    await db.educationProductEntitlement.create({
      data: { organizationId: orgId, product: 'HUITEACHER', status: 'ACTIVE', grantedByUserId: manager.id },
    })
    await db.educationProductRoleGrant.create({
      data: { id: randomUUID(), organizationId: orgId, membershipId: mgrMember.id, product: 'HUITEACHER', role: 'PRODUCT_ADMIN', grantedByUserId: manager.id },
    })

    // Register, review, publish & license a real TEACHER_INDIVIDUAL scale (exact production teacher flow)
    const sysAdmin = await db.user.create({
      data: { id: randomUUID(), username: `p1p2_sys_${tag}`, passwordHash: 'synthetic', accountDomain: 'TRAINING', role: 'ADMIN', platformRole: 'SYSTEM_ADMIN' },
    })
    const entryAdmin = await db.user.create({
      data: { id: randomUUID(), username: `p1p2_ent_${tag}`, passwordHash: 'synthetic', accountDomain: 'TRAINING', platformRole: 'STANDARD', role: 'TEACHER', teacherApproved: true },
    })
    await db.adminEntryGrant.create({ data: { id: randomUUID(), userId: entryAdmin.id, entry: 'HUITEACHER', grantedBy: sysAdmin.id } })
    const def = createCustomScaleDefinition()
    def.respondentType = 'teacher_self_report'
    def.source.title = `P1P2 Teacher Scale ${tag}`
    def.items = ['Q1', 'Q2'].map((itemCode, sortOrder) => ({
      itemCode, sortOrder, content: `Teacher item ${sortOrder + 1}`,
      type: 'single', required: true, responseSetKey: 'default', randomizeOptions: false,
    }))
    def.scoring.itemRules = def.items.map(item => ({ itemCode: item.itemCode, transform: { type: 'identity' as const } }))
    def.scoring.scores = [{
      key: 'support', type: 'total', label: '自我支持体验',
      direction: 'descriptive', canonical: true, displayPrecision: 1,
      source: { type: 'items', aggregation: 'sum', items: def.items.map(item => ({ itemCode: item.itemCode, weight: 1 })) },
    }]
    def.report.primaryScoreKeys = ['support']
    def.report.scoreOrder = ['support']
    def.report.audienceContract = {
      schemaVersion: 1, respondent: 'ADULT_SELF', audience: 'teacher', locale: 'zh-CN',
      qcReview: { reviewer: 'synthetic-test-independent-editor', reviewedAt: '2026-10-12T00:00:00.000Z', basis: 'Isolated P1P2 test fixture' },
    }
    def.report.interpretations = [{
      scoreKey: 'support', headline: '你对支持资源的体验', source: { type: 'score_only' },
      summary: '这两道题反映你最近一次填写问卷时对工作支持的主观感受。它们不能代表你所有的工作经历，也不能判断你是否是一位优秀教师。你可以回想某一次与同事协作或者寻求学校帮助的经历：当时真正帮助到你的是什么？哪些支持还不够具体？如果近期工作负担明显增加，可以把需要的时间、资源或者协作方式写下来，与信任的同事或学校沟通。再次测量前，也可以观察自己的工作环境是否发生了变化。',
      bands: [],
      guidance: [
        { category: 'reflection', text: '回想最近一次获得实际支持的情境，记录哪种帮助起到了作用。' },
        { category: 'strategy', text: '选出一个现实可行的需求，尝试与团队约定下一步行动。' },
      ],
    }]
    const scale = await db.scale.create({
      data: {
        code: `p1p2_tscale_${tag}`, name: `Teacher Scale ${tag}`, status: 'PUBLISHED',
        creatorId: sysAdmin.id, instrumentClass: 'CUSTOM_DESCRIPTIVE',
        definition: def as any, definitionHash: hashScaleDefinition(def),
      },
    })
    await publishRegisteredScaleFixture(db, scale.id)
    const sysActor = { userId: sysAdmin.id, platformRole: 'SYSTEM_ADMIN' }
    const registered = await registerDescriptiveResource(sysActor, scale.id, 'TEACHER_INDIVIDUAL')
    const reviewer = await independentReviewer(sysActor)
    await transitionDescriptiveResource(reviewer, registered.id, 'review')
    await transitionDescriptiveResource(sysActor, registered.id, 'publish')
    await changeTeacherScaleLicense({ organizationId: orgId, resourceId: registered.id, actorUserId: entryAdmin.id, action: 'GRANT' })

    const target = await createHuiteacherTarget({ organizationId: orgId, actorUserId: manager.id, kind: 'ORGANIZATION', name: `Target ${tag}` })
    const event = await createHuiteacherEvent({ organizationId: orgId, actorUserId: manager.id, targetId: target.id, kind: 'ASSESSMENT', title: `Event ${tag}` })
    const runDraft = await createHuiteacherEventRunDraft({ organizationId: orgId, actorUserId: manager.id, eventId: event.id, name: `TRun ${tag}` })
    const scope = { organizationId: orgId, actorUserId: manager.id, eventId: event.id }
    await addTeacherRunTrack({
      ...scope,
      resource: { family: 'SCALE', key: registered.resource_key, version: registered.resource_version },
      subjectSelector: { kind: 'MEMBERSHIP_IDS', membershipIds: [teacherMember.id] },
      respondentSelector: { kind: 'MEMBERSHIP_IDS', membershipIds: [teacherMember.id] },
      requestedPolicy: {
        subjectRoles: ['TEACHER'],
        respondentRoles: ['TEACHER'],
        relationshipKinds: ['SELF'],
        perspectives: ['SELF_REPORT'],
        analysisMode: 'INDIVIDUAL_ONLY',
        minimumRespondents: null,
        visibilityPolicyKey: 'HUITEACHER_ADULT_SELF_PILOT_V1',
      },
    })
    await transitionHuiteacherEvent({ ...scope, action: 'OPEN', expectedVersion: 1 })
    const state = await readHuiteacherEventRun(scope)
    await publishTeacherRun({ ...scope, expectedVersion: state.version })

    // 1. listOwnTeacherScaleTasks runs with ZERO force_custom_plan
    const tracedTeacherTasks = await traceSql(() => listOwnTeacherScaleTasks(teacher.id))
    expect(tracedTeacherTasks.forceCustomPlanCalls).toBe(0)
    expect(tracedTeacherTasks.result.list).toHaveLength(1)
    const executionId = tracedTeacherTasks.result.list[0]!.executionId

    // 2. Teacher START runs with ZERO force_custom_plan
    const tracedStart = await traceSql(() => startAssessmentRunExecution({
      executionId,
      actorUserId: teacher.id,
      startPreflight: {
        organizationId: orgId,
        runId: runDraft.runId,
        respondentUserId: teacher.id,
        runtimeBindingKind: null,
        runtimeBindingRef: null,
        preloadCompositeId: registered.composite_id,
      },
    }))
    expect(tracedStart.forceCustomPlanCalls).toBe(0)
    expect(tracedStart.result.state).toBe('STARTED')
    if (tracedStart.result.state !== 'STARTED') throw new Error('expected STARTED')

    // 3. Decomposed HUITEACHER_ONLY authority runs with ZERO force_custom_plan and matches SQL predicate across RUN_START vs REPORT_READ denies
    const tracedAuth = await traceSql(() => checkSingleExecutionPopulationAuthority(db, {
      executionId,
      purpose: 'COLLECTION',
      productScope: 'HUITEACHER_ONLY',
    }))
    expect(tracedAuth.forceCustomPlanCalls).toBe(0)
    expect(tracedAuth.result).toBe(true)

    const deny = await db.organizationAccessDeny.create({
      data: { id: randomUUID(), organizationId: orgId, userId: teacher.id, permission: 'RUN_START', reason: 'teacher deny test', deniedByUserId: manager.id },
    })
    for (const purpose of ['COLLECTION', 'REPORT_READ'] as const) {
      const [legacy] = await db.$queryRaw<Array<{ ok: boolean }>>`
        SELECT ${currentRunPopulationAuthoritySql(Prisma.sql`${executionId}`, purpose, 'HUITEACHER_ONLY')} AS "ok"
      `
      const fast = await checkSingleExecutionPopulationAuthority(db, { executionId, purpose, productScope: 'HUITEACHER_ONLY' })
      expect(fast).toBe(legacy?.ok)
    }
    expect(await checkSingleExecutionPopulationAuthority(db, { executionId, purpose: 'COLLECTION', productScope: 'HUITEACHER_ONLY' })).toBe(false)
    expect(await checkSingleExecutionPopulationAuthority(db, { executionId, purpose: 'REPORT_READ', productScope: 'HUITEACHER_ONLY' })).toBe(true)
    expect((await listOwnTeacherScaleTasks(teacher.id)).list).toHaveLength(0)

    await db.organizationAccessDeny.update({ where: { id: deny.id }, data: { liftedAt: new Date(), liftedByUserId: manager.id } })
    expect((await listOwnTeacherScaleTasks(teacher.id)).list).toHaveLength(1)
  })
})
