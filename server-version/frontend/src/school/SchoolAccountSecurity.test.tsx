import {afterEach,describe,expect,it,vi} from 'vitest'
import {act,fireEvent,render,screen,waitFor} from '@testing-library/react'
import SchoolApp from './SchoolApp'

type Access={orgRole:string;canGovern:boolean;personas:string[];capabilities:string[];explicitDenies:string[]}
const ordinary:Access={orgRole:'MEMBER',canGovern:false,personas:['TEACHER'],capabilities:[],explicitDenies:[]}
const privilegedCases:Array<[string,string,Access]>=[
 ['administrator','ADMIN',ordinary],
 ['school governor','TEACHER',{...ordinary,orgRole:'ORG_ADMIN',canGovern:true}],
 ['psychology staff','TEACHER',{...ordinary,personas:['COUNSELOR'],capabilities:['PSYCHOLOGY_STAFF']}],
 ['report officer','TEACHER',{...ordinary,capabilities:['PARENT_REPORT_DISCLOSURE']}],
]
const reply=(data:unknown)=>({ok:true,status:200,headers:new Headers(),json:async()=>({code:0,message:'成功',data})})
function setup(role:string,access:Access|Promise<Access>){
 window.history.replaceState(null,'','/workspace/account?organizationId=school')
 vi.stubGlobal('scrollTo',vi.fn())
 const request=vi.fn(async(url:string,options?:RequestInit)=>{
  if(url.endsWith('/auth/me'))return reply({id:'account',username:'校园账号',role,accountDomain:'SCHOOL',mustChangePassword:false})
  if(url.endsWith('/organizations'))return reply({list:[{id:'school',name:'学校',orgRole:'MEMBER'}]})
  if(url.endsWith('/context'))return reply({access:await access})
  if(url.endsWith('/auth/csrf'))return reply({csrfToken:'synthetic-security-csrf'})
  if(url.endsWith('/auth/mfa/step-up')&&options?.method==='POST')return reply({})
  if(url.endsWith('/mfa-resets'))return reply({targets:[],requests:[],truncated:false})
  return reply({list:[],parentReportsEnabled:false,canAuthor:false})
 })
 vi.stubGlobal('fetch',request)
 render(<SchoolApp/> )
 return request
}
afterEach(()=>{vi.unstubAllGlobals();window.history.replaceState(null,'','/')})
describe('School account security follows current privileged capabilities',()=>{
 it.each(['TEACHER','HOMEROOM_TEACHER'])('does not ask an ordinary %s for an unavailable authenticator',async persona=>{
  const request=setup('TEACHER',{...ordinary,personas:[persona]})
  await screen.findByRole('heading',{name:'校园账号'})
  await waitFor(()=>expect(request.mock.calls.some(([url])=>url.endsWith('/context'))).toBe(true))
  await screen.findByLabelText('当前密码')
  expect(screen.queryByLabelText('验证器 6 位动态验证码')).not.toBeInTheDocument()
  expect(screen.queryByRole('button',{name:'重新验证高权限操作'})).not.toBeInTheDocument()
  expect(request.mock.calls.some(([url])=>url.includes('/mfa/'))).toBe(false)
 })
 it.each(privilegedCases)('preserves the existing six-digit step-up for %s',async(_label,role,access)=>{
  const request=setup(role,access)
  const code=await screen.findByLabelText('验证器 6 位动态验证码')
  const button=screen.getByRole('button',{name:'重新验证高权限操作'})
  fireEvent.change(code,{target:{value:'123'}});expect(button).toBeDisabled()
  fireEvent.change(code,{target:{value:'123456'}});fireEvent.click(button)
  await screen.findByText('高权限操作已重新验证，有效期五分钟。')
  const operation=request.mock.calls.find(([url])=>url.endsWith('/auth/mfa/step-up'))
  expect(operation?.[1]?.method).toBe('POST')
  expect(JSON.parse(String(operation?.[1]?.body))).toEqual({code:'123456'})
  expect(code).toHaveValue('')
 })
 it.each(['PSYCHOLOGY_STAFF','*'])('does not offer a denied specialty as a reason to verify (%s)',async denied=>{
  const request=setup('TEACHER',{...ordinary,personas:['COUNSELOR'],capabilities:['PSYCHOLOGY_STAFF'],explicitDenies:[denied]})
  await screen.findByRole('heading',{name:'校园账号'})
  await waitFor(()=>expect(request.mock.calls.some(([url])=>url.endsWith('/context'))).toBe(true))
  await act(async()=>{await Promise.resolve()})
  expect(screen.queryByLabelText('验证器 6 位动态验证码')).not.toBeInTheDocument()
 })
 it('waits for privilege context instead of assuming a teacher has MFA from the role',async()=>{
  let resolve!:(value:Access)=>void
  const pending=new Promise<Access>(done=>{resolve=done})
  setup('TEACHER',pending)
  await screen.findByRole('heading',{name:'校园账号'})
  expect(screen.queryByLabelText('验证器 6 位动态验证码')).not.toBeInTheDocument()
  await act(async()=>resolve({...ordinary,personas:['COUNSELOR'],capabilities:['PSYCHOLOGY_STAFF']}))
  expect(await screen.findByLabelText('验证器 6 位动态验证码')).toBeInTheDocument()
 })
})
