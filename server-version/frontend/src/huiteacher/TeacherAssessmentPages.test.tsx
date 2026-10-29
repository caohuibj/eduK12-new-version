import {useState} from 'react'
import {cleanup,fireEvent,render,screen,waitFor,within} from '@testing-library/react'
import {afterEach,describe,expect,it,vi} from 'vitest'
import {TeacherAssessmentPage,TeacherAssessmentProvider} from './TeacherAssessmentPage'
import {HuiteacherAssessmentTasks} from './HuiteacherAssessmentTasks'
import {HuiteacherPersonalSelf} from './HuiteacherPersonalSelf'
vi.mock('../survey/TaskForm',()=>({TaskForm:({answer,onChange}:{answer:Record<string,string>;onChange:(key:string,value:string)=>void})=><input aria-label="草稿答案" value={answer.q??''} onChange={e=>onChange('q',e.target.value)}/>}))
vi.mock('../components/FinalCompositeAssessment',()=>({default:()=> <p>共享作答界面</p>}))
type Api=Parameters<typeof HuiteacherAssessmentTasks>[0]['api']
function Workspace({api}:{api:Api}){const [active,setActive]=useState(false);return <TeacherAssessmentProvider onActiveChange={setActive}><div hidden={active}><h1>我的任务首页</h1><HuiteacherAssessmentTasks api={api} actorKey="teacher"/></div></TeacherAssessmentProvider>}
afterEach(()=>{cleanup();sessionStorage.clear()})
describe('dedicated Teacher assessment pages',()=>{
 it('shows only the answer page and returns without discarding the form draft or reloading other task sources',async()=>{
  let started=false
  const api=vi.fn(async(path:string)=>{
   if(path==='/my-form-tasks')return {list:[{executionId:'form',formTitle:'教师表单',eventTitle:'教研',status:started?'STARTED':'ASSIGNED',runtimeBindingRef:started?'attempt':null}]}
   if(path==='/run-executions/form/start'){started=true;return {state:'STARTED',runtimeBindingKind:'HUITEACHER_FORM_V2',runtimeBindingRef:'attempt'}}
   if(path==='/form-attempts/attempt/task')return {attemptId:'attempt',formId:'form',status:'STARTED',title:'教师表单',definitionDigest:'digest',pages:[]}
   return {list:[]}
  })
  render(<Workspace api={api as Api}/>)
  fireEvent.click(await screen.findByRole('button',{name:'开始测评'}))
  const page=await screen.findByRole('region',{name:'测评独立作答页'})
  expect(screen.queryByRole('heading',{name:'我的任务首页'})).not.toBeInTheDocument()
  expect(screen.queryByRole('button',{name:'继续测评'})).not.toBeInTheDocument()
  fireEvent.change(await within(page).findByRole('textbox',{name:'草稿答案'}),{target:{value:'保留我的草稿'}})
  fireEvent.click(within(page).getByRole('button',{name:'返回测评列表'}))
  expect(await screen.findByRole('heading',{name:'我的任务首页'})).toBeVisible()
  fireEvent.click(screen.getByRole('button',{name:'继续测评'}))
  expect(await screen.findByRole('textbox',{name:'草稿答案'})).toHaveValue('保留我的草稿')
  expect(api.mock.calls.filter(([path])=>path==='/my-private-form-tasks')).toHaveLength(1)
  expect(api.mock.calls.filter(([path])=>path==='/my-scale-tasks')).toHaveLength(1)
  expect(api.mock.calls.filter(([path])=>path.includes('/start'))).toHaveLength(1)
 })
 it('opens feedback as a read-only page and closing returns to the same list without starting a task',async()=>{
  const api=vi.fn(async(path:string)=>path==='/my-scale-tasks'?{list:[{executionId:'done',title:'已完成工具',eventTitle:'个人发展',status:'COMPLETED',runStatus:'CLOSED'}]}:path.endsWith('/personal-summary')?{kind:'HUITEACHER_PERSONAL_DESCRIPTION',state:'READY',metrics:[{key:'one',label:'本次记录合计',value:12,precision:0}],limitations:[]}:{list:[]})
  render(<Workspace api={api as Api}/>)
  fireEvent.click(await screen.findByRole('button',{name:'查看本人反馈'}))
  const page=await screen.findByRole('region',{name:'个人反馈详情'})
  expect(within(page).getByText('个人反馈 · 只读结果')).toBeInTheDocument()
  expect(within(page).queryByRole('textbox')).not.toBeInTheDocument()
  expect(within(page).getByText('12',{selector:'strong'})).toBeInTheDocument()
  expect(screen.queryByRole('heading',{name:'我的任务首页'})).not.toBeInTheDocument()
  fireEvent.click(within(page).getByRole('button',{name:'返回测评列表'}))
  await waitFor(()=>expect(screen.queryByRole('region',{name:'个人反馈详情'})).not.toBeInTheDocument())
  expect(screen.getByRole('button',{name:'查看本人反馈'})).toBeEnabled()
  expect(api.mock.calls.every(call=>call.length===1)).toBe(true)
  expect(api.mock.calls.filter(([path])=>path==='/my-scale-tasks')).toHaveLength(1)
 })
 it('uses the shared question player for personal tools, preserves drafts on return, and leaves the final submit manual',async()=>{
  let started=false
  const attempt={assessmentId:'personal',resourceId:'tool',title:'个人工具',status:'IN_PROGRESS',attemptEpoch:1,definitionHash:'hash',runner:{items:[{itemCode:'q1',content:'第一题',required:true,options:[{value:1,label:'第一题的选择'}]},{itemCode:'q2',content:'最后一题',required:true,options:[{value:2,label:'最后一题的选择'}]}]},reportMode:'PERSONAL_ONLY'}
  const api=vi.fn(async(path:string,method?:string)=>{
   if(path==='/personal-scale/catalog')return {list:[{resourceId:'tool',title:'个人工具',version:'1',scientificMaturity:'PILOT'}]}
   if(path==='/personal-scale/assessments'&&method==='POST'){started=true;return {assessmentId:'personal'}}
   if(path==='/personal-scale/assessments')return {list:started?[{assessmentId:'personal',resourceId:'tool',title:'个人工具',status:'IN_PROGRESS',startedAt:'2026-10-26',completedAt:null}]:[]}
   if(path==='/personal-scale/assessments/personal')return attempt
   throw Error('Unexpected '+path)
  })
  function Personal(){const [active,setActive]=useState(false);return <TeacherAssessmentProvider scope="ht-personal-self" onActiveChange={setActive}><div hidden={active}><HuiteacherPersonalSelf api={api as Api}/></div></TeacherAssessmentProvider>}
  render(<Personal/>)
  fireEvent.click(await screen.findByRole('button',{name:'发起个人测评'}))
  const first=await screen.findByRole('button',{name:'第一题的选择'})
  await waitFor(()=>expect(first).toBeEnabled())
  fireEvent.click(first)
  await screen.findByRole('region',{name:'量表题目 2 / 2'})
  fireEvent.click(screen.getByRole('button',{name:'最后一题的选择'}))
  await waitFor(()=>expect(screen.getByRole('button',{name:'最后一题的选择'})).toHaveAttribute('aria-pressed','true'))
  expect(api.mock.calls.some(([path])=>path.endsWith('/final'))).toBe(false)
  fireEvent.click(screen.getByRole('button',{name:'返回测评列表'}))
  fireEvent.click(await screen.findByRole('button',{name:'继续作答'}))
  await screen.findByRole('region',{name:'量表题目 1 / 2'})
  expect(screen.getByRole('button',{name:'第一题的选择'})).toHaveAttribute('aria-pressed','true')
  expect(api.mock.calls.filter(([,method])=>method==='POST')).toHaveLength(1)
 })

 it('keeps an inactive section from opening a page and preserves its mounted draft across navigation',async()=>{
  const change=vi.fn()
  const view=(scope:string)=><TeacherAssessmentProvider scope={scope} onActiveChange={change}><TeacherAssessmentPage title="草稿" kind="answer"><input aria-label="页面草稿" defaultValue="保留"/></TeacherAssessmentPage></TeacherAssessmentProvider>
  const {rerender}=render(view('ht-personal-self'))
  expect(screen.queryByRole('region',{name:'测评独立作答页'})).not.toBeInTheDocument()
  rerender(view('ht-personal-tasks'))
  const input=await screen.findByRole('textbox',{name:'页面草稿'})
  fireEvent.change(input,{target:{value:'未提交的输入'}})
  rerender(view('ht-personal-self'))
  expect(input).not.toBeVisible()
  rerender(view('ht-personal-tasks'))
  expect(await screen.findByRole('textbox',{name:'页面草稿'})).toHaveValue('未提交的输入')
 })

})
