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
 it('locks the loaded school when its identifier is edited, then unlocks only after querying the new target',async()=>{
  const first='11260000-0000-4000-8000-000000000001',second='11260000-0000-4000-8000-000000000002'
  vi.mocked(sessionFetch).mockImplementation(async()=>new Response(JSON.stringify({code:0,data:[{product:'HUISCHOOL',status:'ACTIVE',revision:1}]}),{status:200}))
  const confirm=vi.spyOn(window,'confirm').mockReturnValue(true)
  render(<MemoryRouter><EducationProductGovernance product="HUISCHOOL"/></MemoryRouter>)
  const target=screen.getByLabelText('学校 Organization UUID')
  fireEvent.change(target,{target:{value:first}})
  fireEvent.click(screen.getByRole('button',{name:'查询学校产品授权'}))
  await screen.findByText('已开通 · 版本 1')
  const password=screen.getByLabelText('本次平台管理员密码')
  fireEvent.change(password,{target:{value:'synthetic-current-password'}})
  fireEvent.change(target,{target:{value:second}})
  expect(password).toHaveValue('')
  expect(screen.getByRole('button',{name:'暂停'})).toBeDisabled()
  expect(screen.getByRole('status')).toHaveTextContent('下方原学校操作已停用')
  fireEvent.click(screen.getByRole('button',{name:'暂停'}))
  expect(confirm).not.toHaveBeenCalled()
  expect(vi.mocked(sessionFetch).mock.calls.every(([,options])=>!options?.method||options.method==='GET')).toBe(true)
  fireEvent.click(screen.getByRole('button',{name:'查询学校产品授权'}))
  await waitFor(()=>expect(screen.getByRole('button',{name:'暂停'})).not.toBeDisabled())
  expect(vi.mocked(sessionFetch).mock.calls.map(([url])=>String(url))).toEqual(expect.arrayContaining([
   '/api/platform/education/organizations/'+first+'/products','/api/platform/education/organizations/'+second+'/products',
  ]))
  confirm.mockRestore()
 })
 it('does not show management or verification when the exact product grant is absent',()=>{
  state.user={id:'ordinary',username:'ordinary',role:'TEACHER',platformRole:'STANDARD',entryGrants:[{entry:'HUITEACHER',version:1}]} as User
  render(<MemoryRouter><EducationProductGovernance product="HUISCHOOL"/></MemoryRouter>)
  expect(screen.getByRole('alert')).toHaveTextContent('需要当前学校产品的入口管理授权')
  expect(screen.queryByText('管理员安全验证')).not.toBeInTheDocument()
  expect(screen.queryByLabelText('学校 Organization UUID')).not.toBeInTheDocument()
 })
})
