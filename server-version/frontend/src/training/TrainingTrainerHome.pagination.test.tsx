vi.mock('./TrainingTrainerOverview', () => ({ default: () => null }))
import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({ get: vi.fn(), post: vi.fn() }))
vi.mock('../api/client', () => ({ default: mocks }))
vi.mock('../contexts/AuthContext', () => ({ useAuth: () => ({ user: { id: 'trainer' } }) }))
vi.mock('./FormalReferenceStudio', () => ({ default: () => null }))
import TrainingTrainerHome from './TrainingTrainerHome'

const courses = Array.from({ length: 13 }, (_, index) => ({
  id: 'course-' + index, title: `研修课程${index + 1}`, description: `课程介绍${index + 1}`,
  courseCode: 'CODE' + index, status: ['DRAFT', 'PUBLISHED', 'COMPLETED'][index % 3],
  studentCount: index, createdAt: '2026-10-21T01:00:00Z', isLibrary: false,
}))
function pageResponse(path: string) {
  const params = new URL(path, 'http://localhost').searchParams
  const size = Number(params.get('pageSize'))
  const start = (Number(params.get('page')) - 1) * size
  const filtered = courses.filter(course => params.get('status') === 'all' || course.status === params.get('status'))
  return { code: 0, data: { list: filtered.slice(start, start + size), total: filtered.length } }
}
const show = () => render(<MemoryRouter><TrainingTrainerHome /></MemoryRouter>)
beforeEach(() => {
  vi.resetAllMocks()
  localStorage.clear()
  mocks.get.mockImplementation(async path => pageResponse(path))
  mocks.post.mockResolvedValue({ code: 0 })
})
afterEach(() => vi.restoreAllMocks())

it.each([12, 24])('restores %i cards per page after remounting', async size => {
  const view = show()
  await screen.findByRole('heading', { name: '研修课程1' })
  fireEvent.change(screen.getByRole('combobox', { name: '每页课程数' }), { target: { value: String(size) } })
  await waitFor(() => expect(screen.getAllByRole('article')).toHaveLength(Math.min(size, courses.length)))
  view.unmount()
  mocks.get.mockClear()
  show()
  await screen.findByRole('heading', { name: '研修课程1' })
  expect(screen.getByRole('combobox', { name: '每页课程数' })).toHaveValue(String(size))
  expect(screen.getAllByRole('article')).toHaveLength(Math.min(size, courses.length))
  expect(mocks.get).toHaveBeenCalledExactlyOnceWith(`/courses?status=all&page=1&pageSize=${size}&excludeLibrary=true`)
})

it('falls back to six cards when the stored preference is invalid', async () => {
  localStorage.setItem('training:trainer-courses:page-size', '999')
  show()
  await screen.findByRole('heading', { name: '研修课程1' })
  expect(screen.getByRole('combobox', { name: '每页课程数' })).toHaveValue('6')
  expect(screen.getAllByRole('article')).toHaveLength(6)
})

it('keeps paging usable when browser storage is blocked', async () => {
  vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => { throw new Error('blocked') })
  vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => { throw new Error('blocked') })
  show()
  await screen.findByRole('heading', { name: '研修课程1' })
  fireEvent.change(screen.getByRole('combobox', { name: '每页课程数' }), { target: { value: '6' } })
  await waitFor(() => expect(screen.getAllByRole('article')).toHaveLength(6))
  expect(screen.getByRole('combobox', { name: '每页课程数' })).toHaveValue('6')
})

it.each([12, 24])('resets to the first page when selecting %i cards per page', async size => {
  show()
  fireEvent.click(await screen.findByRole('button', { name: '下一页' }))
  await screen.findByRole('heading', { name: '研修课程7' })
  fireEvent.change(screen.getByRole('combobox', { name: '每页课程数' }), { target: { value: String(size) } })
  await screen.findByRole('heading', { name: '研修课程1' })
  expect(screen.getAllByRole('article')).toHaveLength(Math.min(size, courses.length))
  expect(mocks.get).toHaveBeenLastCalledWith(`/courses?status=all&page=1&pageSize=${size}&excludeLibrary=true`)
  expect(screen.getByRole('button', { name: '上一页' })).toBeDisabled()
})

it.each([['已发布', 'PUBLISHED'], ['已完结', 'COMPLETED']])('filters %s courses and returns to page one', async (label, status) => {
  show()
  fireEvent.click(await screen.findByRole('button', { name: '下一页' }))
  expect(screen.queryByRole('button', { name: '草稿' })).not.toBeInTheDocument()
  await screen.findByRole('heading', { name: '研修课程7' })
  fireEvent.click(screen.getByRole('button', { name: label }))
  await waitFor(() => expect(mocks.get).toHaveBeenLastCalledWith(`/courses?status=${status}&page=1&pageSize=6&excludeLibrary=true`))
  await screen.findByRole('navigation', { name: '课程分页' })
  expect(screen.getAllByRole('article')).toHaveLength(courses.filter(course => course.status === status).length)
  expect(screen.getByRole('button', { name: '上一页' })).toBeDisabled()
  for (const card of screen.getAllByRole('article')) expect(within(card).getByText(label)).toBeInTheDocument()
})

it('ignores a late response from an earlier status filter', async () => {
  let finishCompleted!: (value: ReturnType<typeof pageResponse>) => void
  mocks.get.mockImplementation((path: string) => path.includes('status=COMPLETED')
    ? new Promise(resolve => { finishCompleted = resolve }) : Promise.resolve(pageResponse(path)))
  show()
  await screen.findByRole('heading', { name: '研修课程1' })
  fireEvent.click(screen.getByRole('button', { name: '已完结' }))
  fireEvent.click(screen.getByRole('button', { name: '已发布' }))
  await screen.findByRole('heading', { name: '研修课程2' })
  await act(async () => finishCompleted(pageResponse('/courses?status=COMPLETED&page=1&pageSize=6')))
  expect(screen.queryByRole('heading', { name: '研修课程1' })).not.toBeInTheDocument()
  expect(screen.getByRole('button', { name: '已发布' })).toHaveAttribute('aria-pressed', 'true')
})

it('keeps the complete introduction available on hover and on explicit expansion', async () => {
  const introduction = '完整课程介绍。'.repeat(40)
  mocks.get.mockResolvedValue({ code: 0, data: { list: [{ ...courses[0], description: introduction }], total: 1 } })
  vi.spyOn(HTMLElement.prototype, 'scrollHeight', 'get').mockReturnValue(150)
  vi.spyOn(HTMLElement.prototype, 'clientHeight', 'get').mockReturnValue(50)
  show()
  const expand = await screen.findByRole('button', { name: '显示更多' })
  const description = screen.getByTitle(introduction)
  expect(description).toHaveTextContent(introduction)
  fireEvent.click(expand)
  const collapse = screen.getByRole('button', { name: '收起' })
  expect(collapse).toHaveAttribute('aria-expanded', 'true')
  expect(description).toHaveClass('is-expanded')
  fireEvent.click(collapse)
  expect(screen.getByRole('button', { name: '显示更多' })).toHaveAttribute('aria-expanded', 'false')
  expect(description).not.toHaveClass('is-expanded')
})

it('distinguishes a filtered empty list from having no courses', async () => {
  mocks.get.mockResolvedValue({ code: 0, data: { list: [], total: 0 } })
  show()
  await screen.findByText('还没有创建课程。')
  fireEvent.click(screen.getByRole('button', { name: '已完结' }))
  await screen.findByText('暂无已完结的课程。')
  expect(screen.queryByRole('button', { name: '创建第一门课程 →' })).not.toBeInTheDocument()
  fireEvent.click(screen.getByRole('button', { name: '查看全部课程' }))
  await screen.findByText('还没有创建课程。')
})
