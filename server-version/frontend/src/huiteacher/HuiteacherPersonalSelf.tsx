import {assessmentStatus} from './assessmentTaskPresentation'
import { useCallback,useEffect,useRef,useState } from 'react'
type Api=<T>(path:string,method?:string,data?:unknown)=>Promise<T>
type Catalog={resourceId:string;title:string;version:string;scientificMaturity:'PILOT'}
type AttemptSummary={assessmentId:string;resourceId:string;title:string;
  status:string;startedAt:string;completedAt:string|null}
type ScaleOption={value:string|number;label:string}
type ScaleItem={itemCode:string;content:string;required:boolean;options:ScaleOption[]}
type Attempt={assessmentId:string;title:string;status:string;attemptEpoch:number;
  definitionHash:string;runner:{items:ScaleItem[]};reportMode:'PERSONAL_ONLY'}
type Score={key:string;label:string;value:number|null;displayPrecision:number;status:string;direction:string}
type Report={state:'READY'|'WITHHELD';title?:string;scores?:Score[];
  scientificMaturity?:string;interpretations?:Array<{scoreKey:string;headline:string;
    interpretation:string;guidance:Array<{category:string;text:string}>;
    limitations:string[]}>;caveats?:string[];disclaimer?:string;explanation?:string}
const draftKey=(id:string)=>'huiteacher:personal-scale:v1:'+id
function saved(id:string,hash:string):Record<string,string|number>{
  try{
    const v=sessionStorage.getItem(draftKey(id))
    if(!v||v.length>262144)return {}
    const row=JSON.parse(v) as {hash:string;at:number;answers:Record<string,string|number>}
    return row.hash===hash&&Number.isFinite(row.at)
      &&row.at<=Date.now()&&Date.now()-row.at<7200000
      &&row.answers&&typeof row.answers==='object'&&!Array.isArray(row.answers)
      ?row.answers:{}
  }catch{return {}}
}
function store(id:string,hash:string,answers:Record<string,string|number>){
  try{
    const payload=JSON.stringify({hash,answers,at:Date.now()})
    if(payload.length<262144)sessionStorage.setItem(draftKey(id),payload)
  }catch{/* Browser private mode */}
}
export function HuiteacherPersonalSelf({api}:{api:Api}){
  const [catalogRows,setCatalog]=useState<Catalog[]>([])
  const [attemptRows,setAttempts]=useState<AttemptSummary[]>([])
  const [active,setActive]=useState<Attempt|null>(null)
  const answering=useRef<HTMLDivElement>(null)
  const activeAnswerKey=active?.status==='IN_PROGRESS'?active.assessmentId:''
  useEffect(()=>{if(activeAnswerKey){answering.current?.focus({preventScroll:true});answering.current?.scrollIntoView?.({block:'start'})}},[activeAnswerKey])
  const [answers,setAnswers]=useState<Record<string,string|number>>({})
  const [reports,setReports]=useState<Record<string,Report>>({})
  const [busy,setBusy]=useState(false)
  const [notice,setNotice]=useState('')
  const [submissionId,setSubmissionId]=useState('')
  const listSource=useRef({api,endpoint:'/personal-scale'})
  const listRequest=useRef(0)
  const [listState,setListState]=useState<{api:Api;endpoint:string;pending:boolean;error:string;loaded:boolean}>(
    {api,endpoint:'/personal-scale',pending:true,error:'',loaded:false})
  listSource.current={api,endpoint:'/personal-scale'}
  const listCurrent=listState.api===api&&listState.endpoint==='/personal-scale'
  const listPending=!listCurrent||listState.pending
  const listError=listCurrent?listState.error:''
  const listReady=listCurrent&&listState.loaded
  const catalog=listReady?catalogRows:[]
  const attempts=listReady?attemptRows:[]
  const refresh=useCallback(async()=>{
    if(listSource.current.api!==api||listSource.current.endpoint!=='/personal-scale')return
    const request=++listRequest.current
    const valid=()=>request===listRequest.current&&listSource.current.api===api&&listSource.current.endpoint==='/personal-scale'
    setListState(old=>({api,endpoint:'/personal-scale',pending:true,error:'',loaded:old.api===api&&old.endpoint==='/personal-scale'&&old.loaded}))
    try{
      const [resources,list]=await Promise.all([
        api<{list:Catalog[]}>('/personal-scale/catalog'),
        api<{list:AttemptSummary[]}>('/personal-scale/assessments'),
      ])
      if(!valid())return
      setCatalog(resources.list);setAttempts(list.list)
      setListState({api,endpoint:'/personal-scale',pending:false,error:'',loaded:true})
    }catch(error){
      if(valid())setListState(old=>({...old,pending:false,error:error instanceof Error?error.message:'任务列表读取失败，请重试。'}))
    }
  },[api])
  useEffect(()=>{
    void refresh()
    return()=>{listRequest.current+=1}
  },[refresh])
  useEffect(()=>{
    if(active?.status==='IN_PROGRESS')store(active.assessmentId,active.definitionHash,answers)
  },[active,answers])
  const perform=(work:()=>Promise<void>)=>{
    setNotice('');setBusy(true)
    void work().catch(e=>setNotice(e instanceof Error?e.message:'个人测评操作失败'))
      .finally(()=>setBusy(false))
  }
  const load=async(id:string)=>{
    const state=await api<Attempt>('/personal-scale/assessments/'+id)
    setActive(state);setAnswers(saved(id,state.definitionHash))
    setSubmissionId('')
  }
  const begin=(resourceId:string)=>perform(async()=>{
    const created=await api<{assessmentId:string}>('/personal-scale/assessments',
      'POST',{resourceId})
    await load(created.assessmentId);await refresh()
  })
  const continueAttempt=(id:string)=>perform(async()=>{await load(id)})
  const submit=()=>perform(async()=>{
    if(!active||active.status!=='IN_PROGRESS')return
    const required=active.runner.items.filter(x=>x.required
      &&!Object.prototype.hasOwnProperty.call(answers,x.itemCode))
    if(required.length)throw new Error('请完成全部必答题：'+required[0].content)
    if(!window.confirm('确认正式提交个人测评吗？提交后无法修改本次回答。'))return
    const payload=active.runner.items.filter(q=>answers[q.itemCode]!==undefined).map(q=>({
      itemCode:q.itemCode,responseValue:answers[q.itemCode],
    }))
    let key=submissionId
    if(!key){
      try{
        key=sessionStorage.getItem('huiteacher:personal:submission:'+active.assessmentId)||''
      }catch{/* Browser private mode */}
      if(!key)key=crypto.randomUUID()
      setSubmissionId(key)
      try{
        sessionStorage.setItem('huiteacher:personal:submission:'+active.assessmentId,key)
      }catch{/* Browser private mode */}
    }
    await api('/personal-scale/assessments/'+active.assessmentId+'/final','POST',{
      submissionId:key,attemptEpoch:active.attemptEpoch,
      definitionHash:active.definitionHash,answers:payload,
    })
    try{
      sessionStorage.removeItem(draftKey(active.assessmentId))
      sessionStorage.removeItem('huiteacher:personal:submission:'+active.assessmentId)
    }catch{/* Browser private mode */}
    setAnswers({});setActive({...active,status:'COMPLETED'})
    setNotice('个人量表已完成正式 FINAL。结果仅向本人开放。')
    await refresh()
  })
  const loadReport=(id:string)=>perform(async()=>{
    const report=await api<Report>('/personal-scale/assessments/'+id+'/report')
    setReports(old=>({...old,[id]:report}))
  })
  return <section className="ht-panel ht-personal-workbench" aria-label="教师个人自主发展测评">
    <h2>组织测评</h2>
    <p className="ht-muted">选择已授权给本人的工具，发起个人测评；此处仅供本人作答，不向其他人发布。个人反馈仅由本人查看。</p>
    {listPending&&<p role="status">正在读取任务列表，请稍候…</p>}
    {listError&&<div role="alert" className="ht-notice"><p>任务列表读取失败，请重试。</p><p>{listError}</p>
      <button type="button" disabled={listPending} onClick={()=>void refresh()}>重试读取任务列表</button>
    </div>}
    {notice&&<p className="ht-notice" role="status">{notice}</p>}
    <h3 className="ht-assessment-section-title">可用测评工具{listReady&&<span className="ht-tag">{catalog.length} 项</span>}</h3>
    {listReady&&!listPending&&!listError&&!catalog.length?<p className="ht-empty">暂未获得个人测评工具授权。可继续使用学校安排的其他评价任务。</p>:
      <div className="ht-event-list ht-personal-catalog">{catalog.map(x=><div key={x.resourceId} className="ht-event">
        <div className="ht-personal-tool-copy"><strong>{x.title}</strong><span className="ht-muted">个人作答 · 反馈仅本人可见</span><span className="ht-tag">Pilot · {x.version}</span></div>
        <button disabled={busy} onClick={()=>begin(x.resourceId)}>发起个人测评</button>
      </div>)}</div>}
    <h3 className="ht-assessment-section-title">我的个人测评记录{listReady&&<span className="ht-tag">{attempts.length} 条</span>}</h3>
    {listReady&&!listPending&&!listError&&!attempts.length&&<p className="ht-empty">暂无个人测评记录。</p>}
    <div className="ht-event-list">{attempts.map(x=><article className="ht-event" key={x.assessmentId}>
      <strong>{x.title}</strong><span className="ht-tag">{assessmentStatus(x.status)}</span>
      <div className="ht-inline">
        {x.status==='IN_PROGRESS'&&
          <button disabled={busy} onClick={()=>continueAttempt(x.assessmentId)}>继续作答</button>}
        {x.status==='COMPLETED'&&
          <button disabled={busy} onClick={()=>loadReport(x.assessmentId)}>查看本人反馈</button>}
      </div>
      {reports[x.assessmentId]&&<div className="ht-personal-report">
        {reports[x.assessmentId].state==='WITHHELD'
          ?<p>当前结果因答案质量或授权限制暂不显示。</p>
          :<>
            <p>{reports[x.assessmentId].explanation}</p>
            {reports[x.assessmentId].scores?.map(score=><p key={score.key}>
              <strong>{score.label}</strong>：
              {score.value===null?'不可计算':score.value.toFixed(score.displayPrecision)}
              <span className="ht-muted">（仅反映本次描述性自评）</span>
            </p>)}
            {reports[x.assessmentId].interpretations?.map(i=><article key={i.scoreKey}>
              <h4>{i.headline}</h4><p>{i.interpretation}</p>
              {i.guidance.map((g,k)=><p key={k}>{g.text}</p>)}
            </article>)}
            <p className="ht-muted">{reports[x.assessmentId].disclaimer}</p>
          </>}
      </div>}
    </article>)}</div>
    {active?.status==='IN_PROGRESS'&&<div className="ht-task" ref={answering} tabIndex={-1} role="region" aria-label="当前个人测评作答">
      <h3>{active.title}</h3><p>答案仅在本标签页短时保留，全部填写后一次提交正式计分。</p>
      {active.runner.items.map(q=><fieldset key={q.itemCode} className="ht-scale-item">
        <legend>{q.content}{q.required?' *':''}</legend>
        {q.options.map(option=><label key={String(option.value)}>
          <input type="radio" name={'personal-scale-'+q.itemCode}
            checked={answers[q.itemCode]===option.value}
            onChange={()=>setAnswers(old=>({...old,[q.itemCode]:option.value}))}/>
          {option.label}
        </label>)}
      </fieldset>)}
      <button className="ht-primary" disabled={busy} onClick={submit}>一次性正式提交</button>
    </div>}
  </section>
}
