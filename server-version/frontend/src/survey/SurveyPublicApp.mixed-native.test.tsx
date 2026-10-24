import type { ComponentProps } from 'react'
import { fireEvent,render,screen,waitFor } from '@testing-library/react'
import { afterEach,beforeEach,describe,expect,it,vi } from 'vitest'
import SurveyPublicApp from './SurveyPublicApp'
import type { SurveyCognitiveUnit } from './SurveyCognitiveUnit'
import type { SurveyCognitiveReference,SurveyCognitiveSessionInfo } from './survey-cognitive-api'
import type { SurveySituationalReference } from './survey-situational-api'
import { saveLocalSurveyDraft } from './local-answer-draft'

type CognitiveProps=ComponentProps<typeof SurveyCognitiveUnit>
const harness=vi.hoisted(()=>({cognitive:null as CognitiveProps|null}))
vi.mock('./survey-cognitive-local',()=>({rememberSurveyCognitiveSession:vi.fn(),clearSurveyCognitiveSessions:vi.fn().mockResolvedValue(true)}))
vi.mock('./survey-situational-local',()=>({rememberSurveySituationalSession:vi.fn(),clearSurveySituationalSessions:vi.fn().mockResolvedValue(true)}))
vi.mock('./SurveyCognitiveUnit',()=>({SurveyCognitiveUnit:(props:CognitiveProps)=>{
  harness.cognitive=props
  return <section aria-label="认知测试替身">
    <button type="button" onClick={()=>{props.onStarted(cognitiveSession);props.onRunningChange(true)}}>模拟开始认知</button>
    <button type="button" onClick={()=>props.onCommitted(cognitiveReference)}>模拟认知保存回执</button>
  </section>
}}))
// Keep the real native host adapter: a runner callback alone must not open the parent gate.
vi.mock('../modules/situational/pages/SituationalRunner',()=>({default:({host}:{host:{onCompleted:()=>void}})=>
  <button type="button" onClick={host.onCompleted}>模拟原生情境完成回调</button>}))

const publicId='11111111-1111-4111-8111-111111111111'
const attemptId='22222222-2222-4222-8222-222222222222'
const draftKey=`huisurvey:v1:unfinished:${publicId}:${attemptId}`
const singleKey=`huisurvey:v1:single:${publicId}`
const cognitiveReference:SurveyCognitiveReference={slotKey:'cog',epoch:1,
  resultId:'33333333-3333-4333-8333-333333333333',resultHash:'b'.repeat(64),measurementDigest:'c'.repeat(64)}
const cognitiveSession:SurveyCognitiveSessionInfo={slotKey:'cog',sessionId:'cognitive-session',status:'IN_PROGRESS',epoch:1}
const nativeReference:SurveySituationalReference={protocol:'SITUATIONAL_NATIVE_V1',
  attemptId:'44444444-4444-4444-8444-444444444444',submissionId:'55555555-5555-4555-8555-555555555555',payloadHash:'d'.repeat(64)}
const ordinaryAnswers={form:{q:'yes'},scale:{s:'yes'}}
type Order='native first'|'cognitive first'
const orders:Order[]=['native first','cognitive first']
function makeTask(order:Order,recovered=false){
  const native={kind:'SJT',instrumentKey:'staged',title:'原生情境任务',executionProtocol:'SITUATIONAL_NATIVE_V1'}
  const cognitive={kind:'COGNITIVE',instrumentKey:'cog',title:'认知任务'}
  return {attemptId,waveId:'wave',status:'STARTED',definitionDigest:'a'.repeat(64),reportMode:'GENERAL_ONLY',
    units:[
      {kind:'FORM',instrumentKey:'form',title:'背景表单',pages:[{pageKey:'page',title:'背景',questions:[{
        itemKey:'q',type:'SINGLE',prompt:'选择背景',required:true,options:[{optionKey:'yes',label:'背景符合'},{optionKey:'no',label:'背景不符合'}],
      }]}]},
      // ALL_AT_ONCE intentionally leaves COGNITIVE as the sole sequential-layout trigger.
      {kind:'SCALE',instrumentKey:'scale',title:'前置量表',presentationMode:'ALL_AT_ONCE',
        items:[{itemKey:'s',prompt:'选择量表回答',required:true}],responseOptions:[{optionKey:'yes',label:'量表符合'},{optionKey:'no',label:'量表不符合'}]},
      ...(order==='native first'?[native,cognitive]:[cognitive,native]),
    ],
    ...(recovered?{lockedPriorAnswers:ordinaryAnswers,cognitiveSessions:[{...cognitiveSession,status:'COMPLETED',resultReference:cognitiveReference}]}:{}),
  }
}
const response=(data:unknown)=>Promise.resolve({ok:true,status:200,json:async()=>({code:0,message:'ok',data})} as Response)
const originalScrollIntoView=HTMLElement.prototype.scrollIntoView
let task:ReturnType<typeof makeTask>,finals:Record<string,unknown>[],nativePaths:string[]
let nativeAccepted:boolean,failFirstFinal:boolean,currentCredential:string
beforeEach(()=>{
  HTMLElement.prototype.scrollIntoView=vi.fn()
  vi.clearAllMocks();sessionStorage.clear();window.history.replaceState(null,'',`/r/${publicId}`)
  harness.cognitive=null;finals=[];nativePaths=[];nativeAccepted=false;failFirstFinal=false;currentCredential='a'.repeat(43)
  task=makeTask('native first')
  sessionStorage.setItem(singleKey,JSON.stringify({attemptId,accessCredential:currentCredential,createdAt:Date.now()}))
  vi.stubGlobal('fetch',vi.fn((url:string,init?:RequestInit)=>{
    if(url.endsWith('/info'))return response({project:{name:'混合静态研究',description:'说明',collectionMode:'SINGLE_UNLINKED',status:'OPEN'},waves:[]})
    if(url.endsWith('/task'))return response(task)
    if(url.includes('/situational/staged/')){
      nativePaths.push(url.split('/situational/staged/')[1])
      expect(init).toMatchObject({method:'POST',credentials:'omit',cache:'no-store'})
      expect(JSON.parse(String(init?.body))).toEqual({accessCredential:currentCredential})
      expect(url).not.toContain(currentCredential)
      return response({attempt:{id:nativeReference.attemptId,status:nativeAccepted?'COMPLETED':'IN_PROGRESS'},
        ...(nativeAccepted?{receipt:nativeReference}:{})})
    }
    if(url.endsWith('/final')){
      finals.push(JSON.parse(String(init?.body)))
      if(failFirstFinal&&finals.length===1)return Promise.reject(new Error('整轮提交结果尚不确定'))
      return response({attemptId,status:'COMPLETED',idempotent:false,receiptId:'receipt',completedAt:'2026-10-24T00:00:00Z',
        generalReceipt:{text:'混合研究可信回执',disclaimer:'一般说明',completedAt:'2026-10-24T00:00:00Z'}})
    }
    if(url.endsWith('/general'))return response({kind:'GENERAL_ONLY',text:'混合研究可信回执',disclaimer:'一般说明',completedAt:'2026-10-24T00:00:00Z'})
    throw new Error('Unexpected '+url)
  }))
})
afterEach(()=>{
  vi.unstubAllGlobals();vi.restoreAllMocks()
  if(originalScrollIntoView)HTMLElement.prototype.scrollIntoView=originalScrollIntoView
  else delete (HTMLElement.prototype as Partial<HTMLElement>).scrollIntoView
})
async function openTask(){
  const view=render(<SurveyPublicApp/>)
  fireEvent.click(await screen.findByRole('button',{name:'恢复本次作答／查看已完成回执'}))
  await screen.findByRole('radio',{name:'背景符合'})
  return view
}
function advance(){fireEvent.click(screen.getByRole('button',{name:'下一部分'}))}
async function passOrdinaryPrefix(recovered=false){
  expect(screen.queryByRole('radio',{name:'量表符合'})).toBeNull()
  expect(screen.queryByRole('button',{name:'模拟开始认知'})).toBeNull()
  expect(nativePaths).toEqual([])
  if(recovered){
    expect(screen.getByRole('radio',{name:'背景符合'})).toBeChecked()
    expect(screen.getByRole('radio',{name:'背景不符合'})).toBeDisabled()
  }else{
    advance();expect(screen.getByRole('alert')).toHaveTextContent('请完成当前工具的必答内容和全部页')
    fireEvent.click(screen.getByRole('radio',{name:'背景符合'}))
  }
  advance()
  const scale=await screen.findByRole('radio',{name:'量表符合'})
  expect(screen.queryByRole('radio',{name:'背景符合'})).toBeNull()
  if(recovered){expect(scale).toBeChecked();expect(screen.getByRole('radio',{name:'量表不符合'})).toBeDisabled()}
  else fireEvent.click(scale)
  advance()
}
async function completeCognitive(){
  const start=await screen.findByRole('button',{name:'模拟开始认知'})
  expect(harness.cognitive?.priorAnswers).toEqual(ordinaryAnswers)
  fireEvent.click(start)
  const next=screen.queryByRole('button',{name:'下一部分'})
  if(next)expect(next).toBeDisabled()
  expect(screen.queryByRole('button',{name:'提交本轮正式回答'})).toBeNull()
  fireEvent(window,new Event('beforeunload'))
  // The no-canonical onStarted fallback must never add native {} to ordinary locks/answers.
  expect(JSON.parse(sessionStorage.getItem(draftKey)!).answers).toEqual(ordinaryAnswers)
  fireEvent.click(screen.getByRole('button',{name:'模拟认知保存回执'}))
  fireEvent.click(screen.getByRole('button',{name:'模拟认知保存回执'}))
  expect(finals).toHaveLength(0)
}
async function completeNative(){
  const callback=await screen.findByRole('button',{name:'模拟原生情境完成回调'})
  fireEvent.submit(callback.closest('form')!)
  expect(finals).toHaveLength(0)
  fireEvent.click(callback)
  await screen.findByText('尚未核实正式保存回执，请重试读取')
  expect(screen.queryByText(/情境化作答已可靠保存/)).toBeNull()
  if(screen.queryByRole('button',{name:'下一部分'})){
    advance()
    expect(screen.getByRole('button',{name:'模拟原生情境完成回调'})).toBeInTheDocument()
  }else expect(screen.getByRole('button',{name:'提交本轮正式回答'})).toBeDisabled()
  expect(finals).toHaveLength(0)
  nativeAccepted=true
  fireEvent.click(screen.getByRole('button',{name:'重试读取任务'}))
  await screen.findByText(/情境化作答已可靠保存/)
  expect(nativePaths).toEqual(['start',`${nativeReference.attemptId}/read`,'start'])
}
function expectExactReferences(body:Record<string,unknown>){
  expect(body.answers).toEqual({...ordinaryAnswers,staged:{},cog:{}})
  expect(body.cognitiveReferences).toEqual([cognitiveReference])
  expect(body.situationalReferences).toEqual([nativeReference])
  expect(body).not.toHaveProperty('presentation')
}

describe('Survey static mixed native SJT and cognitive parent boundary',()=>{
  it.each(orders)('gates %s, preserves ordinary prefixes and retries both sealed receipts with current credentials',async(order)=>{
    task=makeTask(order);failFirstFinal=true
    const view=await openTask();await passOrdinaryPrefix()
    if(order==='native first'){
      expect(screen.queryByRole('button',{name:'模拟开始认知'})).toBeNull()
      await completeNative();advance();await completeCognitive()
    }else{
      await completeCognitive();expect(nativePaths).toEqual([])
      advance();await completeNative()
    }
    expect(screen.queryByRole('button',{name:'上一部分'})).toBeNull()
    expect(screen.getByRole('button',{name:'提交本轮正式回答'})).toBeEnabled()
    fireEvent.click(screen.getByRole('button',{name:'提交本轮正式回答'}))
    await screen.findByText('整轮提交结果尚不确定')
    expect(finals).toHaveLength(1);expectExactReferences(finals[0])
    const saved=JSON.parse(sessionStorage.getItem(draftKey)!)
    expect(saved.finalSubmission.cognitiveReferences).toEqual([cognitiveReference])
    expect(saved.finalSubmission.situationalReferences).toEqual([nativeReference])
    expect(saved.finalSubmission).not.toHaveProperty('accessCredential')
    view.unmount()
    currentCredential='z'.repeat(43)
    sessionStorage.setItem(singleKey,JSON.stringify({attemptId,accessCredential:currentCredential,createdAt:Date.now()}))
    await openTask()
    await waitFor(()=>expect(screen.getByRole('button',{name:'重试原提交'})).toBeEnabled())
    fireEvent.click(screen.getByRole('button',{name:'重试原提交'}))
    await screen.findByText('感谢参与，问卷已提交')
    expect(finals).toHaveLength(2)
    expect(finals[1]).toEqual({...finals[0],accessCredential:currentCredential})
    expectExactReferences(finals[1]);expect(sessionStorage.getItem(draftKey)).toBeNull()
  })

  it.each(orders)('recovers %s from authorized cognitive metadata and a reread native receipt',async(order)=>{
    task=makeTask(order,true);nativeAccepted=true
    saveLocalSurveyDraft(publicId,attemptId,task.definitionDigest,{form:{q:'no'},scale:{s:'no'}})
    await openTask();await passOrdinaryPrefix(true)
    if(order==='native first'){
      await screen.findByText(/情境化作答已可靠保存/);advance()
      await screen.findByRole('button',{name:'模拟开始认知'})
    }else{
      await screen.findByRole('button',{name:'模拟开始认知'})
      expect(nativePaths).toEqual([]);advance()
      await screen.findByText(/情境化作答已可靠保存/)
    }
    expect(harness.cognitive?.priorAnswers).toEqual(ordinaryAnswers)
    expect(harness.cognitive?.existing).toEqual({...cognitiveSession,status:'COMPLETED',resultReference:cognitiveReference})
    expect(nativePaths).toEqual(['start'])
    expect(screen.queryByRole('button',{name:'模拟原生情境完成回调'})).toBeNull()
    fireEvent.click(screen.getByRole('button',{name:'提交本轮正式回答'}))
    await screen.findByText('感谢参与，问卷已提交')
    expect(finals).toHaveLength(1);expectExactReferences(finals[0])
  })
})
