import { beforeEach, describe, expect, it, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'

const { mockGet, mockPost, auth } = vi.hoisted(() => ({
  mockGet: vi.fn(),
  mockPost: vi.fn(),
  auth: { user: { role: 'TEACHER' as 'TEACHER' | 'ADMIN', platformRole: 'STANDARD' as 'STANDARD' | 'SYSTEM_ADMIN' } },
}))
vi.mock('../../contexts/AuthContext', () => ({ useAuth: () => auth }))

vi.mock('../../api/client', () => ({
  default: {
    get: mockGet,
    post: mockPost,
    put: vi.fn(),
    delete: vi.fn(),
  },
}))

import StudentManagement from '../StudentManagement'

describe('StudentManagement product semantics', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    auth.user = { role: 'TEACHER', platformRole: 'STANDARD' }
    mockGet.mockImplementation((url: string) => {
      if (url === '/courses') {
        return Promise.resolve({
          code: 0,
          data: {
            list: [{
              id: 'course-1',
              title: '课程一',
              courseCode: 'C001',
              creatorId: 'teacher-1',
              status: 'PUBLISHED',
              isRecruiting: true,
              createdAt: '2026-01-01T00:00:00.000Z',
              updatedAt: '2026-01-01T00:00:00.000Z',
            }],
          },
        })
      }
      return Promise.resolve({ code: 0, data: { list: [] } })
    })
    mockPost.mockResolvedValue({
      code: 0,
      data: {
        data: {
          'course-1': [{
            id: 'student-1',
            username: 'student01',
            nickname: '小明',
            isFrozen: false,
            joinedAt: '2026-01-02T00:00:00.000Z',
          }],
        },
      },
    })
  })

  it('labels filters and exposes course-scoped actions without global account controls for trainers', async () => {
    const user = userEvent.setup()
    render(<StudentManagement />)

    expect(await screen.findByRole('heading', { name: '学生管理' })).toBeInTheDocument()
    expect(screen.getByLabelText('搜索学生')).toBeInTheDocument()
    expect(screen.getByLabelText('课程')).toBeInTheDocument()

    const courseToggle = await screen.findByRole('button', { name: /课程一/ })
    expect(courseToggle).toHaveAttribute('aria-expanded', 'false')

    await user.click(courseToggle)
    expect(courseToggle).toHaveAttribute('aria-expanded', 'true')
    expect(screen.queryByRole('button', { name: '冻结 小明 的账号' })).toBeNull()
    expect(screen.queryByRole('button', { name: '重置 小明 的密码' })).toBeNull()
    expect(screen.getByRole('button', { name: '将 小明 从课程中移除' })).toBeInTheDocument()
  })
  it('permits system admin account actions but not legacy ADMIN with STANDARD platform role', async () => {
    auth.user = { role: 'ADMIN', platformRole: 'STANDARD' }
    const u = userEvent.setup()
    const view = render(<StudentManagement />)
    const firstToggle = await screen.findByRole('button', { name: /课程一/ })
    await u.click(firstToggle)
    expect(screen.queryByRole('button', { name: '冻结 小明 的账号' })).toBeNull()
    view.unmount()

    auth.user = { role: 'ADMIN', platformRole: 'SYSTEM_ADMIN' }
    render(<StudentManagement />)
    const toggle = await screen.findByRole('button', { name: /课程一/ })
    await u.click(toggle)
    expect(screen.getByRole('button', { name: '冻结 小明 的账号' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: '重置 小明 的密码' })).toBeInTheDocument()
  })

})
