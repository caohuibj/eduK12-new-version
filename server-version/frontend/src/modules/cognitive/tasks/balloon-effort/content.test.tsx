import React from 'react'
import {describe,it,expect,vi,afterEach} from 'vitest'
import {render,screen,fireEvent,act,cleanup} from '@testing-library/react'
import {createBalloonEffortSnapshot} from '../../../../../../backend/src/modules/cognitive/content-candidates/balloon-effort/package'
import {scoreBalloonEffort,effortEnvelope} from '../../../../../../backend/src/modules/cognitive/content-candidates/balloon-effort/scorer'
import {projectEffortReport} from '../../../../../../backend/src/modules/cognitive/content-candidates/balloon-effort/report'
import {EFFORT_IDENTITY,EFFORT_PROTOCOL,effortPlan,type Side} from './generated/protocol'
import {digest,type EffortContext,type EffortPorts,type EffortDraft,type EffortReceipt} from './contracts'
import {EffortCapture} from './capture'
import {EffortSession} from './session'
import {BalloonEffortTask} from './BalloonEffortTask'
import {EffortReport} from './EffortReport'
const flush=async()=>{for(let i=0;i<30;i++)await Promise.resolve()}
function fixture(){const snapshot=createBalloonEffortSnapshot('experience'),randomSeed='effort-content-synthetic',context:EffortContext={contextKey:'effort-new-synthetic',randomSeed,
 snapshot:{schemaVersion:1,...EFFORT_IDENTITY,config:snapshot.config,protocol:EFFORT_PROTOCOL,configHash:snapshot.configHash,protocolSignature:snapshot.protocolSignature,frozenAt:snapshot.frozenAt},manifestHash:digest(effortPlan(snapshot.config,randomSeed))},stored=new Map<string,EffortDraft>();let clock=100
 const ports:EffortPorts={prepareLocalAttempt:vi.fn(async(c,manifest,realm)=>({contextKey:c.contextKey,bindingDigest:digest({context:c,manifest,realm}),fresh:true as const})),
  persistLocalDraft:vi.fn(async record=>{stored.set(record.recordKey,structuredClone(record));return {contextKey:record.contextKey,recordKey:record.recordKey,recordDigest:record.recordDigest,retained:true as const}}),
  finalize:vi.fn(async claim=>{const trials=[...stored.values()].flatMap(r=>r.kind==='trial'&&r.raw.plan.phase==='test'?[effortEnvelope(r.raw)]:[])
   return {contextKey:context.contextKey,finalPayloadDigest:claim.finalPayloadDigest,finalSaved:true as const,receiptId:'synthetic-effort-report',report:projectEffortReport(scoreBalloonEffort({session:snapshot,config:snapshot.config,randomSeed,trials}))}})}
 return {snapshot,context,ports,stored,get clock(){return clock},set clock(v:number){clock=v},session:()=>new EffortSession(context,ports,()=>{},()=>clock)}
}
function toChoice(cap:EffortCapture){const start=cap.raw.startedAtPerfMs;cap.tick(start+1000);cap.tick(start+2000);cap.tick(start+2700);cap.tick(start+4200);return start+4200}
async function finishRound(f:ReturnType<typeof fixture>,s:EffortSession,presses=1){const cap=s.capture!,p=cap.raw.plan,start=cap.raw.startedAtPerfMs
 for(const delta of [1000,2000,2700,4200]){f.clock=start+delta;s.tick(f.clock)}
 const side:Side=p.forced==='low'?(p.highSide==='left'?'right':'left'):p.highSide;f.clock+=100;s.down(f.clock,'pointer:1',side,'touch');f.clock+=10;s.up(f.clock,'pointer:1');f.clock+=3000;s.tick(f.clock);const onset=f.clock
 for(let i=0;i<presses;i++){f.clock=onset+(i+1)*50;s.down(f.clock,'pointer:1',side,'touch');f.clock+=25;s.up(f.clock,'pointer:1')}
 if(cap.stage==='execution'){f.clock=onset+p.executionMs;s.tick(f.clock)}
 const feedback=cap.raw.onsets.feedback!;f.clock=feedback+1000;s.tick(f.clock);f.clock=feedback+2000;s.tick(f.clock);await flush()
}
async function teach(f:ReturnType<typeof fixture>,s:EffortSession){await s.prepare();s.begin(f.clock);await finishRound(f,s);f.clock+=100;s.nextDemo(f.clock);await finishRound(f,s);s.nextDemo(f.clock)
 for(const [i,answer] of [1,0,2].entries()){f.clock+=100;s.answerQuiz(answer,f.clock);await flush();if(i<2)s.nextQuestion()}
 s.acceptPractice();f.clock+=100;s.begin(f.clock)}
afterEach(()=>{cleanup();vi.restoreAllMocks();vi.unstubAllGlobals()})
describe('effort minimal candidate flows',()=>{
 it('counts only complete selected-side cycles, ignores holds/extra fingers and never resets the execution clock',()=>{
  const f=fixture(),p=effortPlan(f.context.snapshot.config,'capture')[0],cap=new EffortCapture(f.context.snapshot.config,p,100),choice=toChoice(cap),side=p.highSide
  const choiceKey=side==='left'?'key:KeyQ':'key:KeyP';cap.down(choice+100,choiceKey,side,'keyboard');cap.up(choice+200,choiceKey);const onset=choice+3200
  cap.down(choice+300,'early',side,'touch');cap.tick(onset);cap.up(onset+10,'early');expect(cap.raw.presses).toHaveLength(0)
  cap.down(onset+100,'press',side,'touch');cap.down(onset+101,'press',side,'touch',true);cap.down(onset+102,'other',side,'touch',false,false);cap.up(onset+110,'other');cap.up(onset+120,'press')
  const other:Side=side==='left'?'right':'left';cap.down(onset+200,'wrong',other,'touch');cap.up(onset+220,'wrong');expect(cap.raw.presses).toHaveLength(1);expect(cap.raw.onsets.execution).toBe(onset)
  cap.tick(onset+24999);expect(cap.stage).toBe('execution');cap.tick(onset+25000);expect(cap.stage).toBe('feedback');expect(cap.raw.reward).toBe(p.rewardAvailable?Math.round(p.highReward/p.highGoal*100)/100:0)
  const missed=new EffortCapture(f.context.snapshot.config,p,100),prompt=toChoice(missed);missed.down(prompt+6400,'late',side,'touch');missed.up(prompt+6500,'late');missed.tick(prompt+6500)
  expect(missed.raw.choice).toBeNull();expect(missed.raw.choiceOutcome).toBe('no_response');expect(missed.raw.onsets.execution).toBeNull();expect(missed.raw.reward).toBeNull()
 })
 it('completes 18 true choices with proportional points, keeps final retries identical and gates the public report',async()=>{
  const f=fixture(),base=f.ports.finalize;let first=true;f.ports.finalize=vi.fn(async claim=>{const receipt=await base(claim);if(first){first=false;return {...receipt,finalSaved:false} as unknown as EffortReceipt}return receipt})
  const s=f.session();await teach(f,s)
  for(let i=0;i<18;i++)await finishRound(f,s,s.capture!.raw.plan.highGoal+20)
  expect(s.view).toBe('retry');expect(s.receipt).toBeNull();await s.retry();expect(s.view).toBe('report');expect(s.retained).toHaveLength(23)
  const calls=vi.mocked(f.ports.finalize).mock.calls;expect(calls[1][0]).toEqual(calls[0][0]);expect(calls[0][0]).toMatchObject({formalCount:18,practiceCount:2,quizCount:3,termination:'completed',terminationReason:null})
  expect(s.receipt!.report).toMatchObject({state:'interpretable',valid:18,high:18,noChoice:0,executionCount:18});expect(s.receipt!.report.executionByInput.touch.trials).toBe(18)
  const view=render(<EffortReport report={s.receipt!.report}/>);expect(screen.getByText(/本次18次有效选择中，你有18次/)).toBeTruthy()
  const invalid=projectEffortReport(scoreBalloonEffort({session:f.snapshot,config:f.snapshot.config,randomSeed:f.context.randomSeed,trials:[]}));view.rerender(<EffortReport report={invalid}/>);expect(screen.queryByText('按较多选项的按压基准分开看')).toBeNull();expect(screen.getByText('本次暂时无法形成选择结论')).toBeTruthy()
 })
 it('runs the real touch/quiz component, repeats the full guide after failure and saves a failed retry without re-exposure',async()=>{
  const f=fixture();let now=100,next=0;const frames=new Map<number,FrameRequestCallback>();let fail=false;const writes:EffortDraft[]=[],save=f.ports.persistLocalDraft
  f.ports.persistLocalDraft=vi.fn(async r=>{writes.push(structuredClone(r));if(fail)throw Error('local failed');return save(r)})
  vi.stubGlobal('innerWidth',390);vi.spyOn(performance,'now').mockImplementation(()=>now);vi.stubGlobal('requestAnimationFrame',(cb:FrameRequestCallback)=>{frames.set(++next,cb);return next});vi.stubGlobal('cancelAnimationFrame',(id:number)=>frames.delete(id))
  const frame=async(at:number)=>{now=at;f.clock=at;const callbacks=[...frames.values()];frames.clear();await act(async()=>{for(const cb of callbacks)cb(at);await flush()})}
  const cycle=(name:string)=>{const button=screen.getByRole('button',{name});for(const kind of ['pointerdown','pointerup']){now+=10;const event=new MouseEvent(kind,{bubbles:true,button:0});Object.defineProperties(event,{pointerType:{value:'touch'},isPrimary:{value:true},pointerId:{value:1}});fireEvent(button,event)}}
  const demo=async()=>{const start=now;for(const delta of [1000,2000,2700,4200])await frame(start+delta);cycle('选择左侧');const prepare=now;await frame(prepare+3000);cycle('按压左侧');const end=prepare+8000;await frame(end);await frame(end+1000);await frame(end+2000)}
  render(<BalloonEffortTask context={f.context} ports={f.ports}/>);expect(screen.getByText(/例1：100次为5点基准/)).toBeTruthy();fireEvent.click(screen.getByRole('button',{name:'准备练习'}));await screen.findByRole('button',{name:'开始操作演示'});fireEvent.click(screen.getByRole('button',{name:'开始操作演示'}));await frame(now);await demo()
  fireEvent.click(screen.getByRole('button',{name:'下一次演示'}));const start=now;for(const delta of [1000,2000,2700,4200])await frame(start+delta);cycle('选择右侧');const prepare=now;await frame(prepare+3000);cycle('按压右侧');await frame(prepare+8000);await frame(prepare+9000);await frame(prepare+10000)
  fireEvent.click(screen.getByRole('button',{name:'回答理解题'}))
  for(let i=0;i<3;i++){fireEvent.click(screen.getAllByRole('radio')[0]);await act(async()=>{fireEvent.click(screen.getByRole('button',{name:'确认答案'}));await flush()});if(i<2)fireEvent.click(screen.getByRole('button',{name:'下一题'}))}
  expect(screen.queryByRole('button',{name:'准备正式选择'})).toBeNull();fireEvent.click(screen.getByRole('button',{name:'重新查看说明与例子'}));expect(screen.getByRole('region',{name:'操作说明与例子'})).toBeTruthy();expect(screen.getByText(/例3：选左边的动作/)).toBeTruthy()
  fail=true;fireEvent.click(screen.getByRole('button',{name:'开始下一轮练习'}));await frame(now);await demo();expect(screen.getByText('呈现已停止')).toBeTruthy();const firstFailed=writes[writes.length-1];fail=false
  await act(async()=>{fireEvent.click(screen.getByRole('button',{name:'重试保存'}));await flush()});expect(writes[writes.length-1]).toEqual(firstFailed);expect(screen.getByText('本次练习已结束')).toBeTruthy();expect(f.ports.prepareLocalAttempt).toHaveBeenCalledTimes(1);expect(f.ports.finalize).not.toHaveBeenCalled()
 })
})
