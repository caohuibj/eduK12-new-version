import {act,fireEvent,render,screen,waitFor,cleanup} from '@testing-library/react'
import {afterEach,describe,it,expect,vi} from 'vitest'
import type {EducationReportApi} from '../components/education-tools/EducationScalePersonalReport'
import type {CompositeAttemptState,CompositeCurrentItem} from '../modules/composite/types'
import {HuiteacherMyAssessmentTasks} from './HuiteacherMyAssessmentTasks'
import type {TeacherAssessmentTask} from './assessmentRuntime.client'

vi.mock('./TeacherAssessmentPage',()=>({TeacherAssessmentPage:({children}:{children:React.ReactNode})=><>{children}</>}))
vi.mock('../components/FinalCompositeAssessment',()=>({default:(props:{state:CompositeAttemptState;onEnterCognitive:(item:CompositeCurrentItem)=>void;
 onEnterSituational:(item:CompositeCurrentItem)=>void;onCompleted:()=>void;onReload:()=>Promise<void>;
 submitScale:(id:string,itemId:string,payload:unknown)=>Promise<unknown>;submitFormSection:(id:string,sectionId:string,payload:unknown)=>Promise<unknown>})=>
 <div><p>共享单元：{props.state.currentItem?.type??'无当前单元'}</p>
  <button onClick={()=>props.onEnterCognitive(props.state.currentItem!)}>进入认知子项</button>
  <button onClick={()=>props.onEnterSituational(props.state.currentItem!)}>进入情境子项</button>
  <button onClick={()=>props.onCompleted()}>子组件完成提示</button>
  <button onClick={()=>void props.onReload()}>刷新单元</button>
  <button onClick={()=>void props.submitScale(props.state.id,props.state.currentItem!.id,{fixture:'scale'}).then(()=>props.onReload())}>提交量表子项</button>
  <button onClick={()=>void props.submitFormSection(props.state.id,props.state.currentItem!.formSectionId!,{fixture:'form'}).then(()=>props.onReload())}>提交表单子项</button>
 </div>}))
vi.mock('../modules/cognitive/pages/CognitiveRunner',()=>({CognitiveRunner:({embedded}:{embedded:{onCompleted:()=>void;onExit:()=>void}})=><div>
 <p>Teacher认知宿主</p><button onClick={embedded.onCompleted}>认知提交已确认</button><button onClick={embedded.onExit}>返回整份任务</button></div>}))
vi.mock('../modules/situational/pages/SituationalRunner',()=>({default:({host}:{host:{onCompleted:()=>void}})=><div>
 <p>Teacher情境宿主</p><button onClick={host.onCompleted}>情境提交已确认</button></div>}))
afterEach(cleanup)
const task:TeacherAssessmentTask={executionId:'execution',organizationId:'org',runId:'run',eventId:'event',eventTitle:'合成正式活动',title:'合成混合任务',
 family:'BUNDLE',status:'STARTED',runStatus:'PUBLISHED',runtimeBindingRef:'parent',consentRequired:false,consentPurpose:null,consentVisibility:null}
const item=(type:CompositeCurrentItem['type']):CompositeCurrentItem=>({id:type.toLowerCase(),type,required:true,position:0,
 ...(type==='COGNITIVE'?{cognitiveSession:{sessionId:'session'} as CompositeCurrentItem['cognitiveSession']}:{}),
 ...(type==='SITUATIONAL'?{situationalAttemptId:'sjt'}:{}),...(type==='FORM_SECTION'?{formSectionId:'section'}:{})})
const state=(type:CompositeCurrentItem['type']|null,status:CompositeAttemptState['status']='IN_PROGRESS'):CompositeAttemptState=>({id:'parent',assessmentId:'runtime',name:task.title,
 instruction:null,status,deliveryMode:'FINAL_ONLY',currentItem:type?item(type):null,items:[],completedItems:0,totalItems:4,progress:0,currentIndex:0,
 startedAt:'2026-10-27T00:00:00Z',lastSavedAt:'2026-10-27T00:00:00Z',completedAt:status==='COMPLETED'?'2026-10-27T00:01:00Z':null,anonymousCode:null})
function fixture(states:CompositeAttemptState[],tasks:TeacherAssessmentTask[]=[task]){
 let position=0
 const api=vi.fn(async(path:string,..._rest:unknown[])=>{
  if(path.startsWith('/my-assessment-tasks'))return {list:tasks,nextCursor:null}
  if(path==='/assessment-composite-attempts/parent?view=current-unit')return states[Math.min(position++,states.length-1)]
  if(path.endsWith('/start-assessment'))return {state:'STARTED',runtimeBindingKind:'COMPOSITE',runtimeBindingRef:'parent'}
  if(path.endsWith('/assessment-consent/accept')||path.includes('/submit'))return {completed:true}
  throw new Error('unexpected synthetic path '+path)
 })
 return api
}
async function open(){await screen.findByText(task.title);fireEvent.click(screen.getByRole('button',{name:'继续测评'}))}
function deferred<T>(){let resolve!:(value:T)=>void;const promise=new Promise<T>(yes=>{resolve=yes});return {promise,resolve}}

describe('Teacher participant host with synthetic runtime DTOs',()=>{
 it('runs Cognitive, SJT, Scale and Form transports and completes only after a fresh parent COMPLETED',async()=>{
  const api=fixture([state('COGNITIVE'),state('SITUATIONAL'),state('SCALE'),state('FORM_SECTION'),state(null,'COMPLETED')]),onCompleted=vi.fn()
  render(<HuiteacherMyAssessmentTasks api={api as EducationReportApi} actorKey="teacher" onCompleted={onCompleted} renderFeedback={completion=><p>授权反馈入口：{completion.executionId}</p>}/>)
  await open();fireEvent.click(await screen.findByRole('button',{name:'进入认知子项'}))
  fireEvent.click(await screen.findByRole('button',{name:'认知提交已确认'}));await screen.findByText('共享单元：SITUATIONAL')
  expect(onCompleted).not.toHaveBeenCalled()
  fireEvent.click(screen.getByRole('button',{name:'进入情境子项'}));fireEvent.click(await screen.findByRole('button',{name:'情境提交已确认'}))
  await screen.findByText('共享单元：SCALE');expect(onCompleted).not.toHaveBeenCalled()
  fireEvent.click(screen.getByRole('button',{name:'提交量表子项'}));await screen.findByText('共享单元：FORM_SECTION')
  fireEvent.click(screen.getByRole('button',{name:'提交表单子项'}));await screen.findByText('本次测评已完成')
  expect(onCompleted).toHaveBeenCalledExactlyOnceWith({executionId:'execution',attemptId:'parent'})
  expect(screen.getByText('授权反馈入口：execution')).toBeTruthy()
  expect(api).toHaveBeenCalledWith('/assessment-composite-attempts/parent/items/scale/scale/submit?response=receipt','POST',{fixture:'scale'})
  expect(api).toHaveBeenCalledWith('/assessment-composite-attempts/parent/form-sections/section/submit','POST',{fixture:'form'})
  expect(api.mock.calls.every(call=>!call[0].includes('start-assessment'))).toBe(true)
 })
 it('does not treat a child completion hint or missing current item as parent completion',async()=>{
  const api=fixture([state(null),state(null)]),onCompleted=vi.fn()
  render(<HuiteacherMyAssessmentTasks api={api as EducationReportApi} actorKey="teacher" onCompleted={onCompleted}/>)
  await open();fireEvent.click(await screen.findByRole('button',{name:'子组件完成提示'}))
  await waitFor(()=>expect(api.mock.calls.filter(call=>call[0].includes('view=current-unit'))).toHaveLength(2))
  expect(onCompleted).not.toHaveBeenCalled();expect(screen.queryByText('本次测评已完成')).toBeNull()
 })
 it('preserves durable completion when list refresh fails and emits each completion once',async()=>{
  const underlying=fixture([state(null,'COMPLETED')]),onCompleted=vi.fn();let listReads=0
  const api=vi.fn(async(path:string,...rest:unknown[])=>{
   if(path==='/my-assessment-tasks'&&++listReads>1)throw new Error('合成列表刷新失败')
   return underlying(path,...rest)
  })
  render(<HuiteacherMyAssessmentTasks api={api as EducationReportApi} actorKey="teacher" onCompleted={onCompleted}/>)
  await open();await screen.findByText('本次测评已完成');await screen.findByText('合成列表刷新失败')
  expect(onCompleted).toHaveBeenCalledTimes(1)
  fireEvent.click(screen.getByRole('button',{name:'返回任务列表'}));fireEvent.click(screen.getByRole('button',{name:'继续测评'}))
  await screen.findByText('本次测评已完成');expect(onCompleted).toHaveBeenCalledTimes(1)
 })
 it('collects the actual assigned consent before first canonical START',async()=>{
  const api=fixture([state('COGNITIVE')],[{...task,status:'ASSIGNED',runtimeBindingRef:null,consentRequired:true,consentPurpose:'合成用途',consentVisibility:'仅授权范围'}])
  render(<HuiteacherMyAssessmentTasks api={api as EducationReportApi} actorKey="teacher"/>)
  await screen.findByText(task.title);fireEvent.click(screen.getByRole('button',{name:'开始测评'}))
  const launch=screen.getByRole('button',{name:'开始或继续测评'})
  expect(launch.hasAttribute('disabled')).toBe(true);expect(api.mock.calls.some(call=>call[0].includes('start-assessment'))).toBe(false)
  fireEvent.click(screen.getByRole('checkbox'));fireEvent.click(launch);await screen.findByText('共享单元：COGNITIVE')
  expect(api.mock.calls.slice(1).map(call=>call[0])).toEqual([
   '/run-executions/execution/assessment-consent/accept','/run-executions/execution/start-assessment','/assessment-composite-attempts/parent?view=current-unit',
  ])
 })
 it.each([false,true])('retains a durable first START across exit without repeating consent (initial read fails: %s)',async(failFirstRead)=>{
  const underlying=fixture([state('SCALE')],[{...task,status:'ASSIGNED',runtimeBindingRef:null,consentRequired:true}])
  let reads=0
  const api=vi.fn(async(path:string,...rest:unknown[])=>{
   if(path.includes('view=current-unit')&&++reads===1&&failFirstRead)throw new Error('合成首次读取失败')
   return underlying(path,...rest)
  })
  render(<HuiteacherMyAssessmentTasks api={api as EducationReportApi} actorKey="teacher"/>)
  fireEvent.click(await screen.findByRole('button',{name:'开始测评'}))
  fireEvent.click(screen.getByRole('checkbox'))
  fireEvent.click(screen.getByRole('button',{name:'开始或继续测评'}))
  await screen.findByText(failFirstRead?'合成首次读取失败':'共享单元：SCALE')
  fireEvent.click(screen.getByRole('button',{name:'返回任务列表'}))
  fireEvent.click(screen.getByRole('button',{name:'继续测评'}))
  await screen.findByText('共享单元：SCALE')
  expect(reads).toBe(2)
  expect(api.mock.calls.filter(call=>call[0].endsWith('/assessment-consent/accept'))).toHaveLength(1)
  expect(api.mock.calls.filter(call=>call[0].endsWith('/start-assessment'))).toHaveLength(1)
  expect(api.mock.calls.filter(call=>call[0].startsWith('/my-assessment-tasks'))).toHaveLength(1)
  expect(screen.queryByRole('checkbox')).toBeNull()
 })
 it('rejects a late completed response after exit and after account replacement',async()=>{
  const pending=deferred<CompositeAttemptState>(),onCompleted=vi.fn()
  const api=vi.fn(async(path:string)=>path==='/my-assessment-tasks'?{list:[task],nextCursor:null}:pending.promise)
  const view=render(<HuiteacherMyAssessmentTasks api={api as EducationReportApi} actorKey="first" onCompleted={onCompleted}/>)
  await open();fireEvent.click(await screen.findByRole('button',{name:'返回任务列表'}))
  view.rerender(<HuiteacherMyAssessmentTasks api={api as EducationReportApi} actorKey="second" onCompleted={onCompleted}/>)
  await act(async()=>pending.resolve(state(null,'COMPLETED')))
  expect(onCompleted).not.toHaveBeenCalled();expect(screen.queryByText('本次测评已完成')).toBeNull()
 })
 it('does not revive an old task on a new API identity',async()=>{
  const oldApi=fixture([state('COGNITIVE')]),newApi=vi.fn(async()=>({list:[],nextCursor:null}))
  const view=render(<HuiteacherMyAssessmentTasks api={oldApi as EducationReportApi} actorKey="teacher"/>)
  await open();await screen.findByText('共享单元：COGNITIVE')
  view.rerender(<HuiteacherMyAssessmentTasks api={newApi as EducationReportApi} actorKey="teacher"/>)
  expect(screen.queryByText('共享单元：COGNITIVE')).toBeNull()
  await screen.findByText('暂无分配给你的测评任务。')
 })
 it('keeps a recoverable error when child progress cannot be read; it never re-submits FINAL',async()=>{
  const underlying=fixture([state('COGNITIVE')]);let parentReads=0
  const api=vi.fn(async(path:string,...rest:unknown[])=>{
   if(path.includes('view=current-unit')&&++parentReads===2)throw new Error('合成进度读取失败')
   return underlying(path,...rest)
  })
  const onCompleted=vi.fn()
  render(<HuiteacherMyAssessmentTasks api={api as EducationReportApi} actorKey="teacher" onCompleted={onCompleted}/>)
  await open();fireEvent.click(await screen.findByRole('button',{name:'进入认知子项'}));fireEvent.click(await screen.findByRole('button',{name:'认知提交已确认'}))
  await screen.findByText('合成进度读取失败');expect(onCompleted).not.toHaveBeenCalled()
  fireEvent.click(screen.getByRole('button',{name:'重新核对任务进度'}));await screen.findByText('共享单元：COGNITIVE')
  expect(api.mock.calls.some(call=>call[0].includes('/submit'))).toBe(false)
 })
})
