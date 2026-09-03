import { describe, expect, it } from 'vitest'
import {
  WELLBEING_WHO5_YOUTH_SELF_ZH_CN_V1,
  createProductBundleAnalysisEngineRegistry,
  projectBundleScaleSource,
  projectScaleEvidenceItems,
  selectScaleScores,
  validateEvidenceSource,
  type BundleEngineInputV1,
  type BundleFrozenScaleSourceV1,
  type EvidenceSourceV1,
  type ScaleEvidencePayloadV1,
} from '../../modules/assessment-bundle'
import { BundleContractError } from '../../modules/assessment-bundle/errors'
import { compileBundleRuntimeFromFrozenRead } from '../../modules/assessment-bundle/compile'
import { buildFrozenAssessmentBundleSnapshot } from '../../modules/assessment-bundle/snapshot'
import { observerBundle, HASH_A } from './fixtures'

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
    ...(overrides.instrument as object | undefined),
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
        label: 'Descriptive band label must be ignored',
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

const who5Source = (
  overrides: {
    sourceResultHash?: string
    expectedInstrumentVersion?: string
    resultOverrides?: Record<string, unknown>
  } = {},
): BundleFrozenScaleSourceV1 => projectBundleScaleSource({
  slotKey: 'who5',
  expectedInstrumentKey: 'who5',
  expectedInstrumentVersion: overrides.expectedInstrumentVersion ?? '1.0.0',
  sourceResultHash: overrides.sourceResultHash ?? HASH_A,
  result: scaleResult(overrides.resultOverrides),
})

const buildWho5Input = (
  scaleSources: BundleFrozenScaleSourceV1[],
): BundleEngineInputV1 => {
  const snapshot = buildFrozenAssessmentBundleSnapshot(WELLBEING_WHO5_YOUTH_SELF_ZH_CN_V1)
  return {
    snapshot,
    compiledRuntime: compileBundleRuntimeFromFrozenRead({
      family: 'ASSESSMENT_BUNDLE',
      snapshotVersion: 3,
      snapshot,
    }),
    evidence: [],
    contextFacts: null,
    aggregateInputHash: null,
    scaleSources,
  }
}

describe('scale-evidence-v1 + multi-score Scale selectors', () => {
  it('defines WHO-5 stub with multiple scoreKey selectors and no fabricated items', () => {
    expect(WELLBEING_WHO5_YOUTH_SELF_ZH_CN_V1).toMatchObject({
      bundleKey: 'wellbeing_who5_youth_self_zh_cn_v1',
      category: 'scale_self',
      engine: { key: 'scale-evidence-v1', version: '1.0.0' },
      publicationRequirements: { nonCommercialOnly: true },
    })
    expect(WELLBEING_WHO5_YOUTH_SELF_ZH_CN_V1.slots[0].valueSelectors)
      .toEqual(['raw_total', 'percentage'])
    expect(WELLBEING_WHO5_YOUTH_SELF_ZH_CN_V1.limitations.some((text) => text.includes('commit 10')))
      .toBe(true)
    expect(JSON.stringify(WELLBEING_WHO5_YOUTH_SELF_ZH_CN_V1)).not.toMatch(/itemText|items\s*:/)
  })

  it('selects multiple scoreKeys from one Scale administration without copying ScaleResultV2', () => {
    const source = who5Source()
    const selected = selectScaleScores(source, ['raw_total', 'percentage'])
    expect(selected).toHaveLength(2)
    expect(selected.map((row) => row.scoreKey)).toEqual(['raw_total', 'percentage'])
    expect(selected[1].criterionBandKey).toBe('who5.percentage.descriptive')

    const evidence = projectScaleEvidenceItems({
      source,
      scoreKeys: ['raw_total', 'percentage'],
      constructKeyPrefix: 'who5',
    })
    expect(evidence).toHaveLength(2)
    expect(evidence.every((item) => item.source.kind === 'SCALE_SCORE')).toBe(true)
    expect(evidence.map((item) => item.evidenceKey)).toEqual([
      'who5.who5.raw_total.primary',
      'who5.who5.percentage.primary',
    ])
    expect(JSON.stringify(evidence)).not.toMatch(/itemScores|interpretations|disclaimer|ScaleResultV2/)

    expect(observerBundle().slots[0].valueSelectors).toEqual(['total', 'emotional'])
  })

  it('computes strictly descriptive scale evidence and reads only criterionBand.key', () => {
    const registry = createProductBundleAnalysisEngineRegistry()
    const result = registry.dispatch(buildWho5Input([who5Source()]))
    expect(result.kind).toBe('COMPUTED')
    const payload = result.payload as ScaleEvidencePayloadV1
    expect(payload.reportingMode).toBe('strictly_descriptive')
    expect(payload.scores).toHaveLength(2)
    expect(payload.scores.every((score) => score.classifiedFromLabel === false)).toBe(true)
    expect(payload.scores.find((score) => score.scoreKey === 'percentage')?.criterionBandKey)
      .toBe('who5.percentage.descriptive')
    expect(payload.scores.find((score) => score.scoreKey === 'raw_total')?.criterionBandKey)
      .toBeNull()
    expect(JSON.stringify(payload.scores)).not.toMatch(/"label"|displayLabel/)
  })

  it('still rejects mixed metricKey/scoreKey on Evidence source union', () => {
    expect(failCode(() => validateEvidenceSource({
      kind: 'SCALE_SCORE',
      slotKey: 'who5',
      scoreKey: 'raw_total',
      metricKey: 'commissionRate',
      sourceResultHash: HASH_A,
    } as EvidenceSourceV1))).toBe('EVIDENCE_SOURCE_SHAPE')
    expect(failCode(() => validateEvidenceSource({
      kind: 'COGNITIVE_METRIC',
      slotKey: 'gonogo',
      metricKey: 'commissionRate',
      scoreKey: 'raw_total',
      sourceResultHash: HASH_A,
    } as EvidenceSourceV1))).toBe('EVIDENCE_SOURCE_SHAPE')
  })

  it('marks missing / mismatched scale sources without inventing bands from labels', () => {
    const registry = createProductBundleAnalysisEngineRegistry()
    const missing = registry.dispatch(buildWho5Input([]))
    const missingPayload = missing.payload as ScaleEvidencePayloadV1
    expect(missingPayload.slotAssessments[0]?.status).toBe('missing')
    expect(missingPayload.scores).toHaveLength(0)

    expect(failCode(() => who5Source({
      expectedInstrumentVersion: '2.0.0',
    }))).toBe('SOURCE_IDENTITY_MISMATCH')

    const mismatchedHand: BundleFrozenScaleSourceV1 = {
      ...who5Source(),
      instrumentVersion: '2.0.0',
    }
    const mismatched = registry.dispatch(buildWho5Input([mismatchedHand]))
    const mismatchedPayload = mismatched.payload as ScaleEvidencePayloadV1
    expect(mismatchedPayload.slotAssessments[0]?.status).toBe('version_mismatch')
  })

  it('fail-closes on duplicate scale slot sources', () => {
    const registry = createProductBundleAnalysisEngineRegistry()
    expect(failCode(() => registry.dispatch(buildWho5Input([who5Source(), who5Source()]))))
      .toBe('SOURCE_SLOT_DUPLICATE')
  })
})
