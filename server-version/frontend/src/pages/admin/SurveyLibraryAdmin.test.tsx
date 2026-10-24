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
 it('requires a reason and sends a Survey-only exact-version decision, not a use grant',async()=>{
  render(<MemoryRouter><SurveyLibraryAdmin/></MemoryRouter>);await screen.findByText('完整内容工具')
  screen.getByText('状态、详情与操作').closest('details')!.setAttribute('open','')
  expect(screen.getByRole('button',{name:'批准 Survey 使用范围'})).toBeDisabled()
  fireEvent.change(screen.getByLabelText('审批或暂停原因'),{target:{value:'核对完整内容'}})
  fireEvent.click(screen.getByRole('button',{name:'批准 Survey 使用范围'}))
  await waitFor(()=>expect(mock.request).toHaveBeenCalledWith('survey-library','/policies',expect.objectContaining({resourceKey:item.policyIdentity.resourceKey,expectedVersion:0,decision:'APPROVED',paused:false,reason:'核对完整内容'})))
  expect(mock.request.mock.calls.some(c=>String(c[1]).includes('/grants'))).toBe(false)
 })
 it('shows system navigation separately from researcher administration',async()=>{
  mock.user={id:'system',platformRole:'SYSTEM_ADMIN'}
  render(<MemoryRouter><SurveyLibraryAdmin/></MemoryRouter>);await screen.findByText('完整内容工具')
  expect(screen.getByRole('link',{name:'共享工具全局治理'})).toBeVisible()
  expect(screen.queryByRole('link',{name:'研究者与工具授权'})).not.toBeInTheDocument()
 })
})
