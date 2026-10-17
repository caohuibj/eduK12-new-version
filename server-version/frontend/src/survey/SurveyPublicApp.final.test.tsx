import {act,fireEvent,render,screen,waitFor} from '@testing-library/react'
import {afterEach,beforeEach,describe,expect,it,vi} from 'vitest'
import SurveyPublicApp from './SurveyPublicApp'

const publicId='11111111-1111-4111-8111-111111111111'
const attemptId='22222222-2222-4222-8222-222222222222'
const draftKey=`huisurvey:v1:unfinished:${publicId}:${attemptId}`
const response=(data:unknown,status=200,message='ok')=>Promise.resolve({
  ok:status<400,status,json:async()=>({code:status<400?0:-1,data,message}),
} as Response)
const task={attemptId,waveId:'wave',status:'STARTED',definitionDigest:'a'.repeat(64),
  reportMode:'GENERAL_ONLY',units:[{kind:'SCALE',instrumentKey:'scale',title:'计时量表',
    presentationMode:'ONE_BY_ONE',items:[{itemKey:'q1',prompt:'第一题',required:true}],
    responseOptions:[{optionKey:'yes',label:'同意'},{optionKey:'no',label:'不同意'}]}]}
let now=100
let finalCalls:Record<string,unknown>[]
let finalReply:(body:Record<string,unknown>)=>Promise<Response>
let generalReply:()=>Promise<Response>
let taskValue:typeof task
let linked:boolean
let linkedWaves:{id:string;title:string;ordinal:number;status:string;consentText:string;consentVersion:number;attempt:{id:string;status:string}}[]
async function openTask(){
  const view=render(<SurveyPublicApp/>)
  fireEvent.click(await screen.findByRole('button',{name:'恢复本次作答／查看已完成回执'}))
  await screen.findByRole('radio',{name:'同意'})
  await waitFor(()=>expect(screen.getByRole('button',{name:'提交本轮正式回答'})).toBeEnabled())
  return view
}
const submit=()=>fireEvent.click(screen.getByRole('button',{name:'提交本轮正式回答'}))
beforeEach(()=>{
  sessionStorage.clear()
  window.history.replaceState(null,'',`/r/${publicId}`)
  sessionStorage.setItem(`huisurvey:v1:single:${publicId}`,JSON.stringify({
    attemptId,accessCredential:'a'.repeat(43),createdAt:Date.now(),
  }))
  now=100;finalCalls=[];taskValue=structuredClone(task);linked=false
  linkedWaves=[{id:'wave',title:'本轮',ordinal:1,status:'OPEN',consentText:'研究说明',consentVersion:1,attempt:{id:attemptId,status:'STARTED'}}]
  vi.spyOn(performance,'now').mockImplementation(()=>now)
  vi.spyOn(document,'hasFocus').mockReturnValue(true)
  finalReply=()=>response({status:'COMPLETED',completedAt:'2026-10-17T00:00:00Z'})
  generalReply=()=>response({kind:'GENERAL_ONLY',text:'感谢参与',disclaimer:'一般反馈',completedAt:'2026-10-17T00:00:00Z'})
  vi.stubGlobal('fetch',vi.fn((url:string,init?:RequestInit)=>{
    if(url.endsWith('/info'))return response({project:{name:'研究',description:'说明',collectionMode:linked?'LINKED_WAVES':'SINGLE_UNLINKED',status:'OPEN'},waves:[]})
    if(url.endsWith('/enter'))return response({waves:linkedWaves})
    if(url.endsWith('/revoke-access'))return response({status:'REVOKED'})
    if(url.endsWith('/task'))return response(taskValue)
    if(url.endsWith('/final')){
      const body=JSON.parse(String(init?.body)) as Record<string,unknown>
      finalCalls.push(body);return finalReply(body)
    }
    if(url.endsWith('/general'))return generalReply()
    throw new Error('Unexpected route '+url)
  }))
})
afterEach(()=>{vi.restoreAllMocks();vi.unstubAllGlobals()})

describe('Survey authoritative FINAL and timing lifecycle',()=>{
  it('retries exact sealed answers and timing after an uncertain response',async()=>{
    finalReply=()=>Promise.reject(new Error('网络中断'))
    await openTask()
    now=1100;fireEvent.click(screen.getByRole('radio',{name:'同意'}));submit()
    await screen.findByRole('alert')
    expect(finalCalls).toHaveLength(1)
    now=9000
    submit()
    await waitFor(()=>expect(finalCalls).toHaveLength(2))
    expect(finalCalls[1]).toEqual(finalCalls[0])
    expect(screen.getByRole('radio',{name:'不同意'})).toBeDisabled()
  })
  it('keeps completion authoritative when General fails and retries only the receipt',async()=>{
    generalReply=()=>Promise.reject(new Error('回执暂不可用'))
    await openTask()
    now=1200;fireEvent.click(screen.getByRole('radio',{name:'同意'}));submit()
    await screen.findByRole('alert')
    expect(screen.queryAllByRole('radio')).toHaveLength(0)
    await act(async()=>{await new Promise(resolve=>setTimeout(resolve,500))})
    expect(sessionStorage.getItem(draftKey)).toBeNull()
    generalReply=()=>response({kind:'GENERAL_ONLY',text:'感谢参与',disclaimer:'一般反馈',completedAt:'2026-10-17T00:00:00Z'})
    fireEvent.click(screen.getByRole('button',{name:'重试读取完成回执'}))
    await screen.findByText('感谢参与')
    expect(finalCalls).toHaveLength(1)
  })
  it('writes the live foreground interval and interruption synchronously on pagehide',async()=>{
    await openTask()
    now=1100;fireEvent.click(screen.getByRole('radio',{name:'同意'}))
    now=5100;fireEvent(window,new Event('pagehide'))
    const saved=JSON.parse(sessionStorage.getItem(draftKey)!)
    expect(saved.itemTimings.scale.q1).toMatchObject({firstResponseMs:1000,activeTimeMs:5000,interrupted:true})
  })
  it('unseals a rejected validation request and submits corrected answers with continued timing',async()=>{
    finalReply=()=>response(null,400,'量表回答校验失败')
    await openTask()
    now=1100;fireEvent.click(screen.getByRole('radio',{name:'同意'}));submit()
    await screen.findByRole('alert')
    await waitFor(()=>expect(screen.getByRole('radio',{name:'不同意'})).toBeEnabled())
    now=2100;fireEvent.click(screen.getByRole('radio',{name:'不同意'}))
    finalReply=()=>response({status:'COMPLETED'})
    submit()
    await screen.findByText('感谢参与')
    expect(finalCalls).toHaveLength(2)
    expect(finalCalls[1].answers).toEqual({scale:{q1:'no'}})
    expect(finalCalls[1].itemTimings).toMatchObject({scale:{q1:{
      firstResponseMs:1000,activeTimeMs:2000,changeCount:1,revisitCount:0,visits:1,
    }}})
  })
  it('blocks answer edits and duplicate form submits while FINAL is in flight',async()=>{
    let resolve!:(value:Response)=>void
    finalReply=()=>new Promise(done=>{resolve=done})
    await openTask()
    now=1100;fireEvent.click(screen.getByRole('radio',{name:'同意'}));submit()
    expect(screen.getByRole('radio',{name:'不同意'})).toBeDisabled()
    fireEvent.submit(screen.getByRole('button',{name:'提交本轮正式回答'}).closest('form')!)
    expect(finalCalls).toHaveLength(1)
    await act(async()=>{resolve(await response({status:'COMPLETED'}))})
    await screen.findByText('感谢参与')
    expect(finalCalls[0].answers).toEqual({scale:{q1:'yes'}})
  })
  it('does not reopen an already completed task when its receipt cannot load',async()=>{
    taskValue={...taskValue,status:'COMPLETED'}
    generalReply=()=>Promise.reject(new Error('回执暂不可用'))
    render(<SurveyPublicApp/>)
    fireEvent.click(await screen.findByRole('button',{name:'恢复本次作答／查看已完成回执'}))
    await screen.findByRole('alert')
    expect(screen.queryAllByRole('radio')).toHaveLength(0)
    expect(screen.queryByRole('button',{name:'提交本轮正式回答'})).toBeNull()
    expect(screen.getByRole('button',{name:'重试读取完成回执'})).toBeEnabled()
    expect(finalCalls).toHaveLength(0)
  })
  it('preserves observed unanswered exposure and interruption through same-tab recovery',async()=>{
    const view=await (async()=>{
      const v=render(<SurveyPublicApp/>)
      fireEvent.click(await screen.findByRole('button',{name:'恢复本次作答／查看已完成回执'}))
      await screen.findByRole('radio',{name:'同意'})
      return v
    })()
    now=2100;fireEvent(window,new Event('pagehide'))
    expect(JSON.parse(sessionStorage.getItem(draftKey)!).itemTimings.scale.q1)
      .toMatchObject({activeTimeMs:2000,firstResponseMs:null,interrupted:true})
    view.unmount()
    now=10000;await openTask()
    now=11000;fireEvent.click(screen.getByRole('radio',{name:'同意'}));submit()
    await screen.findByText('感谢参与')
    expect(finalCalls[0].itemTimings).toMatchObject({scale:{q1:{
      firstResponseMs:3000,activeTimeMs:3000,interrupted:true,
    }}})
  })

  it('retains the exact sealed request through background events and a STARTED reload',async()=>{
    finalReply=()=>Promise.reject(new Error('结果未知'))
    const view=await openTask()
    now=1100;fireEvent.click(screen.getByRole('radio',{name:'同意'}));submit()
    await screen.findByRole('alert')
    const original=structuredClone(finalCalls[0])
    now=9000;fireEvent(window,new Event('pagehide'))
    const saved=JSON.parse(sessionStorage.getItem(draftKey)!)
    expect(saved.finalSubmission.submissionId).toBe(original.submissionId)
    expect(saved.itemTimings).toEqual(original.itemTimings)
    expect(JSON.stringify(saved)).not.toContain('accessCredential')
    view.unmount()
    now=10000;await openTask()
    expect(screen.getByRole('radio',{name:'不同意'})).toBeDisabled()
    finalReply=()=>response({status:'COMPLETED'})
    submit();await screen.findByText('感谢参与')
    expect(finalCalls[1]).toEqual(original)
    expect(sessionStorage.getItem(draftKey)).toBeNull()
  })
  it('reconciles an uncertain submission as completed on reload without another FINAL',async()=>{
    finalReply=()=>Promise.reject(new Error('结果未知'))
    const view=await openTask()
    now=1100;fireEvent.click(screen.getByRole('radio',{name:'同意'}));submit()
    await screen.findByRole('alert');view.unmount()
    taskValue={...taskValue,status:'COMPLETED'}
    render(<SurveyPublicApp/>)
    fireEvent.click(await screen.findByRole('button',{name:'恢复本次作答／查看已完成回执'}))
    await screen.findByText('感谢参与')
    expect(finalCalls).toHaveLength(1)
    expect(sessionStorage.getItem(draftKey)).toBeNull()
  })
  it('keeps legitimate answer edits before the first FINAL',async()=>{
    await openTask()
    now=1100;fireEvent.click(screen.getByRole('radio',{name:'同意'}))
    now=2100;fireEvent.click(screen.getByRole('radio',{name:'不同意'}));submit()
    await screen.findByText('感谢参与')
    expect(finalCalls[0].answers).toEqual({scale:{q1:'no'}})
    expect(finalCalls[0].itemTimings).toMatchObject({scale:{q1:{firstResponseMs:1000,activeTimeMs:2000,changeCount:1}}})
  })
  it('does not count hidden time twice across visibilitychange and pagehide',async()=>{
    await openTask()
    now=1100;fireEvent.click(screen.getByRole('radio',{name:'同意'}))
    const visibility=vi.spyOn(document,'visibilityState','get').mockReturnValue('hidden')
    now=2100;fireEvent(document,new Event('visibilitychange'))
    now=9000;fireEvent(window,new Event('pagehide'))
    expect(JSON.parse(sessionStorage.getItem(draftKey)!).itemTimings.scale.q1.activeTimeMs).toBe(2000)
    now=10000;visibility.mockReturnValue('visible');fireEvent(document,new Event('visibilitychange'))
    now=11000;submit();await screen.findByText('感谢参与')
    expect(finalCalls[0].itemTimings).toMatchObject({scale:{q1:{activeTimeMs:3000,interrupted:true}}})
  })

  it('makes the sealed retry reachable after a multi-tool reload resets navigation',async()=>{
    taskValue={...taskValue,units:[...taskValue.units,{...taskValue.units[0],instrumentKey:'second',title:'第二量表'}]}
    const view=render(<SurveyPublicApp/>)
    fireEvent.click(await screen.findByRole('button',{name:'恢复本次作答／查看已完成回执'}))
    fireEvent.click(await screen.findByRole('radio',{name:'同意'}))
    fireEvent.click(screen.getByRole('button',{name:'确认当前工具，继续'}))
    fireEvent.click(screen.getByRole('radio',{name:'不同意'}))
    finalReply=()=>Promise.reject(new Error('结果未知'))
    submit();await screen.findByRole('alert');view.unmount()
    const original=structuredClone(finalCalls[0])
    await openTask()
    expect(screen.getByRole('button',{name:'确认当前工具，继续'})).toBeDisabled()
    finalReply=()=>response({status:'COMPLETED'})
    submit();await screen.findByText('感谢参与')
    expect(finalCalls[1]).toEqual(original)
  })

  it('returns to linked waves and starts a different attempt without the previous seal',async()=>{
    linked=true
    render(<SurveyPublicApp/>)
    fireEvent.change(await screen.findByLabelText('研究编号'),{target:{value:'R-ABCDEFGH'}})
    fireEvent.change(screen.getByLabelText('私密恢复凭证'),{target:{value:'a'.repeat(43)}})
    fireEvent.click(screen.getByRole('button',{name:'读取我的波次任务'}))
    fireEvent.click(await screen.findByRole('button',{name:'选择本轮'}))
    fireEvent.click(screen.getByRole('checkbox',{name:/我已阅读并同意/}))
    fireEvent.click(screen.getByRole('button',{name:'开始或恢复本轮作答'}))
    fireEvent.click(await screen.findByRole('radio',{name:'同意'}));submit()
    await screen.findByText('感谢参与')
    const nextAttempt='33333333-3333-4333-8333-333333333333'
    linkedWaves=[{...linkedWaves[0],id:'wave2',ordinal:2,attempt:{id:nextAttempt,status:'STARTED'}}]
    taskValue={...taskValue,attemptId:nextAttempt,waveId:'wave2'}
    fireEvent.click(screen.getByRole('button',{name:'返回我的研究波次'}))
    fireEvent.click(await screen.findByRole('button',{name:'选择本轮'}))
    fireEvent.click(screen.getByRole('checkbox',{name:/我已阅读并同意/}))
    fireEvent.click(screen.getByRole('button',{name:'开始或恢复本轮作答'}))
    const choice=await screen.findByRole('radio',{name:'不同意'})
    await waitFor(()=>expect(choice).toBeEnabled())
    fireEvent.click(choice);submit();await screen.findByText('感谢参与')
    expect(finalCalls).toHaveLength(2)
    expect(finalCalls[1].submissionId).not.toBe(finalCalls[0].submissionId)
    expect(finalCalls[1].answers).toEqual({scale:{q1:'no'}})
  })

  it('clears the completed receipt state when linked future access is revoked',async()=>{
    linked=true
    vi.spyOn(window,'confirm').mockReturnValue(true)
    render(<SurveyPublicApp/>)
    fireEvent.change(await screen.findByLabelText('研究编号'),{target:{value:'R-ABCDEFGH'}})
    fireEvent.change(screen.getByLabelText('私密恢复凭证'),{target:{value:'a'.repeat(43)}})
    fireEvent.click(screen.getByRole('button',{name:'读取我的波次任务'}))
    fireEvent.click(await screen.findByRole('button',{name:'选择本轮'}))
    fireEvent.click(screen.getByRole('checkbox',{name:/我已阅读并同意/}))
    fireEvent.click(screen.getByRole('button',{name:'开始或恢复本轮作答'}))
    fireEvent.click(await screen.findByRole('radio',{name:'同意'}));submit()
    await screen.findByText('感谢参与')
    fireEvent.click(screen.getByRole('button',{name:'只撤销未来访问（保留研究数据）'}))
    await screen.findByText('访问已撤销；仍可申请撤回研究数据。')
    expect(screen.queryByRole('button',{name:'重试读取完成回执'})).toBeNull()
    expect(screen.queryByRole('heading',{name:'本轮回答已完成'})).toBeNull()
    expect(finalCalls).toHaveLength(1)
  })

  it('keeps the foreground clock running when beforeunload does not actually leave the page',async()=>{
    await openTask()
    now=1100;fireEvent.click(screen.getByRole('radio',{name:'同意'}))
    now=2100;fireEvent(window,new Event('beforeunload'))
    now=3100;submit();await screen.findByText('感谢参与')
    expect(finalCalls[0].itemTimings).toMatchObject({scale:{q1:{activeTimeMs:3000}}})
  })

})
