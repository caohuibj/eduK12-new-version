import { beforeEach, describe, expect, it, vi } from 'vitest'
import * as encryption from '../../utils/encryption'
import { createStoredScaleExportReader, resolveStoredScaleAnswers, resolveStoredScaleResult, makeWholeScaleRawReference } from '../../modules/assessment-runtime/compact-assessment-storage'
import { attachLoadedScaleFactRecord, makeScaleFactsReference, makeScaleRawReference, type ScaleFactRecord } from '../../modules/assessment-runtime/scale-fact-records'
import { encryptCompactField } from '../../modules/assessment-runtime/compact-field-codec'
import { packWholeRawEnvelope } from '../../modules/assessment-runtime/compact-raw'
import { encryptUnifiedRuntimePayload } from '../../modules/assessment-runtime/security'
import { createPublicTemplateStore, type PublicTemplateRow } from '../../modules/assessment-runtime/public-templates'
import { prepareCompactScaleFacts, decodeScaleFacts } from '../../modules/assessment-runtime/compact-scale-facts'
import { listScalePackages } from '../../modules/scale/scale-package.registry'
import { buildScaleResult } from '../../modules/scale/scale-result'
import { loadScaleAnswers, loadScaleResult } from '../../modules/scale/scale-workflow.service'

beforeEach(()=>{vi.stubEnv('DATA_ENCRYPTION_KEY','c'.repeat(64));vi.stubEnv('ASSESSMENT_COMPACT_VERIFY_WRITES','true')})
const answers=[{itemCode:'A',responseValue:0,responseTimeMs:1.25,changeCount:0}]
const record=(id='one',epoch=1)=>({id,attemptEpoch:epoch,submissionId:'submit-'+id,submissionPayloadHash:'d'.repeat(64),result:makeScaleFactsReference(epoch),answers:makeScaleRawReference(epoch)})
const fact=(value=record()):ScaleFactRecord=>({...value,sourceResultHash:'e'.repeat(64),canonicalResultHash:null,factsEncrypted:'legacy',rawAnswersEncrypted:encryptCompactField(answers),rawReceiptAttemptId:null,completedAt:new Date('2026-10-18T00:00:00Z'),totalTime:0})
type Receipt={attemptId:string;attemptEpoch:number;encrypted:string;payloadHash:string}
const receipt=(records:ReturnType<typeof record>[],parent='parent',epoch=1,mutate?:(body:any)=>void):Receipt=>{
 const body={schemaVersion:1,binding:{attemptId:parent,attemptEpoch:epoch},payloadHash:'f'.repeat(64),units:records.map(row=>({assessmentId:row.id,attemptEpoch:row.attemptEpoch,submissionId:row.submissionId,answers}))}
 mutate?.(body)
 return {attemptId:parent,attemptEpoch:epoch,payloadHash:'f'.repeat(64),encrypted:encryptUnifiedRuntimePayload(packWholeRawEnvelope(body))}
}
const database=(facts:ScaleFactRecord[],receipts:Receipt[]=[],templates:PublicTemplateRow[]=[])=>{
 const calls:Array<{kind:string;ids:unknown[]}> = []
 let failEstimate=false,failFetch=false,sizeOverride:number|undefined
 const flat=(value:any):unknown[]=>value&&Array.isArray(value.values)?value.values.flatMap(flat):[value]
 const db={$queryRaw:vi.fn(async(strings:TemplateStringsArray,...values:any[])=>{
  const sql=strings.join('?'),ids=values.flatMap(flat),matches=(id:string,epoch:number)=>ids.some((value,index)=>value===id&&ids[index+1]===epoch)
  const kind=sql.includes('assessment_public_templates')?'templates':sql.includes('assessment_result_facts')?'facts':sql.includes('composite_report_jobs')?'receipts':'assessments'
  const estimate=sql.includes('sizeBytes');calls.push({kind:kind+(estimate?'Size':''),ids})
  if(estimate&&failEstimate)throw new Error('metadata unavailable')
  if(!estimate&&failFetch&&kind==='facts')throw new Error('batch unavailable')
  if(kind==='templates')return templates.filter(row=>ids.includes(row.templateHash))
  if(kind==='facts')return facts.filter(row=>matches(row.id,row.attemptEpoch)).map(row=>estimate?{id:row.id,attemptEpoch:row.attemptEpoch,submissionId:row.submissionId,submissionPayloadHash:row.submissionPayloadHash,rawReceiptAttemptId:row.rawReceiptAttemptId,sizeBytes:sizeOverride??Buffer.byteLength(row.factsEncrypted)+Buffer.byteLength(row.rawAnswersEncrypted??'')}:{...row})
  if(kind==='receipts')return receipts.filter(row=>matches(row.attemptId,row.attemptEpoch)).map(row=>estimate?{attemptId:row.attemptId,attemptEpoch:row.attemptEpoch,sizeBytes:sizeOverride??Buffer.byteLength(row.encrypted)}:{...row})
  return facts.filter(row=>ids.includes(row.id)&&ids.includes(row.attemptEpoch)).map(row=>({...row}))
 })}
 return {db:db as any,calls,set failEstimate(value:boolean){failEstimate=value},set failFetch(value:boolean){failFetch=value},set size(value:number){sizeOverride=value}}
}
const rawCalls=(db:ReturnType<typeof database>)=>db.calls.filter(call=>call.kind==='facts').length

describe('request-local bounded Scale export reads',()=>{
 it('shares exact fact/raw rows, keeps result validation, and releases cached rows on close',async()=>{
  const r=record(),row=fact(r),templates:PublicTemplateRow[]=[]
  const store=createPublicTemplateStore({read:async hashes=>templates.filter(row=>hashes.includes(row.templateHash)),append:async rows=>{templates.push(...rows)}})
  const pkg=listScalePackages().find(pkg=>pkg.goldenCases.some(item=>item.expected.quality))!,fixture=pkg.goldenCases.find(item=>item.expected.quality)!
  const result=buildScaleResult({scaleId:'scale-'+pkg.key,instrumentKey:pkg.key,name:pkg.key,instrumentVersion:pkg.instrumentVersion,definition:pkg.definition,answers:fixture.answers,referenceSets:pkg.references})
  row.factsEncrypted=await prepareCompactScaleFacts({result,itemOrder:pkg.definition.items.map(item=>item.itemCode),binding:{assessmentId:r.id,attemptEpoch:r.attemptEpoch,submissionId:r.submissionId,payloadHash:r.submissionPayloadHash}},store)
  row.sourceResultHash=decodeScaleFacts(row.factsEncrypted)!.sourceResultHash
  const m=database([row],[],templates),reader=createStoredScaleExportReader([r],m.db),symbols=Object.getOwnPropertySymbols(r)
  await reader.prepare(r)
  expect((await resolveStoredScaleResult(r.result,{record:r,db:m.db})).scores).toEqual(result.scores)
  expect(await resolveStoredScaleAnswers(r.answers,r,m.db)).toEqual(answers);expect(rawCalls(m)).toBe(1)
  await reader.close();expect(Object.getOwnPropertySymbols(r)).toEqual(symbols)
  await resolveStoredScaleAnswers(r.answers,r,m.db);expect(rawCalls(m)).toBe(2)
 })
 it('distinguishes a facts-only null raw field from an actually loaded null',async()=>{
  const r=record(),row=fact(r),m=database([row]);attachLoadedScaleFactRecord(r,{...row,rawAnswersEncrypted:null})
  expect(await resolveStoredScaleAnswers(r.answers,r,m.db)).toEqual(answers);expect(rawCalls(m)).toBe(1)
  row.rawAnswersEncrypted=null
  const reader=createStoredScaleExportReader([r],m.db);await reader.prepare(r)
  await expect(resolveStoredScaleAnswers(r.answers,r,m.db)).rejects.toThrow('Original scale raw facts unavailable')
  await expect(resolveStoredScaleAnswers(r.answers,r,m.db)).rejects.toThrow('Original scale raw facts unavailable')
  expect(rawCalls(m)).toBe(2);await reader.close()
 })
 it('shares a whole receipt across exact units and preserves draft ownership lookup',async()=>{
  const records=[record('a'),record('b')],rows=records.map(value=>({...fact(value),rawAnswersEncrypted:null,rawReceiptAttemptId:'parent'})),whole=receipt(records)
  records[1].answers=makeWholeScaleRawReference({id:'b',attemptEpoch:1,compositeAttemptId:'parent'}) as any
  const m=database(rows,[whole]),reader=createStoredScaleExportReader(records,m.db)
  for(const r of records){await reader.prepare(r);expect(await resolveStoredScaleAnswers(r.answers,r,m.db)).toEqual({schemaVersion:1,answers})}
  expect(m.calls.filter(call=>call.kind==='receipts')).toHaveLength(1);expect(m.calls.filter(call=>call.kind==='assessments')).toHaveLength(1);await reader.close()
 })
 it.each(['id','epoch','submission','payload','source'] as const)('retains per-row %s binding failures without poisoning the next record',async kind=>{
  const bad=record('bad'),good=record('good'),badRow=fact(bad),goodRow=fact(good)
  if(kind==='id')badRow.id='different'
  if(kind==='epoch')badRow.attemptEpoch=2
  if(kind==='submission')badRow.submissionId='different'
  if(kind==='payload')badRow.submissionPayloadHash='a'.repeat(64)
  if(kind==='source')badRow.factsEncrypted=encryptCompactField({kind:'SCALE_RESULT_FACTS',version:1,binding:{assessmentId:bad.id,attemptEpoch:1,submissionId:bad.submissionId,payloadHash:bad.submissionPayloadHash},sourceResultHash:'f'.repeat(64),scores:[],items:[],references:[],interpretations:[]})
  const m=database([badRow,goodRow]),reader=createStoredScaleExportReader([bad,good],m.db);await reader.prepare(bad)
  if(kind==='source')expect(await loadScaleResult(bad.result,bad,{},m.db)).toEqual({result:null,decryptError:true})
  else expect(await loadScaleAnswers(bad.answers,bad,m.db)).toEqual({answers:[],decryptError:true})
  expect((await loadScaleAnswers(good.answers,good,m.db)).answers).toEqual(answers);expect(rawCalls(m)).toBe(1);await reader.close()
 })
 it('retains missing and corrupt per-row error/null behavior',async()=>{
  const records=[record('missing'),record('corrupt'),record('good')],rows=records.slice(1).map(value=>fact(value));rows[0].rawAnswersEncrypted=encryptCompactField({kind:'SCALE_RAW_FACTS',version:9})
  const m=database(rows),reader=createStoredScaleExportReader(records,m.db);await reader.prepare(records[0])
  expect(await loadScaleResult(records[0].result,records[0],{},m.db)).toEqual({result:null,decryptError:true})
  for(const r of records.slice(0,2))expect(await loadScaleAnswers(r.answers,r,m.db)).toEqual({answers:[],decryptError:true})
  expect((await loadScaleAnswers(records[2].answers,records[2],m.db)).answers).toEqual(answers);expect(rawCalls(m)).toBe(1);await reader.close()
 })
 it.each(['binding','payload','unitEpoch','unitSubmission','duplicateUnit','unrelatedCorruptUnit'])('rejects invalid whole %s using the existing whole parser',async kind=>{
  const records=[record('a'),record('b')],rows=records.map(value=>({...fact(value),rawAnswersEncrypted:null,rawReceiptAttemptId:'parent'}))
  const whole=receipt(records,'parent',1,body=>{
   if(kind==='binding')body.binding.attemptId='different'
   if(kind==='payload')body.payloadHash='different'
   if(kind==='unitEpoch')body.units[0].attemptEpoch=2
   if(kind==='unitSubmission')body.units[0].submissionId='different'
   if(kind==='duplicateUnit')body.units.push(body.units[0])
  })
  if(kind==='unrelatedCorruptUnit'){
   const packed=packWholeRawEnvelope({schemaVersion:1,binding:{attemptId:'parent',attemptEpoch:1},payloadHash:whole.payloadHash,units:records.map(r=>({assessmentId:r.id,attemptEpoch:1,submissionId:r.submissionId,answers}))})
   packed.envelope.units[1].answers.rows[0]=[999];whole.encrypted=encryptUnifiedRuntimePayload(packed)
  }
  const m=database(rows,[whole]),reader=createStoredScaleExportReader(records,m.db);await reader.prepare(records[0])
  expect(await loadScaleAnswers(records[0].answers,records[0],m.db)).toEqual({answers:[],decryptError:true})
  expect(m.calls.filter(call=>call.kind==='receipts')).toHaveLength(1);await reader.close()
 })
 it('bounds row fanout and releases each batch before preparing the next',async()=>{
  const records=Array.from({length:65},(_,index)=>record('r'+index)),m=database(records.map(value=>fact(value))),reader=createStoredScaleExportReader(records,m.db)
  await reader.prepare(records[0]);expect(rawCalls(m)).toBe(1);expect(m.calls.find(call=>call.kind==='facts')!.ids).toHaveLength(128)
  await reader.prepare(records[64]);expect(rawCalls(m)).toBe(2);expect(Object.getOwnPropertySymbols(records[0])).toHaveLength(0)
  expect(await resolveStoredScaleAnswers(records[64].answers,records[64],m.db)).toEqual(answers)
  await reader.close();expect(Object.getOwnPropertySymbols(records[64])).toHaveLength(0)
 })
 it('plans byte budgets before fetching and preserves oversized legal single-row semantics',async()=>{
  const records=[record('a'),record('b')],m=database(records.map(value=>fact(value)));m.size=700000
  const reader=createStoredScaleExportReader(records,m.db);await reader.prepare(records[0]);expect(rawCalls(m)).toBe(1)
  expect(m.calls[0].kind).toBe('factsSize');expect(m.calls[1].ids).toEqual(['a',1])
  await reader.prepare(records[1]);expect(rawCalls(m)).toBe(2);await reader.close();m.size=2*1024*1024
  const oversized=createStoredScaleExportReader(records,m.db);await oversized.prepare(records[0]);expect(rawCalls(m)).toBe(2)
  expect(await resolveStoredScaleAnswers(records[0].answers,records[0],m.db)).toEqual(answers);expect(rawCalls(m)).toBe(3);await oversized.close()
 })
 it.each(['estimate','fetch'])('falls back to original per-row catches after batch %s failure',async kind=>{
  const r=record(),m=database([fact(r)]);if(kind==='estimate')m.failEstimate=true;else m.failFetch=true
  const reader=createStoredScaleExportReader([r],m.db);await reader.prepare(r);if(kind==='fetch')m.failFetch=false
  expect((await loadScaleAnswers(r.answers,r,m.db)).answers).toEqual(answers);await reader.close()
 })
 it('leaves plain/legacy and unauthorized records on their existing path',async()=>{
  const plain={id:'plain',answers},m=database([]),reader=createStoredScaleExportReader([plain,undefined],m.db),other=record('other')
  await reader.prepare(other);expect(m.calls).toHaveLength(0)
  await reader.prepare(plain);expect(await resolveStoredScaleAnswers(plain.answers,plain,m.db)).toEqual(answers)
  await reader.close();expect(Object.getOwnPropertySymbols(plain)).toHaveLength(0)
 })
 it('never prefetches a mismatched reference epoch or an unverified legacy parent',async()=>{
  const wrong=record('wrong'),draft={...record('draft'),result:null as any,answers:makeWholeScaleRawReference({id:'draft',attemptEpoch:1,compositeAttemptId:'unverified'}) as any}
  wrong.result=makeScaleFactsReference(2);wrong.answers=makeScaleRawReference(2)
  const m=database([fact(record('wrong',2))]),reader=createStoredScaleExportReader([wrong,draft],m.db)
  await reader.prepare(wrong);expect(m.calls).toHaveLength(0)
  expect(await loadScaleResult(wrong.result,wrong,{},m.db)).toEqual({result:null,decryptError:true})
  expect(await loadScaleAnswers(wrong.answers,wrong,m.db)).toEqual({answers:[],decryptError:true})
  expect(m.calls).toHaveLength(0)
  await reader.prepare(draft)
  expect(await loadScaleAnswers(draft.answers,draft,m.db)).toEqual({answers:[],decryptError:true})
  expect(m.calls.map(value=>value.kind)).toEqual(['assessments']);await reader.close()
 })
 it('leaves frozen authorized records on the per-row path',async()=>{
  const r=Object.freeze(record()),m=database([fact(r)]),reader=createStoredScaleExportReader([r],m.db)
  await reader.prepare(r);expect(await resolveStoredScaleAnswers(r.answers,r,m.db)).toEqual(answers)
  await reader.close();expect(Object.getOwnPropertySymbols(r)).toHaveLength(0)
 })

 it('does not decrypt encrypted legacy raw strings while preparing a batch',async()=>{
  const legacy={id:'legacy',result:null,answers:encryptCompactField(answers)},m=database([]),reader=createStoredScaleExportReader([legacy],m.db)
  const decode=vi.spyOn(encryption,'safeDecrypt')
  try{await reader.prepare(legacy);expect(decode).not.toHaveBeenCalled();expect(m.calls).toHaveLength(0)}
  finally{await reader.close();decode.mockRestore()}
 })

 it.each(['submission','payload','inline'] as const)('does not prefetch a whole receipt for %s-only metadata mismatch or inline raw',async kind=>{
  const r=record(),row={...fact(r),rawAnswersEncrypted:null,rawReceiptAttemptId:'parent'},whole=receipt([r])
  if(kind==='submission')r.submissionId='different'
  if(kind==='payload')r.submissionPayloadHash='a'.repeat(64)
  if(kind==='inline')r.answers=answers as any
  const m=database([row],[whole]),reader=createStoredScaleExportReader([r],m.db)
  await reader.prepare(r);expect(m.calls.some(value=>value.kind.startsWith('receipts'))).toBe(false)
  if(kind==='inline')expect((await loadScaleAnswers(r.answers,r,m.db)).answers).toEqual(answers)
  else expect(await loadScaleAnswers(r.answers,r,m.db)).toEqual({answers:[],decryptError:true})
  expect(m.calls.some(value=>value.kind.startsWith('receipts'))).toBe(false);await reader.close()
 })

 it('never retains unbudgeted legacy whole bodies across 64 distinct parents',async()=>{
  const records=Array.from({length:64},(_,index)=>record('legacy-'+index))
  const rows=records.map((value,index)=>({...fact(value),rawAnswersEncrypted:null,rawReceiptAttemptId:'parent-'+index}))
  const wholes=records.map((value,index)=>receipt([value],'parent-'+index))
  for(let index=0;index<records.length;index++)records[index].answers=makeWholeScaleRawReference({id:records[index].id,attemptEpoch:1,compositeAttemptId:'parent-'+index}) as any
  const m=database(rows,wholes),reader=createStoredScaleExportReader(records,m.db)
  try{
   for(const r of records){
    await reader.prepare(r)
    expect(await resolveStoredScaleAnswers(r.answers,r,m.db)).toEqual({schemaVersion:1,answers})
    const context=Object.getOwnPropertySymbols(r).map(key=>(r as any)[key]).find(value=>value?.bodies instanceof Map)
    expect(context).toBeDefined();expect(context.receipts.size).toBe(0);expect(context.bodies.size).toBe(0)
   }
   expect(m.calls.filter(call=>call.kind==='receipts')).toHaveLength(64)
   expect(m.calls.some(call=>call.kind==='receiptsSize')).toBe(false)
  }finally{await reader.close()}
 })

})
