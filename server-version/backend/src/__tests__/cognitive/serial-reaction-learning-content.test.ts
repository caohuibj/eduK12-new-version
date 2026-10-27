import {describe,it,expect} from 'vitest'
import {readFileSync} from 'node:fs'
import {join} from 'node:path'
import {configFor,planFor,SEQUENCES,reviewRaw,type Plan,type Raw,type Location} from '../../modules/cognitive/content-candidates/serial-reaction-learning/protocol'
import {createSnapshot,serialReactionLearningDefinition} from '../../modules/cognitive/content-candidates/serial-reaction-learning/package'
import {envelopeFor,scoreSerialReactionLearning} from '../../modules/cognitive/content-candidates/serial-reaction-learning/scorer'
import {projectReport,reportText,takeHomeSvg,isReport} from '../../modules/cognitive/content-candidates/serial-reaction-learning/report'
import {createPresentation} from '../../modules/cognitive/content-candidates/serial-reaction-learning/participant-presentation'
const seed='synthetic-SRL-原件'
function row(p:Plan,rt=1000,wrong=false,interrupt=false):Raw{
  const start=100+p.index*10000,first=(wrong?(p.target+1)%4:p.target) as Location,events:Raw['events']=[{kind:'tap',atMs:start+rt,location:first,input:'touch'}]
  if(interrupt)events.push({kind:'interrupt',atMs:start+rt+100,reason:'participant-ended'});else if(wrong)events.push({kind:'tap',atMs:start+rt+100,location:p.target,input:'touch'})
  return {plan:structuredClone(p),startedAtPerfMs:start,endedAtPerfMs:events.slice(-1)[0]!.atMs,status:interrupt?'interrupted':'completed',firstLocation:first,firstRtMs:rt,firstCorrect:!wrong,correctAtMs:interrupt?null:events.slice(-1)[0]!.atMs,events,ignoredInputCount:0}
}
function score(rows?:Raw[],profile:'research'|'experience'='experience'){
  const session=createSnapshot(profile,'2026-10-27T00:00:00.000Z'),p=planFor(session.config,seed)
  return scoreSerialReactionLearning({session,config:session.config,randomSeed:seed,trials:(rows??p.map(x=>row(x))).map(envelopeFor)})
}
describe('SRL approved complete conditions and authoritative outcomes',()=>{
  it('rejects an extra touch past capacity without erasing the retained first error',()=>{
    const p=planFor(configFor('experience'),seed)[0],wrong=((p.target+1)%4) as Location,raw=row(p,0,true)
    raw.events=Array.from({length:2048},(_,i)=>({kind:'tap' as const,atMs:raw.startedAtPerfMs+i,location:wrong,input:'touch' as const}));raw.events.push({kind:'interrupt',atMs:raw.startedAtPerfMs+2048,reason:'response-record-limit'});raw.endedAtPerfMs=raw.startedAtPerfMs+2048;raw.status='interrupted';raw.correctAtMs=null
    expect(reviewRaw(raw,p)).toMatchObject({firstCorrect:false,firstRtMs:0,interrupted:true});raw.events[2048]={kind:'tap',atMs:raw.endedAtPerfMs,location:p.target,input:'touch'};raw.status='completed';raw.correctAtMs=raw.endedAtPerfMs;expect(()=>reviewRaw(raw,p)).toThrow('record limit')
  })
  it('keeps complete within-run conditions, source-frequency R30, boundaries and deterministic frozen frontend copies',()=>{
    for(const profile of ['experience','research'] as const)for(let sample=0;sample<25;sample++){
      const c=configFor(profile),p=planFor(c,`seed-${sample}`);expect(p).toEqual(planFor(c,`seed-${sample}`));expect(p).toHaveLength(profile==='research'?420:168)
      for(let i=1;i<p.length;i++)expect(p[i].target).not.toBe(p[i-1].target)
      for(let run=0;run<c.runs;run++){
        const cells=p.filter(x=>x.run===run);expect(cells.filter(x=>x.condition==='R')).toHaveLength(40);expect(cells.filter(x=>x.condition==='S')).toHaveLength(40);expect(cells.filter(x=>x.condition==='tail')).toHaveLength(4)
        const sequence=SEQUENCES[cells[0].sequenceVariant]
        for(let group=0;group<5;group++)expect(cells.slice(group*16+6,group*16+16).map(x=>x.target)).toEqual([...sequence])
        for(let target=0;target<4;target++)expect(cells.filter(x=>x.source==='R'&&x.position<80&&x.target===target)).toHaveLength(sequence.filter(x=>x===target).length*3)
        expect(new Set(cells.slice(80).map(x=>x.target)).size).toBe(4)
      }
    }
    for(let round=0;round<3;round++)expect(new Set(planFor(configFor('experience'),seed,'practice',round).map(x=>x.target)).size).toBe(4)
    expect(planFor(configFor('research'),seed).slice(0,168)).toEqual(planFor(configFor('experience'),seed))
    const root=join(process.cwd(),'..');for(const file of ['protocol.ts','analysis.ts','report.ts'])expect(readFileSync(join(root,'frontend/src/modules/cognitive/tasks/serial-reaction-learning/generated',file),'utf8')).toBe(readFileSync(join(root,'backend/src/modules/cognitive/content-candidates/serial-reaction-learning',file),'utf8'))
    expect(Object.isFrozen(configFor('experience').practice)).toBe(true)
  })
  it('retains first errors and corrections separately, uses real condition denominators and signed means',()=>{
    const p=planFor(configFor('experience'),seed),rows=p.map(x=>row(x,x.condition==='S'?500:1000,x.position===8)),result=score(rows),report=projectReport(result)
    expect(result.metrics.counts).toMatchObject({planned:168,presented:168,answered:168,completed:168,firstCorrect:166,corrections:2,interrupted:0,unpresented:0});expect(result.metrics.deltaMs).toBe(500)
    expect((result.metrics.runs as {S:{answered:number;firstCorrect:number}}[])[0].S).toMatchObject({answered:40,firstCorrect:39})
    expect(rows[8].firstCorrect).toBe(false);expect(rows[8].events).toHaveLength(2);expect(report.summary).toMatchObject({firstCorrect:166,answered:168,deltaMs:500});expect(reportText(report,'zh')).toContain('+500 ms')
    const negative=projectReport(score(p.map(x=>row(x,x.condition==='S'?1500:500))));expect(negative.summary?.deltaMs).toBe(-1000);expect(reportText(negative,'en')).toContain('slower');expect(takeHomeSvg(negative,'en')).toContain('-1,000')
    const zero=projectReport(score(p.map(x=>row(x,0))));expect(zero.summary).toMatchObject({rMs:0,sMs:0,deltaMs:0});expect(reportText(zero,'en')).toContain('equal')
  })
  it('separates interrupted first errors, no first response, unperformed targets and true zero',()=>{
    const p=planFor(configFor('experience'),seed),partial=score([row(p[0],0,true,true)])
    expect(partial.metrics.counts).toMatchObject({presented:1,answered:1,firstCorrect:0,completed:0,interrupted:1,unpresented:167});expect(partial.metrics.deltaMs).toBeNull();expect(partial.quality.state).toBe('limited')
    const blank:Raw={plan:p[0],startedAtPerfMs:100,endedAtPerfMs:101,status:'interrupted',firstLocation:null,firstRtMs:null,firstCorrect:null,correctAtMs:null,events:[{kind:'interrupt',atMs:101,reason:'window-blur'}],ignoredInputCount:0}
    expect(envelopeFor(blank).qualityEvents).toEqual(['window_blur']);expect(envelopeFor(row(p[0],0,true,true)).qualityEvents).toEqual([])
    expect(score([blank]).quality.state).toBe('invalid');expect(score([]).metrics.counts).toMatchObject({presented:0,unpresented:168})
    const rewritten=structuredClone(row(p[0],0,true));rewritten.firstCorrect=true;rewritten.firstLocation=p[0].target;expect(()=>reviewRaw(rewritten,p[0])).toThrow('first response')
  })
  it('gates body, image and export together and rejects fabricated public fields or quality',()=>{
    const p=planFor(configFor('experience'),seed),low=score(p.map(x=>row(x,100,x.condition==='S')))
    for(const result of [score([]),score([row(p[0])]),low]){
      const report=projectReport(result);expect(report.summary).toBeNull();expect(takeHomeSvg(report,'zh')).toBeNull();expect(reportText(report,'en')).not.toContain('First tap correct:');expect(JSON.stringify(report)).not.toMatch(/firstAccuracy|corrections|lowCondition|rMs|deltaMs/)
      expect(isReport({...report,summary:{firstCorrect:0}})).toBe(false)
    }
    const good=score();expect(()=>projectReport({...good,quality:{...good.quality,state:'limited'}})).toThrow();expect(()=>projectReport({...good,metrics:{...good.metrics,deltaMs:999}})).toThrow()
    expect(isReport({...projectReport(good),internalMetrics:good.metrics})).toBe(false)
    expect(Object.values(serialReactionLearningDefinition.metrics).every(m=>m.visibility==='research_only'&&!m.referenceEligible&&!m.export.summary)).toBe(true);expect(createPresentation().hiddenMetrics).toEqual(Object.keys(serialReactionLearningDefinition.metrics))
  })
  it('rejects changed config, source targets, duplicated order and event clocks while retaining the full research profile',()=>{
    const session=createSnapshot('experience'),p=planFor(session.config,seed),first=row(p[0]),call={session,config:session.config,randomSeed:seed,trials:[envelopeFor(first)]}
    expect(()=>scoreSerialReactionLearning({...call,config:{...session.config,runs:3} as never})).toThrow();expect(()=>scoreSerialReactionLearning({...call,session:{...session,engineVersion:'next'}})).toThrow()
    const altered=structuredClone(first);altered.plan.target=((altered.plan.target+1)%4) as Location;expect(()=>score([altered])).toThrow('frozen plan');expect(()=>score([first,first])).toThrow()
    const clock=structuredClone(first);clock.events[0].atMs=0;expect(()=>score([clock])).toThrow('clock')
    const long=score(undefined,'research');expect(long.quality.state).toBe('interpretable');expect(long.metrics.counts).toMatchObject({planned:420,firstCorrect:420});expect(projectReport(long).summary?.answered).toBe(420)
  })
})
