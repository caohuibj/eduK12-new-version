import { beforeEach, describe, expect, it, vi } from 'vitest'

process.env.DATA_ENCRYPTION_KEY = 'a'.repeat(64)

const { mockPrisma } = vi.hoisted(() => ({
  mockPrisma: {
    compositeAssessment: { findUnique: vi.fn() },
  },
}))

vi.mock('../../config/database', () => ({ prisma: mockPrisma }))

import { encryptCognitivePayload } from '../../modules/cognitive/cognitive.security'
import { compositeExportService } from '../../modules/composite/composite-export.service'

const makeTemplate = (withTrials: boolean, metrics: Record<string, unknown> = { meanRtMs: 350, validTrialCount: 2 }) => ({
  id: 'composite-1',
  name: '量表+反应时综合测评',
  items: [{
    id: 'item-cognitive',
    type: 'COGNITIVE',
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

beforeEach(() => vi.clearAllMocks())

describe('composite export service', () => {
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
