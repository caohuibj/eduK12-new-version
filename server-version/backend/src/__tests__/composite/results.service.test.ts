import { createFrozenActiveSlotSet, encryptFrozenActiveSlotSet } from '../../modules/assessment-runtime/slot-set'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { UserRole } from '@prisma/client'

process.env.DATA_ENCRYPTION_KEY = 'a'.repeat(64)
process.env.DATA_PSEUDONYM_KEY = 'b'.repeat(64)
process.env.COGNITIVE_MODULE_ENABLED = 'true'

const { mockPrisma } = vi.hoisted(() => ({
  mockPrisma: {
    cognitiveSession: { findMany: vi.fn() },
    situationalAttempt: { findMany: vi.fn() },
    compositeFormAnswer: { findMany: vi.fn() },
    compositeFormSectionAttempt: { findMany: vi.fn() },

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

vi.mock('../../modules/composite/composite-course-scope',()=>({assertCompositeCourseScope:vi.fn().mockResolvedValue({id:'course-a',title:'课程 A'})}))
import { createCanonicalUnitResultEnvelope } from '../../modules/assessment-runtime/unit-result'
import { encryptUnifiedRuntimePayload } from '../../modules/assessment-runtime/security'
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

import { compileResearchScale } from '../../modules/survey/builder.compiler'
import { createFrozenScaleRuntimeSnapshot, encryptFrozenScaleRuntimeSnapshot, hashFrozenScaleRuntimeSnapshot } from '../../modules/assessment-runtime/runtime-snapshot'

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
  trainingFlowDraft: null,
  trainingFlowFrozen: null,
  trainingFlowDigest: null,
  trainingVariantDraft: null,
  trainingVariantFrozen: null,
  trainingVariantDigest: null,
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
  trainingFlowSnapshotEncrypted: null,
  trainingFlowSnapshotHash: null,
  trainingFlowPathEncrypted: null,
  trainingFlowPathHash: null,
  trainingVariantAllocationEncrypted: null,
  trainingVariantAllocationHash: null,
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
  trainingFlowSnapshotEncrypted: null,
  trainingFlowSnapshotHash: null,
  trainingFlowPathEncrypted: null,
  trainingFlowPathHash: null,
  trainingVariantAllocationEncrypted: null,
  trainingVariantAllocationHash: null,
  id: 'attempt-1',
  compositeAssessmentId: 'composite-1',
  userId: 'student-1',
  recoveryTokenHash: 'hash-should-not-leak',
  anonymousCode: null,
  status: 'COMPLETED',
  completedAt: new Date('2026-08-20T01:05:00Z'),
  totalTime: 300000,
  compositeAssessment: {
    trainingFlowDraft: null,
    trainingFlowFrozen: null,
    trainingFlowDigest: null,
    trainingVariantDraft: null,
    trainingVariantFrozen: null,
    trainingVariantDigest: null,
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
  mockPrisma.cognitiveSession.findMany.mockImplementation(async () => (await mockPrisma.compositeAssessmentAttempt.findUnique.mock.results.at(-1)?.value)?.cognitiveSessions ?? [])
  mockPrisma.situationalAttempt.findMany.mockImplementation(async () => (await mockPrisma.compositeAssessmentAttempt.findUnique.mock.results.at(-1)?.value)?.situationalAttempts ?? [])
  mockPrisma.compositeFormAnswer.findMany.mockImplementation(async () => (await mockPrisma.compositeAssessmentAttempt.findUnique.mock.results.at(-1)?.value)?.formAnswers ?? [])
  mockPrisma.compositeFormSectionAttempt.findMany.mockImplementation(async () => (await mockPrisma.compositeAssessmentAttempt.findUnique.mock.results.at(-1)?.value)?.formSectionAttempts ?? [])
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
      by: ['compositeAssessmentId', 'status', 'taskSatisfaction'],
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
    expect(list[0].attemptCounts).toEqual({ started: 4, inProgress: 1, completed: 2, satisfied: 2, notSatisfied: 0, abandoned: 1 })
    expect(list[1].attemptCounts).toEqual({ started: 0, inProgress: 0, completed: 0, satisfied: 0, notSatisfied: 0, abandoned: 0 })
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

    expect(detail.attemptCounts).toEqual({ started: 3, inProgress: 0, completed: 3, satisfied: 3, notSatisfied: 0, abandoned: 0 })
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
    const scoped = await listAttemptsForTeacher('teacher-a', TEACHER, 'composite-1', {...page,courseId:'course-a'})
    expect(scoped.courseScope).toEqual({id:'course-a',title:'课程 A'})
    const scopedQuery=mockPrisma.compositeAssessmentAttempt.findMany.mock.calls.find(([input]:any[])=>JSON.stringify(input.where).includes('deliveryCourseId'))![0]
    expect(scopedQuery.where.AND).toContainEqual({compositeAssessmentId:'composite-1',deliveryCourseId:'course-a'})
    expect(mockPrisma.compositeAssessmentAttempt.groupBy.mock.calls.at(-1)![0].where.AND).toContainEqual({compositeAssessmentId:{in:['composite-1']},deliveryCourseId:'course-a'})

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
    mockPrisma.compositeAssessment.findUnique.mockResolvedValue({ ...compositeRow(), _count: { items: 0 } })
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

  it('hides the product index when quality is insufficient', async () => {
    const built = (await buildCompositeReport(completedAttemptForReport({
      compositeAssessment: {
        trainingFlowDraft: null,
        trainingFlowFrozen: null,
        trainingFlowDigest: null,
        trainingVariantDraft: null,
        trainingVariantFrozen: null,
        trainingVariantDigest: null,
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
    })))
    const cognitive = built.modules.find((item: { type: string }) => item.type === 'COGNITIVE')
    expect(cognitive.singleTaskReport.productIndex).toBeNull()
    expect(cognitive.singleTaskReport.headline).toBeNull()
    expect(JSON.stringify(cognitive.singleTaskReport)).not.toMatch(/任务指标/)
  })

  it('renders frozen Chinese labels and the experience caveat', async () => {
    const built = (await buildCompositeReport(completedAttemptForReport({
      compositeAssessment: {
        trainingFlowDraft: null,
        trainingFlowFrozen: null,
        trainingFlowDigest: null,
        trainingVariantDraft: null,
        trainingVariantFrozen: null,
        trainingVariantDigest: null,
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
    })))
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
  ] as const)('%s Composite report is deep-equal to the direct frozen builder', async (name, profile, interpretable, reportConfig) => {
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
        trainingFlowDraft: null,
        trainingFlowFrozen: null,
        trainingFlowDigest: null,
        trainingVariantDraft: null,
        trainingVariantFrozen: null,
        trainingVariantDigest: null,
        id: 'composite-1',
        name: '综合测评 1',
        items: [{ id: 'item-cog', type: 'COGNITIVE', scale: null, cognitiveAssignment: assignment }],
      },
      cognitiveSessions: [session],
      formAnswers: [],
    })

    const composite = (await buildCompositeReport(attempt)).unitReports.find((item: { type: string }) => item.type === 'COGNITIVE') as any
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
  it('uses the same Scale DTO for Composite and Questionnaire/public projections', async () => {
    const result = makeScaleResult({ scaleId: 'scale-a', code: 'adexi_v1', name: '量表 A', scoreKey: 'A', value: 0 })
    const scale = { id: 'scale-a', code: 'adexi_v1', name: '量表 A', instrumentVersion: '2.0.0' }
    const internalComposite = (await buildCompositeReport(completedAttemptForReport({
      compositeAssessment: {
        trainingFlowDraft: null,
        trainingFlowFrozen: null,
        trainingFlowDigest: null,
        trainingVariantDraft: null,
        trainingVariantFrozen: null,
        trainingVariantDigest: null,
        id: 'composite-1',
        name: '综合测评 1',
        items: [{ id: 'item-scale-a', type: 'SCALE', scaleId: 'scale-a', scale, cognitiveAssignment: null }],
      },
      scaleAssessments: [{ compositeItemId: 'item-scale-a', result, completedAt: new Date('2026-08-20T01:01:00Z'), totalTime: 0 }],
      cognitiveSessions: [],
      formAnswers: [],
    })))
    const composite = projectCompositeCollectionReport(internalComposite, 'participant').unitReports[0]
    const questionnaire = buildQuestionnaireCollectionReport({
      questionnaire: { name: '问卷', questionnaireScales: [{ id: 'item-scale-a', scaleId: 'scale-a', position: 0, scale }], formItems: [] },
      scaleAssessments: [{ id: 'assessment-a', scaleId: 'scale-a', result, completedAt: new Date('2026-08-20T01:01:00Z'), totalTime: 0, scale }],
      formAnswers: [],
    }).unitReports[0]
    expect(composite).toEqual(questionnaire)
    expect(composite).not.toHaveProperty('result')
  })

  it('keeps two Scale and two Cognitive slots ordered with zero/null values intact', async () => {
    const built = (await buildCompositeReport(completedAttemptForReport({
      compositeAssessment: {
        trainingFlowDraft: null,
        trainingFlowFrozen: null,
        trainingFlowDigest: null,
        trainingVariantDraft: null,
        trainingVariantFrozen: null,
        trainingVariantDigest: null,
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
    })))

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

    const built = (await buildCompositeReport(attempt))
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

  it('marks a scale module decryptError when the frozen v2 result ciphertext cannot be decoded', async () => {
    const attempt = completedAttemptForReport({
      scaleAssessments: [{
        compositeItemId: 'item-scale',
        result: 'aa:bb:cc',
        completedAt: new Date('2026-08-20T01:04:00Z'),
        totalTime: 4000,
      }],
    })

    const built = (await buildCompositeReport(attempt))
    const scale = built.modules.find((item: { type: string }) => item.type === 'SCALE')
    expect(scale).toMatchObject({ decryptError: true, type: 'SCALE', scaleId: 'scale-1' })
    expect(scale).toHaveProperty('scores', [])
    expect(scale).not.toHaveProperty('feedback')
    expect(built.backgroundValues.find((item: { type: string }) => item.type === 'FORM')).toMatchObject({ value: '三年级' })
  })

  it('marks a scale module decryptError when the result is not v2', async () => {
    const attempt = completedAttemptForReport({
      scaleAssessments: [{
        compositeItemId: 'item-scale',
        result: { schemaVersion: 1, scores: [], feedback: {} },
        completedAt: new Date('2026-08-20T01:04:00Z'),
        totalTime: 4000,
      }],
    })

    const scale = (await buildCompositeReport(attempt)).modules.find((item: { type: string }) => item.type === 'SCALE')
    expect(scale).toMatchObject({ decryptError: true })
    expect(scale).toHaveProperty('scores', [])
  })
})


describe('C06 teacher submission and satisfaction counts', () => {
  it('adds all completed buckets without replacing totals and fails closed for malformed satisfaction', async () => {
    mockPrisma.compositeAssessment.findMany.mockResolvedValue([compositeRow()])
    mockPrisma.compositeAssessmentAttempt.groupBy.mockResolvedValue([
      ...[null, 'SATISFIED', 'NOT_SATISFIED', 'CORRUPT'].map(taskSatisfaction => ({ compositeAssessmentId: 'composite-1', status: 'COMPLETED', taskSatisfaction, _count: { _all: 2 } })),
      { compositeAssessmentId: 'composite-1', status: 'IN_PROGRESS', taskSatisfaction: 'SATISFIED', _count: { _all: 1 } },
    ])
    const [row] = await listComposites('teacher-a', TEACHER)
    expect(row.attemptCounts).toEqual({ started: 9, inProgress: 1, completed: 8, satisfied: 4, notSatisfied: 4, abandoned: 0 })
    expect(mockPrisma.compositeAssessmentAttempt.groupBy).toHaveBeenCalledTimes(1)
  })
  it('projects anonymous submission qualification without exposing identity or credentials', async () => {
    mockPrisma.compositeAssessment.findUnique.mockResolvedValue(compositeRow())
    mockPrisma.compositeAssessmentAttempt.findMany.mockResolvedValue([attemptRow({ taskSatisfaction: 'NOT_SATISFIED', anonymousCode: 'ANON-1', userId: null, user: null })])
    const result = await listAttemptsForTeacher('teacher-a', TEACHER, 'composite-1', page)
    expect(result.list[0]).toMatchObject({ status: 'COMPLETED', taskSatisfied: false, taskSatisfaction: 'NOT_SATISFIED', isAnonymous: true, nickname: null, username: null })
    expect(mockPrisma.compositeAssessmentAttempt.findMany.mock.calls[0][0].select.taskSatisfaction).toBe(true)
    expect(JSON.stringify(result)).not.toContain('recoveryTokenHash')
  })
})


describe('legacy composite approved-library report disclosure', () => {
  const fixture = () => {
    const code = 'library:11111111-1111-4111-8111-111111111111'
    const definition = compileResearchScale('Frozen library report', {
      schemaVersion: 1, presentationMode: 'ALL_AT_ONCE', respondentType: 'participant_self_report', aggregation: 'mean',
      responseOptions: [{ optionKey: 'one', label: 'One', score: 1 }, { optionKey: 'two', label: 'Two', score: 2 }],
      dimensions: [{ dimensionKey: 'total', label: 'Total', direction: 'descriptive' }],
      items: [{ itemKey: 'one', prompt: 'Synthetic item', required: true, reverse: false, dimensionKeys: ['total'] }],
    })
    const runtime = createFrozenScaleRuntimeSnapshot({ instrumentKey: code, instrumentVersion: '2.0.0', definition })
    runtime.measurementPresentation = { releaseId: 'original-survey-release', contentHash: 'a'.repeat(64), presentationMode: 'ALL_AT_ONCE' }
    runtime.snapshotHash = hashFrozenScaleRuntimeSnapshot(runtime)
    const scale = { id: 'scale-1', code, name: 'Library', instrumentVersion: '2.0.0', instrumentClass: 'CUSTOM_DESCRIPTIVE',
      libraryEntryId: '11111111-1111-4111-8111-111111111111', measurementReleaseId: 'original-survey-release' }
    const child = { id: 'child', scaleId: scale.id, compositeItemId: 'item-scale', scale,
      runtimeSnapshotEncrypted: encryptFrozenScaleRuntimeSnapshot(runtime), compiledRuntimeHash: runtime.compiledRuntime.compiledRuntimeHash,
      result: makeScaleResult({ scaleId: scale.id, code, name: scale.name, scoreKey: 'total', value: 1 }),
      completedAt: new Date('2026-10-21T00:00:00Z'), totalTime: 1000 }
    const attempt = completedAttemptForReport({
      compositeAssessment: { ...completedAttemptForReport().compositeAssessment, productKind: 'LEGACY_COMPOSITE',
        items: [{ id: 'item-scale', type: 'SCALE', scaleId: scale.id, scale }] },
      scaleAssessments: [child], cognitiveSessions: [], formAnswers: [],
    })
    return { attempt, child }
  }
  const project = async (attempt: ReturnType<typeof fixture>['attempt']) =>
    projectCompositeCollectionReport(await buildCompositeReport(attempt), 'participant').unitReports[0]

  it('projects the actual frozen child through build and the strict HTTP projector', async () => {
    const { attempt } = fixture()
    const report = await project(attempt)
    expect(report.reportKind).not.toBe('unavailable')
    expect(report.scores).toEqual(expect.arrayContaining([expect.objectContaining({ key: 'total', value: 1 })]))
    expect(JSON.stringify(report)).not.toContain('__scaleProjectionPolicy')
  })

  it.each(['missing', 'wrong-code', 'wrong-release', 'wrong-runtime-hash'] as const)('fails closed for %s frozen identity', async fault => {
    const { attempt, child } = fixture()
    if (fault === 'missing') child.runtimeSnapshotEncrypted = ''
    if (fault === 'wrong-code') child.scale.code = 'library:another-entry'
    if (fault === 'wrong-release') child.scale.measurementReleaseId = 'other-release'
    if (fault === 'wrong-runtime-hash') child.compiledRuntimeHash = 'f'.repeat(64)
    const report = await project(attempt)
    expect(report.reportKind).toBe('unavailable')
    expect(report).not.toHaveProperty('scores')
  })

  it('does not infer a custom policy for an unknown non-library legacy source', async () => {
    const { attempt, child } = fixture()
    child.scale.libraryEntryId = ''
    const report = await project(attempt)
    expect(report).toMatchObject({ reportKind: 'unavailable', reason: 'POLICY_UNAVAILABLE' })
    expect(report).not.toHaveProperty('scores')
  })
})


// Unlike ordinary Prisma doubles, enforce nested selects so an omitted required
// field really disappears and report-equivalence assertions detect it.
const selectedRow = (row: any, query: any): any => {
  if (row == null) return row
  if (Array.isArray(row)) return row.map(value => selectedRow(value, query))
  const fields = query?.select ?? query?.include
  if (!fields) return row
  const result: any = query.select ? {} : { ...row }
  for (const [key, selection] of Object.entries(fields)) {
    if (selection === false) delete result[key]
    else if (selection === true) result[key] = row[key]
    else if (selection && typeof selection === 'object') result[key] = selectedRow(row[key], selection)
  }
  return result
}

describe('participant report-only database projection', () => {
  it.each(['LEGACY_COMPOSITE', 'QUESTIONNAIRE'])('preserves %s mixed frozen report JSON without loading raw answers or live definitions', async productKind => {
    const full: any = completedAttemptForReport({ taskSatisfaction: 'SATISFIED' })
    full.compositeAssessment.productKind = productKind
    full.compositeAssessment.items.push({ id: 'item-sjt', type: 'SITUATIONAL',
      situationalInstrumentKey: 'sjt-assertiveness-golden', situationalInstrumentVersion: '1.0.0' })
    full.scaleAssessments[0].answers = 'PRIVATE_RAW_ANSWERS'
    full.scaleAssessments[0].scale = { code: 'adexi_v1', instrumentVersion: '2.0.0', definition: 'PRIVATE_LIVE_DEFINITION' }
    full.compositeAssessment.items[1].scale.definition = 'PRIVATE_LIVE_DEFINITION'
    full.cognitiveSessions[0].trials = [{ trialIndex: 1, response: 'PRIVATE_TRIAL' }]
    full.situationalAttempts = [{ compositeItemId: 'item-sjt', resultEncrypted: 'PRIVATE_LEGACY_RESULT',
      instrumentKey: 'sjt-assertiveness-golden', instrumentVersion: '1.0.0', completedAt: full.completedAt, totalTime: 20,
      canonicalResultEncrypted: encryptUnifiedRuntimePayload(createCanonicalUnitResultEnvelope({
        core: { schemaVersion: 1, unitType: 'SITUATIONAL', instrumentKey: 'sjt-assertiveness-golden', instrumentVersion: '1.0.0',
          sourceDefinitionHash: 'a'.repeat(64), compilerVersion: '1.0.0', compiledRuntimeHash: 'b'.repeat(64),
          scorerKey: 'fixture', scorerVersion: '1.0.0', quality: { status: 'interpretable', flags: [] },
          metrics: [{ key: 'assertiveness', value: 1.5 }], facts: [], references: [], contextHash: null,
          scientificProvenance: { instrumentKey: 'sjt-assertiveness-golden', instrumentVersion: '1.0.0' } },
        completedAt: full.completedAt,
        persistenceProvenance: { sourceType: 'SITUATIONAL_ATTEMPT', sourceAttemptId: 'sjt-1', sourceSubmissionId: 'submission-1' },
      })) }]
    mockPrisma.compositeAssessmentAttempt.findUnique.mockResolvedValue(full)
    const expected = JSON.stringify(await getReport('attempt-1', { userId: 'student-1' }))
    mockPrisma.cognitiveSession.findMany.mockImplementation(async (query: any) => selectedRow(full.cognitiveSessions ?? [], query))
    mockPrisma.situationalAttempt.findMany.mockImplementation(async (query: any) => selectedRow(full.situationalAttempts ?? [], query))
    mockPrisma.compositeFormAnswer.findMany.mockImplementation(async (query: any) => selectedRow(full.formAnswers ?? [], query))
    mockPrisma.compositeFormSectionAttempt.findMany.mockImplementation(async (query: any) => selectedRow(full.formSectionAttempts ?? [], query))
    let loaded: any
    mockPrisma.compositeAssessmentAttempt.findUnique.mockImplementation(async (query: any) => {
      loaded = selectedRow(full, query)
      return loaded
    })
    const actual = await getReport('attempt-1', { userId: 'student-1' })
    expect(JSON.stringify(actual)).toBe(expected)
    expect(actual.unitReports.find((unit: any) => unit.type === 'SITUATIONAL')?.metrics).toEqual([{ key: 'assertiveness', value: 1.5 }])
    expect(loaded.scaleAssessments[0]).not.toHaveProperty('answers')
    expect(loaded.scaleAssessments[0].scale).not.toHaveProperty('definition')
    expect(loaded.compositeAssessment.items[1].scale).not.toHaveProperty('definition')
    expect(mockPrisma.cognitiveSession.findMany.mock.calls.at(-1)?.[0].select).not.toHaveProperty('trials')
    expect(mockPrisma.situationalAttempt.findMany.mock.calls.at(-1)?.[0].select).not.toHaveProperty('resultEncrypted')
    expect(JSON.stringify(actual)).not.toContain('PRIVATE_')
  })
})


describe('participant report empty module query elimination', () => {
  it('skips exactly four empty relation reads without changing scale-only report JSON; positive counts and corrupt manifests read fully', async () => {
    const full: any = completedAttemptForReport({ runtimeGeneration: 'UNIFIED_V1', deliveryMode: 'FINAL_ONLY', attemptEpoch: 1 })
    full.compositeAssessment.productKind = 'QUESTIONNAIRE'
    full.compositeAssessment.items = full.compositeAssessment.items.filter((item: any) => item.type === 'SCALE')
    full.compositeAssessment.formSections = []
    full.cognitiveSessions = []; full.situationalAttempts = []; full.formAnswers = []; full.formSectionAttempts = []
    const slots = createFrozenActiveSlotSet({ schemaVersion: 1, runtimeGeneration: 'UNIFIED_V1', attemptEpoch: 1,
      slots: [{ slotKey: 'scale:item-scale', unitType: 'SCALE', required: true,
        sourceDefinitionIdentity: { key: 'adexi_v1', version: '2.0.0', hash: 'a'.repeat(64) }, sourceBinding: {} }] })
    full.frozenActiveSlotSetEncrypted = encryptFrozenActiveSlotSet(slots); full.frozenActiveSlotSetHash = slots.snapshotHash
    mockPrisma.compositeAssessmentAttempt.findUnique.mockResolvedValue(full)
    const expected = JSON.stringify(await getReport('attempt-1', { userId: 'student-1' }))
    const delegates = [mockPrisma.cognitiveSession, mockPrisma.situationalAttempt, mockPrisma.compositeFormAnswer, mockPrisma.compositeFormSectionAttempt]
    for (const delegate of delegates) delegate.findMany.mockClear()
    full._count = { cognitiveSessions: 0, situationalAttempts: 0, formAnswers: 0, formSectionAttempts: 0 }
    expect(JSON.stringify(await getReport('attempt-1', { userId: 'student-1' }))).toBe(expected)
    for (const delegate of delegates) expect(delegate.findMany).not.toHaveBeenCalled()
    expect(mockPrisma.compositeAssessmentAttempt.findUnique.mock.calls.at(-1)?.[0].include._count.select).toEqual({
      cognitiveSessions: true, situationalAttempts: true, formAnswers: true, formSectionAttempts: true,
    })
    full._count.cognitiveSessions = 1
    await getReport('attempt-1', { userId: 'student-1' })
    expect(mockPrisma.cognitiveSession.findMany).toHaveBeenCalledExactlyOnceWith(expect.objectContaining({ where: { compositeAttemptId: 'attempt-1' } }))
    for (const delegate of delegates) delegate.findMany.mockClear()
    full._count.cognitiveSessions = 0; full.frozenActiveSlotSetEncrypted = 'corrupt'
    expect(JSON.stringify(await getReport('attempt-1', { userId: 'student-1' }))).toBe(expected)
    for (const delegate of delegates) expect(delegate.findMany).toHaveBeenCalledTimes(1)
  })
})
