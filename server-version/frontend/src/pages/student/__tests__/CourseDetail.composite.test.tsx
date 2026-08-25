import { beforeEach, describe, expect, it, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter, Route, Routes } from 'react-router-dom'

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
  title: '语文课程',
  description: null,
  status: 'PUBLISHED' as const,
  courseCode: 'C-1',
  creatorId: 'teacher-1',
  isRecruiting: true,
  studentCount: 1,
  createdAt: '2029-01-01T00:00:00.000Z',
  updatedAt: '2029-01-01T00:00:00.000Z',
}

beforeEach(() => {
  vi.clearAllMocks()
  mockGet.mockImplementation((path: string) => {
    if (path === '/courses/course-1') return Promise.resolve({ code: 0, data: course })
    if (path.includes('/assignments') || path.includes('/checkins') || path.includes('/scales/') || path.includes('/questionnaires/')) {
      return Promise.resolve({ code: 0, data: { list: [] } })
    }
    return Promise.resolve({
      code: 0,
      data: {
        list: [
          {
            id: 'composite-repeat', name: '可再次测评', description: null, instruction: null,
            estimatedModules: 2, items: [], course: { id: 'course-1', title: '语文课程', courseCode: 'C-1' },
            attempt: { id: 'attempt-repeat', status: 'COMPLETED', progress: 100 },
            latestCompletedAttempt: { id: 'attempt-repeat', status: 'COMPLETED', progress: 100 },
            opensAt: null, expiresAt: null, maxAttempts: 2, attemptsUsed: 1,
            canContinue: false, canStartNewAttempt: true, availability: 'OPEN',
          },
          {
            id: 'composite-upcoming', name: '尚未开始测评', description: null, instruction: null,
            estimatedModules: 1, items: [], course: { id: 'course-1', title: '语文课程', courseCode: 'C-1' },
            attempt: null,
            latestCompletedAttempt: null,
            opensAt: '2030-01-02T00:00:00.000Z', expiresAt: null, maxAttempts: 1, attemptsUsed: 0,
            canContinue: false, canStartNewAttempt: false, availability: 'UPCOMING',
          },
          {
            id: 'composite-exhausted', name: '已达到次数测评', description: null, instruction: null,
            estimatedModules: 1, items: [], course: { id: 'course-1', title: '语文课程', courseCode: 'C-1' },
            attempt: { id: 'attempt-exhausted', status: 'COMPLETED', progress: 100 },
            latestCompletedAttempt: { id: 'attempt-exhausted', status: 'COMPLETED', progress: 100 },
            opensAt: null, expiresAt: null, maxAttempts: 2, attemptsUsed: 2,
            canContinue: false, canStartNewAttempt: false, availability: 'OPEN',
          },
        ],
      },
    })
  })
})

describe('CourseDetail composite availability', () => {
  it('exposes repeat, upcoming, and exhausted actions without hiding completed reports', async () => {
    const user = userEvent.setup()
    render(
      <MemoryRouter initialEntries={['/student/courses/course-1']}>
        <Routes>
          <Route path="/student/courses/:courseId" element={<CourseDetail />} />
        </Routes>
      </MemoryRouter>
    )

    await screen.findByText('语文课程')
    await user.click(screen.getAllByText('综合测评')[0])

    expect(screen.getByText('已使用 1 / 2 次')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: '再次测评' })).toBeEnabled()
    expect(screen.getByRole('button', { name: '查看上次报告' })).toBeEnabled()
    expect(screen.getByRole('button', { name: '尚未开始' })).toBeDisabled()
    expect(screen.getByRole('button', { name: '查看报告' })).toBeEnabled()

    await user.click(screen.getByRole('button', { name: '再次测评' }))
    expect(mockNavigate).toHaveBeenCalledWith('/student/composite/composite-repeat')

    await user.click(screen.getByRole('button', { name: '查看上次报告' }))
    expect(mockNavigate).toHaveBeenCalledWith('/student/composite/attempts/attempt-repeat/report')
  })
})
