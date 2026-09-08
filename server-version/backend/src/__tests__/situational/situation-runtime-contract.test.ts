import { describe, expect, it } from 'vitest'
import { compileSituationRuntime, parseCompiledInstrumentRuntime } from '../../modules/assessment-runtime/compiler'
import { createCanonicalUnitResultEnvelope, parseCanonicalUnitResultEnvelope, projectSituationCanonicalUnitResult } from '../../modules/assessment-runtime/unit-result'
import { scoreSituational, type SituationalResultV1 } from '../../modules/situational/situation-scoring'
import { SJT_ASSERTIVENESS_GOLDEN_ZH_CN_V1_PACKAGE } from '../../modules/situational/packages/sjt-assertiveness-golden-zh-cn-v1'
import { SJT_ANXIETY_GOLDEN_ZH_CN_V1_PACKAGE } from '../../modules/situational/packages/sjt-anxiety-golden-zh-cn-v1'
import { hashSituationDefinition, type SituationDefinitionV1 } from '../../modules/situational/situation-definition'

const compileAssertiveness = () => compileSituationRuntime({
  instrumentKey: SJT_ASSERTIVENESS_GOLDEN_ZH_CN_V1_PACKAGE.key,
  instrumentVersion: SJT_ASSERTIVENESS_GOLDEN_ZH_CN_V1_PACKAGE.instrumentVersion,
  definition: SJT_ASSERTIVENESS_GOLDEN_ZH_CN_V1_PACKAGE.definition,
})

const scoreAssertivenessAllStrong = (): SituationalResultV1 => scoreSituational(SJT_ASSERTIVENESS_GOLDEN_ZH_CN_V1_PACKAGE.definition, [
  { sceneKey: 'AS-01', channelKey: 'behavior', responseValue: 'A' },
  { sceneKey: 'AS-02', channelKey: 'behavior', responseValue: 'A' },
])

describe('compileSituationRuntime', () => {
  it('emits a hash-verified SITUATIONAL runtime with construct × channel projection keys', () => {
    const runtime = parseCompiledInstrumentRuntime(JSON.parse(JSON.stringify(compileAssertiveness())))
    expect(runtime.instrumentType).toBe('SITUATIONAL')
    expect(runtime.instrumentKey).toBe('sjt-assertiveness-golden')
    expect(runtime.scorerKey).toBe('situational.default')
    expect(runtime.scorerVersion).toBe('sjt-provisional-v1')
    expect(runtime.aggregateProjection.allowedMetricKeys).toEqual(['bfi2.assertiveness.behavior'])
    expect(runtime.aggregateProjection.allowedFactKeys).toEqual(['quality.status', 'quality.flag.*'])
    expect(runtime.aggregateProjection.allowedReferenceClassifications).toEqual([])
    expect(runtime.referenceBindingDefinition).toEqual({ required: false, selections: [] })
    // PR-B enables the standalone pilot only; embedded and aggregate paths
    // remain explicitly unavailable.
    expect(runtime.runtimeCapabilities).toEqual({
      standalone: true,
      embedded: false,
      aggregateEligible: false,
      collectionFacts: false,
      supported: true,
    })
    expect(runtime.compiledRuntimeHash).toMatch(/^[0-9a-f]{64}$/)
  })

  it('binds sourceDefinitionHash to the full definition content, not just identity', () => {
    const original = compileAssertiveness()
    expect(original.sourceDefinitionHash).toBe(hashSituationDefinition(SJT_ASSERTIVENESS_GOLDEN_ZH_CN_V1_PACKAGE.definition))

    const changed = JSON.parse(JSON.stringify(SJT_ASSERTIVENESS_GOLDEN_ZH_CN_V1_PACKAGE.definition)) as SituationDefinitionV1
    changed.scenes[0]!.channels[0]!.prompt = '改写后的题目措辞'
    const recompiled = compileSituationRuntime({
      instrumentKey: SJT_ASSERTIVENESS_GOLDEN_ZH_CN_V1_PACKAGE.key,
      instrumentVersion: SJT_ASSERTIVENESS_GOLDEN_ZH_CN_V1_PACKAGE.instrumentVersion,
      definition: changed,
    })
    expect(recompiled.sourceDefinitionHash).not.toBe(original.sourceDefinitionHash)
    expect(recompiled.sourceDefinitionHash).toBe(hashSituationDefinition(changed))
  })

  it('rejects malformed definitions', () => {
    const broken = JSON.parse(JSON.stringify(SJT_ASSERTIVENESS_GOLDEN_ZH_CN_V1_PACKAGE.definition)) as SituationDefinitionV1
    broken.scenes = []
    expect(() => compileSituationRuntime({
      instrumentKey: 'sjt-assertiveness-golden',
      instrumentVersion: '1.0.0',
      definition: broken,
    })).toThrow()
  })
})

describe('projectSituationCanonicalUnitResult', () => {
  it('projects construct × channel metrics and quality facts into the canonical core', () => {
    const runtime = compileAssertiveness()
    const core = projectSituationCanonicalUnitResult({
      result: scoreAssertivenessAllStrong(),
      runtime,
      contextHash: null,
    })
    expect(core.unitType).toBe('SITUATIONAL')
    expect(core.schemaVersion).toBe(1)
    expect(core.metrics).toEqual([{
      key: 'bfi2.assertiveness.behavior',
      value: 1.5,
      unit: 'score',
      quality: 'calculated',
    }])
    expect(core.quality).toEqual({ status: 'interpretable', flags: [] })
    expect(core.facts).toEqual([{ key: 'quality.status', value: 'interpretable' }])
    expect(core.references).toEqual([])
    expect(core.scorerVersion).toBe('sjt-provisional-v1')
    expect(core.scientificProvenance.instrumentKey).toBe('sjt-assertiveness-golden')
  })

  it('carries not_calculable metrics with null values and invalid quality', () => {
    const runtime = compileAssertiveness()
    const core = projectSituationCanonicalUnitResult({
      result: scoreSituational(SJT_ASSERTIVENESS_GOLDEN_ZH_CN_V1_PACKAGE.definition, [
        { sceneKey: 'AS-01', channelKey: 'behavior', responseValue: 'A' },
      ]),
      runtime,
      contextHash: null,
    })
    expect(core.metrics[0]?.value).toBeNull()
    expect(core.metrics[0]?.quality).toBe('not_calculable')
    expect(core.quality.status).toBe('invalid')
    expect(core.quality.flags).toEqual(['metric_not_calculable', 'missing_responses'])
  })

  it('refuses metrics outside the compiled projection whitelist and non-situational runtimes', () => {
    const runtime = compileAssertiveness()
    const rogue = scoreAssertivenessAllStrong()
    const definition = JSON.parse(JSON.stringify(SJT_ANXIETY_GOLDEN_ZH_CN_V1_PACKAGE.definition))
    const cognitiveShapedRuntime = { ...runtime, instrumentType: 'COGNITIVE' as const }
    expect(() => projectSituationCanonicalUnitResult({ result: rogue, runtime: cognitiveShapedRuntime, contextHash: null }))
      .toThrow('Situational canonical result requires a SITUATIONAL compiled runtime')

    const compiledAnxiety = compileSituationRuntime({
      instrumentKey: 'sjt-anxiety-golden',
      instrumentVersion: '1.0.0',
      definition,
    })
    expect(() => projectSituationCanonicalUnitResult({ result: rogue, runtime: compiledAnxiety, contextHash: null }))
      .toThrow('Situational metric bfi2.assertiveness.behavior is not declared by the compiled runtime')
  })

  it('round-trips through the canonical envelope with a matching resultHash', () => {
    const runtime = compileAssertiveness()
    const core = projectSituationCanonicalUnitResult({
      result: scoreAssertivenessAllStrong(),
      runtime,
      contextHash: 'a'.repeat(64),
    })
    const envelope = createCanonicalUnitResultEnvelope({
      core,
      completedAt: '2026-09-06T00:00:00.000Z',
      persistenceProvenance: { sourceType: 'ASSESSMENT', sourceAttemptId: 'attempt-1' },
    })
    const parsed = parseCanonicalUnitResultEnvelope(JSON.parse(JSON.stringify(envelope)))
    expect(parsed.core.unitType).toBe('SITUATIONAL')
    expect(parsed.resultHash).toBe(envelope.resultHash)
    expect(parsed.persistenceProvenance.sourceType).toBe('ASSESSMENT')
  })

  it('never carries raw scene responses in the canonical core (aggregate-safe only)', () => {
    const runtime = compileAssertiveness()
    const core = projectSituationCanonicalUnitResult({
      result: scoreAssertivenessAllStrong(),
      runtime,
      contextHash: null,
    })
    const serialized = JSON.stringify(core)
    expect(serialized).not.toContain('AS-01')
    expect(serialized).not.toContain('AS-02')
    expect(serialized).not.toContain('optionKey')
    expect(serialized).not.toContain('responseValue')
    expect(serialized).not.toContain('sceneKey')
  })
})
