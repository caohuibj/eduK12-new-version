import { describe, expect, it } from 'vitest'
import { render, screen } from '@testing-library/react'
import ScaleUnitReportCard, { type SafeScaleUnitReport } from '../ScaleUnitReportCard'

const base = (): SafeScaleUnitReport => ({
  itemId: 'multi',
  type: 'SCALE',
  kind: 'scale',
  scaleId: 'multi-scale',
  scaleCode: 'MULTI',
  scaleName: '多维量表',
  result: null,
  quality: { status: 'interpretable', flags: [] },
  scores: [],
  references: [],
  interpretations: [],
  caveats: [],
  disclaimer: '仅用于测试。',
  completedAt: null,
  totalTime: null,
  method: null,
})

const score = (key: string, label: string, type: 'total' | 'dimension', value: number, max: number) => ({
  key,
  label,
  type,
  value,
  direction: 'descriptive' as const,
  canonical: type === 'total',
  displayPrecision: 1,
  range: { min: 0, max },
  expectedItems: [],
  answeredItems: [],
  status: 'calculated' as const,
  prorated: false,
})

describe('ScaleUnitReportCard multidimensional hierarchy', () => {
  it('renders an explicit total separately from explicit dimensions', () => {
    render(<ScaleUnitReportCard report={{
      ...base(),
      scores: [
        score('total', '总分', 'total', 72, 100),
        score('planning', '学习计划', 'dimension', 18, 25),
        score('persistence', '坚持性', 'dimension', 14, 20),
      ],
    }} />)

    expect(screen.getByText('总体结果')).toBeInTheDocument()
    expect(screen.getByText('维度结果')).toBeInTheDocument()
    expect(screen.getByText('72.0')).toBeInTheDocument()
    expect(screen.getByText('18.0')).toBeInTheDocument()
    expect(screen.getByText('14.0')).toBeInTheDocument()
  })

  it('does not invent an overall score for a dimension-only scale', () => {
    render(<ScaleUnitReportCard report={{
      ...base(),
      scores: [
        score('planning', '学习计划', 'dimension', 18, 25),
        score('persistence', '坚持性', 'dimension', 14, 20),
      ],
    }} />)

    expect(screen.queryByText('总体结果')).not.toBeInTheDocument()
    expect(screen.getByText('维度结果')).toBeInTheDocument()
    expect(screen.queryByText(/综合分|总分/)).not.toBeInTheDocument()
  })
})
