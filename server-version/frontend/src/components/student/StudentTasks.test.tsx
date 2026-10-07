import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router-dom'
import { beforeEach, describe, expect, it, vi } from 'vitest'
const { get } = vi.hoisted(() => ({ get: vi.fn() }))
vi.mock('../../api/client', () => ({ default: { get } }))
import StudentTasks, { TaskPage } from './StudentTasks'
const data: TaskPage = { list: [{ id: 'a', kind: 'ASSIGNMENT', title: '实验报告', courses: [{ id: 'c', title: '化学' }], state: 'IN_PROGRESS', deadline: null, opensAt: null, canContinue: true, canStart: false, href: '/student/assignments/a' }],
  total: 21, page: 1, pageSize: 20, generatedAt: '2026-09-30T00:00:00Z', counts: { PENDING: 20, IN_PROGRESS: 1, UPCOMING: 0, EXPIRED: 0, COMPLETED: 0, UNAVAILABLE: 0 } }
beforeEach(() => { get.mockReset() })
describe('student task aggregation UI', () => {
  it('uses one aggregate request, paginates and resets the page when filtering', async () => {
    get.mockResolvedValue({ code: 0, data })
    const user = userEvent.setup()
    render(<MemoryRouter><StudentTasks /></MemoryRouter>)
    expect(await screen.findByRole('link', { name: '继续实验报告' })).toHaveAttribute('href', '/student/assignments/a')
    expect(get).toHaveBeenCalledTimes(1)
    expect(get).toHaveBeenLastCalledWith('/courses/my/tasks?page=1&pageSize=20&state=ACTIONABLE')
    await user.click(screen.getByText('下一页'))
    await waitFor(() => expect(get).toHaveBeenLastCalledWith('/courses/my/tasks?page=2&pageSize=20&state=ACTIONABLE'))
    await user.selectOptions(screen.getByLabelText('任务状态'), 'EXPIRED')
    await waitFor(() => expect(get).toHaveBeenLastCalledWith('/courses/my/tasks?page=1&pageSize=20&state=EXPIRED'))
    expect(get.mock.calls.every(([url]) => String(url).startsWith('/courses/my/tasks?'))).toBe(true)
  })
  it('shows retry on failure without presenting old results as current or an empty success', async () => {
    get.mockRejectedValueOnce({ message: '服务暂时不可用' }).mockResolvedValueOnce({ code: 0, data })
    const user = userEvent.setup()
    render(<MemoryRouter><StudentTasks /></MemoryRouter>)
    expect(await screen.findByText('待办加载失败')).toBeInTheDocument()
    expect(screen.getByText('服务暂时不可用')).toBeInTheDocument()
    expect(screen.queryByText('当前没有此类任务')).toBeNull()
    await user.click(screen.getByText('重试待办'))
    expect(await screen.findByText('实验报告')).toBeInTheDocument()
  })
  it('ignores late responses from a previous filter', async () => {
    let resolve!: (value: unknown) => void
    get.mockImplementationOnce(() => new Promise(done => { resolve = done })).mockResolvedValue({ code: 0, data: { ...data, list: [], total: 0 } })
    const user = userEvent.setup()
    render(<MemoryRouter><StudentTasks /></MemoryRouter>)
    await user.selectOptions(screen.getByLabelText('任务状态'), 'COMPLETED')
    expect(await screen.findByText('当前没有此类任务')).toBeInTheDocument()
    resolve({ code: 0, data })
    await waitFor(() => expect(screen.queryByText('实验报告')).toBeNull())
  })
})
