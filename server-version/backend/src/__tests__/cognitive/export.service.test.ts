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
  buildCognitiveResearchPackage,
  exportCognitiveToCSV,
  getCognitiveExportData,
  isAllowedCognitiveExportFileName,
  makeCognitiveExportFileName,
} from '../../modules/cognitive/export.service'
import { cognitiveExportRequestSchema } from '../../modules/cognitive/cognitive.schema'

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
  it('rejects exporting a composite wrapper', async () => {
    mockPrisma.cognitiveAssignment.findUnique.mockResolvedValue({ ...assignment, listedStandalone: false })
    await expect(getCognitiveExportData('assignment-1')).rejects.toMatchObject({
      statusCode: 403,
      message: '请从综合测评导出',
    })
  })

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

  it('adds profile, definition versions, and interpretable to summary', async () => {
    mockPrisma.cognitiveSession.findMany.mockResolvedValue([session()])
    const data = await getCognitiveExportData('assignment-1', { detail: 'summary', anonymize: true })
    const names = data.fields.map((field) => field.name)
    expect(names).toEqual(expect.arrayContaining([
      'A_profile',
      'A_metric_definition_version',
      'A_quality_interpretable',
    ]))
    expect(data.rows[0].A_quality_interpretable).toBe(1)
    expect(data.fields.find((field) => field.name === 'M_mean_rt_ms')?.label).toContain('平均反应时')
  })

  it('keeps null metric values distinct from zero', async () => {
    mockPrisma.cognitiveSession.findMany.mockResolvedValue([{
      ...session(),
      metricsEncrypted: encryptCognitivePayload({ medianRtMs: null, missCount: 0 }),
    }])
    const data = await getCognitiveExportData('assignment-1', { detail: 'summary' })
    expect(data.rows[0].M_median_rt_ms).toBeNull()
    expect(data.rows[0].M_miss_count).toBe(0)
  })

  it('builds research-long tables whose dictionary keys are in the registry', async () => {
    mockPrisma.cognitiveSession.findMany.mockResolvedValue([session(true)])
    const data = await getCognitiveExportData('assignment-1', { detail: 'research' })
    const pack = buildCognitiveResearchPackage(
      { ...assignment, profile: 'standard', resolvedReportSnapshotEncrypted: null },
      [{
        id: 'session-1',
        userId: 'student-1',
        anonymousCode: null,
        attemptNo: 1,
        testType: 'reaction',
        configVersion: '1.0.0',
        engineVersion: '1.0.0',
        scoringVersion: '1.0.0',
        startedAt: new Date('2026-08-20T10:00:00.000Z'),
        finishedAt: new Date('2026-08-20T10:01:00.000Z'),
        user: { id: 'student-1', nickname: '小明', username: 'student-1' },
        score: 88,
        metrics: { meanRtMs: 350, medianRtMs: 340, validTrialCount: 3 },
        qualityFlags: { interpretable: true, interrupted: false },
        trials: [
          { trialIndex: 0, payload: { rtMs: 320, foreperiodMs: 500 } },
          { trialIndex: 1, payload: { rtMs: 380, foreperiodMs: 700 } },
        ],
      }],
      true,
    )
    expect(pack.sessionRows).toHaveLength(1)
    expect(pack.metricRows.length).toBeGreaterThan(0)
    expect(pack.trialRows).toHaveLength(2)
    expect(pack.manifest.files).toEqual(expect.arrayContaining([
      'sessions.csv', 'metrics.csv', 'trials.csv', 'manifest.json', 'data_dictionary.xlsx', 'README.txt',
    ]))
    const reaction = (await import('../../modules/cognitive/cognitive.registry')).getCognitiveRegistryEntry('reaction', '1.0.0', '1.0.0')!
    const registryKeys = [...Object.keys(reaction.metricDefinitions), ...Object.keys(reaction.qualityDefinitions)]
    for (const row of pack.dictionaryRows) {
      expect(registryKeys).toContain(row.key)
    }
    expect(data.trialCount).toBe(2)
  })

  it('accepts research zip/xlsx filenames and rejects illegal detail/format combos', () => {
    const zip = makeCognitiveExportFileName('assignment-1', 'research', 'zip')
    const xlsx = makeCognitiveExportFileName('assignment-1', 'research', 'xlsx')
    expect(isAllowedCognitiveExportFileName(zip)).toBe(true)
    expect(isAllowedCognitiveExportFileName(xlsx)).toBe(true)
    expect(isAllowedCognitiveExportFileName(zip.replace('research', 'summary'))).toBe(false)
    expect(cognitiveExportRequestSchema.safeParse({ detail: 'summary', format: 'zip' }).success).toBe(false)
    expect(cognitiveExportRequestSchema.safeParse({ detail: 'research', format: 'csv' }).success).toBe(false)
    expect(cognitiveExportRequestSchema.safeParse({ detail: 'research', format: 'zip' }).success).toBe(true)
  })

  it('omits research-only CPT slopes from a standard summary', async () => {
    mockPrisma.cognitiveAssignment.findUnique.mockResolvedValue({
      ...assignment,
      profile: 'standard',
      config: { testType: 'cpt', configVersion: '1.0.0', engineVersion: '1.0.0', scoringVersion: '1.0.0' },
    })
    mockPrisma.cognitiveSession.findMany.mockResolvedValue([{
      ...session(),
      testType: 'cpt',
      metricsEncrypted: encryptCognitivePayload({
        dPrime: 1.2,
        omissionRate: 0.1,
        commissionRate: 0.1,
        rtICV: 0.2,
        blockSlopeRt: 12,
        blockSlopeOmission: 0.01,
      }),
    }])
    const data = await getCognitiveExportData('assignment-1', { detail: 'summary', anonymize: true })
    const names = data.fields.map((field) => field.name)
    expect(names).toContain('M_d_prime')
    expect(names).not.toContain('M_block_slope_rt')
    expect(names).not.toContain('M_block_slope_omission')
  })
})
