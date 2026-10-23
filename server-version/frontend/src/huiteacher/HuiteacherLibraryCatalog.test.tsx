import {act,cleanup,fireEvent,render,screen,waitFor,within} from '@testing-library/react'
import {afterEach,describe,expect,it,vi} from 'vitest'
import {HuiteacherEvaluationStudio} from './HuiteacherEvaluationStudio'
type Api=<T>(path:string,method?:string,data?:unknown)=>Promise<T>
const event={id:'event',targetId:'target',title:'评价甲',kind:'ASSESSMENT',status:'DRAFT',version:1}
const scale={id:'scale',key:'library-scale:scale:TEACHER:SELF',version:'v1',title:'量表甲',hash:'hash',visibilityPolicyKey:'EDUCATION_LIBRARY_APPROVED_CONTENT_V1'}
const endpoint='/organizations/org/evaluation-events/event/run/released-scales'
function deferred<T>(){let resolve!:(value:T)=>void;const promise=new Promise<T>(yes=>{resolve=yes});return {promise,resolve}}
function common(path:string,events=[event]){
 if(path.endsWith('/evaluation-targets'))return {list:[]}
 if(path.endsWith('/evaluation-events'))return {list:events}
 if(path.endsWith('/forms'))return {list:[]}
 if(path.endsWith('/run'))return {eventId:'event',runId:'run',status:'DRAFT',version:1,trackCount:0}
 return undefined
}
async function open(){fireEvent.click(await screen.findByRole('button',{name:'查看任务配置'}));fireEvent.click(await screen.findByRole('button',{name:'查询本校授权的教师自评 Scale'}))}
afterEach(cleanup)
describe('Teacher common-library catalogue consumer',()=>{
 it('continues empty pages and preserves selection on failed pagination, then retries without duplicates',async()=>{
  let tries=0
  const api=vi.fn(async(path:string)=>{
   if(path===endpoint)return {list:[],nextCursor:'empty/a'}
   if(path===endpoint+'?cursor=empty%2Fa')return {list:[scale],nextCursor:'next/a'}
   if(path===endpoint+'?cursor=next%2Fa'){if(++tries===1)throw Error('目录第二页失败');return {list:[scale,{...scale,id:'second',title:'量表乙'}],nextCursor:null}}
   return common(path)
  })
  render(<HuiteacherEvaluationStudio organizationId="org" api={api as Api}/>);await open()
  await screen.findByText('当前页暂无可选量表，仍可继续加载。')
  expect(screen.queryByText('当前目录没有可选的教师自评量表。')).not.toBeInTheDocument()
  fireEvent.click(screen.getByRole('button',{name:'继续加载授权量表'}))
  const select=await screen.findByLabelText('正式教师自评量表 · 固定版本')
  fireEvent.change(select,{target:{value:'scale'}})
  fireEvent.click(screen.getByRole('button',{name:'继续加载授权量表'}))
  await screen.findByText(/目录第二页失败/)
  expect(select).toHaveValue('scale')
  expect(screen.getByRole('button',{name:'重新查询授权量表'})).toBeEnabled()
  fireEvent.click(screen.getByRole('button',{name:'继续加载授权量表'}))
  await screen.findByRole('option',{name:/量表乙/})
  expect(screen.getAllByRole('option',{name:/量表甲/})).toHaveLength(1)
  expect(select).toHaveValue('scale')
  expect(screen.queryByRole('button',{name:'继续加载授权量表'})).not.toBeInTheDocument()
 })
 it.each([undefined,'HUITEACHER_ADULT_SELF_PILOT_V1'])('rejects library policy %s without attaching a track',async visibilityPolicyKey=>{
  const api=vi.fn(async(path:string)=>path===endpoint?{list:[{...scale,visibilityPolicyKey}],nextCursor:null}:common(path))
  render(<HuiteacherEvaluationStudio organizationId="org" api={api as Api}/>);await open()
  fireEvent.change(await screen.findByLabelText('正式教师自评量表 · 固定版本'),{target:{value:'scale'}})
  fireEvent.click(screen.getByRole('button',{name:'加入教师自评量表'}))
  await screen.findByText('量表报告策略缺失或不受支持，请重新读取授权目录。')
  expect(api.mock.calls.some(([path])=>path.endsWith('/tracks'))).toBe(false)
 })
 it.each(['library','legacy'])('saves the exact %s policy without converting report availability into permission',async kind=>{
  const item=kind==='library'?{...scale,personalReportAvailable:true}:{...scale,key:'teacher-scale:legacy:INDIVIDUAL',visibilityPolicyKey:undefined}
  const api=vi.fn(async(path:string,method='GET')=>{
   if(path===endpoint)return {list:[item],nextCursor:null}
   if(path.endsWith('/tracks')&&method==='POST')return {}
   return common(path)
  })
  render(<HuiteacherEvaluationStudio organizationId="org" api={api as Api}/>);await open()
  fireEvent.change(await screen.findByLabelText('正式教师自评量表 · 固定版本'),{target:{value:'scale'}})
  expect(screen.getByText(kind==='library'?'本版本配置包含本人反馈能力，实际展示仍须满足报告授权与可用条件。':'本版本未声明可展示本人反馈，不会因配置任务自动开放报告。')).toBeInTheDocument()
  fireEvent.click(screen.getByRole('button',{name:'加入教师自评量表'}))
  await waitFor(()=>expect(api).toHaveBeenCalledWith('/organizations/org/evaluation-events/event/run/tracks','POST',expect.objectContaining({resource:{family:'SCALE',key:item.key,version:'v1'},requestedPolicy:expect.objectContaining({visibilityPolicyKey:kind==='library'?'EDUCATION_LIBRARY_APPROVED_CONTENT_V1':'HUITEACHER_ADULT_SELF_PILOT_V1'})})))
  expect(api.mock.calls.some(([path])=>path.includes('/report')||path.includes('/personal-summary'))).toBe(false)
 })
 it('isolates event lists and discards a pending old organization/API response',async()=>{
  const late=deferred<{list:typeof scale[];nextCursor:string}>()
  const second={...event,id:'second',title:'评价乙'}
  const api=vi.fn(async(path:string)=>{
   if(path===endpoint)return late.promise
   if(path.endsWith('/second/run/released-scales'))return {list:[{...scale,id:'second-scale',title:'乙专属量表'}],nextCursor:null}
   return common(path,[event,second])
  })
  const {rerender}=render(<HuiteacherEvaluationStudio organizationId="org" api={api as Api}/>)
  const first=within((await screen.findByText('评价甲')).closest('article')!)
  const next=within(screen.getByText('评价乙').closest('article')!)
  fireEvent.click(first.getByRole('button',{name:'查看任务配置'}))
  fireEvent.click(await first.findByRole('button',{name:'查询本校授权的教师自评 Scale'}))
  fireEvent.click(next.getByRole('button',{name:'查看任务配置'}))
  fireEvent.click(await next.findByRole('button',{name:'查询本校授权的教师自评 Scale'}))
  await next.findByRole('option',{name:/乙专属量表/})
  expect(first.queryByRole('option',{name:/乙专属量表/})).not.toBeInTheDocument()
  const replacement=vi.fn(async(path:string)=>common(path,[{...event,title:'新学校活动'}]))
  rerender(<HuiteacherEvaluationStudio organizationId="new-org" api={replacement as Api}/>)
  await screen.findByText('新学校活动')
  fireEvent.click(screen.getByRole('button',{name:'查看任务配置'}))
  await screen.findByRole('button',{name:'查询本校授权的教师自评 Scale'})
  await act(async()=>late.resolve({list:[scale],nextCursor:'stale'}))
  expect(screen.queryByRole('option',{name:/量表甲/})).not.toBeInTheDocument()
  expect(screen.queryByRole('option',{name:/乙专属量表/})).not.toBeInTheDocument()
  expect(screen.queryByRole('button',{name:'继续加载授权量表'})).not.toBeInTheDocument()
 })
})
