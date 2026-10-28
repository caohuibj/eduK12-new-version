import {fireEvent,render,screen,within} from '@testing-library/react'
import {describe,expect,it,vi} from 'vitest'
import {SchoolStudentTasks} from '../../school/SchoolStudentTasks'
import {SchoolTeacherTasks} from '../../school/SchoolTeacherTasks'
import {SchoolParentTasks} from '../../school/SchoolParentTasks'
import {HuiteacherMyScaleTasks} from '../../huiteacher/HuiteacherMyScaleTasks'
import {HuiteacherMyPrivateFormTasks} from '../../huiteacher/HuiteacherMyPrivateFormTasks'
import {HuiteacherMyAssessmentTasks} from '../../huiteacher/HuiteacherMyAssessmentTasks'
import type {SchoolApi} from '../../school/SchoolRecovery'
import type {EducationReportApi} from '../education-tools/EducationScalePersonalReport'

const loaded=vi.hoisted(()=>({school:0,teacher:0}))
vi.mock('../../school/SchoolCompositeRunner',()=>{
 loaded.school++
 return {SchoolCompositeRunner:({execution}:{execution:{executionId:string}})=><p>校园运行器 {execution.executionId}</p>}
})
vi.mock('../FinalCompositeAssessment',()=>{
 loaded.teacher++
 return {default:({state}:{state:{id:string}})=><p>教师运行器 {state.id}</p>}
})
const executionId='00000000-0000-4000-8000-000000000042'
const observer={executionId:'observer',runId:'run',organizationId:'school',activityId:'activity',activityTitle:'观察活动',runTitle:'观察任务',studentReference:'合成观察编号',status:'ASSIGNED',deadline:null,consentRequired:false}

describe('task hosts defer runner code until an authorized task is entered',()=>{
 it('leaves all three School inboxes light and preserves execution bindings when entered',async()=>{
  const api=vi.fn(async(path:string)=>{
   if(path==='/my/student-reference')return {reference:'SYNTHETIC'}
   if(path.startsWith('/my/activity-tasks'))return {list:[{id:executionId,activityId:'activity',activityTitle:'校园活动',kind:'MEASUREMENT',resourceFamily:'SCALE',title:'学生测评',status:'PENDING',deadline:null,href:`/organizations/school/activities/activity/runs/run/executions/${executionId}`}],total:1,page:1,hasMore:false,truncated:false}
   return {list:[observer],truncated:false}
  })
  const student=render(<SchoolStudentTasks api={api as SchoolApi}/>),teacher=render(<SchoolTeacherTasks api={api as SchoolApi} organizationId="school"/>),parent=render(<SchoolParentTasks api={api as SchoolApi}/>)
  const studentOpen=await within(student.container).findByRole('button',{name:'开始／继续官方测评'})
  const teacherOpen=await within(teacher.container).findByRole('button',{name:'开始／继续教师观察测评'})
  const parentOpen=await within(parent.container).findByRole('button',{name:'查看任务（开始／继续校园正式测评）'})
  expect(loaded.school).toBe(0)
  expect(api.mock.calls.every(([path])=>path.startsWith('/my/'))).toBe(true)
  fireEvent.click(studentOpen);await within(student.container).findByText('校园运行器 '+executionId)
  fireEvent.click(teacherOpen);await within(teacher.container).findByText('校园运行器 observer')
  fireEvent.click(parentOpen);await within(parent.container).findByText('校园运行器 observer')
  expect(loaded.school).toBe(1)
 })
 it('loads the shared Teacher runner only for entered Scale, private Form and assessment units',async()=>{
  const api=vi.fn(async(path:string)=>{
   if(path==='/my-scale-tasks')return {list:[{executionId:'scale',eventId:'event',eventTitle:'合成活动',runId:'run',organizationId:'school',status:'STARTED',runtimeBindingRef:'scale-attempt',title:'Scale任务',runStatus:'PUBLISHED'}]}
   if(path==='/my-private-form-tasks')return {list:[{executionId:'form',runId:'run',organizationId:'school',eventId:'event',eventTitle:'合成活动',formTitle:'Form任务',status:'STARTED',runStatus:'PUBLISHED',eventStatus:'OPEN',runtimeBindingKind:'COMPOSITE',runtimeBindingRef:'form-attempt'}]}
   if(path==='/my-assessment-tasks')return {list:[{executionId:'assessment',title:'组合任务',eventTitle:'合成活动',status:'STARTED',runtimeBindingRef:'assessment-attempt',consentRequired:false}],nextCursor:null}
   if(path.startsWith('/private-form-composite-attempts/'))return {id:'form-attempt',status:'IN_PROGRESS',items:[{id:'field',type:'FORM'}],units:[{id:'section',type:'FORM_SECTION',formSectionId:'section'}],currentItem:{id:'section',type:'FORM_SECTION',formSectionId:'section'}}
   if(path.startsWith('/assessment-composite-attempts/'))return {id:'assessment-attempt',status:'IN_PROGRESS',deliveryMode:'FINAL_ONLY',currentItem:{id:'scale',type:'SCALE'}}
   if(path.startsWith('/composite-attempts/'))return {id:'scale-attempt',status:'IN_PROGRESS',currentItem:{id:'scale',type:'SCALE'}}
   throw Error('Unexpected synthetic path '+path)
  })
  const scale=render(<HuiteacherMyScaleTasks api={api as EducationReportApi}/>),form=render(<HuiteacherMyPrivateFormTasks api={api as EducationReportApi} actorKey="teacher"/>),assessment=render(<HuiteacherMyAssessmentTasks api={api as EducationReportApi} actorKey="teacher"/>)
  const scaleOpen=await within(scale.container).findByRole('button',{name:'进入本人自评'})
  const formOpen=await within(form.container).findByRole('button',{name:'打开本人表单'})
  const assessmentOpen=await within(assessment.container).findByRole('button',{name:'继续测评'})
  expect(loaded.teacher).toBe(0)
  expect(api.mock.calls.map(([path])=>path).sort()).toEqual(['/my-assessment-tasks','/my-private-form-tasks','/my-scale-tasks'])
  fireEvent.click(scaleOpen);await screen.findByText('教师运行器 scale-attempt')
  fireEvent.click(formOpen);await screen.findByText('教师运行器 form-attempt')
  fireEvent.click(assessmentOpen);await screen.findByText('教师运行器 assessment-attempt')
  expect(loaded.teacher).toBe(1)
  expect(api).toHaveBeenCalledWith('/composite-attempts/scale-attempt?view=current-unit')
  expect(api).toHaveBeenCalledWith('/private-form-composite-attempts/form-attempt?view=current-unit')
  expect(api).toHaveBeenCalledWith('/assessment-composite-attempts/assessment-attempt?view=current-unit')
 })
})
