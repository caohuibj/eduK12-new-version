import type { ComponentType } from 'react'
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const { get, post, put, loadAssessments, confirm } = vi.hoisted(() => ({
  get: vi.fn(), post: vi.fn(), put: vi.fn(), loadAssessments: vi.fn(), confirm: vi.fn(),
}))
vi.mock('../api/client', () => ({ default: { get, post, put } }))
vi.mock('../contexts/CapabilitiesContext', () => ({ useCognitiveEnabled: () => false }))
vi.mock('../contexts/AuthContext', () => ({ useAuth: () => ({ user: { id: 'teacher-1', role: 'TEACHER' } }) }))
vi.mock('../components/staff-ui/useStaffFeedback', () => ({
  useStaffFeedback: () => ({ feedback: null, confirm, success: vi.fn(), error: vi.fn() }),
}))
vi.mock('./courseAssessments', () => ({ loadCourseAssessments: loadAssessments }))

import TrainingLearnerCourse from './TrainingLearnerCourse'
import TrainingTrainerCourse from './TrainingTrainerCourse'

const course = { id: 'course-1', title: '教师专业发展培训', description: '学习·实践·反馈', creatorId: 'teacher-1', courseCode: 'ABCD12', status: 'PUBLISHED', isRecruiting: true, studentCount: 12 }

function mount(path: string, route: string, Page: ComponentType) {
  return render(<MemoryRouter initialEntries={[path]}><Routes><Route path={route} element={<Page />} /></Routes></MemoryRouter>)
}

beforeEach(() => {
  get.mockReset()
  post.mockReset()
  put.mockReset()
  confirm.mockReset()
  confirm.mockResolvedValue(true)
  post.mockResolvedValue({ code: 0, data: {} })
  put.mockResolvedValue({ code: 0, data: {} })
  loadAssessments.mockReset()
  get.mockImplementation((url: string) => {
    if (url === '/courses/course-1') return Promise.resolve({ code: 0, data: course })
    if (url === '/courses/course-1/assignments') return Promise.resolve({ code: 0, data: { list: [{ id: 'a-1', title: '课程作业', status: 'PUBLISHED', submitted: false }] } })
    if (url === '/courses/course-1/checkins') return Promise.resolve({ code: 0, data: { list: [{ id: 'c-1', title: '每周打卡', status: 'PUBLISHED', submitted: false }] } })
    if (url === '/courses/course-1/training-assessments') return Promise.resolve({ code: 0, data: { list: [
      { key: 'questionnaire:q-1', id: 'q-1', name: '学习状态', kind: 'QUESTIONNAIRE', typeLabel: '课程问卷', unitCount: 2, unitLabel: '单元', manageHref: '/questionnaire-products/q-1' },
      { key: 'scale:s-1', id: 's-1', name: '积极应对量表', kind: 'SCALE', typeLabel: '课程量表', unitCount: 12, unitLabel: '道题目', manageHref: '/scales/s-1' },
      { key: 'bundle:b-1', id: 'b-1', name: '学习综合测评包', kind: 'ASSESSMENT_BUNDLE', typeLabel: '固定测评包', unitCount: 3, unitLabel: '个测评单元', manageHref: '/bundle-products/b-1' },
    ] } })
    throw new Error('unexpected url ' + url)
  })
  loadAssessments.mockResolvedValue({ errors: [], items: [{
    key: 'scale:s-1', name: '专注体验测评', typeLabel: '课程测评', description: null,
    status: '待完成', href: '/student/scales/s-1', action: '进入测评',
  }] })
})

describe('course-first training workspaces', () => {
  it('learner sees only three task groups, reuses existing assignment and check-in routes', async () => {
    mount('/student/courses/course-1', '/student/courses/:courseId', TrainingLearnerCourse)
    expect(await screen.findByRole('heading', { name: course.title })).toBeInTheDocument()
    expect(await screen.findByRole('link', { name: /完成作业/ })).toHaveAttribute('href', '/student/assignments/a-1?courseId=course-1')
    fireEvent.click(screen.getByRole('button', { name: '打卡' }))
    expect(await screen.findByRole('link', { name: /去打卡/ })).toHaveAttribute('href', '/student/checkins/c-1?courseId=course-1')
    fireEvent.click(screen.getByRole('button', { name: '测评' }))
    expect(await screen.findByRole('link', { name: /进入测评/ })).toHaveAttribute('href', '/student/scales/s-1')
    expect(loadAssessments).toHaveBeenCalledWith('course-1', false)
  })

  it('settles a failed assessment load and lets the learner retry', async () => {
    loadAssessments.mockRejectedValueOnce(new Error('测评查询超时'))
    mount('/student/courses/course-1', '/student/courses/:courseId', TrainingLearnerCourse)
    await screen.findByRole('heading', { name: course.title })
    fireEvent.click(screen.getByRole('button', { name: '测评' }))
    expect(await screen.findByRole('alert')).toHaveTextContent('测评查询超时')
    expect(screen.queryByText('正在核对本课程的可用测评…')).toBeNull()
    fireEvent.click(screen.getByRole('button', { name: '重新加载测评' }))
    expect(await screen.findByRole('link', { name: /进入测评/ })).toHaveAttribute('href', '/student/scales/s-1')
    expect(loadAssessments).toHaveBeenCalledTimes(2)
  })

  it('does not mislabel a saved draft as submitted or a closed check-in as actionable', async () => {
    get.mockImplementation((url: string) => {
      if (url === '/courses/course-1') return Promise.resolve({ code: 0, data: course })
      if (url === '/courses/course-1/assignments') return Promise.resolve({ code: 0, data: { list: [{
        id: 'draft-1', title: '尚未提交的草稿', status: 'PUBLISHED',
        submitted: true, mySubmission: { status: 'DRAFT' },
      }] } })
      if (url === '/courses/course-1/checkins') return Promise.resolve({ code: 0, data: { list: [{
        id: 'closed-1', title: '已到期打卡', endTime: '2020-01-01T00:00:00Z', submitted: false,
      }] } })
      throw new Error('unexpected url ' + url)
    })
    mount('/student/courses/course-1', '/student/courses/:courseId', TrainingLearnerCourse)
    expect(await screen.findByText('已保存草稿')).toBeInTheDocument()
    expect(screen.getByRole('link', { name: /继续作业/ })).toHaveAttribute('href', '/student/assignments/draft-1?courseId=course-1')
    fireEvent.click(screen.getByRole('button', { name: '打卡' }))
    expect(await screen.findByText('已截止')).toBeInTheDocument()
    expect(screen.queryByRole('link', { name: /去打卡/ })).toBeNull()
    expect(screen.getByRole('link', { name: /查看打卡/ })).toHaveAttribute('href', '/student/checkins/closed-1?courseId=course-1')
  })

  it('shows assignment API failure without crashing the course page', async () => {
    get.mockImplementation((url: string) => {
      if (url === '/courses/course-1') return Promise.resolve({ code: 0, data: course })
      if (url === '/courses/course-1/assignments') return Promise.reject(new Error('作业查询超时'))
      if (url === '/courses/course-1/checkins') return Promise.resolve({ code: 0, data: { list: [] } })
      throw new Error('unexpected url ' + url)
    })
    mount('/student/courses/course-1', '/student/courses/:courseId', TrainingLearnerCourse)
    expect(await screen.findByRole('alert')).toHaveTextContent('作业查询超时')
    expect(screen.getByRole('button', { name: '重试' })).toBeInTheDocument()
  })

  it('trainer sees the entire delivered course inventory, including SCALE and Bundle', async () => {
    mount('/courses/course-1/detail', '/courses/:courseId/detail', TrainingTrainerCourse)
    expect(await screen.findByRole('heading', { name: course.title })).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: '测评' }))
    expect(await screen.findByText('积极应对量表')).toBeInTheDocument()
    expect(screen.getByText('学习综合测评包')).toBeInTheDocument()
    expect(screen.getAllByRole('link', { name: /管理测评/ }).map(link => link.getAttribute('href'))).toEqual(['/questionnaire-products/q-1', '/scales/s-1', '/bundle-products/b-1'])
    expect(get).toHaveBeenCalledWith('/courses/course-1/training-assessments')
  })

  it('keeps course code operations in a low-frequency settings section with explicit confirmation', async () => {
    mount('/courses/course-1/detail', '/courses/:courseId/detail', TrainingTrainerCourse)
    expect(await screen.findByRole('heading', { name: course.title })).toBeInTheDocument()
    fireEvent.click(screen.getByText(/课程设置/, { selector: 'summary' }))
    fireEvent.click(screen.getByRole('button', { name: '轮换课程码' }))
    await screen.findByRole('button', { name: '轮换课程码' })
    expect(confirm).toHaveBeenCalledWith(expect.objectContaining({ title: '轮换课程码？' }))
    await waitFor(() => expect(post).toHaveBeenCalledWith('/courses/course-1/rotate-code', {}))
  })

  it('keeps settings open while a successful recruitment change refreshes the same course', async () => {
    const original = get.getMockImplementation()!
    let courseReads = 0
    let resolveRefresh!: (value: { code: number; data: typeof course }) => void
    get.mockImplementation((url: string) => {
      if (url === '/courses/course-1' && courseReads++ > 0) return new Promise(resolve => { resolveRefresh = resolve })
      return original(url)
    })
    mount('/courses/course-1/detail', '/courses/:courseId/detail', TrainingTrainerCourse)
    await screen.findByRole('heading', { name: course.title })
    const summary = screen.getByText(/课程设置/, { selector: 'summary' })
    const settings = summary.closest('details')!
    fireEvent.click(summary)
    expect(settings.open).toBe(true)
    fireEvent.click(screen.getByRole('button', { name: '暂停报名' }))
    await waitFor(() => expect(courseReads).toBe(2))
    expect(settings).toBeInTheDocument()
    expect(settings.open).toBe(true)
    await act(async () => resolveRefresh({ code: 0, data: { ...course, isRecruiting: false } }))
    expect(await screen.findByRole('button', { name: '恢复报名' })).toBeVisible()
    expect(settings.open).toBe(true)
  })

  it('keeps course end behind explicit confirmation', async () => {
    confirm.mockResolvedValueOnce(false)
    mount('/courses/course-1/detail', '/courses/:courseId/detail', TrainingTrainerCourse)
    expect(await screen.findByRole('heading', { name: course.title })).toBeInTheDocument()
    fireEvent.click(screen.getByText(/课程设置/, { selector: 'summary' }))
    fireEvent.click(screen.getByRole('button', { name: '结束课程' }))
    await waitFor(() => expect(confirm).toHaveBeenCalledWith(expect.objectContaining({
      title: '确定结束课程？', danger: true,
    })))
    expect(post).not.toHaveBeenCalledWith('/courses/course-1/end', {})
  })

  it('trainer publishing links keep the exact course context', async () => {
    mount('/courses/course-1/detail', '/courses/:courseId/detail', TrainingTrainerCourse)
    expect(await screen.findByRole('heading', { name: course.title })).toBeInTheDocument()
    expect(await screen.findByRole('link', { name: /发布作业/ })).toHaveAttribute('href', '/assignments?create=true&courseId=course-1')
    fireEvent.click(screen.getByRole('button', { name: '打卡' }))
    expect(screen.getByRole('link', { name: /发布打卡/ })).toHaveAttribute('href', '/checkins?create=true&courseId=course-1')
    fireEvent.click(screen.getByRole('button', { name: '测评' }))
    expect(screen.getByRole('link', { name: /布置组合测评/ })).toHaveAttribute('href', '/questionnaire-products/new?courseId=course-1')
    for (const link of screen.getAllByRole('link', { name: /管理学员/ })) expect(link).toHaveAttribute('href', '/courses/course-1/students')
  })
})
