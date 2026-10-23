import { describe, expect, it } from 'vitest'

process.env.DATA_ENCRYPTION_KEY = 'a'.repeat(64)

import { encryptField } from '../../utils/encryption'
import { buildScaleUnitReport, projectScaleUnitReport } from '../../modules/reporting/scale-unit-report'
import { buildQuestionnaireCollectionReport } from '../../modules/reporting/questionnaire-collection-report'
import { createScaleProjectionContext } from '../../modules/scale/projection/context-factory'
import type { ScaleResultV2 } from '../../modules/scale/scale-result'

const makeResult = (overrides: Partial<ScaleResultV2> = {}): ScaleResultV2 => ({
  schemaVersion: 2,
  instrument: { scaleId: 'scale-1', code: 'adexi_v1', name: '学习投入', instrumentVersion: '2.0.0' },
  method: {
    scaleId: 'scale-1',
    instrumentVersion: '2.0.0',
    scoringVersion: '2.0.0',
    reportVersion: '2.0.0',
    definitionHash: 'h'.repeat(64),
    referenceVersions: [],
    assessmentContext: null,
  },
  quality: { status: 'interpretable', flags: [] },
  itemScores: [{ itemCode: 'Q1', responseValue: 'never', baseScore: 1, score: 1 }],
  scores: [{
    key: 'engagement',
    type: 'dimension',
    label: '投入',
    direction: 'descriptive',
    canonical: true,
    displayPrecision: 1,
    value: 0,
    range: { min: 0, max: 20 },
    expectedItems: ['Q1'],
    answeredItems: ['Q1'],
    status: 'calculated',
    prorated: false,
  }],
  references: [],
  interpretations: [],
  caveats: ['同一项注意事项'],
  disclaimer: '同一项免责声明',
  ...overrides,
})

describe('Scale unit report contract', () => {
  it('keeps the internal v2 report complete without inventing collection interpretation', () => {
    const result = makeResult()
    const report = buildScaleUnitReport({
      itemId: 'questionnaire-scale-1',
      scaleId: 'scale-1',
      scaleCode: 'adexi_v1',
      scaleName: '学习投入',
      result,
      completedAt: new Date('2026-08-20T01:00:00.000Z'),
      totalTime: 0,
    })

    expect(report).toMatchObject({
      type: 'SCALE',
      kind: 'scale',
      scaleId: 'scale-1',
      totalTime: 0,
      result,
      scores: [{ key: 'engagement', value: 0, range: { min: 0, max: 20 } }],
      caveats: ['同一项注意事项'],
      disclaimer: '同一项免责声明',
    })
    expect(report).not.toHaveProperty('averageScore')
    expect(report).not.toHaveProperty('overallScore')
    expect(report).not.toHaveProperty('overallSummary')
  })

  it('decrypts only the frozen v2 result and keeps malformed ciphertext local to the unit', () => {
    const result = makeResult()
    const report = buildScaleUnitReport({
      scaleId: 'scale-v2',
      scaleCode: 'adexi_v1',
      scaleName: '历史量表',
      result: encryptField(result),
    })
    expect(report.scores[0]).toMatchObject({ key: 'engagement', value: 0 })
    expect(report.method?.definitionHash).toBe('h'.repeat(64))

    const degraded = buildScaleUnitReport({
      scaleId: 'scale-bad',
      scaleName: '损坏量表',
      result: 'not-a-ciphertext',
    })
    expect(degraded).toMatchObject({ decryptError: true, result: null, scores: [] })
  })

  it('re-projects authenticated/public stored reports through the same respondent disclosure boundary', () => {
    const result = makeResult()
    const qa = {
      questionnaire: {
        name: '问卷',
        questionnaireScales: [{
          id: 'questionnaire-scale-1',
          scaleId: 'scale-1',
          position: 0,
          scale: { id: 'scale-1', code: 'adexi_v1', name: '学习投入', instrumentVersion: '2.0.0' },
        }],
        formItems: [],
      },
      scaleAssessments: [{
        id: 'assessment-1',
        scaleId: 'scale-1',
        result,
        completedAt: new Date('2026-08-20T01:00:00.000Z'),
        totalTime: 0,
        scale: { id: 'scale-1', code: 'adexi_v1', name: '学习投入', instrumentVersion: '2.0.0' },
      }],
      formAnswers: [],
    }
    const authenticated = buildQuestionnaireCollectionReport(qa).unitReports[0]
    const publicProjection = buildQuestionnaireCollectionReport(structuredClone(qa)).unitReports[0]
    const internal = buildScaleUnitReport({
      itemId: 'questionnaire-scale-1',
      scaleId: 'scale-1',
      scaleCode: 'adexi_v1',
      scaleName: '学习投入',
      result,
      completedAt: qa.scaleAssessments[0].completedAt,
      totalTime: 0,
    })
    const expected = projectScaleUnitReport(internal, createScaleProjectionContext({
      instrumentKey: 'adexi_v1',
      instrumentVersion: '2.0.0',
      audience: 'respondent',
      purpose: 'report',
    }))

    expect(authenticated).toEqual(publicProjection)
    expect(authenticated).toEqual(expected)
    expect(authenticated).toMatchObject({
      type: 'SCALE',
      kind: 'scale',
      scores: [{ key: 'engagement', value: 0 }],
      caveats: ['同一项注意事项'],
      disclaimer: '同一项免责声明',
    })
    expect(authenticated).not.toHaveProperty('result')
  })
})


describe('explicit frozen report content audience', () => {
  const report = (audience?: 'student' | 'teacher') => {
    const result = makeResult()
    result.method.reportAudience = audience
    result.rawScoreFeedback = [{ scoreKey: 'engagement', rangeKey: 'range', text: 'Frozen feedback' }]
    return buildScaleUnitReport({ scaleId: 'scale-1', scaleName: 'Example', result })
  }
  const context = () => createScaleProjectionContext({ instrumentKey: 'adexi_v1', instrumentVersion: '2.0.0',
    audience: 'respondent', purpose: 'report' })

  it('keeps the old respondent default unchanged for teacher content', () => {
    const input = report('teacher'), ctx = context()
    expect(projectScaleUnitReport(input, ctx)).toEqual(projectScaleUnitReport(input, ctx, undefined))
    expect(projectScaleUnitReport(input, ctx)).not.toHaveProperty('rawScoreFeedback')
  })

  it('selects teacher content without changing the respondent viewing context', () => {
    const input = report('teacher'), ctx = context(), before = structuredClone(ctx)
    expect(projectScaleUnitReport(input, ctx, { contentAudience: 'teacher' }).rawScoreFeedback)
      .toEqual([{ scoreKey: 'engagement', rangeKey: 'range', text: 'Frozen feedback' }])
    expect(ctx).toEqual(before)
    expect(projectScaleUnitReport(input, ctx, { contentAudience: 'student' })).not.toHaveProperty('rawScoreFeedback')
  })

  it('cannot elevate disclosure with explicit matching content', () => {
    const input = report('teacher'), ctx = context()
    ctx.currentRestrictions.individualInterpretations = false
    expect(projectScaleUnitReport(input, ctx, { contentAudience: 'teacher' })).not.toHaveProperty('rawScoreFeedback')
    ctx.accessDecision.allowed = false
    expect(projectScaleUnitReport(input, ctx, { contentAudience: 'teacher' })).toMatchObject({ reportKind: 'completion' })
  })

  it('preserves historical output when the result has no report audience', () => {
    const input = report(), ctx = context()
    expect(projectScaleUnitReport(input, ctx)).toEqual(projectScaleUnitReport(input, ctx, { contentAudience: 'student' }))
  })
})
