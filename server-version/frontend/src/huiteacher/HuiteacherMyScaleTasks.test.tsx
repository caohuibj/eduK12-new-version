import {afterEach,describe,expect,it,vi} from 'vitest'
import {cleanup,fireEvent,render,screen,waitFor} from '@testing-library/react'
import {HuiteacherMyScaleTasks} from './HuiteacherMyScaleTasks'

const capture=vi.hoisted(()=>({props:null as any}))
vi.mock('../components/FinalCompositeAssessment',()=>({
  default:(props:any)=>{capture.props=props;return <div>已有自评作答界面</div>},
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
    const segments=new URL(path,'https://fixture.invalid').pathname.split('/')
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
    expect(api).toHaveBeenCalledWith('/composite-attempts/existing-attempt?view=current-unit')
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
    expect(api).toHaveBeenCalledWith('/composite-attempts/new-attempt?view=current-unit')
  })
  it('retains completed personal feedback without reopening the runner',async()=>{
    const api=client({status:'COMPLETED'})
    fireEvent.click(await screen.findByRole('button',{name:'查看本人反馈'}))
    await waitFor(()=>expect(api).toHaveBeenCalledWith('/run-executions/execution/personal-summary'))
    expect(api.mock.calls.some(([path])=>path.startsWith('/composite-attempts/'))).toBe(false)
  })
  it('renders authorized Teacher descriptive feedback instead of routing it to the education unit report',async()=>{
    const api=vi.fn(async(path:string)=>{
      if(path==='/my-scale-tasks')return {list:[{...task,status:'COMPLETED'}]}
      if(path.endsWith('/personal-summary'))return {kind:'HUITEACHER_PERSONAL_DESCRIPTION',state:'READY',explanation:'本人描述性反馈',metrics:[{key:'reflection',label:'本次记录合计',value:12,precision:0,headline:'回看这一次教学体验',summary:'本机合成示例反馈',guidance:[]}],limitations:[]}
      throw Error('Unexpected request '+path)
    })
    render(<HuiteacherMyScaleTasks api={api as Parameters<typeof HuiteacherMyScaleTasks>[0]['api']}/>)
    fireEvent.click(await screen.findByRole('button',{name:'查看本人反馈'}))
    expect(await screen.findByRole('heading',{name:'本次记录合计'})).toBeInTheDocument()
    expect(screen.getByText('12',{selector:'strong'})).toBeInTheDocument()
    expect(screen.getByText('本机合成示例反馈')).toBeInTheDocument()
    expect(screen.queryByText(/当前报告尚未获准显示/)).not.toBeInTheDocument()
    expect(api.mock.calls.every(call=>call.length===1)).toBe(true)
  })
  it('does not render metric values from an unknown feedback format',async()=>{
    const api=vi.fn(async(path:string)=>path==='/my-scale-tasks'?{list:[{...task,status:'COMPLETED'}]}:{kind:'UNKNOWN_REPORT',state:'READY',metrics:[{key:'x',label:'未知内容',value:999,precision:0}]})
    render(<HuiteacherMyScaleTasks api={api as Parameters<typeof HuiteacherMyScaleTasks>[0]['api']}/>)
    fireEvent.click(await screen.findByRole('button',{name:'查看本人反馈'}))
    await screen.findByText('当前反馈格式暂不支持，请联系管理员核查。')
    expect(screen.queryByText('未知内容')).not.toBeInTheDocument()
    expect(screen.queryByText('999')).not.toBeInTheDocument()
  })

})

it('requests only a receipt from the existing Teacher scale submission endpoint',async()=>{
 const payload={submissionId:'synthetic-id',answers:[]}
 const api=vi.fn(async(path:string,method='GET')=>{
  if(path==='/my-scale-tasks')return {list:[task]}
  if(path==='/composite-attempts/existing-attempt?view=current-unit')return {id:'existing-attempt',status:'IN_PROGRESS',currentItem:{id:'scale-item',type:'SCALE'}}
  if(path==='/composite-attempts/existing-attempt/items/scale-item/scale/submit?response=receipt'&&method==='POST')return {completed:true,replayed:false}
  throw Error('Unexpected Teacher transport '+path)
 })
 render(<HuiteacherMyScaleTasks api={api as Parameters<typeof HuiteacherMyScaleTasks>[0]['api']}/>);
 fireEvent.click(await screen.findByRole('button',{name:'继续已有自评'}));await screen.findByText('已有自评作答界面')
 await capture.props.submitScale('existing-attempt','scale-item',payload)
 expect(api).toHaveBeenCalledWith('/composite-attempts/existing-attempt/items/scale-item/scale/submit?response=receipt','POST',payload)
})
