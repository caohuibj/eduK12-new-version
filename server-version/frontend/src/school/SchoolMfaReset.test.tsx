import {fireEvent,render,screen,waitFor} from '@testing-library/react'
import {describe,it,expect,vi} from 'vitest'
import {SchoolMfaReset} from './SchoolMfaReset'
import type {SchoolApi} from './SchoolRecovery'
describe('School two-administrator MFA recovery',()=>{
 it('requires independent verification and hands the request to another administrator',async()=>{
  const confirm=vi.spyOn(window,'confirm').mockReturnValue(true)
  const request={id:'request',targetLabel:'counselor',requestedByLabel:'admin-a',reasonCode:'DEVICE_LOST',expiresAt:'2026-11-23T10:00:00Z',canApprove:false}
  let requested=false
  const api=vi.fn(async(_path:string,method='GET',body?:any)=>{
   if(method==='POST'){expect(body).toEqual({targetUserId:'target',reasonCode:'DEVICE_LOST'});requested=true;return {requestId:'request'}}
   return {targets:requested?[]:[{userId:'target',label:'counselor'}],requests:requested?[request]:[],truncated:false}
  })
  const first=render(<SchoolMfaReset api={api as SchoolApi} organizationId="school"/>)
  await screen.findByRole('option',{name:'counselor'})
  fireEvent.change(screen.getByLabelText('需要恢复验证器的校园账号'),{target:{value:'target'}})
  expect(screen.getByRole('button',{name:'申请验证器重置'})).toBeDisabled()
  fireEvent.click(screen.getByRole('checkbox'))
  fireEvent.click(screen.getByRole('button',{name:'申请验证器重置'}))
  await screen.findByText('这是你发起的申请，必须由另一名管理员审批。')
  expect(screen.queryByRole('button',{name:'独立核实并批准重置'})).not.toBeInTheDocument()
  first.unmount()
  let approved=false
  const second=vi.fn(async(path:string,method='GET')=>{
   if(method==='POST'){expect(path).toBe('/organizations/school/mfa-resets/request/approve');approved=true;return {reset:true}}
   return {targets:[],requests:approved?[]:[{...request,canApprove:true}],truncated:false}
  })
  render(<SchoolMfaReset api={second as SchoolApi} organizationId="school"/>)
  fireEvent.click(await screen.findByRole('button',{name:'独立核实并批准重置'}))
  await waitFor(()=>expect(screen.getByRole('status')).toHaveTextContent('验证器重置已批准'))
  expect(screen.queryByRole('button',{name:'独立核实并批准重置'})).not.toBeInTheDocument()
  confirm.mockRestore()
 })
 it('does not offer mutations when the protected directory read is denied',async()=>{
  const api=vi.fn(async()=>{throw Error('敏感操作需要重新验证动态验证码')})
  render(<SchoolMfaReset api={api as SchoolApi} organizationId="school"/>)
  expect(await screen.findByRole('alert')).toHaveTextContent('先完成上方二次验证')
  expect(screen.queryByRole('button',{name:'申请验证器重置'})).not.toBeInTheDocument()
 })
})
