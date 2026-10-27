import React from 'react'
import {describe,it,expect,vi,afterEach} from 'vitest'
import {render,screen,fireEvent,act,cleanup} from '@testing-library/react'
vi.mock('./asset-loader',()=>({loadGradAssets:vi.fn(async()=>({urls:Object.fromEntries(['scrambled.png',...Array.from({length:10},(_,i)=>`city${i+1}.png`),...Array.from({length:10},(_,i)=>`mountain${i+1}.png`)].map(name=>[name,'/synthetic/'+name])),release:vi.fn()}))}))
import {createGradSnapshot} from '../../../../../../backend/src/modules/cognitive/content-candidates/gradcpt/package'
import {scoreGrad,gradEnvelope} from '../../../../../../backend/src/modules/cognitive/content-candidates/gradcpt/scorer'
import {projectGradReport} from '../../../../../../backend/src/modules/cognitive/content-candidates/gradcpt/report'
import {gradPlan,slots,GRAD_PROTOCOL,GRAD_IDENTITY} from './generated/protocol'
import {resolveGrad} from './generated/assignment'
import {reviewGrad} from './generated/analysis'
import {digest,type GradContext,type GradPorts,type GradDraft,type GradReceipt} from './contracts'
import {GradCapture} from './capture'
import {GradSession} from './session'
import {GradCptTask} from './GradCptTask'
import {GradReport} from './GradReport'
const flush=async()=>{for(let i=0;i<30;i++)await Promise.resolve()}
function fixture(){const snapshot=createGradSnapshot('experience'),randomSeed='grad-synthetic-content',context:GradContext={contextKey:'new-grad-synthetic',randomSeed,snapshot:{schemaVersion:1,...GRAD_IDENTITY,protocol:GRAD_PROTOCOL,config:snapshot.config,configHash:snapshot.configHash,protocolSignature:snapshot.protocolSignature,frozenAt:snapshot.frozenAt},manifestHash:digest(gradPlan(snapshot.config,randomSeed))},stored=new Map<string,GradDraft>();let clock=100
 const ports:GradPorts={prepareLocalAttempt:vi.fn(async(c,manifest,realm)=>({fresh:true as const,contextKey:c.contextKey,bindingDigest:digest({context:c,manifest,realm})})),persistLocalDraft:vi.fn(async record=>{stored.set(record.recordKey,structuredClone(record));return {retained:true as const,contextKey:record.contextKey,recordKey:record.recordKey,recordDigest:record.recordDigest}}),finalize:vi.fn(async claim=>({finalSaved:true as const,contextKey:context.contextKey,finalPayloadDigest:claim.finalPayloadDigest,receiptId:'synthetic-grad-report',report:projectGradReport(scoreGrad({session:snapshot,config:snapshot.config,randomSeed,trials:[...stored.values()].filter(r=>r.phase==='test').map(r=>gradEnvelope(r.raw))}))}))}
 return {context,snapshot,ports,stored,get clock(){return clock},set clock(v:number){clock=v},session:()=>new GradSession(context,ports,()=>{},()=>clock)}}
async function runCapture(f:ReturnType<typeof fixture>,s:GradSession,answer=true){const cap=s.capture!,plan=cap.raw.plan;for(const p of plan){const start=cap.raw.slots[p.index].startMs;if(answer&&p.kind==='city'){f.clock=start+p.durationMs*.9;s.tick(f.clock);cap.event(++f.clock,'down','pointer:1','touch');cap.event(++f.clock,'up','pointer:1','touch')}f.clock=start+p.durationMs;s.tick(f.clock)}await flush()}
afterEach(()=>{cleanup();vi.restoreAllMocks();vi.unstubAllGlobals()})
describe('gradCPT minimal candidate flows',()=>{
 it('logs actual paints, counts fresh inputs once, rejects hold/repeat/multiple contacts and never catches up unshown pictures',()=>{
  const f=fixture(),plan=slots(['city1.png']),cap=new GradCapture(f.snapshot.config,plan,100);cap.tick(900);cap.tick(1620)
  cap.event(1621,'down','key:Space','keyboard');cap.event(1622,'down','key:Space','keyboard',true);cap.event(1623,'down','other','touch',false,false);cap.event(1624,'down','pointer:2','touch');cap.event(1625,'up','key:Space','keyboard');cap.tick(1700);cap.tick(2500)
  const review=reviewGrad(cap.raw,plan);expect(review.rows[0]).toMatchObject({settled:true,correct:true});expect(resolveGrad(cap.raw,plan).ignored).toMatchObject({repeat:1,multiple:1,held:1});expect(review.assigned[1].rtMs).toBe(721)
  const delayed=new GradCapture(f.snapshot.config,plan,100);delayed.tick(10000);expect(delayed.index).toBe(1);expect(delayed.raw.slots).toHaveLength(2);expect(delayed.raw.slots[1].startMs).toBe(10000);delayed.interrupt('blur',10001);expect(reviewGrad(delayed.raw,plan).rows[0].settled).toBe(false)
 })
 it('completes 8 practice and 100 formal images, requires a genuine saved report and retries the identical final claim',async()=>{
  const f=fixture(),final=f.ports.finalize;let first=true;f.ports.finalize=vi.fn(async claim=>{const receipt=await final(claim);if(first){first=false;return {...receipt,finalSaved:false} as unknown as GradReceipt}return receipt});const s=f.session();await s.prepare();s.begin(f.clock)
  for(let i=0;i<8;i++){await runCapture(f,s);if(i<7){f.clock++;s.nextPractice(f.clock)}}expect(s.practicePassed).toBe(true);s.acceptPractice();f.clock++;s.begin(f.clock);await runCapture(f,s);expect(s.view).toBe('retry');expect(s.receipt).toBeNull();await s.retry();expect(s.view).toBe('report');expect(s.retained).toHaveLength(9)
  const calls=vi.mocked(f.ports.finalize).mock.calls;expect(calls[1][0]).toEqual(calls[0][0]);expect(calls[0][0]).toMatchObject({formalCaptureCount:1,presented:100,practiceCount:8,termination:'completed',terminationReason:null});expect(s.receipt!.report.statistics).toMatchObject({city:90,mountain:10,omissions:0,falseAlarms:0,rtCount:90})
  const v=render(<GradReport report={s.receipt!.report}/>);expect(screen.getByText(/本次90张城市中有0张漏按/)).toBeTruthy();v.rerender(<GradReport report={projectGradReport(scoreGrad({session:f.snapshot,config:f.snapshot.config,randomSeed:f.context.randomSeed,trials:[]}))}/>);expect(screen.queryByText('城市漏按 / 有效城市')).toBeNull();expect(screen.getByText('本次暂时无法形成表现结论')).toBeTruthy()
 })
 it('runs actual React touch practice, re-presents the full guide after failure, and preserves a failed write without re-exposure',async()=>{
  const f=fixture();let now=100,next=0,fail=false,touched=false;const frames=new Map<number,FrameRequestCallback>(),writes:GradDraft[]=[],save=f.ports.persistLocalDraft;f.ports.persistLocalDraft=vi.fn(async record=>{writes.push(structuredClone(record));if(fail)throw Error('local unavailable');return save(record)})
  vi.stubGlobal('innerWidth',390);vi.spyOn(performance,'now').mockImplementation(()=>now);vi.stubGlobal('requestAnimationFrame',(cb:FrameRequestCallback)=>{frames.set(++next,cb);return next});vi.stubGlobal('cancelAnimationFrame',(id:number)=>frames.delete(id))
  const frame=async(at:number)=>{now=at;f.clock=at;const callbacks=[...frames.values()];frames.clear();await act(async()=>{for(const cb of callbacks)cb(at);await flush()})}
  const picture=async(duration:number,allowTouch:boolean)=>{const start=now;await frame(start+duration);const url=document.querySelector('.grad-image img:last-child')?.getAttribute('src')??'';if(allowTouch&&!touched&&url.includes('city')){await frame(start+duration*1.9);const button=screen.getByRole('button',{name:'看到城市按一下'});for(const kind of ['pointerdown','pointerup']){now++;const e=new MouseEvent(kind,{bubbles:true,button:0});Object.defineProperties(e,{pointerType:{value:'touch'},isPrimary:{value:true},pointerId:{value:1}});fireEvent(button,e)}touched=true}await frame(start+duration*2);await frame(start+duration*3)}
  render(<GradCptTask context={f.context} ports={f.ports}/>);expect(screen.getByText(/先做8张较易练习/)).toBeTruthy();fireEvent.click(screen.getByRole('button',{name:'准备练习'}));await screen.findByRole('button',{name:'开始'});fireEvent.click(screen.getByRole('button',{name:'开始'}));await frame(now)
  for(let i=0;i<8;i++){await picture(i<4?1600:800,true);if(i<7)fireEvent.click(screen.getByRole('button',{name:'下一张练习'}))}
  expect(touched).toBe(true);expect(screen.queryByRole('button',{name:'准备正式序列'})).toBeNull();fireEvent.click(screen.getByRole('button',{name:'重新查看说明与例子'}));expect(screen.getByRole('region',{name:'操作说明与例子'})).toBeTruthy();expect(screen.getByText(/城市渐渐清楚时/)).toBeTruthy();fail=true;fireEvent.click(screen.getByRole('button',{name:'开始下一轮练习'}));await frame(now);await picture(1600,false);expect(screen.getByText('呈现已停止')).toBeTruthy();const failed=writes[writes.length-1];fail=false;await act(async()=>{fireEvent.click(screen.getByRole('button',{name:'重试保存'}));await flush()});expect(writes[writes.length-1]).toEqual(failed);expect(screen.getByText('本次练习已结束')).toBeTruthy();expect(f.ports.prepareLocalAttempt).toHaveBeenCalledTimes(1);expect(f.ports.finalize).not.toHaveBeenCalled()
 })
})
