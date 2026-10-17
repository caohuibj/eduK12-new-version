import { surveySjtQuestions } from './sjt-structure'
import { assertSurveyCognitiveLockedAnswers } from './cognitive.results'
import { randomUUID } from 'node:crypto'
import { Prisma } from '@prisma/client'
import { prisma } from '../../config/database'
import { canonicalHash } from '../assessment-runtime/canonical'
import { encryptUnifiedRuntimePayload,decryptUnifiedRuntimePayload } from '../assessment-runtime/security'
import { hashResearchCredential } from './identity.service'
import { verifiedSurveyAttempt } from './admission.service'
import {ensureSurveyFlowAssignment,assignedSurveySnapshot} from './flow.assignment'
import type { ResearchFrozenPublication } from './publication.service'
import type { FormDraft,ScaleDraft,AnySjtDraft } from './builder.definition'
import { validateSurveyScaleTimings,SurveyScaleTimingError,
  type SurveyScaleTimings } from './timing.definition'

export class SurveyCheckpointError extends Error{
  constructor(readonly statusCode:number,message:string){super(message)}
}
function fail(status:number,message:string):never{throw new SurveyCheckpointError(status,message)}
type Proof={publicId:string;attemptId:string;accessCredential:string;researchCode?:string}
type CheckpointAnswers=Record<string,Record<string,unknown>>
type TimedCheckpointV2={schemaVersion:2;answers:CheckpointAnswers;
  itemTimings?:SurveyScaleTimings}
const MAX_CHECKPOINT_BYTES=65536
/** Partial drafts are never graded on save, but their JSON shape must be shallow
 * and valid. Unbounded nested values could overflow JSON.stringify or restore
 * a malformed Form into the browser long before FINAL validation. */
const safeCheckpointValue=(value:unknown):boolean=>{
  if(value===null||typeof value==='string')return true
  if(typeof value==='number')return Number.isFinite(value)
  const strings=(v:unknown)=>Array.isArray(v)&&v.length<=500
    &&v.every(x=>typeof x==='string')
  if(strings(value))return true
  if(!value||typeof value!=='object'||Array.isArray(value))return false
  const entries=Object.entries(value)
  if(entries.length===1&&entries[0][0]==='_surveyRefusal')
    return entries[0][1]===true
  return entries.length<=500&&entries.every(([key,item])=>
    /^[a-z][a-z0-9_-]{0,79}$/.test(key)&&(
      typeof item==='string'||typeof item==='number'&&Number.isFinite(item)
      ||strings(item)))
}
const validCheckpointAnswers=(snapshot:ResearchFrozenPublication,raw:unknown):CheckpointAnswers=>{
  if(!raw||typeof raw!=='object'||Array.isArray(raw))
    fail(400,'临时答案必须按研究工具分组')
  const answers=raw as Record<string,unknown>
  if(Object.keys(answers).length>snapshot.units.length)
    fail(400,'Checkpoint 包含超出本轮冻结工具数量的记录')
  const byUnit=new Map(snapshot.units.map(unit=>[unit.instrumentKey,unit]))
  for(const [unitKey,value] of Object.entries(answers)){
    const unit=byUnit.get(unitKey)
    if(!unit||!value||typeof value!=='object'||Array.isArray(value))
      fail(400,'Checkpoint 包含不存在或格式不合法的研究工具')
    const allowed=new Set<string>()
    if(unit.kind==='FORM'){
      const form=unit.displayDefinition as FormDraft
      for(const page of form.pages)for(const q of page.questions){
        if(!['MATRIX','MATRIX_MULTIPLE'].includes(q.type))allowed.add(q.itemKey)
        for(const row of q.rows)allowed.add(q.itemKey+':'+row.rowKey)
        if(q.otherOptionKey)allowed.add(q.itemKey+':other')
      }
    }else if(unit.kind==='SCALE'){
      for(const q of (unit.displayDefinition as ScaleDraft).items)allowed.add(q.itemKey)
    }else if(unit.kind==='SJT'){
      for(const q of surveySjtQuestions(unit.displayDefinition as AnySjtDraft))allowed.add(q.questionKey)
    }
    const keys=Object.keys(value as Record<string,unknown>)
    if(keys.length>500||keys.some(k=>!allowed.has(k)))
      fail(400,'Checkpoint 中含有未授权的题目编码')
    if(keys.some(k=>!safeCheckpointValue((value as Record<string,unknown>)[k])))
      fail(400,'Checkpoint 只能保存浅层的合法部分答案，不能包含嵌套对象或无效数值')
  }
  const encoded=JSON.stringify(raw)
  if(encoded===undefined||Buffer.byteLength(encoded,'utf8')>MAX_CHECKPOINT_BYTES)
    fail(413,'临时作答超过 64KB 限额；请减少自由文本')
  return JSON.parse(encoded) as CheckpointAnswers
}
type AuthContext={projectId:string;waveId:string;attemptId:string;
  definitionDigest:string;compiledSnapshot:ResearchFrozenPublication;
  participantId:string|null;status:string}
const access=async(tx:Prisma.TransactionClient,proof:Proof,known:AuthContext)=>{
  await tx.$queryRaw`SELECT id FROM survey_projects WHERE id=${known.projectId} FOR SHARE`
  await tx.$queryRaw`SELECT id FROM survey_waves
    WHERE id=${known.waveId} AND project_id=${known.projectId} FOR SHARE`
  await tx.$queryRaw`SELECT id FROM survey_wave_attempts
    WHERE id=${known.attemptId} AND project_id=${known.projectId}
      AND wave_id=${known.waveId} FOR UPDATE`
  const attempt=await tx.surveyWaveAttempt.findFirst({where:{
    id:known.attemptId,projectId:known.projectId,waveId:known.waveId,
  },include:{wave:true}})
  if(!attempt||attempt.participantId!==known.participantId||attempt.status!=='STARTED'||
    attempt.excludedAt!==null||attempt.wave.hardStopAt)
    fail(403,'此研究作答已经结束或撤回，不允许访问临时草稿')
  const finishUntil=attempt.wave.finishUntil??attempt.wave.closesAt
  if(!finishUntil||finishUntil<=new Date())
    fail(403,'当前研究完成窗口已经结束')
  const publication=await tx.surveyPublication.findFirst({where:{
    id:attempt.wave.publicationId!,projectId:known.projectId,
  },select:{definitionDigest:true,compiledSnapshot:true}})
  if(!publication||publication.definitionDigest!==known.definitionDigest||
    canonicalHash(JSON.parse(JSON.stringify(publication.compiledSnapshot)))!==publication.definitionDigest)
    fail(409,'临时作答与冻结发布内容不一致')
  const hash=hashResearchCredential(proof.accessCredential)
  if(attempt.participantId){
    if(known.compiledSnapshot.flow?.experiment?.mode==='QUESTIONNAIRE_VARIANTS')
      await tx.$queryRaw`SELECT id FROM survey_participants
        WHERE id=${attempt.participantId} AND project_id=${known.projectId} FOR UPDATE`
    else await tx.$queryRaw`SELECT id FROM survey_participants
      WHERE id=${attempt.participantId} AND project_id=${known.projectId} FOR SHARE`
    const person=await tx.surveyParticipant.findFirst({where:{
      id:attempt.participantId,projectId:known.projectId,
      researchCode:proof.researchCode,credentialHash:hash,
      credentialRevokedAt:null,status:'ACTIVE',
    },select:{id:true}})
    if(!person)fail(403,'研究参与者凭证已失效')
  }else if(attempt.sessionHash!==hash)fail(403,'匿名恢复凭证已失效')
  const policy=known.compiledSnapshot.checkpointPolicy
  if(!policy?.enabled)fail(404,'本研究未开启服务器临时存档')
  const assignment=known.compiledSnapshot.flow?.experiment?.mode==='QUESTIONNAIRE_VARIANTS'
    ?await ensureSurveyFlowAssignment(tx,{...known,researchCode:proof.researchCode,
      accessCredential:proof.accessCredential,snapshot:known.compiledSnapshot}):null
  const snapshot=assignment?assignedSurveySnapshot(known.compiledSnapshot,assignment):known.compiledSnapshot
  return {policy,wave:attempt.wave,snapshot}
}
const context=async(proof:Proof):Promise<AuthContext>=>verifiedSurveyAttempt(proof)
export async function readSurveyCheckpoint(proof:Proof){
  const known=await context(proof)
  return prisma.$transaction(async tx=>{
    const {snapshot}=await access(tx,proof,known)
    const checkpoint=await tx.surveyAttemptCheckpoint.findUnique({where:{
      attemptId:known.attemptId,
    }})
    if(!checkpoint)return {enabled:true as const,revision:0,checkpoint:null}
    if(checkpoint.expiresAt<=new Date()){
      await tx.surveyAttemptCheckpoint.delete({where:{id:checkpoint.id}})
      return {enabled:true as const,revision:0,checkpoint:null}
    }
    if(checkpoint.definitionDigest!==known.definitionDigest)
      fail(409,'临时存档冻结版本不一致，不得恢复')
    const stored=decryptUnifiedRuntimePayload<CheckpointAnswers|TimedCheckpointV2>(checkpoint.contentCipher)
    if(canonicalHash(stored)!==checkpoint.contentHash)
      fail(409,'临时密文校验失败')
    const envelope='schemaVersion' in stored&&stored.schemaVersion===2
      ?stored as TimedCheckpointV2:null
    const answers=envelope?.answers??stored as CheckpointAnswers
    let itemTimings:SurveyScaleTimings|undefined
    try{
      validCheckpointAnswers(snapshot,answers)
      itemTimings=validateSurveyScaleTimings(snapshot,answers,envelope?.itemTimings,false)
    }catch{fail(409,'服务器临时存档与当前问卷子版本不匹配')}
    return {enabled:true as const,revision:checkpoint.version,
      checkpoint:{answers,...(itemTimings?{itemTimings}:{}),
        expiresAt:checkpoint.expiresAt,updatedAt:checkpoint.updatedAt,
        source:'ENCRYPTED_PARTIAL_NOT_FINAL' as const}}
  })
}
export async function saveSurveyCheckpoint(proof:Proof,input:{
  revision:number;answers:unknown;itemTimings?:unknown;
}){
  const known=await context(proof)
  return prisma.$transaction(async tx=>{
    const {policy,wave,snapshot}=await access(tx,proof,known)
    const answers=validCheckpointAnswers(snapshot,input.answers)
    let itemTimings:SurveyScaleTimings|undefined
    try{
      itemTimings=validateSurveyScaleTimings(snapshot,answers,
        input.itemTimings,false)
    }catch(e){
      if(e instanceof SurveyScaleTimingError)fail(400,e.path+'：'+e.message)
      throw e
    }
    const content= itemTimings?{
      schemaVersion:2 as const,answers,itemTimings,
    }:answers
    if(Buffer.byteLength(JSON.stringify(content),'utf8')>MAX_CHECKPOINT_BYTES)
      fail(413,'临时作答和计时记录合计超过 64KB，无法安全暂存')
    if(known.compiledSnapshot.units.some(unit=>unit.kind==='COGNITIVE'))
      await assertSurveyCognitiveLockedAnswers(tx,known.attemptId,answers)
    const now=new Date()
    const end=wave.finishUntil??wave.closesAt
    const expiresAt=new Date(Math.min(now.getTime()+policy.ttlHours*3600000,
      end?.getTime()??Number.POSITIVE_INFINITY))
    if(expiresAt<=now)fail(409,'临时存档时间窗口已截止')
    const prior=await tx.surveyAttemptCheckpoint.findUnique({where:{attemptId:known.attemptId}})
    if(prior&&prior.expiresAt<=now)await tx.surveyAttemptCheckpoint.delete({where:{id:prior.id}})
    const live=prior&&prior.expiresAt>now?prior:null
    if(input.revision!==(live?.version??0))
      fail(409,'另一设备已修改临时存档，请先读取最新内容，不自动覆盖')
    if(input.revision>=100)fail(413,'单次 Attempt 最多允许 100 次服务器 Checkpoint 保存')
    const contentHash=canonicalHash(content)
    const contentCipher=encryptUnifiedRuntimePayload(content)
    if(Buffer.byteLength(contentCipher,'utf8')>130000)
      fail(413,'加密临时答案体积超限')
    if(live){
      const changed=await tx.surveyAttemptCheckpoint.updateMany({
        where:{id:live.id,version:input.revision},
        data:{version:{increment:1},contentHash,contentCipher,expiresAt,updatedAt:now},
      })
      if(changed.count!==1)fail(409,'服务器存档发生并发冲突')
    }else{
      await tx.surveyAttemptCheckpoint.create({data:{
        id:randomUUID(),projectId:known.projectId,waveId:known.waveId,
        attemptId:known.attemptId,definitionDigest:known.definitionDigest,
        contentHash,contentCipher,expiresAt,version:1,
      }})
    }
    await tx.surveyEvent.create({data:{
      id:randomUUID(),actorUserId:null,projectId:known.projectId,
      action:'SURVEY_CHECKPOINT_SAVED',
      metadata:{waveId:known.waveId,revision:input.revision+1,
        bytes:Buffer.byteLength(contentCipher,'utf8'),expiresAt:expiresAt.toISOString()},
    }})
    return {enabled:true as const,revision:input.revision+1,expiresAt,
      source:'ENCRYPTED_PARTIAL_NOT_FINAL' as const}
  })
}
export async function clearSurveyCheckpoint(proof:Proof){
  const known=await context(proof)
  return prisma.$transaction(async tx=>{
    await access(tx,proof,known)
    const deleted=await tx.surveyAttemptCheckpoint.deleteMany({where:{
      projectId:known.projectId,waveId:known.waveId,attemptId:known.attemptId,
    }})
    return {cleared:deleted.count>0}
  })
}
export async function cleanupExpiredSurveyCheckpoints(now=new Date()){
  const rows=await prisma.surveyAttemptCheckpoint.findMany({where:{
    expiresAt:{lte:now},
  },orderBy:[{expiresAt:'asc'},{id:'asc'}],select:{id:true},take:100})
  if(!rows.length)return 0
  const deleted=await prisma.surveyAttemptCheckpoint.deleteMany({where:{
    id:{in:rows.map(r=>r.id)},expiresAt:{lte:now},
  }})
  return deleted.count
}
