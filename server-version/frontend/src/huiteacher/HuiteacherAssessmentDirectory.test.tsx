import {act,cleanup,fireEvent,render,screen,waitFor} from '@testing-library/react'
import {afterEach,describe,it,expect,vi} from 'vitest'
import HuiteacherApp from './HuiteacherApp'
import {SchoolActivityManager} from '../school/SchoolActivityManager'
import {assessmentDirectory,assessmentResource,assessmentScope} from '../test/educationAssessmentResources.fixture'
import type {EducationAssessmentDirectory} from '../api/educationAssessmentResources'
vi.mock('./HuiteacherPersonalSelf',()=>({HuiteacherPersonalSelf:()=>null}))
vi.mock('./HuiteacherMyFormTasks',()=>({HuiteacherMyFormTasks:()=>null}))
vi.mock('./HuiteacherMyScaleTasks',()=>({HuiteacherMyScaleTasks:()=>null}))
vi.mock('./HuiteacherClassRelationships',()=>({HuiteacherClassRelationships:()=>null}))
afterEach(()=>{cleanup();window.history.replaceState(null,'','/');vi.unstubAllGlobals()})
const reply=(data:unknown)=>({ok:true,json:async()=>({code:0,message:'成功',data})})
function deferred<T>(){let resolve!:(value:T)=>void;const promise=new Promise<T>(yes=>{resolve=yes});return {promise,resolve}}

describe('real management mounts discard a directory after leaving the visible section',()=>{
 it('injects the Teacher product factory and ignores a late HTTP response after switching the school section',async()=>{
  const scope=assessmentScope,late=deferred<ReturnType<typeof reply>>()
  let requests=0
  const base=`/api/huiteacher/organizations/${scope.organizationId}`
  const directory=base+`/evaluation-events/${scope.workflowId}/run/assessment-resources?runId=${scope.runId}&expectedVersion=3`
  const fetch=vi.fn(async(url:string)=>{
   if(url.endsWith('/auth/me'))return reply({id:scope.actorKey,username:'Teacher',role:'TEACHER',mustChangePassword:false,organizations:[{organizationId:scope.organizationId,organizationName:'当前学校',productAdmin:true}]})
   if(url.endsWith('/tool-authoring-capabilities'))return reply({canAuthor:false,authorableToolKinds:[]})
   if(url===base+'/evaluation-events')return reply({list:[{id:scope.workflowId,targetId:'target',kind:'ASSESSMENT',title:'真实管理活动',status:'DRAFT',version:1}]})
   if(url===base+`/evaluation-events/${scope.workflowId}/run`)return reply({eventId:scope.workflowId,runId:scope.runId,status:'DRAFT',version:3,trackCount:0})
   if(url===directory)return ++requests===1?late.promise:reply(assessmentDirectory(scope,[{...assessmentResource(),title:'重新读取的授权工具'}]))
   return reply({list:[]})
  })
  vi.stubGlobal('fetch',fetch)
  render(<HuiteacherApp/>)
  fireEvent.click(await screen.findByRole('button',{name:'学校改进'}))
  fireEvent.click(screen.getByRole('link',{name:'评价活动'}))
  fireEvent.click(await screen.findByRole('button',{name:'查看任务配置'}))
  fireEvent.click(await screen.findByRole('button',{name:'读取已授权测评目录'}))
  await waitFor(()=>expect(fetch).toHaveBeenCalledWith(directory,expect.objectContaining({credentials:'same-origin',method:'GET'})))
  fireEvent.click(screen.getByRole('link',{name:'学校表单'}))
  await act(async()=>late.resolve(reply(assessmentDirectory())))
  fireEvent.click(screen.getByRole('link',{name:'评价活动'}))
  expect(screen.queryByRole('option',{name:/已授权测评甲/})).not.toBeInTheDocument()
  fireEvent.click(screen.getByRole('button',{name:'读取已授权测评目录'}))
  expect(await screen.findByRole('option',{name:/重新读取的授权工具/})).toBeInTheDocument()
  expect(requests).toBe(2)
 })

 it('discards a pending School directory on a compact configuration tab change while retaining the active run',async()=>{
  const scope={...assessmentScope,product:'SCHOOL' as const},late=deferred<EducationAssessmentDirectory>()
  const activity={courseId:scope.workflowId,organizationId:scope.organizationId,title:'当前活动',purpose:'SCHOOL_CLIMATE',status:'DRAFT',version:1,participantCount:0,runCount:1,runs:[{runId:scope.runId,name:'当前批次',status:'DRAFT'}]}
  const api=vi.fn(async(path:string)=>{
   if(path.endsWith('pageSize=50'))return {list:[activity]}
   if(path.endsWith('/'+scope.workflowId))return activity
   if(path.endsWith('/eligible-classes'))return {list:[]}
   if(path.endsWith('/runs/'+scope.runId))return {run:{id:scope.runId,name:'当前批次',status:'DRAFT',version:3},tracks:[]}
   throw Error('Unexpected '+path)
  })
  const adapter={list:vi.fn(()=>late.promise),addTrack:vi.fn()}
  render(<SchoolActivityManager compact organizationId={scope.organizationId} actorKey={scope.actorKey} api={api as never} isAdmin classes={[]} assessmentResources={adapter}/>)
  fireEvent.click(await screen.findByRole('button',{name:'配置活动：当前活动'}))
  fireEvent.click(await screen.findByRole('button',{name:'正式测评批次'}))
  fireEvent.click(await screen.findByRole('button',{name:'当前批次 · 准备中'}))
  fireEvent.click(await screen.findByRole('button',{name:'读取已授权测评目录'}))
  await waitFor(()=>expect(adapter.list).toHaveBeenCalledTimes(1))
  fireEvent.click(screen.getByRole('button',{name:'班级与参与者'}))
  await act(async()=>late.resolve(assessmentDirectory(scope)))
  fireEvent.click(screen.getByRole('button',{name:'正式测评批次'}))
  expect(screen.queryByRole('option',{name:/已授权测评甲/})).not.toBeInTheDocument()
  expect(screen.getByRole('button',{name:'当前批次 · 准备中'})).toBeInTheDocument()
  expect(screen.getByRole('button',{name:'读取已授权测评目录'})).toBeEnabled()
 })
})
