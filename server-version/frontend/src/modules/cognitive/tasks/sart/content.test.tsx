import React from 'react'
import {afterEach,describe,it,expect,vi} from 'vitest'
import {render,screen,fireEvent,act,cleanup} from '@testing-library/react'
import {createSartSnapshot} from '../../../../../../backend/src/modules/cognitive/content-candidates/sart/package'
import {scoreSart,sartEnvelope} from '../../../../../../backend/src/modules/cognitive/content-candidates/sart/scorer'
import {projectSartReport} from '../../../../../../backend/src/modules/cognitive/content-candidates/sart/report'
import {sartConfig,sartPlan} from './generated/protocol'
import {SartCapture} from './capture'
import {digest,sartManifestPlans,type SartContext,type SartDraft,type SartPorts,type SartReceipt} from './contracts'
import {SartSession} from './session'
import {SartTask} from './SartTask'
import {SartReport} from './SartReport'
const flush=async()=>{for(let i=0;i<50;i++)await Promise.resolve()}
function fixture(){const snapshot=createSartSnapshot('experience','2026-10-27T00:00:00.000Z'),randomSeed='sart-frontend-synthetic',context:SartContext={contextKey:'sart-content-synthetic',randomSeed,snapshot:snapshot as SartContext['snapshot'],manifestHash:digest(sartManifestPlans(snapshot.config,randomSeed))},stored=new Map<string,SartDraft>();let clock=100
  const ports:SartPorts={prepareLocalAttempt:vi.fn(async(c,manifest,realm)=>({fresh:true as const,contextKey:c.contextKey,bindingDigest:digest({context:c,manifest,realm})})),persistLocalDraft:vi.fn(async record=>{stored.set(record.recordKey,structuredClone(record));return {retained:true as const,contextKey:record.contextKey,recordKey:record.recordKey,recordDigest:record.recordDigest}}),finalize:vi.fn(async claim=>({finalSaved:true as const,contextKey:context.contextKey,finalPayloadDigest:claim.finalPayloadDigest,receiptId:'synthetic-frozen-sart-report',report:projectSartReport(scoreSart({session:snapshot,config:snapshot.config,randomSeed,trials:[...stored.values()].filter(r=>r.phase==='test').map(r=>sartEnvelope(r.raw))}))}))}
  return {context,ports,stored,snapshot,get clock(){return clock},set clock(v:number){clock=v},session:()=>new SartSession(context,ports,()=>{},()=>clock)}}
function completeTrial(f:ReturnType<typeof fixture>,s:SartSession,correct=true,rt=100){const cap=s.capture!,p=cap.raw.plan,t=cap.raw.onsetMs,press=correct?p.digit!==3:p.digit===3
  if(press){f.clock=t+rt;s.input({kind:'down',atMs:f.clock,token:'p:1',input:'touch',repeat:false});f.clock++;s.input({kind:'up',atMs:f.clock,token:'p:1',input:'touch',repeat:false})}
  f.clock=t+p.digitMs;s.tick(f.clock);f.clock=t+p.digitMs+p.maskMs;s.tick(f.clock)
}
async function practice(f:ReturnType<typeof fixture>,s:SartSession,correct:boolean){for(let i=0;i<9;i++){completeTrial(f,s,correct);f.clock+=600;s.tick(f.clock);await flush()}}
afterEach(()=>{cleanup();vi.restoreAllMocks();vi.unstubAllGlobals()})
describe('SART candidate flows',()=>{
  it('records mask responses, first0ms, ignored repeats and releases across trial boundaries without accepting late presses',()=>{
    const p=sartPlan(sartConfig('experience'),'capture').find(p=>p.digit!==3)!,cap=new SartCapture(p,100)
    cap.input({kind:'down',atMs:100,token:'k:Space',input:'keyboard',repeat:false});for(let i=0;i<300;i++)cap.input({kind:'down',atMs:101+i/10,token:'k:Space',input:'keyboard',repeat:true})
    cap.tick(350);cap.tick(1250);expect(cap.review).toMatchObject({rtMs:0,complete:true,heldAfter:['k:Space']});expect(cap.raw.events).toHaveLength(2);expect(cap.raw.ignoredRepeats).toBe(300)
    const held=new SartCapture({...p,index:1},1250,cap.review.heldAfter);held.input({kind:'down',atMs:1251,token:'k:Space',input:'keyboard',repeat:false});held.input({kind:'up',atMs:1252,token:'k:Space',input:'keyboard',repeat:false});held.tick(1500);held.input({kind:'down',atMs:1600,token:'k:Space',input:'keyboard',repeat:false});held.tick(2400);expect(held.review.rtMs).toBe(350)
    const late=new SartCapture(p,100);late.tick(350);late.input({kind:'down',atMs:1250,token:'p:1',input:'touch',repeat:false});late.tick(1250);expect(late.review.rtMs).toBeNull()
  })
  it('finishes failed+retried9 practice and continuous90 formal, queues persistence without gaps, freezes final retry and gates reports',async()=>{
    const f=fixture(),base=f.ports.finalize;let first=true;f.ports.finalize=vi.fn(async c=>{const result=await base(c);if(first){first=false;return {...result,finalSaved:false} as unknown as SartReceipt}return result})
    const s=f.session();await s.prepare();s.begin(f.clock);await practice(f,s,false);expect(s.practicePassed).toBe(false);s.reviewInstructions();expect(s.view).toBe('practice-instructions');f.clock++;s.begin(f.clock);await practice(f,s,true);expect(s.practicePassed).toBe(true);s.acceptPractice();f.clock++;s.begin(f.clock)
    for(let i=0;i<90;i++){completeTrial(f,s);await flush()}
    expect(s.view).toBe('retry');expect(s.receipt).toBeNull();await s.retry();await flush();expect(s.view).toBe('report');expect(s.retained).toHaveLength(108)
    const formal=s.retained.filter(r=>r.phase==='test');expect(formal.every((r,i)=>r.round===0&&(!i||r.raw.onsetMs===formal[i-1].raw.endedAtMs))).toBe(true)
    const calls=vi.mocked(f.ports.finalize).mock.calls;expect(calls[1][0]).toEqual(calls[0][0]);expect(calls[0][0]).toMatchObject({formalCount:90,practiceCount:18,termination:'completed',terminationReason:null})
    expect(s.receipt!.report).toMatchObject({state:'interpretable',complete:90,stats:{go:80,noGo:10,omissions:0,commissions:0,medianMs:100}})
    const rendered=render(<SartReport report={s.receipt!.report}/>);expect(screen.getByText('0 / 10')).toBeTruthy();expect(screen.getByText('0 / 80')).toBeTruthy()
    const empty=projectSartReport(scoreSart({session:f.snapshot,config:f.snapshot.config,randomSeed:f.context.randomSeed,trials:[]}));rendered.rerender(<SartReport report={empty}/>);expect(screen.getByText('本次暂时无法形成表现结论')).toBeTruthy();expect(screen.queryByText('0 / 10')).toBeNull();expect(screen.queryByRole('table')).toBeNull()
  })
  it('preserves originals on delayed save failure, interrupts only the current window and retries identical bytes without new exposure',async()=>{
    let reject:((e:Error)=>void)|null=null
    const g=fixture(),writes:SartDraft[]=[],save=g.ports.persistLocalDraft;let fail=false
    g.ports.persistLocalDraft=vi.fn(async r=>{writes.push(structuredClone(r));if(fail)await new Promise<never>((_,no)=>{reject=no});return save(r)})
    const t=g.session();await t.prepare();t.begin(g.clock);await practice(g,t,true);t.acceptPractice();g.clock++;t.begin(g.clock);fail=true;completeTrial(g,t);expect(t.view).toBe('running');const nextOnset=t.capture!.raw.onsetMs;g.clock=nextOnset+20
    expect(reject).not.toBeNull();(reject as unknown as (e:Error)=>void)(Error('local unavailable'));await flush();expect(t.view).toBe('retry');expect(t.retained.filter(r=>r.phase==='test')).toHaveLength(2)
    const original=writes[writes.length-1];fail=false;await t.retry();await flush();expect(t.view).toBe('report');expect(writes.some((r,i)=>i>writes.indexOf(original)&&r.recordKey===original.recordKey&&r.recordDigest===original.recordDigest)).toBe(true)
    expect(t.receipt!.report).toMatchObject({state:'limited',complete:1,received:2});expect(t.retained.filter(r=>r.phase==='test')[1].raw.status).toBe('interrupted')
  })
  it('renders both complete teaching examples, actual touch/Space/mask controls, repeats instructions after incomplete practice and freezes context changes',async()=>{
    const f=fixture();let now=100,id=0;const frames=new Map<number,FrameRequestCallback>()
    vi.spyOn(performance,'now').mockImplementation(()=>now);vi.stubGlobal('requestAnimationFrame',(cb:FrameRequestCallback)=>{frames.set(++id,cb);return id});vi.stubGlobal('cancelAnimationFrame',(key:number)=>frames.delete(key))
    const frame=async(at:number)=>{now=at;f.clock=at;const current=[...frames.values()];frames.clear();await act(async()=>{current.forEach(cb=>cb(at));await flush()})}
    const v=render(<SartTask context={f.context} ports={f.ports}/>);expect(screen.getByText('例子一：4 → 3 → 8')).toBeTruthy();expect(screen.getByText('例子二：数字已经消失')).toBeTruthy()
    fireEvent.click(screen.getByRole('button',{name:'准备练习'}));await screen.findByRole('button',{name:'开始'});fireEvent.click(screen.getByRole('button',{name:'开始'}));await frame(now)
    const t=now;await frame(t+400);expect(screen.getByLabelText('掩蔽')).toBeTruthy();now=t+500;f.clock=now
    fireEvent.keyDown(window,{key:' ',code:'Space'});fireEvent.keyUp(window,{key:' ',code:'Space'});const e=new MouseEvent('pointerdown',{bubbles:true,button:0});Object.defineProperties(e,{pointerType:{value:'touch'},pointerId:{value:1}});now++;fireEvent(screen.getByRole('button',{name:'回应'}),e)
    await frame(t+1800);await frame(t+2400);fireEvent.click(screen.getByRole('button',{name:'结束本次'}));await flush();expect(screen.getByRole('region',{name:'操作说明与例子'})).toBeTruthy();expect(screen.getByText('例子一：4 → 3 → 8')).toBeTruthy();expect(screen.getByRole('button',{name:'开始下一组练习'})).toBeTruthy()
    expect(f.stored.get('practice:0:0')!.raw.events.some(x=>x.kind==='down'&&x.input==='keyboard')).toBe(true)
    v.rerender(<SartTask context={{...f.context,contextKey:'another'}} ports={f.ports}/>);expect(screen.getByRole('alert')).toBeTruthy();expect(f.ports.prepareLocalAttempt).toHaveBeenCalledTimes(1)
  })
  it('refuses reused durable identities and provides complete English instruction/report copy',async()=>{
    const f=fixture();f.ports.prepareLocalAttempt=vi.fn(async c=>({fresh:false,contextKey:c.contextKey,bindingDigest:'wrong'} as never));render(<SartTask context={f.context} ports={f.ports} language="en"/>)
    expect(screen.getByText('Example 1: 4 → 3 → 8')).toBeTruthy();expect(screen.getByText('Example 2: the digit has disappeared')).toBeTruthy();fireEvent.click(screen.getByRole('button',{name:'Prepare practice'}));expect((await screen.findByRole('alert')).textContent).toContain('no digit was shown');expect(f.stored.size).toBe(0)
  })
  it('survives the existing application StrictMode effect replay while preparing exactly one fresh attempt',async()=>{
    const f=fixture();render(<React.StrictMode><SartTask context={f.context} ports={f.ports}/></React.StrictMode>);await act(flush)
    fireEvent.click(screen.getByRole('button',{name:'准备练习'}));expect(await screen.findByRole('button',{name:'开始'})).toBeTruthy();expect(f.ports.prepareLocalAttempt).toHaveBeenCalledTimes(1);expect(f.stored.size).toBe(0)
  })
  it('keeps a completed stream completed when only the last local save requires retry',async()=>{
    const f=fixture(),save=f.ports.persistLocalDraft;let failed=false
    f.ports.persistLocalDraft=vi.fn(async r=>{if(r.phase==='test'&&r.index===89&&!failed){failed=true;throw Error('last acknowledgement unavailable')}return save(r)})
    const s=f.session();await s.prepare();s.begin(f.clock);await practice(f,s,true);s.acceptPractice();f.clock++;s.begin(f.clock)
    for(let i=0;i<90;i++){completeTrial(f,s);await flush()}expect(s.view).toBe('retry');expect(s.retained.filter(r=>r.phase==='test')).toHaveLength(90)
    await s.retry();await flush();expect(s.view).toBe('report');expect(vi.mocked(f.ports.finalize).mock.calls[0][0]).toMatchObject({termination:'completed',terminationReason:null,formalCount:90});expect(s.receipt!.report.state).toBe('interpretable')
  })
})
