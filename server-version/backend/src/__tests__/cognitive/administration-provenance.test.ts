import { describe, expect, it } from 'vitest'
import { finalCognitiveSubmitSchema } from '../../modules/cognitive/cognitive.schema'
import {
  createUnifiedCognitiveRawSubmissionPayload,
  parseUnifiedCognitiveRawSubmissionPayload,
} from '../../modules/cognitive/unified-raw-submission'
import { getCognitiveV2TaskDefinition } from '../../modules/cognitive/v2/registry'

const provenance = {
  schemaVersion: 1 as const,
  deviceClass: 'PHONE' as const,
  administrationMode: 'TOUCH' as const,
}

describe('AdministrationProvenanceV1 backend contract', () => {
  it('accepts a strict optional provenance object on final submit', () => {
    const base = {
      submissionId: 'submission-1234567890',
      attemptEpoch: 1,
      definitionHash: 'definition-hash',
      trials: [{}],
    }
    expect(finalCognitiveSubmitSchema.parse(base).administrationProvenance).toBeUndefined()
    expect(finalCognitiveSubmitSchema.parse({ ...base, administrationProvenance: provenance }).administrationProvenance)
      .toEqual(provenance)
    expect(finalCognitiveSubmitSchema.safeParse({
      ...base,
      administrationProvenance: { ...provenance, deviceClass: 'MOBILE' },
    }).success).toBe(false)
    expect(finalCognitiveSubmitSchema.safeParse({
      ...base,
      administrationProvenance: { ...provenance, userAgent: 'do-not-store' },
    }).success).toBe(false)
  })

  it('round-trips optional provenance in the encrypted raw-submission envelope shape', () => {
    const trial = {
      schemaVersion: 1 as const,
      trialIndex: 0,
      phase: 'test' as const,
      startedAtPerfMs: 10,
      endedAtPerfMs: 20,
      durationMs: 10,
      flags: { timeout: false, premature: false },
      qualityEvents: [],
      payload: {},
    }
    const without = createUnifiedCognitiveRawSubmissionPayload({ attemptEpoch: 1, trials: [trial] })
    expect(Object.prototype.hasOwnProperty.call(without, 'administrationProvenance')).toBe(false)
    expect(parseUnifiedCognitiveRawSubmissionPayload(without)).toEqual(without)

    const withProvenance = createUnifiedCognitiveRawSubmissionPayload({
      attemptEpoch: 1,
      trials: [trial],
      administrationProvenance: provenance,
    })
    expect(parseUnifiedCognitiveRawSubmissionPayload(withProvenance).administrationProvenance).toEqual(provenance)
  })

  it('keeps Trail Making provenance warnings non-degrading in v2', () => {
    const definition = getCognitiveV2TaskDefinition('trailmaking', '1.0.0', '1.0.0')
    expect(definition).toBeDefined()
    expect(definition?.quality.deviceInfoIncomplete?.effect).toBe('none')
    expect(definition?.quality.mixedPointerType?.effect).toBe('none')
    expect(definition?.quality.insufficientCompletedSteps?.effect).toBe('limited')
  })
})
