import { beforeEach, describe, expect, it, vi } from 'vitest'

const db = vi.hoisted(() => ({
  scale: { findUnique: vi.fn() },
  assessment: { findMany: vi.fn() },
  questionnaire: { findUnique: vi.fn() },
  questionnaireAssessment: { findMany: vi.fn() },
}))

vi.mock('../../config/database', () => ({ prisma: db }))

import { getQuestionnaireExportData, getScaleExportData } from '../../services/exportService.legacy'

describe('bounded generic export preview reads', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    db.assessment.findMany.mockResolvedValue([])
    db.questionnaireAssessment.findMany.mockResolvedValue([])
  })

  it('pushes the Scale preview sample limit into Prisma', async () => {
    db.scale.findUnique.mockResolvedValue({
      id: 'scale-1',
      name: 'Scale',
      definition: {
        items: [{ itemCode: 'I1', content: 'Item 1' }],
        scoring: { scores: [{ key: 'total', label: 'Total' }] },
      },
    })

    await getScaleExportData('scale-1', { anonymize: true, recordLimit: 5 } as any)

    expect(db.assessment.findMany).toHaveBeenCalledOnce()
    expect(db.assessment.findMany.mock.calls[0][0]).toMatchObject({
      take: 5,
      where: { scaleId: 'scale-1' },
    })
  })

  it('pushes the Questionnaire preview sample limit into Prisma', async () => {
    db.questionnaire.findUnique.mockResolvedValue({
      id: 'questionnaire-1',
      formItems: [],
      questionnaireScales: [],
    })

    await getQuestionnaireExportData('questionnaire-1', { anonymize: true, recordLimit: 5 } as any)

    expect(db.questionnaireAssessment.findMany).toHaveBeenCalledOnce()
    expect(db.questionnaireAssessment.findMany.mock.calls[0][0]).toMatchObject({
      take: 5,
      where: { questionnaireId: 'questionnaire-1' },
    })
  })
})
