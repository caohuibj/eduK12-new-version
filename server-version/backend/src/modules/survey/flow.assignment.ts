import { randomInt,createHash } from 'node:crypto'
import type { Prisma } from '@prisma/client'
import { canonicalHash } from '../assessment-runtime/canonical'
import { encryptUnifiedRuntimePayload,decryptUnifiedRuntimePayload } from '../assessment-runtime/security'
const hashResearchCredential=(raw:string)=>createHash('sha256').update(raw).digest('hex')
import type { ResearchFrozenPublication } from './publication.service'
import type { FrozenSurveyFlow } from './flow.definition'

export type SurveyFlowAssignment={
  schemaVersion:1
  flowDigest:string
  experimentKey:string|null
  groupKey:string|null
  algorithm:'CRYPTO_RANDOM_INT_V1'|'CRYPTO_QUOTA_WEIGHTED_V1'|'LINKED_INHERIT_V1'|'NO_EXPERIMENT'
  assignedAt:string
  inheritedFromAttemptId?:string
}
export class SurveyAssignmentError extends Error{
  constructor(message:string){super(message)}
}
function fail(message:string):never{throw new SurveyAssignmentError(message)}
export const chooseSurveyGroup=(flow:FrozenSurveyFlow,draw:(max:number)=>number=randomInt)=>{
  const groups=flow.experiment?.groups
  if(!groups)return null
  const total=groups.reduce((sum,g)=>sum+g.weight,0)
  const selected=draw(total)
  if(!Number.isSafeInteger(selected)||selected<0||selected>=total)
    return fail('实验随机数源超出受控范围')
  let position=selected
  for(const group of groups){
    if(position<group.weight)return group.groupKey
    position-=group.weight
  }
  return fail('实验分配无法匹配冻结权重')
}
export const assignmentDigest=(value:SurveyFlowAssignment)=>canonicalHash(value)
/** Assignment is a durable, encrypted property of one Attempt, not a browser
 * session, JWT claim, client random number or mutable Wave setting.
 * Caller proves credential again while holding the exact Attempt lock.
 */
export async function ensureSurveyFlowAssignment(tx:Prisma.TransactionClient,input:{
  projectId:string;waveId:string;attemptId:string;participantId:string|null;
  researchCode?:string;accessCredential:string;snapshot:ResearchFrozenPublication
}):Promise<SurveyFlowAssignment|null>{
  const flow=input.snapshot.flow
  if(!flow)return null
  const experiment=flow.experiment
  const project=await tx.$queryRaw<Array<{id:string}>>`
    SELECT id FROM survey_projects WHERE id=${input.projectId} FOR SHARE
  `
  if(project.length!==1)fail('研究项目不可访问')
  const wave=await tx.$queryRaw<Array<{id:string}>>`
    SELECT id FROM survey_waves
    WHERE id=${input.waveId} AND project_id=${input.projectId} FOR SHARE
  `
  if(wave.length!==1)fail('冻结研究波次不可访问')
  const locked=await tx.$queryRaw<Array<{id:string}>>`
    SELECT id FROM survey_wave_attempts
    WHERE id=${input.attemptId} AND project_id=${input.projectId}
      AND wave_id=${input.waveId} FOR UPDATE
  `
  if(locked.length!==1)fail('作答身份不属于此研究')
  const current=await tx.surveyWaveAttempt.findFirst({where:{
    id:input.attemptId,projectId:input.projectId,waveId:input.waveId,
  }})
  if(!current||current.participantId!==input.participantId||
    !['STARTED','COMPLETED'].includes(current.status))
    fail('研究作答已停止或身份发生变化')
  const credentialHash=hashResearchCredential(input.accessCredential)
  if(input.participantId){
    await tx.$queryRaw`SELECT id FROM survey_participants WHERE id=${input.participantId}
      AND project_id=${input.projectId} FOR UPDATE`
    const live=await tx.surveyParticipant.findFirst({where:{
      id:input.participantId,projectId:input.projectId,researchCode:input.researchCode,
      status:'ACTIVE',credentialHash,credentialRevokedAt:null,
    },select:{id:true}})
    if(!live)fail('研究编号的私密凭证已撤销')
  }else if(current.sessionHash!==credentialHash)fail('单次匿名凭证已失效')
  if(current.flowAssignmentCipher){
    const prior=decryptUnifiedRuntimePayload<SurveyFlowAssignment>(current.flowAssignmentCipher)
    if(prior.schemaVersion!==1||prior.flowDigest!==flow.flowDigest
      ||prior.experimentKey!==(experiment?.experimentKey??null)
      ||(experiment?(!prior.groupKey||!experiment.groups.some(g=>g.groupKey===prior.groupKey)):prior.groupKey!==null))
      fail('作答已有的冻结实验分配与当前发布不一致')
    return prior
  }
  let groupKey:string|null=null
  let inheritedFromAttemptId:string|undefined
  if(experiment?.linkedPolicy==='KEEP_LINKED'&&input.participantId){
    const old=await tx.surveyWaveAttempt.findMany({where:{
      projectId:input.projectId,participantId:input.participantId,
      flowAssignmentCipher:{not:null},id:{not:input.attemptId},
    },orderBy:[{startedAt:'asc'},{id:'asc'}],
      select:{id:true,flowAssignmentCipher:true},take:100})
    for(const item of old){
      const assignment=decryptUnifiedRuntimePayload<SurveyFlowAssignment>(item.flowAssignmentCipher!)
      if(assignment.schemaVersion!==1||assignment.experimentKey!==experiment.experimentKey)
        continue
      if(!assignment.groupKey||!experiment.groups.some(g=>g.groupKey===assignment.groupKey))
        fail('保持分组要求沿用此前合法实验组；新波次的组别定义不一致')
      groupKey=assignment.groupKey
      inheritedFromAttemptId=item.id
      break
    }
  }
  // A quota bucket represents assignment reservations, not number of FINALs.
  // Wave admission already holds a Wave UPDATE lock; an atomic counter CAS
  // also protects against legacy/parallel participant task reads.
  const policy=input.snapshot.quotaPolicy
  let quotaBucket:{groupKey:string;maxAssigned:number;assignedCount:number}|undefined
  if(policy){
    if(!experiment)fail('研究条件配额要求冻结的实验定义')
    const buckets=await tx.surveyExperimentQuotaBucket.findMany({where:{
      projectId:input.projectId,waveId:input.waveId,
    },select:{groupKey:true,maxAssigned:true,assignedCount:true}})
    if(buckets.length!==experiment.groups.length||
      buckets.some(b=>policy.groupLimits[b.groupKey]!==b.maxAssigned))
      fail('实验配额计数器与冻结发布定义不一致')
    if(groupKey){
      quotaBucket=buckets.find(b=>b.groupKey===groupKey)
      if(!quotaBucket||quotaBucket.assignedCount>=quotaBucket.maxAssigned)
        fail('既有研究实验组本轮名额已满，不允许随机改变纵向分组')
    }else{
      const candidates=experiment.groups.filter(g=>{
        const b=buckets.find(x=>x.groupKey===g.groupKey)
        return !!b&&b.assignedCount<b.maxAssigned
      })
      if(!candidates.length)fail('本波次全部实验组名额已用尽')
      const total=candidates.reduce((acc,g)=>acc+g.weight,0)
      let draw=randomInt(total)
      const picked=candidates.find(g=>{
        if(draw<g.weight)return true
        draw-=g.weight
        return false
      })
      if(!picked)fail('条件实验分配无法在配额预算内完成')
      groupKey=picked.groupKey
      quotaBucket=buckets.find(b=>b.groupKey===groupKey)
    }
    if(!quotaBucket)fail('实验条件配额读取失败')
    const updated=await tx.surveyExperimentQuotaBucket.updateMany({
      where:{projectId:input.projectId,waveId:input.waveId,groupKey:quotaBucket.groupKey,
        assignedCount:quotaBucket.assignedCount,maxAssigned:quotaBucket.maxAssigned},
      data:{assignedCount:{increment:1}},
    })
    if(updated.count!==1)fail('本组名额正在由其他参与者领取，请重新进入')
  }else if(!groupKey)groupKey=chooseSurveyGroup(flow)
  const value:SurveyFlowAssignment={
    schemaVersion:1,flowDigest:flow.flowDigest,
    experimentKey:experiment?.experimentKey??null,groupKey,
    algorithm:inheritedFromAttemptId?'LINKED_INHERIT_V1':
      experiment?(policy?'CRYPTO_QUOTA_WEIGHTED_V1':'CRYPTO_RANDOM_INT_V1'):'NO_EXPERIMENT',
    assignedAt:new Date().toISOString(),
    ...(inheritedFromAttemptId?{inheritedFromAttemptId}:{}),
  }
  const changed=await tx.surveyWaveAttempt.updateMany({
    where:{id:current.id,projectId:input.projectId,flowAssignmentCipher:null},
    data:{flowAssignmentCipher:encryptUnifiedRuntimePayload(value)},
  })
  if(changed.count!==1)fail('同一研究作答在分组期间发生并发更改')
  return value
}

/** Admit first, allocate inside the same transaction before returning the
 * participant's admission receipt. This makes group quotas meaningful before
 * question presentation; failed reservations roll back the whole admission.
 */
export async function allocateResearchFlowOnAdmission(tx:Prisma.TransactionClient,input:{
  publicationId:string;projectId:string;waveId:string;attemptId:string;
  participantId:string|null;researchCode?:string;accessCredential:string;
}){
  const publication=await tx.surveyPublication.findFirst({where:{
    id:input.publicationId,projectId:input.projectId,
  },select:{definitionDigest:true,compiledSnapshot:true}})
  if(!publication)fail('研究入场时冻结发布定义不可访问')
  const snapshot=publication.compiledSnapshot as unknown as ResearchFrozenPublication
  if(!snapshot.flow)return
  if(snapshot.projectId!==input.projectId||snapshot.waveId!==input.waveId||
    canonicalHash(JSON.parse(JSON.stringify(snapshot)))!==publication.definitionDigest)
    fail('研究入场时冻结发布定义未通过摘要校验')
  await ensureSurveyFlowAssignment(tx,{...input,snapshot})
}
