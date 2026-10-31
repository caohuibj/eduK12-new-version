import { act, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { MemoryRouter, Route, Routes, useNavigate } from 'react-router-dom'
import { beforeEach, expect, it, vi } from 'vitest'
const { get } = vi.hoisted(() => ({ get: vi.fn() }))
vi.mock('../../../api/client', () => ({ default: { get, post: vi.fn() } }))
import TeacherCourseDetail from '../TeacherCourseDetail'
function deferred() { let resolve!: (value: any) => void; const promise = new Promise<any>(done => { resolve = done }); return { promise, resolve } }
const course = (id: string) => ({ code: 0, data: { id, title: '课程 ' + id, courseCode: id, status: 'PUBLISHED' } })
function Navigation() { const navigate = useNavigate(); return <button onClick={() => navigate('/courses/b/detail')}>切换课程 B</button> }
function Page() { return <MemoryRouter initialEntries={['/courses/a/detail']}><Navigation /><Routes><Route path="/courses/:courseId/detail" element={<TeacherCourseDetail />} /></Routes></MemoryRouter> }
beforeEach(() => get.mockReset().mockImplementation(async (path: string) => /^\/courses\/[ab]$/.test(path)
  ? course(path.slice(-1)) : { code: 0, data: { list: [] } }))

it('does not show an old course title alongside links to the new course after late detail', async () => {
  const pending = deferred(), original = get.getMockImplementation()!
  get.mockImplementation((path: string) => path === '/courses/a' ? pending.promise : original(path))
  render(<Page />)
  await waitFor(() => expect(get).toHaveBeenCalledTimes(4))
  fireEvent.click(screen.getByRole('button', { name: '切换课程 B' }))
  await screen.findByRole('heading', { name: '课程 b' })
  await act(async () => { pending.resolve(course('a')) })
  expect(screen.getByRole('link', { name: '管理学生' })).toHaveAttribute('href', '/courses/b/students')
  expect(screen.queryByRole('heading', { name: '课程 a' })).toBeNull()
  expect(screen.getByRole('heading', { name: '课程 b' })).toBeInTheDocument()
})

it('does not retain a previous course when the newly selected course is unavailable', async () => {
  render(<Page />)
  await screen.findByRole('heading', { name: '课程 a' })
  const original = get.getMockImplementation()!
  get.mockImplementation((path: string) => path === '/courses/b' ? Promise.resolve({ code: 404, message: '无权访问' }) : original(path))
  fireEvent.click(screen.getByRole('button', { name: '切换课程 B' }))
  await waitFor(() => expect(get).toHaveBeenCalledTimes(8))
  expect(screen.queryByRole('heading', { name: '课程 a' })).toBeNull()
  expect(screen.getByText('课程不可用')).toBeInTheDocument()
})
