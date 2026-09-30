import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router-dom'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const { mockGet, mockPost } = vi.hoisted(() => ({
  mockGet: vi.fn(),
  mockPost: vi.fn(),
}))

vi.mock('../../../api/client', () => ({
  default: {
    get: mockGet,
    post: mockPost,
  },
}))

vi.mock('../../../contexts/AuthContext', () => ({
  useAuth: () => ({
    user: {
      id: 'student-1',
      username: 'student01',
      nickname: '学生一',
      role: 'STUDENT',
    },
  }),
}))

vi.mock('../../../contexts/CapabilitiesContext', () => ({
  useCognitiveEnabled: () => false,
}))

import StudentHome from '../StudentHome'

describe('StudentHome join-course dialog', () => {
  it('shows a retry rather than an empty course list after a failed load', async () => {
    let courseRequests = 0
    mockGet.mockImplementation((url: string) => {
      if (url === '/courses/my' && courseRequests++ === 0) return Promise.reject(new Error('Offline'))
      return Promise.resolve({ code: 0, data: { list: [], total: 0, pageSize: 20, counts: {} } })
    })
    const user = userEvent.setup()
    render(<MemoryRouter><StudentHome /></MemoryRouter>)
    expect(await screen.findByText('课程列表加载失败')).toBeInTheDocument()
    expect(screen.queryByText('还没有加入任何课程')).toBeNull()
    await user.click(screen.getByText('重试'))
    expect(await screen.findByText('还没有加入任何课程')).toBeInTheDocument()
  })
  beforeEach(() => {
    vi.clearAllMocks()
    mockGet.mockResolvedValue({
      code: 0,
      data: {
        list: [
          {
            id: 'course-1',
            title: '化学课程',
            description: null,
            courseCode: 'CHEM01',
            creatorId: 'teacher-1',
            studentCount: 10,
            createdAt: '2026-09-01T00:00:00.000Z',
            updatedAt: '2026-09-01T00:00:00.000Z',
          },
        ],
      },
    })
  })

  it('traps focus, closes on Escape, and restores focus to the opener', async () => {
    const user = userEvent.setup()

    render(
      <MemoryRouter>
        <StudentHome />
      </MemoryRouter>,
    )

    const trigger = await screen.findByRole('button', { name: '加入课程' })
    trigger.focus()
    expect(trigger).toHaveFocus()

    await user.click(trigger)

    const dialog = await screen.findByRole('dialog', { name: '加入课程' })
    const input = screen.getByLabelText('课程号')
    const cancel = screen.getByRole('button', { name: '取消' })

    expect(dialog).toBeInTheDocument()
    expect(input).toHaveFocus()

    await user.keyboard('{Shift>}{Tab}{/Shift}')
    expect(cancel).toHaveFocus()

    await user.keyboard('{Tab}')
    expect(input).toHaveFocus()

    await user.keyboard('{Escape}')
    expect(screen.queryByRole('dialog', { name: '加入课程' })).toBeNull()
    await waitFor(() => expect(trigger).toHaveFocus())
  })
})
