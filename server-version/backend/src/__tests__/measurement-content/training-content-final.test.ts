import {beforeEach,afterEach,describe,it,expect,vi} from 'vitest'
const mocks=vi.hoisted(()=>({get:vi.fn()}))
vi.mock('../../modules/measurement-content/repository',()=>({getContentRelease:mocks.get}))
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
