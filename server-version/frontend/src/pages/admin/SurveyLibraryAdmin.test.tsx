import {fireEvent,render,screen,waitFor} from '@testing-library/react'
import {MemoryRouter} from 'react-router-dom'
import {beforeEach,describe,it,expect,vi} from 'vitest'
import SurveyLibraryAdmin from './SurveyLibraryAdmin'
const mock=vi.hoisted(()=>({request:vi.fn(),user:{id:'manager',platformRole:'STANDARD'}}))
vi.mock('../../contexts/AuthContext',()=>({useAuth:()=>({user:mock.user})}))
vi.mock('../../api/surveyManagement',()=>({surveyManagementRequest:mock.request}))
vi.mock('../../admin/AdminStepUp',()=>({default:()=> <p>身份验证</p>}))
const item={catalogId:'standard:fixture:1',title:'完整内容工具',origin:'STANDARD_REGISTRY',exactVersion:{instrumentVersion:'1'},
 policyIdentity:{resourceKey:'standard:fixture:1',fingerprint:'a'.repeat(64)},policy:{decision:'PENDING',paused:false,version:0,reason:'未审批'},
 states:{content:{ready:true,reasons:[]},assignment:{ready:false,reasons:['尚未部署','尚未通过 Survey 范围审批']},deployment:{ready:false,reasons:['还需精确版本授权与准入核对']}}}
beforeEach(()=>{vi.clearAllMocks();mock.user={id:'manager',platformRole:'STANDARD'};mock.request.mockImplementation(async(_scope,path)=>path.startsWith('/catalog')?{list:[item],hasMore:false}:{list:[],hasMore:false})})
describe('scoped Survey library UI',()=>{
 it('separates content, assignment and deployment without opening controls by default',async()=>{
  render(<MemoryRouter><SurveyLibraryAdmin/></MemoryRouter>)
  expect(await screen.findByRole('heading',{name:'完整内容工具'})).toBeVisible()
  expect(screen.getByText('内容：就绪')).toBeVisible();expect(screen.getByText('授权：受阻')).toBeVisible()
  expect(screen.getByText('状态、详情与操作').closest('details')).not.toHaveAttribute('open')
  expect(mock.request).toHaveBeenCalledWith('survey-library','/catalog?page=1',undefined)
  expect(screen.queryByText('共享工具全局治理')).not.toBeInTheDocument()
 })
 it('entry managers cannot approve again and pause only the exact Survey entry with a reason',async()=>{
  render(<MemoryRouter><SurveyLibraryAdmin/></MemoryRouter>);await screen.findByText('完整内容工具')
  screen.getByText('状态、详情与操作').closest('details')!.setAttribute('open','')
  expect(screen.queryByRole('button',{name:'批准 Survey 使用范围'})).not.toBeInTheDocument()
  expect(screen.getByRole('button',{name:'暂停 Survey 使用'})).toBeDisabled()
  fireEvent.change(screen.getByLabelText('审批或暂停原因'),{target:{value:'核对完整内容'}})
  fireEvent.click(screen.getByRole('button',{name:'暂停 Survey 使用'}))
  await waitFor(()=>expect(mock.request).toHaveBeenCalledWith('survey-library','/policies',expect.objectContaining({resourceKey:item.policyIdentity.resourceKey,expectedVersion:0,decision:'PENDING',paused:true,reason:'核对完整内容'})))
  expect(mock.request.mock.calls.some(c=>String(c[1]).includes('/grants'))).toBe(false)
 })
 it('keeps Survey approval and attachment access checks without a copyright gate',async()=>{
  mock.request.mockImplementation(async(_scope,path)=>path.startsWith('/submissions')?{list:[{id:'submission',metadata:{title:'申请工具',copyright:'unknown'},product:'TRAINING',status:'SUBMITTED',policy:item.policy,policyIdentity:item.policyIdentity}],hasMore:false}:{list:[],hasMore:false})
  render(<MemoryRouter><SurveyLibraryAdmin/></MemoryRouter>)
  await waitFor(()=>expect(screen.getByRole('tab',{name:'Survey 入库审批'})).toBeEnabled())
  fireEvent.click(screen.getByRole('tab',{name:'Survey 入库审批'}))
  await screen.findByRole('heading',{name:'申请工具'})
  screen.getByText('申请详情与 Survey 审批').closest('details')!.setAttribute('open','')
  expect(screen.getByText(/附件与项目数据权限继续独立保留；版权说明仅作可选资料/)).toBeVisible()
  expect(screen.getByText('unknown')).toBeVisible()
  expect(screen.queryByRole('button',{name:'批准 Survey 使用范围'})).not.toBeInTheDocument()
  expect(mock.request.mock.calls.every(call=>call[2]===undefined)).toBe(true)
 })
 it('retains system-only exact scope approval and its reason without issuing a user grant',async()=>{
  mock.user={id:'system',platformRole:'SYSTEM_ADMIN'}
  render(<MemoryRouter><SurveyLibraryAdmin/></MemoryRouter>);await screen.findByText('完整内容工具')
  screen.getByText('状态、详情与操作').closest('details')!.setAttribute('open','')
  expect(screen.getByRole('button',{name:'批准 Survey 使用范围'})).toBeDisabled()
  fireEvent.change(screen.getByLabelText('审批或暂停原因'),{target:{value:'系统明确批准此精确版本'}})
  fireEvent.click(screen.getByRole('button',{name:'批准 Survey 使用范围'}))
  await waitFor(()=>expect(mock.request).toHaveBeenCalledWith('survey-library','/policies',expect.objectContaining({resourceKey:item.policyIdentity.resourceKey,expectedVersion:0,decision:'APPROVED',paused:false})))
  expect(mock.request.mock.calls.some(c=>String(c[1]).includes('/grants'))).toBe(false)
 })
 it('shows system navigation separately from researcher administration',async()=>{
  mock.user={id:'system',platformRole:'SYSTEM_ADMIN'}
  render(<MemoryRouter><SurveyLibraryAdmin/></MemoryRouter>);await screen.findByText('完整内容工具')
  expect(screen.getByRole('link',{name:'共享工具全局治理'})).toBeVisible()
  expect(screen.queryByRole('link',{name:'研究者与工具授权'})).not.toBeInTheDocument()
 })
})
