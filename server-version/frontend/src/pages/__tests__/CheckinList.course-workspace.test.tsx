import { act, cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { MemoryRouter, Route, Routes, useLocation } from 'react-router-dom'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { Course } from '../../types'

const api = vi.hoisted(() => ({ get: vi.fn(), post: vi.fn(), put: vi.fn(), sessionFetch: vi.fn() }))
vi.mock('../../api/client', () => ({ default: api, sessionFetch: api.sessionFetch }))
vi.mock('../../training/context', () => ({ isTrainingHost: () => true }))
vi.mock('../../contexts/AuthContext', () => ({ useAuth: () => ({ user: { id: 'teacher-1', role: 'TEACHER' } }) }))
vi.mock('../../components/RichTextEditor', () => ({ default: () => null }))
vi.mock('../../components/QuestionEditor', () => ({ default: () => null }))
vi.mock('../../components/MediaSelector', () => ({ default: () => null }))
import CheckinList from '../CheckinList'

const course = { id: 'course', title: '当前课程', creatorId: 'teacher-1', status: 'PUBLISHED', courseCode: 'TEST' } as Course
const full = { id: 'task', title: '课程打卡', courseId: course.id, course, status: 'PUBLISHED', content: '原有内容', questions: [], _count: { submissions: 3 } }
function RouteState() { const location = useLocation(); return <output data-testid="route">{location.pathname + location.search}</output> }
function mount(search = '') {
  render(<MemoryRouter initialEntries={['/courses/course/detail?section=checkins' + search]}><Routes><Route path="/courses/:courseId/detail" element={<><CheckinList embeddedCourse={course}/><RouteState/></>}/></Routes></MemoryRouter>)
}
beforeEach(() => {
  vi.resetAllMocks()
  Object.defineProperty(HTMLElement.prototype, 'scrollIntoView', { configurable: true, value: vi.fn() })
  api.get.mockImplementation(async (url: string) => ({ code: 0, data: url === '/checkins/task?courseId=course' ? full : url.includes('/submissions') ? { list: [] } : url.endsWith('/tags') ? { tags: [] } : url.startsWith('/checkins/schedules?') ? { list: [] } : { list: [{ ...full, summary: true }], total: 1 } }))
})
afterEach(() => { cleanup(); vi.restoreAllMocks(); vi.unstubAllGlobals() })

describe('Unified course check-in management', () => {
  it('redirects old links to the course, retaining task identity and namespaced filters', async () => {
    render(<MemoryRouter initialEntries={['/checkins?id=task&courseId=course&search=keyword&page=2&returnTo=%2Fcourses%2Fcourse%2Fdetail%3Fsection%3Dcheckins']}><Routes><Route path="/checkins" element={<CheckinList/>}/><Route path="/courses/:courseId/detail" element={<RouteState/>}/></Routes></MemoryRouter>)
    expect(await screen.findByTestId('route')).toHaveTextContent('/courses/course/detail?section=checkins&checkins_search=keyword&checkins_page=2&checkinId=task')
    expect(api.get).not.toHaveBeenCalled()
  })
  it('keeps legacy create links working with the course preselected after redirect', async () => {
    render(<MemoryRouter initialEntries={['/checkins?courseId=course&create=true']}><Routes><Route path="/checkins" element={<CheckinList/>}/><Route path="/courses/:courseId/detail" element={<><CheckinList embeddedCourse={course}/><RouteState/></>}/></Routes></MemoryRouter>)
    const dialog = await screen.findByRole('dialog', { name: '发布打卡' })
    expect(within(dialog).getByLabelText('选择课程 *')).toHaveValue('course')
    expect(screen.getByTestId('route')).toHaveTextContent('/courses/course/detail?section=checkins')
    expect(screen.getByTestId('route').textContent).not.toContain('create=')
  })
  it('opens authorized editing and submissions inside the same course URL', async () => {
    mount()
    fireEvent.click(await screen.findByRole('button', { name: '编辑打卡' }))
    const dialog = await screen.findByRole('dialog', { name: '编辑打卡' })
    expect(within(dialog).getByLabelText('选择课程 *')).toHaveValue('course')
    expect(within(dialog).getByLabelText('打卡标题 *')).toHaveValue(full.title)
    expect(within(dialog).getByRole('link', { name: '测评' })).toHaveAttribute('href', '/courses/course/detail?section=assessments')
    expect(api.get).toHaveBeenCalledWith('/checkins/task?courseId=course')
    fireEvent.click(within(dialog).getByRole('button', { name: '取消' }))
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument())
    fireEvent.click(screen.getByRole('button', { name: '查看提交' }))
    expect(await screen.findByRole('dialog', { name: '打卡提交列表' })).toBeInTheDocument()
    expect(api.get.mock.calls.some(([url]) => url.startsWith('/checkins/task/submissions'))).toBe(true)
    expect(screen.getByTestId('route')).toHaveTextContent('/courses/course/detail?section=checkins')
    expect(api.get.mock.calls.filter(([url]) => url.startsWith('/checkins?view=summary&courseId=course&'))).toHaveLength(1)
  })
  it('retains the visible authenticated Excel export without navigating away', async () => {
    mount()
    const createURL = vi.fn(() => 'blob:synthetic-export'), revokeURL = vi.fn()
    vi.stubGlobal('URL', class extends URL { static createObjectURL = createURL; static revokeObjectURL = revokeURL })
    const filenames: string[] = []
    vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(function(this: HTMLAnchorElement) { filenames.push(this.download) })
    api.sessionFetch.mockResolvedValue({ ok: true, blob: async () => new Blob(['synthetic xlsx']) })
    const exportButton = await screen.findByRole('button', { name: '导出提交' })
    const scheduled = vi.spyOn(window, 'setTimeout')
    await act(async () => fireEvent.click(exportButton))
    await waitFor(() => expect(filenames).toEqual(['课程打卡_打卡数据.xlsx']))
    expect(api.sessionFetch).toHaveBeenCalledExactlyOnceWith('/api/checkins/task/export')
    expect(revokeURL).not.toHaveBeenCalled()
    const cleanup = scheduled.mock.calls.findIndex(([, delay]) => delay === 60000)
    expect(cleanup).toBeGreaterThanOrEqual(0)
    window.clearTimeout(scheduled.mock.results[cleanup].value)
    ;(scheduled.mock.calls[cleanup][0] as () => void)()
    expect(revokeURL).toHaveBeenCalledWith('blob:synthetic-export')
    expect(screen.getByTestId('route')).toHaveTextContent('/courses/course/detail?section=checkins')
  })
  it('publishes in the current course and clears old task/filter focus before refreshing its list', async () => {
    mount('&checkinId=task&checkins_search=old')
    await screen.findByRole('button', { name: full.title })
    fireEvent.click(screen.getByRole('button', { name: '发布打卡' }))
    const dialog = await screen.findByRole('dialog', { name: '发布打卡' })
    expect(within(dialog).getByLabelText('选择课程 *')).toHaveValue('course')
    fireEvent.change(within(dialog).getByLabelText('打卡标题 *'), { target: { value: '新打卡' } })
    api.post.mockResolvedValue({ code: 0, data: { id: 'new' } })
    fireEvent.click(within(dialog).getByRole('button', { name: '发布打卡' }))
    await waitFor(() => expect(api.post).toHaveBeenCalledWith('/checkins', expect.objectContaining({ title: '新打卡', courseId: 'course' })))
    await waitFor(() => expect(screen.getByTestId('route').textContent).toBe('/courses/course/detail?section=checkins'))
    await screen.findByRole('button', { name: full.title })
    expect(api.get.mock.calls.filter(([url]) => url === '/checkins/task?courseId=course')).toHaveLength(1)
  })
  it('refreshes the course schedule panel immediately after creating a recurring check-in', async () => {
    mount()
    await screen.findByRole('button', { name: full.title })
    fireEvent.click(screen.getByRole('button', { name: '发布打卡' }))
    const dialog = await screen.findByRole('dialog', { name: '发布打卡' })
    fireEvent.change(within(dialog).getByLabelText('打卡标题 *'), { target: { value: '每周回顾' } })
    fireEvent.click(within(dialog).getByRole('radio', { name: '周期打卡' }))
    const before = api.get.mock.calls.filter(([url]) => url.startsWith('/checkins/schedules?')).length
    api.post.mockResolvedValue({ code: 0, data: { id: 'new-schedule' } })
    fireEvent.click(within(dialog).getByRole('button', { name: '设置周期打卡' }))
    await waitFor(() => expect(api.post).toHaveBeenCalledWith('/checkins/schedules', expect.objectContaining({ template: expect.objectContaining({ title: '每周回顾', courseId: 'course' }), intervalDays: 1, durationHours: 24 })))
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument())
    await waitFor(() => expect(api.get.mock.calls.filter(([url]) => url.startsWith('/checkins/schedules?')).length).toBeGreaterThan(before))
    expect(screen.getByTestId('route')).toHaveTextContent('/courses/course/detail?section=checkins')
  })
  it('rejects a focused check-in from another course and offers no edit/export actions', async () => {
    api.get.mockImplementation(async (url: string) => ({ code: 0, data: url.startsWith('/checkins/schedules?') ? { list: [] } : { ...full, courseId: 'foreign', course: { id: 'foreign', creatorId: 'teacher-1' } } }))
    mount('&checkinId=task')
    expect(await screen.findByText('无法管理此课程的打卡')).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: '编辑打卡' })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: '导出提交' })).not.toBeInTheDocument()
  })
})
