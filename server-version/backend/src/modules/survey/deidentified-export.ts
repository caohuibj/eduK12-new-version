import {createHmac} from 'node:crypto'
import type {SurveySourceProjection} from './analytics.source'
export const DEIDENTIFIED_SURVEY_RESPONSE_TYPES:ReadonlySet<string>=new Set(['SINGLE','MULTIPLE','LIKERT','MATRIX','MATRIX_MULTIPLE','SJT_SINGLE','SJT_MULTIPLE'])
/** Positive allowlist: no object spreads from raw observations, account joins,
 * names, codes, dates, IP/device data, free text, prose, assets or foreign entries.
 * Choice codes are translated to ordinal positions; authored strings never leave. */
export function projectDeidentifiedSurveyPage(source:SurveySourceProjection,salt:string){
 const alias=(kind:string,value:string)=>createHmac('sha256',salt).update(JSON.stringify([source.projectId,kind,value])).digest('hex').slice(0,24)
 const allowed=DEIDENTIFIED_SURVEY_RESPONSE_TYPES
 const raw=[]
 for(const row of source.raw){
  if(row.projectId!==source.projectId||!allowed.has(row.responseType))continue
  const book=source.codebook.find(c=>c.columnKey===row.columnKey&&c.waveId===row.waveId)
  if(!book)continue
  const ordinal=(v:unknown)=>book.options.findIndex(o=>String(o.code)===String(v))+1
  let value:number|number[]|null=null
  if(row.value!==null){
   if(['MULTIPLE','MATRIX_MULTIPLE','SJT_MULTIPLE'].includes(row.responseType)){
    try{const codes=JSON.parse(String(row.value));if(Array.isArray(codes)&&codes.every(c=>ordinal(c)>0))value=codes.map(ordinal)}catch{/* Unsafe/unknown encoding is excluded. */}
   }else{const code=ordinal(row.value);if(code>0)value=code}
  }
  raw.push({subject:alias('subject',row.researchCode??row.attemptId),wave:alias('wave',row.waveId),variable:alias('variable',row.columnKey),
   responseType:row.responseType,value})
 }
 const scores=source.scores.filter(row=>row.projectId===source.projectId).map(row=>({subject:alias('subject',row.researchCode??row.attemptId),wave:alias('wave',row.waveId),
  variable:alias('score',JSON.stringify([row.measurement.instrumentKey,row.measurement.scoreKey])),value:typeof row.value==='number'&&Number.isFinite(row.value)?row.value:null}))
 return {schemaVersion:1,scope:'SURVEY_ONLY',privacy:'PROJECT_LOCAL_PSEUDONYMS_NO_ACCOUNT_OR_FREE_TEXT',
  choiceEncoding:'ONE_BASED_FROZEN_OPTION_ORDER',raw,scores}
}
