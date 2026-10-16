import { makeScaleFactsReference, makeScaleRawReference, attachLoadedScaleFactRecord } from '../../modules/assessment-runtime/scale-fact-records'
import { readFileSync, writeFileSync } from 'node:fs'
import { isDeepStrictEqual } from 'node:util'
import { encryptField, decryptField } from '../../utils/encryption'
import { buildScaleUnitReport } from '../../modules/reporting/scale-unit-report'
import { encryptCompactCompositeReport, decryptCompactCompositeReport } from '../../modules/composite/compact-composite-report'
import { makeWholeScaleRawReference, makeCanonicalFactsReference } from '../../modules/assessment-runtime/compact-assessment-storage'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { encryptCompactField, decryptCompactField } from '../../modules/assessment-runtime/compact-field-codec'
import { encodeAnswerRows, decodeAnswerRows, packWholeRawEnvelope, unpackWholeRawEnvelope } from '../../modules/assessment-runtime/compact-raw'
import { createPublicTemplateStore, type PublicTemplateRow } from '../../modules/assessment-runtime/public-templates'
import { prepareCompactScaleFacts, decodeScaleFacts, restoreCompactScaleFacts, assertScaleFactsBinding } from '../../modules/assessment-runtime/compact-scale-facts'
import { listScalePackages } from '../../modules/scale/scale-package.registry'
import { buildScaleResult } from '../../modules/scale/scale-result'
import { canonicalHash } from '../../modules/assessment-runtime/canonical'
import { createCanonicalUnitResultEnvelope } from '../../modules/assessment-runtime/unit-result'
const key='c'.repeat(64)
beforeEach(()=>{vi.stubEnv('DATA_ENCRYPTION_KEY',key);vi.stubEnv('ASSESSMENT_COMPACT_VERIFY_WRITES','true')})
const memory = () => {
  const rows=new Map<string,PublicTemplateRow>()
  const repo={read:vi.fn(async(hashes:string[])=>hashes.flatMap(h=>rows.has(h)?[rows.get(h)!]:[])),append:vi.fn(async(values:PublicTemplateRow[])=>{for(const row of values)if(!rows.has(row.templateHash))rows.set(row.templateHash,row)})}
  return {rows,repo,store:createPublicTemplateStore(repo)}
}
const binding=(suffix='one')=>({assessmentId:'assessment-'+suffix,attemptEpoch:1,submissionId:'submission-'+suffix,payloadHash:'d'.repeat(64)})
const catalog=listScalePackages().filter(p=>p.goldenCases.some(c=>c.expected.quality))
const selected=[...new Set([...catalog.filter(p=>p.references.length>0).slice(0,4),...catalog.filter(p=>p.references.length===0).slice(0,4)])]
const resultFor=(pkg:typeof selected[number],fixture:typeof selected[number]['goldenCases'][number])=>buildScaleResult({scaleId:'scale-'+pkg.key,instrumentKey:pkg.key,name:pkg.definition.source.title??pkg.key,instrumentVersion:pkg.instrumentVersion,definition:pkg.definition,answers:fixture.answers,referenceSets:pkg.references,participantContextHash:'e'.repeat(64)})
const canonicalFor=(result:ReturnType<typeof resultFor>,id=binding())=>createCanonicalUnitResultEnvelope({core:{schemaVersion:1,unitType:'SCALE',instrumentKey:result.instrument.code,instrumentVersion:result.instrument.instrumentVersion,sourceDefinitionHash:result.method.definitionHash,compilerVersion:'compact-test-v1',compiledRuntimeHash:'f'.repeat(64),scorerKey:'scale.default',scorerVersion:result.method.scoringVersion,quality:result.quality,metrics:result.scores.map(s=>({key:s.key,value:s.value,unit:'score',quality:s.status})),facts:[{key:'quality.status',value:result.quality.status}],references:result.references.map((r,i)=>({key:'reference-'+i,scoreKey:r.scoreKey,referenceVersion:r.referenceVersion,referenceHash:null,classification:r.criterionBand?.key??null,status:r.status,value:r.value??null,z:r.z??null,percentile:r.percentile?.value??null})),contextHash:result.method.assessmentContext?.snapshotHash??null,scientificProvenance:{instrumentKey:result.instrument.code,instrumentVersion:result.instrument.instrumentVersion}},completedAt:'2026-10-16T00:00:00.000Z',persistenceProvenance:{sourceType:'ASSESSMENT',sourceAttemptId:id.assessmentId,sourceSubmissionId:id.submissionId},bundleBridge:{sourceResultHash:canonicalHash(result),scores:result.scores.map(s=>({scoreKey:s.key,value:s.value,status:s.status,criterionBandKey:result.references.find(r=>r.scoreKey===s.key&&r.referenceKind==='criterion_threshold'&&r.status==='available')?.criterionBand?.key??null}))}})

describe('versioned compact authenticated fields',()=>{
 it('preserves JSON types, unicode, zero and fractional times',()=>{const v={a:[0,'0',null,false,'中文'],time:1.125};expect(decryptCompactField(encryptCompactField(v))).toEqual(v)})
 it('rejects changed ciphertext, header, unsupported version and noncanonical base64',()=>{
  const value=encryptCompactField({text:'a'.repeat(5000)})
  for(const changed of [value.replace('ekc1:','ekc2:'),value.replace(':gz:',':js:'),value.slice(0,-4)+'AAAA',value+'='])expect(()=>decryptCompactField(changed)).toThrow()
 })
 it('bounds declared and actual decompression sizes and rejects a different key',()=>{
  const cipher=encryptCompactField({text:'x'.repeat(20000)})
  expect(()=>decryptCompactField(cipher,1024)).toThrow()
  vi.stubEnv('DATA_ENCRYPTION_KEY','b'.repeat(64));expect(()=>decryptCompactField(cipher)).toThrow()
 })
})
describe('one raw representation',()=>{
 it('preserves absent optional fields separately from zeros and keeps full metadata',()=>{
  const answers=[{itemCode:'A',responseValue:0,responseTimeMs:0,changeCount:0,revision:0},{itemCode:'B',responseValue:'0',responseTimeMs:1.125,answeredAt:'time',changeCount:2},{itemCode:'C',responseValue:'多字选择'}]
  expect(decodeAnswerRows(encodeAnswerRows(answers))).toEqual(answers)
  const whole={schemaVersion:1,binding:{attemptId:'parent',attemptEpoch:1},payloadHash:'hash',units:[{assessmentId:'child',answers,deviceInputProvenance:{deviceClass:'desktop'}}]}
  expect(unpackWholeRawEnvelope(packWholeRawEnvelope(whole))).toEqual(whole)
 })
 it('rejects bad masks, extra values and unknown fields without truncation',()=>{
  const data=encodeAnswerRows([{itemCode:'A',responseValue:0}])
  expect(()=>decodeAnswerRows({...data,rows:[[8,'A',0]]})).toThrow()
  expect(()=>decodeAnswerRows({...data,rows:[[3,'A',0,999]]})).toThrow()
  expect(()=>decodeAnswerRows({...data,fields:['itemCode','__proto__']})).toThrow()
 })
})
describe('shared immutable public content',()=>{
 it('does not cache an append rolled back or failed before commit',async()=>{
  const m=memory();m.repo.append.mockRejectedValueOnce(new Error('transaction failed'))
  await expect(m.store.saveMany([{kind:'SCALE_CAVEATS',value:['shared']}])).rejects.toThrow()
  await m.store.saveMany([{kind:'SCALE_CAVEATS',value:['shared']}]);expect(m.repo.append).toHaveBeenCalledTimes(2)
 })
 it('survives process cache loss and rejects missing or corrupted content',async()=>{
  const m=memory(),[hash]=await m.store.saveMany([{kind:'SCALE_CAVEATS',value:['shared']}])
  expect(await createPublicTemplateStore(m.repo).loadMany([{hash,kind:'SCALE_CAVEATS'}])).toEqual([['shared']])
  const row=m.rows.get(hash)!;m.rows.set(hash,{...row,payloadEncrypted:encryptCompactField({version:1,kind:'SCALE_CAVEATS',value:['wrong']})})
  await expect(createPublicTemplateStore(m.repo).loadMany([{hash,kind:'SCALE_CAVEATS'}])).rejects.toThrow()
  m.rows.clear();await expect(createPublicTemplateStore(m.repo).loadMany([{hash,kind:'SCALE_CAVEATS'}])).rejects.toThrow()
 })
})
describe('compact result authority across scale combinations',()=>{
 for(const pkg of selected)for(const fixture of pkg.goldenCases.filter(c=>c.expected.quality).slice(0,3)){
  it(pkg.key+' / '+fixture.name+' keeps all scores, quality, references and report wording',async()=>{
   const m=memory(),result=resultFor(pkg,fixture),canonical=canonicalFor(result)
   const encrypted=await prepareCompactScaleFacts({result,itemOrder:pkg.definition.items.map(i=>i.itemCode),binding:binding(),canonical},m.store)
   const facts=decodeScaleFacts(encrypted)!
   const restored=await restoreCompactScaleFacts(facts,{full:true,answers:fixture.answers},createPublicTemplateStore(m.repo))
   expect(restored.result).toEqual(JSON.parse(JSON.stringify(result)));expect(restored.canonical).toEqual(canonical)
   const report=await restoreCompactScaleFacts(facts,{},m.store)
   expect(report.result.scores).toEqual(result.scores);expect(report.result.interpretations).toEqual(result.interpretations)
   expect(report.canonical).toEqual(canonical)
   expect(report.result.itemScores.every(i=>!('responseValue'in i)&&!('responseTimeMs'in i))).toBe(true)
  })
 }
 it('shares content between people without storing identity, answers or actual scores in templates',async()=>{
  const m=memory(),pkg=selected[0],fixture=pkg.goldenCases.find(c=>c.expected.quality)!,first=resultFor(pkg,fixture)
  await prepareCompactScaleFacts({result:first,itemOrder:pkg.definition.items.map(i=>i.itemCode),binding:binding(),canonical:canonicalFor(first)},m.store)
  const count=m.rows.size,second={...first,method:{...first.method,assessmentContext:{schemaVersion:1 as const,snapshotHash:'a'.repeat(64)}}}
  await prepareCompactScaleFacts({result:second,itemOrder:pkg.definition.items.map(i=>i.itemCode),binding:binding('two'),canonical:canonicalFor(second,binding('two'))},m.store)
  expect(m.rows.size).toBe(count)
  for(const row of m.rows.values()){const content=JSON.stringify(decryptCompactField(row.payloadEncrypted));expect(content).not.toContain('assessment-one');expect(content).not.toContain('submission-one')}
 })
 it('rejects wrong owner/epoch, changed results and missing original answers',async()=>{
  const m=memory(),pkg=selected[0],fixture=pkg.goldenCases.find(c=>c.expected.quality)!,result=resultFor(pkg,fixture)
  const facts=decodeScaleFacts(await prepareCompactScaleFacts({result,itemOrder:pkg.definition.items.map(i=>i.itemCode),binding:binding(),canonical:canonicalFor(result)},m.store))!
  expect(()=>assertScaleFactsBinding(facts,{id:'other',attemptEpoch:1})).toThrow()
  expect(()=>assertScaleFactsBinding(facts,{id:binding().assessmentId,attemptEpoch:2})).toThrow()
  await expect(restoreCompactScaleFacts(facts,{full:true,answers:[]},m.store)).rejects.toThrow()
  const bad=structuredClone(facts);bad.scores[0][0]=999
  await expect(restoreCompactScaleFacts(bad,{full:true,answers:fixture.answers},m.store)).rejects.toThrow()
 })
})

describe('report manifests and end-to-end representation equivalence',()=>{
 it('restores full report fields from one facts source, with no original-answer query',async()=>{
  vi.stubEnv('ASSESSMENT_COMPACT_FACTS_ENABLED','true')
  const m=memory(),normalize=(x:any)=>JSON.parse(JSON.stringify(x)),size=(x:string)=>Buffer.byteLength(x)
  let samples:any[]
  if(process.env.COMPACT_SYNTHETIC_FIXTURE){const fixture=decryptField<any>(readFileSync(process.env.COMPACT_SYNTHETIC_FIXTURE,'utf8'));expect(fixture.kind).toBe('ATTRIBUTABLE_SYNTHETIC_PHASE10');samples=fixture.people}
  else{
   const pkg=selected[0],fixture=pkg.goldenCases.find(c=>c.expected.quality)!,result=resultFor(pkg,fixture),id=binding(),parent='parent-one'
   const record={id:id.assessmentId,attemptEpoch:1,submissionId:id.submissionId,submissionPayloadHash:id.payloadHash,compositeAttemptId:parent,compositeItemId:'item-one',completedAt:'2026-10-16T00:00:00.000Z',totalTime:123}
   const unit=buildScaleUnitReport({itemId:record.compositeItemId,scaleId:result.instrument.scaleId,scaleCode:pkg.key,scaleName:result.instrument.name,result,completedAt:record.completedAt,totalTime:123})
   const report={id:parent,assessmentId:'questionnaire-one',name:'合成问卷',productKind:'QUESTIONNAIRE',reportMode:'COLLECTION',anonymousCode:null,completedAt:record.completedAt,totalTime:123,backgroundValues:[],unitReports:[unit]}
   samples=[{children:[{record,result,answers:fixture.answers,itemOrder:pkg.definition.items.map(i=>i.itemCode),canonical:canonicalFor(result),oldFieldBytes:0}],binding:{attemptId:parent,attemptEpoch:1,slotSetHash:'a'.repeat(64),contextHash:'e'.repeat(64),aggregateInputHash:'b'.repeat(64)},report,policies:[],whole:{schemaVersion:1,binding:{attemptId:parent,attemptEpoch:1},payloadHash:'d'.repeat(64),units:[{assessmentId:record.id,attemptEpoch:1,submissionId:id.submissionId,answers:fixture.answers}]},oldParentFieldBytes:0}]
  }
  const statistics=[]
  for(const sample of samples){const children=[],sourceRows:any[]=[],counts={result:0,rawRefs:0,canonicalRefs:0};
   for(const child of sample.children){const r=child.record,id={assessmentId:r.id,attemptEpoch:r.attemptEpoch,submissionId:r.submissionId,payloadHash:r.submissionPayloadHash}
    const encrypted=await prepareCompactScaleFacts({result:child.result,itemOrder:child.itemOrder,binding:id,canonical:child.canonical},m.store),facts=decodeScaleFacts(encrypted)!
    const full=await restoreCompactScaleFacts(facts,{full:true,answers:child.answers},createPublicTemplateStore(m.repo))
    expect(isDeepStrictEqual(normalize(full.result),normalize(child.result))).toBe(true);expect(isDeepStrictEqual(normalize(full.canonical),normalize(child.canonical))).toBe(true)
    const completedAt=new Date(/(?:Z|[+-][0-9]{2}:[0-9]{2})$/.test(r.completedAt)?r.completedAt:r.completedAt+'Z')
    const factRow={...r,sourceResultHash:facts.sourceResultHash,canonicalResultHash:child.canonical.resultHash,factsEncrypted:encrypted,rawAnswersEncrypted:null,rawReceiptAttemptId:r.compositeAttemptId,completedAt}
    sourceRows.push(factRow)
    children.push(attachLoadedScaleFactRecord({...r,result:makeScaleFactsReference(r.attemptEpoch),completedAt,status:'COMPLETED'},factRow))
    counts.result+=size(encrypted)+size(JSON.stringify(makeScaleFactsReference(r.attemptEpoch)));counts.rawRefs+=size(JSON.stringify(makeScaleRawReference(r.attemptEpoch)));counts.canonicalRefs+=size(makeCanonicalFactsReference(id,child.canonical.resultHash))
   }
   for(const unit of sample.report.unitReports){const policy=sample.policies.find((p:any)=>p.itemId===unit.itemId)?.policy;if(policy)Object.defineProperty(unit,'__scaleProjectionPolicy',{value:policy,enumerable:false})}
   const encrypted=await encryptCompactCompositeReport(sample.report,sample.binding,children,m.store),readRows=vi.fn(async()=>sourceRows)
   const restored=await decryptCompactCompositeReport(encrypted,sample.binding,{templates:createPublicTemplateStore(m.repo),readRows})
   const projected=(r:any)=>({...r,unitReports:r.unitReports.map(({result,...unit}:any)=>unit)})
   expect(isDeepStrictEqual(normalize(projected(restored)),normalize(projected(sample.report)))).toBe(true)
   expect(readRows).toHaveBeenCalledTimes(1)
   const raw=size(encryptCompactField({schemaVersion:1,value:packWholeRawEnvelope(sample.whole)}))
   const varied=normalize(sample.whole);let seed=28431
   for(const unit of varied.units)for(const answer of unit.answers){seed=(Math.imul(seed,1664525)+1013904223)>>>0;answer.responseTimeMs=100+seed%300000;answer.changeCount=seed%5}
   const variedRaw=size(encryptCompactField({schemaVersion:1,value:packWholeRawEnvelope(varied)}))
   statistics.push({scales:children.length,fullResultAndCanonicalExact:true,ordinaryReportFieldsExact:true,newResultCipherBytes:counts.result,newRawPrimaryCipherBytes:raw,variedCollectedTimingAndChangeCountRawBytes:variedRaw,newRawReferenceCipherBytes:counts.rawRefs,newCanonicalReferenceCipherBytes:counts.canonicalRefs,newReportManifestCipherBytes:size(encrypted),newComparedFieldsTotal:counts.result+raw+counts.rawRefs+counts.canonicalRefs+size(encrypted),oldComparedFieldsTotal:sample.oldParentFieldBytes+sample.children.reduce((sum:number,c:any)=>sum+c.oldFieldBytes,0)})
   await expect(decryptCompactCompositeReport(encrypted,{...sample.binding,attemptEpoch:sample.binding.attemptEpoch+1},{templates:m.store,readRows})).rejects.toThrow()
  }
  if(process.env.COMPACT_FEASIBILITY_OUTPUT)writeFileSync(process.env.COMPACT_FEASIBILITY_OUTPUT,JSON.stringify({purpose:'READ_ONLY_ENCODING_FEASIBILITY_NOT_END_TO_END_CPU_OR_PHYSICAL_SPACE',people:statistics,publicTemplateRows:m.rows.size,sharedTemplatePlainBytes:[...m.rows.values()].reduce((n,row)=>n+row.plaintextBytes,0),applicationDataWritten:false},null,2))
 })
})
