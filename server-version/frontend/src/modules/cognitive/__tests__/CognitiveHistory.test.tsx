import { act, cleanup, render, screen, within } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import CognitiveHistory from '../pages/CognitiveHistory'
import type { CognitiveHistoryItem } from '../types'

const { getHistory } = vi.hoisted(() => ({ getHistory: vi.fn() }))
vi.mock('../api', () => ({ cognitiveApi: { getHistory } }))

const historyItem = (overrides: Partial<CognitiveHistoryItem> = {}): CognitiveHistoryItem => ({
  sessionId: 'session-1', assignmentId: 'assignment-1', title: '认知任务记录',
  source: 'standalone', testType: 'reaction', attemptNo: 2,
  configVersion: '1.0.0', engineVersion: '1.0.0', scoringVersion: '1.0.0',
  finishedAt: '2026-10-19T00:00:00Z', score: 72.4, qualityState: 'interpretable',
  ...overrides,
})

const renderHistory = (items: CognitiveHistoryItem[]) => {
  getHistory.mockResolvedValue({ code: 0, data: {
    list: items, total: items.length, page: 1, pageSize: 20, totalPages: 1, hasMore: false,
  } })
  return render(<MemoryRouter><CognitiveHistory /></MemoryRouter>)
}

beforeEach(() => vi.clearAllMocks())
afterEach(() => { cleanup(); vi.useRealTimers() })

describe('CognitiveHistory participant feedback', () => {
  it('shows withheld completion and links to the parent report status without polling', async () => {
    vi.useFakeTimers()
    renderHistory([historyItem({
      source: 'composition', sourceName: '培训问卷', score: null, qualityState: null,
      feedbackDeferred: true, reportHref: '/student/composite/attempts/parent-1/report',
    })])
    await act(async () => { await vi.advanceTimersByTimeAsync(0) })

    const card = screen.getByRole('link', { name: '认知任务记录，查看尝试 2 的反馈状态' })
    expect(card).toHaveAttribute('href', '/student/composite/attempts/parent-1/report')
    expect(within(card).getByText('已完成，反馈尚未开放')).toBeInTheDocument()
    expect(within(card).getByText('组合测评 · 培训问卷 · 反馈开放后可查看结果')).toBeInTheDocument()
    expect(within(card).queryByText(/数据质量|得分/)).not.toBeInTheDocument()
    expect(getHistory).toHaveBeenCalledWith(1, 20)
    expect(vi.getTimerCount()).toBe(0)
    await act(async () => { await vi.advanceTimersByTimeAsync(24 * 60 * 60 * 1000) })
    expect(getHistory).toHaveBeenCalledTimes(1)
  })

  it.each(['interpretable', 'limited', 'invalid'] as const)('never exposes stale %s quality or a score when feedback is withheld', async (qualityState) => {
    renderHistory([historyItem({ feedbackDeferred: true, score: 987, qualityState })])
    const card = await screen.findByRole('link', { name: '认知任务记录，查看尝试 2 的反馈状态' })
    expect(within(card).getByText('已完成，反馈尚未开放')).toBeInTheDocument()
    expect(within(card).queryByText(/数据质量|987|可解释|受限解释|无效/)).not.toBeInTheDocument()
  })

  it.each([
    ['interpretable', '数据质量：可解释'],
    ['limited', '数据质量：受限解释'],
    ['invalid', '数据质量：无效，暂不解释'],
  ] as const)('preserves legacy standalone %s results', async (qualityState, label) => {
    renderHistory([historyItem({ qualityState })])
    const card = await screen.findByRole('link', { name: '认知任务记录，查看尝试 2 的结果' })
    expect(card).toHaveAttribute('href', '/student/cognitive/sessions/session-1/result')
    expect(within(card).getByText('得分 72')).toBeInTheDocument()
    expect(within(card).getByText(`独立任务 · ${label}`)).toBeInTheDocument()
    expect(within(card).queryByText('已完成，反馈尚未开放')).not.toBeInTheDocument()
  })

  it('preserves released composition links and null-score result labels', async () => {
    renderHistory([historyItem({
      source: 'composition', sourceName: '培训问卷', feedbackDeferred: false, score: null,
      reportHref: '/student/cognitive/sessions/released-1/result',
    })])
    const card = await screen.findByRole('link', { name: '认知任务记录，查看尝试 2 的结果' })
    expect(card).toHaveAttribute('href', '/student/cognitive/sessions/released-1/result')
    expect(within(card).getByText('查看结果')).toBeInTheDocument()
    expect(within(card).getByText('组合测评 · 培训问卷 · 数据质量：可解释')).toBeInTheDocument()
  })

  it('does not interpret a missing quality state as an invalid measurement', async () => {
    renderHistory([historyItem({ qualityState: null, score: null })])
    const card = await screen.findByRole('link', { name: '认知任务记录，查看尝试 2 的结果' })
    expect(within(card).getByText('独立任务 · 数据质量：暂不可用')).toBeInTheDocument()
    expect(within(card).queryByText(/无效|可解释|受限解释/)).not.toBeInTheDocument()
  })
})
