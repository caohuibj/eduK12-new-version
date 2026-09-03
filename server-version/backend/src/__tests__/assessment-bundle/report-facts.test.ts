import { describe, expect, it } from 'vitest'
import {
  COGNITIVE_RESPONSE_INHIBITION_V1,
  WELLBEING_WHO5_YOUTH_SELF_ZH_CN_V1,
  createProductBundleAnalysisEngineRegistry,
  exportHistoricalBundleSnapshot,
  projectAllBundleAudienceViews,
  projectBundleAudienceView,
  projectBundleCognitiveSource,
  projectBundleReportFacts,
  projectBundleScaleSource,
  projectCognitiveEvidenceItems,
  renderBundleReportHtml,
  renderBundleReportMarkdown,
  type BundleFrozenCognitiveSourceV1,
  type BundleFrozenScaleSourceV1,
} from '../../modules/assessment-bundle'
import { compileBundleRuntimeFromFrozenRead } from '../../modules/assessment-bundle/compile'
import { buildFrozenAssessmentBundleSnapshot } from '../../modules/assessment-bundle/snapshot'
import { HASH_A } from './fixtures'

const scaleResult = () => ({
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
      referenceKind: 'criterion_threshold',
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
})

const cognitiveResult = (testType: string, metrics: Record<string, unknown>) => ({
  schemaVersion: 1 as const,
  completedAt: '2026-09-02T12:00:00.000Z',
  testType,
  configVersion: '1.0.0',
  engineVersion: '1.0.0',
  scoringVersion: '1.0.0',
  protocolSignature: HASH_A,
  profile: 'standard' as const,
  metrics,
  quality: { state: 'interpretable' as const, flags: {}, reasons: [] },
  references: [] as Array<Record<string, unknown>>,
  report: {},
  assessmentContext: null,
})

describe('BundleReportFacts projector / audience / export', () => {
  it('projects COMPUTED scale enginePayload and preserves evidenceSourceHashes', () => {
    const snapshot = buildFrozenAssessmentBundleSnapshot(WELLBEING_WHO5_YOUTH_SELF_ZH_CN_V1)
    const scaleSources: BundleFrozenScaleSourceV1[] = [
      projectBundleScaleSource({
        slotKey: 'who5',
        expectedInstrumentKey: 'who5',
        expectedInstrumentVersion: '1.0.0',
        result: scaleResult(),
      }),
    ]
    const compiled = compileBundleRuntimeFromFrozenRead({
      family: 'ASSESSMENT_BUNDLE',
      snapshotVersion: 3,
      snapshot,
    })
    const facts = projectBundleReportFacts({
      registry: createProductBundleAnalysisEngineRegistry(),
      compiledBundleRuntimeHash: compiled.compiledRuntimeHash,
      engineInput: {
        snapshot,
        compiledRuntime: compiled,
        evidence: [],
        contextFacts: null,
        aggregateInputHash: null,
        scaleSources,
      },
    })
    expect(facts.enginePayload.kind).toBe('COMPUTED')
    expect(facts.provenance.evidenceSourceHashes).toEqual(
      [...new Set(scaleSources.map((row) => row.sourceResultHash))].sort(),
    )
    expect(facts.provenance.contextDefinitionHash).toBeNull()
    expect(facts.provenance.ruleSetRef).toBeNull()
    expect(facts.evidence.some((item) => item.source.kind === 'SCALE_SCORE')).toBe(true)
  })

  it('projects COGNITIVE_METRIC evidence and audience views without leaking context/raw answers', () => {
    const snapshot = buildFrozenAssessmentBundleSnapshot(COGNITIVE_RESPONSE_INHIBITION_V1)
    const cognitiveSources: BundleFrozenCognitiveSourceV1[] = [
      projectBundleCognitiveSource({
        slotKey: 'gonogo',
        expectedInstrumentKey: 'gonogo',
        expectedInstrumentVersion: '1.0.0',
        result: cognitiveResult('gonogo', { commissionRate: 0.1, dPrime: 1.8 }),
      }),
      projectBundleCognitiveSource({
        slotKey: 'sst',
        expectedInstrumentKey: 'sst',
        expectedInstrumentVersion: '1.0.0',
        result: cognitiveResult('sst', { ssrtMs: 210 }),
      }),
    ]
    const cognitiveEvidence = projectCognitiveEvidenceItems({
      source: cognitiveSources[0],
      metricKeys: ['commissionRate'],
    })
    expect(cognitiveEvidence[0]?.source.kind).toBe('COGNITIVE_METRIC')

    const compiled = compileBundleRuntimeFromFrozenRead({
      family: 'ASSESSMENT_BUNDLE',
      snapshotVersion: 3,
      snapshot,
    })
    const facts = projectBundleReportFacts({
      registry: createProductBundleAnalysisEngineRegistry(),
      compiledBundleRuntimeHash: compiled.compiledRuntimeHash,
      engineInput: {
        snapshot,
        compiledRuntime: compiled,
        evidence: [],
        contextFacts: null,
        aggregateInputHash: null,
        cognitiveSources,
      },
    })
    expect(facts.enginePayload.kind).toBe('COMPUTED')
    expect(facts.evidence.every((item) => item.source.kind === 'COGNITIVE_METRIC')).toBe(true)

    const views = projectAllBundleAudienceViews(facts)
    for (const audience of ['student', 'parent', 'teacher', 'admin'] as const) {
      expect(views[audience].rawAnswers).toBeNull()
      expect(views[audience].sensitiveContextValues).toBeNull()
      expect(views[audience].provenance.evidenceSourceHashes).toEqual(facts.provenance.evidenceSourceHashes)
    }
    expect(projectBundleAudienceView(facts, 'student').engineSummary.kind).toBe('COMPUTED')
  })

  it('marks HTML/Markdown as non-authoritative and exports historical snapshots', () => {
    const snapshot = buildFrozenAssessmentBundleSnapshot(WELLBEING_WHO5_YOUTH_SELF_ZH_CN_V1)
    const compiled = compileBundleRuntimeFromFrozenRead({
      family: 'ASSESSMENT_BUNDLE',
      snapshotVersion: 3,
      snapshot,
    })
    const facts = projectBundleReportFacts({
      registry: createProductBundleAnalysisEngineRegistry(),
      compiledBundleRuntimeHash: compiled.compiledRuntimeHash,
      engineInput: {
        snapshot,
        compiledRuntime: compiled,
        evidence: [],
        contextFacts: null,
        aggregateInputHash: null,
        scaleSources: [
          projectBundleScaleSource({
            slotKey: 'who5',
            expectedInstrumentKey: 'who5',
            expectedInstrumentVersion: '1.0.0',
            result: scaleResult(),
          }),
        ],
      },
    })
    const html = renderBundleReportHtml(facts)
    const md = renderBundleReportMarkdown(facts)
    expect(html).toMatch(/not authoritative/i)
    expect(md).toMatch(/not.*authoritative/i)
    expect(facts.limitations.some((row) => /非权威|not authoritative|HTML\/Markdown/i.test(row))).toBe(true)

    const exported = exportHistoricalBundleSnapshot({
      snapshot,
      reportFacts: facts,
      exportedAt: '2026-09-03T04:00:00.000Z',
    })
    expect(exported.authoritative).toBe(false)
    expect(exported.snapshot.snapshotHash).toBe(snapshot.snapshotHash)
    expect(exported.reportFacts?.identity.snapshotHash).toBe(facts.identity.snapshotHash)
    expect(exported.exportHash).toMatch(/^[0-9a-f]{64}$/)
  })
})
