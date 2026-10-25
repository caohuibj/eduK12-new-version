import {useState} from 'react'
import {act,cleanup,fireEvent,render,screen,waitFor} from '@testing-library/react'
import {afterEach,describe,expect,it,vi} from 'vitest'
import {HuiteacherMyFormTasks} from './HuiteacherMyFormTasks'
import {HuiteacherMyScaleTasks} from './HuiteacherMyScaleTasks'
import {HuiteacherMyPrivateFormTasks} from './HuiteacherMyPrivateFormTasks'
import {HuiteacherPersonalSelf} from './HuiteacherPersonalSelf'

type Api=Parameters<typeof HuiteacherMyFormTasks>[0]['api']
vi.mock('../survey/SurveyPublicApp',()=>({TaskForm:({answer,onChange}:{answer:Record<string,string>;onChange:(key:string,value:string)=>void})=><input aria-label="当前答案" value={answer.q??''} onChange={e=>onChange('q',e.target.value)}/>}))
vi.mock('../components/FinalCompositeAssessment',()=>({default:function Runner(){
 const [answer,setAnswer]=useState('')
 return <input aria-label="当前答案" value={answer} onChange={e=>setAnswer(e.target.value)}/>
}}))
const views={
 form:{render:(api:Api)=><HuiteacherMyFormTasks api={api}/>,path:'/my-form-tasks',empty:'暂无已分配的教师发展评价任务。'},
 scale:{render:(api:Api)=><HuiteacherMyScaleTasks api={api}/>,path:'/my-scale-tasks',empty:'目前尚未安排经过授权的教师个人 Scale 测评。'},
 personal:{render:(api:Api)=><HuiteacherPersonalSelf api={api}/>,path:'/personal-scale/catalog',empty:'暂未获得个人测评工具授权。可继续使用学校安排的其他评价任务。'},
 private:{render:(api:Api)=><HuiteacherMyPrivateFormTasks api={api} actorKey="teacher"/>,path:'/my-private-form-tasks',empty:'暂无分配给本人的自编表单任务。'},
}
function deferred<T>(){
 let resolve!:(value:T)=>void, reject!:(error:Error)=>void
 const promise=new Promise<T>((yes,no)=>{resolve=yes;reject=no})
 return {promise,resolve,reject}
}
afterEach(()=>{cleanup();sessionStorage.clear()})
describe('Teacher list request feedback',()=>{
 it.each(Object.keys(views) as Array<keyof typeof views>)('%s distinguishes pending, failed and successful empty GETs',async key=>{
  const view=views[key],first=deferred<{list:unknown[]}>(),retry=deferred<{list:unknown[]}>()
  let reads=0
  const api=vi.fn((path:string)=>path===view.path?(++reads===1?first.promise:retry.promise):Promise.resolve({list:[]}))
  render(view.render(api as Api))
  expect(screen.getByRole('status')).toHaveTextContent('正在读取任务列表')
  expect(screen.queryByText(view.empty)).not.toBeInTheDocument()
  await act(async()=>first.reject(Error('网络暂不可用')))
  expect(screen.getByRole('alert')).toHaveTextContent('网络暂不可用')
  expect(screen.queryByText(view.empty)).not.toBeInTheDocument()
  fireEvent.click(screen.getByRole('button',{name:'重试读取任务列表'}))
  expect(screen.getByRole('status')).toHaveTextContent('正在读取任务列表')
  expect(screen.queryByRole('alert')).not.toBeInTheDocument()
  await act(async()=>retry.resolve({list:[]}))
  expect(await screen.findByText(view.empty)).toBeInTheDocument()
  expect(api.mock.calls.every(call=>call.length===1)).toBe(true)
  if(key==='personal')expect(api.mock.calls.filter(([path])=>path==='/personal-scale/assessments')).toHaveLength(2)
 })
 it('retries both personal lists when the assessment history GET fails',async()=>{
  let historyReads=0
  const api=vi.fn(async(path:string)=>{
   if(path==='/personal-scale/assessments'&&++historyReads===1)throw Error('记录读取失败')
   return {list:[]}
  })
  render(<HuiteacherPersonalSelf api={api as Api}/>)
  expect(await screen.findByRole('alert')).toHaveTextContent('记录读取失败')
  expect(screen.queryByText(views.personal.empty)).not.toBeInTheDocument()
  fireEvent.click(screen.getByRole('button',{name:'重试读取任务列表'}))
  await screen.findByText('暂无个人测评记录。')
  expect(api.mock.calls.filter(([path])=>path==='/personal-scale/catalog')).toHaveLength(2)
  expect(historyReads).toBe(2)
 })
 it('retries the failed private cursor without replacing earlier rows',async()=>{
  let pageReads=0
  const api=vi.fn(async(path:string)=>{
   if(path==='/my-private-form-tasks')return {list:[{...baseTask,executionId:'first',formTitle:'第一页任务'}],nextCursor:'next cursor'}
   if(++pageReads===1)throw Error('下一页失败')
   return {list:[{...baseTask,executionId:'second',formTitle:'第二页任务'}],nextCursor:null}
  })
  render(<HuiteacherMyPrivateFormTasks api={api as Api} actorKey="teacher"/>)
  fireEvent.click(await screen.findByRole('button',{name:'加载更多表单任务'}))
  await screen.findByRole('alert')
  fireEvent.click(screen.getByRole('button',{name:'重试读取任务列表'}))
  await screen.findByText('第二页任务')
  expect(screen.getByText('第一页任务')).toBeInTheDocument()
  expect(api.mock.calls.map(([path])=>path)).toEqual(['/my-private-form-tasks','/my-private-form-tasks?cursor=next%20cursor','/my-private-form-tasks?cursor=next%20cursor'])
 })
 it.each(Object.keys(views) as Array<keyof typeof views>)('%s ignores a late prior API response',async key=>{
  const view=views[key],old=deferred<{list:unknown[]}>()
  const api=vi.fn(()=>old.promise),next=vi.fn(async()=>({list:[]}))
  const {rerender}=render(view.render(api as Api))
  rerender(view.render(next as Api))
  await screen.findByText(view.empty)
  await act(async()=>old.reject(Error('旧账号错误')))
  expect(screen.queryByRole('alert')).not.toBeInTheDocument()
  expect(screen.getByText(view.empty)).toBeInTheDocument()
 })
 it.each([false,true])('ignores old form endpoint results when student becomes %s',async student=>{
  const old=deferred<{list:unknown[]}>(),newPath=student?'/my-student-evaluations':'/my-form-tasks'
  const api=vi.fn((path:string)=>path===newPath?Promise.resolve({list:[]}):old.promise)
  const {rerender}=render(<HuiteacherMyFormTasks api={api as Api} student={!student}/>)
  rerender(<HuiteacherMyFormTasks api={api as Api} student={student}/>)
  await screen.findByText(student?'暂无已分配的学生评教任务。':views.form.empty)
  await act(async()=>old.resolve({list:[{executionId:'old',formTitle:'旧入口任务'}]}))
  expect(screen.queryByText('旧入口任务')).not.toBeInTheDocument()
  expect(api.mock.calls.map(([path])=>path)).toEqual([student?'/my-form-tasks':'/my-student-evaluations',newPath])
 })
})
const baseTask={executionId:'execution',eventId:'event',eventTitle:'活动',runId:'run',organizationId:'org',status:'STARTED',runtimeBindingRef:'attempt',runtimeBindingKind:'COMPOSITE',resourceKey:'resource',title:'已分配任务',formTitle:'已分配任务',runStatus:'PUBLISHED',eventStatus:'OPEN'}
describe('List-only retry preserves current answering',()=>{
 it.each(['form','scale','personal','private'] as const)('%s retains rows and answers without replaying POST',async key=>{
  const view=views[key];let listReads=0
  const api=vi.fn(async(path:string,method?:string)=>{
   if(path===view.path){
    if(++listReads===2)throw Error('列表刷新失败')
    return {list:key==='personal'?[{resourceId:'resource',title:'已分配任务',version:'1',scientificMaturity:'PILOT'}]:[baseTask]}
   }
   if(path==='/personal-scale/assessments')return method==='POST'?{assessmentId:'attempt'}:{list:[]}
   if(path==='/personal-scale/assessments/attempt')return {assessmentId:'attempt',title:'当前作答',status:'IN_PROGRESS',definitionHash:'hash',runner:{items:[{itemCode:'q',content:'当前问题',required:true,options:[{value:'yes',label:'我的选择'}]}]}}
   if(path==='/form-attempts/attempt/task')return {attemptId:'attempt',formId:'form',title:'当前作答',status:'STARTED',definitionDigest:'hash',pages:[{id:'page',questions:[{itemKey:'q',type:'text',title:'问题'}]}]}
   return {id:'attempt',status:'IN_PROGRESS',items:[{id:'item',type:'FORM'}],units:[{id:'section',type:'FORM_SECTION',formSectionId:'section'}],currentItem:{id:'section',type:'FORM_SECTION',formSectionId:'section',definitionHash:'hash'}}
  })
  render(view.render(api as Api))
  const open={form:'继续评价',scale:'进入本人自评',personal:'发起个人测评',private:'打开本人表单'}[key]
  fireEvent.click(await screen.findByRole('button',{name:open}))
  await screen.findByRole('alert')
  expect(screen.getByText('已分配任务',{selector:'strong'})).toBeInTheDocument()
  if(key==='personal')fireEvent.click(screen.getByRole('radio',{name:'我的选择'}))
  else fireEvent.change(screen.getByRole('textbox',{name:'当前答案'}),{target:{value:'未提交的答案'}})
  const posts=api.mock.calls.filter(([,method])=>method==='POST').length
  fireEvent.click(screen.getByRole('button',{name:'重试读取任务列表'}))
  await waitFor(()=>expect(screen.queryByRole('alert')).not.toBeInTheDocument())
  if(key==='personal')expect(screen.getByRole('radio',{name:'我的选择'})).toBeChecked()
  else expect(screen.getByRole('textbox',{name:'当前答案'})).toHaveValue('未提交的答案')
  expect(api.mock.calls.filter(([,method])=>method==='POST')).toHaveLength(posts)
  expect(listReads).toBe(3)
 })
})
