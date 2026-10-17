import {variantAuditColumns,variantAuditValues,type SurveyVariantConfiguration,type SurveyVariantAudit} from './analytics.variant'
import { canonicalHash, canonicalJsonString } from '../assessment-runtime/canonical'
import type { FrozenScoreObservation, MissingReason } from './analytics.cohorts'

/** Pure bounded serialization shared by future scoped streaming export adapter.
 * A caller MUST establish current Project ownership + recent MFA, a real
 * immutable FINAL source, withdrawal filtering, and a stable source watermark.
 */
export interface ResearchExportCodebookRow {
  variantConfiguration?:SurveyVariantConfiguration
  sourceProvenance?:unknown
  sourceAnswerMapping?:unknown
  column:string
  waveId:string
  ordinal:number
  instrumentKey:string
  scoreKey:string
  scoringDigest:string
  responseSignature:string
  unit:string|null
  provenance?:FrozenScoreObservation['measurement']['provenance']
  missingMeanings:Readonly<Partial<Record<MissingReason,string>>>
}
export interface ResearchExportManifest {
  variantConfigurations?:SurveyVariantConfiguration[]
  schemaVersion:1
  format:'LONG'|'WIDE'
  projectId:string
  projectSourceHash:string
  rowCount:number
  columnCount:number
  dataHash:string
  formulaGuard:"EXCEL_APOSTROPHE_PREFIX"
  exportedAt:string
}
export interface BoundedResearchExport {
  csv:string
  codebook:ResearchExportCodebookRow[]
  manifest:ResearchExportManifest
}
const missingMeanings:Record<Exclude<MissingReason,'UNABLE_TO_JUDGE'>,string>={
  NOT_SHOWN:'根据冻结显示条件未呈现',
  SHOWN_MISSING:'呈现但未作答',
  REFUSED:'明确选择不回答',
  NO_WAVE:'本研究编号未参加该波次',
  ABANDONED:'已启动但没有完成 FINAL',
  NOT_COMPARABLE:'来源测量或计分版本不可比较',
  WITHDRAWN:'数据已依研究规定被撤回/排除',
  QUALITY_EXCLUDED:'科研人员审计标记为不纳入当前有效分析',
}
const threatPrefix=/^[\s\u200B\u200C\u200D\u202A-\u202E\uFEFF]*[=+@-]/
/** Stable study-local pseudonym. Never serialize internal Attempt PKs into researcher files. */
export const surveyAttemptCode=(id:string)=>'A-'+canonicalHash(id).slice(0,20).toUpperCase()
export const protectCsvCell=(raw:unknown):string=>{
  if(raw===null||raw===undefined)return ''
  if(typeof raw!=='string'&&typeof raw!=='number'&&typeof raw!=='boolean')
    throw new Error('CSV field must be scalar')
  if(typeof raw==='number'){
    if(!Number.isFinite(raw))throw new Error('CSV numbers must be finite')
    // A true numeric -2.5 is research data, never an Excel formula.
    return String(raw)
  }
  const value=String(raw)
  // Adding a literal apostrophe survives quoted CSV parsers and prevents
  // spreadsheet formula execution, at the cost of a documented text prefix.
  return threatPrefix.test(value)?"'"+value:value
}
const csvCell=(raw:unknown):string=>{
  const value=protectCsvCell(raw)
  return '"'+value.replace(/"/g,'""')+'"'
}
export const tableToCsv=(columns:string[],records:readonly (readonly unknown[])[],maxRows=10000):string=>{
  if(columns.length>512||records.length>maxRows)throw new Error('Export exceeds bounded interactive format')
  if(records.some(r=>r.length!==columns.length))throw new Error('Export row width differs from declared codebook')
  return [columns.map(csvCell).join(','),...records.map(r=>r.map(csvCell).join(','))].join('\r\n')+'\r\n'
}
const safeName=(text:string)=>text.replace(/[^a-z0-9_]/gi,'_').slice(0,36)||'metric'
type FrozenScoreColumn=Pick<FrozenScoreObservation,'projectId'|'waveId'|'waveOrdinal'|'measurement'>
const exportIdentifiers=()=>{
  const attemptCodes=new Map<string,string>()
  const measurements=new Map<string,{suffix:string;columns:Map<string,string>}>()
  return {
    attemptCode:(id:string)=>{
      let code=attemptCodes.get(id)
      if(code===undefined){code=surveyAttemptCode(id);attemptCodes.set(id,code)}
      return code
    },
    columnId:(o:Pick<FrozenScoreColumn,'waveId'|'waveOrdinal'|'measurement'>):string=>{
      const identity={
        instrumentKey:o.measurement.instrumentKey,scoreKey:o.measurement.scoreKey,
        scoringDigest:o.measurement.scoringDigest,responseSignature:o.measurement.responseSignature,
        respondentType:o.measurement.respondentType,unit:o.measurement.unit,
        ...(o.measurement.provenance?{provenance:o.measurement.provenance}:{}),
      }
      // Validate every supplied identity, including shared mutable objects.
      // Only decorated IDs are reused later in this serializer invocation;
      // no object-reference cache or lossy delimiter key bypasses the encoder.
      const key=canonicalJsonString(identity)
      let measurement=measurements.get(key)
      if(measurement===undefined){
        measurement={suffix:'__'+safeName(identity.instrumentKey)+'__'+safeName(identity.scoreKey)
          +'__'+canonicalHash(identity).slice(0,12),columns:new Map()}
        measurements.set(key,measurement)
      }
      const wave='W'+String(o.waveOrdinal).padStart(3,'0')
      let column=measurement.columns.get(wave)
      if(column===undefined){column=wave+measurement.suffix;measurement.columns.set(wave,column)}
      return column
    },
  }
}
const codebookFor=(o:Pick<FrozenScoreColumn,'waveId'|'waveOrdinal'|'measurement'>,
  column:string):ResearchExportCodebookRow=>({
  column,waveId:o.waveId,ordinal:o.waveOrdinal,
  ...(o.measurement.variantConfiguration?{variantConfiguration:o.measurement.variantConfiguration}:{}),
  ...(o.measurement.sourceProvenance?{sourceProvenance:o.measurement.sourceProvenance}:{}),
  ...(o.measurement.sourceAnswerMapping?{sourceAnswerMapping:o.measurement.sourceAnswerMapping}:{}),
  instrumentKey:o.measurement.instrumentKey,scoreKey:o.measurement.scoreKey,
  scoringDigest:o.measurement.scoringDigest,responseSignature:o.measurement.responseSignature,
  unit:o.measurement.unit,missingMeanings:o.measurement.provenance
    ?{...missingMeanings,UNABLE_TO_JUDGE:'明确表示无法判断，不作为零分'}:missingMeanings,
  ...(o.measurement.provenance?{provenance:o.measurement.provenance}:{}),
})
const decorateColumns=(source:FrozenScoreObservation[],expectedColumns:readonly FrozenScoreColumn[],
  columnId:(o:FrozenScoreColumn)=>string)=>{
  const definitions=new Map<string,FrozenScoreColumn>()
  const decorate=<T extends FrozenScoreColumn>(o:T)=>{
    const column=columnId(o)
    // Preserve first-insertion order and last-wins metadata, including distinct
    // wave IDs/identities that happen to produce the same exported column.
    definitions.set(column,o)
    return {o,column}
  }
  const expected=expectedColumns.map(decorate),rows=source.map(decorate)
  return {expected,rows,codebook:[...definitions].map(([column,o])=>codebookFor(o,column))}
}
const sourceRows=(projectId:string,records:readonly FrozenScoreObservation[]):FrozenScoreObservation[]=>{
  if(records.some(r=>r.projectId!==projectId||r.sourceVerified!==true||!r.sourceFinalHash))
    throw new Error('Only exact project-owned verified FINAL data may be exported')
  if(records.some(r=>r.missingReason==='WITHDRAWN'))
    throw new Error('Withdrawn observations must be filtered by the source adapter')
  if(records.length>20000)throw new Error('Interactive export too large; use approved streaming source adapter')
  return [...records].sort((a,b)=>
    a.waveOrdinal-b.waveOrdinal||a.waveId.localeCompare(b.waveId)
    ||(a.researchCode||a.attemptId).localeCompare(b.researchCode||b.attemptId)
    ||a.measurement.instrumentKey.localeCompare(b.measurement.instrumentKey)
    ||a.measurement.scoreKey.localeCompare(b.measurement.scoreKey))
}
function finalArtifact(format:'LONG'|'WIDE',projectId:string,cols:string[],rows:unknown[][],
  source:FrozenScoreObservation[],codebook:ResearchExportCodebookRow[]):BoundedResearchExport{
  const csv=tableToCsv(cols,rows)
  return {csv,codebook,manifest:{
    schemaVersion:1,format,projectId,
    ...((codebook.some(c=>c.variantConfiguration))?{variantConfigurations:[...new Map(codebook.flatMap(c=>c.variantConfiguration?[[c.waveId,c.variantConfiguration] as const]:[])).values()]}:{}),
    projectSourceHash:canonicalHash(source.map(r=>({
      final:r.sourceFinalHash,wave:r.waveId,attempt:r.attemptId,
      instrument:r.measurement.instrumentKey,score:r.measurement.scoreKey,
    }))),
    rowCount:rows.length,columnCount:cols.length,
    dataHash:canonicalHash(csv),formulaGuard:'EXCEL_APOSTROPHE_PREFIX',
    exportedAt:new Date().toISOString(),
  }}
}
export function exportLong(projectId:string,observations:readonly FrozenScoreObservation[],
  attendance:readonly ({researchCode:string;waveId:string;status:string}&SurveyVariantAudit)[]=[],
  expectedColumns:readonly FrozenScoreColumn[]=[]):BoundedResearchExport{
  const source=sourceRows(projectId,observations)
  if(expectedColumns.some(column=>column.projectId!==projectId))
    throw new Error('Expected score columns must belong to the authorized project')
  const {columnId,attemptCode}=exportIdentifiers()
  const decorated=decorateColumns(source,expectedColumns,columnId)
  const versioned=decorated.codebook.some(row=>row.provenance)
  const variants=decorated.codebook.some(row=>row.variantConfiguration)||source.some(row=>row.variant)
  const columns=['research_code_or_attempt','wave_id','wave_ordinal','attempt_code',
    'column','instrument_key','score_key','scoring_digest','response_signature',
    'value','missing_reason','source_final_hash',
    ...(versioned?['unit','computation_status','quality_status','quality_flags','quality_reasons',
      'source_result_hash','epoch','measurement_digest','scoring_version','config_hash',
      'protocol_signature','engine_version','timing_policy','device_policy','scoring_method','completion_status','metric_details']:[]),...(variants?variantAuditColumns:[])]
  const data=decorated.rows.map(({o,column})=>{
    return [o.researchCode||attemptCode(o.attemptId),o.waveId,o.waveOrdinal,attemptCode(o.attemptId),
      column,o.measurement.instrumentKey,o.measurement.scoreKey,
      o.measurement.scoringDigest,o.measurement.responseSignature,
      o.value,o.missingReason,o.sourceFinalHash,
      ...(versioned?[o.measurement.unit,o.status??null,o.quality?.status??null,
        o.quality?JSON.stringify(o.quality.flags):null,o.quality?.reasons?JSON.stringify(o.quality.reasons):null,
        o.sourceResultHash??null,o.epoch??null,o.measurement.provenance?.measurementDigest??null,
        o.measurement.provenance?.scoringVersion??null,o.measurement.provenance?.configHash??null,
        o.measurement.provenance?.protocolSignature??null,o.measurement.provenance?.engineVersion??null,
        o.measurement.provenance?.timingPolicy??null,o.measurement.provenance?.devicePolicy??null,
        o.measurement.provenance?.scoringMethod??null,o.completionStatus??null,
        o.metricDetails?JSON.stringify(o.metricDetails):null]:[]),...(variants?variantAuditValues(o):[])]
  })
  if(new Set(attendance.map(a=>a.researchCode)).size*expectedColumns.length
    +source.length>10000)
    throw new Error('Score Long exceeds 10000 bounded rows; narrow the Wave selection')
  const present=new Set(decorated.rows.filter(({o})=>o.researchCode)
    .map(({o,column})=>o.researchCode+':'+column))
  const participation=new Map(attendance.map(a=>[a.researchCode+':'+a.waveId,a]))
  for(const code of new Set(attendance.map(a=>a.researchCode))){
    for(const {o:expected,column} of decorated.expected){
      if(present.has(code+':'+column))continue
      const attended=participation.get(code+':'+expected.waveId)
      const status=attended?.status
      if(status==='COMPLETED')continue
      data.push([code,expected.waveId,expected.waveOrdinal,null,
        column,expected.measurement.instrumentKey,expected.measurement.scoreKey,
        expected.measurement.scoringDigest,expected.measurement.responseSignature,
        null,status==='QUALITY_EXCLUDED'?'QUALITY_EXCLUDED':status?'ABANDONED':'NO_WAVE',null,
        ...(versioned?[expected.measurement.unit,'NON_FINAL',null,null,null,null,null,
          expected.measurement.provenance?.measurementDigest??null,
          expected.measurement.provenance?.scoringVersion??null,
          expected.measurement.provenance?.configHash??null,
          expected.measurement.provenance?.protocolSignature??null,
          expected.measurement.provenance?.engineVersion??null,
          expected.measurement.provenance?.timingPolicy??null,
          expected.measurement.provenance?.devicePolicy??null,
          expected.measurement.provenance?.scoringMethod??null,'NON_FINAL',null]:[]),...(variants?variantAuditValues(attended??{}):[])])
    }
  }
  return finalArtifact('LONG',projectId,columns,data,source,decorated.codebook)
}
/** WIDE is legitimate ONLY in LINKED_WAVES. Rows with no stable researchCode
 * are rejected rather than synthesizing a false shared identity. */
export function exportWide(projectId:string,observations:readonly FrozenScoreObservation[],
  attendance:readonly ({researchCode:string;waveId:string;status:string}&SurveyVariantAudit)[]=[],
  expectedColumns:readonly FrozenScoreColumn[]=[]):BoundedResearchExport{
  const source=sourceRows(projectId,observations)
  if(source.some(o=>!o.researchCode))
    throw new Error('Anonymous SINGLE_UNLINKED answers cannot be widened across waves')
  if(expectedColumns.some(column=>column.projectId!==projectId))
    throw new Error('Expected score columns must belong to the authorized project')
  const {columnId}=exportIdentifiers()
  // Frozen scorer definitions yield columns even if this Wave has zero FINALs.
  const decorated=decorateColumns(source,expectedColumns,columnId)
  const codebook=decorated.codebook.sort((a,b)=>a.ordinal-b.ordinal||a.column.localeCompare(b.column))
  const variantWaves=[...new Map(codebook.flatMap(c=>c.variantConfiguration?[[c.waveId,{waveId:c.waveId,ordinal:c.ordinal}] as const]:[])).values()]
  const byVariant=new Map<string,SurveyVariantAudit>()
  for(const row of [...attendance,...source])if(row.variant){
    const key=row.researchCode+':'+row.waveId,old=byVariant.get(key)
    if(old&&JSON.stringify(variantAuditValues(old))!==JSON.stringify(variantAuditValues(row)))
      throw new Error('Conflicting variant assignment within one participant Wave')
    byVariant.set(key,row)
  }
  const columns=['research_code',...codebook.flatMap(x=>[x.column,x.column+'__missing']),
    ...variantWaves.flatMap(w=>variantAuditColumns.map(c=>'W'+String(w.ordinal).padStart(3,'0')+'__'+c))]
  if(columns.length>512)throw new Error('Wide format would produce too many columns; use LONG')
  const byCode=new Map<string,Map<string,{value:number|null;missingReason:MissingReason|null}>>()
  for(const entry of attendance)
    if(!byCode.has(entry.researchCode))
      byCode.set(entry.researchCode,new Map())
  for(const {o,column} of decorated.rows){
    const participant=o.researchCode!
    const record=byCode.get(participant)||new Map<string,{value:number|null;missingReason:MissingReason|null}>()
    if(record.has(column))throw new Error('Duplicate project code × wave × measurement result')
    record.set(column,{value:o.missingReason?null:o.value,missingReason:o.missingReason})
    byCode.set(participant,record)
  }
  const participation=new Map(attendance.map(x=>[x.researchCode+':'+x.waveId,x.status]))
  const rows=[...byCode].sort(([a],[b])=>a.localeCompare(b)).map(([code,record])=>
    [code,...codebook.flatMap<string|number|null>(c=>{
      const value=record.get(c.column)
      if(value)return [value.value,value.missingReason??(value.value===null?'SHOWN_MISSING':null)]
      const state=participation.get(code+':'+c.waveId)
      return [null,state==='QUALITY_EXCLUDED'?'QUALITY_EXCLUDED':
        state&&state!=='COMPLETED'?'ABANDONED':'NO_WAVE']
    }),...variantWaves.flatMap(w=>variantAuditValues(byVariant.get(code+':'+w.waveId)??{}))])
  return finalArtifact('WIDE',projectId,columns,rows,source,codebook)
}
