import { beforeEach, describe, expect, it, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'

const { mockGet, mockPost, mockDelete } = vi.hoisted(() => ({
  mockGet: vi.fn(),
  mockPost: vi.fn(),
  mockDelete: vi.fn(),
}))

vi.mock('../../api/client', () => ({
  default: {
    get: mockGet,
    post: mockPost,
    delete: mockDelete,
  },
}))

import TeacherCodeList from '../TeacherCodeList'

describe('TeacherCodeList management actions', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.spyOn(window, 'confirm').mockReturnValue(true)
    mockGet.mockResolvedValue({
      code: 0,
      data: {
        list: [{
          id: 'code-1',
          code: 'ABC123',
          usedCount: 0,
          maxUses: 1,
          isActive: true,
          createdAt: '2026-01-01T00:00:00.000Z',
          expiresAt: null,
          creatorId: 'admin-1',
          creator: { id: 'admin-1', username: 'admin', nickname: '管理员' },
        }],
      },
    })
    mockPost.mockResolvedValue({ code: 0, data: {} })
    mockDelete.mockResolvedValue({ code: 0, data: {} })
  })

  it('connects the visible delete action to the existing teacher-code delete endpoint', async () => {
    const user = userEvent.setup()
    render(<TeacherCodeList />)

    expect(await screen.findByText('ABC123')).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: '删除教师码 ABC123' }))

    expect(window.confirm).toHaveBeenCalled()
    expect(mockDelete).toHaveBeenCalledWith('/teacher-codes/code-1')
    expect(screen.queryByText('ABC123')).not.toBeInTheDocument()
  })
})
