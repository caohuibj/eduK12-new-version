import {fireEvent,render,screen,waitFor} from '@testing-library/react'
import {describe,expect,it,vi} from 'vitest'
import type {ReactNode} from 'react'
import {HuiteacherMyScaleTasks} from './HuiteacherMyScaleTasks'
import {HuiteacherMyPrivateFormTasks} from './HuiteacherMyPrivateFormTasks'
import type {EducationReportApi} from '../components/education-tools/EducationScalePersonalReport'
import type {CompositeAttemptState} from '../modules/composite/types'

vi.mock('./TeacherAssessmentPage',()=>({TeacherAssessmentPage:({children}:{children:ReactNode})=><>{children}</>}))
vi.mock('../components/FinalCompositeAssessment',()=>({default:(props:{state:CompositeAttemptState;onReload:()=>Promise<void>;onExit:()=>void})=><div>
 <p>当前单元 {props.state.currentItem?.id}</p>
 <button onClick={()=>void props.onReload()}>读取下一单元</button><button onClick={props.onExit}>保存并返回列表</button>
 </div>}))
const scaleTask={executionId:'scale',eventId:'event',eventTitle:'合成活动',runId:'run',organizationId:'school',status:'STARTED',runtimeBindingRef:'attempt',title:'Scale任务',runStatus:'PUBLISHED'}
const formTask={executionId:'form',runId:'run',organizationId:'school',eventId:'event',eventTitle:'合成活动',formTitle:'Form任务',status:'STARTED',runStatus:'PUBLISHED',eventStatus:'OPEN',runtimeBindingKind:'COMPOSITE',runtimeBindingRef:'attempt'}
function deferred<T>(){let resolve!:(value:T)=>void;const promise=new Promise<T>(yes=>{resolve=yes});return {promise,resolve}}

describe.each(['scale','form'] as const)('Teacher %s current-unit list isolation',kind=>{
 const listPath=kind==='scale'?'/my-scale-tasks':'/my-private-form-tasks'
 const currentPath=(kind==='scale'?'/composite-attempts/':'/private-form-composite-attempts/')+'attempt?view=current-unit'
 const task=kind==='scale'?scaleTask:formTask
 const state=(index:number,status='IN_PROGRESS')=>({id:'attempt',status,items:kind==='form'?[{id:'field',type:'FORM'}]:[],units:kind==='form'?[1,2].map(i=>({id:'section-'+i,type:'FORM_SECTION',formSectionId:'section-'+i})):[],currentItem:status==='COMPLETED'?null:kind==='form'?{id:'section-'+index,type:'FORM_SECTION',formSectionId:'section-'+index}:{id:'scale-'+index,type:'SCALE'}})
 const mount=(api:EducationReportApi)=>kind==='scale'?render(<HuiteacherMyScaleTasks api={api}/>):render(<HuiteacherMyPrivateFormTasks api={api} actorKey="teacher"/>)
 const open=async()=>fireEvent.click(await screen.findByRole('button',{name:kind==='scale'?'进入本人自评':'打开本人表单'}))
 it('does not reread the hidden list between units and refreshes after explicit saved exit',async()=>{
  let reads=0,lists=0
  const api=vi.fn(async(path:string)=>{
   if(path===listPath){lists++;return {list:[task]}}
   if(path===currentPath)return state(++reads)
   throw Error('Unexpected path '+path)
  })
  mount(api as EducationReportApi);await open();await screen.findByText('当前单元 '+(kind==='scale'?'scale-1':'section-1'))
  expect(lists).toBe(1)
  fireEvent.click(screen.getByRole('button',{name:'读取下一单元'}));await screen.findByText('当前单元 '+(kind==='scale'?'scale-2':'section-2'))
  expect(api.mock.calls.filter(([path])=>path===currentPath)).toHaveLength(2)
  expect(lists).toBe(1)
  fireEvent.click(screen.getByRole('button',{name:'保存并返回列表'}))
  await waitFor(()=>expect(lists).toBe(2))
 })
 it('confirms durable completion without waiting for the independent list refresh',async()=>{
  let reads=0,lists=0
  const pending=deferred<{list:typeof task[]}>()
  const api=vi.fn(async(path:string)=>{
   if(path===listPath)return ++lists===1?{list:[task]}:pending.promise
   if(path===currentPath)return state(1,++reads===1?'IN_PROGRESS':'COMPLETED')
   if(path.endsWith('/personal-summary'))return {state:'PENDING'}
   throw Error('Unexpected path '+path)
  })
  mount(api as EducationReportApi);await open();await screen.findByRole('button',{name:'读取下一单元'})
  fireEvent.click(screen.getByRole('button',{name:'读取下一单元'}))
  await screen.findByText(kind==='scale'?'报告正在生成，请稍后重新读取。无需再次交卷。':'本次表单已正式提交。')
  expect(lists).toBe(2)
  expect(screen.queryByRole('button',{name:'读取下一单元'})).not.toBeInTheDocument()
  pending.resolve({list:[{...task,status:'COMPLETED'}]})
  await waitFor(()=>expect(screen.getByText(kind==='scale'?'COMPLETED':'已完成正式提交')).toBeInTheDocument())
  expect(api.mock.calls.filter(([path])=>path===currentPath)).toHaveLength(2)
 })
})
