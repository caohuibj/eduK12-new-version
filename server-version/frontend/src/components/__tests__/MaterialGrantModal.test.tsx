import { beforeEach, describe, expect, it, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'

const { mockList, mockListTeachers, mockSet, mockBatch, mockRemove } = vi.hoisted(() => ({
  mockList: vi.fn(),
  mockListTeachers: vi.fn(),
  mockSet: vi.fn(),
  mockBatch: vi.fn(),
  mockRemove: vi.fn(),
}))

vi.mock('../../api/materialGrants', async () => {
  const actual = await vi.importActual<typeof import('../../api/materialGrants')>('../../api/materialGrants')
  return {
    ...actual,
    materialGrantApi: {
      list: mockList,
      listTeachers: mockListTeachers,
      set: mockSet,
      batch: mockBatch,
      remove: mockRemove,
    },
  }
})

import MaterialGrantModal from '../MaterialGrantModal'

const teacher = (id: string, username: string, nickname: string) => ({
  id,
  username,
  nickname,
  role: 'TEACHER' as const,
  teacherApproved: true,
  isActive: true,
  isFrozen: false,
})

describe('MaterialGrantModal save', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockListTeachers.mockResolvedValue({
      code: 0,
      data: { list: [teacher('t1', 'tea1', '甲'), teacher('t2', 'tea2', '乙')], total: 2 },
    })
    mockList.mockResolvedValue({
      code: 0,
      data: {
        list: [{
          id: 'g1',
          teacherId: 't1',
          resourceType: 'SCALE',
          resourceId: 'scale-1',
          grantedBy: 'a1',
          createdAt: '2026-01-01',
          teacher: { id: 't1', username: 'tea1', nickname: '甲', role: 'TEACHER' },
          granter: null,
          resource: { id: 'scale-1', name: '焦虑量表' },
          resourceMissing: false,
        }],
      },
    })
    mockSet.mockResolvedValue({ code: 0, data: { list: [] } })
  })

  it('saves the checked list with one set call instead of batch-then-revoke', async () => {
    const user = userEvent.setup()
    const onClose = vi.fn()
    render(
      <MaterialGrantModal
        resourceType="SCALE"
        resourceId="scale-1"
        resourceName="焦虑量表"
        onClose={onClose}
      />,
    )
    expect(await screen.findByText('甲（tea1）')).toBeInTheDocument()
    await user.click(screen.getByLabelText('甲（tea1）'))
    await user.click(screen.getByLabelText('乙（tea2）'))
    await user.click(screen.getByRole('button', { name: '保存' }))
    expect(mockSet).toHaveBeenCalledWith({
      resourceType: 'SCALE',
      resourceId: 'scale-1',
      teacherIds: ['t2'],
    })
    expect(mockBatch).not.toHaveBeenCalled()
    expect(mockRemove).not.toHaveBeenCalled()
    expect(onClose).toHaveBeenCalled()
  })

  it('keeps existing grants for teachers who are no longer in the eligible picker', async () => {
    mockList.mockResolvedValue({
      code: 0,
      data: {
        list: [{
          id: 'g-frozen',
          teacherId: 'frozen-1',
          resourceType: 'SCALE',
          resourceId: 'scale-1',
          grantedBy: 'a1',
          createdAt: '2026-01-01',
          teacher: { id: 'frozen-1', username: 'old', nickname: '已冻结', role: 'TEACHER' },
          granter: null,
          resource: { id: 'scale-1', name: '焦虑量表' },
          resourceMissing: false,
        }],
      },
    })
    const user = userEvent.setup()
    render(
      <MaterialGrantModal
        resourceType="SCALE"
        resourceId="scale-1"
        resourceName="焦虑量表"
        onClose={vi.fn()}
      />,
    )
    expect(await screen.findByText('甲（tea1）')).toBeInTheDocument()
    expect(screen.queryByText('已冻结（old）')).not.toBeInTheDocument()
    await user.click(screen.getByLabelText('乙（tea2）'))
    await user.click(screen.getByRole('button', { name: '保存' }))
    expect(mockSet).toHaveBeenCalledWith({
      resourceType: 'SCALE',
      resourceId: 'scale-1',
      teacherIds: expect.arrayContaining(['frozen-1', 't2']),
    })
    expect(mockSet.mock.calls[0][0].teacherIds).toHaveLength(2)
  })

  it('shows a save error instead of closing when set fails', async () => {
    mockSet.mockRejectedValue({ message: '网络中断' })
    const user = userEvent.setup()
    const onClose = vi.fn()
    render(
      <MaterialGrantModal
        resourceType="SCALE"
        resourceId="scale-1"
        resourceName="焦虑量表"
        onClose={onClose}
      />,
    )
    expect(await screen.findByText('甲（tea1）')).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: '保存' }))
    expect(await screen.findByText('网络中断')).toBeInTheDocument()
    expect(onClose).not.toHaveBeenCalled()
  })
})
