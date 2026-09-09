import { describe, expect, it } from 'vitest'
import { render, screen } from '@testing-library/react'
import ScaleUnitReportCard, { type SafeScaleUnitReport } from '../ScaleUnitReportCard'

const completeReport: SafeScaleUnitReport = {
  itemId: 'who5-report-1',
  type: 'SCALE',
  kind: 'scale',
  scaleId: 'who5',
  scaleCode: 'WHO5_ZH_CN_V1',
  scaleName: 'WHO-5 幸福感指数',
  result: {
    schemaVersion: 2,
    instrument: {
      scaleId: 'who5',
      code: 'WHO5_ZH_CN_V1',
      name: 'WHO-5 幸福感指数',
      instrumentVersion: '1.0.0',
    },
    method: {
      scaleId: 'who5',
      instrumentVersion: '1.0.0',
      scoringVersion: '1.0.0',
      reportVersion: '1.0.0',
      definitionHash: 'who5-definition-hash',
      referenceVersions: [],
      assessmentContext: null,
    },
    quality: { status: 'interpretable', flags: [] },
    itemScores: [],
    scores: [{
      key: 'total',
      type: 'total',
      label: '总体幸福感',
      direction: 'higher_is_better',
      canonical: true,
      displayPrecision: 1,
      value: 18,
      range: { min: 0, max: 25 },
      expectedItems: ['WHO5_01'],
      answeredItems: ['WHO5_01'],
      status: 'calculated',
      prorated: false,
    }],
    references: [],
    interpretations: [{
      scoreKey: 'total',
      headline: '当前幸福感处于中等水平',
      label: 'WHO-5 总分',
      interpretation: '这是一项关于近期主观幸福感的简短自我观察结果。',
      guidance: [{
        category: 'strategy',
        text: '建议结合近期睡眠和社交活动进行一周记录。',
      }],
      limitations: ['结果不用于临床诊断。'],
      referenceVersion: null,
    }],
    caveats: ['结果需要结合近期生活情境理解。'],
    disclaimer: '不构成医学诊断或治疗建议。',
  },
  caveats: ['结果需要结合近期生活情境理解。'],
  disclaimer: '不构成医学诊断或治疗建议。',
  completedAt: '2026-09-09T00:00:00.000Z',
  totalTime: 120000,
}

describe('ScaleUnitReportCard Wave 0 report presentation', () => {
  it('renders score, interpretation, guidance, truthful reference state, caveat, and disclaimer', () => {
    render(<ScaleUnitReportCard report={completeReport} />)

    expect(screen.getByTestId('scale-core-feedback')).toBeTruthy()
    expect(screen.getByText('当前幸福感处于中等水平')).toBeTruthy()
    expect(screen.getByText('建议结合近期睡眠和社交活动进行一周记录。')).toBeTruthy()
    expect(screen.getByText('18.0')).toBeTruthy()
    expect(screen.getByTestId('scale-reference-layer')).toBeTruthy()
    expect(screen.getByText('未提供群体参考。')).toBeTruthy()
    expect(screen.getByText('结果需要结合近期生活情境理解。')).toBeTruthy()
    expect(screen.getByTestId('scale-disclaimer')).toHaveTextContent('不构成医学诊断或治疗建议。')
  })
})
