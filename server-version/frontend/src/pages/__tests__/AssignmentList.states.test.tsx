import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router-dom'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const { get, post } = vi.hoisted(() => ({ get: vi.fn(), post: vi.fn() }))
vi.mock('../../api/client', () => ({ default: { get, post }, sessionFetch: vi.fn() }))
vi.mock('../../contexts/AuthContext', () => ({ useAuth: () => ({ user: { id: 'teacher-1', role: 'TEACHER' } }) }))
vi.mock('../../components/RichTextEditor', () => ({ default: () => null }))
vi.mock('../../components/QuestionEditor', () => ({ default: () => null }))
vi.mock('../../components/MediaSelector', () => ({ default: () => null }))
import AssignmentList from '../AssignmentList'

describe('AssignmentList states', () => {
  beforeEach(() => { get.mockReset(); post.mockReset(); Object.defineProperty(HTMLElement.prototype, 'scrollIntoView', { configurable: true, value: vi.fn() }) })
  it('keeps failed reads distinct from empty records and retries the same list request', async () => {
    let failed = true
    get.mockImplementation(async (url: string) => url.startsWith('/assignments?view=summary&') && failed
      ? { code: 1, message: 'Offline' }
      : { code: 0, data: url.endsWith('/tags') ? { tags: [] } : { list: [] } })
    const user = userEvent.setup()
    render(<MemoryRouter><AssignmentList /></MemoryRouter>)
    expect(await screen.findByText('练习列表加载失败')).toBeInTheDocument()
    expect(screen.queryByText('暂无匹配练习')).not.toBeInTheDocument()
    expect(screen.queryByText('共 0 个练习')).not.toBeInTheDocument()
    failed = false
    await user.click(screen.getByRole('button', { name: '重试' }))
    expect(await screen.findByText('暂无匹配练习')).toBeInTheDocument()
    expect(get.mock.calls.filter(([url]) => url.startsWith('/assignments?view=summary&'))).toHaveLength(2)
  })
  it('opens course-initiated creation with the permitted course already selected', async () => {
    get.mockImplementation(async (url: string) => ({ code: 0, data: url === '/courses' ? { list: [{ id: 'course', title: '当前课程' }] } : url.endsWith('/tags') ? { tags: [] } : { list: [] } }))
    render(<MemoryRouter initialEntries={['/assignments?create=true&courseId=course']}><AssignmentList /></MemoryRouter>)
    expect(await screen.findByRole('dialog')).toBeInTheDocument()
    expect(screen.getByLabelText('选择课程 *')).toHaveValue('course')
  })

  it('shows the course list after creating from an older assignment deep link', async () => {
    const course = { id: 'course', title: '当前课程', creatorId: 'teacher-1' }
    const previous = { id: 'old', title: '任务 1', courseId: course.id, course }
    const created = { id: 'new', title: '任务 2', courseId: course.id, course }
    get.mockImplementation(async (url: string) => ({ code: 0, data:
      url === '/assignments/old?courseId=course' ? previous
        : url === '/courses' ? { list: [course] }
          : url.endsWith('/tags') ? { tags: [] } : { list: [created, previous] },
    }))
    post.mockResolvedValue({ code: 0, data: created })
    const user = userEvent.setup()
    render(<MemoryRouter initialEntries={['/assignments?id=old&courseId=course']}><AssignmentList /></MemoryRouter>)
    await screen.findByRole('button', { name: '任务 1' })
    await user.click(screen.getByRole('button', { name: '布置练习' }))
    await user.selectOptions(screen.getByLabelText('选择课程 *'), course.id)
    await user.type(screen.getByLabelText('练习标题 *'), created.title)
    await user.click(screen.getByRole('button', { name: '创建练习' }))
    await waitFor(() => expect(post).toHaveBeenCalledWith('/assignments', expect.objectContaining({ courseId: 'course', title: '任务 2' })))
    expect(await screen.findByRole('button', { name: '任务 2' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: '任务 1' })).toBeInTheDocument()
    expect(get.mock.calls.filter(([url]) => url === '/assignments/old?courseId=course')).toHaveLength(1)
    expect(get).toHaveBeenCalledWith(expect.stringContaining('/assignments?view=summary&'))
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
  })

  it('refreshes the same course and clears an old search after a successful create', async () => {
    const course = { id: 'course', title: '当前课程', creatorId: 'teacher-1' }
    const previous = { id: 'old', title: '旧练习', courseId: course.id, course }
    const created = { id: 'new', title: '新练习', courseId: course.id, course }
    let saved = false
    get.mockImplementation(async (url: string) => ({ code: 0, data:
      url === '/courses' ? { list: [course] }
        : url.endsWith('/tags') ? { tags: [] } : { list: saved ? [created, previous] : [previous] },
    }))
    post.mockImplementation(async () => { saved = true; return { code: 0, data: created } })
    const user = userEvent.setup()
    render(<MemoryRouter initialEntries={['/assignments?courseId=course']}><AssignmentList /></MemoryRouter>)
    await screen.findByRole('button', { name: '旧练习' })
    await user.click(screen.getByText('检索与筛选'))
    await user.type(screen.getByRole('searchbox', { name: '搜索练习' }), '旧练习')
    await user.click(screen.getByRole('button', { name: '布置练习' }))
    await user.selectOptions(screen.getByLabelText('选择课程 *'), course.id)
    await user.type(screen.getByLabelText('练习标题 *'), created.title)
    await user.click(screen.getByRole('button', { name: '创建练习' }))
    expect(await screen.findByRole('button', { name: '新练习' })).toBeInTheDocument()
    await user.click(screen.getByText('检索与筛选'))
    expect(screen.getByRole('searchbox', { name: '搜索练习' })).toHaveValue('')
    expect(get.mock.calls.filter(([url]) => url.startsWith('/assignments?view=summary&'))).toHaveLength(2)
    expect(post).toHaveBeenCalledTimes(1)
  })

})
