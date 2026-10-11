import { Prisma } from '@prisma/client'
import { prisma } from '../../config/database'
import { canonicalHash } from '../assessment-runtime/canonical'
import { decryptUnifiedRuntimePayload } from '../assessment-runtime/security'
import type { ResearchFrozenPublication, ResearchFrozenUnit } from './publication.service'
import type { SurveyComputedFinal, FrozenUnitResult, AnswerPrimitive } from './final.compute'
import type { FrozenScoreObservation, MissingReason } from './analytics.cohorts'
import type { FormDraft, ScaleDraft, SjtDraft } from './builder.definition'
import { SurveyAnalyticsError } from './analytics.read'

export interface ResearchRawCodebook {
  columnKey:string;waveId:string;waveOrdinal:number;instrumentKey:string;
  itemKey:string;kind:'FORM'|'SCALE'|'SJT';responseType:string;title:string;prompt:string;
  options:{code:string;label:string}[];
  definitionDigest:string;scoringDigest:string|null
  publicationVersion:number
  instrumentRevision:number
}
export interface ResearchRawObservation {
  projectId:string;waveId:string;waveOrdinal:number;attemptId:string;
  researchCode:string|null;sourceFinalHash:string;
  instrumentKey:string;kind:'FORM'|'SCALE'|'SJT';responseType:string;
  itemKey:string;columnKey:string;publicationVersion:number;value:string|number|null;
  missingReason:MissingReason|null;completedAt:string;sourceVerified:true
}
export interface SurveySourceProjection {
  projectId:string;collectionMode:'SINGLE_UNLINKED'|'LINKED_WAVES'
  completeAttempts:number
  cutOff:string
  scores:FrozenScoreObservation[]
  raw:ResearchRawObservation[]
  codebook:ResearchRawCodebook[]
  attendance:{researchCode:string;waveId:string;status:string}[]
}
const denied=():never=>{throw new SurveyAnalyticsError(404,'研究数据不可访问')}
const invalid=(message:string):never=>{throw new SurveyAnalyticsError(409,message)}
const cleanValue=(v:AnswerPrimitive):string|number|null=>{
  if(v===null||v===undefined)return null
  if(typeof v==='number'||typeof v==='string')return v
  if(Array.isArray(v))return JSON.stringify(v)
  if(typeof v==='object')return JSON.stringify(v)
  return invalid('研究答案包含不受支持的数据类型')
}
const missingFrom=(unit:FrozenUnitResult,key:string):MissingReason|null=>{
  const row=unit.missing.find(x=>x.itemKey===key)
  return row?.reason??null
}
const rawItems=(frozen:ResearchFrozenUnit,unit:FrozenUnitResult):Array<{
  itemKey:string;prompt:string;responseType:string;options:{code:string;label:string}[];value:string|number|null;missingReason:MissingReason|null
}>=>{
  const values=unit.rawAnswers
  const output:Array<{itemKey:string;prompt:string;responseType:string;options:{code:string;label:string}[];value:string|number|null;missingReason:MissingReason|null}>=[]
  const add=(key:string,prompt:string,responseType:string,options:{code:string;label:string}[])=>{
    const value=cleanValue(values[key]??null)
    output.push({itemKey:key,prompt,responseType,options,value,missingReason:missingFrom(unit,key)})
  }
  if(frozen.kind==='FORM'){
    const draft=frozen.displayDefinition as FormDraft
    for(const page of draft.pages)for(const q of page.questions){
      const options=q.options.map(o=>({code:o.optionKey,label:o.label}))
      if(q.type==='MATRIX'){
        const value=values[q.itemKey]
        const normalized=value&&typeof value==='object'&&!Array.isArray(value)?value as Record<string,string>:{}
        for(const row of q.rows){
          const key=q.itemKey+':'+row.rowKey
          output.push({itemKey:key,prompt:q.prompt+'／'+row.label,responseType:'MATRIX',options,
            value:normalized[row.rowKey]??null,missingReason:missingFrom(unit,key)||missingFrom(unit,q.itemKey)})
        }
      }else add(q.itemKey,q.prompt,q.type,options)
    }
  }else if(frozen.kind==='SCALE'){
    const draft=frozen.displayDefinition as ScaleDraft
    for(const q of draft.items)add(q.itemKey,q.prompt,'LIKERT',draft.responseOptions.map(o=>({code:o.optionKey,label:o.label})))
  }else {
    const draft=frozen.displayDefinition as SjtDraft
    for(const q of draft.questions)add(q.questionKey,q.prompt,'SJT_SINGLE',q.options.map(o=>({code:o.optionKey,label:o.label})))
  }
  return output
}
const scoresFrom=(frozen:ResearchFrozenUnit,unit:FrozenUnitResult,meta:{
  projectId:string;waveId:string;waveOrdinal:number;attemptId:string;researchCode:string|null;completedAt:string;sourceFinalHash:string
}):FrozenScoreObservation[]=>{
  const privateResult=unit.privateScoring as
    |{scores?:{key:string;value:number|null;status:string}[];metrics?:{key:string;value:number|null;status:string}[]}
    |null
  const records=privateResult?.scores||privateResult?.metrics||[]
  const values=records.filter(r=>typeof r.key==='string')
  return values.map(r=>({
    ...meta,
    sourceVerified:true,
    measurement:{
      instrumentKey:frozen.instrumentKey,scoreKey:r.key,
      scoringDigest:unit.scoringDigest||'',
      // Source signature is per instrument, not per whole composition: this
      // permits T1/T3 to reuse the exact same Scale with different Forms.
      responseSignature:frozen.sourceDigest,
      respondentType:frozen.kind==='SCALE'
        ?(frozen.displayDefinition as ScaleDraft).respondentType
        :frozen.kind==='SJT'
          ?(frozen.displayDefinition as SjtDraft).respondentType:'research_form',
      unit:null,
    },
    value:typeof r.value==='number'&&Number.isFinite(r.value)?r.value:null,
    missingReason:(typeof r.value==='number'&&Number.isFinite(r.value)?null:'SHOWN_MISSING') as MissingReason|null,
  }))
}
const codeKey=(waveOrdinal:number,instrumentKey:string,itemKey:string,hash:string)=>
  'W'+String(waveOrdinal).padStart(3,'0')+'__'
    +(instrumentKey.replace(/[^a-z0-9_]/gi,'_').slice(0,38))
    +'__'+(itemKey.replace(/[^a-z0-9_]/gi,'_').slice(0,38))
    +'__'+hash.slice(0,16)
/** A single transaction locks current User/Grant/Owner, reads exactly finalized
 * Survey records, verifies the encrypted FINAL hash, and projects minimum data.
 * No arbitrary project administrator inherits the raw-data grant.
 */
export async function loadSurveySource(input:{
  actorUserId:string;projectId:string;waveIds?:string[];maxFinals?:number
}):Promise<SurveySourceProjection>{
  const max=Math.min(500,Math.max(1,input.maxFinals??250))
  return prisma.$transaction(async tx=>{
    const [project]=await tx.$queryRaw<Array<{collectionMode:'SINGLE_UNLINKED'|'LINKED_WAVES';sourceCutOff:Date}>>`
      SELECT p.collection_mode AS "collectionMode", transaction_timestamp() AS "sourceCutOff"
      FROM "survey_projects" p
      JOIN "users" u ON u.id=p.owner_user_id
      JOIN "survey_researcher_grants" g ON g.user_id=u.id
      JOIN "survey_mfa_credentials" m ON m.user_id=u.id
      WHERE p.id=${input.projectId} AND p.owner_user_id=${input.actorUserId}
        AND u.account_domain='SURVEY' AND u.is_active AND NOT u.is_frozen
        AND (u.expires_at IS NULL OR u.expires_at>statement_timestamp())
        AND g.status='ACTIVE' AND m.enabled
      FOR SHARE OF p,u,g,m
    `
    if(!project)denied()
    if(input.waveIds?.length){
      const ownerWaves=await tx.surveyWave.count({where:{projectId:input.projectId,id:{in:input.waveIds}}})
      if(ownerWaves!==new Set(input.waveIds).size)denied()
    }
    const finals=await tx.surveyWaveFinal.findMany({
      where:{
        projectId:input.projectId,
        ...(input.waveIds?.length?{waveId:{in:input.waveIds}}:{}),
        attempt:{status:'COMPLETED',excludedAt:null},
      },
      orderBy:[{completedAt:'asc'},{id:'asc'}],
      take:max+1,
      include:{attempt:{include:{participant:true}},wave:true,publication:true},
    })
    if(finals.length>max)
      throw new SurveyAnalyticsError(413,'此范围超过交互式数据上限，请缩小波次或使用后续流式导出')
    // A linked participant may have STARTED but not FINAL at T2. Preserve
    // that distinction from NO_WAVE without decrypting incomplete answers.
    const attendanceRows=await tx.surveyWaveAttempt.findMany({
      where:{
        projectId:input.projectId,
        ...(input.waveIds?.length?{waveId:{in:input.waveIds}}:{}),
        participantId:{not:null},
      },
      select:{waveId:true,status:true,excludedAt:true,
        participant:{select:{researchCode:true,status:true}}},
      take:5001,
    })
    if(attendanceRows.length>5000)
      throw new SurveyAnalyticsError(413,'研究进度数据超出单次读取上限，请缩小波次范围')
    const attendance=attendanceRows.filter(row=>
      row.participant?.status!=='WITHDRAWN'&&row.excludedAt===null)
      .map(row=>({researchCode:row.participant!.researchCode,waveId:row.waveId,status:row.status}))
    const codebook=new Map<string,ResearchRawCodebook>()
    const scores:FrozenScoreObservation[]=[],raw:ResearchRawObservation[]=[]
    for(const final of finals){
      const wave=final.wave,attempt=final.attempt,publication=final.publication
      if(wave.projectId!==input.projectId||attempt.projectId!==input.projectId
        ||attempt.waveId!==wave.id||wave.publicationId!==publication.id
        ||publication.projectId!==input.projectId||final.definitionDigest!==publication.definitionDigest)
        invalid('研究 FINAL 的项目、波次或发布来源不一致')
      if(attempt.participant?.status==='WITHDRAWN')continue
      const snapshot=publication.compiledSnapshot as unknown as ResearchFrozenPublication
      if(canonicalHash(JSON.parse(JSON.stringify(snapshot)))!==final.definitionDigest)
        invalid('冻结研究发布定义摘要不匹配')
      const result=decryptUnifiedRuntimePayload<SurveyComputedFinal>(final.resultsCipher)
      if(result.schemaVersion!==1||result.definitionDigest!==final.definitionDigest
        ||canonicalHash(JSON.parse(JSON.stringify(result)))!==final.resultsHash)
        invalid('研究 FINAL 加密内容或摘要无法验证')
      if(result.units.length!==snapshot.units.length)invalid('研究 FINAL 子任务数与冻结定义不一致')
      const meta={
        projectId:input.projectId,waveId:wave.id,waveOrdinal:wave.ordinal,
        attemptId:attempt.id,researchCode:attempt.participant?.researchCode??null,
        completedAt:final.completedAt.toISOString(),sourceFinalHash:final.resultsHash,
      }
      for(let i=0;i<snapshot.units.length;i++){
        const frozen=snapshot.units[i],unit=result.units[i]
        if(!unit||unit.instrumentKey!==frozen.instrumentKey||unit.kind!==frozen.kind
          ||unit.sourceDigest!==frozen.sourceDigest||unit.scoringDigest!==frozen.scoringDigest)
          invalid('研究 FINAL 组件来源与冻结定义不一致')
        scores.push(...scoresFrom(frozen,unit,meta))
        for(const r of rawItems(frozen,unit)){
          const columnKey=codeKey(wave.ordinal,frozen.instrumentKey,r.itemKey,frozen.sourceDigest)
          raw.push({...meta,sourceVerified:true,kind:frozen.kind,
            instrumentKey:frozen.instrumentKey,itemKey:r.itemKey,columnKey,responseType:r.responseType,
            publicationVersion:publication.version,
            value:r.value,missingReason:r.missingReason})
          if(!codebook.has(columnKey))
            codebook.set(columnKey,{columnKey,waveId:wave.id,waveOrdinal:wave.ordinal,
              instrumentKey:frozen.instrumentKey,itemKey:r.itemKey,kind:frozen.kind,
              responseType:r.responseType,
              title:frozen.title,prompt:r.prompt,options:r.options,
              definitionDigest:frozen.sourceDigest,scoringDigest:frozen.scoringDigest,
              publicationVersion:publication.version,
              instrumentRevision:frozen.draftRevision})
        }
      }
    }
    return {projectId:input.projectId,collectionMode:project.collectionMode,
      completeAttempts:new Set(scores.map(s=>s.attemptId).concat(raw.map(r=>r.attemptId))).size,
      cutOff:project.sourceCutOff.toISOString(),
      scores,raw,codebook:[...codebook.values()],attendance}
  },{isolationLevel:Prisma.TransactionIsolationLevel.RepeatableRead})
}
