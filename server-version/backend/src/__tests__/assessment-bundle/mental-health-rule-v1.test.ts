import { describe, expect, it } from 'vitest'
import { BundleContractError } from '../../modules/assessment-bundle/errors'
import {
  MENTAL_HEALTH_RULE_ENGINE_KEY,
  MENTAL_HEALTH_RULE_ENGINE_VERSION,
  createProductBundleAnalysisEngineRegistry,
  projectBundleScaleSource,
  projectScaleEvidenceItems,
  type AssessmentBundleDefinitionV1,
  type BundleEngineInputV1,
  type EvidenceItemV1,
  type MentalHealthRulePayloadV1,
  type MentalHealthRuleSetV1,
} from '../../modules/assessment-bundle'
import { validateAssessmentBundleDefinition } from '../../modules/assessment-bundle/definition'
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

const demoBundle = (
  overrides: Partial<AssessmentBundleDefinitionV1> = {},
): AssessmentBundleDefinitionV1 => validateAssessmentBundleDefinition({
  schemaVersion: 1,
  bundleKey: 'demo_mental_health_rule_fixture_v1',
  bundleVersion: '1.0.0',
  status: 'DRAFT',
  category: 'scale_self',
  name: 'MH rule fixture (not a published SCARED/RCADS pack)',
  description: 'Test-only fixture for mental-health-rule-v1; not a first-party product.',
  respondentTypes: ['SELF'],
  initiationModes: ['TEACHER_ASSIGNMENT'],
  population: { subjectPopulation: 'youth', subjectMinAgeYears: 9, subjectMaxAgeYears: 18 },
  slots: [
    {
      slotKey: 'who5',
      unitType: 'SCALE',
      position: 0,
      required: true,
      instrumentKey: 'who5',
      instrumentVersion: '1.0.0',
      respondentType: 'SELF',
      valueSelectors: ['percentage'],
    },
    {
      slotKey: 'sdq',
      unitType: 'SCALE',
      position: 1,
      required: true,
      instrumentKey: 'sdq',
      instrumentVersion: '1.0.0',
      respondentType: 'SELF',
      valueSelectors: ['total'],
    },
  ],
  engine: {
    key: MENTAL_HEALTH_RULE_ENGINE_KEY,
    version: MENTAL_HEALTH_RULE_ENGINE_VERSION,
  },
  contextDefinitionKey: null,
  contextDefinitionVersion: null,
  reportDefinitionKey: 'mental-health-rule-report-v1',
  reportDefinitionVersion: '1.0.0',
  publicationRequirements: {
    scientificGate: true,
    rightsGate: true,
    languageGate: true,
    reportGate: true,
    safetyGate: false,
    nonCommercialOnly: true,
  },
  rightsRequirements: { required: true, instrumentKeys: ['who5', 'sdq'] },
  safetyCapability: { safetyCapable: false, productionTriggerEnabled: false },
  limitations: [
    'test fixture only',
    'do not treat low scores as crisis',
    'not SCARED/RCADS',
  ],
  ...overrides,
})

const ruleSet = (): MentalHealthRuleSetV1 => ({
  ruleSetKey: 'DemoMentalHealthRuleSetV1',
  ruleSetVersion: '1.0.0',
  feedbackVersion: '1.0.0',
  coreRules: [
    {
      ruleId: 'core.low_concern',
      ruleVersion: '1.0.0',
      requiredEvidence: [
        { evidenceKey: 'who5.who5.percentage.primary', criterionBandKey: 'who5.percentage.adequate' },
        { evidenceKey: 'sdq.sdq.total.primary', criterionBandKey: 'sdq.total.normal' },
      ],
      outcomeCode: 'LOW_CONCERN',
      actionTier: 'NONE',
      feedbackBlockKey: 'feedback.low_concern',
    },
    {
      ruleId: 'core.consistent',
      ruleVersion: '1.0.0',
      requiredEvidence: [
        { evidenceKey: 'who5.who5.percentage.primary', criterionBandKey: 'who5.percentage.low' },
        { evidenceKey: 'sdq.sdq.total.primary', criterionBandKey: 'sdq.total.borderline' },
      ],
      outcomeCode: 'CONSISTENT_SIGNAL',
      actionTier: 'DISCUSS',
      feedbackBlockKey: 'feedback.consistent',
    },
  ],
  facetRules: [
    {
      ruleId: 'facet.who5',
      ruleVersion: '1.0.0',
      tier: 'FACET',
      evidenceKey: 'who5.who5.percentage.primary',
      feedbackBlockKey: 'feedback.facet.who5',
    },
  ],
  contextRules: [],
  safetyRules: [
    {
      ruleId: 'safety.explicit',
      ruleVersion: '1.0.0',
      evidenceKey: 'safety.marker.primary',
      triggerBandKeys: ['safety.present'],
      feedbackBlockKey: 'feedback.safety',
    },
  ],
  feedbackBlocks: [
    { key: 'feedback.low_concern', version: '1.0.0', text: '未显示需要进一步关注的明确共同信号。' },
    { key: 'feedback.consistent', version: '1.0.0', text: '多个预先指定来源呈现一致信号。' },
    { key: 'feedback.facet.who5', version: '1.0.0', text: 'WHO-5 描述性侧面信息可用。' },
    { key: 'feedback.safety', version: '1.0.0', text: '安全信号（仅 test fixture）。' },
  ],
})

const scaleResultFor = (input: {
  code: string
  scoreKey: string
  value: number
  bandKey: string | null
}) => ({
  schemaVersion: 2 as const,
  instrument: {
    scaleId: `scale-${input.code}`,
    code: input.code,
    name: input.code,
    instrumentVersion: '1.0.0',
  },
  method: {
    scaleId: `scale-${input.code}`,
    instrumentVersion: '1.0.0',
    scoringVersion: '1.0.0',
    reportVersion: '1.0.0',
    definitionHash: HASH_A,
    referenceVersions: input.bandKey ? [`${input.code}-ref`] : [],
    assessmentContext: null,
  },
  quality: { status: 'interpretable' as const, flags: [] as Array<'missing_items' | 'insufficient_items' | 'score_not_calculable'> },
  itemScores: [],
  scores: [
    {
      key: input.scoreKey,
      type: 'total' as const,
      label: input.scoreKey,
      direction: 'descriptive' as const,
      canonical: true,
      displayPrecision: 0,
      value: input.value,
      range: { min: 0, max: 100 },
      expectedItems: ['i1'],
      answeredItems: ['i1'],
      status: 'calculated' as const,
      prorated: false,
    },
  ],
  references: input.bandKey
    ? [{
      scoreKey: input.scoreKey,
      status: 'available',
      referenceVersion: `${input.code}-ref`,
      referenceKind: 'criterion',
      criterionBand: {
        key: input.bandKey,
        label: 'ignored label',
        minInclusive: 0,
        maxInclusive: 100,
      },
    }]
    : [],
  interpretations: [],
  caveats: [],
  disclaimer: 'fixture',
})

const projectedEvidence = (input: {
  slotKey: string
  code: string
  scoreKey: string
  value: number
  bandKey: string | null
  hash: string
  role?: EvidenceItemV1['role']
}): EvidenceItemV1 => {
  const source = projectBundleScaleSource({
    slotKey: input.slotKey,
    expectedInstrumentKey: input.code,
    expectedInstrumentVersion: '1.0.0',
    sourceResultHash: input.hash,
    result: scaleResultFor(input),
  })
  const [item] = projectScaleEvidenceItems({
    source,
    scoreKeys: [input.scoreKey],
    constructKeyPrefix: input.code,
    role: input.role ?? 'PRIMARY',
  })
  return item
}

const buildInput = (input: {
  evidence: EvidenceItemV1[]
  ruleSet?: MentalHealthRuleSetV1 | null
  productionTriggerEnabled?: boolean
}): BundleEngineInputV1 => {
  const definition = demoBundle({
    safetyCapability: {
      safetyCapable: Boolean(input.productionTriggerEnabled),
      productionTriggerEnabled: Boolean(input.productionTriggerEnabled),
    },
  })
  const snapshot = buildFrozenAssessmentBundleSnapshot(definition)
  return {
    snapshot,
    compiledRuntime: compileBundleRuntimeFromFrozenRead({
      family: 'ASSESSMENT_BUNDLE',
      snapshotVersion: 3,
      snapshot,
    }),
    evidence: input.evidence,
    contextFacts: null,
    aggregateInputHash: null,
    ruleSet: input.ruleSet === undefined ? ruleSet() : input.ruleSet,
  }
}

describe('mental-health-rule-v1', () => {
  it('registers the engine and matches a reviewed CORE combination', () => {
    const registry = createProductBundleAnalysisEngineRegistry()
    expect(registry.resolve(MENTAL_HEALTH_RULE_ENGINE_KEY, MENTAL_HEALTH_RULE_ENGINE_VERSION)).toBeTypeOf('function')

    const evidence = [
      projectedEvidence({
        slotKey: 'who5',
        code: 'who5',
        scoreKey: 'percentage',
        value: 72,
        bandKey: 'who5.percentage.adequate',
        hash: HASH_A,
      }),
      projectedEvidence({
        slotKey: 'sdq',
        code: 'sdq',
        scoreKey: 'total',
        value: 8,
        bandKey: 'sdq.total.normal',
        hash: HASH_B,
      }),
    ]
    const result = registry.dispatch(buildInput({ evidence }))
    expect(result.kind).toBe('COMPUTED')
    const payload = result.payload as MentalHealthRulePayloadV1
    expect(payload).toMatchObject({
      schema: 'mental-health-rule-payload-v1',
      outcomeCode: 'LOW_CONCERN',
      actionTier: 'NONE',
      safetyTriggered: false,
      core: { matched: true, ruleId: 'core.low_concern' },
    })
    expect(payload.ruleBindings.some((row) => row.tier === 'FACET')).toBe(true)
    expect(payload.facetFindings[0]?.available).toBe(true)
    expect(JSON.stringify(payload)).not.toMatch(/"role":"FACET"/)
  })

  it('fails closed when CORE rules are not met', () => {
    const registry = createProductBundleAnalysisEngineRegistry()
    const evidence = [
      projectedEvidence({
        slotKey: 'who5',
        code: 'who5',
        scoreKey: 'percentage',
        value: 72,
        bandKey: 'who5.percentage.adequate',
        hash: HASH_A,
      }),
      projectedEvidence({
        slotKey: 'sdq',
        code: 'sdq',
        scoreKey: 'total',
        value: 20,
        bandKey: 'sdq.total.borderline',
        hash: HASH_B,
      }),
    ]
    const payload = registry.dispatch(buildInput({ evidence })).payload as MentalHealthRulePayloadV1
    expect(payload.outcomeCode).toBe('MIXED_RESULTS')
    expect(payload.core.matched).toBe(false)
    expect(payload.limitations.some((text) => text.includes('fail-closed'))).toBe(true)
  })

  it('does not treat low WHO-5/SDQ scores as crisis and keeps first production Bundles safety-off', () => {
    const registry = createProductBundleAnalysisEngineRegistry()
    const lowScores = [
      projectedEvidence({
        slotKey: 'who5',
        code: 'who5',
        scoreKey: 'percentage',
        value: 8,
        bandKey: 'who5.percentage.low',
        hash: HASH_A,
      }),
      projectedEvidence({
        slotKey: 'sdq',
        code: 'sdq',
        scoreKey: 'total',
        value: 22,
        bandKey: 'sdq.total.borderline',
        hash: HASH_B,
      }),
    ]
    const lowPayload = registry.dispatch(buildInput({ evidence: lowScores })).payload as MentalHealthRulePayloadV1
    expect(lowPayload.outcomeCode).toBe('CONSISTENT_SIGNAL')
    expect(lowPayload.safetyTriggered).toBe(false)
    expect(lowPayload.actionTier).not.toBe('SAFETY_ESCALATION')
    expect(lowPayload.limitations.some((text) => text.includes('低分不得自行解释为危机'))).toBe(true)

    // Even an explicit SAFETY-role marker stays inert while productionTriggerEnabled=false.
    const withSafetyMarker = [
      ...lowScores,
      {
        evidenceKey: 'safety.marker.primary',
        constructKey: 'safety.marker',
        source: {
          kind: 'SCALE_SCORE' as const,
          slotKey: 'safety',
          scoreKey: 'marker',
          sourceResultHash: 'c'.repeat(64),
        },
        value: { state: 'present' as const, value: 1, unit: 'flag' },
        quality: 'interpretable' as const,
        criterionBandKey: 'safety.present',
        role: 'SAFETY' as const,
      },
    ]
    const inert = registry.dispatch(buildInput({ evidence: withSafetyMarker })).payload as MentalHealthRulePayloadV1
    expect(inert.safetyTriggered).toBe(false)
    expect(inert.outcomeCode).toBe('CONSISTENT_SIGNAL')
    expect(inert.safetySignals[0]?.active).toBe(false)

    const enabled = registry.dispatch(buildInput({
      evidence: withSafetyMarker,
      productionTriggerEnabled: true,
    })).payload as MentalHealthRulePayloadV1
    expect(enabled.safetyTriggered).toBe(true)
    expect(enabled.outcomeCode).toBe('SAFETY_ESCALATED')
  })

  it('requires a frozen ruleSet and rejects missing CORE evidence as insufficient quality', () => {
    const registry = createProductBundleAnalysisEngineRegistry()
    expect(failCode(() => registry.dispatch(buildInput({
      evidence: [],
      ruleSet: null,
    })))).toBe('RULE_SET_REQUIRED')

    const onlyWho5 = [
      projectedEvidence({
        slotKey: 'who5',
        code: 'who5',
        scoreKey: 'percentage',
        value: 72,
        bandKey: 'who5.percentage.adequate',
        hash: HASH_A,
      }),
    ]
    const payload = registry.dispatch(buildInput({ evidence: onlyWho5 })).payload as MentalHealthRulePayloadV1
    expect(payload.outcomeCode).toBe('INSUFFICIENT_QUALITY')
    expect(payload.core.matched).toBe(false)
  })
})
