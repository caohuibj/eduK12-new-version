import React from 'react'
import {afterEach,describe,it,expect,vi} from 'vitest'
import {cleanup,render,screen,fireEvent,act} from '@testing-library/react'
import {EnumerationTask} from './EnumerationTask'
import {enumerationFixtureContext} from './fixtures.test-support'
import type {EnumerationPersistencePort} from './persistence'

afterEach(()=>{cleanup();vi.restoreAllMocks();vi.unstubAllGlobals()})
describe('enumeration incomplete practice keeps the pause and repeats teaching',()=>{
 it.each(['zh','en'] as const)('ends an unpaintable practice and shows the full instructions before any new attempt (%s)',async language=>{
  const context={...enumerationFixtureContext(),language},en=language==='en'
  const receipt=(value:any)=>({accepted:true as const,contextId:value.record.contextId,exposureId:value.record.exposureId,recordHash:value.recordHash})
  const port:EnumerationPersistencePort={id:'synthetic-incomplete-practice-review',durability:{kind:'host_verified_browser_durable',verificationId:'unit-contract-only'},
   openAttempt:vi.fn(async v=>({...v,state:'bound' as const})),endAttempt:vi.fn(),retainArtifact:vi.fn(async a=>({contextId:a.context.contextId,artifactHash:a.artifactHash,retained:true as const})),
   reserve:vi.fn(async v=>({...v,state:'new' as const})),retain:vi.fn(async v=>receipt(v)),onPracticeComplete:vi.fn(async v=>receipt(v)),onTrialComplete:vi.fn(async(_c,v)=>receipt(v)),complete:vi.fn(async v=>({...v,confirmed:true as const}))}
  vi.stubGlobal('innerWidth',390);vi.stubGlobal('innerHeight',844);vi.stubGlobal('devicePixelRatio',1)
  vi.stubGlobal('requestAnimationFrame',vi.fn(()=>1));vi.stubGlobal('cancelAnimationFrame',vi.fn())
  vi.spyOn(HTMLElement.prototype,'getBoundingClientRect').mockReturnValue({width:390,height:844,top:0,left:0,right:390,bottom:844,x:0,y:0,toJSON(){}})
  vi.spyOn(HTMLCanvasElement.prototype,'getContext').mockReturnValue(null)
  render(<EnumerationTask context={context} persistence={port}/> )
  fireEvent.click(screen.getByRole('button',{name:en?'Review readiness':'查看准备状态'}))
  fireEvent.click(screen.getByRole('button',{name:en?'Start practice':'开始练习'}))
  await screen.findByRole('heading',{name:en?'Practice record':'练习记录'})
  expect(port.endAttempt).toHaveBeenCalledTimes(1)
  expect(screen.getByRole('button',{name:en?'Retry this practice explicitly':'重新做这轮练习'})).toBeDisabled()
  expect(screen.getByRole('heading',{name:en?'How many dots did you see?':'刚才有几个点？'})).toBeTruthy()
  expect(screen.getByText(en?/Example 1: you saw 3 dots/:/例1：刚才看到3个点/)).toBeTruthy()
  expect(port.reserve).toHaveBeenCalledTimes(1)
  expect(port.onTrialComplete).not.toHaveBeenCalled();expect(port.complete).not.toHaveBeenCalled()
 })
 it('keeps a confirmed wrong practice complete and moves on after showing the instructions',async()=>{
  const context=enumerationFixtureContext(),receipt=(v:any)=>({accepted:true as const,contextId:v.record.contextId,exposureId:v.record.exposureId,recordHash:v.recordHash})
  const port:EnumerationPersistencePort={id:'synthetic-wrong-practice-review',durability:{kind:'host_verified_browser_durable',verificationId:'unit-contract-only'},openAttempt:vi.fn(async v=>({...v,state:'bound' as const})),endAttempt:vi.fn(),retainArtifact:vi.fn(async a=>({contextId:a.context.contextId,artifactHash:a.artifactHash,retained:true as const})),reserve:vi.fn(async v=>({...v,state:'new' as const})),retain:vi.fn(async v=>receipt(v)),onPracticeComplete:vi.fn(async v=>receipt(v)),onTrialComplete:vi.fn(async(_c,v)=>receipt(v)),complete:vi.fn(async v=>({...v,confirmed:true as const}))}
  let clock=0;const frames:FrameRequestCallback[]=[]
  vi.spyOn(performance,'now').mockImplementation(()=>clock)
  vi.stubGlobal('innerWidth',390);vi.stubGlobal('innerHeight',844);vi.stubGlobal('devicePixelRatio',1)
  vi.stubGlobal('requestAnimationFrame',vi.fn((cb:FrameRequestCallback)=>{frames.push(cb);return 1}));vi.stubGlobal('cancelAnimationFrame',vi.fn())
  vi.spyOn(HTMLElement.prototype,'getBoundingClientRect').mockReturnValue({width:390,height:844,top:0,left:0,right:390,bottom:844,x:0,y:0,toJSON(){}})
  vi.spyOn(HTMLCanvasElement.prototype,'getContext').mockReturnValue({setTransform:vi.fn(),clearRect:vi.fn(),fillRect:vi.fn(),beginPath:vi.fn(),moveTo:vi.fn(),lineTo:vi.fn(),stroke:vi.fn(),arc:vi.fn(),fill:vi.fn()} as unknown as CanvasRenderingContext2D)
  render(<EnumerationTask context={context} persistence={port}/> )
  fireEvent.click(screen.getByRole('button',{name:'查看准备状态'}));fireEvent.click(screen.getByRole('button',{name:'开始练习'}))
  await screen.findByRole('slider')
  for(const at of [0,1000,2000,3000])act(()=>{clock=at;frames.shift()!(at)})
  clock=3100;fireEvent.change(screen.getByRole('slider'),{target:{value:'15'}});fireEvent.click(screen.getByRole('button',{name:'确认'}))
  await screen.findByRole('heading',{name:'练习记录'})
  expect(screen.getByText('刚才有3个点，你报告了15个。')).toBeTruthy()
  expect(screen.getByText(/例1：刚才看到3个点/)).toBeTruthy();expect(port.endAttempt).not.toHaveBeenCalled()
  fireEvent.click(screen.getByRole('button',{name:'下一次练习'}));expect(screen.getByText('2 / 3')).toBeTruthy()
  expect(port.reserve).toHaveBeenCalledTimes(1);expect(port.onTrialComplete).not.toHaveBeenCalled()
 })
})
