vi.mock('dotenv', () => ({ default: { config: () => ({ parsed: {} }) } }))
import { afterEach,describe,it,expect,vi } from 'vitest'
import { getCognitiveV2TaskDefinition,listCognitiveV2TaskDefinitions,buildCognitiveV2TaskDefinition } from '../../modules/cognitive/v2/registry'
import { listNativeCognitiveTaskDefinitions } from '../../modules/cognitive/content-candidates/native-registry/definitions'
import { validateTaskDefinition,assertTaskContractValid } from '../../modules/cognitive/v2/publication-gate'
import { auditCognitiveV2Registry } from '../../modules/cognitive/v2/audit'
import { getCognitiveRegistryEntry,listCognitiveRegistryEntries } from '../../modules/cognitive/cognitive.registry'
import { runAuthoritativeScorer } from '../../modules/cognitive/v2/authoritative-scorer'
import { projectThreeLayerReport } from '../../modules/cognitive/v2/report'
import { createMotSnapshot,motDefinition } from '../../modules/cognitive/content-candidates/mot/package'
import { createEnumerationSnapshot,enumerationDefinition,enumerationRecipeDefinition } from '../../modules/cognitive/content-candidates/enumeration/package'
import { createRecognitionSnapshot,recognitionDefinition } from '../../modules/cognitive/content-candidates/continuous-recognition/package'
import { createAntSnapshot,antDefinition,antGuidedDefinition } from '../../modules/cognitive/content-candidates/ant/package'
import { antPlan,antTrialEnvelope,type AntTrial } from '../../modules/cognitive/content-candidates/ant/protocol'
import { createSessionConfigSnapshot } from '../../modules/cognitive/v2/session-snapshot'
import type { TaskDefinition } from '../../modules/cognitive/v2/types'
const native=[motDefinition,enumerationDefinition,recognitionDefinition,antDefinition] as unknown as TaskDefinition<unknown,unknown>[]
const key=(d:{testType:string;engineVersion:string;scoringVersion:string})=>`${d.testType}/${d.engineVersion}/${d.scoringVersion}`
const snapshot=(type:string)=>type==='mot'?createMotSnapshot('experience'):type==='enumeration'?createEnumerationSnapshot('experience'):
 type==='continuous-recognition'?createRecognitionSnapshot('experience',Array.from({length:80},(_,i)=>'registry-asset-'+i),Array.from({length:6},(_,i)=>'registry-practice-'+i)):
 createAntSnapshot('experience')
afterEach(()=>vi.restoreAllMocks())
describe('Explicit native v2 registry admission',()=>{
 it.each(native)('production resolver returns the same authoritative $testType object without legacy adaptation',definition=>{
  const resolved=getCognitiveV2TaskDefinition(definition.testType,definition.engineVersion,definition.scoringVersion)
  expect(resolved).toBe(definition);expect(resolved?.scorer).toBe(definition.scorer)
  expect(getCognitiveRegistryEntry(definition.testType,definition.engineVersion,definition.scoringVersion)).toBeUndefined()
  expect(Object.keys(resolved!.profiles).sort()).toEqual(['experience','research'])
  expect(resolved!.profiles.standard).toBeUndefined();expect(Object.prototype.hasOwnProperty.call(resolved,'score')).toBe(false)
 })
 it.each(native)('$testType native FINAL scorer runs without any legacy score invocation',definition=>{
  const legacySpies=listCognitiveRegistryEntries().map(entry=>vi.spyOn(entry,'score'))
  const resolved=getCognitiveV2TaskDefinition(definition.testType,definition.engineVersion,definition.scoringVersion)!
  const result=runAuthoritativeScorer({definition:resolved,session:snapshot(definition.testType),trials:[],randomSeed:'native-registry-test'})
  expect(result.audit.trialCount).toBe(0);expect(result.audit.scorerVersion).toBe(definition.scoringVersion)
  expect(result).not.toHaveProperty('score');expect(result.metrics).not.toHaveProperty('score')
  expect(result.quality.state).toBe('invalid');expect(result.quality.flags).not.toHaveProperty('legacyUninterpretable')
  for(const spy of legacySpies)expect(spy).not.toHaveBeenCalled()
 })
 it.each(native)('$testType accepts exactly its two real profiles and keeps all report visibility checks',definition=>{
  expect(validateTaskDefinition(definition).filter(i=>i.severity==='error')).toEqual([])
  expect(()=>assertTaskContractValid(definition)).not.toThrow()
  for(const profile of ['research','experience'] as const){
   const missing={...definition,profiles:{...definition.profiles}};delete missing.profiles[profile]
   expect(validateTaskDefinition(missing)).toEqual(expect.arrayContaining([expect.objectContaining({path:'profiles.'+profile,severity:'error'})]))
  }
  const alias={...definition,profiles:{...definition.profiles,standard:definition.profiles.experience}}
  expect(validateTaskDefinition(alias)).toEqual(expect.arrayContaining([expect.objectContaining({path:'profiles.standard',severity:'error'})]))
  for(const metric of definition.report.headlineMetrics)expect(definition.metrics[metric].visibility).toBe('headline')
  for(const metric of definition.report.userMetrics)expect(definition.metrics[metric].visibility).toBe('user')
 })
 it('rejects unknown exact native tuples without choosing latest or crossing scorer versions',()=>{
  for(const d of native){
   expect(getCognitiveV2TaskDefinition(d.testType,d.engineVersion,'unknown')).toBeUndefined()
   expect(getCognitiveV2TaskDefinition(d.testType,'unknown',d.scoringVersion)).toBeUndefined()
  }
  expect(getCognitiveV2TaskDefinition('ant','1.0.0','1.0.0')).toBeUndefined()
  expect(getCognitiveV2TaskDefinition('unknown-task','1.0.0','1.0.0')).toBeUndefined()
 })
 it('covers the exact combined inventory and rejects missing, duplicate or cloned native backing',()=>{
  const expectedNative=[motDefinition,enumerationDefinition,enumerationRecipeDefinition,recognitionDefinition,antDefinition,antGuidedDefinition]
  const definitions=listCognitiveV2TaskDefinitions(),legacy=listCognitiveRegistryEntries(),expected=[...legacy,...expectedNative].map(key).sort()
  expect(definitions.map(key).sort()).toEqual(expected);expect(new Set(expected).size).toBe(expected.length)
  expect(listNativeCognitiveTaskDefinitions()).toEqual(expectedNative)
  expect(auditCognitiveV2Registry(definitions).status).toBe('PASS')
  expect(auditCognitiveV2Registry(definitions.filter(d=>d!==antDefinition)).status).toBe('FAIL')
  expect(auditCognitiveV2Registry([...definitions,antDefinition as unknown as TaskDefinition<unknown,unknown>]).status).toBe('FAIL')
  const forged=definitions.map(d=>d===antDefinition?{...d}:d)
  const audit=auditCognitiveV2Registry(forged)
  expect(audit.status).toBe('FAIL')
  expect(audit.entries.find(e=>e.key===key(antDefinition))!.issues.some(i=>i.message.includes('authoritative native object'))).toBe(true)
 })
 it('preserves the existing legacy adapter and its exact standard requirement',()=>{
  const legacy=getCognitiveRegistryEntry('reaction','1.0.0','1.1.0')!,definition=getCognitiveV2TaskDefinition('reaction','1.0.0','1.1.0')!
  expect(definition.scorer).not.toBe(legacy.score);expect(definition.finalSubmission).toBe(legacy.finalSubmission)
  expect(definition.metrics).toEqual(buildCognitiveV2TaskDefinition(legacy).metrics)
  const missing={...definition,profiles:{...definition.profiles}};delete missing.profiles.standard
  expect(validateTaskDefinition(missing)).toEqual(expect.arrayContaining([expect.objectContaining({path:'profiles',message:'standard profile is required'})]))
  const config={totalTrials:5,foreperiodMinMs:700,foreperiodMaxMs:1500,timeoutMs:2000,readyDurationMs:1000,report:{reportVersion:'1.0.0',referenceMode:'none'}}
  const session=createSessionConfigSnapshot({definition,configVersion:'1.0.0',config}),spy=vi.spyOn(legacy,'score')
  expect(()=>runAuthoritativeScorer({definition,session,trials:[],randomSeed:'legacy-registry-test'})).toThrow('expects exactly 5 trials, got 0')
  expect(spy).toHaveBeenCalledOnce()
  const structurallyValidUnknown={...definition,testType:'unknown-definition'}
  expect(validateTaskDefinition(structurallyValidUnknown).filter(i=>i.severity==='error')).toEqual([])
  expect(getCognitiveV2TaskDefinition('unknown-definition',definition.engineVersion,definition.scoringVersion)).toBeUndefined()
 })
 it('normal ANT uses resolved native scorer and report rather than a numeric compatibility score',()=>{
  const session=createAntSnapshot('experience'),seed='native-registry-normal-ant'
  const trials:AntTrial[]=antPlan(session.config,seed).map(p=>{
   const start=p.trialIndex*4000,cue=start+p.plannedPreCueMs,target=cue+500,rt=p.flanker==='incongruent'?450:400
   return {...p,phase:'test',recordOrigin:'live',clock:{source:'performance',timeOriginUnixMs:1700000000000},startedAtPerfMs:start,
    cueOnsetPerfMs:cue,cueOffsetPerfMs:cue+100,targetOnsetPerfMs:target,targetOffsetPerfMs:target+rt,endedAtPerfMs:start+4000,
    events:[{direction:p.direction,input:'touch',atPerfMs:target+rt,repeat:false,held:false}],responseIndex:0,timedOut:false,eventOverflow:false,interruptions:[]}
  })
  const definition=getCognitiveV2TaskDefinition(session.testType,session.engineVersion,session.scoringVersion)!
  const result=runAuthoritativeScorer({definition,session,trials:trials.map(antTrialEnvelope),randomSeed:seed})
  const report=projectThreeLayerReport({testType:'ant',engineVersion:session.engineVersion,scoringVersion:session.scoringVersion,
   configVersion:session.configVersion,protocolSignature:session.protocolSignature,profile:'experience',definition:definition.report,
   metricDefinitions:definition.metrics,qualityDefinitions:definition.quality,metrics:result.metrics,score:result})
  expect(result.quality.state).toBe('interpretable');expect(result.metrics.accuracy).toBe(1)
  expect(report.user.find(r=>r.key==='conflictMeanRtDifferenceMs')!.value).toBe(50)
  expect(report.detail.find(r=>r.key==='conflictFirstCorrectCount')!.value).toBe(16)
  expect(result).not.toHaveProperty('score');expect(result.metrics).not.toHaveProperty('score')
 })
})
