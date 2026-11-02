import { z } from 'zod'
import { prisma } from '../../config/database'
import { canonicalHash } from '../assessment-runtime/canonical'
import { compositeItemSlotKey } from '../assessment-runtime/slot-set'
import { createAttemptConsent } from '../assessment-identity/identity'
import { buildRelationalAssignment } from '../assessment-relational/assignment'
import { resolveParentChildRelationship, resolveCourseTeacherStudentRelationship } from '../assessment-relational/relationship'
import { createSqlRelationalAssignmentRepository } from '../assessment-relational/repository'
import { createRelationalAssessmentService } from '../assessment-relational/service'
import { createRelationalProductService, parentRelationshipRecord, persistConsent } from '../assessment-relational/product.service'
import type { RelationalAssignmentRecordV1 } from '../assessment-relational/types'
import { startRelationalCompositeAttemptInTransaction, getAttemptState } from '../composite/composite.service'
import { compositeBadRequest, compositeConflict, compositeForbidden, compositeNotFound } from '../composite/composite.errors'
import { encryptCognitivePayload, decryptCognitivePayload } from '../cognitive/cognitive.security'
import { readInstance } from './instance'
import { bundleProductService } from './service'
import { freezeBundleProductionDefinition, readFrozenBundleProductionDefinition, type FrozenBundleProductionDefinitionV1 } from './definition-provider'
import { projectBundleCognitiveSourceFromCanonicalBridge, projectBundleScaleSourceFromCanonicalBridge } from '../assessment-bundle/sources'
import { compileBundleRuntimeFromFrozenRead } from '../assessment-bundle/compile'
import { projectBundleReportFacts, projectBundleAudienceView } from '../assessment-bundle/report-facts'
import { validateBundleReportFacts } from '../assessment-bundle/evidence'
import { createProductBundleAnalysisEngineRegistry } from '../assessment-bundle/bootstrap'
import { computeReanalysisAggregateInputHash } from '../assessment-reanalysis/reanalysis'
import { loadFrozenScaleRuntimeSnapshot } from '../assessment-runtime/runtime-snapshot'
import { scaleProjectionPolicyFromCompiled } from '../scale/projection/policy-resolver'
import { resolveAudienceDisclosure } from '../scale/policy/disclosure'

const prefix = 'child_cross_method:'
type Actor = { userId: string; role: string }
const text = z.string().min(1).max(200)
export const childRoundInput = z.object({ requestId: z.string().uuid(), subjectUserId: text,
  taskCompositeId: text, reportBundleKey: text, reportBundleVersion: z.string().regex(/^\d+\.\d+\.\d+$/),
  parent: z.object({ userId: text, compositeId: text }).strict().optional(), teacherObserverCompositeId: text.optional(),
}).strict().refine(v => v.parent || v.teacherObserverCompositeId, '至少选择一个真实成人观察者')

/** No identity inference from userId, names, timestamps or approximate rounds. */
export function assertChildSourceBinding(assignment: RelationalAssignmentRecordV1, attempt: any, episodeId: string) {
  const expected = assignment.relationshipKind === 'SELF' ? 'SELF' : assignment.respondentRole
  if (!attempt || attempt.status !== 'COMPLETED' || assignment.status !== 'COMPLETED'
    || assignment.episodeId !== episodeId || attempt.episodeId !== episodeId
    || attempt.subjectUserId !== assignment.subjectUserId || attempt.respondentUserId !== assignment.respondentUserId
    || attempt.userId !== assignment.respondentUserId || attempt.respondentType !== expected
    || attempt.assignmentRef !== assignment.assignmentId || attempt.compositeAssessmentId !== assignment.resourceKey
    || !attempt.aggregateInputHash || (expected === 'SELF') !== (assignment.subjectUserId === assignment.respondentUserId)) {
    throw compositeConflict('儿童任务或成人观察的冻结身份／评估轮次不匹配')
  }
}

/** Thin orchestration over the existing episode, assignment, consent, FINAL,
 * canonical projections and BundleAnalysis. No replacement identity or scorer. */
export function createChildCrossMethodService(db: any = prisma, hooks: {
  eligible?: typeof bundleProductService.eligible
  readInputs?: (attemptId: string) => Promise<any>
  startRuntime?: typeof startRelationalCompositeAttemptInTransaction
  attemptState?: typeof getAttemptState
} = {}) {
  const eligible = hooks.eligible ?? bundleProductService.eligible
  const readInputs = hooks.readInputs ?? (async (id: string) => (await import('../assessment-runtime/unified-aggregate-finalizer.service')).readCompletedCompositeBundleInputs(id))
  const startRuntime = hooks.startRuntime ?? startRelationalCompositeAttemptInTransaction
  const attemptState = hooks.attemptState ?? getAttemptState
  async function episodeFor(id: string, tx = db) {
    const episode = await tx.assessmentEpisode.findUnique({ where: { id } })
    if (!episode || !episode.campaignKey?.startsWith(prefix)) throw compositeNotFound('儿童跨方法评估轮次不存在')
    return episode
  }
  function staff(actor: Actor, episode: any) {
    if (actor.role !== 'TEACHER' || episode.initiatedByUserId !== actor.userId) throw compositeForbidden('只有本轮分配教师可以汇集或读取联合报告')
  }
  async function records(episodeId: string, tx = db) {
    const rows = await tx.relationalAssessmentAssignment.findMany({ where: { episodeId }, orderBy: { id: 'asc' }, take: 4, select: { id: true } })
    if (rows.length < 2 || rows.length > 3) throw compositeConflict('儿童评估必须包含一个儿童任务及一至两个独立成人观察')
    const repository = createSqlRelationalAssignmentRepository(tx)
    const values = await Promise.all(rows.map((r: any) => repository.findById(r.id).then(a => { if (!a || a.policyDomain !== 'LEGACY_COURSE') throw compositeConflict('评估分配来源不匹配'); return a })))
    const order = (a: RelationalAssignmentRecordV1) => a.relationshipKind === 'SELF' ? 0 : a.respondentRole === 'PARENT' ? 1 : 2
    return values.sort((a, b) => order(a) - order(b))
  }
  async function template(id: string, teacherId: string, tx = db) {
    const row = await tx.compositeAssessment.findUnique({ where: { id }, include: { bundleInstance: true } })
    if (!row || row.createdBy !== teacherId || !row.courseId || row.publicEnabled || row.status !== 'PUBLISHED'
      || row.productKind !== 'ASSESSMENT_BUNDLE' || !row.bundleInstance) throw compositeForbidden('必须选择本教师已发布的课程固定测评包')
    const { frozen } = readInstance(row.bundleInstance)
    await eligible({ userId: teacherId, role: 'TEACHER' } as any, frozen.bundleSnapshot.bundleKey, frozen.bundleSnapshot.bundleVersion, tx)
    return { row, frozen }
  }
  async function acceptedForTeacher(a: RelationalAssignmentRecordV1, teacherId: string, tx = db) {
    if (a.relationshipKind === 'SELF') return null
    const repository = createSqlRelationalAssignmentRepository(tx)
    const resolved = await repository.resolveAcceptedConsent(a)
    if (!resolved) throw compositeForbidden('观察者同意尚未接受或已经撤销')
    const root = await tx.assessmentAttemptConsent.findUnique({ where: { id: a.consentId } })
    if (!Array.isArray(root?.shareTargetsJson) || !root.shareTargetsJson.includes(teacherId)
      || root.visibilityScope !== 'ASSIGNING_TEACHER') throw compositeForbidden('观察结果未分享给本轮教师')
    return resolved.consentId
  }
  const keyFor = (a: RelationalAssignmentRecordV1) => a.relationshipKind === 'SELF' ? 'tasks' : a.respondentRole.toLowerCase() + '_chexi'
  return {
    async options(actor: Actor) {
      if (actor.role !== 'TEACHER') throw compositeForbidden()
      const rows = await db.compositeAssessment.findMany({ where: { createdBy: actor.userId, productKind: 'ASSESSMENT_BUNDLE', status: 'PUBLISHED', publicEnabled: false, courseId: { not: null } }, include: { bundleInstance: true, course: { select: { title: true } } }, take: 200 })
      const templates = rows.flatMap((row: any) => {
        if (!row.bundleInstance) return []
        const { frozen } = readInstance(row.bundleInstance), d = frozen.bundleSnapshot.bundleDefinition
        if (d.bundleKey !== 'child_cognitive_tasks_zh_cn' && !d.bundleKey.startsWith('child_chexi_')) return []
        return [{ id: row.id, name: row.name, courseId: row.courseId, courseTitle: row.course.title, respondentType: d.respondentTypes[0] }]
      })
      const catalog = await bundleProductService.catalog(actor as any)
      return { templates, reports: catalog.filter(c => c.bundleKey.startsWith('child_cognitive_control_') && c.canInstantiate) }
    },
    async rounds(actor: Actor) {
      if (actor.role !== 'TEACHER') throw compositeForbidden()
      return db.assessmentEpisode.findMany({ where: { initiatedByUserId: actor.userId, campaignKey: { startsWith: prefix } }, orderBy: { createdAt: 'desc' }, take: 100,
        select: { id: true, createdAt: true, subject: { select: { nickname: true, username: true } }, relationalAssignments: { select: { id: true, respondentRole: true, status: true } } } })
    },
    async issue(actor: Actor, raw: unknown) {
      if (actor.role !== 'TEACHER') throw compositeForbidden('请由课程教师分配儿童跨方法评估')
      const input = childRoundInput.parse(raw)
      const run = () => db.$transaction(async (tx: any) => {
        const targetEntry = await eligible(actor as any, input.reportBundleKey, input.reportBundleVersion, tx)
        if (!targetEntry.definition.bundleKey.startsWith('child_cognitive_control_') || !targetEntry.declarativePackage) throw compositeBadRequest('不是儿童跨方法报告包')
        const target = freezeBundleProductionDefinition(targetEntry, { frozenAt: new Date().toISOString(), sourceReference: 'code-catalog' })
        const task = await template(input.taskCompositeId, actor.userId, tx), courseId = task.row.courseId
        const course = await tx.course.findUnique({ where: { id: courseId } })
        const membership = await tx.courseStudent.findUnique({ where: { courseId_studentId: { courseId, studentId: input.subjectUserId } } })
        const child = await tx.user.findUnique({ where: { id: input.subjectUserId } })
        if (!course || course.creatorId !== actor.userId || course.isLibrary || !['ACTIVE','APPROVED'].includes(membership?.status)
          || child?.role !== 'STUDENT' || !child.isActive || child.isFrozen) throw compositeForbidden('儿童与当前课程名单不匹配')
        if (task.frozen.bundleSnapshot.bundleKey !== 'child_cognitive_tasks_zh_cn'
          || task.frozen.bundleSnapshot.slotBindings.some(s => s.respondentType !== 'SELF' || s.unitType !== 'COGNITIVE')) throw compositeBadRequest('儿童任务组件身份不匹配')
        const selections: Array<{ role: 'SELF'|'PARENT'|'TEACHER'; userId: string; source: typeof task; relation: any }> = [{ role: 'SELF', userId: child.id, source: task,
          relation: { schemaVersion: 1, relationshipKind: 'SELF', relationshipRef: null, subjectUserId: child.id, subjectRole: 'STUDENT', respondentUserId: child.id, respondentRole: 'STUDENT', courseId, verifiedAt: new Date().toISOString(), facts: {} } }]
        if (input.parent) {
          const relation = await tx.parentStudentRelationship.findFirst({ where: { parentUserId: input.parent.userId, studentUserId: child.id, status: 'ACTIVE' } })
          if (!relation) throw compositeForbidden('请使用现有已生效的亲子关系')
          const source = await template(input.parent.compositeId, actor.userId, tx)
          selections.push({ role: 'PARENT', userId: input.parent.userId, source, relation: resolveParentChildRelationship({ relationship: parentRelationshipRecord(relation), subjectUserId: child.id, subjectRole: 'STUDENT', respondentUserId: input.parent.userId, respondentRole: 'PARENT' }) })
        }
        if (input.teacherObserverCompositeId) selections.push({ role: 'TEACHER', userId: actor.userId, source: await template(input.teacherObserverCompositeId, actor.userId, tx), relation: resolveCourseTeacherStudentRelationship({ courseId, courseCreatorUserId: actor.userId, membershipStudentUserId: child.id, membershipStatus: membership.status, subjectUserId: child.id, subjectRole: 'STUDENT', respondentUserId: actor.userId, respondentRole: 'TEACHER' }) })
        for (const selection of selections.slice(1)) {
          const slots = selection.source.frozen.bundleSnapshot.slotBindings.filter(s => s.unitType !== 'FORM')
          const observers = targetEntry.definition.slots.filter(s => s.unitType === 'SCALE')
          const expected = observers.find(s => s.respondentType === selection.role)
          if (selection.source.row.courseId !== courseId || slots.length !== 1 || slots[0].unitType !== 'SCALE'
            || !expected || expected.instrumentKey !== 'chexi_zh_hans'
            || observers.some(s => s.instrumentKey !== expected.instrumentKey || s.instrumentVersion !== expected.instrumentVersion)
            || slots[0].instrumentKey !== expected.instrumentKey || slots[0].instrumentVersion !== expected.instrumentVersion
            || slots[0].respondentType !== selection.role) throw compositeBadRequest('观察配置必须使用同一CHEXI精确版本与真实成人角色')
        }
        const wanted = ['SELF', ...selections.slice(1).map(s => s.role)].sort()
        if (JSON.stringify([...targetEntry.definition.respondentTypes].sort()) !== JSON.stringify(wanted)) throw compositeBadRequest('联合报告配置与实际报告者不匹配')
        const campaignKey = prefix + input.reportBundleKey + '@' + input.reportBundleVersion + ':' + target.contentHash
        const previous = await tx.assessmentEpisode.findUnique({ where: { id: input.requestId } })
        if (previous) {
          if (previous.initiatedByUserId !== actor.userId || previous.subjectUserId !== child.id || previous.courseId !== courseId || previous.campaignKey !== campaignKey) throw compositeConflict('同一请求不能更改评估轮次')
          const existing = await records(previous.id, tx)
          if (existing.length !== selections.length || selections.some(s => !existing.some(a => a.resourceKey === s.source.row.id && a.respondentUserId === s.userId))) throw compositeConflict('同一请求不能更改儿童或观察者来源')
          return { episodeId: previous.id, assignments: existing.map(a => ({ assignmentId: a.assignmentId, respondentType: a.relationshipKind === 'SELF' ? 'SELF' : a.respondentRole, respondentUserId: a.respondentUserId })) }
        }
        const episode = await tx.assessmentEpisode.create({ data: { id: input.requestId, subjectUserId: child.id, initiatedByUserId: actor.userId, initiationMode: 'TEACHER_CAMPAIGN', courseId, campaignKey, label: '儿童认知控制与日常观察' } })
        const repository = createSqlRelationalAssignmentRepository(tx), assignments = []
        for (const s of selections) {
          const consent = s.role === 'SELF' ? null : createAttemptConsent({ subjectUserId: child.id, respondentUserId: s.userId, respondentType: s.role, consentVersion: 'relational-attempt-v1', purpose: s.role === 'PARENT' ? 'teacher_assigned_parent_observer' : 'teacher_self_report_observer', visibilityScope: 'ASSIGNING_TEACHER', shareTargets: [actor.userId], pending: s.role === 'PARENT' })
          if (consent) await persistConsent(tx, consent)
          const applicability = { schemaVersion: 1 as const, resourceKind: 'BUNDLE' as const, resourceKey: s.source.row.id, resourceVersion: s.source.frozen.bundleSnapshot.bundleVersion,
            subjectRoles: ['STUDENT' as const], respondentRoles: [s.role === 'SELF' ? 'STUDENT' as const : s.role], relationshipKinds: [s.relation.relationshipKind], perspectives: [s.role === 'SELF' ? 'SELF_REPORT' as const : 'OBSERVER_REPORT' as const], analysisMode: 'INDIVIDUAL_ONLY' as const, visibilityPolicyKey: 'observer_assigning_teacher_v1', minimumRespondents: null }
          const a = buildRelationalAssignment({ applicability, relationshipSnapshot: s.relation, perspective: applicability.perspectives[0], episodeId: episode.id, createdByUserId: actor.userId, consentId: consent?.consentId ?? null })
          await repository.create(a)
          assignments.push({ assignmentId: a.assignmentId, respondentType: s.role, respondentUserId: s.userId })
        }
        return { episodeId: episode.id, assignments }
      })
      try { return await run() } catch (error: any) {
        // The UUID is also the existing episode's unique key. A concurrent
        // retry re-enters the exact same validation and reads the winner.
        if (error?.code === 'P2002') return run()
        throw error
      }
    },
    async tasks(actor: Actor) {
      const rows = await db.relationalAssessmentAssignment.findMany({ where: { respondentUserId: actor.userId, episode: { campaignKey: { startsWith: prefix } } }, orderBy: { createdAt: 'desc' }, take: 100,
        select: { id: true, episodeId: true, subjectUserId: true, subject: { select: { nickname: true, username: true } }, respondentRole: true, relationshipKind: true, status: true, consentId: true } })
      const repository = createSqlRelationalAssignmentRepository(db)
      return Promise.all(rows.map(async (r: any) => {
        const a = r.respondentRole === 'PARENT' && r.status === 'OPEN' ? await repository.findById(r.id) : null
        return { assignmentId: r.id, episodeId: r.episodeId, subjectUserId: r.subjectUserId, subjectName: r.subject?.nickname || r.subject?.username || '儿童', respondentType: r.relationshipKind === 'SELF' ? 'SELF' : r.respondentRole, status: r.status,
          consentRequired: r.respondentRole === 'PARENT' && r.status === 'OPEN' && (!a || !await repository.resolveAcceptedConsent(a)) }
      }))
    },
    async accept(actor: Actor, assignmentId: string) {
      const a = await createSqlRelationalAssignmentRepository(db).findById(assignmentId)
      if (!a) throw compositeNotFound()
      await episodeFor(a.episodeId)
      return createRelationalProductService(undefined, db).acceptConsent({ assignmentId, userId: actor.userId, role: actor.role as any })
    },
    async start(actor: Actor, assignmentId: string) {
      const launched = await db.$transaction(async (tx: any) => {
        const repository = createSqlRelationalAssignmentRepository(tx), a = await repository.findById(assignmentId)
        if (!a || a.respondentUserId !== actor.userId || a.respondentRole !== actor.role || a.policyDomain !== 'LEGACY_COURSE') throw compositeForbidden('只有分配到的真实作答者可以开始')
        const episode = await episodeFor(a.episodeId, tx)
        const prior = await tx.compositeAssessmentAttempt.findFirst({ where: { assignmentRef: a.assignmentId }, orderBy: { startedAt: 'desc' } })
        if (prior) {
          const expectedType = a.relationshipKind === 'SELF' ? 'SELF' : a.respondentRole
          if (prior.userId !== actor.userId || prior.subjectUserId !== a.subjectUserId || prior.respondentUserId !== actor.userId || prior.respondentType !== expectedType || prior.episodeId !== a.episodeId || prior.compositeAssessmentId !== a.resourceKey
            || !['STARTED', 'COMPLETED'].includes(a.status) || !['IN_PROGRESS', 'COMPLETED'].includes(prior.status)) throw compositeConflict('运行记录与本轮分配不匹配')
          if (a.consentId && !await repository.resolveAcceptedConsent(a)) throw compositeForbidden('观察者同意已失效')
          return prior
        }
        await template(a.resourceKey, episode.initiatedByUserId, tx)
        const started = await createRelationalAssessmentService(repository).start({ assignmentId, actorUserId: actor.userId })
        return startRuntime(tx, { compositeAssessmentId: a.resourceKey, respondentUserId: actor.userId, attemptIdentity: started.attemptIdentity })
      })
      return { attemptId: launched.id, state: await attemptState(launched.id, { userId: actor.userId }) }
    },
    async sourceReport(actor: Actor, assignmentId: string) {
      const a = await createSqlRelationalAssignmentRepository(db).findById(assignmentId)
      if (!a || a.respondentUserId !== actor.userId || a.respondentRole !== actor.role) throw compositeForbidden()
      const episode = await episodeFor(a.episodeId)
      const attempt = await db.compositeAssessmentAttempt.findFirst({ where: { assignmentRef: a.assignmentId }, orderBy: { startedAt: 'desc' } })
      assertChildSourceBinding(a, attempt, episode.id)
      if (a.consentId && !await createSqlRelationalAssignmentRepository(db).resolveAcceptedConsent(a)) throw compositeForbidden('观察者同意已失效')
      const analysis = await import('./analysis')
      return analysis.readReport(attempt.id, actor.role === 'STUDENT' ? 'student' : actor.role === 'PARENT' ? 'parent' : 'teacher', undefined, db)
    },
    async collect(actor: Actor, episodeId: string, requestId: string) {
      z.string().uuid().parse(requestId)
      const episode = await episodeFor(episodeId); staff(actor, episode)
      const assignments = await records(episodeId), children = assignments.filter(a => a.relationshipKind === 'SELF')
      if (children.length !== 1 || new Set(assignments.map(keyFor)).size !== assignments.length) throw compositeConflict('本轮必须有一位儿童与各自独立的成人观察')
      const sources: Array<{ assignment: RelationalAssignmentRecordV1; attempt: any }> = []
      for (const a of assignments) {
        if (a.subjectUserId !== episode.subjectUserId || a.createdByUserId !== actor.userId) throw compositeForbidden('评估主体或分配教师不匹配')
        const attempt = await db.compositeAssessmentAttempt.findFirst({ where: { assignmentRef: a.assignmentId }, orderBy: { startedAt: 'desc' } })
        if (a.status === 'COMPLETED' && (!attempt || attempt.status !== 'COMPLETED')) throw compositeConflict('已完成分配与冻结作答记录不匹配')
        if (!attempt || attempt.status !== 'COMPLETED' || a.status !== 'COMPLETED') return { status: 'WAITING', pendingAssignments: assignments.filter(x => x.status !== 'COMPLETED').map(x => ({ assignmentId: x.assignmentId, respondentType: keyFor(x) })) }
        if (attempt.consentId !== await acceptedForTeacher(a, actor.userId)) throw compositeForbidden('来源与已接受的观察者同意不匹配')
        assertChildSourceBinding(a, attempt, episodeId)
        sources.push({ assignment: a, attempt })
      }
      const child = sources.find(s => s.assignment.relationshipKind === 'SELF')!
      const prior = await db.bundleAnalysis.findUnique({ where: { attemptId_attemptEpoch_requestKey: { attemptId: child.attempt.id, attemptEpoch: child.attempt.attemptEpoch, requestKey: requestId } } })
      if (prior) {
        if (prior.purpose !== 'REANALYSIS' || prior.generatedBy !== actor.userId) throw compositeConflict('同一请求已用于其他分析')
        return this.read(actor, prior.id)
      }
      const match = /^child_cross_method:([a-z][a-z0-9_]*)@(\d+\.\d+\.\d+):([a-f0-9]{64})$/.exec(episode.campaignKey)
      if (!match) throw compositeConflict('评估报告身份不完整')
      const entry = await eligible(actor as any, match[1], match[2])
      const base = freezeBundleProductionDefinition(entry, { frozenAt: new Date().toISOString(), sourceReference: 'code-catalog' })
      if (base.contentHash !== match[3]) throw compositeConflict('评估报告版本内容已变化')
      const refs = sources.map(({ assignment: a, attempt: t }) => ({ slotKey: keyFor(a), attemptId: t.id, assignmentId: a.assignmentId, episodeId, subjectUserId: a.subjectUserId, respondentUserId: a.respondentUserId, respondentType: (a.relationshipKind === 'SELF' ? 'SELF' : a.respondentRole) as 'SELF'|'PARENT'|'TEACHER', attemptEpoch: t.attemptEpoch, parentInputHash: t.aggregateInputHash }))
      const { freezeHash: _old, ...material } = base
      const frozenMaterial = { ...material, crossMethodSources: refs }, target = readFrozenBundleProductionDefinition({ ...frozenMaterial, freezeHash: canonicalHash(frozenMaterial) })
      const cognitive = [], scale = []
      for (const { assignment: a, attempt: t } of sources) {
        const source = await readInputs(t.id)
        assertChildSourceBinding(a, source.parent, episodeId)
        if (source.parent.attemptEpoch !== t.attemptEpoch || source.parent.aggregateInputHash !== t.aggregateInputHash) throw compositeConflict('来源尝试已变化')
        const { frozen, bindings } = readInstance(source.parent.compositeAssessment.bundleInstance)
        for (const binding of bindings.slots) {
          const declared = frozen.bundleSnapshot.slotBindings.find(s => s.slotKey === binding.slotKey)!
          const targetSlotKey = a.relationshipKind === 'SELF' ? binding.slotKey : keyFor(a)
          const expected = target.bundleSnapshot.slotBindings.find(s => s.slotKey === targetSlotKey)
          if (!expected || expected.respondentType !== (a.relationshipKind === 'SELF' ? 'SELF' : a.respondentRole)
            || expected.instrumentKey !== declared.instrumentKey || expected.instrumentVersion !== declared.instrumentVersion || expected.unitType !== declared.unitType) throw compositeConflict('任务或量表精确来源不匹配')
          const payload = source.payloads.find((v: any) => v.header.slotKey === compositeItemSlotKey(binding.itemId, declared.unitType as any))
          if (!payload?.envelope) throw compositeConflict('缺少已冻结的单项结果')
          const input = { slotKey: targetSlotKey, expectedInstrumentKey: expected.instrumentKey, expectedInstrumentVersion: expected.instrumentVersion, envelope: payload.envelope }
          if (declared.unitType === 'COGNITIVE') cognitive.push(projectBundleCognitiveSourceFromCanonicalBridge(input))
          else if (declared.unitType === 'SCALE') scale.push(projectBundleScaleSourceFromCanonicalBridge(input))
          else throw compositeConflict('儿童跨方法来源仅包含认知任务及CHEXI观察')
        }
      }
      const snapshot = target.bundleSnapshot, compiledRuntime = compileBundleRuntimeFromFrozenRead({ family: 'ASSESSMENT_BUNDLE', snapshotVersion: 3, snapshot })
      const aggregateInputHash = computeReanalysisAggregateInputHash({ snapshotHash: snapshot.snapshotHash, compiledBundleRuntimeHash: compiledRuntime.compiledRuntimeHash, cognitiveSources: cognitive, scaleSources: scale, situationalSources: [], contextSnapshotHash: null })
      const facts = projectBundleReportFacts({ registry: createProductBundleAnalysisEngineRegistry(), engineInput: { snapshot, compiledRuntime, aggregateInputHash, cognitiveSources: cognitive, scaleSources: scale, evidence: [], contextFacts: null, declarativePackage: target.declarativePackage } })
      const row = await db.$transaction(async (tx: any) => {
        await tx.$queryRaw`SELECT id FROM assessment_episodes WHERE id=${episodeId} FOR UPDATE`
        for (const { assignment, attempt } of sources) {
          if (attempt.consentId !== await acceptedForTeacher(assignment, actor.userId, tx)) throw compositeForbidden('来源与已接受的观察者同意不匹配')
          const current = await tx.compositeAssessmentAttempt.findUnique({ where: { id: attempt.id } })
          assertChildSourceBinding(assignment, current, episodeId)
          if (current.attemptEpoch !== attempt.attemptEpoch || current.aggregateInputHash !== attempt.aggregateInputHash) throw compositeConflict('来源尝试已变化')
        }
        const prior = await tx.bundleAnalysis.findUnique({ where: { attemptId_attemptEpoch_requestKey: { attemptId: child.attempt.id, attemptEpoch: child.attempt.attemptEpoch, requestKey: requestId } } })
        if (prior && (prior.purpose !== 'REANALYSIS' || prior.generatedBy !== actor.userId)) throw compositeConflict('同一请求已用于其他分析')
        return tx.bundleAnalysis.upsert({ where: { attemptId_attemptEpoch_requestKey: { attemptId: child.attempt.id, attemptEpoch: child.attempt.attemptEpoch, requestKey: requestId } }, update: {}, create: {
          attemptId: child.attempt.id, attemptEpoch: child.attempt.attemptEpoch, requestKey: requestId, purpose: 'REANALYSIS',
          reason: '汇集本轮同一儿童及真实成人观察者的已冻结结果',
          status: facts.enginePayload.kind === 'UNAVAILABLE' || ['invalid','unavailable'].includes(facts.quality.overall) ? 'UNAVAILABLE' : 'READY', parentInputHash: child.attempt.aggregateInputHash,
          targetDefinitionHash: target.contentHash, targetDefinitionEncrypted: encryptCognitivePayload(target), aggregateInputHash, payloadEncrypted: encryptCognitivePayload(facts), factsHash: canonicalHash(facts), generatedBy: actor.userId,
        } })
      })
      return this.read(actor, row.id)
    },
    async read(actor: Actor, analysisId: string) {
      const row = await db.bundleAnalysis.findUnique({ where: { id: analysisId } })
      if (!row || row.purpose !== 'REANALYSIS' || row.generatedBy !== actor.userId) throw compositeNotFound()
      const target = readFrozenBundleProductionDefinition(decryptCognitivePayload(row.targetDefinitionEncrypted)), refs = target.crossMethodSources
      if (!refs?.length || target.contentHash !== row.targetDefinitionHash) throw compositeConflict('联合报告来源绑定校验失败')
      const episode = await episodeFor(refs[0].episodeId); staff(actor, episode)
      const facts = validateBundleReportFacts(decryptCognitivePayload(row.payloadEncrypted))
      if (canonicalHash(facts) !== row.factsHash || facts.identity.snapshotHash !== target.bundleSnapshot.snapshotHash || facts.provenance.aggregateInputHash !== row.aggregateInputHash) throw compositeConflict('联合报告快照校验失败')
      const view = projectBundleAudienceView(facts, 'teacher'), allowedSlots = new Set<string>()
      for (const ref of refs) {
        const a = await createSqlRelationalAssignmentRepository(db).findById(ref.assignmentId)
        if (!a || a.episodeId !== episode.id || ref.episodeId !== episode.id || a.subjectUserId !== episode.subjectUserId || a.subjectUserId !== ref.subjectUserId || a.respondentUserId !== ref.respondentUserId || a.createdByUserId !== actor.userId
          || ref.respondentType !== (a.relationshipKind === 'SELF' ? 'SELF' : a.respondentRole)) throw compositeForbidden('来源身份不匹配')
        const current = await db.compositeAssessmentAttempt.findUnique({ where: { id: ref.attemptId } })
        assertChildSourceBinding(a, current, episode.id)
        if (current.attemptEpoch !== ref.attemptEpoch || current.aggregateInputHash !== ref.parentInputHash) throw compositeConflict('来源尝试已变化')
        if (current.consentId !== await acceptedForTeacher(a, actor.userId)) throw compositeForbidden('来源与已接受的观察者同意不匹配')
        if (ref.respondentType === 'SELF') continue
        const admission = await db.assessment.findFirst({ where: { compositeAttemptId: ref.attemptId }, select: { runtimeSnapshotEncrypted: true } })
        let caps: ReturnType<typeof resolveAudienceDisclosure> | null = null
        if (admission?.runtimeSnapshotEncrypted) {
          const runtime = await loadFrozenScaleRuntimeSnapshot(admission.runtimeSnapshotEncrypted, db)
          if (runtime.schemaVersion === 2) {
            const policy = scaleProjectionPolicyFromCompiled(runtime.compiledPolicy)
            if (policy.disposition !== 'UNKNOWN') {
              caps = resolveAudienceDisclosure(policy.disclosure, 'teacher')
              if (runtime.definition?.report.audienceContract?.audience !== 'teacher') caps = { ...caps, individualInterpretations: false }
            }
          }
        }
        if (caps?.individualInterpretations && caps.scoreDerivedLabels) allowedSlots.add(ref.slotKey)
        for (const evidence of view.evidence) if (evidence.sourceKind === 'SCALE_SCORE' && facts.evidence.find(e => e.evidenceKey === evidence.evidenceKey && e.source.kind === 'SCALE_SCORE' && e.source.slotKey === ref.slotKey)) {
          if (!caps?.numericScores) evidence.value = { state: 'redacted' }
          if (!caps?.scoreDerivedLabels) evidence.criterionBandKey = null
          if (!caps?.resultQualityDetails) evidence.quality = 'unavailable'
        }
        if (!caps?.resultQualityDetails) view.quality = { overall: 'unavailable', notes: [] }
      }
      const conclusions = facts.enginePayload.kind === 'COMPUTED' ? (facts.enginePayload.payload as { conclusions: any[] }).conclusions.filter(c => c.evidenceKeys.every((key: string) => {
        const evidence = facts.evidence.find(e => e.evidenceKey === key)
        return evidence?.source.kind !== 'SCALE_SCORE' || allowedSlots.has(evidence.source.slotKey)
      })) : []
      view.engineSummary = { engineKey: facts.enginePayload.engineKey, engineVersion: facts.enginePayload.engineVersion, kind: facts.enginePayload.kind }
      ;(view as any).blocks = target.declarativePackage!.report.blocks.filter(b => b.audience.includes('teacher')).map(b => ({ blockId: b.blockId, kind: b.kind, title: b.title,
        evidence: b.kind === 'evidence' ? view.evidence : [], limitations: b.kind === 'limitations' ? view.limitations : [], conclusions: conclusions.filter(c => b.ruleIds.includes(c.ruleId)) }))
      return { schemaVersion: 1, snapshotFamily: 'ASSESSMENT_BUNDLE', analysisId: row.id, status: row.status, purpose: row.purpose, retryCount: row.retryCount, factsHash: row.factsHash, definitionHash: row.targetDefinitionHash, reportDefinition: target.reportDefinition, createdAt: row.createdAt, view }
    },
  }
}
export const childCrossMethodService = createChildCrossMethodService()
