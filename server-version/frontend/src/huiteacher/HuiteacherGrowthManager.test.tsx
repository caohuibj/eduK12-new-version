import {act,cleanup,fireEvent,render,screen,waitFor} from '@testing-library/react'
import {afterEach,describe,expect,it,vi} from 'vitest'
import {HuiteacherGrowthManager} from './HuiteacherGrowthManager'
import type {ImprovementApi} from './HuiteacherImprovementPanel'
vi.mock('./HuiteacherImprovementPanel',()=>({HuiteacherImprovementPanel:({targetId,sourceEventId}:{targetId:string;sourceEventId?:string|null})=><div data-testid="action-scope">{targetId}:{sourceEventId||'none'}</div>}))
const targets=[{id:'first',name:'第一位教师',kind:'PERSON',status:'ACTIVE'},{id:'second',name:'第二位教师',kind:'PERSON',status:'ACTIVE'}]
function timeline(targetId:string,title:string,cursor:string|null=null){return {target:{id:targetId,name:targetId,kind:'PERSON'},list:[{eventId:targetId+'-event',title,kind:'ASSESSMENT',status:'CLOSED',createdAt:'2026-11-23T00:00:00Z',closedAt:'2026-11-23T01:00:00Z',sourceKind:'ASSESSMENT_RUN',instrumentVersions:[{family:'SCALE',key:'private-scale',version:'v1-fixed'}],comparisonEvidence:{reason:'NO_CLOSED_BASELINE',sourceMatch:false}}],nextCursor:cursor,note:'来源元数据，不生成数值趋势。'}}
function deferred<T>(){let resolve!:(value:T)=>void,reject!:(error:Error)=>void;const promise=new Promise<T>((ok,fail)=>{resolve=ok;reject=fail});return {promise,resolve,reject}}
const select=(id:string)=>fireEvent.change(screen.getByLabelText('改进对象'),{target:{value:id}})
const load=()=>fireEvent.click(screen.getByRole('button',{name:'查看正式活动时间线'}))
afterEach(()=>{cleanup();vi.unstubAllEnvs();vi.restoreAllMocks()})
describe('Teacher shared growth timeline context',()=>{
 it('uses readable types/status and keeps technical source/version in accessible details',async()=>{
  vi.stubEnv('VITE_HUITEACHER_IMPROVEMENT_ENABLED','true')
  const api=vi.fn(async()=>timeline('first','正式课堂评价'))
  render(<HuiteacherGrowthManager organizationId="school" targets={targets} api={api as ImprovementApi}/>);select('first');load()
  expect(await screen.findByText('正式课堂评价')).toBeVisible()
  expect(screen.getByRole('option',{name:'教师或学校人员 · 第一位教师'})).toBeInTheDocument()
  expect(screen.getByText('已关闭')).toBeVisible();expect(screen.getByText(/专业评价/)).toBeVisible()
  expect(screen.getByText('v1-fixed')).not.toBeVisible();expect(screen.getByText('ASSESSMENT_RUN')).not.toBeVisible()
  fireEvent.click(screen.getByText('来源与工具版本详情'));expect(screen.getByText('v1-fixed')).toBeVisible();expect(screen.getByText('ASSESSMENT_RUN')).toBeVisible()
  fireEvent.click(screen.getByRole('button',{name:'以本次评价建立改进行动'}));expect(screen.getByTestId('action-scope')).toHaveTextContent('first:first-event')
  expect(screen.getByRole('status')).toHaveTextContent('行动依据：正式课堂评价')
  fireEvent.click(screen.getByRole('button',{name:'清除评价依据'}));expect(screen.getByTestId('action-scope')).toHaveTextContent('first:none')
 })
 it('rejects a late old-target response without unlocking a newer pending read',async()=>{
  const old=deferred<ReturnType<typeof timeline>>(),fresh=deferred<ReturnType<typeof timeline>>()
  const api=vi.fn((path:string)=>path.includes('/first/')?old.promise:fresh.promise)
  render(<HuiteacherGrowthManager organizationId="school" targets={targets} api={api as ImprovementApi}/>);select('first');load();select('second');load()
  await act(async()=>{old.resolve(timeline('first','过期对象活动'));await old.promise})
  expect(screen.queryByText('过期对象活动')).not.toBeInTheDocument();expect(screen.getByRole('button',{name:'查看正式活动时间线'})).toBeDisabled()
  await act(async()=>{fresh.resolve(timeline('second','当前对象活动'));await fresh.promise})
  expect(await screen.findByText('当前对象活动')).toBeVisible();expect(screen.getByRole('button',{name:'查看正式活动时间线'})).toBeEnabled()
 })
 it('clears the chosen action source and ignores late history when target changes',async()=>{
  vi.stubEnv('VITE_HUITEACHER_IMPROVEMENT_ENABLED','true')
  const older=deferred<ReturnType<typeof timeline>>()
  const api=vi.fn((path:string)=>path.includes('?cursor=')?older.promise:Promise.resolve(timeline(path.includes('/first/')?'first':'second','正式活动','history')))
  render(<HuiteacherGrowthManager organizationId="school" targets={targets} api={api as ImprovementApi}/>);select('first');load()
  fireEvent.click(await screen.findByRole('button',{name:'以本次评价建立改进行动'}));expect(screen.getByTestId('action-scope')).toHaveTextContent('first:first-event')
  fireEvent.click(screen.getByRole('button',{name:'更早的评价事件'}));select('second')
  expect(screen.getByTestId('action-scope')).toHaveTextContent('second:none');expect(screen.queryByRole('button',{name:'清除评价依据'})).not.toBeInTheDocument()
  await act(async()=>{older.resolve(timeline('first','旧对象较早活动'));await older.promise})
  expect(screen.queryByText('旧对象较早活动')).not.toBeInTheDocument();expect(screen.getByRole('button',{name:'查看正式活动时间线'})).toBeEnabled()
 })
 it('does not surface old organization/API errors over a successful current context',async()=>{
  const old=deferred<ReturnType<typeof timeline>>()
  const api=vi.fn(()=>old.promise),nextApi=vi.fn(async()=>timeline('first','新学校活动'))
  const view=render(<HuiteacherGrowthManager organizationId="old-school" targets={targets} api={api as ImprovementApi}/>);select('first');load()
  view.rerender(<HuiteacherGrowthManager organizationId="new-school" targets={targets} api={nextApi as ImprovementApi}/>);load()
  expect(await screen.findByText('新学校活动')).toBeVisible()
  await act(async()=>{old.reject(new Error('旧学校读取失败'));try{await old.promise}catch{/* original rejection is expected */}})
  await waitFor(()=>expect(screen.queryByText('旧学校读取失败')).not.toBeInTheDocument())
  expect(screen.getByText('新学校活动')).toBeVisible();expect(nextApi).toHaveBeenCalledWith('/organizations/new-school/evaluation-targets/first/timeline')
 })
})
