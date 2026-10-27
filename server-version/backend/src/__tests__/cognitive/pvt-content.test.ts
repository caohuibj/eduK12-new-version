import {describe,it,expect} from 'vitest'
import {pvtConfig,pvtManifest,same,type PvtRaw,type PvtEvent,type PvtDraft,type PvtContext} from '../../modules/cognitive/content-candidates/pvt/protocol'
import {createPvtSnapshot,pvtDefinition} from '../../modules/cognitive/content-candidates/pvt/package'
import {reviewPvt,type PvtStats} from '../../modules/cognitive/content-candidates/pvt/analysis'
import {scorePvt,pvtEnvelope,pvtDigest} from '../../modules/cognitive/content-candidates/pvt/scorer'
import {projectPvtReport,pvtPublic,pvtDownload,pvtImageData} from '../../modules/cognitive/content-candidates/pvt/report'
import {verifyPvtSubmission,type PvtPrepared} from '../../modules/cognitive/content-candidates/pvt/submission'
import {createPvtPresentation} from '../../modules/cognitive/content-candidates/pvt/participant-presentation'
const scoreFixture=(f:Parameters<typeof scorePvt>[0])=>scorePvt({session:f.session,config:f.config,randomSeed:f.randomSeed,trials:f.trials})
const seed='pvt-authority-synthetic'
function fixture(profile:'research'|'experience'='experience',rt:(target:number,start:number)=>number|null=()=>250){
  const session=createPvtSnapshot(profile,'2026-10-27T00:00:00.000Z'),c=session.config,manifest=pvtManifest(c,seed),start=30000,end=start+c.durationMs,raws:PvtRaw[]=[];let at=start,held:string[]=[]
  for(const plan of manifest.formal){const target=at+plan.waitMs,events:PvtEvent[]=held.length&&at+1<end?[{kind:'up',atMs:at+1,token:'k:Space',input:'keyboard',repeat:false}]:[],answer=rt(target,start),closeAt=target+(answer??30000),raw:PvtRaw={plan,phaseStartedAtMs:start,waitStartedAtMs:at,endedAtMs:end,outcome:'budget-end',stopReason:null,heldBefore:[...held],events,ignoredRepeats:0,overflow:false}
    if(target<end)events.push({kind:'target',atMs:target})
    if(target<end&&closeAt<end){raw.endedAtMs=closeAt;raw.outcome=answer===null?'timeout':'responded';if(answer!==null)events.push({kind:'down',atMs:closeAt,token:'k:Space',input:'keyboard',repeat:false})}
    else if(target<end&&answer===null&&closeAt===end)raw.outcome='timeout'
    raws.push(raw);held=reviewPvt(raw,plan,c).heldAfter;at=raw.endedAtMs;if(at>=end)break
  }
  return {session,config:c,randomSeed:seed,trials:raws.map(pvtEnvelope),raws,manifest}
}
describe('PVT independent content authority',()=>{
  it('freezes180/600 seconds, three practice targets and bounded deterministic waits without promising a target count',()=>{
    for(const profile of ['experience','research'] as const){const c=pvtConfig(profile),m=pvtManifest(c,seed)
      expect(c.durationMs).toBe(profile==='research'?600000:180000);expect(c.practice.waitMs).toEqual([3000,5000,3000]);expect(m.practice).toHaveLength(2);expect(m.practice.every(x=>x.length===3)).toBe(true)
      expect(m.formal.every(p=>p.waitMs>=2000&&p.waitMs<=10000&&Number.isInteger(p.waitMs))).toBe(true);expect(pvtManifest(c,seed)).toEqual(m);expect(pvtManifest(c,seed+'different')).not.toEqual(m)
      expect(()=>pvtManifest({...c,durationMs:120000},seed)).toThrow();expect(()=>pvtManifest({...c,feedbackMs:1500},seed)).toThrow()
    }
    expect(pvtDefinition.publication.status).toBe('DRAFT');expect(createPvtPresentation().metrics).toEqual({});expect(createPvtPresentation().hiddenMetrics).toContain('internal')
  })
  it('accepts true0 and fast positive first responses without imported speed classes, and preserves signed internal differences',()=>{
    const f=fixture('research',(target,start)=>target-start<300000?100:400),score=scoreFixture(f),r=projectPvtReport(score)
    expect(r.state).toBe('interpretable');expect(r.durationMs).toBe(600000);expect((score.metrics.internal as {responseSpeedDifference:number}).responseSpeedDifference).toBe(-7.5)
    const zeroScore=scoreFixture(fixture('experience',()=>0)),zero=projectPvtReport(zeroScore);expect(zero.stats.responded).toBeGreaterThan(0);expect((zeroScore.metrics.statistics as PvtStats).medianMs).toBe(0);expect((zeroScore.metrics.statistics as PvtStats).responseSpeed).toBeNull();expect(zero.stats.timeouts).toBe(0)
    const fastScore=scoreFixture(fixture('experience',()=>50)),fast=projectPvtReport(fastScore);expect(fast.stats.earlyPresses).toBe(0);expect((fastScore.metrics.statistics as PvtStats).medianMs).toBe(50);expect(fast.state).toBe('interpretable')
  })
  it('separates full30-second nonresponses from scheduled censoring, waiting and unexecuted targets',()=>{
    const f=fixture('experience',()=>null),noResponseScore=scoreFixture(f),r=projectPvtReport(noResponseScore),stats=noResponseScore.metrics.statistics as PvtStats;expect(r.stats.timeouts).toBeGreaterThan(0);expect(r.stats.responded).toBe(0);expect(stats.medianMs).toBeNull();expect(stats.responseSpeed).toBeNull();expect(stats.timeoutRate).toBe(1);expect(r.state).toBe('interpretable')
    const empty=projectPvtReport(scoreFixture({...f,trials:[]}));expect((scoreFixture({...f,trials:[]}).metrics.statistics as PvtStats).timeoutRate).toBeNull();expect(empty.observedMs).toBeNull();expect(empty.state).toBe('invalid')
    const last=f.raws[f.raws.length-1];expect(last.outcome).toBe('budget-end');expect(r.stats.censored).toBe(last.events.some(e=>e.kind==='target')?1:0)
    const partial=structuredClone(f);partial.trials=partial.trials.slice(0,2);const raw=partial.trials[1].payload;raw.outcome='interrupted';raw.stopReason='hidden';raw.endedAtMs=raw.waitStartedAtMs+10;raw.events=raw.events.filter(e=>e.atMs<=raw.endedAtMs);partial.trials[1]=pvtEnvelope(raw)
    const limited=projectPvtReport(scoreFixture(partial));expect(limited.state).toBe('limited');expect(limited.stats.timeouts).toBe(1);expect(limited.stats.interruptedTargets).toBe(0)
    expect(()=>scoreFixture({...partial,trials:[...partial.trials,f.trials[2]]})).toThrow('ownership')
  })
  it('rejects changed waits, false timeouts, resumed or overlapping streams, wrong versions and altered envelopes',()=>{
    const f=fixture(),bad=structuredClone(f);bad.trials[0].payload.plan.waitMs++;expect(()=>scoreFixture(bad)).toThrow('plan')
    const timeout=structuredClone(f);timeout.trials[0].payload.outcome='timeout';timeout.trials[0].payload.events=timeout.trials[0].payload.events.filter(e=>e.kind!=='down');expect(()=>scoreFixture(timeout)).toThrow('timeout')
    const gap=structuredClone(f);gap.trials[1].payload.waitStartedAtMs++;gap.trials[1]=pvtEnvelope(gap.trials[1].payload);expect(()=>scoreFixture(gap)).toThrow('ownership')
    expect(()=>scoreFixture({...f,config:pvtConfig('research')})).toThrow('config');expect(()=>scoreFixture({...f,session:{...f.session,scoringVersion:'new'}})).toThrow('identity')
    const env=structuredClone(f);env.trials[0].flags.premature=true;expect(()=>scoreFixture(env)).toThrow('ownership')
    const target=structuredClone(f);const event=target.trials[0].payload.events.find(e=>e.kind==='target')!;event.atMs--;expect(()=>scoreFixture(target)).toThrow('exposure')
  })
  it('uses a common three-state public projection with actual denominators, frozen bilingual copy and no internal metrics',()=>{
    const f=fixture(),score=scoreFixture(f);score.metrics.internal={privateMarker:'private-research-field'};const r=projectPvtReport(score)
    expect(pvtPublic(r).summary!.completeTargets).toBe(r.stats.responded+r.stats.timeouts);expect(r.stats).not.toHaveProperty('responseSpeed');expect(r.stats).not.toHaveProperty('medianMs');expect(pvtDownload(r)).not.toContain('responseSpeed');expect(pvtDownload(r)).not.toContain('private-research-field');expect(pvtImageData(r)!.summary).toEqual(pvtPublic(r).summary)
    const changed=structuredClone(r);(changed.copy.zh as {title:string}).title='unversioned copy';expect(()=>pvtPublic(changed)).toThrow('Invalid')
    const invalid=projectPvtReport(scoreFixture({...f,trials:[]}));expect(pvtPublic(invalid).summary).toBeNull();expect(pvtPublic(invalid).observations).toEqual([]);expect(pvtImageData(invalid)).toBeNull();expect(JSON.parse(pvtDownload(invalid)).summary).toBeNull()
    const limited=projectPvtReport(scoreFixture({...f,trials:f.trials.slice(0,1)}));expect(limited.state).toBe('limited');expect(pvtPublic(limited).notice).toBeTruthy();expect(pvtPublic(r,'en').observations[0]).toContain('fully observed targets')
  })
  it('verifies stored practice, actual language, realm, all original digests and final completion independently',()=>{
    const f=fixture(),context:PvtContext={contextKey:'pvt-backend-synthetic',language:'en',snapshot:f.session as PvtContext['snapshot'],randomSeed:seed,manifestHash:pvtDigest(f.manifest)},realm={timeOriginMs:100000,pageInstanceId:'synthetic-page'},prepared:PvtPrepared={context,manifest:f.manifest,realm,bindingDigest:pvtDigest({context,manifest:f.manifest,realm})}
    let at=1000;const practice:PvtRaw[]=f.manifest.practice[0].map(plan=>{const start=at,target=start+plan.waitMs;at=target+200;return {plan,phaseStartedAtMs:1000,waitStartedAtMs:start,endedAtMs:at,outcome:'responded',stopReason:null,heldBefore:[],events:[{kind:'target',atMs:target},{kind:'down',atMs:at,token:'p:'+plan.index,input:'touch',repeat:false}],ignoredRepeats:0,overflow:false}})
    // Each new cycle must receive the previous release; do not make all held lists empty.
    for(let i=1;i<practice.length;i++){practice[i].heldBefore=['p:'+(i-1)];practice[i].events.unshift({kind:'up',atMs:practice[i].waitStartedAtMs+1,token:'p:'+(i-1),input:'touch',repeat:false})}
    const records:PvtDraft[]=[...practice,...f.raws].map(raw=>{const base={contextKey:context.contextKey,raw,configHash:context.snapshot.configHash,protocolSignature:context.snapshot.protocolSignature,manifestHash:context.manifestHash,realm,recordKey:`${raw.plan.phase}:${raw.plan.round}:${raw.plan.index}`};return {...base,recordDigest:pvtDigest(base)}})
    const body={contextKey:context.contextKey,configHash:context.snapshot.configHash,protocolSignature:context.snapshot.protocolSignature,manifestHash:context.manifestHash,formalCount:f.raws.length,practiceCount:3,termination:'completed' as const,terminationReason:null,recordDigests:records.map(r=>r.recordDigest)},claim={...body,finalPayloadDigest:pvtDigest(body)}
    const verified=verifyPvtSubmission(prepared,records,claim);expect(verified.report.teachingLanguage).toBe('en');expect(verified.report.state).toBe('interpretable')
    expect(()=>verifyPvtSubmission({...prepared,context:{...context,language:'zh'}},records,claim)).toThrow('prepared')
    expect(()=>verifyPvtSubmission(prepared,records.slice(3),claim)).toThrow('practice')
    const altered=structuredClone(records);altered[3].realm.pageInstanceId='other-page';expect(()=>verifyPvtSubmission(prepared,altered,claim)).toThrow('binding')
    expect(()=>verifyPvtSubmission(prepared,records,{...claim,termination:'aborted'})).toThrow('claim');expect(same(verified.report.copy,projectPvtReport(verified.score,'en').copy)).toBe(true)
  })
})
