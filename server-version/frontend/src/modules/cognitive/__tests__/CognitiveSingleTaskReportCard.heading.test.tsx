import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import CognitiveSingleTaskReportCard from '../CognitiveSingleTaskReportCard'
import type { CognitiveSingleTaskReport } from '../types'

const report = {
  testType: 'reaction',
  profile: 'standard',
  profileLabel: '正式版',
  title: '反应时任务',
  interpretable: true,
  qualityState: 'interpretable',
  qualityFlags: [],
  headline: null,
  productIndex: null,
  showProductIndex: false,
  primaryMetrics: [],
  secondaryMetrics: [],
  caveats: [],
  practicalTips: [],
  method: { testType: 'reaction', engineVersion: '1.0.0', scoringVersion: '1.0.0', configVersion: '1.0.0', profile: 'standard' },
  disclaimer: '只描述本次行为。',
  reference: null,
} as CognitiveSingleTaskReport

describe('CognitiveSingleTaskReportCard heading context', () => {
  it('keeps the standalone report title as the page heading when attempt context is present', () => {
    render(<CognitiveSingleTaskReportCard report={report} attemptNo={1} />)
    expect(screen.getByRole('heading', { level: 1, name: '反应时任务' })).toBeTruthy()
    expect(screen.getByRole('heading', { level: 2, name: '数据质量' })).toBeTruthy()
  })

  it('uses nested headings when the same scientific content is embedded in Composite', () => {
    render(<CognitiveSingleTaskReportCard report={report} />)
    expect(screen.getByRole('heading', { level: 3, name: '反应时任务' })).toBeTruthy()
    expect(screen.getByRole('heading', { level: 4, name: '数据质量' })).toBeTruthy()
    expect(screen.queryByRole('heading', { level: 1 })).toBeNull()
  })

  it('marks experience as a short protocol without hiding its authoritative score', () => {
    render(<CognitiveSingleTaskReportCard report={{
      ...report,
      profile: 'experience',
      profileLabel: '体验版',
      productIndex: { label: '任务表现指数', value: 72 },
      showProductIndex: true,
      method: { ...report.method, profile: 'experience' },
    }} />)
    expect(screen.getByText('体验版 · 短程协议')).toBeTruthy()
    expect(screen.getByText('72 / 100')).toBeTruthy()
    expect(screen.getByText(/不代表百分位、年龄等级、学校成绩或诊断结论/)).toBeTruthy()
  })

  it('does not render quantitative metric sections when the result is uninterpretable', () => {
    render(<CognitiveSingleTaskReportCard report={{
      ...report,
      interpretable: false,
      qualityState: 'insufficient',
      productIndex: null,
      showProductIndex: true,
      primaryMetrics: [{ key: 'medianRtMs', label: '中位反应时', unit: 'ms', value: 320, formatted: '320 ms' }],
      secondaryMetrics: [{ key: 'missRate', label: '遗漏率', unit: 'ratio', value: 0.1, formatted: '10%' }],
    }} />)
    expect(screen.getByText(/本次数据不足以稳定解释/)).toBeTruthy()
    expect(screen.queryByText('主要指标')).toBeNull()
    expect(screen.queryByText('320 ms')).toBeNull()
    expect(screen.queryByText('10%')).toBeNull()
  })
})
