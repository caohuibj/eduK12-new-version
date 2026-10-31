import {afterEach,describe,expect,it,vi} from 'vitest'
import {act,fireEvent,render,screen,waitFor} from '@testing-library/react'
import SchoolApp from './SchoolApp'
const user={id:'member',username:'school.member',role:'TEACHER',accountDomain:'SCHOOL',mustChangePassword:false}
const reply=(data:unknown,status=200)=>({ok:status===200,status,headers:new Headers(),json:async()=>({code:status===200?0:-1,message:'请求失败',data})})
afterEach(()=>vi.unstubAllGlobals())
async function fixture(options:{forced?:boolean;readStatus?:number;network?:boolean;mfa?:boolean;changeStatus?:number;stepUpStatus?:number;legacy?:boolean;loginStatus?:number}={}){
 window.history.replaceState(null,'','/login')
 let signed=false
 const fetcher=vi.fn(async(url:string)=>{
  if(url.endsWith('/auth/csrf'))return reply({csrfToken:'synthetic'})
  if(url.endsWith('/auth/login')){signed=true;return reply(options.mfa?{mfaRequired:true,enrolled:true}:{user:options.legacy?{id:user.id,username:user.username,role:user.role,accountDomain:user.accountDomain}:{...user,mustChangePassword:!!options.forced}},options.loginStatus??200)}
  if(url.endsWith('/auth/mfa/verify'))return reply({authenticated:true})
  if(url.endsWith('/auth/me'))return signed?reply({...user,mustChangePassword:!!options.forced}):reply(null,401)
  if(url.endsWith('/auth/change-password'))return reply(null,options.changeStatus??200)
  if(url.endsWith('/auth/mfa/step-up'))return reply(null,options.stepUpStatus??200)
  if(options.network)throw new TypeError('Failed to fetch')
  if(options.readStatus)return reply(null,options.readStatus)
  if(url.endsWith('/organizations'))return reply({list:[]})
  return reply({parentReportsEnabled:false})
 })
 vi.stubGlobal('fetch',fetcher);vi.stubGlobal('scrollTo',vi.fn())
 render(<SchoolApp/>);await screen.findByRole('heading',{name:'校园账号登录'})
 await waitFor(()=>expect(fetcher.mock.calls.filter(([url])=>url.endsWith('/auth/me'))).toHaveLength(1))
 fireEvent.change(screen.getByLabelText('用户名'),{target:{value:'school.member'}})
 fireEvent.change(screen.getByLabelText('密码'),{target:{value:'SyntheticPassword1'}})
 fireEvent.submit(screen.getAllByRole('button',{name:'登录'}).find(x=>x.closest('form'))!.closest('form')!)
 return fetcher
}
describe('School login safe projection and existing-request recovery',()=>{
 it('uses ordinary login projection without a second me request',async()=>{
  const fetcher=await fixture()
  await screen.findByRole('button',{name:'退出'})
  expect(fetcher.mock.calls.filter(([url])=>url.endsWith('/auth/me'))).toHaveLength(1)
 })
 it('keeps forced password change isolated without a second me request',async()=>{
  const fetcher=await fixture({forced:true})
  await screen.findByRole('heading',{name:'首次登录 · 修改密码'})
  expect(fetcher.mock.calls.filter(([url])=>url.endsWith('/auth/me'))).toHaveLength(1)
  expect(fetcher.mock.calls.some(([url])=>url.endsWith('/organizations')||url.includes('/reports/'))).toBe(false)
 })
 it('returns to login when an existing initial read rejects the new session',async()=>{
  const fetcher=await fixture({readStatus:401})
  await waitFor(()=>expect(fetcher.mock.calls.some(([url])=>url.endsWith('/organizations'))).toBe(true))
  await screen.findByRole('heading',{name:'校园账号登录'})
  expect(screen.queryByRole('button',{name:'退出'})).not.toBeInTheDocument()
 })
 it.each([{readStatus:503},{readStatus:403},{network:true}])('does not log out on a non-session read failure %j',async options=>{
  const fetcher=await fixture(options)
  await screen.findByRole('button',{name:'退出'})
  await waitFor(()=>expect(fetcher.mock.calls.some(([url])=>url.endsWith('/organizations'))).toBe(true))
  await act(async()=>{await Promise.resolve()})
  expect(screen.getByRole('button',{name:'退出'})).toBeInTheDocument()
 })
 it('keeps forced password form available after a wrong-password 401',async()=>{
  await fixture({forced:true,changeStatus:401})
  await screen.findByRole('heading',{name:'首次登录 · 修改密码'})
  fireEvent.change(await screen.findByLabelText('当前密码'),{target:{value:'OldPassword1'}})
  fireEvent.change(screen.getByLabelText('新密码'),{target:{value:'NewPassword2'}})
  fireEvent.click(screen.getByRole('button',{name:'确认修改密码'}))
  await screen.findByText('请求失败')
  expect(screen.getByRole('heading',{name:'首次登录 · 修改密码'})).toBeInTheDocument()
  expect(screen.queryByText('登录状态已失效，请重新登录')).not.toBeInTheDocument()
 })
 it('keeps the account page available after a wrong step-up code 401',async()=>{
  await fixture({stepUpStatus:401})
  await screen.findByRole('button',{name:'退出'})
  fireEvent.click(screen.getByRole('link',{name:'个人信息编辑'}))
  fireEvent.change(await screen.findByLabelText('验证器 6 位动态验证码'),{target:{value:'123456'}})
  fireEvent.click(screen.getByRole('button',{name:'重新验证高权限操作'}))
  await screen.findByText('请求失败')
  expect(screen.getByLabelText('验证器 6 位动态验证码')).toBeInTheDocument()
  expect(screen.getByRole('button',{name:'退出'})).toBeInTheDocument()
 })
 it('uses the existing me fallback for an older login response missing the forced-password flag',async()=>{
  const fetcher=await fixture({legacy:true,forced:true})
  await screen.findByRole('heading',{name:'首次登录 · 修改密码'})
  expect(fetcher.mock.calls.filter(([url])=>url.endsWith('/auth/me'))).toHaveLength(2)
  expect(fetcher.mock.calls.some(([url])=>url.endsWith('/organizations'))).toBe(false)
 })
 it('keeps an unauthenticated login error distinct from an expired session',async()=>{
  await fixture({loginStatus:401})
  await screen.findByText('请求失败')
  expect(screen.queryByText('登录状态已失效，请重新登录')).not.toBeInTheDocument()
 })
 it('retains MFA challenge and post-MFA me lookup',async()=>{
  const fetcher=await fixture({mfa:true})
  await screen.findByRole('heading',{name:'账号安全验证'})
  expect(fetcher.mock.calls.filter(([url])=>url.endsWith('/auth/me'))).toHaveLength(1)
  expect(fetcher.mock.calls.some(([url])=>url.endsWith('/organizations'))).toBe(false)
  const input=screen.getByLabelText('6 位动态验证码')
  fireEvent.change(input,{target:{value:'123456'}})
  fireEvent.click(screen.getByRole('button',{name:'完成登录'}))
  await screen.findByRole('button',{name:'退出'})
  expect(fetcher.mock.calls.filter(([url])=>url.endsWith('/auth/me'))).toHaveLength(2)
 })
})
