import { describe, expect, it } from 'vitest'
import {
  projectExternalDeviceProvenance,
  projectExternalScaleAnswer,
  projectExternalScaleItemScore,
  projectExternalScaleMethod,
  projectExternalScaleReference,
  projectExternalScaleScore,
} from '../../modules/scale/projection/serialization'

describe('Scale external field serializers', () => {
  it('allowlists score fields and accepts canonical aggregate summaries', () => {
    const output = projectExternalScaleScore({
      key: 'total',
      label: '总分',
      type: 'total',
      value: 12,
      status: 'calculated',
      futureSecret: 'DO_NOT_LEAK',
    })
    expect(output).toEqual({
      key: 'total',
      label: '总分',
      value: 12,
      type: 'total',
      status: 'calculated',
    })
    expect(JSON.stringify(output)).not.toContain('DO_NOT_LEAK')
  })

  it('keeps item scores but removes raw response provenance when rawAnswers is false', () => {
    const input = {
      itemCode: 'i1',
      responseValue: 'RAW_SECRET',
      baseScore: 2,
      score: 2,
      responseTimeMs: 811,
      answeredAt: '2026-09-21T00:00:00.000Z',
      changeCount: 3,
      futureSecret: 'DO_NOT_LEAK',
    }
    expect(projectExternalScaleItemScore(input, false)).toEqual({ itemCode: 'i1', baseScore: 2, score: 2 })
    expect(projectExternalScaleItemScore(input, true)).toMatchObject({
      itemCode: 'i1',
      responseValue: 'RAW_SECRET',
      baseScore: 2,
      score: 2,
      responseTimeMs: 811,
      changeCount: 3,
    })
    expect(JSON.stringify(projectExternalScaleItemScore(input, true))).not.toContain('DO_NOT_LEAK')
  })

  it('separates population reference metadata from individual numeric findings and labels', () => {
    const input = {
      scoreKey: 'total',
      referenceVersion: 'ref-1',
      referenceKind: 'normative_distribution',
      evidenceLevel: 'local_pilot',
      status: 'available',
      label: '本地样本',
      value: 12,
      mean: 10,
      sd: 2,
      z: 1,
      t: 60,
      percentile: { value: 84.1, estimated: true, secret: 'x' },
      criterionBand: { key: 'high', label: 'HIGH', minInclusive: 11, maxInclusive: null, secret: 'x' },
      meanDifference: 2,
      source: { citation: 'Pilot sample', publicationYear: 2026, futureSecret: 'x' },
      population: { description: 'Pilot population', futureSecret: 'x' },
      instrumentVersion: '1.0.0',
      scoringVersion: '1.0.0',
      limitations: ['pilot'],
      disclaimer: 'reference disclaimer',
      futureSecret: 'DO_NOT_LEAK',
    }
    const output = projectExternalScaleReference(input, { numericScores: false, scoreDerivedLabels: false })
    expect(output).toMatchObject({
      value: null,
      mean: 10,
      sd: 2,
      z: null,
      t: null,
      percentile: null,
      criterionBand: null,
      meanDifference: null,
      source: { citation: 'Pilot sample', publicationYear: 2026 },
      population: { description: 'Pilot population' },
    })
    expect(JSON.stringify(output)).not.toMatch(/DO_NOT_LEAK|HIGH|84\.1/)
  })

  it('projects method fields without internal runtime hashes and tolerates partial aggregate methods', () => {
    const output = projectExternalScaleMethod({
      instrumentVersion: '2.0.0',
      compiledRuntimeHash: 'SECRET_RUNTIME_HASH',
      futureSecret: 'DO_NOT_LEAK',
    })
    expect(output).toEqual({ instrumentVersion: '2.0.0' })
  })

  it('allowlists resume answers and device provenance', () => {
    const answer = projectExternalScaleAnswer({
      itemCode: 'i1',
      responseValue: 1,
      responseTimeMs: 200,
      futureSecret: 'ANSWER_SECRET',
    } as any)
    const provenance = projectExternalDeviceProvenance({
      schemaVersion: 1,
      deviceClass: 'MOBILE',
      primaryPointer: 'COARSE',
      capturedAt: '2026-09-21T00:00:00.000Z',
      viewportWidth: 390,
      futureFingerprint: 'DEVICE_SECRET',
    } as any)
    expect(answer).toEqual({ itemCode: 'i1', responseValue: 1, responseTimeMs: 200 })
    expect(provenance).toEqual({
      schemaVersion: 1,
      deviceClass: 'MOBILE',
      viewportWidth: 390,
      primaryPointer: 'COARSE',
      capturedAt: '2026-09-21T00:00:00.000Z',
    })
    expect(JSON.stringify({ answer, provenance })).not.toMatch(/ANSWER_SECRET|DEVICE_SECRET/)
  })
})
