import {act,cleanup,fireEvent,render,screen,waitFor} from '@testing-library/react'
import {afterEach,describe,expect,it,vi} from 'vitest'
import {SchoolActivityManager} from './SchoolActivityManager'
import type {SchoolApi} from './SchoolRecovery'
const activity={courseId:'activity',organizationId:'org',title:'活动甲',purpose:'SCHOOL_CLIMATE',status:'DRAFT',version:1,participantCount:0,runCount:1,runs:[{runId:'run',name:'批次甲',status:'DRAFT'}]}
const resource={family:'SCALE',key:'library-scale:a',version:'v1',title:'量表甲',scientificMaturity:'PILOT',subjectRoles:['STUDENT'],respondentRoles:['STUDENT'],relationshipKinds:['SELF'],perspectives:['SELF_REPORT'],analysisMode:'INDIVIDUAL_ONLY',visibilityPolicyKey:'EDUCATION_LIBRARY_APPROVED_CONTENT_V1',minimumRespondents:null}
const base='/organizations/org/activities/activity'
function deferred<T>(){let resolve!:(value:T)=>void;const promise=new Promise<T>(yes=>{resolve=yes});return {promise,resolve}}
async function open(){await screen.findByRole('option',{name:'活动甲（准备中）'});fireEvent.change(screen.getByLabelText('选择已有活动'),{target:{value:'activity'}});fireEvent.click(await screen.findByRole('button',{name:'批次甲 · 准备中'}));fireEvent.click(await screen.findByRole('button',{name:'查看已发布、受授权的测评资源'}))}
afterEach(cleanup)
describe('School authorized resource cursor consumer',()=>{
 it('continues empty pages, preserves selection after failure, retries and deduplicates only exact versions',async()=>{
  let attempts=0
  const api=vi.fn(async(path:string)=>{
   if(path.endsWith('pageSize=50'))return {list:[activity]}
   if(path===base)return activity
   if(path.endsWith('/eligible-classes'))return {list:[]}
   if(path===base+'/runs/run')return {run:{id:'run',name:'批次甲',status:'DRAFT',version:1}}
   if(path.endsWith('/run-resources?page=1'))return {list:[],nextCursor:'empty/cursor'}
   if(path.endsWith('?cursor=empty%2Fcursor'))return {list:[resource],nextCursor:'next/cursor'}
   if(path.endsWith('?cursor=next%2Fcursor')){if(++attempts===1)throw Error('分页暂不可用');return {list:[resource,{...resource,version:'v2'}],nextCursor:null}}
   throw Error('Unexpected '+path)
  })
  render(<SchoolActivityManager api={api as SchoolApi} organizationId="org" isAdmin classes={[]}/>);await open()
  await screen.findByText('当前页暂无可选资源，仍可继续加载。')
  expect(screen.queryByText('当前目录没有可供本活动使用的测评资源。')).not.toBeInTheDocument()
  fireEvent.click(screen.getByRole('button',{name:'继续加载测评资源'}))
  const select=await screen.findByLabelText('测评资源 · 精确版本')
  fireEvent.change(select,{target:{value:'SCALE:library-scale:a:v1'}})
  fireEvent.click(screen.getByRole('button',{name:'继续加载测评资源'}))
  await screen.findByText(/分页暂不可用/)
  expect(select).toHaveValue('SCALE:library-scale:a:v1')
  expect(screen.getByRole('button',{name:'重新读取测评目录'})).toBeEnabled()
  fireEvent.click(screen.getByRole('button',{name:'继续加载测评资源'}))
  await screen.findByRole('option',{name:/量表甲.*v2/})
  expect(screen.getAllByRole('option',{name:/量表甲.*v1/})).toHaveLength(1)
  expect(select).toHaveValue('SCALE:library-scale:a:v1')
  expect(screen.queryByRole('button',{name:'继续加载测评资源'})).not.toBeInTheDocument()
 })
 it('discards pending resources after activity and run context changes',async()=>{
  const late=deferred<{list:typeof resource[];nextCursor:string}>()
  const second={...activity,courseId:'second',title:'活动乙',runs:[{runId:'run-b',name:'批次乙',status:'DRAFT'}]}
  const api=vi.fn(async(path:string)=>{
   if(path.endsWith('pageSize=50'))return {list:[activity,second]}
   if(path===base)return activity
   if(path.endsWith('/activities/second'))return second
   if(path.endsWith('/eligible-classes'))return {list:[]}
   if(path.endsWith('/runs/run'))return {run:{id:'run',name:'批次甲',status:'DRAFT',version:1}}
   if(path.endsWith('/runs/run-b'))return {run:{id:'run-b',name:'批次乙',status:'DRAFT',version:1}}
   if(path===base+'/run-resources?page=1')return late.promise
   if(path.endsWith('/second/run-resources?page=1'))return {list:[{...resource,key:'new',title:'量表乙'}],nextCursor:null}
   throw Error('Unexpected '+path)
  })
  render(<SchoolActivityManager api={api as SchoolApi} organizationId="org" isAdmin classes={[]}/>);await open()
  await waitFor(()=>expect(api).toHaveBeenCalledWith(base+'/run-resources?page=1'))
  fireEvent.change(screen.getByLabelText('选择已有活动'),{target:{value:'second'}})
  fireEvent.click(await screen.findByRole('button',{name:'批次乙 · 准备中'}))
  fireEvent.click(await screen.findByRole('button',{name:'查看已发布、受授权的测评资源'}))
  await screen.findByRole('option',{name:/量表乙/})
  await act(async()=>late.resolve({list:[resource],nextCursor:'stale'}))
  expect(screen.queryByRole('option',{name:/量表甲/})).not.toBeInTheDocument()
  expect(screen.queryByRole('button',{name:'继续加载测评资源'})).not.toBeInTheDocument()
 })
})
