import { describe,it,expect,vi } from 'vitest'
import { fireEvent,render,screen,waitFor } from '@testing-library/react'
import { SchoolParentRegistration } from './SchoolParentPortal'
import type { SchoolApi } from './SchoolRecovery'

describe('Huischool independent parent onboarding',()=>{
  it('requires explicit guardian acknowledgement and never calls legacy registration',async()=>{
    const api=vi.fn(async(_path:string)=>({status:'PENDING_STUDENT_CONFIRMATION'}))
    const complete=vi.fn()
    render(<SchoolParentRegistration api={api as SchoolApi} onRegistered={complete}/>)
    const button=screen.getByRole('button',{name:'创建独立校园家长账号'})
    expect(button).toBeDisabled()
    fireEvent.change(screen.getByLabelText('一次性亲子邀请码（15 分钟内有效）'),{
      target:{value:'a12345678901234567890123'},
    })
    fireEvent.change(screen.getByLabelText('自选校园用户名'),{target:{value:'parentpilot'}})
    fireEvent.change(screen.getByLabelText('自选密码'),{target:{value:'StrongPrivatePass123'}})
    fireEvent.click(screen.getByRole('checkbox'))
    expect(button).toBeEnabled()
    fireEvent.click(button)
    await waitFor(()=>expect(complete).toHaveBeenCalledTimes(1))
    expect(api).toHaveBeenCalledWith('/parents/register','POST',{
      inviteCode:'a12345678901234567890123',username:'parentpilot',
      password:'StrongPrivatePass123',guardianAcknowledged:true,
    })
    expect(api.mock.calls.every(([path])=>path.startsWith('/'))).toBe(true)
  })
  it('carries a verified code into the original guardian-consented registration',async()=>{
    const api=vi.fn(async()=>({status:'PENDING_STUDENT_CONFIRMATION'})),complete=vi.fn()
    render(<SchoolParentRegistration api={api as SchoolApi} onRegistered={complete} resolvedInviteCode="abcdefghijklmnopqrstuvwx"/>)
    expect(screen.getByRole('heading',{name:'创建家长账号'})).toBeInTheDocument()
    expect(screen.queryByLabelText('一次性亲子邀请码（15 分钟内有效）')).not.toBeInTheDocument()
    fireEvent.change(screen.getByLabelText('自选校园用户名'),{target:{value:'test.parent'}})
    fireEvent.change(screen.getByLabelText('自选密码'),{target:{value:'SyntheticPassword123'}})
    fireEvent.click(screen.getByRole('checkbox'));fireEvent.click(screen.getByRole('button',{name:'创建独立校园家长账号'}))
    await waitFor(()=>expect(complete).toHaveBeenCalledOnce())
    expect(api).toHaveBeenCalledWith('/parents/register','POST',{inviteCode:'abcdefghijklmnopqrstuvwx',username:'test.parent',password:'SyntheticPassword123',guardianAcknowledged:true})
  })

})
