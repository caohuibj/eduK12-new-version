import { act, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { Link, MemoryRouter, Route, Routes } from 'react-router-dom'
import { beforeEach, expect, it, vi } from 'vitest'
import QuestionnaireResult from '../QuestionnaireResult'
import ScaleResult from '../ScaleResult'
import { LearnerNavigationContext } from '../../../training/learnerNavigation'

const { get, mutate } = vi.hoisted(() => ({ get: vi.fn(), mutate: vi.fn() }))
vi.mock('../../../api/client', () => ({ default: { get, post: mutate, patch: mutate, put: mutate, delete: mutate }, sessionFetch: vi.fn() }))

const kinds = ['questionnaire', 'scale'] as const
const route = (kind: typeof kinds[number]) => kind === 'questionnaire'
  ? '/student/questionnaires/result/:assessmentId' : '/student/scales/assessments/:assessmentId/result'
const href = (kind: typeof kinds[number], id: string) => kind === 'questionnaire'
  ? `/student/questionnaires/result/${id}` : `/student/scales/assessments/${id}/result`
const endpoint = (kind: typeof kinds[number], id: string) => kind === 'questionnaire'
  ? `/questionnaires/assessments/${id}/report` : `/scales/assessments/${id}`
const report = (kind: typeof kinds[number], name: string) => kind === 'questionnaire'
  ? { questionnaireName: name, completedAt: '2026-10-31T00:00:00Z', totalTime: 0, totalDimensions: 0, backgroundValues: [], unitReports: [] }
  : { id: 'record', status: 'COMPLETED', completedAt: '2026-10-31T00:00:00Z', totalTime: 0,
    scale: { id: 'scale', code: 'S1', name, description: null },
    result: { quality: { status: 'valid', flags: [] }, scores: [], references: [], interpretations: [], caveats: [], disclaimer: '冻结报告说明', method: {} } }
function page(kind: typeof kinds[number]) {
  return render(<LearnerNavigationContext.Provider value>
    <MemoryRouter initialEntries={[href(kind, 'first') + '?courseId=course-1&courseSection=assessments']}>
      <Link to={href(kind, 'second')}>切换记录</Link>
      <Routes>
        <Route path={route(kind)} element={kind === 'questionnaire' ? <QuestionnaireResult /> : <ScaleResult />} />
        <Route path="/student/courses/course-1" element={<p>当前课程测评列表</p>} />
      </Routes>
    </MemoryRouter>
  </LearnerNavigationContext.Provider>)
}
beforeEach(() => {
  get.mockReset()
  mutate.mockReset().mockImplementation(() => { throw new Error('Report recovery must not submit or generate anything') })
})

it.each(kinds)('%s offers explicit read recovery after a transport failure, without duplicate requests', async kind => {
  let finish!: (value: unknown) => void
  get.mockRejectedValueOnce({ status: 503, message: 'temporary outage' })
    .mockReturnValueOnce(new Promise(resolve => { finish = resolve }))
  page(kind)
  const retry = await screen.findByRole('button', { name: '重试读取报告' })
  expect(screen.getByText('服务暂时不可用，请稍后重试。')).toBeInTheDocument()
  expect(get).toHaveBeenCalledTimes(1)
  fireEvent.click(retry)
  fireEvent.click(retry)
  await waitFor(() => expect(get).toHaveBeenCalledTimes(2))
  expect(screen.queryByRole('button', { name: '重试读取报告' })).toBeNull()
  await act(async () => { finish({ code: 0, data: report(kind, '恢复后的报告') }) })
  expect(await screen.findByRole('heading', { level: 1, name: '恢复后的报告' })).toBeInTheDocument()
  expect(get.mock.calls.map(([url]) => url)).toEqual([endpoint(kind, 'first'), endpoint(kind, 'first')])
  expect(mutate).not.toHaveBeenCalled()
})

it.each(kinds)('%s preserves an explicit denied read and its existing course return path', async kind => {
  get.mockResolvedValue({ code: 403, message: '当前报告尚未获准查看' })
  page(kind)
  expect(await screen.findByText('当前报告尚未获准查看')).toBeInTheDocument()
  fireEvent.click(screen.getByRole('button', { name: '重试读取报告' }))
  expect(await screen.findByText('当前报告尚未获准查看')).toBeInTheDocument()
  expect(get).toHaveBeenCalledTimes(2)
  expect(screen.queryByText('已提交')).toBeNull()
  fireEvent.click(screen.getByRole('button', { name: '返回当前课程' }))
  expect(await screen.findByText('当前课程测评列表')).toBeInTheDocument()
  expect(mutate).not.toHaveBeenCalled()
})

it.each(kinds)('%s ignores a late success from the previous record retry', async kind => {
  let finish!: (value: unknown) => void
  get.mockRejectedValueOnce({ status: 503 })
    .mockReturnValueOnce(new Promise(resolve => { finish = resolve }))
    .mockResolvedValueOnce({ code: 0, data: report(kind, '当前记录报告') })
  page(kind)
  fireEvent.click(await screen.findByRole('button', { name: '重试读取报告' }))
  fireEvent.click(screen.getByRole('link', { name: '切换记录' }))
  expect(await screen.findByRole('heading', { level: 1, name: '当前记录报告' })).toBeInTheDocument()
  await act(async () => { finish({ code: 0, data: report(kind, '过期记录报告') }) })
  expect(screen.queryByText('过期记录报告')).toBeNull()
  expect(screen.getByRole('heading', { level: 1, name: '当前记录报告' })).toBeInTheDocument()
  expect(mutate).not.toHaveBeenCalled()
})

it.each(kinds)('%s ignores a late failure from the previous record retry', async kind => {
  let fail!: (reason: unknown) => void
  get.mockRejectedValueOnce({ status: 503 })
    .mockReturnValueOnce(new Promise((_resolve, reject) => { fail = reject }))
    .mockResolvedValueOnce({ code: 0, data: report(kind, '当前记录报告') })
  page(kind)
  fireEvent.click(await screen.findByRole('button', { name: '重试读取报告' }))
  fireEvent.click(screen.getByRole('link', { name: '切换记录' }))
  expect(await screen.findByRole('heading', { level: 1, name: '当前记录报告' })).toBeInTheDocument()
  await act(async () => { fail({ message: '过期记录的失败' }) })
  expect(screen.queryByText('过期记录的失败')).toBeNull()
  expect(screen.getByRole('heading', { level: 1, name: '当前记录报告' })).toBeInTheDocument()
  expect(mutate).not.toHaveBeenCalled()
})
