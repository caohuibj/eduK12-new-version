import { useState } from 'react'
import { act,fireEvent,render,screen,within } from '@testing-library/react'
import { afterEach,describe,expect,it,vi } from 'vitest'
import { ResearchSjtV2Editor } from './ResearchSjtV2Editor'
import { ResearchCognitiveEditor } from './ResearchCognitiveEditor'
import { ResearchCognitivePreview } from './ResearchCognitivePreview'
import { ResearchPreview } from './ResearchPreview'
import { TaskForm } from './SurveyPublicApp'
import { SurveyCognitiveDeviceGate } from './SurveyCognitiveDeviceGate'
import { createSurveyCognitiveApi,surveyCognitivePath } from './survey-cognitive-api'
import { saveLocalSurveyDraft,restoreLocalSurveyDraftEnvelope } from './local-answer-draft'
import type { CognitiveDraft,ResearchDraft,SjtDraftV2 } from './builder.types'
const sjt=():SjtDraftV2=>({schemaVersion:2,respondentType:'participant_self_report',title:'情境研究',author:'作者',sourceNote:'原创',licenseStatus:'self_authored',redistribution:'allowed',orderPolicy:'FIXED',
  metrics:[{metricKey:'m',label:'合作',direction:'descriptive'}],scoring:{modelKey:'AUTHOR_KEY_SUM',modelVersion:'1',sourceNote:''},
  scenes:[{sceneKey:'scene1',title:'第一情境',stimulus:'第一份情境材料',questions:[{questionKey:'q1',prompt:'如何回应？',responseType:'MULTIPLE',required:true,allowRefusal:true,minSelections:1,maxSelections:1,aggregationPolicy:'SUM',exclusiveOptionKeys:['o2'],options:[
    {optionKey:'o1',label:'合作',contributions:{m:1}},{optionKey:'o2',label:'独立处理',contributions:{m:0}},{optionKey:'na',label:'无法判断',nonanswerReason:'UNABLE_TO_JUDGE',contributions:{}}]}]}]})
function SjtHost(){const [value,setValue]=useState(sjt());return <><ResearchSjtV2Editor value={value} onChange={setValue} projectId="p"/><output data-testid="definition">{JSON.stringify(value)}</output></>}
const definition=()=>JSON.parse(screen.getByTestId('definition').textContent!) as SjtDraftV2
const reference={slotKey:'cog',epoch:1,resultId:'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',resultHash:'a'.repeat(64),measurementDigest:'b'.repeat(64)}
afterEach(()=>{vi.restoreAllMocks();vi.unstubAllGlobals();sessionStorage.clear()})
describe('Survey measurement extension component contracts (not physical timing)',()=>{
  it('copies scenes/questions with new stable identities and preserves group/exclusive semantics',()=>{
    render(<SjtHost/>);fireEvent.click(screen.getByRole('button',{name:'复制情境'}))
    const value=definition();expect(value.scenes).toHaveLength(2)
    const original=value.scenes[0],copy=value.scenes[1]
    expect(copy.sceneKey).not.toBe(original.sceneKey)
    expect(copy.questions[0].questionKey).not.toBe(original.questions[0].questionKey)
    expect(copy.questions[0].exclusiveOptionKeys).toEqual([copy.questions[0].options[1].optionKey])
    expect(copy.questions[0].options[2].contributions).toEqual({})
    fireEvent.click(screen.getByRole('button',{name:'复制问题'}))
    expect(definition().scenes[1].questions).toHaveLength(2)
  })
  it('uses explicit matrix zeros and removes deleted dimensions everywhere without assigning nonanswers zero',()=>{
    render(<SjtHost/>);fireEvent.click(screen.getByRole('button',{name:'增加选项'}))
    expect(definition().scenes[0].questions[0].options[3].contributions).toEqual({})
    fireEvent.click(screen.getByRole('button',{name:'确认本题未填贡献均为零'}))
    expect(definition().scenes[0].questions[0].options[3].contributions).toEqual({m:0})
    expect(definition().scenes[0].questions[0].options[2].contributions).toEqual({})
    fireEvent.click(screen.getByRole('button',{name:'删除构念'}))
    expect(definition().scenes[0].questions[0].options.every(o=>Object.keys(o.contributions).length===0)).toBe(true)
  })
  it('exposes expert cross-question mean with an explicit source field and no formula scripting',()=>{
    render(<SjtHost/>);fireEvent.change(screen.getByLabelText('受控计分规则'),{target:{value:'EXPERT_KEY'}})
    fireEvent.change(screen.getByLabelText('专家评分键来源（必填）'),{target:{value:'专家键版本 A'}})
    expect(definition().scoring).toEqual({modelKey:'EXPERT_KEY',modelVersion:'1',sourceNote:'专家键版本 A'})
    expect(screen.getByRole('option',{name:'专家评分键：跨题平均'})).toBeInTheDocument()
    expect(screen.queryByLabelText(/JavaScript/)).toBeNull()
  })
  it('renders grouped participant scenes, exclusive nonanswers and explicit refusal',()=>{
    const value=sjt();const change=vi.fn()
    const unit={kind:'SJT' as const,instrumentKey:'sjt',title:'测验',scenes:value.scenes}
    const view=render(<TaskForm unit={unit} answer={{q1:['o1']}} onChange={change} pageIndex={0} onPageChange={()=>{}}/>)
    expect(screen.getByText('第一份情境材料')).toBeInTheDocument()
    expect(screen.getByRole('checkbox',{name:'无法判断'})).toBeEnabled()
    fireEvent.click(screen.getByRole('checkbox',{name:'无法判断'}));expect(change).toHaveBeenLastCalledWith('q1',['na'])
    view.rerender(<TaskForm unit={unit} answer={{}} onChange={change} pageIndex={0} onPageChange={()=>{}}/>)
    fireEvent.click(screen.getByLabelText(/我选择不回答这一题/));expect(change).toHaveBeenLastCalledWith('q1',{_surveyRefusal:true})
  })
  it('sends preview refusal to backend simulation without locally synthesizing a score',()=>{
    const run=vi.fn(),draft:ResearchDraft={id:'i',projectId:'p',kind:'SJT',instrumentKey:'sjt',title:'测验',revision:1,status:'DRAFT',createdAt:'',updatedAt:'',definition:sjt()}
    render(<ResearchPreview draft={draft} onSimulate={run}/>)
    fireEvent.click(screen.getByLabelText('我选择不回答这一题'))
    fireEvent.click(screen.getByRole('button',{name:'计算当前研究性模拟得分'}))
    expect(run).toHaveBeenCalledWith({q1:{_surveyRefusal:true}})
  })
  it('defaults GENERAL and only authorizes allowlisted descriptive metrics',()=>{
    function Host(){const [value,setValue]=useState<CognitiveDraft>({schemaVersion:1,templateKey:'gonogo-software-frame-v1',feedback:{mode:'GENERAL',metricKeys:[],release:'AFTER_FINAL'}})
      return <><ResearchCognitiveEditor value={value} onChange={setValue}/><output data-testid="cog">{JSON.stringify(value)}</output></>}
    render(<Host/>);expect(screen.queryByRole('checkbox')).toBeNull()
    fireEvent.change(screen.getByLabelText('反馈内容'),{target:{value:'DESCRIPTIVE'}})
    fireEvent.click(screen.getByLabelText('Go 命中率（比例）'))
    fireEvent.change(screen.getByLabelText('开放时机'),{target:{value:'AFTER_COLLECTION'}})
    expect(JSON.parse(screen.getByTestId('cog').textContent!).feedback).toEqual({mode:'DESCRIPTIVE',metricKeys:['hitRate'],release:'AFTER_COLLECTION'})
    fireEvent.change(screen.getByLabelText('反馈内容'),{target:{value:'GENERAL'}})
    expect(JSON.parse(screen.getByTestId('cog').textContent!).feedback.metricKeys).toEqual([])
  })
  it('blocks mobile admission even after keyboard event and explicit attestation',()=>{
    vi.spyOn(navigator,'userAgent','get').mockReturnValue('Android Mobile')
    const ready=vi.fn();render(<SurveyCognitiveDeviceGate preview onReady={ready}/>)
    fireEvent.click(screen.getByRole('checkbox'));fireEvent.keyDown(screen.getByLabelText('键盘检查'),{key:'Enter'})
    expect(screen.getByRole('button',{name:'开始真实任务预览'})).toBeDisabled();expect(ready).not.toHaveBeenCalled()
  })
  it('runs real registered software-frame task instructions in preview without creating any official session',async()=>{
    const fetcher=vi.fn();vi.stubGlobal('fetch',fetcher)
    render(<ResearchCognitivePreview snapshot={{testType:'gonogo',engineVersion:'1.0.0',scoringVersion:'1.0.0',configVersion:'1.1.0',config:{totalTrials:120,nogoRatio:0.25,stimulusMs:800,isiMs:500,validRtFloorMs:100}}}/>)
    fireEvent.click(screen.getByRole('checkbox'));fireEvent.keyDown(screen.getByLabelText('键盘检查'),{key:'Enter'})
    fireEvent.click(screen.getByRole('button',{name:'开始真实任务预览'}))
    expect(await screen.findByText('本研究仅接受实体键盘：按空格或 Enter。练习不计入正式成绩。')).toBeInTheDocument()
    expect(screen.getByRole('button',{name:/开始练习/})).toBeInTheDocument()
    expect(fetcher).not.toHaveBeenCalled()
    fireEvent.click(screen.getByRole('button',{name:'退出并清除本次预览'}))
    expect(screen.getByLabelText('键盘检查')).toHaveValue('')
  })
  it('does not substitute an invented config when compiled preview is absent',()=>{
    render(<ResearchCognitivePreview/>);expect(screen.getByRole('alert')).toHaveTextContent('尚未取得可运行的冻结配置')
    expect(screen.queryByRole('button')).toBeNull()
  })
  it('binds child requests to Survey proof/session and rejects incremental trial transport',async()=>{
    const request=vi.fn(async(path:string)=>path.endsWith('/read')?{status:'COMPLETED',resultReference:reference}:{completed:true,feedbackDeferred:true,resultReference:reference})
    const accept=vi.fn(),proof={accessCredential:'secret',researchCode:'R-CODE'},path=surveyCognitivePath('public','attempt','cog')
    const api=createSurveyCognitiveApi(request as any,path,proof,accept)
    await api.getSession('session');const payload={submissionId:'sub',attemptEpoch:1,definitionHash:'frozen',trials:[{raw:true}]}
    await api.submitFinal!('session',payload)
    expect(request).toHaveBeenNthCalledWith(1,path+'/session/read','POST',proof)
    expect(request).toHaveBeenNthCalledWith(2,path+'/session/final','POST',{...proof,...payload})
    expect(accept).toHaveBeenCalledWith(reference)
    await expect(api.appendTrial('session',0,{})).rejects.toThrow('一次性提交');expect(request).toHaveBeenCalledTimes(2)
  })
  it('persists only exact child refs with sealed parent retries and never credentials',()=>{
    expect(saveLocalSurveyDraft('p','a','d',{cog:{}},undefined,{submissionId:'1234567890123456',screenOut:false,cognitiveReferences:[{...reference,accessCredential:'must-not-persist'} as any]})).toBe(true)
    const restored=restoreLocalSurveyDraftEnvelope('p','a','d')
    expect(restored?.finalSubmission?.cognitiveReferences).toEqual([reference])
    expect(JSON.stringify(sessionStorage)).not.toContain('must-not-persist')
    expect(saveLocalSurveyDraft('p','b','d',{},undefined,{submissionId:'1234567890123456',screenOut:false,cognitiveReferences:[{...reference,resultHash:'bad'}]})).toBe(false)
  })
  it('does not finish a delayed storage admission probe after the device gate unmounts',async()=>{
    const tx:any={objectStore:()=>({put:vi.fn()})}
    const opening:any={result:{transaction:()=>tx,close:vi.fn()}}
    vi.stubGlobal('indexedDB',{open:vi.fn(()=>opening),deleteDatabase:vi.fn()})
    try{
      const ready=vi.fn(),{unmount}=render(<SurveyCognitiveDeviceGate onReady={ready}/>)
      fireEvent.click(screen.getByRole('checkbox'))
      fireEvent.keyDown(screen.getByLabelText('键盘检查'),{key:'Enter'})
      fireEvent.click(screen.getByRole('button',{name:'检查暂存并进入认知任务'}))
      unmount()
      await act(async()=>{opening.onsuccess();tx.oncomplete()})
      expect(ready).not.toHaveBeenCalled()
    }finally{vi.unstubAllGlobals()}
  })

})
