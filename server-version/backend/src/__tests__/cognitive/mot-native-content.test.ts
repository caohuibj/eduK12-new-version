import { createHash } from 'node:crypto'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { validateTaskDefinition } from '../../modules/cognitive/v2/publication-gate'
import { motTrialEnvelope } from '../../modules/cognitive/content-candidates/mot/trial-envelope'
import { describe, it, expect } from 'vitest'
import { motConfig, motTrialPlan, motPosition, projectMotReport, summarizeMotFrames, type MotTrial } from '../../modules/cognitive/content-candidates/mot/protocol'
import { motConfigSchema } from '../../modules/cognitive/content-candidates/mot/schema'
import { motDefinition, createMotSnapshot } from '../../modules/cognitive/content-candidates/mot/package'
import { runAuthoritativeScorer } from '../../modules/cognitive/v2/authoritative-scorer'
import type { TrialEnvelope } from '../../modules/cognitive/v2/types'

const seed='mot-content-golden-20261026'
function records(profile:'experience'|'research'='experience',correct=3):TrialEnvelope<MotTrial>[] {
  const config=motConfig(profile)
  return Array.from({length:config.totalTrials},(_,index)=>{
    const plan=motTrialPlan(config,seed,index),start=index*12000
    const others=plan.objects.map(o=>o.id).filter(id=>!plan.targetIds.includes(id))
    const ids=[...plan.targetIds.slice(0,correct),...others.slice(0,5-correct)]
    const payload:MotTrial={
      recordOrigin:'live',phase:'test',trialIndex:index,blockIndex:plan.blockIndex,speed:plan.speed,targetIds:plan.targetIds,
      initialObjects:plan.objects,startedAtPerfMs:start,cueStartedAtPerfMs:start+500,
      motionStartedAtPerfMs:start+1500,motionEndedAtPerfMs:start+9500,
      responseStartedAtPerfMs:start+10000,endedAtPerfMs:start+10500,completionTimeMs:10500,
      frameTiming:summarizeMotFrames(Array.from({length:481},(_,f)=>f*8000/480)),
      calibration:{version:1,method:'ruler_and_distance_self_reported',referenceMm:50,referenceCssPx:200,
        viewingDistanceMm:350,viewportWidthCssPx:800,viewportHeightCssPx:900,devicePixelRatio:2,visualViewportScale:1,language:'zh'},
      responses:ids.map((id,i)=>({objectId:id,...motPosition(plan.objects[id],8000,config),
        atPerfMs:start+10100+i*100,input:'keyboard' as const})),
      prematureInputs:0,missedInputs:0,ambiguousInputs:0,interactionEvents:[],interactionOverflow:false,interruptions:[],timedOut:false,
    }
    return{schemaVersion:1,trialIndex:index,phase:'test',startedAtPerfMs:start,endedAtPerfMs:start+10500,
      durationMs:10500,flags:{timeout:false,premature:false},qualityEvents:[],payload}
  })
}
const score=(trials:TrialEnvelope<MotTrial>[],profile:'experience'|'research'='experience',randomSeed=seed)=>
 runAuthoritativeScorer({definition:motDefinition,session:createMotSnapshot(profile),trials,randomSeed})

describe('MOT native content candidate',()=>{
 it('accepts the real native two-profile contract without manufacturing a standard profile',()=>{
  expect(validateTaskDefinition(motDefinition).filter(i=>i.severity==='error')).toEqual([])
  expect(Object.keys(motDefinition.profiles).sort()).toEqual(['experience','research'])
  expect(motDefinition.profiles.standard).toBeUndefined()
  const trials=records(),core=trials[0].payload,envelope=motTrialEnvelope(core)
  expect(envelope.startedAtPerfMs).toBe(core.startedAtPerfMs)
  expect(envelope.endedAtPerfMs).toBe(core.endedAtPerfMs)
  expect(envelope.payload).not.toHaveProperty('motionFrameTimesMs')
  const forged=structuredClone(trials);forged[0].startedAtPerfMs+=1
  expect(()=>score(forged)).toThrow('actual task clock')
 })
 it('pins each exact profile hash, protocol signature and seeded stimulus plan to a checked-in golden',()=>{
  const golden=JSON.parse(readFileSync(join(__dirname,'fixtures/mot-native-v1.1.1.json'),'utf8'))
  for(const profile of ['research','experience'] as const){
    const snapshot=createMotSnapshot(profile)
    const plans=Array.from({length:snapshot.config.totalTrials},(_,i)=>motTrialPlan(snapshot.config,seed,i))
    expect({configHash:snapshot.configHash,protocolSignature:snapshot.protocolSignature,
      planSha256:createHash('sha256').update(JSON.stringify(plans)).digest('hex')}).toEqual(golden[profile])
  }
 })
 it('refuses legacy full frame payloads, impossible summaries and incompatible display geometry',()=>{
  const raw=records();Object.assign(raw[0].payload,{motionFrameTimesMs:[0,1]});expect(()=>score(raw)).toThrow()
  const summary=records();summary[0].payload.frameTiming.maxGapMs=0;expect(()=>score(summary)).toThrow()
  const geometry=records();geometry[0].payload.calibration.viewportWidthCssPx=100;expect(()=>score(geometry)).toThrow('does not fit')
  const empty=records();empty[0].payload.frameTiming=summarizeMotFrames([])
  expect(score(empty).metrics.excludedTrialCount).toBe(1)
  const overflow=records();overflow[0].payload.interactionOverflow=true
  expect(score(overflow).metrics.excludedTrialReasons).toEqual({'0':['telemetry_overflow']})
 })

 it('freezes only the two real profiles, with balanced condition order and no manufactured total score',()=>{
  for(const profile of ['experience','research'] as const){
   const config=motConfig(profile),plans=Array.from({length:config.totalTrials},(_,i)=>motTrialPlan(config,seed,i))
   for(const speed of [1,4,8])expect(plans.filter(p=>p.speed===speed)).toHaveLength(config.totalTrials/3)
   const result=score(records(profile),profile),report=projectMotReport(result)
   expect(result.quality.state).toBe('interpretable')
   expect(result.metrics.meanTrackedTargets).toBe(3)
   expect(result.metrics.trackingAccuracy).toBe(.6)
   expect(result).not.toHaveProperty('score')
   expect(report.rows).toHaveLength(3)
   expect(report.rows.every(r=>r.mean===3&&r.validTrials===config.totalTrials/3)).toBe(true)
  }
  expect(Object.keys(motDefinition.profiles)).toEqual(['research','experience'])
  expect(motConfigSchema.safeParse({...motConfig('research'),totalTrials:9}).success).toBe(false)
 })
 it('keeps seed, object truth and sequence stable, with non-overlapping starts and time-based reflections',()=>{
  const config=motConfig('experience'),a=motTrialPlan(config,seed,0)
  expect(motTrialPlan(config,seed,0)).toEqual(a)
  expect(motTrialPlan(config,seed+'different',0)).not.toEqual(a)
  for(const object of a.objects){
   for(const other of a.objects.filter(o=>o.id!==object.id))
    expect(Math.hypot(object.x-other.x,object.y-other.y)).toBeGreaterThanOrEqual(1.2)
   for(const t of [0,1000,4000,8000]){
    const p=motPosition(object,t,config)
    expect(p.x).toBeGreaterThanOrEqual(.6);expect(p.x).toBeLessThanOrEqual(11.4)
    expect(p.y).toBeGreaterThanOrEqual(.6);expect(p.y).toBeLessThanOrEqual(11.4)
   }
   for(const hz of [60,90,120]){
    const point=motPosition(object,(hz*4)*(1000/hz),config),exact=motPosition(object,4000,config)
    expect(point.x).toBeCloseTo(exact.x,12);expect(point.y).toBeCloseTo(exact.y,12)
   }
  }
 })
 it('returns invalid/null for empty records, and preserves genuine zero results',()=>{
  const empty=score([])
  expect(empty.quality.state).toBe('invalid')
  expect(empty.metrics.meanTrackedTargets).toBeNull()
  expect(projectMotReport(empty)).toMatchObject({headline:null,rows:[]})
  const zero=score(records('experience',0))
  expect(zero.quality.state).toBe('interpretable')
  expect(zero.metrics.meanTrackedTargets).toBe(0)
  expect(projectMotReport(zero).headline).toBe(0)
 })
 it('hides the affected speed and the aggregate on a missing trial rather than showing internal values',()=>{
  const trials=records().slice(0,8),missingSpeed=motTrialPlan(motConfig('experience'),seed,8).speed
  const result=score(trials),report=projectMotReport(result)
  expect(result.quality.state).toBe('limited')
  expect(report.headline).toBeNull()
  expect(report.rows).toHaveLength(2)
  expect(report.rows.some(r=>r.speed===missingSpeed)).toBe(false)
 })
 it.each(['frame_gap','premature','interruption','timeout'] as const)('gates %s separately from incorrect selections',kind=>{
  const trials=records(),trial=trials[0].payload
  if(kind==='frame_gap')trial.frameTiming=summarizeMotFrames(Array.from({length:481},(_,f)=>f*8000/480).filter(t=>t<1000||t>1100))
  if(kind==='premature')trial.prematureInputs=1
  if(kind==='interruption')trial.interruptions=['visibility_lost']
  if(kind==='timeout'){trial.timedOut=true;trial.responses=[]}
  const result=score(trials)
  expect(result.quality.state).toBe('limited')
  expect(result.metrics.excludedTrialCount).toBe(1)
  expect(projectMotReport(result).rows).toHaveLength(2)
 })
 it('does not expose conclusions when every condition is affected',()=>{
  const trials=records()
  for(const trial of trials)trial.payload.interruptions=['window_blur']
  const result=score(trials)
  expect(result.quality.state).toBe('invalid')
  expect(result.metrics.meanTrackedTargets).toBeNull()
  expect(projectMotReport(result).rows).toEqual([])
 })
 it('rejects non-contiguous, repeated, forged and out-of-order events',()=>{
  const gap=records();gap[1].trialIndex=2;expect(()=>score(gap)).toThrow()
  const repeated=records();repeated[0].payload.responses[1]=repeated[0].payload.responses[0]
  expect(()=>score(repeated)).toThrow('repeats')
  const float=records();float[0].payload.initialObjects[0].vx+=Number.EPSILON;expect(()=>score(float)).not.toThrow()
  const trajectory=records();trajectory[0].payload.initialObjects[0].vx+=1e-6;expect(()=>score(trajectory)).toThrow('stimulus truth')
  const forged=records();forged[0].payload.targetIds=[0,0,0,0,0];expect(()=>score(forged)).toThrow('stimulus truth')
  const point=records();point[0].payload.responses[0].x=-1;expect(()=>score(point)).toThrow()
  const clocks=records();clocks[0].payload.responses[0].atPerfMs=1;expect(()=>score(clocks)).toThrow('clock')
  const phase=records();phase[0].phase='learning';expect(()=>score(phase)).toThrow()
  expect(()=>score(records(),'experience','another-seed')).toThrow('stimulus truth')
 })
 it('rejects incompatible frozen identities/configs and replays the original snapshot without latest lookup',()=>{
  const snapshot=createMotSnapshot('experience'),trials=records()
  const first=runAuthoritativeScorer({definition:motDefinition,session:snapshot,trials,randomSeed:seed})
  expect(runAuthoritativeScorer({definition:motDefinition,session:JSON.parse(JSON.stringify(snapshot)),trials,randomSeed:seed})).toEqual(first)
  expect(()=>runAuthoritativeScorer({definition:motDefinition,session:{...snapshot,engineVersion:'9.9.9'},trials,randomSeed:seed})).toThrow()
  expect(()=>runAuthoritativeScorer({definition:motDefinition,session:{...snapshot,configVersion:'9.9.9'},trials,randomSeed:seed})).toThrow('identity')
  expect(()=>runAuthoritativeScorer({definition:motDefinition,session:{...snapshot,config:{...snapshot.config,totalTrials:45}},trials,randomSeed:seed})).toThrow()
 })
})
