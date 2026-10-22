import {act,cleanup,fireEvent,render,screen,waitFor} from '@testing-library/react'
import {afterEach,describe,expect,it,vi} from 'vitest'
import {SchoolStudentTasks} from '../../school/SchoolStudentTasks'
import {HuiteacherMyScaleTasks} from '../../huiteacher/HuiteacherMyScaleTasks'
import type {EducationReportApi} from './EducationScalePersonalReport'
const report={schemaVersion:1,kind:'EDUCATION_SCALE_PERSONAL_REPORT',state:'READY',mode:'INDIVIDUAL_SUMMARY',unitReports:[{itemId:'u',type:'SCALE',kind:'scale',scaleName:'个人量表',scaleCode:'private',caveats:[],disclaimer:'描述性',completedAt:null,totalTime:0,rawScoreFeedback:[{scoreKey:'total',rangeKey:'range',text:'上一轮获准的私有反馈'}]}]}
function deferred<T>(){let resolve!:(value:T)=>void;const promise=new Promise<T>(yes=>{resolve=yes});return {promise,resolve}}
afterEach(cleanup)
describe.each(['SCHOOL','TEACHER'] as const)('%s real task report consumer',entry=>{
 it('clears the previous report before denied rereads and ignores a late reply after API scope changes',async()=>{
  const late=deferred<typeof report>()
  let reads=0
  const list=(path:string)=>{
   if(path==='/my-scale-tasks')return {list:[{executionId:'exec',eventId:'event',eventTitle:'活动',runId:'run',organizationId:'school',status:'COMPLETED',runtimeBindingRef:'attempt',resourceKey:'scale',title:'本人测评',runStatus:'CLOSED'}]}
   if(path.startsWith('/my/activity-tasks'))return {list:[{id:'exec',activityId:'activity',activityTitle:'活动',kind:'MEASUREMENT',title:'本人测评',status:'COMPLETED',href:null,deadline:null}],total:1,page:1,hasMore:false,truncated:false}
   if(path==='/my/student-reference')return {reference:'student'}
   return undefined
  }
  const api=vi.fn(async(path:string)=>{
   const response=list(path);if(response)return response
   if(path==='/reports/student/executions/exec'||path==='/run-executions/exec/personal-summary'){
    reads+=1;if(reads===1)return report;if(reads===2)throw Error('报告权限已撤销');return late.promise
   }
   throw Error(`Unexpected path ${path}`)
  })
  const component=(transport:EducationReportApi)=>entry==='SCHOOL'?<SchoolStudentTasks api={transport}/>:<HuiteacherMyScaleTasks api={transport}/>
  const {rerender}=render(component(api as EducationReportApi))
  const label=entry==='SCHOOL'?'查看我的测评反馈':'查看本人反馈'
  fireEvent.click(await screen.findByRole('button',{name:label}))
  await screen.findByText('上一轮获准的私有反馈')
  fireEvent.click(screen.getByRole('button',{name:label}))
  expect(screen.queryByText('上一轮获准的私有反馈')).not.toBeInTheDocument()
  await screen.findByText('报告权限已撤销')
  expect(screen.queryByText('上一轮获准的私有反馈')).not.toBeInTheDocument()
  fireEvent.click(screen.getByRole('button',{name:label}))
  await waitFor(()=>expect(reads).toBe(3))
  const replacement=vi.fn(async(path:string)=>list(path)??{state:'WITHHELD'})
  rerender(component(replacement as EducationReportApi))
  await waitFor(()=>expect(replacement).toHaveBeenCalled())
  await act(async()=>late.resolve(report))
  expect(screen.queryByText('上一轮获准的私有反馈')).not.toBeInTheDocument()
  expect(screen.queryByText('个人量表')).not.toBeInTheDocument()
  expect(api.mock.calls.some(([path])=>path.startsWith('/composite-attempts/'))).toBe(false)
 })
})
it('School clears authorized feedback even when refreshing tasks fails',async()=>{
 let loads=0
 const api=vi.fn(async(path:string)=>{
  if(path.startsWith('/my/activity-tasks')){
   loads+=1;if(loads>1)throw Error('待办刷新失败')
   return {list:[{id:'exec',activityId:'a',activityTitle:'活动',kind:'MEASUREMENT',title:'本人测评',status:'COMPLETED',href:null,deadline:null}],total:1,page:1,hasMore:false,truncated:false}
  }
  if(path==='/my/student-reference')return {reference:'student'}
  if(path==='/reports/student/executions/exec')return report
  throw Error(`Unexpected ${path}`)
 })
 render(<SchoolStudentTasks api={api as EducationReportApi}/>)
 fireEvent.click(await screen.findByRole('button',{name:'查看我的测评反馈'}))
 await screen.findByText('上一轮获准的私有反馈')
 fireEvent.click(screen.getByRole('button',{name:'刷新待办'}))
 expect(screen.queryByText('上一轮获准的私有反馈')).not.toBeInTheDocument()
 await screen.findByText('待办刷新失败')
 expect(screen.queryByText('上一轮获准的私有反馈')).not.toBeInTheDocument()
})
it('Teacher retains the separately authorized legacy READY summary when kind is absent',async()=>{
 const api=vi.fn(async(path:string)=>path==='/my-scale-tasks'?{list:[{executionId:'exec',eventId:'event',eventTitle:'活动',runId:'run',organizationId:'school',status:'COMPLETED',runtimeBindingRef:'attempt',resourceKey:'scale',title:'本人测评',runStatus:'CLOSED'}]}:{state:'READY',explanation:'原有本人反馈仍可读',metrics:[],limitations:[],disclaimer:'原有说明'})
 render(<HuiteacherMyScaleTasks api={api as EducationReportApi}/>)
 fireEvent.click(await screen.findByRole('button',{name:'查看本人反馈'}))
 await screen.findByText('原有本人反馈仍可读')
 expect(screen.getByText('原有说明')).toBeInTheDocument()
 expect(screen.queryByText('当前报告尚未获准显示，不提供个人分数、解释或图片。')).not.toBeInTheDocument()
 fireEvent.click(screen.getByRole('button',{name:'关闭本人反馈'}))
 expect(screen.queryByText('原有本人反馈仍可读')).not.toBeInTheDocument()
})
