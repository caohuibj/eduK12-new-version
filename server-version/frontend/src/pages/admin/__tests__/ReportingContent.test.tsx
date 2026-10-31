import { beforeEach, expect, it, vi } from 'vitest'
import { render, screen, waitFor, fireEvent } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router-dom'
const api = vi.hoisted(() => ({resources:vi.fn(),specs:vi.fn(),register:vi.fn(),registerLibraryGroup:vi.fn(),transitionResource:vi.fn(),createSpec:vi.fn(),transitionSpec:vi.fn()}))
const client = vi.hoisted(() => ({get:vi.fn()}))
vi.mock('../../../api/reportingContent',()=>({reportingContentApi:api}))
vi.mock('../../../api/client',()=>({default:client}))
vi.mock('../../../contexts/AuthContext',()=>({useAuth:()=>({user:{id:'reviewer'}})}))
import ReportingContent from '../ReportingContent'
const resource = {id:'resource',status:'DRAFT',entry:{title:'原创偏好',description:'描述性自评',applicability:{analysisMode:'INDIVIDUAL_ONLY'},resultDisclosure:{audiences:{SUBJECT:{metricKeys:['total']}}}}}
beforeEach(()=>{
  vi.clearAllMocks();api.resources.mockResolvedValue({list:[],truncated:false});api.specs.mockResolvedValue({list:[],nextPage:null})
  client.get.mockResolvedValue({code:0,data:{list:[{id:'scale',name:'颜色偏好',status:'PUBLISHED',instrumentClass:'CUSTOM_DESCRIPTIVE'}]}})
})
it('exposes normal resource and spec draft → review → publication with explicit scope',async()=>{
  let stored:any=null, spec:any=null
  api.resources.mockImplementation(async()=>({list:stored?[stored]:[],truncated:false}))
  api.specs.mockImplementation(async()=>({list:spec?[spec]:[],nextPage:null}))
  api.register.mockImplementation(async()=>{stored=structuredClone(resource);return stored})
  api.transitionResource.mockImplementation(async(_id,action)=>{stored={...stored,status:action==='review'?'REVIEWED':'PUBLISHED'};return stored})
  api.createSpec.mockImplementation(async input=>{spec={id:'spec',specKey:input.specKey,version:input.version,status:'DRAFT',definition:{analysisKind:input.analysisKind,reportEvidenceCeiling:'PILOT',metricRules:[{metricId:'total'}]}};return spec})
  api.transitionSpec.mockImplementation(async(_id,action)=>{spec={...spec,status:action==='review'?'REVIEWED':'PUBLISHED'};return spec})
  const user=userEvent.setup();render(<MemoryRouter><ReportingContent/></MemoryRouter>)
  await user.click(screen.getByText('注册测量资源',{selector:'summary'}))
  await user.selectOptions(await screen.findByLabelText('原创量表'),'scale')
  expect(client.get).toHaveBeenCalledWith('/organizations/measurement-resources/candidates')
  await user.click(screen.getByRole('button',{name:'注册资源草稿'}))
  const record=await screen.findByText('原创偏好',{selector:'strong'});fireEvent.click(record.closest('summary')!);
  await user.click(await screen.findByRole('button',{name:'审核'}));await user.click(await screen.findByRole('button',{name:'发布'}))
  await waitFor(()=>expect(stored.status).toBe('PUBLISHED'))
  await user.click(screen.getByRole('button',{name:/报告方案/}));await user.click(screen.getByText('创建纵向报告方案',{selector:'summary'}))
  await user.selectOptions(screen.getByLabelText('已发布测量资源'),'resource')
  await user.type(screen.getByLabelText('方案名称'),'偏好变化')
  await user.click(screen.getByRole('button',{name:'创建方案草稿'}))
  fireEvent.click((await screen.findByText('偏好变化',{selector:'strong'})).closest('summary')!)
  await user.click(await screen.findByRole('button',{name:'审核'}));await user.click(await screen.findByRole('button',{name:'发布'}))
  await waitFor(()=>expect(spec.status).toBe('PUBLISHED'))
  expect(api.createSpec).toHaveBeenCalledWith({resourceId:'resource',specKey:'偏好变化',version:1,analysisKind:'INDIVIDUAL_LONGITUDINAL',minimumN:3})
  expect(screen.getByText(/注册不增加组织成员/)).toBeInTheDocument()
})
it('offers retry for a plain-object 502 and does not claim a permissions problem',async()=>{
  api.resources.mockRejectedValue({status:502,message:'Request failed with status code 502'})
  render(<MemoryRouter><ReportingContent/></MemoryRouter>)
  expect(await screen.findByRole('alert')).toHaveTextContent('服务暂时不可用，请稍后重试')
  expect(screen.getByRole('button',{name:'刷新准备状态'})).toBeEnabled()
})
it('loads older resources without losing selection or duplicating overlapping page rows',async()=>{
  const first={...resource,status:'PUBLISHED'},old={...first,id:'old',entry:{...first.entry,title:'更早资源'}}
  api.resources.mockImplementation(async(page=1)=>page===1?{list:[first],nextPage:2}:{list:[first,old],nextPage:null})
  const user=userEvent.setup();render(<MemoryRouter><ReportingContent/></MemoryRouter>)
  await user.click(screen.getByRole('button',{name:/报告方案/}));await user.click(screen.getByText('创建纵向报告方案',{selector:'summary'}))
  await user.selectOptions(await screen.findByLabelText('已发布测量资源'),'resource')
  await user.click(screen.getByRole('button',{name:/测量资源/}))
  await user.click(screen.getByRole('button',{name:'更多资源'}))
  await screen.findByText('更早资源',{selector:'strong'})
  expect(api.resources).toHaveBeenCalledWith(2)
  expect(screen.getByLabelText('已发布测量资源')).toHaveValue('resource')
  await user.click(screen.getByRole('button',{name:/报告方案/}))
  expect(screen.getAllByRole('option',{name:'原创偏好'})).toHaveLength(1)
  await user.selectOptions(screen.getByLabelText('已发布测量资源'),'old')
  expect(screen.queryByRole('button',{name:'更多资源'})).not.toBeInTheDocument()
})

it('disables self-review of registered resources and reporting specs',async()=>{
 api.resources.mockResolvedValue({list:[{...resource,created_by_user_id:'reviewer'}],truncated:false})
 api.specs.mockResolvedValue({list:[{id:'self-spec',specKey:'My spec',version:1,status:'DRAFT',createdByUserId:'reviewer',definition:{analysisKind:'INDIVIDUAL_LONGITUDINAL',reportEvidenceCeiling:'PILOT',metricRules:[]}}],nextPage:null})
 render(<MemoryRouter><ReportingContent/></MemoryRouter>)
 fireEvent.click((await screen.findByText('原创偏好',{selector:'strong'})).closest('summary')!)
 expect(screen.getByRole('button',{name:'审核'})).toBeDisabled()
 fireEvent.click(screen.getByRole('button',{name:/报告方案/}));fireEvent.click(screen.getByText('My spec',{selector:'strong'}).closest('summary')!)
 expect(screen.getByRole('button',{name:'审核'})).toBeDisabled()
 expect(screen.getByText(/注册者、量表作者与方案创建者不能自审/)).toBeInTheDocument()
 expect(api.transitionResource).not.toHaveBeenCalled();expect(api.transitionSpec).not.toHaveBeenCalled()
})

it('registers a library GROUP draft only for explicitly selected aggregate audiences',async()=>{
 const source={...resource,id:'library-source',status:'PUBLISHED',resource_version:'1.0.0',entry:{...resource.entry,libraryOrigin:{adapterVersion:'1.0.0',variantKey:'TEACHER:SELF',product:'TEACHER'}}}
 api.resources.mockResolvedValue({list:[source],nextPage:null});api.registerLibraryGroup.mockResolvedValue({id:'group-draft'})
 const user=userEvent.setup();render(<MemoryRouter><ReportingContent/></MemoryRouter>)
 fireEvent.click((await screen.findByText('原创偏好',{selector:'strong'})).closest('summary')!)
 await user.click(screen.getByRole('button',{name:'登记此库版本的群体用途'}))
 const submit=screen.getByRole('button',{name:'登记库群体版本草稿'})
 expect(submit).toBeDisabled()
 expect(screen.getByRole('checkbox',{name:'心理专业人员群体汇总'})).not.toBeChecked()
 expect(screen.getByRole('checkbox',{name:'教师群体汇总'})).not.toBeChecked()
 await user.click(screen.getByRole('checkbox',{name:'组织管理者群体汇总'}));await user.click(submit)
 await waitFor(()=>expect(api.registerLibraryGroup).toHaveBeenCalledWith('library-source',{minimumRespondents:10,aggregateAudiences:['ORGANIZATION']}))
 expect(api.transitionResource).not.toHaveBeenCalled()
})
