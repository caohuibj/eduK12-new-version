import { canonicalHash } from '../assessment-runtime/canonical'
import { protectCsvCell,tableToCsv } from './analytics.export-format'
import type { SurveySourceProjection,ResearchRawObservation,ResearchRawCodebook } from './analytics.source'

export type SurveyRawFormat='WAVE'|'RAW_LONG'|'RAW_WIDE'
export interface SurveyRawExport {
  csv:string
  codebook:ResearchRawCodebook[]
  manifest:{
    schemaVersion:1;format:SurveyRawFormat;projectId:string;waveIds:string[];
    sourceDigest:string;codebookDigest:string;rowCount:number;
    columnCount:number;cutOff:string;dataDigest:string
    formulaGuard:'EXCEL_APOSTROPHE_PREFIX'
  }
}
const attemptCode=(uuid:string)=>'A-'+canonicalHash(uuid).slice(0,20).toUpperCase()
const check=(projectId:string,source:SurveySourceProjection)=>{
  if(source.projectId!==projectId||
    source.raw.some(x=>x.projectId!==projectId||x.sourceVerified!==true))
    throw new Error('Raw export must use verified scoped Survey FINAL')
}
const displayCode=(row:ResearchRawObservation)=>row.researchCode||attemptCode(row.attemptId)
const ordered=(source:SurveySourceProjection,waveId?:string):ResearchRawObservation[]=>
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
  return {csv,codebook,manifest:{
    schemaVersion:1,format,projectId,waveIds:waves,cutOff:source.cutOff,
    sourceDigest:canonicalHash(rows.map((row,i)=>({
      // Bound the source fingerprint to this exact set, without copying secrets.
      index:i,content:row,
    }))),
    codebookDigest:canonicalHash(codebook),
    rowCount:rows.length,columnCount:columns.length,
    dataDigest:canonicalHash(csv),formulaGuard:'EXCEL_APOSTROPHE_PREFIX',
  }}
}
export function rawLongExport(projectId:string,source:SurveySourceProjection,waveId?:string):SurveyRawExport{
  check(projectId,source)
  const rows=ordered(source,waveId)
  const cols=['research_code_or_attempt','wave_id','wave_ordinal','publication_version',
    'instrument_key','item_key','variable_code','value','missing_reason','source_final_hash']
  const mapped=rows.map(r=>[
    displayCode(r),r.waveId,r.waveOrdinal,r.publicationVersion,r.instrumentKey,r.itemKey,r.columnKey,
    r.value,r.missingReason,r.sourceFinalHash,
  ])
  const keys=new Set(rows.map(r=>r.columnKey))
  return prepare(projectId,source,waveId?'WAVE':'RAW_LONG',cols,mapped,
    source.codebook.filter(c=>keys.has(c.columnKey)))
}
export function rawWideExport(projectId:string,source:SurveySourceProjection):SurveyRawExport{
  check(projectId,source)
  if(source.collectionMode!=='LINKED_WAVES'||source.raw.some(r=>!r.researchCode))
    throw new Error('RAW_WIDE requires project-local pseudonymous Linked Waves')
  const rows=ordered(source)
  const byColumn=new Map(source.codebook.map(x=>[x.columnKey,x]))
  // The frozen publication codebook includes variables from Waves with zero
  // completed FINAL; deriving columns only from observed answers drops those Waves.
  const columnIds=[...byColumn.keys()].sort()
  if(columnIds.length>255)throw new Error('Wide export exceeds 255 value/absence pairs; use Raw Long')
  const byCode=new Map<string,Map<string,{value:string|number|null;missingReason:string|null}>>()
  const attendance=new Map(source.attendance.map(x=>[x.researchCode+':'+x.waveId,x.status]))
  // A participant who started but has no FINAL must remain represented as
  // ABANDONED, not vanish from the cohort's research-code rows.
  for(const entry of source.attendance)
    if(!byCode.has(entry.researchCode))
      byCode.set(entry.researchCode,new Map())
  for(const r of rows){
    const participant=r.researchCode!
    const values=byCode.get(participant)||new Map<string,{value:string|number|null;missingReason:string|null}>()
    if(values.has(r.columnKey))throw new Error('Duplicate participant/wave/variable in frozen FINAL')
    values.set(r.columnKey,{value:r.missingReason?null:r.value,missingReason:r.missingReason})
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
      return [null,status&&status!=='COMPLETED'?'ABANDONED':'NO_WAVE']
    })])
  const wideHeaders=['research_code',...columnIds.flatMap(col=>[col,col+'__missing'])]
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
