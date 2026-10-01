import { performance } from 'node:perf_hooks'
import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import { captureFixture } from './vnext-capture-fixture'
import { scoreSituationalModel } from '../../modules/situational/situation-model-resolver'
import { projectReachableSituationDefinitionForScoring, deriveAuthoritativeSituationalTrajectory } from '../../modules/situational/situation-trajectory'
import { validateSituationalResearchCapture } from '../../modules/situational/situation-research-capture'
import { assertCanonicalSubmissionPayloadSize, prepareCanonicalSubmission, FINAL_SUBMISSION_MAX_BYTES } from '../../services/instrumentFinalSubmit'

import { freezeSituationalRuntimeAtAttemptStart } from '../../modules/assessment-runtime/situational-runtime-snapshot'
import { encryptUnifiedRuntimePayload, decryptUnifiedRuntimePayload } from '../../modules/assessment-runtime/security'
import { sizedScientificFixture } from '../../modules/situational/fixtures/standardized-e2e-fixture'
export const sizedFixture = (count: number) => sizedScientificFixture(count as 10 | 30 | 60)

describe('Situational VNext bounded payload/scorer smoke', () => {
  const originalKey = process.env.DATA_ENCRYPTION_KEY
  beforeAll(() => { process.env.DATA_ENCRYPTION_KEY = 'a'.repeat(64) })
  afterAll(() => { if (originalKey === undefined) delete process.env.DATA_ENCRYPTION_KEY; else process.env.DATA_ENCRYPTION_KEY = originalKey })
  it.each([10, 30, 60])('%i scenes with six response channels retain one bounded FINAL', count => {
    const d = sizedFixture(count), f = captureFixture(d, `size-${count}`)
    const compileStart = performance.now()
    const snapshot = freezeSituationalRuntimeAtAttemptStart({ instrumentKey: 'synthetic-perf', instrumentVersion: '1.0.0', definition: d })
    const compileMs = performance.now() - compileStart
    expect(snapshot.definitionHash).toBe(f.definitionHash)
    const serializationStart = performance.now()
    const canonical = prepareCanonicalSubmission({ responses: f.responses, researchCapture: f.capture })
    const serializationMs = performance.now() - serializationStart
    const raw = { responses: f.responses, researchCapture: f.capture }
    const encryptionStart = performance.now(), encrypted = encryptUnifiedRuntimePayload(raw), encryptionMs = performance.now() - encryptionStart
    expect(decryptUnifiedRuntimePayload(encrypted)).toEqual(raw)
    expect(compileMs).toBeLessThan(5000); expect(encryptionMs).toBeLessThan(1000)
    expect(() => assertCanonicalSubmissionPayloadSize(canonical, FINAL_SUBMISSION_MAX_BYTES.situational, 'synthetic')).not.toThrow()
    const started = performance.now()
    const result = scoreSituationalModel(projectReachableSituationDefinitionForScoring(d, deriveAuthoritativeSituationalTrajectory(d, f.responses)), f.responses, { responsesValidated: true })
    const scoreMs = performance.now() - started
    const captureStart = performance.now(); validateSituationalResearchCapture(f); const captureMs = performance.now() - captureStart
    expect(result.metrics[0]!.value).toBe(1)
    // Generous smoke bound catches accidental training or catastrophic amplification.
    expect(scoreMs).toBeLessThan(1000); expect(captureMs).toBeLessThan(5000)
    console.info(JSON.stringify({ scenes: count, responses: f.responses.length, events: f.capture.events.length, bytes: Buffer.byteLength(JSON.stringify({ responses: f.responses, researchCapture: f.capture })), compileMs: Math.round(compileMs * 100) / 100, serializationMs: Math.round(serializationMs * 100) / 100, encryptionMs: Math.round(encryptionMs * 100) / 100, encryptedBytes: Buffer.byteLength(encrypted), scoreMs: Math.round(scoreMs * 100) / 100, captureMs: Math.round(captureMs * 100) / 100 }))
  })
})
