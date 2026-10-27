import React from 'react'
import {describe,it,expect,vi,afterEach} from 'vitest'
import {render,screen,fireEvent,act,cleanup} from '@testing-library/react'
vi.mock('./font-loader',()=>({loadSearchFont:vi.fn(async()=>({release:vi.fn()}))}))
import {createSearchSnapshot} from '../../../../../../backend/src/modules/cognitive/content-candidates/visual-search/package'
import {scoreSearch,searchEnvelope} from '../../../../../../backend/src/modules/cognitive/content-candidates/visual-search/scorer'
import {projectSearchReport} from '../../../../../../backend/src/modules/cognitive/content-candidates/visual-search/report'
import {SEARCH_IDENTITY,SEARCH_PROTOCOL,searchPlan,type SearchInput} from './generated/protocol'
import {reviewSearch} from './generated/analysis'
import {digest,type SearchContext,type SearchPorts,type SearchDraft,type SearchReceipt} from './contracts'
import {SearchCapture} from './capture'
import {SearchSession} from './session'
import {VisualSearchTask} from './VisualSearchTask'
import {SearchReport} from './SearchReport'
const flush=async()=>{for(let i=0;i<30;i++)await Promise.resolve()}
function fixture(){const snapshot=createSearchSnapshot('experience'),randomSeed='search-synthetic-content',context:SearchContext={contextKey:'new-search-synthetic',randomSeed,snapshot:{schemaVersion:1,...SEARCH_IDENTITY,protocol:SEARCH_PROTOCOL,config:snapshot.config,configHash:snapshot.configHash,protocolSignature:snapshot.protocolSignature,frozenAt:snapshot.frozenAt},manifestHash:digest(searchPlan(snapshot.config,randomSeed))},stored=new Map<string,SearchDraft>();let clock=100
 const ports:SearchPorts={prepareLocalAttempt:vi.fn(async(c,manifest,realm)=>({fresh:true as const,contextKey:c.contextKey,bindingDigest:digest({context:c,manifest,realm})})),persistLocalDraft:vi.fn(async record=>{stored.set(record.recordKey,structuredClone(record));return {retained:true as const,contextKey:record.contextKey,recordKey:record.recordKey,recordDigest:record.recordDigest}}),finalize:vi.fn(async claim=>({finalSaved:true as const,contextKey:context.contextKey,finalPayloadDigest:claim.finalPayloadDigest,receiptId:'synthetic-search-report',report:projectSearchReport(scoreSearch({session:snapshot,config:snapshot.config,randomSeed,trials:[...stored.values()].filter(r=>r.phase==='test').map(r=>searchEnvelope(r.raw))}))}))}
 return {context,snapshot,ports,stored,get clock(){return clock},set clock(v:number){clock=v},session:()=>new SearchSession(context,ports,()=>{},()=>clock)}}
function input(cap:SearchCapture,atMs:number,kind:'down'|'up',control:string,token='pointer:1',input:SearchInput='touch',repeat=false,primary=true){cap.input({kind,atMs,control,token,input,key:input==='keyboard'?'Space':null,repeat,primary})}
async function runTrial(f:ReturnType<typeof fixture>,s:SearchSession,correct=true){const cap=s.capture!,p=cap.raw.plan;f.clock=cap.raw.startedAtPerfMs+800;s.tick(f.clock)
 const cycle=(control:string)=>{for(const kind of ['down','up'] as const){f.clock+=100;s.input({kind,atMs:f.clock,control,token:'pointer:1',input:'touch',key:null,repeat:false,primary:true})}}
 cycle('done');cycle(correct&&p.targetCount>0?p.items.find(i=>i.target)!.id:'none');await flush()}
afterEach(()=>{cleanup();vi.restoreAllMocks();vi.unstubAllGlobals()})
describe('search minimal candidate flows',()=>{
 it('requires a fresh cycle in each stage, ignores holds/multiple contacts, aggregates repeat keys and has no search/location deadline',()=>{
  const f=fixture(),p=searchPlan(f.snapshot.config,'capture').find(p=>p.targetCount===1)!,cap=new SearchCapture(f.snapshot.config,p,100)
  input(cap,101,'down','done','key:Space','keyboard');cap.tick(900);input(cap,901,'up','done','key:Space','keyboard');expect(cap.raw.state.stage).toBe('search');expect(cap.raw.state.locateAtMs).toBeNull()
  input(cap,1000,'down','done','key:Space','keyboard');input(cap,1100,'up','done','key:Space','keyboard');expect(cap.raw.state.stage).toBe('locate');expect(cap.raw.state.selection).toBeNull()
  const count=cap.raw.events.length;for(let i=0;i<300;i++)input(cap,1101+i,'down','none','key:Space','keyboard',true);expect(cap.raw.events).toHaveLength(count);expect(cap.raw.ignoredRepeatCount).toBe(300)
  input(cap,1500,'down',p.items[0].id);input(cap,1501,'down','none','pointer:2','touch',false,false);input(cap,1502,'up','none','pointer:2');input(cap,1503,'up','outside');expect(cap.raw.state.selection).toBeNull();expect(cap.raw.state.ignored).toMatchObject({crossStage:1,multiple:1,outside:1})
  cap.tick(200000);const target=p.items.find(i=>i.target)!;input(cap,200001,'down',target.id);input(cap,200002,'up',target.id);expect(reviewSearch(cap.raw,p,f.snapshot.config)).toMatchObject({valid:true,correct:true,searchMs:200,locateMs:198902})
 })
 it('completes retried three-item practice and all 36 conditions, preserves round identity and requires a genuine saved report before display',async()=>{
  const f=fixture(),base=f.ports.finalize;let first=true;f.ports.finalize=vi.fn(async claim=>{const receipt=await base(claim);if(first){first=false;return {...receipt,finalSaved:false} as unknown as SearchReceipt}return receipt});const s=f.session();await s.prepare();s.begin(f.clock)
  for(let i=0;i<3;i++){await runTrial(f,s,false);if(i<2){f.clock++;s.nextPractice(f.clock)}}expect(s.practicePassed).toBe(false);s.reviewInstructions();f.clock++;s.begin(f.clock)
  for(let i=0;i<3;i++){await runTrial(f,s);if(i<2){f.clock++;s.nextPractice(f.clock)}}expect(s.practicePassed).toBe(true);s.acceptPractice();f.clock++;s.begin(f.clock)
  for(let i=0;i<36;i++)await runTrial(f,s);expect(s.view).toBe('retry');expect(s.receipt).toBeNull();await s.retry();expect(s.view).toBe('report');expect(s.retained).toHaveLength(42);expect(s.retained.filter(r=>r.phase==='test').every(r=>r.round===0&&r.recordKey===`test:0:${r.index}`)).toBe(true)
  const calls=vi.mocked(f.ports.finalize).mock.calls;expect(calls[1][0]).toEqual(calls[0][0]);expect(calls[0][0]).toMatchObject({formalCount:36,practiceCount:6,termination:'completed',terminationReason:null});expect(s.receipt!.report).toMatchObject({state:'interpretable',valid:36,correct:36})
  const v=render(<SearchReport report={s.receipt!.report}/>);expect(screen.getByText(/本次36个有效轮次中，你有36轮/)).toBeTruthy();v.rerender(<SearchReport report={projectSearchReport(scoreSearch({session:f.snapshot,config:f.snapshot.config,randomSeed:f.context.randomSeed,trials:[]}))}/>);expect(screen.queryByText('正确轮搜索中位')).toBeNull();expect(screen.getByText('本次暂时无法形成表现结论')).toBeTruthy()
 })
 it('runs actual React two-stage touch choices, clearly repeats both illustrated examples after practice failure and retries the exact retained draft',async()=>{
  const f=fixture();let now=100,next=0,fail=false;const frames=new Map<number,FrameRequestCallback>(),writes:SearchDraft[]=[],save=f.ports.persistLocalDraft;f.ports.persistLocalDraft=vi.fn(async record=>{writes.push(structuredClone(record));if(fail)throw Error('local unavailable');return save(record)})
  vi.stubGlobal('innerWidth',390);vi.spyOn(performance,'now').mockImplementation(()=>now);vi.stubGlobal('requestAnimationFrame',(cb:FrameRequestCallback)=>{frames.set(++next,cb);return next});vi.stubGlobal('cancelAnimationFrame',(id:number)=>frames.delete(id))
  const frame=async(at:number)=>{now=at;f.clock=at;const callbacks=[...frames.values()];frames.clear();await act(async()=>{for(const cb of callbacks)cb(at);await flush()})}
  const cycle=(name:string)=>{const button=screen.getByRole('button',{name});for(const kind of ['pointerdown','pointerup']){now++;const e=new MouseEvent(kind,{bubbles:true,button:0});Object.defineProperties(e,{pointerType:{value:'touch'},isPrimary:{value:true},pointerId:{value:1}});fireEvent(button,e)}}
  const trial=async()=>{const start=now;expect(screen.queryByRole('button',{name:'搜索完成 · 空格'})).toBeNull();await frame(start+800);cycle('搜索完成 · 空格');expect(screen.queryByRole('button',{name:'搜索完成 · 空格'})).toBeNull();expect(screen.getAllByRole('button',{name:/^位置\d+$/})).toHaveLength(8);await act(async()=>{cycle('没有目标');await flush()})}
  render(<VisualSearchTask context={f.context} ports={f.ports}/>);expect(screen.getByText('例1：有目标')).toBeTruthy();expect(screen.getByText('例2：没有目标')).toBeTruthy();expect(screen.getByText('先做3轮较易练习')).toBeTruthy();fireEvent.click(screen.getByRole('button',{name:'准备练习'}));await screen.findByRole('button',{name:'开始'});fireEvent.click(screen.getByRole('button',{name:'开始'}));await frame(now)
  for(let i=0;i<3;i++){await trial();if(i<2)fireEvent.click(screen.getByRole('button',{name:'下一轮练习'}))}expect(screen.queryByRole('button',{name:'准备正式搜索'})).toBeNull();expect(writes[0].raw.state).toMatchObject({searchInput:'touch',locateInput:'touch',selection:{kind:'none'}});fireEvent.click(screen.getByRole('button',{name:'重新查看说明与例子'}));expect(screen.getByRole('region',{name:'操作说明与例子'})).toBeTruthy();expect(screen.getByText('例1：有目标')).toBeTruthy();expect(screen.getByText('例2：没有目标')).toBeTruthy()
  fail=true;fireEvent.click(screen.getByRole('button',{name:'开始下一组练习'}));await frame(now);await trial();expect(screen.getByText('呈现已停止')).toBeTruthy();const failed=writes[writes.length-1];fail=false;await act(async()=>{fireEvent.click(screen.getByRole('button',{name:'重试保存'}));await flush()});expect(writes[writes.length-1]).toEqual(failed);expect(screen.getByText('本次练习已结束')).toBeTruthy();expect(f.ports.prepareLocalAttempt).toHaveBeenCalledTimes(1);expect(f.ports.finalize).not.toHaveBeenCalled()
 })
})
