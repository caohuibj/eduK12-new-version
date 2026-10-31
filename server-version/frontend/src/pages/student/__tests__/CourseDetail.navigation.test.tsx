import { act, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { MemoryRouter, Route, Routes, useNavigate } from 'react-router-dom'
import { beforeEach, expect, it, vi } from 'vitest'
const { get } = vi.hoisted(() => ({ get: vi.fn() }))
vi.mock('../../../api/client', () => ({ default: { get } }))
import CourseDetail from '../CourseDetail'

function deferred() { let resolve!: (value: any) => void; const promise = new Promise<any>(done => { resolve = done }); return { promise, resolve } }
function Navigation() { const navigate = useNavigate(); return <button onClick={() => navigate('/student/courses/b')}>切换课程 B</button> }
function Page() { return <MemoryRouter initialEntries={['/student/courses/a']}><Navigation /><Routes><Route path="/student/courses/:courseId" element={<CourseDetail />} /></Routes></MemoryRouter> }
const course = (id: string) => ({ code: 0, data: { id, title: '课程 ' + id, status: 'PUBLISHED' } })
beforeEach(() => get.mockReset().mockImplementation(async (path: string) => /^\/courses\/[ab]$/.test(path)
  ? course(path.slice(-1)) : { code: 0, data: { list: [] } }))

it('does not replace the current course with an old course response', async () => {
  const pending = deferred(), original = get.getMockImplementation()!
  get.mockImplementation((path: string) => path === '/courses/a' ? pending.promise : original(path))
  render(<Page />)
  await waitFor(() => expect(get).toHaveBeenCalledTimes(5))
  fireEvent.click(screen.getByRole('button', { name: '切换课程 B' }))
  await screen.findByRole('heading', { name: '课程 b' })
  await act(async () => { pending.resolve(course('a')) })
  expect(screen.queryByRole('heading', { name: '课程 a' })).toBeNull()
  expect(screen.getByRole('heading', { name: '课程 b' })).toBeInTheDocument()
})

it('does not retain a previous course assignment after the new course assignment read fails', async () => {
  const original = get.getMockImplementation()!
  get.mockImplementation((path: string) => path === '/courses/a/assignments'
    ? Promise.resolve({ code: 0, data: { list: [{ id: 'assignment-a', title: 'A 的旧练习', status: 'PUBLISHED' }] } }) : original(path))
  render(<Page />)
  await screen.findByText('A 的旧练习')
  const oldAssignments = deferred()
  get.mockImplementation((path: string) => path === '/courses/b/assignments' ? oldAssignments.promise : original(path))
  fireEvent.click(screen.getByRole('button', { name: '切换课程 B' }))
  await screen.findByRole('heading', { name: '课程 b' })
  await act(async () => { oldAssignments.resolve({ code: 500, message: 'B 练习暂不可用' }) })
  expect(await screen.findByText('B 练习暂不可用')).toBeInTheDocument()
  expect(screen.queryByText('A 的旧练习')).toBeNull()
})
