import { act, fireEvent, render, screen } from '@testing-library/react'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import StudentCourseLogin from '../StudentCourseLogin'
import StudentRegister from '../student/StudentRegister'

const { mockPost, mockSetAuthenticatedUser } = vi.hoisted(() => ({
  mockPost: vi.fn(),
  mockSetAuthenticatedUser: vi.fn(),
}))

vi.mock('../../api/client', () => ({
  default: {
    post: mockPost,
  },
}))

vi.mock('../../components/app-shell/useAuthLinks', () => ({
  useAuthLinks: () => (path: string) => path,
}))

vi.mock('../../contexts/AuthContext', () => ({
  useAuth: () => ({
    setAuthenticatedUser: mockSetAuthenticatedUser,
  }),
}))

const renderRegistrationFlow = (initialEntry = '/student/course-login') =>
  render(
    <MemoryRouter initialEntries={[initialEntry]}>
      <Routes>
        <Route path="/student/course-login" element={<StudentCourseLogin />} />
        <Route path="/student/register" element={<StudentRegister />} />
      </Routes>
    </MemoryRouter>,
  )

describe('student course registration verification', () => {
  beforeEach(() => {
    mockPost.mockReset()
    mockSetAuthenticatedUser.mockReset()
  })

  it('reuses the successful course verification when navigating to registration', async () => {
    mockPost.mockResolvedValueOnce({
      code: 0,
      data: {
        courseId: 'course-1',
        courseName: '化学一班',
      },
    })

    renderRegistrationFlow()

    fireEvent.change(screen.getByLabelText('课程码'), {
      target: { value: 'ABC123' },
    })
    fireEvent.click(screen.getByRole('button', { name: '下一步' }))

    expect(await screen.findByText('加入课程：化学一班')).toBeTruthy()
    expect(mockPost).toHaveBeenCalledTimes(1)
    expect(mockPost).toHaveBeenCalledWith('/courses/verify-code', {
      courseCode: 'ABC123',
    })
  })

  it('shows a verification state instead of invalid access while direct verification is pending', async () => {
    let resolveVerification:
      | ((value: { code: number; message: string }) => void)
      | undefined

    mockPost.mockReturnValueOnce(
      new Promise((resolve) => {
        resolveVerification = resolve
      }),
    )

    renderRegistrationFlow('/student/register?course=ABC123')

    expect(screen.getByRole('status').textContent).toContain('正在验证课程码')
    expect(screen.queryByText('无效的访问')).toBeNull()

    await act(async () => {
      resolveVerification?.({
        code: 1,
        message: '课程码无效或课程已结束',
      })
    })

    expect(await screen.findByText('课程码无效或课程已结束')).toBeTruthy()
  })
})
