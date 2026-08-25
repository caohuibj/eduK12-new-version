import { describe, it, expect, vi, beforeEach } from 'vitest'
import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import CompositeReportPage from '../CompositeReportPage'

const { mockCompositeApi, authState } = vi.hoisted(() => ({
  mockCompositeApi: {
    report: vi.fn(),
    teacherReport: vi.fn(),
    snapshots: vi.fn(),
    reanalyze: vi.fn(),
  },
  authState: { user: null as null | { role: 'STUDENT' | 'TEACHER' | 'ADMIN' } },
}))
vi.mock('../api', () => ({
  compositeApi: mockCompositeApi,
  publicCompositeApi: () => mockCompositeApi,
}))
vi.mock('../../../contexts/AuthContext', () => ({
  useAuth: () => ({ user: authState.user }),
}))

beforeEach(() => {
  vi.clearAllMocks()
  authState.user = null
  mockCompositeApi.snapshots.mockResolvedValue({ code: 0, data: { list: [], total: 0 } })
  mockCompositeApi.reanalyze.mockResolvedValue({ code: 0, data: { id: 'snapshot-new' } })
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
    expect(mockCompositeApi.snapshots).not.toHaveBeenCalled()
    publicView.unmount()
    window.sessionStorage.removeItem('composite:recovery:attempt:attempt-mixed')
  })

  it('loads teacher Snapshot history and keeps an explicit URL selection', async () => {
    authState.user = { role: 'TEACHER' }
    const response = {
      code: 0,
      data: {
        id: 'attempt-teacher',
        assessmentId: 'c1',
        name: '教师报告',
        anonymousCode: null,
        completedAt: '2026-01-01T00:00:00Z',
        totalTime: 0,
        backgroundValues: [],
        packageReport: {
          audience: 'teacher',
          packageName: '报告包',
          packageKey: 'package-1',
          packageVersion: '1.0.0',
          profile: 'standard',
          qualitySummary: { interpretableModules: 0, excludedModules: [], warnings: [] },
          cognitiveDomains: [],
          recommendations: [],
          limitations: [],
          snapshotId: 'snapshot-2',
          snapshotCreatedAt: '2026-01-02T00:00:00Z',
          generationReason: 'REANALYSIS',
          sourceSummary: [],
          qualityFlags: [],
          observationPrompts: [],
        },
        unitReports: [],
      },
    }
    mockCompositeApi.teacherReport.mockResolvedValue(response)
    mockCompositeApi.snapshots.mockResolvedValue({
      code: 0,
      data: {
        list: [{
          id: 'snapshot-2', attemptId: 'attempt-teacher', packageKey: 'p', packageVersion: '1.0.0', profile: 'standard',
          analysisDefinitionVersion: '1.0.0', analysisProtocolKey: 'p', analysisProtocolVersion: '1.0.0',
          analysisVersion: 'a', reportSchemaVersion: 'r', generationReason: 'REANALYSIS', createdAt: '2026-01-02T00:00:00Z',
        }],
        total: 1,
      },
    })

    const selectedView = render(
      <MemoryRouter initialEntries={['/composite-assessments/c1/attempts/attempt-teacher/report?snapshotId=snapshot-2']}>
        <Routes><Route path="/composite-assessments/:id/attempts/:attemptId/report" element={<CompositeReportPage />} /></Routes>
      </MemoryRouter>,
    )

    expect(await screen.findByTestId('composite-snapshot-controls')).toBeTruthy()
    expect(mockCompositeApi.snapshots).toHaveBeenCalledWith('attempt-teacher')
    expect(mockCompositeApi.teacherReport).toHaveBeenCalledWith('c1', 'attempt-teacher', 'snapshot-2')
    expect(screen.getByLabelText('报告版本')).toHaveValue('snapshot-2')
    selectedView.unmount()

    vi.clearAllMocks()
    mockCompositeApi.teacherReport.mockRejectedValue(new Error('Snapshot 不存在'))
    mockCompositeApi.snapshots.mockResolvedValue({
      code: 0,
      data: { list: [{ ...response.data.packageReport, id: 'snapshot-valid', attemptId: 'attempt-teacher', generationReason: 'COMPLETION', createdAt: '2026-01-01T00:00:00Z' }], total: 1 },
    })
    render(
      <MemoryRouter initialEntries={['/composite-assessments/c1/attempts/attempt-teacher/report?snapshotId=snapshot-missing']}>
        <Routes><Route path="/composite-assessments/:id/attempts/:attemptId/report" element={<CompositeReportPage />} /></Routes>
      </MemoryRouter>,
    )
    expect(await screen.findByText('Snapshot 不存在')).toBeTruthy()
    expect(await screen.findByTestId('composite-snapshot-controls')).toBeTruthy()
    expect(mockCompositeApi.teacherReport.mock.calls).toEqual([['c1', 'attempt-teacher', 'snapshot-missing']])
  })

  it('shows the admin reanalysis control and loads the returned Snapshot', async () => {
    authState.user = { role: 'ADMIN' }
    const response = { code: 0, data: { id: 'attempt-admin', assessmentId: 'c1', name: '管理员报告', anonymousCode: null, completedAt: null, totalTime: null, backgroundValues: [], packageReport: { audience: 'researcher', packageName: '报告包', packageKey: 'package-1', packageVersion: '1.0.0', profile: 'standard', qualitySummary: { interpretableModules: 0, excludedModules: [], warnings: [] }, cognitiveDomains: [], recommendations: [], limitations: [], snapshotId: 'snapshot-1', snapshotCreatedAt: '2026-01-01T00:00:00Z', generationReason: 'COMPLETION', analysisDefinitionVersion: '1.0.0', analysisProtocolKey: 'package-1', analysisProtocolVersion: '1.0.0', analysisVersion: 'analysis-1', reportSchemaVersion: 'schema-1', inputFingerprint: 'f'.repeat(64), evidence: [], crossSourceFindings: [], provenance: {} }, unitReports: [] } }
    mockCompositeApi.teacherReport.mockResolvedValue(response)
    render(
      <MemoryRouter initialEntries={['/composite-assessments/c1/attempts/attempt-admin/report']}>
        <Routes><Route path="/composite-assessments/:id/attempts/:attemptId/report" element={<CompositeReportPage />} /></Routes>
      </MemoryRouter>,
    )

    const button = await screen.findByRole('button', { name: '重新分析' })
    fireEvent.click(button)
    await waitFor(() => expect(mockCompositeApi.reanalyze).toHaveBeenCalledWith('attempt-admin'))
    await waitFor(() => expect(mockCompositeApi.snapshots).toHaveBeenCalledTimes(2))
    await waitFor(() => expect(mockCompositeApi.teacherReport).toHaveBeenCalledWith('c1', 'attempt-admin', 'snapshot-new'))
  })

  it('does not show package controls for a collection-only teacher report', async () => {
    authState.user = { role: 'ADMIN' }
    mockCompositeApi.teacherReport.mockResolvedValue({
      code: 0,
      data: {
        id: 'attempt-collection',
        assessmentId: 'c1',
        name: '独立模块集合',
        anonymousCode: null,
        completedAt: '2026-01-01T00:00:00Z',
        totalTime: 1,
        backgroundValues: [],
        unitReports: [],
      },
    })

    render(
      <MemoryRouter initialEntries={['/composite-assessments/c1/attempts/attempt-collection/report']}>
        <Routes><Route path="/composite-assessments/:id/attempts/:attemptId/report" element={<CompositeReportPage />} /></Routes>
      </MemoryRouter>,
    )

    expect(await screen.findByText('独立模块集合')).toBeTruthy()
    expect(screen.queryByTestId('composite-package-report')).toBeNull()
    expect(screen.queryByTestId('composite-snapshot-controls')).toBeNull()
    expect(screen.queryByRole('button', { name: '重新分析' })).toBeNull()
    expect(mockCompositeApi.snapshots).not.toHaveBeenCalled()
  })
})
