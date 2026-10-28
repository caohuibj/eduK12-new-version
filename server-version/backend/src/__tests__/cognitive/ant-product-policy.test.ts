import { describe,it,expect } from 'vitest'
import { antDefinition,createAntSnapshot } from '../../modules/cognitive/content-candidates/ant/package'
import { ANT_IDENTITY,ANT_PROTOCOL,antPlan,antConfig,antTrialEnvelope,type AntTrial,type AntProfile } from '../../modules/cognitive/content-candidates/ant/protocol'
import { scoreAnt,projectAntReport } from '../../modules/cognitive/content-candidates/ant/scorer'
import { computeProtocolSignature } from '../../modules/cognitive/v2/canonical'
import { projectThreeLayerReport } from '../../modules/cognitive/v2/report'
const seed='ant-product-report-v1'
function records(profile:AntProfile='experience',oneFrame=false):AntTrial[]{
  return antPlan(antConfig(profile),seed).map(p=>{
    const start=p.trialIndex*4000,cue=start+p.plannedPreCueMs+(oneFrame?16.7:0),target=cue+500
    const rt={none:400,double:500,central:350,spatial_valid:450}[p.cue]+{congruent:50,incongruent:0,neutral:100}[p.flanker]
    return {...p,phase:'test',recordOrigin:'live',clock:{source:'performance',timeOriginUnixMs:1700000000000},
      startedAtPerfMs:start,cueOnsetPerfMs:cue,cueOffsetPerfMs:cue+100,targetOnsetPerfMs:target,
      targetOffsetPerfMs:target+rt+(oneFrame?16.7:0),endedAtPerfMs:start+4000,
      events:[{direction:p.direction,input:'touch',atPerfMs:target+rt,repeat:false,held:false}],responseIndex:0,
      timedOut:false,eventOverflow:false,interruptions:[]}
  })
}
function score(trials=records(),profile:AntProfile='experience'){
  const session=createAntSnapshot(profile)
  return scoreAnt({session,config:session.config,trials:trials.map(antTrialEnvelope),randomSeed:seed})
}
function native(result:ReturnType<typeof score>,profile:AntProfile='experience'){
  const session=createAntSnapshot(profile)
  return projectThreeLayerReport({testType:'ant',configVersion:session.configVersion,protocolSignature:session.protocolSignature,
    engineVersion:session.engineVersion,scoringVersion:session.scoringVersion,profile,definition:antDefinition.report,
    metrics:result.metrics,score:result,metricDefinitions:antDefinition.metrics,qualityDefinitions:antDefinition.quality})
}
describe('ANT approved product feedback policy',()=>{
  it.each(['research','experience'] as const)('normal %s exposes native condition means, signed differences and denominators without norms',profile=>{
    const result=score(records(profile),profile),report=native(result,profile),publicReport=projectAntReport(result)
    expect(result.quality.state).toBe('interpretable');expect(antDefinition.references).toEqual([])
    expect(report.headline.map(r=>r.key)).toContain('accuracy')
    const keys=report.user.map(r=>r.key),values=Object.fromEntries(report.user.map(r=>[r.key,r.value]))
    expect(keys).toContain('cueAccuracy_none');expect(keys).toContain('flankerAccuracy_incongruent')
    expect(values.cueCorrectMeanRtMs_none).toBe(450);expect(values.alertingMeanRtDifferenceMs).toBe(-100)
    expect(values.orientingMeanRtDifferenceMs).toBe(-100);expect(values.conflictMeanRtDifferenceMs).toBe(-50)
    const counts=Object.fromEntries(report.detail.map(r=>[r.key,r.value]))
    expect(counts.cueValidCount_none).toBe(profile==='research'?72:12)
    expect(counts.flankerValidCount_incongruent).toBe(profile==='research'?96:16)
    expect(counts.alertingFirstCorrectCount).toBe(profile==='research'?72:12)
    expect(publicReport.cueRows).toHaveLength(4);expect(publicReport.flankerRows).toHaveLength(3)
    expect(antDefinition.metrics.alertingMeanRtDifferenceMs.direction).toBe('signed')
    expect(Object.values(antDefinition.metrics).every(m=>m.referenceEligible===false)).toBe(true)
    expect(report.conclusion).not.toContain('优秀');expect(result.metrics).not.toHaveProperty('score')
  })
  it('existing20ms rule already accepts a normal16.7ms callback deviation and the report remains available',()=>{
    const result=score(records('experience',true)),report=native(result)
    expect(antConfig('experience').phaseToleranceMs).toBe(20)
    expect(result.quality.state).toBe('interpretable')
    expect(report.user.find(r=>r.key==='cueCorrectMeanRtMs_none')?.value).toBe(450)
    expect(report.user.find(r=>r.key==='alertingMeanRtDifferenceMs')?.value).toBe(-100)
    expect(result.metrics.excludedTrialCount).toBe(0)
  })
  it('an actual interruption still hides affected conditions while preserving unaffected native observations',()=>{
    const trials=records(),t=trials[0]
    t.interruptions.push({kind:'visibility_lost',atPerfMs:t.targetOnsetPerfMs!})
    const result=score(trials),report=native(result),keys=report.user.map(r=>r.key)
    expect(result.quality.state).toBe('limited');expect(report.headline).toEqual([])
    expect(keys).not.toContain('cueAccuracy_'+t.cue);expect(keys).not.toContain('flankerCorrectMeanRtMs_'+t.flanker)
    expect(projectAntReport(result).cueRows).toHaveLength(3)
    expect(result.metrics.excludedTrialReasons).toHaveProperty('0')
    expect(score([]).quality.state).toBe('invalid');expect(native(score([])).user).toEqual([])
  })
  it('wrong answers and timeouts remain in accuracy denominators; missing RT is never zero',()=>{
    const trials=records(),wrong=trials[0],timeout=trials[1]
    wrong.events[0].direction=wrong.direction==='left'?'right':'left'
    timeout.events=[];timeout.responseIndex=null;timeout.timedOut=true;timeout.targetOffsetPerfMs=timeout.targetOnsetPerfMs!+1700
    const result=score(trials),report=native(result)
    expect(result.metrics.accuracy).toBe(46/48)
    expect(report.detail.find(r=>r.key==='cueValidCount_'+timeout.cue)?.value).toBe(12)
    const allWrong=records();allWrong.forEach(t=>{t.events[0].direction=t.direction==='left'?'right':'left'})
    const allWrongResult=score(allWrong)
    expect(allWrongResult.metrics.accuracy).toBe(0);expect(allWrongResult.metrics.cueCorrectMeanRtMs_none).toBeNull()
  })
  it('mixed inputs still withhold RT comparisons, and forged truth is rejected',()=>{
    const trials=records();trials[0].events[0].input='keyboard'
    const result=score(trials),report=native(result)
    expect(result.quality.flags.mixedInput).toBe(true)
    expect(report.user.some(r=>/CorrectMeanRtMs|MeanRtDifferenceMs/.test(r.key))).toBe(false)
    expect(report.user.some(r=>r.key==='cueAccuracy_none')).toBe(true)
    trials[0].direction=trials[0].direction==='left'?'right':'left';expect(()=>score(trials)).toThrow(/truth/)
  })
  it('adds only report/scoring contract versions and explicitly refuses old frozen scorer/protocol tuples',()=>{
    expect(ANT_IDENTITY.engineVersion).toBe('1.0.0');expect(ANT_IDENTITY.configVersion).toBe('1.0.0')
    expect(ANT_IDENTITY.qualityDefinitionVersion).toBe('1.0.0');expect(ANT_IDENTITY.scoringVersion).toBe('1.1.0')
    expect(ANT_IDENTITY.metricDefinitionVersion).toBe('1.1.0');expect(antDefinition.report.version).toBe('1.1.0')
    const session=createAntSnapshot('experience'),old=structuredClone(session)
    old.scoringVersion='1.0.0';old.protocol.key='ant/1.0.0/1.0.0';old.protocolSignature=computeProtocolSignature(old.protocol)
    expect(old.configHash).toBe(session.configHash);expect(old.protocolSignature).not.toBe(session.protocolSignature)
    expect(()=>scoreAnt({session:old,config:old.config,trials:[],randomSeed:seed})).toThrow(/identity|protocol/)
    expect(ANT_PROTOCOL.version).toBe('1.0.0');expect(ANT_PROTOCOL.key).toBe('ant/1.0.0/1.1.0')
  })
})
