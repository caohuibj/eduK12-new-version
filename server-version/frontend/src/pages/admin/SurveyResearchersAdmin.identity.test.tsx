import {fireEvent,render,screen,waitFor} from '@testing-library/react'
import {beforeEach,describe,it,expect,vi} from 'vitest'
const session=vi.hoisted(()=>({user:{id:'manager-1'} as {id:string}|null}))
vi.mock('../../contexts/AuthContext',()=>({useAuth:()=>session}))
import SurveyResearchersAdmin from './SurveyResearchersAdmin'
beforeEach(()=>{
 session.user={id:'manager-1'}
 vi.stubGlobal('fetch',vi.fn(async()=>({ok:true,status:200,json:async()=>({code:0,message:'OK',data:{list:[]}})})))
})
describe('Survey production manager account boundary',()=>{
 it('resets workspace and transient password when the authenticated account changes',async()=>{
  const view=render(<SurveyResearchersAdmin/>)
  const password=await screen.findByLabelText('当前管理员密码（敏感操作再次验证）')
  fireEvent.change(password,{target:{value:'synthetic-local-password'}});expect(password).toHaveValue('synthetic-local-password')
  session.user={id:'manager-2'};view.rerender(<SurveyResearchersAdmin/>)
  await waitFor(()=>expect(screen.getByLabelText('当前管理员密码（敏感操作再次验证）')).toHaveValue(''))
 })
 it('removes all manager state when no authenticated account remains',async()=>{
  const view=render(<SurveyResearchersAdmin/>);await screen.findByLabelText('当前管理员密码（敏感操作再次验证）')
  session.user=null;view.rerender(<SurveyResearchersAdmin/>)
  expect(screen.queryByLabelText('当前管理员密码（敏感操作再次验证）')).toBeNull()
 })
})
