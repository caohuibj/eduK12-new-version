import { beforeEach, expect, it, vi } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router-dom'
const api = vi.hoisted(() => ({resources:vi.fn(),specs:vi.fn(),register:vi.fn(),transitionResource:vi.fn(),createSpec:vi.fn(),transitionSpec:vi.fn()}))
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
  await user.selectOptions(await screen.findByLabelText('原创量表'),'scale')
  await user.click(screen.getByRole('button',{name:'注册资源草稿'}))
  await user.click(await screen.findByRole('button',{name:'审核'}));await user.click(await screen.findByRole('button',{name:'发布'}))
  await waitFor(()=>expect(stored.status).toBe('PUBLISHED'))
  await user.selectOptions(screen.getByLabelText('已发布测量资源'),'resource')
  await user.type(screen.getByLabelText('方案名称'),'偏好变化')
  await user.click(screen.getByRole('button',{name:'创建方案草稿'}))
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

it('disables self-review of registered resources and reporting specs',async()=>{
 api.resources.mockResolvedValue({list:[{...resource,created_by_user_id:'reviewer'}],truncated:false})
 api.specs.mockResolvedValue({list:[{id:'self-spec',specKey:'My spec',version:1,status:'DRAFT',createdByUserId:'reviewer',definition:{analysisKind:'INDIVIDUAL_LONGITUDINAL',reportEvidenceCeiling:'PILOT',metricRules:[]}}],nextPage:null})
 render(<MemoryRouter><ReportingContent/></MemoryRouter>)
 await screen.findByText('原创偏好 · 草稿')
 const buttons=screen.getAllByRole('button',{name:'审核'})
 expect(buttons).toHaveLength(2);buttons.forEach(button=>expect(button).toBeDisabled())
 expect(screen.getByText(/注册者、量表作者与方案创建者不能自审/)).toBeInTheDocument()
 expect(api.transitionResource).not.toHaveBeenCalled();expect(api.transitionSpec).not.toHaveBeenCalled()
})
