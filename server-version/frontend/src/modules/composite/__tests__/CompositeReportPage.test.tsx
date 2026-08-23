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
})
