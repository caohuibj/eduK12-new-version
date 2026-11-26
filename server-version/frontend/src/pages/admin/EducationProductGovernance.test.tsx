import {render,screen,fireEvent,waitFor} from '@testing-library/react'
import {MemoryRouter} from 'react-router-dom'
import {beforeEach,describe,expect,it,vi} from 'vitest'
import type {User} from '../../types'
import EducationProductGovernance from './EducationProductGovernance'
import {sessionFetch} from '../../api/client'
const state=vi.hoisted(()=>({user:null as User|null}))
vi.mock('../../contexts/AuthContext',()=>({useAuth:()=>state}))
vi.mock('../../api/client',()=>({sessionFetch:vi.fn()}))
vi.mock('./EducationStandardConfigurations',()=>({default:()=>null}))
vi.mock('./EducationCognitiveConfigurations',()=>({default:()=>null}))
vi.mock('../../admin/securityKey',()=>({reauthenticateAdmin:vi.fn()}))
beforeEach(()=>{vi.mocked(sessionFetch).mockReset();state.user={id:'admin',username:'admin',role:'TEACHER',platformRole:'STANDARD',entryGrants:[{entry:'HUISCHOOL',version:1},{entry:'HUITEACHER',version:1}]} as User})
describe('education product governance presentation',()=>{
 it.each([['HUISCHOOL','School'],['HUITEACHER','Teacher']] as const)('keeps %s sensitive verification collapsed without clearing the draft',(product,brand)=>{
  render(<MemoryRouter><EducationProductGovernance product={product}/></MemoryRouter>)
  expect(screen.getByText(`${brand} · 管理员工作台`)).toBeInTheDocument()
  const summary=screen.getByText('管理员安全验证')
  expect(summary.closest('details')).not.toHaveAttribute('open')
  fireEvent.click(summary)
  const input=screen.getByLabelText('Authenticator 六位动态码')
  fireEvent.change(input,{target:{value:'123456'}})
  fireEvent.click(summary)
  expect(input).not.toBeVisible()
  fireEvent.click(summary)
  expect(input).toHaveValue('123456')
 })
 it('locks loaded actions until the searched school is explicitly selected',async()=>{
  const first='11260000-0000-4000-8000-000000000001',second='11260000-0000-4000-8000-000000000002'
  const get=vi.mocked(sessionFetch)
  get.mockImplementation(async input=>{
    const url=String(input)
    const data=url.includes('?q=')?{list:[url.includes('First')?{id:first,name:'First School'}:{id:second,name:'Second School'}],hasMore:false,page:1}
      :url.endsWith('/admins')?{list:[],effectiveCount:0,truncated:false}
        :[{product:'HUISCHOOL',status:'ACTIVE',revision:1}]
    return new Response(JSON.stringify({code:0,data}),{status:200})
  })
  render(<MemoryRouter><EducationProductGovernance product="HUISCHOOL"/></MemoryRouter>)
  const target=screen.getByLabelText('学校名称')
  fireEvent.change(target,{target:{value:'First'}})
  fireEvent.click(screen.getByRole('button',{name:'搜索学校'}))
  const firstResult=await screen.findByRole('button',{name:'选择 First School'})
  expect(get).toHaveBeenCalledTimes(1)
  fireEvent.click(firstResult)
  await screen.findByText('已开通 · 版本 1')
  const password=screen.getByLabelText('本次平台管理员密码')
  fireEvent.change(password,{target:{value:'synthetic-current-password'}})
  fireEvent.change(target,{target:{value:'Second'}})
  expect(password).toHaveValue('')
  expect(screen.getByRole('button',{name:'暂停'})).toBeDisabled()
  expect(screen.getByRole('status')).toHaveTextContent('下方原学校操作已停用')
  fireEvent.click(screen.getByRole('button',{name:'暂停'}))
  expect(get.mock.calls.every(([,options])=>!options?.method||options.method==='GET')).toBe(true)
  fireEvent.click(screen.getByRole('button',{name:'搜索学校'}))
  const secondResult=await screen.findByRole('button',{name:'选择 Second School'})
  expect(screen.getByRole('button',{name:'暂停'})).toBeDisabled()
  fireEvent.click(secondResult)
  await waitFor(()=>expect(screen.getByRole('button',{name:'暂停'})).not.toBeDisabled())
  expect(get.mock.calls.map(([url])=>String(url))).toEqual(expect.arrayContaining([
   '/api/platform/education/organizations/'+first+'/products','/api/platform/education/organizations/'+second+'/products',
  ]))
 })
 it('shows effective Teacher administrators and only searches candidates within the selected school and product',async()=>{
  const school='11260000-0000-4000-8000-000000000002'
  const org='/api/platform/education/organizations/'+school
  const product=org+'/products/HUITEACHER'
  const get=vi.mocked(sessionFetch)
  get.mockImplementation(async input=>{
    const url=String(input)
    const data=url.startsWith('/api/platform/education/organizations?')?{list:[{id:school,name:'Example School'}],hasMore:false,page:1}
      :url.endsWith('/admins')?{list:[{grantId:'active',membershipId:'active-membership',loginName:'现任教师',effective:true},{grantId:'expired',membershipId:'expired-membership',loginName:'过期教师',effective:false}],effectiveCount:1,truncated:false}
        :url.includes('/admin-candidates?')?{list:[{membershipId:'next',loginName:'接任教师',ready:false}],hasMore:false,page:1}
          :[{product:'HUITEACHER',status:'ACTIVE',revision:1}]
    return new Response(JSON.stringify({code:0,data}),{status:200})
  })
  render(<MemoryRouter><EducationProductGovernance product="HUITEACHER"/></MemoryRouter>)
  fireEvent.change(screen.getByLabelText('学校名称'),{target:{value:'Example'}})
  fireEvent.click(screen.getByRole('button',{name:'搜索学校'}))
  fireEvent.click(await screen.findByRole('button',{name:'选择 Example School'}))
  expect(await screen.findByText(/可操作管理员 1 位/)).toBeInTheDocument()
  const revoke=screen.getAllByRole('button',{name:'撤销'})
  expect(revoke[0]).toBeDisabled()
  expect(revoke[1]).not.toBeDisabled()
  fireEvent.change(screen.getByLabelText('本校人员账号'),{target:{value:'next'}})
  fireEvent.click(screen.getByRole('button',{name:'搜索人员'}))
  fireEvent.click(await screen.findByRole('button',{name:'接任教师 · 待完成验证'}))
  expect(screen.getByRole('button',{name:'授予 Teacher 产品管理员'})).not.toBeDisabled()
  expect(get.mock.calls.some(([input])=>input===product+'/admin-candidates?q=next&page=1')).toBe(true)
 })
 it('does not show management or verification when the exact product grant is absent',()=>{
  state.user={id:'ordinary',username:'ordinary',role:'TEACHER',platformRole:'STANDARD',entryGrants:[{entry:'HUITEACHER',version:1}]} as User
  render(<MemoryRouter><EducationProductGovernance product="HUISCHOOL"/></MemoryRouter>)
  expect(screen.getByRole('alert')).toHaveTextContent('需要当前学校产品的入口管理授权')
  expect(screen.queryByText('管理员安全验证')).not.toBeInTheDocument()
  expect(screen.queryByLabelText('学校名称')).not.toBeInTheDocument()
 })
})
