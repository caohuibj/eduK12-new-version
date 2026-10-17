import { act, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { MemoryRouter, Route, Routes, useNavigate } from 'react-router-dom'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const { get, auth } = vi.hoisted(() => ({ get: vi.fn(), auth: { id: 'trainer', role: 'TEACHER' } }))
vi.mock('../../api/client', () => ({ default: { get }, sessionFetch: vi.fn() }))
vi.mock('../../contexts/AuthContext', () => ({ useAuth: () => ({ user: auth }) }))
vi.mock('../../components/RichTextEditor', () => ({ default: () => null }))
vi.mock('../../components/QuestionEditor', () => ({ default: () => null }))
vi.mock('../../components/MediaSelector', () => ({ default: () => null }))
vi.mock('../../components/CheckinTokenManager', () => ({ default: () => null }))
import AssignmentList from '../AssignmentList'
import CheckinList from '../CheckinList'
import TrainingContextBack from '../../training/TrainingContextBack'

let navigate: ReturnType<typeof useNavigate>
function Navigation() { navigate = useNavigate(); return null }
const course = { id: 'course-old', title: '较早的课程', creatorId: 'trainer', courseCode: 'OLD123' }
const record = (id: string, title: string) => ({
  id, title, courseId: course.id, course, creatorId: 'trainer', status: 'PUBLISHED',
  tags: ['保留的标签'], _count: { submissions: 7 }, createdAt: '2024-01-01', updatedAt: '2024-01-01',
})
function deferred() {
  let resolve!: (value: unknown) => void
  const promise = new Promise(done => { resolve = done })
  return { promise, resolve }
}
function mount(path: string) {
  return render(<MemoryRouter initialEntries={[path]}><Navigation /><TrainingContextBack role="TEACHER" /><Routes>
    <Route path="/assignments" element={<AssignmentList />} />
    <Route path="/checkins" element={<CheckinList />} />
  </Routes></MemoryRouter>)
}

beforeEach(() => {
  get.mockReset()
  auth.id = 'trainer'; auth.role = 'TEACHER'
  Object.defineProperty(HTMLElement.prototype, 'scrollIntoView', { configurable: true, value: vi.fn() })
})

// Before this fix both pages read only GET /<kind> (default page size 20)
// and scroll to an already-rendered DOM id. These tests deliberately put the
// requested record outside that list and require its existing detail API.
describe.each([
  { path: 'assignments', label: '作业', count: '7 份提交' },
  { path: 'checkins', label: '打卡', count: '7 人参与' },
])('Training $label deep links', ({ path, label, count }) => {
  const legacyDetail = '/' + path + '/old-21'
  const detail = legacyDetail + '?courseId=course-old'
  const url = '/' + path + '?id=old-21&courseId=course-old'
  const fallback = (request: string) => ({ code: 0, data: request.endsWith('/tags') ? { tags: [] } : { list: [] } })

  it('loads an older authorized record on direct entry, retains course return/edit context, and never scans list pages', async () => {
    get.mockImplementation(async (request: string) => {
      if (request === detail) return { code: 0, data: record('old-21', '第 21 项任务') }
      if (request === '/' + path) return { code: 0, data: { list: Array.from({ length: 20 }, (_, index) => record('recent-' + index, '新任务 ' + index)) } }
      return fallback(request)
    })
    mount(url)
    const title = await screen.findByRole('button', { name: '第 21 项任务' })
    expect(title.closest('tr')).toHaveFocus()
    expect(screen.getByRole('button', { name: count })).toBeInTheDocument()
    expect(screen.getByRole('link', { name: /返回当前课程/ })).toHaveAttribute('href', '/courses/course-old/detail')
    expect(get.mock.calls.filter(([request]) => request.startsWith('/' + path) && !request.endsWith('/tags'))).toEqual([[detail]])
    fireEvent.click(title)
    expect(screen.getByLabelText('选择课程 *')).toHaveValue('course-old')
    expect(screen.getByLabelText('选择课程 *')).toHaveTextContent('较早的课程')
    expect(screen.getAllByText('保留的标签').length).toBeGreaterThan(0)
  })

  it('keeps existing id-only links working through the same authorized detail API', async () => {
    get.mockImplementation(async (request: string) => request === legacyDetail ? { code: 0, data: record('old-21', '兼容入口') } : fallback(request))
    mount('/' + path + '?id=old-21')
    expect(await screen.findByRole('button', { name: '兼容入口' })).toBeInTheDocument()
    expect(get).toHaveBeenCalledWith(legacyDetail)
    expect(get).not.toHaveBeenCalledWith('/' + path)
  })

  it.each([
    ['wrong course', { courseId: 'other-course', course: { ...course, id: 'other-course' } }],
    ['shared read-only course', { course: { ...course, creatorId: 'other-trainer' } }],
    ['wrong response identity', { id: 'another-record' }],
    ['missing course identity', { course: { ...course, id: undefined } }],
  ])('rejects %s without exposing record content or actions', async (_reason, fields) => {
    get.mockImplementation(async (request: string) => request === detail ? { code: 0, data: { ...record('old-21', '不得显示的任务'), ...fields } } : fallback(request))
    mount(url)
    expect(await screen.findByText(label + '列表加载失败')).toBeInTheDocument()
    expect(screen.queryByText('不得显示的任务')).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: '查看提交' })).not.toBeInTheDocument()
    expect(screen.queryByText('暂无匹配' + label)).not.toBeInTheDocument()
  })

  it('clears an open editor and previous record immediately when the new route is forbidden', async () => {
    const denied = deferred()
    get.mockImplementation((request: string) => request === detail ? Promise.resolve({ code: 0, data: record('old-21', '旧任务内容') })
      : request === '/' + path + '/denied?courseId=course-old' ? denied.promise : Promise.resolve(fallback(request)))
    mount(url)
    fireEvent.click(await screen.findByRole('button', { name: '旧任务内容' }))
    expect(screen.getByRole('dialog')).toBeInTheDocument()
    act(() => { navigate('/' + path + '?id=denied&courseId=course-old') })
    expect(screen.queryByText('旧任务内容')).not.toBeInTheDocument()
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
    await act(async () => { denied.resolve({ code: 403, message: '无权限' }) })
    expect(await screen.findByText('无权限')).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: '查看提交' })).not.toBeInTheDocument()
  })

  it('ignores out-of-order detail responses after navigation, including a newer denial', async () => {
    const old = deferred()
    get.mockImplementation((request: string) => request === detail ? old.promise
      : Promise.resolve(request === '/' + path + '/denied?courseId=course-old' ? { code: 403, message: '新任务无权限' } : fallback(request)))
    mount(url)
    await waitFor(() => expect(get).toHaveBeenCalledWith(detail))
    act(() => { navigate('/' + path + '?id=denied&courseId=course-old') })
    expect(await screen.findByText('新任务无权限')).toBeInTheDocument()
    await act(async () => { old.resolve({ code: 0, data: record('old-21', '迟到的旧任务') }) })
    expect(screen.getByText('新任务无权限')).toBeInTheDocument()
    expect(screen.queryByText('迟到的旧任务')).not.toBeInTheDocument()
  })

  it('retries a failed detail read rather than falling back to the first list page', async () => {
    let denied = true
    get.mockImplementation(async (request: string) => request === detail ? denied ? { code: 403, message: '暂不可读' } : { code: 0, data: record('old-21', '重新授权的任务') } : fallback(request))
    mount(url)
    await screen.findByText('暂不可读')
    denied = false
    fireEvent.click(screen.getByRole('button', { name: '重试' }))
    expect(await screen.findByRole('button', { name: '重新授权的任务' })).toBeInTheDocument()
    expect(get.mock.calls.filter(([request]) => request === detail)).toHaveLength(2)
    expect(get).not.toHaveBeenCalledWith('/' + path)
  })

  it('scopes a course-only list to the requested course', async () => {
    get.mockImplementation(async (request: string) => fallback(request))
    mount('/' + path + '?courseId=course-old')
    await screen.findByText('暂无匹配' + label)
    expect(get).toHaveBeenCalledWith('/' + path + '?courseId=course-old')
    expect(get).not.toHaveBeenCalledWith('/' + path)
  })
})
