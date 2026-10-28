import {describe,it,expect,vi} from 'vitest'
vi.mock('dotenv',()=>({default:{config:()=>({parsed:{}})}}))
import {antConfig,antGuidedConfig,antPlan,antTrialEnvelope,ANT_GUIDED_IDENTITY,type AntConfig,type AntTrial} from '../../modules/cognitive/content-candidates/ant/protocol'
import {antConfigSchema,antGuidedConfigSchema} from '../../modules/cognitive/content-candidates/ant/schema'
import {antGuidedDefinition,createAntGuidedSnapshot,createAntSnapshot} from '../../modules/cognitive/content-candidates/ant/package'
import {scoreAnt,scoreAntGuided} from '../../modules/cognitive/content-candidates/ant/scorer'
import {getCognitiveTaskResource,assertNativeDeliverySupported} from '../../modules/cognitive/task-resource'
import {freezeNativeAssignmentProfile,readFrozenReport} from '../../modules/cognitive/profile-freeze'
import {projectThreeLayerReport} from '../../modules/cognitive/v2/report'
const seed='ant-guided-contract'
const records=(config:AntConfig)=>antPlan(config,seed).map((p):AntTrial=>{
 const start=p.trialIndex*4000,cue=start+p.plannedPreCueMs,onset=cue+500,at=onset+450
 return {...p,phase:'test',recordOrigin:'live',clock:{source:'performance',timeOriginUnixMs:1700000000000},startedAtPerfMs:start,
  cueOnsetPerfMs:cue,cueOffsetPerfMs:cue+100,targetOnsetPerfMs:onset,targetOffsetPerfMs:at,endedAtPerfMs:start+4000,
  events:[{direction:p.direction,input:'touch',atPerfMs:at,repeat:false,held:false}],responseIndex:0,timedOut:false,eventOverflow:false,interruptions:[]}
}).map(antTrialEnvelope)
describe('ANT guided practice frozen identity',()=>{
 it.each(['research','experience'] as const)('keeps %s formal truth/scoring equal and rejects cross-version invocation',profile=>{
  const old=createAntSnapshot(profile),current=createAntGuidedSnapshot(profile)
  expect(current.configVersion).toBe('1.1.0');expect(current.engineVersion).toBe('1.1.0');expect(old.config.practiceTrials).toBe(24)
  expect(antPlan(current.config,seed)).toEqual(antPlan(old.config,seed))
  const trials=records(old.config)
  expect(scoreAntGuided({session:current,config:current.config,randomSeed:seed,trials})).toEqual(scoreAnt({session:old,config:old.config,randomSeed:seed,trials}))
  expect(()=>scoreAntGuided({session:old,config:old.config,randomSeed:seed,trials})).toThrow('Unsupported frozen ANT')
  expect(()=>scoreAnt({session:current,config:current.config,randomSeed:seed,trials})).toThrow('Unsupported frozen ANT')
 })
 it('creates balanced bounded practice rounds and compares JSON objects without insertion-order dependence',()=>{
  const config=antGuidedConfig('experience'),first=antPlan(config,seed,'practice',0),second=antPlan(config,seed,'practice',1)
  expect(first).toHaveLength(8);expect(second).not.toEqual(first)
  expect(first.filter(p=>p.direction==='left')).toHaveLength(4)
  expect(first.filter(p=>p.location==='top')).toHaveLength(4)
  for(const cue of ['none','central','double','spatial_valid'])expect(first.filter(p=>p.cue===cue)).toHaveLength(2)
  const reordered={...config,practicePolicy:Object.fromEntries(Object.entries(config.practicePolicy).reverse())} as typeof config
  expect(antPlan(reordered,seed,'practice')).toEqual(first)
  expect(()=>antPlan(config,seed,'practice',3)).toThrow('round out of bounds')
  expect(antConfigSchema.safeParse(config).success).toBe(false)
  expect(antGuidedConfigSchema.safeParse(antConfig('experience')).success).toBe(false)
  expect(antGuidedConfigSchema.safeParse({...config,practicePolicy:{...config.practicePolicy,minimumCorrect:1}}).success).toBe(false)
 })
 it.each(['research','experience'] as const)('freezes %s display names while admitting the implemented authenticated native transport only',profile=>{
  const resource=getCognitiveTaskResource('ant','1.1.0','1.1.0')!
  if(resource.kind!=='native')throw Error('Expected native definition')
  expect(resource.configVersion).toBe('1.1.0');expect(resource.definition).toBe(antGuidedDefinition)
  expect(()=>assertNativeDeliverySupported(resource,'authenticated')).not.toThrow()
  expect(()=>assertNativeDeliverySupported(resource,'public')).toThrow()
  const frozen=freezeNativeAssignmentProfile({resource,profile,baseConfig:antGuidedConfig(profile)}),snapshot=readFrozenReport(frozen.resolvedReportSnapshotEncrypted)!
  const session=createAntGuidedSnapshot(profile),score=scoreAntGuided({session,config:session.config,randomSeed:seed,trials:records(session.config)})
  const report=projectThreeLayerReport({participantPresentation:snapshot.participantPresentation,testType:'ant',engineVersion:ANT_GUIDED_IDENTITY.engineVersion,
   scoringVersion:ANT_GUIDED_IDENTITY.scoringVersion,configVersion:ANT_GUIDED_IDENTITY.configVersion,protocolSignature:session.protocolSignature,profile,
   definition:antGuidedDefinition.report,metrics:score.metrics,score,metricDefinitions:antGuidedDefinition.metrics,qualityDefinitions:antGuidedDefinition.quality})
  expect(report.profileLabel).toBe(profile==='research'?'科研版':'实用版')
  expect(snapshot.presentationVersion).toBe('1.0.0');expect(snapshot.participantPresentation?.hiddenMetrics).toEqual([])
  const legacy=getCognitiveTaskResource('ant','1.0.0','1.1.0')
  expect(legacy?.kind==='native'&&legacy.configVersion).toBe('1.0.0')
 })
})
