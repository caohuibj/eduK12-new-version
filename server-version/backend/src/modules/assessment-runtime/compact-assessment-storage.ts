import { encryptControlReference } from './control-reference-codec'
import { sharedControlWritesEnabled } from './shared-control-records'
import { Prisma } from '@prisma/client'
import { prisma } from '../../config/database'
import { safeDecrypt } from '../../utils/encryption'
import { publicTemplatesForDatabase } from './public-templates'
import { encryptCompactField, compactAssessmentStorageEnabled } from './compact-field-codec'
import { decodeAnswerRows, isAnswerRows, unpackWholeRawEnvelope } from './compact-raw'
import { decodeScaleFacts, assertScaleFactsBinding, restoreCompactScaleFacts, prefetchCompactScaleTemplates, SCALE_REPORT_FACTS_VIEW, type ScaleFactsBinding } from './compact-scale-facts'
import { loadScaleFactRecords, loadScaleFactRecordSizes, storedScaleFieldSizeSql, isScaleFactsReference, isScaleRawReference, readCommittedScaleFacts, readLoadedScaleFactRecord, attachLoadedScaleFactRecord, type ScaleFactRecord, type ScaleFactRecordSize } from './scale-fact-records'
import { decryptUnifiedRuntimePayload, encryptUnifiedRuntimePayload } from './security'
import { parseCanonicalUnitResultEnvelope, type CanonicalUnitResultEnvelopeV1 } from './unit-result'
import type { ScaleAnswer } from '../scale/scale-scoring'

type Db=Pick<Prisma.TransactionClient,'$queryRaw'>
const SOURCE_ROW=Symbol('verified immutable report source row')
const EXPORT_READ=Symbol('bounded request-local scale export read')
type WholeRawRow={encrypted:string;payloadHash:string;attemptId:string;attemptEpoch:number}
type ExportReadContext={facts:Map<string,ScaleFactRecord|null>;receipts:Map<string,WholeRawRow|null>;bodies:Map<string,{body?:any;error?:unknown}>}
const identityKey=(id:string,epoch:number)=>JSON.stringify([id,epoch])
const exportContext=(record:any):ExportReadContext|undefined=>record?.[EXPORT_READ]
const cachedFact=(record:any,epoch:number):ScaleFactRecord|undefined=>{
 const facts=exportContext(record)?.facts,key=identityKey(record.id,epoch)
 if(!facts?.has(key))return undefined
 const row=facts.get(key);if(!row)throw new Error('Immutable result fact unavailable')
 return row
}
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
const assertRecord=(row:Pick<ScaleFactRecord,'id'|'attemptEpoch'|'submissionId'|'submissionPayloadHash'>,record:any):void=>{
 if(!record?.id||record.id!==row.id||(record.attemptEpoch!==undefined&&record.attemptEpoch!==row.attemptEpoch)
  ||(record.submissionId!==undefined&&record.submissionId!==row.submissionId)
  ||(record.submissionPayloadHash!==undefined&&record.submissionPayloadHash!==row.submissionPayloadHash))throw new Error('Fact ownership/version binding mismatch')
}
const loadFact=(id:string,epoch:number,db:Db,withRaw=false)=>loadScaleFactRecords([{id,attemptEpoch:epoch}],db,withRaw).then(rows=>{if(rows.length!==1)throw new Error('Immutable result fact unavailable');return rows[0]})
const resolveRawFact=async(row:ScaleFactRecord,db:Db,record?:any):Promise<any>=>{
 const context=exportContext(record)
 if(!row.rawReceiptAttemptId){
  const source=row.rawAnswersEncrypted||context?.facts.get(identityKey(row.id,row.attemptEpoch))===row?row:await loadFact(row.id,row.attemptEpoch,db,true)
  if(!source.rawAnswersEncrypted)throw new Error('Original scale raw facts unavailable')
  return decodeInlineScaleRaw(source.rawAnswersEncrypted)
 }
 const key=identityKey(row.rawReceiptAttemptId,row.attemptEpoch)
 const plannedReceipt=context?.receipts.has(key)===true
 const rows=plannedReceipt?[context!.receipts.get(key)].filter((value):value is WholeRawRow=>Boolean(value)):
  await db.$queryRaw<WholeRawRow[]>`SELECT whole_answers_encrypted AS encrypted,
  whole_payload_hash AS "payloadHash",attempt_id AS "attemptId",attempt_epoch AS "attemptEpoch" FROM composite_report_jobs
  WHERE attempt_id=${row.rawReceiptAttemptId} AND attempt_epoch=${row.attemptEpoch} AND whole_submission_id IS NOT NULL AND whole_answers_encrypted IS NOT NULL AND whole_accepted_at IS NOT NULL`
 if(rows.length!==1)throw new Error('Original whole raw facts unavailable')
 const stored=rows[0]
 if(stored.attemptId!==row.rawReceiptAttemptId||stored.attemptEpoch!==row.attemptEpoch)throw new Error('Original whole raw binding mismatch')
 // A legacy fallback can share the record context without being budgeted.
 // Keep its decrypted body per-call unless the receipt was explicitly planned.
 let parsed=plannedReceipt?context!.bodies.get(key):undefined
 if(!parsed){
  try{
   const body=unpackWholeRawEnvelope<any>(decryptUnifiedRuntimePayload(stored.encrypted))
   if(body?.schemaVersion!==1||body.binding?.attemptId!==stored.attemptId||body.binding?.attemptEpoch!==stored.attemptEpoch||body.payloadHash!==stored.payloadHash||!Array.isArray(body.units))throw new Error('Original whole raw binding mismatch')
   parsed={body}
  }catch(error){parsed={error}}
  if(plannedReceipt)context!.bodies.set(key,parsed)
 }
 if('error'in parsed)throw parsed.error
 const body=parsed.body
 const units=body.units.filter((unit:any)=>unit.assessmentId===row.id)
 if(units.length!==1||units[0].attemptEpoch!==row.attemptEpoch||units[0].submissionId!==row.submissionId)throw new Error('Original raw unit binding mismatch')
 return {schemaVersion:1,answers:units[0].answers,...(units[0].deviceInputProvenance?{deviceInputProvenance:units[0].deviceInputProvenance}:{})}
}
export const resolveStoredScaleAnswers=async(value:unknown,record?:any,db:Db=prisma):Promise<unknown>=>{
 const raw=decodeInlineScaleRaw(value)
 if(isScaleRawReference(raw)){
  if(!record?.id||(record.attemptEpoch!==undefined&&record.attemptEpoch!==raw.e))throw new Error('Raw reference requires the authorized unit and epoch')
  const row=cachedFact(record,raw.e)??await loadFact(record.id,raw.e,db,true);assertRecord(row,record);return resolveRawFact(row,db,record)
 }
 if(raw?.kind!=='WHOLE_SCALE_RAW_REF')return raw
 if(raw.version!==1||!record?.id||record.id!==raw.assessmentId||(record.attemptEpoch!==undefined&&record.attemptEpoch!==raw.attemptEpoch))throw new Error('Raw ownership/version mismatch')
 // Draft-format fallback, retained independently of the write feature flag.
 const rows=await db.$queryRaw<Array<any>>`SELECT a.id,a.attempt_epoch AS "attemptEpoch",a.submission_id AS "submissionId",a.submission_payload_hash AS "submissionPayloadHash"
  FROM assessments a WHERE a.id=${raw.assessmentId} AND a.composite_attempt_id=${raw.parentId} AND a.attempt_epoch=${raw.attemptEpoch}`
 if(rows.length!==1)throw new Error('Original raw unit unavailable')
 return resolveRawFact({...rows[0],rawReceiptAttemptId:raw.parentId} as ScaleFactRecord,db,record)
}
export const getScaleReportSourceRow=(result:any):ScaleFactRecord|null=>result?.[SOURCE_ROW]??null
type StoredScaleRead = {row?:ScaleFactRecord;facts:ReturnType<typeof decodeScaleFacts>}
export type StoredScaleFactsReader = {
 read:(record:any,db:Db)=>StoredScaleRead
 find:(id:string,epoch:number,db:Db)=>StoredScaleRead|undefined
}
const recordIdentity=(record:any)=>JSON.stringify([record.id,record.attemptEpoch,record.submissionId,record.submissionPayloadHash,record.result])
const factIdentity=(row:ScaleFactRecord)=>JSON.stringify([row.id,row.attemptEpoch,row.submissionId,row.submissionPayloadHash,
 row.factsEncrypted,row.sourceResultHash,row.canonicalResultHash,row.completedAt,row.totalTime])
/** Invocation-local decoded facts, not committed write evidence. Views remain
 * independent: canonical/full consumers still run their own reconstruction. */
export const createStoredScaleFactsReader=async(records:any[],db:Db=prisma,strictRows=false):Promise<StoredScaleFactsReader>=>{
 const pins=new Map(records.map(record=>[record,recordIdentity(record)]))
 const references=records.filter(record=>isScaleFactsReference(record.result))
 const missing=strictRows?references:references.filter(record=>!readLoadedScaleFactRecord(record))
 const loaded=missing.length?await loadScaleFactRecords(missing.map(record=>({id:record.id,attemptEpoch:record.result.e})),db):[]
 const byId=new Map(loaded.map(row=>[identityKey(row.id,row.attemptEpoch),row]))
 if(strictRows&&(byId.size!==loaded.length||loaded.length!==references.length))throw new Error('Report batch immutable sources incomplete')
 const entries=new Map<any,{row?:ScaleFactRecord;rowPin?:string;decoded?:StoredScaleRead}>(),sources=new Map<string,any>()
 for(const record of records){
  if(pins.get(record)!==recordIdentity(record))throw new Error('Scale read identity changed')
  let row:ScaleFactRecord|undefined
  if(isScaleFactsReference(record.result)){
   row=byId.get(identityKey(record.id,record.result.e))??(!strictRows?readLoadedScaleFactRecord(record)??undefined:undefined)
   if(!row)throw new Error('Immutable result fact missing')
   assertRecord(row,record)
   attachLoadedScaleFactRecord(record,row)
   sources.set(identityKey(row.id,row.attemptEpoch),record)
  }
  entries.set(record,{row,rowPin:row?factIdentity(row):undefined})
 }
 const read=(record:any,current:Db):StoredScaleRead=>{
  const entry=entries.get(record)
  if(current!==db||!entry||pins.get(record)!==recordIdentity(record)
    ||(entry.row&&entry.rowPin!==factIdentity(entry.row)))throw new Error('Scale read identity changed')
  return entry.decoded??(entry.decoded={row:entry.row,facts:decodeScaleFacts(entry.row?.factsEncrypted??record.result)})
 }
 return {read,find:(id,epoch,current)=>{
  if(current!==db)throw new Error('Scale read transaction changed')
  const record=sources.get(identityKey(id,epoch));return record?read(record,current):undefined
 }}
}
export const preloadStoredScaleResults=async(records:any[],db:Db=prisma):Promise<StoredScaleFactsReader>=>{
 const reader=await createStoredScaleFactsReader(records,db)
 const bodies=records.flatMap(record=>{if(readCommittedScaleFacts(record))return [];const facts=reader.read(record,db).facts;return facts?[facts]:[]})
 await prefetchCompactScaleTemplates(bodies,publicTemplatesForDatabase(db))
 return reader
}

const EXPORT_BATCH_ROWS=64
const EXPORT_BATCH_BYTES=1024*1024
/** Only call with the already-authorized Scale records, in their projection order.
 * No ciphertext is fetched before metadata planning. Oversize and failed batches
 * retain the ordinary per-row path; they are never rejected by this optimization.
 */
export const createStoredScaleExportReader=(records:readonly any[],db:Db=prisma):{prepare:(record:any)=>Promise<void>;close:()=>Promise<void>}=>{
 type Identity={id:string;attemptEpoch:number}
 type Plan={record:any;facts:Identity[];rawFacts:Identity[];receipts:Identity[]}
 const valid=(id:unknown,epoch:unknown):boolean=>typeof id==='string'&&!!id&&Number.isSafeInteger(epoch)&&Number(epoch)>0
 const unique=(values:Identity[])=>[...new Map(values.map(value=>[identityKey(value.id,value.attemptEpoch),value])).values()]
 const plan=(record:any):Plan=>{
  const facts:Identity[]=[],rawFacts:Identity[]=[],receipts:Identity[]=[]
  if(isScaleFactsReference(record?.result)&&valid(record?.id,record.result.e)&&(record.attemptEpoch===undefined||record.attemptEpoch===record.result.e))facts.push({id:record.id,attemptEpoch:record.result.e})
  // Never decrypt legacy raw strings before the byte budget is established.
  // String references and draft-only WHOLE ownership remain on the per-row path.
  const raw=record?.answers
  if(isScaleRawReference(raw)&&valid(record?.id,raw.e)&&(record.attemptEpoch===undefined||record.attemptEpoch===raw.e)){const identity={id:record.id,attemptEpoch:raw.e};facts.push(identity);rawFacts.push(identity)}
  return {record,facts:unique(facts),rawFacts,receipts}
 }
 const batches=async function*():AsyncGenerator<any[]>{
  for(let offset=0;offset<records.length;offset+=EXPORT_BATCH_ROWS){
   const window=records.slice(offset,offset+EXPORT_BATCH_ROWS),plans=window.map(plan)
   const sizes=new Map<string,number>(),factReceipts=new Map<string,ScaleFactRecordSize>()
   let planned=true
   try{
    for(const row of await loadScaleFactRecordSizes(unique(plans.flatMap(value=>value.facts)),db)){
     const key=identityKey(row.id,row.attemptEpoch);sizes.set('f'+key,Number(row.sizeBytes))
     if(row.rawReceiptAttemptId)factReceipts.set(key,row)
    }
    for(const value of plans)value.receipts=unique(value.rawFacts.flatMap(fact=>{
     const row=factReceipts.get(identityKey(fact.id,fact.attemptEpoch));if(!row?.rawReceiptAttemptId)return []
     // Match the ordinary raw reader's ownership gate before fetching a receipt.
     try{assertRecord(row,value.record)}catch{return []}
     return [{id:row.rawReceiptAttemptId,attemptEpoch:row.attemptEpoch}]
    }))
    const receipts=unique(plans.flatMap(value=>value.receipts))
    if(receipts.length){
     const rows=await db.$queryRaw<Array<{attemptId:string;attemptEpoch:number;sizeBytes:bigint|number}>>`SELECT attempt_id AS "attemptId",attempt_epoch AS "attemptEpoch",
      (${storedScaleFieldSizeSql(Prisma.sql`whole_answers_encrypted`)}) AS "sizeBytes" FROM composite_report_jobs
      WHERE (attempt_id,attempt_epoch) IN (${Prisma.join(receipts.map(value=>Prisma.sql`(${value.id},${value.attemptEpoch})`))})
      AND whole_submission_id IS NOT NULL AND whole_answers_encrypted IS NOT NULL AND whole_accepted_at IS NOT NULL`
     for(const row of rows)sizes.set('r'+identityKey(row.attemptId,row.attemptEpoch),Number(row.sizeBytes))
    }
   }catch{planned=false}
   if(!planned){yield window;continue}
   let start=0
   while(start<plans.length){
    const keys=new Set<string>();let bytes=0,end=start,oversize=false
    for(;end<plans.length;end++){
     const value=plans[end],added=[...value.facts.map(x=>'f'+identityKey(x.id,x.attemptEpoch)),...value.receipts.map(x=>'r'+identityKey(x.id,x.attemptEpoch))].filter(key=>!keys.has(key))
     const extra=added.reduce((sum,key)=>sum+(sizes.get(key)??0),0)
     if(!Number.isSafeInteger(extra)||extra<0||bytes+extra>EXPORT_BATCH_BYTES){if(end===start){end++;oversize=true}break}
     bytes+=extra;for(const key of added)keys.add(key)
    }
    const selected=plans.slice(start,end),batch=selected.map(value=>value.record);start=end
    if(oversize){yield batch;continue}
    const context:ExportReadContext={facts:new Map(),receipts:new Map(),bodies:new Map()}
    let loaded=true
    try{
     const identities=unique(selected.flatMap(value=>value.facts))
     for(const value of identities)context.facts.set(identityKey(value.id,value.attemptEpoch),null)
     const duplicateFacts=new Set<string>()
     for(const row of await loadScaleFactRecords(identities,db,true)){
      const key=identityKey(row.id,row.attemptEpoch)
      if(context.facts.has(key)){if(duplicateFacts.has(key))context.facts.set(key,null);else context.facts.set(key,row);duplicateFacts.add(key)}
     }
     const receipts=unique(selected.flatMap(value=>value.receipts))
     for(const value of receipts)context.receipts.set(identityKey(value.id,value.attemptEpoch),null)
     if(receipts.length){
      const rows=await db.$queryRaw<WholeRawRow[]>`SELECT whole_answers_encrypted AS encrypted,whole_payload_hash AS "payloadHash",
       attempt_id AS "attemptId",attempt_epoch AS "attemptEpoch" FROM composite_report_jobs
       WHERE (attempt_id,attempt_epoch) IN (${Prisma.join(receipts.map(value=>Prisma.sql`(${value.id},${value.attemptEpoch})`))})
       AND whole_submission_id IS NOT NULL AND whole_answers_encrypted IS NOT NULL AND whole_accepted_at IS NOT NULL`
      const seen=new Set<string>()
      for(const row of rows){const key=identityKey(row.attemptId,row.attemptEpoch);if(context.receipts.has(key)){context.receipts.set(key,seen.has(key)?null:row);seen.add(key)}}
     }
    }catch{loaded=false}
    const previous=new Map<object,PropertyDescriptor|undefined>()
    try{
     if(loaded)for(const record of batch)if(record&&typeof record==='object'&&Object.isExtensible(record)&&!previous.has(record)){
      previous.set(record,Object.getOwnPropertyDescriptor(record,EXPORT_READ))
      Object.defineProperty(record,EXPORT_READ,{value:context,enumerable:false,configurable:true})
     }
     yield batch
    }finally{
     for(const [record,descriptor]of previous)if(exportContext(record)===context){if(descriptor)Object.defineProperty(record,EXPORT_READ,descriptor);else delete (record as any)[EXPORT_READ]}
     context.facts.clear();context.receipts.clear();context.bodies.clear()
    }
   }
  }
 }
 const iterator=batches(),authorized=new Set(records),visited=new Set<any>()
 let active=new Set<any>(),closed=false
 return {
  prepare:async record=>{
   if(closed||active.has(record)||visited.has(record)||!authorized.has(record))return
   while(!closed){
    const next=await iterator.next();active=new Set(next.value??[])
    if(next.done){closed=true;return}
    for(const value of active)visited.add(value)
    if(active.has(record))return
   }
  },
  close:async()=>{closed=true;active.clear();visited.clear();authorized.clear();await iterator.return(undefined)},
 }
}

export const resolveStoredScaleResult=async(value:unknown,options:{record?:any;full?:boolean;db?:Db;reader?:StoredScaleFactsReader}={}):Promise<any>=>{
 const db=options.db??prisma;let row:ScaleFactRecord|undefined
 const cached=options.reader?.read(options.record,db)
 if(isScaleFactsReference(value)){
  if(!options.record?.id||(options.record.attemptEpoch!==undefined&&options.record.attemptEpoch!==value.e))throw new Error('Result reference requires the authorized unit and epoch')
  row=cached?.row??cachedFact(options.record,value.e)??readLoadedScaleFactRecord(options.record)??await loadFact(options.record.id,value.e,db,options.full)
  assertRecord(row,options.record)
  const committed=readCommittedScaleFacts(options.record)
  if(committed&&!options.full){const result={...committed.result};Object.defineProperty(result,SCALE_REPORT_FACTS_VIEW,{value:true});Object.defineProperty(result,SOURCE_ROW,{value:row});return result}
 }
 const facts=cached?cached.facts:decodeScaleFacts(row?.factsEncrypted??value)
 if(!facts)return value
 if(options.record)assertScaleFactsBinding(facts,options.record)
 if(row&&(facts.sourceResultHash!==row.sourceResultHash||facts.binding.assessmentId!==row.id||facts.binding.attemptEpoch!==row.attemptEpoch))throw new Error('Immutable fact body binding mismatch')
 let answers:ScaleAnswer[]|undefined
 if(options.full){
  if(!row){const rows=await db.$queryRaw<Array<any>>`SELECT id,attempt_epoch AS "attemptEpoch",submission_id AS "submissionId",submission_payload_hash AS "submissionPayloadHash",composite_attempt_id AS "compositeAttemptId",answers FROM assessments WHERE id=${facts.binding.assessmentId}`;if(rows.length!==1)throw new Error('Original scale record unavailable');assertScaleFactsBinding(facts,rows[0]);const raw=await resolveStoredScaleAnswers(rows[0].answers,rows[0],db);answers=(Array.isArray(raw)?raw:(raw as any)?.answers)}
  else {const raw=await resolveRawFact(row,db,options.record);answers=Array.isArray(raw)?raw:raw?.answers}
  if(!Array.isArray(answers))throw new Error('Original raw answers unavailable')
 }
 const result=(await restoreCompactScaleFacts(facts,{full:options.full,answers,canonical:false},publicTemplatesForDatabase(db))).result
 if(row)Object.defineProperty(result,SOURCE_ROW,{value:row})
 return result
}
export const makeCanonicalFactsReference=(binding:ScaleFactsBinding,_resultHash:string):string=>(sharedControlWritesEnabled()?encryptControlReference:encryptUnifiedRuntimePayload)({k:'SCF2',a:binding.assessmentId,e:binding.attemptEpoch})
export const loadStoredCanonicalUnitResults=async(encryptedValues:string[],db:Db=prisma,committedRecords:any[]=[],reader?:StoredScaleFactsReader):Promise<CanonicalUnitResultEnvelopeV1[]>=>{
 const values=encryptedValues.map(value=>decryptUnifiedRuntimePayload<any>(value))
 const refs=values.filter(value=>value?.k==='SCF2'||value?.kind==='SCALE_FACTS_CANONICAL_REF')
 const identity=(ref:any)=>ref.k==='SCF2'?{id:ref.a,attemptEpoch:ref.e}:{id:ref.binding?.assessmentId,attemptEpoch:ref.binding?.attemptEpoch}
 for(const ref of refs){const x=identity(ref);if(typeof x.id!=='string'||!x.id||!Number.isSafeInteger(x.attemptEpoch)||x.attemptEpoch<1||(ref.kind&&ref.version!==1))throw new Error('Invalid canonical fact reference')}
 const known=new Map<string,{row:ScaleFactRecord;canonical?:CanonicalUnitResultEnvelopeV1|null}>()
 for(const record of committedRecords){const context=readCommittedScaleFacts(record);if(context)known.set(context.row.id+'/'+context.row.attemptEpoch,{row:context.row,canonical:context.canonical})}
 for(const ref of refs){const x=identity(ref),read=reader?.find(x.id,x.attemptEpoch,db);if(read?.row&&!known.has(x.id+'/'+x.attemptEpoch))known.set(x.id+'/'+x.attemptEpoch,{row:read.row})}
 const missing=refs.map(identity).filter(x=>!known.has(x.id+'/'+x.attemptEpoch))
 for(const row of await loadScaleFactRecords(missing,db))known.set(row.id+'/'+row.attemptEpoch,{row})
 const factsById=new Map<string,ReturnType<typeof decodeScaleFacts>>()
 for(const [id,item]of known){if(item.canonical)continue;const read=reader?.find(item.row.id,item.row.attemptEpoch,db),facts=read?read.facts:decodeScaleFacts(item.row.factsEncrypted);if(!facts)throw new Error('Canonical fact body unavailable');assertScaleFactsBinding(facts,item.row);if(facts.sourceResultHash!==item.row.sourceResultHash)throw new Error('Canonical source digest mismatch');factsById.set(id,facts)}
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
