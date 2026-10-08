import type { ComponentType } from 'react'
import { fireEvent, render, screen } from '@testing-library/react'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const { get, cognitive, loadAssessments } = vi.hoisted(() => ({
  get: vi.fn(), cognitive: vi.fn(), loadAssessments: vi.fn(),
}))
vi.mock('../api/client', () => ({ default: { get } }))
vi.mock('../contexts/CapabilitiesContext', () => ({ useCognitiveEnabled: () => false }))
vi.mock('../contexts/AuthContext', () => ({ useAuth: () => ({ user: { id: 'teacher-1', role: 'TEACHER' } }) }))
vi.mock('../modules/cognitive/api', () => ({ cognitiveApi: { listTeacherAssignments: cognitive } }))
vi.mock('./courseAssessments', () => ({ loadCourseAssessments: loadAssessments }))

import TrainingLearnerCourse from './TrainingLearnerCourse'
import TrainingTrainerCourse from './TrainingTrainerCourse'

const course = { id: 'course-1', title: '教师专业发展培训', description: '学习·实践·反馈', creatorId: 'teacher-1', courseCode: 'ABCD12', status: 'PUBLISHED', studentCount: 12 }

function mount(path: string, route: string, Page: ComponentType) {
  return render(<MemoryRouter initialEntries={[path]}><Routes><Route path={route} element={<Page />} /></Routes></MemoryRouter>)
}

beforeEach(() => {
  get.mockReset()
  cognitive.mockReset()
  loadAssessments.mockReset()
  get.mockImplementation((url: string) => {
    if (url === '/courses/course-1') return Promise.resolve({ code: 0, data: course })
    if (url === '/courses/course-1/assignments') return Promise.resolve({ code: 0, data: { list: [{ id: 'a-1', title: '课程作业', status: 'PUBLISHED', submitted: false }] } })
    if (url === '/courses/course-1/checkins') return Promise.resolve({ code: 0, data: { list: [{ id: 'c-1', title: '每周打卡', status: 'PUBLISHED', submitted: false }] } })
    if (url === '/courses/course-1/questionnaires') return Promise.resolve({ code: 0, data: { list: [{ id: 'q-1', name: '学习状态', kind: 'COLLECTION', unitCount: 2, unitLabel: '单元', manageHref: '/questionnaire-products/q-1' }] } })
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
    expect(await screen.findByRole('link', { name: /完成作业/ })).toHaveAttribute('href', '/student/assignments/a-1')
    fireEvent.click(screen.getByRole('button', { name: '打卡' }))
    expect(await screen.findByRole('link', { name: /去打卡/ })).toHaveAttribute('href', '/student/checkins/c-1')
    fireEvent.click(screen.getByRole('button', { name: '测评' }))
    expect(await screen.findByRole('link', { name: /进入测评/ })).toHaveAttribute('href', '/student/scales/s-1')
    expect(loadAssessments).toHaveBeenCalledWith('course-1', false)
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
    expect(screen.getByRole('link', { name: /继续作业/ })).toHaveAttribute('href', '/student/assignments/draft-1')
    fireEvent.click(screen.getByRole('button', { name: '打卡' }))
    expect(await screen.findByText('已截止')).toBeInTheDocument()
    expect(screen.queryByRole('link', { name: /去打卡/ })).toBeNull()
    expect(screen.getByRole('link', { name: /查看打卡/ })).toHaveAttribute('href', '/student/checkins/closed-1')
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

  it('trainer publishing links keep the exact course context', async () => {
    mount('/courses/course-1/detail', '/courses/:courseId/detail', TrainingTrainerCourse)
    expect(await screen.findByRole('heading', { name: course.title })).toBeInTheDocument()
    expect(await screen.findByRole('link', { name: /发布作业/ })).toHaveAttribute('href', '/assignments?create=true&courseId=course-1')
    fireEvent.click(screen.getByRole('button', { name: '打卡' }))
    expect(screen.getByRole('link', { name: /发布打卡/ })).toHaveAttribute('href', '/checkins?create=true&courseId=course-1')
    fireEvent.click(screen.getByRole('button', { name: '测评' }))
    expect(screen.getByRole('link', { name: /布置组合测评/ })).toHaveAttribute('href', '/questionnaire-products/new?courseId=course-1')
    expect(screen.getByRole('link', { name: /管理学员/ })).toHaveAttribute('href', '/courses/course-1/students')
  })
})
