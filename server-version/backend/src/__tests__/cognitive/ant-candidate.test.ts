import { describe,it,expect } from 'vitest'
import { createHash } from 'node:crypto'
import { runAuthoritativeScorer } from '../../modules/cognitive/v2/authoritative-scorer'
import { computeProtocolSignature } from '../../modules/cognitive/v2/canonical'
import { ANT_IDENTITY,ANT_PROTOCOL,CUES,FLANKERS,INPUTS,antConfig,antPlan,antTrialEnvelope,
  type AntConfig,type AntTrial,type AntProfile,type Input } from '../../modules/cognitive/content-candidates/ant/protocol'
import { createAntSnapshot,antDefinition } from '../../modules/cognitive/content-candidates/ant/package'
import { antConfigSchema,antTrialSchema } from '../../modules/cognitive/content-candidates/ant/schema'
import { scoreAnt,projectAntReport,type AntMetrics } from '../../modules/cognitive/content-candidates/ant/scorer'
import { antContent } from '../../modules/cognitive/content-candidates/ant/metadata'
const seed='ant-candidate-golden-v1'
const clone=<T>(v:T):T=>JSON.parse(JSON.stringify(v))
function trials(profile:AntProfile='experience',config:AntConfig=antConfig(profile)):AntTrial[]{
  return antPlan(config,seed).map(p=>{
    const start=p.trialIndex*4000, cue=start+p.plannedPreCueMs,target=cue+100+400
    const latency=({none:400,double:500,central:350,spatial_valid:450}[p.cue])
      +({congruent:50,incongruent:0,neutral:100}[p.flanker])
    return {...p,phase:'test',recordOrigin:'live',clock:{source:'performance',timeOriginUnixMs:1700000000000},
      startedAtPerfMs:start,cueOnsetPerfMs:cue,cueOffsetPerfMs:cue+100,targetOnsetPerfMs:target,
      targetOffsetPerfMs:target+latency,endedAtPerfMs:start+4000,
      events:[{direction:p.direction,input:'touch',atPerfMs:target+latency,repeat:false,held:false}],
      responseIndex:0,timedOut:false,eventOverflow:false,interruptions:[]}
  })
}
const run=(records=trials(),profile:AntProfile='experience')=>runAuthoritativeScorer({
  definition:antDefinition,session:createAntSnapshot(profile),trials:records.map(antTrialEnvelope),randomSeed:seed,
})
function direct(records=trials(),profile:AntProfile='experience'){
  const session=createAntSnapshot(profile)
  return scoreAnt({session,config:session.config,trials:records.map(antTrialEnvelope),randomSeed:seed})
}
const metrics=(result:ReturnType<typeof run>)=>result.metrics as unknown as AntMetrics
const timeout=(t:AntTrial)=>{t.events=[];t.responseIndex=null;t.timedOut=true;t.targetOffsetPerfMs=t.targetOnsetPerfMs!+1700;return t}

describe('ANT unregistered pure content candidate',()=>{
  it.each(['research','experience'] as const)('freezes complete factorial %s, balanced blocks and independent practice',profile=>{
    const config=antConfig(profile),plan=antPlan(config,seed),practice=antPlan(config,seed,'practice')
    expect(plan).toHaveLength(config.totalTrials);expect(practice).toHaveLength(24)
    expect(practice.every(p=>p.phase==='practice')).toBe(true)
    for(let block=0;block<config.blocks;block++){
      const counts=new Map<string,number>()
      for(const p of plan.filter(p=>p.blockIndex===block)){
        const key=[p.cue,p.location,p.direction,p.flanker].join('/')
        counts.set(key,(counts.get(key)??0)+1)
        expect(p.plannedPreCueMs).toBeGreaterThanOrEqual(400);expect(p.plannedPreCueMs).toBeLessThan(1600)
      }
      expect(counts.size).toBe(48);expect(new Set(counts.values())).toEqual(new Set([config.repetitionsPerCellPerBlock]))
    }
    expect(antPlan(config,seed)).toEqual(plan)
    expect(antPlan(config,seed+'x')).not.toEqual(plan)
    expect(new Set(practice.map(p=>[p.cue,p.location,p.direction,p.flanker].join('/'))).size).toBe(24)
  })
  it('has immutable deterministic golden sequence digests',()=>{
    const digest=(profile:AntProfile)=>createHash('sha256').update(JSON.stringify(antPlan(antConfig(profile),seed))).digest('hex')
    expect(digest('experience')).toBe('36312149f146f3794d290c7c449f9757572ba2b23a7ee2db5f3871841dea314f')
    expect(digest('research')).toBe('414ae9dc1d67e2bfb07b0bd9de22cdd35b0e31ea2a9e3cc91279070a59481913')
  })
  it('validates original seed boundaries, runtime phase and profile combinations',()=>{
    for(const value of ['',null,undefined,4,'a'.repeat(257)])expect(()=>antPlan(antConfig('experience'),value as string)).toThrow()
    expect(antPlan(antConfig('experience'),'a'.repeat(256))).toHaveLength(48)
    expect(()=>antPlan(antConfig('experience'),seed,'learning' as never)).toThrow()
    expect(()=>antPlan({...antConfig('experience'),totalTrials:288},seed)).toThrow()
    expect(antConfigSchema.safeParse({...antConfig('research'),totalTrials:48}).success).toBe(false)
  })
  it.each(['research','experience'] as const)('scores golden %s with signed correct-only mean differences',profile=>{
    const result=run(trials(profile),profile),m=metrics(result),report=projectAntReport(result)
    expect(result.quality.state).toBe('interpretable');expect(m.accuracy).toBe(1)
    expect(m.validTrialCount).toBe(antConfig(profile).totalTrials)
    expect(m.differencesByInput.touch).toEqual({alerting:-100,orienting:-100,conflict:-50})
    expect(m.correctRtByInput.touch.cue.none.meanMs).toBe(450)
    expect(report.differences.map(d=>d.valueMs)).toEqual([-100,-100,-50])
    expect(report.cueRows).toHaveLength(4)
    expect(result.metrics).not.toHaveProperty('score');expect(result).not.toHaveProperty('score')
  })
  it('preserves actual zero RT and zero signed cost instead of null or clamping',()=>{
    const records=trials()
    for(const t of records){t.events[0].atPerfMs=t.targetOnsetPerfMs!;t.targetOffsetPerfMs=t.targetOnsetPerfMs!}
    const result=run(records)
    expect(metrics(result).correctRtByInput.touch.cue.none.meanMs).toBe(0)
    expect(metrics(result).differencesByInput.touch.alerting).toBe(0)
    expect(projectAntReport(result).differences[0].valueMs).toBe(0)
  })
  it('accuracy includes wrong and timeout, correct mean RT excludes both',()=>{
    const records=trials(),cue=records[0].cue
    const sameCue=records.map((t,i)=>t.cue===cue?i:-1).filter(i=>i>=0)
    const wrong=records[sameCue[0]];wrong.events[0].direction=wrong.direction==='left'?'right':'left'
    timeout(records[sameCue[1]])
    const m=metrics(run(records))
    expect(m.accuracy).toBe(46/48);expect(m.cueRecords[cue]).toMatchObject({valid:12,correct:10,accuracy:10/12})
    expect(m.correctRtByInput.touch.cue[cue].count).toBe(10)
    const correct=records.filter(t=>t.cue===cue&&t.responseIndex!==null&&t.events[t.responseIndex].direction===t.direction)
    expect(m.correctRtByInput.touch.cue[cue].meanMs).toBe(correct.reduce((s,t)=>s+t.events[t.responseIndex!].atPerfMs-t.targetOnsetPerfMs!,0)/10)
  })
  it.each(['all wrong','all timeout'])('%s retains zero accuracy and null correct RT',kind=>{
    const records=trials()
    for(const t of records)if(kind==='all timeout')timeout(t);else t.events[0].direction=t.direction==='left'?'right':'left'
    const result=run(records),m=metrics(result),report=projectAntReport(result)
    expect(result.quality.state).toBe('limited');expect(m.accuracy).toBe(0);expect(report.accuracy).toBe(0)
    expect(m.correctRtByInput.touch.cue.none.meanMs).toBeNull()
    expect(report.differences).toEqual([]);expect(report.cueRows.every(r=>r.correctMeanRtMs===null)).toBe(true)
  })
  it('empty and insufficient sessions have null/invalid reports without manufactured zero',()=>{
    for(const records of [[],trials().slice(0,1)]){
      const result=run(records),report=projectAntReport(result)
      expect(result.quality.state).toBe('invalid');expect(report.accuracy).toBeNull()
      expect(report.cueRows).toEqual([]);expect(report.differences).toEqual([])
    }
    expect(metrics(run([])).accuracy).toBeNull()
  })
  it('one interrupted record limits only affected complete-condition comparisons',()=>{
    const records=trials(),cue=records[0].cue
    records[0].interruptions=[{kind:'visibility_lost',atPerfMs:records[0].targetOnsetPerfMs!}]
    const result=run(records),m=metrics(result),report=projectAntReport(result)
    expect(result.quality.state).toBe('limited');expect(m.excludedTrialReasons['0']).toContain('interruption')
    expect(report.accuracy).toBeNull();expect(report.cueRows.map(r=>r.cue)).not.toContain(cue)
    expect(report.cueRows).toHaveLength(3)
    expect(report.differences.map(d=>d.key)).not.toContain(cue==='none'||cue==='double'?'alerting':'orienting')
    if(records[0].flanker!=='neutral')expect(report.differences.map(d=>d.key)).not.toContain('conflict')
  })
  it.each(['early','overflow','recovered','missing stage','phase duration','origin unknown'])('excludes technical %s and preserves raw record',kind=>{
    const records=trials(),t=records[0]
    if(kind==='early'){t.events.unshift({...t.events[0],atPerfMs:t.targetOnsetPerfMs!-1});t.responseIndex=1}
    if(kind==='overflow')t.eventOverflow=true
    if(kind==='recovered')t.recordOrigin='recovered_without_timing'
    if(kind==='missing stage')t.cueOffsetPerfMs=null
    if(kind==='phase duration')t.cueOffsetPerfMs!+=21
    if(kind==='origin unknown')t.clock.timeOriginUnixMs=null
    const result=run(records)
    expect(metrics(result).excludedTrialCount).toBeGreaterThanOrEqual(1)
    expect(Object.keys(metrics(result).excludedTrialReasons)).toContain('0')
    expect(projectAntReport(result).accuracy).toBeNull()
  })
  it('ignores held/repeated keys, retains first eligible wrong response, rejects forged selected index',()=>{
    const records=trials(),t=records[0],onset=t.targetOnsetPerfMs!
    t.events=[{...t.events[0],atPerfMs:onset-10,held:true},{...t.events[0],atPerfMs:onset+10,repeat:true},
      {...t.events[0],atPerfMs:onset+100,direction:t.direction==='left'?'right':'left'},
      {...t.events[0],atPerfMs:onset+110}]
    t.responseIndex=2;t.targetOffsetPerfMs=onset+100
    expect(metrics(run(records)).accuracy).toBe(47/48)
    t.responseIndex=3;expect(()=>run(records)).toThrow(/first eligible/)
  })
  it('response exactly at deadline remains a timeout, not a late correct RT',()=>{
    const records=trials(),t=timeout(records[0])
    t.events=[{direction:t.direction,input:'touch',atPerfMs:t.targetOnsetPerfMs!+1700,held:false,repeat:false}]
    const m=metrics(run(records));expect(m.accuracy).toBe(47/48);expect(m.validTrialCount).toBe(48)
  })
  it.each(INPUTS)('records actual %s input with its own RT denominator',input=>{
    const records=trials();records.forEach(t=>{t.events[0].input=input})
    const m=metrics(run(records));expect(m.inputSourcesObserved).toEqual([input])
    expect(m.correctRtByInput[input].cue.none.count).toBe(12)
    expect(projectAntReport(run(records)).differences.every(d=>d.input===input)).toBe(true)
  })
  it('never pools mixed touch/pointer/keyboard RT and hides public RT comparisons',()=>{
    const records=trials();records.forEach((t,i)=>{t.events[0].input=INPUTS[i%3]})
    const result=run(records),m=metrics(result),report=projectAntReport(result)
    expect(result.quality.state).toBe('limited');expect(m.inputSourcesObserved).toHaveLength(3)
    expect(report.accuracy).toBe(1);expect(report.differences).toEqual([])
    expect(report.cueRows.every(r=>r.correctMeanRtMs===null&&r.input===null)).toBe(true)
    expect(m).not.toHaveProperty('meanRtMs')
  })
  it('missing correct responses in one cue hides its RT and only associated costs',()=>{
    const records=trials()
    for(const t of records)if(t.cue==='none')t.events[0].direction=t.direction==='left'?'right':'left'
    const result=run(records),report=projectAntReport(result)
    expect(report.cueRows.find(r=>r.cue==='none')!.correctMeanRtMs).toBeNull()
    expect(report.differences.map(d=>d.key)).toEqual(['orienting','conflict'])
    expect(metrics(result).differencesByInput.touch.alerting).toBeNull()
  })
  it('distinct neutral variants have distinct frozen hashes and replay exactly',()=>{
    const absent=createAntSnapshot('experience'),dashes=createAntSnapshot('experience','dashes')
    expect(absent.configHash).not.toBe(dashes.configHash)
    const records=trials('experience',dashes.config)
    const replay=()=>runAuthoritativeScorer({definition:antDefinition,session:clone(dashes),trials:records.map(antTrialEnvelope),randomSeed:seed})
    expect(replay()).toEqual(replay());expect(replay().quality.state).toBe('interpretable')
    expect(()=>run(records)).toThrow(/truth/)
    expect(absent.config.neutralVariant).toBe('absent')
  })
  it('rejects modified hashes, config mismatch, unknown versions and recomputed foreign protocols',()=>{
    const source=createAntSnapshot('experience')
    const score=(session=source,config=session.config)=>scoreAnt({session,config,trials:[],randomSeed:seed})
    const badHash=clone(source);badHash.config.neutralVariant='dashes';expect(()=>score(badHash)).toThrow(/hash/)
    expect(()=>score(source,antConfig('research'))).toThrow(/differs/)
    for(const key of ['engineVersion','scoringVersion','configVersion'] as const){const s=clone(source);s[key]='9.0.0';expect(()=>score(s)).toThrow(/identity/)}
    const protocol=clone(source);protocol.protocol.key='foreign/1';protocol.protocolSignature=computeProtocolSignature(protocol.protocol)
    expect(()=>score(protocol)).toThrow(/protocol/)
    const signature=clone(source);signature.protocolSignature='0'.repeat(64);expect(()=>score(signature)).toThrow()
    expect(source.protocol).toEqual(ANT_PROTOCOL)
  })
  it.each(['seed','truth','order','extra','practice','clock','event order','late response','flag'])('rejects malformed %s contract',kind=>{
    const records=trials(),t=records[0]
    if(kind==='truth')t.direction=t.direction==='left'?'right':'left'
    if(kind==='order')[records[0],records[1]]=[records[1],records[0]]
    if(kind==='extra')records.push({...t,trialIndex:48})
    if(kind==='practice')(t as unknown as {phase:string}).phase='practice'
    if(kind==='clock')t.cueOffsetPerfMs=t.cueOnsetPerfMs!-1
    if(kind==='event order')t.events.push({...t.events[0],atPerfMs:t.events[0].atPerfMs-1})
    if(kind==='late response')t.targetOffsetPerfMs=t.events[0].atPerfMs-1
    if(kind==='flag')t.timedOut=true
    const invoke=()=>runAuthoritativeScorer({definition:antDefinition,session:createAntSnapshot('experience'),
      trials:records.map(antTrialEnvelope),randomSeed:kind==='seed'?seed+'x':seed})
    expect(invoke).toThrow()
  })
  it('report projection fails closed if state alone is overwritten or required gates absent',()=>{
    const invalid=run([]);invalid.quality.state='interpretable'
    expect(projectAntReport(invalid).cueRows).toEqual([])
    const limited=run(trials().slice(0,47));limited.quality.state='interpretable'
    expect(projectAntReport(limited).accuracy).toBeNull()
    const mixedRecords=trials();mixedRecords[0].events[0].input='keyboard'
    const mixed=run(mixedRecords);mixed.quality.state='interpretable'
    expect(projectAntReport(mixed).differences).toEqual([])
    const missingGate=run();delete missingGate.quality.flags.incompleteCue_none
    expect(projectAntReport(missingGate).cueRows.map(r=>r.cue)).not.toContain('none')
    const forged=run();metrics(forged).cueRecords.none.valid=1
    expect(projectAntReport(forged).cueRows.map(r=>r.cue)).not.toContain('none')
    const m=metrics(run());expect(JSON.stringify(projectAntReport(run()))).not.toContain('correctRtByInput')
    expect(m.expectedTrialCount).toBe(48)
  })
  it('cross-block overlap is rejected, breaks are allowed, origin changes are quality gated',()=>{
    const records=trials('research'),at=96
    const shift=(t:AntTrial,ms:number)=>{
      for(const key of ['startedAtPerfMs','cueOnsetPerfMs','cueOffsetPerfMs','targetOnsetPerfMs','targetOffsetPerfMs','endedAtPerfMs'] as const)
        if(t[key]!==null)(t as unknown as Record<string,number>)[key]+=ms
      t.events.forEach(e=>{e.atPerfMs+=ms})
    }
    const overlap=clone(records);for(let i=at;i<overlap.length;i++)shift(overlap[i],-1)
    expect(()=>run(overlap,'research')).toThrow(/overlap/)
    const breakRecords=clone(records);for(let i=at;i<breakRecords.length;i++)shift(breakRecords[i],60000)
    expect(run(breakRecords,'research').quality.state).toBe('interpretable')
    const origin=clone(records);origin[at].clock.timeOriginUnixMs!+=1
    expect(metrics(run(origin,'research')).excludedTrialReasons[String(at)]).toContain('clock_origin_changed')
  })
  it('binds projected differences and aggregate accuracy to actual correct denominators/sums',()=>{
    const accuracy=run();metrics(accuracy).accuracy=0.5
    expect(projectAntReport(accuracy).accuracy).toBeNull()
    for(const tamper of ['count','sum'] as const){
      const result=run(),m=metrics(result)
      if(tamper==='count')m.correctRtByInput.touch.cue.none.count=0.5
      else m.correctRtByInput.touch.cue.none.sumMs+=10
      expect(projectAntReport(result).differences.map(d=>d.key)).not.toContain('alerting')
      expect(projectAntReport(result).cueRows.find(r=>r.cue==='none')!.correctMeanRtMs).toBeNull()
    }
  })
  it('keeps all 32 raw interruptions while respecting the native envelope event bound',()=>{
    const records=trials(),t=records[0]
    t.interruptions=Array.from({length:32},()=>({kind:'visibility_lost' as const,atPerfMs:t.startedAtPerfMs}))
    const envelope=antTrialEnvelope(t)
    expect(envelope.qualityEvents).toHaveLength(20);expect(envelope.payload.interruptions).toHaveLength(32)
    expect(metrics(run(records)).excludedTrialReasons['0']).toContain('interruption')
  })
  it('carries original 18 research tag dimensions separately from implementation/scenarios and unknown age',()=>{
    expect(Object.keys(antContent.inheritedResearchTags)).toHaveLength(18)
    expect(antContent.implementationTags.ageRange).toBeNull()
    expect(antContent.implementationTags.scenarios).toHaveLength(4)
    expect(antContent.implementationTags.languages).toEqual(['zh','en'])
    expect(antDefinition.profiles.standard).toBeUndefined()
    expect(antDefinition.references).toEqual([])
    expect(ANT_IDENTITY.candidateId).toBe('attention-ant-pebl')
    expect(antTrialSchema.safeParse({...trials()[0],score:100}).success).toBe(false)
  })
})
