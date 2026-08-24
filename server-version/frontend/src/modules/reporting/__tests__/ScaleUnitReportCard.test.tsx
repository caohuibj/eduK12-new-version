import { describe, expect, it } from 'vitest'
import { render, screen } from '@testing-library/react'
import ScaleUnitReportCard from '../ScaleUnitReportCard'

describe('ScaleUnitReportCard PR6A null/zero and caveat contract', () => {
  it('renders zero as a score, null as an em dash, and shared caveats/disclaimer', () => {
    render(<ScaleUnitReportCard report={{
      itemId: 'scale-item-1',
      type: 'SCALE',
      kind: 'scale',
      scaleId: 'scale-1',
      scaleCode: 'S-1',
      scaleName: '学习投入',
      dimensionScores: [],
      feedback: {
        overall: '单项反馈',
        dimensions: [
          { dimensionId: 'd-zero', dimensionCode: 'zero', dimensionName: '零分维度', score: 0, minScore: 0, maxScore: 10, level: 'low', interpretation: '', suggestions: [] },
          { dimensionId: 'd-null', dimensionCode: 'missing', dimensionName: '缺失维度', score: null, minScore: 0, maxScore: 10, level: null, interpretation: '', suggestions: [] },
        ],
      },
      caveats: ['量表结果只用于本次作答解读。'],
      disclaimer: '不构成医学诊断。',
      completedAt: null,
      totalTime: 0,
      method: { scaleId: 'scale-1', scaleCode: 'S-1', reportDefinitionVersion: 'scale-unit-report-v1' },
    }} />)

    expect(screen.getByText('0.0分')).toBeTruthy()
    expect(screen.getAllByText('—').length).toBeGreaterThan(0)
    expect(screen.getByText('量表结果只用于本次作答解读。')).toBeTruthy()
    expect(screen.getByText('不构成医学诊断。')).toBeTruthy()
  })
})
