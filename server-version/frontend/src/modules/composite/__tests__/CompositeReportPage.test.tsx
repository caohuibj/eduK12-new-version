import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen } from '@testing-library/react'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import CompositeReportPage from '../CompositeReportPage'

const { mockCompositeApi } = vi.hoisted(() => ({
  mockCompositeApi: {
    report: vi.fn(),
    teacherReport: vi.fn(),
  },
}))
vi.mock('../api', () => ({
  compositeApi: mockCompositeApi,
  publicCompositeApi: () => mockCompositeApi,
}))

beforeEach(() => {
  vi.clearAllMocks()
})

describe('CompositeReportPage cognitive module', () => {
  it('does not show 分 or raw JSON when a frozen single-task report is present', async () => {
    mockCompositeApi.report.mockResolvedValue({
      code: 0,
      data: {
        id: 'attempt-1',
        assessmentId: 'c1',
        name: '综合测评',
        anonymousCode: null,
        completedAt: '2026-01-01T00:00:00Z',
        totalTime: 1,
        modules: [{
          itemId: 'item-cog',
          type: 'COGNITIVE',
          label: '反应时',
          score: 30,
          metrics: { medianRtMs: null },
          qualityFlags: { interpretable: false },
          singleTaskReport: {
            testType: 'reaction',
            profile: 'experience',
            profileLabel: '体验版',
            title: '简单反应时',
            interpretable: false,
            qualityState: 'insufficient',
            qualityFlags: [{ key: 'insufficientValidTrials', label: '有效试次不足', active: true }],
            headline: null,
            productIndex: null,
            primaryMetrics: [{ key: 'medianRtMs', label: '中位反应时', value: null, formatted: '—' }],
            secondaryMetrics: [],
            caveats: ['体验版，结果仅供体验。'],
            practicalTips: ['冻结建议'],
            method: {
              testType: 'reaction',
              engineVersion: '1.0.0',
              scoringVersion: '1.1.0',
              configVersion: '1.1.0',
              profile: 'experience',
            },
            disclaimer: '不是医学诊断或人口常模。',
            reference: null,
          },
        }],
      },
    })

    render(
      <MemoryRouter initialEntries={['/student/composite/attempts/attempt-1/report']}>
        <Routes>
          <Route path="/student/composite/attempts/:attemptId/report" element={<CompositeReportPage />} />
        </Routes>
      </MemoryRouter>
    )

    expect(await screen.findByText('中位反应时')).toBeTruthy()
    expect(screen.getByText('体验版，结果仅供体验。')).toBeTruthy()
    expect(screen.getByText('暂不显示')).toBeTruthy()
    expect(screen.getByText('任务表现指数')).toBeTruthy()
    expect(screen.queryByText('分')).toBeNull()
    expect(screen.queryByText(/"metrics"/)).toBeNull()
  })

  it('renders two Scale and two Cognitive unit cards in container order', async () => {
    const mixedReportResponse = {
      code: 0,
      data: {
        id: 'attempt-mixed',
        assessmentId: 'c1',
        name: '混合容器',
        anonymousCode: null,
        completedAt: '2026-01-01T00:00:00Z',
        totalTime: 0,
        backgroundValues: [{ itemId: 'item-form', type: 'FORM', kind: 'background', label: '年级', value: '三年级' }],
        unitReports: [
          {
            itemId: 'item-scale-a',
            type: 'SCALE',
            kind: 'scale',
            scaleId: 'scale-a',
            scaleCode: 'S-A',
            scaleName: '量表 A',
            dimensionScores: [{ dimensionId: 'd-a', dimensionCode: 'A', dimensionName: '维度 A', rawScore: 0, normalizedScore: 0, level: 'low', itemCount: 1, minScore: 0, maxScore: 10 }],
            feedback: { overall: '', dimensions: [{ dimensionId: 'd-a', dimensionCode: 'A', dimensionName: '维度 A', score: 0, minScore: 0, maxScore: 10, level: 'low', interpretation: '', suggestions: [] }] },
            caveats: ['量表测试注意事项'],
            disclaimer: '量表测试免责声明',
            completedAt: null,
            totalTime: 0,
            method: { scaleId: 'scale-a', scaleCode: 'S-A', reportDefinitionVersion: 'scale-unit-report-v1' },
          },
          {
            itemId: 'item-scale-b',
            type: 'SCALE',
            kind: 'scale',
            scaleId: 'scale-b',
            scaleCode: 'S-B',
            scaleName: '量表 B',
            dimensionScores: [{ dimensionId: 'd-b', dimensionCode: 'B', dimensionName: '维度 B', rawScore: null, normalizedScore: null, level: null, itemCount: null, minScore: 0, maxScore: 10 }],
            feedback: { overall: '', dimensions: [{ dimensionId: 'd-b', dimensionCode: 'B', dimensionName: '维度 B', score: null, minScore: 0, maxScore: 10, level: null, interpretation: '', suggestions: [] }] },
            caveats: [],
            disclaimer: '量表测试免责声明',
            completedAt: null,
            totalTime: null,
            method: { scaleId: 'scale-b', scaleCode: 'S-B', reportDefinitionVersion: 'scale-unit-report-v1' },
          },
          { itemId: 'item-cog-a', type: 'COGNITIVE', kind: 'cognitive', label: '认知 A', singleTaskReport: null },
          { itemId: 'item-cog-b', type: 'COGNITIVE', kind: 'cognitive', label: '认知 B', singleTaskReport: null },
        ],
      },
    }
    mockCompositeApi.report.mockResolvedValue(mixedReportResponse)
    mockCompositeApi.teacherReport.mockResolvedValue(mixedReportResponse)

    const participantView = render(
      <MemoryRouter initialEntries={['/student/composite/attempts/attempt-mixed/report']}>
        <Routes>
          <Route path="/student/composite/attempts/:attemptId/report" element={<CompositeReportPage />} />
        </Routes>
      </MemoryRouter>
    )

    expect(await screen.findByTestId('scale-unit-report-item-scale-a')).toBeTruthy()
    expect(screen.getByTestId('scale-unit-report-item-scale-b')).toBeTruthy()
    expect(screen.getByText('认知 A')).toBeTruthy()
    expect(screen.getByText('认知 B')).toBeTruthy()
    expect(screen.getAllByTestId(/composite-unit-report-/)).toHaveLength(4)
    expect(screen.getByText('背景信息')).toBeTruthy()
    expect(screen.getByText('三年级')).toBeTruthy()
    expect(screen.getByText('量表测试注意事项')).toBeTruthy()
    expect(screen.queryByText(/averageScore|overallScore|整体评估|聚合测评报告/)).toBeNull()

    participantView.unmount()
    const teacherView = render(
      <MemoryRouter initialEntries={['/composite-assessments/c1/attempts/attempt-mixed/report']}>
        <Routes>
          <Route path="/composite-assessments/:id/attempts/:attemptId/report" element={<CompositeReportPage />} />
        </Routes>
      </MemoryRouter>
    )
    expect(await screen.findByTestId('scale-unit-report-item-scale-a')).toBeTruthy()
    expect(screen.getByTestId('scale-unit-report-item-scale-b')).toBeTruthy()
    expect(screen.getByText('认知 A')).toBeTruthy()
    expect(screen.getByText('认知 B')).toBeTruthy()
    expect(screen.getAllByTestId(/composite-unit-report-/)).toHaveLength(4)
    expect(screen.getByText('背景信息')).toBeTruthy()
    teacherView.unmount()

    window.sessionStorage.setItem('composite:recovery:attempt:attempt-mixed', 'recovery-token-for-test')
    const publicView = render(
      <MemoryRouter initialEntries={['/public/composite/attempts/attempt-mixed/report']}>
        <Routes>
          <Route path="/public/composite/attempts/:attemptId/report" element={<CompositeReportPage />} />
        </Routes>
      </MemoryRouter>
    )
    expect(await screen.findByTestId('scale-unit-report-item-scale-a')).toBeTruthy()
    expect(screen.getByText('认知 A')).toBeTruthy()
    expect(screen.getAllByTestId(/composite-unit-report-/)).toHaveLength(4)
    expect(screen.getByText('背景信息')).toBeTruthy()
    expect(screen.queryByText(/averageScore|overallScore|整体评估|聚合测评报告/)).toBeNull()
    publicView.unmount()
    window.sessionStorage.removeItem('composite:recovery:attempt:attempt-mixed')
  })
})
