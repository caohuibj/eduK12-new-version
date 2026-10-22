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
vi.mock('./context', () => ({ isTrainingHost: () => true }))
vi.mock('../components/RichTextEditor', () => ({ default: () => null }))
vi.mock('../components/QuestionEditor', () => ({ default: () => null }))
vi.mock('../components/MediaSelector', () => ({ default: () => null }))
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
    if (url === '/checkins/schedules?courseId=course-1') return Promise.resolve({ code: 0, data: { list: [] } })
    if ((url === '/courses/course-1/assignments' || url.startsWith('/assignments?view=summary&courseId=course-1&'))) return Promise.resolve({ code: 0, data: { list: [{ id: 'a-1', title: '课程练习', status: 'PUBLISHED', submitted: false }] } })
    if ((url === '/courses/course-1/checkins' || url.startsWith('/checkins?view=summary&courseId=course-1&'))) return Promise.resolve({ code: 0, data: { list: [{ id: 'c-1', title: '每周打卡', status: 'PUBLISHED', submitted: false }] } })
    if (url.startsWith('/courses/course-1/training-assessments?includeManaged=true&view=summary&')) return Promise.resolve({ code: 0, data: { list: [
      { key: 'questionnaire:q-1', id: 'q-1', name: '学习状态', kind: 'QUESTIONNAIRE', typeLabel: '课程问卷', unitCount: 2, unitLabel: '单元', manageHref: '/questionnaire-products/q-1' },
      { key: 'scale:s-1', id: 's-1', name: '积极应对量表', kind: 'SCALE', typeLabel: '课程量表', unitCount: 12, unitLabel: '道题目', manageHref: '/scales/s-1' },
      { key: 'cognitive:c-1', id: 'c-1', name: '已发布认知历史', kind: 'COGNITIVE', typeLabel: '认知测评', unitCount: 1, unitLabel: '个任务', manageHref: '/cognitive-assignments/c-1' },
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
  it('renames the exercise interface while preserving the authored task title', async () => {
    const original = get.getMockImplementation()!
    get.mockImplementation((url: string) => url.startsWith('/assignments?')
      ? Promise.resolve({ code: 0, data: { list: [{ id: 'original', title: '保留原题名：我的作业', status: 'PUBLISHED' }], total: 1 } })
      : original(url))
    mount('/courses/course-1/detail', '/courses/:courseId/detail', TrainingTrainerCourse)
    expect(await screen.findByRole('heading', { name: '保留原题名：我的作业' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: '学习' })).toHaveAttribute('aria-pressed', 'true')
    expect(screen.queryByRole('button', { name: '作业' })).toBeNull()
    expect(screen.getByRole('button', { name: '发布练习' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: '复用练习' })).toBeInTheDocument()
  })
  it('learner sees only three task groups, reuses existing assignment and check-in routes', async () => {
    mount('/student/courses/course-1', '/student/courses/:courseId', TrainingLearnerCourse)
    expect(await screen.findByRole('heading', { name: course.title })).toBeInTheDocument()
    expect(await screen.findByRole('link', { name: /完成练习/ })).toHaveAttribute('href', '/student/assignments/a-1?courseId=course-1&courseSection=assignments')
    fireEvent.click(screen.getByRole('button', { name: '打卡' }))
    expect(await screen.findByRole('link', { name: /去打卡/ })).toHaveAttribute('href', '/student/checkins/c-1?courseId=course-1&courseSection=checkins')
    fireEvent.click(screen.getByRole('button', { name: '测评' }))
    expect(await screen.findByRole('link', { name: /进入测评/ })).toHaveAttribute('href', '/student/scales/s-1?courseId=course-1&courseSection=assessments')
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
    expect(await screen.findByRole('link', { name: /进入测评/ })).toHaveAttribute('href', '/student/scales/s-1?courseId=course-1&courseSection=assessments')
    expect(loadAssessments).toHaveBeenCalledTimes(2)
  })

  it('does not mislabel a saved draft as submitted or a closed check-in as actionable', async () => {
    get.mockImplementation((url: string) => {
      if (url === '/courses/course-1') return Promise.resolve({ code: 0, data: course })
      if ((url === '/courses/course-1/assignments' || url.startsWith('/assignments?view=summary&courseId=course-1&'))) return Promise.resolve({ code: 0, data: { list: [{
        id: 'draft-1', title: '尚未提交的草稿', status: 'PUBLISHED',
        submitted: true, mySubmission: { status: 'DRAFT' },
      }] } })
      if ((url === '/courses/course-1/checkins' || url.startsWith('/checkins?view=summary&courseId=course-1&'))) return Promise.resolve({ code: 0, data: { list: [{
        id: 'closed-1', title: '已到期打卡', endTime: '2020-01-01T00:00:00Z', submitted: false,
      }] } })
      throw new Error('unexpected url ' + url)
    })
    mount('/student/courses/course-1', '/student/courses/:courseId', TrainingLearnerCourse)
    expect(await screen.findByText('已保存草稿')).toBeInTheDocument()
    expect(screen.getByRole('link', { name: /继续练习/ })).toHaveAttribute('href', '/student/assignments/draft-1?courseId=course-1&courseSection=assignments')
    fireEvent.click(screen.getByRole('button', { name: '打卡' }))
    expect(await screen.findByText('已截止')).toBeInTheDocument()
    expect(screen.queryByRole('link', { name: /去打卡/ })).toBeNull()
    expect(screen.getByRole('link', { name: /查看打卡/ })).toHaveAttribute('href', '/student/checkins/closed-1?courseId=course-1&courseSection=checkins')
  })

  it('shows assignment API failure without crashing the course page', async () => {
    get.mockImplementation((url: string) => {
      if (url === '/courses/course-1') return Promise.resolve({ code: 0, data: course })
      if ((url === '/courses/course-1/assignments' || url.startsWith('/assignments?view=summary&courseId=course-1&'))) return Promise.reject(new Error('练习查询超时'))
      if ((url === '/courses/course-1/checkins' || url.startsWith('/checkins?view=summary&courseId=course-1&'))) return Promise.resolve({ code: 0, data: { list: [] } })
      throw new Error('unexpected url ' + url)
    })
    mount('/student/courses/course-1', '/student/courses/:courseId', TrainingLearnerCourse)
    expect(await screen.findByRole('alert')).toHaveTextContent('练习查询超时')
    expect(screen.getByRole('button', { name: '重试' })).toBeInTheDocument()
  })

  it('trainer sees the entire delivered course inventory, including SCALE and Bundle', async () => {
    mount('/courses/course-1/detail', '/courses/:courseId/detail', TrainingTrainerCourse)
    expect(await screen.findByRole('heading', { name: course.title })).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: '测评' }))
    expect(await screen.findByText('积极应对量表')).toBeInTheDocument()
    expect(screen.getByText('学习综合测评包')).toBeInTheDocument()
    expect(screen.getAllByRole('link', { name: /配置与匿名链接|管理测评/ }).map(link => link.getAttribute('href')?.split('?')[0])).toEqual(['/questionnaire-products/q-1', '/scales/s-1', '/cognitive-assignments/c-1', '/bundle-products/b-1'])
    expect(get).toHaveBeenCalledWith(expect.stringContaining('/courses/course-1/training-assessments?includeManaged=true&view=summary&page=1&pageSize=20'))
  })

  it('hides analysis and sends old analysis links to assessments without loading analysis sources', async () => {
    mount('/courses/course-1/detail?section=analysis', '/courses/:courseId/detail', TrainingTrainerCourse)
    await screen.findByRole('heading', { name: course.title })
    expect(screen.queryByRole('button', { name: '信息统计' })).toBeNull()
    expect(screen.queryByRole('region', { name: '课程数据分析' })).toBeNull()
    expect(screen.getByRole('button', { name: '测评' })).toHaveAttribute('aria-pressed', 'true')
    expect(await screen.findByRole('link', { name: /发布测评/ })).toHaveAttribute('href', expect.stringContaining('/questionnaire-products/new?courseId=course-1&returnTo='))
    expect(get.mock.calls.some(([url]) => url.includes('training-analysis'))).toBe(false)
    fireEvent.click(screen.getByRole('button', { name: '学习' }))
    expect(await screen.findByRole('button', { name: '发布练习' })).toBeVisible()
    expect(get.mock.calls.some(([url]) => url.includes('training-analysis'))).toBe(false)
  })

  it('keeps course code operations in a low-frequency settings section with explicit confirmation', async () => {
    mount('/courses/course-1/detail', '/courses/:courseId/detail', TrainingTrainerCourse)
    expect(await screen.findByRole('heading', { name: course.title })).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button',{name:'课程管理'}))
    fireEvent.click(screen.getByRole('button', { name: '轮换课程码' }))
    await screen.findByRole('button', { name: '轮换课程码' })
    expect(confirm).toHaveBeenCalledWith(expect.objectContaining({ title: '轮换课程码？' }))
    await waitFor(() => expect(post).toHaveBeenCalledWith('/courses/course-1/rotate-code', {}))
  })

  it('keeps the course information form visible while a successful recruitment change refreshes the same course', async () => {
    const original = get.getMockImplementation()!
    let courseReads = 0
    let resolveRefresh!: (value: { code: number; data: typeof course }) => void
    get.mockImplementation((url: string) => {
      if (url === '/courses/course-1' && courseReads++ > 0) return new Promise(resolve => { resolveRefresh = resolve })
      return original(url)
    })
    mount('/courses/course-1/detail', '/courses/:courseId/detail', TrainingTrainerCourse)
    await screen.findByRole('heading', { name: course.title })
    fireEvent.click(screen.getByRole('button',{name:'课程管理'}))
    const settings = screen.getByRole('textbox', { name: '课程介绍' })
    expect(settings).toBeVisible()
    expect(screen.queryByRole('link', { name: '测评与结果' })).toBeNull()
    expect(screen.getByRole('link', { name: /管理学员/ })).toBeVisible()
    fireEvent.click(screen.getByRole('button', { name: '暂停报名' }))
    await waitFor(() => expect(courseReads).toBe(2))
    expect(settings).toBeInTheDocument()
    expect(settings).toBeVisible()
    expect(screen.getByRole('textbox', { name: '课程介绍' })).toBe(settings)
    await act(async () => resolveRefresh({ code: 0, data: { ...course, isRecruiting: false } }))
    expect(await screen.findByRole('button', { name: '恢复报名' })).toBeVisible()
    expect(settings).toBeVisible()
    expect(screen.getByRole('textbox', { name: '课程介绍' })).toBe(settings)
  })

  it('keeps course end behind explicit confirmation', async () => {
    confirm.mockResolvedValueOnce(false)
    mount('/courses/course-1/detail', '/courses/:courseId/detail', TrainingTrainerCourse)
    expect(await screen.findByRole('heading', { name: course.title })).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button',{name:'课程管理'}))
    fireEvent.click(screen.getByRole('button', { name: '结束课程' }))
    await waitFor(() => expect(confirm).toHaveBeenCalledWith(expect.objectContaining({
      title: '确定结束课程？', danger: true,
    })))
    expect(post).not.toHaveBeenCalledWith('/courses/course-1/end', {})
  })

  it('applies the single header filter only to the current course section', async () => {
    mount('/courses/course-1/detail?section=checkins', '/courses/:courseId/detail', TrainingTrainerCourse)
    await screen.findByRole('heading', { name: '每周打卡' }, { timeout: 5000 })
    expect(screen.getAllByText('检索与筛选')).toHaveLength(1)
    fireEvent.click(screen.getByText('检索与筛选'))
    fireEvent.change(screen.getByRole('searchbox', { name: '搜索打卡' }), { target: { value: '每周' } })
    fireEvent.click(screen.getByRole('button', { name: '查询' }))
    await waitFor(() => expect(get.mock.calls.some(([url]) => url.startsWith('/checkins?view=summary&courseId=course-1&') && new URLSearchParams(url.split('?')[1]).get('search') === '每周')).toBe(true))
    fireEvent.click(screen.getByRole('button', { name: '学习' }))
    await screen.findByRole('heading', { name: '课程练习' })
    expect(screen.getAllByText('检索与筛选')).toHaveLength(1)
    expect(screen.getByRole('searchbox', { name: '搜索练习', hidden: true })).toHaveValue('')
  })

  it('trainer publishing links keep the exact course context', async () => {
    mount('/courses/course-1/detail', '/courses/:courseId/detail', TrainingTrainerCourse)
    expect(await screen.findByRole('heading', { name: course.title })).toBeInTheDocument()
    expect(await screen.findByRole('button', { name: '发布练习' })).toBeVisible()
    expect(await screen.findByRole('button', { name: '查看提交' })).toBeVisible()
    expect(screen.getByRole('button', { name: '导出提交' })).toBeVisible()
    expect(screen.queryByRole('link', { name: /查看管理/ })).toBeNull()
    fireEvent.click(screen.getByRole('button', { name: '打卡' }))
    expect(await screen.findByRole('button', { name: '发布打卡' })).toBeVisible()
    expect(await screen.findByRole('button', { name: '查看提交' })).toBeVisible()
    expect(screen.getByRole('button', { name: '导出提交' })).toBeVisible()
    expect(screen.queryByRole('link', { name: /查看管理/ })).toBeNull()
    fireEvent.click(screen.getByRole('button', { name: '测评' }))
    expect(screen.getByRole('link', { name: /发布测评/ })).toHaveAttribute('href', expect.stringContaining('/questionnaire-products/new?courseId=course-1&returnTo='))
    expect(screen.queryByRole('link',{name:/管理学员/})).toBeNull()
    fireEvent.click(screen.getByRole('button',{name:'课程管理'}))
    for (const link of screen.getAllByRole('link', { name: /管理学员/ })) expect(link).toHaveAttribute('href', '/courses/course-1/students')
  })
})

it('restores the learner assessment section from a refreshed URL', async () => {
  mount('/student/courses/course-1?section=assessments', '/student/courses/:courseId', TrainingLearnerCourse)
  expect(await screen.findByRole('link', { name: /进入测评/ })).toHaveAttribute('href', '/student/scales/s-1?courseId=course-1&courseSection=assessments')
  expect(screen.getByRole('button', { name: '测评' })).toHaveAttribute('aria-pressed', 'true')
})
