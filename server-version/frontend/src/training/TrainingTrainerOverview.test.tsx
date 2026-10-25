import { act, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { beforeEach, describe, expect, it, vi } from 'vitest'
const { get, post } = vi.hoisted(() => ({ get: vi.fn(), post: vi.fn() }))
vi.mock('../api/client', () => ({ default: { get, post } }))
vi.mock('../contexts/AuthContext', () => ({ useAuth: () => ({ user: { id: 'teacher', role: 'TEACHER' } }) }))
import TrainingTrainerOverview, { type TeachingOverview } from './TrainingTrainerOverview'
import TrainingTrainerHome from './TrainingTrainerHome'
const row = { id: 'a', title: '课堂实践练习', course: { id: 'course', title: '跨课程研修' }, pendingCount: 3, oldestSubmittedAt: '2026-10-24T01:00:00Z', href: '/courses/course/detail?section=assignments&assignmentId=a' }
const data = (extra: Partial<TeachingOverview> = {}): TeachingOverview => ({ summary: { pendingSubmissions: 3, pendingAssignments: 1 }, list: [row], total: 1, page: 1, pageSize: 5, ...extra })
const mount = (home = false) => render(<MemoryRouter>{home ? <TrainingTrainerHome /> : <TrainingTrainerOverview />}</MemoryRouter>)
beforeEach(() => {
  vi.clearAllMocks(); localStorage.clear()
  Object.defineProperty(HTMLElement.prototype, 'scrollIntoView', { configurable: true, value: vi.fn() })
  get.mockImplementation((url: string) => Promise.resolve({ code: 0, data: url.startsWith('/courses/my/teaching-overview') ? data({ page: Number(new URL(url, 'http://localhost').searchParams.get('page')) }) : { list: [{ id: 'course', title: '我的研修课程', createdAt: '2026-10-24', status: 'PUBLISHED', courseCode: 'TEST', isLibrary: false }], total: 1 } }))
})
describe('Training trainer homepage work priorities', () => {
  it('presents true global totals and expands original review links without issuing a mutation', async () => {
    mount()
    const button = await screen.findByRole('button', { name: /待批阅练习.*3/ })
    expect(get).toHaveBeenCalledExactlyOnceWith('/courses/my/teaching-overview?page=1&pageSize=5&includeCourseCounts=false')
    expect(button).toHaveAttribute('aria-expanded', 'false')
    expect(screen.queryByRole('link', { name: /查看并批阅/ })).not.toBeInTheDocument()
    fireEvent.click(button)
    expect(await screen.findByRole('link', { name: '查看并批阅：课堂实践练习' })).toHaveAttribute('href', row.href)
    expect(screen.queryByRole('button', { name: /课程管理/ })).not.toBeInTheDocument()
    expect(screen.getByText('3 份待批阅')).toBeInTheDocument()
    expect(get).toHaveBeenCalledTimes(1)
    expect(post).not.toHaveBeenCalled()
  })
  it('still accepts a complete legacy summary when course counts are present', async () => {
    get.mockResolvedValue({ code: 0, data: data({ summary: { pendingSubmissions: 3, pendingAssignments: 1, courses: 6, publishedCourses: 4 } }) })
    mount()
    await screen.findByRole('button', { name: /待批阅练习.*3/ })
    expect(screen.queryByRole('alert')).not.toBeInTheDocument()
  })
  it.each(['pendingSubmissions', 'pendingAssignments', 'courses', 'publishedCourses'] as const)('rejects an invalid %s count rather than displaying a false zero', async key => {
    get.mockResolvedValue({ code: 0, data: data({ summary: { pendingSubmissions: 3, pendingAssignments: 1, [key]: -1 } }) })
    mount()
    await screen.findByRole('alert')
    expect(screen.getByRole('button', { name: /待批阅练习.*—/ })).toBeInTheDocument()
  })
  it('combines the heading with one review shortcut and keeps search beside creation', async () => {
    mount(true)
    await screen.findByRole('button', { name: /待批阅练习.*3/ })
    expect(screen.getByRole('heading', { name: '培训工作台 · 课程管理', level: 1 })).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /课程管理/ })).not.toBeInTheDocument()
    expect(await screen.findByRole('link', { name: '管理课程' })).toHaveAttribute('href', '/courses/course/detail')
    const toolbar = screen.getByRole('search').parentElement!
    expect(toolbar).toHaveClass('trainer-course-toolbar')
    expect(toolbar).toContainElement(screen.getByRole('button', { name: '创建课程' }))
    expect(screen.getAllByRole('button', { name: '创建课程' })).toHaveLength(1)
  })
  it('paginates the review queue independently from the course filters', async () => {
    get.mockImplementation((url: string) => Promise.resolve({ code: 0, data: data({ total: 8, page: Number(new URL(url, 'http://localhost').searchParams.get('page')) }) }))
    mount()
    fireEvent.click(await screen.findByRole('button', { name: /待批阅练习.*3/ }))
    fireEvent.click(screen.getByRole('button', { name: '下一页练习' }))
    await waitFor(() => expect(get).toHaveBeenLastCalledWith('/courses/my/teaching-overview?page=2&pageSize=5&includeCourseCounts=false'))
    await screen.findByText('共 8 项练习 · 第 2 / 2 页')
  })
  it('keeps unavailable counts unknown and courses accessible, and supports retry', async () => {
    const original = get.getMockImplementation()!
    let fail = true
    get.mockImplementation((url: string) => url.startsWith('/courses/my/teaching-overview') && fail ? Promise.reject(new Error('概览读取失败')) : original(url))
    mount(true)
    await screen.findByRole('alert')
    expect(screen.getByRole('button', { name: /待批阅练习.*—/ })).toBeInTheDocument()
    expect(await screen.findByRole('link', { name: '管理课程' })).toBeInTheDocument()
    fail = false
    fireEvent.click(screen.getByRole('button', { name: '重读批阅概览' }))
    await screen.findByRole('button', { name: /待批阅练习.*3/ })
  })
  it('keeps zero pending work distinct from a failed request', async () => {
    get.mockResolvedValue({ code: 0, data: data({ summary: { pendingSubmissions: 0, pendingAssignments: 0 }, list: [], total: 0 }) })
    mount()
    fireEvent.click(await screen.findByRole('button', { name: /待批阅练习.*0/ }))
    await screen.findByText('暂时没有待批阅的练习')
    expect(screen.queryByRole('alert')).not.toBeInTheDocument()
  })
  it('ignores an old page response after a later request starts', async () => {
    let finish!:(value: unknown) => void
    get.mockImplementation((url: string) => url.includes('page=2') ? new Promise(resolve => { finish = resolve }) : Promise.resolve({ code: 0, data: data({ total: 8 }) }))
    const view = mount()
    fireEvent.click(await screen.findByRole('button', { name: /待批阅练习.*3/ }))
    fireEvent.click(screen.getByRole('button', { name: '下一页练习' }))
    await waitFor(() => expect(get).toHaveBeenCalledWith('/courses/my/teaching-overview?page=2&pageSize=5&includeCourseCounts=false'))
    view.unmount()
    await act(async () => finish({ code: 0, data: data({ page: 2 }) }))
    expect(screen.queryByText('课堂实践练习')).not.toBeInTheDocument()
  })
})
