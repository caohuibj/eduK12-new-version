import {afterEach,beforeEach,describe,expect,it,vi} from 'vitest'
import {loadTrainingMetricDisclosure} from '../../modules/composite/training-metric-disclosure'
import {requireCognitiveRegistryEntry} from '../../modules/cognitive/cognitive.registry'
import {freezeAssignmentProfile,hashResolvedConfig} from '../../modules/cognitive/profile-freeze'
import {encryptCognitivePayload,decryptCognitivePayload} from '../../modules/cognitive/cognitive.security'
import {getCognitiveV2TaskDefinition} from '../../modules/cognitive/v2/registry'
import {createSessionConfigSnapshot} from '../../modules/cognitive/v2/session-snapshot'
import {compileCognitiveRuntime} from '../../modules/assessment-runtime/compiler'

beforeEach(()=>vi.stubEnv('DATA_ENCRYPTION_KEY','b'.repeat(64)))
afterEach(()=>vi.unstubAllEnvs())
function fixture(){
 const entry=requireCognitiveRegistryEntry('gonogo','1.0.0','1.0.0')
 const freeze=freezeAssignmentProfile({entry,profile:'standard',baseConfig:{totalTrials:120,nogoRatio:0.25,stimulusMs:800,isiMs:500,
  validRtFloorMs:100,report:{reportVersion:'1.0.0',referenceMode:'none'}}})
 const definition=getCognitiveV2TaskDefinition('gonogo','1.0.0','1.0.0')!
 const compiledRuntime=compileCognitiveRuntime({definition,instrumentVersion:'1.0.0'})
 const snapshot=createSessionConfigSnapshot({definition,configVersion:'fixture-version',config:freeze.resolvedConfig,
  runtime:{runtimeGeneration:'UNIFIED_V1',compiledRuntime,referenceBindings:[]}})
 const published:any={id:'published',createdBy:'owner',configId:'config',courseId:null,listedStandalone:false,quotaSourceAssignmentId:'origin',
  profile:freeze.profile,profileDefinitionVersion:freeze.profileDefinitionVersion,resolvedConfigHash:freeze.resolvedConfigHash,
  resolvedConfigSnapshotEncrypted:freeze.resolvedConfigSnapshotEncrypted,resolvedReportSnapshotEncrypted:freeze.resolvedReportSnapshotEncrypted,
  config:{testType:'gonogo',configVersion:'fixture-version',engineVersion:'1.0.0',scoringVersion:'1.0.0'}}
 const delivered:any={...published,id:'delivery',courseId:'course'}
 const child:any={id:'child',compositeAttemptId:'attempt',compositeItemId:'item',assignmentId:delivered.id,assignment:delivered,
  configId:'config',status:'COMPLETED',deliveryMode:'FINAL_ONLY',runtimeGeneration:'UNIFIED_V1',submissionId:'submit',
  ...published.config,compiledRuntimeHash:compiledRuntime.compiledRuntimeHash,configSnapshotEncrypted:encryptCognitivePayload(snapshot),
  compositeAttempt:{deliveryCourseId:'course'}}
 const core:any={unitType:'COGNITIVE',instrumentKey:'gonogo',instrumentVersion:'1.0.0',scorerVersion:'1.0.0',
  sourceDefinitionHash:compiledRuntime.sourceDefinitionHash,compiledRuntimeHash:compiledRuntime.compiledRuntimeHash,
  scientificProvenance:{profileKey:'standard',resolvedConfigHash:freeze.resolvedConfigHash}}
 const db:any={cognitiveSession:{findUnique:vi.fn(async()=>child)},cognitiveAssignment:{findUnique:vi.fn(async()=>published)}}
 const input:any={parent:{id:'attempt',attemptEpoch:1},unit:{itemId:'item',family:'COGNITIVE',
  source:{kind:'COGNITIVE_CONFIG',id:'config',assignmentId:'published',ownerId:'owner'}},
  source:{sourceType:'COGNITIVE_SESSION',sourceAttemptId:'child',sourceSubmissionId:'submit'},audience:'teacher',core}
 return {published,delivered,child,core,db,input,snapshot}
}
describe('Exact frozen Cognitive COURSE delivery wrapper disclosure',()=>{
 it('accepts the real separate delivery wrapper without rewriting its published source or reading raw results',async()=>{
  const f=fixture(),before=JSON.stringify({published:f.published,child:f.child,core:f.core})
  const result=await loadTrainingMetricDisclosure(f.db,f.input)
  expect(result.metricKeys.has('hitRate')).toBe(true);expect(result.metricKeys.has('commissionRate')).toBe(true)
  expect(f.db.cognitiveAssignment.findUnique).toHaveBeenCalledExactlyOnceWith(expect.objectContaining({where:{id:'published'}}))
  expect(JSON.stringify({published:f.published,child:f.child,core:f.core})).toBe(before)
  const select=f.db.cognitiveSession.findUnique.mock.calls[0][0].select
  for(const key of ['resultSnapshotEncrypted','metricsEncrypted','trials','rawSubmissions'])expect(select).not.toHaveProperty(key)
 })
 it('validates the stored session configuration even when the caller requests only a metric dictionary',async()=>{
  const f=fixture();delete f.input.core
  expect((await loadTrainingMetricDisclosure(f.db,f.input)).metricKeys.has('hitRate')).toBe(true)
  f.child.configSnapshotEncrypted=encryptCognitivePayload({...f.snapshot,configVersion:'other'})
  await expect(loadTrainingMetricDisclosure(f.db,f.input)).rejects.toThrow('DISCLOSURE_SOURCE_INVALID')
 })
 it('preserves the historical same-assignment path without reading a live replacement source',async()=>{
  const f=fixture();f.child.assignmentId=f.published.id;f.child.assignment=f.published
  expect((await loadTrainingMetricDisclosure(f.db,f.input)).metricKeys.has('hitRate')).toBe(true)
  expect(f.db.cognitiveAssignment.findUnique).not.toHaveBeenCalled()
 })
 it.each(['owner','source-owner','source-config','course','parent-course','standalone','source-course','source-standalone','quota',
  'profile','profile-version','config-hash','source-config-body','delivered-config-body','report-body','engine','scoring','config-version',
  'compiled-runtime','source-definition','missing-source'])( 'denies substituted wrapper %s identity',async failure=>{
  const f=fixture()
  if(failure==='owner')f.delivered.createdBy='other'
  if(failure==='source-owner')f.published.createdBy='other'
  if(failure==='source-config')f.published.configId='other'
  if(failure==='course')f.delivered.courseId='other'
  if(failure==='parent-course')f.child.compositeAttempt.deliveryCourseId=null
  if(failure==='standalone')f.delivered.listedStandalone=true
  if(failure==='source-course')f.published.courseId='course'
  if(failure==='source-standalone')f.published.listedStandalone=true
  if(failure==='quota')f.delivered.quotaSourceAssignmentId='other'
  if(failure==='profile')f.delivered.profile='research'
  if(failure==='profile-version')f.delivered.profileDefinitionVersion='other'
  if(failure==='config-hash')f.delivered.resolvedConfigHash='f'.repeat(64)
  if(failure==='source-config-body')f.published.resolvedConfigSnapshotEncrypted=encryptCognitivePayload({stimulusMs:900})
  if(failure==='delivered-config-body')f.delivered.resolvedConfigSnapshotEncrypted=encryptCognitivePayload({stimulusMs:900})
  if(failure==='report-body')f.published.resolvedReportSnapshotEncrypted=encryptCognitivePayload({
   ...decryptCognitivePayload<Record<string,unknown>>(f.published.resolvedReportSnapshotEncrypted),reportCaveats:['different']})
  if(failure==='engine')f.child.engineVersion='other'
  if(failure==='scoring')f.child.scoringVersion='other'
  if(failure==='config-version')f.child.configVersion='other'
  if(failure==='compiled-runtime')f.child.compiledRuntimeHash='f'.repeat(64)
  if(failure==='source-definition')f.core.sourceDefinitionHash='f'.repeat(64)
  if(failure==='missing-source')f.db.cognitiveAssignment.findUnique.mockResolvedValue(null)
  await expect(loadTrainingMetricDisclosure(f.db,f.input)).rejects.toThrow('DISCLOSURE_SOURCE_INVALID')
 })
 it('rejects two matching substituted assignment configs when the accepted session froze different parameters',async()=>{
  const f=fixture(),changed={...f.snapshot.config as Record<string,unknown>,stimulusMs:900},hash=hashResolvedConfig(changed)
  for(const assignment of [f.published,f.delivered]){assignment.resolvedConfigHash=hash;assignment.resolvedConfigSnapshotEncrypted=encryptCognitivePayload(changed)}
  f.core.scientificProvenance.resolvedConfigHash=hash
  await expect(loadTrainingMetricDisclosure(f.db,f.input)).rejects.toThrow('DISCLOSURE_SOURCE_INVALID')
 })
})
