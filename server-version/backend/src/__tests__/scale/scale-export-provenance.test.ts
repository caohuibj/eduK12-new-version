import { beforeEach, describe, expect, it, vi } from 'vitest'

process.env.DATA_ENCRYPTION_KEY = 'a'.repeat(64)

const { mockPrisma } = vi.hoisted(() => ({
  mockPrisma: {
    scale: { findUnique: vi.fn() },
    assessment: { findMany: vi.fn() },
    questionnaire: { findUnique: vi.fn() },
    questionnaireAssessment: { findMany: vi.fn() },
  },
}))

vi.mock('../../config/database', () => ({ prisma: mockPrisma }))

import { encryptScaleAnswers } from '../../modules/scale/scale-workflow.service'
import { getQuestionnaireExportData, getScaleExportData } from '../../services/exportService'

const definition = {
  items: [{ itemCode: 'Q1', content: '题目 1' }],
  scoring: { scores: [{ key: 'total', label: '总分' }] },
}

const provenance = {
  schemaVersion: 1 as const,
  deviceClass: 'TABLET' as const,
  osFamily: 'Android' as const,
  browserFamily: 'Chrome' as const,
  viewportWidth: 1024,
  viewportHeight: 768,
  screenWidth: 1280,
  screenHeight: 800,
  devicePixelRatio: 1.25,
  maxTouchPoints: 5,
  primaryPointer: 'COARSE' as const,
  capturedAt: '2026-09-08T00:00:00.000Z',
}

const encodedAnswers = encryptScaleAnswers([
  { itemCode: 'Q1', responseValue: 'yes', responseTimeMs: 1234 },
], provenance)

beforeEach(() => {
  vi.clearAllMocks()
})

describe('Scale response and device provenance export', () => {
  it('exports standalone attempt provenance beside responseTimeMs', async () => {
    mockPrisma.scale.findUnique.mockResolvedValue({ id: 'scale-1', name: '测试量表', definition })
    mockPrisma.assessment.findMany.mockResolvedValue([{
      userId: 'user-1',
      user: null,
      totalTime: 5000,
      completedAt: new Date('2026-09-08T00:01:00.000Z'),
      status: 'COMPLETED',
      answers: encodedAnswers,
      result: null,
    }])

    const data = await getScaleExportData('scale-1')
    const names = data.fields.map((field) => field.name)
    expect(names).toEqual(expect.arrayContaining([
      'DEVICE_CLASS',
      'DEVICE_OS_FAMILY',
      'DEVICE_BROWSER_FAMILY',
      'DEVICE_VIEWPORT_WIDTH',
      'DEVICE_SCREEN_HEIGHT',
      'DEVICE_PRIMARY_POINTER',
      'DEVICE_CAPTURED_AT',
      'RT_q1',
    ]))
    expect(data.rows[0]).toMatchObject({
      DEVICE_CLASS: 'TABLET',
      DEVICE_OS_FAMILY: 'Android',
      DEVICE_BROWSER_FAMILY: 'Chrome',
      DEVICE_VIEWPORT_WIDTH: 1024,
      DEVICE_SCREEN_HEIGHT: 800,
      DEVICE_PRIMARY_POINTER: 'COARSE',
      DEVICE_CAPTURED_AT: '2026-09-08T00:00:00.000Z',
      RT_q1: 1234,
    })
  })

  it('exports questionnaire Scale provenance and leaves historical missing provenance null', async () => {
    mockPrisma.questionnaire.findUnique.mockResolvedValue({
      id: 'questionnaire-1',
      formItems: [],
      questionnaireScales: [{
        scale: { id: 'scale-1', name: '测试量表', code: 'TEST', instrumentVersion: '1.0.0', definition },
      }],
    })
    mockPrisma.questionnaireAssessment.findMany.mockResolvedValue([{
      userId: null,
      user: null,
      totalTime: null,
      completedAt: null,
      contextSnapshotHash: null,
      formAnswers: [],
      scaleAssessments: [
        { scaleId: 'scale-1', status: 'COMPLETED', answers: encodedAnswers, result: null },
      ],
    }])

    const data = await getQuestionnaireExportData('questionnaire-1')
    expect(data.rows[0]).toMatchObject({
      S1_DEVICE_CLASS: 'TABLET',
      S1_DEVICE_CAPTURED_AT: '2026-09-08T00:00:00.000Z',
      S1_RT_q1: 1234,
    })

    mockPrisma.questionnaireAssessment.findMany.mockResolvedValueOnce([{
      userId: null,
      user: null,
      totalTime: null,
      completedAt: null,
      contextSnapshotHash: null,
      formAnswers: [],
      scaleAssessments: [{ scaleId: 'scale-1', status: 'COMPLETED', answers: encryptScaleAnswers([{ itemCode: 'Q1', responseValue: 'yes' }]), result: null }],
    }])
    const historical = await getQuestionnaireExportData('questionnaire-1')
    expect(historical.rows[0].S1_DEVICE_CLASS).toBeNull()
    expect(historical.rows[0].S1_RT_q1).toBeNull()
  })
})
