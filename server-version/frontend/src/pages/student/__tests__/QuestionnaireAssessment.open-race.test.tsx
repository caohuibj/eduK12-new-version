import { act, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { MemoryRouter, Route, Routes, useNavigate, useParams } from 'react-router-dom'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import QuestionnaireAssessment from '../QuestionnaireAssessment'

const mocks = vi.hoisted(() => ({ get: vi.fn(), post: vi.fn(), patch: vi.fn(), register: vi.fn(), flush: vi.fn() }))
vi.mock('../../../api/client', () => ({ default: mocks }))
vi.mock('../../../components/FinalQuestionnaireAssessment', () => ({
  default: ({ data }: any) => <div>作答入口 {data.questionnaireAssessment.id}</div>,
}))
vi.mock('../../../services/persistence/checkpointScheduler', () => ({
  checkpointScheduler: { register: mocks.register, flush: mocks.flush, flushAll: vi.fn().mockResolvedValue(undefined) },
  CheckpointTransportError: Error,
}))

function deferred() {
  let resolve!: (value: any) => void
  let reject!: (cause: Error) => void
  const promise = new Promise<any>((done, fail) => { resolve = done; reject = fail })
  return { promise, resolve, reject }
}
const available = (completed = false) => ({ code: 0, data: { list: [
  { id: 'a', completed, inProgress: false, assessmentId: completed ? 'old-report' : null },
] } })
const opened = (id: string) => ({ code: 0, data: {
  questionnaireAssessment: { id, status: 'IN_PROGRESS', deliveryMode: 'FINAL_ONLY', currentIndex: 0 },
  currentFormItem: null, currentScale: null, currentFormSection: null, contentItems: [], totalItems: 1,
} })
const legacyScale = () => ({ code: 0, data: {
  ...opened('attempt-a').data,
  questionnaireAssessment: { id: 'attempt-a', status: 'IN_PROGRESS', deliveryMode: 'LEGACY', currentIndex: 0 },
  currentScale: { scaleAssessmentId: 'scale-a', definition: { items: [] } },
  contentItems: [{ type: 'scale', id: 'scale-a', completed: false }],
} })
function Navigation() {
  const navigate = useNavigate()
  return <button onClick={() => navigate('/student/questionnaires/b')}>切换问卷 B</button>
}
function Result() { return <div>报告 {useParams().assessmentId}</div> }
function Page() {
  return <MemoryRouter initialEntries={['/student/questionnaires/a']}><Navigation /><Routes>
    <Route path="/student/questionnaires/:questionnaireId" element={<QuestionnaireAssessment />} />
    <Route path="/student/questionnaires/result/:assessmentId" element={<Result />} />
  </Routes></MemoryRouter>
}
beforeEach(() => {
  vi.clearAllMocks()
  mocks.get.mockReset().mockResolvedValue({ code: 0, data: { list: [] } })
  mocks.post.mockReset().mockImplementation((path: string) => {
    if (path === '/questionnaires/a/assessments') return Promise.resolve(opened('attempt-a'))
    if (path === '/questionnaires/b/assessments') return Promise.resolve(opened('attempt-b'))
    throw Error('Unexpected POST ' + path)
  })
  mocks.flush.mockResolvedValue(undefined)
})
afterEach(() => vi.useRealTimers())

it.each([false, true])('ignores obsolete availability after switching questionnaire (completed=%s)', async completed => {
  const pending = deferred()
  mocks.get.mockImplementation((_path: string, config: any) => config.params.questionnaireId === 'a' ? pending.promise : Promise.resolve(available()))
  render(<Page />)
  await waitFor(() => expect(mocks.get).toHaveBeenCalledTimes(1))
  fireEvent.click(screen.getByRole('button', { name: '切换问卷 B' }))
  await screen.findByText('作答入口 attempt-b')
  await act(async () => { pending.resolve(available(completed)) })
  expect(screen.getByText('作答入口 attempt-b')).toBeInTheDocument()
  expect(mocks.post).toHaveBeenCalledExactlyOnceWith('/questionnaires/b/assessments')
  expect(screen.queryByText('报告 old-report')).toBeNull()
})

it('ignores an obsolete opening response before persistence registration, completion or runner hydration', async () => {
  const pending = deferred()
  mocks.post.mockReturnValueOnce(pending.promise)
  render(<Page />)
  await waitFor(() => expect(mocks.post).toHaveBeenCalledWith('/questionnaires/a/assessments'))
  fireEvent.click(screen.getByRole('button', { name: '切换问卷 B' }))
  await screen.findByText('作答入口 attempt-b')
  // Legacy empty attempts normally auto-complete. A stale opening must not
  // start that side effect after another questionnaire becomes current.
  await act(async () => { pending.resolve({ ...opened('attempt-a'), data: {
    ...opened('attempt-a').data, questionnaireAssessment: { id: 'attempt-a', status: 'IN_PROGRESS', deliveryMode: 'LEGACY', currentIndex: 0 },
  } }) })
  expect(screen.getByText('作答入口 attempt-b')).toBeInTheDocument()
  expect(mocks.register).not.toHaveBeenCalled()
  expect(mocks.flush).not.toHaveBeenCalled()
  expect(mocks.post.mock.calls.map(([path]) => path)).toEqual(['/questionnaires/a/assessments', '/questionnaires/b/assessments'])
})

it('keeps the new opening pending when the previous opening fails late', async () => {
  const old = deferred(), current = deferred()
  mocks.post.mockReturnValueOnce(old.promise).mockReturnValueOnce(current.promise)
  render(<Page />)
  await waitFor(() => expect(mocks.post).toHaveBeenCalledTimes(1))
  fireEvent.click(screen.getByRole('button', { name: '切换问卷 B' }))
  await waitFor(() => expect(mocks.post).toHaveBeenCalledTimes(2))
  await act(async () => { old.reject(Error('旧问卷网络错误')) })
  expect(screen.getByText('加载中...')).toBeInTheDocument()
  expect(screen.queryByRole('alert')).toBeNull()
  await act(async () => { current.resolve(opened('attempt-b')) })
  expect(screen.getByText('作答入口 attempt-b')).toBeInTheDocument()
})

it('clears the previous runner so a failed new opening offers its own retry', async () => {
  render(<Page />)
  await screen.findByText('作答入口 attempt-a')
  mocks.get.mockRejectedValueOnce(Error('问卷 B 暂不可用'))
  fireEvent.click(screen.getByRole('button', { name: '切换问卷 B' }))
  expect(await screen.findByRole('alert')).toHaveTextContent('问卷 B 暂不可用')
  expect(screen.queryByText('作答入口 attempt-a')).toBeNull()
  fireEvent.click(screen.getByRole('button', { name: '重试打开问卷' }))
  await screen.findByText('作答入口 attempt-b')
  expect(mocks.post.mock.calls.map(([path]) => path)).toEqual(['/questionnaires/a/assessments', '/questionnaires/b/assessments'])
})

it('does not open an attempt after the page unmounts during availability', async () => {
  const pending = deferred()
  mocks.get.mockReturnValueOnce(pending.promise)
  const page = render(<Page />)
  await waitFor(() => expect(mocks.get).toHaveBeenCalledTimes(1))
  page.unmount()
  await act(async () => { pending.resolve(available()) })
  expect(mocks.post).not.toHaveBeenCalled()
})

it('does not issue a capacity retry for a questionnaire that has been left', async () => {
  vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] })
  mocks.post.mockRejectedValueOnce({ response: { status: 503, data: { code: 'COMPLETION_BUSY', message: 'busy' } } })
  await act(async () => { render(<Page />) })
  expect(mocks.post).toHaveBeenCalledExactlyOnceWith('/questionnaires/a/assessments')
  await act(async () => { fireEvent.click(screen.getByRole('button', { name: '切换问卷 B' })) })
  expect(screen.getByText('作答入口 attempt-b')).toBeInTheDocument()
  await act(async () => { await vi.advanceTimersByTimeAsync(1501) })
  expect(mocks.post.mock.calls.map(([path]) => path)).toEqual(['/questionnaires/a/assessments', '/questionnaires/b/assessments'])
})

it('retains capacity recovery while the same questionnaire is current', async () => {
  vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] })
  mocks.post.mockRejectedValueOnce({ response: { status: 503, data: { code: 'COMPLETION_BUSY', message: 'busy' } } })
  await act(async () => { render(<Page />) })
  await act(async () => { await vi.advanceTimersByTimeAsync(1501) })
  expect(screen.getByText('作答入口 attempt-a')).toBeInTheDocument()
  expect(mocks.post.mock.calls.map(([path]) => path)).toEqual(['/questionnaires/a/assessments', '/questionnaires/a/assessments'])
})

it('does not navigate back to a completed old empty attempt', async () => {
  const pending = deferred()
  const original = mocks.post.getMockImplementation()!
  mocks.post.mockImplementation((path: string) => path === '/questionnaires/a/assessments' ? Promise.resolve({ code: 0, data: {
    ...opened('attempt-a').data, questionnaireAssessment: { id: 'attempt-a', status: 'IN_PROGRESS', deliveryMode: 'LEGACY', currentIndex: 0 },
  } }) : path.endsWith('/attempt-a/complete') ? pending.promise : original(path))
  render(<Page />)
  await waitFor(() => expect(mocks.post).toHaveBeenCalledWith('/questionnaires/assessments/attempt-a/complete'))
  fireEvent.click(screen.getByRole('button', { name: '切换问卷 B' }))
  await screen.findByText('作答入口 attempt-b')
  await act(async () => { pending.resolve({ code: 0 }) })
  expect(screen.getByText('作答入口 attempt-b')).toBeInTheDocument()
  expect(screen.queryByText('报告 attempt-a')).toBeNull()
})

it('does not hydrate an obsolete scale after its context freeze finishes', async () => {
  const pending = deferred()
  const original = mocks.post.getMockImplementation()!
  mocks.post.mockImplementation((path: string) => path === '/questionnaires/a/assessments'
    ? Promise.resolve(legacyScale()) : path.endsWith('/context/freeze') ? pending.promise : original(path))
  render(<Page />)
  await waitFor(() => expect(mocks.post).toHaveBeenCalledWith('/questionnaires/assessments/attempt-a/context/freeze'))
  fireEvent.click(screen.getByRole('button', { name: '切换问卷 B' }))
  await screen.findByText('作答入口 attempt-b')
  await act(async () => { pending.resolve({ code: 0, data: { status: 'frozen', frozenAt: '2026-10-31T00:00:00Z' } }) })
  expect(screen.getByText('作答入口 attempt-b')).toBeInTheDocument()
  expect(mocks.get.mock.calls.map(([path]) => path)).toEqual(['/questionnaires/available', '/questionnaires/available'])
})

it('ignores obsolete answer hydration errors after opening another questionnaire', async () => {
  const pending = deferred()
  mocks.get.mockImplementation((path: string) => path === '/scales/assessments/scale-a'
    ? pending.promise : Promise.resolve(available()))
  mocks.post.mockImplementation((path: string) => {
    if (path === '/questionnaires/a/assessments') return Promise.resolve(legacyScale())
    if (path.endsWith('/context/freeze')) return Promise.resolve({ code: 0, data: { status: 'frozen', frozenAt: '2026-10-31T00:00:00Z' } })
    if (path === '/questionnaires/b/assessments') return Promise.resolve({ code: 0, data: {
      ...opened('attempt-b').data, questionnaireAssessment: { id: 'attempt-b', status: 'IN_PROGRESS', deliveryMode: 'LEGACY', currentIndex: 0 },
      contentItems: [{ type: 'form', id: 'form-b', completed: false }],
    } })
    throw Error('Unexpected POST ' + path)
  })
  render(<Page />)
  await waitFor(() => expect(mocks.get).toHaveBeenCalledWith('/scales/assessments/scale-a'))
  const oldErrorHandlers = mocks.register.mock.calls.map(([, , , options]) => options.onError)
  fireEvent.click(screen.getByRole('button', { name: '切换问卷 B' }))
  await waitFor(() => expect(mocks.post).toHaveBeenCalledWith('/questionnaires/b/assessments'))
  await screen.findByText('这是旧版进行中的问卷')
  await act(async () => {
    for (const onError of oldErrorHandlers) onError(Error('旧检查点错误'))
    pending.reject(Error('旧量表答案读取失败'))
  })
  expect(screen.queryByRole('alert')).toBeNull()
})
