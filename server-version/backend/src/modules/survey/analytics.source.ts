import {frozenVariantConfiguration,type SurveyVariantAudit,type SurveyVariantConfiguration} from './analytics.variant'
import { Prisma } from '@prisma/client'
import { prisma } from '../../config/database'
import { canonicalHash } from '../assessment-runtime/canonical'
import { decryptUnifiedRuntimePayload } from '../assessment-runtime/security'
import type { ResearchFrozenPublication, ResearchFrozenUnit } from './publication.service'
import type { SurveyComputedFinal, FrozenUnitResult, AnswerPrimitive } from './final.compute'
import {prepareSurveyFlowAssignmentValidator,type SurveyFlowAssignment } from './flow.assignment'
import type { FrozenScoreObservation, MissingReason } from './analytics.cohorts'
import type { FormDraft, ScaleDraft, AnySjtDraft } from './builder.definition'
import {surveySjtQuestionEntries} from './sjt-structure'
import type {SurveySjtQuestion} from './sjt-selection'
import {loadSurveyCognitiveResults,loadSurveyCognitiveResultGroups,SurveyCognitiveError} from './cognitive.results'
import {cognitiveMeasurementColumns,prepareCognitiveProjection,pageCognitiveTrialRows,
  type CognitiveTrialObservation} from './analytics.cognitive'
import type { ScaleDefinitionV2 } from '../scale/scale-definition'
import type { SituationDefinitionV2 } from '../situational/situation-branching'
import { SurveyAnalyticsError } from './analytics.read'
import { isResearchFreeTextType } from './analytics.response-privacy'
import {validateSurveyScaleTimings,SurveyScaleTimingError,
  type SurveyScaleItemTimingV1} from './timing.definition'

export interface ResearchRawCodebook {
  variantConfiguration?:SurveyVariantConfiguration
  sourceProvenance?:ResearchFrozenUnit['sourceProvenance']
  sourceAnswerMapping?:ResearchFrozenUnit['sourceAnswerMapping']
  columnKey:string;waveId:string;waveOrdinal:number;instrumentKey:string;
  itemKey:string;kind:'FORM'|'SCALE'|'SJT'|'COGNITIVE';responseType:string;title:string;prompt:string;
  options:{code:string;label:string;nonanswerReason?:string}[];
  definitionDigest:string;scoringDigest:string|null
  publicationVersion:number
  instrumentRevision:number
  timeZone?:'Asia/Shanghai'|'UTC'
  valueEncoding?:'TEXT'|'NUMBER'|'JSON_STRING_ARRAY'|'JSON_NUMBER_OBJECT'
  formSchemaVersion?:1|2
  flowDigest?:string
  scalePresentationMode?:'ONE_BY_ONE'|'ALL_AT_ONCE'
  timingContract?:'SURVEY_SCALE_ITEM_TIMING_V1'|'NOT_COLLECTED'
  sjtSchemaVersion?:2
  motherSceneKey?:string;sceneTitle?:string;sceneIndex?:number;questionIndex?:number
  selectionRules?:{required:boolean;allowRefusal:boolean;minSelections:number;maxSelections:number;
    aggregationPolicy:string|null;exclusiveOptionKeys:string[];scoringMethod:string;
    rawEncoding:'AUTHORED_ORDER_OPTION_SET'|'SINGLE_OPTION';
    explicitRefusalEncoding:'JSON_SURVEY_REFUSAL_OBJECT';scorerKeyEncoding:'SINGLE_OPTION_OR_DERIVED_COMBINATION'}
}
export interface ResearchRawObservation extends SurveyVariantAudit {
  sourceItemKey?:string;sourceOptionValue?:string|number|null
  projectId:string;waveId:string;waveOrdinal:number;attemptId:string;
  researchCode:string|null;sourceFinalHash:string;
  instrumentKey:string;kind:'FORM'|'SCALE'|'SJT'|'COGNITIVE';responseType:string;
  itemKey:string;columnKey:string;publicationVersion:number;value:string|number|null;
  missingReason:MissingReason|null;completedAt:string;sourceVerified:true
  attemptStartedAt?:string
  itemTiming?:SurveyScaleItemTimingV1
  flowDigest?:string|null;experimentGroup?:string|null;
  shownBlocks?:string|null;flowTermination?:string|null
  motherSceneKey?:string;scorerOptionKey?:string|null
  completionStatus?:'COMPLETE'|'COMPLETE_EARLY'|'SCREEN_OUT'
}
export type SurveySourceVersion=Pick<ResearchRawCodebook,'waveId'|'instrumentKey'|'publicationVersion'|
  'instrumentRevision'|'definitionDigest'|'scoringDigest'|'sourceProvenance'|'sourceAnswerMapping'>
export interface SurveySourceProjection {
  /** Frozen sourced instruments, including cognitive units with no raw item codebook. */
  sourceVersions?:SurveySourceVersion[]
  variantConfigurations?:SurveyVariantConfiguration[]
  projectId:string;collectionMode:'SINGLE_UNLINKED'|'LINKED_WAVES'
  completeAttempts:number
  fullCompletionAttempts?:number
  earlyCompletionAttempts?:number
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
  attendance:({researchCode:string;waveId:string;status:string}&SurveyVariantAudit)[]
  cognitiveTrials?:CognitiveTrialObservation[]
  cognitivePage?:{finalId:string;sourceFinalHash:string;offset:number;nextOffset:number|null;estimatedBytes:number}
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
const answerValueEncoding=(type:string):NonNullable<ResearchRawCodebook['valueEncoding']>=>
  type==='RANK_ORDER'||type==='MULTIPLE'||type==='MATRIX_MULTIPLE'||type==='SJT_MULTIPLE'
    ?'JSON_STRING_ARRAY':type==='CONSTANT_SUM'?'JSON_NUMBER_OBJECT':
    type==='SLIDER'||type==='NUMBER'?'NUMBER':'TEXT'
type FrozenRawItem=Readonly<{
  itemKey:string;prompt:string;responseType:string;
  options:ReadonlyArray<Readonly<{code:string;label:string;nonanswerReason?:string}>>;
  answerKey:string;matrixRow?:string;timeZone?:'Asia/Shanghai'|'UTC'
  sjtQuestion?:SurveySjtQuestion
  sjtMetadata?:Pick<ResearchRawCodebook,'sjtSchemaVersion'|'motherSceneKey'|'sceneTitle'|
    'sceneIndex'|'questionIndex'|'selectionRules'>
}>
/** Static descriptors belong to one verified publication in one request. Copy
 * and freeze their options so participant projection cannot mutate the schema.
 * The dictionary needs no option tables or participant value/missing metadata.
 */
const frozenRawItems=(frozen:ResearchFrozenUnit,includeOptions:boolean):readonly FrozenRawItem[]=>{
  const output:FrozenRawItem[]=[]
  const emptyOptions:FrozenRawItem['options']=Object.freeze([])
  const optionsFor=(options:readonly {optionKey:string;label:string;nonanswerReason?:string}[])=>includeOptions
    ?Object.freeze(options.map(o=>Object.freeze({code:o.optionKey,label:o.label,
      ...(o.nonanswerReason?{nonanswerReason:o.nonanswerReason}:{})})))
    :emptyOptions
  const add=(item:FrozenRawItem)=>output.push(Object.freeze(item))
  if(frozen.kind==='FORM'){
    const draft=frozen.displayDefinition as FormDraft
    for(const page of draft.pages)for(const q of page.questions){
      const options=optionsFor(q.options)
      if(q.type==='MATRIX'||q.type==='MATRIX_MULTIPLE'){
        for(const row of q.rows)add({itemKey:q.itemKey+':'+row.rowKey,
          prompt:q.prompt+'／'+row.label,responseType:q.type,options,
          answerKey:q.itemKey,matrixRow:row.rowKey})
      }else{
        add({itemKey:q.itemKey,prompt:q.prompt,responseType:q.type,options,
          answerKey:q.itemKey,timeZone:q.timeZone})
        if(q.otherOptionKey)add({itemKey:q.itemKey+':other',prompt:q.prompt+'／其他填写',
          responseType:'OTHER_TEXT',options:emptyOptions,answerKey:q.itemKey+':other'})
      }
    }
  }else if(frozen.kind==='SCALE'){
    const draft=frozen.displayDefinition as ScaleDraft
    const options=optionsFor(draft.responseOptions)
    for(const q of draft.items)add({itemKey:q.itemKey,prompt:q.prompt,responseType:'LIKERT',
      options,answerKey:q.itemKey})
  }else if(frozen.kind==='SJT'){
    const draft=frozen.displayDefinition as AnySjtDraft
    if(draft.schemaVersion===1)for(const q of draft.questions)add({itemKey:q.questionKey,prompt:q.prompt,
      responseType:q.responseType==='MULTIPLE'?'SJT_MULTIPLE':'SJT_SINGLE',
      options:optionsFor(q.options),answerKey:q.questionKey})
    else for(const {scene,question:q,sceneIndex,questionIndex} of surveySjtQuestionEntries(draft))
      add({itemKey:q.questionKey,prompt:q.prompt,
        responseType:q.responseType==='MULTIPLE'?'SJT_MULTIPLE':'SJT_SINGLE',
        options:optionsFor(q.options),answerKey:q.questionKey,sjtQuestion:q,
        sjtMetadata:{sjtSchemaVersion:2,motherSceneKey:scene.sceneKey,sceneTitle:scene.title,
          sceneIndex,questionIndex,selectionRules:{required:'required' in q&&q.required===true,
            allowRefusal:'allowRefusal' in q&&q.allowRefusal===true,
            minSelections:q.responseType==='MULTIPLE'?(q.minSelections??1):1,
            maxSelections:q.responseType==='MULTIPLE'?(q.maxSelections??q.options.length):1,
            aggregationPolicy:q.aggregationPolicy??null,
            exclusiveOptionKeys:'exclusiveOptionKeys' in q?[...(q.exclusiveOptionKeys??[])]:[],
            scoringMethod:draft.scoring.modelKey,rawEncoding:q.responseType==='MULTIPLE'?'AUTHORED_ORDER_OPTION_SET':'SINGLE_OPTION',
            explicitRefusalEncoding:'JSON_SURVEY_REFUSAL_OBJECT',
            scorerKeyEncoding:'SINGLE_OPTION_OR_DERIVED_COMBINATION'}}})
  }
  return Object.freeze(output)
}
const projectRawItems=(items:readonly FrozenRawItem[],unit:FrozenUnitResult,onlyItemKey?:string)=>{
  // Match Array.find's first occurrence, including duplicate missing entries.
  // Matrix rows retain their explicit reason before the parent-question reason.
  const missing=new Map<string,MissingReason|null>()
  for(const row of unit.missing)if(!missing.has(row.itemKey))
    missing.set(row.itemKey,row.reason??null)
  const values=unit.rawAnswers
  const storedQuestions=(unit.privateScoring as {questionResults?:Array<{
    questionKey:string;motherSceneKey:string;scorerOptionKey:string|null;response:unknown;status:string
  }>}|null)?.questionResults
  const questionResults=new Map(storedQuestions?.map(row=>[row.questionKey,row])??[])
  const output:Array<{item:FrozenRawItem;value:string|number|null;missingReason:MissingReason|null;
    scorerOptionKey?:string|null}>=[]
  let matrixAnswerKey:string|undefined
  let matrixAnswers:Record<string,string|string[]>={}
  for(const item of items){
    if(onlyItemKey&&item.itemKey!==onlyItemKey)continue
    let value:AnswerPrimitive=values[item.answerKey]??null
    let missingReason=missing.get(item.itemKey)??null
    if(item.matrixRow!==undefined){
      if(matrixAnswerKey!==item.answerKey){
        matrixAnswerKey=item.answerKey
        matrixAnswers=value&&typeof value==='object'&&!Array.isArray(value)
          ?value as Record<string,string|string[]>:{}
      }
      value=matrixAnswers[item.matrixRow]??null
      missingReason=missingReason||(missing.get(item.answerKey)??null)
    }
    let scorerOptionKey:string|null|undefined
    if(item.sjtQuestion){
      if(unit.notExecuted)scorerOptionKey=null
      else{
        const stored=questionResults.get(item.itemKey)
        if(!stored||stored.motherSceneKey!==item.sjtMetadata?.motherSceneKey
          ||canonicalHash(stored.response)!==canonicalHash(value)
          ||(stored.status==='ANSWERED')!==(missingReason===null&&value!==null)
          ||(stored.status==='ANSWERED'?!stored.scorerOptionKey:stored.scorerOptionKey!==null))
          invalid('冻结 SJT 题目结果与原答或母情境不一致')
        scorerOptionKey=stored.scorerOptionKey
      }
    }
    output.push({item,value:cleanValue(value),missingReason,
      ...(scorerOptionKey!==undefined?{scorerOptionKey}:{})})
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
    |{scores?:{key:string;value:number|null;status:string}[];metrics?:{key:string;value:number|null;status:string}[];
      quality?:{status:string;flags:string[]}}
    |null
  const provenance=sjtProvenance(frozen)
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
          ?(frozen.displayDefinition as AnySjtDraft).respondentType:'research_form',
      unit:provenance?'score':null,
      ...(provenance?{provenance}:{}),
    },
    value:typeof r.value==='number'&&Number.isFinite(r.value)?r.value:null,
    missingReason:(typeof r.value==='number'&&Number.isFinite(r.value)?null:'SHOWN_MISSING') as MissingReason|null,
    ...(provenance?{status:r.status,metricDetails:storedSjtMetricDetails(r),
      ...(privateResult?.quality?{quality:{status:privateResult.quality.status,
        flags:Object.fromEntries((privateResult.quality.flags??[]).map(flag=>[flag,true]))}}:{})}:{}),
  }))
}
function storedSjtMetricDetails(record:unknown):FrozenScoreObservation['metricDetails']{
  const metric=record as NonNullable<FrozenScoreObservation['metricDetails']>
  return {...(metric.range?{range:{...metric.range}}:{}),
    ...(metric.coverage?{coverage:{...metric.coverage}}:{}),...(metric.maturity?{maturity:metric.maturity}:{})}
}
function sjtProvenance(frozen:ResearchFrozenUnit){
  if(frozen.kind!=='SJT')return undefined
  const draft=frozen.displayDefinition as AnySjtDraft
  if(draft.schemaVersion!==2)return undefined
  const compiled=frozen.compiledDefinition as SituationDefinitionV2
  return {kind:'SJT' as const,measurementDigest:canonicalHash({sourceDigest:frozen.sourceDigest,
    scoringDigest:frozen.scoringDigest}),scoringVersion:compiled.scoring.scoringVersion,
    scoringMethod:draft.scoring.modelKey}
}
/** The authoritative score variable list is part of the frozen scorer, not
 * inferred from whichever participants happened to finish a Wave.
 */
function frozenScoreColumns(projectId:string,waveId:string,ordinal:number,frozen:ResearchFrozenUnit):
  SurveySourceProjection['scoreColumns'] {
  if(frozen.kind==='COGNITIVE')return cognitiveMeasurementColumns(frozen)
    .map(measurement=>({projectId,waveId,waveOrdinal:ordinal,measurement}))
  const provenance=sjtProvenance(frozen)
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
        :(frozen.displayDefinition as AnySjtDraft).respondentType,
      unit:provenance?'score':null,
      ...(provenance?{provenance}:{}),
    },
  }))
}
function frozenSourceMetadata(frozen:ResearchFrozenUnit){
  const source=frozen
  return {...(source.sourceProvenance?{sourceProvenance:source.sourceProvenance}:{}),
    ...(source.sourceAnswerMapping?{sourceAnswerMapping:source.sourceAnswerMapping}:{})}
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
const frozenRawSchema=(snapshot:ResearchFrozenPublication,waveOrdinal:number,includeOptions=true)=>{
  const candidates:Array<{unit:ResearchFrozenUnit;itemKey:string;legacy:string}>=[]
  const counts=new Map<string,number>()
  const keys=new Map<ResearchFrozenUnit,Map<string,string>>()
  const itemsByUnit=new Map<ResearchFrozenUnit,readonly FrozenRawItem[]>()
  for(const unit of snapshot.units){
    const items=frozenRawItems(unit,includeOptions)
    itemsByUnit.set(unit,items)
    keys.set(unit,new Map())
    for(const item of items){
      const legacy=codeKey(waveOrdinal,unit.instrumentKey,item.itemKey,unit.sourceDigest)
      candidates.push({unit,itemKey:item.itemKey,legacy})
      counts.set(legacy,(counts.get(legacy)??0)+1)
    }
  }
  const used=new Set<string>()
  for(const {unit,itemKey,legacy} of candidates){
    const column=counts.get(legacy)===1?legacy:
      legacy+'__K'+canonicalHash([unit.instrumentKey,itemKey]).slice(0,16)
    const items=keys.get(unit)!
    if(used.has(column)||items.has(itemKey))invalid('冻结研究变量编码重复')
    used.add(column);items.set(itemKey,column)
  }
  return {itemsByUnit,keys}
}

type SurveyDictionaryInput={actorUserId:string;projectId:string;waveId:string}
export interface SurveyItemDictionary {
  waveId:string
  source:'FROZEN_CODEBOOK'
  variables:Pick<ResearchRawCodebook,'instrumentKey'|'itemKey'|'prompt'|'responseType'|
    'kind'|'columnKey'|'definitionDigest'>[]
}
/** A dictionary describes the current frozen Publication, never participant
 * data. Read and fence only that source, so neither cohort size nor unrelated
 * FINAL corruption can affect the variable list. Projection stays outside
 * business locks; current ownership/MFA and the exact source are read again.
 */
export async function loadSurveyItemDictionary(input:SurveyDictionaryInput):Promise<SurveyItemDictionary>{
  const first=await readSurveyDictionaryMaterial(input)
  const signature=(material:typeof first)=>canonicalHash(JSON.parse(JSON.stringify(material)))
  const originalSignature=signature(first)
  const variables:SurveyItemDictionary['variables']=[]
  if(first.publication){
    const publication=first.publication
    const snapshot=publication.compiledSnapshot as unknown as ResearchFrozenPublication
    if(publication.projectId!==input.projectId
      ||!snapshot||snapshot.schemaVersion!==1||snapshot.purpose!=='RESEARCH_ONLY'
      ||snapshot.projectId!==input.projectId||snapshot.runtimeStatus!=='SURVEY_FINAL_V1'
      ||!Array.isArray(snapshot.units)||!snapshot.units.length
      ||canonicalHash(JSON.parse(JSON.stringify(snapshot)))!==publication.definitionDigest)
      invalid('冻结研究发布定义摘要不匹配')
    if(snapshot.waveId!==first.wave.id)invalid('冻结波次定义摘要缺失')
    // Resolve collisions against the complete schema, including text fields
    // excluded from this endpoint. These IDs must match every export page.
    const schema=frozenRawSchema(snapshot,first.wave.ordinal,false)
    for(const unit of snapshot.units){
      for(const item of schema.itemsByUnit.get(unit)!){
        if(isResearchFreeTextType(item.responseType))continue
        const columnKey=schema.keys.get(unit)?.get(item.itemKey)
        if(!columnKey)invalid('冻结研究变量编码缺失')
        variables.push({instrumentKey:unit.instrumentKey,itemKey:item.itemKey,
          prompt:item.prompt,responseType:item.responseType,kind:unit.kind,
          columnKey,definitionDigest:unit.sourceDigest})
      }
    }
  }
  const current=await readSurveyDictionaryMaterial(input)
  if(originalSignature!==signature(current))
    invalid('研究来源在计算期间变化，请重新开始')
  return {waveId:input.waveId,source:'FROZEN_CODEBOOK',variables}
}

async function readSurveyDictionaryMaterial(input:SurveyDictionaryInput){
  return prisma.$transaction(async tx=>{
    const [project]=await tx.$queryRaw<Array<{
      collectionMode:'SINGLE_UNLINKED'|'LINKED_WAVES';sourceRevision:number
    }>>`
      SELECT p.collection_mode AS "collectionMode", p.revision AS "sourceRevision"
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
    const wave=await tx.surveyWave.findFirst({
      where:{id:input.waveId,projectId:input.projectId},
      select:{id:true,projectId:true,ordinal:true,status:true,revision:true,publicationId:true},
    })
    if(!wave)denied()
    // Preserve the existing dictionary behavior for unreleased DRAFT waves.
    // Their authored definitions are not a collected, frozen schema.
    if(!['OPEN','PAUSED','CLOSED'].includes(wave.status)||!wave.publicationId)
      return {project,wave,publication:null}
    const frozenBytes=(await tx.$queryRaw<Array<{bytes:bigint}>>`
      SELECT octet_length(compiled_snapshot::text)::bigint AS "bytes"
      FROM survey_publications WHERE id=${wave.publicationId}
    `)[0]?.bytes??0n
    if(frozenBytes>BigInt(8*1024*1024))
      throw new SurveyAnalyticsError(413,'冻结材料与加密答案超过单次内存预算，请缩小波次')
    const publication=await tx.surveyPublication.findUnique({where:{id:wave.publicationId}})
    if(!publication)invalid('冻结波次来源缺失')
    return {project,wave,publication}
  },{isolationLevel:Prisma.TransactionIsolationLevel.RepeatableRead})
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
  /** One FINAL at a time, with a signed within-FINAL row offset. */
  cognitiveTrials?:{offset:number;expectedFinalId?:string;expectedFinalHash?:string;maxRows?:number;maxBytes?:number}
}

export async function loadSurveySource(input: SurveySourceInput): Promise<SurveySourceProjection> {
  if(input.waveIds&&input.waveIds.length>100)throw new SurveyAnalyticsError(413,'本次选择的波次数量超出安全上限')
  if(input.cognitiveTrials&&(!input.pageMode||!input.stableIdCursor||input.maxFinals!==1
    ||input.waveIds?.length!==1||input.includeAttendance!==false||input.attendanceOnly))
    throw new SurveyAnalyticsError(400,'认知试次仅允许单波次、单 FINAL 的有界分页')
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
    // For an explicitly bounded wave selection, reuse the ownership read as
    // the small frozen-schema header read. Keep both source-fence passes.
    const ownedSchemaWaves=input.includeWideSchema&&input.waveIds?.length
      ?await tx.surveyWave.findMany({where:{projectId:input.projectId,id:{in:input.waveIds}},
        select:{id:true,ordinal:true,publicationId:true,status:true},orderBy:{ordinal:'asc'},take:101}):null
    if(input.waveIds?.length){
      const ownerWaves=ownedSchemaWaves?.length??await tx.surveyWave.count({where:{projectId:input.projectId,id:{in:input.waveIds}}})
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
    const frozenWaves=ownedSchemaWaves?ownedSchemaWaves.filter(w=>w.publicationId!==null&&['OPEN','PAUSED','CLOSED'].includes(w.status))
      :input.includeWideSchema?await tx.surveyWave.findMany({
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
    // Compact attendance still needs the exact frozen allocation, but not the
    // item/score matrix. Reuse schema headers whenever they are already loaded.
    const needsAttendance=project.collectionMode==='LINKED_WAVES'&&
      (input.attendanceOnly||input.includeAttendance!==false)
    const attendanceWaves=!needsAttendance?[]:input.includeWideSchema?frozenWaves:
      await tx.surveyWave.findMany({where:{projectId:input.projectId,
        ...(input.waveIds?.length?{id:{in:input.waveIds}}:{}),
        status:{in:['OPEN','PAUSED','CLOSED']},publicationId:{not:null}},
        select:{id:true,ordinal:true,publicationId:true},orderBy:{ordinal:'asc'},take:101})
    if(attendanceWaves.length>100)
      throw new SurveyAnalyticsError(413,'本次参与状态波次数量超出安全上限')
    const publicationIds=[...new Set([
      ...selectedHeaders.map(row=>row.publicationId),
      ...frozenWaves.flatMap(w=>w.publicationId?[w.publicationId]:[]),
      ...attendanceWaves.flatMap(w=>w.publicationId?[w.publicationId]:[]),
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
    const attendanceRows=!needsAttendance||input.attendanceOnly?[]:await tx.surveyWaveAttempt.findMany({
      where:{
        projectId:input.projectId,
        ...(input.waveIds?.length?{waveId:{in:input.waveIds}}:{}),
        participantId:{not:null},startedAt:{lt:cutOff},
      },
      select:{id:true,waveId:true,status:true,excludedAt:true,
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
    // Read no assignment TEXT on legacy publications. For variant attendance,
    // budget ciphertext before one bulk fetch, never a per-attempt lookup.
    const variantWaveIds=new Set(attendanceWaves.filter(w=>
      (publicationById.get(w.publicationId!)?.compiledSnapshot as unknown as ResearchFrozenPublication)
        ?.flow?.experiment?.mode==='QUESTIONNAIRE_VARIANTS').map(w=>w.id))
    const assignmentIds=[...new Set([
      ...attendanceRows.filter(row=>row.excludedAt===null&&row.participant?.status!=='WITHDRAWN'&&
        (row.status!=='COMPLETED'||row.sampleReview?.verdict==='EXCLUDED')),
      ...attendanceSlice,
    ].filter(row=>variantWaveIds.has(row.waveId)).map(row=>row.id))]
    if(attendanceRows.length>5000)
      throw new SurveyAnalyticsError(413,'研究进度数据超出单次读取上限，请缩小波次范围')
    if(assignmentIds.length){
      const bytes=(await tx.$queryRaw<Array<{bytes:bigint}>>`
        SELECT COALESCE(SUM(octet_length(flow_assignment_cipher)),0)::bigint AS "bytes"
        FROM survey_wave_attempts WHERE id IN (${Prisma.join(assignmentIds)})
      `)[0]?.bytes??0n
      if(bytes>BigInt(8*1024*1024))
        throw new SurveyAnalyticsError(413,'参与状态分配审计超过单次内存预算，请缩小波次')
    }
    const attendanceAssignments=assignmentIds.length?await tx.surveyWaveAttempt.findMany({
      where:{projectId:input.projectId,id:{in:assignmentIds}},
      select:{id:true,waveId:true,flowAssignmentCipher:true},orderBy:{id:'asc'},take:5001,
    }):[]
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
        attendanceRows, attendanceSlice, attendanceWaves, attendanceAssignments, sourceFinalCount, sourceAttendanceCount }))),
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
    const assignmentValidators=new Map([...verifiedSnapshots].flatMap(([id,snapshot])=>snapshot.flow
      ?[[id,prepareSurveyFlowAssignmentValidator(snapshot.flow)] as const]:[]))
    for(const wave of attendanceWaves){
      if(!wave.publicationId||verifiedSnapshots.get(wave.publicationId)?.waveId!==wave.id)
        invalid('参与状态的冻结波次来源不可核验')
    }
    const attendanceWaveById=new Map(attendanceWaves.map(w=>[w.id,w]))
    const attendanceAssignmentById=new Map(attendanceAssignments.map(row=>[row.id,row]))
    const attendanceAudit=(row:{id:string;waveId:string}):SurveyVariantAudit=>{
      if(!variantWaveIds.has(row.waveId))return {}
      const wave=attendanceWaveById.get(row.waveId)
      const snapshot=wave?.publicationId?verifiedSnapshots.get(wave.publicationId):undefined
      const stored=attendanceAssignmentById.get(row.id)
      if(!snapshot||snapshot.waveId!==row.waveId||!snapshot.flow||
        !stored||stored.waveId!==row.waveId||!stored.flowAssignmentCipher)
        invalid('参与状态的冻结问卷分配来源不可核验')
      let assigned:SurveyFlowAssignment
      try{
        assigned=decryptUnifiedRuntimePayload<SurveyFlowAssignment>(stored.flowAssignmentCipher)
        assignmentValidators.get(wave!.publicationId!)!(assigned)
      }catch{invalid('参与状态的冻结问卷分配来源不可核验')}
      if(!assigned.variant||!Number.isFinite(Date.parse(assigned.assignedAt)))
        invalid('参与状态的冻结问卷分配时间不可核验')
      return {variant:assigned.variant,assignmentAlgorithm:assigned.algorithm,
        assignmentDigest:canonicalHash(assigned),assignedAt:assigned.assignedAt}
    }
    let attendance:SurveySourceProjection['attendance']=attendanceRows.filter(row=>
      row.participant?.status!=='WITHDRAWN'&&row.excludedAt===null)
      .map(row=>({researchCode:row.participant!.researchCode,waveId:row.waveId,status:row.sampleReview?.verdict==='EXCLUDED'?'QUALITY_EXCLUDED':row.status,
        ...(row.status!=='COMPLETED'||row.sampleReview?.verdict==='EXCLUDED'?attendanceAudit(row):{})}))
    // Row projection remains bounded independently from the ciphertext budget.
    const variantConfigurations=[...verifiedSnapshots.values()].flatMap(snapshot=>{
      const config=frozenVariantConfiguration(snapshot.flow,snapshot.waveId);return config?[config]:[]
    })
    const sourceVersions:SurveySourceVersion[]=publications.flatMap(publication=>{
      const snapshot=verifiedSnapshots.get(publication.id)!
      return snapshot.units.filter(unit=>unit.sourceProvenance||unit.sourceAnswerMapping).map(unit=>({
        waveId:snapshot.waveId,instrumentKey:unit.instrumentKey,publicationVersion:publication.version,
        instrumentRevision:unit.draftRevision,definitionDigest:unit.sourceDigest,scoringDigest:unit.scoringDigest,
        ...frozenSourceMetadata(unit),
      }))
    })
    const variantConfigByWave=new Map(variantConfigurations.map(c=>[c.waveId,c]))
    const codebook=new Map<string,ResearchRawCodebook>()
    const scoreColumns:SurveySourceProjection['scoreColumns']=[]
    const scores:FrozenScoreObservation[]=[],raw:ResearchRawObservation[]=[]
    let cognitiveTrials:CognitiveTrialObservation[]|undefined
    let cognitivePage:SurveySourceProjection['cognitivePage']
    let completedFinals=0,fullCompletionAttempts=0,earlyCompletionAttempts=0
    const cognitiveProjections=new Map<ResearchFrozenUnit,ReturnType<typeof prepareCognitiveProjection>>()
    const cognitiveProjectionFor=(unit:ResearchFrozenUnit)=>{
      let projection=cognitiveProjections.get(unit)
      if(!projection){projection=prepareCognitiveProjection(unit);cognitiveProjections.set(unit,projection)}
      return projection
    }
    const scoreColumnsFor=(unit:ResearchFrozenUnit,waveId:string,ordinal:number)=>(unit.kind==='COGNITIVE'
      ?cognitiveProjectionFor(unit).columns.map(measurement=>({projectId:input.projectId,waveId,waveOrdinal:ordinal,measurement}))
      :frozenScoreColumns(input.projectId,waveId,ordinal,unit)).map(column=>({...column,measurement:{...column.measurement,
        ...frozenSourceMetadata(unit),...(variantConfigByWave.get(waveId)?{variantConfiguration:variantConfigByWave.get(waveId)}:{})}}))
    const rawSchemas=new Map<ResearchFrozenPublication,{
      ordinal:number;schema:ReturnType<typeof frozenRawSchema>
    }>()
    const rawSchemaFor=(snapshot:ResearchFrozenPublication,ordinal:number)=>{
      let entry=rawSchemas.get(snapshot)
      if(!entry){
        entry={ordinal,schema:frozenRawSchema(snapshot,ordinal)}
        rawSchemas.set(snapshot,entry)
      }
      if(entry.ordinal!==ordinal)invalid('冻结研究波次序号不一致')
      return entry.schema
    }
    const columnKeyFor=(snapshot:ResearchFrozenPublication,ordinal:number,
      unit:ResearchFrozenUnit,itemKey:string)=>{
      const column=rawSchemaFor(snapshot,ordinal).keys.get(unit)?.get(itemKey)
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
      const variantConfiguration=variantConfigByWave.get(wave.id)
      const rawSchema=rawSchemaFor(snapshot,wave.ordinal)
      for(const frozen of snapshot.units){
        for(const item of rawSchema.itemsByUnit.get(frozen)!){
          const columnKey=columnKeyFor(snapshot,wave.ordinal,frozen,item.itemKey)
          if(codebook.has(columnKey))invalid('冻结研究变量编码重复')
          codebook.set(columnKey,{
            columnKey,waveId:wave.id,waveOrdinal:wave.ordinal,
            ...(variantConfiguration?{variantConfiguration}:{}),
            ...frozenSourceMetadata(frozen),
            instrumentKey:frozen.instrumentKey,itemKey:item.itemKey,kind:frozen.kind,
            responseType:item.responseType,title:frozen.title,prompt:item.prompt,options:item.options.map(option=>({...option})),
            definitionDigest:frozen.sourceDigest,scoringDigest:frozen.scoringDigest,
            publicationVersion:publication.version,instrumentRevision:frozen.draftRevision,
            ...(item.timeZone?{timeZone:item.timeZone}:{}),
            valueEncoding:answerValueEncoding(item.responseType),
            ...(item.sjtMetadata??{}),
            ...(frozen.kind==='FORM'?{formSchemaVersion:(frozen.displayDefinition as FormDraft).schemaVersion}:{}),
            ...(frozen.kind==='SCALE'?{
              scalePresentationMode:(frozen.displayDefinition as ScaleDraft).presentationMode??'ALL_AT_ONCE',
              timingContract:(frozen.displayDefinition as ScaleDraft).presentationMode==='ONE_BY_ONE'
                ?'SURVEY_SCALE_ITEM_TIMING_V1':'NOT_COLLECTED',
            } as const:{}),
            ...(snapshot.flow?{flowDigest:snapshot.flow.flowDigest}:{}),
          })
        }
        scoreColumns.push(...scoreColumnsFor(frozen,wave.id,wave.ordinal))
      }
    }
    let nextAttendanceCursor: string | null = null
    if (input.attendanceOnly) {
      const variableCount = Math.max(1, codebook.size, scoreColumns.length)
      const pageSize = input.includeWideSchema ? Math.max(1, Math.min(250, Math.floor(6000 / variableCount))) : 250
      const selected = attendanceSlice.slice(0, pageSize)
      attendance = selected.map(row => ({ researchCode: row.participant!.researchCode, waveId: row.waveId,
        status: row.sampleReview?.verdict === 'EXCLUDED' ? 'QUALITY_EXCLUDED' : row.status,...attendanceAudit(row) }))
      nextAttendanceCursor = attendanceSlice.length > pageSize ? selected.at(-1)!.id : null
    }
    const prepareFinal=async(final:(typeof finals)[number])=>{
      await new Promise<void>(resolve => setImmediate(resolve))
      const wave=final.wave,attempt=final.attempt
      const publication=publicationById.get(final.publicationId)
      if(!publication)throw new SurveyAnalyticsError(409,'研究 FINAL 的不可变发布来源缺失')
      if(wave.projectId!==input.projectId||attempt.projectId!==input.projectId
        ||attempt.waveId!==wave.id||wave.publicationId!==publication.id
        ||publication.projectId!==input.projectId||final.definitionDigest!==publication.definitionDigest)
        invalid('研究 FINAL 的项目、波次或发布来源不一致')
      if(attempt.participant?.status==='WITHDRAWN')return null
      const snapshot=verifiedSnapshots.get(publication.id)
      if(!snapshot||snapshot.waveId!==wave.id)
        throw new SurveyAnalyticsError(409,'研究 FINAL 的冻结发布来源不一致')
      const result=decryptUnifiedRuntimePayload<SurveyComputedFinal>(final.resultsCipher)
      if(result.schemaVersion!==1||result.definitionDigest!==final.definitionDigest
        ||canonicalHash(JSON.parse(JSON.stringify(result)))!==final.resultsHash)
        invalid('研究 FINAL 加密内容或摘要无法验证')
      if(result.units.length!==snapshot.units.length)invalid('研究 FINAL 子任务数与冻结定义不一致')
      let variantAudit:SurveyVariantAudit={}
      if(snapshot.flow){
        const trace=result.executionTrace
        if(!trace||trace.schemaVersion!==1||trace.flowDigest!==snapshot.flow.flowDigest
          ||trace.clientPresentation!=='VERIFIED_SUBMISSION'||!attempt.flowAssignmentCipher)
          invalid('研究 Flow 来源及展示审计不可核验')
        const assigned=decryptUnifiedRuntimePayload<SurveyFlowAssignment>(attempt.flowAssignmentCipher)
        try{assignmentValidators.get(publication.id)!(assigned)}catch{invalid('研究问卷子版本分配来源不可核验')}
        const assignedDigest=canonicalHash(assigned)
        if(assigned.variant){
          if(canonicalHash(trace.variant??null)!==canonicalHash(assigned.variant)
            ||trace.assignedAt!==assigned.assignedAt||trace.algorithm!==assigned.algorithm
            ||!Number.isFinite(Date.parse(assigned.assignedAt)))
            invalid('研究问卷子版本执行轨迹与分配来源不一致')
          variantAudit={variant:assigned.variant,assignmentAlgorithm:assigned.algorithm,
            assignmentDigest:assignedDigest,assignedAt:assigned.assignedAt}
        }else if(trace.variant)invalid('普通流程不允许伪造问卷子版本来源')
        if(assigned.flowDigest!==snapshot.flow.flowDigest||
          trace.assignmentDigest!==assignedDigest||
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
        ...variantAudit,projectId:input.projectId,waveId:wave.id,waveOrdinal:wave.ordinal,
        attemptId:attempt.id,researchCode:attempt.participant?.researchCode??null,
        attemptStartedAt:attempt.startedAt.toISOString(),
        completedAt:final.completedAt.toISOString(),sourceFinalHash:final.resultsHash,
      }
      const cognitiveUnits=result.units.filter(unit=>unit.kind==='COGNITIVE'&&!unit.notExecuted)
      if(cognitiveUnits.some(unit=>!unit.childReference))invalid('研究 FINAL 缺少认知子结果引用')
      return {final,wave,publication,snapshot,result,meta,cognitiveUnits}
    }
    // Keep only one chunk of decrypted parents/children alive. Eight complete
    // parent groups preserve the existing 1 MiB per-parent metrics allowance,
    // with at most 8 MiB active child ciphertext; this is not a new page cap.
    // Ordinary-only publications retain the original one-parent live working set.
    const parentBatchSize=[...verifiedSnapshots.values()].some(snapshot=>snapshot.units.some(unit=>unit.kind==='COGNITIVE'))?8:1
    for(let offset=0;offset<finals.length;offset+=parentBatchSize){
      const preparedFinals:Array<NonNullable<Awaited<ReturnType<typeof prepareFinal>>>>=[]
      for(const final of finals.slice(offset,offset+parentBatchSize)){
        const prepared=await prepareFinal(final)
        if(prepared)preparedFinals.push(prepared)
      }
      let childGroups:Awaited<ReturnType<typeof loadSurveyCognitiveResultGroups>>=[]
      if(preparedFinals.some(parent=>parent.cognitiveUnits.length)){
        try{
          const groups=preparedFinals.map(parent=>({projectId:input.projectId,waveId:parent.wave.id,
            attemptId:parent.final.attempt.id,publicationId:parent.publication.id,
            references:parent.cognitiveUnits.map(unit=>unit.childReference!)}))
          childGroups=await prisma.$transaction(async tx=>input.cognitiveTrials
            ?[await loadSurveyCognitiveResults(tx,{...groups[0],includeRaw:true})]
            :loadSurveyCognitiveResultGroups(tx,groups),
          {isolationLevel:Prisma.TransactionIsolationLevel.RepeatableRead})
        }catch(e){if(e instanceof SurveyCognitiveError)throw new SurveyAnalyticsError(e.statusCode,e.message);throw e}
      }
      for(let parentIndex=0;parentIndex<preparedFinals.length;parentIndex++){
        const {final,wave,publication,snapshot,result,meta}=preparedFinals[parentIndex]
        const children=childGroups[parentIndex]??[]
        const childrenBySlot=new Map(children.map(child=>[child.reference.slotKey,child]))
        const cognitiveMeta={...meta,publicationId:publication.id,publicationVersion:publication.version,
          completionStatus:result.executionTrace?.termination??'COMPLETE' as const}
        const trialInputs:Array<Iterable<CognitiveTrialObservation>>=[]
        const flowTrace=result.executionTrace
        const completionStatus=flowTrace?.termination??'COMPLETE'
        completedFinals++
        if(completionStatus==='COMPLETE')fullCompletionAttempts++
        else if(completionStatus==='COMPLETE_EARLY')earlyCompletionAttempts++
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
          if(frozen.kind==='COGNITIVE'&&(Object.keys(unit.rawAnswers).length
            ||(unit.notExecuted&&unit.childReference)))invalid('认知整轮 FINAL 不得复制原始试次或引用未呈现的子任务')
          if(frozen.kind==='COGNITIVE'&&unit.notExecuted){
            if(input.selectScore!==false&&(!input.selectScore||frozen.instrumentKey===input.selectScore.instrumentKey))
              scores.push(...scoreColumnsFor(frozen,wave.id,wave.ordinal)
                .filter(column=>!input.selectScore||column.measurement.scoreKey===input.selectScore.scoreKey)
                .map(column=>({...meta,sourceVerified:true as const,measurement:column.measurement,
                  value:null,missingReason:'NOT_SHOWN' as MissingReason,completionStatus})))
            continue
          }
          if(frozen.kind==='COGNITIVE'&&!unit.notExecuted){
            const child=childrenBySlot.get(frozen.instrumentKey)
            if(!child)invalid('研究 FINAL 的认知子结果来源缺失')
            const projection=cognitiveProjectionFor(frozen)
            const childScores=projection.scoresFromChild(unit,child,cognitiveMeta).map(score=>({...score,measurement:{...score.measurement,...frozenSourceMetadata(frozen),
              ...(variantConfigByWave.get(wave.id)?{variantConfiguration:variantConfigByWave.get(wave.id)}:{})}}))
            if(input.selectScore!==false&&(!input.selectScore||frozen.instrumentKey===input.selectScore.instrumentKey))
              scores.push(...childScores.filter(score=>!input.selectScore||score.measurement.scoreKey===input.selectScore.scoreKey))
            if(input.cognitiveTrials)trialInputs.push(projection.trialRows(child,cognitiveMeta))
            continue
          }
          if(input.selectScore!==false&&(!input.selectScore||
            frozen.instrumentKey===input.selectScore.instrumentKey))
            scores.push(...scoresFrom(frozen,unit,meta).filter(score=>!input.selectScore||
              score.measurement.scoreKey===input.selectScore.scoreKey).map(score=>
                ({...score,...(score.measurement.provenance||meta.variant?{completionStatus}:{}),measurement:{...score.measurement,...frozenSourceMetadata(frozen),
                  ...(variantConfigByWave.get(wave.id)?{variantConfiguration:variantConfigByWave.get(wave.id)}:{})}})))
          if(input.selectRaw!==false&&(!input.selectRaw||
            frozen.instrumentKey===input.selectRaw.instrumentKey)){
            const items=rawSchemaFor(snapshot,wave.ordinal).itemsByUnit.get(frozen)!
            for(const {item:r,value,missingReason,scorerOptionKey} of projectRawItems(items,unit,input.selectRaw?input.selectRaw.itemKey:undefined)){
            const columnKey=columnKeyFor(snapshot,wave.ordinal,frozen,r.itemKey)
            if(raw.length>=25000)
              throw new SurveyAnalyticsError(413,'逐题投影超过 25000 行上限，请缩小波次范围')
            const itemTiming=frozen.kind==='SCALE'
              ?result.itemTimings?.[frozen.instrumentKey]?.[r.itemKey]:undefined
            raw.push({...meta,...flowData,sourceVerified:true,kind:frozen.kind,
              instrumentKey:frozen.instrumentKey,itemKey:r.itemKey,columnKey,responseType:r.responseType,
              publicationVersion:publication.version,
              ...(frozen.sourceAnswerMapping?{sourceItemKey:frozen.sourceAnswerMapping.items[r.itemKey],
                sourceOptionValue:typeof value==='string'?(frozen.sourceAnswerMapping.options[value]??null):null}:{}),
              value,missingReason,
              ...(r.sjtMetadata?{motherSceneKey:r.sjtMetadata.motherSceneKey,scorerOptionKey,completionStatus}:{}),
              ...(itemTiming?{itemTiming}:{})})
            if(!codebook.has(columnKey))
              codebook.set(columnKey,{columnKey,waveId:wave.id,waveOrdinal:wave.ordinal,
                ...(variantConfigByWave.get(wave.id)?{variantConfiguration:variantConfigByWave.get(wave.id)}:{}),
                ...frozenSourceMetadata(frozen),
                instrumentKey:frozen.instrumentKey,itemKey:r.itemKey,kind:frozen.kind,
                responseType:r.responseType,
                title:frozen.title,prompt:r.prompt,options:r.options.map(option=>({...option})),
                definitionDigest:frozen.sourceDigest,scoringDigest:frozen.scoringDigest,
                publicationVersion:publication.version,
                instrumentRevision:frozen.draftRevision,
                ...(r.timeZone?{timeZone:r.timeZone}:{}),
                valueEncoding:answerValueEncoding(r.responseType),
                ...(r.sjtMetadata??{}),
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
        if(input.cognitiveTrials){
          const request=input.cognitiveTrials
          if((request.expectedFinalId&&request.expectedFinalId!==final.id)
            ||(request.expectedFinalHash&&request.expectedFinalHash!==final.resultsHash))
            invalid('认知试次分页引用的整轮 FINAL 已变化')
          function* allTrials(){for(const rows of trialInputs)yield* rows}
          const page=pageCognitiveTrialRows(allTrials(),request.offset,
            request.maxRows!==undefined&&request.maxBytes!==undefined?{maxRows:request.maxRows,maxBytes:request.maxBytes}:undefined)
          cognitiveTrials=page.rows
          cognitivePage={finalId:final.id,sourceFinalHash:final.resultsHash,offset:request.offset,
            nextOffset:page.nextOffset,estimatedBytes:page.estimatedBytes}
        }
      }
    }
    if(input.cognitiveTrials&&!finals.length&&input.cognitiveTrials.expectedFinalId)
      invalid('认知试次分页引用的整轮 FINAL 不再可用')
    return {projectId:input.projectId,collectionMode:project.collectionMode,variantConfigurations,
      ...(sourceVersions.length?{sourceVersions}:{}),
      sourceRevision:project.sourceRevision,
      completeAttempts:completedFinals,
      cutOff:cutOff.toISOString(),nextFinalCursor,sourceFinalCount,
      sourceAttendanceCount,nextAttendanceCursor,
      fullCompletionAttempts,earlyCompletionAttempts,
      scores,scoreColumns,raw,codebook:[...codebook.values()],attendance,
      ...(input.cognitiveTrials?{cognitiveTrials:cognitiveTrials??[],cognitivePage}:{})}
      },
    }
  },{isolationLevel:Prisma.TransactionIsolationLevel.RepeatableRead})
}
