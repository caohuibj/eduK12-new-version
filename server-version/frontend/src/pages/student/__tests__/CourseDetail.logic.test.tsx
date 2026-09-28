import { act, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const { mockGet, mockNavigate } = vi.hoisted(() => ({
  mockGet: vi.fn(),
  mockNavigate: vi.fn(),
}))

vi.mock('../../../api/client', () => ({
  default: { get: mockGet },
}))

vi.mock('react-router-dom', async () => {
  const actual = await vi.importActual<typeof import('react-router-dom')>('react-router-dom')
  return { ...actual, useNavigate: () => mockNavigate }
})

import CourseDetail from '../CourseDetail'

const course = {
  id: 'course-1',
  title: '化学课程',
  description: null,
  status: 'PUBLISHED' as const,
  courseCode: 'C-1',
  creatorId: 'teacher-1',
  isRecruiting: true,
  studentCount: 1,
  createdAt: '2026-09-01T00:00:00.000Z',
  updatedAt: '2026-09-01T00:00:00.000Z',
}

const renderCourseDetail = () => render(
  <MemoryRouter initialEntries={['/student/courses/course-1']}>
    <Routes>
      <Route path="/student/courses/:courseId" element={<CourseDetail />} />
    </Routes>
  </MemoryRouter>,
)

const emptyResponse = { code: 0, data: { list: [] } }

describe('CourseDetail loading and interaction state', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('keeps the page loading until course detail resolves and does not make the unused scale request', async () => {
    let resolveCourse: ((value: unknown) => void) | undefined

    mockGet.mockImplementation((path: string) => {
      if (path === '/courses/course-1') {
        return new Promise((resolve) => {
          resolveCourse = resolve
        })
      }
      return Promise.resolve(emptyResponse)
    })

    renderCourseDetail()

    expect(screen.getByRole('status')).toHaveTextContent('正在加载课程')
    expect(screen.queryByText(/课程不存在|课程不可用/)).toBeNull()

    await act(async () => {
      resolveCourse?.({ code: 0, data: course })
    })

    expect(await screen.findByText('化学课程')).toBeInTheDocument()
    expect(mockGet.mock.calls.some(([path]) => String(path).includes('/scales/available'))).toBe(false)
  })

  it('uses one check-in completion rule and sends completed questionnaires to their result route', async () => {
    const user = userEvent.setup()

    mockGet.mockImplementation((path: string) => {
      if (path === '/courses/course-1') return Promise.resolve({ code: 0, data: course })
      if (path.endsWith('/assignments')) return Promise.resolve(emptyResponse)
      if (path.endsWith('/checkins')) {
        return Promise.resolve({
          code: 0,
          data: {
            list: [
              {
                id: 'checkin-boolean',
                title: '布尔状态打卡',
                submitted: true,
                submission: undefined,
                createdAt: '2026-09-01T00:00:00.000Z',
              },
              {
                id: 'checkin-object',
                title: '提交对象打卡',
                submitted: false,
                submission: { id: 'submission-1' },
                createdAt: '2026-09-01T00:00:00.000Z',
              },
            ],
          },
        })
      }
      if (path.startsWith('/questionnaires/available')) {
        return Promise.resolve({
          code: 0,
          data: {
            list: [
              {
                id: 'questionnaire-1',
                code: 'Q1',
                name: '学习问卷',
                description: null,
                estimatedTime: 5,
                scaleCount: 1,
                completed: true,
                inProgress: false,
                completedAt: '2026-09-02T00:00:00.000Z',
                assessmentId: 'assessment-1',
              },
            ],
          },
        })
      }
      return Promise.resolve(emptyResponse)
    })

    renderCourseDetail()
    await screen.findByText('化学课程')

    await user.click(screen.getByRole('button', { name: '打卡' }))
    expect(await screen.findByText('布尔状态打卡')).toBeInTheDocument()
    expect(screen.getAllByRole('button', { name: '查看' })).toHaveLength(2)

    await user.click(screen.getByRole('button', { name: '问卷' }))
    const reportButton = await screen.findByRole('button', { name: '查看报告' })
    await user.click(reportButton)

    expect(mockNavigate).toHaveBeenCalledWith('/student/questionnaires/result/assessment-1')
  })

  it('shows a local section error without replacing the loaded course', async () => {
    const user = userEvent.setup()

    mockGet.mockImplementation((path: string) => {
      if (path === '/courses/course-1') return Promise.resolve({ code: 0, data: course })
      if (path.endsWith('/assignments')) return Promise.resolve(emptyResponse)
      if (path.endsWith('/checkins')) return Promise.resolve({ code: 1, message: '打卡接口暂时不可用' })
      if (path.startsWith('/questionnaires/available')) return Promise.resolve(emptyResponse)
      return Promise.resolve(emptyResponse)
    })

    renderCourseDetail()
    await screen.findByText('化学课程')

    await user.click(screen.getByRole('button', { name: '打卡' }))

    const alert = await screen.findByRole('alert')
    expect(alert).toHaveTextContent('打卡加载失败')
    expect(alert).toHaveTextContent('打卡接口暂时不可用')
    expect(screen.getByText('化学课程')).toBeInTheDocument()
  })
})
