import React from 'react'
import {describe,it,expect,vi,afterEach} from 'vitest'
import {render,screen,fireEvent,act,cleanup} from '@testing-library/react'
import {createNumberSeriesSnapshot} from '../../../../../../backend/src/modules/cognitive/content-candidates/number-series/package'
import {scoreNumberSeries,numberSeriesEnvelope} from '../../../../../../backend/src/modules/cognitive/content-candidates/number-series/scorer'
import {projectNumberSeriesReport} from '../../../../../../backend/src/modules/cognitive/content-candidates/number-series/report'
import {numberSeriesPlan,reviewNumberSeriesRaw,type NumberSeriesPlan} from './generated/protocol'
import {numberSeriesReportText,numberSeriesTakeHomeSvg} from './generated/report'
import {digest,numberSeriesManifest,type NumberSeriesContext,type NumberSeriesPorts,type NumberSeriesDraft,type NumberSeriesReceipt} from './contracts'
import {NumberSeriesCapture} from './capture'
import {NumberSeriesSession} from './session'
import {NumberSeriesTask} from './NumberSeriesTask'
import {NumberSeriesInstructions} from './NumberSeriesInstructions'
import {NumberSeriesReport} from './NumberSeriesReport'
const flush=async()=>{for(let i=0;i<20;i++)await Promise.resolve()}
function fixture() {
  const snapshot=createNumberSeriesSnapshot('experience','2026-10-27T00:00:00.000Z'),randomSeed='synthetic-number-series'
  const context:NumberSeriesContext={contextKey:'synthetic-session:epoch-1',snapshot,randomSeed,manifestHash:digest(numberSeriesPlan(snapshot.config,randomSeed))}
  const stored=new Map<string,NumberSeriesDraft>()
  const ports:NumberSeriesPorts={
    prepareLocalAttempt:vi.fn(async(c,manifest,realm)=>({fresh:true as const,contextKey:c.contextKey,bindingDigest:digest({context:c,manifest,realm})})),
    persistLocalDraft:vi.fn(async record=>{const old=stored.get(record.recordKey);if(old&&old.recordDigest!==record.recordDigest)throw Error('Conflicting synthetic draft');stored.set(record.recordKey,structuredClone(record));return {retained:true as const,contextKey:record.contextKey,recordKey:record.recordKey,recordDigest:record.recordDigest}}),
    finalize:vi.fn(async claim=>({finalSaved:true as const,contextKey:context.contextKey,finalPayloadDigest:claim.finalPayloadDigest,receiptId:'synthetic-report-only',report:projectNumberSeriesReport(scoreNumberSeries({session:snapshot,config:snapshot.config,randomSeed,trials:[...stored.values()].filter(r=>r.phase==='test').map(r=>numberSeriesEnvelope(r.raw))}))})),
  }
  return {context,snapshot,ports,stored}
}
afterEach(()=>{cleanup();vi.restoreAllMocks();vi.unstubAllGlobals()})
describe('number-series candidate teaching, records and public feedback',()=>{
  it('locks the first input, retains real zero time and explicit skip null, and ignores held-key repeats',()=>{
    const f=fixture(),p=numberSeriesPlan(f.snapshot.config,f.context.randomSeed)[0],cap=new NumberSeriesCapture(p,100)
    cap.answer(p.correctIndex,'keyboard','Digit'+(p.correctIndex+1),100,true);expect(cap.done).toBe(false)
    cap.answer(p.correctIndex,'keyboard','Digit'+(p.correctIndex+1),100);cap.answer((p.correctIndex+1)%4,'touch',null,200)
    expect(cap.raw).toMatchObject({status:'answered',response:p.correctIndex,rtMs:0,ignoredRepeatCount:1})
    expect(reviewNumberSeriesRaw(cap.raw,p).correct).toBe(true)
    const skip=new NumberSeriesCapture(p,100);skip.skip('touch',101);expect(skip.raw).toMatchObject({response:null,rtMs:null,status:'skipped'})
    const interrupted=new NumberSeriesCapture(p,100);interrupted.interrupt('visibility-lost',101);expect(reviewNumberSeriesRaw(interrupted.raw,p).opportunity).toBe(false)
  })
  it('requires confirmed retention before exposure and full instructions before each of at most three practice rounds',async()=>{
    const f=fixture(),s=new NumberSeriesSession(f.context,f.ports,()=>{})
    s.begin();expect(s.view).toBe('intro');await s.prepare();s.begin();s.expose(100)
    for(let round=0;round<3;round++){
      for(let i=0;i<3;i++){s.skip('touch',101+round*100+i*10);await flush();if(i<2){s.reviewInstructions();expect(s.view).toBe('practice-feedback');s.nextPractice();s.expose(110+round*100+i*10)}}
      expect(s.practicePassed).toBe(false);s.begin();expect(s.view).toBe('practice-feedback')
      s.reviewInstructions()
      if(round<2){expect(s.view).toBe('practice-instructions');s.begin();s.expose(200+round*100)}
    }
    expect(s.canRetryPractice).toBe(false);expect(s.retained.map(r=>r.recordKey)).toEqual([0,1,2].flatMap(round=>[0,1,2].map(i=>`practice:${round}:${i}`)));expect(f.ports.finalize).not.toHaveBeenCalled()
    const failed=fixture();failed.ports.prepareLocalAttempt=vi.fn(async()=>{throw Error('not retained')});const blocked=new NumberSeriesSession(failed.context,failed.ports,()=>{});await blocked.prepare();blocked.begin();expect(blocked.view).toBe('blocked');expect(blocked.capture).toBeNull()
  })
  it('runs actual React teaching/review, touch and keyboard choices, 12 formal items, same-draft and same-final retries',async()=>{
    const f=fixture(),manifest=numberSeriesManifest(f.context),save=f.ports.persistLocalDraft,finalize=f.ports.finalize
    let now=100,failSave=true,failFinal=true;vi.spyOn(performance,'now').mockImplementation(()=>now)
    f.ports.persistLocalDraft=vi.fn(async r=>{const ack=await save(r);if(r.phase==='test'&&failSave){failSave=false;throw Error('synthetic lost draft ACK')}return ack})
    f.ports.finalize=vi.fn(async c=>{const ack=await finalize(c);if(failFinal){failFinal=false;return {...ack,finalSaved:false} as unknown as NumberSeriesReceipt}return ack})
    render(<NumberSeriesTask context={f.context} ports={f.ports}/>);expect(screen.getByRole('region',{name:'完整说明与三个例子'})).toBeTruthy();expect(screen.getByText('例子三：增加量一步步变大')).toBeTruthy()
    fireEvent.click(screen.getByRole('button',{name:'准备练习'}));await screen.findByRole('button',{name:'开始练习'});fireEvent.click(screen.getByRole('button',{name:'开始练习'}))
    now+=100;fireEvent.click(screen.getByRole('button',{name:`选项 ${(manifest.practice[0][0].correctIndex+1)%4+1}：${manifest.practice[0][0].options[(manifest.practice[0][0].correctIndex+1)%4]}`}));await act(flush)
    for(let i=1;i<3;i++){fireEvent.click(screen.getByRole('button',{name:'下一题练习'}));now+=100;const p=manifest.practice[0][i];fireEvent.click(screen.getByRole('button',{name:`选项 ${p.correctIndex+1}：${p.answer}`}));await act(flush)}
    expect(screen.getByRole('button',{name:'重看完整说明与三个例子'})).toBeTruthy();fireEvent.click(screen.getByRole('button',{name:'重看完整说明与三个例子'}))
    expect(screen.getByText('例子一：每次加同样多')).toBeTruthy();expect(screen.getByText('例子二：每次乘同样的数')).toBeTruthy();fireEvent.click(screen.getByRole('button',{name:'开始下一轮练习'}))
    const answer=async(plan:NumberSeriesPlan,mode:'touch'|'keyboard'='touch')=>{
      now+=100
      if(mode==='keyboard')fireEvent.keyDown(window,{key:String(plan.correctIndex+1),code:'Digit'+(plan.correctIndex+1),repeat:false})
      else{const event=new MouseEvent('pointerdown',{bubbles:true,button:0});Object.defineProperties(event,{pointerType:{value:'touch'},pointerId:{value:1},isPrimary:{value:true}});fireEvent(screen.getByRole('button',{name:`选项 ${plan.correctIndex+1}：${plan.answer}`}),event)}
      await act(flush)
    }
    for(let i=0;i<3;i++){await answer(manifest.practice[1][i]);if(i<2)fireEvent.click(screen.getByRole('button',{name:'下一题练习'}))}
    fireEvent.click(screen.getByRole('button',{name:'准备正式题目'}));fireEvent.click(screen.getByRole('button',{name:'开始正式题目'}))
    for(let i=0;i<12;i++){
      await answer(manifest.formal[i],i%2?'keyboard':'touch')
      if(i===0){expect(screen.getByRole('button',{name:'重试保存'})).toBeTruthy();expect(screen.queryByRole('button',{name:'下一题'})).toBeNull();fireEvent.click(screen.getByRole('button',{name:'重试保存'}));await act(flush)}
      if(i<11)fireEvent.click(screen.getByRole('button',{name:'下一题'}))
    }
    expect(screen.getByRole('button',{name:'重试保存'})).toBeTruthy();fireEvent.click(screen.getByRole('button',{name:'重试保存'}));await act(flush)
    expect(screen.getByText('谢谢你认真完成这组题')).toBeTruthy();expect(screen.getByRole('button',{name:'下载一张摘要图'})).toBeTruthy()
    const drafts=vi.mocked(f.ports.persistLocalDraft).mock.calls.map(c=>c[0]),formal=drafts.filter(r=>r.phase==='test')
    expect(formal).toHaveLength(13);expect(formal[0]).toEqual(formal[1]);expect(formal.every(r=>r.round===0&&r.recordKey===`test:0:${r.index}`)).toBe(true)
    const finals=vi.mocked(f.ports.finalize).mock.calls;expect(finals).toHaveLength(2);expect(finals[0][0]).toEqual(finals[1][0]);expect(finals[0][0]).toMatchObject({formalCount:12,practiceCount:6,termination:'completed'})
    expect(f.stored.size).toBe(18);expect([...f.stored.values()].filter(r=>r.phase==='test').some(r=>r.raw.input==='keyboard')).toBe(true)
  })
  it('keeps interrupted/invalid public bodies, pictures and exports free of performance values and refuses changed report bindings',async()=>{
    const f=fixture();let now=0;const s=new NumberSeriesSession(f.context,f.ports,()=>{},()=>now)
    await s.prepare();s.begin()
    for(let i=0;i<3;i++){s.expose(++now);s.answer(s.activePlan!.correctIndex,'touch',null,++now);await flush();if(i<2)s.nextPractice()}
    s.acceptPractice();s.begin();s.expose(++now);s.answer(s.activePlan!.correctIndex,'touch',null,++now);await flush();s.begin();s.expose(++now);s.stop('window-blur',++now);await flush()
    expect(s.view).toBe('report');const report=s.receipt!.report;expect(report.state).toBe('limited');expect(report.summary).toBeNull()
    const v=render(<NumberSeriesReport report={report}/>);expect(screen.queryByRole('table')).toBeNull();expect(screen.queryByRole('button',{name:'下载一张摘要图'})).toBeNull();expect(numberSeriesTakeHomeSvg(report,'zh')).toBeNull();expect(numberSeriesReportText(report,'zh')).not.toContain('答对')
    const invalid=projectNumberSeriesReport(scoreNumberSeries({session:f.snapshot,config:f.snapshot.config,randomSeed:f.context.randomSeed,trials:[]}));v.rerender(<NumberSeriesReport report={invalid} language="en"/>);expect(screen.getByText(/not enough information/)).toBeTruthy();expect(screen.queryByRole('table')).toBeNull()
    v.rerender(<NumberSeriesReport report={{...invalid,reportDefinitionVersion:'unknown'} as never}/>);expect(screen.getByRole('alert')).toBeTruthy();expect(screen.queryByRole('button')).toBeNull()
    cleanup();render(<NumberSeriesInstructions config={f.snapshot.config} language="en"/>);expect(screen.getByText('Example 3: gaps that grow step by step')).toBeTruthy();expect(screen.getByText(/6–9 minutes/)).toBeTruthy()
  })
  it('isolates a changed context from a pending old write and never sends the old record to new ports',async()=>{
    const f=fixture(),base=f.ports.persistLocalDraft;let release:(v:Awaited<ReturnType<NumberSeriesPorts['persistLocalDraft']>>)=>void=()=>{}
    f.ports.persistLocalDraft=vi.fn(async r=>new Promise<Awaited<ReturnType<NumberSeriesPorts['persistLocalDraft']>>>(resolve=>{release=()=>void base(r).then(resolve)}))
    const v=render(<NumberSeriesTask context={f.context} ports={f.ports}/>);fireEvent.click(screen.getByRole('button',{name:'准备练习'}));await screen.findByRole('button',{name:'开始练习'});fireEvent.click(screen.getByRole('button',{name:'开始练习'}));const p=numberSeriesManifest(f.context).practice[0][0]
    fireEvent.click(screen.getByRole('button',{name:`选项 ${p.correctIndex+1}：${p.answer}`}));expect(screen.getByRole('status')).toBeTruthy()
    const other=fixture();other.context.contextKey='other-session';v.rerender(<NumberSeriesTask context={other.context} ports={other.ports}/>);expect(screen.getByRole('alert')).toBeTruthy();await act(async()=>{release({retained:true,contextKey:'unused',recordKey:'unused',recordDigest:'unused'});await flush()})
    expect(other.ports.persistLocalDraft).not.toHaveBeenCalled();expect(other.ports.finalize).not.toHaveBeenCalled();expect(f.stored.get('practice:0:0')?.contextKey).toBe(f.context.contextKey)
  })
})
