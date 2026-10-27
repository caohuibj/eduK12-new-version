import {createEducationAssessmentFeedback} from '../components/education-tools/educationAssessmentFeedbackAdapter'
import {act,cleanup,fireEvent,render,screen,within,waitFor} from '@testing-library/react'
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
 it('adds the approved runtime source only when explicitly assembled and forwards authoritative completion',async()=>{
  const onCompleted=vi.fn(),api=vi.fn(async(path:string)=>{
   if(path==='/my-assessment-tasks')return {list:[{executionId:'runtime-task',title:'认知情境组合任务',eventTitle:'合成活动',family:'BUNDLE',status:'STARTED',runStatus:'PUBLISHED',runtimeBindingRef:'runtime-parent'}],nextCursor:null}
   if(path==='/assessment-composite-attempts/runtime-parent?view=current-unit')return {id:'runtime-parent',status:'COMPLETED',deliveryMode:'FINAL_ONLY',currentItem:null}
   return {list:[]}
  })
  render(<HuiteacherAssessmentTasks api={api as Api} actorKey="actor" assessmentRuntime={{onCompleted,renderFeedback:()=> <p>独立授权反馈组件</p>}}/>)
  await act(async()=>{await vi.dynamicImportSettled()})
  await screen.findByText('认知情境组合任务',{selector:'strong'})
  fireEvent.click(screen.getByRole('button',{name:'继续测评'}))
  await screen.findByText('本次测评已完成')
  expect(onCompleted).toHaveBeenCalledExactlyOnceWith({executionId:'runtime-task',attemptId:'runtime-parent'})
  expect(screen.getByText('独立授权反馈组件')).toBeInTheDocument()
  expect(api.mock.calls.some(call=>call[0].includes('/start-assessment'))).toBe(false)
 })
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
  const help=screen.getByRole('button',{name:'参与测评说明'})
  expect(screen.queryByRole('note',{name:'参与测评说明'})).not.toBeInTheDocument()
  fireEvent.click(help)
  expect(screen.getByRole('note',{name:'参与测评说明'})).toHaveTextContent('学校或项目分配给你的测评')
  fireEvent.keyDown(help,{key:'Escape'})
  expect(screen.queryByRole('note',{name:'参与测评说明'})).not.toBeInTheDocument()

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

it('assembles the real feedback adapter after durable Teacher parent completion',async()=>{
 const api=vi.fn(async(path:string)=>{
  if(path==='/my-assessment-tasks')return {list:[{executionId:'joined-execution',title:'接线合成任务',eventTitle:'合成活动',family:'BUNDLE',status:'STARTED',runStatus:'PUBLISHED',runtimeBindingRef:'joined-parent'}],nextCursor:null}
  if(path==='/assessment-composite-attempts/joined-parent?view=current-unit')return {id:'joined-parent',status:'COMPLETED',deliveryMode:'FINAL_ONLY',currentItem:null}
  if(path==='/assessment-reports/executions/joined-execution')return {schemaVersion:1,kind:'EDUCATION_ASSESSMENT_PERSONAL_REPORT',state:'COMPLETED',mode:'COMPLETION_ONLY',message:'Synthetic completion only'}
  return {list:[]}
 })
 const transport=api as Api
 render(<HuiteacherAssessmentTasks api={transport} actorKey="joined-actor" assessmentRuntime={{renderFeedback:createEducationAssessmentFeedback({api:transport,entry:'TEACHER'})}}/>)
 await act(async()=>{await vi.dynamicImportSettled()})
 fireEvent.click(await screen.findByRole('button',{name:'继续测评'}))
 await screen.findByRole('region',{name:'获准的个人测评反馈'})
 await screen.findByText('当前测评仅允许展示完成状态，不提供分数或诊断。')
 expect(api.mock.calls.filter(([path])=>path==='/assessment-reports/executions/joined-execution')).toHaveLength(1)
 expect(api.mock.calls.some(([path])=>path.includes('/start-assessment'))).toBe(false)
})
