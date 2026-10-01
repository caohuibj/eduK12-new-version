import { performance } from 'node:perf_hooks'
import { describe, it, expect } from 'vitest'
import { captureFixture } from './vnext-capture-fixture'
import { scoreSituationalModel } from '../../modules/situational/situation-model-resolver'
import { projectReachableSituationDefinitionForScoring, deriveAuthoritativeSituationalTrajectory } from '../../modules/situational/situation-trajectory'
import { validateSituationalResearchCapture } from '../../modules/situational/situation-research-capture'
import { assertCanonicalSubmissionPayloadSize, prepareCanonicalSubmission, FINAL_SUBMISSION_MAX_BYTES } from '../../services/instrumentFinalSubmit'

import { sizedScientificFixture } from '../../modules/situational/fixtures/standardized-e2e-fixture'
export const sizedFixture = (count: number) => sizedScientificFixture(count as 10 | 30 | 60)

describe('Situational VNext bounded payload/scorer smoke', () => {
  it.each([10, 30, 60])('%i scenes with six response channels retain one bounded FINAL', count => {
    const d = sizedFixture(count), f = captureFixture(d, `size-${count}`)
    const canonical = prepareCanonicalSubmission({ responses: f.responses, researchCapture: f.capture })
    expect(() => assertCanonicalSubmissionPayloadSize(canonical, FINAL_SUBMISSION_MAX_BYTES.situational, 'synthetic')).not.toThrow()
    const started = performance.now()
    const result = scoreSituationalModel(projectReachableSituationDefinitionForScoring(d, deriveAuthoritativeSituationalTrajectory(d, f.responses)), f.responses, { responsesValidated: true })
    const scoreMs = performance.now() - started
    const captureStart = performance.now(); validateSituationalResearchCapture(f); const captureMs = performance.now() - captureStart
    expect(result.metrics[0]!.value).toBe(1)
    // Generous smoke bound catches accidental training or catastrophic amplification.
    expect(scoreMs).toBeLessThan(1000); expect(captureMs).toBeLessThan(5000)
    console.info(JSON.stringify({ scenes: count, responses: f.responses.length, events: f.capture.events.length, bytes: Buffer.byteLength(JSON.stringify({ responses: f.responses, researchCapture: f.capture })), scoreMs: Math.round(scoreMs * 100) / 100, captureMs: Math.round(captureMs * 100) / 100 }))
  })
})
