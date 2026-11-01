import { act, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { AuditorynbackTaskV11 } from '../AuditorynbackTaskV11'
import { generateAuditoryNbackFixedSequence, generateAuditoryNbackPracticeSequence } from '../generator'
const audio = vi.hoisted(()=>({prepare:vi.fn(), play:vi.fn()}))
vi.mock('../../shared/audio',()=>({prepareAudioContext:audio.prepare,playTone:audio.play}))
const config={nLevel:2,totalTrials:22,targetRatio:.3,stimulusMs:500,isiMs:1500,toneFrequenciesHz:[262,330,392,494,587],report:{reportVersion:'1.1.0',referenceMode:'none'}}
const context={sessionId:'synthetic',testType:'auditorynback',engineVersion:'1.1.0',scoringVersion:'1.1.0',configVersion:'1.1.0',attemptNo:1,config,randomSeed:'r2-counterexample'}
beforeEach(()=>{vi.useFakeTimers();audio.prepare.mockResolvedValue({context:{},latencyMs:10});audio.play.mockClear()})
afterEach(()=>{vi.restoreAllMocks();vi.useRealTimers()})
it('teaches on the separate practice sequence then plays and saves the fixed-count formal tone',async()=>{
 const save=vi.fn().mockResolvedValue(undefined)
 render(<AuditorynbackTaskV11 taskContext={context} trialIndex={0} onTrialComplete={save}/>)
 expect(screen.getByText(/本次有 22 个正式音/)).toBeInTheDocument()
 fireEvent.click(screen.getByText('开始练习'));await act(async()=>{})
 const practice=generateAuditoryNbackPracticeSequence(context.randomSeed,2,5)
 for(let i=0;i<8;i++){
  if(i>=2 && practice[i]===practice[i-2])fireEvent.keyDown(window,{key:' ',code:'Space'})
  await act(async()=>{vi.advanceTimersByTime(500)})
  await act(async()=>{vi.advanceTimersByTime(1500)})
  fireEvent.click(screen.getByText(i===7?'开始正式测评':'下一个'))
 }
 await act(async()=>{})
 const sequence=generateAuditoryNbackFixedSequence(context.randomSeed,22,2,.3,5)
 expect(audio.play.mock.calls.at(-1)?.[1]).toBe(config.toneFrequenciesHz[sequence[0]])
 expect(save).not.toHaveBeenCalled()
 await act(async()=>{vi.advanceTimersByTime(500)})
 await act(async()=>{vi.advanceTimersByTime(1500)})
 expect(save).toHaveBeenCalledWith({trialIndex:0,toneIndex:sequence[0],responded:false,rtMs:null,interrupted:false,audioLatencyMs:10})
})
