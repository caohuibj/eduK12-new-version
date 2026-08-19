import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen } from '@testing-library/react'
import { MemoryRouter, Routes, Route } from 'react-router-dom'
import CognitiveResult from '../pages/CognitiveResult'

const { mockCognitiveApi } = vi.hoisted(() => ({
  mockCognitiveApi: {
    getSession: vi.fn(),
    getMyAssignments: vi.fn(),
    getAssignment: vi.fn(),
    createSession: vi.fn(),
    restartSession: vi.fn(),
    appendTrial: vi.fn(),
    completeSession: vi.fn(),
  },
}))
vi.mock('../api', () => ({ cognitiveApi: mockCognitiveApi }))

const renderAt = (sessionId = 's1') =>
  render(
    <MemoryRouter initialEntries={[`/student/cognitive/sessions/${sessionId}/result`]}>
      <Routes>
        <Route path="/student/cognitive/sessions/:sessionId/result" element={<CognitiveResult />} />
        <Route path="/student/cognitive" element={<div>HOME_PAGE</div>} />
      </Routes>
    </MemoryRouter>
  )

beforeEach(() => {
  vi.clearAllMocks()
})

describe('CognitiveResult page', () => {
  it('renders server score/metrics for COMPLETED session via GET only (no re-scoring)', async () => {
    mockCognitiveApi.getSession.mockResolvedValue({
      code: 0,
      message: 'ok',
      data: {
        sessionId: 's1',
        testType: 'fake',
        engineVersion: '1.0.0',
        attemptNo: 1,
        status: 'COMPLETED',
        finishedAt: '2026-01-01T00:00:00Z',
        config: {},
        randomSeed: 'seed',
        result: { score: 66.67, metrics: { correctCount: 2, meanRtMs: 500 }, qualityFlags: {} },
      },
    })
    renderAt()
    expect(await screen.findByText('测评完成')).toBeTruthy()
    expect(screen.getByText('66.67')).toBeTruthy()
    expect(screen.getByText('correctCount')).toBeTruthy()

    // 只 GET 一次；绝不调用 complete / append（不重新评分）
    expect(mockCognitiveApi.getSession).toHaveBeenCalledTimes(1)
    expect(mockCognitiveApi.completeSession).not.toHaveBeenCalled()
    expect(mockCognitiveApi.appendTrial).not.toHaveBeenCalled()
  })

  it('shows not-completed hint for IN_PROGRESS session', async () => {
    mockCognitiveApi.getSession.mockResolvedValue({
      code: 0,
      message: 'ok',
      data: {
        sessionId: 's1',
        testType: 'fake',
        engineVersion: '1.0.0',
        attemptNo: 1,
        status: 'IN_PROGRESS',
        config: {},
        randomSeed: 'seed',
        result: null,
      },
    })
    renderAt()
    expect(await screen.findByText('该测评尚未完成')).toBeTruthy()
  })
})
