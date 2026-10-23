import {act,cleanup,fireEvent,render,screen,waitFor} from '@testing-library/react'
import {afterEach,describe,expect,it,vi} from 'vitest'
import {EducationLibraryDistributionPicker} from './EducationLibraryDistributionPicker'
import type {GovernanceEntry,EducationRecipientRequest} from '../../api/scaleLibraryGovernance'
const ready={status:'READY' as const,canDistribute:true,contentCompatible:true,reason:null}
const closed={status:'NOT_READY' as const,canDistribute:false,contentCompatible:true,reason:'EDUCATION_LIBRARY_ADAPTER_NOT_READY'}
const entry:GovernanceEntry={id:'entry',releaseId:'release',contentHash:'hash',submissionId:'submission',product:'TRAINING',sourceId:'source',version:1,metadata:{title:'获批量表',author:'作者',copyright:'自有',applicability:'学生',scoringDescription:'描述性',reportDescription:'描述性'},dependencyReleaseIds:[],createdAt:'2026-10-22',status:'ACTIVE',supportedEntrypoints:['SCHOOL','TEACHER'],educationDistribution:{...ready,products:{SCHOOL:ready,TEACHER:ready}}}
function deferred<T>(){let resolve!:(value:T)=>void;const promise=new Promise<T>(yes=>{resolve=yes});return {promise,resolve}}
const run=async(work:()=>Promise<unknown>)=>{try{await work()}catch{/* Parent displays failures; retry must retain identity. */}}
afterEach(()=>{cleanup();vi.restoreAllMocks()})
describe('exact-version education distribution picker',()=>{
 it('requires verified school and user, confirms boundaries and reuses request identity after failure',async()=>{
  const confirm=vi.spyOn(window,'confirm').mockReturnValue(false)
  const api={educationRecipients:vi.fn(async(_id:string,input:EducationRecipientRequest)=>({product:input.product,scopeKind:input.scopeKind,...(input.scopeKind==='USER'?{organizationId:input.organizationId}:{}),list:input.scopeKind==='ORGANIZATION'?[{id:'org',name:'测试学校'}]:[{id:'user',name:'测试教师',username:'teacher'}],nextCursor:null})),educationGrant:vi.fn().mockRejectedValueOnce(Error('网络中断')).mockResolvedValue({id:'grant'})}
  const onGranted=vi.fn().mockResolvedValue(undefined)
  render(<EducationLibraryDistributionPicker entry={entry} product="SCHOOL" grantId="delegated" grants={[{id:'existing',scopeKind:'USER',organizationId:'org',userId:'user',product:'SCHOOL',version:7,status:'ACTIVE'}]} api={api} disabled={false} run={run} onGranted={onGranted}/>)
  expect(screen.getByRole('button',{name:'读取本校可见账号'})).toBeDisabled()
  fireEvent.click(screen.getByRole('button',{name:'读取可见学校'}));await screen.findByRole('option',{name:'测试学校 · org'})
  fireEvent.change(screen.getByLabelText('授权学校'),{target:{value:'org'}})
  fireEvent.click(screen.getByRole('button',{name:'读取本校可见账号'}));await screen.findByRole('option',{name:'测试教师 · teacher · user'})
  expect(api.educationRecipients).toHaveBeenLastCalledWith('entry',expect.objectContaining({product:'SCHOOL',scopeKind:'USER',organizationId:'org',releaseId:'release',contentHash:'hash',grantId:'delegated'}))
  fireEvent.change(screen.getByLabelText('本校授权账号'),{target:{value:'user'}})
  const assign=screen.getByRole('button',{name:'确认并授予精确版本使用权限'})
  fireEvent.click(assign);expect(api.educationGrant).not.toHaveBeenCalled()
  expect(confirm).toHaveBeenCalledWith(expect.stringContaining('不授予编制、发布活动或读取个人报告的权限'))
  confirm.mockReturnValue(true);fireEvent.click(assign)
  await waitFor(()=>expect(api.educationGrant).toHaveBeenCalledTimes(1))
  fireEvent.click(assign);await waitFor(()=>expect(onGranted).toHaveBeenCalledTimes(1))
  const first=api.educationGrant.mock.calls[0][1]
  expect(first).toEqual(expect.objectContaining({scopeKind:'USER',organizationId:'org',userId:'user',releaseId:'release',contentHash:'hash',expectedGrantVersion:7,grantId:'delegated',requestId:expect.any(String)}))
  expect(api.educationGrant.mock.calls[1][1]).toEqual(first)
 })
 it('deduplicates school pages, uses null organization userId and ignores old release lookups',async()=>{
  vi.spyOn(window,'confirm').mockReturnValue(true)
  const late=deferred<{product:'TEACHER';scopeKind:'ORGANIZATION';list:{id:string;name:string}[];nextCursor:null}>()
  let reads=0
  const api={educationRecipients:vi.fn(async()=>{reads++;if(reads===3)return late.promise;return {product:'TEACHER' as const,scopeKind:'ORGANIZATION' as const,list:[{id:'org',name:'学校甲'}],nextCursor:reads===1?'cursor':null}}),educationGrant:vi.fn().mockResolvedValue({id:'g'})}
  const props={entry,product:'TEACHER' as const,grants:[],api,disabled:false,run,onGranted:vi.fn().mockResolvedValue(undefined)}
  const {rerender}=render(<EducationLibraryDistributionPicker {...props}/>)
  fireEvent.change(screen.getByLabelText('授权范围'),{target:{value:'ORGANIZATION'}})
  fireEvent.click(screen.getByRole('button',{name:'读取可见学校'}));await screen.findByRole('button',{name:'继续读取学校'})
  fireEvent.click(screen.getByRole('button',{name:'继续读取学校'}));await waitFor(()=>expect(screen.queryByRole('button',{name:'继续读取学校'})).not.toBeInTheDocument())
  expect(screen.getAllByRole('option',{name:'学校甲 · org'})).toHaveLength(1)
  fireEvent.change(screen.getByLabelText('授权学校'),{target:{value:'org'}})
  fireEvent.click(screen.getByRole('button',{name:'确认并授予精确版本使用权限'}))
  await waitFor(()=>expect(api.educationGrant).toHaveBeenCalledWith('entry',expect.objectContaining({scopeKind:'ORGANIZATION',organizationId:'org',userId:null})))
  fireEvent.click(screen.getByRole('button',{name:'读取可见学校'}));await waitFor(()=>expect(reads).toBe(3))
  rerender(<EducationLibraryDistributionPicker {...props} entry={{...entry,releaseId:'new',contentHash:'new-hash'}}/>)
  await act(async()=>late.resolve({product:'TEACHER',scopeKind:'ORGANIZATION',list:[{id:'stale',name:'旧学校'}],nextCursor:null}))
  expect(screen.queryByRole('option',{name:/旧学校/})).not.toBeInTheDocument()
  expect(screen.getByRole('button',{name:'确认并授予精确版本使用权限'})).toBeDisabled()
 })
 it('does not expose recipients or grant actions when server readiness is closed',()=>{
  const api={educationRecipients:vi.fn(),educationGrant:vi.fn()}
  render(<EducationLibraryDistributionPicker entry={{...entry,educationDistribution:{...closed,products:{SCHOOL:closed,TEACHER:closed}}}} product="SCHOOL" grants={[]} api={api} disabled={false} run={run} onGranted={vi.fn()}/>)
  expect(screen.getByText('学校与教师入口的完整流程尚在验收，暂不开放使用分配。')).toBeInTheDocument()
  expect(screen.queryByRole('button')).not.toBeInTheDocument();expect(api.educationRecipients).not.toHaveBeenCalled();expect(api.educationGrant).not.toHaveBeenCalled()
 })
})
it.each(['different-product','missing-products'])('fails closed for Teacher despite aggregate READY: %s',scenario=>{
 const api={educationRecipients:vi.fn(),educationGrant:vi.fn()}
 const distribution=scenario==='missing-products'?ready:{...ready,products:{SCHOOL:ready,TEACHER:{...closed,reason:'EDUCATION_LIBRARY_PRODUCT_VARIANT_ADAPTER_NOT_READY'}}}
 render(<EducationLibraryDistributionPicker entry={{...entry,educationDistribution:distribution}} product="TEACHER" grants={[]} api={api} disabled={false} run={run} onGranted={vi.fn()}/>)
 expect(screen.queryByRole('button')).not.toBeInTheDocument()
 expect(screen.getByText(scenario==='missing-products'?'学校与教师入口的分发暂未开放。':'此版本的适用方式暂未接通当前入口，不能向该入口分配。')).toBeInTheDocument()
 expect(api.educationRecipients).not.toHaveBeenCalled();expect(api.educationGrant).not.toHaveBeenCalled()
})
