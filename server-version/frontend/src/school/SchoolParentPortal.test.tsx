import { describe,it,expect,vi } from 'vitest'
import { fireEvent,render,screen,waitFor } from '@testing-library/react'
import { SchoolParentRegistration, SchoolParentLinks } from './SchoolParentPortal'
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


describe('School parent relationship presentation',()=>{
 it('keeps status actions and consent available while folding long explanations',async()=>{
  const api=vi.fn(async(path:string)=>path==='/parent-links'?{list:[{id:'active',status:'ACTIVE'},{id:'pending',status:'PENDING'},{id:'revoked',status:'REVOKED'}],truncated:false,canApprove:false}:{version:'v1',text:'完整关系确认文本',reminder:'独立报告授权提醒'})
  render(<SchoolParentLinks api={api as SchoolApi} role="PARENT"/>)
  await screen.findByText('有效亲子关系',{exact:false})
  expect(screen.getByText('等待孩子确认',{exact:false})).toBeInTheDocument()
  expect(screen.getByText('关系已撤销',{exact:false})).toBeInTheDocument()
  expect(screen.getAllByRole('button',{name:'撤销关联'})).toHaveLength(2)
  expect(screen.queryByRole('button',{name:'确认监护人关系'})).not.toBeInTheDocument()
  const help=screen.getByRole('button',{name:'亲子关联与隐私说明'})
  expect(help).toHaveAttribute('aria-expanded','false')
  expect(screen.queryByText('完整关系确认文本')).not.toBeInTheDocument()
  fireEvent.click(help)
  expect(screen.getByText('完整关系确认文本')).toBeInTheDocument()
  expect(screen.getByText('独立报告授权提醒')).toBeInTheDocument()
  fireEvent.scroll(document)
  expect(help).toHaveAttribute('aria-expanded','false')
  expect(api.mock.calls.every(call=>call.length===1)).toBe(true)
 })
 it('retains the 24-character invitation gate and existing claim request',async()=>{
  const api=vi.fn(async(path:string)=>path==='/parent-links'?{list:[],truncated:false,canApprove:false}:{version:'v1',text:'关系确认',reminder:'独立授权'})
  render(<SchoolParentLinks api={api as SchoolApi} role="PARENT"/>)
  await screen.findByText('目前没有亲子关联记录。')
  const claim=screen.getByRole('button',{name:'申请关联'})
  const input=screen.getByLabelText('亲子邀请码')
  expect(claim).toBeDisabled()
  fireEvent.change(input,{target:{value:'short'}})
  expect(claim).toBeDisabled()
  fireEvent.change(input,{target:{value:'abcdefghijklmnopqrstuvwx'}})
  expect(claim).toBeEnabled()
  fireEvent.click(claim)
  await screen.findByText('关联申请已发送，等待孩子确认。')
  expect(api).toHaveBeenCalledWith('/parent-links/claims','POST',{inviteCode:'abcdefghijklmnopqrstuvwx'})
  expect(input).toHaveValue('')
  expect(claim).toBeDisabled()
 })
})
