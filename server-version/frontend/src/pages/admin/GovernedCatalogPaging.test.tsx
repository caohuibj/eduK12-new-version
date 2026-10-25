import {afterEach,beforeEach,describe,expect,it,vi} from 'vitest'
import {cleanup,fireEvent,render,screen,waitFor} from '@testing-library/react'
import {MemoryRouter} from 'react-router-dom'
import GovernedToolsWorkspace from './GovernedToolsWorkspace'
import SurveyPackageGrantAdmin from './SurveyPackageGrantAdmin'
import GovernedToolLibrary from './GovernedToolLibrary'
import {ResearchPackageCatalog} from '../../survey/ResearchPackageCatalog'
import SurveyResearchersAdmin from './SurveyResearchersAdmin'
const {admin,research,principal}=vi.hoisted(()=>({admin:vi.fn(),research:vi.fn(),principal:{user:{platformRole:'SYSTEM_ADMIN'}}}))
vi.mock('../../api/surveyGovernance',async()=>({...await vi.importActual('../../api/surveyGovernance'),governedRequest:admin,governedResearcherRequest:research}))
vi.mock('../../contexts/AuthContext',()=>({useAuth:()=>principal}))
vi.mock('../../admin/AdminStepUp',()=>({default:()=>null}))
afterEach(()=>{cleanup();vi.unstubAllGlobals()})
beforeEach(()=>{admin.mockReset().mockResolvedValue({list:[],hasMore:false});research.mockReset().mockResolvedValue({list:[],hasMore:false})})
const row=(i:number)=>({id:'tool'+i,title:'Package '+i,family:'BUNDLE',hash:'abcdef123456'+i,toolVersion:'package-'+i,state:'ONLINE',blockers:[],versions:{content:'content-'+i,parameters:null,report:'report-'+i},components:[{slotKey:'form',title:'Fixed form '+i,kind:'FORM',source:{type:'GOVERNED',id:'component'+i,hash:'0123456789ab'+i},versions:{content:'form-'+i,parameters:null,report:null}}],states:{content:{ready:true,reasons:[]},assignment:{ready:true,reasons:[]},deployment:{ready:false,reasons:[]}},status:'ACTIVE',version:1,expiresAt:null,availability:{ready:true,reasons:[]}})
describe('governed catalog pagination preserves exact selection and authority',()=>{
 it('changes researcher or invitation pages without reloading the other list',async()=>{
  const fetcher=vi.fn(async(input:RequestInfo|URL)=>{const path=String(input),list=path.includes('/researcher-invitations?')?Array.from({length:25},(_,i)=>({id:'invite'+i,kind:'INVITE',status:'PENDING',createdBy:'synthetic',createdAt:'2026-10-24T00:00:00Z',expiresAt:'2027-01-01T00:00:00Z'})):Array.from({length:25},(_,i)=>({id:'person'+i,username:'Synthetic '+i,status:'ACTIVE',createdAt:'2026-10-24T00:00:00Z'}));return {ok:true,status:200,json:async()=>({code:0,message:'Synthetic',data:{list}})} as Response})
  vi.stubGlobal('fetch',fetcher);render(<SurveyResearchersAdmin/>);await screen.findByRole('heading',{name:'Synthetic 0'})
  fireEvent.click(screen.getByRole('button',{name:'研究者下一页'}));await waitFor(()=>expect(fetcher.mock.calls.filter(c=>String(c[0]).includes('/researchers?'))).toHaveLength(2))
  expect(fetcher.mock.calls.filter(c=>String(c[0]).includes('/researcher-invitations?'))).toHaveLength(1)
  fireEvent.click(screen.getByRole('tab',{name:/^邀请 /}));fireEvent.click(screen.getByRole('button',{name:'邀请下一页'}))
  await waitFor(()=>expect(fetcher.mock.calls.filter(c=>String(c[0]).includes('/researcher-invitations?'))).toHaveLength(2));expect(fetcher.mock.calls.filter(c=>String(c[0]).includes('/researchers?'))).toHaveLength(2)
 })
 it('reaches researcher grant 26 and renders its frozen axes/component details',async()=>{
  research.mockImplementation(async(path:string)=>path.includes('page=2')?{list:[row(26)],hasMore:false}:{list:Array.from({length:25},(_,i)=>row(i+1)),hasMore:true})
  render(<ResearchPackageCatalog projectId="project" busy={false} onImported={vi.fn()}/>);expect(research).not.toHaveBeenCalled()
  fireEvent.click(screen.getByRole('button',{name:'查看我的整包授权'}));await screen.findByText('Package 25')
  fireEvent.click(screen.getByRole('button',{name:'下一页整包授权'}));await screen.findByText('Package 26')
  expect(screen.getByText(/内容 content-26 · 参数 未配置 · 报告 report-26/)).toBeInTheDocument()
  expect(screen.getByText(/Fixed form 26/)).toBeInTheDocument();expect(screen.getByText(/内容 form-26 · 参数 不适用 · 报告 不适用/)).toBeInTheDocument()
  expect(research.mock.calls.every(c=>c[1]===undefined)).toBe(true)
 })
 it('uses server search and disables an expired ACTIVE grant',async()=>{
  research.mockResolvedValue({list:[{...row(26),availability:{ready:false,reasons:['整包授权已到期']}}],hasMore:false})
  render(<ResearchPackageCatalog projectId="project" busy={false} onImported={vi.fn()}/>);fireEvent.change(screen.getByLabelText('搜索整包名称或版本标识'),{target:{value:'Package 26'}});fireEvent.click(screen.getByRole('button',{name:'查看我的整包授权'}))
  await screen.findByText('整包授权已到期');expect(screen.getByRole('button',{name:'整包导入：Package 26'})).toBeDisabled();expect(research.mock.calls[0][0]).toContain('q=Package+26')
 })
 it('lets an entry manager reach catalog page two and keeps grant pagination independent',async()=>{
  admin.mockImplementation(async(_scope:string,path:string)=>path.startsWith('/catalog')?{list:path.includes('page=2')?[row(26)]:Array.from({length:25},(_,i)=>row(i+1)),hasMore:!path.includes('page=2')}:{list:path.includes('page=2')?[row(99)]:[row(98)],hasMore:!path.includes('page=2')})
  render(<SurveyPackageGrantAdmin password="" researchers={[{id:'person',username:'Synthetic',status:'ACTIVE'}]}/>);fireEvent.click(screen.getByRole('button',{name:'查询可授权整包版本'}));await screen.findByText(/Package 25/)
  fireEvent.click(screen.getByRole('button',{name:'下一页可授权整包'}));await screen.findByText(/Package 26/)
  fireEvent.change(screen.getByLabelText('研究者'),{target:{value:'person'}});await screen.findByText(/Package 98/)
  fireEvent.click(screen.getByRole('button',{name:'下一页现有授权'}));await screen.findByText(/Package 99/)
  expect(admin.mock.calls.filter(c=>c[1].startsWith('/catalog'))).toHaveLength(2);expect(admin.mock.calls.every(c=>c[2]===undefined)).toBe(true)
 })
 it('can leave an empty filtered source page when a later page has content',async()=>{
  admin.mockImplementation(async(_scope:string,path:string)=>path.startsWith('/sources')?path.includes('page=2')?{list:[{ref:{kind:'COGNITIVE',sourceId:'source26',sourceVersion:'1.1.0'},title:'Source 26',available:true}],hasMore:false}:{list:[],hasMore:true}:{list:[],hasMore:false})
  render(<GovernedToolsWorkspace/>);fireEvent.click(screen.getByText('提交新的认知测验版本',{exact:false}));fireEvent.click(screen.getByRole('button',{name:'读取可提交来源'}))
  await waitFor(()=>expect(screen.getByRole('button',{name:'下一页来源'})).toBeEnabled());fireEvent.click(screen.getByRole('button',{name:'下一页来源'}))
  await screen.findByRole('option',{name:/Source 26/});expect(admin.mock.calls.every(c=>c[2]===undefined)).toBe(true)
 })
 it('keeps chosen component metadata when browsing the next options page',async()=>{
  const option=(i:number)=>({source:{type:'GOVERNED',id:'component'+i,hash:'abc'+i},title:'Component '+i,kind:'FORM',versions:{content:'content-'+i,parameters:null,report:null},metrics:[],fields:[]})
  admin.mockImplementation(async(_scope:string,path:string)=>path.startsWith('/components')?{list:[option(path.includes('page=2')?26:1)],hasMore:!path.includes('page=2')}:{list:[],hasMore:false})
  render(<GovernedToolsWorkspace/>);fireEvent.click(screen.getByRole('button',{name:'单纯组合'}));fireEvent.click(screen.getByText('提交新的单纯组合版本',{exact:false}));fireEvent.click(screen.getByRole('button',{name:'读取已上线的固定组件'}));await screen.findByRole('option',{name:/Component 1/})
  fireEvent.change(screen.getByLabelText('选择组件'),{target:{value:'0'}});fireEvent.click(screen.getByRole('button',{name:'加入组合'}));fireEvent.click(screen.getByRole('button',{name:'下一页来源'}));await screen.findByRole('option',{name:/Component 26/})
  expect(screen.getByText('1. Component 1')).toBeInTheDocument()
 })
 it('hands system administrators to entry appointments without exposing an inaccessible personnel link',async()=>{
  admin.mockResolvedValue({list:[row(1)],hasMore:false});render(<MemoryRouter><GovernedToolLibrary/></MemoryRouter>);await screen.findByText('Package 1')
  fireEvent.click(screen.getByText('状态、详情与操作'))
  expect(screen.queryByRole('link',{name:'前往研究者与工具授权'})).toBeNull();expect(screen.getByRole('link',{name:'管理入口管理员任命'})).toHaveAttribute('href','/admin/permissions')
 })
})
