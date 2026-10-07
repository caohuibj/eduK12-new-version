import { render, screen } from '@testing-library/react'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import SituationalResult from '../pages/SituationalResult'

const { resultMock } = vi.hoisted(() => ({ resultMock: vi.fn() }))

vi.mock('../api', () => ({ situationalApi: { result: resultMock } }))

describe('SituationalResult report convergence', () => {
  beforeEach(() => vi.clearAllMocks())
  it('keeps deferred feedback on a completion notice rather than starting a new instrument', async () => {
    resultMock.mockResolvedValue({ code: 0, data: { feedbackDeferred: true, attempt: { id: 'attempt-1', status: 'COMPLETED', instrumentKey: 'fixture' } } })
    render(<MemoryRouter initialEntries={['/student/situational/attempts/attempt-1/result']}>
      <Routes>
        <Route path="/student/situational/attempts/:attemptId/result" element={<SituationalResult />} />
        <Route path="/student/situational/fixture" element={<div>NEW_INSTRUMENT</div>} />
      </Routes>
    </MemoryRouter>)
    expect(await screen.findByText('单项已提交，反馈暂未开放')).toBeInTheDocument()
    expect(screen.queryByText('NEW_INSTRUMENT')).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'JSON' })).not.toBeInTheDocument()
  })

  it('uses the shared report shell while preserving frozen labels, interpretations and zero values', async () => {
    resultMock.mockResolvedValue({
      code: 0,
      data: {
        attemptId: 'attempt-1',
        attempt: {
          id: 'attempt-1', instrumentKey: 'social-situations', instrumentVersion: '2.0.0', attemptNo: 1,
          status: 'COMPLETED', deliveryMode: 'FINAL_ONLY', runtimeGeneration: 'UNIFIED_V1', attemptEpoch: 1,
          progress: 100, definitionHash: 'definition', compiledRuntimeHash: 'runtime', scorerKey: 'scorer', scoringVersion: '3.0.0',
          submissionId: 'submission', submissionPayloadHash: 'payload', submittedAt: '2026-01-01T00:00:00Z',
          startedAt: '2026-01-01T00:00:00Z', completedAt: '2026-01-01T00:02:00Z', totalTime: 120000,
          createdAt: '2026-01-01T00:00:00Z', updatedAt: '2026-01-01T00:02:00Z',
        },
        instrument: {
          report: {
            metricOrder: ['assertiveness'],
            interpretations: [{ metricKey: 'assertiveness', headline: '冻结解释标题', summary: '冻结解释正文', bands: [], guidance: [] }],
            limitations: ['冻结限制'],
            disclaimer: '冻结免责声明',
          },
        },
        result: {
          metrics: [{
            key: 'assertiveness', label: '坚定表达', construct: 'assertiveness', channelKey: 'behavior', direction: 'higher',
            role: 'primary', displayPrecision: 1, value: 0, range: { min: 0, max: 4 }, expectedResponses: [], answeredResponses: [], status: 'calculated',
          }],
          quality: { status: 'interpretable', flags: [] },
        },
      },
    })

    render(
      <MemoryRouter initialEntries={['/student/situational/attempts/attempt-1/result']}>
        <Routes><Route path="/student/situational/attempts/:attemptId/result" element={<SituationalResult />} /></Routes>
      </MemoryRouter>,
    )

    expect(await screen.findByRole('heading', { level: 1, name: '情境化测评报告' })).toBeTruthy()
    expect(screen.getByText('已提交')).toBeTruthy()
    expect(screen.getByText('坚定表达')).toBeTruthy()
    expect(screen.getByText('0.0')).toBeTruthy()
    expect(screen.getByText('冻结解释标题')).toBeTruthy()
    expect(screen.getByText('冻结解释正文')).toBeTruthy()
    expect(screen.getByText('冻结免责声明')).toBeTruthy()
    expect(screen.getByText('冻结限制')).toBeTruthy()
  })

  it('presents a read failure without implying submission failure', async () => {
    resultMock.mockRejectedValue(new Error('network unavailable'))

    render(
      <MemoryRouter initialEntries={['/student/situational/attempts/attempt-2/result']}>
        <Routes><Route path="/student/situational/attempts/:attemptId/result" element={<SituationalResult />} /></Routes>
      </MemoryRouter>,
    )

    expect(await screen.findByText('报告暂时无法打开')).toBeTruthy()
    expect(screen.queryByText(/提交失败/)).toBeNull()
  })
})
