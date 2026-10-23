import {afterEach,describe,expect,it,vi} from 'vitest'
import {cleanup,fireEvent,render,screen,waitFor} from '@testing-library/react'
import {HuiteacherMyScaleTasks} from './HuiteacherMyScaleTasks'

vi.mock('../components/FinalCompositeAssessment',()=>({
  default:()=> <div>已有自评作答界面</div>,
}))
afterEach(cleanup)
const task={executionId:'execution',eventId:'event',eventTitle:'个人发展',runId:'run',
  organizationId:'school',status:'STARTED',runtimeBindingRef:'existing-attempt',
  resourceKey:'teacher-scale:one:INDIVIDUAL',title:'本人自评',runStatus:'CLOSED'}
function client(overrides:Partial<Omit<typeof task,'runtimeBindingRef'>> & {runtimeBindingRef?:string|null}={}){
  const api=vi.fn(async(path:string)=>{
    if(path==='/my-scale-tasks')return {list:[{...task,...overrides}]}
    if(path.endsWith('/start-scale'))return {state:'STARTED',runtimeBindingKind:'COMPOSITE',runtimeBindingRef:'new-attempt'}
    if(path.endsWith('/personal-summary'))return {state:'WITHHELD',explanation:'反馈暂不可用'}
    const segments=path.split('/')
    return {id:segments[segments.length-1]}
  })
  render(<HuiteacherMyScaleTasks api={api as Parameters<typeof HuiteacherMyScaleTasks>[0]['api']}/> )
  return api
}
describe('Teacher bound Scale continuation',()=>{
  it('opens only the existing bound attempt after Run closes without calling START',async()=>{
    const api=client()
    fireEvent.click(await screen.findByRole('button',{name:'继续已有自评'}))
    await screen.findByText('已有自评作答界面')
    expect(api).toHaveBeenCalledWith('/composite-attempts/existing-attempt')
    expect(api.mock.calls.some(([path])=>path.endsWith('/start-scale'))).toBe(false)
  })
  it.each(['ASSIGNED','STARTED'])('does not start a CLOSED %s task without a binding',async status=>{
    const api=client({status,runtimeBindingRef:null})
    await screen.findByText('任务已结束或不再接受新的 START，不能重新开始。')
    expect(screen.queryByRole('button',{name:/进入本人自评|继续已有自评/})).not.toBeInTheDocument()
    expect(api.mock.calls.some(([path])=>path.endsWith('/start-scale'))).toBe(false)
  })
  it('keeps the ordinary PUBLISHED new START flow',async()=>{
    const api=client({status:'ASSIGNED',runStatus:'PUBLISHED',runtimeBindingRef:null})
    fireEvent.click(await screen.findByRole('button',{name:'进入本人自评'}))
    await waitFor(()=>expect(api).toHaveBeenCalledWith('/run-executions/execution/start-scale','POST',{}))
    await screen.findByText('已有自评作答界面')
    expect(api).toHaveBeenCalledWith('/composite-attempts/new-attempt')
  })
  it('retains completed personal feedback without reopening the runner',async()=>{
    const api=client({status:'COMPLETED'})
    fireEvent.click(await screen.findByRole('button',{name:'查看本人反馈'}))
    await waitFor(()=>expect(api).toHaveBeenCalledWith('/run-executions/execution/personal-summary'))
    expect(api.mock.calls.some(([path])=>path.startsWith('/composite-attempts/'))).toBe(false)
  })
})
