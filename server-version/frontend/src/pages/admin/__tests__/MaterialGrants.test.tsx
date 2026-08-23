import { beforeEach, describe, expect, it, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'

const { mockList, mockRemove } = vi.hoisted(() => ({
  mockList: vi.fn(),
  mockRemove: vi.fn(),
}))

vi.mock('../../../api/materialGrants', () => ({
  materialGrantApi: {
    list: mockList,
    remove: mockRemove,
  },
}))

import MaterialGrants from '../MaterialGrants'

describe('MaterialGrants overview', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockList.mockResolvedValue({
      code: 0,
      data: {
        list: [{
          id: 'g1',
          teacherId: 't1',
          resourceType: 'SCALE',
          resourceId: 's1',
          grantedBy: 'a1',
          createdAt: '2026-01-01',
          teacher: { id: 't1', username: 'tea', nickname: '教师', role: 'TEACHER' },
          granter: null,
          resource: { id: 's1', name: '焦虑量表' },
          resourceMissing: false,
        }],
      },
    })
  })

  it('shows a revoke error instead of an unhandled rejection', async () => {
    mockRemove.mockRejectedValue({ message: '网络中断' })
    vi.spyOn(window, 'confirm').mockReturnValue(true)
    const user = userEvent.setup()
    render(<MaterialGrants />)
    expect(await screen.findByText('焦虑量表')).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: '撤销' }))
    expect(await screen.findByText('网络中断')).toBeInTheDocument()
  })
})
