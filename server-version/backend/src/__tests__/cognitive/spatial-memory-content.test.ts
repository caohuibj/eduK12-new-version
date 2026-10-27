import {describe,it,expect,vi} from 'vitest'
vi.mock('dotenv',()=>({default:{config:()=>({parsed:{}})}}))
import {spatialConfig,spatialPlan,signedError,normalizeAngle,targetAngle,position,PALETTE,type SpatialRaw} from '../../modules/cognitive/content-candidates/precision-working-memory/protocol'
import {createSpatialMemorySnapshot,spatialMemoryDefinition} from '../../modules/cognitive/content-candidates/precision-working-memory/package'
import {scoreSpatialMemory,spatialEnvelope} from '../../modules/cognitive/content-candidates/precision-working-memory/scorer'
import {projectSpatialReport} from '../../modules/cognitive/content-candidates/precision-working-memory/report'
import {createSpatialMemoryPresentation} from '../../modules/cognitive/content-candidates/precision-working-memory/participant-presentation'
const seed='spatial-approved-contract'
function fixture(profile:'research'|'experience'){
  const session=createSpatialMemorySnapshot(profile),plan=spatialPlan(session.config,seed);let now=100
  const trials=plan.map(p=>{const start=now,encoding=start+p.itiMs,retention=encoding+500,prompt=retention+1000,selected=prompt+100,confirmed=prompt+1200;now=confirmed
    const angle=normalizeAngle(targetAngle(p)+2),xy=position(angle)
    const raw:SpatialRaw={plan:p,status:'complete',stopReason:null,startedAtPerfMs:start,encodingOnsetMs:encoding,retentionOnsetMs:retention,responseOnsetMs:prompt,endedAtPerfMs:confirmed,warningAtMs:null,signedErrorDeg:signedError(angle,targetAngle(p)),eventOverflow:false,
      response:{angleDeg:angle,...xy,rawX:xy.x,rawY:xy.y,input:'touch',firstSelectedAtMs:selected,lastAdjustedAtMs:selected,confirmedAtMs:confirmed},events:[{kind:'select',atMs:selected,angleDeg:angle,input:'touch'},{kind:'release',atMs:selected,angleDeg:angle,input:'touch'},{kind:'confirm',atMs:confirmed,angleDeg:angle,input:'touch'}]}
    return spatialEnvelope(raw)})
  return {session,config:session.config,randomSeed:seed,trials}
}
describe('approved spatial content critical contracts',()=>{
  it('freezes both profiles, balances colours and loads, replays seeds, and keeps easier practice separate',()=>{
    for(const [profile,total] of [['research',400],['experience',40]] as const){const c=spatialConfig(profile),plan=spatialPlan(c,seed)
      expect(plan).toHaveLength(total);expect(spatialPlan(c,seed)).toEqual(plan);expect(spatialPlan(c,seed+'other')).not.toEqual(plan)
      expect(PALETTE).toEqual({black:'#000000',yellow:'#F0E442',cyan:'#00AAFF',green:'#00FF00',red:'#E53935'});expect(c.geometry).toMatchObject({background:'#666666',barLength:32,barWidth:6})
      for(let block=0;block<total/40;block++)for(const size of [1,5]){const part=plan.slice(block*40,(block+1)*40).filter(p=>p.setSize===size);expect(part).toHaveLength(20)
        for(const colour of Object.keys(PALETTE))expect(part.filter(p=>p.targetColour===colour)).toHaveLength(4)}
      for(const p of plan){expect(new Set(p.items.map(i=>i.colour)).size).toBe(p.setSize)
        for(const a of p.items)for(const b of p.items)if(a!==b)expect(Math.abs(signedError(a.angleDeg,b.angleDeg))).toBeGreaterThanOrEqual(18-1e-8)}
      const practice=spatialPlan(c,seed,'practice',0);expect(practice.map(p=>p.setSize)).toEqual([1,1,1,3,3,3]);expect(spatialPlan(c,seed,'practice',1)).not.toEqual(practice)
      expect(createSpatialMemorySnapshot(profile).config.totalTrials).toBe(total);expect(createSpatialMemoryPresentation().protocols?.[profile]?.profileLabel).toBe(profile==='research'?'科研版':'实用版')
    }
    expect(()=>spatialPlan({...spatialConfig('experience'),totalTrials:80},seed)).toThrow();expect(()=>spatialPlan(spatialConfig('experience'),seed,'practice',3)).toThrow()
  })
  it('scores circular wrap and both real profile denominators with an exact frozen identity',()=>{
    expect(signedError(359,1)).toBe(-2);expect(signedError(1,359)).toBe(2);expect(signedError(180,0)).toBe(-180)
    for(const profile of ['research','experience'] as const){const f=fixture(profile),score=scoreSpatialMemory(f),report=projectSpatialReport(score)
      expect(report.state).toBe('interpretable');expect(report.conditions.map(c=>c.valid)).toEqual([f.config.totalTrials/2,f.config.totalTrials/2]);expect(report.conditions[0].meanAbsoluteErrorDeg).toBeCloseTo(2)
      expect(score.metrics.set5MeanAbsoluteErrorDeg).toMatchObject({unit:'deg'});expect((score.metrics.set5MeanAbsoluteErrorDeg as {value:number}).value).toBeCloseTo(2);expect(report.configHash).toBe(f.session.configHash)
      expect(Object.keys(score.metrics).every(key=>key in spatialMemoryDefinition.metrics)).toBe(true)
      expect(()=>scoreSpatialMemory({...f,session:{...f.session,engineVersion:'9.0.0'}})).toThrow('Unsupported exact')
    }
  })
  it('preserves limited/invalid/null, refuses fabricated truth and unexecuted stages, and never treats a reminder as failure',()=>{
    const f=fixture('experience'),partial=projectSpatialReport(scoreSpatialMemory({...f,trials:f.trials.slice(0,3)}));expect(partial.state).toBe('limited');expect(partial.received).toBe(3)
    const empty=projectSpatialReport(scoreSpatialMemory({...f,trials:[]}));expect(empty.state).toBe('invalid');expect(empty.conditions.map(c=>c.meanAbsoluteErrorDeg)).toEqual([null,null])
    const changed=structuredClone(f);changed.trials[0].payload.plan.targetColour=changed.trials[0].payload.plan.targetColour==='red'?'yellow':'red';expect(()=>scoreSpatialMemory(changed)).toThrow('manifest')
    const early=structuredClone(f);early.trials[0].payload.retentionOnsetMs=early.trials[0].payload.encodingOnsetMs!+1;expect(projectSpatialReport(scoreSpatialMemory(early)).state).toBe('limited')
    const slow=structuredClone(f);const last=slow.trials.at(-1)!,raw=last.payload,extra=3000;raw.endedAtPerfMs+=extra;raw.response!.confirmedAtMs+=extra;raw.events.at(-1)!.atMs+=extra;raw.warningAtMs=raw.responseOnsetMs!+3000
    slow.trials[slow.trials.length-1]=spatialEnvelope(raw);const slowReport=projectSpatialReport(scoreSpatialMemory(slow));expect(slowReport.state).toBe('interpretable');expect(slowReport.lateResponses).toBe(1)
    const broken=scoreSpatialMemory(f);(broken.metrics.reportBinding as Record<string,unknown>).reportDefinitionVersion='next';expect(()=>projectSpatialReport(broken)).toThrow()
  })
})
