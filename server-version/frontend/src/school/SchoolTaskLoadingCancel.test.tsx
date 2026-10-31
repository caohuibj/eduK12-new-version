import {act,fireEvent,render,screen} from '@testing-library/react'
import {describe,expect,it,vi} from 'vitest'
import type {ComponentType} from 'react'
import {SchoolStudentTasks} from './SchoolStudentTasks'
import {SchoolTeacherTasks} from './SchoolTeacherTasks'
import {SchoolParentTasks} from './SchoolParentTasks'
import type {SchoolApi} from './SchoolRecovery'

const fault=vi.hoisted(()=>({mode:'failed',pending:null as Promise<{default:ComponentType<object>}>|null}))
// Inject chunk faults, but retain the actual deferred loader and host onExit.
vi.mock('../components/page-loading/deferredPage',async importOriginal=>{
 const actual=await importOriginal<typeof import('../components/page-loading/deferredPage')>()
 return {...actual,deferredPage:(_load:()=>Promise<{default:ComponentType<object>}>,cancel?:{label:string;run:(props:object)=>void})=>actual.deferredPage(async()=>{
  if(fault.mode==='failed')throw Error('synthetic offline')
  return fault.pending!
 },cancel)}
})
const executionId='00000000-0000-4000-8000-000000000042'
const observer={executionId:'observer',runId:'run',organizationId:'school',activityId:'activity',activityTitle:'观察活动',runTitle:'观察任务',studentReference:'合成观察编号',status:'ASSIGNED',deadline:null,consentRequired:false}

describe.each(['student','teacher','parent'] as const)('School %s loader-only cancellation',role=>{
 it('returns on failed or pending loading without reviving a cancelled late chunk',async()=>{
  const api=vi.fn(async(path:string)=>{
   if(path==='/my/student-reference')return {reference:'SYNTHETIC'}
   if(path.startsWith('/my/activity-tasks'))return {list:[{id:executionId,activityId:'activity',activityTitle:'校园活动',kind:'MEASUREMENT',resourceFamily:'SCALE',title:'学生测评',status:'PENDING',deadline:null,href:`/organizations/school/activities/activity/runs/run/executions/${executionId}`}],total:1,page:1,hasMore:false,truncated:false}
   if(path.startsWith('/my/'))return {list:[observer],truncated:false}
   throw Error('Unexpected synthetic API '+path)
  })
  fault.mode='failed'
  if(role==='student')render(<SchoolStudentTasks api={api as SchoolApi}/> )
  else if(role==='teacher')render(<SchoolTeacherTasks compact api={api as SchoolApi} organizationId="school"/> )
  else render(<SchoolParentTasks api={api as SchoolApi}/> )
  const name=role==='student'?'开始／继续官方测评':role==='teacher'?'开始／继续教师观察测评':'查看任务（开始／继续校园正式测评）'
  const enter=()=>screen.getByRole('button',{name})
  fireEvent.click(await screen.findByRole('button',{name}));await screen.findByRole('alert')
  expect(screen.getByRole('button',{name:'重试页面内容'})).toBeInTheDocument()
  fireEvent.click(screen.getByRole('button',{name:'返回任务列表'}))
  expect(await screen.findByRole('button',{name})).toBeEnabled()
  expect(screen.queryByRole('alert')).not.toBeInTheDocument()
  let resolve!:(module:{default:ComponentType<object>})=>void
  fault.mode='pending';fault.pending=new Promise(done=>{resolve=done})
  fireEvent.click(enter());await screen.findByRole('button',{name:'返回任务列表'})
  expect(screen.getByText('正在加载页面内容…')).toBeInTheDocument()
  fireEvent.click(screen.getByRole('button',{name:'返回任务列表'}))
  expect(await screen.findByRole('button',{name})).toBeEnabled()
  await act(async()=>resolve({default:()=> <p>校园作答组件已就绪</p>}))
  expect(screen.queryByText('校园作答组件已就绪')).not.toBeInTheDocument()
  fireEvent.click(enter());await screen.findByText('校园作答组件已就绪')
  expect(screen.queryByRole('button',{name:'返回任务列表'})).not.toBeInTheDocument()
  expect(api.mock.calls.every(([path])=>path.startsWith('/my/'))).toBe(true)
 })
})
