import {cleanup,render,screen} from '@testing-library/react'
import {afterEach,describe,expect,it,vi} from 'vitest'
import {HuiteacherMyFormTasks} from './HuiteacherMyFormTasks'
import {HuiteacherMyPrivateFormTasks} from './HuiteacherMyPrivateFormTasks'
import {HuiteacherMyScaleTasks} from './HuiteacherMyScaleTasks'
import {HuiteacherPersonalSelf} from './HuiteacherPersonalSelf'
type Api=Parameters<typeof HuiteacherMyFormTasks>[0]['api']
afterEach(()=>{cleanup();sessionStorage.clear()})
const task={executionId:'execution',runId:'run',organizationId:'school',eventId:'event',eventTitle:'学校任务',formId:'form',formTitle:'已完成表单',title:'已完成量表',status:'COMPLETED',runStatus:'PUBLISHED',eventStatus:'OPEN',runtimeBindingKind:'COMPOSITE',runtimeBindingRef:'attempt'}
describe('Teacher completed-entry submission guards',()=>{
 it.each([false,true])('keeps completed assigned form read-only for student=%s without another start',async student=>{
  const api=vi.fn(async()=>({list:[task]}));render(<HuiteacherMyFormTasks student={student} unified={!student} api={api as Api}/>)
  await screen.findByText('已完成表单')
  expect(screen.queryByRole('button',{name:/开始|继续|正式提交/})).not.toBeInTheDocument()
  expect(api.mock.calls).toEqual([[student?'/my-student-evaluations':'/my-form-tasks']])
 })
 it('does not reopen a completed private form task',async()=>{
  const api=vi.fn(async()=>({list:[task],nextCursor:null}));render(<HuiteacherMyPrivateFormTasks api={api as Api} actorKey="teacher-or-admin"/>)
  expect(await screen.findByText('已完成正式提交')).toBeInTheDocument()
  expect(screen.queryByRole('button',{name:/打开本人表单|继续已有表单|正式提交/})).not.toBeInTheDocument()
  expect(api.mock.calls).toEqual([['/my-private-form-tasks']])
 })
 it('offers feedback for a completed scale without showing another answer action',async()=>{
  const api=vi.fn(async()=>({list:[task]}));render(<HuiteacherMyScaleTasks api={api as Api}/>)
  expect(await screen.findByRole('button',{name:'查看本人反馈'})).toBeEnabled()
  expect(screen.queryByRole('button',{name:/开始|继续|正式提交/})).not.toBeInTheDocument()
  expect(api.mock.calls).toEqual([['/my-scale-tasks']])
 })
 it('keeps the completed personal record read-only while retaining an explicit new-round tool entry',async()=>{
  const api=vi.fn(async(path:string)=>path.endsWith('/catalog')?{list:[{resourceId:'resource',title:'授权个人工具',version:'1',scientificMaturity:'PILOT'}]}:{list:[{assessmentId:'completed',resourceId:'resource',title:'本人完成记录',status:'COMPLETED',startedAt:'2026-10-26',completedAt:'2026-10-26'}]})
  render(<HuiteacherPersonalSelf api={api as Api}/>)
  expect(await screen.findByRole('button',{name:'查看本人反馈'})).toBeEnabled()
  expect(screen.queryByRole('button',{name:'继续作答'})).not.toBeInTheDocument()
  expect(screen.getByRole('button',{name:'发起个人测评'})).toBeEnabled()
  expect(api.mock.calls.map(([path])=>path).sort()).toEqual(['/personal-scale/assessments','/personal-scale/catalog'])
 })
})
