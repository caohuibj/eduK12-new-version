import { act, fireEvent, render, screen, cleanup } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { useState } from 'react'
import { WordmeaningTaskV11 as Task } from '../WordmeaningTaskV11'
import { buildWordmeaningItemsV11 as build, WORDMEANING_PRACTICE_ITEM_V11 as practice } from '../prng-v1.1'

const context = { sessionId:'synthetic',testType:'wordmeaning',engineVersion:'1.1.0',scoringVersion:'1.1.0',configVersion:'1.1.0',attemptNo:1,randomSeed:'reviewed-seed',config:{totalTrials:2,stimulusSetVersion:'wordmeaning-zh-v1.1.0',fixationMs:400,timeoutMs:15000,validRtFloorMs:300,report:{reportVersion:'1.1.0',referenceMode:'none'}} }
const tick=async (ms=400)=>{await act(async()=>{vi.advanceTimersByTime(ms)})}
const pick=(index:number)=>fireEvent.keyDown(window,{key:String(index+1)})
const formal=async()=>{fireEvent.click(screen.getByText('开始练习'));await tick();pick(practice.answer);fireEvent.click(screen.getByText('开始正式测评'));await tick()}
beforeEach(()=>{vi.useFakeTimers()})
afterEach(()=>{cleanup();vi.useRealTimers();vi.restoreAllMocks()})

describe('wordmeaning reviewed runner',()=>{
 it('uses disjoint practice and exact deterministic full profile lengths',()=>{
   for(const n of [18,30,36]){
    const items=build('seed',n);expect(items).toHaveLength(n);expect(new Set(items.map(i=>i.itemId)).size).toBe(n)
    expect(items).toEqual(build('seed',n));expect(items.some(i=>i.itemId===practice.id)).toBe(false)
    expect(items.some(i=>i.word===practice.word)).toBe(false)
   }
   expect(()=>build('seed',37)).toThrow();expect(()=>build('seed',0)).toThrow()
 })
 it('requires successful independent practice and restores instructions after an error',async()=>{
   render(<Task taskContext={context} trialIndex={0} onTrialComplete={vi.fn()}/>);
   fireEvent.click(screen.getByText('开始练习'));await tick();pick((practice.answer+1)%4)
   expect(screen.queryByText('开始正式测评')).toBeNull()
   fireEvent.click(screen.getByText('重新阅读说明并练习'));expect(screen.getByText('开始练习')).toBeTruthy()
   await formal();expect(screen.getByText('第 1 / 2 题')).toBeTruthy()
 })
 it('advances through the next real formal item and completes once',async()=>{
   const submit=vi.fn().mockResolvedValue(true),done=vi.fn().mockResolvedValue(undefined)
   function Host(){const [index,setIndex]=useState(0);return <Task taskContext={context} trialIndex={index} onTrialComplete={async p=>{await submit(p);setIndex(n=>n+1)}} onTaskComplete={done}/>}
   render(<Host/>);await formal();pick(0);await act(async()=>{});await tick();pick(1);await act(async()=>{})
   expect(submit).toHaveBeenCalledTimes(2);expect(submit.mock.calls[0][0].itemId).not.toBe(submit.mock.calls[1][0].itemId);expect(done).toHaveBeenCalledTimes(1)
 })
 it('records null timeout and ignores held-key repeats',async()=>{
   const submit=vi.fn().mockResolvedValue(true);render(<Task taskContext={context} trialIndex={0} onTrialComplete={submit}/>);await formal()
   fireEvent.keyDown(window,{key:'1',repeat:true});expect(submit).not.toHaveBeenCalled();await tick(15000)
   expect(submit.mock.calls[0][0]).toMatchObject({responseIndex:null,rtMs:null})
 })
 it('retries the immutable first choice/time after rejection, without accepting a new answer',async()=>{
   const submit=vi.fn().mockResolvedValueOnce(false).mockResolvedValueOnce(true);render(<Task taskContext={context} trialIndex={0} onTrialComplete={submit}/>);await formal();await tick(500);pick(0);await act(async()=>{})
   const first=submit.mock.calls[0][0];expect(first).toMatchObject({responseIndex:0,rtMs:500});await tick(1000);pick(3);expect(submit).toHaveBeenCalledTimes(1)
   fireEvent.click(screen.getByText('重试保存'));await act(async()=>{});expect(submit.mock.calls[1][0]).toEqual(first)
 })
 it('supports native button activation and preserves interruption',async()=>{
   const submit=vi.fn().mockResolvedValue(true);render(<Task taskContext={context} trialIndex={0} onTrialComplete={submit}/>);await formal()
   vi.spyOn(document,'hidden','get').mockReturnValue(true);fireEvent(document,new Event('visibilitychange'))
   fireEvent.click(screen.getAllByRole('button')[0]);await act(async()=>{});expect(submit.mock.calls[0][0]).toMatchObject({responseIndex:0,interrupted:true})
 })
})
