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

  it('renders quality → primary → secondary → method and never shows a rank position', async () => {
    mockCognitiveApi.getSession.mockResolvedValue({
      code: 0,
      message: 'ok',
      data: {
        sessionId: 's1',
        testType: 'reaction',
        engineVersion: '1.0.0',
        scoringVersion: '1.1.0',
        configVersion: '1.1.0',
        attemptNo: 1,
        status: 'COMPLETED',
        finishedAt: '2026-01-01T00:00:00Z',
        config: {},
        randomSeed: 'seed',
        profile: 'standard',
        reportDefinition: {
          title: '简单反应时',
          headlineMetric: 'medianRtMs',
          primaryMetrics: ['medianRtMs', 'rtICV', 'missRate'],
          secondaryMetrics: ['meanRtMs'],
          disclaimer: '不是医学诊断或人口常模。',
        },
        metricDefinitions: {
          medianRtMs: { key: 'medianRtMs', label: '中位反应时', unit: 'ms' },
          rtICV: { key: 'rtICV', label: '反应时变异系数', unit: 'ratio' },
          missRate: { key: 'missRate', label: '遗漏率', unit: 'ratio' },
          meanRtMs: { key: 'meanRtMs', label: '平均反应时', unit: 'ms' },
        },
        result: {
          score: 70,
          metrics: { medianRtMs: 320, rtICV: 0.2, missRate: 0.05, meanRtMs: 330 },
          qualityFlags: { interpretable: true },
          reference: {
            mode: 'simulated',
            status: 'provisional',
            available: true,
            label: '文献锚定模拟参考',
            version: 'lit-sim-k12-v0.2',
            band: 'K7-9',
            referencePosition: null,
            comparison: {
              metricKey: 'medianRtMs',
              observed: 320,
              referenceMean: 330,
              referenceSd: 40,
              sdDelta: -0.25,
              rangeLabel: '接近该研究样本报告范围',
            },
            disclaimer: '仅为文献锚定模拟参考，不代表中国学生常模。',
          },
        },
      },
    })
    renderAt()
    expect(await screen.findByText('数据质量')).toBeTruthy()
    expect(screen.getByText('主要指标')).toBeTruthy()
    expect(screen.getByText('次级指标')).toBeTruthy()
    expect(screen.getByText('方法说明')).toBeTruthy()
    expect(screen.getByText('任务表现指数')).toBeTruthy()
    expect(screen.getByText('接近该研究样本报告范围')).toBeTruthy()
    expect(screen.queryByText(/参考位置/)).toBeNull()
    expect(screen.queryByText(/百分位/)).toBeNull()
    const headings = screen.getAllByRole('heading').map((node) => node.textContent)
    expect(headings.indexOf('数据质量')).toBeLessThan(headings.indexOf('主要指标'))
    expect(headings.indexOf('主要指标')).toBeLessThan(headings.indexOf('次级指标'))
    expect(headings.indexOf('次级指标')).toBeLessThan(headings.indexOf('方法说明'))
  })

  it('uses frozen practical tips instead of the live frontend registry', async () => {
    mockCognitiveApi.getSession.mockResolvedValue({
      code: 0,
      message: 'ok',
      data: {
        sessionId: 's1',
        testType: 'reaction',
        engineVersion: '1.0.0',
        scoringVersion: '1.1.0',
        configVersion: '1.1.0',
        attemptNo: 1,
        status: 'COMPLETED',
        finishedAt: '2026-01-01T00:00:00Z',
        config: {},
        randomSeed: 'seed',
        profile: 'standard',
        reportDefinition: {
          title: '简单反应时',
          headlineMetric: 'medianRtMs',
          primaryMetrics: ['medianRtMs'],
          secondaryMetrics: [],
          practicalTips: ['冻结建议'],
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
    expect(await screen.findByText('冻结建议')).toBeTruthy()
    expect(screen.queryByText('在需要快速响应时先减少外部干扰。')).toBeNull()
  })

  it('does not reveal references carried by an invalid v2 result payload', async () => {
    mockCognitiveApi.getSession.mockResolvedValue({
      code: 0,
      message: 'ok',
      data: {
        sessionId: 's1',
        testType: 'reaction',
        engineVersion: '1.0.0',
        scoringVersion: '1.1.0',
        configVersion: '1.1.0',
        attemptNo: 1,
        status: 'COMPLETED',
        config: {},
        randomSeed: 'seed',
        result: {
          metrics: { medianRtMs: 350 },
          qualityFlags: { corruptedPayload: true },
          quality: { state: 'invalid', flags: { corruptedPayload: true }, reasons: ['数据损坏'] },
          references: [{ metricKey: 'medianRtMs', status: 'available', label: '不应显示的参考' }],
          report: {
            title: '简单反应时',
            qualityState: 'invalid',
            conclusion: '本次数据未达到可解释条件，暂不提供表现结论。',
            headline: [],
            user: [],
            detail: [],
            quality: [{ key: 'corruptedPayload', label: '数据损坏', active: true, effect: 'invalid' }],
            method: {
              testType: 'reaction', engineVersion: '1.0.0', scoringVersion: '1.1.0',
              configVersion: '1.1.0', protocolSignature: 'a'.repeat(64), profile: null,
            },
            disclaimer: '仅用于测试。',
            practicalTips: [],
          },
        },
      },
    })
    renderAt()
    expect(await screen.findByText('简单反应时')).toBeTruthy()
    expect(screen.queryByText('不应显示的参考')).toBeNull()
    expect(screen.queryByText('参考信息')).toBeNull()
  })
})
