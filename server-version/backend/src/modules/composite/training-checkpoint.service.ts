import { assertTrainingScaleCollectionAllowed } from '../scale/scale-collection-guard'
import { scaleTimingItemSchema } from '../assessment-core/scale/item-timing'
import { normalizeTrainingScaleTiming } from '../assessment-runtime/training-scale-timing'
import { Prisma } from '@prisma/client'
import { z } from 'zod'
import { prisma } from '../../config/database'
import { encryptSerializedField, decryptField } from '../../utils/encryption'
import { canonicalHash } from '../assessment-runtime/canonical'
import { loadFrozenActiveSlotSet } from '../assessment-runtime/slot-set'
import { loadFrozenScaleRuntimeSnapshot } from '../assessment-runtime/runtime-snapshot'
import { decryptFrozenSituationalRuntimeSnapshot } from '../assessment-runtime/situational-runtime-snapshot'
import { trainingRoundPublicationIdentity } from './training-public-round'
import { encodeTrainingCheckpointEnvelope, nextTrainingCheckpointSave, readTrainingPersistenceSnapshot,
  minimumTrainingCutoff, trainingCheckpointExpiry, trainingPersistenceMetadata, TrainingPersistenceError } from './training-persistence.policy'

const hash = z.string().regex(/^[0-9a-f]{64}$/)
export const trainingCheckpointSaveSchema = z.object({ expectedRevision: z.number().int().min(0), attemptEpoch: z.number().int().min(1),
  envelope: z.object({ schemaVersion: z.literal(1), snapshotHash: hash, definitionHash: hash,
    drafts: z.array(z.object({ slotKey: z.string().min(1).max(240), answers: z.record(z.unknown()),
      itemTimings: z.record(scaleTimingItemSchema).optional() }).strict()).max(100),
    cognitiveResults: z.array(z.object({ slotKey: z.string().min(1).max(240), resultId: z.string().min(1).max(200),
      sessionId: z.string().min(1).max(200), submissionId: z.string().min(1).max(200) }).strict()).max(100),
  }).strict(),
}).strict()
export type TrainingCheckpointSave = z.infer<typeof trainingCheckpointSaveSchema>
type Principal = { userId?: string; recoveryTokenHash?: string }
const fail = (status: number, message: string): never => { throw new TrainingPersistenceError(status, message) }
const TX_OPTIONS = { maxWait: 1_000, timeout: 5_000 }
// Write acknowledgements and CLEAR never consume draft ciphertext. GET and SAVE
// retain their payload reads for recovery integrity and expiry/CAS respectively.
const checkpointMetadataSelect = { revision: true, successfulSaveCount: true, expiresAt: true } as const
async function limits(tx: Prisma.TransactionClient) {
  await tx.$executeRawUnsafe("SET LOCAL lock_timeout = '500ms'")
  await tx.$executeRawUnsafe("SET LOCAL statement_timeout = '2000ms'")
}
/** No score, report, trial or answer ciphertext. Only SAVE loads the frozen slot
 * carrier in the locked parent read; GET/CLEAR retain their compact projection. */
async function access(tx: Prisma.TransactionClient, attemptId: string, principal: Principal, epoch?: number, includeFrozenSlots=false) {
  const known = await tx.compositeAssessmentAttempt.findUnique({where:{id:attemptId},select:{compositeAssessmentId:true,deliveryCourseId:true,trainingPersistenceSnapshotHash:true}})
  if (!known?.deliveryCourseId || !known.trainingPersistenceSnapshotHash) fail(403,'此作答未启用 Training 草稿')
  await tx.$queryRaw`SELECT id FROM composite_assessments WHERE id=${known!.compositeAssessmentId} FOR SHARE`
  await tx.$queryRaw`SELECT id FROM courses WHERE id=${known!.deliveryCourseId} FOR SHARE`
  await tx.$queryRaw`SELECT id FROM composite_assessment_attempts WHERE id=${attemptId} FOR UPDATE`
  const attempt = await tx.compositeAssessmentAttempt.findUnique({where:{id:attemptId},select:{id:true,compositeAssessmentId:true,deliveryCourseId:true,
    userId:true,recoveryTokenHash:true,attemptEpoch:true,status:true,deliveryMode:true,runtimeGeneration:true,
    trainingPersistenceSnapshot:true,trainingPersistenceSnapshotHash:true,frozenActiveSlotSetHash:true,trainingTimingSnapshot:true,
    ...(includeFrozenSlots?{frozenActiveSlotSetEncrypted:true as const}:{}),
    compositeAssessment:{select:{id:true,publishedAt:true,status:true,productKind:true,questionnaireType:true,
      trainingFlowDigest:true,trainingVariantDigest:true,expiresAt:true,trainingPersistencePolicyHash:true}},
    accessToken:{select:{trainingRoundId:true,trainingRound:{select:{id:true,courseId:true,compositeId:true,publicationHash:true,closesAt:true}}}},
  }})
  if (!attempt) fail(404,'作答不存在')
  const a = attempt!
  const owned = principal.userId ? a.userId === principal.userId : a.userId === null && !!principal.recoveryTokenHash && a.recoveryTokenHash === principal.recoveryTokenHash
  if (!owned) fail(403,'无权限访问此草稿')
  if (a.status !== 'IN_PROGRESS' || a.deliveryMode !== 'FINAL_ONLY' || a.runtimeGeneration !== 'UNIFIED_V1' || (epoch !== undefined && epoch !== a.attemptEpoch)) fail(409,'作答已结束或版本改变')
  const snapshot = readTrainingPersistenceSnapshot(a)
  if (!snapshot?.policy.checkpoint || !a.frozenActiveSlotSetHash) fail(403,'此作答未启用 Checkpoint')
  const s = snapshot!
  const parent = a.compositeAssessment
  if (parent.status !== 'PUBLISHED' || !parent.publishedAt || parent.trainingPersistencePolicyHash !== s.policyHash ||
    canonicalHash(trainingRoundPublicationIdentity(parent,s.courseId)) !== s.publicationHash) fail(409,'冻结发布身份已改变')
  const course = await tx.course.findUnique({where:{id:s.courseId},select:{courseType:true,isLibrary:true,endedAt:true,status:true}})
  if (!course || course.courseType !== 'TRAINING_COURSE' || course.isLibrary) fail(403,'Training 课程不可用')
  const round = a.accessToken?.trainingRound
  if ((a.accessToken?.trainingRoundId ?? null) !== s.roundId || (s.roundId && (!round || round.courseId !== s.courseId || round.compositeId !== a.compositeAssessmentId || round.publicationHash !== s.publicationHash))) fail(409,'草稿轮次身份已改变')
  const now = new Date()
  const cutoff=minimumTrainingCutoff([s.frozenCutoff,course!.endedAt,parent.expiresAt,round?.closesAt])
  const closed=course!.status!=='PUBLISHED' || (!!cutoff && cutoff<=now)
  const expiresAt = closed ? now : trainingCheckpointExpiry(s,now,[course!.endedAt,parent.expiresAt,round?.closesAt])
  return {attempt:a,snapshot:s,now,expiresAt,closed}
}
export function assertTrainingCheckpointBounds(value: unknown, depth = 0, budget = { nodes: 0, bytes: 0 }): void {
  if (++budget.nodes > 10_000) fail(413,'草稿数据节点过多')
  if (typeof value==='string') budget.bytes+=Buffer.byteLength(value,'utf8')
  if (budget.bytes>65_536) fail(413,'草稿内容超过 64KB')
  if (depth > 8) fail(400,'草稿嵌套过深')
  if (value != null && !['string','number','boolean','object'].includes(typeof value)) fail(400,'草稿内容必须为 JSON')
  if (typeof value==='number' && !Number.isFinite(value)) fail(400,'草稿数值无效')
  if (value && typeof value === 'object') {
    const entries = Object.entries(value)
    if (entries.length > 500) fail(400,'草稿字段过多')
    for (const [key,child] of entries) { budget.bytes+=Buffer.byteLength(key,'utf8'); if (['__proto__','prototype','constructor'].includes(key)) fail(400,'草稿字段无效'); assertTrainingCheckpointBounds(child,depth+1,budget) }
  }
}
async function validateDrafts(tx: Prisma.TransactionClient, context: Awaited<ReturnType<typeof access>>, envelope: TrainingCheckpointSave['envelope']) {
  const a = context.attempt
  if (envelope.snapshotHash !== a.trainingPersistenceSnapshotHash || envelope.definitionHash !== a.frozenActiveSlotSetHash) fail(409,'草稿冻结摘要不匹配')
  if (!a.frozenActiveSlotSetEncrypted) fail(409,'冻结工具缺失')
  const frozen = await loadFrozenActiveSlotSet(a.frozenActiveSlotSetEncrypted!)
  if (frozen.snapshotHash !== a.frozenActiveSlotSetHash || frozen.attemptEpoch !== a.attemptEpoch) fail(409,'冻结工具版本不匹配')
  const slots = new Map(frozen.slots.map(slot=>[slot.slotKey,slot]))
  const keys = envelope.drafts.map(d=>d.slotKey)
  if (new Set(keys).size !== keys.length) fail(400,'重复草稿工具')
  const formIds:string[]=[], scaleIds:string[]=[], sjtIds:string[]=[]
  for (const draft of envelope.drafts) {
    const slot = slots.get(draft.slotKey)
    if (!slot || slot.unitType === 'COGNITIVE') fail(400,'草稿不能包含未知工具或认知分数')
    if (slot!.unitType==='FORM_SECTION') formIds.push(String(slot!.sourceBinding.sectionId))
    if (slot!.unitType==='SCALE') scaleIds.push(String(slot!.sourceBinding.compositeItemId))
    if (slot!.unitType==='SITUATIONAL') sjtIds.push(String(slot!.sourceBinding.compositeItemId))
    assertTrainingCheckpointBounds(draft.answers)
  }
  // One bounded batch per requested kind; no per-item authorization query.
  const forms = formIds.length ? await tx.compositeFormSectionAttempt.findMany({where:{attemptId:a.id,attemptEpoch:a.attemptEpoch,sectionId:{in:formIds},status:'IN_PROGRESS'},select:{sectionId:true,section:{include:{items:true}}}}) : []
  const scales = scaleIds.length ? await tx.assessment.findMany({where:{compositeAttemptId:a.id,attemptEpoch:a.attemptEpoch,compositeItemId:{in:scaleIds},status:'IN_PROGRESS'},select:{scaleId:true,compositeItemId:true,runtimeSnapshotEncrypted:true}}) : []
  await assertTrainingScaleCollectionAllowed(tx,scales.map(row=>row.scaleId))
  const sjts = sjtIds.length ? await tx.situationalAttempt.findMany({where:{compositeAttemptId:a.id,attemptEpoch:a.attemptEpoch,compositeItemId:{in:sjtIds},status:'IN_PROGRESS'},select:{compositeItemId:true,runtimeSnapshotEncrypted:true}}) : []
  const formsById = new Map(forms.map(row=>[row.sectionId,row]))
  // Historical scale children have no unique composite item constraint. Keep
  // the previous find() first-match behavior rather than choosing the last row.
  const scalesById = new Map<string | null, (typeof scales)[number]>()
  for (const row of scales) {
    const key = row.compositeItemId
    if (!scalesById.has(key)) scalesById.set(key,row)
  }
  const sjtsById = new Map(sjts.map(row=>[row.compositeItemId,row]))
  for (const draft of envelope.drafts) {
    const slot = slots.get(draft.slotKey)!
    let allowed: Set<string>
    if (slot.unitType!=='SCALE' && draft.itemTimings!==undefined) fail(400,'只有已启用计时的量表可以保存计时')
    if (slot.unitType==='FORM_SECTION') {
      const row = formsById.get(slot.sourceBinding.sectionId as string)
      if (!row) fail(409,'表单未到达或已交卷')
      const { compositeFormSectionRuntimeDefinition } = await import('./composite.service')
      const definition = compositeFormSectionRuntimeDefinition(row!.section)
      if (canonicalHash(definition)!==slot.sourceDefinitionIdentity.hash) fail(409,'表单冻结定义不匹配')
      allowed = new Set(definition.items.map((item:any)=>item.id))
    } else if (slot.unitType==='SCALE') {
      const row = scalesById.get(slot.sourceBinding.compositeItemId as string)
      if (!row?.runtimeSnapshotEncrypted) fail(409,'量表未到达或已交卷')
      const runtime = await loadFrozenScaleRuntimeSnapshot(row!.runtimeSnapshotEncrypted!,tx)
      if (runtime.sourceDefinitionHash!==slot.sourceDefinitionIdentity.hash) fail(409,'量表冻结定义不匹配')
      allowed = new Set(runtime.definition.items.map(item=>item.itemCode))
      normalizeTrainingScaleTiming(a.trainingTimingSnapshot,[...allowed],Object.keys(draft.answers),draft.itemTimings)
    } else {
      const row = sjtsById.get(slot.sourceBinding.compositeItemId as string)
      if (!row) fail(409,'情境工具未到达或已交卷')
      const runtime = decryptFrozenSituationalRuntimeSnapshot(row!.runtimeSnapshotEncrypted)
      if (runtime.definitionHash!==slot.sourceDefinitionIdentity.hash) fail(409,'情境冻结定义不匹配')
      const definition:any = runtime.runnerDefinition
      allowed = new Set(definition.scenes.flatMap((scene:any)=>scene.channels.map((channel:any)=>`${scene.sceneKey}:${channel.channelKey}`)))
    }
    if (Object.keys(draft.answers).some(key=>!allowed.has(key)) || Object.keys(draft.itemTimings??{}).some(key=>!allowed.has(key))) fail(400,'草稿包含未知题目')
  }
  const refs=envelope.cognitiveResults
  if (new Set(refs.map(ref=>ref.slotKey)).size!==refs.length || new Set(refs.map(ref=>ref.resultId)).size!==refs.length) fail(400,'重复认知结果引用')
  const facts = refs.length ? await tx.assessmentUnitSnapshot.findMany({where:{compositeAttemptId:a.id,attemptEpoch:a.attemptEpoch,id:{in:refs.map(r=>r.resultId)},unitType:'COGNITIVE'},select:{id:true,slotKey:true,sourceAttemptId:true,sourceSubmissionId:true,sourceDefinitionHash:true,terminalState:true}}) : []
  const factsById = new Map(facts.map(fact=>[fact.id,fact]))
  for (const ref of refs) {
    const slot=slots.get(ref.slotKey),fact=factsById.get(ref.resultId)
    if (!slot || slot.unitType!=='COGNITIVE' || !fact || fact.slotKey!==ref.slotKey || fact.sourceAttemptId!==ref.sessionId || fact.sourceSubmissionId!==ref.submissionId || fact.sourceDefinitionHash!==slot.sourceDefinitionIdentity.hash || fact.terminalState!=='COMPLETED') fail(409,'认知结果必须引用本作答已接受的锁定事实')
  }
}
async function clearPayload(tx: Prisma.TransactionClient, attemptId: string) {
  return tx.trainingAttemptCheckpoint.updateMany({where:{attemptId,payloadEncrypted:{not:null}},data:{payloadEncrypted:null,payloadHash:null,expiresAt:null,revision:{increment:1}}})
}
function response(row: any, metadata: unknown, envelope: unknown = null) {
  return {revision:row?.revision??0,successfulSaveCount:row?.successfulSaveCount??0,expiresAt:row?.expiresAt??null,envelope,trainingPersistence:metadata}
}
export async function readTrainingCheckpoint(attemptId:string,principal:Principal) {
  return prisma.$transaction(async tx=>{
    await limits(tx)
    const c=await access(tx,attemptId,principal)
    if(c.closed){await clearPayload(tx,attemptId);return {closed:true}}
    let row=await tx.trainingAttemptCheckpoint.findUnique({where:{attemptId}})
    if (row?.payloadEncrypted && row.expiresAt && row.expiresAt<=c.now) {await clearPayload(tx,attemptId);row=await tx.trainingAttemptCheckpoint.findUnique({where:{attemptId}})}
    if (!row?.payloadEncrypted) return response(row,trainingPersistenceMetadata(c.attempt))
    if(row.expiresAt && row.expiresAt>c.expiresAt) row=await tx.trainingAttemptCheckpoint.update({where:{attemptId},data:{expiresAt:c.expiresAt,revision:{increment:1}}})
    const envelope=decryptField<TrainingCheckpointSave['envelope']>(row.payloadEncrypted!)
    if (canonicalHash(envelope)!==row.payloadHash || row.snapshotHash!==c.attempt.trainingPersistenceSnapshotHash || row.definitionHash!==c.attempt.frozenActiveSlotSetHash) fail(409,'草稿密文或冻结摘要不匹配')
    const terminal=await tx.assessmentUnitSnapshot.findMany({where:{compositeAttemptId:attemptId,attemptEpoch:c.attempt.attemptEpoch},select:{slotKey:true}})
    const accepted=new Set(terminal.map(fact=>fact.slotKey))
    const discardedTerminalSlotKeys=envelope.drafts.filter(draft=>accepted.has(draft.slotKey)).map(draft=>draft.slotKey)
    const recovered={...envelope,drafts:envelope.drafts.filter(draft=>!accepted.has(draft.slotKey))}
    return {...response(row,trainingPersistenceMetadata(c.attempt),recovered),discardedTerminalSlotKeys}
  },TX_OPTIONS)
}
export async function saveTrainingCheckpoint(attemptId:string,principal:Principal,input:TrainingCheckpointSave) {
  assertTrainingCheckpointBounds(input.envelope)
  const encoded=encodeTrainingCheckpointEnvelope(input.envelope)
  return prisma.$transaction(async tx=>{
    await limits(tx)
    const c=await access(tx,attemptId,principal,input.attemptEpoch,true)
    if(c.closed){await clearPayload(tx,attemptId);return {closed:true}}
    let row=await tx.trainingAttemptCheckpoint.findUnique({where:{attemptId}})
    if (row?.payloadEncrypted && row.expiresAt && row.expiresAt<=c.now) {
      // Persist expiry before telling caller its old CAS is stale. Throwing here would roll it back.
      await clearPayload(tx,attemptId)
      return {conflict:true,revision:row.revision+1,successfulSaveCount:row.successfulSaveCount}
    }
    const state=nextTrainingCheckpointSave(row??{revision:0,successfulSaveCount:0},input.expectedRevision)
    await validateDrafts(tx,c,input.envelope)
    const data={...state,payloadEncrypted:encryptSerializedField(encoded.plaintext),payloadHash:encoded.payloadHash,expiresAt:c.expiresAt}
    const saved = row ? await tx.trainingAttemptCheckpoint.update({where:{attemptId},data,select:checkpointMetadataSelect}) : await tx.trainingAttemptCheckpoint.create({select:checkpointMetadataSelect,data:{attemptId,
      snapshotHash:c.attempt.trainingPersistenceSnapshotHash!,definitionHash:c.attempt.frozenActiveSlotSetHash!,attemptEpoch:c.attempt.attemptEpoch,roundId:c.snapshot.roundId,...data}})
    return response(saved,trainingPersistenceMetadata(c.attempt))
  },TX_OPTIONS)
}
export async function clearTrainingCheckpoint(attemptId:string,principal:Principal,input:{expectedRevision:number;attemptEpoch:number}) {
  return prisma.$transaction(async tx=>{
    await limits(tx)
    const c=await access(tx,attemptId,principal,input.attemptEpoch)
    if(c.closed){await clearPayload(tx,attemptId);return {closed:true}}
    const row=await tx.trainingAttemptCheckpoint.findUnique({where:{attemptId},select:checkpointMetadataSelect})
    if ((row?.revision??0)!==input.expectedRevision) fail(409,'Checkpoint 已被其他窗口更新')
    // Even an empty clear establishes a tombstone revision, invalidating stale initial CAS.
    const cleared=row ? await tx.trainingAttemptCheckpoint.update({where:{attemptId},select:checkpointMetadataSelect,data:{payloadEncrypted:null,payloadHash:null,expiresAt:null,revision:{increment:1}}})
      : await tx.trainingAttemptCheckpoint.create({select:checkpointMetadataSelect,data:{attemptId,snapshotHash:c.attempt.trainingPersistenceSnapshotHash!,definitionHash:c.attempt.frozenActiveSlotSetHash!,attemptEpoch:c.attempt.attemptEpoch,roundId:c.snapshot.roundId,revision:1}})
    return response(cleared,trainingPersistenceMetadata(c.attempt))
  },TX_OPTIONS)
}
export async function cleanupExpiredTrainingCheckpoints(now=new Date()) {
  return prisma.$transaction(async tx=>{
    await limits(tx)
    // No parent locks: terminal path locks parent then checkpoint, so cleanup only locks checkpoints.
    const changed=await tx.$queryRaw<Array<{attempt_id:string}>>`WITH candidates AS (
      SELECT attempt_id FROM training_attempt_checkpoints WHERE payload_encrypted IS NOT NULL AND expires_at<=${now}
      ORDER BY expires_at,attempt_id LIMIT 100 FOR UPDATE SKIP LOCKED
    ) UPDATE training_attempt_checkpoints c SET payload_encrypted=NULL,payload_hash=NULL,expires_at=NULL,
      revision=revision+1,updated_at=CURRENT_TIMESTAMP FROM candidates p WHERE c.attempt_id=p.attempt_id RETURNING c.attempt_id`
    return changed.length
  },TX_OPTIONS)
}
