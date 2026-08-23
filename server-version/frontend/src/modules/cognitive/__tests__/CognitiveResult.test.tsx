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

describe('CognitiveResult page (generic metadata-driven renderer, Milestone E §74)', () => {
  it('renders reportDefinition-driven card via GET only (no re-scoring)', async () => {
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
        result: {
          score: 66.67,
          metrics: { trialCount: 3, correctCount: 2, accuracy: 0.6667, meanRtMs: 500 },
          qualityFlags: {},
        },
      },
    })
    renderAt()

    // 标题来自 reportDefinition.title；headline（accuracy）按 percentage 渲染
    expect(await screen.findByText('Fake 测试')).toBeTruthy()
    expect(screen.getAllByText('67%').length).toBeGreaterThan(0)
    // metricDefinitions 提供中文 label（summary 与 detail 都可能出现同一 label）
    expect(screen.getByText('正确数')).toBeTruthy()
    expect(screen.getAllByText('平均反应时').length).toBeGreaterThan(0)
    // disclaimer 来自 reportDefinition
    expect(screen.getByText('Fake 任务仅用于验证框架，不反映真实能力。')).toBeTruthy()

    // 只 GET 一次；绝不调用 complete / append（不重新评分）
    expect(mockCognitiveApi.getSession).toHaveBeenCalledTimes(1)
    expect(mockCognitiveApi.completeSession).not.toHaveBeenCalled()
    expect(mockCognitiveApi.appendTrial).not.toHaveBeenCalled()
  })

  it('shows frozen experience caveats from the session payload', async () => {
    mockCognitiveApi.getSession.mockResolvedValue({
      code: 0,
      message: 'ok',
      data: {
        sessionId: 's1',
        testType: 'reaction',
        engineVersion: '1.0.0',
        attemptNo: 1,
        status: 'COMPLETED',
        finishedAt: '2026-01-01T00:00:00Z',
        config: {},
        randomSeed: 'seed',
        profile: 'experience',
        reportCaveats: ['体验版，结果仅供体验。'],
        reportDefinition: {
          title: '简单反应时',
          headlineMetric: 'medianRtMs',
          primaryMetrics: ['medianRtMs'],
          secondaryMetrics: [],
          disclaimer: '不是常模',
        },
        metricDefinitions: {
          medianRtMs: { key: 'medianRtMs', label: '中位反应时', unit: 'ms' },
        },
        result: {
          score: 70,
          metrics: { medianRtMs: 320 },
          qualityFlags: { interpretable: true },
        },
      },
    })
    renderAt()
    expect(await screen.findByText('体验版，结果仅供体验。')).toBeTruthy()
    expect(screen.getAllByText(/体验版/).length).toBeGreaterThan(0)
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

  it('hides a strong headline, index, and reference when quality is insufficient', async () => {
    mockCognitiveApi.getSession.mockResolvedValue({
      code: 0,
      message: 'ok',
      data: {
        sessionId: 's1',
        testType: 'reaction',
        engineVersion: '1.0.0',
        attemptNo: 1,
        status: 'COMPLETED',
        config: {},
        randomSeed: 'seed',
        result: {
          score: 30,
          metrics: { medianRtMs: null, missRate: 1 },
          qualityFlags: { interpretable: false },
          reference: {
            mode: 'simulated',
            status: 'provisional',
            available: true,
            label: '模拟参考位置',
            version: 'sim-k12-v0.1',
            band: 'K7-9',
            referencePosition: 10,
            disclaimer: '模拟参考用于试运行与报告体验验证，不代表真实同龄人常模。',
          },
        },
      },
    })

    renderAt()

    expect(await screen.findByText('本次数据不足以稳定解释，建议重新测量。')).toBeTruthy()
    expect(screen.getByText('暂不显示')).toBeTruthy()
    expect(screen.queryByText('参考位置 10 / 100')).toBeNull()
    expect(screen.getByText('中位反应时')).toBeTruthy()
  })
})
