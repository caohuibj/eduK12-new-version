import {cleanup,fireEvent,render,screen,waitFor} from '@testing-library/react'
import {MemoryRouter} from 'react-router-dom'
import {afterEach,beforeEach,describe,expect,it,vi} from 'vitest'
import ScaleLibraryGovernance from './ScaleLibraryGovernance'
const api=vi.hoisted(()=>({capabilities:vi.fn(),submissions:vi.fn(),catalog:vi.fn(),grants:vi.fn(),educationRecipients:vi.fn(),educationGrant:vi.fn()}))
vi.mock('../../api/scaleLibraryGovernance',()=>({governanceApi:()=>api,submissionStatusLabel:{}}))
const ready={status:'READY' as const,canDistribute:true,contentCompatible:true,reason:null}
const closed={status:'NOT_READY' as const,canDistribute:false,contentCompatible:true,reason:'EDUCATION_LIBRARY_ADAPTER_NOT_READY'}
const entry={id:'entry',releaseId:'release',contentHash:'hash',status:'ACTIVE',metadata:{title:'分配量表'},supportedEntrypoints:['SCHOOL','TEACHER'],educationDistribution:{...ready,products:{SCHOOL:ready,TEACHER:ready}}}
const catalog=(authored:unknown)=>({list:[{catalogId:'authored',origin:'AUTHORED',title:entry.metadata.title,exactVersion:{origin:'AUTHORED',releaseId:entry.releaseId},availability:{status:'RESTRICTED',reasons:[]},authored}],page:1,pageSize:25,hasMore:false})
beforeEach(()=>{vi.resetAllMocks();api.capabilities.mockResolvedValue({systemAdmin:true,reviewGrants:[],distributionGrants:[]});api.submissions.mockResolvedValue({list:[]});api.catalog.mockResolvedValue(catalog(entry));api.grants.mockResolvedValue({list:[]})})
afterEach(cleanup)
async function inspect(){render(<MemoryRouter><ScaleLibraryGovernance/></MemoryRouter>);fireEvent.click(await screen.findByRole('button',{name:'查看 / 分配只读使用权限'}));await waitFor(()=>expect(api.grants).toHaveBeenCalledWith('entry'));await waitFor(()=>expect(screen.queryByText('尚未确认现有授权，请重新读取该版本授权后再分配。')).not.toBeInTheDocument())}
describe('real admin education distribution gate',()=>{
 it('keeps readiness closed with a concrete reason even for system administrators',async()=>{
  api.catalog.mockResolvedValue(catalog({...entry,educationDistribution:{...closed,products:{SCHOOL:closed,TEACHER:closed}}}))
  await inspect()
  expect(screen.getByRole('option',{name:'School'})).toBeDisabled()
  expect(screen.getByText('School：学校与教师入口的完整流程尚在验收，暂不开放使用分配。')).toBeInTheDocument()
  fireEvent.change(screen.getByLabelText('目标入口'),{target:{value:'SCHOOL'}})
  expect(screen.queryByRole('group',{name:'学校与教师精确版本授权对象'})).not.toBeInTheDocument()
  expect(api.educationRecipients).not.toHaveBeenCalled();expect(api.educationGrant).not.toHaveBeenCalled()
 })
 it('does not infer distribution authority from READY or an unrelated release grant',async()=>{
  api.capabilities.mockResolvedValue({systemAdmin:false,reviewGrants:[],distributionGrants:[{grantId:'other',product:'SCHOOL',releaseIds:['another-release']}]})
  await inspect();fireEvent.change(screen.getByLabelText('目标入口'),{target:{value:'SCHOOL'}})
  expect(screen.getByText('当前账号没有此版本在该入口的分配权限，或该入口尚未开放。')).toBeInTheDocument()
  expect(screen.queryByRole('button',{name:'读取可见学校'})).not.toBeInTheDocument()
  expect(api.educationRecipients).not.toHaveBeenCalled();expect(api.educationGrant).not.toHaveBeenCalled()
 })
 it('mounts the picker only for a matching product and exact release delegation',async()=>{
  api.capabilities.mockResolvedValue({systemAdmin:false,reviewGrants:[],distributionGrants:[{grantId:'delegated',product:'SCHOOL',releaseIds:['release']}]})
  api.educationRecipients.mockResolvedValue({product:'SCHOOL',scopeKind:'ORGANIZATION',list:[],nextCursor:null})
  await inspect();fireEvent.change(screen.getByLabelText('目标入口'),{target:{value:'SCHOOL'}})
  fireEvent.click(await screen.findByRole('button',{name:'读取可见学校'}))
  await waitFor(()=>expect(api.educationRecipients).toHaveBeenCalledWith('entry',expect.objectContaining({product:'SCHOOL',scopeKind:'ORGANIZATION',releaseId:'release',contentHash:'hash',grantId:'delegated'})))
  fireEvent.change(screen.getByLabelText('目标入口'),{target:{value:'TEACHER'}})
  expect(screen.queryByRole('button',{name:'读取可见学校'})).not.toBeInTheDocument()
  expect(api.educationGrant).not.toHaveBeenCalled()
 })
})
it.each(['different-product','missing-products'])('uses product readiness rather than aggregate READY in the real admin: %s',async scenario=>{
 const distribution=scenario==='missing-products'?ready:{...ready,products:{SCHOOL:ready,TEACHER:{...closed,reason:'EDUCATION_LIBRARY_PRODUCT_VARIANT_ADAPTER_NOT_READY'}}}
 api.catalog.mockResolvedValue(catalog({...entry,educationDistribution:distribution}))
 await inspect()
 expect(screen.getByRole('option',{name:'Teacher'})).toBeDisabled()
 if(scenario==='different-product'){
  expect(screen.getByRole('option',{name:'School'})).toBeEnabled()
  fireEvent.change(screen.getByLabelText('目标入口'),{target:{value:'SCHOOL'}})
  expect(screen.getByRole('button',{name:'读取可见学校'})).toBeInTheDocument()
  expect(screen.getByText('Teacher：此版本的适用方式暂未接通当前入口，不能向该入口分配。')).toBeInTheDocument()
 }else expect(screen.getByRole('option',{name:'School'})).toBeDisabled()
 // Even a synthetic change event on a disabled target must not mount a picker.
 fireEvent.change(screen.getByLabelText('目标入口'),{target:{value:'TEACHER'}})
 expect(screen.queryByRole('button',{name:'读取可见学校'})).not.toBeInTheDocument()
 expect(api.educationRecipients).not.toHaveBeenCalled();expect(api.educationGrant).not.toHaveBeenCalled()
})

it('keeps Survey management isolated even when the exact version is ready for both education entries',async()=>{
 api.catalog.mockResolvedValue(catalog({...entry,supportedEntrypoints:['TRAINING','SURVEY','SCHOOL','TEACHER']}))
 api.grants.mockResolvedValue({list:[{id:'school-grant',product:'SCHOOL',scopeKind:'ORGANIZATION',organizationId:'private-school',status:'ACTIVE'},{id:'survey-grant',product:'SURVEY',userId:'survey-recipient',status:'ACTIVE'}]})
 render(<MemoryRouter initialEntries={['/admin/scale-library-governance?workspace=survey']}><ScaleLibraryGovernance/></MemoryRouter>)
 fireEvent.click(await screen.findByRole('button',{name:'查看 / 分配只读使用权限'}))
 await screen.findByText(/survey-recipient/)
 expect(screen.getByRole('combobox',{name:'目标入口'})).toHaveValue('SURVEY')
 expect(screen.getAllByRole('option').filter(option=>['TRAINING','SURVEY','SCHOOL','TEACHER'].includes((option as HTMLOptionElement).value)).map(option=>(option as HTMLOptionElement).value)).toEqual(['SURVEY'])
 expect(screen.queryByText(/private-school/)).not.toBeInTheDocument()
 expect(screen.queryByRole('group',{name:'学校与教师精确版本授权对象'})).not.toBeInTheDocument()
 expect(api.educationRecipients).not.toHaveBeenCalled();expect(api.educationGrant).not.toHaveBeenCalled()
})
it('preserves all admin targets and exact education readiness outside Survey management',async()=>{
 api.catalog.mockResolvedValue(catalog({...entry,supportedEntrypoints:['TRAINING','SURVEY','SCHOOL','TEACHER'],educationDistribution:{...ready,products:{SCHOOL:ready,TEACHER:closed}}}))
 api.educationRecipients.mockResolvedValue({product:'SCHOOL',scopeKind:'ORGANIZATION',list:[],nextCursor:null})
 await inspect()
 expect(screen.getByRole('option',{name:'Training'})).toBeEnabled();expect(screen.getByRole('option',{name:'Survey'})).toBeEnabled()
 expect(screen.getByRole('option',{name:'School'})).toBeEnabled();expect(screen.getByRole('option',{name:'Teacher'})).toBeDisabled()
 fireEvent.change(screen.getByRole('combobox',{name:'目标入口'}),{target:{value:'SCHOOL'}})
 fireEvent.click(await screen.findByRole('button',{name:'读取可见学校'}))
 await waitFor(()=>expect(api.educationRecipients).toHaveBeenCalledWith('entry',expect.objectContaining({product:'SCHOOL',releaseId:'release',contentHash:'hash'})))
 expect(api.educationGrant).not.toHaveBeenCalled()
})
