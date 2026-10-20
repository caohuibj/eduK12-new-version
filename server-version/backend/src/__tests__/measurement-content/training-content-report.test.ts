import {beforeEach,afterEach,describe,it,expect,vi} from 'vitest'
const mocks=vi.hoisted(()=>({get:vi.fn(),disclosure:vi.fn()}))
vi.mock('../../modules/measurement-content/repository',()=>({getContentRelease:mocks.get}))
vi.mock('../../modules/composite/training-metric-disclosure',async importOriginal=>({...await importOriginal<typeof import('../../modules/composite/training-metric-disclosure')>(),loadTrainingMetricDisclosure:mocks.disclosure}))
import {DISCLOSURE_PRESETS} from '../../modules/scale/policy/disclosure'
import {prepareTrainingFinalReceipt} from '../../modules/composite/training-content-final'
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
beforeEach(()=>{vi.resetAllMocks();vi.stubEnv('DATA_ENCRYPTION_KEY','a'.repeat(64));mocks.disclosure.mockImplementation(async(_db,{core})=>({
 metricKeys:new Set(core.metrics.map((m:any)=>m.key)),referenceMetricKeys:new Set(core.metrics.map((m:any)=>m.key)),capabilities:DISCLOSURE_PRESETS.FULL_REPORT()}))})
afterEach(()=>vi.unstubAllEnvs())

import {readTrainingContentReports} from '../../modules/composite/training-content-report'
async function reportFixture(){
 const f=fixture();f.measurement.content.metrics=[{metricKey:'total',unit:'score'}]
 f.report.content.metricKeys=['total'];f.report.content.template={title:'Report',blocks:[{type:'METRIC',key:'total',metricKey:'total',display:'RAW'}],limitations:[]}
 const result=(await prepareTrainingFinalReceipt({} as never,f.input))!
 const parent={...f.input.parent,aggregateInputHash:hash,trainingContentInterpretationEncrypted:result.encrypted,trainingContentInterpretationHash:result.hash}
 const row={compositeAttemptId:parent.id,attemptEpoch:1,slotKey:compositeItemSlotKey('item','SCALE'),unitType:'SCALE',terminalState:'COMPLETED',payloadKind:'UNIT_RESULT',
  canonicalResultEncrypted:encryptUnifiedRuntimePayload(f.envelope),sourceType:'ASSESSMENT',sourceAttemptId:'child',sourceSubmissionId:null}
 const db={assessmentUnitSnapshot:{findMany:vi.fn().mockResolvedValue([row])}}
 return {...f,parent,row,db,result}
}
describe('Training authorized report reads use saved FINAL facts',()=>{
 it('renders only declared metrics with one bounded source query and actual canonical codec',async()=>{
  const f=await reportFixture(),result=await readTrainingContentReports(f.db as never,{parent:f.parent,audience:'teacher'})
  expect(result[0]).toMatchObject({status:'READY',rendered:{blocks:[{metricKey:'total',value:12}]}})
  expect(f.db.assessmentUnitSnapshot.findMany).toHaveBeenCalledTimes(1)
  expect(f.db.assessmentUnitSnapshot.findMany.mock.calls[0][0].where).toEqual({compositeAttemptId:'attempt',attemptEpoch:1,slotKey:{in:['scale:item']}})
  expect(result[0]).not.toHaveProperty('template');expect(result[0]).not.toHaveProperty('metrics')
 })
 it('keeps retired frozen templates and suppresses metrics outside the declared whitelist',async()=>{
  const f=await reportFixture();f.report.status='RETIRED';f.report.content.metricKeys=[]
  const result=await readTrainingContentReports(f.db as never,{parent:f.parent,audience:'teacher'})
  expect(result[0]).toMatchObject({status:'READY',lifecycleNotices:[{status:'RETIRED'}],rendered:{blocks:[{metricKey:'total',value:null,status:'UNAVAILABLE'}]}})
 })
 it('never reads facts or content for participants or legacy parents',async()=>{
  const f=await reportFixture();mocks.get.mockClear()
  expect(await readTrainingContentReports(f.db as never,{parent:f.parent,audience:'participant'})).toEqual([])
  expect(await readTrainingContentReports(f.db as never,{parent:{...f.parent,trainingContentInterpretationEncrypted:null,trainingContentInterpretationHash:null},audience:'researcher'})).toEqual([])
  expect(f.db.assessmentUnitSnapshot.findMany).not.toHaveBeenCalled();expect(mocks.get).not.toHaveBeenCalled()
 })
 it.each(['measurement','report'] as const)('does not newly render revoked %s; retains notice and receipt',async layer=>{
  const f=await reportFixture(),before=f.parent.trainingContentInterpretationEncrypted;f[layer].status='REVOKED'
  const result=await readTrainingContentReports(f.db as never,{parent:f.parent,audience:'teacher'})
  expect(result[0]).toMatchObject({status:'REVOKED',rendered:null,lifecycleNotices:[{status:'REVOKED'}]})
  expect(f.parent.trainingContentInterpretationEncrypted).toBe(before)
 })
 it('does not render a non-READY receipt or query its source',async()=>{
  const f=await reportFixture();const receipt=structuredClone(f.result.receipt);receipt.interpretation.units[0].report.status='UNAVAILABLE'
  f.parent.trainingContentInterpretationEncrypted=encryptUnifiedRuntimePayload(receipt);f.parent.trainingContentInterpretationHash=canonicalHash(receipt)
  const result=await readTrainingContentReports(f.db as never,{parent:f.parent,audience:'researcher'})
  expect(result[0]).toMatchObject({status:'UNAVAILABLE',rendered:null});expect(f.db.assessmentUnitSnapshot.findMany).not.toHaveBeenCalled()
 })
 it('rejects wrong epoch, slot, missing facts, hash or private scope',async()=>{
  for(const patch of [{attemptEpoch:2},{slotKey:'scale:other'},{terminalState:'FAILED'},{sourceAttemptId:'foreign'}]){
   const f=await reportFixture();Object.assign(f.row,patch);await expect(readTrainingContentReports(f.db as never,{parent:f.parent,audience:'teacher'})).rejects.toMatchObject({statusCode:409})
  }
  const missing=await reportFixture();missing.db.assessmentUnitSnapshot.findMany.mockResolvedValue([]);await expect(readTrainingContentReports(missing.db as never,{parent:missing.parent,audience:'teacher'})).rejects.toMatchObject({statusCode:409})
  const scope=await reportFixture();scope.report.scope.resourceId='other';await expect(readTrainingContentReports(scope.db as never,{parent:scope.parent,audience:'teacher'})).rejects.toMatchObject({statusCode:409})
  const changed=await reportFixture();changed.envelope.core.metrics[0].value=99;changed.envelope.resultHash=canonicalHash(changed.envelope.core);changed.row.canonicalResultEncrypted=encryptUnifiedRuntimePayload(changed.envelope)
  await expect(readTrainingContentReports(changed.db as never,{parent:changed.parent,audience:'teacher'})).rejects.toMatchObject({statusCode:409})
 })
 it.each(['teacher','researcher'] as const)('cannot promote hidden numeric facts through a declared %s template',async audience=>{
  const f=await reportFixture(),cipher=f.parent.trainingContentInterpretationEncrypted,digest=f.parent.trainingContentInterpretationHash
  mocks.disclosure.mockResolvedValue({metricKeys:new Set(),referenceMetricKeys:new Set(),capabilities:DISCLOSURE_PRESETS.FULL_REPORT()})
  const result=await readTrainingContentReports(f.db as never,{parent:f.parent,audience})
  expect(result[0]).toMatchObject({status:'UNAVAILABLE',rendered:null})
  expect(mocks.disclosure).toHaveBeenCalledWith(f.db,expect.objectContaining({parent:f.parent,source:f.row,audience,core:f.envelope.core}))
  expect(f.parent.trainingContentInterpretationEncrypted).toBe(cipher);expect(f.parent.trainingContentInterpretationHash).toBe(digest)
 })
 it('honors numeric capability and does not treat an allowed metric key as sufficient access',async()=>{
  const f=await reportFixture()
  mocks.disclosure.mockResolvedValue({metricKeys:new Set(['total']),referenceMetricKeys:new Set(['total']),capabilities:{...DISCLOSURE_PRESETS.FULL_REPORT(),numericScores:false}})
  expect((await readTrainingContentReports(f.db as never,{parent:f.parent,audience:'teacher'}))[0]).toMatchObject({status:'UNAVAILABLE',rendered:null})
 })
 it('does not derive a band when individual reference disclosure is unavailable',async()=>{
  const f=await reportFixture();f.report.content.template.blocks=[{type:'REFERENCE_BAND',metricKey:'total',referenceKind:'criterion_threshold',labels:{high:'High'}}]
  mocks.disclosure.mockResolvedValue({metricKeys:new Set(['total']),referenceMetricKeys:new Set(),capabilities:DISCLOSURE_PRESETS.FULL_REPORT()})
  expect((await readTrainingContentReports(f.db as never,{parent:f.parent,audience:'teacher'}))[0]).toMatchObject({status:'UNAVAILABLE',rendered:null})
 })
 it('does not swallow a frozen source identity failure as an empty report',async()=>{
  const f=await reportFixture();mocks.disclosure.mockRejectedValue(new Error('frozen disclosure identity'))
  await expect(readTrainingContentReports(f.db as never,{parent:f.parent,audience:'teacher'})).rejects.toThrow('frozen disclosure identity')
 })
})

it('reads a frozen static SJT report through exact persisted provenance, not an invented author or current source license',async()=>{
 const f=fixture('SJT'),mappingId='44444444-4444-4444-8444-444444444444',metricKey=f.envelope.core.metrics[0].key
 Object.assign(f.input.parent.trainingContentBinding.units[0],{source:{kind:'STATIC_SJT_REGISTRY',id:mappingId,instrumentKey:pkg.key,instrumentVersion:pkg.instrumentVersion}})
 f.input.parent.trainingContentBindingHash=canonicalHash(f.input.parent.trainingContentBinding)
 f.measurement.scope={kind:'PLATFORM'};f.measurement.content.instrumentVersion=pkg.instrumentVersion;f.measurement.content.metrics=[{metricKey,unit:'score'}]
 f.measurement.provenance={sourceKind:'STATIC_SJT_REGISTRY',mappingId,contentDigest:hash,instrumentKey:pkg.key,instrumentVersion:pkg.instrumentVersion}
 f.report.content.metricKeys=[metricKey];f.report.content.template={title:'SJT',blocks:[{type:'METRIC',key:'metric',metricKey,display:'RAW'}],limitations:[]}
 const result=(await prepareTrainingFinalReceipt({} as never,f.input))!
 const parent={...f.input.parent,aggregateInputHash:hash,trainingContentInterpretationEncrypted:result.encrypted,trainingContentInterpretationHash:result.hash}
 const row={compositeAttemptId:parent.id,attemptEpoch:1,slotKey:compositeItemSlotKey('item','SITUATIONAL'),unitType:'SITUATIONAL',terminalState:'COMPLETED',payloadKind:'UNIT_RESULT',
  canonicalResultEncrypted:encryptUnifiedRuntimePayload(f.envelope),sourceType:'SITUATIONAL_ATTEMPT',sourceAttemptId:'child',sourceSubmissionId:null}
 const db={assessmentUnitSnapshot:{findMany:vi.fn().mockResolvedValue([row])}}
 expect((await readTrainingContentReports(db as never,{parent,audience:'teacher'}))[0].status).toBe('READY')
 f.measurement.provenance.mappingId='foreign'
 await expect(readTrainingContentReports(db as never,{parent,audience:'teacher'})).rejects.toMatchObject({statusCode:409})
})
