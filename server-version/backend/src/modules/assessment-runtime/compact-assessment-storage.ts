import { encryptControlReference } from './control-reference-codec'
import { sharedControlWritesEnabled } from './shared-control-records'
import { Prisma } from '@prisma/client'
import { prisma } from '../../config/database'
import { safeDecrypt } from '../../utils/encryption'
import { publicTemplatesForDatabase } from './public-templates'
import { encryptCompactField, compactAssessmentStorageEnabled } from './compact-field-codec'
import { decodeAnswerRows, isAnswerRows, unpackWholeRawEnvelope } from './compact-raw'
import { decodeScaleFacts, assertScaleFactsBinding, restoreCompactScaleFacts, prefetchCompactScaleTemplates, SCALE_REPORT_FACTS_VIEW, type ScaleFactsBinding } from './compact-scale-facts'
import { loadScaleFactRecords, isScaleFactsReference, isScaleRawReference, readCommittedScaleFacts, readLoadedScaleFactRecord, attachLoadedScaleFactRecord, type ScaleFactRecord } from './scale-fact-records'
import { decryptUnifiedRuntimePayload, encryptUnifiedRuntimePayload } from './security'
import { parseCanonicalUnitResultEnvelope, type CanonicalUnitResultEnvelopeV1 } from './unit-result'
import type { ScaleAnswer } from '../scale/scale-scoring'

type Db=Pick<Prisma.TransactionClient,'$queryRaw'>
const SOURCE_ROW=Symbol('verified immutable report source row')
const decode=(value:unknown):any=>typeof value==='string'?safeDecrypt<any>(value):value
export const decodeInlineScaleRaw=(value:unknown):any=>{
 const data=decode(value)
 if(isAnswerRows(data))return decodeAnswerRows(data)
 if(data?.kind==='SCALE_RAW_FACTS'){
  if(data.version!==1)throw new Error('Unsupported scale raw facts version')
  return {schemaVersion:1,answers:decodeAnswerRows(data.answers),...(data.deviceInputProvenance?{deviceInputProvenance:data.deviceInputProvenance}:{})}
 }
 return data
}
// Compatible reader for the first draft encoding; new writes use the immutable fact row.
export const makeWholeScaleRawReference=(input:{id:string;compositeAttemptId:string;attemptEpoch:number}):string=>encryptCompactField({kind:'WHOLE_SCALE_RAW_REF',version:1,parentId:input.compositeAttemptId,attemptEpoch:input.attemptEpoch,assessmentId:input.id})
const assertRecord=(row:ScaleFactRecord,record:any):void=>{
 if(!record?.id||record.id!==row.id||(record.attemptEpoch!==undefined&&record.attemptEpoch!==row.attemptEpoch)
  ||(record.submissionId!==undefined&&record.submissionId!==row.submissionId)
  ||(record.submissionPayloadHash!==undefined&&record.submissionPayloadHash!==row.submissionPayloadHash))throw new Error('Fact ownership/version binding mismatch')
}
const loadFact=(id:string,epoch:number,db:Db,withRaw=false)=>loadScaleFactRecords([{id,attemptEpoch:epoch}],db,withRaw).then(rows=>{if(rows.length!==1)throw new Error('Immutable result fact unavailable');return rows[0]})
const resolveRawFact=async(row:ScaleFactRecord,db:Db):Promise<any>=>{
 if(!row.rawReceiptAttemptId){
  const source=row.rawAnswersEncrypted?row:await loadFact(row.id,row.attemptEpoch,db,true)
  if(!source.rawAnswersEncrypted)throw new Error('Original scale raw facts unavailable')
  return decodeInlineScaleRaw(source.rawAnswersEncrypted)
 }
 const rows=await db.$queryRaw<Array<{encrypted:string;payloadHash:string;attemptId:string;attemptEpoch:number}>>`SELECT whole_answers_encrypted AS encrypted,
  whole_payload_hash AS "payloadHash",attempt_id AS "attemptId",attempt_epoch AS "attemptEpoch" FROM composite_report_jobs
  WHERE attempt_id=${row.rawReceiptAttemptId} AND attempt_epoch=${row.attemptEpoch} AND whole_submission_id IS NOT NULL AND whole_answers_encrypted IS NOT NULL AND whole_accepted_at IS NOT NULL`
 if(rows.length!==1)throw new Error('Original whole raw facts unavailable')
 const stored=rows[0],body=unpackWholeRawEnvelope<any>(decryptUnifiedRuntimePayload(stored.encrypted))
 if(body?.schemaVersion!==1||body.binding?.attemptId!==stored.attemptId||body.binding?.attemptEpoch!==stored.attemptEpoch||body.payloadHash!==stored.payloadHash||!Array.isArray(body.units))throw new Error('Original whole raw binding mismatch')
 const units=body.units.filter((unit:any)=>unit.assessmentId===row.id)
 if(units.length!==1||units[0].attemptEpoch!==row.attemptEpoch||units[0].submissionId!==row.submissionId)throw new Error('Original raw unit binding mismatch')
 return {schemaVersion:1,answers:units[0].answers,...(units[0].deviceInputProvenance?{deviceInputProvenance:units[0].deviceInputProvenance}:{})}
}
export const resolveStoredScaleAnswers=async(value:unknown,record?:any,db:Db=prisma):Promise<unknown>=>{
 const raw=decodeInlineScaleRaw(value)
 if(isScaleRawReference(raw)){
  if(!record?.id||(record.attemptEpoch!==undefined&&record.attemptEpoch!==raw.e))throw new Error('Raw reference requires the authorized unit and epoch')
  const row=await loadFact(record.id,raw.e,db,true);assertRecord(row,record);return resolveRawFact(row,db)
 }
 if(raw?.kind!=='WHOLE_SCALE_RAW_REF')return raw
 if(raw.version!==1||!record?.id||record.id!==raw.assessmentId||(record.attemptEpoch!==undefined&&record.attemptEpoch!==raw.attemptEpoch))throw new Error('Raw ownership/version mismatch')
 // Draft-format fallback, retained independently of the write feature flag.
 const rows=await db.$queryRaw<Array<any>>`SELECT a.id,a.attempt_epoch AS "attemptEpoch",a.submission_id AS "submissionId",a.submission_payload_hash AS "submissionPayloadHash"
  FROM assessments a WHERE a.id=${raw.assessmentId} AND a.composite_attempt_id=${raw.parentId} AND a.attempt_epoch=${raw.attemptEpoch}`
 if(rows.length!==1)throw new Error('Original raw unit unavailable')
 return resolveRawFact({...rows[0],rawReceiptAttemptId:raw.parentId} as ScaleFactRecord,db)
}
export const getScaleReportSourceRow=(result:any):ScaleFactRecord|null=>result?.[SOURCE_ROW]??null
export const preloadStoredScaleResults=async(records:any[],db:Db=prisma):Promise<void>=>{
 const missing=records.filter(row=>isScaleFactsReference(row.result)&&!readLoadedScaleFactRecord(row))
 if(missing.length){
  const rows=await loadScaleFactRecords(missing.map(row=>({id:row.id,attemptEpoch:row.result.e})),db)
  const byId=new Map(rows.map(row=>[row.id+'/'+row.attemptEpoch,row]))
  for(const record of missing){const row=byId.get(record.id+'/'+record.result.e);if(!row)throw new Error('Immutable result fact missing');assertRecord(row,record);attachLoadedScaleFactRecord(record,row)}
 }
 const bodies=records.flatMap(record=>{if(readCommittedScaleFacts(record))return [];const row=readLoadedScaleFactRecord(record);const facts=row?decodeScaleFacts(row.factsEncrypted):decodeScaleFacts(record.result);return facts?[facts]:[]})
 await prefetchCompactScaleTemplates(bodies,publicTemplatesForDatabase(db))
}
export const resolveStoredScaleResult=async(value:unknown,options:{record?:any;full?:boolean;db?:Db}={}):Promise<any>=>{
 const db=options.db??prisma;let row:ScaleFactRecord|undefined
 if(isScaleFactsReference(value)){
  if(!options.record?.id||(options.record.attemptEpoch!==undefined&&options.record.attemptEpoch!==value.e))throw new Error('Result reference requires the authorized unit and epoch')
  row=readLoadedScaleFactRecord(options.record)??await loadFact(options.record.id,value.e,db,options.full)
  assertRecord(row,options.record)
  const committed=readCommittedScaleFacts(options.record)
  if(committed&&!options.full){const result={...committed.result};Object.defineProperty(result,SCALE_REPORT_FACTS_VIEW,{value:true});Object.defineProperty(result,SOURCE_ROW,{value:row});return result}
 }
 const facts=decodeScaleFacts(row?.factsEncrypted??value)
 if(!facts)return value
 if(options.record)assertScaleFactsBinding(facts,options.record)
 if(row&&(facts.sourceResultHash!==row.sourceResultHash||facts.binding.assessmentId!==row.id||facts.binding.attemptEpoch!==row.attemptEpoch))throw new Error('Immutable fact body binding mismatch')
 let answers:ScaleAnswer[]|undefined
 if(options.full){
  if(!row){const rows=await db.$queryRaw<Array<any>>`SELECT id,attempt_epoch AS "attemptEpoch",submission_id AS "submissionId",submission_payload_hash AS "submissionPayloadHash",composite_attempt_id AS "compositeAttemptId",answers FROM assessments WHERE id=${facts.binding.assessmentId}`;if(rows.length!==1)throw new Error('Original scale record unavailable');assertScaleFactsBinding(facts,rows[0]);const raw=await resolveStoredScaleAnswers(rows[0].answers,rows[0],db);answers=(Array.isArray(raw)?raw:(raw as any)?.answers)}
  else {const raw=await resolveRawFact(row,db);answers=Array.isArray(raw)?raw:raw?.answers}
  if(!Array.isArray(answers))throw new Error('Original raw answers unavailable')
 }
 const result=(await restoreCompactScaleFacts(facts,{full:options.full,answers,canonical:false},publicTemplatesForDatabase(db))).result
 if(row)Object.defineProperty(result,SOURCE_ROW,{value:row})
 return result
}
export const makeCanonicalFactsReference=(binding:ScaleFactsBinding,_resultHash:string):string=>(sharedControlWritesEnabled()?encryptControlReference:encryptUnifiedRuntimePayload)({k:'SCF2',a:binding.assessmentId,e:binding.attemptEpoch})
export const loadStoredCanonicalUnitResults=async(encryptedValues:string[],db:Db=prisma,committedRecords:any[]=[]):Promise<CanonicalUnitResultEnvelopeV1[]>=>{
 const values=encryptedValues.map(value=>decryptUnifiedRuntimePayload<any>(value))
 const refs=values.filter(value=>value?.k==='SCF2'||value?.kind==='SCALE_FACTS_CANONICAL_REF')
 const identity=(ref:any)=>ref.k==='SCF2'?{id:ref.a,attemptEpoch:ref.e}:{id:ref.binding?.assessmentId,attemptEpoch:ref.binding?.attemptEpoch}
 for(const ref of refs){const x=identity(ref);if(typeof x.id!=='string'||!x.id||!Number.isSafeInteger(x.attemptEpoch)||x.attemptEpoch<1||(ref.kind&&ref.version!==1))throw new Error('Invalid canonical fact reference')}
 const known=new Map<string,{row:ScaleFactRecord;canonical?:CanonicalUnitResultEnvelopeV1|null}>()
 for(const record of committedRecords){const context=readCommittedScaleFacts(record);if(context)known.set(context.row.id+'/'+context.row.attemptEpoch,{row:context.row,canonical:context.canonical})}
 const missing=refs.map(identity).filter(x=>!known.has(x.id+'/'+x.attemptEpoch))
 for(const row of await loadScaleFactRecords(missing,db))known.set(row.id+'/'+row.attemptEpoch,{row})
 const factsById=new Map<string,ReturnType<typeof decodeScaleFacts>>()
 for(const [id,item]of known){if(item.canonical)continue;const facts=decodeScaleFacts(item.row.factsEncrypted);if(!facts)throw new Error('Canonical fact body unavailable');assertScaleFactsBinding(facts,item.row);if(facts.sourceResultHash!==item.row.sourceResultHash)throw new Error('Canonical source digest mismatch');factsById.set(id,facts)}
 await prefetchCompactScaleTemplates([...factsById.values()].filter((v):v is NonNullable<typeof v>=>Boolean(v)),publicTemplatesForDatabase(db))
 const output:CanonicalUnitResultEnvelopeV1[]=[]
 for(const value of values){
  if(value?.k!=='SCF2'&&value?.kind!=='SCALE_FACTS_CANONICAL_REF'){output.push(parseCanonicalUnitResultEnvelope(value));continue}
  const x=identity(value),id=x.id+'/'+x.attemptEpoch,item=known.get(id);if(!item)throw new Error('Canonical fact version missing')
  if(value.binding){const f=factsById.get(id)??decodeScaleFacts(item.row.factsEncrypted);if(!f)throw new Error('Canonical draft fact unavailable');assertScaleFactsBinding(f,{id:x.id,attemptEpoch:x.attemptEpoch,submissionId:value.binding.submissionId,submissionPayloadHash:value.binding.payloadHash})}
  if(!item.canonical){const facts=factsById.get(id);if(!facts)throw new Error('Canonical fact source unavailable');item.canonical=(await restoreCompactScaleFacts(facts,{},publicTemplatesForDatabase(db))).canonical}
  if(!item.canonical||item.canonical.resultHash!==item.row.canonicalResultHash||(value.resultHash&&item.canonical.resultHash!==value.resultHash))throw new Error('Canonical result hash mismatch')
  output.push(item.canonical)
 }
 return output
}
export const loadStoredCanonicalUnitResult=async(value:string,db:Db=prisma)=>(await loadStoredCanonicalUnitResults([value],db))[0]
export const compactStorageWritesEnabled=compactAssessmentStorageEnabled
