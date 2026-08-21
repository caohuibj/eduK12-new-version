import { beforeEach, describe, expect, it, vi } from 'vitest'

const { mockPrisma } = vi.hoisted(() => ({
  mockPrisma: {
    cognitiveAssignment: { findUnique: vi.fn() },
    cognitiveSession: { findMany: vi.fn() },
  },
}))

vi.mock('../../config/database', () => ({ prisma: mockPrisma }))

import { encryptCognitivePayload } from '../../modules/cognitive/cognitive.security'
import {
  exportCognitiveToCSV,
  getCognitiveExportData,
  makeCognitiveExportFileName,
} from '../../modules/cognitive/export.service'

process.env.DATA_ENCRYPTION_KEY = 'a'.repeat(64)

const assignment = {
  id: 'assignment-1',
  title: '反应时测验',
  courseId: 'course-1',
  course: { id: 'course-1', title: '三年级一班', courseCode: 'C-001' },
  config: {
    testType: 'reaction',
    configVersion: '1.0.0',
    engineVersion: '1.0.0',
    scoringVersion: '1.0.0',
  },
}

const session = (withTrials = false) => ({
  id: 'session-1',
  userId: 'student-1',
  attemptNo: 1,
  testType: 'reaction',
  configVersion: '1.0.0',
  engineVersion: '1.0.0',
  scoringVersion: '1.0.0',
  startedAt: new Date('2026-08-20T10:00:00.000Z'),
  finishedAt: new Date('2026-08-20T10:01:00.000Z'),
  scoreEncrypted: encryptCognitivePayload(88),
  metricsEncrypted: encryptCognitivePayload({
    meanRtMs: 350,
    medianRtMs: 340,
    validTrialCount: 3,
  }),
  qualityFlagsEncrypted: encryptCognitivePayload({ interpretable: true, interrupted: false }),
  user: { id: 'student-1', nickname: '小明', username: 'student-1' },
  ...(withTrials
    ? {
        trials: [
          {
            trialIndex: 0,
            payloadEncrypted: encryptCognitivePayload({
              foreperiodMs: 500,
              rtMs: 320,
              prematureCount: 0,
              interrupted: false,
            }),
          },
          {
            trialIndex: 1,
            payloadEncrypted: encryptCognitivePayload({
              foreperiodMs: 700,
              rtMs: 380,
              prematureCount: 1,
              interrupted: false,
            }),
          },
        ],
      }
    : {}),
})

beforeEach(() => {
  vi.clearAllMocks()
  mockPrisma.cognitiveAssignment.findUnique.mockResolvedValue(assignment)
})

describe('cognitive export service', () => {
  it('generates unique filenames for concurrent exports', () => {
    const first = makeCognitiveExportFileName('assignment-1', 'summary', 'csv')
    const second = makeCognitiveExportFileName('assignment-1', 'summary', 'csv')

    expect(first).not.toBe(second)
    expect(first).toMatch(
      /^cognitive_assignme_summary_\d{4}-\d{2}-\d{2}T\d{2}-\d{2}-\d{2}_[a-f0-9-]{36}\.csv$/
    )
  })

  it('exports summary metrics without raw trial columns', async () => {
    mockPrisma.cognitiveSession.findMany.mockResolvedValue([session()])

    const data = await getCognitiveExportData('assignment-1', {
      detail: 'summary',
      anonymize: true,
    })

    expect(data.completedCount).toBe(1)
    expect(data.trialCount).toBe(0)
    expect(data.fields.map((field) => field.name)).toContain('M_mean_rt_ms')
    expect(data.fields.map((field) => field.name)).not.toContain('T001_rt_ms')
    expect(data.rows[0]).toMatchObject({
      U_id: 'Ustudent-',
      A_score: 88,
      M_mean_rt_ms: 350,
      Q_interpretable: 1,
    })

    const query = mockPrisma.cognitiveSession.findMany.mock.calls[0][0]
    expect(query.include).not.toHaveProperty('trials')
  })

  it('exports every raw trial value in full mode', async () => {
    mockPrisma.cognitiveSession.findMany.mockResolvedValue([session(true)])

    const data = await getCognitiveExportData('assignment-1', {
      detail: 'full',
      anonymize: true,
    })

    expect(data.trialCount).toBe(2)
    expect(data.fields.map((field) => field.name)).toEqual(expect.arrayContaining([
      'T001_rt_ms',
      'T002_rt_ms',
      'T001_foreperiod_ms',
    ]))
    expect(data.rows[0]).toMatchObject({
      T001_rt_ms: 320,
      T002_rt_ms: 380,
      T002_premature_count: 1,
    })

    const csv = exportCognitiveToCSV(data)
    expect(csv).toContain('T001_rt_ms')
    expect(csv).toContain('320')
    expect(csv).toContain('380')
  })

  it('keeps the server-issued anonymous code in anonymous exports', async () => {
    mockPrisma.cognitiveSession.findMany.mockResolvedValue([
      { ...session(), userId: null, anonymousCode: 'ANON-AB12CD34', user: null },
    ])

    const data = await getCognitiveExportData('assignment-1', { detail: 'summary' })

    expect(data.rows[0].U_id).toBe('ANON-AB12CD34')
  })

  it('filters completed sessions by completion date', async () => {
    mockPrisma.cognitiveSession.findMany.mockResolvedValue([])

    await getCognitiveExportData('assignment-1', {
      detail: 'summary',
      dateRange: { start: '2026-08-01', end: '2026-08-31' },
    })

    expect(mockPrisma.cognitiveSession.findMany).toHaveBeenCalledWith(expect.objectContaining({
      where: expect.objectContaining({
        assignmentId: 'assignment-1',
        status: 'COMPLETED',
        finishedAt: {
          gte: new Date('2026-08-01'),
          lte: new Date('2026-08-31T23:59:59.999Z'),
        },
      }),
    }))
  })
})
