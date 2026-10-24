import type { ReactNode } from 'react'
vi.mock('./TrainingLearningOverview', () => ({ default: ({ courseHeading, courseAction }: { courseHeading?: ReactNode; courseAction?: ReactNode }) => <>{courseHeading}{courseAction}</> }))
vi.mock('./TrainingTrainerOverview', () => ({ default: () => null }))
import { render, screen, fireEvent, within } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const { get, post } = vi.hoisted(() => ({ get: vi.fn(), post: vi.fn() }))
vi.mock('../api/client', () => ({ default: { get, post } }))
vi.mock('../contexts/AuthContext', () => ({
  useAuth: () => ({ user: { id: 'training-user', role: 'STUDENT', nickname: '小李' } }),
}))

import TrainingPortal from './TrainingPortal'
import TrainingLearnerHome from './TrainingLearnerHome'
import TrainingTrainerHome from './TrainingTrainerHome'

const course = { id: 'course-1', title: '成长研修', description: '每周一课', isLibrary: false }

beforeEach(() => {
  vi.spyOn(window, 'scrollTo').mockImplementation(() => {})
  get.mockReset()
  post.mockReset()
  get.mockResolvedValue({ code: 0, data: { list: [course] } })
  post.mockResolvedValue({ code: 0, data: {} })
})

describe('training presentation and course-first entry', () => {
  it('presents unified login and registration and preserves safe return links', () => {
    render(<MemoryRouter initialEntries={['/?returnTo=%2Fstudent%2Fcourses%2Fcourse-1']}><TrainingPortal /></MemoryRouter>)
    expect(screen.getByRole('link', { name: '登录' })).toHaveAttribute('href', '/login?returnTo=%2Fstudent%2Fcourses%2Fcourse-1')
    expect(screen.getByRole('link', { name: '注册' })).toHaveAttribute('href', '/register?returnTo=%2Fstudent%2Fcourses%2Fcourse-1')
    expect(screen.getByRole('navigation', { name: 'Training 入口导航' })).toBeInTheDocument()
    expect(screen.getByRole('link', { name: '联系我们' })).toHaveAttribute('href', '/contact')
    expect(screen.queryByRole('navigation', { name: '培训账号入口' })).toBeNull()
    expect(screen.queryByText('登录账号')).toBeNull()
    expect(screen.queryByText('注册账号')).toBeNull()
    expect(screen.getByRole('heading', { name: /以学习为径，.*见更远的天地。/ })).toBeInTheDocument()
    expect(screen.getByRole('img', { name: 'Training @EduK12.top' })).toBeInTheDocument()
    expect(screen.queryByText('我是学员')).toBeNull()
    expect(screen.queryByText('我是培训师')).toBeNull()
    const adminEntry = screen.getByRole('link', { name: 'Training 管理员入口' })
    expect(screen.getByRole('navigation', { name: 'Training 页脚导航' })).toContainElement(adminEntry)
    const adminUrl = new URL(adminEntry.getAttribute('href')!)
    expect(adminUrl.hostname).toBe('localhost')
    expect(adminUrl.pathname).toBe('/admin/login')
    expect(adminUrl.searchParams.get('returnTo')).toBe('/admin/training')
  })

  it('does not carry an external return link into either entrance', () => {
    render(<MemoryRouter initialEntries={['/?returnTo=https%3A%2F%2Fexample.invalid']}><TrainingPortal /></MemoryRouter>)
    expect(screen.getByRole('link', { name: '登录' })).toHaveAttribute('href', '/login')
    expect(screen.getByRole('link', { name: '注册' })).toHaveAttribute('href', '/register')
  })

  it('learner home presents only enrolled courses with real course links', async () => {
    render(<MemoryRouter><TrainingLearnerHome /></MemoryRouter>)
    const link = await screen.findByRole('link', { name: /成长研修/ })
    expect(link).toHaveAttribute('href', '/student/courses/course-1')
    expect(screen.queryByText('认知测评')).toBeNull()
    expect(get).toHaveBeenCalledWith('/courses/my')
    expect(screen.getByRole('heading', { level: 1, name: '我的课程' })).toBeInTheDocument()
    expect(screen.queryByRole('complementary', { name: '学习三步走' })).toBeNull()
    expect(screen.queryByText(/你好，小李/)).toBeNull()
  })

  it('shows first-course guidance in the welcome image only after an empty result', async () => {
    get.mockResolvedValue({ code: 0, data: { list: [] } })
    render(<MemoryRouter><TrainingLearnerHome /></MemoryRouter>)
    expect(screen.queryByRole('complementary', { name: '学习三步走' })).toBeNull()
    const heading = await screen.findByRole('heading', { level: 1, name: '你的第一门课程，从这里开始' })
    const hero = heading.closest('.learner-home-welcome')!
    expect(hero).toContainElement(screen.getByRole('complementary', { name: '学习三步走' }))
    expect(within(hero as HTMLElement).getByRole('button', { name: '加入课程' })).toBeEnabled()
    expect(screen.queryByRole('heading', { name: '我的课程' })).toBeNull()
  })

  it('does not mistake a course load failure for a new learner', async () => {
    get.mockRejectedValue(new Error('连接失败'))
    render(<MemoryRouter><TrainingLearnerHome /></MemoryRouter>)
    await screen.findByRole('alert')
    expect(screen.queryByRole('complementary', { name: '学习三步走' })).toBeNull()
    expect(screen.getByRole('button', { name: '重试' })).toBeEnabled()
  })

  it('replaces onboarding with courses after joining the first course', async () => {
    get.mockResolvedValueOnce({ code: 0, data: { list: [] } })
      .mockResolvedValue({ code: 0, data: { list: [course] } })
    render(<MemoryRouter><TrainingLearnerHome /></MemoryRouter>)
    await screen.findByRole('complementary', { name: '学习三步走' })
    fireEvent.click(screen.getByRole('button', { name: '加入课程' }))
    fireEvent.change(screen.getByRole('textbox', { name: '课程码' }), { target: { value: 'ABC123' } })
    fireEvent.submit(screen.getByRole('dialog').querySelector('form')!)
    await screen.findByRole('link', { name: /成长研修/ })
    expect(screen.queryByRole('complementary', { name: '学习三步走' })).toBeNull()
    expect(screen.queryByText(/你好，小李/)).toBeNull()
    expect(post).toHaveBeenCalledWith('/courses/join', { courseCode: 'ABC123' })
  })

  it('trainer home omits library courses and routes to owned course management', async () => {
    get.mockResolvedValue({ code: 0, data: { list: [course, { ...course, id: 'library', title: '库课程', isLibrary: true }] } })
    render(<MemoryRouter><TrainingTrainerHome /></MemoryRouter>)
    const link = await screen.findByRole('link', { name: /成长研修/ })
    expect(link).toHaveAttribute('href', '/courses/course-1/detail')
    expect(screen.queryByText('库课程')).toBeNull()
  })

  it('paginates trainer courses without appending the previous page', async () => {
    const first = Array.from({ length: 6 }, (_, index) => ({
      ...course, id: 'owned-' + index, title: '课程' + (index + 1),
    }))
    get.mockImplementation((url: string) => Promise.resolve({
      code: 0, data: url === '/courses?status=all&page=1&pageSize=6&excludeLibrary=true'
        ? { list: first, total: 7 }
        : url === '/courses?status=all&page=2&pageSize=6&excludeLibrary=true'
          ? { list: [{ ...course, id: 'last-course', title: '第7门课程' }], total: 7 }
          : { list: [], total: 0 },
    }))
    render(<MemoryRouter><TrainingTrainerHome /></MemoryRouter>)
    fireEvent.click(await screen.findByRole('button', { name: '下一页' }))
    expect(await screen.findByRole('link', { name: '第7门课程' })).toHaveAttribute('href', '/courses/last-course/detail')
    expect(screen.queryByRole('link', { name: '课程1' })).toBeNull()
    expect(get).toHaveBeenCalledWith('/courses?status=all&page=2&pageSize=6&excludeLibrary=true')
  })

  it('a learner can join an existing course through the original API', async () => {
    render(<MemoryRouter><TrainingLearnerHome /></MemoryRouter>)
    await screen.findByRole('link', { name: /成长研修/ })
    fireEvent.click(screen.getByRole('button', { name: '加入课程' }))
    fireEvent.change(screen.getByRole('textbox', { name: '课程码' }), { target: { value: 'ABC123' } })
    const dialog = screen.getByRole('dialog', { name: '加入课程' })
    fireEvent.submit(dialog.querySelector('form')!)
    await screen.findByRole('link', { name: /成长研修/ })
    expect(post).toHaveBeenCalledWith('/courses/join', { courseCode: 'ABC123' })
  })
})
