import {freezeSurveyTaskPrefix} from './task-prefix'
export {prepareSurveyCognitivePriorAnswers} from './task-prefix'
import { randomBytes,randomUUID } from 'node:crypto'
import type { Prisma,SurveyCognitiveSession } from '@prisma/client'
import { prisma } from '../../config/database'
import { withFinalOnlyCompletionTransaction } from '../../services/questionnaireProgressService'
import { prepareCanonicalSubmission,assertCanonicalSubmissionPayloadSize,validateSubmissionId } from '../../services/instrumentFinalSubmit'
import { canonicalHash } from '../assessment-runtime/canonical'
import { encryptUnifiedRuntimePayload,decryptUnifiedRuntimePayload } from '../assessment-runtime/security'
import { administrationProvenanceV1Schema,type AdministrationProvenanceV1 } from '../cognitive/administration-provenance'
import { validateAndNormalizeTrials } from '../cognitive/v2/trial-normalizer'
import { prepareAuthoritativeScorerContext,runPreparedAuthoritativeScorer } from '../cognitive/v2/authoritative-scorer'
import { createUnifiedCognitiveRawSubmissionPayload } from '../cognitive/unified-raw-submission'
import { getAssessmentOperationalHold } from '../assessment-governance/operational-hold'
import { verifiedSurveyAttempt } from './admission.service'
import { lockSurveyTaskAccess } from './task-authority'
import { ensureSurveyFlowAssignment } from './flow.assignment'
import type { ResearchFrozenPublication } from './publication.service'
import { parseFrozenSurveyCognitive,surveyCognitiveTaskDefinition,type FrozenSurveyCognitive } from './cognitive.definition'
import { cognitiveFail,assertSurveyCognitiveLockedAnswers,surveyCognitiveResultReference,
  listSurveyCognitiveSessions,readSurveyCognitiveLockedAnswers,surveyCognitiveReceiptSelect,
  type SurveyCognitiveReceipt,type SurveyCognitiveStoredResult } from './cognitive.results'
export { SurveyCognitiveError } from './cognitive.results'
export type SurveyCognitiveProof={publicId:string;attemptId:string;accessCredential:string;researchCode?:string}
type Known=Awaited<ReturnType<typeof verifiedSurveyAttempt>>
type Tx=Prisma.TransactionClient
const MAX_RAW_BYTES=512*1024
const assertDevice=(input:unknown):AdministrationProvenanceV1=>{
  const value=administrationProvenanceV1Schema.parse(input)
  if(value.deviceClass!=='DESKTOP_LAPTOP'||value.administrationMode!=='KEYBOARD_MOUSE')
    cognitiveFail(400,'本试点只支持桌面或笔记本电脑键盘作答')
  return value
}
const lockAccess=(tx:Tx,proof:SurveyCognitiveProof,known:Known,allowCompleted=false)=>
  lockSurveyTaskAccess(tx,proof,known,{kind:'COGNITIVE',allowCompleted,fail:cognitiveFail})

function frozenUnit(snapshot:ResearchFrozenPublication,slotKey:string):FrozenSurveyCognitive{
  const unit=snapshot.units.find(u=>u.instrumentKey===slotKey&&u.kind==='COGNITIVE')
  if(!unit)cognitiveFail(404,'当前冻结研究中没有这个认知工具')
  try{return parseFrozenSurveyCognitive(unit!.compiledDefinition)}
  catch{ return cognitiveFail(409,'认知任务冻结测量定义校验失败') }
}
const scope=(known:Known,slotKey:string)=>({projectId:known.projectId,waveId:known.waveId,
  attemptId:known.attemptId,publicationId:known.publicationId,slotKey})
async function latest(tx:Tx,known:Known,slotKey:string){
  return tx.surveyCognitiveSession.findFirst({where:scope(known,slotKey),orderBy:{epoch:'desc'},
    include:{result:{select:surveyCognitiveReceiptSelect}}})
}
function assertBoundSession(current:Awaited<ReturnType<typeof latest>>,sessionId:string,epoch?:number){
  if(!current||current.id!==sessionId||(epoch!==undefined&&current.epoch!==epoch)||current.status==='ABANDONED')
    cognitiveFail(409,'认知会话已被替换或不属于此作答槽位，请读取当前任务')
  return current!
}
async function boundSession(tx:Tx,known:Known,slotKey:string,sessionId:string,epoch?:number){
  return assertBoundSession(await latest(tx,known,slotKey),sessionId,epoch)
}
async function sessionView(tx:Tx,known:Known,slotKey:string,
  session:SurveyCognitiveSession&{result:SurveyCognitiveReceipt|null},frozen:FrozenSurveyCognitive){
  const result=session.result
  const snapshot=frozen.sessionSnapshot
  const lockedPriorAnswers=await readSurveyCognitiveLockedAnswers(tx,{projectId:known.projectId,waveId:known.waveId,
    attemptId:known.attemptId,publicationId:known.publicationId})
  return {sessionId:session.id,assignmentId:null,testType:snapshot.testType,attemptNo:session.epoch,
    attemptEpoch:session.epoch,deliveryMode:'FINAL_ONLY' as const,definitionHash:snapshot.configHash,
    contextSnapshotHash:null,status:session.status==='INTERRUPTED'?'IN_PROGRESS':session.status,
    interrupted:session.status==='INTERRUPTED',restartAvailable:session.status==='INTERRUPTED'&&session.epoch===1,
    configVersion:snapshot.configVersion,engineVersion:snapshot.engineVersion,scoringVersion:snapshot.scoringVersion,
    protocolSignature:snapshot.protocolSignature,protocol:snapshot.protocol,presentation:snapshot.presentation,
    config:snapshot.config,randomSeed:decryptUnifiedRuntimePayload<string>(session.randomSeedCipher),
    profile:null,feedbackDeferred:true,freshAdmission:false,lockedPriorAnswers,nextTrialIndex:0,finishedAt:session.finishedAt,result:null,
    resultReference:result?surveyCognitiveResultReference(result):null,
    surveyBinding:{projectId:known.projectId,waveId:known.waveId,attemptId:known.attemptId,slotKey,
      measurementDigest:frozen.measurementDigest},
  }
}
export async function startSurveyCognitive(proof:SurveyCognitiveProof,slotKey:string,input:{priorAnswers:unknown;administrationProvenance:unknown}){
  const known=await verifiedSurveyAttempt(proof)
  const provenance=assertDevice(input.administrationProvenance)
  return prisma.$transaction(async tx=>{
    const {snapshot}=await lockAccess(tx,proof,known)
    const frozen=frozenUnit(snapshot,slotKey)
    const existing=await latest(tx,known,slotKey)
    if(existing)return sessionView(tx,known,slotKey,existing,frozen)
    const hold=getAssessmentOperationalHold({family:'COGNITIVE',key:'gonogo',version:'1.0.0',scoringVersion:'1.0.0'})
    if(hold)cognitiveFail(409,'该认知协议暂停新任务，请联系研究者')
    const assignment=snapshot.flow?await ensureSurveyFlowAssignment(tx,{...scope(known,slotKey),participantId:known.participantId,
      researchCode:proof.researchCode,accessCredential:proof.accessCredential,snapshot}):null
    const locked=await freezeSurveyTaskPrefix(tx,known,snapshot,slotKey,input.priorAnswers,assignment)
    const now=new Date()
    const session=await tx.surveyCognitiveSession.create({data:{id:randomUUID(),...scope(known,slotKey),epoch:1,
      measurementDigest:frozen.measurementDigest,status:'IN_PROGRESS',
      randomSeedCipher:encryptUnifiedRuntimePayload(randomBytes(32).toString('hex')),
      lockedAnswersCipher:encryptUnifiedRuntimePayload(locked),lockedAnswersHash:canonicalHash(locked),
      admissionCipher:encryptUnifiedRuntimePayload(provenance),
      retentionReviewAt:new Date(now.getTime()+frozen.partialRetentionDays*86400000),
    }})
    return {...await sessionView(tx,known,slotKey,{...session,result:null},frozen),freshAdmission:true}
  })
}
export async function readSurveyCognitive(proof:SurveyCognitiveProof,slotKey:string,sessionId:string){
  const known=await verifiedSurveyAttempt(proof)
  return prisma.$transaction(async tx=>{
    const {snapshot}=await lockAccess(tx,proof,known,true)
    const frozen=frozenUnit(snapshot,slotKey),current=await boundSession(tx,known,slotKey,sessionId)
    if(current.measurementDigest!==frozen.measurementDigest)cognitiveFail(409,'认知会话测量身份不匹配')
    return sessionView(tx,known,slotKey,current,frozen)
  })
}
export async function interruptSurveyCognitive(proof:SurveyCognitiveProof,slotKey:string,sessionId:string,epoch:number){
  const known=await verifiedSurveyAttempt(proof)
  return prisma.$transaction(async tx=>{
    const {snapshot}=await lockAccess(tx,proof,known)
    const frozen=frozenUnit(snapshot,slotKey),current=await boundSession(tx,known,slotKey,sessionId,epoch)
    if(current.status==='COMPLETED')return sessionView(tx,known,slotKey,current,frozen)
    if(current.status!=='IN_PROGRESS'&&current.status!=='INTERRUPTED')cognitiveFail(409,'当前认知任务不能标记中断')
    if(current.status==='IN_PROGRESS'){
      await tx.surveyCognitiveSession.update({where:{id:current.id},data:{status:'INTERRUPTED',interruptedAt:new Date()}})
      current.status='INTERRUPTED'
    }
    return sessionView(tx,known,slotKey,current,frozen)
  })
}
export async function restartSurveyCognitive(proof:SurveyCognitiveProof,slotKey:string,sessionId:string,epoch:number){
  const known=await verifiedSurveyAttempt(proof)
  return prisma.$transaction(async tx=>{
    const {snapshot}=await lockAccess(tx,proof,known)
    const frozen=frozenUnit(snapshot,slotKey)
    const replacement=await latest(tx,known,slotKey)
    if(epoch===1&&replacement?.epoch===2){
      const old=await tx.surveyCognitiveSession.findFirst({where:{...scope(known,slotKey),id:sessionId,epoch:1,status:'ABANDONED'}})
      if(old&&old.measurementDigest===frozen.measurementDigest&&replacement.measurementDigest===frozen.measurementDigest)
        return sessionView(tx,known,slotKey,replacement,frozen)
    }
    const current=assertBoundSession(replacement,sessionId,epoch)
    if(current.result||current.status!=='INTERRUPTED'||current.epoch!==1)
      cognitiveFail(409,'只允许对尚未提交且明确中断的认知任务整单元重做一次')
    if(current.measurementDigest!==frozen.measurementDigest)cognitiveFail(409,'认知会话冻结身份不匹配')
    await tx.surveyCognitiveSession.update({where:{id:current.id},data:{status:'ABANDONED',finishedAt:new Date()}})
    const session=await tx.surveyCognitiveSession.create({data:{id:randomUUID(),...scope(known,slotKey),epoch:2,
      status:'IN_PROGRESS',measurementDigest:current.measurementDigest,
      randomSeedCipher:encryptUnifiedRuntimePayload(randomBytes(32).toString('hex')),
      lockedAnswersCipher:current.lockedAnswersCipher,lockedAnswersHash:current.lockedAnswersHash,
      admissionCipher:current.admissionCipher,retentionReviewAt:current.retentionReviewAt,
    }})
    return {...await sessionView(tx,known,slotKey,{...session,result:null},frozen),freshAdmission:true}
  })
}
export type SurveyCognitiveFinalInput={submissionId:string;attemptEpoch:number;definitionHash:string;
  contextSnapshotHash?:string|null;trials:unknown[];administrationProvenance?:AdministrationProvenanceV1}
export async function submitSurveyCognitiveFinal(proof:SurveyCognitiveProof,slotKey:string,sessionId:string,input:SurveyCognitiveFinalInput){
  const submissionId=validateSubmissionId(input.submissionId)
  const known=await verifiedSurveyAttempt(proof)
  const frozen=frozenUnit(known.compiledSnapshot,slotKey)
  const definition=surveyCognitiveTaskDefinition(),snapshot=frozen.sessionSnapshot
  if(input.definitionHash!==snapshot.configHash||(input.contextSnapshotHash??null)!==null)
    cognitiveFail(409,'认知提交配置身份不匹配')
  const provenance=assertDevice(input.administrationProvenance)
  let trials
  try{trials=validateAndNormalizeTrials({definition,values:input.trials,maxTrials:120})}
  catch{ return cognitiveFail(400,'认知试次结构或试次数不合法') }
  const raw=createUnifiedCognitiveRawSubmissionPayload({attemptEpoch:input.attemptEpoch,trials,administrationProvenance:provenance})
  const canonical=prepareCanonicalSubmission({sessionId,slotKey,measurementDigest:frozen.measurementDigest,
    definitionHash:input.definitionHash,raw})
  assertCanonicalSubmissionPayloadSize(canonical,MAX_RAW_BYTES,'研究认知 FINAL')
  // Bounded 120-trial scoring occurs under the same current parent authority lock.
  // Replays return before invoking the scorer or constructing another encrypted raw record.
  return withFinalOnlyCompletionTransaction(async tx=>{
    const {attempt,snapshot:publication}=await lockAccess(tx,proof,known,true)
    const liveFrozen=frozenUnit(publication,slotKey)
    const current=await boundSession(tx,known,slotKey,sessionId,input.attemptEpoch)
    if(current.measurementDigest!==frozen.measurementDigest||liveFrozen.measurementDigest!==frozen.measurementDigest)
      cognitiveFail(409,'认知测量定义发生变化')
    const admitted=decryptUnifiedRuntimePayload<AdministrationProvenanceV1>(current.admissionCipher)
    if(canonicalHash(admitted)!==canonicalHash(provenance))cognitiveFail(409,'认知输入设备记录与准入不一致')
    const response=(result:{id:string;slotKey:string;epoch:number;resultHash:string;measurementDigest:string;completedAt:Date},replayed:boolean)=>({
      submissionId,payloadHash:canonical.hash,replayed,completed:true,feedbackDeferred:true,
      response:{sessionId,status:'COMPLETED' as const,finishedAt:result.completedAt,completed:true,feedbackDeferred:true},
      resultReference:surveyCognitiveResultReference(result),
    })
    if(current.result){
      if(current.result.submissionId!==submissionId||current.result.payloadHash!==canonical.hash)
        cognitiveFail(409,'这个认知任务已有不同的权威提交，不能覆盖')
      return response(current.result,true)
    }
    if(attempt.status!=='STARTED'||!['IN_PROGRESS','INTERRUPTED'].includes(current.status))
      cognitiveFail(409,'父级研究或认知任务已经结束')
    let scored
    try{scored=runPreparedAuthoritativeScorer(prepareAuthoritativeScorerContext({definition,session:snapshot,
      config:definition.configSchema.parse(snapshot.config),trials,
      randomSeed:decryptUnifiedRuntimePayload<string>(current.randomSeedCipher)}))}
    catch{ return cognitiveFail(400,'认知试次缺失、重复、顺序或刺激序列与冻结任务不一致') }
    const completedAt=new Date(),rawHash=canonicalHash(raw)
    const result:SurveyCognitiveStoredResult={schemaVersion:1,sessionId:current.id,...scope(known,slotKey),
      epoch:current.epoch,measurementDigest:frozen.measurementDigest,configHash:snapshot.configHash,
      protocolSignature:snapshot.protocolSignature,testType:'gonogo',configVersion:'1.1.0',engineVersion:'1.0.0',scoringVersion:'1.0.0',
      timingPolicy:'software-frame-v1',maturity:'PILOT',referenceMode:'none',metrics:scored.metrics,
      quality:scored.quality,audit:scored.audit,administrationProvenance:provenance,restartCount:current.epoch-1,
      rawHash,completedAt:completedAt.toISOString(),
    }
    const receipt=await tx.surveyCognitiveResult.create({data:{id:randomUUID(),sessionId:current.id,...scope(known,slotKey),
      epoch:current.epoch,measurementDigest:frozen.measurementDigest,submissionId,payloadHash:canonical.hash,
      rawHash,rawCipher:encryptUnifiedRuntimePayload(raw),resultHash:canonicalHash(result),
      resultCipher:encryptUnifiedRuntimePayload(result),trialCount:trials.length,completedAt,
    },select:surveyCognitiveReceiptSelect})
    const updated=await tx.surveyCognitiveSession.updateMany({where:{id:current.id,epoch:current.epoch,
      status:{in:['IN_PROGRESS','INTERRUPTED']}},data:{status:'COMPLETED',finishedAt:completedAt}})
    if(updated.count!==1)cognitiveFail(409,'认知会话状态发生并发变化')
    return response(receipt,false)
  })
}

/** Participant recovery projection, independently authorized; never returns trials or private scores. */
export async function readSurveyCognitiveProgress(proof:SurveyCognitiveProof){
  const known=await verifiedSurveyAttempt(proof)
  return readSurveyCognitiveProgressFromVerifiedAttempt(proof,known)
}
/** Internal task projection only. The caller must obtain this locator from
 * verifiedSurveyAttempt for this exact proof, including its publicId/project binding.
 * No route accepts it from clients; current authority is always rechecked below. */
export async function readSurveyCognitiveProgressFromVerifiedAttempt(proof:SurveyCognitiveProof,known:Known){
  if(known.attemptId!==proof.attemptId)cognitiveFail(403,'研究作答不属于当前入口')
  return prisma.$transaction(async tx=>{
    const {snapshot}=await lockAccess(tx,proof,known,true)
    const cognitiveSessions=await listSurveyCognitiveSessions(tx,known.attemptId)
    const lockedPriorAnswers=await readSurveyCognitiveLockedAnswers(tx,{projectId:known.projectId,waveId:known.waveId,
      attemptId:known.attemptId,publicationId:known.publicationId})
    if(snapshot.flow?.experiment?.mode==='QUESTIONNAIRE_VARIANTS'){
      const keys=new Set(snapshot.units.map(u=>u.instrumentKey))
      if(cognitiveSessions.some(s=>!keys.has(s.slotKey))||Object.keys(lockedPriorAnswers).some(key=>!keys.has(key)))
        cognitiveFail(409,'认知进度不属于当前问卷子版本')
    }
    return {cognitiveSessions,lockedPriorAnswers}
  })
}
