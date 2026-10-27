import React from 'react'
import {describe,it,expect,vi,afterEach} from 'vitest'
import {render,screen,fireEvent,act,cleanup} from '@testing-library/react'
import {createSnapshot} from '../../../../../../backend/src/modules/cognitive/content-candidates/serial-reaction-learning/package'
import {finalizeAttempt} from '../../../../../../backend/src/modules/cognitive/content-candidates/serial-reaction-learning/attempt'
import {planFor,type Location} from './generated/protocol'
import {digest,validateContext,type Context,type Ports,type Draft,type FinalClaim} from './contracts'
import {Capture} from './capture'
import {Session} from './session'
import {SerialReactionLearningTask} from './SerialReactionLearningTask'
const flush=async()=>{for(let i=0;i<30;i++)await Promise.resolve()}
function fixture(){
  const snapshot=createSnapshot('experience','2026-10-27T00:00:00.000Z'),randomSeed='synthetic-SRL-frontend',context:Context={contextKey:'synthetic-srl:epoch-1',language:'zh',snapshot,randomSeed,manifestHash:digest(planFor(snapshot.config,randomSeed))},stored=new Map<string,Draft>()
  const ports:Ports={prepareLocalAttempt:vi.fn(async(c,manifest,realm)=>({fresh:true as const,contextKey:c.contextKey,bindingDigest:digest({context:c,manifest,realm})})),persistLocalDraft:vi.fn(async record=>{const old=stored.get(record.recordKey);if(old&&old.recordDigest!==record.recordDigest)throw Error('Conflicting synthetic record');stored.set(record.recordKey,structuredClone(record));return {retained:true as const,contextKey:record.contextKey,recordKey:record.recordKey,recordDigest:record.recordDigest}}),finalize:vi.fn(async claim=>({finalSaved:true as const,contextKey:context.contextKey,finalPayloadDigest:claim.finalPayloadDigest,receiptId:'synthetic-core-only-not-archive',report:finalizeAttempt({context,records:[...stored.values()],claim}).report}))}
  return {context,ports,stored}
}
async function practice(s:Session,clock:{now:number},fail=false){
  s.begin()
  for(let i=0;i<4;i++){s.expose(clock.now+=1000);if(fail&&i===0)s.tap(((s.activePlan!.target+1)%4) as Location,clock.now+100);s.tap(s.activePlan!.target,clock.now+200);await flush();if(i<3)s.nextPractice()}
}
afterEach(()=>{cleanup();vi.restoreAllMocks();vi.unstubAllGlobals();vi.useRealTimers()})
describe('SRL touch capture, teaching, durability and actual native projection',()=>{
  it('retains a wrong first tap at true zero and corrections without rewriting, and ignores later input after completion',()=>{
    const p=planFor(createSnapshot('experience').config,'capture')[0],c=new Capture(p,100),wrong=((p.target+1)%4) as Location
    c.tap(wrong,100);expect(c.done).toBe(false);c.ignore();c.tap(p.target,450);c.tap(wrong,500)
    expect(c.raw).toMatchObject({firstLocation:wrong,firstCorrect:false,firstRtMs:0,correctAtMs:450,status:'completed',ignoredInputCount:1});expect(c.raw.events).toHaveLength(2)
    const stopped=new Capture(p,100);stopped.tap(wrong,110);stopped.interrupt('participant-ended',120);expect(stopped.raw).toMatchObject({firstCorrect:false,firstRtMs:10,correctAtMs:null,status:'interrupted'})
  })
  it('freezes actual teaching language, blocks invalid language/context before exposure and survives StrictMode cleanup',async()=>{
    const f=fixture(),en:Context={...f.context,language:'en'},s=new Session(en,f.ports,()=>{});en.language='zh';await s.prepare();expect(s.context.language).toBe('en');expect(Object.isFrozen(s.context)).toBe(true)
    const prepared=vi.mocked(f.ports.prepareLocalAttempt).mock.calls[0][0];expect(prepared.language).toBe('en');expect(()=>validateContext({...f.context,language:'fr'} as never)).toThrow();expect(()=>validateContext({...f.context,manifestHash:'0'.repeat(64)})).toThrow()
    const mismatch=fixture();render(<SerialReactionLearningTask context={mismatch.context} ports={mismatch.ports} language="en"/>);expect(screen.getByRole('alert')).toBeTruthy();expect(mismatch.ports.prepareLocalAttempt).not.toHaveBeenCalled();cleanup()
    const fresh=fixture();render(<React.StrictMode><SerialReactionLearningTask context={fresh.context} ports={fresh.ports}/></React.StrictMode>);await act(flush);fireEvent.click(screen.getByRole('button',{name:'我明白了，准备练习'}));await act(flush);fireEvent.click(screen.getByRole('button',{name:'开始'}));expect(document.querySelector('[data-srl-view="running"]')).toBeTruthy()
  })
  it('keeps a touch compatibility click from advancing the newly rendered practice button in the same gesture',async()=>{
    const f=fixture();render(<SerialReactionLearningTask context={f.context} ports={f.ports}/>);fireEvent.click(screen.getByRole('button',{name:'我明白了，准备练习'}));await act(flush);fireEvent.click(screen.getByRole('button',{name:'开始'}))
    const target=planFor(f.context.snapshot.config,f.context.randomSeed,'practice',0)[0].target,names=['左上','右上','左下','右下']
    const touch=(element:Element)=>{const e=new Event('pointerdown',{bubbles:true,cancelable:true});Object.defineProperties(e,{pointerType:{value:'touch'},isPrimary:{value:true}});fireEvent(element,e)}
    touch(screen.getByRole('button',{name:names[target]}));await act(flush);expect(document.querySelector('[data-srl-view="practice-feedback"]')).toBeTruthy()
    const next=screen.getByRole('button',{name:'继续练习'});fireEvent.click(next,{detail:1});expect(document.querySelector('[data-srl-view="practice-feedback"]')).toBeTruthy()
    touch(next);fireEvent.click(next,{detail:1});expect(document.querySelector('[data-srl-view="running"]')).toBeTruthy();expect(screen.getByText('练习 2/4')).toBeTruthy()
  })
  it('requires full re-teaching after failed or interrupted practice, then completes two whole runs with one immutable final retry',async()=>{
    const f=fixture(),clock={now:100},s=new Session(f.context,f.ports,()=>{},()=>clock.now);await s.prepare();await practice(s,clock,true);expect(s.practicePassed).toBe(false);s.acceptPractice();expect(s.phase).toBe('practice');s.reviewInstructions();expect(s.view).toBe('practice-instructions');await practice(s,clock);expect(s.practicePassed).toBe(true);s.acceptPractice();expect(s.view).toBe('formal-ready')
    const finalize=f.ports.finalize;let first=true;f.ports.finalize=finalize // Session has frozen function binding; mock the existing function implementation instead.
    const original=vi.mocked(finalize).getMockImplementation()!;vi.mocked(finalize).mockImplementation(async claim=>{const r=await original(claim);if(first){first=false;return {...r,finalPayloadDigest:'0'.repeat(64)}}return r})
    s.begin();for(let i=0;i<168;i++){s.expose(clock.now+=2000);s.tap(s.activePlan!.target,clock.now+200);await flush();if(s.view==='interval')s.nextAfterInterval();else if(s.view==='break')s.begin()}
    await flush();expect(s.view).toBe('retry');expect(s.receipt).toBeNull();const claim=vi.mocked(finalize).mock.calls[0][0];expect(claim).toMatchObject({formalCount:168,practiceCount:8,termination:'completed',terminationReason:null});await s.retry();await flush();expect(s.view).toBe('report');expect(s.receipt?.report.summary?.answered).toBe(168);expect(vi.mocked(finalize).mock.calls[1][0]).toEqual(claim)
    const records=[...f.stored.values()],bad=structuredClone(records);bad[0].raw.firstCorrect=true;const {recordDigest:_,...base}=bad[0];bad[0].recordDigest=digest(base)
    const next:FinalClaim={...claim,recordDigests:bad.map(x=>x.recordDigest)};const {finalPayloadDigest:__,...claimBase}=next;next.finalPayloadDigest=digest(claimBase);expect(()=>finalizeAttempt({context:f.context,records:bad,claim:next})).toThrow('first response')
    const interrupted=fixture(),t=new Session(interrupted.context,interrupted.ports,()=>{},()=>100);await t.prepare();t.begin();t.expose(100);t.stop('window-blur',101);await flush();expect(t.practiceIncomplete).toBe(true);t.reviewInstructions();expect(t.view).toBe('practice-instructions')
  })
  it('does not let draft IO set the target interval, retains failure/interruption and retries identical originals before reporting',async()=>{
    const f=fixture(),clock={now:100},save=vi.mocked(f.ports.persistLocalDraft),base=save.getMockImplementation()!;let reject:(e:Error)=>void=()=>{};let once=true
    save.mockImplementation(record=>{if(record.phase==='test'&&once){once=false;return new Promise((_,r)=>{reject=r})}return base(record)})
    const s=new Session(f.context,f.ports,()=>{},()=>clock.now);await s.prepare();await practice(s,clock);s.acceptPractice();s.begin();s.expose(clock.now+=2000);s.tap(s.activePlan!.target,clock.now+100);expect(s.view).toBe('interval');s.nextAfterInterval();s.expose(clock.now+=1000);expect(s.view).toBe('running');expect(f.ports.finalize).not.toHaveBeenCalled()
    reject(Error('synthetic persistence failure'));await flush();expect(s.view).toBe('retry');expect(s.retained.filter(x=>x.phase==='test')).toHaveLength(2);expect(s.retained.slice(-1)[0]?.raw).toMatchObject({status:'interrupted',firstRtMs:null});const pending=s.retained.filter(x=>x.phase==='test').map(x=>x.recordDigest);await s.retry();await flush();expect(s.view).toBe('report');expect(s.receipt?.report.state).toBe('limited');expect(s.receipt?.report.summary).toBeNull();expect([...f.stored.values()].filter(x=>x.phase==='test').map(x=>x.recordDigest)).toEqual(pending)
  })
  it('rejects incomplete practice in the host guard even if records and final digests are freshly recomputed',async()=>{
    const f=fixture(),clock={now:100},s=new Session(f.context,f.ports,()=>{},()=>clock.now);await s.prepare();await practice(s,clock);s.acceptPractice();s.begin();s.expose(clock.now+=1000);s.tap(s.activePlan!.target,clock.now+100);await flush();s.stop('participant-ended',clock.now+200);await flush();expect(s.view).toBe('report')
    const claim=vi.mocked(f.ports.finalize).mock.calls[0][0],records=[...f.stored.values()].slice(1),changed={...claim,practiceCount:3,recordDigests:records.map(r=>r.recordDigest)};const {finalPayloadDigest:_,...base}=changed;changed.finalPayloadDigest=digest(base);expect(()=>finalizeAttempt({context:f.context,records,claim:changed})).toThrow()
  })
})
