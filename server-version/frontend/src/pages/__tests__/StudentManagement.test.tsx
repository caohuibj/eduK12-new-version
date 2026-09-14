import { beforeEach, describe, expect, it, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'

const { mockGet, mockPost } = vi.hoisted(() => ({
  mockGet: vi.fn(),
  mockPost: vi.fn(),
}))

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

  it('labels filters and exposes course expansion and account actions to assistive technology', async () => {
    const user = userEvent.setup()
    render(<StudentManagement />)

    expect(await screen.findByRole('heading', { name: '学生管理' })).toBeInTheDocument()
    expect(screen.getByLabelText('搜索学生')).toBeInTheDocument()
    expect(screen.getByLabelText('课程')).toBeInTheDocument()

    const courseToggle = await screen.findByRole('button', { name: /课程一/ })
    expect(courseToggle).toHaveAttribute('aria-expanded', 'false')

    await user.click(courseToggle)
    expect(courseToggle).toHaveAttribute('aria-expanded', 'true')
    expect(screen.getByRole('button', { name: '冻结 小明 的账号' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: '重置 小明 的密码' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: '将 小明 从课程中移除' })).toBeInTheDocument()
  })
})
