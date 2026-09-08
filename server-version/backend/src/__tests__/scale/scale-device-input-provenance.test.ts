import { describe, expect, it } from 'vitest'
import { decryptField } from '../../utils/encryption'
import {
  deviceInputProvenanceV1Schema,
  type DeviceInputProvenanceV1,
} from '../../modules/scale/device-input-provenance'
import {
  encryptScaleAnswers,
  readScaleAnswers,
  scaleAssessmentForResponse,
} from '../../modules/scale/scale-workflow.service'
import { finalScaleSubmitSchema } from '../../services/scale-final-submit.schema'
import { ADEXI_V2_PACKAGE } from '../../modules/scale/scale-package.registry'
import { scoreScale } from '../../modules/scale/scale-scoring'

const provenance: DeviceInputProvenanceV1 = {
  schemaVersion: 1,
  deviceClass: 'DESKTOP',
  osFamily: 'Windows',
  browserFamily: 'Chrome',
  viewportWidth: 1280,
  viewportHeight: 720,
  screenWidth: 1920,
  screenHeight: 1080,
  devicePixelRatio: 1,
  maxTouchPoints: 0,
  primaryPointer: 'FINE',
  capturedAt: '2026-09-08T00:00:00.000Z',
}

describe('Scale device input provenance v1', () => {
  it('accepts only coarse fields and rejects raw identity-like fields', () => {
    expect(deviceInputProvenanceV1Schema.safeParse(provenance).success).toBe(true)
    expect(deviceInputProvenanceV1Schema.safeParse({ ...provenance, userAgent: 'Mozilla/5.0' }).success).toBe(false)
    expect(deviceInputProvenanceV1Schema.safeParse({ ...provenance, hardwareId: 'device-1' }).success).toBe(false)
  })

  it('accepts provenance in the shared final submit contract and rejects identity-like additions', () => {
    const base = {
      submissionId: 'submission-123456',
      attemptEpoch: 1,
      definitionHash: 'definition-hash',
      answers: [{ itemCode: 'item-1', responseValue: 'often' }],
    }
    expect(finalScaleSubmitSchema.safeParse(base).success).toBe(true)
    expect(finalScaleSubmitSchema.safeParse({ ...base, deviceInputProvenance: provenance }).success).toBe(true)
    expect(finalScaleSubmitSchema.safeParse({
      ...base,
      deviceInputProvenance: { ...provenance, userAgent: 'Mozilla/5.0' },
    }).success).toBe(false)
  })

  it('keeps numeric scoring independent from device provenance and response timing', () => {
    const answers = ADEXI_V2_PACKAGE.goldenCases[1].answers.map((answer) => ({
      ...answer,
      responseTimeMs: 500,
    }))
    const mobile = { ...provenance, deviceClass: 'MOBILE' as const, osFamily: 'Android' as const, browserFamily: 'Chrome' as const }
    const desktopAnswers = readScaleAnswers(encryptScaleAnswers(answers, provenance)).answers
    const mobileAnswers = readScaleAnswers(encryptScaleAnswers(
      answers.map((answer) => ({ ...answer, responseTimeMs: 5000 })),
      mobile,
    )).answers
    const desktop = scoreScale(ADEXI_V2_PACKAGE.definition, desktopAnswers)
    const mobileResult = scoreScale(ADEXI_V2_PACKAGE.definition, mobileAnswers)
    expect(desktop.scores).toEqual(mobileResult.scores)
    expect(desktop.quality).toEqual(mobileResult.quality)
    expect(desktop.itemScores.map(({ itemCode, responseValue, baseScore, score }) => ({ itemCode, responseValue, baseScore, score })))
      .toEqual(mobileResult.itemScores.map(({ itemCode, responseValue, baseScore, score }) => ({ itemCode, responseValue, baseScore, score })))
  })

  it('keeps historical answer arrays readable and uses an envelope only when provenance exists', () => {
    const answers = [{ itemCode: 'item-1', responseValue: 'often', responseTimeMs: 321 }]
    const historical = readScaleAnswers(encryptScaleAnswers(answers))
    expect(historical).toEqual({ answers, decryptError: false })

    const encrypted = encryptScaleAnswers(answers, provenance)
    const envelope = decryptField<unknown>(encrypted)
    expect(envelope).toEqual({ schemaVersion: 1, answers, deviceInputProvenance: provenance })
    expect(readScaleAnswers(encrypted)).toEqual({ answers, decryptError: false, deviceInputProvenance: provenance })
  })

  it('does not expose an unvalidated direct provenance object', () => {
    const response = scaleAssessmentForResponse({
      id: 'assessment-1',
      answers: [],
      result: null,
      deviceInputProvenance: { ...provenance, userAgent: 'raw' },
    })
    expect(response).not.toHaveProperty('deviceInputProvenance')
  })

  it('marks malformed provenance envelopes unreadable instead of passing them to callers', () => {
    const malformed = encryptScaleAnswers([{ itemCode: 'item-1', responseValue: 'often' }], provenance)
    const raw = decryptField<Record<string, unknown>>(malformed)
    expect(readScaleAnswers({
      ...raw,
      deviceInputProvenance: { ...provenance, browserFamily: 'Mozilla/5.0' },
    })).toEqual({ answers: [], decryptError: true })
  })
})
