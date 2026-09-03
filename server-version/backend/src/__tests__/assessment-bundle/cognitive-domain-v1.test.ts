import { describe, expect, it } from 'vitest'
import { BundleContractError } from '../../modules/assessment-bundle/errors'
import {
  COGNITIVE_DOMAIN_ENGINE_KEY,
  COGNITIVE_DOMAIN_ENGINE_VERSION,
  COGNITIVE_RESPONSE_INHIBITION_V1,
  createProductBundleAnalysisEngineRegistry,
  createBundleAnalysisEngineRegistry,
  projectBundleCognitiveSource,
  type BundleEngineInputV1,
  type BundleFrozenCognitiveSourceV1,
  type CognitiveDomainPayloadV1,
} from '../../modules/assessment-bundle'
import { compileBundleRuntimeFromFrozenRead } from '../../modules/assessment-bundle/compile'
import { buildFrozenAssessmentBundleSnapshot } from '../../modules/assessment-bundle/snapshot'
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

const cognitiveResult = (input: {
  testType: string
  configVersion?: string
  metrics: Record<string, unknown>
  references?: Array<Record<string, unknown>>
  qualityState?: 'interpretable' | 'limited' | 'invalid'
}) => ({
  schemaVersion: 1 as const,
  completedAt: '2026-09-02T12:00:00.000Z',
  testType: input.testType,
  configVersion: input.configVersion ?? '1.0.0',
  engineVersion: '1.0.0',
  scoringVersion: '1.0.0',
  protocolSignature: HASH_A,
  profile: 'standard' as const,
  metrics: input.metrics,
  quality: {
    state: input.qualityState ?? 'interpretable' as const,
    flags: {},
    reasons: [],
  },
  references: input.references ?? [],
  report: {},
  assessmentContext: null,
})

const gonogoSource = (
  overrides: {
    sourceResultHash?: string
    metrics?: Record<string, unknown>
    configVersion?: string
    references?: Array<Record<string, unknown>>
  } = {},
): BundleFrozenCognitiveSourceV1 => projectBundleCognitiveSource({
  slotKey: 'gonogo',
  expectedInstrumentKey: 'gonogo',
  expectedInstrumentVersion: overrides.configVersion ?? '1.0.0',
  sourceResultHash: overrides.sourceResultHash ?? HASH_A,
  result: cognitiveResult({
    testType: 'gonogo',
    configVersion: overrides.configVersion ?? '1.0.0',
    metrics: overrides.metrics ?? { commissionRate: 0.12, dPrime: 2.1 },
    references: overrides.references,
  }),
})

const sstSource = (
  overrides: {
    sourceResultHash?: string
    metrics?: Record<string, unknown>
    configVersion?: string
    references?: Array<Record<string, unknown>>
  } = {},
): BundleFrozenCognitiveSourceV1 => projectBundleCognitiveSource({
  slotKey: 'sst',
  expectedInstrumentKey: 'sst',
  expectedInstrumentVersion: overrides.configVersion ?? '1.0.0',
  sourceResultHash: overrides.sourceResultHash ?? HASH_B,
  result: cognitiveResult({
    testType: 'sst',
    configVersion: overrides.configVersion ?? '1.0.0',
    metrics: overrides.metrics ?? { ssrtMs: 210 },
    references: overrides.references,
  }),
})

const buildInput = (
  cognitiveSources: BundleFrozenCognitiveSourceV1[],
): BundleEngineInputV1 => {
  const snapshot = buildFrozenAssessmentBundleSnapshot(COGNITIVE_RESPONSE_INHIBITION_V1)
  const compiledRuntime = compileBundleRuntimeFromFrozenRead({
    family: 'ASSESSMENT_BUNDLE',
    snapshotVersion: 3,
    snapshot,
  })
  return {
    snapshot,
    compiledRuntime,
    evidence: [],
    contextFacts: null,
    aggregateInputHash: null,
    cognitiveSources,
  }
}

describe('cognitive-domain-v1 + cognitive_response_inhibition_v1', () => {
  it('defines the Go/No-Go + SST cognitive-only bundle without a total score path', () => {
    expect(COGNITIVE_RESPONSE_INHIBITION_V1).toMatchObject({
      bundleKey: 'cognitive_response_inhibition_v1',
      category: 'cognitive',
      engine: { key: COGNITIVE_DOMAIN_ENGINE_KEY, version: COGNITIVE_DOMAIN_ENGINE_VERSION },
    })
    expect(COGNITIVE_RESPONSE_INHIBITION_V1.slots.map((slot) => slot.instrumentKey))
      .toEqual(['gonogo', 'sst'])
    expect(COGNITIVE_RESPONSE_INHIBITION_V1.slots.every((slot) => slot.unitType === 'COGNITIVE')).toBe(true)
  })

  it('computes a descriptive domain profile on the happy path via projectors', () => {
    const registry = createProductBundleAnalysisEngineRegistry()
    const result = registry.dispatch(buildInput([gonogoSource(), sstSource()]))
    expect(result.kind).toBe('COMPUTED')
    const payload = result.payload as CognitiveDomainPayloadV1
    expect(payload).toMatchObject({
      schema: 'cognitive-domain-payload-v1',
      domainKey: 'response_inhibition',
      totalScore: null,
      abnormalityClassified: false,
      status: 'descriptive_only',
    })
    expect(payload.facets.map((facet) => facet.metricKey).sort())
      .toEqual(['commissionRate', 'dPrime', 'ssrtMs'])
    expect(payload.slotAssessments.every((slot) => slot.status === 'present')).toBe(true)
  })

  it('marks missing sources / version mismatch as limited or invalid', () => {
    const registry = createProductBundleAnalysisEngineRegistry()
    const missing = registry.dispatch(buildInput([gonogoSource()]))
    expect(missing.kind).toBe('COMPUTED')
    const missingPayload = missing.payload as CognitiveDomainPayloadV1
    expect(missingPayload.slotAssessments.find((slot) => slot.slotKey === 'sst')?.status).toBe('missing')
    expect(missingPayload.status).toBe('insufficient_quality')

    // Projector binds identity to the authoritative frozen result.
    expect(failCode(() => projectBundleCognitiveSource({
      slotKey: 'gonogo',
      expectedInstrumentKey: 'gonogo',
      expectedInstrumentVersion: '1.0.0',
      sourceResultHash: HASH_A,
      result: cognitiveResult({
        testType: 'gonogo',
        configVersion: '9.9.9',
        metrics: { commissionRate: 0.12 },
      }),
    }))).toBe('SOURCE_IDENTITY_MISMATCH')

    const mismatchedHand = {
      ...gonogoSource(),
      instrumentVersion: '9.9.9',
    }
    const mismatched = registry.dispatch(buildInput([mismatchedHand, sstSource()]))
    const mismatchedPayload = mismatched.payload as CognitiveDomainPayloadV1
    expect(mismatchedPayload.slotAssessments.find((slot) => slot.slotKey === 'gonogo')?.status)
      .toBe('version_mismatch')
    expect(mismatchedPayload.slotAssessments.find((slot) => slot.slotKey === 'gonogo')?.quality)
      .toBe('invalid')
  })

  it('never classifies abnormality without reference norms derived from frozen references', () => {
    const registry = createProductBundleAnalysisEngineRegistry()
    const result = registry.dispatch(buildInput([
      gonogoSource({ metrics: { commissionRate: 0.9, dPrime: 0.1 } }),
      sstSource({ metrics: { ssrtMs: 500 } }),
    ]))
    const payload = result.payload as CognitiveDomainPayloadV1
    expect(payload.abnormalityClassified).toBe(false)
    expect(payload.classifications.every((row) => row.kind === 'descriptive')).toBe(true)
    expect(payload.limitations.some((text) => text.includes('不得将结果分类为异常'))).toBe(true)
    expect(JSON.stringify(payload.classifications)).not.toMatch(/impaired|clinical_cut/i)
    // Bare boolean cannot invent norms: projector left hasReferenceNorms false.
    expect(gonogoSource().hasReferenceNorms).toBe(false)
  })

  it('still rejects unknown engine/version via the registry', () => {
    const registry = createProductBundleAnalysisEngineRegistry()
    expect(failCode(() => registry.resolve('cognitive-domain-v1', '9.9.9'))).toBe('UNKNOWN_ENGINE_VERSION')
    expect(failCode(() => registry.resolve('no-such-engine-v1', '1.0.0'))).toBe('UNKNOWN_ENGINE_KEY')
    const bare = createBundleAnalysisEngineRegistry()
    expect(failCode(() => bare.resolve(COGNITIVE_DOMAIN_ENGINE_KEY, COGNITIVE_DOMAIN_ENGINE_VERSION)))
      .toBe('UNKNOWN_ENGINE_KEY')
  })

  it('fail-closes when duplicate cognitive slot sources are supplied', () => {
    const registry = createProductBundleAnalysisEngineRegistry()
    expect(failCode(() => registry.dispatch(buildInput([gonogoSource(), gonogoSource(), sstSource()]))))
      .toBe('SOURCE_SLOT_DUPLICATE')
  })
})
