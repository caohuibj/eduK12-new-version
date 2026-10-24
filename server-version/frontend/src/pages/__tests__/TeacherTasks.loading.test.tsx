import { StrictMode } from 'react'
import { act, cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { Course } from '../../types'

const api = vi.hoisted(() => ({ get: vi.fn(), post: vi.fn(), put: vi.fn(), sessionFetch: vi.fn(), training: false }))
vi.mock('../../api/client', () => ({ default: api, sessionFetch: api.sessionFetch }))
vi.mock('../../training/context', () => ({ isTrainingHost: () => api.training }))
vi.mock('../../contexts/AuthContext', () => ({ useAuth: () => ({ user: { id: 'teacher-1', role: 'TEACHER' } }) }))
vi.mock('../../components/RichTextEditor', () => ({ default: () => null }))
vi.mock('../../components/QuestionEditor', () => ({ default: () => null }))
vi.mock('../../components/MediaSelector', () => ({ default: () => null }))
import AssignmentList from '../AssignmentList'
import CheckinList from '../CheckinList'

const course = { id: 'course', title: '当前课程', creatorId: 'teacher-1' } as Course
const task = { id: 'task', title: '课程任务', courseId: course.id, course, status: 'PUBLISHED', content: '', questions: [], _count: { submissions: 10 } }
function pending<T>() { let resolve!: (value: T) => void; const promise = new Promise<T>(done => { resolve = done }); return { promise, resolve } }
beforeEach(() => {
  vi.resetAllMocks()
  api.training = false
  api.get.mockImplementation(async (url: string) => ({ code: 0, data: url === '/courses' ? { list: [course] } : url.endsWith('/tags') ? { tags: [] } : { list: [task], total: 1 } }))
})
afterEach(cleanup)

describe('Teacher task loading cost and request isolation', () => {
  it.each([{ name: 'assignment', Component: AssignmentList }, { name: 'checkin', Component: CheckinList }])('measures standalone $name course-option reads', async ({ name, Component }) => {
    render(<MemoryRouter><Component/></MemoryRouter>)
    await screen.findByRole('button', { name: task.title })
    const calls = api.get.mock.calls.filter(([url]) => url === '/courses').length
    process.stdout.write('TEACHER_METRIC ' + JSON.stringify({ scenario: `${name}-list-entry`, courseOptionReads: calls }) + '\n')
    expect(calls).toBe(0)
  })

  it('measures same-turn submission opens and status work while typing a batch comment', async () => {
    const request = pending<{ code: number; data: { list: unknown[]; total?: number; gradedCount?: number; ungradedCount?: number; nextCursor?: null } }>()
    let statusReads = 0
    const submissions = Array.from({ length: 10 }, (_, index) => ({
      id: `submission-${index}`, studentId: `student-${index}`, student: { id: `student-${index}`, username: `Student ${index}`, nickname: '' },
      submittedAt: '2026-10-01T00:00:00.000Z', content: '合成答案',
      get status() { statusReads++; return index % 2 ? 'GRADED' : 'SUBMITTED' },
    }))
    api.get.mockImplementation(async (url: string) => url.endsWith('/submissions') ? request.promise : { code: 0, data: { list: [task], total: 1 } })
    render(<MemoryRouter><AssignmentList embeddedCourse={course}/></MemoryRouter>)
    const open = await screen.findByRole('button', { name: '查看提交' })
    act(() => { fireEvent.click(open); fireEvent.click(open) })
    const reads = api.get.mock.calls.filter(([url]) => url.endsWith('/submissions')).length
    await act(async () => request.resolve({ code: 0, data: { list: submissions, total: 10, gradedCount: 5, ungradedCount: 5, nextCursor: null } }))
    fireEvent.click(await screen.findByRole('button', { name: '一键批量批复' }))
    const comment = screen.getByPlaceholderText('请输入评语...')
    statusReads = 0
    fireEvent.change(comment, { target: { value: '新评语' } })
    process.stdout.write('TEACHER_METRIC ' + JSON.stringify({ scenario: 'assignment-review-10-rows', sameTurnSubmissionReads: reads, batchCommentStatusReads: statusReads }) + '\n')
    expect(reads).toBe(1)
    expect(statusReads).toBe(30)
    expect(screen.getByRole('button', { name: '确认批复 (5份)' })).toBeInTheDocument()
  })

  it.each([
    { Component: AssignmentList, create: '布置练习', title: '练习标题 *' },
    { Component: CheckinList, create: '创建打卡', title: '打卡标题 *' },
  ])('loads course choices on $create, retries failure without clearing the draft, and reuses them', async ({ Component, create, title }) => {
    let fail = true
    api.get.mockImplementation(async (url: string) => url === '/courses'
      ? fail ? { code: 1, message: '课程读取暂不可用' } : { code: 0, data: { list: [course] } }
      : { code: 0, data: url.endsWith('/tags') ? { tags: [] } : { list: [task], total: 1 } })
    render(<MemoryRouter><Component/></MemoryRouter>)
    fireEvent.click(await screen.findByRole('button', { name: create }))
    const dialog = await screen.findByRole('dialog')
    fireEvent.change(within(dialog).getByLabelText(title), { target: { value: '保留编辑草稿' } })
    const retry = await within(dialog).findByRole('button', { name: '重试课程列表' })
    expect(within(dialog).getByRole('alert')).toHaveTextContent('课程读取暂不可用')
    expect(api.post).not.toHaveBeenCalled()
    fail = false
    fireEvent.click(retry)
    await within(dialog).findByRole('option', { name: new RegExp(course.title) })
    expect(within(dialog).getByLabelText(title)).toHaveValue('保留编辑草稿')
    expect(api.get.mock.calls.filter(([url]) => url === '/courses')).toHaveLength(2)
    // Returning the only edited value to its baseline allows the normal guarded close.
    fireEvent.change(within(dialog).getByLabelText(title), { target: { value: '' } })
    fireEvent.click(within(dialog).getByRole('button', { name: '取消' }))
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument())
    fireEvent.click(screen.getByRole('button', { name: create }))
    expect(await screen.findByRole('option', { name: new RegExp(course.title) })).toBeInTheDocument()
    expect(api.get.mock.calls.filter(([url]) => url === '/courses')).toHaveLength(2)
  })

  it.each([
    { Component: AssignmentList, reuse: '复用练习' },
    { Component: CheckinList, reuse: '复用打卡' },
  ])('keeps $reuse modal and course retry usable while choices are unavailable', async ({ Component, reuse }) => {
    api.training = true
    let fail = true
    api.get.mockImplementation(async (url: string) => url === '/courses'
      ? fail ? { code: 1, message: '课程读取暂不可用' } : { code: 0, data: { list: [course] } }
      : { code: 0, data: url.endsWith('/tags') ? { tags: [] } : { list: [task], total: 1 } })
    render(<MemoryRouter><Component/></MemoryRouter>)
    fireEvent.click(await screen.findByRole('button', { name: reuse }))
    const dialog = await screen.findByRole('dialog', { name: reuse })
    fireEvent.click(await within(dialog).findByRole('button', { name: '重试课程列表' }))
    await waitFor(() => expect(api.get.mock.calls.filter(([url]) => url === '/courses')).toHaveLength(2))
    fail = false
    fireEvent.click(await within(dialog).findByRole('button', { name: '重试课程列表' }))
    await within(dialog).findByRole('option', { name: new RegExp(course.title) })
    fireEvent.change(within(dialog).getByLabelText('复用到课程'), { target: { value: course.id } })
    expect(within(dialog).getByRole('button', { name: '使用此内容' })).toBeEnabled()
    expect(api.post).not.toHaveBeenCalled()
  })

  it.each(['task', 'other'])('ignores the late response after closing and reopening %s, including its selection', async (nextId) => {
    const stale = pending<{ code: number; data: { list: unknown[]; total?: number; gradedCount?: number; ungradedCount?: number; nextCursor?: null } }>()
    const fresh = pending<{ code: number; data: { list: unknown[]; total?: number; gradedCount?: number; ungradedCount?: number; nextCursor?: null } }>()
    let requests = 0
    api.get.mockImplementation(async (url: string) => url.endsWith('/submissions')
      ? (++requests === 1 ? stale.promise : fresh.promise)
      : { code: 0, data: { list: [task, { ...task, id: 'other', title: '另一个任务' }], total: 2 } })
    render(<MemoryRouter><AssignmentList embeddedCourse={course}/></MemoryRouter>)
    const opens = await screen.findAllByRole('button', { name: '查看提交' })
    fireEvent.click(opens[0])
    fireEvent.click(await screen.findByRole('button', { name: '关闭练习提交列表' }))
    fireEvent.click(opens[nextId === 'task' ? 0 : 1])
    const submission = (id: string, username: string) => ({ id, revision: 2, studentId: id, student: { id, username }, status: 'SUBMITTED', submittedAt: '2026-10-01T00:00:00.000Z' })
    await act(async () => fresh.resolve({ code: 0, data: { list: [submission('fresh', '当前学生')], total: 1, gradedCount: 0, ungradedCount: 1, nextCursor: null } }))
    expect(await screen.findByText('当前学生')).toBeInTheDocument()
    await act(async () => stale.resolve({ code: 0, data: { list: [submission('stale', '旧学生')] } }))
    expect(screen.queryByText('旧学生')).not.toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: '一键批量批复' }))
    api.post.mockImplementation(async (url: string) => ({ code: 0, data: url.endsWith('/review-selection') ? { count: 1, chunks: ['proof'], selectionId: 's', expiresAt: '' } : { gradedCount: 1, skippedCount: 0 } }))
    fireEvent.click(screen.getByRole('button', { name: '确认批复 (1份)' }))
    await waitFor(() => expect(api.post).toHaveBeenCalledWith(`/assignments/${nextId}/review-selection`, { scope: 'page', items: [{ id: 'fresh', revision: 2 }] }))
    await waitFor(() => expect(api.post).toHaveBeenCalledWith(`/assignments/${nextId}/batch-grade`, expect.objectContaining({ selectionToken: 'proof' })))
  })

  it('shows a nonzero submission read as retryable failure, not an empty list', async () => {
    let fail = true
    api.get.mockImplementation(async (url: string) => url.endsWith('/submissions')
      ? fail ? { code: 1, message: '提交读取暂不可用' } : { code: 0, data: { list: [] } }
      : { code: 0, data: { list: [task], total: 1 } })
    render(<MemoryRouter><AssignmentList embeddedCourse={course}/></MemoryRouter>)
    fireEvent.click(await screen.findByRole('button', { name: '查看提交' }))
    expect(await screen.findByRole('alert')).toHaveTextContent('提交读取暂不可用')
    expect(screen.queryByText('暂无提交')).not.toBeInTheDocument()
    fail = false
    fireEvent.click(screen.getByRole('button', { name: '重试提交列表' }))
    expect(await screen.findByText('暂无提交')).toBeInTheDocument()
    expect(api.get.mock.calls.filter(([url]) => url.endsWith('/submissions'))).toHaveLength(2)
  })

  it('recomputes grading counts and selection after the post-grade refresh', async () => {
    let graded = false
    const submission = { id: 'submission', revision: 2, studentId: 'student', student: { id: 'student', username: '学生' }, submittedAt: '2026-10-01T00:00:00.000Z' }
    api.get.mockImplementation(async (url: string) => ({ code: 0, data: url.endsWith('/submissions')
      ? { list: [{ ...submission, status: graded ? 'GRADED' : 'SUBMITTED' }], total: 1, gradedCount: graded ? 1 : 0, ungradedCount: graded ? 0 : 1, nextCursor: null }
      : { list: [task], total: 1 } }))
    api.post.mockImplementation(async (url: string) => { if (url.endsWith('/review-selection')) return { code: 0, data: { count: 1, chunks: ['proof'], selectionId: 's', expiresAt: '' } }; graded = true; return { code: 0, data: { gradedCount: 1, skippedCount: 0 } } })
    render(<MemoryRouter><AssignmentList embeddedCourse={course}/></MemoryRouter>)
    fireEvent.click(await screen.findByRole('button', { name: '查看提交' }))
    fireEvent.click(await screen.findByRole('button', { name: '一键批量批复' }))
    fireEvent.click(screen.getByRole('button', { name: '确认批复 (1份)' }))
    await screen.findByText('1 已批改')
    expect(screen.getByText('0 待批改')).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: '一键批量批复' })).not.toBeInTheDocument()
    expect(api.get.mock.calls.filter(([url]) => url.endsWith('/submissions'))).toHaveLength(2)
  })


  it('ignores an old failure while the replacement request is pending and retries a current network error', async () => {
    let rejectOld!: (error: Error) => void
    const old = new Promise<never>((_resolve, reject) => { rejectOld = reject })
    const next = pending<{ code: number; data: { list: unknown[]; total?: number; gradedCount?: number; ungradedCount?: number; nextCursor?: null } }>()
    let calls = 0
    api.get.mockImplementation(async (url: string) => url.endsWith('/submissions')
      ? ++calls === 1 ? old : calls === 2 ? next.promise : Promise.reject(new Error('网络断开'))
      : { code: 0, data: { list: [task], total: 1 } })
    render(<MemoryRouter><AssignmentList embeddedCourse={course}/></MemoryRouter>)
    const open = await screen.findByRole('button', { name: '查看提交' })
    fireEvent.click(open)
    fireEvent.click(await screen.findByRole('button', { name: '关闭练习提交列表' }))
    fireEvent.click(open)
    await act(async () => rejectOld(new Error('旧请求错误')))
    expect(screen.queryByRole('alert')).not.toBeInTheDocument()
    expect(screen.queryByText('暂无提交')).not.toBeInTheDocument()
    await act(async () => next.resolve({ code: 0, data: { list: [] } }))
    expect(await screen.findByText('暂无提交')).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: '关闭练习提交列表' }))
    fireEvent.click(open)
    expect(await screen.findByRole('alert')).toHaveTextContent('网络断开')
    fireEvent.click(screen.getByRole('button', { name: '重试提交列表' }))
    await waitFor(() => expect(calls).toBe(4))
  })


  it('isolates an unmounted review from a new StrictMode mount of the same course', async () => {
    const old = pending<{ code: number; data: { list: unknown[]; total?: number; gradedCount?: number; ungradedCount?: number; nextCursor?: null } }>()
    let calls = 0
    api.get.mockImplementation(async (url: string) => url.endsWith('/submissions')
      ? ++calls === 1 ? old.promise : { code: 0, data: { list: [] } }
      : { code: 0, data: { list: [task], total: 1 } })
    const first = render(<StrictMode><MemoryRouter><AssignmentList embeddedCourse={course}/></MemoryRouter></StrictMode>)
    fireEvent.click(await screen.findByRole('button', { name: '查看提交' }))
    first.unmount()
    render(<StrictMode><MemoryRouter><AssignmentList embeddedCourse={course}/></MemoryRouter></StrictMode>)
    fireEvent.click(await screen.findByRole('button', { name: '查看提交' }))
    expect(await screen.findByText('暂无提交')).toBeInTheDocument()
    await act(async () => old.resolve({ code: 0, data: { list: [{ id: 'stale', status: 'SUBMITTED', student: { username: '卸载前学生' }, submittedAt: '2026-10-01' }] } }))
    expect(screen.queryByText('卸载前学生')).not.toBeInTheDocument()
    expect(screen.getByText('暂无提交')).toBeInTheDocument()
    expect(calls).toBe(2)
  })

})
