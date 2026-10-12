import React,{useCallback,useEffect,useRef,useState} from 'react'
import './report-privacy.css'

export type PrivacyScenario=
  'TEACHER_STUDENT_EVALUATION'|'TEACHER_ADULT_FORM_GROUP'|
  'SCHOOL_GENERAL_EDUCATION_GROUP'|'SCHOOL_SENSITIVE_WELLBEING_GROUP'
type Preset='STANDARD'|'ENHANCED'|'CUSTOM'
type Scope='MY'|'SCHOOL_DEFAULT'|'SCHOOL_MINIMUM'
type Options={
  minRespondentsProfile:'BASELINE'|'N10'
  requireAllCompleted:boolean
  withholdSmallCells:boolean
  protectSmallNonrespondentComplement:boolean
  crossReleaseOverlapGuard:boolean
  restrictedStatisticsProjection:boolean
  restrictItemDistributions:boolean
  releaseDelayHours:0|24
}
type OptionKey=keyof Options
type Group={key:string;label:string}
type Option={key:OptionKey;group:string;label:string;detail:string}
type Saved={revision:number;preset:Preset|null;options:Partial<Options>}|null
type Data={
  editableScopes:Scope[];mine:Saved;schoolDefault:Saved;schoolMinimum:Saved
  selected:Options;effective:Options;origin:string;locks:Partial<Record<OptionKey,string>>
  selectedPreset:Preset;effectivePreset:Preset
  disclosureState:'LEGACY_STRICT'|'FROZEN_V1'
  catalog:{title:string;groups:Group[];options:Option[];baselineAlwaysOn:string[]
    reportConsumerActive:boolean;status:string;baselineNote:string;sensitiveEnforced:boolean}
}
type Api=<T>(path:string,method?:string,body?:unknown)=>Promise<T>
const standard:Options={
  minRespondentsProfile:'BASELINE',requireAllCompleted:false,withholdSmallCells:false,
  protectSmallNonrespondentComplement:false,crossReleaseOverlapGuard:false,
  restrictedStatisticsProjection:false,restrictItemDistributions:false,releaseDelayHours:0,
}
const enhanced:Options={
  minRespondentsProfile:'N10',requireAllCompleted:true,withholdSmallCells:true,
  protectSmallNonrespondentComplement:true,crossReleaseOverlapGuard:true,
  restrictedStatisticsProjection:true,restrictItemDistributions:true,releaseDelayHours:24,
}
const keys=Object.keys(standard) as OptionKey[]
const mode=(v:Options):Preset=>{
  const same=(p:Options)=>keys.every(k=>v[k]===p[k])
  return same(standard)?'STANDARD':same(enhanced)?'ENHANCED':'CUSTOM'
}
const saved=(d:Data,scope:Scope):Saved=>
  scope==='MY'?d.mine:scope==='SCHOOL_DEFAULT'?d.schoolDefault:d.schoolMinimum
const defaults=(d:Data,scope:Scope):Partial<Options>=>{
  const row=saved(d,scope)
  if(row)return {...row.options}
  if(scope==='SCHOOL_MINIMUM')return {}
  if(scope==='SCHOOL_DEFAULT')return d.catalog.sensitiveEnforced?{...enhanced}:{...standard}
  return {...d.selected}
}
const lockLabel=(reason:string)=>reason==='SENSITIVE_RESOURCE_BASELINE'
  ?'敏感测评的强制保护，不允许降低':'学校强制保护要求，不允许降低'

/** Cookie-like preference interaction, NOT stored in browser cookies.
 * PR1 surfaces saved FUTURE preferences, not a live report policy. */
export function ReportPrivacyPreferences({organizationId,scenarios,api}:{
  organizationId:string;scenarios:readonly PrivacyScenario[];api:Api
}){
  const [scenario,setScenario]=useState<PrivacyScenario>(scenarios[0])
  const [scope,setScope]=useState<Scope>('MY')
  const [data,setData]=useState<Data|null>(null)
  const [draft,setDraft]=useState<Partial<Options>>({})
  const [busy,setBusy]=useState(false)
  const [error,setError]=useState('')
  const [message,setMessage]=useState('')
  const path='/organizations/'+organizationId+'/report-privacy'
  const viewKey=path+'?scenario='+scenario
  const currentView=useRef(viewKey)
  currentView.current=viewKey
  const requestSerial=useRef(0)
  const load=useCallback(async(preferredScope:Scope='MY')=>{
    const requested=path+'?scenario='+scenario
    if(currentView.current!==requested)return
    const ticket=++requestSerial.current
    setBusy(true);setError('')
    try{
      const result=await api<Data>(path+'/preferences?scenario='+encodeURIComponent(scenario))
      if(ticket!==requestSerial.current||currentView.current!==requested)return
      const next=result.editableScopes.includes(preferredScope)?preferredScope:'MY'
      setData(result);setDraft(defaults(result,next));setScope(next)
    }catch(e){
      if(ticket===requestSerial.current&&currentView.current===requested)
        setError(e instanceof Error?e.message:'无法读取隐私偏好')
    }finally{
      if(ticket===requestSerial.current&&currentView.current===requested)setBusy(false)
    }
  },[api,path,scenario])
  useEffect(()=>{
    const requested=path+'?scenario='+scenario
    const ticket=++requestSerial.current
    setBusy(false);setData(null);setError('');setMessage('')
    void api<Data>(path+'/preferences?scenario='+encodeURIComponent(scenario))
      .then(d=>{
        if(ticket===requestSerial.current&&currentView.current===requested){
          setData(d);setDraft(defaults(d,'MY'));setScope('MY')
        }
      })
      .catch(e=>{
        if(ticket===requestSerial.current&&currentView.current===requested)
          setError(e instanceof Error?e.message:'无法读取隐私偏好')
      })
    return ()=>{requestSerial.current+=1}
  },[api,path,scenario])
  const selectScope=(next:Scope)=>{
    if(!data||!data.editableScopes.includes(next))return
    setScope(next);setDraft(defaults(data,next));setMessage('');setError('')
  }
  const locked=(key:OptionKey)=>scope!=='SCHOOL_MINIMUM'&&!!data?.locks[key]
  const isOn=(key:OptionKey)=>locked(key)
    ?data?.effective[key]===enhanced[key]:draft[key]===enhanced[key]
  const change=(key:OptionKey,on:boolean)=>{
    if(locked(key))return
    const next={...draft}
    if(scope==='SCHOOL_MINIMUM'){
      if(on)(next as Record<string,unknown>)[key]=enhanced[key]
      else delete next[key]
    }else (next as Record<string,unknown>)[key]=on?enhanced[key]:standard[key]
    setDraft(next);setMessage('')
  }
  const groupState=(group:string):'true'|'false'|'mixed'=> {
    const relevant=data?.catalog.options.filter(o=>o.group===group)??[]
    const count=relevant.filter(o=>isOn(o.key)).length
    return !count?'false':count===relevant.length?'true':'mixed'
  }
  const changeGroup=(group:string,on:boolean)=>{
    // One React state update for an entire group.
    const next={...draft}
    for(const option of data?.catalog.options.filter(o=>o.group===group)??[]){
      if(locked(option.key))continue
      if(scope==='SCHOOL_MINIMUM'){
        if(on)(next as Record<string,unknown>)[option.key]=enhanced[option.key]
        else delete next[option.key]
      }else (next as Record<string,unknown>)[option.key]=on?enhanced[option.key]:standard[option.key]
    }
    setDraft(next);setMessage('')
  }
  const activePreset=scope==='SCHOOL_MINIMUM'?'CUSTOM':
    mode({...standard,...draft} as Options)
  const applyPreset=(preset:'STANDARD'|'ENHANCED')=>{
    const next={...(preset==='STANDARD'?standard:enhanced)}
    for(const key of keys)if(locked(key))(next as Record<string,unknown>)[key]=data!.effective[key]
    setDraft(next);setMessage('')
  }
  const save=async()=>{
    if(!data)return
    const row=saved(data,scope)
    const preset=scope==='SCHOOL_MINIMUM'?undefined:activePreset
    const request={scope,expectedRevision:row?.revision??0,
      ...(preset===undefined?{}:{preset}),
      ...(scope==='SCHOOL_MINIMUM'||preset==='CUSTOM'?{options:draft}:{}),
      requestKey:crypto.randomUUID()}
    const savingView=viewKey
    setBusy(true);setError('');setMessage('')
    try{
      await api(path+'/preferences/'+scenario,'PUT',request)
      if(currentView.current!==savingView)return
      await load(scope)
      if(currentView.current===savingView)setMessage(data.catalog.reportConsumerActive
        ?'偏好已保存；仅对后续正式发布并冻结策略的受支持新任务生效。历史任务和敏感报告保持原规则。'
        :'偏好已保存，将在后续受支持的任务发布中沿用；当前报告仍按原保护策略执行。')
    }catch(e){
      if(currentView.current===savingView)
        setError(e instanceof Error?e.message:'保存失败，请刷新后重试')
    }finally{
      if(currentView.current===savingView)setBusy(false)
    }
  }
  return <section className="rp-root" aria-label="评价与报告隐私偏好">
    <h3>评价与报告隐私偏好</h3>
    <p className="rp-intro">只需设置一次，后续同类任务自动沿用。必要的身份与个人数据保护不可关闭。</p>
    <label className="rp-field">评价类型
      <select aria-label="评价类型" value={scenario} disabled={busy}
        onChange={e=>setScenario(e.target.value as PrivacyScenario)}>
        {scenarios.map(s=><option value={s} key={s}>{s==='TEACHER_STUDENT_EVALUATION'?'学生评教教师':
          s==='TEACHER_ADULT_FORM_GROUP'?'教师问卷与学校发展调查':
          s==='SCHOOL_GENERAL_EDUCATION_GROUP'?'学校氛围与一般教育调查':'学生心理健康与敏感测评'}</option>)}
      </select>
    </label>
    {error&&<p role="alert" className="rp-error">{error}</p>}
    {!data?<p aria-live="polite">正在读取此学校的偏好设置…</p>:<>
      <div className="rp-status" role="status">
        <strong>{data.catalog.reportConsumerActive?'适用新任务的偏好已生效':'仅偏好保存阶段'}</strong>
        {' · '}{data.catalog.reportConsumerActive
          ?data.catalog.baselineNote
          :'当前报告仍按原有严格规则执行。'}
        <span>{data.catalog.reportConsumerActive
          ?'历史任务与敏感个人报告仍按原有规则；只有授权人员可首次发布审核后的群体报告。'
          :'后续产品适配才会接入正式发布与报告计算。'}</span>
      </div>
      <label className="rp-field">设置层级
        <select aria-label="设置层级" value={scope} onChange={e=>selectScope(e.target.value as Scope)}>
          <option value="MY">我的默认偏好</option>
          {data.editableScopes.includes('SCHOOL_DEFAULT')&&<option value="SCHOOL_DEFAULT">学校默认偏好</option>}
          {data.editableScopes.includes('SCHOOL_MINIMUM')&&<option value="SCHOOL_MINIMUM">学校强制保护底线</option>}
        </select>
      </label>
      {scope!=='SCHOOL_MINIMUM'&&<fieldset className="rp-presets">
        <legend>快捷设置</legend>
        {(['STANDARD','ENHANCED','CUSTOM'] as const).map(key=><label key={key}>
          <input type="radio" name={'rp-preset-'+organizationId} checked={activePreset===key}
            disabled={busy||key==='CUSTOM'} onChange={()=>key!=='CUSTOM'&&applyPreset(key)}/>
          {key==='STANDARD'?'标准反馈（推荐）':key==='ENHANCED'?'增强保护':'自定义'}
        </label>)}
      </fieldset>}
      <div className="rp-necessary"><strong>必要的身份与个人数据保护 · 始终开启</strong>
        <p>{data.catalog.baselineAlwaysOn.join('、')}。不能通过偏好开关解除。</p>
      </div>
      {data.catalog.groups.map(group=><details key={group.key} className="rp-group">
        <summary><span>{group.label}</span>
          <button type="button" role="checkbox" aria-label={group.label+'整组切换'}
            aria-checked={groupState(group.key)} disabled={busy||data.catalog.sensitiveEnforced&&scope!=='SCHOOL_MINIMUM'}
            onClick={e=>{e.preventDefault();e.stopPropagation();
              changeGroup(group.key,groupState(group.key)!=='true')}}>
            {groupState(group.key)==='mixed'?'部分开启':groupState(group.key)==='true'?'已开启':'已关闭'}
          </button>
        </summary>
        <div className="rp-options">
          {data.catalog.options.filter(o=>o.group===group.key).map(option=><label key={option.key}
            className="rp-option">
            <span><strong>{option.label}</strong><small>{option.detail}</small>
              {locked(option.key)&&<small className="rp-locked">{lockLabel(data.locks[option.key]!)}</small>}
            </span>
            <input type="checkbox" checked={isOn(option.key)}
              disabled={busy||locked(option.key)}
              onChange={e=>change(option.key,e.target.checked)}/>
          </label>)}
        </div>
      </details>)}
      <div className="rp-effective">
        <strong>当前保存偏好来源：</strong>{data.origin==='MY'?'本人':
          data.origin==='SCHOOL_DEFAULT'?'学校默认':'产品推荐'}
        <p>学校强制底线和敏感资源规则始终优先。任何报告发布前仍会核验正式资源授权。</p>
      </div>
      <div className="rp-actions">
        <button type="button" disabled={busy} onClick={()=>scope==='SCHOOL_MINIMUM'?setDraft({}):applyPreset('STANDARD')}>
          恢复推荐设置
        </button>
        <button type="button" disabled={busy} onClick={()=>void save()}>
          保存为今后默认偏好
        </button>
      </div>
      {message&&<p role="status" className="rp-message">{message}</p>}
    </>}
  </section>
}
