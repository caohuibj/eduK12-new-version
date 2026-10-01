import { describe, it, expect } from 'vitest'
import { scientificFixture } from './vnext-fixture'
import { captureFixture } from './vnext-capture-fixture'
import { validateSituationalResearchCapture } from '../../modules/situational/situation-research-capture'
import { researchCaptureSchema } from '../../modules/situational/situation-scientific-contract'
import { situationalFinalSubmitSchema } from '../../modules/situational/situational-final-submit.schema'

describe('Situational bounded research capture', () => {
  it('validates stage exposure, confirmation and one final raw response per channel', () => {
    const fixture = captureFixture(scientificFixture(), 'test')
    expect(validateSituationalResearchCapture(fixture)).toEqual(fixture.capture)
    expect(fixture.responses).toHaveLength(4)
  })
  it.each(['probe-before-choice', 'unconfirmed-choice', 'wrong-final', 'wrong-history', 'wrong-assignment', 'time-reversal', 'revision-jump', 'required-capture', 'edit-after-confirm'])('rejects %s', kind => {
    const f = captureFixture(scientificFixture(), 'test')
    if (kind === 'probe-before-choice') { const probe = f.capture.events.find(e => e.type === 'PROBE_EXPOSED')!; f.capture.events.splice(1, 0, { ...probe, relativeTimeMs: 0 }) }
    if (kind === 'unconfirmed-choice') f.capture.events = f.capture.events.filter(e => !(e.type === 'STAGE_CONFIRMED' && e.stageKey === 'choice'))
    if (kind === 'wrong-final') f.responses[0]!.responseValue = 'B'
    if (kind === 'wrong-history') f.responses[0]!.historyIdentity = 'f'.repeat(64)
    if (kind === 'wrong-assignment') f.capture.assignmentIdentity = 'f'.repeat(64)
    if (kind === 'time-reversal') f.capture.events[f.capture.events.length - 1]!.relativeTimeMs = 0
    if (kind === 'revision-jump') f.capture.events.find(e => e.type === 'RESPONSE_FIRST_COMMITTED')!.responseRevision = 2
    if (kind === 'required-capture') delete (f as { capture?: unknown }).capture
    if (kind === 'edit-after-confirm') { const e = f.capture.events[1]!; f.capture.events.splice(3, 0, { ...e, type: 'RESPONSE_CHANGED', responseValue: 'B', responseRevision: 2, relativeTimeMs: 2 }) }
    expect(() => validateSituationalResearchCapture(f)).toThrow()
  })
  it('bounds events and rejects telemetry/score injection', () => {
    const f = captureFixture(scientificFixture(), 'test')
    expect(researchCaptureSchema.safeParse({ ...f.capture, events: Array(4097).fill(f.capture.events[0]) }).success).toBe(false)
    expect(researchCaptureSchema.safeParse({ ...f.capture, mouse: [] }).success).toBe(false)
    expect(researchCaptureSchema.safeParse({ ...f.capture, events: [{ ...f.capture.events[0], channelKey: 'unknown', responseValue: 'unrelated text' }] }).success).toBe(false)
    expect(situationalFinalSubmitSchema.safeParse({ submissionId: 'x'.repeat(20), attemptEpoch: 1, definitionHash: f.definitionHash, responses: [{ ...f.responses[0], score: 72 }], researchCapture: f.capture }).success).toBe(false)
  })
})
