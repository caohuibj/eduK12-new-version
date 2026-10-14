import { describe,expect,it,vi } from 'vitest'
import { fireEvent,render,screen } from '@testing-library/react'
import { ProductPasswordChange } from './ProductPasswordChange'

function type(label:string,value:string) {
  fireEvent.change(screen.getByLabelText(label),{target:{value}})
}
describe('reused dedicated-product password controls',()=>{
  it.each(['school','teacher'] as const)('%s preserves old password verification without a second product-specific account',product=>{
    const submit=vi.fn()
    render(<ProductPasswordChange product={product} busy={false} onChangePassword={submit}/>)
    expect(screen.queryByLabelText('验证器动态验证码（6 位）')).not.toBeInTheDocument()
    type('当前密码','CurrentPass123')
    type('新密码','NewPass456')
    fireEvent.click(screen.getByRole('button',{name:'确认修改密码'}))
    expect(submit).toHaveBeenCalledWith('CurrentPass123','NewPass456',undefined)
  })
  it('Survey requires existing TOTP rather than password-only authority',()=>{
    const submit=vi.fn()
    render(<ProductPasswordChange product="survey" busy={false} forced onChangePassword={submit}/>)
    expect(screen.getByText(/此账号需要先修改密码/)).toBeInTheDocument()
    type('当前密码','CurrentPass123')
    type('新密码','NewPass456')
    expect(screen.getByRole('button',{name:'确认修改密码'})).toBeDisabled()
    type('验证器动态验证码（6 位）','123456')
    fireEvent.click(screen.getByRole('button',{name:'确认修改密码'}))
    expect(submit).toHaveBeenCalledWith('CurrentPass123','NewPass456','123456')
  })
  it('does not offer a write for an unchanged password or while pending',()=>{
    render(<ProductPasswordChange product="teacher" busy={false} onChangePassword={vi.fn()}/>)
    type('当前密码','SamePass123')
    type('新密码','SamePass123')
    expect(screen.getByRole('button',{name:'确认修改密码'})).toBeDisabled()
  })
})
