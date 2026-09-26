import { beforeEach, expect, it, vi } from 'vitest'
import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { PublicDeliveryManager } from '../PublicDeliveryManager'
const api=vi.hoisted(()=>({get:vi.fn(),post:vi.fn(),delete:vi.fn()}))
vi.mock('../../api/client',()=>({default:api,sessionFetch:vi.fn()}))
const row={id:'link',token:'opaque',createdAt:'2026-01-01T00:00:00Z',expiresAt:'2099-01-01T00:00:00Z',maxUses:3,usedCount:3,isActive:true}
beforeEach(()=>{vi.clearAllMocks();api.get.mockResolvedValue({code:0,data:{list:[row]}});api.delete.mockResolvedValue({code:0})})
it('uses real quota fields, disables the selected link, and clears tokens on permission loss',async()=>{
  render(<PublicDeliveryManager family="QUESTIONNAIRE" resourceId="q" />)
  expect(await screen.findByText(/已使用 3 次.*已用尽/)).toBeInTheDocument()
  await userEvent.click(screen.getByRole('button',{name:'停用此链接'}))
  expect(api.delete).toHaveBeenCalledWith('/general-questionnaires/q/tokens/link')
  expect(await screen.findByText(/已使用 3 次.*已停用/)).toBeInTheDocument()
  api.get.mockRejectedValueOnce(new Error('权限已撤销'))
  await userEvent.click(screen.getByRole('button',{name:'刷新链接'}))
  expect(await screen.findByRole('alert')).toHaveTextContent('权限已撤销')
  expect(screen.queryByText(/\/opaque/)).not.toBeInTheDocument()
})
it('does not turn empty, fractional, or negative quotas into unlimited links',async()=>{
  render(<PublicDeliveryManager family="QUESTIONNAIRE" resourceId="q" />)
  await screen.findByText(/已使用 3 次/)
  fireEvent.change(screen.getByLabelText('有效期'), {target:{value:'2099-01-01T12:00'}})
  for(const value of ['', '1.5', '-1']) {
    const field=screen.getByLabelText('最大参与次数（0 表示不限）')
    await userEvent.clear(field);if(value)await userEvent.type(field,value)
    await userEvent.click(screen.getByRole('button',{name:'生成新链接'}))
    await waitFor(()=>expect(screen.getByRole('alert')).toBeInTheDocument())
    expect(api.post).not.toHaveBeenCalled()
  }
})
it('does not retain links when switching resources',async()=>{
  const view=render(<PublicDeliveryManager family="QUESTIONNAIRE" resourceId="q" />)
  await screen.findByText(/\/opaque/)
  api.get.mockResolvedValueOnce({code:0,data:{list:[]}})
  view.rerender(<PublicDeliveryManager family="QUESTIONNAIRE" resourceId="other" />)
  await waitFor(()=>expect(screen.queryByText(/\/opaque/)).not.toBeInTheDocument())
})
