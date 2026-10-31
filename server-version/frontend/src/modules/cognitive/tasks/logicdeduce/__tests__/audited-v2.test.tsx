import {act,cleanup,fireEvent,render,screen} from '@testing-library/react'
import {afterEach,beforeEach,describe,expect,it,vi} from 'vitest'
import {LogicdeduceTask as Task} from '../LogicdeduceTask'
import {LOGICDEDUCE_BANK_V2 as bank,LOGICDEDUCE_PRACTICE_V2 as practice} from '../bank-v2'
import {buildLogicdeduceItems as build} from '../prng'
const config={totalTrials:36,stimulusSetVersion:'logicdeduce-zh-v2.0.0',fixationMs:400,timeoutMs:15000,validRtFloorMs:300,report:{reportVersion:'2.0.0',referenceMode:'none' as const}}
const taskContext={sessionId:'audit',testType:'logicdeduce',engineVersion:'2.0.0',scoringVersion:'2.0.0',configVersion:'2.0.0',attemptNo:1,config,randomSeed:'audit-seed'}
const tick=async(ms:number)=>{await act(async()=>{vi.advanceTimersByTime(ms)})}
const choose=async(index:number)=>{await act(async()=>{fireEvent.keyDown(window,{key:String(index+1)})})}
async function practiceStart(){fireEvent.click(screen.getByText('开始练习'));await tick(400)}
async function formalStart(){await practiceStart();await choose(practice.answer);fireEvent.click(screen.getByText('开始正式测评'));await tick(400)}
beforeEach(()=>{vi.useFakeTimers();vi.spyOn(performance,'now').mockReturnValue(1000)})
afterEach(()=>{cleanup();vi.restoreAllMocks();vi.useRealTimers()})
describe('logicdeduce audited V2',()=>{
 it('separates practice and delivers exactly 18/30/36 distinct formal stimuli',()=>{
  for(const count of [18,30,36]){const items=build('audit',count,config.stimulusSetVersion);expect(items).toHaveLength(count);expect(new Set(items.map(x=>x.itemId)).size).toBe(count);expect(items.some(x=>x.itemId===practice.id||x.stem===practice.stem)).toBe(false);expect(items).toEqual(build('audit',count,config.stimulusSetVersion));expect(items.every(x=>bank.some(y=>y.id===x.itemId))).toBe(true)}
  expect(()=>build('audit',37,config.stimulusSetVersion)).toThrow('正式题数超过冻结题池')
 })
 it('returns to full instructions after a wrong practice and emits exactly 36 formal facts',async()=>{
  const emit=vi.fn().mockResolvedValue(true),complete=vi.fn()
  const view=render(<Task taskContext={taskContext} trialIndex={0} onTrialComplete={emit} onTaskComplete={complete}/>)
  await practiceStart();await choose((practice.answer+1)%4)
  expect(screen.queryByText('开始正式测评')).toBeNull();expect(emit).not.toHaveBeenCalled()
  fireEvent.click(screen.getByText('重新查看说明并练习'));expect(screen.getByText('开始练习')).toBeTruthy()
  await formalStart()
  fireEvent.keyDown(window,{key:'1',repeat:true});expect(emit).not.toHaveBeenCalled()
  for(let i=0;i<36;i++){if(i>0){view.rerender(<Task taskContext={taskContext} trialIndex={i} onTrialComplete={emit} onTaskComplete={complete}/>);await tick(600)}await choose(0)}
  expect(emit).toHaveBeenCalledTimes(36);expect(complete).toHaveBeenCalledTimes(1)
  const payloads=emit.mock.calls.map(([p])=>p);expect(new Set(payloads.map(p=>p.itemId)).size).toBe(36)
  expect(payloads.every(p=>p.responseIndex===0&&p.rtMs===0&&p.itemId!==practice.id)).toBe(true)
 })
 it('records timeout as null rather than option zero',async()=>{
  const emit=vi.fn().mockResolvedValue(true)
  render(<Task taskContext={taskContext} trialIndex={0} onTrialComplete={emit}/>)
  await formalStart();await tick(15000)
  expect(emit).toHaveBeenCalledTimes(1);expect(emit.mock.calls[0][0]).toMatchObject({responseIndex:null,rtMs:null})
 })
})
