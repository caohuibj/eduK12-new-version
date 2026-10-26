import React from 'react'
import { beforeEach,afterEach,describe,it,expect,vi } from 'vitest'
import { render,screen,fireEvent,act } from '@testing-library/react'
import { AntTask,type AntTaskProps } from './AntTask'
import { AntReportCard,type AntBoundReport } from './AntReportCard'
import { antRecordDigest } from './seal'
import { antFixtureConfig,antFixtureDisplay,ANT_FIXTURE_HASH,ANT_FIXTURE_SIGNATURE } from './test-fixtures'
const props=():AntTaskProps=>({contextId:'A',config:antFixtureConfig(),randomSeed:'ui-test',configHash:ANT_FIXTURE_HASH,
 protocolSignature:ANT_FIXTURE_SIGNATURE,display:{frozen:antFixtureDisplay(),readViewport:()=>antFixtureDisplay().viewport},allowSyntheticFixture:true,
 claimAttemptExposure:async identity=>({...identity,durable:true,fresh:true,claimId:'review-claim'}),
 persistLocalDraft:async r=>({durable:true,contextId:r.contextId,key:r.key,recordDigest:antRecordDigest(r)}),onTaskComplete:async()=>null})
const projection=(state:'interpretable'|'limited'|'invalid'='interpretable'):AntBoundReport=>({
 contextId:'A',configHash:ANT_FIXTURE_HASH,protocolSignature:ANT_FIXTURE_SIGNATURE,
 qualityFlags:{noInterpretableCondition:state==='invalid',incompleteAccuracy:state!=='interpretable',mixedInput:false,
 incompleteCue_none:false,incompleteCue_double:state!=='interpretable',unavailable_alerting:state!=='interpretable'},
 projection:{state,accuracy:1,cueRows:[
 {cue:'none',correct:12,total:12,accuracy:1,correctMeanRtMs:450,correctRtCount:12,input:'touch'},
 {cue:'double',correct:12,total:12,accuracy:1,correctMeanRtMs:550,correctRtCount:12,input:'touch'}],
 differences:[{key:'alerting',valueMs:-100,input:'touch',firstCorrectCount:12,secondCorrectCount:12}],
 reasons:[],description:'Synthetic test fixture',practicalTip:'Keep the device still.'},
})
describe('ANT candidate UI and report boundary',()=>{
 let now=0,frames:Map<number,FrameRequestCallback>,id=0
 beforeEach(()=>{now=0;frames=new Map();vi.spyOn(performance,'now').mockImplementation(()=>now)
  vi.stubGlobal('requestAnimationFrame',(cb:FrameRequestCallback)=>{frames.set(++id,cb);return id})
  vi.stubGlobal('cancelAnimationFrame',(key:number)=>frames.delete(key))})
 afterEach(()=>{vi.restoreAllMocks();vi.unstubAllGlobals()})
 const paint=async(time:number)=>{now=time;const ready=[...frames.values()];frames.clear();await act(async()=>ready.forEach(cb=>cb(time)))}
 it('blocks first exposure without frozen physical geometry or a durable attempt marker',async()=>{
  const p=props();p.display=null
  const {rerender}=render(<AntTask {...p}/>);fireEvent.click(screen.getByRole('button',{name:'开始练习'}))
  expect(screen.getByRole('alert')).toHaveTextContent('请先完成屏幕与观看距离校准');expect(screen.queryByLabelText('固定回应区')).toBeNull()
  const missing=props();missing.claimAttemptExposure=undefined as never
  rerender(<AntTask {...missing}/>);fireEvent.click(screen.getByRole('button',{name:'开始练习'}))
  expect(screen.getByRole('alert')).toHaveTextContent('暂时无法开始作答')
 })
 it('requires explicit fixture mode for synthetic calibration and a fresh marker',async()=>{
  const p=props();p.allowSyntheticFixture=false
  const {rerender}=render(<AntTask {...p}/>);fireEvent.click(screen.getByRole('button',{name:'开始练习'}))
  expect(screen.getByRole('alert')).toHaveTextContent('请先完成屏幕与观看距离校准')
  const stale=props();stale.claimAttemptExposure=async()=>({contextId:'A',durable:true,fresh:false,claimId:'stale'} as never)
  rerender(<AntTask {...stale}/>);await act(async()=>fireEvent.click(screen.getByRole('button',{name:'开始练习'})))
  expect(screen.getByRole('alert')).toHaveTextContent('启动状态尚未确认')
 })
 it('shows fixed left/right areas, records keyboard repeats and stops on viewport changes',async()=>{
  const p=props(),saved:Parameters<AntTaskProps['persistLocalDraft']>[0][]=[]
  p.persistLocalDraft=async record=>{saved.push(record);return {durable:true,contextId:record.contextId,key:record.key,recordDigest:antRecordDigest(record)}}
  render(<AntTask {...p}/>);await act(async()=>fireEvent.click(screen.getByRole('button',{name:'开始练习'})))
  await paint(0)
  const left=screen.getByRole('button',{name:'向左回应'}),right=screen.getByRole('button',{name:'向右回应'})
  expect(left).toHaveStyle({width:'130px',height:'78px'});expect(right).toHaveStyle({width:'130px',height:'78px'})
  p.display!.frozen.inputMap.leftKey='x' // A host mutation must not change this exposure's frozen mapping.
  fireEvent.keyDown(window,{key:'ArrowLeft',repeat:false});fireEvent.keyDown(window,{key:'ArrowLeft',repeat:true})
  p.display!.readViewport=()=>({...antFixtureDisplay().viewport,width:800})
  await act(async()=>fireEvent(window,new Event('resize')))
  expect(screen.getByRole('heading',{name:'本次作答已停止'})).toBeInTheDocument()
  expect(saved[0].core.events).toHaveLength(2);expect(saved[0].core.events[0].direction).toBe('left');expect(saved[0].core.events[1]).toMatchObject({input:'keyboard',repeat:true,held:true})
  expect(saved[0].core.interruptions[0].kind).toBe('viewport_changed')
  expect(screen.getByRole('status')).toHaveTextContent('尚未确认提交成功')
 })
 it('isolates a late first-exposure claim from the next context',async()=>{
  let resolve!:(value:Awaited<ReturnType<AntTaskProps['claimAttemptExposure']>>)=>void
  const old=props();old.claimAttemptExposure=()=>new Promise(yes=>{resolve=yes})
  const {rerender}=render(<AntTask {...old}/>);fireEvent.click(screen.getByRole('button',{name:'开始练习'}))
  rerender(<AntTask {...props()} contextId="B"/>)
  await act(async()=>resolve({contextId:'A',durable:true,fresh:true,claimId:'late'}))
  expect(screen.getByRole('heading',{name:'看中间箭头，判断它的方向'})).toBeInTheDocument()
  expect(screen.queryByLabelText('固定回应区')).toBeNull()
 })
 it('keeps implementation terms and raw reason codes out of participant copy',()=>{
  const p=props();p.display=null
  const {container}=render(<AntTask {...p}/>)
  fireEvent.click(screen.getByRole('button',{name:'开始练习'}))
  const copy=container.cloneNode(true) as HTMLElement
  copy.querySelectorAll('details').forEach(element=>element.remove())
  expect(copy.textContent).not.toMatch(/宿主|冻结|CSS|COS|missing_frozen_geometry/)
  const diagnostics=screen.getByText('missing_frozen_geometry').closest('details')!
  expect(diagnostics.open).toBe(false)
 })
 it('shows only projected condition values, preserves negative differences and needs no decorative picture',()=>{
  render(<AntReportCard data={projection()} contextId="A" configHash={ANT_FIXTURE_HASH} protocolSignature={ANT_FIXTURE_SIGNATURE}/>)
  expect(screen.getByRole('rowheader',{name:'无提示'})).toBeInTheDocument()
  expect(screen.getByText(/−双位置提示/)).toHaveTextContent('-100 ms')
  expect(screen.queryAllByRole('img')).toHaveLength(0);expect(screen.getByText('100.0%')).toBeInTheDocument()
 })
 it('limited and invalid reports hide gated values even if provided in the projection',()=>{
  const {rerender}=render(<AntReportCard data={projection('limited')} contextId="A" configHash={ANT_FIXTURE_HASH} protocolSignature={ANT_FIXTURE_SIGNATURE}/>)
  expect(screen.queryByRole('rowheader',{name:'双位置提示'})).toBeNull();expect(screen.queryByText('100.0%')).toBeNull()
  expect(screen.queryByText(/-100 ms/)).toBeNull()
  rerender(<AntReportCard data={projection('invalid')} contextId="A" configHash={ANT_FIXTURE_HASH} protocolSignature={ANT_FIXTURE_SIGNATURE}/>)
  expect(screen.queryByRole('table')).toBeNull();expect(screen.queryByText(/450 ms/)).toBeNull()
 })
 it('context mismatch and missing flags fail closed; mixed input hides projected RT',()=>{
  const p=projection(),{rerender}=render(<AntReportCard data={p} contextId="B" configHash={ANT_FIXTURE_HASH} protocolSignature={ANT_FIXTURE_SIGNATURE}/>)
  expect(screen.queryByRole('table')).toBeNull()
  p.qualityFlags={};rerender(<AntReportCard data={p} contextId="A" configHash={ANT_FIXTURE_HASH} protocolSignature={ANT_FIXTURE_SIGNATURE}/>)
  expect(screen.queryByRole('table')).toBeNull()
  const mixed=projection();mixed.qualityFlags.mixedInput=true
  rerender(<AntReportCard data={mixed} contextId="A" configHash={ANT_FIXTURE_HASH} protocolSignature={ANT_FIXTURE_SIGNATURE} language="en"/>)
  expect(screen.queryByText(/450 ms/)).toBeNull();expect(screen.getByRole('heading',{name:'Your cue and arrow record'})).toBeInTheDocument()
 })
})
