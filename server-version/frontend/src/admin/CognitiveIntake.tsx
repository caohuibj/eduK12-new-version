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
  const [query,setQuery]=useState(''),[page,setPage]=useState(1)
  const pageSize=12
  const selectionPanel=useRef<HTMLElement>(null)
  const [catalog,setCatalog]=useState<Catalog|null>(null),[selectedKey,setSelectedKey]=useState<string|null>(null)
  useEffect(()=>{if(selectedKey){selectionPanel.current?.focus({preventScroll:true});selectionPanel.current?.scrollIntoView?.({block:'start',behavior:'smooth'})}},[selectedKey])
  const filtered=catalog?.registered.filter(row=>[row.name,row.testType,row.configVersion,row.engineVersion,row.scoringVersion].join(' ').toLowerCase().includes(query.trim().toLowerCase()))
  const pages=Math.max(1,Math.ceil((filtered?.length??0)/pageSize))
  const visible=filtered?.slice((page-1)*pageSize,page*pageSize)
  useEffect(()=>{setPage(1)},[query])
  useEffect(()=>{setPage(current=>Math.min(current,pages))},[pages])
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
      setCatalog(response.data);setPage(1);setSelectedKey(null);setNeedsRefresh(false)
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
  const [profileKey, setProfileKey] = useState('')
  const [profilePreview, setProfilePreview] = useState<{ configId: string; profile: string; title: string; artifactHash: string; approvedProducts?: Array<'TRAINING' | 'SURVEY' | 'SCHOOL' | 'TEACHER'>; hasPriorPolicy?: boolean; report?: { title?: string } } | null>(null)
  const [allowedProducts, setAllowedProducts] = useState<Array<'TRAINING' | 'SURVEY' | 'SCHOOL' | 'TEACHER'>>(['SURVEY', 'TRAINING'])
  const [approvalReason, setApprovalReason] = useState('系统管理员确认参数与报告配置')
  const [profileStatus, setProfileStatus] = useState('')

  const publishConfig = async () => {
    const configId = selected?.plan.configId
    if (!selected || !configId || needsRefresh || selected.plan.status !== 'DRAFT') return
    const request = begin(); if (request === null) return
    const choice = identity(selected)
    setError(''); setNotice('')
    try {
      const response = await api.post<{ id: string; status: 'PUBLISHED' }>(`/cognitive/configs/${encodeURIComponent(configId)}/publish`, {})
      if (!current(request)) return
      if (response.code !== 0 || !response.data) throw new Error(response.message || '发布未完成')
      updatePlan(choice, { ...selected.plan, ...choice, action: 'ALREADY_PRESENT', status: 'PUBLISHED', configId, reasons: [] })
      setProfileKey(selected.profiles[0]?.key ?? 'standard')
      setProfilePreview(null); setProfileStatus('')
      setNotice('配置已发布（PUBLISHED）。接下来可在下方为各个运行参数配置（Profile）启用准入产品。')
    } catch (caught) {
      if (current(request)) setError(requestError(caught))
    } finally { finish(request) }
  }

  const retireConfig = async () => {
    const configId = selected?.plan.configId
    if (!selected || !configId || needsRefresh || selected.plan.status !== 'PUBLISHED') return
    if (!window.confirm(`确认停用/退役 ${selected.name}（${selected.configVersion}）？停止新创建任务，已开始的作答与报告保持可读。`)) return
    const request = begin(); if (request === null) return
    const choice = identity(selected)
    setError(''); setNotice('')
    try {
      const response = await api.post<{ id: string; status: 'RETIRED' }>(`/cognitive/configs/${encodeURIComponent(configId)}/retire`, {})
      if (!current(request)) return
      if (response.code !== 0 || !response.data) throw new Error(response.message || '退役未完成')
      updatePlan(choice, { ...selected.plan, ...choice, action: 'ALREADY_PRESENT', status: 'RETIRED', configId, reasons: [] })
      setProfilePreview(null); setProfileStatus('')
      setNotice('配置已退役（RETIRED），历史记录保持不可变。')
    } catch (caught) {
      if (current(request)) setError(requestError(caught))
    } finally { finish(request) }
  }

  const loadProfilePreview = async (targetProfile = profileKey || selected?.profiles[0]?.key || 'standard') => {
    const configId = selected?.plan.configId
    if (!selected || !configId || selected.plan.status !== 'PUBLISHED') return
    const request = begin(); if (request === null) return
    setError(''); setProfileStatus('')
    try {
      const response = await api.get<{ configId: string; profile: string; title: string; artifactHash: string; approvedProducts?: Array<'TRAINING' | 'SURVEY' | 'SCHOOL' | 'TEACHER'>; hasPriorPolicy?: boolean; report?: { title?: string } }>(
        `/cognitive/profile-configurations/system/${encodeURIComponent(configId)}/${encodeURIComponent(targetProfile)}`,
      )
      if (!current(request)) return
      if (response.code !== 0 || !response.data) throw new Error(response.message || '读取 Profile 失败')
      const existing = response.data.approvedProducts ?? []
      setProfileKey(targetProfile)
      setProfilePreview(response.data)
      setAllowedProducts(existing.length > 0 ? existing : response.data.hasPriorPolicy ? [] : ['SURVEY', 'TRAINING'])
    } catch (caught) {
      if (current(request)) setError(requestError(caught))
    } finally { finish(request) }
  }

  const approveProfile = async () => {
    if (!profilePreview || allowedProducts.length === 0 || !approvalReason.trim()) return
    const request = begin(); if (request === null) return
    setError(''); setProfileStatus('')
    try {
      const response = await api.post<{ artifactHash: string; allowedProducts: Array<'TRAINING' | 'SURVEY' | 'SCHOOL' | 'TEACHER'> }>(
        `/cognitive/profile-configurations/system/${encodeURIComponent(profilePreview.configId)}/${encodeURIComponent(profilePreview.profile)}/approve`,
        {
          requestId: crypto.randomUUID(),
          expectedArtifactHash: profilePreview.artifactHash,
          allowedProducts,
          reason: approvalReason.trim(),
        },
      )
      if (!current(request)) return
      if (response.code !== 0 || !response.data) throw new Error(response.message || '批准 Profile 失败')
      setProfilePreview(prev => prev ? { ...prev, approvedProducts: response.data!.allowedProducts } : prev)
      setProfileStatus(`已批准 ${profileLabel[profilePreview.profile] ?? profilePreview.profile}：准入产品 ${response.data.allowedProducts.join('、')}。`)
    } catch (caught) {
      if (current(request)) setError(requestError(caught))
    } finally { finish(request) }
  }

  return <div className="system-page system-cognitive-intake" aria-busy={busy}>
    <header className="sys-heading"><div><p className="system-eyebrow">认知测验 · 内容入库与发布</p><h1>认知入库</h1><p>查看代码登记的推荐草稿，核对精确版本后入库；可直接在页面完成发布与 Profile 入口准入，无需手工脚本。</p></div>
      <button type="button" disabled={busy} onClick={()=>void refresh()}><RefreshCw size={16} aria-hidden="true"/>刷新回读</button></header>
    {error&&<p className="sys-message sys-error" role="alert">{error}</p>}
    {notice&&<p className="sys-message" role="status">{notice}</p>}
    {needsRefresh&&<p className="sys-message">请先使用“刷新回读”核对当前状态，再选择候选并重新预览。</p>}
    <div className="sys-workspace"><div className="sys-content">
      <section className="sys-panel" aria-label="已登记认知候选">
        <div className="sys-section-heading"><div><h2><Brain size={18} aria-hidden="true"/>已登记候选</h2><p>每次只处理一个精确版本；其他任务的待审缺口不影响本列表。</p></div><span className="sys-badge">{catalog?`${catalog.registered.length} 项`:'正在读取'}</span></div>
        <label className="system-field">检索认知候选<input type="search" value={query} onChange={event=>setQuery(event.target.value)} placeholder="名称、任务类型或版本"/></label>
        {catalog&&<p role="status">找到 {filtered?.length??0} 项，共 {catalog.registered.length} 项。{pages>1&&` 当前第 ${page} / ${pages} 页。`}</p>}
        {catalog&&filtered?.length===0&&query.trim()&&<p>没有符合条件的候选，请更换关键词。</p>}
        {!catalog&&<p role="status">{busy?'正在读取候选与安装状态…':'候选尚未读取，请刷新重试。'}</p>}
        {catalog&&!catalog.registered.length&&<p className="sys-empty">当前没有代码登记的推荐草稿。</p>}
        <div className="sys-records">{visible?.map(row=><article className="sys-record" key={key(row)}><details>
          <summary><span className="sys-record-heading"><strong>{row.name}</strong><small>{row.testType} · 配置 {row.configVersion}</small></span><span className="sys-record-state"><span className="sys-badge" data-status={row.plan.status}>{planLabel(row.plan)}</span><ChevronDown size={17} aria-hidden="true"/></span></summary>
          <div className="sys-record-body"><dl className="sys-facts"><div><dt>来源</dt><dd>当前代码登记</dd></div><div><dt>报告版本</dt><dd>{row.reportVersion??'未声明'}</dd></div>
            <div><dt>参数配置与预计时长</dt><dd>{row.profiles.map(profile=>`${profileLabel[profile.key]??profile.key}：${profile.estimatedMinutes[0]}–${profile.estimatedMinutes[1]} 分钟`).join('；')||'未声明'}</dd></div>
            <div><dt>运行与计分版本</dt><dd>{row.engineVersion} / {row.scoringVersion}</dd></div></dl>
            {row.plan.reasons.length>0&&<ul>{row.plan.reasons.map((reason,index)=><li key={index}>{reason}</li>)}</ul>}
            <button type="button" disabled={busy||needsRefresh||selectedKey===key(row)} onClick={()=>{
              if(locked.current||needsRefresh)return
              setSelectedKey(key(row));setPreview(null);setError('');setNotice('');setProfileKey(row.profiles[0]?.key??'standard');setProfilePreview(null);setProfileStatus('')
            }}>{selectedKey===key(row)?`已选择 ${row.name}`:`选择 ${row.name}`}</button>
            <details className="sys-technical"><summary>反馈指标与配置标识</summary><p>{row.reportMetrics.join('、')||'未声明反馈指标'}</p>{row.plan.configId&&<p>配置标识：{row.plan.configId}</p>}</details>
          </div></details></article>)}</div>
        {pages>1&&<nav className="system-actions" aria-label="认知候选分页"><button type="button" disabled={busy||page===1} onClick={()=>setPage(value=>value-1)}>上一页</button><span>第 {page} / {pages} 页</span><button type="button" disabled={busy||page===pages} onClick={()=>setPage(value=>value+1)}>下一页</button></nav>}
      </section>
      <section className="sys-panel" aria-label="待审核认知候选"><h2>待审核候选</h2><p className="sys-muted">保留已开发内容与具体缺口，当前不能从这里安装。</p>
        {catalog&&!catalog.pending.length&&<p>当前没有待审核候选。</p>}
        <div className="sys-records">{catalog?.pending.map(row=><article className="sys-record" key={row.testType}><details><summary><span className="sys-record-heading"><strong>{row.testType}</strong><small>PR{row.sourcePR} · 待审核</small></span><ChevronDown size={17} aria-hidden="true"/></summary><div className="sys-record-body"><ul>{row.reasons.map((reason,index)=><li key={index}>{reason}</li>)}</ul></div></details></article>)}</div>
      </section>
    </div><aside className="sys-rail" aria-label="认知安装操作">
      <section ref={selectionPanel} tabIndex={-1} aria-label="本次认知配置选择" className="sys-panel"><h2>本次选择</h2>{selected?<><p>{selected.name} · 配置 {selected.configVersion}</p><p>{planLabel(selected.plan)}</p>
        {preview&&<div role="status"><p>预览结果：{planLabel(preview)}</p>{preview.reasons.length>0&&<ul>{preview.reasons.map((reason,index)=><li key={index}>{reason}</li>)}</ul>}</div>}
        <button type="button" disabled={busy||needsRefresh} onClick={()=>void inspect()}>预览所选配置</button>
        {preview?.action==='CREATE_DRAFT'&&!needsRefresh&&<button type="button" className="sys-primary" disabled={busy} onClick={()=>void install()}>安装为草稿</button>}
        {selected.plan.configId&&selected.plan.status==='DRAFT'&&!needsRefresh&&<button type="button" className="sys-primary" disabled={busy} onClick={()=>void publishConfig()}>发布此配置</button>}
        {selected.plan.configId&&selected.plan.status==='PUBLISHED'&&!needsRefresh&&<>
          <div className="sys-technical" aria-label="Profile 准入审批">
            <p>已发布配置可按 Profile 启用产品准入（需下方管理员双因素验证）：</p>
            <label>选择 Profile<select value={profileKey||selected.profiles[0]?.key||'standard'} disabled={busy} onChange={e=>{setProfileKey(e.target.value);setProfilePreview(null);setProfileStatus('')}}>
              {(selected.profiles.length?selected.profiles:[{key:'standard',estimatedMinutes:[1,1]}]).map(p=><option key={p.key} value={p.key}>{profileLabel[p.key]??p.key}</option>)}
            </select></label>
            <button type="button" disabled={busy} onClick={()=>void loadProfilePreview(profileKey||selected.profiles[0]?.key||'standard')}>预览 Profile 摘要</button>
            {profilePreview&&<div>
              <p>摘要：{profilePreview.artifactHash.slice(0,12)}…（{profilePreview.report?.title??profilePreview.title}）</p>
              <p>当前已启用入口：{(profilePreview.approvedProducts?.length?profilePreview.approvedProducts.join('、'):'暂无（按下方勾选启用）')}</p>
              {profilePreview.hasPriorPolicy && !profilePreview.approvedProducts?.length && <p className="sys-muted">已有入口策略目前均未启用，请明确选择需要重新启用的入口。</p>}
              <fieldset disabled={busy}><legend>允许使用的产品入口</legend>
                {(['SURVEY','TRAINING','SCHOOL','TEACHER'] as const).map(prod=><label key={prod}>
                  <input type="checkbox" checked={allowedProducts.includes(prod)} onChange={e=>setAllowedProducts(prev=>e.target.checked?[...prev,prod]:prev.filter(x=>x!==prod))}/> {prod}
                </label>)}
              </fieldset>
              {(() => {
                const currentApproved = profilePreview.approvedProducts ?? []
                const added = allowedProducts.filter(p => !currentApproved.includes(p))
                const removed = currentApproved.filter(p => !allowedProducts.includes(p))
                return (added.length > 0 || removed.length > 0) ? (
                  <p className="sys-muted">
                    {added.length > 0 ? `将新增：${added.join('、')}` : ''}
                    {added.length > 0 && removed.length > 0 ? '；' : ''}
                    {removed.length > 0 ? `将移除：${removed.join('、')}` : ''}
                  </p>
                ) : null
              })()}
              <label>批准说明<input type="text" value={approvalReason} maxLength={200} disabled={busy} onChange={e=>setApprovalReason(e.target.value)}/></label>
              <button type="button" className="sys-primary" disabled={busy||allowedProducts.length===0||!approvalReason.trim()} onClick={()=>void approveProfile()}>批准并启用此 Profile</button>
            </div>}
            {profileStatus&&<p role="status">{profileStatus}</p>}
          </div>
          <button type="button" disabled={busy} onClick={()=>void retireConfig()}>退役此配置</button>
        </>}
      </>:<p className="sys-muted">在已登记候选中选择一项，再核对安装状态。</p>}</section>
      <details className="sys-panel sys-verification"><summary><ShieldCheck size={18} aria-hidden="true"/>安装操作验证</summary><p>安装前或批准 Profile 入口准入前使用现有管理员双因素验证，有效期五分钟；验证不会自动提交操作。</p>
        <fieldset disabled={busy}><AdminStepUp onVerified={()=>{if(mounted.current)setNotice(needsRefresh?'身份验证已完成。请先刷新回读，再重新预览。':'身份验证已完成。请核对所选版本，再执行安装或审批。')}}/></fieldset></details>
      <section className="sys-panel sys-guide"><h2>安装与发布状态</h2><p>新配置先安装为 DRAFT 草稿（不授予产品权限）；点击“发布此配置”后可按 Profile 批准启用的产品入口；必要时可“退役此配置”，不影响历史作答与报告。</p><p>已存在配置保留原状态；未收到成功回执时，先刷新回读。</p></section>
    </aside></div>
  </div>
}

export default function CognitiveIntake(){
  const {user}=useAuth()
  if(user?.platformRole!=='SYSTEM_ADMIN')return <p role="alert">仅系统管理员可以管理认知入库。</p>
  return <CognitiveIntakeWorkspace key={user.id}/>
}
