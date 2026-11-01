import {freezeSurveyTaskPrefix} from './task-prefix'
import {readSurveyTaskLockedAnswers} from './task-answer-locks'
import {encryptUnifiedRuntimePayload,decryptUnifiedRuntimePayload} from '../assessment-runtime/security'
import {ensureSurveyFlowAssignment,assertSurveyFlowAssignment,assignedSurveySnapshot,type SurveyFlowAssignment} from './flow.assignment'
import {assertSurveyPriorCognitiveCompleted,SurveyCognitiveError} from './cognitive.results'
import { situationalImageAssetReferences } from '../situational/situation-definition'
import { ASSESSMENT_FROZEN_RUNTIME_REFERENCE_TYPE,ASSESSMENT_FROZEN_RUNTIME_MEDIA_FIELD } from '../assessment-media/assessment-asset'
import { SJT_AUTHOR_MEDIA_SCOPE,SJT_AUTHOR_MAX_IMAGE_BYTES } from '../situational/authoring/media'
import { z } from 'zod'
import { situationalLegacyFinalSubmitSchema } from '../situational/situational-final-submit.schema'
import { hasSurveyStagedSituationalNotice,hasSurveyLinearSituationalNotice } from './measurement.notice'
import { randomUUID } from 'node:crypto'
import type { Prisma } from '@prisma/client'
import { prisma } from '../../config/database'
import { withFinalOnlyCompletionTransaction } from '../../services/questionnaireProgressService'
import { assertSubmissionReplay,InstrumentFinalSubmitError } from '../../services/instrumentFinalSubmit'
import { canonicalHash } from '../assessment-runtime/canonical'
import { getParticipantKey } from '../assessment-runtime/participant-key'
import { decryptFrozenSituationalRuntimeSnapshot,encryptFrozenSituationalRuntimeSnapshot } from '../assessment-runtime/situational-runtime-snapshot'
import { getAssessmentOperationalHold } from '../assessment-governance/operational-hold'
import { SITUATIONAL_ATTEMPT_SELECT,assertRowMatchesSnapshot,situationalAttemptForResponse,retainFrozenSituationalAssets,
  type SituationalAttemptRow,type SituationalAttemptCommitRow } from '../situational/situational-runtime.service'
import { prepareSituationalFinalSubmission,deriveSituationalFinalFacts,commitPreparedSituationalFinal } from '../situational/situational-final-submit.service'
import { verifiedSurveyAttempt } from './admission.service'
import { decodeSurveyAttemptContentBinding } from './content-binding.service'
import { lockSurveyTaskAccess,type SurveyTaskProof,type VerifiedSurveyTask } from './task-authority'
import { frozenSurveyNativeSituationalRuntime,surveyNativeSituationalRequiresStageNotice } from './situational-native.definition'
import { SURVEY_NATIVE_SJT_PROTOCOL } from './situational-native.contract'

export class SurveySituationalError extends Error {
  constructor(readonly statusCode:number,message:string){super(message);this.name='SurveySituationalError'}
}
const fail=(status:number,message:string):never=>{throw new SurveySituationalError(status,message)}
type Tx=Prisma.TransactionClient
type LockedHost=Awaited<ReturnType<typeof lockSurveyTaskAccess>>
function storedAssignment(host:LockedHost):SurveyFlowAssignment|null{
  if(!host.snapshot.flow)return null
  if(!host.attempt.flowAssignmentCipher)fail(409,'冻结研究缺少已持久化的分配')
  const assignment=decryptUnifiedRuntimePayload<SurveyFlowAssignment>(host.attempt.flowAssignmentCipher!)
  assertSurveyFlowAssignment(host.snapshot.flow,assignment)
  return assignment
}
/** Resolve only the server-selected publication, never a union slot locator. */
function selectedAccess(host:LockedHost,known:VerifiedSurveyTask,slotKey:string,assignment:SurveyFlowAssignment|null){
  const {attempt}=host
  const publication=assignedSurveySnapshot(host.snapshot,assignment)
  const unit=publication.units.find(unit=>unit.kind==='SJT'&&unit.instrumentKey===slotKey)
  if(!unit)fail(404,'当前冻结研究中没有这个情境化工具')
  const binding=decodeSurveyAttemptContentBinding({projectId:known.projectId,waveId:known.waveId,
    attemptId:known.attemptId,publicationId:known.publicationId,definitionDigest:known.definitionDigest,
    selectedSnapshot:publication,contentBindingCipher:attempt.contentBindingCipher,
    contentBindingHash:attempt.contentBindingHash})
  if(!binding)fail(409,'原生情境化工具需要服务器已冻结的研究内容绑定')
  const runtime=frozenSurveyNativeSituationalRuntime(unit!)
  const staged=surveyNativeSituationalRequiresStageNotice(runtime.snapshot.definition)
  if(staged?!hasSurveyStagedSituationalNotice(publication.measurementNotice):!hasSurveyLinearSituationalNotice(publication.measurementNotice))
    fail(409,'冻结研究缺少该情境化工具实际作答记录说明')
  return {attempt,publication,assignment,unit:unit!,...runtime}
}
async function access(tx:Tx,proof:SurveyTaskProof,known:VerifiedSurveyTask,slotKey:string,allowCompleted:boolean){
  const host=await lockSurveyTaskAccess(tx,proof,known,{kind:'SITUATIONAL',allowCompleted,fail})
  return selectedAccess(host,known,slotKey,storedAssignment(host))
}

function assertChild(row:SituationalAttemptRow|SituationalAttemptCommitRow,known:VerifiedSurveyTask,
  slotKey:string,runtime:Awaited<ReturnType<typeof access>>){
  if(row.surveyAttemptId!==known.attemptId||row.surveyPublicationId!==known.publicationId
    ||row.surveySlotKey!==slotKey||row.attemptEpoch!==runtime.header.attemptEpoch
    ||row.userId!==null||row.compositeAttemptId!==null||row.compositeItemId!==null||row.compositeSlotKey!==null)
    fail(403,'情境化作答不属于当前研究冻结槽位')
  assertRowMatchesSnapshot(row,runtime.snapshot)
}
const findChild=(tx:Tx,known:VerifiedSurveyTask,slotKey:string)=>tx.situationalAttempt.findFirst({
  where:{surveyAttemptId:known.attemptId,surveyPublicationId:known.publicationId,surveySlotKey:slotKey,attemptEpoch:1},
  select:SITUATIONAL_ATTEMPT_SELECT,
})
function view(row:SituationalAttemptRow|SituationalAttemptCommitRow,runtime:Awaited<ReturnType<typeof access>>,replayed?:boolean){
  return {...situationalAttemptForResponse(row,runtime.snapshot,{suppressResult:true,
    feedbackDeferred:row.status==='COMPLETED',...(replayed===undefined?{}:{replayed})}),
    ...(row.status==='COMPLETED'?{receipt:{protocol:SURVEY_NATIVE_SJT_PROTOCOL,attemptId:row.id,
      submissionId:row.submissionId,payloadHash:row.submissionPayloadHash}}:{})}
}
/** The host lock is independent of the immutable scientific runtime. Keep this
 * proof on every authorized operation, even when no participant DTO is needed. */
async function verifiedFlowPrefix(tx:Tx,known:VerifiedSurveyTask,slotKey:string,
  row:SituationalAttemptRow|SituationalAttemptCommitRow,runtime:Awaited<ReturnType<typeof access>>){
  if(!runtime.publication.flow)return undefined
  if(!runtime.assignment)fail(409,'冻结研究缺少已持久化的分配')
  const own=await tx.situationalAttempt.findUnique({where:{id:row.id},
    select:{surveyLockedAnswersCipher:true,surveyLockedAnswersHash:true}})
  if(!own?.surveyLockedAnswersCipher||!own.surveyLockedAnswersHash)fail(409,'条件流程情境化任务缺少冻结前置答案')
  const lockedPriorAnswers=await readSurveyTaskLockedAnswers(tx,{projectId:known.projectId,waveId:known.waveId,
    attemptId:known.attemptId,publicationId:known.publicationId},fail)
  try{
    const prefix=await freezeSurveyTaskPrefix(tx,known,runtime.publication,slotKey,lockedPriorAnswers,runtime.assignment,runtime.attempt.startedAt)
    if(canonicalHash(prefix)!==own!.surveyLockedAnswersHash)fail(409,'情境化前置答案与冻结路径不一致')
  }catch(error){if(error instanceof SurveyCognitiveError)fail(error.statusCode,error.message);throw error}
  return lockedPriorAnswers
}
function responseFor(row:SituationalAttemptRow|SituationalAttemptCommitRow,
  runtime:Awaited<ReturnType<typeof access>>,lockedPriorAnswers:Record<string,unknown>|undefined,replayed?:boolean){
  return {...view(row,runtime,replayed),...(lockedPriorAnswers===undefined?{}:{lockedPriorAnswers})}
}
async function flowView(tx:Tx,known:VerifiedSurveyTask,slotKey:string,
  row:SituationalAttemptRow|SituationalAttemptCommitRow,runtime:Awaited<ReturnType<typeof access>>,replayed?:boolean){
  return responseFor(row,runtime,await verifiedFlowPrefix(tx,known,slotKey,row,runtime),replayed)
}
export async function startSurveySituational(proof:SurveyTaskProof,slotKey:string,priorAnswers?:unknown){
  const known=await verifiedSurveyAttempt(proof)
  return withFinalOnlyCompletionTransaction(async tx=>{
    const host=await lockSurveyTaskAccess(tx,proof,known,{kind:'SITUATIONAL',allowCompleted:false,fail})
    let row=await findChild(tx,known,slotKey)
    // The locator is not authority. Existing children require the original stored
    // assignment; only new admission may invoke the existing allocator.
    const assignment=row?storedAssignment(host):await ensureSurveyFlowAssignment(tx,{
      projectId:known.projectId,waveId:known.waveId,attemptId:known.attemptId,
      participantId:known.participantId,researchCode:proof.researchCode,
      accessCredential:proof.accessCredential,snapshot:host.snapshot})
    const runtime=selectedAccess(host,known,slotKey,assignment)
    if(row){assertChild(row,known,slotKey,runtime);return flowView(tx,known,slotKey,row,runtime)}
    let locked:Record<string,unknown>|undefined
    try{
      if(runtime.publication.flow){
        locked=await freezeSurveyTaskPrefix(tx,known,runtime.publication,slotKey,priorAnswers,assignment,runtime.attempt.startedAt)
      }else{
        const index=runtime.publication.units.findIndex(unit=>unit.instrumentKey===slotKey)
        await assertSurveyPriorCognitiveCompleted(tx,{projectId:known.projectId,waveId:known.waveId,
          attemptId:known.attemptId,publicationId:known.publicationId},runtime.publication.units.slice(0,index)
            .filter(unit=>unit.kind==='COGNITIVE').map(unit=>unit.instrumentKey))
      }
    }catch(error){if(error instanceof SurveyCognitiveError)fail(error.statusCode,error.message);throw error}
    if(getAssessmentOperationalHold({family:'SITUATIONAL',key:runtime.header.instrumentKey,version:runtime.header.instrumentVersion}))
      fail(403,'情境化工具已暂停新作答')
    row=await tx.situationalAttempt.create({data:{id:randomUUID(),
      surveyAttemptId:known.attemptId,surveyPublicationId:known.publicationId,surveySlotKey:slotKey,
      participantKey:getParticipantKey(`survey:${known.projectId}:${known.participantId??known.attemptId}`),
      instrumentKey:runtime.header.instrumentKey,instrumentVersion:runtime.header.instrumentVersion,
      attemptNo:1,attemptEpoch:runtime.header.attemptEpoch,status:'IN_PROGRESS',deliveryMode:'FINAL_ONLY',
      runtimeGeneration:'UNIFIED_V1',definitionHash:runtime.header.definitionHash,
      compiledRuntimeHash:runtime.header.compiledRuntimeHash,scorerKey:runtime.header.scorerKey,
      scoringVersion:runtime.header.scoringVersion,frozenAt:new Date(runtime.header.frozenAt),
      runtimeSnapshotEncrypted:encryptFrozenSituationalRuntimeSnapshot(runtime.snapshot),progress:0,
      ...(locked?{surveyLockedAnswersCipher:encryptUnifiedRuntimePayload(locked),surveyLockedAnswersHash:canonicalHash(locked)}:{}),
    },select:SITUATIONAL_ATTEMPT_SELECT})
    await retainFrozenSituationalAssets(tx,row.id,runtime.snapshot)
    return flowView(tx,known,slotKey,row,runtime)
  })
}
async function readLocked(tx:Tx,proof:SurveyTaskProof,known:VerifiedSurveyTask,slotKey:string,childId:string){
  const runtime=await access(tx,proof,known,slotKey,true)
  const row=await findChild(tx,known,slotKey)
  if(!row||row.id!==childId)fail(403,'情境化作答不属于当前研究冻结槽位')
  assertChild(row!,known,slotKey,runtime)
  const stored=decryptFrozenSituationalRuntimeSnapshot(row!.runtimeSnapshotEncrypted)
  if(canonicalHash(stored)!==canonicalHash(runtime.snapshot))fail(409,'情境化冻结运行时已变化')
  const lockedPriorAnswers=await verifiedFlowPrefix(tx,known,slotKey,row!,runtime)
  return {row:row!,snapshot:stored,runtime,lockedPriorAnswers}
}
export async function readSurveySituational(proof:SurveyTaskProof,slotKey:string,childId:string){
  const known=await verifiedSurveyAttempt(proof)
  return withFinalOnlyCompletionTransaction(async tx=>{
    const loaded=await readLocked(tx,proof,known,slotKey,childId)
    return responseFor(loaded.row,loaded.runtime,loaded.lockedPriorAnswers)
  })
}
export async function submitSurveySituationalFinal(proof:SurveyTaskProof,slotKey:string,childId:string,
  input:z.infer<typeof situationalLegacyFinalSubmitSchema>){
  const known=await verifiedSurveyAttempt(proof)
  z.string().guid().parse(input.submissionId)
  const serviceInput={...input,attemptId:childId}
  const initial=await withFinalOnlyCompletionTransaction(async tx=>{
    const loaded=await readLocked(tx,proof,known,slotKey,childId)
    const prepared=prepareSituationalFinalSubmission(serviceInput,loaded)
    if(loaded.row.status==='COMPLETED'){
      if(assertSubmissionReplay(loaded.row,prepared.submissionId,prepared.payloadHash)!=='replay')
        throw new InstrumentFinalSubmitError('SUBMISSION_PAYLOAD_CONFLICT','已提交内容不一致',409)
      return {replay:responseFor(loaded.row,loaded.runtime,loaded.lockedPriorAnswers,true)}
    }
    return {prepared}
  })
  if(initial.replay)return initial.replay
  const prepared=initial.prepared!
  // The single shared scientific engine remains outside the parent/child locks.
  const derived=deriveSituationalFinalFacts(prepared,'SITUATIONAL_ATTEMPT')
  return withFinalOnlyCompletionTransaction(async tx=>{
    const runtime=await access(tx,proof,known,slotKey,true)
    const committed=await commitPreparedSituationalFinal(tx,serviceInput,prepared,derived,{
      kind:'SURVEY',assertLockedAuthority:row=>assertChild(row,known,slotKey,runtime),
      assertReplayAdmission:replayed=>{
        if(!replayed&&runtime.attempt.status!=='STARTED')fail(403,'研究作答已经结束')
      },
      // Parent receipt references existing authoritative child facts. No second
      // raw/result store and no fake Training unit snapshot are written.
      persistProjection:async()=>{},
    })
    return flowView(tx,known,slotKey,committed.row,runtime,committed.kind==='replay')
  })
}

/** Fresh host authority and both frozen retention owners precede shared byte
 * delivery. No current catalog grant is reinterpreted as historical permission. */
export async function authorizeSurveySituationalImage(proof:SurveyTaskProof,slotKey:string,childId:string,assetId:string){
  const known=await verifiedSurveyAttempt(proof)
  return withFinalOnlyCompletionTransaction(async tx=>{
    const {snapshot}=await readLocked(tx,proof,known,slotKey,childId)
    const reference=snapshot.definition.scenes.flatMap(scene=>situationalImageAssetReferences(scene.stimulus))
      .find(asset=>asset.assetId===assetId)
    if(!reference)fail(403,'图片不属于当前冻结情境化题面')
    const pins=await tx.assetReference.findMany({where:{assetId,OR:[
      {entityType:'SurveyResearchPublication',entityId:known.publicationId,field:'media'},
      {entityType:ASSESSMENT_FROZEN_RUNTIME_REFERENCE_TYPE,entityId:`SITUATIONAL:${childId}`,field:ASSESSMENT_FROZEN_RUNTIME_MEDIA_FIELD},
    ]},select:{entityType:true,entityId:true}})
    if(!pins.some(pin=>pin.entityType==='SurveyResearchPublication'&&pin.entityId===known.publicationId)
      ||!pins.some(pin=>pin.entityType===ASSESSMENT_FROZEN_RUNTIME_REFERENCE_TYPE&&pin.entityId===`SITUATIONAL:${childId}`))
      fail(403,'情境图片缺少冻结保留凭据')
    const asset=await tx.storedAsset.findUnique({where:{id:assetId},select:{accessScope:true,scopeId:true,deletedAt:true,sizeBytes:true,sha256:true,mimeType:true}})
    if(!asset||asset.deletedAt||asset.accessScope!=='PRIVATE'||asset.scopeId!==SJT_AUTHOR_MEDIA_SCOPE
      ||asset.sizeBytes<=0||asset.sizeBytes>SJT_AUTHOR_MAX_IMAGE_BYTES||asset.sha256!==reference!.contentHash||asset.mimeType!==reference!.mimeType)
      fail(403,'情境图片已失效或身份不一致')
    return snapshot
  })
}
