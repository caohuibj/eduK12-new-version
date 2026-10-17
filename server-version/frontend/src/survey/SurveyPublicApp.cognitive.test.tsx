import { act,fireEvent,render,screen,waitFor } from '@testing-library/react'
import { afterEach,beforeEach,describe,expect,it,vi } from 'vitest'
import { clearSurveyCognitiveSessions } from './survey-cognitive-local'
vi.mock('./survey-cognitive-local',()=>({rememberSurveyCognitiveSession:vi.fn(),clearSurveyCognitiveSessions:vi.fn().mockResolvedValue(true)}))
import SurveyPublicApp from './SurveyPublicApp'
const harness=vi.hoisted(()=>({cognitive:null as any}))
vi.mock('./SurveyCognitiveUnit',()=>({SurveyCognitiveUnit:(props:any)=>{harness.cognitive=props;return <section>
  <button type="button" onClick={()=>{props.onStarted({slotKey:'cog',sessionId:'session',status:'IN_PROGRESS',epoch:1});props.onRunningChange(true)}}>模拟开始认知</button>
  <button type="button" onClick={()=>props.onCommitted({slotKey:'cog',epoch:1,resultId:'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',resultHash:'a'.repeat(64),measurementDigest:'b'.repeat(64)})}>模拟子结果确认</button>
  <p>认知组件测试替身，未测量真实反应时间</p></section>}}))
const pid='11111111-1111-4111-8111-111111111111',aid='22222222-2222-4222-8222-222222222222'
const response=(data:unknown)=>Promise.resolve({ok:true,status:200,json:async()=>({code:0,data})} as Response)
let task:any,finals:any[],failFirst:boolean,generalReads:number
beforeEach(()=>{
  window.history.replaceState(null,'',`/r/${pid}`);sessionStorage.clear();harness.cognitive=null;finals=[];failFirst=false;generalReads=0
  sessionStorage.setItem(`huisurvey:v1:single:${pid}`,JSON.stringify({attemptId:aid,accessCredential:'a'.repeat(43),createdAt:Date.now()}))
  task={attemptId:aid,waveId:'wave',status:'STARTED',definitionDigest:'a'.repeat(64),reportMode:'GENERAL_ONLY',units:[
    {kind:'FORM',instrumentKey:'form',title:'背景',pages:[{pageKey:'page',title:'背景页',questions:[{itemKey:'q',type:'SINGLE',prompt:'选择背景',required:true,options:[{optionKey:'yes',label:'符合'},{optionKey:'no',label:'不符合'}]}]}]},
    {kind:'COGNITIVE',instrumentKey:'cog',title:'GoNoGo',feedback:{mode:'DESCRIPTIVE',release:'AFTER_FINAL'}},
  ]}
  vi.stubGlobal('fetch',vi.fn(async(url:string,init?:RequestInit)=>{
    if(url.endsWith('/info'))return response({project:{name:'混合研究',description:'说明',collectionMode:'SINGLE_UNLINKED',status:'OPEN'},waves:[]})
    if(url.endsWith('/task'))return response(task)
    if(url.endsWith('/final')){
      finals.push(JSON.parse(String(init?.body)));if(failFirst&&finals.length===1)throw new Error('结果尚不确定')
      return response({attemptId:aid,status:'COMPLETED',idempotent:false,receiptId:'receipt',completedAt:'2026-10-17T00:00:00Z',generalReceipt:{text:'可信回执',disclaimer:'说明',completedAt:'2026-10-17T00:00:00Z'}})
    }
    if(url.endsWith('/withdraw-data'))return response({status:'WITHDRAWN'})
    if(url.endsWith('/general')){generalReads++;return response({kind:'DESCRIPTIVE',text:'感谢参与',disclaimer:'仅限本次表现',completedAt:'2026-10-17T00:00:00Z',pending:false,measurements:[{instrumentKey:'cog',title:'GoNoGo',measurementDigest:'b'.repeat(64),maturity:'PILOT',quality:'limited',metrics:[{key:'hitRate',label:'Go 命中率',value:0.8,unit:'ratio',status:'available'}]}]})}
    throw new Error('Unexpected '+url)
  }))
})
afterEach(()=>{vi.unstubAllGlobals();vi.restoreAllMocks()})
async function open(){render(<SurveyPublicApp/>);fireEvent.click(await screen.findByRole('button',{name:'恢复本次作答／查看已完成回执'}));await screen.findByRole('radio',{name:'符合'})}
describe('Survey parent/child boundary and feedback',()=>{
  it('locks prior answers, blocks outer navigation while running, and seals exact child refs on parent retry',async()=>{
    failFirst=true;await open();fireEvent.click(screen.getByRole('radio',{name:'符合'}));fireEvent.click(screen.getByRole('button',{name:'确认当前工具，继续'}))
    expect(harness.cognitive.priorAnswers).toEqual({form:{q:'yes'}})
    fireEvent.click(screen.getByRole('button',{name:'模拟开始认知'}))
    expect(screen.getByRole('button',{name:'上一工具'})).toBeDisabled();expect(screen.getByRole('button',{name:'提交本轮正式回答'})).toBeDisabled()
    fireEvent.click(screen.getByRole('button',{name:'模拟子结果确认'}));expect(finals).toHaveLength(0)
    fireEvent.click(screen.getByRole('button',{name:'上一工具'}));expect(screen.getByRole('radio',{name:'不符合'})).toBeDisabled()
    fireEvent.click(screen.getByRole('button',{name:'确认当前工具，继续'}));fireEvent.click(screen.getByRole('button',{name:'提交本轮正式回答'}))
    await screen.findByText('结果尚不确定');expect(finals[0].answers).toEqual({form:{q:'yes'},cog:{}})
    expect(finals[0].cognitiveReferences).toHaveLength(1)
    fireEvent.click(screen.getByRole('button',{name:'提交本轮正式回答'}));await screen.findByText('本轮研究已提交')
    expect(finals[1]).toEqual(finals[0]);expect(generalReads).toBe(1)
    expect(screen.getByText('Go 命中率：80.0%（available）')).toBeInTheDocument()
    expect(screen.queryByText('可信回执')).toBeNull()
    expect(clearSurveyCognitiveSessions).toHaveBeenCalledWith(pid,aid,['session'],undefined)
  })
  it('restores locked canonical prior answers and child references from authorized task metadata',async()=>{
    task.lockedPriorAnswers={form:{q:'yes'}};task.cognitiveSessions=[{slotKey:'cog',sessionId:'session',status:'COMPLETED',epoch:1,resultReference:{slotKey:'cog',epoch:1,resultId:'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',resultHash:'a'.repeat(64),measurementDigest:'b'.repeat(64)}}]
    await open();expect(screen.getByRole('radio',{name:'符合'})).toBeChecked();expect(screen.getByRole('radio',{name:'不符合'})).toBeDisabled()
    fireEvent.click(screen.getByRole('button',{name:'确认当前工具，继续'}));fireEvent.click(screen.getByRole('button',{name:'提交本轮正式回答'}))
    await screen.findByText('本轮研究已提交');expect(finals[0].cognitiveReferences).toEqual([task.cognitiveSessions[0].resultReference])
  })
  it('does not accept a missing cognitive child as a whole-study completion',async()=>{
    await open();fireEvent.click(screen.getByRole('radio',{name:'符合'}));fireEvent.click(screen.getByRole('button',{name:'确认当前工具，继续'}))
    fireEvent.click(screen.getByRole('button',{name:'提交本轮正式回答'}));await screen.findByText('请完成当前工具后再提交')
    expect(finals).toHaveLength(0);expect(screen.queryByText('本轮研究已提交')).toBeNull()
  })
  it('restores authoritative locks from an existing child admission and cleans scoped trials after withdrawal',async()=>{
    await open();fireEvent.click(screen.getByRole('radio',{name:'不符合'}));fireEvent.click(screen.getByRole('button',{name:'确认当前工具，继续'}))
    act(()=>harness.cognitive.onStarted({slotKey:'cog',sessionId:'session',status:'IN_PROGRESS',epoch:1},{form:{q:'yes'}}))
    fireEvent.click(screen.getByRole('button',{name:'模拟子结果确认'}))
    fireEvent.click(screen.getByRole('button',{name:'上一工具'}))
    expect(screen.getByRole('radio',{name:'符合'})).toBeChecked();expect(screen.getByRole('radio',{name:'不符合'})).toBeDisabled()
    fireEvent.click(screen.getByRole('button',{name:'确认当前工具，继续'}));fireEvent.click(screen.getByRole('button',{name:'提交本轮正式回答'}))
    await screen.findByText('本轮研究已提交')
    vi.spyOn(window,'confirm').mockReturnValue(true)
    fireEvent.click(screen.getByRole('button',{name:'申请撤回本研究数据（排除未来统计）'}))
    await screen.findByText(/已记录撤回请求/)
    expect(clearSurveyCognitiveSessions).toHaveBeenLastCalledWith(pid,aid,['session'],undefined)
  })

})
