import { isCognitiveNewAdmissionEnabled } from './product-eligibility'
import type { Prisma } from '@prisma/client'
import { CONFLICT, NOT_FOUND } from './cognitive.errors'
import {canonicalHash} from '../assessment-runtime/canonical'
import {personalTrackingPlanSchema} from '../reporting/personal-tracking'
import {trainingContentAttemptBindingSchema,trainingContentSnapshotSchema} from '../composite/training-content-binding'

type Tx = Prisma.TransactionClient

/** Persisted course identity, never a hostname or a caller-supplied mode. */
export async function isTrainingTaskCourse(db: Tx, courseId?: string | null) {
  if (!courseId) return false
  const course = await db.course.findUnique({ where: { id: courseId }, select: { courseType: true, isLibrary: true } })
  return course?.courseType === 'TRAINING_COURSE' && !course.isLibrary
}

async function admitTrainingCompositeSlot(db: Tx, userId: string, assignmentId: string, scope: CompositeCognitiveQuotaScope) {
  const parent = await db.compositeAssessmentAttempt.findUnique({ where: { id: scope.compositeAttemptId }, include: { compositeAssessment: true } })
  if (!parent) throw CONFLICT('组合认知任务的作答记录不存在')
  const composite = parent?.compositeAssessment
  const courseId = parent?.deliveryCourseId ?? composite?.courseId
  if (!composite || !['QUESTIONNAIRE', 'ASSESSMENT_BUNDLE', 'LEGACY_COMPOSITE'].includes(composite.productKind)
    || parent?.assignmentRef || !await isTrainingTaskCourse(db, courseId)) return false
  if (!parent || parent.userId !== userId || parent.subjectUserId && parent.subjectUserId !== userId
    || parent.respondentUserId && parent.respondentUserId !== userId || parent.status !== 'IN_PROGRESS'
    || parent.deliveryMode !== 'FINAL_ONLY' || parent.runtimeGeneration !== 'UNIFIED_V1'
    || !Number.isSafeInteger(parent.attemptEpoch) || parent.attemptEpoch < 1) throw CONFLICT('组合认知任务的作答范围不匹配')
  const item = await db.compositeAssessmentItem.findUnique({ where: { id: scope.compositeItemId } })
  if (!item || item.type !== 'COGNITIVE' || item.compositeAssessmentId !== composite.id || !item.cognitiveAssignmentId) throw CONFLICT('组合认知任务的题目来源不匹配')
  const [actual, selected] = await Promise.all([cognitiveQuotaSource(db, assignmentId), cognitiveQuotaSource(db, item.cognitiveAssignmentId)])
  if (actual.id !== selected.id) throw CONFLICT('组合认知任务的工具来源不匹配')
  if (!usesScopedTrainingQuota(composite)) {
    // Historical Questionnaire/Bundle admissions retain the cross-entrance
    // source quota. A Training alias whose canonical source has no course can
    // use the exact delivered slot only with a fully verified frozen binding.
    const binding = trainingContentAttemptBindingSchema.safeParse(parent.trainingContentBinding)
    const unit = binding.success ? binding.data.units.find(entry =>
      entry.itemId === item.id && entry.family === 'COGNITIVE') : undefined
    if (actual.courseId != null || !composite.trainingContentSnapshotHash
      || !parent.trainingContentBindingHash || !binding.success
      || binding.data.compositeId !== composite.id
      || binding.data.attemptId !== parent.id
      || binding.data.epoch !== parent.attemptEpoch
      || binding.data.publicationHash !== composite.trainingContentSnapshotHash
      || canonicalHash(binding.data) !== parent.trainingContentBindingHash
      || unit?.source.kind !== 'COGNITIVE_CONFIG'
      || unit.source.assignmentId !== item.cognitiveAssignmentId
      || unit.source.id !== actual.configId) return false
  }
  if (composite.personalTrackingBaselineId) await trainingWaveScope(db, userId, assignmentId, actual, scope)
  const parentsUsed = await db.compositeAssessmentAttempt.count({ where: { compositeAssessmentId: composite.id, userId } })
  if (!Number.isInteger(composite.maxAttempts) || composite.maxAttempts < 1 || parentsUsed > composite.maxAttempts) throw CONFLICT('已达到综合测评最大次数')
  // The parent admission already owns the delivery's maxAttempts check and
  // participant lock. Each exact slot may materialize once within that attempt.
  await db.$queryRawUnsafe('SELECT 1 AS locked FROM pg_advisory_xact_lock(hashtextextended($1, 0))', `cognitive-task-slot:${parent.id}:${item.id}`)
  const existing = await db.cognitiveSession.count({ where: { userId, compositeAttemptId: parent.id, compositeItemId: item.id } })
  if (existing > 0) throw CONFLICT('本次组合内的认知作答已存在，请继续已有作答')
  return true
}

/** Only an explicitly frozen Training delivery may replace the historical
 * cross-entrance source quota with parent/slot isolation. A course type alone
 * is not sufficient: older Questionnaire and Bundle deliveries also use it. */
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

async function isStandaloneTrainingAssignment(db: Tx, assignmentId: string) {
  const assignment = await db.cognitiveAssignment.findUnique({ where: { id: assignmentId }, select: { courseId: true, quotaSourceAssignmentId: true, listedStandalone: true } })
  if (!assignment) throw NOT_FOUND('认知任务不存在')
  // Only a separately listed delivered alias receives an independent allowance.
  // Its canonical source still retains the old cross-entrance quota contract.
  return Boolean(assignment.quotaSourceAssignmentId && assignment.listedStandalone)
    && await isTrainingTaskCourse(db, assignment.courseId)
}

export async function lockCognitiveQuota(db: Tx, userId: string, sourceId: string) {
  await db.$queryRawUnsafe('SELECT 1 AS locked FROM pg_advisory_xact_lock(hashtextextended($1, 0))', `cognitive-quota:${sourceId}:${userId}`)
}

export async function readCognitiveQuota(db: Tx, userId: string, assignmentId: string, waveScope?: {compositeAssessmentId:string;compositeItemId:string}) {
  const source = await cognitiveQuotaSource(db, assignmentId)
  const waveId=waveScope?await trainingWaveScope(db,userId,assignmentId,source,waveScope):null
  const independentTask = !waveScope && await isStandaloneTrainingAssignment(db, assignmentId)
  const where = { userId,...(independentTask ? { compositeAttemptId: null } : {}),...(waveId?{compositeAttempt:{compositeAssessmentId:waveId,userId,assignmentRef:null}}:{}), OR: [
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

/** Locks remain held through insertion. Training independent deliveries count
 * standalone aliases only; their composites use parent limits and exact slots.
 * Other products retain their existing source/wave quota semantics. */
export async function admitCognitiveAttempt(db: Tx, userId: string, assignmentId: string, compositeScope?:CompositeCognitiveQuotaScope) {
  if (compositeScope && await admitTrainingCompositeSlot(db, userId, assignmentId, compositeScope)) return
  const source = await cognitiveQuotaSource(db, assignmentId)
  await lockCognitiveQuota(db, userId, source.id)
  const waveId=compositeScope?await trainingWaveScope(db,userId,assignmentId,source,compositeScope):null
  const independentTask = !compositeScope && await isStandaloneTrainingAssignment(db, assignmentId)
  const used = await db.cognitiveSession.count({ where: { userId, OR: [
    { assignmentId: source.id },
    { assignment: { quotaSourceAssignmentId: source.id } },
    { compositeItem: { cognitiveAssignmentId: source.id } },
    { compositeItem: { cognitiveAssignment: { quotaSourceAssignmentId: source.id } } },
  ],...(independentTask ? { compositeAttemptId: null } : {}),...(waveId?{compositeAttempt:{compositeAssessmentId:waveId,userId,assignmentRef:null}}:{}) } })
  if (used >= source.maxAttempts) throw CONFLICT(independentTask ? '已达到本次独立测评任务的最大次数；可继续已有作答。' : '已达到该认知任务最大次数。独立入口和组合测评共用次数；可继续已有作答。')
}
