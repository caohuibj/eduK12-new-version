import { beforeEach, describe, expect, it, vi } from 'vitest'
import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router-dom'
import type { Course } from '../../types'

const { mockGet, authState } = vi.hoisted(() => ({
  mockGet: vi.fn(),
  authState: { user: { id: 'admin-1', role: 'ADMIN' as const } },
}))

vi.mock('react-router-dom', async () => {
  const actual = await vi.importActual<typeof import('react-router-dom')>('react-router-dom')
  return { ...actual, useNavigate: () => vi.fn() }
})

vi.mock('../../api/client', () => ({
  default: { get: mockGet, post: vi.fn(), put: vi.fn(), delete: vi.fn() },
}))

vi.mock('../../contexts/AuthContext', () => ({
  useAuth: () => ({ user: authState.user }),
}))

vi.mock('axios', () => ({ default: { post: vi.fn() } }))

import CourseList from '../CourseList'

const course = (input: Partial<Course> & Pick<Course, 'id' | 'title' | 'creatorId'>): Course => ({
  status: 'PUBLISHED',
  courseCode: input.courseCode || input.id.toUpperCase(),
  isRecruiting: false,
  createdAt: '2026-01-01T00:00:00.000Z',
  updatedAt: '2026-01-01T00:00:00.000Z',
  ...input,
})

describe('CourseList library marking', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    authState.user = { id: 'admin-1', role: 'ADMIN' }
    mockGet.mockImplementation((url: string) => {
      if (String(url).includes('shared-to-me')) {
        return Promise.resolve({ code: 0, data: { list: [] } })
      }
      return Promise.resolve({
        code: 0,
        data: {
          list: [
            course({
              id: 'own-lib',
              title: '我的库课',
              creatorId: 'admin-1',
              isLibrary: true,
              creator: { id: 'admin-1', username: 'me', role: 'ADMIN' },
            }),
            course({
              id: 'peer-admin',
              title: '同事管理员课',
              creatorId: 'admin-2',
              isLibrary: false,
              creator: { id: 'admin-2', username: 'peer', role: 'ADMIN' },
            }),
            course({
              id: 'teacher-course',
              title: '教师课',
              creatorId: 'teacher-1',
              isLibrary: false,
              creator: { id: 'teacher-1', username: 'tea', role: 'TEACHER' },
            }),
          ],
        },
      })
    })
  })

  it('shows a library badge and lets another admin mark an admin-created course, but not a teacher course', async () => {
    const user = userEvent.setup()
    render(<MemoryRouter><CourseList /></MemoryRouter>)

    expect(await screen.findByText('我的库课')).toBeInTheDocument()
    expect(screen.getAllByText('库课程').length).toBeGreaterThan(0)

    const peerCard = screen.getByText('同事管理员课').closest('.staff-course-card') as HTMLElement
    await user.click(within(peerCard).getByLabelText('同事管理员课 的更多操作'))
    await user.click(within(peerCard).getByRole('button', { name: '编辑课程' }))
    expect(screen.getByText('标记为库课程')).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: '取消' }))

    const teacherCard = screen.getByText('教师课').closest('.staff-course-card') as HTMLElement
    await user.click(within(teacherCard).getByLabelText('教师课 的更多操作'))
    await user.click(within(teacherCard).getByRole('button', { name: '编辑课程' }))
    expect(screen.queryByText('标记为库课程')).not.toBeInTheDocument()
  })
})
