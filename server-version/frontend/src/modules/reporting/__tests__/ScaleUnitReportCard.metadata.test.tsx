import { describe, expect, it } from 'vitest'
import { fireEvent, render, screen } from '@testing-library/react'
import ScaleUnitReportCard, { type SafeScaleUnitReport } from '../ScaleUnitReportCard'
import type { ExternalScaleScoreValue } from '../types'

const metric = (): ExternalScaleScoreValue => ({
  key: 'emotional-response', type: 'dimension', label: '面对受挫时的难受与慌乱', value: 21,
  range: { min: 7, max: 35 }, displayPrecision: 0, direction: 'higher_is_more',
  description: '此保存版本中，更高分表示自述中更少慌乱，不表示负性情绪更多。',
  expectedItems: ['not-for-display-1', 'not-for-display-2'], answeredItems: ['not-for-display-1', 'not-for-display-2'],
  status: 'calculated', prorated: false,
})
const report = (score: ExternalScaleScoreValue = metric()): SafeScaleUnitReport => ({
  itemId: 'metadata', type: 'SCALE', kind: 'scale', scaleCode: 'synthetic-metadata', scaleName: '合成结果',
  reportKind: 'full', scores: [score], quality: { status: 'interpretable', flags: [] },
  references: [], interpretations: [], caveats: [], disclaimer: '不是人群排名。',
  completedAt: null, totalTime: null,
})

describe('Scale report saved public score metadata', () => {
  it('shows real response counts and the saved dimension meaning without item identities or a percentile', () => {
    const view = render(<ScaleUnitReportCard report={report()} />)
    expect(screen.getByLabelText('面对受挫时的难受与慌乱作答数量')).toHaveTextContent('已答 2 / 共 2 题未答 0 题')
    expect(screen.getByText(/此保存版本中，更高分表示自述中更少慌乱/)).toBeInTheDocument()
    expect(view.container.textContent).not.toContain('not-for-display')
    expect(view.container.textContent).not.toMatch(/百分位|百分制|前\d+%/)
    expect(screen.getByRole('img', { name: /范围 7 到 35，本次结果 21/ })).toBeInTheDocument()
  })

  it('keeps zero values distinct from missing scores and reports an actual zero answered count', () => {
    const score = { ...metric(), label: '合成零分', value: 0, range: { min: 0, max: 10 } }
    const view = render(<ScaleUnitReportCard report={report(score)} />)
    expect(screen.getByRole('img', { name: '合成零分，范围 0 到 10，本次结果 0' })).toBeInTheDocument()
    view.rerender(<ScaleUnitReportCard report={{ ...report({ ...score, value: null, answeredItems: [], status: 'not_calculable' }), quality: { status: 'invalid', flags: [] } }} />)
    expect(screen.getByLabelText('合成零分作答数量')).toHaveTextContent('已答 0 / 共 2 题未答 2 题')
    expect(screen.getByText('—')).toBeInTheDocument()
    expect(screen.getByText('无法计算')).toBeInTheDocument()
    expect(view.container.querySelector('.report-range__marker')).toBeNull()
    expect(screen.queryByTestId('scale-core-feedback')).not.toBeInTheDocument()
  })

  it('leaves counts unknown when projected metadata is absent, empty or inconsistent', () => {
    const view = render(<ScaleUnitReportCard report={report({ ...metric(), expectedItems: undefined, answeredItems: undefined })} />)
    expect(screen.getByText('作答数量未提供')).toBeInTheDocument()
    for (const metadata of [
      { expectedItems: [], answeredItems: [] },
      { expectedItems: ['q1', 'q1'], answeredItems: ['q1'] },
      { expectedItems: ['q1'], answeredItems: ['q2'] },
      { expectedItems: ['q1'], answeredItems: ['q1', 'q1'] },
    ]) {
      view.rerender(<ScaleUnitReportCard report={report({ ...metric(), ...metadata })} />)
      expect(screen.getByText('作答数量未提供')).toBeInTheDocument()
      expect(view.container.textContent).not.toContain('已答')
    }
  })

  it('uses only a supplied direction when no saved explanation exists and preserves unknown direction', () => {
    const view = render(<ScaleUnitReportCard report={report({ ...metric(), description: undefined })} />)
    expect(screen.getByText(/高分表示所测特征较多，不直接代表更好或排名更靠前/)).toBeInTheDocument()
    view.rerender(<ScaleUnitReportCard report={report({ ...metric(), description: undefined, direction: undefined })} />)
    expect(screen.getByText(/计分方向未提供/)).toBeInTheDocument()
  })

  it('shows partial counts alongside a supplied limited-data status without altering the saved value', () => {
    render(<ScaleUnitReportCard report={{ ...report({ ...metric(), value: 12, answeredItems: ['not-for-display-1'], status: 'limited', prorated: true }), quality: { status: 'limited', flags: [] } }} />)
    expect(screen.getByLabelText('面对受挫时的难受与慌乱作答数量')).toHaveTextContent('已答 1 / 共 2 题未答 1 题')
    expect(screen.getByText('12')).toBeInTheDocument()
    expect(screen.getByText('有限数据 · 已折算')).toBeInTheDocument()
  })

  it('does not expose retained score metadata in completion, unavailable or educational disclosures', () => {
    const value = report({ ...metric(), description: 'SECRET_EXPLANATION' })
    const view = render(<ScaleUnitReportCard report={{ ...value, reportKind: 'completion' }} />)
    for (const kind of ['completion', 'unavailable', 'educational'] as const) {
      view.rerender(<ScaleUnitReportCard report={{ ...value, reportKind: kind }} />)
      expect(view.container.textContent).not.toContain('SECRET_EXPLANATION')
      expect(screen.queryByLabelText('面对受挫时的难受与慌乱作答数量')).not.toBeInTheDocument()
      expect(screen.queryByTestId('scale-score-layer')).not.toBeInTheDocument()
    }
  })
  it('keeps the original-scale graphic visible and places technical limits in an optional disclosure', () => {
    const value = { ...report(), caveats: ['该语言版本尚无本地人群常模。'] }
    render(<ScaleUnitReportCard report={value} />)
    expect(screen.getByTestId('scale-score-layer')).toHaveTextContent('这次回答的概览')
    expect(screen.getByRole('img', { name: /范围 7 到 35，本次结果 21/ })).toBeInTheDocument()
    const extra = screen.getByTestId('scale-caveats-layer')
    expect(extra).not.toHaveAttribute('open')
    expect(extra.querySelector('summary')).toHaveTextContent('问卷的适用范围与限制')
    const toggle = extra.querySelector('summary')
    expect(toggle).not.toBeNull()
    fireEvent.click(toggle!)
    expect(extra).toHaveAttribute('open')
    fireEvent.click(toggle!)
    expect(extra).not.toHaveAttribute('open')
    expect(screen.getByTestId('scale-caveats')).toHaveTextContent('该语言版本尚无本地人群常模')
    expect(screen.getByTestId('scale-disclaimer')).toHaveTextContent('不是人群排名')
  })

})
