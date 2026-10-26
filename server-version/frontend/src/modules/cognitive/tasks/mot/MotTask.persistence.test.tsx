import React from 'react'
import '@testing-library/jest-dom/vitest'
import {afterEach,beforeEach,describe,it,expect,vi} from 'vitest'
import {act,fireEvent,render,screen,waitFor} from '@testing-library/react'
import {MotTask} from './MotTask'
import {motConfig,motTrialPlan} from './generated/protocol'
import {MotCapture} from './capture'
import type {MotDraftPort,MotDraftRecord,MotPending} from './draft'
const config=motConfig('experience'),seed='mot-ui-save-contract'
const calibration={version:1 as const,method:'ruler_and_distance_self_reported' as const,referenceMm:50 as const,
 referenceCssPx:190,viewingDistanceMm:350,viewportWidthCssPx:1024,viewportHeightCssPx:768,
 devicePixelRatio:1,visualViewportScale:1,language:'zh' as const}
let clock=0,paint:FrameRequestCallback
const delayed=()=>{let resolve!:()=>void;const promise=new Promise<void>(ok=>{resolve=ok});return{promise,resolve}}
function draftFor(records:MotDraftRecord[]=[]){
 let pending:MotPending|null=null;const practices:MotDraftRecord[]=[]
 const port:MotDraftPort={binding:{sessionId:'synthetic-practice',attemptNo:1,protocolKey:'mot/1.1.1/1.1.0',resolvedConfigHash:'synthetic-only',randomSeed:seed},pending:vi.fn(async()=>pending),begin:vi.fn(async p=>{pending=p}),
  append:vi.fn(async record=>{if(!records.some(r=>r.core.trialIndex===record.core.trialIndex))records.push(structuredClone(record));pending=null}),
  records:vi.fn(async()=>structuredClone(records)),practices:vi.fn(async()=>structuredClone(practices)),
  appendPractice:vi.fn(async record=>{practices.push(structuredClone(record))})}
 return{port,records,practices}
}
async function setup(port:MotDraftPort,index=0,accepted:(core:MotDraftRecord['core'])=>Promise<void|boolean>=vi.fn(async()=>true)){
 render(<MotTask config={config} randomSeed={seed} trialIndex={index} draft={port} onTrialComplete={accepted} prepareFinalArchive={vi.fn(async()=>{})}/>)
 fireEvent.click(screen.getByRole('button',{name:'校准屏幕'}));fireEvent.click(screen.getByRole('checkbox'))
 fireEvent.click(screen.getByRole('button',{name:'确认校准'}))
}
async function finishPractice(index:number){
 fireEvent.click(screen.getByRole('button',{name:/^开始$/}))
 await waitFor(()=>expect(document.querySelector('[data-mot-stage="fixation"]')).not.toBeNull())
 const base=clock
 for(const offset of [500,1500,9500,10000]){act(()=>{clock=base+offset;paint(clock)})}
 const board=document.querySelector('.mot-board')!
 for(const id of motTrialPlan(config,seed,index,true).targetIds){
  const dot=document.querySelector(`[data-mot-id="${id}"]`) as HTMLElement;dot.focus();fireEvent.keyDown(board,{key:'Enter'})
 }
}
beforeEach(()=>{clock=0;vi.spyOn(performance,'now').mockImplementation(()=>clock)
 vi.stubGlobal('requestAnimationFrame',vi.fn((callback:FrameRequestCallback)=>{paint=callback;return 1}));vi.stubGlobal('cancelAnimationFrame',vi.fn())})
afterEach(()=>{vi.restoreAllMocks();vi.unstubAllGlobals()})
describe('MOT capture and persistence recovery UI',()=>{
 it('retries failed practice saving with its original record and suppresses double clicks',async()=>{
  const draft=draftFor(),wait=delayed()
  vi.mocked(draft.port.appendPractice).mockRejectedValueOnce(new Error('quota')).mockImplementationOnce(()=>wait.promise)
  await setup(draft.port);await finishPractice(0)
  expect(await screen.findByRole('alert')).toHaveTextContent('无需重复练习')
  const before=vi.mocked(requestAnimationFrame).mock.calls.length,original=vi.mocked(draft.port.appendPractice).mock.calls[0][0]
  const retry=screen.getByRole('button',{name:/^重试$/});act(()=>{fireEvent.click(retry);fireEvent.click(retry)})
  await waitFor(()=>expect(draft.port.appendPractice).toHaveBeenCalledTimes(2))
  expect(vi.mocked(draft.port.appendPractice).mock.calls[1][0]).toEqual(original)
  expect(vi.mocked(requestAnimationFrame).mock.calls.length).toBe(before)
  await act(async()=>{wait.resolve();await wait.promise})
  expect(await screen.findByRole('heading',{name:'练习记录'})).toBeInTheDocument();expect(original.core.responses).toHaveLength(5)
 })
 it('refuses pending exposure from a different parent progress',async()=>{
  const draft=draftFor();vi.mocked(draft.port.pending).mockResolvedValue({trialIndex:2,calibration})
  await setup(draft.port);fireEvent.click(screen.getByRole('button',{name:/^开始$/}))
  expect(await screen.findByRole('alert')).toHaveTextContent('进度不一致')
  expect(draft.port.begin).not.toHaveBeenCalled();expect(draft.port.append).not.toHaveBeenCalled();expect(requestAnimationFrame).not.toHaveBeenCalled()
 })
 it('keeps captured core immutable across a callback mutation and an unconfirmed ACK',async()=>{
  const stored=Array.from({length:9},(_,i)=>{const c=new MotCapture(config,motTrialPlan(config,seed,i),calibration,0);c.interrupt('runner_restart',0);return c.record()})
  const original=structuredClone(stored[8]),draft=draftFor(stored),wait=delayed()
  const accepted=vi.fn(async(core:MotDraftRecord['core'])=>{core.responses=[];core.prematureInputs=999;return false})
  await setup(draft.port,8,accepted);await finishPractice(0);await screen.findByRole('heading',{name:'练习记录'})
  fireEvent.click(screen.getByRole('button',{name:'再练习一次'}));await finishPractice(1);await screen.findByRole('heading',{name:'练习记录'})
  fireEvent.click(screen.getByRole('button',{name:'进入正式作答'}));fireEvent.click(screen.getByRole('button',{name:/^开始$/}))
  await screen.findByRole('alert');expect(stored[8]).toEqual(original)
  accepted.mockImplementationOnce(async()=>{await wait.promise;return true})
  const before=vi.mocked(requestAnimationFrame).mock.calls.length,retry=screen.getByRole('button',{name:/^重试$/})
  act(()=>{fireEvent.click(retry);fireEvent.click(retry)})
  await waitFor(()=>expect(accepted).toHaveBeenCalledTimes(2))
  expect(vi.mocked(draft.port.append).mock.calls[1][0]).toEqual(original)
  expect(vi.mocked(requestAnimationFrame).mock.calls.length).toBe(before)
  await act(async()=>{wait.resolve();await wait.promise})
 })
})
