import {cleanup,fireEvent,render,screen,waitFor} from '@testing-library/react'
import {MemoryRouter} from 'react-router-dom'
import {afterEach,beforeEach,describe,expect,it,vi} from 'vitest'
import ScaleLibraryGovernance from './ScaleLibraryGovernance'
import {AuthProvider} from '../../contexts/AuthContext'
const session=vi.hoisted(()=>({me:vi.fn()}))
vi.mock('../../api/auth',()=>({authApi:{me:session.me}}))
const api=vi.hoisted(()=>({capabilities:vi.fn(),submissions:vi.fn(),catalog:vi.fn(),grants:vi.fn(),educationRecipients:vi.fn(),educationGrant:vi.fn()}))
const scoped=vi.hoisted(()=>({request:vi.fn()}))
vi.mock('../../api/surveyManagement',()=>({surveyManagementRequest:scoped.request}))
vi.mock('../../api/scaleLibraryGovernance',()=>({governanceApi:()=>api,submissionStatusLabel:{}}))
const ready={status:'READY' as const,canDistribute:true,contentCompatible:true,reason:null}
const closed={status:'NOT_READY' as const,canDistribute:false,contentCompatible:true,reason:'EDUCATION_LIBRARY_ADAPTER_NOT_READY'}
const entry={id:'entry',releaseId:'release',contentHash:'hash',status:'ACTIVE',metadata:{title:'分配量表'},supportedEntrypoints:['SCHOOL','TEACHER'],educationDistribution:{...ready,products:{SCHOOL:ready,TEACHER:ready}}}
const catalog=(authored:unknown)=>({list:[{catalogId:'authored',origin:'AUTHORED',title:entry.metadata.title,exactVersion:{origin:'AUTHORED',releaseId:entry.releaseId},availability:{status:'RESTRICTED',reasons:[]},authored}],page:1,pageSize:25,hasMore:false})
beforeEach(()=>{vi.resetAllMocks();session.me.mockResolvedValue({code:0,data:{id:'entry-manager',username:'entry-manager',role:'TEACHER',platformRole:'STANDARD',entryGrants:[{entry:'SURVEY',version:1}]}});api.capabilities.mockResolvedValue({systemAdmin:false,reviewGrants:[],distributionGrants:['TRAINING','SURVEY','SCHOOL','TEACHER'].map(product=>({grantId:'distribute-'+product,product,releaseIds:['release']}))});api.submissions.mockResolvedValue({list:[]});api.catalog.mockResolvedValue(catalog(entry));api.grants.mockResolvedValue({list:[]})})
afterEach(cleanup)
async function inspect(){render(<AuthProvider><MemoryRouter><ScaleLibraryGovernance/></MemoryRouter></AuthProvider>);fireEvent.click(await screen.findByRole('button',{name:'查看 / 分配只读使用权限'}));await waitFor(()=>expect(api.grants).toHaveBeenCalledWith('entry'));await waitFor(()=>expect(screen.queryByText('尚未确认现有授权，请重新读取该版本授权后再分配。')).not.toBeInTheDocument())}
describe('real admin education distribution gate',()=>{
 it('keeps readiness closed with a concrete reason despite exact-version distribution delegation',async()=>{
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
 const row={...catalog(entry).list[0],authored:{...entry,submissionId:'submission',supportedEntrypoints:['TRAINING','SURVEY','SCHOOL','TEACHER']},policy:{decision:'APPROVED',paused:false,version:1,reason:'Reviewed'},policyIdentity:{resourceKey:'release:release',fingerprint:'a'.repeat(64)},states:{content:{ready:true,reasons:[]},assignment:{ready:true,reasons:[]},deployment:{ready:false,reasons:['Final admission check required']}}}
 scoped.request.mockImplementation(async(_scope,path)=>String(path).startsWith('/catalog')?{list:[row],hasMore:false}:String(path).endsWith('/recipients')?{list:[{id:'survey-recipient',username:'survey-recipient'}]}:{list:[{id:'survey-grant',product:'SURVEY',userId:'survey-recipient',status:'ACTIVE'}]})
 render(<AuthProvider><MemoryRouter initialEntries={['/admin/scale-library-governance?workspace=survey']}><ScaleLibraryGovernance/></MemoryRouter></AuthProvider>)
 fireEvent.click(await screen.findByText('状态、详情与操作'))
 fireEvent.click(await screen.findByRole('button',{name:'分配 Survey 精确版本'}))
 await screen.findByRole('option',{name:'survey-recipient'})
 expect(screen.queryByRole('combobox',{name:'目标入口'})).not.toBeInTheDocument()
 expect(scoped.request).toHaveBeenCalledWith('survey-library','/entries/entry/recipients',undefined)
 expect(scoped.request).toHaveBeenCalledWith('survey-library','/entries/entry/grants',undefined)
 expect(scoped.request.mock.calls.every(([scope])=>scope==='survey-library')).toBe(true)
 expect(screen.queryByText(/private-school/)).not.toBeInTheDocument()
 expect(screen.queryByRole('group',{name:'学校与教师精确版本授权对象'})).not.toBeInTheDocument()
 expect(api.educationRecipients).not.toHaveBeenCalled();expect(api.educationGrant).not.toHaveBeenCalled()
 expect(api.grants).not.toHaveBeenCalled()
})
it('preserves all admin targets and exact education readiness outside Survey management',async()=>{
 api.catalog.mockResolvedValue(catalog({...entry,supportedEntrypoints:['TRAINING','SURVEY','SCHOOL','TEACHER'],admittedEntrypoints:['TRAINING','SURVEY'],educationDistribution:{...ready,products:{SCHOOL:ready,TEACHER:closed}}}))
 api.educationRecipients.mockResolvedValue({product:'SCHOOL',scopeKind:'ORGANIZATION',list:[],nextCursor:null})
 await inspect()
 expect(screen.getByRole('option',{name:'Training'})).toBeEnabled();expect(screen.getByRole('option',{name:'Survey'})).toBeEnabled()
 expect(screen.getByRole('option',{name:'School'})).toBeEnabled();expect(screen.getByRole('option',{name:'Teacher'})).toBeDisabled()
 fireEvent.change(screen.getByRole('combobox',{name:'目标入口'}),{target:{value:'SCHOOL'}})
 fireEvent.click(await screen.findByRole('button',{name:'读取可见学校'}))
 await waitFor(()=>expect(api.educationRecipients).toHaveBeenCalledWith('entry',expect.objectContaining({product:'SCHOOL',releaseId:'release',contentHash:'hash'})))
 expect(api.educationGrant).not.toHaveBeenCalled()
})
