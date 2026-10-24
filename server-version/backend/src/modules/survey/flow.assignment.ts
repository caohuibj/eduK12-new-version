import { chooseMaterialGroup,findLinkedMaterialAssignment,planMaterialAllocation } from '../assessment-core/materials/allocation'
import { randomInt,createHash } from 'node:crypto'
import { SURVEY_NATIVE_SJT_PROTOCOL } from './situational-native.contract'
import { decodeSurveyAttemptContentBinding } from './content-binding.service'
import type { Prisma } from '@prisma/client'
import { canonicalHash } from '../assessment-runtime/canonical'
import { encryptUnifiedRuntimePayload,decryptUnifiedRuntimePayload } from '../assessment-runtime/security'
const hashResearchCredential=(raw:string)=>createHash('sha256').update(raw).digest('hex')
import type { ResearchFrozenPublication } from './publication.service'
import { surveyVariantProvenance,surveyVariantInstrumentKeys,surveyAssignedFlowBlocks,
  type FrozenSurveyFlow,type SurveyVariantProvenance } from './flow.definition'

export type SurveyFlowAssignment={
  schemaVersion:1
  flowDigest:string
  experimentKey:string|null
  groupKey:string|null
  algorithm:'CRYPTO_RANDOM_INT_V1'|'CRYPTO_QUOTA_WEIGHTED_V1'|'LINKED_INHERIT_V1'|'NO_EXPERIMENT'
  assignedAt:string
  variant?:SurveyVariantProvenance
  inheritedFromAttemptId?:string
}
export class SurveyAssignmentError extends Error{
  constructor(message:string){super(message)}
}
function fail(message:string):never{throw new SurveyAssignmentError(message)}
export const chooseSurveyGroup=(flow:FrozenSurveyFlow,draw:(max:number)=>number=randomInt)=>
  chooseMaterialGroup(flow.experiment,draw,fail)
export const assignmentDigest=(value:SurveyFlowAssignment)=>canonicalHash(value)
/** Reuse frozen group provenance hashes across a bounded analytics request.
 * Each stored assignment is still checked in full; no cross-request cache. */
export function prepareSurveyFlowAssignmentValidator(flow:FrozenSurveyFlow){
  const experiment=flow.experiment
  const expectedByGroup=new Map((experiment?.groups??[]).map(group=>{
    const expected=surveyVariantProvenance(flow,group.groupKey)
    return [group.groupKey,expected?canonicalHash(expected):null] as const
  }))
  return (value:SurveyFlowAssignment)=>{
    if(value.schemaVersion!==1||value.flowDigest!==flow.flowDigest
      ||value.experimentKey!==(experiment?.experimentKey??null)
      ||(experiment?(!value.groupKey||!expectedByGroup.has(value.groupKey)):value.groupKey!==null))
      fail('作答已有的冻结实验分配与当前发布不一致')
    const expected=value.groupKey?expectedByGroup.get(value.groupKey):null
    if(expected?(canonicalHash(value.variant??null)!==expected
      ||value.algorithm!=='CRYPTO_RANDOM_INT_V1'):value.variant!==undefined)
      fail('问卷子版本分配来源与冻结版本不一致')
  }
}
export function assertSurveyFlowAssignment(flow:FrozenSurveyFlow,value:SurveyFlowAssignment){
  const experiment=flow.experiment
  if(value.schemaVersion!==1||value.flowDigest!==flow.flowDigest
    ||value.experimentKey!==(experiment?.experimentKey??null)
    ||(experiment?(!value.groupKey||!experiment.groups.some(g=>g.groupKey===value.groupKey)):value.groupKey!==null))
    fail('作答已有的冻结实验分配与当前发布不一致')
  const expected=surveyVariantProvenance(flow,value.groupKey)
  if(expected?(canonicalHash(value.variant??null)!==canonicalHash(expected)
    ||value.algorithm!=='CRYPTO_RANDOM_INT_V1'):value.variant!==undefined)
    fail('问卷子版本分配来源与冻结版本不一致')
}
/** Used only for authorization/projection. FINAL retains the immutable union snapshot. */
export function assignedSurveySnapshot(snapshot:ResearchFrozenPublication,assignment:SurveyFlowAssignment|null){
  const flow=snapshot.flow
  if(!flow)return snapshot
  if(!assignment)fail('冻结流程缺少持久化分配')
  assertSurveyFlowAssignment(flow,assignment!)
  const keys=surveyVariantInstrumentKeys(flow,assignment!.groupKey)
  return keys?{...snapshot,units:snapshot.units.filter(u=>keys.has(u.instrumentKey)),
    flow:{...flow,blocks:surveyAssignedFlowBlocks(flow,assignment!.groupKey)}}:snapshot
}
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
  const wave=await tx.$queryRaw<Array<{id:string;publication_id:string|null;definition_digest:string|null}>>`
    SELECT wave.id,wave.publication_id,publication.definition_digest FROM survey_waves wave
    LEFT JOIN survey_publications publication ON publication.id=wave.publication_id AND publication.project_id=wave.project_id
    WHERE wave.id=${input.waveId} AND wave.project_id=${input.projectId} FOR SHARE OF wave
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
    assertSurveyFlowAssignment(flow,prior)
    if(input.snapshot.units.some(unit=>unit.executionProtocol===SURVEY_NATIVE_SJT_PROTOCOL)
      &&(current.contentBindingCipher!==null||current.contentBindingHash!==null)){
      if(!wave[0].publication_id||!wave[0].definition_digest)fail('冻结研究发布不可访问')
      decodeSurveyAttemptContentBinding({projectId:input.projectId,waveId:input.waveId,
        attemptId:input.attemptId,publicationId:wave[0].publication_id!,definitionDigest:wave[0].definition_digest!,
        selectedSnapshot:assignedSurveySnapshot(input.snapshot,prior),
        contentBindingCipher:current.contentBindingCipher,contentBindingHash:current.contentBindingHash})
    }
    return prior
  }
  // A missing assignment is not permission to re-randomize accepted native
  // work through parent task/FINAL entry points. The parent lock covers all slots.
  if(input.snapshot.units.some(unit=>unit.executionProtocol===SURVEY_NATIVE_SJT_PROTOCOL)){
    const child=await tx.situationalAttempt.findFirst({where:{surveyAttemptId:input.attemptId},select:{id:true}})
    if(child)fail('情境化任务已有原件，不能重新建立缺失的冻结分配')
  }
  let inherited:ReturnType<typeof findLinkedMaterialAssignment>
  if(experiment?.linkedPolicy==='KEEP_LINKED'&&input.participantId){
    const old=await tx.surveyWaveAttempt.findMany({where:{
      projectId:input.projectId,participantId:input.participantId,
      flowAssignmentCipher:{not:null},id:{not:input.attemptId},
    },orderBy:[{startedAt:'asc'},{id:'asc'}],
      select:{id:true,flowAssignmentCipher:true},take:100})
    function* priorAssignments(){
      for(const item of old){
        const assignment=decryptUnifiedRuntimePayload<SurveyFlowAssignment>(item.flowAssignmentCipher!)
        yield {...assignment,id:item.id}
      }
    }
    inherited=findLinkedMaterialAssignment(experiment,priorAssignments(),fail)
  }
  // A quota bucket represents assignment reservations, not number of FINALs.
  // Wave admission already holds a Wave UPDATE lock; an atomic counter CAS
  // also protects against legacy/parallel participant task reads.
  const policy=input.snapshot.quotaPolicy
  if(experiment?.mode==='QUESTIONNAIRE_VARIANTS'&&(policy||experiment.linkedPolicy!=='RERANDOMIZE'))
    fail('问卷子版本只支持每波次独立概率分配')
  if(policy&&!experiment)fail('研究条件配额要求冻结的实验定义')
  const buckets=policy?await tx.surveyExperimentQuotaBucket.findMany({where:{
    projectId:input.projectId,waveId:input.waveId,
  },select:{groupKey:true,maxAssigned:true,assignedCount:true}}):undefined
  const {groupKey,algorithm,inheritedFromAttemptId,quotaBucket}=planMaterialAllocation({
    experiment,policy,buckets,inherited,draw:randomInt,
  },fail)
  if(quotaBucket){
    const updated=await tx.surveyExperimentQuotaBucket.updateMany({
      where:{projectId:input.projectId,waveId:input.waveId,groupKey:quotaBucket.groupKey,
        assignedCount:quotaBucket.assignedCount,maxAssigned:quotaBucket.maxAssigned},
      data:{assignedCount:{increment:1}},
    })
    if(updated.count!==1)fail('本组名额正在由其他参与者领取，请重新进入')
  }
  const value:SurveyFlowAssignment={
    schemaVersion:1,flowDigest:flow.flowDigest,
    experimentKey:experiment?.experimentKey??null,groupKey,
    algorithm,
    assignedAt:new Date().toISOString(),
    ...(inheritedFromAttemptId?{inheritedFromAttemptId}:{}),
  }
  const variant=surveyVariantProvenance(flow,groupKey)
  if(variant)value.variant=variant
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
