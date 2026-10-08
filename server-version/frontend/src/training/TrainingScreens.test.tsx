import { render, screen, fireEvent } from '@testing-library/react'
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
  get.mockReset()
  post.mockReset()
  get.mockResolvedValue({ code: 0, data: { list: [course] } })
  post.mockResolvedValue({ code: 0, data: {} })
})

describe('training presentation and course-first entry', () => {
  it('presents exactly the two training roles and preserves safe login return', () => {
    render(<MemoryRouter initialEntries={['/?returnTo=%2Fstudent%2Fcourses%2Fcourse-1']}><TrainingPortal /></MemoryRouter>)
    const student = screen.getByRole('link', { name: /我是学员/ })
    const trainer = screen.getByRole('link', { name: /我是培训师/ })
    expect(student.getAttribute('href')).toContain('/student/login?returnTo=')
    expect(trainer.getAttribute('href')).toContain('/teacher/account-login?returnTo=')
    expect(screen.queryByRole('link', { name: /管理员入口/ })).toBeNull()
    const choices = screen.getByRole('navigation', { name: '选择培训身份' })
    expect(choices.querySelectorAll('a')).toHaveLength(2)
    expect(screen.getByRole('heading', { name: /让学习，.*更有回响。/ })).toBeInTheDocument()
    expect(screen.getByText('huisurvey')).toBeInTheDocument()
    expect(screen.queryByText('纸墨 · 见山')).toBeNull()
    expect(screen.getByRole('link', { name: '登录' })).toHaveAttribute('href', '#training-roles')
  })

  it('learner home presents only enrolled courses with real course links', async () => {
    render(<MemoryRouter><TrainingLearnerHome /></MemoryRouter>)
    const link = await screen.findByRole('link', { name: /成长研修/ })
    expect(link).toHaveAttribute('href', '/student/courses/course-1')
    expect(screen.queryByText('认知测评')).toBeNull()
    expect(get).toHaveBeenCalledWith('/courses/my')
  })

  it('trainer home omits library courses and routes to owned course management', async () => {
    get.mockResolvedValue({ code: 0, data: { list: [course, { ...course, id: 'library', title: '库课程', isLibrary: true }] } })
    render(<MemoryRouter><TrainingTrainerHome /></MemoryRouter>)
    const link = await screen.findByRole('link', { name: /成长研修/ })
    expect(link).toHaveAttribute('href', '/courses/course-1/detail')
    expect(screen.queryByText('库课程')).toBeNull()
  })

  it('loads later trainer course pages instead of silently truncating at 20 or 100', async () => {
    const first = Array.from({ length: 100 }, (_, index) => ({
      ...course, id: 'owned-' + index, title: '课程' + (index + 1),
    }))
    get.mockImplementation((url: string) => Promise.resolve({
      code: 0, data: url === '/courses?status=all&page=1&pageSize=100'
        ? { list: first, total: 101 }
        : url === '/courses?status=all&page=2&pageSize=100'
          ? { list: [{ ...course, id: 'last-course', title: '第101门课程' }], total: 101 }
          : { list: [], total: 0 },
    }))
    render(<MemoryRouter><TrainingTrainerHome /></MemoryRouter>)
    const more = await screen.findByRole('button', { name: '加载更多课程' })
    fireEvent.click(more)
    expect(await screen.findByRole('link', { name: /第101门课程/ })).toHaveAttribute('href', '/courses/last-course/detail')
    expect(get).toHaveBeenCalledWith('/courses?status=all&page=2&pageSize=100')
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
