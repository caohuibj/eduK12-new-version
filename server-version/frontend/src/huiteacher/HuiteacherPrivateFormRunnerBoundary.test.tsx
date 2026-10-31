import {act,cleanup,fireEvent,render,screen,waitFor,within} from '@testing-library/react'
import {afterEach,describe,expect,it,vi} from 'vitest'
import {HuiteacherMyPrivateFormTasks} from './HuiteacherMyPrivateFormTasks'
import type {PrivateToolApi} from '../components/education-tools/privateToolClient'
vi.mock('../components/FinalCompositeAssessment',()=>({default:({state}:{state:{id:string}})=><p>表单运行器 {state.id}</p>}))
const task={executionId:'execution',runId:'run',organizationId:'school',eventId:'event',eventTitle:'教师活动',formTitle:'本人表单',status:'ASSIGNED',runStatus:'PUBLISHED',eventStatus:'OPEN',runtimeBindingKind:null,runtimeBindingRef:null}
const state={id:'attempt',status:'IN_PROGRESS',items:[{id:'item',type:'FORM'}],units:[{id:'section',type:'FORM_SECTION',formSectionId:'section'}],currentItem:{id:'section',type:'FORM_SECTION',formSectionId:'section',definitionHash:'hash'}}
function deferred<T>(){let resolve!:(value:T)=>void;const promise=new Promise<T>(yes=>{resolve=yes});return {promise,resolve}}
afterEach(()=>{cleanup();vi.restoreAllMocks()})
describe('Teacher private form consumer fail-closed boundaries',()=>{
 it('opens the real server FORM field summaries with FORM_SECTION units without relabeling either',async()=>{
  const api=vi.fn(async(path:string)=>path==='/my-private-form-tasks'?{list:[task]}:path.endsWith('/start-private-form')?{state:'STARTED',runtimeBindingKind:'COMPOSITE',runtimeBindingRef:'attempt'}:state)
  render(<HuiteacherMyPrivateFormTasks api={api as PrivateToolApi} actorKey="author"/>)
  fireEvent.click(await screen.findByRole('button',{name:'打开本人表单'}))
  await screen.findByText('表单运行器 attempt')
  expect(api).toHaveBeenCalledWith('/private-form-composite-attempts/attempt?view=current-unit')
  expect(state.items[0].type).toBe('FORM');expect(state.units[0].type).toBe('FORM_SECTION')
 })

 it.each(['WITHHELD','IN_PROGRESS'])('does not mount or claim success for a %s start result',async outcome=>{
  const api=vi.fn(async(path:string)=>path==='/my-private-form-tasks'?{list:[task]}:{state:outcome,runtimeBindingKind:'COMPOSITE',runtimeBindingRef:'must-not-read'})
  render(<HuiteacherMyPrivateFormTasks api={api as PrivateToolApi} actorKey="author"/>)
  fireEvent.click(await screen.findByRole('button',{name:'打开本人表单'}))
  await screen.findByText(outcome==='WITHHELD'?'当前未获准打开此表单任务，请刷新任务列表核对。':'表单任务正在建立，请刷新任务后继续，不要重复开始。')
  expect(api).toHaveBeenCalledWith('/run-executions/execution/start-private-form','POST',{})
  expect(api.mock.calls.some(([path])=>path.includes('composite-attempts'))).toBe(false)
  expect(screen.queryByText(/表单运行器/)).not.toBeInTheDocument();expect(screen.queryByText('已完成正式提交')).not.toBeInTheDocument()
 })
 it.each([{id:'wrong-attempt'}, ...['SCALE','COGNITIVE','SITUATIONAL','FORM_SECTION'].map(type=>({items:[{id:'item',type}]})), {units:[{id:'section',type:'SCALE',formSectionId:'section'}]}, {units:undefined}, {units:[{id:'other',type:'FORM_SECTION',formSectionId:'other'}]}, {currentItem:{...state.currentItem,id:'other'}}, {currentItem:{...state.currentItem,type:'SCALE'}}])('rejects mismatched attempt id or non-form runtime payload %j',async mismatch=>{
  const api=vi.fn(async(path:string)=>path==='/my-private-form-tasks'?{list:[{...task,status:'STARTED',runtimeBindingKind:'COMPOSITE',runtimeBindingRef:'attempt'}]}:{...state,...mismatch})
  render(<HuiteacherMyPrivateFormTasks api={api as PrivateToolApi} actorKey="author"/>)
  fireEvent.click(await screen.findByRole('button',{name:'打开本人表单'}));await screen.findByText('表单运行记录与当前获授权任务不一致，请重新读取。')
  expect(screen.queryByText(/表单运行器/)).not.toBeInTheDocument()
  expect(api).toHaveBeenCalledWith('/private-form-composite-attempts/attempt?view=current-unit')
  expect(api.mock.calls.some(([path])=>path.includes('/start-private-form'))).toBe(false)
 })
 it('only resumes a bound started composite in CLOSED runs while event remains OPEN',async()=>{
  const rows=[{...task,executionId:'pending',formTitle:'未开始',runStatus:'CLOSED'},{...task,executionId:'closed-event',formTitle:'已关闭活动',eventStatus:'CLOSED',status:'STARTED',runtimeBindingKind:'COMPOSITE',runtimeBindingRef:'attempt'},{...task,executionId:'resumable',formTitle:'可续作',runStatus:'CLOSED',status:'STARTED',runtimeBindingKind:'COMPOSITE',runtimeBindingRef:'attempt'}]
  const api=vi.fn(async(path:string)=>path==='/my-private-form-tasks'?{list:rows}:state)
  render(<HuiteacherMyPrivateFormTasks api={api as PrivateToolApi} actorKey="author"/>)
  await screen.findByText('未开始')
  for(const title of ['未开始','已关闭活动'])expect(within(screen.getByText(title).closest('article')!).queryByRole('button')).not.toBeInTheDocument()
  fireEvent.click(screen.getByRole('button',{name:'继续已有表单'}));await screen.findByText('表单运行器 attempt')
  expect(api.mock.calls.every(([path])=>!path.includes('/start-private-form'))).toBe(true)
 })
 it('does not open CANCELLED or FAILED tasks, and treats a null current item as a pending completion read rather than a successful submission',async()=>{
  const rows=[...['CANCELLED','FAILED'].map(status=>({...task,executionId:status,formTitle:status,status})),{...task,status:'STARTED',runtimeBindingKind:'COMPOSITE',runtimeBindingRef:'attempt'}]
  const api=vi.fn(async(path:string)=>path==='/my-private-form-tasks'?{list:rows}:{...state,currentItem:null})
  render(<HuiteacherMyPrivateFormTasks api={api as PrivateToolApi} actorKey="author"/>)
  await screen.findByText('CANCELLED')
  for(const title of ['CANCELLED','FAILED'])expect(within(screen.getByText(title).closest('article')!).queryByRole('button')).not.toBeInTheDocument()
  fireEvent.click(screen.getByRole('button',{name:'打开本人表单'}))
  await screen.findByText('正在确认完成状态，请刷新。')
  expect(screen.getByRole('button',{name:'重新读取当前表单'})).toBeInTheDocument()
  expect(screen.queryByText(/表单运行器/)).not.toBeInTheDocument()
  expect(screen.queryByText('已完成正式提交')).not.toBeInTheDocument()
  expect(api.mock.calls.every(([path])=>!path.includes('/submit')&&!path.includes('/start-private-form'))).toBe(true)
 })
 it.each(['actor','api'])('ignores a late opened attempt after %s scope changes',async scope=>{
  const late=deferred<typeof state>()
  const api=vi.fn(async(path:string)=>path==='/my-private-form-tasks'?{list:[{...task,status:'STARTED',runtimeBindingKind:'COMPOSITE',runtimeBindingRef:'attempt'}]}:late.promise)
  const newer=vi.fn(async()=>({list:[]}))
  const {rerender}=render(<HuiteacherMyPrivateFormTasks api={api as PrivateToolApi} actorKey="old-author"/>)
  fireEvent.click(await screen.findByRole('button',{name:'打开本人表单'}))
  await waitFor(()=>expect(api).toHaveBeenCalledWith('/private-form-composite-attempts/attempt?view=current-unit'))
  rerender(<HuiteacherMyPrivateFormTasks api={(scope==='api'?newer:api) as PrivateToolApi} actorKey={scope==='actor'?'new-author':'old-author'}/>)
  await act(async()=>late.resolve(state))
  expect(screen.queryByText('表单运行器 attempt')).not.toBeInTheDocument()
  expect(screen.queryByText('正在完成：本人表单')).not.toBeInTheDocument()
 })
})
