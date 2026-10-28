import React from 'react'
import {afterEach,describe,expect,it,vi} from 'vitest'
import {act,cleanup,fireEvent,render,screen} from '@testing-library/react'
import {createDualSnapshot} from '../../../../../../backend/src/modules/cognitive/content-candidates/dual-arrow/package'
import {scoreDual,dualEnvelope} from '../../../../../../backend/src/modules/cognitive/content-candidates/dual-arrow/scorer'
import {projectDualReport} from '../../../../../../backend/src/modules/cognitive/content-candidates/dual-arrow/report'
import {DUAL_IDENTITY,DUAL_PROTOCOL,dualPlan,requiredDual,allDualCorrect} from './generated/protocol'
import {digest,type DualContext,type DualDraft,type DualPorts} from './contracts'
import {DualArrowTask} from './DualArrowTask'
import {DualSession} from './session'

const flush=async()=>{for(let i=0;i<30;i++)await Promise.resolve()}
function fixture(){
 const snapshot=createDualSnapshot('experience'),randomSeed='dual-interrupted-practice-review',context:DualContext={contextKey:'dual-review-current-realm',randomSeed,snapshot:{schemaVersion:1,...DUAL_IDENTITY,protocol:DUAL_PROTOCOL,config:snapshot.config,configHash:snapshot.configHash,protocolSignature:snapshot.protocolSignature,frozenAt:snapshot.frozenAt},manifestHash:digest(dualPlan(snapshot.config,randomSeed))},stored=new Map<string,DualDraft>()
 const ports:DualPorts={prepareLocalAttempt:vi.fn(async(c,manifest,realm)=>({fresh:true as const,contextKey:c.contextKey,bindingDigest:digest({context:c,manifest,realm})})),persistLocalDraft:vi.fn(async record=>{stored.set(record.recordKey,structuredClone(record));return {retained:true as const,contextKey:record.contextKey,recordKey:record.recordKey,recordDigest:record.recordDigest}}),finalize:vi.fn(async claim=>({finalSaved:true as const,contextKey:context.contextKey,finalPayloadDigest:claim.finalPayloadDigest,receiptId:'dual-review-saved',report:projectDualReport(scoreDual({session:snapshot,config:snapshot.config,randomSeed,trials:[...stored.values()].filter(r=>r.phase==='test').map(r=>dualEnvelope(r.raw))}))}))}
 return {context,ports,stored}
}
afterEach(()=>{cleanup();vi.restoreAllMocks();vi.unstubAllGlobals()})
describe('Dual interrupted practice stays within a fresh practice group',()=>{
 it('waits for the interrupted draft acknowledgement, rereads all examples, and starts a new group without replaying the old trial',async()=>{
  const f=fixture(),save=f.ports.persistLocalDraft;let release!:()=>void,now=100,next=0
  const retained=new Promise<void>(resolve=>{release=resolve}),frames=new Map<number,FrameRequestCallback>()
  f.ports.persistLocalDraft=vi.fn(async row=>{await retained;return save(row)})
  vi.stubGlobal('innerWidth',390);vi.spyOn(performance,'now').mockImplementation(()=>now)
  vi.stubGlobal('requestAnimationFrame',(callback:FrameRequestCallback)=>{frames.set(++next,callback);return next});vi.stubGlobal('cancelAnimationFrame',(id:number)=>frames.delete(id))
  const frame=async(at:number)=>{now=at;const callbacks=[...frames.values()];frames.clear();await act(async()=>{for(const callback of callbacks)callback(at);await flush()})}
  render(<DualArrowTask context={f.context} ports={f.ports}/> )
  fireEvent.click(screen.getByRole('button',{name:'准备练习'}));await screen.findByRole('button',{name:'开始'})
  fireEvent.click(screen.getByRole('button',{name:'开始'}));await frame(now);await frame(now+800)
  now++;fireEvent.blur(window)
  expect(screen.getByRole('status').textContent).toContain('正在确认记录已保存')
  expect(screen.queryByRole('button',{name:'重新查看说明与例子'})).toBeNull()
  await act(async()=>{release();await flush()})
  expect(screen.getByText('这轮练习尚未完成')).toBeTruthy()
  expect(screen.queryByRole('button',{name:'下一轮练习'})).toBeNull()
  expect(f.stored.get('practice:0:0')?.raw).toMatchObject({status:'interrupted',stopReason:'blur'})
  const original=structuredClone(f.stored.get('practice:0:0'))
  fireEvent.click(screen.getByRole('button',{name:'重新查看说明与例子'}))
  expect(screen.getByRole('region',{name:'操作说明与例子'})).toBeTruthy()
  expect(screen.getByText('同一幅图，三种规则')).toBeTruthy()
  expect(screen.getByText('只做3轮较易练习')).toBeTruthy()
  fireEvent.click(screen.getByRole('button',{name:'开始下一组练习'}));await frame(now+1)
  expect(screen.getByRole('heading',{name:'只答上方蓝'})).toBeTruthy()
  expect(f.stored.get('practice:0:0')).toEqual(original)
  expect(f.ports.prepareLocalAttempt).toHaveBeenCalledTimes(1)
  expect(f.ports.finalize).not.toHaveBeenCalled()
  now++;fireEvent.blur(window);await act(async()=>flush())
  expect(f.stored.get('practice:1:0')?.raw.plan).toMatchObject({phase:'practice',round:1,index:0})
  fireEvent.click(screen.getByRole('button',{name:'重新查看说明与例子'}))
  fireEvent.click(screen.getByRole('button',{name:'开始下一组练习'}));await frame(now+1)
  now++;fireEvent.blur(window);await act(async()=>flush())
  expect(f.stored.get('practice:2:0')?.raw.plan).toMatchObject({phase:'practice',round:2,index:0})
  expect(screen.queryByRole('button',{name:'重新查看说明与例子'})).toBeNull()
  expect(screen.getByText('已尝试3组，可先结束并向组织者询问。')).toBeTruthy()
 })
 it('keeps formal interruption terminal and retains the actual formal prefix without replay',async()=>{
  const f=fixture();let now=100;const session=new DualSession(f.context,f.ports,()=>{},()=>now)
  await session.prepare();session.begin(now)
  for(let i=0;i<3;i++){
   const cap=session.capture!,plan=cap.raw.plan;now=cap.raw.startedAtPerfMs+plan.fixationMs;session.tick(now)
   for(const channel of ['blue','red'] as const){if(!requiredDual(plan.mode,channel))continue;now++;session.input({kind:'activate',atMs:now,channel,direction:plan[channel],token:'assistive:'+channel,input:'assistive',key:null,primary:true,repeat:false})}
   now=cap.raw.state.feedbackAtMs!+(allDualCorrect(cap.raw.state,plan)?500:1000);session.tick(now);await flush()
   if(i<2)session.nextPractice(++now)
  }
  session.acceptPractice();session.begin(++now);session.stop('blur',++now);await flush()
  expect(session.view).toBe('report');expect(session.capture).toBeNull()
  expect(session.receipt?.report).toMatchObject({state:'invalid',received:1,valid:0})
  expect(vi.mocked(f.ports.finalize).mock.calls[0][0]).toMatchObject({formalCount:1,practiceCount:3,termination:'aborted',terminationReason:'blur'})
  const records=session.retained;session.reviewInstructions();session.begin(++now)
  expect(session.view).toBe('report');expect(session.capture).toBeNull();expect(session.retained).toEqual(records)
  expect(f.ports.prepareLocalAttempt).toHaveBeenCalledTimes(1)
 })
 it('keeps explicit ending, page disposal and failed practice persistence terminal',async()=>{
  for(const reason of ['participant-ended','page-hidden','context-disposed']){
   const f=fixture(),session=new DualSession(f.context,f.ports,()=>{})
   await session.prepare();session.begin(100)
   if(reason==='context-disposed')session.dispose();else session.stop(reason,101)
   await flush();const records=session.retained
   session.reviewInstructions();session.begin(102)
   expect(session.capture).toBeNull();expect(session.retained).toEqual(records)
   expect(session.view).not.toBe('practice-instructions');expect(f.ports.finalize).not.toHaveBeenCalled()
  }
  const f=fixture(),save=f.ports.persistLocalDraft;let unavailable=true
  f.ports.persistLocalDraft=vi.fn(async row=>{if(unavailable)throw Error('local unavailable');return save(row)})
  const session=new DualSession(f.context,f.ports,()=>{});await session.prepare();session.begin(100);session.stop('blur',101);await flush()
  expect(session.view).toBe('retry');session.reviewInstructions();session.begin(102);expect(session.view).toBe('retry')
  const pending=structuredClone(session.retained[0]);unavailable=false;await session.retry()
  expect(session.view).toBe('stopped');expect(session.retained[0]).toEqual(pending)
  expect(vi.mocked(f.ports.persistLocalDraft).mock.calls[1][0]).toEqual(vi.mocked(f.ports.persistLocalDraft).mock.calls[0][0])
  expect(f.ports.finalize).not.toHaveBeenCalled()
 })
})
