import { describe, expect, it } from 'vitest'
import {
  INTEGRATED_ADULT_AGE_CONTEXT_DEFINITION_V1,
  INTEGRATED_GONOGO_ADEXI_ADULT_ZH_CN_V1,
  buildBundleContextFacts,
  buildFrozenAssessmentBundleSnapshot,
  hashBundleContextDefinition,
  projectBundleCognitiveSource,
  projectBundleScaleSource,
  validateBundleContextDefinition,
} from '../../modules/assessment-bundle'
import {
  ReanalysisContractError,
  assertNoRawReanalysisInput,
  computeReanalysisAggregateInputHash,
  runExplicitBundleReanalysis,
} from '../../modules/assessment-reanalysis'
import {
  assertReanalysisDoesNotAutoClose,
  buildTestOnlySafetyPolicy,
  buildTestOnlyAuthoritativeTrigger,
  createSafetyCaseAtomic,
} from '../../modules/assessment-safety'

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

const frozenSources = () => ({
  cognitive: [
    projectBundleCognitiveSource({
      slotKey: 'gonogo',
      expectedInstrumentKey: 'gonogo',
      expectedInstrumentVersion: '1.0.0',
      result: cognitiveResult({ commissionRate: 0.1, dPrime: 2.0 }),
    }),
  ],
  scale: [
    projectBundleScaleSource({
      slotKey: 'adexi',
      expectedInstrumentKey: 'adexi_v1',
      expectedInstrumentVersion: '2.0.0',
      result: scaleResult(),
    }),
  ],
})

const contextFacts = () => buildBundleContextFacts({
  contextDefinitionKey: 'integrated-adult-age-v1',
  contextDefinitionVersion: '1.0.0',
  contextDefinitionHash: hashBundleContextDefinition(INTEGRATED_ADULT_AGE_CONTEXT_DEFINITION_V1),
  frozenAt: '2026-09-02T12:00:00.000Z',
  facts: [{ contextKey: 'subject_age_years', value: { state: 'present', value: 22 } }],
})

const resolveTarget = (key: string, version: string) => (
  key === INTEGRATED_GONOGO_ADEXI_ADULT_ZH_CN_V1.bundleKey
  && version === INTEGRATED_GONOGO_ADEXI_ADULT_ZH_CN_V1.bundleVersion
    ? INTEGRATED_GONOGO_ADEXI_ADULT_ZH_CN_V1
    : null
)

const resolveContext = (key: string, version: string) => (
  key === 'integrated-adult-age-v1' && version === '1.0.0'
    ? INTEGRATED_ADULT_AGE_CONTEXT_DEFINITION_V1
    : null
)

describe('explicit Bundle reanalysis by target version (Prep 15.1)', () => {
  it('dispatches registry, regenerates ReportFacts, and never reads raw', () => {
    expect(failCode(() => assertNoRawReanalysisInput({ rawAnswers: { a: 1 } }))).toBe('REANALYSIS_FORBIDDEN')

    const prior = buildFrozenAssessmentBundleSnapshot(
      INTEGRATED_GONOGO_ADEXI_ADULT_ZH_CN_V1,
      { contextDefinition: INTEGRATED_ADULT_AGE_CONTEXT_DEFINITION_V1 },
    )
    const sources = frozenSources()
    const facts = contextFacts()

    const result = runExplicitBundleReanalysis({
      request: {
        schemaVersion: 1,
        targetBundleKey: 'integrated_gonogo_adexi_adult_zh_cn_v1',
        targetBundleVersion: '1.0.0',
        frozenCognitiveSources: sources.cognitive,
        frozenScaleSources: sources.scale,
        frozenContextFacts: facts,
        aggregateInputHash: null,
        actorUserId: 'admin-1',
        analysisInstanceId: 'analysis-1',
      },
      resolveTargetDefinition: resolveTarget,
      resolveContextDefinition: resolveContext,
      priorSnapshot: prior,
      safetyTriggered: false,
    })

    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.newSnapshot.bundleKey).toBe(prior.bundleKey)
    expect(result.newSnapshot).not.toBe(prior)
    expect(result.reportFacts.identity.snapshotHash).toBe(result.newSnapshot.snapshotHash)
    expect(result.reportFacts.provenance.aggregateInputHash).toBe(result.aggregateInputHash)
    expect(result.history.historyId).toBeTruthy()
    expect(result.history.newSnapshotHash).toBe(result.newSnapshot.snapshotHash)
    expect(result.openNewSafetyCase).toBe(false)
    expect(HEX_OK(result.aggregateInputHash)).toBe(true)
  })

  it('rejects missing / duplicate / unknown / incompatible slots and empty sources', () => {
    const facts = contextFacts()
    const sources = frozenSources()

    const missing = runExplicitBundleReanalysis({
      request: {
        schemaVersion: 1,
        targetBundleKey: 'integrated_gonogo_adexi_adult_zh_cn_v1',
        targetBundleVersion: '1.0.0',
        frozenCognitiveSources: [],
        frozenScaleSources: [],
        frozenContextFacts: facts,
        aggregateInputHash: null,
        actorUserId: 'admin-1',
      },
      resolveTargetDefinition: () => INTEGRATED_GONOGO_ADEXI_ADULT_ZH_CN_V1,
      resolveContextDefinition: () => INTEGRATED_ADULT_AGE_CONTEXT_DEFINITION_V1,
    })
    expect(missing.ok).toBe(false)
    if (!missing.ok) expect(missing.reason).toBe('MISSING_REQUIRED_SOURCE')

    const duplicate = runExplicitBundleReanalysis({
      request: {
        schemaVersion: 1,
        targetBundleKey: 'integrated_gonogo_adexi_adult_zh_cn_v1',
        targetBundleVersion: '1.0.0',
        frozenCognitiveSources: [...sources.cognitive, ...sources.cognitive],
        frozenScaleSources: sources.scale,
        frozenContextFacts: facts,
        aggregateInputHash: null,
        actorUserId: 'admin-1',
      },
      resolveTargetDefinition: () => INTEGRATED_GONOGO_ADEXI_ADULT_ZH_CN_V1,
      resolveContextDefinition: () => INTEGRATED_ADULT_AGE_CONTEXT_DEFINITION_V1,
    })
    expect(duplicate.ok).toBe(false)
    if (!duplicate.ok) expect(duplicate.reason).toBe('DUPLICATE_SOURCE_SLOT')

    const unknown = runExplicitBundleReanalysis({
      request: {
        schemaVersion: 1,
        targetBundleKey: 'integrated_gonogo_adexi_adult_zh_cn_v1',
        targetBundleVersion: '1.0.0',
        frozenCognitiveSources: [
          ...sources.cognitive,
          { ...sources.cognitive[0]!, slotKey: 'extra-unknown' },
        ],
        frozenScaleSources: sources.scale,
        frozenContextFacts: facts,
        aggregateInputHash: null,
        actorUserId: 'admin-1',
      },
      resolveTargetDefinition: () => INTEGRATED_GONOGO_ADEXI_ADULT_ZH_CN_V1,
      resolveContextDefinition: () => INTEGRATED_ADULT_AGE_CONTEXT_DEFINITION_V1,
    })
    expect(unknown.ok).toBe(false)
    if (!unknown.ok) expect(unknown.reason).toBe('UNKNOWN_SOURCE_SLOT')

    const incompatible = runExplicitBundleReanalysis({
      request: {
        schemaVersion: 1,
        targetBundleKey: 'integrated_gonogo_adexi_adult_zh_cn_v1',
        targetBundleVersion: '1.0.0',
        frozenCognitiveSources: [
          { ...sources.cognitive[0]!, instrumentVersion: '9.9.9' },
        ],
        frozenScaleSources: sources.scale,
        frozenContextFacts: facts,
        aggregateInputHash: null,
        actorUserId: 'admin-1',
      },
      resolveTargetDefinition: () => INTEGRATED_GONOGO_ADEXI_ADULT_ZH_CN_V1,
      resolveContextDefinition: () => INTEGRATED_ADULT_AGE_CONTEXT_DEFINITION_V1,
    })
    expect(incompatible.ok).toBe(false)
    if (!incompatible.ok) expect(incompatible.reason).toBe('INCOMPATIBLE_SOURCE_VERSION')
  })

  it('rejects same-version different context hash and opens new SafetyCase on trigger', () => {
    const sources = frozenSources()
    const validated = validateBundleContextDefinition(INTEGRATED_ADULT_AGE_CONTEXT_DEFINITION_V1)
    const wrongHashFacts = buildBundleContextFacts({
      contextDefinitionKey: validated.contextDefinitionKey,
      contextDefinitionVersion: validated.contextDefinitionVersion,
      contextDefinitionHash: HASH_B, // same key@version, different hash
      frozenAt: '2026-09-02T12:00:00.000Z',
      facts: [{ contextKey: 'subject_age_years', value: { state: 'present', value: 22 } }],
    })

    const mismatch = runExplicitBundleReanalysis({
      request: {
        schemaVersion: 1,
        targetBundleKey: 'integrated_gonogo_adexi_adult_zh_cn_v1',
        targetBundleVersion: '1.0.0',
        frozenCognitiveSources: sources.cognitive,
        frozenScaleSources: sources.scale,
        frozenContextFacts: wrongHashFacts,
        aggregateInputHash: null,
        actorUserId: 'admin-1',
      },
      resolveTargetDefinition: () => INTEGRATED_GONOGO_ADEXI_ADULT_ZH_CN_V1,
      resolveContextDefinition: () => INTEGRATED_ADULT_AGE_CONTEXT_DEFINITION_V1,
    })
    expect(mismatch.ok).toBe(false)
    if (!mismatch.ok) expect(mismatch.reason).toBe('CONTEXT_DEFINITION_MISMATCH')

    const policy = buildTestOnlySafetyPolicy()
    const priorCase = createSafetyCaseAtomic({
      policy,
      trigger: buildTestOnlyAuthoritativeTrigger({ sourceHash: HASH_A, sourceRecordId: 'prior-1' }),
      subjectUserId: 'student-1',
      primaryOwnerUserId: 'teacher-1',
      backupOwnerUserIds: [],
      actorUserId: 'system',
    }).safetyCase

    const ok = runExplicitBundleReanalysis({
      request: {
        schemaVersion: 1,
        targetBundleKey: 'integrated_gonogo_adexi_adult_zh_cn_v1',
        targetBundleVersion: '1.0.0',
        frozenCognitiveSources: sources.cognitive,
        frozenScaleSources: sources.scale,
        frozenContextFacts: contextFacts(),
        aggregateInputHash: null,
        actorUserId: 'admin-1',
        analysisInstanceId: 'reanalysis-2',
      },
      resolveTargetDefinition: () => INTEGRATED_GONOGO_ADEXI_ADULT_ZH_CN_V1,
      resolveContextDefinition: () => INTEGRATED_ADULT_AGE_CONTEXT_DEFINITION_V1,
      safetyTriggered: true,
    })
    expect(ok.ok).toBe(true)
    if (!ok.ok) return
    expect(ok.openNewSafetyCase).toBe(true)
    expect(ok.history.analysisInstanceId).toBe('reanalysis-2')

    const newCase = createSafetyCaseAtomic({
      policy,
      trigger: buildTestOnlyAuthoritativeTrigger({
        sourceHash: HASH_A, // same content hash
        sourceRecordId: 'reanalysis-2',
      }),
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
    expect(newCase.safetyCase.idempotencyKey).not.toBe(priorCase.idempotencyKey)
  })

  it('rejects mismatched caller aggregateInputHash', () => {
    const sources = frozenSources()
    const bad = runExplicitBundleReanalysis({
      request: {
        schemaVersion: 1,
        targetBundleKey: 'integrated_gonogo_adexi_adult_zh_cn_v1',
        targetBundleVersion: '1.0.0',
        frozenCognitiveSources: sources.cognitive,
        frozenScaleSources: sources.scale,
        frozenContextFacts: contextFacts(),
        aggregateInputHash: HASH_A,
        actorUserId: 'admin-1',
      },
      resolveTargetDefinition: () => INTEGRATED_GONOGO_ADEXI_ADULT_ZH_CN_V1,
      resolveContextDefinition: () => INTEGRATED_ADULT_AGE_CONTEXT_DEFINITION_V1,
    })
    expect(bad.ok).toBe(false)
    if (!bad.ok) expect(bad.reason).toBe('AGGREGATE_INPUT_HASH_MISMATCH')
  })
})

const HEX_OK = (value: string): boolean => /^[0-9a-f]{64}$/.test(value)

void computeReanalysisAggregateInputHash


describe('Bundle reanalysis includes Situational canonical sources', () => {
  const definition = {
    ...INTEGRATED_GONOGO_ADEXI_ADULT_ZH_CN_V1,
    bundleKey: 'integrated_sjt_test_v1',
    slots: [...INTEGRATED_GONOGO_ADEXI_ADULT_ZH_CN_V1.slots, {
      slotKey:'sjt',unitType:'SITUATIONAL' as const,position:2,required:true,
      instrumentKey:'sjt-assertiveness-golden',instrumentVersion:'1.0.0',
      respondentType:'SELF' as const,valueSelectors:['bfi2.assertiveness.behavior'],
    }],
  }
  const source = {
    slotKey:'sjt',instrumentKey:'sjt-assertiveness-golden',instrumentVersion:'1.0.0',
    sourceResultHash:HASH_A,envelopeResultHash:HASH_B,qualityState:'interpretable' as const,
    metrics:{'bfi2.assertiveness.behavior':1.5},
  }
  const run = (sources: typeof source[] = [source]) => {
    const units=frozenSources()
    return runExplicitBundleReanalysis({
      request:{schemaVersion:1,targetBundleKey:definition.bundleKey,targetBundleVersion:'1.0.0',
        frozenCognitiveSources:units.cognitive,frozenScaleSources:units.scale,
        frozenSituationalSources:sources,frozenContextFacts:contextFacts(),
        aggregateInputHash:null,actorUserId:'admin-1'},
      resolveTargetDefinition:()=>definition,resolveContextDefinition:resolveContext,
    })
  }
  it('includes SJT evidence and binds its result identity into reanalysis provenance', () => {
    const a=run(), b=run([{...source,sourceResultHash:'c'.repeat(64)}])
    expect(a.ok&&b.ok).toBe(true)
    if(!a.ok||!b.ok)return
    expect(a.aggregateInputHash).not.toBe(b.aggregateInputHash)
    expect(a.reportFacts.evidence.some(v=>v.source.kind==='SITUATIONAL_METRIC')).toBe(true)
    expect(a.reportFacts.provenance.evidenceSourceHashes).toContain(HASH_A)
    expect(JSON.stringify(a.reportFacts)).not.toMatch(/sceneKey|rawAnswers|rawTrials/)
  })
  it.each([
    [[], 'MISSING_REQUIRED_SOURCE'],
    [[source,source], 'DUPLICATE_SOURCE_SLOT'],
    [[{...source,slotKey:'other'}], 'UNKNOWN_SOURCE_SLOT'],
    [[{...source,instrumentVersion:'2.0.0'}], 'INCOMPATIBLE_SOURCE_VERSION'],
  ] as const)('rejects invalid SJT source bindings %#', (sources,reason) => {
    expect(run([...sources])).toMatchObject({ok:false,reason})
  })
  it('keeps legacy provenance unchanged when no SJT source is supplied', () => {
    const input={snapshotHash:HASH_A,compiledBundleRuntimeHash:HASH_B,cognitiveSources:[],scaleSources:[],contextSnapshotHash:null}
    expect(computeReanalysisAggregateInputHash(input)).toBe(computeReanalysisAggregateInputHash({...input,situationalSources:[]}))
  })
})
