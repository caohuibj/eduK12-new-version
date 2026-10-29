import {act,fireEvent,render,screen,waitFor,within} from '@testing-library/react'
import {describe,expect,it,vi} from 'vitest'
import {SchoolParentTasks} from './SchoolParentTasks'
import {SchoolTeacherTasks} from './SchoolTeacherTasks'
import type {SchoolApi} from './SchoolRecovery'
const runner=vi.hoisted(()=>vi.fn())
vi.mock('./SchoolCompositeRunner',()=>({SchoolCompositeRunner:(props:any)=>{runner(props);return <section aria-label="模拟正式作答"><button onClick={props.onFinished}>模拟正式完成确认</button></section>}}))
const task={executionId:'execution',runId:'run',organizationId:'org',activityId:'activity',activityTitle:'学校观察',runTitle:'普通观察问卷',studentReference:'林-000000000001',status:'ASSIGNED',deadline:null,feedbackMode:'COMPOSITION',consentRequired:true,consentPurpose:'观察同意',consentVisibility:'PRIVATE_RESPONDENT'}
const projection={schemaVersion:1,kind:'EDUCATION_FEEDBACK',mode:'COMPOSITION',state:'COMPLETION_ONLY',units:[
 {blockId:'scale',kind:'SCALE',title:'观察量表',state:'WITHHELD'},
 {blockId:'form',kind:'FORM',title:'观察表单',state:'COMPLETION_ONLY'},
]}
const inbox=(role:string)=>role==='parent'?'/my/parent-run-tasks':'/my/teacher-run-tasks?organizationId=org'
function Page({role,api,organizationId='org'}:{role:string;api:SchoolApi;organizationId?:string}){
 return role==='parent'?<SchoolParentTasks api={api}/>:<SchoolTeacherTasks api={api} organizationId={organizationId}/>
}
const start=(role:string)=>screen.getByRole('button',{name:role==='parent'?'查看任务（开始／继续校园正式测评）':'开始／继续教师观察测评'})
describe('School observer ordinary completion uses the authorized feedback projection',()=>{
 it.each(['parent','teacher'])('%s preserves the completed reference even when the refreshed inbox no longer contains the task',async role=>{
  runner.mockClear();let reads=0
  const api=vi.fn(async(path:string,method='GET')=>{
   expect(method).toBe('GET')
   if(path===inbox(role))return {list:++reads===1?[task]:[],truncated:false}
   if(path==='/run-executions/execution/feedback')return projection
   throw Error('Unexpected '+path)
  })
  render(<Page role={role} api={api as SchoolApi}/>);await screen.findByRole('heading',{name:task.runTitle})
  fireEvent.click(start(role));fireEvent.click(await screen.findByRole('button',{name:'模拟正式完成确认'}))
  const feedback=await screen.findByRole('region',{name:'获准的个人测评反馈'})
  await within(feedback).findByText('本工具未开放个人反馈。');expect(within(feedback).getByText('表单已完成，不计算量表分数。')).toBeInTheDocument()
  expect(runner).toHaveBeenCalledWith(expect.objectContaining({observer:true,observerRole:role,execution:expect.objectContaining({executionId:'execution',consentRequired:true})}))
  expect(api).toHaveBeenCalledWith('/run-executions/execution/feedback')
  await waitFor(()=>expect(reads).toBe(2))
  expect(feedback).toHaveTextContent(task.runTitle);expect(feedback.textContent).not.toMatch(/总分|诊断|subjectUserId|PRIVATE_LOGIN_NAME/)
  expect(api.mock.calls.some(([path])=>path.includes('/assessment-reports')||path.includes('/training')||path.includes('/start'))).toBe(false)
 })
 it.each(['parent','teacher'])('%s can reopen completion feedback and retry a denied read without starting or submitting again',async role=>{
  let feedbackReads=0
  const api=vi.fn(async(path:string,method='GET')=>{
   expect(method).toBe('GET')
   if(path===inbox(role))return {list:[{...task,status:'COMPLETED'}],truncated:false}
   if(path==='/run-executions/execution/feedback'){
    if(++feedbackReads===1)throw Object.assign(Error('当前反馈无权读取'),{status:403})
    return projection
   }
   throw Error('Unexpected '+path)
  })
  render(<Page role={role} api={api as SchoolApi}/>);fireEvent.click(await screen.findByRole('button',{name:'查看完成反馈'}))
  const error=await screen.findByRole('alert')
  expect(error).toHaveTextContent('反馈暂时无法读取。作答已完成，请稍后重新读取。')
  expect(error).not.toHaveTextContent('当前反馈无权读取')
  expect(screen.queryByRole('button',{name:'开始／继续教师观察测评'})).not.toBeInTheDocument()
  fireEvent.click(screen.getByRole('button',{name:'重试读取反馈'}));await screen.findByText('本工具未开放个人反馈。')
  expect(feedbackReads).toBe(2);expect(api.mock.calls.every(([,method])=>method===undefined||method==='GET')).toBe(true)
 })
 it.each(['parent','teacher'])('%s discards late feedback and runner callbacks after the account transport changes',async role=>{
  let finish!:(value:unknown)=>void
  const pending=new Promise(resolve=>{finish=resolve})
  const oldApi=vi.fn(async(path:string)=>path===inbox(role)?{list:[task],truncated:false}:path==='/run-executions/execution/feedback'?pending:Promise.reject(Error(path)))
  const newApi=vi.fn(async()=>({list:[],truncated:false}))
  const view=render(<Page role={role} api={oldApi as SchoolApi}/>);await screen.findByRole('heading',{name:task.runTitle})
  fireEvent.click(start(role));await screen.findByRole('region',{name:'模拟正式作答'})
  const previous=runner.mock.calls[runner.mock.calls.length-1][0]
  fireEvent.click(screen.getByRole('button',{name:'模拟正式完成确认'}));await waitFor(()=>expect(oldApi).toHaveBeenCalledWith('/run-executions/execution/feedback'))
  view.rerender(<Page role={role} api={newApi as SchoolApi}/>);await waitFor(()=>expect(newApi).toHaveBeenCalledOnce())
  await act(async()=>{previous.onFinished();finish({...projection,title:'旧账号反馈'});await pending})
  expect(screen.queryByRole('region',{name:'获准的个人测评反馈'})).not.toBeInTheDocument()
  expect(screen.queryByText('观察量表')).not.toBeInTheDocument();expect(newApi).toHaveBeenCalledOnce()
 })
 it('clears the teacher task and feedback when the same transport switches schools',async()=>{
  const api=vi.fn(async(path:string)=>path===inbox('teacher')?{list:[{...task,status:'COMPLETED'}],truncated:false}:path==='/run-executions/execution/feedback'?projection:{list:[],truncated:false})
  const view=render(<Page role="teacher" api={api as SchoolApi}/>);fireEvent.click(await screen.findByRole('button',{name:'查看完成反馈'}));await screen.findByText('观察量表')
  view.rerender(<Page role="teacher" api={api as SchoolApi} organizationId="other"/>)
  await waitFor(()=>expect(api).toHaveBeenCalledWith('/my/teacher-run-tasks?organizationId=other'))
  expect(screen.queryByRole('region',{name:'获准的个人测评反馈'})).not.toBeInTheDocument();expect(screen.queryByRole('button',{name:'查看完成反馈'})).not.toBeInTheDocument()
 })
})
