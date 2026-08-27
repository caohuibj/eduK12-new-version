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
