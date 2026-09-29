import { beforeEach, describe, expect, it, vi } from 'vitest'
import { act, render, screen } from '@testing-library/react'
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

  it.each([
    ['teachers', { code: 403, message: '教师读取失败' }],
    ['grants', { code: 503, message: '授权读取失败' }],
    ['teachers', { code: 0, data: {} }],
    ['grants', { code: 0, data: {} }],
    ['teachers', { code: 0, data: { list: [], total: 1 } }],
    ['grants', { code: 0, data: { list: [{}] } }],
  ])('blocks replacement when %s read is unsuccessful or incomplete (%j)', async (source, response) => {
    const user = userEvent.setup()
    ;(source === 'teachers' ? mockListTeachers : mockList).mockResolvedValueOnce(response)
    render(<MaterialGrantModal resourceType="SCALE" resourceId="scale-1" resourceName="量表" onClose={vi.fn()} />)
    expect(await screen.findByRole('alert')).toHaveTextContent('读取成功前无法修改或保存授权')
    expect(screen.queryByText('没有可授权的已审教师')).not.toBeInTheDocument()
    expect(screen.queryByRole('checkbox')).not.toBeInTheDocument()
    expect(screen.getByRole('button', { name: '保存' })).toBeDisabled()
    await user.click(screen.getByRole('button', { name: '保存' }))
    expect(mockSet).not.toHaveBeenCalled()
    await user.click(screen.getByRole('button', { name: '重新加载' }))
    expect(await screen.findByLabelText('甲（tea1）')).toBeChecked()
    expect(screen.getByRole('button', { name: '保存' })).toBeEnabled()
    expect(mockListTeachers).toHaveBeenCalledTimes(2)
    expect(mockList).toHaveBeenCalledTimes(2)
  })

  it('keeps save blocked while either read is pending, and after a network rejection', async () => {
    let reject!: (error: Error) => void
    mockList.mockReturnValueOnce(new Promise((_, fail) => { reject = fail }))
    render(<MaterialGrantModal resourceType="SCALE" resourceId="scale-1" resourceName="量表" onClose={vi.fn()} />)
    expect(screen.getByRole('button', { name: '保存' })).toBeDisabled()
    await act(async () => { reject(new Error('网络中断')) })
    expect(screen.getByRole('alert')).toHaveTextContent('网络中断')
    expect(screen.getByRole('button', { name: '保存' })).toBeDisabled()
    expect(mockSet).not.toHaveBeenCalled()
  })

  it('allows intentionally clearing all grants after a complete read', async () => {
    const user = userEvent.setup()
    render(<MaterialGrantModal resourceType="SCALE" resourceId="scale-1" resourceName="量表" onClose={vi.fn()} />)
    await user.click(await screen.findByLabelText('甲（tea1）'))
    await user.click(screen.getByRole('button', { name: '保存' }))
    expect(mockSet).toHaveBeenCalledWith({ resourceType: 'SCALE', resourceId: 'scale-1', teacherIds: [] })
  })

  it('ignores a late read for a previous resource', async () => {
    let resolve!: (value: unknown) => void
    mockList.mockReturnValueOnce(new Promise(done => { resolve = done }))
    const props = { resourceType: 'SCALE' as const, resourceName: '量表', onClose: vi.fn() }
    const view = render(<MaterialGrantModal {...props} resourceId="old" />)
    view.rerender(<MaterialGrantModal {...props} resourceId="new" />)
    expect(screen.getByRole('button', { name: '保存' })).toBeDisabled()
    expect(await screen.findByLabelText('甲（tea1）')).toBeChecked()
    await act(async () => { resolve({ code: 0, data: { list: [{ teacherId: 't2' }] } }) })
    expect(screen.getByLabelText('甲（tea1）')).toBeChecked()
    expect(screen.getByLabelText('乙（tea2）')).not.toBeChecked()
    await userEvent.setup().click(screen.getByRole('button', { name: '保存' }))
    expect(mockSet).toHaveBeenCalledWith({ resourceType: 'SCALE', resourceId: 'new', teacherIds: ['t1'] })
  })

  it('locks changes, repeat saves and dismissal during save, then permits retry on failure', async () => {
    let resolve!: (value: unknown) => void
    mockSet.mockReturnValueOnce(new Promise(done => { resolve = done }))
    const onClose = vi.fn()
    const user = userEvent.setup()
    render(<MaterialGrantModal resourceType="SCALE" resourceId="scale-1" resourceName="量表" onClose={onClose} />)
    await screen.findByLabelText('甲（tea1）')
    await user.dblClick(screen.getByRole('button', { name: '保存' }))
    expect(mockSet).toHaveBeenCalledTimes(1)
    expect(screen.getByLabelText('甲（tea1）')).toBeDisabled()
    expect(screen.getByRole('button', { name: '关闭' })).toBeDisabled()
    expect(screen.getByRole('button', { name: '取消' })).toBeDisabled()
    await user.keyboard('{Escape}')
    expect(onClose).not.toHaveBeenCalled()
    await act(async () => { resolve({ code: 500, message: '保存失败' }) })
    expect(screen.getByRole('alert')).toHaveTextContent('保存失败')
    expect(screen.getByLabelText('甲（tea1）')).toBeChecked()
    expect(screen.getByRole('button', { name: '保存' })).toBeEnabled()
    await user.click(screen.getByRole('button', { name: '保存' }))
    expect(onClose).toHaveBeenCalledTimes(1)
  })

  it('does not close a new resource when the old resource save completes', async () => {
    let resolve!: (value: unknown) => void
    mockSet.mockReturnValueOnce(new Promise(done => { resolve = done }))
    const props = { resourceType: 'SCALE' as const, resourceName: '量表', onClose: vi.fn() }
    const view = render(<MaterialGrantModal {...props} resourceId="old" />)
    await screen.findByLabelText('甲（tea1）')
    await userEvent.setup().click(screen.getByRole('button', { name: '保存' }))
    view.rerender(<MaterialGrantModal {...props} resourceId="new" />)
    await screen.findByLabelText('甲（tea1）')
    await act(async () => { resolve({ code: 0 }) })
    expect(props.onClose).not.toHaveBeenCalled()
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
