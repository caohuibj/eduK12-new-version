import { canonicalHash } from '../assessment-runtime/canonical'
import type { FrozenScoreObservation, MissingReason } from './analytics.cohorts'

/** Pure bounded serialization shared by future scoped streaming export adapter.
 * A caller MUST establish current Project ownership + recent MFA, a real
 * immutable FINAL source, withdrawal filtering, and a stable source watermark.
 */
export interface ResearchExportCodebookRow {
  column:string
  waveId:string
  ordinal:number
  instrumentKey:string
  scoreKey:string
  scoringDigest:string
  responseSignature:string
  unit:string|null
  missingMeanings:Readonly<Record<MissingReason,string>>
}
export interface ResearchExportManifest {
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
const missingMeanings:Record<MissingReason,string>={
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
const columnId=(o:Pick<FrozenScoreColumn,'waveId'|'waveOrdinal'|'measurement'>):string=>
  'W'+String(o.waveOrdinal).padStart(3,'0')+'__'+safeName(o.measurement.instrumentKey)
  +'__'+safeName(o.measurement.scoreKey)+'__'+canonicalHash({
    instrumentKey:o.measurement.instrumentKey,scoreKey:o.measurement.scoreKey,
    scoringDigest:o.measurement.scoringDigest,responseSignature:o.measurement.responseSignature,
    respondentType:o.measurement.respondentType,unit:o.measurement.unit,
  }).slice(0,12)
const codebookFor=(o:Pick<FrozenScoreColumn,'waveId'|'waveOrdinal'|'measurement'>):ResearchExportCodebookRow=>({
  column:columnId(o),waveId:o.waveId,ordinal:o.waveOrdinal,
  instrumentKey:o.measurement.instrumentKey,scoreKey:o.measurement.scoreKey,
  scoringDigest:o.measurement.scoringDigest,responseSignature:o.measurement.responseSignature,
  unit:o.measurement.unit,missingMeanings,
})
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
  attendance:readonly {researchCode:string;waveId:string;status:string}[]=[],
  expectedColumns:readonly FrozenScoreColumn[]=[]):BoundedResearchExport{
  const source=sourceRows(projectId,observations)
  if(expectedColumns.some(column=>column.projectId!==projectId))
    throw new Error('Expected score columns must belong to the authorized project')
  const codes=new Map<string,ResearchExportCodebookRow>()
  for(const column of expectedColumns)codes.set(columnId(column),codebookFor(column))
  const columns=['research_code_or_attempt','wave_id','wave_ordinal','attempt_code',
    'column','instrument_key','score_key','scoring_digest','response_signature',
    'value','missing_reason','source_final_hash']
  const data=source.map(o=>{
    const column=columnId(o)
    codes.set(column,codebookFor(o))
    return [o.researchCode||surveyAttemptCode(o.attemptId),o.waveId,o.waveOrdinal,surveyAttemptCode(o.attemptId),
      column,o.measurement.instrumentKey,o.measurement.scoreKey,
      o.measurement.scoringDigest,o.measurement.responseSignature,
      o.value,o.missingReason,o.sourceFinalHash]
  })
  if(new Set(attendance.map(a=>a.researchCode)).size*expectedColumns.length
    +source.length>10000)
    throw new Error('Score Long exceeds 10000 bounded rows; narrow the Wave selection')
  const present=new Set(source.filter(o=>o.researchCode)
    .map(o=>o.researchCode+':'+columnId(o)))
  const participation=new Map(attendance.map(a=>[a.researchCode+':'+a.waveId,a.status]))
  for(const code of new Set(attendance.map(a=>a.researchCode))){
    for(const expected of expectedColumns){
      const column=columnId(expected)
      if(present.has(code+':'+column))continue
      const status=participation.get(code+':'+expected.waveId)
      if(status==='COMPLETED')continue
      data.push([code,expected.waveId,expected.waveOrdinal,null,
        column,expected.measurement.instrumentKey,expected.measurement.scoreKey,
        expected.measurement.scoringDigest,expected.measurement.responseSignature,
        null,status==='QUALITY_EXCLUDED'?'QUALITY_EXCLUDED':status?'ABANDONED':'NO_WAVE',null])
    }
  }
  return finalArtifact('LONG',projectId,columns,data,source,[...codes.values()])
}
/** WIDE is legitimate ONLY in LINKED_WAVES. Rows with no stable researchCode
 * are rejected rather than synthesizing a false shared identity. */
export function exportWide(projectId:string,observations:readonly FrozenScoreObservation[],
  attendance:readonly {researchCode:string;waveId:string;status:string}[]=[],
  expectedColumns:readonly FrozenScoreColumn[]=[]):BoundedResearchExport{
  const source=sourceRows(projectId,observations)
  if(source.some(o=>!o.researchCode))
    throw new Error('Anonymous SINGLE_UNLINKED answers cannot be widened across waves')
  if(expectedColumns.some(column=>column.projectId!==projectId))
    throw new Error('Expected score columns must belong to the authorized project')
  const mapped=new Map<string,ResearchExportCodebookRow>()
  // Frozen scorer definitions yield columns even if this Wave has zero FINALs.
  for(const column of expectedColumns)mapped.set(columnId(column),codebookFor(column))
  for(const o of source)mapped.set(columnId(o),codebookFor(o))
  const codebook=[...mapped.values()].sort((a,b)=>a.ordinal-b.ordinal||a.column.localeCompare(b.column))
  const columns=['research_code',...codebook.flatMap(x=>[x.column,x.column+'__missing'])]
  if(columns.length>512)throw new Error('Wide format would produce too many columns; use LONG')
  const byCode=new Map<string,Map<string,{value:number|null;missingReason:MissingReason|null}>>()
  for(const entry of attendance)
    if(!byCode.has(entry.researchCode))
      byCode.set(entry.researchCode,new Map())
  for(const o of source){
    const participant=o.researchCode!
    const record=byCode.get(participant)||new Map<string,{value:number|null;missingReason:MissingReason|null}>()
    const column=columnId(o)
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
    })])
  return finalArtifact('WIDE',projectId,columns,rows,source,codebook)
}
