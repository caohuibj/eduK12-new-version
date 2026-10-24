import { fireEvent,render,screen,waitFor } from '@testing-library/react'
import { afterEach,beforeEach,describe,expect,it,vi } from 'vitest'
import SurveyPublicApp from './SurveyPublicApp'
import { saveLocalSurveyDraft } from './local-answer-draft'
import type { SurveySituationalReference } from './survey-situational-api'
import type { PublicFlow } from './flow.client'

vi.mock('./survey-cognitive-local',()=>({rememberSurveyCognitiveSession:vi.fn(),clearSurveyCognitiveSessions:vi.fn().mockResolvedValue(true)}))
vi.mock('./survey-situational-local',()=>({rememberSurveySituationalSession:vi.fn(),clearSurveySituationalSessions:vi.fn().mockResolvedValue(true)}))
// Only the shared runner is replaced; the native host must perform its real start/read handshake.
vi.mock('../modules/situational/pages/SituationalRunner',()=>({default:({host}:{host:{compositeItemId:string;onCompleted:()=>void}})=>
  <button type="button" onClick={host.onCompleted}>完成 {host.compositeItemId} 共享任务</button>}))

const publicId='11111111-1111-4111-8111-111111111111'
const attemptId='22222222-2222-4222-8222-222222222222'
const credential='p'.repeat(43)
type Route='a'|'b'
const routes:Route[]=['a','b']
const answers=(route:Route)=>({form:{route}})
const receipts:Record<Route,SurveySituationalReference>={
  a:{protocol:'SITUATIONAL_NATIVE_V1',attemptId:'33333333-3333-4333-8333-333333333333',submissionId:'44444444-4444-4444-8444-444444444444',payloadHash:'a'.repeat(64)},
  b:{protocol:'SITUATIONAL_NATIVE_V1',attemptId:'55555555-5555-4555-8555-555555555555',submissionId:'66666666-6666-4666-8666-666666666666',payloadHash:'b'.repeat(64)},
}
function makeTask(){return {attemptId,waveId:'wave',status:'STARTED',definitionDigest:'c'.repeat(64),reportMode:'GENERAL_ONLY',
  lockedPriorAnswers:undefined as Record<string,Record<string,unknown>>|undefined,
  units:[
    {kind:'FORM',instrumentKey:'form',title:'选择任务',pages:[{pageKey:'route_page',title:'任务选择',questions:[{
      itemKey:'route',type:'SINGLE',prompt:'选择本次路径',required:true,
      options:[{optionKey:'a',label:'路径 A'},{optionKey:'b',label:'路径 B'}],
    }]}]},
    ...routes.map(route=>({kind:'SJT',instrumentKey:`native_${route}`,title:`原生任务 ${route.toUpperCase()}`,executionProtocol:'SITUATIONAL_NATIVE_V1'})),
  ],
  flow:{schemaVersion:1,flowDigest:'d'.repeat(64),embeddedData:[],blocks:[
    {blockKey:'form_block',kind:'INSTRUMENT',instrumentKey:'form'},
    ...routes.map(route=>({blockKey:`native_${route}_block`,kind:'INSTRUMENT',instrumentKey:`native_${route}`,
      when:{field:{source:'ANSWER',instrumentKey:'form',itemKey:'route'},op:'EQUALS',value:route}})),
  ]} as PublicFlow,
}}
const reply=(data:unknown)=>Promise.resolve({ok:true,status:200,json:async()=>({code:0,message:'ok',data})} as Response)
const originalScrollIntoView=HTMLElement.prototype.scrollIntoView
let task:ReturnType<typeof makeTask>,recovered:boolean,canonicalOverride:Record<string,Record<string,unknown>>|undefined
let starts:{route:Route;body:Record<string,unknown>}[],reads:Route[],finals:Record<string,unknown>[]
let screenOuts:Record<string,unknown>[]
beforeEach(()=>{
  HTMLElement.prototype.scrollIntoView=vi.fn();vi.clearAllMocks()
  sessionStorage.clear();window.history.replaceState(null,'',`/r/${publicId}`)
  sessionStorage.setItem(`huisurvey:v1:single:${publicId}`,JSON.stringify({attemptId,accessCredential:credential,createdAt:Date.now()}))
  task=makeTask();recovered=false;canonicalOverride=undefined;starts=[];reads=[];finals=[];screenOuts=[]
  vi.stubGlobal('fetch',vi.fn((url:string,init?:RequestInit)=>{
    if(url.endsWith('/info'))return reply({project:{name:'条件情境研究',description:'说明',collectionMode:'SINGLE_UNLINKED',status:'OPEN'},waves:[]})
    if(url.endsWith('/task'))return reply(task)
    const native=url.match(/\/situational\/native_([ab])\/(.*)$/)
    if(native){
      const route=native[1] as Route,body=JSON.parse(String(init?.body)) as Record<string,unknown>
      expect(init).toMatchObject({method:'POST',credentials:'omit',cache:'no-store'})
      expect(url).not.toContain(credential)
      if(native[2]==='start'){
        starts.push({route,body})
        return reply({attempt:{id:receipts[route].attemptId,status:recovered?'COMPLETED':'IN_PROGRESS'},
          lockedPriorAnswers:canonicalOverride??answers(route),...(recovered?{receipt:receipts[route]}:{})})
      }
      if(native[2]===`${receipts[route].attemptId}/read`){
        reads.push(route)
        expect(body).toEqual({accessCredential:credential})
        return reply({attempt:{id:receipts[route].attemptId,status:'COMPLETED'},receipt:receipts[route]})
      }
      throw new Error('Unexpected native route '+url)
    }
    if(url.endsWith('/screen-out')){
      screenOuts.push(JSON.parse(String(init?.body)))
      return reply({attemptId,status:'SCREENED_OUT'})
    }
    if(url.endsWith('/final')){
      finals.push(JSON.parse(String(init?.body)))
      return reply({attemptId,status:'COMPLETED',receiptId:'receipt',idempotent:false,completedAt:'2026-10-24T00:00:00Z',
        generalReceipt:{text:'条件研究已保存',disclaimer:'一般说明',completedAt:'2026-10-24T00:00:00Z'}})
    }
    throw new Error('Unexpected '+url)
  }))
})
afterEach(()=>{
  vi.unstubAllGlobals();vi.restoreAllMocks()
  if(originalScrollIntoView)HTMLElement.prototype.scrollIntoView=originalScrollIntoView
  else delete (HTMLElement.prototype as Partial<HTMLElement>).scrollIntoView
})
async function openTask(){
  render(<SurveyPublicApp/>)
  fireEvent.click(await screen.findByRole('button',{name:'恢复本次作答／查看已完成回执'}))
  await screen.findByRole('radio',{name:'路径 A'})
}
const advance=()=>fireEvent.click(screen.getByRole('button',{name:'确认当前步骤，继续研究'}))
const final=()=>fireEvent.click(screen.getByRole('button',{name:'提交本轮正式回答'}))
function expectSelectedOnly(route:Route){
  expect(starts).toEqual([{route,body:{accessCredential:credential,priorAnswers:answers(route)}}])
  expect(finals).toHaveLength(1)
  expect(finals[0]).toMatchObject({accessCredential:credential,answers:{...answers(route),[`native_${route}`]:{}},
    situationalReferences:[receipts[route]],presentation:{shownBlocks:['form_block',`native_${route}_block`]}})
  expect(Object.keys(finals[0].answers as object).sort()).toEqual(['form',`native_${route}`])
  expect(finals[0]).not.toHaveProperty('cognitiveReferences')
}

describe('Survey native SJT in ordinary conditional Flow',()=>{
  it.each(routes)('starts only path %s, locks its form prefix without remounting and submits only its verified receipt',async(route)=>{
    await openTask()
    expect(starts).toEqual([])
    fireEvent.click(screen.getByRole('radio',{name:`路径 ${route.toUpperCase()}`}));advance()
    const complete=await screen.findByRole('button',{name:`完成 native_${route} 共享任务`})
    expect(screen.queryByRole('radio',{name:'路径 A'})).toBeNull()
    expect(screen.queryByRole('button',{name:'确认当前步骤，继续研究'})).toBeNull()
    final();expect(finals).toHaveLength(0)
    expect(screen.getByText('请先完成情境化任务并核实保存回执')).toBeInTheDocument()
    fireEvent.click(complete)
    await screen.findByText(/情境化作答已可靠保存/)
    expect(reads).toEqual([route])
    // Server-lock and receipt callbacks both rerender the parent, but cannot rerun /start.
    expect(starts).toHaveLength(1)
    final();await screen.findByText('感谢参与，问卷已提交')
    expectSelectedOnly(route)
  })

  it.each(routes)('recovers locked path %s from task metadata without creating the unselected native child',async(route)=>{
    recovered=true;task.lockedPriorAnswers=answers(route)
    // One case starts without a browser draft; the other proves stale local answers lose to server locks.
    if(route==='b')saveLocalSurveyDraft(publicId,attemptId,task.definitionDigest,answers('a'))
    await openTask()
    expect(screen.getByRole('radio',{name:`路径 ${route.toUpperCase()}`})).toBeChecked()
    expect(screen.getByRole('radio',{name:'路径 A'})).toBeDisabled()
    expect(screen.getByRole('radio',{name:'路径 B'})).toBeDisabled()
    expect(starts).toEqual([]);advance()
    await screen.findByText(/情境化作答已可靠保存/)
    expect(screen.queryByRole('button',{name:/共享任务/})).toBeNull()
    expect(reads).toEqual([])
    final();await screen.findByText('感谢参与，问卷已提交')
    expectSelectedOnly(route)
  })

  it('rejects a later canonical conflict instead of replacing an existing server-locked route',async()=>{
    task.lockedPriorAnswers=answers('a');canonicalOverride=answers('b')
    await openTask();advance()
    await screen.findByText('服务器已锁定的前置答案不一致，请重新读取任务')
    expect(screen.queryByRole('button',{name:/共享任务/})).toBeNull()
    expect(screen.getByRole('region',{name:'原生任务 A'})).toBeInTheDocument()
    expect(screen.queryByRole('region',{name:'原生任务 B'})).toBeNull()
    expect(starts).toEqual([{route:'a',body:{accessCredential:credential,priorAnswers:answers('a')}}])
    final();expect(finals).toHaveLength(0)
    fireEvent(window,new Event('beforeunload'))
    await waitFor(()=>expect(JSON.parse(sessionStorage.getItem(`huisurvey:v1:unfinished:${publicId}:${attemptId}`)!).answers).toEqual(answers('a')))
  })

  it('submits only the reached native receipt at COMPLETE_EARLY without mounting the trailing native unit',async()=>{
    task.flow.blocks=[task.flow.blocks[0],task.flow.blocks[1],
      {blockKey:'early_end',kind:'END',termination:'COMPLETE_EARLY',title:'提前完成'},
      {blockKey:'unreached_native',kind:'INSTRUMENT',instrumentKey:'native_b'}]
    await openTask()
    fireEvent.click(screen.getByRole('radio',{name:'路径 A'}));advance()
    const complete=await screen.findByRole('button',{name:'完成 native_a 共享任务'})
    advance()
    expect(screen.queryByRole('heading',{name:'提前完成'})).toBeNull()
    expect(finals).toEqual([])
    fireEvent.click(complete);await screen.findByText(/情境化作答已可靠保存/);advance()
    expect(screen.getByRole('heading',{name:'提前完成'})).toBeInTheDocument()
    expect(screen.getByText(/后续研究工具无需作答/)).toBeInTheDocument()
    expect(screen.queryByRole('button',{name:'完成 native_b 共享任务'})).toBeNull()
    final();await screen.findByText('感谢参与，问卷已提交')
    expect(starts).toEqual([{route:'a',body:{accessCredential:credential,priorAnswers:answers('a')}}])
    expect(reads).toEqual(['a']);expect(screenOuts).toEqual([])
    expect(finals).toHaveLength(1)
    expect(finals[0].answers).toEqual({...answers('a'),native_a:{}})
    expect(finals[0].situationalReferences).toEqual([receipts.a])
    expect(finals[0].presentation).toEqual({shownBlocks:['form_block','native_a_block','early_end']})
  })

  it('seals the reached native receipt through SCREEN_OUT and ends without a FINAL, scores or rerun',async()=>{
    task.flow.blocks=[task.flow.blocks[0],task.flow.blocks[1],
      {blockKey:'screen_end',kind:'END',termination:'SCREEN_OUT',title:'资格路径结束'},
      {blockKey:'unreached_native',kind:'INSTRUMENT',instrumentKey:'native_b'}]
    await openTask()
    fireEvent.click(screen.getByRole('radio',{name:'路径 A'}));advance()
    fireEvent.click(await screen.findByRole('button',{name:'完成 native_a 共享任务'}))
    await screen.findByText(/情境化作答已可靠保存/);advance()
    expect(screen.getByRole('heading',{name:'资格路径结束'})).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button',{name:'完成资格筛选'}))
    await screen.findByRole('heading',{name:'本轮资格筛选已结束'})
    expect(finals).toEqual([]);expect(screenOuts).toHaveLength(1)
    expect(screenOuts[0].answers).toEqual({...answers('a'),native_a:{}})
    expect(screenOuts[0].situationalReferences).toEqual([receipts.a])
    expect(screenOuts[0].presentation).toEqual({shownBlocks:['form_block','native_a_block','screen_end']})
    expect(starts).toEqual([{route:'a',body:{accessCredential:credential,priorAnswers:answers('a')}}])
    expect(reads).toEqual(['a'])
    expect(screen.queryByRole('heading',{name:'感谢参与，问卷已提交'})).toBeNull()
    expect(screen.queryByRole('region',{name:'本次表现描述性反馈'})).toBeNull()
    expect(screen.queryByRole('button',{name:/共享任务|重做|重答|重新开始|提交本轮正式回答/})).toBeNull()
    expect(sessionStorage.getItem(`huisurvey:v1:unfinished:${publicId}:${attemptId}`)).toBeNull()
  })

  it('shows frozen material-only selectedMaterial before the shared native sequence without inventing read events',async()=>{
    task.flow.selectedMaterial={blockKey:'assigned_material',title:'本组研究材料',body:'这是服务器冻结的材料内容。'}
    render(<SurveyPublicApp/>)
    fireEvent.click(await screen.findByRole('button',{name:'恢复本次作答／查看已完成回执'}))
    await screen.findByRole('heading',{name:'本组研究材料'})
    expect(screen.getByText('这是服务器冻结的材料内容。')).toBeInTheDocument()
    expect(screen.queryByRole('radio',{name:'路径 A'})).toBeNull()
    expect(screen.queryByRole('button',{name:/共享任务/})).toBeNull()
    expect(starts).toEqual([])
    advance()
    fireEvent.click(await screen.findByRole('radio',{name:'路径 A'}));advance()
    fireEvent.click(await screen.findByRole('button',{name:'完成 native_a 共享任务'}))
    await screen.findByText(/情境化作答已可靠保存/)
    final();await screen.findByText('感谢参与，问卷已提交')
    expect(starts).toEqual([{route:'a',body:{accessCredential:credential,priorAnswers:answers('a')}}])
    expect(finals).toHaveLength(1);expect(screenOuts).toEqual([])
    expect(finals[0].answers).toEqual({...answers('a'),native_a:{}})
    expect(finals[0].situationalReferences).toEqual([receipts.a])
    expect(finals[0].presentation).toEqual({shownBlocks:['assigned_material','form_block','native_a_block']})
    expect(Object.keys(finals[0]).sort()).toEqual(['accessCredential','answers','presentation','situationalReferences','submissionId'])
    expect(vi.mocked(fetch).mock.calls.map(([url])=>String(url).split('/').pop())).toEqual(['info','task','start','read','final'])
  })
})
