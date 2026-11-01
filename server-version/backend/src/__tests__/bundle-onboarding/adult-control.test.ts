import path from 'node:path'
import { beforeAll, describe, expect, it } from 'vitest'
import smoke from '../../modules/assessment-bundle/ci-fixtures/integrated_gonogo_adexi_adult_zh_cn_v1/1.1.0.json'
import { loadPackage } from '../../modules/assessment-bundle/onboarding/loader'
import { dependencyBlockers } from '../../modules/assessment-bundle/onboarding/dependencies'
import { verifyPackageFixtures } from '../../modules/assessment-bundle/onboarding/fixtures'
import { mapDeclarativeEvidence, runDeclarativeEvidence } from '../../modules/assessment-bundle/onboarding/engine'
import { buildBundleContextFactsFromValues, parseBundleContextDefinition } from '../../modules/assessment-bundle/context'
import { buildFrozenAssessmentBundleSnapshot } from '../../modules/assessment-bundle/snapshot'
import { compileBundleRuntimeFromFrozenRead } from '../../modules/assessment-bundle/compile'
import { createProductBundleAnalysisEngineRegistry } from '../../modules/assessment-bundle/bootstrap'
import { projectBundleReportFacts, projectBundleAudienceView } from '../../modules/assessment-bundle/report-facts'
import type { BundleEngineInputV1 } from '../../modules/assessment-bundle/registry'
import { getExecutableScalePackage } from '../../modules/scale/onboarding/executable-registry'
import { scoreScale } from '../../modules/scale/scale-scoring'
import { cognitiveSeeds } from '../../modules/cognitive/generated/seeds'
import { requireCognitiveRegistryEntry } from '../../modules/cognitive/cognitive.registry'
import { canonicalHash } from '../../modules/assessment-runtime/canonical'
import { packageEntry } from '../../modules/assessment-bundle/onboarding/catalog'
import { freezeBundleProductionDefinition, readFrozenBundleProductionDefinition, BundleDefinitionProvider } from '../../modules/bundle-product/definition-provider'
import { INTEGRATED_GONOGO_ADEXI_ADULT_ZH_CN_V1 } from '../../modules/assessment-bundle/bundles/integrated-gonogo-adexi-adult-zh-cn-v1'

const pack = loadPackage(path.resolve(__dirname, '../../modules/assessment-bundle/packages/integrated_gonogo_adexi_adult_zh_cn_v1/1.1.0'))
let original: BundleEngineInputV1
beforeAll(() => {
  const context = parseBundleContextDefinition(pack.context)
  const snapshot = buildFrozenAssessmentBundleSnapshot(pack.manifest.definition, { contextDefinition: context })
  const cognitiveSources = pack.manifest.cognitiveDependencies.map(dep => {
    const slot = pack.manifest.definition.slots.find(s => s.slotKey === dep.slotKey)!
    const entry = requireCognitiveRegistryEntry(slot.instrumentKey, dep.engineVersion, dep.scoringVersion)
    const seed = cognitiveSeeds.find(s => s.testType === slot.instrumentKey && s.configVersion === dep.configVersion)!
    const fixture = smoke.slots[slot.slotKey as 'gonogo' | 'cpt']
    if (fixture.type !== 'COGNITIVE') throw new Error('COGNITIVE_FIXTURE_REQUIRED')
    const trials = fixture.trials as Array<{ trialIndex: number; payload: unknown }>
    const result = entry.score({ config: entry.configSchema.parse(seed.config), trials, randomSeed: smoke.randomSeed })
    expect(result.qualityFlags.interpretable).toBe(true)
    return { slotKey: slot.slotKey, instrumentKey: slot.instrumentKey, instrumentVersion: slot.instrumentVersion,
      sourceResultHash: canonicalHash(result), envelopeResultHash: null, metrics: result.metrics,
      qualityState: 'interpretable' as const, hasReferenceNorms: false }
  })
  const adexi = smoke.slots.adexi
  if (adexi.type !== 'SCALE') throw new Error('SCALE_FIXTURE_REQUIRED')
  const result = scoreScale(getExecutableScalePackage('adexi_v1', '2.0.0')!.definition, adexi.answers)
  original = { snapshot, compiledRuntime: compileBundleRuntimeFromFrozenRead({ family: 'ASSESSMENT_BUNDLE', snapshotVersion: 3, snapshot }),
    aggregateInputHash: null, declarativePackage: pack, evidence: [], cognitiveSources,
    scaleSources: [{ slotKey: 'adexi', instrumentKey: 'adexi_v1', instrumentVersion: '2.0.0', sourceResultHash: canonicalHash(result), envelopeResultHash: null,
      qualityState: result.quality.status, scores: result.scores.map(s => ({ scoreKey: s.key, value: s.value, status: s.status, criterionBandKey: null })) }],
    contextFacts: buildBundleContextFactsFromValues({ definition: context, values: smoke.context, frozenAt: '2026-11-01T00:00:00Z' }) }
  original.evidence = mapDeclarativeEvidence(original)
})
const rules = (input: BundleEngineInputV1) => {
  const result = runDeclarativeEvidence(input)
  return result.kind === 'COMPUTED' ? (result.payload as { conclusions: Array<{ ruleId: string }> }).conclusions.map(c => c.ruleId) : []
}

describe('adult cognitive-control descriptive package', () => {
  it('reuses exact executable sources, integer count units and four synthetic states', () => {
    expect(dependencyBlockers(pack)).toEqual([])
    expect(verifyPackageFixtures(pack)).toHaveLength(4)
    const wrong = structuredClone(pack)
    wrong.evidence.find(e => e.selector === 'nogoTrialCount')!.valueType = 'string'
    wrong.evidence.find(e => e.selector === 'nogoTrialCount')!.direction = 'neutral'
    expect(dependencyBlockers(wrong).join()).toContain('COGNITIVE selector/type/unit mismatch')
  })
  it('scores real seed-bound task sequences and ADEXI sums without a combined ability score', () => {
    expect(original.cognitiveSources![0].metrics).toMatchObject({ commissionErrors: 6, nogoTrialCount: 30, commissionRate: .2, goTrialCount: 90 })
    expect(original.cognitiveSources![1].metrics).toMatchObject({ targetCount: 36, hitCount: 31, omissionRate: 5 / 36 })
    expect(original.scaleSources![0].scores).toEqual(expect.arrayContaining([expect.objectContaining({ scoreKey: 'working_memory', value: 23 }), expect.objectContaining({ scoreKey: 'inhibition', value: 17 })]))
    expect(rules(original).sort()).toEqual([...smoke.expectedRuleIds].sort())
    expect(pack.manifest.definition.slots.map(s => s.instrumentKey)).toEqual(['gonogo', 'cpt', 'adexi_v1', 'integrated-adult-age-v1'])
    expect(Object.keys(runDeclarativeEvidence(original))).toEqual(['kind', 'payload'])
  })
  it.each([17, 101])('rejects age %s and also abstains on missing age', age => {
    const input = structuredClone(original)
    input.evidence.find(e => e.evidenceKey === 'context.age')!.value = { state: 'present', value: age }
    expect(runDeclarativeEvidence(input).kind).toBe('UNAVAILABLE')
    input.evidence.find(e => e.evidenceKey === 'context.age')!.value = { state: 'missing' }
    expect(runDeclarativeEvidence(input).kind).toBe('UNAVAILABLE')
  })
  it.each([18, 100])('allows the explicit adult product boundary at %s', age => {
    const input = structuredClone(original)
    input.evidence.find(e => e.evidenceKey === 'context.age')!.value = { state: 'present', value: age }
    expect(rules(input)).toContain('complementary')
  })
  it('distinguishes zero from null and refuses joint claims for invalid or limited evidence', () => {
    const input = structuredClone(original), cpt = input.cognitiveSources![1]
    cpt.metrics.omissionRate = 0; input.evidence = mapDeclarativeEvidence(input)
    expect(rules(input)).toContain('complementary')
    cpt.metrics.omissionRate = null; input.evidence = mapDeclarativeEvidence(input)
    expect(rules(input)).not.toContain('complementary')
    expect(rules(input)).toContain('unavailable_cpt_omission_rate')
    cpt.metrics.omissionRate = .1
    for (const quality of ['invalid', 'limited'] as const) {
      cpt.qualityState = quality; input.evidence = mapDeclarativeEvidence(input)
      expect(rules(input)).not.toContain('complementary')
      expect(rules(input)).toContain('daily_observation')
    }
  })
  it('keeps source identities exact and projects saved facts with all age values redacted', () => {
    const input = structuredClone(original)
    input.cognitiveSources![1].instrumentVersion = '9.9.9'
    expect(() => mapDeclarativeEvidence(input)).toThrow('DECLARATIVE_SOURCE_IDENTITY_MISMATCH:cpt')
    const facts = projectBundleReportFacts({ registry: createProductBundleAnalysisEngineRegistry(), engineInput: original })
    for (const audience of ['student', 'parent', 'teacher', 'admin'] as const) {
      const view = projectBundleAudienceView(facts, audience)
      expect(view.evidence.find(e => e.sourceKind === 'CONTEXT_FACT')!.value).toEqual({ state: 'redacted' })
      expect(view.rawAnswers).toBeNull()
      expect(view.evidence.find(e => e.constructKey === 'adexi_v1.inhibition_sum')!.value).toMatchObject({ state: 'present', value: 17, unit: 'points' })
    }
  })
  it('preserves the old two-tool definition and freezes the new report without live-catalog reads', () => {
    expect(INTEGRATED_GONOGO_ADEXI_ADULT_ZH_CN_V1.bundleVersion).toBe('1.0.0')
    expect(INTEGRATED_GONOGO_ADEXI_ADULT_ZH_CN_V1.slots).toHaveLength(2)
    const provider = new BundleDefinitionProvider([packageEntry(pack)])
    expect(provider.publicationBlockers(pack.manifest.definition.bundleKey, '1.1.0')).toEqual(['BUNDLE_NOT_PUBLISHED'])
    const frozen = freezeBundleProductionDefinition(packageEntry(pack), { frozenAt: '2026-11-01T00:00:00Z', sourceReference: 'synthetic-test' })
    const before = readFrozenBundleProductionDefinition(frozen)
    const changed = structuredClone(pack); changed.rules.items[0].text = 'future report wording'
    expect(readFrozenBundleProductionDefinition(frozen)).toEqual(before)
    expect(before.declarativePackage!.rules.items[0].text).not.toBe(changed.rules.items[0].text)
  })
})
