import { render, screen } from '@testing-library/react'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const { get, auth } = vi.hoisted(() => ({
  get: vi.fn(),
  auth: { user: { id: 'teacher-1', role: 'TEACHER' as 'TEACHER' | 'ADMIN' } },
}))
vi.mock('../api/client', () => ({ default: { get, put: vi.fn(), post: vi.fn(), delete: vi.fn() } }))
vi.mock('../contexts/AuthContext', () => ({ useAuth: () => auth }))
vi.mock('../components/staff-ui/useStaffFeedback', () => ({
  useStaffFeedback: () => ({ feedback: null, confirm: vi.fn(), info: vi.fn() }),
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
  auth.user = { id: 'teacher-1', role: 'TEACHER' }
  get.mockImplementation((path: string) => {
    if (path === '/courses/course-1') return Promise.resolve({ code: 0, data: { id: 'course-1', title: '培训课', courseCode: 'ABC123', creatorId: 'teacher-1' } })
    if (path === '/courses/course-1/students') return Promise.resolve({ code: 0, data: { list: [{ id: 'learner-1', nickname: '学员甲', username: 'l1', isFrozen: false, joinedAt: '2026-10-01T00:00:00Z' }] } })
    throw new Error('unexpected path ' + path)
  })
})

describe('trainer course roster only grants course-level actions', () => {
  it('allows course member removal but not global account freeze or reset', async () => {
    showRoster()
    expect(await screen.findByRole('button', { name: /将 学员甲 从课程中移除/ })).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /冻结 学员甲/ })).toBeNull()
    expect(screen.queryByRole('button', { name: /生成一次性临时密码/ })).toBeNull()
  })

  it('retains explicit global-account controls for platform admin only', async () => {
    auth.user = { id: 'admin-1', role: 'ADMIN' }
    showRoster()
    expect(await screen.findByRole('button', { name: /冻结 学员甲 的账号/ })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /生成一次性临时密码/ })).toBeInTheDocument()
  })
})
