import { act,fireEvent,render,screen } from '@testing-library/react'
import { afterEach,beforeEach,describe,expect,it,vi } from 'vitest'
import { clearSurveyCognitiveSessions } from './survey-cognitive-local'
vi.mock('./survey-cognitive-local',()=>({rememberSurveyCognitiveSession:vi.fn(),clearSurveyCognitiveSessions:vi.fn().mockResolvedValue(true)}))
import SurveyPublicApp from './SurveyPublicApp'
import { saveLocalSurveyDraft } from './local-answer-draft'
const harness=vi.hoisted(()=>({cognitive:null as any}))
vi.mock('./SurveyCognitiveUnit',()=>({SurveyCognitiveUnit:(props:any)=>{harness.cognitive=props;return <section>
  <button type="button" onClick={()=>{props.onStarted({slotKey:'cog',sessionId:'session',status:'IN_PROGRESS',epoch:1});props.onRunningChange(true)}}>模拟开始认知</button>
  <button type="button" onClick={()=>props.onCommitted({slotKey:'cog',epoch:1,resultId:'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',resultHash:'a'.repeat(64),measurementDigest:'b'.repeat(64)})}>模拟子结果确认</button>
  <p>认知组件测试替身，未测量真实反应时间</p></section>}}))
const pid='11111111-1111-4111-8111-111111111111',aid='22222222-2222-4222-8222-222222222222'
const response=(data:unknown)=>Promise.resolve({ok:true,status:200,json:async()=>({code:0,data})} as Response)
const originalScrollIntoView=HTMLElement.prototype.scrollIntoView
let task:any,finals:any[],failFirst:boolean,generalReads:number
beforeEach(()=>{
  // jsdom has no scrolling implementation; retain real focus behavior.
  HTMLElement.prototype.scrollIntoView=vi.fn()
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
afterEach(()=>{
  vi.unstubAllGlobals();vi.restoreAllMocks()
  if(originalScrollIntoView)HTMLElement.prototype.scrollIntoView=originalScrollIntoView
  else delete (HTMLElement.prototype as Partial<HTMLElement>).scrollIntoView
})
async function open(){render(<SurveyPublicApp/>);fireEvent.click(await screen.findByRole('button',{name:'恢复本次作答／查看已完成回执'}));await screen.findByRole('radio',{name:'符合'})}
describe('Survey parent/child boundary and feedback',()=>{
  it('shows the device reminder only after the task confirms cognitive content and hides it while running',async()=>{
    render(<SurveyPublicApp/>)
    const restore=await screen.findByRole('button',{name:'恢复本次作答／查看已完成回执'})
    expect(screen.queryByRole('complementary',{name:'本轮认知任务设备提示'})).toBeNull()
    fireEvent.click(restore)
    await screen.findByRole('radio',{name:'符合'})
    expect(screen.getByRole('complementary',{name:'本轮认知任务设备提示'})).toHaveTextContent('不能保证跨设备继续')
    fireEvent.click(screen.getByRole('radio',{name:'符合'}))
    fireEvent.click(screen.getByRole('button',{name:'确认当前工具，继续'}))
    fireEvent.click(screen.getByRole('button',{name:'模拟开始认知'}))
    expect(screen.queryByRole('complementary',{name:'本轮认知任务设备提示'})).toBeNull()
  })
  it('does not show cognitive requirements for a form-only task',async()=>{
    task.units=task.units.filter((unit:any)=>unit.kind==='FORM')
    await open()
    expect(screen.queryByRole('complementary',{name:'本轮认知任务设备提示'})).toBeNull()
  })
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
    fireEvent.click(screen.getByRole('button',{name:'重试原提交'}));await screen.findByText('本轮研究已提交')
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
  it.each([
    ['timed sequence','IN_PROGRESS'],['timed sequence','COMPLETED'],
    ['Flow','IN_PROGRESS'],['Flow','COMPLETED'],
  ])('recovers locked Form and ONE_BY_ONE Scale navigation in %s with %s child',async(mode,status)=>{
    task.units[0].pages.push({pageKey:'second',title:'第二背景页',questions:[{
      itemKey:'q2',type:'SINGLE',prompt:'第二项背景',required:true,
      options:[{optionKey:'yes',label:'第二项符合'},{optionKey:'no',label:'第二项不符合'}],
    }]})
    task.units.splice(1,0,{kind:'SCALE',instrumentKey:'scale',title:'前置量表',presentationMode:'ONE_BY_ONE',
      items:[{itemKey:'a',prompt:'量表第一题',required:true},{itemKey:'b',prompt:'量表第二题',required:true}],
      responseOptions:[{optionKey:'yes',label:'同意'},{optionKey:'no',label:'不同意'}]})
    task.lockedPriorAnswers={form:{q:'yes',q2:'yes'},scale:{a:'yes',b:'yes'}}
    const reference={slotKey:'cog',epoch:1,resultId:'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
      resultHash:'a'.repeat(64),measurementDigest:'b'.repeat(64)}
    task.cognitiveSessions=[{slotKey:'cog',sessionId:'session',status,epoch:1,
      ...(status==='COMPLETED'?{resultReference:reference}:{})}]
    const observed={schemaVersion:1,firstResponseMs:100,activeTimeMs:200,changeCount:0,
      revisitCount:0,visits:1,interrupted:false,recoveredWithoutClock:false}
    const itemTimings={scale:{a:{...observed},b:{...observed}}}
    saveLocalSurveyDraft(pid,aid,task.definitionDigest,
      {form:{q:'no',q2:'no'},scale:{a:'no',b:'no'}},itemTimings)
    if(mode==='Flow')task.flow={schemaVersion:1,flowDigest:'c'.repeat(64),embeddedData:[],blocks:[
      {blockKey:'background',kind:'INSTRUMENT',instrumentKey:'form'},
      {blockKey:'scale',kind:'INSTRUMENT',instrumentKey:'scale'},
      {blockKey:'cognitive',kind:'INSTRUMENT',instrumentKey:'cog'},
    ]}
    const advance=mode==='Flow'?'确认当前步骤，继续研究':'确认当前工具，继续'
    await open()
    expect(screen.getByRole('radio',{name:'符合'})).toBeChecked()
    expect(screen.getByRole('radio',{name:'不符合'})).toBeDisabled()
    fireEvent.click(screen.getByRole('button',{name:advance}))
    expect(screen.getByRole('alert')).toHaveTextContent('请完成当前工具的必答内容和全部页')
    expect(harness.cognitive).toBeNull()
    const next=screen.getByRole('button',{name:'下一页'})
    expect(next).toBeEnabled()
    next.focus();expect(next).toHaveFocus()
    fireEvent.click(next)
    expect(screen.getByRole('radio',{name:'第二项符合'})).toBeChecked()
    expect(screen.getByRole('radio',{name:'第二项不符合'})).toBeDisabled()
    expect(screen.getByRole('button',{name:'上一页'})).toBeEnabled()
    fireEvent.click(screen.getByRole('button',{name:'上一页'}))
    expect(screen.getByRole('radio',{name:'符合'})).toBeDisabled()
    fireEvent.click(screen.getByRole('button',{name:'下一页'}))
    fireEvent.click(screen.getByRole('button',{name:advance}))
    expect(screen.getByText(/量表第一题/)).toBeInTheDocument()
    expect(screen.getByRole('radio',{name:'同意'})).toBeChecked()
    expect(screen.getByRole('radio',{name:'不同意'})).toBeDisabled()
    const nextItem=screen.getByRole('button',{name:'下一题'})
    expect(nextItem).toBeEnabled()
    nextItem.focus();expect(nextItem).toHaveFocus()
    fireEvent.click(nextItem)
    expect(screen.getByText(/量表第二题/)).toBeInTheDocument()
    expect(screen.getByRole('radio',{name:'同意'})).toBeDisabled()
    expect(screen.getByRole('button',{name:'上一题'})).toBeEnabled()
    fireEvent.click(screen.getByRole('button',{name:'上一题'}))
    expect(screen.getByRole('radio',{name:'同意'})).toBeChecked()
    expect(finals).toHaveLength(0)
    expect(vi.mocked(fetch).mock.calls.map(([url])=>String(url).split('/').pop())).toEqual(['info','task'])
    fireEvent.click(screen.getByRole('button',{name:advance}))
    expect(harness.cognitive.priorAnswers).toEqual(task.lockedPriorAnswers)
    if(status==='IN_PROGRESS'){
      fireEvent.click(screen.getByRole('button',{name:'提交本轮正式回答'}))
      expect(screen.getByRole('alert')).toHaveTextContent('请完成当前工具后再提交')
      expect(finals).toHaveLength(0)
      fireEvent.click(screen.getByRole('button',{name:'模拟子结果确认'}))
    }
    fireEvent.click(screen.getByRole('button',{name:'提交本轮正式回答'}))
    await screen.findByText('本轮研究已提交')
    expect(finals).toHaveLength(1)
    expect(finals[0].answers).toEqual({...task.lockedPriorAnswers,cog:{}})
    expect(finals[0].itemTimings).toEqual(itemTimings)
    expect(finals[0].cognitiveReferences).toEqual([reference])
  })
  it('does not accept a missing cognitive child as a whole-study completion',async()=>{
    await open();fireEvent.click(screen.getByRole('radio',{name:'符合'}));fireEvent.click(screen.getByRole('button',{name:'确认当前工具，继续'}))
    fireEvent.click(screen.getByRole('button',{name:'提交本轮正式回答'}));await screen.findByText('请完成当前工具后再提交')
    expect(finals).toHaveLength(0);expect(screen.queryByText('本轮研究已提交')).toBeNull()
  })
  it.each(['partial','empty','nonanswer'])('validates %s optional SJT selection before advancing a mixed Flow',async(selection)=>{
    task.units=[{kind:'SJT',instrumentKey:'sjt',title:'可选情境',scenes:[{
      sceneKey:'scene',title:'第一情境',stimulus:'情境材料',questions:[{
        questionKey:'optional',prompt:'可选多选题',responseType:'MULTIPLE',required:false,
        minSelections:2,maxSelections:2,options:[
          {optionKey:'a',label:'选择甲'},{optionKey:'b',label:'选择乙'},
          {optionKey:'c',label:'选择丙'},{optionKey:'na',label:'无法判断',nonanswerReason:'UNABLE_TO_JUDGE'},
        ],
      }],
    }]},task.units[0]]
    task.flow={schemaVersion:1,flowDigest:'c'.repeat(64),embeddedData:[],blocks:[
      {blockKey:'situation',kind:'INSTRUMENT',instrumentKey:'sjt'},
      {blockKey:'background',kind:'INSTRUMENT',instrumentKey:'form'},
    ]}
    render(<SurveyPublicApp/>)
    fireEvent.click(await screen.findByRole('button',{name:'恢复本次作答／查看已完成回执'}))
    await screen.findByRole('checkbox',{name:'选择甲'})
    if(selection==='partial'){
      fireEvent.click(screen.getByRole('checkbox',{name:'选择甲'}))
      fireEvent.click(screen.getByRole('button',{name:'确认当前步骤，继续研究'}))
      expect(screen.getByRole('alert')).toHaveTextContent('请完成当前工具的必答内容和全部页')
      expect(screen.queryByRole('radio',{name:'符合'})).toBeNull()
      expect(finals).toHaveLength(0)
      fireEvent.click(screen.getByRole('checkbox',{name:'选择乙'}))
    }else if(selection==='nonanswer'){
      fireEvent.click(screen.getByRole('checkbox',{name:'选择甲'}))
      fireEvent.click(screen.getByRole('checkbox',{name:'无法判断'}))
      expect(screen.getByRole('checkbox',{name:'选择甲'})).not.toBeChecked()
    }
    fireEvent.click(screen.getByRole('button',{name:'确认当前步骤，继续研究'}))
    fireEvent.click(screen.getByRole('radio',{name:'符合'}))
    fireEvent.click(screen.getByRole('button',{name:'提交本轮正式回答'}))
    await screen.findByText('本轮研究已提交')
    expect(finals).toHaveLength(1)
    expect(finals[0].answers).toEqual({form:{q:'yes'},sjt:selection==='empty'?{}:
      {optional:selection==='partial'?['a','b']:['na']}})
    expect(generalReads).toBe(0)
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
