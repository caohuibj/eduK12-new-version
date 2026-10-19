import { beforeEach, describe, expect, it, vi } from 'vitest'
import { UserRole } from '@prisma/client'

process.env.DATA_ENCRYPTION_KEY = 'a'.repeat(64)

const mocks = vi.hoisted(() => ({
  db: {
    $queryRaw: vi.fn(),
    compositeAssessment: { findUnique: vi.fn() },
    compositeAssessmentAttempt: { count: vi.fn() },
    cognitiveTrial: { count: vi.fn() },
    relationalAssessmentAssignment: { findMany: vi.fn() },
  },
  graph: vi.fn(),
  events: [] as string[],
  readers: [] as Array<{ prepare: ReturnType<typeof vi.fn>; close: ReturnType<typeof vi.fn> }>,
}))

vi.mock('../../config/database', () => ({ prisma: mocks.db }))
vi.mock('../../modules/composite/training-variant-export', async (importOriginal) => ({
  ...await importOriginal<typeof import('../../modules/composite/training-variant-export')>(),
  loadTrainingVariantExportGraph: mocks.graph,
}))
vi.mock('../../modules/assessment-runtime/compact-assessment-storage', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../modules/assessment-runtime/compact-assessment-storage')>()
  return {
    ...actual,
    createStoredScaleExportReader: vi.fn((records: readonly any[]) => {
      const reader = actual.createStoredScaleExportReader(records)
      const tracked = {
        prepare: vi.fn(async (record: any) => {
          mocks.events.push(`prepare:${record.id}`)
          await reader.prepare(record)
          mocks.events.push(`prepared:${record.id}`)
        }),
        close: vi.fn(async () => {
          await reader.close()
          mocks.events.push('closed')
        }),
      }
      mocks.readers.push(tracked)
      return tracked
    }),
  }
})
vi.mock('../../modules/scale/scale-workflow.service', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../modules/scale/scale-workflow.service')>()
  return {
    ...actual,
    loadScaleResult: vi.fn(async (...args: Parameters<typeof actual.loadScaleResult>) => {
      mocks.events.push(`result:${args[1]?.id}`)
      return actual.loadScaleResult(...args)
    }),
    loadScaleAnswers: vi.fn(async (...args: Parameters<typeof actual.loadScaleAnswers>) => {
      mocks.events.push(`answers:${args[1]?.id}`)
      return actual.loadScaleAnswers(...args)
    }),
  }
})

import { createStoredScaleExportReader } from '../../modules/assessment-runtime/compact-assessment-storage'
import { loadScaleAnswers, loadScaleResult } from '../../modules/scale/scale-workflow.service'
import { compositeExportService } from '../../modules/composite/composite-export.service'

const provenance = {
  schemaVersion: 1,
  deviceClass: 'DESKTOP',
  osFamily: 'Windows',
  browserFamily: 'Chrome',
  viewportWidth: 1280,
  viewportHeight: 720,
  screenWidth: 1920,
  screenHeight: 1080,
  devicePixelRatio: 1,
  maxTouchPoints: 0,
  primaryPointer: 'FINE',
  capturedAt: '2026-08-20T10:00:00.000Z',
}

const scaleItem = (key: string, position: number) => ({
  id: `item-${key}`,
  type: 'SCALE',
  position,
  scale: {
    id: `scale-${key}`, code: key.toUpperCase(), name: `Scale ${key}`,
    definition: {
      items: [{ itemCode: `${key}1` }],
      scoring: { scores: [{ key, label: `Score ${key}` }] },
    },
  },
})

const scaleRecord = (attemptId: string, key: string, value: number | null) => ({
  id: `${attemptId}-${key}`,
  compositeItemId: `item-${key}`,
  attemptEpoch: 1,
  answers: {
    schemaVersion: 1,
    answers: value === null ? [] : [{ itemCode: `${key}1`, responseValue: 'never', responseTimeMs: 321 }],
    deviceInputProvenance: provenance,
  },
  result: {
    schemaVersion: 2,
    instrument: { scaleId: `scale-${key}`, code: key.toUpperCase(), name: `Scale ${key}`, instrumentVersion: '2.0.0' },
    method: {
      scaleId: `scale-${key}`, instrumentVersion: '2.0.0', scoringVersion: '2.0.0', reportVersion: '2.0.0',
      definitionHash: 'h'.repeat(64), referenceVersions: [], assessmentContext: null,
    },
    quality: { status: value === null ? 'invalid' : 'interpretable', flags: value === null ? ['score_not_calculable'] : [] },
    itemScores: value === null ? [] : [{ itemCode: `${key}1`, responseValue: 'never', baseScore: value, score: value }],
    scores: [{
      key, type: 'dimension', label: `Score ${key}`, direction: 'descriptive', canonical: true,
      displayPrecision: 0, value, range: { min: 0, max: 10 }, expectedItems: [`${key}1`],
      answeredItems: value === null ? [] : [`${key}1`], status: value === null ? 'not_calculable' : 'calculated', prorated: false,
    }],
    references: [], interpretations: [], caveats: [], disclaimer: 'Synthetic test only',
  },
})

const fixture = () => {
  const firstA = scaleRecord('attempt-z', 'a', 0)
  const firstB = scaleRecord('attempt-z', 'b', null)
  const secondB = scaleRecord('attempt-a', 'b', 7)
  const attempt = (id: string, scaleAssessments: ReturnType<typeof scaleRecord>[]) => ({
    id, anonymousCode: `ANON-${id}`, userId: null, user: null,
    completedAt: new Date('2026-08-20T10:01:00.000Z'), totalTime: 0,
    formAnswers: [], cognitiveSessions: [], scaleAssessments,
  })
  const template = {
    id: 'composite-reader', name: 'Reader projection', formSections: [],
    items: [scaleItem('a', 0), scaleItem('b', 1), scaleItem('c', 2)],
    attempts: [
      // Storage order is intentionally different from export column order.
      attempt('attempt-z', [firstB, scaleRecord('attempt-z', 'c', 9), firstA, scaleRecord('attempt-z', 'orphan', 9)]),
      attempt('attempt-a', [scaleRecord('attempt-a', 'a', 9), secondB]),
    ],
  }
  return {
    template,
    scopes: new Map([
      ['attempt-z', { itemIds: new Set(['item-a', 'item-b']), sectionIds: new Set() }],
      ['attempt-a', { itemIds: new Set(['item-b']), sectionIds: new Set() }],
    ]),
    expected: [firstA, firstB, secondB],
  }
}

beforeEach(() => {
  vi.clearAllMocks()
  mocks.events.length = 0
  mocks.readers.length = 0
  mocks.db.$queryRaw.mockResolvedValue([])
  mocks.db.compositeAssessmentAttempt.count.mockResolvedValue(2)
  mocks.db.cognitiveTrial.count.mockResolvedValue(0)
  mocks.db.relationalAssessmentAssignment.findMany.mockResolvedValue([{ id: 'visible-assignment' }])
  mocks.graph.mockResolvedValue(null)
})

describe('bounded Scale reader export integration', () => {
  it.each(['summary', 'full'] as const)('preserves %s output and prepares only selected authorized records in projection order', async (detail) => {
    const graph = fixture()
    mocks.graph.mockResolvedValue(graph)
    const options = {
      detail, accessTokenId: 'exact-wave', actor: { userId: 'teacher-1', role: UserRole.TEACHER },
      dateRange: { start: '2026-08-20', end: '2026-08-21' },
    }
    const data = await compositeExportService.getExportData(graph.template.id, options)
    const where = {
      AND: [
        { compositeAssessmentId: graph.template.id, status: 'COMPLETED', accessTokenId: 'exact-wave', userId: null,
          completedAt: { gte: new Date('2026-08-20'), lte: new Date('2026-08-21T23:59:59.999Z') } },
        { OR: [{ assignmentRef: null }, { assignmentRef: { in: ['visible-assignment'] } }] },
      ],
    }
    expect(mocks.db.compositeAssessmentAttempt.count).toHaveBeenCalledWith({ where })
    expect(mocks.graph).toHaveBeenCalledWith(graph.template.id, where, options)
    expect(mocks.db.compositeAssessment.findUnique).not.toHaveBeenCalled()
    expect(createStoredScaleExportReader).toHaveBeenCalledExactlyOnceWith(graph.expected)
    expect(mocks.readers[0].prepare.mock.calls.map(([record]) => record)).toEqual(graph.expected)
    expect(vi.mocked(loadScaleResult).mock.calls.map(([value, record]) => [value, record])).toEqual(graph.expected.map(record => [record.result, record]))
    expect(vi.mocked(loadScaleAnswers).mock.calls.map(([value, record]) => [value, record])).toEqual(graph.expected.map(record => [record.answers, record]))
    expect(mocks.events).toEqual([
      ...graph.expected.flatMap(record => [`prepare:${record.id}`, `prepared:${record.id}`, `result:${record.id}`, `answers:${record.id}`]),
      'closed',
    ])
    expect(mocks.readers[0].close).toHaveBeenCalledTimes(1)
    expect(data.rows.map(row => row.A_attempt_id)).toEqual(['attempt-z', 'attempt-a'])
    expect(data.rows[0]).toMatchObject({
      A_duration_s: 0, S001_SCORE_a: 0, S001_device_class: 'DESKTOP', S001_quality_status: 'interpretable',
      S001_report_definition_version: '2.0.0', S002_SCORE_b: null, S002_quality_status: 'invalid', S003_SCORE_c: null,
    })
    expect(data.rows[1]).toMatchObject({ S001_SCORE_a: null, S001_device_class: null, S002_SCORE_b: 7, S003_SCORE_c: null })
    expect(data.trialCount).toBe(0)
    if (detail === 'full') {
      expect(data.rows[0]).toMatchObject({ S001_Q_V_a1: 'never', S001_Q_S_a1: 0, S001_RT_a1: 321, S002_Q_V_b1: null })
      expect(data.rows[1]).toMatchObject({ S001_Q_V_a1: null, S002_Q_V_b1: 'never', S002_Q_S_b1: 7 })
    } else {
      expect(data.fields.some(field => /_(?:Q_V|Q_S|RT)_/.test(field.name))).toBe(false)
    }

    // The pre-optimization path uses these same per-row loaders without preparation.
    vi.mocked(createStoredScaleExportReader).mockImplementationOnce(() => ({
      prepare: async () => {}, close: async () => {},
    }))
    const baseline = await compositeExportService.getExportData(graph.template.id, options)
    expect(data).toEqual(baseline)
    expect(compositeExportService.exportToCSV(data)).toBe(compositeExportService.exportToCSV(baseline))
  })

  it('does not construct or prepare a reader before governed-export authorization succeeds', async () => {
    mocks.db.$queryRaw.mockResolvedValueOnce([{ id: 'governed-execution' }])
    await expect(compositeExportService.getExportData('composite-reader')).rejects.toMatchObject({ statusCode: 403 })
    expect(mocks.graph).not.toHaveBeenCalled()
    expect(createStoredScaleExportReader).not.toHaveBeenCalled()
    expect(loadScaleResult).not.toHaveBeenCalled()
    expect(loadScaleAnswers).not.toHaveBeenCalled()
  })

  it('does not fall back or prepare records when authorized graph resolution fails', async () => {
    const failure = new Error('Frozen scope is invalid')
    mocks.graph.mockRejectedValueOnce(failure)
    await expect(compositeExportService.getExportData('composite-reader')).rejects.toBe(failure)
    expect(mocks.db.compositeAssessment.findUnique).not.toHaveBeenCalled()
    expect(createStoredScaleExportReader).not.toHaveBeenCalled()
  })

  it('closes the active reader when projection fails and does not process later records', async () => {
    const graph = fixture()
    mocks.graph.mockResolvedValue(graph)
    const failure = new Error('Projection failed')
    vi.mocked(loadScaleResult).mockRejectedValueOnce(failure)
    await expect(compositeExportService.getExportData(graph.template.id)).rejects.toBe(failure)
    expect(mocks.readers[0].prepare).toHaveBeenCalledExactlyOnceWith(graph.expected[0])
    expect(mocks.readers[0].close).toHaveBeenCalledTimes(1)
    expect(loadScaleAnswers).not.toHaveBeenCalled()
    expect(mocks.events).toEqual([`prepare:${graph.expected[0].id}`, `prepared:${graph.expected[0].id}`, 'closed'])
  })
})
