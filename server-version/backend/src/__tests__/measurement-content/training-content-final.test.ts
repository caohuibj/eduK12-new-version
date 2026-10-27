import {beforeEach,afterEach,describe,it,expect,vi} from 'vitest'
const mocks=vi.hoisted(()=>({educationReport:vi.fn(),get:vi.fn()}))
vi.mock('../../modules/measurement-content/repository',()=>({getContentRelease:mocks.get}))
vi.mock('../../modules/composite/training-report-selection',()=>({validateTrainingReportPointer:mocks.educationReport}))
import {prepareTrainingFinalReceipt,decodeTrainingFinalReceipt} from '../../modules/composite/training-content-final'
import {canonicalHash} from '../../modules/assessment-runtime/canonical'
import {compositeItemSlotKey} from '../../modules/assessment-runtime/slot-set'
import {createCanonicalUnitResultEnvelope,projectScaleCanonicalUnitResult,projectCognitiveCanonicalUnitResult,projectSituationCanonicalUnitResult} from '../../modules/assessment-runtime/unit-result'
import {freezeSituationalRuntimeAtAttemptStart} from '../../modules/assessment-runtime/situational-runtime-snapshot'
import {SJT_ASSERTIVENESS_GOLDEN_ZH_CN_V1_PACKAGE as pkg} from '../../modules/situational/packages/sjt-assertiveness-golden-zh-cn-v1'
import {scoreSituational} from '../../modules/situational/situation-scoring'
import {encryptUnifiedRuntimePayload} from '../../modules/assessment-runtime/security'
const hash='a'.repeat(64),mId='11111111-1111-4111-8111-111111111111',rId='22222222-2222-4222-8222-222222222222'
const completedAt='2026-10-20T00:00:00.000Z'
function fixture(family:'SCALE'|'COGNITIVE'|'SJT'='SCALE'){
 const type=family==='SJT'?'SITUATIONAL':family
 const runtime:any={schemaVersion:1,compilerVersion:'fixture',instrumentType:type,instrumentKey:'demo',instrumentVersion:'1',sourceDefinitionHash:hash,
  compiledRuntimeHash:hash,scorerKey:'demo',scorerVersion:'1',metricDefinitions:{total:{unit:'score'}},aggregateProjection:{allowedMetricKeys:['total'],allowedFactKeys:[],allowedReferenceClassifications:[]}}
 const core=family==='SCALE'?projectScaleCanonicalUnitResult({runtime,contextHash:null,result:{quality:{status:'interpretable',flags:[]},scores:[{key:'total',value:12,status:'calculated'}],references:[]} as any}):family==='COGNITIVE'?
 projectCognitiveCanonicalUnitResult({runtime,contextHash:null,resolvedConfigHash:hash,snapshot:{metrics:{total:12},quality:{state:'interpretable',flags:{}},references:[],protocolSignature:'protocol',profile:null} as any}):(()=>{
 const snapshot=freezeSituationalRuntimeAtAttemptStart({instrumentKey:pkg.key,instrumentVersion:pkg.instrumentVersion,definition:pkg.definition,frozenAt:new Date(completedAt)})
 return projectSituationCanonicalUnitResult({runtime:snapshot.compiledRuntime,contextHash:null,result:scoreSituational(pkg.definition,pkg.goldenCases[0].responses)})})()
 const envelope=createCanonicalUnitResultEnvelope({core,completedAt,persistenceProvenance:{sourceType:family==='SCALE'?'ASSESSMENT':family==='COGNITIVE'?'COGNITIVE_SESSION':'SITUATIONAL_ATTEMPT',sourceAttemptId:'child'}})
 const source={kind:family==='SCALE'?'SCALE':family==='COGNITIVE'?'COGNITIVE_CONFIG':'SJT_AUTHOR_RELEASE',id:'source',ownerId:'owner',...(family==='COGNITIVE'?{assignmentId:'assignment'}:{})}
 const binding={schemaVersion:1,compositeId:'composite',attemptId:'attempt',epoch:1,publicationHash:hash,units:[{itemId:'item',family,source,measurement:{releaseId:mId,contentHash:hash,measurementHash:hash},report:{releaseId:rId,contentHash:hash}}]}
 const parent={id:'attempt',attemptEpoch:1,compositeAssessmentId:'composite',compositeAssessment:{id:'composite',createdBy:'owner'},trainingContentBinding:binding,trainingContentBindingHash:canonicalHash(binding)}
 const measurement:any={releaseId:mId,contentHash:hash,layer:'MEASUREMENT',family,status:'PUBLISHED',scope:{kind:'PRIVATE',product:'TRAINING',ownerId:'owner',resourceId:family==='COGNITIVE'?'assignment':'source'},content:{measurementHash:hash}}
 const report:any={releaseId:rId,contentHash:hash,layer:'REPORT',family,status:'PUBLISHED',scope:{kind:'PRIVATE',product:'TRAINING',ownerId:'owner',resourceId:'composite'},content:{generatorVersion:'DECLARATIVE_REPORT_V1',measurements:[{releaseId:mId,contentHash:hash}]}}
 mocks.get.mockImplementation(async(_tx,id)=>id===mId?measurement:report)
 return {input:{parent,aggregateInputHash:hash,completedAt,verifiedPayloads:[{header:{slotKey:compositeItemSlotKey('item',type)},envelope}]},measurement,report,envelope}
}
beforeEach(()=>{vi.resetAllMocks();vi.stubEnv('DATA_ENCRYPTION_KEY','a'.repeat(64))})
afterEach(()=>vi.unstubAllEnvs())
describe('trusted aggregate payloads produce compact Training FINAL receipts',()=>{
 it.each(['SCALE','COGNITIVE','SJT'] as const)('uses real %s canonical projector outputs and decodes without facts or owner',async family=>{
  const {input,envelope}=fixture(family),result=(await prepareTrainingFinalReceipt({} as never,input))!
  expect(result.receipt.sources).toEqual([{itemId:'item',resultHash:envelope.resultHash}])
  expect(result.receipt.interpretation.units[0]).toMatchObject({instrumentKey:'item',report:{status:'READY'},references:[]})
  expect(JSON.stringify(result.receipt)).not.toMatch(/"metrics"|sourceDefinitionHash|compiledRuntimeHash|"template"/)
  const {compositeAssessment,...parent}=input.parent
  expect(decodeTrainingFinalReceipt({...parent,aggregateInputHash:hash,trainingContentInterpretationEncrypted:result.encrypted,trainingContentInterpretationHash:result.hash})).toEqual(result.receipt)
  expect(mocks.get.mock.calls.every(c=>c[2]===true)).toBe(true)
 })
 it('records skipped execution and per-layer revocation without changing stored facts',async()=>{
  const {input}=fixture();input.verifiedPayloads=[]
  expect((await prepareTrainingFinalReceipt({} as never,input))!.receipt.interpretation.units[0]).toMatchObject({reason:'NOT_EXECUTED',report:{status:'UNAVAILABLE'}})
  const second=fixture();const before=JSON.stringify(second.envelope);second.measurement.status='REVOKED'
  expect((await prepareTrainingFinalReceipt({} as never,second.input))!.receipt.interpretation.units[0].status).toBe('REVOKED')
  expect(JSON.stringify(second.envelope)).toBe(before)
  second.measurement.status='PUBLISHED';second.report.status='REVOKED'
  expect((await prepareTrainingFinalReceipt({} as never,second.input))!.receipt.interpretation.units[0].report.status).toBe('REVOKED')
 })
 it('rejects cross-entry/private owner or report composite scopes',async()=>{
  for(const kind of ['measurement','report'] as const){const f=fixture();f[kind].scope.product='SURVEY';await expect(prepareTrainingFinalReceipt({} as never,f.input)).rejects.toMatchObject({statusCode:409})}
  const f=fixture();f.report.scope.resourceId='other';await expect(prepareTrainingFinalReceipt({} as never,f.input)).rejects.toMatchObject({statusCode:409})
 })
 it('rejects duplicate verified slots and wrong canonical family before interpreting',async()=>{
  const f=fixture();f.input.verifiedPayloads.push(f.input.verifiedPayloads[0]);await expect(prepareTrainingFinalReceipt({} as never,f.input)).rejects.toMatchObject({statusCode:409})
  const g=fixture();g.envelope.core.unitType='COGNITIVE';await expect(prepareTrainingFinalReceipt({} as never,g.input)).rejects.toMatchObject({statusCode:409})
 })
 it('returns explicit legacy null and rejects partial binding or epoch mismatch',async()=>{
  const f=fixture();expect(await prepareTrainingFinalReceipt({} as never,{...f.input,parent:{...f.input.parent,trainingContentBinding:null,trainingContentBindingHash:null}})).toBeNull()
  await expect(prepareTrainingFinalReceipt({} as never,{...f.input,parent:{...f.input.parent,attemptEpoch:2}})).rejects.toMatchObject({statusCode:409})
  await expect(prepareTrainingFinalReceipt({} as never,{...f.input,parent:{...f.input.parent,trainingContentBindingHash:null}})).rejects.toMatchObject({statusCode:409})
 })
 it('rejects changed receipt identity/hash, aggregate hash and foreign source item',async()=>{
  const f=fixture(),result=(await prepareTrainingFinalReceipt({} as never,f.input))!
  const parent={...f.input.parent,aggregateInputHash:hash,trainingContentInterpretationEncrypted:result.encrypted,trainingContentInterpretationHash:result.hash}
  for(const patch of [{aggregateInputHash:'b'.repeat(64)},{attemptEpoch:2},{trainingContentInterpretationHash:'b'.repeat(64)},{trainingContentInterpretationEncrypted:null}])expect(()=>decodeTrainingFinalReceipt({...parent,...patch})).toThrow()
  const bad={...result.receipt,sources:[{itemId:'other',resultHash:hash}]}
  expect(()=>decodeTrainingFinalReceipt({...parent,trainingContentInterpretationEncrypted:encryptUnifiedRuntimePayload(bad),trainingContentInterpretationHash:canonicalHash(bad)})).toThrow()
 })
})

it('accepts only persisted static registry provenance without inventing an owner, even for revoked historical facts',async()=>{
 const f=fixture('SJT'),mappingId='44444444-4444-4444-8444-444444444444'
 const source={kind:'STATIC_SJT_REGISTRY',id:mappingId,instrumentKey:pkg.key,instrumentVersion:pkg.instrumentVersion}
 Object.assign(f.input.parent.trainingContentBinding.units[0],{source})
 f.input.parent.trainingContentBindingHash=canonicalHash(f.input.parent.trainingContentBinding)
 f.measurement.scope={kind:'PLATFORM'};f.measurement.content.instrumentVersion=pkg.instrumentVersion
 f.measurement.provenance={sourceKind:'STATIC_SJT_REGISTRY',mappingId,contentDigest:hash,instrumentKey:pkg.key,instrumentVersion:pkg.instrumentVersion}
 expect((await prepareTrainingFinalReceipt({} as never,f.input))!.receipt.interpretation.units[0].report.status).toBe('READY')
 f.measurement.status='REVOKED';expect((await prepareTrainingFinalReceipt({} as never,f.input))!.receipt.interpretation.units[0].status).toBe('REVOKED')
 for(const patch of [{mappingId:'foreign'},{sourceKind:'SJT_AUTHOR_RELEASE'},{instrumentVersion:'2.0.0'},{contentDigest:'invalid'}]){
  const before={...f.measurement.provenance};Object.assign(f.measurement.provenance,patch)
  await expect(prepareTrainingFinalReceipt({} as never,f.input)).rejects.toMatchObject({statusCode:409});f.measurement.provenance=before
 }
 Object.assign(f.input.parent.trainingContentBinding.units[0],{source:{kind:'SJT_AUTHOR_RELEASE',id:'fake',ownerId:'fake'}})
 f.input.parent.trainingContentBindingHash=canonicalHash(f.input.parent.trainingContentBinding)
 await expect(prepareTrainingFinalReceipt({} as never,f.input)).rejects.toMatchObject({statusCode:409})
 Object.assign(f.input.parent.trainingContentBinding.units[0],{source});f.input.parent.trainingContentBindingHash=canonicalHash(f.input.parent.trainingContentBinding)
 f.measurement.scope={kind:'PLATFORM',ownerId:'fabricated'};await expect(prepareTrainingFinalReceipt({} as never,f.input)).rejects.toMatchObject({statusCode:409})
})

import * as contentBindingModule from '../../modules/composite/training-content-binding'
import * as referenceSelectionModule from '../../modules/composite/training-reference-selection'
import {referenceEntryKey} from '../../modules/measurement-content/reference-candidate'
afterEach(()=>vi.restoreAllMocks())
const referenceId='33333333-3333-4333-8333-333333333333'
function sharedReleaseFixture(count=3){
 const f=fixture(),parent:any=f.input.parent,binding=parent.trainingContentBinding
 const entries=['total','other'].map(scoreKey=>({scoreKey,referenceKind:'descriptive_sample',evidenceLevel:'local_pilot',provenanceType:'local_observed',instrumentVersion:'1',scoringVersion:'1',population:{description:'Synthetic'},source:{citation:'Synthetic fixture only',sampleSize:20},statistics:{mean:2},limitations:['Synthetic']}))
 const slots=entries.map(entry=>({metricKey:entry.scoreKey,referenceKind:entry.referenceKind,status:'SELECTED',releaseId:referenceId,contentHash:hash,entryKey:referenceEntryKey(entry as any)}))
 const base=binding.units[0]
 binding.units=Array.from({length:count},(_,i)=>({...base,itemId:`item-${i}`,referencePolicy:{policyVersion:'EXACT_POPULATION_PRIORITY_V1',measurementReleaseId:mId,choices:slots.map(({status,...slot})=>({...slot,priority:1}))}}))
 parent.trainingContentBindingHash=canonicalHash(binding)
 parent.trainingReferenceBinding={schemaVersion:1,attemptId:parent.id,epoch:1,contentBindingHash:parent.trainingContentBindingHash,contextHash:null,units:binding.units.map((u:any)=>({itemId:u.itemId,references:slots.map(s=>({...s}))}))}
 parent.trainingReferenceBindingHash=canonicalHash(parent.trainingReferenceBinding)
 f.input.verifiedPayloads=binding.units.map((u:any)=>({header:{slotKey:compositeItemSlotKey(u.itemId,'SCALE')},envelope:f.envelope}))
 Object.assign(f.measurement.content,{instrumentVersion:'1',scoringVersion:'1'})
 const reference:any={releaseId:referenceId,contentHash:hash,layer:'REFERENCE',family:'SCALE',status:'PUBLISHED',version:'1',scope:{kind:'PRIVATE',product:'TRAINING',ownerId:'owner',resourceId:'composite'},content:{measurement:{releaseId:mId,contentHash:hash},entries:entries.map(definition=>({metricKey:definition.scoreKey,referenceKind:definition.referenceKind,definition}))}}
 mocks.get.mockImplementation(async(_tx,id)=>id===mId?f.measurement:id===rId?f.report:reference)
 return {...f,parent,reference,rehash:()=>{parent.trainingContentBindingHash=canonicalHash(binding);parent.trainingReferenceBinding.contentBindingHash=parent.trainingContentBindingHash;parent.trainingReferenceBindingHash=canonicalHash(parent.trainingReferenceBinding)}}
}
describe('frozen release indexes retain validation and interpretation semantics',()=>{
 it('preserves order and validates every matching unit on every read, once per release group rather than per duplicate slot',async()=>{
  const f=sharedReleaseFixture(),scope=vi.spyOn(contentBindingModule,'trainingMeasurementSourceScopeMatchesForConsumer'),reference=vi.spyOn(referenceSelectionModule,'validateTrainingReferenceRelease')
  const result=(await prepareTrainingFinalReceipt({} as never,f.input))!
  expect(result.receipt.sources).toEqual([0,1,2].map(i=>({itemId:`item-${i}`,resultHash:f.envelope.resultHash})))
  expect(result.receipt.interpretation.units.map(u=>({id:u.instrumentKey,references:u.references}))).toEqual([0,1,2].map(i=>({id:`item-${i}`,references:[
   {metricKey:'total',referenceKind:'descriptive_sample',status:'AVAILABLE',values:{z:null,t:null,meanDifference:10,percentile:null,bandKey:null}},
   {metricKey:'other',referenceKind:'descriptive_sample',status:'UNAVAILABLE',reason:'insufficient_data'}]})))
  expect(scope).toHaveBeenCalledTimes(9)
  expect(reference).toHaveBeenCalledTimes(18)
  expect(reference.mock.calls.map(c=>c[1].unit.itemId)).toEqual(Array.from({length:6},()=>['item-0','item-1','item-2']).flat())
  expect(reference.mock.calls.every(c=>c[1].purpose==='HISTORY'&&c[1].contentHash===hash)).toBe(true)
  expect(mocks.get.mock.calls.map(c=>[c[1],c[2]])).toEqual([[mId,true],[referenceId,true],[rId,true]])
 })
 it.each(['source','family','hash'] as const)('rejects differing %s on another unit sharing a release',async kind=>{
  const f=sharedReleaseFixture(),unit=f.parent.trainingContentBinding.units[1]
  if(kind==='source')unit.source={...unit.source,id:'foreign'}
  if(kind==='family'){unit.family='COGNITIVE';unit.source={kind:'COGNITIVE_CONFIG',id:'source',ownerId:'owner',assignmentId:'assignment'}}
  if(kind==='hash')unit.measurement={...unit.measurement,contentHash:'b'.repeat(64)}
  f.rehash()
  await expect(prepareTrainingFinalReceipt({} as never,f.input)).rejects.toMatchObject({statusCode:409})
 })
 it('checks a different expected reference hash even when the release is cached',async()=>{
  const f=sharedReleaseFixture()
  f.parent.trainingContentBinding.units[0].referencePolicy.choices[1].contentHash='b'.repeat(64)
  f.parent.trainingReferenceBinding.units[0].references[1].contentHash='b'.repeat(64)
  f.rehash()
  await expect(prepareTrainingFinalReceipt({} as never,f.input)).rejects.toMatchObject({statusCode:409})
 })
 it.each(['revoked','quality','not-executed','unavailable'] as const)('preserves %s stop guards without reading unused reference releases',async mode=>{
  const f=sharedReleaseFixture(),reference=vi.spyOn(referenceSelectionModule,'validateTrainingReferenceRelease')
  if(mode==='revoked')f.measurement.status='REVOKED'
  if(mode==='quality')f.envelope.core.quality.status='invalid'
  if(mode==='not-executed')f.input.verifiedPayloads=[]
  if(mode==='unavailable'){
   for(const unit of f.parent.trainingReferenceBinding.units)unit.references=unit.references.map((s:any)=>({metricKey:s.metricKey,referenceKind:s.referenceKind,status:'UNAVAILABLE',reason:'NO_MATCH'}))
   f.rehash()
  }
  const result=(await prepareTrainingFinalReceipt({} as never,f.input))!
  const reason={revoked:'MEASUREMENT_REVOKED',quality:'QUALITY_UNAVAILABLE','not-executed':'NOT_EXECUTED',unavailable:'NO_MATCH'}[mode]
  for(const unit of result.receipt.interpretation.units)expect(unit.references).toEqual(['total','other'].map(metricKey=>({metricKey,referenceKind:'descriptive_sample',status:mode==='revoked'?'REVOKED':'UNAVAILABLE',reason})))
  expect(reference).not.toHaveBeenCalled()
  expect(mocks.get.mock.calls.map(c=>c[1])).toEqual([mId,rId])
 })
 it('retains validation for revoked references and rebuilds indexes each invocation',async()=>{
  const f=sharedReleaseFixture(),reference=vi.spyOn(referenceSelectionModule,'validateTrainingReferenceRelease')
  f.reference.status='REVOKED'
  const first=(await prepareTrainingFinalReceipt({} as never,f.input))!
  expect(first.receipt.interpretation.units.every(u=>u.references.every(r=>r.status==='REVOKED'))).toBe(true)
  expect(reference).toHaveBeenCalledTimes(18)
  f.parent.trainingContentBinding.units[2].source={...f.parent.trainingContentBinding.units[2].source,id:'changed-after-first-call'};f.rehash()
  await expect(prepareTrainingFinalReceipt({} as never,f.input)).rejects.toMatchObject({statusCode:409})
 })
})

it('does not reuse a successful measurement authority result on the next read',async()=>{
 const f=sharedReleaseFixture(),scope=vi.spyOn(contentBindingModule,'trainingMeasurementSourceScopeMatchesForConsumer')
 scope.mockResolvedValueOnce(true).mockResolvedValueOnce(true).mockResolvedValueOnce(true).mockResolvedValueOnce(false)
 await expect(prepareTrainingFinalReceipt({} as never,f.input)).rejects.toMatchObject({statusCode:409})
 expect(scope).toHaveBeenCalledTimes(4)
})
it('handles shared measurements without reference bindings and legacy null without release reads',async()=>{
 const f=fixture(),binding=f.input.parent.trainingContentBinding,scope=vi.spyOn(contentBindingModule,'trainingMeasurementSourceScopeMatchesForConsumer')
 binding.units=[0,1,2].map(i=>({...binding.units[0],itemId:`item-${i}`}))
 f.input.parent.trainingContentBindingHash=canonicalHash(binding)
 f.input.verifiedPayloads=binding.units.map(u=>({header:{slotKey:compositeItemSlotKey(u.itemId,'SCALE')},envelope:f.envelope}))
 const result=(await prepareTrainingFinalReceipt({} as never,f.input))!
 expect(result.receipt.schemaVersion).toBe(1)
 expect(result.receipt.interpretation.units.map(u=>u.references)).toEqual([[],[],[]])
 expect(scope).toHaveBeenCalledTimes(9)
 expect(mocks.get.mock.calls.map(c=>c[1])).toEqual([mId,rId])
 mocks.get.mockClear();scope.mockClear()
 expect(await prepareTrainingFinalReceipt({} as never,{...f.input,parent:{...f.input.parent,trainingContentBinding:null,trainingContentBindingHash:null}})).toBeNull()
 expect(mocks.get).not.toHaveBeenCalled();expect(scope).not.toHaveBeenCalled()
})

it.each(['SCHOOL','TEACHER','PLATFORM'])('routes %s frozen reports through exact bound report validation',async product=>{
 const f=fixture();f.report.scope=product==='PLATFORM'?{kind:'PLATFORM',product:'TRAINING',resourceId:'platform'}:{kind:'PRIVATE',product,ownerId:'owner',resourceId:'composite'}
 const db={} as never
 await expect(prepareTrainingFinalReceipt(db,f.input)).resolves.not.toBeNull()
 expect(mocks.educationReport).toHaveBeenCalledWith(db,expect.objectContaining({compositeId:'composite',ownerId:'owner',reportReleaseId:rId,publication:false}))
 mocks.educationReport.mockRejectedValue(new Error('CONTENT_EDUCATION_SCOPE_DENIED'))
 await expect(prepareTrainingFinalReceipt(db,f.input)).rejects.toThrow('CONTENT_EDUCATION_SCOPE_DENIED')
})
