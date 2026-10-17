import {variantAuditColumns,variantAuditValues,type SurveyVariantConfiguration,type SurveyVariantAudit} from './analytics.variant'
import { canonicalHash } from '../assessment-runtime/canonical'
import { protectCsvCell,tableToCsv,surveyAttemptCode } from './analytics.export-format'
import type { SurveySourceProjection,ResearchRawObservation,ResearchRawCodebook } from './analytics.source'

export type SurveyRawFormat='WAVE'|'RAW_LONG'|'RAW_WIDE'|'ATTENDANCE_COMPACT_V1'
export interface SurveyRawExport {
  csv:string
  codebook:ResearchRawCodebook[]
  manifest:{
    schemaVersion:1|2;format:SurveyRawFormat;projectId:string;waveIds:string[];
    sourceDigest:string;codebookDigest:string;rowCount:number;
    columnCount:number;cutOff:string;dataDigest:string
    formulaGuard:'EXCEL_APOSTROPHE_PREFIX';flowDigests?:string[];variantConfigurations?:SurveyVariantConfiguration[]
  }
}
const attemptCode=surveyAttemptCode
const check=(projectId:string,source:SurveySourceProjection)=>{
  if(source.projectId!==projectId||
    source.raw.some(x=>x.projectId!==projectId||x.sourceVerified!==true))
    throw new Error('Raw export must use verified scoped Survey FINAL')
}
const displayCodes=()=>{
  // A single export owns this memo; its exact Attempt ID key is the complete
  // pseudonym hash input. Never retain identities across requests.
  const codes=new Map<string,string>()
  return (row:ResearchRawObservation)=>{
    if(row.researchCode)return row.researchCode
    let code=codes.get(row.attemptId)
    if(code===undefined){code=attemptCode(row.attemptId);codes.set(row.attemptId,code)}
    return code
  }
}
const timingStatus=(timing:ResearchRawObservation['itemTiming'])=>
  !timing?'NOT_RECORDED':
    timing.recoveredWithoutClock?'RECOVERED_NO_FIRST_RESPONSE':
      timing.interrupted?'INTERRUPTED':'RECORDED'
const ordered=(source:SurveySourceProjection,waveId:string|undefined,
  displayCode:ReturnType<typeof displayCodes>):ResearchRawObservation[]=>
  source.raw.filter(r=>waveId===undefined||r.waveId===waveId)
    .sort((a,b)=>a.waveOrdinal-b.waveOrdinal
      ||displayCode(a).localeCompare(displayCode(b))
      ||a.instrumentKey.localeCompare(b.instrumentKey)
      ||a.itemKey.localeCompare(b.itemKey))
function prepare(projectId:string,source:SurveySourceProjection,format:SurveyRawFormat,
  columns:string[],rows:unknown[][],dictionary:ResearchRawCodebook[]):SurveyRawExport {
  if(columns.length>512||rows.length>25000)
    throw new Error('Too many research results for a bounded interactive CSV; filter waves')
  const csv=tableToCsv(columns,rows,25000)
  const codebook=[...dictionary].sort((a,b)=>a.waveOrdinal-b.waveOrdinal||a.columnKey.localeCompare(b.columnKey))
  const waves=[...new Set(codebook.map(c=>c.waveId))].sort()
  const flowDigests=[...new Set(codebook.flatMap(c=>c.flowDigest?[c.flowDigest]:[]))].sort()
  return {csv,codebook,manifest:{
    schemaVersion:1,format,projectId,waveIds:waves,cutOff:source.cutOff,
    sourceDigest:canonicalHash(rows.map((row,i)=>({
      // Bound the source fingerprint to this exact set, without copying secrets.
      index:i,content:row,
    }))),
    codebookDigest:canonicalHash(codebook),
    rowCount:rows.length,columnCount:columns.length,
    dataDigest:canonicalHash(csv),formulaGuard:'EXCEL_APOSTROPHE_PREFIX',
    ...(flowDigests.length?{flowDigests}:{}),
    ...(source.variantConfigurations?.length?{variantConfigurations:source.variantConfigurations}:{}),
  }}
}
/** V4 non-FINAL participation is a normalized relation, not a fabricated
 * item-level response matrix. Never expose internal Attempt IDs or free text.
 * The signed continuation links this dataset to the corresponding FINAL pages.
 */
export function compactSurveyAttendanceExport(
  projectId:string,source:SurveySourceProjection,waveId:string,
):SurveyRawExport{
  if(source.projectId!==projectId||source.collectionMode!=='LINKED_WAVES'||
     source.raw.length||source.scores.length||
     source.attendance.some(row=>row.waveId!==waveId))
    throw new Error('Compact attendance requires scoped non-FINAL linked participation')
  const columns=['research_code','wave_id','participation_status','missing_reason']
  const records=source.attendance.map(row=>[
    row.researchCode,row.waveId,row.status,
    row.status==='QUALITY_EXCLUDED'?'QUALITY_EXCLUDED':'ABANDONED',
  ])
  const csv=tableToCsv(columns,records,250)
  return {csv,codebook:[],manifest:{
    schemaVersion:2,format:'ATTENDANCE_COMPACT_V1',projectId,waveIds:[waveId],
    sourceDigest:canonicalHash(records),codebookDigest:canonicalHash([]),
    rowCount:records.length,columnCount:columns.length,cutOff:source.cutOff,
    dataDigest:canonicalHash(csv),formulaGuard:'EXCEL_APOSTROPHE_PREFIX',
  }}
}
export function rawLongExport(projectId:string,source:SurveySourceProjection,waveId?:string):SurveyRawExport{
  check(projectId,source)
  const displayCode=displayCodes()
  const rows=ordered(source,waveId,displayCode)
  const hasVariants=!!source.variantConfigurations?.length||source.raw.some(r=>r.variant)
  const hasSource=source.codebook.some(c=>c.sourceAnswerMapping)
  const hasFlow=source.codebook.some(c=>c.flowDigest&&(!waveId||c.waveId===waveId))
  const hasSjtV2=source.codebook.some(c=>c.sjtSchemaVersion===2&&(!waveId||c.waveId===waveId))
  const timingByColumn=new Map(source.codebook.map(c=>[c.columnKey,c.timingContract]))
  const cols=['research_code_or_attempt','wave_id','wave_ordinal','publication_version',
    'instrument_key','item_key','variable_code','value','missing_reason','source_final_hash',
    'attempt_started_at_utc','final_completed_at_utc',
    'first_response_ms','active_time_ms','answer_change_count','item_revisit_count','timing_status',
    ...(hasSjtV2?['mother_scene_key','question_key','scorer_option_key','completion_status']:[]),
    ...(hasFlow?['flow_digest','experiment_group','shown_blocks','flow_termination']:[]),
    ...(hasVariants?variantAuditColumns:[]),...(hasSource?['source_item_key','source_option_value','source_option_type']:[])]
  const mapped=rows.map(r=>[
    displayCode(r),r.waveId,r.waveOrdinal,r.publicationVersion,r.instrumentKey,r.itemKey,r.columnKey,
    r.value,r.missingReason,r.sourceFinalHash,
    r.attemptStartedAt??null,r.completedAt,
    r.itemTiming?.firstResponseMs??null,r.itemTiming?.activeTimeMs??null,
    r.itemTiming?.changeCount??null,r.itemTiming?.revisitCount??null,
    r.kind!=='SCALE'?'NOT_APPLICABLE'
      :r.missingReason==='NOT_SHOWN'?'NOT_SHOWN'
        :timingByColumn.get(r.columnKey)!=='SURVEY_SCALE_ITEM_TIMING_V1'?'NOT_COLLECTED'
          :timingStatus(r.itemTiming),
    ...(hasSjtV2?[r.motherSceneKey??null,r.motherSceneKey?r.itemKey:null,r.scorerOptionKey??null,r.completionStatus??null]:[]),
    ...(hasFlow?[r.flowDigest??null,r.experimentGroup??null,
      r.shownBlocks??null,r.flowTermination??null]:[]),
    ...(hasVariants?variantAuditValues(r):[]),
    ...(hasSource?[r.sourceItemKey??null,r.sourceOptionValue??null,r.sourceOptionValue==null?null:typeof r.sourceOptionValue]:[]),
  ])
  // Long includes source-backed participation and attrition even when a Wave
  // has no FINAL. Synthetic rows carry no answer or frozen FINAL hash.
  const dictionary=source.codebook.filter(c=>waveId===undefined||c.waveId===waveId)
  if(source.collectionMode==='LINKED_WAVES'){
    const present=new Set(rows.filter(x=>x.researchCode)
      .map(x=>x.researchCode+':'+x.columnKey))
    const attendance=new Map(source.attendance.map(a=>[a.researchCode+':'+a.waveId,a.status]))
    const participants=[...new Set(source.attendance.map(a=>a.researchCode))].sort()
    // Reject before allocating millions of synthetic longitudinal cells.
    if(participants.length*dictionary.length+rows.length>25000)
      throw new Error('Long format exceeds 25000 bounded rows; narrow the Wave selection')
    for(const code of participants)for(const variable of dictionary){
      if(present.has(code+':'+variable.columnKey))continue
      const status=attendance.get(code+':'+variable.waveId)
      if(status==='COMPLETED')continue
      mapped.push([code,variable.waveId,variable.waveOrdinal,variable.publicationVersion,
        variable.instrumentKey,variable.itemKey,variable.columnKey,null,
        status==='QUALITY_EXCLUDED'?'QUALITY_EXCLUDED':status?'ABANDONED':'NO_WAVE',null,
        null,null,null,null,null,null,'NON_FINAL',
        ...(hasSjtV2?[variable.motherSceneKey??null,variable.motherSceneKey?variable.itemKey:null,null,'NON_FINAL']:[]),
        ...(hasFlow?[variable.flowDigest??null,null,null,null]:[]),
        ...(hasVariants?variantAuditValues({}):[]),...(hasSource?[variable.sourceAnswerMapping?.items[variable.itemKey]??null,null,null]:[])])
    }
  }
  return prepare(projectId,source,waveId?'WAVE':'RAW_LONG',cols,mapped,dictionary)
}
export function rawWideExport(projectId:string,source:SurveySourceProjection):SurveyRawExport{
  check(projectId,source)
  if(source.collectionMode!=='LINKED_WAVES'||source.raw.some(r=>!r.researchCode))
    throw new Error('RAW_WIDE requires project-local pseudonymous Linked Waves')
  const rows=ordered(source,undefined,displayCodes())
  const byColumn=new Map(source.codebook.map(x=>[x.columnKey,x]))
  // The frozen publication codebook includes variables from Waves with zero
  // completed FINAL; deriving columns only from observed answers drops those Waves.
  const columnIds=[...byColumn.keys()].sort()
  const flowWaves=[...new Map(source.codebook.filter(x=>x.flowDigest)
    .map(x=>[x.waveId,{waveId:x.waveId,ordinal:x.waveOrdinal,flowDigest:x.flowDigest!}])).values()]
    .sort((a,b)=>a.ordinal-b.ordinal||a.waveId.localeCompare(b.waveId))
  const variantWaves=[...new Map((source.variantConfigurations??source.codebook.flatMap(c=>c.variantConfiguration?[c.variantConfiguration]:[])).map(c=>[c.waveId,c])).values()]
  const variantByWave=new Map<string,SurveyVariantAudit>()
  for(const row of rows)if(row.variant){
    const key=row.researchCode+':'+row.waveId,old=variantByWave.get(key)
    if(old&&JSON.stringify(variantAuditValues(old))!==JSON.stringify(variantAuditValues(row)))
      throw new Error('Conflicting variant assignment within one participant Wave')
    variantByWave.set(key,row)
  }
  const perWaveFlow=new Map<string,{digest:string;group:string|null;shown:string|null;termination:string|null}>()
  for(const row of rows)if(row.researchCode&&row.flowDigest){
    const id=row.researchCode+':'+row.waveId
    const value={digest:row.flowDigest,group:row.experimentGroup??null,
      shown:row.shownBlocks??null,termination:row.flowTermination??null}
    const old=perWaveFlow.get(id)
    if(old&&JSON.stringify(old)!==JSON.stringify(value))
      throw new Error('Conflicting participant Flow traces within one immutable Wave')
    perWaveFlow.set(id,value)
  }
  const sourcedColumns=columnIds.filter(col=>byColumn.get(col)?.sourceAnswerMapping)
  const timedColumns=columnIds.filter(col=>byColumn.get(col)?.timingContract==='SURVEY_SCALE_ITEM_TIMING_V1')
  if(1+columnIds.length*2+timedColumns.length*5+flowWaves.length*4+variantWaves.length*variantAuditColumns.length+sourcedColumns.length*2>512)
    throw new Error('Wide export plus Scale response-time columns exceeds 512 fields; use Raw Long')
  type WideValue={value:string|number|null;missingReason:string|null;
    itemTiming?:ResearchRawObservation['itemTiming'];sourceOptionValue?:string|number|null}
  const byCode=new Map<string,Map<string,WideValue>>()
  const attendance=new Map(source.attendance.map(x=>[x.researchCode+':'+x.waveId,x.status]))
  // A participant who started but has no FINAL must remain represented as
  // ABANDONED, not vanish from the cohort's research-code rows.
  for(const entry of source.attendance)
    if(!byCode.has(entry.researchCode))
      byCode.set(entry.researchCode,new Map())
  for(const r of rows){
    const participant=r.researchCode!
    const values=byCode.get(participant)||new Map<string,WideValue>()
    if(values.has(r.columnKey))throw new Error('Duplicate participant/wave/variable in frozen FINAL')
    values.set(r.columnKey,{value:r.missingReason?null:r.value,missingReason:r.missingReason,sourceOptionValue:r.sourceOptionValue,
      ...(r.itemTiming?{itemTiming:r.itemTiming}:{})})
    byCode.set(participant,values)
  }
  // Every value is paired with an explicit missing-reason field. A missing
  // wave is NOT a numeric zero or the same as an abandoned attempt.
  const matrix=[...byCode].sort(([a],[b])=>a.localeCompare(b)).map(([code,values])=>
    [code,...columnIds.flatMap(col=>{
      const present=values.get(col)
      if(present)return [present.value,present.missingReason]
      const waveId=byColumn.get(col)!.waveId
      const status=attendance.get(code+':'+waveId)
      return [null,status==='QUALITY_EXCLUDED'?'QUALITY_EXCLUDED':
        status&&status!=='COMPLETED'?'ABANDONED':'NO_WAVE']
    }),...timedColumns.flatMap(col=>{
      const source=values.get(col),timing=source?.itemTiming
      return [timing?.firstResponseMs??null,timing?.activeTimeMs??null,
        timing?.changeCount??null,timing?.revisitCount??null,
        source?.missingReason==='NOT_SHOWN'?'NOT_SHOWN':
          timing?timingStatus(timing):source?'NOT_RECORDED':'NON_FINAL_OR_NO_WAVE']
    }),...flowWaves.flatMap(w=>{
      const row=perWaveFlow.get(code+':'+w.waveId)
      return [row?.digest??null,row?.group??null,row?.shown??null,row?.termination??null]
    }),...variantWaves.flatMap(w=>variantAuditValues(variantByWave.get(code+':'+w.waveId)??{})),
      ...sourcedColumns.flatMap(col=>{const value=values.get(col)?.sourceOptionValue;return [value??null,value==null?null:typeof value]})])
  const wideHeaders=['research_code',...columnIds.flatMap(col=>[col,col+'__missing']),
    ...timedColumns.flatMap(col=>[col+'__first_response_ms',col+'__active_time_ms',
      col+'__answer_change_count',col+'__item_revisit_count',col+'__timing_status']),
    ...flowWaves.flatMap(w=>{
      const prefix='W'+String(w.ordinal).padStart(3,'0')+'__FLOW__'
      return [prefix+'digest',prefix+'group',prefix+'shown_blocks',prefix+'termination']
    }),...variantWaves.flatMap(w=>variantAuditColumns.map(c=>'W'+String(source.codebook.find(c=>c.waveId===w.waveId)?.waveOrdinal??0).padStart(3,'0')+'__'+c)),...sourcedColumns.flatMap(col=>[col+'__source_value',col+'__source_type'])]
  return prepare(projectId,source,'RAW_WIDE',wideHeaders,matrix,
    columnIds.map(k=>{
      const row=byColumn.get(k);if(!row)throw new Error('Missing item Codebook')
      return row
    }))
}
/** For accepted research exports the service will enforce current grant and
 * recent TOTP on both creation and download. This module only serializes.
 * NOTE: protectCsvCell intentionally prefixes dangerous user-supplied TEXT
 * but preserves negative numeric scores as numeric cells.
 */
void protectCsvCell
