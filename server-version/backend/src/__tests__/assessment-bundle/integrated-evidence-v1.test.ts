import { describe, expect, it } from 'vitest'
import {
  INTEGRATED_EVIDENCE_ENGINE_KEY,
  INTEGRATED_EVIDENCE_ENGINE_VERSION,
  INTEGRATED_GONOGO_ADEXI_ADULT_ZH_CN_V1,
  assertEvidenceRolesSafeForIntegrated,
  assertIntegratedAdultAge,
  createProductBundleAnalysisEngineRegistry,
  hashBundleContextDefinition,
  projectBundleCognitiveSource,
  projectBundleScaleSource,
  projectIntegratedEvidenceItems,
  type BundleContextDefinitionV1,
  type BundleEngineInputV1,
  type BundleFrozenCognitiveSourceV1,
  type BundleFrozenScaleSourceV1,
  type IntegratedEvidencePayloadV1,
} from '../../modules/assessment-bundle'
import { compileBundleRuntimeFromFrozenRead } from '../../modules/assessment-bundle/compile'
import { buildFrozenAssessmentBundleSnapshot } from '../../modules/assessment-bundle/snapshot'
import { HASH_A, HASH_B } from './fixtures'

const adultAgeContextDefinition: BundleContextDefinitionV1 = {
  schemaVersion: 1,
  contextDefinitionKey: 'integrated-adult-age-v1',
  contextDefinitionVersion: '1.0.0',
  fields: [
    { contextKey: 'subject_age_years', required: true, valueType: 'number' },
  ],
}

const cognitiveResult = (metrics: Record<string, unknown>) => ({
  schemaVersion: 1 as const,
  completedAt: '2026-09-02T12:00:00.000Z',
  testType: 'gonogo',
  configVersion: '1.0.0',
  engineVersion: '1.0.0',
  scoringVersion: '1.0.0',
  protocolSignature: HASH_A,
  profile: 'standard' as const,
  metrics,
  quality: { state: 'interpretable' as const, flags: {}, reasons: [] },
  references: [],
  report: {},
  assessmentContext: null,
})

const gonogoSource = (): BundleFrozenCognitiveSourceV1 => projectBundleCognitiveSource({
  slotKey: 'gonogo',
  expectedInstrumentKey: 'gonogo',
  expectedInstrumentVersion: '1.0.0',
  result: cognitiveResult({ commissionRate: 0.1, dPrime: 2.0 }),
})

const scaleResult = () => ({
  schemaVersion: 2 as const,
  instrument: {
    scaleId: 'scale-adexi',
    code: 'adexi_v1',
    name: 'ADEXI',
    instrumentVersion: '2.0.0',
  },
  method: {
    scaleId: 'scale-adexi',
    instrumentVersion: '2.0.0',
    scoringVersion: '2.0.0',
    reportVersion: '2.0.0',
    definitionHash: HASH_A,
    referenceVersions: [],
    assessmentContext: null,
  },
  quality: { status: 'interpretable' as const, flags: [] as Array<'missing_items' | 'insufficient_items' | 'score_not_calculable'> },
  itemScores: [],
  scores: [
    {
      key: 'working_memory',
      type: 'dimension' as const,
      label: 'WM',
      direction: 'higher_is_worse' as const,
      canonical: true,
      displayPrecision: 0,
      value: 20,
      range: { min: 9, max: 45 },
      expectedItems: ['ADEXI-01'],
      answeredItems: ['ADEXI-01'],
      status: 'calculated' as const,
      prorated: false,
    },
    {
      key: 'inhibition',
      type: 'dimension' as const,
      label: 'INH',
      direction: 'higher_is_worse' as const,
      canonical: true,
      displayPrecision: 0,
      value: 15,
      range: { min: 5, max: 25 },
      expectedItems: ['ADEXI-03'],
      answeredItems: ['ADEXI-03'],
      status: 'calculated' as const,
      prorated: false,
    },
  ],
  references: [],
  interpretations: [],
  caveats: [],
  disclaimer: 'fixture',
})

const adexiSource = (): BundleFrozenScaleSourceV1 => projectBundleScaleSource({
  slotKey: 'adexi',
  expectedInstrumentKey: 'adexi_v1',
  expectedInstrumentVersion: '2.0.0',
  result: scaleResult(),
})

const ageContext = (age: number | null) => {
  const definitionHash = hashBundleContextDefinition(adultAgeContextDefinition)
  if (age === null) {
    return {
      schemaVersion: 1 as const,
      contextDefinitionKey: 'integrated-adult-age-v1',
      contextDefinitionVersion: '1.0.0',
      contextDefinitionHash: definitionHash,
      frozenAt: '2026-09-02T12:00:00.000Z',
      contextSnapshotHash: HASH_B,
      facts: [
        { contextKey: 'subject_age_years', value: { state: 'missing' as const } },
      ],
    }
  }
  return {
    schemaVersion: 1 as const,
    contextDefinitionKey: 'integrated-adult-age-v1',
    contextDefinitionVersion: '1.0.0',
    contextDefinitionHash: definitionHash,
    frozenAt: '2026-09-02T12:00:00.000Z',
    contextSnapshotHash: HASH_B,
    facts: [
      {
        contextKey: 'subject_age_years',
        value: { state: 'present' as const, value: age },
      },
    ],
  }
}

const buildInput = (age: number | null, withSources = true): BundleEngineInputV1 => {
  const snapshot = buildFrozenAssessmentBundleSnapshot(
    INTEGRATED_GONOGO_ADEXI_ADULT_ZH_CN_V1,
    { contextDefinition: adultAgeContextDefinition },
  )
  const compiledRuntime = compileBundleRuntimeFromFrozenRead({
    family: 'ASSESSMENT_BUNDLE',
    snapshotVersion: 3,
    snapshot,
  })
  return {
    snapshot,
    compiledRuntime,
    evidence: [],
    contextFacts: ageContext(age),
    aggregateInputHash: HASH_A,
    cognitiveSources: withSources ? [gonogoSource()] : [],
    scaleSources: withSources ? [adexiSource()] : [],
  }
}

describe('integrated-evidence-v1 + adult gonogo-adexi bundle', () => {
  it('registers on product bootstrap and defines adult 18+ population', () => {
    const registry = createProductBundleAnalysisEngineRegistry()
    expect(() => registry.resolve(INTEGRATED_EVIDENCE_ENGINE_KEY, INTEGRATED_EVIDENCE_ENGINE_VERSION)).not.toThrow()
    expect(INTEGRATED_GONOGO_ADEXI_ADULT_ZH_CN_V1.population.subjectPopulation).toBe('adult')
    expect(INTEGRATED_GONOGO_ADEXI_ADULT_ZH_CN_V1.population.subjectMinAgeYears).toBe(18)
    expect(INTEGRATED_GONOGO_ADEXI_ADULT_ZH_CN_V1.engine.key).toBe(INTEGRATED_EVIDENCE_ENGINE_KEY)
  })

  it('rejects subject age below 18', () => {
    expect(assertIntegratedAdultAge(17).ok).toBe(false)
    expect(assertIntegratedAdultAge(null).ok).toBe(false)
    expect(assertIntegratedAdultAge(18).ok).toBe(true)

    const registry = createProductBundleAnalysisEngineRegistry()
    const underage = registry.dispatch(buildInput(16))
    expect(underage.kind).toBe('UNAVAILABLE')
    if (underage.kind === 'UNAVAILABLE') {
      expect(underage.reason).toMatch(/age/i)
    }
  })

  it('emits complementary descriptive payload without convergence claims', () => {
    const registry = createProductBundleAnalysisEngineRegistry()
    const result = registry.dispatch(buildInput(22))
    expect(result.kind).toBe('COMPUTED')
    if (result.kind !== 'COMPUTED') return
    const payload = result.payload as IntegratedEvidencePayloadV1
    expect(payload.status).toBe('complementary_descriptive')
    expect(payload.claimsConvergence).toBe(false)
    expect(payload.claimsDivergence).toBe(false)
    expect(payload.claimsAbnormality).toBe(false)
    expect(payload.claimsDiagnosis).toBe(false)
    expect(payload.methods.some((row) => row.method === 'cognitive_gonogo')).toBe(true)
    expect(payload.methods.some((row) => row.method === 'scale_adexi')).toBe(true)

    const evidence = projectIntegratedEvidenceItems(payload, { gonogo: HASH_A, adexi: HASH_B })
    expect(() => assertEvidenceRolesSafeForIntegrated(evidence)).not.toThrow()
    expect(evidence.every((row) => row.role === 'PRIMARY' || row.role === 'SUPPORTING')).toBe(true)
    expect(evidence.some((row) => (row.role as string) === 'CONVERGENT')).toBe(false)
  })

  it('reports missing sources when units absent', () => {
    const registry = createProductBundleAnalysisEngineRegistry()
    const result = registry.dispatch(buildInput(25, false))
    expect(result.kind).toBe('COMPUTED')
    if (result.kind !== 'COMPUTED') return
    const payload = result.payload as IntegratedEvidencePayloadV1
    expect(payload.status).toBe('missing_sources')
  })
})
