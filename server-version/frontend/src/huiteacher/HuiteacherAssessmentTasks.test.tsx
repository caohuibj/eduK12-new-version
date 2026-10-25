import {cleanup,fireEvent,render,screen,within,waitFor} from '@testing-library/react'
import {afterEach,describe,expect,it,vi} from 'vitest'
import {HuiteacherAssessmentTasks} from './HuiteacherAssessmentTasks'
vi.mock('../survey/SurveyPublicApp',()=>({TaskForm:()=> <input aria-label="测评答案"/>}))
vi.mock('../components/FinalCompositeAssessment',()=>({default:()=> <p>原有授权作答界面</p>}))
afterEach(cleanup)
type Api=Parameters<typeof HuiteacherAssessmentTasks>[0]['api']
const form={executionId:'form-task',formTitle:'教学体验测评',eventTitle:'春季发展活动',status:'ASSIGNED',runtimeBindingRef:null}
const privateForm={executionId:'private-task',formTitle:'课堂观察测评',eventTitle:'教研活动',status:'STARTED',runStatus:'PUBLISHED',eventStatus:'OPEN',runtimeBindingRef:'private-attempt',runtimeBindingKind:'COMPOSITE'}
const scale={executionId:'scale-task',title:'教师发展测评',eventTitle:'专业发展活动',status:'COMPLETED',runStatus:'CLOSED'}
const card=(title:string)=>screen.getByText(title,{selector:'strong'}).closest('article')!
describe('unified Teacher assessment inbox',()=>{
 it('combines formats and retains the authorized start route',async()=>{
  const api=vi.fn(async(path:string)=>{
   if(path==='/my-form-tasks')return {list:[form]}
   if(path==='/my-private-form-tasks')return {list:[privateForm]}
   if(path==='/my-scale-tasks')return {list:[scale]}
   if(path==='/run-executions/form-task/start')return {state:'STARTED',runtimeBindingKind:'HUITEACHER_FORM_V2',runtimeBindingRef:'form-attempt'}
   if(path==='/form-attempts/form-attempt/task')return {attemptId:'form-attempt',title:'教学体验作答',status:'STARTED',pages:[]}
   throw Error('Unexpected request '+path)
  })
  render(<HuiteacherAssessmentTasks api={api as Api} actorKey="actor"/>)
  await screen.findByText('教师发展测评',{selector:'strong'})
  expect(screen.queryAllByRole('heading')).toHaveLength(1)
  expect(screen.getByRole('heading',{name:/参与测评/})).toBeInTheDocument()
  expect(within(card('教学体验测评')).getByText('待完成')).toBeInTheDocument()
  expect(within(card('课堂观察测评')).getByRole('button',{name:'继续测评'})).toBeEnabled()
  expect(within(card('教师发展测评')).getByRole('button',{name:'查看本人反馈'})).toBeEnabled()
  expect(screen.queryByText('暂无分配给你的测评任务。')).not.toBeInTheDocument()
  fireEvent.click(within(card('教学体验测评')).getByRole('button',{name:'开始测评'}))
  await screen.findByRole('textbox',{name:'测评答案'})
  expect(api).toHaveBeenCalledWith('/run-executions/form-task/start','POST',{})
  expect(api.mock.calls.filter(([path])=>path==='/my-private-form-tasks')).toHaveLength(1)
  expect(api.mock.calls.filter(([path])=>path==='/my-scale-tasks')).toHaveLength(1)
 })
 it('waits for all sources before showing one empty state',async()=>{
  let resolve!:(value:{list:never[]})=>void
  const delayed=new Promise<{list:never[]}>(done=>{resolve=done})
  const api=vi.fn(async(path:string)=>path==='/my-scale-tasks'?delayed:{list:[]})
  render(<HuiteacherAssessmentTasks api={api as Api} actorKey="actor"/>)
  expect(screen.getByRole('status')).toHaveTextContent('正在读取测评任务')
  expect(screen.queryByText('暂无分配给你的测评任务。')).not.toBeInTheDocument()
  resolve({list:[]})
  expect(await screen.findByText('暂无分配给你的测评任务。')).toBeInTheDocument()
  expect(screen.queryByRole('status')).not.toBeInTheDocument()
 })
 it('keeps successful tasks during partial failure and recovers via existing retry',async()=>{
  let failed=true
  const api=vi.fn(async(path:string)=>{
   if(path==='/my-form-tasks'&&failed)throw Error('暂时无法连接')
   return {list:path==='/my-scale-tasks'?[scale]:[]}
  })
  render(<HuiteacherAssessmentTasks api={api as Api} actorKey="actor"/>)
  await screen.findByRole('alert')
  expect(await screen.findByText('教师发展测评',{selector:'strong'})).toBeInTheDocument()
  expect(screen.queryByText('暂无分配给你的测评任务。')).not.toBeInTheDocument()
  failed=false
  fireEvent.click(screen.getByRole('button',{name:'重试读取任务列表'}))
  await waitFor(()=>expect(screen.queryByRole('alert')).not.toBeInTheDocument())
  expect(api.mock.calls.every(call=>call.length===1)).toBe(true)
 })
 it('retains private task pagination in the unified list',async()=>{
  const api=vi.fn(async(path:string)=>{
   if(path==='/my-private-form-tasks')return {list:[privateForm],nextCursor:'page-2'}
   if(path==='/my-private-form-tasks?cursor=page-2')return {list:[{...privateForm,executionId:'next',formTitle:'第二项测评'}],nextCursor:null}
   return {list:[]}
  })
  render(<HuiteacherAssessmentTasks api={api as Api} actorKey="actor"/>)
  fireEvent.click(await screen.findByRole('button',{name:'加载更多测评任务'}))
  await screen.findByText('第二项测评',{selector:'strong'})
  expect(screen.getByText('课堂观察测评',{selector:'strong'})).toBeInTheDocument()
  expect(screen.queryByRole('button',{name:'加载更多测评任务'})).not.toBeInTheDocument()
  expect(api).toHaveBeenCalledWith('/my-private-form-tasks?cursor=page-2')
 })
})
