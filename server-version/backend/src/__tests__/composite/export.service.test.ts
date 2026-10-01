import { beforeEach, describe, expect, it, vi } from 'vitest'
import { VariableType } from 'sav-writer'

process.env.DATA_ENCRYPTION_KEY = 'a'.repeat(64)

const { mockPrisma } = vi.hoisted(() => ({
  mockPrisma: {
    $queryRaw: vi.fn(),
    compositeAssessment: { findUnique: vi.fn() },
    compositeAssessmentAttempt: { count: vi.fn() },
    cognitiveTrial: { count: vi.fn() },
  },
}))

vi.mock('../../config/database', () => ({ prisma: mockPrisma }))

import { encryptCognitivePayload } from '../../modules/cognitive/cognitive.security'
import { encryptScaleAnswers } from '../../modules/scale/scale-workflow.service'
import { compositeExportService, toSavVariables } from '../../modules/composite/composite-export.service'

const makeScaleDefinition = (itemCode: string, scoreKeys: string[]) => ({
  schemaVersion: 2,
  respondentType: 'participant_self_report',
  source: { title: '测试量表', citation: '测试来源' },
  license: { status: 'authorized', redistribution: 'restricted' },
  display: { randomizeItems: false },
  responseSets: [{ key: 'default', options: [{ value: 'never', label: '从不', score: 0 }] }],
  items: [{ itemCode, content: `题目 ${itemCode}`, type: 'single', required: true, sortOrder: 0, responseSetKey: 'default', randomizeOptions: false }],
  scoring: {
    scoringVersion: '2.0.0',
    itemRules: [{ itemCode, transform: { type: 'identity' } }],
    defaultMissingPolicy: { type: 'complete_required' },
    scores: scoreKeys.map((key) => ({
      key,
      type: 'dimension',
      label: `维度 ${key}`,
      direction: 'descriptive',
      canonical: true,
      displayPrecision: 0,
      missingPolicy: { type: 'complete_required' },
      source: { type: 'items', items: [{ itemCode, weight: 1 }], aggregation: 'sum' },
    })),
  },
  report: {
    reportVersion: '2.0.0',
    primaryScoreKeys: scoreKeys,
    scoreOrder: scoreKeys,
    interpretations: scoreKeys.map((key) => ({ scoreKey: key, headline: `维度 ${key}`, source: { type: 'score_only' }, summary: '描述性结果', bands: [], guidance: [] })),
    limitations: [],
    disclaimer: '仅供测试',
  },
  referencePolicy: { type: 'none' },
})

const makeScaleResult = (input: {
  scaleId: string
  code: string
  name: string
  itemCode: string
  scores: Array<{ key: string; value: number | null; status?: 'calculated' | 'limited' | 'not_calculable' }>
}) => ({
  schemaVersion: 2,
  instrument: { scaleId: input.scaleId, code: input.code, name: input.name, instrumentVersion: '2.0.0' },
  method: {
    scaleId: input.scaleId,
    instrumentVersion: '2.0.0',
    scoringVersion: '2.0.0',
    reportVersion: '2.0.0',
    definitionHash: 'h'.repeat(64),
    referenceVersions: [],
    assessmentContext: null,
  },
  quality: {
    status: input.scores.every((score) => score.value !== null) ? 'interpretable' : 'invalid',
    flags: input.scores.every((score) => score.value !== null) ? [] : ['score_not_calculable'],
  },
  itemScores: input.scores.some((score) => score.value !== null)
    ? [{ itemCode: input.itemCode, responseValue: 'never', baseScore: 0, score: 0 }]
    : [],
  scores: input.scores.map((score) => ({
    key: score.key,
    type: 'dimension',
    label: `维度 ${score.key}`,
    direction: 'descriptive',
    canonical: true,
    displayPrecision: 0,
    value: score.value,
    range: { min: 0, max: 10 },
    expectedItems: [input.itemCode],
    answeredItems: score.value === null ? [] : [input.itemCode],
    status: score.status ?? (score.value === null ? 'not_calculable' : 'calculated'),
    prorated: false,
  })),
  references: [],
  interpretations: [],
  caveats: [],
  disclaimer: '仅供测试',
})

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

const scaleProvenance = {
  schemaVersion: 1 as const,
  deviceClass: 'DESKTOP' as const,
  osFamily: 'Windows' as const,
  browserFamily: 'Chrome' as const,
  viewportWidth: 1280,
  viewportHeight: 720,
  screenWidth: 1920,
  screenHeight: 1080,
  devicePixelRatio: 1,
  maxTouchPoints: 0,
  primaryPointer: 'FINE' as const,
  capturedAt: '2026-08-20T10:00:00.000Z',
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
        instrumentClass: 'CUSTOM_DESCRIPTIVE',
        instrumentVersion: '2.0.0',
        definition: makeScaleDefinition('A1', ['A']),
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
        instrumentClass: 'CUSTOM_DESCRIPTIVE',
        instrumentVersion: '2.0.0',
        definition: makeScaleDefinition('B1', ['B']),
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
        answers: encryptScaleAnswers([{ itemCode: 'A1', responseValue: 'never', responseTimeMs: 321 }], scaleProvenance),
        result: makeScaleResult({ scaleId: 'scale-a', code: 'S-A', name: '量表 A', itemCode: 'A1', scores: [{ key: 'A', value: 0 }] }),
      },
      {
        compositeItemId: 'item-scale-b',
        answers: [],
        result: makeScaleResult({ scaleId: 'scale-b', code: 'S-B', name: '量表 B', itemCode: 'B1', scores: [{ key: 'B', value: null }] }),
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
  mockPrisma.$queryRaw.mockResolvedValue([])
  vi.clearAllMocks()
  mockPrisma.compositeAssessmentAttempt.count.mockResolvedValue(0)
  mockPrisma.cognitiveTrial.count.mockResolvedValue(0)
})

describe('composite export service', () => {
  it('rejects governed Run data before generic bulk export materialization', async () => {
    mockPrisma.$queryRaw.mockResolvedValue([{id:'governed-execution'}])
    await expect(compositeExportService.getExportData('composite-mixed')).rejects.toMatchObject({statusCode:403})
    expect(mockPrisma.compositeAssessmentAttempt.count).not.toHaveBeenCalled()
  })
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
      S001_report_definition_version: '2.0.0',
      S001_SCORE_a: 0,
      S001_device_class: 'DESKTOP',
      S001_device_os_family: 'Windows',
      S001_device_browser_family: 'Chrome',
      S001_device_viewport_width: 1280,
      S001_device_captured_at: '2026-08-20T10:00:00.000Z',
      S002_scale_id: 'scale-b',
      S002_scale_code: 'S-B',
      S002_report_definition_version: '2.0.0',
      S002_SCORE_b: null,
      S002_device_class: null,
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
    const query = mockPrisma.compositeAssessment.findUnique.mock.calls[0][0]

    expect(data.rows[0]).toMatchObject({
      U_id: 'ANON-1234ABCD',
      C001_score: 88,
      C001_quality: 'interpretable',
    })
    expect(data.fields.map((field) => field.name)).toContain('C001_M_meanrtms')
    expect(data.fields.some((field) => field.name.includes('t001'))).toBe(false)
    expect(data.trialCount).toBe(0)
    expect(query.include.attempts.include.cognitiveSessions.include).not.toHaveProperty('trials')
    expect(query.include.items.include.scale.select).toHaveProperty('definition')
    expect(query.include.attempts.include.scaleAssessments.select).toMatchObject({ answers: true, result: true })
    expect(query.include.attempts.include.scaleAssessments.select).not.toHaveProperty('scores')
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

  it('exports v2 metrics and three-state quality without a generic score', async () => {
    const template: any = makeTemplate(false)
    template.items[0].cognitiveAssignment = {
      title: 'v2 反应时任务',
      profile: 'standard',
      resolvedReportSnapshotEncrypted: null,
      config: { testType: 'reaction', engineVersion: '1.0.0', scoringVersion: '1.1.0' },
    }
    template.attempts[0].cognitiveSessions[0] = {
      ...template.attempts[0].cognitiveSessions[0],
      scoreEncrypted: null,
      metricsEncrypted: encryptCognitivePayload({}),
      qualityFlagsEncrypted: encryptCognitivePayload({}),
      resultSnapshotEncrypted: encryptCognitivePayload({
        schemaVersion: 1,
        completedAt: '2026-08-20T10:01:00.000Z',
        testType: 'reaction',
        configVersion: '1.1.0',
        engineVersion: '1.0.0',
        scoringVersion: '1.1.0',
        protocolSignature: 'a'.repeat(64),
        profile: 'standard',
        metrics: { medianRtMs: 350, missRate: 0 },
        quality: { state: 'interpretable', flags: {}, reasons: [] },
        references: [],
        report: { qualityState: 'interpretable' },
        assessmentContext: null,
      }),
    }
    mockPrisma.compositeAssessment.findUnique.mockResolvedValue(template)

    const data = await compositeExportService.getExportData('composite-1', { detail: 'summary' })

    expect(data.fields.some((field) => field.name === 'C001_score')).toBe(false)
    expect(data.rows[0]).toMatchObject({
      C001_quality: 'interpretable',
      C001_test_type: 'reaction',
      C001_config_version: '1.1.0',
      C001_M_medianrtms: 350,
    })
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
    const query = mockPrisma.compositeAssessment.findUnique.mock.calls[0][0]
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
    expect(query.include.attempts.include.cognitiveSessions.include).toHaveProperty('trials')
    expect(query.include.items.include.scale.select).toHaveProperty('definition')
    expect(query.include.attempts.include.scaleAssessments.select).toMatchObject({ answers: true, result: true })
    expect(query.include.attempts.include.scaleAssessments.select).not.toHaveProperty('scores')
  })

  it('keeps normalized dynamic keys distinct', async () => {
    mockPrisma.compositeAssessment.findUnique.mockResolvedValue(makeTemplate(false, { 'foo-bar': 'first', foo_bar: 'second' }))

    const data = await compositeExportService.getExportData('composite-1', { detail: 'summary' })
    const collidingFields = data.fields.filter((field) => field.label.includes('foo'))

    expect(collidingFields).toHaveLength(2)
    expect(new Set(collidingFields.map((field) => field.name)).size).toBe(2)
    expect(collidingFields.map((field) => data.rows[0][field.name])).toEqual(expect.arrayContaining(['first', 'second']))
  })

  it('keeps frozen metric values distinct when normalized keys collide', async () => {
    const template: any = makeTemplate(false, { 'a-b': 11, a_b: 22 })
    const metricDefinitions = {
      'a-b': { label: '指标 a-b', valueType: 'number', export: { summary: true, label: '指标 a-b' } },
      a_b: { label: '指标 a_b', valueType: 'number', export: { summary: true, label: '指标 a_b' } },
    }
    template.items[0].cognitiveAssignment = {
      title: '冻结碰撞任务',
      profile: 'standard',
      resolvedReportSnapshotEncrypted: encryptCognitivePayload({
        ...mixedFrozenReport,
        metricDefinitions,
      }),
    }
    mockPrisma.compositeAssessment.findUnique.mockResolvedValue(template)

    const data = await compositeExportService.getExportData('composite-1', { detail: 'summary' })
    const collidingFields = data.fields.filter((field) => field.label.includes('指标 a'))

    expect(collidingFields).toHaveLength(2)
    expect(new Set(collidingFields.map((field) => field.name)).size).toBe(2)
    expect(collidingFields.map((field) => data.rows[0][field.name])).toEqual(expect.arrayContaining([11, 22]))
  })

  it('keeps frozen metric names distinct after long-name truncation', async () => {
    const keyA = `${'long_metric_'.repeat(8)}a`
    const keyB = `${'long_metric_'.repeat(8)}b`
    const template: any = makeTemplate(false, { [keyA]: 31, [keyB]: 47 })
    const metricDefinitions = {
      [keyA]: { label: '长指标 A', valueType: 'number', export: { summary: true, label: '长指标 A' } },
      [keyB]: { label: '长指标 B', valueType: 'number', export: { summary: true, label: '长指标 B' } },
    }
    template.items[0].cognitiveAssignment = {
      title: '冻结长字段任务',
      profile: 'standard',
      resolvedReportSnapshotEncrypted: encryptCognitivePayload({
        ...mixedFrozenReport,
        metricDefinitions,
      }),
    }
    mockPrisma.compositeAssessment.findUnique.mockResolvedValue(template)

    const data = await compositeExportService.getExportData('composite-1', { detail: 'summary' })
    const longFields = data.fields.filter((field) => field.label.includes('长指标'))

    expect(longFields).toHaveLength(2)
    expect(new Set(longFields.map((field) => field.name)).size).toBe(2)
    expect(longFields.every((field) => field.name.length <= 64)).toBe(true)
    expect(longFields.map((field) => data.rows[0][field.name])).toEqual(expect.arrayContaining([31, 47]))
  })

  it('keeps dimension values distinct when scale dimension codes normalize to one name', async () => {
    const template: any = makeMixedTemplate()
    template.items[0].scale.definition = makeScaleDefinition('A1', ['a-b', 'a_b'])
    template.attempts[0].scaleAssessments[0].result = makeScaleResult({
      scaleId: 'scale-a',
      code: 'S-A',
      name: '量表 A',
      itemCode: 'A1',
      scores: [{ key: 'a-b', value: 13 }, { key: 'a_b', value: 29 }],
    })
    mockPrisma.compositeAssessment.findUnique.mockResolvedValue(template)

    const data = await compositeExportService.getExportData('composite-mixed', { detail: 'summary' })
    const dimensionFields = data.fields.filter((field) => field.label.includes('维度 a'))

    expect(dimensionFields).toHaveLength(2)
    expect(new Set(dimensionFields.map((field) => field.name)).size).toBe(2)
    expect(dimensionFields.map((field) => data.rows[0][field.name])).toEqual(expect.arrayContaining([13, 29]))
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
