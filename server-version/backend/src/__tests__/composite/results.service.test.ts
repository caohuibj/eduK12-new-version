import { beforeEach, describe, expect, it, vi } from 'vitest'
import { UserRole } from '@prisma/client'

process.env.DATA_ENCRYPTION_KEY = 'a'.repeat(64)
process.env.DATA_PSEUDONYM_KEY = 'b'.repeat(64)
process.env.COGNITIVE_MODULE_ENABLED = 'true'

const { mockPrisma } = vi.hoisted(() => ({
  mockPrisma: {
    compositeAssessment: {
      findMany: vi.fn(),
      findUnique: vi.fn(),
    },
    compositeAssessmentAttempt: {
      groupBy: vi.fn(),
      findMany: vi.fn(),
      findUnique: vi.fn(),
      count: vi.fn(),
    },
    relationalAssessmentAssignment: {
      findMany: vi.fn().mockResolvedValue([]),
      findUnique: vi.fn(),
    },
  },
}))

vi.mock('../../config/database', () => ({ prisma: mockPrisma }))

import { encryptCognitivePayload } from '../../modules/cognitive/cognitive.security'
import { resolveCognitiveReferenceForResult } from '../../modules/cognitive/reference'
import { readFrozenReport } from '../../modules/cognitive/profile-freeze'
import { buildCognitiveSingleTaskReport } from '../../modules/cognitive/single-task-report'
import { buildQuestionnaireCollectionReport } from '../../modules/reporting/questionnaire-collection-report'
import { projectCompositeCollectionReport } from '../../modules/composite/composite-report.projector'
import {
  buildCompositeReport,
  getCompositeForTeacher,
  getReport,
  getReportForTeacher,
  getExportContext,
  listAttemptsForTeacher,
  listComposites,
} from '../../modules/composite/composite.service'

const TEACHER = UserRole.TEACHER
const ADMIN = UserRole.ADMIN
const page = { page: 1, pageSize: 20 }

const makeScaleResult = (input: {
  scaleId: string
  code: string
  name: string
  scoreKey: string
  value: number | null
}) => ({
  schemaVersion: 2 as const,
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
    status: input.value === null ? 'invalid' as const : 'interpretable' as const,
    flags: input.value === null ? ['score_not_calculable' as const] : [],
  },
  itemScores: input.value === null ? [] : [{ itemCode: 'Q1', responseValue: 'never', baseScore: 0, score: 0 }],
  scores: [{
    key: input.scoreKey,
    type: 'dimension' as const,
    label: input.scoreKey,
    direction: 'descriptive' as const,
    canonical: true,
    displayPrecision: 0,
    value: input.value,
    range: { min: 0, max: 10 },
    expectedItems: ['Q1'],
    answeredItems: input.value === null ? [] : ['Q1'],
    status: input.value === null ? 'not_calculable' as const : 'calculated' as const,
    prorated: false,
  }],
  references: [],
  interpretations: [],
  caveats: [],
  disclaimer: '同一项免责声明',
})

const compositeRow = (overrides: Record<string, unknown> = {}) => ({
  id: 'composite-1',
  code: 'C-1',
  name: '综合测评 1',
  description: null,
  instruction: null,
  status: 'PUBLISHED',
  courseId: 'course-1',
  createdBy: 'teacher-a',
  opensAt: null,
  expiresAt: null,
  maxAttempts: 1,
  publicEnabled: false,
  publishedAt: new Date('2026-08-20T00:00:00Z'),
  course: { id: 'course-1', title: '课', courseCode: 'C001' },
  items: [],
  _count: { attempts: 9, accessTokens: 3 },
  ...overrides,
})

const attemptRow = (overrides: Record<string, unknown> = {}) => ({
  id: 'attempt-1',
  status: 'COMPLETED',
  progress: 100,
  completedItems: 2,
  startedAt: new Date('2026-08-20T01:00:00Z'),
  lastSavedAt: new Date('2026-08-20T01:05:00Z'),
  completedAt: new Date('2026-08-20T01:05:00Z'),
  totalTime: 300000,
  anonymousCode: null,
  userId: 'student-1',
  user: { id: 'student-1', nickname: '小明', username: 'stu1' },
  ...overrides,
})

const completedAttemptForReport = (overrides: Record<string, unknown> = {}) => ({
  id: 'attempt-1',
  compositeAssessmentId: 'composite-1',
  userId: 'student-1',
  recoveryTokenHash: 'hash-should-not-leak',
  anonymousCode: null,
  status: 'COMPLETED',
  completedAt: new Date('2026-08-20T01:05:00Z'),
  totalTime: 300000,
  compositeAssessment: {
    id: 'composite-1',
    name: '综合测评 1',
    items: [
      { id: 'item-form', type: 'FORM', formLabel: '年级', scale: null, cognitiveAssignment: null },
      { id: 'item-scale', type: 'SCALE', scaleId: 'scale-1', scale: { id: 'scale-1', code: 'adexi_v1', name: '量表 A', instrumentVersion: '2.0.0' }, cognitiveAssignment: null },
      {
        id: 'item-cog',
        type: 'COGNITIVE',
        scale: null,
        cognitiveAssignment: { title: '反应时' },
      },
    ],
  },
  scaleAssessments: [{
    compositeItemId: 'item-scale',
    result: makeScaleResult({ scaleId: 'scale-1', code: 'adexi_v1', name: '量表 A', scoreKey: 'A', value: 12 }),
    completedAt: new Date('2026-08-20T01:04:00Z'),
    totalTime: 4000,
  }],
  cognitiveSessions: [{
    id: 'session-1',
    compositeItemId: 'item-cog',
    testType: 'reaction',
    finishedAt: new Date('2026-08-20T01:05:00Z'),
    configSnapshotEncrypted: encryptCognitivePayload({ report: { referenceMode: 'none' } }),
    scoreEncrypted: encryptCognitivePayload(88),
    metricsEncrypted: encryptCognitivePayload({ meanRtMs: 350 }),
    qualityFlagsEncrypted: encryptCognitivePayload({ interpretable: true }),
  }],
  formAnswers: [{ itemId: 'item-form', value: '三年级' }],
  ...overrides,
})

beforeEach(() => {
  vi.clearAllMocks()
  mockPrisma.compositeAssessmentAttempt.groupBy.mockResolvedValue([])
  mockPrisma.compositeAssessmentAttempt.findMany.mockResolvedValue([])
  mockPrisma.compositeAssessmentAttempt.count.mockResolvedValue(0)
})

describe('listComposites attemptCounts', () => {
  it('skips groupBy for an empty list and never returns _count', async () => {
    mockPrisma.compositeAssessment.findMany.mockResolvedValue([])

    const list = await listComposites('teacher-a', TEACHER)

    expect(mockPrisma.compositeAssessmentAttempt.groupBy).not.toHaveBeenCalled()
    expect(list).toEqual([])
  })

  it('maps mixed statuses and strips prisma _count from the payload', async () => {
    mockPrisma.compositeAssessment.findMany.mockResolvedValue([
      compositeRow(),
      compositeRow({ id: 'composite-2', code: 'C-2', name: '综合测评 2', items: [], _count: { attempts: 1, accessTokens: 0 } }),
    ])
    mockPrisma.compositeAssessmentAttempt.groupBy.mockResolvedValue([
      { compositeAssessmentId: 'composite-1', status: 'COMPLETED', _count: { _all: 2 } },
      { compositeAssessmentId: 'composite-1', status: 'IN_PROGRESS', _count: { _all: 1 } },
      { compositeAssessmentId: 'composite-1', status: 'ABANDONED', _count: { _all: 1 } },
    ])

    const list = await listComposites('teacher-a', TEACHER)

    expect(mockPrisma.compositeAssessmentAttempt.groupBy).toHaveBeenCalledWith({
      by: ['compositeAssessmentId', 'status'],
      where: {
        AND: [
          { compositeAssessmentId: { in: ['composite-1', 'composite-2'] } },
          {
            OR: [
              { assignmentRef: null },
              { assignmentRef: { in: [] } },
            ],
          },
        ],
      },
      _count: { _all: true },
    })
    expect(list[0].attemptCounts).toEqual({ started: 4, inProgress: 1, completed: 2, abandoned: 1 })
    expect(list[1].attemptCounts).toEqual({ started: 0, inProgress: 0, completed: 0, abandoned: 0 })
    expect(list[0]).not.toHaveProperty('_count')
    expect(list[1]).not.toHaveProperty('_count')
  })
})

describe('getCompositeForTeacher attemptCounts', () => {
  it('returns the same count shape as the list and omits _count', async () => {
    mockPrisma.compositeAssessment.findUnique.mockResolvedValue(compositeRow({ items: [] }))
    mockPrisma.compositeAssessmentAttempt.groupBy.mockResolvedValue([
      { compositeAssessmentId: 'composite-1', status: 'COMPLETED', _count: { _all: 3 } },
    ])

    const detail = await getCompositeForTeacher('teacher-a', TEACHER, 'composite-1')

    expect(detail.attemptCounts).toEqual({ started: 3, inProgress: 0, completed: 3, abandoned: 0 })
    expect(detail).not.toHaveProperty('_count')
  })
})

describe('listAttemptsForTeacher', () => {
  it('forbids another teacher and lets ADMIN read', async () => {
    mockPrisma.compositeAssessment.findUnique.mockResolvedValue(compositeRow())

    await expect(listAttemptsForTeacher('teacher-b', TEACHER, 'composite-1', page))
      .rejects.toMatchObject({ statusCode: 403 })
    expect(mockPrisma.compositeAssessmentAttempt.findMany).not.toHaveBeenCalled()

    mockPrisma.compositeAssessmentAttempt.findMany.mockResolvedValue([attemptRow()])
    mockPrisma.compositeAssessmentAttempt.count.mockResolvedValue(1)
    const adminResult = await listAttemptsForTeacher('admin-1', ADMIN, 'composite-1', page)
    expect(adminResult.total).toBe(1)
    expect(adminResult.list).toHaveLength(1)
  })

  it('splits nickname and username, and never returns recoveryTokenHash', async () => {
    mockPrisma.compositeAssessment.findUnique.mockResolvedValue(compositeRow())
    mockPrisma.compositeAssessmentAttempt.findMany.mockResolvedValue([
      attemptRow(),
      attemptRow({
        id: 'attempt-anon',
        anonymousCode: 'ANON-ABCDEF12',
        userId: null,
        user: null,
      }),
      attemptRow({
        id: 'attempt-deleted',
        userId: null,
        user: null,
        anonymousCode: null,
      }),
      attemptRow({
        id: 'attempt-blank-nick',
        user: { id: 'student-2', nickname: null, username: 'stu2' },
      }),
    ])
    mockPrisma.compositeAssessmentAttempt.count.mockResolvedValue(4)

    const result = await listAttemptsForTeacher('teacher-a', TEACHER, 'composite-1', page)

    expect(mockPrisma.compositeAssessmentAttempt.findMany.mock.calls[0][0].select).not.toHaveProperty('recoveryTokenHash')
    expect(JSON.stringify(result)).not.toContain('recoveryTokenHash')
    expect(result.list[0]).toMatchObject({
      nickname: '小明',
      username: 'stu1',
      displayName: '小明',
      isAnonymous: false,
    })
    expect(result.list[0].displayName).not.toBe('小明stu1')
    expect(result.list[1]).toMatchObject({
      isAnonymous: true,
      anonymousCode: 'ANON-ABCDEF12',
      nickname: null,
      username: null,
      displayName: 'ANON-ABCDEF12',
    })
    expect(result.list[2]).toMatchObject({
      isAnonymous: false,
      displayName: '已删除用户',
      nickname: null,
      username: null,
    })
    expect(result.list[3]).toMatchObject({
      nickname: null,
      username: 'stu2',
      displayName: null,
    })
    expect(result.list[3].displayName).not.toBe('stu2')
  })
})

describe('getReportForTeacher', () => {
  it('forbids another teacher from reading the report', async () => {
    mockPrisma.compositeAssessment.findUnique.mockResolvedValue(compositeRow())

    await expect(getReportForTeacher('teacher-b', TEACHER, 'composite-1', 'attempt-1'))
      .rejects.toMatchObject({ statusCode: 403 })
    expect(mockPrisma.compositeAssessmentAttempt.findUnique).not.toHaveBeenCalled()
  })

  it('rejects in-progress attempts and cross-template ids', async () => {
    mockPrisma.compositeAssessment.findUnique.mockResolvedValue(compositeRow())
    mockPrisma.compositeAssessmentAttempt.findUnique.mockResolvedValue(completedAttemptForReport({ status: 'IN_PROGRESS' }))

    await expect(getReportForTeacher('teacher-a', TEACHER, 'composite-1', 'attempt-1'))
      .rejects.toMatchObject({ statusCode: 400 })

    mockPrisma.compositeAssessmentAttempt.findUnique.mockResolvedValue(
      completedAttemptForReport({ compositeAssessmentId: 'composite-other' }),
    )
    await expect(getReportForTeacher('teacher-a', TEACHER, 'composite-1', 'attempt-1'))
      .rejects.toMatchObject({ statusCode: 404 })
  })

  it('lets ADMIN read another teacher’s completed report without a totalScore', async () => {
    mockPrisma.compositeAssessment.findUnique.mockResolvedValue(compositeRow({ createdBy: 'teacher-a' }))
    mockPrisma.compositeAssessmentAttempt.findUnique.mockResolvedValue(completedAttemptForReport())

    const report = await getReportForTeacher('admin-1', ADMIN, 'composite-1', 'attempt-1')
    expect(report.backgroundValues).toEqual([{ itemId: 'item-form', type: 'FORM', kind: 'background', label: '年级', value: '三年级' }])
    expect(report.unitReports.map((item: { type: string }) => item.type)).toEqual(['SCALE', 'COGNITIVE'])
    expect(report).not.toHaveProperty('totalScore')
    expect(report.unitReports.some((item: { decryptError?: boolean }) => item.decryptError)).toBe(false)
  })
})

describe('getExportContext ownership', () => {
  it('denies another teacher while allowing the owner and admin', async () => {
    mockPrisma.compositeAssessment.findUnique.mockResolvedValue(compositeRow())
    await expect(getExportContext('teacher-b', TEACHER, 'composite-1')).rejects.toMatchObject({ statusCode: 403 })
    await expect(getExportContext('teacher-a', TEACHER, 'composite-1')).resolves.toMatchObject({ id: 'composite-1' })
    await expect(getExportContext('admin-1', ADMIN, 'composite-1')).resolves.toMatchObject({ id: 'composite-1' })
  })
})

describe('composite cognitive single-task report', () => {
  const frozenReport = {
    profile: 'experience' as const,
    profileDefinitionVersion: '1.1.0',
    metricDefinitionVersion: '1.1.0',
    qualityDefinitionVersion: '1.1.0',
    reportDefinitionVersion: '1.1.0',
    reportCaveats: ['体验版，结果仅供体验。'],
    metricDefinitions: {
      medianRtMs: {
        key: 'medianRtMs',
        label: '中位反应时',
        construct: 'processing_speed',
        description: '中位反应时',
        unit: 'ms',
        valueType: 'number',
        direction: 'lower_is_better',
        role: 'primary',
        availableProfiles: ['experience', 'standard', 'research'],
        export: { summary: true, label: '中位反应时' },
      },
    },
    qualityDefinitions: {
      insufficientValidTrials: { key: 'insufficientValidTrials', label: '有效试次不足', description: '' },
    },
    reportDefinition: {
      title: '简单反应时',
      headlineMetric: 'medianRtMs',
      primaryMetrics: ['medianRtMs'],
      secondaryMetrics: [],
      practicalTips: ['冻结建议'],
      disclaimer: '不是医学诊断或人口常模。',
    },
  }

  it('hides the product index when quality is insufficient', () => {
    const built = buildCompositeReport(completedAttemptForReport({
      compositeAssessment: {
        id: 'composite-1',
        name: '综合测评 1',
        items: [{
          id: 'item-cog',
          type: 'COGNITIVE',
          scale: null,
          cognitiveAssignment: {
            title: '反应时',
            profile: 'experience',
            resolvedReportSnapshotEncrypted: encryptCognitivePayload(frozenReport),
          },
        }],
      },
      cognitiveSessions: [{
        id: 'session-1',
        compositeItemId: 'item-cog',
        testType: 'reaction',
        engineVersion: '1.0.0',
        scoringVersion: '1.1.0',
        configVersion: '1.1.0',
        finishedAt: new Date('2026-08-20T01:05:00Z'),
        configSnapshotEncrypted: encryptCognitivePayload({ report: { referenceMode: 'none' } }),
        scoreEncrypted: encryptCognitivePayload(30),
        metricsEncrypted: encryptCognitivePayload({ medianRtMs: null }),
        qualityFlagsEncrypted: encryptCognitivePayload({ interpretable: false, insufficientValidTrials: true }),
      }],
    }))
    const cognitive = built.modules.find((item: { type: string }) => item.type === 'COGNITIVE')
    expect(cognitive.singleTaskReport.productIndex).toBeNull()
    expect(cognitive.singleTaskReport.headline).toBeNull()
    expect(JSON.stringify(cognitive.singleTaskReport)).not.toMatch(/任务指标/)
  })

  it('renders frozen Chinese labels and the experience caveat', () => {
    const built = buildCompositeReport(completedAttemptForReport({
      compositeAssessment: {
        id: 'composite-1',
        name: '综合测评 1',
        items: [{
          id: 'item-cog',
          type: 'COGNITIVE',
          scale: null,
          cognitiveAssignment: {
            title: '反应时',
            profile: 'experience',
            resolvedReportSnapshotEncrypted: encryptCognitivePayload(frozenReport),
          },
        }],
      },
      cognitiveSessions: [{
        id: 'session-1',
        compositeItemId: 'item-cog',
        testType: 'reaction',
        engineVersion: '1.0.0',
        scoringVersion: '1.1.0',
        configVersion: '1.1.0',
        finishedAt: new Date('2026-08-20T01:05:00Z'),
        configSnapshotEncrypted: encryptCognitivePayload({ report: { referenceMode: 'none' } }),
        scoreEncrypted: encryptCognitivePayload(70),
        metricsEncrypted: encryptCognitivePayload({ medianRtMs: 320 }),
        qualityFlagsEncrypted: encryptCognitivePayload({ interpretable: true }),
      }],
    }))
    const report = built.modules.find((item: { type: string }) => item.type === 'COGNITIVE').singleTaskReport
    expect(report.primaryMetrics[0].label).toBe('中位反应时')
    expect(report.caveats).toContain('体验版，结果仅供体验。')
    expect(report.productIndex.label).toBe('任务表现指数')
  })

  it.each([
    ['normal', 'standard', true, { referenceMode: 'none' }],
    ['experience', 'experience', true, { referenceMode: 'none' }],
    ['quality-failed', 'standard', false, { referenceMode: 'simulated' }],
    ['missing-reference', 'standard', true, { referenceMode: 'none' }],
  ] as const)('%s Composite report is deep-equal to the direct frozen builder', (name, profile, interpretable, reportConfig) => {
    const frozen = name === 'missing-reference' ? null : frozenReport
    const assignment = {
      title: '冻结认知任务',
      profile,
      resolvedReportSnapshotEncrypted: frozen ? encryptCognitivePayload({ ...frozen, profile }) : null,
    }
    const session = {
      id: `session-${name}`,
      compositeItemId: 'item-cog',
      testType: 'reaction',
      engineVersion: '1.0.0',
      scoringVersion: '1.1.0',
      configVersion: '1.1.0',
      finishedAt: new Date('2026-08-20T01:05:00Z'),
      configSnapshotEncrypted: encryptCognitivePayload({ report: reportConfig }),
      scoreEncrypted: encryptCognitivePayload(70),
      metricsEncrypted: encryptCognitivePayload({ medianRtMs: interpretable ? 320 : null }),
      qualityFlagsEncrypted: encryptCognitivePayload({ interpretable, insufficientValidTrials: !interpretable }),
    }
    const attempt = completedAttemptForReport({
      compositeAssessment: {
        id: 'composite-1',
        name: '综合测评 1',
        items: [{ id: 'item-cog', type: 'COGNITIVE', scale: null, cognitiveAssignment: assignment }],
      },
      cognitiveSessions: [session],
      formAnswers: [],
    })

    const composite = buildCompositeReport(attempt).unitReports.find((item: { type: string }) => item.type === 'COGNITIVE') as any
    const config = { report: reportConfig }
    const score = 70
    const metrics = { medianRtMs: interpretable ? 320 : null }
    const qualityFlags = { interpretable, insufficientValidTrials: !interpretable }
    const reference = resolveCognitiveReferenceForResult({
      testType: session.testType,
      metrics,
      score,
      qualityFlags,
      config,
      profile,
      engineVersion: session.engineVersion,
      scoringVersion: session.scoringVersion,
      configVersion: session.configVersion,
    })
    const direct = buildCognitiveSingleTaskReport({
      testType: session.testType,
      engineVersion: session.engineVersion,
      scoringVersion: session.scoringVersion,
      configVersion: session.configVersion,
      profile,
      frozenReport: readFrozenReport(assignment.resolvedReportSnapshotEncrypted),
      score,
      metrics,
      qualityFlags,
      reference,
    })
    expect(composite.singleTaskReport).toEqual(direct)
  })
})

describe('collection-only mixed unit reports', () => {
  it('uses the same Scale DTO for Composite and Questionnaire/public projections', () => {
    const result = makeScaleResult({ scaleId: 'scale-a', code: 'adexi_v1', name: '量表 A', scoreKey: 'A', value: 0 })
    const scale = { id: 'scale-a', code: 'adexi_v1', name: '量表 A', instrumentVersion: '2.0.0' }
    const internalComposite = buildCompositeReport(completedAttemptForReport({
      compositeAssessment: {
        id: 'composite-1',
        name: '综合测评 1',
        items: [{ id: 'item-scale-a', type: 'SCALE', scaleId: 'scale-a', scale, cognitiveAssignment: null }],
      },
      scaleAssessments: [{ compositeItemId: 'item-scale-a', result, completedAt: new Date('2026-08-20T01:01:00Z'), totalTime: 0 }],
      cognitiveSessions: [],
      formAnswers: [],
    }))
    const composite = projectCompositeCollectionReport(internalComposite, 'participant').unitReports[0]
    const questionnaire = buildQuestionnaireCollectionReport({
      questionnaire: { name: '问卷', questionnaireScales: [{ id: 'item-scale-a', scaleId: 'scale-a', position: 0, scale }], formItems: [] },
      scaleAssessments: [{ id: 'assessment-a', scaleId: 'scale-a', result, completedAt: new Date('2026-08-20T01:01:00Z'), totalTime: 0, scale }],
      formAnswers: [],
    }).unitReports[0]
    expect(composite).toEqual(questionnaire)
    expect(composite).not.toHaveProperty('result')
  })

  it('keeps two Scale and two Cognitive slots ordered with zero/null values intact', () => {
    const built = buildCompositeReport(completedAttemptForReport({
      compositeAssessment: {
        id: 'composite-1',
        name: '混合容器',
        items: [
          {
            id: 'item-scale-a',
            type: 'SCALE',
            scaleId: 'scale-a',
            scale: { id: 'scale-a', code: 'S-A', name: '量表 A' },
            cognitiveAssignment: null,
          },
          {
            id: 'item-form',
            type: 'FORM',
            formLabel: '年级',
            scale: null,
            cognitiveAssignment: null,
          },
          {
            id: 'item-scale-b',
            type: 'SCALE',
            scaleId: 'scale-b',
            scale: { id: 'scale-b', code: 'S-B', name: '量表 B' },
            cognitiveAssignment: null,
          },
          {
            id: 'item-cog-a',
            type: 'COGNITIVE',
            scale: null,
            cognitiveAssignment: { title: '认知 A', profile: 'experience' },
          },
          {
            id: 'item-cog-b',
            type: 'COGNITIVE',
            scale: null,
            cognitiveAssignment: { title: '认知 B', profile: 'experience' },
          },
        ],
      },
      scaleAssessments: [
        {
          compositeItemId: 'item-scale-a',
          result: makeScaleResult({ scaleId: 'scale-a', code: 'S-A', name: '量表 A', scoreKey: 'A', value: 0 }),
          completedAt: new Date('2026-08-20T01:01:00Z'),
          totalTime: 0,
        },
        {
          compositeItemId: 'item-scale-b',
          result: makeScaleResult({ scaleId: 'scale-b', code: 'S-B', name: '量表 B', scoreKey: 'B', value: null }),
          completedAt: new Date('2026-08-20T01:02:00Z'),
          totalTime: null,
        },
      ],
      cognitiveSessions: [
        {
          id: 'session-cog-a',
          compositeItemId: 'item-cog-a',
          testType: 'reaction',
          engineVersion: '1.0.0',
          scoringVersion: '1.1.0',
          configVersion: '1.1.0',
          finishedAt: new Date('2026-08-20T01:03:00Z'),
          configSnapshotEncrypted: encryptCognitivePayload({ report: { referenceMode: 'none' } }),
          scoreEncrypted: encryptCognitivePayload(0),
          metricsEncrypted: encryptCognitivePayload({ zeroMetric: 0, missingMetric: null }),
          qualityFlagsEncrypted: encryptCognitivePayload({ interpretable: false }),
        },
        {
          id: 'session-cog-b',
          compositeItemId: 'item-cog-b',
          testType: 'reaction',
          engineVersion: '1.0.0',
          scoringVersion: '1.1.0',
          configVersion: '1.1.0',
          finishedAt: new Date('2026-08-20T01:04:00Z'),
          configSnapshotEncrypted: encryptCognitivePayload({ report: { referenceMode: 'none' } }),
          scoreEncrypted: encryptCognitivePayload(null),
          metricsEncrypted: encryptCognitivePayload({ zeroMetric: null }),
          qualityFlagsEncrypted: encryptCognitivePayload({ interpretable: true }),
        },
      ],
      formAnswers: [{ itemId: 'item-form', value: '三年级' }],
    }))

    expect(built.unitReports.map((item: { type: string }) => item.type)).toEqual(['SCALE', 'SCALE', 'COGNITIVE', 'COGNITIVE'])
    expect(built.backgroundValues).toEqual([{ itemId: 'item-form', type: 'FORM', kind: 'background', label: '年级', value: '三年级' }])
    expect(built.modules).toBe(built.unitReports)
    expect(built.unitReports[0]).toMatchObject({ scaleId: 'scale-a', scores: [{ key: 'A', value: 0 }] })
    expect(built.unitReports[1]).toMatchObject({ scaleId: 'scale-b', scores: [{ key: 'B', value: null }], quality: { status: 'invalid' }, totalTime: null })
    expect(built.unitReports[2]).toMatchObject({ score: 0, qualityFlags: { interpretable: false }, metrics: { zeroMetric: 0, missingMetric: null } })
    expect(built.unitReports[3]).toMatchObject({ score: null, qualityFlags: { interpretable: true }, metrics: { zeroMetric: null } })
    expect(JSON.stringify(built)).not.toMatch(/averageScore|overallScore|overallSummary|Domain|consistency|convergence/)
  })
})

describe('buildCompositeReport decrypt degrade', () => {
  it('marks a bad cognitive module without failing the report or student getReport', async () => {
    const attempt = completedAttemptForReport({
      cognitiveSessions: [{
        id: 'session-bad',
        compositeItemId: 'item-cog',
        testType: 'reaction',
        finishedAt: new Date('2026-08-20T01:05:00Z'),
        configSnapshotEncrypted: 'not-an-envelope',
        scoreEncrypted: 'not-an-envelope',
        metricsEncrypted: 'not-an-envelope',
        qualityFlagsEncrypted: 'not-an-envelope',
      }],
    })

    const built = buildCompositeReport(attempt)
    const cognitive = built.modules.find((item: { type: string }) => item.type === 'COGNITIVE')
    expect(cognitive).toMatchObject({ decryptError: true, type: 'COGNITIVE' })
    expect(cognitive).not.toHaveProperty('score')
    expect(cognitive).not.toHaveProperty('metrics')
    expect(cognitive).not.toHaveProperty('qualityFlags')
    expect(built.backgroundValues.find((item: { type: string }) => item.type === 'FORM')).toMatchObject({ value: '三年级' })
    expect(built).not.toHaveProperty('totalScore')

    mockPrisma.compositeAssessmentAttempt.findUnique.mockResolvedValue(attempt)
    const studentReport = await getReport('attempt-1', { userId: 'student-1' })
    expect(studentReport.unitReports.find((item: { type: string }) => item.type === 'COGNITIVE')).toMatchObject({ decryptError: true })
    expect(studentReport).not.toHaveProperty('modules')
  })

  it('marks a scale module decryptError when the frozen v2 result ciphertext cannot be decoded', () => {
    const attempt = completedAttemptForReport({
      scaleAssessments: [{
        compositeItemId: 'item-scale',
        result: 'aa:bb:cc',
        completedAt: new Date('2026-08-20T01:04:00Z'),
        totalTime: 4000,
      }],
    })

    const built = buildCompositeReport(attempt)
    const scale = built.modules.find((item: { type: string }) => item.type === 'SCALE')
    expect(scale).toMatchObject({ decryptError: true, type: 'SCALE', scaleId: 'scale-1' })
    expect(scale).toHaveProperty('scores', [])
    expect(scale).not.toHaveProperty('feedback')
    expect(built.backgroundValues.find((item: { type: string }) => item.type === 'FORM')).toMatchObject({ value: '三年级' })
  })

  it('marks a scale module decryptError when the result is not v2', () => {
    const attempt = completedAttemptForReport({
      scaleAssessments: [{
        compositeItemId: 'item-scale',
        result: { schemaVersion: 1, scores: [], feedback: {} },
        completedAt: new Date('2026-08-20T01:04:00Z'),
        totalTime: 4000,
      }],
    })

    const scale = buildCompositeReport(attempt).modules.find((item: { type: string }) => item.type === 'SCALE')
    expect(scale).toMatchObject({ decryptError: true })
    expect(scale).toHaveProperty('scores', [])
  })
})
