import { describe, expect, it } from 'vitest'
import { toScaleUnitReport } from '../../../pages/student/ScaleResult'

describe('standalone ScaleResult unit-report adapter', () => {
  it('preserves scale code, method provenance, and an explicitly empty disclaimer', () => {
    const report = toScaleUnitReport({
      id: 'assessment-1',
      status: 'COMPLETED',
      scores: [
        {
          dimensionId: 'dimension-1',
          dimensionCode: 'attention',
          dimensionName: '注意',
          rawScore: 0,
          normalizedScore: null,
          level: null,
          itemCount: 1,
          minScore: 0,
          maxScore: 4,
        },
      ],
      feedback: {
        overall: '',
        dimensions: [],
        feedbackLevel: 'descriptive',
        caveats: [],
        disclaimer: '',
      },
      startedAt: '2026-08-24T00:00:00.000Z',
      completedAt: '2026-08-24T00:01:00.000Z',
      totalTime: 60_000,
      scale: {
        id: 'scale-1',
        code: 'S-1',
        name: '注意量表',
        description: null,
      },
    })

    expect(report.scaleCode).toBe('S-1')
    expect(report.method).toEqual({
      scaleId: 'scale-1',
      scaleCode: 'S-1',
      reportDefinitionVersion: 'scale-unit-report-v1',
    })
    expect(report.disclaimer).toBe('')
    expect(report.dimensionScores[0]).toMatchObject({ rawScore: 0, normalizedScore: null })
  })
})
