import { isCognitiveNewAdmissionEnabled } from './product-eligibility'
import type { Prisma } from '@prisma/client'
import { CONFLICT, NOT_FOUND } from './cognitive.errors'
import {canonicalHash} from '../assessment-runtime/canonical'
import {personalTrackingPlanSchema} from '../reporting/personal-tracking'
import {trainingContentAttemptBindingSchema,trainingContentSnapshotSchema} from '../composite/training-content-binding'
import {readVerifiedEducationAttempt,readVerifiedCompositionAttempt,type VerifiedEducationAttempt} from '../assessment-run/education-start-context'

type Tx = Prisma.TransactionClient

/** Persisted course identity, never a hostname or a caller-supplied mode. */
export async function isTrainingTaskCourse(db: Tx, courseId?: string | null) {
  if (!courseId) return false
  const course = await db.course.findUnique({ where: { id: courseId }, select: { courseType: true, isLibrary: true } })
  return course?.courseType === 'TRAINING_COURSE' && !course.isLibrary
}

async function admitCompositeSlot(db: Tx, userId: string, assignmentId: string, scope: CompositeCognitiveQuotaScope, proof?: VerifiedEducationAttempt) {
  const parent = await db.compositeAssessmentAttempt.findUnique({ where: { id: scope.compositeAttemptId }, include: { compositeAssessment: true } })
  if (!parent) throw CONFLICT('组合认知任务的作答记录不存在')
  const composite = parent?.compositeAssessment
  if (!composite) throw CONFLICT('组合认知任务需要有效的父作答准入')
  const educationProduct = parent.assignmentRef
    ? readVerifiedEducationAttempt(proof, db, parent.id, userId)
    : undefined
  // Legacy relational bundle STARTs carry a server-created assignmentRef from
  // createRelationalAssessmentService rather than the newer education START
  // proof. Verify that persisted binding in this same transaction; never
  // accept a caller-provided assignmentRef or an unbound organization task.
  let verifiedRelationalBundle = false
  if (parent.assignmentRef && !educationProduct && composite?.productKind === 'ASSESSMENT_BUNDLE') {
    const assignment = await db.relationalAssessmentAssignment.findUnique({ where: { id: parent.assignmentRef } })
    const respondentType = assignment?.respondentRole === 'PARENT' ? 'PARENT'
      : assignment?.respondentRole === 'TEACHER' ? 'TEACHER'
        : assignment?.relationshipKind === 'SELF' ? 'SELF' : null
    verifiedRelationalBundle = Boolean(assignment
      && assignment.status === 'STARTED'
      && assignment.resourceKind === 'BUNDLE'
      && assignment.resourceKey === composite.id
      && assignment.episodeId === parent.episodeId
      && assignment.subjectUserId === parent.subjectUserId
      && assignment.respondentUserId === userId
      && parent.userId === userId
      && parent.respondentUserId === userId
      && parent.respondentType === respondentType)
  }
  const supportedProduct = Boolean(
    ['QUESTIONNAIRE', 'ASSESSMENT_BUNDLE', 'LEGACY_COMPOSITE'].includes(composite.productKind)
    || composite.productKind === 'ORGANIZATION_RESOURCE' && educationProduct
  )
  if (!supportedProduct || parent.assignmentRef && !educationProduct && !verifiedRelationalBundle) {
    throw CONFLICT('组合认知任务需要有效的父作答准入')
  }
  if (parent.assignmentRef && educationProduct) {
    readVerifiedCompositionAttempt(proof, db, parent.id, userId, { compositeId: composite.id, assignmentRef: parent.assignmentRef })
  }
  if (parent.userId !== userId || parent.subjectUserId && parent.subjectUserId !== userId && !educationProduct && !verifiedRelationalBundle
    || parent.respondentUserId && parent.respondentUserId !== userId || parent.status !== 'IN_PROGRESS'
    || parent.deliveryMode !== 'FINAL_ONLY' || parent.runtimeGeneration !== 'UNIFIED_V1'
    || !Number.isSafeInteger(parent.attemptEpoch) || parent.attemptEpoch < 1) throw CONFLICT('组合认知任务的作答范围不匹配')
  const item = await db.compositeAssessmentItem.findUnique({ where: { id: scope.compositeItemId } })
  if (!item || item.type !== 'COGNITIVE' || item.compositeAssessmentId !== composite.id || !item.cognitiveAssignmentId) throw CONFLICT('组合认知任务的题目来源不匹配')
  const [actual, selected] = await Promise.all([cognitiveQuotaSource(db, assignmentId), cognitiveQuotaSource(db, item.cognitiveAssignmentId)])
  if (actual.id !== selected.id) throw CONFLICT('组合认知任务的工具来源不匹配')
  // The admitted parent owns participation limits. Reusing an instrument must
  // not spend the allowance of its standalone assignment or another delivery.
  if (composite.personalTrackingBaselineId) await trainingWaveScope(db, userId, assignmentId, actual, scope)
  const parentsUsed = await db.compositeAssessmentAttempt.count({ where: { compositeAssessmentId: composite.id, userId, assignmentRef: parent.assignmentRef ?? null } })
  if (!Number.isInteger(composite.maxAttempts) || composite.maxAttempts < 1 || parentsUsed > composite.maxAttempts) throw CONFLICT('已达到综合测评最大次数')
  // The parent admission already owns the delivery's maxAttempts check and
  // participant lock. Each exact slot may materialize once within that attempt.
  await db.$queryRawUnsafe('SELECT 1 AS locked FROM pg_advisory_xact_lock(hashtextextended($1, 0))', `cognitive-task-slot:${parent.id}:${item.id}`)
  const existing = await db.cognitiveSession.count({ where: { userId, compositeAttemptId: parent.id, compositeItemId: item.id } })
  if (existing > 0) throw CONFLICT('本次组合内的认知作答已存在，请继续已有作答')
  return true
}

/** Identifies frozen Training flow, variant and longitudinal deliveries.
 * Participation isolation is enforced separately by the admitted parent/slot. */
export function usesScopedTrainingQuota(composite: {
  trainingFlowFrozen?: unknown
  trainingVariantFrozen?: unknown
  personalTrackingBaselineId?: string | null
} | null | undefined): boolean {
  return Boolean(composite && (composite.trainingFlowFrozen != null
    || composite.trainingVariantFrozen != null || composite.personalTrackingBaselineId != null))
}

export async function cognitiveQuotaSource(db: Tx, assignmentId: string) {
  const assignment = await db.cognitiveAssignment.findUnique({ where: { id: assignmentId } })
  if (!assignment) throw NOT_FOUND('认知任务不存在')
  if (!assignment.quotaSourceAssignmentId) return assignment
  const source = await db.cognitiveAssignment.findUnique({ where: { id: assignment.quotaSourceAssignmentId } })
  if (!source || source.quotaSourceAssignmentId || source.createdBy !== assignment.createdBy || source.configId !== assignment.configId) {
    throw CONFLICT('认知任务来源关系需要核查，请联系教师')
  }
  return source
}

export async function lockCognitiveQuota(db: Tx, userId: string, sourceId: string) {
  await db.$queryRawUnsafe('SELECT 1 AS locked FROM pg_advisory_xact_lock(hashtextextended($1, 0))', `cognitive-quota:${sourceId}:${userId}`)
}

export async function readCognitiveQuota(db: Tx, userId: string, assignmentId: string, waveScope?: {compositeAssessmentId:string;compositeItemId:string}) {
  if (!waveScope) {
    const assignment = await db.cognitiveAssignment.findUnique({ where: { id: assignmentId } })
    if (!assignment) throw NOT_FOUND('认知任务不存在')
    const where = { userId, assignmentId, compositeAttemptId: null }
    const used = await db.cognitiveSession.count({ where })
    const session = await db.cognitiveSession.findFirst({ where: { ...where, status: 'IN_PROGRESS' },
      orderBy: { createdAt: 'desc' }, select: { id: true, frozenAdmissionSnapshotHash: true } })
    const admissionPaused = Boolean(session && !isCognitiveNewAdmissionEnabled() && !session.frozenAdmissionSnapshotHash)
    return { admissionPaused, maxAttempts: assignment.maxAttempts, usedAttempts: used,
      remainingAttempts: Math.max(0, assignment.maxAttempts - used),
      continueHref: session && !admissionPaused ? `/student/cognitive/sessions/${session.id}` : null }
  }
  const source = await cognitiveQuotaSource(db, assignmentId)
  const waveId=waveScope?await trainingWaveScope(db,userId,assignmentId,source,waveScope):null
  const where = { userId,...(waveId?{compositeAttempt:{compositeAssessmentId:waveId,userId,assignmentRef:null}}:{}), OR: [
    { assignmentId: source.id }, { assignment: { quotaSourceAssignmentId: source.id } },
    { compositeItem: { cognitiveAssignmentId: source.id } }, { compositeItem: { cognitiveAssignment: { quotaSourceAssignmentId: source.id } } },
  ] }
  const used = await db.cognitiveSession.count({ where })
  const session = await db.cognitiveSession.findFirst({ where: { ...where, status: 'IN_PROGRESS', OR: [
    { AND: [{ OR: where.OR }, { compositeAttemptId: null }] },
    { AND: [{ OR: where.OR }, { compositeAttempt: { userId, assignmentRef: null, compositeAssessment: { reportPackageKey: null, analysisProtocolKey: null } } }] },
  ] }, orderBy: { createdAt: 'desc' }, select: { id: true, compositeAttemptId: true, frozenAdmissionSnapshotHash: true } })
  const admissionPaused = Boolean(session && !isCognitiveNewAdmissionEnabled() && !session.frozenAdmissionSnapshotHash)
  return { admissionPaused, maxAttempts: source.maxAttempts, usedAttempts: used, remainingAttempts: Math.max(0, source.maxAttempts - used),
    continueHref: session && !admissionPaused ? session.compositeAttemptId ? `/student/composite/attempts/${session.compositeAttemptId}` : `/student/cognitive/sessions/${session.id}` : null }
}

/** Server-owned composite coordinates, never an HTTP mode/permission flag. */
export type CompositeCognitiveQuotaScope={compositeAttemptId:string;compositeItemId:string}

async function trainingWaveScope(db:Tx,userId:string,assignmentId:string,source:Awaited<ReturnType<typeof cognitiveQuotaSource>>,context:CompositeCognitiveQuotaScope|{compositeAssessmentId:string;compositeItemId:string}){
 const parent='compositeAttemptId' in context?await db.compositeAssessmentAttempt.findUnique({where:{id:context.compositeAttemptId},include:{compositeAssessment:true}}):null
 const wave='compositeAssessmentId' in context?await db.compositeAssessment.findUnique({where:{id:context.compositeAssessmentId}}):parent?.compositeAssessment
 if(!wave||!['QUESTIONNAIRE','ASSESSMENT_BUNDLE'].includes(wave.productKind)||!wave.personalTrackingBaselineId)return null
 if('compositeAttemptId' in context&&(!parent||parent.userId!==userId||parent!.assignmentRef||parent!.subjectUserId&&parent!.subjectUserId!==userId
  ||parent!.respondentUserId&&parent!.respondentUserId!==userId||parent!.status!=='IN_PROGRESS'
  ||parent!.deliveryMode!=='FINAL_ONLY'||parent!.runtimeGeneration!=='UNIFIED_V1'
  ||!Number.isSafeInteger(parent!.attemptEpoch)||parent!.attemptEpoch<1
  ||!(parent!.deliveryCourseId??(wave.productKind==='ASSESSMENT_BUNDLE'?wave.courseId:null))))
  throw CONFLICT('纵向认知施测父结果范围不匹配')
 const baseline=await db.compositeAssessment.findUnique({where:{id:wave.personalTrackingBaselineId}})
 const tracking=wave.personalTracking as {bindings?:Array<{metricId:string;itemId:string;scoreKey:string}>}|null
 const baselineTracking=baseline?.personalTracking as {plan?:unknown}|null
 const plan=personalTrackingPlanSchema.safeParse(baselineTracking?.plan)
 if(wave.status!=='PUBLISHED'||!wave.publishedAt||!wave.personalTrackingOrdinal||!baseline||!plan.success||baseline.createdBy!==wave.createdBy||baseline.productKind!==wave.productKind
  ||!['PUBLISHED','ARCHIVED'].includes(baseline.status)||!baseline.publishedAt||plan.data.baselineWaveId!==baseline.id
  ||wave.personalTrackingOrdinal<1||wave.personalTrackingOrdinal>100||!Array.isArray(tracking?.bindings))
  throw CONFLICT('纵向认知追踪计划不匹配')
 const selected=tracking.bindings.filter(b=>b.itemId===context.compositeItemId)
  .map(b=>({binding:b,metric:plan.data.metrics.find(m=>m.id===b.metricId&&m.kind==='COGNITIVE')}))
  .filter((s):s is {binding:typeof s.binding;metric:NonNullable<typeof s.metric>}=>!!s.metric)
 // A nontracked Cognitive item keeps its original global quota, even when its
 // enclosing questionnaire happens to contain another tracked instrument.
 if(!selected.length)return null
 const item=await db.compositeAssessmentItem.findUnique({where:{id:context.compositeItemId}})
 const binding=parent?trainingContentAttemptBindingSchema.safeParse(parent.trainingContentBinding):trainingContentSnapshotSchema.safeParse(wave.trainingContentSnapshot)
 if(!binding.success||binding.data.compositeId!==wave.id||!item||item.compositeAssessmentId!==wave.id||item.type!=='COGNITIVE'
  ||(parent?(!('attemptId' in binding.data)||binding.data.attemptId!==parent.id||binding.data.epoch!==parent.attemptEpoch
   ||canonicalHash(binding.data)!==parent.trainingContentBindingHash||binding.data.publicationHash!==wave.trainingContentSnapshotHash)
   :canonicalHash(binding.data)!==wave.trainingContentSnapshotHash))
  throw CONFLICT('纵向认知冻结施测绑定不匹配')
 const unit=binding.data.units.find(u=>u.itemId===item.id&&u.family==='COGNITIVE')
 if(!unit||unit.source.kind!=='COGNITIVE_CONFIG'||!unit.source.assignmentId||unit.source.id!==source.configId
  ||unit.source.assignmentId!==item.cognitiveAssignmentId)throw CONFLICT('纵向认知叶来源不匹配')
 const original=await cognitiveQuotaSource(db,unit.source.assignmentId)
 const assignment=await db.cognitiveAssignment.findUnique({where:{id:assignmentId}})
 if(!assignment||original.id!==source.id||assignment.configId!==unit.source.id
  ||selected.some(({binding:b,metric})=>b.scoreKey!==metric.scoreKey
   ||metric.measurementHash!==canonicalHash({measurementHash:unit.measurement.measurementHash,profile:assignment.profile??null})))
  throw CONFLICT('纵向认知实际配置或计分定义不匹配')
 return wave.id
}

/** Locks remain held through insertion. Standalone publications count their
 * own sessions; composites and verified education Runs own parent/slot limits. */
export async function admitCognitiveAttempt(db: Tx, userId: string, assignmentId: string, compositeScope?:CompositeCognitiveQuotaScope, proof?:VerifiedEducationAttempt) {
  if (compositeScope && await admitCompositeSlot(db, userId, assignmentId, compositeScope, proof)) return
  const assignment = await db.cognitiveAssignment.findUnique({ where: { id: assignmentId } })
  if (!assignment) throw NOT_FOUND('认知任务不存在')
  await lockCognitiveQuota(db, userId, assignment.id)
  const used = await db.cognitiveSession.count({ where: { userId, assignmentId, compositeAttemptId: null } })
  if (used >= assignment.maxAttempts) throw CONFLICT('已达到本次独立测评任务的最大次数；可继续已有作答。')
}
