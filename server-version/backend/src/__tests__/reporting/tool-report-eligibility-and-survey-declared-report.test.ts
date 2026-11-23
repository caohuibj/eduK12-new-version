import { describe, expect, it, vi, beforeEach } from 'vitest'
import {
  evaluateEducationLeafReportEligibility,
  evaluateScaleReportObject,
  evaluateSurveyUnitReportEligibility,
  evaluateTrainingItemReportEligibility,
  hasConfiguredRawScoreFeedback,
  hasConfiguredScaleDefinitionReport,
  summarizeCollectionReportEligibility,
} from '../../modules/assessment-policy/tool-report-eligibility'
import { freezeSurveyParticipantFeedback } from '../../modules/survey/participant-feedback'
import {
  attachSurveyParticipantDeclaredReports,
  resolveSurveyDeclaredReportAsset,
} from '../../modules/survey/participant-declared-report'
import type { ResearchFrozenUnit } from '../../modules/survey/publication.service'
import type { SurveyComputedFinal } from '../../modules/survey/final.compute'
import type { SurveyParticipantFeedbackProjection } from '../../modules/survey/participant-feedback-response'

const mocks = vi.hoisted(() => ({
  getContentReleaseBatch: vi.fn(),
}))

vi.mock('../../modules/measurement-content/repository', () => ({
  getContentReleaseBatch: mocks.getContentReleaseBatch,
}))

const sampleRawFeedback = {
  schemaVersion: 1 as const,
  rules: [
    {
      scoreKey: 'total',
      ranges: [
        { key: 'low', min: 0, max: 5, includeMax: false, text: '分数偏低区间说明' },
        { key: 'high', min: 5, max: 10, includeMax: true, text: '分数偏高区间说明' },
      ],
    },
  ],
}

const draftId = '00000000-0000-4000-8000-000000000001'
const hashA = 'a'.repeat(64)
const hashB = 'b'.repeat(64)
const hashC = 'c'.repeat(64)

const baseSurveyScaleUnit = (overrides: Partial<ResearchFrozenUnit> = {}): ResearchFrozenUnit => ({
  draftId,
  instrumentKey: 'scale_a',
  kind: 'SCALE',
  title: '示例量表',
  draftRevision: 1,
  sourceDigest: hashA,
  scoringDigest: hashB,
  compiledDefinition: {
    scoring: { scores: [{ key: 'total', label: '总分' }] },
    report: {
      reportVersion: 'survey-private-score-v1',
      primaryScoreKeys: ['total'],
      scoreOrder: ['total'],
      interpretations: [
        {
          scoreKey: 'total',
          headline: '总分',
          source: { type: 'score_only' },
          summary: '研究探索性得分，不对被试作诊断或常模解释。',
          bands: [],
          guidance: [],
        },
      ],
      limitations: [],
      disclaimer: '研究者自编探索性工具。',
    },
  },
  displayDefinition: {},
  measurementRelease: {
    releaseId: '11111111-1111-4111-8111-111111111111',
    contentHash: hashA,
    measurementHash: hashB,
  },
  ...overrides,
})

describe('tool-level participant report eligibility (publish-time gate)', () => {
  it('recognizes configured rawScoreFeedback and rejects empty or placeholder reports', () => {
    expect(hasConfiguredRawScoreFeedback(sampleRawFeedback)).toBe(true)
    expect(hasConfiguredRawScoreFeedback({ schemaVersion: 1, rules: [] })).toBe(false)
    expect(hasConfiguredRawScoreFeedback(undefined)).toBe(false)

    // Placeholder none-v1 and survey-private-score-v1 without rawScoreFeedback are DATA_COLLECTION_ONLY
    expect(evaluateScaleReportObject({
      reportVersion: 'none-v1',
      interpretations: [{ scoreKey: 'total', summary: '本版本不配置报告或反馈。', bands: [], guidance: [] }],
    }).eligible).toBe(false)

    expect(evaluateScaleReportObject({
      reportVersion: 'survey-private-score-v1',
      interpretations: [{ scoreKey: 'total', summary: '研究探索性得分，不对被试作诊断或常模解释。', bands: [], guidance: [] }],
    }).eligible).toBe(false)

    // With rawScoreFeedback configured, even survey-private-score-v1 is eligible
    expect(evaluateScaleReportObject({
      reportVersion: 'survey-private-score-v1',
      rawScoreFeedback: sampleRawFeedback,
    })).toMatchObject({ eligible: true, mode: 'CONFIGURED_REPORT', source: 'RAW_SCORE_FEEDBACK' })

    // Substantive authored interpretation with bands is eligible
    expect(hasConfiguredScaleDefinitionReport({
      report: {
        reportVersion: 'scale-report-v2',
        interpretations: [
          {
            scoreKey: 'total',
            summary: '你的作答反映当前学习投入状态。',
            bands: [{ key: 'high', label: '高投入', interpretation: '表现出较高的主动学习投入。' }],
            guidance: [],
          },
        ],
      },
    })).toMatchObject({ eligible: true, mode: 'CONFIGURED_REPORT', source: 'SCALE_INTERPRETATIONS' })
  })

  it('enforces tool-level eligibility in Survey freeze while keeping receipt-only opt-out allowed', () => {
    // 1. Bare research-only scale -> DATA_COLLECTION_ONLY, rejected for DESCRIPTIVE, allowed for GENERAL
    const bareScale = baseSurveyScaleUnit()
    expect(evaluateSurveyUnitReportEligibility(bareScale).eligible).toBe(false)
    expect(() => freezeSurveyParticipantFeedback(
      [bareScale],
      [{ instrumentId: draftId, feedback: { policyVersion: 'SURVEY_RAW_METRICS_V1', mode: 'DESCRIPTIVE', metricKeys: ['total'], release: 'AFTER_FINAL' } }],
      new Map([[draftId, ['total']]]),
    )).toThrow(/数据采集|报告/)

    // Receipt-only opt-out (GENERAL) is always accepted
    freezeSurveyParticipantFeedback(
      [bareScale],
      [{ instrumentId: draftId, feedback: { policyVersion: 'SURVEY_RAW_METRICS_V1', mode: 'GENERAL', metricKeys: [], release: 'AFTER_FINAL' } }],
      new Map([[draftId, ['total']]]),
    )
    expect(bareScale.participantFeedback?.mode).toBe('GENERAL')

    // 2. Scale with configured rawScoreFeedback -> eligible for DESCRIPTIVE
    const withRawFeedback = baseSurveyScaleUnit({
      compiledDefinition: {
        scoring: { scores: [{ key: 'total', label: '总分' }] },
        report: { reportVersion: 'survey-private-score-v1', rawScoreFeedback: sampleRawFeedback },
      },
    })
    expect(evaluateSurveyUnitReportEligibility(withRawFeedback)).toMatchObject({ eligible: true, source: 'RAW_SCORE_FEEDBACK' })
    freezeSurveyParticipantFeedback(
      [withRawFeedback],
      [{ instrumentId: draftId, feedback: { policyVersion: 'SURVEY_RAW_METRICS_V1', mode: 'DESCRIPTIVE', metricKeys: ['total'], release: 'AFTER_FINAL' } }],
      new Map([[draftId, ['total']]]),
    )
    expect(withRawFeedback.participantFeedback?.mode).toBe('DESCRIPTIVE')

    // 3. Scale with participant-facing bound REPORT release -> eligible for DESCRIPTIVE
    const withReportRelease = baseSurveyScaleUnit({
      contentSelection: {
        referencePolicy: { policyVersion: 'EXACT_POPULATION_PRIORITY_V1', measurementReleaseId: '11111111-1111-4111-8111-111111111111', choices: [] },
        reportRelease: { releaseId: '22222222-2222-4222-8222-222222222222', contentHash: hashC },
      },
    })
    expect(evaluateSurveyUnitReportEligibility({ ...withReportRelease, reportReleaseAudience: 'student' })).toMatchObject({ eligible: true, source: 'DECLARED_REPORT_RELEASE' })
    // Researcher-only bound REPORT release MUST NOT qualify for participant DESCRIPTIVE
    const researcherOnlyEligibility = evaluateSurveyUnitReportEligibility({ ...withReportRelease, reportReleaseAudience: 'researcher' })
    expect(researcherOnlyEligibility.eligible).toBe(false)
    expect(() => freezeSurveyParticipantFeedback(
      [{ ...withReportRelease, reportEligibility: researcherOnlyEligibility }],
      [{ instrumentId: draftId, feedback: { policyVersion: 'SURVEY_RAW_METRICS_V1', mode: 'DESCRIPTIVE', metricKeys: ['total'], release: 'AFTER_FINAL' } }],
      new Map([[draftId, ['total']]]),
    )).toThrow(/研究者|数据采集|报告/)
    freezeSurveyParticipantFeedback(
      [withReportRelease],
      [{ instrumentId: draftId, feedback: { policyVersion: 'SURVEY_RAW_METRICS_V1', mode: 'DESCRIPTIVE', metricKeys: ['total'], release: 'AFTER_FINAL' } }],
      new Map([[draftId, ['total']]]),
    )
    expect(withReportRelease.participantFeedback?.mode).toBe('DESCRIPTIVE')

    // 4. Standard triplet with reportConfigured=false -> blocked even if anything else looks set
    const tripletNoReport = baseSurveyScaleUnit({
      sourceProvenance: { surveyStandardReleaseId: 'std-1', reportConfigured: false },
    })
    expect(evaluateSurveyUnitReportEligibility(tripletNoReport).eligible).toBe(false)

    // 5. Bare self-authored SJT (no native protocol, no reportRelease) vs native SJT
    expect(evaluateSurveyUnitReportEligibility({ kind: 'SJT', compiledDefinition: {} }).eligible).toBe(false)
    expect(evaluateSurveyUnitReportEligibility({ kind: 'SJT', executionProtocol: 'SITUATIONAL_NATIVE_V1' }).eligible).toBe(true)
    expect(evaluateSurveyUnitReportEligibility({ kind: 'FORM' }).eligible).toBe(false)
    expect(evaluateSurveyUnitReportEligibility({ kind: 'COGNITIVE' }).eligible).toBe(true)
  })

  it('evaluates Education and Training tools consistently by tool configuration', () => {
    expect(evaluateEducationLeafReportEligibility({ kind: 'SCALE', sourceProvider: 'STANDARD_SCALE', standardReportConfigured: true }).eligible).toBe(true)
    expect(evaluateEducationLeafReportEligibility({ kind: 'SCALE', sourceProvider: 'STANDARD_SCALE', standardReportConfigured: false }).eligible).toBe(false)
    expect(evaluateEducationLeafReportEligibility({ kind: 'SCALE', sourceProvider: 'PRIVATE_VERSION', reportObject: { reportVersion: 'none-v1', interpretations: [] } }).eligible).toBe(false)
    expect(evaluateEducationLeafReportEligibility({ kind: 'SCALE', sourceProvider: 'PRIVATE_VERSION', reportObject: { reportVersion: 'none-v1', audienceContract: { schemaVersion: 1, respondent: 'STUDENT_SELF', audience: 'student', locale: 'zh-CN' } } }).eligible).toBe(false)
    expect(evaluateEducationLeafReportEligibility({ kind: 'SCALE', sourceProvider: 'PRIVATE_VERSION', reportObject: { reportVersion: 'survey-private-score-v1', interpretations: [] } }).eligible).toBe(false)
    expect(evaluateEducationLeafReportEligibility({ kind: 'SCALE', sourceProvider: 'PRIVATE_VERSION', reportObject: { reportVersion: 'survey-private-score-v1', audienceContract: { schemaVersion: 1, respondent: 'STUDENT_SELF', audience: 'student', locale: 'zh-CN' } } })).toMatchObject({ eligible: true, source: 'EDUCATION_AUDIENCE_CONTRACT' })
    expect(evaluateEducationLeafReportEligibility({ kind: 'SCALE', sourceProvider: 'PRIVATE_VERSION', reportObject: { rawScoreFeedback: sampleRawFeedback } }).eligible).toBe(true)
    expect(evaluateEducationLeafReportEligibility({ kind: 'FORM' }).eligible).toBe(false)

    const summary = summarizeCollectionReportEligibility([
      {
        id: 'item-1',
        title: '有报告量表',
        kind: 'SCALE',
        eligibility: evaluateTrainingItemReportEligibility({
          id: 'item-1',
          type: 'SCALE',
          scale: { definition: { report: { rawScoreFeedback: sampleRawFeedback } } },
        }),
      },
      {
        id: 'item-2',
        title: '纯采集标准量表',
        kind: 'SCALE',
        eligibility: evaluateTrainingItemReportEligibility(
          { id: 'item-2', type: 'SCALE', standardCombinationSource: { reference: { reportConfigured: false } } },
          { itemId: 'item-2', source: { standardCombination: {} } },
        ),
      },
    ])
    expect(summary).toMatchObject({ hasEligibleUnits: true, eligibleCount: 1, dataCollectionOnlyCount: 1 })
  })
})

describe('Survey participant declared report rendering and asset authorization', () => {
  const measurementReleaseId = '11111111-1111-4111-8111-111111111111'
  const reportReleaseId = '22222222-2222-4222-8222-222222222222'
  const assetId = '33333333-3333-4333-8333-333333333333'

  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('renders bound DECLARATIVE_REPORT_V1 with threshold-matched bands and authorizes referenced ASSET image', async () => {
    const unit = baseSurveyScaleUnit({
      sourceProvenance: { surveyStandardReleaseId: 'std-1', reportConfigured: true },
      contentSelection: {
        referencePolicy: { policyVersion: 'EXACT_POPULATION_PRIORITY_V1', measurementReleaseId, choices: [] },
        reportRelease: { releaseId: reportReleaseId, contentHash: hashC },
      },
      participantFeedback: {
        policyVersion: 'SURVEY_RAW_METRICS_V1',
        mode: 'DESCRIPTIVE',
        metricKeys: ['total'],
        release: 'AFTER_FINAL',
      },
    })

    const computed: SurveyComputedFinal = {
      schemaVersion: 1,
      definitionDigest: hashA,
      units: [],
      interpretation: {
        schemaVersion: 1,
        contentBindingHash: hashB,
        units: [
          {
            instrumentKey: 'scale_a',
            references: [
              {
                metricKey: 'total',
                referenceKind: 'criterion_threshold',
                status: 'AVAILABLE',
                values: { bandKey: 'high' },
              } as any,
            ],
            report: { status: 'READY', generatorVersion: 'DECLARATIVE_REPORT_V1' },
          },
        ],
      },
    }

    const projected: SurveyParticipantFeedbackProjection = {
      kind: 'DESCRIPTIVE',
      pending: false,
      measurements: [
        {
          feedbackKind: 'RAW_METRICS',
          pending: false,
          instrumentKey: 'scale_a',
          title: '示例量表',
          measurementReleaseId,
          metrics: [{ key: 'total', label: '总分', value: 8, unit: null, status: 'OK' }],
          quality: 'interpretable',
        },
      ],
    }

    mocks.getContentReleaseBatch.mockResolvedValue(
      new Map<string, any>([
        [
          measurementReleaseId,
          {
            releaseId: measurementReleaseId,
            layer: 'MEASUREMENT',
            contentHash: hashA,
            status: 'PUBLISHED',
            content: { metrics: [{ metricKey: 'total', unit: 'points' }] },
          },
        ],
        [
          reportReleaseId,
          {
            releaseId: reportReleaseId,
            layer: 'REPORT',
            contentHash: hashC,
            status: 'PUBLISHED',
            assetRefs: [{ assetId, sha256: hashA, mediaType: 'image/png' }],
            content: {
              measurements: [{ releaseId: measurementReleaseId, contentHash: hashA }],
              metricKeys: ['total', 'hidden_metric'],
              audience: 'student',
              generatorVersion: 'DECLARATIVE_REPORT_V1',
              template: {
                title: '标准量表完整报告',
                blocks: [
                  { type: 'TEXT', text: '报告导语' },
                  { type: 'REFERENCE_BAND', metricKey: 'total', referenceKind: 'criterion_threshold', bandKey: 'high', text: '高分阈值解读', guidance: ['继续保持良好习惯'] },
                  { type: 'REFERENCE_BAND', metricKey: 'total', referenceKind: 'criterion_threshold', bandKey: 'low', text: '低分阈值解读（不应出现）', guidance: [] },
                  { type: 'ASSET', assetId, alt: '阈值说明配图' },
                ],
                limitations: ['本报告仅反映本次作答表现。'],
                disclaimer: '不构成临床诊断。',
              },
            },
          },
        ],
      ]),
    )

    const enriched = await attachSurveyParticipantDeclaredReports([unit], computed, projected)
    expect(enriched.kind).toBe('DESCRIPTIVE')
    if (enriched.kind !== 'DESCRIPTIVE') throw new Error('expected DESCRIPTIVE')
    const item = enriched.measurements[0]
    expect('declaredReport' in item && item.declaredReport).toMatchObject({
      generatorVersion: 'DECLARATIVE_REPORT_V1',
      title: '标准量表完整报告',
      disclaimer: '不构成临床诊断。',
    })
    const blocks = ('declaredReport' in item && item.declaredReport?.blocks) || []
    expect(blocks).toContainEqual(expect.objectContaining({ type: 'REFERENCE_BAND', bandKey: 'high', text: '高分阈值解读' }))
    expect(blocks).not.toContainEqual(expect.objectContaining({ type: 'REFERENCE_BAND', bandKey: 'low' }))
    expect(blocks).toContainEqual(expect.objectContaining({ type: 'ASSET', assetId }))

    const resolvedAsset = await resolveSurveyDeclaredReportAsset([unit], enriched, assetId)
    expect(resolvedAsset).toEqual({ assetId, contentHash: hashA, mimeType: 'image/png' })
    expect(await resolveSurveyDeclaredReportAsset([unit], enriched, '44444444-4444-4444-8444-444444444444')).toBeNull()
  })

  it('skips declared report rendering when the REPORT release is REVOKED', async () => {
    const unit = baseSurveyScaleUnit({
      sourceProvenance: { surveyStandardReleaseId: 'std-1', reportConfigured: true },
      contentSelection: {
        referencePolicy: { policyVersion: 'EXACT_POPULATION_PRIORITY_V1', measurementReleaseId, choices: [] },
        reportRelease: { releaseId: reportReleaseId, contentHash: hashC },
      },
    })
    const computed: SurveyComputedFinal = {
      schemaVersion: 1,
      definitionDigest: hashA,
      units: [],
      interpretation: {
        schemaVersion: 1,
        contentBindingHash: hashB,
        units: [{ instrumentKey: 'scale_a', references: [], report: { status: 'READY', generatorVersion: 'DECLARATIVE_REPORT_V1' } }],
      },
    }
    const projected: SurveyParticipantFeedbackProjection = {
      kind: 'DESCRIPTIVE',
      pending: false,
      measurements: [
        {
          feedbackKind: 'RAW_METRICS',
          pending: false,
          instrumentKey: 'scale_a',
          title: '示例量表',
          measurementReleaseId,
          metrics: [{ key: 'total', label: '总分', value: 8, unit: null, status: 'OK' }],
          quality: 'interpretable',
        },
      ],
    }

    mocks.getContentReleaseBatch.mockResolvedValue(
      new Map<string, any>([
        [measurementReleaseId, { releaseId: measurementReleaseId, layer: 'MEASUREMENT', contentHash: hashA, status: 'PUBLISHED', content: { metrics: [{ metricKey: 'total', unit: 'points' }] } }],
        [reportReleaseId, { releaseId: reportReleaseId, layer: 'REPORT', contentHash: hashC, status: 'REVOKED', assetRefs: [], content: { measurements: [{ releaseId: measurementReleaseId, contentHash: hashA }], metricKeys: ['total'], generatorVersion: 'DECLARATIVE_REPORT_V1', template: { blocks: [] } } }],
      ]),
    )

    const enriched = await attachSurveyParticipantDeclaredReports([unit], computed, projected)
    if (enriched.kind !== 'DESCRIPTIVE') throw new Error('expected DESCRIPTIVE')
    expect('declaredReport' in enriched.measurements[0]).toBe(false)
  })

  it('never renders a researcher-only REPORT release on the participant side or authorizes its ASSET image', async () => {
    const unit = baseSurveyScaleUnit({
      contentSelection: {
        referencePolicy: { policyVersion: 'EXACT_POPULATION_PRIORITY_V1', measurementReleaseId, choices: [] },
        reportRelease: { releaseId: reportReleaseId, contentHash: hashC },
      },
      participantFeedback: {
        policyVersion: 'SURVEY_RAW_METRICS_V1',
        mode: 'DESCRIPTIVE',
        metricKeys: ['total'],
        release: 'AFTER_FINAL',
      },
    })
    const computed: SurveyComputedFinal = {
      schemaVersion: 1,
      definitionDigest: hashA,
      units: [],
      interpretation: {
        schemaVersion: 1,
        contentBindingHash: hashB,
        units: [{ instrumentKey: 'scale_a', references: [], report: { status: 'READY', generatorVersion: 'DECLARATIVE_REPORT_V1' } }],
      },
    }
    const projected: SurveyParticipantFeedbackProjection = {
      kind: 'DESCRIPTIVE',
      pending: false,
      measurements: [
        {
          feedbackKind: 'RAW_METRICS',
          pending: false,
          instrumentKey: 'scale_a',
          title: '示例量表',
          measurementReleaseId,
          metrics: [{ key: 'total', label: '总分', value: 8, unit: null, status: 'OK' }],
          quality: 'interpretable',
        },
      ],
    }

    mocks.getContentReleaseBatch.mockResolvedValue(
      new Map<string, any>([
        [measurementReleaseId, { releaseId: measurementReleaseId, layer: 'MEASUREMENT', contentHash: hashA, status: 'PUBLISHED', content: { metrics: [{ metricKey: 'total', unit: 'points' }] } }],
        [
          reportReleaseId,
          {
            releaseId: reportReleaseId,
            layer: 'REPORT',
            contentHash: hashC,
            status: 'PUBLISHED',
            assetRefs: [{ assetId, sha256: hashA, mediaType: 'image/png' }],
            content: {
              measurements: [{ releaseId: measurementReleaseId, contentHash: hashA }],
              metricKeys: ['total'],
              audience: 'researcher',
              generatorVersion: 'DECLARATIVE_REPORT_V1',
              template: {
                title: '仅研究者内部报告',
                blocks: [
                  { type: 'TEXT', text: '内部研究分析文本' },
                  { type: 'ASSET', assetId, alt: '内部研究图表' },
                ],
              },
            },
          },
        ],
      ]),
    )

    const enriched = await attachSurveyParticipantDeclaredReports([unit], computed, projected)
    if (enriched.kind !== 'DESCRIPTIVE') throw new Error('expected DESCRIPTIVE')
    expect('declaredReport' in enriched.measurements[0]).toBe(false)

    // Even if a forged projected payload carried a declaredReport pointing to the
    // researcher-only release's assetId, resolveSurveyDeclaredReportAsset refuses it.
    const forgedProjected: SurveyParticipantFeedbackProjection = {
      ...projected,
      measurements: [
        {
          ...(projected.measurements[0] as any),
          declaredReport: {
            generatorVersion: 'DECLARATIVE_REPORT_V1',
            blocks: [{ type: 'ASSET', assetId, alt: '内部研究图表' }],
          },
        },
      ],
    }
    expect(await resolveSurveyDeclaredReportAsset([unit], forgedProjected, assetId)).toBeNull()
  })
})
