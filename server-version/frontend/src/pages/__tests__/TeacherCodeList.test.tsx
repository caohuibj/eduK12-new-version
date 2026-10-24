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
    expect(screen.getByRole('dialog', { name: '确认操作' })).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: '确认' }))

    expect(mockDelete).toHaveBeenCalledWith('/teacher-codes/code-1')
    expect(screen.queryByText('ABC123')).not.toBeInTheDocument()
  })
})

describe('Training registration code settings',()=>{
  beforeEach(()=>{
    vi.clearAllMocks()
    mockGet.mockResolvedValue({code:0,data:{list:[{id:'old',code:'ABCD2345',isActive:true,maxUses:1,usedCount:0,createdAt:'2026-01-01T00:00:00Z',expiresAt:null},{id:'expired',code:'EFGH2345',isActive:true,maxUses:1,usedCount:0,createdAt:'2026-01-01T00:00:00Z',expiresAt:'2020-01-01T00:00:00Z',accountValidityDays:90}]}})
    mockPost.mockResolvedValue({code:0,data:{}})
  })
  it('shows both terms, accurate expiry and collapsed details without a repeated title',async()=>{
    render(<TeacherCodeList training/>);
    expect(await screen.findByText('ABCD2345')).toBeInTheDocument()
    expect(screen.getByText('注册后 1 年')).toBeInTheDocument()
    expect(screen.getByText('注册后 90 天')).toBeInTheDocument()
    expect(screen.getByText('已过期')).toBeInTheDocument()
    expect(screen.queryByRole('heading')).not.toBeInTheDocument()
    expect(screen.queryByLabelText('注册码有效期')).not.toBeInTheDocument()
    expect(document.querySelector('details')?.open).toBe(false)
  })
  it('submits separate redemption deadline and account duration only after confirmation',async()=>{
    const user=userEvent.setup();render(<TeacherCodeList training/>);
    await screen.findByText('ABCD2345')
    await user.click(screen.getByRole('button',{name:'生成注册码'}))
    expect(mockPost).not.toHaveBeenCalled()
    await user.selectOptions(screen.getByLabelText('注册码有效期'),'custom')
    await user.type(screen.getByLabelText('注册码截止时间'),'2099-01-01T12:00')
    await user.selectOptions(screen.getByLabelText('注册后账号有效期'),'custom')
    await user.clear(screen.getByLabelText('账号有效天数'))
    await user.type(screen.getByLabelText('账号有效天数'),'180')
    await user.click(screen.getByRole('button',{name:'确认生成'}))
    expect(mockPost).toHaveBeenCalledWith('/teacher-codes',{maxUses:1,expiresAt:new Date('2099-01-01T12:00').toISOString(),accountValidityDays:180})
  })
  it('preserves unlimited redemption and one-year account defaults',async()=>{
    const user=userEvent.setup();render(<TeacherCodeList training/>);await screen.findByText('ABCD2345')
    await user.click(screen.getByRole('button',{name:'生成注册码'}));await user.click(screen.getByRole('button',{name:'确认生成'}))
    expect(mockPost).toHaveBeenCalledWith('/teacher-codes',{maxUses:1})
  })
  it('rejects a past redemption deadline without creating a code',async()=>{
    const user=userEvent.setup();render(<TeacherCodeList training/>);await screen.findByText('ABCD2345')
    await user.click(screen.getByRole('button',{name:'生成注册码'}));await user.selectOptions(screen.getByLabelText('注册码有效期'),'custom');await user.type(screen.getByLabelText('注册码截止时间'),'2020-01-01T12:00');await user.click(screen.getByRole('button',{name:'确认生成'}))
    expect(screen.getByRole('alert')).toHaveTextContent('晚于当前时间');expect(mockPost).not.toHaveBeenCalled()
  })
})
