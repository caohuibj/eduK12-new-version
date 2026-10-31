import '@testing-library/jest-dom/vitest'
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import CognitiveRunner from '../pages/CognitiveRunner'
import { runnerReducer } from '../core/runner.state'
import type { RunnerState } from '../core/runner.types'
import type { CognitiveSession } from '../types'
import { resolveRunner, registerCognitiveRunner } from '../registry'
import { resolveCognitiveReadinessProfile } from '../core/readiness'
const harness = vi.hoisted(() => ({ controller: { state: {} as RunnerState, start: vi.fn(), appendTrial: vi.fn(), complete: vi.fn(), reload: vi.fn(), restart: vi.fn() } }))
vi.mock('../core/useCognitiveSession', () => ({ useCognitiveSession: () => harness.controller }))
const cases = [ ['wordanalogy','1.1.0','1'], ['wordmeaning','1.1.0','2'], ['wordproblem','2.0.0','4'], ['logicdeduce','2.0.0','2'], ['seriescomplete','1.1.0','2'], ['readingcomp','1.1.0','2'], ['proofread','1.1.0','4'] ] as const
const tree = () => <MemoryRouter initialEntries={['/student/cognitive/sessions/bank-host']}><Routes><Route path="/student/cognitive/sessions/:sessionId" element={<CognitiveRunner/>}/><Route path="/student/cognitive/sessions/:sessionId/result" element={<div>RESULT_PAGE</div>}/></Routes></MemoryRouter>
beforeEach(() => vi.clearAllMocks())
afterEach(() => { cleanup(); vi.useRealTimers() })
describe('bank intake exact registry and existing host completion', () => {
 it('resolves only explicitly declared exact versions and preserves restart handling', () => {
   for (const [testType,version] of cases) {
     expect(resolveRunner(testType,version)?.completionMode).toBe('manual')
     expect(resolveCognitiveReadinessProfile(testType,version)).toMatchObject({testType,engineVersion:version,category:'fixed-trial',globalKeyboardCapture:true,resumeDisposition:'restart-required'})
     expect(resolveCognitiveReadinessProfile(testType,'9.9.9')).toBeUndefined()
   }
   expect(resolveCognitiveReadinessProfile('reaction','1.0.0')).toMatchObject({resumeDisposition:'restart-required',globalKeyboardCapture:true})
 })
 it('does not turn runtime registration alone into a readiness contract', () => {
   const entry=resolveRunner('wordanalogy','1.1.0')!
   registerCognitiveRunner({...entry,testType:'synthetic-undeclared-bank',readiness:undefined})
   expect(resolveRunner('synthetic-undeclared-bank','1.1.0')).toBeDefined()
   expect(resolveCognitiveReadinessProfile('synthetic-undeclared-bank','1.1.0')).toBeUndefined()
 })
 it('allows the exact new version to prepare through the real READY page', async () => {
   harness.controller.state={status:'READY',session:{sessionId:'bank-host',testType:'wordanalogy',engineVersion:'1.1.0',scoringVersion:'1.1.0',configVersion:'1.1.0',attemptNo:1,config:{totalTrials:18},randomSeed:'ready-contract'} as unknown as CognitiveSession,taskContext:null,trialIndex:0,error:null,result:null}
   render(tree())
   await waitFor(()=>expect(screen.getByRole('button',{name:'开始测评'})).toBeEnabled())
 })
 it.each(cases)('%s uses the parent completion action after final index advancement and resolved failure', async(testType,version,practiceKey) => {
   const config={totalTrials:1,stimulusSetVersion:`${testType}-zh-v${version}`,fixationMs:400,timeoutMs:15000,validRtFloorMs:300,report:{reportVersion:version,referenceMode:'none'}}
   const session={sessionId:'bank-host',testType,engineVersion:version,scoringVersion:version,configVersion:version,attemptNo:1,config,status:'IN_PROGRESS',randomSeed:'host-contract'} as unknown as CognitiveSession
   harness.controller.state={status:'RUNNING',session,taskContext:{sessionId:'bank-host',testType,engineVersion:version,scoringVersion:version,configVersion:version,attemptNo:1,config,randomSeed:'host-contract'},trialIndex:0,error:null,result:null}
   const view=render(tree())
   const update=(action:Parameters<typeof runnerReducer>[1])=>{harness.controller.state=runnerReducer(harness.controller.state,action);view.rerender(tree())}
   harness.controller.appendTrial.mockImplementation(async()=>{update({type:'TRIAL_SUBMIT_START'});await Promise.resolve();update({type:'TRIAL_SUBMIT_SUCCESS',trialIndex:0});return true})
   let completionCalls=0
   harness.controller.complete.mockImplementation(async()=>{update({type:'COMPLETE_START'});await Promise.resolve();completionCalls++;if(completionCalls===1)update({type:'COMPLETE_FAILED',error:{code:'SYNTHETIC_RETRY',message:'temporary failure'}});else update({type:'COMPLETE_SUCCESS',result:{score:0,metrics:{},qualityFlags:{}}})})
   await waitFor(()=>expect(screen.getByText('开始练习')).toBeTruthy())
   vi.useFakeTimers();fireEvent.click(screen.getByText('开始练习'));await act(async()=>{vi.advanceTimersByTime(400)})
   fireEvent.keyDown(window,{key:practiceKey});fireEvent.click(screen.getByText('开始正式测评'));await act(async()=>{vi.advanceTimersByTime(400)})
   fireEvent.keyDown(window,{key:'1'});await act(async()=>{})
   expect(harness.controller.state.trialIndex).toBe(1);expect(harness.controller.appendTrial).toHaveBeenCalledTimes(1);expect(harness.controller.complete).not.toHaveBeenCalled()
   expect(screen.queryByText('开始练习')).toBeNull();expect(screen.getByRole('button',{name:'完成测评'})).toBeTruthy()
   fireEvent.click(screen.getByRole('button',{name:'完成测评'}));await act(async()=>{})
   expect(harness.controller.state.status).toBe('RUNNING');expect(screen.getByRole('button',{name:'完成测评'})).toBeTruthy();expect(screen.queryByText('开始练习')).toBeNull()
   fireEvent.click(screen.getByRole('button',{name:'完成测评'}));await act(async()=>{})
   expect(harness.controller.appendTrial).toHaveBeenCalledTimes(1);expect(harness.controller.complete).toHaveBeenCalledTimes(2);expect(screen.getByText('RESULT_PAGE')).toBeTruthy()
 })
})
