import {act,cleanup,fireEvent,render,screen} from '@testing-library/react'
import {afterEach,beforeEach,describe,expect,it,vi} from 'vitest'
import {LogicdeduceTask as Task} from '../LogicdeduceTask'
import {LOGICDEDUCE_PRACTICE_V2 as practice} from '../bank-v2'
const context={sessionId:'synthetic-recovery',testType:'logicdeduce',engineVersion:'2.0.0',scoringVersion:'2.0.0',configVersion:'2.0.0',attemptNo:1,randomSeed:'recovery',config:{totalTrials:1,stimulusSetVersion:'logicdeduce-zh-v2.0.0',fixationMs:400,timeoutMs:15000,validRtFloorMs:300,report:{reportVersion:'2.0.0',referenceMode:'none'}}}
let now=1000
const tick=async(ms:number)=>{await act(async()=>{vi.advanceTimersByTime(ms)})}
async function start(){fireEvent.click(screen.getByText('开始练习'));await tick(400);fireEvent.keyDown(window,{key:String(practice.answer+1)});fireEvent.click(screen.getByText('开始正式测评'));await tick(400)}
beforeEach(()=>{now=1000;vi.useFakeTimers();vi.spyOn(performance,'now').mockImplementation(()=>now)})
afterEach(()=>{cleanup();vi.restoreAllMocks();vi.useRealTimers()})
describe('logicdeduce V2 first-response recovery',()=>{
 it.each(['reject','throw'])('preserves first option/time after %s and only explicit retry resends it',async(kind)=>{
  const emit=vi.fn();if(kind==='reject')emit.mockResolvedValueOnce(false);else emit.mockRejectedValueOnce(new Error('synthetic offline'));emit.mockResolvedValueOnce(true)
  render(<Task taskContext={context} trialIndex={0} onTrialComplete={emit}/>);await start();now=1500;fireEvent.click(screen.getAllByRole('button')[0]);await act(async()=>{})
  expect(emit).toHaveBeenCalledTimes(1);const first=emit.mock.calls[0][0];expect(first).toMatchObject({responseIndex:0,rtMs:500});now=3000;fireEvent.keyDown(window,{key:'4'});await tick(15000);expect(emit).toHaveBeenCalledTimes(1)
  fireEvent.click(screen.getByText('重试保存'));await act(async()=>{});expect(emit).toHaveBeenCalledTimes(2);expect(emit.mock.calls[1][0]).toEqual(first)
 })

})
