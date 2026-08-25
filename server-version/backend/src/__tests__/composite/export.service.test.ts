import { beforeEach, describe, expect, it, vi } from 'vitest'
import { VariableType } from 'sav-writer'

process.env.DATA_ENCRYPTION_KEY = 'a'.repeat(64)

const { mockPrisma } = vi.hoisted(() => ({
  mockPrisma: {
    compositeAssessment: { findUnique: vi.fn() },
    compositeAssessmentAttempt: { count: vi.fn() },
    cognitiveTrial: { count: vi.fn() },
  },
}))

vi.mock('../../config/database', () => ({ prisma: mockPrisma }))

import { encryptCognitivePayload } from '../../modules/cognitive/cognitive.security'
import { compositeExportService, toSavVariables } from '../../modules/composite/composite-export.service'

const makeTemplate = (withTrials: boolean, metrics: Record<string, unknown> = { meanRtMs: 350, validTrialCount: 2 }) => ({
  id: 'composite-1',
  name: '量表+反应时综合测评',
  items: [{
    id: 'item-cognitive',
    type: 'COGNITIVE',
    position: 0,
    formLabel: null,
    scale: null,
    cognitiveAssignment: { title: '反应时任务' },
  }],
  attempts: [{
    id: 'attempt-1',
    userId: null,
    anonymousCode: 'ANON-1234ABCD',
    completedAt: new Date('2026-08-20T10:01:00.000Z'),
    totalTime: 60_000,
    user: null,
    formAnswers: [],
    scaleAssessments: [],
      cognitiveSessions: [{
      compositeItemId: 'item-cognitive',
      scoreEncrypted: encryptCognitivePayload(88),
      metricsEncrypted: encryptCognitivePayload(metrics),
      qualityFlagsEncrypted: encryptCognitivePayload({ interpretable: true }),
      trials: withTrials ? [
        { trialIndex: 0, payloadEncrypted: encryptCognitivePayload({ rtMs: 320, sequence: [1, 2, 3], response: ['left', 'right'], interrupted: false }) },
        { trialIndex: 1, payloadEncrypted: encryptCognitivePayload({ rtMs: 380, interrupted: false }) },
      ] : [],
    }],
  }],
})

const mixedFrozenReport = {
  profile: 'standard',
  profileDefinitionVersion: 'profile-2.0.0',
  metricDefinitionVersion: 'metric-2.1.0',
  qualityDefinitionVersion: 'quality-2.2.0',
  reportDefinitionVersion: 'report-2.3.0',
  randomizationAlgorithmVersion: 'random-2.4.0',
  reportCaveats: [],
  metricDefinitions: {
    zeroMetric: {
      key: 'zeroMetric',
      label: '冻结零指标',
      construct: 'speed',
      description: '冻结定义',
      unit: 'ms',
      valueType: 'number',
      direction: 'higher_is_better',
      role: 'primary',
      availableProfiles: ['standard'],
      export: { summary: true, label: '冻结零指标' },
    },
    nullMetric: {
      key: 'nullMetric',
      label: '冻结空指标',
      construct: 'speed',
      description: '冻结定义',
      unit: 'ms',
      valueType: 'number',
      direction: 'higher_is_better',
      role: 'secondary',
      availableProfiles: ['standard'],
      export: { summary: true, label: '冻结空指标' },
    },
  },
  qualityDefinitions: {},
  reportDefinition: {
    title: '冻结任务',
    headlineMetric: 'zeroMetric',
    primaryMetrics: ['zeroMetric'],
    secondaryMetrics: [],
    practicalTips: [],
    disclaimer: '仅供测试',
  },
}

const makeMixedTemplate = () => ({
  id: 'composite-mixed',
  name: '混合宽表测评',
  items: [
    {
      id: 'item-scale-a',
      type: 'SCALE',
      formLabel: null,
      scale: {
        id: 'scale-a',
        code: 'S-A',
        name: '量表 A',
        items: [{ id: 'scale-item-a', itemCode: 'A1', content: '题目 A' }],
        dimensions: [{ id: 'dimension-a', code: 'A', name: '维度 A' }],
      },
      cognitiveAssignment: null,
    },
    {
      id: 'item-scale-b',
      type: 'SCALE',
      formLabel: null,
      scale: {
        id: 'scale-b',
        code: 'S-B',
        name: '量表 B',
        items: [{ id: 'scale-item-b', itemCode: 'B1', content: '题目 B' }],
        dimensions: [{ id: 'dimension-b', code: 'B', name: '维度 B' }],
      },
      cognitiveAssignment: null,
    },
    {
      id: 'item-cog-a',
      type: 'COGNITIVE',
      formLabel: null,
      scale: null,
      cognitiveAssignment: {
        title: '认知 A',
        profile: 'standard',
        resolvedReportSnapshotEncrypted: encryptCognitivePayload(mixedFrozenReport),
      },
    },
    {
      id: 'item-cog-b',
      type: 'COGNITIVE',
      formLabel: null,
      scale: null,
      cognitiveAssignment: {
        title: '认知 B',
        profile: 'standard',
        resolvedReportSnapshotEncrypted: encryptCognitivePayload(mixedFrozenReport),
      },
    },
  ],
  attempts: [{
    id: 'attempt-mixed',
    userId: null,
    anonymousCode: 'ANON-MIXED',
    completedAt: new Date('2026-08-20T10:01:00.000Z'),
    totalTime: 0,
    user: null,
    formAnswers: [],
    scaleAssessments: [
      {
        compositeItemId: 'item-scale-a',
        answers: [],
        scores: [{ dimensionId: 'dimension-a', rawScore: 0, normalizedScore: 0 }],
      },
      {
        compositeItemId: 'item-scale-b',
        answers: [],
        scores: [{ dimensionId: 'dimension-b', rawScore: null, normalizedScore: null }],
      },
    ],
    cognitiveSessions: [
      {
        compositeItemId: 'item-cog-a',
        assignment: {
          title: '认知 A',
          profile: 'standard',
          resolvedReportSnapshotEncrypted: encryptCognitivePayload(mixedFrozenReport),
        },
        testType: 'reaction',
        engineVersion: 'engine-1.0.0',
        scoringVersion: 'scoring-1.1.0',
        configVersion: 'config-1.2.0',
        scoreEncrypted: encryptCognitivePayload(0),
        metricsEncrypted: encryptCognitivePayload({ zeroMetric: 0, nullMetric: null }),
        qualityFlagsEncrypted: encryptCognitivePayload({ interpretable: false }),
        trials: [],
      },
      {
        compositeItemId: 'item-cog-b',
        assignment: {
          title: '认知 B',
          profile: 'standard',
          resolvedReportSnapshotEncrypted: encryptCognitivePayload(mixedFrozenReport),
        },
        testType: 'reaction',
        engineVersion: 'engine-1.0.1',
        scoringVersion: 'scoring-1.1.1',
        configVersion: 'config-1.2.1',
        scoreEncrypted: encryptCognitivePayload(null),
        metricsEncrypted: encryptCognitivePayload({ zeroMetric: null }),
        qualityFlagsEncrypted: encryptCognitivePayload({ interpretable: true }),
        trials: [],
      },
    ],
  }],
})

beforeEach(() => {
  vi.clearAllMocks()
  mockPrisma.compositeAssessmentAttempt.count.mockResolvedValue(0)
  mockPrisma.cognitiveTrial.count.mockResolvedValue(0)
})

describe('composite export service', () => {
  it('rejects an oversized attempt scope before loading the composite graph', async () => {
    mockPrisma.compositeAssessmentAttempt.count.mockResolvedValue(10_001)

    await expect(compositeExportService.getExportData('composite-mixed')).rejects.toMatchObject({ statusCode: 413 })
    expect(mockPrisma.compositeAssessment.findUnique).not.toHaveBeenCalled()
  })

  it('rejects an oversized full-export trial scope before loading nested trials', async () => {
    mockPrisma.compositeAssessmentAttempt.count.mockResolvedValue(1)
    mockPrisma.cognitiveTrial.count.mockResolvedValue(100_001)

    await expect(compositeExportService.getExportData('composite-mixed', { detail: 'full' })).rejects.toMatchObject({ statusCode: 413 })
    expect(mockPrisma.compositeAssessment.findUnique).not.toHaveBeenCalled()
  })

  it('exports a stable mixed summary row with repeated slots, provenance, frozen labels, zero and null', async () => {
    mockPrisma.compositeAssessment.findUnique.mockResolvedValue(makeMixedTemplate())

    const data = await compositeExportService.getExportData('composite-mixed', { detail: 'summary' })
    const row = data.rows[0]
    const names = data.fields.map((field) => field.name)

    expect(data.rows).toHaveLength(1)
    expect(data.trialCount).toBe(0)
    expect(new Set(names).size).toBe(names.length)
    expect(row).toMatchObject({
      A_duration_s: 0,
      S001_scale_id: 'scale-a',
      S001_scale_code: 'S-A',
      S001_report_definition_version: 'scale-unit-report-v1',
      S001_D_a: 0,
      S002_scale_id: 'scale-b',
      S002_scale_code: 'S-B',
      S002_D_b: null,
      C003_score: 0,
      C003_quality: 'insufficient',
      C003_profile: 'standard',
      C003_profile_definition_version: 'profile-2.0.0',
      C003_metric_definition_version: 'metric-2.1.0',
      C003_quality_definition_version: 'quality-2.2.0',
      C003_test_type: 'reaction',
      C003_engine_version: 'engine-1.0.0',
      C003_scoring_version: 'scoring-1.1.0',
      C003_config_version: 'config-1.2.0',
      C003_randomization_algorithm_version: 'random-2.4.0',
      C003_report_definition_version: 'report-2.3.0',
      C003_M_zerometric: 0,
      C003_M_nullmetric: null,
      C004_score: null,
      C004_quality: 'interpretable',
      C004_M_zerometric: null,
    })
    expect(data.fields.find((field) => field.name === 'C003_M_zerometric')?.label).toContain('冻结零指标')
    expect(data.fields.find((field) => field.name === 'C003_M_nullmetric')?.type).toBe('numeric')
  })

  it('predeclares frozen scalar columns even with zero attempts and keeps SAV nullability typed', async () => {
    const withAttempt = makeMixedTemplate()
    mockPrisma.compositeAssessment.findUnique.mockResolvedValueOnce(withAttempt).mockResolvedValueOnce({ ...withAttempt, attempts: [] })

    const populated = await compositeExportService.getExportData('composite-mixed', { detail: 'summary' })
    const empty = await compositeExportService.getExportData('composite-mixed', { detail: 'summary', dateRange: { start: '2030-01-01', end: '2030-01-02' } })
    expect(empty.rows).toEqual([])
    expect(empty.fields.map((field) => [field.name, field.type])).toEqual(populated.fields.map((field) => [field.name, field.type]))
    const csv = compositeExportService.exportToCSV(populated)
    expect(csv).toContain('0')
    expect(csv).toContain('C003_M_nullmetric')
    const sav = toSavVariables(populated.fields)
    expect(sav.find((variable) => variable.name === 'C003_M_nullmetric')?.type).toBe(VariableType.Numeric)
    expect(sav.find((variable) => variable.name === 'C003_M_nullmetric')?.measure).toBeDefined()
  })

  it('exports summary metrics without raw trials', async () => {
    mockPrisma.compositeAssessment.findUnique.mockResolvedValue(makeTemplate(false))

    const data = await compositeExportService.getExportData('composite-1', { detail: 'summary' })

    expect(data.rows[0]).toMatchObject({
      U_id: 'ANON-1234ABCD',
      C001_score: 88,
      C001_quality: 'interpretable',
    })
    expect(data.fields.map((field) => field.name)).toContain('C001_M_meanrtms')
    expect(data.fields.some((field) => field.name.includes('t001'))).toBe(false)
    expect(data.trialCount).toBe(0)
  })

  it('omits the product-index score column for a frozen BART report', async () => {
    const template: any = makeTemplate(false)
    template.items[0].cognitiveAssignment = {
      title: 'BART 泵压任务',
      profile: 'standard',
      resolvedReportSnapshotEncrypted: encryptCognitivePayload({
        profile: 'standard',
        reportDefinition: { showProductIndex: false },
        metricDefinitions: {},
      }),
    }
    mockPrisma.compositeAssessment.findUnique.mockResolvedValue(template)

    const data = await compositeExportService.getExportData('composite-1', { detail: 'summary' })

    expect(data.fields.some((field) => field.name === 'C001_score')).toBe(false)
    expect(data.rows[0]).not.toHaveProperty('C001_score')
  })

  it('uses the frozen package slot label instead of a live wrapper title', async () => {
    const template: any = makeTemplate(false)
    template.reportPackageKey = 'attention_stability_v1'
    template.reportPackageVersion = '1.0.0'
    template.reportPackageSnapshotEncrypted = encryptCognitivePayload({
      snapshotVersion: 1,
      packageKey: 'attention_stability_v1',
      packageVersion: '1.0.0',
      packageDefinition: { slots: [{ position: 0, label: '冻结槽位名称' }] },
      analysisProtocolSnapshot: {},
    })
    template.items[0].cognitiveAssignment.title = 'live wrapper title'
    mockPrisma.compositeAssessment.findUnique.mockResolvedValue(template)

    const data = await compositeExportService.getExportData('composite-1', { detail: 'summary' })

    expect(data.fields.find((field) => field.name === 'C001_score')?.label).toContain('冻结槽位名称')
  })

  it('exports each cognitive trial value in full mode', async () => {
    mockPrisma.compositeAssessment.findUnique.mockResolvedValue(makeTemplate(true))

    const data = await compositeExportService.getExportData('composite-1', { detail: 'full' })
    const csv = compositeExportService.exportToCSV(data)

    expect(data.trialCount).toBe(2)
    expect(data.rows[0]).toMatchObject({
      C001_T001_rtms: 320,
      C001_T002_rtms: 380,
      C001_T001_sequence: '[1,2,3]',
      C001_T001_response: '["left","right"]',
    })
    expect(csv).toContain('320')
    expect(csv).toContain('380')
    expect(csv).toContain('"[1,2,3]"')
    expect(csv).toContain('"[""left"",""right""]"')
  })

  it('keeps normalized dynamic keys distinct', async () => {
    mockPrisma.compositeAssessment.findUnique.mockResolvedValue(makeTemplate(false, { 'foo-bar': 'first', foo_bar: 'second' }))

    const data = await compositeExportService.getExportData('composite-1', { detail: 'summary' })
    const collidingFields = data.fields.filter((field) => field.label.includes('foo'))

    expect(collidingFields).toHaveLength(2)
    expect(new Set(collidingFields.map((field) => field.name)).size).toBe(2)
    expect(collidingFields.map((field) => data.rows[0][field.name])).toEqual(expect.arrayContaining(['first', 'second']))
  })

  it('neutralizes spreadsheet formulas in CSV values', () => {
    const csv = compositeExportService.exportToCSV({
      fields: [{ name: 'value', label: 'value', type: 'string' }],
      rows: [{ value: '=HYPERLINK("https://example.com")' }],
    })
    expect(csv).toContain("'=HYPERLINK")
  })

  it('keeps negative numeric values numeric in CSV output', () => {
    const csv = compositeExportService.exportToCSV({
      fields: [{ name: 'score', label: 'score', type: 'numeric' }],
      rows: [{ score: -3 }],
    })
    expect(csv).toContain('-3')
    expect(csv).not.toContain("'-3")
  })
})
