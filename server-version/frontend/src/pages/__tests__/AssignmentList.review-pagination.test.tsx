import { act, cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import type { Course } from '../../types'
const api = vi.hoisted(() => ({ get: vi.fn(), post: vi.fn(), sessionFetch: vi.fn() }))
vi.mock('../../api/client', () => ({ default: api, sessionFetch: api.sessionFetch }))
vi.mock('../../contexts/AuthContext', () => ({ useAuth: () => ({ user: { id: 'teacher', role: 'TEACHER' } }) }))
vi.mock('../../components/RichTextEditor', () => ({ default: () => null }))
vi.mock('../../components/QuestionEditor', () => ({ default: () => null }))
vi.mock('../../components/MediaSelector', () => ({ default: () => null }))
import AssignmentList from '../AssignmentList'
const course = { id: 'course', title: '课程', creatorId: 'teacher' } as Course
const task = { id: 'task', title: '练习', courseId: 'course', course, status: 'PUBLISHED', questions: [], _count: { submissions: 51 } }
const submission = (id: string) => ({ id, revision: 2, studentId: id, student: { id, username: id }, status: 'SUBMITTED', submittedAt: '2026-10-01T00:00:00.000Z' })
const page = (id = 'first', nextCursor: string | null = 'next') => ({ list: [submission(id)], total: 51, gradedCount: 1, ungradedCount: 50, nextCursor })
const snapshot = { selectionId: 'frozen', count: 50, expiresAt: '2026-10-01T00:15:00Z', chunks: ['chunk0', 'chunk1'] }
async function openReview() {
  render(<MemoryRouter><AssignmentList embeddedCourse={course}/></MemoryRouter>)
  fireEvent.click(await screen.findByRole('button', { name: '查看提交' }))
  await screen.findByText('first')
}
beforeEach(() => {
  vi.resetAllMocks()
  api.get.mockImplementation(async (url: string) => ({ code: 0, data: url.includes('/submissions') ? page(url.includes('?') ? 'second' : 'first', url.includes('?') ? null : 'next') : url.endsWith('/tags') ? { tags: [] } : { list: [task], total: 1 } }))
  api.post.mockImplementation(async (url: string, body: any) => ({ code: 0, data: url.endsWith('review-selection') ? body.scope === 'page' ? { ...snapshot, count: 1, chunks: ['page-proof'] } : snapshot : { gradedCount: 25, skippedCount: 0 } }))
})
afterEach(cleanup)
it('shows exact assignment totals separately from current-page count and supports keyset next/back', async () => {
  await openReview()
  expect(screen.getByText('共 51 份提交')).toBeInTheDocument()
  expect(screen.getByText('50 待批改')).toBeInTheDocument()
  expect(screen.getByText('第 1 页 · 本页 1 份')).toBeInTheDocument()
  fireEvent.click(within(screen.getByRole('dialog', { name: '练习提交列表' })).getByRole('button', { name: '下一页' }))
  await screen.findByText('second')
  expect(api.get).toHaveBeenCalledWith('/assignments/task/submissions?cursor=next')
  expect(within(screen.getByRole('dialog', { name: '练习提交列表' })).getByRole('button', { name: '下一页' })).toBeDisabled()
  fireEvent.click(within(screen.getByRole('dialog', { name: '练习提交列表' })).getByRole('button', { name: '上一页' }))
  await screen.findByText('first')
})
it('defaults to this page and sends observed revisions, not one grade request per student', async () => {
  await openReview(); fireEvent.click(screen.getByRole('button', { name: '一键批量批复' }))
  const dialog = screen.getByRole('dialog', { name: '一键批量批复' })
  expect(within(dialog).getByText('本页待批改练习 (1)')).toBeInTheDocument()
  expect(within(dialog).getByRole('button', { name: '取消本页全选' })).toBeInTheDocument()
  fireEvent.click(within(dialog).getByRole('button', { name: '确认批复 (1份)' }))
  await waitFor(() => expect(api.post).toHaveBeenCalledWith('/assignments/task/review-selection', { scope: 'page', items: [{ id: 'first', revision: 2 }] }))
  await waitFor(() => expect(api.post).toHaveBeenCalledWith('/assignments/task/batch-grade', expect.objectContaining({ selectionToken: 'page-proof' })))
  expect(api.post.mock.calls.some(([url]) => url.includes('/submissions/'))).toBe(false)
})
it('releases a completed batch before refreshing so a reopened dialog can select the next batch', async () => {
  await openReview()
  fireEvent.click(screen.getByRole('button', { name: '一键批量批复' }))
  fireEvent.click(screen.getByRole('button', { name: '确认批复 (1份)' }))
  await waitFor(() => expect(screen.queryByRole('dialog', { name: '一键批量批复' })).not.toBeInTheDocument())
  await waitFor(() => expect(api.get.mock.calls.filter(([url]) => url === '/assignments/task/submissions')).toHaveLength(2))
  fireEvent.click(screen.getByRole('button', { name: '一键批量批复' }))
  const dialog = screen.getByRole('dialog', { name: '一键批量批复' })
  const all = within(dialog).getByRole('button', { name: '选择全部未批改' })
  expect(all).toBeEnabled()
  expect(within(dialog).getByRole('button', { name: '确认批复 (1份)' })).toBeEnabled()
  fireEvent.click(all)
  await within(dialog).findByText('已冻结选择 50 份；批改时跳过已变化或已处理记录。')
  expect(api.post).toHaveBeenCalledWith('/assignments/task/review-selection', { scope: 'all-ungraded' })
})
it('explicit all-ungraded selection uses frozen count and retries only the failed chunk', async () => {
  let failed = false
  api.post.mockImplementation(async (url: string, body: any) => {
    if (url.endsWith('review-selection')) return { code: 0, data: snapshot }
    if (body.selectionToken === 'chunk1' && !failed) { failed = true; throw new Error('synthetic failure') }
    return { code: 0, data: { gradedCount: 25, skippedCount: 0 } }
  })
  await openReview(); fireEvent.click(screen.getByRole('button', { name: '一键批量批复' }))
  fireEvent.click(screen.getByRole('button', { name: '选择全部未批改' }))
  await screen.findByText('已冻结选择 50 份；批改时跳过已变化或已处理记录。')
  fireEvent.click(screen.getByRole('button', { name: '确认批复 (50份)' }))
  await waitFor(() => expect(api.post.mock.calls.filter(([url]) => url.endsWith('batch-grade'))).toHaveLength(2))
  await waitFor(() => expect(screen.getByRole('button', { name: '确认批复 (50份)' })).toBeEnabled())
  fireEvent.click(screen.getByRole('button', { name: '确认批复 (50份)' }))
  await waitFor(() => expect(api.post.mock.calls.filter(([url]) => url.endsWith('batch-grade'))).toHaveLength(3))
  expect(api.post.mock.calls.filter(([url]) => url.endsWith('batch-grade')).map(([, body]) => body.selectionToken)).toEqual(['chunk0', 'chunk1', 'chunk1'])
  expect(api.post.mock.calls.filter(([url]) => url.endsWith('review-selection'))).toHaveLength(1)
})
it('does not pretend all is selected on over-limit errors', async () => {
  api.post.mockResolvedValue({ code: -1, message: '全部选择最多支持 5000 份' })
  await openReview(); fireEvent.click(screen.getByRole('button', { name: '一键批量批复' }))
  fireEvent.click(screen.getByRole('button', { name: '选择全部未批改' }))
  await waitFor(() => expect(screen.getByRole('button', { name: '选择全部未批改' })).toBeEnabled())
  expect(screen.getByRole('button', { name: '确认批复 (1份)' })).toBeInTheDocument()
  expect(screen.queryByText(/已冻结选择/)).not.toBeInTheDocument()
})

it('retries the failed next-page cursor instead of silently returning to page one', async () => {
  let fail = true
  api.get.mockImplementation(async (url: string) => {
    if (url.includes('/submissions?') && fail) return { code: -1, message: '下一页暂不可用' }
    return { code: 0, data: url.includes('/submissions') ? page(url.includes('?') ? 'second' : 'first') : { list: [task], total: 1 } }
  })
  await openReview()
  fireEvent.click(within(screen.getByRole('dialog', { name: '练习提交列表' })).getByRole('button', { name: '下一页' }))
  await screen.findByText('下一页暂不可用')
  fail = false
  fireEvent.click(screen.getByRole('button', { name: '重试提交列表' }))
  await screen.findByText('second')
  expect(api.get.mock.calls.filter(([url]) => url === '/assignments/task/submissions?cursor=next')).toHaveLength(2)
})
it('stops dispatching chunks when the review workspace unmounts', async () => {
  let resolveChunk!: (value: unknown) => void
  const pending = new Promise(resolve => { resolveChunk = resolve })
  let first = true
  api.post.mockImplementation(async (url: string, body: any) => {
    if (url.endsWith('review-selection')) return { code: 0, data: snapshot }
    if (body.selectionToken === 'chunk0' && first) { first = false; return pending }
    return { code: 0, data: { gradedCount: body.selectionToken === 'chunk0' ? 0 : 25, skippedCount: body.selectionToken === 'chunk0' ? 25 : 0 } }
  })
  const view = render(<MemoryRouter><AssignmentList embeddedCourse={course}/></MemoryRouter>)
  fireEvent.click(await screen.findByRole('button', { name: '查看提交' }))
  await screen.findByText('first')
  fireEvent.click(screen.getByRole('button', { name: '一键批量批复' }))
  fireEvent.click(screen.getByRole('button', { name: '选择全部未批改' }))
  await screen.findByText('已冻结选择 50 份；批改时跳过已变化或已处理记录。')
  fireEvent.click(screen.getByRole('button', { name: '确认批复 (50份)' }))
  await waitFor(() => expect(api.post.mock.calls.filter(([url]) => url.endsWith('batch-grade'))).toHaveLength(1))
  view.unmount()
  await act(async () => resolveChunk({ code: 0, data: { gradedCount: 25, skippedCount: 0 } }))
  expect(api.post.mock.calls.filter(([url]) => url.endsWith('batch-grade'))).toHaveLength(1)

})
it('retains the comment when a proof expires and permits a fresh selection', async () => {
  let selected = 0
  api.post.mockImplementation(async (url: string) => url.endsWith('review-selection')
    ? { code: 0, data: { ...snapshot, selectionId: String(++selected) } }
    : { code: -1, message: '选择已失效，请重新选择' })
  await openReview(); fireEvent.click(screen.getByRole('button', { name: '一键批量批复' }))
  fireEvent.change(screen.getByPlaceholderText('请输入评语...'), { target: { value: '保留这条评语' } })
  fireEvent.click(screen.getByRole('button', { name: '选择全部未批改' }))
  fireEvent.click(await screen.findByRole('button', { name: '确认批复 (50份)' }))
  await waitFor(() => expect(screen.getByRole('button', { name: '确认批复 (50份)' })).toBeEnabled())
  expect(screen.getByPlaceholderText('请输入评语...')).toHaveValue('保留这条评语')
  fireEvent.click(screen.getByRole('button', { name: '选择全部未批改' }))
  await waitFor(() => expect(selected).toBe(2))
  expect(screen.getByPlaceholderText('请输入评语...')).toHaveValue('保留这条评语')
})
