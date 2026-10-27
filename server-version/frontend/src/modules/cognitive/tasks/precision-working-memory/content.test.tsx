import React from 'react'
import {describe,it,expect,vi,afterEach} from 'vitest'
import {render,screen,fireEvent,act,cleanup} from '@testing-library/react'
import {createSpatialMemorySnapshot} from '../../../../../../backend/src/modules/cognitive/content-candidates/precision-working-memory/package'
import {scoreSpatialMemory,spatialEnvelope} from '../../../../../../backend/src/modules/cognitive/content-candidates/precision-working-memory/scorer'
import {projectSpatialReport} from '../../../../../../backend/src/modules/cognitive/content-candidates/precision-working-memory/report'
import {SPATIAL_IDENTITY,SPATIAL_PROTOCOL,spatialPlan,targetAngle,normalizeAngle,position} from './generated/protocol'
import {digest,type SpatialContext,type SpatialPorts,type SpatialDraft,type SpatialReceipt} from './contracts'
import {SpatialSession} from './session'
import {SpatialMemoryTask} from './SpatialMemoryTask'
import {SpatialReport} from './SpatialReport'
const flush=async()=>{for(let i=0;i<30;i++)await Promise.resolve()}
function fixture(){const snapshot=createSpatialMemorySnapshot('experience'),randomSeed='spatial-candidate-short',context:SpatialContext={contextKey:'synthetic-new-attempt',randomSeed,
  snapshot:{schemaVersion:1,...SPATIAL_IDENTITY,config:snapshot.config,protocol:SPATIAL_PROTOCOL,configHash:snapshot.configHash,protocolSignature:snapshot.protocolSignature,frozenAt:snapshot.frozenAt},
  manifestHash:digest(spatialPlan(snapshot.config,randomSeed))},stored=new Map<string,SpatialDraft>();let clock=100
  const ports:SpatialPorts={prepareLocalAttempt:vi.fn(async(c,manifest,realm)=>({contextKey:c.contextKey,bindingDigest:digest({context:c,manifest,realm}),fresh:true as const})),
    persistLocalDraft:vi.fn(async r=>{stored.set(r.recordKey,structuredClone(r));return {contextKey:r.contextKey,recordKey:r.recordKey,recordDigest:r.recordDigest,retained:true as const}}),
    finalize:vi.fn(async claim=>{const trials=[...stored.values()].filter(r=>r.raw.plan.phase==='test').map(r=>spatialEnvelope(r.raw))
      return {contextKey:context.contextKey,finalPayloadDigest:claim.finalPayloadDigest,finalSaved:true as const,receiptId:'synthetic-saved-report',report:projectSpatialReport(scoreSpatialMemory({session:snapshot,config:snapshot.config,randomSeed,trials}))}})}
  return {context,ports,stored,get clock(){return clock},set clock(v:number){clock=v},session:()=>new SpatialSession(context,ports,()=>{},()=>clock)}
}
async function answer(f:ReturnType<typeof fixture>,s:SpatialSession,error=0){const cap=s.capture!,raw=cap.raw,practice=raw.plan.phase==='practice',p=practice?s.context.snapshot.config.practice:s.context.snapshot.config
  const encoding=raw.startedAtPerfMs+raw.plan.itiMs,retention=encoding+p.encodingMs,prompt=retention+p.retentionMs
  s.tick(encoding);s.tick(retention);s.tick(prompt);const xy=position(normalizeAngle(targetAngle(raw.plan)+error));f.clock=prompt+100
  s.pointer(f.clock,xy.x,xy.y,'touch','down');f.clock+=10;s.pointer(f.clock,xy.x,xy.y,'touch','up');f.clock+=100;s.confirm(f.clock);await flush()
}
async function practice(f:ReturnType<typeof fixture>,s:SpatialSession,error=0){f.clock+=100;s.begin(f.clock)
  for(let i=0;i<6;i++){await answer(f,s,error);if(i<5){f.clock+=100;s.nextPractice(f.clock)}}}
afterEach(()=>{cleanup();vi.restoreAllMocks();vi.unstubAllGlobals()})
describe('spatial candidate minimal critical flows',()=>{
  it('re-teaches failed practice, isolates original rounds and stops on a failed local save without replay',async()=>{
    const f=fixture(),s=f.session();await s.prepare();await practice(f,s,60);expect(s.practicePassed).toBe(false);const old=s.retained
    s.acceptPractice();s.begin(f.clock+100);expect(s.view).toBe('practice-feedback');expect(s.capture).toBeNull();s.reviewInstructions();expect(s.view).toBe('practice-instructions')
    await practice(f,s,10);expect(s.practicePassed).toBe(true);expect(s.retained.slice(0,6)).toEqual(old);expect(s.retained.map(r=>r.recordKey)).toEqual([0,1].flatMap(n=>Array.from({length:6},(_,i)=>`practice:${n}:${i}`)))
    expect(f.ports.prepareLocalAttempt).toHaveBeenCalledTimes(1)
    const bad=fixture(),writes:SpatialDraft[]=[];let fail=true;const save=bad.ports.persistLocalDraft;bad.ports.persistLocalDraft=async r=>{writes.push(structuredClone(r));if(fail)throw Error('local failed');return save(r)}
    const interrupted=bad.session();await interrupted.prepare();interrupted.begin(100);await answer(bad,interrupted)
    expect(interrupted.view).toBe('retry');expect(interrupted.capture).toBeNull();fail=false;await interrupted.retry();expect(writes[1]).toEqual(writes[0]);expect(interrupted.view).toBe('stopped');expect(bad.ports.finalize).not.toHaveBeenCalled()
  })
  it('completes the true 40-trial short candidate and renders only a matching authoritative frozen report receipt',async()=>{
    const f=fixture(),finalize=f.ports.finalize;let first=true;f.ports.finalize=vi.fn(async claim=>{const receipt=await finalize(claim);if(first){first=false;return {...receipt,finalSaved:false} as unknown as SpatialReceipt}return receipt})
    // Construct after the final port has been fixed, so the session captures its real stable port.
    const live=f.session();await live.prepare();await practice(f,live);live.acceptPractice();f.clock+=100;live.begin(f.clock)
    for(let i=0;i<40;i++)await answer(f,live,2)
    expect(live.view).toBe('retry');expect(live.receipt).toBeNull();await live.retry();expect(live.view).toBe('report');expect(live.retained).toHaveLength(46)
    const calls=vi.mocked(f.ports.finalize).mock.calls;expect(calls).toHaveLength(2);expect(calls[1][0]).toEqual(calls[0][0]);expect(calls[0][0]).toMatchObject({termination:'completed',formalCount:40,practiceCount:6})
    const report=live.receipt!.report;render(<SpatialReport report={report}/>);expect(screen.getByText('实用版')).toBeTruthy();expect(screen.getByText(/记1个位置时，本次落点平均偏离目标2°/)).toBeTruthy();cleanup()
    const partial=projectSpatialReport(scoreSpatialMemory({session:createSpatialMemorySnapshot('experience'),config:f.context.snapshot.config,randomSeed:f.context.randomSeed,trials:[]}))
    render(<SpatialReport report={partial}/>);expect(screen.queryByText('记1个位置：平均偏差')).toBeNull();expect(screen.getByText('本次记录暂时无法解读')).toBeTruthy()
  })
  it('shows the approved real component, accepts touch release/confirmation, and repeats full examples after failure',async()=>{
    const f=fixture();let next=0,clock=100;const frames=new Map<number,FrameRequestCallback>()
    vi.stubGlobal('innerWidth',390);vi.stubGlobal('requestAnimationFrame',(cb:FrameRequestCallback)=>{frames.set(++next,cb);return next});vi.stubGlobal('cancelAnimationFrame',(id:number)=>frames.delete(id));vi.spyOn(performance,'now').mockImplementation(()=>clock)
    vi.spyOn(Element.prototype,'getBoundingClientRect').mockReturnValue({x:0,y:0,left:0,top:0,width:300,height:300,right:300,bottom:300,toJSON:()=>({})})
    const frame=async(at:number)=>{clock=at;const callbacks=[...frames.values()];frames.clear();await act(async()=>{for(const cb of callbacks)cb(at);await flush()})}
    render(<SpatialMemoryTask context={f.context} ports={f.ports}/>);expect(screen.getByText(/例2：同时看见5条/)).toBeTruthy();fireEvent.click(screen.getByRole('button',{name:'准备练习'}));await screen.findByRole('button',{name:'开始练习'});fireEvent.click(screen.getByRole('button',{name:'开始练习'}));await frame(clock)
    const plan=spatialPlan(f.context.snapshot.config,f.context.randomSeed,'practice',0)
    for(let i=0;i<6;i++){const start=clock,encoding=start+plan[i].itiMs,prompt=encoding+1500;await frame(encoding);await frame(encoding+1000);await frame(prompt)
      expect(screen.getByRole('button',{name:'确认位置'})).toBeDisabled();const xy=position(normalizeAngle(targetAngle(plan[i])+60)),element=screen.getByRole('img',{name:'颜色与位置区域'})
      const pointer=(kind:string)=>{const e=new MouseEvent(kind,{bubbles:true,button:0,clientX:xy.x,clientY:xy.y});Object.defineProperties(e,{pointerType:{value:'touch'},isPrimary:{value:true},pointerId:{value:1}});fireEvent(element,e)}
      clock+=100;pointer('pointerdown');expect(screen.getByRole('button',{name:'确认位置'})).toBeDisabled();clock+=10;pointer('pointerup');expect(screen.getByRole('button',{name:'确认位置'})).not.toBeDisabled();clock+=100
      await act(async()=>{fireEvent.click(screen.getByRole('button',{name:'确认位置'}));await flush()})
      if(i<5)fireEvent.click(screen.getByRole('button',{name:'下一次练习'}))
    }
    expect(screen.queryByRole('button',{name:'准备正式作答'})).toBeNull();fireEvent.click(screen.getByRole('button',{name:'重新查看说明与例子'}));expect(screen.getByRole('region',{name:'操作说明与例子'})).toBeTruthy();expect(screen.getByText(/例3：第一次点偏了/)).toBeTruthy();expect(f.ports.prepareLocalAttempt).toHaveBeenCalledTimes(1)
  })
})
