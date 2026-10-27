import React from 'react'
import {afterEach,describe,it,expect,vi} from 'vitest'
import {render,screen,fireEvent,act,cleanup} from '@testing-library/react'
import {createPvtSnapshot} from '../../../../../../backend/src/modules/cognitive/content-candidates/pvt/package'
import {verifyPvtSubmission,type PvtPrepared} from '../../../../../../backend/src/modules/cognitive/content-candidates/pvt/submission'
import {scorePvt} from '../../../../../../backend/src/modules/cognitive/content-candidates/pvt/scorer'
import {projectPvtReport,pvtPublic,pvtImageData,pvtDownload} from '../../../../../../backend/src/modules/cognitive/content-candidates/pvt/report'
import {pvtConfig,pvtManifest,validatePvtContext,type PvtContext,type PvtDraft} from './generated/protocol'
import {PvtCapture} from './capture'
import {digest,type PvtPorts,type PvtReceipt} from './contracts'
import {PvtSession} from './session'
import {PvtTask} from './PvtTask'
import {PvtReport} from './PvtReport'
const flush=async()=>{for(let i=0;i<60;i++)await Promise.resolve()}
function fixture(profile:'experience'|'research'='experience',language:'zh'|'en'='zh'){
  const snapshot=createPvtSnapshot(profile,'2026-10-27T00:00:00.000Z'),seed='pvt-frontend-synthetic-'+profile,manifest=pvtManifest(snapshot.config,seed),context:PvtContext={contextKey:'pvt-synthetic-'+profile,language,snapshot:snapshot as PvtContext['snapshot'],randomSeed:seed,manifestHash:digest(manifest)},stored=new Map<string,PvtDraft>();let prepared:PvtPrepared|null=null
  const f={clock:100,snapshot,manifest,context,stored,get prepared(){return prepared},ports:null as unknown as PvtPorts,session:()=>new PvtSession(context,f.ports,()=>{},()=>f.clock)}
  f.ports={prepareLocalAttempt:vi.fn(async(c,m,realm)=>{prepared=structuredClone({context:c,manifest:m,realm,bindingDigest:digest({context:c,manifest:m,realm})});return {fresh:true as const,contextKey:c.contextKey,bindingDigest:prepared.bindingDigest}}),persistLocalDraft:vi.fn(async record=>{stored.set(record.recordKey,structuredClone(record));return {retained:true as const,contextKey:record.contextKey,recordKey:record.recordKey,recordDigest:record.recordDigest}}),finalize:vi.fn(async claim=>{if(!prepared)throw Error('No prepared attempt');const v=verifyPvtSubmission(prepared,[...stored.values()],claim);return {contextKey:claim.contextKey,finalPayloadDigest:v.finalPayloadDigest,finalSaved:true as const,receiptId:'synthetic-report-only-not-archive',report:v.report}})}
  return f
}
type F=ReturnType<typeof fixture>
function press(f:F,s:PvtSession,rt:number|null=250){
  const cap=s.capture!,onset=cap.raw.waitStartedAtMs+cap.raw.plan.waitMs,cutoff=cap.raw.plan.phase==='test'?cap.raw.phaseStartedAtMs+cap.config.durationMs:Infinity
  f.clock=Math.min(onset,cutoff);s.tick(f.clock);if(!s.capture||s.capture!==cap)return
  f.clock=Math.min(onset+(rt??30000),cutoff)
  if(rt===null)s.tick(f.clock);else{s.input({kind:'down',atMs:f.clock,token:'p:1',input:'touch',repeat:false});f.clock++;s.input({kind:'up',atMs:f.clock,token:'p:1',input:'touch',repeat:false})}
}
async function practice(f:F,s:PvtSession){for(let i=0;i<3;i++){press(f,s);await flush()}f.clock+=2000;s.tick(f.clock);await flush();expect(s.view).toBe('practice-result');s.acceptPractice();f.clock++;s.begin(f.clock)}
async function finish(f:F,s:PvtSession,rt:number|null=250){let cycles=0;while(s.view==='running'){if(++cycles>603)throw Error('Cycle bound');press(f,s,rt);await flush()}await flush()}
afterEach(()=>{cleanup();vi.restoreAllMocks();vi.unstubAllGlobals()})
describe('PVT candidate flows',()=>{
  it('captures first0, holds, feedback suppression and exact timeout/cutoff boundaries without speed thresholds',()=>{
    const c=pvtConfig('experience'),plan=pvtManifest(c,'capture').formal[0],cap=new PvtCapture(c,plan,100,100)
    cap.tick(100+plan.waitMs);cap.input({kind:'down',atMs:100+plan.waitMs,token:'k:Space',input:'keyboard',repeat:false});expect(cap.review.rtMs).toBe(0)
    const next=new PvtCapture(c,{...plan,index:1,feedbackMs:1000},100,cap.raw.endedAtMs,cap.review.heldAfter)
    next.input({kind:'down',atMs:next.raw.waitStartedAtMs+1,token:'k:Space',input:'keyboard',repeat:false});next.input({kind:'down',atMs:next.raw.waitStartedAtMs+2,token:'p:2',input:'touch',repeat:false});expect(next.done).toBe(false)
    next.input({kind:'up',atMs:next.raw.waitStartedAtMs+3,token:'k:Space',input:'keyboard',repeat:false});next.tick(next.raw.waitStartedAtMs+plan.waitMs);next.input({kind:'down',atMs:next.targetOnsetMs!+50,token:'k:Space',input:'keyboard',repeat:false});expect(next.review.rtMs).toBe(50)
    const timeout=new PvtCapture(c,plan,0,0);timeout.tick(plan.waitMs);timeout.input({kind:'down',atMs:plan.waitMs+30000,token:'p:1',input:'touch',repeat:false});expect(timeout.raw.outcome).toBe('timeout');expect(timeout.review.rtMs).toBeNull()
    const waiting=new PvtCapture(c,plan,0,179999);waiting.tick(180000);expect(waiting.raw.outcome).toBe('budget-end');expect(waiting.review.appeared).toBe(false)
    const censor=new PvtCapture(c,plan,0,180000-plan.waitMs-10);censor.tick(179990);censor.input({kind:'down',atMs:180000,token:'p:1',input:'touch',repeat:false});expect(censor.review).toMatchObject({censored:true,rtMs:null,completedBudget:true})
    const simultaneous=new PvtCapture(c,plan,0,150000-plan.waitMs);simultaneous.tick(150000);simultaneous.tick(180000);expect(simultaneous.raw.outcome).toBe('timeout')
    const full=new PvtCapture(c,plan,0,180000-plan.waitMs-10);full.tick(179990);for(let i=0;i<127;i++)full.input({kind:'up',atMs:179990+i/100,token:'p:99',input:'touch',repeat:false});full.input({kind:'down',atMs:180000,token:'p:1',input:'touch',repeat:false});expect(full.raw.overflow).toBe(false);expect(full.review.censored).toBe(true)
  })
  it('re-presents teaching after failed practice, completes both approved durations and retains authoritative synthetic originals',async()=>{
    const evidence:unknown[]=[]
    for(const profile of ['experience','research'] as const){const f=fixture(profile),s=f.session();await s.prepare();s.begin(f.clock)
      f.clock++;s.input({kind:'down',atMs:f.clock,token:'k:Space',input:'keyboard',repeat:false});expect(s.view).toBe('practice-instructions');s.input({kind:'up',atMs:++f.clock,token:'k:Space',input:'keyboard',repeat:false});await flush();s.begin(++f.clock)
      await practice(f,s);await finish(f,s);expect(s.view).toBe('report');expect(s.receipt!.report.state).toBe('interpretable');expect(s.receipt!.report.observedMs).toBe(profile==='research'?600000:180000)
      expect(s.retained.filter(r=>r.raw.plan.phase==='practice')).toHaveLength(4);const formal=s.retained.filter(r=>r.raw.plan.phase==='test');expect(formal.every((r,i)=>!i||r.raw.waitStartedAtMs===formal[i-1].raw.endedAtMs)).toBe(true)
      const claim=vi.mocked(f.ports.finalize).mock.calls[0][0];expect(claim.termination).toBe('completed');expect(claim.practiceCount).toBe(4)
      evidence.push({kind:'SYNTHETIC_DEVELOPMENT_ORIGINALS_NOT_PARTICIPANT_DATA',profile,prepared:f.prepared,records:s.retained,claim,receipt:s.receipt,public:pvtPublic(s.receipt!.report),image:pvtImageData(s.receipt!.report),download:JSON.parse(pvtDownload(s.receipt!.report))})
    }
    if(process.env.PVT_EVIDENCE_DIR){const fs=await import('node:fs/promises');await fs.writeFile(process.env.PVT_EVIDENCE_DIR+'/completed-originals.json',JSON.stringify(evidence,null,2)+'\n')}
  })
  it('preserves failed save originals, stops subsequent exposure, and retries the exact final without replaying',async()=>{
    const f=fixture(),save=f.ports.persistLocalDraft;let reject:((e:Error)=>void)|null=null,fail=false
    f.ports.persistLocalDraft=vi.fn(async r=>{if(fail)await new Promise<never>((_,no)=>{reject=no});return save(r)})
    const final=f.ports.finalize;let wrong=true;f.ports.finalize=vi.fn(async c=>{const r=await final(c);if(wrong){wrong=false;return {...r,finalSaved:false} as unknown as PvtReceipt}return r})
    const s=f.session();await s.prepare();s.begin(f.clock);await practice(f,s);fail=true;press(f,s);expect(s.view).toBe('running');expect(reject).not.toBeNull();const original=s.retained[3];f.clock+=10;(reject as unknown as (e:Error)=>void)(Error('local unavailable'));await flush();expect(s.view).toBe('retry');expect(s.retained.filter(r=>r.raw.plan.phase==='test')).toHaveLength(2)
    fail=false
    await s.retry();await flush();expect(s.view).toBe('retry');const retained=s.retained;await s.retry();await flush();expect(s.view).toBe('report');expect(s.retained).toEqual(retained);expect(s.retained[3]).toEqual(original);expect(s.receipt!.report.state).toBe('limited')
    const calls=vi.mocked(f.ports.finalize).mock.calls;expect(calls[1][0]).toEqual(calls[0][0]);expect(vi.mocked(f.ports.persistLocalDraft).mock.calls.filter(([r])=>r.recordKey===original.recordKey).every(([r])=>r.recordDigest===original.recordDigest)).toBe(true)
  })
  it('keeps an already-complete last-save failure complete and a completed practice save retry does not replay practice',async()=>{
    const f=fixture(),save=f.ports.persistLocalDraft;let practiceFailed=false,formalFailed=false
    f.ports.persistLocalDraft=vi.fn(async r=>{if(r.raw.plan.phase==='practice'&&r.raw.plan.index===2&&!practiceFailed){practiceFailed=true;throw Error('last practice ack')}if(r.raw.plan.phase==='test'&&r.raw.outcome==='budget-end'&&!formalFailed){formalFailed=true;throw Error('last formal ack')}return save(r)})
    const s=f.session();await s.prepare();s.begin(f.clock);for(let i=0;i<3;i++){press(f,s);await flush()}expect(s.view).toBe('retry');await s.retry();await flush();expect(s.view).toBe('practice-feedback');f.clock+=2000;s.tick(f.clock);expect(s.view).toBe('practice-result');s.acceptPractice();s.begin(++f.clock);await finish(f,s);expect(s.view).toBe('retry');await s.retry();await flush();expect(s.view).toBe('report');expect(s.receipt!.report.finishedBudget).toBe(true);expect(s.retained.filter(r=>r.raw.plan.phase==='practice')).toHaveLength(3)
  })
  it('freezes teaching language and identity, rejects reused attempts and survives StrictMode replay before exposure',async()=>{
    const wrong=fixture();expect(()=>validatePvtContext({...wrong.context,language:undefined} as never,digest)).toThrow('language')
    const v=render(<PvtTask context={wrong.context} ports={wrong.ports} language="en"/>);expect(screen.getByRole('alert')).toBeTruthy();expect(wrong.ports.prepareLocalAttempt).not.toHaveBeenCalled();v.unmount()
    const f=fixture('experience','en');render(<React.StrictMode><PvtTask context={f.context} ports={f.ports}/></React.StrictMode>);await act(flush);expect(screen.getByText('Example 1: outline → solid')).toBeTruthy();expect(screen.getByText('Example 2: an early press or no response')).toBeTruthy();fireEvent.click(screen.getByRole('button',{name:'Prepare practice'}));expect(await screen.findByRole('button',{name:'Start'})).toBeTruthy();expect(f.ports.prepareLocalAttempt).toHaveBeenCalledTimes(1);expect(f.prepared!.context.language).toBe('en');cleanup()
    const reused=fixture();reused.ports.prepareLocalAttempt=vi.fn(async c=>({fresh:false,contextKey:c.contextKey,bindingDigest:'wrong'} as never));const s=reused.session();await s.prepare();expect(s.view).toBe('blocked');expect(s.capture).toBeNull()
    const tamper=fixture();tamper.ports.prepareLocalAttempt=vi.fn(async(c,m,realm)=>({fresh:true as const,contextKey:c.contextKey,bindingDigest:digest({context:{...c,language:'en'},manifest:m,realm})}));const t=tamper.session();await t.prepare();expect(t.view).toBe('blocked')
  })
  it('renders actual circle/Space controls, re-presents full teaching on failure, and suppresses invalid body/image/download',async()=>{
    const f=fixture();let now=100,id=0;const frames=new Map<number,FrameRequestCallback>();vi.spyOn(performance,'now').mockImplementation(()=>now);vi.stubGlobal('requestAnimationFrame',(cb:FrameRequestCallback)=>{frames.set(++id,cb);return id});vi.stubGlobal('cancelAnimationFrame',(key:number)=>frames.delete(key))
    const frame=async(at:number)=>{now=at;f.clock=at;const current=[...frames.values()];frames.clear();await act(async()=>{current.forEach(cb=>cb(at));await flush()})}
    render(<PvtTask context={f.context} ports={f.ports}/>);expect(screen.getByText('先练3次，没有速度合格线')).toBeTruthy();expect(screen.getByText(/本次实用版持续180秒/)).toBeTruthy();fireEvent.click(screen.getByRole('button',{name:'准备练习'}));await screen.findByRole('button',{name:'开始'});fireEvent.click(screen.getByRole('button',{name:'开始'}));await frame(now)
    expect(screen.getByLabelText('空心圆：等待')).toBeTruthy();await frame(3100);expect(screen.getByLabelText('实心圆：回应')).toBeTruthy();now=3150;f.clock=now;fireEvent.keyDown(window,{key:' ',code:'Space'});fireEvent.keyUp(window,{key:' ',code:'Space'});await act(flush);expect(f.stored.get('practice:0:0')!.raw.outcome).toBe('responded')
    fireEvent.click(screen.getByRole('button',{name:'结束本次'}));await act(flush);expect(screen.getByText('例子一：空心圆 → 实心圆')).toBeTruthy();expect(screen.getByRole('button',{name:'开始下一组练习'})).toBeTruthy();cleanup()
    const empty=projectPvtReport(scorePvt({session:f.snapshot,config:f.snapshot.config,randomSeed:f.context.randomSeed,trials:[]}));render(<PvtReport report={empty}/>);expect(screen.getByText('本次暂时无法形成表现结论')).toBeTruthy();expect(screen.queryByText('完整观察的目标')).toBeNull();expect(pvtImageData(empty)).toBeNull();expect(JSON.parse(pvtDownload(empty)).summary).toBeNull()
  })
})
