import { describe, expect, it } from 'vitest'
import { render, screen } from '@testing-library/react'
import ReportShell from '../ReportShell'
import SituationalReportCard from '../SituationalReportCard'

describe('ReportShell presentation boundary', () => {
  it('renders completion facts, status, limitations and actions without owning report science', () => {
    render(
      <ReportShell
        title="测评报告"
        description="冻结结果"
        facts={[{ label: '完成时间', value: '2026-09-13' }, { label: '用时', value: '3分20秒' }]}
        status={{ kind: 'success', title: '已提交', description: '结果来自已完成记录。' }}
        limitations={['仅解释本次作答。']}
        actions={<button type="button">返回记录</button>}
      >
        <section>领域报告正文</section>
      </ReportShell>,
    )

    expect(screen.getByRole('heading', { level: 1, name: '测评报告' })).toBeTruthy()
    expect(screen.getByTestId('report-completion-facts')).toHaveTextContent('3分20秒')
    expect(screen.getByText('已提交')).toBeTruthy()
    expect(screen.getByText('领域报告正文')).toBeTruthy()
    expect(screen.getByTestId('report-limitations')).toHaveTextContent('仅解释本次作答。')
    expect(screen.getByRole('button', { name: '返回记录' })).toBeTruthy()
  })
})

describe('SituationalReportCard frozen projection', () => {
  it('keeps zero distinct from missing and does not invent labels', () => {
    render(
      <SituationalReportCard report={{
        itemId: 'situational-1',
        type: 'SITUATIONAL',
        kind: 'situational',
        label: '情境判断',
        instrumentKey: 'sit-demo',
        instrumentVersion: '1.0.0',
        qualityState: 'interpretable',
        metrics: [
          { key: 'assertiveness.behavior', value: 0 },
          { key: 'cooperation.behavior', value: null },
        ],
      }} />,
    )

    expect(screen.getByTestId('situational-report-situational-1')).toBeTruthy()
    expect(screen.getByText('assertiveness.behavior')).toBeTruthy()
    expect(screen.getByText('cooperation.behavior')).toBeTruthy()
    expect(screen.getByText('0')).toBeTruthy()
    expect(screen.getByText('—')).toBeTruthy()
    expect(screen.getByTestId('situational-frozen-projection-limitation')).toBeTruthy()
  })

  it('fails closed when the frozen unit cannot be decrypted', () => {
    render(
      <SituationalReportCard report={{
        itemId: 'situational-2',
        type: 'SITUATIONAL',
        kind: 'situational',
        label: null,
        metrics: [],
        decryptError: true,
      }} />,
    )

    expect(screen.getByText('该情境测评结果无法解密，指标未展示。')).toBeTruthy()
  })
})
