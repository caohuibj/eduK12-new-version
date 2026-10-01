import { afterEach, describe, expect, it } from 'vitest'
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import CognitiveV2ReportCard from '../CognitiveV2ReportCard'
import type { CognitiveV2Report } from '../types'

afterEach(cleanup)
const metric = { key: 'medianRtMs', label: '中位数', participantLabel: '典型反应用时', value: 310, formatted: '310 ms', category: 'processing_speed', direction: 'lower_is_better' as const, explanation: '有效反应用时的中间位置。' }
const report: CognitiveV2Report = {
  schemaVersion: 2, title: '简单反应时', profileLabel: '标准协议', qualityState: 'interpretable', conclusion: '20 次中有 18 次有效。',
  headline: [metric], user: [], detail: [{ ...metric, key: 'meanRtMs', label: '平均用时', participantLabel: '平均用时', formatted: '312 ms' }], quality: [],
  method: { testType: 'reaction', engineVersion: '1.0.0', scoringVersion: '1.1.0', configVersion: '1.1.0', protocolSignature: 'test', profile: 'standard' },
  disclaimer: '仅描述本次表现。', practicalTips: [],
  reading: { schemaVersion: 2, reportVersion: '1.0.0', presentationVersion: '1.1.0', title: '看见变化，你如何回应？', introduction: '观察这次反应过程。',
    interpretation: { state: 'available', reasons: [], withheldMetricKeys: [] }, feedback: { summary: '20 次中有 18 次有效。', evidenceMetricKeys: ['medianRtMs'], nextStep: '先等信号再回应。' },
    caveats: ['本次没有人口常模。'], visuals: [{ kind: 'reaction_trials', title: '每一次作答，都看得见', unit: 'ms', points: [{ label: '1', value: 310 }, { label: '2', value: null }], caption: '未响应单独标记，不填零。' }] },
}

describe('Cognitive layered report', () => {
  it('puts evidence and caveats on the first screen and toggles existing authorized detail', () => {
    render(<CognitiveV2ReportCard report={report} />)
    expect(screen.getByRole('heading', { name: report.reading!.title })).toBeInTheDocument()
    expect(screen.getByText('本次没有人口常模。')).toBeVisible()
    const detail = document.getElementById(screen.getByRole('button', { name: '详细解读' }).getAttribute('aria-controls')!)!
    expect(detail).not.toBeVisible()
    fireEvent.click(screen.getByRole('button', { name: '详细解读' }))
    expect(detail).toBeVisible()
    expect(screen.getByRole('table')).toHaveTextContent('312 ms')
    fireEvent.click(screen.getByRole('button', { name: '学生 / 家长' }))
    expect(detail).not.toBeVisible()
  })
  it('explains missing graph points without presenting a zero response', () => {
    render(<CognitiveV2ReportCard report={report} />)
    expect(screen.getByRole('img')).toHaveAccessibleDescription(/未响应或无效记录/)
    fireEvent.click(screen.getByText('查看图表数据'))
    expect(screen.getByText('第 2 次：未响应或无效记录')).toBeInTheDocument()
    expect(screen.queryByText(/\b0 ms\b/)).not.toBeInTheDocument()
  })
  it('shows the server-withheld state and suppresses references for gated metrics', () => {
    render(<CognitiveV2ReportCard report={{ ...report, headline: [], user: [], detail: [], qualityState: 'limited', reading: { ...report.reading!, interpretation: { state: 'withheld', reasons: ['有效记录不足'], withheldMetricKeys: ['medianRtMs'] }, feedback: { summary: '先保留完成记录。', evidenceMetricKeys: [], nextStep: '先确认操作。' }, visuals: [] } }} references={[{ metricKey: 'medianRtMs', label: '应隐藏的参考', disclaimer: '不适用' }]} />)
    expect(screen.getByText('部分关键指标暂不解释')).toBeVisible()
    expect(screen.queryByText('310 ms')).not.toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: '详细解读' }))
    expect(screen.queryByText(/应隐藏的参考/)).not.toBeInTheDocument()
  })
  it('keeps unversioned historical reports on the original rendering path', () => {
    const old = { ...report }; delete old.schemaVersion; delete old.reading
    render(<CognitiveV2ReportCard report={old} />)
    expect(screen.getByRole('heading', { name: '简单反应时' })).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: '详细解读' })).not.toBeInTheDocument()
  })
})
