import { act,fireEvent,render,screen,waitFor } from '@testing-library/react'
import { afterEach,beforeEach,describe,expect,it,vi } from 'vitest'
import { SurveyCognitiveUnit } from './SurveyCognitiveUnit'
import { finalDraftStore } from '../services/persistence/finalDraftStore'
const mock=vi.hoisted(()=>({binding:null as any,gateReady:null as null|(()=>void)}))
vi.mock('../services/persistence/finalDraftStore',()=>({finalDraftStore:{get:vi.fn(),delete:vi.fn().mockResolvedValue(undefined)}}))
vi.mock('./SurveyCognitiveDeviceGate',()=>({verifySurveyCognitiveStorage:vi.fn().mockResolvedValue(undefined),SurveyCognitiveDeviceGate:({onReady}:{onReady:()=>void})=>{mock.gateReady=onReady;return <button type="button" onClick={onReady}>通过设备检查</button>}}))
vi.mock('../modules/cognitive/pages/CognitiveRunner',()=>({CognitiveRunner:({embedded}:{embedded:any})=>{
  mock.binding=embedded;return <div data-testid="shared-runner">共享运行器 {embedded.sessionId}<button type="button" onClick={embedded.onExit}>处理恢复</button></div>
}}))
const proof={accessCredential:'c'.repeat(43)},reference={slotKey:'cog',epoch:1,resultId:'result',resultHash:'h',measurementDigest:'m'}
const current={sessionId:'s1',status:'IN_PROGRESS',attemptEpoch:1,freshAdmission:true,definitionHash:'definition',contextSnapshotHash:null,lockedPriorAnswers:{form:{q:'yes'}}}
const existing={slotKey:'cog',sessionId:'s1',status:'IN_PROGRESS',epoch:1}
const setup=(request:any,info?:typeof existing)=>{
  const callbacks={onStarted:vi.fn(),onCommitted:vi.fn(),onRunningChange:vi.fn()}
  const props={publicId:'public',attemptId:'parent',instrumentKey:'cog',title:'GoNoGo',proof,request,
    priorAnswers:{form:{q:'yes'}},existing:info,...callbacks}
  return {...render(<SurveyCognitiveUnit {...props}/>),callbacks,props}
}
beforeEach(()=>{localStorage.clear();vi.mocked(finalDraftStore.get).mockResolvedValue(null);mock.binding=null})
afterEach(()=>{vi.clearAllMocks()})
describe('Survey embedded cognitive lifecycle (component contract only)',()=>{
  it('starts with Survey proof, locks prior answers and injects shared runner without parent FINAL',async()=>{
    const request=vi.fn(async()=>current),{callbacks,rerender,props}=setup(request)
    fireEvent.click(screen.getByRole('button',{name:'通过设备检查'}));await screen.findByTestId('shared-runner')
    expect(request).toHaveBeenCalledWith('/r/public/attempts/parent/cognitive/cog/start','POST',{
      ...proof,priorAnswers:{form:{q:'yes'}},administrationProvenance:{schemaVersion:1,deviceClass:'DESKTOP_LAPTOP',administrationMode:'KEYBOARD_MOUSE'}})
    expect(mock.binding.requiredInput).toBe('KEYBOARD');expect(callbacks.onRunningChange).toHaveBeenLastCalledWith(true)
    rerender(<SurveyCognitiveUnit {...props} existing={existing}/>);await waitFor(()=>expect(screen.getByTestId('shared-runner')).toBeInTheDocument())
    expect(screen.queryByText(/此前任务未确认完成/)).toBeNull();expect(request).toHaveBeenCalledTimes(1)
  })
  it('does not mount partially completed trials; reads before controlled epoch restart',async()=>{
    const request=vi.fn(async(path:string)=>path.endsWith('/restart')?{...current,sessionId:'s2',attemptEpoch:2}:current)
    const {callbacks,rerender,props}=setup(request,existing)
    await screen.findByRole('button',{name:'核对提交并处理整单元重做'})
    expect(screen.queryByTestId('shared-runner')).toBeNull()
    fireEvent.click(screen.getByRole('button',{name:'核对提交并处理整单元重做'}));await screen.findByTestId('shared-runner')
    expect(request.mock.calls.map(([p])=>p.split('/').pop())).toEqual(['read','read','interrupt','restart'])
    expect(callbacks.onStarted).toHaveBeenLastCalledWith({...existing,sessionId:'s2',epoch:2},current.lockedPriorAnswers)
    expect(finalDraftStore.delete).toHaveBeenCalledWith('cognitive:s1')
    rerender(<SurveyCognitiveUnit {...props} existing={{...existing,sessionId:'s2',epoch:2}}/>)
    expect(callbacks.onRunningChange).toHaveBeenLastCalledWith(true)
  })
  it('replays a local sealed FINAL in the existing runner and never interrupts it',async()=>{
    vi.mocked(finalDraftStore.get).mockResolvedValue({attemptId:'s1',attemptEpoch:1,definitionHash:'definition',contextSnapshotHash:null,sealedSubmission:{payload:{submissionId:'same'}}} as any)
    const request=vi.fn(async()=>current);setup(request,existing)
    await screen.findByTestId('shared-runner');expect(request).toHaveBeenCalledTimes(1)
    expect(screen.queryByRole('button',{name:'核对提交并处理整单元重做'})).toBeNull()
  })
  it('recognizes child completion without announcing whole-study completion',async()=>{
    const request=vi.fn(async()=>({...current,status:'COMPLETED',resultReference:reference})),{callbacks}=setup(request,existing)
    await screen.findByText('此任务已提交');expect(callbacks.onCommitted).toHaveBeenCalledWith(reference)
    expect(finalDraftStore.delete).toHaveBeenCalledWith('cognitive:s1')
    expect(screen.getByText(/请继续完成本轮研究并提交整轮回答/)).toBeInTheDocument()
    expect(screen.queryByTestId('shared-runner')).toBeNull()
  })
  it('checks completion before replacing an uncertain child',async()=>{
    let reads=0;const request=vi.fn(async(_path:string)=>++reads===1?current:{...current,status:'COMPLETED',resultReference:reference})
    setup(request,existing);fireEvent.click(await screen.findByRole('button',{name:'核对提交并处理整单元重做'}))
    await screen.findByText('此任务已提交');expect(request.mock.calls.every(([path])=>String(path).endsWith('/read'))).toBe(true)
  })
  it('retries the same restart after response loss without requiring a now-stale old-session read',async()=>{
    let restarts=0;const request=vi.fn(async(path:string)=>{
      if(path.endsWith('/restart')){if(++restarts===1)throw new Error('网络响应丢失');return {...current,sessionId:'s2',attemptEpoch:2,freshAdmission:false}}
      return current
    });setup(request,existing)
    fireEvent.click(await screen.findByRole('button',{name:'核对提交并处理整单元重做'}));await screen.findByText('网络响应丢失')
    fireEvent.click(screen.getByRole('button',{name:'核对提交并处理整单元重做'}));await screen.findByText(/整单元重做机会已使用/)
    expect(screen.queryByTestId('shared-runner')).toBeNull()
    expect(screen.getByRole('button',{name:'仅核对已封存提交'})).toBeInTheDocument()
    expect(request.mock.calls.map(([p])=>p.split('/').pop())).toEqual(['read','read','interrupt','restart','restart'])
  })
  it('blocks a second restart and keeps an unreadable session behind retry rather than new admission',async()=>{
    const request=vi.fn(async()=>({...current,attemptEpoch:2}));setup(request,{...existing,epoch:2})
    fireEvent.click(await screen.findByRole('button',{name:'仅核对已封存提交'}))
    await screen.findByText(/已达到本研究的一次整单元重做上限/)
    expect(request).toHaveBeenCalledTimes(2)
  })
  it('on a failed recovery read only retries that read, never creates a fresh child',async()=>{
    const request=vi.fn(async(_path:string)=>{throw new Error('服务器不可用')});setup(request,existing)
    await screen.findByText('服务器不可用');expect(screen.queryByRole('button',{name:'通过设备检查'})).toBeNull()
    fireEvent.click(screen.getByRole('button',{name:'重新检查设备和任务'}))
    await waitFor(()=>expect(request).toHaveBeenCalledTimes(2))
    expect(request.mock.calls.every(([path])=>String(path).endsWith('/read'))).toBe(true)
  })
  it('locks before a deferred start and retries its exact input after an ambiguous response',async()=>{
    let rejectStart!:(e:Error)=>void
    const request=vi.fn().mockImplementationOnce(()=>new Promise((_resolve,reject)=>{rejectStart=reject}))
      .mockResolvedValueOnce({...current,freshAdmission:false})
    const {callbacks,rerender,props}=setup(request)
    fireEvent.click(screen.getByRole('button',{name:'通过设备检查'}))
    expect(callbacks.onRunningChange).toHaveBeenLastCalledWith(true)
    expect(screen.queryByRole('button',{name:'通过设备检查'})).toBeNull()
    expect(screen.queryByTestId('shared-runner')).toBeNull()
    await act(async()=>rejectStart(new Error('响应丢失')))
    expect(callbacks.onRunningChange).toHaveBeenLastCalledWith(true)
    rerender(<SurveyCognitiveUnit {...props} priorAnswers={{form:{q:'changed'}}}/>)
    fireEvent.click(screen.getByRole('button',{name:'核对本次开始请求'}))
    await screen.findByRole('button',{name:'核对提交并处理整单元重做'})
    expect(request.mock.calls[1]).toEqual(request.mock.calls[0])
    expect(screen.queryByTestId('shared-runner')).toBeNull()
    expect(callbacks.onStarted).toHaveBeenLastCalledWith(expect.objectContaining({sessionId:'s1'}),{form:{q:'yes'}})
    expect(callbacks.onRunningChange).toHaveBeenLastCalledWith(false)
  })
  it('does not admit a stale-tab existing start or a mismatched local sealed epoch',async()=>{
    vi.mocked(finalDraftStore.get).mockResolvedValue({attemptId:'s1',attemptEpoch:2,definitionHash:'definition',
      contextSnapshotHash:null,sealedSubmission:{payload:{submissionId:'same'}}} as any)
    const request=vi.fn(async()=>({...current,freshAdmission:false}));setup(request)
    fireEvent.click(screen.getByRole('button',{name:'通过设备检查'}))
    await screen.findByRole('button',{name:'核对提交并处理整单元重做'})
    expect(screen.queryByTestId('shared-runner')).toBeNull()
  })

  it('ignores late start completion after unmount and leaves outer navigation unlocked',async()=>{
    let resolveStart!:(value:unknown)=>void
    const request=vi.fn(()=>new Promise(resolve=>{resolveStart=resolve}))
    const {callbacks,unmount}=setup(request)
    fireEvent.click(screen.getByRole('button',{name:'通过设备检查'}))
    unmount();const count=callbacks.onRunningChange.mock.calls.length
    await act(async()=>resolveStart(current))
    expect(callbacks.onStarted).not.toHaveBeenCalled()
    expect(callbacks.onCommitted).not.toHaveBeenCalled()
    expect(callbacks.onRunningChange).toHaveBeenCalledTimes(count)
    expect(callbacks.onRunningChange).toHaveBeenLastCalledWith(false)
  })
  it('ignores a late restart response after unmount without emitting a new admission',async()=>{
    let resolveRestart!:(value:unknown)=>void
    const request=vi.fn(async(path:string)=>path.endsWith('/restart')?await new Promise(resolve=>{resolveRestart=resolve}):current)
    const {callbacks,unmount}=setup(request,existing)
    fireEvent.click(await screen.findByRole('button',{name:'核对提交并处理整单元重做'}))
    await waitFor(()=>expect(request.mock.calls.some(([p])=>p.endsWith('/restart'))).toBe(true))
    unmount();const starts=callbacks.onStarted.mock.calls.length,running=callbacks.onRunningChange.mock.calls.length
    await act(async()=>resolveRestart({...current,sessionId:'s2',attemptEpoch:2}))
    expect(callbacks.onStarted).toHaveBeenCalledTimes(starts)
    expect(callbacks.onRunningChange).toHaveBeenCalledTimes(running)
    expect(callbacks.onRunningChange).toHaveBeenLastCalledWith(false)
  })
  it('keeps a confirmed child receipt when local cleanup fails',async()=>{
    vi.mocked(finalDraftStore.delete).mockRejectedValueOnce(new Error('storage denied'))
    const request=vi.fn(async()=>({...current,status:'COMPLETED',resultReference:reference}))
    const {callbacks}=setup(request,existing)
    await screen.findByText('此任务已提交')
    await screen.findByText(/服务器状态已确认，但本机试次清理失败/)
    expect(callbacks.onCommitted).toHaveBeenCalledWith(reference)
    expect(screen.queryByTestId('shared-runner')).toBeNull()
  })
  it('unlocks a definitively rejected start for correction, without changing ambiguous-retry rules',async()=>{
    const request=vi.fn(async()=>{throw Object.assign(new Error('前置答案不合法'),{status:400})})
    const {callbacks}=setup(request)
    fireEvent.click(screen.getByRole('button',{name:'通过设备检查'}))
    await screen.findByText('前置答案不合法')
    expect(callbacks.onRunningChange).toHaveBeenLastCalledWith(false)
    fireEvent.click(screen.getByRole('button',{name:'重新检查设备和任务'}))
    expect(screen.getByRole('button',{name:'通过设备检查'})).toBeInTheDocument()
  })

  it('ignores a delayed device-probe callback after its unit has unmounted',async()=>{
    const request=vi.fn(async()=>current),{callbacks,unmount}=setup(request)
    const delayedProbeCallback=mock.gateReady!
    unmount();const count=callbacks.onRunningChange.mock.calls.length
    await act(async()=>delayedProbeCallback())
    expect(request).not.toHaveBeenCalled()
    expect(callbacks.onRunningChange).toHaveBeenCalledTimes(count)
    expect(callbacks.onRunningChange).toHaveBeenLastCalledWith(false)
  })

  it('keeps fresh admission runnable when the optional cleanup lock is denied',async()=>{
    const descriptor=Object.getOwnPropertyDescriptor(navigator,'locks')
    Object.defineProperty(navigator,'locks',{configurable:true,value:{
      request:vi.fn().mockRejectedValue(new DOMException('locks denied','SecurityError')),
    }})
    try{
      const request=vi.fn(async()=>current),{unmount}=setup(request)
      fireEvent.click(screen.getByRole('button',{name:'通过设备检查'}))
      await screen.findByTestId('shared-runner')
      expect(request).toHaveBeenCalledTimes(1)
      expect(localStorage.getItem('huisurvey:v1:cognitive-retention-paused')).toBe('1')
      unmount()
    }finally{
      if(descriptor)Object.defineProperty(navigator,'locks',descriptor)
      else Reflect.deleteProperty(navigator,'locks')
    }
  })

})
