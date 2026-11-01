import {useCallback,useEffect,useRef,useState} from 'react'
import {Brain,ChevronDown,RefreshCw,ShieldCheck} from 'lucide-react'
import api from '../api/client'
import {useAuth} from '../contexts/AuthContext'
import {apiErrorMessage} from '../utils/apiErrorMessage'
import AdminStepUp from './AdminStepUp'

type Identity={testType:string;configVersion:string;engineVersion:string;scoringVersion:string}
type InstallPlan={action:'CREATE_DRAFT'|'ALREADY_PRESENT'|'BLOCKED'|'CREATED_DRAFT';reasons:string[];configId?:string;status?:'DRAFT'|'PUBLISHED'|'RETIRED';sourceHash?:string}
type InstallRow=Identity&InstallPlan
type Operation={schemaVersion:1;mode:'PREVIEW'|'APPLY';rows:InstallRow[];hasBlocked:boolean}
type Candidate=Identity&{name:string;reportVersion:string|null;
  profiles:Array<{key:string;estimatedMinutes:[number,number]}>;reportMetrics:string[];plan:InstallPlan}
type Catalog={schemaVersion:1;registered:Candidate[];pending:Array<{testType:string;sourcePR:441;reasons:string[]}>}
const root='/admin/permissions/cognitive-intake'
const identity=(row:Identity):Identity=>({testType:row.testType,configVersion:row.configVersion,engineVersion:row.engineVersion,scoringVersion:row.scoringVersion})
const key=(row:Identity)=>JSON.stringify([row.testType,row.configVersion,row.engineVersion,row.scoringVersion])
const statusLabel={DRAFT:'草稿',PUBLISHED:'已发布',RETIRED:'已停用'}
const profileLabel:Record<string,string>={experience:'体验版',standard:'标准版',research:'科研版'}
function planLabel(plan:InstallPlan){
  if(plan.action==='BLOCKED')return '存在缺口'
  if(plan.action==='ALREADY_PRESENT')return plan.status?`已存在 · ${statusLabel[plan.status]}`:'已存在 · 状态待核对'
  if(plan.action==='CREATED_DRAFT')return '已安装 · 草稿'
  return '可预览安装'
}
function requestError(caught:unknown){
  if((caught as {code?:unknown}|null)?.code==='ADMIN_KEY_STEP_UP_REQUIRED')
    return '请展开“安装操作验证”，重新完成管理员双因素验证后再手动操作。'
  return apiErrorMessage(caught)
}
function operationRow(value:Operation,selected:Identity,mode:Operation['mode']):InstallRow{
  const row=value?.rows?.[0]
  if(value?.schemaVersion!==1||value.mode!==mode||value.rows.length!==1||!row||key(row)!==key(selected)
    ||!Array.isArray(row.reasons)||row.reasons.some(reason=>typeof reason!=='string')
    ||!['BLOCKED','ALREADY_PRESENT',mode==='PREVIEW'?'CREATE_DRAFT':'CREATED_DRAFT'].includes(row.action)
    ||value.hasBlocked!==(row.action==='BLOCKED')
    ||(row.action!=='BLOCKED'&&row.reasons.length>0)
    ||(row.action==='ALREADY_PRESENT'&&(!row.configId||!row.status||!Object.prototype.hasOwnProperty.call(statusLabel,row.status)))
    ||(row.action==='CREATED_DRAFT'&&(!row.configId||row.status!=='DRAFT')))
    throw new Error('服务器未返回本次精确选择的完整回执')
  return row
}

function CognitiveIntakeWorkspace(){
  const [catalog,setCatalog]=useState<Catalog|null>(null),[selectedKey,setSelectedKey]=useState<string|null>(null)
  const [preview,setPreview]=useState<InstallRow|null>(null),[busy,setBusy]=useState(false),[needsRefresh,setNeedsRefresh]=useState(false)
  const [error,setError]=useState(''),[notice,setNotice]=useState('')
  const mounted=useRef(false),epoch=useRef(0),locked=useRef(false)
  const begin=useCallback(()=>{
    if(locked.current||!mounted.current)return null
    locked.current=true;setBusy(true);setError('');setNotice('')
    return ++epoch.current
  },[])
  const current=useCallback((request:number)=>mounted.current&&epoch.current===request,[])
  const finish=useCallback((request:number)=>{if(current(request)){locked.current=false;setBusy(false)}},[current])
  const refresh=useCallback(async()=>{
    const request=begin();if(request===null)return
    setPreview(null)
    try{
      const response=await api.get<Catalog>(root)
      if(!current(request))return
      if(response.code!==0||response.data?.schemaVersion!==1||!Array.isArray(response.data.registered)||!Array.isArray(response.data.pending))
        throw new Error(response.message||'候选列表响应不完整')
      setCatalog(response.data);setSelectedKey(null);setNeedsRefresh(false)
    }catch(caught){if(current(request)){setNeedsRefresh(true);setError(requestError(caught))}}
    finally{finish(request)}
  },[begin,current,finish])
  useEffect(()=>{
    mounted.current=true;void refresh()
    return()=>{mounted.current=false;epoch.current++;locked.current=false}
  },[refresh])
  const selected=catalog?.registered.find(row=>key(row)===selectedKey)
  const updatePlan=(selected:Identity,plan:InstallRow)=>setCatalog(old=>old?{...old,registered:old.registered.map(row=>key(row)===key(selected)?{...row,plan}:row)}:old)
  const inspect=async()=>{
    if(!selected||needsRefresh)return
    const request=begin();if(request===null)return
    const choice=identity(selected);setPreview(null)
    try{
      const response=await api.post<Operation>(root+'/preview',{schemaVersion:1,items:[choice]})
      if(!current(request))return
      if(response.code!==0||!response.data)throw new Error(response.message||'预览未完成')
      const row=operationRow(response.data,choice,'PREVIEW')
      setPreview(row);updatePlan(choice,row)
    }catch(caught){if(current(request))setError(requestError(caught))}
    finally{finish(request)}
  }
  const install=async()=>{
    if(!selected||needsRefresh||preview?.action!=='CREATE_DRAFT'||key(preview)!==key(selected))return
    const request=begin();if(request===null)return
    const choice=identity(selected)
    // Send only this previewed selection once. An unknown result requires a fresh read.
    setPreview(null)
    try{
      const response=await api.post<Operation>(root+'/install',{schemaVersion:1,items:[choice]})
      if(!current(request))return
      if(response.code!==0||!response.data)throw new Error(response.message||'未收到安装成功回执')
      const row=operationRow(response.data,choice,'APPLY')
      updatePlan(choice,row)
      setNotice(row.action==='CREATED_DRAFT'?'已安装为草稿（DRAFT / GRANT）。尚未发布、公开或分配使用权。'
        :row.action==='ALREADY_PRESENT'?`已回读现有配置：${statusLabel[row.status!]}。保留原状态，没有重复创建。`:'本项仍有缺口，未安装；请查看具体原因。')
    }catch(caught){
      if(current(request)){setNeedsRefresh(true);setError('安装结果尚未确认。请先刷新回读当前状态，不要重复安装。'+requestError(caught))}
    }finally{finish(request)}
  }
  return <div className="system-page system-cognitive-intake" aria-busy={busy}>
    <header className="sys-heading"><div><p className="system-eyebrow">认知测验 · 内容入库</p><h1>认知入库</h1><p>查看代码登记的推荐草稿，核对精确版本后入库；未登记项单独显示缺口。</p></div>
      <button type="button" disabled={busy} onClick={()=>void refresh()}><RefreshCw size={16} aria-hidden="true"/>刷新回读</button></header>
    {error&&<p className="sys-message sys-error" role="alert">{error}</p>}
    {notice&&<p className="sys-message" role="status">{notice}</p>}
    {needsRefresh&&<p className="sys-message">请先使用“刷新回读”核对当前状态，再选择候选并重新预览。</p>}
    <div className="sys-workspace"><div className="sys-content">
      <section className="sys-panel" aria-label="已登记认知候选">
        <div className="sys-section-heading"><div><h2><Brain size={18} aria-hidden="true"/>已登记候选</h2><p>每次只处理一个精确版本；其他任务的待审缺口不影响本列表。</p></div><span className="sys-badge">{catalog?`${catalog.registered.length} 项`:'正在读取'}</span></div>
        {!catalog&&<p role="status">{busy?'正在读取候选与安装状态…':'候选尚未读取，请刷新重试。'}</p>}
        {catalog&&!catalog.registered.length&&<p className="sys-empty">当前没有代码登记的推荐草稿。</p>}
        <div className="sys-records">{catalog?.registered.map(row=><article className="sys-record" key={key(row)}><details>
          <summary><span className="sys-record-heading"><strong>{row.name}</strong><small>{row.testType} · 配置 {row.configVersion}</small></span><span className="sys-record-state"><span className="sys-badge" data-status={row.plan.status}>{planLabel(row.plan)}</span><ChevronDown size={17} aria-hidden="true"/></span></summary>
          <div className="sys-record-body"><dl className="sys-facts"><div><dt>来源</dt><dd>当前代码登记</dd></div><div><dt>报告版本</dt><dd>{row.reportVersion??'未声明'}</dd></div>
            <div><dt>参数配置与预计时长</dt><dd>{row.profiles.map(profile=>`${profileLabel[profile.key]??profile.key}：${profile.estimatedMinutes[0]}–${profile.estimatedMinutes[1]} 分钟`).join('；')||'未声明'}</dd></div>
            <div><dt>运行与计分版本</dt><dd>{row.engineVersion} / {row.scoringVersion}</dd></div></dl>
            {row.plan.reasons.length>0&&<ul>{row.plan.reasons.map((reason,index)=><li key={index}>{reason}</li>)}</ul>}
            <button type="button" disabled={busy||needsRefresh||selectedKey===key(row)} onClick={()=>{
              if(locked.current||needsRefresh)return
              setSelectedKey(key(row));setPreview(null);setError('');setNotice('')
            }}>{selectedKey===key(row)?`已选择 ${row.name}`:`选择 ${row.name}`}</button>
            <details className="sys-technical"><summary>反馈指标与配置标识</summary><p>{row.reportMetrics.join('、')||'未声明反馈指标'}</p>{row.plan.configId&&<p>配置标识：{row.plan.configId}</p>}</details>
          </div></details></article>)}</div>
      </section>
      <section className="sys-panel" aria-label="待审核认知候选"><h2>待审核候选</h2><p className="sys-muted">保留已开发内容与具体缺口，当前不能从这里安装。</p>
        {catalog&&!catalog.pending.length&&<p>当前没有待审核候选。</p>}
        <div className="sys-records">{catalog?.pending.map(row=><article className="sys-record" key={row.testType}><details><summary><span className="sys-record-heading"><strong>{row.testType}</strong><small>PR{row.sourcePR} · 待审核</small></span><ChevronDown size={17} aria-hidden="true"/></summary><div className="sys-record-body"><ul>{row.reasons.map((reason,index)=><li key={index}>{reason}</li>)}</ul></div></details></article>)}</div>
      </section>
    </div><aside className="sys-rail" aria-label="认知安装操作">
      <section className="sys-panel"><h2>本次选择</h2>{selected?<><p>{selected.name} · 配置 {selected.configVersion}</p><p>{planLabel(selected.plan)}</p>
        {preview&&<div role="status"><p>预览结果：{planLabel(preview)}</p>{preview.reasons.length>0&&<ul>{preview.reasons.map((reason,index)=><li key={index}>{reason}</li>)}</ul>}</div>}
        <button type="button" disabled={busy||needsRefresh} onClick={()=>void inspect()}>预览所选配置</button>
        {preview?.action==='CREATE_DRAFT'&&!needsRefresh&&<button type="button" className="sys-primary" disabled={busy} onClick={()=>void install()}>安装为草稿</button>}
      </>:<p className="sys-muted">在已登记候选中选择一项，再核对安装状态。</p>}</section>
      <details className="sys-panel sys-verification"><summary><ShieldCheck size={18} aria-hidden="true"/>安装操作验证</summary><p>安装前使用现有管理员双因素验证，有效期五分钟；验证不会自动提交安装。</p>
        <fieldset disabled={busy}><AdminStepUp onVerified={()=>{if(mounted.current)setNotice(needsRefresh?'身份验证已完成。请先刷新回读，再重新预览。':'身份验证已完成。请核对所选版本，再点击安装；尚未提交安装。')}}/></fieldset></details>
      <section className="sys-panel sys-guide"><h2>安装后的状态</h2><p>新配置只安装为 DRAFT 草稿。GRANT 表示仍须另有使用授权，本次安装不授予机构或用户权限；发布和公开可见仍需独立处理。</p><p>已存在配置保留原状态；发现版本冲突时展示缺口，不覆盖。未收到成功回执时，先刷新回读。</p></section>
    </aside></div>
  </div>
}

export default function CognitiveIntake(){
  const {user}=useAuth()
  if(user?.platformRole!=='SYSTEM_ADMIN')return <p role="alert">仅系统管理员可以管理认知入库。</p>
  return <CognitiveIntakeWorkspace key={user.id}/>
}
