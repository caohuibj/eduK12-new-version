import {describe,it,expect} from 'vitest'
import {sartConfig,sartPlan,type SartPlan,type SartRaw,type SartEvent} from '../../modules/cognitive/content-candidates/sart/protocol'
import {reviewSart} from '../../modules/cognitive/content-candidates/sart/analysis'
import {createSartSnapshot,sartDefinition} from '../../modules/cognitive/content-candidates/sart/package'
import {sartEnvelope,scoreSart} from '../../modules/cognitive/content-candidates/sart/scorer'
import {projectSartReport,sartPublic,sartImageData,sartDownload} from '../../modules/cognitive/content-candidates/sart/report'
import {createSartPresentation} from '../../modules/cognitive/content-candidates/sart/participant-presentation'
const seed='sart-approved-content'
function row(p:SartPlan,t:number,rt:number|null):SartRaw{
  const events:SartEvent[]=[{kind:'mask',atMs:t+p.digitMs}]
  if(rt!==null)events.push({kind:'down',atMs:t+rt,token:'k:Space',input:'keyboard',repeat:false},{kind:'up',atMs:t+rt+1,token:'k:Space',input:'keyboard',repeat:false})
  events.sort((a,b)=>a.atMs-b.atMs)
  return {plan:p,onsetMs:t,endedAtMs:t+p.digitMs+p.maskMs,status:'complete',stopReason:null,heldBefore:[],events,ignoredRepeats:0,overflow:false}
}
function fixture(profile:'research'|'experience'='experience',zero=false){const session=createSartSnapshot(profile,'2026-10-27T00:00:00.000Z'),config=session.config,plan=sartPlan(config,seed),trials=plan.map(p=>sartEnvelope(row(p,100+p.index*1150,p.digit===3?(p.index<plan.length/3?200:null):zero?0:p.index<plan.length/3?300:100)))
  return {session,config,randomSeed:seed,trials}}
describe('SART content authority',()=>{
  it('freezes exact225/90 balanced cells, independent9-trial practice streams and all version/parameter identities',()=>{
    for(const [profile,count,reps] of [['research',225,5],['experience',90,2]] as const){const c=sartConfig(profile),plan=sartPlan(c,seed)
      expect(plan).toHaveLength(count);expect(sartPlan(c,seed)).toEqual(plan);expect(sartPlan(c,seed+'other')).not.toEqual(plan)
      for(let digit=1;digit<=9;digit++)for(const size of c.fontSizesPx)expect(plan.filter(p=>p.digit===digit&&p.fontPx===size)).toHaveLength(reps)
      expect(plan.filter(p=>p.digit===3)).toHaveLength(count/9)
      for(let round=0;round<3;round++){const practice=sartPlan(c,seed,'practice',round);expect(practice).toHaveLength(9);expect(new Set(practice.map(p=>p.digit)).size).toBe(9);expect(practice.every(p=>p.digitMs===400&&p.maskMs===1400&&p.round===round)).toBe(true)}
      expect(()=>sartPlan({...c,digitMs:251},seed)).toThrow();expect(()=>sartPlan(c,seed,'test',1)).toThrow();expect(sartDefinition.publication.status).toBe('DRAFT')
    }
    expect(sartDefinition.metrics.thirds.valueType).toBe('array');expect(createSartPresentation().metrics).toEqual({});expect(createSartPresentation().hiddenMetrics).toContain('internal')
  })
  it('uses Go/No-Go actual denominators, retains true0ms and signed negative differences, never treats poor performance as invalid',()=>{
    const f=fixture(),score=scoreSart(f),r=projectSartReport(score)
    expect(r).toMatchObject({state:'interpretable',complete:90,stats:{go:80,noGo:10,hits:80,omissions:0}})
    expect(r.differences.commissionPercentagePoints).toBe(-100);expect(r.differences.medianMs).toBe(-200)
    const z=projectSartReport(scoreSart(fixture('research',true)));expect(z.stats).toMatchObject({go:200,noGo:25,rtCount:200,medianMs:0});expect(sartPublic(z).details!.latency.medianMs).toBe(0)
    const bad=fixture();bad.trials=bad.trials.map(e=>sartEnvelope(row(e.payload.plan,e.payload.onsetMs,e.payload.plan.digit===3?200:null)))
    const poor=projectSartReport(scoreSart(bad));expect(poor.state).toBe('interpretable');expect(poor.stats).toMatchObject({omissions:80,commissions:10,medianMs:null})
  })
  it('excludes interrupted/unexecuted windows, rejects resumed streams, plan/envelope changes and cross-profile versions',()=>{
    const f=fixture(),partial=structuredClone(f);partial.trials=partial.trials.slice(0,4);const last=partial.trials[3].payload;last.status='interrupted';last.stopReason='hidden';last.endedAtMs=last.onsetMs+50;last.events=[];partial.trials[3]=sartEnvelope(last)
    const r=projectSartReport(scoreSart(partial));expect(r.state).toBe('limited');expect(r.complete).toBe(3);expect(r.received).toBe(4);expect(r.stats.go+r.stats.noGo).toBe(3)
    expect(()=>scoreSart({...partial,trials:[...partial.trials,f.trials[4]]})).toThrow('ownership')
    const fake=structuredClone(f);fake.trials[0].payload.events=[];expect(()=>scoreSart(fake)).toThrow('completion')
    const plan=structuredClone(f);plan.trials[0].payload.plan.digit=plan.trials[0].payload.plan.digit===1?2:1;expect(()=>scoreSart(plan)).toThrow('plan')
    const gap=structuredClone(f);gap.trials[1].payload.onsetMs++;expect(()=>scoreSart(gap)).toThrow('ownership')
    expect(()=>scoreSart({...f,config:sartConfig('research')})).toThrow('config');expect(()=>scoreSart({...f,session:{...f.session,scoringVersion:'next'}})).toThrow('identity')
    const practice=structuredClone(f);practice.trials[0].payload.plan.phase='practice';expect(()=>scoreSart(practice)).toThrow('ownership')
  })
  it('locks first fresh input through held boundaries and half-open windows, preserving a real first0 response',()=>{
    const p=sartPlan(sartConfig('experience'),seed).find(p=>p.digit!==3)!,raw=row(p,100,null)
    raw.heldBefore=['k:Space'];raw.events.push({kind:'down',atMs:110,token:'k:Space',input:'keyboard',repeat:false},{kind:'up',atMs:120,token:'k:Space',input:'keyboard',repeat:false},{kind:'down',atMs:130,token:'k:Space',input:'keyboard',repeat:false},{kind:'down',atMs:140,token:'p:1',input:'touch',repeat:false});raw.events.sort((a,b)=>a.atMs-b.atMs)
    expect(reviewSart(raw,p,['k:Space'])).toMatchObject({rtMs:30,responded:true})
    const late=row(p,100,null);late.events.push({kind:'down',atMs:1250,token:'p:1',input:'touch',repeat:false});expect(reviewSart(late,p).rtMs).toBeNull()
    expect(reviewSart(row(p,100,0),p).rtMs).toBe(0);expect(()=>reviewSart(raw,p,[])).toThrow('held')
  })
  it('whitelists all three public surfaces, hides research metrics and suppresses invalid counts rather than inventing zero',()=>{
    const f=fixture(),score=scoreSart(f);score.metrics.internal={privateMarker:'must-not-leak'};const r=projectSartReport(score)
    expect(sartPublic(r).summary).not.toHaveProperty('latency');expect(sartPublic(r).observations).toHaveLength(2);expect(sartPublic(r).observations[0]).toContain(String(r.stats.noGo));expect(sartDownload(r)).not.toContain('privateMarker');expect(sartImageData(r)!.summary).toEqual(sartPublic(r).summary)
    const changedCopy=structuredClone(r);changedCopy.copy.zh.title='Changed without a report version';expect(()=>sartPublic(changedCopy)).toThrow('Invalid SART report');expect(sartPublic(r).title).toBe(r.copy.zh.title)
    const empty=projectSartReport(scoreSart({...f,trials:[]}));expect(sartPublic(empty).summary).toBeNull();expect(sartPublic(empty).details).toBeNull();expect(sartPublic(empty).observations).toEqual([]);expect(sartImageData(empty)).toBeNull();expect(JSON.parse(sartDownload(empty)).summary).toBeNull()
    const one=projectSartReport(scoreSart({...f,trials:f.trials.slice(0,1)}));expect(one.state).toBe('limited');expect(sartPublic(one).summary!.noGo===null||sartPublic(one).summary!.go===null).toBe(true)
    expect(()=>projectSartReport({...score,metrics:{...score.metrics,reportBinding:{...(score.metrics.reportBinding as object),reportDefinitionVersion:'next'}}})).toThrow()
  })
})
