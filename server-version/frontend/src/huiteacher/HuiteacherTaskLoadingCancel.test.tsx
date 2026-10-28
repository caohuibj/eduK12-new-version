import {act,fireEvent,render,screen,waitFor} from '@testing-library/react'
import {describe,expect,it,vi} from 'vitest'
import type {ComponentType} from 'react'
import {HuiteacherMyScaleTasks} from './HuiteacherMyScaleTasks'
import {HuiteacherMyPrivateFormTasks} from './HuiteacherMyPrivateFormTasks'
import type {EducationReportApi} from '../components/education-tools/EducationScalePersonalReport'

const fault=vi.hoisted(()=>({mode:'failed',pending:null as Promise<{default:ComponentType<object>}>|null}))
// Fault-inject only the chunk boundary; use the real helper and real host callbacks.
vi.mock('../components/page-loading/deferredPage',async importOriginal=>{
 const actual=await importOriginal<typeof import('../components/page-loading/deferredPage')>()
 return {...actual,deferredPage:(_load:()=>Promise<{default:ComponentType<object>}>,cancel?:{label:string;run:(props:object)=>void})=>actual.deferredPage(async()=>{
  if(fault.mode==='failed')throw Error('synthetic offline')
  return fault.pending!
 },cancel)}
})
const scaleTask={executionId:'scale',eventId:'event',eventTitle:'合成活动',runId:'run',organizationId:'school',status:'STARTED',runtimeBindingRef:'attempt',title:'Scale任务',runStatus:'PUBLISHED'}
const formTask={executionId:'form',runId:'run',organizationId:'school',eventId:'event',eventTitle:'合成活动',formTitle:'Form任务',status:'STARTED',runStatus:'PUBLISHED',eventStatus:'OPEN',runtimeBindingKind:'COMPOSITE',runtimeBindingRef:'attempt'}

describe.each(['scale','form'] as const)('Teacher %s loader-only cancellation',kind=>{
 it('returns through the existing leave callback on failure or pending load, never after loading',async()=>{
  const listPath=kind==='scale'?'/my-scale-tasks':'/my-private-form-tasks',task=kind==='scale'?scaleTask:formTask
  const api=vi.fn(async(path:string)=>{
   if(path===listPath)return {list:[task]}
   return {id:'attempt',status:'IN_PROGRESS',items:kind==='form'?[{id:'field',type:'FORM'}]:[],units:kind==='form'?[{id:'section',type:'FORM_SECTION',formSectionId:'section'}]:[],currentItem:kind==='form'?{id:'section',type:'FORM_SECTION',formSectionId:'section'}:{id:'scale',type:'SCALE'}}
  })
  fault.mode='failed'
  if(kind==='scale')render(<HuiteacherMyScaleTasks api={api as EducationReportApi}/>);else render(<HuiteacherMyPrivateFormTasks api={api as EducationReportApi} actorKey="teacher"/>)
  const open=()=>screen.getByRole('button',{name:kind==='scale'?'进入本人自评':'打开本人表单'})
  await screen.findByRole('button',{name:kind==='scale'?'进入本人自评':'打开本人表单'})
  fireEvent.click(open());await screen.findByRole('alert')
  expect(open()).toBeDisabled()
  fireEvent.click(screen.getByRole('button',{name:'取消打开测评'}))
  await waitFor(()=>expect(open()).toBeEnabled())
  expect(api.mock.calls.filter(([path])=>path===listPath)).toHaveLength(2)
  let resolve!:(module:{default:ComponentType<object>})=>void
  fault.mode='pending';fault.pending=new Promise(done=>{resolve=done})
  fireEvent.click(open());await screen.findByRole('button',{name:'取消打开测评'})
  expect(open()).toBeDisabled()
  fireEvent.click(screen.getByRole('button',{name:'取消打开测评'}))
  await waitFor(()=>expect(open()).toBeEnabled())
  expect(api.mock.calls.filter(([path])=>path===listPath)).toHaveLength(3)
  await act(async()=>resolve({default:()=> <p>真实作答组件已就绪</p>}))
  expect(screen.queryByText('真实作答组件已就绪')).not.toBeInTheDocument()
  fireEvent.click(open());await screen.findByText('真实作答组件已就绪')
  expect(screen.queryByRole('button',{name:'取消打开测评'})).not.toBeInTheDocument()
  expect(open()).toBeDisabled()
  expect(api.mock.calls.some(([path])=>path.includes('/submit')||path.includes('/start-'))).toBe(false)
 })
})
