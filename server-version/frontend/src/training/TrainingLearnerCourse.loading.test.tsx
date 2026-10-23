import { act, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { MemoryRouter, Route, Routes, useNavigate } from 'react-router-dom'
import { beforeEach, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({ get: vi.fn(), cognitive: vi.fn(), enabled: false }))
vi.mock('../api/client', () => ({ default: { get: mocks.get } }))
vi.mock('../modules/cognitive/api', () => ({ cognitiveApi: { getMyAssignments: mocks.cognitive } }))
vi.mock('../contexts/CapabilitiesContext', () => ({ useCognitiveEnabled: () => mocks.enabled }))
import TrainingLearnerCourse from './TrainingLearnerCourse'

function deferred<T>() {
  let resolve!: (value: T) => void
  const promise = new Promise<T>(done => { resolve = done })
  return { promise, resolve }
}
const discoveryPaths = ['/questionnaires/available?courseId=course-1', '/scales/available', '/composite-assessments/available']
function Navigation() {
  const navigate = useNavigate()
  return <button onClick={() => navigate('/student/courses/course-2?section=assessments')}>另一课程</button>
}
function Page() {
  return <MemoryRouter initialEntries={['/student/courses/course-1?section=assessments']}>
    <Navigation /><Routes><Route path="/student/courses/:courseId" element={<TrainingLearnerCourse />} /></Routes>
  </MemoryRouter>
}
beforeEach(() => {
  mocks.enabled = false
  mocks.get.mockReset()
  mocks.cognitive.mockReset().mockResolvedValue({ code: 0, data: [] })
  mocks.get.mockImplementation((url: string) => {
    if (/^\/courses\/course-[12]$/.test(url)) return Promise.resolve({ code: 0, data: { id: url.substring(url.lastIndexOf('/') + 1), title: url } })
    return Promise.resolve({ code: 0, data: { list: [] } })
  })
})

it('starts one discovery fan-out during repeated tab switches while the first response is pending', async () => {
  const pending = deferred<{ code: number; data: { list: never[] } }>()
  const original = mocks.get.getMockImplementation()!
  mocks.get.mockImplementation((url: string) => discoveryPaths.includes(url) ? pending.promise : original(url))
  render(<Page />)
  await waitFor(() => expect(mocks.cognitive).toHaveBeenCalledTimes(1))
  for (let index = 0; index < 2; index++) {
    fireEvent.click(screen.getByRole('button', { name: '练习' }))
    fireEvent.click(screen.getByRole('button', { name: '测评' }))
  }
  await act(async () => { pending.resolve({ code: 0, data: { list: [] } }) })
  await screen.findByText('培训师还没有向这门课程发布测评。')
  // Deterministic synthetic API counts, not a browser latency measurement.
  for (const path of discoveryPaths) expect(mocks.get.mock.calls.filter(([url]) => url === path)).toHaveLength(1)
  expect(mocks.cognitive).toHaveBeenCalledTimes(1)
})

it('does not publish a previous course discovery after navigating to another course', async () => {
  const pending = deferred<unknown>()
  const original = mocks.get.getMockImplementation()!
  mocks.get.mockImplementation((url: string) => url === discoveryPaths[0] ? pending.promise : original(url))
  render(<Page />)
  await waitFor(() => expect(mocks.cognitive).toHaveBeenCalledTimes(1))
  fireEvent.click(screen.getByRole('button', { name: '另一课程' }))
  await screen.findByText('培训师还没有向这门课程发布测评。')
  await act(async () => { pending.resolve({ code: 0, data: { list: [{
    id: 'old', name: '旧课程问卷', courses: [{ id: 'course-1' }], completed: false,
  }] } }) })
  expect(screen.queryByText('旧课程问卷')).toBeNull()
  expect(mocks.get).toHaveBeenCalledWith('/questionnaires/available?courseId=course-2')
  expect(mocks.cognitive).toHaveBeenCalledTimes(2)
})

it('invalidates pending discovery when the authoritative capability changes', async () => {
  const pending = deferred<unknown>()
  mocks.cognitive.mockReturnValueOnce(pending.promise)
  const page = render(<Page />)
  await waitFor(() => expect(mocks.cognitive).toHaveBeenCalledTimes(1))
  mocks.enabled = true
  page.rerender(<Page />)
  await screen.findByText('培训师还没有向这门课程发布测评。')
  expect(mocks.cognitive).toHaveBeenCalledTimes(2)
  await act(async () => { pending.resolve({ code: 1, message: '过期能力查询失败' }) })
  expect(screen.queryByText(/过期能力查询失败/)).toBeNull()
})

it('retries failed discovery explicitly and does not share results across page mounts', async () => {
  mocks.cognitive.mockResolvedValueOnce({ code: 1, message: '查询暂时失败' })
  const page = render(<Page />)
  await screen.findByText(/查询暂时失败/)
  fireEvent.click(screen.getByRole('button', { name: '重新加载测评' }))
  await screen.findByText('培训师还没有向这门课程发布测评。')
  expect(mocks.cognitive).toHaveBeenCalledTimes(2)
  page.unmount()
  render(<Page />)
  await screen.findByText('培训师还没有向这门课程发布测评。')
  expect(mocks.cognitive).toHaveBeenCalledTimes(3)
})
