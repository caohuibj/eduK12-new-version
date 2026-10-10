import {describe,it,expect,vi,afterEach} from 'vitest'
import {fireEvent,render,screen,waitFor} from '@testing-library/react'
import SchoolApp from './SchoolApp'
const reply=(data:unknown,status=200)=>({ok:status===200,status,json:async()=>({code:status===200?0:-1,message:'失败',data})})
afterEach(()=>vi.unstubAllGlobals())
describe('campus login preserves server MFA decisions',()=>{
 it.each([true,false])('uses enrolled=%s from login response',async enrolled=>{
  const requests:Array<{url:string;body?:unknown}>=[]
  vi.stubGlobal('scrollTo',vi.fn())
  vi.stubGlobal('fetch',vi.fn(async(url:string,options?:RequestInit)=>{
   requests.push({url,body:options?.body?JSON.parse(String(options.body)):undefined})
   if(url.endsWith('/auth/csrf'))return reply({csrfToken:'synthetic-test-csrf'})
   if(url.endsWith('/auth/login'))return reply({mfaRequired:true,enrolled})
   return reply(null,401)
  }))
  render(<SchoolApp/>); await screen.findByRole('heading',{name:'在更好的环境中 看见每一个独特的你'})
  fireEvent.click(screen.getByRole('button',{name:'登录',exact:true}))
  fireEvent.change(screen.getByLabelText('用户名'),{target:{value:'test.teacher'}})
  fireEvent.change(screen.getByLabelText('密码'),{target:{value:'SyntheticTestPassword1'}})
  fireEvent.submit(screen.getAllByRole('button',{name:'登录',exact:true})[1].closest('form')!)
  await screen.findByRole('heading',{name:'账号安全验证'})
  expect(requests.find(r=>r.url.endsWith('/auth/login'))?.body).toEqual({username:'test.teacher',password:'SyntheticTestPassword1'})
  expect(screen.queryByRole('button',{name:'开始绑定验证器'})).toBe(enrolled?null:screen.getByRole('button',{name:'开始绑定验证器'}))
  expect(requests.some(r=>r.url.endsWith('/organizations'))).toBe(false)
 })
 it('requires no role selection when login is allowed without MFA',async()=>{
  let signed=false
  vi.stubGlobal('scrollTo',vi.fn())
  vi.stubGlobal('fetch',vi.fn(async(url:string)=>{
   if(url.endsWith('/auth/csrf'))return reply({csrfToken:'synthetic-test-csrf'})
   if(url.endsWith('/auth/login')){signed=true;return reply({})}
   if(url.endsWith('/auth/me'))return signed?reply({id:'synthetic',username:'test.teacher',role:'TEACHER',accountDomain:'SCHOOL'}):reply(null,401)
   if(url.endsWith('/organizations'))return reply({list:[]})
   return reply({parentReportsEnabled:false})
  }))
  render(<SchoolApp/>);await screen.findByRole('heading',{name:'在更好的环境中 看见每一个独特的你'})
  fireEvent.click(screen.getByRole('button',{name:'登录',exact:true}))
  fireEvent.change(screen.getByLabelText('用户名'),{target:{value:'test.teacher'}})
  fireEvent.change(screen.getByLabelText('密码'),{target:{value:'SyntheticTestPassword1'}})
  fireEvent.submit(screen.getAllByRole('button',{name:'登录',exact:true})[1].closest('form')!)
  await waitFor(()=>expect(screen.getByRole('heading',{name:'欢迎，test.teacher'})).toBeInTheDocument())
  expect(screen.queryByRole('heading',{name:'账号安全验证'})).not.toBeInTheDocument()
 })
})
