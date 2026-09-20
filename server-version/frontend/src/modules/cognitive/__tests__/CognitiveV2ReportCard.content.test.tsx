import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import CognitiveV2ReportCard from '../CognitiveV2ReportCard'
import type { CognitiveV2Report } from '../types'

const baseReport: CognitiveV2Report = {
  title: '任务转换 Task Switching',
  qualityState: 'interpretable',
  conclusion: '以下结果描述本次任务中的表现，不等同于诊断或正式人口常模。',
  headline: [{
    key: 'switchCostRtMs',
    label: 'RT 转换代价',
    category: 'cognitive_flexibility',
    direction: 'lower_is_better',
    unit: 'ms',
    value: 85,
    formatted: '85 ms',
  }],
  user: [],
  detail: [],
  quality: [],
  method: {
    testType: 'taskswitch',
    engineVersion: '1.0.0',
    scoringVersion: '1.0.0',
    configVersion: '1.0.0',
    protocolSignature: 'protocol-test',
    profile: 'research',
  },
  disclaimer: '结果反映本次认知灵活性任务表现，不是临床诊断或常模。',
  practicalTips: [],
}

describe('CognitiveV2ReportCard complete report content', () => {
  it('renders profile caveats and research-only metrics', () => {
    const report = {
      ...baseReport,
      caveats: ['科研档含纯任务区块以估计 mixing cost；仍不是常模。'],
      research: [{
        key: 'mixingCost',
        label: '混合区块相对单任务代价',
        category: 'cognitive_flexibility',
        direction: 'lower_is_better',
        unit: 'ms',
        value: 48,
        formatted: '48 ms',
      }],
    } as CognitiveV2Report

    render(<CognitiveV2ReportCard report={report} />)

    expect(screen.getByRole('heading', { name: '本档说明' })).toBeTruthy()
    expect(screen.getByText(/科研档含纯任务区块/)).toBeTruthy()
    expect(screen.getByRole('heading', { name: '科研指标（仅科研档）' })).toBeTruthy()
    expect(screen.getByText('48 ms')).toBeTruthy()
    expect(screen.getByText(/混合代价：科研档中混合规则区块/)).toBeTruthy()
  })

  it('never exposes an internal taxonomy string as the metric explanation fallback', () => {
    const report = {
      ...baseReport,
      method: { ...baseReport.method, testType: 'patterncompare', profile: 'experience' as const },
      headline: [{
        key: 'correctPerMinute',
        label: '每分钟正确数',
        category: 'processing_speed',
        direction: 'higher_is_better' as const,
        unit: 'score',
        value: 42,
        formatted: '42',
      }],
    } as CognitiveV2Report

    render(<CognitiveV2ReportCard report={report} />)

    expect(screen.getByText(/每分钟正确数用于描述本次任务表现/)).toBeTruthy()
    expect(screen.queryByText('processing_speed')).toBeNull()
  })
})
