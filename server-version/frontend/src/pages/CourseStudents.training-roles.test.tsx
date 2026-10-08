import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const { get, post, auth, info } = vi.hoisted(() => ({
  get: vi.fn(), post: vi.fn(), info: vi.fn(),
  auth: {
    user: {
      id: 'teacher-1',
      role: 'TEACHER' as 'TEACHER' | 'ADMIN',
      platformRole: 'STANDARD' as 'STANDARD' | 'SYSTEM_ADMIN',
    },
  },
}))
vi.mock('../api/client', () => ({ default: { get, post, put: vi.fn(), delete: vi.fn() } }))
vi.mock('../contexts/AuthContext', () => ({ useAuth: () => auth }))
vi.mock('../components/staff-ui/useStaffFeedback', () => ({
  useStaffFeedback: () => ({ feedback: null, confirm: async () => true, info }),
}))
vi.mock('../training/context', () => ({ isTrainingHost: () => true }))

import CourseStudents from './CourseStudents'

function showRoster() {
  render(<MemoryRouter initialEntries={['/courses/course-1/students']}>
    <Routes><Route path="/courses/:courseId/students" element={<CourseStudents />} /></Routes>
  </MemoryRouter>)
}

beforeEach(() => {
  get.mockReset()
  post.mockReset()
  info.mockReset()
  auth.user = { id: 'teacher-1', role: 'TEACHER', platformRole: 'STANDARD' }
  get.mockImplementation((path: string) => {
    if (path === '/courses/course-1') return Promise.resolve({ code: 0, data: {
      id: 'course-1', title: '培训课', courseCode: 'ABC123', creatorId: 'teacher-1',
    } })
    if (path === '/courses/course-1/students') return Promise.resolve({ code: 0, data: { list: [
      { id: 'learner-1', nickname: '学员甲', username: 'l1', isFrozen: false,
        enrollmentStatus: 'ACTIVE', joinedAt: '2026-10-01T00:00:00Z' },
    ] } })
    throw new Error('unexpected path ' + path)
  })
})

describe('trainer course member actions do not confer platform account powers', () => {
  it('lets a trainer reset an enrolled learner but not freeze the global account', async () => {
    post.mockResolvedValueOnce({ code: 0, data: {
      username: 'l1', temporaryPassword: 'SyntheticCourse2026', mustChangePassword: true,
    } })
    showRoster()
    expect(await screen.findByRole('button', { name: /将 学员甲 从课程中移除/ })).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /冻结 学员甲/ })).toBeNull()
    const reset = screen.getByRole('button', { name: /生成一次性临时密码/ })
    fireEvent.click(reset)
    expect(await screen.findByText('SyntheticCourse2026')).toBeInTheDocument()
    expect(post).toHaveBeenCalledWith('/courses/course-1/students/learner-1/reset-password')
    fireEvent.click(screen.getByRole('button', { name: '我已安全交付，关闭' }))
    await waitFor(() => expect(screen.queryByText('SyntheticCourse2026')).toBeNull())
  })

  it('does not show a teacher reset control for a frozen or pending enrollment', async () => {
    get.mockImplementation((path: string) => {
      if (path === '/courses/course-1') return Promise.resolve({ code: 0, data: { id: 'course-1' } })
      if (path === '/courses/course-1/students') return Promise.resolve({ code: 0, data: { list: [
        { id: 'pending', username: 'pending', nickname: '待审核', enrollmentStatus: 'PENDING',
          isFrozen: false, joinedAt: '2026-10-01' },
        { id: 'frozen', username: 'frozen', nickname: '已冻结', enrollmentStatus: 'ACTIVE',
          isFrozen: true, joinedAt: '2026-10-01' },
      ] } })
      throw new Error(path)
    })
    showRoster()
    expect(await screen.findByRole('button', { name: /将 待审核 从课程中移除/ })).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /为 待审核 生成一次性临时密码/ })).toBeNull()
    expect(screen.queryByRole('button', { name: /为 已冻结 生成一次性临时密码/ })).toBeNull()
  })

  it('keeps global freeze and reset controls limited to current SYSTEM_ADMIN', async () => {
    auth.user = { id: 'admin-1', role: 'ADMIN', platformRole: 'SYSTEM_ADMIN' }
    showRoster()
    expect(await screen.findByRole('button', { name: /冻结 学员甲 的账号/ })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /生成一次性临时密码/ })).toBeInTheDocument()
  })

  it('denies legacy ADMIN with STANDARD platform role both global controls', async () => {
    auth.user = { id: 'legacy-admin', role: 'ADMIN', platformRole: 'STANDARD' }
    showRoster()
    expect(await screen.findByRole('button', { name: /将 学员甲 从课程中移除/ })).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /冻结 学员甲 的账号/ })).toBeNull()
    expect(screen.queryByRole('button', { name: /生成一次性临时密码/ })).toBeNull()
  })
})
