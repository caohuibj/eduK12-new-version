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
import { hashResearchCredential } from './identity.service'
import { validateSurveyUnitAnswers } from './final.compute'
import { evaluateFlowCondition,staticFlowValues } from './flow.definition'
import { ensureSurveyFlowAssignment,assignedSurveySnapshot } from './flow.assignment'
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
const jsonCopy=<T>(value:T):T=>JSON.parse(JSON.stringify(value))
const assertDevice=(input:unknown):AdministrationProvenanceV1=>{
  const value=administrationProvenanceV1Schema.parse(input)
  if(value.deviceClass!=='DESKTOP_LAPTOP'||value.administrationMode!=='KEYBOARD_MOUSE')
    cognitiveFail(400,'本试点只支持桌面或笔记本电脑键盘作答')
  return value
}
/** All mutating and participant-read paths share the existing Survey lock order.
 * The Project SHARE serializes revocation/withdrawal; Wave SHARE serializes HARD_STOP.
 * Holding Attempt UPDATE serializes starts, restarts, child FINAL and parent FINAL. */
async function lockAccess(tx:Tx,proof:SurveyCognitiveProof,known:Known,allowCompleted=false){
  await tx.$queryRaw`SELECT id FROM survey_projects WHERE id=${known.projectId} FOR SHARE`
  await tx.$queryRaw`SELECT id FROM survey_waves WHERE id=${known.waveId} AND project_id=${known.projectId} FOR SHARE`
  await tx.$queryRaw`SELECT id FROM survey_wave_attempts WHERE id=${known.attemptId}
    AND project_id=${known.projectId} AND wave_id=${known.waveId} FOR UPDATE`
  const attempt=await tx.surveyWaveAttempt.findFirst({where:{
    id:known.attemptId,projectId:known.projectId,waveId:known.waveId,
  },include:{wave:{include:{publication:true}}}})
  if(!attempt||attempt.participantId!==known.participantId||attempt.excludedAt!==null
    ||!(allowCompleted?['STARTED','COMPLETED']:['STARTED']).includes(attempt.status))
    cognitiveFail(403,'研究作答已经结束、撤回或不属于当前入口')
  const wave=attempt!.wave,publication=wave.publication
  if(!publication||publication.id!==known.publicationId||publication.definitionDigest!==known.definitionDigest
    ||canonicalHash(jsonCopy(publication.compiledSnapshot))!==known.definitionDigest)
    cognitiveFail(409,'认知任务的冻结研究定义已失效')
  const end=wave.finishUntil??wave.closesAt
  if(wave.hardStopAt||!end||end<=new Date())cognitiveFail(403,'研究认知任务完成窗口已经结束')
  const hash=hashResearchCredential(proof.accessCredential)
  if(attempt!.participantId){
    if(!proof.researchCode)cognitiveFail(403,'请提供本人研究编号和私密凭证')
    await tx.$queryRaw`SELECT id FROM survey_participants WHERE id=${attempt!.participantId}
      AND project_id=${known.projectId} FOR UPDATE`
    const participant=await tx.surveyParticipant.findFirst({where:{
      id:attempt!.participantId,projectId:known.projectId,researchCode:proof.researchCode,
      credentialHash:hash,status:'ACTIVE',credentialRevokedAt:null,
    },select:{id:true}})
    if(!participant)cognitiveFail(403,'研究参与凭证已撤回或失效')
  }else if(attempt!.sessionHash!==hash)cognitiveFail(403,'研究参与凭证无效')
  const consent=await tx.surveyConsent.findFirst({where:{
    projectId:known.projectId,waveId:known.waveId,attemptId:known.attemptId,
    accepted:true,consentVersion:wave.consentVersion,
  },select:{id:true}})
  if(!consent)cognitiveFail(403,'当前研究缺少有效的知情同意记录')
  const snapshot=publication!.compiledSnapshot as unknown as ResearchFrozenPublication
  const assignment=snapshot.flow?.experiment?.mode==='QUESTIONNAIRE_VARIANTS'
    ?await ensureSurveyFlowAssignment(tx,{projectId:known.projectId,waveId:known.waveId,
      attemptId:known.attemptId,participantId:known.participantId,researchCode:proof.researchCode,
      accessCredential:proof.accessCredential,snapshot}):null
  return {attempt:attempt!,snapshot:assignment?assignedSurveySnapshot(snapshot,assignment):snapshot}
}
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
/** Prove reachability with normalized ordinary answers, then preserve their original canonical values.
 * Earlier cognitive units must already have a committed child result, never client metrics. */
export function prepareSurveyCognitivePriorAnswers(input:unknown){
  if(!input||typeof input!=='object'||Array.isArray(input))cognitiveFail(400,'认知开始需要前置答案对象')
  const answers=input as Record<string,unknown>
  // Bound untrusted nesting before canonicalization or any task validator recurses.
  let nodes=0
  const active=new WeakSet<object>()
  const guard=(value:unknown,depth:number):void=>{
    if(++nodes>300000||depth>4)cognitiveFail(400,'认知前置答案结构超过安全预算')
    if(value===null||typeof value==='string'||typeof value==='boolean')return
    if(typeof value==='number'&&Number.isFinite(value))return
    if(!value||typeof value!=='object'||active.has(value))cognitiveFail(400,'认知前置答案包含无效值')
    active.add(value as object)
    const children=Array.isArray(value)?value:Object.values(value as object)
    if(children.length>500)cognitiveFail(400,'认知前置答案字段数超限')
    for(const child of children)guard(child,depth+1)
    active.delete(value as object)
  }
  if(Object.keys(answers).length>30)cognitiveFail(400,'认知前置工具数超限')
  guard(answers,0)
  const canonical=prepareCanonicalSubmission(answers)
  assertCanonicalSubmissionPayloadSize(canonical,900000,'认知前置答案')
  return {answers,canonical}
}
async function prefixAnswers(tx:Tx,known:Known,snapshot:ResearchFrozenPublication,slotKey:string,input:unknown){
  const {answers}=prepareSurveyCognitivePriorAnswers(input)
  const verified:Record<string,Record<string,unknown>>={},locked:Record<string,unknown>={}
  const units=new Map(snapshot.units.map(u=>[u.instrumentKey,u]))
  if(snapshot.flow?.experiment?.mode==='QUESTIONNAIRE_VARIANTS'&&Object.keys(answers).some(key=>!units.has(key)))
    cognitiveFail(400,'认知前置答案不属于当前问卷子版本')
  const blocks=snapshot.flow?.blocks??snapshot.units.map(u=>({kind:'INSTRUMENT',instrumentKey:u.instrumentKey,when:undefined}))
  const vars=snapshot.flow?staticFlowValues(snapshot.flow):{}
  const priorCognitive:string[]=[]
  for(const block of blocks){
    if(block.when&&!evaluateFlowCondition(block.when,verified,vars))continue
    if(block.kind==='END')break
    if(block.kind!=='INSTRUMENT')continue
    const unit=units.get(block.instrumentKey!)
    if(!unit)cognitiveFail(409,'冻结认知路径含有不存在的工具')
    if(unit!.instrumentKey===slotKey){
      if(priorCognitive.length){
        const sessions=await tx.surveyCognitiveSession.findMany({where:{...scope(known,slotKey),
          slotKey:{in:priorCognitive}},orderBy:{epoch:'desc'},
          select:{slotKey:true,status:true,epoch:true,result:{select:{id:true}}}})
        const current=new Map<string,(typeof sessions)[number]>()
        for(const session of sessions)if(!current.has(session.slotKey))current.set(session.slotKey,session)
        if(priorCognitive.some(key=>current.get(key)?.status!=='COMPLETED'||!current.get(key)?.result))
          cognitiveFail(409,'请先完成前一个认知工具')
      }
      await assertSurveyCognitiveLockedAnswers(tx,known.attemptId,answers)
      return jsonCopy(locked)
    }
    if(unit!.kind==='COGNITIVE'){
      priorCognitive.push(unit!.instrumentKey)
    }else{
      if(!Object.prototype.hasOwnProperty.call(answers,unit!.instrumentKey))cognitiveFail(400,'请先完成认知任务之前的研究工具')
      const result=validateSurveyUnitAnswers(unit!,answers[unit!.instrumentKey])
      verified[unit!.instrumentKey]=result.rawAnswers
      locked[unit!.instrumentKey]=answers[unit!.instrumentKey]
    }
  }
  return cognitiveFail(409,'当前合法研究路径不会进入这个认知工具')
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
    if(snapshot.flow)await ensureSurveyFlowAssignment(tx,{...scope(known,slotKey),participantId:known.participantId,
      researchCode:proof.researchCode,accessCredential:proof.accessCredential,snapshot})
    const locked=await prefixAnswers(tx,known,snapshot,slotKey,input.priorAnswers)
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
    }})
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
