import { describe, expect, it } from 'vitest'
import { wrapCognitiveTrial } from '../core/trial-envelope'

describe('Cognitive v2 frontend trial envelope', () => {
  it('maps task phases and preserves raw payload without adding a client score', () => {
    const learning = wrapCognitiveTrial({
      trialIndex: 2,
      payload: { phase: 'immediate', responseDurationMs: 320, response: ['学校'] },
    })
    expect(learning).toMatchObject({
      schemaVersion: 1,
      trialIndex: 2,
      phase: 'learning',
      durationMs: 320,
      payload: { phase: 'immediate', response: ['学校'] },
    })
    expect(learning.payload).not.toHaveProperty('score')

    const delayed = wrapCognitiveTrial({
      trialIndex: 3,
      payload: { phase: 'delayed', responseDurationMs: 80, interrupted: true, timedOut: true },
    })
    expect(delayed.phase).toBe('delayed')
    expect(delayed.flags.timeout).toBe(true)
    expect(delayed.qualityEvents).toEqual(['visibility_lost'])
  })

  it('uses the test phase for task payloads without a phase marker', () => {
    const envelope = wrapCognitiveTrial({
      trialIndex: 0,
      payload: { rtMs: 250, interrupted: false },
    })
    expect(envelope.phase).toBe('test')
    expect(envelope.durationMs).toBe(250)
  })
})

describe('Simon exact observed timing envelope',()=>{
 const identity={testType:'simon',engineVersion:'1.0.0',scoringVersion:'1.0.0',configVersion:'1.0.0'}
 const payload={color:'red',stimulusSide:'left',requiredSide:'right',mapping:'blue-left',responseSide:'left',rtMs:400,timeout:false,interrupted:false,
   timing:{strategy:'double-raf-performance-v1',onsetPerfMs:1000,windowEndPerfMs:3000,isiMs:600}}
 it('keeps observed 2000ms window, derives incongruence from required not actual response, and never fabricates a visibility cause',()=>{
  expect(wrapCognitiveTrial({trialIndex:0,payload,identity})).toMatchObject({condition:'incongruent',startedAtPerfMs:1000,endedAtPerfMs:3000,durationMs:2000,qualityEvents:[],flags:{timeout:false}})
  expect(wrapCognitiveTrial({trialIndex:0,payload:{...payload,interrupted:true},identity}).qualityEvents).toEqual([])
 })
 it('rejects absent timing, unknown versions and an inconsistent mapping',()=>{
  expect(()=>wrapCognitiveTrial({trialIndex:0,payload:{...payload,timing:undefined},identity})).toThrow('timing')
  expect(()=>wrapCognitiveTrial({trialIndex:0,payload,identity:{...identity,engineVersion:'2.0.0'}})).toThrow('identity')
  expect(()=>wrapCognitiveTrial({trialIndex:0,payload:{...payload,requiredSide:'left'},identity})).toThrow('mapping')
 })
})
