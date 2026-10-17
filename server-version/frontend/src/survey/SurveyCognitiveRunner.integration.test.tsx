import { fireEvent,render,screen,waitFor } from '@testing-library/react'
import { afterEach,describe,expect,it,vi } from 'vitest'
import { SurveyCognitiveUnit } from './SurveyCognitiveUnit'
import { finalDraftStore } from '../services/persistence/finalDraftStore'

// Only admission device/storage probing is stubbed. The real registry FakeTask
// exercises runner/FINAL transport contracts, not GoNoGo timing or scientific validity.
vi.mock('./SurveyCognitiveDeviceGate',()=>({verifySurveyCognitiveStorage:vi.fn().mockResolvedValue(undefined),
  SurveyCognitiveDeviceGate:({onReady}:{onReady:()=>void})=><button type="button" onClick={onReady}>测试设备通过</button>}))
const session={sessionId:'survey-real-runner',assignmentId:'survey-only',testType:'fake',status:'IN_PROGRESS',
  deliveryMode:'FINAL_ONLY',engineVersion:'1.0.0',scoringVersion:'1.0.0',configVersion:'1.0.0',
  definitionHash:'a'.repeat(64),contextSnapshotHash:null,attemptEpoch:1,attemptNo:1,randomSeed:'frozen-test-seed',
  config:{trialCount:1,trialDurationMs:1000,allowPractice:false,maxRtMs:60000},lockedPriorAnswers:{form:{q:'yes'}}}
const ref={slotKey:'cog',epoch:1,resultId:'server-result',resultHash:'b'.repeat(64),measurementDigest:'c'.repeat(64)}
const proof={accessCredential:'p'.repeat(43)},base='/r/public/attempts/attempt/cognitive/cog'
function setup(){
  const onCommitted=vi.fn(),onRunningChange=vi.fn()
  const request=vi.fn(async(path:string,_method?:string,_body?:unknown):Promise<any>=>{
    if(path===base+'/start')return {...session,freshAdmission:true}
    if(path===base+'/'+session.sessionId+'/read')return {...session,freshAdmission:false}
    if(path===base+'/'+session.sessionId+'/final')return {completed:true,feedbackDeferred:true,resultReference:ref}
    throw new Error('Unexpected Survey request '+path)
  })
  render(<SurveyCognitiveUnit publicId="public" attemptId="attempt" instrumentKey="cog" title="Transport test"
    proof={proof} request={request} priorAnswers={{form:{q:'yes'}}} onStarted={vi.fn()}
    onCommitted={onCommitted} onRunningChange={onRunningChange}/>)
  fireEvent.click(screen.getByRole('button',{name:'测试设备通过'}))
  return {request,onCommitted,onRunningChange}
}
afterEach(async()=>{vi.restoreAllMocks();await finalDraftStore.delete('cognitive:'+session.sessionId);localStorage.clear()})
describe('Survey actual shared runner adapter',()=>{
  it('persists raw trials locally, sends one bearer-bound FINAL, and keeps child receipt distinct',async()=>{
    const {request,onCommitted}=setup()
    fireEvent.click(await screen.findByRole('button',{name:'开始测评'}))
    fireEvent.click(await screen.findByRole('button',{name:'trial 0'}))
    await waitFor(async()=>expect(await finalDraftStore.listTrials('cognitive:'+session.sessionId)).toHaveLength(1))
    expect(request.mock.calls.every(([p])=>!p.endsWith('/final'))).toBe(true)
    fireEvent.click(await screen.findByRole('button',{name:'完成测评'}))
    await screen.findByText('此任务已提交')
    const finals=request.mock.calls.filter(([p])=>p.endsWith('/final'))
    expect(finals).toHaveLength(1)
    expect(finals[0][2]).toMatchObject({...proof,attemptEpoch:1,definitionHash:session.definitionHash,
      trials:[expect.objectContaining({correct:expect.any(Boolean),rtMs:expect.any(Number)})]})
    expect(onCommitted).toHaveBeenCalledWith(ref)
    expect(screen.getByText(/请继续完成本轮研究并提交整轮回答/)).toBeInTheDocument()
    await waitFor(async()=>expect(await finalDraftStore.get('cognitive:'+session.sessionId)).toBeNull())
  })
  it('stops the real runner on trial storage failure and exposes parent-owned recovery without FINAL',async()=>{
    const {request,onRunningChange}=setup()
    fireEvent.click(await screen.findByRole('button',{name:'开始测评'}))
    vi.spyOn(finalDraftStore,'putTrial').mockRejectedValueOnce(new Error('IndexedDB write failed'))
    fireEvent.click(await screen.findByRole('button',{name:'trial 0'}))
    await screen.findByText(/本机试次暂存失败/)
    expect(screen.queryByRole('button',{name:'trial 0'})).toBeNull()
    expect(screen.queryByRole('button',{name:'完成测评'})).toBeNull()
    expect(request.mock.calls.every(([p])=>!p.endsWith('/final'))).toBe(true)
    fireEvent.click(screen.getByRole('button',{name:'返回上层测评'}))
    await screen.findByRole('button',{name:'核对提交并处理整单元重做'})
    expect(onRunningChange).toHaveBeenLastCalledWith(false)
  })
})
