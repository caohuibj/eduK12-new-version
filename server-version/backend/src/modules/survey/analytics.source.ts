import { Prisma } from '@prisma/client'
import { prisma } from '../../config/database'
import { canonicalHash } from '../assessment-runtime/canonical'
import { decryptUnifiedRuntimePayload } from '../assessment-runtime/security'
import type { ResearchFrozenPublication, ResearchFrozenUnit } from './publication.service'
import type { SurveyComputedFinal, FrozenUnitResult, AnswerPrimitive } from './final.compute'
import type { FrozenScoreObservation, MissingReason } from './analytics.cohorts'
import type { FormDraft, ScaleDraft, SjtDraft } from './builder.definition'
import type { ScaleDefinitionV2 } from '../scale/scale-definition'
import type { SituationDefinitionV2 } from '../situational/situation-branching'
import { SurveyAnalyticsError } from './analytics.read'

export interface ResearchRawCodebook {
  columnKey:string;waveId:string;waveOrdinal:number;instrumentKey:string;
  itemKey:string;kind:'FORM'|'SCALE'|'SJT';responseType:string;title:string;prompt:string;
  options:{code:string;label:string}[];
  definitionDigest:string;scoringDigest:string|null
  publicationVersion:number
  instrumentRevision:number
  timeZone?:'Asia/Shanghai'|'UTC'
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
  sourceRevision:number
  cutOff:string
  /** Only set on explicitly paged reads; no silent truncation on legacy reads. */
  nextFinalCursor?:{id:string;completedAt:string}|null
  /** Whole filtered cohort count, pinned for cross-request paging consistency. */
  sourceFinalCount?:number|null
  scores:FrozenScoreObservation[]
  /** Wave-specific columns derived from immutable Publications, even with zero FINALs. */
  scoreColumns:Pick<FrozenScoreObservation,'projectId'|'waveId'|'waveOrdinal'|'measurement'>[]
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
  itemKey:string;prompt:string;responseType:string;options:{code:string;label:string}[];value:string|number|null;missingReason:MissingReason|null;
  timeZone?:'Asia/Shanghai'|'UTC'
}>=>{
  const values=unit.rawAnswers
  const output:Array<{itemKey:string;prompt:string;responseType:string;options:{code:string;label:string}[];value:string|number|null;missingReason:MissingReason|null;timeZone?:'Asia/Shanghai'|'UTC'}>=[]
  const add=(key:string,prompt:string,responseType:string,options:{code:string;label:string}[],timeZone?:'Asia/Shanghai'|'UTC')=>{
    const value=cleanValue(values[key]??null)
    output.push({itemKey:key,prompt,responseType,options,value,missingReason:missingFrom(unit,key),timeZone})
  }
  if(frozen.kind==='FORM'){
    const draft=frozen.displayDefinition as FormDraft
    for(const page of draft.pages)for(const q of page.questions){
      const options=q.options.map(o=>({code:o.optionKey,label:o.label}))
      if(q.type==='MATRIX'||q.type==='MATRIX_MULTIPLE'){
        const value=values[q.itemKey]
        const normalized=value&&typeof value==='object'&&!Array.isArray(value)
          ?value as Record<string,string|string[]>:{}
        for(const row of q.rows){
          const key=q.itemKey+':'+row.rowKey
          output.push({itemKey:key,prompt:q.prompt+'／'+row.label,responseType:q.type,options,
            value:cleanValue(normalized[row.rowKey]??null),
            missingReason:missingFrom(unit,key)||missingFrom(unit,q.itemKey)})
        }
      }else add(q.itemKey,q.prompt,q.type,options,q.timeZone)
    }
  }else if(frozen.kind==='SCALE'){
    const draft=frozen.displayDefinition as ScaleDraft
    for(const q of draft.items)add(q.itemKey,q.prompt,'LIKERT',draft.responseOptions.map(o=>({code:o.optionKey,label:o.label})))
  }else {
    const draft=frozen.displayDefinition as SjtDraft
    for(const q of draft.questions)add(q.questionKey,q.prompt,q.responseType==='MULTIPLE'?'SJT_MULTIPLE':'SJT_SINGLE',q.options.map(o=>({code:o.optionKey,label:o.label})))
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
/** The authoritative score variable list is part of the frozen scorer, not
 * inferred from whichever participants happened to finish a Wave.
 */
function frozenScoreColumns(projectId:string,waveId:string,ordinal:number,frozen:ResearchFrozenUnit):
  SurveySourceProjection['scoreColumns'] {
  const keys=frozen.kind==='SCALE'
    ?(frozen.compiledDefinition as ScaleDefinitionV2).scoring.scores.map(score=>score.key)
    :frozen.kind==='SJT'
      ?(frozen.compiledDefinition as SituationDefinitionV2).scoring.publishedMetrics.map(metric=>metric.key)
      :[]
  return keys.map(scoreKey=>({
    projectId,waveId,waveOrdinal:ordinal,
    measurement:{
      instrumentKey:frozen.instrumentKey,scoreKey,scoringDigest:frozen.scoringDigest||'',
      responseSignature:frozen.sourceDigest,
      respondentType:frozen.kind==='SCALE'
        ?(frozen.displayDefinition as ScaleDraft).respondentType
        :(frozen.displayDefinition as SjtDraft).respondentType,
      unit:null,
    },
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
  actorUserId:string;projectId:string;waveIds?:string[];maxFinals?:number;
  /** Only Wide exports need the schema of Waves with no completed FINAL. */
  includeWideSchema?:boolean
  /** Half-open FINAL completion-time slice for bounded per-wave exports. */
  completedFrom?:Date;completedBefore?:Date
  pageMode?:boolean
  /** Paired score aggregation does not need longitudinal attendance matrices. */
  includeAttendance?:boolean
  afterFinal?:{id:string;completedAt:Date}
  snapshotCutOff?:Date
  expectedSourceRevision?:number
  expectedFinalCount?:number
}):Promise<SurveySourceProjection>{
  const max=Math.min(500,Math.max(1,input.maxFinals??250))
  return prisma.$transaction(async tx=>{
    const [project]=await tx.$queryRaw<Array<{collectionMode:'SINGLE_UNLINKED'|'LINKED_WAVES';sourceCutOff:Date;sourceRevision:number}>>`
      SELECT p.collection_mode AS "collectionMode", p.revision AS "sourceRevision",
        transaction_timestamp() AS "sourceCutOff"
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
    if(input.expectedSourceRevision!==undefined
       &&project.sourceRevision!==input.expectedSourceRevision)
      throw new SurveyAnalyticsError(409,'研究样本或项目版本在分批分析期间变化，请重新开始')
    if(input.waveIds?.length){
      const ownerWaves=await tx.surveyWave.count({where:{projectId:input.projectId,id:{in:input.waveIds}}})
      if(ownerWaves!==new Set(input.waveIds).size)denied()
    }
    // Stage 1: select only small identifiers; never deserialize full encrypted
    // FINALs and large Publication JSON before applying the memory budget.
    const cutOff=input.snapshotCutOff||project.sourceCutOff
    if(!Number.isFinite(cutOff.getTime()))throw new SurveyAnalyticsError(400,'分页时间水位非法')
    const sourceWhere:Prisma.SurveyWaveFinalWhereInput={
      projectId:input.projectId,
      ...(input.waveIds?.length?{waveId:{in:input.waveIds}}:{}),
      completedAt:{
        ...(input.completedFrom?{gte:input.completedFrom}:{}),
        lt:input.completedBefore&&input.completedBefore<cutOff
          ?input.completedBefore:cutOff,
      },
      attempt:{status:'COMPLETED',excludedAt:null,
        OR:[{sampleReview:{is:null}},{sampleReview:{is:{verdict:'INCLUDED'}}}]},
    }
    // Cross-request RepeatableRead alone is not one database snapshot:
    // a transaction started before cutOff could commit after page one. Fence
    // that drift with an exact count over the whole bounded cohort.
    const sourceFinalCount=input.pageMode
      ?await tx.surveyWaveFinal.count({where:sourceWhere}):null
    if(input.expectedFinalCount!==undefined
      &&sourceFinalCount!==input.expectedFinalCount)
      throw new SurveyAnalyticsError(409,'分批期间 FINAL 样本数量已变化，请重新开始完整导出')
    const finalWhere:Prisma.SurveyWaveFinalWhereInput={
      ...sourceWhere,
      ...(input.afterFinal?{AND:[{OR:[
        {completedAt:{gt:input.afterFinal.completedAt}},
        {completedAt:input.afterFinal.completedAt,id:{gt:input.afterFinal.id}},
      ]}]}:{}),
    }
    const headers=await tx.surveyWaveFinal.findMany({
      where:finalWhere,select:{id:true,publicationId:true,completedAt:true},
      orderBy:[{completedAt:'asc'},{id:'asc'}],take:max+1,
    })
    if(headers.length>max&&!input.pageMode)
      throw new SurveyAnalyticsError(413,'此范围超过交互式数据上限，请缩小波次')
    const selectedHeaders=input.pageMode?headers.slice(0,max):headers
    const last=selectedHeaders.at(-1)
    const nextFinalCursor=input.pageMode&&headers.length>max&&last
      ?{id:last.id,completedAt:last.completedAt.toISOString()}:null
    const ids=selectedHeaders.map(row=>row.id)
    // A Wave may have STARTED attempts but no FINAL. Only Wide exports need
    // its frozen schema to distinguish ABANDONED from NO_WAVE.
    const frozenWaves=input.includeWideSchema?await tx.surveyWave.findMany({
      where:{projectId:input.projectId,
        ...(input.waveIds?.length?{id:{in:input.waveIds}}:{}),
        // A prepared DRAFT is not a collected Wave; do not label future
        // unreleased instruments as participant NO_WAVE / attrition.
        status:{in:['OPEN','PAUSED','CLOSED']},
        publicationId:{not:null}},
      select:{id:true,ordinal:true,publicationId:true},
      orderBy:{ordinal:'asc'},take:101,
    }):[]
    if(frozenWaves.length>100)
      throw new SurveyAnalyticsError(413,'本次宽表波次数量超出安全上限')
    const publicationIds=[...new Set([
      ...selectedHeaders.map(row=>row.publicationId),
      ...frozenWaves.flatMap(w=>w.publicationId?[w.publicationId]:[]),
    ])]
    // Both byte budgets apply before loading any potentially large JSON or
    // encrypted FINAL. The Publication budget counts each frozen id once.
    if(ids.length||publicationIds.length){
      const cipherBytes=ids.length?(await tx.$queryRaw<Array<{bytes:bigint}>>`
        SELECT COALESCE(SUM(octet_length(results_cipher)),0)::bigint AS "bytes"
        FROM survey_wave_finals WHERE id IN (${Prisma.join(ids)})
      `)[0]?.bytes??0n:0n
      const frozenBytes=publicationIds.length?(await tx.$queryRaw<Array<{bytes:bigint}>>`
        SELECT COALESCE(SUM(octet_length(compiled_snapshot::text)),0)::bigint AS "bytes"
        FROM survey_publications WHERE id IN (${Prisma.join(publicationIds)})
      `)[0]?.bytes??0n:0n
      if(cipherBytes>BigInt(8*1024*1024)||frozenBytes>BigInt(8*1024*1024))
        throw new SurveyAnalyticsError(413,'冻结材料与加密答案超过单次内存预算，请缩小波次')
    }
    // Stage 2: fetch bounded bytes, and load each frozen Publication only
    // once regardless of how many participant FINALs reference it.
    const finals=ids.length?await tx.surveyWaveFinal.findMany({
      where:{id:{in:ids}},orderBy:[{completedAt:'asc'},{id:'asc'}],
      include:{attempt:{include:{participant:true}},wave:true},
    }):[]
    const publications=publicationIds.length?await tx.surveyPublication.findMany({
      where:{id:{in:publicationIds}},
    }):[]
    const publicationById=new Map(publications.map(row=>[row.id,row]))
    // Validate each immutable Publication once per RepeatableRead snapshot.
    // Never reserialize its entire frozen JSON for every participant FINAL.
    const verifiedSnapshots=new Map<string,ResearchFrozenPublication>()
    for(const publication of publications){
      const snapshot=publication.compiledSnapshot as unknown as ResearchFrozenPublication
      if(publication.projectId!==input.projectId
        ||snapshot.schemaVersion!==1||snapshot.purpose!=='RESEARCH_ONLY'
        ||snapshot.projectId!==input.projectId||snapshot.runtimeStatus!=='SURVEY_FINAL_V1'
        ||!Array.isArray(snapshot.units)||!snapshot.units.length
        ||canonicalHash(JSON.parse(JSON.stringify(snapshot)))!==publication.definitionDigest)
        invalid('冻结研究发布定义摘要不匹配')
      verifiedSnapshots.set(publication.id,snapshot)
    }
    // A linked participant may have STARTED but not FINAL at T2. Preserve
    // that distinction from NO_WAVE without decrypting incomplete answers.
    const attendanceRows=input.includeAttendance===false?[]:await tx.surveyWaveAttempt.findMany({
      where:{
        projectId:input.projectId,
        ...(input.waveIds?.length?{waveId:{in:input.waveIds}}:{}),
        participantId:{not:null},
      },
      select:{waveId:true,status:true,excludedAt:true,
        sampleReview:{select:{verdict:true}},
        participant:{select:{researchCode:true,status:true}}},
      take:5001,
    })
    if(attendanceRows.length>5000)
      throw new SurveyAnalyticsError(413,'研究进度数据超出单次读取上限，请缩小波次范围')
    const attendance=attendanceRows.filter(row=>
      row.participant?.status!=='WITHDRAWN'&&row.excludedAt===null)
      .map(row=>({researchCode:row.participant!.researchCode,waveId:row.waveId,status:row.sampleReview?.verdict==='EXCLUDED'?'QUALITY_EXCLUDED':row.status}))
    // Row projection remains bounded independently from the ciphertext budget.
    const codebook=new Map<string,ResearchRawCodebook>()
    const scoreColumns:SurveySourceProjection['scoreColumns']=[]
    const scores:FrozenScoreObservation[]=[],raw:ResearchRawObservation[]=[]
    // Build expected variables from every selected frozen Wave, not only
    // the sample that completed FINAL. This also covers entire empty Waves.
    for(const wave of frozenWaves){
      const publication=publicationById.get(wave.publicationId!)
      if(!publication)throw new SurveyAnalyticsError(409,'冻结波次来源缺失')
      const snapshot=verifiedSnapshots.get(publication.id)
      if(!snapshot||snapshot.waveId!==wave.id)
        throw new SurveyAnalyticsError(409,'冻结波次定义摘要缺失')
      for(const frozen of snapshot.units){
        const empty:FrozenUnitResult={
          instrumentKey:frozen.instrumentKey,kind:frozen.kind,
          sourceDigest:frozen.sourceDigest,scoringDigest:frozen.scoringDigest,
          rawAnswers:{},missing:[],privateScoring:null,
        }
        for(const item of rawItems(frozen,empty)){
          const columnKey=codeKey(wave.ordinal,frozen.instrumentKey,item.itemKey,frozen.sourceDigest)
          if(codebook.has(columnKey))invalid('冻结研究变量编码重复')
          codebook.set(columnKey,{
            columnKey,waveId:wave.id,waveOrdinal:wave.ordinal,
            instrumentKey:frozen.instrumentKey,itemKey:item.itemKey,kind:frozen.kind,
            responseType:item.responseType,title:frozen.title,prompt:item.prompt,options:item.options,
            definitionDigest:frozen.sourceDigest,scoringDigest:frozen.scoringDigest,
            publicationVersion:publication.version,instrumentRevision:frozen.draftRevision,
            ...(item.timeZone?{timeZone:item.timeZone}:{}),
          })
        }
        scoreColumns.push(...frozenScoreColumns(input.projectId,wave.id,wave.ordinal,frozen))
      }
    }
    for(const final of finals){
      const wave=final.wave,attempt=final.attempt
      const publication=publicationById.get(final.publicationId)
      if(!publication)throw new SurveyAnalyticsError(409,'研究 FINAL 的不可变发布来源缺失')
      if(wave.projectId!==input.projectId||attempt.projectId!==input.projectId
        ||attempt.waveId!==wave.id||wave.publicationId!==publication.id
        ||publication.projectId!==input.projectId||final.definitionDigest!==publication.definitionDigest)
        invalid('研究 FINAL 的项目、波次或发布来源不一致')
      if(attempt.participant?.status==='WITHDRAWN')continue
      const snapshot=verifiedSnapshots.get(publication.id)
      if(!snapshot||snapshot.waveId!==wave.id)
        throw new SurveyAnalyticsError(409,'研究 FINAL 的冻结发布来源不一致')
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
          if(raw.length>=25000)
            throw new SurveyAnalyticsError(413,'逐题投影超过 25000 行上限，请缩小波次范围')
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
      sourceRevision:project.sourceRevision,completeAttempts:new Set(scores.map(s=>s.attemptId).concat(raw.map(r=>r.attemptId))).size,
      cutOff:cutOff.toISOString(),nextFinalCursor,sourceFinalCount,
      scores,scoreColumns,raw,codebook:[...codebook.values()],attendance}
  },{isolationLevel:Prisma.TransactionIsolationLevel.RepeatableRead})
}
