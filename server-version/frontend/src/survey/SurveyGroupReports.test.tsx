import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { SurveyGroupReports } from './SurveyGroupReports'
import type { TaskGroupArtifact } from '../modules/reporting/TaskGroupReport'

afterEach(cleanup)
const artifact: TaskGroupArtifact = { artifactId: 'saved-1', generatedAt: '2026-10-30T00:00:00Z', projection: {
  title: '学习体验 · 群体报告', sourceLabel: '第一次施测', cutoff: '2026-10-29T00:00:00Z', populationLabel: '本波次全部合格已完成答卷',
  completedN: 12, countUnit: 'RESPONSE', assignedN: null, tool: { key: 'scale', title: '学习体验', kind: 'SCALE' },
  metrics: [{ key: 'total', label: '总分', type: 'NUMBER', unit: 'score', validN: 10, missingN: 2, mean: 0, sdSample: 2,
    range: { min: -5, max: 5 }, observedRange: { min: -2, max: 2 }, qualityCounts: {}, measurement: {} , frequencies: [] },
  { key: 'dimension', label: '合作维度', type: 'NUMBER', unit: 'score', validN: 0, missingN: 12, mean: null, sdSample: null,
    range: null, observedRange: null, qualityCounts: {}, measurement: {}, frequencies: [] }],
  limitations: ['各指标使用各自有效样本，描述统计不代表干预效果。'] } }

describe('Survey group snapshot reading', () => {
  it('opens the saved version, switches metrics locally, prints and uses explicit generation for an update', async () => {
    const fullscreen = vi.fn().mockResolvedValue(undefined), print = vi.spyOn(window, 'print').mockImplementation(() => {})
    Object.defineProperty(HTMLElement.prototype, 'requestFullscreen', { configurable: true, value: fullscreen })
    const base = '/projects/project/analytics/waves/wave/group-reports'
    const request = vi.fn(async (path: string, method = 'GET') => path === base && method === 'GET'
      ? { tools: [{ instrumentKey: 'scale', title: '学习体验', kind: 'SCALE' }], artifacts: [{ artifactId: 'saved-1', generatedAt: artifact.generatedAt }] }
      : method === 'POST' ? { ...artifact, artifactId: 'saved-2' } : artifact)
    render(<SurveyGroupReports projectId="project" waveId="wave" request={request as <T>(path: string, method?: string, body?: unknown) => Promise<T>} />)
    expect(request).not.toHaveBeenCalled()
    fireEvent.click(screen.getByRole('button', { name: '打开群体报告' }))
    await screen.findByRole('article', { name: '群体报告阅读' })
    expect(request.mock.calls.map(call => call[1] ?? 'GET')).toEqual(['GET', 'GET'])
    expect(screen.getByText('纳入答卷')).toBeTruthy(); expect(screen.getByText(/有效 N=10，均值 0/)).toBeTruthy()
    fireEvent.change(screen.getByLabelText('阅读指标'), { target: { value: 'dimension' } })
    expect(request).toHaveBeenCalledTimes(2)
    fireEvent.click(screen.getByRole('button', { name: '全屏展示' })); await waitFor(() => expect(fullscreen).toHaveBeenCalledTimes(1))
    fireEvent.click(screen.getByRole('button', { name: '打印 / 保存 PDF' })); expect(print).toHaveBeenCalledTimes(1)
    fireEvent.click(screen.getByRole('button', { name: '生成更新版报告' }))
    await waitFor(() => expect(request).toHaveBeenLastCalledWith(base, 'POST', { instrumentKey: 'scale' }))
    await waitFor(() => expect(screen.getByLabelText('群体报告版本')).toHaveValue('saved-2'))
    expect(screen.getByRole('option', { name: /saved-1/ })).toBeTruthy()
    print.mockRestore(); delete (HTMLElement.prototype as { requestFullscreen?: unknown }).requestFullscreen
  })
  it('clears a stale report after scope changes and rejects stale responses', async () => {
    let resolve!: (value: unknown) => void
    const request = vi.fn(() => new Promise<unknown>(done => { resolve = done }))
    const view = render(<SurveyGroupReports projectId="project" waveId="wave" request={request as <T>(path: string, method?: string, body?: unknown) => Promise<T>} />)
    fireEvent.click(screen.getByRole('button', { name: '打开群体报告' }))
    view.rerender(<SurveyGroupReports projectId="other-project" waveId="wave" request={request as <T>(path: string, method?: string, body?: unknown) => Promise<T>} />)
    resolve({ tools: [], artifacts: [{ artifactId: 'saved-1', generatedAt: artifact.generatedAt }] })
    await waitFor(() => expect(screen.queryByRole('status')).toBeNull())
    expect(screen.queryByRole('article', { name: '群体报告阅读' })).toBeNull(); expect(request).toHaveBeenCalledTimes(1)
  })
})
