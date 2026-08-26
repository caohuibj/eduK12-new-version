import { describe, expect, it } from 'vitest'

process.env.DATA_ENCRYPTION_KEY = 'a'.repeat(64)

import { encryptField } from '../../utils/encryption'
import { buildScaleUnitReport } from '../../modules/reporting/scale-unit-report'
import { buildQuestionnaireCollectionReport } from '../../modules/reporting/questionnaire-collection-report'

describe('Scale unit report contract', () => {
  it('projects one scale without collection interpretation and preserves zero/null', () => {
    const report = buildScaleUnitReport({
      itemId: 'questionnaire-scale-1',
      scaleId: 'scale-1',
      scaleCode: 'S-1',
      scaleName: '学习投入',
      dimensions: [{ id: 'dimension-1', code: 'engagement', name: '投入', minScore: 0, maxScore: 20 }],
      scores: [{ dimensionId: 'dimension-1', rawScore: 0, normalizedScore: null, level: 'low', itemCount: 4 }],
      feedback: {
        overall: '单项反馈',
        dimensions: [{ dimensionId: 'dimension-1', score: 0, level: 'low', interpretation: '解释', suggestions: [] }],
      },
      totalTime: 0,
    })

    expect(report).toMatchObject({
      type: 'SCALE',
      kind: 'scale',
      scaleId: 'scale-1',
      totalTime: 0,
      dimensionScores: [{ rawScore: 0, normalizedScore: null, minScore: 0, maxScore: 20 }],
      feedback: { dimensions: [{ score: 0, minScore: 0, maxScore: 20 }] },
    })
    expect(report).not.toHaveProperty('averageScore')
    expect(report).not.toHaveProperty('overallScore')
    expect(report).not.toHaveProperty('overallSummary')
  })

  it('reads historical encrypted scale fields and keeps malformed fields local to the unit', () => {
    const report = buildScaleUnitReport({
      scaleId: 'scale-legacy',
      scaleName: '历史量表',
      scores: encryptField([{ dimensionId: 'd1', rawScore: 3, normalizedScore: 0 }]),
      feedback: encryptField({ dimensions: [{ dimensionId: 'd1', score: 0, suggestions: [] }] }),
    })
    expect(report.dimensionScores[0]).toMatchObject({ rawScore: 3, normalizedScore: 0 })
    expect(report.feedback.dimensions[0]).toMatchObject({ score: 0 })

    const degraded = buildScaleUnitReport({
      scaleId: 'scale-bad',
      scaleName: '损坏量表',
      scores: 'not-a-ciphertext',
      feedback: { dimensions: [] },
    })
    expect(degraded).toMatchObject({ decryptError: true, dimensionScores: [] })
    expect(degraded).not.toHaveProperty('feedback')
  })

  it('keeps caveats and disclaimer identical across authenticated/public collection projections', () => {
    const qa = {
      questionnaire: {
        name: '问卷',
        questionnaireScales: [{ id: 'questionnaire-scale-1', scaleId: 'scale-1', position: 0, scale: { id: 'scale-1', code: 'S-1', name: '学习投入', dimensions: [{ id: 'dimension-1', code: 'engagement', name: '投入', minScore: 0, maxScore: 20 }] } }],
        formItems: [],
      },
      scaleAssessments: [{
        id: 'assessment-1',
        scaleId: 'scale-1',
        scores: [{ dimensionId: 'dimension-1', rawScore: 0, normalizedScore: null }],
        feedback: { overall: '单项反馈', caveats: ['同一项注意事项'], disclaimer: '同一项免责声明', dimensions: [{ dimensionId: 'dimension-1', score: 0, level: 'low', interpretation: '', suggestions: [] }] },
        completedAt: new Date('2026-08-20T01:00:00.000Z'),
        totalTime: 0,
        scale: { id: 'scale-1', code: 'S-1', name: '学习投入', dimensions: [{ id: 'dimension-1', code: 'engagement', name: '投入', minScore: 0, maxScore: 20 }] },
      }],
      formAnswers: [],
    }
    const authenticated = buildQuestionnaireCollectionReport(qa).unitReports[0]
    const publicProjection = buildQuestionnaireCollectionReport(structuredClone(qa)).unitReports[0]
    const direct = buildScaleUnitReport({
      itemId: 'questionnaire-scale-1',
      scaleId: 'scale-1',
      scaleCode: 'S-1',
      scaleName: '学习投入',
      scores: qa.scaleAssessments[0].scores,
      feedback: qa.scaleAssessments[0].feedback,
      dimensions: qa.questionnaire.questionnaireScales[0].scale.dimensions,
      completedAt: qa.scaleAssessments[0].completedAt,
      totalTime: 0,
    })

    expect(authenticated).toEqual(publicProjection)
    expect(authenticated).toEqual(direct)
    expect(authenticated).toMatchObject({ caveats: ['同一项注意事项'], disclaimer: '同一项免责声明' })
  })
})
