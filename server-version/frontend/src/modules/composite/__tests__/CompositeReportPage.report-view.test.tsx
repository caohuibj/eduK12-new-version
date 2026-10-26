import { act, cleanup, fireEvent, render, screen } from '@testing-library/react'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { CompositeReportStatus, ParticipantFeedbackStatus } from '../types'

const mocks = vi.hoisted(() => ({
  training: true,
  user: { role: 'STUDENT' } as { role: 'STUDENT' | 'TEACHER' | 'ADMIN' } | null,
  navigate: vi.fn(),
  api: {
    reportView: vi.fn(), reportStatus: vi.fn(), report: vi.fn(), retryReport: vi.fn(),
    teacherReportStatus: vi.fn(), teacherReport: vi.fn(), partialReport: vi.fn(), snapshots: vi.fn(),
  },
  publicApi: { reportView: vi.fn(), reportStatus: vi.fn(), report: vi.fn(), retryReport: vi.fn() },
  publicClient: vi.fn(),
}))
vi.mock('../../../training/context', () => ({ isTrainingHost: () => mocks.training }))
vi.mock('../../../training/learnerNavigation', () => ({ useTrainingLearnerNavigation: () => ({ enabled: false, navigate: mocks.navigate }) }))
vi.mock('../../../contexts/AuthContext', () => ({ useAuth: () => ({ user: mocks.user }) }))
vi.mock('../api', () => ({ compositeApi: mocks.api, publicCompositeApi: mocks.publicClient }))
import CompositeReportPage from '../CompositeReportPage'

const report = { id: 'attempt', assessmentId: 'q', name: '合并读取报告', completedAt: null, totalTime: null, anonymousCode: null, backgroundValues: [], unitReports: [] }
const generation = (state: CompositeReportStatus['reportStatus']['state'] = 'READY', feedback?: ParticipantFeedbackStatus['state']): CompositeReportStatus => ({
  attemptId: 'attempt', attemptEpoch: 1, status: state === 'READY' ? 'COMPLETED' : 'IN_PROGRESS',
  hasAcceptedSubmission: true, wholeSubmissionReceived: true, feedbackPollProfile: 'QUEUED', feedbackWaitMs: 4000,
  reportStatus: { state, jobId: 'job', retryAfterSeconds: 0.1, errorCode: null, completedAt: null },
  ...(feedback ? { participantFeedback: { state: feedback, releaseAt: '2026-10-24T12:00:00Z' } } : {}),
})
const view = (status = generation(), currentReport: typeof report | null = report) => ({ code: 0, message: 'ok', data: { generation: status, report: currentReport } })
const mount = (path = '/student/composite/attempts/attempt/report') => render(
  <MemoryRouter initialEntries={[path]}><Routes>
    <Route path="/student/composite/attempts/:attemptId/report" element={<CompositeReportPage />} />
    <Route path="/public/composite/attempts/:attemptId/report" element={<CompositeReportPage />} />
    <Route path="/composite-assessments/:id/attempts/:attemptId/report" element={<CompositeReportPage />} />
    <Route path="/relational/attempts/:attemptId/report" element={<CompositeReportPage />} />
  </Routes></MemoryRouter>,
)
const flush = () => act(async () => {})

beforeEach(() => {
  vi.resetAllMocks()
  mocks.training = true; mocks.user = { role: 'STUDENT' }; sessionStorage.clear()
  mocks.publicClient.mockReturnValue(mocks.publicApi)
  for (const client of [mocks.api, mocks.publicApi]) {
    client.reportView.mockResolvedValue(view())
    client.reportStatus.mockResolvedValue({ code: 0, data: generation() })
    client.report.mockResolvedValue({ code: 0, data: report })
    client.retryReport.mockResolvedValue({ code: 0, data: generation() })
  }
  mocks.api.teacherReportStatus.mockResolvedValue({ code: 0, data: generation() })
  mocks.api.teacherReport.mockResolvedValue({ code: 0, data: report })
  mocks.api.snapshots.mockResolvedValue({ code: 0, data: { list: [] } })
})
afterEach(() => { cleanup(); vi.useRealTimers(); vi.restoreAllMocks(); sessionStorage.clear() })

describe('Training participant combined report callback', () => {
  it.each(['student', 'public'])('renders READY with one %s view request and no legacy reads', async surface => {
    sessionStorage.setItem('composite:recovery:attempt:attempt', 'synthetic-recovery')
    const client = surface === 'public' ? mocks.publicApi : mocks.api
    mount(`/${surface}/composite/attempts/attempt/report`)
    expect(await screen.findByText('合并读取报告')).toBeInTheDocument()
    expect(client.reportView).toHaveBeenCalledExactlyOnceWith('attempt', 0, expect.any(AbortSignal))
    expect(client.reportStatus).not.toHaveBeenCalled(); expect(client.report).not.toHaveBeenCalled()
    expect(client.retryReport).not.toHaveBeenCalled()
    if (surface === 'public') expect(mocks.publicClient).toHaveBeenCalledWith('synthetic-recovery')
  })

  it('does not make an anonymous view request without recovery proof', async () => {
    mount('/public/composite/attempts/attempt/report')
    expect(await screen.findByText('请输入恢复凭证查看匿名报告')).toBeInTheDocument()
    expect(mocks.publicApi.reportView).not.toHaveBeenCalled()
  })

  it.each([
    ['WAITING', '作答尚未全部完成'], ['CANCELLED', '报告任务已停止'],
  ] as const)('preserves %s/null and never starts polling or generation', async (state, label) => {
    vi.useFakeTimers()
    mocks.api.reportView.mockResolvedValue(view(generation(state), null))
    mount(); await flush()
    expect(screen.getByText(label)).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: '重新生成报告' })).toBeNull()
    if (state === 'WAITING') {
      fireEvent.click(screen.getByRole('button', { name: '继续作答' }))
      expect(mocks.navigate).toHaveBeenCalledWith('/student/composite/attempts/attempt')
    }
    await act(async () => { await vi.advanceTimersByTimeAsync(120_000) })
    expect(mocks.api.reportView).toHaveBeenCalledTimes(1)
    expect(mocks.api.retryReport).not.toHaveBeenCalled()
  })

  it.each(['GENERATED_NOT_RELEASED', 'WAITING_SUBMISSION', 'UNAVAILABLE'] as const)('fails closed for %s even if a view includes report data', async feedback => {
    vi.useFakeTimers()
    mocks.api.reportView.mockResolvedValue(view(generation('READY', feedback)))
    mount('/student/composite/attempts/attempt/report?partial=1&snapshotId=untrusted'); await flush()
    expect(screen.queryByText('合并读取报告')).toBeNull()
    expect(screen.getByRole('button', { name: '刷新开放状态' })).toBeInTheDocument()
    await act(async () => { await vi.advanceTimersByTimeAsync(120_000) })
    expect(mocks.api.reportView).toHaveBeenCalledTimes(1)
    expect(mocks.api.report).not.toHaveBeenCalled(); expect(mocks.api.partialReport).not.toHaveBeenCalled()
    expect(mocks.api.retryReport).not.toHaveBeenCalled()
    mocks.api.reportView.mockResolvedValue(view(generation('READY', 'AVAILABLE')))
    await act(async () => { fireEvent.click(screen.getByRole('button', { name: '刷新开放状态' })) })
    expect(screen.getByText('合并读取报告')).toBeInTheDocument()
    expect(mocks.api.reportView).toHaveBeenCalledTimes(2)
  })

  it('passes bounded waits while pending and displays READY without a second report GET', async () => {
    vi.useFakeTimers()
    mocks.api.reportView.mockResolvedValueOnce(view(generation('PROCESSING', 'REPORT_PROCESSING'), null)).mockResolvedValue(view())
    mount(); await flush()
    expect(screen.getByText('作答记录已保存，报告生成中')).toBeInTheDocument()
    await act(async () => { await vi.advanceTimersByTimeAsync(250) })
    expect(mocks.api.reportView).toHaveBeenCalledTimes(2)
    expect(mocks.api.reportView).toHaveBeenLastCalledWith('attempt', 4000, expect.any(AbortSignal))
    expect(screen.getByText('合并读取报告')).toBeInTheDocument()
    expect(mocks.api.reportStatus).not.toHaveBeenCalled(); expect(mocks.api.report).not.toHaveBeenCalled()
  })

  it('keeps hidden-page polling idle and resumes only after visibility returns', async () => {
    vi.useFakeTimers()
    const visibility = vi.spyOn(document, 'visibilityState', 'get').mockReturnValue('hidden')
    mocks.api.reportView.mockResolvedValue(view(generation('PENDING'), null))
    mount(); await flush()
    await act(async () => { await vi.advanceTimersByTimeAsync(5000) })
    expect(mocks.api.reportView).toHaveBeenCalledTimes(1)
    visibility.mockReturnValue('visible')
    await act(async () => { document.dispatchEvent(new Event('visibilitychange')) })
    expect(mocks.api.reportView).toHaveBeenCalledTimes(2)
  })

  it('aborts the previous read on refresh and ignores its late response', async () => {
    vi.useFakeTimers()
    let resolveLate!: (result: ReturnType<typeof view>) => void
    mocks.api.reportView.mockResolvedValueOnce(view(generation('PENDING'), null))
      .mockImplementationOnce(() => new Promise(resolve => { resolveLate = resolve }))
      .mockResolvedValue(view())
    const page = mount(); await flush()
    const firstSignal = mocks.api.reportView.mock.calls[0][2] as AbortSignal
    await act(async () => { await vi.advanceTimersByTimeAsync(250) })
    expect(firstSignal.aborted).toBe(true)
    const waitingSignal = mocks.api.reportView.mock.calls[1][2] as AbortSignal
    await act(async () => { fireEvent.click(screen.getByRole('button', { name: '重新加载报告' })) })
    expect(waitingSignal.aborted).toBe(true)
    await act(async () => { resolveLate(view(generation(), { ...report, name: '过期结果' })) })
    expect(screen.getByText('合并读取报告')).toBeInTheDocument()
    expect(screen.queryByText('过期结果')).toBeNull()
    const finalSignal = mocks.api.reportView.mock.calls[2][2] as AbortSignal
    page.unmount()
    expect(finalSignal.aborted).toBe(true)
    expect(mocks.api.reportView).toHaveBeenCalledTimes(3)
  })

  it('treats READY plus null report as a bounded recoverable read, never an empty success', async () => {
    vi.useFakeTimers()
    mocks.api.reportView.mockResolvedValue(view(generation('READY', 'AVAILABLE'), null))
    mount(); await flush()
    await act(async () => { await vi.advanceTimersByTimeAsync(4000) })
    expect(mocks.api.reportView).toHaveBeenCalledTimes(3)
    expect(screen.getByText('报告暂时无法读取，请稍后重试')).toBeInTheDocument()
    expect(screen.getByText('报告读取失败不会改变已经完成的提交状态。')).toBeInTheDocument()
    expect(mocks.api.report).not.toHaveBeenCalled(); expect(mocks.api.retryReport).not.toHaveBeenCalled()
  })

  it('retains accepted pending state and reassurance after a transient poll failure', async () => {
    vi.useFakeTimers()
    vi.spyOn(Math, 'random').mockReturnValue(0)
    mocks.api.reportView.mockResolvedValueOnce(view(generation('PENDING'), null)).mockRejectedValue({ status: 503, message: 'Temporary' })
    mount(); await flush()
    await act(async () => { await vi.advanceTimersByTimeAsync(2351) })
    expect(screen.getByText('作答记录已保存，报告生成中')).toBeInTheDocument()
    expect(screen.getByText(/已保存的答案不受影响/)).toBeInTheDocument()
    expect(mocks.api.retryReport).not.toHaveBeenCalled()
  })

  it('keeps the explicit generation retry separate from read retries', async () => {
    mocks.api.reportView.mockResolvedValueOnce(view(generation('FAILED'), null)).mockResolvedValue(view())
    mount(); await screen.findByText('报告生成暂时失败')
    fireEvent.click(screen.getByRole('button', { name: '重新生成报告' }))
    expect(await screen.findByText('合并读取报告')).toBeInTheDocument()
    expect(mocks.api.retryReport).toHaveBeenCalledExactlyOnceWith('attempt')
    expect(mocks.api.reportView).toHaveBeenCalledTimes(2)
  })

  it('does not offer generation retry for a permanent submission-key conflict', async () => {
    const status = generation('FAILED'); status.reportStatus.errorCode = 'REPORT_SUBMISSION_KEY_CONFLICT'
    mocks.api.reportView.mockResolvedValue(view(status, null))
    mount(); await screen.findByText('作答已保存，报告需要处理')
    expect(screen.queryByRole('button', { name: '重新生成报告' })).toBeNull()
    expect(mocks.api.retryReport).not.toHaveBeenCalled()
  })

  it.each(['teacher', 'partial', 'snapshot', 'relational', 'non-training'])('leaves %s on its legacy path', async mode => {
    let path = '/student/composite/attempts/attempt/report'
    if (['teacher', 'partial', 'snapshot'].includes(mode)) {
      mocks.user = { role: 'TEACHER' }
      path = '/composite-assessments/q/attempts/attempt/report' + (mode === 'partial' ? '?partial=1' : mode === 'snapshot' ? '?snapshotId=frozen' : '')
    } else if (mode === 'relational') path = '/relational/attempts/attempt/report'
    else mocks.training = false
    mount(path); await screen.findByText('合并读取报告')
    expect(mocks.api.reportView).not.toHaveBeenCalled(); expect(mocks.publicApi.reportView).not.toHaveBeenCalled()
    if (mode === 'teacher') expect(mocks.api.teacherReportStatus).toHaveBeenCalledExactlyOnceWith('q', 'attempt')
    if (mode === 'partial' || mode === 'snapshot') expect(mocks.api.teacherReportStatus).not.toHaveBeenCalled()
    if (mode === 'partial') expect(mocks.api.teacherReport).toHaveBeenCalledWith('q', 'attempt', undefined, true)
    if (mode === 'snapshot') expect(mocks.api.teacherReport).toHaveBeenCalledWith('q', 'attempt', 'frozen')
    if (mode === 'relational' || mode === 'non-training') expect(mocks.api.report).toHaveBeenCalledExactlyOnceWith('attempt')
  })
})
