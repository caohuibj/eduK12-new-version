import {afterEach,beforeEach,describe,expect,it,vi} from 'vitest'
import {loadTrainingMetricDisclosure,trainingCognitiveMetricKeys,trainingReportDisclosureAllowed} from '../../modules/composite/training-metric-disclosure'
import {encryptCognitivePayload} from '../../modules/cognitive/cognitive.security'
import {encryptUnifiedRuntimePayload} from '../../modules/assessment-runtime/security'
import {createFrozenScaleRuntimeSnapshot} from '../../modules/assessment-runtime/runtime-snapshot'
import {createFrozenScaleRuntimeSnapshotV2FromV1} from '../../modules/assessment-runtime/runtime-snapshot-v2'
import {getScaleInstrumentSource} from '../../modules/scale/onboarding/instrument-registry'
import {compileScalePolicy} from '../../modules/scale/policy/compile'
import {DISCLOSURE_PRESETS} from '../../modules/scale/policy/disclosure'
import {renderDeclaredReport} from '../../modules/measurement-content/report-renderer'

const h='a'.repeat(64)
beforeEach(()=>vi.stubEnv('DATA_ENCRYPTION_KEY','b'.repeat(64)))
afterEach(()=>vi.unstubAllEnvs())
const metric=(key:string,role='primary',availableProfiles=['standard','research'],valueType='number')=>({key,role,availableProfiles,valueType,unit:'score'})
function cognitive(){
 const report:any={profile:'research',metricDefinitions:{
  accuracy:metric('accuracy'),blockSlopeRt:metric('blockSlopeRt','research_only',['research']),
  sequenceErrorDistance:metric('sequenceErrorDistance','research_only',['research']),
  delayed:metric('delayed','primary',['research']),processCount:metric('processCount','quality'),
  productIndex:metric('productIndex'),product_index:metric('product_index'),matrix:metric('matrix','secondary',['standard','research'],'object'),
 },v2MetricDefinitions:{accuracy:{referenceEligible:true},processCount:{referenceEligible:false}}}
 const child:any={id:'child',compositeAttemptId:'attempt',compositeItemId:'item',assignmentId:'assignment',configId:'config',
  status:'COMPLETED',deliveryMode:'FINAL_ONLY',runtimeGeneration:'UNIFIED_V1',submissionId:'submit',compiledRuntimeHash:h,
  testType:'cpt',engineVersion:'2',scoringVersion:'1',
  assignment:{id:'assignment',createdBy:'owner',configId:'config',profile:'research',resolvedConfigHash:h,resolvedReportSnapshotEncrypted:encryptCognitivePayload(report)}}
 const core:any={unitType:'COGNITIVE',instrumentKey:'cpt',instrumentVersion:'2',scorerVersion:'1',compiledRuntimeHash:h,
  scientificProvenance:{profileKey:'research',resolvedConfigHash:h},metrics:[{key:'accuracy',value:0.8}],quality:{status:'interpretable',flags:[]}}
 const unit:any={itemId:'item',family:'COGNITIVE',source:{kind:'COGNITIVE_CONFIG',id:'config',assignmentId:'assignment',ownerId:'owner'}}
 const db:any={cognitiveSession:{findUnique:vi.fn(async()=>child)}}
 const input={parent:{id:'attempt',attemptEpoch:1},unit,source:{sourceType:'COGNITIVE_SESSION',sourceAttemptId:'child',sourceSubmissionId:'submit'},audience:'teacher' as const,core}
 return {report,child,core,unit,db,input}
}
function scale(capabilities=DISCLOSURE_PRESETS.FULL_REPORT(),legacyClass?:'STANDARD'|'CUSTOM_DESCRIPTIVE',researcher=DISCLOSURE_PRESETS.FULL_REPORT()){
 const source=getScaleInstrumentSource('adexi_v1','2.0.0')!
 const v1=createFrozenScaleRuntimeSnapshot({instrumentKey:legacyClass?'unregistered_training_scale':source.identity.instrumentKey,
  instrumentVersion:source.identity.instrumentVersion,definition:source.executable!.definition,frozenAt:new Date('2026-10-20T00:00:00Z')})
 const runtime=legacyClass?v1:createFrozenScaleRuntimeSnapshotV2FromV1(v1,compileScalePolicy({...source,disclosure:{...source.disclosure!,
  audiences:{teacher:capabilities,researcher}}}))
 const child:any={id:'child',compositeAttemptId:'attempt',compositeItemId:'item',attemptEpoch:1,scaleId:'scale',
  status:'COMPLETED',deliveryMode:'FINAL_ONLY',runtimeGeneration:'UNIFIED_V1',submissionId:'submit',
  compiledRuntimeHash:runtime.compiledRuntime.compiledRuntimeHash,runtimeSnapshotEncrypted:encryptUnifiedRuntimePayload(runtime),
  scale:{id:'scale',instrumentClass:legacyClass??'STANDARD'}}
 const core:any={unitType:'SCALE',instrumentKey:runtime.instrumentKey,instrumentVersion:runtime.instrumentVersion,
  compiledRuntimeHash:runtime.compiledRuntime.compiledRuntimeHash,sourceDefinitionHash:runtime.sourceDefinitionHash,scorerVersion:runtime.compiledRuntime.scorerVersion,
  metrics:Object.keys(runtime.compiledRuntime.metricDefinitions).map(key=>({key,value:1})),quality:{status:'interpretable',flags:[]}}
 const db:any={assessment:{findUnique:vi.fn(async()=>child)}},unit:any={itemId:'item',family:'SCALE',source:{kind:'SCALE',id:'scale',ownerId:'owner'}}
 const input={parent:{id:'attempt',attemptEpoch:1},unit,source:{sourceType:'ASSESSMENT',sourceAttemptId:'child',sourceSubmissionId:'submit'},audience:'teacher' as const,core}
 return {runtime,child,core,db,input,key:core.metrics[0].key as string}
}
describe('Training shared frozen per-unit disclosure ceiling',()=>{
 it('keeps the participant subject ceiling independent from teacher scores and cognitive research-only keys',async()=>{
  const f=scale(),teacher=await loadTrainingMetricDisclosure(f.db,f.input)
  const participant=await loadTrainingMetricDisclosure(f.db,{...f.input,audience:'participant'})
  expect(teacher.metricKeys.has(f.key)).toBe(true)
  expect(participant.metricKeys.size).toBe(0)
  const c=cognitive(),own=await loadTrainingMetricDisclosure(c.db,{...c.input,audience:'participant'})
  expect([...own.metricKeys]).toEqual(['accuracy','processCount'])
  expect(own.metricKeys.has('blockSlopeRt')).toBe(false)
 })
 it('excludes research-only, nonstandard, product index and nonnumeric cognitive metrics, while preserving standard and QC facts',async()=>{
  const f=cognitive(),before=JSON.stringify({child:f.child,core:f.core,unit:f.unit})
  const result=await loadTrainingMetricDisclosure(f.db,f.input)
  expect([...result.metricKeys]).toEqual(['accuracy','processCount'])
  expect([...result.referenceMetricKeys]).toEqual(['accuracy'])
  expect([...trainingCognitiveMetricKeys(null)]).toEqual([])
  expect(JSON.stringify({child:f.child,core:f.core,unit:f.unit})).toBe(before)
  const select=f.db.cognitiveSession.findUnique.mock.calls[0][0].select
  expect(select).not.toHaveProperty('metricsEncrypted');expect(select).not.toHaveProperty('resultSnapshotEncrypted');expect(select).not.toHaveProperty('trials')
 })
 it('does not promote an ADMIN-derived researcher label or a researcher template into extra cognitive data permission',async()=>{
  const f=cognitive(),result=await loadTrainingMetricDisclosure(f.db,{...f.input,audience:'researcher'})
  expect(result.metricKeys.has('blockSlopeRt')).toBe(false);expect(result.metricKeys.has('sequenceErrorDistance')).toBe(false)
  expect(trainingReportDisclosureAllowed(result,{metricKeys:['blockSlopeRt'],template:{blocks:[{type:'METRIC',metricKey:'blockSlopeRt',display:'RAW'}],limitations:[]}})).toBe(false)
 })
 it.each(['parent','item','assignment','config','submission','profile','runtime','provenance'])('rejects a mismatched cognitive %s source',async failure=>{
  const f=cognitive()
  if(failure==='parent')f.child.compositeAttemptId='other'
  if(failure==='item')f.child.compositeItemId='other'
  if(failure==='assignment')f.child.assignmentId='other'
  if(failure==='config')f.child.configId='other'
  if(failure==='submission')f.child.submissionId='other'
  if(failure==='profile')f.child.assignment.profile='standard'
  if(failure==='runtime')f.core.compiledRuntimeHash='other'
  if(failure==='provenance')f.core.scientificProvenance.resolvedConfigHash='other'
  await expect(loadTrainingMetricDisclosure(f.db,f.input)).rejects.toThrow('DISCLOSURE_SOURCE_INVALID')
 })
 it('retains QC numeric diagnostics without allowing them to acquire individual reference interpretation',async()=>{
  const f=cognitive(),result=await loadTrainingMetricDisclosure(f.db,f.input)
  const template:any={blocks:[{type:'METRIC',metricKey:'processCount',display:'RAW'}],limitations:[]}
  expect(trainingReportDisclosureAllowed(result,{metricKeys:['processCount'],template})).toBe(true)
  template.blocks[0].display='REFERENCE_RESULT'
  expect(trainingReportDisclosureAllowed(result,{metricKeys:['processCount'],template})).toBe(false)
  expect(renderDeclaredReport({...template,blocks:[{type:'METRIC',metricKey:'processCount',display:'RAW'}]},
   [{metricKey:'processCount',value:99,unit:'count',status:'INVALID'}],[]).blocks).toContainEqual(expect.objectContaining({value:null,status:'INVALID'}))
 })
 it('uses the frozen Scale V2 policy, independently gates references, and never reads answers or result bodies',async()=>{
  const f=scale(DISCLOSURE_PRESETS.SCORES()),before=JSON.stringify(f.child),result=await loadTrainingMetricDisclosure(f.db,f.input)
  expect(result.metricKeys.has(f.key)).toBe(true);expect(result.referenceMetricKeys.size).toBe(0)
  expect(result.capabilities.rawAnswers).toBe(false);expect(result.capabilities.itemScores).toBe(false)
  const raw:any={metricKeys:[f.key],template:{blocks:[{type:'METRIC',metricKey:f.key,display:'RAW'}],limitations:[]}}
  expect(trainingReportDisclosureAllowed(result,raw)).toBe(true);raw.template.blocks[0].display='REFERENCE_RESULT'
  expect(trainingReportDisclosureAllowed(result,raw)).toBe(false)
  expect(JSON.stringify(f.child)).toBe(before)
  const select=f.db.assessment.findUnique.mock.calls[0][0].select
  expect(select).not.toHaveProperty('answers');expect(select).not.toHaveProperty('result')
 })
 it('cannot promote researcher disclosure over an educational-only frozen teacher policy',async()=>{
  const f=scale(DISCLOSURE_PRESETS.EDUCATIONAL_ONLY()),result=await loadTrainingMetricDisclosure(f.db,{...f.input,audience:'researcher'})
  expect(result.metricKeys.size).toBe(0);expect(result.referenceMetricKeys.size).toBe(0);expect(result.capabilities.numericScores).toBe(false)
 })
 it('also retains a stricter frozen researcher audience restriction rather than replacing it with teacher permission',async()=>{
  const f=scale(DISCLOSURE_PRESETS.FULL_REPORT(),undefined,DISCLOSURE_PRESETS.NONE())
  expect((await loadTrainingMetricDisclosure(f.db,f.input)).metricKeys.has(f.key)).toBe(true)
  expect((await loadTrainingMetricDisclosure(f.db,{...f.input,audience:'researcher'})).metricKeys.size).toBe(0)
 })
 it('preserves only explicit V1 custom-descriptive compatibility and denies unknown standard instruments',async()=>{
  const custom=scale(DISCLOSURE_PRESETS.FULL_REPORT(),'CUSTOM_DESCRIPTIVE')
  expect((await loadTrainingMetricDisclosure(custom.db,custom.input)).metricKeys.has(custom.key)).toBe(true)
  const unknown=scale(DISCLOSURE_PRESETS.FULL_REPORT(),'STANDARD')
  expect((await loadTrainingMetricDisclosure(unknown.db,unknown.input)).metricKeys.size).toBe(0)
 })
 it.each(['epoch','scale','submission','hash','snapshot'])('fails closed for Scale %s corruption',async failure=>{
  const f=scale()
  if(failure==='epoch')f.child.attemptEpoch=2
  if(failure==='scale')f.child.scaleId='other'
  if(failure==='submission')f.child.submissionId='other'
  if(failure==='hash')f.core.sourceDefinitionHash='other'
  if(failure==='snapshot')f.child.runtimeSnapshotEncrypted='broken'
  await expect(loadTrainingMetricDisclosure(f.db,f.input)).rejects.toThrow()
 })
})
