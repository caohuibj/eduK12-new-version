import React from 'react'
import {describe,it,expect,vi,afterEach} from 'vitest'
import {render,screen,fireEvent,act,cleanup} from '@testing-library/react'
import {antGuidedConfig} from './generated/protocol'
import {AntSession} from './session'
import {antFixtureDisplay,ANT_FIXTURE_HASH,ANT_FIXTURE_SIGNATURE} from './test-fixtures'
import {antRecordDigest} from './seal'
import {AntTask,type AntTaskProps} from './AntTask'
import CognitiveV2ReportCard from '../../CognitiveV2ReportCard'
import type {CognitiveV2Report} from '../../types'
afterEach(()=>{cleanup();vi.restoreAllMocks();vi.unstubAllGlobals()})
function make(){
 let now=0
 const s=new AntSession({contextId:'guided-A',config:antGuidedConfig('experience'),seed:'guided-session',display:antFixtureDisplay(),fixture:false,
  persistLocalDraft:async r=>({durable:true,contextId:r.contextId,key:r.key,recordDigest:antRecordDigest(r)}),onTaskComplete:async()=>null,
  now:()=>now,timeOrigin:()=>0,paint:()=>{},onChange:()=>{}})
 s.authorizeExposure({contextId:'guided-A',durable:true,fresh:true,claimId:'unit-only'})
 const run=async(correct:number)=>{
  s.startPractice();s.tick(now+=100)
  for(let i=0;i<8;i++){
   const c=s.capture!,start=c.core.startedAtPerfMs,p=c.plan.plannedPreCueMs
   s.tick(start+p);s.tick(start+p+100);s.tick(start+p+500)
   c.input(i<correct?c.plan.direction:c.plan.direction==='left'?'right':'left','touch',start+p+2700)
   s.tick(start+p+2708);now=start+6000;s.tick(now);await s.queue.wait();await Promise.resolve()
   if(i<7){expect(s.view).toBe('practice-item-feedback');s.nextPracticeTrial();s.tick(now+=100)}
  }
 }
 return {s,run,nextTime:()=>now+100}
}
describe('ANT guided practice learning flow',()=>{
 it('accepts responses slower than formal, pauses for teaching, and unlocks formal only at 7/8',async()=>{
  const {s,run,nextTime}=make();await run(7)
  expect(s.view).toBe('practice-feedback');expect(s.practicePassed).toBe(true);expect(s.practiceCorrect).toBe(7)
  expect(s.records()).toHaveLength(8);expect(s.records()[0].raw.practice?.timing.responseWindowMs).toBe(3500)
  s.startFormal();s.tick(nextTime());expect(s.phase).toBe('test');expect(s.capture?.config.responseWindowMs).toBe(1700)
  expect(s.capture?.config.trialIntervalMs).toBe(4000);s.close()
 })
 it('requires instructions before retry and retains both rounds without overwriting records',async()=>{
  const {s,run}=make();await run(6);const original=JSON.stringify(s.records())
  expect(s.practicePassed).toBe(false);s.startFormal();s.startPractice();expect(s.view).toBe('practice-feedback')
  s.reviewPracticeInstructions();expect(s.view).toBe('practice-instructions');await run(8)
  expect(s.practicePassed).toBe(true);expect(s.practiceRound).toBe(1);expect(s.records()).toHaveLength(16)
  expect(new Set(s.records().map(r=>r.key)).size).toBe(16)
  expect(JSON.stringify(s.records().slice(0,8))).toBe(original)
  expect(s.records().slice(8).every(r=>r.raw.practice?.round===1)).toBe(true);s.close()
 })
 it('bounds unsuccessful repetitions at three rounds without exposing formal trials',async()=>{
  const {s,run}=make()
  for(let round=0;round<3;round++){if(round)s.reviewPracticeInstructions();await run(0)}
  expect(s.canRetryPractice).toBe(false);s.reviewPracticeInstructions();s.startPractice();s.startFormal()
  expect(s.view).toBe('practice-feedback');expect(s.records()).toHaveLength(24);expect(s.records().some(r=>r.phase==='test')).toBe(false)
  s.endPractice();expect(s.reason).toBe('practice_not_passed');expect(s.capture).toBeNull();s.close()
 })
 it('the actual component re-presents full instructions and examples before retry, with one exposure claim',async()=>{
  let now=0,serial=0;const frames=new Map<number,FrameRequestCallback>();let instance:AntSession|undefined
  vi.spyOn(performance,'now').mockImplementation(()=>now)
  vi.stubGlobal('requestAnimationFrame',(cb:FrameRequestCallback)=>{frames.set(++serial,cb);return serial})
  vi.stubGlobal('cancelAnimationFrame',(id:number)=>frames.delete(id))
  const original=AntSession.prototype.startPractice
  vi.spyOn(AntSession.prototype,'startPractice').mockImplementation(function(this:AntSession){instance=this;return original.call(this)})
  const claim=vi.fn(async({contextId}:{contextId:string})=>({contextId,durable:true as const,fresh:true as const,claimId:'ui-synthetic'}))
  const props:AntTaskProps={contextId:'guided-ui',config:antGuidedConfig('experience'),randomSeed:'ui-guided',configHash:ANT_FIXTURE_HASH,protocolSignature:ANT_FIXTURE_SIGNATURE,
   display:{frozen:antFixtureDisplay(),readViewport:()=>antFixtureDisplay().viewport},allowSyntheticFixture:true,claimAttemptExposure:claim,
   persistLocalDraft:async r=>({durable:true,contextId:r.contextId,key:r.key,recordDigest:antRecordDigest(r)}),onTaskComplete:async()=>null}
  const paint=async(time:number)=>{now=time;const callbacks=[...frames.values()];frames.clear();await act(async()=>{callbacks.forEach(cb=>cb(now));await Promise.resolve()})}
  render(<AntTask {...props}/>);expect(screen.getByText(/本次为实用版/)).toBeInTheDocument()
  await act(async()=>fireEvent.click(screen.getByRole('button',{name:'开始练习'})));await paint(0)
  for(let i=0;i<8;i++){
   const c=instance!.capture!,start=c.core.startedAtPerfMs,p=c.plan.plannedPreCueMs
   await paint(start+p);await paint(start+p+100);await paint(start+p+500);now=start+p+1000
   const key=c.plan.direction==='left'?'ArrowRight':'ArrowLeft'
   fireEvent.keyDown(window,{key});fireEvent.keyUp(window,{key});await paint(now+8);await paint(start+6000)
   if(i<7){fireEvent.click(screen.getByRole('button',{name:'下一题'}));await paint(now+100)}
  }
  expect(screen.queryByRole('button',{name:'开始正式作答'})).toBeNull()
  expect(screen.queryByRole('button',{name:'开始下一轮练习'})).toBeNull()
  fireEvent.click(screen.getByRole('button',{name:'重新查看说明'}))
  expect(screen.getByRole('heading',{name:'再看一次操作说明'})).toBeInTheDocument()
  expect(screen.getAllByText(/例[1-4]：选择/)).toHaveLength(4)
  expect(screen.getByText(/每轮练习8题，至少答对7题/)).toBeInTheDocument()
  await act(async()=>fireEvent.click(screen.getByRole('button',{name:'开始下一轮练习'})))
  expect(claim).toHaveBeenCalledTimes(1);expect(instance!.practiceRound).toBe(1)
 })
 it('uses the frozen practical label while preserving historical report wording',()=>{
  const report:CognitiveV2Report={title:'ANT',profileLabel:'实用版',qualityState:'invalid',conclusion:'No valid data',headline:[],user:[],detail:[],quality:[],
   method:{testType:'ant',engineVersion:'1.1.0',scoringVersion:'1.1.0',configVersion:'1.1.0',protocolSignature:'a'.repeat(64),profile:'experience'},disclaimer:'本次记录',practicalTips:[]}
  const {rerender}=render(<CognitiveV2ReportCard report={report}/>);expect(screen.getByText('实用版 · 精简协议')).toBeInTheDocument()
  expect(screen.queryByText('体验版 · 短程协议')).toBeNull()
  rerender(<CognitiveV2ReportCard report={{...report,profileLabel:null}}/>)
  expect(screen.getByText('体验版 · 短程协议')).toBeInTheDocument()
 })
})
