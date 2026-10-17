import { Prisma } from '@prisma/client'
import { prisma } from '../../config/database'
import { canonicalHash } from '../assessment-runtime/canonical'
import { decryptUnifiedRuntimePayload } from '../assessment-runtime/security'
import type { ResearchFrozenPublication, ResearchFrozenUnit } from './publication.service'
import type { SurveyComputedFinal, FrozenUnitResult, AnswerPrimitive } from './final.compute'
import type { SurveyFlowAssignment } from './flow.assignment'
import type { FrozenScoreObservation, MissingReason } from './analytics.cohorts'
import type { FormDraft, ScaleDraft, SjtDraft } from './builder.definition'
import type { ScaleDefinitionV2 } from '../scale/scale-definition'
import type { SituationDefinitionV2 } from '../situational/situation-branching'
import { SurveyAnalyticsError } from './analytics.read'
import {validateSurveyScaleTimings,SurveyScaleTimingError,
  type SurveyScaleItemTimingV1} from './timing.definition'

export interface ResearchRawCodebook {
  columnKey:string;waveId:string;waveOrdinal:number;instrumentKey:string;
  itemKey:string;kind:'FORM'|'SCALE'|'SJT';responseType:string;title:string;prompt:string;
  options:{code:string;label:string}[];
  definitionDigest:string;scoringDigest:string|null
  publicationVersion:number
  instrumentRevision:number
  timeZone?:'Asia/Shanghai'|'UTC'
  valueEncoding?:'TEXT'|'NUMBER'|'JSON_STRING_ARRAY'|'JSON_NUMBER_OBJECT'
  formSchemaVersion?:1|2
  flowDigest?:string
  scalePresentationMode?:'ONE_BY_ONE'|'ALL_AT_ONCE'
  timingContract?:'SURVEY_SCALE_ITEM_TIMING_V1'|'NOT_COLLECTED'
}
export interface ResearchRawObservation {
  projectId:string;waveId:string;waveOrdinal:number;attemptId:string;
  researchCode:string|null;sourceFinalHash:string;
  instrumentKey:string;kind:'FORM'|'SCALE'|'SJT';responseType:string;
  itemKey:string;columnKey:string;publicationVersion:number;value:string|number|null;
  missingReason:MissingReason|null;completedAt:string;sourceVerified:true
  attemptStartedAt?:string
  itemTiming?:SurveyScaleItemTimingV1
  flowDigest?:string|null;experimentGroup?:string|null;
  shownBlocks?:string|null;flowTermination?:string|null
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
  /** Only single-wave v3 exports enumerate non-final participation separately. */
  nextAttendanceCursor?:string|null
  sourceAttendanceCount?:number|null
  scores:FrozenScoreObservation[]
  /** Wave-specific columns derived from immutable Publications, even with zero FINALs. */
  scoreColumns:Pick<FrozenScoreObservation,'projectId'|'waveId'|'waveOrdinal'|'measurement'>[]
  raw:ResearchRawObservation[]
  codebook:ResearchRawCodebook[]
  attendance:{researchCode:string;waveId:string;status:string}[]
}
function denied():never{throw new SurveyAnalyticsError(404,'研究数据不可访问')}
function invalid(message:string):never{throw new SurveyAnalyticsError(409,message)}
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
const answerValueEncoding=(type:string):NonNullable<ResearchRawCodebook['valueEncoding']>=>
  type==='RANK_ORDER'||type==='MULTIPLE'||type==='MATRIX_MULTIPLE'||type==='SJT_MULTIPLE'
    ?'JSON_STRING_ARRAY':type==='CONSTANT_SUM'?'JSON_NUMBER_OBJECT':
    type==='SLIDER'||type==='NUMBER'?'NUMBER':'TEXT'
const rawItems=(frozen:ResearchFrozenUnit,unit:FrozenUnitResult,onlyItemKey?:string):Array<{
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
      if(onlyItemKey&&q.itemKey!==onlyItemKey
        &&!(q.otherOptionKey&&q.itemKey+':other'===onlyItemKey)
        &&!((q.type==='MATRIX'||q.type==='MATRIX_MULTIPLE')
          &&q.rows.some(row=>q.itemKey+':'+row.rowKey===onlyItemKey)))continue
      const options=q.options.map(o=>({code:o.optionKey,label:o.label}))
      if(q.type==='MATRIX'||q.type==='MATRIX_MULTIPLE'){
        const value=values[q.itemKey]
        const normalized=value&&typeof value==='object'&&!Array.isArray(value)
          ?value as Record<string,string|string[]>:{}
        for(const row of q.rows){
          const key=q.itemKey+':'+row.rowKey
          if(onlyItemKey&&key!==onlyItemKey)continue
          output.push({itemKey:key,prompt:q.prompt+'／'+row.label,responseType:q.type,options,
            value:cleanValue(normalized[row.rowKey]??null),
            missingReason:missingFrom(unit,key)||missingFrom(unit,q.itemKey)})
        }
      }else{
        if(!onlyItemKey||onlyItemKey===q.itemKey)
          add(q.itemKey,q.prompt,q.type,options,q.timeZone)
        if(q.otherOptionKey&&(!onlyItemKey||onlyItemKey===q.itemKey+':other'))
          add(q.itemKey+':other',q.prompt+'／其他填写','OTHER_TEXT',[])
      }
    }
  }else if(frozen.kind==='SCALE'){
    const draft=frozen.displayDefinition as ScaleDraft
    for(const q of draft.items)if(!onlyItemKey||q.itemKey===onlyItemKey)
      add(q.itemKey,q.prompt,'LIKERT',draft.responseOptions.map(o=>({code:o.optionKey,label:o.label})))
  }else {
    const draft=frozen.displayDefinition as SjtDraft
    for(const q of draft.questions)if(!onlyItemKey||q.questionKey===onlyItemKey)
      add(q.questionKey,q.prompt,q.responseType==='MULTIPLE'?'SJT_MULTIPLE':'SJT_SINGLE',q.options.map(o=>({code:o.optionKey,label:o.label})))
  }
  return output
}
const scoresFrom=(frozen:ResearchFrozenUnit,unit:FrozenUnitResult,meta:{
  projectId:string;waveId:string;waveOrdinal:number;attemptId:string;researchCode:string|null;completedAt:string;sourceFinalHash:string
}):FrozenScoreObservation[]=>{
  if(unit.notExecuted)return frozenScoreColumns(meta.projectId,meta.waveId,meta.waveOrdinal,frozen)
    .map(column=>({...meta,sourceVerified:true,measurement:column.measurement,
      value:null,missingReason:'NOT_SHOWN' as MissingReason}))
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
/** Preserve existing noncolliding IDs, but resolve lossy normalization/truncation
 * against the entire frozen publication, never the selected item or FINAL page.
 * Identical definitions can also collide across differently named instruments.
 * Uppercase K separates generated suffixes from the lowercase legacy key space.
 */
const frozenRawColumnKeys=(snapshot:ResearchFrozenPublication,waveOrdinal:number)=>{
  const candidates:Array<{unit:ResearchFrozenUnit;itemKey:string;legacy:string}>=[]
  const counts=new Map<string,number>()
  const result=new Map<ResearchFrozenUnit,Map<string,string>>()
  for(const unit of snapshot.units){
    const empty:FrozenUnitResult={instrumentKey:unit.instrumentKey,kind:unit.kind,
      sourceDigest:unit.sourceDigest,scoringDigest:unit.scoringDigest,
      rawAnswers:{},missing:[],privateScoring:null}
    result.set(unit,new Map())
    for(const item of rawItems(unit,empty)){
      const legacy=codeKey(waveOrdinal,unit.instrumentKey,item.itemKey,unit.sourceDigest)
      candidates.push({unit,itemKey:item.itemKey,legacy})
      counts.set(legacy,(counts.get(legacy)??0)+1)
    }
  }
  const used=new Set<string>()
  for(const {unit,itemKey,legacy} of candidates){
    const column=counts.get(legacy)===1?legacy:
      legacy+'__K'+canonicalHash([unit.instrumentKey,itemKey]).slice(0,16)
    const items=result.get(unit)!
    if(used.has(column)||items.has(itemKey))invalid('冻结研究变量编码重复')
    used.add(column);items.set(itemKey,column)
  }
  return result
}
/** Bounded transactions read authorized immutable material and recheck its
 * complete version after hash/decryption/projection outside business locks.
 * No arbitrary project administrator inherits the raw-data grant.
 */
/** Exclusive safe upper bound after PostgreSQL microseconds round-trip through JS Date. */
export function surveyExclusiveSnapshotCutOff(timestamp:Date):Date {
  return new Date(timestamp.getTime()+1)
}
type SurveySourceInput = {
  actorUserId:string;projectId:string;waveIds?:string[];maxFinals?:number;
  /** Only Wide exports need the schema of Waves with no completed FINAL. */
  includeWideSchema?:boolean
  /** Half-open FINAL completion-time slice for bounded per-wave exports. */
  completedFrom?:Date;completedBefore?:Date
  pageMode?:boolean
  /** Internal analytics only: paginate by unique ID to avoid Timestamptz(6)
   * precision loss when final timestamps pass through JavaScript Date(3).
   * Signed PR2 export cursors intentionally retain their legacy ordering. */
  stableIdCursor?:boolean
  /** Only internal paged analyses: project exactly the selected variable from
   * each verified FINAL, instead of rejecting an otherwise valid high-item
   * study against the 25k intermediate-row cap. No public raw API shortcut. */
  selectRaw?:false|{instrumentKey:string;itemKey:string}
  selectScore?:false|{instrumentKey:string;scoreKey:string}
  /** Paired score aggregation does not need longitudinal attendance matrices. */
  includeAttendance?:boolean
  afterFinal?:{id:string;completedAt:Date}
  snapshotCutOff?:Date
  expectedSourceRevision?:number
  expectedFinalCount?:number
  /** V3 export separates valid FINALs from non-final attendance rows. */
  attendanceOnly?:boolean
  includeAttendanceCount?:boolean
  attendanceAfterId?:string
  expectedAttendanceCount?:number
}

export async function loadSurveySource(input: SurveySourceInput): Promise<SurveySourceProjection> {
  const first = await readSurveySourceMaterial(input)
  const signature = first.signature()
  const result = await first.compute()
  // Authorization, revision, exact FINALs, attendance and frozen publications
  // are read again after computation. No old grant or snapshot is a release.
  const current = await readSurveySourceMaterial({ ...input, snapshotCutOff: new Date(result.cutOff),
    expectedSourceRevision: result.sourceRevision,
    ...(input.pageMode ? { expectedFinalCount: result.sourceFinalCount ?? undefined } : {}),
  })
  if (signature !== current.signature()) throw new SurveyAnalyticsError(409, '研究来源在计算期间变化，请重新开始')
  return result
}

async function readSurveySourceMaterial(input: SurveySourceInput) {

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
    // PostgreSQL timestamptz(6) carries microseconds, but Prisma's JS Date
    // retains only whole milliseconds. Round the transaction timestamp UP to
    // the following millisecond for the exclusive cutoff; otherwise a valid
    // FINAL committed earlier in this same millisecond can disappear.
    // RepeatableRead still pins the first-page snapshot, and the existing
    // exact count/revision guards detect later cross-request commits.
    const cutOff=input.snapshotCutOff??surveyExclusiveSnapshotCutOff(project.sourceCutOff)
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
      ...(input.afterFinal?input.stableIdCursor
        ?{id:{gt:input.afterFinal.id}}
        :{AND:[{OR:[
          {completedAt:{gt:input.afterFinal.completedAt}},
          {completedAt:input.afterFinal.completedAt,id:{gt:input.afterFinal.id}},
        ]}]}:{}),
    }
    const headers=input.attendanceOnly?[]:await tx.surveyWaveFinal.findMany({
      where:finalWhere,select:{id:true,publicationId:true,completedAt:true},
      orderBy:input.stableIdCursor
        ?[{id:'asc' as const}]
        :[{completedAt:'asc' as const},{id:'asc' as const}],
      take:max+1,
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
      where:{id:{in:publicationIds}}, orderBy: { id: 'asc' },
    }):[]
    const publicationById=new Map(publications.map(row=>[row.id,row]))
    // A linked participant may have STARTED but not FINAL at T2. Preserve
    // that distinction from NO_WAVE without decrypting incomplete answers.
    const attendanceRows=input.includeAttendance===false||input.attendanceOnly?[]:await tx.surveyWaveAttempt.findMany({
      where:{
        projectId:input.projectId,
        ...(input.waveIds?.length?{waveId:{in:input.waveIds}}:{}),
        participantId:{not:null},
      },
      select:{waveId:true,status:true,excludedAt:true,
        sampleReview:{select:{verdict:true}},
        participant:{select:{researchCode:true,status:true}}},
      orderBy: { id: 'asc' }, take:5001,
    })
    let attendanceSlice: Array<{ id: string; waveId: string; status: string; sampleReview: { verdict: string } | null; participant: { researchCode: string } | null }> = []
    let sourceAttendanceCount:number|null=null
    if(input.includeAttendanceCount||input.attendanceOnly){
      if(!input.pageMode||input.waveIds?.length!==1||
          (!input.attendanceOnly&&!input.includeWideSchema))
        throw new SurveyAnalyticsError(400,'参与状态游标只允许已冻结的单波次分页数据')
      // Only incomplete / quality-excluded linked attempts need synthetic Long
      // rows. COMPLETED included FINALs are already emitted by the FINAL pass.
      // Pin the candidate set to the first page's exclusive time watermark.
      const candidates:Prisma.SurveyWaveAttemptWhereInput={
        projectId:input.projectId,waveId:input.waveIds![0],
        participantId:{not:null},excludedAt:null,startedAt:{lt:cutOff},
        participant:{is:{status:{not:'WITHDRAWN'}}},
        OR:[{status:{not:'COMPLETED'}},
          {sampleReview:{is:{verdict:'EXCLUDED'}}}],
      }
      sourceAttendanceCount=await tx.surveyWaveAttempt.count({where:candidates})
      if(sourceAttendanceCount>25000)
        throw new SurveyAnalyticsError(413,'单波次非 FINAL 参与记录超过 25000 条分页预算')
      if(input.expectedAttendanceCount!==undefined&&
        input.expectedAttendanceCount!==sourceAttendanceCount)
        throw new SurveyAnalyticsError(409,'分批期间未完成参与样本数量已变化，请重新开始')
      if(input.attendanceOnly){
        // Bound synthetic rows to ~6000 item/score cells per response page.
        // Never materialize the whole participant matrix in memory.
        attendanceSlice=await tx.surveyWaveAttempt.findMany({
          where:{...candidates,...(input.attendanceAfterId
            ?{id:{gt:input.attendanceAfterId}}:{})},
          orderBy:{id:'asc'},take:251,
          select:{id:true,waveId:true,status:true,
            sampleReview:{select:{verdict:true}},
            participant:{select:{researchCode:true}}},
        })
      }
    }
    return {
      signature: () => canonicalHash(JSON.parse(JSON.stringify({ project: { collectionMode: project.collectionMode, sourceRevision: project.sourceRevision },
        cutOff: cutOff.toISOString(), headers: selectedHeaders, frozenWaves,
        finals: finals.map(final => ({ id: final.id, completedAt: final.completedAt, publicationId: final.publicationId,
          definitionDigest: final.definitionDigest, resultsHash: final.resultsHash, resultsCipher: final.resultsCipher,
          wave: { id: final.wave.id, projectId: final.wave.projectId, ordinal: final.wave.ordinal, publicationId: final.wave.publicationId },
          attempt: { id: final.attempt.id, projectId: final.attempt.projectId, waveId: final.attempt.waveId,
            startedAt: final.attempt.startedAt, flowAssignmentCipher: final.attempt.flowAssignmentCipher,
            participant: final.attempt.participant ? { status: final.attempt.participant.status, researchCode: final.attempt.participant.researchCode } : null } })),
        publications,
        attendanceRows, attendanceSlice, sourceFinalCount, sourceAttendanceCount }))),
      compute: async (): Promise<SurveySourceProjection> => {
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
    if(attendanceRows.length>5000)
      throw new SurveyAnalyticsError(413,'研究进度数据超出单次读取上限，请缩小波次范围')
    let attendance:SurveySourceProjection['attendance']=attendanceRows.filter(row=>
      row.participant?.status!=='WITHDRAWN'&&row.excludedAt===null)
      .map(row=>({researchCode:row.participant!.researchCode,waveId:row.waveId,status:row.sampleReview?.verdict==='EXCLUDED'?'QUALITY_EXCLUDED':row.status}))
    // Row projection remains bounded independently from the ciphertext budget.
    const codebook=new Map<string,ResearchRawCodebook>()
    const scoreColumns:SurveySourceProjection['scoreColumns']=[]
    const scores:FrozenScoreObservation[]=[],raw:ResearchRawObservation[]=[]
    const rawColumnKeys=new Map<ResearchFrozenPublication,{
      ordinal:number;keys:ReturnType<typeof frozenRawColumnKeys>
    }>()
    const columnKeyFor=(snapshot:ResearchFrozenPublication,ordinal:number,
      unit:ResearchFrozenUnit,itemKey:string)=>{
      let entry=rawColumnKeys.get(snapshot)
      if(!entry){
        entry={ordinal,keys:frozenRawColumnKeys(snapshot,ordinal)}
        rawColumnKeys.set(snapshot,entry)
      }
      if(entry.ordinal!==ordinal)invalid('冻结研究波次序号不一致')
      const column=entry.keys.get(unit)?.get(itemKey)
      if(!column)invalid('冻结研究变量编码缺失')
      return column
    }
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
          const columnKey=columnKeyFor(snapshot,wave.ordinal,frozen,item.itemKey)
          if(codebook.has(columnKey))invalid('冻结研究变量编码重复')
          codebook.set(columnKey,{
            columnKey,waveId:wave.id,waveOrdinal:wave.ordinal,
            instrumentKey:frozen.instrumentKey,itemKey:item.itemKey,kind:frozen.kind,
            responseType:item.responseType,title:frozen.title,prompt:item.prompt,options:item.options,
            definitionDigest:frozen.sourceDigest,scoringDigest:frozen.scoringDigest,
            publicationVersion:publication.version,instrumentRevision:frozen.draftRevision,
            ...(item.timeZone?{timeZone:item.timeZone}:{}),
            valueEncoding:answerValueEncoding(item.responseType),
            ...(frozen.kind==='FORM'?{formSchemaVersion:(frozen.displayDefinition as FormDraft).schemaVersion}:{}),
            ...(frozen.kind==='SCALE'?{
              scalePresentationMode:(frozen.displayDefinition as ScaleDraft).presentationMode??'ALL_AT_ONCE',
              timingContract:(frozen.displayDefinition as ScaleDraft).presentationMode==='ONE_BY_ONE'
                ?'SURVEY_SCALE_ITEM_TIMING_V1':'NOT_COLLECTED',
            } as const:{}),
            ...(snapshot.flow?{flowDigest:snapshot.flow.flowDigest}:{}),
          })
        }
        scoreColumns.push(...frozenScoreColumns(input.projectId,wave.id,wave.ordinal,frozen))
      }
    }
    let nextAttendanceCursor: string | null = null
    if (input.attendanceOnly) {
      const variableCount = Math.max(1, codebook.size, scoreColumns.length)
      const pageSize = input.includeWideSchema ? Math.max(1, Math.min(250, Math.floor(6000 / variableCount))) : 250
      const selected = attendanceSlice.slice(0, pageSize)
      attendance = selected.map(row => ({ researchCode: row.participant!.researchCode, waveId: row.waveId,
        status: row.sampleReview?.verdict === 'EXCLUDED' ? 'QUALITY_EXCLUDED' : row.status }))
      nextAttendanceCursor = attendanceSlice.length > pageSize ? selected.at(-1)!.id : null
    }
    for(const final of finals){
      await new Promise<void>(resolve => setImmediate(resolve))
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
      if(snapshot.flow){
        const trace=result.executionTrace
        if(!trace||trace.schemaVersion!==1||trace.flowDigest!==snapshot.flow.flowDigest
          ||trace.clientPresentation!=='VERIFIED_SUBMISSION'||!attempt.flowAssignmentCipher)
          invalid('研究 Flow 来源及展示审计不可核验')
        const assigned=decryptUnifiedRuntimePayload<SurveyFlowAssignment>(attempt.flowAssignmentCipher)
        if(assigned.flowDigest!==snapshot.flow.flowDigest||
          trace.assignmentDigest!==canonicalHash(assigned)||
          trace.groupKey!==assigned.groupKey||trace.experimentKey!==assigned.experimentKey)
          invalid('研究流程实际执行轨迹与 Attempt 分组不一致')
      }else if(result.executionTrace)invalid('旧版 FINAL 不允许伪造 Flow 审计数据')
      try{
        validateSurveyScaleTimings(snapshot,Object.fromEntries(
          result.units.filter(u=>!u.notExecuted).map(u=>[u.instrumentKey,u.rawAnswers])
        ),result.itemTimings,true)
      }catch(e){
        if(e instanceof SurveyScaleTimingError)
          invalid('冻结 Survey Scale 计时来源未通过校验：'+e.path)
        throw e
      }
      const meta={
        projectId:input.projectId,waveId:wave.id,waveOrdinal:wave.ordinal,
        attemptId:attempt.id,researchCode:attempt.participant?.researchCode??null,
        attemptStartedAt:attempt.startedAt.toISOString(),
        completedAt:final.completedAt.toISOString(),sourceFinalHash:final.resultsHash,
      }
      const flowTrace=result.executionTrace
      const flowData=flowTrace?{
        flowDigest:flowTrace.flowDigest,experimentGroup:flowTrace.groupKey,
        shownBlocks:JSON.stringify(flowTrace.shownBlocks),
        flowTermination:flowTrace.termination,
      }:{}
      for(let i=0;i<snapshot.units.length;i++){
        const frozen=snapshot.units[i],unit=result.units[i]
        if(!unit||unit.instrumentKey!==frozen.instrumentKey||unit.kind!==frozen.kind
          ||unit.sourceDigest!==frozen.sourceDigest||unit.scoringDigest!==frozen.scoringDigest)
          invalid('研究 FINAL 组件来源与冻结定义不一致')
        if(input.selectScore!==false&&(!input.selectScore||
          frozen.instrumentKey===input.selectScore.instrumentKey))
          scores.push(...scoresFrom(frozen,unit,meta).filter(score=>!input.selectScore||
            score.measurement.scoreKey===input.selectScore.scoreKey))
        if(input.selectRaw!==false&&(!input.selectRaw||
          frozen.instrumentKey===input.selectRaw.instrumentKey)){
          for(const r of rawItems(frozen,unit,input.selectRaw?input.selectRaw.itemKey:undefined)){
          const columnKey=columnKeyFor(snapshot,wave.ordinal,frozen,r.itemKey)
          if(raw.length>=25000)
            throw new SurveyAnalyticsError(413,'逐题投影超过 25000 行上限，请缩小波次范围')
          const itemTiming=frozen.kind==='SCALE'
            ?result.itemTimings?.[frozen.instrumentKey]?.[r.itemKey]:undefined
          raw.push({...meta,...flowData,sourceVerified:true,kind:frozen.kind,
            instrumentKey:frozen.instrumentKey,itemKey:r.itemKey,columnKey,responseType:r.responseType,
            publicationVersion:publication.version,
            value:r.value,missingReason:r.missingReason,
            ...(itemTiming?{itemTiming}:{})})
          if(!codebook.has(columnKey))
            codebook.set(columnKey,{columnKey,waveId:wave.id,waveOrdinal:wave.ordinal,
              instrumentKey:frozen.instrumentKey,itemKey:r.itemKey,kind:frozen.kind,
              responseType:r.responseType,
              title:frozen.title,prompt:r.prompt,options:r.options,
              definitionDigest:frozen.sourceDigest,scoringDigest:frozen.scoringDigest,
              publicationVersion:publication.version,
              instrumentRevision:frozen.draftRevision,
              ...(r.timeZone?{timeZone:r.timeZone}:{}),
              valueEncoding:answerValueEncoding(r.responseType),
              ...(frozen.kind==='FORM'?{formSchemaVersion:(frozen.displayDefinition as FormDraft).schemaVersion}:{}),
              ...(frozen.kind==='SCALE'?{
                scalePresentationMode:(frozen.displayDefinition as ScaleDraft).presentationMode??'ALL_AT_ONCE',
                timingContract:(frozen.displayDefinition as ScaleDraft).presentationMode==='ONE_BY_ONE'
                  ?'SURVEY_SCALE_ITEM_TIMING_V1':'NOT_COLLECTED',
              } as const:{}),
              ...(snapshot.flow?{flowDigest:snapshot.flow.flowDigest}:{}),
            })
          }
        }
      }
    }
    return {projectId:input.projectId,collectionMode:project.collectionMode,
      sourceRevision:project.sourceRevision,
      completeAttempts:input.pageMode?finals.length:
        new Set(scores.map(s=>s.attemptId).concat(raw.map(r=>r.attemptId))).size,
      cutOff:cutOff.toISOString(),nextFinalCursor,sourceFinalCount,
      sourceAttendanceCount,nextAttendanceCursor,
      scores,scoreColumns,raw,codebook:[...codebook.values()],attendance}
      },
    }
  },{isolationLevel:Prisma.TransactionIsolationLevel.RepeatableRead})
}
