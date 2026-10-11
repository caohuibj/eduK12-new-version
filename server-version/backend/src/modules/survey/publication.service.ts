import { randomUUID } from 'node:crypto'
import { Prisma } from '@prisma/client'
import { prisma } from '../../config/database'
import { canonicalHash } from '../assessment-runtime/canonical'
import { retainSurveyMedia } from './media.references'
import { assertSurveyDraft, surveyKindSchema } from './builder.definition'
import { compileResearchScale, compileResearchSjt } from './builder.compiler'
import { SurveyWaveError } from './waves.service'
import { compileSurveyFlow,SurveyFlowError,type FrozenSurveyFlow } from './flow.definition'
import { compileGroupQuotaPolicy,compileCheckpointPolicy,
  type SurveyGroupQuotaPolicy,type SurveyCheckpointPolicy } from './operations.definition'

/** Stored data contract for PR3 anonymous Wave runtime adapter.
 * This is a frozen research-only definition, NOT a formal scale/SJT
 * publication. The Survey FINAL admission adapter is separate from legacy catalog.
 */
export interface ResearchFrozenUnit {
  draftId:string
  instrumentKey:string
  kind:'FORM'|'SCALE'|'SJT'
  title:string
  draftRevision:number
  sourceDigest:string
  scoringDigest:string|null
  compiledDefinition:unknown
  displayDefinition:unknown
}
export interface ResearchFrozenPublication {
  schemaVersion:1
  purpose:'RESEARCH_ONLY'
  projectId:string
  waveId:string
  collectionMode:'SINGLE_UNLINKED'|'LINKED_WAVES'
  consentVersion:number
  linkageNoticeConfirmed:boolean
  consentDigest:string
  units:ResearchFrozenUnit[]
  flow?:FrozenSurveyFlow
  quotaPolicy?:SurveyGroupQuotaPolicy
  checkpointPolicy?:SurveyCheckpointPolicy
  runtimeStatus:'SURVEY_FINAL_V1'
}
const stop=(message:string):never=>{throw new SurveyWaveError(409,message)}

export function compileFrozenResearchUnit(draft:{
  id:string;instrumentKey:string;kind:string;title:string;revision:number;definition:unknown
}):ResearchFrozenUnit {
  const kind=surveyKindSchema.parse(draft.kind)
  const normalized=assertSurveyDraft(kind,draft.definition,true)
  const sourceDigest=canonicalHash(JSON.parse(JSON.stringify({kind,definition:normalized})))
  if(kind==='FORM'){
    return {draftId:draft.id,instrumentKey:draft.instrumentKey,kind,title:draft.title,
      draftRevision:draft.revision,sourceDigest,scoringDigest:null,
      compiledDefinition:normalized,displayDefinition:normalized}
  }
  if(kind==='SCALE'){
    const compiled=compileResearchScale(draft.title,normalized)
    return {draftId:draft.id,instrumentKey:draft.instrumentKey,kind,title:draft.title,
      draftRevision:draft.revision,sourceDigest,
      scoringDigest:canonicalHash(compiled.scoring),compiledDefinition:compiled,displayDefinition:normalized}
  }
  const sjt=compileResearchSjt(draft.instrumentKey,normalized)
  return {draftId:draft.id,instrumentKey:draft.instrumentKey,kind,title:draft.title,
    draftRevision:draft.revision,sourceDigest,
    scoringDigest:canonicalHash(sjt.package.definition.scoring),
    compiledDefinition:sjt.package.definition,displayDefinition:normalized}
}

/** Freeze one immutable research publication. OPEN admission is a separate
 * authenticated action and remains fail-closed behind SURVEY_PUBLICATION_ENABLED.
 */
export async function freezeResearchWaveDraft(input:{
  actorUserId:string;projectId:string;waveId:string;revision:number
}):Promise<{publicationId:string;version:number;digest:string;waveId:string;runtimeReady:true}> {
  return prisma.$transaction(async tx=>{
    // Lock project first so concurrent freezes share one exact publication sequence.
    const locked=await tx.$queryRaw<Array<{id:string;status:string;collectionMode:string}>>`
      SELECT p.id,p.status,p.collection_mode AS "collectionMode"
      FROM "survey_projects" p
      JOIN "users" u ON u.id=p.owner_user_id
      JOIN "survey_researcher_grants" g ON g.user_id=u.id
      JOIN "survey_mfa_credentials" m ON m.user_id=u.id
      WHERE p.id=${input.projectId} AND p.owner_user_id=${input.actorUserId}
        AND u.account_domain='SURVEY' AND u.is_active AND NOT u.is_frozen
        AND (u.expires_at IS NULL OR u.expires_at>statement_timestamp())
        AND g.status='ACTIVE' AND m.enabled=TRUE
      FOR UPDATE OF p
    `
    const project=locked[0]
    if(!project)stop('该研究不属于当前研究者')
    if(!['DRAFT','ACTIVE'].includes(project.status))stop('项目状态不允许冻结新的研究内容')
    const lockedWave=await tx.$queryRaw<Array<{id:string}>>`
      SELECT "id" FROM "survey_waves"
      WHERE "id"=${input.waveId} AND "project_id"=${input.projectId}
      FOR UPDATE
    `
    if(!lockedWave.length)stop('研究波次不存在')
    const wave=await tx.surveyWave.findUniqueOrThrow({where:{id:input.waveId}})
    if(wave.revision!==input.revision||wave.status!=='DRAFT'||wave.publicationId)
      stop('波次已经冻结或被其他编辑会话修改')
    if(wave.consentText.trim().length<20)stop('知情同意信息至少需要 20 字')
    if(project.collectionMode==='LINKED_WAVES'&&!wave.linkageNoticeConfirmed)
      stop('跨波次研究需先确认已明确告知研究编号会关联历次作答')
    const ids=Array.isArray(wave.instrumentIds)?wave.instrumentIds:[]
    if(!ids.length||ids.length>30||ids.some(id=>typeof id!=='string')||new Set(ids).size!==ids.length)
      stop('波次必须准确选择 1–30 个不同研究工具')
    const orderedIds=ids as string[]
    // Rows locked before snapshot so a simultaneous draft update cannot
    // change the definition between compiler read and commit.
    const locks=await tx.$queryRaw<Array<{id:string}>>`
      SELECT "id" FROM "survey_instrument_drafts"
      WHERE "project_id"=${input.projectId} AND "id" IN (${Prisma.join(orderedIds)})
        AND "status"='DRAFT'
      ORDER BY "id" FOR SHARE
    `
    if(locks.length!==orderedIds.length)stop('波次中存在被删除、归档或越权的研究工具')
    const rows=await tx.surveyInstrumentDraft.findMany({
      where:{projectId:input.projectId,id:{in:orderedIds},status:'DRAFT'},
    })
    const byId=new Map(rows.map(row=>[row.id,row]))
    const units=orderedIds.map(id=>{
      const draft=byId.get(id)
      if(!draft)stop('研究工具来源已发生变化')
      return compileFrozenResearchUnit(draft!)
    })
    let frozenFlow:FrozenSurveyFlow|undefined
    if(wave.flowDefinition){
      try{
        frozenFlow=compileSurveyFlow(wave.flowDefinition,units,
          project.collectionMode as ResearchFrozenPublication['collectionMode'])
      }catch(e){
        if(e instanceof SurveyFlowError)stop('冻结 Flow 结构未通过校验：'+
          e.issues.slice(0,5).map(i=>i.path+': '+i.message).join('；'))
        throw e
      }
    }
    let quotaPolicy:SurveyGroupQuotaPolicy|undefined
    let checkpointPolicy:SurveyCheckpointPolicy|undefined
    try{
      quotaPolicy=compileGroupQuotaPolicy(wave.quotaPolicy,frozenFlow)
      checkpointPolicy=compileCheckpointPolicy(wave.checkpointPolicy)
    }catch(e){
      stop(e instanceof Error?e.message:'研究运营设置未通过冻结校验')
    }
    const snapshot:ResearchFrozenPublication={
      schemaVersion:1,purpose:'RESEARCH_ONLY',projectId:input.projectId,
      waveId:input.waveId,collectionMode:project.collectionMode as ResearchFrozenPublication['collectionMode'],
      consentVersion:wave.consentVersion,
      linkageNoticeConfirmed:wave.linkageNoticeConfirmed,
      consentDigest:canonicalHash({text:wave.consentText,version:wave.consentVersion,
        linkedConfirmed:wave.linkageNoticeConfirmed}),
      units,...(frozenFlow?{flow:frozenFlow}:{}),
      ...(quotaPolicy?{quotaPolicy}:{}),
      ...(checkpointPolicy?{checkpointPolicy}:{}),
      runtimeStatus:'SURVEY_FINAL_V1',
    }
    const serial=JSON.stringify(snapshot)
    if(Buffer.byteLength(serial,'utf8')>4000000)stop('波次研究内容超出安全体积')
    const digest=canonicalHash(JSON.parse(serial))
    const version=(await tx.surveyPublication.aggregate({where:{projectId:input.projectId},_max:{version:true}}))._max.version||0
    const publicationId=randomUUID()
    await retainSurveyMedia(tx,input.actorUserId,input.projectId,publicationId,
      rows.map(r=>({kind:surveyKindSchema.parse(r.kind),definition:r.definition})))
    await tx.surveyPublication.create({data:{
      id:publicationId,projectId:input.projectId,
      version:version+1,definitionDigest:digest,
      compiledSnapshot:JSON.parse(serial) as Prisma.InputJsonValue,
      consentVersion:wave.consentVersion,purpose:'RESEARCH_ONLY',
    }})
    if(quotaPolicy){
      await tx.surveyExperimentQuotaBucket.createMany({data:
        Object.entries(quotaPolicy.groupLimits).map(([groupKey,maxAssigned])=>({
          id:randomUUID(),projectId:input.projectId,waveId:input.waveId,
          groupKey,maxAssigned,assignedCount:0,
        })),
      })
    }
    const changed=await tx.surveyWave.updateMany({
      where:{id:input.waveId,projectId:input.projectId,status:'DRAFT',
        publicationId:null,revision:input.revision},
      data:{publicationId,revision:{increment:1},updatedAt:new Date()},
    })
    if(changed.count!==1)stop('波次已由其他会话冻结')
    const first=await tx.surveyProject.findUniqueOrThrow({where:{id:input.projectId}})
    if(!first.firstPublishedAt){
      await tx.surveyProject.update({
        where:{id:input.projectId},data:{firstPublishedAt:new Date(),revision:{increment:1}},
      })
    }
    await tx.surveyEvent.create({data:{
      id:randomUUID(),actorUserId:input.actorUserId,projectId:input.projectId,
      action:'WAVE_RESEARCH_DEFINITION_FROZEN',
      metadata:{waveId:input.waveId,publicationId,definitionDigest:digest,
        runtimeReady:true,sourceVersions:units.map(x=>[x.instrumentKey,x.draftRevision])},
    }})
    return {publicationId,version:version+1,digest,waveId:input.waveId,runtimeReady:true}
  })
}
