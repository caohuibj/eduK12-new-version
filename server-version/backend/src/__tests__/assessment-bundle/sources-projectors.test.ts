import { describe, expect, it } from 'vitest'
import { BundleContractError } from '../../modules/assessment-bundle/errors'
import {
  assertUniqueCognitiveSources,
  assertUniqueScaleSources,
  assertUniqueValueSelectors,
  projectBundleCognitiveSource,
  projectBundleScaleSource,
  projectScaleEvidenceItems,
  type BundleFrozenCognitiveSourceV1,
  type BundleFrozenScaleSourceV1,
} from '../../modules/assessment-bundle'
import { HASH_A, HASH_B } from './fixtures'

const failCode = (run: () => unknown): string => {
  try {
    run()
    throw new Error('expected BundleContractError')
  } catch (error) {
    if (error instanceof BundleContractError) return error.code
    throw error
  }
}

const scaleResult = (overrides: Record<string, unknown> = {}) => ({
  schemaVersion: 2 as const,
  instrument: {
    scaleId: 'scale-who5',
    code: 'who5',
    name: 'WHO-5',
    instrumentVersion: '1.0.0',
  },
  method: {
    scaleId: 'scale-who5',
    instrumentVersion: '1.0.0',
    scoringVersion: '1.0.0',
    reportVersion: '1.0.0',
    definitionHash: HASH_A,
    referenceVersions: ['who5-ref-1'],
    assessmentContext: null,
  },
  quality: { status: 'interpretable' as const, flags: [] as Array<'missing_items' | 'insufficient_items' | 'score_not_calculable'> },
  itemScores: [],
  scores: [
    {
      key: 'raw_total',
      type: 'total' as const,
      label: 'Raw',
      direction: 'higher_is_better' as const,
      canonical: true,
      displayPrecision: 0,
      value: 18,
      range: { min: 0, max: 25 },
      expectedItems: ['i1'],
      answeredItems: ['i1'],
      status: 'calculated' as const,
      prorated: false,
    },
    {
      key: 'percentage',
      type: 'dimension' as const,
      label: 'Pct',
      direction: 'higher_is_better' as const,
      canonical: false,
      displayPrecision: 0,
      value: 72,
      range: { min: 0, max: 100 },
      expectedItems: ['i1'],
      answeredItems: ['i1'],
      status: 'calculated' as const,
      prorated: false,
    },
  ],
  references: [
    {
      scoreKey: 'percentage',
      status: 'available',
      referenceVersion: 'who5-ref-1',
      referenceKind: 'criterion',
      criterionBand: {
        key: 'who5.percentage.descriptive',
        label: 'Descriptive',
        minInclusive: 0,
        maxInclusive: 100,
      },
    },
  ],
  interpretations: [],
  caveats: [],
  disclaimer: 'fixture',
  ...overrides,
})

const cognitiveResult = (overrides: Record<string, unknown> = {}) => ({
  schemaVersion: 1 as const,
  completedAt: '2026-09-02T12:00:00.000Z',
  testType: 'gonogo',
  configVersion: '1.0.0',
  engineVersion: '1.0.0',
  scoringVersion: '1.0.0',
  protocolSignature: HASH_A,
  profile: 'standard' as const,
  metrics: { commissionRate: 0.12, dPrime: 2.1 },
  quality: {
    state: 'interpretable' as const,
    flags: {},
    reasons: [],
  },
  references: [] as Array<Record<string, unknown>>,
  report: {},
  assessmentContext: null,
  ...overrides,
})

describe('authoritative Bundle source projectors', () => {
  it('projects ScaleResultV2 with criterionBand.key and rejects inventable identity/hash', () => {
    const source = projectBundleScaleSource({
      slotKey: 'who5',
      expectedInstrumentKey: 'who5',
      expectedInstrumentVersion: '1.0.0',
      sourceResultHash: HASH_A,
      result: scaleResult(),
    })
    expect(source).toMatchObject({
      slotKey: 'who5',
      instrumentKey: 'who5',
      sourceResultHash: HASH_A,
      qualityState: 'interpretable',
    })
    expect(source.scores.find((row) => row.scoreKey === 'percentage')?.criterionBandKey)
      .toBe('who5.percentage.descriptive')
    expect(source.scores.find((row) => row.scoreKey === 'raw_total')?.criterionBandKey).toBeNull()

    expect(failCode(() => projectBundleScaleSource({
      slotKey: 'who5',
      expectedInstrumentKey: 'who5',
      expectedInstrumentVersion: '1.0.0',
      sourceResultHash: 'NOT-A-HASH',
      result: scaleResult(),
    }))).toBe('SOURCE_RESULT_HASH')

    expect(failCode(() => projectBundleScaleSource({
      slotKey: 'who5',
      expectedInstrumentKey: 'who5',
      expectedInstrumentVersion: '9.9.9',
      sourceResultHash: HASH_A,
      result: scaleResult(),
    }))).toBe('SOURCE_IDENTITY_MISMATCH')
  })

  it('inherits Scale invariants: not_calculable nulls band; invalid strips bands; duplicate scoreKey rejects', () => {
    const notCalculable = projectBundleScaleSource({
      slotKey: 'who5',
      expectedInstrumentKey: 'who5',
      expectedInstrumentVersion: '1.0.0',
      sourceResultHash: HASH_A,
      result: scaleResult({
        quality: { status: 'invalid', flags: ['score_not_calculable'] },
        scores: [
          {
            key: 'raw_total',
            type: 'total',
            label: 'Raw',
            direction: 'higher_is_better',
            canonical: true,
            displayPrecision: 0,
            value: null,
            range: { min: 0, max: 25 },
            expectedItems: ['i1'],
            answeredItems: [],
            status: 'not_calculable',
            prorated: false,
          },
        ],
        references: [
          {
            scoreKey: 'raw_total',
            status: 'available',
            referenceVersion: 'who5-ref-1',
            criterionBand: { key: 'should.be.stripped', label: 'X', minInclusive: 0, maxInclusive: 1 },
          },
        ],
      }),
    })
    expect(notCalculable.scores[0]).toEqual({
      scoreKey: 'raw_total',
      value: null,
      status: 'not_calculable',
      criterionBandKey: null,
    })

    const invalidWithCalculated = projectBundleScaleSource({
      slotKey: 'who5',
      expectedInstrumentKey: 'who5',
      expectedInstrumentVersion: '1.0.0',
      sourceResultHash: HASH_A,
      result: scaleResult({
        quality: { status: 'invalid', flags: ['score_not_calculable'] },
        scores: [
          {
            key: 'raw_total',
            type: 'total',
            label: 'Raw',
            direction: 'higher_is_better',
            canonical: true,
            displayPrecision: 0,
            value: null,
            range: { min: 0, max: 25 },
            expectedItems: ['i1'],
            answeredItems: [],
            status: 'not_calculable',
            prorated: false,
          },
          {
            key: 'percentage',
            type: 'dimension',
            label: 'Pct',
            direction: 'higher_is_better',
            canonical: false,
            displayPrecision: 0,
            value: 10,
            range: { min: 0, max: 100 },
            expectedItems: ['i1'],
            answeredItems: ['i1'],
            status: 'limited',
            prorated: false,
          },
        ],
      }),
    })
    expect(invalidWithCalculated.scores.every((row) => row.criterionBandKey === null)).toBe(true)

    // Duplicate scoreKey is rejected by authoritative parseScaleResultV2 (V3.2),
    // before the Bundle projector adds its own uniqueness guard.
    expect(() => projectBundleScaleSource({
      slotKey: 'who5',
      expectedInstrumentKey: 'who5',
      expectedInstrumentVersion: '1.0.0',
      sourceResultHash: HASH_A,
      result: scaleResult({
        scores: [
          {
            key: 'raw_total',
            type: 'total',
            label: 'Raw',
            direction: 'higher_is_better',
            canonical: true,
            displayPrecision: 0,
            value: 1,
            range: { min: 0, max: 25 },
            expectedItems: [],
            answeredItems: [],
            status: 'calculated',
            prorated: false,
          },
          {
            key: 'raw_total',
            type: 'total',
            label: 'Raw2',
            direction: 'higher_is_better',
            canonical: false,
            displayPrecision: 0,
            value: 2,
            range: { min: 0, max: 25 },
            expectedItems: [],
            answeredItems: [],
            status: 'calculated',
            prorated: false,
          },
        ],
      }),
    })).toThrow(/unique|score keys/i)

    expect(failCode(() => assertUniqueScaleSources([{
      slotKey: 'who5',
      instrumentKey: 'who5',
      instrumentVersion: '1.0.0',
      sourceResultHash: HASH_A,
      qualityState: 'interpretable',
      scores: [
        { scoreKey: 'raw_total', value: 1, status: 'calculated', criterionBandKey: null },
        { scoreKey: 'raw_total', value: 2, status: 'calculated', criterionBandKey: null },
      ],
    }]))).toBe('SOURCE_SCORE_KEY_DUPLICATE')
  })

  it('projects CognitiveResultSnapshot and derives hasReferenceNorms from frozen references only', () => {
    const withoutNorms = projectBundleCognitiveSource({
      slotKey: 'gonogo',
      expectedInstrumentKey: 'gonogo',
      expectedInstrumentVersion: '1.0.0',
      sourceResultHash: HASH_A,
      result: cognitiveResult(),
    })
    expect(withoutNorms.hasReferenceNorms).toBe(false)
    expect(withoutNorms.metrics).toEqual({ commissionRate: 0.12, dPrime: 2.1 })

    const withNorms = projectBundleCognitiveSource({
      slotKey: 'gonogo',
      expectedInstrumentKey: 'gonogo',
      expectedInstrumentVersion: '1.0.0',
      sourceResultHash: HASH_B,
      result: cognitiveResult({
        references: [{ status: 'available', referenceVersion: 'ref-1', metricKey: 'commissionRate' }],
      }),
    })
    expect(withNorms.hasReferenceNorms).toBe(true)

    const invalid = projectBundleCognitiveSource({
      slotKey: 'gonogo',
      expectedInstrumentKey: 'gonogo',
      expectedInstrumentVersion: '1.0.0',
      sourceResultHash: HASH_A,
      result: cognitiveResult({
        quality: { state: 'invalid', flags: {}, reasons: ['bad'] },
        references: [{ status: 'available', referenceVersion: 'ref-1' }],
      }),
    })
    expect(invalid.hasReferenceNorms).toBe(false)
  })

  it('fail-closes on duplicate slotKey / scoreKey / valueSelector', () => {
    const cognitive: BundleFrozenCognitiveSourceV1 = projectBundleCognitiveSource({
      slotKey: 'gonogo',
      expectedInstrumentKey: 'gonogo',
      expectedInstrumentVersion: '1.0.0',
      sourceResultHash: HASH_A,
      result: cognitiveResult(),
    })
    expect(failCode(() => assertUniqueCognitiveSources([cognitive, { ...cognitive }])))
      .toBe('SOURCE_SLOT_DUPLICATE')

    const scale: BundleFrozenScaleSourceV1 = projectBundleScaleSource({
      slotKey: 'who5',
      expectedInstrumentKey: 'who5',
      expectedInstrumentVersion: '1.0.0',
      sourceResultHash: HASH_A,
      result: scaleResult(),
    })
    expect(failCode(() => assertUniqueScaleSources([scale, { ...scale }])))
      .toBe('SOURCE_SLOT_DUPLICATE')
    expect(failCode(() => assertUniqueScaleSources([{
      ...scale,
      scores: [...scale.scores, { ...scale.scores[0] }],
    }]))).toBe('SOURCE_SCORE_KEY_DUPLICATE')

    expect(failCode(() => assertUniqueValueSelectors([
      { slotKey: 'who5', valueSelectors: ['raw_total', 'raw_total'] },
    ]))).toBe('SOURCE_VALUE_SELECTOR_DUPLICATE')
  })

  it('includes slot identity in projected Scale Evidence keys', () => {
    const source = projectBundleScaleSource({
      slotKey: 'who5',
      expectedInstrumentKey: 'who5',
      expectedInstrumentVersion: '1.0.0',
      sourceResultHash: HASH_A,
      result: scaleResult(),
    })
    const evidence = projectScaleEvidenceItems({
      source,
      scoreKeys: ['raw_total', 'percentage'],
      constructKeyPrefix: 'who5',
    })
    expect(evidence.map((item) => item.evidenceKey)).toEqual([
      'who5.who5.raw_total.primary',
      'who5.who5.percentage.primary',
    ])
  })
})
