import {act,fireEvent,render,screen,waitFor} from '@testing-library/react'
import {afterEach,beforeEach,describe,expect,it,vi} from 'vitest'
import SurveyPublicApp from './SurveyPublicApp'
import {saveLocalSurveyDraft} from './local-answer-draft'
import * as formVisibility from './form-visibility'
import * as scaleTiming from './survey-scale-timing'
import * as cognitiveLocal from './survey-cognitive-local'
import * as localDraft from './local-answer-draft'

vi.mock('./SurveySituationalUnit',()=>({SurveySituationalUnit:({onCommitted}:{onCommitted:(receipt:unknown)=>void})=>
  <button type="button" onClick={()=>onCommitted({protocol:'SITUATIONAL_NATIVE_V1',attemptId:'44444444-4444-4444-8444-444444444444',submissionId:'55555555-5555-4555-8555-555555555555',payloadHash:'c'.repeat(64)})}>核实原生情境化保存回执</button>}))

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
const originalScrollIntoView=HTMLElement.prototype.scrollIntoView
let now=100
let finalCalls:Record<string,unknown>[]
let finalReply:(body:Record<string,unknown>)=>Promise<Response>
let generalReply:()=>Promise<Response>
let taskValue:typeof task
let taskOverrides:Record<string,unknown>
let linked:boolean
let linkedWaves:{id:string;title:string;ordinal:number;status:string;consentText:string;consentVersion:number;attempt:{id:string;status:string}}[]
async function openTask(){
  const view=render(<SurveyPublicApp/>)
  fireEvent.click(await screen.findByRole('button',{name:'恢复本次作答／查看已完成回执'}))
  await screen.findByRole('radio',{name:'同意'})
  await waitFor(()=>expect(screen.getByRole('button',{name:/^(提交本轮正式回答|重试原提交)$/})).toBeEnabled())
  return view
}
const submit=()=>fireEvent.click(screen.getByRole('button',{name:/^(提交本轮正式回答|重试原提交)$/}))
beforeEach(()=>{
  HTMLElement.prototype.scrollIntoView=vi.fn()
  sessionStorage.clear()
  window.history.replaceState(null,'',`/r/${publicId}`)
  sessionStorage.setItem(`huisurvey:v1:single:${publicId}`,JSON.stringify({
    attemptId,accessCredential:'a'.repeat(43),createdAt:Date.now(),
  }))
  now=100;finalCalls=[];taskValue=structuredClone(task);taskOverrides={};linked=false
  linkedWaves=[{id:'wave',title:'本轮',ordinal:1,status:'OPEN',consentText:'研究说明',consentVersion:1,attempt:{id:attemptId,status:'STARTED'}}]
  vi.spyOn(performance,'now').mockImplementation(()=>now)
  vi.spyOn(document,'hasFocus').mockReturnValue(true)
  finalReply=()=>response({status:'COMPLETED',completedAt:'2026-10-17T00:00:00Z'})
  generalReply=()=>response({kind:'GENERAL_ONLY',text:'感谢参与',disclaimer:'一般反馈',completedAt:'2026-10-17T00:00:00Z'})
  vi.stubGlobal('fetch',vi.fn((url:string,init?:RequestInit)=>{
    if(url.endsWith('/info'))return response({project:{name:'研究',description:'说明',collectionMode:linked?'LINKED_WAVES':'SINGLE_UNLINKED',status:'OPEN'},waves:[]})
    if(url.endsWith('/enter'))return response({waves:linkedWaves})
    if(url.endsWith('/revoke-access'))return response({status:'REVOKED'})
    if(url.endsWith('/task'))return response({...taskValue,...taskOverrides})
    if(url.endsWith('/final')){
      const body=JSON.parse(String(init?.body)) as Record<string,unknown>
      finalCalls.push(body);return finalReply(body)
    }
    if(url.endsWith('/general'))return generalReply()
    throw new Error('Unexpected route '+url)
  }))
})
afterEach(()=>{
  vi.restoreAllMocks();vi.unstubAllGlobals()
  if(originalScrollIntoView)HTMLElement.prototype.scrollIntoView=originalScrollIntoView
  else delete (HTMLElement.prototype as Partial<HTMLElement>).scrollIntoView
})

const receiptText='本次提交时确认的一般说明'
const firstSuccess=(overrides:Record<string,unknown>={})=>({
  attemptId,receiptId:'33333333-3333-4333-8333-333333333333',status:'COMPLETED',idempotent:false,
  completedAt:'2026-10-17T00:00:00Z',generalText:receiptText,
  generalReceipt:{text:receiptText,disclaimer:'本次提交的一般免责声明',completedAt:'2026-10-17T00:00:00Z'},
  ...overrides,
})
const generalCalls=()=>vi.mocked(fetch).mock.calls.filter(([url])=>String(url).endsWith('/general'))

describe('Survey first-success GENERAL receipt consumption',()=>{
  it('shows frozen instructions on the default one-by-one recovery path without adding an answer field',async()=>{
    taskOverrides={units:[{...task.units[0],instruction:'请依据本次施测时的实际情况回答。'}]}
    await openTask()
    expect(screen.getByRole('note')).toHaveTextContent('请依据本次施测时的实际情况回答。')
    expect(screen.getByRole('region',{name:'逐题施测：计时量表'})).toContainElement(screen.getByRole('note'))
    fireEvent.click(screen.getByRole('radio',{name:'同意'}));submit()
    await waitFor(()=>expect(finalCalls).toHaveLength(1))
    expect(finalCalls[0].answers).toEqual({scale:{q1:'yes'}})
  })

  it('blocks all-at-once image answers and FINAL until actual decode, and keeps restored choices through failure/retry',async()=>{
    const image={asset:{assetId:'stimulus',contentHash:'b'.repeat(64),mimeType:'image/png'},altText:'Required stimulus'}
    taskOverrides={units:[{...task.units[0],presentationMode:'ALL_AT_ONCE',items:[{...task.units[0].items[0],images:[image]}]}]}
    const originalFetch=fetch
    const create=URL.createObjectURL,revoke=URL.revokeObjectURL
    URL.createObjectURL=vi.fn().mockReturnValue('blob:stimulus');URL.revokeObjectURL=vi.fn()
    vi.stubGlobal('fetch',vi.fn((url:string,init?:RequestInit)=>url.endsWith('/images/stimulus')
      ?Promise.resolve(new Response(new Blob(['image'], { type: 'image/png' }), { status: 200, headers: { 'Content-Type': 'image/png' } }))
      :originalFetch(url,init)))
    try{
      render(<SurveyPublicApp/>)
      fireEvent.click(await screen.findByRole('button',{name:'恢复本次作答／查看已完成回执'}))
      const picture=await screen.findByAltText('Required stimulus')
      expect(screen.getByRole('radio',{name:'同意'})).toBeDisabled()
      expect(screen.getByRole('button',{name:'提交本轮正式回答'})).toBeDisabled()
      fireEvent.load(picture)
      fireEvent.click(screen.getByRole('radio',{name:'同意'}))
      fireEvent.error(picture)
      expect(screen.getByRole('radio',{name:'同意'})).toBeChecked()
      expect(screen.getByRole('radio',{name:'同意'})).toBeDisabled()
      expect(screen.getByRole('button',{name:'提交本轮正式回答'})).toBeDisabled()
      expect(finalCalls).toHaveLength(0)
      fireEvent.click(screen.getByRole('button',{name:'重试图片'}))
      fireEvent.load(await screen.findByAltText('Required stimulus'))
      expect(screen.getByRole('radio',{name:'同意'})).toBeChecked()
      expect(screen.getByRole('button',{name:'提交本轮正式回答'})).toBeEnabled()
      submit()
      await waitFor(()=>expect(finalCalls).toHaveLength(1))
    }finally{URL.createObjectURL=create;URL.revokeObjectURL=revoke}
  })
  it('renders the controlled first-success receipt without another HTTP request or persisting it',async()=>{
    finalReply=()=>response(firstSuccess())
    generalReply=()=>Promise.reject(new Error('First success must not read GENERAL'))
    await openTask()
    now=1100;fireEvent.click(screen.getByRole('radio',{name:'同意'}));submit()
    await screen.findByText(receiptText)
    expect(screen.getByText('本次提交的一般免责声明')).toBeInTheDocument()
    expect(screen.getByText(/完成时间：/)).toBeInTheDocument()
    expect(finalCalls).toHaveLength(1)
    expect(generalCalls()).toHaveLength(0)
    expect(screen.queryAllByRole('radio')).toHaveLength(0)
    expect(sessionStorage.getItem(draftKey)).toBeNull()
    expect(JSON.stringify(sessionStorage)).not.toContain(receiptText)
  })
  it.each([
    ['legacy server',{generalReceipt:undefined,idempotent:undefined}],
    ['idempotent response',{idempotent:true}],
    ['missing first-commit marker',{idempotent:undefined}],
    ['different attempt',{attemptId:'44444444-4444-4444-8444-444444444444'}],
    ['different completion time',{generalReceipt:{text:receiptText,disclaimer:'说明',completedAt:'2026-10-16T00:00:00Z'}}],
    ['missing disclaimer',{generalReceipt:{text:receiptText,completedAt:'2026-10-17T00:00:00Z'}}],
    ['invalid completion time',{completedAt:'invalid',generalReceipt:{text:receiptText,disclaimer:'说明',completedAt:'invalid'}}],
    ['uncontrolled result fields',{generalReceipt:{text:receiptText,disclaimer:'说明',completedAt:'2026-10-17T00:00:00Z',privateScoring:{score:99}}}],
  ])('uses current-authorized GENERAL for %s',async(_label,overrides)=>{
    finalReply=()=>response(firstSuccess(overrides as Record<string,unknown>))
    await openTask()
    fireEvent.click(screen.getByRole('radio',{name:'同意'}));submit()
    await screen.findByText('感谢参与')
    expect(screen.queryByText(receiptText)).toBeNull()
    expect(generalCalls()).toHaveLength(1)
    expect(finalCalls).toHaveLength(1)
  })
  it('reauthorizes GENERAL after an ambiguous retry even if that retry creates the first FINAL',async()=>{
    finalReply=()=>Promise.reject(new Error('结果未知'))
    await openTask()
    fireEvent.click(screen.getByRole('radio',{name:'同意'}));submit()
    await screen.findByRole('alert')
    finalReply=()=>response(firstSuccess())
    submit();await screen.findByText('感谢参与')
    expect(finalCalls[1]).toEqual(finalCalls[0])
    expect(generalCalls()).toHaveLength(1)
    expect(screen.queryByText(receiptText)).toBeNull()
  })
  it.each([400,403,409,503])('does not display receipt data from a rejected FINAL (%s)',async(status)=>{
    finalReply=()=>response(firstSuccess(),status,'本次提交被拒绝')
    await openTask()
    fireEvent.click(screen.getByRole('radio',{name:'同意'}));submit()
    await screen.findByText('本次提交被拒绝')
    expect(screen.queryByText(receiptText)).toBeNull()
    expect(screen.queryByRole('heading',{name:'本轮回答已完成'})).toBeNull()
    expect(generalCalls()).toHaveLength(0)
    expect(sessionStorage.getItem(draftKey)).not.toBeNull()
    if(status===400)expect(screen.getByRole('radio',{name:'不同意'})).toBeEnabled()
    else expect(screen.getByRole('radio',{name:'不同意'})).toBeDisabled()
  })
  it('clears the embedded receipt and recovery state on explicit withdrawal',async()=>{
    vi.spyOn(window,'confirm').mockReturnValue(true)
    const original=vi.mocked(fetch).getMockImplementation()!
    vi.mocked(fetch).mockImplementation((input,init)=>String(input).endsWith('/withdraw-data')
      ?response({status:'WITHDRAWN'}):original(input,init))
    finalReply=()=>response(firstSuccess())
    await openTask()
    fireEvent.click(screen.getByRole('radio',{name:'同意'}));submit()
    await screen.findByText(receiptText)
    expect(screen.queryByRole('button',{name:'申请撤回本研究数据（排除未来统计）'})).toBeNull()
    fireEvent.click(screen.getByText('参与与数据管理'))
    fireEvent.click(screen.getByRole('button',{name:'申请撤回本研究数据（排除未来统计）'}))
    await waitFor(()=>expect(screen.queryByText(receiptText)).toBeNull())
    expect(screen.queryByRole('heading',{name:'本轮回答已完成'})).toBeNull()
    expect(sessionStorage.getItem(`huisurvey:v1:single:${publicId}`)).toBeNull()
    expect(generalCalls()).toHaveLength(0)
    expect(finalCalls).toHaveLength(1)
  })
  it('reauthorizes GENERAL for a restored sealed retry instead of using its embedded receipt',async()=>{
    finalReply=()=>Promise.reject(new Error('结果未知'))
    const view=await openTask()
    fireEvent.click(screen.getByRole('radio',{name:'同意'}));submit()
    await screen.findByRole('alert');view.unmount()
    finalReply=()=>response(firstSuccess())
    await openTask()
    submit();await screen.findByText('感谢参与')
    expect(finalCalls[1]).toEqual(finalCalls[0])
    expect(generalCalls()).toHaveLength(1)
    expect(screen.queryByText(receiptText)).toBeNull()
  })
  it('does not reuse a first-success receipt after refresh when current GENERAL authorization is denied',async()=>{
    finalReply=()=>response(firstSuccess())
    const view=await openTask()
    fireEvent.click(screen.getByRole('radio',{name:'同意'}));submit()
    await screen.findByText(receiptText);view.unmount()
    taskValue={...taskValue,status:'COMPLETED'}
    generalReply=()=>response(null,403,'研究身份已失效')
    render(<SurveyPublicApp/>)
    fireEvent.click(await screen.findByRole('button',{name:'恢复本次作答／查看已完成回执'}))
    await screen.findByText('研究身份已失效')
    expect(screen.queryByText(receiptText)).toBeNull()
    expect(generalCalls()).toHaveLength(1)
    expect(finalCalls).toHaveLength(1)
    expect(screen.queryByRole('button',{name:'提交本轮正式回答'})).toBeNull()
  })
})

describe('Survey authoritative FINAL and timing lifecycle',()=>{
  it('returns to the exact earlier Flow Form after a validation rejection and permits correction',async()=>{
    const form=(instrumentKey:string,prompt:string)=>({kind:'FORM',instrumentKey,title:prompt,
      pages:[{pageKey:'page',title:prompt,questions:[{itemKey:'shared',type:'SHORT_TEXT',
        prompt,required:true,options:[],textValidation:'EMAIL'}]}]})
    taskOverrides={units:[form('first','第一份联系信息'),form('second','第二份联系信息')],
      flow:{schemaVersion:1,flowDigest:'b'.repeat(64),embeddedData:[],blocks:[
        {blockKey:'first_block',kind:'INSTRUMENT',instrumentKey:'first'},
        {blockKey:'second_block',kind:'INSTRUMENT',instrumentKey:'second'},
      ]}}
    render(<SurveyPublicApp/>)
    fireEvent.click(await screen.findByRole('button',{name:'恢复本次作答／查看已完成回执'}))
    fireEvent.change(await screen.findByLabelText('第一份联系信息'),{target:{value:'invalid'}})
    fireEvent.click(screen.getByRole('button',{name:'确认当前步骤，继续研究'}))
    fireEvent.change(screen.getByLabelText('第二份联系信息'),{target:{value:'second@example.test'}})
    finalReply=()=>response(null,400,'answers.first.shared：请填写有效电子邮件')
    submit();await screen.findByRole('alert')
    const first=await screen.findByLabelText('第一份联系信息')
    expect(first).toHaveValue('invalid')
    expect(first).toBeEnabled()
    expect(screen.queryByLabelText('第二份联系信息')).toBeNull()
    fireEvent.change(first,{target:{value:'first@example.test'}})
    fireEvent.click(screen.getByRole('button',{name:'确认当前步骤，继续研究'}))
    expect(screen.getByLabelText('第二份联系信息')).toHaveValue('second@example.test')
    finalReply=()=>response({status:'COMPLETED'})
    submit();await screen.findByText('感谢参与')
    expect(finalCalls).toHaveLength(2)
    expect(finalCalls[1].answers).toEqual({first:{shared:'first@example.test'},second:{shared:'second@example.test'}})
  })

  it('reveals the earlier Form when a sequential timed Wave rejects one of its answers',async()=>{
    taskOverrides={units:[{kind:'FORM',instrumentKey:'first',title:'先前问卷',
      pages:[{pageKey:'page',title:'信息页',questions:[{itemKey:'email',type:'SHORT_TEXT',
        prompt:'联系信息',required:true,options:[],textValidation:'EMAIL'}]}]},...task.units]}
    render(<SurveyPublicApp/>)
    fireEvent.click(await screen.findByRole('button',{name:'恢复本次作答／查看已完成回执'}))
    fireEvent.change(await screen.findByLabelText('联系信息'),{target:{value:'invalid'}})
    now=500;fireEvent.click(screen.getByRole('button',{name:'下一部分'}))
    now=1500;fireEvent.click(screen.getByRole('radio',{name:'同意'}))
    finalReply=()=>response(null,400,'answers.first.email：请填写有效电子邮件')
    now=2500;submit();await screen.findByRole('alert')
    expect(await screen.findByLabelText('联系信息')).toHaveValue('invalid')
    expect(screen.queryByRole('radio',{name:'同意'})).toBeNull()
    fireEvent.change(screen.getByLabelText('联系信息'),{target:{value:'correct@example.test'}})
    now=6500;fireEvent.click(screen.getByRole('button',{name:'下一部分'}))
    expect(screen.getByRole('radio',{name:'同意'})).toBeChecked()
    finalReply=()=>response({status:'COMPLETED'})
    now=7500;submit();await screen.findByText('感谢参与')
    expect(finalCalls[1].answers).toEqual({first:{email:'correct@example.test'},scale:{q1:'yes'}})
    expect(finalCalls[1].itemTimings).toMatchObject({scale:{q1:{
      firstResponseMs:1000,activeTimeMs:3000,changeCount:0,revisitCount:1,visits:2,
    }}})
  })

  it('never reopens server-frozen prerequisites after a definitive FINAL rejection',async()=>{
    taskOverrides={units:[{kind:'FORM',instrumentKey:'first',title:'前置问卷',
      pages:[{pageKey:'page',title:'信息页',questions:[{itemKey:'email',type:'SHORT_TEXT',
        prompt:'已锁定联系信息',required:true,options:[],textValidation:'EMAIL'}]}]},...task.units],
      lockedPriorAnswers:{first:{email:'server@example.test'}}}
    render(<SurveyPublicApp/>)
    fireEvent.click(await screen.findByRole('button',{name:'恢复本次作答／查看已完成回执'}))
    expect(await screen.findByLabelText('已锁定联系信息')).toBeDisabled()
    fireEvent.click(screen.getByRole('button',{name:'下一部分'}))
    fireEvent.click(await screen.findByRole('radio',{name:'同意'}))
    finalReply=()=>response(null,400,'answers.first.email：服务器拒绝')
    submit();await screen.findByRole('alert')
    expect(screen.queryByLabelText('已锁定联系信息')).toBeNull()
    expect(screen.getByRole('radio',{name:'同意'})).toBeChecked()
    expect(finalCalls[0].answers).toEqual({first:{email:'server@example.test'},scale:{q1:'yes'}})
  })

  it('reconciles a committed screen-out after a lost response and reload without replaying answers',async()=>{
    let screenOutCalls=0
    const original=vi.mocked(fetch).getMockImplementation()!
    vi.mocked(fetch).mockImplementation((input,init)=>{
      if(String(input).endsWith('/screen-out')){
        screenOutCalls++
        return Promise.reject(new Error('筛除结果未知'))
      }
      return original(input,init)
    })
    taskOverrides={units:[],flow:{schemaVersion:1,flowDigest:'b'.repeat(64),embeddedData:[],
      blocks:[{blockKey:'end',kind:'END',termination:'SCREEN_OUT'}]}}
    const view=render(<SurveyPublicApp/>)
    fireEvent.click(await screen.findByRole('button',{name:'恢复本次作答／查看已完成回执'}))
    fireEvent.click(await screen.findByRole('button',{name:'完成资格筛选'}))
    await screen.findByRole('alert')
    expect(JSON.parse(sessionStorage.getItem(draftKey)!).finalSubmission.screenOut).toBe(true)
    view.unmount()
    taskOverrides={status:'SCREENED_OUT',units:[]}
    render(<SurveyPublicApp/>)
    fireEvent.click(await screen.findByRole('button',{name:'恢复本次作答／查看已完成回执'}))
    await screen.findByRole('heading',{name:'本轮资格筛选已结束'})
    expect(sessionStorage.getItem(draftKey)).toBeNull()
    expect(sessionStorage.getItem(`huisurvey:v1:single:${publicId}`)).toBeNull()
    expect(screen.queryByRole('button',{name:'提交本轮正式回答'})).toBeNull()
    expect(screen.queryByRole('button',{name:'完成资格筛选'})).toBeNull()
    expect(screenOutCalls).toBe(1)
    expect(finalCalls).toHaveLength(0)
    expect(vi.mocked(fetch).mock.calls.filter(([url])=>String(url).endsWith('/general'))).toHaveLength(0)
  })


  it('dismisses the same-tab restored notice without changing recovered answers',async()=>{
    saveLocalSurveyDraft(publicId,attemptId,task.definitionDigest,{scale:{q1:'yes'}},{})
    await openTask()
    expect(screen.getByText('已恢复本标签页暂存的未提交答案。请复核后再提交。')).toBeInTheDocument()
    await waitFor(()=>expect(screen.queryByText('已恢复本标签页暂存的未提交答案。请复核后再提交。')).toBeNull(),{timeout:4500})
    expect(screen.getByRole('radio',{name:'同意'})).toBeChecked()
    expect(finalCalls).toHaveLength(0)
  })

  it('announces recovery while the task request is pending',async()=>{
    const originalFetch=fetch
    let resolve!:(value:Response)=>void
    vi.stubGlobal('fetch',vi.fn((url:string,init?:RequestInit)=>url.endsWith('/task')
      ?new Promise<Response>(done=>{resolve=done}):originalFetch(url,init)))
    render(<SurveyPublicApp/>)
    fireEvent.click(await screen.findByRole('button',{name:'恢复本次作答／查看已完成回执'}))
    expect(screen.getByRole('button',{name:'正在恢复…'})).toBeDisabled()
    expect(screen.getByText('正在恢复本次作答，请稍候…')).toHaveAttribute('aria-live','polite')
    await act(async()=>resolve(await response(taskValue)))
    await screen.findByRole('radio',{name:'同意'})
    expect(screen.queryByText('正在恢复本次作答，请稍候…')).toBeNull()
  })
  it('focuses the missing SJT question using the existing required rule',async()=>{
    taskOverrides={units:[{kind:'SJT',instrumentKey:'sjt',title:'情境工具',questions:[
      {questionKey:'choice',prompt:'请选择处理方式',required:true,options:[{optionKey:'yes',label:'同意'}]},
    ]},task.units[0]]}
    render(<SurveyPublicApp/>)
    fireEvent.click(await screen.findByRole('button',{name:'恢复本次作答／查看已完成回执'}))
    fireEvent.click(await screen.findByRole('button',{name:'下一部分'}))
    await waitFor(()=>expect(document.getElementById('survey-answer-sjt-choice')).toHaveFocus())
    expect(finalCalls).toHaveLength(0)
    fireEvent.click(screen.getByRole('radio',{name:'同意'}))
    fireEvent.click(screen.getByRole('button',{name:'下一部分'}))
    await waitFor(()=>expect(screen.getByRole('heading',{name:'填写问卷'})).toHaveFocus())
    expect(screen.queryByRole('button',{name:'上一部分'})).toBeNull()
    expect(screen.queryByText('请选择处理方式')).toBeNull()
  })
  it('returns to the first missing timed item without discarding other answers',async()=>{
    taskValue.units[0].items.push({itemKey:'q2',prompt:'第二题',required:true})
    saveLocalSurveyDraft(publicId,attemptId,taskValue.definitionDigest,{scale:{q2:'yes'}})
    await openTask()
    submit()
    await waitFor(()=>expect(document.getElementById('survey-answer-scale-q1')).toHaveFocus())
    expect(finalCalls).toHaveLength(0)
    fireEvent.click(screen.getByRole('button',{name:'题目导航'}))
    fireEvent.click(screen.getByRole('button',{name:'第 2 题，已作答'}))
    expect(screen.getByRole('radio',{name:'同意'})).toBeChecked()
  })
  it('keeps optional timed items optional when locating incomplete answers',async()=>{
    taskValue.units[0].items[0].required=false
    await openTask();submit()
    await screen.findByText('感谢参与')
    expect(finalCalls).toHaveLength(1)
  })
  it('prepares answers and timings only for the first FINAL, not its immutable retry',async()=>{
    const sanitize=vi.spyOn(formVisibility,'sanitizeFormAnswers')
    const seal=vi.spyOn(scaleTiming,'sealSurveyScaleTimings')
    taskOverrides={units:[task.units[0],{kind:'FORM',instrumentKey:'form',title:'补充表单',pages:[{
      pageKey:'page',title:'补充',questions:[{itemKey:'text',type:'SHORT_TEXT',prompt:'补充回答',required:false,options:[]}],
    }]}]}
    finalReply=()=>Promise.reject(new Error('结果未知'))
    render(<SurveyPublicApp/>)
    fireEvent.click(await screen.findByRole('button',{name:'恢复本次作答／查看已完成回执'}))
    fireEvent.click(await screen.findByRole('radio',{name:'同意'}))
    fireEvent.click(screen.getByRole('button',{name:'下一部分'}))
    fireEvent.change(screen.getByRole('textbox',{name:'补充回答'}),{target:{value:'保留原回答'}})
    sanitize.mockClear();seal.mockClear()
    submit();await screen.findByRole('alert')
    expect(sanitize).toHaveBeenCalledTimes(1)
    expect(seal).toHaveBeenCalledTimes(1)
    expect(finalCalls[0].answers).toEqual({scale:{q1:'yes'},form:{text:'保留原回答'}})
    expect(finalCalls[0].itemTimings).toHaveProperty('scale')
    sanitize.mockClear();seal.mockClear()
    now=9000;submit()
    await waitFor(()=>expect(finalCalls).toHaveLength(2))
    expect(sanitize).not.toHaveBeenCalled()
    expect(seal).not.toHaveBeenCalled()
    expect(finalCalls[1]).toEqual(finalCalls[0])
  })
  it('restores a completed projection without draft parsing, fresh submission identity, or duplicate cleanup',async()=>{
    const cleanup=vi.spyOn(cognitiveLocal,'clearSurveyCognitiveSessions')
    const restore=vi.spyOn(localDraft,'restoreLocalSurveyDraftEnvelope')
    const identity=vi.spyOn(crypto,'randomUUID')
    taskOverrides={status:'COMPLETED',units:[]}
    sessionStorage.setItem(draftKey,'invalid obsolete local draft')
    render(<SurveyPublicApp/>)
    fireEvent.click(await screen.findByRole('button',{name:'恢复本次作答／查看已完成回执'}))
    await screen.findByText('感谢参与')
    expect(cleanup).toHaveBeenCalledTimes(1)
    expect(cleanup).toHaveBeenCalledWith(publicId,attemptId,[],undefined)
    expect(restore).not.toHaveBeenCalled()
    expect(identity).not.toHaveBeenCalled()
    expect(sessionStorage.getItem(draftKey)).toBeNull()
    expect(generalCalls()).toHaveLength(1)
    expect(finalCalls).toHaveLength(0)
  })
  it('retries exact sealed answers and timing after an uncertain response',async()=>{
    finalReply=()=>Promise.reject(new Error('网络中断'))
    await openTask()
    now=1100;fireEvent.click(screen.getByRole('radio',{name:'同意'}));submit()
    await screen.findByRole('alert')
    expect(finalCalls).toHaveLength(1)
    expect(screen.getByRole('button',{name:'重试原提交'})).toBeEnabled()
    expect(screen.getByText(/本次答案已封存，尚未确认提交结果/)).toBeInTheDocument()
    now=9000
    submit()
    await waitFor(()=>expect(finalCalls).toHaveLength(2))
    expect(finalCalls[1]).toEqual(finalCalls[0])
    expect(screen.getByRole('radio',{name:'不同意'})).toBeDisabled()
  })
  it.each(['Failed to fetch','Load failed','NetworkError when attempting to fetch resource.'])(
    'explains native network failure %s while retaining the exact sealed retry',async nativeMessage=>{
      let calls=0
      finalReply=()=>++calls===1?Promise.reject(new TypeError(nativeMessage)):response(firstSuccess())
      await openTask()
      now=1100;fireEvent.click(screen.getByRole('radio',{name:'同意'}));submit()
      expect(await screen.findByRole('alert')).toHaveTextContent('网络连接未完成，服务器结果尚未确认。请检查网络，并按页面提示核对或重试。')
      expect(screen.getByRole('button',{name:'重试原提交'})).toBeEnabled()
      expect(screen.getByRole('radio',{name:'不同意'})).toBeDisabled()
      now=9000;submit()
      await screen.findByText('感谢参与')
      expect(finalCalls).toHaveLength(2)
      expect(finalCalls[1]).toEqual(finalCalls[0])
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
    fireEvent.click(screen.getByRole('button',{name:'重新查看'}))
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
    expect(screen.getByRole('button',{name:'正在提交…'})).toBeDisabled()
    expect(screen.getByText('正在提交，请勿刷新或重复操作…')).toHaveAttribute('role','status')
    fireEvent.submit(screen.getByRole('button',{name:'正在提交…'}).closest('form')!)
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
    expect(screen.getByRole('button',{name:'重新查看'})).toBeEnabled()
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
    fireEvent.click(screen.getByRole('button',{name:'下一部分'}))
    fireEvent.click(screen.getByRole('radio',{name:'不同意'}))
    finalReply=()=>Promise.reject(new Error('结果未知'))
    submit();await screen.findByRole('alert');view.unmount()
    const original=structuredClone(finalCalls[0])
    await openTask()
    expect(screen.getByRole('button',{name:'下一部分'})).toBeDisabled()
    finalReply=()=>response({status:'COMPLETED'})
    submit();await screen.findByText('感谢参与')
    expect(finalCalls[1]).toEqual(original)
  })

  it('returns to linked waves and starts a different attempt without the previous seal',async()=>{
    linked=true
    render(<SurveyPublicApp/>)
    fireEvent.click(await screen.findByText('使用旧编号和恢复凭证'))
    fireEvent.change(await screen.findByLabelText('研究编号'),{target:{value:'R-ABCDEFGH'}})
    fireEvent.change(screen.getByLabelText('私密恢复凭证'),{target:{value:'a'.repeat(43)}})
    fireEvent.click(screen.getByRole('button',{name:'读取我的波次任务'}))
    fireEvent.click(await screen.findByRole('button',{name:'查看参与说明'}))
    fireEvent.click(screen.getByRole('checkbox',{name:/我已阅读并同意/}))
    fireEvent.click(screen.getByRole('button',{name:'开始填写问卷'}))
    fireEvent.click(await screen.findByRole('radio',{name:'同意'}));submit()
    await screen.findByText('感谢参与')
    const nextAttempt='33333333-3333-4333-8333-333333333333'
    linkedWaves=[{...linkedWaves[0],id:'wave2',ordinal:2,attempt:{id:nextAttempt,status:'STARTED'}}]
    taskValue={...taskValue,attemptId:nextAttempt,waveId:'wave2'}
    fireEvent.click(screen.getByRole('button',{name:'返回我的研究波次'}))
    fireEvent.click(await screen.findByRole('button',{name:'查看参与说明'}))
    fireEvent.click(screen.getByRole('checkbox',{name:/我已阅读并同意/}))
    fireEvent.click(screen.getByRole('button',{name:'开始填写问卷'}))
    const choice=await screen.findByRole('radio',{name:'不同意'})
    await waitFor(()=>expect(choice).toBeEnabled())
    fireEvent.click(choice);submit();await screen.findByText('感谢参与')
    expect(finalCalls).toHaveLength(2)
    expect(finalCalls[1].submissionId).not.toBe(finalCalls[0].submissionId)
    expect(finalCalls[1].answers).toEqual({scale:{q1:'no'}})
  })

  it('clears the completed receipt state when linked future access is revoked',async()=>{
    finalReply=()=>response(firstSuccess({generalReceipt:{text:'感谢参与',disclaimer:'一般反馈',completedAt:'2026-10-17T00:00:00Z'}}))
    linked=true
    const confirm=vi.spyOn(window,'confirm').mockReturnValue(false)
    render(<SurveyPublicApp/>)
    fireEvent.click(await screen.findByText('使用旧编号和恢复凭证'))
    fireEvent.change(await screen.findByLabelText('研究编号'),{target:{value:'R-ABCDEFGH'}})
    fireEvent.change(screen.getByLabelText('私密恢复凭证'),{target:{value:'a'.repeat(43)}})
    fireEvent.click(screen.getByRole('button',{name:'读取我的波次任务'}))
    fireEvent.click(await screen.findByRole('button',{name:'查看参与说明'}))
    fireEvent.click(screen.getByRole('checkbox',{name:/我已阅读并同意/}))
    fireEvent.click(screen.getByRole('button',{name:'开始填写问卷'}))
    fireEvent.click(await screen.findByRole('radio',{name:'同意'}));submit()
    await screen.findByText('感谢参与')
    expect(screen.queryByRole('button',{name:'只撤销未来访问（保留研究数据）'})).toBeNull()
    fireEvent.click(screen.getByText('参与与数据管理'))
    fireEvent.click(screen.getByRole('button',{name:'只撤销未来访问（保留研究数据）'}))
    expect(confirm).toHaveBeenCalledOnce()
    expect(vi.mocked(fetch).mock.calls.filter(([url])=>String(url).endsWith('/revoke-access'))).toHaveLength(0)
    expect(screen.getByText('感谢参与')).toBeInTheDocument()
    confirm.mockReturnValue(true)
    fireEvent.click(screen.getByRole('button',{name:'只撤销未来访问（保留研究数据）'}))
    await screen.findByText('访问已撤销；仍可申请撤回研究数据。')
    expect(screen.queryByRole('button',{name:'重新查看'})).toBeNull()
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


describe('participant stored raw feedback display',()=>{
  it.each(['SCALE','SJT'])('renders /general %s raw metrics without milliseconds or pilot labeling',async family=>{
    taskValue={...taskValue,status:'COMPLETED'}
    generalReply=()=>response({kind:'DESCRIPTIVE',text:'感谢参与',disclaimer:'受控指标',completedAt:'2026-10-17T00:00:00Z',measurements:[{
      feedbackKind:'RAW_METRICS',instrumentKey:family.toLowerCase(),title:family+' 工具',measurementReleaseId:'release',quality:'interpretable',
      metrics:[{key:'total',label:'原始总分',value:7,unit:null,status:'OK'}],rawScoreFeedback:[{scoreKey:'total',rangeKey:'r',text:'服务器冻结匹配的区间说明'}],
    }]})
    render(<SurveyPublicApp/>);fireEvent.click(await screen.findByRole('button',{name:'恢复本次作答／查看已完成回执'}))
    expect(await screen.findByText('原始总分：7（OK）')).toBeInTheDocument()
    expect(screen.getByText('服务器冻结匹配的区间说明')).toBeInTheDocument()
    expect(screen.getByText(/受控原始指标 · 质量状态/)).toBeInTheDocument()
    expect(screen.queryByText(/7 ms|试点测量/)).toBeNull()
    expect(generalCalls()).toHaveLength(1)
  })
  it('preserves cognitive ratio percent, millisecond units and existing pilot labeling',async()=>{
    taskValue={...taskValue,status:'COMPLETED'}
    generalReply=()=>response({kind:'DESCRIPTIVE',text:'感谢参与',disclaimer:'认知说明',completedAt:'2026-10-17T00:00:00Z',measurements:[{
      instrumentKey:'cog',title:'认知工具',measurementDigest:'digest',maturity:'PILOT',quality:'limited',metrics:[
        {key:'hitRate',label:'命中率',value:.8,unit:'ratio',status:'OK'},
        {key:'goMedianRtMs',label:'反应时间',value:320,unit:'ms',status:'OK'},
      ],
    }]})
    render(<SurveyPublicApp/>);fireEvent.click(await screen.findByRole('button',{name:'恢复本次作答／查看已完成回执'}))
    expect(await screen.findByText('命中率：80.0%（OK）')).toBeInTheDocument()
    expect(screen.getByText('反应时间：320 ms（OK）')).toBeInTheDocument()
    expect(screen.getByText(/试点测量 · 质量状态：limited/)).toBeInTheDocument()
  })
})


it('fetches currently authorized raw feedback on first successful FINAL instead of the general receipt shortcut',async()=>{
  taskOverrides={reportMode:'DESCRIPTIVE'}
  finalReply=()=>response(firstSuccess())
  generalReply=()=>response({kind:'DESCRIPTIVE',text:'感谢参与',disclaimer:'受控指标',completedAt:'2026-10-17T00:00:00Z',measurements:[{
    feedbackKind:'RAW_METRICS',instrumentKey:'scale',title:'量表',measurementReleaseId:'release',quality:'interpretable',
    metrics:[{key:'total',label:'原始总分',value:7,unit:null,status:'OK'}],
  }]})
  await openTask();fireEvent.click(screen.getByRole('radio',{name:'同意'}));submit()
  expect(await screen.findByText('原始总分：7（OK）')).toBeInTheDocument()
  expect(generalCalls()).toHaveLength(1)
  expect(screen.queryByText(receiptText)).toBeNull()
})

it('keeps an unfinished native SJT mounted before a timed scale until its server receipt is verified',async()=>{
  taskOverrides={units:[{kind:'SJT',instrumentKey:'native',title:'分阶段情境化',executionProtocol:'SITUATIONAL_NATIVE_V1'},...task.units]}
  render(<SurveyPublicApp/>)
  fireEvent.click(await screen.findByRole('button',{name:'恢复本次作答／查看已完成回执'}))
  const accepted=await screen.findByRole('button',{name:'核实原生情境化保存回执'})
  const next=screen.getByRole('button',{name:/下一部分/})
  fireEvent.click(next)
  expect(screen.getByRole('button',{name:'核实原生情境化保存回执'})).toBeInTheDocument()
  expect(screen.queryByRole('radio',{name:'同意'})).toBeNull()
  fireEvent.click(accepted);fireEvent.click(next)
  fireEvent.click(await screen.findByRole('radio',{name:'同意'}));submit()
  await waitFor(()=>expect(finalCalls).toHaveLength(1))
  expect(finalCalls[0].situationalReferences).toEqual([{protocol:'SITUATIONAL_NATIVE_V1',attemptId:'44444444-4444-4444-8444-444444444444',submissionId:'55555555-5555-4555-8555-555555555555',payloadHash:'c'.repeat(64)}])
})

describe('first committed descriptive feedback receipt',()=>{
 const receipt=(pending=false)=>({...firstSuccess().generalReceipt,kind:'DESCRIPTIVE',pending,measurements:pending?[]:[{
  feedbackKind:'RAW_METRICS',instrumentKey:'scale',title:'量表',measurementReleaseId:'release',quality:'interpretable',
  metrics:[{key:'total',label:'原始总分',value:7,unit:null,status:'OK'}],
 }]})
 it('shows permitted first feedback without GET and reauthorizes after reopening',async()=>{
  taskOverrides={reportMode:'DESCRIPTIVE'};finalReply=()=>response(firstSuccess({participantFeedbackReceipt:receipt()}))
  const view=await openTask();fireEvent.click(screen.getByRole('radio',{name:'同意'}));submit()
  expect(await screen.findByText('原始总分：7（OK）')).toBeInTheDocument();expect(generalCalls()).toHaveLength(0)
  expect(JSON.stringify(sessionStorage)).not.toContain('原始总分')
  view.unmount();taskValue={...taskValue,status:'COMPLETED'};generalReply=()=>response(null,403,'研究身份已失效')
  render(<SurveyPublicApp/>);fireEvent.click(await screen.findByRole('button',{name:'恢复本次作答／查看已完成回执'}))
  await screen.findByText('研究身份已失效');expect(screen.queryByText('原始总分：7（OK）')).toBeNull();expect(generalCalls()).toHaveLength(1)
 })
 it('keeps deferred feedback pending rather than loading hidden metrics',async()=>{
  taskOverrides={reportMode:'DESCRIPTIVE'};finalReply=()=>response(firstSuccess({participantFeedbackReceipt:receipt(true)}))
  await openTask();fireEvent.click(screen.getByRole('radio',{name:'同意'}));submit()
  await screen.findByText(receiptText);expect(generalCalls()).toHaveLength(0);expect(screen.queryByText(/原始总分/)).toBeNull()
 })
 it('falls back to the authorized reader for malformed inline metric values',async()=>{
  taskOverrides={reportMode:'DESCRIPTIVE'};const bad=receipt();(bad.measurements[0].metrics[0] as any).value='not-a-number'
  finalReply=()=>response(firstSuccess({participantFeedbackReceipt:bad}))
  await openTask();fireEvent.click(screen.getByRole('radio',{name:'同意'}));submit()
  await screen.findByText('感谢参与');expect(generalCalls()).toHaveLength(1);expect(screen.queryByText(/not-a-number/)).toBeNull()
 })
})
