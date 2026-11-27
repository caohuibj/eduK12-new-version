import {act,cleanup,fireEvent,render,screen,waitFor} from '@testing-library/react'
import {afterEach,expect,it,vi} from 'vitest'
import {HuiteacherEvaluationStudio} from './HuiteacherEvaluationStudio'
const event={id:'event',targetId:'target',title:'教师活动',kind:'ASSESSMENT',status:'OPEN',version:1}
const run={eventId:'event',runId:'run',status:'DRAFT',version:3,trackCount:2}
const preview={runId:'run',version:3,tracks:[{trackId:'scale',executionCount:4,subjectCount:4,respondentCount:4,resourcePolicy:{}},{trackId:'form',executionCount:4,subjectCount:4,respondentCount:4,resourcePolicy:{}}]}
const base='/organizations/org/evaluation-events/event/run'
function deferred<T>(){let resolve!:(value:T)=>void;const promise=new Promise<T>(yes=>{resolve=yes});return {promise,resolve}}
function setup(override?:(path:string,method?:string)=>Promise<unknown>|undefined){
 const api=vi.fn(async(path:string,method?:string)=>{
  const custom=override?.(path,method);if(custom)return custom
  if(path.endsWith('/evaluation-targets'))return {list:[]}
  if(path.endsWith('/evaluation-events'))return {list:[event]}
  if(path.endsWith('/forms'))return {list:[{id:'form',title:'正式表单',definitionDigest:'hash',status:'PUBLISHED'}]}
  if(path===base)return run
  if(path===base+'/tracking')return {baselineId:null,ordinal:null,choices:[]}
  if(path===base+'/preview')return preview
  if(path===base+'/tracks')return {}
  if(path===base+'/publish')return {executionCount:8,version:4}
  throw Error('Unexpected '+path)
 })
 return api
}
async function open(){fireEvent.click(await screen.findByRole('button',{name:'查看任务配置'}));await screen.findByRole('button',{name:'预览任务配置'})}
async function showPreview(){fireEvent.click(screen.getByRole('button',{name:'预览任务配置'}));await screen.findByRole('region',{name:'任务配置预览'})}
afterEach(()=>{cleanup();vi.restoreAllMocks()})
it('shows per-tool unique counts and total executions, with a neutral publication confirmation',async()=>{
 const api=setup(),confirm=vi.spyOn(window,'confirm').mockReturnValue(false)
 render(<HuiteacherEvaluationStudio organizationId="org" api={api as never}/>);await open();await showPreview()
 expect(screen.getByText('预计作答任务：8 个')).toBeInTheDocument()
 expect(screen.getByText('工具 1：被测者 4 人 · 作答者 4 人 · 作答任务 4 个')).toBeInTheDocument()
 expect(screen.getByText('工具 2：被测者 4 人 · 作答者 4 人 · 作答任务 4 个')).toBeInTheDocument()
 expect(screen.getByText(/不将各工具人数相加视为独立人数/)).toBeInTheDocument()
 fireEvent.click(await screen.findByRole('button',{name:'发布教师评价任务'}))
 await waitFor(()=>expect(confirm).toHaveBeenCalledWith('确认按当前固定版本配置，向本校符合资格的教师分配测评任务吗？发布时将重新校验参与资格。本次确认冻结总作答上限为 8 份，不缩减原参与范围。已有作答仍按原任务规则继续。'))
 expect(api.mock.calls.some(([path])=>path.endsWith('/publish'))).toBe(false)
})
it('invalidates the preview immediately when a draft write begins, even before the refresh returns',async()=>{
 const pending=deferred<object>(),api=setup(path=>path===base+'/tracks'?pending.promise:undefined)
 render(<HuiteacherEvaluationStudio organizationId="org" api={api as never}/>);await open();await showPreview()
 fireEvent.change(screen.getByLabelText('向当前教师发布的 Form（不计分）'),{target:{value:'form'}})
 fireEvent.click(screen.getByRole('button',{name:'加入表单'}))
 expect(screen.queryByRole('region',{name:'任务配置预览'})).not.toBeInTheDocument()
 await act(async()=>pending.resolve({}))
 expect(screen.queryByRole('region',{name:'任务配置预览'})).not.toBeInTheDocument()
})
it('discards a late preview after organization and API context change',async()=>{
 const late=deferred<typeof preview>(),api=setup(path=>path===base+'/preview'?late.promise:undefined)
 const view=render(<HuiteacherEvaluationStudio organizationId="org" api={api as never}/>);await open()
 fireEvent.click(screen.getByRole('button',{name:'预览任务配置'}));await waitFor(()=>expect(api).toHaveBeenCalledWith(base+'/preview','POST',{expectedVersion:3}))
 const next=vi.fn(async()=>({list:[]}))
 view.rerender(<HuiteacherEvaluationStudio organizationId="other" api={next as never}/>)
 await act(async()=>late.resolve(preview))
 expect(screen.queryByRole('region',{name:'任务配置预览'})).not.toBeInTheDocument()
 expect(screen.queryByText('预计作答任务：8 个')).not.toBeInTheDocument()
})
it('rejects a mismatched preview version without adding a mandatory-preview publication gate',async()=>{
 const api=setup(path=>path===base+'/preview'?Promise.resolve({...preview,version:2}):undefined)
 vi.spyOn(window,'confirm').mockReturnValue(true)
 render(<HuiteacherEvaluationStudio organizationId="org" api={api as never}/>);await open()
 fireEvent.click(screen.getByRole('button',{name:'预览任务配置'}));await screen.findByText('预览版本或人数响应无效，请重新预览任务配置。')
 expect(screen.queryByRole('region',{name:'任务配置预览'})).not.toBeInTheDocument()
 fireEvent.click(await screen.findByRole('button',{name:'发布教师评价任务'}))
 await waitFor(()=>expect(api).toHaveBeenCalledWith(base+'/publish','POST',{expectedVersion:3,tracking:{mode:'SINGLE',metrics:[],visibleMetrics:[]},provideParticipantReport:false}))
})

it('provides an explicitly confirmed activity cancellation after a published Run was cancelled',async()=>{
 let cancelled=false
 const api=setup((path,method)=>{
  if(path===base)return Promise.resolve({...run,status:'CANCELLED'})
  if(path.endsWith('/evaluation-events'))return Promise.resolve({list:[{...event,status:cancelled?'CANCELLED':'OPEN'}]})
  if(path.endsWith('/transition')&&method==='POST'){cancelled=true;return Promise.resolve({status:'CANCELLED',version:2})}
 })
 const confirm=vi.spyOn(window,'confirm').mockReturnValue(false)
 render(<HuiteacherEvaluationStudio organizationId="org" api={api as never}/>)
 fireEvent.click(await screen.findByRole('button',{name:'查看任务配置'}))
 fireEvent.click(await screen.findByRole('button',{name:'取消活动并结束'}))
 await waitFor(()=>expect(confirm).toHaveBeenCalledOnce())
 expect(api.mock.calls.some(([p,m])=>p.endsWith('/transition')&&m==='POST')).toBe(false)
 confirm.mockReturnValue(true)
 fireEvent.click(await screen.findByRole('button',{name:'取消活动并结束'}))
 await waitFor(()=>expect(api).toHaveBeenCalledWith('/organizations/org/evaluation-events/event/transition','POST',{action:'CANCEL',expectedVersion:1}))
})

it('publishes the matching preview cap and an optional deadline while rejecting a past deadline',async()=>{
 const api=setup()
 vi.spyOn(window,'confirm').mockReturnValue(true)
 render(<HuiteacherEvaluationStudio organizationId="org" api={api as never}/>);await open();await showPreview()
 expect(screen.getByText('本次冻结总作答上限：8 份。发布时保留原参与范围。')).toBeVisible()
 const input=screen.getByLabelText('停止接受新作答 · 教师活动（本地时间）')
 fireEvent.change(input,{target:{value:'2020-01-01T12:00'}})
 fireEvent.click(await screen.findByRole('button',{name:'发布教师评价任务'}))
 await screen.findByText('停止接受新作答时间必须晚于当前时间。')
 expect(api.mock.calls.some(([path])=>path.endsWith('/publish'))).toBe(false)
 await showPreview()
 fireEvent.change(input,{target:{value:'2029-11-30T12:30'}})
 fireEvent.click(await screen.findByRole('button',{name:'发布教师评价任务'}))
 await waitFor(()=>expect(api).toHaveBeenCalledWith(base+'/publish','POST',{expectedVersion:3,tracking:{mode:'SINGLE',metrics:[],visibleMetrics:[]},provideParticipantReport:false,maxResponses:8,intakeDeadline:new Date('2029-11-30T12:30').toISOString()}))
 expect(window.confirm).toHaveBeenCalledWith(expect.stringContaining('冻结总作答上限为 8 份，不缩减原参与范围'))
 expect(window.confirm).toHaveBeenCalledWith(expect.stringContaining('停止接受新作答：'))
})
it('omits a stale preview cap when the fresh publication read has a newer run revision',async()=>{
 let reads=0
 const api=setup(path=>path===base?Promise.resolve({...run,version:++reads<=2?3:4}):undefined)
 vi.spyOn(window,'confirm').mockReturnValue(true)
 render(<HuiteacherEvaluationStudio organizationId="org" api={api as never}/>);await open();await showPreview()
 fireEvent.click(await screen.findByRole('button',{name:'发布教师评价任务'}))
 await waitFor(()=>expect(api).toHaveBeenCalledWith(base+'/publish','POST',{expectedVersion:4,tracking:{mode:'SINGLE',metrics:[],visibleMetrics:[]},provideParticipantReport:false}))
})
