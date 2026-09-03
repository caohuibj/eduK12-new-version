import { describe, expect, it } from 'vitest'
import {
  INTEGRATED_ADULT_AGE_CONTEXT_DEFINITION_V1,
  INTEGRATED_GONOGO_ADEXI_ADULT_ZH_CN_V1,
  buildBundleContextFacts,
  buildFrozenAssessmentBundleSnapshot,
  hashBundleContextDefinition,
  projectBundleCognitiveSource,
  projectBundleScaleSource,
} from '../../modules/assessment-bundle'
import {
  ReanalysisContractError,
  assertNoRawReanalysisInput,
  runExplicitBundleReanalysis,
} from '../../modules/assessment-reanalysis'
import { assertReanalysisDoesNotAutoClose, buildTestOnlySafetyPolicy, buildTestOnlyAuthoritativeTrigger, createSafetyCaseAtomic } from '../../modules/assessment-safety'

const HASH_A = 'a'.repeat(64)
const HASH_B = 'b'.repeat(64)

const failCode = (run: () => unknown): string => {
  try {
    run()
    throw new Error('expected ReanalysisContractError')
  } catch (error) {
    if (error instanceof ReanalysisContractError) return error.code
    throw error
  }
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

describe('explicit Bundle reanalysis by target version', () => {
  it('builds a new snapshot from frozen sources + Context and never reads raw', () => {
    expect(failCode(() => assertNoRawReanalysisInput({ rawAnswers: { a: 1 } }))).toBe('REANALYSIS_FORBIDDEN')

    const prior = buildFrozenAssessmentBundleSnapshot(
      INTEGRATED_GONOGO_ADEXI_ADULT_ZH_CN_V1,
      { contextDefinition: INTEGRATED_ADULT_AGE_CONTEXT_DEFINITION_V1 },
    )
    const contextFacts = buildBundleContextFacts({
      contextDefinitionKey: 'integrated-adult-age-v1',
      contextDefinitionVersion: '1.0.0',
      contextDefinitionHash: hashBundleContextDefinition(INTEGRATED_ADULT_AGE_CONTEXT_DEFINITION_V1),
      frozenAt: '2026-09-02T12:00:00.000Z',
      facts: [{ contextKey: 'subject_age_years', value: { state: 'present', value: 22 } }],
    })

    const result = runExplicitBundleReanalysis({
      request: {
        schemaVersion: 1,
        targetBundleKey: 'integrated_gonogo_adexi_adult_zh_cn_v1',
        targetBundleVersion: '1.0.0',
        frozenCognitiveSources: [
          projectBundleCognitiveSource({
            slotKey: 'gonogo',
            expectedInstrumentKey: 'gonogo',
            expectedInstrumentVersion: '1.0.0',
            result: cognitiveResult({ commissionRate: 0.1, dPrime: 2.0 }),
          }),
        ],
        frozenScaleSources: [
          projectBundleScaleSource({
            slotKey: 'adexi',
            expectedInstrumentKey: 'adexi_v1',
            expectedInstrumentVersion: '2.0.0',
            result: scaleResult(),
          }),
        ],
        frozenContextFacts: contextFacts,
        aggregateInputHash: HASH_A,
        actorUserId: 'admin-1',
      },
      resolveTargetDefinition: (key, version) => (
        key === INTEGRATED_GONOGO_ADEXI_ADULT_ZH_CN_V1.bundleKey
        && version === INTEGRATED_GONOGO_ADEXI_ADULT_ZH_CN_V1.bundleVersion
          ? INTEGRATED_GONOGO_ADEXI_ADULT_ZH_CN_V1
          : null
      ),
      resolveContextDefinition: (key, version) => (
        key === 'integrated-adult-age-v1' && version === '1.0.0'
          ? INTEGRATED_ADULT_AGE_CONTEXT_DEFINITION_V1
          : null
      ),
      priorSnapshot: prior,
      safetyTriggered: false,
    })

    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.newSnapshot.bundleKey).toBe(prior.bundleKey)
    expect(result.newSnapshot).not.toBe(prior)
    expect(result.openNewSafetyCase).toBe(false)
  })

  it('rejects missing required Context and opens a new SafetyCase on reanalysis trigger', () => {
    const missing = runExplicitBundleReanalysis({
      request: {
        schemaVersion: 1,
        targetBundleKey: 'integrated_gonogo_adexi_adult_zh_cn_v1',
        targetBundleVersion: '1.0.0',
        frozenCognitiveSources: [],
        frozenScaleSources: [],
        frozenContextFacts: null,
        aggregateInputHash: null,
        actorUserId: 'admin-1',
      },
      resolveTargetDefinition: () => INTEGRATED_GONOGO_ADEXI_ADULT_ZH_CN_V1,
      resolveContextDefinition: () => INTEGRATED_ADULT_AGE_CONTEXT_DEFINITION_V1,
    })
    expect(missing.ok).toBe(false)
    if (missing.ok) return
    expect(missing.reason).toBe('MISSING_REQUIRED_CONTEXT')

    const policy = buildTestOnlySafetyPolicy()
    const priorCase = createSafetyCaseAtomic({
      policy,
      trigger: buildTestOnlyAuthoritativeTrigger({ sourceHash: HASH_A }),
      subjectUserId: 'student-1',
      primaryOwnerUserId: 'teacher-1',
      backupOwnerUserIds: [],
      actorUserId: 'system',
    }).safetyCase

    const contextFacts = buildBundleContextFacts({
      contextDefinitionKey: 'integrated-adult-age-v1',
      contextDefinitionVersion: '1.0.0',
      contextDefinitionHash: hashBundleContextDefinition(INTEGRATED_ADULT_AGE_CONTEXT_DEFINITION_V1),
      frozenAt: '2026-09-02T12:00:00.000Z',
      facts: [{ contextKey: 'subject_age_years', value: { state: 'present', value: 30 } }],
    })
    const result = runExplicitBundleReanalysis({
      request: {
        schemaVersion: 1,
        targetBundleKey: 'integrated_gonogo_adexi_adult_zh_cn_v1',
        targetBundleVersion: '1.0.0',
        frozenCognitiveSources: [],
        frozenScaleSources: [],
        frozenContextFacts: contextFacts,
        aggregateInputHash: HASH_B,
        actorUserId: 'admin-1',
      },
      resolveTargetDefinition: () => INTEGRATED_GONOGO_ADEXI_ADULT_ZH_CN_V1,
      resolveContextDefinition: () => INTEGRATED_ADULT_AGE_CONTEXT_DEFINITION_V1,
      safetyTriggered: true,
    })
    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.openNewSafetyCase).toBe(true)

    const newCase = createSafetyCaseAtomic({
      policy,
      trigger: buildTestOnlyAuthoritativeTrigger({ sourceHash: HASH_B }),
      subjectUserId: 'student-1',
      primaryOwnerUserId: 'teacher-1',
      backupOwnerUserIds: [],
      actorUserId: 'system',
      priorCaseId: priorCase.caseId,
    })
    expect(assertReanalysisDoesNotAutoClose({
      priorCase,
      newAnalysisTriggered: true,
    })).toBe('OPEN')
    expect(newCase.safetyCase.caseId).not.toBe(priorCase.caseId)
  })
})
