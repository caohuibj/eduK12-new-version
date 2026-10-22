import {act,cleanup,fireEvent,render,screen,waitFor} from '@testing-library/react'
import {afterEach,describe,expect,it,vi} from 'vitest'
import {HuiteacherMyPrivateFormTasks} from './HuiteacherMyPrivateFormTasks'
import type {PrivateToolApi} from '../components/education-tools/privateToolClient'
vi.mock('../components/FinalCompositeAssessment',()=>({default:()=>null}))
const task=(id:number)=>({executionId:'execution-'+id,runId:'run',organizationId:'org',eventId:'event',eventTitle:'活动',formTitle:'表单任务 '+id,
 status:id===101?'ASSIGNED':'COMPLETED',runStatus:'PUBLISHED',eventStatus:'OPEN',runtimeBindingKind:null,runtimeBindingRef:null})
function deferred<T>(){let resolve!:(value:T)=>void;const promise=new Promise<T>(yes=>{resolve=yes});return {promise,resolve}}
afterEach(cleanup)
describe('Teacher private Form task cursor consumer',()=>{
 it('reaches the old uncompleted task after 102 tasks, deduplicates page overlap and retries the same failed page',async()=>{
  let secondCalls=0
  const api=vi.fn(async(path:string)=>{
   if(path==='/my-private-form-tasks')return {list:Array.from({length:50},(_,i)=>task(i)),nextCursor:'next-one'}
   if(path==='/my-private-form-tasks?cursor=next-one'){
    if(++secondCalls===1)throw Error('加载暂时失败，请重试')
    return {list:[task(49),...Array.from({length:50},(_,i)=>task(50+i))],nextCursor:'next-two'}
   }
   if(path==='/my-private-form-tasks?cursor=next-two')return {list:[task(100),task(101)],nextCursor:null}
   throw Error('Unexpected path '+path)
  })
  render(<HuiteacherMyPrivateFormTasks api={api as PrivateToolApi} actorKey="teacher-one"/>)
  fireEvent.click(await screen.findByRole('button',{name:'加载更多表单任务'}))
  await screen.findByText('加载暂时失败，请重试')
  expect(screen.getByText('表单任务 0')).toBeInTheDocument()
  await waitFor(()=>expect(screen.getByRole('button',{name:'加载更多表单任务'})).toBeEnabled())
  fireEvent.click(screen.getByRole('button',{name:'加载更多表单任务'}))
  await screen.findByText('表单任务 99')
  expect(screen.getAllByText('表单任务 49')).toHaveLength(1)
  await waitFor(()=>expect(screen.getByRole('button',{name:'加载更多表单任务'})).toBeEnabled())
  fireEvent.click(screen.getByRole('button',{name:'加载更多表单任务'}))
  await screen.findByText('表单任务 101')
  expect(screen.getByRole('button',{name:'打开本人表单'})).toBeInTheDocument()
  expect(screen.queryByRole('button',{name:'加载更多表单任务'})).not.toBeInTheDocument()
  expect(screen.getAllByText(/^表单任务 \d+$/)).toHaveLength(102)
  expect(api.mock.calls.filter(([path])=>path==='/my-private-form-tasks?cursor=next-one')).toHaveLength(2)
 })
 it.each(['actor','api'])('does not append a late old %s page into a new task scope',async scope=>{
  const late=deferred<{list:ReturnType<typeof task>[];nextCursor:null}>();let firstReads=0
  const api=vi.fn(async(path:string)=>path.includes('?cursor=')?late.promise:++firstReads===1?{list:[task(0)],nextCursor:'old-cursor'}:{list:[],nextCursor:null})
  const newer=vi.fn(async()=>({list:[],nextCursor:null}))
  const {rerender}=render(<HuiteacherMyPrivateFormTasks api={api as PrivateToolApi} actorKey="teacher-one"/>)
  fireEvent.click(await screen.findByRole('button',{name:'加载更多表单任务'}))
  await waitFor(()=>expect(api).toHaveBeenCalledWith('/my-private-form-tasks?cursor=old-cursor'))
  rerender(<HuiteacherMyPrivateFormTasks api={(scope==='api'?newer:api) as PrivateToolApi} actorKey={scope==='actor'?'teacher-two':'teacher-one'}/>)
  await screen.findByText('暂无分配给本人的自编表单任务。')
  await act(async()=>late.resolve({list:[task(101)],nextCursor:null}))
  expect(screen.queryByText('表单任务 101')).not.toBeInTheDocument()
  expect(screen.queryByText('表单任务 0')).not.toBeInTheDocument()
 })
})
